/* ============================================================
   refresh-news — scheduled cache warmer for the Coverage feed.

   Runs hourly at :05 and stores the shaped feed in Netlify Blobs. The
   source is Google News RSS (free, keyless, no quota), so the only reason
   to schedule rather than pull per-request is to keep /api/news instant
   and decoupled from Google's feed availability.

   On a failed pull (network blip / non-200 from Google) it KEEPS the last
   good data rather than overwriting it with an empty feed.
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

// Hourly at :05 UTC.
export const config = { schedule: '5 * * * *' };
