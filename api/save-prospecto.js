// Guarda prospectos desde formularios públicos (JCC, registro, etc.)
// Corre server-side en Vercel → sin CORS, sin RLS
const https = require('https');

const SUPA_HOST = 'vffmnyjjawvvctcqzkvj.supabase.co';
// Usa service key si está configurada en env, sino usa la anon key
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY
               || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function supaInsert(row) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify([row]);
    const req = https.request({
      hostname: SUPA_HOST,
      path: '/rest/v1/seres',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Prefer': 'return=minimal'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const ser = await readBody(req);
    if (!ser || !ser.nombre) {
      res.status(400).json({ ok: false, error: 'Nombre requerido' });
      return;
    }

    const id  = ser.id || String(Date.now() + Math.floor(Math.random() * 1000));
    const row = {
      id,
      data: { ...ser, id, prospecto: true },
      updated_at: new Date().toISOString()
    };

    const result = await supaInsert(row);

    if (result.status >= 400) {
      console.error('Supabase error', result.status, result.data);
      res.status(200).json({ ok: false, supaStatus: result.status, detail: result.data });
      return;
    }

    res.status(200).json({ ok: true, id });
  } catch (e) {
    console.error('save-prospecto error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
