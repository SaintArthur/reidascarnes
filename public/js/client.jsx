    /* ======================================================
       CLIENT PROFILE
    ====================================================== */
    // Definido fora de ClientProfile: se ficasse dentro, uma nova função/identidade
    // de componente seria criada a cada re-render (cada tecla digitada), fazendo o
    // React desmontar e remontar o <input> a cada letra — só dava pra digitar uma
    // letra por vez. Precisa ser componente próprio (não JSX inline) para poder
    // usar hooks (useLang) e manter foco estável entre renders do pai.
    function ClientFieldRow({ label, value, field, editField, setEditField, onChange }) {
      const { t } = useLang();
      const inputSt = { background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%' };
      const labelSt = { color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block' };
      return (
        <div>
          <label htmlFor={`cp-${field}`} style={labelSt}>{label}</label>
          <div style={{ position: 'relative' }}>
            <input
              id={`cp-${field}`}
              value={value}
              readOnly={editField !== field}
              onChange={e => onChange(e.target.value)}
              style={{ ...inputSt, paddingRight: 36, color: editField === field ? 'var(--bp-text)' : 'var(--bp-text-secondary)', borderColor: editField === field ? '#d4a574' : 'var(--bp-border2)', background: editField === field ? '#1e2535' : 'var(--bp-card)' }}
              onFocus={() => setEditField(field)}
            />
            <button
              onClick={() => setEditField(editField === field ? null : field)}
              aria-label={editField === field ? t('profile.confirm_field', { label }) : t('profile.edit_field', { label })}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: editField === field ? '#d4a574' : '#4b5563', cursor: 'pointer', fontSize: 13 }}>
              <i className={`fas ${editField === field ? 'fa-check' : 'fa-pencil-alt'}`} aria-hidden="true"></i>
            </button>
          </div>
        </div>
      );
    }

    function ClientProfile({ user, appointments, showToast, onGoToAppointments }) {
      const { t } = useLang();
      const [name, setName] = useState(user.name || '');
      const [email, setEmail] = useState(user.email || '');
      const [phone, setPhone] = useState(user.phone || '');
      const [birthDate, setBirthDate] = useState(user.birth_date || '');
      const [gender, setGender] = useState(user.gender || 'Masculino');
      const [address, setAddress] = useState('');
      const [cpf, setCpf] = useState('');
      const [photoUrl, setPhotoUrl] = useState(user.photo_url || null);
      const [editField, setEditField] = useState(null);
      const [saving, setSaving] = useState(false);
      // Snapshot dos valores salvos, usado só para habilitar o botão Salvar quando
      // algum campo realmente mudou (evita salvar sem alteração nenhuma).
      const [initial, setInitial] = useState({ name: user.name || '', email: user.email || '', phone: user.phone || '', birthDate: user.birth_date || '', gender: user.gender || 'Masculino', address: '', cpf: '' });

      // Programa de indicação: visível só se o admin tiver ativado (default habilitado,
      // igual ao isSettingEnabled do back-end, quando a chave ainda não existe em /settings).
      const [referralEnabled, setReferralEnabled] = useState(false);
      const [referralCode, setReferralCode] = useState(user.referral_code || '');
      const [referralCount, setReferralCount] = useState(0);
      const [bonusReferrer, setBonusReferrer] = useState('');
      const [bonusReferred, setBonusReferred] = useState('');
      const [generatingReferral, setGeneratingReferral] = useState(false);
      const [linkCopied, setLinkCopied] = useState(false);

      useEffect(() => {
        (async () => {
          const [res, settingsRes, referralsRes] = await Promise.all([
            apiCall('GET', '/me'),
            apiCall('GET', '/settings'),
            apiCall('GET', '/referrals/me'),
          ]);
          if (res.ok) {
            setBirthDate(res.data.birth_date || '');
            setGender(res.data.gender || 'Masculino');
            setAddress(res.data.address || '');
            setCpf(res.data.document || '');
            setPhotoUrl(res.data.photo_url || null);
            setReferralCode(res.data.referral_code || '');
            setInitial(prev => ({ ...prev, birthDate: res.data.birth_date || '', gender: res.data.gender || 'Masculino', address: res.data.address || '', cpf: res.data.document || '' }));
          }
          if (settingsRes.ok) {
            setReferralEnabled(settingsRes.data.referral_enabled !== 'false');
            setBonusReferrer(settingsRes.data.referral_bonus_referrer || '');
            setBonusReferred(settingsRes.data.referral_bonus_referred || '');
          }
          if (referralsRes.ok) setReferralCount(referralsRes.data.count || 0);
        })();
      }, []);

      const referralLink = referralCode ? `${window.location.origin}/?ref=${referralCode}` : '';

      const generateReferralCode = async () => {
        setGeneratingReferral(true);
        const res = await apiCall('POST', '/me/referral-code');
        setGeneratingReferral(false);
        if (res.ok) setReferralCode(res.data.referral_code);
        else showToast(res.data?.error || t('profile.err_generate_referral'), 'error');
      };

      const copyReferralLink = async () => {
        try {
          await navigator.clipboard.writeText(referralLink);
          setLinkCopied(true);
          showToast(t('profile.referral_copied_toast'), 'success');
          setTimeout(() => setLinkCopied(false), 2000);
        } catch {
          showToast(t('profile.err_copy_link'), 'error');
        }
      };

      const isDirty = name !== initial.name || email !== initial.email || phone !== initial.phone || birthDate !== initial.birthDate || gender !== initial.gender || address !== initial.address || cpf !== initial.cpf;

      const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast(t('profile.err_invalid_image'), 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast(t('profile.err_image_too_large'), 'error'); return; }
        const reader = new FileReader();
        reader.onload = ev => {
          setPhotoUrl(ev.target.result);
          apiCall('PATCH', '/me', { photo_url: ev.target.result }).then(res => {
            if (res.ok) { updateStoredUser({ photo_url: ev.target.result }); showToast(t('profile.photo_updated'), 'success'); }
            else showToast(res.data?.error || t('profile.err_save_photo'), 'error');
          });
        };
        reader.readAsDataURL(file);
      };

      const handleDeletePhoto = async () => {
        const prev = photoUrl;
        setPhotoUrl(null);
        const res = await apiCall('PATCH', '/me', { photo_url: null });
        if (res.ok) { updateStoredUser({ photo_url: null }); showToast(t('profile.photo_removed'), 'success'); }
        else { setPhotoUrl(prev); showToast(res.data?.error || t('profile.err_remove_photo'), 'error'); }
      };
      const [showPassModal, setShowPassModal] = useState(false);
      const [oldPass, setOldPass] = useState('');
      const [newPass, setNewPass] = useState('');
      const [confirmPass, setConfirmPass] = useState('');
      const [changingPass, setChangingPass] = useState(false);
      const [theme, setTheme] = useState(user.theme || 'dark');
      const [savingTheme, setSavingTheme] = useState(false);

      const handleThemeChange = async (value) => {
        setTheme(value);
        setSavingTheme(true);
        applyTheme(value);
        const res = await apiCall('PATCH', '/me', { theme: value });
        setSavingTheme(false);
        if (res.ok) {
          updateStoredUser({ theme: value });
          showToast(t('profile.theme_updated'), 'success');
        } else {
          showToast(res.data?.error || t('profile.err_save_theme'), 'error');
        }
      };

      const totalCuts = appointments.filter(a => a.status === 'completed').length;
      const lastService = [...appointments].filter(a => a.status === 'completed').sort((a, b) => parseLocalDate(b.appointment_date) - parseLocalDate(a.appointment_date))[0];
      const nextService = [...appointments].filter(a => a.status !== 'cancelled' && a.status !== 'completed' && parseLocalDate(a.appointment_date) >= todayStart()).sort((a, b) => parseLocalDate(a.appointment_date) - parseLocalDate(b.appointment_date))[0];

      const inputSt = { background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', width: '100%' };
      const labelSt = { color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block' };

      const handleSave = async () => {
        setSaving(true);
        const [profileRes, extraRes] = await Promise.all([
          apiCall('PUT', '/auth/profile', { name, email, phone }),
          apiCall('PATCH', '/me', { birth_date: birthDate, gender, address, document: cpf }),
        ]);
        setSaving(false);
        if (profileRes.ok && extraRes.ok) {
          updateStoredUser({ name, email, phone, birth_date: birthDate, gender, address, document: cpf });
          setInitial({ name, email, phone, birthDate, gender, address, cpf });
          showToast(t('profile.updated_success'), 'success');
          setEditField(null);
        } else {
          showToast(profileRes.data?.error || extraRes.data?.error || t('profile.err_save_generic'), 'error');
        }
      };

      const handleChangePass = async () => {
        if (newPass !== confirmPass) { showToast(t('profile.err_pw_mismatch_short'), 'error'); return; }
        if (newPass.length < 8) { showToast(t('profile.err_pw_min_len'), 'error'); return; }
        setChangingPass(true);
        const result = await apiCall('PUT', '/auth/password', { old_password: oldPass, new_password: newPass });
        setChangingPass(false);
        if (result.ok) {
          showToast(t('profile.pw_changed_success'), 'success');
          setShowPassModal(false); setOldPass(''); setNewPass(''); setConfirmPass('');
        } else {
          showToast(result.data?.error || t('profile.err_change_pw'), 'error');
        }
      };

      return (
        <div>
          {/* TOP ROW: Avatar + Info + Personal Fields */}
          {/* Sempre empilhado (padrão mobile), mesmo em telas largas — layout aprovado. */}
          <div className="cp-grid-top" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
            {/* Avatar card */}
            <div className="panel" style={{ borderRadius: 16, border: '1px solid var(--bp-border2)', padding: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 88, height: 88, borderRadius: 16, background: photoUrl ? 'none' : 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: 'var(--bp-text)', fontFamily: 'Syne, sans-serif', boxShadow: '0 4px 20px rgba(212,165,116,0.3)', overflow: 'hidden' }}>
                    {photoUrl ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: '50%', background: '#10b981', border: '2px solid var(--bp-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-check" style={{ color: 'var(--bp-text)', fontSize: 9 }}></i>
                  </div>
                  {photoUrl && (
                    <button onClick={handleDeletePhoto} aria-label={t('profile.remove_photo')} title={t('profile.remove_photo')}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bp-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <i className="fas fa-times" aria-hidden="true" style={{ color: '#fff', fontSize: 10 }}></i>
                    </button>
                  )}
                </div>
                <label style={{ display: 'inline-block', background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-secondary)', fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all .15s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-secondary)'; }}>
                  <i className="fas fa-camera" style={{ marginRight: 6 }}></i>{t('profile.change_photo')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                </label>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 20, margin: '0 0 4px' }}>{name}</h2>
                <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{t('profile.client_active_badge')}</span>
              </div>
            </div>

            {/* Personal fields */}
            {/* Coluna única sempre: grids de 2 colunas aqui dentro de cp-grid-top faziam cada
                campo ficar com ~90px de largura real em janelas médias/estreitas, cortando o
                texto (ex: e-mail, telefone). Empilhar verticalmente garante espaço suficiente em
                qualquer largura. */}
            <div className="panel" style={{ borderRadius: 16, border: '1px solid var(--bp-border2)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ClientFieldRow label={t('profile.full_name')} value={name} field="name" editField={editField} setEditField={setEditField} onChange={setName} />
              <ClientFieldRow label={t('common.email')} value={email} field="email" editField={editField} setEditField={setEditField} onChange={setEmail} />
              <ClientFieldRow label={t('profile.birth_date')} value={birthDate} field="birth" editField={editField} setEditField={setEditField} onChange={setBirthDate} />
              <ClientFieldRow label={t('common.phone')} value={phone} field="phone" editField={editField} setEditField={setEditField} onChange={setPhone} />
              <div>
                <label htmlFor="cp-gender" style={labelSt}>{t('profile.gender')}</label>
                <div style={{ position: 'relative' }}>
                  <select id="cp-gender" value={gender} onChange={e => setGender(e.target.value)} style={{ ...inputSt, appearance: 'none', cursor: 'pointer', paddingRight: 30, borderColor: editField === 'gender' ? '#d4a574' : 'var(--bp-border2)' }} onFocus={() => setEditField('gender')} onBlur={() => setEditField(null)}>
                    <option value="Masculino">{t('profile.gender_male')}</option><option value="Feminino">{t('profile.gender_female')}</option><option value="Outro">{t('profile.gender_other')}</option><option value="Prefiro não informar">{t('profile.gender_unspecified')}</option>
                  </select>
                  <i className="fas fa-pencil-alt" aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#4b5563', fontSize: 12, pointerEvents: 'none' }}></i>
                </div>
              </div>
              <ClientFieldRow label={t('common.address')} value={address} field="address" editField={editField} setEditField={setEditField} onChange={setAddress} />
              <ClientFieldRow label={t('profile.document')} value={cpf} field="document" editField={editField} setEditField={setEditField} onChange={setCpf} />
            </div>
          </div>

          {/* SERVICE SUMMARY */}
          <div className="panel" style={{ borderRadius: 16, border: '1px solid var(--bp-border2)', padding: 24, marginBottom: 16 }}>
            <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, marginBottom: 18 }}>{t('profile.services_summary')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>{t('profile.total_cuts')}</p>
                <p style={{ color: 'var(--bp-text)', fontSize: 24, fontWeight: 800, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>{totalCuts}</p>
              </div>
              <div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>{t('profile.last_service')}</p>
                {lastService ? (
                  <p style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14, marginTop: 2 }}>{lastService.appointment_date} – {lastService.service_name}</p>
                ) : (
                  <p style={{ color: '#4b5563', fontSize: 13, marginTop: 2 }}>{t('profile.no_completed_service')}</p>
                )}
              </div>
              <div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>{t('profile.next_appointment')}</p>
                {nextService ? (
                  <p style={{ color: '#d4a574', fontWeight: 600, fontSize: 14, marginTop: 2 }}>{nextService.appointment_date} {t('common.at')} {nextService.appointment_time}</p>
                ) : (
                  <p style={{ color: '#4b5563', fontSize: 13, marginTop: 2 }}>
                    {t('profile.how_about_booking')} <button onClick={onGoToAppointments} style={{ background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: 0, fontFamily: 'Inter, sans-serif' }}>{t('profile.my_appointments')}</button>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* REFERRAL PROGRAM */}
          {referralEnabled && (
            <div className="panel" style={{ borderRadius: 16, border: '1px solid var(--bp-border2)', padding: 24, marginBottom: 16 }}>
              <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                <i className="fas fa-user-plus" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('profile.referral_title')}
              </h3>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 18 }}>
                {t('profile.referral_desc', { bonusReferrer: bonusReferrer || '—', bonusReferred: bonusReferred || '—' })}
              </p>
              {!referralCode ? (
                <button onClick={generateReferralCode} disabled={generatingReferral} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px 20px', cursor: generatingReferral ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: generatingReferral ? 0.7 : 1 }}>
                  {generatingReferral ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>{t('common.saving')}</span> : t('profile.referral_generate_btn')}
                </button>
              ) : (
                <>
                  <label style={{ color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, display: 'block' }}>{t('profile.referral_link_label')}</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <input readOnly value={referralLink} onFocus={e => e.target.select()} style={{ flex: '1 1 220px', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-secondary)', padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={copyReferralLink} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-secondary)', fontWeight: 600, fontSize: 12, padding: '9px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className={`fas ${linkCopied ? 'fa-check' : 'fa-copy'}`}></i>{t('profile.referral_copy_btn')}
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(t('profile.referral_whatsapp_message', { link: referralLink }))}`} target="_blank" rel="noopener noreferrer" style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.35)', borderRadius: 8, color: '#25d366', fontWeight: 600, fontSize: 12, padding: '9px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <i className="fab fa-whatsapp"></i>{t('profile.referral_whatsapp_btn')}
                    </a>
                  </div>
                  {referralCount > 0 && (
                    <p style={{ color: '#10b981', fontSize: 12, marginTop: 14, fontWeight: 600 }}>
                      <i className="fas fa-trophy" style={{ marginRight: 6 }}></i>
                      {t(referralCount === 1 ? 'profile.referral_count_singular' : 'profile.referral_count_plural', { count: referralCount })}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* SAVE / CHANGE PASSWORD */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowPassModal(true)} style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', border: 'none', borderRadius: 8, color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, padding: '10px 22px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {t('profile.change_password')}
            </button>
            <button onClick={handleSave} disabled={saving || !isDirty} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px 22px', cursor: (saving || !isDirty) ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: (saving || !isDirty) ? 0.5 : 1 }}>
              {saving ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>{t('common.saving')}</span> : t('profile.save_changes')}
            </button>
          </div>

          {/* APPEARANCE */}
          <div className="panel" style={{ borderRadius: 16, border: '1px solid var(--bp-border2)', padding: 24, marginBottom: 16 }}>
            <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, fontFamily: 'Syne, sans-serif', margin: '0 0 4px' }}><i className="fas fa-palette" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('profile.appearance')}</p>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 16px' }}>{t('profile.appearance_desc')}</p>
            <ThemeToggle theme={theme} onChange={handleThemeChange} saving={savingTheme} />
          </div>

          {/* CHANGE PASSWORD MODAL */}
          {showPassModal && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowPassModal(false)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 380, maxWidth: '90vw' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>{t('profile.change_password')}</h3>
                  <button onClick={() => setShowPassModal(false)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 18 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div><label htmlFor="cp-old-pass" style={labelSt}>{t('common.current_password')}</label><input id="cp-old-pass" type="password" autoComplete="new-password" value={oldPass} onChange={e => setOldPass(e.target.value)} style={inputSt} placeholder="••••••" /></div>
                  <div><label htmlFor="cp-new-pass" style={labelSt}>{t('common.new_password')}</label><input id="cp-new-pass" type="password" autoComplete="new-password" value={newPass} onChange={e => setNewPass(e.target.value)} style={inputSt} placeholder="••••••" /></div>
                  <div><label htmlFor="cp-confirm-pass" style={labelSt}>{t('common.confirm_new_password')}</label><input id="cp-confirm-pass" type="password" autoComplete="new-password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} style={inputSt} placeholder="••••••" /></div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleChangePass} disabled={changingPass} style={{ flex: 1, background: changingPass ? 'rgba(212,165,116,0.4)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px', cursor: changingPass ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    {changingPass ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>{t('profile.changing_password')}</span> : t('common.confirm')}
                  </button>
                  <button onClick={() => setShowPassModal(false)} disabled={changingPass} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-muted)', fontSize: 13, padding: '10px', cursor: changingPass ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          )}

        </div>
      );
    }

    /* ======================================================
       CLIENT DASHBOARD
    ====================================================== */
    /* ── Modal de confirmação obrigatória 1h antes ── */
    function ConfirmationModal({ apt, onConfirm, onCancel }) {
      const { t } = useLang();
      const fee = Math.ceil((apt.price || 0) * 0.20);
      const [cancelling, setCancelling] = useState(false);
      const [confirming, setConfirming] = useState(false);
      const [countdown, setCountdown] = useState(300); // 5 min para decidir

      useEffect(() => {
        const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);
        return () => clearInterval(t);
      }, []);

      const mins = String(Math.floor(countdown / 60)).padStart(2, '0');
      const secs = String(countdown % 60).padStart(2, '0');
      const urgent = countdown <= 60;

      const handleConfirm = async () => {
        setConfirming(true);
        await new Promise(r => setTimeout(r, 600));
        onConfirm(apt);
      };

      const handleCancel = async () => {
        setCancelling(true);
        await new Promise(r => setTimeout(r, 600));
        onCancel(apt, fee);
      };

      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}>
          <div className="confirm-modal-card" style={{ background: 'var(--bp-panel)', border: '2px solid rgba(212,165,116,0.4)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 32px 80px rgba(0,0,0,0.8)', animation: 'confirmModalIn .35s cubic-bezier(.34,1.56,.64,1) forwards' }}>

            {/* Header urgente */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', border: '2px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', animation: 'bellShakeStrong 1s ease .4s, urgentPulse 2s ease 1.4s infinite' }}>
                <i className="fas fa-bell" style={{ color: '#f59e0b', fontSize: 26 }}></i>
              </div>
              <h2 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 800, fontSize: 20, margin: '0 0 6px' }}>
                {t('client.confirm_title')}
              </h2>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 13, margin: 0 }}>
                {t('client.confirm_subtitle')}
              </p>
            </div>

            {/* Detalhes do agendamento */}
            <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(212,165,116,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fas fa-cut" style={{ color: '#d4a574', fontSize: 16 }}></i>
                </div>
                <div>
                  <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: 0 }}>{apt.service_name}</p>
                  <p style={{ color: '#d4a574', fontSize: 12, margin: 0 }}>{t('common.with_barber', { barbeiro: apt.barber_name })}</p>
                </div>
                <p style={{ color: '#d4a574', fontWeight: 800, fontSize: 16, marginLeft: 'auto' }}>{fmtCur(apt.price)}</p>
              </div>
              <div style={{ display: 'flex', gap: 16, paddingTop: 10, borderTop: '1px solid var(--bp-border2)' }}>
                <span style={{ color: 'var(--bp-text-muted)', fontSize: 12 }}><i className="fas fa-calendar" style={{ marginRight: 5 }}></i>{apt.appointment_date}</span>
                <span style={{ color: 'var(--bp-text-muted)', fontSize: 12 }}><i className="fas fa-clock" style={{ marginRight: 5 }}></i>{apt.appointment_time}</span>
              </div>
            </div>

            {/* Aviso taxa cancelamento */}
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: 14, marginTop: 1, flexShrink: 0 }}></i>
              <p style={{ color: '#fca5a5', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                {t('client.late_cancel_fee_warning', { pct: 20, valor: fmtCur(fee) })}
              </p>
            </div>

            {/* Countdown */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: urgent ? '#ef4444' : 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 4px' }}>
                {countdown > 0 ? t('client.time_to_decide') : t('client.time_expired')}
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: urgent ? 'rgba(239,68,68,0.1)' : 'var(--bp-card)', border: `1px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'var(--bp-border2)'}`, borderRadius: 8, padding: '4px 16px' }}>
                <i className="fas fa-hourglass-half" style={{ color: urgent ? '#ef4444' : 'var(--bp-text-faint)', fontSize: 12 }}></i>
                <span style={{ color: urgent ? '#ef4444' : 'var(--bp-text-secondary)', fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18 }}>{mins}:{secs}</span>
              </div>
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleConfirm} disabled={confirming || cancelling}
                style={{ width: '100%', background: confirming ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 12, color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, padding: '14px 0', cursor: confirming ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                {confirming
                  ? <><i className="fas fa-spinner fa-spin"></i> {t('client.confirming')}</>
                  : <><i className="fas fa-check-circle"></i> {t('client.confirm_presence')}</>}
              </button>
              <button onClick={handleCancel} disabled={confirming || cancelling}
                style={{ width: '100%', background: cancelling ? 'rgba(239,68,68,0.1)' : 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, color: '#ef4444', fontWeight: 600, fontSize: 14, padding: '13px 0', cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                {cancelling
                  ? <><i className="fas fa-spinner fa-spin"></i> {t('common.processing')}</>
                  : <><i className="fas fa-times-circle"></i> {t('client.cancel_and_pay_fee', { valor: fmtCur(fee) })}</>}
              </button>
            </div>

            <p style={{ color: '#4b5563', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
              {t('client.window_cannot_close')}
            </p>
          </div>
        </div>
      );
    }

    function CancelRequestModal({ apt, feePct, onConfirm, onClose }) {
      const { t } = useLang();
      const [loading, setLoading] = useState(false);
      const fee = Math.round((apt.price || 0) * (feePct / 100) * 100) / 100;

      const handleConfirm = async () => {
        setLoading(true);
        await onConfirm(apt);
        setLoading(false);
      };

      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}>
          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <i className="fas fa-calendar-times" style={{ color: '#ef4444', fontSize: 22 }}></i>
              </div>
              <h2 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 800, fontSize: 18, margin: '0 0 6px' }}>{t('client.request_cancellation_title')}</h2>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 13, margin: 0 }}>{t('client.request_cancellation_subtitle')}</p>
            </div>

            <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{apt.service_name}</p>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: '0 0 8px' }}>{t('common.with_barber', { barbeiro: apt.barber_name })}</p>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: 0 }}><i className="fas fa-calendar" style={{ marginRight: 5 }}></i>{apt.appointment_date} {t('common.at')} {apt.appointment_time}</p>
            </div>

            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: 14, marginTop: 1, flexShrink: 0 }}></i>
              <p style={{ color: '#fca5a5', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                {fee > 0
                  ? t('client.cancel_fee_notice', { pct: feePct, valor: fmtCur(fee) })
                  : t('client.cancel_no_fee_notice')}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleConfirm} disabled={loading}
                style={{ width: '100%', background: loading ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg,#ef4444,#dc2626)', border: 'none', borderRadius: 12, color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, padding: '13px 0', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading
                  ? <><i className="fas fa-spinner fa-spin"></i> {t('common.processing')}</>
                  : <><i className="fas fa-check"></i> {fee > 0 ? t('client.confirm_cancellation_with_fee', { valor: fmtCur(fee) }) : t('client.confirm_cancellation')}</>}
              </button>
              <button onClick={onClose} disabled={loading}
                style={{ width: '100%', background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 12, color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 13, padding: '12px 0', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {t('common.back')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    function ClientNotificationBell({ refreshKey, onReviewClick }) {
      const { t } = useLang();
      const [open, setOpen] = useState(false);
      const [notifs, setNotifs] = useState([]);
      const [loading, setLoading] = useState(false);
      const panelRef = useRef(null);
      const btnRef = useRef(null);

      const load = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/notifications');
        if (res.ok) setNotifs(res.data);
        setLoading(false);
      };

      useEffect(() => {
        load();
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
      }, [refreshKey]);

      useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [open]);

      const unreadCount = notifs.filter(n => !n.read).length;

      const markRead = async (n) => {
        if (n.read) return;
        setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, read: 1 } : x));
        await apiCall('PATCH', `/notifications/${n.id}/read`);
      };

      const markAllRead = async () => {
        setNotifs(ns => ns.map(n => ({ ...n, read: 1 })));
        await apiCall('PATCH', '/notifications/read-all');
      };

      const typeStyle = (type) => type === 'warning' ? { icon: 'fa-exclamation-triangle', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
        : type === 'success' ? { icon: 'fa-check-circle', color: '#10b981', bg: 'rgba(16,185,129,0.12)' }
          : { icon: 'fa-bell', color: '#d4a574', bg: 'rgba(212,165,116,0.12)' };

      return (
        <div style={{ position: 'relative' }}>
          <button
            ref={btnRef}
            onClick={() => setOpen(o => !o)}
            aria-label={unreadCount > 0 ? t('client.notifications_unread_aria', { count: unreadCount }) : t('client.notifications')}
            aria-expanded={open}
            style={{ position: 'relative', background: open ? 'rgba(212,165,116,.12)' : 'none', border: open ? '1px solid rgba(212,165,116,.3)' : '1px solid transparent', borderRadius: 8, color: open ? '#d4a574' : 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 16, padding: '6px 9px', display: 'flex', alignItems: 'center' }}
          >
            <i className="fas fa-bell" aria-hidden="true"></i>
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
              <div ref={panelRef} className="notif-panel">
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14 }}>{t('client.notifications')}</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#d4a574', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('client.mark_all_read')}</button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {loading ? (
                    <div style={{ padding: 24, textAlign: 'center' }}><i className="fas fa-spinner fa-spin" style={{ color: 'var(--bp-text-faint)' }}></i></div>
                  ) : notifs.length === 0 ? (
                    <div style={{ padding: '28px 14px', textAlign: 'center' }}>
                      <i className="fas fa-check-circle" style={{ fontSize: 28, color: 'var(--bp-border2)', marginBottom: 8, display: 'block' }}></i>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{t('client.no_notifications')}</p>
                    </div>
                  ) : notifs.map(n => {
                    const t = typeStyle(n.type);
                    const isReviewPrompt = /avaliar/i.test(n.message || '');
                    return (
                      <div key={n.id} onClick={() => { markRead(n); if (isReviewPrompt) { setOpen(false); onReviewClick && onReviewClick(); } }} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--bp-border)', cursor: 'pointer', background: n.read ? 'transparent' : 'rgba(212,165,116,0.04)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i className={`fas ${t.icon}`} style={{ color: t.color, fontSize: 12 }}></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: n.read ? 'var(--bp-text-secondary)' : 'var(--bp-text)', fontWeight: n.read ? 400 : 600, fontSize: 12.5, margin: '0 0 2px' }}>{n.title}</p>
                          <p style={{ color: 'var(--bp-text-faint)', fontSize: 11.5, margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      );
    }

    function useClientNav() {
      const { t } = useLang();
      return [
        { id: 'home', icon: 'fas fa-home', label: t('client.nav_home') },
        { id: 'appointments', icon: 'fas fa-calendar-check', label: t('profile.my_appointments') },
        { id: 'services', icon: 'fas fa-cut', label: t('client.nav_services') },
        { id: 'profile', icon: 'fas fa-user', label: t('client.nav_profile') },
      ];
    }

    function ClientDashboard({ user, onLogout }) {
      const { t } = useLang();
      const CLIENT_NAV = useClientNav();
      const [appointments, setAppointments] = useState([]);
      const [services, setServices] = useState([]);
      const [barbers, setBarbers] = useState([]);
      const [activeView, setActiveView] = useState('home');
      const [showBooking, setShowBooking] = useState(false);
      const [loading, setLoading] = useState(true);
      const [toast, setToast] = useState(null);
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
      const [confirmModal, setConfirmModal] = useState(null); // apt que precisa de confirmação
      const [myReviews, setMyReviews] = useState([]);
      const [cancelFeePct, setCancelFeePct] = useState(20);
      const [cancelRequestApt, setCancelRequestApt] = useState(null); // apt cujo cancelamento o cliente está solicitando
      const [notifRefreshKey, setNotifRefreshKey] = useState(0);
      const [reviewReminderApt, setReviewReminderApt] = useState(null);
      const [autoOpenReview, setAutoOpenReview] = useState(false);
      const notifiedRef = useRef(new Set()); // IDs já notificados

      useEffect(() => { loadData(); }, []);
      useEffect(() => { setupPushNotifications(); }, []);

      // Abrir booking automaticamente após registro
      useEffect(() => {
        if (!loading && localStorage.getItem('openBooking') === '1') {
          localStorage.removeItem('openBooking');
          setShowBooking(true);
        }
      }, [loading]);

      // Verificar a cada 30s se algum agendamento está dentro de 1 hora
      useEffect(() => {
        const check = () => {
          const now = new Date();
          appointments.forEach(apt => {
            if (apt.status === 'cancelled' || apt.status === 'completed') return;
            if (notifiedRef.current.has(apt.id)) return;
            if (!apt.appointment_date || !apt.appointment_time) return;

            const [h, m] = apt.appointment_time.split(':').map(Number);
            const aptDate = parseLocalDate(apt.appointment_date);
            aptDate.setHours(h, m, 0, 0);

            const diffMs = aptDate - now;
            const diffMin = diffMs / 60000;

            // Dentro da janela: entre 55 e 65 minutos antes
            if (diffMin > 0 && diffMin <= 65 && diffMin >= 55) {
              notifiedRef.current.add(apt.id);
              setConfirmModal(apt);
            }
          });
        };

        check(); // checar imediatamente ao carregar
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
      }, [appointments]);

      const handleConfirmPresence = async (apt) => {
        await apiCall('PATCH', `/appointments/${apt.id}/status`, { status: 'confirmed' });
        setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'confirmed' } : a));
        setConfirmModal(null);
        setToast({ msg: t('client.presence_confirmed_toast'), type: 'success' });
      };

      const handleCancelWithFee = async (apt, fee) => {
        await apiCall('PATCH', `/appointments/${apt.id}/status`, { status: 'cancelled' });
        setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'cancelled' } : a));
        setConfirmModal(null);
        setNotifRefreshKey(k => k + 1);
        setToast({ msg: t('client.appointment_cancelled_fee_toast', { valor: fmtCur(fee) }), type: 'error' });
      };

      const handleRequestCancellation = async (apt) => {
        const res = await apiCall('PATCH', `/appointments/${apt.id}/status`, { status: 'cancelled' });
        if (res.ok) {
          setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'cancelled' } : a));
          setCancelRequestApt(null);
          setNotifRefreshKey(k => k + 1);
          const fee = res.data?.fee || 0;
          setToast({
            msg: fee > 0 ? t('client.cancellation_requested_fee_toast', { valor: fmtCur(fee) }) : t('client.cancellation_requested_success_toast'),
            type: fee > 0 ? 'error' : 'success',
          });
        } else {
          setToast({ msg: res.data?.error || t('client.err_request_cancellation'), type: 'error' });
        }
      };

      const loadData = async () => {
        setLoading(true);
        const [aptsRes, svcsRes, barbersRes, reviewsRes, settingsRes] = await Promise.all([
          apiCall('GET', '/appointments'),
          apiCall('GET', '/services'),
          apiCall('GET', '/barbers'),
          apiCall('GET', '/reviews/mine'),
          apiCall('GET', '/settings'),
        ]);
        if (aptsRes.ok) setAppointments(aptsRes.data);
        if (svcsRes.ok) setServices(svcsRes.data);
        if (barbersRes.ok) setBarbers(barbersRes.data);
        if (reviewsRes.ok) setMyReviews(reviewsRes.data);
        if (settingsRes.ok) {
          const pct = parseFloat(settingsRes.data?.cancel_fee);
          if (!isNaN(pct)) setCancelFeePct(pct);
        }
        setLoading(false);
      };

      const today = todayStart();
      const upcomingApts = appointments.filter(a => a.status !== 'cancelled' && parseLocalDate(a.appointment_date) >= today).slice(0, 3);
      const nextApt = appointments.filter(a => a.status !== 'cancelled' && parseLocalDate(a.appointment_date) >= today).sort((a, b) => parseLocalDate(a.appointment_date) - parseLocalDate(b.appointment_date))[0];
      const pendingReviewApts = appointments.filter(a => a.status === 'completed' && !myReviews.some(r => r.appointment_id === a.id)).sort((a, b) => parseLocalDate(b.appointment_date) - parseLocalDate(a.appointment_date));

      const requestBooking = () => {
        if (pendingReviewApts.length > 0) setReviewReminderApt(pendingReviewApts[0]);
        else setShowBooking(true);
      };
      const viewLabel = CLIENT_NAV.find(n => n.id === activeView)?.label || (activeView === 'home' ? t('client.welcome') : t('client.page_fallback'));
      // No menu mobile (overlay) o recuo do desktop não se aplica — sempre mostra completo
      const collapsed = sidebarCollapsed && !mobileSidebarOpen;
      const w = collapsed ? 64 : 220;

      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bp-bg)', position: 'relative' }}>
          {/* Mobile overlay */}
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}></div>}

          {/* Sidebar */}
          <div className={`admin-sidebar-desktop${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            <div style={{ width: w, minWidth: w, height: '100vh', background: 'var(--bp-bg)', borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column', transition: 'width .25s', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0 }}>
              <div style={{ padding: collapsed ? '18px 8px' : '18px 16px', borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, minHeight: 64 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 6 }}>
                  <img src="/img/icon-white.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                {!collapsed && <span className="syne" style={{ fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', whiteSpace: 'nowrap' }}>CS <span style={{ color: '#d4a574' }}>BARBER</span></span>}
              </div>
              {/* Collapse toggle — não faz sentido dentro da gaveta mobile, que já fecha sozinha */}
              {!mobileSidebarOpen && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bp-border)', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
                  <button onClick={() => setSidebarCollapsed(c => !c)} aria-label={sidebarCollapsed ? t('common.expand') : t('client.collapse')} title={sidebarCollapsed ? t('common.expand') : t('client.collapse')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 6, color: 'var(--bp-text-faint)', cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`} style={{ fontSize: 11 }}></i>
                  </button>
                </div>
              )}
              <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
                {CLIENT_NAV.map(item => {
                  const active = activeView === item.id;
                  return (
                    <button key={item.id} onClick={() => { setActiveView(item.id); setMobileSidebarOpen(false); }} title={collapsed ? item.label : ''} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginBottom: 2, background: active ? 'rgba(212,165,116,0.12)' : 'none', border: 'none', cursor: 'pointer', color: active ? '#d4a574' : 'var(--bp-text-muted)', transition: 'all .15s', textAlign: 'left', borderLeft: active ? '3px solid #d4a574' : '3px solid transparent' }}>
                      <i className={item.icon} style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                      {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
                    </button>
                  );
                })}
                <button onClick={() => { requestBooking(); setMobileSidebarOpen(false); }} title={collapsed ? t('client.book_new') : ''} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginTop: 8, background: 'none', border: '1px solid #d4a574', cursor: 'pointer', color: '#d4a574', transition: 'all .15s', textAlign: 'left' }}>
                  <i className="fas fa-calendar-plus" style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                  {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{t('client.book_new')}</span>}
                </button>
              </nav>
              <div style={{ padding: '12px 8px', borderTop: '1px solid var(--bp-border)' }}>
                {!collapsed && (
                  <div style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bp-card)' }}>
                    <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{user.name}</p>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{user.email}</p>
                  </div>
                )}
                <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                  <i className="fas fa-sign-out-alt" style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                  {!collapsed && <span>{t('common.logout')}</span>}
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '0 16px', height: 60, borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-bg)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setMobileSidebarOpen(o => !o)} className="admin-hamburger" aria-label={t('common.open_menu')} style={{ background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer', fontSize: 20, padding: '4px 6px', display: 'none' }}>
                  <i className="fas fa-bars" aria-hidden="true"></i>
                </button>
                <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>{activeView === 'home' ? t('client.welcome') : viewLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HeaderThemeToggle user={user} />
                <HeaderLanguageToggle />
                <ClientNotificationBell refreshKey={notifRefreshKey} onReviewClick={() => { setActiveView('home'); setAutoOpenReview(true); }} />
                <button onClick={onLogout} aria-label={t('common.logout')} style={{ background: 'none', border: '1px solid var(--bp-border)', borderRadius: 8, color: 'var(--bp-text-muted)', padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}><i className="fas fa-sign-out-alt" aria-hidden="true"></i></button>
              </div>
            </div>
            <main style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }} className="admin-main">
              {loading ? (
                <div className="text-center py-8"><i className="fas fa-spinner fa-spin text-3xl text-bp-primary"></i></div>
              ) : activeView === 'home' ? (
                <ClientHome user={user} nextApt={nextApt} upcomingApts={upcomingApts} services={services} barbers={barbers} pendingReviewApts={pendingReviewApts} onReviewSubmitted={loadData} showToast={(msg, type) => setToast({ msg, type })} onBook={requestBooking} onRequestCancel={setCancelRequestApt} autoOpenReview={autoOpenReview} onAutoOpenReviewHandled={() => setAutoOpenReview(false)} />
              ) : activeView === 'appointments' ? (
                <AppointmentsList appointments={appointments} myReviews={myReviews} onReviewSubmitted={loadData} showToast={(msg, type) => setToast({ msg, type })} onRequestCancel={setCancelRequestApt} />
              ) : activeView === 'services' ? (
                <ServicesList services={services} onBook={requestBooking} />
              ) : activeView === 'profile' ? (
                <ClientProfile user={user} appointments={appointments} showToast={(msg, type) => setToast({ msg, type })} onGoToAppointments={() => setActiveView('appointments')} />
              ) : (
                <div className="text-gray-400 text-center py-8">{t('client.not_found_page')}</div>
              )}
            </main>
          </div>
          {showBooking && (
            <BookingModal services={services} barbers={barbers} isFirstBooking={appointments.length === 0} onClose={() => setShowBooking(false)} onBook={async (data) => {
              const result = await apiCall('POST', '/appointments', data);
              if (result.ok) {
                setToast({ msg: t('client.appointment_booked_toast'), type: 'success' });
                setShowBooking(false);
                loadData();
              } else {
                setToast({ msg: result.data.error, type: 'error' });
              }
            }} />
          )}
          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}

          {/* Modal de confirmação obrigatória 1h antes */}
          {confirmModal && (
            <ConfirmationModal
              apt={confirmModal}
              onConfirm={handleConfirmPresence}
              onCancel={handleCancelWithFee}
            />
          )}

          {/* Modal de solicitação de cancelamento (acionado pelo cliente) */}
          {cancelRequestApt && (
            <CancelRequestModal
              apt={cancelRequestApt}
              feePct={cancelFeePct}
              onConfirm={handleRequestCancellation}
              onClose={() => setCancelRequestApt(null)}
            />
          )}

          {/* Lembrete de avaliação pendente antes de um novo agendamento */}
          {reviewReminderApt && (
            <ReviewReminderModal
              apt={reviewReminderApt}
              showToast={(msg, type) => setToast({ msg, type })}
              onSubmitted={() => { setReviewReminderApt(null); loadData(); setShowBooking(true); }}
              onSkip={() => { setReviewReminderApt(null); setShowBooking(true); }}
            />
          )}
        </div>
      );
    }

    function ReviewReminderModal({ apt, showToast, onSubmitted, onSkip }) {
      const { t } = useLang();
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}>
          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(212,165,116,0.15)', border: '2px solid rgba(212,165,116,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <i className="fas fa-star" style={{ color: '#d4a574', fontSize: 22 }}></i>
              </div>
              <h2 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 800, fontSize: 18, margin: '0 0 6px' }}>{t('client.review_reminder_title')}</h2>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 13, margin: 0 }}>{t('client.review_reminder_subtitle')}</p>
            </div>

            <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: '14px 18px' }}>
              <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{apt.service_name}</p>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: 0 }}>{t('common.with_barber', { barbeiro: apt.barber_name })}</p>
              <ReviewForm apt={apt} showToast={showToast} onSubmitted={onSubmitted} />
            </div>

            <button onClick={onSkip} style={{ width: '100%', background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 12, color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 13, padding: '12px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginTop: 14 }}>
              {t('client.skip_and_book')}
            </button>
          </div>
        </div>
      );
    }

    function ClientHome({ user, nextApt, upcomingApts, services, barbers, pendingReviewApts = [], onReviewSubmitted, showToast, onBook, onRequestCancel, autoOpenReview, onAutoOpenReviewHandled }) {
      const { t } = useLang();
      const [reviewingId, setReviewingId] = useState(null);
      const reviewApt = pendingReviewApts[0];
      const reviewCardRef = useRef(null);

      useEffect(() => {
        if (autoOpenReview && reviewApt) {
          setReviewingId(reviewApt.id);
          reviewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          onAutoOpenReviewHandled && onAutoOpenReviewHandled();
        }
      }, [autoOpenReview, reviewApt]);

      return (
        <div className="space-y-6">
          {reviewApt && (
            <div ref={reviewCardRef} className="panel rounded-2xl p-6 border border-bp-primary/40" style={{ background: 'linear-gradient(135deg, rgba(212,165,116,0.08), transparent)' }}>
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-bp-primary/15 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-star text-bp-primary text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold mb-1">{t('client.rate_your_service')}</p>
                  <p className="text-sm text-gray-400 mb-1">{t('client.how_was_it', { servico: reviewApt.service_name, barbeiro: reviewApt.barber_name })}</p>
                  {pendingReviewApts.length > 1 && (
                    <p className="text-xs text-gray-500 mb-2">{pendingReviewApts.length > 2 ? t('client.other_pending_review_plural', { count: pendingReviewApts.length - 1 }) : t('client.other_pending_review_singular', { count: pendingReviewApts.length - 1 })}</p>
                  )}
                  {reviewingId === reviewApt.id ? (
                    <ReviewForm apt={reviewApt} showToast={showToast} onSubmitted={() => { setReviewingId(null); onReviewSubmitted && onReviewSubmitted(); }} />
                  ) : (
                    <button onClick={() => setReviewingId(reviewApt.id)} className="bg-bp-primary text-black text-sm font-semibold px-4 py-2 rounded-lg mt-2">
                      <i className="fas fa-star mr-1.5"></i>{t('client.rate_now')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="panel rounded-2xl p-6 border border-bp-border">
              <h3 className="text-sm text-gray-400 uppercase mb-3 flex items-center gap-2">
                <i className="fas fa-clock text-bp-primary"></i> {t('profile.next_appointment')}
              </h3>
              {nextApt ? (
                <div>
                  <p className="text-2xl font-bold text-white mb-2">{nextApt.service_name}</p>
                  <p className="text-bp-primary mb-2">{nextApt.barber_name}</p>
                  <p className="text-gray-400 text-sm mb-4">📅 {nextApt.appointment_date} {t('common.at')} {nextApt.appointment_time}</p>
                  <p className="text-bp-primary font-bold text-lg mb-3">{fmtCur(nextApt.price)}</p>
                  {(nextApt.status === 'pending' || nextApt.status === 'confirmed') && (
                    <button onClick={() => onRequestCancel(nextApt)} className="text-bp-danger text-sm font-semibold flex items-center gap-1.5 hover:opacity-80 transition">
                      <i className="fas fa-calendar-times"></i> {t('client.request_cancellation_title')}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-gray-400">{t('client.no_upcoming_appointments')}</p>
              )}
            </div>
            <div className="panel rounded-2xl p-6 border border-bp-border">
              <h3 className="text-sm text-gray-400 uppercase mb-3 flex items-center gap-2">
                <i className="fas fa-chart-bar text-bp-secondary"></i> {t('client.stats')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('client.upcoming_appointments_count_label')}</span>
                  <span className="text-bp-success font-bold">{upcomingApts.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('client.favorite_barber')}</span>
                  <span className="text-bp-primary font-bold">{nextApt?.barber_name || '—'}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="panel rounded-2xl p-6 border border-bp-border">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <i className="fas fa-calendar-check text-bp-primary"></i> {t('client.upcoming_appointments_title')}
            </h3>
            {upcomingApts.length > 0 ? (
              <div className="space-y-3">
                {upcomingApts.map(apt => (
                  <div key={apt.id} className="p-4 rounded-xl bg-bp-card border border-bp-border hover:border-bp-primary transition">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-white">{apt.service_name}</h4>
                      <span className={`text-xs px-2 py-1 rounded-full ${statusClass(apt.status)}`}>{statusLabel(apt.status)}</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-1">👨 {apt.barber_name}</p>
                    <p className="text-sm text-gray-400">📅 {apt.appointment_date} {t('common.at')} {apt.appointment_time}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">{t('client.no_upcoming_appointments')}</p>
            )}
          </div>
          <button onClick={onBook} className="w-full py-4 bg-gradient-to-r from-bp-primary to-bp-secondary text-black font-bold rounded-xl hover:opacity-90 transition text-lg flex items-center justify-center gap-2">
            <i className="fas fa-calendar-plus"></i> {t('client.book_new_service')}
          </button>
        </div>
      );
    }

    function ServicesList({ services, onBook }) {
      const { t } = useLang();
      return (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {services.map(service => (
              <div key={service.id} className="service-card rounded-xl p-6 border border-bp-border">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white mb-1">{service.name}</h3>
                    <p className="text-gray-400 text-sm">{service.description}</p>
                  </div>
                  <i className="fas fa-cut text-bp-primary text-2xl"></i>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-bp-border">
                  <span className="text-bp-primary font-bold">{fmtCur(service.price)}</span>
                  <span className="text-gray-400 text-xs">{service.duration} min</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onBook} className="w-full py-4 bg-gradient-to-r from-bp-primary to-bp-secondary text-black font-bold rounded-xl hover:opacity-90 transition text-lg flex items-center justify-center gap-2">
            <i className="fas fa-calendar-plus"></i> {t('client.book_now')}
          </button>
        </div>
      );
    }

    function ReviewForm({ apt, review, onSubmitted, onCancel, showToast }) {
      const { t } = useLang();
      const isEdit = !!review;
      const [rating, setRating] = useState(review?.rating || 0);
      const [hoverRating, setHoverRating] = useState(0);
      const [comment, setComment] = useState(review?.comment || '');
      const [saving, setSaving] = useState(false);

      const submit = async () => {
        if (!rating) { showToast && showToast(t('review.select_rating_error'), 'error'); return; }
        setSaving(true);
        const res = isEdit
          ? await apiCall('PUT', `/reviews/${review.id}`, { rating, comment: comment.trim() })
          : await apiCall('POST', '/reviews', { appointment_id: apt.id, rating, comment: comment.trim() });
        setSaving(false);
        if (res.ok) { showToast && showToast(isEdit ? t('review.updated_toast') : t('review.submitted_toast'), 'success'); onSubmitted && onSubmitted(); }
        else showToast && showToast(res.data?.error || t('review.err_submit'), 'error');
      };

      return (
        <div className="mt-3 pt-3 border-t border-bp-border">
          <p className="text-sm text-gray-300 mb-2">{isEdit ? t('review.edit_your_review') : t('review.how_was_appointment')}</p>
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map(i => (
              <button key={i} type="button" onClick={() => setRating(i)} onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)} aria-label={t('review.star_aria', { n: i })}>
                <i className="fas fa-star" style={{ color: i <= (hoverRating || rating) ? '#f59e0b' : '#374151', fontSize: 20 }}></i>
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder={t('review.comment_placeholder')} className="w-full bg-bp-panel border border-bp-border rounded-lg text-white text-sm p-2 outline-none resize-vertical mb-2" />
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving} className="bg-bp-primary text-black font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-50">
              {saving ? t('common.saving') : isEdit ? t('review.save_changes') : t('review.submit')}
            </button>
            {isEdit && (
              <button onClick={onCancel} disabled={saving} className="text-sm text-gray-400 px-3 py-2 rounded-lg hover:text-gray-300">{t('common.cancel')}</button>
            )}
          </div>
        </div>
      );
    }

    function WaitlistSection({ showToast }) {
      const { t } = useLang();
      const [items, setItems] = useState([]);
      const [loading, setLoading] = useState(true);
      const [cancelingId, setCancelingId] = useState(null);

      const load = async () => {
        const res = await apiCall('GET', '/waitlist/mine');
        if (res.ok) setItems(res.data);
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      const cancel = async (id) => {
        setCancelingId(id);
        const res = await apiCall('DELETE', `/waitlist/${id}`);
        setCancelingId(null);
        if (res.ok) { showToast && showToast(t('waitlist.removed_toast'), 'info'); load(); }
        else showToast && showToast(res.data?.error || t('waitlist.err_remove'), 'error');
      };

      if (loading || items.length === 0) return null;

      return (
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <i className="fas fa-bell text-bp-primary"></i> {t('waitlist.title')}
            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-bp-accent/20 text-bp-accent">{items.length}</span>
          </h3>
          <div className="space-y-3">
            {items.map(w => (
              <div key={w.id} className="panel rounded-xl p-4 border border-bp-border flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-white">{w.service_name}</p>
                  <p className="text-sm text-gray-400">👨 {w.barber_name} · 📅 {w.preferred_date ? fmtDate(w.preferred_date) : t('waitlist.any_date')}</p>
                </div>
                <button onClick={() => cancel(w.id)} disabled={cancelingId === w.id} className="text-bp-danger text-sm font-semibold px-3 py-1.5 rounded-lg border border-bp-danger/30 hover:bg-bp-danger/10 transition disabled:opacity-50">
                  {cancelingId === w.id ? t('waitlist.removing') : t('waitlist.leave_queue')}
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    function AppointmentsList({ appointments, myReviews = [], onReviewSubmitted, showToast, onRequestCancel }) {
      const { t, lang } = useLang();
      const [reviewingId, setReviewingId] = useState(null);
      const [editingReviewId, setEditingReviewId] = useState(null);
      const [deletingReviewId, setDeletingReviewId] = useState(null);
      const today = todayStart();
      const upcoming = appointments.filter(a => a.status !== 'cancelled' && parseLocalDate(a.appointment_date) >= today).sort((a, b) => parseLocalDate(a.appointment_date) - parseLocalDate(b.appointment_date));
      const past = appointments.filter(a => a.status === 'cancelled' || parseLocalDate(a.appointment_date) < today).sort((a, b) => parseLocalDate(b.appointment_date) - parseLocalDate(a.appointment_date));
      const reviewByAptId = useMemo(() => Object.fromEntries(myReviews.map(r => [r.appointment_id, r])), [myReviews]);

      const handleDeleteReview = async (review) => {
        if (!confirm(t('appointments.confirm_delete_review'))) return;
        setDeletingReviewId(review.id);
        const res = await apiCall('DELETE', `/reviews/${review.id}`);
        setDeletingReviewId(null);
        if (res.ok) { showToast && showToast(t('appointments.review_deleted_toast'), 'success'); onReviewSubmitted && onReviewSubmitted(); }
        else showToast && showToast(res.data?.error || t('appointments.err_delete_review'), 'error');
      };

      const AptCard = ({ apt, dim }) => {
        const review = reviewByAptId[apt.id];
        const canReview = apt.status === 'completed' && !review;
        const canCancel = !dim && (apt.status === 'pending' || apt.status === 'confirmed');
        return (
          <div className={`panel rounded-xl p-4 border border-bp-border hover:border-bp-primary transition ${dim ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-semibold text-white">{apt.service_name}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(apt.status)}`}>{statusLabel(apt.status)}</span>
                </div>
                <p className="text-sm text-gray-400 mb-1">👨 {apt.barber_name}</p>
                <p className="text-sm text-gray-400">📅 {parseLocalDate(apt.appointment_date).toLocaleDateString(localeTag(lang))}{apt.appointment_time ? ` ${t('common.at')} ${apt.appointment_time}` : ''}</p>
                {apt.notes && <p className="text-xs text-gray-500 mt-1 italic">"{apt.notes}"</p>}
              </div>
              <p className="text-bp-primary font-bold text-base whitespace-nowrap">{fmtCur(apt.price)}</p>
            </div>

            {review && editingReviewId !== review.id && (
              <div className="mt-3 pt-3 border-t border-bp-border">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{t('appointments.your_review')}</span>
                    <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <i key={i} className="fas fa-star" style={{ color: i <= review.rating ? '#f59e0b' : '#374151', fontSize: 12 }}></i>)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEditingReviewId(review.id)} aria-label={t('appointments.edit_review_aria')} className="text-xs text-gray-400 hover:text-bp-primary"><i className="fas fa-pencil-alt"></i></button>
                    <button onClick={() => handleDeleteReview(review)} disabled={deletingReviewId === review.id} aria-label={t('appointments.delete_review_aria')} className="text-xs text-gray-400 hover:text-bp-danger disabled:opacity-50"><i className="fas fa-trash"></i></button>
                  </div>
                </div>
                {review.comment && <p className="text-sm text-gray-300 italic">"{review.comment}"</p>}
                {review.reply && (
                  <div className="mt-2 p-2 bg-bp-panel border border-bp-border rounded-lg border-l-2 border-l-bp-primary">
                    <p className="text-xs text-bp-primary font-semibold mb-0.5">{t('appointments.reply_from', { barbeiro: apt.barber_name })}</p>
                    <p className="text-sm text-gray-300">{review.reply}</p>
                  </div>
                )}
              </div>
            )}
            {review && editingReviewId === review.id && (
              <ReviewForm apt={apt} review={review} showToast={showToast}
                onCancel={() => setEditingReviewId(null)}
                onSubmitted={() => { setEditingReviewId(null); onReviewSubmitted && onReviewSubmitted(); }} />
            )}

            {canReview && reviewingId !== apt.id && (
              <div className="mt-3 pt-3 border-t border-bp-border">
                <button onClick={() => setReviewingId(apt.id)} className="text-bp-primary text-sm font-semibold flex items-center gap-1.5">
                  <i className="fas fa-star"></i> {t('appointments.rate_appointment')}
                </button>
              </div>
            )}
            {canReview && reviewingId === apt.id && (
              <ReviewForm apt={apt} showToast={showToast} onSubmitted={() => { setReviewingId(null); onReviewSubmitted && onReviewSubmitted(); }} />
            )}

            {canCancel && (
              <div className="mt-3 pt-3 border-t border-bp-border">
                <button onClick={() => onRequestCancel(apt)} className="text-bp-danger text-sm font-semibold flex items-center gap-1.5 hover:opacity-80 transition">
                  <i className="fas fa-calendar-times"></i> {t('client.request_cancellation_title')}
                </button>
              </div>
            )}
          </div>
        );
      };

      return (
        <div className="space-y-8">
          <WaitlistSection showToast={showToast} />
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <i className="fas fa-calendar-check text-bp-primary"></i> {t('client.upcoming_appointments_title')}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-bp-accent/20 text-bp-accent">{upcoming.length}</span>
            </h3>
            {upcoming.length > 0 ? <div className="space-y-3">{upcoming.map(apt => <AptCard key={apt.id} apt={apt} dim={false} />)}</div> : (
              <div className="panel rounded-xl p-8 border border-bp-border text-center">
                <i className="fas fa-calendar-times text-4xl text-gray-600 mb-3 block"></i>
                <p className="text-gray-400">{t('appointments.no_upcoming')}</p>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <i className="fas fa-history text-bp-secondary"></i> {t('appointments.history')}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{past.length}</span>
            </h3>
            {past.length > 0 ? (
              <div className="space-y-3">
                {past.slice(0, 10).map(apt => <AptCard key={apt.id} apt={apt} dim={true} />)}
                {past.length > 10 && <p className="text-center text-gray-500 text-sm">{t('appointments.more_past', { count: past.length - 10 })}</p>}
              </div>
            ) : (
              <div className="panel rounded-xl p-8 border border-bp-border text-center">
                <i className="fas fa-clock text-4xl text-gray-600 mb-3 block"></i>
                <p className="text-gray-400">{t('appointments.no_history')}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    /* ======================================================
       BOOKING MODAL
    ====================================================== */
    const BARBER_INITIALS = name => name ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() : '??';
    const BARBER_COLORS = ['#d4a574', '#8b7355', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

    function IntroCarousel({ slides }) {
      const { t } = useLang();
      const SLIDE_DURATION = 4500;
      const [idx, setIdx] = useState(0);
      const slide = slides[0] ? slides[idx] : null;
      const autoAdvance = slides.length > 1 && slide?.type !== 'video';

      useEffect(() => {
        if (!autoAdvance) return;
        const t = setTimeout(() => setIdx(i => (i + 1) % slides.length), SLIDE_DURATION);
        return () => clearTimeout(t);
      }, [idx, autoAdvance, slides.length]);

      if (slides.length === 0) return null;
      const go = (delta) => setIdx(i => (i + delta + slides.length) % slides.length);
      return (
        <div style={{ marginBottom: 20 }}>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--bp-border2)', aspectRatio: '1', background: 'var(--bp-card)' }}>
            {slides.map((s, i) => {
              const active = i === idx;
              const layerStyle = { position: 'absolute', inset: 0, opacity: active ? 1 : 0, transform: active ? 'scale(1)' : 'scale(1.035)', transition: 'opacity 1s ease, transform 1.2s ease', pointerEvents: active ? 'auto' : 'none' };
              return (
                <div key={i} style={layerStyle}>
                  {s.type === 'photo' ? (
                    <img src={s.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : s.embedUrl ? (
                    <iframe src={s.embedUrl} title={t('booking.watch_intro')} style={{ width: '100%', height: '100%', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                  ) : (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#d4a574', textDecoration: 'none' }}>
                      <i className="fas fa-circle-play" style={{ fontSize: 36 }}></i>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t('booking.watch_intro')}</span>
                    </a>
                  )}
                </div>
              );
            })}
            {slides.length > 1 && (
              <>
                <button onClick={() => go(-1)} aria-label={t('booking.prev')} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-chevron-left" aria-hidden="true"></i></button>
                <button onClick={() => go(1)} aria-label={t('booking.next')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-chevron-right" aria-hidden="true"></i></button>
                <span style={{ position: 'absolute', bottom: 8, right: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{idx + 1}/{slides.length}</span>
              </>
            )}
          </div>
          {slides.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
              {slides.map((s, i) => (
                <button key={i} onClick={() => setIdx(i)} aria-label={t('booking.go_to_item', { n: i + 1 })} style={{ position: 'relative', overflow: 'hidden', width: i === idx ? 18 : 7, height: 7, borderRadius: 4, background: 'var(--bp-border2)', border: 'none', cursor: 'pointer', transition: 'width .2s', padding: 0 }}>
                  {i === idx && (
                    <span key={autoAdvance ? `p-${idx}` : `s-${idx}`} style={{ position: 'absolute', inset: 0, background: '#d4a574', borderRadius: 4, transformOrigin: 'left', transform: autoAdvance ? 'scaleX(0)' : 'scaleX(1)', animation: autoAdvance ? `carouselProgress ${SLIDE_DURATION}ms linear forwards` : 'none' }}></span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    function BookingModal({ services, barbers, isFirstBooking, onClose, onBook }) {
      const { t, lang } = useLang();
      const [step, setStep] = useState(1);
      const [selectedService, setSelectedService] = useState(null);
      const [selectedBarber, setSelectedBarber] = useState(null);
      const [introBarber, setIntroBarber] = useState(null);
      const [calYear, setCalYear] = useState(new Date().getFullYear());
      const [calMonth, setCalMonth] = useState(new Date().getMonth());
      const [selectedDate, setSelectedDate] = useState('');
      const [selectedTime, setSelectedTime] = useState('');
      const [availableTimes, setAvailableTimes] = useState([]);
      const [loadingTimes, setLoadingTimes] = useState(false);
      const [notes, setNotes] = useState('');
      const [submitting, setSubmitting] = useState(false);
      const [dayAvailability, setDayAvailability] = useState({});
      const [joiningWaitlist, setJoiningWaitlist] = useState(false);
      const [joinedWaitlist, setJoinedWaitlist] = useState(false);

      const steps = [t('booking.step_service'), t('booking.step_barber'), t('booking.step_datetime'), t('booking.step_confirmation')];
      const today = new Date(); today.setHours(0, 0, 0, 0);

      useEffect(() => {
        if (selectedBarber && selectedDate) {
          let stale = false;
          setLoadingTimes(true);
          setSelectedTime('');
          setJoinedWaitlist(false);
          const serviceQs = selectedService ? `?service_id=${selectedService.id}` : '';
          apiCall('GET', `/appointments/available/${selectedBarber.id}/${selectedDate}${serviceQs}`)
            .then(r => {
              // Ignora a resposta se barbeiro/data/serviço já mudaram de novo enquanto essa
              // requisição estava em voo — evita que uma resposta antiga (ex: de uma data sem
              // horários) sobrescreva o resultado correto da seleção atual.
              if (stale) return;
              setAvailableTimes(r.ok ? (r.data.available || []) : []);
              setLoadingTimes(false);
            });
          return () => { stale = true; };
        }
      }, [selectedBarber, selectedDate, selectedService]);

      const joinWaitlist = async () => {
        setJoiningWaitlist(true);
        const res = await apiCall('POST', '/waitlist', { service_id: selectedService.id, barber_id: selectedBarber.id, preferred_date: selectedDate });
        setJoiningWaitlist(false);
        if (res.ok) setJoinedWaitlist(true);
      };

      // Disponibilidade do mês inteiro, usada para os indicadores no calendário
      useEffect(() => {
        if (!selectedBarber) return;
        const total = new Date(calYear, calMonth + 1, 0).getDate();
        const pad = n => String(n).padStart(2, '0');
        const todayCopy = new Date(); todayCopy.setHours(0, 0, 0, 0);
        const dateStrs = [];
        for (let d = 1; d <= total; d++) {
          const dt = new Date(calYear, calMonth, d);
          if (dt < todayCopy) continue;
          dateStrs.push(`${calYear}-${pad(calMonth + 1)}-${pad(d)}`);
        }
        setDayAvailability({});
        const serviceQs = selectedService ? `?service_id=${selectedService.id}` : '';
        Promise.all(dateStrs.map(ds =>
          apiCall('GET', `/appointments/available/${selectedBarber.id}/${ds}${serviceQs}`)
            .then(r => ({ ds, count: r.ok ? (r.data.available || []).length : 0 }))
        )).then(results => {
          setDayAvailability(prev => {
            const next = { ...prev };
            results.forEach(({ ds, count }) => { next[ds] = count; });
            return next;
          });
        });
      }, [selectedBarber, calYear, calMonth, selectedService]);

      const FEW_SLOTS_THRESHOLD = 3;
      const dayDotColor = (dateStr) => {
        const count = dayAvailability[dateStr];
        if (count === undefined || count === 0) return null;
        return count <= FEW_SLOTS_THRESHOLD ? '#f59e0b' : '#10b981';
      };

      const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
      const getFirstDay = (y, m) => new Date(y, m, 1).getDay();

      const calDays = () => {
        const days = [];
        const fd = getFirstDay(calYear, calMonth);
        const total = getDaysInMonth(calYear, calMonth);
        for (let i = 0; i < fd; i++) days.push(null);
        for (let d = 1; d <= total; d++) days.push(d);
        return days;
      };

      const selectDay = (d) => {
        if (!d) return;
        const dt = new Date(calYear, calMonth, d);
        if (dt < today) return;
        const pad = n => String(n).padStart(2, '0');
        setSelectedDate(`${calYear}-${pad(calMonth + 1)}-${pad(d)}`);
      };

      const isSelected = (d) => {
        if (!d || !selectedDate) return false;
        const pad = n => String(n).padStart(2, '0');
        return selectedDate === `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
      };

      const isPast = (d) => { if (!d) return false; return new Date(calYear, calMonth, d) < today; };
      const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
      const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

      const canNext = () => {
        if (step === 1) return !!selectedService;
        if (step === 2) return !!selectedBarber;
        if (step === 3) return !!(selectedDate && selectedTime);
        return true;
      };

      const handleConfirm = async () => {
        setSubmitting(true);
        await onBook({ service_id: selectedService.id, barber_id: selectedBarber.id, appointment_date: selectedDate, appointment_time: selectedTime, notes });
        setSubmitting(false);
      };

      return (
        <>
        <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
          <div className="booking-modal-inner" style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 20, width: '100%', maxWidth: 860, maxHeight: '95vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="booking-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--bp-border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 700, margin: 0 }}>{t('booking.title')}</h2>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '2px 0 0' }}>{t('booking.subtitle')}</p>
              </div>
              <button onClick={onClose} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 20, cursor: 'pointer' }}><i className="fas fa-times" aria-hidden="true"></i></button>
            </div>
            <div className="booking-steps-bar" style={{ padding: '12px 20px', borderBottom: '1px solid var(--bp-border2)', display: 'flex', gap: 8, flexShrink: 0, overflowX: 'auto' }}>
              {steps.map((s, i) => {
                const n = i + 1; const done = step > n; const active = step === n;
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: done || active ? '#d4a574' : 'var(--bp-border2)', color: done || active ? '#000' : 'var(--bp-text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {done ? <i className="fas fa-check" style={{ fontSize: 10 }}></i> : n}
                      </div>
                      <span style={{ fontSize: 13, color: active || done ? '#d4a574' : 'var(--bp-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s}</span>
                    </div>
                    {i < steps.length - 1 && <div style={{ flex: 1, height: 1, background: step > n ? '#d4a574' : 'var(--bp-border2)', minWidth: 8 }}></div>}
                  </div>
                );
              })}
            </div>
            <div className="booking-body" style={{ flex: 1, overflow: 'auto', padding: '20px 20px' }}>
              {step === 1 && (
                <div>
                  <h3 style={{ color: 'var(--bp-text)', fontWeight: 700, marginBottom: 6 }}>{t('booking.choose_service')}</h3>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, marginBottom: 16 }}>{t('booking.select_desired_service')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {services.map(s => {
                      const active = selectedService?.id === s.id;
                      return (
                        <div key={s.id} onClick={() => setSelectedService(s)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 12, border: `2px solid ${active ? '#d4a574' : 'var(--bp-border2)'}`, background: active ? 'rgba(212,165,116,0.08)' : 'var(--bp-card)', cursor: 'pointer', transition: 'all .2s' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: active ? '#d4a574' : 'var(--bp-border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {active ? <i className="fas fa-check" style={{ color: '#000', fontSize: 14 }}></i> : <i className="fas fa-cut" style={{ color: 'var(--bp-text-faint)', fontSize: 14 }}></i>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: 'var(--bp-text)', fontWeight: 600, margin: 0, fontSize: 15 }}>{s.name}</p>
                            <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '2px 0 0' }}>{s.description || t('booking.professional_service_fallback')}</p>
                            <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}><i className="fas fa-clock" style={{ marginRight: 4 }}></i>{s.duration} min</span>
                          </div>
                          <span style={{ color: '#d4a574', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{fmtCur(s.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h3 style={{ color: 'var(--bp-text)', fontWeight: 700, marginBottom: 6 }}>{t('booking.choose_barber')}</h3>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, marginBottom: 16 }}>
                    {isFirstBooking ? t('booking.select_barber_first_time') : t('booking.select_barber')}
                  </p>
                  <div className="booking-barbers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {barbers.map((b, idx) => {
                      const active = selectedBarber?.id === b.id;
                      const color = BARBER_COLORS[idx % BARBER_COLORS.length];
                      return (
                        <div key={b.id} onClick={() => setSelectedBarber(b)} style={{ position: 'relative', padding: '20px 16px', borderRadius: 14, border: `2px solid ${active ? '#d4a574' : 'var(--bp-border2)'}`, background: active ? 'rgba(212,165,116,0.08)' : 'var(--bp-card)', cursor: 'pointer', textAlign: 'center', transition: 'all .2s' }}>
                          {active && <div style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: '50%', background: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-check" style={{ color: '#000', fontSize: 9 }}></i></div>}
                          <div style={{ width: 64, height: 64, borderRadius: '50%', background: color + '33', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20, fontWeight: 700, color, overflow: 'hidden' }}>
                            {b.photo_url ? <img src={b.photo_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : BARBER_INITIALS(b.name)}
                          </div>
                          <p style={{ color: 'var(--bp-text)', fontWeight: 600, margin: '0 0 2px', fontSize: 14 }}>{b.name}</p>
                          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 8px' }}>{b.specialty || t('booking.specialist_fallback')}</p>
                          {b.rating && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: isFirstBooking ? 8 : 0 }}><i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 11 }}></i><span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>{b.rating}</span></div>}
                          {isFirstBooking && (
                            <button onClick={e => { e.stopPropagation(); setIntroBarber(b); }} style={{ marginTop: 4, background: 'none', border: '1px solid rgba(212,165,116,0.4)', borderRadius: 20, color: '#d4a574', fontSize: 11, fontWeight: 600, padding: '4px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <i className="fas fa-circle-play" style={{ fontSize: 10 }}></i>{t('booking.meet')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="booking-step3-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
                  <div>
                    <h3 style={{ color: 'var(--bp-text)', fontWeight: 700, marginBottom: 16 }}>{t('booking.select_date')}</h3>
                    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <button onClick={prevMonth} aria-label={t('booking.prev_month')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 32, height: 32, cursor: 'pointer' }}><i className="fas fa-chevron-left" aria-hidden="true" style={{ fontSize: 12 }}></i></button>
                        <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 15 }}>{monthNames(lang)[calMonth]} {calYear}</span>
                        <button onClick={nextMonth} aria-label={t('booking.next_month')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 32, height: 32, cursor: 'pointer' }}><i className="fas fa-chevron-right" aria-hidden="true" style={{ fontSize: 12 }}></i></button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
                        {t('booking.weekday_letters').split(',').map((d, i) => <div key={i} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, padding: '4px 0' }}>{d}</div>)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                        {calDays().map((d, i) => {
                          const past = isPast(d); const sel = isSelected(d);
                          const pad = n => String(n).padStart(2, '0');
                          const dateStr = d ? `${calYear}-${pad(calMonth + 1)}-${pad(d)}` : null;
                          const dotColor = !past && dateStr ? dayDotColor(dateStr) : null;
                          return (
                            <div key={i} onClick={() => !past && selectDay(d)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 13, cursor: d && !past ? 'pointer' : 'default', background: sel ? '#d4a574' : 'transparent', color: !d ? 'transparent' : past ? '#374151' : sel ? '#000' : 'var(--bp-text)', fontWeight: sel ? 700 : 400, transition: 'all .15s' }}>
                              <span>{d || ''}</span>
                              {dotColor && <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, marginTop: 2 }}></span>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bp-border2)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                          <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('booking.slots_available')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                          <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('booking.almost_full')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ color: 'var(--bp-text)', fontWeight: 700, marginBottom: 16 }}>{t('booking.available_times')}</h3>
                    {!selectedDate ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 24 }}>
                        <p style={{ color: 'var(--bp-text-faint)', textAlign: 'center', fontSize: 14 }}>{t('booking.select_date_on_calendar')}</p>
                      </div>
                    ) : loadingTimes ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fas fa-spinner fa-spin" style={{ color: '#d4a574', fontSize: 24 }}></i></div>
                    ) : availableTimes.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 24, gap: 12 }}>
                        <p style={{ color: 'var(--bp-text-faint)', textAlign: 'center', fontSize: 14, margin: 0 }}>{t('booking.no_times_available')}</p>
                        {joinedWaitlist ? (
                          <p style={{ color: '#10b981', fontSize: 13, textAlign: 'center', margin: 0 }}><i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>{t('booking.joined_waitlist')}</p>
                        ) : (
                          <button onClick={joinWaitlist} disabled={joiningWaitlist} style={{ background: 'none', border: '1px solid #d4a574', borderRadius: 8, color: '#d4a574', fontWeight: 600, fontSize: 13, padding: '8px 16px', cursor: joiningWaitlist ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            {joiningWaitlist ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>{t('booking.joining_waitlist')}</span> : <span><i className="fas fa-bell" style={{ marginRight: 6 }}></i>{t('booking.join_waitlist')}</span>}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {availableTimes.map(time => {
                          const sel = selectedTime === time;
                          return <div key={time} onClick={() => setSelectedTime(time)} style={{ padding: '10px 0', textAlign: 'center', borderRadius: 10, border: `2px solid ${sel ? '#d4a574' : 'var(--bp-border2)'}`, background: sel ? '#d4a574' : 'var(--bp-card)', color: sel ? '#000' : 'var(--bp-text)', fontWeight: sel ? 700 : 400, fontSize: 14, cursor: 'pointer', transition: 'all .15s' }}>{time}</div>;
                        })}
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ color: 'var(--bp-text-faint)', fontSize: 13, display: 'block', marginBottom: 6 }}>{t('booking.notes_label')}</label>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('booking.notes_placeholder')} style={{ width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, color: 'var(--bp-text)', fontSize: 13, padding: '10px 12px', resize: 'none', height: 72, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div>
                  <h3 style={{ color: 'var(--bp-text)', fontWeight: 700, marginBottom: 6 }}>{t('booking.confirm_title')}</h3>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, marginBottom: 20 }}>{t('booking.confirm_subtitle')}</p>
                  <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <div className="booking-confirm-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                      {[
                        { icon: 'fa-cut', label: t('booking.label_service'), val: selectedService?.name },
                        { icon: 'fa-user', label: t('booking.label_barber'), val: selectedBarber?.name },
                        { icon: 'fa-calendar', label: t('booking.label_date'), val: selectedDate ? parseLocalDate(selectedDate).toLocaleDateString(localeTag(lang)) : '—' },
                        { icon: 'fa-clock', label: t('booking.label_time'), val: selectedTime },
                        { icon: 'fa-tag', label: t('booking.label_price'), val: fmtCur(selectedService?.price), gold: true },
                        { icon: 'fa-hourglass-half', label: t('booking.label_duration'), val: selectedService?.duration ? selectedService.duration + ' min' : '—' },
                      ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className={`fas ${item.icon}`} style={{ color: '#d4a574', fontSize: 16 }}></i>
                          <div><p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{item.label}</p><p style={{ color: item.gold ? '#d4a574' : 'var(--bp-text)', fontWeight: item.gold ? 700 : 600, margin: 0, fontSize: item.gold ? 16 : 14 }}>{item.val}</p></div>
                        </div>
                      ))}
                    </div>
                    {notes && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bp-border2)' }}><p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 4px' }}>{t('booking.label_notes')}</p><p style={{ color: '#9ca3af', fontSize: 13, margin: 0, fontStyle: 'italic' }}>"{notes}"</p></div>}
                  </div>
                </div>
              )}
            </div>
            <div className="booking-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--bp-border2)', display: 'flex', gap: 12, flexShrink: 0 }}>
              <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer' }}>
                {step === 1 ? t('common.cancel') : t('booking.back_arrow')}
              </button>
              {step < 4 ? (
                <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: canNext() ? 'linear-gradient(to right, #d4a574, #8b7355)' : 'var(--bp-border2)', color: canNext() ? '#000' : '#4b5563', fontSize: 14, fontWeight: 700, cursor: canNext() ? 'pointer' : 'not-allowed' }}>
                  {t('booking.continue_arrow')}
                </button>
              ) : (
                <button onClick={handleConfirm} disabled={submitting} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: submitting ? 'var(--bp-border2)' : 'linear-gradient(to right, #d4a574, #8b7355)', color: submitting ? '#4b5563' : '#000', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                  {submitting ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>{t('booking.booking_in_progress')}</span> : t('booking.confirm_booking')}
                </button>
              )}
            </div>
          </div>
        </div>

        {introBarber && (() => {
          const idx = barbers.findIndex(x => x.id === introBarber.id);
          const color = BARBER_COLORS[idx >= 0 ? idx % BARBER_COLORS.length : 0];
          const photos = (() => { try { return JSON.parse(introBarber.portfolio_photos || '[]'); } catch { return []; } })();
          const embedUrl = getVideoEmbedUrl(introBarber.intro_video_url);
          const slides = [
            ...photos.map(src => ({ type: 'photo', src })),
            ...(introBarber.intro_video_url ? [{ type: 'video', embedUrl, url: introBarber.intro_video_url }] : []),
          ];
          const choose = () => { setSelectedBarber(introBarber); setIntroBarber(null); };
          return (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }} onClick={() => setIntroBarber(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '2px solid rgba(212,165,116,0.4)', borderRadius: 24, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.8)', animation: 'confirmModalIn .35s cubic-bezier(.34,1.56,.64,1) forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: color + '33', border: `2.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color, overflow: 'hidden', flexShrink: 0 }}>
                      {introBarber.photo_url ? <img src={introBarber.photo_url} alt={introBarber.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : BARBER_INITIALS(introBarber.name)}
                    </div>
                    <div>
                      <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 17, margin: 0 }}>{introBarber.name}</p>
                      <p style={{ color: '#d4a574', fontSize: 13, margin: '2px 0 0' }}>{introBarber.specialty || t('booking.specialist_fallback')}</p>
                    </div>
                    {getInstagramUrl(introBarber.instagram) && (
                      <a href={getInstagramUrl(introBarber.instagram)} target="_blank" rel="noopener noreferrer" title={t('booking.view_instagram')} aria-label={t('booking.instagram_of', { nome: introBarber.name })}
                        style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--bp-text-faint)', fontSize: 13, textDecoration: 'none', transition: 'border-color .15s, color .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-faint)'; }}>
                        <i className="fab fa-instagram" aria-hidden="true"></i>
                      </a>
                    )}
                  </div>
                  <button onClick={() => setIntroBarber(null)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 18, cursor: 'pointer' }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-quote-left" style={{ color: '#d4a574' }}></i>{t('booking.my_story')}
                  </p>
                  <p style={{ color: 'var(--bp-text)', fontSize: 15, lineHeight: 1.7, margin: 0, fontStyle: 'italic', fontFamily: 'Syne, sans-serif', fontWeight: 500, borderLeft: '3px solid #d4a574', paddingLeft: 14 }}>
                    {introBarber.bio || t('booking.bio_fallback')}
                  </p>
                </div>

                <IntroCarousel slides={slides} key={introBarber.id} />

                <button onClick={choose} style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'linear-gradient(to right, #d4a574, #8b7355)', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {t('booking.choose_barber_button', { nome: introBarber.name.split(' ')[0] })}
                </button>
              </div>
            </div>
          );
        })()}
        </>
      );
    }

    /* ======================================================
       NOTIFICATION CENTER
    ====================================================== */
    const NOTIF_TYPES = {
      new_appointment: { icon: 'fa-calendar-plus', bg: 'rgba(59,130,246,.18)', color: '#3b82f6', labelKey: 'notif.type_appointment' },
      pending: { icon: 'fa-clock', bg: 'rgba(245,158,11,.18)', color: '#f59e0b', labelKey: 'notif.type_pending' },
      cancelled: { icon: 'fa-calendar-times', bg: 'rgba(239,68,68,.18)', color: '#ef4444', labelKey: 'notif.type_cancelled' },
      completed: { icon: 'fa-check-circle', bg: 'rgba(16,185,129,.18)', color: '#10b981', labelKey: 'notif.type_completed' },
      new_client: { icon: 'fa-user-plus', bg: 'rgba(139,92,246,.18)', color: '#a78bfa', labelKey: 'notif.type_client' },
      revenue: { icon: 'fa-dollar-sign', bg: 'rgba(212,165,116,.18)', color: '#d4a574', labelKey: 'notif.type_revenue' },
      alert: { icon: 'fa-exclamation-triangle', bg: 'rgba(239,68,68,.15)', color: '#f87171', labelKey: 'notif.type_alert' },
      review: { icon: 'fa-star', bg: 'rgba(245,158,11,.15)', color: '#fbbf24', labelKey: 'notif.type_review' },
      system: { icon: 'fa-cog', bg: 'rgba(107,114,128,.18)', color: '#9ca3af', labelKey: 'notif.type_system' },
    };

    function buildNotifications(appointments, stats, clients, reviews) {
      if (!stats) stats = {};
      const now = new Date();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const notifs = [];
      let id = 1;

      const push = (type, title, body, time, extra = {}) =>
        notifs.push({ id: id++, type, title, body, time, read: false, ...extra });

      if (appointments && appointments.length > 0) {
        // Pending appointments
        const pending = appointments.filter(a => a.status === 'pending');
        if (pending.length > 0) {
          const latest = pending.reduce((l, a) => (!l || new Date(a.created_at) > new Date(l.created_at)) ? a : l, null);
          push('pending', translateNow(pending.length > 1 ? 'notif.pending_plural' : 'notif.pending_singular', { count: pending.length }),
            translateNow('notif.confirm_to_avoid_conflicts'),
            latest && latest.created_at ? new Date(latest.created_at) : now, { priority: 'high', count: pending.length, items: pending, itemKind: 'appointment' });
        }

        // Today's appointments
        const todayApts = appointments.filter(a => {
          const d = new Date(a.appointment_date + 'T00:00:00');
          return d.getTime() === today.getTime() && a.status !== 'cancelled';
        });
        if (todayApts.length > 0) {
          push('new_appointment', translateNow(todayApts.length > 1 ? 'notif.today_plural' : 'notif.today_singular', { count: todayApts.length }),
            `${todayApts.map(a => a.client_name).slice(0, 3).join(', ')}${todayApts.length > 3 ? ` +${todayApts.length - 3}` : ''}.`,
            today, { priority: 'normal', items: todayApts, itemKind: 'appointment' });
        }

        // Recently completed
        const completed = appointments.filter(a => a.status === 'completed');
        if (completed.length > 0) {
          const revenue = completed.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
          const latest = completed.reduce((l, a) => (!l || new Date(a.created_at) > new Date(l.created_at)) ? a : l, null);
          push('completed', translateNow(completed.length > 1 ? 'notif.completed_plural' : 'notif.completed_singular', { count: completed.length }),
            translateNow('notif.revenue_generated', { valor: revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }),
            latest && latest.created_at ? new Date(latest.created_at) : now, { priority: 'low', items: completed, itemKind: 'appointment' });
        }

        // Cancelled appointments
        const cancelled = appointments.filter(a => a.status === 'cancelled');
        if (cancelled.length > 0) {
          const latest = cancelled.reduce((l, a) => (!l || new Date(a.created_at) > new Date(l.created_at)) ? a : l, null);
          push('cancelled', translateNow(cancelled.length > 1 ? 'notif.cancelled_plural' : 'notif.cancelled_singular', { count: cancelled.length }),
            translateNow('notif.check_reschedule'),
            latest && latest.created_at ? new Date(latest.created_at) : now, { priority: 'high', items: cancelled, itemKind: 'appointment' });
        }

        // Tomorrow appointments
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowApts = appointments.filter(a => {
          const d = new Date(a.appointment_date + 'T00:00:00');
          return d.getTime() === tomorrow.getTime() && a.status !== 'cancelled';
        });
        if (tomorrowApts.length > 0) {
          push('new_appointment', translateNow(tomorrowApts.length > 1 ? 'notif.tomorrow_plural' : 'notif.tomorrow_singular', { count: tomorrowApts.length }),
            translateNow('notif.prepare_team', { names: tomorrowApts.map(a => a.barber_name).filter((v, i, a) => a.indexOf(v) === i).join(', ') }),
            now, { priority: 'normal', items: tomorrowApts, itemKind: 'appointment' });
        }
      }

      if (stats) {
        // Low barber activity alert
        if (stats.barber_stats && stats.barber_stats.length > 0) {
          const idle = stats.barber_stats.filter(b => (b.completed || 0) === 0);
          if (idle.length > 0) {
            push('alert', translateNow(idle.length > 1 ? 'notif.idle_barbers_plural' : 'notif.idle_barbers_singular', { count: idle.length }),
              translateNow('notif.no_appointments_period', { names: idle.map(b => b.name).join(', ') }),
              now, { priority: 'high', items: idle, itemKind: 'barber' });
          }
        }
      }

      // Real reviews from the backend
      if (reviews && reviews.length > 0) {
        reviews.forEach(r => {
          push('review', translateNow('notif.new_review', { rating: r.rating }),
            r.comment ? translateNow('notif.review_body_with_comment', { comment: r.comment, cliente: r.client_name }) : translateNow('notif.review_body_no_comment', { cliente: r.client_name, barbeiro: r.barber_name }),
            r.created_at ? new Date(r.created_at) : now, { priority: 'normal', items: [r], itemKind: 'review' });
        });
      }

      // Sort by time desc
      return notifs.sort((a, b) => b.time - a.time);
    }

    function fmtTimeAgo(date) {
      const diff = (new Date() - date) / 1000;
      if (diff < 60) return translateNow('notif.time_now');
      if (diff < 3600) return translateNow('notif.time_min_ago', { n: Math.floor(diff / 60) });
      if (diff < 86400) return translateNow('notif.time_hour_ago', { n: Math.floor(diff / 3600) });
      return translateNow('notif.time_day_ago', { n: Math.floor(diff / 86400) });
    }

    function NotificationCenter({ appointments, stats, clients, reviews }) {
      const { t } = useLang();
      const [open, setOpen] = useState(false);
      const [tab, setTab] = useState('all');
      const [notifs, setNotifs] = useState(() => buildNotifications(appointments, stats, clients, reviews));
      const [bellAnim, setBellAnim] = useState(false);
      const [detailNotif, setDetailNotif] = useState(null);
      const panelRef = useRef(null);
      const btnRef = useRef(null);

      // Rebuild when data changes
      useEffect(() => {
        setNotifs(buildNotifications(appointments, stats, clients, reviews));
      }, [appointments, stats, clients, reviews]);

      // Shake bell on new unread
      const unreadCount = notifs.filter(n => !n.read).length;
      useEffect(() => {
        if (unreadCount > 0) { setBellAnim(true); const t = setTimeout(() => setBellAnim(false), 700); return () => clearTimeout(t); }
      }, [unreadCount]);

      // Close on outside click
      useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target))
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [open]);

      const markRead = (id) => setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
      const markAllRead = () => setNotifs(ns => ns.map(n => ({ ...n, read: true })));
      const remove = (id, e) => { e.stopPropagation(); setNotifs(ns => ns.filter(n => n.id !== id)); };

      const filtered = tab === 'all' ? notifs
        : tab === 'unread' ? notifs.filter(n => !n.read)
          : tab === 'high' ? notifs.filter(n => n.priority === 'high')
            : notifs;

      const highCount = notifs.filter(n => n.priority === 'high' && !n.read).length;

      return (
        <div style={{ position: 'relative' }}>
          <button
            ref={btnRef}
            onClick={() => setOpen(o => !o)}
            className={bellAnim ? 'notif-bell-active' : ''}
            aria-label={unreadCount > 0 ? t('client.notifications_unread_aria', { count: unreadCount }) : t('client.notifications')}
            aria-expanded={open}
            style={{ position: 'relative', background: open ? 'rgba(212,165,116,.12)' : 'none', border: open ? '1px solid rgba(212,165,116,.3)' : '1px solid transparent', borderRadius: 8, color: open ? '#d4a574' : 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 16, padding: '6px 9px', transition: 'all .15s', display: 'flex', alignItems: 'center' }}
          >
            <i className="fas fa-bell" aria-hidden="true"></i>
            {unreadCount > 0 && (
              <span className="notif-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
              <div ref={panelRef} className="notif-panel">
                {/* Header */}
                <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fas fa-bell" style={{ color: '#d4a574', fontSize: 14 }}></i>
                      <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>{t('client.notifications')}</span>
                      {unreadCount > 0 && (
                        <span style={{ background: '#ef4444', color: 'var(--bp-text)', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{unreadCount}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#d4a574', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: '3px 6px', borderRadius: 6, transition: 'background .15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,165,116,.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          {t('client.mark_all_read')}
                        </button>
                      )}
                      <button onClick={() => setOpen(false)} aria-label={t('notif.close_aria')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 14, cursor: 'pointer', padding: '3px 6px', borderRadius: 6 }}>
                        <i className="fas fa-times" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>

                  {/* Priority alert bar */}
                  {highCount > 0 && (
                    <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '7px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fas fa-exclamation-circle" style={{ color: '#ef4444', fontSize: 13 }}></i>
                      <span style={{ color: '#fca5a5', fontSize: 12, flex: 1 }}>{t(highCount > 1 ? 'notif.high_priority_plural' : 'notif.high_priority_singular', { count: highCount })}</span>
                      <button onClick={() => setTab('high')} style={{ background: 'none', border: '1px solid rgba(239,68,68,.4)', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 5, padding: '2px 8px', fontFamily: 'Inter, sans-serif' }}>{t('notif.view')}</button>
                    </div>
                  )}

                  {/* Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--bp-border)', marginLeft: -16, marginRight: -16, paddingLeft: 6 }}>
                    {[
                      { id: 'all', label: t('notif.tab_all'), count: notifs.length },
                      { id: 'unread', label: t('notif.tab_unread'), count: notifs.filter(n => !n.read).length },
                      { id: 'high', label: t('notif.tab_urgent'), count: highCount },
                    ].map(tabItem => (
                      <button key={tabItem.id} className={`notif-tab${tab === tabItem.id ? ' active' : ''}`} onClick={() => setTab(tabItem.id)}>
                        {tabItem.label}{tabItem.count > 0 && <span style={{ marginLeft: 5, background: tab === tabItem.id ? 'rgba(212,165,116,.15)' : 'var(--bp-border)', color: tab === tabItem.id ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{tabItem.count}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filtered.length === 0 ? (
                    <div className="notif-empty">
                      <i className="fas fa-check-circle" style={{ fontSize: 32, color: 'var(--bp-border2)', marginBottom: 10 }}></i>
                      <p style={{ fontSize: 13, color: 'var(--bp-text-faint)' }}>{t('notif.all_good')}</p>
                    </div>
                  ) : filtered.map(n => {
                    const nt = NOTIF_TYPES[n.type] || NOTIF_TYPES.system;
                    return (
                      <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => { markRead(n.id); setDetailNotif(n); setOpen(false); }}>
                        <div className="notif-icon-wrap" style={{ background: nt.bg }}>
                          <i className={`fas ${nt.icon}`} style={{ color: nt.color }}></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                            <p style={{ color: n.read ? 'var(--bp-text-secondary)' : 'var(--bp-text)', fontWeight: n.read ? 400 : 600, fontSize: 13, margin: 0, lineHeight: 1.3 }}>{n.title}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {n.priority === 'high' && !n.read && (
                                <span style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5 }}>{t('notif.urgent_badge')}</span>
                              )}
                              <span style={{ color: '#4b5563', fontSize: 11 }}>{fmtTimeAgo(n.time)}</span>
                            </div>
                          </div>
                          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <span style={{ background: nt.bg, color: nt.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5 }}>{t(nt.labelKey)}</span>
                            {!n.read && <span className="notif-dot"></span>}
                          </div>
                        </div>
                        <button onClick={(e) => remove(n.id, e)} aria-label={t('notif.remove_aria')} style={{ background: 'none', border: 'none', color: 'var(--bp-border2)', cursor: 'pointer', fontSize: 12, padding: '2px 4px', flexShrink: 0, borderRadius: 4, transition: 'color .15s' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--bp-text-faint)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--bp-border2)'}>
                          <i className="fas fa-times" aria-hidden="true"></i>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ color: '#4b5563', fontSize: 11 }}>{t(notifs.filter(n => !n.read).length !== 1 ? 'notif.unread_of_total_plural' : 'notif.unread_of_total_singular', { unread: notifs.filter(n => !n.read).length, total: notifs.length })}</span>
                  <button onClick={() => { setNotifs([]); setOpen(false); }} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: '3px 6px', borderRadius: 4, transition: 'color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}>
                    {t('notif.clear_all')}
                  </button>
                </div>
              </div>
            </>
          )}

          {detailNotif && (
            <NotifDetailModal notif={detailNotif} onClose={() => setDetailNotif(null)} />
          )}
        </div>
      );
    }

    function NotifDetailModal({ notif, onClose }) {
      const { t } = useLang();
      const nt = NOTIF_TYPES[notif.type] || NOTIF_TYPES.system;
      const items = notif.items || [];

      return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 18, padding: 22, width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div className="notif-icon-wrap" style={{ background: nt.bg }}>
                <i className={`fas ${nt.icon}`} style={{ color: nt.color }}></i>
              </div>
              <div style={{ flex: 1 }}>
                <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>{notif.title}</h3>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{notif.body}</p>
              </div>
              <button onClick={onClose} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 16, cursor: 'pointer', padding: 4 }}>
                <i className="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>

            {items.length === 0 ? (
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>{t('notif.no_additional_details')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 12, padding: '10px 14px' }}>
                    {notif.itemKind === 'appointment' && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, margin: 0 }}>{item.client_name}</p>
                          {item.price != null && <p style={{ color: '#d4a574', fontWeight: 700, fontSize: 13, margin: 0 }}>{fmtCur(item.price)}</p>}
                        </div>
                        <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: 0 }}>{t('notif.service_with_barber', { servico: item.service_name, barbeiro: item.barber_name })}</p>
                        <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '4px 0 0' }}>
                          <i className="fas fa-calendar" style={{ marginRight: 5 }}></i>{item.appointment_date}
                          <i className="fas fa-clock" style={{ marginLeft: 12, marginRight: 5 }}></i>{item.appointment_time}
                        </p>
                      </>
                    )}
                    {notif.itemKind === 'barber' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, margin: 0 }}>{item.name}</p>
                        <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{t('notif.appointments_count', { count: item.completed || 0 })}</p>
                      </div>
                    )}
                    {notif.itemKind === 'review' && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, margin: 0 }}>{item.client_name}</p>
                          <p style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13, margin: 0 }}>{item.rating} ★</p>
                        </div>
                        <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: 0 }}>{item.comment ? `"${item.comment}"` : t('notif.review_for', { barbeiro: item.barber_name })}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

