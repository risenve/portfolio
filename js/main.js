const PROJECTS = [
  {
    id: 1, slug: 'eburet',
    title: 'Eburet',
    categories: ['ui-ux'],
    type: 'UI/UX Design',
    role: 'UI/UX Designer',
    year: '2024',
    cover: 'images/eburet/Eburet 02.png',
    imgs: ['images/eburet/Eburet 02.png','images/eburet/проект.png','images/eburet/мобилки.png','images/eburet/проект-1.png'],
    href: 'project-eburet.html'
  },
  {
    id: 2, slug: 'match',
    title: 'Match',
    categories: ['art-direction', 'graphics-ai'],
    type: 'Art Direction',
    role: 'Art Director',
    year: '2024',
    cover: 'images/match/photo 1.png',
    imgs: ['images/match/photo 1.png','images/match/photo 2.png','images/match/photo 3.png','images/match/photo 4.png'],
    href: 'project-match.html'
  },
  {
    id: 3, slug: 'skazpokrayu',
    title: 'Skaz po krayu',
    categories: ['art-direction', 'brand-design'],
    type: 'Art Direction',
    role: 'Art Director',
    year: '2024',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 4, slug: 'premiumization',
    title: 'Premiumization',
    categories: ['art-direction'],
    type: 'Art Direction',
    role: 'Art Director',
    year: '2023',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 5, slug: 'rebank',
    title: 'ReBank',
    categories: ['ui-ux', 'brand-design'],
    type: 'Brand + UI/UX',
    role: 'Brand Designer',
    year: '2023',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 6, slug: 'empty-date',
    title: 'Empty Date',
    categories: ['ui-ux'],
    type: 'UI/UX Design',
    role: 'Product Designer',
    year: '2023',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 7, slug: 'here-creative',
    title: 'Here Creative',
    categories: ['ui-ux'],
    type: 'UI/UX Design',
    role: 'UI/UX Designer',
    year: '2023',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 8, slug: 'inhub',
    title: 'InHub',
    categories: ['brand-design'],
    type: 'Brand Design',
    role: 'Brand Designer',
    year: '2023',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 9, slug: 'drawstory',
    title: 'Drawstory',
    categories: ['ui-ux', 'graphics-ai'],
    type: 'Product Design',
    role: 'Product Designer',
    year: '2024',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 10, slug: 'ai-creatives',
    title: 'AI Creatives',
    categories: ['graphics-ai'],
    type: 'Graphics & AI',
    role: 'Creative Director',
    year: '2024',
    cover: null, imgs: [],
    href: '#'
  },
  {
    id: 11, slug: 'posters',
    title: 'Posters Vol.1',
    categories: ['graphics-ai', 'art-direction'],
    type: 'Graphic Design',
    role: 'Graphic Designer',
    year: '2023',
    cover: 'images/posters/poster.png',
    imgs: ['images/posters/poster.png','images/posters/poster-1.png','images/posters/poster-2.png','images/posters/poster-3.png'],
    href: 'project-posters.html'
  }
];

// ── CUSTOM CURSOR ──
(function () {
  var el = document.createElement('div');
  el.className = 'cursor-x hidden';
  document.body.appendChild(el);
  document.addEventListener('mousemove', function (e) {
    el.style.left = e.clientX + 'px';
    el.style.top  = e.clientY + 'px';
    el.classList.remove('hidden');
  });
  document.addEventListener('mouseover', function (e) {
    var over = !!e.target.closest('a, button, label, input, textarea, select, [role="button"]');
    el.classList.toggle('link-hover', over);
  });
  document.addEventListener('mouseleave', function () { el.classList.add('hidden'); });
})();

// ── SCROLL REVEAL (generic) ──
function initReveal() {
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(function (el) { obs.observe(el); });
}

// ── ALL PROJECTS LIST ──
function renderAllpList() {
  var container = document.getElementById('allp-list');
  if (!container) return;
  container.innerHTML = PROJECTS.map(function (p) {
    var tag = p.href === '#' ? 'div' : 'a';
    var href = p.href !== '#' ? ' href="' + p.href + '"' : '';
    var imgs = JSON.stringify(p.imgs || []);
    return '<' + tag + href + ' class="allp-row" data-imgs=\'' + imgs + '\'>' +
      '<span class="allp-row-name">' + p.title + '</span>' +
      '<span class="allp-row-cat">' + p.type + '</span>' +
      '<span class="allp-row-role">' + p.role + '</span>' +
    '</' + tag + '>';
  }).join('');
}

// ── SHOWREEL HOVER (all projects list) ──
function initShowreel() {
  var ghost = document.getElementById('showreel-ghost');
  var ghostImg = document.getElementById('showreel-ghost-img');
  if (!ghost || !ghostImg) return;

  var currentRow = null;
  var cycleTimer = null;
  var cycleIdx = 0;
  var currentImgs = [];

  function startCycle(imgs) {
    stopCycle();
    currentImgs = imgs;
    cycleIdx = 0;
    if (!currentImgs.length) return;
    ghostImg.src = currentImgs[0];
    cycleTimer = setInterval(function () {
      cycleIdx = (cycleIdx + 1) % currentImgs.length;
      ghostImg.src = currentImgs[cycleIdx];
    }, 220);
  }

  function stopCycle() {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }

  document.addEventListener('mousemove', function (e) {
    if (ghost.classList.contains('active')) {
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = e.clientY + 'px';
    }
  });

  document.addEventListener('mouseover', function (e) {
    var row = e.target.closest('.allp-row');
    if (row && row !== currentRow) {
      currentRow = row;
      var imgs = [];
      try { imgs = JSON.parse(row.dataset.imgs || '[]'); } catch(err) { imgs = []; }
      if (imgs.length) {
        ghost.classList.add('active');
        startCycle(imgs);
      }
    } else if (!row && currentRow) {
      currentRow = null;
      ghost.classList.remove('active');
      stopCycle();
    }
  });
}

// ── WORKS PAGE: RENDER PROJECTS ──
function renderProjects(filter) {
  var container = document.getElementById('projects-container');
  if (!container) return;
  var isGrid = container.classList.contains('view-grid');
  var list = (filter === 'all')
    ? PROJECTS
    : PROJECTS.filter(function (p) { return p.categories.indexOf(filter) !== -1; });

  if (isGrid) {
    container.innerHTML = list.map(function (p) {
      var tag = p.href !== '#' ? 'a' : 'div';
      var href = p.href !== '#' ? ' href="' + p.href + '"' : '';
      var inner = p.cover
        ? '<img src="' + p.cover + '" alt="' + p.title + '">'
        : '<div class="card-placeholder"><span class="ph-num">' + p.id + '</span><span class="ph-title">' + p.title + '</span></div>';
      return '<' + tag + href + ' class="project-card"><div class="card-img-wrap">' + inner +
        '</div><div class="card-info"><span class="card-title">' + p.title +
        '</span><span class="card-cat">' + p.type + '</span></div></' + tag + '>';
    }).join('');
    setTimeout(initCardReveal, 30);
  } else {
    container.innerHTML = list.map(function (p, i) {
      var tag = p.href !== '#' ? 'a' : 'div';
      var href = p.href !== '#' ? ' href="' + p.href + '"' : '';
      var num = (i + 1 < 10 ? '0' : '') + (i + 1);
      return '<' + tag + href + ' class="project-row"><span class="row-num">' + num +
        '</span><span class="row-title">' + p.title + '</span><span class="row-cat">' +
        p.type + '</span><span class="row-year">' + p.year +
        '</span><span class="row-arrow">→</span></' + tag + '>';
    }).join('');
  }
}

// ── CARD REVEAL ANIMATION ──
function initCardReveal() {
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('card-in'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.05 });
  document.querySelectorAll('.project-card:not(.card-in)').forEach(function (c) { obs.observe(c); });
}

// ── FILTER BUTTONS ──
function initFilter() {
  var btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      btns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderProjects(btn.dataset.filter);
    });
  });
}

// ── VIEW TOGGLE (Grid / List) ──
function initViewToggle() {
  var btns = document.querySelectorAll('.view-btn');
  var container = document.getElementById('projects-container');
  if (!btns.length || !container) return;
  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      btns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      container.classList.remove('view-grid', 'view-list');
      container.classList.add('view-' + btn.dataset.view);
      var active = document.querySelector('.filter-btn.active');
      renderProjects(active ? active.dataset.filter : 'all');
    });
  });
}

// ── FEATURED CARDS HOVER PHOTO SWAP ──
function initFeatHover() {
  document.querySelectorAll('.feat-card').forEach(function (card) {
    var imgs = [];
    try { imgs = JSON.parse(card.dataset.imgs || '[]'); } catch(err) { imgs = []; }
    if (!imgs.length) return;
    var imgEl = card.querySelector('.feat-img-el');
    if (!imgEl) return;
    var idx = 0;
    var timer = null;
    card.addEventListener('mouseenter', function () {
      idx = 0;
      timer = setInterval(function () {
        idx = (idx + 1) % imgs.length;
        imgEl.src = imgs[idx];
      }, 350);
    });
    card.addEventListener('mouseleave', function () {
      clearInterval(timer);
      imgEl.src = imgs[0];
    });
  });
}

// ── GSAP QUOTE ANIMATION ──
function initQuoteAnim() {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);

  var sec = document.querySelector('#quote-sec');
  if (!sec) return;
  var words = gsap.utils.toArray('.qw');
  if (!words.length) return;

  var isMobile = window.innerWidth <= 720;

  if (isMobile) {
    // Mobile: simple per-word opacity reveal as each enters viewport
    gsap.set(words, { opacity: 0 });
    words.forEach(function(word) {
      ScrollTrigger.create({
        trigger: word,
        start: 'top 88%',
        onEnter: function() {
          gsap.to(word, { opacity: 1, duration: 0.55, ease: 'power1.out' });
        }
      });
    });
    return;
  }

  // Desktop: scroll-pinned reveal
  gsap.set(words, { y: 36, opacity: 0 });
  gsap.set('.quote-side-label', { y: 36, opacity: 0 });

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: sec,
      start: 'top top',
      end: '+=220%',
      pin: true,
      scrub: 1,
      anticipatePin: 1
    }
  });

  tl.to(words, { y: 0, opacity: 1, stagger: 0.1, duration: 0.45, ease: 'none' });
  tl.to('.quote-side-label', { y: 0, opacity: 1, duration: 0.35, ease: 'none' }, '<');
}

// ── PROJECT SLIDER ──
function initProjSlider() {
  var inner = document.getElementById('proj-slider-inner');
  if (!inner) return;
  var slides = inner.querySelectorAll('.proj-slide');
  if (!slides.length) return;
  var counter = document.getElementById('proj-counter');
  var prevBtn = document.getElementById('proj-prev');
  var nextBtn = document.getElementById('proj-next');
  var current = 0;
  var total = slides.length;

  function goTo(n) {
    current = ((n % total) + total) % total;
    inner.style.transform = 'translateX(-' + (current * 100) + '%)';
    if (counter) counter.textContent = (current + 1) + ' / ' + total;
  }

  if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); });

  // Swipe support
  var touchStartX = 0;
  var wrap = inner.parentElement;
  if (wrap) {
    wrap.addEventListener('touchstart', function(e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    wrap.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(dx < 0 ? current + 1 : current - 1);
    }, { passive: true });
  }
}

// ── OVERLAY OPEN / CLOSE ──
function initOverlay() {
  var navToggle    = document.getElementById('nav-toggle');
  var navOverlay   = document.getElementById('nav-overlay');
  var overlayClose = document.getElementById('overlay-close');
  var olServiceToggle = document.querySelector('.ol-service-toggle');
  var olServiceSub    = document.getElementById('ol-service-sub');

  if (!navToggle || !navOverlay) return;

  var openOverlay = function () {
    navOverlay.classList.add('open');
    navToggle.classList.add('open');
    document.body.classList.add('overlay-open');
  };
  var closeOverlay = function () {
    navOverlay.classList.remove('open');
    navToggle.classList.remove('open');
    document.body.classList.remove('overlay-open');
    if (olServiceSub)    olServiceSub.classList.remove('open');
    if (olServiceToggle) olServiceToggle.classList.remove('open');
  };

  navToggle.addEventListener('click', function () {
    navOverlay.classList.contains('open') ? closeOverlay() : openOverlay();
  });
  if (overlayClose) overlayClose.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlay(); });

  // Services sub-dropdown in overlay
  if (olServiceToggle && olServiceSub) {
    olServiceToggle.addEventListener('click', function () {
      olServiceSub.classList.toggle('open');
      olServiceToggle.classList.toggle('open');
    });
  }

  // Overlay form submit
  var overlayForm = document.getElementById('overlay-form');
  if (overlayForm) {
    overlayForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name    = overlayForm.querySelector('[name="ol-name"]').value.trim();
      var email   = overlayForm.querySelector('[name="ol-email"]').value.trim();
      var message = overlayForm.querySelector('[name="ol-message"]').value.trim();
      var consent = overlayForm.querySelector('[name="ol-consent"]').checked;
      if (!name || !email || !message || !consent) return;
      var subject = encodeURIComponent('Portfolio contact from ' + name);
      var body    = encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\n\nMessage:\n' + message);
      window.location.href = 'mailto:sargsyan.std@gmail.com?subject=' + subject + '&body=' + body;
      overlayForm.reset();
    });
  }
}

// ── SERVICE DROPDOWN ──
function initServiceDrop() {
  var serviceWrap = document.querySelector('.nav-service-wrap');
  var serviceDrop = document.querySelector('.service-drop');
  if (!serviceWrap || !serviceDrop) return;
  var hideTimer;
  var showDrop = function () { clearTimeout(hideTimer); serviceDrop.classList.add('show'); };
  var hideDrop = function () { hideTimer = setTimeout(function () { serviceDrop.classList.remove('show'); }, 280); };
  serviceWrap.addEventListener('mouseenter', showDrop);
  serviceWrap.addEventListener('mouseleave', hideDrop);
  serviceDrop.addEventListener('mouseenter', showDrop);
  serviceDrop.addEventListener('mouseleave', hideDrop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') serviceDrop.classList.remove('show'); });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  renderAllpList();
  initShowreel();
  initFeatHover();
  initOverlay();
  initServiceDrop();
  initQuoteAnim();
  initProjSlider();
  if (document.getElementById('projects-container')) {
    renderProjects('all');
    initFilter();
    initViewToggle();
  }
});
