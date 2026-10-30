// The shortlist / outreach pipeline. Kept in localStorage so a refresh mid-demo keeps it.
import { storage } from "./util.js";

export const STAGES = [
  { key: "shortlisted", label: "Shortlisted", color: "#2e94d6" },
  { key: "contacted", label: "Contacted", color: "#7c5cd6" },
  { key: "replied", label: "Replied", color: "#b7791f" },
  { key: "signed", label: "Signed", color: "#16a34a" },
];
const KEY = "creator-scout.pipeline.v1";
let entries = storage.get(KEY, {});
const listeners = new Set();

const SNAP = ["id", "platform", "handle", "ytHandle", "name", "avatar", "followers", "er", "avgViews", "emails", "links", "region", "url", "bio", "fitScore", "kind", "shop", "channelId", "verified"];
function snapshot(c) {
  const s = {};
  for (const k of SNAP) if (c[k] != null) s[k] = c[k];
  s.fitScore = c.fit?.total ?? c.fitScore;
  return s;
}

export const pipeline = {
  has: (id) => !!entries[id],
  get: (id) => entries[id],
  all: () => Object.values(entries).sort((a, b) => b.addedAt - a.addedAt),
  count: () => Object.keys(entries).length,
  add(c, source, about = {}) {
    entries[c.id] = { ...snapshot(c), stage: "shortlisted", addedAt: Date.now(), source, brand: about.brand, keyword: about.keyword };
    save();
  },
  remove(id) { delete entries[id]; save(); },
  toggle(c, source, about) { entries[c.id] ? this.remove(c.id) : this.add(c, source, about); return !!entries[c.id]; },
  move(id, stage) { if (entries[id]) { entries[id].stage = stage; save(); } },
  refresh(c) { if (entries[c.id]) { entries[c.id] = { ...entries[c.id], ...snapshot(c) }; save(false); } },
  clear() { entries = {}; save(); },
  on: (fn) => listeners.add(fn),
};
function save(notify = true) {
  storage.set(KEY, entries);
  if (notify) for (const fn of listeners) fn();
}
