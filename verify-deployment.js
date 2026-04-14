// Script untuk verify koneksi database dan fix masalah
require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');
const crypto = require('crypto');

console.log('🔍 VERIFICATION CHECKLIST\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Check DATABASE_URL
console.log('1️⃣  DATABASE_URL di .env:');
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  // Mask sensitive parts
  const masked = dbUrl.replace(/(postgresql:\/\/)[^:]+:[^@]+(@)/, '$1***:***$2');
  console.log(`    ✅ Sudah set: ${masked}\n`);
} else {
  console.log(`    ❌ NOT SET!\n`);
}

// 2. Check PASSWORD_SALT
console.log('2️⃣  PASSWORD_SALT di .env:');
const salt = process.env.PASSWORD_SALT;
if (salt) {
  console.log(`    ✅ Sudah set: "${salt}"\n`);
} else {
  console.log(`    ❌ NOT SET! (akan pakai default)\n`);
}

// 3. Check password hash di database
async function checkDatabase() {
  try {
    console.log('3️⃣  Koneksi ke Database Neon:');
    const pool = new Pool({ connectionString: dbUrl });
    
    const result = await pool.query(`
      SELECT username, password_hash, updated_at
      FROM admins
      WHERE status = 'active'
      ORDER BY username
    `);
    
    if (result.rows.length === 0) {
      console.log(`    ❌ Tidak ada admin di database!\n`);
      return;
    }
    
    console.log(`    ✅ Database connected! ${result.rows.length} admin ditemukan:\n`);
    
    result.rows.forEach(admin => {
      console.log(`    • ${admin.username}`);
      console.log(`      Hash: ${admin.password_hash.substring(0, 20)}...`);
      console.log(`      Updated: ${admin.updated_at}\n`);
    });
    
    // Check apakah hash cocok dengan password yang kita set
    const newPassword = 'aika123';
    function hashPassword(password) {
      const s = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
      return crypto.createHmac('sha256', s).update(password).digest('hex');
    }
    
    const expectedHash = hashPassword(newPassword);
    const hashMatch = result.rows[0].password_hash === expectedHash;
    
    console.log('4️⃣  Hash Verification:');
    console.log(`    Password test: "${newPassword}"`);
    console.log(`    Expected hash: ${expectedHash}`);
    console.log(`    Database hash: ${result.rows[0].password_hash}`);
    console.log(`    Match: ${hashMatch ? '✅ YES' : '❌ NO'}\n`);
    
    if (hashMatch) {
      console.log('✅ DATABASE PASSWORD HASH BENAR!\n');
    } else {
      console.log('❌ DATABASE PASSWORD HASH TIDAK COCOK!\n');
    }
    
    process.exit(0);
  } catch (err) {
    console.error(`    ❌ Error: ${err.message}\n`);
    
    console.log('\n⚠️  MASALAH KEMUNGKINAN:');
    console.log('   • DATABASE_URL tidak valid / salah');
    console.log('   • Jaringan Vercel tidak bisa akses Neon');
    console.log('   • SSL certificate issue\n');
    
    process.exit(1);
  }
}

checkDatabase();
