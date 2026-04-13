const { query } = require('./api/_lib/_db');

(async () => {
  try {
    const res = await query('SELECT email, password_hash FROM users WHERE id = 9 LIMIT 1');
    if(res.rows.length > 0) {
      const user = res.rows[0];
      console.log('Email:', user.email);
      console.log('Password Hash:', user.password_hash.substring(0, 50) + '...');
      console.log('Hash Length:', user.password_hash.length);
      console.log('Starts with $2:', user.password_hash.startsWith('$2'));
      console.log('\nFormats in database:');
      const all = await query('SELECT COUNT(*) as cnt, (CASE WHEN LENGTH(password_hash) = 60 THEN "bcryptjs" WHEN LENGTH(password_hash) = 64 THEN "SHA256" ELSE "other" END) as format FROM users GROUP BY format');
      console.table(all.rows);
    }
  } catch(e) { console.error(e.message); }
  process.exit(0);
})();
