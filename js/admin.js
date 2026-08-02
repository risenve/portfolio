/* ============================================================
   admin.js — personal admin for ripsime.me
   Publishes case studies straight to risenve/portfolio via the
   GitHub Contents API using a fine-grained token (localStorage).
   ============================================================ */
(function () {
  'use strict';

  var OWNER = 'risenve', REPO = 'portfolio', BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var TOKEN_KEY = 'rp_admin_token';

  var CATS = [
    { id: 'ui-ux', label: 'UI/UX' },
    { id: 'brand-design', label: 'Brand Design' },
    { id: 'art-direction', label: 'Art Direction' },
    { id: 'graphics-ai', label: 'Graphics & AI' }
  ];

  // ---- DOM ----
  var $ = function (id) { return document.getElementById(id); };
  var gate = $('a-gate'), app = $('a-app');

  // ---- state ----
  var token = localStorage.getItem(TOKEN_KEY) || '';
  var projects = [];       // current projects.json array
  var projectsSha = null;  // sha of projects.json
  var editing = null;      // project being edited (null = new)
  var coverFile = null;    // File for new cover
  var blocks = [];         // working blocks: image slots carry _file

  // ---- utils ----
  function b64EncodeUtf8(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64DecodeUtf8(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))); }
  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[^a-z0-9а-я\s-]/gi, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  function safeName(name) {
    var dot = name.lastIndexOf('.');
    var ext = dot > -1 ? name.slice(dot).toLowerCase() : '';
    var base = (dot > -1 ? name.slice(0, dot) : name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return (base || 'img') + ext;
  }
  function fileToBase64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function log(el, msg, cls) {
    var line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  // ---- GitHub API ----
  function ghHeaders() {
    return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
  }
  function getContent(path) {
    return fetch(API + '/contents/' + encodeURI(path) + '?ref=' + BRANCH, { headers: ghHeaders(), cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('GET ' + path + ' → ' + r.status);
        return r.json();
      });
  }
  function putFile(path, base64, message, sha) {
    var body = { message: message, content: base64, branch: BRANCH };
    if (sha) body.sha = sha;
    return fetch(API + '/contents/' + encodeURI(path), {
      method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || ('PUT ' + path + ' → ' + r.status));
        return j;
      });
    });
  }
  // put a text file, resolving sha automatically
  function putText(path, text, message) {
    return getContent(path).then(function (existing) {
      return putFile(path, b64EncodeUtf8(text), message, existing && existing.sha);
    });
  }

  // ============================================================
  // TOKEN GATE
  // ============================================================
  function verifyToken() {
    var glog = $('a-gate-log'); glog.innerHTML = '';
    log(glog, 'Checking token…');
    return fetch(API, { headers: ghHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('Repo access failed (' + r.status + '). Check token scope.');
      return r.json();
    });
  }
  function unlock() {
    if (!token) return;
    verifyToken().then(function () {
      gate.classList.add('hidden');
      app.classList.remove('hidden');
      return loadProjects();
    }).catch(function (e) {
      log($('a-gate-log'), e.message, 'err');
    });
  }

  $('a-token-save').addEventListener('click', function () {
    token = $('a-token').value.trim();
    if (!token) { log($('a-gate-log'), 'Paste a token first.', 'err'); return; }
    localStorage.setItem(TOKEN_KEY, token);
    unlock();
  });
  $('a-token-forget').addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY); token = ''; $('a-token').value = '';
    log($('a-gate-log'), 'Token removed from this browser.', 'ok');
  });
  $('a-lock').addEventListener('click', function () {
    app.classList.add('hidden'); gate.classList.remove('hidden');
  });

  // ============================================================
  // LOAD + RENDER PROJECT LIST
  // ============================================================
  function loadProjects() {
    return getContent('data/projects.json').then(function (f) {
      if (!f) { projects = []; projectsSha = null; }
      else { projects = JSON.parse(b64DecodeUtf8(f.content)); projectsSha = f.sha; }
      renderList();
      newCase();
    });
  }

  function renderList() {
    var wrap = $('a-plist'); wrap.innerHTML = '';
    projects.forEach(function (p, idx) {
      var row = document.createElement('div');
      row.className = 'a-prow';
      var tpl = p.template ? '<span class="a-badge a-badge--tpl">template</span>' : '<span class="a-badge">custom</span>';
      row.innerHTML =
        '<div class="a-ord"><button data-up="' + idx + '">▲</button><button data-down="' + idx + '">▼</button></div>' +
        '<div class="a-prow-main">' +
          '<div class="a-prow-title">' + (p.title || p.slug) + tpl + '</div>' +
          '<div class="a-prow-meta">' + (p.categories || []).join(', ') + '</div>' +
        '</div>' +
        '<button class="a-btn a-btn--ghost a-btn--sm" data-edit="' + p.id + '">Edit</button>' +
        '<button class="a-btn a-btn--danger a-btn--sm" data-del="' + p.id + '">✕</button>';
      wrap.appendChild(row);
    });
  }

  $('a-plist').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) editCase(b.dataset.edit);
    else if (b.dataset.del) deleteCase(b.dataset.del);
    else if (b.dataset.up) moveRow(+b.dataset.up, -1);
    else if (b.dataset.down) moveRow(+b.dataset.down, 1);
  });

  function moveRow(idx, dir) {
    var j = idx + dir;
    if (j < 0 || j >= projects.length) return;
    var tmp = projects[idx]; projects[idx] = projects[j]; projects[j] = tmp;
    renderList();
  }

  $('a-save-order').addEventListener('click', function () {
    var el = $('a-log'); el.innerHTML = '';
    log(el, 'Saving order…');
    putText('data/projects.json', JSON.stringify(projects, null, 2) + '\n', 'Reorder projects via admin')
      .then(function (r) { projectsSha = r.content.sha; log(el, '✓ Order saved. Site rebuilds in ~1 min.', 'ok'); })
      .catch(function (e) { log(el, e.message, 'err'); });
  });

  // ============================================================
  // EDITOR
  // ============================================================
  function renderCats(selected) {
    var wrap = $('f-cats'); wrap.innerHTML = '';
    CATS.forEach(function (c) {
      var on = selected && selected.indexOf(c.id) !== -1;
      var lbl = document.createElement('label');
      lbl.className = 'a-cat' + (on ? ' on' : '');
      lbl.innerHTML = '<input type="checkbox" value="' + c.id + '"' + (on ? ' checked' : '') + '> ' + c.label;
      lbl.querySelector('input').addEventListener('change', function () {
        lbl.classList.toggle('on', this.checked);
      });
      wrap.appendChild(lbl);
    });
  }
  function getCats() {
    return Array.prototype.filter.call($('f-cats').querySelectorAll('input'), function (i) { return i.checked; })
      .map(function (i) { return i.value; });
  }

  function setTemplateMode(isTemplate) {
    $('a-tpl-fields').classList.toggle('hidden', !isTemplate);
    $('a-blocks-wrap').classList.toggle('hidden', !isTemplate);
    $('a-bespoke-note').classList.toggle('hidden', isTemplate);
  }

  function clearForm() {
    ['f-title', 'f-titleRu', 'f-slug', 'f-year', 'f-type', 'f-typeRu', 'f-subEn', 'f-subRu', 'f-descEn', 'f-descRu']
      .forEach(function (id) { $(id).value = ''; });
    $('f-cover').value = ''; coverFile = null;
    $('f-cover-thumb').classList.add('hidden'); $('f-cover-thumb').src = '';
    blocks = []; renderBlocks();
    $('a-log').innerHTML = ''; $('a-publish-status').textContent = '';
  }

  function newCase() {
    editing = null;
    $('a-editor-title').textContent = 'New case';
    clearForm();
    renderCats([]);
    setTemplateMode(true); // new cases are always template-generated
  }

  function editCase(id) {
    var p = projects.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    editing = p;
    $('a-editor-title').textContent = 'Edit — ' + (p.title || p.slug);
    clearForm();
    $('f-title').value = p.title || '';
    $('f-titleRu').value = p.titleRu || '';
    $('f-slug').value = p.slug || '';
    $('f-year').value = p.year || '';
    $('f-type').value = p.type || '';
    $('f-typeRu').value = p.typeRu || '';
    $('f-subEn').value = p.subEn || '';
    $('f-subRu').value = p.subRu || '';
    $('f-descEn').value = p.descEn || '';
    $('f-descRu').value = p.descRu || '';
    renderCats(p.categories || []);
    if (p.cover) { $('f-cover-thumb').src = p.cover; $('f-cover-thumb').classList.remove('hidden'); }
    blocks = (p.blocks || []).map(function (b) { return JSON.parse(JSON.stringify(b)); });
    renderBlocks();
    setTemplateMode(!!p.template);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteCase(id) {
    var p = projects.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    if (!confirm('Remove "' + (p.title || p.slug) + '" from the works list?\n\n(This updates projects.json. Any generated HTML/images stay in the repo but won\'t be linked.)')) return;
    projects = projects.filter(function (x) { return String(x.id) !== String(id); });
    var el = $('a-log'); el.innerHTML = ''; log(el, 'Removing…');
    putText('data/projects.json', JSON.stringify(projects, null, 2) + '\n', 'Remove ' + p.slug + ' via admin')
      .then(function (r) { projectsSha = r.content.sha; renderList(); newCase(); log(el, '✓ Removed.', 'ok'); })
      .catch(function (e) { log(el, e.message, 'err'); });
  }

  // ---- cover ----
  $('f-cover').addEventListener('change', function () {
    coverFile = this.files[0] || null;
    if (coverFile) { $('f-cover-thumb').src = URL.createObjectURL(coverFile); $('f-cover-thumb').classList.remove('hidden'); }
  });

  // auto slug from EN title (only when creating)
  $('f-title').addEventListener('input', function () {
    if (!editing && !$('f-slug').dataset.touched) $('f-slug').value = slugify(this.value);
  });
  $('f-slug').addEventListener('input', function () { this.dataset.touched = '1'; });

  // ============================================================
  // BLOCKS BUILDER
  // ============================================================
  document.querySelector('.a-add-row').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-add]'); if (!b) return;
    var type = b.dataset.add;
    var block = { type: type };
    if (type === 'split') { block.imgs = ['', '']; block._files = [null, null]; }
    else if (type === 'full' || type === 'full-vh') { block.img = ''; block._file = null; }
    else if (type === 'text') { block.en = ''; block.ru = ''; }
    else if (type === 'green') { block.headlineEn = ''; block.headlineRu = ''; block.bodyEn = ''; block.bodyRu = ''; }
    blocks.push(block);
    renderBlocks();
  });

  function renderBlocks() {
    var wrap = $('f-blocks'); wrap.innerHTML = '';
    blocks.forEach(function (b, i) {
      var el = document.createElement('div');
      el.className = 'a-block';
      var typeLabels = { full: 'Full image', 'full-vh': 'Full image (tall crop)', split: 'Two images', text: 'Text', green: 'Green highlight' };
      var head = '<div class="a-block-head"><span class="a-block-type">' + (typeLabels[b.type] || b.type) + '</span>' +
        '<span><button class="a-btn a-btn--ghost a-btn--sm" data-bup="' + i + '">▲</button> ' +
        '<button class="a-btn a-btn--ghost a-btn--sm" data-bdown="' + i + '">▼</button> ' +
        '<button class="a-btn a-btn--danger a-btn--sm" data-brm="' + i + '">✕</button></span></div>';
      var bodyHtml = '';
      if (b.type === 'full' || b.type === 'full-vh') {
        bodyHtml = '<input type="file" accept="image/*" data-bimg="' + i + '">' +
          (b.img ? '<img class="a-thumb" src="' + b.img + '">' : '<img class="a-thumb hidden" data-bthumb="' + i + '">');
      } else if (b.type === 'split') {
        bodyHtml = '<div class="a-cols">' +
          '<div><input type="file" accept="image/*" data-bimg2="' + i + '-0">' + (b.imgs[0] ? '<img class="a-thumb" src="' + b.imgs[0] + '">' : '<img class="a-thumb hidden" data-bthumb2="' + i + '-0">') + '</div>' +
          '<div><input type="file" accept="image/*" data-bimg2="' + i + '-1">' + (b.imgs[1] ? '<img class="a-thumb" src="' + b.imgs[1] + '">' : '<img class="a-thumb hidden" data-bthumb2="' + i + '-1">') + '</div>' +
          '</div>';
      } else if (b.type === 'text') {
        bodyHtml = '<div class="a-cols">' +
          '<div><label class="a-lbl">Text EN</label><textarea data-bfield="' + i + '.en">' + (b.en || '') + '</textarea></div>' +
          '<div><label class="a-lbl">Text RU</label><textarea data-bfield="' + i + '.ru">' + (b.ru || '') + '</textarea></div>' +
          '</div>';
      } else if (b.type === 'green') {
        bodyHtml = '<div class="a-cols">' +
          '<div><label class="a-lbl">Headline EN</label><textarea data-bfield="' + i + '.headlineEn">' + (b.headlineEn || '') + '</textarea></div>' +
          '<div><label class="a-lbl">Headline RU</label><textarea data-bfield="' + i + '.headlineRu">' + (b.headlineRu || '') + '</textarea></div>' +
          '<div><label class="a-lbl">Body EN</label><textarea data-bfield="' + i + '.bodyEn">' + (b.bodyEn || '') + '</textarea></div>' +
          '<div><label class="a-lbl">Body RU</label><textarea data-bfield="' + i + '.bodyRu">' + (b.bodyRu || '') + '</textarea></div>' +
          '</div>';
      }
      el.innerHTML = head + bodyHtml;
      wrap.appendChild(el);
    });
  }

  // block interactions (delegated)
  $('f-blocks').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.brm != null) { blocks.splice(+b.dataset.brm, 1); renderBlocks(); }
    else if (b.dataset.bup != null) { var i = +b.dataset.bup; if (i > 0) { var t = blocks[i]; blocks[i] = blocks[i - 1]; blocks[i - 1] = t; renderBlocks(); } }
    else if (b.dataset.bdown != null) { var k = +b.dataset.bdown; if (k < blocks.length - 1) { var u = blocks[k]; blocks[k] = blocks[k + 1]; blocks[k + 1] = u; renderBlocks(); } }
  });
  $('f-blocks').addEventListener('input', function (e) {
    var f = e.target.dataset.bfield;
    if (f) { var parts = f.split('.'); blocks[+parts[0]][parts[1]] = e.target.value; }
  });
  $('f-blocks').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.bimg != null) {
      var i = +t.dataset.bimg; blocks[i]._file = t.files[0] || null;
      var thumb = $('f-blocks').querySelector('[data-bthumb="' + i + '"]');
      if (thumb && t.files[0]) { thumb.src = URL.createObjectURL(t.files[0]); thumb.classList.remove('hidden'); }
    } else if (t.dataset.bimg2 != null) {
      var p = t.dataset.bimg2.split('-'); var bi = +p[0], si = +p[1];
      blocks[bi]._files = blocks[bi]._files || [null, null];
      blocks[bi]._files[si] = t.files[0] || null;
      var th = $('f-blocks').querySelector('[data-bthumb2="' + bi + '-' + si + '"]');
      if (th && t.files[0]) { th.src = URL.createObjectURL(t.files[0]); th.classList.remove('hidden'); }
    }
  });

  // ============================================================
  // PUBLISH
  // ============================================================
  $('a-new').addEventListener('click', newCase);
  $('a-cancel').addEventListener('click', function () { editing ? editCase(editing.id) : newCase(); });

  function uploadImage(file, slug) {
    var path = 'images/' + slug + '/' + safeName(file.name);
    return fileToBase64(file).then(function (b64) {
      return getContent(path).then(function (ex) {
        return putFile(path, b64, 'Upload ' + path + ' via admin', ex && ex.sha);
      });
    }).then(function () { return '/' + path; });
  }

  $('a-publish').addEventListener('click', function () {
    var el = $('a-log'); el.innerHTML = '';
    var status = $('a-publish-status');

    var slug = slugify($('f-slug').value || $('f-title').value);
    var title = $('f-title').value.trim();
    if (!title) { log(el, 'Title (EN) is required.', 'err'); return; }
    if (!slug) { log(el, 'Slug is required.', 'err'); return; }
    var cats = getCats();
    if (!cats.length) { log(el, 'Pick at least one direction.', 'err'); return; }

    var isTemplate = editing ? !!editing.template : true;

    // slug uniqueness (except self)
    var clash = projects.some(function (p) { return p.slug === slug && (!editing || p.id !== editing.id); });
    if (clash) { log(el, 'Slug "' + slug + '" already exists — pick another.', 'err'); return; }

    $('a-publish').disabled = true;
    status.textContent = 'Publishing…';

    // Build the project record
    var rec = editing ? JSON.parse(JSON.stringify(editing)) : {};
    rec.slug = slug;
    rec.title = title;
    rec.titleRu = $('f-titleRu').value.trim() || title;
    rec.categories = cats;
    rec.type = $('f-type').value.trim();
    rec.typeRu = $('f-typeRu').value.trim() || rec.type;
    rec.year = $('f-year').value.trim();
    if (!editing) { rec.template = true; }
    if (rec.template) {
      rec.subEn = $('f-subEn').value.trim();
      rec.subRu = $('f-subRu').value.trim();
      rec.descEn = $('f-descEn').value.trim();
      rec.descRu = $('f-descRu').value.trim();
      rec.href = '/' + slug;
      rec.hrefRu = '/' + slug + '-ru';
    }
    if (!rec.id) rec.id = (projects.reduce(function (m, p) { return Math.max(m, +p.id || 0); }, 0) + 1);

    // Chain: upload cover → upload block images → generate HTML → update json
    var chain = Promise.resolve();

    if (coverFile) {
      chain = chain.then(function () { log(el, 'Uploading cover…'); return uploadImage(coverFile, slug); })
        .then(function (path) { rec.cover = path; if (!rec.imgs || !rec.imgs.length) rec.imgs = [path]; log(el, '✓ cover', 'ok'); });
    }

    if (rec.template) {
      // process block images
      blocks.forEach(function (b, i) {
        if ((b.type === 'full' || b.type === 'full-vh') && b._file) {
          chain = chain.then(function () { log(el, 'Uploading block ' + (i + 1) + ' image…'); return uploadImage(b._file, slug); })
            .then(function (p) { b.img = p; });
        } else if (b.type === 'split' && b._files) {
          b._files.forEach(function (f, si) {
            if (f) chain = chain.then(function () { log(el, 'Uploading block ' + (i + 1) + ' image ' + (si + 1) + '…'); return uploadImage(f, slug); })
              .then(function (p) { b.imgs[si] = p; });
          });
        }
      });

      chain = chain.then(function () {
        // strip transient fields before saving
        rec.blocks = blocks.map(function (b) {
          var c = {}; for (var k in b) if (k[0] !== '_') c[k] = b[k];
          return c;
        });
        var enHtml = window.buildCaseHTML(rec, 'en');
        var ruHtml = window.buildCaseHTML(rec, 'ru');
        log(el, 'Writing ' + slug + '.html…');
        return putText(slug + '.html', enHtml, 'Publish case ' + slug + ' (EN) via admin');
      }).then(function () {
        log(el, '✓ ' + slug + '.html', 'ok');
        log(el, 'Writing ' + slug + '-ru.html…');
        return putText(slug + '-ru.html', window.buildCaseHTML(rec, 'ru'), 'Publish case ' + slug + ' (RU) via admin');
      }).then(function () { log(el, '✓ ' + slug + '-ru.html', 'ok'); });
    }

    // update projects.json
    chain.then(function () {
      if (editing) {
        projects = projects.map(function (p) { return String(p.id) === String(rec.id) ? rec : p; });
      } else {
        projects.push(rec);
      }
      log(el, 'Updating projects.json…');
      return putText('data/projects.json', JSON.stringify(projects, null, 2) + '\n', (editing ? 'Update' : 'Add') + ' ' + slug + ' via admin');
    }).then(function (r) {
      projectsSha = r.content.sha;
      renderList();
      editing = rec;
      $('a-editor-title').textContent = 'Edit — ' + rec.title;
      status.textContent = '';
      log(el, '✓ Done! Site rebuilds in ~1 min.', 'ok');
      $('a-publish').disabled = false;
    }).catch(function (e) {
      log(el, e.message, 'err');
      status.textContent = 'Failed.';
      $('a-publish').disabled = false;
    });
  });

  // ---- boot ----
  if (token) { $('a-token').value = token; unlock(); }
})();
