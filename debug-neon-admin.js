// Debug script untuk mengecek admin di database Neon
const { Pool } = require('@neondatabase/serverless');
const crypto = require('crypto');

// Koneksi Neon
const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

// Hash password dengan salt yang sama
function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

async function debugAdmin() {
  try {
    console.log('🔍 Mengecek database admin...\n');
    
    // 1. Cek apakah table admins ada
    console.log('1️⃣ Cek tabel admins:');
    try {
      const result = await pool.query('SELECT * FROM admins');
      console.log(`   ✅ Tabel admins ditemukan`);
      console.log(`   📊 Total admin: ${result.rows.length} user\n`);
      
      if (result.rows.length > 0) {
        console.log('   Admin yang ada:');
        result.rows.forEach((admin, idx) => {
          console.log(`   ${idx + 1}. Username: ${admin.username}, Role: ${admin.role}, Status: ${admin.status}`);
        });
        console.log();
      } else {
        console.log('   ⚠️ Tidak ada admin di database!\n');
      }
    } catch (err) {
      console.log(`   ❌ Tabel admins tidak ditemukan atau error: ${err.message}\n`);
      return;
    }
    
    // 2. Check password hashes
    console.log('2️⃣ Cek password hash:');
    const examplePassword = 'admin123'; // Ganti dengan password yang ingin dicek
    const hashedExample = hashPassword(examplePassword);
    console.log(`   Password input: "${examplePassword}"`);
    console.log(`   Hash yang dihasilkan: ${hashedExample}\n`);
    
    // 3. Lihat struktur tabel
    console.log('3️⃣ Struktur tabel admins:');
    try {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'admins'
      `);
      columns.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
      console.log();
    } catch (err) {
      console.log(`   ⚠️ Tidak bisa mendapatkan struktur tabel: ${err.message}\n`);
    }
    
    // 4. Tips untuk menambah admin
    console.log('4️⃣ Untuk menambah admin baru, gunakan:');
    console.log(`   Username: "Aika"`);
    console.log(`   Password: "admin123"`);
    console.log(`   Password hash: "${hashPassword('admin123')}"`);
    console.log(`\n   SQL INSERT:`);
    console.log(`   INSERT INTO admins (username, password_hash, role, status) VALUES`);
    console.log(`   ('Aika', '${hashPassword('admin123')}', 'owner', 'active');`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

debugAdmin();
