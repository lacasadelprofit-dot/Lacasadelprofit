const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function supaFetch(table, select) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/rest/v1/${table}?select=${encodeURIComponent(select)}`, SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) && parsed.message) {
            reject(new Error(`Supabase error on "${table}": ${parsed.message} (hint: ${parsed.hint||'none'})`));
          } else {
            resolve(Array.isArray(parsed) ? parsed : []);
          }
        } catch(e) {
          reject(new Error(`JSON parse error on "${table}": ${e.message}`));
        }
      });
    });
    req.on('error', err => reject(new Error(`Network error on "${table}": ${err.message}`)));
    req.setTimeout(8000, () => { req.destroy(); reject(new Error(`Timeout on "${table}"`)); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'SUPABASE_SERVICE_KEY no configurada en variables de entorno de Vercel.'
    });
  }

  try {
    const [sesRows, serRows] = await Promise.all([
      supaFetch('sessions', 'data'),
      supaFetch('seres', 'data')
    ]);

    const sessions = sesRows.map(r => (r && typeof r === 'object' ? (r.data || r) : null)).filter(Boolean);
    const seres    = serRows.map(r => (r && typeof r === 'object' ? (r.data || r) : null)).filter(Boolean);

    const compSes = sessions.filter(s => (s.estado || 'Completado') === 'Completado');

    const sorted = [...compSes].sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha) : 0;
      const db = b.fecha ? new Date(b.fecha) : 0;
      return da - db;
    });

    const OBJ_LIST = [100,300,500,1000,3000,5000,10000,30000,50000,100000,300000,500000,1000000];
    const milestoneDates = {};
    OBJ_LIST.forEach(m => {
      if (sorted[m - 1]) milestoneDates[m] = sorted[m - 1].fecha;
    });

    const stats = {
      totalSesiones: compSes.length,
      totalSeres:    seres.filter(s => !s.prospecto).length,
      primeraVez:    compSes.filter(s => s.primeraVez).length,
      milestoneDates,
      _meta: {
        rawSessions: sesRows.length,
        rawSeres:    serRows.length,
        completadas: compSes.length
      }
    };

    res.status(200).json({ ok: true, data: stats });
  } catch (e) {
    console.error('vision-stats error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
