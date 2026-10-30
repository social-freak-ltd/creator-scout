// The creator model: one record per platform account, filled in step by step
// (found in a search → analysed → recent posts loaded), shared by every tool.
import { api } from "./api.js";
import { notCreator, aiCreator, LEVEL_LABEL } from "./ai.js";
import { EMAIL, COLLAB, CODE_HINT, SPONSORED, shopTools, extractCodes } from "./util.js";

export const creators = new Map();
export const SIZE = {
  any: { label: "Any size", range: [1_000, Infinity] },
  nano: { label: "Nano · 1K–10K", range: [1_000, 10_000] },
  micro: { label: "Micro · 10K–100K", range: [10_000, 100_000] },
  mid: { label: "Mid · 100K–1M", range: [100_000, 1_000_000] },
  macro: { label: "Macro · 1M+", range: [1_000_000, Infinity] },
};

export const idOf = (platform, handle) => platform + ":" + String(handle).toLowerCase().replace(/^@/, "");

/** Add or merge what a search told us about an account. Returns the record. */
export function upsert(p) {
  if (!p.handle) return null;
  const id = idOf(p.platform, p.handle);
  const c = creators.get(id);
  if (c) {
    for (const [k, v] of Object.entries(p)) if (v != null && (c[k] == null || k === "mentions")) c[k] = k === "mentions" ? mergeMentions(c.mentions, v) : v;
    return c;
  }
  const fresh = { id, status: "found", emails: [], links: [], socials: [], mentions: [], ...p };
  creators.set(id, fresh);
  return fresh;
}
function mergeMentions(a = [], b = []) {
  const seen = new Set(a.map((m) => m.url));
  return a.concat(b.filter((m) => !seen.has(m.url)));
}

const BRANDY = /\b(official|shop|store|boutique|brand|inc|ltd|llc|labs?|company|clinic|cosmetics|products?|magazine|news|agency|co|hq|global|usa|uk|beauty\s?co|skincare\s?co|deals|coupons?|offers?)\b|\.com\b/i;
const CREATOR_CATEGORIES = /(creator|blogger|influencer|public figure|artist|personal|athlete|coach|chef|writer|video|gamer|musician|model|photographer|journalist|entrepreneur|comedian|dancer|makeup artist|fitness|education|health\/beauty)/i;
// Product nouns in a display name ("BAJÍO Sunglasses") usually mean a brand, unless the bio reads like a person.
const PRODUCT_NAME = /\b(sunglasses|eyewear|optical|skincare|skin\s?care|cosmetics|apparel|clothing|boutique|jewel(?:le)?ry|swimwear|activewear|footwear|shoes|bags|watches|supplements?|nutrition|roasters|furniture|decor|candles?|fragrances?|perfumes?|haircare|lashes|nails|patch(?:es)?|basics|tumblers?)\b/i;
const PERSONAL = /\b(i|i'm|im|i've|my|me|mom|mum|mama|wife|husband|girl|guy|dad|her|she|he|they)\b/i;
const SHOP_BIO = /(#1\s*(store|shop|brand)|\bstore\b|\bshop now\b|\border now\b|\bdm to order\b|\bwe (sell|ship|make|are)\b|\bour (products?|store|shop|collection)\b|\b(free|worldwide|fast) shipping\b|\bfair price\b|\bwholesale\b|\bofficial (page|account|store)\b|\bcustomer service\b)/i;
function classify(c) {
  if (c.platform === "instagram" && c.accountType === "creator") return "creator";
  if (c.platform === "instagram" && c.accountType === "business" && !CREATOR_CATEGORIES.test(c.category || "")) return "brand";
  if (BRANDY.test(`${c.name} ${c.handle}`)) return "brand";
  // "Shop my Amazon store" is an affiliate creator, not a shop: only count shop language without first-person words.
  if (SHOP_BIO.test(c.bio || "") && !/\b(my|i|i'm|im|me)\b/i.test(c.bio || "")) return "brand";
  if (PRODUCT_NAME.test(c.name || "") && !PERSONAL.test(c.bio || "")) return "brand";
  return "creator";
}

/** Fill in a creator from their profile. Safe to call twice; only runs once. */
export async function analyse(c, { signal } = {}) {
  if (c.status === "ready" || c.status === "analysing") return c;
  c.status = "analysing";
  try {
    if (c.platform === "tiktok") await analyseTikTok(c, signal);
    if (c.platform === "instagram") await analyseInstagram(c, signal);
    if (c.platform === "youtube") await analyseYouTube(c, signal);
    const linktree = c.links.find((l) => /linktr\.ee\/[\w.-]+/i.test(l));
    if (linktree) await expandLinktree(c, linktree, signal).catch(() => {});
    finish(c);
    c.status = "ready";
  } catch (e) {
    c.status = e?.aborted ? "found" : "failed";
    if (e?.aborted) throw e;
  }
  return c;
}

async function analyseTikTok(c, signal) {
  const d = await api(`/v1/tiktok/profiles/${encodeURIComponent(c.handle)}`, { signal });
  if (d.lookupStatus && d.lookupStatus !== "found") throw new Error("not found");
  const p = d.profile || {};
  Object.assign(c, {
    name: p.displayName || c.name, bio: p.bio || c.bio, verified: p.verified, avatar: p.avatarUrls?.medium || c.avatar,
    followers: d.metrics?.followers ?? c.followers, likes: d.metrics?.likes, posts: d.metrics?.posts,
    url: p.profileUrl || c.url, region: p.region || c.region || null, seller: p.isSeller || p.isCommerceUser,
    joined: p.accountCreatedAt,
  });
  for (const [k, v] of Object.entries(p)) if (/link/i.test(k) && typeof v === "string" && /^https?:/.test(v)) c.links.push(v);
  if (c.likes && c.posts) c.avgLikes = c.likes / c.posts;
}

async function analyseInstagram(c, signal) {
  const d = await api(`/v2/instagram/profiles/${encodeURIComponent(c.handle)}?include=recentMedia,about`, { signal });
  if (d.lookupStatus && d.lookupStatus !== "found") throw new Error("not found");
  const p = d.profile || {};
  Object.assign(c, {
    name: p.displayName || c.name, bio: p.bio, verified: p.verified, avatar: p.avatarUrlHd || p.avatarUrl || c.avatar,
    followers: p.metrics?.followers, posts: p.metrics?.posts, accountType: p.accountType, category: p.category,
    url: p.profileUrl || c.url, region: d.about?.accountBasedIn || c.region || null, joined: d.about?.joinedMonth,
  });
  if (p.externalUrl) c.links.push(p.externalUrl);
  for (const l of p.bioLinks || []) if (l.url) c.links.push(l.url);
  if (p.contact) for (const v of Object.values(p.contact)) if (typeof v === "string" && v.includes("@")) c.emails.push(v);
  const media = (d.recentMedia || []).map(igPost);
  if (media.length) setPosts(c, media);
}

async function analyseYouTube(c, signal) {
  const q = c.channelId ? `channelId=${encodeURIComponent(c.channelId)}` : `handle=${encodeURIComponent(c.handle)}`;
  const d = await api(`/v1/youtube/channel?${q}`, { signal });
  if (d.lookupStatus && d.lookupStatus !== "found") throw new Error("not found");
  const ch = d.channel || {};
  Object.assign(c, {
    name: ch.displayName || c.name, ytHandle: ch.handle, bio: ch.bio || c.bio, verified: ch.verified, avatar: ch.avatarUrl || c.avatar,
    followers: d.metrics?.subscribers ?? c.followers, posts: d.metrics?.videos, region: ch.country || c.region || null,
    url: ch.profileUrl || c.url, channelId: ch.platformUserId || c.channelId, totalViews: d.metrics?.views, joined: ch.joinedDateText,
  });
  if (d.metrics?.views && d.metrics?.videos) c.avgViews = d.metrics.views / d.metrics.videos;
  for (const l of ch.externalLinks || []) {
    const e = l.match(EMAIL);
    if (e) c.emails.push(e[0]); else c.links.push(l);
  }
}

async function expandLinktree(c, url, signal) {
  const handle = url.match(/linktr\.ee\/([\w.-]+)/i)[1];
  const d = await api(`/v1/linktree/profiles/${encodeURIComponent(handle)}`, { signal });
  c.linktree = { handle, links: d.links || [], socials: d.socials || [] };
  for (const l of d.links || []) if (l.url) c.links.push(l.url);
  for (const s of d.socials || []) {
    const u = s.url || s.href || "";
    const m = u.match(EMAIL);
    if (m) c.emails.push(m[0]);
    else if (u) c.links.push(u);
  }
}

function finish(c) {
  for (const e of (c.bio || "").match(EMAIL) || []) c.emails.push(e);
  c.emails = [...new Set(c.emails.map((e) => e.toLowerCase().replace(/^mailto:/, "")))];
  c.links = [...new Set(c.links.filter(Boolean))];
  c.kind = classify(c);
  c.shop = shopTools(c.links.concat(c.bio || ""));
  c.collab = COLLAB.test(c.bio || "") || c.emails.length > 0;
  c.bioCodes = extractCodes(c.bio || "");
  c.usesCodes = c.bioCodes.length > 0 || CODE_HINT.test(c.bio || "");
  const socials = new Map();
  for (const l of c.links) {
    const m = l.match(/(?:instagram\.com|tiktok\.com\/@|youtube\.com\/@?|x\.com|twitter\.com)\/?@?([\w.-]+)/i);
    if (!m) continue;
    const platform = /instagram/i.test(l) ? "instagram" : /tiktok/i.test(l) ? "tiktok" : /youtube/i.test(l) ? "youtube" : "twitter";
    if (platform !== c.platform && !socials.has(platform)) socials.set(platform, { platform, handle: m[1], url: l });
  }
  c.socials = [...socials.values()];
}

/* ---------- Recent posts ---------- */
function igPost(m) {
  return {
    thumb: m.thumbnailUrl || m.imageUrl, url: m.url, caption: m.caption || "", createdAt: m.createdAt,
    views: m.metrics?.playCount ?? null, likes: m.metrics?.likesHidden ? null : m.metrics?.likeCount ?? null, comments: m.metrics?.commentCount ?? null,
  };
}

function setPosts(c, posts) {
  // Newest first. Pinned posts aren't always flagged, so never trust the order we get.
  posts = posts.slice().sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
  c.recent = posts;
  const withLikes = posts.filter((p) => p.likes != null);
  const viewed = posts.filter((p) => p.views);
  if (viewed.length) c.avgViews = viewed.reduce((s, p) => s + p.views, 0) / viewed.length;
  if (withLikes.length) c.avgLikes = withLikes.reduce((s, p) => s + p.likes, 0) / withLikes.length;
  const both = withLikes.filter((p) => p.views);
  if (c.platform === "tiktok" && both.length) {
    // TikTok: interactions per view, the usual short-video measure.
    c.er = both.reduce((s, p) => s + p.likes + (p.comments || 0), 0) / both.reduce((s, p) => s + p.views, 0);
    c.erBasis = "views";
  } else if (withLikes.length && c.followers) {
    c.er = Math.min(withLikes.reduce((s, p) => s + p.likes + (p.comments || 0), 0) / withLikes.length / c.followers, 0.6);
    c.erBasis = "followers";
  }
  if (c.er != null) c.erFromPosts = c.erBasis === "views" ? both.length : withLikes.length;
  const dates = posts.map((p) => new Date(p.createdAt).getTime()).filter(Boolean);
  if (dates.length > 2) {
    c.lastPost = new Date(dates[0]).toISOString();
    const gaps = dates.slice(1).map((d, i) => (dates[i] - d) / 864e5).sort((a, b) => a - b);
    c.cadenceDays = gaps[Math.floor(gaps.length / 2)];
  }
  const captions = posts.map((p) => p.caption || "");
  c.sponsoredShare = captions.length ? captions.filter((t) => SPONSORED.test(t)).length / captions.length : 0;
  const mentions = new Map();
  for (const t of captions) for (const m of t.matchAll(/@([\w.]{3,30})/g)) {
    const h = m[1].replace(/\.$/, "").toLowerCase();
    if (h !== String(c.handle).toLowerCase()) mentions.set(h, (mentions.get(h) || 0) + 1);
  }
  c.brandsTagged = [...mentions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  c.postCodes = [...new Map(captions.flatMap(extractCodes).map((x) => [x.code, x])).values()];
  if (c.postCodes.length) c.usesCodes = true;
}

export async function loadPosts(c, { signal, priority = 1 } = {}) {
  if (c.recent?.length >= 6 || c.postsLoaded) return c.recent || [];
  if (c.postsPromise) return c.postsPromise;
  c.postsPromise = fetchPosts(c, signal, priority).finally(() => { c.postsPromise = null; });
  return c.postsPromise;
}
async function fetchPosts(c, signal, priority) {
  let posts = [];
  if (c.platform === "tiktok") {
    const d = await api(`/v1/tiktok/profiles/${encodeURIComponent(c.handle)}/videos?trim=true`, { signal, priority });
    posts = (d.videos || []).map((v) => ({ thumb: v.thumbnailUrl, url: v.url, caption: v.caption || "", createdAt: v.createdAt, views: v.stats?.views, likes: v.stats?.likes, comments: v.stats?.comments, pinned: v.pinned }));
  } else if (c.platform === "instagram") {
    const d = await api(`/v2/instagram/profiles/${encodeURIComponent(c.handle)}/media`, { signal, priority });
    posts = (d.media || []).map(igPost);
  } else {
    const q = c.channelId ? `channelId=${encodeURIComponent(c.channelId)}` : `handle=${encodeURIComponent(c.ytHandle || c.handle)}`;
    const d = await api(`/v1/youtube/channels/videos?${q}`, { signal, priority });
    posts = (d.videos || []).map((v) => ({ thumb: v.thumbnailUrl, url: v.url, caption: v.title || "", createdAt: v.publishedAt, views: v.viewCount, likes: null, comments: null }));
  }
  c.postsLoaded = true;
  // Pinned TikToks are often years old; drop the ones flagged, and setPosts sorts by date for the rest.
  setPosts(c, posts.filter((p) => !p.pinned).length >= 3 ? posts.filter((p) => !p.pinned) : posts);
  return c.recent;
}

export async function loadAudience(c, { signal } = {}) {
  if (c.audience) return c.audience;
  const d = await api(`/v1/tiktok/profiles/${encodeURIComponent(c.handle)}/audience`, { signal });
  c.audience = d.audienceLocations || [];
  return c.audience;
}

/* ---------- Fit score ---------- */
/** ctx: { tokens: string[], size: key of SIZE, brand?: string } */
/**
 * Fit for an affiliate deal, out of 100. Relevance carries the most weight: a creator who
 * really makes content in the category is worth more than a big account that posted once.
 * Each part has a curve, so a strong creator lands in the 80s–90s without being perfect
 * on every signal.
 */
export function score(c, ctx) {
  const [lo, hi] = SIZE[ctx.size || "any"].range;
  const f = c.followers ?? 0;
  const parts = [];
  const curve = (x) => Math.sqrt(Math.max(0, Math.min(1, x))); // rewards "good" nearly as much as "best"

  // Content counts fully; a keyword only in the account name counts for less.
  const content = `${c.bio || ""} ${(c.recent || []).map((p) => p.caption).join(" ")} ${(c.mentions || []).map((m) => m.caption).join(" ")} ${c.category || ""}`.toLowerCase();
  const nameText = `${c.name} ${c.handle}`.toLowerCase();
  // With several categories (a sweep), a creator only needs to match the one they came from.
  const groups = ctx.groups?.length > 1 ? ctx.groups : [ctx.tokens || []];
  const ratio = (toks) => toks.length ? toks.reduce((s, t) => s + (content.includes(t) ? 1 : nameText.includes(t) ? 0.4 : 0), 0) / toks.length : 0.5;
  const hits = Math.max(...groups.map(ratio));
  const ai = ctx.ai && c.ai;
  if (ai) {
    // Jev read the bio and captions; keyword matching is only the fallback.
    // Linear in on-topic-ness, so a dedicated creator clearly outranks a one-off post.
    const value = Math.round(35 * (0.75 * ai.fit + 0.25 * ai.partner));
    parts.push({ key: "Relevance", value: Math.min(35, value), max: 35, note: `${LEVEL_LABEL(ai.topic)[ai.level]} (AI read the bio and captions)`, ai: true });
  } else {
    const relevance = Math.round(28 * hits) + Math.min(7, (c.mentions?.length || 0) * 4);
    parts.push({ key: "Relevance", value: Math.min(35, relevance), max: 35, note: c.mentions?.length ? `Posted about it ${c.mentions.length}×` : hits ? "Talks about this niche" : "Weak topic match" });
  }

  const inRange = f >= lo && f <= hi;
  const near = f >= lo / 2 && f <= hi * 2;
  parts.push({ key: "Audience size", value: inRange ? 15 : near ? 10 : f ? 4 : 0, max: 15, note: inRange ? "In your target range" : near ? "Just outside your range" : "Outside your range" });

  // Healthy benchmarks: 5% of viewers or 3% of followers interacting, or 15% of subscribers watching.
  let eng = 0, engNote = "Not measured yet";
  if (c.er != null) { eng = Math.round(20 * curve(c.er / (c.erBasis === "views" ? 0.05 : 0.03))); engNote = `${(c.er * 100).toFixed(1)}% engagement ${c.erBasis === "views" ? "per view" : "per follower"}`; }
  else if (c.avgViews && f) { const r = c.avgViews / f; eng = Math.round(20 * curve(r / 0.15)); engNote = `${Math.round(r * 100)}% of subscribers watch each video`; }
  parts.push({ key: "Engagement", value: eng, max: 20, note: engNote });

  const reach = c.emails.length ? 15 : c.collab ? 12 : c.links.length ? 10 : 0;
  parts.push({ key: "Reachable", value: reach, max: 15, note: c.emails.length ? "Public business email" : c.collab ? "Open to collabs" : c.links.length ? "Contact links in bio" : "No contact route" });

  const aff = Math.min(15, (c.shop?.length ? 8 : 0) + (c.usesCodes ? 6 : 0) + (c.mentions?.some((m) => m.code) ? 6 : 0) + (c.sponsoredShare > 0 ? 4 : 0) + (c.brandsTagged?.length ? 3 : 0) + (c.links.length ? 2 : 0));
  parts.push({ key: "Affiliate-ready", value: aff, max: 15, note: c.shop?.length ? c.shop.join(", ") : c.usesCodes ? "Already shares discount codes" : c.sponsoredShare ? "Has done paid posts" : c.brandsTagged?.length ? "Already tags brands" : "No affiliate signals yet" });

  let total = parts.reduce((s, p) => s + p.value, 0);
  if ((c.kind === "brand" && !(ctx.ai && aiCreator(c))) || (ctx.ai && notCreator(c))) total = Math.round(total * 0.5);
  // Off-topic accounts can't ride on reach and engagement alone.
  if (ai && ai.fit < 0.3) total = Math.round(total * (0.4 + ai.fit));
  return { total: Math.max(3, Math.min(99, total)), parts };
}
