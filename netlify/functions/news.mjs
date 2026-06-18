/* ============================================================
   /api/news — "Coverage" feed for Is Fable Back Yet?

   Serves the feed that the scheduled `refresh-news` function pulled and
   stored in Netlify Blobs, so a page view is a cheap blob read rather than
   a live hit to Google News on every visit.

   Cold-start fallback: if the blob is empty (e.g. the very first request
   after a fresh deploy, before the first scheduled run), we do ONE live
   pull, persist it, and serve it. Once the blob exists, visitors serve from
   the blob — even if the scheduler later stalls, we serve last-good data
   (with `fetchedAt` so staleness is visible).

   Always 200 with { items: [...] }; [] on any failure so the client falls
   back to its curated anchors and the rail is never empty.
   ============================================================ */

import { getStore } from '@netlify/blobs';
import { pullAndShape, BLOB_STORE, BLOB_KEY } from '../lib/newsapi.mjs';

const CACHE_SECONDS = 600; // 10 min edge cache. Blob reads are cheap (no API
                           // cost), so this only trims function invocations.

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

export default async () => {
  try {
    const store = getStore(BLOB_STORE);
    let data = await store.get(BLOB_KEY, { type: 'json' });

    if (!data) {
      // Cold start: no scheduled run has populated the blob yet. Pull once,
      // persist, serve. This is the only visitor-triggered API spend, and it
      // happens at most once per fresh deploy.
      const { items, fetchedAt, error } = await pullAndShape();
      data = { items, fetchedAt };
      if (!error) {
        try { await store.setJSON(BLOB_KEY, data); } catch { /* best-effort */ }
      }
      return json({ ...data, source: 'blob-coldstart', error: error || undefined }, { maxAge: CACHE_SECONDS });
    }

    return json({ ...data, source: 'blob' }, { maxAge: CACHE_SECONDS });
  } catch (err) {
    // Never let the rail break — client falls back to curated anchors.
    return json({ items: [], error: String(err) }, { maxAge: CACHE_SECONDS });
  }
};

export const config = { path: '/api/news' };
