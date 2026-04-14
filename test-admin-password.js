// Script untuk test login admin flow
const crypto = require('crypto');

// Password hash dari database
const dbHash = '000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6';

// Function hash password (sama seperti di admin-login.js)
function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

console.log('🔐 Testing Password Hash Match\n');
console.log(`Database hash: ${dbHash}\n`);

// Coba berbagai password umum
const passwordsToTry = [
  'aika123',
  'admin123',
  'Aika123',
  'Aika@123',
  'aika',
  'admin',
  'password',
  '123456',
  'nappiez',
  'Nappz123',
  'sesilia123',
  'aika_sesilia',
  'merch123'
];

console.log('📋 Testing passwords:\n');

let found = false;
passwordsToTry.forEach(pwd => {
  const hash = hashPassword(pwd);
  const match = hash === dbHash ? '✅ MATCH!' : '❌ no';
  console.log(`   "${pwd}" → ${hash.substring(0, 16)}... ${match}`);
  if (hash === dbHash) found = true;
});

if (!found) {
  console.log('\n⚠️ Tidak ada password yang cocok dengan hash di database!');
  console.log('\nMungkin password di database tidak sesuai dengan salt yang digunakan.');
  console.log('Perlu reset password admin dengan hash yang benar.\n');
  
  // Generate beberapa hash untuk password yang mungkin
  console.log('🔧 Untuk set password baru, gunakan hash ini:\n');
  
  const newPasswords = {
    'aika123': hashPassword('aika123'),
    'admin@2024': hashPassword('admin@2024'),
  };
  
  Object.entries(newPasswords).forEach(([pwd, hash]) => {
    console.log(`Password: "${pwd}"`);
    console.log(`Hash: ${hash}`);
    console.log(`UPDATE admins SET password_hash = '${hash}' WHERE username = 'Aika';\n`);
  });
}
