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

The Coverage rail **auto-updates** with the latest reporting. It's fed by a serverless function
([`netlify/functions/news.mjs`](netlify/functions/news.mjs)) that serves a clean list at `/api/news`,
warmed hourly by a scheduled function ([`refresh-news.mjs`](netlify/functions/refresh-news.mjs)).
The browser polls `/api/news` every 10 minutes.

Source: **[Google News RSS search](https://news.google.com/rss/search)** — free, keyless, no daily
quota, and far broader coverage than a metered news API. Google indexes the whole web (~100
candidates per query); the allowlist below does the quality control: broad in, strict out.

Quality control lives in the function, not the source:

- **Hard allowlist** — only reputable outlets (Reuters, Bloomberg, The Verge, CNBC, The Guardian,
  Vox, Wired, NBC News, Al Jazeera, BBC, Anthropic, …) ever appear. The outlet is read from each
  RSS item's `<source>` tag (the `<link>` is a `news.google.com` redirect).
- **Relevance gate** — keep only if the headline names Fable/Mythos, or names Anthropic plus an
  outage/fight word (offline, ban, restore, white house…).
- **Dedup** — by URL and headline, killing rewrite-spam copies.

The curated list in [`app.js`](app.js) (`CURATED`) is a set of **hand-picked anchors** — vetted
articles that always show (some are relevant by context, not keywords, so no filter could be trusted
to find them). The live feed merges fresh, filter-passing articles on top, newest first. The rail is
never blank.

The hourly refresh stores the shaped feed in Netlify Blobs, so a page view is a cheap blob read
rather than a live hit to Google News on every visit.

## Deploy (Netlify)

1. **Create the site.** Push this folder to a git repo and "Add new site" in Netlify. No build
   step — it's static + two functions. `netlify.toml` already sets the publish dir, functions dir,
   and Node version.

2. **Deploy.** That's it — the feed is keyless, so there's nothing to configure. Netlify picks up
   the scheduled `refresh-news` function automatically and the rail goes live on first run.
   (Before the first refresh, `/api/news` returns an empty list and the page shows the curated
   fallback. Nothing breaks.)

## Run it locally

Static-only (curated rail, no live feed) — quickest look:

```sh
python3 -m http.server 4178      # → http://localhost:4178
```

Full stack incl. the live `/api/news` function (no token needed):

```sh
npm i -g netlify-cli
netlify dev                                      # serves the site + functions
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
- `netlify/lib/newsapi.mjs` — Google News RSS fetch + parse, allowlist, relevance, shaping
- `netlify/functions/news.mjs` — `/api/news`: serves the shaped feed from Netlify Blobs
- `netlify/functions/refresh-news.mjs` — hourly scheduled blob warmer
- `netlify.toml` — publish dir, functions dir, Node version
