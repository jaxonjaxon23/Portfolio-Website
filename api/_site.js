// api/_site.js — shared helpers for the crawler-facing routes (page.js, llms.js,
// sitemap.js). The site itself is drawn by JavaScript from Supabase content, so
// search engines and AI crawlers that don't run JS saw almost nothing. These
// routes build plain HTML/text from the SAME live content the CMS saves, so it
// never goes stale. (Files starting with "_" are not deployed as functions.)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://www.jaxonstickler.com';
const ROOT = process.cwd();

function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

// Supabase URL + public anon key, parsed from the same config file the browser uses
function supabaseConfig() {
  try {
    const src = read('supabase-config.js');
    const url = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(src) || [])[1];
    const key = (/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/.exec(src) || [])[1];
    return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
  } catch (_) { return null; }
}

// bundled content.js — offline fallback, same as the browser uses
function bundledContent() {
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(read('content.js'), sandbox, { timeout: 1000 });
    return sandbox.window.SITE_CONTENT || null;
  } catch (_) { return null; }
}

// Same ordering rules as the site: until the CMS has saved with ordersBaked,
// layout.js's index/gallery permutations still apply on top of the content.
function bakedOrders(content) {
  let B = {};
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(read('layout.js'), sandbox, { timeout: 1000 });
    B = sandbox.window.BAKED_LAYOUT || {};
  } catch (_) { return content; }
  const perm = (key, arr) => {
    try {
      const s = JSON.parse(B[key]);
      if (Array.isArray(s) && s.length === arr.length && new Set(s).size === arr.length &&
          s.every((i) => Number.isInteger(i) && i >= 0 && i < arr.length)) return s.map((i) => arr[i]);
    } catch (_) {}
    return arr;
  };
  return {
    ...content,
    projects: perm('index-project-order-v1', content.projects || [])
      .map((p) => ({ ...p, gallery: perm('gallery-order-' + p.id, p.gallery || []) })),
  };
}

async function loadContent() {
  let data = null, updatedAt = null;
  const cfg = supabaseConfig();
  if (cfg) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(cfg.url + '/rest/v1/content?id=eq.1&select=data,updated_at', {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows[0]) { data = rows[0].data; updatedAt = rows[0].updated_at; }
      }
    } catch (_) { /* fall back below */ }
  }
  let content;
  if (data && (data.bio || data.projects)) {
    content = { location: data.location || {}, bio: data.bio || {}, projects: Array.isArray(data.projects) ? data.projects : [] };
    if (!data.ordersBaked) content = bakedOrders(content);
  } else {
    content = bakedOrders(bundledContent() || { location: {}, bio: {}, projects: [] });
  }
  return { content, updatedAt };
}

// ---------------------------------------------------------------- text helpers
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "[label](url)" → "label"
const plain = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
const paras = (s) => plain(s).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const oneLine = (s, n) => {
  const t = plain(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
};
// Titles are stored in caps; readable case for prose (keeps short acronyms like BC/USB)
const titleCase = (s) => (s && s === s.toUpperCase())
  ? s.replace(/[A-Z]+/g, (w) => (w.length <= 3 && !/^(ME|MY|OF|THE|AND|TO|IN|ON|A|AN|OR|FOR|AT|BY|IS|IT)$/.test(w))
    ? w : w[0] + w.slice(1).toLowerCase())
  : (s || '');
const abs = (src) => { try { return new URL(src, SITE + '/').href; } catch (_) { return ''; } };
const projectUrl = (p) => SITE + '/work/' + encodeURIComponent(p.id);
const images = (p) => (p.gallery || []).filter((g) => g && g.type === 'image' && g.src);
const credits = (p) => [p.year, plain(p.client), plain(p.collab)].map((x) => (x || '').trim()).filter(Boolean);
const artist = (c) => (c.bio && c.bio.name) || 'Jaxon Stickler';
// image description: the CMS caption, else "<Project> by <name> — image N" (same as the site)
const altText = (c, p, g) => (g && g.alt) || (titleCase(p.title) + ' by ' + artist(c) + ' — image ' + ((p.gallery || []).indexOf(g) + 1));

// Instagram + the "Other profiles" CMS field (one URL per line; not shown on the site)
function profiles(c) {
  const b = c.bio || {};
  const list = [b.instagramUrl].concat(String(b.profiles || '').split(/\s+/));
  return Array.from(new Set(list.map((u) => (u || '').trim()).filter((u) => /^https?:\/\//i.test(u))));
}

// CV text: the CMS field if filled in, otherwise cv.md from the repo
function cvText(c) {
  const t = c.bio && c.bio.cvText && String(c.bio.cvText).trim();
  if (t) return t;
  try { return read('cv.md'); } catch (_) { return ''; }
}

// Share-preview image: a JPEG made by api/og.js from the project's first image
const ogImage = (id) => SITE + '/og/' + encodeURIComponent(id || 'home') + '.jpg';

// Minimal Markdown → HTML for the CV ("#"/"##"/"###" headings, "- " lists, paragraphs)
function mdToHtml(md) {
  const out = []; let list = false;
  const close = () => { if (list) { out.push('</ul>'); list = false; } };
  String(md || '').split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(t);
    if (!t) { close(); return; }
    if (h) { close(); const lv = Math.min(3, h[1].length + 1); out.push('<h' + lv + '>' + esc(h[2]) + '</h' + lv + '>'); return; }
    if (/^[-*]\s+/.test(t)) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + esc(t.replace(/^[-*]\s+/, '')) + '</li>'); return; }
    close(); out.push('<p>' + esc(t) + '</p>');
  });
  close();
  return out.join('');
}

// Client / collaborator credits as HTML with links — same rules as CreditText
// on the site: names from the project's creditLinks, "@handle" → Instagram,
// and [text](url).
function creditUrl(u) {
  u = String(u || '').trim();
  if (/^@[\w.]+$/.test(u)) return 'https://instagram.com/' + u.slice(1);
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}
function creditLinks(p) {
  return (p.creditLinks || []).filter((l) => l && l.name && String(l.name).trim() && l.url && String(l.url).trim())
    .map((l) => ({ name: String(l.name).trim(), url: creditUrl(l.url) }))
    .sort((a, b) => b.name.length - a.name.length);
}
function creditHtml(text, p) {
  text = String(text || '').trim();
  const named = creditLinks(p);
  const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\[([^\\]]+)\\]\\(([^)]+)\\)' +
    '|(' + (named.length ? named.map((l) => rx(l.name)).join('|') : '(?!)') + ')' +   // group 3 = a credited name
    '|(@[A-Za-z0-9._]*[A-Za-z0-9_])', 'gi');
  let out = '', last = 0, m;
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index));
    let label = m[0], href;
    if (m[1]) { label = m[1]; href = creditUrl(m[2]); }
    else if (m[3]) { const hit = named.find((l) => l.name.toLowerCase() === m[3].toLowerCase()); href = hit && hit.url; }
    else href = creditUrl(m[0]);
    out += href ? '<a href="' + esc(href) + '" rel="noopener">' + esc(label) + '</a>' : esc(label);
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

module.exports = { SITE, read, loadContent, esc, plain, paras, oneLine, titleCase, abs, projectUrl, images, credits,
  artist, altText, profiles, cvText, ogImage, mdToHtml, creditHtml, creditLinks };
