require('dotenv').config();

const db = require('../api/_lib/_db');
const { parseDataUrlImage, uploadImageBuffer } = require('../api/_lib/r2-storage');

async function migrate() {
  const { rows } = await db.query(
    `SELECT id, name, image FROM products
     WHERE image IS NOT NULL AND image <> '' AND image LIKE 'data:image/%'`
  );

  if (rows.length === 0) {
    console.log('No base64 product images found.');
    return;
  }

  console.log(`Found ${rows.length} product image(s) to migrate.`);

  let migrated = 0;
  for (const product of rows) {
    try {
      const { buffer, mimeType } = parseDataUrlImage(product.image);
      const uploaded = await uploadImageBuffer({
        buffer,
        mimeType,
        fileName: `${product.name || product.id}.${mimeType.split('/')[1]}`,
        folder: 'products',
        prefix: String(product.id)
      });

      await db.query(
        'UPDATE products SET image = $1 WHERE id = $2',
        [uploaded.imageUrl, product.id]
      );

      migrated += 1;
      console.log(`Migrated ${product.id} -> ${uploaded.imageUrl}`);
    } catch (err) {
      console.error(`Failed to migrate ${product.id}: ${err.message}`);
    }
  }

  console.log(`Migration finished. Success: ${migrated}/${rows.length}`);
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
