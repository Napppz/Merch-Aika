// js/auth-helper.js — Frontend JWT token management
// Gunakan helper ini untuk semua API calls yang memerlukan authentication

class AuthHelper {
  // Get JWT token dari localStorage atau sessionStorage
  static getToken() {
    return localStorage.getItem('aika_token') || sessionStorage.getItem('aika_token');
  }

  // Get user data dari localStorage atau sessionStorage
  static getUserData() {
    const data = localStorage.getItem('aika_user_data') || sessionStorage.getItem('aika_user_data');
    return data ? JSON.parse(data) : null;
  }

  // Check if user is logged in
  static isLoggedIn() {
    return !!this.getToken();
  }

  // Get user role
  static getUserRole() {
    const user = this.getUserData();
    return user ? user.role : null;
  }

  // Get Authorization header
  static getAuthHeader() {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // Logout
  static logout() {
    localStorage.removeItem('aika_token');
    localStorage.removeItem('aika_user_data');
    sessionStorage.removeItem('aika_token');
    sessionStorage.removeItem('aika_user_data');
    localStorage.removeItem('aika_session');
    sessionStorage.removeItem('aika_session');
    window.location.href = 'login.html';
  }

  // Fetch dengan JWT authentication dan automatic error handling
  static async fetchWithAuth(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...this.getAuthHeader()
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // Handle 401 Unauthorized (token expired atau invalid)
    if (response.status === 401) {
      console.log('Token expired, redirecting to login...');
      this.logout();
      return { error: 'Session expired. Please login again.' };
    }

    // Handle 403 Forbidden (insufficient permissions)
    if (response.status === 403) {
      return { error: 'Access denied. Insufficient permissions.' };
    }

    // Handle 429 Too Many Requests (rate limit)
    if (response.status === 429) {
      return { error: 'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.' };
    }

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || data.message || 'An error occurred' };
    }

    return data;
  }

  // POST request dengan auth
  static async post(url, body = {}) {
    return this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  // GET request dengan auth
  static async get(url) {
    return this.fetchWithAuth(url, {
      method: 'GET'
    });
  }

  // PUT request dengan auth
  static async put(url, body = {}) {
    return this.fetchWithAuth(url, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  // DELETE request dengan auth
  static async delete(url) {
    return this.fetchWithAuth(url, {
      method: 'DELETE'
    });
  }

  // Check if token needs refresh (less than 1 hour left)
  static shouldRefreshToken() {
    const token = this.getToken();
    if (!token) return false;

    try {
      // Decode JWT (simple base64 decode, tidak verify signature)
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      
      // Return true if expires in less than 1 hour
      return (expiresAt - now) < (60 * 60 * 1000);
    } catch (err) {
      console.error('Error checking token expiry:', err);
      return false;
    }
  }

  // Require login (redirect if not logged in)
  static requireLogin() {
    if (!this.isLoggedIn()) {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  // Require admin role
  static requireAdmin() {
    this.requireLogin();
    if (this.getUserRole() !== 'admin') {
      alert('Akses admin diperlukan!');
      window.location.href = 'index.html';
    }
  }

  // Get CSRF token (implementasi future)
  static getCSRFToken() {
    // Implementasi untuk security tambahan di masa depan
    return null;
  }
}

// Make available globally
window.AuthHelper = AuthHelper;
