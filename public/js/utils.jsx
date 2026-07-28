    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    const API_URL = '/api';

    // fmtCur usa sempre o locale pt-BR para a formatação numérica (separadores),
    // já que a moeda é sempre Real (BRL) — barbearia brasileira, só a língua da
    // interface muda, não a moeda.
    const fmtCur = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtNum = n => (n || 0).toLocaleString(currentLocale());
    const fmtDate = d => parseLocalDate(d).toLocaleDateString(currentLocale());

    // Converte um link de YouTube/Vimeo colado pelo barbeiro num src de iframe embutível.
    // Outros links (ex: Instagram) não têm embed simples sem o script deles, então retorna null
    // e quem chama deve tratar como "abrir em nova aba" nesse caso.
    const getVideoEmbedUrl = (url) => {
      if (!url) return null;
      const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/);
      if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
      const vimeo = url.match(/vimeo\.com\/(\d+)/);
      if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
      return null;
    };

    // Normaliza o que o barbeiro digitou (@usuario, usuario ou link completo) num link válido do Instagram.
    const getInstagramUrl = (value) => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
    };

    // Redimensiona/comprime uma imagem no navegador antes de virar base64, pra caber num corpo JSON razoável.
    // mimeType 'image/png' preserva transparência (logos); SVGs sem largura/altura intrínsecas caem no arquivo original.
    const resizeImageFile = (file, maxWidth = 800, quality = 0.8, mimeType = 'image/jpeg') => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (!file.type.startsWith('image/svg')) {
          const img = new Image();
          img.onload = () => {
            if (!img.width || !img.height) { resolve(ev.target.result); return; }
            const scale = Math.min(1, maxWidth / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL(mimeType, quality));
          };
          img.onerror = reject;
          img.src = ev.target.result;
        } else {
          resolve(ev.target.result);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    /* ======================================================
       WEB PUSH — lembrete de agendamento mesmo com a aba fechada
    ====================================================== */
    const urlBase64ToUint8Array = (base64String) => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    };

    const setupPushNotifications = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existing = await registration.pushManager.getSubscription();
        if (existing) return; // já inscrito neste navegador

        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return;
        }
        if (Notification.permission !== 'granted') return;

        const { data } = await apiCall('GET', '/push/vapid-public-key');
        if (!data?.publicKey) return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        });

        const sub = subscription.toJSON();
        await apiCall('POST', '/push/subscribe', { endpoint: sub.endpoint, keys: sub.keys });
      } catch (e) {
        console.warn('Não foi possível ativar notificações push:', e.message);
      }
    };

    const parseLocalDate = (dateStr) => {
      if (!dateStr) return new Date(0);
      if (dateStr.includes('T') || dateStr.includes(' ')) return new Date(dateStr);
      return new Date(dateStr + 'T00:00:00');
    };

    const todayStart = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const applyTheme = (theme) => {
      const t = theme === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    };

    const statusLabel = (status) => {
      const map = { completed: 'status.completed', confirmed: 'status.confirmed', pending: 'status.pending', cancelled: 'status.cancelled' };
      return map[status] ? translateNow(map[status]) : status;
    };

    const statusClass = (status) => {
      const map = {
        completed: 'bg-bp-success/20 text-bp-success',
        confirmed: 'bg-bp-warning/20 text-bp-warning',
        pending: 'bg-bp-accent/20 text-bp-accent',
        cancelled: 'bg-bp-danger/20 text-bp-danger',
      };
      return map[status] || 'bg-gray-500/20 text-gray-400';
    };

    const saveSession = (token, user, remember) => {
      const store = remember ? localStorage : sessionStorage;
      const other = remember ? sessionStorage : localStorage;
      store.setItem('token', token);
      store.setItem('user', JSON.stringify(user));
      other.removeItem('token');
      other.removeItem('user');
    };

    const getStoredUser = () => {
      try {
        const s = localStorage.getItem('user') || sessionStorage.getItem('user');
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    };

    const updateStoredUser = (patch) => {
      const store = localStorage.getItem('user') ? localStorage : sessionStorage;
      try {
        const u = JSON.parse(store.getItem('user') || '{}');
        store.setItem('user', JSON.stringify({ ...u, ...patch }));
      } catch {}
    };

    const clearSession = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    };

    const apiCall = async (method, endpoint, body = null) => {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        'X-Lang': localStorage.getItem('lang') || 'pt-BR',
        ...(token && { 'Authorization': `Bearer ${token}` })
      };
      let response;
      try {
        response = await fetch(`${API_URL}${endpoint}`, {
          method,
          headers,
          ...(body && { body: JSON.stringify(body) })
        });
      } catch (err) {
        return { ok: false, status: 0, data: { error: translateNow('common.network_error') } };
      }
      if (response.status === 401 && token) {
        clearSession();
        window.location.reload();
      }
      let data;
      try {
        data = await response.json();
      } catch (err) {
        data = response.status === 413
          ? { error: translateNow('common.file_too_large') }
          : { error: translateNow('common.unexpected_response') };
      }
      return { ok: response.ok, status: response.status, data };
    };

    /* ======================================================
       THEME TOGGLE (claro / escuro)
    ====================================================== */
    function ThemeToggle({ theme, onChange, saving }) {
      const { t } = useLang();
      const opt = (value, icon, label) => {
        const active = (theme || 'dark') === value;
        return (
          <button
            type="button"
            disabled={saving}
            onClick={() => onChange(value)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'all .15s',
              background: active ? 'linear-gradient(135deg,#d4a574,#8b7355)' : 'none',
              color: active ? '#000' : 'var(--bp-text-muted)',
              border: active ? 'none' : '1px solid var(--bp-border2)',
            }}>
            <i className={`fas ${icon}`}></i>{label}
          </button>
        );
      };
      return (
        <div style={{ display: 'flex', gap: 10 }}>
          {opt('dark', 'fa-moon', t('theme.dark'))}
          {opt('light', 'fa-sun', t('theme.light'))}
        </div>
      );
    }

    /* ======================================================
       HEADER THEME TOGGLE (ícone único, claro/escuro)
    ====================================================== */
    function HeaderThemeToggle({ user }) {
      const { t } = useLang();
      const [theme, setTheme] = useState(user?.theme === 'light' ? 'light' : 'dark');
      const [saving, setSaving] = useState(false);

      const toggle = async () => {
        const prev = theme;
        const next = prev === 'light' ? 'dark' : 'light';
        setTheme(next);
        applyTheme(next);
        setSaving(true);
        const res = await apiCall('PATCH', '/me', { theme: next });
        setSaving(false);
        if (res.ok) {
          updateStoredUser({ theme: next });
        } else {
          setTheme(prev);
          applyTheme(prev);
        }
      };

      return (
        <button type="button" onClick={toggle} disabled={saving}
          aria-label={theme === 'dark' ? t('theme.to_light') : t('theme.to_dark')}
          style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, flexShrink: 0 }}>
          <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true"></i>
        </button>
      );
    }

    /* ======================================================
       HEADER LANGUAGE TOGGLE (dropdown pt-BR / en / es)
    ====================================================== */
    function HeaderLanguageToggle() {
      const { lang, setLang, t } = useLang();
      const [open, setOpen] = useState(false);
      const [saving, setSaving] = useState(false);
      const btnRef = useRef(null);
      const panelRef = useRef(null);

      useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target))
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [open]);

      const current = LANGS.find(l => l.code === lang) || LANGS[0];

      const choose = async (code) => {
        setOpen(false);
        if (code === lang) return;
        const prev = lang;
        setLang(code);
        setSaving(true);
        const res = await apiCall('PATCH', '/me', { language: code });
        setSaving(false);
        if (res.ok) {
          updateStoredUser({ language: code });
        } else {
          setLang(prev);
        }
      };

      return (
        <div style={{ position: 'relative' }}>
          <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen(o => !o)}
            disabled={saving}
            aria-label={t('header.language')}
            aria-expanded={open}
            style={{ background: open ? 'rgba(212,165,116,.12)' : 'none', border: open ? '1px solid rgba(212,165,116,.3)' : '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 15, flexShrink: 0 }}>
            <span aria-hidden="true">{current.flag}</span>
          </button>

          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
              <div ref={panelRef} style={{ position: 'absolute', top: 40, right: 0, zIndex: 500, background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)', minWidth: 160, padding: 6 }}>
                {LANGS.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => choose(l.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                      background: l.code === lang ? 'rgba(212,165,116,.12)' : 'none', border: 'none', borderRadius: 7,
                      color: l.code === lang ? '#d4a574' : 'var(--bp-text-secondary)', fontWeight: l.code === lang ? 600 : 400,
                      fontSize: 13, padding: '8px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>
                    <span aria-hidden="true">{l.flag}</span>{l.label}
                    {l.code === lang && <i className="fas fa-check" style={{ marginLeft: 'auto', fontSize: 11 }}></i>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }

    /* ======================================================
       TOAST
    ====================================================== */
    function Toast({ msg, type, onDismiss }) {
      useEffect(() => {
        const t = setTimeout(onDismiss, 5000);
        return () => clearTimeout(t);
      }, []);
      const bg = { success: '#10b981', error: '#ef4444', info: '#3b82f6' }[type];
      return (
        <div className="toast p-4 rounded-xl border flex items-center gap-3 text-sm shadow-2xl" style={{ maxWidth: 380, background: bg, borderColor: bg, color: '#fff' }}>
          <i className={`fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}`} style={{ color: '#fff' }}></i>
          <span className="flex-1" style={{ color: '#fff' }}>{msg}</span>
          <button onClick={onDismiss} className="opacity-80 hover:opacity-100" style={{ color: '#fff' }}>
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      );
    }

    /* ======================================================
       DRUM TIME PICKER (relógio giratório)
    ====================================================== */
    function DrumColumn({ items, selectedIdx, onScrollEnd, colRef }) {
      const ITEM_H = 40;
      const PAD = 2; // items visible above/below center

      useEffect(() => {
        if (colRef.current) colRef.current.scrollTop = selectedIdx * ITEM_H;
      }, []);

      const handleScroll = () => {
        clearTimeout(colRef.current._st);
        colRef.current._st = setTimeout(() => {
          const raw = colRef.current.scrollTop / ITEM_H;
          const idx = Math.max(0, Math.min(Math.round(raw), items.length - 1));
          colRef.current.scrollTop = idx * ITEM_H;
          onScrollEnd(idx);
        }, 80);
      };

      return (
        <div style={{ position: 'relative', flex: 1 }}>
          <div className="drum-fade-top" />
          <div className="drum-highlight" />
          <div className="drum-fade-bot" />
          <div ref={colRef} className="drum-col" onScroll={handleScroll}>
            <div style={{ height: ITEM_H * PAD }} />
            {items.map((it, i) => (
              <div key={i} className={`drum-item${i === selectedIdx ? ' selected' : ''}`}>
                {String(it).padStart(2, '0')}
              </div>
            ))}
            <div style={{ height: ITEM_H * PAD }} />
          </div>
        </div>
      );
    }

    // Seletor de horário "relógio giratório" — padrão visual para todos os campos de horário do sistema.
    function DrumTimeSelector({ value, onChange, label }) {
      const { t } = useLang();
      const displayLabel = label || t('time.selected_time');
      const HOURS = Array.from({ length: 24 }, (_, i) => i);
      const MINUTES = Array.from({ length: 60 }, (_, i) => i);

      const parseHM = (str) => {
        const m = str && String(str).match(/(\d{1,2}):(\d{2})/);
        if (!m) return [9, 0];
        return [parseInt(m[1]), parseInt(m[2])];
      };
      const [h0, m0] = parseHM(value);

      const [h, setH] = useState(h0);
      const [m, setM] = useState(m0);
      const hRef = useRef(null);
      const mRef = useRef(null);

      const fmt = n => String(n).padStart(2, '0');

      useEffect(() => {
        onChange(`${fmt(h)}:${fmt(m)}`);
      }, [h, m]);

      return (
        <div>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, textAlign: 'center', margin: '0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <i className="fas fa-clock" aria-hidden="true" style={{ color: '#d4a574' }}></i>{displayLabel}:
            <span style={{ color: '#d4a574', fontWeight: 700, fontSize: 15 }}>{fmt(h)}:{fmt(m)}</span>
          </p>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bp-card)', borderRadius: 12, padding: '8px 6px', border: '1px solid var(--bp-border2)' }}>
            <DrumColumn items={HOURS} selectedIdx={h} onScrollEnd={setH} colRef={hRef} />
            <div style={{ display: 'flex', alignItems: 'center', color: '#d4a574', fontWeight: 700, fontSize: 20, paddingBottom: 2 }}>:</div>
            <DrumColumn items={MINUTES} selectedIdx={m} onScrollEnd={setM} colRef={mRef} />
          </div>
        </div>
      );
    }

    // Seletor de duração "carrossel" — mesmo padrão visual do DrumTimeSelector, para minutos.
    function DurationDrumSelector({ value, onChange, label, step = 5, min = 5, max = 180 }) {
      const { t } = useLang();
      const displayLabel = label || t('time.duration');
      const OPTIONS = useMemo(() => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step), [step, min, max]);
      const initialIdx = Math.max(0, OPTIONS.indexOf(OPTIONS.reduce((closest, n) => Math.abs(n - (parseInt(value) || min)) < Math.abs(closest - (parseInt(value) || min)) ? n : closest, OPTIONS[0])));
      const [idx, setIdx] = useState(initialIdx);
      const colRef = useRef(null);

      useEffect(() => { onChange(OPTIONS[idx]); }, [idx]);

      return (
        <div>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, textAlign: 'center', margin: '0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <i className="fas fa-stopwatch" aria-hidden="true" style={{ color: '#d4a574' }}></i>{displayLabel}:
            <span style={{ color: '#d4a574', fontWeight: 700, fontSize: 15 }}>{OPTIONS[idx]} min</span>
          </p>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bp-card)', borderRadius: 12, padding: '8px 6px', border: '1px solid var(--bp-border2)' }}>
            <DrumColumn items={OPTIONS} selectedIdx={idx} onScrollEnd={setIdx} colRef={colRef} />
          </div>
        </div>
      );
    }

    /* ======================================================
       ERROR BOUNDARY
    ====================================================== */
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError() {
        return { hasError: true };
      }

      componentDidCatch(error, info) {
        console.error('ErrorBoundary caught an error:', error, info);
      }

      handleReload = () => {
        this.setState({ hasError: false });
        window.location.reload();
      };

      handleGoToLogin = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
      };

      render() {
        if (!this.state.hasError) return this.props.children;
        return (
          <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f0f1e' }}>
            <div className="w-full max-w-md mx-auto p-8 rounded-2xl border border-bp-border text-center" style={{ background: 'linear-gradient(145deg, #1a202a 0%, #151a28 100%)' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: 28 }}></i>
              </div>
              <h1 className="syne text-xl font-bold mb-2" style={{ color: '#ffffff' }}>{translateNow('error_boundary.title')}</h1>
              <p className="text-sm mb-6" style={{ color: '#9ca3af' }}>
                {translateNow('error_boundary.message')}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={this.handleReload}
                  style={{ width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  <i className="fas fa-rotate-right" style={{ marginRight: 8 }}></i>{translateNow('error_boundary.retry')}
                </button>
                <button
                  onClick={this.handleGoToLogin}
                  style={{ width: '100%', padding: '11px 0', background: 'none', border: '1px solid #2d3748', borderRadius: 9, color: '#8b9bb4', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  {translateNow('error_boundary.back_to_login')}
                </button>
              </div>
            </div>
          </div>
        );
      }
    }

