const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

async function upstashGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const json = await res.json();
  if (!json.result) return null;
  try { return JSON.parse(json.result); } catch { return json.result; }
}

async function upstashSet(key, value) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  const res = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encoded}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const json = await res.json();
  return json;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });

  try {
    if (req.method === 'GET') {
      const value = await upstashGet(key);
      return res.status(200).json({ data: value });
    }

    if (req.method === 'POST') {
      const { value } = req.body;
      const result = await upstashSet(key, value);
      if (result.error) return res.status(500).json({ error: result.error });
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    console.error('data.js error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
