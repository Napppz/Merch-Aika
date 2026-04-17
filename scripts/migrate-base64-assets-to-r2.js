const db = require('../api/_lib/_db');
const { parseDataUrlImage, uploadImageBuffer } = require('../api/_lib/r2-storage');

async function migrateUsersAvatar() {
  const { rows } = await db.query(
    `SELECT id, email, avatar
     FROM users
     WHERE avatar IS NOT NULL
       AND avatar <> ''
       AND avatar LIKE 'data:image/%'`
  );

  if (!rows.length) {
    console.log('No base64 user avatars found.');
    return;
  }

  console.log(`Found ${rows.length} base64 user avatar(s).`);

  for (const row of rows) {
    try {
      const { buffer, mimeType } = parseDataUrlImage(row.avatar);
      const uploaded = await uploadImageBuffer({
        buffer,
        mimeType,
        fileName: `avatar-${row.id}`,
        folder: 'avatars',
        prefix: String(row.id)
      });

      await db.query(
        'UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2',
        [uploaded.imageUrl, row.id]
      );

      console.log(`Migrated user avatar ${row.email || row.id} -> ${uploaded.imageUrl}`);
    } catch (err) {
      console.error(`Failed migrating user avatar ${row.email || row.id}:`, err.message);
    }
  }
}

async function migrateReviewsAvatar() {
  const { rows } = await db.query(
    `SELECT id, order_id, avatar
     FROM reviews
     WHERE avatar IS NOT NULL
       AND avatar <> ''
       AND avatar LIKE 'data:image/%'`
  );

  if (!rows.length) {
    console.log('No base64 review avatars found.');
    return;
  }

  console.log(`Found ${rows.length} base64 review avatar(s).`);

  for (const row of rows) {
    try {
      const { buffer, mimeType } = parseDataUrlImage(row.avatar);
      const uploaded = await uploadImageBuffer({
        buffer,
        mimeType,
        fileName: `review-avatar-${row.order_id || row.id}`,
        folder: 'review-avatars',
        prefix: String(row.order_id || row.id)
      });

      await db.query(
        'UPDATE reviews SET avatar = $1 WHERE id = $2',
        [uploaded.imageUrl, row.id]
      );

      console.log(`Migrated review avatar ${row.id} -> ${uploaded.imageUrl}`);
    } catch (err) {
      console.error(`Failed migrating review avatar ${row.id}:`, err.message);
    }
  }
}

async function migrateHeroImage() {
  const { rows } = await db.query(
    `SELECT value
     FROM settings
     WHERE key = 'hero_image'
       AND value IS NOT NULL
       AND value <> ''
       AND value LIKE 'data:image/%'`
  );

  if (!rows.length) {
    console.log('No base64 hero image found.');
    return;
  }

  try {
    const { buffer, mimeType } = parseDataUrlImage(rows[0].value);
    const uploaded = await uploadImageBuffer({
      buffer,
      mimeType,
      fileName: 'hero-image',
      folder: 'settings',
      prefix: 'hero'
    });

    await db.query(
      `UPDATE settings
       SET value = $1
       WHERE key = 'hero_image'`,
      [uploaded.imageUrl]
    );

    console.log(`Migrated hero image -> ${uploaded.imageUrl}`);
  } catch (err) {
    console.error('Failed migrating hero image:', err.message);
  }
}

async function main() {
  await migrateUsersAvatar();
  await migrateReviewsAvatar();
  await migrateHeroImage();
}

main()
  .catch((err) => {
    console.error('Base64 asset migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.pool?.end === 'function') {
      await db.pool.end();
    }
  });
