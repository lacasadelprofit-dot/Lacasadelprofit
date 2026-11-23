// /api/tiktok — conexión con TikTok (@juancruzconsciencia) y métricas en Supabase (tabla redes_metricas).
// Ver 4_BASE_DE_DATOS/41_redes_metricas.sql (tablas redes_metricas y redes_tokens).
//
// Variables de entorno en Vercel (proyecto del admin):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET   (de developers.tiktok.com → tu app)
//   TIKTOK_REDIRECT   (opcional) por defecto https://lacasadelprofit-hvis.vercel.app/api/tiktok
//                     → tiene que ser EXACTAMENTE la "Redirect URI" cargada en la app de TikTok
//   SUPABASE_SERVICE_KEY (ya existe)
//
// Acciones:
//   POST /api/tiktok?accion=conectar  (Bearer de sesión del admin) → {url} para autorizar la cuenta
//   GET  /api/tiktok?code=…&state=…   → TikTok vuelve acá después de autorizar; guarda el token
//   POST /api/tiktok?accion=sync      (Bearer de sesión del admin) → trae videos y métricas

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SK = process.env.SUPABASE_SERVICE_KEY || '';
const CK = process.env.TIKTOK_CLIENT_KEY || '';
const CS = process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT = process.env.TIKTOK_REDIRECT || 'https://lacasadelprofit-hvis.vercel.app/api/tiktok';
const SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const TT = 'https://open.tiktokapis.com/v2';

const supaH = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
async function supaGet(tabla, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?id=eq.${encodeURIComponent(id)}&select=data`, { headers: supaH });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) && j[0] ? j[0].data : null;
}
async function supaPut(tabla, filas) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?on_conflict=id`, {
    method: 'POST', headers: { ...supaH, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filas.map(f => ({ ...f, updated_at: new Date().toISOString() })))
  });
  if (!r.ok) throw new Error('Supabase: ' + (await r.text()).slice(0, 300));
}
// Reloj automático de Vercel (vercel.json → crons): actualiza todo a las 6:00 de Brasil, antes del resumen de Telegram.
// Mismo criterio que /api/backup-diario: header x-vercel-cron o "Authorization: Bearer <CRON_SECRET>".
function esCron(req) {
  const auth = req.headers.authorization || '';
  return !!req.headers['x-vercel-cron'] || !!(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
}

async function usuarioValido(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SK, Authorization: auth } });
  return r.ok;
}
async function pedirToken(params) {
  const r = await fetch(TT + '/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: CK, client_secret: CS, ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(j.error_description || j.error || ('TikTok token HTTP ' + r.status));
  return {
    access_token: j.access_token, refresh_token: j.refresh_token, open_id: j.open_id,
    vence: Date.now() + (j.expires_in || 86400) * 1000,
    refresh_vence: Date.now() + (j.refresh_expires_in || 31536000) * 1000
  };
}
async function tokenVigente() {
  const t = await supaGet('redes_tokens', 'tiktok');
  if (!t || !t.refresh_token) throw new Error('TikTok todavía no está conectado. Tocá «Conectar TikTok».');
  if (t.vence > Date.now() + 5 * 60 * 1000) return t.access_token;
  if (t.refresh_vence < Date.now()) throw new Error('La conexión con TikTok venció (dura 1 año). Volvé a tocar «Conectar TikTok».');
  const n = await pedirToken({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  await supaPut('redes_tokens', [{ id: 'tiktok', data: { ...t, ...n } }]);
  return n.access_token;
}
async function tt(path, token, opts = {}) {
  const r = await fetch(TT + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (j.error && j.error.code && j.error.code !== 'ok') throw new Error('TikTok: ' + (j.error.message || j.error.code));
  return j.data || {};
}
function pagina(res, titulo, texto, ok) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(ok ? 200 : 400).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><body style="font-family:system-ui,sans-serif;background:#0B0A07;color:#F0E6C8;display:grid;place-items:center;min-height:90vh;text-align:center;padding:20px">
<div><div style="font-size:52px">${ok ? '✅' : '⚠️'}</div><h2>${titulo}</h2><p style="color:#B0A580">${texto}</p>
<p><a href="/" style="color:#E8C766">Volver al admin</a></p></div></body>`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SK || !CK || !CS) {
    const falta = [!SK && 'SUPABASE_SERVICE_KEY', !CK && 'TIKTOK_CLIENT_KEY', !CS && 'TIKTOK_CLIENT_SECRET'].filter(Boolean).join(', ');
    return res.status(500).json({ ok: false, error: 'Faltan variables en Vercel: ' + falta });
  }
  const q = req.query || {};

  // 1) TikTok vuelve después de autorizar
  if (req.method === 'GET' && (q.code || q.error)) {
    try {
      if (q.error) return pagina(res, 'No se conectó TikTok', String(q.error_description || q.error), false);
      const pend = await supaGet('redes_tokens', 'tiktok-state');
      if (!pend || pend.state !== q.state || pend.vence < Date.now()) return pagina(res, 'Link vencido', 'Volvé al admin y tocá «Conectar TikTok» otra vez.', false);
      const t = await pedirToken({ grant_type: 'authorization_code', code: String(q.code), redirect_uri: REDIRECT });
      await supaPut('redes_tokens', [{ id: 'tiktok', data: { ...t, conectado: new Date().toISOString() } }, { id: 'tiktok-state', data: {} }]);
      return pagina(res, 'TikTok conectado', 'Ya podés cerrar esta pestaña y tocar «🔄 Actualizar ahora» en el admin.', true);
    } catch (e) { return pagina(res, 'No se pudo conectar TikTok', e.message, false); }
  }

  res.setHeader('Content-Type', 'application/json');
  const cron = esCron(req);
  if (cron && !q.accion) q.accion = 'sync';
  if (req.method !== 'POST' && !cron) return res.status(405).json({ ok: false, error: 'Usá POST' });
  if (!cron && !(await usuarioValido(req).catch(() => false))) return res.status(401).json({ ok: false, error: 'Sesión no válida. Volvé a entrar al admin.' });

  // 2) armar el link para autorizar la cuenta
  if (q.accion === 'conectar') {
    const state = crypto.randomBytes(16).toString('hex');
    await supaPut('redes_tokens', [{ id: 'tiktok-state', data: { state, vence: Date.now() + 15 * 60 * 1000 } }]);
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.search = new URLSearchParams({ client_key: CK, scope: SCOPES, response_type: 'code', redirect_uri: REDIRECT, state }).toString();
    return res.status(200).json({ ok: true, url: u.toString() });
  }

  // 3) traer videos y métricas
  if (q.accion === 'sync') {
    const inicio = Date.now();
    try {
      const token = await tokenVigente();
      const u = (await tt('/user/info/?fields=open_id,display_name,username,follower_count,following_count,likes_count,video_count', token)).user || {};
      const videos = [];
      let cursor = 0, mas = true;
      while (mas && videos.length < 2000 && Date.now() - inicio < 45000) { // todo el historial (Vercel corta a los 60 s)
        const d = await tt('/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count', token,
          { method: 'POST', body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) });
        videos.push(...(d.videos || []));
        mas = !!d.has_more; cursor = d.cursor;
      }
      const hoy = new Date().toISOString().slice(0, 10);
      const filas = videos.map(v => ({
        id: 'tt-post-' + v.id,
        data: {
          tt_id: v.id, fecha: new Date((v.create_time || 0) * 1000).toISOString(), tipo: 'Video',
          texto: (v.video_description || v.title || '').slice(0, 600), link: v.share_url || '', miniatura: v.cover_image_url || '',
          duracion: v.duration ?? null, vistas: v.view_count ?? null, likes: v.like_count ?? null,
          comentarios: v.comment_count ?? null, compartidos: v.share_count ?? null, actualizado: new Date().toISOString()
        }
      }));
      filas.push({ id: 'tt-cuenta-' + hoy, data: { fecha: hoy, usuario: u.username || u.display_name, seguidores: u.follower_count, siguiendo: u.following_count, likes_totales: u.likes_count, videos: u.video_count } });
      filas.push({ id: 'tt-sync', data: { cuando: new Date().toISOString(), ok: true, posts: videos.length, usuario: u.username || u.display_name } });
      await supaPut('redes_metricas', filas);
      return res.status(200).json({ ok: true, usuario: u.username || u.display_name, seguidores: u.follower_count, posts: videos.length });
    } catch (e) {
      try { await supaPut('redes_metricas', [{ id: 'tt-sync', data: { cuando: new Date().toISOString(), ok: false, error: e.message } }]); } catch (_) {}
      return res.status(500).json({ ok: false, error: e.message });
    }
  }
  return res.status(400).json({ ok: false, error: 'Acción desconocida' });
};
