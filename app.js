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

// ---- Coverage: live with a curated safety net --------------
// The rail auto-updates from /api/news (a serverless function that
// queries GNews). CURATED renders instantly on load and is shown
// whenever the live feed is empty or unreachable, so the rail is
// never blank. Dates here are anchored to noon ET.
const CURATED = [
  { outlet: 'The Conversation', headline: "Why the US government shut down Anthropic's latest Claude AI model", url: 'https://theconversation.com/why-the-us-government-shut-down-anthropics-latest-claude-ai-model-285223', date: '2026-06-14' },
  { outlet: 'Al Jazeera',       headline: 'US orders Anthropic to disable AI models for all foreign nationals', url: 'https://www.aljazeera.com/news/2026/6/13/us-orders-anthropic-to-disable-ai-models-for-all-foreign-nationals', date: '2026-06-13' },
  { outlet: "Tom's Hardware",   headline: 'US export-control order forces Anthropic to disable Claude Fable 5 and Mythos 5 worldwide', url: 'https://www.tomshardware.com/tech-industry/artificial-intelligence/us-export-control-order-forces-anthropic-to-disable-claude-fable-5-and-mythos-5-worldwide', date: '2026-06-13' },
  { outlet: 'MarkTechPost',     headline: 'Anthropic disables Claude Fable 5 and Mythos 5 after US government order', url: 'https://www.marktechpost.com/2026/06/13/anthropic-disables-claude-fable-5-and-mythos-5-after-us-government-order/', date: '2026-06-13' },
  { outlet: 'Business Insider', headline: 'Anthropic disables Mythos and Fable models under US export-control order', url: 'https://www.businessinsider.com/anthropic-disable-mythos-fable-us-export-control-national-security-2026-6', date: '2026-06-13' },
  { outlet: 'Anthropic',        headline: 'Official statement on Fable 5 and Mythos 5 access', url: 'https://www.anthropic.com/news/fable-mythos-access', date: '2026-06-12' },
];

const NEWS_ENDPOINT = '/api/news';
const POLL_MS = 10 * 60 * 1000;   // re-check the feed every 10 minutes

// ---- helpers -----------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

// Resolve an item to a timestamp: live items carry an ISO datetime in
// `ts`; curated items carry a YYYY-MM-DD `date` anchored to noon ET.
function itemTime(item) {
  if (typeof item.ts === 'number') return item.ts;
  return new Date(item.date + 'T12:00:00-04:00').getTime();
}

function relFromTime(t, now) {
  const d = Math.round((now - t) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return d + ' days ago';
}

// Only touch the DOM when the rendered value actually changes, so each
// field repaints at its real cadence (seconds per tick, dates per day…).
function setText(el, value) {
  if (el.textContent !== value) el.textContent = value;
}

// ---- coverage rail -----------------------------------------
const railEl = document.querySelector('[data-coverage]');
const noteEl = document.querySelector('[data-rail-note]');
let relEls = [];

function renderCoverage(items, isLive) {
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
    rel._when = itemTime(item);   // stash the timestamp for live updates
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
    setText(noteEl, isLive
      ? 'Live — auto-updates as new coverage lands.'
      : "Live feed isn't reachable — showing a curated list.");
  }
}

function updateRelDates(now) {
  for (const el of relEls) setText(el, relFromTime(el._when, now));
}

async function fetchNews() {
  try {
    const res = await fetch(NEWS_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) return;                       // keep whatever is shown (curated)
    const data = await res.json();
    const items = (data.items || [])
      .filter((a) => a && a.url && a.headline)
      .map((a) => ({
        outlet: a.outlet || '',
        headline: a.headline,
        url: a.url,
        ts: a.date ? Date.parse(a.date) : Date.now(),
      }))
      .sort((a, b) => b.ts - a.ts);            // newest first
    if (items.length) renderCoverage(items, true);
  } catch (_) {
    // network/parse failure → leave the curated list in place
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

renderCoverage(CURATED, false);    // instant + never-empty
fetchNews();                       // upgrade to live coverage
setInterval(fetchNews, POLL_MS);   // and keep it fresh

if (STATUS === 'down') {
  tick();
  setInterval(tick, 1000);
} else {
  updateRelDates(Date.now());      // counter retires; dates still resolve
}
