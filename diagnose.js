#!/usr/bin/env node

/**
 * Inspect deployment differences between local and Vercel
 * Check cache headers and static file serving
 */

const fs = require('fs');
const path = require('path');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║   Deployment Diagnostics                                  ║
╠═══════════════════════════════════════════════════════════╣
`);

// Check for environment-specific issues
const checks = [
  {
    name: 'CSS File Exists',
    check: () => fs.existsSync(path.join(__dirname, 'css/style.css'))
  },
  {
    name: 'JS Files Exist',
    check: () => fs.existsSync(path.join(__dirname, 'js/main.js'))
  },
  {
    name: 'HTML Files Exist',
    check: () => {
      const files = ['index.html', 'login.html', 'shop.html', 'admin/dashboard.html'];
      return files.every(f => fs.existsSync(path.join(__dirname, f)));
    }
  },
  {
    name: 'server.js Valid',
    check: () => fs.existsSync(path.join(__dirname, 'server.js'))
  },
  {
    name: 'package.json Valid',
    check: () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
      return pkg.main === 'server.js' || !pkg.main;
    }
  }
];

checks.forEach(({name, check}) => {
  const result = check();
  console.log(`${result ? '✅' : '❌'} ${name}`);
});

console.log(`
║                                                           ║
║   Deployment Status:                                      ║
║   1. Check file sizes (might be cached)                   ║
║   2. Verify all static files are present                  ║
║   3. Test endpoints                                       ║
╚═══════════════════════════════════════════════════════════╝
`);

// Check file sizes
console.log('\n📁 File Sizes:');
['css/style.css', 'js/main.js', 'index.html', 'login.html'].forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`   ${file}: ${(size / 1024).toFixed(2)} KB`);
  }
});
