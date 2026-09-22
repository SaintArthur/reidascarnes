// Autenticação, papéis e equipe — o contrato que a tela de login e a tela de Equipe dependem.
//
// Roda contra um Postgres real (DATABASE_URL), como o sistema. Não emite nota fiscal: nenhuma
// rota de venda é chamada além de abrir a gaveta, que é o teste de que o caixa alcança o balcão.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-mais-de-24-caracteres';
process.env.FOCUS_NFE_TOKEN = '';

const request = require('supertest');
const { app, initDatabase, pool } = require('../server');

const SENHA_DONO = 'Dono12345';
const sufixo = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => { await initDatabase(); }, 30000);
afterAll(async () => { await pool.end(); });

const login = (email, password, extra = {}) => request(app).post('/api/auth/login').send({ email, password, ...extra });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// O dono padrão nasce com senha provisória obrigatória; num banco reaproveitado ela já pode ter
// sido trocada por uma rodada anterior. Os dois caminhos levam ao mesmo lugar: sessão de dono
// com a senha conhecida deste arquivo.
async function entrarComoDono() {
  let res = await login('reidascarnes', 'reidascarnes');
  if (res.status === 401) res = await login('reidascarnes', SENHA_DONO);
  expect(res.status).toBe(200);
  if (res.body.user.must_change_password) {
    const troca = await request(app).put('/api/auth/password').set(auth(res.body.token)).send({ new_password: SENHA_DONO });
    expect(troca.status).toBe(200);
  }
  return res.body.token;
}

describe('Login', () => {
  it('a rota pública de reset de senha não existe mais', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ email: 'reidascarnes', newPassword: 'Hackeada123' });
    expect(res.status).toBe(404);
  });

  it('senha errada e usuário inexistente respondem a MESMA coisa — não se descobre quem existe', async () => {
    const errada = await login('reidascarnes', 'senha-que-nao-e');
    const inexistente = await login(`ninguem-${sufixo()}`, 'qualquer-coisa');
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body).toEqual(inexistente.body);
  });

  it('entra com o dono e o servidor diz o papel', async () => {
    const token = await entrarComoDono();
    const me = await request(app).get('/api/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('dono');
    expect(me.body.role_label).toBe('Dono');
    expect(me.body.must_change_password).toBe(false);
  });

  it('"manter conectado" vale mais tempo que o login comum', async () => {
    const curto = await login('reidascarnes', SENHA_DONO);
    const longo = await login('reidascarnes', SENHA_DONO, { remember: true });
    const exp = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).exp;
    expect(exp(longo.body.token) - exp(curto.body.token)).toBeGreaterThan(24 * 3600);
  });

  it('Sair revoga a sessão de verdade: o mesmo token para de valer', async () => {
    const res = await login('reidascarnes', SENHA_DONO);
    const token = res.body.token;
    expect((await request(app).get('/api/me').set(auth(token))).status).toBe(200);
    expect((await request(app).post('/api/auth/logout').set(auth(token))).status).toBe(200);
    const depois = await request(app).get('/api/me').set(auth(token));
    expect(depois.status).toBe(401);
    expect(depois.body.code).toBe('sessao_encerrada');
  });

  it('trocar a senha derruba as OUTRAS sessões e mantém a atual', async () => {
    const a = (await login('reidascarnes', SENHA_DONO)).body.token;
    const b = (await login('reidascarnes', SENHA_DONO)).body.token;
    const troca = await request(app).put('/api/auth/password').set(auth(a)).send({ old_password: SENHA_DONO, new_password: 'Dono12345x' });
    expect(troca.status).toBe(200);
    expect((await request(app).get('/api/me').set(auth(b))).status).toBe(401);
    expect((await request(app).get('/api/me').set(auth(a))).status).toBe(200);
    // volta a senha conhecida
    expect((await request(app).put('/api/auth/password').set(auth(a)).send({ old_password: 'Dono12345x', new_password: SENHA_DONO })).status).toBe(200);
  });

  it('senha fraca e senha atual errada são 400 (não 401, que o front trata como logout)', async () => {
    const token = (await login('reidascarnes', SENHA_DONO)).body.token;
    const fraca = await request(app).put('/api/auth/password').set(auth(token)).send({ old_password: SENHA_DONO, new_password: 'abc' });
    expect(fraca.status).toBe(400);
    expect(fraca.body.code).toBe('senha_fraca');
    const atualErrada = await request(app).put('/api/auth/password').set(auth(token)).send({ old_password: 'nao-e-essa', new_password: 'Valida12345' });
    expect(atualErrada.status).toBe(400);
    expect(atualErrada.body.code).toBe('senha_atual_incorreta');
  });

  it('branding é público e não vaza nada além do nome e da versão', async () => {
    const res = await request(app).get('/api/branding');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['nome', 'versao']);
  });
});

describe('Equipe e papéis', () => {
  let dono, caixa, caixaLogin, caixaToken;

  beforeAll(async () => { dono = await entrarComoDono(); });

  it('o dono cria um caixa e recebe a senha provisória uma única vez', async () => {
    caixaLogin = `caixa-${sufixo()}`;
    const res = await request(app).post('/api/usuarios').set(auth(dono)).send({ name: 'Maria do Caixa', login: caixaLogin, role: 'caixa' });
    expect(res.status).toBe(201);
    expect(res.body.senha_provisoria).toMatch(/^[A-Za-z0-9]{10}$/);
    caixa = res.body;
    const lista = await request(app).get('/api/usuarios').set(auth(dono));
    const linha = lista.body.find(u => u.id === caixa.id);
    expect(linha.must_change_password).toBe(true);
    expect(linha.role_label).toBe('Caixa');
  });

  it('com a senha provisória, o caixa só consegue trocá-la — o resto responde 403', async () => {
    const res = await login(caixaLogin, caixa.senha_provisoria);
    expect(res.status).toBe(200);
    expect(res.body.user.must_change_password).toBe(true);
    const bloqueado = await request(app).get('/api/acougue/products').set(auth(res.body.token));
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.code).toBe('senha_provisoria');
    const troca = await request(app).put('/api/auth/password').set(auth(res.body.token)).send({ new_password: 'Caixa12345' });
    expect(troca.status).toBe(200);
    caixaToken = res.body.token;
    expect((await request(app).get('/api/acougue/products').set(auth(caixaToken))).status).toBe(200);
  });

  it('o caixa alcança o balcão, mas não o que é do dono', async () => {
    expect((await request(app).get('/api/acougue/settings').set(auth(caixaToken))).status).toBe(200);
    expect((await request(app).get('/api/acougue/cash-session').set(auth(caixaToken))).status).toBe(200);
    for (const [metodo, rota] of [
      ['patch', '/api/acougue/settings'], ['get', '/api/acougue/reports'], ['get', '/api/acougue/dashboard'],
      ['get', '/api/usuarios'], ['post', '/api/acougue/products'], ['get', '/api/acougue/sped/efd-icms-ipi'],
    ]) {
      const res = await request(app)[metodo](rota).set(auth(caixaToken)).send({});
      expect(`${metodo} ${rota} → ${res.status}`).toBe(`${metodo} ${rota} → 403`);
      expect(res.body.code).toBe('sem_permissao');
    }
  });

  it('o dono não se desativa nem se rebaixa, e a loja não fica sem dono', async () => {
    const eu = (await request(app).get('/api/me').set(auth(dono))).body;
    expect((await request(app).patch(`/api/usuarios/${eu.id}`).set(auth(dono)).send({ active: false })).status).toBe(400);
    expect((await request(app).patch(`/api/usuarios/${eu.id}`).set(auth(dono)).send({ role: 'caixa' })).status).toBe(400);
    const lista = (await request(app).get('/api/usuarios').set(auth(dono))).body;
    const outrosDonos = lista.filter(u => u.role === 'dono' && u.active && u.id !== eu.id);
    for (const d of outrosDonos) await request(app).patch(`/api/usuarios/${d.id}`).set(auth(dono)).send({ role: 'caixa' });
    // agora eu sou o único dono ativo: ninguém — nem eu — pode me tirar daqui
    expect((await request(app).patch(`/api/usuarios/${eu.id}`).set(auth(dono)).send({ role: 'caixa' })).status).toBe(400);
    for (const d of outrosDonos) await request(app).patch(`/api/usuarios/${d.id}`).set(auth(dono)).send({ role: 'dono' });
  });

  it('senha provisória gerada pelo dono derruba as sessões do caixa e obriga a troca', async () => {
    const res = await request(app).post(`/api/usuarios/${caixa.id}/resetar-senha`).set(auth(dono));
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/me').set(auth(caixaToken))).status).toBe(401);
    const novo = await login(caixaLogin, res.body.senha_provisoria);
    expect(novo.status).toBe(200);
    expect(novo.body.user.must_change_password).toBe(true);
    expect((await request(app).put('/api/auth/password').set(auth(novo.body.token)).send({ new_password: 'Caixa12345' })).status).toBe(200);
    caixaToken = novo.body.token;
  });

  it('desativar derruba a sessão na hora e o login passa a ser recusado', async () => {
    expect((await request(app).patch(`/api/usuarios/${caixa.id}`).set(auth(dono)).send({ active: false })).status).toBe(200);
    const sessao = await request(app).get('/api/me').set(auth(caixaToken));
    expect(sessao.status).toBe(403);
    expect(sessao.body.code).toBe('usuario_desativado');
    const tentativa = await login(caixaLogin, 'Caixa12345');
    expect(tentativa.status).toBe(403);
    expect(tentativa.body.code).toBe('usuario_desativado');
    expect((await request(app).post(`/api/usuarios/${caixa.id}/resetar-senha`).set(auth(dono))).status).toBe(400);
  });

  it('o histórico de acessos conta a história inteira', async () => {
    const res = await request(app).get('/api/usuarios/acessos').set(auth(dono));
    expect(res.status).toBe(200);
    const eventos = res.body.filter(e => e.login === caixaLogin || (e.detalhe || '').includes(caixaLogin) || (e.detalhe || '').includes('Maria do Caixa')).map(e => e.evento);
    for (const esperado of ['usuario_criado', 'login', 'senha_alterada', 'senha_provisoria_gerada', 'usuario_desativado', 'login_recusado_inativo']) {
      expect(eventos).toContain(esperado);
    }
    expect(res.body.every(e => e.user_agent === undefined)).toBe(true);
  });

  it('login inválido demais vezes seguidas leva 429', async () => {
    let ultimo = null;
    for (let i = 0; i < 12 && ultimo !== 429; i++) ultimo = (await login('reidascarnes', 'errada-de-proposito')).status;
    expect(ultimo).toBe(429);
  });
});

describe('Health', () => {
  afterEach(() => jest.restoreAllMocks());

  it('com o banco respondendo: 200 e db ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
  });

  it('com o banco fora: 503, e é isso que tira a instância do ALB', async () => {
    jest.spyOn(pool, 'query').mockRejectedValue(new Error('connect ECONNREFUSED'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.db).toBe('erro');
  });
});
