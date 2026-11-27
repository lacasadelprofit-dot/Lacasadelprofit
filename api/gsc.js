// /api/gsc?dias=N — datos de Google Search Console para el admin (Marketing → Stats Landing → 🔎 Google).
// Solo responde a una sesión del admin (Authorization: Bearer <access_token de Supabase>).
// Usa la misma cuenta de servicio que /api/gsc-sync (variable GSC_SA_B64 en Vercel).
// Devuelve el JSON que espera el admin (ver _gscCargar en 1_ADMINISTRACION/index.html):
// { sitio, desde, hasta, total, anterior, porDia, consultas, paginas, paises, dispositivos, sitemaps }
// Google publica los datos con ~2–3 días de atraso: el período termina hace 2 días.

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SITIO = 'https://www.juancruzconsciencia.lat/';

async function esAdmin(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth } });
  return r.ok;
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

const API = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(SITIO);
async function consulta(token, desde, hasta, dimensiones, filas) {
  const r = await fetch(API + '/searchAnalytics/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: desde, endDate: hasta, dimensions: dimensiones, rowLimit: filas, dataState: 'all' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
    throw new Error(r.status === 403 ? 'Sin permiso en Search Console: falta sumar al robot como usuario (Restringido). ' + msg : msg);
  }
  return j.rows || [];
}
async function sitemaps(token) {
  try {
    const r = await fetch(API + '/sitemaps', { headers: { Authorization: 'Bearer ' + token } });
    const j = await r.json().catch(() => ({}));
    return (j.sitemap || []).map(s => ({
      path: s.path, enviado: s.lastSubmitted || null, leido: s.lastDownloaded || null, pendiente: !!s.isPending,
      errores: +s.errors || 0, avisos: +s.warnings || 0,
      contenido: (s.contents || []).map(c => ({ tipo: c.type, enviados: +c.submitted || 0, indexados: +c.indexed || 0 }))
    }));
  } catch (_) { return []; }
}

const dia = d => d.toISOString().slice(0, 10);
const r2 = x => Math.round((x || 0) * 100) / 100;
const fila = (x, k) => ({ ...(k ? { k } : {}), clics: x.clicks || 0, impresiones: x.impressions || 0, ctr: x.ctr || 0, posicion: r2(x.position) });
const tot = rows => rows[0] ? fila(rows[0]) : { clics: 0, impresiones: 0, ctr: 0, posicion: 0 };

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_KEY en Vercel.' });
  if (!(await esAdmin(req))) return res.status(401).json({ error: 'Entrá al admin para ver estos datos.' });
  if (!process.env.GSC_SA_B64) return res.status(500).json({ error: 'Falta GSC_SA_B64 en Vercel (la clave del robot de Search Console).' });
  try {
    const dias = Math.min(480, Math.max(1, parseInt((req.query && req.query.dias) || '28', 10) || 28));
    const fin = new Date(Date.now() - 2 * 86400000), ini = new Date(fin.getTime() - (dias - 1) * 86400000);
    const finAnt = new Date(ini.getTime() - 86400000), iniAnt = new Date(finAnt.getTime() - (dias - 1) * 86400000);
    const desde = dia(ini), hasta = dia(fin);
    const token = await tokenGoogle();
    const [t, ta, pd, qs, pg, ps, dv, sm] = await Promise.all([
      consulta(token, desde, hasta, [], 1),
      consulta(token, dia(iniAnt), dia(finAnt), [], 1),
      consulta(token, desde, hasta, ['date'], 500),
      consulta(token, desde, hasta, ['query'], 100),
      consulta(token, desde, hasta, ['page'], 25),
      consulta(token, desde, hasta, ['country'], 15),
      consulta(token, desde, hasta, ['device'], 5),
      sitemaps(token)
    ]);
    return res.status(200).json({
      sitio: SITIO, desde, hasta,
      total: tot(t), anterior: tot(ta),
      porDia: pd.map(x => ({ fecha: x.keys[0], ...fila(x) })),
      consultas: qs.map(x => fila(x, x.keys[0])),
      paginas: pg.map(x => fila(x, x.keys[0].replace(SITIO, '/'))),
      paises: ps.map(x => fila(x, x.keys[0])),
      dispositivos: dv.map(x => fila(x, x.keys[0])),
      sitemaps: sm
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
