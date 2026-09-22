    /* ======================================================
       RAIZ DO APP — Rei das Carnes
       ======================================================
       Login → (senha provisória? troca obrigatória) → painel. O papel (dono/caixa) decide o que
       o painel mostra; o servidor decide o que ele aceita.
    ====================================================== */
    function App() {
      const [user, setUser] = useState(getStoredUser);
      useEffect(() => { applyTheme(user?.theme); }, [user?.theme]);

      // Reconfere a sessão guardada assim que o app abre: nome, papel e a obrigação de trocar a
      // senha vêm do servidor, não do que ficou no localStorage. Sessão revogada responde 401 e
      // o apiCall já limpa e recarrega; usuário desativado idem (403).
      useEffect(() => {
        if (!user) return;
        apiCall('GET', '/me').then(res => {
          if (!res.ok) return;
          const patch = { name: res.data.name, role: res.data.role, role_label: res.data.role_label, theme: res.data.theme, must_change_password: !!res.data.must_change_password };
          updateStoredUser(patch);
          setUser(u => (u ? { ...u, ...patch } : u));
        });
      }, [user?.id]);

      const sair = async () => {
        // Revoga no servidor ANTES de limpar o navegador. Só limpar deixava o token valendo até
        // vencer — 12 h ou 7 dias — em qualquer lugar onde tivesse sido copiado.
        try { await apiCall('POST', '/auth/logout'); } catch {}
        clearSession();
        localStorage.removeItem('theme');
        setUser(null);
        applyTheme('dark');
      };

      if (!user) return <LoginPage onLogin={setUser} />;
      if (user.must_change_password) return <ForcePasswordChange user={user} onChanged={setUser} onLogout={sair} />;
      return <AcougueDashboard user={user} onLogout={sair} onUserChange={(patch) => { updateStoredUser(patch); setUser(u => ({ ...u, ...patch })); }} />;
    }

    ReactDOM.createRoot(document.getElementById('root')).render(
      <ErrorBoundary><App /></ErrorBoundary>
    );
