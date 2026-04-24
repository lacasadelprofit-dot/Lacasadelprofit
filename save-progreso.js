// Guarda el progreso de un participante en su inscripción de programa
// Requiere: SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel env vars

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

function supabaseGet(table, id) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id,data`, SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { recordId, progreso, extraData } = req.body || {};
    if (!recordId) { res.status(400).json({ error: 'Falta recordId' }); return; }
    if (!progreso)  { res.status(400).json({ error: 'Falta progreso' }); return; }

    if (!SUPABASE_SERVICE_KEY) {
      console.warn('SUPABASE_SERVICE_KEY no configurada');
      res.status(200).json({ ok: true, warning: 'No service key' });
      return;
    }

    // Get existing record to merge safely
    const existing = await supabaseGet('inscripciones', recordId);
    let currentData = {};
    if (existing.status === 200) {
      try {
        const rows = JSON.parse(existing.data);
        if (rows.length) currentData = rows[0].data || {};
      } catch(e) { /* ignore */ }
    }

    const merged = { ...currentData, progreso, ...(extraData||{}) };
    const result = await supabasePatch('inscripciones', recordId, {
      data: merged,
      updated_at: new Date().toISOString()
    });

    console.log(`save-progreso → inscripciones/${recordId}: HTTP ${result.status}`);
    res.status(200).json({ ok: true, status: result.status });
  } catch (e) {
    console.error('save-progreso error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
