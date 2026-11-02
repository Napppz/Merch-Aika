/**
 * test-priority-1-2.js
 * Comprehensive automated test suite for Priority 1 (Security & Data Integrity)
 * and Priority 2 (Store Operations: 24h Auto-Cancel, Status History, Non-Blocking Background Tasks).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
require('dotenv').config();

const assert = require('assert');
const db = require('../../api/_lib/_db');
const { generateJWT } = require('../../api/_lib/jwt-manager');
const r2Storage = require('../../api/_lib/r2-storage');
const {
  escapeHtml,
  dispatchBackgroundTask,
  expireStalePendingOrders
} = require('../../api/_lib/order-lifecycle');

// Stub uploadImageBuffer BEFORE requiring payment-proof so tests never upload files to live Cloudflare R2
r2Storage.uploadImageBuffer = async ({ fileName }) => ({
  key: `test/${fileName}`,
  imageUrl: `https://cdn.test.local/payment-proofs/${fileName}`
});

const envModule = require('../../api/_lib/env');
const ordersHandler = require('../../api/_lib/orders');
const paymentProofHandler = require('../../api/_lib/payment-proof');
const routeDispatcher = require('../../api/[route]');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function invokeHandler(handler, { method = 'GET', query = {}, headers = {}, body = undefined, enableEmail = false } = {}) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = enableEmail ? {} : { 'x-test-suite': '1' };
    for (const [k, v] of Object.entries(headers || {})) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method,
      query,
      headers: normalizedHeaders,
      body,
      socket: { remoteAddress: '127.0.0.1' },
      connection: { remoteAddress: '127.0.0.1' },
      setTimeout() {}
    };

    const resHeaders = {};
    const res = {
      statusCode: 200,
      setTimeout() {},
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return resHeaders[String(k).toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, data: payload, headers: resHeaders });
        return this;
      },
      send(payload) {
        resolve({ status: this.statusCode, data: payload, headers: resHeaders });
        return this;
      },
      end(payload) {
        resolve({ status: this.statusCode, data: payload, headers: resHeaders });
        return this;
      }
    };

    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function runTests() {
  const runId = Date.now();
  const testProdRaceId = `TEST-P1P2-PROD-RACE-${runId}`;
  const testProdMainId = `TEST-P1P2-PROD-MAIN-${runId}`;
  const createdOrderIds = [];

  const ownerEmail = `owner-${runId}@test.local`;
  const otherEmail = `attacker-${runId}@test.local`;
  const ownerToken = generateJWT({ userId: 90001, email: ownerEmail, username: 'Owner Test', type: 'user' });
  const otherToken = generateJWT({ userId: 90002, email: otherEmail, username: 'Attacker Test', type: 'user' });
  const adminToken = generateJWT({ adminId: 1, username: 'superadmin', role: 'superadmin', type: 'admin' });

  try {
    console.log('🧪 Running Priority 1 & Priority 2 Verification Suite...');

    // Seed temporary physical test products
    await db.query(
      `INSERT INTO products (id, name, category, price, stock, is_photopack)
       VALUES ($1, $2, 'Keychain', 50000, 1, FALSE),
              ($3, $4, 'Acrylic', 75000, 10, FALSE)`,
      [testProdRaceId, 'Test Race Keychain', testProdMainId, 'Test Main Acrylic']
    );

    // -------------------------------------------------------------------------
    // TEST 1: P1.2 — Server-Side JNE Shipping Validation & Anti-Tampering
    // -------------------------------------------------------------------------
    console.log('\n--- [1] P1.2 Server-Side JNE Shipping Validation ---');

    const badShipRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: `TEST-P1P2-BADSHIP-${runId}`,
        customerName: 'Buyer Test',
        email: ownerEmail,
        address: 'Jl. Tanpa Kota 123',
        items: [{ id: testProdMainId, qty: 1 }],
        shipping: { method: 'jne', city: 'Kota Fiktif Atlantis', price: 0 }
      }
    });
    assert.strictEqual(badShipRes.status, 400, 'Invalid JNE city must be rejected with 400');
    console.log('✓ Invalid JNE city rejected with 400:', badShipRes.data.error);

    const mismatchProvRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: `TEST-P1P2-MISMATCH-${runId}`,
        customerName: 'Buyer Test',
        email: ownerEmail,
        address: 'Jl. Merdeka 10',
        items: [{ id: testProdMainId, qty: 1 }],
        shipping: { method: 'jne', province: 'DKI Jakarta', city: 'Kota Medan', price: 10000 }
      }
    });
    assert.strictEqual(mismatchProvRes.status, 400, 'Mismatched province/city must be rejected with 400');
    console.log('✓ Mismatched province/city rejected with 400:', mismatchProvRes.data.error);

    const tamperOrderId = `TEST-P1P2-SHIP-${runId}`;
    createdOrderIds.push(tamperOrderId);
    const tamperShipRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: tamperOrderId,
        customerName: 'Owner Test',
        email: ownerEmail,
        address: 'Jl. Merdeka 10, Kota Medan, Luar Jawa',
        items: [{ id: testProdMainId, qty: 1, price: 1 }], // Spoofed item price 1
        shipping: {
          method: 'jne',
          province: 'Luar Jawa',
          city: 'Kota Medan',
          price: 0 // Spoofed shipping price 0 (official rate for Kota Medan = 38000)
        }
      }
    });
    assert.strictEqual(tamperShipRes.status, 201, `Expected 201, got ${tamperShipRes.status}`);
    const parsedShip = typeof tamperShipRes.data.shipping === 'string'
      ? JSON.parse(tamperShipRes.data.shipping)
      : tamperShipRes.data.shipping;
    assert.strictEqual(parsedShip.price, 38000, `Expected official JNE Medan rate 38000, got ${parsedShip.price}`);
    assert.strictEqual(Number(tamperShipRes.data.total), 75000 + 38000, 'Expected total = 75000 + 38000');
    console.log('✓ Spoofed shipping price 0 overridden to official JNE Kota Medan rate Rp 38.000 (Total Rp 113.000)');

    const codOrderId = `TEST-P1P2-COD-${runId}`;
    createdOrderIds.push(codOrderId);
    const codShipRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: codOrderId,
        customerName: 'Owner Test',
        email: ownerEmail,
        address: 'Booth Event Jakarta',
        items: [{ id: testProdMainId, qty: 1 }],
        shipping: { method: 'cod_event', price: 50000 }
      }
    });
    assert.strictEqual(codShipRes.status, 201);
    const codShip = typeof codShipRes.data.shipping === 'string'
      ? JSON.parse(codShipRes.data.shipping)
      : codShipRes.data.shipping;
    assert.strictEqual(codShip.price, 0, 'COD Event shipping cost must be forced to 0');
    console.log('✓ COD Event shipping cost enforced to Rp 0');

    // -------------------------------------------------------------------------
    // TEST 2: P1.1 & P2.2 — Payment Proof Auth, Status Lock, & Full Lifecycle History
    // -------------------------------------------------------------------------
    console.log('\n--- [2] P1.1 Payment Proof Ownership & Status Lock + P2.2 Status History ---');

    // 2a. Unauthenticated upload -> 401
    const noAuthProof = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      body: { orderId: tamperOrderId, base64Image: TINY_PNG_DATA_URL }
    });
    assert.strictEqual(noAuthProof.status, 401, `Expected 401 without token, got ${noAuthProof.status}`);
    console.log('✓ Unauthenticated payment proof upload rejected with 401');

    // 2b. Wrong user's JWT -> 403
    const wrongUserProof = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}` },
      body: { orderId: tamperOrderId, base64Image: TINY_PNG_DATA_URL }
    });
    assert.strictEqual(wrongUserProof.status, 403, `Expected 403 for other user, got ${wrongUserProof.status}`);
    console.log('✓ Other user JWT payment proof upload rejected with 403');

    // 2c. Owner's valid JWT while status === 'pending' -> 200
    const ownerProof = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { orderId: tamperOrderId, base64Image: TINY_PNG_DATA_URL }
    });
    assert.strictEqual(ownerProof.status, 200, `Expected 200 for owner, got ${ownerProof.status}`);
    assert.strictEqual(ownerProof.data.order.status, 'payment_pending');
    console.log('✓ Owner JWT payment proof upload succeeded -> status updated to payment_pending');

    // 2d. Duplicate upload attempt while status === 'payment_pending' -> 409 Conflict
    const duplicateProof = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { orderId: tamperOrderId, base64Image: TINY_PNG_DATA_URL }
    });
    assert.strictEqual(duplicateProof.status, 409, `Expected 409 on duplicate upload, got ${duplicateProof.status}`);
    console.log('✓ Duplicate payment proof upload on non-pending order rejected with 409 Conflict');

    // 2e. Admin verifies payment ('paid') -> Admin ships ('shipped' + resi) -> Buyer confirms ('completed')
    const adminVerifyRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { id: tamperOrderId, status: 'paid' }
    });
    assert.strictEqual(adminVerifyRes.status, 200);

    const adminShipRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { id: tamperOrderId, status: 'shipped', resi: 'JNE99887766ID' }
    });
    assert.strictEqual(adminShipRes.status, 200);

    // Unauthenticated customer confirmDelivery must fail with 401
    const unauthCompleteRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      body: { id: tamperOrderId, status: 'completed' }
    });
    assert.strictEqual(unauthCompleteRes.status, 401, 'Customer completion without JWT must return 401');

    // Authenticated owner confirmDelivery succeeds
    const ownerCompleteRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { id: tamperOrderId, status: 'completed' }
    });
    assert.strictEqual(ownerCompleteRes.status, 200);

    // Fetch detail via admin GET /api/orders?id=... and verify status_history timeline
    const detailRes = await invokeHandler(ordersHandler, {
      method: 'GET',
      query: { id: tamperOrderId },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(detailRes.status, 200);
    const history = detailRes.data.status_history;
    assert(Array.isArray(history), 'status_history must be an array');
    const transitions = history.map(h => h.to_status);
    assert.deepStrictEqual(
      transitions,
      ['pending', 'payment_pending', 'paid', 'shipped', 'completed'],
      `Unexpected status history transitions: ${JSON.stringify(transitions)}`
    );
    assert(history.some(h => h.to_status === 'shipped' && String(h.note).includes('JNE99887766ID')), 'Resi must be recorded in history note');
    console.log('✓ Complete 5-step status_history audit trail verified:', transitions.join(' -> '));

    // -------------------------------------------------------------------------
    // TEST 3: P1.4 — Atomic Concurrent Stock Deduction (Anti-Oversell)
    // -------------------------------------------------------------------------
    console.log('\n--- [3] P1.4 Atomic Concurrent Stock Deduction (Anti-Oversell) ---');

    // 3a. Multi-line same product in single cart exceeding stock (stock = 1, M x1 + L x1 = 2)
    const multiLineRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: `TEST-P1P2-MULTILINE-${runId}`,
        customerName: 'Multi Size Buyer',
        email: ownerEmail,
        address: 'Booth Event',
        items: [
          { id: testProdRaceId, size: 'M', qty: 1 },
          { id: testProdRaceId, size: 'L', qty: 1 }
        ],
        shipping: { method: 'cod_event' }
      }
    });
    assert.strictEqual(multiLineRes.status, 400, 'Aggregated duplicate product quantities exceeding stock must fail with 400');
    console.log('✓ Multi-variant cart exceeding total stock rejected cleanly');

    // 3b. 3 simultaneous buyers racing for the last 1 unit in stock
    const raceOrderIds = [
      `TEST-P1P2-RACE1-${runId}`,
      `TEST-P1P2-RACE2-${runId}`,
      `TEST-P1P2-RACE3-${runId}`
    ];
    createdOrderIds.push(...raceOrderIds);

    const raceResults = await Promise.all(
      raceOrderIds.map((oid, idx) =>
        invokeHandler(ordersHandler, {
          method: 'POST',
          body: {
            id: oid,
            customerName: `Racer ${idx + 1}`,
            email: `racer${idx + 1}@test.local`,
            address: 'Booth Event',
            items: [{ id: testProdRaceId, qty: 1 }],
            shipping: { method: 'cod_event' }
          }
        })
      )
    );

    const succeeded = raceResults.filter(r => r.status === 201);
    const rejected = raceResults.filter(r => r.status === 400);
    assert.strictEqual(succeeded.length, 1, `Expected exactly 1 winner for last stock=1, got ${succeeded.length}`);
    assert.strictEqual(rejected.length, 2, `Expected 2 losers with 400, got ${rejected.length}`);

    const afterRaceStockRes = await db.query('SELECT stock FROM products WHERE id = $1', [testProdRaceId]);
    assert.strictEqual(Number(afterRaceStockRes.rows[0].stock), 0, 'Final stock after race MUST be 0 (never negative)');
    console.log('✓ 3 concurrent checkouts on stock=1 -> 1 succeeded (201), 2 rejected (400), final DB stock = 0');

    // -------------------------------------------------------------------------
    // TEST 4: P2.1 — 24-Hour Auto-Cancel for Unpaid Pending Orders
    // -------------------------------------------------------------------------
    console.log('\n--- [4] P2.1 24-Hour Auto-Cancel for Unpaid Pending Orders ---');

    const beforeAutoStockRes = await db.query('SELECT stock FROM products WHERE id = $1', [testProdMainId]);
    const stockBeforeStaleOrders = Number(beforeAutoStockRes.rows[0].stock); // Should be 8 (10 - 2 earlier orders)

    const staleUnpaidId = `TEST-P1P2-STALE-UNPAID-${runId}`;
    const staleWithProofId = `TEST-P1P2-STALE-PROOF-${runId}`;
    createdOrderIds.push(staleUnpaidId, staleWithProofId);

    // Create both orders (each deducts 1 unit -> stock becomes stockBeforeStaleOrders - 2)
    const createStale1 = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: staleUnpaidId,
        customerName: 'Unpaid Buyer',
        email: ownerEmail,
        address: 'Booth Event',
        items: [{ id: testProdMainId, qty: 1 }],
        shipping: { method: 'cod_event' }
      }
    });
    assert.strictEqual(createStale1.status, 201);

    const createStale2 = await invokeHandler(ordersHandler, {
      method: 'POST',
      body: {
        id: staleWithProofId,
        customerName: 'Paid Proof Buyer',
        email: ownerEmail,
        address: 'Booth Event',
        items: [{ id: testProdMainId, qty: 1 }],
        shipping: { method: 'cod_event' }
      }
    });
    assert.strictEqual(createStale2.status, 201);

    // Upload payment proof ONLY for staleWithProofId
    const uploadStale2 = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
      body: { orderId: staleWithProofId, base64Image: TINY_PNG_DATA_URL }
    });
    assert.strictEqual(uploadStale2.status, 200);

    // Backdate BOTH orders to 25 hours ago
    await db.query(
      `UPDATE orders SET date = NOW() - INTERVAL '25 hours' WHERE id = ANY($1::text[])`,
      [[staleUnpaidId, staleWithProofId]]
    );

    // Trigger expiry sweep
    const sweepResult = await expireStalePendingOrders({ force: true });
    assert(sweepResult.cancelledIds.includes(staleUnpaidId), '25h unpaid pending order MUST be auto-cancelled');
    assert(!sweepResult.cancelledIds.includes(staleWithProofId), '25h payment_pending order with proof MUST NOT be auto-cancelled');

    const checkOrdersRes = await db.query(
      `SELECT id, status FROM orders WHERE id = ANY($1::text[])`,
      [[staleUnpaidId, staleWithProofId]]
    );
    const statusMap = new Map(checkOrdersRes.rows.map(r => [r.id, r.status]));
    assert.strictEqual(statusMap.get(staleUnpaidId), 'cancelled', 'Unpaid stale order must be cancelled in DB');
    assert.strictEqual(statusMap.get(staleWithProofId), 'payment_pending', 'Order with proof must remain payment_pending');

    const afterSweepStockRes = await db.query('SELECT stock FROM products WHERE id = $1', [testProdMainId]);
    assert.strictEqual(
      Number(afterSweepStockRes.rows[0].stock),
      stockBeforeStaleOrders - 1,
      'Physical stock from auto-cancelled order must be restored (+1)'
    );
    console.log('✓ 25h unpaid pending order auto-cancelled & stock restored; 25h order with uploaded proof untouched');

    // -------------------------------------------------------------------------
    // TEST 5: P1.3 & P2.3 — XSS Escaping, Internal Route Guard, & Non-Blocking Background Task
    // -------------------------------------------------------------------------
    console.log('\n--- [5] P1.3 XSS Escaping & Helper Route Guard + P2.3 Background Dispatch ---');

    const xssPayload = `<img src=x onerror="alert('xss')"> & 'quote'`;
    const escaped = escapeHtml(xssPayload);
    assert(!escaped.includes('<') && !escaped.includes('>'), 'HTML tags must be escaped');
    assert(escaped.includes('&lt;img') && escaped.includes('&quot;alert(&#39;xss&#39;)&quot;'), 'Quotes and tags must be encoded');
    console.log('✓ escapeHtml neutralizes HTML tags & attribute injection');

    const blockedHelperRoute = await invokeHandler(routeDispatcher, {
      method: 'GET',
      query: { route: 'shipping-rates' }
    });
    assert.strictEqual(blockedHelperRoute.status, 404, 'Internal helper module must return 404 on /api/[route]');
    console.log('✓ Internal helper modules return clean 404 on /api/[route]');

    let bgFinished = false;
    const t0 = Date.now();
    await dispatchBackgroundTask(async () => {
      await new Promise(r => setTimeout(r, 200));
      bgFinished = true;
    }, 'test-bg-task');
    const elapsed = Date.now() - t0;
    assert(elapsed < 80, `dispatchBackgroundTask should return immediately (<80ms), took ${elapsed}ms`);
    await new Promise(r => setTimeout(r, 260));
    assert.strictEqual(bgFinished, true, 'Background task must complete asynchronously');
    console.log(`✓ dispatchBackgroundTask returned in ${elapsed}ms and completed asynchronously`);

    // -------------------------------------------------------------------------
    // TEST 6: Completed Order + 5-Star Rating Email Notification (Admin & Buyer)
    // -------------------------------------------------------------------------
    console.log('\n--- [6] Completed Order 5-Star Rating Email Notification ---');

    const sentEmails = [];
    const origCreateMailTransport = envModule.createMailTransport;
    envModule.createMailTransport = () => ({
      async sendMail(mailOptions) {
        sentEmails.push(mailOptions);
        return { messageId: 'mock-msg-' + sentEmails.length };
      }
    });

    try {
      const realLikeBuyerEmail = `buyer.review.${runId}@gmail-mock-verify.id`;
      const realLikeBuyerToken = generateJWT({
        userId: 90003,
        email: realLikeBuyerEmail,
        username: 'Aika Fan <script>alert(1)</script>',
        type: 'user'
      });

      const adminDoneOrderId = `TEST-P1P2-COMPLETE-ADMIN-${runId}`;
      const buyerDoneOrderId = `TEST-P1P2-COMPLETE-BUYER-${runId}`;
      createdOrderIds.push(adminDoneOrderId, buyerDoneOrderId);

      // Seed 2 shipped orders directly for clean completion testing
      await db.query(
        `INSERT INTO orders (id, "customerName", email, address, status, total, items, shipping)
         VALUES ($1, $2, $3, 'Jl. Test 1', 'shipped', 75000, $4::jsonb, '{"method":"cod_event","price":0}'::jsonb),
                ($5, $2, $3, 'Jl. Test 2', 'shipped', 75000, $4::jsonb, '{"method":"cod_event","price":0}'::jsonb)`,
        [
          adminDoneOrderId,
          'Aika Fan <script>alert(1)</script>',
          realLikeBuyerEmail,
          JSON.stringify([{ id: testProdMainId, name: 'Test Main Acrylic', qty: 1, price: 75000 }]),
          buyerDoneOrderId
        ]
      );

      // 6a. Admin marks order as 'completed'
      const adminCompleteMailRes = await invokeHandler(ordersHandler, {
        method: 'PUT',
        enableEmail: true,
        headers: {
          Authorization: `Bearer ${adminToken}`,
          host: 'localhost:3000'
        },
        body: { id: adminDoneOrderId, status: 'completed' }
      });
      assert.strictEqual(adminCompleteMailRes.status, 200);
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(sentEmails.length, 1, `Expected 1 completed email from admin update, got ${sentEmails.length}`);
      const mail1 = sentEmails[0];
      assert.strictEqual(mail1.to, realLikeBuyerEmail);
      assert(mail1.subject.includes(adminDoneOrderId) && mail1.subject.includes('Rating Bintang 5'), 'Subject must mention order ID and Rating Bintang 5');
      assert(mail1.html.includes('⭐⭐⭐⭐⭐'), 'HTML must include 5 stars');
      assert(!mail1.html.includes('<script>alert(1)</script>'), 'Customer name in HTML email must be XSS-escaped');
      assert(
        mail1.html.includes(`http://localhost:3000/profile.html?tab=orders&amp;review=${encodeURIComponent(adminDoneOrderId)}`),
        'HTML email must include direct review deep-link'
      );

      // Re-saving an already completed order by Admin must NOT send duplicate email
      await invokeHandler(ordersHandler, {
        method: 'PUT',
        enableEmail: true,
        headers: { Authorization: `Bearer ${adminToken}`, host: 'localhost:3000' },
        body: { id: adminDoneOrderId, status: 'completed' }
      });
      await new Promise(r => setTimeout(r, 80));
      assert.strictEqual(sentEmails.length, 1, 'Duplicate admin save on already-completed order must NOT resend email');
      console.log('✓ Admin marking order completed sends 5-star review email once (with XSS-safe HTML & review deep-link)');

      // 6b. Customer confirms delivery ('completed')
      const buyerCompleteMailRes = await invokeHandler(ordersHandler, {
        method: 'PUT',
        enableEmail: true,
        headers: {
          Authorization: `Bearer ${realLikeBuyerToken}`,
          host: 'merch-aika.vercel.app'
        },
        body: { id: buyerDoneOrderId, status: 'completed' }
      });
      assert.strictEqual(buyerCompleteMailRes.status, 200);
      await new Promise(r => setTimeout(r, 80));

      assert.strictEqual(sentEmails.length, 2, `Expected 2nd completed email from customer confirmDelivery, got ${sentEmails.length}`);
      const mail2 = sentEmails[1];
      assert(
        mail2.html.includes(`https://merch-aika.vercel.app/profile.html?tab=orders&amp;review=${encodeURIComponent(buyerDoneOrderId)}`),
        'Production host must generate https review deep-link'
      );
      console.log('✓ Customer confirming delivery ("📦 Diterima") also sends 5-star review email');
    } finally {
      envModule.createMailTransport = origCreateMailTransport;
    }

    console.log('\n🎉 ALL PRIORITY 1 & PRIORITY 2 TESTS PASSED!');
  } finally {
    // Always clean up all temporary test orders (CASCADE cleans order_status_history) and test products
    if (createdOrderIds.length > 0) {
      await db.query('DELETE FROM orders WHERE id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
    }
    await db.query('DELETE FROM orders WHERE id LIKE $1', [`TEST-P1P2-%-${runId}`]).catch(() => {});
    await db.query('DELETE FROM products WHERE id = ANY($1::text[])', [[testProdRaceId, testProdMainId]]).catch(() => {});
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Priority 1 & 2 Test Suite Failed:', err);
    process.exit(1);
  });
