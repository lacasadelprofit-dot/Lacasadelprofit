// /api/gsc-sync — trae de Google Search Console qué buscó la gente para encontrar juancruzconsciencia.lat
// y lo guarda en Supabase (tabla redes_metricas, fila gsc-semana-AAAA-MM-DD). El resumen de Telegram
// de los lunes lo lee (ver 4_BASE_DE_DATOS/53_resumen_google.sql).
//
// Variables de entorno en Vercel (proyecto del admin):
//   GSC_SA_B64            clave JSON del usuario robot (cuenta de servicio) en base64
//                         Google Cloud: proyecto "lacasadelprofit" → lector-search-console@lacasadelprofit.iam.gserviceaccount.com
//                         (ese mail tiene que estar en Search Console → Configuración → Usuarios, permiso Restringido)
//   SUPABASE_SERVICE_KEY  (ya existe)
//   CRON_SECRET           (para llamarla a mano: Authorization: Bearer <CRON_SECRET>)
//
// Corre sola los lunes 09:00 UTC (06:00 Brasil), antes del resumen de las 06:30.
// Google publica los datos con ~3 días de atraso: se toma la semana de 7 días que termina hace 3 días.

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SITIO = 'https://www.juancruzconsciencia.lat/';

function esCron(req) {
  const auth = req.headers.authorization || '';
  return !!req.headers['x-vercel-cron'] || !!(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
}

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function tokenGoogle() {
  const sa = JSON.parse(Buffer.from(process.env.GSC_SA_B64 || '', 'base64').toString('utf8'));
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600
  }));
  const firma = b64url(crypto.createSign('RSA-SHA256').update(cab + '.' + cuerpo).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + cab + '.' + cuerpo + '.' + firma
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google no dio acceso: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

async function consulta(token, desde, hasta, dimensiones, filas) {
  const r = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SITIO) + '/searchAnalytics/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: desde, endDate: hasta, dimensions: dimensiones, rowLimit: filas, dataState: 'final' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
    throw new Error(r.status === 403 ? 'Sin permiso en Search Console: falta sumar al robot como usuario (Restringido). ' + msg : msg);
  }
  return j.rows || [];
}

const dia = d => d.toISOString().slice(0, 10);
const r1 = x => Math.round((x || 0) * 10) / 10;

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!esCron(req)) return res.status(401).json({ ok: false, error: 'Solo cron o Bearer CRON_SECRET' });
  if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Falta SUPABASE_SERVICE_KEY en Vercel.' });
  if (!process.env.GSC_SA_B64) return res.status(500).json({ ok: false, error: 'Falta GSC_SA_B64 en Vercel.' });
  try {
    const fin = new Date(Date.now() - 3 * 86400000);
    const ini = new Date(fin.getTime() - 6 * 86400000);
    const desde = dia(ini), hasta = dia(fin);
    const token = await tokenGoogle();
    const [tot, qs, pags, paises] = await Promise.all([
      consulta(token, desde, hasta, [], 1),
      consulta(token, desde, hasta, ['query'], 10),
      consulta(token, desde, hasta, ['page'], 5),
      consulta(token, desde, hasta, ['country'], 5)
    ]);
    const t = tot[0] || {};
    const data = {
      fuente: 'gsc', desde, hasta, ts: new Date().toISOString(),
      clics: t.clicks || 0, impresiones: t.impressions || 0, posicion: r1(t.position),
      consultas: qs.map(x => ({ q: x.keys[0], clics: x.clicks, imp: x.impressions, pos: r1(x.position) })),
      paginas: pags.map(x => ({ url: x.keys[0].replace(SITIO, '/'), clics: x.clicks, imp: x.impressions })),
      paises: paises.map(x => ({ pais: x.keys[0], clics: x.clicks, imp: x.impressions }))
    };
    const w = await fetch(SUPABASE_URL + '/rest/v1/redes_metricas?on_conflict=id', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify([{ id: 'gsc-semana-' + desde, data }])
    });
    if (!w.ok) throw new Error('No se pudo guardar en Supabase: ' + w.status + ' ' + (await w.text()).slice(0, 200));
    return res.status(200).json({ ok: true, desde, hasta, clics: data.clics, impresiones: data.impresiones, consultas: data.consultas.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
