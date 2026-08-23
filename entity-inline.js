// entity-inline.js — mount a vector entity INTO the host document.
// The entities used to live in <iframe>s, which some preview/embed contexts
// paint as opaque white boxes instead of compositing the transparent child
// document. Inlining the SVG removes that failure mode entirely (and lets the
// proximity code use the parent's own coordinate space).
//
// window.mountEntity(container, url) -> Promise<void>
(function () {
  "use strict";
  if (window.mountEntity) return;

  var cache = Object.create(null);
  function fetchDoc(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) { return r.text(); });
    }
    return cache[url];
  }

  var styleDone = Object.create(null);
  // Copy the entity document's own <style> rules across once per source file,
  // rescoping #entity so several entities can coexist in one document.
  function adoptStyles(doc, url) {
    if (styleDone[url]) return;
    styleDone[url] = true;
    var css = "";
    doc.querySelectorAll("head style").forEach(function (s) { css += s.textContent + "\n"; });
    css = css
      .replace(/html\s*,\s*body\s*\{[^}]*\}/g, "")
      .replace(/\.stage\s*\{[^}]*\}/g, "")
      .replace(/#entity\b/g, ".fig-entity");
    var el = document.createElement("style");
    el.setAttribute("data-entity-style", url);
    css += "\n.fig-entity{contain:paint;}\n";
    el.textContent = css;
    document.head.appendChild(el);
  }

  window.mountEntity = function (container, url) {
    if (!container) return Promise.resolve();
    if (container.__entityMounted && container.querySelector("svg.fig-entity")) return Promise.resolve();
    container.__entityMounted = true;
    return fetchDoc(url).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, "text/html");
      var svg = doc.getElementById("entity");
      if (!svg) return;
      adoptStyles(doc, url);

      svg = document.adoptNode(svg);
      svg.classList.add("fig-entity");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.display = "block";
      svg.style.overflow = "visible";

      container.textContent = "";
      container.appendChild(svg);

      // The animator resolves its root via document.getElementById("entity").
      // Two entities mount in parallel (mountEntity is async), so a shared id
      // would race. Rewrite that lookup to a parameter instead and hand each
      // animator its own element.
      svg.id = "entity-" + Math.random().toString(36).slice(2);
      var code = "";
      doc.querySelectorAll("script").forEach(function (s) { code += s.textContent + "\n"; });
      code = code.replace(/document\s*\.\s*getElementById\(\s*["']entity["']\s*\)/g, "__ENTITY_EL__");
      try {
        (new Function("__ENTITY_EL__", code))(svg);
      } catch (e) {
        if (window.console) console.warn("[entity] animator failed for " + url, e);
      }

    }).catch(function (e) {
      container.__entityMounted = false;
      if (window.console) console.warn("[entity] load failed " + url, e);
    });
  };

})();
