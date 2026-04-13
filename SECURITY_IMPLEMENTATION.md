# 🔐 Security Implementation Guide - Phase 1 (Critical Fixes)

## 📋 Overview

This guide walks through implementing Phase 1 critical security fixes:
- ✅ Replace SHA256 with bcrypt password hashing
- ✅ Add JWT token authentication
- ✅ Implement rate limiting on login/register
- ✅ Add input validation with Joi
- ✅ Setup CORS whitelist
- ✅ Add security headers

## 🚀 Implementation Steps

### 1. Setup Environment Variables

Before deploying, create a `.env` file in your project root:

```bash
# Generate a secure JWT_SECRET with this command:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```env
DATABASE_URL=your_neon_postgresql_connection_string
JWT_SECRET=<generated_32_char_hex_string>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
ADMIN_EMAIL=admin@merch-aika.com
ALLOWED_ORIGINS=https://merch-aika.vercel.app,http://localhost:3000
NODE_ENV=production
```

**Important for Vercel:**
1. Go to Vercel dashboard → Your Project
2. Settings → Environment Variables
3. Add each variable from `.env` file
4. Redeploy after adding variables

### 2. Update Database Schema

The `setup_users_db.js` has already been updated. Run it:

```bash
node setup_users_db.js
```

This creates:
- ✅ Enhanced `users` table with `role` and `last_login` columns
- ✅ New `audit_logs` table for security tracking
- ✅ Index untuk performance optimization

### 3. Install Dependencies

```bash
npm install
```

This installs the new packages added to `package.json`:
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT token generation/verification
- `joi` - Input validation
- `express-rate-limit` - Rate limiting middleware
- `speakeasy` - 2FA TOTP generation
- `qrcode` - QR code for 2FA setup

### 4. Files Already Updated (✅ DONE)

#### API Endpoints
- **`api/_lib/auth-utils.js`** (NEW) - Centralized auth utilities
  - `hashPassword()` - Bcrypt hashing
  - `verifyPassword()` - Bcrypt verification
  - `issueToken()` - JWT token generation
  - `verifyToken()` - JWT token verification
  - `requireAuth()` - Middleware untuk protect routes

- **`api/_lib/security-middleware.js`** (NEW) - Security middleware
  - `corsWhitelist()` - CORS dengan whitelist
  - `securityHeaders()` - Security headers (CSP, HSTS, etc)
  - `loginLimiter` - 5 attempts per 15 min
  - `registerLimiter` - 3 attempts per 1 hour
  - `apiLimiter` - 100 requests per 15 min
  - `validateRequest()` - Joi validation middleware

- **`api/_lib/register.js`** (UPDATED)
  - ✅ Replaced SHA256 with `hashPassword()` from auth-utils
  - ✅ Added Joi schema validation
  - ✅ Added `registerLimiter` middleware
  - ✅ Returns JWT token instead of just user data
  - ✅ Proper error messages untuk validation errors

- **`api/_lib/login.js`** (UPDATED)
  - ✅ Replaced SHA256 with `verifyPassword()` from auth-utils
  - ✅ Added Joi schema validation
  - ✅ Added `loginLimiter` middleware
  - ✅ Returns JWT token (24 hour expiration)
  - ✅ Added audit logging untuk failed/successful logins
  - ✅ Security best practice: doesn't reveal if user exists

#### Frontend
- **`login.html`** (UPDATED)
  - ✅ Updated to store JWT token instead of session object
  - ✅ Stores token in localStorage/sessionStorage
  - ✅ Updated onLoginSuccess() to handle token
  - ✅ Checks for existing token on page load

- **`js/auth-helper.js`** (NEW) - Utility class untuk frontend JWT handling
  - `AuthHelper.getToken()` - Get JWT token
  - `AuthHelper.getUserData()` - Get stored user data
  - `AuthHelper.isLoggedIn()` - Check if logged in
  - `AuthHelper.getAuthHeader()` - Get Authorization header
  - `AuthHelper.fetchWithAuth()` - Fetch dengan automatic token handling
  - `AuthHelper.logout()` - Clear token dan redirect to login
  - `AuthHelper.requireLogin()` - Protect pages that need login
  - `AuthHelper.requireAdmin()` - Protect admin-only pages

#### Database
- **`setup_users_db.js`** (UPDATED)
  - ✅ Added `role` column to users table (default 'user')
  - ✅ Added `last_login` column to users table
  - ✅ Added new `audit_logs` table

### 5. Next: Update Other API Endpoints

Apply the same pattern to other endpoints yang need authentication:

**For each endpoint yang gunakan `x-user-email` header:**
1. Add `const { requireAuth } = require('./auth-utils');` at top
2. Add middleware: `requireAuth(req, res)` in handler
3. Replace header-based identity dengan `req.user` dari JWT (future middleware)

**Example pattern:**
```javascript
// OLD:
const email = req.headers['x-user-email'];

// NEW:
const authResult = requireAuth(req, res);
if (authResult.error) return res.status(401).json(authResult);
const email = authResult.user.email;
```

### 6. Update Frontend Pages

Add to the `<head>` of pages yang need authentication:
```html
<script src="js/auth-helper.js"></script>
<script>
  AuthHelper.requireLogin(); // Protect the page
</script>
```

For API calls, update from:
```javascript
// OLD
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': email
  },
  body: JSON.stringify(data)
})

// NEW
AuthHelper.post('/api/endpoint', data)
  .then(response => {
    if (response.error) {
      console.error(response.error);
      return;
    }
    // Handle success
  });
```

### 7. Testing Security Fixes

#### Test Rate Limiting
```bash
# Try to login 6 times within 15 minutes
# 6th attempt should return 429 Too Many Requests
```

#### Test Password Hashing
```bash
# Old password: sha256(password)
# New password: bcrypt with 12 rounds
# Try to login with old password → should fail
# Existing users need password reset
```

#### Test JWT Token
```javascript
// Check token in browser console:
localStorage.getItem('aika_token')
// Should be: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Check token expiry:
AuthHelper.shouldRefreshToken() // false if > 1 hour left
```

#### Test CORS Whitelist
```bash
# Try to access from https://example.com
# Should be blocked (CORS error)

# Try from https://merch-aika.vercel.app
# Should work
```

### 8. Migration Path for Existing Users

**Problem:** Existing users have SHA256 passwords, new system uses bcrypt.

**Solution:** Password reset on first login
```javascript
// In login.js, if password verification fails:
// 1. Check if user came from old system (old password_hash format)
// 2. Send "Password Reset Required" email
// 3. User clicks link → reset password → now use bcrypt
```

**Alternative:** Allow both formats temporarily
```javascript
// In verifyPassword():
const isBcryptHash = user.password_hash.includes('$2a$'); // bcrypt format
if (isBcryptHash) {
  return await bcrypt.compare(password, user.password_hash);
} else {
  // OLD: SHA256 verification (temporary)
  return crypto.createHmac('sha256', salt).update(password).digest('hex') === user.password_hash;
}
```

### 9. Deployment Checklist

- [ ] Add JWT_SECRET to Vercel environment variables
- [ ] Run `npm install` locally to verify no errors
- [ ] Test login/register on localhost
- [ ] Test rate limiting locally
- [ ] Deploy to production
- [ ] Monitor error logs for JWT-related errors
- [ ] Test login on production
- [ ] Verify token stored in browser
- [ ] Test token refresh mechanism (future)
- [ ] Verify CORS whitelist working

### 10. Common Issues & Fixes

**Issue:** "JWT_SECRET is not defined"
```javascript
// Fix: Add to Vercel environment variables + redeploy
```

**Issue:** "Bcrypt not installed"
```bash
npm install bcrypt
# Then redeploy
```

**Issue:** "Rate limiter not working"
```javascript
// Check: loginLimiter uses 'identifier' from body
// Make sure frontend sends: { identifier, password }
```

**Issue:** "Token not stored in localStorage"
```javascript
// Check: login.html calls onLoginSuccess(user, remember, token)
// token parameter must be passed
```

**Issue:** "CORS blocked on frontend"
```javascript
// Add header: 'Authorization': 'Bearer ' + token
// AuthHelper.fetchWithAuth() does this automatically
```

## 🔒 Security Improvements Summary

| Issue | Before | After | Impact |
|-------|--------|-------|--------|
| Password Hashing | SHA256 (14 chars) | bcrypt (12 rounds) | 🟢 High |
| Token Lifetime | None (permanent) | 24 hours | 🟢 High |
| Rate Limiting | None | 5/15min per user | 🟢 High |
| CORS | Allow * (all origins) | Whitelist only | 🔴 Critical |
| Input Validation | Minimal | Joi schema | 🟢 Medium |
| Security Headers | None | CSP, HSTS, X-Frame | 🟢 Medium |
| Audit Trail | None | All login attempts | 🟢 Medium |

## 📞 Support

Untuk issues atau questions, check documentation di `/memories/repo/localStorage-migration-plan.md` atau buat issue di GitHub.

---

**Last Updated:** 2024
**Status:** Phase 1 Ready for Deployment
**Next:** Phase 2 - Admin 2FA Setup
