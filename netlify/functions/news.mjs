/* ============================================================
   /api/news — live "Coverage" feed for Is Fable Back Yet?

   Source: TheNewsAPI (free tier is real-time). Token in env
   (THENEWSAPI_TOKEN), never shipped to the browser.

   Relevance is judged on the headline AND the URL slug — because a
   newsroom's slug tags the topic even when the headline doesn't
   (e.g. Vox's "Trump just found the worst way to regulate AI" lives
   at /anthropic-fable-claude-ban-...). An article is kept only if:
     • a reputable outlet (hard allowlist), AND
     • title-or-slug names Fable/Mythos, OR names Anthropic + an
       outage/fight word (offline, ban, restore, white house, …).

   Always 200 with { items: [...] }; [] on any failure so the client
   falls back to its curated anchors and the rail is never empty.
   ============================================================ */

const API_ENDPOINT = 'https://api.thenewsapi.com/v1/news/all';
const SEARCH = '"Fable 5" | "Mythos 5" | "Claude Fable" | "Anthropic Fable"';
const PAGES = 2;            // free tier returns 3/page; 2 pages ≈ 6 candidates
const MAX_ITEMS = 8;
const CACHE_SECONDS = 3600; // 60 min edge cache, applied to EVERY response incl.
                            // the empty feed. Empty is the normal state; not
                            // caching it meant every visit/poll hit the API live.
                            // Now ~24 refreshes/day × PAGES, regardless of traffic.

// HARD allowlist — only these outlets ever appear. domain → display name.
const REPUTABLE = new Map([
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
  if (FABLE.test(hay)) return true;                       // names Fable/Mythos
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

function json(body, { status = 200, maxAge = 0 } = {}) {
  const live = maxAge > 0;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': live
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`
        : 'no-store',
      'netlify-cdn-cache-control': live
        ? `public, durable, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`
        : 'no-store',
    },
  });
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

export default async () => {
  const token = process.env.THENEWSAPI_TOKEN;
  if (!token) return json({ items: [], error: 'THENEWSAPI_TOKEN not set' });

  try {
    const primary = await fetchPages(token, SEARCH, PAGES);
    const items = shapeArticles(primary.articles);

    return json(
      { items, source: 'thenewsapi', fetchedAt: new Date().toISOString(), error: primary.error || undefined },
      { maxAge: CACHE_SECONDS },   // cache empty results too — uncached empties were the leak
    );
  } catch (err) {
    return json({ items: [], error: String(err) });
  }
};

export const config = { path: '/api/news' };
