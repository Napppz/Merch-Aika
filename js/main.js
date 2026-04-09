// ── PRODUCT STORAGE (simulated backend via localStorage) ──
const Products = {
  getAll() {
    const stored = localStorage.getItem('aika_products');
    if (!stored) {
      // Demo products
      const demo = [
        { id: 'p1', name: 'Ocean Dream Tee', category: 'Pakaian', price: 189000, oldPrice: 220000, description: 'Kaos eksklusif dengan desain khas Aika Sesilia. Material premium, nyaman dipakai seharian.', image: '', badge: 'Terlaris', stock: 15 },
        { id: 'p2', name: 'Starlight Totebag', category: 'Aksesoris', price: 135000, oldPrice: null, description: 'Tote bag canvas bergambar karakter cosplay favorit. Ramah lingkungan & stylish.', image: '', badge: 'Baru', stock: 20 },
        { id: 'p3', name: 'Crystal Keychain', category: 'Aksesoris', price: 75000, oldPrice: null, description: 'Gantungan kunci akrilik bening dengan desain eksklusif. Cocok untuk koleksi!', image: '', badge: null, stock: 50 },
        { id: 'p4', name: 'Moonrise Hoodie', category: 'Pakaian', price: 350000, oldPrice: 420000, description: 'Hoodie premium dengan broderi detail. Hangat, stylish, dan limited edition!', image: '', badge: 'Limited', stock: 8 },
        { id: 'p5', name: 'Signature Poster A3', category: 'Foto & Print', price: 95000, oldPrice: null, description: 'Poster A3 berglossy, ditandatangani langsung oleh Aika Sesilia!', image: '', badge: 'Eksklusif', stock: 30 },
        { id: 'p6', name: 'Cosplay Sticker Pack', category: 'Stiker', price: 45000, oldPrice: null, description: 'Set 20 stiker cosplay dengan berbagai pose karakter ikonik.', image: '', badge: null, stock: 100 },
      ];
      localStorage.setItem('aika_products', JSON.stringify(demo));
      return demo;
    }
    return JSON.parse(stored);
  },

  save(products) {
    localStorage.setItem('aika_products', JSON.stringify(products));
  },

  add(product) {
    const all = this.getAll();
    product.id = 'p' + Date.now();
    all.push(product);
    this.save(all);
    return product;
  },

  update(id, data) {
    const all = this.getAll();
    const idx = all.findIndex(p => p.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...data }; this.save(all); }
  },

  delete(id) {
    const all = this.getAll().filter(p => p.id !== id);
    this.save(all);
  },

  get(id) {
    return this.getAll().find(p => p.id === id);
  }
};

// ── ORDERS ──
const Orders = {
  getAll() { return JSON.parse(localStorage.getItem('aika_orders') || '[]'); },
  save(orders) { localStorage.setItem('aika_orders', JSON.stringify(orders)); },
  add(order) {
    const all = this.getAll();
    order.id = 'ORD-' + Date.now();
    order.date = new Date().toISOString();
    order.status = 'pending';
    all.push(order);
    this.save(all);
    return order;
  },
  update(id, data) {
    const all = this.getAll();
    const idx = all.findIndex(o => o.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...data }; this.save(all); }
  }
};

// ── RENDER PRODUCT CARD ──
function renderProductCard(p, compact = false) {
  const emoji = { 'Pakaian': '👕', 'Aksesoris': '💎', 'Foto & Print': '🖼️', 'Stiker': '✨' };
  return `
    <div class="product-card fade-in">
      <div class="product-img-wrap">
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-placeholder" style="display:none">${emoji[p.category] || '🛍️'}</div>`
          : `<div class="product-placeholder">${emoji[p.category] || '🛍️'}</div>`}
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="product-body">
        <div class="product-category">${p.category}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description}</div>
        <div class="product-footer">
          <div>
            <div class="product-price">${formatPrice(p.price)}</div>
            ${p.oldPrice ? `<div class="product-old-price">${formatPrice(p.oldPrice)}</div>` : ''}
          </div>
          <button class="add-cart-btn" onclick='Cart.add(${JSON.stringify({id: p.id, name: p.name, price: p.price, image: p.image || ''})})'>
            + Keranjang
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── LOAD FEATURED (index.html) ──
function loadFeaturedProducts() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const products = Products.getAll().reverse().slice(0, 3);
  grid.innerHTML = products.map(p => renderProductCard(p)).join('');
  initFadeIn();
}

// ── LOAD SHOP ──
function loadShopProducts(filter = 'Semua', search = '') {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  let products = Products.getAll().reverse();
  if (filter !== 'Semua') products = products.filter(p => p.category === filter);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:3rem;">Produk tidak ditemukan.</div>';
  } else {
    grid.innerHTML = products.map(p => renderProductCard(p)).join('');
    initFadeIn();
  }
}

// ── SCROLL FADE ──
function initFadeIn() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  initFadeIn();
  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.style.background = window.scrollY > 50 ? 'rgba(3,9,31,0.98)' : 'rgba(3,9,31,0.85)';
  });
});
