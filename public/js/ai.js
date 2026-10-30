// AI screening: asks Jev (via the local server) whether each creator really makes
// content about the search topic and what kind of account it is. Calls are
// micro-batched so a search's worth of creators goes up in one request.
import { $, esc } from "./util.js";

const pending = new Map(); // topic -> [{ c, resolve }]
let timer = null;
export const aiStats = { judged: 0, cost: 0, offTopic: 0 };

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

/** What Jev sees: only text that says what the account posts about. No numbers (it isn't a calculator). */
function stateOf(c) {
  const captions = [...(c.mentions || []), ...(c.recent || [])].map((p) => clip(p.caption, 220)).filter(Boolean);
  return {
    platform: c.platform,
    display_name: clip(c.name, 80),
    handle: c.ytHandle || c.handle,
    bio: clip(c.bio, 400) || "(no bio)",
    ...(c.category ? { profile_category: c.category } : {}),
    post_captions: [...new Set(captions)].slice(0, 8),
  };
}

/** Resolves with c.ai set (or unchanged if the AI is unavailable). Re-judges when more content arrived. */
export function judge(c, topic) {
  const state = stateOf(c);
  const sig = topic + "|" + JSON.stringify(state);
  if (c.ai?.sig === sig) return Promise.resolve(c);
  return new Promise((resolve) => {
    if (!pending.has(topic)) pending.set(topic, []);
    pending.get(topic).push({ c, state, sig, resolve });
    timer ??= setTimeout(flush, 120);
  });
}

async function flush() {
  timer = null;
  for (const [topic, jobs] of pending) {
    pending.delete(topic);
    for (let i = 0; i < jobs.length; i += 40) send(topic, jobs.slice(i, i + 40));
  }
}

async function send(topic, jobs) {
  // One console row per topic that keeps its running total and moves back to the top,
  // so the AI doesn't bury the API calls.
  const list = $("consoleList");
  const row = [...list.querySelectorAll(".row.ai")].find((r) => r.dataset.topic === topic) || document.createElement("div");
  row.dataset.topic = topic;
  row.dataset.n = Number(row.dataset.n || 0) + jobs.length;
  row.className = "row pending ai";
  row.innerHTML = `<span class="d"></span><span class="p"><b>✦ AI screened ${row.dataset.n} creator${row.dataset.n === "1" ? "" : "s"} for “${esc(topic)}”</b><small>Jev decision model</small></span><span class="ms">…</span>`;
  if (list.firstElementChild !== row) list.prepend(row);
  const t0 = performance.now();
  let results = {};
  try {
    const res = await fetch("/ai/judge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, items: jobs.map((j) => ({ id: j.c.id, state: j.state })) }) });
    results = await res.json();
    row.className = "row ok ai";
  } catch {
    row.className = "row err ai";
  }
  const ms = performance.now() - t0;
  let off = 0;
  for (const j of jobs) {
    const r = results[j.c.id];
    if (r) {
      j.c.ai = { ...r, topic, sig: j.sig };
      aiStats.judged++;
      aiStats.cost += r.cost;
      if (r.fit < 0.25) off++;
    }
    j.resolve(j.c);
  }
  aiStats.offTopic += off;
  row.dataset.off = Number(row.dataset.off || 0) + off;
  row.querySelector(".ms").textContent = `${(ms / 1000).toFixed(1)}s`;
  if (row.dataset.off !== "0") row.querySelector("small").textContent += ` · ${row.dataset.off} off-topic`;
}

export const KIND_LABEL = { creator: "Creator", brand: "Brand account", entertainment: "Music / entertainment", media: "Media page", fan_or_meme: "Fan / meme page" };
export const LEVEL_LABEL = (topic) => [`Not about ${topic}`, `Mentions ${topic} in passing`, `Posts about ${topic} regularly`, `Dedicated ${topic} creator`];

/** True when Jev is confident this isn't an individual creator. */
export const notCreator = (c) => c.ai && c.ai.kind !== "creator" && c.ai.kindConfidence >= 0.5;
/** True when Jev is confident this is a person, which overrides the bio keyword heuristics. */
export const aiCreator = (c) => c.ai?.kind === "creator" && c.ai.kindConfidence >= 0.6;
/** Screened out before analysis: clearly not a creator, or clearly off-topic. */
export const aiReject = (c) => !!c.ai && (notCreator(c) || c.ai.fit < 0.12 || c.ai.partner < 0.35);

/** A new search starts its own AI row instead of adding to an older one for the same topic. */
export const startAiRows = () => { for (const r of document.querySelectorAll("#consoleList .row.ai")) delete r.dataset.topic; };
