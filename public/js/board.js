// A results board for the creator tools: progress chips, filters, sorting,
// export and the card grid. Each tool owns one.
import { esc, fmt, pct, downloadCsv, toast } from "./util.js";
import { SIZE } from "./creators.js";
import { renderCard, sortGrid } from "./ui.js";
import { pipeline } from "./pipeline.js";
import { notCreator, aiCreator } from "./ai.js";
import { costMeter, costLine } from "./api.js";

export class Board {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.items = new Map();
    root.innerHTML = `
      <div class="progress"></div>
      <div class="toolbar">
        <div class="left">
          <h2 class="count">0 creators</h2>
          ${ctx.ai ? '<button class="toggle ai" data-f="ontopic" aria-pressed="true">✦ On-topic only</button>' : ""}
          <button class="toggle" data-f="creators" aria-pressed="true">Creators only</button>
          <button class="toggle" data-f="contact" aria-pressed="false">Has contact</button>
          <button class="toggle" data-f="size" aria-pressed="${ctx.sizeFilter ? "true" : "false"}">In size range</button>
          <button class="toggle" data-f="affiliate" aria-pressed="false">Affiliate-ready</button>
        </div>
        <div class="right">
          <select class="sort" aria-label="Sort">
            <option value="fit">Best fit</option>
            <option value="followers">Biggest audience</option>
            <option value="er">Highest engagement</option>
            ${ctx.tool === "advocates" ? '<option value="mentions">Most brand views</option>' : ""}
          </select>
          <button class="btn ghost sm" data-act="more">Find more</button>
          <button class="btn sm" data-act="export">Export CSV</button>
        </div>
      </div>
      <div class="grid"></div>
      <div class="empty" hidden>No creators match these filters. Try turning a filter off.</div>`;
    this.grid = root.querySelector(".grid");
    this.grid._ctx = ctx;
    this.progressEl = root.querySelector(".progress");
    for (const b of root.querySelectorAll("[data-f]")) b.onclick = () => { b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"); this.filter(); };
    root.querySelector(".sort").onchange = () => this.sort();
    root.querySelector('[data-act="export"]').onclick = () => this.export();
    this.moreBtn = root.querySelector('[data-act="more"]');
    pipeline.on(() => { for (const c of this.items.values()) this.update(c); });
  }

  reset() {
    this.running = false; // a cancelled run never called setRunning(false)
    this.items.clear();
    this.pool = new Set();
    this.grid.innerHTML = "";
    this.progressEl.innerHTML = "";
    this.filter();
  }

  step(text) {
    const s = document.createElement("span");
    s.className = "step";
    s.innerHTML = `<span class="spin"></span><span class="t">${esc(text)}</span>`;
    this.progressEl.append(s);
    return {
      set: (t) => { s.querySelector(".t").textContent = t; },
      done: (t) => { s.classList.add("done"); if (t) s.querySelector(".t").textContent = t; },
      fail: (t) => { s.classList.add("fail"); if (t) s.querySelector(".t").textContent = t; },
    };
  }

  add(c, delay = 0) {
    if (this.items.has(c.id)) { this.update(c); return; }
    this.items.set(c.id, c);
    setTimeout(() => { if (this.items.get(c.id) === c) { renderCard(this.grid, c, this.ctx, { fresh: true }); this.filter(); } }, delay);
  }

  update(c) {
    if (!this.items.has(c.id) || !this.grid.querySelector(`[data-id="${CSS.escape(c.id)}"]`)) return;
    renderCard(this.grid, c, this.ctx);
    pipeline.refresh(c);
    this.filter();
  }

  visible(c) {
    const on = (f) => this.root.querySelector(`[data-f="${f}"]`).getAttribute("aria-pressed") === "true";
    const ready = c.status === "ready";
    if (c.status === "failed") return false;
    if (on("creators") && ((c.kind === "brand" && !aiCreator(c)) || notCreator(c))) return false;
    if (this.ctx.ai && on("ontopic") && c.ai && (c.ai.fit < 0.3 || c.ai.partner < 0.35)) return false;
    if (on("contact") && ready && !c.emails.length && !c.collab) return false;
    if (on("affiliate") && ready && !(c.shop?.length || c.usesCodes || c.mentions?.some((m) => m.code) || c.sponsoredShare)) return false;
    if (on("size") && ready) {
      const [lo, hi] = SIZE[this.ctx.size].range;
      if (c.followers == null || c.followers < lo || c.followers > hi) return false;
    }
    return true;
  }

  filter() {
    let shown = 0;
    for (const el of this.grid.children) {
      const c = this.items.get(el.dataset.id);
      const v = c && this.visible(c);
      el.style.display = v ? "" : "none";
      if (v) shown++;
    }
    this.shown = shown;
    this.root.querySelector(".count").textContent = `${shown} creator${shown === 1 ? "" : "s"}`;
    this.root.querySelector(".empty").hidden = shown > 0 || this.running || this.items.size === 0;
  }

  sort() {
    const key = this.root.querySelector(".sort").value;
    const val = (id) => {
      const c = this.items.get(id);
      if (!c) return -1;
      if (key === "followers") return c.followers ?? -1;
      if (key === "er") return c.er ?? (c.avgViews && c.followers ? c.avgViews / c.followers / 5 : -1);
      if (key === "mentions") return (c.mentions || []).reduce((s, m) => s + (m.views || 0), 0);
      return c.fit?.total ?? -1;
    };
    sortGrid(this.grid, val);
  }

  setRunning(on) {
    if (on && !this.running) this.meter = costMeter();
    if (!on && this.running && this.meter) this.showCost();
    this.running = on;
    this.moreBtn.disabled = on;
    this.filter();
    // While a run streams in, keep the best fits floating to the top (paused while the mouse is on the grid).
    clearInterval(this.resortTimer);
    if (on) this.resortTimer = setInterval(() => { if (!this.grid.matches(":hover")) this.sort(); }, 4500);
  }

  /** A chip with what this run cost at list price. */
  showCost() {
    const spent = this.lastCost = this.meter();
    if (!spent.requests) return;
    const n = this.readyList().length;
    this.progressEl.querySelector(".step.cost")?.remove();
    const s = this.step(`💵 ${costLine(spent, n, "creator")}`);
    s.done();
    this.progressEl.lastChild.classList.add("cost");
  }

  readyList() { return [...this.items.values()].filter((c) => c.status === "ready" && this.visible(c)); }

  export() {
    const rows = this.readyList();
    if (!rows.length) return toast("Nothing to export yet");
    downloadCsv(`creators-${(this.ctx.keyword || this.ctx.brand || "list").replace(/\W+/g, "-").toLowerCase()}.csv`,
      ["platform", "handle", "name", "followers", "fit_score", "engagement", "avg_views", "email", "links", "shop_tools", "codes", "region", "type", "profile_url", "bio"],
      rows.map((c) => [c.platform, c.ytHandle || c.handle, c.name, c.followers, c.fit?.total, c.er != null ? pct(c.er, 2) : "", c.avgViews ? Math.round(c.avgViews) : "", c.emails.join(" "), c.links.slice(0, 3).join(" "), (c.shop || []).join(" "), [...(c.bioCodes || []), ...(c.postCodes || [])].map((x) => x.code).join(" "), c.region, c.kind, c.url, c.bio]));
    toast(`Exported ${rows.length} creators to CSV`);
  }
}

export function sizeOptions(selected) {
  return Object.entries(SIZE).map(([k, v]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${v.label}</option>`).join("");
}
export { fmt };
