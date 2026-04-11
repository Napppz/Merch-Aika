const { Pool } = require('@neondatabase/serverless');

const connectionString = 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString });

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50),
        description TEXT,
        price INTEGER,
        "oldPrice" INTEGER,
        stock INTEGER,
        badge VARCHAR(50),
        image TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        "customerName" VARCHAR(255),
        email VARCHAR(255),
        address TEXT,
        status VARCHAR(50),
        total INTEGER,
        items JSONB,
        shipping JSONB,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert demo products if empty
    const res = await pool.query(`SELECT COUNT(*) FROM products`);
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (id, name, category, description, price, "oldPrice", stock, badge, image) VALUES 
        ('p1', 'Ocean Dream Tee', 'Pakaian', 'Kaos eksklusif dengan desain khas Aika Sesilia. Material premium, nyaman dipakai seharian.', 189000, 220000, 15, 'Terlaris', ''),
        ('p2', 'Starlight Totebag', 'Aksesoris', 'Tote bag canvas bergambar karakter cosplay favorit. Ramah lingkungan & stylish.', 135000, NULL, 20, 'Baru', ''),
        ('p3', 'Crystal Keychain', 'Aksesoris', 'Gantungan kunci akrilik bening dengan desain eksklusif. Cocok untuk koleksi!', 75000, NULL, 50, NULL, ''),
        ('p4', 'Moonrise Hoodie', 'Pakaian', 'Hoodie premium dengan broderi detail. Hangat, stylish, dan limited edition!', 350000, 420000, 8, 'Limited', ''),
        ('p5', 'Signature Poster A3', 'Foto & Print', 'Poster A3 berglossy, ditandatangani langsung oleh Aika Sesilia!', 95000, NULL, 30, 'Eksklusif', ''),
        ('p6', 'Cosplay Sticker Pack', 'Stiker', 'Set 20 stiker cosplay dengan berbagai pose karakter ikonik.', 45000, NULL, 100, NULL, '')
      `);
      console.log("Demo products inserted.");
    }

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing DB:", err);
  } finally {
    process.exit(0);
  }
}

init();
