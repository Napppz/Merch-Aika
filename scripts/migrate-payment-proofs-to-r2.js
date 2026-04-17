const db = require('../api/_lib/_db');
const { parseDataUrlImage, uploadImageBuffer } = require('../api/_lib/r2-storage');

async function main() {
  const { rows } = await db.query(
    `SELECT id, payment_proof
     FROM orders
     WHERE payment_proof IS NOT NULL
       AND payment_proof <> ''
       AND payment_proof LIKE 'data:image/%'`
  );

  if (!rows.length) {
    console.log('No base64 payment proofs found.');
    return;
  }

  console.log(`Found ${rows.length} payment proof(s) to migrate.`);

  for (const order of rows) {
    try {
      const { buffer, mimeType } = parseDataUrlImage(order.payment_proof);
      const uploaded = await uploadImageBuffer({
        buffer,
        mimeType,
        fileName: `payment-proof-${order.id}`,
        folder: 'payment-proofs',
        prefix: String(order.id)
      });

      await db.query(
        'UPDATE orders SET payment_proof = $1, updated_at = NOW() WHERE id = $2',
        [uploaded.imageUrl, order.id]
      );

      console.log(`Migrated ${order.id} -> ${uploaded.imageUrl}`);
    } catch (err) {
      console.error(`Failed migrating ${order.id}:`, err.message);
    }
  }
}

main()
  .catch((err) => {
    console.error('Payment proof migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.pool?.end === 'function') {
      await db.pool.end();
    }
  });
