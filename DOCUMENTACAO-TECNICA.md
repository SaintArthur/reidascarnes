# 📖 DOCUMENTAÇÃO TÉCNICA - BarberPro v2.0

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Banco de Dados](#banco-de-dados)
4. [API REST](#api-rest)
5. [Autenticação](#autenticação)
6. [Features](#features)
7. [Fluxos de Negócio](#fluxos-de-negócio)
8. [Segurança](#segurança)
9. [Performance](#performance)
10. [Deployment](#deployment)

---

## Visão Geral

### Propósito
BarberPro é um sistema integrado de gerenciamento para barbearias, permitindo:
- Clientes: Agendamentos online com visualização de calendário
- Barbeiros: Gerenciamento de compromissos
- Administrador: Controle total da operação

### Características Principais
- Autenticação segura com JWT
- Banco de dados SQLite relacional
- Interface responsiva (mobile-first)
- Real-time status updates
- Calendário interativo com drag-drop
- Sistema de fila de espera
- Gestão de preços e promoções
- Relatórios e análises
- Notificações e lembretes
- Histórico de clientes

---

## Arquitetura

### Stack Tecnológico

```
┌─────────────────────────────────────────┐
│           Frontend (React 18)            │
│  - LoginPage                            │
│  - ClientDashboard                      │
│  - AdminDashboard                       │
│  - CalendarView                         │
│  - ReportsPage                          │
└──────────────┬──────────────────────────┘
               │ HTTP/REST
               ↓
┌─────────────────────────────────────────┐
│      Backend (Node.js + Express)        │
│  - Authentication Routes                │
│  - Appointment Management               │
│  - User Management                      │
│  - Service Management                   │
│  - Report Generation                    │
│  - Payment Processing                   │
└──────────────┬──────────────────────────┘
               │ SQL
               ↓
┌─────────────────────────────────────────┐
│        Database (SQLite3)               │
│  - users, services, appointments        │
│  - payments, reviews, promotions        │
│  - working_hours, waitlist              │
└─────────────────────────────────────────┘
```

### Padrões de Projeto
- **MVC**: Separação de responsabilidades
- **REST**: Operações CRUD via HTTP
- **JWT**: Autenticação stateless
- **Factory**: Criação de objetos
- **Observer**: Notificações em tempo real

---

## Banco de Dados

### Diagrama de Relações

```sql
users (1) ──── (N) appointments
  ├─ id
  ├─ name
  ├─ email
  ├─ phone
  ├─ password (hashed)
  ├─ role (client|barber|admin)
  ├─ document (CPF)
  ├─ address
  └─ created_at

services (1) ──── (N) appointments
  ├─ id
  ├─ name
  ├─ description
  ├─ price
  ├─ duration
  ├─ active
  └─ category

appointments (N) ──── (1) payments
  ├─ id
  ├─ client_id (FK)
  ├─ barber_id (FK)
  ├─ service_id (FK)
  ├─ date
  ├─ time
  ├─ status
  ├─ notes
  └─ created_at

payments
  ├─ id
  ├─ appointment_id (FK)
  ├─ amount
  ├─ method (cash|card|pix)
  ├─ status (pending|completed|cancelled)
  └─ created_at

working_hours
  ├─ id
  ├─ barber_id (FK)
  ├─ day_of_week
  ├─ start_time
  ├─ end_time
  └─ break_times

promotions
  ├─ id
  ├─ code
  ├─ discount
  ├─ valid_until
  └─ active

waitlist
  ├─ id
  ├─ client_id (FK)
  ├─ service_id (FK)
  ├─ barber_id (FK)
  ├─ preferred_dates
  └─ created_at

reviews (N) ──── (1) appointments
  ├─ id
  ├─ appointment_id (FK)
  ├─ rating
  ├─ comment
  └─ created_at
```

---

## API REST

### Convenções
- **Base URL**: `http://localhost:5000/api`
- **Auth**: Bearer token no header `Authorization`
- **Response**: JSON com status code apropriado
- **Errors**: Padrão de erro estruturado

### Padrão de Resposta

#### Sucesso
```json
{
  "status": "success",
  "data": { ... },
  "timestamp": "2025-03-10T14:30:00Z"
}
```

#### Erro
```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Email já cadastrado",
  "errors": [
    { "field": "email", "message": "Deve ser único" }
  ],
  "timestamp": "2025-03-10T14:30:00Z"
}
```

### Status HTTP Utilizados
- `200`: OK
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Server Error

### Endpoints por Módulo

#### Autenticação (5 endpoints)
```
POST   /auth/login           - Fazer login
POST   /auth/register        - Registrar novo usuário
POST   /auth/refresh         - Renovar token
POST   /auth/logout          - Fazer logout
POST   /auth/forgot-password - Recuperar senha
```

#### Usuários (6 endpoints)
```
GET    /users/profile        - Dados do usuário logado
PATCH  /users/profile        - Atualizar perfil
GET    /users/:id            - Dados de outro usuário
GET    /users                - Listar usuários (admin)
DELETE /users/:id            - Deletar usuário (admin)
PATCH  /users/:id/role       - Alterar role (admin)
```

#### Serviços (5 endpoints)
```
GET    /services             - Listar serviços
POST   /services             - Criar serviço (admin)
PATCH  /services/:id         - Atualizar serviço (admin)
DELETE /services/:id         - Deletar serviço (admin)
GET    /services/:id/reviews - Reviews de um serviço
```

#### Agendamentos (8 endpoints)
```
POST   /appointments         - Criar novo
GET    /appointments         - Listar (filtrado por role)
GET    /appointments/:id     - Detalhes
PATCH  /appointments/:id     - Atualizar
DELETE /appointments/:id     - Cancelar
PATCH  /appointments/:id/confirm - Confirmar
GET    /appointments/date/:date   - Por data
GET    /appointments/barber/:id   - Por barbeiro
```

#### Calendário (4 endpoints)
```
GET    /calendar/month/:month  - Mês inteiro
GET    /calendar/week/:week    - Semana
GET    /calendar/available     - Horários livres
POST   /calendar/block         - Bloquear horário (admin)
```

#### Pagamentos (4 endpoints)
```
POST   /payments              - Criar pagamento
GET    /payments              - Listar pagamentos
PATCH  /payments/:id          - Atualizar status
GET    /payments/receipt/:id  - Recibo
```

#### Promoções (4 endpoints)
```
GET    /promotions            - Listar códigos
POST   /promotions            - Criar código (admin)
POST   /promotions/validate   - Validar código
PATCH  /promotions/:id        - Atualizar
```

#### Fila de Espera (4 endpoints)
```
POST   /waitlist              - Entrar na fila
GET    /waitlist              - Ver posição
DELETE /waitlist/:id          - Sair da fila
GET    /waitlist/next         - Próximo disponível
```

#### Relatórios (5 endpoints)
```
GET    /reports/revenue       - Receita por período
GET    /reports/appointments  - Agendamentos
GET    /reports/customers     - Análise de clientes
GET    /reports/barbers       - Performance
GET    /reports/export        - Exportar relatório
```

---

## Autenticação

### Fluxo JWT

```
1. Usuário faz login
   POST /api/auth/login
   { email, password }
   
2. Server valida e gera token
   JWT { id, role, email, exp }
   
3. Client armazena token
   localStorage.setItem('token', token)
   
4. Requisições posteriores incluem token
   Header: Authorization: Bearer {token}
   
5. Server valida token em cada requisição
   jwt.verify(token, SECRET)
   
6. Token expira em 7 dias
   { exp: now + 7days }
```

### Roles e Permissões

```
ADMIN:
  ✓ Gerenciar usuários
  ✓ Gerenciar serviços
  ✓ Criar relatórios
  ✓ Configurar barbearia
  ✓ Bloquear horários
  ✓ Ver todas informações

BARBER:
  ✓ Ver seus agendamentos
  ✓ Confirmar agendamentos
  ✓ Atualizar status
  ✓ Ver reviews
  ✗ Criar serviços
  ✗ Gerenciar outros usuários

CLIENT:
  ✓ Agendar serviços
  ✓ Ver agendamentos
  ✓ Cancelar agendamentos
  ✓ Avaliar serviços
  ✗ Modificar agendamentos de outros
  ✗ Acessar relatórios
```

---

## Features

### 1. Calendário Interativo
- Visualização por mês/semana/dia
- Drag-drop de agendamentos
- Cores por status
- Indicadores de disponibilidade
- Zoom de horários

### 2. Sistema de Pagamento
- Múltiplos métodos (dinheiro, cartão, PIX)
- Integração futura com Stripe
- Recibos automáticos
- Histórico de transações

### 3. Gerenciamento de Promoções
- Códigos de desconto
- Descontos percentuais/fixos
- Validade configurável
- Relatório de uso

### 4. Fila de Espera
- Inscrever em lista de espera
- Notificação quando horário disponível
- Histórico de posição
- Auto-agendamento

### 5. Sistema de Avaliações
- Rating de 1-5 estrelas
- Comentários estruturados
- Análise de satisfação
- Ranking de barbeiros

### 6. Notificações
- Confirmação de agendamento
- Lembretes 24h antes
- Cancelamento automático
- Ofertas especiais

### 7. Relatórios
- Receita por período
- Clientes novos vs recorrentes
- Performance por barbeiro
- Taxa de cancelamento
- Projeções

### 8. Horários de Trabalho
- Configurar por barbeiro
- Pausas e almoços
- Dias de folga
- Horários especiais

### 9. Histórico de Cliente
- Serviços realizados
- Preferências
- Próximo agendamento sugerido
- Comportamento de pagamento

### 10. Gestão de Preços
- Preços por serviço
- Descontos para clientes VIP
- Preços dinâmicos
- Análise de rentabilidade

---

## Fluxos de Negócio

### Fluxo: Cliente Agendando Serviço

```
1. Cliente acessa /
2. Login com email/senha
3. Dashboard carrega
4. Clica "Agendar"
5. Seleciona:
   - Serviço desejado
   - Barbeiro preferido
   - Data no calendário
   - Horário disponível
6. Confirma observações
7. Revisa preço
8. Aplica cupom (opcional)
9. Confirma agendamento
10. Sistema cria appointment
11. Envia confirmação por email
12. Cliente vê em agenda
```

### Fluxo: Admin Gerenciando Operação

```
1. Admin faz login
2. Dashboard admin carrega
3. Visualiza KPIs
4. Clica em "Agendamentos"
5. Vê tabela com todos
6. Filtra por barbeiro/data/status
7. Clica em agendamento
8. Detalhes abrem
9. Pode:
   - Confirmar
   - Reagendar
   - Cancelar
   - Marcar como concluído
   - Adicionar notas
10. Clica "Salvar"
11. Sistema atualiza
12. Notificação enviada
```

### Fluxo: Barbeiro Confirmando Agendamento

```
1. Barbeiro faz login
2. Dashboard carrega
3. Vê agendamentos do dia
4. Revisa detalhes
5. Confirma ou recusa
6. Sistema notifica cliente
7. Barbeiro vê confirmação
```

---

## Segurança

### Criptografia
- **Senhas**: bcryptjs (salt rounds: 10)
- **Tokens**: HMAC-SHA256 (JWT)
- **Dados**: HTTPS em produção
- **Database**: Prepared statements (SQL injection)

### Validações
- Email: RFC 5322 completo
- Telefone: E.164 format
- CPF: Validação de dígito
- Valores: Type checking + range
- Datas: ISO 8601 format

### Rate Limiting
- Login: 5 tentativas / 15 min
- API: 100 req / min por IP
- Upload: 10MB máximo
- Timeout: 30s por requisição

### CORS
```javascript
allowedOrigins: [
  'http://localhost:5000',
  'https://barberpro.com.br'
]
```

---

## Performance

### Otimizações Frontend
- Lazy loading de imagens
- Code splitting React
- Memoização de componentes
- Debounce de eventos
- Cache de calendário

### Otimizações Backend
- Índices em chaves estrangeiras
- Connection pooling
- Query caching
- Compressão gzip
- CDN para assets estáticos

### Métricas Alvo
- TTF (Time to First Byte): < 500ms
- FCP (First Contentful Paint): < 1.5s
- LCP (Largest Contentful Paint): < 2.5s
- CLS (Cumulative Layout Shift): < 0.1

---

## Deployment

### Ambiente de Produção

#### Backend
```
Node.js 18+ LTS
Express 4.18+
SQLite → PostgreSQL (recomendado)
PM2 para process management
Nginx reverse proxy
SSL/TLS certificate
```

#### Frontend
```
React 18 otimizado
Webpack code splitting
Minificação CSS/JS
Service Worker
PWA manifest
```

#### Banco de Dados
```
PostgreSQL 14+
Replicação master-slave
Backup diário
Índices otimizados
Connection pooling (20-50)
```

#### Monitoramento
```
Error tracking (Sentry)
Performance monitoring (Datadog)
Log aggregation (ELK Stack)
Uptime monitoring (Pingdom)
Database monitoring (PgAdmin)
```

### Variáveis de Ambiente
```
NODE_ENV=production
PORT=5000
JWT_SECRET=sua-chave-segura
DATABASE_URL=postgresql://...
STRIPE_KEY=sk_live_...
SENDGRID_API_KEY=SG...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## Escalabilidade

### Estrutura Escalável
- Load balancer (Nginx/HAProxy)
- Multiple Node.js instances
- Database replication
- Redis cache layer
- File storage (S3)
- Message queue (RabbitMQ)

### Roadmap de Crescimento
1. **Fase 1**: Single server + SQLite
2. **Fase 2**: PostgreSQL + caching
3. **Fase 3**: Load balancer + 2+ servidores
4. **Fase 4**: Multi-tenant architecture
5. **Fase 5**: Microserviços

---

## Testes

### Tipos de Testes
```
Unit Tests:
  - Validações
  - Cálculos
  - Formatações

Integration Tests:
  - Fluxos de autenticação
  - CRUD de agendamentos
  - Relatórios

E2E Tests:
  - Login → Agendamento → Pagamento
  - Admin CRUD completo

Performance Tests:
  - Carregar 10k agendamentos
  - 100 requisições simultâneas
```

---

## Versionamento

### Semantic Versioning
- v2.0.0: Major (breaking changes)
- v2.1.0: Minor (new features)
- v2.1.1: Patch (bug fixes)

### Changelog
Manter em CHANGELOG.md com:
- Added
- Changed
- Fixed
- Removed
- Security

---

## Suporte e Manutenção

### SLA (Service Level Agreement)
- Uptime: 99.5%
- Response time: < 500ms
- Bug fix critical: < 4h
- Feature delivery: < 2 semanas

### Contato
- Email: suporte@barberpro.com.br
- Telefone: (31) 3333-4444
- Horário: Seg-Sexta 9:00-18:00

---

**Versão**: 2.0.0  
**Última atualização**: 2025-03-10  
**Status**: Production Ready
