    /* ======================================================
       LOGIN — Rei das Carnes
       ======================================================
       Sem auto-cadastro e sem recuperação por e-mail: quem cria os acessos é o dono, em
       Equipe, e quem esquece a senha pede a ele uma provisória. A tela diz isso em vez de
       fingir que existe um "esqueci minha senha" que não leva a lugar nenhum.

       O que ela trata, além de usuário e senha:
         - Caps Lock ligado (a causa nº 1 de "minha senha não funciona" num PDV);
         - "manter conectado": sessão de 7 dias no computador da loja, 12 h sem marcar;
         - bloqueio por tentativas (429) com contagem regressiva em vez de um erro seco;
         - acesso desativado (403) com a explicação certa;
         - servidor fora (503 / sem rede) sem confundir com senha errada.
    ====================================================== */

    const LOGIN_ESTILOS = `
      .login-raiz { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); background: var(--bp-bg); }
      .login-marca { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; padding: 44px 48px;
        background: radial-gradient(1200px 600px at -10% -10%, rgba(212,165,116,0.22), transparent 60%), linear-gradient(160deg, #15100a 0%, #0f0f1e 55%, #0b0b16 100%); color: #f3ede4; }
      .login-marca::after { content: ""; position: absolute; inset: auto -120px -160px auto; width: 420px; height: 420px; border-radius: 50%;
        border: 1px solid rgba(212,165,116,0.18); box-shadow: inset 0 0 0 40px rgba(212,165,116,0.04); pointer-events: none; }
      .login-form-area { display: flex; align-items: center; justify-content: center; padding: 32px 20px; }
      .login-card { width: 100%; max-width: 420px; }
      .login-campo { width: 100%; padding: 13px 44px 13px 44px; border-radius: 12px; border: 1px solid var(--bp-border2); background: var(--bp-card);
        color: var(--bp-text); font-size: 15px; font-family: 'Inter', sans-serif; outline: none; transition: border-color .15s, box-shadow .15s; }
      .login-campo:focus { border-color: #d4a574; box-shadow: 0 0 0 3px rgba(212,165,116,0.18); }
      .login-campo.erro { border-color: #ef4444; }
      .login-icone { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--bp-text-faint); font-size: 14px; pointer-events: none; }
      .login-olho { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--bp-text-faint);
        cursor: pointer; width: 34px; height: 34px; border-radius: 8px; }
      .login-olho:hover { color: var(--bp-text); background: var(--bp-card); }
      .login-btn { width: 100%; padding: 14px 0; border-radius: 12px; border: none; font-weight: 700; font-size: 15px; font-family: 'Inter', sans-serif;
        background: linear-gradient(135deg, #d4a574, #8b7355); color: #1a1206; cursor: pointer; transition: transform .12s, opacity .15s, box-shadow .15s;
        box-shadow: 0 10px 28px -14px rgba(212,165,116,0.7); }
      .login-btn:hover:not(:disabled) { transform: translateY(-1px); }
      .login-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
      .login-check { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; color: var(--bp-text-muted); font-size: 13px; }
      .login-check input { width: 17px; height: 17px; accent-color: #d4a574; cursor: pointer; }
      .login-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: 10px; font-size: 13px; line-height: 1.45; }
      .login-marca-item { display: flex; gap: 12px; align-items: flex-start; }
      .login-marca-item i { width: 34px; height: 34px; border-radius: 9px; background: rgba(212,165,116,0.14); color: #d4a574; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
      @media (max-width: 860px) {
        .login-raiz { grid-template-columns: 1fr; }
        .login-marca { padding: 28px 24px 22px; }
        .login-marca-lista, .login-marca-rodape { display: none; }
        .login-form-area { padding: 24px 16px 40px; align-items: flex-start; }
      }
    `;

    // Lê o "RateLimit-Reset" (segundos até liberar) que o express-rate-limit devolve no 429.
    // Sem ele, chuta 60 s — melhor uma contagem aproximada do que "tente mais tarde" sem hora.
    function segundosAteLiberar(headers) {
      const v = Number(headers?.get?.('RateLimit-Reset'));
      return Number.isFinite(v) && v > 0 ? Math.ceil(v) : 60;
    }

    function useContagemRegressiva(ateQuando) {
      const [restante, setRestante] = useState(0);
      useEffect(() => {
        if (!ateQuando) { setRestante(0); return; }
        const tick = () => setRestante(Math.max(0, Math.ceil((ateQuando - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      }, [ateQuando]);
      return restante;
    }

    function LoginPage({ onLogin }) {
      const [login, setLogin] = useState('');
      const [senha, setSenha] = useState('');
      const [verSenha, setVerSenha] = useState(false);
      const [lembrar, setLembrar] = useState(false);
      const [erro, setErro] = useState(null);           // { tipo: 'credenciais'|'desativado'|'servidor'|'rede', texto }
      const [entrando, setEntrando] = useState(false);
      const [capsLock, setCapsLock] = useState(false);
      const [bloqueadoAte, setBloqueadoAte] = useState(null);
      const [marca, setMarca] = useState({ nome: 'Rei das Carnes', versao: '' });
      const [tocado, setTocado] = useState(false);
      const senhaRef = useRef(null);

      const restante = useContagemRegressiva(bloqueadoAte);
      const bloqueado = restante > 0;

      useEffect(() => {
        apiCall('GET', '/branding').then(res => { if (res.ok && res.data?.nome) setMarca(res.data); });
      }, []);
      useEffect(() => { if (!bloqueado && bloqueadoAte) { setBloqueadoAte(null); setErro(null); } }, [bloqueado]);

      const detectarCaps = (e) => {
        if (typeof e.getModifierState === 'function') setCapsLock(e.getModifierState('CapsLock'));
      };

      const loginValido = login.trim().length >= 3;
      const podeEnviar = loginValido && senha.length > 0 && !entrando && !bloqueado;

      const entrar = async (e) => {
        e.preventDefault();
        setTocado(true);
        if (!podeEnviar) return;
        setErro(null);
        setEntrando(true);
        const res = await apiCall('POST', '/auth/login', { email: login.trim().toLowerCase(), password: senha, remember: lembrar });
        setEntrando(false);

        if (res.ok) {
          saveSession(res.data.token, res.data.user, lembrar);
          onLogin(res.data.user);
          return;
        }
        if (res.status === 429) {
          setBloqueadoAte(Date.now() + segundosAteLiberar(res.headers) * 1000);
          setErro({ tipo: 'bloqueio', texto: 'Muitas tentativas seguidas. Por segurança, o acesso ficou pausado por alguns minutos.' });
          return;
        }
        if (res.status === 403 && res.data?.code === 'usuario_desativado') {
          setErro({ tipo: 'desativado', texto: 'Este acesso foi desativado. Fale com o dono do açougue para reativar.' });
          return;
        }
        if (res.status === 0) {
          setErro({ tipo: 'rede', texto: 'Sem conexão com o servidor. Confira a internet da loja e tente de novo.' });
          return;
        }
        if (res.status >= 500) {
          setErro({ tipo: 'servidor', texto: 'O sistema está indisponível neste momento. Aguarde alguns instantes e tente de novo.' });
          return;
        }
        setErro({ tipo: 'credenciais', texto: res.data?.error || 'Usuário ou senha incorretos.' });
        setSenha('');
        senhaRef.current?.focus();
      };

      const corErro = { credenciais: '#ef4444', desativado: '#f59e0b', bloqueio: '#f59e0b', servidor: '#f59e0b', rede: '#f59e0b' };
      const iconeErro = { credenciais: 'fa-circle-exclamation', desativado: 'fa-user-lock', bloqueio: 'fa-hourglass-half', servidor: 'fa-server', rede: 'fa-wifi' };

      return (
        <div className="login-raiz">
          <style>{LOGIN_ESTILOS}</style>

          <section className="login-marca" aria-label="Sobre o sistema">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 34 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #d4a574, #8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px -14px rgba(212,165,116,0.9)' }}>
                  <i className="fas fa-drumstick-bite" style={{ color: '#1a1206', fontSize: 18 }}></i>
                </div>
                <div>
                  <div className="syne" style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.05 }}>
                    {marca.nome === 'Rei das Carnes'
                      ? <span>REI DAS <span style={{ color: '#d4a574' }}>CARNES</span></span>
                      : <span>{marca.nome}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(243,237,228,0.55)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Sistema de gestão do açougue</div>
                </div>
              </div>

              <h1 className="syne" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: -0.6, margin: '0 0 14px', maxWidth: 520 }}>
                O balcão, o fiscal e o estoque<br />no mesmo lugar.
              </h1>
              <p style={{ color: 'rgba(243,237,228,0.7)', fontSize: 14.5, lineHeight: 1.6, margin: 0, maxWidth: 460 }}>
                Entre com o usuário que o dono do açougue criou para você.
              </p>

              <div className="login-marca-lista" style={{ display: 'grid', gap: 16, marginTop: 38, maxWidth: 440 }}>
                {[
                  ['fa-cash-register', 'Caixa com leitor de balança', 'Bipou a etiqueta, o peso e o preço já entram. Troco, desconto e pagamento dividido.'],
                  ['fa-file-invoice', 'NFC-e a cada venda', 'Emissão, consulta e cancelamento pela Focus NFe, com contingência quando a SEFAZ cai.'],
                  ['fa-scale-balanced', 'Rendimento de carcaça', 'O custo real do quilo vendável — não o da compra, que esconde 30% de perda.'],
                ].map(([icone, titulo, texto]) => (
                  <div className="login-marca-item" key={titulo}>
                    <i className={`fas ${icone}`}></i>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{titulo}</div>
                      <div style={{ fontSize: 12.5, color: 'rgba(243,237,228,0.6)', lineHeight: 1.5 }}>{texto}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="login-marca-rodape" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'rgba(243,237,228,0.45)', marginTop: 32 }}>
              <span>© {new Date().getFullYear()} {marca.nome}</span>
              {marca.versao && <span className="mono">v{marca.versao}</span>}
            </div>
          </section>

          <section className="login-form-area">
            <form onSubmit={entrar} className="login-card" noValidate>
              <div style={{ marginBottom: 26 }}>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: -0.3 }}>Entrar</h2>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13.5, margin: 0 }}>Use o seu usuário e a sua senha. O acesso é individual.</p>
              </div>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ display: 'block', color: 'var(--bp-text-muted)', fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>Usuário</span>
                <div style={{ position: 'relative' }}>
                  <i className="fas fa-user login-icone" aria-hidden="true"></i>
                  <input
                    className={`login-campo${tocado && !loginValido ? ' erro' : ''}`}
                    value={login}
                    onChange={e => setLogin(e.target.value)}
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="seu usuário"
                    disabled={entrando}
                    aria-invalid={tocado && !loginValido}
                  />
                </div>
                {tocado && !loginValido && <span style={{ display: 'block', color: '#ef4444', fontSize: 12, marginTop: 6 }}>Informe o usuário (ao menos 3 caracteres).</span>}
              </label>

              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ display: 'block', color: 'var(--bp-text-muted)', fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>Senha</span>
                <div style={{ position: 'relative' }}>
                  <i className="fas fa-lock login-icone" aria-hidden="true"></i>
                  <input
                    ref={senhaRef}
                    className={`login-campo${erro?.tipo === 'credenciais' ? ' erro' : ''}`}
                    type={verSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    onKeyDown={detectarCaps}
                    onKeyUp={detectarCaps}
                    onBlur={() => setCapsLock(false)}
                    autoComplete="current-password"
                    placeholder="sua senha"
                    disabled={entrando}
                  />
                  <button type="button" className="login-olho" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} title={verSenha ? 'Ocultar senha' : 'Mostrar senha'} tabIndex={-1}>
                    <i className={`fas ${verSenha ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </label>

              {capsLock && (
                <div className="login-aviso" role="status" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', marginBottom: 12 }}>
                  <i className="fas fa-arrow-up-from-bracket" style={{ marginTop: 2 }}></i>
                  <span><strong>Caps Lock está ligado.</strong> A senha diferencia maiúsculas de minúsculas.</span>
                </div>
              )}

              <label className="login-check" style={{ margin: '10px 0 22px' }}>
                <input type="checkbox" checked={lembrar} onChange={e => setLembrar(e.target.checked)} disabled={entrando} />
                <span>Manter conectado neste computador <span style={{ color: 'var(--bp-text-faint)' }}>(7 dias)</span></span>
              </label>

              {erro && (
                <div className="login-aviso" role="alert" style={{ background: `${corErro[erro.tipo]}1a`, border: `1px solid ${corErro[erro.tipo]}59`, color: corErro[erro.tipo], marginBottom: 16 }}>
                  <i className={`fas ${iconeErro[erro.tipo]}`} style={{ marginTop: 2 }}></i>
                  <span>
                    {erro.texto}
                    {erro.tipo === 'bloqueio' && bloqueado && <strong style={{ display: 'block', marginTop: 4 }}>Libera em {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, '0')}</strong>}
                  </span>
                </div>
              )}

              <button type="submit" className="login-btn" disabled={!podeEnviar && (entrando || bloqueado)}>
                {entrando ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>Entrando...</span>
                  : bloqueado ? `Aguarde ${restante}s`
                  : <span>Entrar<i className="fas fa-arrow-right" style={{ marginLeft: 8, fontSize: 13 }}></i></span>}
              </button>

              <div style={{ marginTop: 22, padding: '12px 14px', borderRadius: 10, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', color: 'var(--bp-text-faint)', fontSize: 12.5, lineHeight: 1.5, display: 'flex', gap: 10 }}>
                <i className="fas fa-circle-question" style={{ marginTop: 2, color: 'var(--bp-text-muted)' }}></i>
                <span>
                  <strong style={{ color: 'var(--bp-text-muted)' }}>Esqueceu a senha?</strong> Peça ao dono do açougue uma senha provisória
                  em <em>Equipe e Acessos</em>. No próximo login o sistema pede uma senha nova.
                </span>
              </div>
            </form>
          </section>
        </div>
      );
    }

    /* Regras da senha, espelhando problemasDaSenha() do servidor — a checagem que vale é a de lá. */
    const REGRAS_SENHA = [
      { id: 'tam', rotulo: 'Ao menos 8 caracteres', ok: s => s.length >= 8 },
      { id: 'letra', rotulo: 'Uma letra', ok: s => /[a-zA-Z]/.test(s) },
      { id: 'num', rotulo: 'Um número', ok: s => /[0-9]/.test(s) },
    ];

    function ChecklistSenha({ senha, confirma }) {
      const itens = [...REGRAS_SENHA.map(r => ({ ...r, ok: r.ok(senha) })), { id: 'igual', rotulo: 'As duas senhas iguais', ok: senha.length > 0 && senha === confirma }];
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 16px', display: 'grid', gap: 6 }}>
          {itens.map(it => (
            <li key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: it.ok ? '#10b981' : 'var(--bp-text-faint)' }}>
              <i className={`fas ${it.ok ? 'fa-circle-check' : 'fa-circle'}`} style={{ fontSize: it.ok ? 13 : 7, width: 14, textAlign: 'center' }}></i>{it.rotulo}
            </li>
          ))}
        </ul>
      );
    }

    /* Troca obrigatória no primeiro acesso (senha provisória entregue pelo dono). Usa a rota
       autenticada PUT /auth/password — sem senha atual, porque a provisória acabou de ser
       conferida no login desta sessão. Enquanto não trocar, o servidor recusa todas as outras
       rotas (403 senha_provisoria), então não adianta fechar esta tela. */
    function ForcePasswordChange({ user, onChanged, onLogout }) {
      const [nova, setNova] = useState('');
      const [confirma, setConfirma] = useState('');
      const [ver, setVer] = useState(false);
      const [erro, setErro] = useState('');
      const [salvando, setSalvando] = useState(false);

      const tudoOk = REGRAS_SENHA.every(r => r.ok(nova)) && nova === confirma;

      const salvar = async (e) => {
        e.preventDefault();
        if (!tudoOk) { setErro('Confira os itens da lista antes de salvar.'); return; }
        setErro('');
        setSalvando(true);
        const res = await apiCall('PUT', '/auth/password', { new_password: nova });
        setSalvando(false);
        if (!res.ok) { setErro(res.data?.error || 'Não foi possível trocar a senha.'); return; }
        updateStoredUser({ must_change_password: false });
        onChanged({ ...user, must_change_password: false });
      };

      const campo = (rotulo, valor, set, autoComplete) => (
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', color: 'var(--bp-text-muted)', fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>{rotulo}</span>
          <div style={{ position: 'relative' }}>
            <i className="fas fa-key login-icone" aria-hidden="true"></i>
            <input className="login-campo" type={ver ? 'text' : 'password'} value={valor} onChange={e => set(e.target.value)} autoComplete={autoComplete} disabled={salvando} />
          </div>
        </label>
      );

      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bp-bg)' }}>
          <style>{LOGIN_ESTILOS}</style>
          <form onSubmit={salvar} style={{ width: '100%', maxWidth: 440, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 18, padding: '30px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(212,165,116,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-shield-halved" style={{ color: '#d4a574', fontSize: 17 }}></i>
              </div>
              <div>
                <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: 0 }}>Crie a sua senha</p>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12.5, margin: 0 }}>Olá, {(user.name || '').split(' ')[0]}. A senha provisória vale só para este primeiro acesso.</p>
              </div>
            </div>

            {campo('Nova senha', nova, setNova, 'new-password')}
            {campo('Confirme a nova senha', confirma, setConfirma, 'new-password')}

            <label className="login-check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={ver} onChange={e => setVer(e.target.checked)} />
              <span>Mostrar as senhas</span>
            </label>

            <ChecklistSenha senha={nova} confirma={confirma} />

            {erro && (
              <div className="login-aviso" role="alert" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', marginBottom: 14 }}>
                <i className="fas fa-circle-exclamation" style={{ marginTop: 2 }}></i><span>{erro}</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={salvando || !tudoOk} style={{ marginBottom: 10 }}>
              {salvando ? 'Salvando...' : 'Salvar e entrar'}
            </button>
            <button type="button" onClick={onLogout} style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: '1px solid var(--bp-border2)', background: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 13.5, fontFamily: 'Inter, sans-serif' }}>
              Sair
            </button>
          </form>
        </div>
      );
    }
