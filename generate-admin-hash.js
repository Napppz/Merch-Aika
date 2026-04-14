// Script untuk generate Admin Password Hash
// Jalankan: node generate-admin-hash.js

const crypto = require('crypto');

const PASSWORD = process.argv[2] || 'Aikanap2213';
const SALT = process.env.PASSWORD_SALT || 'aika_sesilia_salt_2024_secure';

function hashPassword(password) {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

const hash = hashPassword(PASSWORD);

console.log('\n=== ADMIN PASSWORD HASH GENERATOR ===\n');
console.log('Password:', PASSWORD);
console.log('Salt:', SALT);
console.log('\nGenerated Hash:');
console.log(hash);
console.log('\n=== Gunakan hash ini untuk ADMIN_PASSWORD_HASH environment variable ===\n');
console.log('Export di .env atau .env.local:');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\nAtau set environment variable:');
console.log(`set ADMIN_PASSWORD_HASH=${hash}  (Windows)`);
console.log(`export ADMIN_PASSWORD_HASH=${hash}  (Linux/Mac)\n`);
