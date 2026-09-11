# Aika Sesilia Merch Store

Official Merchandise & Digital Photopack Store untuk Aika Sesilia.

## Peta Struktur Repository

```text
Merch-Aika/
├── index.html                 # Homepage
├── shop.html                  # Katalog produk merchandise & photopack
├── checkout.html              # Checkout merchandise fisik + upload bukti bayar
├── checkout-photopack.html    # Checkout khusus photopack digital
├── order-success.html         # Halaman sukses pesanan & invoice resmi
├── login.html                 # Login user / admin
├── register.html              # Registrasi user
├── profile.html               # Profil user, riwayat pesanan & akses GDrive
├── admin/
│   ├── login.html             # Login admin
│   └── dashboard.html         # Dashboard admin (kelola produk, pesanan, sales)
├── api/
│   ├── [route].js             # Router API Vercel Serverless
│   └── _lib/                  # Semua controller API, auth, dan helper backend
├── css/
│   └── style.css              # Stylesheet utama (Ocean Blue Theme)
├── js/
│   ├── main.js                # Helper frontend umum & order API
│   └── cart.js                # State management keranjang belanja
├── images/                    # Aset gambar statis
├── db/
│   └── schema.sql             # Skema PostgreSQL (Neon)
├── docs/
│   ├── README.md
│   └── VERCEL_DEPLOYMENT_GUIDE.md
├── scripts/
│   ├── tests/                 # 📂 Unit & Integration Tests
│   │   ├── run-all-tests.js   # Master runner untuk npm test
│   │   ├── test-daily-invoice.js
│   │   ├── test-size-tags.js
│   │   ├── test-user-security.js
│   │   ├── test-stock-flow.js
│   │   ├── test-security-fixes.js
│   │   └── test-order-export.js
│   ├── tools/                 # 📂 Utility & Inspection Tools
│   │   ├── check-orders.js
│   │   └── check-sample.js
│   ├── migrations/            # 📂 Skrip Migrasi Database & Aset
│   │   ├── migrate-order-invoice-ids.js
│   │   ├── migrate-base64-assets-to-r2.js
│   │   ├── migrate-payment-proofs-to-r2.js
│   │   ├── migrate-product-images-to-r2.js
│   │   └── migrate-product-tags.js
│   ├── db-push.js             # Push schema ke Neon Database
│   └── db-sync.js             # Sinkronisasi database
├── package.json
└── .env.example
```

## Lokasi Berkas Penting

- **Halaman User:** File HTML di root (`index.html`, `shop.html`, `checkout.html`, dsb.)
- **Halaman Admin:** Folder `admin/`
- **Endpoint Backend:** `api/_lib/`
- **Query Database & Schema:** `api/_lib/` dan `db/schema.sql`
- **Penyimpanan Gambar R2:** `api/_lib/r2-storage.js`
- **Unit & Integration Tests:** `scripts/tests/`
- **Script Migrasi:** `scripts/migrations/`
- **Panduan Deploy:** `docs/VERCEL_DEPLOYMENT_GUIDE.md`

## Perintah Penting (NPM Scripts)

```bash
# Menjalankan development server lokal
npm run dev

# Menjalankan test suite otomatis
npm test

# Push / update skema database
npm run db:push

# Migrasi data & nomor invoice
npm run migrate:order-invoices
npm run migrate:product-images:r2
npm run migrate:payment-proofs:r2
npm run migrate:base64-assets:r2
```

## Catatan Arsitektur

- `.env.local` dan `node_modules/` berada di root sesuai standar Node.js.
- File HTML utama tetap berada di root agar seluruh link dan routing live di Vercel (`www.merch-aika.my.id`) tetap aman 100%.
