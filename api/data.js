const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });

  try {
    // GET: Redisから取得
    if (req.method === 'GET') {
      const r = await fetch(
        `${UPSTASH_URL}/get/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
      );
      const data = await r.json();
      let value = null;
      if (data.result !== null && data.result !== undefined) {
        try {
          value = JSON.parse(data.result);
        } catch {
          value = data.result;
        }
      }
      return res.status(200).json({ data: value });
    }

    // POST: Redisに保存
    if (req.method === 'POST') {
      const { value } = req.body;
      // 1回だけJSON.stringifyする
      const r = await fetch(
        `${UPSTASH_URL}/set/${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(JSON.stringify(value))
        }
      );
      const result = await r.json();
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
