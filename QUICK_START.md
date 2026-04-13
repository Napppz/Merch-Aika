# 🚀 SECURITY PHASE 1 - QUICK START

## 📦 What's Already Done

| ✅ Completed | Location |
|-------------|----------|
| Bcrypt + JWT utilities | `api/_lib/auth-utils.js` |
| Security middleware (rate limit, CORS, headers) | `api/_lib/security-middleware.js` |
| Updated register endpoint | `api/_lib/register.js` |
| Updated login endpoint | `api/_lib/login.js` |
| Frontend JWT token storage | `login.html` |
| Frontend auth helper class | `js/auth-helper.js` |
| Database schema updates | `setup_users_db.js` |
| Environment template | `.env.example` |

## ⚡ Quick Deploy Guide

### Step 1: Local Setup (5 min)
```bash
npm install
node setup_users_db.js
```

### Step 2: Generate JWT Secret (1 min)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output
```

### Step 3: Vercel Environment (2 min)
1. Go to Vercel dashboard
2. Select project → Settings → Environment Variables
3. Add these variables:
```
JWT_SECRET = [paste from step 2]
DATABASE_URL = [your neon connection]
SMTP_USER = your_email@gmail.com
SMTP_PASS = your_app_password
ADMIN_EMAIL = admin@merch-aika.com
```
4. Click "Save"

### Step 4: Deploy (1 min)
```bash
git add .
git commit -m "feat: Phase 1 Security Implementation"
git push
# Vercel auto-deploys
```

### Step 5: Test (5 min)
```
✅ Register new account
✅ Verify JWT token in browser devtools
✅ Check localStorage: AuthHelper.getToken()
✅ Try 6 logins → 6th should fail rate limit
✅ Check CORS from different origin
```

## 🔑 API Response Format (NEW)

### Register Success (Before → After)
```javascript
// BEFORE
{ "success": true, "user": { id, username, email } }

// AFTER
{
  "success": true,
  "message": "Akun berhasil dibuat",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,  // 24 hours
  "user": { id, username, email, role }
}
```

### Login Success (Before → After)
```javascript
// BEFORE
{ "success": true, "user": { id, username, email } }

// AFTER
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "user": { id, username, email, phone, avatar, role }
}
```

## 🛡️ Frontend Migration (Copy-Paste)

### Before API Call Update (OLD)
```javascript
fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': email
  },
  body: JSON.stringify({ items })
})
.then(r => r.json())
.then(data => { ... });
```

### After API Call Update (NEW - Simple)
```javascript
// Add this to HTML head:
<script src="js/auth-helper.js"></script>

// Then use like this:
AuthHelper.post('/api/orders', { items })
  .then(data => {
    if (data.error) {
      console.error(data.error);
      return;
    }
    // Handle success
  });
```

## 🚨 Troubleshooting

| Error | Fix |
|-------|-----|
| "JWT_SECRET is not defined" | Add to Vercel env vars + redeploy |
| "Bcrypt not found" | Run `npm install` |
| "Rate limit exceeded" | Try login again in 15min |
| "CORS error" | Token header automatically added |
| "Token not stored" | Check login response includes `token` |
| "401 Unauthorized" | Token expired → redirect to login (automatic) |

## 📋 Checklist for Each API Endpoint

For endpoints that should require authentication:

```javascript
// 1. Add requireAuth import
const { requireAuth } = require('./auth-utils');

// 2. Call at start of handler
const authResult = requireAuth(req, res);
if (authResult.error) {
  return res.status(401).json(authResult);
}

// 3. Use authenticated user
const user = authResult.user;
const userId = user.id;  // from JWT token
```

## 🎯 Success Indicators

When everything is working:

```javascript
// ✅ Open browser DevTools → Application → Storage
localStorage.aika_token    // Should have JWT token
localStorage.aika_user_data // Should have user info

// ✅ In console:
AuthHelper.isLoggedIn()     // true
AuthHelper.getUserRole()    // 'user' or 'admin'
AuthHelper.getToken()       // JWT token string

// ✅ Network tab shows:
Authorization: Bearer eyJ...  // In request headers

// ✅ Rate limiting works:
// Try login 6 times → 6th gets 429 Too Many Requests
```

## 📞 Need Help?

1. Check `SECURITY_IMPLEMENTATION.md` for detailed guide
2. Check `PHASE_1_SUMMARY.md` for complete overview
3. Look at updated files: `register.js`, `login.js`
4. Check `auth-helper.js` for frontend utilities

## 🎉 What's Next (Phase 2)

- Admin 2FA setup with speakeasy
- Update remaining endpoints with requireAuth
- Token refresh mechanism
- Password reset flow with bcrypt
- Email verification on registration

---

**Time to Deploy:** ~15 minutes
**Risk Level:** ✅ Low (backwards compatible)
**Expected Outcome:** ✅ All users redirected to login
