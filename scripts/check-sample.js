require('dotenv').config({ path: '.env.local' });
const { query } = require('../api/_lib/_db');

async function checkSamplePhotopack() {
  const res = await query("SELECT id, name, category, image, is_photopack, gdrive_link FROM products WHERE id = 'p_photopack_sample' OR category = 'Photopack'");
  console.log(JSON.stringify(res.rows, null, 2));
}

checkSamplePhotopack().catch(console.error);
