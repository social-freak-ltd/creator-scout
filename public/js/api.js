// Every Social Fetch call goes through here: a small priority queue (searches before
// profile lookups), the live console on the right, and the request counters.
import { $, esc, PLATFORM_NAME, toast, money } from "./util.js";

let warned = false;

// Browsers allow ~6 open connections per host, so calls are spread over loopback
// aliases (s1.localhost …) of the same local server. Falls back to same-origin.
let SHARDS = [""];
// Deployed over HTTP/2 (Vercel) one connection carries many requests at once, so the cap is
// ours, not the browser's. Local HTTP/1.1 needs the shards below to get the same.
let CONCURRENCY = location.hostname === "localhost" ? 6 : 32;
if (location.hostname === "localhost") {
  const candidates = [1, 2, 3, 4].map((n) => `${location.protocol}//s${n}.localhost:${location.port}`);
  Promise.all(candidates.map((o) => fetch(o + "/sf-ping", { cache: "no-store" }).then((r) => (r.ok ? o : null), () => null))).then((ok) => {
    const live = ok.filter(Boolean);
    if (live.length) { SHARDS = live; CONCURRENCY = Math.min(32, live.length * 8); pump(); }
  });
}
let shardIdx = 0;
const queue = [];
let active = 0;
const stats = { requests: 0, credits: 0, dataPoints: 0, views: 0, totalMs: 0, ok: 0, buckets: new Array(40).fill(0), lastBucket: Math.floor(Date.now() / 2000) };
const listeners = new Set();
export const onActivity = (fn) => listeners.add(fn);

function describe(path) {
  const [p, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = p.replace(/^\/v\d\//, "").split("/");
  const plat = PLATFORM_NAME[parts[0]] || parts[0];
  const q = params.get("query") || params.get("hashtag");
  const next = params.get("cursor") ? " · next page" : "";
  if (p.includes("/followers")) return `Scan followers of @${decodeURIComponent(parts[2])}${next}`;
  if (p.includes("/audience")) return `Audience locations for @${decodeURIComponent(parts[2])}`;
  if (p.includes("reels/search")) return `Search Instagram Reels for “${q}”`;
  if (p.includes("/search")) return `Search ${plat} for “${q}”${next}`;
  if (p.includes("linktree")) return `Open Linktree of ${decodeURIComponent(parts[2])}`;
  if (p.includes("youtube/videos")) return "Read YouTube video description";
  if (p.match(/\/(videos|media)$/) || p.includes("channels/videos")) return `Recent posts from ${plat} creator`;
  if (p.includes("youtube/channel")) return `Analyse YouTube channel${params.get("handle") ? " @" + params.get("handle") : ""}`;
  return `Analyse ${plat} profile @${decodeURIComponent(parts[2] || "")}`;
}

function roll() {
  const b = Math.floor(Date.now() / 2000);
  while (stats.lastBucket < b) { stats.buckets.shift(); stats.buckets.push(0); stats.lastBucket++; }
}
function bump() { roll(); stats.buckets[stats.buckets.length - 1]++; }
setInterval(() => { roll(); renderKpis(); }, 2000);

function renderKpis() {
  $("kReq").textContent = stats.requests.toLocaleString();
  $("kAvg").textContent = stats.requests ? (stats.totalMs / stats.requests / 1000).toFixed(1) + "s" : "—";
  const perMin = stats.buckets.slice(-30).reduce((a, b) => a + b, 0);
  $("kRate").textContent = perMin.toLocaleString();
  const max = Math.max(4, ...stats.buckets);
  $("spark").innerHTML = stats.buckets.map((v, i) => `<i class="${i === stats.buckets.length - 1 ? "now" : ""}" style="height:${Math.max(2, (v / max) * 28)}px"></i>`).join("");
  $("consoleCount").textContent = stats.requests.toLocaleString();
  $("kCost").textContent = money(stats.credits);
  $("kCredits").textContent = `${stats.credits.toLocaleString()} credit${stats.credits === 1 ? "" : "s"}`;
  document.body.classList.toggle("busy", active > 0);
}

/**
 * Call the API (via the local server, which adds the key). Rejects with
 * { aborted: true } when the run that asked for it was cancelled.
 */
export function api(path, { signal, priority = 1 } = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ path, signal, priority, resolve, reject, at: performance.now() });
    queue.sort((a, b) => a.priority - b.priority || a.at - b.at);
    pump();
  });
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift();
    if (job.signal?.aborted) { job.reject({ aborted: true }); continue; }
    active++;
    run(job).finally(() => { active--; renderKpis(); pump(); });
  }
  renderKpis();
}

// A run waits for its slowest call, so one slow profile can't hold up the rest:
// searches get 25 s, everything else 15 s, then the call is dropped.
const TIMEOUT_MS = { search: 25_000, other: 15_000 };

async function run({ path, signal, priority, resolve, reject }) {
  const row = document.createElement("div");
  row.className = "row pending";
  const shown = decodeURIComponent(path).replace(/cursor=[^&]+/, "cursor=…").replace(/&trim=true/, "");
  row.innerHTML = `<span class="d"></span><span class="p"><b>${esc(describe(path))}</b><small>GET ${esc(shown)}</small></span><span class="ms">…</span>`;
  const list = $("consoleList");
  list.prepend(row);
  while (list.children.length > 150) list.lastChild.remove();
  const t0 = performance.now();
  bump();
  try {
    const origin = SHARDS[shardIdx++ % SHARDS.length];
    const limit = AbortSignal.timeout(priority === 0 ? TIMEOUT_MS.search : TIMEOUT_MS.other);
    const res = await fetch(origin + "/sf" + path, { signal: signal ? AbortSignal.any([signal, limit]) : limit });
    const json = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - t0);
    stats.requests++; stats.totalMs += ms;
    row.className = "row " + (res.ok ? "ok" : "err");
    const credits = res.ok ? Number(json?.meta?.creditsCharged ?? 1) : 0;
    if (res.ok) { stats.dataPoints += countValues(json.data); stats.views += sumViews(json.data); }
    stats.credits += credits;
    row.querySelector(".ms").innerHTML = `${res.status} · ${(ms / 1000).toFixed(1)}s${credits ? `<em>${money(credits)}</em>` : ""}`;
    for (const fn of listeners) fn();
    if ((res.status === 401 || res.status === 402 || res.status === 403) && !warned) {
      warned = true;
      toast(res.status === 402 ? "The demo key is out of credits. Top it up and retry." : `API key problem: ${json?.error?.message || res.status}`);
    }
    if (!res.ok) return reject(new Error(json?.error?.message || `HTTP ${res.status}`));
    resolve(json.data);
  } catch (e) {
    const aborted = signal?.aborted;
    const slow = !aborted && e?.name === "TimeoutError";
    row.className = "row " + (aborted || slow ? "" : "err");
    row.querySelector(".ms").textContent = aborted ? "cancelled" : slow ? "skipped, slow" : "failed";
    reject(aborted ? { aborted: true } : e);
  }
}

export function apiStats() { return { ...stats, active, queued: queue.length }; }

/** Every non-empty value in a response: each follower count, caption, timestamp, URL… */
function countValues(v) {
  if (v == null || v === "") return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + countValues(x), 0);
  if (typeof v === "object") { let n = 0; for (const k in v) n += countValues(v[k]); return n; }
  return 1;
}

/** Total views on every post or video in a response (not an account's lifetime views). */
const VIEW_KEYS = new Set(["views", "viewCount", "playCount", "play_count"]);
const ACCOUNT_KEYS = ["subscribers", "subscriberCount", "followers", "followerCount", "follower_count"];
function sumViews(v) {
  if (!v || typeof v !== "object") return 0;
  if (Array.isArray(v)) return v.reduce((n, x) => n + sumViews(x), 0);
  const account = ACCOUNT_KEYS.some((k) => k in v);
  let n = 0;
  for (const k in v) n += VIEW_KEYS.has(k) ? (typeof v[k] === "number" && !account ? v[k] : 0) : sumViews(v[k]);
  return n;
}

/** Starts counting from now; call the result to get what has been spent since. */
export function costMeter() {
  const r0 = stats.requests, c0 = stats.credits, d0 = stats.dataPoints, v0 = stats.views;
  return () => ({ requests: stats.requests - r0, credits: stats.credits - c0, dataPoints: stats.dataPoints - d0, views: stats.views - v0 });
}

/** "87 requests · $0.12 total · $0.009 per creator" for the end of a run. */
export function costLine({ requests, credits }, per, perLabel) {
  const parts = [`${requests.toLocaleString()} API request${requests === 1 ? "" : "s"}${credits !== requests ? ` (${credits.toLocaleString()} credits)` : ""}`, `${money(credits)} total`];
  if (per) parts.push(`${money(credits / per)} per ${perLabel}`);
  return parts.join(" · ");
}
