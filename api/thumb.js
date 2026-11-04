// api/thumb.js — "/api/thumb?src=<image>": a 640px WebP copy of one of the
// site's images, for the projects page. The build already makes these for
// every image (public/thumbs/); this covers images uploaded through the CMS
// since the last deploy. Only the site's own images (images/…) and its own
// Supabase storage are accepted. CDN-cached for a long time.

const sharp = require('sharp');
const S = require('./_site');

const THUMB_W = 640;

function allowed(src) {
  if (/^images\/[\w./-]+$/i.test(src) && !src.includes('..')) return S.SITE + '/' + src;
  const cfg = (() => { try { return S.read('supabase-config.js'); } catch (_) { return ''; } })();
  const base = (/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(cfg) || [])[1];
  const prefix = base && base.replace(/\/+$/, '') + '/storage/v1/object/public/images/';
  return prefix && src.startsWith(prefix) && !src.includes('..') ? src : null;
}

module.exports = async function handler(req, res) {
  const src = String((req.query && req.query.src) || '');
  const url = allowed(src);
  if (!url) { res.statusCode = 400; res.end('not an image from this site'); return; }
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('image ' + r.status);
    const out = await sharp(Buffer.from(await r.arrayBuffer()), { failOn: 'none' })
      .rotate().resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800');
    res.end(out);
  } catch (e) {
    // couldn't make a copy: send people to the original instead
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.end();
  }
};
