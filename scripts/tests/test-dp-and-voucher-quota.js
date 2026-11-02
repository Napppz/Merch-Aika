/**
 * test-dp-and-voucher-quota.js
 * End-to-end automated test suite for:
 *  1. Voucher Quota (maxUses), 1x-per-Account (oncePerUser), Concurrent Race Protection & Cancel Restoration
 *  2. DP 50% Pelunasan (2nd Payment Proof) & Initial Payment Proof Re-Upload Workflow
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
require('dotenv').config();

const assert = require('assert');
const db = require('../../api/_lib/_db');
const { generateJWT } = require('../../api/_lib/jwt-manager');
const r2Storage = require('../../api/_lib/r2-storage');
const { expireStalePendingOrders } = require('../../api/_lib/order-lifecycle');

// Stub R2 uploader so tests never write test images to production Cloudflare R2
r2Storage.uploadImageBuffer = async ({ fileName }) => ({
  key: `test/${fileName}`,
  imageUrl: `https://cdn.test.local/payment-proofs/${fileName}`
});

const vouchersHandler = require('../../api/_lib/vouchers');
const ordersHandler = require('../../api/_lib/orders');
const userOrdersHandler = require('../../api/_lib/user-orders');
const paymentProofHandler = require('../../api/_lib/payment-proof');

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function invokeHandler(handler, { method = 'GET', query = {}, headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = { 'x-test-suite': '1' };
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
  const testProdId = `TEST-DPVQ-PROD-${runId}`;
  const voucherCode = `TVQ${String(runId).slice(-7)}`;
  const createdOrderIds = [];

  const userAEmail = `usera-${runId}@test.local`;
  const userBEmail = `userb-${runId}@test.local`;
  const userCEmail = `userc-${runId}@test.local`;

  const userAToken = generateJWT({ userId: 91001, email: userAEmail, username: 'User A', type: 'user' });
  const userBToken = generateJWT({ userId: 91002, email: userBEmail, username: 'User B', type: 'user' });
  const userCToken = generateJWT({ userId: 91003, email: userCEmail, username: 'User C', type: 'user' });
  const adminToken = generateJWT({ adminId: 1, username: 'superadmin', role: 'superadmin', type: 'admin' });

  let voucherCreated = false;

  try {
    console.log('🧪 Running DP 50% Pelunasan & Voucher Quota / 1x-Per-User Test Suite...');

    await db.query(
      `INSERT INTO products (id, name, category, price, stock, is_photopack)
       VALUES ($1, $2, 'Pakaian', 120000, 20, FALSE)`,
      [testProdId, 'Test Hoodie Aika Sesilia']
    );

    // =========================================================================
    // PART 1: VOUCHER QUOTA (maxUses) & 1x PER ACCOUNT (oncePerUser)
    // =========================================================================
    console.log('\n--- [1] Voucher Quota (maxUses) & 1x-Per-Account (oncePerUser) ---');

    // 1a. Invalid maxUses = 0 rejected
    const badQuotaRes = await invokeHandler(vouchersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: `${voucherCode}_BAD`,
        label: 'Invalid Quota',
        type: 'fixed',
        value: 10000,
        maxUses: 0,
        oncePerUser: true
      }
    });
    assert.strictEqual(badQuotaRes.status, 400, 'maxUses=0 must be rejected with 400');
    console.log('✓ Invalid maxUses=0 rejected cleanly:', badQuotaRes.data.error);

    // 1b. Admin creates voucher with maxUses = 2, oncePerUser = true
    const createVoucherRes = await invokeHandler(vouchersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: voucherCode,
        label: 'Promo Hemat Rp 20.000',
        type: 'fixed',
        value: 20000,
        minPurchase: 50000,
        maxUses: 2,
        oncePerUser: true,
        isActive: true
      }
    });
    assert.strictEqual(createVoucherRes.status, 201, `Expected 201 creating voucher, got ${createVoucherRes.status}`);
    voucherCreated = true;
    assert.strictEqual(createVoucherRes.data.voucher.maxUses, 2);
    assert.strictEqual(createVoucherRes.data.voucher.oncePerUser, true);
    console.log(`✓ Voucher ${voucherCode} created (maxUses: 2, oncePerUser: true)`);

    // 1c. User A uses voucher on Order 1 -> 201 Created, Rp 20.000 discount applied
    const orderA1 = `TEST-DPVQ-A1-${runId}`;
    createdOrderIds.push(orderA1);
    const resOrderA1 = await invokeHandler(ordersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        id: orderA1,
        customerName: 'User A',
        email: userAEmail,
        address: 'Booth Event Jakarta',
        items: [{ id: testProdId, qty: 1 }],
        shipping: {
          method: 'cod_event',
          discount: { code: voucherCode, amount: 20000 }
        }
      }
    });
    assert.strictEqual(resOrderA1.status, 201, `Expected 201 for User A first use, got ${resOrderA1.status}`);
    assert.strictEqual(Number(resOrderA1.data.total), 100000, 'Expected 120000 - 20000 = 100000');
    console.log('✓ User A 1st voucher use succeeded (Total: Rp 100.000, Quota used: 1/2)');

    // 1d. GET /api/vouchers reflects live usage & per-user flag accurately
    const vCheckUserA = await invokeHandler(vouchersHandler, {
      method: 'GET',
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const vForA = vCheckUserA.data.vouchers.find(v => v.code === voucherCode);
    assert(vForA, 'Voucher must be visible in GET /api/vouchers');
    assert.strictEqual(vForA.usedCount, 1);
    assert.strictEqual(vForA.remainingQuota, 1);
    assert.strictEqual(vForA.isQuotaFull, false);
    assert.strictEqual(vForA.usedByCurrentUser, true, 'User A must see usedByCurrentUser=true');

    const vCheckUserB = await invokeHandler(vouchersHandler, {
      method: 'GET',
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    const vForB = vCheckUserB.data.vouchers.find(v => v.code === voucherCode);
    assert.strictEqual(vForB.usedByCurrentUser, false, 'User B must see usedByCurrentUser=false');
    console.log('✓ GET /api/vouchers accurately reports remainingQuota=1, UserA used=true, UserB used=false');

    // 1e. User A attempts 2nd use (oncePerUser violation) -> 400 & stock untouched!
    const stockBeforeA2 = Number((await db.query('SELECT stock FROM products WHERE id = $1', [testProdId])).rows[0].stock);
    const orderA2 = `TEST-DPVQ-A2-${runId}`;
    createdOrderIds.push(orderA2);
    const resOrderA2 = await invokeHandler(ordersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        id: orderA2,
        customerName: 'User A',
        email: userAEmail.toUpperCase(), // Also tests case-insensitive email matching!
        address: 'Booth Event Jakarta',
        items: [{ id: testProdId, qty: 1 }],
        shipping: {
          method: 'cod_event',
          discount: { code: voucherCode, amount: 20000 }
        }
      }
    });
    assert.strictEqual(resOrderA2.status, 400, 'Second voucher use by same user must fail with 400');
    assert(String(resOrderA2.data.error).includes('1x per akun'), `Unexpected error: ${resOrderA2.data.error}`);
    const stockAfterA2 = Number((await db.query('SELECT stock FROM products WHERE id = $1', [testProdId])).rows[0].stock);
    assert.strictEqual(stockAfterA2, stockBeforeA2, 'Stock must NOT be deducted when voucher validation throws');
    console.log('✓ User A 2nd attempt (case-insensitive email) blocked with 400 & stock rolled back cleanly');

    // 1f. Concurrent race between User B and User C for the LAST remaining slot (1 slot left of maxUses=2)
    const orderB1 = `TEST-DPVQ-B1-${runId}`;
    const orderC1 = `TEST-DPVQ-C1-${runId}`;
    createdOrderIds.push(orderB1, orderC1);

    const [raceB, raceC] = await Promise.all([
      invokeHandler(ordersHandler, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userBToken}` },
        body: {
          id: orderB1,
          customerName: 'User B',
          email: userBEmail,
          address: 'Booth Event',
          items: [{ id: testProdId, qty: 1 }],
          shipping: { method: 'cod_event', discount: { code: voucherCode, amount: 20000 } }
        }
      }),
      invokeHandler(ordersHandler, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userCToken}` },
        body: {
          id: orderC1,
          customerName: 'User C',
          email: userCEmail,
          address: 'Booth Event',
          items: [{ id: testProdId, qty: 1 }],
          shipping: { method: 'cod_event', discount: { code: voucherCode, amount: 20000 } }
        }
      })
    ]);

    const raceResponses = [
      { who: 'B', oid: orderB1, email: userBEmail, token: userBToken, res: raceB },
      { who: 'C', oid: orderC1, email: userCEmail, token: userCToken, res: raceC }
    ];
    const winners = raceResponses.filter(r => r.res.status === 201);
    const losers = raceResponses.filter(r => r.res.status === 400);
    assert.strictEqual(winners.length, 1, `Expected 1 winner for last voucher slot, got ${winners.length}`);
    assert.strictEqual(losers.length, 1, `Expected 1 loser for last voucher slot, got ${losers.length}`);
    assert(String(losers[0].res.data.error).includes('habis'), `Expected quota full message, got: ${losers[0].res.data.error}`);
    console.log(`✓ Concurrent voucher race for last slot -> User ${winners[0].who} won (201), User ${losers[0].who} rejected (400: kuota habis)`);

    // 1g. Cancelling winner's order automatically restores quota slot so loser can now check out!
    const cancelWinnerRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { id: winners[0].oid, status: 'cancelled' }
    });
    assert.strictEqual(cancelWinnerRes.status, 200);

    const retryOrderId = `TEST-DPVQ-RETRY-${runId}`;
    createdOrderIds.push(retryOrderId);
    const retryLoserRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${losers[0].token}` },
      body: {
        id: retryOrderId,
        customerName: `User ${losers[0].who}`,
        email: losers[0].email,
        address: 'Booth Event',
        items: [{ id: testProdId, qty: 1 }],
        shipping: { method: 'cod_event', discount: { code: voucherCode, amount: 20000 } }
      }
    });
    assert.strictEqual(retryLoserRes.status, 201, 'Cancelled order must automatically release voucher quota slot');
    console.log('✓ Cancelling an order automatically released its voucher quota slot for the next buyer');

    // =========================================================================
    // PART 2: DP 50% PELUNASAN & INITIAL PROOF RE-UPLOAD WORKFLOW
    // =========================================================================
    console.log('\n--- [2] DP 50% Pelunasan & Payment Proof Re-Upload Workflow ---');

    // 2a. Full-payment order cannot upload pelunasan proof (400)
    const fullOrderPelunasanAttempt = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: orderA1,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(fullOrderPelunasanAttempt.status, 400, 'Full payment order must reject pelunasan proof with 400');
    console.log('✓ Full-payment order rejects proofType="pelunasan" with 400');

    // 2b. Create a DP 50% order
    const dpOrderId = `TEST-DPVQ-DP-${runId}`;
    createdOrderIds.push(dpOrderId);
    const createDpRes = await invokeHandler(ordersHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        id: dpOrderId,
        customerName: 'User A DP Buyer',
        email: userAEmail,
        address: 'Jl. Melati 10, Kota Bandung, Jawa Barat',
        items: [{ id: testProdId, qty: 1 }], // 120,000 + 15,000 JNE Bandung = 135,000 (DP: 67,500, Sisa: 67,500)
        shipping: {
          method: 'jne',
          province: 'Jawa Barat',
          city: 'Kota Bandung',
          paymentScheme: 'dp50'
        }
      }
    });
    assert.strictEqual(createDpRes.status, 201);
    const createdDpShip = typeof createDpRes.data.shipping === 'string'
      ? JSON.parse(createDpRes.data.shipping)
      : createDpRes.data.shipping;
    assert.strictEqual(createdDpShip.isDp, true);
    assert.strictEqual(createdDpShip.dpAmount, 67500);
    assert.strictEqual(createdDpShip.remainingAmount, 67500);
    assert.strictEqual(createdDpShip.pelunasanStatus, 'unpaid');
    console.log('✓ DP 50% order created (Total: Rp 135.000, DP: Rp 67.500, Sisa: Rp 67.500, pelunasanStatus: unpaid)');

    // 2c. Uploading pelunasan BEFORE initial DP is verified -> 409 Conflict
    const earlyPelunasanRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(earlyPelunasanRes.status, 409, 'Pelunasan before DP verification must return 409');
    console.log('✓ Premature pelunasan upload before DP verification blocked with 409');

    // 2d. Buyer uploads initial DP 50% proof -> payment_pending
    const initialDpProofRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(initialDpProofRes.status, 200);
    assert.strictEqual(initialDpProofRes.data.order.status, 'payment_pending');
    console.log('✓ Initial DP 50% proof uploaded -> status = payment_pending');

    // 2e. Admin requests re-upload of initial proof (blurry image) -> resets to 'pending' WITHOUT cancelling stock!
    const stockBeforeReuploadReq = Number((await db.query('SELECT stock FROM products WHERE id = $1', [testProdId])).rows[0].stock);
    const reqReuploadRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        id: dpOrderId,
        status: 'pending',
        paymentAction: 'request_reupload_initial',
        actionNote: 'Screenshot buram, mohon unggah ulang bukti DP Rp 67.500.'
      }
    });
    assert.strictEqual(reqReuploadRes.status, 200);
    assert.strictEqual(reqReuploadRes.data.status, 'pending');
    const shipAfterReuploadReq = typeof reqReuploadRes.data.shipping === 'string'
      ? JSON.parse(reqReuploadRes.data.shipping)
      : reqReuploadRes.data.shipping;
    assert.strictEqual(shipAfterReuploadReq.reuploadRequested, true);
    assert(shipAfterReuploadReq.reuploadNote.includes('Screenshot buram'));

    const stockAfterReuploadReq = Number((await db.query('SELECT stock FROM products WHERE id = $1', [testProdId])).rows[0].stock);
    assert.strictEqual(stockAfterReuploadReq, stockBeforeReuploadReq, 'Re-upload request must NOT cancel/release buyer stock');

    // Verify 24h auto-cancel sweep does NOT cancel a re-upload order even if date is >24h old
    await db.query(`UPDATE orders SET date = NOW() - INTERVAL '26 hours' WHERE id = $1`, [dpOrderId]);
    const sweepRes = await expireStalePendingOrders({ force: true });
    assert(!sweepRes.cancelledIds.includes(dpOrderId), 'Re-upload order with prior proof must NOT be auto-cancelled');
    console.log('✓ Admin request_reupload_initial reset status to pending safely (stock preserved & protected from 24h sweep)');

    // 2f. Buyer re-uploads clearer initial DP 50% proof -> payment_pending & reuploadRequested cleared
    const reuploadInitialRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(reuploadInitialRes.status, 200);
    assert.strictEqual(reuploadInitialRes.data.order.status, 'payment_pending');

    // 2g. Admin verifies DP 50% -> status = 'paid'
    const verifyDpRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { id: dpOrderId, status: 'paid' }
    });
    assert.strictEqual(verifyDpRes.status, 200);
    console.log('✓ Buyer re-uploaded initial DP proof & Admin verified DP -> status = paid (Dikemas)');

    // 2h. Buyer uploads 2nd payment proof (Pelunasan Sisa 50%) -> 200 OK
    const uploadPelunasanRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(uploadPelunasanRes.status, 200);
    assert.strictEqual(uploadPelunasanRes.data.proofType, 'pelunasan');
    assert.strictEqual(uploadPelunasanRes.data.order.pelunasanStatus, 'pending_verification');

    // Duplicate pelunasan upload while pending_verification -> 409 Conflict
    const dupPelunasanRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(dupPelunasanRes.status, 409, 'Duplicate pelunasan while pending_verification must return 409');
    console.log('✓ Pelunasan proof uploaded (pending_verification) & duplicate upload blocked with 409');

    // 2i. Admin rejects pelunasan -> Buyer re-uploads pelunasan -> Admin verifies pelunasan 100%!
    const rejectPelunasanRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        id: dpOrderId,
        paymentAction: 'reject_pelunasan',
        actionNote: 'Nominal kurang Rp 500, mohon upload bukti pelunasan yang sesuai.'
      }
    });
    assert.strictEqual(rejectPelunasanRes.status, 200);
    const shipRejectedPel = typeof rejectPelunasanRes.data.shipping === 'string'
      ? JSON.parse(rejectPelunasanRes.data.shipping)
      : rejectPelunasanRes.data.shipping;
    assert.strictEqual(shipRejectedPel.pelunasanStatus, 'rejected');

    const reuploadPelunasanRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(reuploadPelunasanRes.status, 200);
    assert.strictEqual(reuploadPelunasanRes.data.order.pelunasanStatus, 'pending_verification');

    const verifyPelunasanRes = await invokeHandler(ordersHandler, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        id: dpOrderId,
        paymentAction: 'verify_pelunasan'
      }
    });
    assert.strictEqual(verifyPelunasanRes.status, 200);
    const shipVerifiedPel = typeof verifyPelunasanRes.data.shipping === 'string'
      ? JSON.parse(verifyPelunasanRes.data.shipping)
      : verifyPelunasanRes.data.shipping;
    assert.strictEqual(shipVerifiedPel.pelunasanStatus, 'verified');
    assert(verifyPelunasanRes.data.payment_proof, 'Initial DP proof must still be intact');
    assert(verifyPelunasanRes.data.pelunasan_proof, 'Pelunasan 50% proof must be saved in pelunasan_proof column');

    // Duplicate pelunasan upload after verified -> 409 Conflict
    const afterVerifiedPelRes = await invokeHandler(paymentProofHandler, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAToken}` },
      body: {
        orderId: dpOrderId,
        proofType: 'pelunasan',
        base64Image: TINY_PNG_DATA_URL
      }
    });
    assert.strictEqual(afterVerifiedPelRes.status, 409);

    // Check user-orders endpoint returns has_payment_proof & has_pelunasan_proof booleans without leaking raw base64 bloat
    const userOrdersRes = await invokeHandler(userOrdersHandler, {
      method: 'GET',
      query: { email: userAEmail },
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    assert.strictEqual(userOrdersRes.status, 200);
    const userDpOrder = userOrdersRes.data.find(o => o.id === dpOrderId);
    assert(userDpOrder, 'DP order must be returned by GET /api/user-orders');
    assert.strictEqual(Boolean(userDpOrder.has_payment_proof), true);
    assert.strictEqual(Boolean(userDpOrder.has_pelunasan_proof), true);

    // Check Admin GET /api/orders?id=... contains full status_history audit trail
    const adminDetailRes = await invokeHandler(ordersHandler, {
      method: 'GET',
      query: { id: dpOrderId },
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminDetailRes.status, 200);
    assert(adminDetailRes.data.status_history.length >= 8, `Expected >=8 history entries, got ${adminDetailRes.data.status_history.length}`);
    assert(
      adminDetailRes.data.status_history.some(h => String(h.note).includes('Lunas 100%')),
      'status_history must record Lunas 100% pelunasan verification'
    );
    console.log('✓ Full DP 50% -> Re-upload -> Pelunasan -> Reject -> Re-upload -> Lunas 100% lifecycle verified!');

    console.log('\n🎉 ALL DP 50% PELUNASAN & VOUCHER QUOTA TESTS PASSED!');
  } finally {
    if (voucherCreated) {
      await invokeHandler(vouchersHandler, {
        method: 'DELETE',
        query: { code: voucherCode },
        headers: { Authorization: `Bearer ${adminToken}` }
      }).catch(() => {});
    }
    if (createdOrderIds.length > 0) {
      await db.query('DELETE FROM orders WHERE id = ANY($1::text[])', [createdOrderIds]).catch(() => {});
    }
    await db.query('DELETE FROM orders WHERE id LIKE $1', [`TEST-DPVQ-%-${runId}`]).catch(() => {});
    await db.query('DELETE FROM products WHERE id = $1', [testProdId]).catch(() => {});
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ DP & Voucher Quota Test Suite Failed:', err);
    process.exit(1);
  });

