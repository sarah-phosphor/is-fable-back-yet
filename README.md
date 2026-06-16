# Is Fable Back Yet?

A single-serving status page for whether Anthropic's Claude Fable 5 is back online.
Deadpan, monospace, one giant verdict. Built from the Claude Design handoff.

## The only switch

Everything keys off one constant at the top of [`app.js`](app.js):

```js
const STATUS = 'down';   // 'down' | 'up'
```

- `'down'` → red **No**, "Ongoing incident" pill, the live "time without Fable" counter, the epitaph.
- `'up'` → green **Yes**, "Resolved" pill, the counter retires, copy flips to "back online."

Flip that one word when Fable returns. That's the whole site.

## Live coverage rail

The Coverage rail **auto-updates** with the latest reporting. It's fed by a small
serverless function ([`netlify/functions/news.mjs`](netlify/functions/news.mjs)) that
queries the [GNews](https://gnews.io) API server-side, de-dupes, prefers reputable
outlets, sorts newest-first, and serves a clean list at `/api/news`. The browser polls
that endpoint every 10 minutes.

The curated list in [`app.js`](app.js) (`CURATED`) is the **fallback**: it renders
instantly on load and stays whenever the feed is empty or unreachable, so the rail is
never blank.

Why a function instead of fetching news straight from the page? Two reasons: the GNews
key must stay server-side (never shipped to the browser), and browsers block direct
cross-origin calls to the news API. The function solves both — same-origin, key hidden.

## Deploy (Netlify)

1. **Create the site.** Push this folder to a git repo and "Add new site" in Netlify
   (or `netlify deploy`). No build step — it's static + one function. `netlify.toml`
   already sets the publish dir, functions dir, and Node version.

2. **Get a GNews key.** Sign up at [gnews.io](https://gnews.io) (free tier ≈ 100
   req/day — plenty, since the response is CDN-cached for 15 min).

3. **Set the key in Netlify.** Site config → Environment variables → add
   `GNEWS_API_KEY = <your key>`. Redeploy. That's it — the rail goes live.
   (Until the key is set, `/api/news` returns an empty list and the page shows the
   curated fallback. Nothing breaks.)

## Run it locally

Static-only (curated rail, no live feed) — quickest look:

```sh
python3 -m http.server 4178      # → http://localhost:4178
```

Full stack incl. the live `/api/news` function:

```sh
npm i -g netlify-cli
echo "GNEWS_API_KEY=your_key_here" > .env   # gitignored
netlify dev                                 # serves the site + function
```

## Notes

- The "time without Fable" counter ticks live from June 12 2026, 5:21pm ET; each field
  only repaints when its value actually changes.
- Coverage shows day-granular relative dates ("2 days ago"), recomputed live. Ask if
  you'd like finer "X hours ago" freshness.
- Respects `prefers-reduced-motion`, has visible focus states, stacks to one column under 800px.

## Files

- `index.html` — markup (both verdict states present; CSS shows one based on `data-status`)
- `styles.css` — all styling
- `app.js` — the `STATUS` switch, live counter, coverage fetch + curated fallback
- `netlify/functions/news.mjs` — `/api/news`: GNews fetch, shaping, caching
- `netlify.toml` — publish dir, functions dir, Node version
