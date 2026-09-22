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


// A Focus recusa nota com data_emissao a mais de 5 minutos do horário atual. Mandar em UTC
// ("...Z") é arriscado: qualquer ponta que interprete o horário como local erra por 3 horas e
// a SEFAZ rejeita. Por isso emitimos com o offset local explícito (-03:00 no Brasil).
function dataEmissaoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();          // minutos; Brasil = -180 => off = 180? (invertido)
  const sinal = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sinal}${hh}:${mm}`;
}

// A emissão de NFC-e é SÍNCRONA: a resposta já traz `autorizado` ou `erro_autorizacao`.
// Traduzir para o status interno aqui evita que cada rota repita (e erre) essa regra —
// antes, `erro_autorizacao` caía no ramo de "ok" e a nota ficava eternamente "processando",
// escondendo a mensagem da SEFAZ que explica a rejeição.
function statusInterno(result) {
  const s = result?.data?.status;
  if (s === 'autorizado') return 'autorizada';
  // `cancelado` e `denegado` vêm da consulta e caíam no `return 'processando'` lá embaixo:
  // uma nota DENEGADA pela SEFAZ (irregularidade fiscal do emitente ou do destinatário)
  // aparecia no sistema como se ainda estivesse em andamento, esperando uma autorização que
  // nunca vem. Denegada é definitiva e consome o número — não se reemite nem se cancela.
  if (s === 'cancelado') return 'cancelada';
  if (s === 'denegado') return 'denegada';
  if (s === 'erro_autorizacao' || s === 'erro') return 'erro';
  if (!result?.ok) return 'erro';
  return 'processando'; // NF-e modelo 55 é assíncrona e pode legitimamente cair aqui
}

// `caminho_danfe` e `caminho_xml_nota_fiscal` vêm como caminho relativo. Guardar assim faz o
// front tentar abrir um link quebrado na hora de imprimir o cupom.
function urlAbsoluta(caminho) {
  if (!caminho) return null;
  return /^https?:\/\//.test(caminho) ? caminho : `${FOCUS_BASE_URL}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
}

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
    data_emissao: dataEmissaoLocal(),
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
      // Mesmo nome de campo da NFC-e (a Focus usa o mesmo schema de item nos dois modelos) e
      // igualmente obrigatório. 0 = nacional, que é o caso da carcaça comprada de produtor.
      icms_origem: item.origem ?? '0',
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
// Códigos tPag da tabela da SEFAZ. Vale alimentação é indispensável num açougue e faltava;
// 'credito_loja' é o fiado da caderneta, que a SEFAZ reconhece como crédito do próprio
// estabelecimento (05).
const FORMA_PAGAMENTO_SEFAZ = {
  dinheiro: '01',
  cheque: '02',
  cartao_credito: '03',
  cartao_debito: '04',
  credito_loja: '05',
  vale_alimentacao: '10',
  vale_refeicao: '11',
  pix: '17',
  transferencia: '18',
};


// ─── Contingência offline (NFC-e) ─────────────────────────────────────────────
// Quando a SEFAZ está fora do ar, a legislação permite emitir a NFC-e em contingência
// offline (tpEmis=9): o cupom sai na hora para o cliente levar, e a nota é transmitida
// depois. Nesse modo a numeração NÃO pode ser delegada à Focus — o emitente precisa informar
// número, série e o código único (cNF), porque a chave de acesso é montada localmente.
//
// Usamos uma SÉRIE DEDICADA para contingência (padrão 9). Assim a numeração offline nunca
// colide com a numeração online, que a Focus continua atribuindo sozinha. Misturar as duas
// no mesmo intervalo é a forma mais comum de gerar "número duplicado" na SEFAZ.
//
// LIMITE ARQUITETURAL, e é importante: isso resolve SEFAZ fora do ar, não internet fora da
// loja. Com o sistema na nuvem, se a internet do açougue cair o navegador nem alcança o
// servidor — aí nada funciona, nem o caixa. Contingência de verdade contra queda de internet
// exige o sistema rodando DENTRO da loja (ou o Comunicador Offline da Focus, que é um
// aplicativo Windows local).
async function emitNFCeContingencia(ref, payload) {
  return focusRequest('POST', `/v2/nfce?ref=${encodeURIComponent(ref)}&forma_emissao=offline`, payload);
}

// cNF: código numérico de 8 dígitos que compõe a chave de acesso. A regra da SEFAZ é que ele
// não pode ser igual ao número da nota — daí o sorteio e a verificação.
function gerarCodigoUnico(numeroNota) {
  let codigo;
  do {
    codigo = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  } while (Number(codigo) === Number(numeroNota));
  return codigo;
}

// Decide se vale tentar contingência. Erro de rede ou indisponibilidade da SEFAZ/Focus, sim.
// Nota recusada por dado errado (CST inválido, NCM inexistente), não — em contingência ela
// seria recusada de novo na efetivação, e aí o cupom já estaria na mão do cliente.
function deveUsarContingencia(erroOuResultado) {
  if (erroOuResultado?.code === 'FOCUS_NETWORK_ERROR') return true;
  const status = erroOuResultado?.status;
  if (status === 503 || status === 504 || status === 502) return true;
  const msg = String(erroOuResultado?.data?.mensagem_sefaz || erroOuResultado?.data?.mensagem || '').toLowerCase();
  // Mensagens que a SEFAZ devolve quando está fora: "Serviço Paralisado sem previsão" (108),
  // "Serviço Paralisado momentaneamente" (109), além de indisponibilidade e timeout.
  return /paralisad|fora de opera|indisponi|tempo de espera|timeout|servico em manuten/.test(msg);
}


// ─── Inutilização de numeração ────────────────────────────────────────────────
// Quando um número de nota é "queimado" sem virar documento (falha no meio da emissão, salto
// de numeração), o emitente precisa declarar à SEFAZ que aquele intervalo não será usado.
// Sem isso fica um buraco na sequência, que é exatamente o que o fisco procura numa auditoria.
async function inutilizarNumeracao({ cnpj, serie, numeroInicial, numeroFinal, justificativa }) {
  return focusRequest('POST', '/v2/nfce/inutilizacao', {
    cnpj, serie: String(serie),
    numero_inicial: String(numeroInicial),
    numero_final: String(numeroFinal),
    justificativa,
  });
}

async function consultarInutilizacoes(cnpj) {
  return focusRequest('GET', `/v2/nfce/inutilizacao?cnpj=${encodeURIComponent(cnpj)}`);
}

// ─── Carta de correção (só NF-e modelo 55) ───────────────────────────────────
// A legislação NÃO permite carta de correção para NFC-e (modelo 65) — nota de consumidor
// errada se cancela e reemite. Por isso esta função só serve ao fluxo de NF-e do atacado,
// e quem chamar precisa saber disso.
async function cartaCorrecaoNFe(ref, correcao) {
  return focusRequest('POST', `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, { correcao });
}

function buildNFCePayload({ emitente, itens, valor_total, forma_pagamento, pagamentos, cpf_destinatario }) {
  return {
    natureza_operacao: 'Venda ao consumidor',
    data_emissao: dataEmissaoLocal(),
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
      // `icms_origem`, NÃO `origem_mercadoria`. O nome estava errado desde que este adaptador
      // foi escrito, e o campo é obrigatório em todo item: a Focus ignora a chave desconhecida
      // e a nota seguia sem a origem da mercadoria, que a SEFAZ recusa. Ou seja, nenhuma NFC-e
      // emitida por aqui seria autorizada. Conferido contra
      // doc.focusnfe.com.br/reference/emitir_nfce em 22/09/2026.
      icms_origem: item.origem ?? '0',
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
    // Cada forma vai discriminada: a SEFAZ exige o grupo completo, e uma venda dividida
    // entre dinheiro e cartão precisa das duas linhas.
    formas_pagamento: (pagamentos && pagamentos.length
      ? pagamentos
      : [{ forma: forma_pagamento, valor: valor_total }]
    ).map((p) => ({
      forma_pagamento: FORMA_PAGAMENTO_SEFAZ[p.forma] || '99',
      valor_pagamento: p.valor,
    })),
  };
}

module.exports = {
  isFocusConfigured,
  dataEmissaoLocal,
  statusInterno,
  urlAbsoluta,
  emitNFe,
  consultNFe,
  cancelNFe,
  buildNFePayload,
  emitNFCe,
  emitNFCeContingencia,
  inutilizarNumeracao,
  consultarInutilizacoes,
  cartaCorrecaoNFe,
  gerarCodigoUnico,
  deveUsarContingencia,
  consultNFCe,
  cancelNFCe,
  buildNFCePayload,
  FORMA_PAGAMENTO_SEFAZ,
  FOCUS_NFE_ENV,
};
