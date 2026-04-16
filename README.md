# 🌊 Aika Sesilia — Merch Store
## Panduan Setup & Integrasi Midtrans

---

## 📁 Struktur Folder

```
aika-sesilia/
├── index.html          → Halaman utama (homepage)
├── shop.html           → Halaman toko semua produk
├── checkout.html       → Halaman checkout & form pengiriman
├── order-success.html  → Halaman sukses setelah pembayaran
├── css/
│   └── style.css       → Stylesheet utama (tema biru laut)
├── js/
│   ├── cart.js         → Manajemen keranjang belanja
│   └── main.js         → Logic produk & data
├── admin/
│   ├── login.html      → Login admin
│   └── dashboard.html  → Dashboard admin lengkap
├── images/             → Folder untuk gambar
└── README.md           → File ini
```

---

## 🚀 Cara Menjalankan

### Lokal (tanpa server)
1. Buka file `index.html` di browser Chrome/Firefox/Edge
2. Website siap digunakan!

### Dengan Server (Recommended)
```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```
Buka: http://localhost:8000

---

## 🔐 Login Admin
- URL: `admin/login.html`
- Username: **aika**
- Password: **admin123**

> ⚠️ Ganti kredensial sebelum deploy ke production!

---

## 💳 Integrasi Midtrans Payment Gateway

### Langkah 1: Daftar Midtrans
1. Daftar di https://dashboard.midtrans.com
2. Pilih **Sandbox** untuk testing
3. Dapatkan **Server Key** dan **Client Key**

### Langkah 2: Konfigurasi Frontend
Buka `checkout.html`, ubah baris:
```html
<script src="https://app.sandbox.midtrans.com/snap/snap.js" 
        data-client-key="YOUR_MIDTRANS_CLIENT_KEY">
```
Ganti `YOUR_MIDTRANS_CLIENT_KEY` dengan Client Key dari dashboard Midtrans.

### Langkah 3: Backend (WAJIB untuk production)
Midtrans membutuhkan backend untuk membuat transaksi. Buat endpoint API:

#### Node.js / Express
```javascript
const midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
  isProduction: false, // true untuk production
  serverKey: 'YOUR_SERVER_KEY',
  clientKey: 'YOUR_CLIENT_KEY'
});

app.post('/api/create-transaction', async (req, res) => {
  const { order_id, gross_amount, customer } = req.body;
  
  const parameter = {
    transaction_details: {
      order_id,
      gross_amount
    },
    customer_details: {
      first_name: customer.name,
      email: customer.email,
      phone: customer.phone
    }
  };
  
  try {
    const transaction = await snap.createTransaction(parameter);
    res.json({ token: transaction.token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### PHP
```php
<?php
require 'vendor/autoload.php';

\Midtrans\Config::$serverKey = 'YOUR_SERVER_KEY';
\Midtrans\Config::$isProduction = false;
\Midtrans\Config::$isSanitized = true;
\Midtrans\Config::$is3ds = true;

$params = [
    'transaction_details' => [
        'order_id' => $_POST['order_id'],
        'gross_amount' => $_POST['gross_amount'],
    ],
    'customer_details' => [
        'first_name' => $_POST['name'],
        'email' => $_POST['email'],
        'phone' => $_POST['phone'],
    ],
];

$snapToken = \Midtrans\Snap::getSnapToken($params);
echo json_encode(['token' => $snapToken]);
```

### Langkah 4: Aktifkan di Frontend
Buka `checkout.html`, hapus komentar pada bagian production:
```javascript
// PRODUCTION: Hapus komentar di bawah ini
fetch('/api/create-transaction', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    order_id: order.id,
    gross_amount: grand,
    customer: { name: customerName, email, phone }
  })
})
.then(r => r.json())
.then(({ token }) => {
  snap.pay(token, {
    onSuccess(result) { handlePaymentSuccess(order, result); },
    onPending(result) { handlePaymentPending(order, result); },
    onError(result) { showToast('❌ Pembayaran gagal. Silakan coba lagi.'); },
    onClose() { showToast('⚠ Pembayaran dibatalkan.'); }
  });
});
```

---

## 🛠 Fitur Lengkap

### 🛍️ User Features
- ✅ Homepage dengan hero section animasi
- ✅ Halaman shop dengan filter kategori & pencarian
- ✅ Keranjang belanja (sidebar slide)
- ✅ Checkout dengan form pengiriman lengkap
- ✅ Pilihan kurir (JNE, J&T, SiCepat, GoSend)
- ✅ Integrasi Midtrans Snap payment
- ✅ Halaman sukses pesanan

### 👩‍💼 Admin Features
- ✅ Login aman dengan session
- ✅ Dashboard statistik (revenue, pesanan, produk)
- ✅ Upload foto produk (base64, tanpa server)
- ✅ CRUD produk lengkap (tambah/edit/hapus)
- ✅ Manajemen pesanan & update status
- ✅ Konfigurasi Midtrans dari dashboard
- ✅ Pengaturan info toko

### 🎨 Design Features
- ✅ Tema Ocean Blue yang elegan
- ✅ Font Cinzel Decorative + Nunito + Cormorant
- ✅ Animasi bubble, floating badges, shimmer loading
- ✅ Fully responsive (mobile friendly)
- ✅ Dark mode natively

---

## 📊 Metode Pembayaran yang Didukung Midtrans
- 💳 Kartu Kredit/Debit (Visa, Mastercard)
- 💚 GoPay
- 💜 OVO
- 🔵 DANA
- 🏦 Virtual Account (BCA, BNI, BRI, Mandiri, Permata)
- 🏪 Minimarket (Indomaret, Alfamart)
- 💰 QRIS

---

## ⚠️ Catatan Penting
1. **Ganti kredensial admin** sebelum deploy
2. **Gunakan HTTPS** untuk production (required by Midtrans)
3. **Backend diperlukan** untuk keamanan (server key tidak boleh di frontend)
4. Data produk & pesanan disimpan di **localStorage** (demo) — gunakan database real untuk production
5. Untuk hosting: Vercel, Netlify (frontend) + Railway/Render (backend)

---

Made with 💙 for Aika Sesilia
## Update: Upload Foto Produk Admin ke Cloudflare R2

Flow upload produk admin sekarang menggunakan file upload ke Cloudflare R2, lalu URL publik hasil upload disimpan ke field `products.image`.

### Environment Variables

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

### Endpoint Upload

- `POST /api/admin-upload-product-image`
- Header auth: `Authorization: Bearer <adminToken>`
- Body: `multipart/form-data`
- File field: `image`

### Migrasi Foto Produk Lama

```bash
npm run migrate:product-images:r2
```
