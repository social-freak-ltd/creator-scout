// Brand advocates: creators who already post about a brand without being asked.
import { api } from "../api.js";
import { $, countUp, fmt, esc, toast, extractCodes } from "../util.js";
import { Board, sizeOptions } from "../board.js";
import { harvest, from, hero, statsHtml, tokensOf, BRANDS } from "./common.js";

export const advocates = {
  id: "advocates",
  label: "Brand advocates",
  mount(el) {
    el.innerHTML = `
      ${hero({
        eyebrow: "<b>Brand advocates</b> · who already talks about a brand",
        title: "Recruit the creators <em>already selling for free.</em>",
        sub: "Enter a brand. We pull recent TikToks, Reels and YouTube videos that mention it, group them by creator and show who drives the most views.",
        inputId: "aQ", placeholder: "Brand name, e.g. Glossier", value: "Glossier",
        extra: `<select class="select" id="aSize" aria-label="Audience size">${sizeOptions("any")}</select>`,
        button: "Find advocates",
        presets: `<div class="presets"><div class="label">Example brands</div><div class="preset-row">${BRANDS.map((b) => `<button type="button" class="preset" data-q="${esc(b.name)}"><span class="pi">${b.icon}</span><span><b>${esc(b.name)}</b><small>${esc(b.category[0].toUpperCase() + b.category.slice(1))}</small></span></button>`).join("")}</div></div>`,
      })}
      ${statsHtml([["asPosts", "Posts mentioning the brand", "TikTok, Reels and YouTube"], ["asCreators", "Creators posting", "excluding the brand's own accounts"], ["asViews", "Views on those posts", "earned media the brand didn't pay for"], ["asCodes", "Already sharing a code", "creators who are affiliates today"]])}
      <div id="aBoard"></div>`;
    const ctx = { tool: "advocates", label: "Brand advocate", size: "any", tokens: [], brand: "", sizeFilter: false };
    const board = new Board($("aBoard"), ctx);
    $("aBoard").hidden = true;
    board.root.querySelector(".sort").value = "fit";
    let abort = null, round = 0, cursors = {};
    const posts = new Map();

    for (const p of el.querySelectorAll(".preset")) p.onclick = () => { $("aQ").value = p.dataset.q; el.querySelector("form").requestSubmit(); };
    $("aSize").onchange = () => { ctx.size = $("aSize").value; for (const c of board.items.values()) board.update(c); };

    const brandRe = () => new RegExp(ctx.tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s._-]?"), "i");
    const compact = () => ctx.brand.toLowerCase().replace(/[^a-z0-9]/g, "");
    const isBrandAccount = (handle, name) => {
      const h = String(handle).toLowerCase().replace(/[^a-z0-9]/g, "");
      return h.includes(compact()) || String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "") === compact();
    };

    const stats = () => {
      const people = [...board.pool].filter((c) => c.kind !== "brand" && !c.isBrand);
      countUp($("asPosts"), posts.size);
      countUp($("asCreators"), people.length);
      countUp($("asViews"), [...posts.values()].reduce((s, p) => s + (p.views || 0), 0), fmt);
      countUp($("asCodes"), people.filter((c) => c.mentions?.some((m) => m.code) || c.bioCodes?.length || c.postCodes?.length).length);
    };

    // Keep only posts that really name the brand, tag any discount code in them.
    const keep = (partial) => {
      if (!partial) return null;
      const m = partial.mentions?.[0];
      if (!m || !brandRe().test(m.caption)) return null;
      if (isBrandAccount(partial.handle, partial.name)) return null;
      const code = extractCodes(m.caption)[0];
      if (code) { m.code = code.code; m.discount = code.discount; }
      posts.set(m.url, m);
      return partial;
    };

    async function go(more) {
      if (!more) {
        abort?.abort();
        abort = new AbortController();
        round = 0; cursors = {};
        posts.clear();
        ctx.brand = $("aQ").value.trim();
        ctx.tokens = tokensOf(ctx.brand);
        ctx.size = $("aSize").value;
        ctx.label = `Advocate for ${ctx.brand}`;
        board.reset();
        el.querySelector(".hero").classList.add("compact");
        el.querySelector(".stats").hidden = false;
        $("aBoard").hidden = false;
        for (const id of ["asPosts", "asCreators", "asViews", "asCodes"]) { $(id).dataset.v = 0; $(id).textContent = "0"; }
      } else board.progressEl.innerHTML = "";
      round++;
      const signal = abort.signal;
      const preset = BRANDS.find((b) => b.name.toLowerCase() === ctx.brand.toLowerCase());
      const queries = round === 1 ? [ctx.brand, `${ctx.brand} review`] : [`${ctx.brand} haul`, `${ctx.brand}${preset ? " " + preset.category : " try on"}`];
      const q = (path, pick) => () => api(path, { signal, priority: 0 }).then((d) => pick(d).filter(Boolean));
      const searches = [];
      for (const term of queries) {
        const t = encodeURIComponent(term);
        searches.push({ platform: "tiktok", run: q(`/v1/tiktok/search?query=${t}&trim=true`, (d) => (d.videos || []).map((v) => keep(from.tiktokVideo(v, true)))) });
        searches.push({ platform: "instagram", run: q(`/v2/instagram/reels/search?query=${t}`, (d) => (d.media || []).map((r) => keep(from.igReel(r, true)))) });
        searches.push({ platform: "youtube", run: q(`/v1/youtube/search?query=${t}${cursors[term] ? "&cursor=" + encodeURIComponent(cursors[term]) : ""}`, (d) => (d.videos || []).map((v) => keep(from.ytVideo(v, true)))) });
      }
      board.setRunning(true);
      const t0 = performance.now();
      const rank = (c) => (c.mentions || []).reduce((s, m) => s + (m.views || 0), 0) + (c.mentions?.some((m) => m.code) ? 5e6 : 0);
      await harvest({ board, signal, searches, budget: 14, rank, onFound: stats, onAnalysed: stats });
      if (signal.aborted) return;
      board.setRunning(false);
      stats();
      board.sort();
      toast(`${board.readyList().length} creators already posting about ${ctx.brand} · ${((performance.now() - t0) / 1000).toFixed(0)}s`);
    }
    el.querySelector("form").onsubmit = (e) => { e.preventDefault(); if ($("aQ").value.trim()) go(false); };
    board.moreBtn.onclick = () => go(true);
  },
};
