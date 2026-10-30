// Streams search results into a Board: every search's creators are queued for
// analysis the moment that search lands, so cards appear after one round trip.
import { analyse, upsert, loadPosts, SIZE } from "../creators.js";
import { PLATFORM_NAME } from "../util.js";
import { judge, aiReject } from "../ai.js";

export const BRANDS = [
  { name: "Glossier", icon: "💄", category: "makeup", tiktok: "glossier" },
  { name: "COSRX", icon: "🌿", category: "k-beauty skincare", tiktok: "cosrx_official" },
  { name: "Olaplex", icon: "💇", category: "hair care", tiktok: "olaplex" },
  { name: "Sol de Janeiro", icon: "🌴", category: "perfume", tiktok: "soldejaneiro" },
  { name: "HOKA", icon: "👟", category: "running shoes", tiktok: "hoka" },
];

export const tokensOf = (s) => String(s || "").toLowerCase().split(/[\s&,/]+/).filter((t) => t.length > 2 && !["and", "the", "for", "with"].includes(t));

/**
 * searches: [{ platform, run: () => Promise<partial creators[]> }]
 * rank(c): higher = analyse sooner. Returns when everything is analysed.
 * aiTopic(c): when given, Jev screens every creator found (before picking who to analyse)
 * and again once their posts are in.
 */
export async function harvest({ board, signal, searches, budget = 16, rank, onFound, onAnalysed, aiTopic }) {
  const rejudge = (c) => (aiTopic && c.status === "ready" ? judge(c, aiTopic(c)).then(() => { if (!signal.aborted) { board.update(c); onAnalysed?.(c); } }) : null);
  const left = {};
  const steps = {};
  const found = {};
  const jobs = [];
  for (const s of searches) {
    left[s.platform] ??= budget;
    found[s.platform] ??= 0;
    steps[s.platform] ??= board.step(`Searching ${PLATFORM_NAME[s.platform]}`);
  }
  const queued = new Set();
  const take = (platform, n) => {
    if (signal.aborted) return;
    const picks = [...board.pool].filter((c) => c.platform === platform && c.status === "found" && !queued.has(c.id) && !(aiTopic && (judging.has(c) || aiReject(c))))
      .sort((a, b) => rank(b) - rank(a)).slice(0, Math.min(n, left[platform]));
    left[platform] -= picks.length;
    picks.forEach((c, i) => {
      queued.add(c.id);
      c.status = "queued";
      board.add(c, i * 90);
      jobs.push(analyse(c, { signal }).then(() => {
        board.update(c);
        onAnalysed?.(c);
        // Recent posts give real engagement, posting rhythm and relevance; fetch them right after.
        if (c.status === "ready" && c.platform !== "instagram") return loadPosts(c, { signal, priority: 2 }).then(() => { board.update(c); onAnalysed?.(c); }, () => {}).then(() => rejudge(c));
        return rejudge(c);
      }, (e) => { if (!e?.aborted) board.update(c); }));
    });
    steps[platform].set(`${PLATFORM_NAME[platform]}: ${found[platform]} found · analysing ${budget - left[platform]}`);
  };
  board.pool ??= new Set();
  const screen = aiTopic ? board.step("✦ AI screening results") : null;
  const screened = new Set();
  const judging = new Set(); // found by one search, still being screened: another search must not pick it meanwhile
  const showScreen = () => {
    const out = [...screened].filter(aiReject).length;
    screen?.set(`✦ AI screened ${screened.size} accounts · skipped ${out} brands, bands and off-topic pages`);
  };
  const runs = searches.map((s) => s.run().then(async (partials) => {
    const fresh = [];
    for (const p of partials) {
      const c = upsert(p);
      if (!c || board.pool.has(c)) continue;
      board.pool.add(c);
      fresh.push(c);
      found[s.platform]++;
      if (c.status === "ready") board.add(c, 0); // already analysed by another tool
      onFound?.(c);
    }
    // Screen what the search returned before spending profile lookups on it (never wait more than 4 s).
    if (aiTopic && fresh.length) {
      steps[s.platform].set(`${PLATFORM_NAME[s.platform]}: AI screening ${fresh.length} results`);
      await Promise.race([Promise.all(fresh.map((c) => (judging.add(c), judge(c, aiTopic(c))).then(() => { judging.delete(c); if (c.ai) { screened.add(c); showScreen(); } }))), new Promise((ok) => setTimeout(ok, 4000))]);
      for (const c of fresh) judging.delete(c);
      for (const c of fresh) if (c.status === "ready") board.update(c);
    }
    take(s.platform, Math.ceil(budget / 2));
  }, (e) => { if (!e?.aborted) steps[s.platform].set(`${PLATFORM_NAME[s.platform]}: one search failed`); }));
  await Promise.allSettled(runs);
  for (const p of Object.keys(left)) take(p, left[p]);
  for (let n = -1; n !== jobs.length;) { n = jobs.length; await Promise.allSettled(jobs); }
  if (signal.aborted) return;
  if (screen) { showScreen(); screen.done(); }
  for (const p of Object.keys(steps)) {
    const done = budget - left[p];
    if (found[p] === 0) steps[p].fail(`${PLATFORM_NAME[p]}: nothing found`);
    else steps[p].done(`${PLATFORM_NAME[p]}: ${found[p]} found · ${done} analysed`);
  }
}

export function sizeRank(sizeKey) {
  const [lo, hi] = SIZE[sizeKey].range;
  return (c) => {
    const f = c.followers;
    const base = f == null ? 1 : f >= lo && f <= hi ? 3 : f >= lo / 3 && f <= hi * 3 ? 1.5 : 0;
    return base + Math.min(1, (c.hitViews || 0) / 1e6) + (c.mentions?.length || 0) * 0.5;
  };
}

/* Normalisers from search results to partial creators. */
export const from = {
  tiktokUser: (u) => ({ platform: "tiktok", handle: u.handle, name: u.displayName || u.handle, bio: u.bio, followers: u.metrics?.followers, likes: u.metrics?.likes, posts: u.metrics?.posts, verified: u.verified, url: u.profileUrl }),
  tiktokVideo: (v, mention) => {
    const a = v.details?.author || v.author || {};
    const h = a.unique_id || a.handle;
    if (!h) return null;
    const m = { url: v.url, thumb: v.thumbnailUrl, views: v.stats?.views, likes: v.stats?.likes, caption: v.caption || "", createdAt: v.createdAt, platform: "tiktok" };
    return { platform: "tiktok", handle: h, name: a.nickname || h, followers: a.follower_count, url: `https://www.tiktok.com/@${h}`, hitViews: v.stats?.views, ...(mention ? { mentions: [m] } : {}) };
  },
  igAccount: (a) => a.privateAccount ? null : { platform: "instagram", handle: a.handle, name: a.displayName || a.handle, verified: a.verified, avatar: a.avatarUrl, url: `https://www.instagram.com/${a.handle}/` },
  igReel: (r, mention) => {
    const o = r.owner || {};
    if (!o.handle || o.privateAccount) return null;
    const m = { url: r.url, thumb: r.thumbnailUrl || r.imageUrl, views: r.metrics?.playCount, likes: r.metrics?.likesHidden ? null : r.metrics?.likeCount, caption: r.caption || "", createdAt: r.createdAt, platform: "instagram" };
    return { platform: "instagram", handle: o.handle, name: o.displayName || o.handle, verified: o.verified, avatar: o.avatarUrl, url: `https://www.instagram.com/${o.handle}/`, hitViews: r.metrics?.playCount, ...(mention ? { mentions: [m] } : {}) };
  },
  ytChannel: (ch) => ({ platform: "youtube", handle: ch.handle || ch.id, ytHandle: ch.handle, channelId: ch.id, name: ch.name, bio: ch.description, followers: ch.subscriberCount, avatar: ch.thumbnailUrl, url: ch.handle ? `https://www.youtube.com/@${ch.handle}` : `https://www.youtube.com/channel/${ch.id}` }),
  ytVideo: (v, mention) => {
    const ch = v.channel || {};
    if (!ch.handle && !ch.id) return null;
    const m = { url: v.url, thumb: v.thumbnailUrl, views: v.viewCount, caption: v.title || "", createdAt: v.publishedAt, platform: "youtube", videoId: v.id };
    return { platform: "youtube", handle: ch.handle || ch.id, ytHandle: ch.handle, channelId: ch.id, name: ch.title || ch.handle, avatar: ch.thumbnailUrl, url: ch.handle ? `https://www.youtube.com/@${ch.handle}` : v.url, hitViews: v.viewCount, ...(mention ? { mentions: [m] } : {}) };
  },
};

/** Hero markup shared by the tools. */
export function hero({ eyebrow, title, sub, inputId, placeholder, value, prefix = "", extra = "", button, presets = "" }) {
  return `
  <section class="hero">
    <div class="eyebrow">${eyebrow}</div>
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    <form class="search" autocomplete="off">
      <label class="field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>${prefix ? `<span class="prefix">${prefix}</span>` : ""}<input id="${inputId}" placeholder="${placeholder}" value="${value}" aria-label="${placeholder}"></label>
      ${extra}
      <button class="btn" type="submit">${button}</button>
    </form>
    ${presets}
  </section>`;
}

export function statsHtml(defs) {
  return `<section class="stats" hidden>${defs.map(([id, label, hint]) => `<div class="stat"><div class="label">${label}</div><div class="value" id="${id}">0</div><div class="hint">${hint}</div></div>`).join("")}</section>`;
}
