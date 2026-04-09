const { Pool } = require('@neondatabase/serverless');

const connectionString = 'postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({ connectionString });

async function init() {
  try {
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    console.log("Column created_at added to products table.");
  } catch (err) {
    console.error("Error altering DB:", err);
  } finally {
    process.exit(0);
  }
}

init();
