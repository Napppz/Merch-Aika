// Script untuk generate password hash admin yang benar
// Jalankan: node GENERATE_ADMIN_HASH.js

const crypto = require('crypto');

const SALT = 'aika_sesilia_salt_2024_secure';

function hashPassword(password) {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

// Coba beberapa password yang mungkin Anda gunakan
const passwordsToTest = [
  'Aikanap2213',
  'aikanap2213',
  'Aika123456',
  'aikanap123',
  'admin123',
  'Aika@2024'
];

console.log('🔐 Password Hash Generator untuk Admin Login\n');
console.log('Salt yang digunakan:', SALT);
console.log('═══════════════════════════════════════════════════\n');

passwordsToTest.forEach(pwd => {
  const hash = hashPassword(pwd);
  console.log(`Password: "${pwd}"`);
  console.log(`Hash:     ${hash}\n`);
});

// INSTRUKSI:
console.log('═══════════════════════════════════════════════════');
console.log('📝 INSTRUKSI PERBAIKAN:\n');
console.log('1. Pilih password yang Anda gunakan dari daftar di atas');
console.log('2. Copy hash-nya');
console.log('3. Set Environment Variable di Vercel:\n');
console.log('   Vercel Dashboard > Settings > Environment Variables');
console.log('   Nama: ADMIN_PASSWORD_HASH');
console.log('   Value: (paste hash di sini)\n');
console.log('4. Redeploy project');
console.log('5. Coba login lagi dengan password yang Anda pilih\n');

// Jika punya password custom lain:
const customPassword = process.argv[2];
if (customPassword) {
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n🆕 Custom Password: "${customPassword}"`);
  console.log(`Hash: ${hashPassword(customPassword)}`);
}
