#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Configura HTTPS pro CS Barber num domínio próprio: pede um certificado grátis
# no ACM (validado por DNS), e quando ele estiver emitido, cria o listener
# HTTPS:443 no Load Balancer (e faz o HTTP:80 redirecionar pra HTTPS).
#
# Como o domínio não está na Route 53 da AWS, os registros de DNS (validação do
# certificado + apontamento final pro Load Balancer) precisam ser adicionados
# manualmente no painel do seu domínio (Registro.br ou onde ele estiver).
#
# Rode NA SUA MÁQUINA, já logado no aws-cli. É seguro rodar várias vezes —
# ele identifica em que fase está e só avança quando o passo anterior estiver
# pronto.
#
# Uso:
#   DOMAIN=csbarber.conectasolucoes.ia.br ./deploy/setup-https.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ -z "${DOMAIN:-}" ]; then
  echo "Erro: defina DOMAIN. Exemplo:" >&2
  echo "  DOMAIN=csbarber.conectasolucoes.ia.br ./deploy/setup-https.sh" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "Erro: aws-cli não encontrado."; exit 1; }
REGION=${AWS_REGION:-$(aws configure get region)}
if [ -z "$REGION" ]; then
  echo "Erro: nenhuma região configurada. Defina AWS_REGION=sa-east-1." >&2
  exit 1
fi

# ─── 1. Certificado no ACM (pedir se ainda não existir) ──────────────────────
echo "→ Procurando certificado ACM pra $DOMAIN..."
CERT_ARN=$(aws acm list-certificates --region "$REGION" --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" --output text)

if [ -z "$CERT_ARN" ] || [ "$CERT_ARN" = "None" ]; then
  echo "  Nenhum encontrado — pedindo um novo certificado..."
  CERT_ARN=$(aws acm request-certificate --region "$REGION" --domain-name "$DOMAIN" \
    --validation-method DNS --query CertificateArn --output text)
  echo "  Solicitado: $CERT_ARN"
  echo "  Aguardando a AWS gerar o registro de validação (alguns segundos)..."
  sleep 8
fi

CERT_STATUS=$(aws acm describe-certificate --region "$REGION" --certificate-arn "$CERT_ARN" --query 'Certificate.Status' --output text)
echo "  Status do certificado: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
  VALIDATION=$(aws acm describe-certificate --region "$REGION" --certificate-arn "$CERT_ARN" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord')
  V_NAME=$(echo "$VALIDATION" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).Name)")
  V_VALUE=$(echo "$VALIDATION" | node -e "console.log(JSON.parse(require('fs').readFileSync(0)).Value)")
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo "Falta validar o domínio. No painel de DNS onde o domínio está registrado"
  echo "(Registro.br ou equivalente), adicione este registro CNAME:"
  echo
  echo "  Nome/Host:  $V_NAME"
  echo "  Valor:      $V_VALUE"
  echo
  echo "Isso costuma levar de alguns minutos a algumas horas pra propagar e a AWS"
  echo "confirmar. Rode este script de novo depois de adicionar o registro:"
  echo "  DOMAIN=$DOMAIN ./deploy/setup-https.sh"
  echo "════════════════════════════════════════════════════════════════"
  exit 0
fi

echo "  Certificado emitido!"

# ─── 2. Achar o ALB e o target group já criados (deploy/setup-alb.sh) ────────
echo
echo "→ Localizando o Load Balancer..."
ALB_ARN=$(aws elbv2 describe-load-balancers --region "$REGION" --names csbarber-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text)
ALB_DNS=$(aws elbv2 describe-load-balancers --region "$REGION" --names csbarber-alb --query 'LoadBalancers[0].DNSName' --output text)
TG_ARN=$(aws elbv2 describe-target-groups --region "$REGION" --names csbarber-tg --query 'TargetGroups[0].TargetGroupArn' --output text)
ALB_SG_ID=$(aws elbv2 describe-load-balancers --region "$REGION" --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].SecurityGroups[0]' --output text)

# Libera a porta 443 no security group do ALB, se ainda não estiver liberada
HAS_443=$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$ALB_SG_ID" \
  --query "SecurityGroups[0].IpPermissions[?ToPort==\`443\`] | length(@)" --output text)
if [ "$HAS_443" = "0" ]; then
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$ALB_SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description='HTTPS publico'}]" >/dev/null
  echo "  Porta 443 liberada no security group do ALB."
fi

# ─── 3. Listener HTTPS:443 usando o certificado ──────────────────────────────
echo
echo "→ Configurando listener HTTPS:443..."
HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners --region "$REGION" --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`443\`].ListenerArn | [0]" --output text)
if [ -z "$HTTPS_LISTENER_ARN" ] || [ "$HTTPS_LISTENER_ARN" = "None" ]; then
  aws elbv2 create-listener --region "$REGION" --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS --port 443 --certificates "CertificateArn=$CERT_ARN" \
    --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null
  echo "  Criado."
else
  echo "  Já existe — reaproveitando."
fi

# ─── 4. HTTP:80 passa a redirecionar pra HTTPS (em vez de servir direto) ─────
echo
echo "→ Fazendo HTTP:80 redirecionar pra HTTPS..."
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners --region "$REGION" --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" --output text)
aws elbv2 modify-listener --region "$REGION" --listener-arn "$HTTP_LISTENER_ARN" \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' >/dev/null
echo "  Feito."

echo
echo "════════════════════════════════════════════════════════════════"
echo "HTTPS configurado. Falta só apontar o domínio pro Load Balancer."
echo "No painel de DNS do domínio, adicione um registro CNAME:"
echo
echo "  Nome/Host:  csbarber"
echo "  Valor:      $ALB_DNS"
echo
echo "Depois de propagar (alguns minutos), acesse:"
echo "  https://$DOMAIN"
echo "════════════════════════════════════════════════════════════════"
