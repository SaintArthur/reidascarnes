// ─── Leitura do XML de NF-e recebida do fornecedor ────────────────────────────
// Entrada de mercadoria digitada à mão é onde o estoque de açougue começa a mentir: são
// dezenas de itens por nota, com NCM e CFOP que ninguém confere. O XML que o fornecedor já
// manda por e-mail tem tudo isso pronto e conferido pela SEFAZ — ler o arquivo elimina a
// digitação e, de quebra, dá a base de crédito de PIS/COFINS sem ninguém recalcular nada.
//
// Suporta os dois formatos que circulam: o XML "puro" (raiz <NFe>) e o de retorno da SEFAZ
// (raiz <nfeProc>, que embrulha a NFe junto do protocolo de autorização).

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Tudo como texto: converter sozinho estragaria chave de acesso (44 dígitos vira notação
  // científica) e NCM/CFOP com zero à esquerda.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

// A NF-e permite um item só sem virar array. Sem isso, nota de item único quebraria.
function comoLista(valor) {
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function parseNFeXml(xmlTexto) {
  let raiz;
  try {
    raiz = parser.parse(xmlTexto);
  } catch (err) {
    const e = new Error(`XML inválido: ${err.message}`);
    e.code = 'XML_INVALIDO';
    throw e;
  }

  const nfe = raiz?.nfeProc?.NFe || raiz?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) {
    const e = new Error('Este arquivo não parece uma NF-e (não achei a tag infNFe). Confira se é o XML da nota, e não o DANFE em PDF.');
    e.code = 'NAO_E_NFE';
    throw e;
  }

  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const total = inf.total?.ICMSTot || {};

  // A chave vem no atributo Id como "NFe" + 44 dígitos; o protocolo é a prova de autorização.
  const chave = String(inf['@_Id'] || '').replace(/^NFe/, '') || null;

  const itens = comoLista(inf.det).map((det, i) => {
    const prod = det.prod || {};
    const imp = det.imposto || {};
    // Cada imposto vem dentro de um grupo cujo nome varia com a situação tributária
    // (ICMS00, ICMS60, PISAliq, PISNT...). Pegar o primeiro valor do objeto evita ter que
    // enumerar todas as combinações possíveis da tabela da SEFAZ.
    const primeiroGrupo = (no) => (no && typeof no === 'object') ? Object.values(no)[0] || {} : {};
    const icms = primeiroGrupo(imp.ICMS);
    const pis = primeiroGrupo(imp.PIS);
    const cofins = primeiroGrupo(imp.COFINS);

    return {
      numero_item: Number(det['@_nItem'] || i + 1),
      codigo: String(prod.cProd ?? ''),
      // cEAN costuma vir "SEM GTIN" quando o fornecedor não usa código de barras.
      ean: /^\d{8,14}$/.test(String(prod.cEAN || '')) ? String(prod.cEAN) : null,
      descricao: String(prod.xProd ?? ''),
      ncm: prod.NCM ? String(prod.NCM).padStart(8, '0') : null,
      cest: prod.CEST ? String(prod.CEST) : null,
      cfop: prod.CFOP ? String(prod.CFOP) : null,
      unidade: String(prod.uCom ?? 'UN'),
      quantidade: numero(prod.qCom),
      valor_unitario: numero(prod.vUnCom),
      valor_total: numero(prod.vProd),
      icms_cst: String(icms.CST ?? icms.CSOSN ?? '') || null,
      icms_valor: numero(icms.vICMS),
      pis_cst: String(pis.CST ?? '') || null,
      pis_valor: numero(pis.vPIS),
      cofins_cst: String(cofins.CST ?? '') || null,
      cofins_valor: numero(cofins.vCOFINS),
    };
  });

  return {
    chave_acesso: chave,
    numero: String(ide.nNF ?? ''),
    serie: String(ide.serie ?? ''),
    modelo: String(ide.mod ?? '55'),
    // dhEmi (NF-e 3.10+) ou dEmi (versões antigas); guardamos só a data.
    data_emissao: String(ide.dhEmi || ide.dEmi || '').slice(0, 10) || null,
    emitente: {
      cnpj: String(emit.CNPJ ?? emit.CPF ?? ''),
      nome: String(emit.xNome ?? ''),
      ie: String(emit.IE ?? ''),
      uf: String(emit.enderEmit?.UF ?? ''),
      municipio: String(emit.enderEmit?.xMun ?? ''),
    },
    valor_total: numero(total.vNF),
    valor_produtos: numero(total.vProd),
    valor_icms: numero(total.vICMS),
    valor_pis: numero(total.vPIS),
    valor_cofins: numero(total.vCOFINS),
    itens,
  };
}

module.exports = { parseNFeXml };
