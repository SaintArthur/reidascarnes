    /* ======================================================
       LOGIN — Rei das Carnes
       ======================================================
       Sem multi-idioma, sem auto-cadastro e sem recuperação de senha: os usuários são
       criados pelo dono e o acesso é só da equipe do balcão.
    ====================================================== */
    function LoginPage({ onLogin }) {
      const [email, setEmail] = useState('');
      const [senha, setSenha] = useState('');
      const [verSenha, setVerSenha] = useState(false);
      const [erro, setErro] = useState('');
      const [entrando, setEntrando] = useState(false);

      const entrar = async (e) => {
        e.preventDefault();
        setErro('');
        setEntrando(true);
        const res = await apiCall('POST', '/auth/login', { email: email.trim(), password: senha });
        setEntrando(false);
        if (!res.ok) { setErro(res.data?.error || 'Não foi possível entrar. Confira usuário e senha.'); return; }
        // O login do açougue aceita usuário simples (não precisa ter formato de e-mail).
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        onLogin(res.data.user);
      };

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, background: 'var(--bp-bg)',
        }}>
          <form onSubmit={entrar} style={{
            width: '100%', maxWidth: 400, background: 'var(--bp-panel)',
            border: '1px solid var(--bp-border)', borderRadius: 18, padding: '36px 28px',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 26 }}>
              <div className="syne" style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
                <span style={{ color: 'var(--bp-text)' }}>REI DAS </span>
                <span style={{ color: 'var(--bp-accent)' }}>CARNES</span>
              </div>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '6px 0 0' }}>Sistema de gestão do açougue</p>
            </div>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 6 }}>Usuário</span>
              <input value={email} onChange={e => setEmail(e.target.value)} autoFocus autoComplete="username"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 15, boxSizing: 'border-box' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 18 }}>
              <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 6 }}>Senha</span>
              <div style={{ position: 'relative' }}>
                <input type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password"
                  style={{ width: '100%', padding: '12px 42px 12px 14px', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 15, boxSizing: 'border-box' }} />
                <button type="button" onClick={() => setVerSenha(v => !v)} aria-label="Mostrar senha"
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer' }}>
                  <i className={`fas ${verSenha ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </label>

            {erro && (
              <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-circle-exclamation"></i>{erro}
              </p>
            )}

            <button type="submit" disabled={entrando || !email || !senha} style={{
              width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', cursor: entrando ? 'wait' : 'pointer',
              background: 'var(--bp-accent)', color: '#1a1206', fontWeight: 700, fontSize: 15,
              opacity: (entrando || !email || !senha) ? 0.6 : 1,
            }}>
              {entrando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      );
    }

    /* Troca obrigatória de senha no primeiro acesso de um usuário criado pelo dono. */
    function ForcePasswordChange({ user, onChanged, onLogout }) {
      const [nova, setNova] = useState('');
      const [confirma, setConfirma] = useState('');
      const [erro, setErro] = useState('');
      const [salvando, setSalvando] = useState(false);

      const salvar = async (e) => {
        e.preventDefault();
        if (nova.length < 8) { setErro('A senha precisa ter ao menos 8 caracteres.'); return; }
        if (nova !== confirma) { setErro('As senhas não conferem.'); return; }
        setSalvando(true);
        // A rota existente pede e-mail e a senha nova; o usuário já está autenticado aqui,
        // então reaproveitamos o e-mail dele em vez de pedir de novo.
        const res = await apiCall('POST', '/auth/reset-password', { email: user.email, newPassword: nova });
        setSalvando(false);
        if (!res.ok) { setErro(res.data?.error || 'Não foi possível trocar a senha.'); return; }
        const atualizado = { ...user, must_change_password: 0 };
        localStorage.setItem('user', JSON.stringify(atualizado));
        onChanged(atualizado);
      };

      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <form onSubmit={salvar} style={{ width: '100%', maxWidth: 400, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 18, padding: 28 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: '0 0 6px' }}>Defina sua senha</p>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '0 0 18px' }}>
              Este é seu primeiro acesso. Escolha uma senha antes de continuar.
            </p>
            {[['Nova senha', nova, setNova], ['Confirme a senha', confirma, setConfirma]].map(([rotulo, valor, set]) => (
              <label key={rotulo} style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 6 }}>{rotulo}</span>
                <input type="password" value={valor} onChange={e => set(e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 15, boxSizing: 'border-box' }} />
              </label>
            ))}
            {erro && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{erro}</p>}
            <button type="submit" disabled={salvando} style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: 'var(--bp-accent)', color: '#1a1206', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
              {salvando ? 'Salvando...' : 'Salvar e entrar'}
            </button>
            <button type="button" onClick={onLogout} style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer' }}>Sair</button>
          </form>
        </div>
      );
    }
