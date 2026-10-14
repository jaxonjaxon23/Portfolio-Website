// tools/dev-server.mjs — local preview that behaves like Vercel: applies the
// redirects/rewrites in vercel.json, runs the api/*.js functions, and serves
// static files. `npm run dev` serves the source files (JSX compiled in the
// browser); `npm run dev -- --public` serves the built public/ folder
// (run `npm run build` first). Port 5510, or PORT.

import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const STATIC = process.argv.includes('--public') ? path.join(ROOT, 'public') : ROOT;
const PORT = Number(process.env.PORT) || 5510;
const cfg = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
  '.jsx': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };

// "/work/:id" → { re, keys }
function compile(source) {
  const keys = [];
  const re = new RegExp('^' + source.replace(/[.]/g, '\\.').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+?)'; }) + '/?$');
  return { re, keys };
}
function match(rule, pathname) {
  const { re, keys } = compile(rule.source);
  const m = re.exec(pathname);
  if (!m) return null;
  let dest = rule.destination;
  keys.forEach((k, i) => { dest = dest.split(':' + k).join(encodeURIComponent(decodeURIComponent(m[i + 1]))); });
  return dest;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  for (const r of cfg.redirects || []) {
    const d = match(r, url.pathname);
    if (d) { res.writeHead(r.permanent ? 308 : 307, { Location: d }); return res.end(); }
  }
  let target = url.pathname + url.search;
  for (const r of cfg.rewrites || []) {
    const d = match(r, url.pathname);
    if (d) { target = d; break; }
  }
  const t = new URL(target, 'http://localhost');
  if (t.pathname.startsWith('/api/')) {
    const file = path.join(ROOT, t.pathname + '.js');
    if (!existsSync(file)) { res.writeHead(404); return res.end('no function'); }
    delete require.cache[require.resolve(file)];
    delete require.cache[require.resolve(path.join(ROOT, 'api', '_site.js'))];
    req.query = Object.fromEntries(t.searchParams);
    try { await require(file)(req, res); }
    catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
    return;
  }
  const file = path.join(STATIC, decodeURIComponent(t.pathname));
  if (!file.startsWith(STATIC) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
server.listen(PORT, () => console.log('dev server on http://localhost:' + PORT + ' serving ' + path.relative(ROOT, STATIC || '.') || '.'));
