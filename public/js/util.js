export const ICONS = {
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.6c.27 0 .53.04.77.12V9.77a5.7 5.7 0 0 0-.77-.05A5.68 5.68 0 1 0 15.54 15.4V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.77-1.77C18.27 5 12 5 12 5s-6.27 0-7.83.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.77 1.77C5.73 19 12 19 12 19s6.27 0 7.83-.43a2.5 2.5 0 0 0 1.77-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.36 5.77zm-1.08 16.17h1.7L7.4 4.74H5.58z"/></svg>',
  reddit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.1a2.2 2.2 0 0 0-3.73-1.58 10.8 10.8 0 0 0-5.8-1.84l1-4.65 3.24.69a1.57 1.57 0 1 0 .16-.77l-3.62-.77a.39.39 0 0 0-.46.3l-1.1 5.2a10.8 10.8 0 0 0-5.9 1.84 2.2 2.2 0 1 0-2.42 3.6 4.3 4.3 0 0 0 0 .66c0 3.37 3.92 6.1 8.76 6.1s8.76-2.73 8.76-6.1a4.3 4.3 0 0 0 0-.66A2.2 2.2 0 0 0 22 12.1zM7 13.66a1.57 1.57 0 1 1 1.57 1.57A1.57 1.57 0 0 1 7 13.66zm8.77 4.14a5.78 5.78 0 0 1-3.77 1.18 5.78 5.78 0 0 1-3.77-1.18.41.41 0 0 1 .58-.58 4.94 4.94 0 0 0 3.19.95 4.94 4.94 0 0 0 3.19-.95.41.41 0 0 1 .58.58zm-.29-2.57a1.57 1.57 0 1 1 1.57-1.57 1.57 1.57 0 0 1-1.57 1.57z"/></svg>',
  linktree: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 2h2.8v6.1l4.3-4.4 2 2-4.5 4.3H21v2.9h-5.8l4.6 4.5-2 2-6.2-6.2-6.2 6.2-2-2 4.6-4.5H3V10h5.8L4.3 5.7l2-2 4.3 4.4zM10.6 16.3h2.8V22h-2.8z"/></svg>',
  tick: '<svg class="tick" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
};
export const PLATFORM_NAME = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", twitter: "X", reddit: "Reddit", linktree: "Linktree" };

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  const t = (v, s) => v.toFixed(1).replace(/\.0$/, "") + s;
  if (n >= 1e9) return t(n / 1e9, "B");
  if (n >= 1e6) return t(n / 1e6, "M");
  if (n >= 1e4) return Math.round(n / 1e3) + "K";
  if (n >= 1e3) return t(n / 1e3, "K");
  return String(Math.round(n));
};
export const pct = (v, d = 1) => v == null ? "—" : (v * 100).toFixed(d) + "%";
export const img = (u) => (u ? "/img?u=" + encodeURIComponent(u) : "");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ago(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 30) return Math.round(d) + " days ago";
  if (d < 365) return Math.round(d / 30) + " mo ago";
  return Math.round(d / 365) + " yr ago";
}

export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/* Link-in-bio and storefront tools creators use to earn on sales. */
const SHOP_LINKS = [
  [/(^|\/\/|\.)(shopltk\.com|liketk\.it|ltk\.app|liketoknow\.it)/i, "LTK storefront"],
  [/shopmy\.us|shopmy\.com/i, "ShopMy"],
  [/amazon\.[a-z.]+\/shop\/|amzn\.to|amazon\.com\/shop/i, "Amazon storefront"],
  [/collabs\.shop|tiktok\.com\/.*shop|vt\.tiktok\.com/i, "TikTok Shop"],
  [/stan\.store/i, "Stan Store"],
  [/beacons\.ai/i, "Beacons"],
  [/linktr\.ee/i, "Linktree"],
  [/bio\.site|lnk\.bio|hoo\.be|campsite\.bio|flowcode|msha\.ke|snipfeed|withkoji/i, "Link in bio"],
  [/geni\.us|howl\.me|bit\.ly|rstyle\.me|go\.magik\.ly|shareasale|skimresources/i, "Affiliate links"],
];
export function shopTools(links) {
  const out = new Set();
  for (const l of links) for (const [re, label] of SHOP_LINKS) if (re.test(l)) out.add(label);
  return [...out];
}
export const COLLAB = /\b(collab|collabs|collaborations?|pr\s*(friendly|list|packages?)|business\s*(inquir|enquir|email|contact)|brand\s*deals?|partnerships?|bookings?|management|for\s*work|dm\s*for|ugc)\b|📩|💌|📧|✉/i;
export const CODE_HINT = /\b(use\s+(my\s+)?code|discount\s*code|promo\s*code|coupon|code\s*[:"“']|%\s*off|save\s*\d+%)/i;
export const SPONSORED = /#(ad|sponsored|partner|gifted|paidpartnership|affiliate)\b|\bpaid partnership\b|\bsponsored by\b/i;

/* Discount codes written in captions: "code ANAIS20", "use my code: EMMA15", 'code "GLOW"'. */
const CODE_STOP = new Set("BELOW ABOVE LINK BIO HERE IN AT FOR THE AND MY YOUR THIS THAT CODE CODES OFF SAVE GET USE APPLY CHECKOUT FREE NOW WITH TO ON OF IS IT A AN OR NEW SALE SHOP DM COMMENT PROMO DISCOUNT COUPON WORKS VALID EXPIRES STILL ALSO JUST ONLY FIRST ORDER ORDERS ANY ALL GOOD BEST APP SITE WEBSITE STORE ONLINE LIVE TODAY HTTPS HTTP WWW COM EMAIL EXTRA PLUS".split(" "));
export function extractCodes(text) {
  if (!text) return [];
  const found = new Map();
  const re = /\b(?:use\s+(?:my\s+)?(?:code|coupon)|(?:discount|promo|coupon|creator|my|the|with|w\/)\s*code|code)\b\s*(?:is|:|-|=|“|"|')?\s*[“"']?([A-Za-z][A-Za-z0-9]{1,19}(?:-[A-Za-z0-9]{1,10})?|\d{2,}[A-Za-z][A-Za-z0-9]{1,18})[”"']?/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1];
    const up = raw.toUpperCase();
    if (CODE_STOP.has(up)) continue;
    const hasDigit = /\d/.test(raw);
    const allCaps = raw === up && /[A-Z]/.test(raw);
    if (!hasDigit && !allCaps) continue;
    if (up.replace(/-/g, "").length < 4) continue;
    const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 60);
    const off = around.match(/(\d{1,2})\s*%\s*off|(\d{1,2})\s*%|\$\s?(\d{1,3})\s*off/i);
    found.set(up, { code: up, at: m.index, discount: off ? (off[1] || off[2] ? `${off[1] || off[2]}% off` : `$${off[3]} off`) : null });
  }
  return [...found.values()];
}

export function countUp(el, target, format = (n) => Math.round(n).toLocaleString()) {
  if (!el) return;
  // Shows the real value straight away (no tweening, which reads as fake); a brief flash marks the change.
  const from = Number(el.dataset.v || 0);
  el.dataset.v = target;
  el.textContent = format(target);
  const stat = el.closest(".stat");
  if (stat && target > from) { stat.classList.remove("flash"); void stat.offsetWidth; stat.classList.add("flash"); }
}

let toastTimer;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

export const storage = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

export function downloadCsv(name, head, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
  const csv = [head.join(",")].concat(rows.map((r) => r.map(q).join(","))).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function flag(country) {
  const codes = { "United States": "US", "United Kingdom": "GB", Canada: "CA", Australia: "AU", Philippines: "PH", India: "IN", Brazil: "BR", Mexico: "MX", Germany: "DE", France: "FR", Spain: "ES", Italy: "IT", Indonesia: "ID", Nigeria: "NG", "South Korea": "KR", Korea: "KR", Japan: "JP", Netherlands: "NL", Ireland: "IE", "New Zealand": "NZ", "South Africa": "ZA", Pakistan: "PK", Malaysia: "MY", Singapore: "SG", Vietnam: "VN", Thailand: "TH", Turkey: "TR", Russia: "RU", Ukraine: "UA", Poland: "PL", Argentina: "AR", Colombia: "CO", Chile: "CL", Peru: "PE", Egypt: "EG", Kenya: "KE", "Saudi Arabia": "SA", "United Arab Emirates": "AE" };
  // A small country-code badge: flag emoji don't render on Windows.
  const cc = country?.length === 2 ? country.toUpperCase() : codes[country];
  return cc ? `<span class="cc">${cc}</span>` : "";
}

/** Social Fetch Scale plan, billed annually: $1.35 per 1,000 credits (most calls cost 1 credit). */
export const PRICE_PER_CREDIT = 1.35 / 1000;
/** Dollars for a number of credits: "$0.00135" for one request, "$0.12" for a run. */
export const money = (credits) => {
  const d = credits * PRICE_PER_CREDIT;
  if (d === 0) return "$0";
  if (d < 0.01) return "$" + d.toFixed(5).replace(/0+$/, "");
  return "$" + d.toFixed(2);
};
