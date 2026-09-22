// ─── Precificação a partir do rendimento da carcaça ───────────────────────────
//
// O erro que este módulo existe para evitar: o açougue compra a carcaça a R$ 12/kg e acha
// que a carne custa R$ 12/kg. Não custa. Cerca de 30% da carcaça vira osso, sebo e perda de
// processamento — e o cliente não paga por isso. O custo real se espalha só sobre o que dá
// para vender, e some ainda a quebra de peso da câmara fria.
//
//     500 kg de carcaça a R$ 12/kg  =  R$ 6.000
//     menos 30% de perda            =  350 kg vendáveis
//     custo real                    =  R$ 17,14 por kg vendável  (43% acima do que parecia)
//
// Vender picanha a "custo + 30%" usando R$ 12 como custo dá prejuízo. É por isso que
// precificar de cabeça em açougue erra tanto.

// Seções da tabela de rendimento que não viram produto vendável.
const SECOES_PERDA = new Set(['perda']);

function normalizar(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Casa o corte da tabela de rendimento com um produto do catálogo pelo nome. As grafias
// divergem ("Alcatra" x "Alcatra c/ picanha", "Contrafilé" x "CONTRA FILÉ"), então compara
// por palavras em comum em vez de igualdade exata.
function acharProduto(nomeCorte, produtos) {
  const alvo = new Set(normalizar(nomeCorte).split(' ').filter(w => w.length > 2));
  if (!alvo.size) return null;
  let melhor = null, melhorNota = 0;
  for (const p of produtos) {
    const palavras = new Set(normalizar(p.name).split(' ').filter(w => w.length > 2));
    if (!palavras.size) continue;
    let comuns = 0;
    for (const w of alvo) if (palavras.has(w)) comuns++;
    // Fração das palavras do CORTE encontradas no produto: "Alcatra" casa com
    // "Alcatra c/ picanha" (1.0), mas "Picanha" também casaria — o desempate é a nota.
    const nota = comuns / alvo.size;
    if (nota > melhorNota) { melhorNota = nota; melhor = p; }
  }
  return melhorNota >= 0.5 ? melhor : null;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * Calcula o custo real por kg vendável e avalia os preços atuais contra ele.
 *
 * @param carcaca   { weight_kg, total_value, weight_out_kg? }  entrada de carcaça
 * @param cortes    tabela de rendimento (name, section, pct_of_carcass)
 * @param produtos  catálogo (name, price)
 * @param margemAlvo margem desejada sobre o preço de venda, em % (ex: 30)
 */
function analisarCarcaca({ carcaca, cortes, produtos, margemAlvo = 30 }) {
  const pesoEntrada = Number(carcaca.weight_kg) || 0;
  const custoTotal = Number(carcaca.total_value) || 0;
  if (!pesoEntrada || !custoTotal) {
    throw Object.assign(new Error('A carcaça precisa ter peso e valor para o cálculo.'), { code: 'DADOS_INSUFICIENTES' });
  }

  // Se a carcaça já foi pesada na saída da câmara, usa o peso real; a quebra encarece o
  // custo por kg e ignorá-la subestima o custo justamente na conta que deveria protegê-lo.
  const pesoAposCamara = carcaca.weight_out_kg != null ? Number(carcaca.weight_out_kg) : pesoEntrada;
  const quebraCamara = r3(pesoEntrada - pesoAposCamara);

  const vendaveis = cortes.filter(c => !SECOES_PERDA.has(c.section));
  const pctVendavel = vendaveis.reduce((s, c) => s + Number(c.pct_of_carcass || 0), 0);
  const pctPerda = cortes.filter(c => SECOES_PERDA.has(c.section))
    .reduce((s, c) => s + Number(c.pct_of_carcass || 0), 0);

  // A conta inteira depende da tabela somar ~100% da carcaça. Se a soma estiver baixa (alguém
  // apagou cortes, ou cadastrou só uma parte), o peso vendável despenca e o custo por kg
  // explode — um custo de R$ 17 vira R$ 88 sem nada na tela indicando que está errado.
  const pctTotal = r2(pctVendavel + pctPerda);
  const tabelaFechada = Math.abs(pctTotal - 100) <= 2;

  const pesoVendavel = r3(pesoAposCamara * (pctVendavel / 100));
  if (pesoVendavel <= 0) {
    throw Object.assign(new Error('A tabela de rendimento não tem nenhum corte vendável.'), { code: 'SEM_CORTES' });
  }
  const custoPorKgVendavel = r2(custoTotal / pesoVendavel);

  // Avalia cada corte com o preço que está hoje no catálogo.
  const linhas = vendaveis.map(c => {
    const kg = r3(pesoAposCamara * (Number(c.pct_of_carcass) / 100));
    const produto = acharProduto(c.name, produtos);
    const precoAtual = produto ? Number(produto.price) : null;
    const receita = precoAtual != null ? r2(kg * precoAtual) : null;
    const custoRateado = r2(kg * custoPorKgVendavel);
    return {
      corte: c.name, secao: c.section, pct: Number(c.pct_of_carcass),
      kg_esperado: kg,
      produto: produto ? produto.name : null,
      preco_atual: precoAtual,
      receita_esperada: receita,
      custo_rateado: custoRateado,
      // Margem sobre o preço de venda (não sobre o custo) — é como o varejo fala de margem.
      margem_pct: receita ? r2(((receita - custoRateado) / receita) * 100) : null,
    };
  });

  const receitaTotal = r2(linhas.reduce((s, l) => s + (l.receita_esperada || 0), 0));
  const cortesSemPreco = linhas.filter(l => l.preco_atual == null).length;
  const margemReal = receitaTotal > 0 ? r2(((receitaTotal - custoTotal) / receitaTotal) * 100) : null;

  // Sugestão: reajuste proporcional para atingir a margem alvo. Mexer em todos os preços
  // pelo mesmo fator preserva a relação entre eles — picanha continua valendo mais que
  // músculo. Aplicar a mesma margem em cada corte isoladamente destruiria essa relação e
  // deixaria a picanha barata demais.
  const receitaNecessaria = margemAlvo < 100 ? r2(custoTotal / (1 - margemAlvo / 100)) : null;
  const fator = (receitaNecessaria && receitaTotal > 0) ? receitaNecessaria / receitaTotal : null;

  return {
    // Sem isso a tela mostraria um custo inventado com cara de verdade.
    tabela_fechada: tabelaFechada,
    pct_tabela_total: pctTotal,
    aviso_tabela: tabelaFechada ? null
      : `A tabela de rendimento soma ${pctTotal}% da carcaça, não 100%. Enquanto não fechar, o custo por kg abaixo está errado.`,
    peso_entrada: pesoEntrada,
    peso_apos_camara: r3(pesoAposCamara),
    quebra_camara_kg: quebraCamara,
    custo_total: r2(custoTotal),
    custo_aparente_por_kg: r2(custoTotal / pesoEntrada),
    pct_vendavel: r2(pctVendavel),
    pct_perda: r2(pctPerda),
    peso_vendavel: pesoVendavel,
    custo_real_por_kg: custoPorKgVendavel,
    // O quanto o custo real supera o aparente — o número que explica prejuízo escondido.
    diferenca_pct: r2(((custoPorKgVendavel / (custoTotal / pesoEntrada)) - 1) * 100),
    receita_esperada: receitaTotal,
    margem_atual_pct: margemReal,
    margem_alvo_pct: margemAlvo,
    receita_necessaria: receitaNecessaria,
    fator_reajuste: fator ? r3(fator) : null,
    cortes_sem_preco: cortesSemPreco,
    linhas: linhas.map(l => ({
      ...l,
      preco_sugerido: (fator && l.preco_atual != null) ? r2(l.preco_atual * fator) : null,
    })),
  };
}

module.exports = { analisarCarcaca, acharProduto, normalizar };
