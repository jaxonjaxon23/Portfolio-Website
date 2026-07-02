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
  // capable hardware. Detected once at init.
  const QUALITY = (function () {
    const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const coarse = mm('(pointer: coarse)');
    const reduced = mm('(prefers-reduced-motion: reduce)');
    const low = coarse || cores <= 4 || mem <= 4;
    return {
      cols: low ? 360 : 560,      // point grid width; point count ∝ cols²
      dprCap: low ? 1 : 1.5,      // was hard-capped at 2
      // clean caps only — 30/60 keep even frame cadence on 60/120Hz (avoids judder)
      fps: (low || reduced) ? 30 : 60,
      drift: reduced ? 0 : CONFIG.drift,
    };
  })();

  window.initDepthCloud = function initDepthCloud(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance', desynchronized: true,
    });
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

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.dprCap);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
      gl.uniform1f(loc.uPointSize, CONFIG.point * dpr);
    }

    const target = { x: 0, y: 0 }, mouse = { x: 0, y: 0 };
    let interacting = false;
    function setTarget(cx, cy) {
      const rect = canvas.getBoundingClientRect();
      target.x = ((cx - rect.left) / rect.width) * 2 - 1;
      target.y = -(((cy - rect.top) / rect.height) * 2 - 1);
      interacting = true;
    }
    const onMove = (e) => setTarget(e.clientX, e.clientY);
    const onTouch = (e) => { if (e.touches[0]) setTarget(e.touches[0].clientX, e.touches[0].clientY); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouch, { passive: true });

    let raf = 0, count = 0, alive = true;

    (async function boot() {
      const [scene] = await Promise.all([
        loadTexture(CONFIG.scene, 0),
        loadTexture(CONFIG.depth, 1),
      ]);
      if (!alive) return;
      const rows = Math.round(QUALITY.cols / (scene.w / scene.h));
      count = QUALITY.cols * rows;
      gl.uniform1i(loc.uScene, 0);
      gl.uniform1i(loc.uDepth, 1);
      gl.uniform2f(loc.uGrid, QUALITY.cols, rows);
      gl.uniform1f(loc.uAspect, scene.w / scene.h);
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
      resize();
      window.addEventListener('resize', resize);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      raf = requestAnimationFrame(frame);
    })().catch((err) => console.error(err));

    // frame-rate-independent ease so the cursor follow feels the same at any fps cap
    const ease = 1 - Math.pow(1 - CONFIG.ease, 60 / QUALITY.fps);
    const minDelta = 1000 / QUALITY.fps - 0.5;
    let lastDraw = -Infinity;

    function frame(t) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;          // pause GPU work when tab/page not visible
      if (t - lastDraw < minDelta) return;  // cap frame rate for low-end smoothness
      lastDraw = t;
      if (!interacting) {
        const s = t * 0.00025;
        target.x = Math.cos(s * 0.85) * QUALITY.drift;
        target.y = Math.sin(s * 1.25) * QUALITY.drift * 0.65;
      }
      mouse.x += (target.x - mouse.x) * ease;
      mouse.y += (target.y - mouse.y) * ease;
      gl.uniform2f(loc.uMouse, mouse.x, mouse.y);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count) gl.drawArrays(gl.POINTS, 0, count);
    }

    return function cleanup() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('resize', resize);
    };
  };
})();
