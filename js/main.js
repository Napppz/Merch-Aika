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
    if (nav) nav.style.background = window.scrollY > 50 ? 'rgba(3, 9, 31, 0.98)' : 'rgba(3, 9, 31, 0.85)';
  });

  // Cursor Glow Logic
  const glow = document.querySelector('.cursor-glow');
  if (glow) {
    window.addEventListener('mousemove', (e) => {
      // Use requestAnimationFrame for smoother performance
      requestAnimationFrame(() => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
      });
    });

    // Add interactive scaling for buttons and links
    const interactiveElements = 'a, button, .product-card, .contact-card, .filter-tab, .brand-logo';
    document.querySelectorAll(interactiveElements).forEach(el => {
      el.addEventListener('mouseenter', () => glow.classList.add('active'));
      el.addEventListener('mouseleave', () => glow.classList.remove('active'));
    });
  }

  // Contact Form Submission
  const form = document.getElementById('contactForm');
  if (form) {
    const result = document.getElementById('formResult');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(form);
      const object = Object.fromEntries(formData);
      const json = JSON.stringify(object);

      result.innerHTML = "⏳ Mengirim pesan...";
      result.className = "form-result";
      result.style.display = "block";
      submitBtn.disabled = true;

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: json
      })
      .then(async (response) => {
        let json = await response.json();
        if (response.status == 200) {
          result.innerHTML = "✅ Pesan berhasil terkirim! Aika akan segera membalasnya.";
          result.classList.add("success");
          form.reset();
        } else {
          console.log(response);
          result.innerHTML = json.message;
          result.classList.add("error");
        }
      })
      .catch(error => {
        console.log(error);
        result.innerHTML = "❌ Terjadi kesalahan. Silakan coba lagi nanti.";
        result.classList.add("error");
      })
      .then(function() {
        submitBtn.disabled = false;
        setTimeout(() => {
          result.style.display = "none";
        }, 5000);
      });
    });
  }
});
