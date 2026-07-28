// ─── Leitura de etiqueta de balança (EAN-13 com peso/preço embutido) ──────────
// Numa balança etiquetadora de açougue (Toledo, Filizola, Urano...) a etiqueta colada no
// pacote NÃO é um EAN comum: o próprio código carrega quanto aquele pacote pesa. Um EAN-13
// de balança tem esta cara:
//
//     2 000012 00588 4
//     │ │      │     └─ dígito verificador (DV)
//     │ │      └─ VALOR: peso em gramas (00588 = 0,588 kg) ou preço em centavos
//     │ └─ CÓDIGO do produto na balança (PLU) — o que liga a etiqueta ao cadastro
//     └─ PREFIXO de balança (2 no padrão brasileiro; a faixa 20-29 é reservada
//        justamente para uso interno da loja, então nunca conflita com EAN de fábrica)
//
// Quantos dígitos vão pra cada parte varia conforme a programação DA BALANÇA — não existe
// um padrão único. Por isso o layout é configurável (settings `acougue_scale_*`) em vez de
// ficar chumbado aqui: quem instala confere numa etiqueta real e ajusta.
//
// O DV é validado sempre. Ele não depende do layout configurado (é calculado sobre os 12
// primeiros dígitos, seja qual for o significado deles), então serve como rede de segurança
// contra leitura torta do bipador — o que importa num caixa, onde um dígito trocado viraria
// preço errado no cupom.

// Layout conferido numa etiqueta real da balança do Rei das Carnes (28/07/2026):
//
//     alcatra / PESO LÍQ. 0,588kg / R$/kg 59,90 / TOTAL R$ 35,22
//     código: 2 000700 03522 5   →  PLU 700, valor 3522 = R$ 35,22
//
// Ou seja: esta balança grava o PREÇO TOTAL em centavos, não o peso. O peso é deduzido no
// servidor dividindo pelo R$/kg do cadastro. As três partes configuráveis SEMPRE têm que
// somar 12 (os 13 do EAN menos o DV) — `parseScaleBarcode` recusa layouts que não fecham,
// em vez de decodificar valor errado.
const DEFAULT_CONFIG = {
  prefix: '2',
  codeDigits: 6,
  valueDigits: 5,
  valueType: 'preco_centavos', // 'peso_g' = gramas | 'preco_centavos' = centavos
};

// DV do EAN-13: pesos alternados 1 e 3 sobre os 12 primeiros dígitos, da esquerda pra direita.
function ean13CheckDigit(twelveDigits) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelveDigits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

// Monta a config a partir das settings do banco, caindo no padrão quando a chave não existe
// ou veio com valor inválido (settings são texto livre — não dá pra confiar cegamente).
// Recebe o mapa já SEM o prefixo `acougue_`, como `getAcougueSettingsMap()` devolve.
function configFromSettings(settings = {}) {
  const asInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  const prefix = String(settings.scale_prefix ?? DEFAULT_CONFIG.prefix).trim();
  return {
    prefix: /^\d{1,2}$/.test(prefix) ? prefix : DEFAULT_CONFIG.prefix,
    codeDigits: asInt(settings.scale_code_digits, DEFAULT_CONFIG.codeDigits),
    valueDigits: asInt(settings.scale_value_digits, DEFAULT_CONFIG.valueDigits),
    valueType: settings.scale_value_type === 'preco_centavos' ? 'preco_centavos' : DEFAULT_CONFIG.valueType,
  };
}

// Decodifica um código lido pelo bipador.
//
// Retorna `null` quando NÃO é etiqueta de balança (EAN de fábrica, código interno digitado
// à mão etc.) — nesse caso quem chama deve seguir com a busca normal por código de barras.
// Lança erro quando É etiqueta de balança mas veio corrompida, porque aí seguir adiante
// silenciosamente registraria peso errado na venda.
function parseScaleBarcode(rawCode, config = DEFAULT_CONFIG) {
  const code = String(rawCode || '').trim();
  const { prefix, codeDigits, valueDigits, valueType } = config;

  if (!/^\d{13}$/.test(code)) return null;
  if (!code.startsWith(prefix)) return null;

  // Layout incoerente com o EAN-13 (prefixo + código + valor + DV têm que fechar 13 dígitos).
  // É erro de configuração, não de leitura — avisa em vez de decodificar errado.
  if (prefix.length + codeDigits + valueDigits + 1 !== 13) {
    const err = new Error(
      `Layout de etiqueta de balança inválido: prefixo(${prefix.length}) + código(${codeDigits}) + valor(${valueDigits}) + DV(1) = ` +
      `${prefix.length + codeDigits + valueDigits + 1} dígitos, mas um EAN-13 tem 13. Ajuste em Configurações.`
    );
    err.code = 'SCALE_LAYOUT_INVALID';
    throw err;
  }

  if (!isValidEan13(code)) {
    const err = new Error('Código de balança com dígito verificador inválido — refaça a leitura da etiqueta.');
    err.code = 'SCALE_CHECKSUM_INVALID';
    throw err;
  }

  const scaleCode = code.slice(prefix.length, prefix.length + codeDigits);
  const rawValue = Number(code.slice(prefix.length + codeDigits, 12));

  return {
    type: 'scale',
    barcode: code,
    // Sem zeros à esquerda: a balança preenche o campo com zeros, mas o PLU cadastrado
    // costuma ser digitado como "12" e não "00012".
    scaleCode: String(Number(scaleCode)),
    scaleCodePadded: scaleCode,
    valueType,
    // Só um dos dois vem preenchido, conforme a programação da balança.
    weightKg: valueType === 'peso_g' ? rawValue / 1000 : null,
    priceReais: valueType === 'preco_centavos' ? rawValue / 100 : null,
  };
}

module.exports = { parseScaleBarcode, configFromSettings, isValidEan13, ean13CheckDigit, DEFAULT_CONFIG };
