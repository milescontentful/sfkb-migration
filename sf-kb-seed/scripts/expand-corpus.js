#!/usr/bin/env node
// Expands corpus/brightline-kb.json to a few hundred realistic articles using the Anthropic API.
// Usage: ANTHROPIC_API_KEY=sk-... node scripts/expand-corpus.js [--target 300] [--model claude-sonnet-4-6]
// Idempotent: skips slugs that already exist; safe to re-run until the target is reached.
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const TARGET = parseInt(arg('--target', '300'), 10), MODEL = arg('--model', 'claude-sonnet-4-6');
const FILE = path.join(__dirname, '..', 'corpus', 'brightline-kb.json');
const corpus = JSON.parse(fs.readFileSync(FILE));
const KEY = process.env.ANTHROPIC_API_KEY; if (!KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }

// Topic plan: category -> subject areas. ~12 subjects x 5 categories x 3 types x 2 angles ≈ 360 slots.
const PLAN = {
  Invoices: ['reading your invoice', 'prorated charges', 'invoice disputes', 'monitoring subscription line', 'multi-property accounts', 'invoice emails and PDFs', 'currency and tax display'],
  Payments: ['autopay troubleshooting', 'failed payments', 'refunds', 'paying by check', 'card expiry', 'payment receipts', 'partial payments'],
  Financing: ['loan statements', 'interest rates', 'credit checks', 'transfer on home sale', 'co-borrowers', 'hardship programs', 'payoff letters'],
  Login: ['account lockout', 'changing email', 'Apple/Google sign-in', 'SMS codes not arriving', 'browser support', 'shared devices'],
  Profile: ['notification preferences', 'language settings', 'data privacy requests', 'closing an account', 'installer contact info'],
  Alerts: ['inverter fault codes', 'microinverter offline', 'rapid shutdown', 'battery alerts', 'temperature warnings', 'alert notifications', 'false alarms'],
  Reports: ['production estimates', 'consumption monitoring', 'comparing to neighbors', 'weather adjustments', 'lifetime stats', 'CO2 offset figures', 'report scheduling'],
  Scheduling: ['site survey', 'installation day prep', 'roof access', 'crew arrival windows', 'weather delays', 'post-install walkthrough'],
  Permits: ['HOA approvals', 'inspection day', 'failed inspections', 'utility interconnection', 'historic districts', 'ground-mount permits'],
  'Partner API': ['authentication errors', 'pagination', 'webhook retries', 'sandbox data', 'site ownership transfer', 'SDKs', 'changelog', 'error codes', 'idempotency keys']
};
const TYPES = ['FAQ', 'FAQ', 'Procedure', 'News']; // ratio: half FAQ, Procedure, some News
const existing = new Set(corpus.articles.map(a => a.slug));
const slugs = () => corpus.articles.map(a => a.slug).slice(-60).join(', ');

const schema = {
  FAQ: '{ "type":"FAQ","slug":"kebab-case","category":"<cat>","title":"question phrased as a customer would","summary":"one sentence","question":"<p>customer question</p>","answer":"<h2>..</h2><p>..</p> 150-300 words of HTML using p, h2/h3, ul/ol, b, i, table where useful, a href=\\"/articles/Knowledge/<existing-slug>\\" to 1-2 related articles" }',
  Procedure: '{ "type":"Procedure","slug":"kebab-case","category":"<cat>","audience":"All customers|Account owners|Developers","title":"imperative verb phrase","summary":"one sentence","body":"<p>prereqs</p><ol> numbered steps </ol> plus a Troubleshooting h3, 150-300 words HTML, 1-2 cross-links" }',
  News: '{ "type":"News","slug":"kebab-case","category":"<cat>","title":"announcement headline","summary":"one sentence","abstract":"<p>one paragraph</p>","body":"100-250 words HTML with dates, a table or list, 1 cross-link" }'
};

async function gen(category, subject, type, n) {
  const prompt = `You write support knowledge-base articles for Brightline Solar, a fictional US residential solar installer with a customer app "Brightline Home" (production monitoring, billing, alerts, battery control) and a "Partner API" (OAuth2, REST, webhooks). Tone: clear, specific, helpful; invent plausible concrete details (menu paths, fees, timeframes, error codes). Never reference real companies or real docs.

Write ${n} distinct ${type} articles about: "${subject}" (category: "${category}").
Existing slugs you may cross-link to: ${slugs()}.
Do NOT reuse these slugs. Respond with ONLY a JSON array, no prose, no markdown fences. Each element matches:
${schema[type]}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }) });
  const data = await res.json();
  if (!data.content) throw new Error(JSON.stringify(data));
  const text = data.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

(async () => {
  const slots = [];
  for (const [cat, subjects] of Object.entries(PLAN)) for (const s of subjects) for (const t of TYPES) slots.push([cat, s, t]);
  // shuffle deterministically so re-runs cover categories evenly
  slots.sort((a, b) => (a.join('|').length * 7919) % 97 - (b.join('|').length * 7919) % 97);
  for (const [cat, subject, type] of slots) {
    if (corpus.articles.length >= TARGET) break;
    try {
      const batch = await gen(cat, subject, type, 2);
      let added = 0;
      for (const a of batch) {
        if (!a.slug || existing.has(a.slug) || a.type !== type) continue;
        a.category = cat; existing.add(a.slug); corpus.articles.push(a); added++;
      }
      fs.writeFileSync(FILE, JSON.stringify(corpus, null, 2));
      console.log(`${corpus.articles.length}/${TARGET}  +${added}  ${type} / ${cat} / ${subject}`);
    } catch (e) { console.warn(`skip ${cat}/${subject}/${type}: ${e.message.slice(0, 120)}`); }
  }
  console.log(`Done: ${corpus.articles.length} articles in corpus. Now run generate-corpus.js.`);
})();
