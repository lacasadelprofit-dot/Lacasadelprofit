// /api/ig-sync — trae publicaciones y métricas de Instagram (@juancruzconsciencia) y las guarda en Supabase
// (tabla redes_metricas, ver 4_BASE_DE_DATOS/41_redes_metricas.sql).
//
// Variables de entorno en Vercel (proyecto del admin):
//   IG_TOKEN              token de la PÁGINA de Facebook vinculada a la cuenta de Instagram (no vence)
//   IG_USER_ID            (opcional) id de la cuenta de Instagram; si falta, se busca con el token
//   SUPABASE_SERVICE_KEY  (ya existe)
//
// Solo lo puede llamar alguien logueado en el admin: se valida el token de sesión de Supabase.
// Uso: POST /api/ig-sync   (header Authorization: Bearer <access_token de Supabase>)
//      ?cantidad=50  cuántas publicaciones recientes actualizar (máx 150)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const IG_TOKEN = process.env.IG_TOKEN || '';
const GRAPH = 'https://graph.facebook.com/v25.0'; // v21 ya fue retirada por Meta

async function graph(path, params = {}) {
  const u = new URL(GRAPH + path);
  Object.entries({ ...params, access_token: IG_TOKEN }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    e.code = j.error && j.error.code;
    throw e;
  }
  return j;
}

async function usuarioValido(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: auth }
  });
  return r.ok;
}

async function guardar(filas) {
  if (!filas.length) return;
  const r = await fetch(SUPABASE_URL + '/rest/v1/redes_metricas?on_conflict=id', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(filas.map(f => ({ ...f, updated_at: new Date().toISOString() })))
  });
  if (!r.ok) throw new Error('Supabase: ' + (await r.text()).slice(0, 300));
}

async function buscarCuentaIg() {
  if (process.env.IG_USER_ID) return process.env.IG_USER_ID;
  // token de página: /me es la página
  try {
    const p = await graph('/me', { fields: 'instagram_business_account' });
    if (p.instagram_business_account) return p.instagram_business_account.id;
  } catch (e) { /* puede ser token de usuario */ }
  // token de usuario: buscar entre sus páginas
  const ps = await graph('/me/accounts', { fields: 'name,instagram_business_account' });
  const con = (ps.data || []).find(p => p.instagram_business_account);
  if (!con) throw new Error('El token no tiene ninguna página con una cuenta de Instagram vinculada.');
  return con.instagram_business_account.id;
}

// Métricas por tipo de publicación. Si Instagram rechaza alguna, se prueba con un grupo más chico.
const METRICAS = {
  REELS: ['reach', 'views', 'saved', 'shares', 'total_interactions', 'ig_reels_avg_watch_time'],
  FEED: ['reach', 'views', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits'],
  BASE: ['reach', 'saved', 'shares', 'total_interactions'],
  MIN: ['reach']
};
let errorInsights = ''; // último motivo por el que Instagram rechazó las estadísticas (para diagnóstico)
async function insightsDe(m) {
  const grupos = [m.media_product_type === 'REELS' ? METRICAS.REELS : METRICAS.FEED, METRICAS.BASE, METRICAS.MIN];
  for (const g of grupos) {
    try {
      const r = await graph('/' + m.id + '/insights', { metric: g.join(',') });
      const o = {};
      (r.data || []).forEach(x => { o[x.name] = x.values && x.values[0] ? x.values[0].value : x.total_value && x.total_value.value; });
      if (o.reach == null && !errorInsights) errorInsights = 'respuesta sin datos: ' + JSON.stringify(r).slice(0, 200);
      return o;
    } catch (e) { errorInsights = e.message; /* probar el siguiente grupo */ }
  }
  return {};
}

// Permisos que tiene el token cargado en Vercel (para diagnóstico; no muestra el token)
async function permisosDelToken() {
  try {
    const p = await graph('/me/permissions');
    return (p.data || []).filter(x => x.status === 'granted').map(x => x.permission);
  } catch (e) { return ['(token de página: ' + e.message.slice(0, 60) + ')']; }
}

// Reloj automático de Vercel (vercel.json → crons): actualiza todo a las 6:00 de Brasil, antes del resumen de Telegram.
// Mismo criterio que /api/backup-diario: header x-vercel-cron o "Authorization: Bearer <CRON_SECRET>".
function esCron(req) {
  const auth = req.headers.authorization || '';
  return !!req.headers['x-vercel-cron'] || !!(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const cron = esCron(req);
  if (req.method !== 'POST' && !cron) return res.status(405).json({ ok: false, error: 'Usá POST' });
  if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Falta SUPABASE_SERVICE_KEY en Vercel.' });
  if (!IG_TOKEN) return res.status(500).json({ ok: false, error: 'Falta IG_TOKEN en Vercel (token de la página de Facebook).' });
  try {
    if (!cron && !(await usuarioValido(req))) return res.status(401).json({ ok: false, error: 'Sesión no válida. Volvé a entrar al admin.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo validar la sesión: ' + e.message });
  }

  const cantidad = Math.min(150, Math.max(5, parseInt((req.query && req.query.cantidad) || '50', 10) || 50));
  const inicio = Date.now();
  try {
    const igId = await buscarCuentaIg();
    const cuenta = await graph('/' + igId, { fields: 'username,followers_count,follows_count,media_count' });

    // publicaciones recientes (paginado)
    const medias = [];
    let after = '';
    while (medias.length < cantidad) {
      const p = await graph('/' + igId + '/media', {
        fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count',
        limit: String(Math.min(50, cantidad - medias.length)),
        ...(after ? { after } : {})
      });
      medias.push(...(p.data || []));
      after = p.paging && p.paging.cursors && p.paging.next ? p.paging.cursors.after : '';
      if (!after) break;
    }

    // métricas de cada una, de a 8 en paralelo (cortando antes del límite de tiempo de Vercel)
    const filas = [];
    for (let i = 0; i < medias.length; i += 8) {
      if (Date.now() - inicio > 8000) break;
      const lote = medias.slice(i, i + 8);
      const ins = await Promise.all(lote.map(insightsDe));
      lote.forEach((m, k) => filas.push({
        id: 'post-' + m.id,
        data: {
          ig_id: m.id,
          fecha: m.timestamp,
          tipo: m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrusel' : m.media_type === 'VIDEO' ? 'Video' : 'Foto',
          texto: (m.caption || '').slice(0, 600),
          link: m.permalink,
          miniatura: m.thumbnail_url || (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? m.media_url : ''),
          likes: m.like_count || 0,
          comentarios: m.comments_count || 0,
          alcance: ins.reach ?? null,
          vistas: ins.views ?? null,
          guardados: ins.saved ?? null,
          compartidos: ins.shares ?? null,
          interacciones: ins.total_interactions ?? null,
          seguidores_ganados: ins.follows ?? null,
          visitas_perfil: ins.profile_visits ?? null,
          tiempo_promedio_ms: ins.ig_reels_avg_watch_time ?? null,
          actualizado: new Date().toISOString()
        }
      }));
    }

    const nPosts = filas.length;
    const hoy = new Date().toISOString().slice(0, 10);
    filas.push({ id: 'cuenta-' + hoy, data: { fecha: hoy, usuario: cuenta.username, seguidores: cuenta.followers_count, siguiendo: cuenta.follows_count, publicaciones: cuenta.media_count } });
    const permisos = await permisosDelToken();
    const conMetricas = filas.filter(f => f.data.alcance != null).length;
    filas.push({ id: 'sync', data: { cuando: new Date().toISOString(), ok: true, posts: nPosts, con_metricas: conMetricas, usuario: cuenta.username, permisos, error_metricas: errorInsights || null } });
    await guardar(filas);
    return res.status(200).json({ ok: true, usuario: cuenta.username, seguidores: cuenta.followers_count, posts: nPosts, de: medias.length, con_metricas: conMetricas, permisos, error_metricas: errorInsights || null });
  } catch (e) {
    try { await guardar([{ id: 'sync', data: { cuando: new Date().toISOString(), ok: false, error: e.message } }]); } catch (_) {}
    const vencido = e.code === 190;
    return res.status(vencido ? 401 : 500).json({ ok: false, error: (vencido ? 'El token de Instagram venció o fue revocado. ' : '') + e.message });
  }
};
