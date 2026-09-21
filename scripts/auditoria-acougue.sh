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
check "quantidade zero"            400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "{\"items\":[{\"product_id\":$P,\"quantity\":0}]}")"
check "quantidade negativa"        400 "$(st -X POST $API/api/acougue/sales -H "$H" -H "$J" -d "{\"items\":[{\"product_id\":$P,\"quantity\":-5}]}")"
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

echo "── SEGURANÇA ──"
check "sem token"                  401 "$(st "$API/api/acougue/products")"
check "token inválido"             401 "$(st "$API/api/acougue/products" -H 'Authorization: Bearer xxx')"

echo; echo "════ $PASS ok, $FAIL falha(s) ════"; [ $FAIL -eq 0 ]
