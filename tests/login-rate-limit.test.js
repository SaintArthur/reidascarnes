// O limite de tentativas de login, num arquivo SÓ dele — e o motivo importa.
//
// O limite é por IP, não por usuário. Estourá-lo dentro do arquivo de autenticação derrubava
// todos os testes seguintes com 429, inclusive os que nada tinham a ver com isso: o primeiro a
// rodar passava e os treze depois dele falhavam. O Jest dá registro de módulos novo a cada
// arquivo, então aqui o `app` nasce com o contador zerado e não contamina ninguém.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-mais-de-24-caracteres';
process.env.FOCUS_NFE_TOKEN = '';

const request = require('supertest');
const { app, initDatabase, pool } = require('../server');

beforeAll(async () => { await initDatabase(); }, 30000);
afterAll(async () => { await pool.end(); });

describe('Limite de tentativas de login', () => {
  it('depois de insistir com a senha errada, responde 429 e diz quando libera', async () => {
    const login = `ninguem-${Date.now().toString(36)}`;
    let res = null;
    // O limite configurado é 10 por 15 min; 12 tentativas garantem passar dele.
    for (let i = 0; i < 12 && res?.status !== 429; i++) {
      res = await request(app).post('/api/auth/login').send({ email: login, password: 'errada-de-proposito' });
    }
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('muitas_tentativas');
    // A tela de login lê este cabeçalho para mostrar a contagem regressiva em vez de um
    // "tente mais tarde" sem hora.
    expect(Number(res.headers['ratelimit-reset'])).toBeGreaterThan(0);
  }, 30000);
});
