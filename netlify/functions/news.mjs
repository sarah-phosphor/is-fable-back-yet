/* ============================================================
   /api/news — live "Coverage" feed for Is Fable Back Yet?

   Runs server-side on Netlify (Functions v2). The GNews API key
   lives in the GNEWS_API_KEY env var and never reaches the browser.
   Queries GNews, de-dupes, prefers reputable outlets, sorts newest
   first, and is CDN-cached so GNews is hit at most ~once per window
   no matter how much traffic the page gets.

   Contract: always responds 200 with { items: [...] }. On any
   failure (missing key, GNews error, network) items is []. The
   client then falls back to its own curated list, so the rail is
   never empty.
   ============================================================ */

const GNEWS_ENDPOINT = 'https://gnews.io/api/v4/search';
const QUERY = '("Claude Fable" OR "Fable 5" OR "Mythos 5") AND Anthropic';
const MAX_ITEMS = 7;
const CACHE_SECONDS = 900; // 15 min

// Outlets surfaced first. NOT an exclusion list — anything GNews
// returns can still appear; these just win ties for inclusion.
const REPUTABLE = new Set([
  'anthropic', 'reuters', 'bloomberg', 'the verge', 'techcrunch',
  'ars technica', 'wired', 'al jazeera', 'bbc', 'bbc news', 'the guardian',
  'financial times', 'the new york times', 'the wall street journal',
  "tom's hardware", 'business insider', 'the conversation', 'marktechpost',
  'axios', 'cnbc', 'engadget', 'venturebeat', 'the information', 'techmeme',
]);

/**
 * Shape raw GNews articles into the rail's item format.
 * Pure + exported so it can be unit-tested without a network call.
 */
export function shapeArticles(articles) {
  const seen = new Set();
  const all = [];
  for (const a of articles || []) {
    if (!a || !a.url || !a.title) continue;
    const headline = String(a.title).trim();
    const key = headline.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(a.url) || seen.has(key)) continue; // de-dupe by url + title
    seen.add(a.url);
    seen.add(key);
    all.push({
      outlet: (a.source && a.source.name ? String(a.source.name) : '').trim(),
      headline,
      url: a.url,
      date: a.publishedAt || null, // ISO timestamp
    });
  }

  const ts = (i) => new Date(i.date || 0).getTime();
  const byRecency = (x, y) => ts(y) - ts(x);
  const isRep = (i) => REPUTABLE.has(i.outlet.toLowerCase());

  // Reputability decides *inclusion* when there are more than MAX_ITEMS;
  // recency decides *order* (the rail says "newest first").
  const reputable = all.filter(isRep).sort(byRecency);
  const rest = all.filter((i) => !isRep(i)).sort(byRecency);
  return [...reputable, ...rest].slice(0, MAX_ITEMS).sort(byRecency);
}

function json(body, { status = 200, maxAge = 0 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge > 0
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`
        : 'no-store',
    },
  });
}

export default async () => {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return json({ items: [], error: 'GNEWS_API_KEY not set' });

  const url = `${GNEWS_ENDPOINT}?q=${encodeURIComponent(QUERY)}`
    + `&lang=en&max=10&sortby=publishedAt&in=title,description`
    + `&apikey=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'comebackfable.com' } });
    if (!res.ok) return json({ items: [], error: `gnews ${res.status}` });

    const data = await res.json();
    const items = shapeArticles(data.articles);
    // Only CDN-cache real, non-empty results so a transient empty
    // response doesn't pin the fallback for the whole window.
    return json(
      { items, source: 'gnews', fetchedAt: new Date().toISOString() },
      { maxAge: items.length ? CACHE_SECONDS : 0 },
    );
  } catch (err) {
    return json({ items: [], error: String(err) });
  }
};

// Functions v2: serve this at /api/news (no redirect rule needed).
export const config = { path: '/api/news' };
