// depth-cloud.js — cursor-lit depth-map point cloud background (torch + haze + shine).
// window.initDepthCloud(canvas) → cleanup fn.

(function () {
  const CONFIG = {
    scene:   'images/about/scene.jpg',
    depth:   'images/about/scene_depth.png',
    cols:    600,                  // point grid width; higher = smoother
    zScale:  0.55,
    point:   3.8,
    light:   0.55,                 // Gaussian pool radius (NDC)
    falloff: 2.0,                  // Gaussian width; higher = tighter pool
    ambient: 0.04,                 // near-zero base — background almost pure black
    vignette: 1.05,                // radius where edges fade to black
    haze:    [0.04, 0.05, 0.07],   // cool haze lifts inky blacks
    relief:  0.35,
    exposure: 1.8,
    tint:    [1.0, 1.0, 1.0],
    drift:   0.82,                 // idle sweep amplitude
    ease:    0.03,                 // cursor follow smoothing (low = dreamy)
    shine:   0.7,                  // specular highlight from bump-map normals
  };

  const VERT = `#version 300 es
precision highp float;
uniform sampler2D uDepth;
uniform vec2  uGrid;
uniform vec2  uResolution;
uniform float uAspect;
uniform float uZScale;
uniform float uPointSize;
uniform vec2  uMouse;
out vec2  vUv;
out vec3  vPos;
out float vDepth;
void main() {
  float col = mod(float(gl_VertexID), uGrid.x);
  float row = floor(float(gl_VertexID) / uGrid.x);
  vec2 uv = vec2(col / (uGrid.x - 1.0), row / (uGrid.y - 1.0));
  vUv = uv;
  float d = texture(uDepth, vec2(uv.x, 1.0 - uv.y)).r;
  vDepth = d;
  float screenAspect = uResolution.x / uResolution.y;
  vec2 fit = vec2(1.0);
  if (screenAspect > uAspect) fit.y = screenAspect / uAspect;
  else                        fit.x = uAspect / screenAspect;
  vec2 ndc = (uv - 0.5) * 2.0;
  ndc.y = -ndc.y;
  float z = (d - 0.5) * uZScale;
  vec2 pos = ndc * fit;
  vPos = vec3(pos, z);
  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = uPointSize * (0.55 + d * 1.1);
}`;

  const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform vec2  uMouse;
uniform float uLight;
uniform float uFalloff;
uniform float uRelief;
uniform float uExposure;
uniform float uAmbient;
uniform float uVignette;
uniform vec3  uTint;
uniform vec3  uHaze;
uniform float uShine;
in vec2  vUv;
in vec3  vPos;
in float vDepth;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float sprite = smoothstep(0.5, 0.0, r);

  float d2 = distance(vPos.xy, uMouse);
  float pool = exp(-(d2 * d2) * uFalloff / (uLight * uLight));

  float light = uAmbient + (1.0 - uAmbient) * pool;
  light *= 1.0 - smoothstep(uVignette, 1.4, length(vPos.xy));
  light *= mix(1.0, vDepth, uRelief);

  float bStep = 0.002;
  float dL = texture(uDepth, vec2(vUv.x - bStep, 1.0 - vUv.y)).r;
  float dR = texture(uDepth, vec2(vUv.x + bStep, 1.0 - vUv.y)).r;
  float dU = texture(uDepth, vec2(vUv.x,         1.0 - vUv.y + bStep)).r;
  float dD = texture(uDepth, vec2(vUv.x,         1.0 - vUv.y - bStep)).r;
  vec3 bumpNormal = normalize(vec3((dL - dR) * 8.0, (dD - dU) * 8.0, 0.2));

  vec3 lightDir = normalize(vec3(uMouse - vPos.xy, 0.5));
  vec3 halfDir  = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec    = pow(max(dot(bumpNormal, halfDir), 0.0), 48.0);
  float shine   = spec * pool * uShine;

  vec3 albedo = texture(uScene, vUv).rgb;
  vec3 color  = (albedo * uTint + uHaze) * light * uExposure + vec3(shine);
  frag = vec4(color, (light + shine) * sprite);
}`;

  // Adaptive quality — scale the work down on low-end / mobile / reduced-motion
  // so the background stays smooth on weak GPUs without changing the look on
  // capable hardware. A device guess picks the starting tier; a frame-time
  // watchdog (see watch()) then steps down whenever the browser can't keep up,
  // which the guess can't see (software WebGL, hardware acceleration switched
  // off in that browser, very large high-DPI windows...).
  // Clean fps caps only — 30/60 keep even frame cadence on 60/120Hz (avoids judder).
  const TIERS = [
    { cols: 560, dprCap: 1.5, fps: 60, drift: true },   // point count ∝ cols²
    { cols: 360, dprCap: 1,   fps: 60, drift: true },
    { cols: 360, dprCap: 1,   fps: 30, drift: true },
    { cols: 360, dprCap: 1,   fps: 30, drift: false },  // last resort: redraw only while the pointer moves
  ];
  const START = (function () {
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const cores = navigator.hardwareConcurrency || 4;
    // deviceMemory only exists in Chromium browsers. Treat it as unknown
    // elsewhere rather than as 4GB, which put every Firefox/Safari visitor on
    // the low tier regardless of their hardware.
    const mem = navigator.deviceMemory;
    const coarse = mm('(pointer: coarse)');
    const reduced = mm('(prefers-reduced-motion: reduce)');
    const low = coarse || cores <= 4 || (mem !== undefined && mem <= 4);
    return {
      tier: (low || reduced) ? 2 : 0,
      drift: reduced ? 0 : CONFIG.drift,
    };
  })();

  window.initDepthCloud = function initDepthCloud(canvas) {
    const attrs = {
      antialias: false, alpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance', desynchronized: true,
    };
    // Ask for a hardware context first. If the browser can only give a slow
    // software one, still render, but start on the cheapest tier.
    let gl = canvas.getContext('webgl2', Object.assign({ failIfMajorPerformanceCaveat: true }, attrs));
    let tierIdx = START.tier;
    if (!gl) {
      gl = canvas.getContext('webgl2', attrs);
      tierIdx = TIERS.length - 1;
    }
    if (!gl) { console.warn('WebGL2 unavailable — depth cloud disabled'); return function () {}; }

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const U = (n) => gl.getUniformLocation(program, n);
    const loc = {
      uDepth: U('uDepth'), uScene: U('uScene'), uGrid: U('uGrid'),
      uResolution: U('uResolution'), uAspect: U('uAspect'), uZScale: U('uZScale'),
      uPointSize: U('uPointSize'), uMouse: U('uMouse'), uLight: U('uLight'),
      uFalloff: U('uFalloff'), uRelief: U('uRelief'), uExposure: U('uExposure'),
      uAmbient: U('uAmbient'), uVignette: U('uVignette'),
      uTint: U('uTint'), uHaze: U('uHaze'), uShine: U('uShine'),
    };

    function loadTexture(url, unit) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => reject(new Error('Failed to load ' + url));
        img.src = url;
      });
    }

    let tier = TIERS[tierIdx];
    let sceneAspect = 0;                  // known once the scene texture loads
    let ease = 0, minDelta = 0;
    function applyTier() {
      tier = TIERS[tierIdx];
      // frame-rate-independent ease so the cursor follow feels the same at any fps cap
      ease = 1 - Math.pow(1 - CONFIG.ease, 60 / tier.fps);
      minDelta = 1000 / tier.fps - 0.5;
      if (!sceneAspect) return;
      const rows = Math.round(tier.cols / sceneAspect);
      count = tier.cols * rows;
      gl.uniform2f(loc.uGrid, tier.cols, rows);
      resize();
      lastDraw = -Infinity;               // force a redraw at the new quality
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
      gl.uniform1f(loc.uPointSize, CONFIG.point * dpr);
    }

    const target = { x: 0, y: 0 }, mouse = { x: 0, y: 0 };
    let interacting = false, idleTimer = 0;
    // On touch devices the torch shouldn't chase taps — leave it on the calm
    // idle drift so scrolling never triggers a re-render storm.
    var IS_TOUCH = window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;
    function setTarget(cx, cy) {
      if (IS_TOUCH) return;
      const rect = canvas.getBoundingClientRect();
      target.x = ((cx - rect.left) / rect.width) * 2 - 1;
      target.y = -(((cy - rect.top) / rect.height) * 2 - 1);
      interacting = true;
      clearTimeout(idleTimer);
      // resume the idle drift a beat after the pointer goes quiet
      idleTimer = setTimeout(() => { interacting = false; }, 2500);
    }
    const onMove = (e) => setTarget(e.clientX, e.clientY);
    if (!IS_TOUCH) window.addEventListener('mousemove', onMove);
    // touch listeners are deliberately NOT attached on touch devices: dragging
    // to scroll would otherwise drive the torch and force constant redraws

    let raf = 0, count = 0, alive = true;

    (async function boot() {
      const [scene] = await Promise.all([
        loadTexture(CONFIG.scene, 0),
        loadTexture(CONFIG.depth, 1),
      ]);
      if (!alive) return;
      sceneAspect = scene.w / scene.h;
      gl.uniform1i(loc.uScene, 0);
      gl.uniform1i(loc.uDepth, 1);
      gl.uniform1f(loc.uAspect, sceneAspect);
      gl.uniform1f(loc.uZScale, CONFIG.zScale);
      gl.uniform1f(loc.uLight, CONFIG.light);
      gl.uniform1f(loc.uFalloff, CONFIG.falloff);
      gl.uniform1f(loc.uRelief, CONFIG.relief);
      gl.uniform1f(loc.uExposure, CONFIG.exposure);
      gl.uniform1f(loc.uAmbient, CONFIG.ambient);
      gl.uniform1f(loc.uVignette, CONFIG.vignette);
      gl.uniform3fv(loc.uTint, CONFIG.tint);
      gl.uniform3fv(loc.uHaze, CONFIG.haze);
      gl.uniform1f(loc.uShine, CONFIG.shine);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      applyTier();                        // sets the grid and sizes the canvas
      window.addEventListener('resize', resize);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      // let page start-up (script compile, image decode) finish before judging speed
      watchFrom = performance.now() + 3000;
      raf = requestAnimationFrame(frame);
    })().catch((err) => console.error(err));

    let lastDraw = -Infinity, lastBg = -1;

    // Watchdog: average the gap between animation frames over ~2s windows. A
    // healthy page gets a frame every ~7-17ms whatever our own fps cap is; if
    // the whole page has dropped under ~36fps, step the background down a tier.
    let watchFrom = Infinity, lastT = 0, gapSum = 0, gapN = 0;
    function watch(t) {
      const gap = t - lastT;
      lastT = t;
      if (t < watchFrom || gap > 250) return;   // start-up, or a one-off stall / tab switch
      gapSum += gap; gapN++;
      if (gapSum < 2000) return;
      if (gapSum / gapN > 28 && tierIdx < TIERS.length - 1) {
        tierIdx++;
        applyTier();
        watchFrom = t + 1000;                   // let the new tier settle before re-judging
      }
      gapSum = 0; gapN = 0;
    }

    function frame(t) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;          // pause GPU work when tab/page not visible
      watch(t);
      if (t - lastDraw < minDelta) return;  // cap frame rate for low-end smoothness

      const drifting = !interacting && tier.drift && START.drift > 0;
      if (drifting) {
        const s = t * 0.00025;
        target.x = Math.cos(s * 0.85) * START.drift;
        target.y = Math.sin(s * 1.25) * START.drift * 0.65;
      }
      const dx = target.x - mouse.x, dy = target.y - mouse.y;
      var bg = window.__bgRGB || [0, 0, 0];
      const bgChanged = bg[0] !== lastBg;
      // Nothing moving, image converged, and bg unchanged → skip the draw entirely.
      // This is the big win: a static pointer no longer burns a full-res GPU
      // redraw every frame (previously it did, forever, once you moved once).
      if (!drifting && !bgChanged && (dx * dx + dy * dy) < 1e-7 && lastDraw > -Infinity) return;

      lastDraw = t;
      lastBg = bg[0];
      mouse.x += dx * ease;
      mouse.y += dy * ease;
      gl.uniform2f(loc.uMouse, mouse.x, mouse.y);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count) gl.drawArrays(gl.POINTS, 0, count);
    }

    return function cleanup() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', resize);
    };
  };
})();
