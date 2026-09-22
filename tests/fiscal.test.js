// O payload que vai para a Focus NFe, campo a campo.
//
// Por que existe: `origem_mercadoria` ficou anos no lugar de `icms_origem`. A Focus ignora
// chave desconhecida em silêncio, a nota segue sem a origem da mercadoria, e a SEFAZ recusa —
// nenhuma NFC-e emitida por este sistema seria autorizada. Nada quebrava em teste porque não
// havia teste, e nada quebrava em dev porque sem FOCUS_NFE_TOKEN a nota nem é transmitida.
//
// Estes testes não tocam rede nem banco: montam o payload e conferem os nomes exatos contra
// doc.focusnfe.com.br/reference/emitir_nfce (conferido em 22/09/2026). Se a Focus mudar o
// schema, é aqui que se atualiza — e o teste é que avisa.
const focus = require('../focus-nfe');

const emitente = {
  cnpj: '11222333000181', inscricao_estadual: '1234567', razao_social: 'Açougue Teste ME',
  logradouro: 'Rua das Carnes', numero: '100', bairro: 'Centro',
  municipio: 'Vitória', uf: 'ES', cep: '29000000',
};

const itemPadrao = {
  codigo: 7, descricao: 'Picanha', ncm: '02013000', cfop: '5102', unidade: 'KG',
  quantidade: 1.235, valor_unitario: 79.9, valor_total: 98.68,
  origem: '0', icms_cst: '102', pis_cst: '01', cofins_cst: '01',
};

const montar = (extra = {}) => focus.buildNFCePayload({
  emitente, itens: [itemPadrao], valor_total: 98.68,
  forma_pagamento: 'dinheiro', ...extra,
});

describe('Payload da NFC-e', () => {
  it('manda a origem da mercadoria como icms_origem — o nome que a Focus documenta', () => {
    const item = montar().items[0];
    expect(item.icms_origem).toBe('0');
    // A chave antiga não pode voltar: a Focus aceitaria a requisição e recusaria a nota.
    expect(item).not.toHaveProperty('origem_mercadoria');
  });

  it('todo item leva os campos que a SEFAZ exige, com o nome exato', () => {
    const item = montar().items[0];
    for (const campo of [
      'numero_item', 'codigo_produto', 'descricao', 'codigo_ncm', 'cfop',
      'unidade_comercial', 'quantidade_comercial', 'valor_unitario_comercial', 'valor_bruto',
      'unidade_tributavel', 'quantidade_tributavel', 'valor_unitario_tributavel',
      'icms_origem', 'icms_situacao_tributaria', 'pis_situacao_tributaria', 'cofins_situacao_tributaria',
    ]) {
      expect(`${campo}=${item[campo]}`).not.toMatch(/=(undefined|null|)$/);
    }
  });

  it('a nota de balcão é presencial, a consumidor final, dentro do estado', () => {
    const p = montar();
    expect(p.presenca_comprador).toBe(1);
    expect(p.consumidor_final).toBe(1);
    expect(p.local_destino).toBe(1);
    expect(p.indicador_inscricao_estadual_destinatario).toBe(9);
    expect(p.cnpj_emitente).toBe(emitente.cnpj);
  });

  it('data_emissao vai com o fuso explícito, nunca em UTC', () => {
    // Em UTC ("...Z") qualquer ponta que leia como horário local erra por 3 horas, e a Focus
    // recusa emissão com mais de 5 minutos de diferença do relógio dela.
    expect(montar().data_emissao).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(montar().data_emissao).not.toMatch(/Z$/);
  });

  it('venda dividida vira uma linha por forma de pagamento, com o código da SEFAZ', () => {
    const p = montar({ pagamentos: [{ forma: 'dinheiro', valor: 50 }, { forma: 'pix', valor: 48.68 }] });
    expect(p.formas_pagamento).toEqual([
      { forma_pagamento: '01', valor_pagamento: 50 },
      { forma_pagamento: '17', valor_pagamento: 48.68 },
    ]);
  });

  it('sem lista de pagamentos, cai na forma única da venda', () => {
    expect(montar({ forma_pagamento: 'cartao_debito' }).formas_pagamento)
      .toEqual([{ forma_pagamento: '04', valor_pagamento: 98.68 }]);
  });

  it('forma de pagamento desconhecida vira 99 (outros) em vez de sair vazia', () => {
    expect(montar({ forma_pagamento: 'vale_presente_de_natal' }).formas_pagamento[0].forma_pagamento).toBe('99');
  });

  it('sem CPF a nota sai como consumidor não identificado, que é o caso do balcão', () => {
    expect(montar().cpf_destinatario).toBeUndefined();
    expect(montar({ cpf_destinatario: '12345678909' }).cpf_destinatario).toBe('12345678909');
  });

  it('o fiado (crédito da loja) tem código próprio na tabela da SEFAZ', () => {
    expect(focus.FORMA_PAGAMENTO_SEFAZ.credito_loja).toBe('05');
    expect(focus.FORMA_PAGAMENTO_SEFAZ.vale_alimentacao).toBe('10');
  });
});

describe('Payload da NF-e (nota de entrada do produtor)', () => {
  it('também manda icms_origem — mesmo schema de item da NFC-e', () => {
    const p = focus.buildNFePayload({
      tipo: 'entrada', emitente, valor_total: 5000,
      itens: [{ codigo: 1, descricao: 'Carcaça bovina', quantidade: 250, valor_unitario: 20, valor_total: 5000 }],
    });
    expect(p.items[0].icms_origem).toBe('0');
    expect(p.items[0]).not.toHaveProperty('origem_mercadoria');
    expect(p.tipo_documento).toBe(0);            // 0 = entrada
    expect(p.items[0].cfop).toBe('1102');        // compra dentro do estado
  });
});

describe('Tradução do status da Focus para o status interno', () => {
  const traduz = (status, ok = true) => focus.statusInterno({ ok, data: { status } });

  it('autorizado vira autorizada', () => expect(traduz('autorizado')).toBe('autorizada'));
  it('erro_autorizacao vira erro', () => expect(traduz('erro_autorizacao')).toBe('erro'));

  it('denegado NÃO pode virar "processando" — é definitivo e consome o número', () => {
    expect(traduz('denegado')).toBe('denegada');
  });

  it('cancelado vira cancelada, não "processando"', () => {
    expect(traduz('cancelado')).toBe('cancelada');
  });

  it('NF-e ainda em processamento continua sendo processando', () => {
    expect(traduz('processando_autorizacao')).toBe('processando');
  });

  it('resposta HTTP de erro vira erro mesmo sem campo status', () => {
    expect(focus.statusInterno({ ok: false, data: {} })).toBe('erro');
  });
});

describe('Sem token configurado, nada é transmitido', () => {
  it('isFocusConfigured é falso e a emissão recusa antes de chamar a rede', async () => {
    expect(focus.isFocusConfigured()).toBe(false);
    await expect(focus.emitNFCe('teste-1', {})).rejects.toMatchObject({ code: 'FOCUS_NOT_CONFIGURED' });
  });
});
