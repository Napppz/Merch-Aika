// Verify password hash di database sesuai dengan code
// Jalankan: node verify-admin-password.js

const db = require('./api/_lib/_db');
const crypto = require('crypto');

async function verifyAdminPasswords() {
  console.log('\n🔐 VERIFYING ADMIN PASSWORD HASHES\n');
  console.log('=' .repeat(70));

  try {
    // Get admins dari database
    const adminsResult = await db.query(
      'SELECT id, username, password_hash, email FROM admins ORDER BY created_at DESC'
    );

    if (adminsResult.rows.length === 0) {
      console.log('❌ Tidak ada admin di database!');
    } else {
      console.log('Admin yang ada di database:\n');
      
      adminsResult.rows.forEach((admin, i) => {
        console.log(`${i + 1}. ${admin.username} (${admin.email})`);
        console.log(`   Hash: ${admin.password_hash.substring(0, 20)}...`);
        console.log(`   Full: ${admin.password_hash}`);
      });
    }

    // Verify dengan generate hash lokal
    console.log('\n' + '='.repeat(70));
    console.log('\n🔑 GENERATING HASH LOCALS UNTUK TEST:\n');

    const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
    const testPassword = 'Aikanap2213';
    
    function hashPassword(password) {
      return crypto.createHmac('sha256', salt).update(password).digest('hex');
    }

    const generatedHash = hashPassword(testPassword);

    console.log(`Password test: ${testPassword}`);
    console.log(`Salt yang digunakan: ${salt}`);
    console.log(`Generated hash: ${generatedHash}`);

    // Compare dengan admins di database
    console.log('\n' + '='.repeat(70));
    console.log('\n✓ COMPARISON:\n');

    adminsResult.rows.forEach((admin) => {
      const match = admin.password_hash === generatedHash;
      const status = match ? '✅ MATCH' : '❌ NOT MATCH';
      console.log(`${admin.username}: ${status}`);
      
      if (!match) {
        console.log(`  - DB hash:    ${admin.password_hash}`);
        console.log(`  - Gen hash:   ${generatedHash}`);
      }
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n📋 RECOMMENDATION:\n');
    
    const aikaAdmin = adminsResult.rows.find(a => a.username === 'Aika');
    if (aikaAdmin && aikaAdmin.password_hash === generatedHash) {
      console.log('✅ Password Aika sudah BENAR (Aikanap2213)');
      console.log('   Bisa login dengan credentials ini.');
    } else {
      console.log('⚠️  Password Aika DI DATABASE TIDAK SESUAI dengan generate lokal');
      console.log('   Perlu update password atau cek salt yang digunakan.');
    }

    const nappzAdmin = adminsResult.rows.find(a => a.username === 'Nappz');
    if (nappzAdmin) {
      console.log('\n⚠️  Ada admin kedua "Nappz" di database.');
      console.log('   Password hash-nya tidak diketahui (tidak ada di setup file).');
      console.log('   Kemungkinan: Ditambah manual atau dari proses lain.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ VERIFY SELESAI\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  } finally {
    process.exit(0);
  }
}

verifyAdminPasswords();
