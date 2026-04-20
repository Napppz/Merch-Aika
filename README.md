# Aika Sesilia Merch

Repo ini sekarang dirapikan supaya file penting lebih cepat ditemukan.

## Peta Repo

```text
Merch-Aika/
|- index.html                 # Homepage
|- shop.html                  # Katalog produk
|- checkout.html              # Checkout + upload bukti pembayaran
|- order-success.html         # Halaman sukses pesanan
|- login.html                 # Login user/admin
|- register.html              # Registrasi user
|- profile.html               # Profil user + riwayat pesanan
|- admin/
|  |- login.html              # Login admin
|  `- dashboard.html          # Dashboard admin
|- api/
|  |- [route].js              # Router API
|  `- _lib/                   # Semua handler API dan helper backend
|- css/
|  `- style.css               # Stylesheet utama
|- js/
|  |- main.js                 # Helper frontend umum
|  `- cart.js                 # Keranjang
|- images/                    # Aset gambar statis
|- db/
|  `- schema.sql              # Skema database
|- scripts/
|  |- db-push.js              # Push schema ke database
|  `- migrations/             # Script migrasi data/aset
|- docs/
|  `- VERCEL_DEPLOYMENT_GUIDE.md
|- package.json
`- .env.example
```

## Tempat Cari Sesuatu

- Halaman user: file HTML di root
- Halaman admin: folder `admin/`
- Endpoint backend: `api/_lib/`
- Query database dan schema: `api/_lib/` dan `db/schema.sql`
- Upload gambar / R2: `api/_lib/r2-storage.js`
- Script migrasi: `scripts/migrations/`
- Panduan deploy: `docs/VERCEL_DEPLOYMENT_GUIDE.md`

## Script Penting

```bash
npm run db:push
npm run migrate:product-images:r2
npm run migrate:payment-proofs:r2
npm run migrate:base64-assets:r2
```

## Catatan

- `.env.local` dan `node_modules/` tetap di root karena itu standar Node project.
- Saya tidak memindahkan file halaman utama supaya path website tetap aman.
- Dokumen dan script migrasi yang tadinya bercampur di root sekarang sudah dikelompokkan.
