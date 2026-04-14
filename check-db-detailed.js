// Detailed database schema check dan comparison
// Jalankan: node check-db-detailed.js

const db = require('./api/_lib/_db');
const fs = require('fs');
const path = require('path');

async function checkAllTablesDetail() {
  console.log('\n🔍 DETAILED DATABASE SCHEMA CHECK\n');
  console.log('=' .repeat(70));
  
  try {
    // Get semua tabel
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('\n📊 TABEL & DATA COUNT:\n');
    
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      
      try {
        const countResult = await db.query(`SELECT COUNT(*) FROM ${tableName}`);
        const count = countResult.rows[0].count;
        
        // Get struktur
        const structResult = await db.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position;
        `);
        
        const columnCount = structResult.rows.length;
        const status = count > 0 ? '✓ Ada data' : '⚠ Kosong';
        
        console.log(`  ${tableName}`);
        console.log(`    - Kolom: ${columnCount} | Data: ${count} records | ${status}`);
      } catch (err) {
        console.log(`  ${tableName} - Error: ${err.message}`);
      }
    }

    // Check untuk table khusus yang paling penting
    console.log('\n' + '='.repeat(70));
    console.log('\n🔐 TABLE DETAIL: admins\n');
    
    const adminsData = await db.query('SELECT id, username, email, status, created_at FROM admins');
    console.log('Admins yang ada:');
    adminsData.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.username} (${row.email}) - Status: ${row.status} - Created: ${row.created_at}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n👥 TABLE DETAIL: users (sample 5)\n');
    
    const usersData = await db.query('SELECT id, username, email, verified, created_at FROM users LIMIT 5');
    console.log('Users (sample):');
    usersData.rows.forEach((row, i) => {
      const verified = row.verified ? '✓ Verified' : '✗ Not verified';
      console.log(`  ${i + 1}. ${row.username} (${row.email}) - ${verified}`);
    });

    // Check untuk table dengan data
    console.log('\n' + '='.repeat(70));
    console.log('\n📦 TABLE SUMMARY:\n');
    
    const summary = {};
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      try {
        const countResult = await db.query(`SELECT COUNT(*) FROM ${tableName}`);
        summary[tableName] = parseInt(countResult.rows[0].count);
      } catch {
        summary[tableName] = '?';
      }
    }

    Object.entries(summary)
      .sort((a, b) => (typeof b[1] === 'number' ? b[1] : 0) - (typeof a[1] === 'number' ? a[1] : 0))
      .forEach(([table, count]) => {
        const bar = '█'.repeat(Math.min(count / 10, 20));
        console.log(`  ${table.padEnd(25)} │ ${count.toString().padStart(3)} records ${bar}`);
      });

    console.log('\n' + '='.repeat(70));
    console.log('\n✅ DETAILED CHECK SELESAI\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  } finally {
    process.exit(0);
  }
}

checkAllTablesDetail();
