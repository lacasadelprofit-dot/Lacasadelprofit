// Proxy para Meta Graph API
// Requiere: META_ACCESS_TOKEN y META_ACCOUNT_ID en Vercel env vars

const https = require('https');

function metaGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://graph.facebook.com');
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'GET' };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { action, token, accountId, formId, leadId } = req.body || {};
    if (!token) { res.status(400).json({ error: 'Falta token' }); return; }

    let result;
    if (action === 'leads') {
      const acId = accountId || process.env.META_ACCOUNT_ID;
      const forms = await metaGet(`/v18.0/act_${acId}/leadgen_forms?access_token=${token}&fields=id,name,leads_count`);
      const allLeads = [];
      for (const form of (forms.data?.data || [])) {
        const leads = await metaGet(`/v18.0/${form.id}/leads?access_token=${token}&fields=id,field_data,created_time`);
        allLeads.push(...(leads.data?.data || []).map(l => ({ ...l, formId: form.id, formName: form.name })));
      }
      result = { forms: forms.data?.data || [], leads: allLeads };
    } else if (action === 'campaigns') {
      const acId = accountId || process.env.META_ACCOUNT_ID;
      result = await metaGet(`/v18.0/act_${acId}/campaigns?access_token=${token}&fields=id,name,status,objective`);
      result = result.data;
    } else if (action === 'lead') {
      result = await metaGet(`/v18.0/${leadId}?access_token=${token}&fields=id,field_data,created_time,form_id`);
      result = result.data;
    } else {
      res.status(400).json({ error: 'Acción no válida' }); return;
    }

    res.status(200).json({ ok: true, data: result });
  } catch (e) {
    console.error('meta-proxy error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
