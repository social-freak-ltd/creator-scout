// Discover: find creators for a category across TikTok, Instagram and YouTube.
import { api } from "../api.js";
import { costMeter } from "../api.js";
import { $, money, PRICE_PER_CREDIT, ICONS, PLATFORM_NAME, countUp, fmt, esc, toast } from "../util.js";
import { Board, sizeOptions } from "../board.js";
import { notCreator, aiReject, startAiRows } from "../ai.js";
import { SHUFFLE, relatedWords } from "../categories.js";
import { harvest, sizeRank, from, hero, statsHtml, tokensOf, BRANDS } from "./common.js";

const CATEGORIES = [
  { q: BRANDS.map((b) => b.category).join(", "), title: "Sweep 5 categories", icon: "⚡", sub: "Five categories at once" },
  { q: "deals", icon: "🏷️", sub: "Deal & coupon creators" },
  { q: "amazon finds", icon: "📦", sub: "Shopping hauls" },
  ...BRANDS.map((b) => ({ q: b.category, icon: b.icon, sub: `For ${b.name}` })),
];

export const discover = {
  id: "discover",
  label: "Discover",
  mount(el) {
    el.innerHTML = `
      ${hero({
        eyebrow: "<b>Discover</b> · TikTok, Instagram and YouTube at once",
        title: "Find creators who already <em>sell your category.</em>",
        sub: "Type what a brand sells. We search three platforms, analyse every profile live and rank creators by how well they fit an affiliate deal.",
        inputId: "dQ", placeholder: "What does the brand sell? e.g. k-beauty skincare", value: "k-beauty skincare",
        extra: `<button type="button" class="btn ghost shuffle" id="dShuffle" title="Try a random category" aria-label="Try a random category">🎲<span>Shuffle</span></button><select class="select" id="dSize" aria-label="Audience size">${sizeOptions("micro")}</select>`,
        button: "Find creators",
        presets: `
          <div class="controls" id="dPlatforms">
            ${["tiktok", "instagram", "youtube"].map((p) => `<button type="button" class="toggle" data-p="${p}" aria-pressed="true">${ICONS[p]}${PLATFORM_NAME[p]}</button>`).join("")}
          </div>
          <div class="presets"><div class="label">Try a category</div><div class="preset-row">${CATEGORIES.map((c) => `<button type="button" class="preset" data-q="${esc(c.q)}"><span class="pi">${c.icon}</span><span><b>${esc(c.title || c.q[0].toUpperCase() + c.q.slice(1))}</b><small>${esc(c.sub)}</small></span></button>`).join("")}</div></div>`,
      })}
      <section class="value-bar" id="dValue" hidden></section>
      ${statsHtml([["dsFound", "Accounts scanned", "TikTok, Instagram and YouTube"], ["dsAnalysed", "Creators qualified", "✦ AI-checked: real people, on topic"], ["dsContact", "Ready to contact", "public email or open to collabs"], ["dsReach", "Combined audience", "of the creators ready to go"]])}
      <div id="dBoard"></div>`;
    const ctx = { tool: "discover", label: "Discover", size: "micro", tokens: [], keyword: "", sizeFilter: true, ai: true };
    const board = new Board($("dBoard"), ctx);
    $("dBoard").hidden = true;
    let abort = null, cursors = {}, round = 0;

    for (const b of el.querySelectorAll("#dPlatforms .toggle")) b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
    $("dShuffle").onclick = () => {
      const now = $("dQ").value.trim().toLowerCase();
      const options = SHUFFLE.filter((x) => x !== now);
      $("dQ").value = options[Math.floor(Math.random() * options.length)];
    };
    for (const p of el.querySelectorAll(".preset")) p.onclick = () => { $("dQ").value = p.dataset.q; el.querySelector("form").requestSubmit(); };
    $("dSize").onchange = () => { ctx.size = $("dSize").value; for (const c of board.items.values()) board.update(c); };

    // The counters only ever go up: a creator is counted the first time they pass a check
    // and stays counted, so numbers don't jump back when a later look reclassifies someone.
    let counted;
    const resetCounts = () => { counted = { qualified: new Set(), contact: new Set(), reach: new Map() }; };
    resetCounts();
    const stats = () => {
      for (const c of board.pool) {
        if (c.ai && !aiReject(c) && c.ai.fit >= 0.3) counted.qualified.add(c.id); // same bar as the On-topic filter
        if (c.status === "ready" && board.items.has(c.id) && board.visible(c)) {
          if (c.emails.length || c.collab) counted.contact.add(c.id);
          if (!counted.reach.has(c.id)) counted.reach.set(c.id, c.followers || 0);
        }
      }
      countUp($("dsFound"), board.pool.size);
      countUp($("dsAnalysed"), counted.qualified.size);
      countUp($("dsContact"), counted.contact.size);
      countUp($("dsReach"), [...counted.reach.values()].reduce((s, f) => s + f, 0), fmt);
    };

    // The value bar: data read flying up next to a price that barely moves, then the payoff.
    const MANUAL_MIN_PER_ACCOUNT = 2; // checking one account by hand: open it, read the bio and posts, judge fit
    let ticker = null;
    const setFig = (el, text) => {
      if (el.textContent === text) return;
      el.textContent = text;
      el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
    };
    const valueBar = (meter, t0, done) => {
      const bar = $("dValue");
      if (!bar.firstChild) {
        bar.innerHTML = `
          <div class="vb-fig big"><b id="vbViews">0</b><span>video views analysed</span></div>
          <div class="vb-fig"><b id="vbCost">$0</b><span id="vbCalls">total cost</span></div>
          <div class="vb-fig"><b id="vbAudience">0</b><span id="vbAudienceL">followers across accounts checked</span></div>
          <div class="vb-fig"><b id="vbTime">0.0s</b><span id="vbTimeL">and counting</span></div>
          <div class="vb-note" id="vbNote"></div>`;
      }
      const secs = (performance.now() - t0) / 1000;
      const spent = meter();
      const scanned = board.pool?.size || 0;
      let audience = 0;
      for (const c of board.pool || []) audience += c.followers || 0;
      // Short, with enough decimals that it keeps moving past a billion ("1.24B", "724.3M").
      const v = spent.views;
      setFig($("vbViews"), v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : fmt(v));
      setFig($("vbAudience"), fmt(audience));
      $("vbAudienceL").textContent = `followers across ${scanned.toLocaleString()} accounts`;
      setFig($("vbCost"), `$${(spent.credits * PRICE_PER_CREDIT).toFixed(4)}`);
      $("vbCalls").textContent = `total cost · ${spent.requests.toLocaleString()} API calls`;
      $("vbTime").textContent = `${secs.toFixed(done ? 0 : 1)}s`;
      $("vbTimeL").textContent = done ? "start to finish" : "and counting";
      bar.classList.toggle("done", done);
      const hours = (scanned * MANUAL_MIN_PER_ACCOUNT) / 60;
      const manual = hours >= 1 ? `${hours.toFixed(hours < 10 ? 1 : 0)} hours` : `${Math.round(hours * 60)} minutes`;
      $("vbNote").innerHTML = done
        ? `<span class="vb-live done">✓ Done</span> ${counted.qualified.size} qualified creators, ${spent.dataPoints.toLocaleString()} data points read, for ${money(spent.credits)}. Checking ${scanned} accounts by hand takes about <b>${manual}</b>.`
        : `<span class="vb-live"><i></i>Live</span> Searching three platforms, reading every profile and screening each one with AI`;
    };

    async function go(more) {
      const platforms = [...el.querySelectorAll("#dPlatforms .toggle")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.p);
      if (!platforms.length) return toast("Pick at least one platform");
      if (!more) {
        abort?.abort();
        abort = new AbortController();
        cursors = {}; round = 0;
        ctx.keyword = $("dQ").value.trim();
        ctx.keywords = ctx.keyword.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6);
        ctx.groups = ctx.keywords.map(tokensOf);
        ctx.tokens = ctx.groups.flat();
        ctx.highlight = ctx.keywords.flatMap((k) => relatedWords(k, tokensOf(k)));
        ctx.size = $("dSize").value;
        ctx.label = ctx.keywords.length > 1 ? `Fit across ${ctx.keywords.length} categories` : `Fit for “${ctx.keyword}”`;
        board.reset();
        el.querySelector(".hero").classList.add("compact");
        el.querySelector(".stats").hidden = false;
        $("dBoard").hidden = false;
        for (const id of ["dsFound", "dsAnalysed", "dsContact", "dsReach"]) { $(id).dataset.v = 0; $(id).textContent = "0"; }
        resetCounts();
        startAiRows();
      } else board.progressEl.innerHTML = "";
      round++;
      const signal = abort.signal;
      const keywords = ctx.keywords;
      const cur = (key) => (cursors[key] ? `&cursor=${encodeURIComponent(cursors[key])}` : "");
      const searches = [];
      // Tag each result with the category it came from, so a multi-category sweep can show it.
      const q = (path, key, pick, topic) => () => api(path, { signal, priority: 0 }).then((d) => { cursors[key] = d.page?.nextCursor; return pick(d).filter(Boolean).map((p) => ({ ...p, topic })); });
      for (const kw of keywords) {
        const k = encodeURIComponent(kw);
        if (platforms.includes("tiktok")) {
          searches.push({ platform: "tiktok", run: q(`/v1/tiktok/users/search?query=${k}${cur("ttU" + kw)}`, "ttU" + kw, (d) => (d.users || []).map(from.tiktokUser), kw) });
          searches.push({ platform: "tiktok", run: q(`/v1/tiktok/search?query=${k}&trim=true${cur("ttV" + kw)}`, "ttV" + kw, (d) => (d.videos || []).map((v) => from.tiktokVideo(v, true)), kw) });
          // Videos people make about the category surface creators; account-name searches surface brands.
          for (const [tag, word] of [["ttI", round === 1 ? "haul" : "try on"], ["ttR", round === 1 ? "review" : "favorites"]]) {
            const intent = encodeURIComponent(`${kw} ${word}`);
            searches.push({ platform: "tiktok", run: q(`/v1/tiktok/search?query=${intent}&trim=true${cur(tag + kw)}`, tag + kw, (d) => (d.videos || []).map((v) => from.tiktokVideo(v, true)), kw) });
          }
        }
        if (platforms.includes("instagram")) {
          const variants = round === 1 ? [kw, `${kw} creator`] : [`${kw} blogger`, `${kw} influencer`];
          for (const v of variants) searches.push({ platform: "instagram", run: q(`/v2/instagram/profiles/search?query=${encodeURIComponent(v)}`, "igP", (d) => (d.accounts || []).map(from.igAccount), kw) });
          if (round === 1) for (const v of [kw, `${kw} haul`]) searches.push({ platform: "instagram", run: q(`/v2/instagram/reels/search?query=${encodeURIComponent(v)}`, "igR", (d) => (d.media || []).map((r) => from.igReel(r, true)), kw) });
        }
        if (platforms.includes("youtube")) {
          searches.push({ platform: "youtube", run: q(`/v1/youtube/search?query=${k}&type=channels${cur("ytC" + kw)}`, "ytC" + kw, (d) => (d.channels || []).map(from.ytChannel), kw) });
          searches.push({ platform: "youtube", run: q(`/v1/youtube/search?query=${k}${cur("ytV" + kw)}`, "ytV" + kw, (d) => (d.videos || []).map((v) => from.ytVideo(v, true)), kw) });
          const intent = encodeURIComponent(`${kw} ${round === 1 ? "review" : "haul"}`);
          searches.push({ platform: "youtube", run: q(`/v1/youtube/search?query=${intent}${cur("ytI" + kw)}`, "ytI" + kw, (d) => (d.videos || []).map((v) => from.ytVideo(v, true)), kw) });
        }
      }
      board.setRunning(true);
      document.body.classList.add("busy");
      const t0 = performance.now();
      const meter = costMeter();
      $("dValue").hidden = false;
      $("dValue").innerHTML = "";
      clearInterval(ticker);
      ticker = setInterval(() => { if (signal.aborted) return clearInterval(ticker); valueBar(meter, t0, false); stats(); }, 100);
      const bySize = sizeRank(ctx.size);
      // Jev's on-topic judgement outweighs size when choosing who to analyse first.
      const rank = (c) => bySize(c) + (c.ai ? c.ai.fit * 6 - (notCreator(c) ? 6 : 0) : 0);
      await harvest({ board, signal, searches, budget: Math.min(45, 20 * keywords.length), rank, onFound: stats, onAnalysed: stats, aiTopic: (c) => c.topic || keywords[0] });
      clearInterval(ticker);
      if (signal.aborted) return;
      board.setRunning(false);
      stats();
      valueBar(meter, t0, true);
      board.sort();
      const n = board.readyList().length;
      toast(`${n} creators ranked by fit in ${((performance.now() - t0) / 1000).toFixed(0)}s · ${money(board.lastCost?.credits || 0)} in API calls`);
    }
    el.querySelector("form").onsubmit = (e) => { e.preventDefault(); if ($("dQ").value.trim()) go(false); };
    board.moreBtn.onclick = () => go(true);
  },
};
