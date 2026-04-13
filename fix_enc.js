const fs = require('fs');
let c = fs.readFileSync('checkout.html', 'utf8');

const mojibakeMap = {
  'âš ': '⚠️',
  'â³': '⏳',
  'ðŸ›ï¸': '🛍️',
  'ðŸŽ‰': '🎉',
  'â ': '❌',
  'ðŸ“¦': '📦',
  'âœ…': '✅',
  'Ã—': '×',
  'ðŸ›’': '🛒'
};

for (const [bad, good] of Object.entries(mojibakeMap)) {
  c = c.split(bad).join(good);
}

fs.writeFileSync('checkout.html', c);

let c2 = fs.readFileSync('js/cart.js', 'utf8');
for (const [bad, good] of Object.entries(mojibakeMap)) {
  c2 = c2.split(bad).join(good);
}
fs.writeFileSync('js/cart.js', c2);

// Make sure auth handles missing names
let loginHtml = fs.readFileSync('login.html', 'utf8');
for (const [bad, good] of Object.entries(mojibakeMap)) {
  loginHtml = loginHtml.split(bad).join(good);
}
fs.writeFileSync('login.html', loginHtml);

console.log('Fixed encodings.');
