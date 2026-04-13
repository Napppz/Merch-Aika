// setup_users_db.js
// Jalankan: node setup_users_db.js
// Membuat tabel users dan otp_codes di Neon PostgreSQL

const { query } = require('./api/_lib/_db');

async function setup() {
  console.log('⚙ Membuat tabel users dan otp_codes...\n');

  try {
    // ── Tabel users ──
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        username     VARCHAR(50)  UNIQUE NOT NULL,
        email        VARCHAR(255) UNIQUE NOT NULL,
        phone        VARCHAR(20),
        password_hash VARCHAR(255) NOT NULL,
        verified     BOOLEAN DEFAULT FALSE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel "users" berhasil dibuat (atau sudah ada).');

    // Index
    await query(`CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
    console.log('✅ Index untuk users berhasil dibuat.');

    // ── Tabel otp_codes ──
    await query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        email      VARCHAR(255) PRIMARY KEY,
        code       VARCHAR(6)   NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel "otp_codes" berhasil dibuat (atau sudah ada).');

    // ── Tabel forgot_password_tokens (opsional) ──
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        token      VARCHAR(128) UNIQUE NOT NULL,
        used       BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel "password_reset_tokens" berhasil dibuat (atau sudah ada).');

    console.log('\n🎉 Database setup selesai!');
    console.log('\n📋 Struktur tabel:');
    console.log('  users          : id, username, email, phone, password_hash, verified, created_at');
    console.log('  otp_codes      : email, code, expires_at, created_at');
    console.log('  password_reset : id, email, token, used, expires_at\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    process.exit(0);
  }
}

setup();
