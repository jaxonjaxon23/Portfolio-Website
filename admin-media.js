// admin-media.js — in-browser optimisation for media added in the CMS, so new
// uploads match the files already on the site.
//   Images → WebP, long edge ≤ 2560px (every existing image is 2560 on its long edge).
//   Videos → H.264 MP4, short edge ≤ 1080px, ~1.2 Mbps per megapixel, audio
//            dropped (every video on the site plays muted on loop).
// Video uses Mediabunny (MPL-2.0, loaded only when a video is added) on top of
// the browser's built-in WebCodecs encoder — no server, nothing to install.
// Anything that can't be optimised is kept as the original file.
// Exposes window.optimizeMedia(file, onProgress) → { file, before, after, note }.

(function () {
  var IMG_MAX = 2560, IMG_QUALITY = 0.82;
  var VID_SHORT_MAX = 1080, VID_BPS_PER_MP = 1.2e6, VID_MIN_BPS = 5e5, VID_MAX_BPS = 3e6;
  var MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.4/+esm';

  function rename(name, ext) { return name.replace(/\.[^.]+$/, '') + ext; }
  function kept(file, note) { return { file: file, before: file.size, after: file.size, note: note }; }
  function isVideo(file) { return /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name); }

  function toBlob(canvas, type, q) {
    return new Promise(function (res) { canvas.toBlob(res, type, q); });
  }

  async function optimizeImage(file) {
    if (/image\/(gif|svg)/.test(file.type) || /\.(gif|svg)$/i.test(file.name)) {
      return kept(file, 'kept as-is (GIF/SVG would lose animation or sharpness)');
    }
    var bmp;
    try { bmp = await createImageBitmap(file); }
    catch (_) { return kept(file, "kept as-is (this browser can't read the format)"); }
    var s = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    // Safari can't encode WebP (returns PNG instead) — fall back to JPEG there.
    var blob = await toBlob(canvas, 'image/webp', IMG_QUALITY), ext = '.webp';
    if (!blob || blob.type !== 'image/webp') { blob = await toBlob(canvas, 'image/jpeg', 0.86); ext = '.jpg'; }
    if (!blob) return kept(file, 'kept as-is (conversion failed)');
    if (blob.size >= file.size && s === 1) return kept(file, 'kept as-is (already smaller than a conversion)');
    return {
      file: new File([blob], rename(file.name, ext), { type: blob.type }),
      before: file.size, after: blob.size,
      note: (s < 1 ? 'resized to ' + w + '×' + h + ', ' : '') + 'converted to ' + ext.slice(1).toUpperCase(),
    };
  }

  var mbPromise = null;
  function loadMediabunny() { return mbPromise || (mbPromise = import(MEDIABUNNY)); }

  async function optimizeVideo(file, onProgress) {
    if (typeof VideoEncoder === 'undefined') {
      return kept(file, 'kept as-is (this browser has no video encoder — use Chrome or Edge to compress)');
    }
    try {
      var MB = await loadMediabunny();
      var input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
      var track = await input.getPrimaryVideoTrack();
      if (!track) return kept(file, 'kept as-is (no video track found)');
      var W = track.displayWidth, H = track.displayHeight;
      var s = Math.min(1, VID_SHORT_MAX / Math.min(W, H));
      var w = Math.max(2, Math.round((W * s) / 2) * 2), h = Math.max(2, Math.round((H * s) / 2) * 2);
      var bps = Math.round(Math.max(VID_MIN_BPS, Math.min(VID_MAX_BPS, (w * h / 1e6) * VID_BPS_PER_MP)));
      if (!(await MB.canEncodeVideo('avc', { width: w, height: h, bitrate: bps }))) {
        return kept(file, "kept as-is (this browser can't encode H.264)");
      }
      var output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new MB.BufferTarget() });
      var conv = await MB.Conversion.init({
        // copy:false — always re-encode; otherwise an H.264 source that needs no
        // resize is copied through untouched at its original (large) bitrate
        input: input, output: output, showWarnings: false, copy: false,
        video: { width: w, height: h, fit: 'fill', codec: 'avc', quality: new MB.Quality({ bitrate: bps, bitrateMode: 'variable' }), keyFrameInterval: 2 },
        audio: { discard: true },
      });
      if (!conv.isValid) return kept(file, "kept as-is (couldn't convert this video)");
      conv.onProgress = function (p) { if (onProgress) onProgress(p); };
      await conv.execute();
      var buf = output.target.buffer;
      if (!buf || buf.byteLength >= file.size) return kept(file, 'kept as-is (already smaller than a conversion)');
      return {
        file: new File([buf], rename(file.name, '.mp4'), { type: 'video/mp4' }),
        before: file.size, after: buf.byteLength,
        note: (s < 1 ? 'resized to ' + w + '×' + h + ', ' : '') + 'compressed to H.264, audio removed',
      };
    } catch (e) {
      return kept(file, 'kept as-is (' + ((e && e.message) || 'conversion error') + ')');
    }
  }

  window.optimizeMedia = function (file, onProgress) {
    return isVideo(file) ? optimizeVideo(file, onProgress) : optimizeImage(file);
  };
})();
