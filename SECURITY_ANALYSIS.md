# 🔐 Admin Login Security Analysis

## Status Keamanan: CUKUP AMAN (Level 7/10)

---

## ✅ PROTEKSI YANG SUDAH DIIMPLEMENTASIKAN

### 1. Rate Limiting (Anti Brute Force)
```javascript
MAX_ATTEMPTS = 5      // 5 kali salah
LOCK_TIME = 15 menit  // Lockout 15 menit
ATTEMPT_WINDOW = 5 menit
```
**Efek:** Hacker perlu 5 menit untuk 5 percobaan, lalu tunggu 15 menit.  
**Level:** ✅ Sangat Baik

**Analisis:**
- IP `192.168.1.1` coba login salah 5x dalam 5 menit → **LOCKOUT 15 menit**
- Tidak bisa coba lagi sampai 15 menit berlalu
- Setiap IP dihitung terpisah

---

### 2. Password Hashing (Anti Rainbow Table)
```javascript
Algoritma: HMAC-SHA256
Salt: aika_sesilia_salt_2024_secure
Password: Aikanap2213
Hash: 000f49c6d3cfa4232f61c54c6348a4c7d4f825870ba6c53e81b92745add01db6
```
**Efek:** Bahkan jika hacker lihat code/database, password tidak bisa di-reverse.  
**Level:** ✅ Sangat Baik

**Mengapa Hash dipasang?**
- `Aikanap2213` → hash = 64 karakter random
- Tidak bisa balik: hash ≠ bisa decode jadi password
- Sekalipun ada 2 copy hash, keduanya sama (tidak ada random salt per password)

---

### 3. Timing-Safe Comparison (Anti Timing Attack)
```javascript
crypto.timingSafeEqual(
  Buffer.from(inputPasswordHash),
  Buffer.from(ADMIN_CREDENTIALS.password_hash)
)
```
**Efek:** Perbandingan password memakan waktu SAMA baik benar atau salah.  
**Level:** ✅ Sangat Baik

**Tanpa ini = Vulnerable:**
- `if (hash === storedHash)` → bisa ketahuan timing perbedaannya
- Hacker bisa gunakan timing side-channel attack

---

### 4. Security Headers
```javascript
X-Frame-Options: DENY           ✅ Tidak bisa di-embed iframe
X-XSS-Protection: 1; mode=block ✅ Browser block XSS
HSTS: max-age=31536000          ✅ Force HTTPS
CSP: default-src 'self'         ✅ Content Security Policy
```
**Effect:** Proteksi dari XSS, clickjacking, MITM attacks  
**Level:** ✅ Baik

---

### 5. Generic Error Messages (Anti Username Enumeration)
```javascript
// ❌ BURUK: "Username tidak ditemukan" ← reveal username exists
// ✅ BAIK: "Username atau password salah!"
```
**Level:** ✅ Baik

---

## ⚠️ KELEMAHAN & REKOMENDASI

### Kelemahan 1: CORS Lambat (SUDAH DIPERBAIKI ✅)

**SEBELUMNYA:**
```javascript
Access-Control-Allow-Origin: *  // ❌ Terlalu permisif
```
**SEKARANG:**
```javascript
// Hanya allow dari domain tertentu
allowedOrigins = [
  'https://merch-aika.vercel.app',
  'https://aika-sesilia.vercel.app',
  'http://localhost:3000'
]
```

**Mengapa penting?**
- Hacker dari `hack.com` sebelumnya bisa request login ke `merch-aika.vercel.app`
- Sekarang hanya domain whitelist yang bisa access

---

### Kelemahan 2: Session Token Tidak Persistent ⚠️

**Masalah saat ini:**
```javascript
// Token yang dihasilkan hanya di-return, tidak disimpan
const sessionToken = crypto.randomBytes(32).toString('hex');
return res.json({ token: sessionToken });
```

**Risiko:**
- Client bisa generate token palsu
- Tidak ada validasi token di request berikutnya
- Session bisa steal/hijack

**Rekomendasi:**
```javascript
// Simpan token di server/database dengan expiry
const session = {
  token: crypto.randomBytes(32).toString('hex'),
  username: 'Aika',
  createdAt: Date.now(),
  expiresAt: Date.now() + 24 * 60 * 60 * 1000  // 24 jam
};
ADMIN_SESSIONS.set(sessionToken, session);  // Simpan di Map atau Redis
```

---

### Kelemahan 3: Tidak Ada 2FA (Two-Factor Authentication) ⚠️

**Saat ini:** Username + Password = Login ✓

**Rekomendasi:** Tambah 2FA
```javascript
// Opsi 1: OTP via Email/SMS
// Opsi 2: TOTP (Google Authenticator)
// Opsi 3: Backup codes
```

---

### Kelemahan 4: Password Reset / ChangePassword ⚠️

**Masalah:** 
- Password hanya hardcoded di code
- Tidak ada endpoint `/api/admin/change-password`
- Tidak ada forgot password flow

**Rekomendasi:**
```javascript
// Tambah endpoint:
// POST /api/admin/change-password
// POST /api/admin/logout  
// POST /api/admin/forgot-password
```

---

### Kelemahan 5: Tidak Ada IP Whitelisting ⚠️

**Saat ini:** Siapa saja dari IP manapun bisa coba login

**Rekomendasi:**
```javascript
// Tambah env var
ADMIN_LOGIN_IP_WHITELIST = "192.168.1.1,10.0.0.5"

// Di code:
if (ADMIN_LOGIN_IP_WHITELIST && 
    !ADMIN_LOGIN_IP_WHITELIST.includes(clientIp)) {
  return res.status(403).json({ error: 'Access denied' });
}
```

---

## 🛡️ KESIMPULAN KEAMANAN

### Sudah Aman Dari:
- ✅ Brute Force (Rate limiting)
- ✅ Password Rainbow Table (Hashing)
- ✅ Timing Attacks (Timing-safe comparison)
- ✅ XSS/Clickjacking (Security headers)
- ✅ Username Enumeration (Generic errors)
- ✅ CORS attacks (CORS whitelist - BARU)

### MASIH RENTAN Terhadap:
- ⚠️ Session hijacking (no persistent token validation)
- ⚠️ Targeted attacks dari IP tertentu (no IP whitelist)
- ⚠️ Key breach (hanya password, no 2FA)
- ⚠️ Insider threats (password hardcoded di code)

---

## 📋 Action Items Priority

| Priority | Item | Risk | Effort |
|----------|------|------|--------|
| 🔴 HIGH | Session token validation | Medium | Low |
| 🟠 MEDIUM | 2FA Implementation | Medium | High |
| 🟠 MEDIUM | IP Whitelisting | Low | Low |
| 🟡 LOW | Audit logging | Low | Medium |
| 🟡 LOW | Password reset endpoint | Low | Medium |

---

## 🚀 Untuk Production:

```
1. Deploy fixes ✅ (CORS sudah diperbaiki)
2. Setup Redis untuk session storage
3. Implement 2FA 
4. Setup monitoring/logging
5. Regular security audit
6. Move password dari hardcode ke managed secret
```

---

## Pertanyaan Keamanan? 
Jika ada yang ingin ditingkatkan, chat dengan saya untuk detail implementasinya!
