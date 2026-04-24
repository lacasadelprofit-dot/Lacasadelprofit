// Guarda un nuevo prospecto desde el formulario público de registro
// Requiere: SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel env vars

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function supabaseInsert(table, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify([body]);
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const serData = req.body || {};
    if (!serData.nombre || !serData.email) {
      res.status(400).json({ error: 'Nombre y email son requeridos' });
      return;
    }

    if (!SUPABASE_SERVICE_KEY) {
      console.warn('SUPABASE_SERVICE_KEY no configurada');
      res.status(200).json({ ok: true, warning: 'No service key' });
      return;
    }

    const id = String(Date.now() + Math.floor(Math.random() * 1000));
    const result = await supabaseInsert('seres', {
      id,
      data: { ...serData, id, prospecto: true },
      updated_at: new Date().toISOString()
    });

    if (result.status >= 400) {
      res.status(result.status).json({ error: 'Error de base de datos', detail: result.data });
      return;
    }

    res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('save-prospecto error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
