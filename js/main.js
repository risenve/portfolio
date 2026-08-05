// Projects are loaded from /data/projects.json (managed via /admin).
// PROJECTS starts empty and is filled by loadProjects() before any list renders.
var PROJECTS = [];

function loadProjects() {
  return fetch('/data/projects.json', { cache: 'no-cache' })
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (list) { PROJECTS = Array.isArray(list) ? list : []; return PROJECTS; })
    .catch(function () { PROJECTS = []; return PROJECTS; });
}

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
  container.innerHTML = PROJECTS.filter(function (p) { return !p.worksOnly; }).map(function (p) {
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
      var isExternal = p.href && p.href.indexOf('http') === 0;
      var tag = p.href && p.href !== '#' ? 'a' : 'div';
      var href = p.href && p.href !== '#' ? ' href="' + p.href + '"' : '';
      var targetAttr = isExternal ? ' target="_blank" rel="noopener"' : '';
      var inner = p.video
        ? '<img src="' + p.cover + '" alt="' + p.title + '" loading="lazy">' +
          '<video class="hover-video" src="' + p.video + '" muted loop playsinline preload="none" poster="' + p.cover + '"></video>'
        : p.cover
        ? '<img src="' + p.cover + '" alt="' + p.title + '" loading="lazy">'
        : '<div class="card-placeholder"><span class="ph-num">' + p.id + '</span><span class="ph-title">' + p.title + '</span></div>';
      return '<' + tag + href + targetAttr + ' class="project-card"><div class="card-img-wrap">' + inner +
        '</div><div class="card-info"><span class="card-title">' + p.title +
        '</span><span class="card-cat">' + p.type + '</span></div></' + tag + '>';
    }).join('');
    setTimeout(initCardReveal, 30);
    initHoverVideos();
  } else {
    container.innerHTML = list.map(function (p) {
      var isExternal = p.href && p.href.indexOf('http') === 0;
      var tag = p.href && p.href !== '#' ? 'a' : 'div';
      var href = p.href && p.href !== '#' ? ' href="' + p.href + '"' : '';
      var targetAttr = isExternal ? ' target="_blank" rel="noopener"' : '';
      var imgs = JSON.stringify(p.imgs || []);
      return '<' + tag + href + targetAttr + ' class="project-row" data-imgs=\'' + imgs + '\'>' +
        '<span class="row-title">' + p.title + '</span>' +
        '<span class="row-cat">' + p.type + '</span>' +
      '</' + tag + '>';
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

// ── HOVER VIDEO PREVIEW (project cards + hero) ──
function initHoverVideos() {
  document.querySelectorAll('.hover-video').forEach(function (video) {
    if (video.dataset.hoverBound) return;
    video.dataset.hoverBound = '1';
    var trigger = video.closest('.project-card, .rds-hero-right, .card-img-wrap');
    if (!trigger) return;
    trigger.addEventListener('mouseenter', function () {
      try {
        video.currentTime = 0;
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () {});
      } catch (e) {}
    });
    trigger.addEventListener('mouseleave', function () {
      video.pause();
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

  // Simple scroll-triggered reveal — no pin (pin caused stats double-overlap)
  gsap.set(words, { y: 40, opacity: 0 });
  gsap.to(words, {
    y: 0, opacity: 1,
    stagger: 0.07,
    duration: 0.65,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: sec,
      start: 'top 80%',
      once: true
    }
  });
}

// ── REVIEWS: horizontal row — language toggle + READ ALL ──
function initReviewAnim() {
  var revSec  = document.getElementById('rev-sec');
  if (!revSec) return;

  // ── Language toggle ──
  var langBtns = document.querySelectorAll('.rev-lang-btn');
  langBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var lang = btn.getAttribute('data-lang');
      revSec.setAttribute('data-lang', lang);
      langBtns.forEach(function(b) {
        b.classList.toggle('rev-lang-btn--active', b.getAttribute('data-lang') === lang);
      });
    });
  });

  // ── READ ALL — show/hide full review text below the quote ──
  var readAllBtn = document.getElementById('rev-read-all-0');
  if (readAllBtn) {
    readAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var fullBody = document.getElementById('rev-full-body-0');
      if (!fullBody) return;
      var isExpanded = fullBody.classList.contains('expanded');
      if (!isExpanded) {
        fullBody.classList.add('expanded');
        readAllBtn.textContent = 'COLLAPSE';
      } else {
        fullBody.classList.remove('expanded');
        readAllBtn.textContent = 'READ ALL';
      }
    });
  }
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

  // Close overlay when a menu link is clicked (incl. the #contact anchor)
  navOverlay.querySelectorAll('.overlay-stair-links a[href]').forEach(function (link) {
    link.addEventListener('click', closeOverlay);
  });

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

  // Contact section form submit
  var contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name    = contactForm.querySelector('[name="name"]').value.trim();
      var email   = contactForm.querySelector('[name="email"]').value.trim();
      var message = contactForm.querySelector('[name="message"]').value.trim();
      var consent = contactForm.querySelector('[name="consent"]').checked;
      if (!name || !email || !message || !consent) return;
      var subject = encodeURIComponent('Portfolio contact from ' + name);
      var body    = encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\n\nMessage:\n' + message);
      window.location.href = 'mailto:sargsyan.std@gmail.com?subject=' + subject + '&body=' + body;
      contactForm.reset();
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

// ── SCROLL-HIDE NAV ──
function initScrollNav() {
  var nav = document.querySelector('.site-nav');
  if (!nav) return;
  var lastY = 0;
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      // Only hide after scrolling past nav height; always show near top
      if (y < 80) {
        nav.classList.remove('nav-hidden');
      } else if (y > lastY) {
        nav.classList.add('nav-hidden');
      } else {
        nav.classList.remove('nav-hidden');
      }
      lastY = y;
      ticking = false;
    });
  }, { passive: true });
}

// ── LIST HOVER PREVIEW ──
function initListHover() {
  var container = document.getElementById('projects-container');
  if (!container) return;

  var preview = document.createElement('div');
  preview.className = 'list-preview';
  var previewImg = document.createElement('img');
  preview.appendChild(previewImg);
  document.body.appendChild(preview);

  var currentRow = null;
  var cycleTimer = null;
  var cycleIdx = 0;

  function startCycle(imgs) {
    clearInterval(cycleTimer);
    if (!imgs.length) return;
    cycleIdx = 0;
    previewImg.src = imgs[0];
    if (imgs.length > 1) {
      cycleTimer = setInterval(function () {
        cycleIdx = (cycleIdx + 1) % imgs.length;
        previewImg.src = imgs[cycleIdx];
      }, 220);
    }
  }

  document.addEventListener('mousemove', function (e) {
    if (preview.classList.contains('active')) {
      preview.style.left = e.clientX + 'px';
      preview.style.top  = e.clientY + 'px';
    }
  });

  document.addEventListener('mouseover', function (e) {
    if (!container.classList.contains('view-list')) return;
    var row = e.target.closest('.project-row');
    if (row && row !== currentRow) {
      currentRow = row;
      var imgs = [];
      try { imgs = JSON.parse(row.dataset.imgs || '[]'); } catch (err) { imgs = []; }
      if (imgs.length) { preview.classList.add('active'); startCycle(imgs); }
    } else if (!row && currentRow) {
      currentRow = null;
      preview.classList.remove('active');
      clearInterval(cycleTimer);
    }
  });
}

// ── SERVICE CARDS: hover → full-section photo bg + card states ──
function initServiceCards() {
  var procBg   = document.getElementById('ah-proc-bg');
  var procImg  = document.getElementById('ah-proc-bg-img');
  var procGrad = procBg && procBg.querySelector('.ah-proc-bg-grad');
  var wrap     = document.getElementById('ah-svc-cards');
  var bottom   = wrap && wrap.closest('.ah-proc-bottom');
  if (!procBg || !wrap) return;

  var cards = Array.prototype.slice.call(wrap.querySelectorAll('.ah-svc-card'));

  // Preload hover images so the first mouseenter shows instantly
  cards.forEach(function(c) {
    var src = c.getAttribute('data-img');
    if (src) { var im = new Image(); im.src = src; }
  });

  // Default gradient (used when card has no custom gradient)
  var DEFAULT_GRAD = 'linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0) 70%,rgba(0,0,0,.55) 100%)';

  function activate(activeCard) {
    var src  = activeCard.getAttribute('data-img')      || '';
    var fit  = activeCard.getAttribute('data-fit')      || 'cover';
    var pos  = activeCard.getAttribute('data-position') || 'center center';
    var bg   = activeCard.getAttribute('data-bg')       || '';
    var grad = activeCard.getAttribute('data-gradient') || DEFAULT_GRAD;

    // Photo
    if (src) {
      procImg.src              = src;
      procImg.style.display    = '';
      procImg.style.objectFit      = fit;
      procImg.style.objectPosition = pos;
    } else {
      procImg.style.display = 'none';
    }

    // Container bg color (for product design's #103E9F)
    procBg.style.backgroundColor = bg;

    // Gradient overlay
    if (procGrad) procGrad.style.background = grad;

    procBg.classList.add('active');
    if (bottom) bottom.classList.add('has-hover');

    // Card states
    cards.forEach(function(c) {
      c.classList.remove('ah-svc-active', 'ah-svc-inactive');
      c.classList.add(c === activeCard ? 'ah-svc-active' : 'ah-svc-inactive');
    });
  }

  function deactivate() {
    procBg.classList.remove('active');
    procBg.style.backgroundColor = '';
    if (procGrad) procGrad.style.background = '';
    procImg.style.objectFit      = '';
    procImg.style.objectPosition = '';
    if (bottom) bottom.classList.remove('has-hover');
    cards.forEach(function(c) {
      c.classList.remove('ah-svc-active', 'ah-svc-inactive');
    });
  }

  cards.forEach(function(card) {
    card.addEventListener('mouseenter', function() { activate(card); });
  });
  wrap.addEventListener('mouseleave', deactivate);
}

// ── SERVICE WIP: block navigation, show toast ──
function initServiceWip() {
  // Create toast element once
  var toast = document.createElement('div');
  toast.className = 'wip-toast';
  toast.textContent = 'Page under development';
  document.body.appendChild(toast);

  var hideTimer;
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href^="/service-"]');
    if (!link) return;
    e.preventDefault();
    // show toast
    clearTimeout(hideTimer);
    toast.classList.add('wip-toast--show');
    hideTimer = setTimeout(function() {
      toast.classList.remove('wip-toast--show');
    }, 2200);
  });
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initShowreel();
  initFeatHover();
  initHoverVideos();
  initOverlay();
  initServiceDrop();
  initScrollNav();
  initQuoteAnim();
  initReviewAnim();
  initProjSlider();
  initServiceCards();
  initServiceWip();

  // Project lists depend on data/projects.json — render them after it loads.
  var needsProjects = document.getElementById('allp-list') || document.getElementById('projects-container');
  if (needsProjects) {
    loadProjects().then(function () {
      renderAllpList();
      if (document.getElementById('projects-container')) {
        renderProjects('all');
        initFilter();
        initViewToggle();
        initListHover();
      }
      setTimeout(initCardReveal, 30);
    });
  }
});

// ── CONTACT FORM — Web3Forms async submit ──
function initContactForms() {
  document.querySelectorAll('.contact-form-ajax').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var status = form.querySelector('.form-status');
      var btn    = form.querySelector('.ol-submit');
      var valid  = true;

      // Clear previous errors
      form.querySelectorAll('.input-error').forEach(function(el){ el.classList.remove('input-error'); });
      form.querySelectorAll('.ol-consent').forEach(function(el){ el.classList.remove('consent-error'); });
      if (status) { status.className = 'form-status'; status.textContent = ''; }

      // Validate text/email inputs
      form.querySelectorAll('input[required]:not([type=checkbox])').forEach(function(inp) {
        var empty = !inp.value.trim();
        var badEmail = inp.type === 'email' && inp.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value);
        if (empty || badEmail) {
          inp.classList.add('input-error');
          valid = false;
        }
      });

      // Validate checkbox
      var consent = form.querySelector('input[type=checkbox][required]');
      if (consent && !consent.checked) {
        var label = consent.closest('.ol-consent');
        if (label) label.classList.add('consent-error');
        valid = false;
      }

      if (!valid) {
        if (status) { status.className = 'form-status error'; status.textContent = 'Please fill in all required fields.'; }
        return;
      }

      // Submit
      btn.disabled = true;
      btn.textContent = 'Sending…';
      var data = new FormData(form);
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: data
      })
      .then(function(res) { return res.json(); })
      .then(function(json) {
        if (json.success) {
          if (status) { status.className = 'form-status success'; status.textContent = "Sent! I'll get back to you soon."; }
          form.reset();
          btn.textContent = 'Sent ✓';
        } else {
          throw new Error(json.message || 'Error');
        }
      })
      .catch(function(err) {
        if (status) { status.className = 'form-status error'; status.textContent = 'Something went wrong. Try emailing directly: sargsyan.std@gmail.com'; }
        btn.disabled = false;
        btn.textContent = 'Send →';
      });
    });
  });
}

// ── SMOOTH-SCROLL FOR IN-PAGE "Contact" MENU LINKS ──
// The homepage layout (fixed hero + overflow-x:hidden on <html>) makes native
// smooth scrolling a no-op, so animate manually with instant scroll steps.
function initContactAnchors() {
  var target = document.getElementById('contact');
  if (!target) return;

  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function scrollToY(endY) {
    var startY = window.scrollY;
    var diff = endY - startY;
    if (Math.abs(diff) < 2) return;
    var duration = Math.min(900, Math.max(400, Math.abs(diff) * 0.35));
    var startT = null;
    function step(ts) {
      if (startT === null) startT = ts;
      var p = Math.min(1, (ts - startT) / duration);
      window.scrollTo({ top: Math.round(startY + diff * easeInOutQuad(p)), behavior: 'instant' });
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  document.querySelectorAll('a[href="#contact"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'), 10) || 56;
      var endY = target.getBoundingClientRect().top + window.scrollY - (navH + 24);
      scrollToY(endY);
      if (history.replaceState) history.replaceState(null, '', '#contact');
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {
  initContactForms();
  initContactAnchors();
});
