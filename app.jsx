// app.jsx — Jaxon Stickler portfolio shell.
// Views: about (landing + diagram) · index (horizontal grid) · project

const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "locationStyle": "both",
  "indexCardMode": "title",
  "imageLimit": 6,
  "navPosition": "bottom-left",
  "bubbleOpacity": 1,
  "bubbleNavGraphic": false,
  "bgDarkness": 100,
  "nameSize": "medium",
  "entityX": -92,
  "entityY": -106,
  "smallEntityX": 0,
  "smallEntityY": -26
} /*EDITMODE-END*/;

// hover readout for the diagram — positioned dynamically below the bio panel
function KeepAlive({ active, children }) {
  // Keeps a subtree mounted (images/iframes stay loaded) but visually removed
  // when inactive — so switching pages never re-downloads or re-renders it.
  return <div style={{ display: active ? 'contents' : 'none' }}>{children}</div>;
}

function DiagramReadout({ p, top }) {
  return (
    <div style={{
      position: 'fixed', left: 43, top: top, width: 300, zIndex: 26, pointerEvents: 'none',
      fontFamily: FONT, color: '#fff', fontSize: 12, lineHeight: 1.5,
      opacity: p ? 1 : 0, transform: p ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity .3s ease, transform .3s ease',
      textShadow: '0 1px 8px rgba(0,0,0,0.9)'
    }}>
      {p &&
      <React.Fragment>
          <div style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{p.title}</div>
          <div style={{ opacity: 0.7 }}>{p.year}</div>
        </React.Fragment>
      }
    </div>);

}

// hover readout for the index grid (when cards are off)
function IndexReadout({ p }) {
  return (
    <div style={{
      position: 'fixed', left: 43, bottom: 78, width: 320, zIndex: 38, pointerEvents: 'none',
      fontFamily: FONT, color: '#fff', fontSize: 12, lineHeight: 1.5,
      opacity: p ? 1 : 0, transform: p ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity .3s ease, transform .3s ease',
      textShadow: '0 1px 6px rgba(0,0,0,0.7)'
    }}>
      {p &&
      <React.Fragment>
          <div style={{ fontWeight: 600, letterSpacing: '0.04em' }}>{p.title}</div>
          <div style={{ opacity: 0.65 }}>{p.year}</div>
          {p.keywords && <div style={{ opacity: 0.5, marginTop: 6 }}>{p.keywords.join(', ')}</div>}
        </React.Fragment>
      }
    </div>);

}

// Theme toggle cycles these. 'alarm' = hypersaturated orange wash (app.html).
const THEMES = ['dark', 'light', 'alarm'];
const THEME_LABEL = { dark: 'Dark', light: 'Light', alarm: 'Alarm' };
const THEME_ICON = { dark: '◑', light: '◐', alarm: '●' };

const NO_HOVER = () => {};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const isMobile = useMobile();
  const [view, setView] = useState(() => viewFromLocation());
  const [lite, setLite] = useState(() => !!window.LITE);
  const [hovered, setHovered] = useState(null);
  const bioRef = useRef(null);
  const [readoutTop, setReadoutTop] = useState(500);
  const [theme, setTheme] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (_) {}   // storage blocked (privacy mode)
    return THEMES.includes(saved) ? saved : 'dark';
  });

  // Light mode: invert the whole page (CSS handles keeping media true-colour).
  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light');
    document.documentElement.classList.toggle('alarm-mode', theme === 'alarm');
    try { localStorage.setItem('theme', theme); } catch (_) {}
  }, [theme]);

  // Large entity nudge (offset from its bubble-anchored home).
  useEffect(() => {
    document.documentElement.style.setProperty('--le-dx', (t.entityX || 0) + 'px');
    document.documentElement.style.setProperty('--le-dy', (t.entityY || 0) + 'px');
    document.documentElement.style.setProperty('--se-dx', (t.smallEntityX || 0) + 'px');
    document.documentElement.style.setProperty('--se-dy', (t.smallEntityY || 0) + 'px');
  }, [t.entityX, t.entityY, t.smallEntityX, t.smallEntityY]);

  // Name size in the floating bubble.
  useEffect(() => {
    const NAME = {
      small:  ['12px', '0'],
      medium: ['21px', '-0.005em'],
      large:  ['23px', '-0.02em'],
      xlarge: ['30px', '-0.03em'],
    };
    const v = NAME[t.nameSize] || NAME.medium;
    document.documentElement.style.setProperty('--name-size', v[0]);
    document.documentElement.style.setProperty('--name-track', v[1]);
  }, [t.nameSize]);

  // Background darkness slider → CSS var (non-canvas areas) + WebGL clear color.
  useEffect(() => {
    const pct = Math.max(0, Math.min(100, Number.isFinite(t.bgDarkness) ? t.bgDarkness : 100));
    const lightness = Math.round(3 + (100 - pct) * 0.35); // ~3% .. ~38%
    document.documentElement.style.setProperty('--bg-color', `hsl(0, 0%, ${lightness}%)`);
    const v = lightness / 100;
    window.__bgRGB = [v, v, v];
  }, [t.bgDarkness]);

  useEffect(() => {
    // back/forward buttons, in-app navigation, and any leftover "#id" links
    const onNav = () => {setView(viewFromLocation());setHovered(null);};
    window.addEventListener('popstate', onNav);
    window.addEventListener('viewchange', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('viewchange', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);

  useEffect(() => {window.scrollTo(0, 0);}, [view]);

  // Mobile has no About page — always show Index
  useEffect(() => {
    if (isMobile && view === 'about') go('index');
  }, [isMobile, view]);

  // Track bio panel bottom for DiagramReadout positioning
  useEffect(() => {
    if (!bioRef.current) return;
    const update = () => {
      if (bioRef.current) {
        const r = bioRef.current.getBoundingClientRect();
        setReadoutTop(Math.round(r.bottom) + 20);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bioRef.current);
    return () => ro.disconnect();
  }, [view]);

  const go = navigate;
  // The projects page only uses hover for its readout when title cards are off;
  // otherwise every column crossed while scrolling re-rendered the whole page.
  const indexHover = t.indexCardMode === 'off' ? setHovered : NO_HOVER;

  const project = view !== 'about' && view !== 'index' ?
  window.PROJECTS.find((p) => p.id === view) : null;
  const isIndex = view === 'index';
  const isAbout = !project && !isIndex;

  // Project pages: the gallery covers the background, so freeze the depth
  // cloud on its last frame instead of redrawing it every frame.
  const onProject = !!project;

  // The large entity is only on the About page: load it the first time About
  // opens, and fetch its file quietly once the landing page has settled, so
  // that first visit doesn't wait for it.
  const [aboutSeen, setAboutSeen] = useState(isAbout);
  useEffect(() => { if (isAbout) setAboutSeen(true); }, [isAbout]);
  useEffect(() => {
    if (isMobile || aboutSeen || !window.mountEntity || !window.mountEntity.prefetch) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
    const t = setTimeout(() => idle(() => window.mountEntity.prefetch('entities/vector-entity-2.html')), 6000);
    return () => clearTimeout(t);
  }, [isMobile, aboutSeen]);

  // Page title per view (tabs, bookmarks, and how search engines label the page)
  useEffect(() => {
    const bio = (window.SITE_CONTENT && window.SITE_CONTENT.bio) || {};
    const name = bio.name || 'Jaxon Stickler';
    document.title = project
      ? displayTitle(project.title) + (project.year ? ' (' + project.year + ')' : '') + ' — ' + name
      : isAbout ? 'About — ' + name
      : name + ' — ' + (bio.role || 'Designer/Artist');
  }, [view]);
  useEffect(() => {
    if (window.setDepthCloudFrozen) window.setDepthCloudFrozen(onProject || lite);
  }, [onProject, lite]);

  // Lite mode (see projects.js): starts on for low-memory/low-CPU devices, and
  // switches on here only for a *sustained* low frame rate: 3 s measured once
  // the loading screen has gone and the page has settled, with the typical
  // (median) frame slower than 40 ms (< 25 fps). Start-up hiccups and one-off
  // stalls don't count. Remembered for this tab; ?lite=0 turns it off.
  useEffect(() => {
    if (lite) return;
    try { if (sessionStorage.getItem('lite') === '0') return; } catch (_) {}
    let raf = 0, start = 0, last = 0, gaps = [], cancelled = false, begin = 0;
    const tick = (now) => {
      if (cancelled) return;
      if (document.hidden) { start = 0; last = 0; gaps = []; raf = requestAnimationFrame(tick); return; }
      if (!start) start = now; else gaps.push(now - last);
      last = now;
      if (now - start < 3000) { raf = requestAnimationFrame(tick); return; }
      const sorted = gaps.slice().sort((a, b) => a - b);
      if (sorted.length > 20 && sorted[sorted.length >> 1] > 40) {
        window.LITE = true;
        try { sessionStorage.setItem('lite', '1'); } catch (_) {}
        setLite(true);
      }
    };
    const whenSettled = () => { begin = setTimeout(() => { raf = requestAnimationFrame(tick); }, 3000); };
    // wait for the loading screen to finish first
    const poll = setInterval(() => { if (!document.getElementById('preloader')) { clearInterval(poll); whenSettled(); } }, 250);
    return () => { cancelled = true; clearInterval(poll); clearTimeout(begin); cancelAnimationFrame(raf); };
  }, [lite]);

  let footerLeft = [];

  // bubble appearance globals (read by BubbleNav + bubble backgrounds)
  window.__navGraphic = t.bubbleNavGraphic;
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--bubble-op', t.bubbleOpacity);
  }


  return (
    <div style={{ fontFamily: FONT }}>
      <DepthCloud />
      <AnimatedEntity />
      <CustomCursor />

      {isAbout && !isMobile &&
      <React.Fragment>
          <BioAbout ref={bioRef} locationStyle={t.locationStyle} />
          <AboutDiagram
          projects={window.PROJECTS}
          onHover={setHovered}
          hoveredId={hovered ? hovered.id : null} />
          <DiagramReadout p={hovered} top={readoutTop} />
        </React.Fragment>
      }

      {/* Entity 2 (About page only, ~260 KB) mounts on the first About visit,
          then stays mounted so it never pops back in */}
      {!isMobile && aboutSeen &&
      <KeepAlive active={isAbout}>
          <LargeEntity />
        </KeepAlive>
      }

      {/* Index stays mounted so its images never re-load when returning */}
      {!isMobile &&
      <KeepAlive active={isIndex}>
          <IndexGrid
          cardMode={t.indexCardMode}
          imageLimit={t.imageLimit} lite={lite}
          onHover={indexHover}
          isMobile={false}
          locationStyle={t.locationStyle} />
        </KeepAlive>
      }

      {isIndex && isMobile &&
      <IndexGrid
        cardMode={t.indexCardMode}
        imageLimit={t.imageLimit} lite={lite}
        onHover={indexHover}
        isMobile={true}
        locationStyle={t.locationStyle} />
      }

      {isIndex && !isMobile &&
      <React.Fragment>
          <BioShort locationStyle={t.locationStyle} top={19} contact={false} />
          {t.indexCardMode === 'off' && <IndexReadout p={hovered} />}
        </React.Fragment>
      }

      {project &&
      <ProjectPage key={project.id} p={project} locationStyle={t.locationStyle} mobile={isMobile} />
      }

      <Footer left={footerLeft} navPosition={t.navPosition} />

      <button id="theme-toggle" title="Switch theme: dark / light / alarm"
      aria-label={'Theme: ' + THEME_LABEL[theme] + '. Switch theme'}
      onClick={() => setTheme((v) => THEMES[(THEMES.indexOf(v) + 1) % THEMES.length])}><span aria-hidden="true">{THEME_ICON[theme]}</span>{THEME_LABEL[theme]}</button>

      <TweaksPanel>
        <TweakSection label="Navigation" />
        <TweakRadio label="Nav position"
        value={t.navPosition}
        options={['bottom-left', 'top-right', 'top-center']}
        onChange={(v) => setTweak('navPosition', v)} />

        <TweakSection label="Bubble" />
        <TweakRadio label="Name size"
        value={t.nameSize} options={['small', 'medium', 'large', 'xlarge']}
        onChange={(v) => setTweak('nameSize', v)} />

        <TweakSlider label="Bubble opacity"
        value={t.bubbleOpacity} min={0.3} max={1} step={0.05}
        onChange={(v) => setTweak('bubbleOpacity', v)} />
        <TweakToggle label="Graphic nav glyph" value={t.bubbleNavGraphic}
        onChange={(v) => setTweak('bubbleNavGraphic', v)} />

        <TweakSection label="Live location" />
        <TweakRadio label="Signifier" value={t.locationStyle}
        options={['pulse', 'clock', 'both']}
        onChange={(v) => setTweak('locationStyle', v)} />

        <TweakSection label="Index" />
        <TweakRadio label="Project cards"
        value={t.indexCardMode}
        options={['off', 'title']}
        onChange={(v) => setTweak('indexCardMode', v)} />
        <TweakSlider label="Default preview images"
        value={t.imageLimit} min={1} max={20} step={1}
        onChange={(v) => setTweak('imageLimit', v)} />

        <TweakSection label="Small entity" />
        <TweakSlider label="Move horizontally"
        value={t.smallEntityX} min={-500} max={500} step={2} unit="px"
        onChange={(v) => setTweak('smallEntityX', v)} />
        <TweakSlider label="Move vertically"
        value={t.smallEntityY} min={-500} max={500} step={2} unit="px"
        onChange={(v) => setTweak('smallEntityY', v)} />

        <TweakSection label="Large entity" />
        <TweakSlider label="Move horizontally"
        value={t.entityX} min={-400} max={400} step={2} unit="px"
        onChange={(v) => setTweak('entityX', v)} />
        <TweakSlider label="Move vertically"
        value={t.entityY} min={-400} max={400} step={2} unit="px"
        onChange={(v) => setTweak('entityY', v)} />

        <TweakSection label="Background" />
        <TweakSlider label="Darkness"
        value={t.bgDarkness} min={0} max={100} step={1} unit="%"
        onChange={(v) => setTweak('bgDarkness', v)} />
      </TweaksPanel>
    </div>);

}

(function () {
  function boot() {
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  }
  // Wait for remote content (Supabase) if configured; fall back to bundled data.
  if (window.__remoteReady || !window.SUPABASE_URL) boot();
  else {
    var did = false;
    var go = function () { if (did) return; did = true; boot(); };
    window.addEventListener('remote-content-ready', go, { once: true });
    setTimeout(go, 7000); // safety net
  }
})();