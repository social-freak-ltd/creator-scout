// Follower VIPs: scan a brand's TikTok followers and surface the creators hiding in them.
import { api } from "../api.js";
import { $, countUp, fmt, esc, toast, img, ICONS } from "../util.js";
import { Board } from "../board.js";
import { analyse, upsert, loadPosts } from "../creators.js";
import { hero, statsHtml, BRANDS } from "./common.js";
import { openDrawer } from "../ui.js";

const PAGE = 50;

export const vips = {
  id: "vips",
  label: "Follower VIPs",
  mount(el) {
    el.innerHTML = `
      ${hero({
        eyebrow: "<b>Follower VIPs</b> · creators who already follow a brand",
        title: "Your next partners <em>already follow you.</em>",
        sub: "Enter a brand's TikTok. We scan its followers live, flag every follower who is a creator in their own right, then analyse them, so you can see who's worth a call.",
        inputId: "vQ", placeholder: "brand handle", value: "glossier", prefix: "@",
        extra: `<select class="select" id="vDepth" aria-label="How many followers to scan">
          <option value="10">Scan 500 followers</option><option value="20" selected>Scan 1,000 followers</option><option value="40">Scan 2,000 followers</option><option value="100">Scan 5,000 followers</option></select>
          <select class="select" id="vMin" aria-label="Creator threshold"><option value="1000">1K+ followers</option><option value="3000" selected>3K+ followers</option><option value="10000">10K+ followers</option></select>`,
        button: "Scan followers",
        presets: `<div class="presets"><div class="label">Example brands</div><div class="preset-row">${BRANDS.map((b) => `<button type="button" class="preset" data-q="${esc(b.tiktok)}"><span class="pi">${b.icon}</span><span><b>${esc(b.name)}</b><small>@${esc(b.tiktok)}</small></span></button>`).join("")}</div></div>`,
      })}
      ${statsHtml([["vsScanned", "Followers scanned", "live, page by page"], ["vsCreators", "Creators found", "followers who are creators"], ["vsReach", "Their combined audience", "reach you could activate"], ["vsRate", "Creator rate", "share of followers who create"]])}
      <section class="scan-panel" id="vScan" hidden>
        <div class="scan-top">
          <div style="display:flex;gap:14px;align-items:center">
            <div id="vBrand"></div>
            <div><h3 id="vTitle">Scanning followers</h3><p id="vSub">Every dot is a real follower. Blue and green dots are creators.</p></div>
          </div>
          <div class="scan-legend"><span><i style="background:#e4e4e1"></i>Follower</span><span><i style="background:#bfd9ea"></i>500+</span><span><i style="background:var(--blue)"></i>Creator</span><span><i style="background:var(--green)"></i>50K+</span></div>
        </div>
        <div class="field" id="vField"></div>
        <div class="scan-bar"><span id="vBar"></span></div>
        <div class="scan-ticker" id="vTicker"></div>
      </section>
      <div id="vBoard" style="margin-top:6px"></div>`;
    const ctx = { tool: "vips", label: "Follower VIP", size: "any", tokens: [], sizeFilter: false };
    const board = new Board($("vBoard"), ctx);
    board.root.querySelector('[data-act="more"]').textContent = "Scan deeper";
    $("vBoard").hidden = true;
    let abort = null, cursor = null, scanned = 0, total = 0, brand = "", found = [];

    for (const p of el.querySelectorAll(".preset")) p.onclick = () => { $("vQ").value = p.dataset.q; el.querySelector("form").requestSubmit(); };

    const stats = () => {
      countUp($("vsScanned"), scanned);
      countUp($("vsCreators"), found.length);
      countUp($("vsReach"), found.reduce((s, c) => s + (c.followers || 0), 0), fmt);
      const rate = scanned ? found.length / scanned : 0;
      $("vsRate").textContent = scanned ? (rate * 100).toFixed(1) + "%" : "0";
    };

    async function scan(pages) {
      const signal = abort.signal;
      const min = Number($("vMin").value);
      board.setRunning(true);
      const step = board.step(`Scanning @${brand}`);
      const analyses = [];
      for (let i = 0; i < pages && !signal.aborted; i++) {
        let d;
        try {
          d = await api(`/v1/tiktok/profiles/${encodeURIComponent(brand)}/followers?trim=true${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`, { signal, priority: 0 });
        } catch (e) {
          if (e?.aborted) return;
          step.fail("Follower scan stopped early");
          break;
        }
        total = d.totalFollowers || total;
        const list = d.followers || [];
        const frag = document.createDocumentFragment();
        list.forEach((f, j) => {
          const n = f.metrics?.followers || 0;
          const dot = document.createElement("span");
          dot.className = "dot" + (n >= 50000 ? " big" : n >= min ? " c" : n >= 500 ? " m" : "");
          dot.style.animationDelay = `${j * 12}ms`;
          dot.title = `@${f.handle} · ${fmt(n)} followers`;
          frag.append(dot);
          if (n >= min && !f.privateAccount) {
            const c = upsert({ platform: "tiktok", handle: f.handle, name: f.displayName || f.handle, bio: f.bio, followers: n, verified: f.verified, avatar: f.avatarUrls?.medium || f.avatarUrl, url: `https://www.tiktok.com/@${f.handle}`, followsBrand: brand });
            c.followsBrand = brand;
            if (!found.includes(c)) {
              found.push(c);
              dot.onclick = () => openDrawer(c, ctx);
              board.add(c, j * 12);
              analyses.push(analyse(c, { signal }).then(() => {
                board.update(c); stats();
                if (c.status === "ready") return loadPosts(c, { signal, priority: 2 }).then(() => board.update(c), () => {});
              }, () => board.update(c)));
            }
          }
        });
        $("vField").append(frag);
        scanned += list.length;
        const ticker = list.slice(-6).map((f) => `@${f.handle} ${fmt(f.metrics?.followers || 0)}`).join("  ·  ");
        $("vTicker").textContent = ticker;
        $("vBar").style.width = `${Math.min(100, ((i + 1) / pages) * 100)}%`;
        $("vTitle").textContent = `Scanned ${scanned.toLocaleString()} of ${total.toLocaleString()} followers`;
        step.set(`@${brand}: ${scanned.toLocaleString()} scanned · ${found.length} creators`);
        stats();
        cursor = d.page?.nextCursor;
        if (!d.page?.hasMore || !cursor) break;
      }
      if (signal.aborted) return;
      $("vTicker").textContent = "Analysing the creators we found…";
      await Promise.allSettled(analyses);
      if (signal.aborted) return;
      step.done(`@${brand}: ${scanned.toLocaleString()} followers scanned · ${found.length} creators`);
      $("vTicker").textContent = `Done. ${found.length} creators among ${scanned.toLocaleString()} followers (${(found.length / Math.max(1, scanned) * 100).toFixed(1)}%). At that rate @${brand}'s ${fmt(total)} followers hold about ${fmt(Math.round(found.length / Math.max(1, scanned) * total))} creators.`;
      board.setRunning(false);
      stats();
      board.sort();
      toast(`Found ${found.length} creators among @${brand}'s followers`);
    }

    async function go() {
      abort?.abort();
      abort = new AbortController();
      brand = $("vQ").value.trim().replace(/^@/, "").replace(/.*tiktok\.com\/@/, "").split(/[/?]/)[0];
      if (!brand) return;
      cursor = null; scanned = 0; total = 0; found = [];
      ctx.label = `Follows @${brand}`;
      board.reset();
      $("vField").innerHTML = "";
      $("vBar").style.width = "0";
      el.querySelector(".hero").classList.add("compact");
      el.querySelector(".stats").hidden = false;
      $("vScan").hidden = false;
      $("vBoard").hidden = false;
      for (const id of ["vsScanned", "vsCreators", "vsReach"]) { $(id).dataset.v = 0; $(id).textContent = "0"; }
      $("vTitle").textContent = `Looking up @${brand}…`;
      $("vBrand").innerHTML = "";
      try {
        const d = await api(`/v1/tiktok/profiles/${encodeURIComponent(brand)}`, { signal: abort.signal, priority: 0 });
        if (d.lookupStatus !== "found") { $("vTitle").textContent = `@${brand} wasn't found on TikTok`; board.setRunning(false); return; }
        total = d.metrics?.followers || 0;
        const av = d.profile?.avatarUrls?.medium;
        $("vBrand").innerHTML = `<div class="avatar-wrap"><div class="avatar" style="width:52px;height:52px">${esc(brand[0].toUpperCase())}${av ? `<img src="${img(av)}" alt="" onerror="this.remove()">` : ""}</div><span class="pbadge">${ICONS.tiktok}</span></div>`;
        $("vSub").textContent = `${d.profile?.displayName || brand} has ${fmt(total)} followers. Every dot is a real follower; blue and green dots are creators. Click one to open it.`;
      } catch (e) {
        if (e?.aborted) return;
      }
      await scan(Number($("vDepth").value));
    }
    el.querySelector("form").onsubmit = (e) => { e.preventDefault(); go(); };
    board.moreBtn.onclick = () => { if (cursor) scan(10); else toast("No more followers to scan"); };
  },
};
