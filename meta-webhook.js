// Webhook de Meta Lead Ads
// Requiere: META_VERIFY_TOKEN y SUPABASE_SERVICE_KEY en Vercel env vars

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vffmnyjjawvvctcqzkvj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'lacasadelprofit_verify_2024';

function supabaseInsert(table, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify([body]);
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // GET: webhook verification
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
    return;
  }

  // POST: receive lead events
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'leadgen') {
            const leadId    = change.value?.leadgen_id;
            const formId    = change.value?.form_id;
            const pageId    = change.value?.page_id;
            const createdAt = change.value?.created_time;
            if (leadId && SUPABASE_SERVICE_KEY) {
              const id = String(Date.now() + Math.floor(Math.random() * 1000));
              await supabaseInsert('seres', {
                id,
                data: {
                  id,
                  metaLeadId: leadId,
                  metaFormId: formId,
                  metaPageId: pageId,
                  prospecto: true,
                  origen: 'Meta Lead Ad',
                  fechaRegistro: createdAt ? new Date(createdAt * 1000).toISOString() : new Date().toISOString()
                },
                updated_at: new Date().toISOString()
              });
            }
          }
        }
      }
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('meta-webhook error:', e.message);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
