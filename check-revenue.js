// Script untuk diagnosa masalah revenue tidak berubah
// Jalankan: node check-revenue.js

const db = require('./api/_lib/_db');

async function checkRevenue() {
  console.log('\n=== DIAGNOSTIC LAPORAN PENDAPATAN ===\n');
  
  try {
    // Get all orders
    const { rows: allOrders } = await db.query('SELECT id, status, total, date FROM orders ORDER BY date DESC');
    
    console.log(`📊 Total Orders: ${allOrders.length}\n`);
    
    // Group by status
    const statusGroups = {};
    allOrders.forEach(o => {
      if (!statusGroups[o.status]) statusGroups[o.status] = [];
      statusGroups[o.status].push(o);
    });
    
    console.log('Order Status Breakdown:');
    Object.entries(statusGroups).forEach(([status, orders]) => {
      const total = orders.reduce((sum, o) => sum + (o.total || 0), 0);
      console.log(`  ${status.toUpperCase()}: ${orders.length} orders → Rp ${total.toLocaleString('id-ID')}`);
    });
    
    // Check revenue calculation (same as sales-report.js)
    const { rows: countedOrders } = await db.query(
      `SELECT id, status, total FROM orders WHERE status IN ('paid', 'shipped', 'completed')`
    );
    
    const countedRevenue = countedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    console.log(`\n💰 Revenue yang DIHITUNG (status='paid'|'shipped'|'completed'):`);
    console.log(`   ${countedOrders.length} orders → Rp ${countedRevenue.toLocaleString('id-ID')}`);
    
    console.log(`\n📋 Order Details:\n`);
    allOrders.slice(0, 10).forEach((o, i) => {
      const date = new Date(o.date).toLocaleDateString('id-ID');
      console.log(`${i+1}. #${o.id} | Status: ${o.status.padEnd(12)} | Rp ${o.total.toLocaleString('id-ID').padEnd(12)} | ${date}`);
    });
    
    if (allOrders.length > 10) {
      console.log(`\n... dan ${allOrders.length - 10} order lainnya\n`);
    }
    
    // Find status-related issues
    console.log('\n⚠️  POTENTIAL ISSUES:\n');
    
    if (statusGroups['pending'] && statusGroups['pending'].length > 0) {
      console.log(`⏳ ${statusGroups['pending'].length} order masih PENDING (belum di-verifikasi pembayaran)`);
      console.log(`   → Ini tidak dihitung di revenue!  Needto update statusnya.\n`);
    }
    
    if (statusGroups['payment_pending'] && statusGroups['payment_pending'].length > 0) {
      console.log(`💳 ${statusGroups['payment_pending'].length} order status 'payment_pending' tapi sales-report cari 'paid'`);
      console.log(`   → Mungkin ada mismatch status!\n`);
    }
    
    if (!countedOrders.length) {
      console.log('🔴 MASALAH: Tidak ada order dengan status paid/shipped/completed!');
      console.log('   → Revenue kosong karena tidak ada order yang dihitung.\n');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkRevenue().then(() => process.exit(0));
