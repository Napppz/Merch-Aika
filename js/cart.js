// -- CART MANAGEMENT --
const CART_SIZE_SURCHARGE_RULES = {
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
  const rules = (window.SIZE_SURCHARGE_RULES || CART_SIZE_SURCHARGE_RULES)[tag];
  if (!rules) return 0;
  const key = String(sizeToCheck).trim().toUpperCase();
  return rules[key] || 0;
}

window.getItemSizeTag = getItemSizeTag;
window.getItemSizeSurcharge = getItemSizeSurcharge;

const Cart = {
  items: [],
  isSaving: false,

  getUserEmail() {
    const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
    return userStr ? JSON.parse(userStr).email : null;
  },

  makeItemKey(product) {
    return `${product.id}::${product.size || ''}`;
  },

  async load() {
    const email = this.getUserEmail();

    if (email) {
      // Sync guest cart to database if exists
      const guestCart = JSON.parse(localStorage.getItem('aika_cart_guest') || '[]');
      if (guestCart.length > 0) {
        for (const item of guestCart) {
          try {
            await fetch('/api/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-user-email': email },
              body: JSON.stringify({ product_id: item.id, quantity: item.qty, size: item.size || null })
            });
          } catch (e) { }
        }
        localStorage.removeItem('aika_cart_guest');
      }

      // User is logged in, fetch from API
      try {
        const res = await fetch('/api/cart', {
          headers: { 'x-user-email': email }
        });
        if (res.ok) {
          const data = await res.json();
          // Map DB columns to our UI expected schema
          this.items = data.map(i => ({
            cart_id: i.cart_id,
            id: i.id,
            name: i.name,
            price: i.price,
            image: i.image,
            tag: i.tag || getItemSizeTag(i),
            stock: parseInt(i.stock, 10) || 0,
            is_photopack: i.is_photopack === true,
            availableSizes: String(i.sizes || '').split(',').map(size => size.trim()).filter(Boolean),
            size: i.size || '',
            qty: i.qty
          }));
        } else {
          this.items = [];
        }
      } catch (e) {
        console.error('Failed to fetch cart:', e);
      }
    } else {
      // Guest user uses localStorage
      this.items = JSON.parse(localStorage.getItem('aika_cart_guest') || '[]').map(i => ({
        ...i,
        stock: parseInt(i.stock, 10) || 0,
        is_photopack: i.is_photopack === true,
        tag: i.tag || getItemSizeTag(i)
      }));
    }

    this.updateUI();
  },

  save() {
    const email = this.getUserEmail();
    if (!email) {
      localStorage.setItem('aika_cart_guest', JSON.stringify(this.items));
    }
    this.updateUI();
  },

  async add(product) {
    if (this.isSaving) return;
    const isPhotopack = product.is_photopack === true;
    const stock = parseInt(product.stock, 10) || 0;

    if (!isPhotopack && product.stock !== undefined && stock <= 0) {
      showToast('⚠️ Maaf, stok produk ini sudah habis!');
      return;
    }

    const email = this.getUserEmail();
    const itemKey = this.makeItemKey(product);
    const existing = this.items.find(i => this.makeItemKey(i) === itemKey);
    const tag = product.tag || getItemSizeTag(product);

    // Cek batas stok saat menambah
    if (existing && !isPhotopack && product.stock !== undefined && (existing.qty + 1 > stock)) {
      showToast(`⚠️ Jumlah melebihi stok yang tersedia (${stock} unit)!`);
      return;
    }

    // Optimistic UI update
    if (existing) {
      existing.qty += 1;
      if (!existing.tag && tag) existing.tag = tag;
      if (product.stock !== undefined) existing.stock = stock;
    } else {
      this.items.push({ ...product, tag, stock, is_photopack: isPhotopack, qty: 1 });
    }
    this.updateUI();
    showToast(`✅ ${product.name} ditambahkan ke keranjang!`);

    if (email) {
      this.isSaving = true;
      try {
        const res = await fetch('/api/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': email
          },
          body: JSON.stringify({ product_id: product.id, quantity: 1, size: product.size || null })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast(`❌ ${errData.error || 'Gagal menambahkan ke keranjang'}`);
          await this.load();
        }
      } catch (err) {
        console.error('Error adding to cart API', err);
      } finally {
        this.isSaving = false;
      }
    } else {
      this.save();
    }
  },

  addFromBtn(btn) {
    const isPhotopack = btn.getAttribute('data-is-photopack') === 'true';
    const stock = parseInt(btn.getAttribute('data-stock') || '0', 10);

    if (!isPhotopack && btn.hasAttribute('data-stock') && stock <= 0) {
      showToast('⚠️ Maaf, stok produk ini sudah habis!');
      return;
    }

    const sizeSelectId = btn.getAttribute('data-size-select');
    const sizeSelect = sizeSelectId ? document.getElementById(sizeSelectId) : null;
    const selectedSize = sizeSelect ? sizeSelect.value.trim() : '';

    if (sizeSelect && !selectedSize) {
      showToast('Pilih ukuran terlebih dahulu');
      sizeSelect.focus();
      return;
    }

    this.add({
      id: btn.getAttribute('data-id'),
      name: btn.getAttribute('data-name'),
      price: parseInt(btn.getAttribute('data-price') || '0', 10),
      image: btn.getAttribute('data-img') || '',
      tag: btn.getAttribute('data-tag') || '',
      stock: stock,
      is_photopack: isPhotopack,
      size: selectedSize
    });
  },

  async remove(id, size = '') {
    if (this.isSaving) return;
    const email = this.getUserEmail();

    // Optimistic UI update
    this.items = this.items.filter(i => !(i.id == id && (i.size || '') === (size || '')));
    this.updateUI();

    if (email) {
      this.isSaving = true;
      try {
        await fetch(`/api/cart?product_id=${encodeURIComponent(id)}&size=${encodeURIComponent(size || '')}`, {
          method: 'DELETE',
          headers: { 'x-user-email': email }
        });
      } catch (err) {
        console.error('Error removing from cart API', err);
      } finally {
        this.isSaving = false;
      }
    } else {
      this.save();
    }
  },

  async updateQty(id, size, delta) {
    if (this.isSaving) return;
    const email = this.getUserEmail();

    const item = this.items.find(i => i.id == id && (i.size || '') === (size || ''));
    if (!item) return;

    if (delta > 0 && !item.is_photopack && item.stock !== undefined && (item.qty + delta > item.stock)) {
      showToast(`⚠️ Stok produk "${item.name}" hanya tersedia ${item.stock} unit!`);
      return;
    }

    // Optimistic UI update
    item.qty += delta;
    if (item.qty <= 0) {
      return this.remove(id, size);
    }

    this.updateUI();

    if (email) {
      this.isSaving = true;
      try {
        const res = await fetch('/api/cart', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': email
          },
          body: JSON.stringify({ product_id: item.id, quantity: item.qty, size: item.size || null })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast(`❌ ${errData.error || 'Gagal mengubah jumlah'}`);
          await this.load();
        }
      } catch (err) {
        console.error('Error updating cart API', err);
      } finally {
        this.isSaving = false;
      }
    } else {
      this.save();
    }
  },

  async changeSize(id, oldSize, newSize) {
    if (this.isSaving) return;
    const email = this.getUserEmail();
    const normalizedOldSize = oldSize || '';
    const normalizedNewSize = (newSize || '').trim();
    const item = this.items.find(i => i.id == id && (i.size || '') === normalizedOldSize);

    if (!item || normalizedOldSize === normalizedNewSize) return;

    const existingTarget = this.items.find(i => i.id == id && (i.size || '') === normalizedNewSize);
    if (existingTarget) {
      existingTarget.qty += item.qty;
      this.items = this.items.filter(i => !(i.id == id && (i.size || '') === normalizedOldSize));
    } else {
      item.size = normalizedNewSize;
    }

    this.updateUI();

    if (email) {
      this.isSaving = true;
      try {
        await fetch('/api/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': email
          },
          body: JSON.stringify({ product_id: id, quantity: item.qty, size: normalizedNewSize || null })
        });

        await fetch(`/api/cart?product_id=${encodeURIComponent(id)}&size=${encodeURIComponent(normalizedOldSize)}`, {
          method: 'DELETE',
          headers: { 'x-user-email': email }
        });
      } catch (err) {
        console.error('Error changing cart size', err);
      } finally {
        this.isSaving = false;
      }
    } else {
      this.save();
    }
  },

  subtotal() {
    return this.items.reduce((sum, i) => sum + (parseInt(i.price, 10) || 0) * (parseInt(i.qty, 10) || 0), 0);
  },

  sizeSurchargeTotal() {
    return this.items.reduce((sum, i) => sum + (getItemSizeSurcharge(i) * (parseInt(i.qty, 10) || 0)), 0);
  },

  total() {
    return this.subtotal() + this.sizeSurchargeTotal();
  },

  count() {
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  },

  updateUI() {
    const totalCount = this.count();
    const countEl = document.getElementById('cartCount');
    if (countEl) countEl.textContent = totalCount;

    const bnavCountEl = document.getElementById('mobileBottomCartCount');
    if (bnavCountEl) {
      bnavCountEl.textContent = totalCount;
      bnavCountEl.style.display = totalCount > 0 ? 'flex' : 'none';
    }

    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    if (this.items.length === 0) {
      itemsEl.innerHTML = '<div class="cart-empty">🛒<br>Keranjangmu kosong</div>';
    } else {
      itemsEl.innerHTML = this.items.map(item => {
        const surcharge = getItemSizeSurcharge(item);
        const unitPrice = (parseInt(item.price, 10) || 0) + surcharge;
        const sizeLabel = item.size ? `Ukuran: ${item.size}${surcharge > 0 ? ` <span style="color:var(--aqua);font-weight:700;">(+${formatPrice(surcharge)})</span>` : ''}` : '';
        const isOutOfStock = !item.is_photopack && item.stock !== undefined && item.stock <= 0;
        const isExceedingStock = !item.is_photopack && item.stock !== undefined && item.stock > 0 && item.qty > item.stock;

        return `
          <div class="cart-item" style="${isOutOfStock ? 'border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.08);' : ''}">
            <div class="cart-item-img">${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;${isOutOfStock ? 'filter:grayscale(0.7);' : ''}" onerror="this.parentElement.textContent='🛍️'">` : '🛍️'}</div>
            <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              ${sizeLabel ? `<div class="cart-item-size" style="color:var(--text-muted);font-size:0.78rem;margin-top:0.15rem">${sizeLabel}</div>` : ''}
              ${isOutOfStock ? `<div style="color:#f87171;font-size:0.75rem;font-weight:800;margin-top:0.2rem;">⚠️ Stok Habis (Mohon Hapus)</div>` : ''}
              ${isExceedingStock ? `<div style="color:#f59e0b;font-size:0.75rem;font-weight:700;margin-top:0.2rem;">⚠️ Melebihi stok (Tersedia ${item.stock})</div>` : ''}
              <div class="cart-item-price">${formatPrice(unitPrice)}</div>
            </div>
            <div class="cart-item-qty">
              <button class="qty-btn" onclick="Cart.updateQty('${item.id}', '${(item.size || '').replace(/'/g, "\\'")}', -1)">-</button>
              <span>${item.qty}</span>
              <button class="qty-btn" ${isOutOfStock || (!item.is_photopack && item.stock !== undefined && item.qty >= item.stock) ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} onclick="Cart.updateQty('${item.id}', '${(item.size || '').replace(/'/g, "\\'")}', 1)">+</button>
            </div>
          </div>
        `;
      }).join('');
    }

    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = formatPrice(this.total());
  },

  async clear() {
    const email = this.getUserEmail();
    this.items = [];
    this.updateUI();

    if (email) {
      try {
        await fetch('/api/cart', {
          method: 'DELETE',
          headers: { 'x-user-email': email }
        });
      } catch (err) {
        console.error('Error clearing cart API', err);
      }
    } else {
      localStorage.removeItem('aika_cart_guest');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => { Cart.load(); });

function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
}

function goToCheckout() {
  if (Cart.items.length === 0) {
    showToast('⚠️ Keranjang masih kosong!');
    return;
  }

  const outOfStock = Cart.items.find(i => !i.is_photopack && i.stock !== undefined && i.stock <= 0);
  if (outOfStock) {
    showToast(`⚠️ Produk "${outOfStock.name}" sudah habis. Mohon hapus dari keranjang sebelum checkout!`);
    return;
  }

  const exceeding = Cart.items.find(i => !i.is_photopack && i.stock !== undefined && i.stock > 0 && i.qty > i.stock);
  if (exceeding) {
    showToast(`⚠️ Jumlah "${exceeding.name}" melebihi stok yang tersedia (tersisa ${exceeding.stock}). Mohon sesuaikan jumlahnya!`);
    return;
  }

  const hasPhotopackOnly = Cart.items.length > 0 && Cart.items.every(i => i.is_photopack || i.category === 'Photopack');
  const targetPage = (hasPhotopackOnly && Cart.items.length === 1)
    ? `checkout-photopack.html?id=${Cart.items[0].id}`
    : 'checkout.html';

  const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
  if (!userStr) {
    showToast('⚠️ Anda harus login untuk checkout!');
    setTimeout(() => {
      window.location.href = `login.html?redirect=${encodeURIComponent(targetPage)}`;
    }, 1500);
    return;
  }

  if (hasPhotopackOnly && Cart.items.length === 1) {
    localStorage.setItem('aika_checkout_photopack', JSON.stringify(Cart.items[0]));
    window.location.href = `checkout-photopack.html?id=${Cart.items[0].id}`;
    return;
  }

  window.location.href = 'checkout.html';
}

function formatPrice(num) { return 'Rp ' + (num || 0).toLocaleString('id-ID'); }

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
