const express = require('express');
const { Pool, types } = require('pg');
// node-pg devolve BIGINT (COUNT(*), SUM de coluna inteira) como string por padrão, para não
// perder precisão em valores acima de Number.MAX_SAFE_INTEGER. O sqlite3 sempre devolvia number
// nesses casos, e o resto do código (aqui e no front-end) assume number (ex: `prev === 0`,
// comparações estritas como `prev === 0`) — sem essa conversão elas quebrariam em produção.
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
const helmet = require('helmet');
require('dotenv').config();
const focusNfe = require('./focus-nfe');
const scaleBarcode = require('./scale-barcode');
const nfeXml = require('./nfe-xml');
const sped = require('./sped');
const precificacao = require('./precificacao');
const gaveta = require('./gaveta');

const app = express();
const PORT = process.env.PORT || 5000;
const pkg = require('./package.json');
const serverStartedAt = new Date();

// Sem fallback. O valor antigo ('defina-JWT_SECRET-no-env-antes-de-produzir') era público — está
// no histórico deste repositório — e valia como segredo de verdade sempre que a variável
// faltasse: qualquer pessoa assinava um token de dono e entrava. O .env.example já pedia pra
// trocar; pedir não segura ninguém. Sem JWT_SECRET o processo não sobe, e o motivo fica no log.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 24) {
  console.error('\nJWT_SECRET ausente ou curto demais (mínimo 24 caracteres). Defina no .env — veja .env.example.\n');
  process.exit(1);
}

// Atrás do ALB (deploy/setup-alb.sh) toda requisição chega do IP do balanceador. Sem isto o
// express-rate-limit contava as tentativas de login da LOJA INTEIRA num balde só: dez senhas
// erradas de uma pessoa trancavam o caixa pra todo mundo por 15 minutos. E o IP gravado no
// histórico de acessos seria sempre o mesmo, inútil pra saber de onde veio uma tentativa.
app.set('trust proxy', 1);

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

// ─── Web Push ─────────────────────────────────────────────────────────────────
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
webpush.setVapidDetails('mailto:contato@reidascarnes.com.br', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// CSP desligada de propósito: React, Babel e Tailwind vêm de CDN e o JSX é compilado no próprio
// navegador com script inline — uma política que permitisse isso não protegeria nada. Os outros
// cabeçalhos (nosniff, frameguard, HSTS, referrer-policy) valem e não custam nada.
app.use(helmet({ contentSecurityPolicy: false }));

// Só a própria origem (o front é servido daqui) e o que estiver em ALLOWED_ORIGINS. O `cors()`
// pelado respondia `*` pra qualquer site.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  const propria = `${req.protocol}://${req.get('host')}`;
  cb(null, { origin: !origin || origin === propria || allowedOrigins.includes(origin) });
}));
app.use(express.json({ limit: '15mb' }));
// Sem cache-control explícito, o navegador pode reaproveitar (via ETag) uma resposta antiga de
// GET para a mesma URL — grave numa API cujos dados mudam a cada venda (ex:
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
      database: process.env.DB_NAME || 'reidascarnes',
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
      connectionString: process.env.DATABASE_URL || `postgres://localhost/${process.env.PGDATABASE || 'reidascarnes'}`,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);


  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL
  )`);


  // ─── Módulo Açougue (role 'acougue') ────────────────────────────────────────
  // Tabelas do açougue. Nomeadas com prefixo `acougue_` desde a origem, quando o módulo
  // ainda convivia com outro sistema; os nomes ficaram para não quebrar dados já gravados.
  // Só as tabelas do açougue, mais users (dono/operador do caixa) e settings.
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

  // A Focus devolve o QR Code e a URL de consulta da NFC-e — sem guardar, não dá pra
  // reimprimir um cupom válido depois, nem mostrar ao consumidor como conferir a nota.
  for (const col of ['qrcode_url TEXT', 'url_consulta TEXT', 'status_sefaz TEXT',
                     'contingencia INTEGER DEFAULT 0', 'contingencia_efetivada INTEGER DEFAULT 0']) {
    await pool.query(`ALTER TABLE acougue_invoices ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // Conferência de etiqueta: registra que alguém bipou a etiqueta REAL da balança e confirmou
  // (ou não) que o PLU daquele produto casa com o cadastro. É a única forma de detectar o
  // descasamento entre a programação da balança e o sistema — nenhuma consulta ao banco revela
  // isso, porque internamente o cadastro é consistente. Com emissão fiscal ligada, PLU trocado
  // significa produto e valor errados numa NFC-e real.
  for (const col of [
    'plu_conferido_em TIMESTAMP', 'plu_conferido_por INTEGER REFERENCES users(id)',
    'plu_confere INTEGER', 'plu_observacao TEXT',
  ]) {
    await pool.query(`ALTER TABLE acougue_products ADD COLUMN IF NOT EXISTS ${col}`);
  }

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

  // ─── Entrada de notas (NF-e de compra do fornecedor) ──────────────────────
  // Guardamos o XML inteiro, não só os campos extraídos: o SPED e uma eventual fiscalização
  // pedem o arquivo original, e reprocessar o XML guardado é a única forma de corrigir um
  // erro de importação sem pedir o arquivo ao fornecedor de novo.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_purchase_invoices (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chave_acesso TEXT UNIQUE,
    numero TEXT,
    serie TEXT,
    modelo TEXT DEFAULT '55',
    emit_cnpj TEXT,
    emit_nome TEXT,
    emit_uf TEXT,
    data_emissao DATE,
    valor_total REAL NOT NULL DEFAULT 0,
    valor_produtos REAL DEFAULT 0,
    valor_icms REAL DEFAULT 0,
    valor_pis REAL DEFAULT 0,
    valor_cofins REAL DEFAULT 0,
    xml TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_purchase_items (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES acougue_purchase_invoices(id) ON DELETE CASCADE,
    -- Fica nulo quando o item da nota do fornecedor não casa com nenhum produto nosso; o
    -- estoque só é movimentado quando há vínculo, para não inventar saldo de item errado.
    product_id INTEGER REFERENCES acougue_products(id) ON DELETE SET NULL,
    numero_item INTEGER,
    codigo TEXT,
    ean TEXT,
    descricao TEXT NOT NULL,
    ncm TEXT,
    cfop TEXT,
    unidade TEXT,
    quantidade REAL NOT NULL,
    valor_unitario REAL NOT NULL,
    valor_total REAL NOT NULL,
    icms_cst TEXT,
    icms_valor REAL DEFAULT 0,
    pis_cst TEXT,
    pis_valor REAL DEFAULT 0,
    cofins_cst TEXT,
    cofins_valor REAL DEFAULT 0
  )`);

  // ─── Produção: ficha técnica, lote e validade ──────────────────────────────
  // Linguiça, hambúrguer, carne temperada e kits consomem insumos. Sem registrar isso, o
  // estoque mente duas vezes: não baixa o que foi consumido e não sobe o que foi produzido —
  // e ninguém sabe o custo real do que fabrica.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_recipes (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES acougue_products(id) ON DELETE CASCADE,
    -- Rendimento da receita: quanto sai de produto final a cada "batida". Serve de base
    -- para escalar os insumos quando se produz uma quantidade diferente.
    rendimento_kg REAL NOT NULL DEFAULT 1,
    observacao TEXT,
    ativo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_produto ON acougue_recipes(product_id) WHERE ativo = 1');

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_recipe_items (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES acougue_recipes(id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES acougue_products(id) ON DELETE RESTRICT,
    quantidade REAL NOT NULL
  )`);

  // Cada produção vira um lote, com validade. É o que permite rastrear e avisar vencimento —
  // produto perecível sem isso gera perda e risco sanitário.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_batches (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES acougue_products(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    quantidade_restante REAL NOT NULL,
    custo_total REAL DEFAULT 0,
    validade DATE,
    produzido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_batches_validade ON acougue_batches(validade) WHERE quantidade_restante > 0');

  // ─── Clientes e fiado (caderneta) ──────────────────────────────────────────
  // Açougue de bairro vende fiado. Sem isso o sistema não substitui o caderno, e é no
  // caderno que o dinheiro se perde: ninguém lembra quem deve o quê nem desde quando.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_customers (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL,
    documento TEXT,
    telefone TEXT,
    endereco TEXT,
    -- 0 = sem limite definido. O limite existe para o caixa avisar ANTES de fiar, não
    -- para descobrir depois que o cliente já deve demais.
    limite_credito REAL DEFAULT 0,
    observacao TEXT,
    ativo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_documento
    ON acougue_customers(documento) WHERE documento IS NOT NULL AND documento <> '' AND ativo = 1`);

  // Uma linha por dívida. O pagamento é parcial por natureza ("vou adiantar 50"), então
  // guardamos valor devido e valor já pago em vez de um booleano "quitado".
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_receivables (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES acougue_customers(id) ON DELETE RESTRICT,
    sale_id INTEGER REFERENCES acougue_sales(id) ON DELETE SET NULL,
    valor REAL NOT NULL,
    valor_pago REAL NOT NULL DEFAULT 0,
    vencimento DATE,
    quitado_em TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_receivables_customer ON acougue_receivables(customer_id) WHERE quitado_em IS NULL');

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_receivable_payments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receivable_id INTEGER NOT NULL REFERENCES acougue_receivables(id) ON DELETE CASCADE,
    valor REAL NOT NULL,
    forma TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const col of ['customer_id INTEGER REFERENCES acougue_customers(id)',
                     'vendedor_id INTEGER REFERENCES users(id)']) {
    await pool.query(`ALTER TABLE acougue_sales ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // ─── Caixa: sessão, sangria e suprimento ───────────────────────────────────
  // Sem controle de gaveta não existe conferência: ninguém sabe se o dinheiro que está lá
  // bate com o que foi vendido. A sessão amarra as vendas a um turno e a um operador, e é o
  // que permite fechar o dia apontando sobra ou falta em vez de descobrir a diferença no mês.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_cash_sessions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aberto_por INTEGER REFERENCES users(id),
    aberto_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valor_abertura REAL NOT NULL DEFAULT 0,
    fechado_por INTEGER REFERENCES users(id),
    fechado_em TIMESTAMP,
    -- Valor contado na gaveta no fechamento. A diferença para o esperado é o que interessa.
    valor_contado REAL,
    diferenca REAL,
    observacao TEXT
  )`);
  // Só uma sessão aberta por vez: duas gavetas abertas ao mesmo tempo tornam impossível
  // dizer a qual turno uma venda pertence.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_uma_sessao_aberta
    ON acougue_cash_sessions((fechado_em IS NULL)) WHERE fechado_em IS NULL`);

  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_cash_movements (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES acougue_cash_sessions(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,          -- 'sangria' (retira) | 'suprimento' (coloca)
    valor REAL NOT NULL,
    motivo TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Pagamentos da venda em linhas separadas: uma venda pode ser paga metade em dinheiro e
  // metade no cartão, e a NFC-e exige cada forma discriminada no XML.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_sale_payments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES acougue_sales(id) ON DELETE CASCADE,
    forma TEXT NOT NULL,
    valor REAL NOT NULL,
    -- Só para dinheiro: quanto o cliente entregou, para calcular o troco.
    valor_recebido REAL
  )`);

  for (const col of ['desconto REAL DEFAULT 0', 'acrescimo REAL DEFAULT 0',
                     'troco REAL DEFAULT 0', 'cash_session_id INTEGER REFERENCES acougue_cash_sessions(id)']) {
    await pool.query(`ALTER TABLE acougue_sales ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await pool.query('ALTER TABLE acougue_sale_items ADD COLUMN IF NOT EXISTS desconto REAL DEFAULT 0');

  // ─── Livro de movimentação de estoque (controle interno) ───────────────────
  // Toda alteração de saldo passa a deixar rastro aqui: entrada por nota, desossa, venda no
  // caixa, quebra na câmara e ajuste manual. Sem esse livro, "sumiu 12 kg de picanha" é uma
  // discussão sem prova — com ele dá pra apontar exatamente quando e por quê o saldo mudou.
  //
  // `quantidade` é sempre em kg (ou unidades, conforme o produto) e traz SINAL: positivo
  // entra, negativo sai. Somar a coluna reconstrói o saldo de qualquer produto em qualquer data.
  await pool.query(`CREATE TABLE IF NOT EXISTS acougue_stock_movements (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id INTEGER REFERENCES acougue_products(id) ON DELETE SET NULL,
    carcass_entry_id INTEGER REFERENCES acougue_carcass_entries(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    saldo_apos REAL,
    motivo TEXT,
    ref_type TEXT,
    ref_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_mov_product ON acougue_stock_movements(product_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_stock_mov_carcass ON acougue_stock_movements(carcass_entry_id)');

  // ─── Câmara fria ───────────────────────────────────────────────────────────
  // Carne perde peso parada na câmara (evaporação). É perda real de mercadoria: entrou 250 kg
  // de carcaça, saem 247 kg de cortes, e a diferença não é roubo nem erro de balança. Sem
  // registrar isso, o estoque acusa sobra que não existe e o rendimento por carcaça sai errado.
  for (const col of [
    'chamber_in_at TIMESTAMP', 'chamber_out_at TIMESTAMP', 'weight_out_kg REAL', 'chamber_notes TEXT',
  ]) {
    await pool.query(`ALTER TABLE acougue_carcass_entries ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // Migrações (colunas adicionadas depois do schema inicial) — idempotentes via IF NOT EXISTS,
  // sem precisar do try/catch de "duplicate column" que o sqlite3 exigia.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark'");
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0');
  // Equipe com papéis e rastro de acesso (ver "Middlewares de autenticação").
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP');
  // O papel único 'acougue' vira 'dono'. Quem já existe continua entrando com tudo liberado;
  // 'caixa' só nasce quando o dono cadastra alguém em Equipe.
  await pool.query("UPDATE users SET role = 'dono' WHERE role = 'acougue'");

  // Sessão por login: o JWT sozinho não sabe ser revogado. "Sair", trocar a senha, desativar um
  // funcionário — tudo isso precisa derrubar o acesso NA HORA, não dali a 7 dias.
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti TEXT UNIQUE NOT NULL,
    device TEXT,
    ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_abertas ON sessions(user_id) WHERE revoked_at IS NULL');

  // Histórico de acessos: quem entrou, quando, de onde, e as tentativas que falharam. O log em
  // memória (systemLog) some no restart e nenhuma tela o lia.
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    login TEXT,
    evento TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    detalhe TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auth_events_recentes ON auth_events(created_at DESC)');

  // Seed inicial - só insere se não existir
  // Dono do açougue (login: reidascarnes / senha: reidascarnes). O campo `email` do login aceita
  // qualquer string única — não precisa ter formato de e-mail real. Nasce com
  // must_change_password = 1: a senha padrão está no README, então o primeiro login é obrigado a
  // trocá-la antes de ver qualquer tela. Instalação antiga (linha já existente) não é alterada.
  const acougueOwnerPassword = bcrypt.hashSync('reidascarnes', 12);
  await pool.query(
    `INSERT INTO users (name, email, password, role, must_change_password) VALUES ($1, $2, $3, $4, 1) ON CONFLICT (email) DO NOTHING`,
    ['Rei das Carnes', 'reidascarnes', acougueOwnerPassword, 'dono']
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
    // Desconto do caixa, em % sobre o total. O operador não digita valor: aperta o botão (ou o
    // atalho) e aplica ESTE percentual, decidido pelo dono. Campo livre no balcão é onde nasce
    // "dei um descontinho" que ninguém consegue auditar depois. 0 = desconto desligado.
    ['acougue_desconto_pct', '0'],
    ['acougue_regime_tributario', 'lucro_real'],
    ['acougue_pis_rate', '1.65'],
    ['acougue_cofins_rate', '7.60'],
    // Rendimento peso vivo → carcaça (% do peso vivo do boi). Valores de referência típicos do
    // setor — variam de verdade por raça, acabamento de gordura e tempo de jejum do animal, por
    // isso ficam editáveis em Configurações.
    // Quebra de peso na câmara fria, em % por dia. O valor abaixo é uma referência de setor
    // para carcaça bovina resfriada em câmara bem regulada (perda de água por evaporação, em
    // geral 0,5%–2% nas primeiras 24h, caindo depois). O número REAL desta câmara depende de
    // temperatura, umidade, ventilação e de a peça estar coberta ou não — por isso é editável
    // em Configurações, e o sistema mostra sempre o esperado ao lado do real medido.
    // Série dedicada à contingência offline e o próximo número dela. Série separada porque a
    // numeração online é atribuída pela Focus — misturar as duas no mesmo intervalo é a causa
    // clássica de "número duplicado" na SEFAZ.
    ['acougue_nfce_serie_contingencia', '9'],
    ['acougue_nfce_proximo_numero_contingencia', '1'],
    // Gaveta de dinheiro: abre por pulso da impressora térmica (cabo RJ11 entre as duas).
    // Fica desligada por padrão — sem o IP da impressora o comando não tem para onde ir.
    ['acougue_gaveta_ativa', 'false'],
    ['acougue_impressora_ip', ''],
    ['acougue_impressora_porta', '9100'],
    ['acougue_gaveta_pino', '0'],
    ['acougue_gaveta_tempo_ligado', '25'],
    ['acougue_gaveta_tempo_desligado', '250'],
    ['acougue_gaveta_auto_dinheiro', 'true'],
    ['acougue_shrink_pct_day', '0.8'],
    // Layout da etiqueta da balança (ver scale-barcode.js), conferido numa etiqueta real:
    // 2 + PLU de 6 dígitos + preço total em centavos de 5 dígitos + DV. Se a balança for
    // reprogramada (ou trocada por outra que grave PESO), é só ajustar em Configurações.
    // Teclas de atalho do caixa. O operador de açougue trabalha com as duas mãos ocupadas
    // (leitor numa, embalagem na outra) — tirar a mão pro mouse a cada item é o que trava a
    // fila. Guardado como JSON para o dono remapear em Configurações sem mexer no código.
    ['acougue_hotkeys', JSON.stringify({
      foco_codigo: 'F2', cpf_nota: 'F4', finalizar: 'F5', reimprimir: 'F6',
      cancelar_venda: 'F9', remover_item: 'F10', suspender: 'F12',
    })],
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


// ─── Middlewares de autenticação ────────────────────────────────────────────
//
// Papéis:
//   dono  — tudo: fiscal, estoque, relatórios, configurações e a equipe.
//   caixa — o balcão: vender, emitir a NFC-e da venda, gaveta, clientes/fiado, conferir etiqueta.
// Existia só 'acougue', um login pra loja inteira. O `created_by` que já estava nas tabelas de
// venda, gaveta e sangria era sempre o mesmo número — rastro nenhum de QUEM fez o quê. O papel
// antigo é migrado para 'dono' no boot (initDatabase).
const PAPEIS = ['dono', 'caixa'];
const ROTULO_PAPEL = { dono: 'Dono', caixa: 'Caixa' };
const BCRYPT_COST = 12;
const MSG_INDISPONIVEL = 'Serviço indisponível no momento. Tente novamente em instantes.';

// Rotas que uma sessão com senha provisória ainda pode usar: só o necessário pra trocá-la.
const PERMITIDO_COM_SENHA_PROVISORIA = /^\/api\/(auth\/(password|logout)|me)$/;

const sessaoEncerrada = (res) => res.status(401).json({ error: 'Sessão encerrada. Entre de novo.', code: 'sessao_encerrada' });

// Fail-closed: token sem jti (emitido por uma versão anterior), sem linha em `sessions`, revogado
// ou de usuário desativado = 401. O JWT sozinho não basta mais — "Sair", a troca de senha e a
// desativação de um funcionário precisam derrubar o acesso NA HORA, e antes não derrubavam: o
// token de 7 dias seguia valendo em qualquer aba onde tivesse sido copiado.
//
// Erro do BANCO não é 401. O front trata 401 com sessão como logout (limpa e recarrega), e um
// soluço do Aurora mandaria o caixa inteiro pra tela de login no meio da fila. É 503.
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (!decoded.jti) return sessaoEncerrada(res);
  try {
    const { rows: [sessao] } = await pool.query(
      `SELECT s.revoked_at, u.role, u.name, u.email, u.active, u.must_change_password
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.jti = $1 AND s.user_id = $2`,
      [decoded.jti, decoded.id]
    );
    if (!sessao || sessao.revoked_at) return sessaoEncerrada(res);
    if (!sessao.active) {
      return res.status(403).json({ error: 'Este acesso foi desativado. Fale com o dono do açougue.', code: 'usuario_desativado' });
    }
    // Papel e nome saem do BANCO, não do token: rebaixar um caixa ou renomear alguém vale na
    // hora, sem esperar o token vencer.
    req.user = {
      id: decoded.id, email: sessao.email, name: sessao.name, role: sessao.role, jti: decoded.jti,
      must_change_password: !!sessao.must_change_password,
    };
    if (req.user.must_change_password && !PERMITIDO_COM_SENHA_PROVISORIA.test(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: 'Defina uma senha nova antes de continuar.', code: 'senha_provisoria' });
    }
    pool.query('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE jti = $1', [decoded.jti]).catch(() => {});
    next();
  } catch (err) {
    logEvent('ERROR', 'Não foi possível verificar a sessão: {erro}', { erro: err.message });
    res.status(503).json({ error: MSG_INDISPONIVEL, code: 'db_unavailable' });
  }
};

const verifyRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado', code: 'sem_permissao' });
  }
  next();
};

const donoOnly = [verifyToken, verifyRole(['dono'])];

// ─── Auth ────────────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req, res) => ({ error: 'Muitas tentativas de login. Tente novamente em alguns minutos.', code: 'muitas_tentativas' }),
  skipSuccessfulRequests: true,
});

// Política de senha — validada AQUI. A checagem da tela é conveniência; a regra é esta.
function problemasDaSenha(senha) {
  const s = String(senha || '');
  const p = [];
  if (s.length < 8) p.push('ao menos 8 caracteres');
  if (!/[a-zA-Z]/.test(s)) p.push('uma letra');
  if (!/[0-9]/.test(s)) p.push('um número');
  if (s.length > 128) p.push('no máximo 128 caracteres');
  return p;
}

// Senha provisória: 10 caracteres sem 0/O, 1/l/I — ela vai ser ditada ou anotada num papel no
// balcão, e "é zero ou é ó?" é o tipo de dúvida que faz a pessoa desistir e ficar sem acesso.
// Sempre com letra e número, pra passar na política quando for trocada.
function gerarSenhaProvisoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  for (;;) {
    const bytes = crypto.randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += alfabeto[bytes[i] % alfabeto.length];
    if (/[a-zA-Z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}

// Comparação feita mesmo quando o login não existe, contra este hash: sem isso a resposta do
// login inexistente voltava em 1 ms e a do login errado em 250 ms — o tempo denunciava quais
// logins existem, e a mensagem única não adiantava nada.
const HASH_DE_COMPARACAO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

function dispositivoDe(ua) {
  if (!ua) return 'Dispositivo desconhecido';
  let navegador = 'Navegador';
  if (/Edg\//.test(ua)) navegador = 'Edge';
  else if (/OPR\//.test(ua)) navegador = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) navegador = 'Chrome';
  else if (/Firefox\//.test(ua)) navegador = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) navegador = 'Safari';
  let so = 'SO desconhecido';
  if (/Windows/.test(ua)) so = 'Windows';
  else if (/Mac OS X/.test(ua)) so = 'macOS';
  else if (/Android/.test(ua)) so = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) so = 'iOS';
  else if (/Linux/.test(ua)) so = 'Linux';
  return `${navegador} · ${so}`;
}

async function registrarAcesso(evento, { userId = null, login = null, req, detalhe = null }) {
  try {
    await pool.query(
      'INSERT INTO auth_events (user_id, login, evento, ip, user_agent, detalhe) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, login, evento, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 200), detalhe]
    );
  } catch (err) {
    logEvent('WARN', 'Não deu para gravar o evento de acesso {evento}: {erro}', { evento, erro: err.message });
  }
}

async function abrirSessao(req, user, lembrar) {
  const jti = crypto.randomUUID();
  await pool.query('INSERT INTO sessions (user_id, jti, device, ip) VALUES ($1,$2,$3,$4)',
    [user.id, jti, dispositivoDe(req.headers['user-agent']), req.ip || null]);
  // "Manter conectado" = 7 dias; sem marcar, um turno (12h). Num PDV o navegador é da loja, não
  // da pessoa: quanto menos o token vale depois que ela foi embora, melhor.
  return jwt.sign({ id: user.id, jti }, JWT_SECRET, { expiresIn: lembrar ? '7d' : '12h' });
}

const usuarioParaResposta = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, role_label: ROTULO_PAPEL[u.role] || u.role,
  phone: u.phone, theme: u.theme || 'dark', must_change_password: !!u.must_change_password,
  last_login_at: u.last_login_at || null,
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const login = String(req.body.email ?? req.body.login ?? '').trim().toLowerCase();
  const senha = String(req.body.password ?? '');
  const lembrar = req.body.remember === true;
  // Uma mensagem só. "Usuário não encontrado" vs "Senha incorreta" contava, pra quem estivesse
  // tentando, quais logins existem — e o login padrão está no README.
  const invalido = () => res.status(401).json({ error: 'Usuário ou senha incorretos.', code: 'credenciais_invalidas' });
  if (!login || !senha) return invalido();
  try {
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE LOWER(TRIM(email)) = $1', [login]);
    let confere = false;
    if (user && user.password) confere = bcrypt.compareSync(senha, user.password);
    else bcrypt.compareSync(senha, HASH_DE_COMPARACAO);
    if (!confere) {
      await registrarAcesso('login_falhou', { userId: user?.id || null, login, req });
      logEvent('WARN', 'Tentativa de login inválida ({login})', { login });
      return invalido();
    }
    if (!user.active) {
      await registrarAcesso('login_recusado_inativo', { userId: user.id, login, req });
      return res.status(403).json({ error: 'Este acesso foi desativado. Fale com o dono do açougue.', code: 'usuario_desativado' });
    }
    const token = await abrirSessao(req, user, lembrar);
    await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = $2 WHERE id = $1', [user.id, req.ip || null]);
    await registrarAcesso('login', { userId: user.id, login, req, detalhe: lembrar ? 'manter conectado' : null });
    res.json({ token, user: usuarioParaResposta(user) });
  } catch (err) {
    logEvent('ERROR', 'Falha no login de {login}: {erro}', { login, erro: err.message });
    res.status(503).json({ error: MSG_INDISPONIVEL, code: 'db_unavailable' });
  }
});

app.post('/api/auth/logout', verifyToken, async (req, res) => {
  try {
    await pool.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE jti = $1 AND revoked_at IS NULL', [req.user.jti]);
    await registrarAcesso('logout', { userId: req.user.id, login: req.user.email, req });
    res.json({ ok: true });
  } catch (err) {
    logEvent('WARN', 'Falha ao revogar a sessão no logout: {erro}', { erro: err.message });
    res.json({ ok: false });
  }
});

// Nome do açougue e versão pra tela de login — sem token, porque é antes do login. Só isso sai:
// CNPJ, endereço e o resto continuam atrás de autenticação.
app.get('/api/branding', async (req, res) => {
  try {
    const { rows: [r] } = await pool.query("SELECT value FROM settings WHERE key = 'acougue_business_name'");
    res.json({ nome: (r?.value || '').trim() || 'Rei das Carnes', versao: pkg.version });
  } catch {
    res.json({ nome: 'Rei das Carnes', versao: pkg.version });
  }
});

// ─── Sessões da própria pessoa ────────────────────────────────────────────────

app.get('/api/me/sessions', verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, jti, device, ip, created_at, last_seen_at FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST, created_at DESC`, [req.user.id]);
    res.json(rows.map(s => ({ id: s.id, device: s.device, ip: s.ip, created_at: s.created_at, last_seen_at: s.last_seen_at, atual: s.jti === req.user.jti })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/me/sessions/:id', verifyToken, async (req, res) => {
  try {
    const { rows: [s] } = await pool.query('SELECT jti FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!s) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (s.jti === req.user.jti) return res.status(400).json({ error: 'Esta é a sessão atual — use Sair.' });
    await pool.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ message: 'Sessão encerrada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/me/sessions', verifyToken, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND jti <> $2 AND revoked_at IS NULL', [req.user.id, req.user.jti]);
    await registrarAcesso('sessoes_encerradas', { userId: req.user.id, login: req.user.email, req, detalhe: `${rowCount} sessão(ões)` });
    res.json({ message: rowCount ? `${rowCount} outra(s) sessão(ões) encerrada(s)` : 'Não havia outra sessão aberta', encerradas: rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Equipe (só o dono) ───────────────────────────────────────────────────────

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;

app.get('/api/usuarios/acessos', ...donoOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.evento, e.login, e.ip, e.user_agent, e.detalhe, e.created_at, u.name AS usuario_nome
         FROM auth_events e LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.created_at DESC LIMIT 150`);
    res.json(rows.map(r => ({ ...r, dispositivo: dispositivoDe(r.user_agent), user_agent: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/usuarios', ...donoOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email AS login, u.role, u.active, u.must_change_password, u.password,
              u.last_login_at, u.last_login_ip, u.created_at,
              (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS sessoes_abertas
         FROM users u ORDER BY u.active DESC, u.role, u.name`);
    res.json(rows.map(u => ({
      id: u.id, name: u.name, login: u.login, role: u.role, role_label: ROTULO_PAPEL[u.role] || u.role,
      active: !!u.active, must_change_password: !!u.must_change_password,
      last_login_at: u.last_login_at, last_login_ip: u.last_login_ip, created_at: u.created_at,
      sessoes_abertas: u.sessoes_abertas, eh_voce: u.id === req.user.id,
      // A senha padrão está no README. Enquanto alguém entrar com ela, a tela de Equipe avisa.
      senha_padrao: u.login === 'reidascarnes' && !!u.password && bcrypt.compareSync('reidascarnes', u.password),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', ...donoOnly, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const login = String(req.body.login || '').trim().toLowerCase();
  const role = String(req.body.role || 'caixa');
  if (name.length < 2) return res.status(400).json({ error: 'Informe o nome.' });
  if (!LOGIN_RE.test(login)) {
    return res.status(400).json({ error: 'O login precisa ter de 3 a 40 caracteres: letras minúsculas, números, ponto, traço ou sublinhado.' });
  }
  if (!PAPEIS.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });
  const senha = gerarSenhaProvisoria();
  try {
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (name, email, password, role, must_change_password, active) VALUES ($1,$2,$3,$4,1,1) RETURNING id`,
      [name, login, bcrypt.hashSync(senha, BCRYPT_COST), role]);
    await registrarAcesso('usuario_criado', { userId: req.user.id, login: req.user.email, req, detalhe: `${login} (${ROTULO_PAPEL[role]})` });
    // A senha provisória aparece UMA vez, nesta resposta. Não fica guardada em lugar nenhum
    // legível — quem perder pede outra em "Nova senha provisória".
    res.status(201).json({ id: u.id, name, login, role, role_label: ROTULO_PAPEL[role], senha_provisoria: senha });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse login.' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/usuarios/:id', ...donoOnly, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows: [alvo] } = await pool.query('SELECT id, name, role, active FROM users WHERE id = $1', [id]);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' });

    const name = req.body.name !== undefined ? String(req.body.name).trim() : alvo.name;
    const role = req.body.role !== undefined ? String(req.body.role) : alvo.role;
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : alvo.active;
    if (name.length < 2) return res.status(400).json({ error: 'Informe o nome.' });
    if (!PAPEIS.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });

    // Trancar a própria porta: quem se rebaixa ou se desativa não tem mais como desfazer.
    if (id === req.user.id && (role !== alvo.role || active !== alvo.active)) {
      return res.status(400).json({ error: 'Você não pode alterar o próprio papel nem desativar o próprio acesso.' });
    }
    // Nem deixar a loja sem dono nenhum.
    if (alvo.role === 'dono' && (role !== 'dono' || !active)) {
      const { rows: [{ donos }] } = await pool.query("SELECT COUNT(*)::int AS donos FROM users WHERE role = 'dono' AND active = 1 AND id <> $1", [id]);
      if (donos === 0) return res.status(400).json({ error: 'Este é o único dono ativo. Cadastre outro dono antes.' });
    }

    await pool.query('UPDATE users SET name = $1, role = $2, active = $3 WHERE id = $4', [name, role, active, id]);
    if (!active) {
      // Desativou: derruba tudo que estiver aberto em nome dele, agora.
      await pool.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await registrarAcesso('usuario_desativado', { userId: req.user.id, login: req.user.email, req, detalhe: `#${id} ${name}` });
    } else if (!alvo.active) {
      await registrarAcesso('usuario_reativado', { userId: req.user.id, login: req.user.email, req, detalhe: `#${id} ${name}` });
    }
    if (role !== alvo.role) {
      await registrarAcesso('papel_alterado', { userId: req.user.id, login: req.user.email, req, detalhe: `#${id} ${name}: ${ROTULO_PAPEL[alvo.role]} → ${ROTULO_PAPEL[role]}` });
    }
    res.json({ id, name, role, role_label: ROTULO_PAPEL[role], active: !!active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Nova senha provisória, entregue pelo dono. Derruba TODAS as sessões do alvo (menos a de quem
// pediu, se for pra si mesmo — senão ele não conseguiria nem trocar) e obriga a troca no
// próximo login. Substitui o antigo reset público.
app.post('/api/usuarios/:id/resetar-senha', ...donoOnly, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { rows: [alvo] } = await pool.query('SELECT id, name, email, active FROM users WHERE id = $1', [id]);
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (!alvo.active) return res.status(400).json({ error: 'Reative o acesso antes de gerar uma senha.' });
    const senha = gerarSenhaProvisoria();
    await pool.query('UPDATE users SET password = $1, must_change_password = 1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
      [bcrypt.hashSync(senha, BCRYPT_COST), id]);
    await pool.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL AND jti <> $2', [id, req.user.jti]);
    await registrarAcesso('senha_provisoria_gerada', { userId: req.user.id, login: req.user.email, req, detalhe: `#${id} ${alvo.name}` });
    res.json({ id, login: alvo.email, senha_provisoria: senha });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/auth/profile', verifyToken, (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;

  const applyUpdate = () => {
    db.run(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [name, normalizedEmail, phone || null, req.user.id],
      function(err) {
        if (err) {
          if (err.code === '23505') return res.status(409).json({ error: 'Email já cadastrado' });
          return res.status(500).json({ error: 'Erro ao atualizar perfil' });
        }
        res.json({ name, email: normalizedEmail, phone: phone || null });
      }
    );
  };

  db.get(
    'SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ?',
    [normalizedEmail, req.user.id],
    (err, existingEmail) => {
      if (existingEmail) return res.status(409).json({ error: 'Email já cadastrado' });
      if (!phoneDigits) return applyUpdate();

      db.get(
        `SELECT id FROM users WHERE id != ? AND phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`,
        [req.user.id, phoneDigits],
        (err, existingPhone) => {
          if (existingPhone) return res.status(409).json({ error: 'Telefone já cadastrado' });
          applyUpdate();
        }
      );
    }
  );
});

// Troca de senha pela própria pessoa. Dois casos, uma rota:
//   normal — exige a senha atual;
//   primeiro acesso (must_change_password) — a "atual" é a provisória que o dono entregou e que
//   acabou de ser conferida no login desta sessão; pedir de novo só atrapalha.
// Substitui o POST /api/auth/reset-password, que era PÚBLICO: qualquer pessoa trocava a senha de
// qualquer login só sabendo o nome dele (e o padrão está no README). A rota não existe mais.
//
// "Senha atual incorreta" responde 400, não 401: o front trata 401 com sessão como logout.
app.put('/api/auth/password', verifyToken, async (req, res) => {
  const { old_password, new_password } = req.body;
  const problemas = problemasDaSenha(new_password);
  if (problemas.length) {
    return res.status(400).json({ error: `A nova senha precisa ter ${problemas.join(', ')}.`, code: 'senha_fraca' });
  }
  try {
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (!user.must_change_password && (!old_password || !bcrypt.compareSync(String(old_password), user.password || ''))) {
      return res.status(400).json({ error: 'Senha atual incorreta.', code: 'senha_atual_incorreta' });
    }
    if (user.password && bcrypt.compareSync(String(new_password), user.password)) {
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.', code: 'senha_igual' });
    }
    await pool.query('UPDATE users SET password = $1, must_change_password = 0, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
      [bcrypt.hashSync(String(new_password), BCRYPT_COST), req.user.id]);
    // Derruba as OUTRAS sessões: quem troca a senha por desconfiar de alguém não quer a sessão
    // desse alguém continuando aberta. A atual fica.
    await pool.query('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND jti <> $2 AND revoked_at IS NULL', [req.user.id, req.user.jti]);
    await registrarAcesso('senha_alterada', { userId: req.user.id, login: req.user.email, req });
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    logEvent('ERROR', 'Falha ao alterar a senha de #{id}: {erro}', { id: req.user.id, erro: err.message });
    res.status(500).json({ error: 'Não foi possível alterar a senha agora.' });
  }
});

// ─── Serviços ─────────────────────────────────────────────────────────────────


// ─── Pagamentos ───────────────────────────────────────────────────────────────


// ─── Avaliações ───────────────────────────────────────────────────────────────


// ─── Promoções ────────────────────────────────────────────────────────────────


// ─── Fila de espera ───────────────────────────────────────────────────────────


// ─── Dashboard & Relatórios ───────────────────────────────────────────────────


// ─── Horários de trabalho ─────────────────────────────────────────────────────


// ─── Ausências ────────────────────────────────────────────────────────────────


// ─── Solicitações de folga (escala semanal) ───────────────────────────────────


// ─── Horários bloqueados ──────────────────────────────────────────────────────


// ─── Configurações ────────────────────────────────────────────────────────────


// ─── Relatórios ───────────────────────────────────────────────────────────────


// ─── Usuário logado ───────────────────────────────────────────────────────────

app.get('/api/me', verifyToken, (req, res) => {
  db.get(`SELECT id, name, email, phone, role, document, photo_url, theme, created_at, active, must_change_password,
                 last_login_at, last_login_ip, password_changed_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ...user, role_label: ROTULO_PAPEL[user.role] || user.role, active: !!user.active, must_change_password: !!user.must_change_password });
  });
});

// Gera (na primeira vez) e devolve o código de indicação do cliente logado.
// Idempotente: se já existir, retorna o mesmo — não invalida links já compartilhados.

// Quantas indicações do cliente logado já se converteram em cadastro.

app.patch('/api/me', verifyToken, async (req, res) => {
  try {
    const atual = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!atual) return res.status(404).json({ error: 'Usuário não encontrado' });

    const name = req.body.name ?? atual.name;
    const phone = req.body.phone ?? atual.phone;
    const theme = (req.body.theme === 'light' || req.body.theme === 'dark') ? req.body.theme : atual.theme;

    await db.run('UPDATE users SET name = ?, phone = ?, theme = ? WHERE id = ?', [name, phone, theme, req.user.id]);
    res.json({ id: req.user.id, name, phone, theme });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Notificações (in-app + push) ──────────────────────────────────────────────


// Lê um toggle da tabela settings (chave/valor 'true'/'false'). Sem registro = habilitado por padrão.
function isSettingEnabled(key, cb) {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    cb(!row || row.value !== 'false');
  });
}


// ─── Módulo Açougue ───────────────────────────────────────────────────────────
// `equipe` é o balcão inteiro (dono + caixa); `donoOnly` (definido junto da autenticação) é o
// que mexe no dinheiro do negócio, no fiscal, no estoque, na configuração e nas pessoas. O nome
// antigo `acougueOnly` segue existindo como sinônimo de `equipe`: ~70 rotas o usam, e trocar
// todas de uma vez esconderia no diff as que de fato mudaram de alcance.
//
// O que o caixa alcança: produtos (ler e bipar), vendas e a NFC-e da venda, consulta da NFC-e,
// gaveta, clientes e fiado, conferência de etiqueta e as configurações (só leitura — o cupom
// impresso precisa do CNPJ e dos atalhos). Todo o resto é do dono.

const equipe = [verifyToken, verifyRole(PAPEIS)];
const acougueOnly = equipe;

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
// Peso vai a 3 casas porque a balança do açougue trabalha em gramas (0,588 kg).
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

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
// CSTs de PIS/COFINS que efetivamente geram débito na saída. Os demais (04 monofásico,
// 05 ST, 06 alíquota zero, 07 isenta, 08 sem incidência, 09 suspensão) têm receita que entra
// na apuração como NÃO tributada — aplicar alíquota neles infla o imposto a recolher.
//
// Isso não é detalhe: no cadastro do Rei das Carnes a maioria dos cortes é CST 06 ou 04
// (carne bovina tem alíquota zero pela Lei 10.925/2004), então tratar tudo como tributado
// faz o sistema apurar imposto que a empresa não deve.
const CST_PIS_COFINS_TRIBUTADO = new Set(['01', '02']);

// Registra uma movimentação no livro de estoque. Recebe o `client` da transação em curso para
// que o lançamento nasça e morra junto com a operação que o gerou — movimentação gravada de
// uma venda que deu rollback seria pior que não registrar nada.
async function registrarMovimento(client, { productId = null, carcassEntryId = null, tipo, quantidade, motivo = null, refType = null, refId = null, userId = null }) {
  let saldoApos = null;
  if (productId) {
    const { rows } = await client.query('SELECT stock_qty FROM acougue_products WHERE id = $1', [productId]);
    saldoApos = rows[0] ? round3(rows[0].stock_qty) : null;
  }
  await client.query(
    `INSERT INTO acougue_stock_movements (product_id, carcass_entry_id, tipo, quantidade, saldo_apos, motivo, ref_type, ref_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [productId, carcassEntryId, tipo, round3(quantidade), saldoApos, motivo, refType, refId, userId]);
}

// Normaliza o CST vindo do cadastro: as planilhas trazem "1", "01" e "001" para a mesma coisa.
function normalizaCst(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos ? digitos.padStart(2, '0').slice(-2) : null;
}

async function calcApuracao(month, year) {
  const { start, end } = monthRange(month, year);
  const settings = await getAcougueSettingsMap();
  const pisRate = (Number(settings.pis_rate) || 1.65) / 100;
  const cofinsRate = (Number(settings.cofins_rate) || 7.6) / 100;
  // No regime cumulativo (Lucro Presumido) não existe aproveitamento de crédito sobre
  // entradas. Antes o sistema calculava crédito de qualquer jeito e só avisava na tela —
  // o número saía errado para quem estivesse nesse regime.
  const cumulativo = settings.regime_tributario === 'lucro_presumido';

  /* ── DÉBITO: saídas, item a item, respeitando o CST de cada produto ── */
  const itensVendidos = await db.all(
    `SELECT si.subtotal, p.pis_cst, p.cofins_cst
     FROM acougue_sale_items si
     JOIN acougue_sales s ON s.id = si.sale_id
     LEFT JOIN acougue_products p ON p.id = si.product_id
     WHERE s.created_at >= ? AND s.created_at < ? AND s.status = 'concluida'`, [start, end]);

  let base_pis_tributada = 0, base_pis_nao_tributada = 0;
  let base_cofins_tributada = 0, base_cofins_nao_tributada = 0;
  let itens_sem_cst = 0;

  for (const item of itensVendidos) {
    const valor = Number(item.subtotal) || 0;
    const pisCst = normalizaCst(item.pis_cst);
    const cofinsCst = normalizaCst(item.cofins_cst);
    // Produto sem CST cadastrado é tratado como TRIBUTADO de propósito: subestimar imposto
    // é o erro caro. O contador vê a contagem no relatório e corrige o cadastro.
    if (!pisCst || !cofinsCst) itens_sem_cst++;

    if (!pisCst || CST_PIS_COFINS_TRIBUTADO.has(pisCst)) base_pis_tributada += valor;
    else base_pis_nao_tributada += valor;

    if (!cofinsCst || CST_PIS_COFINS_TRIBUTADO.has(cofinsCst)) base_cofins_tributada += valor;
    else base_cofins_nao_tributada += valor;
  }

  // Cortes vendidos direto (atacado, fora do caixa). Não passam por produto cadastrado, então
  // não há CST — entram como tributados, que é o tratamento conservador.
  const { rows: [{ total: cortesVendaTotal }] } = await pool.query(
    `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_cuts
     WHERE output_date >= $1 AND output_date < $2 AND destination = 'venda_direta'`, [start, end]);
  const cortes_venda_direta = Number(cortesVendaTotal);
  base_pis_tributada += cortes_venda_direta;
  base_cofins_tributada += cortes_venda_direta;

  /* ── CRÉDITO: preferir o valor real das notas de entrada ── */
  // Nota importada por XML traz o PIS/COFINS que o fornecedor efetivamente destacou. Esse é o
  // crédito documentado — muito melhor que estimar aplicando alíquota sobre o valor da compra.
  const { rows: [notasXml] } = await pool.query(
    `SELECT COALESCE(SUM(valor_pis), 0) AS pis, COALESCE(SUM(valor_cofins), 0) AS cofins,
            COALESCE(SUM(valor_total), 0) AS total, COUNT(*)::int AS qtd
     FROM acougue_purchase_invoices WHERE data_emissao >= $1 AND data_emissao < $2`, [start, end]);

  // Entradas de carcaça lançadas à mão (sem XML) continuam estimadas pela alíquota, porque não
  // há documento com valor destacado. Fica separado no retorno para o contador enxergar quanto
  // do crédito é documentado e quanto é estimativa.
  const { rows: [{ total: entradasManuais }] } = await pool.query(
    `SELECT COALESCE(SUM(total_value), 0) as total FROM acougue_carcass_entries
     WHERE entry_date >= $1 AND entry_date < $2`, [start, end]);

  const entradas_com_nota = Number(notasXml.total);
  const entradas_manuais = Number(entradasManuais);
  const pis_credit_documentado = cumulativo ? 0 : round2(Number(notasXml.pis));
  const cofins_credit_documentado = cumulativo ? 0 : round2(Number(notasXml.cofins));
  const pis_credit_estimado = cumulativo ? 0 : round2(entradas_manuais * pisRate);
  const cofins_credit_estimado = cumulativo ? 0 : round2(entradas_manuais * cofinsRate);

  const pis_debit = round2(base_pis_tributada * pisRate);
  const cofins_debit = round2(base_cofins_tributada * cofinsRate);
  const pis_credit = round2(pis_credit_documentado + pis_credit_estimado);
  const cofins_credit = round2(cofins_credit_documentado + cofins_credit_estimado);

  return {
    month: Number(month), year: Number(year),
    regime: cumulativo ? 'lucro_presumido' : 'lucro_real',
    cumulativo,
    entradas_total: round2(entradas_com_nota + entradas_manuais),
    entradas_com_nota: round2(entradas_com_nota),
    entradas_manuais: round2(entradas_manuais),
    notas_entrada_qtd: notasXml.qtd,
    saidas_total: round2(base_pis_tributada + base_pis_nao_tributada),
    base_pis_tributada: round2(base_pis_tributada),
    base_pis_nao_tributada: round2(base_pis_nao_tributada),
    base_cofins_tributada: round2(base_cofins_tributada),
    base_cofins_nao_tributada: round2(base_cofins_nao_tributada),
    cortes_venda_direta: round2(cortes_venda_direta),
    itens_sem_cst,
    pis_rate: round2(pisRate * 100), cofins_rate: round2(cofinsRate * 100),
    pis_credit, pis_credit_documentado, pis_credit_estimado,
    pis_debit, pis_due: round2(Math.max(0, pis_debit - pis_credit)),
    cofins_credit, cofins_credit_documentado, cofins_credit_estimado,
    cofins_debit, cofins_due: round2(Math.max(0, cofins_debit - cofins_credit)),
    // Saldo credor não some: a lei permite carregar para o período seguinte. Antes o
    // Math.max(0, ...) simplesmente descartava esse valor sem mostrar em lugar nenhum.
    pis_saldo_credor: round2(Math.max(0, pis_credit - pis_debit)),
    cofins_saldo_credor: round2(Math.max(0, cofins_credit - cofins_debit)),
  };
}

// Totais de um mês SEM o custo da apuração fiscal. calcApuracao() chega aos mesmos números, mas
// para isso carrega item a item para classificar o CST de PIS/COFINS de cada um — caro demais
// para um painel que se consulta sozinho a cada minuto e que não mostra nada de tributário.
//
// As definições seguem calcApuracao() de propósito: saída = venda do caixa + corte vendido
// direto (atacado); entrada = nota de compra importada por XML + carcaça lançada à mão.
// Divergir daqui faria o painel e a tela de PIS/COFINS mostrarem números diferentes para o
// mesmo mês, e aí ninguém sabe em qual acreditar.
async function totaisDoMes(month, year) {
  const { start, end } = monthRange(month, year);
  const { rows: [r] } = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(si.subtotal), 0) FROM acougue_sale_items si
          JOIN acougue_sales s ON s.id = si.sale_id
         WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'concluida') AS vendas,
       (SELECT COALESCE(SUM(total_value), 0) FROM acougue_cuts
         WHERE output_date >= $1 AND output_date < $2 AND destination = 'venda_direta') AS cortes,
       (SELECT COALESCE(SUM(valor_total), 0) FROM acougue_purchase_invoices
         WHERE data_emissao >= $1 AND data_emissao < $2) AS notas,
       (SELECT COALESCE(SUM(total_value), 0) FROM acougue_carcass_entries
         WHERE entry_date >= $1 AND entry_date < $2) AS carcacas`,
    [start, end]
  );
  return {
    entradas: round2(Number(r.notas) + Number(r.carcacas)),
    saidas: round2(Number(r.vendas) + Number(r.cortes)),
  };
}

/* ---- Dashboard ---- */
// Tudo aqui é recalculado a cada chamada, sem cache: a tela se consulta de novo sozinha a cada
// minuto, e "hoje", "ontem" e "mês anterior" mudam de significado na virada do dia e do mês.
// Um valor guardado em memória mostraria o dia errado para quem deixa o painel aberto.
app.get('/api/acougue/dashboard', ...donoOnly, async (req, res) => {
  try {
    const now = new Date();
    const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ontem = new Date(now);
    ontem.setDate(ontem.getDate() - 1);
    // new Date(ano, -1, 1) vira dezembro do ano anterior — o JS normaliza sozinho, então
    // janeiro não precisa de caso especial.
    const anterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const VENDAS_DO_DIA =
      `SELECT COALESCE(SUM(total_value), 0) AS total, COUNT(*)::int AS count FROM acougue_sales
        WHERE created_at >= $1::date AND created_at < $1::date + INTERVAL '1 day' AND status = 'concluida'`;

    const [hoje, diaAnterior, mes, mesAnterior, ultimas_entradas, ultimas_saidas] = await Promise.all([
      pool.query(VENDAS_DO_DIA, [dia(now)]),
      pool.query(VENDAS_DO_DIA, [dia(ontem)]),
      totaisDoMes(now.getMonth() + 1, now.getFullYear()),
      totaisDoMes(anterior.getMonth() + 1, anterior.getFullYear()),
      db.all('SELECT * FROM acougue_carcass_entries ORDER BY entry_date DESC, id DESC LIMIT 5', []),
      db.all('SELECT * FROM acougue_cuts ORDER BY output_date DESC, id DESC LIMIT 5', []),
    ]);

    res.json({
      entradas_mes: mes.entradas,
      saidas_mes: mes.saidas,
      saidas_mes_anterior: mesAnterior.saidas,
      mes_anterior_num: anterior.getMonth() + 1,
      mes_anterior_ano: anterior.getFullYear(),
      caixa_hoje: Number(hoje.rows[0].total),
      vendas_hoje: Number(hoje.rows[0].count),
      caixa_ontem: Number(diaAnterior.rows[0].total),
      vendas_ontem: Number(diaAnterior.rows[0].count),
      ultimas_entradas,
      ultimas_saidas,
      // A tela mostra este horário: sem ele não dá para distinguir número de agora de número
      // de uma aba que ficou aberta desde ontem.
      atualizado_em: new Date().toISOString(),
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
    if (!product) return res.status(404).json({ error: 'Produto não encontrado para este código de barras' });
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
      if (!product) return res.status(404).json({ error: 'Produto não encontrado para este código de barras' });
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

app.post('/api/acougue/products', ...donoOnly, async (req, res) => {
  const { barcode, scale_code, name, category, unit, price, cost_price, stock_qty } = req.body;
  const fiscal = ACOUGUE_FISCAL_FIELDS.map(f => req.body[f] ?? null);
  if (!name || price === undefined) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
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

app.patch('/api/acougue/products/:id', ...donoOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_products WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Produto não encontrado' });
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

app.delete('/api/acougue/products/:id', ...donoOnly, async (req, res) => {
  try {
    await db.run('UPDATE acougue_products SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id), active: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Entrada de Carcaça ---- */
app.get('/api/acougue/carcass-entries', ...donoOnly, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (month && year) {
      const { start, end } = monthRange(Number(month), Number(year));
      return res.json(await db.all('SELECT * FROM acougue_carcass_entries WHERE entry_date >= ? AND entry_date < ? ORDER BY entry_date DESC, id DESC', [start, end]));
    }
    res.json(await db.all('SELECT * FROM acougue_carcass_entries ORDER BY entry_date DESC, id DESC LIMIT 200', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/carcass-entries', ...donoOnly, async (req, res) => {
  const { supplier_name, supplier_document, animal_type, weight_kg, unit_price, entry_date, notes } = req.body;
  if (!supplier_name || !weight_kg || !unit_price || !entry_date) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
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

app.patch('/api/acougue/carcass-entries/:id', ...donoOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_carcass_entries WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Registro não encontrado' });
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

app.delete('/api/acougue/carcass-entries/:id', ...donoOnly, async (req, res) => {
  try {
    await db.run('DELETE FROM acougue_carcass_entries WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Saída de Cortes ---- */
app.get('/api/acougue/cuts', ...donoOnly, async (req, res) => {
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
app.post('/api/acougue/cuts', ...donoOnly, async (req, res) => {
  const { carcass_entry_id, product_id, cut_name, weight_kg, unit_price, output_date, destination, notes } = req.body;
  if (!cut_name || !weight_kg || !unit_price || !output_date) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
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

app.patch('/api/acougue/cuts/:id', ...donoOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_cuts WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Registro não encontrado' });
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

app.delete('/api/acougue/cuts/:id', ...donoOnly, async (req, res) => {
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

// Histórico completo de vendas, para a tela de Relatórios (do dono). Precisa vir ANTES de
// '/sales/:id': o Express casa na ordem de declaração, e depois dele "historico" entraria
// como se fosse um id.
//
// Por que é do dono e não do balcão: esta lista é o faturamento do período, venda por venda,
// com quem operou cada uma — e é de onde se cancela venda fechada. A tela do caixa fica virada
// para o cliente, então nada disso pode morar lá.
app.get('/api/acougue/sales/historico', ...donoOnly, async (req, res) => {
  try {
    const de = String(req.query.de || '').slice(0, 10);
    const ate = String(req.query.ate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      return res.status(400).json({ error: 'Informe o período (de e até) no formato AAAA-MM-DD.' });
    }
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
    const pulo = Math.max(Number(req.query.pulo) || 0, 0);
    const busca = String(req.query.q || '').trim();

    // A nota é buscada por LATERAL pegando a MAIS RECENTE: uma venda pode ter uma tentativa que
    // deu erro e outra autorizada depois, e o que interessa na lista é o estado atual dela.
    const filtroBusca = busca ? 'AND s.sale_number ILIKE $5' : '';
    const params = [de, ate, limite, pulo];
    if (busca) params.push(`%${busca}%`);

    const { rows } = await pool.query(
      `SELECT s.id, s.sale_number, s.total_value, s.payment_method, s.status, s.created_at,
              s.desconto, s.acrescimo, s.troco,
              u.name AS operador, c.nome AS cliente,
              i.id AS nota_id, i.status AS nota_status, i.numero AS nota_numero, i.serie AS nota_serie,
              i.danfe_url, i.xml_url, i.chave_acesso, i.error_message AS nota_erro
         FROM acougue_sales s
         LEFT JOIN users u ON u.id = s.created_by
         LEFT JOIN acougue_customers c ON c.id = s.customer_id
         LEFT JOIN LATERAL (
           SELECT inv.* FROM acougue_invoices inv
            WHERE inv.ref_type = 'venda' AND inv.ref_id = s.id
            ORDER BY inv.id DESC LIMIT 1
         ) i ON true
        WHERE s.created_at >= $1::date AND s.created_at < $2::date + INTERVAL '1 day' ${filtroBusca}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT $3 OFFSET $4`,
      params
    );

    // O resumo conta o período inteiro, não só a página: quem olha quer saber quantas vendas e
    // quanto faturou, e paginar não pode mudar esse número.
    const paramsResumo = busca ? [de, ate, `%${busca}%`] : [de, ate];
    const { rows: [resumo] } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE s.status = 'cancelada')::int AS canceladas,
              COALESCE(SUM(s.total_value) FILTER (WHERE s.status <> 'cancelada'), 0) AS faturamento
         FROM acougue_sales s
        WHERE s.created_at >= $1::date AND s.created_at < $2::date + INTERVAL '1 day'
          ${busca ? 'AND s.sale_number ILIKE $3' : ''}`,
      paramsResumo
    );

    res.json({
      vendas: rows,
      total: resumo.total,
      canceladas: resumo.canceladas,
      faturamento: round2(Number(resumo.faturamento)),
      tem_mais: pulo + rows.length < resumo.total,
      focus_configurada: focusNfe.isFocusConfigured(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/sales/:id', ...acougueOnly, async (req, res) => {
  try {
    const sale = await db.get('SELECT * FROM acougue_sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
    const items = await db.all('SELECT * FROM acougue_sale_items WHERE sale_id = ?', [req.params.id]);
    res.json({ ...sale, items });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Transação real (BEGIN/COMMIT) porque mexe em dinheiro e estoque ao mesmo tempo — um erro no
// meio do loop de itens não pode deixar a venda "meio registrada" com estoque decrementado sem
// a venda existir, ou vice-versa.
app.post('/api/acougue/sales', ...acougueOnly, async (req, res) => {
  const { items, payment_method, desconto, acrescimo, pagamentos, customer_id, vendedor_id } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um item' });
  }
  const descontoVenda = Number(desconto) || 0;
  const acrescimoVenda = Number(acrescimo) || 0;
  if (descontoVenda < 0 || acrescimoVenda < 0) {
    return res.status(400).json({ error: 'Desconto e acréscimo não podem ser negativos.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolvedItems = [];
    let total = 0;
    for (const it of items) {
      const quantity = Number(it.quantity);
      if (!quantity || quantity <= 0) throw Object.assign(new Error('Quantidade inválida em um dos itens'), { code: 'BAD_INPUT' });
      const { rows } = await client.query(
        it.barcode ? 'SELECT * FROM acougue_products WHERE barcode = $1 AND active = 1' : 'SELECT * FROM acougue_products WHERE id = $1 AND active = 1',
        [it.barcode || it.product_id]
      );
      const product = rows[0];
      if (!product) throw Object.assign(new Error(`Produto não encontrado: ${it.barcode || it.product_id}`), { code: 'BAD_INPUT' });
      const descontoItem = Number(it.desconto) || 0;
      const bruto = round2(product.price * quantity);
      if (descontoItem < 0 || descontoItem > bruto) {
        throw Object.assign(new Error(`Desconto inválido em ${product.name}: não pode ser negativo nem maior que o item.`), { code: 'BAD_INPUT' });
      }
      const subtotal = round2(bruto - descontoItem);
      total += subtotal;
      resolvedItems.push({ product, quantity, subtotal, descontoItem });
    }
    const totalFinal = round2(total - descontoVenda + acrescimoVenda);
    if (totalFinal < 0) {
      throw Object.assign(new Error('O desconto não pode ser maior que o total da venda.'), { code: 'BAD_INPUT' });
    }

    // Pagamentos: aceita a lista discriminada (venda dividida) ou, sem ela, a forma única —
    // o caixa antigo mandava só `payment_method` e continua funcionando.
    const listaPagamentos = Array.isArray(pagamentos) && pagamentos.length
      ? pagamentos.map(p => ({ forma: p.forma, valor: round2(Number(p.valor) || 0), valor_recebido: p.valor_recebido != null ? Number(p.valor_recebido) : null }))
      : [{ forma: payment_method || 'dinheiro', valor: totalFinal, valor_recebido: null }];

    const somaPagamentos = round2(listaPagamentos.reduce((s, p) => s + p.valor, 0));
    // Tolerância de 1 centavo para arredondamento; acima disso é erro de digitação e a venda
    // não pode fechar, senão o caixa nunca vai bater no fim do dia.
    if (Math.abs(somaPagamentos - totalFinal) > 0.01) {
      throw Object.assign(new Error(`Os pagamentos somam ${somaPagamentos.toFixed(2)} mas a venda é ${totalFinal.toFixed(2)}.`), { code: 'BAD_INPUT' });
    }

    // Troco só existe sobre dinheiro: o que o cliente entregou menos o que foi pago em espécie.
    const emDinheiro = listaPagamentos.filter(p => p.forma === 'dinheiro');
    const recebido = emDinheiro.reduce((s, p) => s + (p.valor_recebido ?? p.valor), 0);
    const devidoEmDinheiro = emDinheiro.reduce((s, p) => s + p.valor, 0);
    const troco = round2(Math.max(0, recebido - devidoEmDinheiro));

    const sessao = await client.query('SELECT id FROM acougue_cash_sessions WHERE fechado_em IS NULL')
      .then(r => r.rows[0] || null);

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int as count FROM acougue_sales');
    const saleNumber = `V${String(count + 1).padStart(6, '0')}`;
    // Fiado exige cliente: dívida sem dono é exatamente o buraco do caderno de papel.
    const valorFiado = round2(listaPagamentos.filter(p => p.forma === 'credito_loja').reduce((s, p) => s + p.valor, 0));
    if (valorFiado > 0 && !customer_id) {
      throw Object.assign(new Error('Venda no fiado precisa de cliente. Selecione quem está levando.'), { code: 'BAD_INPUT' });
    }

    const { rows: [sale] } = await client.query(
      `INSERT INTO acougue_sales (sale_number, total_value, payment_method, created_by, desconto, acrescimo, troco, cash_session_id, customer_id, vendedor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [saleNumber, totalFinal, listaPagamentos[0].forma, req.user.id, descontoVenda, acrescimoVenda, troco, sessao?.id || null,
       customer_id || null, vendedor_id || null]
    );

    if (valorFiado > 0) {
      await client.query(
        'INSERT INTO acougue_receivables (customer_id, sale_id, valor, created_by) VALUES ($1,$2,$3,$4)',
        [customer_id, sale.id, valorFiado, req.user.id]);
    }
    for (const pg of listaPagamentos) {
      await client.query('INSERT INTO acougue_sale_payments (sale_id, forma, valor, valor_recebido) VALUES ($1,$2,$3,$4)',
        [sale.id, pg.forma, pg.valor, pg.valor_recebido]);
    }
    const savedItems = [];
    for (const ri of resolvedItems) {
      await client.query(
        'INSERT INTO acougue_sale_items (sale_id, product_id, product_name, barcode, quantity, unit_price, subtotal, desconto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [sale.id, ri.product.id, ri.product.name, ri.product.barcode, ri.quantity, ri.product.price, ri.subtotal, ri.descontoItem || 0]
      );
      await client.query('UPDATE acougue_products SET stock_qty = stock_qty - $1 WHERE id = $2', [ri.quantity, ri.product.id]);
      await registrarMovimento(client, {
        productId: ri.product.id, tipo: 'venda', quantidade: -ri.quantity,
        motivo: `Venda ${saleNumber}`, refType: 'venda', refId: sale.id, userId: req.user.id });
      savedItems.push({ product_id: ri.product.id, name: ri.product.name, barcode: ri.product.barcode, quantity: ri.quantity, unit_price: ri.product.price, subtotal: ri.subtotal });
    }
    await client.query('COMMIT');

    // Gaveta abre sozinha só quando entrou dinheiro em espécie: em cartão ou PIX não há
    // cédula a guardar nem troco a dar, e abrir à toa expõe o caixa.
    const cfgGaveta = gaveta.configDeSettings(await getAcougueSettingsMap());
    const temDinheiro = listaPagamentos.some(pg => pg.forma === 'dinheiro' && pg.valor > 0);
    res.status(201).json({
      ...sale, items: savedItems, pagamentos: listaPagamentos, troco,
      abrir_gaveta: cfgGaveta.ativa && cfgGaveta.abrirNoDinheiro && temDinheiro,
    });
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
  try {
    const sale = await db.get('SELECT * FROM acougue_sales WHERE id = ?', [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
    if (sale.status === 'cancelada') return res.status(409).json({ error: 'Esta venda está cancelada — não é possível emitir nota.' });

    // 'rascunho' entra na trava junto com autorizada/processando: sem o token da Focus toda
    // emissão vira rascunho, e sem isso apertar Finalizar duas vezes (ou o operador insistir
    // porque "não imprimiu") criava uma nota nova a cada clique para a MESMA venda. Só status
    // 'erro' libera nova tentativa, que é justamente o caso em que reemitir faz sentido.
    const existing = await db.get(
      // 'denegada' entra na trava junto com as outras: a SEFAZ denega por irregularidade
      // fiscal e CONSOME o número da nota. Reemitir para a mesma venda gera outra denegação e
      // queima mais um número — o caminho é resolver a pendência fiscal, não tentar de novo.
      "SELECT * FROM acougue_invoices WHERE ref_type = 'venda' AND ref_id = ? AND status IN ('autorizada','processando','rascunho','denegada')", [sale.id]);
    if (existing) {
      return res.status(409).json({
        error: `Esta venda já tem nota ${existing.numero ? `nº ${existing.numero}` : `em ${existing.status}`}.`,
        invoice: existing,
      });
    }

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
      return res.status(422).json({ error: 'Preencha o CNPJ e a Inscrição Estadual do açougue em Configurações antes de emitir notas.' });
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
      pagamentos: await db.all('SELECT forma, valor FROM acougue_sale_payments WHERE sale_id = ?', [sale.id]),
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
      let result = await focusNfe.emitNFCe(ref, payload);
      let emContingencia = false;

      // SEFAZ fora do ar não pode parar o balcão: a lei permite emitir em contingência
      // offline e transmitir depois. Só entra aqui por indisponibilidade — nota recusada por
      // dado errado seria recusada de novo na efetivação, com o cupom já na mão do cliente.
      if (focusNfe.statusInterno(result) === 'erro' && focusNfe.deveUsarContingencia(result)) {
        const numero = Number(settings.nfce_proximo_numero_contingencia || 1);
        const serie = String(settings.nfce_serie_contingencia || 9);
        const contingenciaPayload = {
          ...payload, numero: String(numero), serie,
          codigo_unico: focusNfe.gerarCodigoUnico(numero),
        };
        const tentativa = await focusNfe.emitNFCeContingencia(`${ref}-cont`, contingenciaPayload);
        if (focusNfe.statusInterno(tentativa) !== 'erro') {
          result = tentativa;
          emContingencia = true;
          await db.run('UPDATE settings SET value = ? WHERE key = ?',
            [String(numero + 1), 'acougue_nfce_proximo_numero_contingencia']);
        }
      }

      // NFC-e é síncrona: `autorizado` ou `erro_autorizacao` já vêm nesta resposta. O status
      // chega a vir com HTTP 201 mesmo quando a SEFAZ REJEITOU, então não dá pra confiar só
      // no código HTTP — quem decide é o campo `status`.
      const status = focusNfe.statusInterno(result);
      const d = result.data || {};
      await db.run(
        `UPDATE acougue_invoices SET status=?, focus_ref=?, chave_acesso=?, numero=?, serie=?,
           xml_url=?, danfe_url=?, qrcode_url=?, url_consulta=?, status_sefaz=?, error_message=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [status, ref, d.chave_nfe || null, d.numero || null, d.serie || null,
         focusNfe.urlAbsoluta(d.caminho_xml_nota_fiscal), focusNfe.urlAbsoluta(d.caminho_danfe),
         d.qrcode_url || null, d.url_consulta_nf || null, d.status_sefaz || null,
         status === 'erro' ? (d.mensagem_sefaz || d.mensagem || 'Erro na Focus NFe') : null, invoiceId]
      );
      if (emContingencia) {
        await db.run('UPDATE acougue_invoices SET contingencia = 1, contingencia_efetivada = ? WHERE id = ?',
          [d.contingencia_offline_efetivada ? 1 : 0, invoiceId]);
      }
      const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [invoiceId]);
      res.status(201).json({ ...invoice, sale_id: sale.id, raw: result.data });
    } catch (focusErr) {
      await db.run("UPDATE acougue_invoices SET status = 'erro', error_message = ? WHERE id = ?", [focusErr.message, invoiceId]);
      res.status(502).json({ id: invoiceId, status: 'erro', sale_id: sale.id, error: focusErr.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cancelar venda JÁ FECHADA devolve estoque e apaga faturamento — é decisão de dono, não ação
// de balcão com cliente na frente (por isso saiu da tela do caixa e virou donoOnly).
app.post('/api/acougue/sales/:id/cancel', ...donoOnly, async (req, res) => {
  const motivo = String(req.body?.motivo || '').trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [sale] } = await client.query('SELECT * FROM acougue_sales WHERE id = $1', [req.params.id]);
    if (!sale) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venda não encontrada' }); }
    if (sale.status === 'cancelada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Venda já está cancelada' }); }

    // A venda não pode ser cancelada por baixo de uma nota que a SEFAZ autorizou. Antes isso
    // passava: o estoque voltava, o faturamento sumia, e a NFC-e continuava valendo lá fora —
    // documento fiscal dizendo que a venda aconteceu, sem venda nenhuma no sistema. Cancelar a
    // nota é outro ato, tem prazo legal (30 min) e exige justificativa, então quem decide é o
    // dono, ciente do prazo.
    const { rows: [notaViva] } = await client.query(
      `SELECT id, numero, serie FROM acougue_invoices
        WHERE ref_type = 'venda' AND ref_id = $1 AND status = 'autorizada'
        ORDER BY id DESC LIMIT 1`, [sale.id]);
    if (notaViva) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Esta venda tem a NFC-e nº ${notaViva.numero || '—'} autorizada na SEFAZ. Cancele a nota antes de cancelar a venda — o prazo legal é de 30 minutos após a emissão.`,
        code: 'nota_autorizada',
        nota_id: notaViva.id,
        nota_numero: notaViva.numero,
      });
    }

    const { rows: saleItems } = await client.query('SELECT * FROM acougue_sale_items WHERE sale_id = $1', [sale.id]);
    for (const it of saleItems) {
      if (it.product_id) {
        await client.query('UPDATE acougue_products SET stock_qty = stock_qty + $1 WHERE id = $2', [it.quantity, it.product_id]);
        await registrarMovimento(client, {
          productId: it.product_id, tipo: 'cancelamento_venda', quantidade: it.quantity,
          motivo: motivo ? `Cancelamento da venda ${sale.sale_number}: ${motivo}` : `Cancelamento da venda ${sale.sale_number}`,
          refType: 'venda', refId: sale.id, userId: req.user.id });
      }
    }
    await client.query("UPDATE acougue_sales SET status = 'cancelada' WHERE id = $1", [sale.id]);
    await client.query('COMMIT');
    logEvent('WARN', 'Venda {numero} cancelada por {usuario}{motivo}', {
      numero: sale.sale_number, usuario: req.user.name || req.user.email,
      motivo: motivo ? ` — ${motivo}` : '' });
    res.json({ id: sale.id, status: 'cancelada' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* ---- Emissão de Nota (Focus NFe) ---- */
app.get('/api/acougue/nfe', ...donoOnly, async (req, res) => {
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
app.post('/api/acougue/nfe', ...donoOnly, async (req, res) => {
  const { type, ref_type, ref_id, total_value, itens, destinatario, natureza_operacao } = req.body;
  if (!type || !['entrada', 'saida'].includes(type) || !total_value) {
    return res.status(400).json({ error: 'Tipo (entrada/saida) e valor total são obrigatórios' });
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
        warning: 'Focus NFe não configurado — esta nota fica como rascunho local até você configurar FOCUS_NFE_TOKEN no servidor (veja .env.example).',
      });
    }

    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj || !settings.ie) {
      await db.run("UPDATE acougue_invoices SET status = 'erro', error_message = ? WHERE id = ?", ['CNPJ/IE do açougue não configurados', invoiceId]);
      return res.status(422).json({ id: invoiceId, status: 'erro', error: 'Preencha o CNPJ e a Inscrição Estadual do açougue em Configurações antes de emitir notas.' });
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

app.get('/api/acougue/nfe/:id', ...donoOnly, async (req, res) => {
  try {
    const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Nota não encontrada' });
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

app.post('/api/acougue/nfe/:id/cancel', ...donoOnly, async (req, res) => {
  const { justificativa } = req.body;
  try {
    const invoice = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!invoice) return res.status(404).json({ error: 'Nota não encontrada' });
    if (invoice.status === 'autorizada' && focusNfe.isFocusConfigured() && invoice.focus_ref) {
      if (!justificativa || justificativa.length < 15) {
        return res.status(400).json({ error: 'A justificativa de cancelamento deve ter ao menos 15 caracteres (exigência da SEFAZ)' });
      }
      const result = await focusNfe.cancelNFe(invoice.focus_ref, justificativa);
      if (!result.ok) return res.status(502).json({ error: result.data?.mensagem_sefaz || result.data?.mensagem || 'Falha ao cancelar na SEFAZ' });
    }
    await db.run("UPDATE acougue_invoices SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    res.json({ id: Number(req.params.id), status: 'cancelada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- PIS / COFINS ---- */
app.get('/api/acougue/taxes/apuracao', ...donoOnly, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const year = Number(req.query.year) || now.getFullYear();
    const apuracao = await calcApuracao(month, year);
    const closed = await db.get('SELECT * FROM acougue_tax_periods WHERE ref_month = ? AND ref_year = ?', [month, year]);
    res.json({ ...apuracao, closed: !!closed, closed_snapshot: closed || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/taxes/periods', ...donoOnly, async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM acougue_tax_periods ORDER BY ref_year DESC, ref_month DESC', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/taxes/periods/close', ...donoOnly, async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Informe mês e ano' });
  try {
    const existing = await db.get('SELECT id FROM acougue_tax_periods WHERE ref_month = ? AND ref_year = ?', [month, year]);
    if (existing) return res.status(409).json({ error: 'Este período já foi fechado' });
    const apuracao = await calcApuracao(Number(month), Number(year));
    const { rows } = await db.run(
      'INSERT INTO acougue_tax_periods (ref_month, ref_year, pis_credit, pis_debit, pis_due, cofins_credit, cofins_debit, cofins_due, closed_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [month, year, apuracao.pis_credit, apuracao.pis_debit, apuracao.pis_due, apuracao.cofins_credit, apuracao.cofins_debit, apuracao.cofins_due, req.user.id]
    );
    res.status(201).json({ id: rows[0].id, ...apuracao });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Consulta e cancelamento de NFC-e ---- */
// Reconsulta a nota na Focus e atualiza o que temos. Serve para dois casos reais do balcão:
// a emissão respondeu mas a rede caiu antes de gravarmos, ou alguém precisa reimprimir uma
// nota antiga e o DANFE não está mais em cache.
/* ---- DANFE e XML servidos pelo próprio sistema ---- */
// O cupom do cliente (DANFE NFC-e) e o XML da nota passam a sair DAQUI, não de um link da
// Focus aberto no navegador do caixa. O servidor busca com o token e devolve o arquivo.
//
// Por que não deixar o navegador ir direto: a máquina do balcão passaria a precisar de
// internet além do servidor, o pop-up do link externo morre em bloqueador, e o endereço do
// arquivo (com o token, em algumas rotas) circularia no cliente.
//
// É `equipe`: reimprimir o cupom do cliente é trabalho de balcão, não decisão de dono.
async function servirArquivoDaNota(req, res, { campo, oQueE, nomeArquivo }) {
  try {
    const nota = await db.get('SELECT id, status, numero, serie, xml_url, danfe_url FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (!nota[campo]) {
      return res.status(422).json({
        error: nota.status === 'autorizada'
          ? `Esta nota está autorizada mas o sistema não guardou o endereço do ${oQueE}. Use "Consultar na SEFAZ" para buscá-lo de novo.`
          : `Esta nota está como "${nota.status}" — ${oQueE} só existe depois que a SEFAZ autoriza.`,
        code: 'sem_arquivo',
      });
    }
    const arquivo = await focusNfe.baixarArquivo(nota[campo]);
    if (!arquivo.ok) {
      logEvent('ERROR', 'Focus recusou o {oQueE} da nota #{id}: HTTP {status}', { oQueE, id: nota.id, status: arquivo.status });
      return res.status(502).json({ error: `A Focus NFe não devolveu o ${oQueE} (HTTP ${arquivo.status}).` });
    }
    // inline: o DANFE abre para imprimir na hora; o XML o contador salva.
    const nome = `${nomeArquivo}-${nota.numero || nota.id}`;
    res.set('Content-Type', arquivo.contentType);
    res.set('Content-Disposition', `${campo === 'xml_url' ? 'attachment' : 'inline'}; filename="${nome}${campo === 'xml_url' ? '.xml' : '.html'}"`);
    res.send(arquivo.buffer);
  } catch (err) {
    if (err.code === 'FOCUS_NOT_CONFIGURED') return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });
    if (err.code === 'FOCUS_URL_INVALIDA') return res.status(422).json({ error: 'O endereço guardado para este arquivo não aponta para a Focus NFe.' });
    if (err.code === 'FOCUS_NETWORK_ERROR') return res.status(502).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/acougue/notas/:id/danfe', ...acougueOnly, (req, res) =>
  servirArquivoDaNota(req, res, { campo: 'danfe_url', oQueE: 'DANFE', nomeArquivo: 'danfe' }));

app.get('/api/acougue/notas/:id/xml', ...acougueOnly, (req, res) =>
  servirArquivoDaNota(req, res, { campo: 'xml_url', oQueE: 'XML', nomeArquivo: 'nfe' }));

app.post('/api/acougue/nfce/:id/consultar', ...acougueOnly, async (req, res) => {
  try {
    const nota = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (!nota.focus_ref) return res.status(422).json({ error: 'Esta nota nunca foi enviada à Focus (ficou como rascunho).' });
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });

    const result = await focusNfe.consultNFCe(nota.focus_ref);
    if (result.status === 404) {
      return res.status(404).json({ error: 'A Focus não conhece esta referência — a nota não chegou a ser criada lá.' });
    }
    const d = result.data || {};
    const status = focusNfe.statusInterno(result);
    await db.run(
      `UPDATE acougue_invoices SET status=?, chave_acesso=?, numero=?, serie=?, xml_url=?, danfe_url=?,
         qrcode_url=?, url_consulta=?, status_sefaz=?, error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [status, d.chave_nfe || nota.chave_acesso, d.numero || nota.numero, d.serie || nota.serie,
       focusNfe.urlAbsoluta(d.caminho_xml_nota_fiscal) || nota.xml_url,
       focusNfe.urlAbsoluta(d.caminho_danfe) || nota.danfe_url,
       d.qrcode_url || nota.qrcode_url, d.url_consulta_nf || nota.url_consulta, d.status_sefaz || null,
       status === 'erro' ? (d.mensagem_sefaz || d.mensagem || null) : null, req.params.id]);

    res.json({ ...(await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id])), sefaz: d.mensagem_sefaz || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cancelamento tem prazo legal (em geral 30 min para NFC-e) e exige justificativa de no
// mínimo 15 caracteres — a SEFAZ recusa texto curto, então validamos antes de gastar a chamada.
app.post('/api/acougue/nfce/:id/cancelar', ...donoOnly, async (req, res) => {
  const justificativa = String(req.body?.justificativa || '').trim();
  if (justificativa.length < 15) {
    return res.status(400).json({ error: 'A SEFAZ exige justificativa com no mínimo 15 caracteres.' });
  }
  try {
    const nota = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'autorizada') {
      return res.status(409).json({ error: `Só dá para cancelar nota autorizada. Esta está como "${nota.status}".` });
    }
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });

    const result = await focusNfe.cancelNFCe(nota.focus_ref, justificativa);
    const d = result.data || {};
    if (!result.ok && d.status !== 'cancelado') {
      return res.status(502).json({ error: d.mensagem_sefaz || d.mensagem || 'A SEFAZ recusou o cancelamento.', raw: d });
    }
    await db.run(
      "UPDATE acougue_invoices SET status='cancelada', error_message=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      [`Cancelada: ${justificativa}`, req.params.id]);
    res.json({ id: Number(req.params.id), status: 'cancelada', sefaz: d.mensagem_sefaz || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Inutilização de numeração ---- */
// Declara à SEFAZ que um intervalo de números não virou nota. Buraco na sequência sem
// inutilização declarada é achado clássico de auditoria fiscal.
app.post('/api/acougue/nfce/inutilizar', ...donoOnly, async (req, res) => {
  const { serie, numero_inicial, numero_final, justificativa } = req.body || {};
  const just = String(justificativa || '').trim();
  if (!serie || !numero_inicial || !numero_final) {
    return res.status(400).json({ error: 'Informe série, número inicial e número final.' });
  }
  if (Number(numero_final) < Number(numero_inicial)) {
    return res.status(400).json({ error: 'O número final não pode ser menor que o inicial.' });
  }
  if (just.length < 15) {
    return res.status(400).json({ error: 'A SEFAZ exige justificativa com no mínimo 15 caracteres.' });
  }
  try {
    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj) return res.status(422).json({ error: 'CNPJ do açougue não configurado.' });
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });

    const result = await focusNfe.inutilizarNumeracao({
      cnpj: settings.cnpj, serie, numeroInicial: numero_inicial, numeroFinal: numero_final, justificativa: just,
    });
    const d = result.data || {};
    if (!result.ok) {
      return res.status(502).json({ error: d.mensagem_sefaz || d.mensagem || 'A SEFAZ recusou a inutilização.', raw: d });
    }
    res.status(201).json({ ok: true, serie, numero_inicial, numero_final, sefaz: d.mensagem_sefaz || null, raw: d });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/nfce/inutilizacoes', ...donoOnly, async (req, res) => {
  try {
    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj) return res.status(422).json({ error: 'CNPJ do açougue não configurado.' });
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });
    const result = await focusNfe.consultarInutilizacoes(settings.cnpj);
    res.status(result.ok ? 200 : 502).json(result.data || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Carta de correção (apenas NF-e modelo 55) ---- */
app.post('/api/acougue/nfe/:id/carta-correcao', ...donoOnly, async (req, res) => {
  const correcao = String(req.body?.correcao || '').trim();
  if (correcao.length < 15) {
    return res.status(400).json({ error: 'A SEFAZ exige texto de correção com no mínimo 15 caracteres.' });
  }
  try {
    const nota = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    // A legislação não admite carta de correção para NFC-e: nota de consumidor errada se
    // cancela e reemite. Barrar aqui evita uma recusa confusa lá na SEFAZ.
    if (String(nota.focus_ref || '').includes('nfce')) {
      return res.status(409).json({ error: 'Carta de correção não existe para NFC-e (modelo 65). Cancele a nota e emita outra.' });
    }
    if (nota.status !== 'autorizada') {
      return res.status(409).json({ error: `Só cabe carta de correção em nota autorizada. Esta está como "${nota.status}".` });
    }
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });

    const result = await focusNfe.cartaCorrecaoNFe(nota.focus_ref, correcao);
    const d = result.data || {};
    if (!result.ok) return res.status(502).json({ error: d.mensagem_sefaz || d.mensagem || 'A SEFAZ recusou a carta de correção.', raw: d });
    res.status(201).json({ ok: true, sefaz: d.mensagem_sefaz || null, raw: d });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Contingência offline ---- */
// Notas emitidas em contingência que ainda não foram efetivadas na SEFAZ. Isso é dívida
// fiscal aberta: a lei dá prazo para transmitir, e passar do prazo gera multa. Por isso fica
// visível como contador, não escondido num relatório.
app.get('/api/acougue/nfce/contingencia', ...donoOnly, async (req, res) => {
  try {
    const pendentes = await db.all(
      `SELECT i.*, s.sale_number FROM acougue_invoices i
       LEFT JOIN acougue_sales s ON s.id = i.ref_id AND i.ref_type = 'venda'
       WHERE i.contingencia = 1 AND i.contingencia_efetivada = 0
       ORDER BY i.created_at`, []);
    res.json({
      pendentes,
      total: pendentes.length,
      // A referência usual para NFC-e é transmitir em até 24h; o número exato é do regulamento
      // estadual, por isso só sinalizamos as mais antigas em vez de afirmar prazo.
      mais_antiga_horas: pendentes.length
        ? Math.floor((Date.now() - new Date(pendentes[0].created_at).getTime()) / 3600000)
        : 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tenta efetivar (transmitir) uma nota emitida em contingência. Na prática é reconsultar a
// Focus: ela retransmite as offline assim que a SEFAZ volta, e a consulta revela se já foi.
app.post('/api/acougue/nfce/:id/efetivar', ...donoOnly, async (req, res) => {
  try {
    const nota = await db.get('SELECT * FROM acougue_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (!nota.contingencia) return res.status(409).json({ error: 'Esta nota não foi emitida em contingência.' });
    if (nota.contingencia_efetivada) return res.status(409).json({ error: 'Esta nota já foi efetivada.' });
    if (!focusNfe.isFocusConfigured()) return res.status(422).json({ error: 'Focus NFe não configurada no servidor.' });

    const result = await focusNfe.consultNFCe(nota.focus_ref);
    const d = result.data || {};
    const efetivada = d.contingencia_offline_efetivada === true || d.status === 'autorizado';
    await db.run(
      `UPDATE acougue_invoices SET contingencia_efetivada=?, status=?, chave_acesso=?,
         danfe_url=?, qrcode_url=?, status_sefaz=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [efetivada ? 1 : 0, focusNfe.statusInterno(result), d.chave_nfe || nota.chave_acesso,
       focusNfe.urlAbsoluta(d.caminho_danfe) || nota.danfe_url, d.qrcode_url || nota.qrcode_url,
       d.status_sefaz || null, req.params.id]);

    res.json({
      id: Number(req.params.id), efetivada,
      mensagem: efetivada ? 'Nota transmitida e autorizada pela SEFAZ.'
                          : 'Ainda não efetivada — a SEFAZ pode continuar fora do ar. Tente de novo mais tarde.',
      sefaz: d.mensagem_sefaz || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Conferência de etiquetas (PLU da balança x cadastro) ---- */
// Panorama da conferência: quantos já foram bipados e confirmados, quantos divergiram e
// quantos ninguém olhou ainda. Enquanto houver produto não conferido, existe risco de sair
// produto errado numa nota fiscal real.
app.get('/api/acougue/plu-audit', ...acougueOnly, async (req, res) => {
  try {
    const { rows: [resumo] } = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE plu_confere = 1)::int AS conferidos,
             COUNT(*) FILTER (WHERE plu_confere = 0)::int AS divergentes,
             COUNT(*) FILTER (WHERE plu_confere IS NULL)::int AS pendentes
      FROM acougue_products WHERE active = 1`);

    // Nome diferente do contador `divergentes` do resumo de propósito: espalhar o resumo e
    // depois adicionar uma chave de mesmo nome sobrescrevia a contagem com o array.
    const lista_divergentes = await db.all(`
      SELECT id, scale_code, name, price, unit, plu_observacao, plu_conferido_em
      FROM acougue_products WHERE active = 1 AND plu_confere = 0
      ORDER BY (scale_code)::bigint`, []);

    res.json({ ...resumo, lista_divergentes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Registra o resultado da conferência de um produto.
app.post('/api/acougue/products/:id/conferir-plu', ...acougueOnly, async (req, res) => {
  const { confere, observacao } = req.body;
  if (confere !== true && confere !== false) {
    return res.status(400).json({ error: 'Informe confere: true ou false.' });
  }
  try {
    const produto = await db.get('SELECT * FROM acougue_products WHERE id = ? AND active = 1', [req.params.id]);
    if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

    await db.run(
      'UPDATE acougue_products SET plu_confere=?, plu_observacao=?, plu_conferido_em=CURRENT_TIMESTAMP, plu_conferido_por=? WHERE id=?',
      [confere ? 1 : 0, observacao || null, req.user.id, req.params.id]);

    res.json(await db.get('SELECT id, name, scale_code, plu_confere, plu_observacao FROM acougue_products WHERE id = ?', [req.params.id]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Produção: ficha técnica e lotes ---- */
app.get('/api/acougue/recipes', ...donoOnly, async (req, res) => {
  try {
    const receitas = await db.all(
      `SELECT r.*, p.name AS produto, p.unit FROM acougue_recipes r
       JOIN acougue_products p ON p.id = r.product_id WHERE r.ativo = 1 ORDER BY p.name`, []);
    for (const r of receitas) {
      r.itens = await db.all(
        `SELECT i.*, p.name AS insumo, p.unit, COALESCE(p.cost_price, 0) AS custo_unit
         FROM acougue_recipe_items i JOIN acougue_products p ON p.id = i.insumo_id
         WHERE i.recipe_id = ?`, [r.id]);
      // Custo da receita depende do custo dos insumos; sem custo cadastrado o número seria
      // falso, então sinalizamos em vez de somar zero silenciosamente.
      r.insumos_sem_custo = r.itens.filter(i => !Number(i.custo_unit)).length;
      r.custo_estimado = r.insumos_sem_custo ? null
        : round2(r.itens.reduce((s, i) => s + i.quantidade * Number(i.custo_unit), 0));
      r.custo_por_kg = (r.custo_estimado != null && r.rendimento_kg > 0)
        ? round2(r.custo_estimado / r.rendimento_kg) : null;
    }
    res.json(receitas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/recipes', ...donoOnly, async (req, res) => {
  const { product_id, rendimento_kg, itens, observacao } = req.body || {};
  if (!product_id) return res.status(400).json({ error: 'Informe o produto fabricado.' });
  if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ error: 'Informe ao menos um insumo.' });
  if (!(Number(rendimento_kg) > 0)) return res.status(400).json({ error: 'Informe quanto a receita rende.' });
  if (itens.some(i => Number(i.insumo_id) === Number(product_id))) {
    return res.status(400).json({ error: 'A receita não pode ter o próprio produto como insumo.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Substitui a receita anterior em vez de acumular: ficha técnica duplicada faz a
    // produção consumir insumo duas vezes.
    await client.query('UPDATE acougue_recipes SET ativo = 0 WHERE product_id = $1', [product_id]);
    const { rows: [r] } = await client.query(
      'INSERT INTO acougue_recipes (product_id, rendimento_kg, observacao) VALUES ($1,$2,$3) RETURNING id',
      [product_id, Number(rendimento_kg), observacao || null]);
    for (const i of itens) {
      if (!(Number(i.quantidade) > 0)) throw Object.assign(new Error('Quantidade de insumo inválida.'), { code: 'BAD_INPUT' });
      await client.query('INSERT INTO acougue_recipe_items (recipe_id, insumo_id, quantidade) VALUES ($1,$2,$3)',
        [r.id, i.insumo_id, Number(i.quantidade)]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: r.id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === 'BAD_INPUT') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Produzir: consome os insumos, cria o lote e sobe o estoque do produto final.
app.post('/api/acougue/production', ...donoOnly, async (req, res) => {
  const { product_id, quantidade, validade } = req.body || {};
  if (!product_id || !(Number(quantidade) > 0)) {
    return res.status(400).json({ error: 'Informe o produto e a quantidade produzida.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [receita] } = await client.query(
      'SELECT * FROM acougue_recipes WHERE product_id = $1 AND ativo = 1', [product_id]);
    if (!receita) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Este produto não tem ficha técnica cadastrada.' }); }

    const { rows: itens } = await client.query(
      `SELECT i.*, p.name, p.stock_qty, COALESCE(p.cost_price,0) AS custo_unit
       FROM acougue_recipe_items i JOIN acougue_products p ON p.id = i.insumo_id WHERE i.recipe_id = $1`, [receita.id]);

    // Escala os insumos pela produção pedida em relação ao rendimento da receita.
    const fator = Number(quantidade) / Number(receita.rendimento_kg);
    let custoTotal = 0;
    const faltando = [];
    for (const i of itens) {
      const necessario = round3(i.quantidade * fator);
      if (Number(i.stock_qty) < necessario) faltando.push(`${i.name} (precisa ${necessario}, tem ${round3(i.stock_qty)})`);
      custoTotal += necessario * Number(i.custo_unit);
    }
    // Produzir sem insumo deixaria o estoque negativo e escondido. Melhor barrar e dizer o
    // que falta — o operador resolve na hora, não no inventário do mês.
    if (faltando.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: `Estoque insuficiente: ${faltando.join('; ')}`, faltando });
    }

    for (const i of itens) {
      const necessario = round3(i.quantidade * fator);
      await client.query('UPDATE acougue_products SET stock_qty = stock_qty - $1 WHERE id = $2', [necessario, i.insumo_id]);
      await registrarMovimento(client, {
        productId: i.insumo_id, tipo: 'producao_consumo', quantidade: -necessario,
        motivo: `Consumido na produção`, refType: 'producao', refId: product_id, userId: req.user.id });
    }

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM acougue_batches');
    const codigo = `L${String(count + 1).padStart(5, '0')}`;
    const { rows: [lote] } = await client.query(
      `INSERT INTO acougue_batches (product_id, codigo, quantidade, quantidade_restante, custo_total, validade, created_by)
       VALUES ($1,$2,$3,$3,$4,$5,$6) RETURNING *`,
      [product_id, codigo, Number(quantidade), round2(custoTotal), validade || null, req.user.id]);

    await client.query('UPDATE acougue_products SET stock_qty = stock_qty + $1 WHERE id = $2', [Number(quantidade), product_id]);
    await registrarMovimento(client, {
      productId: product_id, tipo: 'producao', quantidade: Number(quantidade),
      motivo: `Produção lote ${codigo}`, refType: 'lote', refId: lote.id, userId: req.user.id });

    await client.query('COMMIT');
    res.status(201).json({ ...lote, custo_por_kg: round2(custoTotal / Number(quantidade)) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Lotes com validade: o que vence primeiro aparece primeiro.
app.get('/api/acougue/batches', ...donoOnly, async (req, res) => {
  try {
    const lotes = await db.all(
      `SELECT b.*, p.name AS produto, p.unit FROM acougue_batches b
       JOIN acougue_products p ON p.id = b.product_id
       WHERE b.quantidade_restante > 0 ORDER BY b.validade NULLS LAST, b.produzido_em LIMIT 200`, []);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    res.json(lotes.map(l => {
      const dias = l.validade ? Math.ceil((new Date(l.validade) - hoje) / 86400000) : null;
      return {
        ...l,
        dias_para_vencer: dias,
        situacao: dias == null ? 'sem_validade' : (dias < 0 ? 'vencido' : (dias <= 3 ? 'vence_logo' : 'ok')),
        custo_por_kg: l.quantidade > 0 ? round2(l.custo_total / l.quantidade) : null,
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Relatórios de gestão ---- */
// O que o dono precisa saber e hoje só dava para adivinhar: o que vende, o que dá margem,
// o que está parado e por onde o dinheiro entra.
app.get('/api/acougue/reports', ...donoOnly, async (req, res) => {
  const de = req.query.de || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const ate = req.query.ate || new Date().toISOString().slice(0, 10);
  if (de > ate) return res.status(400).json({ error: 'A data inicial não pode ser maior que a final.' });
  try {
    const periodo = [de, ate];

    const { rows: [tot] } = await pool.query(
      `SELECT COALESCE(SUM(total_value),0) AS faturamento, COUNT(*)::int AS vendas,
              COALESCE(SUM(desconto),0) AS descontos
       FROM acougue_sales WHERE created_at::date BETWEEN $1 AND $2 AND status = 'concluida'`, periodo);

    const porPagamento = await db.all(
      `SELECT p.forma, SUM(p.valor) AS total, COUNT(*)::int AS qtd
       FROM acougue_sale_payments p JOIN acougue_sales s ON s.id = p.sale_id
       WHERE s.created_at::date BETWEEN ? AND ? AND s.status = 'concluida'
       GROUP BY p.forma ORDER BY total DESC`, periodo);

    // Margem por produto usa o custo cadastrado. Produto sem custo aparece com margem nula
    // em vez de margem 100%, que seria mentira confortável.
    const porProduto = await db.all(
      `SELECT i.product_name, pr.unit,
              SUM(i.quantity) AS qtd, SUM(i.subtotal) AS receita,
              SUM(i.quantity * COALESCE(pr.cost_price,0)) AS custo,
              MAX(COALESCE(pr.cost_price,0)) AS custo_unit
       FROM acougue_sale_items i
       JOIN acougue_sales s ON s.id = i.sale_id
       LEFT JOIN acougue_products pr ON pr.id = i.product_id
       WHERE s.created_at::date BETWEEN ? AND ? AND s.status = 'concluida'
       GROUP BY i.product_name, pr.unit ORDER BY receita DESC LIMIT 50`, periodo);

    const porDia = await db.all(
      `SELECT created_at::date AS dia, SUM(total_value) AS total, COUNT(*)::int AS vendas
       FROM acougue_sales WHERE created_at::date BETWEEN ? AND ? AND status = 'concluida'
       GROUP BY dia ORDER BY dia`, periodo);

    // Ruptura: o que está no catálogo mas sem saldo. É venda perdida silenciosa.
    const semEstoque = await db.all(
      `SELECT name, unit, stock_qty FROM acougue_products
       WHERE active = 1 AND stock_qty <= 0 ORDER BY name LIMIT 30`, []);

    const faturamento = round2(Number(tot.faturamento));
    const custoTotal = round2(porProduto.reduce((s, p) => s + Number(p.custo || 0), 0));
    // Sem custo cadastrado o lucro apareceria como 100% da receita — número confortável e
    // falso, que levaria o dono a achar que está ganhando mais do que ganha. Preferimos não
    // mostrar margem nenhuma e dizer por quê.
    const semCusto = porProduto.filter(pp => !Number(pp.custo_unit)).length;
    const custoConfiavel = porProduto.length > 0 && semCusto < porProduto.length;

    res.json({
      de, ate,
      faturamento, vendas: tot.vendas, descontos: round2(Number(tot.descontos)),
      ticket_medio: tot.vendas ? round2(faturamento / tot.vendas) : 0,
      custo_total: custoTotal,
      lucro_bruto: custoConfiavel ? round2(faturamento - custoTotal) : null,
      margem_pct: (custoConfiavel && faturamento > 0) ? round2(((faturamento - custoTotal) / faturamento) * 100) : null,
      aviso_margem: custoConfiavel
        ? (semCusto > 0 ? `${semCusto} produto(s) vendidos não têm custo cadastrado — a margem está superestimada.` : null)
        : 'Nenhum produto vendido tem custo cadastrado, então não dá para calcular margem. Preencha o custo em Produtos.',
      por_pagamento: porPagamento.map(p => ({ ...p, total: round2(p.total) })),
      por_dia: porDia.map(d => ({ ...d, total: round2(d.total) })),
      por_produto: porProduto.map(p => {
        const receita = round2(p.receita);
        const custo = round2(p.custo);
        return {
          produto: p.product_name, unit: p.unit, qtd: round3(p.qtd), receita, custo,
          margem_pct: (receita > 0 && Number(p.custo_unit) > 0) ? round2(((receita - custo) / receita) * 100) : null,
        };
      }),
      sem_estoque: semEstoque,
      produtos_sem_custo: porProduto.filter(p => !Number(p.custo_unit)).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Clientes e fiado ---- */
app.get('/api/acougue/customers', ...acougueOnly, async (req, res) => {
  try {
    const busca = String(req.query.q || '').trim();
    const params = [];
    let filtro = 'WHERE c.ativo = 1';
    if (busca) {
      params.push(`%${busca.toLowerCase()}%`);
      filtro += ` AND (LOWER(c.nome) LIKE $${params.length} OR c.documento LIKE $${params.length} OR c.telefone LIKE $${params.length})`;
    }
    // O saldo devedor vem junto: é a informação que o balcão precisa antes de fiar de novo.
    const { rows } = await pool.query(
      `SELECT c.*,
         COALESCE((SELECT SUM(r.valor - r.valor_pago) FROM acougue_receivables r
                   WHERE r.customer_id = c.id AND r.quitado_em IS NULL), 0) AS saldo_devedor
       FROM acougue_customers c ${filtro} ORDER BY c.nome LIMIT 200`, params);
    res.json(rows.map(c => ({ ...c, saldo_devedor: round2(c.saldo_devedor) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/customers', ...acougueOnly, async (req, res) => {
  const { nome, documento, telefone, endereco, limite_credito, observacao } = req.body || {};
  if (!String(nome || '').trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' });
  try {
    const { rows } = await db.run(
      'INSERT INTO acougue_customers (nome, documento, telefone, endereco, limite_credito, observacao) VALUES (?,?,?,?,?,?)',
      [String(nome).trim(), documento || null, telefone || null, endereco || null, Number(limite_credito) || 0, observacao || null]);
    res.status(201).json({ id: rows[0].id, nome, saldo_devedor: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um cliente com este documento.' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/acougue/customers/:id', ...acougueOnly, async (req, res) => {
  try {
    const atual = await db.get('SELECT * FROM acougue_customers WHERE id = ?', [req.params.id]);
    if (!atual) return res.status(404).json({ error: 'Cliente não encontrado' });
    const n = {};
    ['nome', 'documento', 'telefone', 'endereco', 'limite_credito', 'observacao']
      .forEach(f => { n[f] = req.body[f] !== undefined ? req.body[f] : atual[f]; });
    await db.run('UPDATE acougue_customers SET nome=?, documento=?, telefone=?, endereco=?, limite_credito=?, observacao=? WHERE id=?',
      [n.nome, n.documento, n.telefone, n.endereco, Number(n.limite_credito) || 0, n.observacao, req.params.id]);
    res.json({ id: Number(req.params.id), ...n });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Extrato do cliente: o que deve, desde quando, e o que já pagou.
app.get('/api/acougue/customers/:id/extrato', ...acougueOnly, async (req, res) => {
  try {
    const cliente = await db.get('SELECT * FROM acougue_customers WHERE id = ?', [req.params.id]);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
    const dividas = await db.all(
      `SELECT r.*, s.sale_number, (r.valor - r.valor_pago) AS saldo
       FROM acougue_receivables r LEFT JOIN acougue_sales s ON s.id = r.sale_id
       WHERE r.customer_id = ? ORDER BY r.quitado_em NULLS FIRST, r.created_at DESC LIMIT 100`, [req.params.id]);
    const saldo = round2(dividas.filter(d => !d.quitado_em).reduce((s, d) => s + Number(d.saldo), 0));
    const maisAntiga = dividas.find(d => !d.quitado_em);
    res.json({
      cliente, saldo_devedor: saldo, dividas,
      dias_divida_mais_antiga: maisAntiga
        ? Math.floor((Date.now() - new Date(maisAntiga.created_at).getTime()) / 86400000) : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recebe (total ou parcial) uma dívida.
app.post('/api/acougue/receivables/:id/pagar', ...acougueOnly, async (req, res) => {
  const valor = Number(req.body?.valor);
  if (!(valor > 0)) return res.status(400).json({ error: 'Informe um valor maior que zero.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [d] } = await client.query('SELECT * FROM acougue_receivables WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!d) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dívida não encontrada' }); }
    if (d.quitado_em) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Esta dívida já está quitada.' }); }

    const saldo = round2(Number(d.valor) - Number(d.valor_pago));
    if (valor > saldo + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `O saldo desta dívida é ${saldo.toFixed(2)}; não dá para receber ${valor.toFixed(2)}.` });
    }

    const novoPago = round2(Number(d.valor_pago) + valor);
    const quitou = novoPago >= round2(Number(d.valor)) - 0.01;
    await client.query('UPDATE acougue_receivables SET valor_pago = $1, quitado_em = $2 WHERE id = $3',
      [novoPago, quitou ? new Date() : null, req.params.id]);
    await client.query('INSERT INTO acougue_receivable_payments (receivable_id, valor, forma, created_by) VALUES ($1,$2,$3,$4)',
      [req.params.id, valor, req.body?.forma || 'dinheiro', req.user.id]);
    await client.query('COMMIT');
    res.json({ id: Number(req.params.id), valor_pago: novoPago, quitado: quitou, saldo_restante: round2(Number(d.valor) - novoPago) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Panorama do fiado: quanto está na rua e quem mais deve.
app.get('/api/acougue/receivables/resumo', ...acougueOnly, async (req, res) => {
  try {
    const { rows: [tot] } = await pool.query(
      `SELECT COALESCE(SUM(valor - valor_pago), 0) AS total, COUNT(*)::int AS dividas,
              COUNT(DISTINCT customer_id)::int AS clientes
       FROM acougue_receivables WHERE quitado_em IS NULL`);
    const devedores = await db.all(
      `SELECT c.id, c.nome, c.telefone, c.limite_credito,
              SUM(r.valor - r.valor_pago) AS saldo,
              MIN(r.created_at) AS desde
       FROM acougue_receivables r JOIN acougue_customers c ON c.id = r.customer_id
       WHERE r.quitado_em IS NULL GROUP BY c.id, c.nome, c.telefone, c.limite_credito
       ORDER BY saldo DESC LIMIT 50`, []);
    res.json({
      total_na_rua: round2(Number(tot.total)), dividas: tot.dividas, clientes: tot.clientes,
      devedores: devedores.map(d => ({
        ...d, saldo: round2(d.saldo),
        dias: Math.floor((Date.now() - new Date(d.desde).getTime()) / 86400000),
        // Sinaliza quem passou do limite combinado — é onde o prejuízo costuma nascer.
        acima_do_limite: Number(d.limite_credito) > 0 && round2(d.saldo) > Number(d.limite_credito),
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Gaveta de dinheiro (abertura física) ---- */
// Abre a gaveta mandando o pulso ESC/POS para a impressora. Usada pela tecla de atalho do
// caixa e, automaticamente, quando a venda é paga em dinheiro.
//
// `motivo` entra no log para que uma abertura fora de venda (troco, sangria, conferência)
// não fique indistinguível das automáticas — gaveta aberta sem venda é o padrão que aparece
// quando há desvio de caixa.
app.post('/api/acougue/gaveta/abrir', ...acougueOnly, async (req, res) => {
  try {
    const settings = await getAcougueSettingsMap();
    const cfg = gaveta.configDeSettings(settings);
    if (!cfg.ativa) {
      return res.status(422).json({ error: 'A abertura automática da gaveta está desligada. Ative em Configurações.' });
    }

    const r = await gaveta.abrirGaveta(cfg);
    const sessao = await db.get('SELECT id FROM acougue_cash_sessions WHERE fechado_em IS NULL', []);
    if (sessao) {
      await db.run(
        'INSERT INTO acougue_cash_movements (session_id, tipo, valor, motivo, created_by) VALUES (?,?,?,?,?)',
        [sessao.id, 'abertura_gaveta', 0, req.body?.motivo || 'Abertura manual', req.user.id]);
    }
    res.json({ ...r, registrado: !!sessao });
  } catch (err) {
    const conhecido = ['IMPRESSORA_NAO_CONFIGURADA', 'IMPRESSORA_SEM_RESPOSTA', 'IMPRESSORA_INACESSIVEL'];
    if (conhecido.includes(err.code)) return res.status(422).json({ error: err.message, code: err.code });
    res.status(500).json({ error: err.message });
  }
});

// Teste de configuração: manda o pulso sem registrar movimento, para quem está instalando
// conferir o cabo e o IP sem sujar o histórico da gaveta.
app.post('/api/acougue/gaveta/testar', ...acougueOnly, async (req, res) => {
  try {
    const cfg = gaveta.configDeSettings(await getAcougueSettingsMap());
    const r = await gaveta.abrirGaveta({ ...cfg, ip: req.body?.ip || cfg.ip, porta: req.body?.porta || cfg.porta });
    res.json({ ...r, mensagem: 'Comando enviado. Se a gaveta não abriu, confira o cabo entre ela e a impressora.' });
  } catch (err) {
    res.status(422).json({ error: err.message, code: err.code || 'ERRO' });
  }
});

/* ---- Precificação a partir do rendimento ---- */
// Responde a pergunta que o dono de açougue não consegue fazer de cabeça: "com os preços
// que eu pratico, esta carcaça me dá lucro?" O custo aparente da compra engana, porque
// ~30% da carcaça não vira produto vendável.
app.get('/api/acougue/pricing/carcass/:id', ...donoOnly, async (req, res) => {
  try {
    const carcaca = await db.get('SELECT * FROM acougue_carcass_entries WHERE id = ?', [req.params.id]);
    if (!carcaca) return res.status(404).json({ error: 'Entrada de carcaça não encontrada' });

    const cortes = await db.all('SELECT name, section, pct_of_carcass FROM acougue_yield_cuts WHERE active = 1 ORDER BY display_order, id', []);
    const produtos = await db.all("SELECT name, price FROM acougue_products WHERE active = 1 AND unit = 'kg' AND price > 0", []);
    const margemAlvo = req.query.margem !== undefined ? Number(req.query.margem) : 30;
    if (!(margemAlvo >= 0 && margemAlvo < 100)) {
      return res.status(400).json({ error: 'Margem deve estar entre 0 e 99%.' });
    }

    res.json(precificacao.analisarCarcaca({ carcaca, cortes, produtos, margemAlvo }));
  } catch (err) {
    if (err.code === 'DADOS_INSUFICIENTES' || err.code === 'SEM_CORTES') {
      return res.status(422).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/* ---- Caixa: sessão, sangria e suprimento ---- */
app.get('/api/acougue/cash-session', ...acougueOnly, async (req, res) => {
  try {
    const sessao = await db.get(
      `SELECT s.*, u.name AS aberto_por_nome FROM acougue_cash_sessions s
       LEFT JOIN users u ON u.id = s.aberto_por WHERE s.fechado_em IS NULL`, []);
    if (!sessao) return res.json({ aberta: false });

    // O esperado em dinheiro é o que dá para conferir na gaveta: abertura + vendas em
    // espécie + suprimentos - sangrias. Cartão e PIX não passam pela gaveta, então entram
    // no resumo só como informação.
    const { rows: [r] } = await pool.query(
      `SELECT
         COALESCE(SUM(p.valor) FILTER (WHERE p.forma = 'dinheiro'), 0) AS dinheiro,
         COALESCE(SUM(p.valor) FILTER (WHERE p.forma <> 'dinheiro'), 0) AS outras,
         COUNT(DISTINCT s.id)::int AS vendas
       FROM acougue_sales s JOIN acougue_sale_payments p ON p.sale_id = s.id
       WHERE s.cash_session_id = $1 AND s.status = 'concluida'`, [sessao.id]);
    const { rows: [m] } = await pool.query(
      `SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'suprimento'), 0) AS suprimentos,
              COALESCE(SUM(valor) FILTER (WHERE tipo = 'sangria'), 0) AS sangrias
       FROM acougue_cash_movements WHERE session_id = $1`, [sessao.id]);

    const esperado = round2(Number(sessao.valor_abertura) + Number(r.dinheiro) + Number(m.suprimentos) - Number(m.sangrias));
    const movimentos = await db.all(
      'SELECT * FROM acougue_cash_movements WHERE session_id = ? ORDER BY created_at DESC', [sessao.id]);

    res.json({
      aberta: true, ...sessao, vendas: r.vendas,
      total_dinheiro: round2(Number(r.dinheiro)), total_outras: round2(Number(r.outras)),
      suprimentos: round2(Number(m.suprimentos)), sangrias: round2(Number(m.sangrias)),
      esperado_na_gaveta: esperado, movimentos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/cash-session/abrir', ...acougueOnly, async (req, res) => {
  const valor = Number(req.body?.valor_abertura || 0);
  if (!(valor >= 0)) return res.status(400).json({ error: 'Valor de abertura inválido.' });
  try {
    const aberta = await db.get('SELECT id FROM acougue_cash_sessions WHERE fechado_em IS NULL', []);
    if (aberta) return res.status(409).json({ error: 'Já existe um caixa aberto. Feche antes de abrir outro.' });
    const { rows } = await db.run(
      'INSERT INTO acougue_cash_sessions (aberto_por, valor_abertura) VALUES (?,?)', [req.user.id, valor]);
    res.status(201).json({ id: rows[0].id, valor_abertura: valor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/cash-session/movimento', ...acougueOnly, async (req, res) => {
  const { tipo, valor, motivo } = req.body || {};
  if (!['sangria', 'suprimento'].includes(tipo)) return res.status(400).json({ error: 'Tipo deve ser sangria ou suprimento.' });
  if (!(Number(valor) > 0)) return res.status(400).json({ error: 'Informe um valor maior que zero.' });
  if (!String(motivo || '').trim()) return res.status(400).json({ error: 'Informe o motivo — é o que permite auditar a gaveta depois.' });
  try {
    const sessao = await db.get('SELECT * FROM acougue_cash_sessions WHERE fechado_em IS NULL', []);
    if (!sessao) return res.status(409).json({ error: 'Nenhum caixa aberto.' });
    await db.run('INSERT INTO acougue_cash_movements (session_id, tipo, valor, motivo, created_by) VALUES (?,?,?,?,?)',
      [sessao.id, tipo, Number(valor), String(motivo).trim(), req.user.id]);
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/cash-session/fechar', ...acougueOnly, async (req, res) => {
  const contado = Number(req.body?.valor_contado);
  if (!(contado >= 0)) return res.status(400).json({ error: 'Informe o valor contado na gaveta.' });
  try {
    const sessao = await db.get('SELECT * FROM acougue_cash_sessions WHERE fechado_em IS NULL', []);
    if (!sessao) return res.status(409).json({ error: 'Nenhum caixa aberto.' });

    const { rows: [r] } = await pool.query(
      `SELECT COALESCE(SUM(p.valor) FILTER (WHERE p.forma = 'dinheiro'), 0) AS dinheiro
       FROM acougue_sales s JOIN acougue_sale_payments p ON p.sale_id = s.id
       WHERE s.cash_session_id = $1 AND s.status = 'concluida'`, [sessao.id]);
    const { rows: [m] } = await pool.query(
      `SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'suprimento'), 0) AS sup,
              COALESCE(SUM(valor) FILTER (WHERE tipo = 'sangria'), 0) AS san
       FROM acougue_cash_movements WHERE session_id = $1`, [sessao.id]);

    const esperado = round2(Number(sessao.valor_abertura) + Number(r.dinheiro) + Number(m.sup) - Number(m.san));
    const diferenca = round2(contado - esperado);
    await db.run(
      `UPDATE acougue_cash_sessions SET fechado_por=?, fechado_em=CURRENT_TIMESTAMP,
         valor_contado=?, diferenca=?, observacao=? WHERE id=?`,
      [req.user.id, contado, diferenca, req.body?.observacao || null, sessao.id]);

    res.json({
      id: sessao.id, esperado, contado, diferenca,
      // Nomear sobra e falta evita a leitura errada do sinal na hora do aperto.
      situacao: diferenca === 0 ? 'confere' : (diferenca > 0 ? 'sobra' : 'falta'),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/cash-session/historico', ...acougueOnly, async (req, res) => {
  try {
    res.json(await db.all(
      `SELECT s.*, u.name AS fechado_por_nome FROM acougue_cash_sessions s
       LEFT JOIN users u ON u.id = s.fechado_por
       WHERE s.fechado_em IS NOT NULL ORDER BY s.fechado_em DESC LIMIT 60`, []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Entrada de notas (XML de NF-e do fornecedor) ---- */
app.get('/api/acougue/purchases', ...donoOnly, async (req, res) => {
  try {
    res.json(await db.all(
      `SELECT id, chave_acesso, numero, serie, emit_nome, emit_cnpj, data_emissao,
              valor_total, valor_pis, valor_cofins,
              (SELECT COUNT(*) FROM acougue_purchase_items i WHERE i.invoice_id = acougue_purchase_invoices.id) AS itens
       FROM acougue_purchase_invoices ORDER BY data_emissao DESC, id DESC LIMIT 200`, []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/acougue/purchases/:id', ...donoOnly, async (req, res) => {
  try {
    const nota = await db.get('SELECT * FROM acougue_purchase_invoices WHERE id = ?', [req.params.id]);
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    const itens = await db.all('SELECT * FROM acougue_purchase_items WHERE invoice_id = ? ORDER BY numero_item', [req.params.id]);
    // O XML é grande e só interessa no download; não vai na listagem do detalhe.
    delete nota.xml;
    res.json({ ...nota, itens });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Importa o XML da nota do fornecedor. O corpo é o texto do XML (Content-Type: text/xml) ou
// { xml: "..." } em JSON — o front manda o conteúdo do arquivo que o usuário selecionou.
app.post('/api/acougue/purchases/xml', ...donoOnly, async (req, res) => {
  const xml = typeof req.body === 'string' ? req.body : req.body?.xml;
  if (!xml || typeof xml !== 'string') {
    return res.status(400).json({ error: 'Envie o conteúdo do arquivo XML da nota.' });
  }

  let nota;
  try {
    nota = nfeXml.parseNFeXml(xml);
  } catch (err) {
    return res.status(400).json({ error: err.message, code: err.code });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A chave de acesso é única por nota em todo o Brasil — é ela que impede o mesmo arquivo
    // de entrar duas vezes e dobrar o estoque, erro clássico de quem importa XML.
    if (nota.chave_acesso) {
      const { rows: jaExiste } = await client.query(
        'SELECT id, numero FROM acougue_purchase_invoices WHERE chave_acesso = $1', [nota.chave_acesso]);
      if (jaExiste.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Esta nota já foi importada (nº ${jaExiste[0].numero}).`, invoice_id: jaExiste[0].id });
      }
    }

    const { rows: [inv] } = await client.query(
      `INSERT INTO acougue_purchase_invoices
         (chave_acesso, numero, serie, modelo, emit_cnpj, emit_nome, emit_uf, data_emissao,
          valor_total, valor_produtos, valor_icms, valor_pis, valor_cofins, xml, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [nota.chave_acesso, nota.numero, nota.serie, nota.modelo, nota.emitente.cnpj, nota.emitente.nome,
       nota.emitente.uf, nota.data_emissao, nota.valor_total, nota.valor_produtos, nota.valor_icms,
       nota.valor_pis, nota.valor_cofins, xml, req.user.id]);

    let vinculados = 0;
    for (const item of nota.itens) {
      // Casa o item da nota com o nosso cadastro pelo EAN (único critério confiável — o código
      // do fornecedor é interno dele e o nome varia). Sem casar, o item entra registrado mas
      // não mexe no estoque, e alguém associa depois.
      let produto = null;
      if (item.ean) {
        produto = await client.query('SELECT id FROM acougue_products WHERE barcode = $1 AND active = 1', [item.ean])
          .then(r => r.rows[0] || null);
      }

      await client.query(
        `INSERT INTO acougue_purchase_items
           (invoice_id, product_id, numero_item, codigo, ean, descricao, ncm, cfop, unidade,
            quantidade, valor_unitario, valor_total, icms_cst, icms_valor, pis_cst, pis_valor, cofins_cst, cofins_valor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [inv.id, produto?.id || null, item.numero_item, item.codigo, item.ean, item.descricao,
         item.ncm, item.cfop, item.unidade, item.quantidade, item.valor_unitario, item.valor_total,
         item.icms_cst, item.icms_valor, item.pis_cst, item.pis_valor, item.cofins_cst, item.cofins_valor]);

      if (produto) {
        await client.query('UPDATE acougue_products SET stock_qty = stock_qty + $1 WHERE id = $2', [item.quantidade, produto.id]);
        await registrarMovimento(client, {
          productId: produto.id, tipo: 'entrada_nota', quantidade: item.quantidade,
          motivo: `NF-e ${nota.numero} — ${nota.emitente.nome}`,
          refType: 'nota_entrada', refId: inv.id, userId: req.user.id });
        vinculados++;
      }
    }

    await client.query('COMMIT');
    res.status(201).json({
      id: inv.id, numero: nota.numero, emitente: nota.emitente.nome,
      itens: nota.itens.length, itens_vinculados: vinculados,
      valor_total: nota.valor_total, valor_pis: nota.valor_pis, valor_cofins: nota.valor_cofins,
      aviso: vinculados < nota.itens.length
        ? `${nota.itens.length - vinculados} item(ns) não casaram com o cadastro (sem código de barras correspondente) e não movimentaram estoque.`
        : null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Associa manualmente um item da nota a um produto do cadastro, movimentando o estoque.
app.patch('/api/acougue/purchases/items/:id', ...donoOnly, async (req, res) => {
  const { product_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [item] } = await client.query('SELECT * FROM acougue_purchase_items WHERE id = $1', [req.params.id]);
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item não encontrado' }); }
    if (item.product_id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Este item já está vinculado a um produto.' }); }

    await client.query('UPDATE acougue_purchase_items SET product_id = $1 WHERE id = $2', [product_id, req.params.id]);
    await client.query('UPDATE acougue_products SET stock_qty = stock_qty + $1 WHERE id = $2', [item.quantidade, product_id]);
    await registrarMovimento(client, {
      productId: product_id, tipo: 'entrada_nota', quantidade: item.quantidade,
      motivo: `Vínculo manual — item "${item.descricao}" da nota`,
      refType: 'nota_entrada', refId: item.invoice_id, userId: req.user.id });
    await client.query('COMMIT');
    res.json({ ok: true, quantidade_somada: item.quantidade });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

/* ---- Câmara fria (quebra de peso) ---- */
app.get('/api/acougue/cold-storage', ...donoOnly, async (req, res) => {
  try {
    const settings = await getAcougueSettingsMap();
    const taxaDia = Number(settings.shrink_pct_day || 0.8);
    const entradas = await db.all(
      `SELECT id, supplier_name, animal_type, weight_kg, entry_date, chamber_in_at, chamber_out_at,
              weight_out_kg, chamber_notes
       FROM acougue_carcass_entries ORDER BY entry_date DESC, id DESC LIMIT 200`, []);

    const agora = Date.now();
    res.json({
      shrink_pct_day: taxaDia,
      entries: entradas.map(e => {
        const entrada = e.chamber_in_at ? new Date(e.chamber_in_at) : (e.entry_date ? new Date(e.entry_date) : null);
        const saida = e.chamber_out_at ? new Date(e.chamber_out_at) : null;
        if (!entrada) return { ...e, dias: null, perda_esperada_kg: null };

        const dias = Math.max(0, ((saida ? saida.getTime() : agora) - entrada.getTime()) / 86400000);
        const perdaEsperada = round3(e.weight_kg * (taxaDia / 100) * dias);
        // Perda real só existe depois de pesar na saída. A diferença entre real e esperada é
        // o que interessa ao dono: muito acima do esperado é câmara mal regulada ou desvio;
        // muito abaixo costuma ser erro de pesagem.
        const perdaReal = e.weight_out_kg != null ? round3(e.weight_kg - e.weight_out_kg) : null;
        return {
          ...e,
          dias: Math.round(dias * 10) / 10,
          perda_esperada_kg: perdaEsperada,
          perda_esperada_pct: e.weight_kg ? round3((perdaEsperada / e.weight_kg) * 100) : 0,
          perda_real_kg: perdaReal,
          perda_real_pct: (perdaReal != null && e.weight_kg) ? round3((perdaReal / e.weight_kg) * 100) : null,
          divergencia_kg: perdaReal != null ? round3(perdaReal - perdaEsperada) : null,
          peso_estimado_atual: saida ? e.weight_out_kg : round3(e.weight_kg - perdaEsperada),
        };
      }),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/cold-storage/:id', ...donoOnly, async (req, res) => {
  const { chamber_in_at, chamber_out_at, weight_out_kg, chamber_notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [atual] } = await client.query('SELECT * FROM acougue_carcass_entries WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!atual) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Entrada de carcaça não encontrada' }); }

    const pesoSaida = weight_out_kg === '' || weight_out_kg === undefined ? atual.weight_out_kg : Number(weight_out_kg);
    if (pesoSaida != null && Number.isNaN(pesoSaida)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Peso de saída inválido.' });
    }
    if (pesoSaida != null && pesoSaida < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'O peso de saída não pode ser negativo.' });
    }
    if (pesoSaida != null && pesoSaida > atual.weight_kg) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `O peso de saída (${pesoSaida} kg) não pode ser maior que o de entrada (${atual.weight_kg} kg). Carne não ganha peso na câmara — confira a balança.` });
    }

    await client.query(
      'UPDATE acougue_carcass_entries SET chamber_in_at=$1, chamber_out_at=$2, weight_out_kg=$3, chamber_notes=$4 WHERE id=$5',
      [chamber_in_at ?? atual.chamber_in_at, chamber_out_at ?? atual.chamber_out_at,
       pesoSaida, chamber_notes ?? atual.chamber_notes, req.params.id]);

    // A quebra só vira movimentação quando a carcaça é pesada na saída — antes disso a perda é
    // estimativa, e estimativa não pode baixar estoque. Só lança se o peso mudou, senão salvar
    // a mesma tela duas vezes duplicaria a baixa.
    const jaLancado = atual.weight_out_kg != null;
    const mudouPeso = pesoSaida != null && pesoSaida !== atual.weight_out_kg;
    if (mudouPeso) {
      const quebra = round3(atual.weight_kg - pesoSaida);
      if (jaLancado) {
        // Correção de pesagem: estorna o lançamento anterior antes de lançar o novo, para o
        // livro refletir o histórico real em vez de esconder a correção.
        const quebraAnterior = round3(atual.weight_kg - atual.weight_out_kg);
        await registrarMovimento(client, {
          carcassEntryId: atual.id, tipo: 'estorno_quebra', quantidade: quebraAnterior,
          motivo: `Estorno de pesagem anterior (${atual.weight_out_kg} kg)`,
          refType: 'carcaca', refId: atual.id, userId: req.user.id });
      }
      await registrarMovimento(client, {
        carcassEntryId: atual.id, tipo: 'quebra_camara', quantidade: -quebra,
        motivo: `Quebra de peso na câmara: entrou ${atual.weight_kg} kg, saiu ${pesoSaida} kg`,
        refType: 'carcaca', refId: atual.id, userId: req.user.id });
    }

    await client.query('COMMIT');
    const { rows: [atualizado] } = await pool.query('SELECT * FROM acougue_carcass_entries WHERE id = $1', [req.params.id]);
    res.json(atualizado);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Livro de movimentação — a visão de controle interno. Filtra por produto, carcaça ou tipo.
app.get('/api/acougue/stock-movements', ...donoOnly, async (req, res) => {
  try {
    const filtros = [];
    const params = [];
    if (req.query.product_id) { params.push(req.query.product_id); filtros.push(`m.product_id = $${params.length}`); }
    if (req.query.carcass_entry_id) { params.push(req.query.carcass_entry_id); filtros.push(`m.carcass_entry_id = $${params.length}`); }
    if (req.query.tipo) { params.push(req.query.tipo); filtros.push(`m.tipo = $${params.length}`); }
    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT m.*, p.name AS product_name, p.unit, u.name AS usuario
       FROM acougue_stock_movements m
       LEFT JOIN acougue_products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
       ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT 300`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- SPED Fiscal (EFD ICMS/IPI) ---- */
// Gera o arquivo do período. `download=1` devolve como arquivo .txt; sem isso devolve um
// resumo em JSON, útil pra conferir os números antes de baixar.
app.get('/api/acougue/sped/efd-icms-ipi', ...donoOnly, async (req, res) => {
  const mes = Number(req.query.month);
  const ano = Number(req.query.year);
  if (!mes || !ano || mes < 1 || mes > 12) {
    return res.status(400).json({ error: 'Informe mês (1-12) e ano.' });
  }
  try {
    const settings = await getAcougueSettingsMap();
    if (!settings.cnpj || !settings.ie) {
      return res.status(422).json({ error: 'Preencha CNPJ e Inscrição Estadual em Configurações antes de gerar o SPED.' });
    }

    // Date.UTC evita que o fuso do servidor jogue o primeiro/último dia para o mês vizinho.
    const inicio = new Date(Date.UTC(ano, mes - 1, 1));
    const fim = new Date(Date.UTC(ano, mes, 0));
    const deISO = inicio.toISOString().slice(0, 10);
    const ateISO = fim.toISOString().slice(0, 10);

    const produtos = await db.all('SELECT id, name, barcode, unit, ncm, cest FROM acougue_products WHERE active = 1 ORDER BY id', []);

    const notas = await db.all(
      `SELECT * FROM acougue_purchase_invoices WHERE data_emissao BETWEEN ? AND ? ORDER BY data_emissao, id`,
      [deISO, ateISO]);
    for (const n of notas) {
      n.itens = await db.all('SELECT * FROM acougue_purchase_items WHERE invoice_id = ? ORDER BY numero_item', [n.id]);
      delete n.xml;
    }

    // Só entram vendas com NFC-e emitida: venda sem documento fiscal não vai para a EFD (e, se
    // houver muitas, é sinal de que o açougue está vendendo sem emitir — problema anterior ao SPED).
    const vendas = await db.all(
      `SELECT s.id, s.total_value, s.status, s.created_at::date AS data,
              i.numero, i.serie, i.chave_acesso
       FROM acougue_sales s
       JOIN acougue_invoices i ON i.ref_type = 'venda' AND i.ref_id = s.id AND i.status = 'autorizada'
       WHERE s.created_at::date BETWEEN ? AND ? ORDER BY s.created_at`, [deISO, ateISO]);

    const inventario = await db.all(
      `SELECT id AS product_id, unit AS unidade, stock_qty AS quantidade,
              COALESCE(cost_price, 0) AS valor_unitario,
              ROUND((stock_qty * COALESCE(cost_price, 0))::numeric, 2)::float8 AS valor
       FROM acougue_products WHERE active = 1 AND stock_qty > 0 ORDER BY id`, []);

    const arquivo = sped.gerarEfdIcmsIpi({
      settings, inicio, fim, produtos,
      entradas: notas,
      vendas: vendas.map(v => ({
        data: v.data, numero: v.numero, serie: v.serie, chave_acesso: v.chave_acesso,
        valor_total: v.total_value, cancelada: v.status === 'cancelada',
        valor_icms: 0, valor_pis: 0, valor_cofins: 0,
      })),
      inventario,
    });

    if (req.query.download === '1') {
      const nome = `SPED-EFD-${String(mes).padStart(2, '0')}${ano}-${settings.cnpj}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      // A EFD exige ISO-8859-1: acento gravado em UTF-8 é recusado pelo validador.
      return res.send(Buffer.from(arquivo, 'latin1'));
    }

    const linhas = arquivo.split('\r\n').filter(Boolean);
    res.json({
      periodo: `${String(mes).padStart(2, '0')}/${ano}`,
      linhas: linhas.length,
      notas_entrada: notas.length,
      vendas_com_nfce: vendas.length,
      produtos_no_cadastro: produtos.length,
      itens_no_inventario: inventario.length,
      preview: linhas.slice(0, 12),
      aviso: 'Arquivo gerado a partir dos dados do sistema. Valide no PVA da Receita e revise com o contador antes de transmitir — perfil da EFD, tratamento de ICMS-ST e obrigatoriedade de blocos são decisões fiscais que o sistema não tem como tomar.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Configurações fiscais ---- */
app.get('/api/acougue/settings', ...acougueOnly, async (req, res) => {
  try {
    const settings = await getAcougueSettingsMap();
    res.json({ ...settings, focus_nfe_configured: focusNfe.isFocusConfigured(), focus_nfe_environment: focusNfe.FOCUS_NFE_ENV });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/acougue/settings', ...donoOnly, async (req, res) => {
  const allowedKeys = ['business_name', 'cnpj', 'ie', 'logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep', 'regime_tributario', 'pis_rate', 'cofins_rate', 'dressing_pct', 'blood_pct', 'hide_pct', 'head_feet_pct',
    'scale_prefix', 'scale_code_digits', 'scale_value_digits', 'scale_value_type', 'hotkeys', 'shrink_pct_day',
    'nfce_serie_contingencia', 'nfce_proximo_numero_contingencia', 'desconto_pct',
      'gaveta_ativa', 'impressora_ip', 'impressora_porta', 'gaveta_pino',
      'gaveta_tempo_ligado', 'gaveta_tempo_desligado', 'gaveta_auto_dinheiro'];
  try {
    // Esta rota grava o que chega, como texto. Para o desconto isso não serve: o valor vira
    // dinheiro descontado em toda venda do balcão, e um "110" digitado sem querer zeraria o
    // total de todo mundo até alguém perceber.
    if (req.body.desconto_pct !== undefined) {
      const pct = Number(String(req.body.desconto_pct).replace(',', '.'));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'O desconto do caixa precisa ser um percentual entre 0 e 100.' });
      }
      req.body.desconto_pct = String(round2(pct));
    }
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        await db.run('UPDATE settings SET value = ? WHERE key = ?', [String(req.body[key]), `acougue_${key}`]);
      }
    }
    res.json(await getAcougueSettingsMap());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Rendimento de Carcaça (tabela de cortes % editável) ---- */
app.get('/api/acougue/yield-cuts', ...donoOnly, async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM acougue_yield_cuts WHERE active = 1 ORDER BY display_order, id', []));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/acougue/yield-cuts', ...donoOnly, async (req, res) => {
  const { name, section, pct_of_carcass } = req.body;
  if (!name || !section || pct_of_carcass === undefined) {
    return res.status(400).json({ error: 'Nome, seção e percentual são obrigatórios' });
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

app.patch('/api/acougue/yield-cuts/:id', ...donoOnly, async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM acougue_yield_cuts WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Corte não encontrado' });
    const next = {};
    ['name', 'section', 'pct_of_carcass', 'display_order'].forEach(f => { next[f] = req.body[f] !== undefined ? req.body[f] : current[f]; });
    await db.run(
      'UPDATE acougue_yield_cuts SET name=?, section=?, pct_of_carcass=?, display_order=? WHERE id=?',
      [next.name, next.section, next.pct_of_carcass, next.display_order, req.params.id]
    );
    res.json({ id: Number(req.params.id), ...next });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/acougue/yield-cuts/:id', ...donoOnly, async (req, res) => {
  try {
    await db.run('UPDATE acougue_yield_cuts SET active = 0 WHERE id = ?', [req.params.id]);
    res.json({ id: Number(req.params.id), active: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---- Conferência mensal (evitar malha fina: bate registros x notas emitidas) ---- */
app.get('/api/acougue/reconciliation', ...donoOnly, async (req, res) => {
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

// Toca o banco. Respondia 200 fixo: com o Aurora fora do ar, o ALB continuava mandando gente
// pra uma instância que só devolvia erro. Com timeout curto — resposta lenta demais também é
// motivo pra tirar de rotação, e o health check do ALB tem o prazo dele.
app.get('/api/health', async (req, res) => {
  const inicio = Date.now();
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('timeout')), 4000)),
    ]);
    res.json({
      status: 'ok', version: pkg.version, db: 'ok', db_ms: Date.now() - inicio,
      uptime_s: Math.floor((Date.now() - serverStartedAt.getTime()) / 1000), timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logEvent('ERROR', 'Health check: o banco não respondeu ({erro})', { erro: err.message });
    res.status(503).json({ status: 'degraded', version: pkg.version, db: 'erro', timestamp: new Date().toISOString() });
  }
});

// ─── Erros que escapam dos handlers ───────────────────────────────────────────
// Sem isto, um erro num handler async deixava a requisição pendurada (o Express 4 não captura
// rejeição de Promise) e um erro síncrono devolvia o stack em HTML. E uma rejeição sem catch
// derrubava o processo inteiro: o systemd sobe de novo em 5 s, mas o caixa perde a venda que
// estava no meio.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requisição malformada' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo enviado é grande demais' });
  logEvent('ERROR', 'Erro não tratado em {rota}: {erro}', { rota: `${req.method} ${req.originalUrl}`, erro: err?.message });
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno. Tente de novo; se insistir, avise o suporte.' });
});
process.on('unhandledRejection', (razao) => {
  console.error('Rejeição sem tratamento:', razao);
  logEvent('ERROR', 'Rejeição sem tratamento: {erro}', { erro: razao?.message || String(razao) });
});
process.on('uncaughtException', (err) => {
  // Aqui não dá pra seguir: o estado do processo é desconhecido. Registra e deixa o systemd
  // (Restart=always) subir um processo limpo.
  console.error('Exceção não capturada — encerrando:', err);
  process.exit(1);
});

// Só escuta quando executado direto (`node server.js`). Os testes importam `app` e sobem o
// banco por conta própria, sem abrir porta.
if (require.main === module) {
  initDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n🚀 Rei das Carnes rodando em http://localhost:${PORT}\n`);
        logEvent('INFO', 'Sistema iniciado');
      });
    })
    .catch((err) => {
      console.error('Erro fatal ao inicializar o banco de dados:', err);
      process.exit(1);
    });
}

module.exports = { app, initDatabase, pool };
