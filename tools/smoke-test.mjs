// tools/smoke-test.mjs — `npm test`: checks the BUILT site (run `npm run build`
// first; `npm run check` does both) before it goes live. Runs automatically
// before every `git push` (see .githooks/pre-push), since a push deploys.
//
// Starts the local server on public/, then:
//   • server: pages, crawler HTML, sitemap, llms.txt, share images, thumbnails,
//     cache + security headers, tab icon, 404 for unknown projects
//   • browser (an invisible/headless Edge or Chrome — no window opens):
//     the projects board loads with images and links, scrolls smoothly, every
//     project page renders, the About diagram, phone layout, and the CMS —
//     with no JavaScript errors anywhere
// Exits with an error (blocking the push) if anything fails.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const ROOT = process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [], warnings = [];
const check = (ok, label, detail) => { if (ok) console.log('  ✓ ' + label); else { failures.push(label); console.log('  ✗ ' + label + (detail ? ' — ' + detail : '')); } };
const warn = (label) => { warnings.push(label); console.log('  ! ' + label); };

if (!existsSync(path.join(ROOT, 'public', 'app.html'))) { console.error('No build found: run `npm run build` first (or `npm run check`).'); process.exit(1); }

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const PORT = await freePort();
const BASE = 'http://localhost:' + PORT;
const server = spawn(process.execPath, ['tools/dev-server.mjs', '--public'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
let browser = null, profile = null;
const cleanup = () => {
  try { server.kill(); } catch (_) {}
  try { if (browser) browser.kill(); } catch (_) {}
  try { if (profile) rmSync(profile, { recursive: true, force: true }); } catch (_) {}
};
process.on('exit', cleanup);
for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/robots.txt'); break; } catch (_) { await sleep(200); } }

// ---------------------------------------------------------------- server checks
console.log('\nServer');
const get = async (p) => { const r = await fetch(BASE + p, { redirect: 'manual' }); return { status: r.status, type: r.headers.get('content-type') || '', headers: r.headers, text: /image|octet/.test(r.headers.get('content-type') || '') ? '' : await r.text() }; };
const home = await get('/');
check(home.status === 200 && /<main class="seo-prerender">/.test(home.text), 'home page has crawler text');
check(/og:image/.test(home.text) && /application\/ld\+json/.test(home.text), 'home page has share image + structured data');
check(/frame-ancestors 'self'/.test(home.headers.get('content-security-policy') || '') && home.headers.get('x-content-type-options') === 'nosniff', 'security headers');
const bundle = (/build\/site-[0-9a-f]+\.js/.exec(home.text) || [])[0];
check(!!bundle, 'page loads the site bundle');
if (bundle) check(/immutable/.test((await get('/' + bundle)).headers.get('cache-control') || ''), 'bundle is cached long-term');
const sitemap = await get('/sitemap.xml');
const projectIds = [...sitemap.text.matchAll(/\/work\/([^<]+)<\/loc>/g)].map((m) => decodeURIComponent(m[1]));
check(sitemap.status === 200 && projectIds.length > 5 && /<image:loc>/.test(sitemap.text), 'sitemap lists projects and images', projectIds.length + ' projects');
const first = projectIds[0];
if (first) {
  const pg = await get('/work/' + encodeURIComponent(first));
  check(pg.status === 200 && /<h1>/.test(pg.text) && /seo-gallery" hidden/.test(pg.text), 'project page has crawler text (' + first + ')');
  const og = await get('/og/' + encodeURIComponent(first) + '.jpg');
  check(og.status === 200 && /jpeg/.test(og.type), 'share image renders');
}
check((await get('/work/no-such-project-xyz')).status === 404, 'unknown project → 404');
const llms = await get('/llms.txt');
check(llms.status === 200 && llms.text.length > 500, 'llms.txt');
check((await get('/cv')).status === 200, '/cv page');
const thumb = await get('/api/thumb?w=640&src=' + encodeURIComponent('images/tank/tank1.webp'));
check(thumb.status === 200 && /webp/.test(thumb.type), 'on-demand thumbnails');
check((await get('/favicon.ico')).status === 200 && (await get('/favicon.svg')).status === 200, 'tab icon');
check(/noindex/.test((await get('/admin.html')).headers.get('x-robots-tag') || ''), 'CMS hidden from search engines');

// ---------------------------------------------------------------- browser checks
const BROWSERS = [process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const exe = BROWSERS.find((b) => existsSync(b));
if (!exe) {
  warn('no Edge/Chrome found — browser checks skipped (set BROWSER=/path/to/browser)');
} else {
  console.log('\nBrowser (' + path.basename(exe) + ', headless)');
  const dport = await freePort();
  profile = mkdtempSync(path.join(tmpdir(), 'smoke-'));
  browser = spawn(exe, ['--headless=new', '--remote-debugging-port=' + dport, '--user-data-dir=' + profile, '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:' + dport + '/json/list')).json()).find((t) => t.type === 'page'); } catch (_) {} }
  if (!target) { check(false, 'browser starts'); }
  else {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0; const pend = new Map(); let errors = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.exceptionDetails ? { __error: (r.result.exceptionDetails.exception || {}).description } : r.result && r.result.result && r.result.result.value; };
    const noErrors = (label) => { check(!errors.length, label + ': no JavaScript errors', errors.slice(0, 3).join(' | ')); errors = []; };
    const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(250); } return false; };
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

    // projects board
    await send('Page.navigate', { url: BASE + '/?lite=0' });
    check(await waitFor(`!document.getElementById('preloader') && document.querySelectorAll('[data-col-id]').length > 0`, 20000), 'projects page loads (loading screen finishes)');
    await sleep(1500);
    const board = await ev(`(() => { const P = window.PROJECTS || []; const imgs = [...document.querySelectorAll('[data-col-id] img')];
      const vis = imgs.filter((i) => { const r = i.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.top < innerHeight; });
      return { projects: P.length, cols: document.querySelectorAll('[data-col-id]').length,
        visible: vis.length, loaded: vis.filter((i) => i.complete && i.naturalWidth > 0).length,
        links: [...document.querySelectorAll('[data-col-id] a[href^="/work/"]')].length }; })()`);
    check(board && board.cols === board.projects && board.projects > 0, 'one column per project', board && board.cols + '/' + board.projects);
    check(board && board.visible > 0 && board.loaded === board.visible, 'first-screen images loaded', board && board.loaded + '/' + board.visible);
    check(board && board.links >= board.projects, 'projects are real links');
    // scroll with the mouse wheel and watch the frames
    await ev(`(() => { window.__gaps = []; let last = 0; const f = (t) => { if (last) window.__gaps.push(t - last); last = t; if (!window.__stopGaps) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
    for (let k = 0; k < 6; k++) { for (let n = 0; n < 3; n++) { await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 450, deltaX: 0, deltaY: 120 }); await sleep(60); } await sleep(500); }
    await sleep(800);
    const scroll = await ev(`(() => { window.__stopGaps = true; const b = [...document.querySelectorAll('div')].find((d) => d.style.position === 'fixed' && d.querySelector('[data-col-id]'));
      const g = window.__gaps.slice(2).sort((a, b) => a - b); return { moved: Math.round(b.__glideX !== undefined ? b.__glideX : b.scrollLeft), worst: Math.round(g[g.length - 1] || 0), median: Math.round((g[g.length >> 1] || 0) * 10) / 10 }; })()`);
    check(scroll && scroll.moved > 300, 'board scrolls with the mouse wheel', scroll && scroll.moved + 'px');
    check(scroll && scroll.worst < 300, 'no freezes while scrolling', scroll && 'worst frame ' + scroll.worst + 'ms');
    if (scroll && scroll.median > 25) warn('frames slower than usual while scrolling (median ' + scroll.median + 'ms) — machine busy?');
    noErrors('projects page');

    // every project page (switched in place, like a visitor clicking through)
    const pages = await ev(`(async () => { const bad = []; for (const p of window.PROJECTS) {
        history.pushState(null, '', '/work/' + encodeURIComponent(p.id)); dispatchEvent(new Event('viewchange'));
        await new Promise((r) => setTimeout(r, 350));
        const h1 = document.querySelector('h1'); const media = document.querySelectorAll('img, video, canvas[data-video], iframe').length;
        if (!h1 || h1.textContent.trim() !== String(p.title).trim() || (p.gallery.length && !media)) bad.push(p.id);
      } return { n: window.PROJECTS.length, bad }; })()`);
    check(pages && pages.bad && !pages.bad.length, 'every project page renders (' + (pages && pages.n) + ')', pages && pages.bad && pages.bad.join(', '));
    noErrors('project pages');

    // a fresh load of a project page, and in-place link navigation
    await send('Page.navigate', { url: BASE + '/work/' + encodeURIComponent(first) });
    check(await waitFor(`!document.getElementById('preloader') && !!document.querySelector('h1')`, 20000), 'project page loads directly');
    const nav = await ev(`(async () => { window.__same = 1; const a = [...document.querySelectorAll('#about-bubble a')].find((x) => x.getAttribute('href') === '/'); if (!a) return 'no link';
      a.click(); await new Promise((r) => setTimeout(r, 800)); return { path: location.pathname, same: window.__same === 1 }; })()`);
    check(nav && nav.path === '/' && nav.same, 'nav links switch pages without reloading');
    noErrors('direct project page');

    // About diagram
    await send('Page.navigate', { url: BASE + '/about' });
    check(await waitFor(`!document.getElementById('preloader')`, 20000), 'about page loads');
    await sleep(1500);
    const about = await ev(`({ nodes: [...document.querySelectorAll('a[href^="/work/"]')].filter((a) => a.style.borderRadius === '50%').length, projects: window.PROJECTS.length, entities: document.querySelectorAll('svg.fig-entity').length })`);
    check(about && about.nodes === about.projects, 'diagram has a node per project', about && about.nodes + '/' + about.projects);
    check(about && about.entities >= 2, 'animated entities appear');
    noErrors('about page');

    // phone layout
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: BASE + '/' });
    check(await waitFor(`!document.getElementById('preloader') && document.querySelectorAll('[data-col-id]').length > 0`, 20000), 'phone: projects page loads');
    await send('Page.navigate', { url: BASE + '/work/' + encodeURIComponent(first) });
    check(await waitFor(`!!document.querySelector('h1')`, 20000), 'phone: project page loads');
    await sleep(800);
    noErrors('phone layout');
    await send('Emulation.clearDeviceMetricsOverride'); await send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // CMS (sign-in screen + editor code loaded)
    await send('Page.navigate', { url: BASE + '/admin.html' });
    check(await waitFor(`document.querySelectorAll('input').length >= 2 && typeof window.ProjectEditor === 'function'`, 15000), 'CMS loads');
    await sleep(1000);
    noErrors('CMS');
    ws.close();
  }
}

cleanup();
console.log('\n' + (failures.length ? '✗ ' + failures.length + ' check(s) failed: ' + failures.join('; ') : '✓ all checks passed') +
  (warnings.length ? '  (' + warnings.length + ' warning' + (warnings.length > 1 ? 's' : '') + ')' : ''));
process.exit(failures.length ? 1 : 0);
