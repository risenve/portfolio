/* ============================================================
   admin.js — personal admin for ripsime.me
   Publishes case studies straight to risenve/portfolio via the
   GitHub Contents API using a fine-grained token (localStorage).
   ============================================================ */
(function () {
  'use strict';

  var OWNER = 'risenve', REPO = 'portfolio', BRANCH = 'main';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
  var VAULT_KEY = 'rp_admin_vault';   // encrypted token {salt, iv, ct}
  var OLD_TOKEN_KEY = 'rp_admin_token'; // legacy plaintext (migrated away)

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
  var token = '';          // decrypted GitHub token, kept only in memory
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

  // ---- crypto (encrypt the token with the password; Web Crypto, AES-GCM) ----
  function abToB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64ToU8(b64) {
    var s = atob(b64), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function deriveKey(password, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (km) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' },
          km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function encryptToken(password, plainToken) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plainToken));
    }).then(function (ct) {
      return { salt: abToB64(salt), iv: abToB64(iv), ct: abToB64(ct) };
    });
  }
  function decryptToken(password, vault) {
    return deriveKey(password, b64ToU8(vault.salt)).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToU8(vault.iv) }, key, b64ToU8(vault.ct));
    }).then(function (pt) {
      return new TextDecoder().decode(pt);
    });
  }
  function getVault() {
    try { return JSON.parse(localStorage.getItem(VAULT_KEY)); } catch (e) { return null; }
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
  // ACCESS GATE — Stage 1: team password · Stage 2: GitHub token
  // ============================================================
  // SHA-256 of the team password (kept as a hash, not plaintext).
  var PASS_HASH = '22ec276eb2e7776f06c57ea150ba8f3b117e061e7ab81c94b465043275a9547a';
  var pw = '';  // verified password, kept in memory to en/decrypt the token vault

  function sha256hex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function showStage(name) {
    $('a-stage-pass').style.display = name === 'pass' ? 'contents' : 'none';
    $('a-stage-token').style.display = name === 'token' ? 'contents' : 'none';
    setTimeout(function () { var f = $(name === 'pass' ? 'a-pass' : 'a-token'); if (f) f.focus(); }, 50);
  }
  function showGateMode() {
    gate.style.display = 'flex';
    app.classList.add('hidden');
    $('a-gate-log').innerHTML = ''; $('a-gate-log2').innerHTML = '';
    showStage('pass');
  }

  function verifyToken() {
    return fetch(API, { headers: ghHeaders() }).then(function (r) {
      if (!r.ok) throw new Error('Repo access failed (' + r.status + '). Check the token scope.');
      return r.json();
    });
  }
  function enterApp(glog) {
    log(glog, 'Checking access…');
    return verifyToken().then(function () {
      gate.style.display = 'none';
      app.classList.remove('hidden');
      $('a-pass').value = ''; $('a-token').value = '';
      return loadProjects();
    });
  }

  // Stage 1: team password
  $('a-pass-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var glog = $('a-gate-log'); glog.innerHTML = '';
    var input = $('a-pass').value;
    if (!input) { log(glog, 'Enter the password.', 'err'); return; }
    sha256hex(input).then(function (h) {
      if (h !== PASS_HASH) { log(glog, 'Wrong password.', 'err'); return; }
      pw = input;
      var vault = getVault();
      if (!vault) { showStage('token'); return; }
      // token already saved → decrypt with the password and go in
      log(glog, 'Unlocking…');
      decryptToken(pw, vault).then(
        function (tok) { token = tok; return enterApp(glog).catch(function (er) { token = ''; log(glog, er.message, 'err'); }); },
        function () { showStage('token'); log($('a-gate-log2'), 'Saved token could not be read — paste it again.', 'err'); }
      );
    });
  });

  // Stage 2: GitHub token → verify → encrypt with password → save
  $('a-token-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var glog = $('a-gate-log2'); glog.innerHTML = '';
    var tok = $('a-token').value.trim();
    if (!tok) { log(glog, 'Paste your GitHub token.', 'err'); return; }
    if (!pw) { showStage('pass'); return; }
    token = tok;
    log(glog, 'Verifying token…');
    verifyToken().then(function () {
      return encryptToken(pw, tok);
    }).then(function (vault) {
      localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
      localStorage.removeItem(OLD_TOKEN_KEY);
      return enterApp(glog);
    }).catch(function (er) { token = ''; log(glog, er.message, 'err'); });
  });

  // Lock: drop in-memory secrets, require password again
  $('a-lock').addEventListener('click', function () {
    token = ''; pw = '';
    showGateMode();
  });

  // Reset token: wipe the saved (encrypted) token; next login re-asks for it
  $('a-reset-token').addEventListener('click', function () {
    if (!confirm('Remove the saved GitHub token from this browser? You\'ll paste it again next time.')) return;
    localStorage.removeItem(VAULT_KEY);
    localStorage.removeItem(OLD_TOKEN_KEY);
    token = ''; pw = '';
    showGateMode();
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
    $('a-bespoke-edit').classList.toggle('hidden', isTemplate);
  }

  // ---- case theme (dark / light) ----
  var curTheme = 'dark';
  function setTheme(t) {
    curTheme = (t === 'light') ? 'light' : 'dark';
    Array.prototype.forEach.call($('f-theme').querySelectorAll('.a-theme-opt'), function (b) {
      b.classList.toggle('a-theme-opt--on', b.dataset.theme === curTheme);
    });
  }
  $('f-theme').addEventListener('click', function (e) {
    var b = e.target.closest('.a-theme-opt'); if (!b) return;
    setTheme(b.dataset.theme);
  });

  // ---- collect the current form into a project record (no uploads) ----
  // forPreview=true resolves not-yet-uploaded images to temporary blob URLs.
  function collectRecord(forPreview) {
    var slug = slugify($('f-slug').value || $('f-title').value) || 'preview';
    var rec = editing ? JSON.parse(JSON.stringify(editing)) : {};
    rec.slug = slug;
    rec.title = $('f-title').value.trim() || 'Untitled';
    rec.titleRu = $('f-titleRu').value.trim() || rec.title;
    rec.categories = getCats();
    rec.type = $('f-type').value.trim();
    rec.typeRu = $('f-typeRu').value.trim() || rec.type;
    rec.year = $('f-year').value.trim();
    var isTemplate = editing ? !!editing.template : true;
    if (isTemplate) {
      rec.template = true;
      rec.theme = curTheme;
      rec.subEn = $('f-subEn').value.trim();
      rec.subRu = $('f-subRu').value.trim();
      rec.descEn = $('f-descEn').value.trim();
      rec.descRu = $('f-descRu').value.trim();
      rec.href = '/' + slug; rec.hrefRu = '/' + slug + '-ru';
      rec.blocks = blocks.map(function (b) {
        var c = {}; for (var k in b) if (k[0] !== '_') c[k] = b[k];
        if (forPreview) {
          if ((b.type === 'full' || b.type === 'full-vh') && b._file) c.img = URL.createObjectURL(b._file);
          if (b.type === 'split' && b._files) {
            c.imgs = (c.imgs || []).slice();
            b._files.forEach(function (f, i) { if (f) c.imgs[i] = URL.createObjectURL(f); });
          }
        }
        return c;
      });
    }
    if (forPreview && coverFile) rec.cover = URL.createObjectURL(coverFile);
    return rec;
  }

  // ---- Editor / Preview tabs ----
  function showTab(which) {
    var preview = which === 'preview';
    $('a-form').classList.toggle('hidden', preview);
    $('a-preview').classList.toggle('hidden', !preview);
    $('a-tab-editor').classList.toggle('a-tab--on', !preview);
    $('a-tab-preview').classList.toggle('a-tab--on', preview);
    if (preview) renderPreview(previewLang);
  }
  var previewLang = 'en';
  function renderPreview(lang) {
    previewLang = lang === 'ru' ? 'ru' : 'en';
    $('a-prev-en').classList.toggle('a-tab--on', previewLang === 'en');
    $('a-prev-ru').classList.toggle('a-tab--on', previewLang === 'ru');
    $('a-preview-lang-label').textContent = previewLang.toUpperCase();
    var frame = $('a-preview-frame');
    var isTemplate = editing ? !!editing.template : true;
    if (!isTemplate) {
      if (bespokeDoc) {
        syncMainOrder();
        frame.srcdoc = '<!DOCTYPE html>\n' + bespokeDoc.documentElement.outerHTML;
      } else {
        frame.srcdoc = '<body style="margin:0;background:#000;color:#888;font:14px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;">Hand-built page — click “Load page content” in the editor to load and preview it.</body>';
      }
      return;
    }
    frame.srcdoc = window.buildCaseHTML(collectRecord(true), previewLang, { preview: true });
  }
  $('a-tab-editor').addEventListener('click', function () { showTab('editor'); });
  $('a-tab-preview').addEventListener('click', function () { showTab('preview'); });
  $('a-prev-en').addEventListener('click', function () { renderPreview('en'); });
  $('a-prev-ru').addEventListener('click', function () { renderPreview('ru'); });

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
    setTheme('dark');
    resetBespoke();
    setTemplateMode(true); // new cases are always template-generated
    showTab('editor');
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
    setTheme(p.theme || 'dark');
    if (p.cover) { $('f-cover-thumb').src = p.cover; $('f-cover-thumb').classList.remove('hidden'); }
    blocks = (p.blocks || []).map(function (b) { return JSON.parse(JSON.stringify(b)); });
    renderBlocks();
    setTemplateMode(!!p.template);
    resetBespoke();
    if (!p.template) {
      var file = pageFileFor(p);
      $('a-import-row').style.display = file ? 'flex' : 'none';
      $('a-import-status').textContent = file ? '' : 'This project links elsewhere — page body isn’t editable here.';
    }
    showTab('editor');
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
  // EXISTING (HAND-BUILT) PAGE EDITOR
  // Loads the real <slug>.html, models each <main> section as an
  // editable block (swap images / edit text / reorder / add / delete)
  // and writes the same file back — layout stays intact.
  // ============================================================
  var bespokeFile = null;   // e.g. "skazpokrayu.html"
  var bespokeDoc = null;    // parsed Document
  var bespokeMain = null;   // <main> element
  var bespokeSha = null;    // sha of the page file
  var bespokeSections = []; // [{ id, el, imgs:[nodes], texts:[nodes] }]
  var bespokeUploads = [];  // [{ node, file }] pending image replacements
  var sidSeq = 0;

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Which HTML file backs this project (internal pages only)
  function pageFileFor(p) {
    var h = (p && p.href) || '';
    if (h.charAt(0) !== '/' || h === '/#') return null;
    return h.replace(/^\//, '').split(/[?#]/)[0] + '.html';
  }
  function secById(id) {
    for (var i = 0; i < bespokeSections.length; i++) if (bespokeSections[i].id === id) return bespokeSections[i];
    return null;
  }
  function secIndex(id) {
    for (var i = 0; i < bespokeSections.length; i++) if (bespokeSections[i].id === id) return i;
    return -1;
  }

  function resetBespoke() {
    bespokeFile = null; bespokeDoc = null; bespokeMain = null; bespokeSha = null;
    bespokeSections = []; bespokeUploads = [];
    if ($('a-sections')) $('a-sections').innerHTML = '';
    $('a-bespoke-add').style.display = 'none';
    $('a-bespoke-actions').style.display = 'none';
    $('a-bespoke-log').innerHTML = '';
    $('a-import-status').textContent = '';
  }

  function addSectionModel(el, atIndex) {
    var imgs = Array.prototype.slice.call(el.querySelectorAll('img'));
    var texts = Array.prototype.slice.call(el.querySelectorAll('p, h1, h2, h3, h4, blockquote'))
      .filter(function (n) { return n.textContent.trim().length && !n.querySelector('img'); });
    var m = { id: ++sidSeq, el: el, imgs: imgs, texts: texts };
    if (atIndex == null) bespokeSections.push(m); else bespokeSections.splice(atIndex, 0, m);
    return m;
  }

  function secLabel(m) {
    var c = (m.el.className || '') + '';
    if (/hero/.test(c)) return 'Hero';
    if (/project-info|skp-project-info/.test(c)) return 'Project info';
    if (/cred/.test(c)) return 'Credits';
    if (/green/.test(c)) return 'Green highlight';
    if (m.el.querySelector('video')) return 'Video';
    var i = m.imgs.length, t = m.texts.length;
    if (i > 1) return i + ' images';
    if (i === 1 && !t) return 'Image';
    if (!i && t) return 'Text';
    if (i && t) return 'Image + text';
    return (m.el.tagName || 'section').toLowerCase();
  }

  function renderSections() {
    var wrap = $('a-sections'); wrap.innerHTML = '';
    bespokeSections.forEach(function (m) {
      var card = document.createElement('div');
      card.className = 'a-block'; card.dataset.sid = m.id;
      var head = '<div class="a-block-head"><span class="a-block-type">' + escHtml(secLabel(m)) + '</span>' +
        '<span><button class="a-btn a-btn--ghost a-btn--sm" data-sup="' + m.id + '">▲</button> ' +
        '<button class="a-btn a-btn--ghost a-btn--sm" data-sdown="' + m.id + '">▼</button> ' +
        '<button class="a-btn a-btn--danger a-btn--sm" data-sdel="' + m.id + '">✕</button></span></div>';
      var body = '';
      m.imgs.forEach(function (img, j) {
        var src = img.getAttribute('src') || '';
        body += '<div class="a-simg" style="margin-top:8px;">' +
          '<input type="file" accept="image/*" data-simg="' + m.id + ':' + j + '">' +
          (src ? '<img class="a-thumb" src="' + escHtml(src) + '">' : '') + '</div>';
      });
      m.texts.forEach(function (t, k) {
        body += '<label class="a-lbl">Text</label><textarea data-stext="' + m.id + ':' + k + '">' + escHtml(t.textContent) + '</textarea>';
      });
      if (!m.imgs.length && !m.texts.length) body += '<div class="a-hint">Custom / media block — reorder or delete only.</div>';
      card.innerHTML = head + body;
      wrap.appendChild(card);
    });
  }

  function parseBespoke(html) {
    bespokeDoc = new DOMParser().parseFromString(html, 'text/html');
    bespokeMain = bespokeDoc.querySelector('main');
    bespokeSections = []; bespokeUploads = [];
    if (!bespokeMain) throw new Error('No <main> content found on this page.');
    Array.prototype.forEach.call(bespokeMain.children, function (el) {
      if (el.nodeType === 1) addSectionModel(el);
    });
    renderSections();
  }

  function importBespoke() {
    if (!editing) return;
    var file = pageFileFor(editing);
    var st = $('a-import-status');
    if (!file) { st.textContent = 'This project links elsewhere — no page to edit.'; return; }
    bespokeFile = file; st.textContent = 'Loading ' + file + '…';
    getContent(file).then(function (f) {
      if (!f) throw new Error(file + ' not found in the repo.');
      bespokeSha = f.sha;
      parseBespoke(b64DecodeUtf8(f.content));
      st.textContent = 'Loaded — ' + bespokeSections.length + ' blocks. Edit, then Preview & Save.';
      $('a-bespoke-add').style.display = 'flex';
      $('a-bespoke-actions').style.display = 'block';
    }).catch(function (e) { st.textContent = e.message; });
  }

  // Re-append section nodes to <main> in the current array order (moves existing nodes)
  function syncMainOrder() {
    if (!bespokeMain) return;
    bespokeSections.forEach(function (m) { bespokeMain.appendChild(m.el); });
  }

  function moveSection(id, dir) {
    var i = secIndex(id), j = i + dir;
    if (i < 0 || j < 0 || j >= bespokeSections.length) return;
    var t = bespokeSections[i]; bespokeSections[i] = bespokeSections[j]; bespokeSections[j] = t;
    renderSections();
    if (!$('a-preview').classList.contains('hidden')) renderPreview(previewLang);
  }
  function removeSection(id) {
    var m = secById(id); if (!m) return;
    if (!confirm('Remove this block from the page?')) return;
    if (m.el && m.el.parentNode) m.el.parentNode.removeChild(m.el);
    bespokeUploads = bespokeUploads.filter(function (u) { return m.imgs.indexOf(u.node) === -1; });
    bespokeSections = bespokeSections.filter(function (x) { return x.id !== id; });
    renderSections();
    if (!$('a-preview').classList.contains('hidden')) renderPreview(previewLang);
  }

  // New self-contained blocks (inline-styled so they render on any page)
  function makeNewSection(type) {
    var d = bespokeDoc, s = d.createElement('section');
    if (type === 'full') {
      s.setAttribute('style', 'width:100%;overflow:hidden;');
      var img = d.createElement('img'); img.setAttribute('style', 'width:100%;display:block;'); img.setAttribute('alt', '');
      s.appendChild(img);
    } else if (type === 'split') {
      s.setAttribute('style', 'display:grid;grid-template-columns:1fr 1fr;gap:4px;');
      for (var i = 0; i < 2; i++) { var im = d.createElement('img'); im.setAttribute('style', 'width:100%;display:block;'); im.setAttribute('alt', ''); s.appendChild(im); }
    } else if (type === 'text') {
      s.setAttribute('style', 'padding:80px 6vw;');
      var p = d.createElement('p'); p.setAttribute('style', 'max-width:620px;font-size:20px;line-height:1.55;margin:0;');
      p.textContent = 'New text block'; s.appendChild(p);
    }
    return s;
  }

  $('a-import-btn').addEventListener('click', importBespoke);

  $('a-bespoke-add').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-badd]'); if (!b || !bespokeDoc) return;
    var el = makeNewSection(b.dataset.badd);
    bespokeMain.appendChild(el);
    addSectionModel(el);
    renderSections();
  });

  $('a-sections').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sdel != null) removeSection(+b.dataset.sdel);
    else if (b.dataset.sup != null) moveSection(+b.dataset.sup, -1);
    else if (b.dataset.sdown != null) moveSection(+b.dataset.sdown, 1);
  });
  $('a-sections').addEventListener('input', function (e) {
    var d = e.target.dataset.stext; if (!d) return;
    var p = d.split(':'), m = secById(+p[0]); if (!m) return;
    var node = m.texts[+p[1]]; if (node) node.textContent = e.target.value;
  });
  $('a-sections').addEventListener('change', function (e) {
    var d = e.target.dataset.simg; if (d == null) return;
    var file = e.target.files[0]; if (!file) return;
    var p = d.split(':'), m = secById(+p[0]); if (!m) return;
    var node = m.imgs[+p[1]]; if (!node) return;
    var url = URL.createObjectURL(file);
    node.setAttribute('src', url);
    bespokeUploads = bespokeUploads.filter(function (u) { return u.node !== node; });
    bespokeUploads.push({ node: node, file: file });
    var thumb = e.target.parentNode.querySelector('img.a-thumb');
    if (thumb) thumb.src = url;
    else { var im = document.createElement('img'); im.className = 'a-thumb'; im.src = url; e.target.parentNode.appendChild(im); }
  });

  $('a-save-page').addEventListener('click', function () {
    if (!bespokeDoc || !bespokeFile) return;
    var el = $('a-bespoke-log'); el.innerHTML = '';
    var status = $('a-save-page-status');
    var slug = slugify($('f-slug').value || (editing && editing.slug) || 'case');
    $('a-save-page').disabled = true; status.textContent = 'Saving…';

    var chain = Promise.resolve();
    bespokeUploads.forEach(function (u, i) {
      chain = chain.then(function () { log(el, 'Uploading image ' + (i + 1) + '/' + bespokeUploads.length + '…'); return uploadImage(u.file, slug); })
        .then(function (path) { u.node.setAttribute('src', path); });
    });
    chain.then(function () {
      syncMainOrder();
      var html = '<!DOCTYPE html>\n' + bespokeDoc.documentElement.outerHTML + '\n';
      log(el, 'Writing ' + bespokeFile + '…');
      return putFile(bespokeFile, b64EncodeUtf8(html), 'Edit ' + bespokeFile + ' content via admin', bespokeSha);
    }).then(function (r) {
      bespokeSha = r.content.sha;
      bespokeUploads = [];
      status.textContent = '';
      log(el, '✓ Saved ' + bespokeFile + '. Site rebuilds in ~1 min.', 'ok');
      $('a-save-page').disabled = false;
    }).catch(function (e) {
      log(el, e.message, 'err'); status.textContent = 'Failed.'; $('a-save-page').disabled = false;
    });
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
      rec.theme = curTheme;
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

  // ============================================================
  // PIECES  (virtual museum — data/pieces.json + images/pieces/*)
  // ============================================================
  var pieces = [];          // current pieces.json array
  var piecesSha = null;     // sha of pieces.json
  var pcEditing = null;     // piece being edited (null = new)
  var pcImgs = [];          // compressed images for a new upload [{base64,w,h}, ...]
  var pcPdfData = null;     // optional PDF { base64, name }
  var piecesLoaded = false; // lazy-load guard

  // Downscale + convert to WebP entirely in the browser.
  function compressToWebp(file, maxDim, quality) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var s = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        c.toBlob(function (blob) {
          if (!blob) { rej(new Error('WebP not supported in this browser')); return; }
          var r = new FileReader();
          r.onload = function () { res({ base64: String(r.result).split(',')[1], w: cw, h: ch }); };
          r.onerror = function () { rej(new Error('read failed')); };
          r.readAsDataURL(blob);
        }, 'image/webp', quality);
      };
      img.onerror = function () { rej(new Error('not a valid image')); };
      img.src = URL.createObjectURL(file);
    });
  }

  function nextPcId() {
    return pieces.reduce(function (m, p) { return Math.max(m, +p.id || 0); }, 0) + 1;
  }

  function loadPieces() {
    return getContent('data/pieces.json').then(function (f) {
      if (!f) { pieces = []; piecesSha = null; }
      else { pieces = JSON.parse(b64DecodeUtf8(f.content)); piecesSha = f.sha; }
      renderPcList();
      newPiece();
    });
  }

  function renderPcList() {
    var wrap = $('pc-list'); wrap.innerHTML = '';
    pieces.forEach(function (p, idx) {
      var row = document.createElement('div');
      row.className = 'a-prow';
      var thumb = p.img
        ? '<img src="' + p.img + '" style="width:34px;height:34px;object-fit:cover;border-radius:5px;border:1px solid var(--a-line);flex-shrink:0;">'
        : '<div style="width:34px;height:34px;border-radius:5px;background:#23232a;flex-shrink:0;"></div>';
      row.innerHTML =
        '<div class="a-ord"><button data-pcup="' + idx + '">▲</button><button data-pcdown="' + idx + '">▼</button></div>' +
        thumb +
        '<div class="a-prow-main">' +
          '<div class="a-prow-title">' + (p.title || 'Untitled') + '</div>' +
          '<div class="a-prow-meta">' + [p.year, p.collection].filter(Boolean).join(' · ') + '</div>' +
        '</div>' +
        '<button class="a-btn a-btn--ghost a-btn--sm" data-pcedit="' + p.id + '">Edit</button>' +
        '<button class="a-btn a-btn--danger a-btn--sm" data-pcdel="' + p.id + '">✕</button>';
      wrap.appendChild(row);
    });
  }

  function movePc(idx, dir) {
    var j = idx + dir;
    if (j < 0 || j >= pieces.length) return;
    var t = pieces[idx]; pieces[idx] = pieces[j]; pieces[j] = t;
    renderPcList();
  }

  function pcFirstImg(p) { return p.img || (p.imgs && p.imgs[0]) || ''; }

  function newPiece() {
    pcEditing = null; pcImgs = []; pcPdfData = null;
    $('pc-editor-title').textContent = 'New piece';
    ['pc-title', 'pc-story', 'pc-year', 'pc-link', 'pc-collection'].forEach(function (id) { $(id).value = ''; });
    $('pc-img').value = ''; $('pc-pdf').value = '';
    var th = $('pc-thumb'); th.classList.add('hidden'); th.src = '';
    $('pc-log').innerHTML = ''; $('pc-status').textContent = '';
  }

  function editPiece(id) {
    var p = pieces.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    pcEditing = p; pcImgs = []; pcPdfData = null;
    $('pc-editor-title').textContent = 'Edit — ' + (p.title || '');
    $('pc-title').value = p.title || ''; $('pc-story').value = p.story || '';
    $('pc-year').value = p.year || ''; $('pc-link').value = p.link || '';
    $('pc-collection').value = p.collection || '';
    var th = $('pc-thumb'); var first = pcFirstImg(p);
    if (first) { th.src = first; th.classList.remove('hidden'); } else { th.classList.add('hidden'); th.src = ''; }
    $('pc-img').value = ''; $('pc-pdf').value = '';
    $('pc-log').innerHTML = '';
    var extra = [];
    if (p.imgs && p.imgs.length > 1) extra.push(p.imgs.length + ' photos');
    if (p.pdf) extra.push('PDF attached');
    $('pc-log').innerHTML = ''; if (extra.length) log($('pc-log'), 'Current: ' + extra.join(' · '), 'ok');
    $('pc-status').textContent = '';
    window.scrollTo(0, 0);
  }

  function deletePiece(id) {
    var p = pieces.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    if (!confirm('Remove "' + (p.title || 'piece') + '" from Pieces?\n\n(Updates pieces.json. The image file stays in the repo.)')) return;
    var el = $('pc-log'); el.innerHTML = ''; log(el, 'Removing…');
    pieces = pieces.filter(function (x) { return String(x.id) !== String(id); });
    putText('data/pieces.json', JSON.stringify(pieces, null, 2) + '\n', 'Remove piece via admin')
      .then(function (r) { piecesSha = r.content.sha; renderPcList(); newPiece(); log(el, '✓ Removed.', 'ok'); })
      .catch(function (e) { log(el, e.message, 'err'); });
  }

  $('pc-list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pcedit) editPiece(b.dataset.pcedit);
    else if (b.dataset.pcdel) deletePiece(b.dataset.pcdel);
    else if (b.dataset.pcup) movePc(+b.dataset.pcup, -1);
    else if (b.dataset.pcdown) movePc(+b.dataset.pcdown, 1);
  });

  $('pc-img').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files); if (!files.length) return;
    var th = $('pc-thumb'); th.src = URL.createObjectURL(files[0]); th.classList.remove('hidden');
    var el = $('pc-log'); el.innerHTML = ''; log(el, 'Preparing ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '…');
    Promise.all(files.map(function (f) { return compressToWebp(f, 1800, 0.82); }))
      .then(function (arr) { pcImgs = arr; el.innerHTML = ''; log(el, '✓ ' + arr.length + ' image(s) ready (first ' + arr[0].w + '×' + arr[0].h + ').', 'ok'); })
      .catch(function (e) { pcImgs = []; el.innerHTML = ''; log(el, 'Image error: ' + e.message, 'err'); });
  });

  $('pc-pdf').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) { pcPdfData = null; return; }
    var el = $('pc-log'); log(el, 'Reading PDF…');
    fileToBase64(f)
      .then(function (b64) { pcPdfData = { base64: b64, name: f.name }; log(el, '✓ PDF ready (' + f.name + ').', 'ok'); })
      .catch(function (e) { pcPdfData = null; log(el, 'PDF error: ' + e.message, 'err'); });
  });

  $('pc-cancel').addEventListener('click', newPiece);
  $('pc-new').addEventListener('click', newPiece);

  $('pc-save-order').addEventListener('click', function () {
    var el = $('pc-log'); el.innerHTML = ''; log(el, 'Saving order…');
    putText('data/pieces.json', JSON.stringify(pieces, null, 2) + '\n', 'Reorder pieces via admin')
      .then(function (r) { piecesSha = r.content.sha; log(el, '✓ Order saved. Site rebuilds in ~1 min.', 'ok'); })
      .catch(function (e) { log(el, e.message, 'err'); });
  });

  $('pc-publish').addEventListener('click', function () {
    var el = $('pc-log'); el.innerHTML = '';
    var title = $('pc-title').value.trim();
    if (!title) { log(el, 'Add a title.', 'err'); return; }
    if (!pcEditing && !pcImgs.length) { log(el, 'Choose at least one photo (and let it finish preparing).', 'err'); return; }

    var status = $('pc-status'); status.textContent = 'Publishing…';
    $('pc-publish').disabled = true;

    var rec = pcEditing ? JSON.parse(JSON.stringify(pcEditing)) : { id: nextPcId() };
    rec.title = title;
    rec.story = $('pc-story').value.trim();
    rec.year = $('pc-year').value.trim();
    rec.link = $('pc-link').value.trim();
    rec.collection = $('pc-collection').value.trim();

    var slug = slugify(title) || 'piece';
    var stamp = Date.now().toString(36);
    var chain = Promise.resolve();

    // new photos → upload all, replacing the piece's image set
    if (pcImgs.length) {
      var paths = pcImgs.map(function (_, i) {
        return 'images/pieces/' + slug + '-' + stamp + (pcImgs.length > 1 ? '-' + (i + 1) : '') + '.webp';
      });
      rec.imgs = paths.map(function (p) { return '/' + p; });
      rec.img = rec.imgs[0];
      rec.w = pcImgs[0].w; rec.h = pcImgs[0].h;
      chain = chain.then(function () { log(el, 'Uploading ' + pcImgs.length + ' photo(s)…'); });
      pcImgs.forEach(function (d, i) {
        chain = chain.then(function () { return putFile(paths[i], d.base64, 'Add piece image ' + paths[i], null); });
      });
      chain = chain.then(function () { log(el, '✓ photos uploaded', 'ok'); });
    }

    // optional PDF
    if (pcPdfData) {
      var pdfPath = 'files/pieces/' + slug + '-' + stamp + '.pdf';
      rec.pdf = '/' + pdfPath;
      chain = chain
        .then(function () { log(el, 'Uploading PDF…'); return putFile(pdfPath, pcPdfData.base64, 'Add piece pdf ' + pdfPath, null); })
        .then(function () { log(el, '✓ PDF uploaded', 'ok'); });
    }

    chain.then(function () {
      if (pcEditing) { pieces = pieces.map(function (p) { return String(p.id) === String(rec.id) ? rec : p; }); }
      else { pieces.push(rec); }
      log(el, 'Updating pieces.json…');
      return putText('data/pieces.json', JSON.stringify(pieces, null, 2) + '\n', (pcEditing ? 'Update' : 'Add') + ' piece via admin');
    }).then(function (r) {
      piecesSha = r.content.sha;
      renderPcList();
      pcEditing = rec;
      pcImgs = []; pcPdfData = null;
      $('pc-pdf').value = '';
      $('pc-editor-title').textContent = 'Edit — ' + rec.title;
      status.textContent = '';
      log(el, '✓ Done! Site rebuilds in ~1 min.', 'ok');
      $('pc-publish').disabled = false;
    }).catch(function (e) {
      log(el, e.message, 'err');
      status.textContent = 'Failed.';
      $('pc-publish').disabled = false;
    });
  });

  // ============================================================
  // MARKS  (live guest marks via the Apps Script store)
  // ============================================================
  var MARKS_URL = 'https://script.google.com/macros/s/AKfycbyMBrlj4gysDDAzlGgRroTFc9FKtC2t1ytamgSCHNhRCYTQuXYXgaojmyb7xEqvvWy2rQ/exec';
  var MARKS_SECRET_KEY = 'rp_marks_secret';
  var marks = [], commentsLoaded = false;
  var CM_SHAPES = {
    circle: '<circle cx="12" cy="12" r="10"/>', square: '<rect x="2" y="2" width="20" height="20" rx="4"/>',
    triangle: '<polygon points="12,2 22,21 2,21"/>',
    star: '<polygon points="12,2 14.9,8.6 22,9.2 16.5,13.9 18.3,21 12,17.1 5.7,21 7.5,13.9 2,9.2 9.1,8.6"/>',
    heart: '<path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"/>',
    flower: '<path d="M12 2a3 3 0 0 1 3 3 3 3 0 0 1 4.2 4.2A3 3 0 0 1 22 12a3 3 0 0 1-2.8 3 3 3 0 0 1-4.2 4.2A3 3 0 0 1 12 22a3 3 0 0 1-3-2.8A3 3 0 0 1 4.8 15 3 3 0 0 1 2 12a3 3 0 0 1 2.8-3A3 3 0 0 1 9 4.8 3 3 0 0 1 12 2z"/>'
  };
  function cmSvg(shape, color) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" style="fill:' + (color || '#FFC400') + '">' + (CM_SHAPES[shape] || CM_SHAPES.circle) + '</svg>';
  }
  function marksSecret() { try { return localStorage.getItem(MARKS_SECRET_KEY) || ''; } catch (e) { return ''; } }

  // read all marks via JSONP (the Apps Script GET is cross-origin)
  function loadComments() {
    return new Promise(function (resolve) {
      var cb = 'admMarks_' + Date.now();
      var s = document.createElement('script');
      window[cb] = function (list) {
        marks = Array.isArray(list) ? list : [];
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        renderCmList(); resolve();
      };
      s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); renderCmList(); resolve(); };
      s.src = MARKS_URL + '?callback=' + cb + '&_=' + Date.now();
      document.body.appendChild(s);
    });
  }

  function renderSecretPanel() {
    var box = $('cm-pending'); if (!box) return;
    var has = !!marksSecret();
    box.innerHTML =
      '<div class="a-note" style="line-height:1.6;">Marks are live — visitors post them straight to the museum and you get an email. To <b>delete</b> one, paste the moderation secret you set in your Apps Script (the <code>ADMIN_SECRET</code> line). It stays only in this browser.</div>' +
      '<label class="a-lbl">Moderation secret</label>' +
      '<input type="password" id="cm-secret" placeholder="' + (has ? '•••• saved' : 'paste secret') + '">' +
      '<div class="a-actions" style="margin-top:12px;">' +
        '<button class="a-btn a-btn--sm" id="cm-secret-save">Save</button>' +
        '<button class="a-btn a-btn--ghost a-btn--sm" id="cm-refresh">↻ Refresh</button></div>';
    $('cm-secret-save').addEventListener('click', function () {
      var v = $('cm-secret').value.trim(); if (!v) return;
      try { localStorage.setItem(MARKS_SECRET_KEY, v); } catch (e) {}
      $('cm-secret').value = '';
      log($('cm-log'), '✓ Secret saved in this browser.', 'ok');
      renderSecretPanel();
    });
    $('cm-refresh').addEventListener('click', function () { $('cm-log').innerHTML = ''; loadComments(); });
  }

  function renderCmList() {
    renderSecretPanel();
    var wrap = $('cm-list'); wrap.innerHTML = '';
    if (!marks.length) { wrap.innerHTML = '<div style="color:var(--a-muted);font-size:12px;padding:8px;">No marks yet.</div>'; return; }
    marks.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'a-prow';
      row.innerHTML =
        '<span style="flex-shrink:0;display:inline-flex;">' + cmSvg(c.shape, c.color) + '</span>' +
        '<div class="a-prow-main"><div class="a-prow-title" style="font-weight:400;">' + (c.text || '(no text)') + '</div>' +
        '<div class="a-prow-meta">' + (c.shape || '') + ' · ' + (c.color || '') + '</div></div>' +
        '<button class="a-btn a-btn--danger a-btn--sm" data-cmdel="' + c.id + '">✕</button>';
      wrap.appendChild(row);
    });
  }

  // delete via JSONP GET so we can actually READ the server's answer
  // (no-cors POST is a black hole — you never learn if it failed)
  function deleteMark(id, secret) {
    return new Promise(function (resolve) {
      var cb = 'admDel_' + Date.now();
      var s = document.createElement('script');
      var done = false;
      function finish(res) {
        if (done) return; done = true;
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(res);
      }
      window[cb] = function (res) { finish(res || {}); };
      s.onerror = function () { finish({ success: false, error: 'network' }); };
      s.src = MARKS_URL + '?action=delete&id=' + encodeURIComponent(id) +
        '&secret=' + encodeURIComponent(secret) + '&callback=' + cb + '&_=' + Date.now();
      document.body.appendChild(s);
      setTimeout(function () { finish({ success: false, error: 'timeout' }); }, 12000);
    });
  }

  $('cm-list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !b.dataset.cmdel) return;
    var id = b.dataset.cmdel;
    var secret = marksSecret();
    if (!secret) { alert('Paste your moderation secret in the panel on the right first.'); return; }
    if (!confirm('Remove this mark from the museum?')) return;
    var el = $('cm-log'); el.innerHTML = ''; log(el, 'Removing…');
    deleteMark(id, secret).then(function (res) {
      if (Array.isArray(res)) res = { success: false, error: 'noaction' };
      if (res && res.success) {
        marks = marks.filter(function (c) { return String(c.id) !== String(id); });
        renderCmList();
        log(el, '✓ Deleted from the museum.', 'ok');
        setTimeout(function () { loadComments(); }, 1200);
      } else {
        var why = res && res.error;
        var msg = why === 'auth'
          ? '✗ Wrong secret — it must match the ADMIN_SECRET line in your Apps Script exactly.'
          : why === 'noaction'
            ? '✗ Your deployed script is the OLD version — it has no delete step. Re-deploy: Manage deployments → Edit → New version → Deploy.'
            : '✗ Could not delete (' + (why || 'unknown') + '). Try Refresh.';
        log(el, msg, 'err');
      }
    });
  });

  // ---- top-level view switch (Works | Pieces | Comments) ----
  function switchView(v) {
    var isWorks = v === 'works', isPieces = v === 'pieces', isComments = v === 'comments';
    $('a-view-works').classList.toggle('hidden', !isWorks);
    $('a-view-pieces').classList.toggle('hidden', !isPieces);
    $('a-view-comments').classList.toggle('hidden', !isComments);
    $('a-works-actions').style.display = isWorks ? 'flex' : 'none';
    $('a-pieces-actions').style.display = isPieces ? 'flex' : 'none';
    var tabs = document.querySelectorAll('#a-view-tabs .a-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('a-tab--on', tabs[i].dataset.view === v);
    if (isPieces && !piecesLoaded) {
      piecesLoaded = true;
      loadPieces().catch(function (e) { log($('pc-log'), 'Load failed: ' + e.message, 'err'); piecesLoaded = false; });
    }
    if (isComments && !commentsLoaded) {
      commentsLoaded = true;
      loadComments().catch(function (e) { log($('cm-log'), 'Load failed: ' + e.message, 'err'); commentsLoaded = false; });
    }
  }
  $('a-view-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.a-tab'); if (b) switchView(b.dataset.view);
  });

  // ---- boot ----
  showGateMode();
})();
