// /sf/* is rewritten here by vercel.json; Vercel passes the captured API path as ?__p,
// which must not reach the API (the v2 endpoints reject unknown query parameters).
import { relay } from "../lib/routes.mjs";

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const path = "/" + (url.searchParams.get("__p") || "");
  url.searchParams.delete("__p");
  const search = url.searchParams.size ? "?" + url.searchParams.toString() : "";
  try { await relay(res, path, search); } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}
