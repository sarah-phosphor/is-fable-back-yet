/* ============================================================
   /api/news — live "Coverage" feed for Is Fable Back Yet?

   Source: TheNewsAPI (https://www.thenewsapi.com). Its FREE tier is
   real-time (no delay), unlike GNews free. The API token lives in the
   THENEWSAPI_TOKEN env var and never reaches the browser.

   Quality control is here, not the API's: results are restricted to a
   HARD allowlist of reputable outlets, gated on topic relevance, and
   de-duped — so the rail only ever shows real journalism. Anything
   that doesn't clear the bar is dropped, and the client falls back to
   its curated list, so the rail is never empty.

   Free tier = 3 articles/request. We pull a couple of pages and cache
   the response at the edge for 60 min, so TheNewsAPI is hit ~48×/day —
   well under the 100/day free cap, no matter the traffic.

   Contract: always 200 with { items: [...] }. On any failure (missing
   token, API error, network) items is [].
   ============================================================ */

const API_ENDPOINT = 'https://api.thenewsapi.com/v1/news/all';
const SEARCH = '"Fable 5" | "Mythos 5" | "Claude Fable"';
const PAGES = 2;            // free tier returns 3/page; 2 pages ≈ 6 candidates
const MAX_ITEMS = 7;
const CACHE_SECONDS = 3600; // 60 min edge cache → ~48 API calls/day

// HARD allowlist — only these outlets ever appear. domain → display name.
// (TheNewsAPI's `source` field is a bare domain like "reuters.com".)
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
  ['axios.com', 'Axios'],
  ['semafor.com', 'Semafor'],
  ['theinformation.com', 'The Information'],
  ['techcrunch.com', 'TechCrunch'],
  ['engadget.com', 'Engadget'],
  ['venturebeat.com', 'VentureBeat'],
  ['zdnet.com', 'ZDNet'],
  ['theregister.com', 'The Register'],
  ['tomshardware.com', "Tom's Hardware"],
  ['marktechpost.com', 'MarkTechPost'],
  ['theconversation.com', 'The Conversation'],
  ['techmeme.com', 'Techmeme'],
  ['anthropic.com', 'Anthropic'],
]);

// Relevance gate: the piece must actually be about this story.
const TOPIC = /\b(fable|mythos|anthropic)\b/i;

function domainOf(source) {
  return String(source || '').toLowerCase().replace(/^www\./, '').trim();
}

/**
 * Shape raw TheNewsAPI articles into the rail's item format, applying
 * the allowlist + relevance + dedup. Pure + exported for unit tests.
 */
export function shapeArticles(articles) {
  const seen = new Set();
  const out = [];
  for (const a of articles || []) {
    if (!a || !a.url || !a.title) continue;

    const outlet = REPUTABLE.get(domainOf(a.source));
    if (!outlet) continue;                                   // strict allowlist

    const text = `${a.title} ${a.description || ''} ${a.snippet || ''}`;
    if (!TOPIC.test(text)) continue;                         // on-topic only

    const headline = String(a.title).trim();
    const key = headline.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(a.url) || seen.has(key)) continue;          // dedup url + title
    seen.add(a.url);
    seen.add(key);

    out.push({ outlet, headline, url: a.url, date: a.published_at || null });
  }

  const ts = (i) => new Date(i.date || 0).getTime();
  out.sort((x, y) => ts(y) - ts(x));                         // newest first
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
      // Netlify's own edge cache (protects the free API quota).
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

export default async (req) => {
  const token = process.env.THENEWSAPI_TOKEN;
  if (!token) return json({ items: [], error: 'THENEWSAPI_TOKEN not set' });

  let debug = false;
  try { debug = new URL(req.url).searchParams.get('debug') === '1'; } catch {}

  try {
    const primary = await fetchPages(token, SEARCH, PAGES);
    const items = shapeArticles(primary.articles);

    // TEMP: ?debug=1 dumps raw articles so we can tune the filter, then remove.
    if (debug) {
      const broad = await fetchPages(token, 'Anthropic', 1);
      const dump = (arr) => arr.map((a) => ({ title: a.title, source: a.source, published_at: a.published_at }));
      return json({
        configuredQuery: SEARCH,
        primary: { count: primary.articles.length, error: primary.error, articles: dump(primary.articles) },
        broadProbe: { query: 'Anthropic', count: broad.articles.length, error: broad.error, articles: dump(broad.articles) },
        filteredCount: items.length,
        items,
      }, { maxAge: 0 });
    }

    return json(
      { items, source: 'thenewsapi', fetchedAt: new Date().toISOString(), error: primary.error || undefined },
      { maxAge: items.length ? CACHE_SECONDS : 0 },   // don't cache an empty result
    );
  } catch (err) {
    return json({ items: [], error: String(err) });
  }
};

// Functions v2: serve at /api/news (no redirect rule needed).
export const config = { path: '/api/news' };
