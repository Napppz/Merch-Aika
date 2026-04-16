# 🚀 Vercel Deployment Guide

## Current Status
✅ Code pushed to GitHub (commit: 9108280)
✅ Admin migration complete and tested locally
⏳ Ready for Vercel deployment

---

## Step 1: Generate JWT Secret ✅

Run this command to generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example output:**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e
```

**Copy this value - you'll need it for Vercel.**

---

## Step 2: Add Environment Variables to Vercel

### 2a. Open Vercel Dashboard
1. Go to: https://vercel.com
2. Sign in with your GitHub account
3. Select your project: `Merch-Aika` or `aika-sesilia`

### 2b. Navigate to Environment Variables
1. Click **Settings** (top menu)
2. Select **Environment Variables** (left sidebar)
3. Add these variables to **Production**, **Preview**, and **Development** unless you intentionally want different values:

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Use a long random secret |
| `PASSWORD_SALT` | Yes | Must match the salt used to generate password hashes |
| `ADMIN_USERNAME` | Yes | Current admin username |
| `ADMIN_PASSWORD_HASH` | Yes | Hash for admin password |
| `EMAIL_USER` | Yes | Gmail / SMTP sender address |
| `EMAIL_PASS` | Yes | Gmail App Password / SMTP password |
| `ADMIN_EMAIL` | Recommended | Admin notification inbox |
| `MIDTRANS_SERVER_KEY` | Yes if Midtrans is enabled | Server key from Midtrans dashboard |

### 2c. Recommended Values Checklist

```env
DATABASE_URL=postgresql://...
JWT_SECRET=<paste generated secret from Step 1>
PASSWORD_SALT=<your existing password salt>
ADMIN_USERNAME=<your admin username>
ADMIN_PASSWORD_HASH=<your admin password hash>
EMAIL_USER=<your sender email>
EMAIL_PASS=<your email app password>
ADMIN_EMAIL=<your admin inbox>
MIDTRANS_SERVER_KEY=<your midtrans server key>
```

### 2d. Save
1. Click **Add New** for each variable
2. Paste the correct value
3. Enable the environments you need
4. Click **Save**

---

## Step 3: Trigger Deployment

### Option A: Automatic (Recommended)
Vercel automatically deploys when you push to `main` branch. Since we just pushed:
```
9108280 - Cleanup: Remove test files from repository
```

**Check deployment status:**
1. Go to Vercel dashboard
2. Click on your project
3. You should see a **Deployments** section
4. Latest deployment should show status: **Building** → **Ready** ✅

**Estimated time:** 2-5 minutes

### Option B: Manual Redeploy
If you need to manually redeploy:
1. Go to Vercel dashboard
2. Click **Deployments** tab
3. Find the latest deployment
4. Click the **...** menu → **Redeploy**

---

## Step 4: Test Production Login

Once deployment is complete (status shows ✅):

### 4a. Test Login API
```bash
curl -X POST https://merch-aika.vercel.app/api/admin-login \
  -H "Content-Type: application/json" \
  -H "Origin: https://merch-aika.vercel.app" \
  -d '{
    "username": "Aika",
    "password": "Aikanap2213"
  }'
```

**Expected response (success):**
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

### 4b. Test in Browser
1. Open your admin login page: https://merch-aika.vercel.app/admin/login.html
2. Enter credentials:
   - Username: `Aika`
   - Password: `Aikanap2213`
3. Click **Login**
4. You should see: **"Login admin berhasil"** ✅

### 4c: Verify JWT Token
Open browser DevTools (F12) → Application → Local Storage:
- You should see a key like `adminToken` with JWT value (starts with `eyJ...`)

---

## Step 5: Verify Deployment Health

### Check Logs
1. Vercel dashboard → **Deployments**
2. Click on latest deployment
3. Click **Functions** tab to see API logs
4. Try a login request and watch the logs in real-time

### Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| JWT_SECRET not found | ✅ Verify environment variable is added to **all** environments (Production, Preview, Development) |
| Login fails with 500 | ✅ Check if JWT_SECRET is set in Vercel (not just locally) |
| "Cannot connect to database" | ✅ Verify DATABASE_URL is set correctly in Vercel |
| Token verification failed | ✅ Ensure JWT_SECRET matches exactly (copy-paste carefully) |

---

## Step 6: Monitor & Update Admin Dashboard

### Update Frontend to Store JWT
In your admin login code (`admin/login.html` or JS):

```javascript
const response = await fetch('/api/admin-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

const data = await response.json();

if (data.success) {
  // ✅ NEW: Store JWT token
  localStorage.setItem('adminToken', data.admin.token);
  
  // Redirect to dashboard
  window.location.href = '/admin/dashboard.html';
}
```

### Use JWT in Protected Requests
```javascript
const token = localStorage.getItem('adminToken');

fetch('/api/protected-endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## Deployment Checklist

- ✅ Code pushed to GitHub
- ⏳ **TODO:** Add JWT_SECRET to Vercel environment variables
- ⏳ **TODO:** Wait for Vercel deployment to complete (~5 min)
- ⏳ **TODO:** Test login on production URL
- ⏳ **TODO:** Verify JWT token is generated
- ⏳ **TODO:** Test admin dashboard access
- ⏳ **TODO:** Monitor logs for any errors

---

## Rollback (If Needed)

If something goes wrong:

1. Go to Vercel dashboard
2. Click **Deployments**
3. Find the previous working deployment
4. Click **...** → **Promote to Production**

Previous working version:
- `1be0bc8` - Added documentation (before test files cleanup)
- `fd3963c` - Initial migration (core functionality)

---

## Next Steps After Production ✅

Once deployment is verified working:

1. **Update Admin Dashboard** - Use JWT token for API requests
2. **Create Admin Management API** - Add/update/delete admin accounts
3. **Implement Token Refresh** - Handle 24h expiry gracefully
4. **Add 2FA** - Extra security layer (future)

---

## Support & Troubleshooting

### View Vercel Logs
```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Login
vercel login

# View logs
vercel logs
```

### Local Testing Before Production
```bash
# Test with JWT_SECRET locally
JWT_SECRET="your-test-secret" vercel dev
```

### Questions?
Check the comprehensive documentation at: `ADMIN_SYSTEM_MIGRATION.md`

---

**Status:** ✅ Ready for deployment to Vercel
**Last Updated:** April 14, 2026
**Deployment Key:** 9108280 (commit hash)
## R2 Product Image Upload Variables

Tambahkan juga environment variable berikut di Vercel sebelum menguji upload foto produk admin:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Checklist singkat:
1. Buat bucket Cloudflare R2 untuk gambar produk
2. Aktifkan public domain atau custom domain untuk bucket
3. Isi `R2_PUBLIC_BASE_URL` dengan domain publik tersebut
4. Buat token R2 yang punya izin upload object
5. Jalankan migrasi gambar lama setelah env production siap
