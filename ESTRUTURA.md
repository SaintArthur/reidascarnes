📁 ESTRUTURA DO PROJETO - BarberPro
═════════════════════════════════════════════════════════════════

barberpro/
│
├── 📄 server.js ........................ Backend Node.js com Express
├── 📄 package.json ..................... Dependências do projeto
├── 📄 .env ............................. Variáveis de ambiente
├── 📄 README.md ........................ Documentação completa
├── 📄 GUIA_RAPIDO.md ................... Guia de instalação rápida
│
├── 📁 public/ .......................... Arquivos servidos (front-end)
│   └── 📄 index.html ................... Interface React (cliente + admin)
│
├── 📁 node_modules/ .................... Dependências instaladas (auto)
│   └── (muitos arquivos...)
│
└── 📄 .gitignore ....................... Arquivos ignorados no Git


═════════════════════════════════════════════════════════════════
PASSOS PARA MONTAR A ESTRUTURA
═════════════════════════════════════════════════════════════════

1. CRIAR PASTA RAIZ
   mkdir barberpro
   cd barberpro

2. CRIAR PASTA PUBLIC
   mkdir public

3. COPIAR ARQUIVOS
   • server.js → raiz (barberpro/)
   • package.json → raiz (barberpro/)
   • .env → raiz (barberpro/)
   • index.html → public/

4. RESULTADO
   barberpro/
   ├── server.js
   ├── package.json
   ├── .env
   ├── public/
   │   └── index.html
   └── node_modules/ (criado após npm install)

5. INSTALAR DEPENDÊNCIAS
   npm install

6. INICIAR
   npm start


═════════════════════════════════════════════════════════════════
EXPLICAÇÃO DE CADA ARQUIVO
═════════════════════════════════════════════════════════════════

📄 server.js
─────────────────────────────────────────────────────────────────
✓ BACKEND COMPLETO
✓ Express.js para rotas HTTP
✓ SQLite3 para banco de dados
✓ JWT para autenticação
✓ bcryptjs para segurança
✓ CORS configurado
✓ 30+ endpoints funcionais

Responsabilidades:
• Criar e gerenciar banco de dados
• Autenticar usuários (login/register)
• Gerenciar agendamentos
• Servir arquivos estáticos (index.html)
• Validar permissões por role (admin/barber/client)
• Gerar tokens JWT
• Retornar dados em JSON

Rotas principais:
  POST   /api/auth/login
  POST   /api/auth/register
  GET    /api/services
  POST   /api/appointments
  GET    /api/appointments
  PATCH  /api/appointments/:id/status
  GET    /api/dashboard/stats
  GET    /api/clients
  GET    /api/barbers


📄 index.html
─────────────────────────────────────────────────────────────────
✓ FRONTEND COMPLETO
✓ React 18 inline (sem build)
✓ Tailwind CSS para styling
✓ Duas interfaces em um arquivo:
  - LoginPage (autenticação)
  - ClientDashboard (para clientes)
  - AdminDashboard (para proprietário)

Componentes:
• LoginPage: login e registro
• ClientDashboard: agendamentos do cliente
• AdminDashboard: gerenciamento completo
• BookingModal: modal de novo agendamento
• AppointmentsList: lista de agendamentos
• Toast: notificações
• Várias tabelas e estatísticas


📄 package.json
─────────────────────────────────────────────────────────────────
Define dependências do projeto:

dependencies:
  "express": "4.18.2" ........... Framework web
  "sqlite3": "5.1.6" ............ Banco de dados
  "bcryptjs": "2.4.3" ........... Hash de senhas
  "jsonwebtoken": "9.1.2" ....... Autenticação JWT
  "cors": "2.8.5" ............... Requisições cross-origin
  "dotenv": "16.3.1" ............ Variáveis de ambiente

devDependencies:
  "nodemon": "3.0.1" ............ Auto-reload em desenvolvimento


📄 .env
─────────────────────────────────────────────────────────────────
Variáveis de ambiente (não publicar!)

PORT=5000 ....................... Porta do servidor
JWT_SECRET=... .................. Chave para assinar tokens
NODE_ENV=development ............ Ambiente


📄 .gitignore (criar se usar Git)
─────────────────────────────────────────────────────────────────
node_modules/
.env
.DS_Store
*.log
dist/
build/


═════════════════════════════════════════════════════════════════
FLUXO DE REQUISIÇÕES
═════════════════════════════════════════════════════════════════

CLIENTE FAZENDO LOGIN:
┌─────────────────┐
│   index.html    │ 
│  (React App)    │
└────────┬────────┘
         │ POST /api/auth/login
         │ { email, password }
         ↓
┌─────────────────┐
│  server.js      │
│  (Express)      │
│                 │ → Procura no SQLite
│                 │ → Valida senha
│                 │ → Gera JWT token
└────────┬────────┘
         │ { token, user }
         ↓
┌─────────────────┐
│  localStorage   │
│  (token)        │
└─────────────────┘


CLIENTE FAZENDO AGENDAMENTO:
┌─────────────────┐
│  BookingModal   │
│  (React)        │
└────────┬────────┘
         │ POST /api/appointments
         │ { service_id, barber_id, date, time }
         │ Header: Authorization: Bearer TOKEN
         ↓
┌─────────────────┐
│  server.js      │
│  Verifica token │
│  Valida dados   │
│  Cria no SQLite │
└────────┬────────┘
         │ { id, status: 'pending' }
         ↓
┌─────────────────┐
│  AppointmentsList
│  (React)        │
│  Recarrega lista│
└─────────────────┘


═════════════════════════════════════════════════════════════════
BANCO DE DADOS (SQLite) - TABELAS
═════════════════════════════════════════════════════════════════

users
├── id (INTEGER PRIMARY KEY)
├── name (TEXT)
├── email (TEXT UNIQUE)
├── phone (TEXT)
├── password (TEXT - hashed)
├── role (client | barber | admin)
├── cpf (TEXT UNIQUE)
├── address (TEXT)
└── created_at (DATETIME)


services
├── id (INTEGER PRIMARY KEY)
├── name (TEXT)
├── description (TEXT)
├── price (REAL)
├── duration (INTEGER - minutos)
├── active (BOOLEAN)
└── created_at (DATETIME)


appointments
├── id (INTEGER PRIMARY KEY)
├── client_id (FK → users)
├── barber_id (FK → users)
├── service_id (FK → services)
├── appointment_date (DATE)
├── appointment_time (TIME)
├── status (pending | confirmed | completed | cancelled)
├── notes (TEXT)
└── created_at (DATETIME)


working_hours
├── id (INTEGER PRIMARY KEY)
├── barber_id (FK → users)
├── day_of_week (0-6)
├── start_time (TIME)
├── end_time (TIME)
├── break_start (TIME)
└── break_end (TIME)


reviews
├── id (INTEGER PRIMARY KEY)
├── appointment_id (FK → appointments)
├── client_id (FK → users)
├── rating (REAL 1-5)
├── comment (TEXT)
└── created_at (DATETIME)


settings
├── id (INTEGER PRIMARY KEY)
├── key (TEXT UNIQUE)
└── value (TEXT)


═════════════════════════════════════════════════════════════════
INICIANDO PELA PRIMEIRA VEZ
═════════════════════════════════════════════════════════════════

$ npm install
✓ Instala dependências

$ npm start
✓ Inicia servidor
✓ Cria banco de dados automático
✓ Insere dados iniciais
✓ Pronto para aceitar conexões

Saída esperada:
───────────────────────────────────────────────
✅ Banco de dados SQLite iniciado
🚀 Servidor BarberPro rodando em http://localhost:5000
📱 Credenciais de teste:
   Admin: admin@barbearia.com / Admin@2025
   Barbeiro: joao@barbearia.com / Barber@2025
   Cliente: crie uma conta em /register
───────────────────────────────────────────────


═════════════════════════════════════════════════════════════════
ACESSANDO O SISTEMA
═════════════════════════════════════════════════════════════════

Navegador: http://localhost:5000
├── LoginPage carrega
│
├─ Admin login
│  ├── Email: admin@barbearia.com
│  ├── Senha: Admin@2025
│  └── Acesso: AdminDashboard completo
│
├─ Barbeiro login
│  ├── Email: joao@barbearia.com
│  ├── Senha: Barber@2025
│  └── Acesso: ClientDashboard (seus agendamentos)
│
└─ Novo cliente
   ├── Clica "Registre-se"
   ├── Preenche formulário
   ├── Login automático
   └── Acesso: ClientDashboard


═════════════════════════════════════════════════════════════════
RESUMO TÉCNICO
═════════════════════════════════════════════════════════════════

Frontend:
  • React 18 (sem build process)
  • Tailwind CSS
  • Fetch API para requisições
  • localStorage para tokens
  • 5 componentes principais

Backend:
  • Node.js + Express
  • SQLite3 (banco em memória durante teste)
  • JWT autenticação
  • bcryptjs para segurança
  • 30+ endpoints RESTful
  • CORS habilitado

Autenticação:
  • JWT em header Authorization
  • 7 dias de expiração
  • Validação por role
  • Hash de senhas com bcryptjs

Banco de Dados:
  • 6 tabelas principais
  • Relacionamentos com FK
  • Índices nas chaves
  • Dados iniciais inseridos


═════════════════════════════════════════════════════════════════
PRONTO PARA USAR! ✅
═════════════════════════════════════════════════════════════════

O BarberPro está 100% funcional e pronto para:
✓ Clientes agendarem online
✓ Admin gerenciar tudo
✓ Relatórios em tempo real
✓ Múltiplos barbeiros
✓ Múltiplos serviços
✓ Autenticação segura
✓ Banco de dados persistente
✓ Interface responsiva

Deploy em produção:
- Usar banco de dados real (MySQL/PostgreSQL)
- Adicionar HTTPS
- Configurar backup
- Usar domínio próprio
- Integrar pagamento
- Enviar emails

Obrigado por usar BarberPro! 🔪✨
