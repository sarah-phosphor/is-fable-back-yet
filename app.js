/* ============================================================
   Is Fable Back Yet?

   ┌─────────────────────────────────────────────────────────┐
   │  THE ONLY SWITCH. Flip to 'up' when Fable returns and    │
   │  the whole page re-themes: green "Yes", "Resolved" pill, │
   │  counter retires, copy updates. That's the entire site.  │
   └─────────────────────────────────────────────────────────┘ */
const STATUS = 'down';   // 'down' | 'up'

// ---- Fable's brief life (US Eastern) -----------------------
const LAUNCH      = new Date('2026-06-09T00:00:00-04:00').getTime();
const DOWN_SINCE  = new Date('2026-06-12T17:21:00-04:00').getTime();
const LIFESPAN_MS = DOWN_SINCE - LAUNCH;   // ~3 days online

// ---- Coverage: live feed + hand-picked anchors -------------
// CURATED are vetted, always-shown anchors (some are relevant via
// context, not keywords, so no auto-filter could be trusted to find
// them). The live feed (/api/news) merges fresh, filter-passing
// articles on top, newest first. The rail is never empty.
const CURATED = [
  { outlet: 'CNBC', headline: 'Prediction market traders speculate Anthropic will restore access quickly to AI model after Trump admin directed it to limit reach', url: 'https://www.cnbc.com/2026/06/16/kalshi-traders-think-anthropic-will-restore-access-to-ai-model-quickly.html', iso: '2026-06-16T15:44:01Z' },
  { outlet: 'The Guardian', headline: "The Anthropic 'Fable' saga proves: we have opened the AI Pandora's box. What now?", url: 'https://www.theguardian.com/commentisfree/2026/jun/16/anthropic-fable-ai', iso: '2026-06-16T12:00:01Z' },
  { outlet: 'Vox', headline: 'Trump just found the worst way to regulate AI', url: 'https://www.vox.com/politics/492031/anthropic-fable-claude-ban-trump-ai', iso: '2026-06-16T10:00:00Z' },
  { outlet: 'NBC News', headline: "Inside the Trump Administration scramble that forced Anthropic's new AI model offline", url: 'https://www.nbcnews.com/tech/security/anthropic-fable-5-ai-offline-trump-order-administration-claude-rcna350117', iso: '2026-06-16T09:00:42Z' },
  { outlet: 'Wired', headline: 'Anthropic Is Still at Odds With the White House Over Claude Fable 5', url: 'https://www.wired.com/story/anthropic-is-still-at-odds-with-the-white-house-over-claude-fable-5/', iso: '2026-06-16T00:53:46Z' },
  { outlet: 'The Verge', headline: "All the news about Anthropic's new AI fight with the White House", url: 'https://www.theverge.com/ai-artificial-intelligence/950026/anthropic-fable-mythos-ban-ai-shutdown', iso: '2026-06-15T19:04:53Z' },
];

const NEWS_ENDPOINT = '/api/news';
const POLL_MS = 10 * 60 * 1000;   // re-check the feed every 10 minutes
const MAX_RAIL = 7;

// curated anchors, normalized to { outlet, headline, url, ts }
const ANCHORS = CURATED.map((c) => ({ outlet: c.outlet, headline: c.headline, url: c.url, ts: Date.parse(c.iso) }));
let liveItems = [];

// ---- helpers -----------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

function relFromTime(t, now) {
  // calendar-day difference (local), so a same-day article reads "today"
  // all day instead of flipping to "yesterday" after ~12 hours.
  const a = new Date(t), b = new Date(now);
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const d = Math.round((midnight(b) - midnight(a)) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return d + ' days ago';
}

function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

// live (fresh) on top, then anchors; dedup by URL; newest first; cap.
function mergedItems() {
  const byUrl = new Map();
  for (const it of [...liveItems, ...ANCHORS]) {
    if (!byUrl.has(it.url)) byUrl.set(it.url, it);
  }
  return [...byUrl.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_RAIL);
}

// ---- coverage rail -----------------------------------------
const railEl = document.querySelector('[data-coverage]');
const noteEl = document.querySelector('[data-rail-note]');
let relEls = [];

function renderCoverage() {
  const items = mergedItems();
  railEl.textContent = '';
  relEls = [];

  const frag = document.createDocumentFragment();
  for (const item of items) {
    const a = document.createElement('a');
    a.className = 'item';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener';

    const meta = document.createElement('span');
    meta.className = 'item__meta';

    const outlet = document.createElement('span');
    outlet.className = 'item__outlet';
    outlet.textContent = item.outlet;

    const rel = document.createElement('span');
    rel.className = 'item__rel';
    rel._when = item.ts;
    relEls.push(rel);

    meta.append(outlet, rel);

    const headline = document.createElement('span');
    headline.className = 'item__headline';
    headline.textContent = item.headline;

    a.append(meta, headline);
    frag.append(a);
  }
  railEl.append(frag);
  updateRelDates(Date.now());

  if (noteEl) {
    setText(noteEl, liveItems.length
      ? 'Live — auto-updates as new coverage lands.'
      : 'Showing curated coverage; live feed updating.');
  }
}

function updateRelDates(now) {
  for (const el of relEls) setText(el, relFromTime(el._when, now));
}

async function fetchNews() {
  try {
    const res = await fetch(NEWS_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) return;                       // keep anchors in place
    const data = await res.json();
    const items = (data.items || [])
      .filter((a) => a && a.url && a.headline)
      .map((a) => ({
        outlet: a.outlet || '',
        headline: a.headline,
        url: a.url,
        ts: a.date ? Date.parse(a.date) : Date.now(),
      }));
    if (items.length) {
      liveItems = items;
      renderCoverage();
    }
  } catch (_) {
    // network/parse failure → leave anchors in place
  }
}

// ---- clock -------------------------------------------------
const clockEls = {
  days: document.querySelector('[data-clock="days"]'),
  hrs:  document.querySelector('[data-clock="hrs"]'),
  mins: document.querySelector('[data-clock="mins"]'),
  secs: document.querySelector('[data-clock="secs"]'),
};
const quipEl = document.querySelector('[data-quip]');

function tick() {
  const now = Date.now();

  // "time without Fable"
  const elapsed = Math.max(0, now - DOWN_SINCE);
  const totalSec = Math.floor(elapsed / 1000);
  setText(clockEls.days, pad(Math.floor(totalSec / 86400)));
  setText(clockEls.hrs,  pad(Math.floor((totalSec % 86400) / 3600)));
  setText(clockEls.mins, pad(Math.floor((totalSec % 3600) / 60)));
  setText(clockEls.secs, pad(totalSec % 60));

  // deadpan lifespan contrast — only ticks over about once an hour
  const multiple = elapsed / LIFESPAN_MS;
  setText(quipEl, 'Down ' + multiple.toFixed(2) + '× longer — and counting');

  // relative dates on coverage — only change about once a day
  updateRelDates(now);
}

// ---- boot --------------------------------------------------
document.documentElement.dataset.status = STATUS;
document.body.dataset.status = STATUS;

renderCoverage();                  // anchors render instantly
fetchNews();                       // merge in fresh live coverage
setInterval(fetchNews, POLL_MS);

if (STATUS === 'down') {
  tick();
  setInterval(tick, 1000);
} else {
  updateRelDates(Date.now());      // counter retires; dates still resolve
}
