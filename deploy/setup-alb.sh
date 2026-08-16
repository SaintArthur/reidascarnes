#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cria o Application Load Balancer do CS Barber: target group (porta 5000, health
# check /api/health), o próprio ALB (internet-facing, HTTP:80), e libera a
# instância EC2 pra receber tráfego do ALB. Rode DEPOIS que o app já estiver
# rodando na instância (deploy/reidascarnes.service ativo).
#
# Rode NA SUA MÁQUINA (não na EC2), já logado no aws-cli.
#
# Uso:
#   EC2_PUBLIC_IP=15.229.255.105 ./deploy/setup-alb.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ -z "${EC2_PUBLIC_IP:-}" ]; then
  echo "Erro: defina EC2_PUBLIC_IP. Exemplo:" >&2
  echo "  EC2_PUBLIC_IP=15.229.255.105 ./deploy/setup-alb.sh" >&2
  exit 1
fi

command -v aws >/dev/null || { echo "Erro: aws-cli não encontrado."; exit 1; }
REGION=${AWS_REGION:-$(aws configure get region)}
if [ -z "$REGION" ]; then
  echo "Erro: nenhuma região configurada. Defina AWS_REGION=sa-east-1 (ou a região da sua conta)." >&2
  exit 1
fi

echo "→ Procurando instância com IP público $EC2_PUBLIC_IP..."
INSTANCE_ID=$(aws ec2 describe-instances --region "$REGION" \
  --filters "Name=ip-address,Values=$EC2_PUBLIC_IP" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)
if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Erro: nenhuma instância encontrada com esse IP nessa região ($REGION)." >&2
  exit 1
fi
VPC_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].VpcId" --output text)
INSTANCE_SG_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query "Reservations[0].Instances[0].SecurityGroups[?starts_with(GroupName, 'launch-wizard')].GroupId | [0]" --output text)
if [ -z "$INSTANCE_SG_ID" ] || [ "$INSTANCE_SG_ID" = "None" ]; then
  INSTANCE_SG_ID=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
    --query "Reservations[0].Instances[0].SecurityGroups[0].GroupId" --output text)
fi
echo "  Instância: $INSTANCE_ID | VPC: $VPC_ID"

# ─── 1. Achar subnets públicas (rota 0.0.0.0/0 -> Internet Gateway) em pelo menos 2 AZs ──
echo
echo "→ Procurando subnets públicas na VPC..."
ALL_SUBNETS=$(aws ec2 describe-subnets --region "$REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].{Id:SubnetId,Az:AvailabilityZone}' --output json)
PUBLIC_SUBNET_IDS=""
PUBLIC_AZS=""
while IFS=$'\t' read -r SUBNET_ID AZ; do
  [ -z "$SUBNET_ID" ] && continue
  RT_ID=$(aws ec2 describe-route-tables --region "$REGION" \
    --filters "Name=association.subnet-id,Values=$SUBNET_ID" --query 'RouteTables[0].RouteTableId' --output text)
  if [ -z "$RT_ID" ] || [ "$RT_ID" = "None" ]; then
    # sem associação explícita -> usa a tabela principal da VPC
    HAS_IGW=$(aws ec2 describe-route-tables --region "$REGION" \
      --filters "Name=vpc-id,Values=$VPC_ID" "Name=association.main,Values=true" \
      --query "RouteTables[0].Routes[?GatewayId != null && starts_with(GatewayId, 'igw-')] | length(@)" --output text)
  else
    HAS_IGW=$(aws ec2 describe-route-tables --region "$REGION" --route-table-ids "$RT_ID" \
      --query "RouteTables[0].Routes[?GatewayId != null && starts_with(GatewayId, 'igw-')] | length(@)" --output text)
  fi
  if [ "$HAS_IGW" != "0" ] && [[ "$PUBLIC_AZS" != *"$AZ"* ]]; then
    PUBLIC_SUBNET_IDS="$PUBLIC_SUBNET_IDS $SUBNET_ID"
    PUBLIC_AZS="$PUBLIC_AZS $AZ"
  fi
done <<< "$(echo "$ALL_SUBNETS" | node -e "JSON.parse(require('fs').readFileSync(0)).forEach(s => console.log(s.Id + '\t' + s.Az))")"

SUBNET_COUNT=$(echo "$PUBLIC_SUBNET_IDS" | wc -w | tr -d ' ')
if [ "$SUBNET_COUNT" -lt 2 ]; then
  echo "Erro: encontrei só $SUBNET_COUNT subnet(s) pública(s) (com rota pra Internet Gateway) em AZs diferentes." >&2
  echo "Um Application Load Balancer precisa de pelo menos 2, em zonas de disponibilidade diferentes." >&2
  echo "Subnets públicas encontradas: $PUBLIC_SUBNET_IDS" >&2
  exit 1
fi
echo "  Subnets públicas (uma por AZ): $PUBLIC_SUBNET_IDS"

# ─── 2. Security group do ALB (porta 80 aberta pra internet) ─────────────────
echo
echo "→ Security group do ALB..."
ALB_SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=reidascarnes-alb-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text)
if [ -z "$ALB_SG_ID" ] || [ "$ALB_SG_ID" = "None" ]; then
  ALB_SG_ID=$(aws ec2 create-security-group --region "$REGION" --group-name reidascarnes-alb-sg \
    --description "CS Barber - trafego publico HTTP para o ALB" --vpc-id "$VPC_ID" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$ALB_SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description='HTTP publico'}]" >/dev/null
  echo "  Criado ($ALB_SG_ID), porta 80 liberada pra internet."
else
  echo "  Já existe ($ALB_SG_ID) — reaproveitando."
fi

# Libera a instância a receber tráfego do ALB na porta 5000 (só do security group do ALB, não da internet)
HAS_RULE=$(aws ec2 describe-security-groups --region "$REGION" --group-ids "$INSTANCE_SG_ID" \
  --query "SecurityGroups[0].IpPermissions[?ToPort==\`5000\`] | length(@)" --output text)
if [ "$HAS_RULE" = "0" ]; then
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$INSTANCE_SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=5000,ToPort=5000,UserIdGroupPairs=[{GroupId=$ALB_SG_ID,Description='ALB para o app'}]" >/dev/null
  echo "  Instância liberada pra receber tráfego do ALB na porta 5000."
else
  echo "  Instância já tem regra de porta 5000 — não mexi."
fi

# ─── 3. Target group (HTTP:5000, health check /api/health) ──────────────────
echo
echo "→ Target group..."
TG_ARN=$(aws elbv2 describe-target-groups --region "$REGION" --names reidascarnes-tg --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")
if [ -z "$TG_ARN" ] || [ "$TG_ARN" = "None" ]; then
  TG_ARN=$(aws elbv2 create-target-group --region "$REGION" --name reidascarnes-tg \
    --protocol HTTP --port 5000 --vpc-id "$VPC_ID" --target-type instance \
    --health-check-path /api/health --health-check-interval-seconds 15 \
    --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  echo "  Criado."
else
  echo "  Já existe — reaproveitando."
fi
aws elbv2 register-targets --region "$REGION" --target-group-arn "$TG_ARN" --targets "Id=$INSTANCE_ID,Port=5000" >/dev/null
echo "  Instância registrada no target group."

# ─── 4. O próprio Load Balancer ───────────────────────────────────────────────
echo
echo "→ Application Load Balancer..."
ALB_ARN=$(aws elbv2 describe-load-balancers --region "$REGION" --names reidascarnes-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "")
if [ -z "$ALB_ARN" ] || [ "$ALB_ARN" = "None" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer --region "$REGION" --name reidascarnes-alb \
    --type application --scheme internet-facing \
    --subnets $PUBLIC_SUBNET_IDS --security-groups "$ALB_SG_ID" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  echo "  Criado — aguardando ficar ativo..."
  aws elbv2 wait load-balancer-available --region "$REGION" --load-balancer-arns "$ALB_ARN"
else
  echo "  Já existe — reaproveitando."
fi
ALB_DNS=$(aws elbv2 describe-load-balancers --region "$REGION" --load-balancer-arns "$ALB_ARN" --query 'LoadBalancers[0].DNSName' --output text)

LISTENER_ARN=$(aws elbv2 describe-listeners --region "$REGION" --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" --output text)
if [ -z "$LISTENER_ARN" ] || [ "$LISTENER_ARN" = "None" ]; then
  aws elbv2 create-listener --region "$REGION" --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 --default-actions "Type=forward,TargetGroupArn=$TG_ARN" >/dev/null
  echo "  Listener HTTP:80 criado, encaminhando pro target group."
else
  echo "  Listener HTTP:80 já existe — reaproveitando."
fi

echo
echo "════════════════════════════════════════════════════════════════"
echo "Pronto. Acesse (pode levar 1-2 min pro target ficar 'healthy'):"
echo "  http://$ALB_DNS"
echo
echo "Pra conferir o status do target:"
echo "  aws elbv2 describe-target-health --region $REGION --target-group-arn $TG_ARN"
echo "════════════════════════════════════════════════════════════════"
