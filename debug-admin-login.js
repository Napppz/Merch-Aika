// Debug script untuk troubleshoot admin login
const crypto = require('crypto');

console.log('\n=== TROUBLESHOOTING ADMIN LOGIN ===\n');

// Test dengan berbagai salt
const PASSWORD = 'Aikanap2213';
const SALTS = [
  'aika_sesilia_salt_2024_secure', // Default
  '', // No salt
  'default'
];

if (process.env.PASSWORD_SALT) {
  SALTS.push(process.env.PASSWORD_SALT);
}

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

console.log('Password yang ditest:', PASSWORD);
console.log('\nHashes dengan berbagai salt:\n');

SALTS.forEach((salt, idx) => {
  const hash = hashPassword(PASSWORD, salt);
  console.log(`${idx + 1}. Salt: "${salt || '(empty)'}"`);
  console.log(`   Hash: ${hash}\n`);
});

// Hash yang seharusnya benar
const EXPECTED_HASH = '000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6';
console.log('Hash yang diset di code:', EXPECTED_HASH);

// Check which one matches
console.log('\n=== MATCHING CHECK ===\n');
SALTS.forEach((salt, idx) => {
  const hash = hashPassword(PASSWORD, salt);
  const matches = hash === EXPECTED_HASH;
  const status = matches ? '✅ MATCH!' : '❌ No match';
  console.log(`${idx + 1}. Salt "${salt ? salt : '(empty)'}" ${status}`);
});

console.log('\n=== ENV VARIABLES CHECK ===\n');
console.log('PASSWORD_SALT env var:', process.env.PASSWORD_SALT || '(not set - using default)');
console.log('NODE_ENV:', process.env.NODE_ENV || '(not set)');

// Simulate what the actual code would do
console.log('\n=== SIMULATING ACTUAL CODE ===\n');
const DEFAULT_PASSWORD_HASH = '000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;
const salt = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';

const inputPasswordHash = hashPassword(PASSWORD, salt);

console.log('Input password hash:', inputPasswordHash);
console.log('Expected hash:      ', ADMIN_PASSWORD_HASH);
console.log('Match?', inputPasswordHash === ADMIN_PASSWORD_HASH ? '✅ YES' : '❌ NO');

if (inputPasswordHash !== ADMIN_PASSWORD_HASH) {
  console.log('\n⚠️  MISMATCH DETECTED!');
  console.log('Ada perbedaan antara hash yang digenerate vs yang disimpan.');
  console.log('\nKemungkinan penyebab:');
  console.log('1. PASSWORD_SALT di Vercel berbeda dengan di sini');
  console.log('2. Password yang diketik salah (case-sensitive)');
  console.log('3. Hash belum diupdate di Vercel env vars');
}
