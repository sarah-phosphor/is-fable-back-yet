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

The Coverage rail **auto-updates** with the latest reporting, in real time. It's fed by a
serverless function ([`netlify/functions/news.mjs`](netlify/functions/news.mjs)) that queries
**[TheNewsAPI](https://www.thenewsapi.com)** server-side and serves a clean list at `/api/news`.
The browser polls that endpoint every 10 minutes.

Why TheNewsAPI: its **free tier is real-time** (no delay), unlike GNews free (12-hour delay).

Quality control lives in the function, not the API:

- **Hard allowlist** — only reputable outlets (Reuters, Bloomberg, The Verge, CNBC, The Guardian,
  Vox, Wired, NBC News, Al Jazeera, BBC, Anthropic, …) ever appear.
- **Relevance gate** — judged on the headline **and the URL slug**, because a newsroom's slug tags
  the topic even when the headline doesn't (Vox's "Trump just found the worst way to regulate AI"
  lives at `/anthropic-fable-claude-ban-…`). Keep only if it names Fable/Mythos, or names Anthropic
  plus an outage/fight word (offline, ban, restore, white house…).
- **Dedup** — by URL and headline, killing rewrite-spam copies.

The curated list in [`app.js`](app.js) (`CURATED`) is a set of **hand-picked anchors** — vetted
articles that always show (some are relevant by context, not keywords, so no filter could be trusted
to find them). The live feed merges fresh, filter-passing articles on top, newest first. The rail is
never blank.

The token stays server-side (never shipped to the browser), and the response is edge-cached for
60 minutes, so TheNewsAPI is hit ~48×/day — well under the free 100/day cap.

## Deploy (Netlify)

1. **Create the site.** Push this folder to a git repo and "Add new site" in Netlify. No build
   step — it's static + one function. `netlify.toml` already sets the publish dir, functions dir,
   and Node version.

2. **Get a token.** Sign up free at [thenewsapi.com](https://www.thenewsapi.com) and copy your
   **API token** (free tier: real-time, 100 requests/day, 3 articles/request).

3. **Set it in Netlify.** Site config → Environment variables → add
   `THENEWSAPI_TOKEN = <your token>`. Redeploy. The rail goes live.
   (Until the token is set, `/api/news` returns an empty list and the page shows the curated
   fallback. Nothing breaks.)

## Run it locally

Static-only (curated rail, no live feed) — quickest look:

```sh
python3 -m http.server 4178      # → http://localhost:4178
```

Full stack incl. the live `/api/news` function:

```sh
npm i -g netlify-cli
echo "THENEWSAPI_TOKEN=your_token_here" > .env   # gitignored
netlify dev                                      # serves the site + function
```

## Notes

- The "time without Fable" counter ticks live from June 12 2026, 5:21pm ET; each field only
  repaints when its value actually changes.
- Coverage shows day-granular relative dates ("2 days ago"), recomputed live. Ask if you'd like
  finer "X hours ago" freshness.
- Respects `prefers-reduced-motion`, has visible focus states, stacks to one column under 800px.

## Files

- `index.html` — markup (both verdict states present; CSS shows one based on `data-status`)
- `styles.css` — all styling
- `app.js` — the `STATUS` switch, live counter, coverage fetch + curated fallback
- `netlify/functions/news.mjs` — `/api/news`: TheNewsAPI fetch, allowlist, relevance, caching
- `netlify.toml` — publish dir, functions dir, Node version
