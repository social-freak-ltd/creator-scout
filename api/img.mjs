import { image } from "../lib/routes.mjs";

export default async function handler(req, res) {
  try { await image(res, new URL(req.url, "http://x").searchParams.get("u")); } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}
