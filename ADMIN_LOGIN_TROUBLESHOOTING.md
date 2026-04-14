# 🔐 Admin Login Troubleshooting Guide

## Status Saat Ini: April 14, 2026

### Masalah
- Login admin menolak password meski "sudah benar"
- Pesan error: "❌ Username atau password admin salah!"

---

## ✅ Checklist Perbaikan

### 1. Verifikasi Password Default
Coba login dengan:
- **Username:** `Aika` (case-sensitive)
- **Password:** `Aikanap2213` (case-sensitive - perhatikan huruf besar)

Jika berhasil → Password lama masih aktif ✅

### 2. Jika Tetap Gagal - Gunakan Custom Password

#### Langkah A: Generate Hash
```bash
# Di folder project aika-sesilia
node GENERATE_ADMIN_HASH.js "PasswordBaru123"
```

**Contoh output:**
```
Password: "PasswordBaru123"
Hash:     a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

#### Langkah B: Simpan Hash ke Vercel
1. Buka **Vercel Dashboard** → Project `aika-sesilia`
2. Klik **Settings**
3. Pilih tab **Environment Variables**
4. Klik **Add New**
5. Isi:
   - **Name:** `ADMIN_PASSWORD_HASH`
   - **Value:** (paste hash dari Langkah A)
6. Klik **Save**

#### Langkah C: Redeploy
```bash
git add .
git commit -m "Update admin password hash"
git push origin main
```

Vercel akan auto-redeploy. Tunggu sampai selesai (lihat deploy status).

#### Langkah D: Coba Login
- **Username:** `Aika`
- **Password:** (gunakan password yang Anda generate di Langkah A)

---

## 🔍 Debug Info Teknis

### Password Hashing System
- **Algoritma:** HMAC-SHA256
- **Salt:** `aika_sesilia_salt_2024_secure`
- **Lokasi File:** `api/_lib/admin-login.js` (line 20)

### Hash Password Default
```
Password: Aikanap2213
Hash:     000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6
```

### Troubleshooting Lanjutan

#### Jika ingin enable debug logging:
1. Di Vercel Dashboard, tambah env var:
   - **Name:** `DEBUG_ADMIN_LOGIN`
   - **Value:** `true`
2. Redeploy
3. Cek console logs saat login attempt
4. Set balik ke `false` setelah selesai (untuk keamanan)

#### Rate Limiting
- **Max attempts:** 5 kali salah
- **Lockout time:** 15 menit
- **Reset:** Automatic after lockout period

Jika terkunci, tunggu 15 menit atau coba dari device/IP lain.

---

## 🚀 Best Practice Security

**JANGAN:**
- Bagikan password via email/chat
- Simpan password di kode (selalu gunakan env vars)
- Gunakan password yang mudah ditebak

**LAKUKAN:**
- Use strong password: `Min 12 char, mix UPPER/lower/123/!@#`
- Change password regularly (setiap 90 hari)
- Use unique password (berbeda dari password lain)

---

## 📞 Quick Links
- Vercel Dashboard: https://vercel.com/dashboard
- Project Settings: https://vercel.com/dashboard/aika-sesilia/settings
- Node.js Docs: https://nodejs.org/docs/

---

**Last Updated:** April 14, 2026  
**Maintained By:** Admin Security Team
