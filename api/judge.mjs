import { judge } from "../lib/routes.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.writeHead(405).end();
  try { await judge(req, res); } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
}
