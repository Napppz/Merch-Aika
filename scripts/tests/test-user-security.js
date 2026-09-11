require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const assert = require('assert');
const db = require('../../api/_lib/_db');
const crypto = require('crypto');
const { generateJWT } = require('../../api/_lib/jwt-manager');
const { getPasswordSalt } = require('../../api/_lib/env');

function hashPassword(password) {
  const salt = getPasswordSalt();
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

async function setupTestUsers() {
  const victimEmail = 'victim_' + Date.now() + '@test.local';
  const attackerEmail = 'attacker_' + Date.now() + '@test.local';
  const initialPassword = 'password123';
  const hashedPw = hashPassword(initialPassword);

  const victimRes = await db.query(
    `INSERT INTO users (username, email, phone, verified, password_hash, created_at)
     VALUES ($1, $2, '08123456789', TRUE, $3, NOW())
     RETURNING id, username, email`,
    ['victim_user', victimEmail, hashedPw]
  );

  const attackerRes = await db.query(
    `INSERT INTO users (username, email, phone, verified, password_hash, created_at)
     VALUES ($1, $2, '08987654321', TRUE, $3, NOW())
     RETURNING id, username, email`,
    ['attacker_user', attackerEmail, hashedPw]
  );

  return {
    victim: victimRes.rows[0],
    attacker: attackerRes.rows[0],
    initialPassword
  };
}

async function cleanupTestUsers(victimEmail, attackerEmail) {
  await db.query('DELETE FROM users WHERE email IN ($1, $2)', [victimEmail, attackerEmail]);
}

async function runTests() {
  console.log('\n--- Setting Up Test Accounts ---');
  const { victim, attacker, initialPassword } = await setupTestUsers();
  console.log(`Victim: ${victim.email}`);
  console.log(`Attacker: ${attacker.email}`);

  const victimToken = generateJWT({
    userId: victim.id,
    email: victim.email,
    username: victim.username,
    type: 'user'
  });

  const attackerToken = generateJWT({
    userId: attacker.id,
    email: attacker.email,
    username: attacker.username,
    type: 'user'
  });

  const adminToken = generateJWT({
    adminId: 'admin-master',
    type: 'admin'
  });

  try {
    // ════════════════════════════════════════════════════════════════
    // 1. TEST USER ORDERS (IDOR PROTECTION)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 1] Testing /api/user-orders IDOR Protection ---');
    
    // (a) Without token
    const resNoAuth = await fetch(`http://localhost:3000/api/user-orders?email=${victim.email}`);
    console.log(`Unauthenticated GET /api/user-orders -> Status: ${resNoAuth.status}`);
    assert.strictEqual(resNoAuth.status, 401, 'Must reject unauthenticated request with 401');

    // (b) Attacker token trying to read victim's orders
    const resAttacker = await fetch(`http://localhost:3000/api/user-orders?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${attackerToken}` }
    });
    console.log(`Attacker token GET /api/user-orders for victim -> Status: ${resAttacker.status}`);
    assert.strictEqual(resAttacker.status, 403, 'Must reject attacker accessing victim orders with 403');

    // (c) Victim token reading own orders
    const resVictim = await fetch(`http://localhost:3000/api/user-orders?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${victimToken}` }
    });
    console.log(`Victim token GET /api/user-orders -> Status: ${resVictim.status}`);
    assert.strictEqual(resVictim.status, 200, 'Must allow victim to access own orders with 200');

    // (d) Admin token reading victim orders
    const resAdmin = await fetch(`http://localhost:3000/api/user-orders?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log(`Admin token GET /api/user-orders -> Status: ${resAdmin.status}`);
    assert.strictEqual(resAdmin.status, 200, 'Must allow admin to access orders with 200');

    console.log('✓ TEST 1 PASSED: /api/user-orders is completely protected against IDOR.');

    // ════════════════════════════════════════════════════════════════
    // 2. TEST USER PROFILE (PROFILE & TAKEOVER PROTECTION)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 2] Testing /api/user-profile Protection & Anti-Takeover ---');

    // (a) GET Profile without token
    const resProfNoAuth = await fetch(`http://localhost:3000/api/user-profile?email=${victim.email}`);
    console.log(`Unauthenticated GET /api/user-profile -> Status: ${resProfNoAuth.status}`);
    assert.strictEqual(resProfNoAuth.status, 401, 'Must reject unauthenticated profile read with 401');

    // (b) Attacker GET victim profile
    const resProfAttacker = await fetch(`http://localhost:3000/api/user-profile?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${attackerToken}` }
    });
    console.log(`Attacker GET victim /api/user-profile -> Status: ${resProfAttacker.status}`);
    assert.strictEqual(resProfAttacker.status, 403, 'Must reject attacker reading victim profile with 403');

    // (c) Attacker PUT change victim password (Account Takeover Attempt)
    const resTakeover = await fetch(`http://localhost:3000/api/user-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${attackerToken}`
      },
      body: JSON.stringify({
        email: victim.email,
        username: 'hacked_by_attacker',
        newPassword: 'hacked_password_123'
      })
    });
    console.log(`Attacker PUT /api/user-profile (Account Takeover) -> Status: ${resTakeover.status}`);
    assert.strictEqual(resTakeover.status, 403, 'Must reject attacker altering victim profile with 403');

    // (d) Victim PUT change password without currentPassword
    const resNoCurrent = await fetch(`http://localhost:3000/api/user-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${victimToken}`
      },
      body: JSON.stringify({
        email: victim.email,
        username: victim.username,
        newPassword: 'new_valid_password_123'
      })
    });
    console.log(`Victim PUT change password without currentPassword -> Status: ${resNoCurrent.status}`);
    assert.strictEqual(resNoCurrent.status, 400, 'Must reject changing password without currentPassword with 400');

    // (e) Victim PUT change password with WRONG currentPassword
    const resWrongCurrent = await fetch(`http://localhost:3000/api/user-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${victimToken}`
      },
      body: JSON.stringify({
        email: victim.email,
        username: victim.username,
        currentPassword: 'wrong_current_password',
        newPassword: 'new_valid_password_123'
      })
    });
    console.log(`Victim PUT change password with wrong currentPassword -> Status: ${resWrongCurrent.status}`);
    assert.strictEqual(resWrongCurrent.status, 400, 'Must reject wrong currentPassword with 400');

    // (f) Victim PUT change password with CORRECT currentPassword
    const resCorrect = await fetch(`http://localhost:3000/api/user-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${victimToken}`
      },
      body: JSON.stringify({
        email: victim.email,
        username: 'updated_victim_name',
        currentPassword: initialPassword,
        newPassword: 'new_valid_password_123'
      })
    });
    console.log(`Victim PUT change password with correct currentPassword -> Status: ${resCorrect.status}`);
    assert.strictEqual(resCorrect.status, 200, 'Must accept correct currentPassword with 200');

    console.log('✓ TEST 2 PASSED: /api/user-profile is protected against tampering and Account Takeover.');

    // ════════════════════════════════════════════════════════════════
    // 3. TEST WISHLIST & CART TOKEN AUTHORIZATION
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 3] Testing /api/wishlist & /api/cart Auth ---');

    // Wishlist without token
    const resWishNoAuth = await fetch(`http://localhost:3000/api/wishlist?email=${victim.email}`);
    assert.strictEqual(resWishNoAuth.status, 401, 'Wishlist without token must be 401');

    // Wishlist attacker token
    const resWishAttacker = await fetch(`http://localhost:3000/api/wishlist?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${attackerToken}` }
    });
    assert.strictEqual(resWishAttacker.status, 403, 'Wishlist with attacker token must be 403');

    // Cart without token
    const resCartNoAuth = await fetch(`http://localhost:3000/api/cart?email=${victim.email}`);
    assert.strictEqual(resCartNoAuth.status, 401, 'Cart without token must be 401');

    // Cart attacker token
    const resCartAttacker = await fetch(`http://localhost:3000/api/cart?email=${victim.email}`, {
      headers: { 'Authorization': `Bearer ${attackerToken}` }
    });
    assert.strictEqual(resCartAttacker.status, 403, 'Cart with attacker token must be 403');

    console.log('✓ TEST 3 PASSED: Wishlist and Cart are strictly protected by token authorization.');

    // ════════════════════════════════════════════════════════════════
    // 4. TEST LOGIN TOKEN ISSUANCE
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- [TEST 4] Testing Login JWT Token Issuance ---');
    const loginRes = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: victim.email,
        password: 'new_valid_password_123'
      })
    });
    assert.strictEqual(loginRes.status, 200, 'Login must succeed with new password');
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.success, true, 'Login response must have success: true');
    assert.ok(typeof loginData.token === 'string' && loginData.token.length > 20, 'Login must return a valid token string');
    console.log('Returned Token:', loginData.token.slice(0, 30) + '...');
    console.log('✓ TEST 4 PASSED: /api/login successfully issues signed User JWT tokens.');

    console.log('\n🎉 ALL USER SECURITY & ANTI-LEAK TESTS PASSED SUCCESSFULLY!');
  } finally {
    console.log('\n--- Cleaning Up Test Accounts ---');
    await cleanupTestUsers(victim.email, attacker.email);
    console.log('✓ Cleaned up test database records.');
  }
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
