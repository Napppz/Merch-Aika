// Debug admin login flow
// Jalankan di browser console saat login admin

console.log('\n🔐 ADMIN LOGIN DEBUG FLOW\n');
console.log('=' .repeat(60));

// Step 1: Check sebelum login
console.log('\n📍 STEP 1: Before Login');
console.log('  - adminToken in localStorage:', localStorage.getItem('adminToken') ? '✓ EXISTS' : '✗ NOT FOUND');

// Inject check setelah login - bisa dijalankan manual
window.debugAdminLogin = async function() {
  console.log('\n📍 STEP 2: Testing Admin Login API\n');
  
  const username = 'Aika';
  const password = 'Aikanap2213';
  
  try {
    const response = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    console.log('✓ Response status:', response.status);
    const data = await response.json();
    
    console.log('✓ Response data:', data);
    
    if (data.success && data.admin && data.admin.token) {
      console.log('\n✅ Token received:', data.admin.token.substring(0, 30) + '...');
      
      // Test parsing token
      try {
        const parts = data.admin.token.split('.');
        console.log('✓ Token parts:', parts.length === 3 ? '3 parts (valid)' : `${parts.length} parts (invalid)`);
        
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          console.log('✓ Token payload:', payload);
          console.log('✓ Expiry:', new Date(payload.exp * 1000));
        }
      } catch (e) {
        console.error('❌ Token parsing failed:', e.message);
      }
      
      // Test storing
      localStorage.setItem('adminToken', data.admin.token);
      console.log('\n✓ Token stored in localStorage');
      console.log('✓ Can retrieve:', localStorage.getItem('adminToken') ? 'YES' : 'NO');
      
    } else {
      console.error('❌ No token in response:', data);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
};

// Inject check dashboard validation
window.debugDashboardCheck = function() {
  console.log('\n📍 STEP 3: Dashboard Token Validation\n');
  
  const token = localStorage.getItem('adminToken');
  
  if (!token) {
    console.error('❌ NO TOKEN in localStorage');
    return;
  }
  
  console.log('✓ Token found in localStorage');
  console.log('  Token:', token.substring(0, 30) + '...');
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid token format: ${parts.length} parts`);
    }
    
    console.log('✓ Token format valid (3 parts)');
    
    const payload = JSON.parse(atob(parts[1]));
    console.log('✓ Token decoded successfully');
    console.log('  Payload:', payload);
    
    const now = Math.floor(Date.now() / 1000);
    console.log('✓ Current time:', now);
    console.log('✓ Token expiry:', payload.exp);
    
    if (payload.exp && payload.exp < now) {
      console.error('❌ TOKEN EXPIRED!');
    } else {
      console.log('✅ Token is VALID and NOT expired');
    }
  } catch (error) {
    console.error('❌ Token verification error:', error.message);
  }
};

console.log('\n📋 USAGE:');
console.log('  1. Run login dengan: debugAdminLogin()');
console.log('  2. Check dashboard validation dengan: debugDashboardCheck()');
console.log('  3. Navigate ke /admin/dashboard.html dan buka browser console');
console.log('\n' + '='.repeat(60) + '\n');

// Also expose API test
window.testAdminLoginAPI = async function(username, password) {
  console.log(`\nTesting login dengan username: ${username}`);
  try {
    const response = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (data.success) {
      console.log('✅ Login success! Token:', data.admin.token.substring(0, 40) + '...');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
};

console.log('🟢 Debug functions loaded. Try: debugAdminLogin()');
