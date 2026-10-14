// api/llms.js — serves "/llms.txt": a plain-Markdown summary of the site for AI
// assistants (the llms.txt convention), generated from the live CMS content.

const S = require('./_site');

module.exports = async function handler(req, res) {
  const { content: c, updatedAt } = await S.loadContent();
  const b = c.bio || {};
  const name = b.name || 'Jaxon Stickler';
  const projects = c.projects || [];
  const working = (b.working || []).map((w) => w && w.text).filter(Boolean);

  const lines = [
    '# ' + name,
    '',
    '> ' + (b.role || 'Designer/Artist') + '. ' + S.paras(b.statement).join(' '),
    '',
    'Website: ' + S.SITE + '/',
    '',
    '## About',
    '',
    S.paras(b.statement).join('\n\n'),
    '',
    b.openTo || '',
    c.location && c.location.city ? '- Current location: ' + c.location.city : '',
    working.length ? '- Currently working on: ' + working.join(', ') : '',
    b.email ? '- Email: ' + b.email : '',
    b.instagramUrl ? '- Instagram: ' + (b.instagram ? b.instagram + ' (' + b.instagramUrl + ')' : b.instagramUrl) : '',
    b.cvFile ? '- CV (PDF): ' + S.abs(b.cvFile) : '',
    '',
    '## Projects',
    '',
  ];
  projects.forEach((p) => {
    const cr = S.credits(p);
    lines.push('### [' + S.titleCase(p.title) + '](' + S.projectUrl(p) + ')', '');
    if (cr.length) lines.push(cr.join(' · '), '');
    if (p.medium) lines.push('Medium: ' + S.plain(p.medium), '');
    S.paras(p.desc).forEach((t) => lines.push(t, ''));
    if ((p.keywords || []).length) lines.push('Keywords: ' + p.keywords.join(', '), '');
  });
  if (updatedAt) lines.push('---', '', 'Content last updated: ' + String(updatedAt).slice(0, 10));

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.end(lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n');
};
