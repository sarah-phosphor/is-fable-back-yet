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

  // Never replace good stored data with an empty feed. We write only when the
  // pull returned items; an empty/errored pull (network blip, or Google's
  // datacenter consent/throttle page — which 200s with no <item>s) keeps the
  // last-good blob. The one exception: if nothing is stored yet, seed whatever
  // we have so the cold-start path has something to serve.
  let wrote = false;
  if (!error && items.length) {
    await store.setJSON(BLOB_KEY, { items, fetchedAt });
    wrote = true;
  } else {
    const existing = await store.get(BLOB_KEY, { type: 'json' });
    if (!existing) {
      await store.setJSON(BLOB_KEY, { items, fetchedAt });
      wrote = true;
    }
  }

  const summary = { ok: !error, count: items.length, fetchedAt, error: error || undefined, wrote };
  console.log('refresh-news', JSON.stringify(summary));
  return new Response(JSON.stringify(summary), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

// Hourly at :05 UTC.
export const config = { schedule: '5 * * * *' };
