const { query } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const year = req.query.year || new Date().getFullYear();
      const format = req.query.format || 'json'; // json, csv, excel

      // Fetch all paid/completed orders for the year (include paid, shipped, completed)
      const result = await query(
        `SELECT 
          id, items, total, date, status
         FROM orders 
         WHERE status IN ('paid', 'shipped', 'completed') 
         AND EXTRACT(YEAR FROM date) = $1
         ORDER BY date ASC`,
        [year]
      );

      // Process data: group by month and product
      const monthlyReport = {};
      const productStats = {}; // Overall product stats

      // Initialize months (1-12)
      for (let m = 1; m <= 12; m++) {
        monthlyReport[m] = {};
      }

      // Parse and aggregate data
      result.rows.forEach(order => {
        try {
          const items = Array.isArray(order.items) ? order.items : 
                       typeof order.items === 'string' ? JSON.parse(order.items) : [];
          
          const orderDate = new Date(order.date);
          const month = orderDate.getMonth() + 1; // 1-12

          items.forEach(item => {
            const productId = item.id || item.product_id || 'Unknown';
            const productName = item.name || 'Unknown';
            const quantity = item.qty || item.quantity || 0;
            const price = item.price || 0;
            const total = price * quantity;

            // Initialize product in month if needed
            if (!monthlyReport[month][productId]) {
              monthlyReport[month][productId] = {
                id: productId,
                name: productName,
                quantity: 0,
                revenue: 0,
                units: 0
              };
            }

            // Aggregate monthly data
            monthlyReport[month][productId].quantity += quantity;
            monthlyReport[month][productId].revenue += total;
            monthlyReport[month][productId].units += 1;

            // Aggregate overall stats
            if (!productStats[productId]) {
              productStats[productId] = {
                id: productId,
                name: productName,
                totalQuantity: 0,
                totalRevenue: 0,
                totalOrders: 0
              };
            }
            productStats[productId].totalQuantity += quantity;
            productStats[productId].totalRevenue += total;
            productStats[productId].totalOrders += 1;
          });
        } catch (e) {
          console.error('Error parsing order items:', e);
        }
      });

      // Format response
      if (format === 'csv') {
        return res.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8').
          setHeader('Content-Disposition', `attachment; filename="laporan-penjualan-${year}.csv"`).
          send(generateCSV(monthlyReport, productStats, year));
      } else if (format === 'excel') {
        // For now, return CSV (true Excel generation requires library like xlsx)
        return res.status(200).setHeader('Content-Type', 'text/csv; charset=utf-8').
          setHeader('Content-Disposition', `attachment; filename="laporan-penjualan-${year}.xlsx"`).
          send(generateCSV(monthlyReport, productStats, year));
      } else {
        // JSON response
        return res.status(200).json({
          year,
          generated: new Date().toISOString(),
          monthly: monthlyReport,
          summary: productStats
        });
      }

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Sales report API error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};

// Generate CSV format
function generateCSV(monthlyReport, productStats, year) {
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  let csv = `LAPORAN PENJUALAN BULANAN AIKA SESILIA - TAHUN ${year}\n`;
  csv += `Generated: ${new Date().toLocaleString('id-ID')}\n\n`;

  // Get all unique products
  const allProducts = {};
  Object.values(productStats).forEach(product => {
    allProducts[product.id] = product.name;
  });

  // Header
  csv += 'BULAN,';
  Object.values(allProducts).forEach(name => {
    csv += `"${name} (Qty)","${name} (Rp)",`;
  });
  csv += 'Total Bulan (Rp)\n';

  // Monthly data
  let grandTotal = 0;
  for (let month = 1; month <= 12; month++) {
    csv += `${monthNames[month]},`;
    let monthTotal = 0;

    Object.keys(allProducts).forEach(productId => {
      const product = monthlyReport[month][productId];
      if (product) {
        csv += `${product.quantity},"${formatCurrency(product.revenue)}",`;
        monthTotal += product.revenue;
      } else {
        csv += `0,"Rp 0",`;
      }
    });

    csv += `"${formatCurrency(monthTotal)}"\n`;
    grandTotal += monthTotal;
  }

  csv += '\n';
  csv += 'RINGKASAN PENJUALAN PER PRODUK\n';
  csv += 'Produk,Total Qty,Total Revenue,Total Orders\n';
  
  Object.values(productStats).forEach(product => {
    csv += `"${product.name}",${product.totalQuantity},"${formatCurrency(product.totalRevenue)}",${product.totalOrders}\n`;
  });

  csv += `\nTOTAL PENJUALAN TAHUNAN: Rp ${formatCurrency(grandTotal).replace('Rp ', '')}\n`;

  return csv;
}

function formatCurrency(amount) {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}
