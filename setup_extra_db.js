// setup_extra_db.js
// Jalankan dengan: node setup_extra_db.js
// Membuat tabel tambahan untuk memindahkan data dari localStorage ke Neon PostgreSQL

const { query } = require('./api/_lib/_db');

async function setup() {
  console.log('⚙ Inisialisasi pembuatan tabel untuk Cart, Address, dan Wishlist...\n');

  try {
    // 1. Tabel Keranjang Belanja (carts)
    await query(`
      CREATE TABLE IF NOT EXISTS carts (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_email, product_id)
      );
    `);
    console.log('✅ Tabel "carts" berhasil dibuat (atau sudah ada).');

    // 2. Tabel Alamat Pengguna (user_addresses)
    await query(`
      CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        label VARCHAR(50), -- e.g., 'Rumah', 'Kantor'
        recipient_name VARCHAR(100),
        phone VARCHAR(20),
        full_address TEXT,
        city VARCHAR(100),
        postal_code VARCHAR(20),
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel "user_addresses" berhasil dibuat (atau sudah ada).');

    // 3. Tabel Wishlist (wishlists)
    await query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        product_id INT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_email, product_id)
      );
    `);
    console.log('✅ Tabel "wishlists" berhasil dibuat (atau sudah ada).');

    // 4. Tambah kolom avatar di tabel users (jika belum ada)
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;`);
      console.log('✅ Kolom "avatar" berhasil ditambahkan ke tabel "users".');
    } catch (err) {
      // Hiraukan error jika kolom sudah ada
      console.log('ℹ Kolom "avatar" mungkin sudah ada, tidak masalah.');
    }

    // 5. Tabel Pengaturan (settings) - untuk mindtrans_config dll
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(50) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✅ Tabel "settings" berhasil dibuat (atau sudah ada).');

  } catch (err) {
    console.error('❌ Gagal membuat tabel. Error:', err);
  } finally {
    console.log('\n✅ Setup selesai. Silakan tekan Ctrl+C untuk keluar jika program masih berjalan.');
    process.exit(0); // Exit process
  }
}

setup();
