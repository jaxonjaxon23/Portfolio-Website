// admin-media.js — in-browser optimisation for media added in the CMS, so new
// uploads match the files already on the site.
//   Images → WebP (JPEG on Safari), long edge ≤ 2560px (every existing image is
//            2560 on its long edge). Reads JPEG/PNG/WebP/AVIF/BMP natively,
//            HEIC/HEIF via heic-to (libheif) and TIFF via UTIF, both loaded only
//            when needed. GIF/SVG are kept (animation / vector).
//   Videos → H.264 MP4, short edge ≤ 1080px, ~1.2 Mbps per megapixel, audio
//            dropped (every video on the site plays muted on loop). Uses
//            Mediabunny on the browser's WebCodecs encoder.
// Rule: never upload something visitors' browsers can't show. Files that can't
// be read or converted come back with `error` instead of a file.
// Exposes window.optimizeMedia(file, onProgress)
//   → { file, before, after, note }  or  { error }.

(function () {
  var IMG_MAX = 2560, IMG_QUALITY = 0.82;
  var VID_SHORT_MAX = 1080, VID_BPS_PER_MP = 1.2e6, VID_MIN_BPS = 5e5, VID_MAX_BPS = 3e6;
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var MEDIABUNNY = CDN + 'mediabunny@1.61.4/+esm';
  var HEIC_TO = CDN + 'heic-to@1.6.6/dist/heic-to.js';           // LGPL-3.0, ~3 MB, HEIC only
  var PAKO = CDN + 'pako@1.0.11/dist/pako_inflate.min.js';        // MIT, for deflate TIFFs
  var UTIF_JS = CDN + 'utif@3.1.0/UTIF.js';                       // MIT

  var RAW_RE = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|raf|orf|rw2|pef|srw|x3f|3fr|iiq|erf|mef|mos|kdc|psd|psb)$/i;
  var VIDEO_RE = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|3gp|mpg|mpeg|ts|mts|m2ts|ogv)$/i;

  function ext(name) { var m = /\.[^.]+$/.exec(name); return m ? m[0].toLowerCase() : ''; }
  function rename(name, e) { return name.replace(/\.[^.]+$/, '') + e; }
  function kept(file, note) { return { file: file, before: file.size, after: file.size, note: note }; }
  function fail(file, why) { return { error: file.name + ': ' + why }; }
  function isVideo(file) { return /^video\//.test(file.type) || VIDEO_RE.test(file.name); }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-src="' + src + '"]')) return res();
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-src', src);
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var cache = {};
  function once(key, fn) { return cache[key] || (cache[key] = fn().catch(function (e) { delete cache[key]; throw e; })); }

  // first bytes of the file, to recognise formats the OS gave no type for
  async function sniff(file) {
    var b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    var s = String.fromCharCode.apply(null, b);
    if (/^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(s.slice(4, 12))) return 'heic';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) ||
        (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff';
    return '';
  }

  async function decodeHeic(file) {
    var mod = await once('heic', function () { return import(HEIC_TO); });
    var heicTo = mod.heicTo || (mod.default && (mod.default.heicTo || mod.default));
    return heicTo({ blob: file, type: 'bitmap' });
  }

  async function decodeTiff(file) {
    await once('utif', function () { return loadScript(PAKO).then(function () { return loadScript(UTIF_JS); }); });
    var buf = await file.arrayBuffer();
    var ifds = window.UTIF.decode(buf);
    if (!ifds.length) throw new Error('empty TIFF');
    // largest page = the full-size image (others are often thumbnails)
    ifds.forEach(function (ifd) { window.UTIF.decodeImage(buf, ifd, ifds); });
    var page = ifds.reduce(function (a, b) { return (b.width * b.height > a.width * a.height) ? b : a; });
    var rgba = window.UTIF.toRGBA8(page);
    return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, page.width * page.height * 4), page.width, page.height));
  }

  // anything the browser can show in an <img> (covers a few formats createImageBitmap rejects)
  function decodeViaImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('unreadable')); };
      img.src = url;
    });
  }

  async function decodeImage(file) {
    var kind = (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) ? 'heic'
      : (/\.tiff?$/i.test(file.name) || file.type === 'image/tiff') ? 'tiff'
      : await sniff(file);
    try { return await createImageBitmap(file); } catch (_) { /* fall through */ }
    if (kind === 'heic') return decodeHeic(file);
    if (kind === 'tiff') return decodeTiff(file);
    return decodeViaImg(file);
  }

  function toBlob(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(res, type, q); });
  }

  async function optimizeImage(file) {
    if (RAW_RE.test(file.name)) {
      return fail(file, 'camera RAW / Photoshop files can’t be shown on a website — export it as JPG or PNG first.');
    }
    if (/image\/(gif|svg)/.test(file.type) || /\.(gif|svg)$/i.test(file.name)) {
      return kept(file, 'kept as-is (GIF/SVG would lose animation or sharpness)');
    }
    var src;
    try { src = await decodeImage(file); }
    catch (e) {
      return fail(file, 'couldn’t read this image (' + (ext(file.name) || file.type || 'unknown format') +
        '). Export it as JPG or PNG and try again.');
    }
    var W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
    var s = Math.min(1, IMG_MAX / Math.max(W, H));
    var w = Math.round(W * s), h = Math.round(H * s);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();

    // Safari can't encode WebP (returns PNG instead) — fall back to JPEG there.
    var blob = await toBlob(canvas, 'image/webp', IMG_QUALITY), e = '.webp';
    if (!blob || blob.type !== 'image/webp') { blob = await toBlob(canvas, 'image/jpeg', 0.86); e = '.jpg'; }
    if (!blob) return fail(file, 'conversion failed — export it as JPG or PNG and try again.');
    // a web-ready original that's already smaller (and needed no resize) is kept
    var webReady = /\.(jpe?g|png|webp|avif)$/i.test(file.name);
    if (webReady && s === 1 && blob.size >= file.size) return kept(file, 'kept as-is (already smaller than a conversion)');
    return {
      file: new File([blob], rename(file.name, e), { type: blob.type }),
      before: file.size, after: blob.size,
      note: (s < 1 ? 'resized to ' + w + '×' + h + ', ' : '') + 'converted to ' + e.slice(1).toUpperCase(),
    };
  }

  async function optimizeVideo(file, onProgress) {
    var codec = null;
    // If conversion isn't possible, the original is only acceptable when every
    // browser can already play it: H.264/VP8/VP9/AV1 in MP4/WebM.
    function fallback(why) {
      var safe = codec && /^(avc|vp8|vp9|av1)$/.test(codec) && /\.(mp4|m4v|webm)$/i.test(file.name);
      return safe ? kept(file, 'kept as-is (' + why + ')')
        : fail(file, why + '. Open the CMS in Chrome or Edge to convert it, or export it as MP4 (H.264).');
    }
    try {
      var MB = await once('mediabunny', function () { return import(MEDIABUNNY); });
      var input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
      var track = await input.getPrimaryVideoTrack();
      if (!track) return fail(file, 'no video found in this file');
      codec = track.codec;
      if (typeof VideoEncoder === 'undefined') return fallback('this browser can’t compress video');
      var W = track.displayWidth, H = track.displayHeight;
      var s = Math.min(1, VID_SHORT_MAX / Math.min(W, H));
      var w = Math.max(2, Math.round((W * s) / 2) * 2), h = Math.max(2, Math.round((H * s) / 2) * 2);
      var bps = Math.round(Math.max(VID_MIN_BPS, Math.min(VID_MAX_BPS, (w * h / 1e6) * VID_BPS_PER_MP)));
      if (!(await MB.canEncodeVideo('avc', { width: w, height: h, bitrate: bps }))) {
        return fallback('this browser can’t encode H.264');
      }
      if (!(await track.canDecode())) return fallback('this browser can’t read ' + (codec || 'this') + ' video');
      var output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
      var conv = await MB.Conversion.init({
        // copy:false — always re-encode; otherwise an H.264 source that needs no
        // resize is copied through untouched at its original (large) bitrate
        input: input, output: output, showWarnings: false, copy: false,
        video: { width: w, height: h, fit: 'fill', codec: 'avc', quality: new MB.Quality({ bitrate: bps, bitrateMode: 'variable' }), keyFrameInterval: 2 },
        audio: { discard: true },
      });
      if (!conv.isValid) return fallback('couldn’t convert this video');
      conv.onProgress = function (p) { if (onProgress) onProgress(p); };
      await conv.execute();
      var buf = output.target.buffer;
      if (!buf) return fallback('conversion produced no output');
      var webReady = /^(avc)$/.test(codec || '') && /\.(mp4|m4v)$/i.test(file.name);
      if (webReady && buf.byteLength >= file.size) return kept(file, 'kept as-is (already smaller than a conversion)');
      return {
        file: new File([buf], rename(file.name, '.mp4'), { type: 'video/mp4' }),
        before: file.size, after: buf.byteLength,
        note: (s < 1 ? 'resized to ' + w + '×' + h + ', ' : '') + 'compressed to H.264, audio removed',
      };
    } catch (e) {
      return fallback((e && e.message) || 'conversion error');
    }
  }

  window.optimizeMedia = function (file, onProgress) {
    return isVideo(file) ? optimizeVideo(file, onProgress) : optimizeImage(file);
  };
  window.isOptimizableMedia = function (file) {
    return /^(image|video)\//.test(file.type) || VIDEO_RE.test(file.name) ||
      /\.(jpe?g|png|webp|avif|gif|svg|bmp|heic|heif|tiff?)$/i.test(file.name) || RAW_RE.test(file.name);
  };
})();
