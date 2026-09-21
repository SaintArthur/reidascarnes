// Valida os dados fiscais do catálogo contra a tabela oficial de NCM da Focus e contra as
// regras de coerência entre CFOP e CST. Não emite nada — só consulta.
//
// Existe porque NCM/CFOP/CST vieram de uma planilha exportada do sistema antigo e nunca
// foram revisados: já sabíamos de pelo menos um caso absurdo (suco com NCM de carne bovina).
// Cálculo certo sobre dado errado continua dando imposto errado.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const auth = 'Basic ' + Buffer.from((process.env.FOCUS_NFE_TOKEN || '') + ':').toString('base64');
const BASE = process.env.FOCUS_NFE_ENV === 'producao'
  ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';

const cacheNcm = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A Focus limita a taxa de consultas. Sem pausa entre chamadas ela passa a responder erro, e
// como um NCM válido vira "não encontrado" o relatório inteiro fica errado — foi o que
// aconteceu na primeira versão deste script, que acusou 42 NCMs inválidos quando só há 4.
// Por isso: só códigos DISTINTOS (42 em vez de 185), pausa entre eles, e 404 tratado como
// "não existe" enquanto qualquer outro erro é tratado como indeterminado.
async function consultarNcm(codigo) {
  if (cacheNcm.has(codigo)) return cacheNcm.get(codigo);
  let valor = { existe: null, descricao: null }; // null = não deu para verificar
  try {
    const resp = await fetch(`${BASE}/v2/ncms/${codigo}`, { headers: { Authorization: auth } });
    if (resp.status === 200) {
      const j = await resp.json();
      valor = { existe: true, descricao: j.descricao_completa, capitulo: j.capitulo };
    } else if (resp.status === 404) {
      valor = { existe: false, descricao: null };
    }
  } catch { /* indeterminado */ }
  cacheNcm.set(codigo, valor);
  await sleep(350);
  return valor;
}

// Capítulo do NCM x o que o produto aparenta ser pelo nome. Só sinaliza quando há conflito
// claro — a intenção é levantar suspeita para o contador, não reprovar automaticamente.
const PISTAS = [
  { re: /refri|suco|agua|água|cerveja|energ|monster|coca|guaran|bebida/i, capitulo: '22', oque: 'bebida' },
  { re: /carne|alcatra|picanha|costela|file|filé|acem|acém|músculo|musculo|paleta|cupim|fraldinha|maminha|patinho|coxão|lagarto|bife|contra ?file/i, capitulo: '02', oque: 'carne' },
  { re: /sal /i, capitulo: '25', oque: 'sal' },
  { re: /carvao|carvão/i, capitulo: '44', oque: 'carvão' },
];

(async () => {
  const { rows: produtos } = await pool.query(
    `SELECT id, scale_code, name, unit, price, ncm, cfop, cest, icms_cst, pis_cst, cofins_cst
     FROM acougue_products WHERE active = 1 ORDER BY (scale_code)::bigint`);

  const achados = [];
  const add = (p, gravidade, problema, detalhe) =>
    achados.push({ plu: p.scale_code, nome: p.name, gravidade, problema, detalhe });

  for (const p of produtos) {
    // 1) NCM existe na tabela oficial?
    if (!p.ncm) { add(p, 'ALTA', 'sem NCM', 'a SEFAZ rejeita a nota inteira'); continue; }
    const ncm = await consultarNcm(p.ncm);
    if (ncm.existe === false) { add(p, 'ALTA', 'NCM inexistente', `${p.ncm} não consta na tabela oficial`); continue; }
    if (ncm.existe === null) { add(p, 'MEDIA', 'NCM não verificado', `${p.ncm} — a consulta à Focus falhou, verifique manualmente`); continue; }

    // 2) O capítulo do NCM bate com o que o nome do produto sugere?
    for (const pista of PISTAS) {
      if (pista.re.test(p.name) && ncm.capitulo !== pista.capitulo) {
        add(p, 'ALTA', 'NCM incompatível com o produto',
            `parece ${pista.oque} (capítulo ${pista.capitulo}), mas o NCM ${p.ncm} é "${String(ncm.descricao).slice(0, 60)}"`);
        break;
      }
    }

    // 3) CFOP x CST do ICMS. 5405 é venda de mercadoria com ICMS já retido por substituição
    //    tributária — o CST tem que refletir isso (60 no regime normal, 500 no Simples).
    const cst = String(p.icms_cst || '').replace(/\D/g, '');
    if (p.cfop === '5405' && !['60', '060', '500'].includes(cst)) {
      add(p, 'ALTA', 'CFOP 5405 com CST incoerente', `CFOP de ICMS-ST mas CST ${p.icms_cst}`);
    }
    if (p.cfop === '5102' && ['60', '060', '500'].includes(cst)) {
      add(p, 'ALTA', 'CFOP 5102 com CST de ST', `CST ${p.icms_cst} indica ST, mas o CFOP é de venda normal`);
    }
    // 4) CST 60 (ST) exige CEST.
    if (['60', '060'].includes(cst) && !p.cest) {
      add(p, 'MEDIA', 'CST 60 sem CEST', 'mercadoria em ST precisa de CEST na nota');
    }
    if (!p.cfop) add(p, 'ALTA', 'sem CFOP', 'a SEFAZ rejeita a nota inteira');
    if (!p.pis_cst || !p.cofins_cst) add(p, 'ALTA', 'sem CST de PIS/COFINS', 'a SEFAZ rejeita a nota inteira');
  }

  const porGravidade = (g) => achados.filter(a => a.gravidade === g);
  console.log(`\n${produtos.length} produtos analisados | ${achados.length} achado(s)\n`);
  for (const g of ['ALTA', 'MEDIA']) {
    const lista = porGravidade(g);
    if (!lista.length) continue;
    console.log(`── ${g} (${lista.length}) ──`);
    const porTipo = {};
    lista.forEach(a => { (porTipo[a.problema] = porTipo[a.problema] || []).push(a); });
    for (const [tipo, itens] of Object.entries(porTipo)) {
      console.log(`\n  ${tipo} — ${itens.length} produto(s)`);
      itens.slice(0, 6).forEach(a => console.log(`    PLU ${String(a.plu).padEnd(6)} ${a.nome.slice(0, 26).padEnd(28)} ${a.detalhe}`));
      if (itens.length > 6) console.log(`    ... e mais ${itens.length - 6}`);
    }
    console.log('');
  }
  if (!achados.length) console.log('Nenhuma inconsistência encontrada.');
  await pool.end();
})();
