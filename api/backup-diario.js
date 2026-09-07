// Cron diario (ver vercel.json → "crons") que exporta TODAS las tablas de
// Supabase (panel admin + portal del ser + portal del programa + portal
// facilitadores comparten la misma base) a un archivo JSON con fecha,
// guardado en el bucket privado "backups" de Supabase Storage.
//
// Usa el service role key (bypassea RLS) para traer siempre todo,
// sin depender de qué políticas estén activas ese día.
//
// Se puede probar a mano: GET /api/backup-diario con header
// "Authorization: Bearer <CRON_SECRET>" (mismo valor que la env var
// CRON_SECRET en Vercel).

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = 'backups';
const RETENCION_DIAS = 30;

const TABLAS = [
  'seres','sessions','facilitadores','facturas','herramientas','programas',
  'campanas','inscripciones','egresos','regalos','comunidad_contenido',
  'onboardings','sintesis','metricas_redes','contenido_redes','profiles',
  'biblioteca','biblioteca_notas','configuracion','conocimiento',
  'regalo_eventos','ruleta_fidelidad','ruleta_fidelidad_giros',
  'tesoro_premios','tesoro_ruleta'
];

function supaRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (method === 'POST' && path.startsWith('/storage/v1/object/' + BUCKET + '/')) {
      headers['x-upsert'] = 'true';
    }
    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method, headers }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { /* respuesta no-JSON, ok para algunos endpoints */ }
        if (res.statusCode >= 400) {
          reject(new Error(`${method} ${path} → ${res.statusCode}: ${raw}`));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error(`Timeout en ${method} ${path}`)); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function exportarTodo() {
  const resultado = {};
  const errores = [];
  for (const tabla of TABLAS) {
    try {
      const rows = await supaRequest('GET', `/rest/v1/${tabla}?select=id,data`);
      resultado[tabla] = Array.isArray(rows) ? rows : [];
    } catch (e) {
      errores.push(`${tabla}: ${e.message}`);
      resultado[tabla] = null; // se deja constancia de que esa tabla falló, no se inventa vacío
    }
  }
  return { errores, resultado };
}

async function limpiarBackupsViejos() {
  const listado = await supaRequest('POST', `/storage/v1/object/list/${BUCKET}`, {
    prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' }
  });
  if (!Array.isArray(listado)) return [];
  const corte = Date.now() - RETENCION_DIAS * 24 * 60 * 60 * 1000;
  const viejos = listado
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
    .filter(f => new Date(f.name.slice(0, 10)).getTime() < corte)
    .map(f => f.name);
  if (viejos.length) {
    await supaRequest('DELETE', `/storage/v1/object/${BUCKET}`, { prefixes: viejos });
  }
  return viejos;
}

module.exports = async function handler(req, res) {
  const esCronDeVercel = !!req.headers['x-vercel-cron'];
  const auth = req.headers.authorization || '';
  const secretOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!esCronDeVercel && !secretOk) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  if (!SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_KEY no configurada en Vercel.' });
  }

  try {
    const fecha = new Date().toISOString().slice(0, 10);
    const { resultado, errores } = await exportarTodo();
    const payload = { fecha, generadoEn: new Date().toISOString(), tablas: resultado, errores };

    await supaRequest('POST', `/storage/v1/object/${BUCKET}/${fecha}.json`, payload);
    const eliminados = await limpiarBackupsViejos().catch(e => { errores.push('limpieza: ' + e.message); return []; });

    res.status(200).json({
      ok: true,
      archivo: `${fecha}.json`,
      tablas: Object.keys(resultado).length,
      errores,
      backupsEliminadosPorRetencion: eliminados
    });
  } catch (e) {
    console.error('backup-diario error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
