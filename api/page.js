// api/page.js — serves "/", "/about", "/work/<id>" and "/cv" (see vercel.json).
// Returns the normal app (app.html) with, added for crawlers and AI assistants:
//   • title, description, canonical, Open Graph / Twitter tags (JPEG previews)
//   • JSON-LD (Person + the projects as CreativeWorks)
//   • the bio / project / CV text as plain HTML inside #root — React replaces it
//     the moment the app starts, so visitors see the site exactly as before.
// "/cv" is for crawlers only: nothing on the site links to it (the app shows
// the projects index there). Any failure falls back to the plain app.html.

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
    '<meta property="og:image" content="' + S.esc(image) + '" />',
    '<meta property="og:image:type" content="image/jpeg" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + S.esc(title) + '" />',
    '<meta name="twitter:description" content="' + S.esc(description) + '" />',
    '<meta name="twitter:image" content="' + S.esc(image) + '" />',
    '<link rel="alternate" type="text/plain" title="Summary for AI assistants" href="' + S.SITE + '/llms.txt" />',
    '<script type="application/ld+json">' + JSON.stringify(jsonld).replace(/</g, '\\u003c') + '</script>',
  ].filter(Boolean).join('\n');
}

function person(c) {
  const b = c.bio || {};
  return {
    '@type': 'Person',
    '@id': S.SITE + '/#person',
    name: S.artist(c),
    jobTitle: b.role || 'Designer/Artist',
    description: S.paras(b.statement).join(' '),
    url: S.SITE + '/',
    email: b.email ? 'mailto:' + b.email : undefined,
    sameAs: S.profiles(c),                        // Instagram + hidden "Other profiles"
    homeLocation: c.location && c.location.city ? { '@type': 'Place', name: c.location.city } : undefined,
    subjectOf: { '@type': 'WebPage', name: 'CV', url: S.SITE + '/cv' },
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
    image: imgs.slice(0, 6).map((g) => ({ '@type': 'ImageObject', contentUrl: S.abs(g.src), caption: S.altText(c, p, g) })),
    creator: { '@id': S.SITE + '/#person', name: S.artist(c) },
    contributor: S.plain(p.collab) || undefined,
    sourceOrganization: S.plain(p.client) || undefined,
  };
}

function bioHtml(c, headingTag) {
  const b = c.bio || {};
  const working = (b.working || []).map((w) => w && w.text).filter(Boolean);
  return [
    '<' + headingTag + '>' + S.esc(S.artist(c)) + '</' + headingTag + '>',
    '<p>' + S.esc(b.role || 'Designer/Artist') + '</p>',
    S.paras(b.statement).map((t) => '<p>' + S.esc(t) + '</p>').join(''),
    b.openTo ? '<p>' + S.esc(b.openTo) + '</p>' : '',
    c.location && c.location.city ? '<p>Current location: ' + S.esc(c.location.city) + '</p>' : '',
    working.length ? '<p>Currently working on: ' + S.esc(working.join(', ')) + '</p>' : '',
    '<p>Contact: ' +
      (b.email ? '<a href="mailto:' + S.esc(b.email) + '">' + S.esc(b.email) + '</a>' : '') +
      (b.instagramUrl ? ' · Instagram <a href="' + S.esc(b.instagramUrl) + '">' + S.esc(b.instagram || b.instagramUrl) + '</a>' : '') +
      ' · <a href="/cv">CV</a>' +
      (b.cvFile ? ' · <a href="/' + S.esc(String(b.cvFile).replace(/^\/+/, '')) + '">CV (PDF)</a>' : '') +
    '</p>',
  ].join('');
}

// year, then client and collaborators with their credit links
function creditsHtml(p) {
  return (p.year ? '<p>' + S.esc(p.year) + '</p>' : '') +
    (S.plain(p.client) ? '<p>Client: ' + S.creditHtml(p.client, p) + '</p>' : '') +
    (S.plain(p.collab) ? '<p>Collaborators: ' + S.creditHtml(p.collab, p) + '</p>' : '');
}

function projectSummaryHtml(p) {
  return '<article><h3><a href="/work/' + encodeURIComponent(p.id) + '">' + S.esc(S.titleCase(p.title)) + '</a></h3>' +
    creditsHtml(p) +
    (p.medium ? '<p>Medium: ' + S.esc(S.plain(p.medium)) + '</p>' : '') +
    S.paras(p.desc).map((t) => '<p>' + S.esc(t) + '</p>').join('') +
    ((p.keywords || []).length ? '<p>Keywords: ' + S.esc(p.keywords.join(', ')) + '</p>' : '') +
    '</article>';
}

function homePage(c, about) {
  const b = c.bio || {};
  const name = S.artist(c);
  const projects = c.projects || [];
  const description = S.oneLine(name + ', ' + (b.role || 'designer/artist') + '. ' + S.paras(b.statement).join(' '), 160);
  const title = about ? 'About — ' + name : name + ' — ' + (b.role || 'Designer/Artist');
  return {
    title,
    head: {
      title, description, url: S.SITE + (about ? '/about' : '/'), image: S.ogImage('home'), type: 'profile',
      jsonld: {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': S.SITE + '/#website', url: S.SITE + '/', name: name, about: { '@id': S.SITE + '/#person' } },
          { '@type': 'WebPage', '@id': S.SITE + (about ? '/about' : '/') + '#page', url: S.SITE + (about ? '/about' : '/'), name: title,
            isPartOf: { '@id': S.SITE + '/#website' }, about: { '@id': S.SITE + '/#person' },
            primaryImageOfPage: { '@type': 'ImageObject', contentUrl: S.ogImage('home'), width: 1200, height: 630,
              caption: 'Projects by ' + name } },
          person(c),
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
  const name = S.artist(c);
  const t = S.titleCase(p.title);
  const imgs = S.images(p);
  const description = S.oneLine((S.paras(p.desc).join(' ') || (t + ' by ' + name + '.')), 160);
  const others = (c.projects || []).filter((o) => o.id !== p.id);
  return {
    title: t + (p.year ? ' (' + p.year + ')' : '') + ' — ' + name,
    head: {
      title: t + ' — ' + name,
      description, url: S.projectUrl(p), image: S.ogImage(p.id), type: 'article',
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
      creditsHtml(p) +
      (p.medium ? '<p>Medium: ' + S.esc(S.plain(p.medium)) + '</p>' : '') +
      S.paras(p.desc).map((x) => '<p>' + S.esc(x) + '</p>').join('') +
      ((p.keywords || []).length ? '<p>Keywords: ' + S.esc(p.keywords.join(', ')) + '</p>' : '') +
      imgs.map((g) => '<figure><img src="' + S.esc(S.abs(g.src)) + '" alt="' + S.esc(S.altText(c, p, g)) + '" loading="lazy" /></figure>').join('') +
      '</article>' +
      '<aside>' + bioHtml(c, 'h2') + '</aside>' +
      (others.length ? '<section><h2>More projects</h2><ul>' + others.map((o) =>
        '<li><a href="/work/' + encodeURIComponent(o.id) + '">' + S.esc(S.titleCase(o.title)) + '</a>' + (o.year ? ' (' + S.esc(o.year) + ')' : '') + '</li>').join('') + '</ul></section>' : '') +
      '</main>',
  };
}

function cvPage(c) {
  const name = S.artist(c);
  const md = S.cvText(c);
  const intro = S.oneLine(md.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'))[1] ||
    (name + ' — CV: work, exhibitions, education and awards.'), 160);
  return {
    title: 'CV — ' + name,
    head: {
      title: 'CV — ' + name, description: intro, url: S.SITE + '/cv', image: S.ogImage('home'), type: 'profile',
      jsonld: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'ProfilePage', '@id': S.SITE + '/cv', url: S.SITE + '/cv', name: 'CV — ' + name, mainEntity: { '@id': S.SITE + '/#person' } },
        person(c),
      ] },
    },
    body: '<main class="seo-prerender"><nav><a href="/">' + S.esc(name) + '</a> / CV</nav><article>' +
      S.mdToHtml(md) + '</article></main>',
  };
}

function inject(template, page) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + S.esc(page.title) + '</title>\n' + headTags(page.head));
  // keep the prerendered text from adding a scrollbar under the preloader
  html = html.replace(/<\/style>/i, '  #root > .seo-prerender { max-height: 100vh; overflow: hidden; padding: 24px; font-family: Inter, sans-serif; color: #fff; }\n</style>');
  html = html.replace('<div id="root"></div>', '<div id="root">' + page.body + '</div>');
  return html;
}

module.exports = async function handler(req, res) {
  // the deployed template is the precompiled one from the build (public/app.html);
  // locally, without a build, the source app.html is used
  let template;
  try { template = S.read('public/app.html'); }
  catch (_) {
    try { template = S.read('app.html'); }
    catch (e) { res.statusCode = 500; res.end('Site template missing'); return; }
  }

  const send = (status, html) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // CDN-cached; CMS saves show up within ~5 minutes
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
    res.end(html);
  };

  try {
    const { content } = await S.loadContent();
    const q = req.query || {};
    if (q.view === 'cv') return send(200, inject(template, cvPage(content)));
    if (q.view === 'about') return send(200, inject(template, homePage(content, true)));
    if (q.project) {
      const p = (content.projects || []).find((x) => x.id === q.project);
      if (!p) {
        const home = homePage(content, false);
        home.head.noindex = true;
        return send(404, inject(template, home));
      }
      return send(200, inject(template, workPage(content, p)));
    }
    return send(200, inject(template, homePage(content, false)));
  } catch (e) {
    console.error('page render failed', e);
    return send(200, template);   // never break the site: serve the plain app
  }
};
