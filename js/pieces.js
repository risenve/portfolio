/* ============================================================
   PIECES / VIRTUAL MUSEUM
   Infinite pan + zoom canvas of grey placeholder pieces.
   ============================================================ */
(function () {
  'use strict';

  var viewport = document.getElementById('museum');
  var world    = document.getElementById('museum-world');
  if (!viewport || !world) return;

  var caption  = document.getElementById('museum-caption');
  var hint     = document.getElementById('museum-hint');
  var zoomPct  = document.getElementById('museum-zoom-pct');
  var barH     = document.getElementById('mmbar-h');
  var barV     = document.getElementById('mmbar-v');
  var thumbH   = document.getElementById('mmthumb-h');
  var thumbV   = document.getElementById('mmthumb-v');
  var contentBounds = null;   // world-space bbox of all pieces (+ padding)

  // ── view transform state ──
  // current = what's rendered now; target = where we're easing toward.
  var tx = 0, ty = 0, scale = 1;
  var targetTx = 0, targetTy = 0, targetScale = 1;
  var MIN_SCALE = 0.25, MAX_SCALE = 5;
  var animId = null;

  var items = [];   // data + layout {el, x, y, w, h, data}
  var built = false;

  function applyTransform() {
    world.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    if (zoomPct) zoomPct.textContent = Math.round(scale * 100) + '%';
    updateScrollbars();
  }

  // Instantly set the transform (used by pan, pinch, centering) — no easing.
  function setTransform(s, x, y) {
    scale = targetScale = s;
    tx = targetTx = x;
    ty = targetTy = y;
    if (animId != null) { cancelAnimationFrame(animId); animId = null; }
    applyTransform();
  }

  // Ease current → target each frame (used by wheel + zoom buttons).
  function tick() {
    var k = 0.2;
    scale += (targetScale - scale) * k;
    tx += (targetTx - tx) * k;
    ty += (targetTy - ty) * k;
    if (Math.abs(targetScale - scale) < 0.0006 &&
        Math.abs(targetTx - tx) < 0.3 && Math.abs(targetTy - ty) < 0.3) {
      scale = targetScale; tx = targetTx; ty = targetTy;
      applyTransform();
      animId = null;
      return;
    }
    applyTransform();
    animId = requestAnimationFrame(tick);
  }
  function startAnim() { if (animId == null) animId = requestAnimationFrame(tick); }

  // ── deterministic-ish pseudo random for stable layout per id ──
  function rand(seed) {
    var x = Math.sin(seed * 99.13 + 0.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── phyllotaxis scatter layout (organic, even, gappy) ──
  function layout(data) {
    var GOLDEN = 2.399963229728653; // rad
    var SPACING = 240;
    var frag = document.createDocumentFragment();

    data.forEach(function (d, i) {
      var r = SPACING * Math.sqrt(i + 0.6);
      var a = i * GOLDEN;
      var jx = (rand(d.id) - 0.5) * 140;
      var jy = (rand(d.id + 7) - 0.5) * 140;

      // varied size; real photos keep their own aspect, placeholders get a random one
      var base = 150 + rand(d.id + 3) * 170;          // 150–320
      var aspects = [0.72, 1, 1.35, 0.85, 1.55];
      var asp = (d.w && d.h) ? (d.w / d.h) : aspects[Math.floor(rand(d.id + 5) * aspects.length)];
      var w = Math.round(base);
      var h = Math.round(base / asp);

      var x = Math.round(r * Math.cos(a) + jx - w / 2);
      var y = Math.round(r * Math.sin(a) + jy - h / 2);

      var el = document.createElement('div');
      el.className = 'piece';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.dataset.index = i;
      if (d.img) {
        var im = document.createElement('img');
        im.src = d.img; im.alt = d.title || ''; im.loading = 'lazy';
        el.appendChild(im);
      }
      frag.appendChild(el);

      items.push({ el: el, x: x, y: y, w: w, h: h, data: d });
    });

    world.appendChild(frag);
    built = true;

    // bounding box of everything (+ padding) — drives the pan pills
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(function (it) {
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h);
    });
    if (isFinite(minX)) {
      var pad = 700;
      contentBounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    } else {
      contentBounds = null;
    }
  }

  // Viewport size helpers. Some engines mis-measure a fixed element's own
  // box, so derive size from the window and the element's top offset instead.
  function vpTop() { return viewport.getBoundingClientRect().top; }
  function vpW() { return window.innerWidth; }
  function vpH() { return window.innerHeight - vpTop(); }

  var interacted = false;   // becomes true on first pan/zoom

  // ── center the plane origin in the viewport at start ──
  function centerView() {
    setTransform(1, vpW() / 2, vpH() / 2);
  }

  // Center once the viewport actually has a size (it can be 0 for a frame or
  // two right after load), retrying across a few frames.
  function centerWhenReady(attempt) {
    if (vpW() > 0 && vpH() > 0) { centerView(); return; }
    if (attempt < 60) requestAnimationFrame(function () { centerWhenReady(attempt + 1); });
  }

  /* ========================================================
     PAN + CLICK (pointer events, unified mouse/touch)
     ======================================================== */
  var pointers = new Map();
  var isPanning = false;
  var moved = 0;
  var last = { x: 0, y: 0 };
  var pinchStart = null;

  viewport.addEventListener('pointerdown', function (e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId);

    if (pointers.size === 1) {
      isPanning = true;
      interacted = true;
      moved = 0;
      last.x = e.clientX; last.y = e.clientY;
      viewport.classList.add('is-panning');
      hideCaption();
    } else if (pointers.size === 2) {
      isPanning = false;
      pinchStart = pinchState();
    }
  });

  viewport.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinchStart) {
      var now = pinchState();
      var ratio = now.dist / pinchStart.dist;
      var ns = clampScale(pinchStart.scale * ratio);
      var rect = viewport.getBoundingClientRect();
      var px = now.cx - rect.left, py = now.cy - rect.top;
      // keep the world point under the pinch centre fixed
      var wx = (px - pinchStart.tx) / pinchStart.scale;
      var wy = (py - pinchStart.ty) / pinchStart.scale;
      setTransform(ns, px - wx * ns, py - wy * ns);
      hideCaption();
      return;
    }

    if (isPanning && pointers.size === 1) {
      var dx = e.clientX - last.x;
      var dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      setTransform(scale, tx + dx, ty + dy);
      last.x = e.clientX; last.y = e.clientY;
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;

    // click (not a drag) on a piece → open.
    // Pointer capture makes e.target the viewport, so hit-test by point instead.
    if (pointers.size === 1 && moved < 6) {
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var pc = hit && hit.closest ? hit.closest('.piece') : null;
      if (pc) openModal(parseInt(pc.dataset.index, 10));
    }

    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      isPanning = false;
      viewport.classList.remove('is-panning');
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  function pinchState() {
    var pts = Array.from(pointers.values());
    var dx = pts[0].x - pts[1].x;
    var dy = pts[0].y - pts[1].y;
    return {
      dist: Math.hypot(dx, dy) || 1,
      cx: (pts[0].x + pts[1].x) / 2,
      cy: (pts[0].y + pts[1].y) / 2,
      scale: scale, tx: tx, ty: ty
    };
  }

  /* ========================================================
     ZOOM (wheel + buttons + pinch), anchored to a point
     ======================================================== */
  function clampScale(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); }

  // Eased zoom toward a client point. Anchors in TARGET space so repeated
  // wheel ticks accumulate around the same point while the view eases in.
  function zoomTo(nextScale, clientX, clientY) {
    var rect = viewport.getBoundingClientRect();
    var px = clientX - rect.left;
    var py = clientY - rect.top;

    // world point under the cursor stays fixed
    var wx = (px - targetTx) / targetScale;
    var wy = (py - targetTy) / targetScale;

    targetScale = nextScale;
    targetTx = px - wx * targetScale;
    targetTy = py - wy * targetScale;
    startAnim();
    hideCaption();
    fadeHint();
  }

  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    interacted = true;
    // two-finger horizontal swipe (or Shift+wheel) → pan left/right;
    // pinch (Ctrl/⌘+wheel) or plain vertical wheel → zoom
    if (!e.ctrlKey && !e.metaKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
      var dx = (e.shiftKey && !e.deltaX) ? e.deltaY : e.deltaX;
      setTransform(scale, tx - dx, ty);
      hideCaption(); fadeHint();
      return;
    }
    var factor = Math.exp(-e.deltaY * 0.0028);   // stronger per notch
    zoomTo(clampScale(targetScale * factor), e.clientX, e.clientY);
  }, { passive: false });

  function zoomButton(dir) {
    var rect = viewport.getBoundingClientRect();
    zoomTo(clampScale(targetScale * (dir > 0 ? 1.45 : 0.69)),
           rect.left + vpW() / 2,
           rect.top + vpH() / 2);
  }

  /* ========================================================
     HOVER CAPTION
     ======================================================== */
  viewport.addEventListener('pointerover', function (e) {
    if (isPanning || pointers.size) return;
    var pc = e.target.closest ? e.target.closest('.piece') : null;
    if (!pc) return;
    var d = items[parseInt(pc.dataset.index, 10)].data;
    showCaption(pc, d);
  });
  viewport.addEventListener('pointerout', function (e) {
    var pc = e.target.closest ? e.target.closest('.piece') : null;
    if (pc) hideCaption();
  });

  function showCaption(pc, d) {
    var r = pc.getBoundingClientRect();
    caption.innerHTML = '<span class="cap-title"></span>' +
                        (d.year ? '<span class="cap-year"></span>' : '');
    caption.querySelector('.cap-title').textContent = d.title;
    if (d.year) caption.querySelector('.cap-year').textContent = d.year;
    caption.style.left = r.left + 'px';
    caption.style.top = (r.top - 34) + 'px';
    caption.classList.add('is-visible');
  }
  function hideCaption() { caption.classList.remove('is-visible'); }

  /* ========================================================
     HINT auto-fade
     ======================================================== */
  var hintFaded = false;
  function fadeHint() {
    if (hintFaded || !hint) return;
    hintFaded = true;
    hint.classList.add('is-faded');
  }
  viewport.addEventListener('pointerdown', fadeHint, { once: true });

  /* ========================================================
     MODAL / POPUP
     ======================================================== */
  var pm       = document.getElementById('pm');
  var pmMedia  = document.getElementById('pm-media');
  var pmTitle  = document.getElementById('pm-title');
  var pmStory  = document.getElementById('pm-story');
  var pmYear   = document.getElementById('pm-year');
  var pmLink   = document.getElementById('pm-link');
  var current  = -1;

  function openModal(i) {
    current = i;
    renderModal();
    pm.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    hideCaption();
  }
  function closeModal() {
    pm.classList.remove('is-open');
    current = -1;
  }
  function step(dir) {
    if (current < 0) return;
    current = (current + dir + items.length) % items.length;
    renderModal();
  }
  function renderModal() {
    var d = items[current].data;
    pmTitle.textContent = d.title;
    pmStory.textContent = d.story || '';
    pmYear.textContent = d.year || '';
    if (d.link) { pmLink.href = d.link; pmLink.hidden = false; }
    else { pmLink.hidden = true; pmLink.removeAttribute('href'); }
    // media keeps the piece's aspect ratio; real photo when present
    var it = items[current];
    pmMedia.style.aspectRatio = it.w + ' / ' + it.h;
    pmMedia.innerHTML = d.img ? '<img src="' + d.img + '" alt="' + (d.title || '') + '">' : '';
  }

  document.getElementById('pm-close').addEventListener('click', closeModal);
  document.getElementById('pm-prev').addEventListener('click', function () { step(-1); });
  document.getElementById('pm-next').addEventListener('click', function () { step(1); });
  pm.addEventListener('click', function (e) {
    // click on the dim backdrop (not the content) closes
    if (e.target === pm) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (current < 0) return;
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  document.getElementById('zoom-in').addEventListener('click', function () { zoomButton(1); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomButton(-1); });

  window.addEventListener('resize', function () {
    if (!interacted) centerView();
    else updateScrollbars();
  });

  /* ========================================================
     PAN PILLS (iPhone-style minimap scrollbars)
     Thumb size/position = the visible window inside the content
     bbox; drag a thumb to pan the canvas along that axis.
     ======================================================== */
  function updateScrollbars() {
    if (!contentBounds || !barH || !barV) return;
    var rx = Math.max(1, contentBounds.maxX - contentBounds.minX);
    var ry = Math.max(1, contentBounds.maxY - contentBounds.minY);

    // visible world-space window
    var viewL = (0 - tx) / scale, viewR = (vpW() - tx) / scale;
    var viewT = (0 - ty) / scale, viewB = (vpH() - ty) / scale;

    var trackW = barH.clientWidth;
    var l = clamp01((viewL - contentBounds.minX) / rx) * trackW;
    var r = clamp01((viewR - contentBounds.minX) / rx) * trackW;
    thumbH.style.left = l + 'px';
    thumbH.style.width = Math.max(32, r - l) + 'px';

    var trackH = barV.clientHeight;
    var t = clamp01((viewT - contentBounds.minY) / ry) * trackH;
    var b = clamp01((viewB - contentBounds.minY) / ry) * trackH;
    thumbV.style.top = t + 'px';
    thumbV.style.height = Math.max(32, b - t) + 'px';
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function bindThumb(thumb, axis) {
    if (!thumb) return;
    thumb.addEventListener('pointerdown', function (e) {
      if (!contentBounds) return;
      e.preventDefault(); e.stopPropagation();
      interacted = true;
      try { thumb.setPointerCapture(e.pointerId); } catch (err) {}
      var startPx = axis === 'x' ? e.clientX : e.clientY;
      var startTx = tx, startTy = ty;
      var range = axis === 'x' ? (contentBounds.maxX - contentBounds.minX)
                               : (contentBounds.maxY - contentBounds.minY);
      var trackLen = axis === 'x' ? barH.clientWidth : barV.clientHeight;

      function move(ev) {
        var cur = axis === 'x' ? ev.clientX : ev.clientY;
        var dWorld = ((cur - startPx) / trackLen) * range;
        if (axis === 'x') setTransform(scale, startTx - dWorld * scale, ty);
        else setTransform(scale, tx, startTy - dWorld * scale);
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
  bindThumb(thumbH, 'x');
  bindThumb(thumbV, 'y');

  /* ========================================================
     AUTO-HIDING TOP NAV — shows near the top, hides when idle
     ======================================================== */
  (function initNavAutoHide() {
    var mnav = document.getElementById('museum-nav');
    if (!mnav) return;
    var hideT = null, navHover = false;
    var TOP_ZONE = 92, IDLE = 2200;

    function overlayOpen() { return document.body.classList.contains('overlay-open'); }
    function scheduleHide() {
      clearTimeout(hideT);
      hideT = setTimeout(function () {
        if (!navHover && !overlayOpen()) mnav.classList.add('nav-hidden');
      }, IDLE);
    }
    function showNav() { mnav.classList.remove('nav-hidden'); scheduleHide(); }

    mnav.addEventListener('mouseenter', function () { navHover = true; clearTimeout(hideT); mnav.classList.remove('nav-hidden'); });
    mnav.addEventListener('mouseleave', function () { navHover = false; scheduleHide(); });
    window.addEventListener('pointermove', function (e) { if (e.clientY <= TOP_ZONE) showNav(); });
    window.addEventListener('pointerdown', function (e) { if (e.clientY <= TOP_ZONE) showNav(); });

    showNav();   // visible on load, then auto-hides
  })();

  /* ========================================================
     BOOT
     ======================================================== */
  fetch('/data/pieces.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      layout(data);
      centerWhenReady(0);
    })
    .catch(function (err) {
      console.error('pieces: failed to load data', err);
    });
})();
