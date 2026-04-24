// Guarda el formulario de integración en sessions o seres
// Requiere: SUPABASE_URL y SUPABASE_SERVICE_KEY en variables de entorno de Vercel

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function supabasePatch(table, id, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const url = new URL(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
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
    const { table = 'sessions', recordId, intakeData, fullData } = req.body || {};
    if (!recordId) { res.status(400).json({ error: 'Falta recordId' }); return; }

    if (!SUPABASE_SERVICE_KEY) {
      console.warn('SUPABASE_SERVICE_KEY no configurada');
      res.status(200).json({ ok: true, warning: 'No service key' });
      return;
    }

    const merged = { ...(fullData || {}), ...(intakeData || {}) };
    const result = await supabasePatch(table, recordId, {
      data: merged,
      updated_at: new Date().toISOString()
    });

    console.log(`save-intake → ${table}/${recordId}: HTTP ${result.status}`);
    res.status(200).json({ ok: true, status: result.status });
  } catch (e) {
    console.error('save-intake error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
