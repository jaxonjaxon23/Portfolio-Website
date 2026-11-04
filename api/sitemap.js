// api/sitemap.js — serves "/sitemap.xml": the home page plus one crawlable page
// per project ("/work/<id>"), generated from the live CMS content.

const S = require('./_site');

module.exports = async function handler(req, res) {
  const { content, updatedAt } = await S.loadContent();
  const lastmod = updatedAt ? '<lastmod>' + String(updatedAt).slice(0, 10) + '</lastmod>' : '';
  // project pages list their images too (Google's image-sitemap extension),
  // so image search finds them without running the site's JavaScript
  const pages = [S.SITE + '/', S.SITE + '/about', S.SITE + '/cv'].map((loc) => ({ loc, imgs: [] }))
    .concat((content.projects || []).map((p) => ({
      loc: S.projectUrl(p),
      imgs: S.images(p).slice(0, 1000).map((g) => S.abs(g.src)).filter(Boolean),
    })));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    pages.map((pg) => '  <url><loc>' + S.esc(pg.loc) + '</loc>' + lastmod +
      pg.imgs.map((u) => '<image:image><image:loc>' + S.esc(u) + '</image:loc></image:image>').join('') +
      '</url>').join('\n') +
    '\n</urlset>\n';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(xml);
};
