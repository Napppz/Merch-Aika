const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('@neondatabase/serverless');

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL belum tersedia.');
  process.exit(1);
}

async function syncDatabase() {
  const pool = new Pool({ connectionString });

  try {
    console.log('Connecting to Neon PostgreSQL database...');

    // 1. Ensure all columns in products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        description TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        "oldPrice" INTEGER,
        stock INTEGER NOT NULL DEFAULT 0,
        badge TEXT,
        image TEXT,
        sizes TEXT,
        gdrive_link TEXT,
        cosplayer_name VARCHAR(100),
        is_photopack BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Add missing columns if table already existed without them
    await pool.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS gdrive_link TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cosplayer_name VARCHAR(100);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_photopack BOOLEAN DEFAULT FALSE;
    `).catch(err => console.log('Products columns note:', err.message));

    // 2. Ensure users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50),
        password_hash TEXT NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        verified_at TIMESTAMP,
        avatar TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
    `).catch(err => console.log('Users columns note:', err.message));

    // 3. Ensure orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        "customerName" TEXT NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        total INTEGER NOT NULL DEFAULT 0,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        shipping JSONB NOT NULL DEFAULT '{}'::jsonb,
        payment_proof TEXT,
        date TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof TEXT;
    `).catch(err => console.log('Orders columns note:', err.message));

    // 4. Ensure other tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id BIGSERIAL PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL DEFAULT 'Anonymous',
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL DEFAULT '',
        avatar TEXT,
        date TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS otp_codes (
        email VARCHAR(255) PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS carts (
        id BIGSERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        product_id TEXT NOT NULL,
        size TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wishlists (
        id BIGSERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        product_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT wishlists_user_product_unique UNIQUE (user_email, product_id)
      );

      CREATE TABLE IF NOT EXISTS user_addresses (
        id BIGSERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        label VARCHAR(100),
        recipient_name VARCHAR(150) NOT NULL,
        phone VARCHAR(50),
        full_address TEXT NOT NULL,
        city VARCHAR(100),
        postal_code VARCHAR(20),
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Fetch summaries
    const prodCount = await pool.query('SELECT count(*) FROM products');
    const userCount = await pool.query('SELECT count(*) FROM users');
    const orderCount = await pool.query('SELECT count(*) FROM orders');

    console.log('✅ Database sync complete!');
    console.log(`- Products: ${prodCount.rows[0].count}`);
    console.log(`- Users: ${userCount.rows[0].count}`);
    console.log(`- Orders: ${orderCount.rows[0].count}`);

    // Check sample photopack products
    const photopacks = await pool.query(`SELECT id, name, category, is_photopack, gdrive_link, price FROM products WHERE is_photopack = TRUE OR category = 'Photopack'`);
    console.log(`- Photopack Items in DB:`, photopacks.rows);

  } finally {
    await pool.end();
  }
}

syncDatabase().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
