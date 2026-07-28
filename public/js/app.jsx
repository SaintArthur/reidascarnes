    /* ======================================================
       APP ROOT
    ====================================================== */
    function App() {
      const [user, setUser] = useState(getStoredUser);
      useEffect(() => { applyTheme(user?.theme); }, [user?.theme]);
      const handleLogout = () => { clearSession(); localStorage.removeItem('theme'); setUser(null); applyTheme('dark'); };
      return (
        <LanguageProvider user={user}>
          {!user ? <LoginPage onLogin={setUser} />
            : user.must_change_password ? <ForcePasswordChange user={user} onChanged={setUser} onLogout={handleLogout} />
            : user.role === 'admin' ? <AdminDashboard user={user} onLogout={handleLogout} />
            : user.role === 'barber' ? <BarberDashboard user={user} onLogout={handleLogout} />
            : user.role === 'acougue' ? <AcougueDashboard user={user} onLogout={handleLogout} />
            : <ClientDashboard user={user} onLogout={handleLogout} />}
        </LanguageProvider>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(
      <ErrorBoundary><App /></ErrorBoundary>
    );
