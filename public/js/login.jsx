    /* ======================================================
       LOGIN PAGE
    ====================================================== */
    function LoginPage({ onLogin }) {
      const { t } = useLang();
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [showPass, setShowPass] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');
      const [mode, setMode] = useState('login');
      const [name, setName] = useState('');
      const [phone, setPhone] = useState('');
      const [toast, setToast] = useState(null);
      const [emailTouched,   setEmailTouched]   = useState(false);
      const [phoneTouched,   setPhoneTouched]   = useState(false);
      const [passTouched,    setPassTouched]    = useState(false);
      const [confirmPass,    setConfirmPass]    = useState('');
      const [confirmTouched, setConfirmTouched] = useState(false);
      const [showConfirm,    setShowConfirm]    = useState(false);
      const [remember,       setRemember]       = useState(true);
      // Código de indicação vindo de um link compartilhado (?ref=CODIGO), capturado
      // silenciosamente no carregamento — código inválido/inexistente é só ignorado
      // pelo back-end no cadastro, sem exibir nada de errado pro usuário.
      const [referralCode, setReferralCode] = useState('');
      useEffect(() => {
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (ref) setReferralCode(ref);
      }, []);

      /* ── Confirmar senha ── */
      const passMatch  = password === confirmPass && confirmPass.length > 0;
      const matchError = confirmTouched && confirmPass.length > 0 && !passMatch;

      /* ── Validação de email ── */
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      const emailError = emailTouched && email.length > 0 && !emailValid;

      /* ── Validação de senha ── */
      const passRules = [
        { id: 'len',   label: t('common.pw_rule_len'),   ok: password.length >= 8 },
        { id: 'upper', label: t('common.pw_rule_upper'), ok: /[A-Z]/.test(password) },
        { id: 'lower', label: t('common.pw_rule_lower'), ok: /[a-z]/.test(password) },
        { id: 'sym',   label: t('common.pw_rule_sym'),   ok: /[^A-Za-z0-9]/.test(password) },
      ];
      const passValid = passRules.every(r => r.ok);
      const passStrength = passRules.filter(r => r.ok).length; // 0-4
      const strengthColor = ['#ef4444','#f59e0b','#f59e0b','#10b981','#10b981'][passStrength];
      const strengthLabel = ['', t('login.strength_weak'), t('login.strength_medium'), t('login.strength_good'), t('login.strength_strong')][passStrength];

      /* ── Máscara de telefone: (XX) XXXXX-XXXX ── */
      const formatPhone = (val) => {
        const d = val.replace(/\D/g, '').slice(0, 11);
        if (d.length === 0) return '';
        if (d.length <= 2)  return `(${d}`;
        if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
        return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
      };

      const phoneDigits = phone.replace(/\D/g, '');
      const phoneValid  = phoneDigits.length >= 10;
      const phoneError  = phoneTouched && phone.length > 0 && !phoneValid;

      const handlePhone = (e) => {
        setPhone(formatPhone(e.target.value));
        setPhoneTouched(true);
      };

      const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        const result = await apiCall('POST', '/auth/login', { email: email.trim().toLowerCase(), password });
        if (result.ok) {
          saveSession(result.data.token, result.data.user, remember);
          onLogin(result.data.user);
        } else {
          setError(result.data.error || t('login.err_generic_login'));
        }
        setLoading(false);
      };

      const handleForgotPassword = async (e) => {
        e.preventDefault();
        setEmailTouched(true);
        setPassTouched(true);
        if (!emailValid) { setError(t('login.err_invalid_email')); return; }
        if (!passValid) { setError(t('common.new_pw_requirements_error')); return; }
        setConfirmTouched(true);
        if (!passMatch) { setError(t('common.pw_mismatch_error')); return; }
        setLoading(true);
        const result = await apiCall('POST', '/auth/reset-password', { email, newPassword: password });
        if (result.ok) {
          setToast({ msg: t('login.reset_success_toast'), type: 'success' });
          setMode('login');
          setPassword(''); setConfirmPass('');
          setEmailTouched(false); setPhoneTouched(false); setPassTouched(false); setConfirmTouched(false);
        } else {
          setError(result.data.error || t('login.err_reset_generic'));
        }
        setLoading(false);
      };

      const handleRegister = async (e) => {
        e.preventDefault();
        setEmailTouched(true);
        setPhoneTouched(true);
        setPassTouched(true);
        if (!emailValid) { setError(t('login.err_invalid_email')); return; }
        if (phone && !phoneValid) { setError(t('login.err_phone_incomplete')); return; }
        if (!passValid) { setError(t('login.err_pw_requirements')); return; }
        setConfirmTouched(true);
        if (!passMatch) { setError(t('common.pw_mismatch_error')); return; }
        setLoading(true);
        const result = await apiCall('POST', '/auth/register', { name, email, phone, password, referral_code: referralCode || undefined });
        if (result.ok) {
          setToast({ msg: t('login.register_success_toast'), type: 'success' });
          setTimeout(() => {
            saveSession(result.data.token, result.data.user, true);
            localStorage.setItem('openBooking', '1');
            onLogin(result.data.user);
          }, 1500);
        } else {
          setError(result.data.error || t('login.err_register_generic'));
        }
        setLoading(false);
      };

      /* ── Estilos dinâmicos ── */
      const inputBase = { width: '100%', padding: '9px 16px', background: 'var(--bp-card)', color: 'var(--bp-text)', borderRadius: 8, outline: 'none', fontSize: 14, fontFamily: 'Inter, sans-serif', transition: 'border-color .15s', boxSizing: 'border-box' };
      const emailBorder = emailError ? '1.5px solid #ef4444' : (emailTouched && emailValid && email ? '1.5px solid #10b981' : '1px solid var(--bp-border2)');
      const phoneBorder = phoneError ? '1.5px solid #ef4444' : (phoneTouched && phoneValid ? '1.5px solid #10b981' : '1px solid var(--bp-border2)');

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'var(--bp-bg)' }}>
          <div className="login-card w-full max-w-md mx-auto p-8 rounded-2xl border border-bp-border">
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(212,165,116,0.5)', padding: 14 }}>
                <img src="/img/icon-white.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <h1 className="syne text-3xl font-bold text-white mb-2">CS <span className="text-bp-primary">BUCHER</span></h1>
              <p className="text-gray-400 text-sm">{mode === 'login' ? t('login.title_login') : mode === 'forgot' ? t('login.title_forgot') : t('login.title_register')}</p>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : mode === 'forgot' ? handleForgotPassword : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {mode === 'forgot' && (
                <p style={{ color: 'var(--bp-text-muted)', fontSize: 12.5, margin: '-6px 0 0' }}>
                  {t('login.forgot_info')}
                </p>
              )}

              {/* Nome */}
              {mode === 'register' && (
                <>
                  <label htmlFor="reg-name" className="sr-only">{t('login.full_name')}</label>
                  <input id="reg-name" type="text" placeholder={t('login.full_name')} value={name} onChange={e => setName(e.target.value)}
                    style={{ ...inputBase, border: '1px solid var(--bp-border2)' }} required />
                </>
              )}

              {/* Email */}
              <div>
                <label htmlFor="login-email" className="sr-only">{t('login.email')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-email"
                    type="text"
                    placeholder={t('login.email_placeholder')}
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); setEmailTouched(true); }}
                    onBlur={() => setEmailTouched(true)}
                    style={{ ...inputBase, border: mode === 'register' ? emailBorder : '1px solid var(--bp-border2)', paddingRight: 36 }}
                    required
                  />
                  {mode === 'register' && email.length > 0 && (
                    <i className={`fas ${emailValid ? 'fa-check-circle' : 'fa-times-circle'}`} aria-hidden="true"
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: emailValid ? '#10b981' : '#ef4444', fontSize: 14 }}></i>
                  )}
                </div>
                {emailError && (
                  <p style={{ color: '#ef4444', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                    {t('login.email_invalid')}
                  </p>
                )}
                {mode === 'register' && emailTouched && emailValid && email && (
                  <p style={{ color: '#10b981', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fas fa-check-circle" aria-hidden="true"></i> {t('login.email_valid')}
                  </p>
                )}
              </div>

              {/* Telefone */}
              {mode === 'register' && (
                <div>
                  <label htmlFor="reg-phone" className="sr-only">{t('login.phone')}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reg-phone"
                      type="tel"
                      placeholder="(XX) XXXXX-XXXX"
                      value={phone}
                      onChange={handlePhone}
                      onBlur={() => setPhoneTouched(true)}
                      maxLength={15}
                      style={{ ...inputBase, border: phoneBorder, paddingRight: 36 }}
                    />
                    {phone.length > 0 && (
                      <i className={`fas ${phoneValid ? 'fa-check-circle' : 'fa-times-circle'}`} aria-hidden="true"
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: phoneValid ? '#10b981' : '#ef4444', fontSize: 14 }}></i>
                    )}
                  </div>
                  {phoneError && (
                    <p style={{ color: '#ef4444', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                      {t('login.phone_incomplete')}
                    </p>
                  )}
                  {phoneTouched && phoneValid && (
                    <p style={{ color: '#10b981', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="fas fa-check-circle" aria-hidden="true"></i> {t('login.phone_valid')}
                    </p>
                  )}
                </div>
              )}

              {/* Senha */}
              <div>
                <label htmlFor="login-password" className="sr-only">{t('login.password')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="login-password"
                    type={showPass ? 'text' : 'password'}
                    placeholder={mode === 'forgot' ? t('common.new_password') : t('login.password_placeholder')}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); setPassTouched(true); }}
                    onBlur={() => setPassTouched(true)}
                    style={{ ...inputBase, paddingRight: 46,
                      border: mode !== 'login' && passTouched && password.length > 0
                        ? (passValid ? '1.5px solid #10b981' : '1.5px solid #ef4444')
                        : '1px solid var(--bp-border2)'
                    }}
                    required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? t('common.hide_password') : t('common.show_password')}
                    style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer' }}>
                    <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
                  </button>
                </div>

                {/* Barra de força + checklist — registro e redefinição */}
                {mode !== 'login' && password.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {/* Barra de força */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= passStrength ? strengthColor : 'var(--bp-border2)', transition: 'background .2s' }} />
                      ))}
                      {strengthLabel && <span style={{ color: strengthColor, fontSize: 11, fontWeight: 600, marginLeft: 4, whiteSpace: 'nowrap' }}>{strengthLabel}</span>}
                    </div>
                    {/* Checklist de requisitos */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                      {passRules.map(rule => (
                        <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className={`fas ${rule.ok ? 'fa-check-circle' : 'fa-times-circle'}`}
                            style={{ color: rule.ok ? '#10b981' : '#4b5563', fontSize: 11, flexShrink: 0 }}></i>
                          <span style={{ color: rule.ok ? 'var(--bp-text-secondary)' : 'var(--bp-text-faint)', fontSize: 11 }}>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {mode === 'login' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" id="remember-me" role="switch" aria-checked={remember} aria-label={t('login.remember_me')}
                      onClick={() => setRemember(r => !r)}
                      style={{ width: 38, height: 22, borderRadius: 11, background: remember ? '#d4a574' : 'var(--bp-border2)', border: 'none', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0, padding: 0 }}>
                      <span style={{ position: 'absolute', top: 3, left: remember ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />
                    </button>
                    <label htmlFor="remember-me" style={{ fontSize: 12.5, color: 'var(--bp-text-muted)', cursor: 'pointer' }} onClick={() => setRemember(r => !r)}>
                      {t('login.remember_me')}
                    </label>
                  </div>
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setPassword(''); setConfirmPass(''); setPhone(''); setEmailTouched(false); setPhoneTouched(false); setPassTouched(false); setConfirmTouched(false); }}
                    style={{ background: 'none', border: 'none', color: '#d4a574', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
                    {t('login.forgot_password')}
                  </button>
                </div>
              )}

              {/* Confirmar Senha — registro e redefinição */}
              {mode !== 'login' && (
                <div>
                  <label htmlFor="reg-confirm-password" className="sr-only">{t('login.confirm_password')}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reg-confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder={mode === 'forgot' ? t('common.confirm_new_password') : t('login.confirm_password_placeholder')}
                      value={confirmPass}
                      onChange={e => { setConfirmPass(e.target.value); setConfirmTouched(true); setError(''); }}
                      onBlur={() => setConfirmTouched(true)}
                      style={{ ...inputBase, paddingRight: 46,
                        border: confirmTouched && confirmPass.length > 0
                          ? (passMatch ? '1.5px solid #10b981' : '1.5px solid #ef4444')
                          : '1px solid var(--bp-border2)'
                      }}
                      required
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? t('common.hide_password') : t('common.show_password')}
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer' }}>
                      <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
                    </button>
                  </div>

                  {/* Feedback de match */}
                  {confirmTouched && confirmPass.length > 0 && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginTop: 4, color: passMatch ? '#10b981' : '#ef4444' }}>
                      <i className={`fas ${passMatch ? 'fa-check-circle' : 'fa-times-circle'}`} aria-hidden="true"></i>
                      {passMatch ? t('login.passwords_match') : t('login.passwords_mismatch')}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13 }}>
                  <i className="fas fa-exclamation-circle" style={{ marginRight: 8 }}></i>{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: '#000', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
                {loading ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>{t('login.loading')}</span> : mode === 'login' ? t('login.submit_login') : mode === 'forgot' ? t('login.title_forgot') : t('login.submit_register')}
              </button>
            </form>

            <div className="text-center mt-4">
              <p className="text-gray-400 text-sm">
                {mode === 'login' ? t('login.no_account') : mode === 'forgot' ? '' : t('login.has_account')}
                <button onClick={() => { setMode(mode === 'register' ? 'login' : mode === 'forgot' ? 'login' : 'register'); setError(''); setEmailTouched(false); setPhoneTouched(false); setPassTouched(false); setConfirmTouched(false); setPhone(''); setPassword(''); setConfirmPass(''); }} className="text-bp-primary hover:underline">
                  {mode === 'login' ? t('login.register_link') : t('login.back_to_login')}
                </button>
              </p>
            </div>
            {/* As credenciais de demonstração só aparecem em desenvolvimento. Numa URL pública
                elas entregavam acesso de administrador pra qualquer visitante da tela de login. */}
            {['localhost', '127.0.0.1'].includes(window.location.hostname) && (
              <div className="mt-6 p-3 rounded-lg bg-bp-accent/5 border border-bp-accent/20 text-xs text-gray-400">
                <p className="mb-1"><strong>{t('login.demo_admin_label')}</strong> admin@barbearia.com / Admin@2025</p>
                <p><strong>{t('login.demo_barber_label')}</strong> joao@barbearia.com / Barber@2025</p>
              </div>
            )}
          </div>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--bp-text-faint)', opacity: 0.6 }}>{t('login.footer_credit')}</p>
          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
      );
    }

    /* ======================================================
       TROCA DE SENHA OBRIGATÓRIA (primeiro login)
    ====================================================== */
    function ForcePasswordChange({ user, onChanged, onLogout }) {
      const { t } = useLang();
      const [oldPassword, setOldPassword] = useState('');
      const [password, setPassword] = useState('');
      const [confirmPass, setConfirmPass] = useState('');
      const [showPass, setShowPass] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');

      const passRules = [
        { id: 'len',   label: t('common.pw_rule_len'),   ok: password.length >= 8 },
        { id: 'upper', label: t('common.pw_rule_upper'), ok: /[A-Z]/.test(password) },
        { id: 'lower', label: t('common.pw_rule_lower'), ok: /[a-z]/.test(password) },
        { id: 'sym',   label: t('common.pw_rule_sym'),   ok: /[^A-Za-z0-9]/.test(password) },
      ];
      const passValid = passRules.every(r => r.ok);
      const passMatch = password === confirmPass && confirmPass.length > 0;

      const inputBase = { width: '100%', padding: '9px 16px', background: 'var(--bp-card)', color: 'var(--bp-text)', border: '1px solid var(--bp-border2)', borderRadius: 8, outline: 'none', fontSize: 14, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' };

      const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!oldPassword) { setError(t('force_pw.err_no_old_password')); return; }
        if (!passValid) { setError(t('common.new_pw_requirements_error')); return; }
        if (!passMatch) { setError(t('common.pw_mismatch_error')); return; }
        setLoading(true);
        const result = await apiCall('PUT', '/auth/password', { old_password: oldPassword, new_password: password });
        setLoading(false);
        if (result.ok) {
          updateStoredUser({ must_change_password: false });
          onChanged({ ...user, must_change_password: false });
        } else {
          setError(result.data.error || t('force_pw.err_generic'));
        }
      };

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'var(--bp-bg)' }}>
          <div className="login-card w-full max-w-md mx-auto p-8 rounded-2xl border border-bp-border">
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(212,165,116,0.5)' }}>
                <i className="fas fa-key" style={{ color: '#000', fontSize: 24 }}></i>
              </div>
              <h1 className="syne text-2xl font-bold text-white mb-2">{t('force_pw.title')}</h1>
              <p className="text-gray-400 text-sm">{t('force_pw.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="fpc-old" className="sr-only">{t('common.current_password')}</label>
                <input id="fpc-old" type="password" placeholder={t('common.current_password')} value={oldPassword} onChange={e => { setOldPassword(e.target.value); setError(''); }} style={inputBase} required />
              </div>

              <div style={{ position: 'relative' }}>
                <label htmlFor="fpc-new" className="sr-only">{t('common.new_password')}</label>
                <input id="fpc-new" type={showPass ? 'text' : 'password'} placeholder={t('common.new_password')} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} style={{ ...inputBase, paddingRight: 40 }} required />
                <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? t('common.hide_password') : t('common.show_password')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 14 }}>
                  <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
                </button>
              </div>

              {password.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '-6px 0 0' }}>
                  {passRules.map(r => (
                    <span key={r.id} style={{ fontSize: 11.5, color: r.ok ? '#10b981' : 'var(--bp-text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className={`fas ${r.ok ? 'fa-check-circle' : 'fa-circle'}`} aria-hidden="true" style={{ fontSize: 9 }}></i>{r.label}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <label htmlFor="fpc-confirm" className="sr-only">{t('common.confirm_new_password')}</label>
                <input id="fpc-confirm" type={showPass ? 'text' : 'password'} placeholder={t('common.confirm_new_password')} value={confirmPass} onChange={e => { setConfirmPass(e.target.value); setError(''); }} style={inputBase} required />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13 }}>
                  <i className="fas fa-exclamation-circle" style={{ marginRight: 8 }}></i>{error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: '#000', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: loading ? 0.7 : 1, marginTop: 4 }}>
                {loading ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>{t('force_pw.saving')}</span> : t('force_pw.submit')}
              </button>
            </form>

            <div className="text-center mt-4">
              <button onClick={onLogout} className="text-gray-400 hover:underline text-sm">{t('common.logout')}</button>
            </div>
          </div>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--bp-text-faint)', opacity: 0.6 }}>{t('login.footer_credit')}</p>
        </div>
      );
    }

