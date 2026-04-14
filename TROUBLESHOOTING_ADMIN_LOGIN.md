# 🔍 TROUBLESHOOTING ADMIN LOGIN - VERCEL PRODUCTION

## Status Lokal ✅
Semua test PASS:
- ✓ Database terhubung
- ✓ Admin ada di database  
- ✓ Password hash cocok
- ✓ JWT bisa di-generate
- ✓ Login logic seharusnya kerja

## Berarti Masalahnya di Vercel! 🚨

---

## CHECKLIST TROUBLESHOOTING:

### 1️⃣ ENVIRONMENT VARIABLES DI VERCEL (PALING PENTING!)

**Buka:** vercel.com → Project → Settings → Environment Variables

Cek SEMUA variabel ini **EXACT COCOK**:

```
DATABASE_URL: postgresql://neondb_owner:npg_1yVLlBYH3qCM@ep-nameless-voice-ank083j1-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require
PASSWORD_SALT: aika_sesilia_salt_2024_secure
ADMIN_PASSWORD_HASH: 06b8c8fb287762975a3ed80fe1d9f5ae2da50027c8c004d5ef895757b58978e4
JWT_SECRET: 8e6fa2c5642a0463664bf072e85e731bed5c5ca3323f0773b4213d
SMTP_USER: rizkytyan17@gmail.com
SMTP_PASS: pzvpy1hvnun1fdmq
```

⚠️ **KHUSUS ADMIN_PASSWORD_HASH:**
- ❌ JANGAN: `000f49c6d3cfa...` (hash LAMA)
- ✅ PAKAI: `06b8c8fb287762975a3ed80fe1d9f5ae2da50027c8c004d5ef895757b58978e4` (hash BARU)

### 2️⃣ DEPLOY ULANG SETELAH UPDATE

**Penting:** Environment variables tidak otomatis apply!

Langkah:
1. Buka **Deployments** di Vercel
2. Cari deployment terbaru
3. Klik **... (menu)** → **Redeploy**
4. Tunggu sampai selesai (biru berhasil, merah gagal)

### 3️⃣ CLEAR BROWSER DATA

Sebelum test di production:

**Chrome/Edge:**
- Ctrl+Shift+Delete
- Pilih "All time"
- Check: Cookies, Cached images/files
- Click Clear

**Firefox:**
- Ctrl+Shift+Delete  
- Check: Cookies, Cache
- Click Clear Now

**Safari:**
- Cmd+Option+E (atau menu: Develop → Empty Caches)

### 4️⃣ TEST DI PRODUCTION

Buka aplikasi di Vercel:
- Jika ada 2 domain, coba keduanya (merch-aika.vercel.app atau aika-sesilia.vercel.app)

Buka DevTools (F12):
1. Buka **Console** tab
2. Login dengan:
   - Username: `Aika` atau `Nappz`
   - Password: `aika123`
3. Check console untuk errors

### 5️⃣ CHECK NETWORK REQUEST (PALING PENTING!)

DevTools → **Network** tab:

1. Reload halaman
2. Pilih tab Admin
3. Masukkan username: `Aika`
4. Masukkan password: `aika123`
5. Klik login
6. Tunggu API request selesai

Di Network tab cari request:
- **POST /api/admin-login** (atau /api?route=admin-login)

Klik request tersebut → Tab "Response":

#### Response Status 200? (Success! ✅)
```json
{
  "success": true,
  "message": "Login admin berhasil",
  "admin": {
    "id": 1,
    "username": "Aika",
    "role": "admin",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```
Tapi masih redirect ke login → **Issue #2** (lihat bawah)

#### Response Status 401? (Password salah! ❌)
```json
{
  "success": false,
  "message": "Username atau password admin salah!"
}
```
Solusi:
- ❌ JANGAN pakai password yang salah
- ✅ PAKAI: `aika123`
- Check DATABASE_URL di Vercel valid
- Check ADMIN_PASSWORD_HASH di Vercel: `06b8c8fb...` (bukan `000f49...`)

#### Response Status 429? (Rate limited! ⏱️)
```json
{
  "success": false,
  "message": "Akun terkunci. Coba lagi dalam X menit."
}
```
Solusi:
- Tunggu 15 menit
- Clear browser localStorage (F12 → Application → Clear Storage)
- Try incognito mode

#### Response Status 500? (Server error! 💥)
Solusi:
- 1. Check Vercel function logs:
  - Vercel dashboard → Deployments → Latest → Function logs
  - Lihat error detail
- 2. DATABASE_URL mungkin error
  - Test di production: buat endpoint test untuk cek koneksi DB
- 3. Vercel region issue
  - Coba domain berbeda atau hard refresh

#### No Response / Pending? (Request timeout! ⏳)
Solusi:
- DATABASE_URL connection timeout
- Neon database tidak accessible dari Vercel region
- Check Neon console untuk connection logs

---

## ISSUE #2: Status 200 Tapi Masih Redirect ke Login

Jika API response 200 tapi dashboard tidak muncul:

**Check Console (F12 → Console):**
Cari error messages atau warnings

**Kemungkinan Masalah:**

### A. Token tidak disimpan di localStorage
```javascript
// Buka Console dan ketik:
localStorage.getItem('adminToken')
```
Jika hasilnya `null` → token tidak disimpan

**Cek di Network Response:**
- Token ada di response? Cek field `admin.token`
- Jika ada → frontend (login.html) tidak save ke localStorage

**Fix:**
- Check [login.html](login.html) line ~400-450
- Pastikan ada: `localStorage.setItem('adminToken', data.admin.token)`

### B. Token disimpan tapi dashboard tidak verify
Buka localStorage dan lihat:
```javascript
// Console:
const token = localStorage.getItem('adminToken');
console.log(token); // Lihat ada atau tidak

// Parse token:
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log(payload);
console.log('Exp:', new Date(payload.exp * 1000));
console.log('Now:', new Date());
```

Jika token expired → regenerate dengan login baru
Jika token valid → dashboard.html tidak load token dengan benar

**Check [admin/dashboard.html](admin/dashboard.html) line ~15**:
```javascript
const token = localStorage.getItem('adminToken');
if (!token) {
  // Redirect ke login
  window.location.replace('/admin/login.html');
}
```

---

## VERCEL FUNCTION LOGS

Untuk debug lebih detail di production:

1. https://vercel.com/dashboard
2. Pilih project
3. **Deployments**
4. Klik deployment terbaru
5. Scroll ke **Function Logs**
6. Filter: `admin-login`
7. Lihat error detail

---

## STEP-BY-STEP RUN TEST:

Jalankan checklist ini sesuai urutan:

- [ ] 1. Update ALL env variables di Vercel (copy-paste exact value)
- [ ] 2. Redeploy di Vercel (wait sampai selesai)
- [ ] 3. Clear browser cache + localStorage
- [ ] 4. Close dan buka browser baru (atau incognito)
- [ ] 5. Buka aplikasi Vercel
- [ ] 6. F12 → Console (lihat ada error atau tidak)
- [ ] 7. Login: Aika / aika123
- [ ] 8. F12 → Network → lihat response dari /api/admin-login
- [ ] 9. Jika status 200 → cek localStorage.getItem('adminToken')
- [ ] 10. Jika ada token → refresh halaman (F5)
- [ ] 11. Check admin/dashboard.html dimuat atau redirect ke login

---

## SUDAH DICOBA SEMUA TAPI MASIH GAGAL?

Screenshot dan kirim:
1. Network response dari /api/admin-login (status code + response body)
2. Console errors (F12 → Console tab)
3. Vercel Function Logs (error detail)
4. localStorage content:
   ```javascript
   // Buka Console dan ketik:
   localStorage
   // lihat apa ada adminToken atau tidak
   ```

---

**INTINYA:**
- ✅ Lokal: semua ok
- ❓ Production: env variables perlu double-check
- 🚀 Jika env ok: masalah di frontend (login.html atau dashboard.html)
- 💻 Jika network response error: masalah di backend API
