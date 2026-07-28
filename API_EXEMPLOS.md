# 📡 Exemplos de Requisições API - BarberPro krl vc e mt burro rayan serio vai se tratar

Todos os exemplos abaixo usam `http://localhost:5000` como base.

---

## 🔐 Autenticação

### Login de Cliente
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "cliente@email.com",
    "password": "senha123"
  }'
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "João Silva",
    "email": "cliente@email.com",
    "role": "client",
    "phone": "(31) 98765-4321"
  }
}
```

### Login de Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@barbearia.com",
    "password": "Admin@2025"
  }'
```

### Registrar Nova Conta
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Carlos Santos",
    "email": "carlos@email.com",
    "phone": "(31) 99876-5432",
    "password": "senha123"
  }'
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 8,
    "name": "Carlos Santos",
    "email": "carlos@email.com",
    "role": "client",
    "phone": "(31) 99876-5432"
  }
}
```

---

## ✂️ Serviços

### Listar Todos os Serviços
```bash
curl http://localhost:5000/api/services
```

**Resposta:**
```json
[
  {
    "id": 1,
    "name": "Corte de Cabelo",
    "description": "Corte completo com acabamento",
    "price": 35.00,
    "duration": 30,
    "active": 1,
    "created_at": "2025-03-10 10:00:00"
  },
  {
    "id": 2,
    "name": "Barba Completa",
    "description": "Corte e desenho de barba",
    "price": 25.00,
    "duration": 25,
    "active": 1,
    "created_at": "2025-03-10 10:00:00"
  }
]
```

### Criar Novo Serviço (Admin)
```bash
curl -X POST http://localhost:5000/api/services \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  -d '{
    "name": "Corte Premium",
    "description": "Corte com design premium",
    "price": 75.00,
    "duration": 60
  }'
```

---

## 📅 Agendamentos

### Criar Novo Agendamento (Cliente)
```bash
curl -X POST http://localhost:5000/api/appointments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_CLIENTE" \
  -d '{
    "service_id": 1,
    "barber_id": 2,
    "appointment_date": "2025-03-15",
    "appointment_time": "10:00",
    "notes": "Gostaria de um corte estilo degrade"
  }'
```

**Resposta:**
```json
{
  "id": 15,
  "client_id": 5,
  "barber_id": 2,
  "service_id": 1,
  "appointment_date": "2025-03-15",
  "appointment_time": "10:00",
  "status": "pending"
}
```

### Listar Agendamentos do Cliente Logado
```bash
curl http://localhost:5000/api/appointments/client \
  -H "Authorization: Bearer SEU_TOKEN_CLIENTE"
```

**Resposta:**
```json
[
  {
    "id": 1,
    "client_id": 5,
    "barber_id": 2,
    "service_id": 1,
    "appointment_date": "2025-03-15",
    "appointment_time": "10:00",
    "status": "pending",
    "notes": "Gostaria de um corte estilo degrade",
    "created_at": "2025-03-10 14:30:00",
    "service_name": "Corte de Cabelo",
    "price": 35.00,
    "barber_name": "João da Silva"
  }
]
```

### Listar Todos os Agendamentos (Admin/Barbeiro)
```bash
curl http://localhost:5000/api/appointments \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN"
```

### Atualizar Status de Agendamento (Admin)
```bash
curl -X PATCH http://localhost:5000/api/appointments/15/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  -d '{
    "status": "confirmed"
  }'
```

**Status válidos:**
- `pending` - Aguardando confirmação
- `confirmed` - Confirmado
- `completed` - Concluído
- `cancelled` - Cancelado

### Cancelar Agendamento (Cliente/Admin)
```bash
curl -X PATCH http://localhost:5000/api/appointments/15/cancel \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 👥 Clientes

### Listar Todos os Clientes (Admin)
```bash
curl http://localhost:5000/api/clients \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN"
```

**Resposta:**
```json
[
  {
    "id": 5,
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "(31) 98765-4321",
    "cpf": "123.456.789-00",
    "created_at": "2025-02-15 08:30:00"
  },
  {
    "id": 6,
    "name": "Carlos Santos",
    "email": "carlos@email.com",
    "phone": "(31) 99876-5432",
    "cpf": null,
    "created_at": "2025-03-01 10:45:00"
  }
]
```

### Obter Detalhes do Cliente
```bash
curl http://localhost:5000/api/clients/5 \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Resposta:**
```json
{
  "id": 5,
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "(31) 98765-4321",
  "cpf": "123.456.789-00",
  "address": "Rua das Flores, 123",
  "created_at": "2025-02-15 08:30:00"
}
```

---

## 💇 Barbeiros

### Listar Barbeiros
```bash
curl http://localhost:5000/api/barbers
```

**Resposta:**
```json
[
  {
    "id": 2,
    "name": "João da Silva",
    "email": "joao@barbearia.com",
    "phone": "(31) 98765-4321"
  },
  {
    "id": 3,
    "name": "Carlos Santos",
    "email": "carlos@barbearia.com",
    "phone": "(31) 98765-4322"
  }
]
```

---

## 🕐 Horários Disponíveis

### Obter Horários Disponíveis
```bash
curl "http://localhost:5000/api/available-times/2/2025-03-15"
```

**Resposta:**
```json
{
  "available": true,
  "times": [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "14:00",
    "14:30",
    "15:00"
  ]
}
```

---

## ⭐ Avaliações

### Criar Avaliação (Cliente)
```bash
curl -X POST http://localhost:5000/api/reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_CLIENTE" \
  -d '{
    "appointment_id": 15,
    "rating": 5,
    "comment": "Excelente corte! Muito satisfeito com o trabalho."
  }'
```

**Resposta:**
```json
{
  "id": 3,
  "rating": 5,
  "comment": "Excelente corte! Muito satisfeito com o trabalho."
}
```

### Listar Avaliações de um Barbeiro
```bash
curl http://localhost:5000/api/barbers/2/reviews
```

**Resposta:**
```json
[
  {
    "id": 1,
    "appointment_id": 10,
    "client_id": 5,
    "rating": 5,
    "comment": "Excelente corte! Muito satisfeito com o trabalho.",
    "created_at": "2025-03-10 16:45:00",
    "client_name": "João Silva"
  },
  {
    "id": 2,
    "appointment_id": 12,
    "client_id": 6,
    "rating": 4.5,
    "comment": "Bom atendimento, profissional!",
    "created_at": "2025-03-09 15:20:00",
    "client_name": "Carlos Santos"
  }
]
```

---

## 📊 Dashboard (Admin)

### Obter Estatísticas do Dashboard
```bash
curl http://localhost:5000/api/dashboard/stats \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN"
```

**Resposta:**
```json
{
  "totalClients": 12,
  "completedAppointments": 45,
  "revenue": 1523.50,
  "pendingAppointments": 8,
  "dailyAppointments": [
    {
      "date": "2025-03-10",
      "count": 5
    },
    {
      "date": "2025-03-09",
      "count": 3
    },
    {
      "date": "2025-03-08",
      "count": 6
    }
  ],
  "barberStats": [
    {
      "id": 2,
      "name": "João da Silva",
      "completed_appointments": 28,
      "avg_rating": 4.8
    },
    {
      "id": 3,
      "name": "Carlos Santos",
      "completed_appointments": 17,
      "avg_rating": 4.5
    }
  ]
}
```

---

## ⚙️ Configurações

### Obter Configurações Públicas
```bash
curl http://localhost:5000/api/settings
```

**Resposta:**
```json
{
  "business_name": "BarberPro - Sua Barbearia",
  "business_phone": "(31) 3333-4444",
  "business_email": "contato@barbearia.com",
  "business_address": "Rua das Flores, 123 - Belo Horizonte, MG",
  "opening_hours": "Seg-Sex: 09:00-19:00, Sab: 09:00-17:00, Dom: Fechado"
}
```

### Atualizar Configurações (Admin)
```bash
curl -X PATCH http://localhost:5000/api/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_ADMIN" \
  -d '{
    "business_name": "Super Barbearia Premium",
    "business_phone": "(31) 9999-8888",
    "opening_hours": "Seg-Dom: 08:00-20:00"
  }'
```

---

## 🔑 Como Usar o Token

Todos os endpoints protegidos requerem o header `Authorization`:

```bash
-H "Authorization: Bearer SEU_TOKEN_AQUI"
```

Exemplo completo:
```bash
curl http://localhost:5000/api/appointments/client \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NSwiZW1haWwiOiJjbGllbnRlQGVtYWlsLmNvbSIsInJvbGUiOiJjbGllbnQiLCJuYW1lIjoiSm_Dg28gU2lsdmEiLCJpYXQiOjE3MDIzMjE2NDcsImV4cCI6MTcwMjkyNjQ0N30.abc123..."
```

---

## 📲 Usando no JavaScript/Fetch

```javascript
// Fazer login
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@barbearia.com',
    password: 'Admin@2025'
  })
});

const { token, user } = await response.json();
localStorage.setItem('token', token);

// Usar token em requisições posteriores
const aptsResponse = await fetch('http://localhost:5000/api/appointments', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const appointments = await aptsResponse.json();
console.log(appointments);
```

---

## 🧪 Testadores de API Recomendados

### Postman
Download: https://www.postman.com/downloads/

1. Criar Collection "BarberPro"
2. Adicionar requisições de exemplo
3. Usar variáveis para token e base URL

### Insomnia
Download: https://insomnia.rest/

1. Novo workspace
2. Criar requisições
3. Usar environment para variáveis

### Thunder Client (VS Code)
Extensão: Thunder Client no VS Code

---

## ✅ Checklist de Testes

- [ ] Login com admin funciona
- [ ] Login com cliente novo funciona
- [ ] Listar serviços retorna 8 itens
- [ ] Criar agendamento funciona
- [ ] Status de agendamento atualiza
- [ ] Listar clientes retorna cadastrados
- [ ] Dashboard stats carrega
- [ ] Avaliações salvas
- [ ] Horários disponíveis retorna array
- [ ] Configurações salvam

---

## 🚀 Próximas Integrações

Com essa API, você pode:
- Integrar app mobile (React Native/Flutter)
- Criar PWA (Progressive Web App)
- Adicionar webhooks
- Integrar pagamento (Stripe/PayPal)
- Enviar SMS/Email automático
- Gerar relatórios PDF
- Integrar WhatsApp API

---

**BarberPro API v1.0.0** - Pronto para integração! 🔪✨
