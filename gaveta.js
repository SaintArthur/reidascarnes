// ─── Abertura da gaveta de dinheiro ───────────────────────────────────────────
//
// A gaveta não tem conexão própria com o computador: ela é ligada por um cabo RJ11/RJ12 na
// impressora térmica, e abre quando a impressora recebe um pulso elétrico. Ou seja, quem abre
// a gaveta é a IMPRESSORA — o sistema só manda o comando ESC/POS para ela.
//
// O comando é `ESC p m t1 t2` (0x1B 0x70 ...):
//   m  = qual pino aciona (0 = pino 2, 1 = pino 5; depende de como a gaveta foi ligada)
//   t1 = tempo com o pulso ligado, em unidades de 2 ms
//   t2 = tempo desligado depois, em unidades de 2 ms
//
// LIMITE ARQUITETURAL: isto só funciona se o servidor ALCANÇAR a impressora pela rede. A
// GS-FJ80H-UE do Rei das Carnes tem porta de rede, então um servidor DENTRO da loja fala com
// ela direto. Com o sistema na nuvem, a impressora está atrás do roteador do açougue e não é
// alcançável — nesse cenário a gaveta só abre pelo caminho do navegador (o cupom impresso
// carregando o pulso), que depende do driver da impressora repassar bytes crus.

const net = require('net');

const PADRAO = { pino: 0, tempoLigado: 25, tempoDesligado: 250, porta: 9100, timeoutMs: 3000 };

// Monta o pulso. Os tempos vêm em milissegundos e viram unidades de 2 ms, limitadas a 255
// porque o byte não comporta mais — mandar acima disso faria a impressora ler lixo.
function comandoAbertura({ pino = PADRAO.pino, tempoLigado = PADRAO.tempoLigado, tempoDesligado = PADRAO.tempoDesligado } = {}) {
  const emUnidades = (ms) => Math.max(1, Math.min(255, Math.round(ms / 2)));
  return Buffer.from([0x1B, 0x70, pino === 1 ? 1 : 0, emUnidades(tempoLigado), emUnidades(tempoDesligado)]);
}

// Envia o pulso para a impressora de rede.
function abrirGaveta({ ip, porta = PADRAO.porta, pino, tempoLigado, tempoDesligado, timeoutMs = PADRAO.timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    if (!ip) {
      const e = new Error('Endereço da impressora não configurado. Preencha em Configurações.');
      e.code = 'IMPRESSORA_NAO_CONFIGURADA';
      return reject(e);
    }

    const socket = new net.Socket();
    let respondido = false;
    const encerrar = (fn, arg) => {
      if (respondido) return;
      respondido = true;
      socket.destroy();
      fn(arg);
    };

    // Sem timeout explícito, uma impressora desligada deixaria a requisição pendurada e o
    // operador travado no caixa esperando uma gaveta que não vai abrir.
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      const e = new Error(`A impressora em ${ip}:${porta} não respondeu. Verifique se está ligada e na mesma rede.`);
      e.code = 'IMPRESSORA_SEM_RESPOSTA';
      encerrar(reject, e);
    });
    socket.on('error', (err) => {
      const e = new Error(`Não consegui falar com a impressora em ${ip}:${porta}: ${err.message}`);
      e.code = 'IMPRESSORA_INACESSIVEL';
      encerrar(reject, e);
    });

    socket.connect(porta, ip, () => {
      socket.write(comandoAbertura({ pino, tempoLigado, tempoDesligado }), () => {
        // A impressora não confirma a abertura: ela recebe o pulso e aciona o solenoide. Não
        // existe leitura de volta dizendo "a gaveta abriu" — por isso o sucesso aqui significa
        // "o comando chegou", não "a gaveta está aberta".
        encerrar(resolve, { enviado: true, ip, porta });
      });
    });
  });
}

function configDeSettings(settings = {}) {
  const inteiro = (v, padrao) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : padrao;
  };
  return {
    ativa: settings.gaveta_ativa === 'true',
    ip: (settings.impressora_ip || '').trim() || null,
    porta: inteiro(settings.impressora_porta, PADRAO.porta),
    pino: settings.gaveta_pino === '1' ? 1 : 0,
    tempoLigado: inteiro(settings.gaveta_tempo_ligado, PADRAO.tempoLigado),
    tempoDesligado: inteiro(settings.gaveta_tempo_desligado, PADRAO.tempoDesligado),
    // Abrir sozinha só faz sentido quando entra dinheiro: em cartão ou PIX não há troco a
    // dar nem cédula a guardar, e abrir à toa expõe o caixa.
    abrirNoDinheiro: settings.gaveta_auto_dinheiro !== 'false',
  };
}

module.exports = { abrirGaveta, comandoAbertura, configDeSettings, PADRAO };
