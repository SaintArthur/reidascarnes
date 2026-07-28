#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Roda DENTRO da instância EC2 (depois que deploy/setup-aws.sh já rodou na sua
# máquina e anexou a IAM Role). Busca o segredo "csbarber/app-env" no Secrets
# Manager (usando a credencial da própria instância, via IAM Role — não precisa
# de access key aqui), grava em /etc/csbarber/env, e cria o banco de dados no
# Aurora se ele ainda não existir.
#
# Uso:
#   sudo ./deploy/fetch-env.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SECRET_NAME="csbarber/app-env"
ENV_DIR="/etc/csbarber"
ENV_FILE="$ENV_DIR/env"

command -v aws >/dev/null || { echo "Erro: aws-cli não encontrado nesta instância. Instale com 'sudo yum install -y aws-cli' (Amazon Linux) ou 'sudo apt install -y awscli' (Ubuntu)."; exit 1; }

REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).region)" 2>/dev/null || echo "${AWS_REGION:-}")
if [ -z "$REGION" ]; then
  echo "Erro: não consegui detectar a região via metadata da instância. Defina AWS_REGION=us-east-1 e rode de novo." >&2
  exit 1
fi

echo "→ Buscando segredo '$SECRET_NAME' (região $REGION)..."
SECRET_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_NAME" --query SecretString --output text)

echo "→ Gravando $ENV_FILE..."
sudo mkdir -p "$ENV_DIR"
echo "$SECRET_JSON" | node -e "
const env = JSON.parse(require('fs').readFileSync(0));
console.log(Object.entries(env).map(([k,v]) => \`\${k}=\${v}\`).join('\n'));
" | sudo tee "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
echo "  OK."

DB_HOST=$(echo "$SECRET_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DB_HOST)")
DB_PORT=$(echo "$SECRET_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DB_PORT)")
DB_USER=$(echo "$SECRET_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DB_USER)")
DB_NAME=$(echo "$SECRET_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DB_NAME)")

command -v psql >/dev/null || { echo "Aviso: psql não encontrado — pulei a criação automática do banco. Instale com 'sudo dnf install -y postgresql16' e rode este script de novo."; exit 0; }

# Esse Aurora exige autenticação IAM (senha fixa não funciona nem pro usuário mestre) — o
# token abaixo expira em 15 minutos, mas essa checagem/criação leva segundos, então não
# precisa renovar.
echo "→ Gerando token IAM pra conectar no Aurora..."
export PGPASSWORD
PGPASSWORD=$(aws rds generate-db-auth-token --hostname "$DB_HOST" --port "$DB_PORT" --username "$DB_USER" --region "$REGION")
CONN="host=$DB_HOST port=$DB_PORT dbname=postgres user=$DB_USER sslmode=require"

echo "→ Verificando se o banco '$DB_NAME' já existe no Aurora..."
if psql "$CONN" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "  Já existe."
else
  echo "  Criando..."
  psql "$CONN" -c "CREATE DATABASE \"$DB_NAME\""
  echo "  Criado."
fi

echo
echo "Pronto. $ENV_FILE está pronto pra ser usado pelo systemd (EnvironmentFile=$ENV_FILE)."
