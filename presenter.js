/*
 * Modo apresentação para abrir index.html direto no navegador.
 *
 * Fica inativo dentro do player/Studio do HyperFrames (iframe de mesma origem) e no render
 * (navegador automatizado) — lá o runtime do HyperFrames controla o tempo.
 * Aqui, cada avanço TOCA a animação de entrada do slide/fragmento a partir da
 * mesma timeline GSAP ("deck"), em vez de só saltar para o estado final.
 *
 * Teclas: → / Espaço / PageDown avança · ← / PageUp volta · Home / End ·
 * F tela cheia. Clique no slide avança. Respeita prefers-reduced-motion.
 */
(function () {
  // Dentro do player/Studio do HyperFrames (iframe de mesma origem) ou no render, o runtime manda.
  // Em página própria ou em iframe de outra origem (ex.: link publicado), este controlador assume.
  var hostFrame = null;
  try { hostFrame = window.frameElement; } catch (e) {}
  if (hostFrame || navigator.webdriver) return;

  var W = 1920, H = 1080;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function boot() {
    var tl = window.__timelines && window.__timelines.deck;
    if (!tl || !window.gsap) return setTimeout(boot, 30);

    var island = JSON.parse(
      document.querySelector('script[type="application/hyperframes-slideshow+json"]').textContent
    );
    var slides = island.slides.map(function (s) {
      return { start: s.startTime, end: s.endTime, frags: s.fragments.slice().sort(function (a, b) { return a - b; }) };
    });
    var sections = Array.prototype.slice.call(document.querySelectorAll("#root > section.slide"));
    var bounds = sections.map(function (el) {
      var st = parseFloat(el.getAttribute("data-start"));
      return { el: el, start: st, end: st + parseFloat(el.getAttribute("data-duration")) };
    });

    // ---- escala 1920×1080 para a janela ----
    var html = document.documentElement, body = document.body;
    html.style.cssText = "width:100vw;height:100vh;overflow:hidden;background:#0a1730;";
    body.style.position = "absolute";
    body.style.transformOrigin = "0 0";
    function fit() {
      var s = Math.min(window.innerWidth / W, window.innerHeight / H);
      body.style.transform = "scale(" + s + ")";
      body.style.left = Math.round((window.innerWidth - W * s) / 2) + "px";
      body.style.top = Math.round((window.innerHeight - H * s) / 2) + "px";
    }
    fit();
    window.addEventListener("resize", fit);

    // ---- tempo + visibilidade dos slides (o runtime faz isso no HyperFrames) ----
    function setTime(t) {
      tl.time(t, false);
      for (var i = 0; i < bounds.length; i++) {
        var b = bounds[i], on = t >= b.start && (t < b.end || (i === bounds.length - 1 && t <= b.end));
        b.el.style.visibility = on ? "visible" : "hidden";
      }
    }

    // Transições guiadas pelo relógio real: se um quadro atrasar, a animação salta em vez de desacelerar.
    gsap.ticker.lagSmoothing(0);

    var cur = 0, frag = 0, nav = null;

    function finishNav() {
      // Avançar durante uma transição completa a atual na hora (o onComplete zera `nav`).
      var n = nav;
      nav = null;
      if (n) { n.progress(1); n.kill(); }
    }

    function playSpan(seq) {
      // seq: lista de [de, até]; toca cada trecho em tempo real, em sequência.
      finishNav();
      if (reduce) { var last = seq[seq.length - 1]; setTime(last[1]); return; }
      var proxy = { t: seq[0][0] };
      nav = gsap.timeline({ onComplete: function () { nav = null; } });
      seq.forEach(function (span) {
        nav.set(proxy, { t: span[0] });
        nav.to(proxy, { t: span[1], duration: Math.max(0.01, span[1] - span[0]), ease: "none", onUpdate: function () { setTime(proxy.t); } });
      });
      setTime(seq[0][0]);
    }

    function enter(i, animate) {
      cur = i; frag = 0;
      var s = slides[i];
      if (animate) playSpan([[s.start, s.frags[0]]]);
      else { finishNav(); setTime(s.frags[0]); }
      update();
    }

    function next() {
      var s = slides[cur];
      if (frag < s.frags.length - 1) {
        frag++;
        playSpan([[s.frags[frag - 1], s.frags[frag]]]);
        update();
        return;
      }
      if (cur >= slides.length - 1) return;
      var n = slides[cur + 1];
      cur++; frag = 0;
      // saída curta do slide atual (últimos 0,5 s) + entrada completa do próximo
      playSpan([[s.end - 0.5, s.end - 0.001], [n.start, n.frags[0]]]);
      update();
    }

    function prev() {
      var s = slides[cur];
      if (frag > 0) { frag--; finishNav(); setTime(s.frags[frag]); update(); return; }
      if (cur === 0) return;
      cur--; var p = slides[cur]; frag = p.frags.length - 1;
      finishNav(); setTime(p.frags[frag]); update();
    }

    // ---- controles ----
    var ui = document.createElement("div");
    ui.setAttribute("role", "toolbar");
    ui.setAttribute("aria-label", "Navegação da apresentação");
    ui.style.cssText =
      "position:fixed;right:20px;bottom:18px;z-index:10;display:flex;align-items:center;gap:4px;padding:6px;" +
      "border-radius:28px;background:rgba(11,31,68,.88);color:#fff;font:500 14px Roboto,system-ui,sans-serif;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.3);transition:opacity .4s ease;user-select:none;";
    function btn(label, path, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.title = label;
      b.setAttribute("aria-label", label);
      b.style.cssText = "width:40px;height:40px;border:0;border-radius:20px;background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center;";
      b.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="' + path + '"/></svg>';
      b.addEventListener("mouseenter", function () { b.style.background = "rgba(255,255,255,.14)"; });
      b.addEventListener("mouseleave", function () { b.style.background = "transparent"; });
      b.addEventListener("click", function (e) { e.stopPropagation(); fn(); });
      return b;
    }
    var counter = document.createElement("span");
    counter.style.cssText = "min-width:64px;text-align:center;font-variant-numeric:tabular-nums;";
    counter.setAttribute("aria-live", "polite");
    ui.appendChild(btn("Reiniciar do slide 1 (Home)", "M12 5V2.21c0-.45-.54-.67-.85-.35l-3.8 3.79c-.2.2-.2.51 0 .71l3.79 3.79c.32.31.86.09.86-.36V7c3.73 0 6.68 3.42 5.86 7.29-.47 2.27-2.31 4.1-4.57 4.57-3.57.75-6.75-1.7-7.23-5.01a.998.998 0 0 0-.98-.85c-.6 0-1.08.53-1 1.13.62 4.39 4.8 7.64 9.53 6.72 3.12-.61 5.63-3.12 6.24-6.24C20.84 9.48 16.94 5 12 5z", function () { enter(0, true); }));
    ui.appendChild(btn("Slide anterior (←)", "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z", prev));
    ui.appendChild(counter);
    ui.appendChild(btn("Próximo (→ ou Espaço)", "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z", next));
    ui.appendChild(btn("Tela cheia (F)", "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z", fullscreen));
    html.appendChild(ui);

    var hideTimer = null;
    function poke() {
      ui.style.opacity = "1";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () { ui.style.opacity = "0"; }, 2600);
    }
    window.addEventListener("mousemove", poke);
    poke();

    function update() {
      counter.textContent = cur + 1 + " / " + slides.length;
      try { history.replaceState(null, "", "#" + (cur + 1)); } catch (e) {}
    }
    function fullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (html.requestFullscreen) { var r = html.requestFullscreen(); if (r && r.catch) r.catch(function () {}); }
    }

    window.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") { e.preventDefault(); next(); }
      else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { e.preventDefault(); prev(); }
      else if (k === "Home") { e.preventDefault(); enter(0, true); }
      else if (k === "End") { e.preventDefault(); enter(slides.length - 1, false); }
      else if (k === "f" || k === "F") { fullscreen(); }
    });
    body.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) return; next(); });
    var tx = null;
    window.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
    window.addEventListener("touchend", function (e) {
      if (tx === null) return;
      var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 50) (dx < 0 ? next : prev)();
    });

    var start = parseInt((location.hash || "").replace("#", ""), 10);
    start = isNaN(start) ? 0 : Math.min(Math.max(start - 1, 0), slides.length - 1);
    var go = function () { enter(start, start === 0); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
