// shared.js — text rules used by BOTH the site (browser) and the crawler pages
// (api/, Node), so the two can never drift apart: readable titles, image
// descriptions, safe links and client/collaborator credit links.
// Browser: window.SiteShared. Node: require('../shared.js').
(function (root) {
  'use strict';

  // Titles are stored in caps; readable case for page titles and descriptions.
  // Short acronyms (BC, USB, OSA) stay in caps; small words don't.
  var SMALL = /^(ME|MY|OF|THE|AND|TO|IN|ON|A|AN|OR|FOR|AT|BY|IS|IT)$/;
  function displayTitle(s) {
    if (!s || s !== s.toUpperCase()) return s || '';
    return s.replace(/[A-Z]+/g, function (w) {
      return (w.length <= 3 && !SMALL.test(w)) ? w : w[0] + w.slice(1).toLowerCase();
    });
  }

  // "[label](url)" → "label"
  function plain(s) { return String(s || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(); }

  // Image description: the CMS caption, else "<Project> by <name> — image N"
  function altText(projectTitle, artist, item, index) {
    if (item && item.alt) return item.alt;
    return displayTitle(projectTitle) + ' by ' + (artist || 'Jaxon Stickler') + ' — image ' + (index + 1);
  }

  // Only web, email and on-site links become clickable: a typed-in
  // "javascript:" (or similar) link would run code when clicked.
  function safeHref(u) {
    u = String(u || '').trim();
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^[\/#?]/.test(u) && !/^\/\//.test(u)) return u;          // /work/x, #id, ?q
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;               // any other scheme
    return /^[\w-]+(\.[\w-]+)+([\/?#].*)?$/.test(u) ? 'https://' + u : null;   // bare domain
  }

  // A credit link: "@handle" → Instagram, bare domain → https://
  function creditUrl(u) {
    u = String(u || '').trim();
    if (/^@[\w.]+$/.test(u)) return 'https://instagram.com/' + u.slice(1);
    return safeHref(/^https?:\/\//i.test(u) ? u : 'https://' + u);
  }

  var filled = function (l) { return l && l.name && String(l.name).trim() && l.url && String(l.url).trim(); };
  // The project's CMS "Credit links" plus the confirmed ones in credit-links.js
  // (the CMS wins for the same name; blank CMS rows don't block). Longest name
  // first, so "Soft Centre Studio" wins over "Soft Centre".
  function creditLinks(project, suggested) {
    var own = ((project && project.creditLinks) || []).filter(filled);
    var taken = {};
    own.forEach(function (l) { taken[String(l.name).trim().toLowerCase()] = true; });
    var extra = (((suggested || {})[project && project.id]) || [])
      .filter(function (l) { return filled(l) && !taken[String(l.name).trim().toLowerCase()]; });
    return own.concat(extra)
      .map(function (l) { return { name: String(l.name).trim(), url: creditUrl(l.url) }; })
      .filter(function (l) { return l.url; })
      .sort(function (a, b) { return b.name.length - a.name.length; });
  }

  // Split credit text into plain and linked parts: [text](url), credited names,
  // and @handles. → [{ text, href? }]
  function creditParts(text, links) {
    text = String(text || '').trim();
    var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var names = (links || []).map(function (l) { return esc(l.name); });
    var re = new RegExp('\\[([^\\]]+)\\]\\(([^)]+)\\)' +
      '|(' + (names.length ? names.join('|') : '(?!)') + ')' +            // group 3 = a credited name
      '|(@[A-Za-z0-9._]*[A-Za-z0-9_])', 'gi');
    var out = [], last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      var label = m[0], href = null;
      if (m[1]) { label = m[1]; href = creditUrl(m[2]); }
      else if (m[3]) {
        var hit = (links || []).filter(function (l) { return l.name.toLowerCase() === m[3].toLowerCase(); })[0];
        href = hit ? hit.url : null;
      } else href = creditUrl(m[0]);
      out.push(href ? { text: label, href: href } : { text: label });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }

  // Description text: [label](url) links (safe ones only) → [{ text, href? }]
  function richParts(text) {
    text = String(text || '');
    var re = /\[([^\]]+)\]\(([^)]+)\)/g, out = [], last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      var href = safeHref(m[2]);
      out.push(href ? { text: m[1], href: href } : { text: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  }

  var api = { displayTitle: displayTitle, plain: plain, altText: altText, safeHref: safeHref,
    creditUrl: creditUrl, creditLinks: creditLinks, creditParts: creditParts, richParts: richParts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteShared = api;
})(this);
