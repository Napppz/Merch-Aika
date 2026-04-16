function getBoundary(contentType = '') {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match ? (match[1] || match[2]) : null;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseHeaders(headerText) {
  const headers = {};
  for (const line of headerText.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function parseContentDisposition(value = '') {
  const nameMatch = /name="([^"]+)"/i.exec(value);
  const fileNameMatch = /filename="([^"]*)"/i.exec(value);
  return {
    name: nameMatch ? nameMatch[1] : null,
    filename: fileNameMatch ? fileNameMatch[1] : null
  };
}

async function parseMultipartForm(req) {
  const boundary = getBoundary(req.headers['content-type'] || '');
  if (!boundary) {
    throw new Error('Boundary multipart tidak ditemukan');
  }

  const bodyBuffer = await readRequestBody(req);
  const bodyText = bodyBuffer.toString('latin1');
  const boundaryText = `--${boundary}`;
  const rawParts = bodyText.split(boundaryText);
  const parts = [];

  for (const rawPart of rawParts) {
    if (!rawPart || rawPart === '--\r\n' || rawPart === '--') continue;

    let partText = rawPart;
    if (partText.startsWith('\r\n')) partText = partText.slice(2);
    if (partText.endsWith('\r\n')) partText = partText.slice(0, -2);
    if (partText.endsWith('--')) partText = partText.slice(0, -2);

    const separatorIndex = partText.indexOf('\r\n\r\n');
    if (separatorIndex === -1) continue;

    const headerText = partText.slice(0, separatorIndex);
    const contentText = partText.slice(separatorIndex + 4);
    const headers = parseHeaders(headerText);
    const disposition = parseContentDisposition(headers['content-disposition']);

    parts.push({
      headers,
      name: disposition.name,
      filename: disposition.filename,
      contentType: headers['content-type'] || 'text/plain',
      data: Buffer.from(contentText, 'latin1')
    });
  }

  return parts;
}

module.exports = {
  parseMultipartForm
};
