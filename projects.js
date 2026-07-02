// Project data adapter.
// The single source of truth is window.SITE_CONTENT (content.js), edited via
// admin.html. This file turns that data into window.PROJECTS (the shape the
// site components expect) and keeps the placeholder helper.

(function () {
  function makePlaceholder(label, w, h) {
    const W = Math.round(w), H = Math.round(h);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<defs><pattern id="s" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="9" height="9" fill="#15161a"/>` +
      `<line x1="0" y1="0" x2="0" y2="9" stroke="#ffffff" stroke-opacity="0.045" stroke-width="3"/>` +
      `</pattern></defs>` +
      `<rect width="100%" height="100%" fill="#15161a"/>` +
      `<rect width="100%" height="100%" fill="url(#s)"/>` +
      `<rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>` +
      `<text x="50%" y="50%" fill="#ffffff" fill-opacity="0.34" font-family="ui-monospace,Menlo,monospace" ` +
      `font-size="11" letter-spacing="1.5" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
      `</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  const SC = window.SITE_CONTENT || {};
  window.PROJECTS = Array.isArray(SC.projects) ? SC.projects : [];
  window.makePlaceholder = makePlaceholder;
})();
