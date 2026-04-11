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

// ── UTILS ──
function formatPrice(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

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

// ── RENDER REVIEWS ──
async function loadReviews() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/reviews');
    const reviews = await res.json();
    if (reviews.length === 0) {
      grid.innerHTML = '<p style="text-align:center; color:var(--text-muted); grid-column:1/-1">Belum ada ulasan. Belilah produk dan jadilah yang pertama mereview!</p>';
      return;
    }
    
    grid.innerHTML = reviews.map(r => `
      <div class="product-card fade-in" style="padding:1.5rem; text-align:left;">
        <div style="color:var(--gold); margin-bottom:0.5rem; font-size:1.1rem;">
          ${'⭐'.repeat(r.rating)}
        </div>
        <q style="color:var(--text-muted); font-style:italic; display:block; margin-bottom:1rem; font-size:0.95rem;">
          "${r.comment}"
        </q>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--card-border); padding-top:1rem;">
          <div style="font-weight:700; color:var(--aqua); font-size:0.9rem;">${r.customer_name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted)">${new Date(r.date || Date.now()).toLocaleDateString('id-ID')}</div>
        </div>
      </div>
    `).join('');
    initFadeIn();
  } catch (e) {
    grid.innerHTML = '<p style="text-align:center; color:#ef4444; grid-column:1/-1">Gagal memuat ulasan.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initFadeIn();
  loadReviews();
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

  initTypingEffect();
  initSmoothScroll();
});

// Polyfill for smooth scroll in some browsers
if (!('scrollBehavior' in document.documentElement.style)) {
  // Option: load a polyfill if needed, but standard scrollTo works in most modern browsers
}

// ── TYPING EFFECT ──
function initTypingEffect() {
  const baseEl = document.getElementById('typingTextBase');
  const italicEl = document.getElementById('typingTextItalic');
  if (!baseEl || !italicEl) return;

  const baseText = "Aika";
  const italicText = "Sesilia";
  let isDeleting = false;
  let charIndex = 0;
  let italicIndex = 0;

  function type() {
    if (!isDeleting) {
      if (charIndex < baseText.length) {
        baseEl.textContent += baseText[charIndex];
        charIndex++;
        setTimeout(type, 200);
      } else if (italicIndex < italicText.length) {
        italicEl.textContent += italicText[italicIndex];
        italicIndex++;
        setTimeout(type, 200);
      } else {
        isDeleting = true;
        setTimeout(type, 3000); // Pause at end
      }
    } else {
      if (italicIndex > 0) {
        italicEl.textContent = italicText.substring(0, italicIndex - 1);
        italicIndex--;
        setTimeout(type, 100);
      } else if (charIndex > 0) {
        baseEl.textContent = baseText.substring(0, charIndex - 1);
        charIndex--;
        setTimeout(type, 100);
      } else {
        isDeleting = false;
        setTimeout(type, 1000); // Pause before restart
      }
    }
  }
  type();
}

// ── ADVANCED SMOOTH SCROLL ──
function initSmoothScroll() {
  document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      
      const offset = 90; // Balanced offset for mobile/desktop navbar
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = targetPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      // Update browser URL without jumping
      history.pushState(null, null, targetId);
    }
  });
}
