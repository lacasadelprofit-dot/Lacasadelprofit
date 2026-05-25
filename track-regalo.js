// Registra el click en regalo_eventos y redirige al PDF
// GET /api/track-regalo?rid=<id>&canal=<canal>

const SUPA_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

const headers = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

module.exports = async function handler(req, res) {
  const { rid, canal } = req.query || {};

  if (!rid) { res.status(400).send('Falta rid'); return; }

  // Buscar el regalo en Supabase
  let pdfUrl = null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/regalos?id=eq.${encodeURIComponent(rid)}&select=id,data&limit=1`, { headers });
    if (r.ok) {
      const rows = await r.json();
      pdfUrl = rows?.[0]?.data?.pdfUrl || null;
    }
  } catch (e) {
    console.error('track-regalo fetch:', e.message);
  }

  // Registrar el evento (sin bloquear el redirect)
  try {
    fetch(`${SUPA_URL}/rest/v1/regalo_eventos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: {
        tipo: 'descarga',
        regaloId: rid,
        canal: canal || 'directo',
        fecha: new Date().toISOString().split('T')[0],
        ts: new Date().toISOString()
      }})
    }).catch(() => {});
  } catch (e) {}

  if (!pdfUrl) {
    res.status(404).send('Regalo no encontrado o sin URL configurada');
    return;
  }

  res.redirect(302, pdfUrl);
};
