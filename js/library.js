/* ============================================================
   My Virtual Library
   - horizontal shelf: books stand as spines, the centered book
     turns to face its cover ("flipping book" trick)
   - right grid of covers navigates the shelf
   - click a book to flip spine -> cover -> back(note)
   ============================================================ */
(function () {
  'use strict';

  var DATA_URL = '/data/library.json';

  var stage  = document.getElementById('lib-stage');
  var shelf  = document.getElementById('lib-shelf');
  var grid   = document.getElementById('lib-grid');
  var ruler  = document.getElementById('lib-ruler');
  var ghost  = document.getElementById('lib-ghost');
  var meta   = document.getElementById('lib-meta');
  var hint   = document.getElementById('lib-hint');
  var chipCount = document.getElementById('chip-count');
  var sortChip  = document.getElementById('sort-chip');
  var sortLabel = document.getElementById('sort-label');

  if (!stage || !shelf || !grid) return;

  var books = [];
  var slots = [];      // .lib-slot elements, index-aligned to `books`
  var cells = [];      // .lib-cell elements
  var active = 0;
  var order = 'shelf'; // shelf | title | year
  var hintHidden = false;

  /* ---------- sizing ---------- */
  function sizeShelf() {
    var stageH = stage.clientHeight;
    var coverH = Math.max(190, Math.min(360, Math.round(stageH * 0.60)));
    var coverW = Math.round(coverH * 0.66);
    var spineW = Math.max(34, Math.round(coverH * 0.13));
    var root = document.documentElement;
    root.style.setProperty('--cover-h', coverH + 'px');
    root.style.setProperty('--cover-w', coverW + 'px');
    root.style.setProperty('--spine-w', spineW + 'px');
  }

  /* ---------- data ---------- */
  function load() {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        books = Array.isArray(list) ? list : [];
        if (!books.length) return;
        sizeShelf();
        applyOrder();
        buildRuler();
        render();
        setActive(0, true);
      })
      .catch(function () {
        meta.innerHTML = '<div class="lm-title">Could not load the library.</div>';
      });
  }

  function applyOrder() {
    if (order === 'title') {
      books.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else if (order === 'year') {
      books.sort(function (a, b) { return (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0); });
    }
    // 'shelf' = original JSON order (already loaded)
  }

  /* ---------- rendering ---------- */
  function coverInner(b, cls) {
    if (b.cover) {
      return '<img src="' + b.cover + '" alt="' + escapeAttr(b.title) + '">';
    }
    return '' +
      '<div class="' + (cls === 'cell' ? 'cc-top' : 'bc-top') + '">' + (b.year || '') + '</div>' +
      '<div class="' + (cls === 'cell' ? 'cc-title' : 'bc-title') + '">' + escapeHtml(b.title) + '</div>' +
      '<div class="' + (cls === 'cell' ? 'cc-author' : 'bc-author') + '">' + escapeHtml(b.author || '') + '</div>';
  }

  function render() {
    // ---- shelf ----
    shelf.innerHTML = '';
    slots = [];
    books.forEach(function (b, i) {
      var slot = document.createElement('div');
      slot.className = 'lib-slot';
      slot.setAttribute('role', 'option');
      slot.dataset.i = i;

      var book = document.createElement('div');
      book.className = 'book3d';
      book.style.setProperty('--cv-bg', b.bg || '#e8451f');
      book.style.setProperty('--cv-fg', b.fg || '#ffe9df');
      book.style.setProperty('--sp-bg', b.spine || b.bg || '#c73a12');

      book.innerHTML = '' +
        '<div class="book-face book-cover">' + coverInner(b, 'cover') + '</div>' +
        '<div class="book-face book-spine"><span class="bs-text">' + escapeHtml(b.title) + '</span></div>' +
        '<div class="book-face book-back">' +
          '<div class="bb-year">' + (b.year || '') + '</div>' +
          '<div class="bb-note">' + escapeHtml(b.note || '') + '</div>' +
          '<div class="bb-flip">click to close ↺</div>' +
        '</div>';

      slot.appendChild(book);
      slot.addEventListener('click', function () { onBookClick(i); });
      shelf.appendChild(slot);
      slots.push(slot);
    });

    // ---- grid ----
    grid.innerHTML = '';
    cells = [];
    books.forEach(function (b, i) {
      var cell = document.createElement('div');
      cell.className = 'lib-cell';
      cell.dataset.i = i;
      cell.title = b.title + ' — ' + (b.author || '');
      var cover = document.createElement('div');
      cover.className = 'cell-cover';
      cover.style.setProperty('--cv-bg', b.bg || '#e8451f');
      cover.style.setProperty('--cv-fg', b.fg || '#ffe9df');
      cover.innerHTML = coverInner(b, 'cell');
      cell.appendChild(cover);
      cell.addEventListener('click', function () { setActive(i); });
      grid.appendChild(cell);
      cells.push(cell);
    });

    if (chipCount) chipCount.textContent = books.length + ' books';
  }

  function buildRuler() {
    if (!ruler) return;
    // decorative numeric ticks (specimen-tool vibe)
    var marks = [1000, 700, 500, 325, 0];
    var html = '';
    marks.forEach(function (m, idx) {
      var top = 12 + idx * 20;
      html += '<span class="lib-rtick" style="top:' + top + '%">' + m + '</span>';
    });
    ruler.innerHTML = html;
  }

  /* ---------- active state + centering ---------- */
  function setActive(i, instant) {
    if (!books.length) return;
    i = Math.max(0, Math.min(books.length - 1, i));
    active = i;

    slots.forEach(function (s, idx) {
      s.classList.toggle('active', idx === i);
      if (idx !== i) s.classList.remove('flipped');
    });
    cells.forEach(function (c, idx) {
      c.classList.toggle('active', idx === i);
    });

    centerActive(instant);
    updateMeta();
    ensureCellVisible(i);
    hideHintOnce();
  }

  function centerActive(instant) {
    var cs = getComputedStyle(document.documentElement);
    var spineW = parseFloat(cs.getPropertyValue('--spine-w')) || 40;
    var coverW = parseFloat(cs.getPropertyValue('--cover-w')) || 200;
    var gap = parseFloat(cs.getPropertyValue('--slot-gap')) || 0;
    var focusX = Math.max(140, stage.clientWidth * 0.42);
    var offsetBefore = active * (spineW + gap);    // spines + gaps before the active book
    var target = focusX - (offsetBefore + coverW / 2);

    if (instant) {
      var prev = shelf.style.transition;
      shelf.style.transition = 'none';
      shelf.style.transform = 'translateX(' + target + 'px)';
      // force reflow, then restore
      void shelf.offsetWidth;
      shelf.style.transition = prev || '';
    } else {
      shelf.style.transition = 'transform .55s var(--ease)';
      shelf.style.transform = 'translateX(' + target + 'px)';
    }
  }

  function updateMeta() {
    var b = books[active];
    if (!b) return;
    meta.innerHTML =
      '<div class="lm-title">' + escapeHtml(b.title) + '</div>' +
      '<div class="lm-sub">' + escapeHtml(b.author || '') + ' · ' + (b.year || '') + '</div>';
    if (ghost) ghost.textContent = firstWords(b.title, 2);
  }

  function ensureCellVisible(i) {
    var c = cells[i];
    if (!c) return;
    var gr = grid.getBoundingClientRect();
    var cr = c.getBoundingClientRect();
    if (cr.top < gr.top || cr.bottom > gr.bottom) {
      c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* ---------- clicking a book: flip through spine->cover->back ---------- */
  function onBookClick(i) {
    if (i !== active) { setActive(i); return; }
    slots[i].classList.toggle('flipped');
  }

  /* ---------- wheel navigation ---------- */
  var wheelLock = false;
  function onWheel(e) {
    e.preventDefault();
    if (wheelLock) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 6) return;
    setActive(active + (d > 0 ? 1 : -1));
    wheelLock = true;
    setTimeout(function () { wheelLock = false; }, 220);
  }

  /* ---------- drag navigation (index-stepping) ---------- */
  var dragging = false, startX = 0, accX = 0, moved = false;
  function onDown(e) {
    dragging = true; moved = false;
    startX = (e.touches ? e.touches[0].clientX : e.clientX);
    accX = 0;
    stage.classList.add('dragging');
  }
  function onMove(e) {
    if (!dragging) return;
    var x = (e.touches ? e.touches[0].clientX : e.clientX);
    var dx = x - startX;
    accX += (x - (startX + accX));
    var step = 90; // px per book
    if (Math.abs(dx) > step) {
      var n = Math.round(dx / step);
      setActive(active - n);
      startX = x;
      moved = true;
    }
  }
  function onUp() {
    if (dragging && moved) suppressNextClick();
    dragging = false;
    stage.classList.remove('dragging');
  }

  var swallowClick = false;
  function suppressNextClick() {
    swallowClick = true;
    setTimeout(function () { swallowClick = false; }, 60);
  }
  shelf.addEventListener('click', function (e) {
    if (swallowClick) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBookClick(active); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(books.length - 1); }
  }

  /* ---------- sort chip ---------- */
  var orders = ['shelf', 'title', 'year'];
  var orderNames = { shelf: 'Shelf order', title: 'By title', year: 'By year' };
  if (sortChip) {
    sortChip.addEventListener('click', function () {
      var idx = (orders.indexOf(order) + 1) % orders.length;
      order = orders[idx];
      if (sortLabel) sortLabel.textContent = orderNames[order];
      var currentId = books[active] ? books[active].id : null;
      applyOrder();
      render();
      var ni = 0;
      if (currentId != null) {
        for (var k = 0; k < books.length; k++) { if (books[k].id === currentId) { ni = k; break; } }
      }
      setActive(ni, true);
    });
  }

  /* ---------- helpers ---------- */
  function hideHintOnce() {
    if (hintHidden || !hint) return;
    hintHidden = true;
    setTimeout(function () { hint.classList.add('gone'); }, 1600);
  }
  function firstWords(s, n) {
    return String(s || '').split(/\s+/).slice(0, n).join(' ');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  var resizeT;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { sizeShelf(); centerActive(true); }, 120);
  }

  /* ---------- wire up ---------- */
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  stage.addEventListener('touchstart', onDown, { passive: true });
  stage.addEventListener('touchmove', onMove, { passive: true });
  stage.addEventListener('touchend', onUp);
  shelf.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  load();
})();
