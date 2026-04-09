// ── CART MANAGEMENT ──
const Cart = {
  items: JSON.parse(localStorage.getItem('aika_cart') || '[]'),

  save() {
    localStorage.setItem('aika_cart', JSON.stringify(this.items));
    this.updateUI();
  },

  add(product) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.save();
    showToast(`✓ ${product.name} ditambahkan ke keranjang!`);
  },

  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
  },

  updateQty(id, delta) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.qty += delta;
      if (item.qty <= 0) this.remove(id);
      else this.save();
    }
  },

  total() {
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  count() {
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  },

  updateUI() {
    // Update cart count badge
    const countEl = document.getElementById('cartCount');
    if (countEl) countEl.textContent = this.count();

    // Update cart items list
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    if (this.items.length === 0) {
      itemsEl.innerHTML = '<div class="cart-empty">🛒<br>Keranjangmu kosong</div>';
    } else {
      itemsEl.innerHTML = this.items.map(item => `
        <div class="cart-item">
          <div class="cart-item-img">${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.parentElement.textContent='🛍️'">` : '🛍️'}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${formatPrice(item.price)}</div>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', -1)">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', 1)">+</button>
          </div>
        </div>
      `).join('');
    }

    // Update total
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = formatPrice(this.total());
  },

  clear() {
    this.items = [];
    this.save();
  }
};

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => Cart.updateUI());

function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
}

function formatPrice(num) {
  return 'Rp ' + num.toLocaleString('id-ID');
}

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
