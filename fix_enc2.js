const fs = require('fs');

function fixMojibake(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');

  content = content.replace(/\\?\?/g, (match, offset, full) => {
    // Avoid replacing real ternary operators, only replace `?` before "ditambahkan" or "Keranjang masih", etc.
    return match;
  });
  
  content = content.replace(/âœ…/g, '✅');
  content = content.replace(/âš /g, '⚠️');
  content = content.replace(/âš /g, '⚠️'); // spaces sometimes get lost
  content = content.replace(/â³/g, '⏳');
  content = content.replace(/ðŸ›ï¸/g, '🛍️');
  content = content.replace(/ðŸŽ‰/g, '🎉');
  content = content.replace(/â\sAnda/g, '❌ Anda');
  content = content.replace(/ðŸ“¦/g, '📦');
  content = content.replace(/Ã—/g, '×');
  content = content.replace(/ðŸ›’/g, '🛒');
  
  // Hard code string replacements for checkout.html
  content = content.replace(/showToast\('Kode diskon diterapkan!'\);/, "showToast('🎉 Kode diskon diterapkan!');");
  content = content.replace(/showToast\('Mohon lengkapi semua data pengiriman!'\);/, "showToast('⚠️ Mohon lengkapi semua data pengiriman!');");
  content = content.replace(/showToast\('Gagal memproses pesanan. Coba lagi.'\);/, "showToast('❌ Gagal memproses pesanan. Coba lagi.');");
  content = content.replace(/â³ Menghubungkan/, "⏳ Menghubungkan");
  content = content.replace(/â Anda menutup/, "❌ Anda menutup");
  content = content.replace(/â³ Pembayaran pending/, "⏳ Pembayaran pending");
  content = content.replace(/âš  Mohon lengkapi/, "⚠️ Mohon lengkapi");

  fs.writeFileSync(filepath, content);
}

fixMojibake('checkout.html');
fixMojibake('js/cart.js');

let cartContent = fs.readFileSync('js/cart.js', 'utf8');
cartContent = cartContent.replace(/showToast\(`âœ… \$\{product\.name\} ditambahkan ke keranjang!`\);/g, "showToast(`✅ ${product.name} ditambahkan ke keranjang!`);");
cartContent = cartContent.replace(/showToast\('âš  Anda harus login untuk checkout!'\);/g, "showToast('⚠️ Anda harus login untuk checkout!');");
cartContent = cartContent.replace(/showToast\('âš  Keranjang masih kosong!'\);/g, "showToast('⚠️ Keranjang masih kosong!');");

fs.writeFileSync('js/cart.js', cartContent);

console.log("Done explicitly replacing symbols.");
