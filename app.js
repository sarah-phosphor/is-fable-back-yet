/* ============================================================
   Is Fable Back Yet?

   ┌─────────────────────────────────────────────────────────┐
   │  THE ONLY SWITCH. Flip to 'up' when Fable returns and    │
   │  the whole page re-themes: green "Yes", "Resolved" pill, │
   │  counter retires, copy updates. That's the entire site.  │
   └─────────────────────────────────────────────────────────┘ */
const STATUS = 'down';   // 'down' | 'up'

// ---- Fable's brief life ------------------------------------
const LAUNCH      = new Date('2026-06-09T00:00:00-04:00').getTime();   // midnight ET, Jun 9
const DOWN_SINCE  = new Date('2026-06-12T17:50:44-07:00').getTime();   // 5:50:44 PM PT, Jun 12
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

const STATUS_ENDPOINT = '/api/fable-status';
const STATUS_POLL_MS = 60 * 1000;   // re-check whether Fable is back every 60s

// curated anchors, normalized to { outlet, headline, url, ts }
const ANCHORS = CURATED.map((c) => ({ outlet: c.outlet, headline: c.headline, url: c.url, ts: Date.parse(c.iso) }));
let liveItems = [];

// ---- helpers -----------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

function relFromTime(t, now) {
  // elapsed-time label, so fresh coverage reads "3 hours ago" (freshness)
  // instead of a flat "today" for the whole calendar day. Falls back to
  // "yesterday" / "N days ago" once an item is more than a day old.
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins === 1 ? '1 minute ago' : mins + ' minutes ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : hrs + ' hours ago';
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : days + ' days ago';
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

  // relative dates on coverage — now tick by the minute/hour for fresh items
  updateRelDates(now);
}

// ---- live status: flip to "up" the moment Fable returns ----
// resolveStatus() is fail-safe: it reports "up" only when we're
// certain (manual override, or a confident 200 from the probe).
// Anything ambiguous falls back to the hardcoded STATUS switch.
let liveStatus = null;           // 'up' | 'down' | null (unknown / not yet checked)
let clockTimer = null;

function startClock() {
  if (clockTimer) return;
  tick();
  clockTimer = setInterval(tick, 1000);
}

function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

function resolveStatus() {
  if (STATUS === 'up') return 'up';         // manual override always wins
  if (liveStatus === 'up') return 'up';     // probe confirmed Fable is back
  if (liveStatus === 'down') return 'down'; // probe confirmed still down
  return STATUS;                            // unknown → fall back to the switch
}

function applyStatus(s) {
  document.documentElement.dataset.status = s;
  document.body.dataset.status = s;
  if (s === 'up') {
    stopClock();                 // the counter retires
    updateRelDates(Date.now());
  } else {
    startClock();
  }
}

async function fetchStatus() {
  try {
    const res = await fetch(STATUS_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) return;                       // unknown → hold current state
    const data = await res.json();
    if (data.status === 'up' || data.status === 'down') {
      liveStatus = data.status;
      applyStatus(resolveStatus());
    }
    // data.status null → unknown → leave the page as-is (never false-flip up)
  } catch (_) {
    // network/parse failure → hold current state
  }
}

// ---- boot --------------------------------------------------
applyStatus(resolveStatus());      // initial paint from the switch / fallback

renderCoverage();                  // anchors render instantly
fetchNews();                       // merge in fresh live coverage
setInterval(fetchNews, POLL_MS);

fetchStatus();                     // check whether Fable is back…
setInterval(fetchStatus, STATUS_POLL_MS);   // …and keep checking
