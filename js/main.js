// ── PRODUCT STORAGE (Neon DB API) ──
const Products = {
  async getAll() {
    try { const res = await fetch('/api/products'); return await res.json(); } catch { return []; }
  },
  async add(product) {
    product.id = 'p' + Date.now();
    await fetch('/api/products', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(product) });
    return product;
  },
  async update(id, data) {
    data.id = id;
    await fetch('/api/products', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
  },
  async delete(id) {
    await fetch('/api/products?id=' + id, { method: 'DELETE' });
  },
  async get(id) {
    const all = await this.getAll();
    return all.find(p => p.id === id);
  }
};

// ── ORDERS ──
const Orders = {
  async getAll() {
    try { const res = await fetch('/api/orders'); return await res.json(); } catch { return []; }
  },
  async add(order) {
    order.id = 'ORD-' + Date.now();
    order.status = 'pending';
    await fetch('/api/orders', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(order) });
    return order;
  },
  async update(id, data) {
    data.id = id;
    await fetch('/api/orders', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
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
async function loadFeaturedProducts() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  const all = await Products.getAll();
  const products = all.slice(0, 3);
  grid.innerHTML = products.map(p => renderProductCard(p)).join('');
  initFadeIn();
}

// ── LOAD SHOP ──
async function loadShopProducts(filter = 'Semua', search = '') {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  let products = await Products.getAll();
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
