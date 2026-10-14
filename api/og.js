// api/og.js — serves "/og/<id>.jpg": the share-preview image for a project
// ("home" = the site), made from its first image as a 1200×630 JPEG. Link
// previews (iMessage, WhatsApp, LinkedIn, X…) handle JPEG everywhere, while the
// site's own images stay WebP for speed. Works for every image uploaded through
// the CMS automatically; results are CDN-cached for a day.

const sharp = require('sharp');
const S = require('./_site');

const W = 1200, H = 630;

async function blank() {
  return sharp({ create: { width: W, height: H, channels: 3, background: '#0b0c0d' } }).jpeg({ quality: 80 }).toBuffer();
}

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || 'home').replace(/\.jpe?g$/i, '');
  let jpg;
  try {
    const { content } = await S.loadContent();
    const projects = content.projects || [];
    const p = id === 'home' ? projects.find((x) => S.images(x).length) : projects.find((x) => x.id === id);
    const src = p && S.images(p)[0] && S.abs(S.images(p)[0].src);
    if (!src) throw new Error('no image');
    const r = await fetch(src);
    if (!r.ok) throw new Error('image ' + r.status);
    const input = Buffer.from(await r.arrayBuffer());
    jpg = await sharp(input)
      .rotate()                                   // respect camera orientation
      .resize(W, H, { fit: 'cover', position: sharp.strategy.attention })
      .flatten({ background: '#0b0c0d' })         // no transparency in JPEG
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    jpg = await blank();
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.end(jpg);
};
