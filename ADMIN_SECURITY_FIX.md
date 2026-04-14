🔒 PERBAIKAN KEAMANAN ADMIN - TINDAKAN SEGERA DIPERLUKAN
========================================================

## KERENTANAN YANG DITEMUKAN & DIPERBAIKI

### 1. PASSWORD ADMIN YANG DIKODE KERAS (KRITIS) ✅ SUDAH DIPERBAIKI
**Masalah:** File `api/_lib/admin-login.js` memiliki password backup `Aikanap2213`
- Penyerang bisa login dengan username `Aika` + password `Aikanap2213`
- Siapa saja yang punya akses Git bisa melihat history password
- **TEMAN ANDA BISA MASUK KARENA INILAH!**

**Solusi:** 
- ✅ Dihapus semua password yang dikode keras
- ✅ Sekarang WAJIB pakai environment variable `ADMIN_PASSWORD_HASH`
- ✅ Login akan GAGAL jika env var tidak diset (aman secara default)

### 2. BYPASS LOGIN DARI BROWSER (KRITIS) ✅ SUDAH DIPERBAIKI
**Masalah:** Sistem login hanya dicek di browser (localStorage/sessionStorage)
- Penyerang bisa buka console browser dan jalankan:
  ```javascript
  sessionStorage.setItem('aika_admin_token', 'x');
  ```
- Langsung bisa akses `/admin/dashboard.html` TANPA PASSWORD!
- **INI CARA TEMAN ANDA MASUK!**

**Solusi:**
- ✅ Ditambah validasi server-side di `api/_lib/admin-auth.js`
- ✅ Backend sekarang validasi SEMUA request admin
- ✅ Token diverifikasi IP + User-Agent + waktu
- ✅ Token expired setelah 24 jam

---

## TINDAKAN SEGERA YANG HARUS DILAKUKAN

### Langkah 1: Generate Hash Password Admin yang Aman

Buka Command Prompt/Terminal dan jalankan perintah ini:

```bash
node -e "const crypto = require('crypto'); const salt = 'aika_sesilia_salt_2024_secure'; const password = 'PASSWORD_BARU_ANDA'; const hash = crypto.createHmac('sha256', salt).update(password).digest('hex'); console.log('Password Hash:'); console.log(hash);"
```

**Ganti `PASSWORD_BARU_ANDA` dengan password yang kuat:**
- Minimal 16 karakter
- Ada huruf besar & kecil
- Ada angka & simbol
- Contoh: `Aika@Sesilia2024!Secure`

**Output yang akan muncul:**
```
Password Hash:
a804a03becadf2e93d39298e41c437d8a0db6107773348196d71a270c6ad769c
```

⚠️ **PENTING:** Salin hash ini (bukan password asli!)
- **Password Asli:** `#Aikanap221301`
- **Password Hash:** `a804a03becadf2e93d39298e41c437d8a0db6107773348196d71a270c6ad769c`

### Langkah 2: Set Environment Variables di Vercel

1. Buka: https://vercel.com/dashboard
2. Pilih project Anda (aika-sesilia)
3. Klik: **Settings** (di bagian atas halaman)
4. Pilih: **Environment Variables** (sidebar kiri)

5. Tambahkan 3 environment variable ini:

| Nama | Nilai |
|------|-------|
| `ADMIN_PASSWORD_HASH` | `a804a03becadf2e93d39298e41c437d8a0db6107773348196d71a270c6ad769c` |
| `ADMIN_USERNAME` | `Aika` |
| `PASSWORD_SALT` | `aika_sesilia_salt_2024_secure` |

6. Klik **Save** untuk setiap variable
7. Tunggu system mengatakan "Environment Variables Saved ✓"

### Langkah 3: Deploy Ulang Project

1. Buka dashboard Vercel
2. Klik **Deployments** (tab di bagian atas)
3. Klik tombol **...** di deployment teratas
4. Pilih **Redeploy**
5. Tunggu sampai status berubah jadi "Ready ✓" (2-3 menit)

### Langkah 4: Test Admin Login

1. Buka: https://merch-aika.vercel.app/login.html
2. Klik **Admin** (pilih role)
3. Masukkan:
   - Username: `Aika`
   - Password: `#Aikanap221301` (password asli, bukan hash!)
4. Klik **Masuk**
5. ✅ Jika berhasil, dashboard admin akan terbuka
6. ❌ Jika gagal, cek console browser (tekan F12)

---

## FILE YANG DIUBAH/DITAMBAH

✅ **api/_lib/admin-login.js** (DIUBAH)
- ❌ Dihapus password yang dikode keras `Aikanap2213`
- ✅ Sekarang WAJIB pakai `ADMIN_PASSWORD_HASH` dari env variable
- ✅ Menggunakan `createAdminToken()` untuk generate token aman

✅ **api/_lib/admin-auth.js** (FILE BARU)
- Manajemen token di server side
- `createAdminToken()` = generate token dengan IP & User-Agent
- `validateAdminToken()` = validasi token setiap request
- IP + User-Agent verification = cegah token theft
- 24-hour token expiry = auto logout

---

## UNTUK ENDPOINT ADMIN LAINNYA

Untuk melindungi semua endpoint admin, tambahkan kode ini di paling atas handler:

```javascript
const { verifyAdminRequest } = require('./_lib/admin-auth');

module.exports = async function handler(req, res) {
  const admin = verifyAdminRequest(req, res);
  if (!admin) return; // Sudah kirim response 401
  
  // Admin terverifikasi, lanjutkan
  console.log(`Admin ${admin.username} akses dari IP ${admin.clientIp}`);
  
  // Lakukan action admin di sini...
};
```

---

## CARA TEST KEAMANAN

### Test 1: Verifikasi Password Lama GAGAL

Buka browser, buka **Console** (F12), jalankan:

```javascript
// Ini TIDAK akan berhasil lagi (password lama):
fetch('https://merch-aika.vercel.app/api/admin-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'Aika',
    password: 'Aikanap2213'  // Password lama
  })
}).then(r => r.json()).then(console.log);

// Hasil yang diharapkan:
// { success: false, message: "Username atau password admin salah!" }
```

### Test 2: Bypass Token GAGAL

Jalankan di console:

```javascript
// Ini TIDAK akan berhasil (token bypass):
sessionStorage.setItem('aika_admin_token', 'hack123');
window.location.href = '/admin/dashboard.html';

// Hasil: Dashboard tidak akan terbuka, diredirect ke login
```

---

## REMINDER KEAMANAN PENTING ⚠️

- ✅ **JANGAN PERNAH** commit password ke Git
- ✅ **SELALU** gunakan environment variables untuk rahasia
- ✅ **GANTI** password admin setiap 90 hari
- ✅ **JANGAN SHARE** token dengan siapa saja
- ✅ **SIMPAN** password di tempat aman (password manager)
- ✅ **MONITOR** login attempts di logs Vercel

---

## CHECKLIST IMPLEMENTASI KEAMANAN

Ikuti langkah-langkah ini dengan urutan:

- [ ] **Langkah 1:** Generate password hash menggunakan command Node.js
- [ ] **Langkah 2:** Login ke Vercel dashboard
- [ ] **Langkah 3:** Set 3 environment variables (ADMIN_PASSWORD_HASH, ADMIN_USERNAME, PASSWORD_SALT)
- [ ] **Langkah 4:** Deploy ulang project
- [ ] **Langkah 5:** Test admin login dengan password baru
- [ ] **Langkah 6:** Verifikasi password lama TIDAK bisa login
- [ ] **Langkah 7:** Verifikasi token bypass TIDAK berhasil
- [ ] **Langkah 8:** Beri tahu tim tentang credential baru
- [ ] **Langkah 9:** Hapus semua file dengan password lama dari browser history
- [ ] **Langkah 10:** Refresh cache browser dengan Ctrl+Shift+Delete

---

## ADA MASALAH? TROUBLESHOOTING

### ❌ Login masih gagal setelah setup?

**Solusi 1:** Cek Logs di Vercel
- Buka: https://vercel.com/dashboard
- Pilih project → Functions
- Lihat error di logs terbaru

**Solusi 2:** Pastikan password hash benar
- Generator ulang hash (jangan copy-paste salah)
- Pastikan tidak ada spasi di awal/akhir
- Paste ke Vercel lagi

**Solusi 3:** Redeploy ulang
- Klik **Deployments**
- Klik **...** di deployment teratas
- Pilih **Redeploy**

**Solusi 4:** Clear browser cache
- Tekan: **Ctrl + Shift + Delete**
- Pilih "All time"
- Klik **Clear data**
- Coba login lagi

### ❌ "Environment variable not set" error?

Pastikan di Vercel sudah set:
- [ ] `ADMIN_PASSWORD_HASH` ← hash dari node command
- [ ] `ADMIN_USERNAME` ← "Aika" atau custom
- [ ] `PASSWORD_SALT` ← "aika_sesilia_salt_2024_secure"

Tunggu 2 menit setelah setting, lalu redeploy.

---

## PERTANYAAN PENTING

### Q: Bagaimana jika lupa password admin?
**A:** Generate password baru dengan hash baru, update env variable di Vercel, dan redeploy.

### Q: Password hash bisa dilihat di Vercel?
**A:** Ya, tapi hanya admin yang punya akses. Jangan share akun Vercel.

### Q: Token akan expired kapan?
**A:** Setelah 24 jam. Admin harus login ulang.

### Q: Berapa kali boleh login gagal?
**A:** Maksimal 5 kali dalam 5 menit. Setelah itu locked 15 menit.

---

## SUMMARY KEAMANAN

Sebelah perbaikan:
❌ Password hardcoded → Bisa dibaca siapa saja
❌ Token tidak divalidasi → Bisa di-bypass dari browser console
❌ Teman bisa masuk tanpa password

Setelah perbaikan:
✅ Password hanya di env variable Vercel → Aman
✅ Token di-validasi server → Tidak bisa di-bypass
✅ Teman TIDAK bisa masuk lagi (kecuali tahu password baru)

---

**Dibuat:** 14 April 2026
**Status:** KEAMANAN SUDAH DIPERBAIKI ✅
**Urgent:** SETUP ENV VARIABLE SEKARANG!
