import { $, esc, fmt, countUp, ICONS, storage, money } from "./util.js";
import { onActivity, apiStats } from "./api.js";
import { creators } from "./creators.js";
import { pipeline } from "./pipeline.js";
import { closeDrawer, closeModal } from "./ui.js";
import { discover } from "./tools/discover.js";
import { advocates } from "./tools/advocates.js";
import { vips } from "./tools/vips.js";
import { codes } from "./tools/codes.js";
import { pipelineView } from "./tools/pipelineView.js";

const TOOLS = [discover, advocates, vips, codes, pipelineView];
const CARDS = [
  { id: "discover", kicker: "Discover", title: "Find creators by category", text: "Type what a brand sells. Search TikTok, Instagram and YouTube at once and get every creator ranked by affiliate fit.", ties: "Fills <b>an affiliate or creator programme</b>" },
  { id: "advocates", kicker: "Brand advocates", title: "Who already posts about a brand", text: "Pull every recent post that mentions a brand, grouped by creator, with the views each one drove.", ties: "The warmest recruits: <b>they already like the brand</b>" },
  { id: "vips", kicker: "Follower VIPs", title: "Creators hiding in a brand's followers", text: "Scan a brand's followers live and flag every follower with a real audience of their own.", ties: "Your <b>biggest fans with audiences</b>" },
  { id: "codes", kicker: "Code watch", title: "Discount codes out in the wild", text: "Find a brand's codes posted on TikTok, Instagram, YouTube, X and Reddit, and who's sharing them.", ties: "Spot <b>leaked codes</b> and who shares them" },
];

const ENDPOINTS = [
  ["tiktok", "User search"], ["tiktok", "Video search"], ["tiktok", "Profiles"], ["tiktok", "Recent videos"], ["tiktok", "Followers"], ["tiktok", "Audience"],
  ["instagram", "Profile search"], ["instagram", "Reels search"], ["instagram", "Profiles + posts"],
  ["youtube", "Search"], ["youtube", "Channels"], ["youtube", "Video details"],
  ["twitter", "Search"], ["reddit", "Search"], ["linktree", "Linktree pages"],
];

function homeHtml() {
  return `
    <section class="hero">
      <div class="eyebrow">Open-source demo · powered by the <b>Social Fetch API</b></div>
      <h1>Recruit creators <em>at scale.</em></h1>
      <p class="sub">Four tools, one API key. Everything you see is pulled live from TikTok, Instagram, YouTube, X and Reddit while you watch.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <a class="btn pillish blue" href="#/discover">Start with Discover ${ICONS.arrow}</a>
        <a class="btn pillish ghost" href="#/vips">Scan a brand's followers</a>
      </div>
    </section>
    <div class="home-grid">
      ${CARDS.map((c) => `<a class="tool-card" href="#/${c.id}">
        <div class="kicker">${c.kicker}</div><h3>${c.title}</h3><p>${c.text}</p>
        <div class="ties">${c.ties}</div><div class="go">Open ${ICONS.arrow.replace("<svg", '<svg width="16" height="16"')}</div></a>`).join("")}
    </div>
    <section class="powered">
      <div><h3>What powers this</h3><p>Fifteen Social Fetch endpoints, called straight from the page. No scrapers, proxies or logins to maintain.</p></div>
      <div class="endpoints">${ENDPOINTS.map(([p, name]) => `<span class="ep"><span class="pi">${ICONS[p]}</span>${name}</span>`).join("")}</div>
    </section>
    <section class="home-strip">
      <div class="stat price"><div class="label">Cost per request</div><div class="value">$0.00135</div><div class="hint">$1.35 per 1,000 · less than a tenth of a cent</div></div>
      <div class="stat"><div class="label">API calls this session</div><div class="value" id="hReq">0</div><div class="hint" id="hSpent">every one shown on the right</div></div>
      <div class="stat"><div class="label">Creators analysed</div><div class="value" id="hCreators">0</div><div class="hint">full profiles pulled live</div></div>
      <div class="stat"><div class="label">In your pipeline</div><div class="value" id="hPipe">0</div><div class="hint">ready for outreach</div></div>
    </section>`;
}

const mounted = new Map();
function show(id) {
  const tool = TOOLS.find((t) => t.id === id);
  for (const [k, el] of mounted) el.hidden = k !== (tool ? id : "home");
  if (!tool) {
    if (!mounted.has("home")) { const el = document.createElement("div"); el.className = "view"; el.innerHTML = homeHtml(); $("views").append(el); mounted.set("home", el); }
    mounted.get("home").hidden = false;
    homeStats();
  } else {
    if (!mounted.has(id)) {
      const el = document.createElement("div");
      el.className = "view";
      $("views").append(el);
      tool.mount(el);
      mounted.set(id, el);
    }
    mounted.get(id).hidden = false;
    if (id === "pipeline") pipelineView.render();
    setTimeout(() => mounted.get(id).querySelector(".hero:not(.compact) input")?.focus({ preventScroll: true }), 50);
  }
  for (const a of document.querySelectorAll(".tab")) a.classList.toggle("active", a.dataset.id === (tool ? id : "home"));
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function homeStats() {
  if (!$("hReq")) return;
  const { requests, credits } = apiStats();
  countUp($("hReq"), requests);
  if (requests) $("hSpent").textContent = `${money(credits)} spent so far, every call shown on the right`;
  countUp($("hCreators"), [...creators.values()].filter((c) => c.status === "ready").length);
  countUp($("hPipe"), pipeline.count());
}

function tabCount() {
  const n = pipeline.count();
  const el = document.querySelector('.tab[data-id="pipeline"] .count');
  el.textContent = n;
  el.hidden = n === 0;
}

const route = () => show(location.hash.replace(/^#\/?/, "") || "home");
addEventListener("hashchange", route);
pipeline.on(() => { tabCount(); homeStats(); });
onActivity(() => { if (!mounted.get("home")?.hidden) homeStats(); });

$("tabs").innerHTML = `<a class="tab" data-id="home" href="#/">Overview</a>` + TOOLS.map((t) => `<a class="tab" data-id="${t.id}" href="#/${t.id}">${esc(t.label)}${t.id === "pipeline" ? ' <span class="count" hidden>0</span>' : ""}</a>`).join("");
tabCount();

const layout = $("layout");
const setConsole = (on) => { layout.classList.toggle("no-console", !on); storage.set("creator-scout.console", on); };
setConsole(storage.get("creator-scout.console", true));
$("consoleToggle").onclick = () => setConsole(layout.classList.contains("no-console"));
$("consoleHide").onclick = () => setConsole(false);

$("scrim").onclick = closeDrawer;
$("drawerClose").onclick = closeDrawer;
$("modal").onclick = (e) => { if (e.target === $("modal")) closeModal(); };
$("oClose").onclick = closeModal;
addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });
addEventListener("scroll", () => $("top").classList.toggle("scrolled", scrollY > 4), { passive: true });

route();
