// -- CART MANAGEMENT --
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
          } catch(e) {}
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
      this.items = JSON.parse(localStorage.getItem('aika_cart_guest') || '[]');
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
    const email = this.getUserEmail();
    
    const itemKey = this.makeItemKey(product);
    const existing = this.items.find(i => this.makeItemKey(i) === itemKey);
    
    // Optimistic UI update
    if (existing) {
      existing.qty += 1;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.updateUI();
    showToast(`✅ ${product.name} ditambahkan ke keranjang!`);

    if (email) {
      this.isSaving = true;
      try {
        await fetch('/api/cart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': email
          },
          body: JSON.stringify({ product_id: product.id, quantity: 1, size: product.size || null })
        });
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

    // Optimistic UI update
    item.qty += delta;
    if (item.qty <= 0) {
      return this.remove(id, size);
    }
    
    this.updateUI();

    if (email) {
      this.isSaving = true;
      try {
        await fetch('/api/cart', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': email
          },
          body: JSON.stringify({ product_id: item.id, quantity: item.qty, size: item.size || null })
        });
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

  total() {
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  count() {
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  },

  updateUI() {
    const countEl = document.getElementById('cartCount');
    if (countEl) countEl.textContent = this.count();

    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    if (this.items.length === 0) {
      itemsEl.innerHTML = '<div class="cart-empty">??<br>Keranjangmu kosong</div>';
    } else {
      itemsEl.innerHTML = this.items.map(item => `
        <div class="cart-item">
          <div class="cart-item-img">${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.textContent='???'">` : '???'}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            ${item.size ? `<div class="cart-item-size" style="color:var(--text-muted);font-size:0.78rem;margin-top:0.15rem">Ukuran: ${item.size}</div>` : ''}
            <div class="cart-item-price">${formatPrice(item.price)}</div>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', '${(item.size || '').replace(/'/g, "\\'")}', -1)">-</button>
            <span>${item.qty}</span>
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', '${(item.size || '').replace(/'/g, "\\'")}', 1)">+</button>
          </div>
        </div>
      `).join('');
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
  const userStr = localStorage.getItem('aika_session') || sessionStorage.getItem('aika_session');
  if (!userStr) {
    showToast('⚠️ Anda harus login untuk checkout!');
    setTimeout(() => { window.location.href = 'login.html?redirect=checkout.html'; }, 1500);
    return;
  }
  if (Cart.items.length === 0) {
    showToast('⚠️ Keranjang masih kosong!');
    return;
  }
  window.location.href = 'checkout.html';
}

function formatPrice(num) { return 'Rp ' + num.toLocaleString('id-ID'); }

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
