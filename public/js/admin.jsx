    /* ======================================================
       ADMIN — SIDEBAR + SHELL
    ====================================================== */
    function useAdminNav() {
      const { t } = useLang();
      return [
        { id: 'dashboard', icon: 'fas fa-chart-pie', label: t('admin.nav_overview') },
        { id: 'appointments', icon: 'fas fa-calendar-check', label: t('admin.nav_appointments') },
        { id: 'clients', icon: 'fas fa-users', label: t('admin.nav_clients') },
        { id: 'barbers', icon: 'fas fa-user-tie', label: t('admin.nav_barbers') },
        { id: 'services', icon: 'fas fa-cut', label: t('admin.nav_services') },
        { id: 'reports', icon: 'fas fa-chart-bar', label: t('admin.nav_reports') },
        { id: 'reviews', icon: 'fas fa-star', label: t('admin.nav_reviews') },
        { id: 'horarios', icon: 'fas fa-clock', label: t('admin.nav_hours') },
        { id: 'settings', icon: 'fas fa-cog', label: t('admin.nav_settings') },
      ];
    }

    function AdminSidebar({ activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed, onLogout, user, isMobileOpen }) {
      const { t } = useLang();
      const ADMIN_NAV = useAdminNav();
      // No menu mobile (overlay) o recuo do desktop não se aplica — sempre mostra completo
      const collapsed = sidebarCollapsed && !isMobileOpen;
      const w = collapsed ? 64 : 220;
      return (
        <div style={{ width: w, minWidth: w, height: '100vh', background: 'var(--bp-bg)', borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column', transition: 'width .25s', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0 }}>
          <div style={{ padding: collapsed ? '18px 8px' : '18px 16px', borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, minHeight: 64 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 6 }}>
              <img src="/img/icon-white.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            {!collapsed && <span className="syne" style={{ fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', whiteSpace: 'nowrap' }}>CS <span style={{ color: '#d4a574' }}>BARBER</span></span>}
          </div>
          {/* Collapse toggle — não faz sentido dentro da gaveta mobile, que já fecha sozinha */}
          {!isMobileOpen && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bp-border)', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
              <button onClick={() => setSidebarCollapsed(c => !c)} aria-label={sidebarCollapsed ? t('common.expand') : t('client.collapse')} title={sidebarCollapsed ? t('common.expand') : t('client.collapse')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 6, color: 'var(--bp-text-faint)', cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`} style={{ fontSize: 11 }}></i>
              </button>
            </div>
          )}
          <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
            {ADMIN_NAV.map(item => {
              const active = activeView === item.id;
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)} title={collapsed ? item.label : ''} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginBottom: 2, background: active ? 'rgba(212,165,116,0.12)' : 'none', border: 'none', cursor: 'pointer', color: active ? '#d4a574' : 'var(--bp-text-muted)', transition: 'all .15s', textAlign: 'left', borderLeft: active ? '3px solid #d4a574' : '3px solid transparent' }}>
                  <i className={item.icon} style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                  {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
                </button>
              );
            })}
          </nav>
          <div style={{ padding: '12px 8px', borderTop: '1px solid var(--bp-border)' }}>
            {!collapsed && (
              <div style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bp-card)' }}>
                <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{user.name}</p>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{t('admin.role_label')}</p>
              </div>
            )}
            <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
              <i className="fas fa-sign-out-alt" style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
              {!collapsed && <span>{t('common.logout')}</span>}
            </button>
          </div>
        </div>
      );
    }

    function AdminDashboard({ user, onLogout }) {
      const { t } = useLang();
      const ADMIN_NAV = useAdminNav();
      const [stats, setStats] = useState(null);
      const [appointments, setAppointments] = useState([]);
      const [clients, setClients] = useState([]);
      const [recentReviews, setRecentReviews] = useState([]);
      const [reviews, setReviews] = useState([]);
      const [activeView, setActiveView] = useState('dashboard');
      const [loading, setLoading] = useState(true);
      const [toast, setToast] = useState(null);
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
      const [updatingAptId, setUpdatingAptId] = useState(null);

      useEffect(() => { loadData(); }, []);

      const loadData = async () => {
        setLoading(true);
        const [statsRes, aptsRes, clientsRes, reviewsRes, allReviewsRes] = await Promise.all([
          apiCall('GET', '/dashboard/stats'),
          apiCall('GET', '/appointments'),
          apiCall('GET', '/clients'),
          apiCall('GET', '/reviews/recent'),
          apiCall('GET', '/reviews')
        ]);
        if (statsRes.ok) setStats(statsRes.data);
        if (aptsRes.ok) setAppointments(aptsRes.data);
        if (clientsRes.ok) setClients(clientsRes.data);
        if (reviewsRes.ok) setRecentReviews(reviewsRes.data);
        if (allReviewsRes.ok) setReviews(allReviewsRes.data);
        setLoading(false);
      };

      const reloadClients = async () => {
        const res = await apiCall('GET', '/clients');
        if (res.ok) setClients(res.data);
      };

      const reloadAppointments = async () => {
        const [statsRes, aptsRes] = await Promise.all([
          apiCall('GET', '/dashboard/stats'),
          apiCall('GET', '/appointments'),
        ]);
        if (statsRes.ok) setStats(statsRes.data);
        if (aptsRes.ok) setAppointments(aptsRes.data);
      };

      const handleStatusChange = async (aptId, newStatus) => {
        setUpdatingAptId(aptId);
        const result = await apiCall('PATCH', `/appointments/${aptId}/status`, { status: newStatus });
        if (result.ok) { await reloadAppointments(); setToast({ msg: t('admin.status_updated_toast'), type: 'success' }); }
        else { setToast({ msg: result.data?.error || t('admin.err_update_status'), type: 'error' }); }
        setUpdatingAptId(null);
      };

      const viewLabel = ADMIN_NAV.find(n => n.id === activeView)?.label || t('admin.dashboard_fallback');

      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bp-bg)', position: 'relative' }}>
          {/* Mobile sidebar overlay */}
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}></div>}
          {/* Sidebar — hidden on mobile unless open */}
          <div className={`admin-sidebar-desktop${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            <AdminSidebar activeView={activeView} setActiveView={(v) => { setActiveView(v); setMobileSidebarOpen(false); }} sidebarCollapsed={sidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} onLogout={onLogout} user={user} isMobileOpen={mobileSidebarOpen} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '0 16px', height: 60, borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-bg)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setMobileSidebarOpen(o => !o)} className="admin-hamburger" aria-label={t('common.open_menu')} style={{ background: 'none', border: 'none', color: '#d4a574', cursor: 'pointer', fontSize: 20, padding: '4px 6px', display: 'none' }}>
                  <i className="fas fa-bars" aria-hidden="true"></i>
                </button>
                <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>CS <span style={{ color: '#d4a574' }}>BARBER</span> <span style={{ color: 'var(--bp-text-faint)', fontWeight: 400, fontSize: 12 }}>{t('admin.role_label')}</span></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HeaderThemeToggle user={user} />
                <HeaderLanguageToggle />
                <NotificationCenter appointments={appointments} stats={stats} clients={clients} reviews={recentReviews} />
                <button onClick={onLogout} aria-label={t('common.logout')} style={{ background: 'none', border: '1px solid var(--bp-border)', borderRadius: 8, color: 'var(--bp-text-muted)', padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}><i className="fas fa-sign-out-alt" aria-hidden="true"></i></button>
              </div>
            </div>
            <main style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }} className="admin-main">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 32, color: '#d4a574' }}></i></div>
              ) : activeView === 'dashboard' ? (
                <AdminDashboardView stats={stats} appointments={appointments} />
              ) : activeView === 'appointments' ? (
                <AdminAppointments appointments={appointments} onStatusChange={handleStatusChange} updatingAptId={updatingAptId} />
              ) : activeView === 'clients' ? (
                <AdminClients clients={clients} reloadClients={reloadClients} showToast={(msg, type) => setToast({ msg, type })} />
              ) : activeView === 'barbers' ? (
                <AdminBarbers showToast={(msg, type) => setToast({ msg, type })} />
              ) : activeView === 'services' ? (
                <AdminServices showToast={(msg, type) => setToast({ msg, type })} />
              ) : activeView === 'reports' ? (
                <AdminReports appointments={appointments} clients={clients} reviews={reviews} />
              ) : activeView === 'reviews' ? (
                <AdminReviews />
              ) : activeView === 'horarios' ? (
                <AdminHorarios appointments={appointments} onStatusChange={handleStatusChange} showToast={(msg, type) => setToast({ msg, type })} />
              ) : activeView === 'settings' ? (
                <AdminSettings showToast={(msg, type) => setToast({ msg, type })} />
              ) : (
                <div style={{ color: 'var(--bp-text-faint)', textAlign: 'center', padding: '64px 0' }}>
                  <i className="fas fa-tools" style={{ fontSize: 40, marginBottom: 16, display: 'block' }}></i>
                  <p style={{ fontSize: 16 }}>{t('admin.in_development', { view: viewLabel })}</p>
                </div>
              )}
            </main>
          </div>
          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
      );
    }

    /* ======================================================
       ADMIN — VISÃO GERAL
    ====================================================== */
    function BigLineChart({ datasets, labels }) {
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        const cs = getComputedStyle(document.documentElement);
        const textMuted = cs.getPropertyValue('--bp-text-muted').trim();
        const border = cs.getPropertyValue('--bp-border').trim();
        const textFaint = cs.getPropertyValue('--bp-text-faint').trim();
        chartRef.current = new Chart(canvasRef.current, {
          type: 'line', data: { labels, datasets },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: textMuted, font: { size: 11 }, boxWidth: 12 } } }, scales: { x: { grid: { color: border }, ticks: { color: textFaint, font: { size: 10 } } }, y: { grid: { color: border }, ticks: { color: textFaint, font: { size: 10 } }, beginAtZero: true } } }
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
      }, [labels, datasets]);
      return <div style={{ position: 'relative', height: 180, width: '100%' }}><canvas ref={canvasRef}></canvas></div>;
    }

    function AdminDashboardView({ stats, appointments }) {
      const { t } = useLang();
      const today = todayStart();
      const upcoming = appointments.filter(a => a.status !== 'cancelled' && parseLocalDate(a.appointment_date) >= today).sort((a, b) => parseLocalDate(a.appointment_date) - parseLocalDate(b.appointment_date)).slice(0, 5);
      const aptChart = stats?.appointments_chart;
      const revChart = stats?.revenue_chart;
      const last7 = useMemo(() => (aptChart?.labels || []).map(d => { const [y, m, day] = d.split('-'); return `${day}/${m}`; }), [aptChart]);
      const aptChartDatasets = useMemo(() => [
        { label: t('barber.filter_completed'), data: aptChart?.completed || [], borderColor: '#10b981', backgroundColor: '#10b98122', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true },
        { label: t('barber.card_pending'), data: aptChart?.pending || [], borderColor: '#f59e0b', backgroundColor: '#f59e0b22', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true }
      ], [aptChart, t]);
      const revChartDatasets = useMemo(() => [
        { label: t('admin.chart_revenue_dataset'), data: revChart?.values || [], borderColor: '#3b82f6', backgroundColor: '#3b82f622', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true }
      ], [revChart, t]);
      if (!stats) return <div style={{ color: 'var(--bp-text-faint)', textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      const barberStats = stats.barber_stats || [];
      const topServices = stats.top_services || [];
      const clientsBadge = pctChangeBadge(stats.new_clients_7d || 0, stats.new_clients_prev_7d || 0);
      const completedBadge = pctChangeBadge(stats.completed_7d || 0, stats.completed_prev_7d || 0);
      const revenueBadge = pctChangeBadge(stats.revenue || 0, stats.revenue_prev_30d || 0);

      const StatCard = ({ label, value, icon, iconBg, badge, subtitle }) => (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--bp-text)' }}><i className={icon}></i></div>
          </div>
          <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: '0 0 4px' }}>{label}</p>
          <p style={{ color: 'var(--bp-text)', fontSize: 26, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px', fontFamily: 'Inter, sans-serif' }}>{value}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {badge ? (
              <>
                <i className={`fas ${badge.icon}`} style={{ fontSize: 10, color: badge.color }}></i>
                <span style={{ fontSize: 12, color: badge.color }}>{badge.text}</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--bp-text-faint)' }}>{subtitle}</span>
            )}
          </div>
        </div>
      );

      return (
        <div>
          <div style={{ marginBottom: 24 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('admin.welcome_admin')}</h2>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{t('admin.dashboard_subtitle')}</p>
          </div>
          <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label={t('admin.stat_active_clients')} value={fmtNum(stats.total_clients)} icon="fas fa-users" iconBg="#1d4ed8" badge={clientsBadge} />
            <StatCard label={t('admin.stat_completed_appointments')} value={fmtNum(stats.completed_appointments)} icon="fas fa-check-circle" iconBg="#065f46" badge={completedBadge} />
            <StatCard label={t('admin.stat_revenue_30d')} value={fmtCur(stats.revenue)} icon="fas fa-dollar-sign" iconBg="#92400e" badge={revenueBadge} />
            <StatCard label={t('barber.card_pending')} value={fmtNum(stats.pending_appointments)} icon="fas fa-hourglass-half" iconBg="#7c2d12" subtitle={t('barber.awaiting_confirmation')} />
          </div>
          <div className="admin-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><i className="fas fa-calendar" style={{ color: '#d4a574', fontSize: 14 }}></i><span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{t('admin.nav_appointments')}</span></div>
              <BigLineChart datasets={aptChartDatasets} labels={last7} />
            </div>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><i className="fas fa-dollar-sign" style={{ color: '#d4a574', fontSize: 14 }}></i><span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{t('admin.chart_revenue')}</span></div>
              <p style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.3px', fontFamily: 'Inter, sans-serif' }}>{fmtCur(stats.revenue)}</p>
              <p style={{ color: revenueBadge.color, fontSize: 12, margin: '0 0 12px' }}><i className={`fas ${revenueBadge.icon}`} style={{ fontSize: 10 }}></i> {revenueBadge.text}</p>
              <BigLineChart datasets={revChartDatasets} labels={last7} />
            </div>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 14 }}></i><span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{t('admin.top_services')}</span></div>
              {topServices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topServices.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#d4a574', fontWeight: 700, fontSize: 13, width: 16 }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: 'var(--bp-text)', fontSize: 13, margin: 0, fontWeight: 500 }}>{s.name}</p>
                        <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{t('notif.appointments_count', { count: s.completed })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', paddingTop: 32 }}>
                  <i className="fas fa-cut" style={{ fontSize: 36, color: 'var(--bp-border2)', display: 'block', marginBottom: 12 }}></i>
                  <p style={{ color: '#4b5563', fontSize: 13 }}>{t('admin.no_data_available')}</p>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><i className="fas fa-calendar-check" style={{ color: '#d4a574', fontSize: 14 }}></i><span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{t('client.upcoming_appointments_title')}</span></div>
              {upcoming.length === 0 ? (
                <p style={{ color: '#4b5563', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>{t('appointments.no_upcoming')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcoming.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bp-card)', borderRadius: 10, border: '1px solid var(--bp-border2)' }}>
                      <div style={{ background: '#1d4ed8', borderRadius: 8, padding: '6px 10px', textAlign: 'center', flexShrink: 0 }}>
                        <p style={{ color: 'var(--bp-text)', fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1 }}>{a.appointment_time || '--:--'}</p>
                        <p style={{ color: '#93c5fd', fontSize: 10, margin: 0 }}>{a.appointment_date ? a.appointment_date.slice(5).replace('-', '/') : ''}</p>
                      </div>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#d4a57433', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#d4a574', fontWeight: 700, flexShrink: 0 }}>{BARBER_INITIALS(a.client_name || '?')}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.client_name}</p>
                        <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{a.service_name}</p>
                      </div>
                      <span style={{ background: a.status === 'confirmed' ? '#f59e0b22' : a.status === 'completed' ? '#10b98122' : '#3b82f622', color: a.status === 'confirmed' ? '#f59e0b' : a.status === 'completed' ? '#10b981' : '#3b82f6', fontSize: 11, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{statusLabel(a.status)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 14 }}></i><span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{t('admin.featured_barbers')}</span></div>
              {barberStats.length === 0 ? (
                <p style={{ color: '#4b5563', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>{t('admin.no_barbers_registered')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {barberStats.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bp-card)', borderRadius: 10, border: '1px solid var(--bp-border2)' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: BARBER_COLORS[i % BARBER_COLORS.length] + '33', border: `2px solid ${BARBER_COLORS[i % BARBER_COLORS.length]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: BARBER_COLORS[i % BARBER_COLORS.length], fontWeight: 700, flexShrink: 0 }}>{BARBER_INITIALS(b.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{b.name}</p>
                        <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{t('admin.appointments_count', { count: b.completed })}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600 }}>{b.rating || 0}</span>
                        <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 12 }}></i>
                        <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>({b.reviews || 0})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    /* ======================================================
       ADMIN — AGENDAMENTOS
    ====================================================== */
    function useApptStatusFilters() {
      const { t } = useLang();
      return [
        { id: '', label: t('barber.filter_all'), icon: 'fa-calendar' },
        { id: 'pending', label: t('barber.card_pending'), icon: 'fa-hourglass-half' },
        { id: 'confirmed', label: t('barber.card_confirmed'), icon: 'fa-check' },
        { id: 'completed', label: t('barber.filter_completed'), icon: 'fa-check-double' },
        { id: 'cancelled', label: t('barber.filter_cancelled'), icon: 'fa-ban' },
      ];
    }
    const APPT_SORTS = {
      proximos: { get label() { return translateNow('barber.sort_closest'); }, fn: (a, b) => `${a.appointment_date}T${a.appointment_time || ''}`.localeCompare(`${b.appointment_date}T${b.appointment_time || ''}`) },
      recentes: { get label() { return translateNow('barber.sort_recent'); }, fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
      valor: { get label() { return translateNow('barber.sort_highest_value'); }, fn: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0) },
    };
    const APPT_STATUS_PILL = (s) => ({ completed: 'rpt-pill-completed', confirmed: 'rpt-pill-confirmed', pending: 'rpt-pill-pending', cancelled: 'rpt-pill-cancelled' }[s] || '');

    function AdminAppointments({ appointments, onStatusChange, updatingAptId }) {
      const { t, lang } = useLang();
      const APPT_STATUS_FILTERS = useApptStatusFilters();
      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
      const [search, setSearch] = useState('');
      const [statusFilter, setStatusFilter] = useState('');
      const [barberFilter, setBarberFilter] = useState('');
      const [periodFilter, setPeriodFilter] = useState('todos');
      const [sortBy, setSortBy] = useState('proximos');
      const [page, setPage] = useState(1);
      const [confirmComplete, setConfirmComplete] = useState(null);
      const PAGE_SIZE = 8;

      const handleSelectStatus = (apt, newStatus) => {
        if (newStatus === 'completed') setConfirmComplete(apt);
        else onStatusChange(apt.id, newStatus);
      };

      const confirmMarkCompleted = () => {
        if (confirmComplete) onStatusChange(confirmComplete.id, 'completed');
        setConfirmComplete(null);
      };

      const barberNames = useMemo(() => [...new Set(appointments.map(a => a.barber_name).filter(Boolean))].sort(), [appointments]);

      const clientCancelStats = useMemo(() => {
        const map = {};
        appointments.forEach(a => {
          if (!map[a.client_id]) map[a.client_id] = { total: 0, cancelled: 0 };
          map[a.client_id].total++;
          if (a.status === 'cancelled') map[a.client_id].cancelled++;
        });
        return map;
      }, [appointments]);
      const clientCancelRate = (clientId) => {
        const s = clientCancelStats[clientId];
        return s && s.total > 0 ? Math.round((s.cancelled / s.total) * 100) : 0;
      };
      const cancelTier = (rate) => rate >= 30
        ? { label: t('barber.tier_bad'), color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
        : rate >= 15
        ? { label: t('barber.tier_attention'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
        : { label: t('barber.tier_good'), color: '#10b981', bg: 'rgba(16,185,129,0.12)' };

      const today = todayStart();
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
      const isToday = (a) => parseLocalDate(a.appointment_date).getTime() === today.getTime();
      const matchesPeriod = (a) => {
        if (periodFilter === 'todos') return true;
        const d = parseLocalDate(a.appointment_date);
        if (periodFilter === 'hoje') return d.getTime() === today.getTime();
        if (periodFilter === 'amanha') return d.getTime() === tomorrow.getTime();
        if (periodFilter === 'semana') return d >= today && d <= weekEnd;
        return true;
      };

      const isTomorrow = (a) => parseLocalDate(a.appointment_date).getTime() === tomorrow.getTime();

      const todayCount = appointments.filter(isToday).length;
      const tomorrowCount = appointments.filter(isTomorrow).length;
      const pendingCount = appointments.filter(a => a.status === 'pending').length;
      const confirmedCount = appointments.filter(a => a.status === 'confirmed').length;
      const todayRevenue = appointments.filter(a => a.status === 'completed' && isToday(a)).reduce((s, a) => s + (Number(a.price) || 0), 0);
      const cancelledApts = appointments.filter(a => a.status === 'cancelled');
      const cancelledCount = cancelledApts.length;
      const cancelledRevenue = cancelledApts.reduce((s, a) => s + (Number(a.price) || 0), 0);
      const globalCancelRate = appointments.length ? Math.round((cancelledCount / appointments.length) * 100) : 0;

      const searched = appointments.filter(a => {
        const q = search.toLowerCase();
        return !q || (a.client_name || '').toLowerCase().includes(q) || (a.service_name || '').toLowerCase().includes(q) || (a.barber_name || '').toLowerCase().includes(q);
      });
      const preStatus = searched.filter(a => matchesPeriod(a) && (!barberFilter || a.barber_name === barberFilter));
      const filtered = preStatus.filter(a => !statusFilter || a.status === statusFilter).sort(APPT_SORTS[sortBy].fn);
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

      return (
        <div className="max-w-6xl">
          <div className="rpt-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-calendar-check" style={{ color: '#d4a574', fontSize: 20 }}></i>
              <div>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 700, margin: 0 }}>{t('admin.nav_appointments')}</h2>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: 0 }}>{t('admin.manage_appointments_subtitle')}</p>
              </div>
            </div>
            <div className="admin-filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 12, pointerEvents: 'none' }}></i>
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('admin.search_client_service_placeholder')} aria-label={t('admin.search_appointment_aria')} style={{ ...inputStyle, paddingLeft: 30 }} />
              </div>
              <select className="rpt-select" value={barberFilter} onChange={e => { setBarberFilter(e.target.value); setPage(1); }} style={{ flex: '1 1 140px' }}>
                <option value="">{t('admin.all_barbers')}</option>
                {barberNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select className="rpt-select" value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); setPage(1); }} style={{ flex: '1 1 140px' }}>
                <option value="todos">{t('barber.period_all')}</option>
                <option value="hoje">{t('barber.today')}</option>
                <option value="amanha">{t('barber.tomorrow')}</option>
                <option value="semana">{t('barber.period_week')}</option>
              </select>
              <select className="rpt-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }} style={{ flex: '1 1 140px' }}>
                {Object.entries(APPT_SORTS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="rpt-stat-grid">
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(212,165,116,0.15)' }}><i className="fas fa-calendar-day" style={{ color: '#d4a574' }}></i></div>
              <div className="rpt-stat-label">{t('admin.today_date_label', { date: new Date().toLocaleDateString(localeTag(lang)) })}</div>
              <div className="rpt-stat-value">{fmtNum(todayCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(96,165,250,0.15)' }}><i className="fas fa-hourglass-half" style={{ color: '#60a5fa' }}></i></div>
              <div className="rpt-stat-label">{t('barber.awaiting_confirmation')}</div>
              <div className="rpt-stat-value">{fmtNum(pendingCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(16,185,129,0.15)' }}><i className="fas fa-check" style={{ color: '#10b981' }}></i></div>
              <div className="rpt-stat-label">{t('barber.card_confirmed')}</div>
              <div className="rpt-stat-value">{fmtNum(confirmedCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(212,165,116,0.15)' }}><i className="fas fa-dollar-sign" style={{ color: '#d4a574' }}></i></div>
              <div className="rpt-stat-label">{t('barber.today_revenue')}</div>
              <div className="rpt-stat-value">{fmtCur(todayRevenue)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(139,92,246,0.15)' }}><i className="fas fa-calendar-plus" style={{ color: '#8b5cf6' }}></i></div>
              <div className="rpt-stat-label">{t('barber.tomorrow')}</div>
              <div className="rpt-stat-value">{fmtNum(tomorrowCount)}</div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}><i className="fas fa-ban" style={{ color: '#ef4444' }}></i></div>
              <div className="rpt-stat-label">{t('admin.cancelled_pct_label', { pct: globalCancelRate })}</div>
              <div className="rpt-stat-value">{fmtNum(cancelledCount)}</div>
              <div className="rpt-stat-change" style={{ color: '#ef4444' }}>{t('admin.lost_revenue', { valor: fmtCur(cancelledRevenue) })}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {APPT_STATUS_FILTERS.map(f => {
              const count = f.id === '' ? preStatus.length : preStatus.filter(a => a.status === f.id).length;
              const active = statusFilter === f.id;
              return (
                <button key={f.id || 'todos'} onClick={() => { setStatusFilter(f.id); setPage(1); }}
                  style={{ padding: '7px 16px', borderRadius: 99, border: '1px solid ' + (active ? '#d4a574' : 'var(--bp-border2)'), background: active ? 'rgba(212,165,116,0.12)' : 'transparent', color: active ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <i className={'fas ' + f.icon} style={{ fontSize: 10 }}></i>
                  {f.label}
                  <span style={{ background: active ? 'rgba(212,165,116,0.2)' : 'var(--bp-border)', borderRadius: 99, padding: '1px 7px', fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="rpt-table-panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="rpt-table">
                <thead><tr><th>{t('admin.table_client')}</th><th>{t('admin.table_client_cancel_rate')}</th><th>{t('admin.table_service')}</th><th>{t('admin.table_barber')}</th><th>{t('admin.table_datetime')}</th><th>{t('admin.table_value')}</th><th>{t('admin.table_status')}</th></tr></thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', padding: '32px 0' }}><i className="fas fa-calendar-xmark" style={{ fontSize: 24, marginBottom: 10, display: 'block' }}></i>{t('barber.no_appointments_found')}</td></tr>
                  ) : pageRows.map(a => {
                    const isUpdating = updatingAptId === a.id;
                    const cRate = clientCancelRate(a.client_id);
                    const cTier = cancelTier(cRate);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--bp-text)', fontWeight: 600 }}>{a.client_name}</span>
                            {waLink(a.client_phone) && (
                              <a href={waLink(a.client_phone)} target="_blank" rel="noopener noreferrer" title={t('barber.whatsapp_chat')} aria-label={t('barber.whatsapp_chat')} style={{ color: '#25d366', fontSize: 13 }}>
                                <i className="fab fa-whatsapp"></i>
                              </a>
                            )}
                          </div>
                        </td>
                        <td>
                          <span title={t('barber.cancel_rate_tooltip', { rate: cRate })} style={{ background: cTier.bg, color: cTier.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{cRate}% · {cTier.label}</span>
                        </td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{a.service_name}</td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{a.barber_name}</td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{fmtDate(a.appointment_date)} {a.appointment_time ? `· ${a.appointment_time}` : ''}</td>
                        <td style={{ color: '#d4a574', fontWeight: 600 }}>{fmtCur(a.price)}</td>
                        <td>
                          <select value={a.status} disabled={isUpdating} onChange={e => handleSelectStatus(a, e.target.value)}
                            className={`rpt-status-pill ${APPT_STATUS_PILL(a.status)}`}
                            style={{ border: 'none', outline: 'none', fontFamily: 'Inter, sans-serif', opacity: isUpdating ? 0.6 : 1, cursor: isUpdating ? 'not-allowed' : 'pointer' }}>
                            <option value="pending">{t('status.pending')}</option>
                            <option value="confirmed">{t('status.confirmed')}</option>
                            <option value="completed">{t('status.completed')}</option>
                            <option value="cancelled">{t('status.cancelled')}</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rpt-pagination">
              <div className="rpt-pag-info">{filtered.length === 0 ? t('admin.no_appointments') : t('admin.showing_range', { from: (safePage - 1) * PAGE_SIZE + 1, to: Math.min(safePage * PAGE_SIZE, filtered.length), total: filtered.length })}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="rpt-pg-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`rpt-pg-btn${p === safePage ? ' rpt-pg-btn-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="rpt-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            </div>
          </div>

          {confirmComplete && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmComplete(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90vw' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>{t('admin.confirm_completion_title')}</h3>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '4px 0 0' }}>{confirmComplete.client_name} · {confirmComplete.service_name}</p>
                  </div>
                  <button onClick={() => setConfirmComplete(null)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 18 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>
                <p style={{ color: 'var(--bp-text-muted)', fontSize: 13, margin: '16px 0 20px' }}>{t('admin.mark_completed_confirm', { status: t('status.completed') })}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={confirmMarkCompleted} style={{ flex: 1, background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.confirm')}</button>
                  <button onClick={() => setConfirmComplete(null)} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-muted)', fontSize: 13, padding: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ======================================================
       ADMIN — CLIENTES
    ====================================================== */
    const CLIENT_INACTIVE_DAYS = 60;
    function useClientFilters() {
      const { t } = useLang();
      return [
        { id: 'todos', label: t('barber.filter_all'), icon: 'fa-users' },
        { id: 'ativos', label: t('admin.filter_active'), icon: 'fa-user-check' },
        { id: 'inativos', label: t('admin.filter_inactive'), icon: 'fa-user-clock' },
        { id: 'vip', label: t('admin.filter_vip'), icon: 'fa-star' },
        { id: 'risco', label: t('admin.filter_cancel_risk'), icon: 'fa-triangle-exclamation' },
      ];
    }
    const CLIENT_SORTS = {
      recentes: { get label() { return translateNow('admin.sort_most_recent'); }, fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
      faturamento: { get label() { return translateNow('admin.sort_highest_revenue'); }, fn: (a, b) => b.total_spent - a.total_spent },
      visitas: { get label() { return translateNow('admin.sort_most_visits'); }, fn: (a, b) => b.total_visits - a.total_visits },
      nome: { get label() { return translateNow('admin.sort_name_az'); }, fn: (a, b) => a.name.localeCompare(b.name) },
    };

    const waLink = (phone) => {
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      if (!digits) return null;
      const withCountry = digits.length <= 11 ? '55' + digits : digits;
      return `https://wa.me/${withCountry}`;
    };

    function AdminClients({ clients, reloadClients, showToast }) {
      const { t } = useLang();
      const CLIENT_FILTERS = useClientFilters();
      const AVATAR_COLORS = ['#d4a574', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      const CLIENT_INITIALS_FN = name => name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
      const labelStyle = { color: 'var(--bp-text-faint)', fontSize: 11, display: 'block', marginBottom: 5 };
      const [search, setSearch] = useState('');
      const [statusFilter, setStatusFilter] = useState('todos');
      const [sortBy, setSortBy] = useState('recentes');
      const [profileClient, setProfileClient] = useState(null);
      const [page, setPage] = useState(1);
      const PAGE_SIZE = 8;
      const [history, setHistory] = useState([]);
      const [historyLoading, setHistoryLoading] = useState(false);
      const [vipSaving, setVipSaving] = useState(false);
      const [editingClient, setEditingClient] = useState(null);
      const [editForm, setEditForm] = useState(null);
      const [savingClient, setSavingClient] = useState(false);
      const [editError, setEditError] = useState('');
      const [confirmRemove, setConfirmRemove] = useState(null);
      const [removingId, setRemovingId] = useState(null);

      useEffect(() => {
        if (!profileClient) { setHistory([]); return; }
        setHistoryLoading(true);
        apiCall('GET', `/admin/clients/${profileClient.id}/appointments`).then(res => {
          setHistory(res.ok ? res.data : []);
          setHistoryLoading(false);
        });
      }, [profileClient?.id]);

      const toggleVip = async (client) => {
        setVipSaving(true);
        const res = await apiCall('PATCH', `/admin/clients/${client.id}/vip`, { is_vip: !client.is_vip });
        setVipSaving(false);
        if (res.ok) {
          showToast && showToast(res.data.is_vip ? t('admin.client_became_vip', { name: client.name }) : t('admin.client_no_longer_vip', { name: client.name }), 'success');
          setProfileClient(prev => prev ? { ...prev, is_vip: res.data.is_vip } : prev);
          reloadClients && reloadClients();
        } else {
          showToast && showToast(res.data?.error || t('admin.err_update_vip'), 'error');
        }
      };

      const startEdit = (c) => {
        setEditError('');
        setEditForm({ name: c.name || '', email: c.email || '', phone: c.phone || '', document: c.document || '' });
        setEditingClient(c);
      };
      const cancelEdit = () => { setEditingClient(null); setEditForm(null); setEditError(''); };

      const saveEdit = async () => {
        if (!editForm.name.trim() || !editForm.email.trim()) {
          setEditError(t('admin.name_email_required'));
          return;
        }
        setSavingClient(true);
        setEditError('');
        const res = await apiCall('PUT', `/clients/${editingClient.id}`, {
          name: editForm.name.trim(), email: editForm.email.trim(), phone: editForm.phone.trim(), document: editForm.document.trim(),
        });
        setSavingClient(false);
        if (res.ok) {
          showToast && showToast(t('admin.client_updated_toast'), 'success');
          setProfileClient(p => p ? { ...p, ...res.data } : p);
          cancelEdit();
          reloadClients && reloadClients();
        } else {
          setEditError(res.data?.error || t('admin.err_update_client'));
        }
      };

      const removeClient = async (client) => {
        setRemovingId(client.id);
        const res = await apiCall('DELETE', `/clients/${client.id}`);
        setRemovingId(null);
        setConfirmRemove(null);
        if (res.ok) {
          showToast && showToast(t('admin.client_removed_toast'), 'success');
          setProfileClient(p => p && p.id === client.id ? null : p);
          reloadClients && reloadClients();
        } else {
          showToast && showToast(res.data?.error || t('admin.err_remove_client'), 'error');
        }
      };

      const cancelRate = c => c.total_appointments > 0 ? Math.round((c.total_cancelled / c.total_appointments) * 100) : 0;
      const avgTicket = c => c.total_visits > 0 ? c.total_spent / c.total_visits : 0;
      const daysSinceVisit = c => c.last_visit ? Math.floor((Date.now() - parseLocalDate(c.last_visit)) / 86400000) : Infinity;
      const isActive = c => daysSinceVisit(c) <= CLIENT_INACTIVE_DAYS;
      const statusPillClass = (s) => ({ completed: 'rpt-pill-completed', confirmed: 'rpt-pill-confirmed', pending: 'rpt-pill-pending', cancelled: 'rpt-pill-cancelled' }[s] || '');

      const matchesStatus = (c, filterId) => {
        if (filterId === 'ativos') return isActive(c);
        if (filterId === 'inativos') return !isActive(c);
        if (filterId === 'vip') return !!c.is_vip;
        if (filterId === 'risco') return cancelRate(c) >= 30;
        return true;
      };

      const searched = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase()));
      const filtered = searched.filter(c => matchesStatus(c, statusFilter)).sort(CLIENT_SORTS[sortBy].fn);
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

      return (
        <div className="max-w-6xl">
          <div className="admin-filter-bar" style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 13, pointerEvents: 'none' }}></i>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t('admin.search_client_placeholder')} aria-label={t('admin.search_client_aria')} style={{ ...inputStyle, paddingLeft: 36 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 220px', justifyContent: 'space-between' }}>
              <select className="rpt-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }} aria-label={t('admin.sort_by_aria')} style={{ flex: 1 }}>
                {Object.entries(CLIENT_SORTS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
              </select>
              <span style={{ color: 'var(--bp-text-faint)', fontSize: 13, whiteSpace: 'nowrap' }}>{t('admin.total_clients_label', { count: filtered.length })}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {CLIENT_FILTERS.map(f => {
              const count = f.id === 'todos' ? searched.length : searched.filter(c => matchesStatus(c, f.id)).length;
              const active = statusFilter === f.id;
              return (
                <button key={f.id} onClick={() => { setStatusFilter(f.id); setPage(1); }}
                  style={{ padding: '7px 16px', borderRadius: 99, border: '1px solid ' + (active ? '#d4a574' : 'var(--bp-border2)'), background: active ? 'rgba(212,165,116,0.12)' : 'transparent', color: active ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <i className={'fas ' + f.icon} style={{ fontSize: 10 }}></i>
                  {f.label}
                  <span style={{ background: active ? 'rgba(212,165,116,0.2)' : 'var(--bp-border)', borderRadius: 99, padding: '1px 7px', fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="rpt-table-panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="rpt-table">
                <thead><tr><th>{t('admin.table_client')}</th><th>{t('admin.table_client_billed')}</th><th>{t('admin.table_client_visits')}</th><th>{t('admin.table_client_cancel')}</th><th>{t('admin.table_favorite_barber')}</th><th>{t('admin.table_last_visit')}</th><th></th></tr></thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', padding: '32px 0' }}><i className="fas fa-user-slash" style={{ fontSize: 24, marginBottom: 10, display: 'block' }}></i>{t('admin.no_client_found')}</td></tr>
                  ) : pageRows.map(c => {
                    const idx = clients.findIndex(x => x.id === c.id);
                    const color = AVATAR_COLORS[idx >= 0 ? idx % AVATAR_COLORS.length : 0];
                    const rate = cancelRate(c);
                    const rateColor = rate >= 30 ? '#ef4444' : rate >= 15 ? '#f59e0b' : '#10b981';
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: color + '33', border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
                              {c.photo_url ? <img src={c.photo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : CLIENT_INITIALS_FN(c.name)}
                              {!!c.is_vip && <span title={t('admin.vip_client_title')} style={{ position: 'absolute', bottom: -2, right: -2, background: '#f59e0b', color: '#000', width: 13, height: 13, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, border: '1.5px solid var(--bp-card)' }}><i className="fas fa-star"></i></span>}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{c.name}</p>
                              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{c.email}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>{fmtCur(c.total_spent)}</td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{fmtNum(c.total_visits)}</td>
                        <td style={{ color: rateColor, fontWeight: 600 }}>{rate}%</td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{c.favorite_barber || '—'}</td>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{c.last_visit ? fmtDate(c.last_visit) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {waLink(c.phone) && (
                              <a href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" title={t('barber.whatsapp_chat')} aria-label={t('barber.whatsapp_chat')} style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.35)', borderRadius: 8, color: '#25d366', fontSize: 13, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <i className="fab fa-whatsapp"></i>
                              </a>
                            )}
                            <button onClick={() => setProfileClient(c)} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#9ca3af', fontSize: 12, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bp-text-muted)'; e.currentTarget.style.color = 'var(--bp-text)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = '#9ca3af'; }}>
                              <i className="fas fa-eye" style={{ fontSize: 11 }}></i> {t('admin.view_profile')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rpt-pagination">
              <div className="rpt-pag-info">{filtered.length === 0 ? t('admin.no_clients') : t('admin.showing_range_clients', { from: (safePage - 1) * PAGE_SIZE + 1, to: Math.min(safePage * PAGE_SIZE, filtered.length), total: filtered.length })}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="rpt-pg-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`rpt-pg-btn${p === safePage ? ' rpt-pg-btn-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="rpt-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            </div>
          </div>

          {profileClient && (() => {
            const idx = clients.findIndex(c => c.id === profileClient.id);
            const color = AVATAR_COLORS[idx >= 0 ? idx % AVATAR_COLORS.length : 0];
            const rate = cancelRate(profileClient);
            const rateColor = rate >= 30 ? '#ef4444' : rate >= 15 ? '#f59e0b' : '#10b981';
            const isEditing = editingClient?.id === profileClient.id;
            return (
              <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setProfileClient(null); cancelEdit(); }}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 460, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 17, margin: 0 }}>{t('admin.client_profile_title')}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isEditing && (
                        <>
                          <button onClick={() => startEdit(profileClient)} aria-label={t('admin.edit_client_aria')} title={t('admin.edit_client_aria')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: 'var(--bp-text-faint)', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}><i className="fas fa-pencil-alt"></i></button>
                          <button onClick={() => setConfirmRemove(profileClient)} aria-label={t('admin.remove_client_aria')} title={t('admin.remove_client_aria')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: 'var(--bp-text-faint)', padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}><i className="fas fa-trash"></i></button>
                        </>
                      )}
                      <button onClick={() => { setProfileClient(null); cancelEdit(); }} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 16 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div><label htmlFor="ec-name" style={labelStyle}>{t('admin.full_name_required')}</label><input id="ec-name" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} /></div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}><label htmlFor="ec-email" style={labelStyle}>{t('admin.email_required')}</label><input id="ec-email" type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} style={inputStyle} /></div>
                        <div style={{ flex: 1 }}><label htmlFor="ec-phone" style={labelStyle}>{t('common.phone')}</label><input id="ec-phone" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} style={inputStyle} /></div>
                      </div>
                      <div><label htmlFor="ec-document" style={labelStyle}>{t('admin.document_label')}</label><input id="ec-document" value={editForm.document} onChange={e => setEditForm(p => ({ ...p, document: e.target.value }))} style={inputStyle} /></div>
                      {editError && <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>{editError}</p>}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={cancelEdit} disabled={savingClient} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '10px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                        <button onClick={saveEdit} disabled={savingClient} style={{ flex: 2, background: savingClient ? 'var(--bp-border2)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: savingClient ? '#4b5563' : '#000', fontWeight: 700, fontSize: 13, padding: '10px 0', cursor: savingClient ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{savingClient ? t('common.saving') : t('admin.save_changes_btn')}</button>
                      </div>
                    </div>
                  ) : (
                  <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: color + '33', border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color, overflow: 'hidden' }}>
                      {profileClient.photo_url ? <img src={profileClient.photo_url} alt={profileClient.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : CLIENT_INITIALS_FN(profileClient.name)}
                    </div>
                    <div>
                      <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {profileClient.name}
                        {!!profileClient.is_vip && <span style={{ background: '#f59e0b33', color: '#f59e0b', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="fas fa-star" style={{ fontSize: 9 }}></i>{t('admin.filter_vip')}</span>}
                      </p>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 14, margin: '4px 0 0' }}>{profileClient.email}</p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                      <p style={{ color: '#10b981', fontWeight: 700, fontSize: 15, margin: 0 }}>{fmtCur(profileClient.total_spent)}</p>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 10, margin: '4px 0 0' }}>{t('admin.profit_generated')}</p>
                    </div>
                    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: 0 }}>{fmtNum(profileClient.total_visits)}</p>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 10, margin: '4px 0 0' }}>{t('admin.completed_visits')}</p>
                    </div>
                    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: '12px 6px', textAlign: 'center' }}>
                      <p style={{ color: rateColor, fontWeight: 700, fontSize: 15, margin: 0 }}>{rate}%</p>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 10, margin: '4px 0 0' }}>{t('admin.cancellation_label')}</p>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { icon: 'fa-phone', label: t('common.phone'), val: profileClient.phone || '—', c: '#10b981' },
                      { icon: 'fa-id-card', label: t('admin.document_label'), val: profileClient.document || '—', c: '#3b82f6' },
                      { icon: 'fa-cut', label: t('admin.table_favorite_barber'), val: profileClient.favorite_barber || '—', c: '#d4a574' },
                      { icon: 'fa-scissors', label: t('admin.favorite_service'), val: profileClient.favorite_service || '—', c: '#8b5cf6' },
                      { icon: 'fa-sack-dollar', label: t('admin.average_ticket'), val: avgTicket(profileClient) > 0 ? fmtCur(avgTicket(profileClient)) : '—', c: '#10b981' },
                      { icon: 'fa-calendar-check', label: t('admin.table_last_visit'), val: profileClient.last_visit ? fmtDate(profileClient.last_visit) : '—', c: '#f59e0b' },
                      { icon: 'fa-star-half-stroke', label: t('admin.avg_rating_given'), val: profileClient.avg_rating_given ? `${profileClient.avg_rating_given} ★` : '—', c: '#f59e0b' },
                      { icon: 'fa-user-clock', label: t('admin.client_since'), val: fmtDate(profileClient.created_at), c: '#3b82f6' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className={`fas ${item.icon}`} style={{ color: item.c, fontSize: 14, width: 16, textAlign: 'center' }}></i>
                        <div><p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{item.label}</p><p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{item.val}</p></div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    {waLink(profileClient.phone) && (
                      <a href={waLink(profileClient.phone)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.35)', borderRadius: 9, color: '#25d366', fontSize: 13, fontWeight: 600, padding: '10px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>
                        <i className="fab fa-whatsapp"></i> WhatsApp
                      </a>
                    )}
                    <button onClick={() => toggleVip(profileClient)} disabled={vipSaving} style={{ flex: 1, background: profileClient.is_vip ? 'rgba(245,158,11,0.1)' : 'none', border: '1px solid ' + (profileClient.is_vip ? 'rgba(245,158,11,0.35)' : 'var(--bp-border2)'), borderRadius: 9, color: profileClient.is_vip ? '#f59e0b' : 'var(--bp-text-muted)', fontSize: 13, fontWeight: 600, padding: '10px 0', cursor: vipSaving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <i className={vipSaving ? 'fas fa-spinner fa-spin' : 'fas fa-star'}></i> {profileClient.is_vip ? t('admin.remove_vip') : t('admin.mark_as_vip')}
                    </button>
                  </div>
                  </>
                  )}

                  <div style={{ marginTop: 20 }}>
                    <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-clock-rotate-left" style={{ color: '#d4a574' }}></i> {t('admin.appointment_history')}
                    </p>
                    {historyLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--bp-text-faint)' }}><i className="fas fa-spinner fa-spin"></i></div>
                    ) : history.length === 0 ? (
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, textAlign: 'center', padding: '16px 0', margin: 0 }}>{t('admin.no_appointment_registered')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                        {history.map(h => (
                          <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ color: 'var(--bp-text)', fontSize: 12, fontWeight: 600, margin: 0 }}>{h.service_name} <span style={{ color: 'var(--bp-text-faint)', fontWeight: 400 }}>{t('common.with_barber', { barbeiro: h.barber_name })}</span></p>
                              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '2px 0 0' }}>{fmtDate(h.appointment_date)} · {h.appointment_time}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <span style={{ color: '#d4a574', fontSize: 12, fontWeight: 600 }}>{fmtCur(h.price)}</span>
                              <span className={`rpt-status-pill ${statusPillClass(h.status)}`}>{statusLabel(h.status)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {confirmRemove && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmRemove(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 380, maxWidth: '90vw' }}>
                <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 17, margin: '0 0 10px' }}>{t('admin.remove_client_title')}</h3>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 22px' }}>{t('admin.remove_client_confirm', { name: confirmRemove.name })}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                  <button onClick={() => removeClient(confirmRemove)} disabled={removingId === confirmRemove.id} style={{ flex: 1, background: removingId === confirmRemove.id ? 'var(--bp-border2)' : '#ef4444', border: 'none', borderRadius: 9, color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, padding: '11px 0', cursor: removingId === confirmRemove.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{removingId === confirmRemove.id ? t('admin.removing') : t('admin.remove')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ======================================================
       ADMIN — BARBEIROS
    ====================================================== */
    function AdminBarbers({ showToast }) {
      const { t } = useLang();
      const AVATAR_COLORS = ['#d4a574', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      const [barbers, setBarbers] = useState([]);
      const [loading, setLoading] = useState(true);
      const [search, setSearch] = useState('');
      const [profileBarber, setProfileBarber] = useState(null);
      const [showNewModal, setShowNewModal] = useState(false);
      const [saving, setSaving] = useState(false);
      const [formError, setFormError] = useState('');
      const [showPassword, setShowPassword] = useState(false);
      const [removingId, setRemovingId] = useState(null);
      const [confirmRemove, setConfirmRemove] = useState(null);
      const [subTab, setSubTab] = useState('list');
      const [pendingAbsences, setPendingAbsences] = useState(0);
      const [pendingDayoffs, setPendingDayoffs] = useState(0);
      const blankBarber = { name: '', email: '', phone: '', password: '', confirmPassword: '', forcePasswordChange: true };
      const [newBarber, setNewBarber] = useState(blankBarber);

      const loadBarbers = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/barbers');
        if (res.ok) setBarbers(res.data);
        setLoading(false);
      };
      useEffect(() => { loadBarbers(); }, []);
      useEffect(() => {
        (async () => {
          const res = await apiCall('GET', '/absences');
          if (res.ok) setPendingAbsences(res.data.filter(a => a.status === 'pending').length);
        })();
        (async () => {
          const res = await apiCall('GET', '/dayoff-requests');
          if (res.ok) setPendingDayoffs(res.data.filter(r => r.status === 'pending').length);
        })();
      }, []);

      const filtered = barbers.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || (b.email || '').toLowerCase().includes(search.toLowerCase()));

      const closeNewModal = () => { setShowNewModal(false); setNewBarber(blankBarber); setFormError(''); setShowPassword(false); };

      const removeBarber = async (id) => {
        setRemovingId(id);
        const res = await apiCall('DELETE', `/barbers/${id}`);
        setRemovingId(null);
        setConfirmRemove(null);
        if (res.ok) {
          showToast && showToast(t('admin.barber_removed_toast'), 'success');
          setProfileBarber(null);
          loadBarbers();
        } else {
          showToast && showToast(res.data?.error || t('admin.err_remove_barber'), 'error');
        }
      };

      const formatPhone = (val) => {
        const d = val.replace(/\D/g, '').slice(0, 11);
        if (d.length === 0) return '';
        if (d.length <= 2) return `(${d}`;
        if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      };

      const passRules = [
        { id: 'len',   label: t('common.pw_rule_len'),   ok: newBarber.password.length >= 8 },
        { id: 'upper', label: t('common.pw_rule_upper'), ok: /[A-Z]/.test(newBarber.password) },
        { id: 'lower', label: t('common.pw_rule_lower'), ok: /[a-z]/.test(newBarber.password) },
        { id: 'sym',   label: t('common.pw_rule_sym'),   ok: /[^A-Za-z0-9]/.test(newBarber.password) },
      ];
      const passValid = passRules.every(r => r.ok);
      const passStrength = passRules.filter(r => r.ok).length;
      const strengthColor = ['#ef4444', '#f59e0b', '#f59e0b', '#10b981', '#10b981'][passStrength];
      const strengthLabel = ['', t('login.strength_weak'), t('login.strength_medium'), t('login.strength_good'), t('login.strength_strong')][passStrength];
      const passMatch = newBarber.password === newBarber.confirmPassword && newBarber.confirmPassword.length > 0;

      const addBarber = async () => {
        setFormError('');
        if (!newBarber.name.trim() || !newBarber.email.trim() || !newBarber.password) {
          setFormError(t('admin.fill_name_email_password'));
          return;
        }
        if (!passValid) {
          setFormError(t('common.new_pw_requirements_error'));
          return;
        }
        if (newBarber.password !== newBarber.confirmPassword) {
          setFormError(t('common.pw_mismatch_error'));
          return;
        }
        setSaving(true);
        const res = await apiCall('POST', '/barbers', {
          name: newBarber.name.trim(),
          email: newBarber.email.trim(),
          phone: newBarber.phone.trim(),
          password: newBarber.password,
          force_password_change: newBarber.forcePasswordChange,
        });
        setSaving(false);
        if (res.ok) {
          showToast && showToast(t('admin.barber_registered_toast'), 'success');
          closeNewModal();
          loadBarbers();
        } else {
          setFormError(res.data?.error || t('admin.err_register_barber'));
        }
      };

      const BARBER_INITIALS_FN = name => name ? name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
      const labelStyle = { color: 'var(--bp-text-faint)', fontSize: 12, display: 'block', marginBottom: 5 };
      const sectionLabelStyle = { color: '#d4a574', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 };

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('admin.barber_management_title')}</h2>
            {subTab === 'list' && (
              <button onClick={() => setShowNewModal(true)} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif' }}>
                <i className="fas fa-plus"></i> {t('admin.register_barber')}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--bp-border)', marginBottom: 24 }}>
            {[
              { id: 'list', label: t('admin.nav_barbers'), icon: 'fa-user-tie' },
              { id: 'absences', label: t('barber.absences_page_title'), icon: 'fa-calendar-xmark', badge: pendingAbsences },
              { id: 'dayoffs', label: t('admin.tab_dayoffs'), icon: 'fa-calendar-week', badge: pendingDayoffs },
            ].map(tabItem => (
              <button key={tabItem.id} onClick={() => setSubTab(tabItem.id)} style={{ background: 'none', border: 'none', borderBottom: subTab === tabItem.id ? '2px solid #d4a574' : '2px solid transparent', color: subTab === tabItem.id ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 13, fontWeight: 600, padding: '10px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 7 }}>
                <i className={`fas ${tabItem.icon}`} style={{ fontSize: 12 }}></i> {tabItem.label}
                {!!tabItem.badge && <span style={{ background: '#ef4444', color: 'var(--bp-text)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9 }}>{tabItem.badge}</span>}
              </button>
            ))}
          </div>

          {subTab === 'absences' ? (
            <AdminAbsences showToast={showToast} onPendingCount={setPendingAbsences} />
          ) : subTab === 'dayoffs' ? (
            <AdminDayoffRequests showToast={showToast} onPendingCount={setPendingDayoffs} />
          ) : (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 280 }}>
              <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 13, pointerEvents: 'none' }}></i>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin.search_barber_placeholder')} aria-label={t('admin.search_barber_aria')} style={{ ...inputStyle, paddingLeft: 36 }} />
            </div>
            <span style={{ color: 'var(--bp-text-faint)', fontSize: 13, whiteSpace: 'nowrap' }}>{t('admin.total_active_barbers', { count: filtered.length })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: '#4b5563' }}>
                <i className="fas fa-user-slash" style={{ fontSize: 36, marginBottom: 12, display: 'block' }}></i>
                {t('admin.no_barber_found')}
              </div>
            )}
            {filtered.map((b, idx) => {
              const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              return (
                <div key={b.id} style={{ background: 'linear-gradient(145deg,var(--bp-card) 0%,var(--bp-panel) 100%)', border: '1px solid var(--bp-border2)', borderRadius: 14, padding: 20, transition: 'border-color .2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: color + '33', border: `2.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color, flexShrink: 0, overflow: 'hidden' }}>
                      {b.photo_url ? <img src={b.photo_url} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : BARBER_INITIALS_FN(b.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</p>
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setProfileBarber(b)} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#9ca3af', fontSize: 12, padding: '8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bp-text-muted)'; e.currentTarget.style.color = 'var(--bp-text)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = '#9ca3af'; }}>
                      <i className="fas fa-eye" style={{ fontSize: 11 }}></i> {t('admin.view_profile')}
                    </button>
                    <button onClick={() => setConfirmRemove(b)} aria-label={t('admin.remove_barber_aria')} title={t('admin.remove_barber_aria')} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#9ca3af', fontSize: 12, padding: '8px 12px', cursor: 'pointer', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = '#9ca3af'; }}>
                      <i className="fas fa-trash" style={{ fontSize: 11 }}></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {profileBarber && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setProfileBarber(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 17, margin: 0 }}>{t('admin.barber_profile_title')}</h3>
                  <button onClick={() => setProfileBarber(null)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 16 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>
                {(() => {
                  const idx = barbers.findIndex(b => b.id === profileBarber.id);
                  const color = AVATAR_COLORS[idx >= 0 ? idx % AVATAR_COLORS.length : 0];
                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: color + '33', border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color, overflow: 'hidden' }}>
                          {profileBarber.photo_url ? <img src={profileBarber.photo_url} alt={profileBarber.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : BARBER_INITIALS_FN(profileBarber.name)}
                        </div>
                        <div>
                          <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: 0 }}>{profileBarber.name}</p>
                          <p style={{ color: 'var(--bp-text-faint)', fontSize: 14, margin: '4px 0 0' }}>{profileBarber.email}</p>
                        </div>
                      </div>
                      <p style={{ color: '#4b5563', fontSize: 11, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-circle-info" aria-hidden="true"></i> {t('admin.photo_specialty_note')}
                      </p>
                      <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { icon: 'fa-envelope', label: t('common.email'), val: profileBarber.email || '—', c: '#3b82f6' },
                          { icon: 'fa-phone', label: t('common.phone'), val: profileBarber.phone || '—', c: '#10b981' },
                          { icon: 'fa-cut', label: t('barber.specialty_label'), val: profileBarber.specialty || '—', c: '#8b5cf6' },
                          { icon: 'fa-id-badge', label: t('admin.id_label'), val: profileBarber.id, c: '#d4a574' },
                        ].map(item => (
                          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <i className={`fas ${item.icon}`} style={{ color: item.c, fontSize: 14, width: 16, textAlign: 'center' }}></i>
                            <div><p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>{item.label}</p><p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{item.val}</p></div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setConfirmRemove(profileBarber)} style={{ width: '100%', marginTop: 16, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#ef4444', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <i className="fas fa-trash" style={{ fontSize: 11 }}></i> {t('admin.remove_barber_btn')}
                      </button>
                    </div>
                  );
                })()}
                <button onClick={() => setProfileBarber(null)} style={{ width: '100%', marginTop: 10, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.close')}</button>
              </div>
            </div>
          )}

          {confirmRemove && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmRemove(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 380, maxWidth: '90vw' }}>
                <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 17, margin: '0 0 10px' }}>{t('admin.remove_barber_title')}</h3>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 22px' }}>{t('admin.remove_barber_confirm', { name: confirmRemove.name })}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                  <button onClick={() => removeBarber(confirmRemove.id)} disabled={removingId === confirmRemove.id} style={{ flex: 1, background: removingId === confirmRemove.id ? 'var(--bp-border2)' : '#ef4444', border: 'none', borderRadius: 9, color: 'var(--bp-text)', fontWeight: 700, fontSize: 13, padding: '11px 0', cursor: removingId === confirmRemove.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{removingId === confirmRemove.id ? t('admin.removing') : t('admin.remove')}</button>
                </div>
              </div>
            </div>
          )}

          {showNewModal && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closeNewModal}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 28, width: 440, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18, margin: 0 }}>{t('admin.register_barber')}</h3>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '4px 0 0' }}>{t('admin.register_barber_subtitle')}</p>
                  </div>
                  <button onClick={closeNewModal} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 16 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>

                <p style={{ color: '#4b5563', fontSize: 11, margin: '14px 0 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-circle-info" aria-hidden="true"></i> {t('admin.photo_specialty_note_first_login')}
                </p>

                <p style={sectionLabelStyle}><i className="fas fa-user" aria-hidden="true"></i> {t('admin.personal_data')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div><label htmlFor="nb-name" style={labelStyle}>{t('admin.full_name_required')}</label><input id="nb-name" value={newBarber.name} onChange={e => setNewBarber(p => ({ ...p, name: e.target.value }))} style={inputStyle} placeholder={t('admin.name_placeholder_example')} /></div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label htmlFor="nb-email" style={labelStyle}>{t('admin.email_required')}</label><input id="nb-email" type="email" value={newBarber.email} onChange={e => setNewBarber(p => ({ ...p, email: e.target.value }))} style={inputStyle} placeholder={t('admin.email_placeholder_example')} /></div>
                    <div style={{ flex: 1 }}><label htmlFor="nb-phone" style={labelStyle}>{t('common.phone')}</label><input id="nb-phone" type="tel" inputMode="numeric" value={newBarber.phone} onChange={e => setNewBarber(p => ({ ...p, phone: formatPhone(e.target.value) }))} style={inputStyle} placeholder="(11) 99999-9999" /></div>
                  </div>
                </div>

                <p style={sectionLabelStyle}><i className="fas fa-key" aria-hidden="true"></i> {t('admin.access_data')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label htmlFor="nb-password" style={labelStyle}>{t('admin.password_required')}</label>
                    <div style={{ position: 'relative' }}>
                      <input id="nb-password" type={showPassword ? 'text' : 'password'} value={newBarber.password} onChange={e => setNewBarber(p => ({ ...p, password: e.target.value }))} style={{ ...inputStyle, paddingRight: 36 }} placeholder={t('admin.min_chars_placeholder')} />
                      <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? t('common.hide_password') : t('common.show_password')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 13 }}><i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i></button>
                    </div>
                    {newBarber.password.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= passStrength ? strengthColor : 'var(--bp-border2)', transition: 'background .2s' }} />
                          ))}
                          {strengthLabel && <span style={{ color: strengthColor, fontSize: 11, fontWeight: 600, marginLeft: 4, whiteSpace: 'nowrap' }}>{strengthLabel}</span>}
                        </div>
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
                  <div>
                    <label htmlFor="nb-confirm-password" style={labelStyle}>{t('admin.confirm_password_required')}</label>
                    <input id="nb-confirm-password" type={showPassword ? 'text' : 'password'} value={newBarber.confirmPassword} onChange={e => setNewBarber(p => ({ ...p, confirmPassword: e.target.value }))} style={inputStyle} placeholder={t('admin.repeat_password_placeholder')} />
                    {newBarber.confirmPassword.length > 0 && (
                      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginTop: 4, color: passMatch ? '#10b981' : '#ef4444' }}>
                        <i className={`fas ${passMatch ? 'fa-check-circle' : 'fa-times-circle'}`} aria-hidden="true"></i>
                        {passMatch ? t('login.passwords_match') : t('login.passwords_mismatch')}
                      </p>
                    )}
                  </div>
                  <label htmlFor="nb-force-change" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, padding: '10px 12px' }}>
                    <input id="nb-force-change" type="checkbox" checked={newBarber.forcePasswordChange} onChange={e => setNewBarber(p => ({ ...p, forcePasswordChange: e.target.checked }))} style={{ marginTop: 2, width: 16, height: 16, accentColor: '#d4a574', cursor: 'pointer', flexShrink: 0 }} />
                    <span>
                      <span style={{ color: 'var(--bp-text-secondary)', fontSize: 13, fontWeight: 600, display: 'block' }}>{t('admin.force_password_change_label')}</span>
                      <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('admin.force_password_change_desc')}</span>
                    </span>
                  </label>
                </div>

                {formError && <p style={{ color: '#ef4444', fontSize: 12, margin: '14px 0 0' }}>{formError}</p>}

                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button onClick={closeNewModal} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                  <button onClick={addBarber} disabled={saving} style={{ flex: 2, background: saving ? 'var(--bp-border2)' : 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: saving ? '#4b5563' : '#000', fontWeight: 700, fontSize: 13, padding: '11px 0', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{saving ? t('admin.registering') : t('admin.register_barber_btn')}</button>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      );
    }

    /* ======================================================
       ADMIN — AUSÊNCIAS
    ====================================================== */
    function AdminAbsences({ showToast, onPendingCount }) {
      const { t } = useLang();
      const [absences, setAbsences] = useState([]);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState('pending');
      const [actingId, setActingId] = useState(null);

      const loadAbsences = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/absences');
        if (res.ok) {
          setAbsences(res.data);
          onPendingCount && onPendingCount(res.data.filter(a => a.status === 'pending').length);
        }
        setLoading(false);
      };
      useEffect(() => { loadAbsences(); }, []);

      const review = async (id, status) => {
        setActingId(id);
        const res = await apiCall('PATCH', `/absences/${id}/status`, { status });
        setActingId(null);
        if (res.ok) {
          showToast && showToast(status === 'approved' ? t('admin.absence_approved_toast') : t('admin.absence_rejected_toast'), 'success');
          loadAbsences();
        } else {
          showToast && showToast(res.data?.error || t('admin.err_update_absence'), 'error');
        }
      };

      const filtered = absences.filter(a => filter === 'all' || a.status === filter);
      const statusInfo = {
        pending: { label: t('barber.abs_pending'), color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
        approved: { label: t('barber.abs_approved'), color: '#10b981', bg: 'rgba(16,185,129,.15)' },
        rejected: { label: t('barber.abs_rejected'), color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
      };

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(212,165,116,.12)' : 'none', border: filter === f ? '1px solid rgba(212,165,116,.3)' : '1px solid var(--bp-border2)', borderRadius: 8, color: filter === f ? '#d4a574' : '#9ca3af', fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {{ pending: t('barber.card_pending'), approved: t('admin.filter_approved'), rejected: t('admin.filter_rejected'), all: t('notif.tab_all') }[f]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563' }}>
              <i className="fas fa-calendar-check" style={{ fontSize: 36, marginBottom: 12, display: 'block' }}></i>
              {t('admin.no_absence_found')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(a => {
                const s = statusInfo[a.status] || statusInfo.pending;
                return (
                  <div key={a.id} style={{ background: 'linear-gradient(145deg,var(--bp-card) 0%,var(--bp-panel) 100%)', border: '1px solid var(--bp-border2)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: 0 }}>{a.barber_name}</p>
                        <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{s.label}</span>
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 4px' }}>
                        <i className="fas fa-calendar-day" style={{ marginRight: 6 }}></i>
                        {fmtDate(a.start_date)}{a.start_date !== a.end_date ? ` ${t('common.until')} ${fmtDate(a.end_date)}` : ''}
                      </p>
                      {a.reason && <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>{a.reason}</p>}
                    </div>
                    {a.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => review(a.id, 'rejected')} disabled={actingId === a.id} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#ef4444', fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: actingId === a.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <i className="fas fa-times" style={{ marginRight: 6 }}></i>{t('admin.reject')}
                        </button>
                        <button onClick={() => review(a.id, 'approved')} disabled={actingId === a.id} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontSize: 12, fontWeight: 700, padding: '8px 14px', cursor: actingId === a.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <i className="fas fa-check" style={{ marginRight: 6 }}></i>{t('admin.accept')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ======================================================
       ADMIN — SOLICITAÇÕES DE FOLGA (ESCALA SEMANAL)
    ====================================================== */
    function useDayLabels() {
      const { t } = useLang();
      return [t('admin.day_sunday'), t('admin.day_monday'), t('admin.day_tuesday'), t('admin.day_wednesday'), t('admin.day_thursday'), t('admin.day_friday'), t('admin.day_saturday')];
    }

    function AdminDayoffRequests({ showToast, onPendingCount }) {
      const { t } = useLang();
      const DAY_LABEL = useDayLabels();
      const [requests, setRequests] = useState([]);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState('pending');
      const [actingId, setActingId] = useState(null);

      const loadRequests = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/dayoff-requests');
        if (res.ok) {
          setRequests(res.data);
          onPendingCount && onPendingCount(res.data.filter(r => r.status === 'pending').length);
        }
        setLoading(false);
      };
      useEffect(() => { loadRequests(); }, []);

      const review = async (id, status) => {
        setActingId(id);
        const res = await apiCall('PATCH', `/dayoff-requests/${id}/status`, { status });
        setActingId(null);
        if (res.ok) {
          showToast && showToast(status === 'approved' ? t('admin.dayoff_approved_toast') : t('admin.dayoff_rejected_toast'), 'success');
          loadRequests();
        } else {
          showToast && showToast(res.data?.error || t('admin.err_update_request'), 'error');
        }
      };

      const filtered = requests.filter(r => filter === 'all' || r.status === filter);
      const statusInfo = {
        pending: { label: t('barber.abs_pending'), color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
        approved: { label: t('barber.abs_approved'), color: '#10b981', bg: 'rgba(16,185,129,.15)' },
        rejected: { label: t('barber.abs_rejected'), color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
      };

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? 'rgba(212,165,116,.12)' : 'none', border: filter === f ? '1px solid rgba(212,165,116,.3)' : '1px solid var(--bp-border2)', borderRadius: 8, color: filter === f ? '#d4a574' : '#9ca3af', fontSize: 12, fontWeight: 600, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                {{ pending: t('barber.card_pending'), approved: t('admin.filter_approved'), rejected: t('admin.filter_rejected'), all: t('notif.tab_all') }[f]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#4b5563' }}>
              <i className="fas fa-calendar-check" style={{ fontSize: 36, marginBottom: 12, display: 'block' }}></i>
              {t('admin.no_dayoff_request_found')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(r => {
                const s = statusInfo[r.status] || statusInfo.pending;
                return (
                  <div key={r.id} style={{ background: 'linear-gradient(145deg,var(--bp-card) 0%,var(--bp-panel) 100%)', border: '1px solid var(--bp-border2)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: 0 }}>{r.barber_name}</p>
                        <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{s.label}</span>
                      </div>
                      <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
                        <i className="fas fa-calendar-week" style={{ marginRight: 6 }}></i>
                        {t('admin.weekly_dayoff_on', { day: DAY_LABEL[r.day_of_week] })}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => review(r.id, 'rejected')} disabled={actingId === r.id} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: '#ef4444', fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: actingId === r.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <i className="fas fa-times" style={{ marginRight: 6 }}></i>{t('admin.reject')}
                        </button>
                        <button onClick={() => review(r.id, 'approved')} disabled={actingId === r.id} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 8, color: '#000', fontSize: 12, fontWeight: 700, padding: '8px 14px', cursor: actingId === r.id ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          <i className="fas fa-check" style={{ marginRight: 6 }}></i>{t('admin.accept')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    /* ======================================================
       ADMIN — SERVIÇOS
    ====================================================== */
    function AdminServices({ showToast }) {
      const { t } = useLang();
      const [services, setServices] = useState([]);
      const [loading, setLoading] = useState(true);
      const [editService, setEditService] = useState(null);
      const [showNewPanel, setShowNewPanel] = useState(false);
      const [newService, setNewService] = useState({ name: '', duration: 30, price: '', description: '' });
      const [sortAsc, setSortAsc] = useState(true);

      const loadServices = () => {
        apiCall('GET', '/services').then(r => { if (r.ok) setServices(r.data); setLoading(false); });
      };
      useEffect(() => { loadServices(); }, []);

      const sorted = [...services].sort((a, b) => sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

      const removeService = async (id) => {
        const result = await apiCall('DELETE', `/services/${id}`);
        if (result.ok) {
          setServices(prev => prev.filter(s => s.id !== id));
          if (editService?.id === id) setEditService(null);
          showToast && showToast(t('admin.service_removed_toast'), 'info');
        } else {
          showToast && showToast(result.data?.error || t('admin.err_remove_service'), 'error');
        }
      };
      const saveEdit = async () => {
        const payload = { name: editService.name, description: editService.description, price: parseFloat(editService.price) || 0, duration: parseInt(editService.duration) || 30, category: editService.category };
        const result = await apiCall('PUT', `/services/${editService.id}`, payload);
        if (result.ok) {
          setServices(prev => prev.map(s => s.id === editService.id ? { ...s, ...payload } : s));
          setEditService(null);
          showToast && showToast(t('admin.service_updated_toast'), 'success');
        } else {
          showToast && showToast(result.data?.error || t('admin.err_update_service'), 'error');
        }
      };
      const addService = async () => {
        if (!newService.name.trim()) return;
        const payload = { name: newService.name.trim(), description: newService.description, price: parseFloat(newService.price) || 0, duration: parseInt(newService.duration) || 30 };
        const result = await apiCall('POST', '/services', payload);
        if (result.ok) {
          setServices(prev => [...prev, result.data]);
          setNewService({ name: '', duration: 30, price: '', description: '' });
          setShowNewPanel(false);
          showToast && showToast(t('admin.service_added_toast'), 'success');
        } else {
          showToast && showToast(result.data?.error || t('admin.err_add_service'), 'error');
        }
      };

      const panelOpen = !!editService || showNewPanel;
      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', transition: 'border-color .15s' };
      const labelStyle = { color: 'var(--bp-text-muted)', fontSize: 12, display: 'block', marginBottom: 5, fontWeight: 500 };

      // Máscara de moeda: dígitos digitados entram como centavos, sempre exibindo "R$ 0,00"
      const formatBRLInput = (reais) => {
        const cents = Math.round((parseFloat(reais) || 0) * 100);
        return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
      };
      const handlePriceInput = (rawValue, setData) => {
        const digits = rawValue.replace(/\D/g, '');
        const cents = parseInt(digits || '0', 10);
        setData(p => ({ ...p, price: cents / 100 }));
      };

      const openEdit = (s) => { setShowNewPanel(false); setEditService({ ...s }); };
      const openNew = () => { setEditService(null); setShowNewPanel(true); };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('admin.manage_services')}</h2>
            <button onClick={openNew} style={{ background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 700, fontSize: 13, padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif' }}>
              <i className="fas fa-plus"></i> {t('admin.add_new_service')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bp-border)' }}>
                    <th style={{ padding: '14px 18px', textAlign: 'left', color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 12 }}>
                      <button onClick={() => setSortAsc(a => !a)} style={{ background: 'none', border: 'none', color: 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', padding: 0 }}>
                        {t('admin.service_name_col')} <i className={`fas fa-sort-${sortAsc ? 'up' : 'down'}`} style={{ fontSize: 11, color: '#d4a574' }}></i>
                      </button>
                    </th>
                    <th style={{ padding: '14px 12px', textAlign: 'left', color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 12 }}>{t('admin.duration_col')}</th>
                    <th style={{ padding: '14px 12px', textAlign: 'left', color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 12 }}>{t('admin.price_col_brl')}</th>
                    <th style={{ padding: '14px 18px', textAlign: 'right', color: 'var(--bp-text-muted)', fontWeight: 600, fontSize: 12 }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, idx) => {
                    const isActive = editService?.id === s.id;
                    return (
                      <tr key={s.id} style={{ borderBottom: idx < sorted.length - 1 ? '1px solid var(--bp-border)' : 'none', background: isActive ? 'rgba(212,165,116,0.05)' : 'transparent', transition: 'background .15s' }} onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ color: 'var(--bp-text)', fontWeight: 500 }}>{s.name}</span>
                        </td>
                        <td style={{ padding: '14px 12px', color: 'var(--bp-text-secondary)' }}>{s.duration} min</td>
                        <td style={{ padding: '14px 12px', color: 'var(--bp-text-secondary)' }}>R$ {parseFloat(s.price).toFixed(2).replace('.', ',')}</td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button onClick={() => openEdit(s)} title={t('common.edit')} aria-label={`${t('common.edit')} ${s.name}`} style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${isActive ? '#d4a574' : 'var(--bp-border2)'}`, background: isActive ? 'rgba(212,165,116,0.1)' : 'none', color: isActive ? '#d4a574' : 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; } }} onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-faint)'; } }}>
                              <i className="fas fa-pen" aria-hidden="true"></i>
                            </button>
                            <button onClick={() => removeService(s.id)} title={t('common.remove')} aria-label={`${t('common.remove')} ${s.name}`} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--bp-border2)', background: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 12 }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-faint)'; }}>
                              <i className="fas fa-trash" aria-hidden="true"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && sorted.length === 0 && <tr><td colSpan="4" style={{ padding: '48px 0', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>{t('admin.no_service_registered')}</td></tr>}
                  {loading && <tr><td colSpan="4" style={{ padding: '48px 0', textAlign: 'center', color: '#4b5563', fontSize: 13 }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>{t('common.loading')}</td></tr>}
                </tbody>
              </table>
            </div>

            {panelOpen && (
              <div style={{ flex: '1 1 280px', maxWidth: 320, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: 0 }}>{editService ? t('admin.edit_service') : t('admin.new_service')}</h3>
                  <button onClick={() => { setEditService(null); setShowNewPanel(false); }} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 15 }}><i className="fas fa-times"></i></button>
                </div>
                {(() => {
                  const data = editService || newService;
                  const setData = editService
                    ? (fn) => setEditService(prev => typeof fn === 'function' ? fn(prev) : { ...prev, ...fn })
                    : (fn) => setNewService(prev => typeof fn === 'function' ? fn(prev) : { ...prev, ...fn });
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div><label style={labelStyle}>{t('admin.service_name_col')}</label><input value={data.name} onChange={e => setData(p => ({ ...p, name: e.target.value }))} style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                      <div>
                        <DurationDrumSelector value={data.duration} onChange={(min) => setData(p => ({ ...p, duration: min }))} />
                        <p style={{ color: '#4b5563', fontSize: 11, textAlign: 'center', margin: '6px 0 0' }}>{t('admin.duration_interval_hint')}</p>
                      </div>
                      <div><label style={labelStyle}>{t('admin.price_label')}</label><input value={formatBRLInput(data.price)} onChange={e => handlePriceInput(e.target.value, setData)} inputMode="numeric" style={inputStyle} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                      <div><label style={labelStyle}>{t('common.description')}</label><textarea value={data.description} onChange={e => setData(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 90, lineHeight: 1.5 }} onFocus={e => e.target.style.borderColor = '#d4a574'} onBlur={e => e.target.style.borderColor = 'var(--bp-border2)'} /></div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={editService ? saveEdit : addService} style={{ flex: 2, background: 'linear-gradient(135deg,#d4a574,#8b7355)', border: 'none', borderRadius: 9, color: '#000', fontWeight: 700, fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                          {editService ? t('admin.save_changes') : t('common.add')}
                        </button>
                        <button onClick={() => { setEditService(null); setShowNewPanel(false); }} style={{ flex: 1, background: 'none', border: 'none', borderRadius: 9, color: '#9ca3af', fontSize: 13, padding: '11px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      );
    }

    /* ======================================================
       ADMIN — RELATÓRIOS
    ====================================================== */
    function ReportBarChart({ labels, values }) {
      const { t, lang } = useLang();
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        const cs = getComputedStyle(document.documentElement);
        const border = cs.getPropertyValue('--bp-border').trim();
        const textFaint = cs.getPropertyValue('--bp-text-faint').trim();
        chartRef.current = new Chart(canvasRef.current, {
          type: 'bar', data: { labels, datasets: [{ label: t('admin.revenue_label'), data: values, backgroundColor: '#d4a574cc', borderRadius: 6, borderSkipped: false }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' R$ ' + ctx.parsed.y.toLocaleString('pt-BR') } } }, scales: { x: { grid: { color: border }, ticks: { color: textFaint, font: { size: 11 } } }, y: { grid: { color: border }, ticks: { color: textFaint, font: { size: 11 }, callback: v => v >= 1000 ? 'R$' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : 'R$' + v.toLocaleString('pt-BR') }, beginAtZero: true } } }
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
      }, [labels, values, lang]);
      return <div style={{ position: 'relative', height: 220, width: '100%' }}><canvas ref={canvasRef}></canvas></div>;
    }

    function WeekdayBarChart({ labels, values }) {
      const { t, lang } = useLang();
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
          data: { labels, datasets: [{ label: t('admin.chart_appointments_label'), data: values, backgroundColor: values.map(v => v === max && max > 0 ? '#d4a574' : '#d4a57466'), borderRadius: 6, borderSkipped: false }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + t(ctx.parsed.y === 1 ? 'admin.tooltip_appointment_singular' : 'admin.tooltip_appointment_plural', { count: ctx.parsed.y }) } } },
            scales: {
              x: { grid: { display: false }, ticks: { color: textFaint, font: { size: 12 } } },
              y: { grid: { color: border }, ticks: { color: textFaint, font: { size: 11 }, precision: 0 }, beginAtZero: true }
            }
          }
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
      }, [JSON.stringify(values), lang]);
      return <div style={{ position: 'relative', height: 220, width: '100%' }}><canvas ref={canvasRef}></canvas></div>;
    }

    function ReportDonutChart({ items, total }) {
      const { t, lang } = useLang();
      const canvasRef = useRef(null);
      const chartRef = useRef(null);
      useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
        const panelBg = getComputedStyle(document.documentElement).getPropertyValue('--bp-panel').trim();
        chartRef.current = new Chart(canvasRef.current, {
          type: 'doughnut',
          data: { labels: items.map(i => i.label), datasets: [{ data: items.map(i => i.pct), backgroundColor: items.map(i => i.color), borderColor: panelBg, borderWidth: 3, hoverOffset: 4 }] },
          options: { responsive: true, maintainAspectRatio: true, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.parsed + '%' } } } }
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
      }, [items, lang]);
      return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180 }}>
          <canvas ref={canvasRef} style={{ maxWidth: 180, maxHeight: 180 }}></canvas>
          <div className="rpt-donut-center">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bp-text)' }}>{total}</div>
            <div style={{ fontSize: 11, color: 'var(--bp-text-faint)', marginTop: 2 }}>{t('admin.appointments_word')}</div>
          </div>
        </div>
      );
    }

    function getReportRange(period, customStart, customEnd) {
      if (customStart && customEnd) {
        const start = parseLocalDate(customStart); start.setHours(0, 0, 0, 0);
        const end = parseLocalDate(customEnd); end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      const now = new Date();
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      if (period === '7d') {
        const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
        return { start, end };
      }
      if (period === 'mes-ant') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0); prevEnd.setHours(23, 59, 59, 999);
        return { start, end: prevEnd };
      }
      if (period === 'trim') {
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start, end };
      }
      if (period === 'ano') {
        const start = new Date(now.getFullYear(), 0, 1);
        return { start, end };
      }
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }

    function getPrevReportRange(period, range, customStart, customEnd) {
      // Sem unidade de calendário natural (7 dias corridos ou intervalo personalizado):
      // compara com a janela imediatamente anterior de mesmo tamanho.
      if (customStart && customEnd || period === '7d') {
        const lengthMs = range.end - range.start;
        const prevEnd = new Date(range.start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - lengthMs);
        return { start: prevStart, end: prevEnd };
      }
      const now = new Date();
      if (period === 'mes-ant') {
        // mês anterior ao exibido (mês cheio a mês cheio)
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - 1, 0); end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      if (period === 'trim') {
        // 3 meses cheios imediatamente antes do trimestre atual
        const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - 2, 0); end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      if (period === 'ano') {
        // mesmo intervalo (1º de jan. até o mesmo dia), no ano anterior
        const start = new Date(now.getFullYear() - 1, 0, 1);
        const end = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      // 'mes': mesmo número de dias do mês anterior (comparação "mês corrente até hoje")
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const end = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), daysInPrevMonth)); end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    function pctChangeBadge(curr, prev) {
      let pct;
      if (prev === 0) pct = curr === 0 ? 0 : 100;
      else pct = ((curr - prev) / prev) * 100;
      const up = pct >= 0;
      return { color: pct === 0 ? 'var(--bp-text-faint)' : (up ? '#10b981' : '#ef4444'), icon: pct === 0 ? 'fa-minus' : (up ? 'fa-arrow-up' : 'fa-arrow-down'), text: `${pct === 0 ? '' : (up ? '+' : '')}${pct.toFixed(0)}% ${translateNow('admin.vs_previous_period')}` };
    }

    function AdminReports({ appointments = [], clients = [], reviews = [] }) {
      const { t, lang } = useLang();
      const [period, setPeriod] = useState('mes');
      const [search, setSearch] = useState('');
      const [statusFilter, setStatusFilter] = useState('');
      const [page, setPage] = useState(1);
      const [showFilters, setShowFilters] = useState(false);
      const [barberFilter, setBarberFilter] = useState('');
      const [customStart, setCustomStart] = useState('');
      const [customEnd, setCustomEnd] = useState('');
      const PAGE_SIZE = 5;
      const PALETTE = ['#d4a574', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

      const barberNames = useMemo(() => [...new Set(appointments.map(a => a.barber_name).filter(Boolean))].sort(), [appointments]);
      const barberColor = (name) => { const idx = barberNames.indexOf(name); return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]; };

      const range = useMemo(() => getReportRange(period, customStart, customEnd), [period, customStart, customEnd]);
      const prevRange = useMemo(() => getPrevReportRange(period, range, customStart, customEnd), [period, range, customStart, customEnd]);
      const inRange = (dateStr, r) => { const d = parseLocalDate(dateStr); return d >= r.start && d <= r.end; };

      const periodApts = useMemo(() => appointments.filter(a => inRange(a.appointment_date, range) && (!barberFilter || a.barber_name === barberFilter)), [appointments, range, barberFilter]);
      const prevPeriodApts = useMemo(() => appointments.filter(a => inRange(a.appointment_date, prevRange) && (!barberFilter || a.barber_name === barberFilter)), [appointments, prevRange, barberFilter]);

      const sumRevenue = apts => apts.filter(a => a.status === 'completed').reduce((s, a) => s + (Number(a.price) || 0), 0);
      const totalReceita = sumRevenue(periodApts);
      const receitaBadge = pctChangeBadge(totalReceita, sumRevenue(prevPeriodApts));

      const newClientsInPeriod = clients.filter(c => inRange(c.created_at, range)).length;
      const clientsBadge = pctChangeBadge(newClientsInPeriod, clients.filter(c => inRange(c.created_at, prevRange)).length);

      const completedCount = periodApts.filter(a => a.status === 'completed').length;
      const prevCompletedCount = prevPeriodApts.filter(a => a.status === 'completed').length;
      const ticketMedio = completedCount > 0 ? totalReceita / completedCount : 0;
      const prevTicketMedio = prevCompletedCount > 0 ? sumRevenue(prevPeriodApts) / prevCompletedCount : 0;
      const ticketBadge = pctChangeBadge(ticketMedio, prevTicketMedio);

      const monthly = useMemo(() => {
        const now = new Date();
        const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return d; });
        const labels = months.map(d => d.toLocaleDateString(localeTag(lang), { month: 'short' }));
        const values = months.map(d => appointments
          .filter(a => a.status === 'completed' && (!barberFilter || a.barber_name === barberFilter))
          .filter(a => { const ad = parseLocalDate(a.appointment_date); return ad.getFullYear() === d.getFullYear() && ad.getMonth() === d.getMonth() && ad <= now; })
          .reduce((s, a) => s + (Number(a.price) || 0), 0));
        return { labels, values };
      }, [appointments, barberFilter, lang]);

      const serviceBreakdown = useMemo(() => {
        const counts = {};
        periodApts.filter(a => a.status !== 'cancelled').forEach(a => { counts[a.service_name] = (counts[a.service_name] || 0) + 1; });
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, [, c]) => s + c, 0);
        const top = entries.slice(0, 4);
        const othersCount = entries.slice(4).reduce((s, [, c]) => s + c, 0);
        const items = top.map(([name, count], i) => ({ label: name, count, pct: total ? Math.round(count / total * 100) : 0, color: PALETTE[i] }));
        if (othersCount > 0) items.push({ label: translateNow('admin.other_label'), count: othersCount, pct: total ? Math.round(othersCount / total * 100) : 0, color: PALETTE[4] });
        return { items, total };
      }, [periodApts]);

      const WEEKDAY_ORDER = useMemo(() => weekdayAbbrevs(lang), [lang]);
      const MON_TO_SUN_DOW = [1, 2, 3, 4, 5, 6, 0];
      const weekdayBreakdown = useMemo(() => {
        const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        periodApts.filter(a => a.status !== 'cancelled').forEach(a => {
          const dow = parseLocalDate(a.appointment_date).getDay();
          counts[dow] = (counts[dow] || 0) + 1;
        });
        return MON_TO_SUN_DOW.map(dow => counts[dow]);
      }, [periodApts]);
      const busiestWeekdayIdx = weekdayBreakdown.reduce((best, v, i) => v > weekdayBreakdown[best] ? i : best, 0);
      const hasWeekdayData = weekdayBreakdown.some(v => v > 0);

      const barberPerf = useMemo(() => {
        const map = {};
        periodApts.filter(a => a.status === 'completed').forEach(a => { map[a.barber_name] = (map[a.barber_name] || 0) + (Number(a.price) || 0); });
        const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
        const max = entries.length ? entries[0][1] : 0;
        return entries.map(([name, val]) => ({ name, val, pct: max ? Math.round(val / max * 100) : 0, color: barberColor(name) }));
      }, [periodApts]);

      const totalCount = periodApts.length;
      const cancelledCount = periodApts.filter(a => a.status === 'cancelled').length;
      const taxaConclusao = totalCount ? Math.round(completedCount / totalCount * 100) : 0;
      const prevTotalCount = prevPeriodApts.length;
      const taxaConclusaoPrev = prevTotalCount ? Math.round(prevCompletedCount / prevTotalCount * 100) : 0;
      const taxaCancelamento = totalCount ? Math.round(cancelledCount / totalCount * 100) : 0;
      const prevCancelledCount = prevPeriodApts.filter(a => a.status === 'cancelled').length;
      const taxaCancelamentoPrev = prevTotalCount ? Math.round(prevCancelledCount / prevTotalCount * 100) : 0;

      const periodClientIds = [...new Set(periodApts.map(a => a.client_id))];
      const returningCount = periodClientIds.filter(cid => appointments.some(a => a.client_id === cid && parseLocalDate(a.appointment_date) < range.start)).length;
      const retornoPct = periodClientIds.length ? Math.round(returningCount / periodClientIds.length * 100) : 0;

      const periodReviews = useMemo(() => reviews.filter(r => inRange(r.created_at, range) && (!barberFilter || r.barber_name === barberFilter)), [reviews, range, barberFilter]);
      const avgRating = periodReviews.length ? (periodReviews.reduce((s, r) => s + r.rating, 0) / periodReviews.length).toFixed(1) : '—';

      const days = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
      const aptsPerDay = (completedCount / days).toFixed(1);
      const activeBarbers = new Set(periodApts.filter(a => a.status === 'completed').map(a => a.barber_name)).size;

      const filtered = useMemo(() => periodApts.filter(a => {
        const q = search.toLowerCase();
        const matchSearch = !q || (a.client_name || '').toLowerCase().includes(q) || (a.barber_name || '').toLowerCase().includes(q) || (a.service_name || '').toLowerCase().includes(q);
        const matchStatus = !statusFilter || a.status === statusFilter;
        return matchSearch && matchStatus;
      }).sort((a, b) => `${b.appointment_date}T${b.appointment_time || ''}`.localeCompare(`${a.appointment_date}T${a.appointment_time || ''}`)), [periodApts, search, statusFilter]);

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
      const statusPillClass = (s) => ({ completed: 'rpt-pill-completed', confirmed: 'rpt-pill-confirmed', pending: 'rpt-pill-pending', cancelled: 'rpt-pill-cancelled' }[s] || '');

      const clearFilters = () => { setBarberFilter(''); setCustomStart(''); setCustomEnd(''); setPage(1); };

      const exportCSV = () => {
        const headers = [t('booking.label_date'), t('admin.csv_hour'), t('admin.table_client'), t('admin.table_barber'), t('admin.table_service'), t('admin.csv_value'), t('admin.table_status')];
        const rows = filtered.map(a => [
          fmtDate(a.appointment_date), a.appointment_time || '', a.client_name || '', a.barber_name || '', a.service_name || '',
          (Number(a.price) || 0).toFixed(2).replace('.', ','), statusLabel(a.status)
        ]);
        const csvLines = [headers, ...rows].map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(';'));
        const csvContent = '﻿' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `relatorio-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      return (
        <div>
          <div className="rpt-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-chart-bar" style={{ color: '#d4a574', fontSize: 20 }}></i>
              <div>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 700, margin: 0 }}>{t('admin.reports_title')}</h2>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: 0 }}>{t('admin.reports_subtitle')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select className="rpt-select" value={customStart && customEnd ? 'custom' : period} onChange={e => { setPeriod(e.target.value); setCustomStart(''); setCustomEnd(''); setPage(1); }}>
                <option value="7d">{t('admin.period_last_7d')}</option>
                <option value="mes">{t('admin.period_this_month')}</option>
                <option value="mes-ant">{t('admin.period_last_month')}</option>
                <option value="trim">{t('admin.period_this_quarter')}</option>
                <option value="ano">{t('admin.period_this_year')}</option>
                {customStart && customEnd && <option value="custom">{t('admin.period_custom', { start: fmtDate(customStart), end: fmtDate(customEnd) })}</option>}
              </select>
              <button className="rpt-btn-ghost" onClick={() => setShowFilters(f => !f)} style={{ color: showFilters ? '#d4a574' : undefined, borderColor: showFilters ? '#d4a574' : undefined }}><i className="fas fa-filter"></i> {t('admin.filters_btn')}</button>
              <button className="rpt-btn" onClick={exportCSV}><i className="fas fa-download"></i> {t('admin.export_btn')}</button>
            </div>
          </div>

          {showFilters && (
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 12, padding: 16, marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <label htmlFor="rpt-barber-filter" style={{ color: 'var(--bp-text-faint)', fontSize: 11, display: 'block', marginBottom: 5 }}>{t('booking.label_barber')}</label>
                <select id="rpt-barber-filter" className="rpt-select" value={barberFilter} onChange={e => { setBarberFilter(e.target.value); setPage(1); }}>
                  <option value="">{t('admin.all_barbers')}</option>
                  {barberNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="rpt-date-from" style={{ color: 'var(--bp-text-faint)', fontSize: 11, display: 'block', marginBottom: 5 }}>{t('admin.start_date_label')}</label>
                <input id="rpt-date-from" type="date" className="rpt-select" value={customStart} onChange={e => { setCustomStart(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label htmlFor="rpt-date-to" style={{ color: 'var(--bp-text-faint)', fontSize: 11, display: 'block', marginBottom: 5 }}>{t('admin.end_date_label')}</label>
                <input id="rpt-date-to" type="date" className="rpt-select" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setPage(1); }} />
              </div>
              <button className="rpt-btn-ghost" onClick={clearFilters}><i className="fas fa-times"></i> {t('admin.clear_filters')}</button>
            </div>
          )}

          <div className="rpt-stat-grid">
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(212,165,116,0.15)' }}><i className="fas fa-dollar-sign" style={{ color: '#d4a574' }}></i></div>
              <div className="rpt-stat-label">{t('admin.total_revenue')}</div>
              <div className="rpt-stat-value">{fmtCur(totalReceita)}</div>
              <div className="rpt-stat-change" style={{ color: receitaBadge.color }}><i className={`fas ${receitaBadge.icon}`} style={{ fontSize: 10 }}></i> {receitaBadge.text}</div>
              <div className="rpt-stat-bar" style={{ background: 'linear-gradient(90deg,#d4a574,#8b7355)' }}></div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(59,130,246,0.15)' }}><i className="fas fa-user-plus" style={{ color: '#3b82f6' }}></i></div>
              <div className="rpt-stat-label">{t('admin.new_clients')}</div>
              <div className="rpt-stat-value">{newClientsInPeriod}</div>
              <div className="rpt-stat-change" style={{ color: clientsBadge.color }}><i className={`fas ${clientsBadge.icon}`} style={{ fontSize: 10 }}></i> {clientsBadge.text}</div>
              <div className="rpt-stat-bar" style={{ background: 'linear-gradient(90deg,#3b82f6,#60a5fa)' }}></div>
            </div>
            <div className="rpt-stat-card">
              <div className="rpt-stat-icon" style={{ background: 'rgba(16,185,129,0.15)' }}><i className="fas fa-receipt" style={{ color: '#10b981' }}></i></div>
              <div className="rpt-stat-label">{t('admin.avg_ticket')}</div>
              <div className="rpt-stat-value">{fmtCur(ticketMedio)}</div>
              <div className="rpt-stat-change" style={{ color: ticketBadge.color }}><i className={`fas ${ticketBadge.icon}`} style={{ fontSize: 10 }}></i> {ticketBadge.text}</div>
              <div className="rpt-stat-bar" style={{ background: 'linear-gradient(90deg,#10b981,#34d399)' }}></div>
            </div>
          </div>
          <div className="rpt-charts-row">
            <div className="rpt-chart-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="rpt-chart-title"><i className="fas fa-chart-bar" style={{ color: '#d4a574' }}></i> {t('admin.monthly_revenue')}</div>
              </div>
              <div className="rpt-legend-row">
                <div className="rpt-legend-item"><span className="rpt-legend-dot" style={{ background: '#d4a574' }}></span>{t('admin.revenue_label')}</div>
              </div>
              <ReportBarChart labels={monthly.labels} values={monthly.values} />
            </div>
            <div className="rpt-chart-panel">
              <div className="rpt-chart-title" style={{ marginBottom: 14 }}><i className="fas fa-star" style={{ color: '#d4a574' }}></i> {t('admin.popular_services')}</div>
              {serviceBreakdown.total === 0 ? (
                <div style={{ textAlign: 'center', color: '#4b5563', padding: '32px 0' }}>{t('admin.no_data_period')}</div>
              ) : (
                <>
                  <ReportDonutChart items={serviceBreakdown.items} total={serviceBreakdown.total} />
                  <div className="rpt-donut-legend">
                    {serviceBreakdown.items.map(item => (
                      <div key={item.label} className="rpt-donut-legend-item">
                        <div className="rpt-donut-legend-label"><span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: 'inline-block', flexShrink: 0 }}></span>{item.label}</div>
                        <div className="rpt-donut-bar-wrap"><div className="rpt-donut-bar" style={{ width: item.pct + '%', background: item.color }}></div></div>
                        <div className="rpt-donut-pct">{item.pct}%</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="rpt-chart-panel" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <div className="rpt-chart-title"><i className="fas fa-chart-column" style={{ color: '#d4a574' }}></i> {t('admin.busiest_days')} {barberFilter ? `— ${barberFilter}` : `— ${t('admin.all_barbers')}`}</div>
              {hasWeekdayData && (
                <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>
                  {t(weekdayBreakdown[busiestWeekdayIdx] === 1 ? 'admin.busiest_day_text_singular' : 'admin.busiest_day_text_plural', { day: WEEKDAY_ORDER[busiestWeekdayIdx], count: weekdayBreakdown[busiestWeekdayIdx] })}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 14px' }}>{t('admin.weekday_chart_subtitle')}</p>
            {hasWeekdayData ? (
              <WeekdayBarChart labels={WEEKDAY_ORDER} values={weekdayBreakdown} />
            ) : (
              <div style={{ textAlign: 'center', color: '#4b5563', padding: '32px 0' }}>{t('admin.no_data_period')}</div>
            )}
          </div>
          <div className="rpt-table-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div className="rpt-chart-title"><i className="fas fa-table" style={{ color: '#d4a574' }}></i> {t('admin.detailed_services_table')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 13, pointerEvents: 'none' }}></i>
                  <input className="rpt-search" type="text" placeholder={t('admin.search_client_placeholder')} aria-label={t('admin.search_client_label')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <select className="rpt-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="">{t('admin.all_statuses')}</option>
                  <option value="completed">{t('status.completed')}</option>
                  <option value="confirmed">{t('status.confirmed')}</option>
                  <option value="pending">{t('status.pending')}</option>
                  <option value="cancelled">{t('status.cancelled')}</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="rpt-table">
                <thead><tr><th>{t('booking.label_date')}</th><th>{t('admin.table_client')}</th><th>{t('admin.table_barber')}</th><th>{t('admin.table_service')}</th><th>{t('admin.value_brl_col')}</th><th>{t('admin.table_status')}</th></tr></thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', padding: '32px 0' }}>{t('admin.no_records_found')}</td></tr>
                  ) : pageRows.map((r) => {
                    const color = barberColor(r.barber_name);
                    return (
                      <tr key={r.id}>
                        <td style={{ color: 'var(--bp-text-muted)' }}>{fmtDate(r.appointment_date)}</td>
                        <td style={{ color: 'var(--bp-text)', fontWeight: 500 }}>{r.client_name}</td>
                        <td><div className="rpt-barber-chip"><div className="rpt-avatar" style={{ background: color + '22', color, border: `1.5px solid ${color}44` }}>{BARBER_INITIALS(r.barber_name)}</div><span style={{ color: 'var(--bp-text-muted)' }}>{r.barber_name}</span></div></td>
                        <td>{r.service_name}</td>
                        <td style={{ color: '#d4a574', fontWeight: 600 }}>{fmtCur(r.price)}</td>
                        <td><span className={`rpt-status-pill ${statusPillClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rpt-pagination">
              <div className="rpt-pag-info">{filtered.length === 0 ? t('admin.no_records') : t('admin.showing_records', { from: (safePage - 1) * PAGE_SIZE + 1, to: Math.min(safePage * PAGE_SIZE, filtered.length), total: filtered.length })}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="rpt-pg-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`rpt-pg-btn${p === safePage ? ' rpt-pg-btn-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="rpt-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>›</button>
              </div>
            </div>
          </div>
          <div className="rpt-bottom-row">
            <div className="rpt-mini-panel">
              <div className="rpt-chart-title" style={{ marginBottom: 16 }}><i className="fas fa-user-tie" style={{ color: '#d4a574' }}></i> {t('admin.barber_performance')}</div>
              {barberPerf.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#4b5563', padding: '20px 0' }}>{t('admin.no_completed_period')}</div>
              ) : barberPerf.map(b => (
                <div key={b.name} className="rpt-barber-row">
                  <div className="rpt-avatar" style={{ background: b.color + '22', color: b.color, border: `1.5px solid ${b.color}44`, width: 36, height: 36, fontSize: 12 }}>{BARBER_INITIALS(b.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 6 }}>{b.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="rpt-barber-perf-bar"><div className="rpt-barber-perf-fill" style={{ width: b.pct + '%', background: b.color }}></div></div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: b.color, minWidth: 72, textAlign: 'right' }}>{fmtCur(b.val)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rpt-mini-panel">
              <div className="rpt-chart-title" style={{ marginBottom: 16 }}><i className="fas fa-tachometer-alt" style={{ color: '#d4a574' }}></i> {t('admin.period_kpis')}</div>
              <div className="rpt-kpi-grid">
                {[
                  { key: 'completion', label: t('admin.kpi_completion_rate'), value: `${taxaConclusao}%`, color: '#10b981', diff: taxaConclusao - taxaConclusaoPrev },
                  { key: 'cancellations', label: t('admin.kpi_cancellations'), value: `${taxaCancelamento}%`, color: '#ef4444', diff: taxaCancelamento - taxaCancelamentoPrev, invert: true },
                  { key: 'return', label: t('admin.kpi_client_return'), value: `${retornoPct}%`, color: '#d4a574', diff: null },
                  { key: 'rating', label: t('admin.kpi_avg_rating'), value: avgRating === '—' ? '—' : `${avgRating} ★`, color: '#f59e0b', diff: null },
                  { key: 'per_day', label: t('admin.kpi_apts_per_day'), value: aptsPerDay.replace('.', ','), color: 'var(--bp-text)', diff: null },
                  { key: 'active', label: t('admin.kpi_active_barbers'), value: activeBarbers, color: 'var(--bp-text)', diff: null },
                ].map(kpi => {
                  const up = kpi.diff == null ? null : (kpi.invert ? kpi.diff <= 0 : kpi.diff >= 0);
                  return (
                    <div key={kpi.key} className="rpt-kpi-card">
                      <div className="rpt-kpi-label">{kpi.label}</div>
                      <div className="rpt-kpi-value" style={{ color: kpi.color, fontSize: 18 }}>{kpi.value}</div>
                      <div className="rpt-kpi-sub" style={{ color: up === true ? '#10b981' : up === false ? '#ef4444' : 'var(--bp-text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {kpi.diff == null ? t('admin.in_period') : (
                          <>
                            {kpi.diff !== 0 && <i className={`fas fa-arrow-${kpi.diff > 0 ? 'up' : 'down'}`} style={{ fontSize: 9 }}></i>}
                            {t('admin.pp_vs_previous', { diff: (kpi.diff > 0 ? '+' : '') + kpi.diff })}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* ======================================================
       ADMIN — AVALIAÇÕES
    ====================================================== */
    const RV_PALETTE = ['#d4a574', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899'];
    const colorFromString = (str) => { let h = 0; for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % RV_PALETTE.length; return RV_PALETTE[h]; };

    function StarDisplay({ rating, size = 14 }) {
      return (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <i key={i} className={`fas fa-star ${i <= rating ? 'rv-star' : 'rv-star-empty'}`} style={{ fontSize: size }}></i>
          ))}
        </span>
      );
    }

    function RatingGauge({ reviews }) {
      const { t } = useLang();
      const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;
      const counts = [5, 4, 3, 2, 1].map(star => ({
        star, count: reviews.filter(r => r.rating === star).length,
        pct: reviews.length ? Math.round(reviews.filter(r => r.rating === star).length / reviews.length * 100) : 0
      }));
      return (
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 12px' }}>
              <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bp-border)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="url(#rv-grad)" strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 50 * avg / 5} ${2 * Math.PI * 50 * (1 - avg / 5)}`}
                  strokeLinecap="round" />
                <defs>
                  <linearGradient id="rv-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#d4a574" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--bp-text)', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>{avg.toFixed(1)}</span>
                <span style={{ fontSize: 11, color: 'var(--bp-text-faint)', marginTop: 2 }}>/ 5.0</span>
              </div>
            </div>
            <StarDisplay rating={Math.round(avg)} size={13} />
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, marginTop: 6 }}>{t(reviews.filter(r => !r.hidden).length === 1 ? 'admin.review_count_singular' : 'admin.review_count_plural', { count: reviews.filter(r => !r.hidden).length })}</p>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {counts.map(({ star, count, pct }) => (
              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--bp-text-muted)', fontSize: 12, width: 8, textAlign: 'right' }}>{star}</span>
                <i className="fas fa-star" style={{ color: '#f59e0b', fontSize: 10, flexShrink: 0 }}></i>
                <div className="rv-gauge-bar"><div className="rv-gauge-fill" style={{ width: pct + '%' }}></div></div>
                <span style={{ color: 'var(--bp-text-muted)', fontSize: 12, width: 24, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    function ReviewCard({ review, onToggleFeatured, onToggleHidden }) {
      const { t } = useLang();
      const clientColor = colorFromString(review.client_name);
      const barberColor = colorFromString(review.barber_name);
      return (
        <div className="rv-card rv-card-anim" style={{ opacity: review.hidden ? 0.45 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div className="rv-avatar-lg" style={{ background: clientColor + '22', color: clientColor, border: `2px solid ${clientColor}44`, fontSize: 14 }}>
              {BARBER_INITIALS(review.client_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 14 }}>{review.client_name}</span>
                  {!!review.featured && <span className="rv-badge-featured"><i className="fas fa-star" style={{ fontSize: 9 }}></i> {t('admin.tab_featured')}</span>}
                  {!!review.hidden && <span style={{ background: 'rgba(107,114,128,0.18)', color: 'var(--bp-text-faint)', border: '1px solid rgba(107,114,128,0.27)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}><i className="fas fa-eye-slash" style={{ fontSize: 9, marginRight: 4 }}></i>{t('admin.hidden_badge')}</span>}
                </div>
                <span style={{ color: '#4b5563', fontSize: 12 }}>{fmtDate(review.created_at)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <StarDisplay rating={review.rating} />
                <span style={{ color: '#4b5563', fontSize: 11 }}>•</span>
                <span style={{ color: 'var(--bp-text-muted)', fontSize: 12 }}>{review.service_name}</span>
              </div>
              {review.comment && <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, lineHeight: 1.6, margin: '0 0 10px' }}>{review.comment}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div className="rpt-avatar" style={{ background: barberColor + '22', color: barberColor, border: `1.5px solid ${barberColor}44`, width: 24, height: 24, fontSize: 10 }}>{BARBER_INITIALS(review.barber_name)}</div>
                <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>{review.barber_name}</span>
              </div>
              {review.reply && (
                <div className="rv-reply-box">
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#d4a574,#8b7355)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="fas fa-scissors" style={{ color: 'var(--bp-text)', fontSize: 10 }}></i>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#d4a574', fontSize: 11, fontWeight: 600, margin: '0 0 3px' }}>{t('admin.reply_from', { name: review.barber_name })}</p>
                    <p style={{ color: '#9ca3af', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{review.reply}</p>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => onToggleFeatured(review.id, !review.featured)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: `1px solid ${review.featured ? '#d4a574' : 'var(--bp-border)'}`, background: review.featured ? 'rgba(212,165,116,0.12)' : 'none', color: review.featured ? '#d4a574' : 'var(--bp-text-muted)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-star"></i> {review.featured ? t('admin.remove_featured') : t('admin.highlight_btn')}
                </button>
                <button onClick={() => onToggleHidden(review.id, !review.hidden)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: `1px solid ${review.hidden ? 'var(--bp-text-faint)' : 'var(--bp-border)'}`, background: 'none', color: review.hidden ? '#9ca3af' : 'var(--bp-text-faint)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i className={`fas fa-eye${review.hidden ? '' : '-slash'}`}></i> {review.hidden ? t('admin.show_btn') : t('admin.hide_btn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    function AdminReviews() {
      const { t } = useLang();
      const [reviews, setReviews] = useState([]);
      const [loading, setLoading] = useState(true);
      const [filterBarber, setFilterBarber] = useState('');
      const [filterService, setFilterService] = useState('');
      const [filterRating, setFilterRating] = useState('');
      const [search, setSearch] = useState('');
      const [activeTab, setActiveTab] = useState('all');
      const [sortBy, setSortBy] = useState('recent');
      const [page, setPage] = useState(1);
      const PAGE_SIZE = 5;

      const loadReviews = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/reviews');
        if (res.ok) setReviews(res.data);
        setLoading(false);
      };
      useEffect(() => { loadReviews(); }, []);

      const barbers = useMemo(() => [...new Set(reviews.map(r => r.barber_name))], [reviews]);
      const services = useMemo(() => [...new Set(reviews.map(r => r.service_name))], [reviews]);

      const toggleFeatured = async (id, featured) => {
        const res = await apiCall('PATCH', `/reviews/${id}`, { featured });
        if (res.ok) setReviews(prev => prev.map(r => r.id === id ? { ...r, featured: featured ? 1 : 0 } : r));
      };
      const toggleHidden = async (id, hidden) => {
        const res = await apiCall('PATCH', `/reviews/${id}`, { hidden });
        if (res.ok) setReviews(prev => prev.map(r => r.id === id ? { ...r, hidden: hidden ? 1 : 0 } : r));
      };

      const filtered = useMemo(() => {
        let list = reviews;
        if (activeTab === 'pending') list = list.filter(r => !r.reply && !r.hidden);
        else if (activeTab === 'featured') list = list.filter(r => r.featured);
        else if (activeTab === 'hidden') list = list.filter(r => r.hidden);
        if (filterBarber) list = list.filter(r => r.barber_name === filterBarber);
        if (filterService) list = list.filter(r => r.service_name === filterService);
        if (filterRating) list = list.filter(r => r.rating === parseInt(filterRating));
        if (search) { const q = search.toLowerCase(); list = list.filter(r => r.client_name.toLowerCase().includes(q) || (r.comment || '').toLowerCase().includes(q)); }
        if (sortBy === 'recent') list = [...list].sort((a, b) => b.id - a.id);
        else if (sortBy === 'rating_asc') list = [...list].sort((a, b) => a.rating - b.rating);
        else if (sortBy === 'rating_desc') list = [...list].sort((a, b) => b.rating - a.rating);
        return list;
      }, [reviews, activeTab, filterBarber, filterService, filterRating, search, sortBy]);

      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      const safePage = Math.min(page, totalPages);
      const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

      const visibleReviews = reviews.filter(r => !r.hidden);
      const avg = visibleReviews.length ? (visibleReviews.reduce((s, r) => s + r.rating, 0) / visibleReviews.length) : 0;
      const pending = reviews.filter(r => !r.reply && !r.hidden).length;
      const featured = reviews.filter(r => r.featured).length;

      if (loading) {
        return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#d4a574' }}></i></div>;
      }

      return (
        <div>
          <div className="rpt-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-star" style={{ color: '#d4a574', fontSize: 20 }}></i>
              <div>
                <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 700, margin: 0 }}>{t('admin.reviews_title')}</h2>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: 0 }}>{t('admin.reviews_subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="rv-top-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div className="rv-panel"><RatingGauge reviews={visibleReviews} /></div>
            <div className="rv-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,165,116,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><i className="fas fa-comments" style={{ color: '#d4a574', fontSize: 18 }}></i></div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--bp-text)' }}>{visibleReviews.length}</div>
              <div style={{ fontSize: 12, color: 'var(--bp-text-faint)', marginTop: 4 }}>{t('admin.total_reviews')}</div>
            </div>
            <div className="rv-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><i className="fas fa-clock" style={{ color: '#3b82f6', fontSize: 18 }}></i></div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--bp-text)' }}>{pending}</div>
              <div style={{ fontSize: 12, color: 'var(--bp-text-faint)', marginTop: 4 }}>{t('admin.no_reply_label')}</div>
              <div style={{ fontSize: 12, color: pending > 0 ? '#f59e0b' : '#10b981', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                {pending > 0 ? <><i className="fas fa-exclamation-circle" style={{ fontSize: 9 }}></i> {t('admin.needs_attention')}</> : <><i className="fas fa-check-circle" style={{ fontSize: 9 }}></i> {t('admin.all_replied')}</>}
              </div>
            </div>
            <div className="rv-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><i className="fas fa-trophy" style={{ color: '#f59e0b', fontSize: 18 }}></i></div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--bp-text)' }}>{featured}</div>
              <div style={{ fontSize: 12, color: 'var(--bp-text-faint)', marginTop: 4 }}>{t('admin.featured_count_label')}</div>
              <div style={{ fontSize: 12, color: '#d4a574', marginTop: 6 }}><StarDisplay rating={Math.round(avg)} size={11} /></div>
            </div>
          </div>

          <div className="rv-panel" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--bp-border)', marginBottom: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexWrap: 'nowrap' }}>
              {[
                { id: 'all', label: t('notif.tab_all'), count: reviews.length },
                { id: 'pending', label: t('admin.no_reply_label'), count: pending },
                { id: 'featured', label: t('admin.tab_featured'), count: featured },
                { id: 'hidden', label: t('admin.tab_hidden'), count: reviews.filter(r => r.hidden).length },
              ].map(tab => (
                <button key={tab.id} className={`rv-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => { setActiveTab(tab.id); setPage(1); }} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {tab.label}
                  <span style={{ marginLeft: 6, background: activeTab === tab.id ? 'rgba(212,165,116,0.2)' : 'var(--bp-border)', color: activeTab === tab.id ? '#d4a574' : 'var(--bp-text-faint)', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{tab.count}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="rv-select" value={filterBarber} onChange={e => { setFilterBarber(e.target.value); setPage(1); }} style={{ flex: '1 1 110px' }}>
                <option value="">{t('booking.label_barber')}</option>
                {barbers.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select className="rv-select" value={filterService} onChange={e => { setFilterService(e.target.value); setPage(1); }} style={{ flex: '1 1 110px' }}>
                <option value="">{t('admin.table_service')}</option>
                {services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rv-select" value={filterRating} onChange={e => { setFilterRating(e.target.value); setPage(1); }} style={{ flex: '1 1 90px' }}>
                <option value="">{t('admin.filter_rating_placeholder')}</option>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
              <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <i className="fas fa-search" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--bp-text-faint)', fontSize: 12 }}></i>
                <input className="rpt-search" type="text" placeholder={t('admin.search_review_placeholder')} aria-label={t('admin.search_review_label')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ width: '100%' }} />
              </div>
              <select className="rv-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ flex: '1 1 140px' }}>
                <option value="recent">{t('admin.sort_most_recent')}</option>
                <option value="rating_desc">{t('admin.sort_highest_rating')}</option>
                <option value="rating_asc">{t('admin.sort_lowest_rating')}</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {pageRows.length === 0 ? (
              <div className="rv-panel" style={{ textAlign: 'center', padding: '48px 0' }}>
                <i className="fas fa-star" style={{ fontSize: 36, color: 'var(--bp-border2)', display: 'block', marginBottom: 12 }}></i>
                <p style={{ color: '#4b5563', fontSize: 14 }}>{t('admin.no_review_found')}</p>
              </div>
            ) : pageRows.map(review => (
              <ReviewCard key={review.id} review={review} onToggleFeatured={toggleFeatured} onToggleHidden={toggleHidden} />
            ))}
          </div>

          <div className="rpt-pagination">
            <div className="rpt-pag-info">{filtered.length === 0 ? t('admin.no_reviews') : t('admin.showing_reviews', { from: (safePage - 1) * PAGE_SIZE + 1, to: Math.min(safePage * PAGE_SIZE, filtered.length), total: filtered.length })}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="rpt-pg-btn" disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
              <button className="rpt-pg-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`rpt-pg-btn${p === safePage ? ' rpt-pg-btn-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="rpt-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>›</button>
              <button className="rpt-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        </div>
      );
    }

    /* ======================================================
       ADMIN — MÓDULOS (componente separado)
    ====================================================== */
    function useModStatus() {
      const { t } = useLang();
      return {
        ativo:   { label:t('admin.mod_status_active'),   bg:'rgba(16,185,129,0.12)',  border:'rgba(16,185,129,0.35)',  color:'#10b981' },
        inativo: { label:t('admin.mod_status_inactive'), bg:'rgba(107,114,128,0.08)', border:'rgba(107,114,128,0.2)', color:'var(--bp-text-faint)' },
        trial:   { label:t('admin.mod_status_trial'),    bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.35)', color:'#f59e0b' },
      };
    }
    function useModCats() {
      const { t } = useLang();
      return [
        { id:'todos',       label:t('admin.mod_cat_all'),          icon:'fa-th'           },
        { id:'core',        label:t('admin.mod_cat_core'),         icon:'fa-check-circle' },
        { id:'marketing',   label:t('admin.mod_cat_marketing'),    icon:'fa-rocket'       },
        { id:'operacional', label:t('admin.mod_cat_operational'),  icon:'fa-cogs'         },
        { id:'tech',        label:t('admin.mod_cat_tech'),         icon:'fa-microchip'    },
      ];
    }

    function ModulosTab({ modules, setModules, moduleFilter, setModuleFilter, showToast }) {
      const { t } = useLang();
      const MOD_STATUS = useModStatus();
      const MOD_CATS = useModCats();
      const active   = modules.filter(m => m.status === 'ativo').length;
      const trial    = modules.filter(m => m.status === 'trial').length;
      const inactive = modules.filter(m => m.status === 'inativo').length;
      const visible  = moduleFilter === 'todos' ? modules : modules.filter(m => m.cat === moduleFilter);

      const toggle = (id) => setModules(prev => prev.map(m => {
        if (m.id !== id) return m;
        if (m.status === 'ativo')   { showToast && showToast(t('admin.mod_deactivated_toast', { name: m.name }), 'info');    return { ...m, status:'inativo' }; }
        if (m.status === 'inativo') { showToast && showToast(t('admin.mod_activated_toast', { name: m.name }),    'success'); return { ...m, status:'ativo'   }; }
        if (m.status === 'trial')   { showToast && showToast(t('admin.mod_trial_ended_toast'),      'info');    return { ...m, status:'inativo' }; }
        return m;
      }));
      const buy = (m) => showToast && showToast(t('admin.mod_redirect_toast', { name: m.name }), 'success');

      return (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {[
                { key:'active',    label:t('admin.mod_stat_active'),    val:active,   color:'#10b981', icon:'fa-check-circle'  },
                { key:'trial',     label:t('admin.mod_stat_trial'),     val:trial,    color:'#f59e0b', icon:'fa-clock'         },
                { key:'available', label:t('admin.mod_stat_available'), val:inactive, color:'var(--bp-text-faint)', icon:'fa-puzzle-piece'  },
              ].map(c => (
                <div key={c.key} style={{ background:'var(--bp-panel)', border:'1px solid var(--bp-border)', borderRadius:12, padding:'10px 18px', display:'flex', alignItems:'center', gap:10 }}>
                  <i className={'fas ' + c.icon} style={{ color:c.color, fontSize:14 }}></i>
                  <div>
                    <p style={{ color:'var(--bp-text)', fontWeight:700, fontSize:18, margin:0, lineHeight:1 }}>{c.val}</p>
                    <p style={{ color:'var(--bp-text-faint)', fontSize:11, margin:'2px 0 0' }}>{c.label}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background:'linear-gradient(135deg,#1a1035,var(--bp-bg))', border:'1px solid rgba(139,92,246,0.35)', borderRadius:12, padding:'10px 18px', display:'flex', alignItems:'center', gap:10 }}>
              <i className="fas fa-store" style={{ color:'#8b5cf6', fontSize:16 }}></i>
              <div>
                <p style={{ color:'var(--bp-text)', fontWeight:700, fontSize:13, margin:0 }}>CS Barber Store</p>
                <p style={{ color:'#8b5cf6', fontSize:11, margin:0 }}>{t('admin.mod_store_subtitle')}</p>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
            {MOD_CATS.map(c => (
              <button key={c.id} onClick={() => setModuleFilter(c.id)}
                style={{ padding:'7px 16px', borderRadius:99, border:'1px solid ' + (moduleFilter===c.id ? '#d4a574' : 'var(--bp-border2)'), background: moduleFilter===c.id ? 'rgba(212,165,116,0.12)' : 'transparent', color: moduleFilter===c.id ? '#d4a574' : 'var(--bp-text-faint)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter, sans-serif', display:'flex', alignItems:'center', gap:6, transition:'all .15s' }}>
                <i className={'fas ' + c.icon} style={{ fontSize:10 }}></i>
                {c.label}
                <span style={{ background: moduleFilter===c.id ? 'rgba(212,165,116,0.2)' : 'var(--bp-border)', borderRadius:99, padding:'1px 7px', fontSize:10 }}>
                  {c.id==='todos' ? modules.length : modules.filter(m=>m.cat===c.id).length}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {visible.map(m => {
              const st = MOD_STATUS[m.status];
              const isCore = m.cat === 'core';
              return (
                <div key={m.id} style={{ background:'var(--bp-panel)', border:'1px solid ' + (m.status==='ativo' ? m.color+'44' : 'var(--bp-border)'), borderRadius:16, padding:20, display:'flex', flexDirection:'column', transition:'border-color .2s', position:'relative', overflow:'hidden' }}>
                  {m.status==='ativo' && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,' + m.color + ',' + m.color + '88)' }} />}
                  {m.status==='trial' && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,#f59e0b,#f59e0b88)' }} />}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:42, height:42, borderRadius:12, background:m.color+'22', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <i className={'fas ' + m.icon} style={{ color:m.color, fontSize:17 }}></i>
                      </div>
                      <div>
                        <p style={{ color:'var(--bp-text)', fontWeight:700, fontSize:14, margin:0 }}>{m.name}</p>
                        <span style={{ background:st.bg, border:'1px solid ' + st.border, color:st.color, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99 }}>{st.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {m.price === 0
                        ? <span style={{ color:'#10b981', fontWeight:700, fontSize:12 }}>{t('admin.mod_included')}</span>
                        : <p style={{ color:'var(--bp-text)', fontWeight:800, fontSize:15, margin:0 }}>R${m.price}<span style={{ color:'var(--bp-text-faint)', fontSize:11, fontWeight:400 }}>{t('admin.mod_per_month')}</span></p>
                      }
                    </div>
                  </div>
                  <p style={{ color:'var(--bp-text-muted)', fontSize:12, lineHeight:1.6, margin:'0 0 12px' }}>{m.desc}</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:16, flex:1 }}>
                    {m.features.map(f => (
                      <div key={f} style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <i className="fas fa-check" style={{ color:m.color, fontSize:9, flexShrink:0 }}></i>
                        <span style={{ color:'var(--bp-text-secondary)', fontSize:12 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {isCore ? (
                    <div style={{ padding:'8px 14px', borderRadius:9, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', textAlign:'center' }}>
                      <span style={{ color:'#10b981', fontSize:12, fontWeight:600 }}>
                        <i className="fas fa-lock-open" style={{ marginRight:6 }}></i>{t('admin.mod_always_active')}
                      </span>
                    </div>
                  ) : (m.status === 'ativo' || m.status === 'trial') ? (
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => toggle(m.id)} style={{ flex:1, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:9, color:'#ef4444', fontWeight:600, fontSize:12, padding:'9px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
                        <i className="fas fa-power-off" style={{ marginRight:6 }}></i>{t('admin.mod_deactivate')}
                      </button>
                      <button onClick={() => showToast && showToast(t('admin.mod_config_opened_toast'), 'success')} style={{ flex:2, background:m.color+'18', border:'1px solid ' + m.color + '44', borderRadius:9, color:m.color, fontWeight:600, fontSize:12, padding:'9px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
                        <i className="fas fa-cog" style={{ marginRight:6 }}></i>{t('admin.mod_configure')}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => toggle(m.id)} style={{ flex:1, background:'rgba(212,165,116,0.08)', border:'1px solid rgba(212,165,116,0.25)', borderRadius:9, color:'#d4a574', fontWeight:600, fontSize:12, padding:'9px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
                        <i className="fas fa-flask" style={{ marginRight:5 }}></i>{t('admin.mod_trial_7d')}
                      </button>
                      <button onClick={() => buy(m)} style={{ flex:2, background:'linear-gradient(135deg,#d4a574,#8b7355)', border:'none', borderRadius:9, color:'#000', fontWeight:700, fontSize:12, padding:'9px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
                        <i className="fas fa-shopping-cart" style={{ marginRight:6 }}></i>{t('admin.mod_hire_btn', { price: 'R$' + m.price })}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop:24, background:'linear-gradient(135deg,#1a1035,var(--bp-bg))', border:'1px solid rgba(139,92,246,0.3)', borderRadius:16, padding:'22px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:50, height:50, borderRadius:14, background:'rgba(139,92,246,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="fas fa-headset" style={{ color:'#8b5cf6', fontSize:22 }}></i>
              </div>
              <div>
                <p className="syne" style={{ color:'var(--bp-text)', fontWeight:800, fontSize:16, margin:0 }}>{t('admin.mod_custom_title')}</p>
                <p style={{ color:'var(--bp-text-muted)', fontSize:13, margin:'4px 0 0' }}>{t('admin.mod_custom_subtitle')}</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => showToast && showToast(t('admin.mod_whatsapp_toast'), 'success')} style={{ background:'rgba(37,211,102,0.12)', border:'1px solid rgba(37,211,102,0.3)', borderRadius:10, color:'#25d366', fontWeight:700, fontSize:13, padding:'11px 20px', cursor:'pointer', fontFamily:'Inter, sans-serif', display:'flex', alignItems:'center', gap:7 }}>
                <i className="fab fa-whatsapp" style={{ fontSize:16 }}></i>WhatsApp
              </button>
              <button onClick={() => showToast && showToast(t('admin.mod_plans_toast'), 'success')} style={{ background:'linear-gradient(135deg,#8b5cf6,#6d28d9)', border:'none', borderRadius:10, color:'var(--bp-text)', fontWeight:700, fontSize:13, padding:'11px 20px', cursor:'pointer', fontFamily:'Inter, sans-serif', display:'flex', alignItems:'center', gap:7 }}>
                <i className="fas fa-rocket" style={{ fontSize:13 }}></i>{t('admin.mod_view_plans')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    /* ======================================================
       ADMIN — CONFIGURAÇÕES
    ====================================================== */
    function AdminSettings({ showToast }) {
      const { t, lang } = useLang();
      /* ── estilos base ── */
      const IS = { width:'100%', background:'var(--bp-card)', border:'1px solid var(--bp-border2)', borderRadius:8, color:'var(--bp-text)', fontSize:13, padding:'9px 12px', outline:'none', boxSizing:'border-box', fontFamily:'Inter, sans-serif', transition:'border-color .15s' };
      const LS = { color:'var(--bp-text-muted)', fontSize:12, display:'block', marginBottom:6, fontWeight:500 };
      const SS = { ...IS, appearance:'none', cursor:'pointer', backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%236b7280' d='M5 7L0 2h10z'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center', paddingRight:32 };
      const F  = e => e.target.style.borderColor = '#d4a574';
      const B  = e => e.target.style.borderColor = 'var(--bp-border2)';
      const card  = { background:'var(--bp-panel)', border:'1px solid var(--bp-border)', borderRadius:16, padding:24 };
      const secH  = (icon, label, color='#d4a574') => (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, paddingBottom:14, borderBottom:'1px solid var(--bp-border)' }}>
          <div style={{ width:34, height:34, borderRadius:9, background:color+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className={`fas ${icon}`} style={{ color, fontSize:15 }}></i>
          </div>
          <span className="syne" style={{ color:'var(--bp-text)', fontWeight:700, fontSize:15 }}>{label}</span>
        </div>
      );

      const Toggle = ({ v, setV, label, sub }) => (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--bp-border)' }}>
          <div>
            <p style={{ color:'var(--bp-text-secondary)', fontSize:13, margin:0, fontWeight:500 }}>{label}</p>
            {sub && <p style={{ color:'#4b5563', fontSize:11, margin:'2px 0 0' }}>{sub}</p>}
          </div>
          <div onClick={() => setV(!v)} style={{ width:46, height:26, borderRadius:13, background: v ? '#d4a574' : 'var(--bp-border2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:4, left: v ? 24 : 4, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.4)' }}/>
          </div>
        </div>
      );

      const SaveBtn = ({ label=t('common.save'), onClick, color='gold', icon='fa-save' }) => {
        const bg = color==='red' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'linear-gradient(135deg,#d4a574,#8b7355)';
        const fc = color==='red' ? 'var(--bp-text)' : '#000';
        return <button onClick={onClick} style={{ background:bg, border:'none', borderRadius:10, color:fc, fontWeight:700, fontSize:13, padding:'11px 20px', cursor:'pointer', fontFamily:'Inter, sans-serif', display:'flex', alignItems:'center', gap:7 }}><i className={`fas ${icon}`}></i>{label}</button>;
      };

      const Field = ({ label, value, onChange, type='text', placeholder='', half=false }) => (
        <div style={{ marginBottom:14, gridColumn: half ? '' : 'span 2' }}>
          <label style={LS}>{label}</label>
          <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={IS} onFocus={F} onBlur={B} />
        </div>
      );

      const Sel = ({ label, value, onChange, options }) => (
        <div style={{ marginBottom:14 }}>
          <label style={LS}>{label}</label>
          <select value={value} onChange={e => onChange(e.target.value)} style={SS}>
            {options.map(o => <option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
          </select>
        </div>
      );

      /* ── estado: abas ── */
      const TABS = [
        { id:'estabelecimento', icon:'fa-store',         label:t('admin.tab_establishment') },
        { id:'agendamentos',    icon:'fa-calendar-check',label:t('admin.tab_appointments_settings') },
        { id:'pagamentos',      icon:'fa-credit-card',   label:t('admin.tab_payments')       },
        { id:'notificacoes',    icon:'fa-bell',          label:t('admin.tab_notifications')  },
        { id:'aparencia',       icon:'fa-palette',       label:t('admin.tab_appearance')     },
        { id:'integrações',     icon:'fa-plug',          label:t('admin.tab_integrations')   },
        { id:'seguranca',       icon:'fa-shield-alt',    label:t('admin.tab_security')       },
        { id:'modulos',         icon:'fa-puzzle-piece',  label:t('admin.tab_modules')        },
        { id:'indicacao',       icon:'fa-user-plus',     label:t('admin.tab_referrals')       },
        { id:'sistema',         icon:'fa-server',        label:t('admin.tab_system')         },
      ];
      const [tab, setTab] = useState('estabelecimento');

      /* ── estado: estabelecimento ── */
      const [shopName,    setShopName]    = useState('BarberPro Clássica');
      const [shopSlug,    setShopSlug]    = useState('barberpro-classica');
      const [shopDesc,    setShopDesc]    = useState('A barbearia mais inovadora da região. Atendimento premium, ambiente exclusivo.');
      const [shopPhone,   setShopPhone]   = useState('+55 11 98765-4321');
      const [shopEmail,   setShopEmail]   = useState('contato@barberpro.com');
      const [shopSite,    setShopSite]    = useState('https://barberpro.com.br');
      const [shopAddr,    setShopAddr]    = useState('Rua das Flores, 123 — São Paulo, SP');
      const [shopInsta,   setShopInsta]   = useState('@barberpro.oficial');
      const [shopWhats,   setShopWhats]   = useState('+55 11 99999-9999');
      const [shopFacebook, setShopFacebook] = useState('');
      const [shopTiktok,   setShopTiktok]   = useState('');
      const [timezone,    setTimezone]    = useState('America/Sao_Paulo');
      const [currency,    setCurrency]    = useState('BRL');

      /* ── estado: agendamentos ── */
      const [slotDuration,   setSlotDuration]   = useState('30');
      const [leadMin,        setLeadMin]        = useState('60');
      const [leadMax,        setLeadMax]        = useState('30');
      const [cancelHours,    setCancelHours]    = useState('24');
      const [maxPerDay,      setMaxPerDay]      = useState('20');
      const [allowWaitlist,  setAllowWaitlist]  = useState(true);
      const [autoConfirm,    setAutoConfirm]    = useState(true);
      const [allowReschedule,setAllowReschedule]= useState(true);
      const [multiService,   setMultiService]   = useState(true);
      const [bufferTime,     setBufferTime]     = useState('10');
      const [cancelPolicy,   setCancelPolicy]   = useState('Taxa de 50% para cancelamentos tardios');

      /* ── estado: pagamentos ── */
      const [payPix,     setPayPix]     = useState(true);
      const [payCash,    setPayCash]    = useState(true);
      const [payCredit,  setPayCredit]  = useState(true);
      const [payDebit,   setPayDebit]   = useState(true);
      const [payVoucher, setPayVoucher] = useState(false);
      const [payOnline,  setPayOnline]  = useState(false);
      const [commission, setCommission] = useState('40');
      const [cancelFee,  setCancelFee]  = useState('50');
      const [pixKey,     setPixKey]     = useState('contato@barberpro.com');
      const [mpToken,    setMpToken]    = useState('');

      /* ── estado: notificações ── */
      const [notifNewAppt,   setNotifNewAppt]   = useState(true);
      const [notifConfirm,   setNotifConfirm]   = useState(true);
      const [notifCancel,    setNotifCancel]    = useState(true);
      const [notifReminder,  setNotifReminder]  = useState(true);
      const [notifReview,    setNotifReview]    = useState(true);
      const [notifBirthday,  setNotifBirthday]  = useState(true);
      const [reminderH,      setReminderH]      = useState('24');
      const [reminderH2,     setReminderH2]     = useState('2');
      const [channelEmail,   setChannelEmail]   = useState(true);
      const [channelWhats,   setChannelWhats]   = useState(false);
      const [channelSMS,     setChannelSMS]     = useState(false);
      const [channelPush,    setChannelPush]    = useState(true);
      const [waMsgAppt,      setWaMsgAppt]      = useState('Olá {nome}! Seu agendamento para {servico} está confirmado para {data} às {hora} com {barbeiro}. 💈');
      const [waMsgReminder,  setWaMsgReminder]  = useState('Lembrete: você tem um agendamento amanhã às {hora} na BarberPro. Até lá! ✂️');

      /* ── estado: integrações ── */
      const [googleCal,  setGoogleCal]  = useState(false);
      const [googleBiz,  setGoogleBiz]  = useState(false);
      const [instaBio,   setInstaBio]   = useState(false);
      const [waApi,      setWaApi]      = useState(false);
      const [waApiKey,   setWaApiKey]   = useState('');
      const [ifoodKey,   setIfoodKey]   = useState('');
      const [zapierHook, setZapierHook] = useState('');

      /* ── estado: segurança ── */
      const [twoFA,       setTwoFA]       = useState(false);
      const [sessionTime, setSessionTime] = useState('480');
      const [ipWhitelist, setIpWhitelist] = useState('');
      const [auditLog,    setAuditLog]    = useState(true);
      const [oldPass,     setOldPass]     = useState('');
      const [newPass,     setNewPass]     = useState('');
      const [confPass,    setConfPass]    = useState('');
      const [showPasses,  setShowPasses]  = useState(false);

      /* ── estado: módulos ── */
      const [moduleFilter, setModuleFilter] = useState('todos');
      const [modules, setModules] = useState([
        { id:'agend-basico',   cat:'core',      status:'ativo',   name:'Agendamentos Básicos',       icon:'fa-calendar-check', color:'#10b981', price:0,    desc:'Agendamentos ilimitados, gestão de horários e status. Incluído em todos os planos.', features:['Agendamentos ilimitados','Calendário do barbeiro','Status de atendimento','Histórico de clientes'] },
        { id:'clientes',       cat:'core',      status:'ativo',   name:'Cadastro de Clientes',       icon:'fa-users',          color:'#10b981', price:0,    desc:'Cadastro completo de clientes com histórico e preferências. Incluído em todos os planos.', features:['Perfil completo','Histórico de serviços','Preferências salvas','Foto de perfil'] },
        { id:'barbeiros',      cat:'core',      status:'ativo',   name:'Gestão de Barbeiros',        icon:'fa-user-tie',       color:'#10b981', price:0,    desc:'Cadastro, perfil e agenda individual por barbeiro. Incluído em todos os planos.', features:['Perfil público','Agenda individual','Controle de horários','Avaliações básicas'] },
        { id:'relatorios-b',   cat:'core',      status:'ativo',   name:'Relatórios Básicos',         icon:'fa-chart-bar',      color:'#10b981', price:0,    desc:'Visão geral de faturamento, agendamentos e clientes.', features:['Resumo diário','Top serviços','Total de atendimentos','Exportar CSV'] },
        { id:'fidelidade',     cat:'marketing', status:'inativo', name:'Programa de Fidelidade',     icon:'fa-star',           color:'#f59e0b', price:49,   desc:'Sistema de pontos, cashback e recompensas automáticas para reter e engajar clientes.', features:['Pontos por serviço','Troca por desconto','Ranking de clientes','Cupons automáticos no aniversário'] },
        { id:'marketing',      cat:'marketing', status:'trial',   name:'Marketing Automatizado',     icon:'fa-bullhorn',       color:'#f59e0b', price:79,   desc:'Campanhas automáticas de reativação, promoções sazonais e segmentação de clientes inativos.', features:['Clientes inativos +30 dias','Campanhas por WhatsApp/Email','Promoções sazonais automáticas','Segmentação por histórico'] },
        { id:'reviews',        cat:'marketing', status:'inativo', name:'Avaliações & Reputação',     icon:'fa-comments',       color:'#f59e0b', price:29,   desc:'Solicite avaliações automaticamente após cada atendimento e gerencie sua reputação online.', features:['Solicitação automática pós-serviço','Resposta do barbeiro','Integração Google Reviews','Widget de avaliações no site'] },
        { id:'cardapio',       cat:'marketing', status:'inativo', name:'Cardápio Digital / Totem',   icon:'fa-tablet-alt',     color:'#f59e0b', price:39,   desc:'Tela de autoatendimento para recepção ou tablet na barbearia. Clientes agendam sozinhos.', features:['Interface para touch screen','Check-in de chegada','Fila de espera visual','Modo kiosk (fullscreen)'] },
        { id:'relatorios-a',   cat:'operacional',status:'inativo',name:'Relatórios Avançados',       icon:'fa-chart-line',     color:'#3b82f6', price:59,   desc:'Dashboards detalhados com projeções financeiras, metas, comparativos e exportação completa.', features:['Projeção de faturamento','Metas por barbeiro','Comparativo mensal/anual','Exportar PDF profissional'] },
        { id:'comandas',       cat:'operacional',status:'inativo',name:'Comandas Digitais',           icon:'fa-receipt',        color:'#3b82f6', price:39,   desc:'Registre consumo de produtos (pomadas, shampoo etc.) durante o atendimento diretamente no sistema.', features:['Adição de produtos na comanda','Estoque vinculado','Total automático','Histórico por atendimento'] },
        { id:'estoque',        cat:'operacional',status:'inativo',name:'Controle de Estoque',         icon:'fa-box',            color:'#3b82f6', price:49,   desc:'Gerencie produtos e insumos da barbearia com alertas de reposição e relatório de consumo.', features:['Cadastro de produtos','Alerta de estoque mínimo','Relatório de consumo','Vinculação com comandas'] },
        { id:'multi-unidade',  cat:'operacional',status:'inativo',name:'Multi-Unidade',               icon:'fa-building',       color:'#3b82f6', price:149,  desc:'Gerencie múltiplas unidades da barbearia em um único painel administrativo centralizado.', features:['Painel unificado','Relatórios por unidade','Transferência de clientes','Barbeiros por unidade'] },
        { id:'whatsapp',       cat:'tech',      status:'inativo', name:'WhatsApp Business API',      icon:'fa-whatsapp',       color:'#25d366', price:89,   desc:'Envio automático de confirmações, lembretes e promoções via WhatsApp com número profissional.', features:['Confirmação automática','2 lembretes configuráveis','Mensagem de aniversário','Suporte via chat no app'] },
        { id:'app-branco',     cat:'tech',      status:'inativo', name:'App com Sua Marca',          icon:'fa-mobile-alt',     color:'#8b5cf6', price:299,  desc:'Aplicativo iOS e Android personalizado com logo, cores e nome da sua barbearia na loja de apps.', features:['iOS + Android','Sua marca e cores','Notificações push','Publicação nas lojas'] },
        { id:'nfe',            cat:'tech',      status:'inativo', name:'Nota Fiscal Eletrônica',     icon:'fa-file-invoice',   color:'#8b5cf6', price:69,   desc:'Emissão automática de NF-e e NFS-e integrada ao agendamento. Conformidade fiscal completa.', features:['NF-e e NFS-e automáticas','CNPJ configurável','Envio por email','Arquivo XML/PDF'] },
        { id:'api-publica',    cat:'tech',      status:'inativo', name:'API Pública',                icon:'fa-code',           color:'#8b5cf6', price:199,  desc:'Acesso à API REST do CS Barber para integrações personalizadas com sistemas próprios.', features:['REST API completa','Autenticação OAuth2','Webhooks ilimitados','Documentação Swagger'] },
        { id:'crm',            cat:'tech',      status:'inativo', name:'CRM Avançado',               icon:'fa-address-book',   color:'#8b5cf6', price:99,   desc:'Segmentação avançada de clientes, funil de retenção, tags personalizadas e automações.', features:['Tags de clientes','Funil de retenção','Histórico 360°','Automações por comportamento'] },
      ]);

      /* ── estado: sistema ── */
      const [backupFreq,   setBackupFreq]   = useState('Diário');
      const [backupEmail,  setBackupEmail]  = useState('admin@barberpro.com');
      const [dataRetention,setDataRetention]= useState('365');
      const [maintenanceMode, setMaintenanceMode] = useState(false);
      const [systemInfo, setSystemInfo] = useState(null);
      const [systemLog, setSystemLogState] = useState([]);
      const [clearingLog, setClearingLog] = useState(false);

      const loadSystemInfo = async () => {
        const [infoRes, logRes] = await Promise.all([apiCall('GET', '/admin/system-info'), apiCall('GET', '/admin/system-log')]);
        if (infoRes.ok) setSystemInfo(infoRes.data);
        if (logRes.ok) setSystemLogState(logRes.data);
      };
      useEffect(() => { loadSystemInfo(); }, []);

      const fmtUptime = (s) => {
        if (!s) return '—';
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}min` : `${m}min`;
      };

      const logLines = systemLog.map(l => `[${new Date(l.time).toLocaleString(localeTag(lang))}] ${l.level.padEnd(5)} — ${l.message}`);

      const clearSystemLog = async () => {
        setClearingLog(true);
        const res = await apiCall('DELETE', '/admin/system-log');
        setClearingLog(false);
        if (res.ok) { setSystemLogState([]); showToast && showToast(t('admin.log_cleared_toast'), 'success'); }
        else showToast && showToast(t('admin.err_clear_log'), 'error');
      };

      const exportSystemLog = () => {
        const content = logLines.length ? logLines.join('\n') : t('admin.no_event_logged');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `system-log-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast && showToast(t('admin.log_exported_toast'), 'success');
      };

      /* ── estado: indicação ── */
      // Default true (habilitado) espelha o isSettingEnabled do back-end: chave ausente = ativo.
      const [referralEnabled, setReferralEnabled] = useState(true);
      const [referralBonusReferrer, setReferralBonusReferrer] = useState('');
      const [referralBonusReferred, setReferralBonusReferred] = useState('');

      /* ── estado: aparência ── */
      const [theme, setThemeState] = useState('dark');
      const [savingTheme, setSavingTheme] = useState(false);
      const [loadingSettings, setLoadingSettings] = useState(true);
      const [savingKeys, setSavingKeys] = useState(false);

      useEffect(() => {
        (async () => {
          const [settingsRes, meRes] = await Promise.all([apiCall('GET', '/settings'), apiCall('GET', '/me')]);
          if (settingsRes.ok) {
            const s = settingsRes.data;
            const str = (setter, key, fallback) => { if (s[key] !== undefined) setter(s[key]); else if (fallback !== undefined) setter(fallback); };
            const bool = (setter, key) => { if (s[key] !== undefined) setter(s[key] === 'true'); };
            str(setShopName, 'shop_name'); str(setShopSlug, 'shop_slug'); str(setShopDesc, 'shop_desc');
            str(setShopPhone, 'shop_phone'); str(setShopEmail, 'shop_email'); str(setShopSite, 'shop_site');
            str(setShopAddr, 'shop_addr'); str(setShopInsta, 'shop_insta'); str(setShopWhats, 'shop_whats');
            str(setShopFacebook, 'shop_facebook'); str(setShopTiktok, 'shop_tiktok');
            str(setTimezone, 'timezone'); str(setCurrency, 'currency');
            str(setSlotDuration, 'slot_duration'); str(setLeadMin, 'lead_min'); str(setLeadMax, 'lead_max');
            str(setCancelHours, 'cancel_hours'); str(setMaxPerDay, 'max_per_day'); str(setBufferTime, 'buffer_time');
            str(setCancelPolicy, 'cancel_policy');
            bool(setAllowWaitlist, 'allow_waitlist'); bool(setAutoConfirm, 'auto_confirm');
            bool(setAllowReschedule, 'allow_reschedule'); bool(setMultiService, 'multi_service');
            bool(setPayPix, 'pay_pix'); bool(setPayCash, 'pay_cash'); bool(setPayCredit, 'pay_credit');
            bool(setPayDebit, 'pay_debit'); bool(setPayVoucher, 'pay_voucher'); bool(setPayOnline, 'pay_online');
            str(setCommission, 'commission'); str(setCancelFee, 'cancel_fee'); str(setPixKey, 'pix_key'); str(setMpToken, 'mp_token');
            bool(setNotifNewAppt, 'notif_new_appt'); bool(setNotifConfirm, 'notif_confirm'); bool(setNotifCancel, 'notif_cancel');
            bool(setNotifReminder, 'notif_reminder'); bool(setNotifReview, 'notif_review'); bool(setNotifBirthday, 'notif_birthday');
            str(setReminderH, 'reminder_h'); str(setReminderH2, 'reminder_h2');
            bool(setChannelEmail, 'channel_email'); bool(setChannelWhats, 'channel_whats');
            bool(setChannelSMS, 'channel_sms'); bool(setChannelPush, 'channel_push');
            str(setWaMsgAppt, 'wa_msg_appt'); str(setWaMsgReminder, 'wa_msg_reminder');
            bool(setGoogleCal, 'google_cal'); bool(setGoogleBiz, 'google_biz');
            bool(setInstaBio, 'insta_bio'); bool(setWaApi, 'wa_api');
            str(setWaApiKey, 'wa_api_key'); str(setZapierHook, 'zapier_hook');
            if (s.referral_enabled !== undefined) setReferralEnabled(s.referral_enabled === 'true');
            str(setReferralBonusReferrer, 'referral_bonus_referrer'); str(setReferralBonusReferred, 'referral_bonus_referred');
          }
          if (meRes.ok) setThemeState(meRes.data.theme || 'dark');
          setLoadingSettings(false);
        })();
      }, []);

      const saveSettings = async (obj, msg) => {
        setSavingKeys(true);
        const payload = {};
        Object.keys(obj).forEach(k => { payload[k] = typeof obj[k] === 'boolean' ? String(obj[k]) : (obj[k] ?? ''); });
        const res = await apiCall('PATCH', '/settings', payload);
        setSavingKeys(false);
        if (res.ok) showToast && showToast(msg || t('admin.settings_saved_toast'), 'success');
        else showToast && showToast(res.data?.error || t('admin.err_save_settings'), 'error');
        return res;
      };

      const handleThemeChange = async (value) => {
        setThemeState(value);
        setSavingTheme(true);
        applyTheme(value);
        const res = await apiCall('PATCH', '/me', { theme: value });
        setSavingTheme(false);
        if (res.ok) {
          updateStoredUser({ theme: value });
          showToast && showToast(t('admin.theme_updated_toast'), 'success');
        } else {
          showToast && showToast(res.data?.error || t('admin.err_save_theme'), 'error');
        }
      };

      const save = (msg) => showToast && showToast(msg || t('admin.settings_saved_toast'), 'success');

      const downloadBackup = async () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const res = await fetch('/api/admin/backup', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!res.ok) { showToast && showToast(t('admin.err_generate_backup'), 'error'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `barberpro-backup-${new Date().toISOString().slice(0, 10)}.db`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast && showToast(t('admin.backup_downloaded_toast'), 'success');
      };

      const exportAllCSV = async () => {
        const res = await apiCall('GET', '/appointments');
        if (!res.ok) { showToast && showToast(t('admin.err_export_data'), 'error'); return; }
        const headers = [t('booking.label_date'), t('admin.csv_hour'), t('admin.table_client'), t('admin.table_barber'), t('admin.table_service'), t('admin.csv_value'), t('admin.table_status')];
        const rows = res.data.map(a => [
          fmtDate(a.appointment_date), a.appointment_time || '', a.client_name || '', a.barber_name || '', a.service_name || '',
          (Number(a.price) || 0).toFixed(2).replace('.', ','), statusLabel(a.status)
        ]);
        const csvLines = [headers, ...rows].map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(';'));
        const csvContent = '﻿' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `agendamentos-completo-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast && showToast(t('admin.csv_exported_toast'), 'success');
      };

      const exportFullReportPDF = async () => {
        const [statsRes, aptsRes] = await Promise.all([apiCall('GET', '/dashboard/stats'), apiCall('GET', '/appointments')]);
        if (!statsRes.ok || !aptsRes.ok) { showToast && showToast(t('admin.err_generate_report'), 'error'); return; }
        const stats = statsRes.data;
        const apts = aptsRes.data;
        const rowsHtml = apts.map(a => `<tr><td>${fmtDate(a.appointment_date)}</td><td>${a.appointment_time || ''}</td><td>${a.client_name || ''}</td><td>${a.barber_name || ''}</td><td>${a.service_name || ''}</td><td>${fmtCur(a.price)}</td><td>${statusLabel(a.status)}</td></tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t('admin.pdf_report_title')}</title>
          <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f3f3f3}.stats{display:flex;gap:24px;margin:16px 0}.stat{border:1px solid #ccc;padding:10px 14px;border-radius:8px}</style>
          </head><body>
          <h1>${t('admin.pdf_report_h1')}</h1>
          <p>${t('admin.pdf_generated_on', { date: new Date().toLocaleString(localeTag(lang)) })}</p>
          <div class="stats">
            <div class="stat"><strong>${stats.total_clients ?? '—'}</strong><br>${t('admin.pdf_clients')}</div>
            <div class="stat"><strong>${stats.completed_appointments ?? '—'}</strong><br>${t('admin.pdf_completed_appts')}</div>
            <div class="stat"><strong>${stats.pending_appointments ?? '—'}</strong><br>${t('admin.pdf_pending')}</div>
            <div class="stat"><strong>${fmtCur(stats.revenue || 0)}</strong><br>${t('admin.pdf_revenue_30d')}</div>
          </div>
          <table><thead><tr><th>${t('booking.label_date')}</th><th>${t('admin.csv_hour')}</th><th>${t('admin.table_client')}</th><th>${t('admin.table_barber')}</th><th>${t('admin.table_service')}</th><th>${t('admin.csv_value')}</th><th>${t('admin.table_status')}</th></tr></thead>
          <tbody>${rowsHtml}</tbody></table>
          <script>window.onload = function(){ window.print(); };</script>
          </body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (!w) { showToast && showToast(t('admin.allow_popups_error'), 'error'); URL.revokeObjectURL(url); return; }
        showToast && showToast(t('admin.report_generated_toast'), 'success');
      };

      return (
        <div>

          {/* Cabeçalho */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:42, height:42, borderRadius:12, background:'rgba(212,165,116,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="fas fa-cog" style={{ color:'#d4a574', fontSize:18 }}></i>
              </div>
              <div>
                <h2 className="syne" style={{ color:'var(--bp-text)', fontSize:22, fontWeight:800, margin:0 }}>{t('admin.settings_title')}</h2>
                <p style={{ color:'var(--bp-text-faint)', fontSize:12, margin:0 }}>{t('admin.settings_subtitle')}</p>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:8, padding:'6px 14px' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#10b981', display:'inline-block' }}></span>
              <span style={{ color:'#10b981', fontSize:12, fontWeight:600 }}>{t('admin.system_active_badge')}</span>
            </div>
          </div>

          {/* Abas */}
          <div className="admin-settings-tabs" style={{ display:'flex', gap:4, marginBottom:24, overflowX:'auto', background:'var(--bp-panel)', borderRadius:14, padding:6, border:'1px solid var(--bp-border)' }}>
            {TABS.map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                style={{ flex:'0 0 auto', minWidth:100, padding:'9px 10px', borderRadius:10, border:'none', background: tab===tb.id ? 'linear-gradient(135deg,#d4a574,#8b7355)' : 'transparent', color: tab===tb.id ? '#000' : 'var(--bp-text-faint)', fontWeight: tab===tb.id ? 700 : 500, fontSize:12, cursor:'pointer', fontFamily:'Inter, sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all .15s', whiteSpace:'nowrap' }}>
                <i className={`fas ${tb.icon}`} style={{ fontSize:11 }}></i>{tb.label}
              </button>
            ))}
          </div>

          {/* ══════════════ ABA: ESTABELECIMENTO ══════════════ */}
          {tab==='estabelecimento' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-store',t('admin.identity_title'))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div style={{ gridColumn:'span 2' }}>
                    <label style={LS}>{t('admin.shop_name_label')}</label>
                    <input value={shopName} onChange={e=>setShopName(e.target.value)} style={IS} onFocus={F} onBlur={B} />
                  </div>
                  <div>
                    <label style={LS}>{t('admin.slug_label')}</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#4b5563', fontSize:12 }}>barberpro.com/</span>
                      <input value={shopSlug} onChange={e=>setShopSlug(e.target.value)} style={{ ...IS, paddingLeft:110 }} onFocus={F} onBlur={B} />
                    </div>
                  </div>
                  <div>
                    <label style={LS}>{t('admin.timezone_label')}</label>
                    <select value={timezone} onChange={e=>setTimezone(e.target.value)} style={SS}>
                      {['America/Sao_Paulo','America/Manaus','America/Belem','America/Fortaleza','America/Recife','America/Cuiaba','America/Porto_Velho','America/Boa_Vista','America/Noronha'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn:'span 2' }}>
                    <label style={LS}>{t('admin.desc_slogan_label')}</label>
                    <textarea value={shopDesc} onChange={e=>setShopDesc(e.target.value)} rows={3} style={{ ...IS, resize:'vertical', lineHeight:1.6 }} onFocus={F} onBlur={B} />
                  </div>
                  <div>
                    <label style={LS}>{t('admin.currency_label')}</label>
                    <select value={currency} onChange={e=>setCurrency(e.target.value)} style={SS}>
                      <option value="BRL">{t('admin.currency_brl')}</option>
                      <option value="USD">{t('admin.currency_usd')}</option>
                      <option value="EUR">{t('admin.currency_eur')}</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_identity')} onClick={()=>saveSettings({ shop_name: shopName, shop_slug: shopSlug, shop_desc: shopDesc, timezone, currency }, t('admin.identity_saved_toast'))} /></div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={card}>
                  {secH('fa-map-marker-alt',t('admin.contact_address_title'),'#3b82f6')}
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <div><label style={LS}>{t('admin.phone_whatsapp_label')}</label><input value={shopPhone} onChange={e=>setShopPhone(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                    <div><label style={LS}>{t('admin.contact_email_label')}</label><input value={shopEmail} onChange={e=>setShopEmail(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                    <div><label style={LS}>{t('admin.site_label')}</label><input value={shopSite} onChange={e=>setShopSite(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                    <div><label style={LS}>{t('admin.full_address_label')}</label><input value={shopAddr} onChange={e=>setShopAddr(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div><label style={LS}>{t('admin.instagram_label')}</label><input value={shopInsta} onChange={e=>setShopInsta(e.target.value)} style={IS} placeholder="@perfil" onFocus={F} onBlur={B} /></div>
                      <div><label style={LS}>{t('admin.whatsapp_business_label2')}</label><input value={shopWhats} onChange={e=>setShopWhats(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                      <div><label style={LS}>{t('admin.facebook_label')}</label><input value={shopFacebook} onChange={e=>setShopFacebook(e.target.value)} style={IS} placeholder="@perfil ou link" onFocus={F} onBlur={B} /></div>
                      <div><label style={LS}>{t('admin.tiktok_label')}</label><input value={shopTiktok} onChange={e=>setShopTiktok(e.target.value)} style={IS} placeholder="@perfil" onFocus={F} onBlur={B} /></div>
                    </div>
                  </div>
                  <div style={{ marginTop:16 }}><SaveBtn label={t('admin.save_contact')} onClick={()=>saveSettings({ shop_phone: shopPhone, shop_email: shopEmail, shop_site: shopSite, shop_addr: shopAddr, shop_insta: shopInsta, shop_whats: shopWhats, shop_facebook: shopFacebook, shop_tiktok: shopTiktok }, t('admin.contact_saved_toast'))} /></div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: AGENDAMENTOS ══════════════ */}
          {tab==='agendamentos' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-clock',t('admin.time_rules_title'))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:4 }}>
                  <div><label style={LS}>{t('admin.default_slot_duration_label')}</label><input type="number" value={slotDuration} onChange={e=>setSlotDuration(e.target.value)} style={IS} min={5} max={120} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.buffer_time_label')}</label><input type="number" value={bufferTime} onChange={e=>setBufferTime(e.target.value)} style={IS} min={0} max={60} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.min_lead_label')}</label><input type="number" value={leadMin} onChange={e=>setLeadMin(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.max_lead_label')}</label><input type="number" value={leadMax} onChange={e=>setLeadMax(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.cancel_until_label')}</label><input type="number" value={cancelHours} onChange={e=>setCancelHours(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.max_per_day_label')}</label><input type="number" value={maxPerDay} onChange={e=>setMaxPerDay(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                </div>
                <div style={{ marginTop:16 }}>
                  <label style={LS}>{t('admin.cancel_policy_label')}</label>
                  <textarea value={cancelPolicy} onChange={e=>setCancelPolicy(e.target.value)} rows={3} style={{ ...IS, resize:'vertical', lineHeight:1.6 }} onFocus={F} onBlur={B} />
                </div>
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_rules')} onClick={()=>saveSettings({ slot_duration: slotDuration, buffer_time: bufferTime, lead_min: leadMin, lead_max: leadMax, cancel_hours: cancelHours, max_per_day: maxPerDay, cancel_policy: cancelPolicy }, t('admin.rules_saved_toast'))} /></div>
              </div>

              <div style={card}>
                {secH('fa-sliders-h',t('admin.system_behavior_title'),'#10b981')}
                <Toggle v={autoConfirm}    setV={setAutoConfirm}    label={t('admin.auto_confirm_label')}           sub={t('admin.auto_confirm_sub')} />
                <Toggle v={allowWaitlist}  setV={setAllowWaitlist}  label={t('admin.waitlist_label')}                  sub={t('admin.waitlist_sub')} />
                <Toggle v={allowReschedule}setV={setAllowReschedule}label={t('admin.allow_reschedule_label')}  sub={t('admin.allow_reschedule_sub')} />
                <Toggle v={multiService}   setV={setMultiService}   label={t('admin.multi_service_label')} sub={t('admin.multi_service_sub')} />
                <div style={{ marginTop:20 }}>
                  <label style={LS}>{t('admin.welcome_msg_label')}</label>
                  <textarea defaultValue={t('admin.default_welcome_msg')} rows={3} style={{ ...IS, resize:'vertical', lineHeight:1.6 }} onFocus={F} onBlur={B} />
                </div>
                <div style={{ marginTop:16 }}>
                  <label style={LS}>{t('admin.reminder_msg_default_label')}</label>
                  <textarea defaultValue={t('admin.default_reminder_msg')} rows={3} style={{ ...IS, resize:'vertical', lineHeight:1.6 }} onFocus={F} onBlur={B} />
                </div>
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_behavior')} onClick={()=>saveSettings({ auto_confirm: autoConfirm, allow_waitlist: allowWaitlist, allow_reschedule: allowReschedule, multi_service: multiService }, t('admin.behavior_saved_toast'))} /></div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: PAGAMENTOS ══════════════ */}
          {tab==='pagamentos' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-money-bill-wave',t('admin.payment_methods_title'))}
                {[
                  { key:'pix',     v:payPix,     setV:setPayPix,     icon:'fa-qrcode',      label:'PIX',               sub:t('admin.pix_sub'), color:'#10b981' },
                  { key:'cash',    v:payCash,    setV:setPayCash,     icon:'fa-money-bill',  label:t('admin.cash_label'),           sub:t('admin.cash_sub'), color:'var(--bp-text-faint)' },
                  { key:'credit',  v:payCredit,  setV:setPayCredit,   icon:'fa-credit-card', label:t('admin.credit_card_label'),  sub:t('admin.credit_card_sub'), color:'#3b82f6' },
                  { key:'debit',   v:payDebit,   setV:setPayDebit,    icon:'fa-credit-card', label:t('admin.debit_card_label'),   sub:t('admin.debit_card_sub'), color:'#8b5cf6' },
                  { key:'voucher', v:payVoucher, setV:setPayVoucher,  icon:'fa-ticket-alt',  label:t('admin.voucher_label'), sub:t('admin.voucher_sub'), color:'#f59e0b' },
                  { key:'online',  v:payOnline,  setV:setPayOnline,   icon:'fa-globe',       label:t('admin.online_payment_label'), sub:t('admin.online_payment_sub'), color:'#d4a574' },
                ].map(item => (
                  <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--bp-border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:8, background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className={`fas ${item.icon}`} style={{ color:item.color, fontSize:12 }}></i>
                      </div>
                      <div>
                        <p style={{ color:'var(--bp-text-secondary)', fontSize:13, margin:0, fontWeight:500 }}>{item.label}</p>
                        <p style={{ color:'#4b5563', fontSize:11, margin:0 }}>{item.sub}</p>
                      </div>
                    </div>
                    <div onClick={()=>item.setV(!item.v)} style={{ width:46, height:26, borderRadius:13, background:item.v ? '#d4a574' : 'var(--bp-border2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:4, left:item.v?24:4, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.4)' }}/>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_methods')} onClick={()=>saveSettings({ pay_pix: payPix, pay_cash: payCash, pay_credit: payCredit, pay_debit: payDebit, pay_voucher: payVoucher, pay_online: payOnline }, t('admin.methods_saved_toast'))} /></div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={card}>
                  {secH('fa-percentage',t('admin.commissions_fees_title'),'#f59e0b')}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div><label style={LS}>{t('admin.commission_label')}</label><input type="number" value={commission} onChange={e=>setCommission(e.target.value)} style={IS} min={0} max={100} onFocus={F} onBlur={B} /></div>
                    <div><label style={LS}>{t('admin.cancel_fee_label')}</label><input type="number" value={cancelFee} onChange={e=>setCancelFee(e.target.value)} style={IS} min={0} max={100} onFocus={F} onBlur={B} /></div>
                  </div>
                  <div style={{ marginTop:12 }}>
                    <label style={LS}>{t('admin.pix_key_label')}</label>
                    <input value={pixKey} onChange={e=>setPixKey(e.target.value)} placeholder={t('admin.pix_key_placeholder')} style={IS} onFocus={F} onBlur={B} />
                  </div>
                  <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_financial')} onClick={()=>saveSettings({ commission, cancel_fee: cancelFee, pix_key: pixKey }, t('admin.financial_saved_toast'))} /></div>
                </div>

                <div style={card}>
                  {secH('fa-landmark',t('admin.online_gateway_title'),'#3b82f6')}
                  <p style={{ color:'var(--bp-text-faint)', fontSize:12, margin:'0 0 14px', lineHeight:1.6 }}>{t('admin.gateway_desc')}</p>
                  <div style={{ marginBottom:14 }}>
                    <label style={LS}>{t('admin.mp_token_label')}</label>
                    <input type="password" value={mpToken} onChange={e=>setMpToken(e.target.value)} placeholder="APP_USR-..." style={IS} onFocus={F} onBlur={B} />
                  </div>
                  <div style={{ background:'rgba(59,130,246,0.07)', border:'1px solid rgba(59,130,246,0.2)', borderRadius:9, padding:'10px 14px', marginBottom:16 }}>
                    <p style={{ color:'#93c5fd', fontSize:12, margin:0 }}><i className="fas fa-info-circle" style={{ marginRight:6 }}></i>{t('admin.coming_soon_gateways')}</p>
                  </div>
                  <SaveBtn label={t('admin.save_gateway')} onClick={()=>saveSettings({ mp_token: mpToken }, t('admin.gateway_saved_toast'))} />
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: NOTIFICAÇÕES ══════════════ */}
          {tab==='notificacoes' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-bell',t('admin.send_channels_title'))}
                {[
                  { key:'email', v:channelEmail, setV:setChannelEmail, icon:'fa-envelope',        label:t('common.email'),     sub:t('admin.email_channel_sub'), color:'#3b82f6' },
                  { key:'whats', v:channelWhats, setV:setChannelWhats, icon:'fa-comment-dots',    label:'WhatsApp',   sub:t('admin.whatsapp_channel_sub'), color:'#10b981' },
                  { key:'sms',   v:channelSMS,   setV:setChannelSMS,   icon:'fa-sms',             label:'SMS',        sub:t('admin.sms_channel_sub'), color:'#f59e0b' },
                  { key:'push',  v:channelPush,  setV:setChannelPush,  icon:'fa-mobile-alt',      label:t('admin.push_app_label'),   sub:t('admin.push_app_sub'), color:'#8b5cf6' },
                ].map(item => (
                  <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:'1px solid var(--bp-border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:30, height:30, borderRadius:8, background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <i className={`fas ${item.icon}`} style={{ color:item.color, fontSize:13 }}></i>
                      </div>
                      <div><p style={{ color:'var(--bp-text-secondary)', fontSize:13, margin:0, fontWeight:500 }}>{item.label}</p><p style={{ color:'#4b5563', fontSize:11, margin:0 }}>{item.sub}</p></div>
                    </div>
                    <div onClick={()=>item.setV(!item.v)} style={{ width:46, height:26, borderRadius:13, background:item.v?'#d4a574':'var(--bp-border2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:4, left:item.v?24:4, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div><label style={LS}>{t('admin.first_reminder_label')}</label><input type="number" value={reminderH} onChange={e=>setReminderH(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                  <div><label style={LS}>{t('admin.second_reminder_label')}</label><input type="number" value={reminderH2} onChange={e=>setReminderH2(e.target.value)} style={IS} onFocus={F} onBlur={B} /></div>
                </div>
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_channels')} onClick={()=>saveSettings({ channel_email: channelEmail, channel_whats: channelWhats, channel_sms: channelSMS, channel_push: channelPush, reminder_h: reminderH, reminder_h2: reminderH2 }, t('admin.channels_saved_toast'))} /></div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={card}>
                  {secH('fa-toggle-on',t('admin.notif_triggers_title'),'#10b981')}
                  <Toggle v={notifNewAppt}  setV={setNotifNewAppt}  label={t('admin.new_appt_trigger_label')}        sub={t('admin.new_appt_trigger_sub')} />
                  <Toggle v={notifConfirm}  setV={setNotifConfirm}  label={t('admin.client_confirm_trigger_label')}  sub={t('admin.client_confirm_trigger_sub')} />
                  <Toggle v={notifCancel}   setV={setNotifCancel}   label={t('admin.cancel_trigger_label')}             sub={t('admin.cancel_trigger_sub')} />
                  <Toggle v={notifReminder} setV={setNotifReminder} label={t('admin.auto_reminder_trigger_label')}      sub={t('admin.auto_reminder_trigger_sub')} />
                  <Toggle v={notifReview}   setV={setNotifReview}   label={t('admin.review_request_trigger_label')} sub={t('admin.review_request_trigger_sub')} />
                  <Toggle v={notifBirthday} setV={setNotifBirthday} label={t('admin.birthday_trigger_label')}      sub={t('admin.birthday_trigger_sub')} />
                  <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_triggers')} onClick={()=>saveSettings({ notif_new_appt: notifNewAppt, notif_confirm: notifConfirm, notif_cancel: notifCancel, notif_reminder: notifReminder, notif_review: notifReview, notif_birthday: notifBirthday }, t('admin.triggers_saved_toast'))} /></div>
                </div>

                <div style={card}>
                  {secH('fa-comment-alt',t('admin.msg_templates_title'),'#8b5cf6')}
                  <div style={{ marginBottom:14 }}>
                    <label style={LS}>{t('admin.confirm_msg_label')}</label>
                    <textarea value={waMsgAppt} onChange={e=>setWaMsgAppt(e.target.value)} rows={4} style={{ ...IS, resize:'vertical', lineHeight:1.6, fontSize:12 }} onFocus={F} onBlur={B} />
                    <p style={{ color:'#4b5563', fontSize:11, margin:'4px 0 0' }}>{t('admin.variables_label')} {'{nome}'} {'{servico}'} {'{data}'} {'{hora}'} {'{barbeiro}'}</p>
                  </div>
                  <div>
                    <label style={LS}>{t('admin.reminder_msg_label2')}</label>
                    <textarea value={waMsgReminder} onChange={e=>setWaMsgReminder(e.target.value)} rows={3} style={{ ...IS, resize:'vertical', lineHeight:1.6, fontSize:12 }} onFocus={F} onBlur={B} />
                  </div>
                  <div style={{ marginTop:16 }}><SaveBtn label={t('admin.save_templates')} onClick={()=>saveSettings({ wa_msg_appt: waMsgAppt, wa_msg_reminder: waMsgReminder }, t('admin.templates_saved_toast'))} /></div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: APARÊNCIA ══════════════ */}
          {tab==='aparencia' && (
            <div style={card}>
              {secH('fa-palette',t('admin.system_theme_title'))}
              <p style={{ color:'var(--bp-text-faint)', fontSize:12, margin:'0 0 16px', lineHeight:1.6 }}>{t('admin.theme_desc')}</p>
              <div style={{ maxWidth:360 }}>
                <ThemeToggle theme={theme} onChange={handleThemeChange} saving={savingTheme} />
              </div>
            </div>
          )}

          {/* ══════════════ ABA: INTEGRAÇÕES ══════════════ */}
          {tab==='integrações' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {[
                { v:googleCal, setV:setGoogleCal, key:'google_cal', icon:'fa-calendar-alt', color:'#3b82f6', title:'Google Calendar', desc:t('admin.google_cal_desc'), badge:'OAuth 2.0', fields:[] },
                { v:googleBiz, setV:setGoogleBiz, key:'google_biz', icon:'fa-map-marker-alt',color:'#10b981', title:t('admin.google_biz_title'),desc:t('admin.google_biz_desc'), badge:'API Key', fields:[] },
                { v:instaBio,  setV:setInstaBio,  key:'insta_bio',  icon:'fa-instagram',    color:'#e1306c', title:'Instagram / Bio Link', desc:t('admin.insta_bio_desc'), badge:'Meta API', fields:[] },
                { v:waApi,     setV:setWaApi,     key:'wa_api',     icon:'fa-whatsapp',     color:'#25d366', title:'WhatsApp Business API', desc:t('admin.wa_business_desc'), badge:'API Key', fields:[{ label:t('admin.api_key_token_label'), val:waApiKey, setVal:setWaApiKey, key:'wa_api_key', ph:'Bearer eyJ...' }] },
              ].map(item => (
                <div key={item.key} style={{ ...card, display:'flex', flexDirection:'column', gap:0 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <i className={`fab ${item.icon}`} style={{ color:item.color, fontSize:20 }}></i>
                      </div>
                      <div>
                        <p style={{ color:'var(--bp-text)', fontWeight:700, fontSize:14, margin:0 }}>{item.title}</p>
                        <span style={{ background:item.color+'22', color:item.color, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, letterSpacing:0.5 }}>{item.badge}</span>
                      </div>
                    </div>
                    <div onClick={()=>item.setV(!item.v)} style={{ width:46, height:26, borderRadius:13, background:item.v?item.color:'var(--bp-border2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0, marginTop:4 }}>
                      <div style={{ position:'absolute', top:4, left:item.v?24:4, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
                    </div>
                  </div>
                  <p style={{ color:'var(--bp-text-muted)', fontSize:12, margin:'0 0 14px', lineHeight:1.6 }}>{item.desc}</p>
                  {item.fields.map(f => (
                    <div key={f.label} style={{ marginBottom:12 }}>
                      <label style={LS}>{f.label}</label>
                      <input type="password" value={f.val} onChange={e=>f.setVal(e.target.value)} placeholder={f.ph} style={IS} onFocus={F} onBlur={B} />
                    </div>
                  ))}
                  <button onClick={()=>{
                    const payload = { [item.key]: item.v };
                    item.fields.forEach(f => { if (f.key) payload[f.key] = f.val; });
                    saveSettings(payload, t(item.v ? 'admin.integration_connected' : 'admin.integration_disconnected', { name: item.title }));
                  }} style={{ background: item.v ? item.color+'22' : 'none', border:`1px solid ${item.v ? item.color : 'var(--bp-border2)'}`, borderRadius:9, color: item.v ? item.color : 'var(--bp-text-faint)', fontWeight:600, fontSize:12, padding:'9px 16px', cursor:'pointer', fontFamily:'Inter, sans-serif', marginTop:'auto' }}>
                    {item.v ? <><i className="fas fa-check" style={{ marginRight:6 }}></i>{t('admin.connected_manage')}</> : <><i className="fas fa-plug" style={{ marginRight:6 }}></i>{t('admin.connect_btn')}</>}
                  </button>
                </div>
              ))}
              <div style={card}>
                {secH('fa-bolt',t('admin.zapier_webhook_title'),'#f59e0b')}
                <p style={{ color:'var(--bp-text-muted)', fontSize:12, margin:'0 0 14px', lineHeight:1.6 }}>{t('admin.zapier_desc')}</p>
                <div><label style={LS}>{t('admin.webhook_url_label')}</label><input value={zapierHook} onChange={e=>setZapierHook(e.target.value)} placeholder="https://hooks.zapier.com/..." style={IS} onFocus={F} onBlur={B} /></div>
                <div style={{ marginTop:12 }}><label style={LS}>{t('admin.webhook_events_label')}</label>
                  {[t('admin.ev_new_appt'),t('admin.ev_cancellation'),t('admin.ev_payment_confirmed'),t('admin.ev_new_client'),t('admin.ev_review_received')].map(ev=>(
                    <label key={ev} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor:'#d4a574' }} />
                      <span style={{ color:'var(--bp-text-secondary)', fontSize:13 }}>{ev}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop:16 }}><SaveBtn label={t('admin.save_webhook')} onClick={()=>saveSettings({ zapier_hook: zapierHook }, t('admin.webhook_saved_toast'))} /></div>
              </div>
              <div style={card}>
                {secH('fa-shopping-bag',t('admin.ifood_delivery_title'),'#ef4444')}
                <p style={{ color:'var(--bp-text-muted)', fontSize:12, margin:'0 0 14px', lineHeight:1.6 }}>{t('admin.ifood_desc')}</p>
                <div style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:9, padding:'12px 14px' }}>
                  <p style={{ color:'#fca5a5', fontSize:12, margin:0 }}><i className="fas fa-rocket" style={{ marginRight:6 }}></i>{t('admin.available_v3_prefix')}<strong>{t('admin.in_development')}</strong></p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: SEGURANÇA ══════════════ */}
          {tab==='seguranca' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-key',t('admin.change_admin_pw_title'))}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { key:'old', label:t('admin.current_pw_label'), v:oldPass, setV:setOldPass },
                    { key:'new', label:t('admin.new_pw_label'),  v:newPass, setV:setNewPass },
                    { key:'conf', label:t('admin.confirm_new_pw_label'), v:confPass, setV:setConfPass },
                  ].map(f => (
                    <div key={f.key} style={{ position:'relative' }}>
                      <label style={LS}>{f.label}</label>
                      <input type={showPasses?'text':'password'} value={f.v} onChange={e=>f.setV(e.target.value)} style={{ ...IS, paddingRight:40 }} onFocus={F} onBlur={B} />
                    </div>
                  ))}
                  <button onClick={()=>setShowPasses(v=>!v)} style={{ background:'none', border:'none', color:'var(--bp-text-faint)', fontSize:12, cursor:'pointer', textAlign:'left', padding:0, fontFamily:'Inter, sans-serif' }}>
                    <i className={`fas ${showPasses?'fa-eye-slash':'fa-eye'}`} style={{ marginRight:6 }}></i>{showPasses?t('admin.hide_passwords'):t('admin.show_passwords')}
                  </button>
                  <div style={{ background:'rgba(212,165,116,0.07)', border:'1px solid rgba(212,165,116,0.2)', borderRadius:9, padding:'10px 14px' }}>
                    <p style={{ color:'#d4a574', fontSize:11, margin:0, lineHeight:1.7 }}>
                      <strong>{t('admin.pw_requirements_label')}</strong> {t('admin.pw_requirements_text')}
                    </p>
                  </div>
                </div>
                <div style={{ marginTop:20 }}><SaveBtn label={t('admin.change_password_btn')} icon="fa-lock" onClick={()=>save(t('admin.pw_changed_toast'))} /></div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={card}>
                  {secH('fa-shield-alt',t('admin.account_security_title'),'#10b981')}
                  <Toggle v={twoFA}    setV={setTwoFA}    label={t('admin.twofa_label')} sub={t('admin.twofa_sub')} />
                  <Toggle v={auditLog} setV={setAuditLog} label={t('admin.audit_log_label')} sub={t('admin.audit_log_sub')} />
                  <Toggle v={maintenanceMode} setV={setMaintenanceMode} label={t('admin.maintenance_mode_label')} sub={t('admin.maintenance_mode_sub')} />
                  <div style={{ marginTop:14 }}>
                    <label style={LS}>{t('admin.session_time_label')}</label>
                    <select value={sessionTime} onChange={e=>setSessionTime(e.target.value)} style={SS}>
                      {[{v:'60',l:t('admin.session_1h')},{v:'240',l:t('admin.session_4h')},{v:'480',l:t('admin.session_8h')},{v:'1440',l:t('admin.session_24h')},{v:'0',l:t('admin.session_never')}].map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div style={{ marginTop:14 }}>
                    <label style={LS}>{t('admin.ip_whitelist_label')}</label>
                    <input value={ipWhitelist} onChange={e=>setIpWhitelist(e.target.value)} placeholder={t('admin.ip_whitelist_placeholder')} style={IS} onFocus={F} onBlur={B} />
                  </div>
                  <div style={{ marginTop:20 }}><SaveBtn label={t('admin.save_security')} onClick={()=>save(t('admin.security_saved_toast'))} /></div>
                </div>

                <div style={card}>
                  {secH('fa-list-alt',t('admin.active_sessions_title'),'#3b82f6')}
                  {[
                    { device:'Chrome · Windows 11', ip:'177.22.45.8',   location:'São Paulo, SP', time:t('admin.time_now'), current:true  },
                    { device:'Safari · iPhone 15',  ip:'177.22.45.9',   location:'São Paulo, SP', time:t('admin.time_2h_ago'), current:false },
                    { device:'Firefox · Ubuntu',    ip:'200.100.50.12', location:'Campinas, SP',  time:t('admin.time_1d_ago'), current:false },
                  ].map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--bp-border)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <i className="fas fa-desktop" style={{ color:'#4b5563', fontSize:16, width:20, textAlign:'center' }}></i>
                        <div>
                          <p style={{ color:s.current?'#d4a574':'var(--bp-text-secondary)', fontSize:13, margin:0, fontWeight:s.current?600:400 }}>{s.device} {s.current && <span style={{ background:'rgba(16,185,129,0.15)', color:'#10b981', fontSize:10, padding:'1px 7px', borderRadius:99, marginLeft:6 }}>{t('admin.current_badge')}</span>}</p>
                          <p style={{ color:'#4b5563', fontSize:11, margin:0 }}>{s.ip} · {s.location} · {s.time}</p>
                        </div>
                      </div>
                      {!s.current && <button onClick={()=>save(t('admin.session_ended_toast'))} style={{ background:'none', border:'1px solid var(--bp-border2)', borderRadius:7, color:'#ef4444', fontSize:11, padding:'4px 10px', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>{t('admin.end_session_btn')}</button>}
                    </div>
                  ))}
                  <button onClick={()=>save(t('admin.all_sessions_ended_toast'))} style={{ marginTop:14, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:9, color:'#ef4444', fontWeight:600, fontSize:12, padding:'9px 16px', cursor:'pointer', fontFamily:'Inter, sans-serif', width:'100%' }}>
                    <i className="fas fa-sign-out-alt" style={{ marginRight:6 }}></i>{t('admin.end_all_other_sessions_btn')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ABA: MÓDULOS ══════════════ */}
          {tab==='modulos' && (
            <ModulosTab
              modules={modules}
              setModules={setModules}
              moduleFilter={moduleFilter}
              setModuleFilter={setModuleFilter}
              showToast={showToast}
            />
          )}

          {/* ══════════════ ABA: INDICAÇÃO ══════════════ */}
          {tab==='indicacao' && (
            <div style={card}>
              {secH('fa-user-plus',t('admin.referral_program_title'))}
              <Toggle v={referralEnabled} setV={setReferralEnabled} label={t('admin.referral_enabled_label')} sub={t('admin.referral_enabled_sub')} />
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
                <div>
                  <label style={LS}>{t('admin.referral_bonus_referrer_label')}</label>
                  <input value={referralBonusReferrer} onChange={e=>setReferralBonusReferrer(e.target.value)} placeholder={t('admin.referral_bonus_placeholder')} style={IS} onFocus={F} onBlur={B} />
                </div>
                <div>
                  <label style={LS}>{t('admin.referral_bonus_referred_label')}</label>
                  <input value={referralBonusReferred} onChange={e=>setReferralBonusReferred(e.target.value)} placeholder={t('admin.referral_bonus_placeholder')} style={IS} onFocus={F} onBlur={B} />
                </div>
              </div>
              <div style={{ marginTop:20 }}>
                <SaveBtn label={t('admin.save_referral_settings')} onClick={()=>saveSettings({ referral_enabled: referralEnabled, referral_bonus_referrer: referralBonusReferrer, referral_bonus_referred: referralBonusReferred }, t('admin.referral_settings_saved_toast'))} />
              </div>
            </div>
          )}

          {/* ══════════════ ABA: SISTEMA ══════════════ */}
          {tab==='sistema' && (
            <div className="admin-settings-2col" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div style={card}>
                {secH('fa-database',t('admin.backup_export_title'))}
                <div style={{ marginBottom:14 }}>
                  <label style={LS}>{t('admin.backup_freq_label')}</label>
                  <select value={backupFreq} onChange={e=>setBackupFreq(e.target.value)} style={SS}>
                    <option>{t('admin.freq_hourly')}</option><option>{t('admin.freq_daily')}</option><option>{t('admin.freq_weekly')}</option><option>{t('admin.freq_monthly')}</option><option>{t('admin.freq_disabled')}</option>
                  </select>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={LS}>{t('admin.backup_email_label')}</label>
                  <input value={backupEmail} onChange={e=>setBackupEmail(e.target.value)} style={IS} onFocus={F} onBlur={B} />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={LS}>{t('admin.data_retention_label')}</label>
                  <input type="number" value={dataRetention} onChange={e=>setDataRetention(e.target.value)} style={IS} min={30} onFocus={F} onBlur={B} />
                </div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <button onClick={downloadBackup} style={{ flex:1, background:'rgba(212,165,116,0.1)', border:'1px solid rgba(212,165,116,0.3)', borderRadius:9, color:'#d4a574', fontWeight:600, fontSize:13, padding:'10px 0', cursor:'pointer', fontFamily:'Inter, sans-serif', minWidth:120 }}><i className="fas fa-cloud-upload-alt" style={{ marginRight:6 }}></i>{t('admin.make_backup_btn')}</button>
                  <button onClick={exportAllCSV} style={{ flex:1, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:9, color:'#3b82f6', fontWeight:600, fontSize:13, padding:'10px 0', cursor:'pointer', fontFamily:'Inter, sans-serif', minWidth:120 }}><i className="fas fa-file-export" style={{ marginRight:6 }}></i>{t('admin.export_csv_btn')}</button>
                </div>
                <div style={{ marginTop:12 }}>
                  <button onClick={exportFullReportPDF} style={{ width:'100%', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:9, color:'#10b981', fontWeight:600, fontSize:13, padding:'10px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}><i className="fas fa-file-pdf" style={{ marginRight:6 }}></i>{t('admin.export_full_report_pdf_btn')}</button>
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div style={card}>
                  {secH('fa-terminal',t('admin.system_log_title'),'var(--bp-text-faint)')}
                  <textarea readOnly value={logLines.length ? logLines.join('\n') : t('admin.no_event_logged')} rows={6} style={{ ...IS, resize:'none', color:'#10b981', fontFamily:'DM Mono, monospace', fontSize:11, lineHeight:1.8, background:'#0a0e17', border:'1px solid var(--bp-border)' }} />
                  <div style={{ display:'flex', gap:8, marginTop:12 }}>
                    <button onClick={clearSystemLog} disabled={clearingLog} style={{ flex:1, background:'none', border:'1px solid var(--bp-border2)', borderRadius:8, color:'var(--bp-text-faint)', fontSize:12, padding:'8px 0', cursor: clearingLog ? 'not-allowed' : 'pointer', fontFamily:'Inter, sans-serif' }}><i className="fas fa-trash" style={{ marginRight:6 }}></i>{t('admin.clear_log_btn')}</button>
                    <button onClick={exportSystemLog} style={{ flex:1, background:'none', border:'1px solid var(--bp-border2)', borderRadius:8, color:'var(--bp-text-faint)', fontSize:12, padding:'8px 0', cursor:'pointer', fontFamily:'Inter, sans-serif' }}><i className="fas fa-download" style={{ marginRight:6 }}></i>{t('admin.export_btn')}</button>
                  </div>
                </div>

                <div style={card}>
                  {secH('fa-info-circle',t('admin.about_system_title'),'#3b82f6')}
                  {[
                    [t('admin.about_version'), systemInfo ? `BarberPro v${systemInfo.version}` : '—'],
                    [t('admin.about_environment'), systemInfo ? (systemInfo.environment === 'production' ? t('admin.env_production') : t('admin.env_development')) : '—'],
                    [t('admin.about_database'), systemInfo ? systemInfo.database : '—'],
                    [t('admin.about_node_version'), systemInfo ? systemInfo.node_version : '—'],
                    [t('admin.about_uptime'), systemInfo ? fmtUptime(systemInfo.uptime_seconds) : '—'],
                    [t('admin.about_support'), 'suporte@barberpro.com'],
                  ].map(([k,v])=>(
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--bp-border)' }}>
                      <span style={{ color:'var(--bp-text-faint)', fontSize:13 }}>{k}</span>
                      <span style={{ color:'var(--bp-text-secondary)', fontSize:13, fontWeight:500 }}>{v}</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          )}

        </div>
      );
    }

    /* ======================================================
       ADMIN — HORÁRIOS DISPONÍVEIS
    ====================================================== */
    function AdminHorarios({ appointments, onStatusChange, showToast }) {
      const { t, lang } = useLang();
      const MONTHS = useMemo(() => monthNames(lang), [lang]);

      const todayDate = todayStart();
      const padToday = n => String(n).padStart(2, '0');
      const todayStr = `${todayDate.getFullYear()}-${padToday(todayDate.getMonth() + 1)}-${padToday(todayDate.getDate())}`;

      const [calYear, setCalYear] = useState(todayDate.getFullYear());
      const [calMonth, setCalMonth] = useState(todayDate.getMonth());
      const [selectedDate, setSelectedDate] = useState(todayStr);
      const [barbers, setBarbers] = useState([]);
      const [workingDays, setWorkingDays] = useState(new Set([0, 1, 2, 3, 4, 5, 6]));
      const [dayBlocked, setDayBlocked] = useState([]);
      const [loadingBlocked, setLoadingBlocked] = useState(false);
      const [updatingId, setUpdatingId] = useState(null);

      useEffect(() => {
        (async () => {
          const res = await apiCall('GET', '/barbers');
          if (!res.ok) return;
          setBarbers(res.data);
          const hoursLists = await Promise.all(res.data.map(b => apiCall('GET', `/barbers/${b.id}/working-hours`)));
          const days = new Set();
          hoursLists.forEach(r => { if (r.ok) r.data.forEach(wh => days.add(wh.day_of_week)); });
          if (days.size) setWorkingDays(days);
        })();
      }, []);

      const loadBlocked = async (date) => {
        setLoadingBlocked(true);
        const res = await apiCall('GET', `/blocked-times/by-date/${date}`);
        if (res.ok) setDayBlocked(res.data);
        setLoadingBlocked(false);
      };
      useEffect(() => { loadBlocked(selectedDate); }, [selectedDate]);

      const [showBlockModal, setShowBlockModal] = useState(false);
      const [blockBarberId, setBlockBarberId] = useState('');
      const [blockStart, setBlockStart] = useState('10:00');
      const [blockEnd, setBlockEnd] = useState('12:00');
      const [blocking, setBlocking] = useState(false);

      const pad = n => String(n).padStart(2, '0');
      const getDateStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
      const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
      const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

      // Capacidade estimada: ~16 horários de 30min por barbeiro/dia
      const SLOTS_PER_BARBER_PER_DAY = 16;
      const FEW_SLOTS_THRESHOLD = 0.7; // >= 70% ocupado = "quase cheia"

      const activityDates = useMemo(() => {
        const counts = {};
        (appointments || []).forEach(a => {
          if (a.status === 'cancelled' || !a.appointment_date) return;
          const ds = a.appointment_date.slice(0, 10);
          counts[ds] = (counts[ds] || 0) + 1;
        });
        const capacity = SLOTS_PER_BARBER_PER_DAY * Math.max(barbers.length, 1);
        const total = daysInMonth(calYear, calMonth);
        const map = {};
        for (let d = 1; d <= total; d++) {
          const ds = getDateStr(calYear, calMonth, d);
          if (ds < todayStr) continue; // só dias futuros/hoje recebem indicador
          const dow = new Date(calYear, calMonth, d).getDay();
          if (!workingDays.has(dow)) continue;
          const count = counts[ds] || 0;
          map[ds] = count / capacity >= FEW_SLOTS_THRESHOLD ? ['orange'] : ['blue'];
        }
        return map;
      }, [appointments, barbers, todayStr, calYear, calMonth, workingDays]);

      const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
      const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
      const isSelected = (d) => { if (!d) return false; return getDateStr(calYear, calMonth, d) === selectedDate; };
      const isToday = (d) => { if (!d) return false; return getDateStr(calYear, calMonth, d) === todayStr; };

      const formatSelectedDate = () => {
        if (!selectedDate) return '';
        const [y, m, d] = selectedDate.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString(localeTag(lang), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      };

      const dayAppointments = useMemo(() => (appointments || [])
        .filter(a => (a.appointment_date || '').slice(0, 10) === selectedDate)
        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)), [appointments, selectedDate]);

      const updateStatus = async (id, status) => {
        setUpdatingId(id);
        await onStatusChange(id, status);
        setUpdatingId(null);
      };

      const unblock = async (id) => {
        const res = await apiCall('DELETE', `/blocked-times/${id}`);
        if (res.ok) { showToast && showToast(t('admin.block_removed_toast'), 'success'); loadBlocked(selectedDate); }
        else showToast && showToast(res.data?.error || t('admin.err_remove_block'), 'error');
      };

      const blockPeriod = async () => {
        if (!blockBarberId) { showToast && showToast(t('admin.select_barber_error'), 'error'); return; }
        if (blockEnd <= blockStart) { showToast && showToast(t('admin.end_after_start_error'), 'error'); return; }
        setBlocking(true);
        const res = await apiCall('POST', '/blocked-times', { barber_id: blockBarberId, date: selectedDate, start_time: blockStart, end_time: blockEnd, reason: t('admin.blocked_by_admin_reason') });
        setBlocking(false);
        if (res.ok) {
          showToast && showToast(t('admin.period_blocked_toast'), 'success');
          setShowBlockModal(false);
          loadBlocked(selectedDate);
        } else {
          showToast && showToast(res.data?.error || t('admin.err_block_period'), 'error');
        }
      };

      const getStatusDisplay = (status) => ({
        pending: { label: t('status.pending'), color: '#3b82f6' },
        confirmed: { label: t('status.confirmed'), color: '#f59e0b' },
        completed: { label: t('status.completed'), color: '#10b981' },
        cancelled: { label: t('status.cancelled'), color: '#ef4444' },
      }[status] || { label: status, color: 'var(--bp-text)' });

      const renderCalendarCells = () => {
        const total = daysInMonth(calYear, calMonth);
        const first = firstDayOfMonth(calYear, calMonth);
        const cells = Array(first).fill(null);
        for (let d = 1; d <= total; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
      };

      const calCells = renderCalendarCells();

      const cardStyle = { background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 };
      const inputStyle = { width: '100%', background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text)', fontSize: 13, padding: '8px 12px', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' };
      const labelStyle = { color: 'var(--bp-text-muted)', fontSize: 12, display: 'block', marginBottom: 5 };
      const iconBtn = (color) => ({ background: 'none', border: 'none', color, cursor: 'pointer', padding: '3px 5px', borderRadius: 5, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' });

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-clock" style={{ color: '#d4a574', fontSize: 20 }}></i>
              <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0 }}>{t('admin.manage_available_hours')}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '7px 16px' }}>
              <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: 13 }}></i>
              <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>{t('admin.hours_loaded')}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16 }} className="horarios-grid">

            {/* ---- LEFT: Calendar ---- */}
            <div style={cardStyle}>
              <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, fontFamily: 'Syne, sans-serif', marginBottom: 16 }}>{t('admin.calendar_filters')}</p>

              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <button onClick={prevMonth} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 6, color: '#d4a574', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-chevron-left" style={{ fontSize: 10 }}></i>
                </button>
                <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 13 }}>{MONTHS[calMonth]} {calYear}</span>
                <button onClick={nextMonth} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 6, color: '#d4a574', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fas fa-chevron-right" style={{ fontSize: 10 }}></i>
                </button>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                {weekdayNarrowSunFirst(lang).map((d, i) => (
                  <div key={i} style={{ textAlign: 'center', color: 'var(--bp-text-faint)', fontSize: 10, fontWeight: 600, padding: '3px 0' }}>{d}</div>
                ))}
              </div>

              {/* Calendar cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                {calCells.map((d, i) => {
                  if (!d) return <div key={i}></div>;
                  const dateStr = getDateStr(calYear, calMonth, d);
                  const dots = activityDates[dateStr] || [];
                  const dotColor = dots.length === 0 ? null : dots.includes('orange') ? '#f59e0b' : '#10b981';
                  const sel = isSelected(d);
                  const tod = isToday(d);
                  return (
                    <div key={i} onClick={() => setSelectedDate(dateStr)}
                      style={{ textAlign: 'center', cursor: 'pointer', borderRadius: 6, padding: '4px 2px', background: sel ? '#d4a574' : tod ? 'rgba(212,165,116,0.15)' : 'transparent', border: sel ? 'none' : tod ? '1px solid #d4a57466' : '1px solid transparent', transition: 'all .15s' }}>
                      <span style={{ color: sel ? '#000' : 'var(--bp-text-secondary)', fontSize: 12, fontWeight: sel ? 700 : 400, display: 'block', lineHeight: 1.8 }}>{d}</span>
                      {dotColor && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 1, marginBottom: 1 }}>
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor, display: 'inline-block' }}></span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bp-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('admin.slots_available')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                  <span style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{t('admin.schedule_almost_full')}</span>
                </div>
              </div>

              {/* Quick nav buttons */}
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(() => {
                    const tomorrow = new Date(todayDate); tomorrow.setDate(tomorrow.getDate() + 1);
                    return [
                      { label: t('admin.view_today'), date: todayDate },
                      { label: t('admin.view_tomorrow'), date: tomorrow },
                    ];
                  })().map(btn => (
                    <button key={btn.label} onClick={() => { setSelectedDate(getDateStr(btn.date.getFullYear(), btn.date.getMonth(), btn.date.getDate())); setCalYear(btn.date.getFullYear()); setCalMonth(btn.date.getMonth()); }}
                      style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: 'var(--bp-text-secondary)', fontSize: 11, padding: '7px 4px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all .15s' }}
                      onMouseEnter={e => { e.target.style.borderColor = '#d4a574'; e.target.style.color = '#d4a574'; }}
                      onMouseLeave={e => { e.target.style.borderColor = 'var(--bp-border2)'; e.target.style.color = 'var(--bp-text-secondary)'; }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => {
                  const sat = new Date(todayDate);
                  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
                  setSelectedDate(getDateStr(sat.getFullYear(), sat.getMonth(), sat.getDate())); setCalYear(sat.getFullYear()); setCalMonth(sat.getMonth());
                }}
                  style={{ width: '100%', background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 7, color: 'var(--bp-text-secondary)', fontSize: 11, padding: '7px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all .15s' }}
                  onMouseEnter={e => { e.target.style.borderColor = '#d4a574'; e.target.style.color = '#d4a574'; }}
                  onMouseLeave={e => { e.target.style.borderColor = 'var(--bp-border2)'; e.target.style.color = 'var(--bp-text-secondary)'; }}>
                  {t('admin.view_next_saturday')}
                </button>
              </div>
            </div>


            {/* ---- RIGHT: Day Appointments + Blocked Times ---- */}
            <div style={{ ...cardStyle, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <p style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, fontFamily: 'Syne, sans-serif', margin: '0 0 4px' }}>{t('admin.selected_day_hours')}</p>
                  <p style={{ color: 'var(--bp-text-muted)', fontSize: 13, margin: 0 }}>{formatSelectedDate()}</p>
                </div>
                <button onClick={() => { setBlockBarberId(barbers[0]?.id || ''); setShowBlockModal(true); }} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-secondary)', fontWeight: 600, fontSize: 12, padding: '8px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4a574'; e.currentTarget.style.color = '#d4a574'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bp-border2)'; e.currentTarget.style.color = 'var(--bp-text-secondary)'; }}>
                  <i className="fas fa-ban"></i> {t('admin.block_period')}
                </button>
              </div>

              {dayAppointments.length === 0 && dayBlocked.length === 0 && !loadingBlocked && (
                <div style={{ textAlign: 'center', color: '#4b5563', padding: '40px 0' }}>
                  <i className="fas fa-calendar-day" style={{ fontSize: 28, marginBottom: 10, display: 'block' }}></i>
                  {t('admin.no_appt_or_block_day')}
                </div>
              )}

              {(dayAppointments.length > 0 || dayBlocked.length > 0) && (
              <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 520 }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 1fr 110px', gap: 8, padding: '7px 10px', borderBottom: '1px solid var(--bp-border)', marginBottom: 2 }}>
                {[t('admin.th_time'), t('admin.table_barber'), t('admin.th_client_reason'), t('admin.table_status'), t('common.actions')].map(h => (
                  <span key={h} style={{ color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</span>
                ))}
              </div>

              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {dayAppointments.map(apt => {
                  const sd = getStatusDisplay(apt.status);
                  return (
                    <div key={`apt-${apt.id}`}
                      style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 1fr 110px', gap: 8, padding: '9px 10px', borderRadius: 8, alignItems: 'center', borderBottom: '1px solid rgba(45,55,72,0.4)' }}>
                      <span style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{apt.appointment_time}</span>
                      <span style={{ color: 'var(--bp-text-secondary)', fontSize: 13 }}>{apt.barber_name}</span>
                      <span style={{ color: 'var(--bp-text-muted)', fontSize: 13 }}>{apt.client_name} · {apt.service_name}</span>
                      <span style={{ fontSize: 12, color: sd.color }}>{sd.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {apt.status === 'pending' && (
                          <>
                            <button onClick={() => updateStatus(apt.id, 'confirmed')} disabled={updatingId === apt.id} title={t('common.confirm')} style={{ ...iconBtn('#10b981') }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <i className="fas fa-check" aria-hidden="true"></i>
                            </button>
                            <button onClick={() => updateStatus(apt.id, 'cancelled')} disabled={updatingId === apt.id} title={t('admin.reject')} aria-label={t('admin.reject')} style={{ ...iconBtn('#ef4444') }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <i className="fas fa-times" aria-hidden="true"></i>
                            </button>
                          </>
                        )}
                        {apt.status === 'confirmed' && (
                          <button onClick={() => updateStatus(apt.id, 'cancelled')} disabled={updatingId === apt.id} title={t('common.cancel')} aria-label={t('common.cancel')} style={{ ...iconBtn('var(--bp-text-faint)') }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--bp-text-faint)'; e.currentTarget.style.background = 'none'; }}>
                            <i className="fas fa-ban" aria-hidden="true" style={{ fontSize: 11 }}></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {dayBlocked.map(b => (
                  <div key={`block-${b.id}`}
                    style={{ display: 'grid', gridTemplateColumns: '64px 1fr 1fr 1fr 110px', gap: 8, padding: '9px 10px', borderRadius: 8, alignItems: 'center', background: 'rgba(107,114,128,0.07)', borderBottom: '1px solid rgba(45,55,72,0.4)' }}>
                    <span style={{ color: 'var(--bp-text-faint)', fontWeight: 600, fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{b.start_time}–{b.end_time}</span>
                    <span style={{ color: '#4b5563', fontSize: 13 }}>{b.barber_name}</span>
                    <span style={{ color: '#4b5563', fontSize: 13 }}>{b.reason || '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--bp-text-faint)' }}>{t('admin.blocked_badge')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button onClick={() => unblock(b.id)} title={t('admin.unblock_btn')} aria-label={t('admin.unblock_btn')} style={{ ...iconBtn('#4b5563') }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.background = 'none'; }}>
                        <i className="fas fa-lock-open" aria-hidden="true" style={{ fontSize: 11 }}></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
              </div>
              )}
            </div>
          </div>

          {/* Block Period Modal */}
          {showBlockModal && (
            <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowBlockModal(false)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border2)', borderRadius: 16, padding: 24, width: 380, maxWidth: '90vw' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <h3 className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 16, margin: 0 }}>{t('admin.block_period')}</h3>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '4px 0 0' }}>{formatSelectedDate()}</p>
                  </div>
                  <button onClick={() => setShowBlockModal(false)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 18 }}><i className="fas fa-times" aria-hidden="true"></i></button>
                </div>
                <div style={{ margin: '16px 0' }}>
                  <label style={labelStyle}>{t('booking.label_barber')}</label>
                  <select value={blockBarberId} onChange={e => setBlockBarberId(e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 }}>
                    {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 16px' }}>{t('admin.barber_selected_hint')}</p>
                <div style={{ marginBottom: 16 }}>
                  <DrumTimeSelector value={blockStart} onChange={setBlockStart} label={t('admin.start_time_label')} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <DrumTimeSelector value={blockEnd} onChange={setBlockEnd} label={t('admin.end_time_label')} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={blockPeriod} disabled={blocking} style={{ flex: 1, background: blocking ? 'var(--bp-border2)' : 'linear-gradient(135deg,#ef4444,#b91c1c)', border: 'none', borderRadius: 8, color: blocking ? '#4b5563' : 'var(--bp-text)', fontWeight: 700, fontSize: 13, padding: '10px', cursor: blocking ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}>{blocking ? t('admin.blocking_ellipsis') : t('admin.block_btn')}</button>
                  <button onClick={() => setShowBlockModal(false)} style={{ flex: 1, background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 8, color: 'var(--bp-text-muted)', fontSize: 13, padding: '10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
