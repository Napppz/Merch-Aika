// Migration: Setup Admin Table di Neon
// Jalankan: node setup_admins_table.js

const db = require('./api/_lib/_db');
const crypto = require('crypto');

const SALT = 'aika_sesilia_salt_2024_secure';

function hashPassword(password) {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

async function setupAdminsTable() {
  console.log('🔧 Setting up admins table di Neon...\n');
  
  try {
    // 1. Create table
    console.log('📋 Membuat tabel admins...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100),
        role VARCHAR(50) DEFAULT 'admin',
        status VARCHAR(20) DEFAULT 'active',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel admins berhasil dibuat\n');

    // 2. Create admin default
    console.log('👤 Memasukkan admin default...');
    const defaultPassword = 'Aikanap2213';
    const defaultHash = hashPassword(defaultPassword);
    
    try {
      await db.query(
        `INSERT INTO admins (username, password_hash, email, status) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO NOTHING`,
        ['Aika', defaultHash, 'admin@aikasesilia.com', 'active']
      );
      console.log('✅ Admin default berhasil dimasukkan\n');
    } catch (err) {
      if (err.code === '23505') { // Unique constraint
        console.log('⚠️  Admin Aika sudah ada di database\n');
      } else {
        throw err;
      }
    }

    // 3. Check existing data
    console.log('📊 Data admin yang tersimpan:');
    const result = await db.query('SELECT id, username, email, status, created_at FROM admins');
    console.table(result.rows);

    console.log('\n✅ Setup selesai!\n');
    console.log('📝 Credensial default:');
    console.log('   Username: Aika');
    console.log('   Password: Aikanap2213');
    console.log('\n🔒 Password hash disimpan aman di Neon Database');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

setupAdminsTable().then(() => {
  console.log('\n🎉 Selesai! Database siap digunakan.');
  process.exit(0);
});
