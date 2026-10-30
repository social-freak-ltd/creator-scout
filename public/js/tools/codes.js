// Code watch: find a brand's discount codes posted publicly across social, and the
// creators sharing them (who are affiliates already).
import { api, costMeter, costLine } from "../api.js";
import { $, countUp, fmt, esc, toast, ICONS, PLATFORM_NAME, ago, extractCodes, downloadCsv } from "../util.js";
import { upsert, analyse } from "../creators.js";
import { openDrawer } from "../ui.js";
import { hero, statsHtml, tokensOf, BRANDS } from "./common.js";

const GENERIC = /^(WELCOME|SAVE|FIRST|NEW|HOLIDAY|BF|BFCM|CYBER|SPRING|SUMMER|FALL|WINTER|SALE|EXTRA|TAKE|GET|FREE|VIP|THANKS|HELLO|SIGNUP|EMAIL|SHIP|STUDENT|BDAY|BIRTHDAY|HAPPY|TREAT|GIFT|BLACKFRIDAY)/;
const ASKING = /\b(can i (get|have)|could i (get|have)|does anyone have|anyone got)\b/i;
const SHOPPING = /%|\b(off|discount|sale|order|checkout|shop|shopping|deal|coupon|bogo|buy one)\b/i;
const SPAM =/\b(odds|acca|bet(?:way|9ja|king)?|sportybet|casino|airdrop|crypto|token|referral\s*code\s*for\s*(?:binance|bybit)|giveaway\s*code)\b/i;

export const codes = {
  id: "codes",
  label: "Code watch",
  mount(el) {
    el.innerHTML = `
      ${hero({
        eyebrow: "<b>Code watch</b> · public discount codes across social",
        title: "See every code <em>out in the wild.</em>",
        sub: "Enter a brand. We search TikTok, Instagram, YouTube, X and Reddit for its discount codes, show who's sharing them and how many people saw each one.",
        inputId: "cQ", placeholder: "Brand name, e.g. Glossier", value: "Glossier",
        button: "Find codes",
        presets: `<div class="presets"><div class="label">Example brands</div><div class="preset-row">${BRANDS.map((b) => `<button type="button" class="preset" data-q="${esc(b.name)}"><span class="pi">${b.icon}</span><span><b>${esc(b.name)}</b><small>${esc(b.category[0].toUpperCase() + b.category.slice(1))}</small></span></button>`).join("")}</div></div>`,
      })}
      ${statsHtml([["csCodes", "Codes found", "unique codes, all public"], ["csSightings", "Times posted", "across 5 platforms"], ["csViews", "People who saw them", "views on posts with a code"], ["csCreators", "Creators sharing codes", "affiliates you can recruit"]])}
      <div id="cBody" hidden>
        <div class="progress" id="cProgress"></div>
        <div class="toolbar"><div class="left"><h2 id="cCount">0 codes</h2></div><div class="right"><button class="btn ghost sm" id="cRecruit">Shortlist code sharers</button><button class="btn sm" id="cExport">Export CSV</button></div></div>
        <div class="codes" id="cGrid"></div>
        <div class="empty" id="cEmpty" hidden>No public codes found for this brand. That's good news for their margins.</div>
        <div class="callout"><span class="ci">🔒</span><div><b>Why it matters:</b> every code here can be applied by anyone, including coupon extensions. Creator codes also point straight at people who already sell for the brand, so they're the warmest recruits you'll find.</div></div>
      </div>`;
    let abort = null, brand = "";
    const byCode = new Map();
    const sharers = new Map();
    const seen = new Set();

    for (const p of el.querySelectorAll(".preset")) p.onclick = () => { $("cQ").value = p.dataset.q; el.querySelector("form").requestSubmit(); };

    const stats = () => {
      const list = [...byCode.values()];
      countUp($("csCodes"), list.length);
      countUp($("csSightings"), list.reduce((s, x) => s + x.sightings.length, 0));
      countUp($("csViews"), list.reduce((s, x) => s + x.sightings.reduce((a, y) => a + (y.views || 0), 0), 0), fmt);
      countUp($("csCreators"), sharers.size);
      $("cCount").textContent = `${list.length} code${list.length === 1 ? "" : "s"}`;
      $("cEmpty").hidden = list.length > 0 || document.body.classList.contains("busy");
    };

    function step(text) {
      const s = document.createElement("span");
      s.className = "step";
      s.innerHTML = `<span class="spin"></span><span class="t">${esc(text)}</span>`;
      $("cProgress").append(s);
      return { done: (t) => { s.classList.add("done"); s.querySelector(".t").textContent = t; }, fail: (t) => { s.classList.add("fail"); s.querySelector(".t").textContent = t; } };
    }

    const categoryRe = () => {
      const preset = BRANDS.find((x) => x.name.toLowerCase() === brand.toLowerCase());
      return preset ? new RegExp(tokensOf(preset.category).map((t) => t.replace(/s$/, "")).join("|"), "i") : null;
    };
    const brandRe = () => new RegExp(tokensOf(brand).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s._-]?"), "i");

    function ingest(s) {
      if (!s.text || seen.has(s.url)) return 0;
      if (!brandRe().test(s.text) || SPAM.test(s.text)) return 0;
      if (ASKING.test(s.text)) return 0;
      // X and Reddit are noisy (places, events, other meanings of the name): demand shopping context.
      if ((s.platform === "twitter" || s.platform === "reddit") && !SHOPPING.test(s.text) && !(categoryRe() && categoryRe().test(s.text))) return 0;
      seen.add(s.url);
      let n = 0;
      for (const { code, discount, at } of extractCodes(s.text)) {
        if (brandRe().test(code) && code.length <= brand.length + 2 && !/\d/.test(code)) continue; // the brand name itself
        // Long texts (YouTube descriptions) list codes for many sponsors: keep only codes near this brand's name.
        if (s.text.length > 400 && !brandRe().test(s.text.slice(Math.max(0, at - 160), at + 160))) continue;
        n++;
        let entry = byCode.get(code);
        if (!entry) { entry = { code, discount, sightings: [], kind: GENERIC.test(code) ? "Sitewide code" : "Creator code" }; byCode.set(code, entry); }
        entry.discount ||= discount;
        entry.sightings.push(s);
        if (s.creator && entry.kind === "Creator code") {
          const c = upsert(s.creator);
          if (c) {
            c.mentions = (c.mentions || []).concat(s.mention ? [{ ...s.mention, code, discount }] : []);
            sharers.set(c.id, c);
            analyse(c, { signal: abort.signal }).then(() => render(), () => {});
          }
        }
        render();
      }
      return n;
    }

    function render() {
      const list = [...byCode.values()].sort((a, b) => b.sightings.reduce((s, x) => s + (x.views || 0), 0) - a.sightings.reduce((s, x) => s + (x.views || 0), 0) || b.sightings.length - a.sightings.length);
      const grid = $("cGrid");
      const existing = new Map([...grid.children].map((el) => [el.dataset.code, el]));
      for (const x of list) {
        let card = existing.get(x.code);
        if (!card) { card = document.createElement("article"); card.className = "code-card"; card.dataset.code = x.code; }
        const views = x.sightings.reduce((s, y) => s + (y.views || 0), 0);
        const platforms = [...new Set(x.sightings.map((y) => y.platform))];
        card.innerHTML = `
          <div class="code-top"><div class="code-chip" title="${esc(x.code)}">${esc(x.code)}</div><span class="tag ${x.kind === "Creator code" ? "violet" : "warn"} code-kind">${x.kind}</span></div>
          <div class="code-meta">${x.discount ? `<span class="tag red">${esc(x.discount)}</span>` : ""}<span class="tag">${x.sightings.length} post${x.sightings.length === 1 ? "" : "s"}</span>${views ? `<span class="tag blue">${fmt(views)} views</span>` : ""}${platforms.map((p) => `<span class="tag">${PLATFORM_NAME[p]}</span>`).join("")}</div>
          <div class="sightings">${x.sightings.slice(0, 3).map((y) => `
            <a class="sighting" href="${esc(y.url)}" target="_blank" rel="noopener" ${y.creatorId ? `data-creator="${esc(y.creatorId)}"` : ""}>
              <span class="ico">${ICONS[y.platform]}</span>
              <span class="txt"><b>${esc(y.author)}</b> <span class="muted">${y.date ? "· " + ago(y.date) : ""}</span><div>${highlightCode(y.text, x.code)}</div></span>
              <span class="num">${y.views ? fmt(y.views) + " views" : y.score ? y.score + " upvotes" : ""}</span>
            </a>`).join("")}</div>
          ${x.sightings.some((y) => y.creatorId) ? `<button class="btn ghost sm" data-open="${esc(x.sightings.find((y) => y.creatorId).creatorId)}">View the creator behind it</button>` : ""}`;
        grid.append(card);
        const open = card.querySelector("[data-open]");
        if (open) open.onclick = () => { const c = sharers.get(open.dataset.open); if (c) openDrawer(c, { tool: "codes", label: `Shares ${brand} codes`, brand, tokens: tokensOf(brand), size: "any" }); };
      }
      stats();
    }

    async function go() {
      abort?.abort();
      abort = new AbortController();
      const signal = abort.signal;
      brand = $("cQ").value.trim();
      if (!brand) return;
      byCode.clear(); sharers.clear(); seen.clear();
      $("cGrid").innerHTML = ""; $("cProgress").innerHTML = "";
      el.querySelector(".hero").classList.add("compact");
      el.querySelector(".stats").hidden = false;
      $("cBody").hidden = false;
      for (const id of ["csCodes", "csSightings", "csViews", "csCreators"]) { $(id).dataset.v = 0; $(id).textContent = "0"; }
      document.body.classList.add("busy");
      const b = encodeURIComponent(brand);
      const meter = costMeter();
      const tasks = [
        ["TikTok", [`${brand} code`, `${brand} discount code`], async (q) => {
          const d = await api(`/v1/tiktok/search?query=${encodeURIComponent(q)}&trim=true`, { signal, priority: 0 });
          let n = 0;
          for (const v of d.videos || []) {
            const a = v.details?.author || {};
            const h = a.unique_id;
            n += ingest({ platform: "tiktok", url: v.url, text: v.caption, views: v.stats?.views, date: v.createdAt, author: h ? "@" + h : "TikTok user", creatorId: h ? "tiktok:" + h.toLowerCase() : null,
              creator: h ? { platform: "tiktok", handle: h, name: a.nickname || h, followers: a.follower_count, url: `https://www.tiktok.com/@${h}` } : null,
              mention: { url: v.url, thumb: v.thumbnailUrl, views: v.stats?.views, likes: v.stats?.likes, caption: v.caption, createdAt: v.createdAt } });
          }
          return n;
        }],
        ["Instagram", [`${brand} code`], async (q) => {
          const d = await api(`/v2/instagram/reels/search?query=${encodeURIComponent(q)}`, { signal, priority: 0 });
          let n = 0;
          for (const r of d.media || []) {
            const o = r.owner || {};
            n += ingest({ platform: "instagram", url: r.url, text: r.caption, views: r.metrics?.playCount, date: r.createdAt, author: o.handle ? "@" + o.handle : "Instagram user", creatorId: o.handle ? "instagram:" + o.handle.toLowerCase() : null,
              creator: o.handle ? { platform: "instagram", handle: o.handle, name: o.displayName || o.handle, avatar: o.avatarUrl, url: `https://www.instagram.com/${o.handle}/` } : null,
              mention: { url: r.url, thumb: r.thumbnailUrl || r.imageUrl, views: r.metrics?.playCount, caption: r.caption, createdAt: r.createdAt } });
          }
          return n;
        }],
        ["YouTube", [`${brand} discount code`], async (q) => {
          const d = await api(`/v1/youtube/search?query=${encodeURIComponent(q)}`, { signal, priority: 0 });
          const vids = (d.videos || []).filter((v) => brandRe().test(v.title || "")).slice(0, 8);
          const res = await Promise.allSettled(vids.map((v) => api(`/v1/youtube/videos?url=${encodeURIComponent(v.url)}`, { signal, priority: 0 })));
          let n = 0;
          res.forEach((r, i) => {
            if (r.status !== "fulfilled") return;
            const v = vids[i], det = r.value;
            const ch = det.channel || v.channel || {};
            const h = ch.handle;
            n += ingest({ platform: "youtube", url: v.url, text: `${det.video?.title || v.title}\n${det.video?.description || ""}`, views: det.metrics?.views ?? v.viewCount, date: det.video?.publishedAt || v.publishedAt, author: ch.displayName || ch.title || "YouTube channel", creatorId: h ? "youtube:" + h.toLowerCase() : null,
              creator: h ? { platform: "youtube", handle: h, ytHandle: h, channelId: ch.platformUserId || ch.id, name: ch.displayName || ch.title || h, url: `https://www.youtube.com/@${h}` } : null,
              mention: { url: v.url, thumb: v.thumbnailUrl, views: det.metrics?.views ?? v.viewCount, caption: det.video?.title || v.title, createdAt: v.publishedAt } });
          });
          return n;
        }],
        ["X", [`${brand} code`, `${brand} promo code`], async (q) => {
          const d = await api(`/v1/twitter/search?query=${encodeURIComponent(q)}`, { signal, priority: 0 });
          let n = 0;
          for (const t of d.tweets || []) n += ingest({ platform: "twitter", url: t.url, text: t.text, views: t.metrics?.views, date: t.createdAt, author: "@" + (t.author?.handle || "user") });
          return n;
        }],
        ["Reddit", [`${brand} discount code`, `${brand} promo code`], async (q) => {
          const d = await api(`/v1/reddit/search?query=${encodeURIComponent(q)}&trim=true`, { signal, priority: 0 });
          let n = 0;
          for (const p of d.posts || []) n += ingest({ platform: "reddit", url: p.url, text: `${p.title}\n${p.bodyText || ""}`, score: p.score, date: p.createdAt, author: p.subredditPrefixedName || "Reddit" });
          return n;
        }],
      ];
      await Promise.allSettled(tasks.map(async ([label, queries, fn]) => {
        const s = step(`Searching ${label}`);
        const results = await Promise.allSettled(queries.map(fn));
        if (signal.aborted) return;
        const n = results.reduce((a, r) => a + (r.status === "fulfilled" ? r.value : 0), 0);
        if (results.every((r) => r.status === "rejected")) s.fail(`${label}: search failed`);
        else s.done(`${label}: ${n} code mention${n === 1 ? "" : "s"}`);
      }));
      if (signal.aborted) return;
      document.body.classList.remove("busy");
      stats();
      const cost = step(`💵 ${costLine(meter(), byCode.size, "code found")}`);
      cost.done(`💵 ${costLine(meter(), byCode.size, "code found")}`);
      $("cProgress").lastChild.classList.add("cost");
      toast(byCode.size ? `${byCode.size} public codes found for ${brand}` : `No public codes found for ${brand}`);
    }

    $("cRecruit").onclick = async () => {
      const { pipeline } = await import("../pipeline.js");
      let n = 0;
      for (const c of sharers.values()) if (!pipeline.has(c.id)) { pipeline.add(c, `Shares ${brand} codes`, { brand }); n++; }
      toast(n ? `Added ${n} code-sharing creators to your pipeline` : "They're already in your pipeline");
    };
    $("cExport").onclick = () => {
      const rows = [...byCode.values()].flatMap((x) => x.sightings.map((s) => [x.code, x.kind, x.discount, PLATFORM_NAME[s.platform], s.author, s.views, s.date, s.url]));
      if (!rows.length) return toast("Nothing to export yet");
      downloadCsv(`codes-${brand.toLowerCase().replace(/\W+/g, "-")}.csv`, ["code", "type", "discount", "platform", "posted_by", "views", "date", "url"], rows);
    };
    el.querySelector("form").onsubmit = (e) => { e.preventDefault(); go(); };
  },
};

function highlightCode(text, code) {
  const t = String(text || "").replace(/\s+/g, " ");
  const i = t.toUpperCase().indexOf(code);
  const start = Math.max(0, i - 60);
  const snippet = (start ? "…" : "") + t.slice(start, start + 160);
  return esc(snippet).replace(new RegExp(code, "i"), (m) => `<mark>${m}</mark>`);
}
