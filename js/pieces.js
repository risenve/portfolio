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
  var filterBar = document.getElementById('museum-filter');
  var contentBounds = null;   // world-space bbox of all pieces (+ padding)
  var activeFilter = null;    // current collection filter (null = All)
  var animClsT = null;

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
      // real photos keep their own aspect, placeholders get a random one
      var aspects = [0.72, 1, 1.35, 0.85, 1.55];
      var asp = (d.w && d.h) ? (d.w / d.h) : aspects[Math.floor(rand(d.id + 5) * aspects.length)];

      // size: saved `size` (base width) else a varied default
      var base = (typeof d.size === 'number') ? d.size : (150 + rand(d.id + 3) * 170);
      var w = Math.round(base);
      var h = Math.round(base / asp);

      // position: saved px/py (top-left) else auto phyllotaxis scatter
      var x, y;
      if (typeof d.px === 'number' && typeof d.py === 'number') {
        x = Math.round(d.px); y = Math.round(d.py);
      } else {
        var r = SPACING * Math.sqrt(i + 0.6), a = i * GOLDEN;
        var jx = (rand(d.id) - 0.5) * 140, jy = (rand(d.id + 7) - 0.5) * 140;
        x = Math.round(r * Math.cos(a) + jx - w / 2);
        y = Math.round(r * Math.sin(a) + jy - h / 2);
      }

      var el = document.createElement('div');
      el.className = 'piece';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.dataset.index = i;
      var thumbSrc = d.img || (d.imgs && d.imgs[0]);
      if (thumbSrc) {
        var im = document.createElement('img');
        im.src = thumbSrc; im.alt = d.title || ''; im.loading = 'lazy';
        el.appendChild(im);
      }
      var grip = document.createElement('div');
      grip.className = 'piece-grip';
      el.appendChild(grip);
      frag.appendChild(el);

      items.push({ el: el, x: x, y: y, w: w, h: h, aspect: asp,
                   ox: x, oy: y, ow: w, oh: h, data: d });
    });

    world.appendChild(frag);
    built = true;
    computeBounds();
    buildFilterChips();
  }

  // bounding box of everything (+ padding) — drives the pan pills
  function computeBounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(function (it) {
      if (it.el.style.opacity === '0') return;   // skip filtered-out pieces
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
  var moved = 0;
  var last = { x: 0, y: 0 };
  var pinchStart = null;

  // single-pointer gesture: 'pan' | 'piece' (move) | 'resize'
  var dragMode = null, dragItem = null;
  var downX = 0, downY = 0, startX = 0, startY = 0, startW = 0, startH = 0;
  var zTop = 0;

  function bringToFront(it) { it.el.style.zIndex = ++zTop; }

  viewport.addEventListener('pointerdown', function (e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { viewport.setPointerCapture(e.pointerId); } catch (err) {}

    if (pointers.size === 1) {
      interacted = true;
      moved = 0;
      downX = last.x = e.clientX; downY = last.y = e.clientY;
      world.classList.remove('pieces-animating');   // keep drags snappy
      hideCaption();

      // what did we grab? a resize grip, a piece, or empty canvas
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var grip = hit && hit.closest ? hit.closest('.piece-grip') : null;
      var pieceEl = hit && hit.closest ? hit.closest('.piece') : null;
      if (grip && pieceEl) {
        dragMode = 'resize'; dragItem = items[+pieceEl.dataset.index];
        startW = dragItem.w; startH = dragItem.h; bringToFront(dragItem);
      } else if (pieceEl) {
        dragMode = 'piece'; dragItem = items[+pieceEl.dataset.index];
        startX = dragItem.x; startY = dragItem.y; bringToFront(dragItem);
      } else {
        dragMode = 'pan'; viewport.classList.add('is-panning');
      }
    } else if (pointers.size === 2) {
      dragMode = null; dragItem = null;
      viewport.classList.remove('is-panning');
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

    if (pointers.size !== 1) return;
    var dx = e.clientX - last.x, dy = e.clientY - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    last.x = e.clientX; last.y = e.clientY;

    if (dragMode === 'pan') {
      setTransform(scale, tx + dx, ty + dy);
    } else if (dragMode === 'piece' && dragItem) {
      dragItem.x = startX + (e.clientX - downX) / scale;
      dragItem.y = startY + (e.clientY - downY) / scale;
      dragItem.el.style.left = dragItem.x + 'px';
      dragItem.el.style.top = dragItem.y + 'px';
    } else if (dragMode === 'resize' && dragItem) {
      var nw = Math.max(40, startW + (e.clientX - downX) / scale);
      dragItem.w = nw; dragItem.h = nw / dragItem.aspect;
      dragItem.el.style.width = dragItem.w + 'px';
      dragItem.el.style.height = dragItem.h + 'px';
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;

    // a click (no real drag) on a piece opens it
    if (pointers.size === 1 && moved < 6 && dragMode === 'piece' && dragItem) {
      openModal(parseInt(dragItem.el.dataset.index, 10));
    }
    // moving/resizing changes the content extent → refresh the pan pills
    if (dragMode === 'piece' || dragMode === 'resize') computeBounds();

    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      dragMode = null; dragItem = null;
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
  var pmPdf    = document.getElementById('pm-pdf');
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
    if (d.pdf) { pmPdf.href = d.pdf; pmPdf.hidden = false; }
    else { pmPdf.hidden = true; pmPdf.removeAttribute('href'); }

    // media: multi-image gallery (scroll) or a single aspect-fit photo
    var it = items[current];
    var imgs = (d.imgs && d.imgs.length) ? d.imgs : (d.img ? [d.img] : []);
    if (imgs.length > 1) {
      pmMedia.className = 'pm-media pm-gallery';
      pmMedia.style.aspectRatio = '';
      pmMedia.innerHTML = imgs.map(function (s) {
        return '<img src="' + s + '" alt="' + (d.title || '') + '">';
      }).join('');
      pmMedia.scrollTop = 0;
    } else {
      pmMedia.className = 'pm-media';
      pmMedia.style.aspectRatio = '';   // let the photo keep its own proportions
      pmMedia.innerHTML = imgs.length ? '<img src="' + imgs[0] + '" alt="' + (d.title || '') + '">' : '';
    }
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
     FILTER + CLUSTER
     Selecting a collection gathers its pieces into a cluster
     (graph-vertex style) and fades the rest; "All" restores.
     ======================================================== */
  var filterMenu = document.getElementById('filter-menu');
  var filterBtn  = document.getElementById('filter-btn');

  function buildFilterChips() {
    if (!filterMenu) return;
    var colls = [];
    items.forEach(function (it) {
      var c = it.data.collection;
      if (c && colls.indexOf(c) === -1) colls.push(c);
    });
    colls.sort();
    var html = '<button class="mf-chip is-active" data-coll="">All</button>';
    colls.forEach(function (c) {
      html += '<button class="mf-chip" data-coll="' + c.replace(/"/g, '&quot;') + '">' + c + '</button>';
    });
    filterMenu.innerHTML = html;
  }
  function closeFilterMenu() {
    if (!filterBar) return;
    filterBar.classList.remove('open');
    if (filterBtn) filterBtn.setAttribute('aria-expanded', 'false');
  }
  if (filterBtn) {
    filterBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = filterBar.classList.toggle('open');
      filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  if (filterMenu) {
    filterMenu.addEventListener('click', function (e) {
      var b = e.target.closest('.mf-chip'); if (!b) return;
      applyFilter(b.dataset.coll || null);
      closeFilterMenu();   // close so the fly-to view is unobstructed
    });
  }
  document.addEventListener('pointerdown', function (e) {
    if (filterBar && filterBar.classList.contains('open') && !filterBar.contains(e.target)) closeFilterMenu();
  });

  function styleItem(it, op) {
    it.el.style.left = it.x + 'px'; it.el.style.top = it.y + 'px';
    it.el.style.width = it.w + 'px'; it.el.style.height = it.h + 'px';
    it.el.style.opacity = op; it.el.style.pointerEvents = '';
  }

  // frame a world-space bbox in the viewport (eased via the canvas tick)
  function fitToBounds(b, padFactor) {
    var bw = b.maxX - b.minX, bh = b.maxY - b.minY;
    if (bw <= 0 || bh <= 0) return;
    var s = clampScale(Math.min(vpW() / bw, vpH() / bh) * (padFactor || 0.82));
    var cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    targetScale = s;
    targetTx = vpW() / 2 - cx * s;
    targetTy = vpH() / 2 - cy * s;
    startAnim();
  }

  function bboxOf(arr) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    arr.forEach(function (it) {
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // Selecting a collection gathers ONLY that group into a cluster (around the
  // centroid of its home positions); everything else stays where it is. The
  // camera then flies to the group, taking the visitor straight to it.
  function applyFilter(coll) {
    activeFilter = coll || null;
    interacted = true;
    world.classList.add('pieces-animating');
    clearTimeout(animClsT);
    animClsT = setTimeout(function () { world.classList.remove('pieces-animating'); }, 950);

    // reset everyone to their scatter home + clear highlight ("leave the rest as is")
    items.forEach(function (it) {
      it.x = it.ox; it.y = it.oy; it.w = it.ow; it.h = it.oh;
      styleItem(it, '1'); it.el.classList.remove('mf-focus');
    });
    if (filterBtn) filterBtn.textContent = activeFilter || 'Filter';

    if (!activeFilter) {
      var b = bboxOf(items);
      fitToBounds({ minX: b.minX - 200, minY: b.minY - 200, maxX: b.maxX + 200, maxY: b.maxY + 200 }, 0.9);
    } else {
      var group = items.filter(function (it) { return (it.data.collection || '') === activeFilter; });
      if (group.length) {
        var cx = 0, cy = 0;
        group.forEach(function (it) { cx += it.ox + it.ow / 2; cy += it.oy + it.oh / 2; });
        cx /= group.length; cy /= group.length;
        var GA = 2.399963229728653;
        var avg = group.reduce(function (a, it) { return a + Math.max(it.w, it.h); }, 0) / group.length;
        var spacing = Math.max(70, avg * 0.6);
        var clusterR = 0;
        group.forEach(function (it, i) {
          var r = spacing * Math.sqrt(i + 0.5), a = i * GA;
          it.x = Math.round(cx + r * Math.cos(a) - it.w / 2);
          it.y = Math.round(cy + r * Math.sin(a) - it.h / 2);
          styleItem(it, '1'); it.el.classList.add('mf-focus');
          clusterR = Math.max(clusterR, r + Math.max(it.w, it.h) / 2);
        });

        // push everyone else radially outward so the group stands clear of the rest
        var gap = clusterR + 360;
        items.forEach(function (it, i) {
          if ((it.data.collection || '') === activeFilter) return;
          var pcx = it.ox + it.ow / 2, pcy = it.oy + it.oh / 2;
          var dx = pcx - cx, dy = pcy - cy, dist = Math.hypot(dx, dy);
          if (dist < 1) { var ang = i * GA; dx = Math.cos(ang); dy = Math.sin(ang); dist = 1; }
          if (dist < gap) {
            var f = gap / dist;
            it.x = Math.round(cx + dx * f - it.w / 2);
            it.y = Math.round(cy + dy * f - it.h / 2);
            styleItem(it, '1');
          }
        });

        var bb = bboxOf(group);
        fitToBounds({ minX: bb.minX - 160, minY: bb.minY - 160, maxX: bb.maxX + 160, maxY: bb.maxY + 160 }, 0.72);
      }
    }
    computeBounds(); updateScrollbars();

    if (filterMenu) {
      Array.prototype.forEach.call(filterMenu.querySelectorAll('.mf-chip'), function (c) {
        c.classList.toggle('is-active', (c.dataset.coll || '') === (activeFilter || ''));
      });
    }
  }

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
     CUSTOM CURSOR states (the site's "+" reacts on the canvas)
     ======================================================== */
  (function initCursorStates() {
    if (!window.matchMedia || !matchMedia('(pointer:fine)').matches) return;
    var cur = document.querySelector('.cursor-x');
    if (!cur) return;
    var UI = '.mf-chip, button, a, .museum-contact, .pm-link, .mmthumb, .piece-grip, #filter-btn';
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var t = e.target;
      var onPiece = t && t.closest && !!t.closest('.piece');
      var onUI = t && t.closest && !!t.closest(UI);
      cur.classList.toggle('over-piece', onPiece && !onUI);
    });
    window.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'touch') cur.classList.add('dragging'); });
    window.addEventListener('pointerup', function () { cur.classList.remove('dragging'); });
    window.addEventListener('pointercancel', function () { cur.classList.remove('dragging'); });
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
