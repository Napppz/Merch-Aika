const { query } = require('./api/_lib/_db');

(async () => {
  try {
    const res = await query(`
      SELECT id, email, status, date, total, items 
      FROM orders 
      WHERE EXTRACT(MONTH FROM date) = 4 
      AND EXTRACT(YEAR FROM date) = 2026
      ORDER BY date DESC
    `);
    
    console.log('\n=== Orders di Bulan April 2026 ===\n');
    
    if (res.rows.length === 0) {
      console.log('Tidak ada order di April 2026');
    } else {
      res.rows.forEach(o => {
        let itemsCount = 0;
        try {
          const itemsData = typeof o.items === 'string' ? JSON.parse(o.items) : (Array.isArray(o.items) ? o.items : []);
          itemsCount = itemsData.length;
        } catch(e) {}
        
        console.log(`ID: ${o.id}`);
        console.log(`  Email: ${o.email}`);
        console.log(`  Status: ${o.status}`);
        console.log(`  Date: ${o.date}`);
        console.log(`  Total: Rp ${o.total}`);
        console.log(`  Items: ${itemsCount}`);
        console.log('---');
      });
    }
    
    // Also check all statuses
    const statusRes = await query(`
      SELECT DISTINCT status, COUNT(*) as count
      FROM orders
      GROUP BY status
      ORDER BY status
    `);
    
    console.log('\n=== Status Distribution (All Orders) ===\n');
    statusRes.rows.forEach(s => {
      console.log(`${s.status}: ${s.count} orders`);
    });
    
  } catch(e) { 
    console.error('Error:', e.message); 
  }
})();
