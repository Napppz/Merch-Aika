## 🔐 Admin Login Troubleshooting Guide

### Masalah: Login berhasil tapi langsung redirect kembali ke login page dengan animasi berkedip

#### **Root Causes & Solutions**

---

### **Step 1: Open Browser Console (F12)**
Saat mengalami error, buka:
- **Windows/Linux:** F12
- **Mac:** Cmd + Option + I

Perhatikan console logs untuk see error messages.

---

### **Step 2: Test Menggunakan Diagnostic Center**

Open file: `admin-diagnostic-test.html`
```
http://localhost:3000/admin-diagnostic-test.html
```

Atau jika di production:
```
https://your-domain.vercel.app/admin-diagnostic-test.html
```

**Gunakan tools di halaman untuk:**

1. **Check localStorage** - Apakah adminToken tersimpan?
2. **Test Login API** - Apakah API mengirim token?
3. **Validate Token** - Apakah token valid dan tidak expired?
4. **Simulate Dashboard** - Apakah dashboard validation akan pass atau fail?

---

### **Step 3: Manual Testing dengan Console**

Buka browser console (F12) dan copy-paste perintah ini:

#### Test 1: Check localStorage
```javascript
localStorage.getItem('adminToken')
```
**Expected:** Token string yang panjang atau `null` jika tidak ada
**If null:** Problem di login storage atau belum login

#### Test 2: Check token format
```javascript
const token = localStorage.getItem('adminToken');
token ? token.split('.').length : 'NO TOKEN'
```
**Expected:** `3` (header.payload.signature)
**If not 3:** Token format rusak

#### Test 3: Decode token
```javascript
const token = localStorage.getItem('adminToken');
if (token) {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  console.log(payload);
}
```
**Expected:** Object dengan username, role, iat, exp

#### Test 4: Check token expiry
```javascript
const token = localStorage.getItem('adminToken');
if (token) {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  console.log('Token expires at:', new Date(payload.exp * 1000));
  console.log('Expired?', payload.exp < now ? 'YES - EXPIRED' : 'NO - VALID');
}
```

---

### **Step 4: Test API Login Endpoint**

Open browser console dan run:
```javascript
fetch('/api/admin-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'Aika', password: 'Aikanap2213' })
})
.then(r => r.json())
.then(d => console.log('Response:', d))
.catch(e => console.error('Error:', e))
```

**Expected response:**
```json
{
  "success": true,
  "message": "Login admin berhasil",
  "admin": {
    "id": 1,
    "username": "Aika",
    "role": "admin",
    "token": "eyJ..."
  }
}
```

**If error:**
- Check Neon database connection
- Check PASSWORD_SALT environment variable
- Check password hash di database

---

### **Step 5: Common Issues & Fixes**

#### **Issue 1: "No admin token found"**
```
💥 Problem:     localStorage tidak menyimpan token
✅ Solution:    - Check browser's storage settings
                - Try in private/incognito mode
                - Clear localStorage dan coba lagi
```

#### **Issue 2: "Invalid token format"**
```
💥 Problem:     Token tidak memiliki 3 parts (header.payload.signature)
✅ Solution:    - API response tidak valid
                - Check /api/admin-login response
                - Restart server dan coba lagi
```

#### **Issue 3: "Token expired"**
```
💥 Problem:     Token sudah kadaluarsa
✅ Solution:    - Token expired setelah 24 jam
                - Login lagi untuk get token baru
                - Check server time vs client time (bisa time mismatch!)
```

#### **Issue 4: "Token verification failed" di dashboard**
```
💥 Problem:     Dashboard tidak bisa verify token
✅ Solution:    - JWT_SECRET mismatch antara login dan dashboard
                - Restart Vercel deployment
                - Check PASSWORD_SALT dan JWT_SECRET env variables
```

---

### **Step 6: Check Environment Variables**

Verify Vercel/production settings:

```bash
# Local .env harus punya:
PASSWORD_SALT=aika_sesilia_salt_2024_secure
JWT_SECRET=aika_sesilia_jwt_secret_2024_secure_change_in_production
DATABASE_URL=postgresql://...

# Check di .env:
printenv PASSWORD_SALT
printenv JWT_SECRET
```

Jika tidak ada atau berbeda dengan production:
1. Update `.env` file
2. Restart local server
3. Or update Vercel Environment Variables untuk production

---

### **Step 7: Debug Mode**

Untuk enable verbose logging di browser console:

```javascript
// Add di browser console SEBELUM login
sessionStorage.setItem('DEBUG_ADMIN', 'true');
```

Sekarang saat login, akan melihat lebih banyak debug logs di console.

---

### **Step 8: Full Flow Test**

```javascript
// Complete test flow - run satu per satu
console.log('1. Clear storage');
localStorage.removeItem('adminToken');

console.log('2. Test API');
fetch('/api/admin-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'Aika', password: 'Aikanap2213' })
})
.then(r => r.json())
.then(d => {
  if (d.success && d.admin.token) {
    console.log('✅ Got token:', d.admin.token.substring(0, 30) + '...');
    localStorage.setItem('adminToken', d.admin.token);
    
    // Try simulation dashboard check
    const token = localStorage.getItem('adminToken');
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp < now) {
      console.error('❌ Token expired!');
    } else {
      console.log('✅ Token valid! User:', payload.username);
      console.log('   You can now navigate to /admin/dashboard.html');
    }
  }
});
```

---

### **Step 9: Nuclear Option - Reset Admin Password**

Jika semua gagal, reset password di database:

```bash
# Run locally:
node reset-admin-password.js

# This akan update semua admin dengan password: Aikanap2213
```

---

### **Quick Diagnostic Checklist**

- [ ] Browser console terbuka saat login
- [ ] localStorage menunjukkan `adminToken` 
- [ ] Token memiliki 3 parts (header.payload.signature)
- [ ] Token tidak expired
- [ ] API `/api/admin-login` return 200 OK
- [ ] Response memiliki `admin.token`
- [ ] `.env` memiliki PASSWORD_SALT dan JWT_SECRET
- [ ] Database password hash sesuai dengan generate lokal

---

### **File untuk Reference**

- `admin-diagnostic-test.html` - Interactive diagnostic tool
- `admin-login-debug.js` - Debug helper functions
- `verify-admin-password.js` - Verify password hash di database
- `reset-admin-password.js` - Reset admin password

---

### **Kontak Support**

Jika masih error, collect informasi ini:

1. **Browser console logs** (screenshot atau copy)
2. **Network tab** - check `/api/admin-login` response
3. **localStorage content** - run `localStorage`
4. **Dashboard console error** - F12 saat di dashboard

Kemudian hubungi administrator dengan informasi tersebut.
