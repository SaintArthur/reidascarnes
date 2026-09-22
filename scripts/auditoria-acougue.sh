#!/bin/bash
# Auditoria de cenários do módulo açougue. Roda contra um servidor já no ar.
# NÃO emite nota fiscal: só exercita validações, recusas e rotas de leitura.
API=${API:-http://localhost:5001}
T=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"reidascarnes","password":"reidascarnes"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
H="Authorization: Bearer $T"; J='Content-Type: application/json'
PASS=0; FAIL=0
check(){ if [ "$2" = "$3" ]; then printf "  OK    %-50s (%s)\n" "$1" "$3"; PASS=$((PASS+1));
  else printf "  FALHA %-50s esperado %s, veio %s\n        %s\n" "$1" "$2" "$3" "$(head -c 130 /tmp/b.txt)"; FAIL=$((FAIL+1)); fi; }
st(){ curl -s -o /tmp/b.txt -w "%{http_code}" "$@"; }
P=$(psql -d reidascarnes -tA -c "SELECT id FROM acougue_products WHERE active=1 AND unit='kg' LIMIT 1;")

echo "── VENDAS ──"
check "venda sem itens"            400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d '{"items":[]}')"
B='{"items":[{"product_id":PID,"quantity":0}]}'; B=${B/PID/$P}
check "quantidade zero"            400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"
B='{"items":[{"product_id":PID,"quantity":-5}]}'; B=${B/PID/$P}
check "quantidade negativa"        400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"
check "produto inexistente"        400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d '{"items":[{"product_id":999999,"quantity":1}]}')"

echo "── LEITOR DE BALANÇA ──"
check "DV inválido"                400 "$(st "$API/api/acougue/products/scan/2000700035221" -H "$H")"
check "PLU inexistente"            404 "$(st "$API/api/acougue/products/scan/2999900035220" -H "$H")"
check "código não numérico"        404 "$(st "$API/api/acougue/products/scan/abc" -H "$H")"

echo "── NFC-e ──"
check "consultar nota inexistente" 404 "$(st -X POST $API/api/acougue/nfce/999999/consultar -H "$H")"
check "cancelar justificativa curta" 400 "$(st -X POST $API/api/acougue/nfce/1/cancelar -H "$H" -H "$J" -d '{"justificativa":"curta"}')"
check "cancelar nota em rascunho"  409 "$(st -X POST $API/api/acougue/nfce/1/cancelar -H "$H" -H "$J" -d '{"justificativa":"cliente desistiu da compra no balcao"}')"
check "efetivar nota sem conting." 409 "$(st -X POST $API/api/acougue/nfce/1/efetivar -H "$H")"
check "painel de contingência"     200 "$(st "$API/api/acougue/nfce/contingencia" -H "$H")"

echo "── ENTRADA DE NOTAS ──"
check "XML que não é NF-e"         400 "$(st -X POST $API/api/acougue/purchases/xml -H "$H" -H "$J" -d '{"xml":"<a>x</a>"}')"
check "XML malformado"             400 "$(st -X POST $API/api/acougue/purchases/xml -H "$H" -H "$J" -d '{"xml":"<<<"}')"
check "sem XML no corpo"           400 "$(st -X POST $API/api/acougue/purchases/xml -H "$H" -H "$J" -d '{}')"

echo "── CÂMARA FRIA / ESTOQUE ──"
check "peso saída > entrada"       400 "$(st -X PATCH $API/api/acougue/cold-storage/1 -H "$H" -H "$J" -d '{"weight_out_kg":99999}')"
check "peso saída negativo"        400 "$(st -X PATCH $API/api/acougue/cold-storage/1 -H "$H" -H "$J" -d '{"weight_out_kg":-1}')"
check "carcaça inexistente"        404 "$(st -X PATCH $API/api/acougue/cold-storage/999999 -H "$H" -H "$J" -d '{"weight_out_kg":1}')"
check "livro de movimentação"      200 "$(st "$API/api/acougue/stock-movements" -H "$H")"

echo "── CONFERÊNCIA DE PLU ──"
check "panorama"                   200 "$(st "$API/api/acougue/plu-audit" -H "$H")"
check "conferir sem informar valor" 400 "$(st -X POST $API/api/acougue/products/$P/conferir-plu -H "$H" -H "$J" -d '{}')"
check "conferir produto inexistente" 404 "$(st -X POST $API/api/acougue/products/999999/conferir-plu -H "$H" -H "$J" -d '{"confere":true}')"

echo "── SPED / APURAÇÃO ──"
check "mês inválido"               400 "$(st "$API/api/acougue/sped/efd-icms-ipi?month=13&year=2026" -H "$H")"
check "período sem dados"          200 "$(st "$API/api/acougue/sped/efd-icms-ipi?month=1&year=2020" -H "$H")"
check "apuração PIS/COFINS"        200 "$(st "$API/api/acougue/taxes/apuracao?month=9&year=2026" -H "$H")"

echo "── GAVETA DO CAIXA ──"
check "sangria sem motivo"         400 "$(st -X POST $API/api/acougue/cash-session/movimento -H "$H" -H "$J" -d '{"tipo":"sangria","valor":10}')"
check "movimento tipo inválido"    400 "$(st -X POST $API/api/acougue/cash-session/movimento -H "$H" -H "$J" -d '{"tipo":"roubo","valor":10,"motivo":"teste do sistema"}')"
check "movimento valor zero"       400 "$(st -X POST $API/api/acougue/cash-session/movimento -H "$H" -H "$J" -d '{"tipo":"sangria","valor":0,"motivo":"teste do sistema"}')"
check "abrir caixa já aberto"      409 "$(st -X POST $API/api/acougue/cash-session/abrir -H "$H" -H "$J" -d '{"valor_abertura":100}')"
check "situação da gaveta"         200 "$(st "$API/api/acougue/cash-session" -H "$H")"
check "histórico de fechamentos"   200 "$(st "$API/api/acougue/cash-session/historico" -H "$H")"

echo "── DESCONTO E PAGAMENTO ──"
B='{"items":[{"product_id":PID,"quantity":1}],"desconto":-5}'; B=${B/PID/$P}
check "desconto negativo"          400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"
B='{"items":[{"product_id":PID,"quantity":1}],"desconto":999999}'; B=${B/PID/$P}
check "desconto maior que a venda" 400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"
B='{"items":[{"product_id":PID,"quantity":1}],"pagamentos":[{"forma":"pix","valor":1}]}'; B=${B/PID/$P}
check "pagamentos não somam total" 400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"

echo "── PRECIFICAÇÃO ──"
check "carcaça inexistente"        404 "$(st "$API/api/acougue/pricing/carcass/999999" -H "$H")"
check "margem acima de 99"         400 "$(st "$API/api/acougue/pricing/carcass/1?margem=150" -H "$H")"
check "margem negativa"            400 "$(st "$API/api/acougue/pricing/carcass/1?margem=-10" -H "$H")"
check "análise da carcaça"         200 "$(st "$API/api/acougue/pricing/carcass/1?margem=30" -H "$H")"

echo "── CLIENTES E FIADO ──"
check "cliente sem nome"           400 "$(st -X POST $API/api/acougue/customers -H "$H" -H "$J" -d '{}')"
check "listar clientes"            200 "$(st "$API/api/acougue/customers" -H "$H")"
check "extrato inexistente"        404 "$(st "$API/api/acougue/customers/999999/extrato" -H "$H")"
check "resumo do fiado"            200 "$(st "$API/api/acougue/receivables/resumo" -H "$H")"
check "pagar dívida inexistente"   404 "$(st -X POST $API/api/acougue/receivables/999999/pagar -H "$H" -H "$J" -d '{"valor":10}')"
check "pagar valor zero"           400 "$(st -X POST $API/api/acougue/receivables/1/pagar -H "$H" -H "$J" -d '{"valor":0}')"
B='{"items":[{"product_id":PID,"quantity":1}],"pagamentos":[{"forma":"credito_loja","valor":29.99}]}'; B=${B/PID/$P}
check "fiado sem cliente"          400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "$B")"

echo "── RELATÓRIOS ──"
check "relatório padrão"           200 "$(st "$API/api/acougue/reports" -H "$H")"
check "data inicial maior"         400 "$(st "$API/api/acougue/reports?de=2026-12-01&ate=2026-01-01" -H "$H")"

echo "── PRODUÇÃO E LOTES ──"
check "receita sem produto"        400 "$(st -X POST $API/api/acougue/recipes -H "$H" -H "$J" -d '{"rendimento_kg":10,"itens":[]}')"
B='{"product_id":PID,"rendimento_kg":10,"itens":[]}'; B=${B/PID/$P}
check "receita sem insumos"        400 "$(st -X POST $API/api/acougue/recipes -H "$H" -H "$J" -d "$B")"
B='{"product_id":PID,"rendimento_kg":0,"itens":[{"insumo_id":1,"quantidade":1}]}'; B=${B/PID/$P}
check "receita com rendimento 0"   400 "$(st -X POST $API/api/acougue/recipes -H "$H" -H "$J" -d "$B")"
B='{"product_id":PID,"rendimento_kg":10,"itens":[{"insumo_id":PID,"quantidade":1}]}'; B=${B//PID/$P}
check "receita com o próprio produto" 400 "$(st -X POST $API/api/acougue/recipes -H "$H" -H "$J" -d "$B")"
B='{"product_id":PID,"quantidade":1}'; B=${B/PID/$P}
check "produzir sem ficha técnica" 422 "$(st -X POST $API/api/acougue/production -H "$H" -H "$J" -d "$B")"
B='{"product_id":PID,"quantidade":0}'; B=${B/PID/$P}
check "produzir quantidade zero"   400 "$(st -X POST $API/api/acougue/production -H "$H" -H "$J" -d "$B")"
check "listar fichas"              200 "$(st "$API/api/acougue/recipes" -H "$H")"
check "listar lotes"               200 "$(st "$API/api/acougue/batches" -H "$H")"

echo "── SEGURANÇA ──"
check "sem token"                  401 "$(st "$API/api/acougue/products")"
check "token inválido"             401 "$(st "$API/api/acougue/products" -H 'Authorization: Bearer xxx')"

echo; echo "════ $PASS ok, $FAIL falha(s) ════"; [ $FAIL -eq 0 ]
