#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Configura a infraestrutura AWS do CS Barber: abre SSH pro seu IP atual, cria o
# bucket S3 de fotos, junta tudo (JWT_SECRET, chaves VAPID, dados de conexão do
# Aurora, bucket) num único segredo no Secrets Manager, e cria/anexa uma IAM Role
# na instância EC2 com permissão só pra ler esse segredo, mexer nesse bucket, e
# se conectar no Aurora via autenticação IAM (sem senha — esse tipo de cluster
# não aceita senha fixa nem pro usuário mestre).
#
# Rode este script NA SUA MÁQUINA (não na EC2), já logado no aws-cli
# (`aws configure` ou `aws sso login`) com um usuário/role que tenha permissão
# de EC2, IAM, S3, Secrets Manager e RDS. Ele só CRIA/AJUSTA recursos — não apaga nada.
#
# Uso:
#   EC2_PUBLIC_IP=15.229.255.105 ./deploy/setup-aws.sh
#
# Variáveis de ambiente aceitas (só EC2_PUBLIC_IP é obrigatória):
#   EC2_PUBLIC_IP    IP público da instância (obrigatório)
#   AWS_REGION       padrão: região configurada no seu aws-cli
#   S3_BUCKET_NAME   padrão: csbarber-photos-<account-id>
#   DB_NAME          padrão: barberpro
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ -z "${EC2_PUBLIC_IP:-}" ]; then
  echo "Erro: defina EC2_PUBLIC_IP. Exemplo:" >&2
  echo "  EC2_PUBLIC_IP=15.229.255.105 ./deploy/setup-aws.sh" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "Erro: aws-cli não encontrado. Instale com 'brew install awscli'."; exit 1; }
command -v node >/dev/null || { echo "Erro: node não encontrado (precisa pra gerar as chaves VAPID)."; exit 1; }

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text) || {
  echo "Erro: aws-cli não está autenticado. Rode 'aws configure' (ou 'aws sso login') primeiro." >&2
  exit 1
}
REGION=${AWS_REGION:-$(aws configure get region)}
if [ -z "$REGION" ]; then
  echo "Erro: nenhuma região configurada. Defina AWS_REGION=us-east-1 (ou a região da sua conta)." >&2
  exit 1
fi
S3_BUCKET_NAME=${S3_BUCKET_NAME:-"csbarber-photos-${ACCOUNT_ID}"}
DB_NAME=${DB_NAME:-barberpro}
ROLE_NAME="csbarber-ec2-role"
PROFILE_NAME="csbarber-ec2-profile"
SECRET_NAME="csbarber/app-env"

echo "Conta AWS: $ACCOUNT_ID | Região: $REGION"
echo

# ─── 1. Descobrir a instância EC2 pelo IP público ────────────────────────────
echo "→ Procurando instância com IP público $EC2_PUBLIC_IP..."
INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=ip-address,Values=$EC2_PUBLIC_IP" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Erro: nenhuma instância encontrada com esse IP nessa região ($REGION)." >&2
  exit 1
fi
echo "  Instância: $INSTANCE_ID"

# ─── 2. Liberar SSH (porta 22) só pro seu IP atual, no security group launch-wizard ──
echo
echo "→ Verificando regra de SSH..."
MY_IP=$(curl -s https://checkip.amazonaws.com)/32
SG_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].SecurityGroups[?starts_with(GroupName, 'launch-wizard')].GroupId | [0]" --output text)
if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  echo "  Aviso: não achei um security group 'launch-wizard-*' — pegando o primeiro anexado à instância."
  SG_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" --output text)
fi
HAS_RULE=$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$SG_ID" \
  --query "SecurityGroups[0].IpPermissions[?ToPort==\`22\`] | length(@)" --output text)
if [ "$HAS_RULE" = "0" ]; then
  echo "  Abrindo porta 22 em $SG_ID só pro seu IP atual ($MY_IP)..."
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP,Description='SSH - setup-aws.sh'}]"
else
  echo "  Já existe uma regra de porta 22 em $SG_ID — não mexi nela. Confirme manualmente se seu IP atual ($MY_IP) está liberado."
fi

# ─── 3. Bucket S3 de fotos (avatars/ e portfolio/ públicos para leitura) ─────
echo
echo "→ Bucket S3: $S3_BUCKET_NAME"
if aws s3api head-bucket --bucket "$S3_BUCKET_NAME" 2>/dev/null; then
  echo "  Já existe — reaproveitando."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$S3_BUCKET_NAME" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$S3_BUCKET_NAME" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  echo "  Criado."
fi
# Permite bucket policy pública (mas sem liberar ACLs por objeto — ficam desabilitadas,
# que é o padrão recomendado hoje; a leitura pública vem só da policy abaixo).
aws s3api put-public-access-block --bucket "$S3_BUCKET_NAME" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
cat > /tmp/csbarber-bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadPhotos",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": ["arn:aws:s3:::${S3_BUCKET_NAME}/avatars/*", "arn:aws:s3:::${S3_BUCKET_NAME}/portfolio/*"]
  }]
}
EOF
aws s3api put-bucket-policy --bucket "$S3_BUCKET_NAME" --policy file:///tmp/csbarber-bucket-policy.json
rm -f /tmp/csbarber-bucket-policy.json
echo "  Bucket policy aplicada (leitura pública só em avatars/* e portfolio/*)."

# ─── 4. Descobrir o cluster Aurora (autenticação IAM — sem senha) ────────────
echo
echo "→ Procurando cluster Aurora PostgreSQL..."
CLUSTER_ID=$(aws rds describe-db-clusters --region "$REGION" \
  --query "DBClusters[?Engine=='aurora-postgresql'].DBClusterIdentifier | [0]" --output text)
if [ -z "$CLUSTER_ID" ] || [ "$CLUSTER_ID" = "None" ]; then
  echo "Erro: nenhum cluster Aurora PostgreSQL encontrado na região $REGION." >&2
  exit 1
fi
CLUSTER_INFO=$(aws rds describe-db-clusters --region "$REGION" --db-cluster-identifier "$CLUSTER_ID")
ENDPOINT=$(echo "$CLUSTER_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DBClusters[0].Endpoint)")
DB_USER=$(echo "$CLUSTER_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DBClusters[0].MasterUsername)")
DB_CLUSTER_RESOURCE_ID=$(echo "$CLUSTER_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DBClusters[0].DbClusterResourceId)")
IAM_AUTH_ENABLED=$(echo "$CLUSTER_INFO" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).DBClusters[0].IAMDatabaseAuthenticationEnabled)")
echo "  Cluster: $CLUSTER_ID | Endpoint: $ENDPOINT | Usuário mestre: $DB_USER"
if [ "$IAM_AUTH_ENABLED" != "true" ]; then
  echo "Erro: esse cluster não tem 'IAM database authentication' habilitada. Habilite em" >&2
  echo "  RDS > Databases > $CLUSTER_ID > Modify > Database authentication > Password and IAM database authentication," >&2
  echo "  aplique imediatamente, e rode este script de novo." >&2
  exit 1
fi

# ─── 5. Gerar segredos da aplicação (JWT_SECRET, chaves VAPID) ───────────────
echo
echo "→ Gerando JWT_SECRET e chaves VAPID..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
VAPID_JSON=$(node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))" 2>/dev/null || \
  (cd "$(dirname "$0")/.." && node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"))
VAPID_PUBLIC_KEY=$(echo "$VAPID_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).publicKey)")
VAPID_PRIVATE_KEY=$(echo "$VAPID_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).privateKey)")

# ─── 6. Guardar tudo num único segredo no Secrets Manager ────────────────────
echo
echo "→ Salvando segredo '$SECRET_NAME' no Secrets Manager..."
SECRET_PAYLOAD=$(
  CB_DB_HOST="$ENDPOINT" CB_DB_USER="$DB_USER" CB_DB_NAME="$DB_NAME" CB_JWT_SECRET="$JWT_SECRET" \
  CB_VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" CB_VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" \
  CB_S3_BUCKET_NAME="$S3_BUCKET_NAME" CB_AWS_REGION="$REGION" \
  node -e "
console.log(JSON.stringify({
  DB_HOST: process.env.CB_DB_HOST,
  DB_PORT: '5432',
  DB_USER: process.env.CB_DB_USER,
  DB_NAME: process.env.CB_DB_NAME,
  JWT_SECRET: process.env.CB_JWT_SECRET,
  VAPID_PUBLIC_KEY: process.env.CB_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.CB_VAPID_PRIVATE_KEY,
  S3_BUCKET_NAME: process.env.CB_S3_BUCKET_NAME,
  AWS_REGION: process.env.CB_AWS_REGION,
  NODE_ENV: 'production',
  PORT: '5000',
}))")

if aws secretsmanager describe-secret --region "$REGION" --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET_NAME" --secret-string "$SECRET_PAYLOAD" >/dev/null
  echo "  Segredo atualizado."
else
  aws secretsmanager create-secret --region "$REGION" --name "$SECRET_NAME" --secret-string "$SECRET_PAYLOAD" >/dev/null
  echo "  Segredo criado."
fi
SECRET_ARN=$(aws secretsmanager describe-secret --region "$REGION" --secret-id "$SECRET_NAME" --query ARN --output text)

# ─── 7. IAM Role + instance profile (SSM + ler o segredo + acessar o bucket) ─
echo
echo "→ Configurando IAM Role '$ROLE_NAME'..."
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole" }]
  }' >/dev/null
  echo "  Role criada."
else
  echo "  Role já existe — reaproveitando."
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

cat > /tmp/csbarber-inline-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "secretsmanager:GetSecretValue", "Resource": "${SECRET_ARN}" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::${S3_BUCKET_NAME}/*" },
    { "Effect": "Allow", "Action": "rds-db:connect", "Resource": "arn:aws:rds-db:${REGION}:${ACCOUNT_ID}:dbuser:${DB_CLUSTER_RESOURCE_ID}/${DB_USER}" }
  ]
}
EOF
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "csbarber-app-access" \
  --policy-document file:///tmp/csbarber-inline-policy.json
rm -f /tmp/csbarber-inline-policy.json
echo "  Política de acesso (segredo + bucket + conexão IAM no Aurora) aplicada."

if ! aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE_NAME" --role-name "$ROLE_NAME"
  echo "  Instance profile criado."
  echo "  Aguardando a IAM propagar (10s)..."
  sleep 10
else
  echo "  Instance profile já existe — reaproveitando."
fi

echo
echo "→ Anexando o instance profile na instância $INSTANCE_ID..."
EXISTING_ASSOC=$(aws ec2 describe-iam-instance-profile-associations --region "$REGION" \
  --filters "Name=instance-id,Values=$INSTANCE_ID" --query "IamInstanceProfileAssociations[?State=='associated'].AssociationId | [0]" --output text)
if [ -n "$EXISTING_ASSOC" ] && [ "$EXISTING_ASSOC" != "None" ]; then
  echo "  Já tem um instance profile associado (association $EXISTING_ASSOC) — não mexi. Se quiser trocar, remova a associação antiga primeiro."
else
  aws ec2 associate-iam-instance-profile --region "$REGION" --instance-id "$INSTANCE_ID" \
    --iam-instance-profile "Name=$PROFILE_NAME" >/dev/null
  echo "  Anexado."
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "Pronto. Resumo:"
echo "  Instância EC2:     $INSTANCE_ID"
echo "  Security group:    $SG_ID (porta 22 liberada pro seu IP: $MY_IP)"
echo "  Bucket S3:         $S3_BUCKET_NAME"
echo "  Cluster Aurora:    $CLUSTER_ID ($ENDPOINT)"
echo "  Segredo:           $SECRET_NAME ($SECRET_ARN)"
echo "  IAM Role:          $ROLE_NAME"
echo
echo "Próximos passos:"
echo "  1. Conectar na instância: ssh -i <sua-chave>.pem ec2-user@$EC2_PUBLIC_IP"
echo "     (ou 'aws ssm start-session --target $INSTANCE_ID' se preferir sem chave)"
echo "  2. De dentro da instância, rodar ./deploy/fetch-env.sh pra baixar o segredo"
echo "     e criar o banco '$DB_NAME' no Aurora."
echo "  3. Seguir o resto do runbook (deploy/README.md) pra clonar o repo, instalar"
echo "     dependências e subir o systemd service."
echo "════════════════════════════════════════════════════════════════"
