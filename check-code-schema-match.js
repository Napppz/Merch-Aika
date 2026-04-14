// Check apakah ada discrepancy antara schema dan code
// Jalankan: node check-code-schema-match.js

const db = require('./api/_lib/_db');
const fs = require('fs');

async function checkCodeSchemaMatch() {
  console.log('\n🔍 CHECKING CODE vs DATABASE SCHEMA\n');
  console.log('=' .repeat(70));

  try {
    // 1. Check SELECT queries di code
    console.log('\n📝 Queries yang digunakan di code:\n');

    const apiLibDir = './api/_lib';
    const files = fs.readdirSync(apiLibDir).filter(f => f.endsWith('.js'));

    const selectQueries = {};

    files.forEach(file => {
      const content = fs.readFileSync(`${apiLibDir}/${file}`, 'utf8');
      const selectMatches = content.match(/SELECT\s+([^F][^\n]*)\s+FROM\s+(\w+)/gi) || [];
      
      if (selectMatches.length > 0) {
        if (!selectQueries[file]) selectQueries[file] = [];
        selectMatches.forEach(q => {
          selectQueries[file].push(q.replace(/\n/g, ' '));
        });
      }
    });

    Object.entries(selectQueries).forEach(([file, queries]) => {
      console.log(`${file}:`);
      queries.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.substring(0, 80)}...`);
      });
    });

    // 2. Check users table columns - apakah avatar ada?
    console.log('\n' + '='.repeat(70));
    console.log('\n👥 USERS TABLE ANALYSIS:\n');

    const usersCheck = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

    console.log('Expected columns vs actual:');
    const expectedUsersColumns = ['id', 'username', 'email', 'phone', 'password_hash', 'verified', 'avatar', 'created_at', 'updated_at'];
    const actualColumns = usersCheck.rows.map(r => r.column_name);

    expectedUsersColumns.forEach(col => {
      const found = actualColumns.includes(col);
      const status = found ? '✓' : '❌ MISSING';
      console.log(`  ${status} ${col}`);
    });

    // 3. Check orders table
    console.log('\n' + '='.repeat(70));
    console.log('\n📦 ORDERS TABLE ANALYSIS:\n');

    const ordersStructure = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position;
    `);

    console.log('Kolom di orders table:');
    ordersStructure.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.column_name} (${row.data_type})`);
    });

    // 4. Check if any file references columns yang tidak ada
    console.log('\n' + '='.repeat(70));
    console.log('\n⚠️  POTENTIAL ISSUES:\n');

    // Check for avatar usage
    const avatarUsage = files.filter(file => {
      const content = fs.readFileSync(`${apiLibDir}/${file}`, 'utf8');
      return content.toLowerCase().includes('avatar');
    });

    if (avatarUsage.length > 0) {
      console.log('✓ Avatar column digunakan di: ' + avatarUsage.join(', '));
    }

    // Check for DELETE statements
    const deleteQueries = {};
    files.forEach(file => {
      const content = fs.readFileSync(`${apiLibDir}/${file}`, 'utf8');
      const deleteMatches = content.match(/DELETE\s+FROM\s+(\w+)/gi) || [];
      if (deleteMatches.length > 0) {
        deleteQueries[file] = deleteMatches;
      }
    });

    if (Object.keys(deleteQueries).length > 0) {
      console.log(`\n⚠️  Delete operations ditemukan:`);
      Object.entries(deleteQueries).forEach(([file, queries]) => {
        console.log(`  ${file}: ${queries.join(', ')}`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ SCHEMA MATCH CHECK SELESAI\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  } finally {
    process.exit(0);
  }
}

checkCodeSchemaMatch();
