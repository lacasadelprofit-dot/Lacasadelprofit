// Persiste el progreso del portal en la inscripción de Supabase
// POST /api/save-progreso

const SUPA_URL  = process.env.SUPABASE_URL  || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

const headers = {
  'apikey': SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).end(); return; }

  const { recordId, code, progreso = {}, extraData = {} } = req.body || {};
  if (!recordId) { res.status(400).json({ error: 'Falta recordId' }); return; }

  try {
    const getRes = await fetch(
      `${SUPA_URL}/rest/v1/inscripciones?id=eq.${encodeURIComponent(recordId)}&select=id,data`,
      { headers }
    );
    const rows = await getRes.json();
    const row  = Array.isArray(rows) ? rows[0] : null;
    if (!row) { res.status(404).json({ error: 'Inscripción no encontrada' }); return; }

    const existing = row.data || {};
    if (code && existing.code && String(existing.code).trim().toUpperCase() !== String(code).trim().toUpperCase()) {
      res.status(403).json({ error: 'Código incorrecto' }); return;
    }

    const merged = {
      ...existing,
      progreso:        progreso || existing.progreso || {},
      habTrack:        extraData.habTrack        ?? existing.habTrack        ?? {},
      desTrack:        extraData.desTrack        ?? existing.desTrack        ?? {},
      habitosElegidos: (extraData.habitosElegidos && Object.keys(extraData.habitosElegidos).length) ? extraData.habitosElegidos : (existing.habitosElegidos ?? {}),
      paraQue:         extraData.paraQue         ?? existing.paraQue         ?? '',
      resultadoDeseado:extraData.resultadoDeseado?? existing.resultadoDeseado?? '',
      comunicacion:    mergeByContent(existing.comunicacion, extraData.comunicacion),
      notasSer:        mergeByContent(existing.notasSer, extraData.notasSer),
    };

    const patchRes = await fetch(
      `${SUPA_URL}/rest/v1/inscripciones?id=eq.${encodeURIComponent(recordId)}`,
      { method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' }, body: JSON.stringify({ data: merged }) }
    );

    if (!patchRes.ok) {
      const txt = await patchRes.text();
      res.status(500).json({ error: 'Error al guardar', detail: txt }); return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function mergeByContent(base = [], incoming = []) {
  if (!incoming || !incoming.length) return base || [];
  const result = [...(base || [])];
  const fps = new Set(result.map(x => `${x.fecha}|${x.de}|${(x.texto||'').slice(0,60)}`));
  for (const item of incoming) {
    const fp = `${item.fecha}|${item.de}|${(item.texto||'').slice(0,60)}`;
    if (!fps.has(fp)) { result.push(item); fps.add(fp); }
  }
  return result;
}
