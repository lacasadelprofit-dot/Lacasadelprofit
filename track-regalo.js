// Registra una descarga de regalo y redirige al PDF real
// GET /api/track-regalo?rid=REGALO_ID&sn=SER_NOMBRE&se=SER_EMAIL

const SUPA_URL  = process.env.SUPABASE_URL  || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_A1rJIiXHSg6TQYT2gKQHUw_UTwmS76t';

const headers = {
  'apikey': SUPA_ANON,
  'Authorization': 'Bearer ' + SUPA_ANON,
  'Content-Type': 'application/json'
};

module.exports = async function handler(req, res) {
  const { rid, sn = '', se = '' } = req.query;

  if (!rid) { res.status(400).send('Falta rid'); return; }

  // Obtener el regalo para conseguir la URL del PDF
  let pdfUrl = null;
  let regaloNombre = '';
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/regalos?id=eq.${encodeURIComponent(rid)}&select=id,data`,
      { headers }
    );
    const [row] = await r.json();
    pdfUrl       = row?.data?.pdfUrl || null;
    regaloNombre = row?.data?.nombre || '';
  } catch (e) {
    console.error('track-regalo fetch:', e.message);
  }

  if (!pdfUrl) { res.status(404).send('PDF no encontrado'); return; }

  // Registrar el evento (fire and forget)
  fetch(`${SUPA_URL}/rest/v1/regalo_eventos`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      data: {
        regaloId:     rid,
        regaloNombre,
        tipo:         'descarga',
        serNombre:    decodeURIComponent(sn),
        serEmail:     decodeURIComponent(se),
        fecha:        new Date().toISOString().split('T')[0]
      }
    })
  }).catch(() => {});

  // Redirigir al PDF real
  res.redirect(302, pdfUrl);
};
