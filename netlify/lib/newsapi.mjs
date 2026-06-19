/* ============================================================
   Shared coverage-feed logic for Is Fable Back Yet?

   Source: Google News RSS search (free, no API key, no daily quota).
   Imported by:
     • functions/refresh-news.mjs — scheduled, writes the result to Blobs.
     • functions/news.mjs        — serves it (cold-start fallback only).

   Google News returns ~100 candidates per query across the whole web, so
   the hard allowlist below does the quality control: broad in, strict out.

   Each RSS <item> carries a <source url="…">Outlet</source> tag, so the
   outlet is read from that publisher host (the <link> itself is a
   news.google.com redirect and carries no publisher domain/slug).

   An article is kept only if:
     • a reputable outlet (hard allowlist on the <source> host), AND
     • the headline names Fable/Mythos, OR names Anthropic + an
       outage/fight word (offline, ban, restore, white house, …).
   ============================================================ */

const GNEWS_RSS = 'https://news.google.com/rss/search';
const SEARCH = '"Fable 5" OR "Mythos 5" OR "Claude Fable" OR "Claude Mythos"'
  + ' OR "Anthropic Fable" OR (Anthropic Mythos)';
const MAX_ITEMS = 8;

// HARD allowlist — only these outlets ever appear. domain → display name.
export const REPUTABLE = new Map([
  ['reuters.com', 'Reuters'],
  ['bloomberg.com', 'Bloomberg'],
  ['theverge.com', 'The Verge'],
  ['arstechnica.com', 'Ars Technica'],
  ['wired.com', 'Wired'],
  ['aljazeera.com', 'Al Jazeera'],
  ['bbc.com', 'BBC'],
  ['bbc.co.uk', 'BBC'],
  ['theguardian.com', 'The Guardian'],
  ['ft.com', 'Financial Times'],
  ['nytimes.com', 'The New York Times'],
  ['wsj.com', 'The Wall Street Journal'],
  ['washingtonpost.com', 'The Washington Post'],
  ['apnews.com', 'AP'],
  ['cnbc.com', 'CNBC'],
  ['cnn.com', 'CNN'],
  ['nbcnews.com', 'NBC News'],
  ['nypost.com', 'New York Post'],
  ['csmonitor.com', 'The Christian Science Monitor'],
  ['npr.org', 'NPR'],
  ['theatlantic.com', 'The Atlantic'],
  ['vox.com', 'Vox'],
  ['axios.com', 'Axios'],
  ['politico.com', 'Politico'],
  ['thehill.com', 'The Hill'],
  ['foreignpolicy.com', 'Foreign Policy'],
  ['lawfaremedia.org', 'Lawfare'],
  ['semafor.com', 'Semafor'],
  ['theinformation.com', 'The Information'],
  ['techcrunch.com', 'TechCrunch'],
  ['technologyreview.com', 'MIT Technology Review'],
  ['404media.co', '404 Media'],
  ['engadget.com', 'Engadget'],
  ['venturebeat.com', 'VentureBeat'],
  ['zdnet.com', 'ZDNet'],
  ['theregister.com', 'The Register'],
  ['businessinsider.com', 'Business Insider'],
  ['theconversation.com', 'The Conversation'],
  ['techmeme.com', 'Techmeme'],
  ['fortune.com', 'Fortune'],
  ['forbes.com', 'Forbes'],
  ['cnet.com', 'CNET'],
  ['anthropic.com', 'Anthropic'],
]);

// Relevance signals, tested against "title + url-slug".
const FABLE = /\b(fable|mythos)\b/i;
const ANTHROPIC = /\banthropic\b/i;
// Stems use \w* so inflected forms match ("disabl\w*" → disabled/disables/
// disabling); short words that could collide with unrelated terms (ban, block,
// pull) spell out their endings instead. The whole thing only fires alongside
// ANTHROPIC, so the political-fight vocabulary (white house, trump, lutnick,
// lawmakers, administration, government, regulation) is safe to include.
const EVENT = /\b(?:offline|disabl\w*|restor\w*|restrict\w*|reinstat\w*|ban(?:ned|ning|s)?|shut[\s-]?downs?|export\w*|control\w*|curb\w*|pull(?:ed|ing|s)?|suspend\w*|outage|halt\w*|revoke\w*|revoc\w*|licen[sc]\w*|limit\w*|white\s?house|trump|lutnick|lawmaker\w*|administration|government\w*|regulat\w*|commerce|directive\w*|grounded?|block(?:ed|ing|s)?)\b/i;

function domainOf(source) {
  return String(source || '').toLowerCase().replace(/^www\./, '').trim();
}

// Resolve the outlet from the publisher host. For Google News items the
// <link> is a news.google.com redirect, so `a.source` (the publisher host
// from the RSS <source> tag, e.g. wired.com) is what matches the allowlist;
// the URL-host check is a fallback for any item that links direct.
function outletOf(a) {
  let host = '';
  try { host = domainOf(new URL(a.url).hostname); } catch { /* bad url */ }
  return REPUTABLE.get(domainOf(a.source)) || REPUTABLE.get(host);
}

function slugText(url) {
  try {
    const u = new URL(url);
    // Google News links are opaque redirects (no publisher slug) — relevance
    // for those rides on the headline alone, so don't mine the base64 path.
    if (/(^|\.)google\.com$/.test(domainOf(u.hostname))) return '';
    return decodeURIComponent(u.pathname).replace(/[^a-z0-9]+/gi, ' ').toLowerCase();
  } catch {
    return '';
  }
}

function isRelevant(title, url) {
  const hay = `${title} ${slugText(url)}`;
  if (FABLE.test(hay)) return true;                        // names Fable/Mythos
  if (ANTHROPIC.test(hay) && EVENT.test(hay)) return true; // Anthropic + the fight
  return false;
}

// Single source of truth for keep/drop, with a reason (used by ?debug=1).
function classify(a) {
  if (!a || !a.url || !a.title) return { kept: false, reason: 'missing title/url' };
  const outlet = outletOf(a);
  if (!outlet) return { kept: false, reason: `outlet not allowlisted (${a.source})` };
  if (!isRelevant(a.title, a.url)) return { kept: false, reason: 'not about the Fable event' };
  return { kept: true, reason: outlet };
}

/** Shape parsed feed articles → rail items. Pure + exported for tests. */
export function shapeArticles(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles || []) {
    const verdict = classify(a);
    if (!verdict.kept) continue;
    const headline = String(a.title).trim();
    const key = headline.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(a.url) || seen.has(key)) continue;       // dedup url + title
    seen.add(a.url);
    seen.add(key);
    out.push({ outlet: verdict.reason, headline, url: a.url, date: a.published_at || null });
  }
  const ts = (i) => new Date(i.date || 0).getTime();
  out.sort((x, y) => ts(y) - ts(x));                       // newest first
  return out.slice(0, MAX_ITEMS);
}

// --- Google News RSS parsing -------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#34': '"' };
function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, e.toLowerCase()) ? ENTITIES[e.toLowerCase()] : m;
    });
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
};

/** Parse Google News RSS XML → article objects shaped like the rest of the pipeline. */
export function parseRss(xml) {
  const out = [];
  const blocks = String(xml || '').split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const rawTitle = tag(block, 'title');
    const link = tag(block, 'link');
    const pubDate = tag(block, 'pubDate');
    const srcM = block.match(/<source\b[^>]*\burl="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    const srcUrl = srcM ? srcM[1] : '';
    const srcName = srcM ? decodeEntities(srcM[2]).trim() : '';
    // Google appends " - Outlet" to every headline; strip it for a clean title.
    const title = srcName && rawTitle.endsWith(` - ${srcName}`)
      ? rawTitle.slice(0, -(srcName.length + 3)).trim()
      : rawTitle.replace(/\s+-\s+[^-]+$/, '').trim();
    let source = '';
    try { source = domainOf(new URL(srcUrl).hostname); } catch { /* no source url */ }
    let published_at = null;
    if (pubDate) { const d = new Date(pubDate); if (!isNaN(d)) published_at = d.toISOString(); }
    if (link && title) out.push({ title, url: link, source, published_at });
  }
  return out;
}

function rssUrl(search) {
  const qs = new URLSearchParams({ q: search, hl: 'en-US', gl: 'US', ceid: 'US:en' });
  return `${GNEWS_RSS}?${qs.toString()}`;
}

async function fetchFeed(search) {
  try {
    const res = await fetch(rssUrl(search), { headers: { 'User-Agent': 'comebackfable.com (+https://comebackfable.com)' } });
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch {}
      return { articles: [], error: `HTTP ${res.status} ${body}`.trim() };
    }
    return { articles: parseRss(await res.text()), error: null };
  } catch (err) {
    return { articles: [], error: String(err) };
  }
}

/**
 * Pull + shape the current coverage feed from Google News RSS. Free + keyless,
 * so there is no quota to budget — it runs from the scheduled refresh and once
 * as a cold-start fallback. Returns { items, fetchedAt, error? }; never throws.
 */
export async function pullAndShape() {
  const fetchedAt = new Date().toISOString();
  try {
    const { articles, error } = await fetchFeed(SEARCH);
    // A 200 that parses to ZERO articles is not "no coverage" — it's an
    // unusable feed (Google hands datacenter IPs a consent/throttle page with
    // no <item>s). Treat it as a soft error so callers keep last-good data
    // instead of clobbering the blob with an empty rail. A feed that parsed
    // real articles but filtered down to 0 is a genuine no-match and is fine.
    const softError = !error && articles.length === 0
      ? 'empty feed: 0 articles parsed (likely upstream block/consent page)'
      : error;
    return { items: shapeArticles(articles), fetchedAt, error: softError || undefined };
  } catch (err) {
    return { items: [], fetchedAt, error: String(err) };
  }
}

export const BLOB_STORE = 'news';
export const BLOB_KEY = 'latest';
