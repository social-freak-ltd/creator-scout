// The demo's server routes, shared by the local server (server.mjs) and the Vercel
// functions in api/. Keys come from the environment and never reach the browser.
import { experimental_decide as decide } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const API = "https://api.socialfetch.dev";

// Only the endpoints the page uses, so a public deployment can't be used as an open
// proxy to the whole API on the demo key.
const ALLOWED = [
  /^\/v1\/tiktok\/(users\/search|search)$/,
  /^\/v1\/tiktok\/profiles\/[^/]+(\/(videos|followers|audience))?$/,
  /^\/v2\/instagram\/(profiles|reels)\/search$/,
  /^\/v2\/instagram\/profiles\/[^/]+$/,
  /^\/v1\/youtube\/(search|channel|channels\/videos|videos)$/,
  /^\/v1\/(twitter|reddit)\/search$/,
  /^\/v1\/linktree\/profiles\/[^/]+$/,
];

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" };

/** Forwards one Social Fetch call. `path` is e.g. "/v1/tiktok/search", `search` is "?query=…". */
export async function relay(res, path, search) {
  if (!ALLOWED.some((re) => re.test(path))) {
    res.writeHead(403, JSON_HEADERS);
    return res.end(JSON.stringify({ error: { message: "This demo doesn't use that endpoint." } }));
  }
  const started = Date.now();
  const call = () => fetch(API + path + search, { headers: { "x-api-key": process.env.SOCIALFETCH_API_KEY, accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
  let upstream = await call();
  // One quiet retry for rate limits and transient upstream errors keeps the demo smooth.
  if (upstream.status === 429 || upstream.status >= 500) {
    await new Promise((r) => setTimeout(r, 900));
    upstream = await call();
  }
  const body = await upstream.text();
  res.writeHead(upstream.status, { ...JSON_HEADERS, "x-elapsed-ms": String(Date.now() - started) });
  res.end(body);
}

// AI screening with Jev, TypeSafe's decision model, via the AI SDK's experimental_decide
// and OpenRouter's Decisions API. Jev answers typed questions about a "state" with
// calibrated probabilities instead of generating text, so each creator costs ~0.3 s
// and a fraction of a cent.
let jevModel;
const jev = () => (jevModel ??= process.env.OPENROUTER_API_KEY ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY }).evaluationModel("typesafe/jev-1.13") : null);

const KIND_CRITERIA = {
  creator: "One individual person posting their own content: influencer, reviewer, vlogger, stylist, blogger",
  brand: "A company, shop, store, product line or service selling things",
  entertainment: "A music artist, band, DJ, record label, film, TV show, game or celebrity fan club",
  media: "A magazine, news site, publisher, deals aggregator or multi-author channel",
  fan_or_meme: "A fan page, meme page, repost or compilation account that doesn't make original content",
};

function jevQuestions(topic) {
  return {
    niche: {
      type: "score",
      instructions: `How much of this account's own content (bio and post captions) is about "${topic}". Judge the content, not the account name alone.`,
      criteria: [
        `Nothing to do with ${topic}`,
        `Mentions ${topic} once or in passing`,
        `Regularly posts about ${topic} or closely related products`,
        `Mainly a ${topic} account: most posts are about it`,
      ],
    },
    kind: { type: "choice", instructions: "What kind of account this is", criteria: KIND_CRITERIA },
    partner: { type: "boolean", instructions: `This account could credibly promote ${topic} products to its followers as an affiliate partner` },
  };
}

async function judgeOne(topic, state) {
  // decide() retries 429s and transient errors itself (maxRetries defaults to 2).
  const { answers: a, providerMetadata } = await decide({
    model: jev(),
    state: { search_topic: topic, ...state },
    questions: jevQuestions(topic),
    abortSignal: AbortSignal.timeout(10_000),
  });
  const p = a.niche.probabilities;
  // Expected level on 0..1, used only to rank; the most likely level is shown as text.
  const fit = a.niche.score / 3;
  const level = Number(Object.entries(p).sort((x, y) => y[1] - x[1])[0][0]);
  const meta = providerMetadata?.openrouter;
  return { fit, level, kind: a.kind.choice, kindConfidence: meta?.answers?.kind?.confidence ?? Math.max(...Object.values(a.kind.probabilities)), partner: a.partner.probability, cost: meta?.usage?.cost || 0 };
}

async function judgeAll(topic, items) {
  const out = {};
  if (!jev()) return out;
  await Promise.all(items.map(async ({ id, state }) => {
    try { out[id] = await judgeOne(topic, state); } catch (e) { console.warn("judge failed", id, e.message); }
  }));
  return out;
}

/** POST { topic, items: [{ id, state }] } → { [id]: verdict }. */
export async function judge(req, res) {
  let body = req.body;
  if (body == null || typeof body === "string") {
    let raw = typeof body === "string" ? body : "";
    if (!raw) for await (const chunk of req) raw += chunk;
    body = JSON.parse(raw || "{}");
  }
  const started = Date.now();
  const results = await judgeAll(String(body.topic || "").slice(0, 120), (body.items || []).slice(0, 40));
  res.writeHead(200, { ...JSON_HEADERS, "x-elapsed-ms": String(Date.now() - started) });
  res.end(JSON.stringify(results));
}

const IMAGE_HOSTS = /(tiktokcdn[\w.-]*\.com|cdninstagram\.com|fbcdn\.net|ytimg\.com|ggpht\.com|googleusercontent\.com)$/;

/** Relays a creator image (platform CDNs block hotlinking from other sites). */
export async function image(res, u) {
  let src;
  try { src = new URL(u ?? ""); } catch { return res.writeHead(400).end(); }
  if (!IMAGE_HOSTS.test(src.hostname)) return res.writeHead(400).end();
  const upstream = await fetch(src, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!upstream.ok) return res.writeHead(upstream.status).end();
  res.writeHead(200, { "content-type": upstream.headers.get("content-type") ?? "image/jpeg", "cache-control": "public, max-age=86400" });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

export function ping(res) {
  res.writeHead(200, { "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end("ok");
}
