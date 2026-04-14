// Test: Verify dashboard protection
// Run this in browser console after deployment

console.log('🧪 Testing Dashboard Protection...\n');

// Test 1: Clear localStorage to simulate unlogged-in state
console.log('Test 1: Without adminToken (should redirect to login)');
console.log('Expected: Window should redirect to /admin/login.html');
console.log('Current adminToken:', localStorage.getItem('adminToken') ? '✅ EXISTS' : '❌ NOT FOUND');

// Test 2: Check if protection script is working
console.log('\nTest 2: Check dashboard protection script');
const token = localStorage.getItem('adminToken');
if (token) {
  try {
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    console.log('✅ Token found and parsed:', {
      username: payload.username,
      role: payload.role,
      exp: new Date(payload.exp * 1000)
    });
  } catch (e) {
    console.error('❌ Token invalid:', e.message);
  }
} else {
  console.log('❌ No token in localStorage');
}

// Test 3: Test logout
console.log('\nTest 3: Manual logout test');
console.log('To test logout:');
console.log('1. Click logout button in dashboard');
console.log('2. Check that localStorage.adminToken is removed');
console.log('3. Check that you are redirected to login page');

// Test 4: Verify protection on fresh page load
console.log('\nTest 4: Refresh page and verify protection');
console.log('Expected behavior:');
console.log('- If no token: Redirect to login');
console.log('- If token expired: Redirect to login');
console.log('- If token valid: Load dashboard normally');
