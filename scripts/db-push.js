const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Pool } = require('@neondatabase/serverless');

dotenv.config();

const fallbackConnectionString =
'postgresql://neondb_owner:npg_7hRT9lBAXEaV@ep-rough-base-dddduytyutyut-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const connectionString = process.env.DATABASE_URL || fallbackConnectionString;

if (!connectionString) {
  console.error('DATABASE_URL belum tersedia.');
  process.exit(1);
}

const passwordSalt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
const adminUsername = process.env.ADMIN_USERNAME || 'Aika';
const adminPasswordHash =
  process.env.ADMIN_PASSWORD_HASH ||
  crypto.createHmac('sha256', passwordSalt).update('asjdkhadjkahdskd').digest('hex');

const schemaSql = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  "oldPrice" INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  badge TEXT,
  image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  password_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMP,
  avatar TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'superadmin',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  "customerName" TEXT NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  shipping JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_proof TEXT,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT 'Anonymous',
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  date TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  email VARCHAR(255) PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  email VARCHAR(255) PRIMARY KEY,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS carts (
  id BIGSERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT carts_user_product_unique UNIQUE (user_email, product_id)
);

CREATE TABLE IF NOT EXISTS wishlists (
  id BIGSERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  product_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT wishlists_user_product_unique UNIQUE (user_email, product_id)
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id BIGSERIAL PRIMARY KEY,
  user_email VARCHAR(255) NOT NULL,
  label VARCHAR(100),
  recipient_name VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  full_address TEXT NOT NULL,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews (date DESC);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_addresses_email ON user_addresses (user_email);
CREATE INDEX IF NOT EXISTS idx_carts_user_email ON carts (user_email);
CREATE INDEX IF NOT EXISTS idx_wishlists_user_email ON wishlists (user_email);
`;

async function main() {
  const pool = new Pool({ connectionString });

  try {
    console.log('Connecting to database...');
    await pool.query(schemaSql);

    await pool.query(
      `INSERT INTO admins (username, password_hash, role, status)
       VALUES ($1, $2, 'superadmin', 'active')
       ON CONFLICT (username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [adminUsername, adminPasswordHash]
    );

    const outDir = path.join(process.cwd(), 'db');
    const outFile = path.join(outDir, 'schema.sql');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, `${schemaSql.trim()}\n`, 'utf8');

    console.log('Database schema pushed successfully.');
    console.log(`Schema snapshot saved to ${outFile}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('db:push failed:', error.message);
  process.exit(1);
});
