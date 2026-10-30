// Shared rendering: creator cards, the profile drawer and the outreach modal.
import { $, esc, fmt, pct, img, ago, flag, toast, ICONS, PLATFORM_NAME, reEscape } from "./util.js";
import { notCreator, aiCreator, KIND_LABEL } from "./ai.js";
import { score, loadPosts, loadAudience } from "./creators.js";
import { pipeline } from "./pipeline.js";

const loading = (c) => c.status !== "ready" && c.status !== "failed";

/** Marks the search words and their related words, matched at the start of a word ("shades", "Eyewear"). */
export function highlight(text, tokens = []) {
  const out = esc(text || "");
  const words = [...new Set(tokens.filter((t) => t.length > 1).map((t) => t.toLowerCase()))].sort((a, b) => b.length - a.length);
  if (!words.length) return out;
  const re = new RegExp(`(?<![\p{L}\p{N}])(${words.map((t) => reEscape(esc(t))).join("|")})`, "giu");
  return out.replace(re, "<mark>$1</mark>");
}

export function avatarHtml(c, { badge = true } = {}) {
  const initials = esc((c.name || c.handle || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?");
  const usable = c.avatar && !/\.heic(\?|$)/.test(c.avatar);
  return `<div class="avatar-wrap"><div class="avatar">${initials}${usable ? `<img src="${img(c.avatar)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>${badge ? `<span class="pbadge">${ICONS[c.platform]}</span>` : ""}</div>`;
}

export function handleText(c) {
  if (c.platform === "youtube") return c.ytHandle ? "@" + c.ytHandle : String(c.handle).startsWith("UC") ? "YouTube channel" : "@" + c.handle;
  return "@" + c.handle;
}

function fitRing(c) {
  const r = 19, len = 2 * Math.PI * r, v = c.fit?.total;
  return `<div class="fit ${v >= 70 ? "hi" : ""}" title="Fit score"><svg viewBox="0 0 46 46"><circle class="track" cx="23" cy="23" r="${r}"/><circle class="bar" cx="23" cy="23" r="${r}" stroke-dasharray="${len}" stroke-dashoffset="${len}" data-off="${v == null ? len : len * (1 - v / 100)}"/></svg><div class="num">${v ?? '<span class="muted">…</span>'}</div></div>`;
}

function metricCells(c) {
  const busy = loading(c);
  const cell = (v, k) => `<div class="metric"><div class="v ${busy && v === "—" ? "shimmer" : ""}">${v}</div><div class="k">${k}</div></div>`;
  const followers = cell(fmt(c.followers), c.platform === "youtube" ? "subscribers" : "followers");
  if (c.platform === "youtube") return followers + cell(fmt(c.avgViews), "avg views") + cell(fmt(c.posts), "videos");
  const third = c.er != null ? cell(pct(c.er), "engagement") : c.avgViews ? cell(fmt(c.avgViews), "avg views") : cell("—", "engagement");
  return followers + cell(fmt(c.avgLikes), "avg likes") + third;
}

function tagsHtml(c, ctx) {
  if (loading(c)) return `<span class="tag shimmer" style="width:96px">&nbsp;</span><span class="tag shimmer" style="width:70px">&nbsp;</span><span class="tag shimmer" style="width:54px">&nbsp;</span>`;
  if (c.status === "failed") return `<span class="tag warn">Profile unavailable</span>`;
  const t = [];
  if (ctx?.tool === "vips" && c.followsBrand) t.push(`<span class="tag violet">Follows @${esc(c.followsBrand)}</span>`);
  if (ctx?.groups?.length > 1 && c.topic) t.push(`<span class="tag violet">${esc(c.topic)}</span>`);
  if (c.mentions?.some((m) => m.code)) t.push(`<span class="tag red">Shares a code</span>`);
  if (c.emails.length) t.push(`<span class="tag good">✉ Email</span>`);
  else if (c.collab) t.push(`<span class="tag good">Open to collabs</span>`);
  if (c.shop?.length) t.push(`<span class="tag blue">🛍 ${esc(c.shop[0])}</span>`);
  else if (c.usesCodes) t.push(`<span class="tag blue">Uses promo codes</span>`);
  if (ctx?.ai && c.ai) {
    if (notCreator(c)) t.unshift(`<span class="tag warn" title="Judged by Jev">✦ ${KIND_LABEL[c.ai.kind]}</span>`);
    else if (c.ai.level >= 2) t.unshift(`<span class="tag ai" title="Judged by Jev from bio and captions">✦ ${c.ai.level === 3 ? "Dedicated" : "Regular"} ${esc(c.ai.topic)} creator</span>`);
    else if (c.ai.fit >= 0.3 && c.ai.partner >= 0.6) t.unshift(`<span class="tag ai" title="Judged by Jev from bio and captions">✦ Good ${esc(c.ai.topic)} fit</span>`);
    else if (c.ai.fit < 0.3) t.unshift(`<span class="tag warn" title="Judged by Jev from bio and captions">✦ Off-topic</span>`);
  }
  if (c.kind === "brand" && !(ctx?.ai && (notCreator(c) || aiCreator(c)))) t.push(`<span class="tag warn">Brand account</span>`);
  if (c.region) t.push(`<span class="tag">${flag(c.region)} ${esc(c.region.length > 14 ? c.region.slice(0, 13) + "…" : c.region)}</span>`);
  if (!t.length) t.push(`<span class="tag">Creator</span>`);
  return t.slice(0, 4).join("");
}

function mentionsStrip(c) {
  const m = (c.mentions || []).filter((x) => x.thumb).slice(0, 3);
  if (!m.length) return "";
  return `<div class="mentions">${m.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.caption)}"><img src="${img(x.thumb)}" alt="" loading="lazy" onerror="this.remove()"><span>${x.views ? "▶ " + fmt(x.views) : ""}</span></a>`).join("")}</div>`;
}

/** Create or refresh one card inside `grid`. */
export function renderCard(grid, c, ctx, { fresh = false, onOpen } = {}) {
  let el = grid.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
  if (!el) {
    el = document.createElement("article");
    el.className = "card";
    el.dataset.id = c.id;
    grid.append(el);
  } else if (!fresh) el.classList.add("static");
  if (c.status === "ready" && ctx) c.fit = score(c, ctx);
  const short = pipeline.has(c.id);
  el.classList.toggle("short", short);
  const showMentions = ctx?.tool === "advocates" && c.mentions?.length;
  el.innerHTML = `
    <div class="card-head">
      ${avatarHtml(c)}
      <div class="who">
        <div class="name">${esc(c.name || c.handle)}${c.verified ? ICONS.tick : ""}</div>
        <div class="handle">${esc(handleText(c))}${c.followsBrand && ctx?.tool !== "vips" ? "" : ""}</div>
      </div>
      ${fitRing(c)}
    </div>
    ${showMentions ? mentionsStrip(c) : `<div class="bio ${!c.bio && loading(c) ? "shimmer" : ""}">${c.bio ? highlight(c.bio, ctx?.highlight || ctx?.tokens) : loading(c) ? "&nbsp;" : '<span class="muted">No bio</span>'}</div>`}
    <div class="metrics">${metricCells(c)}</div>
    <div class="tags">${tagsHtml(c, ctx)}</div>
    <div class="card-foot">
      <button class="btn ghost sm" data-act="view">View profile</button>
      <button class="btn sm ${short ? "blue" : ""}" data-act="short">${short ? "✓ Shortlisted" : "+ Shortlist"}</button>
    </div>`;
  el.onclick = (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (e.target.closest(".mentions a")) return;
    if (act === "short") { toggleShortlist(c, ctx); return; }
    (onOpen || openDrawer)(c, ctx);
  };
  requestAnimationFrame(() => {
    const bar = el.querySelector(".fit .bar");
    if (bar) bar.style.strokeDashoffset = bar.dataset.off;
  });
  return el;
}

export function toggleShortlist(c, ctx) {
  const on = pipeline.toggle(c, ctx?.label || "Creator Scout", { brand: ctx?.brand, keyword: ctx?.keyword });
  toast(on ? `Added ${c.name || c.handle} to your pipeline` : `Removed ${c.name || c.handle}`);
}

/** Reorder cards with a smooth slide (FLIP). */
export function sortGrid(grid, value) {
  const els = [...grid.children];
  const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
  els.sort((a, b) => value(b.dataset.id) - value(a.dataset.id));
  for (const el of els) grid.append(el);
  for (const el of els) {
    if (el.style.display === "none") continue;
    const a = first.get(el), b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
}

/* ---------- Drawer ---------- */
let drawerFor = null;
let drawerCtx = null;
let drawerAbort = null;

export function openDrawer(c, ctx) {
  drawerFor = c; drawerCtx = ctx;
  drawerAbort?.abort();
  drawerAbort = new AbortController();
  $("drawer").classList.add("open"); $("scrim").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  $("drawerBody").scrollTop = 0;
  paintDrawer();
  if (c.status === "ready" || c.status === "failed") {
    loadPosts(c, { signal: drawerAbort.signal }).then(() => { if (drawerFor === c) paintDrawer(); refreshCard(c); }).catch((e) => {
      if (!e?.aborted && drawerFor === c) { c.postsError = true; paintDrawer(); }
    });
  }
}
export function closeDrawer() {
  $("drawer").classList.remove("open"); $("scrim").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  drawerFor = null;
}
export const refreshDrawer = (c) => { if (drawerFor && (!c || drawerFor === c)) paintDrawer(); };

function refreshCard(c) {
  for (const el of document.querySelectorAll(`[data-id="${CSS.escape(c.id)}"]`)) {
    const grid = el.parentElement;
    if (grid?._ctx) renderCard(grid, c, grid._ctx);
  }
  pipeline.refresh(c);
}

function paintDrawer() {
  const c = drawerFor, ctx = drawerCtx;
  if (!c) return;
  if (c.status === "ready" && ctx) c.fit = score(c, ctx);
  const posts = c.recent || [];
  const postsLoading = !c.postsLoaded && !(posts.length >= 6) && !c.postsError;
  const fit = c.fit;
  const why = fit ? fit.parts.map((p) => `
      <div class="why-row${p.ai ? " ai" : ""}"><div>${esc(p.key)}<small>${esc(p.note)}</small></div><div class="bar"><span data-w="${Math.round(p.value / p.max * 100)}"></span></div><div class="n">${p.value}/${p.max}</div></div>`).join("") : "";

  const insights = [];
  if (c.cadenceDays) insights.push(["Posting rhythm", c.cadenceDays < 1.5 ? "Daily" : `Every ${c.cadenceDays.toFixed(1)} days`]);
  if (c.lastPost) insights.push(["Last post", ago(c.lastPost)]);
  if (c.avgViews && c.platform !== "youtube") insights.push(["Avg views (recent)", fmt(c.avgViews)]);
  if (c.sponsoredShare != null && c.recent) insights.push(["Paid / #ad posts", c.sponsoredShare ? `${Math.round(c.sponsoredShare * 100)}% of recent posts` : "None recently"]);
  if (c.shop?.length) insights.push(["Earns via", c.shop.join(", ")]);
  if (c.joined) insights.push(["On platform since", since(c.joined)]);

  const codes = [...(c.bioCodes || []), ...(c.postCodes || []), ...(c.mentions || []).filter((m) => m.code).map((m) => ({ code: m.code, discount: m.discount }))];
  const uniqCodes = [...new Map(codes.map((x) => [x.code, x])).values()];

  const maxViews = Math.max(1, ...posts.map((p) => p.views || p.likes || 0));
  const chartPosts = posts.slice(0, 16).reverse();
  const chart = chartPosts.length ? `
    <div class="section-t">Recent performance <span>${c.platform === "instagram" && !posts.some((p) => p.views) ? "likes" : "views"} per post, oldest → newest</span></div>
    <div class="chart">${chartPosts.map((p) => { const v = p.views || p.likes || 0; return `<div class="${v === maxViews ? "top" : ""}" data-h="${Math.max(3, v / maxViews * 88)}" data-l="${fmt(v)}${p.createdAt ? " · " + ago(p.createdAt) : ""}" style="height:3px"></div>`; }).join("")}</div>
    <div class="chart-note"><span>${chartPosts[0]?.createdAt ? ago(chartPosts[0].createdAt) : ""}</span><span>best: ${fmt(maxViews)}</span><span>${chartPosts.at(-1)?.createdAt ? ago(chartPosts.at(-1).createdAt) : ""}</span></div>` : "";

  const contact = [
    ...c.emails.map((e) => `<a href="mailto:${esc(e)}">${ICONS.mail}<span>${esc(e)}</span><span class="k">Email</span></a>`),
    ...(c.socials || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${ICONS[s.platform] || "🔗"}<span>@${esc(s.handle)}</span><span class="k">Also on ${PLATFORM_NAME[s.platform]}</span></a>`),
    ...c.links.filter((l) => !(c.socials || []).some((s) => s.url === l)).slice(0, 5).map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener">🔗<span>${esc(l.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</span><span class="k">${esc(linkKind(l))}</span></a>`),
  ].join("");

  const mentions = (c.mentions || []).slice(0, 6);
  const audience = c.platform === "tiktok" ? `
    <div class="section-t">Audience location <span>${c.audience ? "share of followers" : "where their followers are"}</span></div>
    ${c.audience ? `<div class="geo">${c.audience.slice(0, 6).map((a) => `<div class="geo-row"><span>${flag(a.countryCode)}</span><span>${esc(a.country)}</span><div class="bar"><span data-w="${parseFloat(a.percentage)}"></span></div><span class="n">${esc(a.percentage)}</span></div>`).join("")}</div>`
      : `<button class="btn ghost sm" id="dAudience">${c.audienceLoading ? "Analysing audience…" : "Analyse audience"}</button>`}` : "";

  $("drawerBody").innerHTML = `
    <div class="d-head">${avatarHtml(c)}<div style="min-width:0">
      <h3>${esc(c.name || c.handle)}${c.verified ? ICONS.tick : ""}</h3>
      <div class="handle">${ICONS[c.platform]} ${esc(PLATFORM_NAME[c.platform])} · ${esc(handleText(c))}${c.region ? ` · ${flag(c.region)} ${esc(c.region)}` : ""}${c.category ? ` · ${esc(c.category)}` : ""}</div>
    </div></div>
    <div class="d-bio">${c.bio ? highlight(c.bio, ctx?.highlight || ctx?.tokens) : '<span class="muted">No bio</span>'}</div>
    <div class="d-stats">
      <div class="metric"><div class="v">${fmt(c.followers)}</div><div class="k">${c.platform === "youtube" ? "subscribers" : "followers"}</div></div>
      <div class="metric"><div class="v">${c.platform === "youtube" ? fmt(c.avgViews) : pct(c.er)}</div><div class="k">${c.platform === "youtube" ? "avg views" : c.erFromPosts ? `engagement · per ${c.erBasis === "views" ? "view" : "follower"}` : "engagement"}</div></div>
      <div class="metric"><div class="v">${c.platform === "youtube" ? fmt(c.totalViews) : fmt(c.avgLikes)}</div><div class="k">${c.platform === "youtube" ? "total views" : "avg likes"}</div></div>
      <div class="metric"><div class="v" style="color:var(--blue)">${fit?.total ?? "—"}</div><div class="k">fit score</div></div>
    </div>
    ${fit ? `<div class="section-t">Why this creator <span>${esc(ctx?.label || "")}</span></div><div class="why">${why}</div>` : ""}
    ${mentions.length ? `<div class="section-t">Their posts about ${esc(ctx?.brand || c.topic || ctx?.keyword || "this")} <span>${mentions.length} found</span></div>
      <div class="posts ${c.platform === "youtube" ? "yt" : ""}">${mentions.map((m, i) => postTile(m, i)).join("")}</div>` : ""}
    ${uniqCodes.length ? `<div class="section-t">Discount codes they share <span>from bio and captions</span></div><div class="brands">${uniqCodes.map((x) => `<span class="tag red" style="font-family:var(--mono)">${esc(x.code)}${x.discount ? " · " + esc(x.discount) : ""}</span>`).join("")}</div>` : ""}
    ${insights.length ? `<div class="section-t">Signals</div><div class="insights">${insights.map(([k, v]) => `<div class="insight"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>` : ""}
    ${c.brandsTagged?.length ? `<div class="section-t">Brands &amp; accounts they tag <span>last ${posts.length} posts</span></div><div class="brands">${c.brandsTagged.map(([h, n]) => `<span class="tag">@${esc(h)}${n > 1 ? ` ×${n}` : ""}</span>`).join("")}</div>` : ""}
    ${chart}
    <div class="section-t">Recent posts <span>${postsLoading ? "loading live…" : c.postsError ? "couldn't load" : `${Math.min(9, posts.length)} latest`}</span></div>
    <div class="posts ${c.platform === "youtube" ? "yt" : ""}">${postsLoading ? Array.from({ length: 6 }, () => '<div class="post shimmer"></div>').join("") : posts.slice(0, 9).map((p, i) => postTile(p, i)).join("") || '<span class="muted">No public posts</span>'}</div>
    ${audience}
    <div class="section-t">Contact <span>public profile only</span></div>
    <div class="contact">${contact || '<span class="muted" style="font-size:14px">No public contact details</span>'}</div>`;

  const short = pipeline.has(c.id);
  $("drawerFoot").innerHTML = `
    <a class="btn ghost" href="${esc(c.url)}" target="_blank" rel="noopener">Open on ${PLATFORM_NAME[c.platform]}</a>
    <button class="btn ghost" id="dDraft">${ICONS.mail} Draft outreach</button>
    <button class="btn ${short ? "blue" : ""}" id="dShort">${short ? "✓ Shortlisted" : "+ Shortlist"}</button>`;
  $("dShort").onclick = () => { toggleShortlist(c, ctx); paintDrawer(); };
  $("dDraft").onclick = () => openOutreach(c, ctx);
  const aud = $("dAudience");
  if (aud) aud.onclick = async () => {
    c.audienceLoading = true; paintDrawer();
    try { await loadAudience(c, { signal: drawerAbort.signal }); } catch { toast("Couldn't load audience"); }
    c.audienceLoading = false;
    if (drawerFor === c) paintDrawer();
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const s of $("drawerBody").querySelectorAll("[data-w]")) s.style.width = s.dataset.w + "%";
    for (const s of $("drawerBody").querySelectorAll(".chart [data-h]")) s.style.height = s.dataset.h + "px";
  }));
}

function since(v) {
  const s = String(v).replace(/^Joined /, "");
  const d = new Date(/^\d{4}-\d{2}$/.test(s) ? s + "-01" : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function postTile(p, i) {
  const views = p.views ? "▶ " + fmt(p.views) : p.likes != null ? "♥ " + fmt(p.likes) : "";
  const likes = p.views && p.likes != null ? "♥ " + fmt(p.likes) : "";
  const tag = p.code ? `<span class="sp">code ${esc(p.code)}</span>` : /#(ad|sponsored|partner)\b/i.test(p.caption || "") ? '<span class="sp">#ad</span>' : "";
  return `<a class="post" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc((p.caption || "").slice(0, 200))}" style="animation-delay:${i * 50}ms">${p.thumb ? `<img src="${img(p.thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${tag}<div class="ov"><span>${views}</span><span>${likes}</span></div></a>`;
}

function linkKind(l) {
  if (/shopltk|liketk|ltk\.app/i.test(l)) return "LTK";
  if (/shopmy/i.test(l)) return "ShopMy";
  if (/amazon|amzn/i.test(l)) return "Amazon";
  if (/linktr\.ee/i.test(l)) return "Linktree";
  if (/beacons|stan\.store/i.test(l)) return "Storefront";
  return "Link";
}

/* ---------- Outreach ---------- */
export function openOutreach(c, ctx) {
  const first = (c.name || c.handle).replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/)[0] || "there";
  const greet = /^[A-Z][a-z]+$/.test(first) ? first : "there";
  // On a brand search, quote their post about that brand; otherwise their strongest recent post.
  const pool = ctx?.brand && c.mentions?.length ? c.mentions : c.recent || c.mentions || [];
  const best = pool.filter((p) => p.views || p.likes).sort((a, b) => (b.views || b.likes) - (a.views || a.likes))[0];
  const topic = ctx?.brand || ctx?.keyword || "";
  const brandLine = ctx?.brand
    ? `You already talk about ${ctx.brand}, so this should feel natural.`
    : topic ? `Your ${topic} content is exactly what the brands in our network are looking for.` : "Your content is exactly what the brands in our network are looking for.";
  const hook = best ? `Your ${pool === c.mentions && ctx?.brand ? `${ctx.brand} ` : "recent "}post${best.caption ? ` “${best.caption.replace(/\s+/g, " ").slice(0, 70).trim()}${best.caption.length > 70 ? "…" : ""}”` : ""} pulled ${fmt(best.views || best.likes)} ${best.views ? "views" : "likes"}, which is why you came up at the top of our list.`
    : `We came across your ${PLATFORM_NAME[c.platform]} and loved what you're building.`;
  const subject = `Paid partnership${ctx?.brand ? ": " + ctx.brand : ""}`;
  const body = `Hi ${greet},

I'm [Your name] from [Your company]. We work with brands to get creators paid for the shopping content they already make.

${hook} ${brandLine}

How it works:
• You get your own discount code for your audience
• You earn commission on every sale, tracked automatically
• You only promote brands you actually like

Would you be open to a quick chat this week? Happy to send over the brand list${topic ? " for " + topic : ""}.

Thanks,
[Your name]
[Your company]`;
  $("oTo").value = c.emails[0] || "";
  $("oSubject").value = subject;
  $("oBody").value = body;
  $("oTitle").textContent = `Outreach to ${c.name || c.handle}`;
  $("oHint").textContent = c.emails[0] ? "Email found on their public profile" : c.collab ? "No public email; they say they're open to collabs, so a DM works" : "No public email; send as a DM";
  $("modal").classList.add("open");
  $("oSend").onclick = () => {
    const to = $("oTo").value.trim();
    location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent($("oSubject").value)}&body=${encodeURIComponent($("oBody").value)}`;
    if (pipeline.has(c.id)) pipeline.move(c.id, "contacted");
  };
  $("oCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(`Subject: ${$("oSubject").value}\n\n${$("oBody").value}`); toast("Copied to clipboard"); } catch { toast("Select the text and copy it"); }
  };
}
export function closeModal() { $("modal").classList.remove("open"); }
