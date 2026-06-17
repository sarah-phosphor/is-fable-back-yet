/* ============================================================
   refresh-news — scheduled cache warmer for the Coverage feed.

   Runs on a cron (every 2h at :05, so the 00:05 run lands just after
   TheNewsAPI's 00:00 UTC daily-quota reset). It is the ONLY thing that
   spends API quota: ~12 runs/day × ≤2 calls = ≤24/day, well under the
   100/day free cap — and completely decoupled from visitor traffic.

   It pulls the feed and stores the result in Netlify Blobs. /api/news
   then serves straight from Blobs (0 API calls per visit).

   On a failed pull (e.g. 402 over-quota) it KEEPS the last good data
   rather than overwriting it with an empty feed.
   ============================================================ */

import { getStore } from '@netlify/blobs';
import { pullAndShape, BLOB_STORE, BLOB_KEY } from '../lib/newsapi.mjs';

export default async () => {
  const { items, fetchedAt, error } = await pullAndShape();
  const store = getStore(BLOB_STORE);

  // Only overwrite stored data on a clean pull. A clean pull with 0 items is
  // valid (no current coverage); an errored pull is not — keep last good.
  if (!error) {
    await store.setJSON(BLOB_KEY, { items, fetchedAt });
  }

  const summary = { ok: !error, count: items.length, fetchedAt, error: error || undefined, wrote: !error };
  console.log('refresh-news', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

// Every 2 hours at :05 UTC (00:05, 02:05, … 22:05).
export const config = { schedule: '5 */2 * * *' };
