// Reset admin password ke standard
// Jalankan: node reset-admin-password.js

const db = require('./api/_lib/_db');
const crypto = require('crypto');

const SALT = 'aika_sesilia_salt_2024_secure';
const NEW_PASSWORD = 'Aikanap2213';

function hashPassword(password) {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

async function resetAdminPassword() {
  console.log('\n🔐 RESETTING ADMIN PASSWORDS\n');
  console.log('=' .repeat(70));

  try {
    const newHash = hashPassword(NEW_PASSWORD);
    
    console.log(`New password: ${NEW_PASSWORD}`);
    console.log(`New hash: ${newHash}\n`);
    console.log('Updating database...\n');

    // Update semua admin dengan password standar
    const result = await db.query(
      `UPDATE admins 
       SET password_hash = $1, updated_at = NOW()
       WHERE status = 'active'`,
      [newHash]
    );

    console.log(`✅ Berhasil update ${result.rowCount} admin\n`);

    // Show updated admins
    const adminsResult = await db.query(
      'SELECT id, username, email, status, updated_at FROM admins'
    );

    console.log('Admin sekarang:');
    adminsResult.rows.forEach((admin, i) => {
      console.log(`  ${i + 1}. ${admin.username} (${admin.email})`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ RESET SELESAI\n');
    console.log('📝 Credential baru untuk semua admin:');
    console.log(`   Username: Aika atau Nappz`);
    console.log(`   Password: ${NEW_PASSWORD}\n`);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

resetAdminPassword();
