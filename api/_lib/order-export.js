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
  const sizeSurcharge = Number(order.shipping?.sizeSurcharge) || 0;
  const discountAmount = Number(order.shipping?.discount?.amount) || 0;
  const subtotal = Math.max(0, (Number(order.total) || 0) - shippingCost - sizeSurcharge + discountAmount);

  const lines = [
    ['INVOICE PESANAN'],
    ['Order ID', `#${order.id}`],
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
  if (sizeSurcharge > 0) {
    lines.push(['Biaya Varian Size', `+ ${formatCurrency(sizeSurcharge)}`]);
  }
  lines.push(['Ongkos Kirim', formatCurrency(shippingCost)]);
  if (discountAmount > 0) {
    lines.push([
      `Diskon${order.shipping?.discount?.code ? ` (${order.shipping.discount.code})` : ''}`,
      `- ${formatCurrency(discountAmount)}`
    ]);
  }
  lines.push(['Total Nilai Pesanan', formatCurrency(order.total)]);
  const isDp = order.shipping?.paymentScheme === 'dp50';
  if (isDp) {
    const dpAmount = Number(order.shipping?.dpAmount) || Math.ceil((Number(order.total) || 0) * 0.5);
    const remainingAmount = Number(order.shipping?.remainingAmount) || Math.max(0, (Number(order.total) || 0) - dpAmount);
    lines.push(['Skema Pembayaran', 'DP 50% (Uang Muka)']);
    lines.push(['Tagihan DP 50% (Dibayar)', formatCurrency(dpAmount)]);
    lines.push(['Sisa Tagihan Pelunasan', formatCurrency(remainingAmount)]);
  } else {
    lines.push(['Skema Pembayaran', 'Bayar Penuh (100%)']);
  }

  return `\uFEFF${lines.map(row => row.map(escapeCsv).join(',')).join('\n')}`;
}

function buildExcelHtml(order) {
  const shippingCost = Number(order.shipping?.price) || 0;
  const sizeSurcharge = Number(order.shipping?.sizeSurcharge) || 0;
  const discountAmount = Number(order.shipping?.discount?.amount) || 0;
  const subtotal = Math.max(0, (Number(order.total) || 0) - shippingCost - sizeSurcharge + discountAmount);
  const discountLabel = order.shipping?.discount?.code
    ? `Diskon (${escapeHtml(order.shipping.discount.code)})`
    : 'Diskon';
  const isDp = order.shipping?.paymentScheme === 'dp50';
  const dpAmount = Number(order.shipping?.dpAmount) || Math.ceil((Number(order.total) || 0) * 0.5);
  const remainingAmount = Number(order.shipping?.remainingAmount) || Math.max(0, (Number(order.total) || 0) - dpAmount);

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
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>Invoice #${escapeHtml(order.id)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
          th { background: #f3f4f6; }
          .summary td:first-child { font-weight: bold; width: 70%; }
          .highlight { background: #fef3c7; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Invoice Pesanan #${escapeHtml(order.id)}</h1>
        <table>
          <tr><td>Order ID</td><td>#${escapeHtml(order.id)}</td></tr>
          <tr><td>Waktu Pesanan</td><td>${escapeHtml(formatDate(order.date))}</td></tr>
          <tr><td>Customer</td><td>${escapeHtml(order.customerName)}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(order.email)}</td></tr>
          <tr><td>Alamat</td><td>${escapeHtml(order.address || '-')}</td></tr>
          <tr><td>Pengiriman</td><td>${escapeHtml(order.shipping?.name || '-')}</td></tr>
          <tr><td>No. Resi</td><td>${escapeHtml(order.shipping?.resi || '-')}</td></tr>
          <tr><td>Status Pesanan</td><td>${escapeHtml(formatStatus(order.status))}</td></tr>
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
          ${sizeSurcharge > 0 ? `<tr><td>Biaya Varian Size</td><td style="color:#0284c7;font-weight:bold;">+ ${escapeHtml(formatCurrency(sizeSurcharge))}</td></tr>` : ''}
          <tr><td>Ongkos Kirim</td><td>${escapeHtml(formatCurrency(shippingCost))}</td></tr>
          ${discountAmount > 0 ? `<tr><td>${discountLabel}</td><td>- ${escapeHtml(formatCurrency(discountAmount))}</td></tr>` : ''}
          <tr><td>Total Nilai Pesanan</td><td>${escapeHtml(formatCurrency(order.total))}</td></tr>
          ${isDp ? `
            <tr style="background:#e0f2fe;"><td>Skema Pembayaran</td><td style="color:#0369a1;font-weight:bold;">⚡ DP 50% (Uang Muka)</td></tr>
            <tr style="background:#dcfce7;"><td>Tagihan DP 50% (Dibayar)</td><td style="color:#15803d;font-weight:bold;">${escapeHtml(formatCurrency(dpAmount))}</td></tr>
            <tr style="background:#fef3c7;"><td>Sisa Tagihan Pelunasan</td><td style="color:#b45309;font-weight:bold;">${escapeHtml(formatCurrency(remainingAmount))}</td></tr>
          ` : `
            <tr><td>Skema Pembayaran</td><td>💎 Bayar Penuh (100%)</td></tr>
          `}
        </table>
      </body>
    </html>
  `;
}

function buildAllOrdersCsv(orders) {
  const CSV_HEADERS = [
    'No.',
    'Order ID',
    'Tanggal Pesanan',
    'Nama Customer',
    'Email Customer',
    'Alamat Pengiriman',
    'Status Pesanan',
    'Skema Pembayaran',
    'Daftar Produk',
    'Total Qty',
    'Subtotal Produk (Rp)',
    'Biaya Varian Size (Rp)',
    'Ongkos Kirim (Rp)',
    'Kurir Pengiriman',
    'No. Resi',
    'Diskon (Rp)',
    'Kode Voucher',
    'Tagihan DP (Rp)',
    'Sisa Pelunasan (Rp)',
    'Total Pesanan (Rp)'
  ];

  const rows = orders.map((order, idx) => {
    const norm = normalizeOrder(order);
    const items = norm.items || [];
    const ship = norm.shipping || {};

    const itemsSummary = items.map(i => {
      const sizeStr = i.size ? ` [Size: ${i.size}]` : '';
      const qtyStr = ` (${i.qty || 1}x)`;
      const priceStr = i.price ? ` @Rp${Number(i.price).toLocaleString('id-ID')}` : '';
      return `${i.name || 'Produk'}${sizeStr}${priceStr}${qtyStr}`;
    }).join('; ');

    const totalQty = items.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
    const shippingCost = Number(ship.price) || 0;
    const sizeSurcharge = Number(ship.sizeSurcharge) || 0;
    const discountAmount = Number(ship.discount?.amount) || 0;
    const discountCode = ship.discount?.code || '-';
    const subtotal = Math.max(0, (Number(norm.total) || 0) - shippingCost - sizeSurcharge + discountAmount);

    const isDp = ship.paymentScheme === 'dp50' || ship.isDp;
    const dpAmount = isDp ? (Number(ship.dpAmount) || Math.ceil((Number(norm.total) || 0) * 0.5)) : 0;
    const remainingAmount = isDp ? (Number(ship.remainingAmount) || Math.max(0, (Number(norm.total) || 0) - dpAmount)) : 0;
    const schemeLabel = isDp ? 'DP 50% (Uang Muka)' : 'Bayar Penuh (100%)';

    const cleanAddress = String(norm.address || '-').replace(/\r?\n/g, ', ');

    return [
      idx + 1,
      norm.id,
      formatDate(norm.date),
      norm.customerName || '-',
      norm.email || '-',
      cleanAddress,
      formatStatus(norm.status),
      schemeLabel,
      itemsSummary || '-',
      totalQty,
      subtotal,
      sizeSurcharge,
      shippingCost,
      ship.name || '-',
      ship.resi || '-',
      discountAmount,
      discountCode,
      dpAmount,
      remainingAmount,
      Number(norm.total) || 0
    ];
  });

  const lines = [CSV_HEADERS, ...rows];
  return `\uFEFF${lines.map(row => row.map(escapeCsv).join(',')).join('\n')}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!requireAdmin(req, res)) return;

  const { id, format = 'csv', status } = req.query;

  // JIKA REQUEST MEMINTA EXPORT ORDER INDIVIDUAL
  if (id) {
    if (format === 'csv') {
      // Sesuai permintaan pengguna, fitur export CSV per order 1-1 dinonaktifkan
      return res.status(400).json({
        error: 'Fitur export CSV untuk order 1 per 1 telah dinonaktifkan. Silakan gunakan tombol "Export CSV Semua Order" di manajemen pesanan.'
      });
    }

    // Single order invoice Excel masih dapat diakses
    if (format === 'excel') {
      const { rows } = await db.query(`SELECT ${ORDER_DETAIL_COLUMNS} FROM orders WHERE id = $1`, [id]);
      if (!rows.length) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = normalizeOrder(rows[0]);
      const safeId = String(order.id).replace(/[^a-zA-Z0-9_-]/g, '-');
      const html = buildExcelHtml(order);
      return res
        .status(200)
        .setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
        .setHeader('Content-Disposition', `attachment; filename="invoice-${safeId}.xls"`)
        .send(`\uFEFF${html}`);
    }

    return res.status(400).json({ error: 'Format tidak didukung' });
  }

  // EXPORT CSV UNTUK SEMUA ORDER (ATAU FILTER STATUS)
  let querySql = `SELECT ${ORDER_DETAIL_COLUMNS} FROM orders`;
  const queryParams = [];

  if (status && status !== 'all') {
    querySql += ` WHERE status = $1`;
    queryParams.push(status);
  }

  querySql += ` ORDER BY date DESC`;

  const { rows } = await db.query(querySql, queryParams);
  const csv = buildAllOrdersCsv(rows);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = (status && status !== 'all') 
    ? `pesanan-${status}-aika-${dateStr}.csv` 
    : `semua-pesanan-aika-${dateStr}.csv`;

  return res
    .status(200)
    .setHeader('Content-Type', 'text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
};
