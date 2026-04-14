// Script untuk check sinkronisasi database Neon dengan file local
// Jalankan: node check-database-sync.js

const db = require('./api/_lib/_db');

async function checkDatabaseSync() {
  console.log('\n🔍 CHECKING DATABASE SCHEMA SYNC\n');
  console.log('=' .repeat(60));
  
  try {
    // 1. Check tables
    console.log('\n📋 Tabel yang ada di Neon:');
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('❌ TIDAK ADA TABEL! Database masih kosong.');
    } else {
      tablesResult.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.table_name}`);
      });
    }

    // 2. Check admins table structure
    console.log('\n👤 Struktur tabel "admins":');
    try {
      const adminsStructure = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'admins'
        ORDER BY ordinal_position;
      `);
      
      if (adminsStructure.rows.length === 0) {
        console.log('❌ Tabel "admins" TIDAK DITEMUKAN di database!');
      } else {
        console.log('Kolom:');
        adminsStructure.rows.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`  ✓ ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
        });
      }
    } catch (err) {
      console.log(`❌ Error checking admins table: ${err.message}`);
    }

    // 3. Check users table structure
    console.log('\n👥 Struktur tabel "users":');
    try {
      const usersStructure = await db.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);
      
      if (usersStructure.rows.length === 0) {
        console.log('❌ Tabel "users" TIDAK DITEMUKAN di database!');
      } else {
        console.log('Kolom:');
        usersStructure.rows.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
          console.log(`  ✓ ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
        });
      }
    } catch (err) {
      console.log(`❌ Error checking users table: ${err.message}`);
    }

    // 4. Check data count
    console.log('\n📊 Jumlah data:');
    try {
      const adminCount = await db.query('SELECT COUNT(*) FROM admins');
      console.log(`  Admins: ${adminCount.rows[0].count} records`);
    } catch {
      console.log(`  Admins: Tabel tidak ada`);
    }

    try {
      const usersCount = await db.query('SELECT COUNT(*) FROM users');
      console.log(`  Users: ${usersCount.rows[0].count} records`);
    } catch {
      console.log(`  Users: Tabel tidak ada`);
    }

    // 5. Check indexes
    console.log('\n🔑 Indexes di database:');
    const indexResult = await db.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    
    if (indexResult.rows.length === 0) {
      console.log('  (Tidak ada indexes khusus, hanya primary key)');
    } else {
      indexResult.rows.forEach(idx => {
        console.log(`  ✓ ${idx.indexname} (on ${idx.tablename})`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ CHECK SELESAI\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error('\nMungkin masalah:');
    console.error('- DATABASE_URL tidak valid');
    console.error('- Database Neon tidak bisa diakses');
    console.error('- Tabel belum dibuat');
  } finally {
    process.exit(0);
  }
}

checkDatabaseSync();
