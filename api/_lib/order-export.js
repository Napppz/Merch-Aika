const db = require('./_db');
const { requireAdmin } = require('./admin-auth');

const ORDER_DETAIL_COLUMNS = `
  id,
  "customerName",
  email,
  address,
  status,
  total,
  items,
  shipping,
  date,
  updated_at,
  payment_proof
`;

function normalizeOrder(order) {
  const normalized = { ...order };

  if (typeof normalized.items === 'string') {
    try {
      normalized.items = JSON.parse(normalized.items);
    } catch (error) {
      normalized.items = [];
    }
  }

  if (typeof normalized.shipping === 'string') {
    try {
      normalized.shipping = JSON.parse(normalized.shipping);
    } catch (error) {
      normalized.shipping = {};
    }
  }

  if (!Array.isArray(normalized.items)) normalized.items = [];
  if (!normalized.shipping || typeof normalized.shipping !== 'object') normalized.shipping = {};

  return normalized;
}

function formatDate(dateValue) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatCurrency(amount) {
  return `Rp ${Math.round(Number(amount) || 0).toLocaleString('id-ID')}`;
}

function formatStatus(status) {
  const labels = {
    paid: 'Dikemas',
    pending: 'Menunggu Pembayaran',
    payment_pending: 'Menunggu Pembayaran',
    pending_payment: 'Menunggu Pembayaran',
    processing: 'Diproses',
    shipped: 'Dikirim',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  };
  return labels[status] || status || '-';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCsv(order) {
  const shippingCost = Number(order.shipping?.price) || 0;
  const discountAmount = Number(order.shipping?.discount?.amount) || 0;
  const subtotal = Math.max(0, (Number(order.total) || 0) - shippingCost + discountAmount);

  const lines = [
    ['INVOICE PESANAN AIKA SESILIA'],
    ['Order ID', order.id],
    ['Waktu Pesanan', formatDate(order.date)],
    ['Customer', order.customerName],
    ['Email', order.email],
    ['Alamat', order.address || '-'],
    ['Pengiriman', order.shipping?.name || '-'],
    ['No. Resi Pengiriman', order.shipping?.resi || '-'],
    ['Status', formatStatus(order.status)],
    [],
    ['DETAIL ITEM'],
    ['Nama Produk', 'Size', 'Qty', 'Harga Satuan', 'Subtotal']
  ];

  order.items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    lines.push([
      item.name || '-',
      item.size || '-',
      qty,
      formatCurrency(price),
      formatCurrency(price * qty)
    ]);
  });

  lines.push([]);
  lines.push(['RINGKASAN PEMBAYARAN']);
  lines.push(['Subtotal Produk', formatCurrency(subtotal)]);
  lines.push(['Ongkos Kirim', formatCurrency(shippingCost)]);
  if (discountAmount > 0) {
    lines.push([
      `Diskon${order.shipping?.discount?.code ? ` (${order.shipping.discount.code})` : ''}`,
      `- ${formatCurrency(discountAmount)}`
    ]);
  }
  lines.push(['Total', formatCurrency(order.total)]);

  return `\uFEFF${lines.map(row => row.map(escapeCsv).join(',')).join('\n')}`;
}

function buildExcelHtml(order) {
  const shippingCost = Number(order.shipping?.price) || 0;
  const discountAmount = Number(order.shipping?.discount?.amount) || 0;
  const subtotal = Math.max(0, (Number(order.total) || 0) - shippingCost + discountAmount);
  const discountLabel = order.shipping?.discount?.code
    ? `Diskon (${escapeHtml(order.shipping.discount.code)})`
    : 'Diskon';

  const itemRows = order.items.map(item => {
    const qty = Number(item.qty) || 0;
    const price = Number(item.price) || 0;
    return `
      <tr>
        <td>${escapeHtml(item.name || '-')}</td>
        <td>${escapeHtml(item.size || '-')}</td>
        <td>${qty}</td>
        <td>${escapeHtml(formatCurrency(price))}</td>
        <td>${escapeHtml(formatCurrency(price * qty))}</td>
      </tr>
    `;
  }).join('');

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1, h2 { color: #0a3872; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background: #e0f2fe; }
          .summary td:first-child { font-weight: bold; width: 240px; }
        </style>
      </head>
      <body>
        <h1>Invoice Pesanan Aika Sesilia</h1>
        <table class="summary">
          <tr><td>Order ID</td><td>${escapeHtml(order.id)}</td></tr>
          <tr><td>Waktu Pesanan</td><td>${escapeHtml(formatDate(order.date))}</td></tr>
          <tr><td>Customer</td><td>${escapeHtml(order.customerName)}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(order.email)}</td></tr>
          <tr><td>Alamat</td><td>${escapeHtml(order.address || '-')}</td></tr>
          <tr><td>Pengiriman</td><td>${escapeHtml(order.shipping?.name || '-')}</td></tr>
          <tr><td>No. Resi Pengiriman</td><td>${escapeHtml(order.shipping?.resi || '-')}</td></tr>
          <tr><td>Status</td><td>${escapeHtml(formatStatus(order.status))}</td></tr>
        </table>

        <h2>Detail Item</h2>
        <table>
          <thead>
            <tr>
              <th>Nama Produk</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Harga Satuan</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || '<tr><td colspan="5">Tidak ada item.</td></tr>'}
          </tbody>
        </table>

        <h2>Ringkasan Pembayaran</h2>
        <table class="summary">
          <tr><td>Subtotal Produk</td><td>${escapeHtml(formatCurrency(subtotal))}</td></tr>
          <tr><td>Ongkos Kirim</td><td>${escapeHtml(formatCurrency(shippingCost))}</td></tr>
          ${discountAmount > 0 ? `<tr><td>${discountLabel}</td><td>- ${escapeHtml(formatCurrency(discountAmount))}</td></tr>` : ''}
          <tr><td>Total</td><td>${escapeHtml(formatCurrency(order.total))}</td></tr>
        </table>
      </body>
    </html>
  `;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!requireAdmin(req, res)) return;

  const { id, format = 'csv' } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Order id wajib diisi' });
  }

  const { rows } = await db.query(`SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE id = $1`, [id]);
  if (!rows.length) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = normalizeOrder(rows[0]);
  const safeId = String(order.id).replace(/[^a-zA-Z0-9_-]/g, '-');

  if (format === 'excel') {
    const html = buildExcelHtml(order);
    return res
      .status(200)
      .setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="invoice-${safeId}.xls"`)
      .send(`\uFEFF${html}`);
  }

  const csv = buildCsv(order);
  return res
    .status(200)
    .setHeader('Content-Type', 'text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="invoice-${safeId}.csv"`)
    .send(csv);
};
