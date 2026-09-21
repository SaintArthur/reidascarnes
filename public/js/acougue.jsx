    /* ======================================================
       AÇOUGUE DASHBOARD — controle financeiro/fiscal
       Módulo isolado do fluxo de barbearia: usa /api/acougue/*, role 'acougue'.
    ====================================================== */
    // Mesma paleta dourada usada no resto do sistema (sidebar/botões de admin.jsx e barber.jsx) —
    // troca o vermelho original por consistência visual com o restante do BarberPro.
    const ACG_ACCENT = '#d4a574';
    const ACG_ACCENT_DARK = '#8b7355';
    const ACG_ACCENT_BG = 'rgba(212,165,116,0.12)';

    const acgToday = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const acgMonthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    function useAcougueNav() {
      return [
        { id: 'inicio', icon: 'fas fa-chart-pie', label: 'Início' },
        { id: 'entrada', icon: 'fas fa-truck-loading', label: 'Entrada de Carcaça' },
        { id: 'notas-entrada', icon: 'fas fa-file-import', label: 'Entrada de Notas' },
        { id: 'camara', icon: 'fas fa-snowflake', label: 'Câmara Fria' },
        { id: 'rendimento', icon: 'fas fa-calculator', label: 'Rendimento de Carcaça' },
        { id: 'saida', icon: 'fas fa-drumstick-bite', label: 'Saída de Cortes' },
        { id: 'produtos', icon: 'fas fa-tags', label: 'Produtos' },
        { id: 'conferencia', icon: 'fas fa-clipboard-check', label: 'Conferir Etiquetas' },
        { id: 'caixa', icon: 'fas fa-cash-register', label: 'Caixa' },
        { id: 'notas', icon: 'fas fa-file-invoice', label: 'Emissão de Nota' },
        { id: 'impostos', icon: 'fas fa-percent', label: 'PIS / COFINS' },
        { id: 'config', icon: 'fas fa-gear', label: 'Configurações' },
      ];
    }

    function AcgSpinner() {
      return <div style={{ textAlign: 'center', padding: '64px 0' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: ACG_ACCENT }}></i></div>;
    }

    function AcgCard({ label, value, icon, color, bg }) {
      return (
        <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <i className={`fas ${icon}`} style={{ color, fontSize: 16 }}></i>
          </div>
          <p style={{ color: 'var(--bp-text-faint)', fontSize: 11, margin: '0 0 2px' }}>{label}</p>
          <p style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 800, margin: 0, fontFamily: 'Inter, sans-serif' }}>{value}</p>
        </div>
      );
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
    function AcougueInicio({ showToast, onNavigate }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);

      const load = async () => {
        setLoading(true);
        const res = await apiCall('GET', '/acougue/dashboard');
        if (res.ok) setData(res.data); else showToast(res.data?.error || 'Erro ao carregar o painel', 'error');
        setLoading(false);
      };
      useEffect(() => { load(); }, []);

      if (loading || !data) return <AcgSpinner />;

      return (
        <div>
          <AcgSectionTitle icon="fa-chart-pie" title="Controle Financeiro do Açougue" subtitle="Visão geral do mês corrente" />

          <AcougueContingencia showToast={showToast} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            <AcgCard label="Entradas do mês" value={fmtCur(data.entradas_mes)} icon="fa-truck-loading" color="#3b82f6" bg="rgba(59,130,246,0.12)" />
            <AcgCard label="Saídas do mês" value={fmtCur(data.saidas_mes)} icon="fa-drumstick-bite" color="#f59e0b" bg="rgba(245,158,11,0.12)" />
            <AcgCard label="Caixa hoje" value={fmtCur(data.caixa_hoje)} icon="fa-cash-register" color="#10b981" bg="rgba(16,185,129,0.12)" />
            <AcgCard label="Vendas hoje" value={data.vendas_hoje} icon="fa-receipt" color={ACG_ACCENT} bg={ACG_ACCENT_BG} />
            <AcgCard label="PIS/COFINS a recolher" value={fmtCur(data.pis_cofins_a_recolher)} icon="fa-percent" color="#a855f7" bg="rgba(168,85,247,0.12)" />
            <AcgCard label="Notas pendentes" value={data.notas_pendentes} icon="fa-file-invoice" color="#ef4444" bg="rgba(239,68,68,0.12)" />
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

    /* ---- ATALHOS DE TECLADO DO CAIXA ---- */
    // Rótulos e ordem de exibição na barra de funções. A ordem aqui é a ordem na tela.
    const ACG_ACOES_CAIXA = [
      { id: 'foco_codigo',    label: 'Buscar produto' },
      { id: 'cpf_nota',       label: 'CPF na nota' },
      { id: 'finalizar',      label: 'Finalizar venda' },
      { id: 'reimprimir',     label: 'Reimprimir último' },
      { id: 'suspender',      label: 'Suspender/Retomar' },
      { id: 'remover_item',   label: 'Remover último item' },
      { id: 'cancelar_venda', label: 'Cancelar venda' },
    ];

    const ACG_HOTKEYS_PADRAO = {
      foco_codigo: 'F2', cpf_nota: 'F4', finalizar: 'F5', reimprimir: 'F6',
      cancelar_venda: 'F9', remover_item: 'F10', suspender: 'F12',
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
    function printCupom({ sale, items, paymentMethod, invoice, settings }) {
      if (invoice?.danfe_url) {
        const danfe = window.open(invoice.danfe_url, '_blank');
        if (danfe) { danfe.addEventListener('load', () => danfe.print()); return; }
        // Popup bloqueado: cai no layout local para o operador não ficar sem comprovante.
      }

      const s = settings || {};
      const esc = (v) => String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const money = (v) => Number(v || 0).toFixed(2).replace('.', ',');
      const pagamentoLabel = { dinheiro: 'Dinheiro', cartao_debito: 'Cartão de débito', cartao_credito: 'Cartão de crédito', pix: 'PIX' }[paymentMethod] || paymentMethod;

      const linhas = items.map((i, n) => `
        <tr><td colspan="4" class="desc">${String(n + 1).padStart(3, '0')} ${esc(i.name)}</td></tr>
        <tr>
          <td class="q">${Number(i.quantity).toFixed(3).replace('.', ',')}</td>
          <td class="u">${esc((i.unit || '').toUpperCase())}</td>
          <td class="p">x ${money(i.unit_price)}</td>
          <td class="t">${money(i.subtotal)}</td>
        </tr>`).join('');

      const cabecalhoFiscal = invoice ? `
        <div class="c b">DOCUMENTO AUXILIAR DA NOTA FISCAL<br/>DE CONSUMIDOR ELETRÔNICA</div>
        <div class="c">NFC-e nº ${esc(invoice.numero)} — Série ${esc(invoice.serie)}</div>
        <div class="hr"></div>
        <div class="small">Chave de acesso:<br/>${esc(invoice.chave_acesso || '').replace(/(.{4})/g, '$1 ')}</div>
        <div class="small">Consulte em: www.sefaz.es.gov.br/nfce/consulta</div>
        <div class="c small">CONSUMIDOR NÃO IDENTIFICADO</div>
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

      // iframe escondido em vez de window.open: não depende de permissão de pop-up, que é a
      // causa mais comum de "cliquei em finalizar e não imprimiu".
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

    /* ---- CAIXA ---- */
    function AcougueCaixa({ showToast }) {
      const [barcode, setBarcode] = useState('');
      const [cart, setCart] = useState([]);
      const [paymentMethod, setPaymentMethod] = useState('dinheiro');
      const [finalizing, setFinalizing] = useState(false);
      const [todaySales, setTodaySales] = useState([]);
      const [loadingSales, setLoadingSales] = useState(true);
      const [manualProducts, setManualProducts] = useState([]);
      // Razão social, CNPJ, IE e endereço vão no cabeçalho do cupom impresso.
      const [fiscalSettings, setFiscalSettings] = useState(null);
      const [hotkeys, setHotkeys] = useState(ACG_HOTKEYS_PADRAO);
      // CPF informado para a próxima nota; some depois de finalizar, porque é do cliente
      // atual e ir junto na venda do próximo seria erro fiscal.
      const [cpfNota, setCpfNota] = useState('');
      const [filtroProduto, setFiltroProduto] = useState('');
      // Último item lançado, exibido em destaque no painel lateral.
      const [ultimoItem, setUltimoItem] = useState(null);
      const inputRef = useRef(null);

      // Busca por nome ou PLU — o operador que sabe o código digita o número, quem não sabe
      // digita o começo do nome.
      const produtosFiltrados = React.useMemo(() => {
        const termo = filtroProduto.trim().toLowerCase();
        if (!termo) return manualProducts;
        return manualProducts.filter(p =>
          p.name.toLowerCase().includes(termo) || String(p.scale_code || '').startsWith(termo));
      }, [manualProducts, filtroProduto]);

      const loadToday = async () => {
        setLoadingSales(true);
        const res = await apiCall('GET', `/acougue/sales?date=${acgToday()}`);
        if (res.ok) setTodaySales(res.data);
        setLoadingSales(false);
      };
      useEffect(() => {
        loadToday();
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

        const cupom = { sale, items: snapshot, paymentMethod, invoice: autorizada ? nfce.data : null, settings: fiscalSettings };
        ultimaVenda.current = cupom;
        printCupom(cupom);
        setCart([]);
        setCpfNota('');
        setUltimoItem(null);
        loadToday();
        inputRef.current?.focus();
      };

      // Guarda a última venda para o F6 poder reimprimir sem consultar o servidor de novo —
      // reimpressão é pedida quando o papel picotou ou o cliente quer segunda via, e nesses
      // dois casos o operador está com a fila esperando.
      const ultimaVenda = useRef(null);
      const vendaSuspensa = useRef(null);

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

        reimprimir: () => {
          if (!ultimaVenda.current) { showToast('Nenhuma venda para reimprimir', 'info'); return; }
          printCupom(ultimaVenda.current);
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

      const cancelSale = async (id) => {
        if (!confirm('Cancelar esta venda? O estoque será devolvido.')) return;
        const res = await apiCall('POST', `/acougue/sales/${id}/cancel`);
        if (res.ok) { showToast('Venda cancelada', 'info'); loadToday(); }
        else showToast(res.data?.error || 'Erro ao cancelar', 'error');
      };

      return (
        <div>
          <AcgSectionTitle icon="fa-cash-register" title="Caixa" subtitle="Leitor de código de barras: escaneie e o item entra automaticamente" />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ display: 'block', color: 'var(--bp-text-faint)', fontSize: 12, marginBottom: 6 }}>Código de barras</span>
                <input
                  ref={inputRef}
                  autoFocus
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Aponte o leitor aqui e bipe a etiqueta..."
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: `2px solid ${ACG_ACCENT}55`, background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 16, fontFamily: 'DM Mono, monospace', boxSizing: 'border-box' }}
                />
              </label>

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--bp-text-faint)' }}>
                  <i className="fas fa-barcode" style={{ fontSize: 32, marginBottom: 10, display: 'block' }}></i>
                  Carrinho vazio — escaneie um produto para começar
                </div>
              ) : (
                <AcgTable
                  columns={[
                    { key: 'name', label: 'Produto', render: r => r.product.name },
                    { key: 'unit', label: 'Un', render: r => r.product.unit },
                    { key: 'qty', label: 'Qtd', align: 'right', render: r => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => nudgeQty(r.product.id, r.product.unit === 'kg' ? -0.1 : -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>−</button>
                        <input type="number" step="0.001" min="0" value={r.quantity} onChange={e => updateQty(r.product.id, Number(e.target.value))} style={{ width: 70, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', textAlign: 'right' }} />
                        <button onClick={() => nudgeQty(r.product.id, r.product.unit === 'kg' ? 0.1 : 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text-secondary)', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>+</button>
                      </div>
                    ) },
                    { key: 'price', label: 'Preço', align: 'right', render: r => fmtCur(r.product.price) },
                    { key: 'subtotal', label: 'Subtotal', align: 'right', render: r => fmtCur(r.product.price * r.quantity) },
                    { key: 'actions', label: '', align: 'right', render: r => <button onClick={() => removeItem(r.product.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><i className="fas fa-times"></i></button> },
                  ]}
                  rows={cart}
                />
              )}

              {manualProducts.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                    <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, margin: 0 }}>Ou toque no produto (sem precisar escanear)</p>
                    <input
                      value={filtroProduto}
                      onChange={e => setFiltroProduto(e.target.value)}
                      placeholder="filtrar por nome ou PLU..."
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 12, minWidth: 190 }}
                    />
                  </div>
                  {/* Altura limitada com rolagem própria: o catálogo tem quase 200 itens e, solto,
                      empurrava a barra de atalhos e o resto da tela para fora da vista. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                    {produtosFiltrados.map(p => (
                      <button key={p.id} onClick={() => addProductToCart(p)} style={{ padding: '14px 10px', borderRadius: 10, border: '1px solid var(--bp-border2)', background: 'var(--bp-card)', color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                        <span>{p.name}</span>
                        <span style={{ color: ACG_ACCENT, fontWeight: 700 }}>{fmtCur(p.price)}</span>
                      </button>
                    ))}
                    {produtosFiltrados.length === 0 && (
                      <p style={{ color: 'var(--bp-text-faint)', fontSize: 12, gridColumn: '1 / -1', margin: 0 }}>Nenhum produto para "{filtroProduto}"</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column' }}>
              <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 16px' }}>Pagamento</p>
              <AcgSelect label="Forma de pagamento" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartão de débito</option>
                <option value="cartao_credito">Cartão de crédito</option>
                <option value="pix">PIX</option>
              </AcgSelect>
              {/* Espelha o painel do PDV antigo: o item recém-bipado em letra grande, para o
                  operador conferir de relance se pegou o corte e o peso certos sem precisar ler
                  a tabela do carrinho. É o que evita o cliente reclamar depois do cupom. */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 120 }}>
                {ultimoItem ? (
                  <div style={{ background: 'var(--bp-card)', border: `1px solid ${ACG_ACCENT}44`, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ color: 'var(--bp-text-faint)', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>ÚLTIMO ITEM</div>
                    <div className="syne" style={{ color: 'var(--bp-text)', fontSize: 20, fontWeight: 800, lineHeight: 1.15, marginBottom: 6 }}>
                      {ultimoItem.product.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: 'var(--bp-text-secondary)', fontSize: 13 }}>
                      <strong style={{ color: ACG_ACCENT, fontSize: 18, fontFamily: 'DM Mono, monospace' }}>
                        {Number(ultimoItem.quantity).toFixed(3).replace('.', ',')}
                      </strong>
                      <span>{ultimoItem.product.unit}</span>
                      <span>×</span>
                      <span>{fmtCur(ultimoItem.product.price)}</span>
                    </div>
                    <div style={{ color: 'var(--bp-text)', fontSize: 24, fontWeight: 800, marginTop: 6, fontFamily: 'DM Mono, monospace' }}>
                      {fmtCur(ultimoItem.quantity * ultimoItem.product.price)}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--bp-text-faint)', fontSize: 12 }}>
                    <i className="fas fa-barcode" style={{ fontSize: 22, display: 'block', marginBottom: 8, opacity: 0.5 }}></i>
                    Bipe um produto para começar
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--bp-border)', paddingTop: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--bp-text-faint)' }}>{cart.length} item(ns)</span>
                  <span style={{ fontSize: 12, color: 'var(--bp-text-faint)' }}>
                    {cart.reduce((s, c) => s + (c.product.unit === 'kg' ? c.quantity : 0), 0).toFixed(3).replace('.', ',')} kg
                  </span>
                </div>
                <p style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: 'var(--bp-text)', margin: '0 0 16px' }}>
                  <span style={{ fontSize: 13, color: 'var(--bp-text-faint)', fontWeight: 600 }}>TOTAL</span>
                  <span className="syne" style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{fmtCur(total)}</span>
                </p>
                <AcgButton onClick={finalize} disabled={cart.length === 0 || finalizing} style={{ width: '100%', padding: '14px 0', fontSize: 15 }}>
                  {finalizing ? 'Processando...' : <><i className="fas fa-check" style={{ marginRight: 8 }}></i>Finalizar venda</>}
                </AcgButton>
              </div>
            </div>
          </div>

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

          <div style={{ background: 'var(--bp-panel)', border: '1px solid var(--bp-border)', borderRadius: 14, padding: 20 }}>
            <p className="syne" style={{ color: 'var(--bp-text)', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>Vendas de hoje</p>
            {loadingSales ? <AcgSpinner /> : (
              <AcgTable
                emptyLabel="Nenhuma venda hoje ainda"
                columns={[
                  { key: 'sale_number', label: 'Nº' },
                  { key: 'created_at', label: 'Hora', render: r => new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) },
                  { key: 'payment_method', label: 'Pagamento' },
                  { key: 'total_value', label: 'Total', align: 'right', render: r => fmtCur(r.total_value) },
                  { key: 'status', label: 'Status', render: r => <span style={{ color: r.status === 'cancelada' ? '#ef4444' : '#10b981', fontSize: 12, fontWeight: 600 }}>{r.status === 'cancelada' ? 'Cancelada' : 'Concluída'}</span> },
                  { key: 'actions', label: '', align: 'right', render: r => r.status !== 'cancelada' && <button onClick={() => cancelSale(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Cancelar</button> },
                ]}
                rows={todaySales}
              />
            )}
          </div>
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
        if (res.ok) {
          showToast(res.data.warning || `Nota registrada (${res.data.status})`, res.data.warning ? 'info' : 'success');
          setForm(emptyForm); setShowForm(false); load();
        } else {
          showToast(res.data?.error || 'Erro ao emitir nota', 'error');
        }
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
                  { key: 'actions', label: '', align: 'right', render: r => (r.status === 'autorizada' || r.status === 'rascunho') && <button onClick={() => cancelNota(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Cancelar</button> },
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

    /* ---- SHELL PRINCIPAL ---- */
    function AcougueDashboard({ user, onLogout }) {
      const ACG_NAV = useAcougueNav();
      const [activeView, setActiveView] = useState('inicio');
      const [toast, setToast] = useState(null);
      const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
      const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

      const showToast = (msg, type = 'success') => setToast({ msg, type });
      const viewLabel = ACG_NAV.find(n => n.id === activeView)?.label || '';
      const collapsed = sidebarCollapsed && !mobileSidebarOpen;
      const w = collapsed ? 64 : 230;
      const ownerName = user.name || 'Açougue';

      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bp-bg)', position: 'relative' }}>
          {mobileSidebarOpen && <div onClick={() => setMobileSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}></div>}

          <div className={`admin-sidebar-desktop${mobileSidebarOpen ? ' mobile-open' : ''}`}>
            <div style={{ width: w, minWidth: w, height: '100vh', background: 'var(--bp-bg)', borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column', transition: 'width .25s', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0 }}>
              <div style={{ padding: collapsed ? '18px 8px' : '18px 16px', borderBottom: '1px solid var(--bp-border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, minHeight: 64 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${ACG_ACCENT}, ${ACG_ACCENT_DARK})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fas fa-drumstick-bite" style={{ color: '#000', fontSize: 14 }}></i>
                </div>
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
                  <div style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: 'var(--bp-card)' }}>
                    <p style={{ color: 'var(--bp-text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{ownerName}</p>
                    <p style={{ color: ACG_ACCENT, fontSize: 11, margin: 0 }}>Açougue</p>
                  </div>
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
                : activeView === 'saida' ? <AcougueSaida showToast={showToast} />
                : activeView === 'produtos' ? <AcougueProdutos showToast={showToast} />
                : activeView === 'conferencia' ? <AcougueConferencia showToast={showToast} />
                : activeView === 'caixa' ? <AcougueCaixa showToast={showToast} />
                : activeView === 'notas' ? <AcougueNotas showToast={showToast} />
                : activeView === 'impostos' ? <AcougueImpostos showToast={showToast} />
                : activeView === 'config' ? <AcougueConfig showToast={showToast} />
                : null}
            </main>
          </div>

          {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
      );
    }
