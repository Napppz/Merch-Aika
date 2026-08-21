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

function normalizeProductCategory(category) {
  const normalized = String(category || '').trim();
  if (!normalized || normalized.toLowerCase() === 'undefined' || normalized.toLowerCase() === 'null') {
    return '';
  }
  return normalized === 'Stiker' ? 'Acrylic' : normalized;
}

// ── UTILS ──
function formatPrice(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

// ── ORDERS ──
const Orders = {
  async getAll() {
    try { const res = await fetch('/api/orders?t=' + Date.now()); return await res.json(); } catch { return []; }
  },
  async add(order) {
    order.id = 'ORD-' + Date.now();
    order.status = 'pending';
    order.date = new Date().toISOString(); // Attach client-side real-time date explicitly as fallback
    const response = await fetch('/api/orders', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(order) });
    if (response.ok) {
       const dbOrder = await response.json();
       return dbOrder; // Return the full DB order including auto-generated date
    }
    return order;
  },
  async update(id, data) {
    data.id = id;
    await fetch('/api/orders', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
  }
};

// ── WISHLIST TOGGLE ──
window.toggleWishlist = function(btn) {
  const product = {
    id: btn.getAttribute('data-id'),
    name: btn.getAttribute('data-name'),
    price: parseInt(btn.getAttribute('data-price') || '0', 10),
    image: btn.getAttribute('data-img') || ''
  };
  let wishlist = JSON.parse(localStorage.getItem('aika_wishlist') || '[]');
  const existsIndex = wishlist.findIndex(w => w.id === product.id);
  
  const svg = btn.querySelector('svg');
  if (existsIndex >= 0) {
    wishlist.splice(existsIndex, 1);
    svg.style.fill = 'none';
    svg.style.color = 'var(--text-muted)';
    showToast('Dihapus dari Favorit 💔');
  } else {
    wishlist.push(product);
    svg.style.fill = '#ef4444';
    svg.style.color = '#ef4444';
    showToast('Ditambahkan ke Favorit ❤️');
  }
  localStorage.setItem('aika_wishlist', JSON.stringify(wishlist));
};

function checkWishlistStatus(id) {
  const wishlist = JSON.parse(localStorage.getItem('aika_wishlist') || '[]');
  return wishlist.some(w => w.id === id);
}

let cachedProductsMap = {};

// ── RENDER PRODUCT CARD ──
function renderProductCard(p, compact = false) {
  cachedProductsMap[p.id] = p;
  const category = normalizeProductCategory(p.category);
  const isPhotopack = p.is_photopack || category === 'Photopack';
  const emoji = { 'Pakaian': '👕', 'Aksesoris': '💎', 'Foto & Print': '🖼️', 'Acrylic': '🧿', 'Photopack': '📸' };
  const isWishlisted = checkWishlistStatus(p.id);
  const heartFill = isWishlisted ? '#ef4444' : 'none';
  const heartColor = isWishlisted ? '#ef4444' : 'var(--text-muted)';
  const sizes = String(p.sizes || '').split(',').map(size => size.trim()).filter(Boolean);
  const sizeSelectId = `size-${String(p.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const badgeText = p.badge || (isPhotopack ? '📸 Photopack Digital' : '');

  return `
    <div class="product-card fade-in" style="cursor:pointer;" onclick="if(!event.target.closest('button') && !event.target.closest('select') && !event.target.closest('a')) openProductDetail('${p.id}')">
      <div class="product-img-wrap" style="position:relative;">
        <button style="position:absolute; top:12px; left:12px; z-index:10; background:rgba(3,9,31,0.6); backdrop-filter:blur(4px); border:1px solid var(--card-border); border-radius:50%; width:36px; height:36px; color:${heartColor}; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:var(--transition);" 
          data-id="${p.id}" 
          data-name='${(p.name || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;")}' 
          data-price="${p.price}" 
          data-img="${p.image || ''}" 
          onclick='event.stopPropagation(); toggleWishlist(this)' 
          aria-label="Favorit">
          <svg width="20" height="20" fill="${heartFill}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-placeholder" style="display:none">${emoji[category] || '🛍️'}</div>`
          : `<div class="product-placeholder">${emoji[category] || (isPhotopack ? '📸' : '🛍️')}</div>`}
        ${badgeText ? `<span class="product-badge" style="${isPhotopack ? 'background:linear-gradient(135deg, #0284c7, #2563eb);color:#fff;' : ''}">${badgeText}</span>` : ''}
      </div>
      <div class="product-body">
        ${category ? `<div class="product-category">${isPhotopack ? '📸 Photopack Digital' : category}</div>` : ''}
        <div class="product-name" style="transition:color 0.2s ease;">${p.name}</div>
        <div class="product-desc">${p.description}</div>
        ${sizes.length ? `<div style="margin-top:0.75rem;color:var(--text-muted);font-size:0.78rem;">Ukuran: <span style="color:var(--aqua);font-weight:700">${sizes.join(', ')}</span></div>` : ''}
        ${sizes.length ? `<div style="margin-top:0.8rem;" onclick="event.stopPropagation()"><label for="${sizeSelectId}" style="display:block;color:var(--white);font-size:0.78rem;font-weight:700;margin-bottom:0.35rem;">Pilih Size</label><select id="${sizeSelectId}" style="width:100%;border-radius:8px;background:rgba(3,9,31,0.8);border:1px solid var(--card-border);color:var(--white);padding:0.65rem;font-family:var(--font-body);font-size:0.85rem;"><option value="">-- Pilih Size --</option>${sizes.map(size => `<option value="${size}">${size}</option>`).join('')}</select></div>` : ''}
        <div class="product-footer">
          <div>
            <div class="product-price">${formatPrice(p.price)}</div>
            ${p.oldPrice ? `<div class="product-old-price">${formatPrice(p.oldPrice)}</div>` : ''}
          </div>
          <div style="display:flex; gap:0.4rem; align-items:center;">
            <button class="btn-ghost" style="padding:0.5rem 0.75rem; font-size:0.8rem; border-radius:8px;" onclick="event.stopPropagation(); openProductDetail('${p.id}')">
              👁️ Detail
            </button>
            ${isPhotopack ? `
              <button class="btn-primary" style="padding:0.5rem 0.85rem; font-size:0.82rem; border-radius:8px; display:inline-flex; align-items:center; gap:4px; font-weight:700; background:linear-gradient(135deg, #0284c7, #2563eb); border:none; box-shadow:0 4px 14px rgba(2,132,199,0.35); cursor:pointer;" onclick="event.stopPropagation(); window.location.href='checkout-photopack.html?id=${p.id}'">
                ⚡ Beli
              </button>
            ` : `
              <button class="add-cart-btn" 
                data-id="${p.id}" 
                data-name='${(p.name || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;")}' 
                data-price="${p.price}" 
                data-img="${p.image || ''}" 
                data-is-photopack="false"
                data-size-select="${sizes.length ? sizeSelectId : ''}"
                onclick="event.stopPropagation(); Cart.addFromBtn(this)">
                + Keranjang
              </button>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getProductSizes(p) {
  return String(p?.sizes || '').split(',').map(size => size.trim()).filter(Boolean);
}

// ── OPEN PRODUCT / PHOTOPACK DETAIL MODAL ──
async function openProductDetail(id) {
  let p = cachedProductsMap[id] || cachedProductsMap[String(id)];
  if (!p) {
    const all = await Products.getAll();
    all.forEach(item => { cachedProductsMap[String(item.id)] = item; });
    p = cachedProductsMap[String(id)] || all.find(item => String(item.id) === String(id));
  }
  if (!p) {
    console.warn('Product not found for id:', id);
    return;
  }

  const isPhotopack = p.is_photopack || normalizeProductCategory(p.category) === 'Photopack';
  const category = normalizeProductCategory(p.category);
  const sizes = getProductSizes(p);

  let modalEl = document.getElementById('productDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'productDetailModal';
    modalEl.className = 'product-modal-overlay';
    modalEl.onclick = function(e) {
      if (e.target === modalEl) closeProductDetail();
    };
    document.body.appendChild(modalEl);
  }

  const badgeHtml = isPhotopack
    ? `<span class="product-modal-badge">📸 Digital Photopack Eksklusif</span>`
    : `<span class="product-modal-badge" style="background:var(--sea-blue);">${category}</span>`;

  const sizeOptionsHtml = sizes.length ? `
    <div style="margin-bottom:1.2rem;">
      <label style="display:block; color:var(--white); font-size:0.82rem; font-weight:700; margin-bottom:0.4rem;">Pilih Ukuran:</label>
      <select id="modalProductSize" style="width:100%; border-radius:8px; background:rgba(3,9,31,0.8); border:1px solid var(--card-border); color:var(--white); padding:0.75rem; font-family:var(--font-body); font-size:0.9rem;">
        <option value="">-- Pilih Ukuran --</option>
        ${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>
  ` : '';

  modalEl.innerHTML = `
    <div class="product-modal-card">
      <button class="product-modal-close" onclick="closeProductDetail()" aria-label="Tutup">✕</button>
      <div class="product-modal-img-wrap">
        ${p.image 
          ? `<img src="${p.image}" alt="${p.name}" />`
          : `<div style="font-size:4rem;">${isPhotopack ? '📸' : '🛍️'}</div>`}
      </div>
      <div class="product-modal-info" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          ${badgeHtml}
          <h2 class="product-modal-title">${p.name}</h2>
          <div class="product-modal-price">
            ${formatPrice(p.price)}
            ${p.oldPrice ? `<span class="product-modal-old-price">${formatPrice(p.oldPrice)}</span>` : ''}
          </div>
          <div class="product-modal-desc">
            <div style="font-weight:700; color:var(--white); margin-bottom:0.3rem;">Deskripsi:</div>
            ${p.description || 'Koleksi eksklusif dari Aika Sesilia Store.'}
          </div>
          ${sizeOptionsHtml}
        </div>
        <div style="display:flex; gap:0.8rem; flex-wrap:wrap; margin-top:1.5rem;">
          ${isPhotopack ? `
            <a href="checkout-photopack.html?id=${p.id}" class="btn-primary" style="flex:1; padding:0.9rem 1.2rem; font-size:0.95rem; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #0284c7, #2563eb); text-decoration:none; box-shadow:0 4px 15px rgba(2,132,199,0.4);">
              ⚡ Beli Photopack Sekarang
            </a>
          ` : `
            <button class="btn-primary" style="flex:1; padding:0.9rem 1.2rem; font-size:0.95rem; font-weight:700; border-radius:8px;" onclick="addModalItemToCart('${p.id}')">
              🛒 + Masukkan Keranjang
            </button>
          `}
          <button class="btn-ghost" style="padding:0.9rem 1.2rem; font-size:0.95rem; border-radius:8px;" onclick="closeProductDetail()">
            Tutup
          </button>
        </div>
      </div>
    </div>
  `;

  modalEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeProductDetail() {
  const modalEl = document.getElementById('productDetailModal');
  if (modalEl) {
    modalEl.classList.remove('active');
  }
  document.body.style.overflow = '';
}

function addModalItemToCart(productId) {
  const p = cachedProductsMap[productId] || cachedProductsMap[String(productId)];
  if (!p) return;
  const sizeSelect = document.getElementById('modalProductSize');
  const size = sizeSelect ? sizeSelect.value : null;

  if (sizeSelect && sizeSelect.options.length > 1 && !size) {
    showToast('⚠️ Silakan pilih ukuran terlebih dahulu!');
    return;
  }

  Cart.add({
    id: p.id,
    name: p.name,
    price: p.price,
    img: p.image || '',
    size: size,
    is_photopack: false
  });

  closeProductDetail();
}

window.openProductDetail = openProductDetail;
window.closeProductDetail = closeProductDetail;
window.addModalItemToCart = addModalItemToCart;
window.getProductSizes = getProductSizes;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProductDetail();
});

// ── LOAD FEATURED (index.html) ──
async function loadFeaturedProducts() {
  const grid = document.getElementById('featuredGrid');
  const photopackGrid = document.getElementById('featuredPhotopackGrid');
  if (!grid && !photopackGrid) return;
  
  const all = await Products.getAll();

  // Featured Merch (Khusus produk fisik / non-photopack)
  if (grid) {
    const merch = all.filter(p => !p.is_photopack && normalizeProductCategory(p.category) !== 'Photopack');
    const displayMerch = (merch.length ? merch : all).slice(0, 3);
    grid.innerHTML = displayMerch.map(p => renderProductCard(p)).join('');
  }

  // Featured Photopack (Khusus photopack digital)
  if (photopackGrid) {
    const photopacks = all.filter(p => p.is_photopack || normalizeProductCategory(p.category) === 'Photopack');
    if (photopacks.length === 0) {
      photopackGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem;">Belum ada photopack tersedia saat ini.</div>';
    } else {
      photopackGrid.innerHTML = photopacks.slice(0, 3).map(p => renderProductCard(p)).join('');
    }
  }

  initFadeIn();
}

// ── LOAD SHOP ──
async function loadShopProducts(filter = 'Semua', search = '') {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;
  let products = (await Products.getAll()).map(p => ({ ...p, category: normalizeProductCategory(p.category) }));
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
    
    grid.innerHTML = reviews.map((r, i) => `
      <div class="product-card fade-in" style="padding:2rem; text-align:left; background: linear-gradient(145deg, rgba(10,56,114,0.6), rgba(3,9,31,0.8)); position:relative; box-shadow: var(--shadow-blue); transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); animation-delay: ${i * 0.1}s;">
        <div style="position:absolute; top:1rem; right:1.5rem; font-size:3rem; color:var(--aqua); opacity:0.1; font-family:var(--font-display)">"</div>
        <div style="color:var(--gold); margin-bottom:1rem; font-size:1.2rem; filter: drop-shadow(0 0 5px rgba(255,213,79,0.5));">
          ${'⭐'.repeat(r.rating)}
        </div>
        <q style="color:var(--text-main); font-style:italic; display:block; margin-bottom:1.5rem; font-size:1.05rem; line-height: 1.6;">
          ${r.comment}
        </q>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--card-border); padding-top:1rem;">
          <div style="display:flex; align-items:center; gap:0.8rem;">
            <div style="width:35px; height:35px; border-radius:50%; background:var(--aqua); color:var(--deep-ocean); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1rem; font-family:var(--font-display); overflow:hidden;">
              ${r.avatar ? `<img src="${r.avatar}" alt="Foto ${r.customer_name}" style="width:100%;height:100%;object-fit:cover;">` : r.customer_name.charAt(0).toUpperCase()}
            </div>
            <div style="font-weight:700; color:var(--white); font-size:0.95rem;">${r.customer_name}</div>
          </div>
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
