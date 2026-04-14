// Script untuk reset password admin di Neon database
const { Pool } = require('@neondatabase/serverless');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

async function resetAdminPassword() {
  try {
    console.log('🔐 Reset Password Admin di Neon Database\n');
    
    // Password baru yang ingin diset
    const newPassword = 'aika123';
    const passwordHash = hashPassword(newPassword);
    
    console.log(`📝 Password baru: "${newPassword}"`);
    console.log(`🔒 Hash: ${passwordHash}\n`);
    
    // Update password untuk kedua admin
    const result = await pool.query(`
      UPDATE admins 
      SET password_hash = $1, updated_at = NOW()
      WHERE status = 'active'
      RETURNING username, role, updated_at
    `, [passwordHash]);
    
    if (result.rowCount > 0) {
      console.log(`✅ Password berhasil diupdate untuk ${result.rowCount} admin:\n`);
      result.rows.forEach(admin => {
        console.log(`   ✓ ${admin.username} (${admin.role})`);
      });
      console.log(`\n🎉 Semua admin sekarang bisa login dengan password: "${newPassword}"`);
    } else {
      console.log('⚠️ Tidak ada admin yang diupdate');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

resetAdminPassword();
