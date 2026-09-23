// O prazo que o balcão pode esperar pela Focus NFe.
//
// Por que existe: o fetch do Node não tem timeout próprio de requisição — o padrão do undici é
// 300 s. Sem prazo, SEFAZ lenta ou Focus fora do ar congelava a venda por até CINCO MINUTOS,
// com o operador de mão parada e a fila atrás. Nada quebrava em teste porque uma chamada que
// demora não falha: ela só demora.
//
// Arquivo separado do fiscal.test.js porque focus-nfe.js lê o token e os prazos do ambiente no
// momento em que é exigido — lá ele precisa nascer SEM token, aqui precisa nascer COM.
process.env.FOCUS_NFE_TOKEN = 'token-de-teste';
process.env.FOCUS_TIMEOUT_MS = '120';
process.env.FOCUS_TIMEOUT_ARQUIVO_MS = '120';

const focus = require('../focus-nfe');

// Uma Focus que aceita a conexão e nunca responde — o caso "pendurada", que é pior que o
// "fora do ar": o fora do ar devolve erro na hora, o pendurado só fica.
function focusMuda() {
  global.fetch = (_url, opts) => new Promise((_resolve, reject) => {
    if (!opts || !opts.signal) return; // sem signal, fica pendurado para sempre — é o bug
    opts.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    });
  });
}

const fetchOriginal = global.fetch;
afterEach(() => { global.fetch = fetchOriginal; });

describe('Prazo de espera pela Focus NFe', () => {
  it('emissão pendurada desiste no prazo em vez de segurar a venda', async () => {
    focusMuda();
    const t0 = Date.now();
    await expect(focus.emitNFCe('ref-teste', {})).rejects.toMatchObject({ code: 'FOCUS_TIMEOUT' });
    // Generoso de propósito: o que importa é ter desistido, não o milissegundo exato.
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('download de DANFE pendurado também desiste', async () => {
    focusMuda();
    await expect(focus.baixarArquivo('https://api.focusnfe.com.br/danfes/x.html'))
      .rejects.toMatchObject({ code: 'FOCUS_TIMEOUT' });
  });

  it('a mensagem diz o que aconteceu, em segundos, para o operador entender', async () => {
    focusMuda();
    await expect(focus.emitNFCe('ref-teste', {})).rejects.toThrow(/não respondeu em \d+s/);
  });

  it('prazo estourado conta como SEFAZ indisponível — é o caso da contingência', () => {
    expect(focus.deveUsarContingencia({ code: 'FOCUS_TIMEOUT' })).toBe(true);
    expect(focus.deveUsarContingencia({ code: 'FOCUS_NETWORK_ERROR' })).toBe(true);
    // Nota recusada por dado errado NÃO é indisponibilidade: em contingência seria recusada
    // de novo na efetivação, com o cupom já na mão do cliente.
    expect(focus.deveUsarContingencia({ status: 422, data: { mensagem_sefaz: 'NCM inválido' } })).toBe(false);
  });

  it('queda de rede continua sendo erro de rede, não prazo estourado', async () => {
    global.fetch = () => Promise.reject(new Error('getaddrinfo ENOTFOUND api.focusnfe.com.br'));
    await expect(focus.emitNFCe('ref-teste', {})).rejects.toMatchObject({ code: 'FOCUS_NETWORK_ERROR' });
  });
});
