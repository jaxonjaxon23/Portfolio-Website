// debug-overlay.js — add ?debug=1 to the address to show a small live readout
// (frame rate, dropped frames, lite mode, JavaScript speed) for diagnosing
// stutter in a particular browser. ?debug=0 hides it. Does nothing otherwise.
(function () {
  var on;
  try {
    var q = /[?&]debug=([01])/.exec(location.search);
    if (q) sessionStorage.setItem('debug', q[1]);
    on = sessionStorage.getItem('debug') === '1';
  } catch (_) { on = /[?&]debug=1/.test(location.search); }
  if (!on) return;

  function browserName() {
    var ua = navigator.userAgent;
    var m = /Edg\/([\d.]+)/.exec(ua) || /Firefox\/([\d.]+)/.exec(ua) || /Chrome\/([\d.]+)/.exec(ua) || /Version\/([\d.]+).*Safari/.exec(ua);
    var name = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return name + (m ? ' ' + m[1].split('.')[0] : '');
  }

  // A tight numeric loop: ~5–15 ms with JavaScript's optimiser on, several
  // times slower with it off (e.g. Edge's "Enhance your security" mode).
  function jsSpeed() {
    var t = performance.now(), x = 0;
    for (var i = 0; i < 3e6; i++) x += Math.sqrt(i) * (i & 7);
    window.__debugSink = x;
    return Math.round(performance.now() - t);
  }

  function start() {
    var box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483647;pointer-events:none;' +
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;color:#7CFFB2;background:rgba(0,0,0,.82);' +
      'padding:8px 10px;border-radius:8px;white-space:pre;';
    document.body.appendChild(box);
    var speed = jsSpeed();
    var frames = [], last = performance.now(), dropped = 0, droppedSince = performance.now();
    function tick(t) {
      var g = t - last; last = t;
      frames.push(t); while (frames.length && t - frames[0] > 1000) frames.shift();
      if (g > 25 && g < 1000 && !document.hidden) dropped++;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    setInterval(function () {
      var secs = Math.max(1, Math.round((performance.now() - droppedSince) / 1000));
      box.textContent =
        browserName() + '\n' +
        'fps          ' + frames.length + '\n' +
        'dropped      ' + dropped + ' in ' + secs + 's\n' +
        'lite mode    ' + (window.LITE ? 'ON' : 'off') + '\n' +
        'js speed     ' + speed + ' ms ' + (speed > 40 ? '(SLOW — JS optimiser off?)' : '(normal)') + '\n' +
        'memory/cores ' + (navigator.deviceMemory || '?') + ' GB / ' + (navigator.hardwareConcurrency || '?') + '\n' +
        '(?debug=0 to hide · click to reset count)';
    }, 500);
    box.style.pointerEvents = 'auto';
    box.addEventListener('click', function () { dropped = 0; droppedSince = performance.now(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
