/* ============================================================
   case-template.js — builds a full case-study HTML document from
   a project object (managed via /admin). Used by admin.js to
   generate <slug>.html (EN) and <slug>-ru.html (RU).

   Exposes: window.buildCaseHTML(project, lang)  // lang = 'en' | 'ru'
   ============================================================ */
(function () {

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Turn plain text with blank lines into <p> paragraphs
  function paras(text) {
    return String(text == null ? '' : text)
      .split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; })
      .join('\n        ');
  }

  var YM = [
    '  <!-- Yandex.Metrika counter -->',
    '  <script type="text/javascript">',
    '    (function(m,e,t,r,i,k,a){',
    '        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};',
    '        m[i].l=1*new Date();',
    '        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}',
    '        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)',
    "    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=109758796', 'ym');",
    "    ym(109758796, 'init', {webvisor:true, clickmap:true, trackLinks:true, accurateTrackBounce:true});",
    '  </script>',
    '  <noscript><div><img src="https://mc.yandex.ru/watch/109758796" style="position:absolute; left:-9999px;" alt="" /></div></noscript>',
    '  <!-- /Yandex.Metrika counter -->'
  ].join('\n');

  function nav() {
    return [
      '  <nav class="site-nav">',
      '    <a href="/" class="nav-logo">',
      '      <img src="/images/logo_variants/logo white without bg.svg" width="24" height="24" alt="Ripsime Sargsyan">',
      '    </a>',
      '    <div class="nav-links">',
      '      <a href="/" class="nav-link">Home</a>',
      '      <a href="/work" class="nav-link active">Work</a>',
      '      <div class="nav-service-wrap">',
      '        <button class="nav-link nav-service-toggle">Service</button>',
      '        <div class="service-drop">',
      '          <a href="/service-branding" class="service-item">Branding</a>',
      '          <a href="/service-uiux" class="service-item">UI/UX</a>',
      '          <a href="/service-product-design" class="service-item">Product Design</a>',
      '          <a href="/service-art-direction" class="service-item">Art Direction</a>',
      '        </div>',
      '      </div>',
      '      <a href="/talks" class="nav-link">Talks</a>',
      '      <a href="mailto:sargsyan.std@gmail.com" class="nav-link">Contact</a>',
      '    </div>',
      '    <button class="nav-toggle" id="nav-toggle" aria-label="Open menu"><span></span><span></span></button>',
      '  </nav>',
      '',
      '  <div class="staircase-panel" id="staircase-panel">',
      '    <a href="/" class="stair-link">Home</a>',
      '    <a href="/work" class="stair-link">Work</a>',
      '    <a href="/talks" class="stair-link">Talks</a>',
      '    <a href="mailto:sargsyan.std@gmail.com" class="stair-link">Contact</a>',
      '  </div>',
      '',
      '  <div class="nav-overlay" id="nav-overlay">',
      '    <div class="overlay-header">',
      '      <a href="/" class="nav-logo"><img src="/images/logo_variants/logo white without bg.svg" width="24" height="24" alt="Ripsime Sargsyan"></a>',
      '      <button class="overlay-close" id="overlay-close">×</button>',
      '    </div>',
      '    <div class="overlay-body">',
      '      <div><div class="overlay-stair-links">',
      '          <a href="/">Home</a>',
      '          <a href="/work">Work</a>',
      '          <button class="ol-service-toggle" type="button">Services <span class="ol-toggle-arrow">▾</span></button>',
      '          <div class="ol-service-sub" id="ol-service-sub">',
      '            <a href="/service-branding">Branding</a>',
      '            <a href="/service-uiux">UI/UX</a>',
      '            <a href="/service-product-design">Product Design</a>',
      '            <a href="/service-art-direction">Art Direction</a>',
      '          </div>',
      '          <a href="/talks">Talks</a>',
      '          <a href="mailto:sargsyan.std@gmail.com">Contact</a>',
      '      </div></div>',
      '    </div>',
      '  </div>'
    ].join('\n');
  }

  function footer(t) {
    return [
      '    <section class="contact-form-section">',
      '      <div>',
      '        <h2 class="contact-headline">' + t.contactTitle + '</h2>',
      '        <p class="contact-body">' + t.contactBody + '</p>',
      '      </div>',
      '      <form class="ol-form contact-form-ajax" novalidate>',
      '        <input type="hidden" name="access_key" value="262fc81b-9cb3-4ffb-bac3-c6d69a5b9200">',
      '        <input type="hidden" name="subject" value="Portfolio inquiry — ripsime.me">',
      '        <input type="hidden" name="from_name" value="ripsime.me contact form">',
      '        <div class="ol-field"><input type="text" name="name" required placeholder=" "><label class="ol-label">' + t.fName + '</label></div>',
      '        <div class="ol-field"><input type="email" name="email" required placeholder=" "><label class="ol-label">Email</label></div>',
      '        <div class="ol-field"><input type="text" name="message" required placeholder=" "><label class="ol-label">' + t.fMsg + '</label></div>',
      '        <label class="ol-consent"><input type="checkbox" name="consent" required><span class="ol-consent-text">' + t.consent + '</span></label>',
      '        <button type="submit" class="ol-submit">' + t.send + '</button>',
      '        <div class="form-status" aria-live="polite"></div>',
      '      </form>',
      '    </section>',
      '',
      '    <footer class="site-footer">',
      '      <div class="footer-links-col">',
      '        <div><nav class="footer-col-links"><a href="/">Home</a><a href="/work">Works</a><a href="/talks">Talks</a></nav></div>',
      '        <div><div class="footer-col-links">',
      '          <a href="https://linkedin.com/in/ripsime-sargsyan/" target="_blank" rel="noopener">LinkedIn</a>',
      '          <a href="https://t.me/ripssimee" target="_blank" rel="noopener">Telegram</a>',
      '          <a href="https://t.me/sargsyanstd" target="_blank" rel="noopener">@sargsyan.std</a>',
      '        </div></div>',
      '        <div><div class="footer-col-links">',
      '          <a href="https://instagram.com/ripssimee/" target="_blank" rel="noopener">Instagram</a>',
      '          <a href="https://behance.net/ripsime" target="_blank" rel="noopener">Behance</a>',
      '          <a href="https://t.me/sargsyanstd" target="_blank" rel="noopener">My channel</a>',
      '        </div></div>',
      '        <div class="footer-col-right">',
      '          <p class="footer-copyright">All rights reserved</p>',
      '          <p class="footer-copyright">© 2026 Ripsime Sargsyan</p>',
      '        </div>',
      '      </div>',
      '    </footer>'
    ].join('\n');
  }

  function renderBlock(b, lang) {
    if (!b || !b.type) return '';
    switch (b.type) {
      case 'full':
        if (!b.img) return '';
        return '    <section class="prm-full">\n      <img src="' + esc(b.img) + '" alt="" loading="lazy">\n    </section>';
      case 'full-vh':
        if (!b.img) return '';
        return '    <section class="prm-full prm-full--vh">\n      <img src="' + esc(b.img) + '" alt="">\n    </section>';
      case 'split':
        var imgs = (b.imgs || []).filter(Boolean);
        if (imgs.length < 1) return '';
        return '    <section class="prm-split">\n' +
          imgs.slice(0, 2).map(function (src) {
            return '      <div class="prm-split-col"><img src="' + esc(src) + '" alt="" loading="lazy"></div>';
          }).join('\n') + '\n    </section>';
      case 'text':
        var txt = lang === 'ru' ? (b.ru || b.en) : (b.en || b.ru);
        if (!txt) return '';
        return '    <section class="prm-text-right">\n      <div class="prm-text-right-inner">\n        ' +
          paras(txt) + '\n      </div>\n    </section>';
      case 'green':
        var head = lang === 'ru' ? (b.headlineRu || b.headlineEn) : (b.headlineEn || b.headlineRu);
        var body = lang === 'ru' ? (b.bodyRu || b.bodyEn) : (b.bodyEn || b.bodyRu);
        if (!head && !body) return '';
        return '    <section class="prm-green-block">\n      <span class="prm-green-quote">"</span>\n' +
          (head ? '      <h2 class="prm-green-headline">' + esc(head) + '</h2>\n' : '') +
          (body ? '      <p class="prm-green-body">' + esc(body) + '</p>\n' : '') +
          '    </section>';
      default:
        return '';
    }
  }

  window.buildCaseHTML = function (p, lang) {
    lang = lang === 'ru' ? 'ru' : 'en';
    var isRu = lang === 'ru';
    var isLight = p.theme === 'light';
    var mainClass = isLight ? 'prm-main cs-light' : 'prm-main skp-main-dark';

    var title = isRu ? (p.titleRu || p.title) : p.title;
    var type  = isRu ? (p.typeRu || p.type) : p.type;
    var desc  = isRu ? (p.descRu || p.descEn) : (p.descEn || p.descRu);
    var sub   = isRu ? (p.subRu || p.subEn) : (p.subEn || p.subRu);

    var t = isRu ? {
      contactTitle: 'Свяжитесь со мной',
      contactBody: 'Есть интересный проект или задача с дизайном? Давайте поговорим — всегда открыта к новым проектам и коллаборациям.',
      fName: 'Имя', fMsg: 'О проекте', consent: 'Я согласна на обработку персональных данных.', send: 'Отправить →',
      metaDesc: (title + ' — кейс. Ripsime Sargsyan.')
    } : {
      contactTitle: 'Get in Touch',
      contactBody: "Have an interesting project or struggling with design? Let's connect! I'm always open to talk, create, and collaborate.",
      fName: 'Name', fMsg: 'About project', consent: 'I agree to the processing of personal data.', send: 'Send →',
      metaDesc: (title + ' — case study by Ripsime Sargsyan.')
    };

    var enHref = '/' + p.slug;
    var ruHref = '/' + p.slug + '-ru';
    var langToggle = [
      '  <div class="lang-toggle">',
      isRu ? '    <a href="' + enHref + '" class="lang-btn">EN</a>' : '    <span class="lang-btn lang-btn--active">EN</span>',
      isRu ? '    <span class="lang-btn lang-btn--active">RU</span>' : '    <a href="' + ruHref + '" class="lang-btn">RU</a>',
      '  </div>'
    ].join('\n');

    // Hero
    var hero = '    <section class="prm-hero">\n' +
      (p.cover ? '      <img src="' + esc(p.cover) + '" alt="' + esc(title) + '">\n' : '') +
      '      <div class="prm-hero-inner">\n' +
      '        <h1 class="prm-hero-title">' + esc(title) + '</h1>\n' +
      (sub ? '        <p class="prm-hero-sub">' + esc(sub) + '</p>\n' : '') +
      '      </div>\n    </section>';

    // Services list from the display type (split on comma / slash)
    var services = (type || '').split(/[,·]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var servicesHtml = services.map(function (s) { return '          <p>' + esc(s) + '</p>'; }).join('\n');

    var info = '    <section class="skp-project-info">\n' +
      '      <div class="skp-project-info-left">\n' +
      (desc ? '        <p class="skp-info-headline">' + esc(desc) + '</p>\n' : '') +
      (servicesHtml ? '        <div class="skp-project-services">\n' + servicesHtml + '\n        </div>\n' : '') +
      '      </div>\n' +
      '      <div class="skp-project-info-right"></div>\n' +
      '    </section>';

    var blocks = (p.blocks || []).map(function (b) { return renderBlock(b, lang); }).filter(Boolean).join('\n\n');

    var doc = [
      '<!DOCTYPE html>',
      '<html lang="' + (isRu ? 'ru' : 'en') + '">',
      '<head>',
      '  <meta charset="UTF-8">',
      YM,
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <title>' + esc(title) + ' — Ripsime Sargsyan</title>',
      '  <meta name="description" content="' + esc(t.metaDesc) + '">',
      '  <link rel="icon" href="/images/logo_variants/r logo black.svg" type="image/svg+xml">',
      '  <link rel="stylesheet" href="/css/style.css">',
      '  <link rel="stylesheet" href="/css/case.css">',
      '</head>',
      '<body>',
      '',
      nav(),
      '',
      langToggle,
      '',
      '  <div class="page-wrap">',
      '  <main class="' + mainClass + '">',
      '',
      hero,
      '',
      info,
      (blocks ? '\n\n' + blocks : ''),
      '',
      '  </main>',
      '',
      footer(t),
      '  </div>',
      '',
      '  <script src="/js/main.js"></script>',
      '</body>',
      '</html>',
      ''
    ].join('\n');

    return doc;
  };
})();
