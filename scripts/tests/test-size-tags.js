require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
const assert = require('assert');
const db = require('../../api/_lib/_db');

// Mirror rules from main.js / cart.js / checkout.html
const SIZE_SURCHARGE_RULES = {
  'Pakaian Kaos': {
    XL: 15000,
    XXL: 25000,
    XXXL: 30000
  },
  'Haori': {
    XL: 50000,
    XXL: 50000,
    XXXL: 50000
  }
};

function getItemSizeTag(item) {
  if (!item) return '';
  const rawTag = String(item.tag || '').trim();
  if (rawTag) {
    if (/haori/i.test(rawTag)) return 'Haori';
    if (/kaos/i.test(rawTag)) return 'Pakaian Kaos';
    return rawTag;
  }
  const name = String(item.name || '').toLowerCase();
  const category = String(item.category || '').toLowerCase();
  if (name.includes('haori')) return 'Haori';
  if (name.includes('kaos') || name.includes('t-shirt') || name.includes('tshirt') || category === 'pakaian') {
    return 'Pakaian Kaos';
  }
  return '';
}

function getItemSizeSurcharge(item, sizeOverride = null) {
  const sizeToCheck = sizeOverride !== null ? sizeOverride : item?.size;
  if (!item || !sizeToCheck) return 0;
  const tag = getItemSizeTag(item);
  const rules = SIZE_SURCHARGE_RULES[tag];
  if (!rules) return 0;
  const key = String(sizeToCheck).trim().toUpperCase();
  return rules[key] || 0;
}

async function runTests() {
  console.log('--- 1. Testing Size Surcharge Rules ---');
  
  // Test Pakaian Kaos
  const kaos = { name: 'Kaos Hitam Merch', category: 'Pakaian', tag: 'Pakaian Kaos' };
  assert.strictEqual(getItemSizeSurcharge(kaos, 'S'), 0, 'Kaos S should be 0');
  assert.strictEqual(getItemSizeSurcharge(kaos, 'M'), 0, 'Kaos M should be 0');
  assert.strictEqual(getItemSizeSurcharge(kaos, 'L'), 0, 'Kaos L should be 0');
  assert.strictEqual(getItemSizeSurcharge(kaos, 'XL'), 15000, 'Kaos XL should be 15000');
  assert.strictEqual(getItemSizeSurcharge(kaos, 'XXL'), 25000, 'Kaos XXL should be 25000');
  assert.strictEqual(getItemSizeSurcharge(kaos, 'XXXL'), 30000, 'Kaos XXXL should be 30000');
  console.log('✓ Pakaian Kaos: S=0, M=0, L=0, XL=+15k, XXL=+25k, XXXL=+30k passed');

  // Test Haori
  const haori = { name: 'Haori Hiu Keren', category: 'Pakaian', tag: 'Haori' };
  assert.strictEqual(getItemSizeSurcharge(haori, 'S'), 0, 'Haori S should be 0');
  assert.strictEqual(getItemSizeSurcharge(haori, 'M'), 0, 'Haori M should be 0');
  assert.strictEqual(getItemSizeSurcharge(haori, 'L'), 0, 'Haori L should be 0');
  assert.strictEqual(getItemSizeSurcharge(haori, 'XL'), 50000, 'Haori XL should be 50000');
  assert.strictEqual(getItemSizeSurcharge(haori, 'XXL'), 50000, 'Haori XXL should be 50000');
  assert.strictEqual(getItemSizeSurcharge(haori, 'XXXL'), 50000, 'Haori XXXL should be 50000');
  console.log('✓ Haori: S=0, M=0, L=0, XL=+50k, XXL=+50k, XXXL=+50k passed');

  // Test Auto-fallback when tag is not set explicitly
  const untaggedKaos = { name: 'Kaos Spesial Aika', category: 'Pakaian' };
  assert.strictEqual(getItemSizeSurcharge(untaggedKaos, 'XL'), 15000, 'Untagged Kaos XL should auto-detect');
  assert.strictEqual(getItemSizeSurcharge(untaggedKaos, 'XXL'), 25000, 'Untagged Kaos XXL should auto-detect');
  assert.strictEqual(getItemSizeSurcharge(untaggedKaos, 'XXXL'), 30000, 'Untagged Kaos XXXL should auto-detect');
  
  const untaggedHaori = { name: '(PO) Haori Vol 2', category: 'Pakaian' };
  assert.strictEqual(getItemSizeSurcharge(untaggedHaori, 'XL'), 50000, 'Untagged Haori XL should auto-detect');
  assert.strictEqual(getItemSizeSurcharge(untaggedHaori, 'XXL'), 50000, 'Untagged Haori XXL should auto-detect');
  assert.strictEqual(getItemSizeSurcharge(untaggedHaori, 'XXXL'), 50000, 'Untagged Haori XXXL should auto-detect');
  console.log('✓ Auto-detection fallback for untagged items passed');

  // Test Non-clothing
  const totebag = { name: 'Totebag Aika', category: 'Aksesoris' };
  assert.strictEqual(getItemSizeSurcharge(totebag, 'XL'), 0, 'Totebag XL should be 0');
  console.log('✓ Non-clothing items return 0 passed');

  console.log('\n--- 2. Testing Database Products & Tag Column ---');
  const { rows } = await db.query('SELECT id, name, category, tag, price, sizes FROM products WHERE category = \'Pakaian\'');
  assert(rows.length > 0, 'Must have clothing products');
  for (const p of rows) {
    assert(p.tag === 'Pakaian Kaos' || p.tag === 'Haori', `Product "${p.name}" has invalid tag: ${p.tag}`);
    console.log(`✓ Product: ${p.name.padEnd(35)} -> Tag: ${p.tag}`);
  }

  console.log('\n--- 3. Testing Cart & Checkout Calculations ---');
  const cartItems = [
    { id: '1', name: 'Kaos Hitam', tag: 'Pakaian Kaos', price: 120000, size: 'XL', qty: 2 }, // surcharge: 15k * 2 = 30k
    { id: '2', name: 'Kaos Putih', tag: 'Pakaian Kaos', price: 120000, size: 'XXL', qty: 1 }, // surcharge: 25k * 1 = 25k
    { id: '3', name: 'Kaos Putih', tag: 'Pakaian Kaos', price: 120000, size: 'XXXL', qty: 1 }, // surcharge: 30k * 1 = 30k
    { id: '4', name: 'Haori Hiu', tag: 'Haori', price: 200000, size: 'XL', qty: 1 }, // surcharge: 50k * 1 = 50k
    { id: '5', name: 'Haori Hiu', tag: 'Haori', price: 200000, size: 'M', qty: 1 } // surcharge: 0
  ];

  const subtotal = cartItems.reduce((sum, i) => sum + (i.price * i.qty), 0);
  const sizeSurcharge = cartItems.reduce((sum, i) => sum + (getItemSizeSurcharge(i) * i.qty), 0);
  const shipping = 15000;
  const grandTotal = subtotal + sizeSurcharge + shipping;
  const dpAmount = Math.ceil(grandTotal * 0.5);
  const remainingAmount = grandTotal - dpAmount;

  // Expected subtotal: (120k*2) + (120k*1) + (120k*1) + (200k*1) + (200k*1) = 240 + 120 + 120 + 200 + 200 = 880,000
  assert.strictEqual(subtotal, 880000, 'Subtotal should be 880,000');
  // Expected surcharge: 30,000 + 25,000 + 30,000 + 50,000 + 0 = 135,000
  assert.strictEqual(sizeSurcharge, 135000, 'Size surcharge should be 135,000');
  // Grand total: 880,000 + 135,000 + 15,000 = 1,030,000
  assert.strictEqual(grandTotal, 1030000, 'Grand total should be 1,030,000');
  assert.strictEqual(dpAmount, 515000, 'DP should be 515,000');
  assert.strictEqual(remainingAmount, 515000, 'Remaining should be 515,000');
  console.log(`✓ Cart Subtotal: Rp ${subtotal.toLocaleString('id-ID')}`);
  console.log(`✓ Total Biaya Varian Size: Rp ${sizeSurcharge.toLocaleString('id-ID')} (XL 15k*2, XXL 25k, XXXL 30k, Haori XL 50k)`);
  console.log(`✓ Ongkir: Rp ${shipping.toLocaleString('id-ID')}`);
  console.log(`✓ Grand Total: Rp ${grandTotal.toLocaleString('id-ID')}`);
  console.log(`✓ DP 50%: Rp ${dpAmount.toLocaleString('id-ID')} / Pelunasan: Rp ${remainingAmount.toLocaleString('id-ID')}`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
