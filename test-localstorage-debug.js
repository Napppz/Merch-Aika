// Debug: Trace localStorage operations

console.log('🔍 DEBUG: Testing localStorage operations');

// Simulate what login.html does
const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbklkIjoxLCJ1c2VybmFtZSI6IkFpa2EiLCJyb2xlIjoiYWRtaW4iLCJ0eXBlIjoiYWRtaW4iLCJpYXQiOjE3NzYxNjEyODksImV4cCI6MTc3NjI0NzY4OX0.zqV5aBcDeFgHqIkLmNoP0sKjWvXyZ1aBcDeFgHqIkL';

// Simulate localStorage (browser would have this)
class MockLocalStorage {
  constructor() {
    this.store = {};
    this.accessLog = [];
  }
  
  setItem(key, value) {
    console.log(`  📝 setItem('${key}', '${typeof value === 'string' && value.length > 50 ? value.substring(0, 30) + '...' : value}')`);
    if (typeof value !== 'string') {
      console.log(`    ⚠️  Value type: ${typeof value} (should be string)`);
    }
    this.store[key] = String(value);  // Force to string
    this.accessLog.push({op: 'set', key, length: this.store[key].length});
  }
  
  getItem(key) {
    const value = this.store[key];
    console.log(`  📖 getItem('${key}') → ${value ? 'STRING(' + value.length + ' chars)' : 'null'}`);
    this.accessLog.push({op: 'get', key, result: value ? 'found' : 'null'});
    return value || null;
  }
  
  removeItem(key) {
    console.log(`  🗑️  removeItem('${key}')`);
    delete this.store[key];
    this.accessLog.push({op: 'remove', key});
  }
  
  clear() {
    console.log(`  🧹 clear()`);
    this.store = {};
    this.accessLog.push({op: 'clear'});
  }
  
  key(index) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
  
  get length() {
    return Object.keys(this.store).length;
  }
  
  debug() {
    console.log('\n📊 localStorage state:', this.store);
    console.log('📝 Access log:', this.accessLog);
  }
}

const localStorage = new MockLocalStorage();

console.log('\n1️⃣  LOGIN PAGE: Simulating login.html actions');
console.log('   Receiving successful API response...');

// what login.html does
const data = {
  success: true,
  admin: {
    id: 1,
    username: 'Aika',
    role: 'admin',
    token: mockToken
  }
};

console.log('\n   Checking: data.success && data.admin');
console.log('   Result:', data.success && data.admin ? '✅ YES' : '❌ NO');

if (data.success && data.admin) {
  console.log('\n   ✅ Condition passed, storing values...');
  
  try {
    localStorage.setItem('adminToken', data.admin.token);
    localStorage.setItem('aika_admin_user', JSON.stringify({
      username: data.admin.username,
      role: data.admin.role,
      loginTime: Date.now()
    }));
    console.log('\n   ✅ Storage completed successfully');
  } catch(err) {
    console.log('   ❌ Storage error:', err.message);
  }
}

console.log('\n2️⃣  LOGIN PAGE: BEFORE REDIRECT - Verify storage');
const verifyToken = localStorage.getItem('adminToken');
const verifyUser = localStorage.getItem('aika_admin_user');
console.log('   adminToken retrieval:', verifyToken ? '✅ found' : '❌ NOT FOUND');
console.log('   aika_admin_user retrieval:', verifyUser ? '✅ found' : '❌ NOT FOUND');

if (!verifyToken) {
  console.log('   ⚠️  TOKEN WOULD NOT PERSIST TO DASHBOARD!');
  console.log('   Problem: value was not stored or undefined was stored');
}

console.log('\n3️⃣  PAGE REDIRECT: window.location.replace(\'/admin/dashboard.html\')');
console.log('   (Simulating page navigation to dashboard)');

// Simulate what happens on new page load
console.log('\n4️⃣  DASHBOARD PAGE: Protection script runs');
const token = localStorage.getItem('adminToken');
console.log('   Retrieving adminToken...');
console.log('   Token found:', token ? '✅ YES' : '❌ NO');

if (!token) {
  console.log('\n   ❌ REDIRECT TO LOGIN - This is what happens!');
  console.log('   localStorage did not persist token to dashboard page');
} else {
  console.log('\n   ✅ Token would pass to validation');
  const parts = token.split('.');
  console.log('   Token parts:', parts.length);
}

console.log('\n' + '='.repeat(70));
localStorage.debug();
console.log('='.repeat(70));
