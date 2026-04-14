// Script untuk melihat password hash admin yang sebenarnya di database
const { Pool } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString });

async function checkAdminPassword() {
  try {
    console.log('🔍 Mengecek password hash admin yang tersimpan di database...\n');
    
    const result = await pool.query(`
      SELECT username, password_hash, role, status, last_login 
      FROM admins 
      WHERE status = 'active'
      ORDER BY username
    `);
    
    console.log(`Total admin aktif: ${result.rows.length}\n`);
    
    result.rows.forEach(admin => {
      console.log(`👤 ${admin.username}`);
      console.log(`   Password Hash: ${admin.password_hash}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Status: ${admin.status}`);
      console.log(`   Last Login: ${admin.last_login || 'Belum pernah login'}`);
      console.log();
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkAdminPassword();
