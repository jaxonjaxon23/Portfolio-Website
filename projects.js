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

  // Small (640px) copy of an image for the projects page, where images show
  // ~250px wide: made at deploy (window.MEDIA_THUMBS from media-dims.js), or on
  // demand by api/thumb.js for images uploaded since. Falls back to the original.
  window.thumbFor = function (src) {
    if (!src) return src;
    var t = window.MEDIA_THUMBS && window.MEDIA_THUMBS[src];
    if (t) return t;
    if (/\.gif(\?|$)/i.test(src)) return src;                       // keep animation
    if (/^images\//i.test(src) || /\/storage\/v1\/object\/public\/images\//.test(src)) {
      return 'api/thumb?src=' + encodeURIComponent(src);
    }
    return src;
  };

  // Screen-size choices for a project-page image (an <img srcset>): the 1280 /
  // 1920px copies made at deploy (window.MEDIA_SIZES), or made on demand by
  // api/thumb for images uploaded since, plus the original. The browser picks
  // the smallest that is sharp on the visitor's screen. `w` = original width.
  window.srcsetFor = function (src, w) {
    if (!src || !(w > 0)) return undefined;
    var list = [];
    var made = window.MEDIA_SIZES && window.MEDIA_SIZES[src];
    if (made) made.forEach(function (s) { list.push(s[1] + ' ' + s[0] + 'w'); });
    else if (!/\.gif(\?|$)/i.test(src) &&
      (/^images\//i.test(src) || /\/storage\/v1\/object\/public\/images\//.test(src))) {
      [1280, 1920].forEach(function (n) {
        if (w > n * 1.15) list.push('api/thumb?w=' + n + '&src=' + encodeURIComponent(src) + ' ' + n + 'w');
      });
    }
    if (!list.length) return undefined;
    // the original is the largest choice — unless a copy is already full size
    // (an animated GIF swapped for an animated WebP): then never use the original
    if (!(made && made.some(function (m) { return m[0] >= w; })))
      list.push(src.replace(/ /g, '%20') + ' ' + w + 'w');   // spaces would split the list
    return list.join(', ');
  };

  // Lite mode for low-power machines: static background, 2 preview images per
  // column. On when the device reports little memory/CPU or data saver;
  // app.jsx also switches it on for a sustained low frame rate.
  // ?lite=1 / ?lite=0 force it on/off (remembered for this tab).
  window.LITE = (function () {
    try {
      var q = /[?&]lite=([01])/.exec(location.search);
      if (q) { sessionStorage.setItem('lite', q[1]); return q[1] === '1'; }
      var s = sessionStorage.getItem('lite');
      if (s === '0' || s === '1') return s === '1';
    } catch (_) {}
    var n = navigator, c = n.connection || {};
    return (n.deviceMemory > 0 && n.deviceMemory <= 4) ||
      (n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 2) || !!c.saveData;
  })();
  window.LITE_IMAGES = 2;   // preview images per column in lite mode
})();
