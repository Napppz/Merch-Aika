# 📋 PANDUAN UPDATE VERCEL ENVIRONMENT VARIABLES

## Masalah:
- ADMIN_PASSWORD_HASH di Vercel masih hash LAMA: `000f49c6d3cfa...`
- Seharusnya hash BARU: `06b8c8fb287762975a3ed80fe1d9f5ae2da50027c8c004d5ef895757b58978e4`

## Solusi - Update Environment di Vercel:

### LANGKAH 1: Login ke Vercel Dashboard
Buka: https://vercel.com/dashboard
Pilih project: **Merch-Aika** atau **aika-sesilia**

### LANGKAH 2: Ke Settings → Environment Variables
Klik: **Settings** → **Environment Variables**

### LANGKAH 3: Update/Tambahkan Variabel Berikut:

| Variabel | Value | Action |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require` | ✏️ Update jika sudah ada, atau ➕ Tambah jika belum |
| `PASSWORD_SALT` | `aika_sesilia_salt_2024_secure` | ✏️ Update / ➕ Tambah |
| `ADMIN_PASSWORD_HASH` | `06b8c8fb287762975a3ed80fe1d9f5ae2da50027c8c004d5ef895757b58978e4` | ⚠️ **WAJIB UPDATE dari hash lama!** |
| `JWT_SECRET` | `8e6fa2c5642a0463664bf072e85e731bed5c5ca3323f0773b4213d` | ✅ Sudah ada, confirm cocok |
| `SMTP_USER` | `rizkytyan17@gmail.com` | ✅ Sudah ada, confirm cocok |
| `SMTP_PASS` | `pzvpy1hvnun1fdmq` | ✅ Sudah ada, confirm cocok |

### LANGKAH 4: Save Perubahan
- Klik **Save** untuk setiap perubahan
- Tunggu deployment selesai

### LANGKAH 5: Trigger Redeploy
Klik **Deployments** → Pilih deployment terbaru → Klik **... (menu)** → **Redeploy**

## Yang Berubah:

**Password Admin:**
- Username: `Aika` atau `Nappz`
- Password: `aika123` (baru)
- ⚠️ JANGAN gunakan password lama lagi!

## Verifikasi Setelah Update:

1. Buka aplikasi di Vercel (https://merch-aika.vercel.app atau https://aika-sesilia.vercel.app)
2. Tab 🔑 Admin → Login
3. Username: `Aika` atau `Nappz`
4. Password: `aika123`
5. Harusnya masuk ke dashboard tanpa ada "login ulang"

## Jika Masih Belum Bisa:

1. **Clear Browser Cache:**
   - Ctrl+Shift+Delete (Windows) atau Cmd+Shift+Delete (Mac)
   - Hapus semua cache untuk domain aplikasi

2. **Check Browser Console (F12):**
   - Buka tab Console
   - Cari error messages
   - Screenshot error dan kirim

3. **Check Network Tab:**
   - Buka Network tab di DevTools
   - Login lagi
   - Cari request ke `/api/admin-login`
   - Lihat response body (status 401 vs 500 vs 200)

## Struktur Env Variables Summary:

```
✅ DATABASE: Neon PostgreSQL yang sudah terupdate dengan password hash baru
✅ AUTH: PASSWORD_SALT + ADMIN_PASSWORD_HASH (sekarang cocok)
✅ JWT: JWT_SECRET untuk generate token
✅ EMAIL: SMTP credentials untuk send email notifications
```

Jika ada pertanyaan, buka file ini atau cek:
- Local: node verify-deployment.js (untuk test lokal)
- Remote: Vercel logs (untuk check deployment error)
