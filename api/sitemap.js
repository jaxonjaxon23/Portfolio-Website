// api/sitemap.js — serves "/sitemap.xml": the home page plus one crawlable page
// per project ("/work/<id>"), generated from the live CMS content.

const S = require('./_site');

module.exports = async function handler(req, res) {
  const { content, updatedAt } = await S.loadContent();
  const lastmod = updatedAt ? '<lastmod>' + String(updatedAt).slice(0, 10) + '</lastmod>' : '';
  const urls = [S.SITE + '/', S.SITE + '/about', S.SITE + '/cv', S.SITE + '/llms.txt']
    .concat((content.projects || []).map(S.projectUrl));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + S.esc(u) + '</loc>' + lastmod + '</url>').join('\n') +
    '\n</urlset>\n';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(xml);
};
