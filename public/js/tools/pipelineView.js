// Pipeline: the shortlist as a drag-and-drop board, with outreach drafts and export.
import { $, esc, fmt, pct, toast, downloadCsv, ICONS } from "../util.js";
import { pipeline, STAGES } from "../pipeline.js";
import { creators, upsert } from "../creators.js";
import { avatarHtml, handleText, openDrawer, openOutreach } from "../ui.js";
import { tokensOf } from "./common.js";

export const pipelineView = {
  id: "pipeline",
  label: "Pipeline",
  mount(el) {
    el.innerHTML = `
      <section class="hero compact" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
        <div><h1 style="margin:0">Your creator pipeline</h1><p class="muted" style="margin:6px 0 0">Shortlist from any tool, drag creators along as outreach happens, draft each message in one click.</p></div>
        <div style="display:flex;gap:8px"><button class="btn ghost sm" id="pClear">Clear</button><button class="btn sm" id="pExport">${ICONS.download} Export pipeline</button></div>
      </section>
      <section class="stats" style="margin-top:16px">
        <div class="stat"><div class="label">In pipeline</div><div class="value" id="psCount">0</div><div class="hint">creators shortlisted</div></div>
        <div class="stat"><div class="label">Combined audience</div><div class="value" id="psReach">0</div><div class="hint">followers + subscribers</div></div>
        <div class="stat"><div class="label">With email</div><div class="value" id="psEmail">0</div><div class="hint">ready to contact today</div></div>
        <div class="stat"><div class="label">Avg engagement</div><div class="value" id="psEr">—</div><div class="hint">where measured</div></div>
      </section>
      <div class="board" id="pBoard"></div>`;
    $("pExport").onclick = () => {
      const rows = pipeline.all();
      if (!rows.length) return toast("Your pipeline is empty");
      downloadCsv("creator-pipeline.csv", ["stage", "platform", "handle", "name", "followers", "fit_score", "engagement", "email", "profile_url", "source"],
        rows.map((r) => [r.stage, r.platform, r.ytHandle || r.handle, r.name, r.followers, r.fitScore, r.er != null ? pct(r.er, 2) : "", (r.emails || []).join(" "), r.url, r.source]));
      toast(`Exported ${rows.length} creators`);
    };
    $("pClear").onclick = () => { if (pipeline.count() && confirm("Remove everyone from the pipeline?")) pipeline.clear(); };
    pipeline.on(() => this.render());
    this.render();
  },
  render() {
    const board = $("pBoard");
    if (!board) return;
    const all = pipeline.all();
    $("psCount").textContent = all.length;
    $("psReach").textContent = fmt(all.reduce((s, r) => s + (r.followers || 0), 0));
    $("psEmail").textContent = all.filter((r) => r.emails?.length).length;
    const ers = all.filter((r) => r.er != null);
    $("psEr").textContent = ers.length ? pct(ers.reduce((s, r) => s + r.er, 0) / ers.length) : "—";
    board.innerHTML = STAGES.map((s) => {
      const leads = all.filter((r) => r.stage === s.key);
      return `<div class="col" data-stage="${s.key}">
        <div class="col-head"><div><i style="background:${s.color}"></i>${s.label}</div><span>${leads.length}</span></div>
        ${leads.map((r) => `<div class="lead" draggable="true" data-id="${esc(r.id)}">
            ${avatarHtml(r)}
            <div class="who"><div class="name">${esc(r.name || r.handle)}</div><div class="handle">${esc(handleText(r))}</div></div>
            <div class="mini"><b>${fmt(r.followers)}</b>${r.fitScore != null ? `fit ${r.fitScore}` : ""}</div>
          </div>`).join("") || `<div class="hint">${s.key === "shortlisted" ? "Shortlist creators from any tool and they land here" : "Drag creators here"}</div>`}
      </div>`;
    }).join("");
    for (const lead of board.querySelectorAll(".lead")) {
      lead.ondragstart = (e) => { e.dataTransfer.setData("text/plain", lead.dataset.id); lead.classList.add("dragging"); };
      lead.ondragend = () => lead.classList.remove("dragging");
      lead.onclick = () => {
        const r = pipeline.get(lead.dataset.id);
        const c = creators.get(r.id) || Object.assign(upsert({ ...r }), { status: "ready", emails: r.emails || [], links: r.links || [], socials: [] });
        openDrawer(c, { tool: "pipeline", label: r.source || "Pipeline", brand: r.brand, keyword: r.keyword, size: "any", tokens: tokensOf(r.brand || r.keyword) });
      };
      lead.ondblclick = () => { const r = pipeline.get(lead.dataset.id); const c = creators.get(r.id) || r; openOutreach({ ...c, emails: c.emails || [], links: c.links || [] }, { label: r.source, brand: r.brand, keyword: r.keyword }); };
    }
    for (const col of board.querySelectorAll(".col")) {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add("over"); };
      col.ondragleave = () => col.classList.remove("over");
      col.ondrop = (e) => {
        e.preventDefault();
        col.classList.remove("over");
        const id = e.dataTransfer.getData("text/plain");
        if (id) { pipeline.move(id, col.dataset.stage); toast(`Moved to ${STAGES.find((s) => s.key === col.dataset.stage).label}`); }
      };
    }
  },
};
