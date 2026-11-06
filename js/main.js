// ── PRODUCT STORAGE (Neon DB API) ──
const Products = {
  async getAll() {
    try { const res = await fetch('/api/products?t=' + Date.now(), { cache: 'no-store' }); return await res.json(); } catch { return []; }
  },
  async add(product) {
    product.id = 'p' + Date.now();
    await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) });
    return product;
  },
  async update(id, data) {
    data.id = id;
    await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
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

// ── UTILS & XSS SANITIZATION ──
function formatPrice(n) {
  return 'Rp ' + (n || 0).toLocaleString('id-ID');
}

function escapeStoreHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeStoreImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(javascript|vbscript|file):/i.test(trimmed)) return '';
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') || trimmed.startsWith('images/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed;
  }
  return '';
}

function getProductGalleryImages(p) {
  if (!p) return [];
  const raw = [];
  if (Array.isArray(p.images)) {
    raw.push(...p.images);
  } else if (typeof p.images === 'string' && p.images.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(p.images);
      if (Array.isArray(parsed)) raw.push(...parsed);
    } catch (_) { }
  }
  if (p.image) raw.push(p.image);

  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const safe = sanitizeStoreImageUrl(item);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    result.push(safe);
  }
  return result;
}

window.escapeStoreHtml = escapeStoreHtml;
window.sanitizeStoreImageUrl = sanitizeStoreImageUrl;
window.getProductGalleryImages = getProductGalleryImages;

function getSessionAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.token) headers['Authorization'] = 'Bearer ' + parsed.token;
      if (parsed?.email) headers['x-user-email'] = parsed.email;
    }
  } catch (e) { }
  return headers;
}

// ── ORDERS ──
const Orders = {
  async getAll() {
    try { const res = await fetch('/api/orders?t=' + Date.now()); return await res.json(); } catch { return []; }
  },
  async add(order) {
    delete order.id; // Pastikan nomor invoice di-generate berurutan oleh server
    order.status = 'pending';
    order.date = new Date().toISOString(); // Attach client-side real-time date explicitly as fallback
    const response = await fetch('/api/orders', { method: 'POST', headers: getSessionAuthHeaders(), body: JSON.stringify(order) });
    if (response.ok) {
      const dbOrder = await response.json();
      return dbOrder; // Return the full DB order including server-generated sequential invoice ID
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Gagal membuat pesanan (Status ${response.status})`);
  },
  async update(id, data) {
    data.id = id;
    await fetch('/api/orders', { method: 'PUT', headers: getSessionAuthHeaders(), body: JSON.stringify(data) });
  }
};

// ── WISHLIST TOGGLE & SYNC ──
window.toggleWishlist = async function (btn) {
  const product = {
    id: String(btn.getAttribute('data-id') || ''),
    name: btn.getAttribute('data-name') || 'Produk',
    price: parseInt(btn.getAttribute('data-price') || '0', 10),
    image: btn.getAttribute('data-img') || ''
  };
  if (!product.id) return;

  let wishlist = JSON.parse(localStorage.getItem('aika_wishlist') || '[]');
  const existsIndex = wishlist.findIndex(w => String(w.id) === product.id);

  const svg = btn.querySelector('svg');
  const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
  let userEmail = null;
  let userToken = null;
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      userEmail = u?.email;
      userToken = u?.token;
    } catch (e) { }
  }

  if (existsIndex >= 0) {
    wishlist.splice(existsIndex, 1);
    if (svg) {
      svg.setAttribute('fill', 'none');
      svg.style.fill = 'none';
      svg.style.color = 'var(--text-muted)';
    }
    btn.style.color = 'var(--text-muted)';
    showToast('Dihapus dari Favorit 💔');

    if (userEmail) {
      try {
        await fetch(`/api/wishlist?product_id=${encodeURIComponent(product.id)}`, {
          method: 'DELETE',
          headers: {
            'x-user-email': userEmail,
            ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
          }
        });
      } catch (err) {
        console.error('Failed to remove wishlist from server:', err);
      }
    }
  } else {
    wishlist.push(product);
    if (svg) {
      svg.setAttribute('fill', '#ef4444');
      svg.style.fill = '#ef4444';
      svg.style.color = '#ef4444';
    }
    btn.style.color = '#ef4444';
    showToast('Ditambahkan ke Favorit ❤️');

    if (userEmail) {
      try {
        await fetch('/api/wishlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': userEmail,
            ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
          },
          body: JSON.stringify({ product_id: product.id })
        });
      } catch (err) {
        console.error('Failed to add wishlist to server:', err);
      }
    }
  }
  localStorage.setItem('aika_wishlist', JSON.stringify(wishlist));
};

function checkWishlistStatus(id) {
  const wishlist = JSON.parse(localStorage.getItem('aika_wishlist') || '[]');
  return wishlist.some(w => String(w.id) === String(id));
}

async function syncWishlistWithServer() {
  try {
    const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    if (!user || !user.email) return;

    const res = await fetch(`/api/wishlist?email=${encodeURIComponent(user.email)}&_t=${Date.now()}`, {
      headers: user.token ? { 'Authorization': `Bearer ${user.token}` } : {}
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        const serverWishlist = data.items.map(item => ({
          id: String(item.id),
          name: item.name,
          price: item.price,
          image: item.image
        }));
        localStorage.setItem('aika_wishlist', JSON.stringify(serverWishlist));

        // Update all heart icons on current page
        document.querySelectorAll('button[data-id][onclick*="toggleWishlist"]').forEach(btn => {
          const id = String(btn.getAttribute('data-id'));
          const isWish = serverWishlist.some(w => String(w.id) === id);
          const svg = btn.querySelector('svg');
          if (svg) {
            svg.setAttribute('fill', isWish ? '#ef4444' : 'none');
            svg.style.fill = isWish ? '#ef4444' : 'none';
            svg.style.color = isWish ? '#ef4444' : 'var(--text-muted)';
            btn.style.color = isWish ? '#ef4444' : 'var(--text-muted)';
          }
        });
      }
    }
  } catch (err) {
    console.error('Error syncing wishlist with server:', err);
  }
}

let cachedProductsMap = {};

// ── SIZE SURCHARGE RULES ──
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

function getProductSizeTag(p) {
  if (!p) return '';
  const rawTag = String(p.tag || '').trim();
  if (rawTag) {
    if (/haori/i.test(rawTag)) return 'Haori';
    if (/kaos/i.test(rawTag)) return 'Pakaian Kaos';
    return rawTag;
  }
  const name = String(p.name || '').toLowerCase();
  const category = String(p.category || '').toLowerCase();
  if (name.includes('haori')) return 'Haori';
  if (name.includes('kaos') || name.includes('t-shirt') || name.includes('tshirt') || category === 'pakaian') {
    return 'Pakaian Kaos';
  }
  return '';
}

function getProductSizeSurcharge(p, size) {
  if (!p || !size) return 0;
  const tag = getProductSizeTag(p);
  const rules = SIZE_SURCHARGE_RULES[tag];
  if (!rules) return 0;
  const key = String(size).trim().toUpperCase();
  return rules[key] || 0;
}

function handleCardSizeChange(productId, size, priceElId) {
  const p = cachedProductsMap[productId] || cachedProductsMap[String(productId)];
  const el = document.getElementById(priceElId);
  if (!p || !el) return;
  const surcharge = getProductSizeSurcharge(p, size);
  const finalPrice = (parseInt(p.price, 10) || 0) + surcharge;
  el.innerHTML = `${formatPrice(finalPrice)}${surcharge > 0 ? ` <span style="font-size:0.75rem;color:var(--aqua);font-weight:normal;">(+${formatPrice(surcharge)})</span>` : ''}`;
}

function handleModalSizeChange(productId, size) {
  const p = cachedProductsMap[productId] || cachedProductsMap[String(productId)];
  const priceEl = document.getElementById('modalProductPrice');
  if (!p || !priceEl) return;
  const surcharge = getProductSizeSurcharge(p, size);
  const finalPrice = (parseInt(p.price, 10) || 0) + surcharge;
  priceEl.innerHTML = `
    ${formatPrice(finalPrice)}
    ${p.oldPrice ? `<span class="product-modal-old-price">${formatPrice(p.oldPrice)}</span>` : ''}
    ${surcharge > 0 ? `<span style="font-size:0.8rem;color:var(--aqua);font-weight:normal;display:block;margin-top:0.25rem;">(Termasuk tambahan ukuran ${escapeStoreHtml(size)}: +${formatPrice(surcharge)})</span>` : ''}
  `;
}

// ── RENDER PRODUCT CARD ──
function renderProductCard(p, compact = false) {
  cachedProductsMap[p.id] = p;
  cachedProductsMap[String(p.id)] = p;
  const category = normalizeProductCategory(p.category);
  const isPhotopack = p.is_photopack || category === 'Photopack';
  const emoji = { 'Pakaian': '👕', 'Aksesoris': '💎', 'Foto & Print': '🖼️', 'Acrylic': '🧿', 'Photopack': '📸' };
  const isWishlisted = checkWishlistStatus(p.id);
  const heartFill = isWishlisted ? '#ef4444' : 'none';
  const heartColor = isWishlisted ? '#ef4444' : 'var(--text-muted)';
  const sizes = String(p.sizes || '').split(',').map(size => size.trim()).filter(Boolean);
  const safeIdAttr = escapeStoreHtml(p.id);
  const sizeSelectId = `size-${String(p.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const cardPriceId = `price-${String(p.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const stock = parseInt(p.stock, 10) || 0;
  const isOutOfStock = !isPhotopack && stock <= 0;
  const badgeText = isOutOfStock
    ? '❌ Habis'
    : (p.badge || (isPhotopack ? '📸 Photopack Digital' : ''));
  const productTag = getProductSizeTag(p);
  const galleryImages = getProductGalleryImages(p);
  const primaryImage = galleryImages[0] || '';
  const safeName = escapeStoreHtml(p.name || 'Produk');
  const safeDesc = escapeStoreHtml(p.description || '');
  const photoCountBadge = galleryImages.length > 1
    ? `<span class="product-photo-count-badge">${isPhotopack ? `👀 ${galleryImages.length} Teaser` : `📷 ${galleryImages.length} Foto`}</span>`
    : '';

  return `
    <div class="product-card fade-in" style="cursor:pointer;" data-pid="${safeIdAttr}" onclick="if(!event.target.closest('button') && !event.target.closest('select') && !event.target.closest('a')) openProductDetail(this.dataset.pid)">
      <div class="product-img-wrap" style="position:relative;">
        <button style="position:absolute; top:12px; left:12px; z-index:10; background:rgba(3,9,31,0.6); backdrop-filter:blur(4px); border:1px solid var(--card-border); border-radius:50%; width:36px; height:36px; color:${heartColor}; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:var(--transition);" 
          data-id="${safeIdAttr}" 
          data-name="${safeName}" 
          data-price="${parseInt(p.price, 10) || 0}" 
          data-img="${escapeStoreHtml(primaryImage)}" 
          onclick="event.stopPropagation(); toggleWishlist(this)" 
          aria-label="Favorit">
          <svg width="20" height="20" fill="${heartFill}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        ${primaryImage
      ? `<img src="${escapeStoreHtml(primaryImage)}" alt="${safeName}" loading="lazy" style="${isOutOfStock ? 'filter:grayscale(0.65) opacity(0.85);' : ''}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-placeholder" style="display:none">${emoji[category] || '🛍️'}</div>`
      : `<div class="product-placeholder">${emoji[category] || (isPhotopack ? '📸' : '🛍️')}</div>`}
        ${badgeText ? `<span class="product-badge" style="${isOutOfStock ? 'background:#ef4444;color:#fff;font-weight:800;' : (isPhotopack ? 'background:linear-gradient(135deg, #0284c7, #2563eb);color:#fff;' : '')}">${escapeStoreHtml(badgeText)}</span>` : ''}
        ${photoCountBadge}
      </div>
      <div class="product-body">
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:0.35rem;">
          ${category ? `<div class="product-category" style="margin-bottom:0;">${isPhotopack ? '📸 Photopack Digital' : escapeStoreHtml(category)}</div>` : ''}
          ${productTag ? `<span class="product-tag-pill" style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(41,182,246,0.15); color:var(--aqua); border:1px solid rgba(41,182,246,0.3); display:inline-block;">🏷️ ${escapeStoreHtml(productTag)}</span>` : ''}
        </div>
        <div class="product-name" style="transition:color 0.2s ease;">${safeName}</div>
        <div class="product-desc">${safeDesc}</div>
        ${!isPhotopack ? `
          <div style="margin-top:0.45rem; font-size:0.78rem;">
            ${isOutOfStock 
              ? `<span style="color:#ef4444; font-weight:800;">⚠️ Stok Habis</span>` 
              : `<span style="color:var(--text-muted);">Stok: <strong style="color:${stock <= 3 ? '#f59e0b' : '#38bdf8'};">${stock} unit</strong></span>`}
          </div>
        ` : ''}
        ${sizes.length ? `<div style="margin-top:0.5rem;color:var(--text-muted);font-size:0.78rem;">Ukuran: <span style="color:var(--aqua);font-weight:700">${escapeStoreHtml(sizes.join(', '))}</span></div>` : ''}
        ${sizes.length ? `
          <div style="margin-top:0.65rem;" onclick="event.stopPropagation()">
            <label for="${sizeSelectId}" style="display:block;color:var(--white);font-size:0.78rem;font-weight:700;margin-bottom:0.35rem;">Pilih Size</label>
            <select id="${sizeSelectId}" data-pid="${safeIdAttr}" ${isOutOfStock ? 'disabled' : ''} onchange="handleCardSizeChange(this.dataset.pid, this.value, '${cardPriceId}')" style="width:100%;border-radius:8px;background:rgba(3,9,31,0.8);border:1px solid var(--card-border);color:var(--white);padding:0.65rem;font-family:var(--font-body);font-size:0.85rem;${isOutOfStock ? 'opacity:0.5;cursor:not-allowed;' : ''}">
              <option value="">${isOutOfStock ? '-- Stok Habis --' : '-- Pilih Size --'}</option>
              ${sizes.map(size => {
                const surcharge = getProductSizeSurcharge(p, size);
                const surchargeText = surcharge > 0 ? ` (+${formatPrice(surcharge)})` : '';
                return `<option value="${escapeStoreHtml(size)}">${escapeStoreHtml(size)}${surchargeText}</option>`;
              }).join('')}
            </select>
          </div>
        ` : ''}
        <div class="product-footer">
          <div>
            <div class="product-price" id="${cardPriceId}">${formatPrice(p.price)}</div>
            ${p.oldPrice ? `<div class="product-old-price">${formatPrice(p.oldPrice)}</div>` : ''}
          </div>
          <div style="display:flex; gap:0.4rem; align-items:center;">
            <button class="btn-ghost" data-pid="${safeIdAttr}" style="padding:0.5rem 0.75rem; font-size:0.8rem; border-radius:8px;" onclick="event.stopPropagation(); openProductDetail(this.dataset.pid)">
              👁️ Detail
            </button>
            ${isPhotopack ? `
              <button class="btn-primary" style="padding:0.5rem 0.85rem; font-size:0.82rem; border-radius:8px; display:inline-flex; align-items:center; gap:4px; font-weight:700; background:linear-gradient(135deg, #0284c7, #2563eb); border:none; box-shadow:0 4px 14px rgba(2,132,199,0.35); cursor:pointer;" onclick="event.stopPropagation(); window.location.href='checkout-photopack.html?id=${encodeURIComponent(p.id)}'">
              ⚡ Beli
              </button>
            ` : (isOutOfStock ? `
              <button class="add-cart-btn disabled" disabled style="opacity:0.45; cursor:not-allowed; background:#1e293b; border:1px solid #334155; color:#94a3b8; font-weight:700; padding:0.5rem 0.75rem; font-size:0.8rem; border-radius:8px;" title="Stok produk ini sudah habis">
                Stok Habis
              </button>
            ` : `
              <button class="add-cart-btn" 
                data-id="${safeIdAttr}" 
                data-name="${safeName}" 
                data-price="${parseInt(p.price, 10) || 0}" 
                data-img="${escapeStoreHtml(primaryImage)}" 
                data-tag="${escapeStoreHtml(productTag)}"
                data-stock="${stock}"
                data-is-photopack="false"
                data-size-select="${sizes.length ? sizeSelectId : ''}"
                onclick="event.stopPropagation(); Cart.addFromBtn(this)">
                + Keranjang
              </button>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getProductSizes(p) {
  return String(p?.sizes || '').split(',').map(size => size.trim()).filter(Boolean);
}

// ── MULTI-PHOTO GALLERY & FULLSCREEN ZOOM LIGHTBOX STATE ──
let activeModalGalleryState = {
  productId: null,
  title: '',
  isPhotopack: false,
  isOutOfStock: false,
  images: [],
  currentIndex: 0
};

let activeLightboxState = {
  images: [],
  currentIndex: 0,
  title: '',
  isZoomed: false
};

function getGalleryCounterLabel(index, total, isPhotopack) {
  if (total <= 1) return isPhotopack ? '✨ Sampul Photopack' : '';
  if (isPhotopack) {
    return index === 0 ? `📸 Sampul • 1 / ${total}` : `✨ Teaser #${index} • ${index + 1} / ${total}`;
  }
  return `📷 ${index + 1} / ${total}`;
}

function setProductModalGalleryIndex(nextIdx) {
  const imgs = activeModalGalleryState.images || [];
  if (!imgs.length) return;
  const total = imgs.length;
  const normalizedIdx = ((nextIdx % total) + total) % total;
  activeModalGalleryState.currentIndex = normalizedIdx;

  const mainImg = document.getElementById('modalMainProductImg');
  if (mainImg) {
    mainImg.style.opacity = '0.35';
    setTimeout(() => {
      mainImg.src = imgs[normalizedIdx];
      mainImg.style.opacity = '1';
    }, 60);
  }

  const counterEl = document.getElementById('modalGalleryCounter');
  if (counterEl) {
    const label = getGalleryCounterLabel(normalizedIdx, total, activeModalGalleryState.isPhotopack);
    counterEl.textContent = label;
    counterEl.style.display = label ? 'inline-block' : 'none';
  }

  document.querySelectorAll('#productDetailModal .product-gallery-thumb').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === normalizedIdx);
    if (idx === normalizedIdx && typeof btn.scrollIntoView === 'function') {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  });
}

function stepProductModalGallery(delta) {
  setProductModalGalleryIndex(activeModalGalleryState.currentIndex + delta);
}

function openProductLightbox() {
  if (!activeModalGalleryState.images.length) return;
  openImageLightbox(
    activeModalGalleryState.images,
    activeModalGalleryState.currentIndex,
    activeModalGalleryState.title
  );
}

function bindGallerySwipe(stageEl, onSwipeLeft, onSwipeRight, shouldAllowSwipe) {
  if (!stageEl || stageEl.dataset.swipeBound === 'true') return;
  stageEl.dataset.swipeBound = 'true';
  let touchStartX = 0;
  let touchStartY = 0;

  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  stageEl.addEventListener('touchend', (e) => {
    if (shouldAllowSwipe && !shouldAllowSwipe()) return;
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    }
  }, { passive: true });
}

function ensureLightboxElement() {
  let lb = document.getElementById('imageLightboxModal');
  if (lb) return lb;

  lb = document.createElement('div');
  lb.id = 'imageLightboxModal';
  lb.className = 'image-lightbox-overlay';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `
    <div class="lightbox-topbar">
      <div class="lightbox-title-wrap">
        <div class="lightbox-title" id="lightboxTitle">Preview Gambar</div>
        <div class="lightbox-counter" id="lightboxCounter"></div>
      </div>
      <div class="lightbox-actions">
        <button type="button" class="lightbox-action-btn" id="lightboxZoomBtn" onclick="toggleLightboxZoom()">🔍+ Perbesar</button>
        <button type="button" class="lightbox-close-btn" onclick="closeImageLightbox()" aria-label="Tutup Zoom">✕</button>
      </div>
    </div>
    <div class="lightbox-stage-wrap" id="lightboxStageWrap">
      <button type="button" class="lightbox-nav-btn prev" id="lightboxPrevBtn" onclick="event.stopPropagation(); stepLightboxImage(-1)" aria-label="Foto sebelumnya">‹</button>
      <div class="lightbox-viewport" id="lightboxViewport">
        <img id="lightboxMainImg" class="lightbox-img" alt="Zoom Preview" onclick="event.stopPropagation(); toggleLightboxZoom()" />
      </div>
      <button type="button" class="lightbox-nav-btn next" id="lightboxNextBtn" onclick="event.stopPropagation(); stepLightboxImage(1)" aria-label="Foto berikutnya">›</button>
    </div>
    <div class="lightbox-thumbs-bar" id="lightboxThumbsBar"></div>
  `;

  document.body.appendChild(lb);

  const viewport = lb.querySelector('#lightboxViewport');
  viewport.addEventListener('click', (e) => {
    if (e.target === viewport && !activeLightboxState.isZoomed) {
      closeImageLightbox();
    }
  });

  // Mouse drag-to-pan on desktop when zoomed
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let scrollLeft = 0;
  let scrollTop = 0;
  let movedDuringDrag = false;

  viewport.addEventListener('mousedown', (e) => {
    if (!activeLightboxState.isZoomed) return;
    isDragging = true;
    movedDuringDrag = false;
    viewport.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    scrollLeft = viewport.scrollLeft;
    scrollTop = viewport.scrollTop;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedDuringDrag = true;
    viewport.scrollLeft = scrollLeft - dx;
    viewport.scrollTop = scrollTop - dy;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('dragging');
  });

  const mainImg = lb.querySelector('#lightboxMainImg');
  mainImg.addEventListener('click', (e) => {
    if (movedDuringDrag) {
      e.stopImmediatePropagation();
      movedDuringDrag = false;
    }
  }, true);

  bindGallerySwipe(
    viewport,
    () => { if (activeLightboxState.images.length > 1) stepLightboxImage(1); },
    () => { if (activeLightboxState.images.length > 1) stepLightboxImage(-1); },
    () => !activeLightboxState.isZoomed
  );

  return lb;
}

function updateLightboxUI() {
  const lb = ensureLightboxElement();
  const imgs = activeLightboxState.images || [];
  if (!imgs.length) return;
  const idx = activeLightboxState.currentIndex;
  const total = imgs.length;

  const titleEl = lb.querySelector('#lightboxTitle');
  const counterEl = lb.querySelector('#lightboxCounter');
  const imgEl = lb.querySelector('#lightboxMainImg');
  const prevBtn = lb.querySelector('#lightboxPrevBtn');
  const nextBtn = lb.querySelector('#lightboxNextBtn');
  const thumbsBar = lb.querySelector('#lightboxThumbsBar');
  const viewport = lb.querySelector('#lightboxViewport');
  const zoomBtn = lb.querySelector('#lightboxZoomBtn');

  if (titleEl) titleEl.textContent = activeLightboxState.title || 'Preview Gambar';
  if (counterEl) counterEl.textContent = total > 1 ? `Foto ${idx + 1} dari ${total} • Klik gambar untuk Zoom` : 'Klik gambar untuk Zoom detail';
  if (imgEl) {
    imgEl.src = imgs[idx];
    imgEl.alt = activeLightboxState.title || 'Zoom Preview';
  }
  if (prevBtn) prevBtn.style.display = total > 1 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = total > 1 ? 'flex' : 'none';

  if (viewport) {
    viewport.classList.toggle('zoomed', activeLightboxState.isZoomed);
  }
  if (zoomBtn) {
    zoomBtn.innerHTML = activeLightboxState.isZoomed ? '🔍- Normal' : '🔍+ Perbesar';
  }

  if (thumbsBar) {
    if (total > 1) {
      thumbsBar.style.display = 'flex';
      thumbsBar.innerHTML = imgs.map((src, i) => `
        <button type="button" class="lightbox-thumb-btn ${i === idx ? 'active' : ''}" onclick="setLightboxImageIndex(${i})" aria-label="Pilih foto ${i + 1}">
          <img src="${escapeStoreHtml(src)}" alt="Thumb ${i + 1}" />
        </button>
      `).join('');
    } else {
      thumbsBar.style.display = 'none';
      thumbsBar.innerHTML = '';
    }
  }
}

function openImageLightbox(images, startIndex = 0, title = 'Preview Produk') {
  const cleanList = (Array.isArray(images) ? images : [images])
    .map(sanitizeStoreImageUrl)
    .filter(Boolean);
  if (!cleanList.length) return;

  const lb = ensureLightboxElement();
  activeLightboxState = {
    images: cleanList,
    currentIndex: Math.min(Math.max(0, parseInt(startIndex, 10) || 0), cleanList.length - 1),
    title: title || 'Preview Produk',
    isZoomed: false
  };
  updateLightboxUI();
  lb.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function isLightboxOpen() {
  const lb = document.getElementById('imageLightboxModal');
  return Boolean(lb && lb.classList.contains('active'));
}

function closeImageLightbox() {
  const lb = document.getElementById('imageLightboxModal');
  if (lb) {
    lb.classList.remove('active');
    activeLightboxState.isZoomed = false;
    const vp = lb.querySelector('#lightboxViewport');
    if (vp) vp.classList.remove('zoomed');
  }
  const detailModal = document.getElementById('productDetailModal');
  if (!detailModal || !detailModal.classList.contains('active')) {
    document.body.style.overflow = '';
  }
}

function setLightboxImageIndex(idx) {
  const total = activeLightboxState.images.length;
  if (!total) return;
  activeLightboxState.currentIndex = ((idx % total) + total) % total;
  activeLightboxState.isZoomed = false;
  updateLightboxUI();
  // Sync underlying product detail modal gallery if open
  const detailModal = document.getElementById('productDetailModal');
  if (detailModal && detailModal.classList.contains('active') && activeModalGalleryState.images.length === total) {
    setProductModalGalleryIndex(activeLightboxState.currentIndex);
  }
}

function stepLightboxImage(delta) {
  setLightboxImageIndex(activeLightboxState.currentIndex + delta);
}

function toggleLightboxZoom() {
  const lb = ensureLightboxElement();
  const viewport = lb.querySelector('#lightboxViewport');
  activeLightboxState.isZoomed = !activeLightboxState.isZoomed;
  updateLightboxUI();

  if (activeLightboxState.isZoomed && viewport) {
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    });
  }
}

window.setProductModalGalleryIndex = setProductModalGalleryIndex;
window.stepProductModalGallery = stepProductModalGallery;
window.openProductLightbox = openProductLightbox;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.setLightboxImageIndex = setLightboxImageIndex;
window.stepLightboxImage = stepLightboxImage;
window.toggleLightboxZoom = toggleLightboxZoom;

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
  const productTag = getProductSizeTag(p);
  const stock = parseInt(p.stock, 10) || 0;
  const isOutOfStock = !isPhotopack && stock <= 0;
  const galleryImages = getProductGalleryImages(p);
  const primaryImage = galleryImages[0] || '';
  const safeName = escapeStoreHtml(p.name || 'Produk');
  const safeIdAttr = escapeStoreHtml(p.id);

  activeModalGalleryState = {
    productId: p.id,
    title: p.name || 'Produk',
    isPhotopack,
    isOutOfStock,
    images: galleryImages,
    currentIndex: 0
  };

  let modalEl = document.getElementById('productDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'productDetailModal';
    modalEl.className = 'product-modal-overlay';
    modalEl.onclick = function (e) {
      if (e.target === modalEl) closeProductDetail();
    };
    document.body.appendChild(modalEl);
  }

  const badgeHtml = isPhotopack
    ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:0.5rem;">
         <span class="product-modal-badge" style="margin-bottom:0;">📸 Digital Photopack Eksklusif</span>
         ${p.cosplayer_name ? `<span class="product-modal-badge" style="background:rgba(41,182,246,0.18); border:1px solid rgba(41,182,246,0.4); color:var(--aqua); margin-bottom:0;">👤 ${escapeStoreHtml(p.cosplayer_name)}</span>` : ''}
       </div>`
    : `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:0.5rem;">
        <span class="product-modal-badge" style="background:var(--sea-blue); margin-bottom:0;">${escapeStoreHtml(category)}</span>
        ${productTag ? `<span class="product-modal-badge" style="background:rgba(2,132,199,0.25); border:1px solid #0284c7; color:#38bdf8; margin-bottom:0;">🏷️ ${escapeStoreHtml(productTag)}</span>` : ''}
        ${isOutOfStock 
          ? `<span class="product-modal-badge" style="background:rgba(239,68,68,0.25); border:1px solid #ef4444; color:#f87171; margin-bottom:0; font-weight:800;">⚠️ Stok Habis</span>` 
          : `<span class="product-modal-badge" style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#34d399; margin-bottom:0;">Tersedia: ${stock} unit</span>`}
      </div>`;

  const sizeOptionsHtml = sizes.length ? `
    <div style="margin-bottom:1.2rem;">
      <label style="display:block; color:var(--white); font-size:0.82rem; font-weight:700; margin-bottom:0.4rem;">Pilih Ukuran:</label>
      <select id="modalProductSize" data-pid="${safeIdAttr}" ${isOutOfStock ? 'disabled' : ''} onchange="handleModalSizeChange(this.dataset.pid, this.value)" style="width:100%; border-radius:8px; background:rgba(3,9,31,0.8); border:1px solid var(--card-border); color:var(--white); padding:0.75rem; font-family:var(--font-body); font-size:0.9rem; ${isOutOfStock ? 'opacity:0.5;cursor:not-allowed;' : ''}">
        <option value="">${isOutOfStock ? '-- Stok Habis --' : '-- Pilih Ukuran --'}</option>
        ${sizes.map(s => {
          const surcharge = getProductSizeSurcharge(p, s);
          const surchargeText = surcharge > 0 ? ` (+${formatPrice(surcharge)})` : '';
          return `<option value="${escapeStoreHtml(s)}">${escapeStoreHtml(s)}${surchargeText}</option>`;
        }).join('')}
      </select>
      ${productTag ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.4rem;">💡 Tag: <strong style="color:var(--aqua)">${escapeStoreHtml(productTag)}</strong> (Varian size tertentu memiliki penyesuaian harga khusus)</div>` : ''}
    </div>
  ` : '';

  const initialCounterLabel = getGalleryCounterLabel(0, galleryImages.length, isPhotopack);

  const galleryHtml = `
    <div class="product-modal-gallery">
      <div class="product-gallery-stage ${primaryImage ? '' : 'no-image'}" id="modalGalleryStage" ${primaryImage ? 'onclick="openProductLightbox()" title="Klik untuk memperbesar gambar"' : ''}>
        ${primaryImage ? `
          <span class="gallery-counter-pill" id="modalGalleryCounter" style="${initialCounterLabel ? '' : 'display:none;'}">${escapeStoreHtml(initialCounterLabel)}</span>
          <img id="modalMainProductImg" src="${escapeStoreHtml(primaryImage)}" alt="${safeName}" style="${isOutOfStock ? 'filter:grayscale(0.65) opacity(0.85);' : ''}" />
          ${galleryImages.length > 1 ? `
            <button type="button" class="gallery-nav-btn prev" onclick="event.stopPropagation(); stepProductModalGallery(-1)" aria-label="Foto sebelumnya">‹</button>
            <button type="button" class="gallery-nav-btn next" onclick="event.stopPropagation(); stepProductModalGallery(1)" aria-label="Foto berikutnya">›</button>
          ` : ''}
          <button type="button" class="gallery-zoom-hint-btn" onclick="event.stopPropagation(); openProductLightbox()" aria-label="Perbesar Gambar">
            🔍 Perbesar
          </button>
        ` : `<div style="font-size:4rem;">${isPhotopack ? '📸' : '🛍️'}</div>`}
      </div>
      ${galleryImages.length > 1 ? `
        <div class="product-gallery-thumbs" role="tablist" aria-label="Galeri Foto Produk">
          ${galleryImages.map((imgUrl, idx) => `
            <button type="button" class="product-gallery-thumb ${idx === 0 ? 'active' : ''}" onclick="setProductModalGalleryIndex(${idx})" title="${isPhotopack ? (idx === 0 ? 'Sampul Utama' : `Teaser #${idx}`) : `Foto ${idx + 1}`}">
              <img src="${escapeStoreHtml(imgUrl)}" alt="${safeName} - ${idx + 1}" loading="lazy" />
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${isPhotopack && primaryImage ? `
        <div class="photopack-teaser-note">
          ✨ ${galleryImages.length > 1 ? `Tersedia <strong>${galleryImages.length} foto preview/teaser</strong>. ` : ''}Klik gambar untuk <strong>Zoom layar penuh</strong>. File resolusi HD penuh dibuka otomatis via Google Drive setelah pembayaran diverifikasi.
        </div>
      ` : ''}
    </div>
  `;

  modalEl.innerHTML = `
    <div class="product-modal-card">
      <button class="product-modal-close" onclick="closeProductDetail()" aria-label="Tutup">✕</button>
      ${galleryHtml}
      <div class="product-modal-info" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          ${badgeHtml}
          <h2 class="product-modal-title">${safeName}</h2>
          <div class="product-modal-price" id="modalProductPrice">
            ${formatPrice(p.price)}
            ${p.oldPrice ? `<span class="product-modal-old-price">${formatPrice(p.oldPrice)}</span>` : ''}
          </div>
          <div class="product-modal-desc">
            <div style="font-weight:700; color:var(--white); margin-bottom:0.3rem;">Deskripsi:</div>
            ${escapeStoreHtml(p.description || 'Koleksi eksklusif dari Aika Sesilia Store.')}
          </div>
          ${sizeOptionsHtml}
        </div>
        <div style="display:flex; gap:0.8rem; flex-wrap:wrap; margin-top:1.5rem;">
          ${isPhotopack ? `
            <a href="checkout-photopack.html?id=${encodeURIComponent(p.id)}" class="btn-primary" style="flex:1; padding:0.9rem 1.2rem; font-size:0.95rem; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(135deg, #0284c7, #2563eb); text-decoration:none; box-shadow:0 4px 15px rgba(2,132,199,0.4);">
              ⚡ Beli Photopack Sekarang
            </a>
          ` : (isOutOfStock ? `
            <button class="btn-primary" disabled style="flex:1; padding:0.9rem 1.2rem; font-size:0.95rem; font-weight:700; border-radius:8px; opacity:0.5; cursor:not-allowed; background:#1e293b; border:1px solid #334155; color:#94a3b8;">
              ❌ Stok Habis
            </button>
          ` : `
            <button class="btn-primary" data-pid="${safeIdAttr}" style="flex:1; padding:0.9rem 1.2rem; font-size:0.95rem; font-weight:700; border-radius:8px;" onclick="addModalItemToCart(this.dataset.pid)">
              🛒 + Masukkan Keranjang
            </button>
          `)}
          <button class="btn-ghost" style="padding:0.9rem 1.2rem; font-size:0.95rem; border-radius:8px;" onclick="closeProductDetail()">
            Tutup
          </button>
        </div>
      </div>
    </div>
  `;

  const stageEl = document.getElementById('modalGalleryStage');
  if (stageEl && galleryImages.length > 1) {
    bindGallerySwipe(
      stageEl,
      () => stepProductModalGallery(1),
      () => stepProductModalGallery(-1)
    );
  }

  modalEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeProductDetail() {
  const modalEl = document.getElementById('productDetailModal');
  if (modalEl) {
    modalEl.classList.remove('active');
  }
  if (!isLightboxOpen()) {
    document.body.style.overflow = '';
  }
}

function addModalItemToCart(productId) {
  const p = cachedProductsMap[productId] || cachedProductsMap[String(productId)];
  if (!p) return;

  if (!p.is_photopack && (parseInt(p.stock, 10) || 0) <= 0) {
    showToast('⚠️ Maaf, stok produk ini sudah habis!');
    return;
  }

  const sizeSelect = document.getElementById('modalProductSize');
  const size = sizeSelect ? sizeSelect.value : null;

  if (sizeSelect && sizeSelect.options.length > 1 && !size) {
    showToast('⚠️ Silakan pilih ukuran terlebih dahulu!');
    return;
  }

  const gallery = getProductGalleryImages(p);

  Cart.add({
    id: p.id,
    name: p.name,
    price: p.price,
    img: gallery[0] || p.image || '',
    tag: getProductSizeTag(p),
    stock: parseInt(p.stock, 10) || 0,
    size: size,
    is_photopack: false
  });

  closeProductDetail();
}

window.openProductDetail = openProductDetail;
window.closeProductDetail = closeProductDetail;
window.addModalItemToCart = addModalItemToCart;
window.handleCardSizeChange = handleCardSizeChange;
window.handleModalSizeChange = handleModalSizeChange;
window.getProductSizeTag = getProductSizeTag;
window.getProductSizeSurcharge = getProductSizeSurcharge;
window.SIZE_SURCHARGE_RULES = SIZE_SURCHARGE_RULES;
window.getProductSizes = getProductSizes;

document.addEventListener('keydown', (e) => {
  if (isLightboxOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeImageLightbox();
      return;
    }
    if (e.key === 'ArrowLeft' && activeLightboxState.images.length > 1) {
      e.preventDefault();
      stepLightboxImage(-1);
      return;
    }
    if (e.key === 'ArrowRight' && activeLightboxState.images.length > 1) {
      e.preventDefault();
      stepLightboxImage(1);
      return;
    }
  }

  const detailModal = document.getElementById('productDetailModal');
  const isDetailOpen = Boolean(detailModal && detailModal.classList.contains('active'));
  if (!isDetailOpen) return;

  if (e.key === 'Escape') {
    closeProductDetail();
    return;
  }

  const activeTag = (document.activeElement?.tagName || '').toUpperCase();
  if (activeTag !== 'SELECT' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
    if (e.key === 'ArrowLeft' && activeModalGalleryState.images.length > 1) {
      stepProductModalGallery(-1);
    } else if (e.key === 'ArrowRight' && activeModalGalleryState.images.length > 1) {
      stepProductModalGallery(1);
    }
  }
});

// ── UNIFIED USER ACCOUNT NAVBAR (#userNav) ──
function isStoreUserTokenExpired(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64 + '='.repeat((4 - base64.length % 4) % 4)));
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch (_) {
    return false;
  }
}

let userDropdownClickBound = false;

function initUserNavbar() {
  const nav = document.getElementById('userNav');
  if (!nav) return;

  let session = null;
  try {
    const raw = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
    if (raw) session = JSON.parse(raw);
  } catch (_) {
    session = null;
  }

  if (session && session.token && isStoreUserTokenExpired(session.token)) {
    localStorage.removeItem('aika_session');
    sessionStorage.removeItem('aika_session');
    session = null;
  }

  if (session && session.loggedIn && session.email) {
    const rawName = String(session.username || 'Akun');
    const safeUsername = escapeStoreHtml(rawName);
    const safeEmail = escapeStoreHtml(session.email || '');
    const initials = escapeStoreHtml(
      (session.username || session.email || 'U')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || 'U'
    );

    const cacheKey = 'aika_avatar_' + session.email;
    const savedAvatar = sanitizeStoreImageUrl(localStorage.getItem(cacheKey) || '');

    fetch(`/api/avatar?email=${encodeURIComponent(session.email)}&t=${Date.now()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const liveAvatar = sanitizeStoreImageUrl(data?.avatar || '');
        if (liveAvatar) {
          try { localStorage.setItem(cacheKey, liveAvatar); } catch (_) { }
          document.querySelectorAll('.user-avatar').forEach(el => {
            el.innerHTML = `<img src="${escapeStoreHtml(liveAvatar)}" alt="${safeUsername}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
          });
        } else if (data && !data.avatar) {
          localStorage.removeItem(cacheKey);
        }
      })
      .catch(err => console.error('Error syncing nav avatar:', err));

    const avatarContent = savedAvatar
      ? `<img src="${escapeStoreHtml(savedAvatar)}" alt="${safeUsername}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : initials;

    nav.innerHTML = `
      <button type="button" class="user-btn-logged" id="userMenuBtn" onclick="toggleUserDropdown()" aria-label="Menu akun">
        <div class="user-avatar">${avatarContent}</div>
        <span class="user-nav-label">${safeUsername}</span>
        <span style="font-size:0.65rem;opacity:0.6">▼</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-header">
          <div class="user-avatar" style="width:40px;height:40px;margin-bottom:8px;font-size:1rem;">${avatarContent}</div>
          <div class="user-dropdown-name">${safeUsername}</div>
          <div class="user-dropdown-email">${safeEmail}</div>
        </div>
        <a href="profile.html" class="dropdown-item">👤 Profil &amp; Pesanan</a>
        <a href="profile.html?tab=address" class="dropdown-item">📍 Buku Alamat</a>
        <a href="profile.html?tab=wishlist" class="dropdown-item">❤️ Favorit Saya</a>
        <a href="shop.html" class="dropdown-item">🛍️ Belanja</a>
        <button type="button" class="dropdown-item logout" onclick="doLogout()">🚪 Keluar</button>
      </div>
    `;
  } else {
    const currentFile = (window.location.pathname.split('/').pop() || 'index.html') + (window.location.search || '');
    const loginHref = currentFile && currentFile !== 'index.html'
      ? `login.html?redirect=${encodeURIComponent(currentFile)}`
      : 'login.html';
    nav.innerHTML = `
      <a href="${loginHref}" class="user-btn-guest" id="loginNavBtn">
        👤 Masuk
      </a>
    `;
  }

  window.toggleUserDropdown = function () {
    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.toggle('open');
  };

  window.doLogout = function () {
    localStorage.removeItem('aika_session');
    sessionStorage.removeItem('aika_session');
    window.location.reload();
  };

  if (!userDropdownClickBound) {
    userDropdownClickBound = true;
    document.addEventListener('click', function (e) {
      const btn = document.getElementById('userMenuBtn');
      const dd = document.getElementById('userDropdown');
      if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('open');
      }
    });
  }
}

window.initUserNavbar = initUserNavbar;

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
  if (search) products = products.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()));
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

    grid.innerHTML = reviews.map((r, i) => {
      const ratingNum = Math.min(5, Math.max(1, parseInt(r.rating, 10) || 5));
      const rawComment = typeof r.comment === 'string' ? r.comment.trim() : '';
      const fallbackComment = ratingNum >= 4
        ? 'Puas berbelanja di Aika Sesilia Merch!'
        : `Memberikan penilaian bintang ${ratingNum}.`;
      const safeComment = escapeStoreHtml(rawComment || fallbackComment);
      const safeCustomer = escapeStoreHtml(r.customer_name || 'Pelanggan');
      const safeAvatar = sanitizeStoreImageUrl(r.avatar || '');
      const initial = escapeStoreHtml((r.customer_name || 'P').charAt(0).toUpperCase());
      const commentHtml = rawComment
        ? `<q style="color:var(--text-main); font-style:italic; display:block; margin-bottom:1.5rem; font-size:1.05rem; line-height: 1.6;">${safeComment}</q>`
        : `<p style="color:var(--text-muted); font-style:italic; display:block; margin-bottom:1.5rem; font-size:0.98rem; line-height: 1.6;">${safeComment}</p>`;
      return `
      <div class="product-card fade-in" style="padding:2rem; text-align:left; background: linear-gradient(145deg, rgba(10,56,114,0.6), rgba(3,9,31,0.8)); position:relative; box-shadow: var(--shadow-blue); transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); animation-delay: ${i * 0.1}s;">
        <div style="position:absolute; top:1rem; right:1.5rem; font-size:3rem; color:var(--aqua); opacity:0.1; font-family:var(--font-display)">"</div>
        <div style="color:var(--gold); margin-bottom:1rem; font-size:1.2rem; filter: drop-shadow(0 0 5px rgba(255,213,79,0.5));">
          ${'⭐'.repeat(ratingNum)}
        </div>
        ${commentHtml}
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--card-border); padding-top:1rem;">
          <div style="display:flex; align-items:center; gap:0.8rem;">
            <div data-nosnippet style="width:35px; height:35px; border-radius:50%; background:var(--aqua); color:var(--deep-ocean); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1rem; font-family:var(--font-display); overflow:hidden;">
              ${safeAvatar ? `<img src="${escapeStoreHtml(safeAvatar)}" alt="" role="presentation" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : initial}
            </div>
            <div style="font-weight:700; color:var(--white); font-size:0.95rem;">${safeCustomer}</div>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted)">${new Date(r.date || Date.now()).toLocaleDateString('id-ID')}</div>
        </div>
      </div>
    `;
    }).join('');
    initFadeIn();
  } catch (e) {
    grid.innerHTML = '<p style="text-align:center; color:#ef4444; grid-column:1/-1">Gagal memuat ulasan.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initUserNavbar();
  initFadeIn();
  loadReviews();
  syncWishlistWithServer();
  initMobileBottomNav();
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

    form.addEventListener('submit', function (e) {
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
        .then(function () {
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

// ── MOBILE BOTTOM NAVIGATION ──
function initMobileBottomNav() {
  const bnav = document.getElementById('mobileBottomNav');
  if (!bnav) return;

  // Sync cart badge if cart loaded
  if (window.Cart && typeof window.Cart.count === 'function') {
    const totalCount = window.Cart.count();
    const bnavCountEl = document.getElementById('mobileBottomCartCount');
    if (bnavCountEl) {
      bnavCountEl.textContent = totalCount;
      bnavCountEl.style.display = totalCount > 0 ? 'flex' : 'none';
    }
  }

  // Adjust account & wishlist links if guest
  const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
  let isLoggedIn = false;
  try {
    const sess = userStr ? JSON.parse(userStr) : null;
    isLoggedIn = !!(sess && sess.loggedIn);
  } catch (e) {}

  const accBtn = document.getElementById('bnav-account');
  if (accBtn && !isLoggedIn) {
    accBtn.href = 'login.html?redirect=profile.html';
  }

  const wishBtn = document.getElementById('bnav-wishlist');
  if (wishBtn && !isLoggedIn) {
    wishBtn.href = 'login.html?redirect=profile.html%3Ftab%3Dwishlist';
  }
}
