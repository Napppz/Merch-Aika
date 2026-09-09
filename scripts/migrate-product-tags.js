const db = require('../api/_lib/_db');

async function migrate() {
  console.log('Ensuring tag column in products...');
  await db.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS tag TEXT;');
  
  const r1 = await db.query(`UPDATE products SET tag = 'Haori' WHERE LOWER(name) LIKE '%haori%' AND (tag IS NULL OR tag = '');`);
  const r2 = await db.query(`UPDATE products SET tag = 'Pakaian Kaos' WHERE (LOWER(name) LIKE '%kaos%' OR (category = 'Pakaian' AND LOWER(name) NOT LIKE '%haori%')) AND (tag IS NULL OR tag = '');`);
  
  console.log(`Updated Haori: ${r1.rowCount}, Updated Pakaian Kaos: ${r2.rowCount}`);
  const { rows } = await db.query('SELECT id, name, category, tag, sizes FROM products ORDER BY id DESC');
  console.log('Products after migration:');
  console.table(rows);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
