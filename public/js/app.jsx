    /* ======================================================
       RAIZ DO APP — Rei das Carnes
       ======================================================
       Só existe o perfil do açougue. Os painéis de admin, barbeiro e cliente saíram junto
       com o resto do sistema de barbearia de onde este projeto nasceu.
    ====================================================== */
    function App() {
      const [user, setUser] = useState(getStoredUser);
      useEffect(() => { applyTheme(user?.theme); }, [user?.theme]);
      const sair = () => { clearSession(); localStorage.removeItem('theme'); setUser(null); applyTheme('dark'); };

      if (!user) return <LoginPage onLogin={setUser} />;
      if (user.must_change_password) return <ForcePasswordChange user={user} onChanged={setUser} onLogout={sair} />;
      return <AcougueDashboard user={user} onLogout={sair} />;
    }

    ReactDOM.createRoot(document.getElementById('root')).render(
      <ErrorBoundary><App /></ErrorBoundary>
    );
