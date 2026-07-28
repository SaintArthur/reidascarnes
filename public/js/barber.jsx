    /* ======================================================
       BARBER DASHBOARD
    ====================================================== */
    function useBarberNav() {
      const { t } = useLang();
      return [
        { id: 'agenda', icon: 'fas fa-calendar-day', label: t('barber.agenda_title') },
        { id: 'appointments', icon: 'fas fa-calendar-check', label: t('profile.my_appointments') },
        { id: 'horarios', icon: 'fas fa-clock', label: t('barber.my_schedule_title') },
        { id: 'absences', icon: 'fas fa-calendar-xmark', label: t('barber.absences_page_title') },
        { id: 'reviews', icon: 'fas fa-star', label: t('barber.stat_reviews') },
        { id: 'profile', icon: 'fas fa-user', label: t('barber.my_profile_title') },
      ];
    }

    /* ---- Agenda do Dia ---- */
    const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    function buildDaySlots(workingHours, appointments) {
      if (!workingHours) return [];
      const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const fmtT = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      const start = toMin(workingHours.start_time);
      const end = toMin(workingHours.end_time);
      const bStart = workingHours.break_start ? toMin(workingHours.break_start) : null;
      const bEnd = workingHours.break_end ? toMin(workingHours.break_end) : null;
      const sorted = [...appointments]
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => toMin(a.appointment_time) - toMin(b.appointment_time));
      const slots = [];
      let cursor = start;
      let aptIdx = 0;
      while (cursor < end) {
        if (bStart !== null && bEnd !== null && cursor >= bStart && cursor < bEnd) {
          slots.push({ id: `blocked-${cursor}`, time: fmtT(cursor), status: 'blocked' });
          cursor = bEnd;
          continue;
        }
        const apt = sorted[aptIdx];
        const aptMin = apt ? toMin(apt.appointment_time) : null;
        if (apt && aptMin <= cursor) {
          slots.push({
            id: apt.id, time: apt.appointment_time.slice(0, 5), client: apt.client_name,
            service: apt.service_name, status: apt.status, duration: apt.duration || 30, price: apt.price
          });
          cursor = Math.ceil((aptMin + (apt.duration || 30)) / 30) * 30;
          aptIdx++;
        } else if (apt && aptMin < cursor + 30) {
          cursor = aptMin;
        } else {
          slots.push({ id: `free-${cursor}`, time: fmtT(cursor), status: 'free' });
          cursor += 30;
        }
      }
      return slots;
    }

    function BarberAgenda({ user, showToast }) {
      const { t, lang } = useLang();
      const today = new Date();
      const todayStr = today.toLocaleDateString(localeTag(lang), { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const [slots, setSlots] = useState([]);
      const [loading, setLoading] = useState(true);
      const [updatingId, setUpdatingId] = useState(null);

      const load = async () => {
        setLoading(true);
        const dow = today.getDay();
        const dateStr = localDateStr(today);
        const [hoursRes, aptsRes] = await Promise.all([
          apiCall('GET', `/barbers/${user.id}/working-hours`),
          apiCall('GET', '/appointments'),
        ]);
        const todayHours = hoursRes.ok ? (hoursRes.data || []).find(h => h.day_of_week === dow) : null;
        const todayApts = aptsRes.ok ? (aptsRes.data || []).filter(a => a.appointment_date === dateStr) : [];
        setSlots(buildDaySlots(todayHours, todayApts));
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      const updateStatus = async (id, status, msg) => {
        setUpdatingId(id);
        const res = await apiCall('PATCH', `/appointments/${id}/status`, { status });
        setUpdatingId(null);
        if (res.ok) { showToast(msg, status === 'cancelled' ? 'info' : 'success'); load(); }
        else showToast(res.data?.error || t('barber.err_update_appointment'), 'error');
      };
      const completeSlot = (id) => updateStatus(id, 'completed', t('barber.appointment_completed_toast'));
      const confirmPending = (id) => updateStatus(id, 'confirmed', t('barber.appointment_confirmed_toast'));
      const cancelSlot = (id) => updateStatus(id, 'cancelled', t('barber.appointment_cancelled_toast'));

      const confirmed = slots.filter(s => s.status === 'confirmed').length;
      const pending = slots.filter(s => s.status === 'pending').length;
      const revenue = slots.filter(s => s.status === 'confirmed' || s.status === 'completed').reduce((a, s) => a + (s.price || 0), 0);

      const slotColor = { confirmed: '#f59e0b', pending: '#3b82f6', free: 'var(--bp-border2)', blocked: 'var(--bp-border)', completed: '#10b981' };
      const slotLabelColor = { confirmed: '#f59e0b', pending: '#3b82f6', free: '#4b5563', blocked: '#374151', completed: '#10b981' };
      const slotLabel = { confirmed: t('status.confirmed'), pending: t('status.pending'), free: t('barber.slot_free'), blocked: t('barber.slot_blocked'), completed: t('status.completed') };

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('barber.agenda_title')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0', textTransform: 'capitalize' }}>{todayStr}</p>
          </div>

          {/* Summary cards */}
          <div className="barber-agenda-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
            {[
              { label: t('barber.card_confirmed'), value: confirmed, icon: 'fa-calendar-check', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
              { label: t('barber.card_pending'), value: pending, icon: 'fa-hourglass-half', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
              { label: t('barber.card_today_revenue'), value: fmtCur(revenue), icon: 'fa-dollar-sign', color: '#d4a574', bg: 'rgba(212,165,116,0.12)' },
              { label: t('barber.card_free_slots'), value: slots.filter(s => s.status === 'free').length, icon: 'fa-circle', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
            ].map(card => (
              <div key={card.label} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <i className={`fas ${card.icon}`} style={{ color: card.color, fontSize: 16 }}></i>
                </div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 2px' }}>{card.label}</p>
                <p style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 800, margin: 0, fontFamily: 'Inter, sans-serif' }}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-stream" style={{ color: '#d4a574' }}></i> {t('barber.timeline')}
            </p>
            {slots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#4b5563' }}>
                <i className="fas fa-mug-hot" style={{ fontSize: 28, marginBottom: 10, display: 'block' }}></i>
                {t('barber.no_shift_today')}
              </div>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map(slot => {
                const isFree = slot.status === 'free';
                const isBlocked = slot.status === 'blocked';
                const isPending = slot.status === 'pending';
                const isConfirmed = slot.status === 'confirmed';
                const isDone = slot.status === 'completed';
                const busy = updatingId === slot.id;
                return (
                  <div key={slot.id} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                    {/* Time column */}
                    <div style={{ width: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ color: 'var(--bp-text-faint)', fontSize: 12, fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{slot.time}</span>
                    </div>
                    {/* Line */}
                    <div style={{ width: 2, flexShrink: 0, background: slotColor[slot.status], borderRadius: 2, opacity: 0.5 }}></div>
                    {/* Content */}
                    <div style={{ flex: 1, background: isFree || isBlocked ? 'rgba(45,55,72,0.2)' : isDone ? 'rgba(16,185,129,0.06)' : isPending ? 'rgba(59,130,246,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${isFree || isBlocked ? 'var(--bp-border)' : slotColor[slot.status] + '44'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      {isFree || isBlocked ? (
                        <span style={{ color: isBlocked ? '#374151' : '#4b5563', fontSize: 13 }}>{isBlocked ? t('barber.blocked') : t('barber.free')}</span>
                      ) : (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{slot.client}</span>
                            <span style={{ background: slotColor[slot.status] + '22', color: slotLabelColor[slot.status], fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20 }}>{slotLabel[slot.status]}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: 'var(--bp-text-muted)', fontSize: 12 }}><i className="fas fa-cut" style={{ marginRight: 4 }}></i>{slot.service}</span>
                            <span style={{ color: '#d4a574', fontSize: 12, fontWeight: 600 }}>{fmtCur(slot.price)}</span>
                            <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{slot.duration} min</span>
                          </div>
                        </div>
                      )}
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {isPending && (
                          <>
                            <button onClick={() => confirmPending(slot.id)} disabled={busy} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, color: '#10b981', fontSize: 12, fontWeight: 600, padding: '5px 10px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                              <i className="fas fa-check" style={{ marginRight: 4 }}></i>{t('common.confirm')}
                            </button>
                            <button onClick={() => cancelSlot(slot.id)} disabled={busy} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#ef4444', fontSize: 12, padding: '5px 8px', cursor: busy ? 'not-allowed' : 'pointer' }}>
                              <i className="fas fa-times"></i>
                            </button>
                          </>
                        )}
                        {isConfirmed && (
                          <button onClick={() => completeSlot(slot.id)} disabled={busy} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, color: '#10b981', fontSize: 12, fontWeight: 600, padding: '5px 10px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                            <i className="fas fa-check-double" style={{ marginRight: 4 }}></i>{t('barber.complete')}
                          </button>
                        )}
                        {isDone && (
                          <span style={{ color: '#10b981', fontSize: 12 }}><i className="fas fa-check-circle" style={{ marginRight: 4 }}></i>{t('barber.finished')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      );
    }

    /* ---- Meus Agendamentos (barbeiro) ---- */
    const BARBER_APT_SORTS = {
      proximos: { get label() { return translateNow('barber.sort_closest'); }, fn: (a, b) => `${a.appointment_date}T${a.appointment_time || ''}`.localeCompare(`${b.appointment_date}T${b.appointment_time || ''}`) },
      recentes: { get label() { return translateNow('barber.sort_recent'); }, fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
      valor: { get label() { return translateNow('barber.sort_highest_value'); }, fn: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0) },
    };

    function BarberAppointments({ user, showToast }) {
      const { t, lang } = useLang();
      const AVATAR_COLORS = ['#d4a574', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      const CLIENT_INITIALS = name => name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
      const inputStyle = { background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '7px 12px', outline: 'none', fontFamily: 'Inter, sans-serif' };

      const [filter, setFilter] = useState('all');
      const [search, setSearch] = useState('');
      const [periodFilter, setPeriodFilter] = useState('todos');
      const [sortBy, setSortBy] = useState('proximos');
      const [apts, setApts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [updatingId, setUpdatingId] = useState(null);

      const loadApts = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/appointments');
        if (res.ok) setApts(res.data || []);
        else showToast(res.data?.error || t('barber.err_load_appointments'), 'error');
        setLoading(false);
      };
      useEffect(() => { loadApts(); }, []);

      const statusConfig = {
        confirmed: { label: t('status.confirmed'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        pending: { label: t('status.pending'), color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
        completed: { label: t('status.completed'), color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
        cancelled: { label: t('status.cancelled'), color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
      };

      const today = todayStart();
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
      const isToday = a => parseLocalDate(a.appointment_date).getTime() === today.getTime();
      const isTomorrow = a => parseLocalDate(a.appointment_date).getTime() === tomorrow.getTime();
      const matchesPeriod = a => {
        if (periodFilter === 'todos') return true;
        const d = parseLocalDate(a.appointment_date);
        if (periodFilter === 'hoje') return d.getTime() === today.getTime();
        if (periodFilter === 'amanha') return d.getTime() === tomorrow.getTime();
        if (periodFilter === 'semana') return d >= today && d <= weekEnd;
        return true;
      };

      const todayCount = apts.filter(isToday).length;
      const tomorrowCount = apts.filter(isTomorrow).length;
      const pendingCount = apts.filter(a => a.status === 'pending').length;
      const todayRevenue = apts.filter(a => a.status === 'completed' && isToday(a)).reduce((s, a) => s + (Number(a.price) || 0), 0);

      const clientCancelRate = a => a.client_total_appointments > 0 ? Math.round((a.client_cancelled_appointments / a.client_total_appointments) * 100) : 0;
      const cancelTier = rate => rate >= 30
        ? { label: t('barber.tier_bad'), color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
        : rate >= 15
        ? { label: t('barber.tier_attention'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
        : { label: t('barber.tier_good'), color: '#10b981', bg: 'rgba(16,185,129,0.12)' };

      const filtered = apts.filter(a => {
        const matchStatus = filter === 'all' || a.status === filter;
        const matchSearch = !search || a.client_name.toLowerCase().includes(search.toLowerCase()) || a.service_name.toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch && matchesPeriod(a);
      }).sort(BARBER_APT_SORTS[sortBy].fn);

      const updateStatus = async (id, status, okMsg) => {
        setUpdatingId(id);
        const res = await apiCall('PATCH', `/appointments/${id}/status`, { status });
        setUpdatingId(null);
        if (res.ok) { showToast(okMsg, 'success'); loadApts(); }
        else showToast(res.data?.error || t('barber.err_update_appointment'), 'error');
      };

      const confirmApt = (id) => updateStatus(id, 'confirmed', t('barber.appointment_confirmed_toast'));
      const completeApt = (id) => updateStatus(id, 'completed', t('barber.appointment_completed_toast'));
      const cancelApt = (id) => updateStatus(id, 'cancelled', t('barber.appointment_cancelled_toast'));

      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('profile.my_appointments')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('barber.all_your_appointments')}</p>
          </div>

          <div className="rpt-stat-grid">
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(212,165,116,0.15)' }}><i className="fas fa-calendar-day" style={{ color: '#d4a574' }}></i></div>
              <div className="rpt-stat-label">{t('barber.today')}</div>
              <div className="rpt-stat-value">{fmtNum(todayCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(139,92,246,0.15)' }}><i className="fas fa-calendar-plus" style={{ color: '#8b5cf6' }}></i></div>
              <div className="rpt-stat-label">{t('barber.tomorrow')}</div>
              <div className="rpt-stat-value">{fmtNum(tomorrowCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(96,165,250,0.15)' }}><i className="fas fa-hourglass-half" style={{ color: '#60a5fa' }}></i></div>
              <div className="rpt-stat-label">{t('barber.awaiting_confirmation')}</div>
              <div className="rpt-stat-value">{fmtNum(pendingCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(212,165,116,0.15)' }}><i className="fas fa-dollar-sign" style={{ color: '#d4a574' }}></i></div>
              <div className="rpt-stat-label">{t('barber.today_revenue')}</div>
              <div className="rpt-stat-value">{fmtCur(todayRevenue)}</div>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 180px' }}>
              <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 12 }}></i>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('barber.search_client_placeholder')} aria-label={t('barber.search_client_aria')} style={{ ...inputStyle, width: '100%', paddingLeft: 32 }} />
            </div>
            <select className="rpt-select" value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} style={{ flex: '1 1 140px' }}>
              <option value="todos">{t('barber.period_all')}</option>
              <option value="hoje">{t('barber.today')}</option>
              <option value="amanha">{t('barber.tomorrow')}</option>
              <option value="semana">{t('barber.period_week')}</option>
            </select>
            <select className="rpt-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ flex: '1 1 160px' }}>
              {Object.entries(BARBER_APT_SORTS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 20, paddingBottom: 2 }}>
            {[['all', t('barber.filter_all')], ['pending', t('barber.card_pending')], ['confirmed', t('barber.card_confirmed')], ['completed', t('barber.filter_completed')], ['cancelled', t('barber.filter_cancelled')]].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ flexShrink: 0, whiteSpace: 'nowrap', background: filter === v ? 'rgba(212,165,116,0.15)' : 'none', border: `1px solid ${filter === v ? '#d4a574' : 'var(--bp-border2)'}`, borderRadius: 8, color: filter === v ? '#d4a574' : 'var(--bp-text-muted)', fontSize: 12, fontWeight: filter === v ? 600 : 400, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all .15s' }}>{l}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 26, color: '#d4a574' }}></i></div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.length === 0 && (
              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '48px 0', textAlign: 'center' }}>
                <i className="fas fa-calendar-times" style={{ fontSize: 36, color: 'var(--bp-border2)', display: 'block', marginBottom: 12 }}></i>
                <p style={{ color: '#4b5563', fontSize: 14 }}>{t('barber.no_appointments_found')}</p>
              </div>
            )}
            {filtered.map((apt, idx) => {
              const sc = statusConfig[apt.status] || { label: apt.status, color: 'var(--bp-text-faint)', bg: 'var(--bp-border)' };
              const avColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const cRate = clientCancelRate(apt);
              const cTier = cancelTier(cRate);
              return (
                <div key={apt.id} className="barber-apt-item" style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: avColor + '33', border: `2px solid ${avColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: avColor, flexShrink: 0, overflow: 'hidden' }}>
                    {apt.client_photo_url ? <img src={apt.client_photo_url} alt={apt.client_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : CLIENT_INITIALS(apt.client_name)}
                  </div>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,var(--bp-card),var(--bp-panel))', border: '1px solid var(--bp-border2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#d4a574', fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>{apt.appointment_time.slice(0, 5)}</span>
                    <span style={{ color: 'var(--bp-text-faint)', fontSize: 10 }}>{parseLocalDate(apt.appointment_date).toLocaleDateString(localeTag(lang), { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{apt.client_name}</span>
                      <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20 }}>{sc.label}</span>
                      {waLink(apt.client_phone) && (
                        <a href={waLink(apt.client_phone)} target="_blank" rel="noopener noreferrer" title={t('barber.whatsapp_chat')} aria-label={t('barber.whatsapp_chat')} style={{ color: '#25d366', fontSize: 13 }}>
                          <i className="fab fa-whatsapp"></i>
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--bp-text-muted)', fontSize: 12 }}><i className="fas fa-cut" style={{ marginRight: 4 }}></i>{apt.service_name}</span>
                      {apt.duration && <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{apt.duration} min</span>}
                      <span title={t('barber.cancel_rate_tooltip', { rate: cRate })} style={{ background: cTier.bg, color: cTier.color, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{t('barber.cancel_pct_label', { rate: cRate, tier: cTier.label })}</span>
                      <span title={t('barber.cuts_with_you_tooltip')} style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', color: 'var(--bp-text-faint)', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}><i className="fas fa-cut" style={{ marginRight: 4 }}></i>{t('barber.cuts_with_you', { count: fmtNum(apt.client_cuts_with_barber || 0) })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ color: '#d4a574', fontWeight: 700, fontSize: 16 }}>{fmtCur(apt.price)}</span>
                    {apt.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => confirmApt(apt.id)} disabled={updatingId === apt.id} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: updatingId === apt.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <i className="fas fa-check" style={{ marginRight: 4 }}></i>{t('common.confirm')}
                        </button>
                        <button onClick={() => cancelApt(apt.id)} disabled={updatingId === apt.id} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12, padding: '6px 10px', cursor: updatingId === apt.id ? 'not-allowed' : 'pointer' }}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}
                    {apt.status === 'confirmed' && (
                      <button onClick={() => completeApt(apt.id)} disabled={updatingId === apt.id} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: updatingId === apt.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        <i className="fas fa-check" style={{ marginRight: 4 }}></i>{t('barber.complete')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      );
    }

    /* ---- iPhone drum-roll time picker ---- */
    function TimeDrumPicker({ row, onConfirm, onRequestDayOff, onClose }) {
      const { t, lang } = useLang();
      const HOURS = Array.from({ length: 24 }, (_, i) => i);
      const MINS = [0, 15, 30, 45];

      const parseHM = (str) => {
        const m = str && str.match(/(\d{1,2}):(\d{2})/);
        if (!m) return [9, 0];
        return [parseInt(m[1]), parseInt(m[2])];
      };

      const parts = row.hours.includes(' - ') ? row.hours.split(' - ') : [];
      const [sh0, sm0] = parts[0] ? parseHM(parts[0]) : [9, 0];
      const [eh0, em0] = parts[1] ? parseHM(parts[1]) : [19, 0];

      const [sh, setSh] = useState(sh0);
      const [sm, setSm] = useState(MINS.indexOf(sm0) >= 0 ? sm0 : 0);
      const [eh, setEh] = useState(eh0);
      const [em, setEm] = useState(MINS.indexOf(em0) >= 0 ? em0 : 0);
      const [dayOff, setDayOff] = useState(row.closed);

      const shRef = useRef(null); const smRef = useRef(null);
      const ehRef = useRef(null); const emRef = useRef(null);

      const fmt = n => String(n).padStart(2, '0');

      const handleConfirm = () => {
        if (dayOff) {
          if (row.closed) {
            onConfirm(t('barber.day_off_label'), true);
          } else {
            onRequestDayOff();
          }
        } else {
          onConfirm(`${fmt(sh)}:${fmt(sm)} - ${fmt(eh)}:${fmt(em)}`, false);
        }
      };

      return (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }} onClick={onClose}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 20, padding: 24, width: 340, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>
                <i className="fas fa-clock" aria-hidden="true" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('barber.hour_title', { day: dayAbbrevDisplay(lang, row.day) })}
              </h3>
              <button onClick={onClose} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 18 }}><i className="fas fa-times" aria-hidden="true"></i></button>
            </div>

            {/* Folga toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-card)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid var(--bp-border2)' }}>
              <span id="dayoff-label" style={{ color: 'var(--bp-text-secondary)', fontSize: 13 }}>{t('barber.day_off_toggle')}</span>
              <button onClick={() => setDayOff(d => !d)} role="switch" aria-checked={dayOff} aria-labelledby="dayoff-label" style={{ width: 42, height: 24, borderRadius: 12, background: dayOff ? '#d4a574' : 'var(--bp-border2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 3, left: dayOff ? 21 : 3, transition: 'left .2s' }} />
              </button>
            </div>

            {dayOff && !row.closed && (
              <p style={{ color: '#f59e0b', fontSize: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '10px 12px', margin: '0 0 16px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <i className="fas fa-circle-info" style={{ marginTop: 2 }}></i>
                <span>{t('barber.day_off_notice')}</span>
              </p>
            )}

            {!dayOff && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  {/* Start time */}
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textAlign: 'center', margin: '0 0 6px', letterSpacing: 1 }}>{t('barber.time_in')}</p>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bp-card)', borderRadius: 12, padding: '8px 6px', border: '1px solid var(--bp-border2)' }}>
                      <DrumColumn items={HOURS} selectedIdx={sh} onScrollEnd={setSh} colRef={shRef} />
                      <div style={{ display: 'flex', alignItems: 'center', color: '#d4a574', fontWeight: 700, fontSize: 20, paddingBottom: 2 }}>:</div>
                      <DrumColumn items={MINS} selectedIdx={MINS.indexOf(sm) >= 0 ? MINS.indexOf(sm) : 0} onScrollEnd={i => setSm(MINS[i])} colRef={smRef} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', color: '#4b5563', fontSize: 18, paddingTop: 28 }}>→</div>
                  {/* End time */}
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textAlign: 'center', margin: '0 0 6px', letterSpacing: 1 }}>{t('barber.time_out')}</p>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bp-card)', borderRadius: 12, padding: '8px 6px', border: '1px solid var(--bp-border2)' }}>
                      <DrumColumn items={HOURS} selectedIdx={eh} onScrollEnd={setEh} colRef={ehRef} />
                      <div style={{ display: 'flex', alignItems: 'center', color: '#d4a574', fontWeight: 700, fontSize: 20, paddingBottom: 2 }}>:</div>
                      <DrumColumn items={MINS} selectedIdx={MINS.indexOf(em) >= 0 ? MINS.indexOf(em) : 0} onScrollEnd={i => setEm(MINS[i])} colRef={emRef} />
                    </div>
                  </div>
                </div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, textAlign: 'center', margin: '0 0 16px' }}>
                  {t('barber.schedule_label')} <span style={{ color: '#d4a574', fontWeight: 600 }}>{fmt(sh)}:{fmt(sm)} – {fmt(eh)}:{fmt(em)}</span>
                </p>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleConfirm} style={{ flex: 1, background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 700, fontSize: 13, padding: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {dayOff && !row.closed
                  ? <><i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>{t('barber.request_day_off')}</>
                  : <><i className="fas fa-check" style={{ marginRight: 6 }}></i>{t('common.confirm')}</>}
              </button>
              <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 10, color: 'var(--bp-text-muted)', fontSize: 13, padding: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      );
    }

    /* ---- Meus Horários (barbeiro) ---- */
    // Identificadores internos fixos (não exibidos) usados para casar weekSchedule.day
    // com day_of_week numérico ao salvar a escala semanal recorrente.
    const DAY_MAP = { 'Seg':1, 'Ter':2, 'Qua':3, 'Qui':4, 'Sex':5, 'Sáb':6, 'Dom':0 };
    // Mesma ordem (Seg..Dom), mas em números de dia da semana — usado para o gráfico
    // de atendimentos por dia (que não depende de weekSchedule).
    const MON_TO_SUN_DOW = [1, 2, 3, 4, 5, 6, 0];

    function BarberWeekdayChart({ labels, values }) {
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        const cs = getComputedStyle(document.documentElement);
        const border = cs.getPropertyValue('--bp-border').trim();
        const textFaint = cs.getPropertyValue('--bp-text-faint').trim();
        const max = Math.max(...values, 0);
        chartRef.current = new Chart(canvasRef.current, {
          type: 'bar',
          data: { labels, datasets: [{ label: translateNow('barber.appointments_dataset_label'), data: values, backgroundColor: values.map(v => v === max && max > 0 ? '#d4a574' : '#d4a57466'), borderRadius: 6, borderSkipped: false }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + translateNow(ctx.parsed.y === 1 ? 'barber.appointment_count_singular' : 'barber.appointment_count_plural', { count: ctx.parsed.y }) } } },
            scales: {
              x: { grid: { display: false }, ticks: { color: textFaint, font: { size: 12 } } },
              y: { grid: { color: border }, ticks: { color: textFaint, font: { size: 11 }, precision: 0 }, beginAtZero: true }
            }
          }
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
      }, [JSON.stringify(values)]);
      return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}></canvas>;
    }

    function BarberHorarios({ user, showToast, weekSchedule, setWeekSchedule, onGoToAbsences }) {
      const { t, lang } = useLang();
      const [apts, setApts] = useState([]);
      useEffect(() => { apiCall('GET', '/appointments').then(res => { if (res.ok) setApts(res.data || []); }); }, []);

      const WEEK_ORDER = useMemo(() => weekdayAbbrevs(lang), [lang]);
      // weekSchedule.day guarda os identificadores fixos 'Seg'..'Dom' (chave de DAY_MAP);
      // este mapa traduz cada um para o rótulo de exibição no idioma ativo, na mesma ordem.
      const DAY_DISPLAY = useMemo(() => ({ Seg: WEEK_ORDER[0], Ter: WEEK_ORDER[1], Qua: WEEK_ORDER[2], Qui: WEEK_ORDER[3], Sex: WEEK_ORDER[4], Sáb: WEEK_ORDER[5], Dom: WEEK_ORDER[6] }), [WEEK_ORDER]);
      const weekdayCounts = useMemo(() => {
        const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        apts.forEach(a => {
          if (a.status === 'cancelled' || !a.appointment_date) return;
          const dow = parseLocalDate(a.appointment_date).getDay();
          counts[dow] = (counts[dow] || 0) + 1;
        });
        return MON_TO_SUN_DOW.map(dow => counts[dow]);
      }, [apts]);
      const busiestIdx = weekdayCounts.reduce((best, v, i) => v > weekdayCounts[best] ? i : best, 0);
      const hasData = weekdayCounts.some(v => v > 0);

      const [editWeekIdx, setEditWeekIdx] = useState(null);
      const [saving, setSaving] = useState(false);
      const [dayoffRequests, setDayoffRequests] = useState([]);
      const [requesting, setRequesting] = useState(false);

      const loadDayoffRequests = async () => {
        const res = await apiCall('GET', '/dayoff-requests/me');
        if (res.ok) setDayoffRequests(res.data);
      };
      useEffect(() => { loadDayoffRequests(); }, []);

      const pendingForDay = (dow) => dayoffRequests.find(r => r.day_of_week === dow && r.status === 'pending');

      const requestDayOff = async (dow) => {
        setRequesting(true);
        const res = await apiCall('POST', '/dayoff-requests', { day_of_week: dow });
        setRequesting(false);
        if (res.ok) {
          showToast(t('barber.dayoff_requested_toast'), 'success');
          loadDayoffRequests();
        } else {
          showToast(res.data?.error || t('barber.err_request_dayoff'), 'error');
        }
      };

      const cancelDayoffRequest = async (id) => {
        const res = await apiCall('DELETE', `/dayoff-requests/${id}`);
        if (res.ok) {
          showToast(t('barber.request_cancelled_toast'), 'info');
          loadDayoffRequests();
        } else {
          showToast(res.data?.error || t('barber.err_cancel_request'), 'error');
        }
      };

      const saveSchedule = async () => {
        setSaving(true);
        const schedule = weekSchedule.map(row => {
          const parts = (!row.closed && row.hours.includes(' - ')) ? row.hours.split(' - ') : [];
          return {
            day_of_week: DAY_MAP[row.day],
            start_time:  parts[0] || null,
            end_time:    parts[1] || null,
            closed:      row.closed,
          };
        });
        const result = await apiCall('PUT', `/barbers/${user.id}/working-hours`, { schedule });
        setSaving(false);
        if (result.ok) {
          showToast(t('barber.schedule_saved_toast'), 'success');
        } else {
          showToast(t('barber.err_save_schedule'), 'error');
        }
      };
      const [absences, setAbsences] = useState([]);
      const loadAbsences = async () => {
        const res = await apiCall('GET', '/absences/me');
        if (res.ok) setAbsences((res.data || []).filter(a => a.status === 'pending'));
      };
      useEffect(() => { loadAbsences(); }, []);

      const absStatusLabel = { pending: t('barber.abs_pending'), approved: t('barber.abs_approved'), rejected: t('barber.abs_rejected') };

      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('barber.my_schedule_title')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('barber.schedule_subtitle')}</p>
          </div>

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-chart-column" style={{ color: '#d4a574' }}></i> {t('barber.busiest_days')}
              </p>
              {hasData && (
                <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>
                  {t(weekdayCounts[busiestIdx] === 1 ? 'barber.busiest_day_text_singular' : 'barber.busiest_day_text_plural', { day: WEEK_ORDER[busiestIdx], count: weekdayCounts[busiestIdx] })}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 14px' }}>{t('barber.based_on_history')}</p>
            {hasData ? (
              <div style={{ height: 220 }}>
                <BarberWeekdayChart labels={WEEK_ORDER} values={weekdayCounts} />
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#4b5563', padding: '32px 0' }}>
                <i className="fas fa-chart-column" style={{ fontSize: 28, marginBottom: 10, display: 'block' }}></i>
                {t('barber.not_enough_data')}
              </div>
            )}
          </div>

          <div className="barber-horarios-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Week schedule */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-calendar-week" style={{ color: '#d4a574' }}></i> {t('barber.weekly_schedule')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {weekSchedule.map((row, idx) => {
                  const pending = pendingForDay(DAY_MAP[row.day]);
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bp-card)', borderRadius: 8, border: '1px solid var(--bp-border)' }}>
                      <span style={{ color: 'var(--bp-text-muted)', fontSize: 12, fontWeight: 700, width: 32, flexShrink: 0 }}>{DAY_DISPLAY[row.day]}</span>
                      <span style={{ color: row.closed ? '#ef4444' : 'var(--bp-text-secondary)', fontSize: 12, flex: 1 }}>{row.hours}</span>
                      {pending && (
                        <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-hourglass-half"></i> {t('barber.awaiting_approval')}
                        </span>
                      )}
                      {pending ? (
                        <button onClick={() => cancelDayoffRequest(pending.id)} aria-label={t('barber.cancel_dayoff_aria', { day: DAY_DISPLAY[row.day] })} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, padding: '2px 4px', transition: 'color .15s' }}
                          onMouseEnter={e => e.target.style.color = '#ef4444'}
                          onMouseLeave={e => e.target.style.color = '#4b5563'}>
                          <i className="fas fa-times" aria-hidden="true"></i>
                        </button>
                      ) : (
                        <button onClick={() => setEditWeekIdx(idx)} aria-label={t('barber.edit_schedule_aria', { day: DAY_DISPLAY[row.day] })} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 11, padding: '2px 4px', transition: 'color .15s' }}
                          onMouseEnter={e => e.target.style.color = '#d4a574'}
                          onMouseLeave={e => e.target.style.color = '#4b5563'}>
                          <i className="fas fa-pen" aria-hidden="true"></i>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={saveSchedule} disabled={saving} style={{ width: '100%', marginTop: 14, background: saving ? 'rgba(212,165,116,0.4)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px 0', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <><i className="fas fa-spinner fa-spin"></i> {t('common.saving')}</> : <><i className="fas fa-save"></i> {t('barber.save_schedule')}</>}
              </button>
            </div>

            {/* Absences */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fas fa-calendar-minus" style={{ color: '#ef4444' }}></i> {t('barber.absences_title')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {absences.map(abs => (
                  <div key={abs.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                    <i className="fas fa-calendar-times" style={{ color: '#ef4444', fontSize: 12, flexShrink: 0 }}></i>
                    <span style={{ color: 'var(--bp-text-secondary)', fontSize: 12, flex: 1 }}>
                      {fmtDate(abs.start_date)}{abs.start_date !== abs.end_date ? ` ${t('common.until')} ${fmtDate(abs.end_date)}` : ''}{abs.reason ? ` — ${abs.reason}` : ''}
                    </span>
                    <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>{absStatusLabel[abs.status] || abs.status}</span>
                  </div>
                ))}
                {absences.length === 0 && <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', padding: '14px 0' }}>{t('barber.no_pending_absence')}</p>}
              </div>
              <button onClick={onGoToAbsences} style={{ width: '100%', background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-secondary)', fontWeight: 600, fontSize: 12, padding: '9px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-secondary)'; }}>
                <i className="fas fa-plus"></i> {t('barber.register_absence')}
              </button>
            </div>
          </div>

          {/* Drum picker modal */}
          {editWeekIdx !== null && (
            <TimeDrumPicker
              row={weekSchedule[editWeekIdx]}
              onConfirm={(hours, closed) => {
                setWeekSchedule(prev => prev.map((r, i) => i === editWeekIdx ? { ...r, hours, closed } : r));
                setEditWeekIdx(null);
                showToast(t('barber.schedule_updated_toast'), 'success');
              }}
              onRequestDayOff={() => {
                requestDayOff(DAY_MAP[weekSchedule[editWeekIdx].day]);
                setEditWeekIdx(null);
              }}
              onClose={() => setEditWeekIdx(null)}
            />
          )}
        </div>
      );
    }

    /* ---- Avaliações do Barbeiro ---- */
    function BarberReviewCard({ review, onReply }) {
      const { t } = useLang();
      const [showReplyBox, setShowReplyBox] = useState(false);
      const [replyText, setReplyText] = useState(review.reply || '');
      const [saving, setSaving] = useState(false);

      const send = async () => {
        setSaving(true);
        await onReply(review.id, replyText);
        setSaving(false);
        setShowReplyBox(false);
      };

      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d4a57433', border: '2px solid #d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#d4a574', flexShrink: 0 }}>{(review.client_name || '?')[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{review.client_name}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(i => <i key={i} className="fas fa-star" style={{ color: i <= review.rating ? '#f59e0b' : 'var(--bp-border2)', fontSize: 12 }}></i>)}
                </div>
                <span style={{ color: 'var(--bp-text-faint)', fontSize: 11, marginLeft: 'auto' }}>{fmtDate(review.created_at)}</span>
              </div>
              <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: '0 0 4px' }}><i className="fas fa-cut" style={{ marginRight: 4 }}></i>{review.service_name}</p>
              {review.comment && <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: 0 }}>{review.comment}</p>}
              {review.reply && !showReplyBox && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, borderLeft: '3px solid #d4a574' }}>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 3px' }}>{t('barber.your_reply')}</p>
                  <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: 0, fontStyle: 'italic' }}>{review.reply}</p>
                </div>
              )}
              {showReplyBox && (
                <div style={{ marginTop: 10 }}>
                  <textarea rows={2} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={t('barber.reply_placeholder')} style={{ width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', resize: 'vertical', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={send} disabled={saving} style={{ background: saving ? 'var(--bp-border2)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 7, color: saving ? '#4b5563' : '#000', fontWeight: 700, fontSize: 12, padding: '6px 14px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{saving ? t('barber.sending') : t('barber.send_reply')}</button>
                    <button onClick={() => { setShowReplyBox(false); setReplyText(review.reply || ''); }} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: '#9ca3af', fontSize: 12, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                  </div>
                </div>
              )}
              {!showReplyBox && (
                <button onClick={() => setShowReplyBox(true)} style={{ marginTop: 10, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: '#d4a574', fontSize: 12, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  <i className={`fas ${review.reply ? 'fa-edit' : 'fa-reply'}`} style={{ marginRight: 6 }}></i>{review.reply ? t('barber.edit_reply') : t('barber.reply')}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    function BarberReviews({ user, showToast }) {
      const { t } = useLang();
      const [myReviews, setMyReviews] = useState([]);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState('all');

      const loadReviews = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/reviews/mine');
        if (res.ok) setMyReviews(res.data);
        setLoading(false);
      };
      useEffect(() => { loadReviews(); }, []);

      const handleReply = async (id, reply) => {
        const res = await apiCall('PATCH', `/reviews/${id}/reply`, { reply });
        if (res.ok) { showToast && showToast(t('barber.reply_sent_toast'), 'success'); loadReviews(); }
        else showToast && showToast(res.data?.error || t('barber.err_send_reply'), 'error');
      };

      const avgRating = myReviews.length ? (myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length).toFixed(1) : 0;
      const filtered = filter === 'all' ? myReviews : myReviews.filter(r => r.rating === Number(filter));
      const ratingCounts = [5, 4, 3, 2, 1].map(n => ({ n, count: myReviews.filter(r => r.rating === n).length }));

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('barber.my_reviews_title')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('barber.reviews_subtitle')}</p>
          </div>

          {/* Summary */}
          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'center' }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontSize: 52, fontWeight: 800, margin: 0, lineHeight: 1 }}>{avgRating}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 3, margin: '8px 0' }}>
                {[1, 2, 3, 4, 5].map(i => <i key={i} className="fas fa-star" style={{ color: i <= Math.round(avgRating) ? '#f59e0b' : 'var(--bp-border2)', fontSize: 16 }}></i>)}
              </div>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>{t('barber.reviews_count', { count: myReviews.length })}</p>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {ratingCounts.map(({ n, count }) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: 'var(--bp-text-muted)', fontSize: 12, width: 8 }}>{n}</span>
                  <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 11 }}></i>
                  <div style={{ flex: 1, height: 6, background: 'var(--bp-border)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#d4a574,#f59e0b)', width: myReviews.length ? `${(count / myReviews.length) * 100}%` : '0%', transition: 'width .6s' }}></div>
                  </div>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 12, width: 16 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[['all', t('barber.filter_all')], ['5', '★★★★★'], ['4', '★★★★'], ['3', '★★★'], ['2', '★★'], ['1', '★']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ background: filter === v ? 'rgba(212,165,116,0.15)' : 'none', border: `1px solid ${filter === v ? '#d4a574' : 'var(--bp-border2)'}`, borderRadius: 8, color: filter === v ? '#d4a574' : 'var(--bp-text-muted)', fontSize: 12, fontWeight: filter === v ? 600 : 400, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all .15s' }}>{l}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(review => (
              <BarberReviewCard key={review.id} review={review} onReply={handleReply} />
            ))}
            {filtered.length === 0 && (
              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '48px 0', textAlign: 'center' }}>
                <i className="fas fa-star" style={{ fontSize: 36, color: 'var(--bp-border2)', display: 'block', marginBottom: 12 }}></i>
                <p style={{ color: '#4b5563', fontSize: 14 }}>{t('barber.no_reviews_filter')}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    /* ---- Ausências ---- */
    function BarberAbsences({ user, showToast }) {
      const { t, lang } = useLang();
      const [absences, setAbsences] = useState([]);
      const [loading, setLoading] = useState(true);
      const [startDate, setStartDate] = useState('');
      const [endDate, setEndDate] = useState('');
      const [reason, setReason] = useState('');
      const [saving, setSaving] = useState(false);
      const [formError, setFormError] = useState('');
      const [cancelingId, setCancelingId] = useState(null);

      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
      const labelStyle = { color: 'var(--bp-text-muted)', fontSize: 13, display: 'block', marginBottom: 6 };

      const loadAbsences = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/absences/me');
        if (res.ok) setAbsences(res.data);
        setLoading(false);
      };
      useEffect(() => { loadAbsences(); }, []);

      const [appointments, setAppointments] = useState([]);
      const [loadingAgenda, setLoadingAgenda] = useState(true);
      const [calYear, setCalYear] = useState(new Date().getFullYear());
      const [calMonth, setCalMonth] = useState(new Date().getMonth());
      const [selectingEnd, setSelectingEnd] = useState(false);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      useEffect(() => {
        (async () => {
          setLoadingAgenda(true);
          const res = await apiCall('GET', '/appointments');
          if (res.ok) setAppointments(res.data);
          setLoadingAgenda(false);
        })();
      }, []);

      // Quantidade de compromissos ativos por dia, usada para colorir as bolinhas do calendário
      const apptCountByDate = useMemo(() => {
        const map = {};
        appointments.forEach(a => {
          if (a.status !== 'pending' && a.status !== 'confirmed') return;
          map[a.appointment_date] = (map[a.appointment_date] || 0) + 1;
        });
        return map;
      }, [appointments]);

      const dayOccupancy = (dateStr) => {
        const count = apptCountByDate[dateStr] || 0;
        if (count === 0) return { color: '#10b981', label: t('barber.free_day_good') };
        if (count <= 2) return { color: '#f59e0b', label: t('barber.few_appointments') };
        return { color: '#ef4444', label: t('barber.full_day') };
      };

      const pad = n => String(n).padStart(2, '0');
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
      const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
      const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
      const isPast = (d) => !d ? false : new Date(calYear, calMonth, d) < today;
      const inRange = (ds) => !!(ds && startDate && endDate && ds >= startDate && ds <= endDate);

      // Clique único seleciona um dia; um segundo clique em data posterior estende o período
      const handleDayClick = (d) => {
        if (!d || isPast(d)) return;
        const ds = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
        if (!selectingEnd) {
          setStartDate(ds); setEndDate(ds); setSelectingEnd(true);
        } else if (ds < startDate) {
          setStartDate(ds); setEndDate(ds);
        } else {
          setEndDate(ds); setSelectingEnd(false);
        }
        setFormError('');
      };

      const clearSelection = () => { setStartDate(''); setEndDate(''); setSelectingEnd(false); };

      const submit = async () => {
        setFormError('');
        if (!startDate || !endDate) { setFormError(t('barber.err_select_dates')); return; }
        if (endDate < startDate) { setFormError(t('barber.err_end_before_start')); return; }
        setSaving(true);
        const res = await apiCall('POST', '/absences', { start_date: startDate, end_date: endDate, reason: reason.trim() });
        setSaving(false);
        if (res.ok) {
          showToast(t('barber.absence_requested_toast'), 'success');
          setStartDate(''); setEndDate(''); setReason('');
          loadAbsences();
        } else {
          setFormError(res.data?.error || t('barber.err_send_request'));
        }
      };

      const cancelAbsence = async (id) => {
        setCancelingId(id);
        const res = await apiCall('DELETE', `/absences/${id}`);
        setCancelingId(null);
        if (res.ok) { showToast(t('barber.request_cancelled_toast'), 'info'); loadAbsences(); }
        else showToast(res.data?.error || t('barber.err_cancel'), 'error');
      };

      const statusInfo = {
        pending: { label: t('barber.abs_pending'), color: '#f59e0b', bg: 'rgba(245,158,11,.15)', icon: 'fa-hourglass-half' },
        approved: { label: t('barber.abs_approved'), color: '#10b981', bg: 'rgba(16,185,129,.15)', icon: 'fa-check-circle' },
        rejected: { label: t('barber.abs_rejected'), color: '#ef4444', bg: 'rgba(239,68,68,.15)', icon: 'fa-times-circle' },
      };

      return (
        <div style={{ width: '100%' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('barber.absences_page_title')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('barber.absences_subtitle')}</p>
          </div>

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 18px' }}>
              <i className="fas fa-calendar-plus" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('barber.new_request')}
            </p>
            <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <button onClick={prevMonth} aria-label={t('booking.prev_month')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 30, height: 30, cursor: 'pointer' }}><i className="fas fa-chevron-left" aria-hidden="true" style={{ fontSize: 12 }}></i></button>
                <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14 }}>{monthNames(lang)[calMonth]} {calYear}</span>
                <button onClick={nextMonth} aria-label={t('booking.next_month')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#d4a574', width: 30, height: 30, cursor: 'pointer' }}><i className="fas fa-chevron-right" aria-hidden="true" style={{ fontSize: 12 }}></i></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
                {t('booking.weekday_letters').split(',').map((d, i) => <div key={i} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, padding: '4px 0' }}>{d}</div>)}
              </div>
              {loadingAgenda ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}><i className="fas fa-spinner fa-spin" style={{ color: '#d4a574' }}></i></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                  {calDays().map((d, i) => {
                    const past = isPast(d);
                    const ds = d ? `${calYear}-${pad(calMonth + 1)}-${pad(d)}` : null;
                    const occ = d && !past ? dayOccupancy(ds) : null;
                    const isEdge = !!(ds && (ds === startDate || ds === endDate));
                    const selected = !!(ds && (isEdge || inRange(ds)));
                    return (
                      <div key={i} onClick={() => handleDayClick(d)} title={occ ? occ.label : undefined}
                        style={{
                          aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, fontSize: 13, cursor: d && !past ? 'pointer' : 'default',
                          background: isEdge ? '#d4a574' : selected ? 'rgba(212,165,116,0.25)' : 'transparent',
                          color: !d ? 'transparent' : past ? '#4b5563' : isEdge ? '#000' : 'var(--bp-text)',
                          fontWeight: isEdge ? 700 : 400, transition: 'all .15s',
                        }}>
                        <span>{d || ''}</span>
                        {occ && <span style={{ width: 5, height: 5, borderRadius: '50%', background: occ.color, marginTop: 2 }}></span>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bp-border2)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('barber.free_day')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('barber.few_appointments')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('barber.full_day')}</span>
                </div>
              </div>
            </div>

            {(startDate || endDate) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(212,165,116,0.08)', border: '1px solid rgba(212,165,116,0.3)', borderRadius: 9, padding: '10px 14px', marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--bp-text)', fontSize: 13 }}>
                  <i className="fas fa-calendar-day" style={{ color: '#d4a574', marginRight: 8 }}></i>
                  {startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} ${t('common.until')} ${fmtDate(endDate)}`}
                </span>
                <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>{t('barber.clear_selection')}</button>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="ab-reason" style={labelStyle}>{t('barber.reason_label')}</label>
              <textarea id="ab-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} placeholder={t('barber.reason_placeholder')} />
            </div>
            {formError && <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 14px' }}>{formError}</p>}
            <button onClick={submit} disabled={saving} style={{ background: saving ? 'var(--bp-border2)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: saving ? '#4b5563' : '#000', fontWeight: 700, fontSize: 13, padding: '11px 20px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {saving ? t('barber.sending') : <span><i className="fas fa-paper-plane" style={{ marginRight: 8 }}></i>{t('barber.send_request')}</span>}
            </button>
          </div>

          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 14px' }}>{t('barber.my_requests')}</p>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 26, color: '#d4a574' }}></i></div>
          ) : absences.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563', background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14 }}>
              <i className="fas fa-calendar-check" style={{ fontSize: 32, marginBottom: 10, display: 'block' }}></i>
              {t('barber.no_requests')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {absences.map(a => {
                const s = statusInfo[a.status] || statusInfo.pending;
                return (
                  <div key={a.id} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}><i className={`fas ${s.icon}`} style={{ marginRight: 5 }}></i>{s.label}</span>
                      </div>
                      <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: '0 0 4px' }}>
                        <i className="fas fa-calendar-day" style={{ marginRight: 6, color: 'var(--bp-text-faint)' }}></i>
                        {fmtDate(a.start_date)}{a.start_date !== a.end_date ? ` ${t('common.until')} ${fmtDate(a.end_date)}` : ''}
                      </p>
                      {a.reason && <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{a.reason}</p>}
                    </div>
                    {a.status === 'pending' && (
                      <button onClick={() => cancelAbsence(a.id)} disabled={cancelingId === a.id} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#9ca3af', fontSize: 12, fontWeight: 600, padding: '7px 14px', cursor: cancelingId === a.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        {cancelingId === a.id ? t('barber.cancelling') : t('common.cancel')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ---- Perfil do Barbeiro ---- */
    function BarberProfile({ user, showToast }) {
      const { t } = useLang();
      const [name, setName] = useState(user.name || '');
      const [email, setEmail] = useState(user.email || '');
      const [phone, setPhone] = useState(user.phone || '');
      const [specialty, setSpecialty] = useState('');
      const [bio, setBio] = useState('');
      const [portfolioPhotos, setPortfolioPhotos] = useState([null, null, null]);
      const [introVideoUrl, setIntroVideoUrl] = useState('');
      const [instagram, setInstagram] = useState('');
      const [saving, setSaving] = useState(false);
      const [loading, setLoading] = useState(true);
      const [avatarUrl, setAvatarUrl] = useState(null);
      const [avatarHover, setAvatarHover] = useState(false);
      const [myReviews, setMyReviews] = useState([]);
      const [appointments, setAppointments] = useState([]);
      const [theme, setTheme] = useState(user.theme || 'dark');
      const [savingTheme, setSavingTheme] = useState(false);
      const fileRef = useRef(null);
      const portfolioRefs = [useRef(null), useRef(null), useRef(null)];

      useEffect(() => {
        (async () => {
          const [meRes, reviewsRes, aptsRes] = await Promise.all([apiCall('GET', '/me'), apiCall('GET', '/reviews/mine'), apiCall('GET', '/appointments')]);
          if (meRes.ok) {
            setName(meRes.data.name || '');
            setEmail(meRes.data.email || '');
            setPhone(meRes.data.phone || '');
            setSpecialty(meRes.data.specialty || '');
            setAvatarUrl(meRes.data.photo_url || null);
            setTheme(meRes.data.theme || 'dark');
            setBio(meRes.data.bio || '');
            setIntroVideoUrl(meRes.data.intro_video_url || '');
            setInstagram(meRes.data.instagram || '');
            try {
              const parsed = meRes.data.portfolio_photos ? JSON.parse(meRes.data.portfolio_photos) : [];
              setPortfolioPhotos([0, 1, 2].map(i => parsed[i] || null));
            } catch { setPortfolioPhotos([null, null, null]); }
          }
          if (reviewsRes.ok) setMyReviews(reviewsRes.data);
          if (aptsRes.ok) setAppointments(aptsRes.data);
          setLoading(false);
        })();
      }, []);

      const completedCount = appointments.filter(a => a.status === 'completed').length;
      const resolvedCount = appointments.filter(a => a.status === 'completed' || a.status === 'cancelled').length;
      const completionRate = resolvedCount ? Math.round((completedCount / resolvedCount) * 100) : 0;

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

      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', transition: 'border-color .15s' };
      const labelStyle = { color: 'var(--bp-text-muted)', fontSize: 13, display: 'block', marginBottom: 6 };

      const save = async () => {
        setSaving(true);
        const res = await apiCall('PATCH', '/me', { name, phone, specialty, photo_url: avatarUrl, bio, intro_video_url: introVideoUrl, instagram, portfolio_photos: portfolioPhotos.filter(Boolean) });
        setSaving(false);
        if (res.ok) showToast(t('barber.profile_updated_toast'), 'success');
        else showToast(res.data?.error || t('barber.err_update_profile'), 'error');
      };

      const handleAvatarChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast(t('profile.err_invalid_image'), 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast(t('profile.err_image_too_large'), 'error'); return; }
        const reader = new FileReader();
        reader.onload = ev => { setAvatarUrl(ev.target.result); showToast(t('barber.photo_selected_toast'), 'info'); };
        reader.readAsDataURL(file);
      };

      const removeAvatar = (e) => { e.stopPropagation(); setAvatarUrl(null); showToast(t('barber.photo_removed_toast'), 'info'); };

      const handlePortfolioChange = async (idx, e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast(t('profile.err_invalid_image'), 'error'); return; }
        if (file.size > 8 * 1024 * 1024) { showToast(t('profile.err_image_too_large'), 'error'); return; }
        try {
          const resized = await resizeImageFile(file, 800, 0.8);
          setPortfolioPhotos(prev => prev.map((p, i) => i === idx ? resized : p));
          showToast(t('barber.photo_added_toast'), 'info');
        } catch {
          showToast(t('barber.err_process_image'), 'error');
        }
      };

      const removePortfolioPhoto = (idx) => setPortfolioPhotos(prev => prev.map((p, i) => i === idx ? null : p));

      const avgRating = myReviews.length ? (myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length).toFixed(1) : '—';
      const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div style={{ width: '100%' }}>
          <div style={{ marginBottom: 20 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('barber.my_profile_title')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('barber.my_profile_subtitle')}</p>
          </div>

          <div className="barber-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 20 }}>
            {/* Avatar & stats */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

              {/* Avatar with upload overlay */}
              <div style={{ position: 'relative', marginBottom: 14 }}
                onMouseEnter={() => setAvatarHover(true)}
                onMouseLeave={() => setAvatarHover(false)}>
                <div className="barber-avatar-wrap" role="button" tabIndex={0} aria-label={t('barber.change_photo_aria')} onClick={() => fileRef.current.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current.click(); }} style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', boxShadow: avatarHover ? '0 0 0 3px #d4a574' : '0 0 30px rgba(212,165,116,0.3)', transition: 'box-shadow .2s', flexShrink: 0 }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={t('barber.profile_photo_alt')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div className="syne" style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--bp-text)', fontWeight: 800 }}>
                      {initials}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: avatarHover ? 1 : 0, transition: 'opacity .2s', pointerEvents: 'none' }}>
                    <i className="fas fa-camera" aria-hidden="true" style={{ color: 'var(--bp-text)', fontSize: 18 }}></i>
                    <span style={{ color: 'var(--bp-text)', fontSize: 10, fontWeight: 600 }}>{t('barber.change_label')}</span>
                  </div>
                </div>

                {/* Remove photo badge */}
                {avatarUrl && (
                  <button onClick={removeAvatar} title={t('barber.remove_photo')} aria-label={t('barber.remove_photo')}
                    style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bp-panel)', color: 'var(--bp-text)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                    <i className="fas fa-times" aria-hidden="true"></i>
                  </button>
                )}

                {/* Hidden file input */}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
              </div>

              {/* Upload hint */}
              <button onClick={() => fileRef.current.click()} style={{ background: 'none', border: '1px dashed var(--bp-border2)', borderRadius: 7, color: 'var(--bp-text-faint)', fontSize: 11, padding: '4px 12px', cursor: 'pointer', marginBottom: 12, fontFamily: 'Inter, sans-serif', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-faint)'; }}>
                <i className="fas fa-upload" style={{ marginRight: 5 }}></i>
                {avatarUrl ? t('barber.change_photo_btn') : t('barber.add_photo_btn')}
              </button>

              <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: 0 }}>{name}</p>
              <p style={{ color: '#d4a574', fontSize: 13, margin: '4px 0 12px' }}>{specialty}</p>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 16 }}>
                {[1, 2, 3, 4, 5].map(i => <i key={i} className="fas fa-star" style={{ color: i <= Math.round(avgRating) ? '#f59e0b' : 'var(--bp-border2)', fontSize: 14 }}></i>)}
                <span style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, marginLeft: 4 }}>{avgRating}</span>
              </div>
              <div className="barber-stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                {[
                  { label: t('barber.stat_appointments'), value: completedCount, icon: 'fa-cut', color: '#d4a574' },
                  { label: t('barber.stat_reviews'), value: myReviews.length, icon: 'fa-star', color: '#f59e0b' },
                  { label: t('barber.stat_completion_rate'), value: `${completionRate}%`, icon: 'fa-check-circle', color: '#10b981' },
                  { label: t('barber.stat_pending'), value: appointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length, icon: 'fa-hourglass-half', color: '#3b82f6' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10, padding: '12px 10px' }}>
                    <i className={`fas ${stat.icon}`} style={{ color: stat.color, fontSize: 16, display: 'block', marginBottom: 6 }}></i>
                    <p className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 800, margin: 0 }}>{stat.value}</p>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit form */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 24 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 20px' }}>
                <i className="fas fa-user-edit" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('barber.edit_info')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label htmlFor="bp-name" style={labelStyle}>{t('barber.full_name_label')}</label><input id="bp-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                <div><label htmlFor="bp-email" style={labelStyle}>{t('common.email')}</label><input id="bp-email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                <div><label htmlFor="bp-phone" style={labelStyle}>{t('common.phone')}</label><input id="bp-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                <div><label htmlFor="bp-specialty" style={labelStyle}>{t('barber.specialty_label')}</label><input id="bp-specialty" value={specialty} onChange={e => setSpecialty(e.target.value)} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                <div><label htmlFor="bp-bio" style={labelStyle}>{t('barber.professional_bio_label')}</label><textarea id="bp-bio" value={bio} onChange={e => setBio(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>

                {/* Photo upload shortcut inside form */}
                <div role="button" tabIndex={0} aria-label={avatarUrl ? t('barber.change_profile_photo_aria') : t('barber.add_profile_photo_aria')} style={{ background: 'var(--bp-card)', border: '1px dashed var(--bp-border2)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'border-color .15s' }}
                  onClick={() => fileRef.current.click()}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current.click(); }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#d4a574'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bp-border2)'}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--bp-border2)' }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bp-text)', fontWeight: 700, fontSize: 14 }}>{initials}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, fontWeight: 600, margin: 0 }}>{t('barber.profile_photo_label')}</p>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{avatarUrl ? t('barber.click_to_change_photo') : t('barber.click_to_add_photo')} · {t('barber.photo_formats')}</p>
                  </div>
                  <i className="fas fa-camera" aria-hidden="true" style={{ color: '#d4a574', fontSize: 16, flexShrink: 0 }}></i>
                </div>

                <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: '#000', fontWeight: 700, fontSize: 14, padding: '12px 0', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', opacity: saving ? 0.7 : 1, marginTop: 4, width: '100%' }}>
                  {saving ? <span><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>{t('common.saving')}</span> : <span><i className="fas fa-save" style={{ marginRight: 8 }}></i>{t('profile.save_changes')}</span>}
                </button>
              </div>
            </div>

            {/* Apresentação para clientes (primeiro corte) */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 24, gridColumn: '1 / -1' }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>
                <i className="fas fa-star" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('barber.presentation_title')}
              </p>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 20px' }}>{t('barber.presentation_desc')}</p>

              <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, fontWeight: 600, margin: '0 0 10px' }}>{t('barber.work_photos_label')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20, maxWidth: 420 }}>
                {portfolioPhotos.map((photo, idx) => (
                  <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: photo ? '1px solid var(--bp-border2)' : '1px dashed var(--bp-border2)', background: 'var(--bp-card)', cursor: 'pointer' }}
                    onClick={() => portfolioRefs[idx].current.click()}>
                    {photo ? (
                      <img src={photo} alt={t('barber.work_photo_alt', { n: idx + 1 })} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-plus" style={{ color: 'var(--bp-text-faint)', fontSize: 18 }}></i>
                      </div>
                    )}
                    {photo && (
                      <button onClick={e => { e.stopPropagation(); removePortfolioPhoto(idx); }} title={t('barber.remove_photo')} aria-label={t('barber.remove_photo_aria', { n: idx + 1 })}
                        style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: '#ef4444', border: '2px solid var(--bp-panel)', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-times" aria-hidden="true"></i>
                      </button>
                    )}
                    <input ref={portfolioRefs[idx]} type="file" accept="image/*" onChange={e => handlePortfolioChange(idx, e)} style={{ display: 'none' }} />
                  </div>
                ))}
              </div>

              <div style={{ maxWidth: 420 }}>
                <label htmlFor="bp-video" style={labelStyle}>{t('barber.video_link_label')}</label>
                <input id="bp-video" value={introVideoUrl} onChange={e => setIntroVideoUrl(e.target.value)} placeholder="https://..." style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} />
                {introVideoUrl && (
                  getVideoEmbedUrl(introVideoUrl) ? (
                    <div style={{ marginTop: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bp-border2)', aspectRatio: '16/9' }}>
                      <iframe src={getVideoEmbedUrl(introVideoUrl)} title={t('barber.video_preview_title')} style={{ width: '100%', height: '100%', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                    </div>
                  ) : (
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '8px 0 0' }}><i className="fas fa-circle-info" style={{ marginRight: 5 }}></i>{t('barber.video_no_preview')}</p>
                  )
                )}
              </div>

              <div style={{ maxWidth: 420, marginTop: 20 }}>
                <label htmlFor="bp-instagram" style={labelStyle}>{t('barber.instagram_label')}</label>
                <input id="bp-instagram" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder={t('barber.instagram_placeholder')} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} />
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '6px 0 0' }}><i className="fas fa-circle-info" style={{ marginRight: 5 }}></i>{t('barber.instagram_hint')}</p>
              </div>
            </div>

            {/* Appearance */}
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 24, gridColumn: '1 / -1' }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>
                <i className="fas fa-palette" style={{ color: '#d4a574', marginRight: 8 }}></i>{t('profile.appearance')}
              </p>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 16px' }}>{t('profile.appearance_desc')}</p>
              <div style={{ maxWidth: 320 }}>
                <ThemeToggle theme={theme} onChange={handleThemeChange} saving={savingTheme} />
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* ---- Barber Notification Center ---- */
    const BARBER_NOTIF_TYPES = {
      warning: { icon: 'fa-exclamation-triangle', bg: 'rgba(245,158,11,.18)', color: '#f59e0b', labelKey: 'barber.notif_type_warning' },
      success: { icon: 'fa-check-circle',         bg: 'rgba(16,185,129,.18)', color: '#10b981', labelKey: 'barber.notif_type_success' },
      info:    { icon: 'fa-bell',                 bg: 'rgba(212,165,116,.18)', color: '#d4a574', labelKey: 'barber.notif_type_info' },
    };

    function BarberNotifCenter() {
      const { t } = useLang();
      const [open, setOpen] = useState(false);
      const [notifs, setNotifs] = useState([]);
      const [bellAnim, setBellAnim] = useState(false);
      const [tab, setTab] = useState('all');
      const panelRef = useRef(null);
      const btnRef = useRef(null);

      const load = async () => {
        const res = await apiCall('GET', '/notifications');
        if (res.ok) setNotifs(res.data);
      };

      useEffect(() => {
        load();
        const timer = setInterval(load, 60000);
        return () => clearInterval(timer);
      }, []);

      const unread = notifs.filter(n => !n.read).length;
      useEffect(() => {
        if (unread > 0) { setBellAnim(true); const timer = setTimeout(() => setBellAnim(false), 700); return () => clearTimeout(timer); }
      }, [unread]);

      useEffect(() => {
        if (!open) return;
        const h = (e) => {
          if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
      }, [open]);

      const markRead = async (id) => {
        setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: 1 } : n));
        await apiCall('PATCH', `/notifications/${id}/read`);
      };
      const markAll = async () => {
        setNotifs(ns => ns.map(n => ({ ...n, read: 1 })));
        await apiCall('PATCH', '/notifications/read-all');
      };

      const highCount = notifs.filter(n => n.type === 'warning' && !n.read).length;
      const filtered = tab === 'unread' ? notifs.filter(n => !n.read)
        : tab === 'high' ? notifs.filter(n => n.type === 'warning')
          : notifs;

      return (
        <div style={{ position: 'relative' }}>
          <button ref={btnRef} onClick={() => setOpen(o => !o)} className={bellAnim ? 'notif-bell-active' : ''}
            aria-label={unread > 0 ? t('client.notifications_unread_aria', { count: unread }) : t('client.notifications')} aria-expanded={open}
            style={{ position: 'relative', background: open ? 'rgba(212,165,116,.12)' : 'none', border: open ? '1px solid rgba(212,165,116,.3)' : '1px solid transparent', borderRadius: 8, color: open ? '#d4a574' : 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 16, padding: '6px 9px', transition: 'all .15s', display: 'flex', alignItems: 'center' }}>
            <i className="fas fa-bell" aria-hidden="true"></i>
            {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
          </button>

          {open && (
            <>
              <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 499 }} />
              <div ref={panelRef} className="notif-panel">
                <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fas fa-bell" style={{ color: '#d4a574', fontSize: 14 }}></i>
                      <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>{t('client.notifications')}</span>
                      {unread > 0 && <span style={{ background: '#ef4444', color: 'var(--bp-text)', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{unread}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {unread > 0 && (
                        <button onClick={markAll} style={{ background: 'none', border: 'none', color: '#d4a574', fontSize: 11, cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: '3px 6px', borderRadius: 6 }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(212,165,116,.1)'}
                          onMouseLeave={e => e.currentTarget.style.background='none'}>
                          {t('client.mark_all_read')}
                        </button>
                      )}
                      <button onClick={() => setOpen(false)} aria-label={t('notif.close_aria')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', fontSize: 14, cursor: 'pointer', padding: '3px 6px', borderRadius: 6 }}>
                        <i className="fas fa-times" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>

                  {highCount > 0 && (
                    <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '7px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fas fa-exclamation-circle" style={{ color: '#ef4444', fontSize: 13 }}></i>
                      <span style={{ color: '#fca5a5', fontSize: 12, flex: 1 }}>{t(highCount > 1 ? 'notif.high_priority_plural' : 'notif.high_priority_singular', { count: highCount })}</span>
                      <button onClick={() => setTab('high')} style={{ background: 'none', border: '1px solid rgba(239,68,68,.4)', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 5, padding: '2px 8px', fontFamily: 'Inter, sans-serif' }}>{t('notif.view')}</button>
                    </div>
                  )}

                  <div style={{ display: 'flex', borderBottom: '1px solid var(--bp-border)', marginLeft: -16, marginRight: -16, paddingLeft: 6 }}>
                    {[
                      { id: 'all', label: t('notif.tab_all'), count: notifs.length },
                      { id: 'unread', label: t('notif.tab_unread'), count: unread },
                      { id: 'high', label: t('notif.tab_urgent'), count: highCount },
                    ].map(tb => (
                      <button key={tb.id} className={`notif-tab${tab === tb.id ? ' active' : ''}`} onClick={() => setTab(tb.id)}>
                        {tb.label}{tb.count > 0 && <span style={{ marginLeft: 5, background: tab === tb.id ? 'rgba(212,165,116,.15)' : 'var(--bp-border)', color: tab === tb.id ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{tb.count}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filtered.length === 0 ? (
                    <div className="notif-empty">
                      <i className="fas fa-check-circle" style={{ fontSize: 32, color: 'var(--bp-border2)', marginBottom: 10 }}></i>
                      <p style={{ fontSize: 13, color: 'var(--bp-text-faint)' }}>{tab === 'all' ? t('barber.all_caught_up') : t('client.no_notifications')}</p>
                    </div>
                  ) : filtered.map(n => {
                    const nt = BARBER_NOTIF_TYPES[n.type] || BARBER_NOTIF_TYPES.info;
                    return (
                      <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => markRead(n.id)}>
                        <div className="notif-icon-wrap" style={{ background: nt.bg }}>
                          <i className={`fas ${nt.icon}`} style={{ color: nt.color }}></i>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: n.read ? 'var(--bp-text-secondary)' : 'var(--bp-text)', fontWeight: n.read ? 400 : 600, fontSize: 13, margin: '0 0 2px', lineHeight: 1.3 }}>{n.title}</p>
                          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.message}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <span style={{ background: nt.bg, color: nt.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5 }}>{t(nt.labelKey)}</span>
                            {!n.read && <span className="notif-dot"></span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {notifs.length > 0 && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--bp-border)', flexShrink: 0 }}>
                    <span style={{ color: '#4b5563', fontSize: 11 }}>{t(unread !== 1 ? 'notif.unread_of_total_plural' : 'notif.unread_of_total_singular', { unread, total: notifs.length })}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    /* ---- BarberDashboard Shell ---- */
    function BarberDashboard({ user, onLogout }) {
      const { t } = useLang();
      const BARBER_NAV = useBarberNav();
      const [activeView, setActiveView] = useState('agenda');
      const [toast, setToast] = useState(null);
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
      const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
      const [weekSchedule, setWeekSchedule] = useState(WEEK_DAYS.map(day => ({ day, hours: translateNow('barber.day_off_label'), closed: true })));

      useEffect(() => {
        (async () => {
          const res = await apiCall('GET', `/barbers/${user.id}/working-hours`);
          if (!res.ok) return;
          const rows = res.data || [];
          setWeekSchedule(WEEK_DAYS.map(day => {
            const row = rows.find(r => r.day_of_week === DAY_MAP[day]);
            return row
              ? { day, hours: `${row.start_time} - ${row.end_time}`, closed: false }
              : { day, hours: t('barber.day_off_label'), closed: true };
          }));
        })();
      }, [user.id]);

      const showToast = (msg, type = 'success') => setToast({ msg, type });
      const viewLabel = BARBER_NAV.find(n => n.id === activeView)?.label || '';
      // No menu mobile (overlay) o recuo do desktop não se aplica — sempre mostra completo
      const collapsed = sidebarCollapsed && !mobileSidebarOpen;
      const w = collapsed ? 64 : 220;

      const barberName = user.name || t('barber.role_label');

      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bp-bg)', position: 'relative' }}>
          {/* Mobile overlay */}
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}></div>}

          {/* Sidebar */}
          <div className={`admin-sidebar-desktop${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            <div style={{ width: w, minWidth: w, height: '100vh', background: 'var(--bp-bg)', borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column', transition: 'width .25s', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0 }}>
              {/* Logo */}
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
              {/* Nav */}
              <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
                {BARBER_NAV.map(item => {
                  const active = activeView === item.id;
                  return (
                    <button key={item.id} onClick={() => { setActiveView(item.id); setMobileSidebarOpen(false); }} title={collapsed ? item.label : ''} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginBottom: 2, background: active ? 'rgba(212,165,116,0.12)' : 'none', border: 'none', cursor: 'pointer', color: active ? '#d4a574' : 'var(--bp-text-muted)', transition: 'all .15s', textAlign: 'left', borderLeft: active ? '3px solid #d4a574' : '3px solid transparent' }}>
                      <i className={item.icon} style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                      {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
              {/* User & logout */}
              <div style={{ padding: '12px 8px', borderTop: '1px solid var(--bp-border)' }}>
                {!collapsed && (
                  <div style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bp-card)' }}>
                    <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{barberName}</p>
                    <p style={{ color: '#d4a574', fontSize: 11, margin: 0 }}>{t('barber.role_label')}</p>
                  </div>
                )}
                <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                  <i className="fas fa-sign-out-alt" style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                  {!collapsed && <span>{t('common.logout')}</span>}
                </button>
              </div>
            </div>
          </div>

          {/* Main */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Topbar */}
            <div style={{ padding: '0 16px', height: 60, borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-bg)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setMobileSidebarOpen(true)} className="sidebar-hamburger" aria-label={t('common.open_menu')} style={{ background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer', fontSize: 18, padding: '4px 8px', display: 'none' }}>
                  <i className="fas fa-bars" aria-hidden="true"></i>
                </button>
                <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>{viewLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HeaderThemeToggle user={user} />
                <HeaderLanguageToggle />
                <BarberNotifCenter />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bp-card)', borderRadius: 8, border: '1px solid var(--bp-border2)' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#000', fontWeight: 700 }}>{barberName.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                  <div className="barber-topbar-username">
                    <p style={{ color: 'var(--bp-text)', fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>{barberName}</p>
                    <p style={{ color: '#d4a574', fontSize: 10, margin: 0 }}>{t('barber.role_label')}</p>
                  </div>
                </div>
                <button onClick={onLogout} aria-label={t('common.logout')} style={{ background: 'none', border: '1px solid var(--bp-border)', borderRadius: 8, color: 'var(--bp-text-muted)', padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}><i className="fas fa-sign-out-alt" aria-hidden="true"></i></button>
              </div>
            </div>

            {/* Content */}
            <main className="barber-main-content" style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
              {activeView === 'agenda' ? (
                <BarberAgenda user={user} showToast={showToast} />
              ) : activeView === 'appointments' ? (
                <BarberAppointments user={user} showToast={showToast} />
              ) : activeView === 'horarios' ? (
                <BarberHorarios user={user} showToast={showToast} weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule} onGoToAbsences={() => setActiveView('absences')} />
              ) : activeView === 'absences' ? (
                <BarberAbsences user={user} showToast={showToast} />
              ) : activeView === 'reviews' ? (
                <BarberReviews user={user} showToast={showToast} />
              ) : activeView === 'profile' ? (
                <BarberProfile user={user} showToast={showToast} />
              ) : null}
            </main>
          </div>

          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
      );
    }

