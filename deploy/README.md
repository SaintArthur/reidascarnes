# Deploy na AWS

Pré-requisito: `server.js` já migrado pra Postgres + S3 (feito). Esta pasta automatiza a
parte de infraestrutura que dava pra automatizar sem acesso à sua conta AWS.

## 1. Na sua máquina — `setup-aws.sh`

Configura o Security Group (libera SSH só pro seu IP), cria o bucket S3, junta todos os
segredos da aplicação (JWT_SECRET, chaves VAPID, dados de conexão do Aurora) num único
segredo no Secrets Manager, e cria/anexa uma IAM Role na instância EC2 com permissão pra
ler esse segredo, mexer nesse bucket, e se conectar no Aurora via autenticação IAM.

```bash
aws configure   # ou aws sso login, se você usa SSO
EC2_PUBLIC_IP=15.229.255.105 ./deploy/setup-aws.sh
```

O cluster Aurora precisa estar com **"IAM database authentication"** habilitado (RDS >
Databases > seu cluster > Modify > Database authentication) — esse tipo de conexão não usa
senha, nem pro usuário mestre. Se o script avisar que não está habilitado, ative ali,
aplique imediatamente, e rode o script de novo.

O script é seguro pra rodar mais de uma vez (não recria nem apaga nada que já existe).

## 2. Entrar na instância

```bash
ssh -i <sua-chave>.pem ec2-user@<IP-público>
```

Se não tiver o arquivo `.pem`, use o Session Manager (não precisa de chave nem porta 22
aberta, desde que a IAM Role — já anexada pelo passo 1 — tenha a política
`AmazonSSMManagedInstanceCore`):

```bash
aws ssm start-session --target <instance-id>
```

## 3. Dentro da instância — `fetch-env.sh`

```bash
git clone <url-do-seu-repo> csbarber
cd csbarber
node -v || (curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -; sudo yum install -y nodejs)  # Amazon Linux
npm ci --omit=dev
sudo ./deploy/fetch-env.sh   # busca o segredo do passo 1, grava /etc/csbarber/env, cria o banco
```

## 4. Subir como serviço (systemd)

```bash
sudo cp deploy/csbarber.service /etc/systemd/system/csbarber.service
sudo systemctl daemon-reload
sudo systemctl enable --now csbarber
sudo systemctl status csbarber       # confirmar que subiu
curl localhost:5000/api/health       # confirmar que responde
```

Logs: `journalctl -u csbarber -f`

## 5. ALB + WAF

- Target group do ALB → registrar esta instância, health check `/api/health`, porta 5000.
- Confirmar que o WAF já provisionado está associado ao ALB (Web ACL).
- Se tiver domínio/certificado (ACM), configurar o listener HTTPS:443 → target group.

## Atualizar o app depois (novo deploy)

```bash
cd csbarber && git pull && npm ci --omit=dev && sudo systemctl restart csbarber
```
