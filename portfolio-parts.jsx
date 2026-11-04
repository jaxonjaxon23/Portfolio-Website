// portfolio-parts.jsx — shared pieces for the Jaxon Stickler site.
// Exposes on window: FONT, GalleryItem, DepthBackground, CustomCursor,
//                    LocationSignifier, BioAbout, BioShort, Footer

const { useState: usePState, useEffect: usePEffect, useRef: usePRef } = React;

// Mobile detection hook — shared globally (other files use window.useMobile)
function useMobile() {
  const [m, setM] = usePState(() => window.innerWidth < 768);
  usePEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ---------------------------------------------------------------- page addresses
// Real URLs so every page can be linked to and indexed: "/" (projects index),
// "/about", "/work/<id>". Old "/#<id>" links are converted on load.
function viewFromLocation() {
  const legacy = location.hash.slice(1);
  if (legacy) return decodeURIComponent(legacy);
  const p = location.pathname.replace(/\/+$/, '');
  if (p === '/about') return 'about';
  const m = /^\/work\/([^/]+)$/.exec(p);
  return m ? decodeURIComponent(m[1]) : 'index';
}
function pathForView(v) {
  return v === 'index' ? '/' : v === 'about' ? '/about' : '/work/' + encodeURIComponent(v);
}
function navigate(v) {
  const path = pathForView(v);
  if (location.pathname + location.hash !== path) history.pushState(null, '', path);
  window.dispatchEvent(new Event('viewchange'));
}
if (location.hash.length > 1) {
  try { history.replaceState(null, '', pathForView(viewFromLocation())); } catch (_) {}
}

// Readable titles (stored in caps) — shared with the crawler pages (shared.js)
const displayTitle = window.SiteShared.displayTitle;
function artistName() {
  return (window.SITE_CONTENT && window.SITE_CONTENT.bio && window.SITE_CONTENT.bio.name) || 'Jaxon Stickler';
}

// Image description (alt text): the CMS caption, else
// "<Project> by <name> — image N" (N = position in the project's gallery).
const defaultAlts = new WeakMap();
function altFor(item) {
  if (!item) return '';
  if (item.alt) return item.alt;
  if (!defaultAlts.has(item)) {
    (window.PROJECTS || []).forEach((p) => (p.gallery || []).forEach((g, i) => {
      if (g && typeof g === 'object') defaultAlts.set(g, window.SiteShared.altText(p.title, artistName(), g, i));
    }));
  }
  return defaultAlts.get(item) || '';
}

// A real link to a page of the site (/, /about, /work/<id>): opens in a new
// tab with Ctrl/Cmd/middle-click, can be copied, and crawlers can follow it.
// A plain click switches the view in place without reloading the page.
const ViewLink = React.forwardRef(function ViewLink({ to, children, style, ...rest }, ref) {
  const onClick = (e) => {
    if (rest.onClick) rest.onClick(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a {...rest} ref={ref} href={pathForView(to)} onClick={onClick} draggable="false" data-clickable=""
    style={{ color: 'inherit', textDecoration: 'none', ...style }}>{children}</a>;
});

// BluuNext (Velvetyne, OFL) — name + project titles. Files in assets/fonts/bluunext.
const DISPLAY_FONT = "'BluuNext', Georgia, serif";

// Wheel delta in pixels. Some browsers/mice (notably Firefox) report deltaY in
// lines (deltaMode 1) or pages (2), e.g. 3 per notch, which would otherwise
// move an eased scroller only a few pixels per notch.
function wheelPx(delta, deltaMode, pageSize) {
  if (deltaMode === 1) return delta * 40;          // Firefox: lines
  if (deltaMode === 2) return delta * pageSize;    // pages
  return delta;
}

// ---------------------------------------------------------------- smooth scrolling
// One eased scroll engine for every browser (Chrome, Safari, Firefox, Edge):
// wheel input moves a target; each animation frame moves the real scroll
// position a fraction of the way there. Frame-rate independent, so it feels
// the same on 60 Hz and 120 Hz screens. Built-in smooth scrolling differs per
// browser and restarts its animation on every wheel notch (felt as judder).
// get/set read and write the scroll position (board: scrollLeft, page: scrollY).
const SCROLL_EASE = 0.075;   // fraction per 60 fps frame: ~0.6 s glide; higher = snappier
function createSmoothScroller(get, set, max) {
  let pos = get(), target = pos, raf = 0, lastT = 0, writing = false;
  const frame = (t) => {
    const dt = lastT ? Math.min(64, t - lastT) : 16.667;
    lastT = t;
    pos += (target - pos) * (1 - Math.pow(1 - SCROLL_EASE, dt / 16.667));
    if (Math.abs(target - pos) < 0.4) pos = target;
    writing = true; set(pos); writing = false;
    if (pos !== target) raf = requestAnimationFrame(frame);
    else { raf = 0; lastT = 0; }
  };
  return {
    by(delta) {
      if (!raf) pos = target = get();             // start from wherever the page is
      target = Math.max(0, Math.min(max(), target + delta));
      if (!raf && target !== pos) raf = requestAnimationFrame(frame);
    },
    // something else moved it (scrollbar, keys, drag, touch): follow, don't fight
    sync() { if (!writing && raf && Math.abs(get() - pos) > 2) { cancelAnimationFrame(raf); raf = 0; lastT = 0; pos = target = get(); } },
    stop() { cancelAnimationFrame(raf); raf = 0; lastT = 0; pos = target = get(); },
  };
}

const DEPTH_BG = 'images/about/depth-bg.png';

// ---------------------------------------------------------------- gallery item
// Shapes of videos seen so far, so a placeholder can keep a video's size.
const videoShapes = new Map();


// Desktop browsers (Edge especially) drop the WHOLE page to the video's ~30fps
// while a <video> plays in it, so scrolling and the background light lose every
// other frame. Instead each video plays off-page and its frames are painted onto
// a canvas, which keeps the page at the full display rate (measured in Edge:
// 0 slow frames vs ~1 in 2). Touch devices keep a plain <video>: iOS is strict
// about off-page playback. ?canvasvideo=0 / =1 forces it off / on for testing.
const CANVAS_VIDEO = (() => {
  try {
    const q = /[?&]canvasvideo=([01])/.exec(location.search);
    if (q) return q[1] === '1';
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return !iOS && window.matchMedia('(pointer: fine)').matches && !!document.createElement('canvas').getContext;
  } catch (_) { return false; }
})();

function CanvasVideo({ item, radius }) {
  const ref = usePRef(null);
  const d = dimsFor(item) || videoShapes.get(item.src);
  usePEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const v = document.createElement('video');   // never added to the page
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';   // full download once near (see warm below)
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = item.src;
    const hasRVFC = 'requestVideoFrameCallback' in v;
    let alive = true, inView = false, cb = 0, raf = 0, lastT = -1;
    const paint = () => { if (v.readyState >= 2 && c.width) ctx.drawImage(v, 0, 0, c.width, c.height); };
    // canvas pixels = its on-screen size (max 2x), never more than the video has
    const size = () => {
      const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
      const k = Math.min(window.devicePixelRatio || 1, 2);
      let W = Math.round(w * k), H = Math.round(h * k);
      if (v.videoWidth && W > v.videoWidth) { H = Math.round(H * v.videoWidth / W); W = v.videoWidth; }
      if (W !== c.width || H !== c.height) { c.width = W; c.height = H; paint(); }
    };
    // paint each new video frame: requestVideoFrameCallback where supported,
    // otherwise a frame loop that only draws when the video has moved on
    const onFrame = () => { cb = 0; paint(); if (alive) cb = v.requestVideoFrameCallback(onFrame); };
    const tick = () => { raf = 0; if (v.currentTime !== lastT) { lastT = v.currentTime; paint(); } if (alive && !v.paused) raf = requestAnimationFrame(tick); };
    if (hasRVFC) cb = v.requestVideoFrameCallback(onFrame);
    const start = () => {
      if (!alive || !inView || document.hidden) return;
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      if (!hasRVFC && !raf) raf = requestAnimationFrame(tick);
    };
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth) {
        videoShapes.set(item.src, [v.videoWidth, v.videoHeight]);
        if (!dimsFor(item)) c.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
      }
      size();
    });
    v.addEventListener('loadeddata', paint);
    v.addEventListener('playing', () => { if (!hasRVFC && !raf) raf = requestAnimationFrame(tick); });
    // play only while on (or near) the screen and the tab is visible
    const io = new IntersectionObserver((es) => es.forEach((e) => { inView = e.isIntersecting; if (inView) start(); else v.pause(); }), { rootMargin: '150px' });
    io.observe(c);
    // within about a screen: start buffering, so it's ready when it arrives
    const warm = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) v.preload = 'auto';   // browsers pick this up without a reload
    }), { rootMargin: '100%' });
    warm.observe(c);
    const ro = new ResizeObserver(size); ro.observe(c);
    const onVis = () => { if (document.hidden) v.pause(); else start(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false; io.disconnect(); warm.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      if (cb && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(cb);
      cancelAnimationFrame(raf);
      v.pause(); v.removeAttribute('src'); v.load();   // release the decoder
    };
  }, [item.src]);
  return <canvas ref={ref} role="img" aria-label={altFor(item)} data-video=""
    style={{ display: 'block', width: '100%', height: 'auto', borderRadius: radius,
      aspectRatio: d ? d[0] + ' / ' + d[1] : '4 / 5', background: 'rgba(255,255,255,0.04)' }} />;
}

function GalleryItem({ item, rounded, eager, preload, thumb, placeholder }) {
  const radius = rounded ? 4 : 0;
  if (placeholder && (item.type === 'image' || item.type === 'video')) {
    // column far off-screen: keep the space, drop the pixels (frees memory)
    const d = dimsFor(item) || videoShapes.get(item.src) || [4, 5];
    return <div aria-hidden="true" style={{ width: '100%', aspectRatio: d[0] + ' / ' + d[1], borderRadius: radius, background: 'rgba(255,255,255,0.04)' }} />;
  }
  if (item.type === 'video' && CANVAS_VIDEO) return <CanvasVideo item={item} radius={radius} />;
  if (item.type === 'video') {
    return (
      <video src={item.src} aria-label={altFor(item)} autoPlay loop muted playsInline preload="metadata"
      ref={(el) => {
        if (!el) return;
        el.defaultMuted = true; el.muted = true; el.volume = 0;
        if (el.__visObs) return;
        // pause when off screen — decoding hidden loops is pure waste
        el.__visObs = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            el.__inView = en.isIntersecting;
            if (en.isIntersecting) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
            else el.pause();
          });
        }, { rootMargin: '150px' });
        el.__visObs.observe(el);
      }}
      onVolumeChange={(e) => { const el = e.currentTarget; if (!el.muted || el.volume !== 0) { el.muted = true; el.volume = 0; } }}
      onLoadedMetadata={(e) => {
        const el = e.currentTarget; el.muted = true; el.volume = 0;
        if (el.videoWidth) videoShapes.set(item.src, [el.videoWidth, el.videoHeight]);
      }}
      style={{ display: 'block', width: '100%', height: 'auto', borderRadius: radius,
        aspectRatio: (() => { const d = dimsFor(item) || videoShapes.get(item.src); return d ? d[0] + ' / ' + d[1] : undefined; })() }}></video>);

  }
  if (item.type === 'vimeo') {
    const vimeoSrc = item.src + (item.src.includes('?') ? '&muted=1' : '?muted=1');
    return (
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: radius, overflow: 'hidden' }}>
        <iframe src={vimeoSrc}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; fullscreen; picture-in-picture" allowFullScreen></iframe>
      </div>);

  }
  if (item.type === 'youtube') {
    const ytSrc = item.src + (item.src.includes('?') ? '&' : '?') + 'rel=0';
    return (
      <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000', borderRadius: radius, overflow: 'hidden' }}>
        <iframe src={ytSrc}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen></iframe>
      </div>);
  }
  return <FadeImage item={item} radius={radius} eager={eager} preload={preload} thumb={thumb} />;
}

// Images that have loaded once this visit: shown instantly when they mount
// again (a column scrolled back into range), instead of fading in a second time.
const loadedSrcs = new Set();

// Known pixel size of an image: saved by the CMS on upload (item.dims), or
// measured at deploy time for existing images (window.MEDIA_DIMS, from the build).
function dimsFor(item) {
  const d = (item && item.dims) || (window.MEDIA_DIMS && item && window.MEDIA_DIMS[item.src]);
  return d && d[0] > 0 && d[1] > 0 ? d : null;
}

// Image that reserves its final shape (no layout jump) and fades in once it has
// loaded and decoded, instead of popping in. Cached images show immediately.
// How wide a project-page image shows: phones ~full width; desktop up to the
// 1180px gallery beside the 408px info column.
const GALLERY_SIZES = '(max-width: 767px) calc(100vw - 32px), min(1180px, calc(100vw - 432px))';
function FadeImage({ item, radius, eager, preload, thumb }) {
  const src = thumb && window.thumbFor ? window.thumbFor(item.src) : item.src;
  const [shown, setShown] = usePState(() => loadedSrcs.has(src));
  const dims = dimsFor(item);
  const reveal = (el) => {
    if (!el || shown) return;
    const done = () => { loadedSrcs.add(src); setShown(true); };
    if (el.decode) el.decode().then(done, done);
    else done();
  };
  return (
    // project pages: let the browser pick a 1280 / 1920px copy when that's sharp
    // enough. sizes + srcSet must come BEFORE src: React sets attributes in this
    // order, and an <img> starts downloading the moment it gets a src.
    <img sizes={!thumb && dims ? GALLERY_SIZES : undefined}
    srcSet={!thumb && dims && window.srcsetFor ? window.srcsetFor(item.src, dims[0]) : undefined}
    src={src} alt={altFor(item)} draggable="false"
    // eager: first screen (high priority); preload: columns about to scroll into view
    loading={eager || preload ? 'eager' : 'lazy'} decoding="async" fetchpriority={eager ? 'high' : undefined}
    width={dims ? dims[0] : undefined} height={dims ? dims[1] : undefined}
    ref={(el) => { if (el && el.complete && el.naturalWidth) reveal(el); }}
    onLoad={(e) => reveal(e.currentTarget)}
    onError={() => setShown(true)}
    style={{
      display: 'block', width: '100%', height: 'auto', borderRadius: radius,
      aspectRatio: dims ? dims[0] + ' / ' + dims[1] : undefined,
      background: shown ? 'transparent' : 'rgba(255,255,255,0.04)',
      opacity: shown ? 1 : 0, transition: 'opacity .45s ease',
    }} />);
}

// ---------------------------------------------------------- depth cloud bg
// Mounts the WebGL2 cursor-lit point cloud (depth-cloud.js) behind everything.
function DepthCloud() {
  const ref = usePRef(null);
  usePEffect(() => {
    if (!ref.current || !window.initDepthCloud) return;
    const cleanup = window.initDepthCloud(ref.current);
    return cleanup;
  }, []);
  return (
    <canvas ref={ref} style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      display: 'block', zIndex: -1, pointerEvents: 'none', background: 'var(--bg-color, #000)'
    }} />);

}

// ---------------------------------------------------------------- custom cursor (+)
// The "+" is a real (hardware) cursor image rather than a div chasing
// mousemove. A div can only move when the page paints a frame, so it always
// trailed the pointer, and badly whenever frames were slow (e.g. laptops on
// battery capped at 30fps). The OS draws this one, so it never lags.
// A faint dark halo keeps it visible over light images now that the old
// mix-blend "difference" trick isn't available to a cursor image.
const plusCursor = (arm, opacity) => {
  const d = `M${8 - arm} 8h${arm * 2}M8 ${8 - arm}v${arm * 2}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>` +
    `<path d='${d}' stroke='#000' stroke-opacity='.3' stroke-width='3.5'/>` +
    `<path d='${d}' stroke='#fff' stroke-opacity='${opacity}' stroke-width='1.5'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8`;
};
const CURSOR_CSS =
  `* { cursor: ${plusCursor(8, 0.8)}, crosshair !important; }\n` +
  // links/buttons: the smaller, brighter "+" (was the scale(0.5) hover state)
  `a, a *, button, button *, [data-clickable], [data-clickable] * { cursor: ${plusCursor(4, 1)}, pointer !important; }`;

function CustomCursor({ enabled = true }) {
  usePEffect(() => {
    // touch devices have no pointer to show
    if (!enabled || window.matchMedia('(hover: none)').matches) return;
    const styleEl = document.createElement('style');
    styleEl.textContent = CURSOR_CSS;
    document.head.appendChild(styleEl);
    return () => styleEl.remove();
  }, [enabled]);
  return null;
}

// ---------------------------------------------- live "current location" signifier
// style: 'pulse' | 'clock' | 'both'
function LocationSignifier({ style = 'both', city, tz }) {
  const loc = (window.SITE_CONTENT && window.SITE_CONTENT.location) || {};
  city = city || loc.city || 'Berlin';
  tz = tz || loc.tz || 'Europe/Berlin';
  const [now, setNow] = usePState('');
  usePEffect(() => {
    if (style === 'pulse') return;
    const fmt = () => {
      try {
        return new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZone: tz
        }).format(new Date());
      } catch (_) {return '';}
    };
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, [style, tz]);

  const dot =
  <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7, marginRight: 7, verticalAlign: 'middle' }}>
      <span style={{
      position: 'absolute', inset: 0, borderRadius: '50%', background: '#7CFFB2',
      animation: 'locPulseRing 2s ease-out infinite'
    }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#7CFFB2' }} />
    </span>;


  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      {(style === 'pulse' || style === 'both') && dot}
      <span>Current Location: {city}</span>
      {(style === 'clock' || style === 'both') && now &&
      <span style={{ opacity: 0.6, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{now}</span>
      }
    </span>);

}

// ---------------------------------------------------------------- bio bubbles
const BUBBLE = {
  background: 'rgba(0,0,0,var(--bubble-op,1))', borderRadius: 15, color: '#fff',
  fontSize: 12, lineHeight: 1.5, fontFamily: FONT
};

// Top-of-bubble nav: About / state-glyph / Index. The middle glyph is a "+"
// normally and a "○" while a project is open. Self-contained — navigates itself
// so it can be dropped into any bubble without prop threading.
function BubbleNav() {
  const cur = viewFromLocation();
  const isProject = cur && cur !== 'index' && cur !== 'about';
  const mobile = window.innerWidth < 768;
  const graphic = window.__navGraphic;
  const btn = (active) => ({
    fontFamily: FONT, color: '#fff', fontSize: 12, letterSpacing: '0.02em',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontWeight: 700, opacity: active ? 1 : 0.5,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, minHeight: 18 }}>
      {!mobile
        ? <ViewLink to="about" style={btn(cur === 'about')} aria-current={cur === 'about' ? 'page' : undefined}>About</ViewLink>
        : <span style={{ width: 1 }} />}
      <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18 }}>
        {graphic
          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V13"/><path d="M12 13c0-5-6-8-10-7 0 5 4 8 10 7"/><path d="M12 13c0-5 6-8 10-7 0 5-4 8-10 7"/></svg>
          : <span style={{ fontSize: 15, lineHeight: 1, fontWeight: 400 }}>+</span>}
      </span>
      <ViewLink to="index" style={btn(cur === 'index')} aria-current={cur === 'index' ? 'page' : undefined}>Projects</ViewLink>
    </div>
  );
}

// Image that follows the cursor while a "working on" item is hovered. It tracks
// the mouse itself (writing styles directly) and only exists while hovering, so
// the bio no longer re-renders on every mouse move anywhere on the page.
function CursorPreview({ img, x, y }) {
  const ref = usePRef(null);
  const left = (cx) => Math.min(cx + 24, window.innerWidth - 202) + 'px';
  const top = (cy) => Math.max(16, cy - 50) + 'px';
  usePEffect(() => {
    const onMove = (e) => {
      const el = ref.current;
      if (!el) return;
      el.style.left = left(e.clientX);
      el.style.top = top(e.clientY);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return ReactDOM.createPortal(
    <div ref={ref} style={{
      position: 'fixed',
      left: left(x),
      top: top(y),
      width: 186,
      pointerEvents: 'none',
      zIndex: 9997,
      boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
      borderRadius: 3,
      overflow: 'hidden',
    }}>
      <img src={window.thumbFor ? window.thumbFor(img) : img} alt="" draggable="false" style={{ width: '100%', display: 'block' }} />
    </div>,
    document.body
  );
}

const BioAbout = React.forwardRef(function BioAbout({ locationStyle, mobile = false }, ref) {
  const italic = { opacity: 0.92 };
  const [wip1, setWip1] = usePState(false);
  const [wip2, setWip2] = usePState(false);
  const bio = (window.SITE_CONTENT && window.SITE_CONTENT.bio) || {};
  const working = Array.isArray(bio.working) ? bio.working : [];
  const [hov, setHov] = usePState(null); // { i, x, y } while a "working on" item with an image is hovered
  const cvFile = bio.cvFile || 'assets/Jaxon_Stickler_CV.pdf';   // the CMS can point this at a new file
  return (
    <div ref={ref} id={mobile ? undefined : 'about-bubble'} style={mobile ? {
      ...BUBBLE, position: 'relative', width: '100%', boxSizing: 'border-box',
      padding: '22px 24px', zIndex: 1, borderRadius: 0,
    } : {
      ...BUBBLE, position: 'fixed', left: 24, top: 19, width: 345,
      maxHeight: 'calc(100vh - 38px)', overflowY: 'auto',
      padding: '22px 24px', zIndex: 25,
    }}>
      <BubbleNav />
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 'var(--name-size, 12px)', lineHeight: 1.1, letterSpacing: 'var(--name-track, 0)' }}>{bio.name || 'Jaxon Stickler'}</div>
      <div style={{ ...italic, marginBottom: 16 }}>{bio.role || 'Designer/Artist'}</div>

      <div style={{ ...italic, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{bio.statement || ''}</div>
      {bio.openTo &&
      <div style={{ ...italic, marginBottom: 18 }}>{bio.openTo}</div>
      }

      <div style={{ marginBottom: 18 }}>
        <LocationSignifier style={locationStyle} />
      </div>

      {working.length > 0 &&
      <div style={{ ...italic, marginBottom: 10 }}>Working on:</div>
      }
      {working.map((w, i) =>
      <div key={i}
        style={{ ...italic, fontWeight: 600, marginBottom: 12 }}
        onMouseEnter={(e) => setHov(w.img ? { i, x: e.clientX, y: e.clientY } : null)}
        onMouseLeave={() => setHov(null)}>
        {w.text}
      </div>
      )}
      <div style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V13"/><path d="M12 13c0-5-6-8-10-7 0 5 4 8 10 7"/><path d="M12 13c0-5 6-8 10-7 0 5-4 8-10 7"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 3a9 9 0 1 0 9 9 6.5 6.5 0 1 1-6.5-6.5 4 4 0 1 0 4 4 2 2 0 1 1-2-2"/></svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </div>

      <div>Contact:</div>
      <div>Email: <a href={'mailto:' + (bio.email || 'jaxonstickler@gmail.com')} data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.email || 'jaxonstickler@gmail.com'}</a></div>
      <div style={{ marginBottom: 22 }}>Instagram: <a href={bio.instagramUrl || 'https://instagram.com/jaxonstickler'} target="_blank" rel="noopener" data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.instagram || '@jaxonstickler'}</a></div>

      <a href={cvFile} download="Jaxon_Stickler_CV.pdf" target="_blank" rel="noopener" data-clickable onClick={(e) => {
        // Try a real download via blob (works on hosted http/https). If the
        // environment blocks it (sandboxed preview iframe), fall back to
        // opening the PDF in a new tab so the visitor can still save it.
        // If even that is blocked, let the native href/download proceed.
        var canPop = false;
        try {
          fetch(cvFile).then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.blob();
          }).then(function (b) {
            var url = URL.createObjectURL(b);
            var a = document.createElement('a');
            a.href = url; a.download = 'Jaxon_Stickler_CV.pdf';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          }).catch(function () {
            try { window.open(cvFile, '_blank', 'noopener'); }
            catch (_) {}
          });
          e.preventDefault();
        } catch (_) {
          // leave default anchor behaviour
        }
      }} style={{
        color: 'rgba(255,255,255,0.75)', textDecoration: 'underline',
        textUnderlineOffset: 3, fontSize: 12, cursor: 'pointer'
      }}>Download CV</a>

      {hov && working[hov.i] && working[hov.i].img &&
      <CursorPreview img={working[hov.i].img} x={hov.x} y={hov.y} />
      }
    </div>);

});

function BioShort({ locationStyle, top = 19, mobile = false, contact = true }) {
  const bio = (window.SITE_CONTENT && window.SITE_CONTENT.bio) || {};
  return (
    <div id={mobile ? undefined : 'about-bubble'} style={mobile ? {
      ...BUBBLE, position: 'relative', width: '100%', boxSizing: 'border-box',
      padding: '22px 24px', zIndex: 1, borderRadius: 0,
    } : {
      ...BUBBLE, position: 'fixed', left: 24, top, width: 345,
      padding: '22px 24px', zIndex: 25,
    }}>
      <BubbleNav />
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 'var(--name-size, 12px)', lineHeight: 1.1, letterSpacing: 'var(--name-track, 0)' }}>{bio.name || 'Jaxon Stickler'}</div>
      <div>{bio.role || 'Designer/Artist'}</div>
      <div style={{ height: 16 }} />
      <div><LocationSignifier style={locationStyle} /></div>
      {contact && <React.Fragment>
        <div style={{ height: 16 }} />
        <div>Contact:</div>
        <div>Email: <a href={'mailto:' + (bio.email || 'jaxonstickler@gmail.com')} data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.email || 'jaxonstickler@gmail.com'}</a></div>
        <div>Instagram: <a href={bio.instagramUrl || 'https://instagram.com/jaxonstickler'} target="_blank" rel="noopener" data-clickable style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>{bio.instagram || '@jaxonstickler'}</a></div>
      </React.Fragment>}
    </div>);

}

// ---------------------------------------------------------------- footer / nav
// navPosition: 'bottom-left' | 'top-right' | 'top-center'
function Footer({ left, navPosition = 'bottom-left' }) {
  const base = { fontFamily: FONT, color: '#fff', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', padding: 0, letterSpacing: '0.02em' };
  const posStyle = navPosition === 'top-right' ?
  { position: 'fixed', right: 32, top: 22, zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 } :
  navPosition === 'top-center' ?
  { position: 'fixed', left: '50%', top: 22, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 } :
  { position: 'fixed', left: 43, bottom: 26, zIndex: 40, display: 'flex', alignItems: 'baseline', gap: 32 };
  const copyrightStyle = navPosition !== 'bottom-left' ?
  { position: 'fixed', left: 43, bottom: 26, zIndex: 40 } :
  null;
  return (
    <React.Fragment>
      <div style={posStyle}>
        {left.map((l, i) =>
        <button key={i} data-clickable onClick={l.onClick} style={base}>{l.label}</button>
        )}
        {navPosition === 'bottom-left' &&
        <span style={{ ...base, cursor: 'default', opacity: 0.85, marginLeft: left.length ? 60 : 0 }}>Jaxon Stickler 2026©</span>
        }
      </div>
      {navPosition !== 'bottom-left' &&
      <div style={{ ...copyrightStyle }}>
          <span style={{ ...base, cursor: 'default', opacity: 0.85 }}>Jaxon Stickler 2026©</span>
        </div>
      }
    </React.Fragment>);

}

// A plain div that inlines an entity SVG (no iframe — see entity-inline.js).
function EntityCanvas({ url, style }) {
  const ref = usePRef(null);
  usePEffect(() => {
    if (ref.current && window.mountEntity) window.mountEntity(ref.current, url);
  }, [url]);
  return <div ref={ref} aria-hidden="true" style={style} />;
}

// ---------------------------------------------------------------- vector entities
// Animated "living edges" entity — persistent overlay across every view.
function AnimatedEntity() {
  const isMob = useMobile();
  if (isMob) return null;
  return (
    <EntityCanvas url="entities/vector-entity-1.html"
    style={{
      position: 'fixed',
      left: 'calc(197px + var(--se-dx, 0px))',
      top: 'calc(-133px + var(--se-dy, 0px))',
      width: 331, height: 468,
      zIndex: 30, pointerEvents: 'none'
    }} />);

}

// Large entity — About page only: the animated overlay (living tendrils),
// flipped 180° and sitting in FRONT of the info bubble (z 28 > bubble z 25).
// Anchored to the floating info bubble (fixed at left:24, top:19, width:345),
// not the viewport, so it hugs the UI identically on every screen size. Its
// offset { dx, dy } from the bubble's corner is set in the CMS ("Entity
// position"); the Tweaks sliders add a further nudge through CSS variables.
const BUBBLE_ANCHOR = { left: 24, top: 19 };
const LARGE_ENTITY_DEFAULT = { dx: -64, dy: 106 };

function LargeEntity() {
  const isMob = useMobile();
  if (isMob) return null;
  const e = window.SITE_CONTENT && window.SITE_CONTENT.entityPos;
  const pos = e && typeof e.dx === 'number' && typeof e.dy === 'number' ? e : LARGE_ENTITY_DEFAULT;
  return (
    <div style={{
      position: 'fixed',
      left: 'calc(' + (BUBBLE_ANCHOR.left + pos.dx) + 'px + var(--le-dx, 0px))',
      top: 'calc(' + (BUBBLE_ANCHOR.top + pos.dy) + 'px + var(--le-dy, 0px))',
      width: 560, height: 792,
      transform: 'rotate(180deg)', transformOrigin: 'center',
      zIndex: 28, pointerEvents: 'none', opacity: 0.8,
    }}>
      <EntityCanvas url="entities/vector-entity-2.html"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
    </div>);

}

// Memoize the persistent, prop-stable pieces so hovering a diagram node (which
// updates state up in App) doesn't reconcile the WebGL canvas or the animation
// iframe every time — keeps interaction snappy on low-end machines.
const DepthCloudMemo = React.memo(DepthCloud);
const AnimatedEntityMemo = React.memo(AnimatedEntity);
const LargeEntityMemo = React.memo(LargeEntity);
const BioAboutMemo = React.memo(BioAbout);

// Mobile-only entity anchors: small badges pinned to a bubble's corner,
// non-interactive, so the vector entities show up on phones without needing
// the desktop drag/viewport-fixed positioning.
// Mobile-only entity anchors: absolutely positioned inside the bubble's own
// wrapper (so they scroll away together with it), using the SAME relative
// offset from the bubble's corner that the desktop version uses relative to
// its fixed bubble (left:24 top:19 width:345 desktop bubble) \u2014 scaled to the
// narrower 300px mobile bubble. Full/near-desktop entity size; they clip at
// the screen edge, which is expected.
function MobileEntityAnchor({ which }) {
  if (which === 'small') {
    // desktop: entity left 197,top -133 vs bubble left24,top19,w345
    //   => dx=+173 (~50% of bubble width), dy=-152 (above bubble top)
    return (
      <EntityCanvas url="entities/vector-entity-1.html"
      style={{
        position: 'absolute', left: 150, top: -152, width: 331, height: 468,
        pointerEvents: 'none', zIndex: 6,
      }} />);
  }
  // Mobile phone viewports are often barely taller than the bubble itself, so
  // there's little/no guaranteed empty space below it to hang the entity into
  // (unlike desktop's tall viewport). Overlap the bubble's own lower portion
  // instead, so it's reliably visible, while still extending past the bottom.
  return (
    <EntityCanvas url="entities/vector-entity-2.html"
    style={{
      position: 'absolute', left: -180, top: 'calc(100% - 510px)', width: 560, height: 792,
      transform: 'rotate(180deg)', transformOrigin: 'center',
      pointerEvents: 'none', opacity: 0.8, zIndex: 6,
    }} />);

}

Object.assign(window, {
  FONT, useMobile, GalleryItem, CustomCursor, LocationSignifier, BioShort, Footer, MobileEntityAnchor, ViewLink,
  DepthCloud: DepthCloudMemo,
  AnimatedEntity: AnimatedEntityMemo,
  LargeEntity: LargeEntityMemo,
  BioAbout: BioAboutMemo
});