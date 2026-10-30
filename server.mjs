// Creator Scout local server: serves the page and the routes in lib/routes.mjs, with
// keys from .env. On Vercel the same routes run as functions in api/ (see vercel.json).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { relay, judge, image, ping } from "./lib/routes.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4747);

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.SOCIALFETCH_API_KEY) {
  console.error("Set SOCIALFETCH_API_KEY in .env");
  process.exit(1);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    // The page spreads calls over s1..s4.localhost to get past the browser's 6-connections-per-host cap.
    if (url.pathname === "/sf-ping") return ping(res);
    if (url.pathname.startsWith("/sf/")) return await relay(res, url.pathname.slice(3), url.search);
    if (url.pathname === "/ai/judge" && req.method === "POST") return await judge(req, res);
    if (url.pathname === "/img") return await image(res, url.searchParams.get("u"));
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const path = join(ROOT, "public", file);
    if (!path.startsWith(join(ROOT, "public"))) return res.writeHead(403).end();
    const data = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch (err) {
    if (!res.headersSent) res.writeHead(err.code === "ENOENT" ? 404 : 502);
    res.end();
  }
});

server.listen(PORT, () => console.log(`Creator Scout running at http://localhost:${PORT}`));
