// api/page.js — serves "/" and "/work/<id>" (see vercel.json rewrites).
// Returns the normal app (app.html) with, added for crawlers and AI assistants:
//   • title, description, canonical, Open Graph / Twitter tags
//   • JSON-LD (Person + the projects as CreativeWorks)
//   • the bio and project text as plain HTML inside #root — React replaces it
//     the moment the app starts, so visitors see the site exactly as before.
// "/work/<id>" is a crawlable page per project; a person landing there is sent
// straight to that project in the app ("/#<id>").
// Any failure falls back to the untouched app.html, so the site never breaks.

const S = require('./_site');

function headTags({ title, description, url, image, type, jsonld, noindex }) {
  return [
    '<meta name="description" content="' + S.esc(description) + '" />',
    '<link rel="canonical" href="' + S.esc(url) + '" />',
    noindex ? '<meta name="robots" content="noindex" />' : '',
    '<meta property="og:site_name" content="Jaxon Stickler" />',
    '<meta property="og:type" content="' + type + '" />',
    '<meta property="og:title" content="' + S.esc(title) + '" />',
    '<meta property="og:description" content="' + S.esc(description) + '" />',
    '<meta property="og:url" content="' + S.esc(url) + '" />',
    image ? '<meta property="og:image" content="' + S.esc(image) + '" />' : '',
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '" />',
    '<meta name="twitter:title" content="' + S.esc(title) + '" />',
    '<meta name="twitter:description" content="' + S.esc(description) + '" />',
    image ? '<meta name="twitter:image" content="' + S.esc(image) + '" />' : '',
    '<link rel="alternate" type="text/plain" title="Summary for AI assistants" href="' + S.SITE + '/llms.txt" />',
    '<script type="application/ld+json">' + JSON.stringify(jsonld).replace(/</g, '\\u003c') + '</script>',
  ].filter(Boolean).join('\n');
}

function person(c) {
  const b = c.bio || {};
  return {
    '@type': 'Person',
    '@id': S.SITE + '/#person',
    name: b.name || 'Jaxon Stickler',
    jobTitle: b.role || 'Designer/Artist',
    description: S.paras(b.statement).join(' '),
    url: S.SITE + '/',
    email: b.email ? 'mailto:' + b.email : undefined,
    sameAs: [b.instagramUrl].filter(Boolean),
    homeLocation: c.location && c.location.city ? { '@type': 'Place', name: c.location.city } : undefined,
  };
}

function creativeWork(p, c) {
  const imgs = S.images(p);
  return {
    '@type': 'CreativeWork',
    '@id': S.projectUrl(p) + '#work',
    name: S.titleCase(p.title),
    url: S.projectUrl(p),
    dateCreated: /^\d{4}/.test(p.year || '') ? String(p.year).slice(0, 4) : undefined,
    description: S.paras(p.desc).join(' ') || undefined,
    material: S.plain(p.medium) || undefined,
    keywords: (p.keywords || []).join(', ') || undefined,
    image: imgs.slice(0, 6).map((g) => S.abs(g.src)),
    creator: { '@id': S.SITE + '/#person', name: (c.bio && c.bio.name) || 'Jaxon Stickler' },
    contributor: S.plain(p.collab) || undefined,
    sourceOrganization: S.plain(p.client) || undefined,
  };
}

function bioHtml(c, headingTag) {
  const b = c.bio || {};
  const working = (b.working || []).map((w) => w && w.text).filter(Boolean);
  return [
    '<' + headingTag + '>' + S.esc(b.name || 'Jaxon Stickler') + '</' + headingTag + '>',
    '<p>' + S.esc(b.role || 'Designer/Artist') + '</p>',
    S.paras(b.statement).map((t) => '<p>' + S.esc(t) + '</p>').join(''),
    b.openTo ? '<p>' + S.esc(b.openTo) + '</p>' : '',
    c.location && c.location.city ? '<p>Current location: ' + S.esc(c.location.city) + '</p>' : '',
    working.length ? '<p>Currently working on: ' + S.esc(working.join(', ')) + '</p>' : '',
    '<p>Contact: ' +
      (b.email ? '<a href="mailto:' + S.esc(b.email) + '">' + S.esc(b.email) + '</a>' : '') +
      (b.instagramUrl ? ' · Instagram <a href="' + S.esc(b.instagramUrl) + '">' + S.esc(b.instagram || b.instagramUrl) + '</a>' : '') +
      (b.cvFile ? ' · <a href="/' + S.esc(String(b.cvFile).replace(/^\/+/, '')) + '">CV (PDF)</a>' : '') +
    '</p>',
  ].join('');
}

function projectSummaryHtml(p) {
  const cr = S.credits(p);
  return '<article><h3><a href="/work/' + encodeURIComponent(p.id) + '">' + S.esc(S.titleCase(p.title)) + '</a></h3>' +
    (cr.length ? '<p>' + S.esc(cr.join(' · ')) + '</p>' : '') +
    (p.medium ? '<p>Medium: ' + S.esc(S.plain(p.medium)) + '</p>' : '') +
    S.paras(p.desc).map((t) => '<p>' + S.esc(t) + '</p>').join('') +
    ((p.keywords || []).length ? '<p>Keywords: ' + S.esc(p.keywords.join(', ')) + '</p>' : '') +
    '</article>';
}

function homePage(c) {
  const b = c.bio || {};
  const name = b.name || 'Jaxon Stickler';
  const projects = c.projects || [];
  const first = projects.map((p) => S.images(p)[0]).find(Boolean);
  const description = S.oneLine(name + ', ' + (b.role || 'designer/artist') + '. ' + S.paras(b.statement).join(' '), 160);
  return {
    title: name + ' — ' + (b.role || 'Designer/Artist'),
    head: {
      title: name + ' — ' + (b.role || 'Designer/Artist'),
      description, url: S.SITE + '/', image: first ? S.abs(first.src) : '', type: 'profile',
      jsonld: {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': S.SITE + '/#website', url: S.SITE + '/', name: name, about: { '@id': S.SITE + '/#person' } },
          { ...person(c), subjectOf: projects.map((p) => ({ '@id': S.projectUrl(p) + '#work' })) },
          ...projects.map((p) => creativeWork(p, c)),
        ],
      },
    },
    body: '<main class="seo-prerender">' +
      '<header>' + bioHtml(c, 'h1') + '</header>' +
      '<section><h2>Projects</h2>' + projects.map(projectSummaryHtml).join('') + '</section>' +
      '</main>',
  };
}

function workPage(c, p) {
  const b = c.bio || {};
  const name = b.name || 'Jaxon Stickler';
  const t = S.titleCase(p.title);
  const imgs = S.images(p);
  const cr = S.credits(p);
  const description = S.oneLine((S.paras(p.desc).join(' ') || (t + ' by ' + name + '.')), 160);
  const others = (c.projects || []).filter((o) => o.id !== p.id);
  return {
    title: t + (p.year ? ' (' + p.year + ')' : '') + ' — ' + name,
    head: {
      title: t + ' — ' + name,
      description, url: S.projectUrl(p), image: imgs[0] ? S.abs(imgs[0].src) : '', type: 'article',
      jsonld: {
        '@context': 'https://schema.org',
        '@graph': [
          creativeWork(p, c),
          person(c),
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: name, item: S.SITE + '/' },
            { '@type': 'ListItem', position: 2, name: t, item: S.projectUrl(p) },
          ] },
        ],
      },
    },
    body: '<main class="seo-prerender">' +
      '<nav><a href="/">' + S.esc(name) + '</a> / Projects</nav>' +
      '<article><h1>' + S.esc(t) + '</h1>' +
      (cr.length ? '<p>' + S.esc(cr.join(' · ')) + '</p>' : '') +
      (p.medium ? '<p>Medium: ' + S.esc(S.plain(p.medium)) + '</p>' : '') +
      S.paras(p.desc).map((x) => '<p>' + S.esc(x) + '</p>').join('') +
      ((p.keywords || []).length ? '<p>Keywords: ' + S.esc(p.keywords.join(', ')) + '</p>' : '') +
      imgs.map((g, i) => '<figure><img src="' + S.esc(S.abs(g.src)) + '" alt="' + S.esc(t + ' by ' + name + ' — image ' + (i + 1)) + '" loading="lazy" /></figure>').join('') +
      '<p><a href="/#' + encodeURIComponent(p.id) + '">View ' + S.esc(t) + ' on the interactive site</a></p>' +
      '</article>' +
      '<aside>' + bioHtml(c, 'h2') + '</aside>' +
      (others.length ? '<section><h2>More projects</h2><ul>' + others.map((o) =>
        '<li><a href="/work/' + encodeURIComponent(o.id) + '">' + S.esc(S.titleCase(o.title)) + '</a>' + (o.year ? ' (' + S.esc(o.year) + ')' : '') + '</li>').join('') + '</ul></section>' : '') +
      '</main>',
  };
}

// people (not crawlers) opening /work/<id> go straight to the project in the app
function redirectScript(id) {
  return '<base href="/" />\n<script>try{history.replaceState(null,"","/#' +
    encodeURIComponent(id).replace(/["<>\\]/g, '') + '")}catch(e){location.replace("/#' +
    encodeURIComponent(id).replace(/["<>\\]/g, '') + '")}</script>';
}

function inject(template, page, workId) {
  let html = template;
  if (workId) html = html.replace(/<head>/i, '<head>\n' + redirectScript(workId));
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + S.esc(page.title) + '</title>\n' + headTags(page.head));
  // keep the prerendered text from adding a scrollbar under the preloader
  html = html.replace(/<\/style>/i, '  #root > .seo-prerender { max-height: 100vh; overflow: hidden; padding: 24px; font-family: Inter, sans-serif; color: #fff; }\n</style>');
  html = html.replace('<div id="root"></div>', '<div id="root">' + page.body + '</div>');
  return html;
}

module.exports = async function handler(req, res) {
  let template;
  try { template = S.read('app.html'); }
  catch (e) { res.statusCode = 500; res.end('Site template missing'); return; }

  const send = (status, html) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // CDN-cached; CMS saves show up within ~5 minutes
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    res.end(html);
  };

  try {
    const { content } = await S.loadContent();
    const id = (req.query && req.query.project) || '';
    if (id) {
      const p = (content.projects || []).find((x) => x.id === id);
      if (!p) {
        const home = homePage(content);
        home.head.noindex = true;
        return send(404, inject(template, home, null));
      }
      return send(200, inject(template, workPage(content, p), p.id));
    }
    return send(200, inject(template, homePage(content), null));
  } catch (e) {
    console.error('page render failed', e);
    return send(200, template);   // never break the site: serve the plain app
  }
};
