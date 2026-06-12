// Vercel Serverless Function — Génération de légendes IA via Anthropic Claude
// POST /api/caption  { imageUrl: "https://..." }
// → { caption: "Une légende poétique..." }

// Rate-limit mémoire (best-effort, reset au cold-start)
// Pour production durable, utiliser Upstash Redis / Vercel KV
const _rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1 minute
const RATE_LIMIT_MAX       = 10;         // 10 req / minute / IP

function _checkRateLimit(ip) {
  const now = Date.now();
  const entry = _rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  entry.count++;
  _rateLimitMap.set(ip, entry);
  // Purge périodique (évite la croissance infinie)
  if (_rateLimitMap.size > 500) {
    for (const [k, v] of _rateLimitMap) if (now > v.resetAt) _rateLimitMap.delete(k);
  }
  return entry.count <= RATE_LIMIT_MAX;
}

// Origines autorisées (ajuste selon ton domaine Vercel)
// Par défaut : n'importe quel *.vercel.app + localhost + domaine configurable via env.
const ALLOWED_ORIGIN_REGEX = /^https:\/\/([a-z0-9-]+\.)?vercel\.app$|^http:\/\/localhost(:\d+)?$/i;

function _resolveOrigin(req) {
  const origin = req.headers.origin || '';
  const envAllow = process.env.ALLOWED_ORIGIN;
  if (envAllow && origin === envAllow) return origin;
  if (ALLOWED_ORIGIN_REGEX.test(origin)) return origin;
  return null;
}

export default async function handler(req, res) {
  // CORS restreint
  const origin = _resolveOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });
  if (!origin)                  return res.status(403).json({ error: 'Origin not allowed' });

  // Rate-limit par IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.socket?.remoteAddress || 'unknown';
  if (!_checkRateLimit(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { imageUrl } = req.body || {};
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });

  // Validation URL : éviter SSRF (URL uniquement HTTPS + non locale)
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== 'https:') return res.status(400).json({ error: 'https only' });
    // Bloquer les adresses locales / IP internes
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') ||
        host.startsWith('192.168.') || host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return res.status(400).json({ error: 'URL not allowed' });
    }
  } catch { return res.status(400).json({ error: 'invalid imageUrl' }); }

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    if (buffer.byteLength > 4 * 1024 * 1024) {
      return res.status(200).json({ caption: '' });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType.split(';')[0],
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Tu es le narrateur chaleureux d'un diaporama d'anniversaire. Décris cette photo en UNE SEULE phrase courte (max 15 mots), festive et émouvante, en français. Style : légende de fête, joyeuse et affectueuse. Ne commence pas par "Une" ou "Un". Ne décris pas techniquement la photo. Capture l'émotion, le sourire, le moment.`,
            },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return res.status(200).json({ caption: '' });
    }

    const data = await anthropicRes.json();
    const caption = data.content?.[0]?.text?.trim() || '';
    const cleaned = caption.replace(/^["«]|["»]$/g, '').trim();

    return res.status(200).json({ caption: cleaned });
  } catch (e) {
    console.error('Caption error:', e.message);
    return res.status(200).json({ caption: '' });
  }
}
