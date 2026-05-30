import { put } from '@vercel/blob';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-file-name,x-file-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const fileName = decodeURIComponent(req.headers['x-file-name'] || 'file');
    const fileType = req.headers['x-file-type'] || 'application/octet-stream';
    const date = new Date();
    const folder = `koni-chat/${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const safeName = encodeURIComponent(fileName);
    const blobPath = `${folder}/${Date.now()}_${safeName}`;

    const blob = await put(blobPath, req, {
      access: 'public',
      contentType: fileType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return res.status(200).json({
      url: blob.url,
      name: fileName,
      size: `${(parseInt(req.headers['content-length']||0)/1024/1024).toFixed(1)}MB`,
      type: fileName.split('.').pop().toLowerCase(),
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'アップロードに失敗しました' });
  }
}
