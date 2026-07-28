# Deploy no HostGator — BarberPro v2.1

## Estrutura de arquivos para enviar

```
/
├── server.js          ← backend principal
├── package.json
├── .env               ← crie a partir de .env.example
├── .htaccess
├── public/
│   └── index.html     ← frontend completo
└── data/              ← criado automaticamente pelo servidor
    └── barberpro.db   ← banco de dados (gerado ao iniciar)
```

> **NÃO envie** `node_modules/` nem `barberpro-final/`. O HostGator instala as dependências automaticamente.

---

## Passo a passo no cPanel (HostGator)

### 1. Fazer upload dos arquivos

No **Gerenciador de Arquivos** do cPanel, faça upload de todos os arquivos acima para a pasta do seu domínio (ex: `public_html/` ou uma subpasta).

### 2. Configurar Node.js no cPanel

1. Abra **"Setup Node.js App"** no cPanel
2. Clique em **"Create Application"**
3. Preencha:
   - **Node.js version**: 18 ou superior
   - **Application mode**: Production
   - **Application root**: caminho da pasta onde estão os arquivos (ex: `public_html`)
   - **Application startup file**: `server.js`
4. Clique em **Save**

### 3. Criar o arquivo .env

No Gerenciador de Arquivos, crie o arquivo `.env` na raiz do projeto com:

```env
JWT_SECRET=coloque-uma-chave-longa-e-aleatoria-aqui-minimo-32-caracteres
DB_PATH=/home/SEU_USUARIO/barberpro_data/barberpro.db
```

> Substitua `SEU_USUARIO` pelo seu nome de usuário cPanel.
> O diretório `barberpro_data` precisa existir — crie pelo Gerenciador de Arquivos fora do `public_html`.

### 4. Instalar dependências

No Terminal SSH do cPanel (ou via "Terminal" no cPanel):

```bash
cd ~/public_html   # ou o caminho do seu projeto
npm install --omit=dev
```

### 5. Iniciar a aplicação

No **"Setup Node.js App"**, clique em **"Run NPM Install"** e depois **"Restart"**.

---

## Credenciais padrão (mude após o primeiro acesso!)

| Perfil  | Email                   | Senha       |
|---------|-------------------------|-------------|
| Admin   | admin@barbearia.com     | Admin@2025  |
| Barbeiro| joao@barbearia.com      | Barber@2025 |
| Barbeiro| carlos@barbearia.com    | Barber@2025 |

---

## Testando

Acesse `https://seudominio.com/api/health` — deve retornar:
```json
{"status":"ok","version":"2.1"}
```
