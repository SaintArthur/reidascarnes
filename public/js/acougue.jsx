    /* ======================================================
       AÇOUGUE DASHBOARD — controle financeiro/fiscal
       Todas as telas do sistema: usa /api/acougue/*, perfil 'acougue'.
    ====================================================== */
    // Paleta dourada do Rei das Carnes: dourado sobre fundo escuro, legível sob a luz forte
    // do balcão e com contraste suficiente para telas baratas de PDV.
    const ACG_ACCENT = '#d4a574';
    const ACG_ACCENT_DARK = '#8b7355';
    const ACG_ACCENT_BG = 'rgba(212,165,116,0.12)';

    const acgToday = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const acgMonthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    // Cada item diz quem o vê. A lista que VALE é a do servidor (`equipe` vs `donoOnly` em
    // server.js); esta só evita mostrar botão que vai responder 403. Qualquer papel que não seja
    // 'caixa' é tratado como dono — inclui o 'acougue' antigo guardado num navegador que ainda
    // não recarregou depois da migração.
    const ACG_PAPEL = (role) => (role === 'caixa' ? 'caixa' : 'dono');
    const ACG_ROTULO_PAPEL = { dono: 'Dono', caixa: 'Caixa' };
    const ACG_NAV_TODOS = [
      { id: 'inicio', icon: 'fas fa-chart-pie', label: 'Início', papeis: ['dono'] },
      { id: 'caixa', icon: 'fas fa-cash-register', label: 'Caixa', papeis: ['dono', 'caixa'] },
      { id: 'clientes', icon: 'fas fa-users', label: 'Clientes e Fiado', papeis: ['dono', 'caixa'] },
      { id: 'conferencia', icon: 'fas fa-clipboard-check', label: 'Conferir Etiquetas', papeis: ['dono', 'caixa'] },
      { id: 'entrada', icon: 'fas fa-truck-loading', label: 'Entrada de Carcaça', papeis: ['dono'] },
      { id: 'notas-entrada', icon: 'fas fa-file-import', label: 'Entrada de Notas', papeis: ['dono'] },
      { id: 'camara', icon: 'fas fa-snowflake', label: 'Câmara Fria', papeis: ['dono'] },
      { id: 'rendimento', icon: 'fas fa-calculator', label: 'Rendimento de Carcaça', papeis: ['dono'] },
      { id: 'precificacao', icon: 'fas fa-money-bill-trend-up', label: 'Precificação', papeis: ['dono'] },
      { id: 'saida', icon: 'fas fa-drumstick-bite', label: 'Saída de Cortes', papeis: ['dono'] },
      { id: 'produtos', icon: 'fas fa-tags', label: 'Produtos', papeis: ['dono'] },
      { id: 'producao', icon: 'fas fa-industry', label: 'Produção e Lotes', papeis: ['dono'] },
      { id: 'notas', icon: 'fas fa-file-invoice', label: 'Emissão de Nota', papeis: ['dono'] },
      { id: 'relatorios', icon: 'fas fa-chart-column', label: 'Relatórios', papeis: ['dono'] },
      { id: 'impostos', icon: 'fas fa-percent', label: 'PIS / COFINS', papeis: ['dono'] },
      { id: 'config', icon: 'fas fa-gear', label: 'Configurações', papeis: ['dono'] },
      { id: 'equipe', icon: 'fas fa-user-shield', label: 'Equipe e Acessos', papeis: ['dono'] },
      { id: 'conta', icon: 'fas fa-circle-user', label: 'Minha Conta', papeis: ['dono', 'caixa'] },
    ];
    function useAcougueNav(role) {
      const papel = ACG_PAPEL(role);
      return ACG_NAV_TODOS.filter(i => i.papeis.includes(papel));
    }

    const acgDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

    function AcgSpinner() {
      return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: ACG_ACCENT }}></i></div>;
    }

    // `hint` é a linha de baixo, para comparação (ex: "12% acima de ontem"). Número sozinho não
    // diz se o dia foi bom — só ao lado do anterior é que ele significa alguma coisa.
    function AcgCard({ label, value, icon, color, bg, hint, hintColor }) {
      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <i className={`fas ${icon}`} style={{ color, fontSize: 16 }}></i>
          </div>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 2px' }}>{label}</p>
          <p style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 800, margin: 0, fontFamily: 'Inter, sans-serif' }}>{value}</p>
          {hint && <p style={{ color: hintColor || 'var(--bp-text-faint)', fontSize: 11, margin: '4px 0 0', fontWeight: hintColor ? 600 : 400 }}>{hint}</p>}
        </div>
      );
    }

    // Variação percentual entre dois períodos, já no formato que o card mostra. Sem base
    // (período anterior zerado) não existe percentual: dizer "+100%" partindo de zero é
    // inventar número.
    function acgVariacao(atual, anterior, sufixo) {
      const a = Number(atual) || 0;
      const b = Number(anterior) || 0;
      if (b === 0) return a === 0 ? { texto: `sem movimento ${sufixo}` } : { texto: `nada ${sufixo}` };
      const pct = ((a - b) / b) * 100;
      if (Math.abs(pct) < 0.5) return { texto: `igual ${sufixo}` };
      const sobe = pct > 0;
      return {
        texto: `${sobe ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% ${sufixo}`,
        cor: sobe ? '#10b981' : '#ef4444',
      };
    }

    function AcgSectionTitle({ icon, title, subtitle }) {
      return (
        <div style={{ marginBottom: 20 }}>
          <h2 className="syne" style={{ color: 'var(--bp-text)', fontSize: 22, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`fas ${icon}`} style={{ color: ACG_ACCENT, fontSize: 18 }}></i>{title}
          </h2>
          {subtitle && <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>}
        </div>
      );
    }

    function AcgInput({ label, hint, ...props }) {
      return (
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 5 }}>{label}</span>
          <input {...props} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
          {hint && <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{hint}</span>}
        </label>
      );
    }

    function AcgSelect({ label, children, ...props }) {
      return (
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 5 }}>{label}</span>
          <select {...props} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}>
            {children}
          </select>
        </label>
      );
    }

    function AcgButton({ children, variant = 'primary', ...props }) {
      const styles = {
        primary: { background: `linear-gradient(135deg, ${ACG_ACCENT}, ${ACG_ACCENT_DARK})`, color: '#000', border: 'none' },
        ghost: { background: 'none', color: 'var(--bp-text-muted)', border: '1px solid var(--bp-border2)' },
        danger: { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
      };
      return (
        <button {...props} style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.6 : 1, fontFamily: 'Inter, sans-serif', ...styles[variant], ...(props.style || {}) }}>
          {children}
        </button>
      );
    }

    function AcgTable({ columns, rows, emptyLabel }) {
      if (!rows.length) {
        return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--bp-text-faint)' }}><i className="fas fa-inbox" style={{ fontSize: 24, marginBottom: 8, display: 'block' }}></i>{emptyLabel || 'Nada por aqui ainda'}</div>;
      }
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} style={{ textAlign: c.align || 'left', padding: '8px 10px', color: 'var(--bp-text-faint)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--bp-border)', whiteSpace: 'nowrap' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id ?? i} style={{ borderBottom: '1px solid var(--bp-border)' }}>
                  {columns.map(c => <td key={c.key} style={{ padding: '9px 10px', color: 'var(--bp-text-secondary)', textAlign: c.align || 'left', whiteSpace: c.nowrap ? 'nowrap' : 'normal' }}>{c.render ? c.render(row) : row[c.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    /* ---- INÍCIO ---- */
    const ACG_PAINEL_INTERVALO_MS = 60000;

    function AcougueInicio({ showToast, onNavigate }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [atualizando, setAtualizando] = useState(false);

      // `silencioso` existe por causa da atualização automática: trocar a tela inteira pelo
      // spinner a cada minuto faria o painel piscar na cara de quem está lendo o número.
      // Na recarga de fundo os valores só mudam no lugar.
      const load = async ({ silencioso } = {}) => {
        if (silencioso) setAtualizando(true); else setLoading(true);
        const res = await apiCall('GET', '/acougue/dashboard');
        if (res.ok) setData(res.data);
        else if (!silencioso) showToast(res.data?.error || 'Erro ao carregar o painel', 'error');
        setLoading(false);
        setAtualizando(false);
      };

      useEffect(() => {
        load();
        // Três gatilhos, porque um só não cobre o uso real do balcão:
        //   intervalo — a tela do açougue fica aberta o dia inteiro numa TV ou num canto;
        //   foco/visibilidade — voltar para a aba depois de horas tem que trazer dado de agora,
        //     não o de quando ela foi aberta (inclusive depois da virada do dia).
        const id = setInterval(() => load({ silencioso: true }), ACG_PAINEL_INTERVALO_MS);
        const aoVoltar = () => { if (!document.hidden) load({ silencioso: true }); };
        document.addEventListener('visibilitychange', aoVoltar);
        window.addEventListener('focus', aoVoltar);
        return () => {
          clearInterval(id);
          document.removeEventListener('visibilitychange', aoVoltar);
          window.removeEventListener('focus', aoVoltar);
        };
      }, []);

      if (loading || !data) return <AcgSpinner />;

      const mesAnteriorLabel = data.mes_anterior_num ? acgMonthNames[data.mes_anterior_num - 1] : 'mês anterior';
      const varCaixa = acgVariacao(data.caixa_hoje, data.caixa_ontem, 'que ontem');
      const varVendas = acgVariacao(data.vendas_hoje, data.vendas_ontem, 'que ontem');
      const varSaidas = acgVariacao(data.saidas_mes, data.saidas_mes_anterior, `que ${mesAnteriorLabel.toLowerCase()}`);

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <AcgSectionTitle icon="fa-chart-pie" title="Controle Financeiro do Açougue" subtitle="Visão geral do mês corrente" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <span style={{ color: 'var(--bp-text-faint)', fontSize: 11.5 }}>
                {atualizando
                  ? <span><i className="fas fa-rotate fa-spin" style={{ marginRight: 6 }}></i>atualizando...</span>
                  : `atualizado ${acgDataHora(data.atualizado_em).slice(-5)}`}
              </span>
              <AcgButton type="button" variant="ghost" onClick={() => load({ silencioso: true })} title="Atualizar agora" style={{ padding: '6px 10px', fontSize: 12 }}>
                <i className="fas fa-rotate-right"></i>
              </AcgButton>
            </div>
          </div>

          <AcougueContingencia showToast={showToast} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
            <AcgCard label="Caixa hoje" value={fmtCur(data.caixa_hoje)} icon="fa-cash-register" color="#10b981" bg="rgba(16,185,129,0.12)"
              hint={varCaixa.texto} hintColor={varCaixa.cor} />
            <AcgCard label="Vendas ontem" value={fmtCur(data.caixa_ontem)} icon="fa-clock-rotate-left" color="#a855f7" bg="rgba(168,85,247,0.12)"
              hint={`${data.vendas_ontem} venda${data.vendas_ontem === 1 ? '' : 's'}`} />
            <AcgCard label="Vendas hoje" value={data.vendas_hoje} icon="fa-receipt" color={ACG_ACCENT} bg={ACG_ACCENT_BG}
              hint={varVendas.texto} hintColor={varVendas.cor} />
            <AcgCard label="Entradas do mês" value={fmtCur(data.entradas_mes)} icon="fa-truck-loading" color="#3b82f6" bg="rgba(59,130,246,0.12)" />
            <AcgCard label="Saídas do mês" value={fmtCur(data.saidas_mes)} icon="fa-drumstick-bite" color="#f59e0b" bg="rgba(245,158,11,0.12)"
              hint={varSaidas.texto} hintColor={varSaidas.cor} />
            <AcgCard label={`Saídas de ${mesAnteriorLabel}`} value={fmtCur(data.saidas_mes_anterior)} icon="fa-calendar-check" color="#8b7355" bg="rgba(139,115,85,0.18)"
              hint="mês fechado" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span><i className="fas fa-truck-loading" style={{ color: ACG_ACCENT, marginRight: 8 }}></i>Últimas entradas de carcaça</span>
                <a onClick={() => onNavigate('entrada')} style={{ color: ACG_ACCENT, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>ver todas</a>
              </p>
              <AcgTable
                emptyLabel="Nenhuma entrada registrada ainda"
                columns={[
                  { key: 'entry_date', label: 'Data', render: r => fmtDate(r.entry_date) },
                  { key: 'supplier_name', label: 'Fornecedor' },
                  { key: 'weight_kg', label: 'Kg', align: 'right', render: r => Number(r.weight_kg).toFixed(2) },
                  { key: 'total_value', label: 'Valor', align: 'right', render: r => fmtCur(r.total_value) },
                ]}
                rows={data.ultimas_entradas}
              />
            </div>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span><i className="fas fa-drumstick-bite" style={{ color: ACG_ACCENT, marginRight: 8 }}></i>Últimas saídas de cortes</span>
                <a onClick={() => onNavigate('saida')} style={{ color: ACG_ACCENT, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>ver todas</a>
              </p>
              <AcgTable
                emptyLabel="Nenhuma saída registrada ainda"
                columns={[
                  { key: 'output_date', label: 'Data', render: r => fmtDate(r.output_date) },
                  { key: 'cut_name', label: 'Corte' },
                  { key: 'weight_kg', label: 'Kg', align: 'right', render: r => Number(r.weight_kg).toFixed(2) },
                  { key: 'total_value', label: 'Valor', align: 'right', render: r => fmtCur(r.total_value) },
                ]}
                rows={data.ultimas_saidas}
              />
            </div>
          </div>
        </div>
      );
    }

    /* ---- ENTRADA DE CARCAÇA ---- */
    function AcougueEntrada({ showToast }) {
      const now = new Date();
      const [month, setMonth] = useState(now.getMonth() + 1);
      const [year, setYear] = useState(now.getFullYear());
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const emptyForm = { supplier_name: '', supplier_document: '', animal_type: 'bovino', weight_kg: '', unit_price: '', entry_date: acgToday(), notes: '' };
      const [form, setForm] = useState(emptyForm);
      const [saving, setSaving] = useState(false);

      const load = async () => {
        setLoading(true);
        const res = await apiCall('GET', `/acougue/carcass-entries?month=${month}&year=${year}`);
        if (res.ok) setRows(res.data); else showToast(res.data?.error || 'Erro ao carregar', 'error');
        setLoading(false);
      };
      useEffect(() => { load(); }, [month, year]);

      const submit = async (e) => {
        e.preventDefault();
        if (!form.supplier_name || !form.weight_kg || !form.unit_price || !form.entry_date) {
          showToast('Preencha fornecedor, peso, preço por kg e data', 'error'); return;
        }
        setSaving(true);
        const res = await apiCall('POST', '/acougue/carcass-entries', form);
        setSaving(false);
        if (res.ok) { showToast('Entrada de carcaça registrada', 'success'); setForm(emptyForm); setShowForm(false); load(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const remove = async (id) => {
        if (!confirm('Excluir esta entrada?')) return;
        const res = await apiCall('DELETE', `/acougue/carcass-entries/${id}`);
        if (res.ok) { showToast('Entrada excluída', 'info'); load(); }
        else showToast(res.data?.error || 'Erro ao excluir', 'error');
      };

      const totalMes = rows.reduce((a, r) => a + Number(r.total_value), 0);

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <AcgSectionTitle icon="fa-truck-loading" title="Entrada de Carcaça" subtitle="Compra de carcaça de fornecedores/produtores" />
            <AcgButton onClick={() => setShowForm(s => !s)}><i className="fas fa-plus" style={{ marginRight: 6 }}></i>Nova entrada</AcgButton>
          </div>

          {showForm && (
            <form onSubmit={submit} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <AcgInput label="Fornecedor / Produtor" value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} required />
                <AcgInput label="CPF/CNPJ do fornecedor" value={form.supplier_document} onChange={e => setForm({ ...form, supplier_document: e.target.value })} />
                <AcgSelect label="Tipo de animal" value={form.animal_type} onChange={e => setForm({ ...form, animal_type: e.target.value })}>
                  <option value="bovino">Bovino</option>
                  <option value="suino">Suíno</option>
                  <option value="ovino">Ovino</option>
                  <option value="aves">Aves</option>
                  <option value="outro">Outro</option>
                </AcgSelect>
                <AcgInput label="Peso (kg)" type="number" step="0.01" min="0" value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })} required />
                <AcgInput label="Preço por kg (R$)" type="number" step="0.01" min="0" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} required />
                <AcgInput label="Data da entrada" type="date" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} required />
              </div>
              <AcgInput label="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              {form.weight_kg && form.unit_price && (
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '0 0 12px' }}>Total: <strong style={{ color: 'var(--bp-text)' }}>{fmtCur(Number(form.weight_kg) * Number(form.unit_price))}</strong></p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <AcgButton type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar entrada'}</AcgButton>
                <AcgButton type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</AcgButton>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }}>
              {acgMonthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }} />
            <span style={{ color: 'var(--bp-text-faint)', fontSize: 13, marginLeft: 'auto' }}>Total do período: <strong style={{ color: 'var(--bp-text)' }}>{fmtCur(totalMes)}</strong></span>
          </div>

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 16 }}>
            {loading ? <AcgSpinner /> : (
              <AcgTable
                emptyLabel="Nenhuma entrada neste período"
                columns={[
                  { key: 'entry_date', label: 'Data', render: r => fmtDate(r.entry_date) },
                  { key: 'supplier_name', label: 'Fornecedor' },
                  { key: 'animal_type', label: 'Animal' },
                  { key: 'weight_kg', label: 'Kg', align: 'right', render: r => Number(r.weight_kg).toFixed(2) },
                  { key: 'unit_price', label: 'R$/kg', align: 'right', render: r => fmtCur(r.unit_price) },
                  { key: 'total_value', label: 'Total', align: 'right', render: r => fmtCur(r.total_value) },
                  { key: 'actions', label: '', align: 'right', render: r => <button onClick={() => remove(r.id)} title="Excluir" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash"></i></button> },
                ]}
                rows={rows}
              />
            )}
          </div>
        </div>
      );
    }

    /* ---- RENDIMENTO DE CARCAÇA (calculadora peso vivo → cortes) ---- */
    const fmtKg = (kg) => `${(kg || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
    const fmtG = (kg) => `${Math.round((kg || 0) * 1000).toLocaleString('pt-BR')} g`;
    const ACG_SECTION_LABELS = { dianteiro: 'Dianteiro', traseiro: 'Traseiro', ponta_agulha: 'Ponta de Agulha', moida: 'Carne Moída', perda: 'Perdas (não comestível)' };
    const ACG_SECTION_ORDER = ['dianteiro', 'traseiro', 'ponta_agulha', 'moida', 'perda'];

    function AcgYieldPercentEditor({ settings, cuts, onSaved, showToast }) {
      const [stage1, setStage1] = useState({ dressing_pct: settings.dressing_pct, blood_pct: settings.blood_pct, hide_pct: settings.hide_pct, head_feet_pct: settings.head_feet_pct });
      const [savingStage1, setSavingStage1] = useState(false);
      const [localCuts, setLocalCuts] = useState(cuts.map(c => ({ ...c })));
      const [savingCutId, setSavingCutId] = useState(null);
      const [newCut, setNewCut] = useState({ name: '', section: 'traseiro', pct_of_carcass: '' });
      const [addingCut, setAddingCut] = useState(false);

      useEffect(() => { setLocalCuts(cuts.map(c => ({ ...c }))); }, [cuts]);

      const saveStage1 = async () => {
        setSavingStage1(true);
        const res = await apiCall('PATCH', '/acougue/settings', stage1);
        setSavingStage1(false);
        if (res.ok) { showToast('Percentuais de carcaça atualizados', 'success'); onSaved(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const saveCut = async (cut) => {
        setSavingCutId(cut.id);
        const res = await apiCall('PATCH', `/acougue/yield-cuts/${cut.id}`, { name: cut.name, section: cut.section, pct_of_carcass: Number(cut.pct_of_carcass) });
        setSavingCutId(null);
        if (res.ok) { showToast('Corte atualizado', 'success'); onSaved(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const removeCut = async (id) => {
        if (!confirm('Remover este corte da tabela de rendimento?')) return;
        const res = await apiCall('DELETE', `/acougue/yield-cuts/${id}`);
        if (res.ok) { showToast('Corte removido', 'info'); onSaved(); }
        else showToast(res.data?.error || 'Erro ao remover', 'error');
      };

      const addCut = async (e) => {
        e.preventDefault();
        if (!newCut.name || !newCut.pct_of_carcass) { showToast('Preencha nome e percentual', 'error'); return; }
        setAddingCut(true);
        const res = await apiCall('POST', '/acougue/yield-cuts', { ...newCut, pct_of_carcass: Number(newCut.pct_of_carcass) });
        setAddingCut(false);
        if (res.ok) { showToast('Corte adicionado', 'success'); setNewCut({ name: '', section: 'traseiro', pct_of_carcass: '' }); onSaved(); }
        else showToast(res.data?.error || 'Erro ao adicionar', 'error');
      };

      return (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--bp-border)', paddingTop: 20 }}>
          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>Peso vivo → carcaça (% sobre o peso vivo)</p>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 12px' }}>Valores de referência — ajuste conforme raça, idade e jejum do lote que você compra.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
            <AcgInput label="Rendimento de carcaça (%)" type="number" step="0.1" value={stage1.dressing_pct} onChange={e => setStage1({ ...stage1, dressing_pct: e.target.value })} />
            <AcgInput label="Sangue (%)" type="number" step="0.1" value={stage1.blood_pct} onChange={e => setStage1({ ...stage1, blood_pct: e.target.value })} />
            <AcgInput label="Couro (%)" type="number" step="0.1" value={stage1.hide_pct} onChange={e => setStage1({ ...stage1, hide_pct: e.target.value })} />
            <AcgInput label="Cabeça/Patas (%)" type="number" step="0.1" value={stage1.head_feet_pct} onChange={e => setStage1({ ...stage1, head_feet_pct: e.target.value })} />
          </div>
          <AcgButton type="button" onClick={saveStage1} disabled={savingStage1} style={{ marginBottom: 24 }}>{savingStage1 ? 'Salvando...' : 'Salvar percentuais de carcaça'}</AcgButton>

          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Cortes (% sobre o peso de carcaça)</p>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--bp-text-faint)', fontSize: 11 }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--bp-text-faint)', fontSize: 11 }}>Seção</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--bp-text-faint)', fontSize: 11 }}>% carcaça</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {localCuts.map(cut => (
                  <tr key={cut.id} style={{ borderBottom: '1px solid var(--bp-border)' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <input value={cut.name} onChange={e => setLocalCuts(prev => prev.map(c => c.id === cut.id ? { ...c, name: e.target.value } : c))} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)' }} />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <select value={cut.section} onChange={e => setLocalCuts(prev => prev.map(c => c.id === cut.id ? { ...c, section: e.target.value } : c))} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)' }}>
                        <option value="dianteiro">Dianteiro</option>
                        <option value="traseiro">Traseiro</option>
                        <option value="ponta_agulha">Ponta de Agulha</option>
                        <option value="moida">Carne Moída</option>
                        <option value="perda">Perda</option>
                      </select>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <input type="number" step="0.1" value={cut.pct_of_carcass} onChange={e => setLocalCuts(prev => prev.map(c => c.id === cut.id ? { ...c, pct_of_carcass: e.target.value } : c))} style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => saveCut(cut)} disabled={savingCutId === cut.id} title="Salvar" style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', marginRight: 8 }}><i className="fas fa-check"></i></button>
                      <button onClick={() => removeCut(cut.id)} title="Remover" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={addCut} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}><AcgInput label="Novo corte" value={newCut.name} onChange={e => setNewCut({ ...newCut, name: e.target.value })} /></div>
            <div style={{ flex: '0 0 170px' }}>
              <AcgSelect label="Seção" value={newCut.section} onChange={e => setNewCut({ ...newCut, section: e.target.value })}>
                <option value="dianteiro">Dianteiro</option>
                <option value="traseiro">Traseiro</option>
                <option value="ponta_agulha">Ponta de Agulha</option>
                <option value="moida">Carne Moída</option>
                <option value="perda">Perda</option>
              </AcgSelect>
            </div>
            <div style={{ flex: '0 0 110px' }}><AcgInput label="% carcaça" type="number" step="0.1" value={newCut.pct_of_carcass} onChange={e => setNewCut({ ...newCut, pct_of_carcass: e.target.value })} /></div>
            <AcgButton type="submit" disabled={addingCut} style={{ marginBottom: 12 }}>{addingCut ? 'Adicionando...' : 'Adicionar corte'}</AcgButton>
          </form>
        </div>
      );
    }

    function AcougueRendimento({ showToast }) {
      const [liveWeight, setLiveWeight] = useState('');
      const [settings, setSettings] = useState(null);
      const [cuts, setCuts] = useState([]);
      const [products, setProducts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [prices, setPrices] = useState({});
      const [launching, setLaunching] = useState({});
      const [showEditPct, setShowEditPct] = useState(false);

      const load = async () => {
        setLoading(true);
        const [settingsRes, cutsRes, productsRes] = await Promise.all([
          apiCall('GET', '/acougue/settings'),
          apiCall('GET', '/acougue/yield-cuts'),
          apiCall('GET', '/acougue/products'),
        ]);
        if (settingsRes.ok) setSettings(settingsRes.data); else showToast(settingsRes.data?.error || 'Erro ao carregar configurações', 'error');
        if (cutsRes.ok) setCuts(cutsRes.data);
        if (productsRes.ok) setProducts(productsRes.data);
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      if (loading || !settings) return <AcgSpinner />;

      const peso = Number(liveWeight) || 0;
      const dressingPct = Number(settings.dressing_pct) || 50;
      const bloodPct = Number(settings.blood_pct) || 3.5;
      const hidePct = Number(settings.hide_pct) || 7;
      const headFeetPct = Number(settings.head_feet_pct) || 4;
      const viscerasPct = Math.max(0, 100 - dressingPct - bloodPct - hidePct - headFeetPct);

      const carcaca = peso * dressingPct / 100;
      const sangue = peso * bloodPct / 100;
      const couro = peso * hidePct / 100;
      const cabecaPatas = peso * headFeetPct / 100;
      const visceras = peso * viscerasPct / 100;

      const cutResults = cuts.map(c => ({ ...c, weight: carcaca * Number(c.pct_of_carcass) / 100 }));
      const totalCutsPct = cuts.reduce((a, c) => a + Number(c.pct_of_carcass), 0);

      const launchAsSaida = async (cut) => {
        const price = Number(prices[cut.id]) || 0;
        if (!price) { showToast('Informe o preço por kg antes de lançar', 'error'); return; }
        setLaunching(prev => ({ ...prev, [cut.id]: true }));
        const matchedProduct = products.find(p => p.name.toLowerCase() === cut.name.toLowerCase());
        const res = await apiCall('POST', '/acougue/cuts', {
          product_id: matchedProduct?.id || null,
          cut_name: cut.name,
          weight_kg: Math.round(cut.weight * 100) / 100,
          unit_price: price,
          output_date: acgToday(),
          destination: 'estoque',
          notes: `Lançado pela calculadora de rendimento (peso vivo: ${peso} kg)`,
        });
        setLaunching(prev => ({ ...prev, [cut.id]: false }));
        if (res.ok) showToast(`${cut.name} lançado no estoque (${fmtKg(cut.weight)})`, 'success');
        else showToast(res.data?.error || 'Erro ao lançar', 'error');
      };

      return (
        <div>
          <AcgSectionTitle icon="fa-calculator" title="Rendimento de Carcaça" subtitle="Informe o peso vivo do boi e veja quanto sai de cada corte, osso, sebo e sangue" />

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 220px' }}>
                <AcgInput label="Peso vivo do boi (kg)" type="number" step="0.1" min="0" value={liveWeight} onChange={e => setLiveWeight(e.target.value)} placeholder="Ex: 480" />
              </div>
              <AcgButton type="button" variant="ghost" onClick={() => setShowEditPct(s => !s)}>
                <i className="fas fa-sliders-h" style={{ marginRight: 6 }}></i>{showEditPct ? 'Ocultar' : 'Ajustar'} percentuais
              </AcgButton>
            </div>

            {showEditPct && <AcgYieldPercentEditor settings={settings} cuts={cuts} onSaved={load} showToast={showToast} />}
          </div>

          {peso > 0 && (
            <>
              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 14px' }}>Peso vivo → Carcaça</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  <AcgCard label="Peso vivo" value={fmtKg(peso)} icon="fa-weight-hanging" color="var(--bp-text-secondary)" bg="var(--bp-card)" />
                  <AcgCard label={`Carcaça (${dressingPct}%)`} value={fmtKg(carcaca)} icon="fa-drumstick-bite" color={ACG_ACCENT} bg={ACG_ACCENT_BG} />
                  <AcgCard label={`Sangue (${bloodPct}%)`} value={fmtKg(sangue)} icon="fa-tint" color="#ef4444" bg="rgba(239,68,68,0.12)" />
                  <AcgCard label={`Couro (${hidePct}%)`} value={fmtKg(couro)} icon="fa-layer-group" color="#8b5cf6" bg="rgba(139,92,246,0.12)" />
                  <AcgCard label={`Cabeça/Patas (${headFeetPct}%)`} value={fmtKg(cabecaPatas)} icon="fa-paw" color="#f59e0b" bg="rgba(245,158,11,0.12)" />
                  <AcgCard label={`Vísceras (${viscerasPct.toFixed(1)}%)`} value={fmtKg(visceras)} icon="fa-circle-minus" color="#6b7280" bg="rgba(107,114,128,0.12)" />
                </div>
              </div>

              {ACG_SECTION_ORDER.map(section => {
                const sectionCuts = cutResults.filter(c => c.section === section);
                if (sectionCuts.length === 0) return null;
                const sectionTotal = sectionCuts.reduce((a, c) => a + c.weight, 0);
                return (
                  <div key={section} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ACG_SECTION_LABELS[section]}</span>
                      <span style={{ color: 'var(--bp-text-faint)', fontWeight: 600, fontSize: 12 }}>{fmtKg(sectionTotal)}</span>
                    </p>
                    <AcgTable
                      columns={[
                        { key: 'name', label: 'Corte' },
                        { key: 'pct', label: '% carcaça', align: 'right', render: r => `${Number(r.pct_of_carcass).toLocaleString('pt-BR')}%` },
                        { key: 'weight', label: 'Peso', align: 'right', render: r => fmtKg(r.weight) },
                        { key: 'grams', label: 'Gramas', align: 'right', render: r => fmtG(r.weight) },
                        ...(section !== 'perda' ? [
                          { key: 'price', label: 'R$/kg', align: 'right', render: r => (
                            <input type="number" step="0.01" min="0" value={prices[r.id] || ''} onChange={e => setPrices(p => ({ ...p, [r.id]: e.target.value }))} placeholder="0,00" style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', textAlign: 'right' }} />
                          ) },
                          { key: 'actions', label: '', align: 'right', render: r => (
                            <button onClick={() => launchAsSaida(r)} disabled={launching[r.id]} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                              {launching[r.id] ? '...' : <><i className="fas fa-arrow-right-to-bracket" style={{ marginRight: 4 }}></i>Lançar no estoque</>}
                            </button>
                          ) },
                        ] : []),
                      ]}
                      rows={sectionCuts}
                    />
                  </div>
                );
              })}

              {Math.abs(totalCutsPct - 100) > 0.5 && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 16px', color: '#f59e0b', fontSize: 12 }}>
                  <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }}></i>
                  Os percentuais cadastrados somam {totalCutsPct.toFixed(1)}% da carcaça (o ideal é somar ~100%). Ajuste em "Ajustar percentuais" acima.
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    /* ---- SAÍDA DE CORTES ---- */
    function AcougueSaida({ showToast }) {
      const now = new Date();
      const [month, setMonth] = useState(now.getMonth() + 1);
      const [year, setYear] = useState(now.getFullYear());
      const [rows, setRows] = useState([]);
      const [products, setProducts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const emptyForm = { cut_name: '', product_id: '', weight_kg: '', unit_price: '', output_date: acgToday(), destination: 'estoque', notes: '' };
      const [form, setForm] = useState(emptyForm);
      const [saving, setSaving] = useState(false);

      const load = async () => {
        setLoading(true);
        const [cutsRes, productsRes] = await Promise.all([
          apiCall('GET', `/acougue/cuts?month=${month}&year=${year}`),
          apiCall('GET', '/acougue/products'),
        ]);
        if (cutsRes.ok) setRows(cutsRes.data); else showToast(cutsRes.data?.error || 'Erro ao carregar', 'error');
        if (productsRes.ok) setProducts(productsRes.data);
        setLoading(false);
      };
      useEffect(() => { load(); }, [month, year]);

      const submit = async (e) => {
        e.preventDefault();
        if (!form.cut_name || !form.weight_kg || !form.unit_price || !form.output_date) {
          showToast('Preencha o corte, peso, preço e data', 'error'); return;
        }
        setSaving(true);
        const res = await apiCall('POST', '/acougue/cuts', { ...form, product_id: form.product_id || null });
        setSaving(false);
        if (res.ok) { showToast('Saída de corte registrada', 'success'); setForm(emptyForm); setShowForm(false); load(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const remove = async (id) => {
        if (!confirm('Excluir este registro?')) return;
        const res = await apiCall('DELETE', `/acougue/cuts/${id}`);
        if (res.ok) { showToast('Registro excluído', 'info'); load(); }
        else showToast(res.data?.error || 'Erro ao excluir', 'error');
      };

      const destLabel = { estoque: 'Estoque', venda_direta: 'Venda direta', perda: 'Perda/quebra' };
      const destColor = { estoque: '#3b82f6', venda_direta: '#10b981', perda: '#ef4444' };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <AcgSectionTitle icon="fa-drumstick-bite" title="Saída de Cortes" subtitle="Cortes retirados da carcaça — para estoque, venda direta ou perda" />
            <AcgButton onClick={() => setShowForm(s => !s)}><i className="fas fa-plus" style={{ marginRight: 6 }}></i>Novo registro</AcgButton>
          </div>

          {showForm && (
            <form onSubmit={submit} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <AcgInput label="Nome do corte" value={form.cut_name} onChange={e => setForm({ ...form, cut_name: e.target.value })} placeholder="Ex: Picanha, Alcatra..." required />
                <AcgSelect label="Vincular a produto do caixa (opcional)" value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
                  <option value="">— nenhum —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </AcgSelect>
                <AcgInput label="Peso (kg)" type="number" step="0.01" min="0" value={form.weight_kg} onChange={e => setForm({ ...form, weight_kg: e.target.value })} required />
                <AcgInput label="Preço por kg (R$)" type="number" step="0.01" min="0" value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} required />
                <AcgInput label="Data" type="date" value={form.output_date} onChange={e => setForm({ ...form, output_date: e.target.value })} required />
                <AcgSelect label="Destino" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}>
                  <option value="estoque">Estoque (fica disponível no caixa)</option>
                  <option value="venda_direta">Venda direta (saída imediata, fora do caixa)</option>
                  <option value="perda">Perda / quebra</option>
                </AcgSelect>
              </div>
              <AcgInput label="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              {form.weight_kg && form.unit_price && (
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, margin: '0 0 12px' }}>Total: <strong style={{ color: 'var(--bp-text)' }}>{fmtCur(Number(form.weight_kg) * Number(form.unit_price))}</strong></p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <AcgButton type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</AcgButton>
                <AcgButton type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</AcgButton>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }}>
              {acgMonthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }} />
          </div>

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 16 }}>
            {loading ? <AcgSpinner /> : (
              <AcgTable
                emptyLabel="Nenhuma saída neste período"
                columns={[
                  { key: 'output_date', label: 'Data', render: r => fmtDate(r.output_date) },
                  { key: 'cut_name', label: 'Corte' },
                  { key: 'weight_kg', label: 'Kg', align: 'right', render: r => Number(r.weight_kg).toFixed(2) },
                  { key: 'total_value', label: 'Total', align: 'right', render: r => fmtCur(r.total_value) },
                  { key: 'destination', label: 'Destino', render: r => <span style={{ color: destColor[r.destination], fontSize: 12, fontWeight: 600 }}>{destLabel[r.destination] || r.destination}</span> },
                  { key: 'actions', label: '', align: 'right', render: r => <button onClick={() => remove(r.id)} title="Excluir" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash"></i></button> },
                ]}
                rows={rows}
              />
            )}
          </div>
        </div>
      );
    }

    /* ---- CONFERÊNCIA DE ETIQUETAS ---- */
    // Existe por causa de um problema real: o PLU gravado na balança pode não ser o mesmo do
    // cadastro. O banco não revela isso (internamente está consistente) — só bipando a etiqueta
    // de verdade e comparando com o nome impresso nela. Com emissão fiscal ligada, um PLU
    // trocado vira produto e valor errados numa NFC-e autorizada.
    function AcougueConferencia({ showToast }) {
      const [resumo, setResumo] = useState(null);
      const [lido, setLido] = useState(null);
      const [codigo, setCodigo] = useState('');
      const [obs, setObs] = useState('');
      const inputRef = useRef(null);

      const load = async () => {
        const res = await apiCall('GET', '/acougue/plu-audit');
        if (res.ok) setResumo(res.data);
      };
      useEffect(() => { load(); inputRef.current?.focus(); }, []);

      const bipar = async (valor) => {
        const trimmed = valor.trim();
        setCodigo('');
        if (!trimmed) return;
        const res = await apiCall('GET', `/acougue/products/scan/${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setLido(null);
          showToast(res.data?.error || 'Não reconhecido', 'error');
          inputRef.current?.focus();
          return;
        }
        setLido({ ...res.data, etiqueta: trimmed });
        setObs('');
      };

      const responder = async (confere) => {
        if (!lido) return;
        const res = await apiCall('POST', `/acougue/products/${lido.product.id}/conferir-plu`,
          { confere, observacao: confere ? null : (obs || 'Etiqueta não corresponde ao cadastro') });
        if (res.ok) {
          showToast(confere ? `${lido.product.name} confirmado` : `${lido.product.name} marcado como divergente`, confere ? 'success' : 'error');
          setLido(null); setObs(''); load(); inputRef.current?.focus();
        } else showToast(res.data?.error || 'Erro ao registrar', 'error');
      };

      if (!resumo) return <AcgSpinner />;
      const pct = resumo.total ? Math.round(((resumo.conferidos + resumo.divergentes) / resumo.total) * 100) : 0;

      return (
        <div>
          <AcgSectionTitle icon="fa-clipboard-check" title="Conferir Etiquetas"
            subtitle="Bipe a etiqueta real da balança e confirme se o produto que aparece é o mesmo impresso nela" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            <AcgCard label="Conferidos" value={String(resumo.conferidos)} icon="fa-circle-check" color="#10b981" bg="rgba(16,185,129,0.12)" />
            <AcgCard label="Divergentes" value={String(resumo.divergentes)} icon="fa-triangle-exclamation" color="#ef4444" bg="rgba(239,68,68,0.12)" />
            <AcgCard label="Não conferidos" value={String(resumo.pendentes)} icon="fa-circle-question" color="#f59e0b" bg="rgba(245,158,11,0.12)" />
            <AcgCard label="Progresso" value={`${pct}%`} icon="fa-list-check" color={ACG_ACCENT} bg={`${ACG_ACCENT}22`} />
          </div>

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 6 }}>Bipe a etiqueta</span>
              <input ref={inputRef} autoFocus value={codigo}
                onChange={e => setCodigo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') bipar(codigo); }}
                placeholder="Aponte o leitor aqui..."
                style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: `2px solid ${ACG_ACCENT}55`, background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 16, fontFamily: 'DM Mono, monospace', boxSizing: 'border-box' }} />
            </label>

            {lido ? (
              <div>
                <div style={{ background: 'var(--bp-card)', border: `1px solid ${ACG_ACCENT}44`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
                  <div style={{ color: 'var(--bp-text-faint)', fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>O SISTEMA ENTENDEU</div>
                  <div className="syne" style={{ color: 'var(--bp-text)', fontSize: 26, fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>{lido.product.name}</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--bp-text-secondary)', fontSize: 13 }}>
                    <span>PLU <strong style={{ color: ACG_ACCENT, fontFamily: 'DM Mono, monospace' }}>{lido.scan?.scaleCode || '—'}</strong></span>
                    <span>{fmtCur(lido.product.price)}/{lido.product.unit}</span>
                    <span>{Number(lido.quantity).toFixed(3).replace('.', ',')} {lido.product.unit}</span>
                    <span>total <strong>{fmtCur(lido.quantity * lido.product.price)}</strong></span>
                  </div>
                </div>

                <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
                  Esse nome é o mesmo que está <strong>impresso na etiqueta</strong>?
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <AcgButton onClick={() => responder(true)}><i className="fas fa-check" style={{ marginRight: 6 }}></i>Confere</AcgButton>
                  <AcgButton variant="ghost" onClick={() => responder(false)} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                    <i className="fas fa-xmark" style={{ marginRight: 6 }}></i>Não confere
                  </AcgButton>
                  <input value={obs} onChange={e => setObs(e.target.value)}
                    placeholder="o que está escrito na etiqueta?"
                    style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }} />
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>
                Pegue uma etiqueta impressa pela balança e bipe acima.
              </p>
            )}
          </div>

          {resumo.lista_divergentes.length > 0 && (
            <div>
              <p className="syne" style={{ color: '#ef4444', fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }}></i>
                Divergentes — corrija antes de vender com nota fiscal
              </p>
              <AcgTable
                emptyLabel="Nenhuma divergência"
                columns={[
                  { key: 'scale_code', label: 'PLU' },
                  { key: 'name', label: 'Sistema diz que é' },
                  { key: 'price', label: 'Preço', align: 'right', render: r => fmtCur(r.price) },
                  { key: 'plu_observacao', label: 'Etiqueta diz', render: r => r.plu_observacao || '—' },
                ]}
                rows={resumo.lista_divergentes}
              />
            </div>
          )}
        </div>
      );
    }

    /* ---- PRODUTOS (catálogo do caixa) ---- */
    function AcougueProdutos({ showToast }) {
      const [products, setProducts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const [editingId, setEditingId] = useState(null);
      const FISCAL_FIELDS = ['ncm', 'cfop', 'cest', 'origem', 'icms_cst', 'icms_aliquota', 'icms_reducao_bc', 'pis_cst', 'cofins_cst'];
      const emptyForm = { barcode: '', scale_code: '', name: '', category: 'corte', unit: 'kg', price: '', cost_price: '', stock_qty: '',
        ncm: '', cfop: '', cest: '', origem: '0', icms_cst: '', icms_aliquota: '', icms_reducao_bc: '', pis_cst: '', cofins_cst: '' };
      const [form, setForm] = useState(emptyForm);
      const [saving, setSaving] = useState(false);

      const load = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/acougue/products');
        if (res.ok) setProducts(res.data); else showToast(res.data?.error || 'Erro ao carregar produtos', 'error');
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      const startEdit = (p) => {
        setEditingId(p.id);
        const fiscal = {};
        FISCAL_FIELDS.forEach(f => { fiscal[f] = p[f] ?? (f === 'origem' ? '0' : ''); });
        setForm({ barcode: p.barcode || '', scale_code: p.scale_code || '', name: p.name, category: p.category, unit: p.unit, price: p.price, cost_price: p.cost_price || '', stock_qty: p.stock_qty || '', ...fiscal });
        setShowForm(true);
      };

      const startNew = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

      const submit = async (e) => {
        e.preventDefault();
        if (!form.name || form.price === '') { showToast('Preencha nome e preço', 'error'); return; }
        setSaving(true);
        const payload = { ...form, barcode: form.barcode || null, scale_code: form.scale_code || null, price: Number(form.price), cost_price: Number(form.cost_price) || 0, stock_qty: Number(form.stock_qty) || 0 };
        // Campos fiscais vazios viram null (e não string vazia) para o servidor conseguir
        // distinguir "não preenchido" na hora de barrar a emissão da NFC-e.
        FISCAL_FIELDS.forEach(f => { payload[f] = form[f] === '' ? null : form[f]; });
        ['icms_aliquota', 'icms_reducao_bc'].forEach(f => { payload[f] = form[f] === '' ? null : Number(form[f]); });
        const res = editingId
          ? await apiCall('PATCH', `/acougue/products/${editingId}`, payload)
          : await apiCall('POST', '/acougue/products', payload);
        setSaving(false);
        if (res.ok) { showToast(editingId ? 'Produto atualizado' : 'Produto cadastrado', 'success'); setForm(emptyForm); setShowForm(false); setEditingId(null); load(); }
        else showToast(res.data?.error || 'Erro ao salvar produto', 'error');
      };

      const remove = async (id) => {
        if (!confirm('Remover este produto? Ele deixa de aparecer no caixa.')) return;
        const res = await apiCall('DELETE', `/acougue/products/${id}`);
        if (res.ok) { showToast('Produto removido', 'info'); load(); }
        else showToast(res.data?.error || 'Erro ao remover', 'error');
      };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <AcgSectionTitle icon="fa-tags" title="Produtos" subtitle="Catálogo usado pelo Caixa — cadastre o código de barras e o preço de venda" />
            <AcgButton onClick={startNew}><i className="fas fa-plus" style={{ marginRight: 6 }}></i>Novo produto</AcgButton>
          </div>

          {showForm && (
            <form onSubmit={submit} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <AcgInput label="Nome do produto" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Picanha" required />
                <AcgInput label="Código de barras (EAN de fábrica)" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="Escaneie ou digite" />
                <AcgInput label="Código de balança (PLU)" value={form.scale_code} onChange={e => setForm({ ...form, scale_code: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 12"
                  hint="O mesmo número que este corte tem na balança. Sem ele, a etiqueta não é reconhecida no caixa." />
                <AcgSelect label="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="corte">Corte</option>
                  <option value="carcaca">Carcaça</option>
                  <option value="outro">Outro</option>
                </AcgSelect>
                <AcgSelect label="Unidade" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="kg">Kg</option>
                  <option value="un">Unidade</option>
                </AcgSelect>
                <AcgInput label="Preço de venda (R$)" type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
                <AcgInput label="Custo (R$, opcional)" type="number" step="0.01" min="0" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} />
                <AcgInput label="Estoque inicial" type="number" step="0.01" min="0" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} />
              </div>

              <div style={{ borderTop: '1px solid var(--bp-border)', marginTop: 16, paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 4 }}>Dados fiscais (NFC-e)</div>
                <div style={{ fontSize: 11, color: 'var(--bp-text-faint)', marginBottom: 12, lineHeight: 1.5 }}>
                  Obrigatórios para emitir nota fiscal no caixa. Os valores corretos dependem do corte e do
                  regime tributário do açougue — confirme com o contador. Sem eles a venda é registrada normalmente,
                  mas o cupom sai sem valor fiscal.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <AcgInput label="NCM" value={form.ncm} onChange={e => setForm({ ...form, ncm: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 02013000" hint="8 dígitos. Varia entre carne fresca, resfriada e congelada." />
                  <AcgInput label="CFOP" value={form.cfop} onChange={e => setForm({ ...form, cfop: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 5102" hint="Venda no balcão dentro do estado costuma ser 5102." />
                  <AcgInput label="CEST (se houver)" value={form.cest} onChange={e => setForm({ ...form, cest: e.target.value.replace(/\D/g, '') })} placeholder="Opcional" />
                  <AcgSelect label="Origem da mercadoria" value={form.origem} onChange={e => setForm({ ...form, origem: e.target.value })}>
                    <option value="0">0 — Nacional</option>
                    <option value="1">1 — Estrangeira, importação direta</option>
                    <option value="2">2 — Estrangeira, adquirida no mercado interno</option>
                  </AcgSelect>
                  <AcgInput label="CST / CSOSN do ICMS" value={form.icms_cst} onChange={e => setForm({ ...form, icms_cst: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 00, 20, 40, 102" hint="Regime Normal usa CST; Simples Nacional usa CSOSN." />
                  <AcgInput label="% ICMS" type="number" step="0.01" min="0" value={form.icms_aliquota} onChange={e => setForm({ ...form, icms_aliquota: e.target.value })} placeholder="Ex: 17" />
                  <AcgInput label="% Redução da base" type="number" step="0.01" min="0" value={form.icms_reducao_bc} onChange={e => setForm({ ...form, icms_reducao_bc: e.target.value })} placeholder="Opcional" hint="Carne tem redução de base em vários estados." />
                  <AcgInput label="CST do PIS" value={form.pis_cst} onChange={e => setForm({ ...form, pis_cst: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 01" />
                  <AcgInput label="CST do COFINS" value={form.cofins_cst} onChange={e => setForm({ ...form, cofins_cst: e.target.value.replace(/\D/g, '') })} placeholder="Ex: 01" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <AcgButton type="submit" disabled={saving}>{saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar produto'}</AcgButton>
                <AcgButton type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</AcgButton>
              </div>
            </form>
          )}

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 16 }}>
            {loading ? <AcgSpinner /> : (
              <AcgTable
                emptyLabel="Nenhum produto cadastrado ainda"
                columns={[
                  { key: 'barcode', label: 'Código de barras', render: r => r.barcode || '—' },
                  { key: 'scale_code', label: 'PLU balança', render: r => r.scale_code || '—' },
                  { key: 'name', label: 'Nome' },
                  { key: 'category', label: 'Categoria' },
                  { key: 'unit', label: 'Un' },
                  { key: 'price', label: 'Preço', align: 'right', render: r => fmtCur(r.price) },
                  { key: 'stock_qty', label: 'Estoque', align: 'right', render: r => Number(r.stock_qty).toFixed(2) },
                  { key: 'actions', label: '', align: 'right', render: r => (
                    <span>
                      <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', marginRight: 10 }}><i className="fas fa-pen"></i></button>
                      <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-trash"></i></button>
                    </span>
                  ) },
                ]}
                rows={products}
              />
            )}
          </div>
        </div>
      );
    }

    // Formas de pagamento aceitas. Vale alimentação é indispensável num açougue e faltava;
    // "fiado" é a caderneta, que a SEFAZ reconhece como crédito do próprio estabelecimento.
    const ACG_PAGAMENTOS = [
      { id: 'dinheiro', label: 'Dinheiro' },
      { id: 'cartao_debito', label: 'Cartão de débito' },
      { id: 'cartao_credito', label: 'Cartão de crédito' },
      { id: 'pix', label: 'PIX' },
      { id: 'vale_alimentacao', label: 'Vale alimentação' },
      { id: 'vale_refeicao', label: 'Vale refeição' },
      { id: 'transferencia', label: 'Transferência' },
      { id: 'cheque', label: 'Cheque' },
      { id: 'credito_loja', label: 'Fiado (caderneta)' },
    ];
    const acgLabelPagamento = (id) => (ACG_PAGAMENTOS.find(p => p.id === id) || {}).label || id;

    /* ---- ATALHOS DE TECLADO DO CAIXA ---- */
    // Rótulos e ordem de exibição na barra de funções. A ordem aqui é a ordem na tela.
    const ACG_ACOES_CAIXA = [
      { id: 'foco_codigo',    label: 'Buscar produto' },
      { id: 'cpf_nota',       label: 'CPF na nota' },
      { id: 'finalizar',      label: 'Finalizar venda' },
      { id: 'reimprimir',     label: 'Reimprimir último' },
      { id: 'troco',          label: 'Calcular troco' },
      { id: 'desconto',       label: 'Aplicar desconto' },
      { id: 'suspender',      label: 'Suspender/Retomar' },
      { id: 'remover_item',   label: 'Remover último item' },
      { id: 'cancelar_venda', label: 'Cancelar venda' },
      { id: 'abrir_gaveta',   label: 'Abrir gaveta' },
    ];

    const ACG_HOTKEYS_PADRAO = {
      foco_codigo: 'F2', cpf_nota: 'F4', finalizar: 'F5', reimprimir: 'F6',
      // F7 e F8 estavam livres. Troco e desconto são as duas contas que o operador faz de mão
      // cheia, com o cliente esperando — tirar a mão do leitor para achar o campo com o mouse
      // é o que trava a fila.
      troco: 'F8', desconto: 'F7',
      cancelar_venda: 'F9', remover_item: 'F10', suspender: 'F12',
      // F3: F1 é ajuda do navegador e F11 é tela cheia — nenhuma dá para interceptar.
      abrir_gaveta: 'F3',
    };

    // As settings guardam o mapa como texto JSON; se vier corrompido, cai no padrão em vez
    // de deixar o caixa sem atalho nenhum.
    function acgLerHotkeys(settings) {
      try {
        const salvo = typeof settings?.hotkeys === 'string' ? JSON.parse(settings.hotkeys) : settings?.hotkeys;
        return { ...ACG_HOTKEYS_PADRAO, ...(salvo || {}) };
      } catch { return { ...ACG_HOTKEYS_PADRAO }; }
    }

    /* ---- IMPRESSÃO DO CUPOM (80mm) ---- */
    // Imprime pelo diálogo do navegador, na impressora instalada na máquina do balcão. É o
    // caminho possível enquanto o sistema roda na nuvem: uma página web não alcança impressora
    // USB. (Com o sistema rodando dentro da loja dá pra falar ESC/POS direto na porta 9100 da
    // GS-FJ80H-UE, que tem interface de rede — aí a impressão sai sem diálogo nenhum.)
    //
    // Quando a NFC-e foi autorizada, o documento legal é o DANFE devolvido pela Focus, não este
    // layout: nesse caso abrimos o DANFE oficial. Este layout cobre o caso não autorizado, e aí
    // sai explicitamente carimbado como sem valor fiscal — imprimir algo parecido com cupom
    // fiscal sem autorização da SEFAZ é documento falso.
    // Imprime um HTML qualquer sem depender de pop-up: iframe escondido, mesma origem.
    // window.open é a causa nº 1 de "cliquei em finalizar e não imprimiu" — o navegador barra
    // a janela e o operador fica olhando a tela sem cupom, com a fila esperando.
    function acgImprimirHtml(html) {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(frame);
      frame.contentDocument.open();
      frame.contentDocument.write(html);
      frame.contentDocument.close();
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    }

    // Busca um arquivo de rota autenticada e devolve o Blob. <a href> e <iframe src> não
    // carregam o cabeçalho de autorização, então não dá para apontar direto para a rota:
    // é preciso buscar com o token e trabalhar com o conteúdo.
    async function acgBaixarDaNota(notaId, tipo) {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      let res;
      try {
        res = await fetch(`${API_URL}/acougue/notas/${notaId}/${tipo}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch {
        return { ok: false, erro: 'Sem conexão com o servidor.' };
      }
      if (!res.ok) {
        let erro = `Não foi possível obter o ${tipo.toUpperCase()}.`;
        try { erro = (await res.json()).error || erro; } catch {}
        return { ok: false, erro };
      }
      return { ok: true, blob: await res.blob() };
    }

    // Imprime o DANFE OFICIAL, o que a SEFAZ autorizou — com QR Code, protocolo e chave.
    // Devolve false quando não conseguiu, para quem chamou decidir o que fazer.
    async function acgImprimirDanfe(notaId) {
      const r = await acgBaixarDaNota(notaId, 'danfe');
      if (!r.ok) return r;
      const html = await r.blob.text();
      acgImprimirHtml(html);
      return { ok: true };
    }

    async function acgBaixarXml(notaId, numero) {
      const r = await acgBaixarDaNota(notaId, 'xml');
      if (!r.ok) return r;
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nfe-${numero || notaId}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { ok: true };
    }

    function printCupom({ sale, items, paymentMethod, invoice, settings }) {

      const s = settings || {};
      const esc = (v) => String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const money = (v) => Number(v || 0).toFixed(2).replace('.', ',');
      const pagamentoLabel = acgLabelPagamento(paymentMethod);

      const linhas = items.map((i, n) => `
        <tr><td colspan="4" class="desc">${String(n + 1).padStart(3, '0')} ${esc(i.name)}</td></tr>
        <tr>
          <td class="q">${Number(i.quantity).toFixed(3).replace('.', ',')}</td>
          <td class="u">${esc((i.unit || '').toUpperCase())}</td>
          <td class="p">x ${money(i.unit_price)}</td>
          <td class="t">${money(i.subtotal)}</td>
        </tr>`).join('');

      const cabecalhoFiscal = invoice ? `
        <div class="c b">VIA DE CONFERÊNCIA</div>
        <div class="c">NFC-e nº ${esc(invoice.numero)} — Série ${esc(invoice.serie)}</div>
        <div class="hr"></div>
        <div class="small">Chave de acesso:<br/>${esc(invoice.chave_acesso || '').replace(/(.{4})/g, '$1 ')}</div>
        <div class="small">Consulte em: www.sefaz.es.gov.br/nfce/consulta</div>
        <div class="c small aviso">O DANFE oficial, com QR Code, sai pelo sistema<br/>em Relatórios &gt; Histórico de vendas</div>
      ` : `
        <div class="c b aviso">*** SEM VALOR FISCAL ***</div>
        <div class="c small">Comprovante de venda — não substitui<br/>o documento fiscal exigido por lei</div>
      `;

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.sale_number)}</title>
        <style>
          @page { size: 80mm auto; margin: 3mm; }
          * { box-sizing: border-box; }
          body { width: 74mm; margin: 0; font-family: "Courier New", monospace; font-size: 11px; color: #000; }
          .c { text-align: center; }
          .b { font-weight: bold; }
          .small { font-size: 9px; word-break: break-all; }
          .aviso { font-size: 13px; margin: 4px 0; }
          .hr { border-top: 1px dashed #000; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 0; vertical-align: top; }
          .desc { padding-top: 3px; }
          .q { width: 22%; } .u { width: 12%; } .p { width: 33%; } .t { width: 33%; text-align: right; }
          .tot { font-size: 15px; font-weight: bold; display: flex; justify-content: space-between; margin-top: 4px; }
          .lin { display: flex; justify-content: space-between; }
        </style></head><body>
        <div class="c b">${esc(s.business_name || 'REI DAS CARNES')}</div>
        <div class="c small">CNPJ ${esc(s.cnpj || '—')} — IE ${esc(s.ie || '—')}</div>
        <div class="c small">${esc(s.logradouro || '')} ${esc(s.numero || '')} ${esc(s.bairro || '')}<br/>${esc(s.municipio || '')} ${esc(s.uf || '')}</div>
        <div class="hr"></div>
        ${cabecalhoFiscal}
        <div class="hr"></div>
        <div class="small">Venda ${esc(sale.sale_number)} — ${new Date().toLocaleString('pt-BR')}</div>
        <div class="hr"></div>
        <table>
          <tr class="b"><td colspan="2">QTD/UN</td><td>VL UNIT</td><td class="t">TOTAL</td></tr>
          ${linhas}
        </table>
        <div class="hr"></div>
        <div class="lin"><span>Qtde. total de itens</span><span>${items.length}</span></div>
        <div class="tot"><span>TOTAL R$</span><span>${money(sale.total_value)}</span></div>
        <div class="lin"><span>${esc(pagamentoLabel)}</span><span>${money(sale.total_value)}</span></div>
        <div class="hr"></div>
        <div class="c small">Obrigado pela preferência!</div>
      </body></html>`;

      acgImprimirHtml(html);
    }

    /* ---- PRODUÇÃO E LOTES ---- */
    // Linguiça, hambúrguer e temperados consomem insumos. Sem registrar, o estoque mente
    // duas vezes: não baixa o que foi consumido e não sobe o que foi produzido.
    function AcougueProducao({ showToast }) {
      const [receitas, setReceitas] = useState([]);
      const [lotes, setLotes] = useState([]);
      const [produtos, setProdutos] = useState([]);
      const [form, setForm] = useState(null);
      const [prod, setProd] = useState(null);

      const load = async () => {
        const [r1, r2, r3] = await Promise.all([
          apiCall('GET', '/acougue/recipes'),
          apiCall('GET', '/acougue/batches'),
          apiCall('GET', '/acougue/products'),
        ]);
        if (r1.ok) setReceitas(r1.data);
        if (r2.ok) setLotes(r2.data);
        if (r3.ok) setProdutos(r3.data);
      };
      useEffect(() => { load(); }, []);

      const salvarReceita = async () => {
        const itens = (form.itens || []).filter(i => i.insumo_id && Number(i.quantidade) > 0);
        if (!form.product_id || !itens.length || !(Number(form.rendimento_kg) > 0)) {
          showToast('Preencha produto, rendimento e ao menos um insumo', 'error'); return;
        }
        const res = await apiCall('POST', '/acougue/recipes', { ...form, itens });
        if (res.ok) { showToast('Ficha técnica salva', 'success'); setForm(null); load(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const produzir = async () => {
        const res = await apiCall('POST', '/acougue/production', prod);
        if (res.ok) {
          showToast(`Lote ${res.data.codigo} produzido — ${fmtCur(res.data.custo_por_kg)}/kg`, 'success');
          setProd(null); load();
        } else showToast(res.data?.error || 'Erro ao produzir', 'error');
      };

      const vencendo = lotes.filter(l => l.situacao === 'vencido' || l.situacao === 'vence_logo');

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <AcgSectionTitle icon="fa-industry" title="Produção e Lotes" subtitle="Ficha técnica, custo do que é fabricado e controle de validade" />
            <div style={{ display: 'flex', gap: 8 }}>
              <AcgButton variant="ghost" onClick={() => setForm({ product_id: '', rendimento_kg: '', itens: [{ insumo_id: '', quantidade: '' }] })}>Nova ficha técnica</AcgButton>
              <AcgButton onClick={() => setProd({ product_id: '', quantidade: '', validade: '' })}>Produzir</AcgButton>
            </div>
          </div>

          {vencendo.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <p className="syne" style={{ color: '#ef4444', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>
                <i className="fas fa-clock" style={{ marginRight: 6 }}></i>
                {vencendo.length} lote(s) vencido(s) ou vencendo em até 3 dias
              </p>
              <p style={{ color: 'var(--bp-text-secondary)', fontSize: 12, margin: 0 }}>
                Produto perecível parado vira perda e risco sanitário. Escoe ou descarte.
              </p>
            </div>
          )}

          {form && (
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Ficha técnica</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <AcgSelect label="Produto fabricado" value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
                  <option value="">selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </AcgSelect>
                <AcgInput label="Rendimento (kg por receita)" type="number" step="0.001" min="0" value={form.rendimento_kg}
                  onChange={e => setForm({ ...form, rendimento_kg: e.target.value })} hint="quanto sai a cada batida" />
              </div>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '4px 0 8px' }}>Insumos consumidos</p>
              {(form.itens || []).map((it, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 6 }}>
                  <AcgSelect label="" value={it.insumo_id} onChange={e => {
                    const itens = [...form.itens]; itens[idx] = { ...it, insumo_id: e.target.value }; setForm({ ...form, itens });
                  }}>
                    <option value="">insumo...</option>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </AcgSelect>
                  <AcgInput label="" type="number" step="0.001" min="0" placeholder="qtd" value={it.quantidade} onChange={e => {
                    const itens = [...form.itens]; itens[idx] = { ...it, quantidade: e.target.value }; setForm({ ...form, itens });
                  }} />
                  <button onClick={() => setForm({ ...form, itens: form.itens.filter((_, i) => i !== idx) })}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginBottom: 12 }}>remover</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <AcgButton variant="ghost" onClick={() => setForm({ ...form, itens: [...(form.itens || []), { insumo_id: '', quantidade: '' }] })}>+ insumo</AcgButton>
                <AcgButton onClick={salvarReceita}>Salvar ficha</AcgButton>
                <AcgButton variant="ghost" onClick={() => setForm(null)}>Cancelar</AcgButton>
              </div>
            </div>
          )}

          {prod && (
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Produzir</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <AcgSelect label="Produto" value={prod.product_id} onChange={e => setProd({ ...prod, product_id: e.target.value })}>
                  <option value="">selecione...</option>
                  {receitas.map(r => <option key={r.product_id} value={r.product_id}>{r.produto}</option>)}
                </AcgSelect>
                <AcgInput label="Quantidade (kg)" type="number" step="0.001" min="0" value={prod.quantidade} onChange={e => setProd({ ...prod, quantidade: e.target.value })} />
                <AcgInput label="Validade" type="date" value={prod.validade} onChange={e => setProd({ ...prod, validade: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <AcgButton onClick={produzir} disabled={!prod.product_id || !(Number(prod.quantidade) > 0)}>Confirmar produção</AcgButton>
                <AcgButton variant="ghost" onClick={() => setProd(null)}>Cancelar</AcgButton>
              </div>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '8px 0 0' }}>
                Os insumos da ficha são baixados do estoque na proporção da quantidade produzida.
              </p>
            </div>
          )}

          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Fichas técnicas</p>
          <AcgTable
            emptyLabel="Nenhuma ficha cadastrada"
            columns={[
              { key: 'produto', label: 'Produto' },
              { key: 'rendimento_kg', label: 'Rende', align: 'right', render: r => `${r.rendimento_kg} kg` },
              { key: 'itens', label: 'Insumos', render: r => r.itens.map(i => `${i.quantidade} ${i.unit} ${i.insumo}`).join(' + ') },
              { key: 'custo_por_kg', label: 'Custo/kg', align: 'right', render: r => r.custo_por_kg != null
                ? fmtCur(r.custo_por_kg)
                : <span style={{ color: '#f59e0b', fontSize: 11 }} title="insumo sem custo cadastrado">sem custo</span> },
            ]}
            rows={receitas}
          />

          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '20px 0 10px' }}>Lotes em estoque</p>
          <AcgTable
            emptyLabel="Nenhum lote produzido"
            columns={[
              { key: 'codigo', label: 'Lote' },
              { key: 'produto', label: 'Produto' },
              { key: 'quantidade_restante', label: 'Resta', align: 'right', render: r => `${Number(r.quantidade_restante).toFixed(3)} ${r.unit}` },
              { key: 'custo_por_kg', label: 'Custo/kg', align: 'right', render: r => r.custo_por_kg != null ? fmtCur(r.custo_por_kg) : '—' },
              { key: 'validade', label: 'Validade', render: r => r.validade ? fmtDate(r.validade) : '—' },
              { key: 'situacao', label: '', render: r => {
                const cor = { vencido: '#ef4444', vence_logo: '#f59e0b', ok: '#10b981', sem_validade: 'var(--bp-text-faint)' }[r.situacao];
                const txt = { vencido: 'VENCIDO', vence_logo: `vence em ${r.dias_para_vencer}d`, ok: `${r.dias_para_vencer}d`, sem_validade: 'sem validade' }[r.situacao];
                return <span style={{ color: cor, fontSize: 12, fontWeight: r.situacao === 'vencido' ? 700 : 400 }}>{txt}</span>;
              } },
            ]}
            rows={lotes}
          />
        </div>
      );
    }

    /* ---- RELATÓRIOS DE GESTÃO ---- */
    function AcougueRelatorios({ showToast }) {
      const hoje = new Date().toISOString().slice(0, 10);
      const trintaDias = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const [de, setDe] = useState(trintaDias);
      const [ate, setAte] = useState(hoje);
      const [dados, setDados] = useState(null);
      const [carregando, setCarregando] = useState(false);

      const carregar = async () => {
        setCarregando(true);
        const res = await apiCall('GET', `/acougue/reports?de=${de}&ate=${ate}`);
        setCarregando(false);
        if (res.ok) setDados(res.data); else showToast(res.data?.error || 'Erro', 'error');
      };
      useEffect(() => { carregar(); }, []);

      const maxDia = dados?.por_dia?.length ? Math.max(...dados.por_dia.map(d => d.total)) : 0;

      return (
        <div>
          <AcgSectionTitle icon="fa-chart-column" title="Relatórios" subtitle="O que vende, o que dá margem e por onde o dinheiro entra" />

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <AcgInput label="De" type="date" value={de} onChange={e => setDe(e.target.value)} />
              <AcgInput label="Até" type="date" value={ate} onChange={e => setAte(e.target.value)} />
            </div>
            <AcgButton onClick={carregar} disabled={carregando}>{carregando ? 'Carregando...' : 'Atualizar'}</AcgButton>
          </div>

          {dados && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                <AcgCard label="Faturamento" value={fmtCur(dados.faturamento)} icon="fa-sack-dollar" color="#10b981" bg="rgba(16,185,129,0.12)" />
                <AcgCard label="Vendas" value={String(dados.vendas)} icon="fa-receipt" color="#38bdf8" bg="rgba(56,189,248,0.12)" />
                <AcgCard label="Ticket médio" value={fmtCur(dados.ticket_medio)} icon="fa-tag" color="#a78bfa" bg="rgba(167,139,250,0.12)" />
                <AcgCard label="Margem" value={dados.margem_pct != null ? `${dados.margem_pct}%` : '—'} icon="fa-percent"
                  color={ACG_ACCENT} bg={`${ACG_ACCENT}22`} />
              </div>

              {dados.aviso_margem && (
                <p style={{ color: '#f59e0b', fontSize: 12, margin: '0 0 16px', lineHeight: 1.6 }}>
                  <i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }}></i>{dados.aviso_margem}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Por forma de pagamento</p>
                  {dados.por_pagamento.length === 0 ? <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>Sem vendas no período</p> :
                    dados.por_pagamento.map(f => (
                      <div key={f.forma} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--bp-text-secondary)', marginBottom: 3 }}>
                          <span>{acgLabelPagamento(f.forma)}</span><strong style={{ color: 'var(--bp-text)' }}>{fmtCur(f.total)}</strong>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--bp-card)' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: ACG_ACCENT,
                            width: `${dados.faturamento > 0 ? (f.total / dados.faturamento) * 100 : 0}%` }}></div>
                        </div>
                      </div>
                    ))}
                </div>

                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Faturamento por dia</p>
                  {dados.por_dia.length === 0 ? <p style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>Sem vendas no período</p> : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
                      {dados.por_dia.map(d => (
                        <div key={d.dia} title={`${fmtDate(d.dia)}: ${fmtCur(d.total)}`}
                          style={{ flex: 1, minWidth: 4, borderRadius: '3px 3px 0 0', background: ACG_ACCENT,
                            height: `${maxDia > 0 ? Math.max(4, (d.total / maxDia) * 100) : 4}%` }}></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Produtos mais vendidos</p>
              <AcgTable
                emptyLabel="Sem vendas no período"
                columns={[
                  { key: 'produto', label: 'Produto' },
                  { key: 'qtd', label: 'Qtd', align: 'right', render: r => `${r.qtd} ${r.unit || ''}` },
                  { key: 'receita', label: 'Receita', align: 'right', render: r => fmtCur(r.receita) },
                  { key: 'margem_pct', label: 'Margem', align: 'right', render: r => r.margem_pct == null
                    ? <span style={{ color: 'var(--bp-text-faint)' }} title="produto sem custo cadastrado">sem custo</span>
                    : <span style={{ color: r.margem_pct < 15 ? '#f59e0b' : '#10b981' }}>{r.margem_pct}%</span> },
                ]}
                rows={dados.por_produto}
              />

              {dados.sem_estoque.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p className="syne" style={{ color: '#f59e0b', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>
                    <i className="fas fa-box-open" style={{ marginRight: 6 }}></i>Sem estoque ({dados.sem_estoque.length})
                  </p>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 10px' }}>
                    Produto no catálogo sem saldo é venda perdida que ninguém registra.
                  </p>
                  <AcgTable
                    emptyLabel="Tudo com estoque"
                    columns={[
                      { key: 'name', label: 'Produto' },
                      { key: 'stock_qty', label: 'Saldo', align: 'right', render: r => `${Number(r.stock_qty).toFixed(3)} ${r.unit}` },
                    ]}
                    rows={dados.sem_estoque}
                  />
                </div>
              )}
            </>
          )}

          <AcougueHistoricoVendas showToast={showToast} de={de} ate={ate} />
        </div>
      );
    }

    /* ---- HISTÓRICO DE VENDAS (dentro de Relatórios, só do dono) ---- */
    // Mora aqui, e não no caixa, por dois motivos: a tela do caixa fica virada para o cliente,
    // e cancelar venda fechada ou emitir nota atrasada é decisão de dono.
    const ACG_NOTA_ROTULO = {
      autorizada: ['Autorizada', '#10b981'],
      processando: ['Processando', '#f59e0b'],
      rascunho: ['Rascunho', 'var(--bp-text-muted)'],
      erro: ['Erro', '#ef4444'],
      cancelada: ['Cancelada', '#ef4444'],
      denegada: ['Denegada', '#ef4444'],
    };

    function AcougueHistoricoVendas({ showToast, de, ate }) {
      const [dados, setDados] = useState(null);
      const [carregando, setCarregando] = useState(false);
      const [busca, setBusca] = useState('');
      const [pulo, setPulo] = useState(0);
      const [ocupado, setOcupado] = useState(null);
      const [expandida, setExpandida] = useState(null);
      const [itens, setItens] = useState({});

      const carregar = async (novoPulo = 0, termo = busca) => {
        setCarregando(true);
        const qs = `de=${de}&ate=${ate}&pulo=${novoPulo}&limite=50${termo.trim() ? `&q=${encodeURIComponent(termo.trim())}` : ''}`;
        const res = await apiCall('GET', `/acougue/sales/historico?${qs}`);
        setCarregando(false);
        if (!res.ok) { showToast(res.data?.error || 'Erro ao carregar o histórico', 'error'); return; }
        setPulo(novoPulo);
        // "Carregar mais" acumula; filtro novo ou troca de período começa do zero.
        setDados(d => (novoPulo > 0 && d ? { ...res.data, vendas: [...d.vendas, ...res.data.vendas] } : res.data));
      };
      useEffect(() => { carregar(0); }, [de, ate]);

      const verItens = async (venda) => {
        if (expandida === venda.id) { setExpandida(null); return; }
        setExpandida(venda.id);
        if (itens[venda.id]) return;
        const res = await apiCall('GET', `/acougue/sales/${venda.id}`);
        if (res.ok) setItens(m => ({ ...m, [venda.id]: res.data.items || [] }));
      };

      const cancelar = async (venda) => {
        const motivo = window.prompt(`Cancelar a venda ${venda.sale_number} de ${fmtCur(venda.total_value)}?\n\nO estoque dos itens volta para o saldo. Diga o motivo (fica no histórico de movimentação):`);
        if (motivo === null) return;
        setOcupado(venda.id);
        const res = await apiCall('POST', `/acougue/sales/${venda.id}/cancel`, { motivo });
        setOcupado(null);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível cancelar', 'error'); return; }
        showToast(`Venda ${venda.sale_number} cancelada — estoque devolvido`, 'info');
        carregar(0);
      };

      // Cancelar a NOTA na SEFAZ — ato diferente de cancelar a venda. A rota existia no servidor
      // desde sempre e nenhum botão a chamava: a trava de cancelar venda mandava "cancele a nota
      // antes" e não havia por onde fazer isso em tela nenhuma.
      const cancelarNota = async (venda) => {
        const minutos = Math.floor((Date.now() - new Date(venda.nota_emitida_em).getTime()) / 60000);
        const foraDoPrazo = minutos >= 30;
        // O prazo de 30 min é a regra geral da NFC-e, mas quem decide é a SEFAZ do estado —
        // por isso avisa e deixa tentar, em vez de bloquear por conta própria.
        const aviso = foraDoPrazo
          ? `ATENÇÃO: nota emitida há ${minutos} minutos. O prazo de cancelamento da NFC-e é de 30 minutos, então a SEFAZ provavelmente vai recusar. Tentar mesmo assim?\n\n`
          : `Emitida há ${minutos} min — restam cerca de ${30 - minutos} min do prazo legal.\n\n`;
        const justificativa = window.prompt(
          `${aviso}Cancelar na SEFAZ a NFC-e nº ${venda.nota_numero} (venda ${venda.sale_number}).\n\nJustificativa (a SEFAZ exige no mínimo 15 caracteres):`,
          '');
        if (justificativa === null) return;
        if (justificativa.trim().length < 15) { showToast('A SEFAZ exige justificativa com no mínimo 15 caracteres.', 'error'); return; }
        setOcupado(venda.id);
        const res = await apiCall('POST', `/acougue/nfce/${venda.nota_id}/cancelar`, { justificativa: justificativa.trim() });
        setOcupado(null);
        if (!res.ok) { showToast(res.data?.error || 'A SEFAZ recusou o cancelamento', 'error'); return; }
        showToast(`NFC-e nº ${venda.nota_numero} cancelada na SEFAZ`, 'success');
        carregar(0);
      };

      const imprimirDanfe = async (venda) => {
        setOcupado(venda.id);
        const r = await acgImprimirDanfe(venda.nota_id);
        setOcupado(null);
        if (!r.ok) showToast(r.erro, 'error');
      };

      const baixarXml = async (venda) => {
        setOcupado(venda.id);
        const r = await acgBaixarXml(venda.nota_id, venda.nota_numero);
        setOcupado(null);
        if (!r.ok) showToast(r.erro, 'error');
      };

      const emitirNota = async (venda) => {
        const cpf = window.prompt(`Emitir NFC-e da venda ${venda.sale_number} (${fmtCur(venda.total_value)}).\n\nCPF na nota (deixe vazio para consumidor não identificado):`);
        if (cpf === null) return;
        setOcupado(venda.id);
        const res = await apiCall('POST', `/acougue/sales/${venda.id}/nfce`, cpf.trim() ? { cpf: cpf.trim() } : {});
        setOcupado(null);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível emitir', 'error'); carregar(0); return; }
        if (res.data.status === 'autorizada') showToast(`NFC-e ${res.data.numero} autorizada`, 'success');
        else if (res.data.warning) showToast(res.data.warning, 'info');
        else showToast(`Nota ficou como "${res.data.status}"`, 'info');
        carregar(0);
      };

      const th = { textAlign: 'left', padding: '9px 10px', color: 'var(--bp-text-faint)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--bp-border)', whiteSpace: 'nowrap' };
      const td = { padding: '10px', borderBottom: '1px solid var(--bp-border)', fontSize: 12.5, color: 'var(--bp-text)', verticalAlign: 'middle' };
      const badge = (texto, cor) => <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, color: cor, background: `${cor}1f`, border: `1px solid ${cor}55`, whiteSpace: 'nowrap' }}>{texto}</span>;

      return (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 2px' }}>
                <i className="fas fa-receipt" style={{ color: ACG_ACCENT, marginRight: 8 }}></i>Histórico de vendas
              </p>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11.5, margin: 0 }}>
                Todas as vendas do período acima. É daqui que se cancela venda fechada e se emite nota atrasada.
              </p>
            </div>
            <form onSubmit={e => { e.preventDefault(); carregar(0); }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar por nº da venda..."
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12.5, minWidth: 190, fontFamily: 'Inter, sans-serif' }} />
              <AcgButton type="submit" variant="ghost" style={{ padding: '7px 12px', fontSize: 12 }}><i className="fas fa-magnifying-glass"></i></AcgButton>
            </form>
          </div>

          {dados && (
            <p style={{ color: 'var(--bp-text-muted)', fontSize: 12, margin: '0 0 10px' }}>
              {dados.total} venda(s) · {fmtCur(dados.faturamento)} faturado
              {dados.canceladas > 0 && <span style={{ color: '#ef4444' }}> · {dados.canceladas} cancelada(s)</span>}
              {!dados.focus_configurada && <span style={{ color: '#f59e0b' }}> · Focus NFe não configurada: nota emitida aqui fica como rascunho</span>}
            </p>
          )}

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, overflow: 'hidden' }}>
            {!dados ? <AcgSpinner /> : dados.vendas.length === 0 ? (
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, textAlign: 'center', padding: 30, margin: 0 }}>Nenhuma venda no período.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}>Nº</th><th style={th}>Quando</th><th style={th}>Operador</th>
                    <th style={th}>Pagamento</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
                    <th style={th}>Venda</th><th style={th}>Nota</th><th style={th}></th>
                  </tr></thead>
                  <tbody>
                    {dados.vendas.map(v => {
                      const cancelada = v.status === 'cancelada';
                      const [rotuloNota, corNota] = ACG_NOTA_ROTULO[v.nota_status] || [];
                      const podeEmitir = !cancelada && (!v.nota_status || v.nota_status === 'erro');
                      return (
                        <React.Fragment key={v.id}>
                          <tr style={{ opacity: cancelada ? 0.55 : 1 }}>
                            <td style={td}><span className="mono" style={{ fontSize: 12 }}>{v.sale_number}</span></td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{acgDataHora(v.created_at)}</td>
                            <td style={td}>{v.operador || '—'}{v.cliente && <div style={{ fontSize: 11, color: 'var(--bp-text-faint)' }}>{v.cliente}</div>}</td>
                            <td style={td}>{acgLabelPagamento(v.payment_method)}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtCur(v.total_value)}</td>
                            <td style={td}>{cancelada ? badge('Cancelada', '#ef4444') : badge('Concluída', '#10b981')}</td>
                            <td style={td}>
                              {rotuloNota ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                  {badge(v.nota_numero ? `${rotuloNota} nº ${v.nota_numero}` : rotuloNota, corNota)}
                                  {/* Botões, não links: a rota exige autenticação, e <a href>
                                      não carrega o cabeçalho do token. */}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    {v.danfe_url && (
                                      <button type="button" onClick={() => imprimirDanfe(v)}
                                        style={{ background: 'none', border: 'none', padding: 0, color: ACG_ACCENT, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}>
                                        imprimir DANFE
                                      </button>
                                    )}
                                    {v.xml_url && (
                                      <button type="button" onClick={() => baixarXml(v)}
                                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bp-text-muted)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}>
                                        XML
                                      </button>
                                    )}
                                    {/* Só para nota autorizada: rascunho não existe na SEFAZ,
                                        e cancelada ou denegada não se cancela de novo. */}
                                    {v.nota_status === 'autorizada' && (
                                      <button type="button" disabled={ocupado === v.id} onClick={() => cancelarNota(v)}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#ef4444', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Inter, sans-serif' }}>
                                        cancelar nota
                                      </button>
                                    )}
                                  </div>
                                  {v.nota_status === 'erro' && v.nota_erro && <span title={v.nota_erro} style={{ color: '#ef4444', fontSize: 10.5, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nota_erro}</span>}
                                </div>
                              ) : <span style={{ color: 'var(--bp-text-faint)', fontSize: 11.5 }}>sem nota</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <AcgButton type="button" variant="ghost" onClick={() => verItens(v)} title="Ver os itens" style={{ padding: '5px 9px', fontSize: 11.5 }}>
                                  <i className={`fas fa-chevron-${expandida === v.id ? 'up' : 'down'}`}></i>
                                </AcgButton>
                                {podeEmitir && (
                                  <AcgButton type="button" variant="ghost" disabled={ocupado === v.id} onClick={() => emitirNota(v)} title="Emitir a NFC-e desta venda" style={{ padding: '5px 9px', fontSize: 11.5 }}>
                                    <i className="fas fa-file-invoice"></i>
                                  </AcgButton>
                                )}
                                {!cancelada && (
                                  <AcgButton type="button" variant="danger" disabled={ocupado === v.id} onClick={() => cancelar(v)} title="Cancelar a venda e devolver o estoque" style={{ padding: '5px 9px', fontSize: 11.5 }}>
                                    <i className="fas fa-ban"></i>
                                  </AcgButton>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandida === v.id && (
                            <tr>
                              <td colSpan={8} style={{ ...td, background: 'var(--bp-card)' }}>
                                {!itens[v.id] ? <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>carregando itens...</span> : (
                                  <div style={{ display: 'grid', gap: 5 }}>
                                    {itens[v.id].map(it => (
                                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                                        <span>{it.product_name}</span>
                                        <span style={{ color: 'var(--bp-text-muted)' }} className="mono">
                                          {Number(it.quantity).toFixed(3).replace('.', ',')} × {fmtCur(it.unit_price)} = <strong style={{ color: 'var(--bp-text)' }}>{fmtCur(it.subtotal)}</strong>
                                        </span>
                                      </div>
                                    ))}
                                    {(Number(v.desconto) > 0 || Number(v.acrescimo) > 0 || Number(v.troco) > 0) && (
                                      <div style={{ color: 'var(--bp-text-faint)', fontSize: 11.5, borderTop: '1px solid var(--bp-border)', paddingTop: 5 }}>
                                        {Number(v.desconto) > 0 && <span style={{ marginRight: 12 }}>Desconto {fmtCur(v.desconto)}</span>}
                                        {Number(v.acrescimo) > 0 && <span style={{ marginRight: 12 }}>Acréscimo {fmtCur(v.acrescimo)}</span>}
                                        {Number(v.troco) > 0 && <span>Troco {fmtCur(v.troco)}</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {dados?.tem_mais && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <AcgButton type="button" variant="ghost" disabled={carregando} onClick={() => carregar(pulo + 50)}>
                {carregando ? 'Carregando...' : 'Carregar mais vendas'}
              </AcgButton>
            </div>
          )}
        </div>
      );
    }

    /* ---- CLIENTES E FIADO ---- */
    function AcougueClientes({ showToast }) {
      const [resumo, setResumo] = useState(null);
      const [clientes, setClientes] = useState([]);
      const [busca, setBusca] = useState('');
      const [form, setForm] = useState(null);
      const [extrato, setExtrato] = useState(null);
      const [pagando, setPagando] = useState({});

      const load = async () => {
        const [r1, r2] = await Promise.all([
          apiCall('GET', '/acougue/receivables/resumo'),
          apiCall('GET', `/acougue/customers${busca ? `?q=${encodeURIComponent(busca)}` : ''}`),
        ]);
        if (r1.ok) setResumo(r1.data);
        if (r2.ok) setClientes(r2.data);
      };
      useEffect(() => { load(); }, [busca]);

      const salvar = async () => {
        if (!form.nome?.trim()) { showToast('Informe o nome', 'error'); return; }
        const res = form.id
          ? await apiCall('PATCH', `/acougue/customers/${form.id}`, form)
          : await apiCall('POST', '/acougue/customers', form);
        if (res.ok) { showToast(form.id ? 'Cliente atualizado' : 'Cliente cadastrado', 'success'); setForm(null); load(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      const abrirExtrato = async (id) => {
        const res = await apiCall('GET', `/acougue/customers/${id}/extrato`);
        if (res.ok) setExtrato(res.data); else showToast(res.data?.error || 'Erro', 'error');
      };

      const receber = async (dividaId) => {
        const valor = Number(pagando[dividaId]);
        if (!(valor > 0)) { showToast('Informe o valor recebido', 'error'); return; }
        const res = await apiCall('POST', `/acougue/receivables/${dividaId}/pagar`, { valor });
        if (res.ok) {
          showToast(res.data.quitado ? 'Dívida quitada' : `Recebido — restam ${fmtCur(res.data.saldo_restante)}`, 'success');
          setPagando({ ...pagando, [dividaId]: '' });
          abrirExtrato(extrato.cliente.id); load();
        } else showToast(res.data?.error || 'Erro ao receber', 'error');
      };

      if (!resumo) return <AcgSpinner />;

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <AcgSectionTitle icon="fa-users" title="Clientes e Fiado" subtitle="Quem deve, quanto e desde quando" />
            <AcgButton onClick={() => setForm({ nome: '', telefone: '', documento: '', limite_credito: 0 })}>
              <i className="fas fa-plus" style={{ marginRight: 6 }}></i>Novo cliente
            </AcgButton>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
            <AcgCard label="Fiado na rua" value={fmtCur(resumo.total_na_rua)} icon="fa-hand-holding-dollar" color="#f59e0b" bg="rgba(245,158,11,0.12)" />
            <AcgCard label="Dívidas abertas" value={String(resumo.dividas)} icon="fa-receipt" color="#a78bfa" bg="rgba(167,139,250,0.12)" />
            <AcgCard label="Clientes devendo" value={String(resumo.clientes)} icon="fa-users" color="#38bdf8" bg="rgba(56,189,248,0.12)" />
            <AcgCard label="Acima do limite" value={String(resumo.devedores.filter(d => d.acima_do_limite).length)} icon="fa-triangle-exclamation" color="#ef4444" bg="rgba(239,68,68,0.12)" />
          </div>

          {form && (
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <AcgInput label="Nome" value={form.nome || ''} onChange={e => setForm({ ...form, nome: e.target.value })} required />
                <AcgInput label="Telefone" value={form.telefone || ''} onChange={e => setForm({ ...form, telefone: e.target.value })} />
                <AcgInput label="CPF/CNPJ" value={form.documento || ''} onChange={e => setForm({ ...form, documento: e.target.value })} />
                <AcgInput label="Limite de fiado (R$)" type="number" step="0.01" min="0" value={form.limite_credito || ''}
                  onChange={e => setForm({ ...form, limite_credito: e.target.value })} hint="0 = sem limite definido" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <AcgButton onClick={salvar}>Salvar</AcgButton>
                <AcgButton variant="ghost" onClick={() => setForm(null)}>Cancelar</AcgButton>
              </div>
            </div>
          )}

          {resumo.devedores.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 10px' }}>Quem está devendo</p>
              <AcgTable
                emptyLabel="Ninguém devendo"
                columns={[
                  { key: 'nome', label: 'Cliente' },
                  { key: 'telefone', label: 'Telefone', render: r => r.telefone || '—' },
                  { key: 'saldo', label: 'Deve', align: 'right', render: r => (
                    <strong style={{ color: r.acima_do_limite ? '#ef4444' : 'var(--bp-text)' }}>{fmtCur(r.saldo)}</strong>
                  ) },
                  { key: 'limite_credito', label: 'Limite', align: 'right', render: r => Number(r.limite_credito) > 0 ? fmtCur(r.limite_credito) : '—' },
                  { key: 'dias', label: 'Há', align: 'right', render: r => `${r.dias} dia(s)` },
                  { key: 'acao', label: '', align: 'right', render: r => (
                    <button onClick={() => abrirExtrato(r.id)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12 }}>extrato</button>
                  ) },
                ]}
                rows={resumo.devedores}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: 0 }}>Todos os clientes</p>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="buscar por nome, telefone ou documento..."
              style={{ flex: 1, minWidth: 200, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12 }} />
          </div>
          <AcgTable
            emptyLabel="Nenhum cliente cadastrado"
            columns={[
              { key: 'nome', label: 'Nome' },
              { key: 'telefone', label: 'Telefone', render: r => r.telefone || '—' },
              { key: 'saldo_devedor', label: 'Deve', align: 'right', render: r => r.saldo_devedor > 0 ? <strong style={{ color: '#f59e0b' }}>{fmtCur(r.saldo_devedor)}</strong> : '—' },
              { key: 'acao', label: '', align: 'right', render: r => (
                <>
                  <button onClick={() => abrirExtrato(r.id)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12, marginRight: 10 }}>extrato</button>
                  <button onClick={() => setForm(r)} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer', fontSize: 12 }}>editar</button>
                </>
              ) },
            ]}
            rows={clientes}
          />

          {extrato && (
            <div style={{ marginTop: 20, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: 0 }}>{extrato.cliente.nome}</p>
                <button onClick={() => setExtrato(null)} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer' }}>fechar</button>
              </div>
              <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: '0 0 14px' }}>
                Deve <strong style={{ color: '#f59e0b' }}>{fmtCur(extrato.saldo_devedor)}</strong>
                {extrato.dias_divida_mais_antiga != null && <> — a mais antiga há {extrato.dias_divida_mais_antiga} dia(s)</>}
              </p>
              <AcgTable
                emptyLabel="Sem dívidas"
                columns={[
                  { key: 'created_at', label: 'Data', render: r => fmtDate(r.created_at) },
                  { key: 'sale_number', label: 'Venda', render: r => r.sale_number || '—' },
                  { key: 'valor', label: 'Valor', align: 'right', render: r => fmtCur(r.valor) },
                  { key: 'valor_pago', label: 'Pago', align: 'right', render: r => fmtCur(r.valor_pago) },
                  { key: 'saldo', label: 'Resta', align: 'right', render: r => r.quitado_em
                    ? <span style={{ color: '#10b981' }}>quitada</span>
                    : <strong>{fmtCur(r.saldo)}</strong> },
                  { key: 'receber', label: '', align: 'right', render: r => r.quitado_em ? null : (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <input type="number" step="0.01" min="0" value={pagando[r.id] || ''} placeholder="valor"
                        onChange={e => setPagando({ ...pagando, [r.id]: e.target.value })}
                        style={{ width: 80, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12 }} />
                      <button onClick={() => receber(r.id)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12 }}>receber</button>
                    </div>
                  ) },
                ]}
                rows={extrato.dividas}
              />
            </div>
          )}
        </div>
      );
    }

    /* ---- PRECIFICAÇÃO PELO RENDIMENTO ---- */
    // Responde o que ninguém calcula de cabeça: com os preços praticados, esta carcaça dá
    // lucro? O custo da compra engana, porque cerca de 30% da carcaça vira osso, sebo e
    // perda — e o cliente não paga por isso.
    function AcouguePrecificacao({ showToast }) {
      const [carcacas, setCarcacas] = useState([]);
      const [selecionada, setSelecionada] = useState('');
      const [margem, setMargem] = useState(30);
      const [analise, setAnalise] = useState(null);
      const [carregando, setCarregando] = useState(false);

      useEffect(() => {
        apiCall('GET', '/acougue/carcass-entries').then(r => {
          if (r.ok) { setCarcacas(r.data); if (r.data[0]) setSelecionada(String(r.data[0].id)); }
        });
      }, []);

      const analisar = async () => {
        if (!selecionada) return;
        setCarregando(true);
        const res = await apiCall('GET', `/acougue/pricing/carcass/${selecionada}?margem=${margem}`);
        setCarregando(false);
        if (res.ok) setAnalise(res.data);
        else { setAnalise(null); showToast(res.data?.error || 'Erro ao calcular', 'error'); }
      };
      useEffect(() => { if (selecionada) analisar(); }, [selecionada]);

      const Cartao = ({ label, valor, sub, cor }) => (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ color: 'var(--bp-text-faint)', fontSize: 11, marginBottom: 4 }}>{label}</div>
          <div className="syne" style={{ color: cor || 'var(--bp-text)', fontWeight: 800, fontSize: 22 }}>{valor}</div>
          {sub && <div style={{ color: 'var(--bp-text-faint)', fontSize: 11, marginTop: 3 }}>{sub}</div>}
        </div>
      );

      return (
        <div>
          <AcgSectionTitle icon="fa-money-bill-trend-up" title="Precificação"
            subtitle="Quanto a carne realmente custa depois das perdas, e se os preços praticados cobrem isso" />

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <AcgSelect label="Carcaça" value={selecionada} onChange={e => setSelecionada(e.target.value)}>
                {carcacas.length === 0 && <option value="">nenhuma cadastrada</option>}
                {carcacas.map(c => (
                  <option key={c.id} value={c.id}>
                    {fmtDate(c.entry_date)} — {c.supplier_name} — {c.weight_kg} kg
                  </option>
                ))}
              </AcgSelect>
              <AcgInput label="Margem desejada (%)" type="number" min="0" max="99" value={margem}
                onChange={e => setMargem(e.target.value)} hint="margem sobre o preço de venda" />
            </div>
            <AcgButton onClick={analisar} disabled={!selecionada || carregando}>
              {carregando ? 'Calculando...' : 'Recalcular'}
            </AcgButton>
          </div>

          {analise && (
            <>
              {!analise.tabela_fechada && (
                <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>
                    <i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }}></i>{analise.aviso_tabela}
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Cartao label="Custo aparente" valor={fmtCur(analise.custo_aparente_por_kg)} sub="o que parece na nota de compra" />
                <Cartao label="Custo REAL por kg" valor={fmtCur(analise.custo_real_por_kg)}
                  sub={`+${analise.diferenca_pct}% depois das perdas`} cor="#f59e0b" />
                <Cartao label="Peso vendável" valor={`${analise.peso_vendavel} kg`}
                  sub={`de ${analise.peso_entrada} kg — ${analise.pct_perda}% é perda`} />
                <Cartao label="Margem atual" valor={analise.margem_atual_pct != null ? `${analise.margem_atual_pct}%` : '—'}
                  sub={`alvo: ${analise.margem_alvo_pct}%`}
                  cor={analise.margem_atual_pct == null ? undefined : (analise.margem_atual_pct >= analise.margem_alvo_pct ? '#10b981' : '#ef4444')} />
              </div>

              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <p style={{ color: 'var(--bp-text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Esta carcaça custou <strong>{fmtCur(analise.custo_total)}</strong>. Vendendo todos os cortes
                  pelos preços de hoje, ela renderia <strong>{fmtCur(analise.receita_esperada)}</strong>
                  {analise.margem_atual_pct != null && <> — margem de <strong>{analise.margem_atual_pct}%</strong></>}.
                  {analise.cortes_sem_preco > 0 && (
                    <span style={{ color: '#f59e0b' }}> {analise.cortes_sem_preco} corte(s) sem preço no catálogo ficaram de fora da conta.</span>
                  )}
                </p>
              </div>

              <AcgTable
                emptyLabel="Sem cortes"
                columns={[
                  { key: 'corte', label: 'Corte' },
                  { key: 'pct', label: '%', align: 'right', render: r => `${r.pct}%` },
                  { key: 'kg_esperado', label: 'Kg', align: 'right', render: r => r.kg_esperado.toFixed(2) },
                  { key: 'custo_rateado', label: 'Custo', align: 'right', render: r => fmtCur(r.custo_rateado) },
                  { key: 'preco_atual', label: 'Preço hoje', align: 'right', render: r => r.preco_atual != null ? fmtCur(r.preco_atual) : <span style={{ color: '#f59e0b' }}>sem preço</span> },
                  { key: 'margem_pct', label: 'Margem', align: 'right', render: r => r.margem_pct == null ? '—' : (
                    <span style={{ color: r.margem_pct < 0 ? '#ef4444' : (r.margem_pct < 15 ? '#f59e0b' : '#10b981') }}>{r.margem_pct}%</span>
                  ) },
                  { key: 'preco_sugerido', label: `Sugerido (${analise.margem_alvo_pct}%)`, align: 'right', render: r => r.preco_sugerido != null ? <strong style={{ color: ACG_ACCENT }}>{fmtCur(r.preco_sugerido)}</strong> : '—' },
                ]}
                rows={analise.linhas}
              />

              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
                <i className="fas fa-circle-info" style={{ marginRight: 5 }}></i>
                O preço sugerido reajusta todos os cortes pelo mesmo fator, preservando a relação entre eles —
                picanha continua valendo mais que músculo. Aplicar a mesma margem corte a corte deixaria a
                picanha barata demais e o músculo caro demais.
              </p>
            </>
          )}
        </div>
      );
    }

    /* ---- GAVETA DO CAIXA ---- */
    // Sem sessão de caixa não existe conferência de dinheiro: ninguém sabe se a gaveta bate
    // com o que foi vendido. Fica no topo do Caixa porque o operador precisa ver o estado da
    // gaveta antes de começar a vender, não escondido noutra aba.
    function AcougueGaveta({ showToast }) {
      const [sessao, setSessao] = useState(null);
      const [abrindo, setAbrindo] = useState('');
      const [painel, setPainel] = useState(null);
      const [mov, setMov] = useState({ tipo: 'sangria', valor: '', motivo: '' });
      const [contado, setContado] = useState('');

      const load = async () => {
        const res = await apiCall('GET', '/acougue/cash-session');
        if (res.ok) setSessao(res.data);
      };
      useEffect(() => { load(); }, []);

      const abrir = async () => {
        const res = await apiCall('POST', '/acougue/cash-session/abrir', { valor_abertura: Number(abrindo) || 0 });
        if (res.ok) { showToast('Caixa aberto', 'success'); setAbrindo(''); load(); }
        else showToast(res.data?.error || 'Erro ao abrir', 'error');
      };

      const lancarMov = async () => {
        const res = await apiCall('POST', '/acougue/cash-session/movimento', { ...mov, valor: Number(mov.valor) });
        if (res.ok) { showToast(`${mov.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} registrado`, 'success'); setMov({ tipo: 'sangria', valor: '', motivo: '' }); setPainel(null); load(); }
        else showToast(res.data?.error || 'Erro', 'error');
      };

      const fechar = async () => {
        const res = await apiCall('POST', '/acougue/cash-session/fechar', { valor_contado: Number(contado) });
        if (!res.ok) { showToast(res.data?.error || 'Erro ao fechar', 'error'); return; }
        const d = res.data;
        const msg = d.situacao === 'confere' ? 'Caixa fechado — valores conferem'
          : `Caixa fechado com ${d.situacao.toUpperCase()} de ${fmtCur(Math.abs(d.diferenca))}`;
        showToast(msg, d.situacao === 'confere' ? 'success' : 'error');
        setContado(''); setPainel(null); load();
      };

      if (!sessao) return null;

      if (!sessao.aberta) {
        return (
          <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
            <p className="syne" style={{ color: '#f59e0b', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>
              <i className="fas fa-lock" style={{ marginRight: 8 }}></i>Caixa fechado
            </p>
            <p style={{ color: 'var(--bp-text-secondary)', fontSize: 12, margin: '0 0 12px' }}>
              Abra o caixa informando o troco inicial da gaveta. Vendas feitas com o caixa fechado
              não entram na conferência do dia.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 180 }}>
                <AcgInput label="Troco inicial (R$)" type="number" step="0.01" min="0" value={abrindo}
                  onChange={e => setAbrindo(e.target.value)} placeholder="0,00" />
              </div>
              <div style={{ marginBottom: 12 }}><AcgButton onClick={abrir}>Abrir caixa</AcgButton></div>
            </div>
          </div>
        );
      }

      const Item = ({ label, valor, cor }) => (
        <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{label}</div>
          <div style={{ color: cor || 'var(--bp-text)', fontWeight: 700, fontSize: 16 }}>{fmtCur(valor)}</div>
        </div>
      );

      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: 0 }}>
              <i className="fas fa-cash-register" style={{ marginRight: 8, color: '#10b981' }}></i>
              Caixa aberto — {sessao.vendas} venda(s)
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <AcgButton variant="ghost" onClick={() => setPainel(painel === 'mov' ? null : 'mov')}>Sangria / Suprimento</AcgButton>
              <AcgButton onClick={() => setPainel(painel === 'fechar' ? null : 'fechar')}>Fechar caixa</AcgButton>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            <Item label="Abertura" valor={sessao.valor_abertura} />
            <Item label="Vendas em dinheiro" valor={sessao.total_dinheiro} />
            <Item label="Outras formas" valor={sessao.total_outras} />
            <Item label="Sangrias" valor={sessao.sangrias} cor="#ef4444" />
            <Item label="Esperado na gaveta" valor={sessao.esperado_na_gaveta} cor="#10b981" />
          </div>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '8px 0 0' }}>
            Cartão, PIX e vale não passam pela gaveta — entram só como informação.
          </p>

          {painel === 'mov' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bp-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <AcgSelect label="Tipo" value={mov.tipo} onChange={e => setMov({ ...mov, tipo: e.target.value })}>
                  <option value="sangria">Sangria (retira da gaveta)</option>
                  <option value="suprimento">Suprimento (coloca na gaveta)</option>
                </AcgSelect>
                <AcgInput label="Valor (R$)" type="number" step="0.01" min="0" value={mov.valor} onChange={e => setMov({ ...mov, valor: e.target.value })} />
                <AcgInput label="Motivo" value={mov.motivo} onChange={e => setMov({ ...mov, motivo: e.target.value })} placeholder="ex: depósito no banco" />
              </div>
              <AcgButton onClick={lancarMov} disabled={!(Number(mov.valor) > 0) || !mov.motivo.trim()}>Registrar</AcgButton>
            </div>
          )}

          {painel === 'fechar' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bp-border)' }}>
              <p style={{ color: 'var(--bp-text-secondary)', fontSize: 12, margin: '0 0 10px' }}>
                Conte o dinheiro da gaveta e informe o total. O sistema compara com os <strong>{fmtCur(sessao.esperado_na_gaveta)}</strong> esperados.
              </p>
              <div style={{ maxWidth: 220 }}>
                <AcgInput label="Valor contado (R$)" type="number" step="0.01" min="0" value={contado} onChange={e => setContado(e.target.value)} />
              </div>
              {contado !== '' && (
                <p style={{ fontSize: 13, margin: '0 0 12px', color: Math.abs(Number(contado) - sessao.esperado_na_gaveta) < 0.01 ? '#10b981' : '#ef4444' }}>
                  Diferença: {fmtCur(Number(contado) - sessao.esperado_na_gaveta)}
                </p>
              )}
              <AcgButton onClick={fechar} disabled={contado === ''}>Confirmar fechamento</AcgButton>
            </div>
          )}

          {sessao.movimentos?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <AcgTable
                emptyLabel="Sem movimentos"
                columns={[
                  { key: 'tipo', label: 'Tipo', render: r => r.tipo === 'sangria' ? 'Sangria' : 'Suprimento' },
                  { key: 'valor', label: 'Valor', align: 'right', render: r => <span style={{ color: r.tipo === 'sangria' ? '#ef4444' : '#10b981' }}>{fmtCur(r.valor)}</span> },
                  { key: 'motivo', label: 'Motivo' },
                  { key: 'created_at', label: 'Hora', render: r => new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
                ]}
                rows={sessao.movimentos}
              />
            </div>
          )}
        </div>
      );
    }

    /* ---- CAIXA ---- */
    // Esta tela é a única com layout de duas colunas rígidas e tipografia enorme, e as duas
    // coisas quebram em largura estreita: os números do total transbordavam a coluna e a
    // página ganhava rolagem horizontal. Vai em CSS de verdade porque precisa de media query —
    // estilo inline não tem como responder à largura da tela.
    const CAIXA_ESTILOS = `
      .acg-caixa-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(310px, 0.78fr);
        gap: 16px; align-items: start; margin-bottom: 16px; }
      /* O teto é calculado, não escolhido pelo olho: vw mede a JANELA, não esta coluna, então
         numa tela larga a fonte crescia mais que o painel e o total saía cortado pela metade —
         justamente o número que a tela existe para mostrar. A coluna tem no mínimo 310px, menos
         40 de respiro = 270px úteis. O pior caso realista é "R$ 9.999,99" (11 caracteres), que
         em Syne bold com -2px ocupa cerca de 6em. 270 / 6 = 45px, daí o teto de 44px.
         O mínimo (28px) ainda é maior que qualquer outro número da tela. */
      /* UMA FONTE POR PAPEL, e a regra mora aqui para não voltar a divergir:
         nome de produto e rótulo = Inter (a do corpo) · qualquer NÚMERO = DM Mono.
         Estava misturado: o mesmo nome de produto saía em Syne no painel de cima e em Inter na
         lista logo abaixo, e o dinheiro em Syne com o "peso × preço" em DM Mono coladinho nele.
         Monoespaçada nos números não é gosto: os dígitos têm a mesma largura, então a vírgula
         cai sempre na mesma coluna e a fila inteira de subtotais fica conferível de relance. */
      .acg-num { font-family: 'DM Mono', monospace; }
      .acg-caixa-total { font-family: 'DM Mono', monospace; font-size: clamp(28px, 3.6vw, 44px); letter-spacing: -1px; line-height: 1.1; }
      .acg-caixa-troco { font-family: 'DM Mono', monospace; font-size: clamp(24px, 3vw, 38px); letter-spacing: -0.5px; line-height: 1.1; }
      /* Linha do item: o nome cede espaço primeiro (min-width 0), os controles não encolhem. */
      .acg-item-linha { display: flex; align-items: center; gap: 10px; padding: 11px 4px;
        border-bottom: 1px solid var(--bp-border); }
      .acg-item-nome { flex: 1 1 120px; min-width: 0; }
      .acg-item-total { min-width: 92px; text-align: right; font-size: 16px; font-weight: 700;
        font-family: 'DM Mono', monospace; }
      @media (max-width: 1080px) {
        .acg-caixa-grid { grid-template-columns: 1fr; }
        /* Empilhado, o total volta a ter a tela inteira para si — mas o teto continua valendo
           pelo mesmo motivo, agora contra a largura do celular. */
        .acg-caixa-total { font-size: clamp(32px, 7.5vw, 46px); }
        .acg-caixa-troco { font-size: clamp(26px, 6vw, 40px); }
      }
      @media (max-width: 560px) {
        .acg-item-linha { flex-wrap: wrap; }
        .acg-item-total { min-width: auto; margin-left: auto; }
      }
    `;

    function AcougueCaixa({ showToast }) {
      const [barcode, setBarcode] = useState('');
      const [cart, setCart] = useState([]);
      const [paymentMethod, setPaymentMethod] = useState('dinheiro');
      const [finalizing, setFinalizing] = useState(false);
      const [manualProducts, setManualProducts] = useState([]);
      // Esta tela fica virada para o CLIENTE, no monitor do balcão. O painel "Caixa aberto"
      // mostra quanto dinheiro vivo existe na gaveta agora, e isso não é informação para quem
      // está do outro lado — por isso ele nasce fora da tela e o operador o traz quando precisa
      // (abrir, sangrar, fechar), normalmente sem cliente na frente.
      //
      // A escolha fica no navegador daquele caixa, não no banco: é preferência da MÁQUINA
      // (aquele monitor está virado para o cliente), não da pessoa que entrou nela — o mesmo
      // usuário no computador do escritório quer o painel à vista.
      const [mostrarGaveta, setMostrarGaveta] = useState(() => {
        try { return localStorage.getItem('acg_caixa_gaveta') === '1'; } catch { return false; }
      });
      const alternarGaveta = () => setMostrarGaveta(v => {
        try { localStorage.setItem('acg_caixa_gaveta', v ? '0' : '1'); } catch {}
        return !v;
      });

      // O catálogo (quase 200 botões) ocupava o centro da tela o tempo todo, competindo com o
      // total pela atenção de quem está do outro lado do balcão. Ele é caminho de exceção —
      // produto sem etiqueta — então nasce recolhido e abre num toque. A escolha também fica
      // no navegador daquele caixa: quem vende muito item sem código deixa aberto e pronto.
      const [catalogoAberto, setCatalogoAberto] = useState(() => {
        try { return localStorage.getItem('acg_caixa_catalogo') === '1'; } catch { return false; }
      });
      const alternarCatalogo = () => setCatalogoAberto(v => {
        try { localStorage.setItem('acg_caixa_catalogo', v ? '0' : '1'); } catch {}
        return !v;
      });
      // Razão social, CNPJ, IE e endereço vão no cabeçalho do cupom impresso.
      const [fiscalSettings, setFiscalSettings] = useState(null);
      const [hotkeys, setHotkeys] = useState(ACG_HOTKEYS_PADRAO);
      // CPF informado para a próxima nota; some depois de finalizar, porque é do cliente
      // atual e ir junto na venda do próximo seria erro fiscal.
      const [cpfNota, setCpfNota] = useState('');
      const [filtroProduto, setFiltroProduto] = useState('');
      // Último item lançado, exibido em destaque no painel lateral.
      const [ultimoItem, setUltimoItem] = useState(null);
      // Desconto é LIGA/DESLIGA, não valor digitado: o percentual é decidido pelo dono em
      // Configurações e o operador só aplica. Campo livre no balcão é onde nasce o
      // "descontinho" que ninguém audita depois — e a tela fica virada para o cliente, que
      // passa a ver um campo editável de dinheiro na frente dele.
      const [descontoLigado, setDescontoLigado] = useState(false);
      // Quanto o cliente entregou em dinheiro. Só isso permite calcular troco — o erro mais
      // básico que faltava no caixa.
      const [recebido, setRecebido] = useState('');
      const inputRef = useRef(null);
      const recebidoRef = useRef(null);

      // Total já com desconto, e o troco em cima dele. Ficam derivados (não em estado) para não
      // existir a possibilidade de o número da tela divergir do que é enviado.
      const descontoPct = Math.min(Math.max(Number(fiscalSettings?.desconto_pct) || 0, 0), 100);
      const totalBruto = cart.reduce((s, c) => s + c.quantity * c.product.price, 0);
      // Arredondado a centavo AQUI: é este valor que vai para o banco e para a nota, e um
      // desconto de 7,5% sobre 98,68 sem arredondar viajaria com frações de centavo.
      const valorDesconto = descontoLigado ? Math.round(totalBruto * descontoPct) / 100 : 0;
      const totalFinal = Math.max(0, totalBruto - valorDesconto);
      const trocoCalculado = (Number(recebido) || 0) - totalFinal;

      // Busca por nome ou PLU — o operador que sabe o código digita o número, quem não sabe
      // digita o começo do nome.
      const produtosFiltrados = React.useMemo(() => {
        const termo = filtroProduto.trim().toLowerCase();
        if (!termo) return manualProducts;
        return manualProducts.filter(p =>
          p.name.toLowerCase().includes(termo) || String(p.scale_code || '').startsWith(termo));
      }, [manualProducts, filtroProduto]);

      useEffect(() => {
        apiCall('GET', '/acougue/products').then(res => { if (res.ok) setManualProducts(res.data); });
        apiCall('GET', '/acougue/settings').then(res => {
          if (res.ok) { setFiscalSettings(res.data); setHotkeys(acgLerHotkeys(res.data)); }
        });
        inputRef.current?.focus();
      }, []);

      // `quantity` vem da etiqueta quando a leitura é de balança (0,588 kg do pacote) e é 1
      // para produto de unidade. Somar em vez de substituir é proposital: dois pacotes de
      // picanha bipados viram uma linha só com o peso total, como faz qualquer PDV de açougue.
      const addProductToCart = (product, quantity = 1) => {
        setUltimoItem({ product, quantity });
        // Aviso de estoque, não bloqueio: o saldo do sistema atrasa em relação à bancada, e
        // travar a venda por causa disso pararia a fila por um problema de cadastro.
        if (product.stock_qty != null && quantity > product.stock_qty) {
          showToast(`Atenção: ${product.name} tem só ${Number(product.stock_qty).toFixed(3)} ${product.unit} em estoque`, 'info');
        }
        setCart(prev => {
          const existing = prev.find(c => c.product.id === product.id);
          if (existing) return prev.map(c => c.product.id === product.id ? { ...c, quantity: Number((c.quantity + quantity).toFixed(3)) } : c);
          return [...prev, { product, quantity: Number(quantity.toFixed(3)) }];
        });
        // Sempre volta o foco pro campo de código de barras — o operador não deve precisar
        // clicar de novo nele depois de tocar num botão de produto manual.
        inputRef.current?.focus();
      };

      const addByBarcode = async (code) => {
        const trimmed = code.trim();
        setBarcode('');
        if (!trimmed) return;
        // /scan entende tanto EAN de fábrica quanto etiqueta de balança (que traz o peso
        // embutido) — por isso o caixa não precisa saber qual dos dois foi bipado.
        const res = await apiCall('GET', `/acougue/products/scan/${encodeURIComponent(trimmed)}`);
        if (!res.ok) { showToast(res.data?.error || 'Produto não encontrado', 'error'); return; }
        const { product, quantity, scan } = res.data;
        addProductToCart(product, quantity);
        if (scan?.type === 'scale') {
          showToast(`${product.name} — ${quantity.toFixed(3).replace('.', ',')} kg`, 'success');
        }
      };

      const handleKeyDown = (e) => { if (e.key === 'Enter') addByBarcode(barcode); };

      // Usado tanto pela digitação direta no campo (não deve roubar o foco a cada tecla) quanto
      // pelos botões +/- (aí sim, devolve o foco pro código de barras em seguida).
      const updateQty = (productId, quantity) => {
        setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: Math.max(0, Math.round(quantity * 100) / 100) } : c).filter(c => c.quantity > 0));
      };
      // Atualização funcional (não lê `cart` do closure) — cliques rápidos em sequência no +/-
      // não podem "perder" incrementos por lerem o mesmo estado desatualizado.
      const nudgeQty = (productId, delta) => {
        setCart(prev => prev
          .map(c => c.product.id === productId ? { ...c, quantity: Math.max(0, Math.round((c.quantity + delta) * 100) / 100) } : c)
          .filter(c => c.quantity > 0));
        inputRef.current?.focus();
      };

      const removeItem = (productId) => {
        setCart(prev => prev.filter(c => c.product.id !== productId));
        inputRef.current?.focus();
      };

      const total = cart.reduce((a, c) => a + c.product.price * c.quantity, 0);

      // Finalizar venda = registrar + emitir NFC-e + imprimir, nessa ordem.
      //
      // A venda é gravada primeiro e não é desfeita se a emissão falhar: com SEFAZ fora do ar
      // ou certificado vencido, o açougue ainda precisa vender e receber. Quando a nota não
      // sai, o cupom ainda é impresso, mas carimbado como SEM VALOR FISCAL — e a venda fica
      // registrada para emitir depois.
      const finalize = async () => {
        if (cart.length === 0) return;
        setFinalizing(true);
        const snapshot = cart.map(c => ({ name: c.product.name, unit: c.product.unit, quantity: c.quantity, unit_price: c.product.price, subtotal: c.quantity * c.product.price }));

        const res = await apiCall('POST', '/acougue/sales', {
          items: cart.map(c => ({ product_id: c.product.id, quantity: c.quantity })),
          payment_method: paymentMethod,
          desconto: valorDesconto,
          pagamentos: [{
            forma: paymentMethod,
            valor: Number(totalFinal.toFixed(2)),
            valor_recebido: paymentMethod === 'dinheiro' && Number(recebido) > 0 ? Number(recebido) : null,
          }],
        });
        if (!res.ok) {
          setFinalizing(false);
          showToast(res.data?.error || 'Erro ao finalizar venda', 'error');
          return;
        }

        const sale = res.data;
        const nfce = await apiCall('POST', `/acougue/sales/${sale.id}/nfce`, cpfNota ? { cpf: cpfNota } : {});
        setFinalizing(false);

        const autorizada = nfce.ok && nfce.data?.status === 'autorizada';
        if (autorizada) {
          showToast(`Venda ${sale.sale_number} — NFC-e ${nfce.data.numero} autorizada`, 'success');
        } else if (nfce.ok) {
          showToast(`Venda ${sale.sale_number} registrada. Nota: ${nfce.data?.warning || nfce.data?.status || 'pendente'}`, 'info');
        } else {
          showToast(`Venda ${sale.sale_number} registrada, mas a nota falhou: ${nfce.data?.error || 'erro desconhecido'}`, 'error');
        }

        // O servidor decide se abre, olhando a configuração e as formas de pagamento da venda.
        if (sale.abrir_gaveta) abrirGaveta(`Venda ${sale.sale_number} em dinheiro`);

        const cupom = { sale, items: snapshot, paymentMethod, invoice: autorizada ? nfce.data : null, settings: fiscalSettings };
        ultimaVenda.current = cupom;
        // Nota autorizada: o cliente leva o DANFE OFICIAL, com QR Code e protocolo, servido
        // pelo próprio sistema. Só se ele não vier é que sai a via de conferência local — que
        // não se apresenta como DANFE, porque sem QR Code não é um.
        if (autorizada && nfce.data?.id) {
          const r = await acgImprimirDanfe(nfce.data.id);
          if (!r.ok) { showToast(`${r.erro} Imprimindo a via de conferência.`, 'error'); printCupom(cupom); }
        } else {
          printCupom(cupom);
        }
        setCart([]);
        setCpfNota('');
        setUltimoItem(null);
        setDescontoLigado(false); setRecebido('');
        inputRef.current?.focus();
      };

      // Guarda a última venda para o F6 poder reimprimir sem consultar o servidor de novo —
      // reimpressão é pedida quando o papel picotou ou o cliente quer segunda via, e nesses
      // dois casos o operador está com a fila esperando.
      const ultimaVenda = useRef(null);
      const vendaSuspensa = useRef(null);

      // Abre a gaveta física (pulso da impressora). Falha aqui nunca derruba a venda: a
      // impressora pode estar desligada ou fora da rede, e isso não pode travar o balcão —
      // a gaveta tem chave, o operador abre na mão.
      const abrirGaveta = async (motivo) => {
        const res = await apiCall('POST', '/acougue/gaveta/abrir', { motivo });
        if (!res.ok) showToast(res.data?.error || 'Não consegui abrir a gaveta', 'error');
      };

      const acoes = {
        foco_codigo: () => inputRef.current?.focus(),

        cpf_nota: () => {
          const cpf = prompt('CPF do cliente para a nota (deixe vazio para consumidor não identificado):', cpfNota || '');
          if (cpf !== null) {
            const limpo = cpf.replace(/\D/g, '');
            setCpfNota(limpo);
            showToast(limpo ? `CPF ${limpo} vai na próxima nota` : 'Nota sairá sem CPF', 'info');
          }
          inputRef.current?.focus();
        },

        finalizar: () => { if (cart.length && !finalizing) finalize(); },

        reimprimir: async () => {
          if (!ultimaVenda.current) { showToast('Nenhuma venda para reimprimir', 'info'); return; }
          const nota = ultimaVenda.current.invoice;
          if (nota?.id) {
            const r = await acgImprimirDanfe(nota.id);
            if (r.ok) return;
            showToast(`${r.erro} Imprimindo a via de conferência.`, 'error');
          }
          printCupom(ultimaVenda.current);
        },

        // Calcular o troco = pular direto para o campo "quanto o cliente deu", já selecionado
        // para digitar por cima. O troco sai sozinho em corpo grande assim que o número entra.
        // Força a forma de pagamento para dinheiro: é o único caso em que existe troco, e se o
        // operador aperta este atalho é porque o cliente estendeu a nota.
        troco: () => {
          if (!cart.length) { showToast('Carrinho vazio', 'info'); return; }
          if (paymentMethod !== 'dinheiro') setPaymentMethod('dinheiro');
          // setTimeout porque o campo só existe depois do render quando a forma acabou de mudar.
          setTimeout(() => { recebidoRef.current?.focus(); recebidoRef.current?.select(); }, 0);
        },

        desconto: () => {
          if (!descontoPct) { showToast('Nenhum desconto configurado. O dono define o percentual em Configurações.', 'info'); return; }
          if (!cart.length) { showToast('Carrinho vazio', 'info'); return; }
          setDescontoLigado(v => {
            showToast(v ? 'Desconto retirado' : `Desconto de ${descontoPct}% aplicado`, v ? 'info' : 'success');
            return !v;
          });
          inputRef.current?.focus();
        },

        // Suspender guarda o carrinho para atender outro cliente (o da frente esqueceu algo,
        // foi buscar mais um corte). Apertar de novo devolve o carrinho guardado.
        suspender: () => {
          if (vendaSuspensa.current) {
            const retomado = vendaSuspensa.current;
            vendaSuspensa.current = cart.length ? cart : null;
            setCart(retomado);
            showToast('Venda retomada', 'success');
          } else if (cart.length) {
            vendaSuspensa.current = cart;
            setCart([]);
            showToast('Venda suspensa — aperte de novo para retomar', 'info');
          } else {
            showToast('Carrinho vazio', 'info');
          }
          inputRef.current?.focus();
        },

        remover_item: () => {
          setCart(prev => prev.slice(0, -1));
          inputRef.current?.focus();
        },

        cancelar_venda: () => {
          if (!cart.length) return;
          if (confirm('Cancelar esta venda? O carrinho será esvaziado.')) {
            setCart([]);
            showToast('Venda cancelada', 'info');
          }
          inputRef.current?.focus();
        },

        abrir_gaveta: () => abrirGaveta('Abertura manual pelo caixa'),
      };

      // Atalhos valem em toda a tela do caixa. O preventDefault é essencial: sem ele o F5 do
      // navegador recarrega a página no meio da venda e o carrinho some.
      useEffect(() => {
        const onKey = (e) => {
          const acaoId = Object.keys(hotkeys).find(k => hotkeys[k] === e.key);
          if (!acaoId || !acoes[acaoId]) return;
          e.preventDefault();
          acoes[acaoId]();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      });

      return (
        <div>
          <style>{CAIXA_ESTILOS}</style>
          {/* O botão fica AQUI, fora do painel: se morasse dentro dele, desligar esconderia o
              próprio botão e não haveria como trazer o painel de volta. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <AcgSectionTitle icon="fa-cash-register" title="Caixa" subtitle="Leitor de código de barras: escaneie e o item entra automaticamente" />
            <AcgButton type="button" variant="ghost" onClick={alternarGaveta} style={{ marginTop: 2 }}
              title={mostrarGaveta ? 'Tirar o painel do caixa aberto da tela' : 'Trazer o painel do caixa aberto'}>
              <i className={`fas ${mostrarGaveta ? 'fa-eye-slash' : 'fa-eye'}`} style={{ marginRight: 7 }}></i>
              {mostrarGaveta ? 'Ocultar caixa aberto' : 'Mostrar caixa aberto'}
            </AcgButton>
          </div>

          {mostrarGaveta && <AcougueGaveta showToast={showToast} />}

          {/* DUAS LEITURAS NA MESMA TELA. O monitor fica virado para o cliente, então cada
              metade atende um lado: à esquerda o que ele confere (o que entrou, com peso e
              preço), à direita o que ele veio saber (quanto deu, quanto é o troco). O que é
              ferramenta do operador — catálogo e atalhos — desceu para baixo da dobra. */}
          <div className="acg-caixa-grid">

            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18, minWidth: 0 }}>
              <input
                ref={inputRef}
                autoFocus
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Bipe o produto aqui"
                aria-label="Código de barras"
                style={{ width: '100%', padding: '15px 18px', borderRadius: 11, border: `2px solid ${ACG_ACCENT}66`, background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 17, fontFamily: 'DM Mono, monospace', boxSizing: 'border-box' }}
              />

              {/* O item recém-bipado, logo abaixo do campo e em corpo grande: é aqui que o
                  cliente confere se o corte e o peso são os dele, no segundo em que acontece.
                  Ficava na coluna da direita, espremido entre o pagamento e o total. */}
              {ultimoItem && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                  background: ACG_ACCENT_BG, border: `1px solid ${ACG_ACCENT}55`, borderRadius: 12, padding: '13px 16px', marginTop: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{ultimoItem.product.name}</div>
                    <div className="acg-num" style={{ color: 'var(--bp-text-secondary)', fontSize: 14, marginTop: 3 }}>
                      {Number(ultimoItem.quantity).toFixed(3).replace('.', ',')} {ultimoItem.product.unit} × {fmtCur(ultimoItem.product.price)}
                    </div>
                  </div>
                  <div className="acg-num" style={{ color: ACG_ACCENT, fontSize: 26, fontWeight: 700 }}>
                    {fmtCur(ultimoItem.quantity * ultimoItem.product.price)}
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--bp-text-faint)' }}>
                  <i className="fas fa-barcode" style={{ fontSize: 34, marginBottom: 12, display: 'block', opacity: 0.6 }}></i>
                  <span style={{ fontSize: 14 }}>Passe o primeiro produto no leitor</span>
                </div>
              ) : (
                /* Linhas altas em vez de tabela: a leitura é do outro lado do balcão, em
                   monitor barato de PDV. Nome grande em cima, quantidade × preço embaixo,
                   subtotal à direita — a mesma ordem do cupom que ele vai receber. */
                <div style={{ marginTop: 14, maxHeight: 340, overflowY: 'auto' }}>
                  {cart.map(r => (
                    <div key={r.product.id} className="acg-item-linha">
                      <div className="acg-item-nome">
                        <div style={{ color: 'var(--bp-text)', fontSize: 15, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product.name}</div>
                        <div className="acg-num" style={{ color: 'var(--bp-text-faint)', fontSize: 12.5, marginTop: 2 }}>
                          {Number(r.quantity).toFixed(3).replace('.', ',')} {r.product.unit} × {fmtCur(r.product.price)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button onClick={() => nudgeQty(r.product.id, r.product.unit === 'kg' ? -0.1 : -1)} aria-label="Diminuir"
                          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>−</button>
                        <input type="number" step="0.001" min="0" value={r.quantity} onChange={e => updateQty(r.product.id, Number(e.target.value))} aria-label={`Quantidade de ${r.product.name}`}
                          style={{ width: 76, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', textAlign: 'right', fontSize: 13.5, fontFamily: 'DM Mono, monospace' }} />
                        <button onClick={() => nudgeQty(r.product.id, r.product.unit === 'kg' ? 0.1 : 1)} aria-label="Aumentar"
                          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>+</button>
                      </div>
                      <div className="acg-item-total" style={{ color: 'var(--bp-text)' }}>
                        {fmtCur(r.product.price * r.quantity)}
                      </div>
                      <button onClick={() => removeItem(r.product.id)} aria-label={`Remover ${r.product.name}`}
                        style={{ width: 30, height: 30, borderRadius: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15 }}>
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* O TOTAL é o número que o cliente veio ver. Estava a 34px no rodapé de uma
                  coluna estreita; agora abre a metade direita, sozinho, do tamanho que se lê
                  em pé a dois metros do monitor. */}
              <div style={{ background: 'var(--bp-panel)', border: `1px solid ${ACG_ACCENT}44`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--bp-text-faint)', fontWeight: 600, letterSpacing: '.06em' }}>TOTAL</span>
                  <span style={{ fontSize: 11.5, color: 'var(--bp-text-faint)' }}>
                    {cart.length} {cart.length === 1 ? 'item' : 'itens'}
                    {cart.some(c => c.product.unit === 'kg') && ` · ${cart.reduce((s, c) => s + (c.product.unit === 'kg' ? c.quantity : 0), 0).toFixed(3).replace('.', ',')} kg`}
                  </span>
                </div>
                <div className="acg-caixa-total" style={{ color: 'var(--bp-text)', fontWeight: 700, marginTop: 2 }}>
                  {fmtCur(totalFinal)}
                </div>
                {/* Com desconto aplicado, o total deixa de bater com a soma dos itens que o
                    cliente acabou de acompanhar na tela. A conta fica explícita aqui para ele
                    não precisar perguntar. */}
                {valorDesconto > 0 && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: 'var(--bp-text-muted)' }}>
                    <span>Itens {fmtCur(totalBruto)}</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>− desconto de {descontoPct}% ({fmtCur(valorDesconto)})</span>
                  </div>
                )}
              </div>

              {/* TROCO no mesmo corpo do total: na hora de pagar em dinheiro é ele que as duas
                  pessoas estão olhando, e é a conta que mais gera discussão no balcão. */}
              {paymentMethod === 'dinheiro' && Number(recebido) > 0 && (
                <div style={{
                  borderRadius: 14, padding: '16px 20px',
                  background: trocoCalculado >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                  border: `1px solid ${trocoCalculado >= 0 ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', color: trocoCalculado >= 0 ? '#10b981' : '#ef4444' }}>
                      {trocoCalculado >= 0 ? 'TROCO' : 'AINDA FALTA'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--bp-text-muted)' }}>recebido {fmtCur(recebido)}</span>
                  </div>
                  <div className="acg-caixa-troco" style={{ fontWeight: 700, marginTop: 2, color: trocoCalculado >= 0 ? '#10b981' : '#ef4444' }}>
                    {fmtCur(Math.abs(trocoCalculado))}
                  </div>
                </div>
              )}

              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18 }}>
                <AcgSelect label="Forma de pagamento" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  {ACG_PAGAMENTOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </AcgSelect>

                {paymentMethod === 'dinheiro' && (
                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 5 }}>
                      Quanto o cliente deu (R$) <kbd style={{ background: `${ACG_ACCENT}22`, color: ACG_ACCENT, border: `1px solid ${ACG_ACCENT}55`, borderRadius: 4, padding: '0 5px', fontFamily: 'DM Mono, monospace', fontSize: 10.5, marginLeft: 4 }}>{hotkeys.troco || '—'}</kbd>
                    </span>
                    <input ref={recebidoRef} type="number" step="0.01" min="0" value={recebido}
                      onChange={e => setRecebido(e.target.value)} placeholder="0,00"
                      style={{ width: '100%', padding: '11px 13px', borderRadius: 9, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 16, fontFamily: 'DM Mono, monospace', boxSizing: 'border-box' }} />
                  </label>
                )}

                {/* Desconto é botão, não campo: o percentual é do dono (Configurações), o
                    operador só aplica. Sem percentual configurado o botão nem aparece — botão
                    que não faz nada ensina o operador a ignorar botão. */}
                {descontoPct > 0 && (
                  <button type="button" onClick={acoes.desconto}
                    style={{ width: '100%', padding: '11px 0', marginBottom: 12, borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                      background: descontoLigado ? 'rgba(16,185,129,0.15)' : 'var(--bp-card)',
                      border: `1px solid ${descontoLigado ? 'rgba(16,185,129,0.5)' : 'var(--bp-border2)'}`,
                      color: descontoLigado ? '#10b981' : 'var(--bp-text-muted)' }}>
                    <i className={`fas ${descontoLigado ? 'fa-circle-check' : 'fa-percent'}`} style={{ marginRight: 8 }}></i>
                    {descontoLigado ? `Desconto de ${descontoPct}% aplicado` : `Aplicar desconto de ${descontoPct}%`}
                    <kbd style={{ background: `${ACG_ACCENT}22`, color: ACG_ACCENT, border: `1px solid ${ACG_ACCENT}55`, borderRadius: 4, padding: '0 5px', fontFamily: 'DM Mono, monospace', fontSize: 10.5, marginLeft: 8 }}>{hotkeys.desconto || '—'}</kbd>
                  </button>
                )}

                <AcgButton onClick={finalize} disabled={cart.length === 0 || finalizing || (paymentMethod === 'dinheiro' && Number(recebido) > 0 && trocoCalculado < 0)}
                  style={{ width: '100%', padding: '17px 0', fontSize: 16.5 }}>
                  {finalizing ? 'Processando...' : <><i className="fas fa-check" style={{ marginRight: 9 }}></i>Finalizar venda</>}
                </AcgButton>
                {cpfNota && (
                  <p style={{ margin: '10px 0 0', textAlign: 'center', color: '#16a34a', fontSize: 12 }}>
                    <i className="fas fa-id-card" style={{ marginRight: 6 }}></i>CPF {cpfNota} vai na nota
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Catálogo: caminho de exceção (produto sem etiqueta), então fica recolhido. */}
          {manualProducts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <AcgButton type="button" variant="ghost" onClick={alternarCatalogo}>
                  <i className={`fas fa-${catalogoAberto ? 'chevron-up' : 'grip'}`} style={{ marginRight: 8 }}></i>
                  {catalogoAberto ? 'Fechar lista de produtos' : 'Produto sem código de barras'}
                </AcgButton>
                {catalogoAberto && (
                  <input
                    value={filtroProduto}
                    onChange={e => setFiltroProduto(e.target.value)}
                    placeholder="filtrar por nome ou PLU..."
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13, minWidth: 210, fontFamily: 'Inter, sans-serif' }}
                  />
                )}
              </div>
              {catalogoAberto && (
                /* Altura limitada com rolagem própria: o catálogo tem quase 200 itens e, solto,
                   empurrava o resto da tela para fora da vista. */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: 280, overflowY: 'auto', paddingRight: 4, marginTop: 12 }}>
                  {produtosFiltrados.map(p => (
                    <button key={p.id} onClick={() => addProductToCart(p)} style={{ padding: '15px 10px', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                      <span>{p.name}</span>
                      <span style={{ color: ACG_ACCENT, fontWeight: 700 }}>{fmtCur(p.price)}</span>
                    </button>
                  ))}
                  {produtosFiltrados.length === 0 && (
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 12.5, gridColumn: '1 / -1', margin: 0 }}>Nenhum produto para "{filtroProduto}"</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Barra de funções: mostra o atalho e também funciona como botão, porque nem todo
              operador decora tecla no primeiro dia — e num balcão movimentado ninguém para
              pra procurar. Os rótulos vêm do mapa configurável, então mudar a tecla em
              Configurações muda o que aparece aqui. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {ACG_ACOES_CAIXA.map(acao => (
              <button
                key={acao.id}
                onClick={() => acoes[acao.id]?.()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--bp-border2)', background: 'var(--bp-card)',
                  color: 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 12,
                }}
              >
                <kbd style={{
                  background: `${ACG_ACCENT}22`, color: ACG_ACCENT, border: `1px solid ${ACG_ACCENT}55`,
                  borderRadius: 4, padding: '1px 6px', fontFamily: 'DM Mono, monospace', fontSize: 11, fontWeight: 700,
                }}>{hotkeys[acao.id] || '—'}</kbd>
                {acao.label}
              </button>
            ))}
            {cpfNota && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: '#16a34a22', border: '1px solid #16a34a55', color: '#16a34a', fontSize: 12 }}>
                <i className="fas fa-id-card"></i>CPF {cpfNota} na nota
              </span>
            )}
          </div>

          {/* "Vendas de hoje" foi removida daqui: esta tela fica virada para o cliente, e a
              tabela expunha o faturamento do dia inteiro, venda por venda, para quem estivesse
              na fila — com um botão "Cancelar" em cada linha, ao alcance de qualquer um que
              encostasse no monitor. Cancelar venda já fechada devolve estoque e mexe no fiscal:
              é decisão de dono, não ação de balcão com cliente olhando. */}
        </div>
      );
    }

    /* ---- EMISSÃO DE NOTA (NF-e via Focus NFe) ---- */
    /* ---- CONTINGÊNCIA OFFLINE ---- */
    // Nota emitida em contingência é dívida fiscal aberta: o cupom já foi entregue ao cliente,
    // mas a SEFAZ ainda não recebeu. A lei dá prazo para transmitir e passar dele gera multa —
    // por isso isto aparece como alerta vermelho no topo, não escondido num relatório.
    function AcougueContingencia({ showToast, onMudou }) {
      const [dados, setDados] = useState(null);
      const [efetivando, setEfetivando] = useState(null);

      const load = async () => {
        const res = await apiCall('GET', '/acougue/nfce/contingencia');
        if (res.ok) setDados(res.data);
      };
      useEffect(() => { load(); }, []);

      const efetivar = async (id) => {
        setEfetivando(id);
        const res = await apiCall('POST', `/acougue/nfce/${id}/efetivar`);
        setEfetivando(null);
        if (res.ok) {
          showToast(res.data.mensagem, res.data.efetivada ? 'success' : 'info');
          load(); onMudou?.();
        } else showToast(res.data?.error || 'Erro ao efetivar', 'error');
      };

      const efetivarTodas = async () => {
        for (const n of dados.pendentes) await efetivar(n.id);
      };

      // Sem pendências não mostra nada: um painel vazio permanente vira ruído e o operador
      // para de olhar justamente quando aparecer algo de verdade.
      if (!dados || dados.total === 0) return null;

      const critico = dados.mais_antiga_horas >= 20;
      return (
        <div style={{
          background: critico ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
          border: `1px solid ${critico ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
          borderRadius: 14, padding: 18, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <p className="syne" style={{ color: critico ? '#ef4444' : '#f59e0b', fontWeight: 700, fontSize: 15, margin: '0 0 3px' }}>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }}></i>
                {dados.total} nota(s) em contingência aguardando transmissão
              </p>
              <p style={{ color: 'var(--bp-text-secondary)', fontSize: 12, margin: 0 }}>
                Emitidas com a SEFAZ fora do ar. O cliente já levou o cupom, mas a SEFAZ ainda não recebeu.
                A mais antiga tem <strong>{dados.mais_antiga_horas}h</strong>.
              </p>
            </div>
            <AcgButton onClick={efetivarTodas} disabled={efetivando !== null}>
              <i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Transmitir todas
            </AcgButton>
          </div>

          <AcgTable
            emptyLabel="Nenhuma"
            columns={[
              { key: 'sale_number', label: 'Venda', render: r => r.sale_number || '—' },
              { key: 'numero', label: 'Nota', render: r => `${r.numero || '?'}/${r.serie || '?'}` },
              { key: 'total_value', label: 'Valor', align: 'right', render: r => fmtCur(r.total_value) },
              { key: 'created_at', label: 'Emitida em', render: r => new Date(r.created_at).toLocaleString('pt-BR') },
              { key: 'acao', label: '', align: 'right', render: r => (
                <button onClick={() => efetivar(r.id)} disabled={efetivando === r.id}
                  style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12 }}>
                  {efetivando === r.id ? 'enviando...' : 'transmitir'}
                </button>
              ) },
            ]}
            rows={dados.pendentes}
          />
        </div>
      );
    }

    /* ---- FERRAMENTAS FISCAIS (inutilização e carta de correção) ---- */
    // Duas operações que a SEFAZ exige e que não cabem no fluxo normal de emissão:
    //  - Inutilizar: declarar que um intervalo de números não virou nota. Buraco na sequência
    //    sem inutilização declarada é achado clássico de auditoria.
    //  - Carta de correção: só existe para NF-e (modelo 55). Para NFC-e a lei não admite —
    //    nota de consumidor errada se cancela e reemite.
    function AcougueFerramentasFiscais({ showToast }) {
      const [aberto, setAberto] = useState(null);
      const [inut, setInut] = useState({ serie: '9', numero_inicial: '', numero_final: '', justificativa: '' });
      const [carta, setCarta] = useState({ id: '', correcao: '' });
      const [enviando, setEnviando] = useState(false);

      const inutilizar = async () => {
        if (!confirm(`Declarar à SEFAZ que os números ${inut.numero_inicial} a ${inut.numero_final} da série ${inut.serie} não serão usados? Isso não tem volta.`)) return;
        setEnviando(true);
        const res = await apiCall('POST', '/acougue/nfce/inutilizar', inut);
        setEnviando(false);
        if (res.ok) { showToast('Numeração inutilizada na SEFAZ', 'success'); setInut({ ...inut, numero_inicial: '', numero_final: '', justificativa: '' }); }
        else showToast(res.data?.error || 'Erro ao inutilizar', 'error');
      };

      const enviarCarta = async () => {
        setEnviando(true);
        const res = await apiCall('POST', `/acougue/nfe/${carta.id}/carta-correcao`, { correcao: carta.correcao });
        setEnviando(false);
        if (res.ok) { showToast('Carta de correção registrada na SEFAZ', 'success'); setCarta({ id: '', correcao: '' }); }
        else showToast(res.data?.error || 'Erro ao enviar', 'error');
      };

      const Botao = ({ id, icon, children }) => (
        <button onClick={() => setAberto(aberto === id ? null : id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8,
            border: `1px solid ${aberto === id ? ACG_ACCENT : 'var(--bp-border2)'}`,
            background: aberto === id ? `${ACG_ACCENT}18` : 'var(--bp-card)',
            color: aberto === id ? ACG_ACCENT : 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
          <i className={`fas ${icon}`}></i>{children}
        </button>
      );

      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Ferramentas fiscais</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Botao id="inutilizar" icon="fa-ban">Inutilizar numeração</Botao>
            <Botao id="carta" icon="fa-pen-to-square">Carta de correção</Botao>
          </div>

          {aberto === 'inutilizar' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bp-border)' }}>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 12px', lineHeight: 1.6 }}>
                Use quando um número foi queimado sem virar nota (falha no meio da emissão, salto de numeração).
                Declara à SEFAZ que aquele intervalo não será usado. <strong>Não tem volta.</strong>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <AcgInput label="Série" value={inut.serie} onChange={e => setInut({ ...inut, serie: e.target.value.replace(/\D/g, '') })} />
                <AcgInput label="Número inicial" value={inut.numero_inicial} onChange={e => setInut({ ...inut, numero_inicial: e.target.value.replace(/\D/g, '') })} />
                <AcgInput label="Número final" value={inut.numero_final} onChange={e => setInut({ ...inut, numero_final: e.target.value.replace(/\D/g, '') })} />
              </div>
              <AcgInput label="Justificativa" value={inut.justificativa} onChange={e => setInut({ ...inut, justificativa: e.target.value })}
                placeholder="Mínimo 15 caracteres" hint={`${inut.justificativa.length}/15 caracteres`} />
              <AcgButton onClick={inutilizar} disabled={enviando || inut.justificativa.trim().length < 15 || !inut.numero_inicial || !inut.numero_final}>
                {enviando ? 'Enviando...' : 'Inutilizar na SEFAZ'}
              </AcgButton>
            </div>
          )}

          {aberto === 'carta' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bp-border)' }}>
              <p style={{ color: '#f59e0b', fontSize: 11, margin: '0 0 12px', lineHeight: 1.6 }}>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: 5 }}></i>
                Vale só para <strong>NF-e (modelo 55)</strong>. A lei não admite carta de correção para NFC-e do balcão —
                nesse caso a nota tem que ser cancelada e reemitida. Também não serve para corrigir valor, quantidade ou destinatário.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <AcgInput label="ID da nota no sistema" value={carta.id} onChange={e => setCarta({ ...carta, id: e.target.value.replace(/\D/g, '') })} placeholder="ex: 12" />
              </div>
              <AcgInput label="Texto da correção" value={carta.correcao} onChange={e => setCarta({ ...carta, correcao: e.target.value })}
                placeholder="Mínimo 15 caracteres" hint={`${carta.correcao.length}/15 caracteres`} />
              <AcgButton onClick={enviarCarta} disabled={enviando || carta.correcao.trim().length < 15 || !carta.id}>
                {enviando ? 'Enviando...' : 'Enviar carta de correção'}
              </AcgButton>
            </div>
          )}
        </div>
      );
    }

    function AcougueNotas({ showToast }) {
      const [notas, setNotas] = useState([]);
      const [loading, setLoading] = useState(true);
      const [configured, setConfigured] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const emptyForm = { type: 'saida', total_value: '', natureza_operacao: '', destinatario_nome: '', destinatario_doc: '', descricao: '' };
      const [form, setForm] = useState(emptyForm);
      const [saving, setSaving] = useState(false);

      const load = async () => {
        setLoading(true);
        const [notasRes, settingsRes] = await Promise.all([
          apiCall('GET', '/acougue/nfe'),
          apiCall('GET', '/acougue/settings'),
        ]);
        if (notasRes.ok) setNotas(notasRes.data); else showToast(notasRes.data?.error || 'Erro ao carregar notas', 'error');
        if (settingsRes.ok) setConfigured(!!settingsRes.data.focus_nfe_configured);
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      const submit = async (e) => {
        e.preventDefault();
        if (!form.total_value) { showToast('Informe o valor total', 'error'); return; }
        setSaving(true);
        const res = await apiCall('POST', '/acougue/nfe', {
          type: form.type,
          total_value: Number(form.total_value),
          natureza_operacao: form.natureza_operacao || undefined,
          destinatario: form.destinatario_nome ? { nome: form.destinatario_nome, cpf: form.destinatario_doc } : undefined,
          itens: [{ descricao: form.descricao || (form.type === 'entrada' ? 'Compra de carcaça' : 'Venda de mercadoria'), quantidade: 1, unidade: 'UN', valor_unitario: Number(form.total_value), valor_total: Number(form.total_value) }],
        });
        setSaving(false);
        if (!res.ok) { showToast(res.data?.error || 'Erro ao emitir nota', 'error'); return; }
        showToast(res.data.warning || `Nota registrada (${res.data.status})`, res.data.warning ? 'info' : 'success');
        setForm(emptyForm); setShowForm(false); load();
        // Autorizada, o DANFE sai na hora, sem ninguém pedir: ele acompanha a mercadoria, e
        // nota emitida sem DANFE impresso é carga que não pode sair do açougue.
        if (res.data.danfe_pronto) {
          const r = await acgImprimirDanfe(res.data.id);
          if (!r.ok) showToast(`Nota autorizada, mas o DANFE não veio: ${r.erro}`, 'error');
        }
      };

      const imprimirDanfe = async (nota) => {
        const r = await acgImprimirDanfe(nota.id);
        if (!r.ok) showToast(r.erro, 'error');
      };

      const baixarXml = async (nota) => {
        const r = await acgBaixarXml(nota.id, nota.numero);
        if (!r.ok) showToast(r.erro, 'error');
      };

      const cancelNota = async (id) => {
        const justificativa = prompt('Justificativa do cancelamento (mín. 15 caracteres, exigida pela SEFAZ quando a nota já foi autorizada):');
        if (justificativa === null) return;
        const res = await apiCall('POST', `/acougue/nfe/${id}/cancel`, { justificativa });
        if (res.ok) { showToast('Nota cancelada', 'info'); load(); }
        else showToast(res.data?.error || 'Erro ao cancelar', 'error');
      };

      const statusColor = { rascunho: '#8b9bb4', processando: '#f59e0b', autorizada: '#10b981', erro: '#ef4444', cancelada: '#6b7280' };
      const statusLabel = { rascunho: 'Rascunho', processando: 'Processando', autorizada: 'Autorizada', erro: 'Erro', cancelada: 'Cancelada' };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <AcgSectionTitle icon="fa-file-invoice" title="Emissão de Nota" subtitle="Notas de entrada (compra de carcaça) e saída (venda)" />
            <AcgButton onClick={() => setShowForm(s => !s)}><i className="fas fa-plus" style={{ marginRight: 6 }}></i>Nova nota</AcgButton>
          </div>

          <AcougueContingencia showToast={showToast} onMudou={load} />

          <AcougueFerramentasFiscais showToast={showToast} />

          {!configured && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <i className="fas fa-triangle-exclamation" style={{ color: '#f59e0b', marginTop: 2 }}></i>
              <div>
                <p style={{ color: 'var(--bp-text)', fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>Emissão fiscal real não configurada</p>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>Notas criadas aqui ficam como rascunho local. Para emitir NF-e de verdade junto à SEFAZ, configure <code>FOCUS_NFE_TOKEN</code> no servidor (contrate a Focus NFe) e preencha CNPJ/Inscrição Estadual em Configurações.</p>
              </div>
            </div>
          )}

          {showForm && (
            <form onSubmit={submit} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <AcgSelect label="Tipo" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="entrada">Entrada (compra de carcaça)</option>
                  <option value="saida">Saída (venda)</option>
                </AcgSelect>
                <AcgInput label="Valor total (R$)" type="number" step="0.01" min="0" value={form.total_value} onChange={e => setForm({ ...form, total_value: e.target.value })} required />
                <AcgInput label="Natureza da operação" value={form.natureza_operacao} onChange={e => setForm({ ...form, natureza_operacao: e.target.value })} placeholder={form.type === 'entrada' ? 'Compra de produtor rural' : 'Venda de mercadoria'} />
                <AcgInput label="Nome do destinatário/fornecedor" value={form.destinatario_nome} onChange={e => setForm({ ...form, destinatario_nome: e.target.value })} />
                <AcgInput label="CPF/CNPJ do destinatário/fornecedor" value={form.destinatario_doc} onChange={e => setForm({ ...form, destinatario_doc: e.target.value })} />
                <AcgInput label="Descrição" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <AcgButton type="submit" disabled={saving}>{saving ? 'Emitindo...' : 'Emitir nota'}</AcgButton>
                <AcgButton type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</AcgButton>
              </div>
            </form>
          )}

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 16 }}>
            {loading ? <AcgSpinner /> : (
              <AcgTable
                emptyLabel="Nenhuma nota emitida ainda"
                columns={[
                  { key: 'created_at', label: 'Data', render: r => fmtDate(r.created_at) },
                  { key: 'type', label: 'Tipo', render: r => r.type === 'entrada' ? 'Entrada' : 'Saída' },
                  { key: 'total_value', label: 'Valor', align: 'right', render: r => fmtCur(r.total_value) },
                  { key: 'chave_acesso', label: 'Chave de acesso', render: r => r.chave_acesso ? <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{r.chave_acesso}</span> : '—' },
                  { key: 'status', label: 'Status', render: r => <span style={{ color: statusColor[r.status], fontSize: 12, fontWeight: 600 }}>{statusLabel[r.status] || r.status}</span> },
                  { key: 'actions', label: '', align: 'right', render: r => (
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {/* O DANFE é o papel que viaja com a mercadoria — reimprimir é rotina
                          (rasgou, molhou, o motorista perdeu), não exceção. */}
                      {r.danfe_url && (
                        <button onClick={() => imprimirDanfe(r)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, fontFamily: 'Inter, sans-serif' }}>
                          imprimir DANFE
                        </button>
                      )}
                      {r.xml_url && (
                        <button onClick={() => baixarXml(r)} style={{ background: 'none', border: 'none', color: 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, fontFamily: 'Inter, sans-serif' }}>
                          XML
                        </button>
                      )}
                      {(r.status === 'autorizada' || r.status === 'rascunho') && (
                        <button onClick={() => cancelNota(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, fontFamily: 'Inter, sans-serif' }}>
                          cancelar
                        </button>
                      )}
                    </div>
                  ) },
                ]}
                rows={notas}
              />
            )}
          </div>
        </div>
      );
    }

    /* ---- PIS / COFINS ---- */
    // Imprime dentro da própria página (em vez de abrir aba nova via window.open) — bloqueadores
    // de pop-up (ativados por padrão na maioria dos navegadores) impediam o relatório de abrir.
    // Um nó oculto só some do CSS normal e vira a única coisa visível quando a impressão dispara.
    function printApuracaoReport(apuracao, settings) {
      let printRoot = document.getElementById('acg-print-root');
      if (!printRoot) {
        printRoot = document.createElement('div');
        printRoot.id = 'acg-print-root';
        document.body.appendChild(printRoot);

        const style = document.createElement('style');
        style.id = 'acg-print-style';
        style.textContent = `
          #acg-print-root { display: none; }
          @media print {
            body > *:not(#acg-print-root) { display: none !important; }
            #acg-print-root { display: block !important; padding: 40px; font-family: Arial, Helvetica, sans-serif; color: #111; }
            #acg-print-root h1 { font-size: 20px; margin-bottom: 4px; }
            #acg-print-root h2 { font-size: 14px; color: #555; font-weight: normal; margin-top: 0; }
            #acg-print-root h3 { font-size: 14px; margin-bottom: 6px; }
            #acg-print-root table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            #acg-print-root .box { border: 1px solid #ccc; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
            #acg-print-root .footer { font-size: 11px; color: #777; margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; }
          }
        `;
        document.head.appendChild(style);
      }

      const linha = (label, valor, destaque) => `<tr><td style="padding:6px 0;color:#444;">${label}</td><td style="padding:6px 0;text-align:right;font-weight:${destaque ? 700 : 400};color:${destaque ? '#000' : '#222'};">${valor}</td></tr>`;
      printRoot.innerHTML = `
        <h1>${settings.business_name || 'Açougue'} ${settings.cnpj ? '— CNPJ ' + settings.cnpj : ''}</h1>
        <h2>Apuração de PIS/COFINS — ${acgMonthNames[apuracao.month - 1]} de ${apuracao.year} — Regime não-cumulativo (Lucro Real)</h2>
        <div class="box">
          <h3>PIS (${apuracao.pis_rate}%) — Lei nº 10.637/2002</h3>
          <table>
            ${linha('Crédito sobre entradas', fmtCur(apuracao.pis_credit))}
            ${linha('Débito sobre saídas', fmtCur(apuracao.pis_debit))}
            ${linha('Valor a recolher', fmtCur(apuracao.pis_due), true)}
          </table>
          <h3>COFINS (${apuracao.cofins_rate}%) — Lei nº 10.833/2003</h3>
          <table>
            ${linha('Crédito sobre entradas', fmtCur(apuracao.cofins_credit))}
            ${linha('Débito sobre saídas', fmtCur(apuracao.cofins_debit))}
            ${linha('Valor a recolher', fmtCur(apuracao.cofins_due), true)}
          </table>
          <h3>Base de cálculo</h3>
          <table>
            ${linha('Entradas no período (créditos)', fmtCur(apuracao.entradas_total))}
            ${linha('Saídas no período (débitos)', fmtCur(apuracao.saidas_total))}
            ${linha('Total PIS + COFINS a recolher', fmtCur(apuracao.pis_due + apuracao.cofins_due), true)}
          </table>
        </div>
        <div class="footer">
          Relatório gerado automaticamente pelo sistema em ${new Date().toLocaleString('pt-BR')}. Apuração não-cumulativa
          conforme Lei nº 10.637/2002 (PIS) e Lei nº 10.833/2003 (COFINS) — créditos calculados sobre o total de entradas
          (compra de carcaça) e débitos sobre o total de saídas (vendas e cortes de venda direta) do período. Este
          documento é um apoio operacional interno e não substitui a apuração formal feita pela contabilidade.
        </div>
      `;
      window.print();
    }

    /* ---- ENTRADA DE NOTAS (XML do fornecedor) ---- */
    function AcougueNotasEntrada({ showToast }) {
      const [notas, setNotas] = useState([]);
      const [loading, setLoading] = useState(true);
      const [enviando, setEnviando] = useState(false);
      const [detalhe, setDetalhe] = useState(null);
      const [produtos, setProdutos] = useState([]);
      const fileRef = useRef(null);

      const load = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/acougue/purchases');
        if (res.ok) setNotas(res.data); else showToast(res.data?.error || 'Erro ao carregar notas', 'error');
        setLoading(false);
      };
      useEffect(() => {
        load();
        apiCall('GET', '/acougue/products').then(r => { if (r.ok) setProdutos(r.data); });
      }, []);

      // Aceita vários arquivos de uma vez: o fornecedor costuma mandar o lote do mês junto.
      const enviarArquivos = async (files) => {
        if (!files?.length) return;
        setEnviando(true);
        let ok = 0, dup = 0, erro = 0;
        for (const file of files) {
          const xml = await file.text();
          const res = await apiCall('POST', '/acougue/purchases/xml', { xml });
          if (res.ok) { ok++; if (res.data.aviso) showToast(`${file.name}: ${res.data.aviso}`, 'info'); }
          else if (res.status === 409) dup++;
          else { erro++; showToast(`${file.name}: ${res.data?.error || 'erro'}`, 'error'); }
        }
        setEnviando(false);
        if (fileRef.current) fileRef.current.value = '';
        showToast(`${ok} nota(s) importada(s)${dup ? `, ${dup} já existia(m)` : ''}${erro ? `, ${erro} com erro` : ''}`, ok ? 'success' : 'info');
        load();
      };

      const abrirDetalhe = async (id) => {
        const res = await apiCall('GET', `/acougue/purchases/${id}`);
        if (res.ok) setDetalhe(res.data); else showToast(res.data?.error || 'Erro', 'error');
      };

      const vincular = async (itemId, productId) => {
        if (!productId) return;
        const res = await apiCall('PATCH', `/acougue/purchases/items/${itemId}`, { product_id: Number(productId) });
        if (res.ok) { showToast(`Vinculado — ${res.data.quantidade_somada} somado ao estoque`, 'success'); abrirDetalhe(detalhe.id); }
        else showToast(res.data?.error || 'Erro ao vincular', 'error');
      };

      return (
        <div>
          <AcgSectionTitle icon="fa-file-import" title="Entrada de Notas" subtitle="Importe o XML da nota do fornecedor — o estoque e os créditos de PIS/COFINS entram sozinhos" />

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <input ref={fileRef} type="file" accept=".xml,text/xml" multiple style={{ display: 'none' }}
              onChange={e => enviarArquivos(Array.from(e.target.files || []))} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <AcgButton onClick={() => fileRef.current?.click()} disabled={enviando}>
                <i className="fas fa-upload" style={{ marginRight: 8 }}></i>{enviando ? 'Importando...' : 'Selecionar XML(s)'}
              </AcgButton>
              <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>
                Pode selecionar vários. Nota já importada é recusada pela chave de acesso, então não duplica estoque.
              </span>
            </div>
          </div>

          {loading ? <AcgSpinner /> : (
            <AcgTable
              columns={[
                { key: 'numero', label: 'Nota', render: r => `${r.numero}/${r.serie}` },
                { key: 'emit_nome', label: 'Fornecedor' },
                { key: 'data_emissao', label: 'Emissão', render: r => fmtDate(r.data_emissao) },
                { key: 'itens', label: 'Itens', align: 'right' },
                { key: 'valor_total', label: 'Total', align: 'right', render: r => fmtCur(r.valor_total) },
                { key: 'creditos', label: 'PIS+COFINS', align: 'right', render: r => fmtCur((r.valor_pis || 0) + (r.valor_cofins || 0)) },
                { key: 'acoes', label: '', align: 'right', render: r => (
                  <button onClick={() => abrirDetalhe(r.id)} style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12 }}>ver itens</button>
                ) },
              ]}
              rows={notas}
              emptyLabel="Nenhuma nota importada ainda"
            />
          )}

          {detalhe && (
            <div style={{ marginTop: 20, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: 0 }}>
                  Nota {detalhe.numero}/{detalhe.serie} — {detalhe.emit_nome}
                </p>
                <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', color: 'var(--bp-text-faint)', cursor: 'pointer' }}>fechar</button>
              </div>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 12px', wordBreak: 'break-all' }}>Chave: {detalhe.chave_acesso || '—'}</p>
              <AcgTable
                columns={[
                  { key: 'descricao', label: 'Item' },
                  { key: 'ncm', label: 'NCM' },
                  { key: 'cfop', label: 'CFOP' },
                  { key: 'quantidade', label: 'Qtd', align: 'right', render: r => `${r.quantidade} ${r.unidade}` },
                  { key: 'valor_total', label: 'Total', align: 'right', render: r => fmtCur(r.valor_total) },
                  // Item sem vínculo não movimentou estoque — aqui é onde o operador resolve.
                  { key: 'produto', label: 'Produto no estoque', render: r => r.product_id
                    ? <span style={{ color: '#16a34a' }}><i className="fas fa-check" style={{ marginRight: 5 }}></i>vinculado</span>
                    : (
                      <select defaultValue="" onChange={e => vincular(r.id, e.target.value)}
                        style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 11, maxWidth: 170 }}>
                        <option value="">vincular a...</option>
                        {produtos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) },
                ]}
                rows={detalhe.itens}
                emptyLabel="Sem itens"
              />
            </div>
          )}
        </div>
      );
    }

    /* ---- CÂMARA FRIA (quebra de peso) ---- */
    function AcougueCamara({ showToast }) {
      const [dados, setDados] = useState(null);
      const [editando, setEditando] = useState(null);
      const [form, setForm] = useState({});

      const load = async () => {
        const res = await apiCall('GET', '/acougue/cold-storage');
        if (res.ok) setDados(res.data); else showToast(res.data?.error || 'Erro ao carregar', 'error');
      };
      useEffect(() => { load(); }, []);

      const salvar = async (id) => {
        const res = await apiCall('PATCH', `/acougue/cold-storage/${id}`, form);
        if (res.ok) { showToast('Câmara atualizada', 'success'); setEditando(null); setForm({}); load(); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      if (!dados) return <AcgSpinner />;

      const naCamara = dados.entries.filter(e => e.chamber_in_at && !e.chamber_out_at);
      const perdaTotal = dados.entries.reduce((s, e) => s + (e.perda_real_kg || 0), 0);

      return (
        <div>
          <AcgSectionTitle icon="fa-snowflake" title="Câmara Fria" subtitle="Carne perde água parada na câmara — aqui o esperado é comparado com o pesado de verdade" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
            <AcgCard label="Carcaças na câmara" value={String(naCamara.length)} icon="fa-snowflake" color="#38bdf8" bg="rgba(56,189,248,0.12)" />
            <AcgCard label="Peso estimado agora" value={`${naCamara.reduce((s, e) => s + (e.peso_estimado_atual || 0), 0).toFixed(1)} kg`} icon="fa-scale-balanced" color="#a78bfa" bg="rgba(167,139,250,0.12)" />
            <AcgCard label="Perda real acumulada" value={`${perdaTotal.toFixed(1)} kg`} icon="fa-arrow-trend-down" color="#f87171" bg="rgba(248,113,113,0.12)" />
            <AcgCard label="Taxa configurada" value={`${dados.shrink_pct_day}% / dia`} icon="fa-percent" color="#fbbf24" bg="rgba(251,191,36,0.12)" />
          </div>

          <AcgTable
            columns={[
              { key: 'supplier_name', label: 'Fornecedor' },
              { key: 'weight_kg', label: 'Entrada', align: 'right', render: r => `${r.weight_kg} kg` },
              { key: 'dias', label: 'Dias', align: 'right', render: r => r.dias ?? '—' },
              { key: 'esperada', label: 'Perda esperada', align: 'right', render: r => r.perda_esperada_kg != null ? `${r.perda_esperada_kg} kg (${r.perda_esperada_pct}%)` : '—' },
              { key: 'real', label: 'Perda real', align: 'right', render: r => r.perda_real_kg != null ? `${r.perda_real_kg} kg (${r.perda_real_pct}%)` : '—' },
              // A divergência é o número que interessa: acima do esperado pode ser câmara mal
              // regulada ou desvio; muito abaixo costuma ser erro de pesagem.
              { key: 'div', label: 'Divergência', align: 'right', render: r => r.divergencia_kg == null ? '—' : (
                <span style={{ color: Math.abs(r.divergencia_kg) < 1 ? 'var(--bp-text-secondary)' : (r.divergencia_kg > 0 ? '#f87171' : '#38bdf8') }}>
                  {r.divergencia_kg > 0 ? '+' : ''}{r.divergencia_kg} kg
                </span>
              ) },
              { key: 'acoes', label: '', align: 'right', render: r => (
                <button onClick={() => { setEditando(r.id); setForm({ chamber_in_at: r.chamber_in_at?.slice(0, 16) || '', chamber_out_at: r.chamber_out_at?.slice(0, 16) || '', weight_out_kg: r.weight_out_kg ?? '' }); }}
                  style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 12 }}>registrar</button>
              ) },
            ]}
            rows={dados.entries}
            emptyLabel="Nenhuma carcaça registrada"
          />

          {editando && (
            <div style={{ marginTop: 20, background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 14px' }}>Movimentação na câmara</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <AcgInput label="Entrada na câmara" type="datetime-local" value={form.chamber_in_at || ''} onChange={e => setForm({ ...form, chamber_in_at: e.target.value })} />
                <AcgInput label="Saída da câmara" type="datetime-local" value={form.chamber_out_at || ''} onChange={e => setForm({ ...form, chamber_out_at: e.target.value })} />
                <AcgInput label="Peso na saída (kg)" type="number" step="0.001" min="0" value={form.weight_out_kg} onChange={e => setForm({ ...form, weight_out_kg: e.target.value })}
                  hint="Pese ao tirar da câmara. É isso que revela a perda real." />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <AcgButton onClick={() => salvar(editando)}>Salvar</AcgButton>
                <AcgButton variant="ghost" onClick={() => { setEditando(null); setForm({}); }}>Cancelar</AcgButton>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ---- SPED FISCAL (EFD ICMS/IPI) ---- */
    function AcougueSped({ month, year, showToast }) {
      const [resumo, setResumo] = useState(null);
      const [gerando, setGerando] = useState(false);

      const gerar = async () => {
        setGerando(true);
        const res = await apiCall('GET', `/acougue/sped/efd-icms-ipi?month=${month}&year=${year}`);
        setGerando(false);
        if (res.ok) setResumo(res.data);
        else { setResumo(null); showToast(res.data?.error || 'Erro ao gerar SPED', 'error'); }
      };

      // O download passa pelo fetch autenticado (a rota exige token), então o arquivo vem como
      // blob e é salvo por um link temporário — não dá pra apontar um <a href> direto pra API.
      const baixar = async () => {
        const token = localStorage.getItem('token');
        const resp = await fetch(`/api/acougue/sped/efd-icms-ipi?month=${month}&year=${year}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) { showToast('Erro ao baixar o arquivo', 'error'); return; }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SPED-EFD-${String(month).padStart(2, '0')}${year}.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      };

      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>SPED Fiscal — EFD ICMS/IPI</p>
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0 }}>
                Monta o arquivo do período com as notas de entrada, as NFC-e emitidas e o inventário.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <AcgButton variant="ghost" onClick={gerar} disabled={gerando}>{gerando ? 'Gerando...' : 'Conferir'}</AcgButton>
              {resumo && <AcgButton onClick={baixar}><i className="fas fa-download" style={{ marginRight: 6 }}></i>Baixar .txt</AcgButton>}
            </div>
          </div>

          {resumo && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
                {[['Linhas', resumo.linhas], ['Notas de entrada', resumo.notas_entrada], ['Vendas com NFC-e', resumo.vendas_com_nfce], ['Itens no inventário', resumo.itens_no_inventario]].map(([l, v]) => (
                  <div key={l} style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ color: 'var(--bp-text-faint)', fontSize: 11 }}>{l}</div>
                    <div style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 18 }}>{v}</div>
                  </div>
                ))}
              </div>
              <pre style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border2)', borderRadius: 8, padding: 12, overflowX: 'auto', fontSize: 10, color: 'var(--bp-text-secondary)', margin: '0 0 12px', maxHeight: 180 }}>
                {resumo.preview.join('\n')}
              </pre>
              {resumo.vendas_com_nfce === 0 && (
                <p style={{ color: '#f59e0b', fontSize: 12, margin: '0 0 10px' }}>
                  <i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }}></i>
                  Nenhuma venda com NFC-e autorizada neste período — o bloco C sai só com as entradas.
                </p>
              )}
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
                <i className="fas fa-circle-info" style={{ marginRight: 6 }}></i>{resumo.aviso}
              </p>
            </>
          )}
        </div>
      );
    }

    function AcougueImpostos({ showToast }) {
      const now = new Date();
      const [month, setMonth] = useState(now.getMonth() + 1);
      const [year, setYear] = useState(now.getFullYear());
      const [apuracao, setApuracao] = useState(null);
      const [reconciliation, setReconciliation] = useState(null);
      const [settings, setSettings] = useState(null);
      const [loading, setLoading] = useState(true);
      const [closing, setClosing] = useState(false);

      const load = async () => {
        setLoading(true);
        const [apuracaoRes, reconRes, settingsRes] = await Promise.all([
          apiCall('GET', `/acougue/taxes/apuracao?month=${month}&year=${year}`),
          apiCall('GET', `/acougue/reconciliation?month=${month}&year=${year}`),
          apiCall('GET', '/acougue/settings'),
        ]);
        if (apuracaoRes.ok) setApuracao(apuracaoRes.data); else showToast(apuracaoRes.data?.error || 'Erro ao calcular apuração', 'error');
        if (reconRes.ok) setReconciliation(reconRes.data);
        if (settingsRes.ok) setSettings(settingsRes.data);
        setLoading(false);
      };
      useEffect(() => { load(); }, [month, year]);

      const closePeriod = async () => {
        if (!confirm(`Fechar a apuração de ${acgMonthNames[month - 1]}/${year}? Isso trava os valores deste período.`)) return;
        setClosing(true);
        const res = await apiCall('POST', '/acougue/taxes/periods/close', { month, year });
        setClosing(false);
        if (res.ok) { showToast('Período fechado', 'success'); load(); }
        else showToast(res.data?.error || 'Erro ao fechar período', 'error');
      };

      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <AcgSectionTitle icon="fa-percent" title="PIS / COFINS" subtitle="Apuração não-cumulativa (Lucro Real) — Lei nº 10.637/2002 (PIS) e Lei nº 10.833/2003 (COFINS)" />
            {apuracao && <AcgButton variant="ghost" onClick={() => printApuracaoReport(apuracao, settings || {})}><i className="fas fa-print" style={{ marginRight: 6 }}></i>Imprimir relatório</AcgButton>}
          </div>

          <AcougueSped month={month} year={year} showToast={showToast} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }}>
              {acgMonthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 90, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13 }} />
          </div>

          {loading || !apuracao ? <AcgSpinner /> : (
            <>
              {apuracao.closed && (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#10b981', fontSize: 13 }}>
                  <i className="fas fa-lock" style={{ marginRight: 8 }}></i>Período fechado em {fmtDate(apuracao.closed_snapshot.closed_at)}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>PIS ({apuracao.pis_rate}%)</p>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 10px' }}>Lei nº 10.637/2002</p>
                  {[['Crédito (entradas)', apuracao.pis_credit, '#10b981'], ['Débito (saídas)', apuracao.pis_debit, '#ef4444'], ['A recolher', apuracao.pis_due, ACG_ACCENT]].map(([label, val, color]) => (
                    <p key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '6px 0', color: 'var(--bp-text-secondary)' }}>
                      <span>{label}</span><strong style={{ color }}>{fmtCur(val)}</strong>
                    </p>
                  ))}
                </div>
                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>COFINS ({apuracao.cofins_rate}%)</p>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 10px' }}>Lei nº 10.833/2003</p>
                  {[['Crédito (entradas)', apuracao.cofins_credit, '#10b981'], ['Débito (saídas)', apuracao.cofins_debit, '#ef4444'], ['A recolher', apuracao.cofins_due, ACG_ACCENT]].map(([label, val, color]) => (
                    <p key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '6px 0', color: 'var(--bp-text-secondary)' }}>
                      <span>{label}</span><strong style={{ color }}>{fmtCur(val)}</strong>
                    </p>
                  ))}
                </div>
                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 14px' }}>Base de cálculo</p>
                  {/* A separação entre receita tributada e não tributada é o número que mais
                      importa num açougue: a maior parte da carne bovina tem alíquota zero de
                      PIS/COFINS, então tratar tudo como tributado inflaria o imposto. */}
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '6px 0', color: 'var(--bp-text-secondary)' }}><span>Saídas totais</span><strong style={{ color: 'var(--bp-text)' }}>{fmtCur(apuracao.saidas_total)}</strong></p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0 4px 12px', color: 'var(--bp-text-faint)' }}><span>↳ tributada (gera débito)</span><strong style={{ color: '#ef4444' }}>{fmtCur(apuracao.base_pis_tributada)}</strong></p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0 10px 12px', color: 'var(--bp-text-faint)' }}><span>↳ alíquota zero / monofásico</span><strong style={{ color: '#10b981' }}>{fmtCur(apuracao.base_pis_nao_tributada)}</strong></p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '6px 0', color: 'var(--bp-text-secondary)' }}><span>Entradas (créditos)</span><strong style={{ color: 'var(--bp-text)' }}>{fmtCur(apuracao.entradas_total)}</strong></p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0 4px 12px', color: 'var(--bp-text-faint)' }}><span>↳ com nota (documentado)</span><strong>{fmtCur(apuracao.entradas_com_nota)}</strong></p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0 0 12px', color: 'var(--bp-text-faint)' }}><span>↳ lançamento manual (estimado)</span><strong>{fmtCur(apuracao.entradas_manuais)}</strong></p>
                  {apuracao.itens_sem_cst > 0 && (
                    <p style={{ color: '#f59e0b', fontSize: 11, margin: '10px 0 0', lineHeight: 1.5 }}>
                      <i className="fas fa-triangle-exclamation" style={{ marginRight: 5 }}></i>
                      {apuracao.itens_sem_cst} item(ns) vendido(s) sem CST cadastrado foram tratados como <strong>tributados</strong>. Preencha em Produtos para a apuração ficar exata.
                    </p>
                  )}
                  {(apuracao.pis_saldo_credor > 0 || apuracao.cofins_saldo_credor > 0) && (
                    <p style={{ color: '#10b981', fontSize: 11, margin: '10px 0 0', lineHeight: 1.5 }}>
                      <i className="fas fa-circle-info" style={{ marginRight: 5 }}></i>
                      Saldo credor a transportar: PIS {fmtCur(apuracao.pis_saldo_credor)} · COFINS {fmtCur(apuracao.cofins_saldo_credor)}
                    </p>
                  )}
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '14px 0 0', paddingTop: 10, borderTop: '1px solid var(--bp-border)', color: 'var(--bp-text)', fontWeight: 700 }}><span>Total a recolher</span><span style={{ color: ACG_ACCENT }}>{fmtCur(apuracao.pis_due + apuracao.cofins_due)}</span></p>
                </div>
              </div>

              {!apuracao.closed && (
                <AcgButton onClick={closePeriod} disabled={closing} style={{ marginBottom: 24 }}>{closing ? 'Fechando...' : <><i className="fas fa-lock" style={{ marginRight: 6 }}></i>Fechar apuração do período</>}</AcgButton>
              )}

              {reconciliation && (
                <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
                  <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>
                    <i className="fas fa-shield-halved" style={{ color: ACG_ACCENT, marginRight: 8 }}></i>Conferência com notas emitidas
                  </p>
                  <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 16px' }}>
                    Compara o que foi movimentado (registros internos) com o que foi declarado em nota fiscal — inconsistência aqui é justamente o que costuma cair na malha fina da Receita.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                    {[
                      { label: 'Entradas', registrado: reconciliation.entradas_registradas, notas: reconciliation.notas_entrada_emitidas, div: reconciliation.entrada_divergencia, ok: reconciliation.entrada_ok },
                      { label: 'Saídas', registrado: reconciliation.saidas_registradas, notas: reconciliation.notas_saida_emitidas, div: reconciliation.saida_divergencia, ok: reconciliation.saida_ok },
                    ].map(row => (
                      <div key={row.label} style={{ border: `1px solid ${row.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, background: row.ok ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 14 }}>
                        <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px' }}>
                          <strong style={{ color: 'var(--bp-text)', fontSize: 13 }}>{row.label}</strong>
                          <span style={{ color: row.ok ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: 700 }}>
                            <i className={`fas ${row.ok ? 'fa-check-circle' : 'fa-triangle-exclamation'}`} style={{ marginRight: 4 }}></i>{row.ok ? 'Bate' : 'Divergente'}
                          </span>
                        </p>
                        <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0', color: 'var(--bp-text-secondary)' }}><span>Movimentado (registros)</span><span>{fmtCur(row.registrado)}</span></p>
                        <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0', color: 'var(--bp-text-secondary)' }}><span>Declarado (notas)</span><span>{fmtCur(row.notas)}</span></p>
                        <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '4px 0', fontWeight: 700, color: row.ok ? '#10b981' : '#ef4444' }}><span>Diferença</span><span>{fmtCur(row.div)}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    /* ---- CONFIGURAÇÕES ---- */
    function AcougueConfig({ showToast }) {
      const [form, setForm] = useState(null);
      const [saving, setSaving] = useState(false);

      const load = async () => {
        const res = await apiCall('GET', '/acougue/settings');
        if (res.ok) setForm(res.data); else showToast(res.data?.error || 'Erro ao carregar configurações', 'error');
      };
      useEffect(() => { load(); }, []);

      const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        const res = await apiCall('PATCH', '/acougue/settings', form);
        setSaving(false);
        if (res.ok) { showToast('Configurações salvas', 'success'); setForm({ ...form, ...res.data }); }
        else showToast(res.data?.error || 'Erro ao salvar', 'error');
      };

      if (!form) return <AcgSpinner />;

      return (
        <div>
          <AcgSectionTitle icon="fa-gear" title="Configurações" subtitle="Dados fiscais usados na emissão de notas e no cálculo de PIS/COFINS" />

          <div style={{ background: form.focus_nfe_configured ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${form.focus_nfe_configured ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`fas ${form.focus_nfe_configured ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ color: form.focus_nfe_configured ? '#10b981' : '#ef4444' }}></i>
            <span style={{ color: 'var(--bp-text)', fontSize: 13 }}>
              Focus NFe: <strong>{form.focus_nfe_configured ? `configurado (ambiente: ${form.focus_nfe_environment})` : 'não configurado'}</strong>
              {!form.focus_nfe_configured && ' — defina FOCUS_NFE_TOKEN no servidor para emitir notas reais.'}
            </span>
          </div>

          <form onSubmit={submit} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 14px' }}>Dados do estabelecimento</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <AcgInput label="Razão social" value={form.business_name || ''} onChange={e => setForm({ ...form, business_name: e.target.value })} />
              <AcgInput label="CNPJ" value={form.cnpj || ''} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              <AcgInput label="Inscrição Estadual" value={form.ie || ''} onChange={e => setForm({ ...form, ie: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <AcgInput label="Logradouro" value={form.logradouro || ''} onChange={e => setForm({ ...form, logradouro: e.target.value })} />
              <AcgInput label="Número" value={form.numero || ''} onChange={e => setForm({ ...form, numero: e.target.value })} />
              <AcgInput label="Bairro" value={form.bairro || ''} onChange={e => setForm({ ...form, bairro: e.target.value })} />
              <AcgInput label="Município" value={form.municipio || ''} onChange={e => setForm({ ...form, municipio: e.target.value })} />
              <AcgInput label="UF" value={form.uf || ''} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
              <AcgInput label="CEP" value={form.cep || ''} onChange={e => setForm({ ...form, cep: e.target.value })} />
            </div>

            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '10px 0 4px' }}>Desconto do caixa</p>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 12px', lineHeight: 1.5 }}>
              O operador não digita valor de desconto: aperta o botão (ou o atalho) e aplica este
              percentual sobre o total. Deixe em 0 para não existir desconto no balcão — aí o
              botão nem aparece na tela do caixa.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <AcgInput label="Desconto (%)" type="number" step="0.01" min="0" max="100"
                value={form.desconto_pct ?? ''} onChange={e => setForm({ ...form, desconto_pct: e.target.value })}
                hint={Number(form.desconto_pct) > 0
                  ? `Em uma venda de R$ 100,00 o cliente paga ${fmtCur(100 - Number(form.desconto_pct))}.`
                  : 'Desligado: sem botão de desconto no caixa.'} />
            </div>

            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '10px 0 4px' }}>Gaveta de dinheiro</p>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 12px', lineHeight: 1.6 }}>
              A gaveta é ligada por cabo na impressora térmica e abre quando ela recebe um pulso.
              Por isso o sistema precisa <strong>alcançar a impressora pela rede</strong> — funciona com o
              servidor dentro da loja; rodando na nuvem, a impressora fica atrás do roteador do açougue.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <AcgSelect label="Abertura pela impressora" value={form.gaveta_ativa || 'false'}
                onChange={e => setForm({ ...form, gaveta_ativa: e.target.value })}>
                <option value="false">Desligada</option>
                <option value="true">Ligada</option>
              </AcgSelect>
              <AcgInput label="IP da impressora" value={form.impressora_ip || ''}
                onChange={e => setForm({ ...form, impressora_ip: e.target.value })} placeholder="ex: 192.168.0.50" />
              <AcgInput label="Porta" value={form.impressora_porta || '9100'}
                onChange={e => setForm({ ...form, impressora_porta: e.target.value.replace(/\D/g, '') })} hint="9100 é o padrão" />
              <AcgSelect label="Pino da gaveta" value={form.gaveta_pino || '0'}
                onChange={e => setForm({ ...form, gaveta_pino: e.target.value })}>
                <option value="0">Pino 2 (mais comum)</option>
                <option value="1">Pino 5</option>
              </AcgSelect>
              <AcgSelect label="Abrir sozinha em dinheiro" value={form.gaveta_auto_dinheiro || 'true'}
                onChange={e => setForm({ ...form, gaveta_auto_dinheiro: e.target.value })}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </AcgSelect>
            </div>
            <AcgButton type="button" variant="ghost" onClick={async () => {
              const res = await apiCall('POST', '/acougue/gaveta/testar', { ip: form.impressora_ip, porta: Number(form.impressora_porta) || 9100 });
              showToast(res.ok ? res.data.mensagem : (res.data?.error || 'Falhou'), res.ok ? 'success' : 'error');
            }} style={{ marginBottom: 14 }}>
              <i className="fas fa-vault" style={{ marginRight: 6 }}></i>Testar abertura
            </AcgButton>

            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '10px 0 4px' }}>Atalhos do caixa</p>
            <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 12px', lineHeight: 1.5 }}>
              Clique num campo e aperte a tecla que quer usar. Evite F1 (ajuda do navegador) e F11 (tela cheia),
              que o navegador não deixa o sistema interceptar.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              {ACG_ACOES_CAIXA.map(acao => {
                const mapa = acgLerHotkeys(form);
                return (
                  <AcgInput
                    key={acao.id}
                    label={acao.label}
                    value={mapa[acao.id] || ''}
                    readOnly
                    placeholder="clique e aperte a tecla"
                    onKeyDown={e => {
                      e.preventDefault();
                      // Backspace/Delete limpam o atalho; qualquer outra tecla vira o novo.
                      const tecla = (e.key === 'Backspace' || e.key === 'Delete') ? '' : e.key;
                      setForm({ ...form, hotkeys: JSON.stringify({ ...mapa, [acao.id]: tecla }) });
                    }}
                    style={{ fontFamily: 'DM Mono, monospace', cursor: 'pointer' }}
                  />
                );
              })}
            </div>

            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '10px 0 14px' }}>Tributação</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <AcgSelect label="Regime tributário" value={form.regime_tributario || 'lucro_real'} onChange={e => setForm({ ...form, regime_tributario: e.target.value })}>
                <option value="lucro_real">Lucro Real (não-cumulativo)</option>
                <option value="lucro_presumido">Lucro Presumido (cumulativo)</option>
              </AcgSelect>
              <AcgInput label="Alíquota PIS (%)" type="number" step="0.01" value={form.pis_rate || ''} onChange={e => setForm({ ...form, pis_rate: e.target.value })} />
              <AcgInput label="Alíquota COFINS (%)" type="number" step="0.01" value={form.cofins_rate || ''} onChange={e => setForm({ ...form, cofins_rate: e.target.value })} />
            </div>
            {form.regime_tributario === 'lucro_presumido' && (
              <p style={{ color: '#f59e0b', fontSize: 12, margin: '0 0 12px' }}><i className="fas fa-triangle-exclamation" style={{ marginRight: 6 }}></i>No regime cumulativo (Lucro Presumido) não há aproveitamento de créditos — as alíquotas padrão são 0,65% (PIS) e 3% (COFINS). O cálculo de apuração deste sistema assume créditos sobre entradas; ajuste com seu contador antes de usar os valores para recolhimento.</p>
            )}

            <AcgButton type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configurações'}</AcgButton>
          </form>
        </div>
      );
    }

    /* ---- EQUIPE E ACESSOS (só o dono) ---- */
    const ACG_EVENTOS_ACESSO = {
      login: ['Entrou', '#10b981'], login_falhou: ['Senha errada', '#ef4444'], login_recusado_inativo: ['Bloqueado: acesso desativado', '#ef4444'],
      logout: ['Saiu', 'var(--bp-text-muted)'], senha_alterada: ['Trocou a própria senha', '#3b82f6'], sessoes_encerradas: ['Encerrou outras sessões', '#3b82f6'],
      usuario_criado: ['Criou usuário', '#d4a574'], usuario_desativado: ['Desativou usuário', '#f59e0b'], usuario_reativado: ['Reativou usuário', '#10b981'],
      papel_alterado: ['Mudou o papel', '#d4a574'], senha_provisoria_gerada: ['Gerou senha provisória', '#f59e0b'],
    };

    // Painel que mostra a senha provisória UMA vez. O servidor não a guarda legível, então
    // fechar isto sem anotar significa gerar outra.
    function AcgSenhaProvisoria({ dados, onFechar }) {
      const [copiado, setCopiado] = useState(false);
      const copiar = async () => {
        try { await navigator.clipboard.writeText(`Usuário: ${dados.login}\nSenha provisória: ${dados.senha}`); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
      };
      return (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 14, padding: '16px 18px', marginBottom: 20 }}>
          <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}><i className="fas fa-key" style={{ color: '#10b981', marginRight: 8 }}></i>Senha provisória de <strong>{dados.name || dados.login}</strong></p>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>Anote ou copie agora — ela não aparece de novo. No primeiro login o sistema obriga a pessoa a criar a senha dela.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 13, color: 'var(--bp-text-muted)' }}>usuário: <strong style={{ color: 'var(--bp-text)' }}>{dados.login}</strong></span>
            <span className="mono" style={{ fontSize: 18, letterSpacing: 2, color: 'var(--bp-text)', background: 'var(--bp-card)', border: '1px dashed var(--bp-border2)', borderRadius: 8, padding: '6px 12px' }}>{dados.senha}</span>
            <AcgButton type="button" variant="ghost" onClick={copiar}><i className={`fas ${copiado ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 6 }}></i>{copiado ? 'Copiado' : 'Copiar'}</AcgButton>
            <AcgButton type="button" variant="ghost" onClick={onFechar}>Já anotei</AcgButton>
          </div>
        </div>
      );
    }

    function AcougueEquipe({ showToast, user }) {
      const [aba, setAba] = useState('usuarios');
      const [usuarios, setUsuarios] = useState(null);
      const [acessos, setAcessos] = useState(null);
      const [form, setForm] = useState({ name: '', login: '', role: 'caixa' });
      const [criando, setCriando] = useState(false);
      const [senhaGerada, setSenhaGerada] = useState(null);
      const [ocupado, setOcupado] = useState(null);

      const load = async () => {
        const res = await apiCall('GET', '/usuarios');
        if (res.ok) setUsuarios(res.data); else showToast(res.data?.error || 'Erro ao carregar a equipe', 'error');
      };
      const loadAcessos = async () => {
        const res = await apiCall('GET', '/usuarios/acessos');
        if (res.ok) setAcessos(res.data); else showToast(res.data?.error || 'Erro ao carregar os acessos', 'error');
      };
      useEffect(() => { load(); }, []);
      useEffect(() => { if (aba === 'acessos' && !acessos) loadAcessos(); }, [aba]);

      const criar = async (e) => {
        e.preventDefault();
        setCriando(true);
        const res = await apiCall('POST', '/usuarios', form);
        setCriando(false);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível criar o usuário', 'error'); return; }
        setSenhaGerada({ login: res.data.login, name: res.data.name, senha: res.data.senha_provisoria });
        setForm({ name: '', login: '', role: 'caixa' });
        showToast(`${res.data.name} cadastrado como ${res.data.role_label}`);
        load();
      };

      const alterar = async (u, patch, aviso) => {
        setOcupado(u.id);
        const res = await apiCall('PATCH', `/usuarios/${u.id}`, patch);
        setOcupado(null);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível alterar', 'error'); return; }
        showToast(aviso);
        load();
      };

      const novaSenha = async (u) => {
        if (!window.confirm(`Gerar uma senha provisória para ${u.name}? As sessões abertas dessa pessoa serão encerradas.`)) return;
        setOcupado(u.id);
        const res = await apiCall('POST', `/usuarios/${u.id}/resetar-senha`);
        setOcupado(null);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível gerar a senha', 'error'); return; }
        setSenhaGerada({ login: res.data.login, name: u.name, senha: res.data.senha_provisoria });
        load();
      };

      const th = { textAlign: 'left', padding: '10px 12px', color: 'var(--bp-text-faint)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--bp-border)', whiteSpace: 'nowrap' };
      const td = { padding: '11px 12px', borderBottom: '1px solid var(--bp-border)', fontSize: 13, color: 'var(--bp-text)', verticalAlign: 'middle' };
      const badge = (texto, cor) => <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: cor, background: `${cor}1f`, border: `1px solid ${cor}55`, whiteSpace: 'nowrap' }}>{texto}</span>;
      const abaBtn = (id, rotulo, icone) => (
        <button type="button" onClick={() => setAba(id)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid', borderColor: aba === id ? ACG_ACCENT : 'var(--bp-border2)', background: aba === id ? ACG_ACCENT_BG : 'none', color: aba === id ? ACG_ACCENT : 'var(--bp-text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
          <i className={`fas ${icone}`} style={{ marginRight: 7 }}></i>{rotulo}
        </button>
      );

      const comSenhaPadrao = (usuarios || []).some(u => u.senha_padrao);

      return (
        <div>
          <AcgSectionTitle icon="fa-user-shield" title="Equipe e Acessos" subtitle="Quem entra no sistema, com qual papel, e o histórico de acessos" />

          {comSenhaPadrao && (
            <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--bp-text)', fontSize: 13, lineHeight: 1.5 }}>
              <i className="fas fa-triangle-exclamation" style={{ color: '#ef4444', marginTop: 2 }}></i>
              <span><strong>A senha padrão ainda está em uso.</strong> Ela está escrita no README público do sistema. Troque em <em>Minha Conta</em> (ou gere uma provisória aqui) antes de expor o sistema na internet.</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {abaBtn('usuarios', 'Usuários', 'fa-users')}
            {abaBtn('acessos', 'Histórico de acessos', 'fa-clock-rotate-left')}
          </div>

          {senhaGerada && <AcgSenhaProvisoria dados={senhaGerada} onFechar={() => setSenhaGerada(null)} />}

          {aba === 'usuarios' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: 18, alignItems: 'start' }}>
              <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, overflow: 'hidden' }}>
                {!usuarios ? <AcgSpinner /> : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={th}>Nome</th><th style={th}>Login</th><th style={th}>Papel</th><th style={th}>Último acesso</th><th style={th}>Status</th><th style={th}></th></tr></thead>
                      <tbody>
                        {usuarios.map(u => (
                          <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                            <td style={td}>
                              <div style={{ fontWeight: 600 }}>{u.name}{u.eh_voce && <span style={{ color: ACG_ACCENT, fontSize: 11, marginLeft: 6 }}>(você)</span>}</div>
                              {u.must_change_password && <div style={{ fontSize: 11, color: '#f59e0b' }}><i className="fas fa-key" style={{ marginRight: 4 }}></i>senha provisória pendente</div>}
                              {u.senha_padrao && <div style={{ fontSize: 11, color: '#ef4444' }}><i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }}></i>senha padrão</div>}
                            </td>
                            <td style={td}><span className="mono" style={{ fontSize: 12.5 }}>{u.login}</span></td>
                            <td style={td}>
                              {u.eh_voce ? badge(u.role_label, ACG_ACCENT) : (
                                <select value={u.role} disabled={ocupado === u.id} onChange={e => alterar(u, { role: e.target.value }, `${u.name} agora é ${ACG_ROTULO_PAPEL[e.target.value]}`)}
                                  style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12.5, fontFamily: 'Inter, sans-serif' }}>
                                  <option value="dono">Dono</option>
                                  <option value="caixa">Caixa</option>
                                </select>
                              )}
                            </td>
                            <td style={td}>
                              <div style={{ fontSize: 12.5 }}>{acgDataHora(u.last_login_at)}</div>
                              {u.last_login_ip && <div className="mono" style={{ fontSize: 11, color: 'var(--bp-text-faint)' }}>{u.last_login_ip}</div>}
                            </td>
                            <td style={td}>
                              {u.active ? badge(u.sessoes_abertas ? `ativo · ${u.sessoes_abertas} sessão(ões)` : 'ativo', '#10b981') : badge('desativado', '#ef4444')}
                            </td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                {u.active && (
                                  <AcgButton type="button" variant="ghost" disabled={ocupado === u.id} onClick={() => novaSenha(u)} title="Gerar senha provisória" style={{ padding: '6px 10px', fontSize: 12 }}>
                                    <i className="fas fa-key"></i>
                                  </AcgButton>
                                )}
                                {!u.eh_voce && (
                                  <AcgButton type="button" variant={u.active ? 'danger' : 'ghost'} disabled={ocupado === u.id}
                                    onClick={() => { if (!u.active || window.confirm(`Desativar o acesso de ${u.name}? As sessões abertas serão encerradas na hora.`)) alterar(u, { active: !u.active }, u.active ? `${u.name} desativado` : `${u.name} reativado`); }}
                                    title={u.active ? 'Desativar acesso' : 'Reativar acesso'} style={{ padding: '6px 10px', fontSize: 12 }}>
                                    <i className={`fas ${u.active ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                                  </AcgButton>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <form onSubmit={criar} style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18 }}>
                <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}><i className="fas fa-user-plus" style={{ color: ACG_ACCENT, marginRight: 8 }}></i>Novo usuário</p>
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>O sistema gera uma senha provisória; a pessoa cria a dela no primeiro login.</p>
                <AcgInput label="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Maria da Silva" required />
                <AcgInput label="Login" value={form.login} onChange={e => setForm({ ...form, login: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} placeholder="ex.: maria" hint="Letras minúsculas, números, ponto, traço ou sublinhado." autoCapitalize="none" required />
                <AcgSelect label="Papel" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="caixa">Caixa — vende, emite NFC-e, gaveta, clientes e fiado</option>
                  <option value="dono">Dono — acesso a tudo, inclusive esta tela</option>
                </AcgSelect>
                <AcgButton type="submit" disabled={criando || form.name.trim().length < 2 || form.login.length < 3} style={{ width: '100%' }}>
                  {criando ? 'Criando...' : 'Criar e gerar senha provisória'}
                </AcgButton>
              </form>
            </div>
          )}

          {aba === 'acessos' && (
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--bp-border)' }}>
                <span style={{ color: 'var(--bp-text-faint)', fontSize: 12 }}>Os 150 eventos mais recentes: logins, tentativas com senha errada, saídas e alterações na equipe.</span>
                <AcgButton type="button" variant="ghost" onClick={loadAcessos} style={{ padding: '6px 10px', fontSize: 12 }}><i className="fas fa-rotate-right" style={{ marginRight: 6 }}></i>Atualizar</AcgButton>
              </div>
              {!acessos ? <AcgSpinner /> : acessos.length === 0 ? (
                <p style={{ color: 'var(--bp-text-faint)', fontSize: 13, textAlign: 'center', padding: 32, margin: 0 }}>Nenhum acesso registrado ainda.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Quando</th><th style={th}>Evento</th><th style={th}>Quem</th><th style={th}>Detalhe</th><th style={th}>Dispositivo</th><th style={th}>IP</th></tr></thead>
                    <tbody>
                      {acessos.map(a => {
                        const [rotulo, cor] = ACG_EVENTOS_ACESSO[a.evento] || [a.evento, 'var(--bp-text-muted)'];
                        return (
                          <tr key={a.id}>
                            <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12.5 }}>{acgDataHora(a.created_at)}</td>
                            <td style={td}>{badge(rotulo, cor)}</td>
                            <td style={td}><div style={{ fontWeight: 600 }}>{a.usuario_nome || '—'}</div><div className="mono" style={{ fontSize: 11, color: 'var(--bp-text-faint)' }}>{a.login}</div></td>
                            <td style={{ ...td, color: 'var(--bp-text-muted)', fontSize: 12.5 }}>{a.detalhe || ''}</td>
                            <td style={{ ...td, color: 'var(--bp-text-muted)', fontSize: 12.5 }}>{a.dispositivo}</td>
                            <td style={{ ...td, fontSize: 12 }}><span className="mono">{a.ip || '—'}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    /* ---- MINHA CONTA (todo mundo): nome, senha e sessões abertas ---- */
    function AcougueMinhaConta({ showToast, user, onUserChange, onLogout }) {
      const [nome, setNome] = useState(user.name || '');
      const [salvandoNome, setSalvandoNome] = useState(false);
      const [atual, setAtual] = useState('');
      const [nova, setNova] = useState('');
      const [confirma, setConfirma] = useState('');
      const [verSenhas, setVerSenhas] = useState(false);
      const [trocando, setTrocando] = useState(false);
      const [sessoes, setSessoes] = useState(null);
      const [me, setMe] = useState(null);

      const loadSessoes = async () => { const res = await apiCall('GET', '/me/sessions'); if (res.ok) setSessoes(res.data); };
      useEffect(() => { loadSessoes(); apiCall('GET', '/me').then(res => { if (res.ok) setMe(res.data); }); }, []);

      const salvarNome = async (e) => {
        e.preventDefault();
        if (nome.trim().length < 2) { showToast('Informe o nome.', 'error'); return; }
        setSalvandoNome(true);
        const res = await apiCall('PATCH', '/me', { name: nome.trim() });
        setSalvandoNome(false);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível salvar', 'error'); return; }
        onUserChange?.({ name: res.data.name });
        showToast('Nome atualizado');
      };

      const senhaOk = REGRAS_SENHA.every(r => r.ok(nova)) && nova === confirma;
      const trocarSenha = async (e) => {
        e.preventDefault();
        if (!atual) { showToast('Informe a senha atual.', 'error'); return; }
        if (!senhaOk) { showToast('Confira os itens da lista.', 'error'); return; }
        setTrocando(true);
        const res = await apiCall('PUT', '/auth/password', { old_password: atual, new_password: nova });
        setTrocando(false);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível trocar a senha', 'error'); return; }
        setAtual(''); setNova(''); setConfirma('');
        showToast('Senha alterada. As outras sessões foram encerradas.');
        loadSessoes();
      };

      const encerrar = async (s) => {
        const res = await apiCall('DELETE', `/me/sessions/${s.id}`);
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível encerrar', 'error'); return; }
        showToast('Sessão encerrada');
        loadSessoes();
      };
      const encerrarOutras = async () => {
        const res = await apiCall('DELETE', '/me/sessions');
        if (!res.ok) { showToast(res.data?.error || 'Não foi possível encerrar', 'error'); return; }
        showToast(res.data.message);
        loadSessoes();
      };

      const cartao = { background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 18 };
      const titulo = (icone, texto) => <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 14px' }}><i className={`fas ${icone}`} style={{ color: ACG_ACCENT, marginRight: 8 }}></i>{texto}</p>;

      return (
        <div>
          <AcgSectionTitle icon="fa-circle-user" title="Minha Conta" subtitle="Seus dados, sua senha e onde a sua conta está aberta" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
            <form onSubmit={salvarNome} style={cartao}>
              {titulo('fa-id-badge', 'Dados do acesso')}
              <div style={{ display: 'grid', gap: 6, marginBottom: 14, fontSize: 13 }}>
                <div><span style={{ color: 'var(--bp-text-faint)' }}>Login: </span><span className="mono" style={{ color: 'var(--bp-text)' }}>{user.email}</span></div>
                <div><span style={{ color: 'var(--bp-text-faint)' }}>Papel: </span><span style={{ color: ACG_ACCENT, fontWeight: 600 }}>{user.role_label || ACG_ROTULO_PAPEL[ACG_PAPEL(user.role)]}</span></div>
                <div><span style={{ color: 'var(--bp-text-faint)' }}>Último acesso: </span><span style={{ color: 'var(--bp-text)' }}>{acgDataHora(me?.last_login_at)}{me?.last_login_ip ? ` · ${me.last_login_ip}` : ''}</span></div>
                <div><span style={{ color: 'var(--bp-text-faint)' }}>Senha alterada em: </span><span style={{ color: 'var(--bp-text)' }}>{acgDataHora(me?.password_changed_at)}</span></div>
              </div>
              <AcgInput label="Nome" value={nome} onChange={e => setNome(e.target.value)} />
              <AcgButton type="submit" disabled={salvandoNome || nome.trim() === (user.name || '')}>{salvandoNome ? 'Salvando...' : 'Salvar nome'}</AcgButton>
            </form>

            <form onSubmit={trocarSenha} style={cartao}>
              {titulo('fa-key', 'Trocar a senha')}
              <AcgInput label="Senha atual" type={verSenhas ? 'text' : 'password'} value={atual} onChange={e => setAtual(e.target.value)} autoComplete="current-password" />
              <AcgInput label="Nova senha" type={verSenhas ? 'text' : 'password'} value={nova} onChange={e => setNova(e.target.value)} autoComplete="new-password" />
              <AcgInput label="Confirme a nova senha" type={verSenhas ? 'text' : 'password'} value={confirma} onChange={e => setConfirma(e.target.value)} autoComplete="new-password" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--bp-text-muted)', fontSize: 12.5, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={verSenhas} onChange={e => setVerSenhas(e.target.checked)} style={{ accentColor: ACG_ACCENT }} />Mostrar as senhas
              </label>
              <ChecklistSenha senha={nova} confirma={confirma} />
              <p style={{ color: 'var(--bp-text-faint)', fontSize: 11.5, margin: '0 0 12px', lineHeight: 1.5 }}>Ao trocar, todas as outras sessões abertas com a sua conta são encerradas. Esta continua.</p>
              <AcgButton type="submit" disabled={trocando || !atual || !senhaOk}>{trocando ? 'Trocando...' : 'Trocar senha'}</AcgButton>
            </form>

            <div style={cartao}>
              {titulo('fa-laptop', 'Sessões abertas')}
              {!sessoes ? <AcgSpinner /> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {sessoes.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bp-card)', border: `1px solid ${s.atual ? ACG_ACCENT + '66' : 'var(--bp-border)'}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600 }}>{s.device}{s.atual && <span style={{ color: ACG_ACCENT, fontSize: 11, marginLeft: 6 }}>esta sessão</span>}</div>
                        <div style={{ color: 'var(--bp-text-faint)', fontSize: 11.5 }}>desde {acgDataHora(s.created_at)} · visto {acgDataHora(s.last_seen_at)}{s.ip ? ` · ${s.ip}` : ''}</div>
                      </div>
                      {s.atual
                        ? <AcgButton type="button" variant="ghost" onClick={onLogout} style={{ padding: '6px 10px', fontSize: 12 }}>Sair</AcgButton>
                        : <AcgButton type="button" variant="danger" onClick={() => encerrar(s)} style={{ padding: '6px 10px', fontSize: 12 }}>Encerrar</AcgButton>}
                    </div>
                  ))}
                  {sessoes.length > 1 && (
                    <AcgButton type="button" variant="ghost" onClick={encerrarOutras} style={{ marginTop: 4 }}><i className="fas fa-power-off" style={{ marginRight: 6 }}></i>Encerrar todas as outras sessões</AcgButton>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    /* ---- SHELL PRINCIPAL ---- */
    function AcougueDashboard({ user, onLogout, onUserChange }) {
      const papel = ACG_PAPEL(user.role);
      const ACG_NAV = useAcougueNav(papel);
      // Caixa abre direto no Caixa: é a única tela pra qual ele veio.
      const [activeView, setActiveView] = useState(papel === 'caixa' ? 'caixa' : 'inicio');
      const [toast, setToast] = useState(null);
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

      // Papel mudou (o dono rebaixou/promoveu com a pessoa logada): a tela que estava aberta
      // pode ter deixado de existir pra ela.
      useEffect(() => { if (!ACG_NAV.some(n => n.id === activeView)) setActiveView(ACG_NAV[0]?.id || 'caixa'); }, [papel]);

      const showToast = (msg, type = 'success') => setToast({ msg, type });
      const viewLabel = ACG_NAV.find(n => n.id === activeView)?.label || '';
      const collapsed = sidebarCollapsed && !mobileSidebarOpen;
      const w = collapsed ? 64 : 230;
      const ownerName = user.name || 'Açougue';
      const rotuloPapel = user.role_label || ACG_ROTULO_PAPEL[papel];

      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bp-bg)', position: 'relative' }}>
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}></div>}

          <div className={`admin-sidebar-desktop${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            <div style={{ width: w, minWidth: w, height: '100vh', background: 'var(--bp-bg)', borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column', transition: 'width .25s', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0 }}>
              <div style={{ padding: collapsed ? '18px 8px' : '18px 16px', borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, minHeight: 64 }}>
                <img src="/img/logo-rei-das-carnes.webp" alt="" width="34" height="34"
                  style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                {!collapsed && <span className="syne" style={{ fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', whiteSpace: 'nowrap' }}>REI DAS <span style={{ color: ACG_ACCENT }}>CARNES</span></span>}
              </div>
              {!mobileSidebarOpen && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bp-border)', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
                  <button onClick={() => setSidebarCollapsed(c => !c)} style={{ background: 'none', border: '1px solid var(--bp-border2)', borderRadius: 6, color: 'var(--bp-text-faint)', cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`} style={{ fontSize: 11 }}></i>
                  </button>
                </div>
              )}
              <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
                {ACG_NAV.map(item => {
                  const active = activeView === item.id;
                  return (
                    <button key={item.id} onClick={() => { setActiveView(item.id); setMobileSidebarOpen(false); }} title={collapsed ? item.label : ''} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginBottom: 2, background: active ? ACG_ACCENT_BG : 'none', border: 'none', cursor: 'pointer', color: active ? ACG_ACCENT : 'var(--bp-text-muted)', textAlign: 'left', borderLeft: active ? `3px solid ${ACG_ACCENT}` : '3px solid transparent' }}>
                      <i className={item.icon} style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                      {!collapsed && <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
              <div style={{ padding: '12px 8px', borderTop: '1px solid var(--bp-border)' }}>
                {!collapsed && (
                  <button type="button" onClick={() => { setActiveView('conta'); setMobileSidebarOpen(false); }} title="Minha Conta"
                    style={{ width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bp-card)', border: `1px solid ${activeView === 'conta' ? ACG_ACCENT + '66' : 'transparent'}`, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ownerName}</p>
                    <p style={{ color: ACG_ACCENT, fontSize: 11, margin: 0 }}>{rotuloPapel}</p>
                  </button>
                )}
                <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                  <i className="fas fa-sign-out-alt" style={{ fontSize: 15, flexShrink: 0, width: 18, textAlign: 'center' }}></i>
                  {!collapsed && <span>Sair</span>}
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '0 16px', height: 60, borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bp-bg)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setMobileSidebarOpen(true)} className="sidebar-hamburger" style={{ background: 'none', border: 'none', color: ACG_ACCENT, cursor: 'pointer', fontSize: 18, padding: '4px 8px', display: 'none' }}>
                  <i className="fas fa-bars"></i>
                </button>
                <span className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 15 }}>{viewLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HeaderThemeToggle user={user} />
                <button onClick={onLogout} style={{ background: 'none', border: '1px solid var(--bp-border)', borderRadius: 8, color: 'var(--bp-text-muted)', padding: '6px 10px', cursor: 'pointer', fontSize: 14 }}><i className="fas fa-sign-out-alt"></i></button>
              </div>
            </div>

            <main style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
              {activeView === 'inicio' ? <AcougueInicio showToast={showToast} onNavigate={setActiveView} />
                : activeView === 'entrada' ? <AcougueEntrada showToast={showToast} />
                : activeView === 'notas-entrada' ? <AcougueNotasEntrada showToast={showToast} />
                : activeView === 'camara' ? <AcougueCamara showToast={showToast} />
                : activeView === 'rendimento' ? <AcougueRendimento showToast={showToast} />
                : activeView === 'precificacao' ? <AcouguePrecificacao showToast={showToast} />
                : activeView === 'saida' ? <AcougueSaida showToast={showToast} />
                : activeView === 'produtos' ? <AcougueProdutos showToast={showToast} />
                : activeView === 'producao' ? <AcougueProducao showToast={showToast} />
                : activeView === 'conferencia' ? <AcougueConferencia showToast={showToast} />
                : activeView === 'caixa' ? <AcougueCaixa showToast={showToast} />
                : activeView === 'clientes' ? <AcougueClientes showToast={showToast} />
                : activeView === 'notas' ? <AcougueNotas showToast={showToast} />
                : activeView === 'relatorios' ? <AcougueRelatorios showToast={showToast} />
                : activeView === 'impostos' ? <AcougueImpostos showToast={showToast} />
                : activeView === 'config' ? <AcougueConfig showToast={showToast} />
                : activeView === 'equipe' ? <AcougueEquipe showToast={showToast} user={user} />
                : activeView === 'conta' ? <AcougueMinhaConta showToast={showToast} user={user} onUserChange={onUserChange} onLogout={onLogout} />
                : null}
            </main>
          </div>

          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
      );
    }
