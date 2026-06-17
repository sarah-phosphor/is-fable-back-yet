/* ============================================================
   Shared TheNewsAPI logic for Is Fable Back Yet?

   Pulls + shapes the "Coverage" feed. Imported by:
     • functions/refresh-news.mjs — scheduled, writes the result to Blobs.
     • functions/news.mjs        — serves it (cold-start fallback only).

   Token (THENEWSAPI_TOKEN) is read from env, never shipped to the browser.

   Relevance is judged on the headline AND the URL slug — because a
   newsroom's slug tags the topic even when the headline doesn't
   (e.g. Vox's "Trump just found the worst way to regulate AI" lives
   at /anthropic-fable-claude-ban-...). An article is kept only if:
     • a reputable outlet (hard allowlist), AND
     • title-or-slug names Fable/Mythos, OR names Anthropic + an
       outage/fight word (offline, ban, restore, white house, …).
   ============================================================ */

const API_ENDPOINT = 'https://api.thenewsapi.com/v1/news/all';
const SEARCH = '"Fable 5" | "Mythos 5" | "Claude Fable" | "Anthropic Fable"';
const PAGES = 2;            // free tier returns 3/page; 2 pages ≈ 6 candidates
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
const EVENT = /\b(offline|disabl|restor|reinstat|ban|banned|shut[\s-]?down|export|pull|pulled|suspend|outage|halt|revoke|licen[sc]e|white\s?house|trump|directive|grounded?|block)\b/i;

function domainOf(source) {
  return String(source || '').toLowerCase().replace(/^www\./, '').trim();
}

function slugText(url) {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[^a-z0-9]+/gi, ' ').toLowerCase();
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
  const outlet = REPUTABLE.get(domainOf(a.source));
  if (!outlet) return { kept: false, reason: `outlet not allowlisted (${a.source})` };
  if (!isRelevant(a.title, a.url)) return { kept: false, reason: 'not about the Fable event' };
  return { kept: true, reason: outlet };
}

/** Shape raw TheNewsAPI articles → rail items. Pure + exported for tests. */
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

async function fetchPages(token, search, pages) {
  const articles = [];
  let error = null;
  for (let page = 1; page <= pages; page++) {
    const url = `${API_ENDPOINT}?api_token=${encodeURIComponent(token)}`
      + `&search=${encodeURIComponent(search)}`
      + `&language=en&limit=3&page=${page}&sort=published_at`;
    const res = await fetch(url, { headers: { 'User-Agent': 'comebackfable.com' } });
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 300); } catch {}
      error = `HTTP ${res.status} ${body}`.trim();
      break;
    }
    const data = await res.json();
    const batch = Array.isArray(data.data) ? data.data : [];
    articles.push(...batch);
    if (batch.length < 3) break;   // last page reached
  }
  return { articles, error };
}

/**
 * Pull + shape the current coverage feed. This is the ONLY place that spends
 * TheNewsAPI quota — it runs from the scheduled refresh (~12×/day), and once
 * as a cold-start fallback. Returns { items, fetchedAt, error? }; never throws.
 */
export async function pullAndShape() {
  const fetchedAt = new Date().toISOString();
  const token = process.env.THENEWSAPI_TOKEN;
  if (!token) return { items: [], fetchedAt, error: 'THENEWSAPI_TOKEN not set' };
  try {
    const { articles, error } = await fetchPages(token, SEARCH, PAGES);
    return { items: shapeArticles(articles), fetchedAt, error: error || undefined };
  } catch (err) {
    return { items: [], fetchedAt, error: String(err) };
  }
}

export const BLOB_STORE = 'news';
export const BLOB_KEY = 'latest';
