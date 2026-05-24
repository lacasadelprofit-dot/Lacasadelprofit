// Login del portal: busca ser por email y valida código
// POST /api/do-login

const SUPA_URL = process.env.SUPABASE_URL  || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

const headers = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

async function sbGet(table, filter) {
  const q = filter ? `${filter}&select=id,data` : 'select=id,data';
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${q}`, { headers });
  if (!res.ok) { const t = await res.text(); throw new Error(`${table}: ${res.status} ${t}`); }
  return res.json();
}
function unwrap(rows) { return rows.map(r => ({ id: r.id, ...(r.data || {}) })); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).end(); return; }

  const { email, code } = req.body || {};
  if (!email || !code) { res.status(400).json({ error: 'Falta email o código' }); return; }

  const emailNorm = email.trim().toLowerCase();
  const codeNorm  = code.trim().toUpperCase().replace(/\s/g, '');

  try {
    const seresRaw = await sbGet('seres', `data->>email=ilike.${encodeURIComponent(emailNorm)}`);
    const seres = unwrap(seresRaw);
    if (!seres.length) { res.status(401).json({ error: 'nf' }); return; }
    const ser = seres[0];

    const inscRaw = await sbGet('inscripciones', `data->>serId=eq.${encodeURIComponent(ser.id)}`);
    const inscList = unwrap(inscRaw);
    const insc = inscList.find(i => String(i.code || '').trim().toUpperCase() === codeNorm);
    if (!insc) { res.status(401).json({ error: 'bc' }); return; }

    const progs = unwrap(await sbGet('programas', ''));
    let sessions = [];
    try { sessions = unwrap(await sbGet('sessions', `data->>serId=eq.${encodeURIComponent(ser.id)}`)); } catch {}

    res.status(200).json({ ok: true, ser, inscList, progs, sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
