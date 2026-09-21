// Exporta um CSV para o contador revisar NCM/CFOP/CST produto a produto.
//
// A lista veio de uma planilha do sistema antigo e nunca passou por revisão. A validação
// automática (scripts/validar-fiscal.js) já mostrou NCM inexistente, NCM de categoria errada
// e CFOP incoerente com o CST. Nada disso o sistema pode decidir sozinho: é decisão fiscal.
// O papel deste arquivo é dar ao contador uma lista curta e ordenada por gravidade, em vez
// de mandar 185 linhas sem contexto.
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const auth = 'Basic ' + Buffer.from((process.env.FOCUS_NFE_TOKEN || '') + ':').toString('base64');
const BASE = process.env.FOCUS_NFE_ENV === 'producao'
  ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = new Map();

// Pausa obrigatória: a Focus limita a taxa e, sem isso, NCM válido volta como erro — o que
// transformaria o relatório do contador numa lista de falsos positivos.
async function api(caminho) {
  if (cache.has(caminho)) return cache.get(caminho);
  let valor = null;
  try {
    const r = await fetch(`${BASE}${caminho}`, { headers: { Authorization: auth } });
    valor = r.status === 200 ? await r.json() : (r.status === 404 ? 'NAO_EXISTE' : null);
  } catch { valor = null; }
  cache.set(caminho, valor);
  await sleep(350);
  return valor;
}

const csv = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  const { rows: produtos } = await pool.query(
    `SELECT scale_code, name, unit, price, ncm, cfop, cest, icms_cst, pis_cst, cofins_cst
     FROM acougue_products WHERE active = 1 ORDER BY (scale_code)::bigint`);

  const linhas = [];
  for (const p of produtos) {
    const problemas = [];
    let sugestao = '';

    const ncmOficial = p.ncm ? await api(`/v2/ncms/${p.ncm}`) : null;
    if (!p.ncm) problemas.push('SEM NCM');
    else if (ncmOficial === null) problemas.push('NCM nao verificado (consulta falhou)');
    else if (ncmOficial === 'NAO_EXISTE') {
      problemas.push('NCM NAO EXISTE na tabela oficial');
      // Busca um NCM plausível pela primeira palavra significativa do nome, só como ponto
      // de partida para o contador — jamais aplicado automaticamente.
      const termo = String(p.name).toLowerCase().split(/\s+/).find(w => w.length > 3);
      if (termo) {
        const achados = await api(`/v2/ncms?descricao=${encodeURIComponent(termo)}`);
        if (Array.isArray(achados) && achados.length) {
          sugestao = `${achados[0].codigo} (${String(achados[0].descricao_completa).slice(0, 50)})`;
        }
      }
    }
    if (!p.cfop) problemas.push('SEM CFOP');
    if (!p.icms_cst) problemas.push('SEM CST ICMS');
    if (!p.pis_cst || !p.cofins_cst) problemas.push('SEM CST PIS/COFINS');

    const cst = String(p.icms_cst || '').replace(/\D/g, '');
    if (p.cfop === '5405' && p.icms_cst && !['60', '060', '500'].includes(cst)) problemas.push('CFOP 5405 (ST) com CST ' + p.icms_cst);
    if (p.cfop === '5102' && ['60', '060', '500'].includes(cst)) problemas.push('CFOP 5102 com CST de ST');
    if (['60', '060'].includes(cst) && !p.cest) problemas.push('CST 60 sem CEST');

    linhas.push({
      revisar: problemas.length ? 'SIM' : '',
      plu: p.scale_code, nome: p.name, un: p.unit, preco: p.price,
      ncm: p.ncm || '', ncm_oficial: (ncmOficial && ncmOficial !== 'NAO_EXISTE') ? String(ncmOficial.descricao_completa).slice(0, 70) : '',
      cfop: p.cfop || '', cest: p.cest || '', icms_cst: p.icms_cst || '',
      pis_cst: p.pis_cst || '', cofins_cst: p.cofins_cst || '',
      problemas: problemas.join(' | '), sugestao_ncm: sugestao,
      ncm_corrigido: '', cfop_corrigido: '', cst_corrigido: '',
    });
  }

  // Quem tem problema vem primeiro: o contador não deve caçar agulha em 185 linhas.
  linhas.sort((a, b) => (b.revisar ? 1 : 0) - (a.revisar ? 1 : 0));

  const cabecalho = ['revisar', 'plu', 'nome', 'un', 'preco', 'ncm', 'ncm_oficial', 'cfop', 'cest',
    'icms_cst', 'pis_cst', 'cofins_cst', 'problemas', 'sugestao_ncm',
    'ncm_corrigido', 'cfop_corrigido', 'cst_corrigido'];
  const saida = [cabecalho.join(';'), ...linhas.map(l => cabecalho.map(c => csv(l[c])).join(';'))].join('\n');
  // BOM para o Excel abrir com acento correto.
  fs.writeFileSync('revisao-fiscal.csv', '﻿' + saida, 'utf8');

  const comProblema = linhas.filter(l => l.revisar).length;
  console.log(`revisao-fiscal.csv gerado: ${linhas.length} produtos, ${comProblema} para revisar`);
  await pool.end();
})();
