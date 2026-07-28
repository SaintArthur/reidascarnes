const express = require('express');
const { Pool, types } = require('pg');
// node-pg devolve BIGINT (COUNT(*), SUM de coluna inteira) como string por padrão, para não
// perder precisão em valores acima de Number.MAX_SAFE_INTEGER. O sqlite3 sempre devolvia number
// nesses casos, e o resto do código (aqui e no front-end) assume number (ex: `prev === 0`,
// `referralCount === 1`) — sem essa conversão, essas comparações estritas quebrariam em produção.
types.setTypeParser(20, (val) => parseInt(val, 10));
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Signer } = require('@aws-sdk/rds-signer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { t, reqLang, SUPPORTED_LANGS, weekdayName } = require('./i18n-server');
const focusNfe = require('./focus-nfe');
const scaleBarcode = require('./scale-barcode');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'chave-secreta-barberpro-2025-mude-em-producao';
const pkg = require('./package.json');
const serverStartedAt = new Date();

// ─── Log do sistema (buffer em memória, mais recente primeiro) ───────────────
const SYSTEM_LOG_MAX = 200;
const systemLog = [];
// `key` é o template em português (chave de tradução); `params` alimenta a
// interpolação. A tradução para o idioma de quem está lendo o log acontece em
// GET /admin/system-log, não na gravação — assim o mesmo evento pode ser
// exibido em idiomas diferentes para admins diferentes.
function logEvent(level, key, params) {
  systemLog.unshift({ time: new Date().toISOString(), level, key, params: params || {} });
  if (systemLog.length > SYSTEM_LOG_MAX) systemLog.length = SYSTEM_LOG_MAX;
}

// ─── Web Push (lembretes de agendamento mesmo com a aba fechada) ──────────────
// Gera as chaves VAPID uma única vez e persiste no .env para que as assinaturas
// dos navegadores continuem válidas entre reinicializações do servidor.
const ENV_PATH = path.join(__dirname, '.env');
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
  try {
    const envAppend = `\n# Gerado automaticamente para Web Push\nVAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}\nVAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}\n`;
    fs.appendFileSync(ENV_PATH, envAppend);
    console.log('🔑 Chaves VAPID geradas e salvas em .env');
  } catch (e) {
    console.warn('⚠️  Não foi possível persistir as chaves VAPID em .env:', e.message);
  }
}
webpush.setVapidDetails('mailto:contato@barberpro.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
// Sem cache-control explícito, o navegador pode reaproveitar (via ETag) uma resposta antiga de
// GET para a mesma URL — grave numa API cujos dados mudam a cada agendamento/cancelamento (ex:
// horários disponíveis podem parecer "sumir" mesmo depois de liberados). Toda resposta da API
// deve refletir o estado atual do banco.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados Postgres (Aurora Serverless v2 em produção; local em dev).
// Esse cluster Aurora específico exige autenticação IAM (senha fixa é rejeitada mesmo pro
// usuário mestre) — quando DB_HOST está definido, gera um token novo a cada conexão do pool
// (válido por 15 min, por isso não dá pra guardar como uma DATABASE_URL estática). Em dev
// local, sem DB_HOST, continua usando DATABASE_URL com usuário/senha normais.
const pool = process.env.DB_HOST
  ? new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      database: process.env.DB_NAME || 'barberpro',
      password: () => new Signer({
        hostname: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER || 'postgres',
        region: process.env.AWS_REGION || 'us-east-1',
      }).getAuthToken(),
      // Aurora exige TLS; mantém a verificação do certificado ligada (não desabilitar
      // rejectUnauthorized — isso abriria a conexão a man-in-the-middle). Os certificados do
      // RDS/Aurora encadeiam até uma CA pública (Amazon Trust Services), então a validação
      // padrão do Node já funciona sem precisar embutir o bundle da RDS.
      ssl: true,
    })
  : new Pool({
      connectionString: process.env.DATABASE_URL || `postgres://localhost/${process.env.PGDATABASE || 'barberpro'}`,
      ssl: /rds\.amazonaws\.com/.test(process.env.DATABASE_URL || '') ? true : false,
    });
pool.on('error', (err) => console.error('Erro inesperado no pool do Postgres:', err.message));

// Camada de compatibilidade com a API do sqlite3 (db.run/get/all com placeholders `?` e callback
// (err, row)/(err, rows), incluindo `this.lastID`/`this.changes` após INSERT/UPDATE) — permite que
// a maior parte das ~190 chamadas de banco no resto deste arquivo continue como estava, enquanto a
// conexão de fato usa `pg`/Postgres por baixo. Quando chamado sem callback, retorna uma Promise
// (usado nos handlers novos/reescritos que já usam async/await, ex. PATCH /api/me).
function toPgQuery(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
function runQuery(sql, params) {
  const text = toPgQuery(sql);
  const isInsert = /^\s*insert/i.test(text) && !/returning/i.test(text);
  return pool.query(isInsert ? `${text} RETURNING id` : text, params);
}
const db = {
  run(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const p = runQuery(sql, params || []);
    if (!cb) return p;
    p.then(result => cb.call({ lastID: result.rows[0]?.id, changes: result.rowCount }, null))
     .catch(err => cb.call({}, err));
  },
  get(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const p = pool.query(toPgQuery(sql), params || []).then(r => r.rows[0]);
    if (!cb) return p;
    p.then(row => cb(null, row)).catch(err => cb(err));
  },
  all(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const p = pool.query(toPgQuery(sql), params || []).then(r => r.rows);
    if (!cb) return p;
    p.then(rows => cb(null, rows)).catch(err => cb(err));
  },
};

// ─── Fotos em S3 (avatar de cliente/barbeiro e portfólio do barbeiro) ─────────
// O front-end continua enviando a foto como data URL base64 dentro do JSON — só o destino de
// gravação muda aqui: em vez de salvar o base64 na coluna do banco, sobe pro bucket e grava a URL.
// Sem S3_BUCKET_NAME configurado (dev local sem AWS), mantém o base64 como antes.
const s3Client = process.env.S3_BUCKET_NAME ? new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }) : null;

async function uploadPhotoToS3(dataUrl, keyPrefix) {
  if (!s3Client || !dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return dataUrl;
  const [, mimeType, base64Data] = match;
  const key = `${keyPrefix}/${crypto.randomUUID()}.${mimeType.split('/')[1] || 'jpg'}`;
  // Sem ACL: buckets criados hoje vêm com "ACLs desabilitadas" por padrão (Object Ownership
  // "Bucket owner enforced") — tentar setar ACL:'public-read' falharia com
  // AccessControlListNotSupported. A leitura pública fica por conta de uma bucket policy
  // (ver deploy/setup-aws.sh), restrita aos prefixos avatars/* e portfolio/*.
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: Buffer.from(base64Data, 'base64'),
    ContentType: mimeType,
  }));
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

async function deletePhotoFromS3(url) {
  if (!s3Client || !url || !url.includes(`${process.env.S3_BUCKET_NAME}.s3.`)) return;
  const key = url.split('.amazonaws.com/')[1];
  if (!key) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key })).catch(() => {});
}

async function initDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password TEXT,
    role TEXT DEFAULT 'client',
    document TEXT UNIQUE,
    address TEXT,
    photo_url TEXT,
    is_vip INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    duration INTEGER NOT NULL,
    category TEXT,
    icon TEXT,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES users(id),
    barber_id INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    amount REAL NOT NULL,
    method TEXT,
    status TEXT DEFAULT 'pending',
    receipt_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    client_id INTEGER NOT NULL REFERENCES users(id),
    barber_id INTEGER NOT NULL REFERENCES users(id),
    rating REAL NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS working_hours (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barber_id INTEGER NOT NULL REFERENCES users(id),
    day_of_week INTEGER,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start TIME,
    break_end TIME
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT,
    discount_value REAL NOT NULL,
    valid_until TIMESTAMP,
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    barber_id INTEGER NOT NULL REFERENCES users(id),
    preferred_date DATE,
    position INTEGER,
    notified INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS blocked_times (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barber_id INTEGER NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS absences (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barber_id INTEGER NOT NULL REFERENCES users(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS dayoff_requests (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barber_id INTEGER NOT NULL REFERENCES users(id),
    day_of_week INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id),
    referred_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // ─── Módulo Açougue (role 'acougue') ────────────────────────────────────────
  // Dashboard financeiro separado do fluxo de barbearia — tabelas próprias, sem FK pra
  // appointments/services. Reaproveita apenas users (dono/operador do caixa) e settings
  // (config fiscal: CNPJ, IE, alíquotas de PIS/COFINS).

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_products (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'corte',
    unit TEXT DEFAULT 'kg',
    price REAL NOT NULL DEFAULT 0,
    cost_price REAL DEFAULT 0,
    stock_qty REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_carcass_entries (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    supplier_document TEXT,
    animal_type TEXT,
    weight_kg REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_value REAL NOT NULL,
    entry_date DATE NOT NULL,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_cuts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carcass_entry_id INTEGER REFERENCES acougue_carcass_entries(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES acougue_products(id) ON DELETE SET NULL,
    cut_name TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    unit_price REAL NOT NULL,
    total_value REAL NOT NULL,
    output_date DATE NOT NULL,
    destination TEXT DEFAULT 'estoque',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_sales (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_number TEXT UNIQUE NOT NULL,
    total_value REAL NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'concluida',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_sale_items (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES acougue_sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES acougue_products(id),
    product_name TEXT NOT NULL,
    barcode TEXT,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_invoices (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type TEXT NOT NULL,
    ref_type TEXT,
    ref_id INTEGER,
    total_value REAL NOT NULL,
    status TEXT DEFAULT 'rascunho',
    focus_ref TEXT,
    chave_acesso TEXT,
    numero INTEGER,
    serie INTEGER,
    xml_url TEXT,
    danfe_url TEXT,
    error_message TEXT,
    payload JSONB,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_tax_periods (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ref_month INTEGER NOT NULL,
    ref_year INTEGER NOT NULL,
    pis_credit REAL NOT NULL,
    pis_debit REAL NOT NULL,
    pis_due REAL NOT NULL,
    cofins_credit REAL NOT NULL,
    cofins_debit REAL NOT NULL,
    cofins_due REAL NOT NULL,
    closed_by INTEGER REFERENCES users(id),
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ref_month, ref_year)
  )`);

  // Tabela de rendimento de carcaça: percentuais de referência (editáveis pelo dono, já que o
  // rendimento real varia por raça, idade, acabamento de gordura e jejum do animal) usados pela
  // calculadora "peso vivo → cortes". `pct_of_carcass` é sempre % sobre o peso de CARCAÇA (não
  // sobre o peso vivo) — é assim que a tabela de cortes é publicada no setor.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_yield_cuts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT NOT NULL,
    pct_of_carcass REAL NOT NULL,
    display_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  )`);

  // Código do produto NA BALANÇA (PLU). É diferente do `barcode`: a etiqueta que a balança
  // imprime muda a cada pacote (carrega o peso), então nunca casa com um código fixo — o que
  // se repete de um pacote pro outro é só o PLU. Por isso a busca do caixa usa esta coluna
  // quando a leitura é de etiqueta de balança, e `barcode` quando é EAN de fábrica.
  await pool.query('ALTER TABLE acougue_products ADD COLUMN IF NOT EXISTS scale_code TEXT');

  // Campos fiscais por produto. Não dá pra deduzir nenhum deles no código: NCM depende do corte
  // (carne bovina fresca, resfriada e congelada têm códigos diferentes), CFOP depende da
  // operação, e o CST/CSOSN depende do regime tributário da empresa E do tratamento do ICMS
  // naquele estado (carne tem redução de base ou isenção em vários UFs). Errar qualquer um
  // faz a SEFAZ rejeitar a nota — ou pior, autorizar com imposto errado. Quem preenche é o
  // contador do açougue; o sistema só transporta.
  for (const col of [
    'ncm TEXT', 'cfop TEXT', 'cest TEXT', 'origem TEXT DEFAULT \'0\'',
    'icms_cst TEXT', 'icms_aliquota REAL', 'icms_reducao_bc REAL',
    'pis_cst TEXT', 'cofins_cst TEXT',
  ]) {
    await pool.query(`ALTER TABLE acougue_products ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_acougue_products_scale_code
    ON acougue_products(scale_code) WHERE scale_code IS NOT NULL AND active = 1`);

  // Migrações (colunas adicionadas depois do schema inicial) — idempotentes via IF NOT EXISTS,
  // sem precisar do try/catch de "duplicate column" que o sqlite3 exigia.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty TEXT');
  for (const col of ['featured INTEGER DEFAULT 0', 'hidden INTEGER DEFAULT 0', 'reply TEXT', 'reply_at TIMESTAMP']) {
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_appointment ON reviews(appointment_id)');

  // Garante, a nível de banco, que não existam dois agendamentos ativos no mesmo horário/barbeiro
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_appointment
    ON appointments(barber_id, appointment_date, appointment_time)
    WHERE status IN ('pending', 'confirmed')`);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark'");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR'");
  await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP');
  await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price REAL');
  await pool.query(`UPDATE appointments SET price = (SELECT price FROM services WHERE services.id = appointments.service_id) WHERE price IS NULL`);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS service_preferences TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_photos TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS intro_video_url TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS instagram TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_birthday_notif_year INTEGER');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER');

  // Índice único de working_hours criado antes do seed abaixo — banco novo, sem linhas
  // duplicadas legadas para migrar (diferente do SQLite, que só ganhou essa constraint depois
  // de já ter acumulado duplicatas em restarts anteriores).
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_working_hours ON working_hours(barber_id, day_of_week)');

  // Seed inicial - só insere se não existir
  const adminPassword = bcrypt.hashSync('Admin@2025', 10);
  await pool.query(
    `INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
    ['Admin', 'admin@barbearia.com', '(31) 99999-9999', adminPassword, 'admin']
  );

  const barberPassword = bcrypt.hashSync('Barber@2025', 10);
  await pool.query(
    `INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
    ['João da Silva', 'joao@barbearia.com', '(31) 98765-4321', barberPassword, 'barber']
  );
  await pool.query(
    `INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
    ['Carlos Santos', 'carlos@barbearia.com', '(31) 98765-4322', barberPassword, 'barber']
  );

  const services = [
    ['Corte de Cabelo', 'Corte completo com acabamento', 35.00, 30, 'corte'],
    ['Barba Completa', 'Corte e desenho de barba', 25.00, 25, 'barba'],
    ['Corte + Barba', 'Corte de cabelo + barba', 55.00, 50, 'combo'],
    ['Hidratação', 'Tratamento de hidratação', 45.00, 40, 'tratamento'],
    ['Sobrancelha', 'Design de sobrancelha', 15.00, 15, 'acabamento'],
    ['Pezinho', 'Aparação lateral', 20.00, 20, 'acabamento'],
    ['Pigmentação', 'Tingimento de barba', 35.00, 30, 'pigmentacao'],
    ['Limpeza de Pele', 'Facial masculino', 50.00, 45, 'facial'],
  ];
  const { rows: [countRow] } = await pool.query('SELECT COUNT(*) as count FROM services');
  if (Number(countRow.count) === 0) {
    for (const s of services) {
      await pool.query(`INSERT INTO services (name, description, price, duration, category) VALUES ($1, $2, $3, $4, $5)`, s);
    }
  }

  for (const day of [1, 2, 3, 4, 5, 6]) {
    const endTime = day === 6 ? '17:00' : '18:00';
    await pool.query(
      `INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, break_start, break_end) VALUES (2, $1, '09:00', $2, '12:00', '13:00') ON CONFLICT (barber_id, day_of_week) DO NOTHING`,
      [day, endTime]
    );
    await pool.query(
      `INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, break_start, break_end) VALUES (3, $1, '09:00', $2, '12:00', '13:00') ON CONFLICT (barber_id, day_of_week) DO NOTHING`,
      [day, endTime]
    );
  }

  // Backfill: barbeiros sem nenhum horário cadastrado (ex: criados pelo admin sem configurar
  // escala) ficavam com 0 horários disponíveis em qualquer data.
  const { rows: barbersNoSchedule } = await pool.query(
    `SELECT id FROM users WHERE role = 'barber' AND id NOT IN (SELECT DISTINCT barber_id FROM working_hours)`
  );
  for (const b of barbersNoSchedule) await seedDefaultSchedule(b.id);

  const settingsSeed = [
    ['business_name', 'BarberPro Premium'],
    ['business_phone', '(31) 3333-4444'],
    ['business_email', 'contato@barbearia.com'],
    ['business_address', 'Rua das Flores, 123'],
    ['opening_hours', 'Seg-Sexta: 09:00-18:00, Sábado: 09:00-17:00'],
    ['cancel_fee', '20'],
  ];
  for (const [key, value] of settingsSeed) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
  }

  // Usuário do módulo açougue (login: reidascarnes / senha: reidascarnes). O campo `email` do
  // login aceita qualquer string única — não precisa ter formato de e-mail real.
  const acougueOwnerPassword = bcrypt.hashSync('reidascarnes', 10);
  await pool.query(
    `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
    ['Rei das Carnes', 'reidascarnes', acougueOwnerPassword, 'acougue']
  );

  // Configurações fiscais do açougue (chave/valor na mesma tabela `settings`, prefixo
  // `acougue_`). CNPJ/IE ficam vazios até o dono preencher em Configurações — sem eles a
  // emissão de NF-e é recusada pela Focus NFe antes mesmo de tentar transmitir.
  const acougueSettingsSeed = [
    ['acougue_business_name', ''],
    ['acougue_cnpj', ''],
    ['acougue_ie', ''],
    ['acougue_logradouro', ''],
    ['acougue_numero', ''],
    ['acougue_bairro', ''],
    ['acougue_municipio', ''],
    ['acougue_uf', ''],
    ['acougue_cep', ''],
    ['acougue_regime_tributario', 'lucro_real'],
    ['acougue_pis_rate', '1.65'],
    ['acougue_cofins_rate', '7.60'],
    // Rendimento peso vivo → carcaça (% do peso vivo do boi). Valores de referência típicos do
    // setor — variam de verdade por raça, acabamento de gordura e tempo de jejum do animal, por
    // isso ficam editáveis em Configurações.
    // Layout da etiqueta da balança (ver scale-barcode.js), conferido numa etiqueta real:
    // 2 + PLU de 6 dígitos + preço total em centavos de 5 dígitos + DV. Se a balança for
    // reprogramada (ou trocada por outra que grave PESO), é só ajustar em Configurações.
    ['acougue_scale_prefix', '2'],
    ['acougue_scale_code_digits', '6'],
    ['acougue_scale_value_digits', '5'],
    ['acougue_scale_value_type', 'preco_centavos'],
    ['acougue_dressing_pct', '50'],
    ['acougue_blood_pct', '3.5'],
    ['acougue_hide_pct', '7'],
    ['acougue_head_feet_pct', '4'],
  ];
  for (const [key, value] of acougueSettingsSeed) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
  }

  // Tabela de rendimento de cortes (% sobre o peso de CARCAÇA) — referência padrão do setor para
  // corte bovino brasileiro. Soma ~100% da carcaça: cortes de dianteiro/traseiro/ponta de agulha
  // + carne moída (aparas) + perdas não-comestíveis (osso, sebo, processamento).
  const { rows: [yieldCount] } = await pool.query('SELECT COUNT(*)::int as count FROM acougue_yield_cuts');
  if (yieldCount.count === 0) {
    const yieldCuts = [
      ['Acém', 'dianteiro', 9, 1],
      ['Peito', 'dianteiro', 4, 2],
      ['Músculo Dianteiro', 'dianteiro', 4, 3],
      ['Paleta', 'dianteiro', 4, 4],
      ['Cupim', 'dianteiro', 2, 5],
      ['Alcatra', 'traseiro', 3, 6],
      ['Picanha', 'traseiro', 1.5, 7],
      ['Contrafilé', 'traseiro', 4, 8],
      ['Filé Mignon', 'traseiro', 1.2, 9],
      ['Coxão Mole', 'traseiro', 5, 10],
      ['Coxão Duro', 'traseiro', 4, 11],
      ['Lagarto', 'traseiro', 2.5, 12],
      ['Patinho', 'traseiro', 4, 13],
      ['Maminha', 'traseiro', 1.3, 14],
      ['Músculo Traseiro', 'traseiro', 3, 15],
      ['Costela', 'ponta_agulha', 7, 16],
      ['Fraldinha', 'ponta_agulha', 2, 17],
      ['Carne Moída (Aparas)', 'moida', 8.5, 18],
      ['Ossos', 'perda', 20, 19],
      ['Sebo / Gordura', 'perda', 7, 20],
      ['Perda de Processamento', 'perda', 3, 21],
    ];
    for (const [name, section, pct, order] of yieldCuts) {
      await pool.query(
        'INSERT INTO acougue_yield_cuts (name, section, pct_of_carcass, display_order) VALUES ($1, $2, $3, $4)',
        [name, section, pct, order]
      );
    }
  }
}

// Aplica a escala padrão da barbearia (Seg-Sáb, 09:00-18:00/17:00, intervalo 12:00-13:00) a um
// barbeiro que ainda não tem nenhum horário próprio configurado.
async function seedDefaultSchedule(barberId) {
  for (const day of [1, 2, 3, 4, 5, 6]) {
    const endTime = day === 6 ? '17:00' : '18:00';
    await pool.query(
      `INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, break_start, break_end) VALUES ($1, $2, '09:00', $3, '12:00', '13:00') ON CONFLICT (barber_id, day_of_week) DO NOTHING`,
      [barberId, day, endTime]
    );
  }
}

// ─── Middlewares de autenticação ────────────────────────────────────────────

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: t(reqLang(req), 'Token não fornecido') });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: t(reqLang(req), 'Token inválido') });
  }
};

const verifyRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
  }
  next();
};

// ─── Auth ────────────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req, res) => ({ error: t(reqLang(req), 'Muitas tentativas de login. Tente novamente em alguns minutos.') }),
  skipSuccessfulRequests: true,
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [email || ''], (err, user) => {
    if (err || !user) {
      logEvent('WARN', 'Tentativa de login inválida ({email})', { email: email || '—' });
      return res.status(401).json({ error: t(reqLang(req), 'Usuário não encontrado') });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      logEvent('WARN', 'Tentativa de login inválida ({email})', { email });
      return res.status(401).json({ error: t(reqLang(req), 'Senha incorreta') });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, language: user.language || 'pt-BR' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, theme: user.theme || 'dark', language: user.language || 'pt-BR', must_change_password: !!user.must_change_password } });
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, document, referral_code } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;

  // Vincula a indicação (se o código enviado corresponder a alguém) depois que o
  // novo usuário já existe, notifica os dois lados no idioma de cada um, e só então
  // responde — código inválido/inexistente é ignorado silenciosamente, sem erro.
  const linkReferralAndRespond = (newUserId, respond) => {
    if (!referral_code) return respond();
    db.get('SELECT id FROM users WHERE referral_code = ?', [referral_code], (err, referrer) => {
      if (err || !referrer || referrer.id === newUserId) return respond();
      db.run('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, newUserId]);
      isSettingEnabled('referral_enabled', (enabled) => {
        if (!enabled) return respond();
        db.run('INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)', [referrer.id, newUserId]);
        db.all(`SELECT key, value FROM settings WHERE key IN ('referral_bonus_referrer', 'referral_bonus_referred')`, (settingsErr, rows) => {
          const s = {};
          (rows || []).forEach(r => { s[r.key] = r.value; });
          criarNotificacao(referrer.id, 'Indicação recompensada!', 'Alguém se cadastrou pelo seu link de indicação! Você ganhou: {bonus}.', 'success', { bonus: s.referral_bonus_referrer || '' });
          criarNotificacao(newUserId, 'Bem-vindo(a)!', 'Você ganhou {bonus} por se cadastrar através de uma indicação.', 'success', { bonus: s.referral_bonus_referred || '' });
          respond();
        });
      });
    });
  };

  const insertUser = () => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    // Toda conta nova começa em pt-BR por padrão, independente do X-Lang que a
    // tela de cadastro estava mostrando — o idioma só muda quando a pessoa
    // escolhe explicitamente no dropdown do header (e aí fica fixo).
    const language = 'pt-BR';
    db.run(
      'INSERT INTO users (name, email, phone, password, document, role, language) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, normalizedEmail, phone, hashedPassword, document || null, 'client', language],
      function(err) {
        if (err) {
          if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Email já cadastrado') });
          return res.status(500).json({ error: t(reqLang(req), 'Erro ao registrar') });
        }
        const newUserId = this.lastID;
        const token = jwt.sign({ id: newUserId, email: normalizedEmail, role: 'client', name, language }, JWT_SECRET, { expiresIn: '7d' });
        linkReferralAndRespond(newUserId, () => {
          res.status(201).json({ token, user: { id: newUserId, name, email: normalizedEmail, role: 'client', phone, theme: 'dark', language } });
        });
      }
    );
  };

  if (!phoneDigits) return insertUser();

  db.get(
    `SELECT id FROM users WHERE phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`,
    [phoneDigits],
    (err, existing) => {
      if (existing) return res.status(409).json({ error: t(reqLang(req), 'Telefone já cadastrado') });
      insertUser();
    }
  );
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: t(reqLang(req), 'A senha deve ter no mínimo 8 caracteres') });
  }
  db.get('SELECT * FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))', [email], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: t(reqLang(req), 'Nenhuma conta encontrada com esse e-mail') });
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id], (err2) => {
      if (err2) return res.status(500).json({ error: t(reqLang(req), 'Erro ao redefinir senha') });
      res.json({ message: t(reqLang(req), 'Senha redefinida com sucesso') });
    });
  });
});

app.put('/api/auth/profile', verifyToken, (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: t(reqLang(req), 'Nome e e-mail são obrigatórios') });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;

  const applyUpdate = () => {
    db.run(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, normalizedEmail, phone || null, req.user.id],
      function(err) {
        if (err) {
          if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Email já cadastrado') });
          return res.status(500).json({ error: t(reqLang(req), 'Erro ao atualizar perfil') });
        }
        res.json({ name, email: normalizedEmail, phone: phone || null });
      }
    );
  };

  db.get(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ?',
    [normalizedEmail, req.user.id],
    (err, existingEmail) => {
      if (existingEmail) return res.status(409).json({ error: t(reqLang(req), 'Email já cadastrado') });
      if (!phoneDigits) return applyUpdate();

      db.get(
        `SELECT id FROM users WHERE id != ? AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`,
        [req.user.id, phoneDigits],
        (err, existingPhone) => {
          if (existingPhone) return res.status(409).json({ error: t(reqLang(req), 'Telefone já cadastrado') });
          applyUpdate();
        }
      );
    }
  );
});

app.put('/api/auth/password', verifyToken, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: t(reqLang(req), 'A nova senha deve ter no mínimo 8 caracteres') });
  }
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: t(reqLang(req), 'Usuário não encontrado') });
    if (!bcrypt.compareSync(old_password, user.password)) {
      return res.status(401).json({ error: t(reqLang(req), 'Senha atual incorreta') });
    }
    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.run('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?', [hashedPassword, req.user.id], (err2) => {
      if (err2) return res.status(500).json({ error: t(reqLang(req), 'Erro ao alterar senha') });
      res.json({ message: t(reqLang(req), 'Senha alterada com sucesso') });
    });
  });
});

// ─── Serviços ─────────────────────────────────────────────────────────────────

app.get('/api/services', (req, res) => {
  db.all('SELECT * FROM services WHERE active = 1', (err, services) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(services);
  });
});

app.post('/api/services', verifyToken, verifyRole(['admin']), (req, res) => {
  const { name, description, price, duration, category } = req.body;
  db.run(
    'INSERT INTO services (name, description, price, duration, category) VALUES (?, ?, ?, ?, ?)',
    [name, description, price, duration, category],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, name, description, price, duration, category });
    }
  );
});

app.put('/api/services/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  const { name, description, price, duration, category, active } = req.body;
  db.run(
    'UPDATE services SET name=?, description=?, price=?, duration=?, category=?, active=? WHERE id=?',
    [name, description, price, duration, category, active !== undefined ? active : 1, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, name, description, price, duration, category });
    }
  );
});

app.delete('/api/services/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  db.run('UPDATE services SET active = 0 WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, active: 0 });
  });
});

// ─── Agendamentos ─────────────────────────────────────────────────────────────

app.post('/api/appointments', verifyToken, (req, res) => {
  const { service_id, barber_id, appointment_date, appointment_time, notes } = req.body;
  const client_id = req.user.id;

  if (!service_id || !barber_id || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (appointment_date < todayStr) {
    return res.status(400).json({ error: t(reqLang(req), 'Não é possível agendar em uma data que já passou') });
  }
  if (appointment_date === todayStr) {
    const [h, m] = appointment_time.split(':').map(Number);
    const slot = new Date(now); slot.setHours(h, m, 0, 0);
    if (slot < now) return res.status(400).json({ error: t(reqLang(req), 'Não é possível agendar em um horário que já passou') });
  }

  const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  db.get('SELECT id, name, duration, price FROM services WHERE id = ? AND active = 1', [service_id], (err, service) => {
    if (!service) return res.status(400).json({ error: t(reqLang(req), 'Serviço inválido') });

    db.get('SELECT id FROM users WHERE id = ? AND role = ?', [barber_id, 'barber'], (err, barber) => {
      if (!barber) return res.status(400).json({ error: t(reqLang(req), 'Barbeiro inválido') });

      db.all(
        `SELECT a.appointment_time, s.duration FROM appointments a JOIN services s ON a.service_id = s.id
         WHERE a.barber_id = ? AND a.appointment_date = ? AND a.status IN ('pending', 'confirmed')`,
        [barber_id, appointment_date],
        (err, existing) => {
          const newStart = toMinutes(appointment_time);
          const newEnd = newStart + (service.duration || 30);
          const conflict = (existing || []).some(row => {
            const existStart = toMinutes(row.appointment_time);
            const existEnd = existStart + (row.duration || 30);
            return newStart < existEnd && existStart < newEnd;
          });
          if (conflict) return res.status(409).json({ error: t(reqLang(req), 'Horário conflita com outro agendamento já marcado para este barbeiro') });

          // Por padrão o agendamento já nasce confirmado: se o horário estava disponível para o
          // cliente escolher, é porque o barbeiro está livre para atendê-lo, então não faz sentido
          // exigir uma confirmação manual extra. Admin pode reativar a confirmação manual em
          // Configurações > Agendamentos (auto_confirm = false).
          isSettingEnabled('auto_confirm', (autoConfirm) => {
            const initialStatus = autoConfirm ? 'confirmed' : 'pending';
            db.run(
              'INSERT INTO appointments (client_id, barber_id, service_id, appointment_date, appointment_time, notes, price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [client_id, barber_id, service_id, appointment_date, appointment_time, notes, service.price, initialStatus],
              function(err) {
                if (err) {
                  if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Horário já marcado') });
                  return res.status(500).json({ error: err.message });
                }
                isSettingEnabled('notif_new_appt', (enabled) => {
                  if (enabled) {
                    criarNotificacao(barber_id, 'Novo agendamento',
                      '{cliente} marcou {servico} em {data} às {hora}.', 'info',
                      { cliente: req.user.name || 'Um cliente', servico: service.name, data: appointment_date, hora: appointment_time });
                  }
                });
                res.status(201).json({ id: this.lastID, status: initialStatus });
              }
            );
          });
        }
      );
    });
  });
});

app.get('/api/appointments', verifyToken, (req, res) => {
  let query = `
    SELECT a.*, s.name as service_name, COALESCE(a.price, s.price) as price, s.duration, b.name as barber_name,
      c.name as client_name, c.phone as client_phone, c.photo_url as client_photo_url,
      (SELECT COUNT(*) FROM appointments a2 WHERE a2.client_id = c.id) AS client_total_appointments,
      (SELECT COUNT(*) FROM appointments a2 WHERE a2.client_id = c.id AND a2.status = 'cancelled') AS client_cancelled_appointments,
      (SELECT COUNT(*) FROM appointments a3 WHERE a3.client_id = c.id AND a3.barber_id = a.barber_id AND a3.status = 'completed') AS client_cuts_with_barber
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN users b ON a.barber_id = b.id
    JOIN users c ON a.client_id = c.id
  `;
  const params = [];
  if (req.user.role === 'barber') {
    query += ' WHERE a.barber_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'client') {
    query += ' WHERE a.client_id = ?';
    params.push(req.user.id);
  }
  query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
  db.all(query, params, (err, appointments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(appointments);
  });
});

app.get('/api/appointments/calendar/:date', verifyToken, (req, res) => {
  db.all(`
    SELECT a.*, s.name as service_name, s.duration, c.name as client_name, b.name as barber_name
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN users c ON a.client_id = c.id
    JOIN users b ON a.barber_id = b.id
    WHERE a.appointment_date = ? AND a.status != ?
    ORDER BY a.appointment_time
  `, [req.params.date, 'cancelled'], (err, appointments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(appointments);
  });
});

app.get('/api/appointments/available/:barber_id/:date', verifyToken, (req, res) => {
  const { barber_id, date } = req.params;
  const { service_id } = req.query;
  const [y, mo, d] = date.split('-').map(Number);
  const dayOfWeek = new Date(y, mo - 1, d).getDay();

  const getDuration = service_id
    ? new Promise(r => db.get('SELECT duration FROM services WHERE id = ?', [service_id], (e, row) => r(row?.duration || 30)))
    : Promise.resolve(30);

  getDuration.then(duration => {
  db.all(
    'SELECT start_time, end_time, break_start, break_end FROM working_hours WHERE barber_id = ? AND day_of_week = ?',
    [barber_id, dayOfWeek],
    (err, hours) => {
      if (!hours || hours.length === 0) {
        return res.json({ available: [], message: t(reqLang(req), 'Barbeiro não trabalha este dia') });
      }
      Promise.all([
        new Promise(r => db.all(
          `SELECT a.appointment_time, s.duration FROM appointments a
           JOIN services s ON a.service_id = s.id
           WHERE a.barber_id = ? AND a.appointment_date = ? AND a.status IN (?, ?)`,
          [barber_id, date, 'pending', 'confirmed'],
          (err, rows) => r(rows || [])
        )),
        new Promise(r => db.all(
          'SELECT start_time, end_time FROM blocked_times WHERE barber_id = ? AND date = ?',
          [barber_id, date],
          (err, rows) => r(rows || [])
        )),
      ]).then(([booked, blocked]) => {
        const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const bookedRanges = booked.map(b => ({ start: toMin(b.appointment_time), end: toMin(b.appointment_time) + (b.duration || 30) }))
          .concat(blocked.map(b => ({ start: toMin(b.start_time), end: toMin(b.end_time) })));
        res.json({ available: generateTimes(hours[0], bookedRanges, duration, date) });
      });
    }
  );
  });
});

app.patch('/api/appointments/:id/status', verifyToken, (req, res) => {
  const { status } = req.body;
  db.get(
    'SELECT a.*, COALESCE(a.price, s.price) as price, s.duration, s.name as service_name FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.id = ?',
    [req.params.id],
    (err, apt) => {
      if (!apt) return res.status(404).json({ error: t(reqLang(req), 'Agendamento não encontrado') });
      const isOwner = apt.client_id === req.user.id;
      const isBarberOwner = req.user.role === 'barber' && apt.barber_id === req.user.id;
      if (req.user.role !== 'admin' && !isOwner && !isBarberOwner) {
        return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
      }
      if (status === 'cancelled' && ['cancelled', 'completed'].includes(apt.status)) {
        return res.status(400).json({ error: t(reqLang(req), 'Este agendamento não pode mais ser cancelado') });
      }
      db.run('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        if (isBarberOwner) {
          const statusTemplates = {
            confirmed: 'Seu agendamento de {servico} em {data} às {hora} foi confirmado pelo barbeiro.',
            completed: 'Seu atendimento de {servico} foi concluído. Que tal avaliar o serviço?',
            cancelled: 'Seu agendamento de {servico} em {data} às {hora} foi cancelado pelo barbeiro.',
          };
          const statusSettingKey = { confirmed: 'notif_confirm', completed: 'notif_review', cancelled: 'notif_cancel' };
          if (statusTemplates[status]) {
            isSettingEnabled(statusSettingKey[status], (enabled) => {
              if (enabled) criarNotificacao(apt.client_id, 'Atualização do agendamento', statusTemplates[status], status === 'cancelled' ? 'warning' : 'info',
                { servico: apt.service_name, data: apt.appointment_date, hora: apt.appointment_time });
            });
          }
          return res.json({ id: req.params.id, status });
        }

        // Cliente solicitando cancelamento do próprio agendamento: cobra taxa configurada pelo admin
        if (status === 'cancelled' && isOwner && req.user.role !== 'admin') {
          db.all("SELECT key, value FROM settings WHERE key IN ('cancel_fee','notif_cancel')", [], (errFee, rows) => {
            const s = Object.fromEntries((rows || []).map(r => [r.key, r.value]));
            const pct = s.cancel_fee !== undefined ? parseFloat(s.cancel_fee) : 20;
            const notifyEnabled = s.notif_cancel !== 'false';
            const fee = pct > 0 ? Math.round(apt.price * (pct / 100) * 100) / 100 : 0;

            if (fee > 0) {
              db.run('INSERT INTO payments (appointment_id, amount, method, status) VALUES (?, ?, ?, ?)', [apt.id, fee, 'cancellation_fee', 'pending']);
            }

            if (notifyEnabled) {
              const clienteTemplate = fee > 0
                ? 'Seu agendamento de {servico} em {data} às {hora} foi cancelado. Taxa de cancelamento de {pct}% ({valor}) foi gerada e deve ser paga.'
                : 'Seu agendamento de {servico} em {data} às {hora} foi cancelado.';
              const clienteParams = { servico: apt.service_name, data: apt.appointment_date, hora: apt.appointment_time, pct, valor: fmtBRL(fee) };
              criarNotificacao(apt.client_id, 'Cancelamento confirmado', clienteTemplate, fee > 0 ? 'warning' : 'info', clienteParams);

              const terceiroTemplate = '{cliente} cancelou o agendamento de {servico} em {data} às {hora}.' + (fee > 0 ? ' Taxa de {valor} gerada (pendente).' : '');
              const terceiroParams = { cliente: req.user.name || 'Um cliente', servico: apt.service_name, data: apt.appointment_date, hora: apt.appointment_time, valor: fmtBRL(fee) };
              criarNotificacao(apt.barber_id, 'Cancelamento de agendamento', terceiroTemplate, 'info', terceiroParams);
              db.all("SELECT id FROM users WHERE role = 'admin'", [], (errAdm, admins) => {
                (admins || []).forEach(a => criarNotificacao(a.id, 'Cancelamento de agendamento', terceiroTemplate, 'info', terceiroParams));
              });
            }

            res.json({ id: req.params.id, status, fee });
          });
        } else {
          res.json({ id: req.params.id, status });
        }
      });
    }
  );
});

app.delete('/api/appointments/:id', verifyToken, (req, res) => {
  db.get('SELECT * FROM appointments WHERE id = ?', [req.params.id], (err, apt) => {
    if (!apt) return res.status(404).json({ error: t(reqLang(req), 'Agendamento não encontrado') });
    if (apt.client_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
    }
    db.run('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: req.params.id, status: 'cancelled' });
    });
  });
});

// ─── Pagamentos ───────────────────────────────────────────────────────────────

app.get('/api/payments', verifyToken, (req, res) => {
  let query = 'SELECT p.*, a.appointment_date, a.appointment_time, s.name as service_name FROM payments p JOIN appointments a ON p.appointment_id = a.id JOIN services s ON a.service_id = s.id WHERE a.id IN (SELECT id FROM appointments';
  const params = [];
  if (req.user.role === 'client') {
    query += ' WHERE client_id = ?)';
    params.push(req.user.id);
  } else if (req.user.role === 'barber') {
    query += ' WHERE barber_id = ?)';
    params.push(req.user.id);
  } else {
    query += ')';
  }
  query += ' ORDER BY p.created_at DESC';
  db.all(query, params, (err, payments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(payments);
  });
});

app.post('/api/payments', verifyToken, (req, res) => {
  const { appointment_id, amount, method } = req.body;
  db.run(
    'INSERT INTO payments (appointment_id, amount, method, status) VALUES (?, ?, ?, ?)',
    [appointment_id, amount, method, 'completed'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.run('UPDATE appointments SET status = ? WHERE id = ?', ['completed', appointment_id]);
      res.status(201).json({ id: this.lastID, status: 'completed' });
    }
  );
});

// ─── Avaliações ───────────────────────────────────────────────────────────────

app.post('/api/reviews', verifyToken, verifyRole(['client']), (req, res) => {
  const { appointment_id, rating, comment } = req.body;
  if (!appointment_id || !rating) return res.status(400).json({ error: t(reqLang(req), 'Agendamento e nota são obrigatórios') });
  db.get('SELECT * FROM appointments WHERE id = ?', [appointment_id], (err, apt) => {
    if (!apt) return res.status(404).json({ error: t(reqLang(req), 'Agendamento não encontrado') });
    if (apt.client_id !== req.user.id) return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
    if (apt.status !== 'completed') return res.status(400).json({ error: t(reqLang(req), 'Só é possível avaliar atendimentos concluídos') });
    db.get('SELECT id FROM reviews WHERE appointment_id = ?', [appointment_id], (err, existing) => {
      if (existing) return res.status(409).json({ error: t(reqLang(req), 'Este atendimento já foi avaliado') });
      db.run(
        'INSERT INTO reviews (appointment_id, client_id, barber_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [appointment_id, apt.client_id, apt.barber_id, rating, comment || null],
        function(err) {
          if (err) {
            if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Este atendimento já foi avaliado') });
            return res.status(500).json({ error: err.message });
          }
          res.status(201).json({ id: this.lastID, appointment_id, rating, comment });
        }
      );
    });
  });
});

app.put('/api/reviews/:id', verifyToken, verifyRole(['client']), (req, res) => {
  const { rating, comment } = req.body;
  if (!rating) return res.status(400).json({ error: t(reqLang(req), 'Nota é obrigatória') });
  db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id], (err, review) => {
    if (!review) return res.status(404).json({ error: t(reqLang(req), 'Avaliação não encontrada') });
    if (review.client_id !== req.user.id) return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
    db.run('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?', [rating, comment || null, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(req.params.id), rating, comment: comment || null });
    });
  });
});

app.delete('/api/reviews/:id', verifyToken, verifyRole(['client']), (req, res) => {
  db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id], (err, review) => {
    if (!review) return res.status(404).json({ error: t(reqLang(req), 'Avaliação não encontrada') });
    if (review.client_id !== req.user.id) return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
    db.run('DELETE FROM reviews WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: t(reqLang(req), 'Avaliação removida') });
    });
  });
});

app.get('/api/barbers/:id/reviews', (req, res) => {
  db.all(`
    SELECT r.*, c.name as client_name
    FROM reviews r JOIN users c ON r.client_id = c.id
    WHERE r.barber_id = ? AND (r.hidden IS NULL OR r.hidden = 0) ORDER BY r.created_at DESC
  `, [req.params.id], (err, reviews) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(reviews);
  });
});

app.get('/api/reviews/recent', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT r.*, c.name as client_name, b.name as barber_name
    FROM reviews r
    JOIN users c ON r.client_id = c.id
    JOIN users b ON r.barber_id = b.id
    ORDER BY r.created_at DESC LIMIT 10
  `, (err, reviews) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(reviews);
  });
});

app.get('/api/reviews', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT r.*, c.name as client_name, b.name as barber_name, s.name as service_name
    FROM reviews r
    JOIN users c ON r.client_id = c.id
    JOIN users b ON r.barber_id = b.id
    JOIN appointments a ON r.appointment_id = a.id
    JOIN services s ON a.service_id = s.id
    ORDER BY r.created_at DESC
  `, (err, reviews) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(reviews);
  });
});

app.get('/api/reviews/mine', verifyToken, verifyRole(['barber', 'client']), (req, res) => {
  const column = req.user.role === 'barber' ? 'r.barber_id' : 'r.client_id';
  db.all(`
    SELECT r.*, c.name as client_name, b.name as barber_name, s.name as service_name
    FROM reviews r
    JOIN users c ON r.client_id = c.id
    JOIN users b ON r.barber_id = b.id
    JOIN appointments a ON r.appointment_id = a.id
    JOIN services s ON a.service_id = s.id
    WHERE ${column} = ?
    ORDER BY r.created_at DESC
  `, [req.user.id], (err, reviews) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(reviews);
  });
});

app.patch('/api/reviews/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  const { featured, hidden } = req.body;
  db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id], (err, review) => {
    if (!review) return res.status(404).json({ error: t(reqLang(req), 'Avaliação não encontrada') });
    const newFeatured = featured !== undefined ? (featured ? 1 : 0) : review.featured;
    const newHidden = hidden !== undefined ? (hidden ? 1 : 0) : review.hidden;
    db.run('UPDATE reviews SET featured = ?, hidden = ? WHERE id = ?', [newFeatured, newHidden, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(req.params.id), featured: !!newFeatured, hidden: !!newHidden });
    });
  });
});

app.patch('/api/reviews/:id/reply', verifyToken, verifyRole(['barber']), (req, res) => {
  const { reply } = req.body;
  db.get('SELECT * FROM reviews WHERE id = ?', [req.params.id], (err, review) => {
    if (!review) return res.status(404).json({ error: t(reqLang(req), 'Avaliação não encontrada') });
    if (review.barber_id !== req.user.id) return res.status(403).json({ error: t(reqLang(req), 'Acesso negado') });
    db.run('UPDATE reviews SET reply = ?, reply_at = CURRENT_TIMESTAMP WHERE id = ?', [reply || null, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: Number(req.params.id), reply });
    });
  });
});

// ─── Promoções ────────────────────────────────────────────────────────────────

app.get('/api/promotions', (req, res) => {
  db.all('SELECT * FROM promotions WHERE active = 1 AND valid_until > ?',
    [new Date().toISOString()], (err, promotions) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(promotions);
  });
});

app.post('/api/promotions', verifyToken, verifyRole(['admin']), (req, res) => {
  const { code, discount_type, discount_value, valid_until, max_uses } = req.body;
  db.run(
    'INSERT INTO promotions (code, discount_type, discount_value, valid_until, max_uses) VALUES (?, ?, ?, ?, ?)',
    [code, discount_type, discount_value, valid_until, max_uses],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, code });
    }
  );
});

app.post('/api/promotions/validate', (req, res) => {
  const { code } = req.body;
  db.get(
    `SELECT * FROM promotions WHERE code = ? AND active = 1 AND valid_until > ? AND uses_count < max_uses`,
    [code, new Date().toISOString()],
    (err, promo) => {
      if (!promo) return res.status(404).json({ error: t(reqLang(req), 'Cupom inválido') });
      res.json({ code: promo.code, discount_type: promo.discount_type, discount_value: promo.discount_value });
    }
  );
});

// ─── Fila de espera ───────────────────────────────────────────────────────────

app.get('/api/waitlist/mine', verifyToken, (req, res) => {
  db.all(`
    SELECT w.*, s.name as service_name, b.name as barber_name
    FROM waitlist w
    JOIN services s ON w.service_id = s.id
    JOIN users b ON w.barber_id = b.id
    WHERE w.client_id = ?
    ORDER BY w.created_at DESC
  `, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/waitlist', verifyToken, (req, res) => {
  const { service_id, barber_id, preferred_date } = req.body;
  const client_id = req.user.id;
  db.get(
    'SELECT COUNT(*) as count FROM waitlist WHERE service_id = ? AND barber_id = ? AND preferred_date = ?',
    [service_id, barber_id, preferred_date],
    (err, result) => {
      const position = (result?.count || 0) + 1;
      db.run(
        'INSERT INTO waitlist (client_id, service_id, barber_id, preferred_date, position) VALUES (?, ?, ?, ?, ?)',
        [client_id, service_id, barber_id, preferred_date, position],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ id: this.lastID, position });
        }
      );
    }
  );
});

app.delete('/api/waitlist/:id', verifyToken, (req, res) => {
  db.run('DELETE FROM waitlist WHERE id = ? AND client_id = ?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: t(reqLang(req), 'Removido da fila') });
  });
});

// ─── Dashboard & Relatórios ───────────────────────────────────────────────────

app.get('/api/dashboard/stats', verifyToken, verifyRole(['admin']), (req, res) => {
  Promise.all([
    new Promise(r => db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['client'], (e, row) => r(row?.count || 0))),
    new Promise(r => db.get('SELECT COUNT(*) as count FROM appointments WHERE status = ?', ['completed'], (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT SUM(COALESCE(a.price, s.price)) as total FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.status = 'completed' AND a.appointment_date >= CURRENT_DATE - INTERVAL '30 days'`, (e, row) => r(row?.total || 0))),
    new Promise(r => db.get('SELECT COUNT(*) as count FROM appointments WHERE status = ?', ['pending'], (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'client' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '6 days'`, (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'client' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '13 days' AND created_at < CURRENT_TIMESTAMP - INTERVAL '6 days'`, (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND appointment_date >= CURRENT_DATE - INTERVAL '6 days'`, (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT COUNT(*) as count FROM appointments WHERE status = 'completed' AND appointment_date >= CURRENT_DATE - INTERVAL '13 days' AND appointment_date < CURRENT_DATE - INTERVAL '6 days'`, (e, row) => r(row?.count || 0))),
    new Promise(r => db.get(`SELECT SUM(COALESCE(a.price, s.price)) as total FROM appointments a JOIN services s ON a.service_id = s.id WHERE a.status = 'completed' AND a.appointment_date >= CURRENT_DATE - INTERVAL '60 days' AND a.appointment_date < CURRENT_DATE - INTERVAL '30 days'`, (e, row) => r(row?.total || 0))),
    new Promise(r => db.all(`
      SELECT b.id, b.name, COUNT(a.id) as completed, AVG(r.rating) as rating, COUNT(r.id) as reviews
      FROM users b
      LEFT JOIN appointments a ON b.id = a.barber_id AND a.status = 'completed'
      LEFT JOIN reviews r ON a.id = r.appointment_id
      WHERE b.role = 'barber' GROUP BY b.id
    `, (e, rows) => r(rows || []))),
    new Promise(r => db.all(`
      SELECT s.id, s.name, COUNT(a.id) as completed
      FROM services s
      LEFT JOIN appointments a ON s.id = a.service_id AND a.status = 'completed'
      GROUP BY s.id ORDER BY completed DESC LIMIT 4
    `, (e, rows) => r(rows || []))),
    new Promise(r => db.all(`
      SELECT date(appointment_date) as day,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM appointments
      WHERE appointment_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY day
    `, (e, rows) => r(rows || []))),
    new Promise(r => db.all(`
      SELECT date(a.appointment_date) as day, SUM(COALESCE(a.price, s.price)) as total
      FROM appointments a JOIN services s ON a.service_id = s.id
      WHERE a.status = 'completed' AND a.appointment_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY day
    `, (e, rows) => r(rows || []))),
  ]).then(([clients, completed, revenue, pending, newClients7d, newClientsPrev7d, completed7d, completedPrev7d, revenuePrev30d, barbers, topServices, aptByDay, revByDay]) => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const aptMap = Object.fromEntries(aptByDay.map(r => [r.day, r]));
    const revMap = Object.fromEntries(revByDay.map(r => [r.day, r.total]));
    const appointments_chart = {
      labels: last7,
      completed: last7.map(d => aptMap[d]?.completed || 0),
      pending: last7.map(d => aptMap[d]?.pending || 0),
    };
    const revenue_chart = {
      labels: last7,
      values: last7.map(d => revMap[d] || 0),
    };
    res.json({
      total_clients: clients, completed_appointments: completed, revenue, pending_appointments: pending,
      barber_stats: barbers, top_services: topServices, appointments_chart, revenue_chart,
      new_clients_7d: newClients7d, new_clients_prev_7d: newClientsPrev7d,
      completed_7d: completed7d, completed_prev_7d: completedPrev7d, revenue_prev_30d: revenuePrev30d,
    });
  });
});

app.get('/api/admin/backup', verifyToken, verifyRole(['admin']), (req, res) => {
  logEvent('INFO', 'Backup solicitado por {usuario}', { usuario: req.user.name || req.user.email });
  res.status(501).json({ message: t(reqLang(req), 'Backups são feitos automaticamente pelos snapshots do Aurora PostgreSQL. Não há mais um arquivo local para baixar.') });
});

app.get('/api/admin/system-info', verifyToken, verifyRole(['admin']), (req, res) => {
  res.json({
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
    database: 'PostgreSQL (Aurora)',
    node_version: process.version,
    uptime_seconds: Math.floor((Date.now() - serverStartedAt.getTime()) / 1000),
    started_at: serverStartedAt.toISOString(),
  });
});

app.get('/api/admin/system-log', verifyToken, verifyRole(['admin']), (req, res) => {
  const lang = reqLang(req);
  res.json(systemLog.map(l => ({ time: l.time, level: l.level, message: t(lang, l.key, l.params) })));
});

app.delete('/api/admin/system-log', verifyToken, verifyRole(['admin']), (req, res) => {
  systemLog.length = 0;
  logEvent('INFO', 'Log limpo por {usuario}', { usuario: req.user.name || req.user.email });
  res.json({ ok: true });
});

app.get('/api/clients', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(
    `SELECT
       u.id, u.name, u.email, u.phone, u.document, u.photo_url, u.is_vip, u.created_at,
       COALESCE((SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id), 0) AS total_appointments,
       COALESCE((SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id AND a.status = 'completed'), 0) AS total_visits,
       COALESCE((SELECT COUNT(*) FROM appointments a WHERE a.client_id = u.id AND a.status = 'cancelled'), 0) AS total_cancelled,
       COALESCE((SELECT SUM(COALESCE(a.price, s.price)) FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.client_id = u.id AND a.status = 'completed'), 0) AS total_spent,
       (SELECT a.appointment_date FROM appointments a WHERE a.client_id = u.id AND a.status = 'completed' ORDER BY a.appointment_date DESC LIMIT 1) AS last_visit,
       (SELECT b.name FROM appointments a JOIN users b ON b.id = a.barber_id WHERE a.client_id = u.id AND a.status = 'completed' GROUP BY a.barber_id, b.name ORDER BY COUNT(*) DESC LIMIT 1) AS favorite_barber,
       (SELECT s.name FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.client_id = u.id AND a.status = 'completed' GROUP BY a.service_id, s.name ORDER BY COUNT(*) DESC LIMIT 1) AS favorite_service,
       (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM reviews r WHERE r.client_id = u.id) AS avg_rating_given
     FROM users u
     WHERE u.role = 'client'
     ORDER BY u.created_at DESC`,
    (err, clients) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(clients);
    }
  );
});

app.get('/api/admin/clients/:id/appointments', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.status, s.name AS service_name, COALESCE(a.price, s.price) as price, b.name AS barber_name
     FROM appointments a
     JOIN services s ON s.id = a.service_id
     JOIN users b ON b.id = a.barber_id
     WHERE a.client_id = ?
     ORDER BY a.appointment_date DESC, a.appointment_time DESC
     LIMIT 20`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.patch('/api/admin/clients/:id/vip', verifyToken, verifyRole(['admin']), (req, res) => {
  const isVip = req.body.is_vip ? 1 : 0;
  db.run('UPDATE users SET is_vip = ? WHERE id = ? AND role = ?', [isVip, req.params.id, 'client'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: t(reqLang(req), 'Cliente não encontrado') });
    res.json({ id: Number(req.params.id), is_vip: !!isVip });
  });
});

app.put('/api/clients/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  const { name, email, phone, document } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: t(reqLang(req), 'Nome e e-mail são obrigatórios') });
  }
  const clientId = req.params.id;
  const normalizedEmail = email.trim().toLowerCase();
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;

  db.get('SELECT id FROM users WHERE id = ? AND role = ?', [clientId, 'client'], (err, client) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!client) return res.status(404).json({ error: t(reqLang(req), 'Cliente não encontrado') });

    const applyUpdate = () => {
      db.run(
        'UPDATE users SET name = ?, email = ?, phone = ?, document = ? WHERE id = ?',
        [name, normalizedEmail, phone || null, document || null, clientId],
        function(err2) {
          if (err2) {
            if (err2.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'E-mail ou documento já cadastrado para outro usuário') });
            return res.status(500).json({ error: t(reqLang(req), 'Erro ao atualizar cliente') });
          }
          res.json({ id: Number(clientId), name, email: normalizedEmail, phone: phone || null, document: document || null });
        }
      );
    };

    db.get(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ?',
      [normalizedEmail, clientId],
      (err3, existingEmail) => {
        if (existingEmail) return res.status(409).json({ error: t(reqLang(req), 'E-mail já cadastrado para outro usuário') });
        if (!phoneDigits) return applyUpdate();

        db.get(
          `SELECT id FROM users WHERE id != ? AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`,
          [clientId, phoneDigits],
          (err4, existingPhone) => {
            if (existingPhone) return res.status(409).json({ error: t(reqLang(req), 'Telefone já cadastrado para outro usuário') });
            applyUpdate();
          }
        );
      }
    );
  });
});

app.delete('/api/clients/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  const clientId = req.params.id;
  db.get('SELECT id FROM users WHERE id = ? AND role = ?', [clientId, 'client'], (err, client) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!client) return res.status(404).json({ error: t(reqLang(req), 'Cliente não encontrado') });

    db.get('SELECT COUNT(*) as count FROM appointments WHERE client_id = ?', [clientId], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (row.count > 0) {
        return res.status(409).json({ error: t(reqLang(req), 'Não é possível excluir um cliente com agendamentos registrados. Considere apenas editar os dados dele.') });
      }
      db.run('DELETE FROM users WHERE id = ?', [clientId], (err3) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ message: t(reqLang(req), 'Cliente removido com sucesso') });
      });
    });
  });
});

app.get('/api/barbers', (req, res) => {
  db.all('SELECT id, name, email, phone, photo_url, specialty, bio, portfolio_photos, intro_video_url, instagram FROM users WHERE role = ? ORDER BY name', ['barber'], (err, barbers) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(barbers);
  });
});

app.post('/api/barbers', verifyToken, verifyRole(['admin']), (req, res) => {
  const { name, email, phone, password, force_password_change } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  const hashedPassword = bcrypt.hashSync(password, 10);
  const mustChangePassword = force_password_change !== false ? 1 : 0;
  db.run(
    'INSERT INTO users (name, email, phone, password, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, phone, hashedPassword, 'barber', mustChangePassword],
    function(err) {
      if (err) {
        if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Email já cadastrado') });
        return res.status(500).json({ error: err.message });
      }
      // Garante que o barbeiro já tenha uma escala padrão, evitando que o cliente veja
      // "nenhum horário disponível" em todas as datas até o barbeiro configurar a própria escala.
      seedDefaultSchedule(this.lastID);
      res.status(201).json({ id: this.lastID, name, email, phone, role: 'barber', must_change_password: !!mustChangePassword });
    }
  );
});

app.delete('/api/barbers/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  db.get('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'barber'], (err, barber) => {
    if (!barber) return res.status(404).json({ error: t(reqLang(req), 'Barbeiro não encontrado') });
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: t(reqLang(req), 'Barbeiro removido com sucesso') });
    });
  });
});

// ─── Horários de trabalho ─────────────────────────────────────────────────────

app.get('/api/barbers/:id/working-hours', verifyToken, (req, res) => {
  db.all('SELECT * FROM working_hours WHERE barber_id = ? ORDER BY day_of_week', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.put('/api/barbers/:id/working-hours', verifyToken, (req, res) => {
  const { id } = req.params;
  const { schedule } = req.body;
  if (!schedule || !Array.isArray(schedule)) return res.status(400).json({ error: t(reqLang(req), 'Schedule inválido') });
  db.run('DELETE FROM working_hours WHERE barber_id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: t(reqLang(req), 'Erro ao atualizar horários') });
    const rows = schedule.filter(s => !s.closed);
    Promise.all(rows.map(s => db.run(
      'INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
      [id, s.day_of_week, s.start_time, s.end_time]
    )))
      .then(() => res.json({ success: true }))
      .catch((err2) => res.status(500).json({ error: err2.message }));
  });
});

// ─── Ausências ────────────────────────────────────────────────────────────────

app.get('/api/absences', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT a.*, u.name as barber_name
    FROM absences a JOIN users u ON a.barber_id = u.id
    ORDER BY a.created_at DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/absences/me', verifyToken, verifyRole(['barber']), (req, res) => {
  db.all('SELECT * FROM absences WHERE barber_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/absences', verifyToken, verifyRole(['barber']), (req, res) => {
  const { start_date, end_date, reason } = req.body;
  if (!start_date || !end_date) return res.status(400).json({ error: t(reqLang(req), 'Datas de início e fim são obrigatórias') });
  db.run(
    'INSERT INTO absences (barber_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)',
    [req.user.id, start_date, end_date, reason || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, barber_id: req.user.id, start_date, end_date, reason, status: 'pending' });
    }
  );
});

app.patch('/api/absences/:id/status', verifyToken, verifyRole(['admin']), (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: t(reqLang(req), 'Status inválido') });
  db.run('UPDATE absences SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: t(reqLang(req), 'Ausência não encontrada') });
    res.json({ id: Number(req.params.id), status });
  });
});

app.delete('/api/absences/:id', verifyToken, verifyRole(['barber']), (req, res) => {
  db.get('SELECT * FROM absences WHERE id = ? AND barber_id = ?', [req.params.id, req.user.id], (err, absence) => {
    if (!absence) return res.status(404).json({ error: t(reqLang(req), 'Ausência não encontrada') });
    if (absence.status !== 'pending') return res.status(400).json({ error: t(reqLang(req), 'Apenas solicitações pendentes podem ser canceladas') });
    db.run('DELETE FROM absences WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: t(reqLang(req), 'Solicitação cancelada') });
    });
  });
});

// ─── Solicitações de folga (escala semanal) ───────────────────────────────────

app.get('/api/dayoff-requests', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT r.*, u.name as barber_name
    FROM dayoff_requests r JOIN users u ON r.barber_id = u.id
    ORDER BY r.created_at DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/dayoff-requests/me', verifyToken, verifyRole(['barber']), (req, res) => {
  db.all('SELECT * FROM dayoff_requests WHERE barber_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/dayoff-requests', verifyToken, verifyRole(['barber']), (req, res) => {
  const { day_of_week } = req.body;
  if (day_of_week === undefined || day_of_week === null || day_of_week < 0 || day_of_week > 6) {
    return res.status(400).json({ error: t(reqLang(req), 'Dia da semana inválido') });
  }
  db.get(
    "SELECT id FROM dayoff_requests WHERE barber_id = ? AND day_of_week = ? AND status = 'pending'",
    [req.user.id, day_of_week],
    (err, existing) => {
      if (err) return res.status(500).json({ error: err.message });
      if (existing) return res.status(400).json({ error: t(reqLang(req), 'Já existe uma solicitação pendente para este dia') });
      db.run(
        'INSERT INTO dayoff_requests (barber_id, day_of_week) VALUES (?, ?)',
        [req.user.id, day_of_week],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          db.all("SELECT id FROM users WHERE role = 'admin'", [], (errAdm, admins) => {
            (admins || []).forEach(a => {
              criarNotificacao(a.id, 'Solicitação de folga', '{nome} solicitou folga em {dia} na escala semanal.', 'info',
                { nome: req.user.name, diaSemanaIdx: day_of_week });
            });
          });
          res.status(201).json({ id: this.lastID, barber_id: req.user.id, day_of_week, status: 'pending' });
        }
      );
    }
  );
});

app.patch('/api/dayoff-requests/:id/status', verifyToken, verifyRole(['admin']), (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: t(reqLang(req), 'Status inválido') });
  db.get('SELECT * FROM dayoff_requests WHERE id = ?', [req.params.id], (err, request) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!request) return res.status(404).json({ error: t(reqLang(req), 'Solicitação não encontrada') });
    db.run('UPDATE dayoff_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const finish = () => {
        criarNotificacao(
          request.barber_id,
          status === 'approved' ? 'Folga aprovada' : 'Folga recusada',
          status === 'approved' ? 'Sua solicitação de folga em {dia} foi aprovada.' : 'Sua solicitação de folga em {dia} foi recusada.',
          status === 'approved' ? 'success' : 'warning',
          { diaSemanaIdx: request.day_of_week }
        );
        res.json({ id: Number(req.params.id), status });
      };
      if (status === 'approved') {
        db.run('DELETE FROM working_hours WHERE barber_id = ? AND day_of_week = ?', [request.barber_id, request.day_of_week], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          finish();
        });
      } else {
        finish();
      }
    });
  });
});

app.delete('/api/dayoff-requests/:id', verifyToken, verifyRole(['barber']), (req, res) => {
  db.get('SELECT * FROM dayoff_requests WHERE id = ? AND barber_id = ?', [req.params.id, req.user.id], (err, request) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!request) return res.status(404).json({ error: t(reqLang(req), 'Solicitação não encontrada') });
    if (request.status !== 'pending') return res.status(400).json({ error: t(reqLang(req), 'Apenas solicitações pendentes podem ser canceladas') });
    db.run('DELETE FROM dayoff_requests WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: t(reqLang(req), 'Solicitação cancelada') });
    });
  });
});

// ─── Horários bloqueados ──────────────────────────────────────────────────────

app.get('/api/blocked-times/by-date/:date', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(
    `SELECT bt.*, u.name as barber_name FROM blocked_times bt
     JOIN users u ON bt.barber_id = u.id
     WHERE bt.date = ? ORDER BY bt.start_time`,
    [req.params.date],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.get('/api/blocked-times/:barber_id/:date', verifyToken, verifyRole(['admin', 'barber']), (req, res) => {
  db.all(
    'SELECT * FROM blocked_times WHERE barber_id = ? AND date = ?',
    [req.params.barber_id, req.params.date],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post('/api/blocked-times', verifyToken, verifyRole(['admin']), (req, res) => {
  const { barber_id, date, start_time, end_time, reason } = req.body;
  db.run(
    'INSERT INTO blocked_times (barber_id, date, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?)',
    [barber_id, date, start_time, end_time, reason],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.delete('/api/blocked-times/:id', verifyToken, verifyRole(['admin']), (req, res) => {
  db.run('DELETE FROM blocked_times WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: t(reqLang(req), 'Bloqueio removido') });
  });
});

// ─── Configurações ────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', (err, settings) => {
    if (err) return res.status(500).json({ error: err.message });
    const obj = {};
    settings?.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  });
});

app.patch('/api/settings', verifyToken, verifyRole(['admin']), (req, res) => {
  const updates = req.body;
  const keys = Object.keys(updates);
  let done = 0;
  if (keys.length === 0) return res.json({ message: t(reqLang(req), 'Nada para atualizar') });
  keys.forEach(key => {
    db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, updates[key]], () => {
      done++;
      if (done === keys.length) res.json({ message: t(reqLang(req), 'Configurações atualizadas') });
    });
  });
});

// ─── Relatórios ───────────────────────────────────────────────────────────────

app.get('/api/reports/revenue', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT a.appointment_date as date, SUM(COALESCE(a.price, s.price)) as total, COUNT(*) as count
    FROM appointments a JOIN services s ON a.service_id = s.id
    WHERE a.status = 'completed'
    GROUP BY a.appointment_date ORDER BY date DESC
  `, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

app.get('/api/reports/appointments', verifyToken, verifyRole(['admin']), (req, res) => {
  db.all(`
    SELECT s.name as service, COUNT(*) as total,
      SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM appointments a JOIN services s ON a.service_id = s.id GROUP BY s.id
  `, (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// ─── Usuário logado ───────────────────────────────────────────────────────────

app.get('/api/me', verifyToken, (req, res) => {
  db.get('SELECT id, name, email, phone, role, address, document, photo_url, specialty, theme, language, birth_date, gender, is_vip, service_preferences, bio, portfolio_photos, intro_video_url, instagram, referral_code, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: t(reqLang(req), 'Usuário não encontrado') });
    res.json(user);
  });
});

// Gera (na primeira vez) e devolve o código de indicação do cliente logado.
// Idempotente: se já existir, retorna o mesmo — não invalida links já compartilhados.
app.post('/api/me/referral-code', verifyToken, (req, res) => {
  db.get('SELECT referral_code FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row && row.referral_code) return res.json({ referral_code: row.referral_code });
    const tryGenerate = (attemptsLeft) => {
      const code = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
      db.run('UPDATE users SET referral_code = ? WHERE id = ?', [code, req.user.id], function(genErr) {
        if (genErr) {
          if (genErr.code === '23505' && attemptsLeft > 0) return tryGenerate(attemptsLeft - 1);
          return res.status(500).json({ error: t(reqLang(req), 'Erro ao gerar código de indicação') });
        }
        res.json({ referral_code: code });
      });
    };
    tryGenerate(5);
  });
});

// Quantas indicações do cliente logado já se converteram em cadastro.
app.get('/api/referrals/me', verifyToken, (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = ?', [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: row ? row.count : 0 });
  });
});

app.patch('/api/me', verifyToken, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!current) return res.status(404).json({ error: t(reqLang(req), 'Usuário não encontrado') });
    const name = req.body.name ?? current.name;
    const phone = req.body.phone ?? current.phone;
    const address = req.body.address ?? current.address;
    const document = req.body.document !== undefined ? (req.body.document || null) : current.document;
    const specialty = req.body.specialty ?? current.specialty;
    const theme = req.body.theme === 'light' || req.body.theme === 'dark' ? req.body.theme : current.theme;
    const language = SUPPORTED_LANGS.includes(req.body.language) ? req.body.language : current.language;
    const birth_date = req.body.birth_date !== undefined ? req.body.birth_date : current.birth_date;
    const gender = req.body.gender !== undefined ? req.body.gender : current.gender;
    const service_preferences = req.body.service_preferences !== undefined ? JSON.stringify(req.body.service_preferences) : current.service_preferences;
    const bio = req.body.bio !== undefined ? req.body.bio : current.bio;
    const intro_video_url = req.body.intro_video_url !== undefined ? req.body.intro_video_url : current.intro_video_url;
    const instagram = req.body.instagram !== undefined ? req.body.instagram : current.instagram;

    // Foto de perfil: base64 novo sobe pro S3 (ou fica como está, sem S3 configurado em dev);
    // a antiga só é apagada do bucket depois que a nova já está salva.
    let photo_url = current.photo_url;
    if (req.body.photo_url === null) {
      await deletePhotoFromS3(current.photo_url);
      photo_url = null;
    } else if (req.body.photo_url !== undefined && req.body.photo_url !== current.photo_url) {
      photo_url = await uploadPhotoToS3(req.body.photo_url, 'avatars');
      if (photo_url !== current.photo_url) await deletePhotoFromS3(current.photo_url);
    }

    // Portfólio (barbeiro): cada foto nova em base64 sobe pro S3; fotos removidas da lista são
    // apagadas do bucket.
    let portfolio_photos = current.portfolio_photos;
    if (req.body.portfolio_photos !== undefined) {
      const oldUrls = current.portfolio_photos ? JSON.parse(current.portfolio_photos) : [];
      const newUrls = await Promise.all((req.body.portfolio_photos || []).map(p => uploadPhotoToS3(p, 'portfolio')));
      await Promise.all(oldUrls.filter(u => !newUrls.includes(u)).map(deletePhotoFromS3));
      portfolio_photos = JSON.stringify(newUrls);
    }

    await db.run(
      'UPDATE users SET name=?, phone=?, address=?, document=?, specialty=?, photo_url=?, theme=?, language=?, birth_date=?, gender=?, service_preferences=?, bio=?, portfolio_photos=?, intro_video_url=?, instagram=? WHERE id=?',
      [name, phone, address, document, specialty, photo_url, theme, language, birth_date, gender, service_preferences, bio, portfolio_photos, intro_video_url, instagram, req.user.id]
    );
    res.json({ message: t(reqLang(req), 'Perfil atualizado'), name, phone, address, document, specialty, photo_url, theme, language, birth_date, gender, service_preferences, bio, portfolio_photos, intro_video_url, instagram });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: t(reqLang(req), 'Este CPF já está cadastrado em outra conta.') });
    res.status(500).json({ error: err.message });
  }
});

// ─── Notificações (in-app + push) ──────────────────────────────────────────────

const fmtBRL = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

// Envia um push para todas as assinaturas ativas de um usuário (silencioso se ele não tiver nenhuma)
function sendPushToUser(userId, title, body, extra = {}) {
  db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId], (err, subs) => {
    if (err || !subs) return;
    const payload = JSON.stringify({ title, body, ...extra });
    subs.forEach(sub => {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      webpush.sendNotification(subscription, payload).catch(pushErr => {
        if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
          db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
        }
      });
    });
  });
}

// Lê um toggle da tabela settings (chave/valor 'true'/'false'). Sem registro = habilitado por padrão.
function isSettingEnabled(key, cb) {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    cb(!row || row.value !== 'false');
  });
}

// Cria notificação in-app (histórico) e dispara push em paralelo, se o canal push estiver habilitado.
// `titleKey`/`messageTemplate` são os textos originais em português (chaves de tradução);
// `params` alimenta a interpolação e é resolvido no idioma do DESTINATÁRIO (não de quem disparou
// a notificação), buscado na hora a partir da coluna users.language.
function criarNotificacao(userId, titleKey, messageTemplate, type = 'info', params = {}) {
  db.get('SELECT language FROM users WHERE id = ?', [userId], (err, row) => {
    const lang = (row && row.language) || 'pt-BR';
    const resolvedParams = { ...params };
    if (resolvedParams.diaSemanaIdx !== undefined) {
      resolvedParams.dia = weekdayName(lang, resolvedParams.diaSemanaIdx);
    }
    const title = t(lang, titleKey, resolvedParams);
    const message = t(lang, messageTemplate, resolvedParams);
    db.run('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)', [userId, title, message, type]);
    isSettingEnabled('channel_push', (enabled) => {
      if (enabled) sendPushToUser(userId, title, message);
    });
  });
}

app.get('/api/notifications', verifyToken, (req, res) => {
  db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.patch('/api/notifications/:id/read', verifyToken, (req, res) => {
  db.run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, read: true });
  });
});

app.patch('/api/notifications/read-all', verifyToken, (req, res) => {
  db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// ─── Push notifications (lembrete de agendamento) ─────────────────────────────

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', verifyToken, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: t(reqLang(req), 'Assinatura de push inválida') });
  }
  db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [req.user.id, endpoint, keys.p256dh, keys.auth],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: t(reqLang(req), 'Inscrito para notificações') });
    }
  );
});

app.delete('/api/push/subscribe', verifyToken, (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: t(reqLang(req), 'Endpoint obrigatório') });
  db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: t(reqLang(req), 'Inscrição removida') });
  });
});

// Verifica a cada minuto agendamentos que entram na janela de 1h e envia push aos clientes
function sendAppointmentReminders() {
  isSettingEnabled('notif_reminder', (enabled) => {
    if (!enabled) return;
    db.all(
      `SELECT a.id, a.client_id, a.appointment_date, a.appointment_time, s.name as service_name, b.name as barber_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       JOIN users b ON a.barber_id = b.id
       WHERE a.status IN ('pending', 'confirmed') AND a.reminded_at IS NULL`,
      [],
      (err, rows) => {
        if (err || !rows) return;
        const now = new Date();
        rows.forEach(apt => {
          const aptDateTime = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
          const diffMin = (aptDateTime - now) / 60000;
          if (diffMin > 65 || diffMin < 55) return;

          db.run('UPDATE appointments SET reminded_at = CURRENT_TIMESTAMP WHERE id = ?', [apt.id]);
          db.get('SELECT language FROM users WHERE id = ?', [apt.client_id], (langErr, userRow) => {
            const lang = (userRow && userRow.language) || 'pt-BR';
            db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', [apt.client_id], (err, subs) => {
              if (err || !subs) return;
              const payload = JSON.stringify({
                title: t(lang, 'Seu horário começa em 1 hora!'),
                body: t(lang, '{servico} com {barbeiro} às {hora}. Confirme sua presença no app.',
                  { servico: apt.service_name, barbeiro: apt.barber_name, hora: apt.appointment_time }),
                appointmentId: apt.id,
              });
              subs.forEach(sub => {
                const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
                webpush.sendNotification(subscription, payload).catch(err => {
                  if (err.statusCode === 404 || err.statusCode === 410) {
                    db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
                  }
                });
              });
            });
          });
        });
      }
    );
  });
}
setInterval(sendAppointmentReminders, 60 * 1000);

// Verifica diariamente aniversariantes e envia notificação (uma vez por ano por usuário)
function checkBirthdays() {
  isSettingEnabled('notif_birthday', (enabled) => {
    if (!enabled) return;
    const now = new Date();
    const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    db.all(
      `SELECT id, name, birth_date FROM users
       WHERE birth_date IS NOT NULL AND birth_date != ''
       AND (last_birthday_notif_year IS NULL OR last_birthday_notif_year != ?)`,
      [year],
      (err, rows) => {
        if (err || !rows) return;
        rows.forEach(u => {
          if ((u.birth_date || '').slice(5, 10) !== mmdd) return;
          criarNotificacao(u.id, 'Feliz aniversário!',
            'Parabéns, {nome}! A equipe BarberPro deseja um ótimo dia. Que tal comemorar com um corte novo?', 'success',
            { nome: (u.name || '').split(' ')[0] });
          db.run('UPDATE users SET last_birthday_notif_year = ? WHERE id = ?', [year, u.id]);
        });
      }
    );
  });
}
setInterval(checkBirthdays, 60 * 60 * 1000);
checkBirthdays();

// ─── Módulo Açougue (dashboard financeiro/fiscal, role 'acougue') ────────────
// Isolado do restante da API: nenhuma rota abaixo é acessível por client/barber/admin.

const acougueOnly = [verifyToken, verifyRole(['acougue'])];

// Campos fiscais do produto que viajam para a NFC-e. Ficam numa lista só porque três lugares
// precisam da mesma ordem (INSERT, UPDATE e o formulário do front) e divergir entre eles
// gravaria valor de um campo na coluna de outro.
const ACOUGUE_FISCAL_FIELDS = ['ncm', 'cfop', 'cest', 'origem', 'icms_cst', 'icms_aliquota', 'icms_reducao_bc', 'pis_cst', 'cofins_cst'];

function monthRange(month, year) {
  const m = String(month).padStart(2, '0');
  const start = `${year}-${m}-01`;
  const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
  const nextYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function getAcougueSettingsMap() {
  const rows = await db.all("SELECT key, value FROM settings WHERE key LIKE 'acougue_%'", []);
  const map = {};
  rows.forEach(r => { map[r.key.replace('acougue_', '')] = r.value; });
  return map;
}

// PIS/COFINS não-cumulativo (Lucro Real): débito sobre saídas, crédito sobre entradas
// (compra de carcaça — Lei 10.833/2003 permite crédito sobre insumos), valor a recolher é a
// diferença positiva entre os dois. "Saída fiscal" aqui é o que sai da porta pro comprador —
// cortes com destino 'venda_direta' (atacado, fora do caixa) + vendas do caixa. Cortes que só
// vão pro estoque (destino 'estoque') não contam ainda, porque a saída de fato acontece depois,
// quando o produto é vendido no caixa — contá-los nos dois pontos duplicaria a base de cálculo.
async function calcApuracao(month, year) {
  const { start, end } = monthRange(month, year);
  const settings = await getAcougueSettingsMap();
  const pisRate = (Number(settings.pis_rate) || 1.65) / 100;
  const cofinsRate = (Number(settings.cofins_rate) || 7.6) / 100;

  const { rows: [{ total: entradasTotal }] } = await pool.query(
    `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_carcass_entries WHERE entry_date >= $1 AND entry_date < $2`,
    [start, end]
  );
  const { rows: [{ total: cortesVendaTotal }] } = await pool.query(
    `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_cuts WHERE output_date >= $1 AND output_date < $2 AND destination = 'venda_direta'`,
    [start, end]
  );
  const { rows: [{ total: caixaTotal }] } = await pool.query(
    `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_sales WHERE created_at >= $1 AND created_at < $2 AND status = 'concluida'`,
    [start, end]
  );

  const entradas_total = Number(entradasTotal);
  const saidas_total = Number(cortesVendaTotal) + Number(caixaTotal);
  const pis_credit = round2(entradas_total * pisRate);
  const pis_debit = round2(saidas_total * pisRate);
  const cofins_credit = round2(entradas_total * cofinsRate);
  const cofins_debit = round2(saidas_total * cofinsRate);

  return {
    month: Number(month), year: Number(year), entradas_total, saidas_total,
    pis_rate: round2(pisRate * 100), cofins_rate: round2(cofinsRate * 100),
    pis_credit, pis_debit, pis_due: round2(Math.max(0, pis_debit - pis_credit)),
    cofins_credit, cofins_debit, cofins_due: round2(Math.max(0, cofins_debit - cofins_credit)),
  };
}

/* ---- Dashboard ---- */
app.get('/api/acougue/dashboard', ...acougueOnly, async (req, res) => {
  try {
    const now = new Date();
    const apuracao = await calcApuracao(now.getMonth() + 1, now.getFullYear());
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { rows: [{ total: caixaHoje, count: vendasHoje }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total, COUNT(*)::int as count FROM acougue_sales
       WHERE created_at >= $1::date AND created_at < $1::date + INTERVAL '1 day' AND status = 'concluida'`,
      [todayStr]
    );
    const { rows: [{ count: notasPendentes }] } = await pool.query(
      `SELECT COUNT(*)::int as count FROM acougue_invoices WHERE status IN ('rascunho', 'processando')`
    );
    const ultimas_entradas = await db.all('SELECT * FROM acougue_carcass_entries ORDER BY entry_date DESC, id DESC LIMIT 5', []);
    const ultimas_saidas = await db.all('SELECT * FROM acougue_cuts ORDER BY output_date DESC, id DESC LIMIT 5', []);

    res.json({
      entradas_mes: apuracao.entradas_total,
      saidas_mes: apuracao.saidas_total,
      caixa_hoje: Number(caixaHoje),
      vendas_hoje: Number(vendasHoje),
      notas_pendentes: Number(notasPendentes),
      pis_cofins_a_recolher: round2(apuracao.pis_due + apuracao.cofins_due),
      ultimas_entradas,
      ultimas_saidas,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Produtos (catálogo usado pelo caixa) ---- */
app.get('/api/acougue/products', ...acougueOnly, async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM acougue_products WHERE active = 1 ORDER BY name', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/products/barcode/:code', ...acougueOnly, async (req, res) => {
  try {
    const product = await db.get('SELECT * FROM acougue_products WHERE barcode = ? AND active = 1', [req.params.code]);
    if (!product) return res.status(404).json({ error: t(reqLang(req), 'Produto não encontrado para este código de barras') });
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Leitura do bipador no caixa. Diferente de /products/barcode/:code (busca exata), aqui o
// código passa antes pelo decodificador de etiqueta de balança — é o que faz o pacote de
// 0,588 kg entrar no carrinho já com o peso certo, em vez de quantidade 1.
//
// Devolve sempre { product, quantity, scan } para o front não precisar saber qual dos dois
// tipos de código foi lido.
app.get('/api/acougue/products/scan/:code', ...acougueOnly, async (req, res) => {
  const lang = reqLang(req);
  const code = String(req.params.code || '').trim();
  try {
    const settings = await getAcougueSettingsMap();

    let parsed = null;
    try {
      parsed = scaleBarcode.parseScaleBarcode(code, scaleBarcode.configFromSettings(settings));
    } catch (parseErr) {
      // Etiqueta de balança corrompida ou layout mal configurado: erro do operador/instalação,
      // não erro de servidor — 400 com a mensagem já pronta pra mostrar no caixa.
      return res.status(400).json({ error: parseErr.message, code: parseErr.code });
    }

    if (!parsed) {
      // Não é etiqueta de balança: EAN de fábrica ou código digitado à mão.
      const product = await db.get('SELECT * FROM acougue_products WHERE barcode = ? AND active = 1', [code]);
      if (!product) return res.status(404).json({ error: t(lang, 'Produto não encontrado para este código de barras') });
      return res.json({ product, quantity: 1, scan: { type: 'barcode', barcode: code } });
    }

    const product = await db.get('SELECT * FROM acougue_products WHERE scale_code = ? AND active = 1', [parsed.scaleCode]);
    if (!product) {
      return res.status(404).json({
        error: `Nenhum produto cadastrado com o código de balança ${parsed.scaleCode}. Cadastre-o em Produtos para que a etiqueta seja reconhecida.`,
        scan: parsed,
      });
    }

    // Balança programada por PESO: a etiqueta traz os gramas, o preço/kg vem do cadastro.
    // Programada por PREÇO: a etiqueta traz o total em reais, e o peso é deduzido dividindo
    // pelo preço/kg — sem preço cadastrado não dá pra deduzir nada, então recusa.
    let quantity;
    if (parsed.valueType === 'peso_g') {
      quantity = parsed.weightKg;
    } else {
      if (!product.price || product.price <= 0) {
        return res.status(400).json({ error: `A balança está programada por preço, mas "${product.name}" não tem preço de venda cadastrado — não dá pra calcular o peso.` });
      }
      quantity = parsed.priceReais / product.price;
    }

    if (!(quantity > 0)) {
      return res.status(400).json({ error: 'Etiqueta com peso zerado — verifique a impressão da balança.' });
    }

    res.json({ product, quantity, scan: parsed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/products', ...acougueOnly, async (req, res) => {
  const { barcode, scale_code, name, category, unit, price, cost_price, stock_qty } = req.body;
  const fiscal = ACOUGUE_FISCAL_FIELDS.map(f => req.body[f] ?? null);
  if (!name || price === undefined) return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  // PLU é sempre comparado sem zeros à esquerda (a balança preenche com zeros, o cadastro não).
  const plu = scale_code ? String(Number(scale_code)) : null;
  if (scale_code && !/^\d+$/.test(String(scale_code).trim())) {
    return res.status(400).json({ error: 'O código de balança deve conter apenas números.' });
  }
  try {
    const { rows } = await db.run(
      `INSERT INTO acougue_products (barcode, scale_code, name, category, unit, price, cost_price, stock_qty, created_by, ${ACOUGUE_FISCAL_FIELDS.join(', ')})
       VALUES (${new Array(9 + ACOUGUE_FISCAL_FIELDS.length).fill('?').join(',')})`,
      [barcode || null, plu, name, category || 'corte', unit || 'kg', price, cost_price || 0, stock_qty || 0, req.user.id, ...fiscal]
    );
    res.status(201).json({ id: rows[0].id, barcode, scale_code: plu, name, category, unit, price, cost_price, stock_qty });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um produto ativo com este código de barras ou código de balança.' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/acougue/products/:id', ...acougueOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_products WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: t(reqLang(req), 'Produto não encontrado') });
    const next = {};
    ['barcode', 'scale_code', 'name', 'category', 'unit', 'price', 'cost_price', 'stock_qty', ...ACOUGUE_FISCAL_FIELDS]
      .forEach(f => { next[f] = req.body[f] !== undefined ? req.body[f] : current[f]; });
    if (next.scale_code !== null && next.scale_code !== undefined && next.scale_code !== '') {
      if (!/^\d+$/.test(String(next.scale_code).trim())) {
        return res.status(400).json({ error: 'O código de balança deve conter apenas números.' });
      }
      next.scale_code = String(Number(next.scale_code));
    } else {
      next.scale_code = null;
    }
    await db.run(
      `UPDATE acougue_products SET barcode=?, scale_code=?, name=?, category=?, unit=?, price=?, cost_price=?, stock_qty=?, ${ACOUGUE_FISCAL_FIELDS.map(f => `${f}=?`).join(', ')} WHERE id=?`,
      [next.barcode, next.scale_code, next.name, next.category, next.unit, next.price, next.cost_price, next.stock_qty, ...ACOUGUE_FISCAL_FIELDS.map(f => next[f] ?? null), req.params.id]
    );
    res.json({ id: Number(req.params.id), ...next });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um produto ativo com este código de barras ou código de balança.' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/acougue/products/:id', ...acougueOnly, async (req, res) => {
  try {
    await db.run('UPDATE acougue_products SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id), active: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Entrada de Carcaça ---- */
app.get('/api/acougue/carcass-entries', ...acougueOnly, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (month && year) {
      const { start, end } = monthRange(Number(month), Number(year));
      return res.json(await db.all('SELECT * FROM acougue_carcass_entries WHERE entry_date >= ? AND entry_date < ? ORDER BY entry_date DESC, id DESC', [start, end]));
    }
    res.json(await db.all('SELECT * FROM acougue_carcass_entries ORDER BY entry_date DESC, id DESC LIMIT 200', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/carcass-entries', ...acougueOnly, async (req, res) => {
  const { supplier_name, supplier_document, animal_type, weight_kg, unit_price, entry_date, notes } = req.body;
  if (!supplier_name || !weight_kg || !unit_price || !entry_date) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }
  const total_value = round2(Number(weight_kg) * Number(unit_price));
  try {
    const { rows } = await db.run(
      'INSERT INTO acougue_carcass_entries (supplier_name, supplier_document, animal_type, weight_kg, unit_price, total_value, entry_date, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [supplier_name, supplier_document || null, animal_type || null, weight_kg, unit_price, total_value, entry_date, notes || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id, supplier_name, supplier_document, animal_type, weight_kg, unit_price, total_value, entry_date, notes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/carcass-entries/:id', ...acougueOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_carcass_entries WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: t(reqLang(req), 'Registro não encontrado') });
    const next = {};
    ['supplier_name', 'supplier_document', 'animal_type', 'weight_kg', 'unit_price', 'entry_date', 'notes'].forEach(f => { next[f] = req.body[f] !== undefined ? req.body[f] : current[f]; });
    next.total_value = round2(Number(next.weight_kg) * Number(next.unit_price));
    await db.run(
      'UPDATE acougue_carcass_entries SET supplier_name=?, supplier_document=?, animal_type=?, weight_kg=?, unit_price=?, total_value=?, entry_date=?, notes=? WHERE id=?',
      [next.supplier_name, next.supplier_document, next.animal_type, next.weight_kg, next.unit_price, next.total_value, next.entry_date, next.notes, req.params.id]
    );
    res.json({ id: Number(req.params.id), ...next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/acougue/carcass-entries/:id', ...acougueOnly, async (req, res) => {
  try {
    await db.run('DELETE FROM acougue_carcass_entries WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Saída de Cortes ---- */
app.get('/api/acougue/cuts', ...acougueOnly, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (month && year) {
      const { start, end } = monthRange(Number(month), Number(year));
      return res.json(await db.all('SELECT * FROM acougue_cuts WHERE output_date >= ? AND output_date < ? ORDER BY output_date DESC, id DESC', [start, end]));
    }
    res.json(await db.all('SELECT * FROM acougue_cuts ORDER BY output_date DESC, id DESC LIMIT 200', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Destino 'estoque' soma o peso ao produto vinculado (fica disponível pro caixa); 'venda_direta'
// e 'perda' não mexem em estoque — o primeiro é saída direta (ex: venda no atacado fora do
// caixa), o segundo é quebra/descarte. Edições via PATCH não reconciliam estoque retroativamente.
app.post('/api/acougue/cuts', ...acougueOnly, async (req, res) => {
  const { carcass_entry_id, product_id, cut_name, weight_kg, unit_price, output_date, destination, notes } = req.body;
  if (!cut_name || !weight_kg || !unit_price || !output_date) {
    return res.status(400).json({ error: t(reqLang(req), 'Campos obrigatórios faltando') });
  }
  const dest = ['estoque', 'venda_direta', 'perda'].includes(destination) ? destination : 'estoque';
  const total_value = round2(Number(weight_kg) * Number(unit_price));
  try {
    const { rows } = await db.run(
      'INSERT INTO acougue_cuts (carcass_entry_id, product_id, cut_name, weight_kg, unit_price, total_value, output_date, destination, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [carcass_entry_id || null, product_id || null, cut_name, weight_kg, unit_price, total_value, output_date, dest, notes || null, req.user.id]
    );
    if (dest === 'estoque' && product_id) {
      await db.run('UPDATE acougue_products SET stock_qty = stock_qty + ? WHERE id = ?', [weight_kg, product_id]);
    }
    res.status(201).json({ id: rows[0].id, carcass_entry_id, product_id, cut_name, weight_kg, unit_price, total_value, output_date, destination: dest, notes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/cuts/:id', ...acougueOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_cuts WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: t(reqLang(req), 'Registro não encontrado') });
    const next = {};
    ['carcass_entry_id', 'product_id', 'cut_name', 'weight_kg', 'unit_price', 'output_date', 'destination', 'notes'].forEach(f => { next[f] = req.body[f] !== undefined ? req.body[f] : current[f]; });
    next.total_value = round2(Number(next.weight_kg) * Number(next.unit_price));
    await db.run(
      'UPDATE acougue_cuts SET carcass_entry_id=?, product_id=?, cut_name=?, weight_kg=?, unit_price=?, total_value=?, output_date=?, destination=?, notes=? WHERE id=?',
      [next.carcass_entry_id, next.product_id, next.cut_name, next.weight_kg, next.unit_price, next.total_value, next.output_date, next.destination, next.notes, req.params.id]
    );
    res.json({ id: Number(req.params.id), ...next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/acougue/cuts/:id', ...acougueOnly, async (req, res) => {
  try {
    await db.run('DELETE FROM acougue_cuts WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Caixa (vendas via leitor de código de barras) ---- */
app.get('/api/acougue/sales', ...acougueOnly, async (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      return res.json(await db.all(`SELECT * FROM acougue_sales WHERE created_at >= ?::date AND created_at < ?::date + INTERVAL '1 day' ORDER BY created_at DESC`, [date, date]));
    }
    res.json(await db.all('SELECT * FROM acougue_sales ORDER BY created_at DESC LIMIT 200', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/sales/:id', ...acougueOnly, async (req, res) => {
  try {
    const sale = await db.get('SELECT * FROM acougue_sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: t(reqLang(req), 'Venda não encontrada') });
    const items = await db.all('SELECT * FROM acougue_sale_items WHERE sale_id = ?', [req.params.id]);
    res.json({ ...sale, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Transação real (BEGIN/COMMIT) porque mexe em dinheiro e estoque ao mesmo tempo — um erro no
// meio do loop de itens não pode deixar a venda "meio registrada" com estoque decrementado sem
// a venda existir, ou vice-versa.
app.post('/api/acougue/sales', ...acougueOnly, async (req, res) => {
  const { items, payment_method } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: t(reqLang(req), 'Informe ao menos um item') });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolvedItems = [];
    let total = 0;
    for (const it of items) {
      const quantity = Number(it.quantity);
      if (!quantity || quantity <= 0) throw Object.assign(new Error(t(reqLang(req), 'Quantidade inválida em um dos itens')), { code: 'BAD_INPUT' });
      const { rows } = await client.query(
        it.barcode ? 'SELECT * FROM acougue_products WHERE barcode = $1 AND active = 1' : 'SELECT * FROM acougue_products WHERE id = $1 AND active = 1',
        [it.barcode || it.product_id]
      );
      const product = rows[0];
      if (!product) throw Object.assign(new Error(t(reqLang(req), 'Produto não encontrado: {code}', { code: it.barcode || it.product_id })), { code: 'BAD_INPUT' });
      const subtotal = round2(product.price * quantity);
      total += subtotal;
      resolvedItems.push({ product, quantity, subtotal });
    }
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int as count FROM acougue_sales');
    const saleNumber = `V${String(count + 1).padStart(6, '0')}`;
    const { rows: [sale] } = await client.query(
      'INSERT INTO acougue_sales (sale_number, total_value, payment_method, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [saleNumber, round2(total), payment_method || 'dinheiro', req.user.id]
    );
    const savedItems = [];
    for (const ri of resolvedItems) {
      await client.query(
        'INSERT INTO acougue_sale_items (sale_id, product_id, product_name, barcode, quantity, unit_price, subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [sale.id, ri.product.id, ri.product.name, ri.product.barcode, ri.quantity, ri.product.price, ri.subtotal]
      );
      await client.query('UPDATE acougue_products SET stock_qty = stock_qty - $1 WHERE id = $2', [ri.quantity, ri.product.id]);
      savedItems.push({ product_id: ri.product.id, name: ri.product.name, barcode: ri.product.barcode, quantity: ri.quantity, unit_price: ri.product.price, subtotal: ri.subtotal });
    }
    await client.query('COMMIT');
    res.status(201).json({ ...sale, items: savedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === 'BAD_INPUT') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Emite a NFC-e (modelo 65) de uma venda já registrada no caixa.
//
// Fica separado do POST /sales de propósito: a venda precisa ser gravada mesmo que a emissão
// falhe (SEFAZ fora do ar, certificado vencido, internet caída). Se os dois estivessem na
// mesma transação, uma indisponibilidade da SEFAZ impediria o açougue de vender — que é
// exatamente o oposto do que o balcão precisa.
app.post('/api/acougue/sales/:id/nfce', ...acougueOnly, async (req, res) => {
  const lang = reqLang(req);
  try {
    const sale = await db.get('SELECT * FROM acougue_sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: t(lang, 'Venda não encontrada') });
    if (sale.status === 'cancelada') return res.status(409).json({ error: 'Esta venda está cancelada — não é possível emitir nota.' });

    const existing = await db.get("SELECT * FROM acougue_invoices WHERE ref_type = 'venda' AND ref_id = ? AND status IN ('autorizada','processando')", [sale.id]);
    if (existing) return res.status(409).json({ error: `Esta venda já tem a nota ${existing.numero || existing.id} (${existing.status}).`, invoice: existing });

    const items = await db.all(
      `SELECT si.*, p.ncm, p.cfop, p.cest, p.origem, p.icms_cst, p.icms_aliquota, p.icms_reducao_bc, p.pis_cst, p.cofins_cst, p.unit
       FROM acougue_sale_items si LEFT JOIN acougue_products p ON p.id = si.product_id WHERE si.sale_id = ?`, [sale.id]);

    // Barreira intencional: a SEFAZ rejeita a nota inteira se um único item estiver sem NCM,
    // CFOP ou CST. Recusar aqui, nomeando o produto, evita uma rejeição críptica lá na frente.
    const incompletos = items.filter(i => !i.ncm || !i.cfop || !i.icms_cst || !i.pis_cst || !i.cofins_cst);
    if (incompletos.length) {
      return res.status(422).json({
        error: `Faltam dados fiscais em: ${incompletos.map(i => i.product_name).join(', ')}. Preencha NCM, CFOP, CST do ICMS e CST de PIS/COFINS na aba Produtos.`,
        missing: incompletos.map(i => i.product_name),
      });
    }

    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj || !settings.ie) {
      return res.status(422).json({ error: t(lang, 'Preencha o CNPJ e a Inscrição Estadual do açougue em Configurações antes de emitir notas.') });
    }

    const payload = focusNfe.buildNFCePayload({
      emitente: {
        cnpj: settings.cnpj, inscricao_estadual: settings.ie, razao_social: settings.business_name,
        logradouro: settings.logradouro, numero: settings.numero, bairro: settings.bairro,
        municipio: settings.municipio, uf: settings.uf, cep: settings.cep,
      },
      itens: items.map(i => ({
        codigo: i.product_id, descricao: i.product_name, ncm: i.ncm, cfop: i.cfop, cest: i.cest,
        unidade: (i.unit || 'kg').toUpperCase(), quantidade: i.quantity,
        valor_unitario: i.unit_price, valor_total: i.subtotal,
        origem: i.origem, icms_cst: i.icms_cst, icms_aliquota: i.icms_aliquota,
        icms_base_calculo: i.subtotal, icms_reducao_bc: i.icms_reducao_bc,
        pis_cst: i.pis_cst, cofins_cst: i.cofins_cst,
      })),
      valor_total: sale.total_value,
      forma_pagamento: sale.payment_method,
      cpf_destinatario: req.body?.cpf || null,
    });

    const { rows } = await db.run(
      'INSERT INTO acougue_invoices (type, ref_type, ref_id, total_value, status, payload, created_by) VALUES (?,?,?,?,?,?,?)',
      ['saida', 'venda', sale.id, sale.total_value, 'rascunho', JSON.stringify(payload), req.user.id]
    );
    const invoiceId = rows[0].id;

    if (!focusNfe.isFocusConfigured()) {
      return res.status(201).json({
        id: invoiceId, status: 'rascunho', sale_id: sale.id,
        warning: 'Focus NFe não configurado — a nota ficou como rascunho e NÃO foi transmitida à SEFAZ. O cupom impresso sai sem valor fiscal.',
      });
    }

    const ref = `acougue-nfce-${invoiceId}`;
    try {
      const result = await focusNfe.emitNFCe(ref, payload);
      const status = result.data?.status === 'autorizado' ? 'autorizada' : (result.ok ? 'processando' : 'erro');
      await db.run(
        'UPDATE acougue_invoices SET status=?, focus_ref=?, chave_acesso=?, numero=?, serie=?, xml_url=?, danfe_url=?, error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [status, ref, result.data?.chave_nfe || null, result.data?.numero || null, result.data?.serie || null,
         result.data?.caminho_xml_nota_fiscal || null, result.data?.caminho_danfe || null,
         result.ok ? null : (result.data?.mensagem_sefaz || result.data?.mensagem || 'Erro na Focus NFe'), invoiceId]
      );
      const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [invoiceId]);
      res.status(201).json({ ...invoice, sale_id: sale.id, raw: result.data });
    } catch (focusErr) {
      await db.run("UPDATE acougue_invoices SET status = 'erro', error_message = ? WHERE id = ?", [focusErr.message, invoiceId]);
      res.status(502).json({ id: invoiceId, status: 'erro', sale_id: sale.id, error: focusErr.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/sales/:id/cancel', ...acougueOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [sale] } = await client.query('SELECT * FROM acougue_sales WHERE id = $1', [req.params.id]);
    if (!sale) { await client.query('ROLLBACK'); return res.status(404).json({ error: t(reqLang(req), 'Venda não encontrada') }); }
    if (sale.status === 'cancelada') { await client.query('ROLLBACK'); return res.status(409).json({ error: t(reqLang(req), 'Venda já está cancelada') }); }
    const { rows: saleItems } = await client.query('SELECT * FROM acougue_sale_items WHERE sale_id = $1', [sale.id]);
    for (const it of saleItems) {
      if (it.product_id) await client.query('UPDATE acougue_products SET stock_qty = stock_qty + $1 WHERE id = $2', [it.quantity, it.product_id]);
    }
    await client.query("UPDATE acougue_sales SET status = 'cancelada' WHERE id = $1", [sale.id]);
    await client.query('COMMIT');
    res.json({ id: sale.id, status: 'cancelada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* ---- Emissão de Nota (Focus NFe) ---- */
app.get('/api/acougue/nfe', ...acougueOnly, async (req, res) => {
  try {
    const { type, status } = req.query;
    const conditions = [];
    const params = [];
    if (type) { conditions.push('type = ?'); params.push(type); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    res.json(await db.all(`SELECT id, type, ref_type, ref_id, total_value, status, focus_ref, chave_acesso, numero, serie, xml_url, danfe_url, error_message, created_at FROM acougue_invoices ${where} ORDER BY created_at DESC LIMIT 200`, params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sem FOCUS_NFE_TOKEN configurado, a nota fica salva localmente como 'rascunho' — não há
// nenhuma transmissão à SEFAZ. Ver focus-nfe.js para o que falta pra emissão real funcionar.
app.post('/api/acougue/nfe', ...acougueOnly, async (req, res) => {
  const { type, ref_type, ref_id, total_value, itens, destinatario, natureza_operacao } = req.body;
  if (!type || !['entrada', 'saida'].includes(type) || !total_value) {
    return res.status(400).json({ error: t(reqLang(req), 'Tipo (entrada/saida) e valor total são obrigatórios') });
  }
  try {
    const { rows } = await db.run(
      'INSERT INTO acougue_invoices (type, ref_type, ref_id, total_value, status, payload, created_by) VALUES (?,?,?,?,?,?,?)',
      [type, ref_type || 'manual', ref_id || null, total_value, 'rascunho', JSON.stringify({ itens, destinatario, natureza_operacao }), req.user.id]
    );
    const invoiceId = rows[0].id;

    if (!focusNfe.isFocusConfigured()) {
      return res.status(201).json({
        id: invoiceId, type, ref_type, ref_id, total_value, status: 'rascunho',
        warning: t(reqLang(req), 'Focus NFe não configurado — esta nota fica como rascunho local até você configurar FOCUS_NFE_TOKEN no servidor (veja .env.example).'),
      });
    }

    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj || !settings.ie) {
      await db.run("UPDATE acougue_invoices SET status = 'erro', error_message = ? WHERE id = ?", ['CNPJ/IE do açougue não configurados', invoiceId]);
      return res.status(422).json({ id: invoiceId, status: 'erro', error: t(reqLang(req), 'Preencha o CNPJ e a Inscrição Estadual do açougue em Configurações antes de emitir notas.') });
    }

    const payload = focusNfe.buildNFePayload({
      tipo: type,
      emitente: {
        cnpj: settings.cnpj, inscricao_estadual: settings.ie, razao_social: settings.business_name,
        logradouro: settings.logradouro, numero: settings.numero, bairro: settings.bairro,
        municipio: settings.municipio, uf: settings.uf, cep: settings.cep,
      },
      destinatario, itens, natureza_operacao, valor_total: total_value,
    });
    const ref = `acougue-nfe-${invoiceId}`;
    try {
      const result = await focusNfe.emitNFe(ref, payload);
      const status = result.data?.status === 'autorizado' ? 'autorizada' : (result.ok ? 'processando' : 'erro');
      await db.run(
        'UPDATE acougue_invoices SET status=?, focus_ref=?, chave_acesso=?, numero=?, serie=?, xml_url=?, danfe_url=?, error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [status, ref, result.data?.chave_nfe || null, result.data?.numero || null, result.data?.serie || null, result.data?.caminho_xml_nota_fiscal || null, result.data?.caminho_danfe || null, result.ok ? null : (result.data?.mensagem_sefaz || result.data?.mensagem || 'Erro na Focus NFe'), invoiceId]
      );
      res.status(201).json({ id: invoiceId, status, focus_ref: ref, raw: result.data });
    } catch (focusErr) {
      await db.run("UPDATE acougue_invoices SET status = 'erro', error_message = ? WHERE id = ?", [focusErr.message, invoiceId]);
      res.status(502).json({ id: invoiceId, status: 'erro', error: focusErr.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/nfe/:id', ...acougueOnly, async (req, res) => {
  try {
    const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: t(reqLang(req), 'Nota não encontrada') });
    if (focusNfe.isFocusConfigured() && invoice.focus_ref && invoice.status === 'processando') {
      try {
        const result = await focusNfe.consultNFe(invoice.focus_ref);
        const status = result.data?.status === 'autorizado' ? 'autorizada' : result.data?.status === 'erro_autorizacao' ? 'erro' : invoice.status;
        await db.run(
          'UPDATE acougue_invoices SET status=?, chave_acesso=?, numero=?, serie=?, xml_url=?, danfe_url=?, error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
          [status, result.data?.chave_nfe || invoice.chave_acesso, result.data?.numero || invoice.numero, result.data?.serie || invoice.serie, result.data?.caminho_xml_nota_fiscal || invoice.xml_url, result.data?.caminho_danfe || invoice.danfe_url, result.data?.mensagem_sefaz || invoice.error_message, req.params.id]
        );
        invoice.status = status;
      } catch { /* mantém o status local se a consulta à Focus falhar */ }
    }
    res.json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/nfe/:id/cancel', ...acougueOnly, async (req, res) => {
  const { justificativa } = req.body;
  try {
    const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: t(reqLang(req), 'Nota não encontrada') });
    if (invoice.status === 'autorizada' && focusNfe.isFocusConfigured() && invoice.focus_ref) {
      if (!justificativa || justificativa.length < 15) {
        return res.status(400).json({ error: t(reqLang(req), 'A justificativa de cancelamento deve ter ao menos 15 caracteres (exigência da SEFAZ)') });
      }
      const result = await focusNfe.cancelNFe(invoice.focus_ref, justificativa);
      if (!result.ok) return res.status(502).json({ error: result.data?.mensagem_sefaz || result.data?.mensagem || t(reqLang(req), 'Falha ao cancelar na SEFAZ') });
    }
    await db.run("UPDATE acougue_invoices SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    res.json({ id: Number(req.params.id), status: 'cancelada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- PIS / COFINS ---- */
app.get('/api/acougue/taxes/apuracao', ...acougueOnly, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year = Number(req.query.year) || now.getFullYear();
    const apuracao = await calcApuracao(month, year);
    const closed = await db.get('SELECT * FROM acougue_tax_periods WHERE ref_month = ? AND ref_year = ?', [month, year]);
    res.json({ ...apuracao, closed: !!closed, closed_snapshot: closed || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/taxes/periods', ...acougueOnly, async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM acougue_tax_periods ORDER BY ref_year DESC, ref_month DESC', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/taxes/periods/close', ...acougueOnly, async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: t(reqLang(req), 'Informe mês e ano') });
  try {
    const existing = await db.get('SELECT id FROM acougue_tax_periods WHERE ref_month = ? AND ref_year = ?', [month, year]);
    if (existing) return res.status(409).json({ error: t(reqLang(req), 'Este período já foi fechado') });
    const apuracao = await calcApuracao(Number(month), Number(year));
    const { rows } = await db.run(
      'INSERT INTO acougue_tax_periods (ref_month, ref_year, pis_credit, pis_debit, pis_due, cofins_credit, cofins_debit, cofins_due, closed_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [month, year, apuracao.pis_credit, apuracao.pis_debit, apuracao.pis_due, apuracao.cofins_credit, apuracao.cofins_debit, apuracao.cofins_due, req.user.id]
    );
    res.status(201).json({ id: rows[0].id, ...apuracao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Configurações fiscais ---- */
app.get('/api/acougue/settings', ...acougueOnly, async (req, res) => {
  try {
    const settings = await getAcougueSettingsMap();
    res.json({ ...settings, focus_nfe_configured: focusNfe.isFocusConfigured(), focus_nfe_environment: focusNfe.FOCUS_NFE_ENV });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/settings', ...acougueOnly, async (req, res) => {
  const allowedKeys = ['business_name', 'cnpj', 'ie', 'logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep', 'regime_tributario', 'pis_rate', 'cofins_rate', 'dressing_pct', 'blood_pct', 'hide_pct', 'head_feet_pct',
    'scale_prefix', 'scale_code_digits', 'scale_value_digits', 'scale_value_type'];
  try {
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        await db.run('UPDATE settings SET value = ? WHERE key = ?', [String(req.body[key]), `acougue_${key}`]);
      }
    }
    res.json(await getAcougueSettingsMap());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Rendimento de Carcaça (tabela de cortes % editável) ---- */
app.get('/api/acougue/yield-cuts', ...acougueOnly, async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM acougue_yield_cuts WHERE active = 1 ORDER BY display_order, id', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/yield-cuts', ...acougueOnly, async (req, res) => {
  const { name, section, pct_of_carcass } = req.body;
  if (!name || !section || pct_of_carcass === undefined) {
    return res.status(400).json({ error: t(reqLang(req), 'Nome, seção e percentual são obrigatórios') });
  }
  try {
    const { rows: [{ maxOrder }] } = await pool.query('SELECT COALESCE(MAX(display_order), 0) as "maxOrder" FROM acougue_yield_cuts');
    const { rows } = await db.run(
      'INSERT INTO acougue_yield_cuts (name, section, pct_of_carcass, display_order) VALUES (?,?,?,?)',
      [name, section, pct_of_carcass, Number(maxOrder) + 1]
    );
    res.status(201).json({ id: rows[0].id, name, section, pct_of_carcass });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/yield-cuts/:id', ...acougueOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_yield_cuts WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: t(reqLang(req), 'Corte não encontrado') });
    const next = {};
    ['name', 'section', 'pct_of_carcass', 'display_order'].forEach(f => { next[f] = req.body[f] !== undefined ? req.body[f] : current[f]; });
    await db.run(
      'UPDATE acougue_yield_cuts SET name=?, section=?, pct_of_carcass=?, display_order=? WHERE id=?',
      [next.name, next.section, next.pct_of_carcass, next.display_order, req.params.id]
    );
    res.json({ id: Number(req.params.id), ...next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/acougue/yield-cuts/:id', ...acougueOnly, async (req, res) => {
  try {
    await db.run('UPDATE acougue_yield_cuts SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id), active: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Conferência mensal (evitar malha fina: bate registros x notas emitidas) ---- */
app.get('/api/acougue/reconciliation', ...acougueOnly, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year = Number(req.query.year) || now.getFullYear();
    const { start, end } = monthRange(month, year);

    const { rows: [{ total: entradasRegistradas }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_carcass_entries WHERE entry_date >= $1 AND entry_date < $2`, [start, end]
    );
    const { rows: [{ total: saidasRegistradas }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_cuts WHERE output_date >= $1 AND output_date < $2 AND destination = 'venda_direta'`, [start, end]
    );
    const { rows: [{ total: caixaRegistrado }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_sales WHERE created_at >= $1 AND created_at < $2 AND status = 'concluida'`, [start, end]
    );
    const { rows: [{ total: notasEntrada }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_invoices WHERE type = 'entrada' AND status IN ('autorizada', 'processando') AND created_at >= $1 AND created_at < $2`, [start, end]
    );
    const { rows: [{ total: notasSaida }] } = await pool.query(
      `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_invoices WHERE type = 'saida' AND status IN ('autorizada', 'processando') AND created_at >= $1 AND created_at < $2`, [start, end]
    );

    const saidasTotalRegistrado = round2(Number(saidasRegistradas) + Number(caixaRegistrado));
    const entradaDivergencia = round2(Number(entradasRegistradas) - Number(notasEntrada));
    const saidaDivergencia = round2(saidasTotalRegistrado - Number(notasSaida));
    // Tolerância de R$1 pra absorver arredondamento — acima disso é divergência real que vale a
    // pena revisar antes de declarar (é exatamente esse tipo de inconsistência que cai na malha
    // fina da Receita: valor movimentado não bate com valor declarado em nota).
    const TOLERANCIA = 1;

    res.json({
      month, year,
      entradas_registradas: round2(Number(entradasRegistradas)),
      notas_entrada_emitidas: round2(Number(notasEntrada)),
      entrada_divergencia: entradaDivergencia,
      entrada_ok: Math.abs(entradaDivergencia) <= TOLERANCIA,
      saidas_registradas: saidasTotalRegistrado,
      notas_saida_emitidas: round2(Number(notasSaida)),
      saida_divergencia: saidaDivergencia,
      saida_ok: Math.abs(saidaDivergencia) <= TOLERANCIA,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.1', timestamp: new Date().toISOString() });
});

// ─── SPA fallback — serve index.html para qualquer rota não-API ──────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateTimes = (workingHours, bookedRanges, duration = 30, date = null) => {
  const times = [];
  const [startHour, startMin] = workingHours.start_time.split(':').map(Number);
  const [endHour, endMin] = workingHours.end_time.split(':').map(Number);
  const startTotalMin = startHour * 60 + startMin;
  const endTotalMin = endHour * 60 + endMin;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const isToday = date === todayStr;
  const nowTotalMin = isToday ? (now.getHours() * 60 + now.getMinutes() + 30) : -1;

  let breakStartMin = -1, breakEndMin = -1;
  if (workingHours.break_start && workingHours.break_end) {
    const [bsh, bsm] = workingHours.break_start.split(':').map(Number);
    const [beh, bem] = workingHours.break_end.split(':').map(Number);
    breakStartMin = bsh * 60 + bsm;
    breakEndMin = beh * 60 + bem;
  }

  // Horários oferecidos sempre em grade fixa de 15 em 15 min (independente da duração do
  // serviço), para o cliente ter mais opções de horário. A duração do serviço só entra no
  // cálculo de conflito (isOverlapping) abaixo — por isso, conforme os agendamentos vão sendo
  // feitos, os slots que passariam a se sobrepor a eles somem sozinhos da lista.
  const SLOT_INTERVAL_MIN = 15;
  for (let slotStart = startTotalMin; slotStart + duration <= endTotalMin; slotStart += SLOT_INTERVAL_MIN) {
    const slotEnd = slotStart + duration;
    const h = Math.floor(slotStart / 60);
    const m = slotStart % 60;
    const time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

    const isPast = isToday && slotStart <= nowTotalMin;
    const isInBreak = breakStartMin >= 0 && slotStart < breakEndMin && slotEnd > breakStartMin;
    const isOverlapping = bookedRanges.some(r => slotStart < r.end && slotEnd > r.start);

    if (!isPast && !isInBreak && !isOverlapping) times.push(time);
  }
  return times;
};

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 CS Barber v2.1 rodando em http://localhost:${PORT}\n`);
      logEvent('INFO', 'Sistema iniciado');
    });
  })
  .catch((err) => {
    console.error('Erro fatal ao inicializar o banco de dados:', err);
    process.exit(1);
  });

module.exports = app;
