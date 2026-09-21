// ─── Geração de arquivo SPED Fiscal (EFD ICMS/IPI) ────────────────────────────
//
// LEIA ANTES DE USAR EM ENTREGA REAL
// ==================================
// Este gerador monta os registros a partir do que o sistema tem (notas de entrada
// importadas por XML, vendas do caixa, cadastro de produtos e inventário). Ele NÃO substitui
// o contador, por três motivos concretos:
//
//  1. Vários campos são decisão fiscal, não dado de sistema: perfil da EFD (A/B/C),
//     código de regime, se a empresa é obrigada aos blocos de inventário/apuração naquele
//     período, e como tratar mercadoria com ICMS-ST. Aqui eles saem de Configurações com
//     valores declarados pelo usuário — se estiverem errados, o arquivo sai errado.
//  2. O layout muda praticamente todo ano (Ato COTEPE / Guia Prático da EFD). O que está
//     aqui segue a estrutura vigente quando foi escrito.
//  3. A validação oficial é a do PVA (Programa Validador e Assinador) da Receita. Um arquivo
//     que este código gera sem erro ainda pode ser recusado lá.
//
// Ou seja: use como PONTO DE PARTIDA — gere, abra no PVA, e ajuste com o contador. Entregar
// direto sem passar pelo PVA é assumir risco fiscal sem necessidade.
//
// Formato do arquivo: linhas com campos separados por "|", começando e terminando com "|",
// codificação ISO-8859-1, quebra de linha CRLF.

// Datas no SPED são sempre ddmmaaaa, sem separador.
function dataSped(valor) {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${d.getUTCFullYear()}`;
}

// Valores usam vírgula decimal e nunca separador de milhar.
function valorSped(n, casas = 2) {
  return (Number(n) || 0).toFixed(casas).replace('.', ',');
}

function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

function registro(...campos) {
  return `|${campos.map(c => (c === null || c === undefined) ? '' : String(c)).join('|')}|`;
}

/**
 * Monta o arquivo da EFD ICMS/IPI para um período.
 *
 * @param {object} dados
 *   settings  — configurações fiscais do açougue (CNPJ, IE, endereço, perfil)
 *   inicio    — Date do primeiro dia do período
 *   fim       — Date do último dia do período
 *   produtos  — cadastro (para o bloco 0200)
 *   entradas  — notas de compra importadas, com itens
 *   vendas    — vendas do caixa com NFC-e, agregadas por dia
 *   inventario— saldo de estoque no fim do período (bloco H)
 */
function gerarEfdIcmsIpi({ settings = {}, inicio, fim, produtos = [], entradas = [], vendas = [], inventario = [] }) {
  const linhas = [];
  // O registro 9900 exige a contagem de cada tipo de registro no arquivo; contar na hora de
  // escrever evita ter que varrer tudo de novo no final e errar por esquecimento.
  const contagem = {};
  const add = (...campos) => {
    linhas.push(registro(...campos));
    contagem[campos[0]] = (contagem[campos[0]] || 0) + 1;
  };

  const cnpj = soDigitos(settings.cnpj);
  const ie = soDigitos(settings.ie);
  const uf = (settings.uf || '').toUpperCase();
  // Perfil B é o usual de quem não é indústria nem grande atacadista; o contador confirma.
  const perfil = settings.sped_perfil || 'B';
  // 3 = Simples Nacional; 0 = regime normal. Derivado do regime já configurado no sistema.
  const indAtiv = '1'; // 1 = outros (comércio). 0 seria industrial.

  /* ── Bloco 0: abertura, identificação e tabelas ── */
  add('0000', '018', '0', dataSped(inicio), dataSped(fim), settings.business_name || '',
      cnpj, '', uf, ie, settings.cod_municipio || '', '', '', perfil, indAtiv);
  add('0001', '0');
  add('0005', settings.business_name || '', soDigitos(settings.cep), settings.logradouro || '',
      settings.numero || '', '', settings.bairro || '', '', '', '');
  add('0100', settings.contador_nome || '', soDigitos(settings.contador_cpf), settings.contador_crc || '',
      '', '', '', '', '', '', '', '', '');

  // 0150: participantes (fornecedores das notas de entrada). Um por CNPJ distinto.
  const participantes = new Map();
  for (const nota of entradas) {
    const doc = soDigitos(nota.emit_cnpj);
    if (doc && !participantes.has(doc)) {
      participantes.set(doc, { cod: doc, nome: nota.emit_nome || '', uf: nota.emit_uf || '' });
    }
  }
  for (const p of participantes.values()) {
    add('0150', p.cod, p.nome, '1058', '', p.cod, '', p.uf, '', '', '', '', '', '');
  }

  // 0190: unidades de medida usadas.
  const unidades = new Set();
  produtos.forEach(p => unidades.add((p.unit || 'UN').toUpperCase()));
  entradas.forEach(n => (n.itens || []).forEach(i => unidades.add((i.unidade || 'UN').toUpperCase())));
  for (const u of unidades) add('0190', u, u === 'KG' ? 'QUILOGRAMA' : 'UNIDADE');

  // 0200: cadastro de itens. O SPED cruza este código com o usado nos registros C170/C425,
  // então usamos sempre o id interno do produto como COD_ITEM.
  for (const p of produtos) {
    add('0200', `P${p.id}`, p.name, '', soDigitos(p.barcode) || '', (p.unit || 'UN').toUpperCase(),
        '00', '', soDigitos(p.ncm), '', soDigitos(p.cest), '');
  }
  // O bloco 0 é o primeiro do arquivo, então tudo que já foi escrito pertence a ele; o +1
  // conta o próprio 0990.
  add('0990', linhas.length + 1);

  /* ── Bloco C: documentos fiscais de mercadoria ── */
  const c = [];
  const addC = (...campos) => { c.push(registro(...campos)); contagem[campos[0]] = (contagem[campos[0]] || 0) + 1; };
  addC('C001', '0');

  // C100/C170: notas de ENTRADA (compra). ind_oper 0 = entrada, ind_emit 1 = terceiros.
  for (const nota of entradas) {
    addC('C100', '0', '1', soDigitos(nota.emit_cnpj), '55', '00', nota.serie || '', nota.numero || '',
         nota.chave_acesso || '', dataSped(nota.data_emissao), dataSped(nota.data_emissao),
         valorSped(nota.valor_total), '0', '', valorSped(0), '9', valorSped(0), valorSped(0),
         valorSped(nota.valor_produtos), valorSped(0), valorSped(0), valorSped(0),
         valorSped(nota.valor_icms), valorSped(0), valorSped(0), valorSped(0), valorSped(0),
         valorSped(nota.valor_pis), valorSped(nota.valor_cofins), valorSped(0), valorSped(0));

    (nota.itens || []).forEach((item, idx) => {
      addC('C170', idx + 1, item.product_id ? `P${item.product_id}` : `F${soDigitos(item.codigo) || idx + 1}`,
           item.descricao || '', valorSped(item.quantidade, 3), (item.unidade || 'UN').toUpperCase(),
           valorSped(item.valor_total), valorSped(0), '0', soDigitos(item.icms_cst).padStart(3, '0'),
           item.cfop || '', '', valorSped(item.valor_total), valorSped(0), valorSped(item.icms_valor),
           '', '', '', '', '', '', '', '', '', '', '', '', '',
           soDigitos(item.pis_cst).padStart(2, '0'), valorSped(item.valor_total), valorSped(0, 4),
           valorSped(0, 4), valorSped(item.pis_valor),
           soDigitos(item.cofins_cst).padStart(2, '0'), valorSped(item.valor_total), valorSped(0, 4),
           valorSped(0, 4), valorSped(item.cofins_valor), '');
    });
  }

  // C100 para as NFC-e emitidas (modelo 65, ind_oper 1 = saída, ind_emit 0 = emissão própria).
  // Notas canceladas entram com COD_SIT 02 — omiti-las é erro comum e o PVA acusa lacuna na
  // numeração.
  for (const v of vendas) {
    addC('C100', '1', '0', '', '65', v.cancelada ? '02' : '00', v.serie || '', v.numero || '',
         v.chave_acesso || '', dataSped(v.data), dataSped(v.data),
         valorSped(v.valor_total), '0', '', valorSped(0), '9', valorSped(0), valorSped(0),
         valorSped(v.valor_total), valorSped(0), valorSped(0), valorSped(0),
         valorSped(v.valor_icms || 0), valorSped(0), valorSped(0), valorSped(0), valorSped(0),
         valorSped(v.valor_pis || 0), valorSped(v.valor_cofins || 0), valorSped(0), valorSped(0));
  }

  addC('C990', c.length + 1);
  linhas.push(...c);
  contagem['C990'] = 1;

  /* ── Bloco E: apuração do ICMS ── */
  const totalSaidaIcms = vendas.reduce((s, v) => s + (Number(v.valor_icms) || 0), 0);
  const totalEntradaIcms = entradas.reduce((s, n) => s + (Number(n.valor_icms) || 0), 0);
  const saldoDevedor = Math.max(0, totalSaidaIcms - totalEntradaIcms);

  add('E001', '0');
  add('E100', dataSped(inicio), dataSped(fim));
  add('E110', valorSped(totalSaidaIcms), valorSped(0), valorSped(totalEntradaIcms), valorSped(0),
      valorSped(0), valorSped(0), valorSped(0), valorSped(0), valorSped(saldoDevedor),
      valorSped(0), valorSped(0), valorSped(0), valorSped(saldoDevedor),
      valorSped(Math.max(0, totalEntradaIcms - totalSaidaIcms)));
  add('E990', 4);

  /* ── Bloco H: inventário ── */
  add('H001', inventario.length ? '0' : '1');
  if (inventario.length) {
    add('H005', dataSped(fim), valorSped(inventario.reduce((s, i) => s + (Number(i.valor) || 0), 0)), '01');
    for (const item of inventario) {
      add('H010', `P${item.product_id}`, (item.unidade || 'UN').toUpperCase(), valorSped(item.quantidade, 3),
          valorSped(item.valor_unitario, 6), valorSped(item.valor), '0', '', '', '', '', '');
    }
  }
  add('H990', 2 + (inventario.length ? 1 + inventario.length : 0));

  /* ── Bloco 9: encerramento e totalizações ── */
  // O 9900 tem que contar também os registros do próprio bloco 9, incluindo ele mesmo — é a
  // parte do layout que mais gera rejeição no PVA por diferença de uma linha. Por isso as
  // quantidades são calculadas de forma fechada antes de escrever qualquer coisa, em vez de
  // ir somando durante a escrita.
  const tipos = Object.keys(contagem).sort();
  const qtd9900 = tipos.length + 4;            // um 9900 por tipo já existente + 9001, 9900, 9990, 9999
  const linhasBloco9 = 1 + qtd9900 + 1 + 1;    // 9001 + os 9900 + 9990 + 9999

  const nove = [registro('9001', '0')];
  tipos.forEach(t => nove.push(registro('9900', t, contagem[t])));
  nove.push(registro('9900', '9001', 1));
  nove.push(registro('9900', '9900', qtd9900));
  nove.push(registro('9900', '9990', 1));
  nove.push(registro('9900', '9999', 1));
  nove.push(registro('9990', linhasBloco9));
  nove.push(registro('9999', linhas.length + linhasBloco9));

  return [...linhas, ...nove].join('\r\n') + '\r\n';
}

module.exports = { gerarEfdIcmsIpi, dataSped, valorSped, registro };
