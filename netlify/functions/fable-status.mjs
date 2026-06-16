/* ============================================================
   /api/fable-status — is Claude Fable 5 being served again?

   A fail-safe, zero-token availability check. We ask Anthropic's
   Models API whether `claude-fable-5` exists for our key — a
   metadata lookup, NOT a billed generation:

     • 200 OK        → model is served again → { status: 'up' }
     • 404 / 403     → still pulled          → { status: 'down' }
     • anything else → unknown (network, 5xx, 429, missing/bad key)
                       → { status: null }, so the page holds its
                       current state and NEVER false-flips to "up".

   The key (ANTHROPIC_API_KEY) lives in Netlify env, server-side
   only — it is never shipped to the browser.
   ============================================================ */

const MODEL_ID = 'claude-fable-5';
const API_ENDPOINT = `https://api.anthropic.com/v1/models/${MODEL_ID}`;
const CACHE_SECONDS = 60;   // edge-cache a definitive result for 60s

function json(body, { maxAge = 0 } = {}) {
  const live = maxAge > 0;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': live
        ? `public, max-age=${maxAge}, s-maxage=${maxAge}`
        : 'no-store',
      'netlify-cdn-cache-control': live
        ? `public, durable, s-maxage=${maxAge}`
        : 'no-store',
    },
  });
}

export default async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ status: null, reason: 'ANTHROPIC_API_KEY not set' });

  try {
    const res = await fetch(API_ENDPOINT, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'user-agent': 'comebackfable.com',
      },
    });

    if (res.status === 200) {
      return json({ status: 'up', checkedAt: new Date().toISOString() }, { maxAge: CACHE_SECONDS });
    }
    if (res.status === 404 || res.status === 403) {
      return json({ status: 'down', checkedAt: new Date().toISOString() }, { maxAge: CACHE_SECONDS });
    }
    // 401 (bad key), 429, 5xx, anything else → unknown; don't cache, retry soon.
    return json({ status: null, reason: `HTTP ${res.status}` });
  } catch (err) {
    return json({ status: null, reason: String(err) });
  }
};

export const config = { path: '/api/fable-status' };
