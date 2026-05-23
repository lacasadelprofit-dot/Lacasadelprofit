// Login del portal: busca ser por email y valida código de inscripción
// POST /api/do-login
// Body: { email, code }
// Response: { ok, ser, inscList, progs, sessions } | { error }

const SUPA_URL = process.env.SUPABASE_URL  || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

const headers = {
  'apikey': SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json'
};

async function sbGet(table, filter) {
  const q = filter ? `${filter}&select=id,data` : 'select=id,data';
  const url = `${SUPA_URL}/rest/v1/${table}?${q}`;
  const res = await fetch(url, { headers });
  if (!res.ok) { const t = await res.text(); throw new Error(`${table}: ${res.status} ${t}`); }
  return res.json();
}

function unwrap(rows) {
  return rows.map(r => ({ id: r.id, ...(r.data || {}) }));
}

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
    // 1. Buscar ser por email (case-insensitive usando ilike en PostgREST)
    const seresRaw = await sbGet('seres', `data->>email=ilike.${encodeURIComponent(emailNorm)}`);
    const seres = unwrap(seresRaw);
    if (!seres.length) { res.status(401).json({ error: 'nf' }); return; }
    const ser = seres[0];

    // 2. Buscar inscripciones del ser
    const inscRaw = await sbGet('inscripciones', `data->>serId=eq.${encodeURIComponent(ser.id)}`);
    const inscList = unwrap(inscRaw);

    // 3. Validar código
    const insc = inscList.find(i => String(i.code || '').trim().toUpperCase() === codeNorm);
    if (!insc) { res.status(401).json({ error: 'bc' }); return; }

    // 4. Cargar programas
    const progsRaw = await sbGet('programas', '');
    const progs = unwrap(progsRaw);

    // 5. Cargar sesiones (no crítico)
    let sessions = [];
    try {
      const sesRaw = await sbGet('sessions', `data->>serId=eq.${encodeURIComponent(ser.id)}`);
      sessions = unwrap(sesRaw);
    } catch {}

    res.status(200).json({ ok: true, ser, inscList, progs, sessions });
  } catch (e) {
    console.error('do-login:', e.message);
    res.status(500).json({ error: e.message });
  }
};
