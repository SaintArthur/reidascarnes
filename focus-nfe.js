// ─── Integração com a Focus NFe (emissão de NF-e/NFC-e) ───────────────────────
// Sem FOCUS_NFE_TOKEN configurado no .env, nenhuma chamada sai daqui — todas as funções
// rejeitam com FOCUS_NOT_CONFIGURED, e as rotas de /api/acougue/nfe tratam isso guardando a
// nota localmente como 'rascunho'. Isso é intencional: não existe emissão fiscal real sem
// contratar a Focus NFe (ou outro provedor homologado) e sem CNPJ/IE/certificado digital
// cadastrados na empresa lá — não dá pra simular esse fluxo de forma honesta.
//
// Doc oficial da API: https://focusnfe.com.br/doc/ — os nomes de campo abaixo seguem o
// schema documentado para NF-e (modelo 55) na data em que este adaptador foi escrito.
// Confirme contra a documentação atual antes de emitir em produção, pois provedores fiscais
// mudam o schema com alguma frequência (novos campos obrigatórios, mudanças de tributação etc).

const FOCUS_NFE_TOKEN = process.env.FOCUS_NFE_TOKEN;
const FOCUS_NFE_ENV = process.env.FOCUS_NFE_ENV === 'producao' ? 'producao' : 'homologacao';
const FOCUS_BASE_URL = FOCUS_NFE_ENV === 'producao'
  ? 'https://api.focusnfe.com.br'
  : 'https://homologacao.focusnfe.com.br';

function isFocusConfigured() {
  return !!FOCUS_NFE_TOKEN;
}

async function focusRequest(method, path, body) {
  if (!isFocusConfigured()) {
    const err = new Error('Focus NFe não configurado. Defina FOCUS_NFE_TOKEN (e opcionalmente FOCUS_NFE_ENV=producao) no .env para emitir notas fiscais reais.');
    err.code = 'FOCUS_NOT_CONFIGURED';
    throw err;
  }
  // Focus NFe usa Basic Auth com o token como usuário e senha vazia.
  const auth = Buffer.from(`${FOCUS_NFE_TOKEN}:`).toString('base64');
  let res;
  try {
    res = await fetch(`${FOCUS_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const err = new Error(`Falha de rede ao contatar a Focus NFe: ${networkErr.message}`);
    err.code = 'FOCUS_NETWORK_ERROR';
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch { /* resposta sem corpo JSON (ex: 204) */ }
  return { ok: res.ok, status: res.status, data, environment: FOCUS_NFE_ENV };
}

// `ref` é uma referência única nossa (ex: `acougue-nfe-{id}`) que a Focus usa para
// idempotência — reenviar o mesmo ref não duplica a nota.
async function emitNFe(ref, payload) {
  return focusRequest('POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
}

async function consultNFe(ref) {
  return focusRequest('GET', `/v2/nfe/${encodeURIComponent(ref)}`);
}

async function cancelNFe(ref, justificativa) {
  return focusRequest('DELETE', `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa });
}

// Monta o payload de emissão a partir dos dados internos do açougue. `emitente` deve vir das
// configurações fiscais salvas em /api/acougue/settings (CNPJ, IE, endereço etc.) — sem esses
// dados preenchidos a Focus NFe rejeita a emissão antes mesmo de simular no ambiente de
// homologação.
//
// `tipo` distingue os dois fluxos do açougue:
//  - 'entrada': nota de entrada emitida pelo próprio açougue na compra de carcaça de produtor
//    rural sem CNPJ (comum no setor — a obrigação de emitir cai sobre quem compra). CFOP padrão
//    1102 (compra dentro do estado) — ajuste para 2102 se o fornecedor for de outro estado.
//  - 'saida': nota de venda normal ao consumidor/outro estabelecimento. CFOP padrão 5102/6102.
function buildNFePayload({ tipo, emitente, destinatario, itens, natureza_operacao, valor_total }) {
  const isEntrada = tipo === 'entrada';
  return {
    natureza_operacao: natureza_operacao || (isEntrada ? 'Compra de produtor rural' : 'Venda de mercadoria'),
    data_emissao: new Date().toISOString(),
    tipo_documento: isEntrada ? 0 : 1, // 0 = entrada, 1 = saída
    finalidade_emissao: 1, // 1 = normal
    cnpj_emitente: emitente?.cnpj,
    inscricao_estadual_emitente: emitente?.inscricao_estadual,
    nome_emitente: emitente?.razao_social,
    logradouro_emitente: emitente?.logradouro,
    numero_emitente: emitente?.numero,
    bairro_emitente: emitente?.bairro,
    municipio_emitente: emitente?.municipio,
    uf_emitente: emitente?.uf,
    cep_emitente: emitente?.cep,
    nome_destinatario: destinatario?.nome || (isEntrada ? emitente?.razao_social : 'Consumidor Final'),
    cpf_destinatario: destinatario?.cpf,
    cnpj_destinatario: destinatario?.cnpj,
    items: (itens || []).map((item, i) => ({
      numero_item: i + 1,
      codigo_produto: String(item.codigo || item.id),
      descricao: item.descricao,
      cfop: item.cfop || (isEntrada ? '1102' : '5102'),
      unidade_comercial: item.unidade || 'KG',
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valor_unitario,
      valor_bruto: item.valor_total,
      unidade_tributavel: item.unidade || 'KG',
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valor_unitario,
      icms_situacao_tributaria: '102', // Simples Nacional sem permissão de crédito — ajustar conforme o regime real do açougue
      pis_situacao_tributaria: '01',
      cofins_situacao_tributaria: '01',
    })),
    valor_frete: '0.00',
    valor_seguro: '0.00',
    valor_desconto: '0.00',
    valor_total: valor_total,
    modalidade_frete: 9, // sem transporte
  };
}

// ─── NFC-e (modelo 65) ────────────────────────────────────────────────────────
// É o documento do balcão: venda presencial a consumidor final, cupom impresso na hora.
// Diferenças que importam em relação à NF-e (modelo 55), todas obrigatórias:
//  - endpoint /v2/nfce
//  - `presenca_comprador: 1` (operação presencial)
//  - `consumidor_final: 1` e `indicador_inscricao_estadual_destinatario: 9` (não contribuinte)
//  - forma de pagamento é obrigatória no XML (grupo `formas_pagamento`)
//  - CPF do destinatário é opcional; sem ele a nota sai como "CONSUMIDOR NÃO IDENTIFICADO"
//
// O CSC (Código de Segurança do Contribuinte) NÃO vai no payload: ele fica cadastrado na
// empresa dentro do painel da Focus, que assina o QR Code com ele. Se o CSC não estiver lá,
// a emissão falha na Focus — não tem como contornar daqui.
async function emitNFCe(ref, payload) {
  return focusRequest('POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, payload);
}

async function consultNFCe(ref) {
  return focusRequest('GET', `/v2/nfce/${encodeURIComponent(ref)}`);
}

async function cancelNFCe(ref, justificativa) {
  return focusRequest('DELETE', `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa });
}

// Mapeia a forma de pagamento do caixa para o código da tabela da SEFAZ (campo tPag).
const FORMA_PAGAMENTO_SEFAZ = {
  dinheiro: '01',
  cartao_credito: '03',
  cartao_debito: '04',
  pix: '17',
};

function buildNFCePayload({ emitente, itens, valor_total, forma_pagamento, cpf_destinatario }) {
  return {
    natureza_operacao: 'Venda ao consumidor',
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,        // saída
    finalidade_emissao: 1,    // normal
    presenca_comprador: 1,    // operação presencial — exigido na NFC-e
    consumidor_final: 1,
    // local_destino (idDest) é obrigatório na API da Focus. NFC-e de balcão é sempre venda
    // presencial a consumidor final dentro do estado do emitente → 1 (operação interna).
    // A SEFAZ não autoriza NFC-e interestadual/exterior a consumidor final presencial.
    local_destino: 1,
    indicador_inscricao_estadual_destinatario: 9, // não contribuinte
    modalidade_frete: 9,

    cnpj_emitente: emitente?.cnpj,
    inscricao_estadual_emitente: emitente?.inscricao_estadual,
    nome_emitente: emitente?.razao_social,
    logradouro_emitente: emitente?.logradouro,
    numero_emitente: emitente?.numero,
    bairro_emitente: emitente?.bairro,
    municipio_emitente: emitente?.municipio,
    uf_emitente: emitente?.uf,
    cep_emitente: emitente?.cep,

    // Sem CPF a nota sai como consumidor não identificado, que é o caso normal do balcão.
    cpf_destinatario: cpf_destinatario || undefined,

    items: (itens || []).map((item, i) => ({
      numero_item: i + 1,
      codigo_produto: String(item.codigo),
      descricao: item.descricao,
      codigo_ncm: item.ncm,
      cfop: item.cfop,
      codigo_cest: item.cest || undefined,
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valor_unitario,
      valor_bruto: item.valor_total,
      unidade_tributavel: item.unidade,
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valor_unitario,
      origem_mercadoria: item.origem ?? '0',
      icms_situacao_tributaria: item.icms_cst,
      icms_aliquota: item.icms_aliquota ?? undefined,
      icms_base_calculo: item.icms_base_calculo ?? undefined,
      icms_percentual_reducao_bc: item.icms_reducao_bc ?? undefined,
      pis_situacao_tributaria: item.pis_cst,
      cofins_situacao_tributaria: item.cofins_cst,
    })),

    valor_frete: '0.00',
    valor_seguro: '0.00',
    valor_desconto: '0.00',
    valor_total,
    formas_pagamento: [{
      forma_pagamento: FORMA_PAGAMENTO_SEFAZ[forma_pagamento] || '99',
      valor_pagamento: valor_total,
    }],
  };
}

module.exports = {
  isFocusConfigured,
  emitNFe,
  consultNFe,
  cancelNFe,
  buildNFePayload,
  emitNFCe,
  consultNFCe,
  cancelNFCe,
  buildNFCePayload,
  FORMA_PAGAMENTO_SEFAZ,
  FOCUS_NFE_ENV,
};
