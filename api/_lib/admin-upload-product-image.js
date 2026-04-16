const { requireAdmin } = require('./admin-auth');
const { parseMultipartForm } = require('./multipart');
const { uploadImageBuffer } = require('./r2-storage');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type harus multipart/form-data'
      });
    }

    const parts = await parseMultipartForm(req);
    const imagePart = parts.find(part => part.name === 'image' && part.filename);

    if (!imagePart) {
      return res.status(400).json({
        success: false,
        error: 'File gambar dengan field "image" wajib dikirim'
      });
    }

    const uploaded = await uploadImageBuffer({
      buffer: imagePart.data,
      mimeType: imagePart.contentType.toLowerCase(),
      fileName: imagePart.filename,
      folder: 'products',
      prefix: req.admin.adminId ? String(req.admin.adminId) : null
    });

    return res.status(200).json({
      success: true,
      imageUrl: uploaded.imageUrl,
      objectKey: uploaded.objectKey
    });
  } catch (err) {
    const status = /Tipe gambar|Ukuran gambar|File gambar kosong|Boundary multipart|Format/i.test(err.message) ? 400 : 500;
    console.error('Admin product image upload error:', err);
    return res.status(status).json({
      success: false,
      error: err.message || 'Gagal upload gambar produk'
    });
  }
};
