// Cari password yang cocok dengan hash database
// Jalankan: node find-password-hash.js

const crypto = require('crypto');

// Hash dari database
const DB_HASH = '06b8c8fb287762975a3ed80fe1d9f5ae2da50027c8c004d5ef895757b58978e4';
const SALT = 'aika_sesilia_salt_2024_secure';

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

console.log('\n🔍 FINDING PASSWORD FOR DATABASE HASH\n');
console.log('=' .repeat(70));
console.log(`\nDB Hash: ${DB_HASH}`);
console.log(`Salt: ${SALT}\n`);

// Test berbagai password yang mungkin
const passwordsToTest = [
  'Aikanap2213',
  'aikanap2213',
  'AIKANAP2213',
  'Aika@2213',
  'Aika2213',
  'admin123',
  'Admin@123',
  'password123',
  'Nappz123',
  'nappz123',
  'Nappz@123',
  'admin',
  'Admin',
  'test123',
  'Test@123',
];

console.log('Testing passwords:\n');

let found = false;
passwordsToTest.forEach((pwd) => {
  const hash = hashPassword(pwd, SALT);
  const match = hash === DB_HASH;
  if (match) {
    console.log(`✅ MATCH FOUND!  Password: ${pwd}`);
    console.log(`   Hash: ${hash}`);
    found = true;
  } else {
    // Silent - jangan print yang tidak match
  }
});

if (!found) {
  console.log('❌ Password tidak ditemukan di list test');
  console.log('\n💡 Mungkin password yang digunakan adalah:');
  console.log('   - Password custom yang tidak di test list');
  console.log('   - Atau salt berbeda saat set di database');
  
  // Try dengan salt berbeda
  console.log('\n🔄 Trying dengan salt variations:\n');
  
  const saltsToTest = [
    'aika_sesilia_salt', 
    'aika_sesilia_salt_2024',
    'default',
    '',
  ];
  
  saltsToTest.forEach((salt) => {
    const hash = hashPassword('Aikanap2213', salt);
    const match = hash === DB_HASH;
    if (match) {
      console.log(`✅ MATCH dengan salt: "${salt}"`);
      console.log(`   Hash: ${hash}`);
      found = true;
    }
  });
}

if (!found) {
  console.log('❌ Masih tidak ketemu password/salt kombinasinya');
  console.log('\n💡 Action yang bisa diambil:');
  console.log('   1. Reset password admin di code dan update database');
  console.log('   2. Atau gunakan hash database yang sekarang di .env');
  console.log('   3. Catat password asli yang digunakan saat membuat admin');
}

console.log('\n' + '='.repeat(70));
console.log('\n');
process.exit(0);
