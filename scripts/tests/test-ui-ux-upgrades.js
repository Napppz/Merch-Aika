/**
 * test-ui-ux-upgrades.js
 * Verifies:
 * 1. Full Address Book API (/api/address): auth enforcement, province/city/postal_code persistence,
 *    auto-primary promotion on 1st address, primary switching, partial/full PUT, and DELETE cleanup.
 * 2. Multi-Photo Product & Photopack Teaser Gallery API (/api/products): images JSONB array storage,
 *    unsafe URL filtering, primary `image` sync, reordering, and gdrive_link protection on public GET.
 * 3. Unified #userNav + Gallery/Lightbox + Address Book DOM & helper presence across storefront files.
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const db = require('../../api/_lib/_db');
const { generateJWT } = require('../../api/_lib/jwt-manager');
const addressHandler = require('../../api/_lib/address');
const productsHandler = require('../../api/_lib/products');

function createMockReqRes({ method = 'GET', query = {}, body = {}, headers = {} }) {
  const req = {
    method,
    query,
    body,
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    socket: { remoteAddress: '127.0.0.1' },
    setTimeout() {}
  };

  let statusCode = 200;
  let jsonBody = null;
  let rawEnd = null;
  const resHeaders = {};

  const res = {
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
    end(payload) {
      rawEnd = payload;
      return this;
    },
    setTimeout() {},
    getResult() {
      return { statusCode, body: jsonBody, rawEnd, headers: resHeaders };
    }
  };

  return { req, res };
}

async function runTests() {
  const testEmail = `test-addr-${Date.now()}@example.com`;
  const otherEmail = `other-addr-${Date.now()}@example.com`;
  const testProdId = `TEST-PROD-GALLERY-${Date.now()}`;

  const userToken = generateJWT({
    type: 'user',
    email: testEmail,
    username: 'Aika Tester'
  });

  const adminToken = generateJWT({
    type: 'admin',
    adminId: 999,
    username: 'test_admin'
  });

  try {
    console.log('1️⃣  Testing Address Book API (/api/address)...');

    // 1a. Reject unauthenticated GET
    {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { email: testEmail }
      });
      await addressHandler(req, res);
      assert.strictEqual(res.getResult().statusCode, 401, 'Unauthenticated GET /api/address must return 401');
    }

    // 1b. Reject cross-account access
    {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: { email: otherEmail },
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': otherEmail
        }
      });
      await addressHandler(req, res);
      assert.strictEqual(res.getResult().statusCode, 403, 'Cross-account GET /api/address must return 403');
    }

    // 1c. Create 1st address -> auto-promoted to is_primary = true, stores province & city
    let addr1Id = null;
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        },
        body: {
          label: 'Rumah',
          recipient_name: 'Budi Santoso',
          phone: '081234567890',
          province: 'Jawa Barat',
          city: 'Kota Bandung',
          postal_code: '40115',
          full_address: 'Jl. Braga No. 10, Kec. Sumur Bandung',
          is_primary: false // First address should auto-become primary
        }
      });
      await addressHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 201, 'POST /api/address should return 201');
      assert.strictEqual(out.body.address.is_primary, true, 'First address must auto-become primary');
      assert.strictEqual(out.body.address.province, 'Jawa Barat');
      assert.strictEqual(out.body.address.city, 'Kota Bandung');
      addr1Id = out.body.address.id;
    }

    // 1d. Create 2nd address with is_primary = true -> demotes 1st address
    let addr2Id = null;
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        },
        body: {
          label: 'Kantor',
          recipient_name: 'Budi Kantor',
          phone: '089876543210',
          province: 'DKI Jakarta',
          city: 'Jakarta Selatan',
          postal_code: '12190',
          full_address: 'Jl. Jend. Sudirman Kav. 52-53',
          is_primary: true
        }
      });
      await addressHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 201);
      assert.strictEqual(out.body.address.is_primary, true);
      addr2Id = out.body.address.id;
    }

    // 1e. GET returns both, ordered with primary first
    {
      const { req, res } = createMockReqRes({
        method: 'GET',
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        }
      });
      await addressHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.length, 2);
      assert.strictEqual(String(out.body[0].id), String(addr2Id), 'Primary address should be listed first');
      assert.strictEqual(out.body[0].is_primary, true);
      assert.strictEqual(out.body[1].is_primary, false);
    }

    // 1f. Partial PUT to promote addr1 back to primary & update phone
    {
      const { req, res } = createMockReqRes({
        method: 'PUT',
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        },
        body: {
          id: addr1Id,
          phone: '081111222333',
          is_primary: true
        }
      });
      await addressHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.address.is_primary, true);
      assert.strictEqual(out.body.address.phone, '081111222333');
      assert.strictEqual(out.body.address.province, 'Jawa Barat', 'Partial PUT must preserve existing province');
    }

    // 1g. DELETE primary address (addr1) -> remaining addr2 automatically promoted to primary
    {
      const { req, res } = createMockReqRes({
        method: 'DELETE',
        query: { id: addr1Id },
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        }
      });
      await addressHandler(req, res);
      assert.strictEqual(res.getResult().statusCode, 200);

      const check = createMockReqRes({
        method: 'GET',
        headers: {
          authorization: `Bearer ${userToken}`,
          'x-user-email': testEmail
        }
      });
      await addressHandler(check.req, check.res);
      const rows = check.res.getResult().body;
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].is_primary, true, 'Remaining address must auto-promote to primary');
    }

    console.log('   ✅ Address Book API tests passed!');

    console.log('2️⃣  Testing Multi-Photo Product & Photopack Teaser Gallery API (/api/products)...');

    // 2a. Admin POST multi-photo Photopack with unsafe URL mixed in
    {
      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        body: {
          id: testProdId,
          name: 'TEST Photopack Teaser Gallery',
          category: 'Photopack',
          description: 'Photopack dengan 3 foto teaser',
          price: 75000,
          stock: 99,
          is_photopack: true,
          cosplayer_name: 'Aika Sesilia',
          gdrive_link: 'https://drive.google.com/drive/folders/secret-test-pack',
          images: [
            'https://example.com/aika-cover.webp',
            'https://example.com/aika-teaser-1.webp',
            'javascript:alert(document.cookie)',
            'https://example.com/aika-teaser-2.webp',
            'https://example.com/aika-teaser-1.webp' // duplicate
          ]
        }
      });
      await productsHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 201, 'Admin POST /api/products should return 201');
      assert.deepStrictEqual(out.body.images, [
        'https://example.com/aika-cover.webp',
        'https://example.com/aika-teaser-1.webp',
        'https://example.com/aika-teaser-2.webp'
      ], 'Should strip javascript: scheme and deduplicate gallery URLs');
      assert.strictEqual(out.body.image, 'https://example.com/aika-cover.webp', 'Primary image must sync to images[0]');
    }

    // 2b. Public GET /api/products returns images[] array while hiding gdrive_link
    {
      const { req, res } = createMockReqRes({
        method: 'GET',
        query: {}
      });
      await productsHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 200);
      const found = out.body.find(p => p.id === testProdId);
      assert.ok(found, 'Created test product should appear in public GET /api/products');
      assert.strictEqual(found.images.length, 3);
      assert.strictEqual(found.gdrive_link, undefined, 'gdrive_link must NEVER leak on public GET /api/products');
    }

    // 2c. Admin PUT reorders gallery -> updates primary image automatically
    {
      const { req, res } = createMockReqRes({
        method: 'PUT',
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        body: {
          id: testProdId,
          name: 'TEST Photopack Teaser Gallery',
          category: 'Photopack',
          description: 'Photopack dengan urutan sampul baru',
          price: 75000,
          stock: 99,
          is_photopack: true,
          cosplayer_name: 'Aika Sesilia',
          gdrive_link: 'https://drive.google.com/drive/folders/secret-test-pack',
          images: [
            'https://example.com/aika-teaser-2.webp',
            'https://example.com/aika-cover.webp'
          ]
        }
      });
      await productsHandler(req, res);
      const out = res.getResult();
      assert.strictEqual(out.statusCode, 200);
      assert.strictEqual(out.body.image, 'https://example.com/aika-teaser-2.webp', 'Reordering images[0] must update primary image');
      assert.strictEqual(out.body.images.length, 2);
    }

    console.log('   ✅ Multi-Photo Product Gallery API tests passed!');

    console.log('3️⃣  Verifying Storefront & Admin UI Markup / Assets...');
    const rootDir = process.cwd();
    const pagesWithUserNav = ['index.html', 'shop.html', 'checkout.html', 'checkout-photopack.html'];
    for (const page of pagesWithUserNav) {
      const content = fs.readFileSync(path.join(rootDir, page), 'utf8');
      assert.ok(content.includes('id="userNav"'), `${page} must include #userNav in navbar`);
    }

    const styleCss = fs.readFileSync(path.join(rootDir, 'css/style.css'), 'utf8');
    assert.ok(styleCss.includes('.user-nav') && styleCss.includes('.user-dropdown'), 'css/style.css must centralize .user-nav styles');
    assert.ok(styleCss.includes('.product-modal-gallery') && styleCss.includes('.image-lightbox-overlay'), 'css/style.css must include gallery & lightbox styles');

    const mainJs = fs.readFileSync(path.join(rootDir, 'js/main.js'), 'utf8');
    assert.ok(mainJs.includes('function initUserNavbar()'), 'js/main.js must define initUserNavbar()');
    assert.ok(mainJs.includes('function openImageLightbox('), 'js/main.js must define openImageLightbox()');
    assert.ok(mainJs.includes('function getProductGalleryImages('), 'js/main.js must define getProductGalleryImages()');

    const profileHtml = fs.readFileSync(path.join(rootDir, 'profile.html'), 'utf8');
    assert.ok(
      profileHtml.includes('id="addrProvince"') &&
      profileHtml.includes('id="addrCity"') &&
      profileHtml.includes('id="addrRecipient"') &&
      profileHtml.includes('id="addrPhone"') &&
      profileHtml.includes('id="addrIsPrimary"'),
      'profile.html must include complete Address Book fields'
    );

    const checkoutHtml = fs.readFileSync(path.join(rootDir, 'checkout.html'), 'utf8');
    assert.ok(
      checkoutHtml.includes('fetchAndInitSavedAddresses') &&
      checkoutHtml.includes('calculateRealOngkir()'),
      'checkout.html must auto-fill saved addresses and recalculate JNE ongkir'
    );

    const adminHtml = fs.readFileSync(path.join(rootDir, 'admin/dashboard.html'), 'utf8');
    assert.ok(
      adminHtml.includes('id="adminProductGalleryGrid"') &&
      adminHtml.includes('promoteAdminGalleryPhoto'),
      'admin/dashboard.html must include multi-photo gallery manager'
    );

    console.log('   ✅ Storefront & Admin UI verification passed!');
  } finally {
    // Cleanup test rows in Neon DB
    await db.query('DELETE FROM user_addresses WHERE LOWER(user_email) = LOWER($1)', [testEmail]);
    await db.query('DELETE FROM products WHERE id = $1', [testProdId]);
    if (db.pool && typeof db.pool.end === 'function') {
      await db.pool.end().catch(() => {});
    }
  }
}

runTests()
  .then(() => {
    console.log('\n🎉 All UI/UX & Feature Upgrade tests passed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });

