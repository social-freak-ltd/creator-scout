# Creator Scout

A one-page app that finds and ranks creators for affiliate recruitment, built on the
[Social Fetch](https://socialfetch.dev) API. Type a category, and it searches TikTok, Instagram
and YouTube, pulls each profile and its recent posts, screens every account with a small AI model,
and ranks the real creators by how well they fit. Everything on screen comes from live API calls.

It's a starting point, not a product: plain JavaScript, no build step, about 3,000 lines.

## Run it locally

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env   # then add your Social Fetch API key
npm start
```

Open http://localhost:4747.

- `SOCIALFETCH_API_KEY` (required): from your Social Fetch dashboard.
- `OPENROUTER_API_KEY` (optional): turns on AI screening in Discover. Without it, Discover still
  works and ranks on keyword matches instead.

The server keeps your keys out of the browser: the page calls `/sf/...`, and the server adds the
`x-api-key` header and forwards the call. It only forwards the endpoints the app uses.

## What's in it

| Tab | What it does |
|---|---|
| Discover | Search a category across TikTok, Instagram and YouTube. Every account is screened, analysed and scored for fit. |
| Brand advocates | Recent posts that mention a brand, grouped by creator, with views. |
| Follower VIPs | Scans a brand's TikTok followers and flags the creators among them. |
| Code watch | A brand's discount codes posted publicly on TikTok, Instagram, YouTube, X and Reddit, and who posted them. |
| Pipeline | Shortlist creators from any tab, move them across stages, draft outreach and export CSV. |

Click any creator for the full profile: why they fit, their posts about the topic, codes they
share, posting rhythm, brands they tag, recent performance, contact details and (TikTok) audience
countries.

## How Discover works

1. **Search.** For each platform it runs a few searches (accounts, videos, and creator-style
   searches such as "haul" and "review"), so it reaches people who make content in the category,
   not just accounts with the word in their name.
2. **Screen.** Each account found goes to an AI decision model (Jev, via OpenRouter and the
   [AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/decisions)) with three questions: how much of
   their content is about the topic, what kind of account it is (creator, brand, music, media, fan
   page), and whether they could credibly promote the category. Brands, bands and off-topic pages
   are skipped before any profile lookups are spent on them. About $0.00003 per account.
3. **Analyse.** The best candidates per platform get a profile lookup and their recent posts, then
   a second, better-informed screening.
4. **Score.** A fit score out of 100: relevance 35, engagement 20, audience size 15, reachable 15
   (public email, open to collabs, contact links), affiliate-ready 15 (storefronts, discount codes,
   paid posts, brands tagged). The profile drawer shows the breakdown.

A Discover run is about 100–120 API calls and finishes in roughly 25 seconds. The bar at the top
shows calls, cost and time as it runs. Cost is shown at $1.35 per 1,000 credits; change
`PRICE_PER_CREDIT` in `public/js/util.js` to match your plan.

## Rough credit use

| Run | Credits |
|---|---|
| Discover, one category | ~100–150 |
| Discover, 5-category sweep | ~350–450 |
| Brand advocates | ~60–80 |
| Follower VIPs, 1,000 followers | ~80–120 |
| Code watch | ~15–25 |
| Open a creator | 1 (audience countries: 30) |

## Deploy to Vercel

`vercel.json` serves `public/` and runs the same routes as functions in `api/`.

```bash
vercel link
vercel env add SOCIALFETCH_API_KEY production
vercel env add OPENROUTER_API_KEY production
vercel deploy --prod
```

## Files

- `lib/routes.mjs`: the API relay (with its endpoint allowlist), the AI screening route and the image relay
- `server.mjs`: local server for the page and those routes; `api/*.mjs`: the same routes on Vercel
- `public/js/api.js`: call queue, live call log, cost and request stats
- `public/js/creators.js`: creator model, profile analysis, recent posts, fit score
- `public/js/ai.js`: batches accounts for AI screening
- `public/js/categories.js`: suggested categories and related words to highlight
- `public/js/ui.js`: cards, profile drawer, outreach draft
- `public/js/board.js`: results grid, filters, sorting, CSV export
- `public/js/tools/*`: one file per tab
