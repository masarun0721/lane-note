/* ===== 記録帳の画面（ログイン時は Firebase の users/{uid} に本人だけが読める形で保存、未ログイン時はこのブラウザの IndexedDB にだけ置く） ===== */
(function () {
  'use strict';
  var R = ResultParser;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var PDFJS_VER = '4.10.38', PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/';
  var PDFJS_SRI = { 'build/pdf.min.mjs': 'sha384-+0ti2moQlmLN7WZHE2RHIf5lV8hHxhxEalN0il3YZceG26fUPyOkR0hp9daxk1i7',
    'build/pdf.worker.min.mjs': 'sha384-ToeVvShCxKc6CEvhHeMt0Q8A06pSPDbAlngO9nokrDmh914gk/pYd0N7D0a4Lz2o' };
  var pdfjsPromise = null;
  async function verifiedUrl(path) {
    if (!(window.crypto && crypto.subtle)) throw new Error('このブラウザでは部品の改ざんチェックができないため、読み込みを中止しました');
    var res = await fetch(PDFJS_BASE + path, { mode: 'cors', credentials: 'omit', integrity: PDFJS_SRI[path] });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var buf = await res.arrayBuffer(), d = new Uint8Array(await crypto.subtle.digest('SHA-384', buf)), bin = '';
    for (var i = 0; i < d.length; i++) bin += String.fromCharCode(d[i]);
    if ('sha384-' + btoa(bin) !== PDFJS_SRI[path]) throw new Error('部品の内容が想定と違います（改ざんの可能性）');
    return URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
  }
  function loadPdfjs() {
    if (!pdfjsPromise) pdfjsPromise = Promise.all([verifiedUrl('build/pdf.min.mjs'), verifiedUrl('build/pdf.worker.min.mjs')]).then(function (u) {
      return import(u[0]).then(function (lib) { lib.GlobalWorkerOptions.workerSrc = u[1]; return lib; });
    }).catch(function (e) { pdfjsPromise = null; throw new Error('PDF読み取り部品を読み込めませんでした（' + e.message + '）'); });
    return pdfjsPromise;
  }
  async function readPdf(file, prog) {
    var lib = await loadPdfjs(), doc;
    try { doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: PDFJS_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_BASE + 'standard_fonts/' }).promise; }
    catch (e) { if (e && e.name === 'PasswordException') throw new Error('パスワード付きのPDFは読めません'); throw new Error('PDFを開けませんでした（' + (e && e.message) + '）'); }
    var pages = [], n = 0;
    try {
      for (var p = 1; p <= doc.numPages; p++) {
        if (prog) prog(p, doc.numPages);
        var pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
        n += tc.items.filter(function (i) { return i.str && i.str.trim(); }).length;
        pages.push({ width: vp.width, height: vp.height, items: tc.items.filter(function (i) { return i.str !== undefined; }).map(function (i) { return { str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }; }) });
      }
    } finally { try { doc.destroy(); } catch (e) { } }
    if (!n) throw new Error('文字の情報が無いPDFです（スキャン・画像の可能性）');
    return { pages: pages, title: '' };
  }
  // HTML：文字コードを確かめて読み、本文の見出しと表を順に並べる
  async function readHtml(file) {
    var buf = new Uint8Array(await file.arrayBuffer()), head = '';
    for (var i = 0; i < Math.min(buf.length, 4096); i++) head += String.fromCharCode(buf[i]);
    var cs = (head.match(/charset\s*=\s*["']?([\w-]+)/i) || [])[1] || 'utf-8';
    if (/shift_jis|sjis|x-sjis|windows-31j|cp932/i.test(cs)) cs = 'shift_jis';
    var txt;
    try { txt = new TextDecoder(cs).decode(buf); } catch (e) { txt = new TextDecoder('utf-8').decode(buf); }
    if ((txt.match(/\ufffd/g) || []).length > 20 && cs !== 'shift_jis') txt = new TextDecoder('shift_jis').decode(buf);
    return htmlToStream(new DOMParser().parseFromString(txt, 'text/html'));
  }
  function textOf(el) { var c = el.cloneNode(true); c.querySelectorAll('br').forEach(function (b) { b.replaceWith('\n'); }); return c.textContent; }
  function htmlToStream(doc) {
    var out = [], body = doc.body || doc.documentElement;
    doc.querySelectorAll('script,style,noscript').forEach(function (e) { e.remove(); });
    (function walk(el) {
      Array.prototype.forEach.call(el.children, function (c) {
        var tag = c.tagName;
        if (tag === 'TABLE') {
          Array.prototype.forEach.call(c.rows, function (tr) {
            var cells = [], th = false;
            Array.prototype.forEach.call(tr.cells, function (td) { if (td.tagName === 'TH') th = true; var n = Math.min(+td.colSpan || 1, 6), t = textOf(td).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim(); for (var k = 0; k < n; k++) cells.push(t); });
            if (cells.length === 1) textOf(tr).split('\n').forEach(function (s) { if (s.trim()) out.push({ type: 'text', v: s.trim() }); });
            else if (cells.length) out.push({ type: 'row', cells: cells, th: th });
          });
          return;
        }
        if (tag === 'UL' || tag === 'OL' || tag === 'NAV' || tag === 'A') return;   // 他の組へのリンク一覧などは読まない
        if (c.querySelector('table,div,p,h1,h2,h3,h4,h5,h6')) { walk(c); return; }
        textOf(c).split('\n').forEach(function (s) { if (s.trim()) out.push({ type: 'text', v: s.trim() }); });
      });
    })(body);
    return out;
  }

  /* ---------- 保存先：IndexedDB（未ログイン時の保存先・ログイン時はオフライン用の控え） ---------- */
  var dbps = {};
  function db(name) {
    name = name || curDbName();
    if (!dbps[name]) dbps[name] = new Promise(function (ok, ng) {
      if (!window.indexedDB) { ng(new Error('このブラウザでは保存（IndexedDB）が使えません')); return; }
      var q = indexedDB.open(name, 1);
      q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' }); };
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ng(q.error); };
    });
    return dbps[name];
  }
  var LOCAL_DB = 'lanenote-records';            // v0.1 からの「この端末だけ」の保存先
  function curDbName() { return USER ? 'lanenote-cache-' + USER.uid : LOCAL_DB; }   // ログイン中は人ごとの控え
  function ltx(mode, fn, name) { return db(name).then(function (d) { return new Promise(function (ok, ng) { var t = d.transaction('records', mode), s = t.objectStore('records'), r = fn(s); t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : r); }; t.onerror = function () { ng(t.error); }; }); }); }
  function lgetAll(name) { return db(name).then(function (d) { return new Promise(function (ok, ng) { var q = d.transaction('records').objectStore('records').getAll(); q.onsuccess = function () { ok(q.result || []); }; q.onerror = function () { ng(q.error); }; }); }); }

  /* ---------- 保存先：Firebase（ログインすると users/{uid}/records に保存し、どの端末からでも同じ記録が見える） ---------- */
  var FB_VER = '10.14.1', FB = null, USER = null, OFFLINE = false;
  var CFG = window.LANE_FIREBASE_CONFIG || null;
  var CLOUD_READY = !!(CFG && CFG.apiKey && !/^YOUR_|^__/.test(CFG.apiKey) && CFG.projectId && !/^YOUR_/.test(CFG.projectId));
  function docId(id) { return String(id).replace(/\//g, '∕'); }     // Firestore のIDに「/」は使えない
  function clean(r) { var o = {}; Object.keys(r).forEach(function (k) { if (r[k] !== undefined) o[k] = r[k]; }); return o; }
  async function loadFirebase() {
    if (FB) return FB;
    var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var m = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    var app = m[0].initializeApp(CFG);
    FB = { A: m[1], F: m[2], auth: m[1].getAuth(app), fs: m[2].getFirestore(app) };
    return FB;
  }
  function col() { return FB.F.collection(FB.fs, 'users', USER.uid, 'records'); }
  async function cloudPut(list) {
    for (var i = 0; i < list.length; i += 400) {             // 1回のまとめ書きは500件まで
      var b = FB.F.writeBatch(FB.fs);
      list.slice(i, i + 400).forEach(function (r) { b.set(FB.F.doc(col(), docId(r.id)), clean(r)); });
      await b.commit();
    }
  }
  async function cloudDel(ids) {
    for (var i = 0; i < ids.length; i += 400) {
      var b = FB.F.writeBatch(FB.fs);
      ids.slice(i, i + 400).forEach(function (id) { b.delete(FB.F.doc(col(), docId(id))); });
      await b.commit();
    }
  }

  // 一覧を読む：ログイン中はクラウドから読み、控え（IndexedDB）を入れ替える。つながらないときは控えを出す
  async function getAll() {
    if (!USER) return lgetAll();
    try {
      var snap = await FB.F.getDocs(col()), list = [];
      snap.forEach(function (d) { list.push(d.data()); });
      OFFLINE = false;
      try { await ltx('readwrite', function (s) { s.clear(); list.forEach(function (r) { s.put(r); }); }); } catch (e) { }
      return list;
    } catch (e) {
      OFFLINE = true;
      return lgetAll();
    }
  }
  async function putMany(list) {
    var have = {}; ALL.forEach(function (r) { have[r.id] = 1; });
    if (!USER) (await lgetAll()).forEach(function (r) { have[r.id] = 1; });
    var add = list.filter(function (r) { return !have[r.id]; });
    if (add.length) {
      if (USER) await cloudPut(add);
      await ltx('readwrite', function (s) { add.forEach(function (r) { s.put(r); }); });
    }
    return { added: add.length, dup: list.length - add.length, ids: add.map(function (r) { return r.id; }) };
  }
  async function delIds(ids) {
    if (USER) await cloudDel(ids);
    await ltx('readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); });
  }
  async function clearAll() {
    if (USER) await cloudDel(ALL.map(function (r) { return r.id; }));
    await ltx('readwrite', function (s) { s.clear(); });
  }

  // 初めてログインしたとき、この端末に v0.1 でためた記録をクラウドへ1回だけ上げる（端末の記録は消さない）
  async function migrateLocal() {
    var key = 'lanenote-migrated-' + USER.uid;
    try { if (localStorage.getItem(key)) return; } catch (e) { }
    var local = []; try { local = await lgetAll(LOCAL_DB); } catch (e) { }
    if (local.length) {
      status('rbAuthStatus', 'この端末の記録 ' + local.length + '件をクラウドへ移しています…', 'busy');
      var have = {}; (await getAll()).forEach(function (r) { have[r.id] = 1; });
      var add = local.filter(function (r) { return !have[r.id]; });
      await cloudPut(add);
      status('rbAuthStatus', '✔ この端末にあった記録 ' + add.length + '件をクラウドへ移しました' + (local.length - add.length ? '（' + (local.length - add.length) + '件はすでにあったので重ねませんでした）' : '') + '。', 'ok');
    }
    try { localStorage.setItem(key, new Date().toISOString()); } catch (e) { }
  }

  function renderAuth() {
    var info = $('rbAuthInfo'), inB = $('rbSignIn'), outB = $('rbSignOut');
    if (!CLOUD_READY) { info.innerHTML = '💻 <b>この端末だけに保存中</b>（クラウド保存はまだ準備中です）'; inB.hidden = true; outB.hidden = true; return; }
    if (USER) { info.innerHTML = '☁ <b>' + esc(USER.email || USER.displayName || 'ログイン中') + '</b> でログイン中：記録はクラウドに保存し、どの端末からでも見られます' + (OFFLINE ? '<br><span class="ng">⚠ いまクラウドにつながらないので、この端末の控えを表示しています</span>' : ''); inB.hidden = true; outB.hidden = false; }
    else { info.innerHTML = '💻 <b>ログインしていません</b>：記録はこの端末だけに保存されます。Googleでログインすると、どの端末からでも同じ記録が見られます。'; inB.hidden = false; outB.hidden = true; }
  }
  async function initCloud() {
    renderAuth();
    if (!CLOUD_READY) return;
    try { await loadFirebase(); } catch (e) { status('rbAuthStatus', '✖ ログインの部品を読み込めませんでした（' + esc(e.message) + '）。この端末だけに保存します。', 'ng'); return; }
    FB.A.onAuthStateChanged(FB.auth, async function (u) {
      USER = u || null; renderAuth();
      if (USER) { try { await migrateLocal(); } catch (e) { status('rbAuthStatus', '✖ この端末の記録をクラウドへ移せませんでした：' + esc(e.message) + '（次にページを開いたときにもう一度試します）', 'ng'); } }
      await reload(); renderAuth();
    });
  }
  $('rbSignIn').addEventListener('click', async function () {
    try { await loadFirebase(); await FB.A.signInWithPopup(FB.auth, new FB.A.GoogleAuthProvider()); }
    catch (e) {
      if (e && /popup-blocked|operation-not-supported/.test(e.code || '')) { try { await FB.A.signInWithRedirect(FB.auth, new FB.A.GoogleAuthProvider()); return; } catch (e2) { e = e2; } }
      if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return;
      status('rbAuthStatus', '✖ ログインできませんでした：' + esc(e.message), 'ng');
    }
  });
  $('rbSignOut').addEventListener('click', async function () {
    if (!confirm('ログアウトします。クラウドの記録は消えません（もう一度ログインすれば見られます）。')) return;
    var uid = USER && USER.uid;
    await FB.A.signOut(FB.auth);
    if (uid) try { indexedDB.deleteDatabase('lanenote-cache-' + uid); delete dbps['lanenote-cache-' + uid]; } catch (e) { }   // 共用の端末に控えを残さない
    status('rbAuthStatus', '✔ ログアウトしました。', 'ok');
  });

  /* ---------- 読み込み ---------- */
  var batches = [], seq = 0, ALL = [];
  var schoolKey = 'lanenote-rec-school';
  try { $('rbSchool').value = localStorage.getItem(schoolKey) || ''; } catch (e) { }
  $('rbSchool').addEventListener('input', function () { try { localStorage.setItem(schoolKey, this.value.trim()); } catch (e) { } renderBatches(); render(); });
  function school() { return $('rbSchool').value.trim(); }
  function status(id, html, cls) { var el = $(id); el.innerHTML = html; el.className = 'status ' + (cls || ''); }
  function guessMetaFromPages(pages) {
    var flat = [];
    pages.slice(0, 2).forEach(function (pg) { var ls = {}; pg.items.forEach(function (i) { var k = Math.round(i.y); ls[k] = (ls[k] || '') + i.str; }); Object.keys(ls).forEach(function (k) { flat.push(R.nk(ls[k])); }); });
    var name = '', date = '';
    flat.forEach(function (l) {
      var s = l.replace(/\s+/g, ' ').trim();
      if (!name && /(大会|選手権|記録会|競技会)/.test(s) && !/(記録主任|審判|大会記録|凡例|GR)/.test(s) && s.length < 70) name = s.replace(/[【\[].*?[】\]]/g, '').trim();
      if (!date && !/(出力|印刷|更新|作成)/.test(s)) { var d = s.match(/(20\d\d)\s*[年\/.-]\s*(\d{1,2})\s*[月\/.-]\s*(\d{1,2})/); if (d) date = d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2); }
    });
    var md = '';
    if (!date) flat.some(function (l) { var m = l.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/); if (m && !/(出力|印刷)/.test(l)) { md = m[1] + '月' + m[2] + '日'; return true; } });
    return { name: name, date: date, md: md };
  }
  async function handleFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    var html = files.filter(function (f) { return /\.html?$/i.test(f.name) || f.type === 'text/html'; });
    var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    var txts = files.filter(function (f) { return /\.txt$/i.test(f.name); });
    var other = files.filter(function (f) { return html.indexOf(f) < 0 && pdfs.indexOf(f) < 0 && txts.indexOf(f) < 0; });
    if (other.length) status('rbStatus', '✖ 読めない種類のファイルです：' + esc(other.map(function (f) { return f.name; }).join('、')), 'ng');
    for (var i = 0; i < pdfs.length; i++) {
      var f = pdfs[i];
      try {
        status('rbStatus', '読み取り中…（' + esc(f.name) + '）', 'busy');
        var res0 = await readPdf(f, function (p, n) { status('rbStatus', '読み取り中…（' + esc(f.name) + ' ' + p + '/' + n + 'ページ）', 'busy'); });
        var all = R.parsePdf(res0.pages, {}), meta = guessMetaFromPages(res0.pages);
        addBatch({ src: f.name, kind: 'PDF', all: all, meta: meta });
      } catch (e) { addBatch({ src: f.name, kind: 'PDF', error: e.message }); }
    }
    if (html.length || txts.length) {
      var stream = [], names = [];
      for (var j = 0; j < html.length; j++) { try { stream = stream.concat(await readHtml(html[j])); names.push(html[j].name); } catch (e) { addBatch({ src: html[j].name, kind: 'HTML', error: e.message }); } }
      for (var k = 0; k < txts.length; k++) { stream = stream.concat(R.textToStream(await txts[k].text())); names.push(txts[k].name); }
      if (names.length) {
        // 種目ページごとに大会名・日付が書かれているので、まとめて1つの大会として扱う
        var res = R.parseCells(stream, {});
        addBatch({ src: names.length > 3 ? names.slice(0, 3).join('、') + ' ほか' + (names.length - 3) + '件' : names.join('、'), kind: 'HTML', all: res, meta: { name: res.meet.name, date: res.meet.date } });
      }
    }
    status('rbStatus', '読み取りました。下の内容を確かめて「記録帳に保存」を押してください。', 'ok');
  }
  $('rbFile').addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
  var drop = $('rbDrop');
  drop.addEventListener('click', function (e) { if (e.target.tagName !== 'INPUT') $('rbFile').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('rbFile').click(); } });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
  drop.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
  $('rbPasteGo').addEventListener('click', function () {
    var t = $('rbPaste').value; if (!t.trim()) return;
    var res = R.parsePlain(t, {});
    addBatch({ src: '貼り付け', kind: '貼り付け', all: res, meta: { name: res.meet.name, date: res.meet.date } });
  });
  function addBatch(b) { b.id = ++seq; batches.unshift(b); renderBatches(); }
  function batchRecs(b) {
    if (!b.all) return [];
    var q = school();
    return b.all.recs.filter(function (r) { return !q || R.matchSchool(r.team, q); });
  }
  function batchWarns(b) {
    var q = school(), ws = b.all.warns.filter(function (w) { return !/：/.test(w); });
    batchRecs(b).forEach(function (r) { if (r.warn) ws.push((r.page ? r.page + 'ページ ' : '') + (r.event || '種目不明') + ' ' + (r.name || r.kana || 'No.' + r.bib) + '：' + r.warn + 'を読み取れませんでした'); });
    if (!b.meta.name) ws.unshift('大会名が資料から読み取れませんでした。手で入れてください。');
    if (!b.meta.date) ws.unshift('日付が資料から読み取れませんでした' + (b.meta.md ? '（「' + b.meta.md + '」はありますが年がわかりません）' : '') + '。手で入れてください。');
    if (q && b.all.recs.length && !batchRecs(b).length) ws.unshift('「' + q + '」の選手が見つかりませんでした。学校名の書き方（例：本郷高・本郷中）を確かめてください。');
    if (!q) ws.unshift('学校名が空なので、全校の記録を表示しています。');
    return ws;
  }
  function recRow(r, extra) {
    return '<tr' + (r.warn ? ' class="haswarn"' : '') + '><td>' + esc(r.event) + '</td><td>' + esc(r.round) + '</td><td class="rn">' + esc(r.heat) + '</td><td>' + esc(r.name) + (r.kana ? '<br><small class="muted">' + esc(r.kana) + '</small>' : '') + '</td><td class="rn">' + esc(r.grade) + '</td><td>' + esc(r.team) + '</td><td class="rn"><b>' + esc(r.mark) + '</b>' + (extra || '') + '</td><td class="rn">' + esc(r.wind) + '</td><td class="rn">' + esc(r.rank) + (r.overall ? '<br><small class="muted">総合' + esc(r.overall) + '</small>' : '') + '</td><td><small>' + esc(r.comment) + '</small></td></tr>';
  }
  var REC_HEAD = '<tr><th>種目</th><th>ラウンド</th><th>組</th><th>氏名</th><th>学年</th><th>所属</th><th>記録</th><th>風</th><th>順位</th><th>備考</th></tr>';
  function renderBatches() {
    $('rbBatches').innerHTML = batches.map(function (b) {
      if (b.error) return '<div class="rb-batch"><h3>✖ ' + esc(b.src) + '</h3><p class="status ng">' + esc(b.error) + '</p><button class="btn sub" data-del="' + b.id + '" type="button">閉じる</button></div>';
      var rs = batchRecs(b), ws = batchWarns(b);
      return '<div class="rb-batch" data-b="' + b.id + '"><h3>' + esc(b.kind) + '：' + esc(b.src) + '</h3>' +
        '<div class="rb-row"><label>大会名 <input type="text" data-f="name" value="' + esc(b.meta.name) + '" size="34"></label><label>日付 <input type="date" data-f="date" value="' + esc(b.meta.date) + '"></label></div>' +
        '<p class="small">読み取った記録：' + rs.length + '件' + (b.all.recs.length !== rs.length ? '（全体 ' + b.all.recs.length + '件のうち）' : '') + '</p>' +
        (ws.length ? '<ul class="rb-warn">' + ws.map(function (w) { return '<li>⚠ ' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        (rs.length ? '<div class="tblwrap"><table class="rbt">' + REC_HEAD + rs.map(function (r) { return recRow(r); }).join('') + '</table></div>' : '') +
        '<div class="rb-row" style="margin-top:8px"><button class="btn" data-save="' + b.id + '" type="button"' + (rs.length ? '' : ' disabled') + '>記録帳に保存</button><button class="btn sub" data-del="' + b.id + '" type="button">取り消す</button></div><div class="status" data-st="' + b.id + '"></div></div>';
    }).join('');
  }
  $('rbBatches').addEventListener('input', function (e) {
    var box = e.target.closest('[data-b]'), f = e.target.getAttribute('data-f'); if (!box || !f) return;
    var b = batches.filter(function (x) { return x.id === +box.getAttribute('data-b'); })[0]; if (b) b.meta[f] = e.target.value.trim();
  });
  $('rbBatches').addEventListener('click', async function (e) {
    var del = e.target.getAttribute('data-del'), sv = e.target.getAttribute('data-save'), un = e.target.getAttribute('data-undo');
    if (un) {
      var ub = batches.filter(function (x) { return x.id === +un; })[0], ust = document.querySelector('[data-st="' + un + '"]');
      if (!ub || !(ub.addedIds || []).length) return;
      if (!confirm('今読み込んで保存した ' + ub.addedIds.length + '件を記録帳から取り消します。よろしいですか？')) return;
      var n = ub.addedIds.length; await delIds(ub.addedIds); ub.addedIds = [];
      ust.className = 'status ok'; ust.textContent = '✔ 今読み込んだ ' + n + '件を取り消しました（もう一度「記録帳に保存」で入れ直せます）。';
      await reload(); return;
    }
    if (del) { batches = batches.filter(function (b) { return b.id !== +del; }); renderBatches(); return; }
    if (!sv) return;
    var b = batches.filter(function (x) { return x.id === +sv; })[0], st = document.querySelector('[data-st="' + sv + '"]');
    if (!b.meta.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.meta.date || '')) { st.className = 'status ng'; st.textContent = '✖ 大会名と日付を入れてから保存してください。'; return; }
    var rs = batchRecs(b).map(function (r, i) {
      var o = Object.assign({}, r); o.meet = b.meta.name; o.date = b.meta.date; o.src = b.src; o.order = i; o.savedAt = new Date().toISOString();
      o.id = R.recId(o.meet, o.date, o); return o;
    });
    try {
      var res = await putMany(rs);
      b.addedIds = (b.addedIds || []).concat(res.ids);
      st.className = 'status ok'; st.innerHTML = '✔ ' + res.added + '件を保存しました' + (res.dup ? '（' + res.dup + '件はすでに保存済みなので重ねませんでした）' : '') + '。' +
        (b.addedIds.length ? ' <button class="btn sub" type="button" data-undo="' + b.id + '">今読み込んだ分を取り消す（' + b.addedIds.length + '件）</button>' : '');
      await reload();
    } catch (err) { st.className = 'status ng'; st.textContent = '✖ 保存できませんでした：' + err.message; }
  });

  /* ---------- 一覧 ---------- */
  var view = 'ath', sort = { ath: null, ev: null, meet: null, all: null };
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var v = e.target.getAttribute('data-v'); if (!v) return; view = v;
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b === e.target); }); render();
  });
  $('rbQ').addEventListener('input', render); $('rbMine').addEventListener('change', render);
  async function reload() { try { ALL = await getAll(); } catch (e) { ALL = []; status('rbDataStatus', '✖ ' + esc(e.message), 'ng'); } render(); if (CLOUD_READY) renderAuth(); }
  function filtered() {
    var q = R.nk($('rbQ').value).replace(/\s/g, ''), s = school(), mine = $('rbMine').checked;
    return ALL.filter(function (r) {
      if (mine && s && !R.matchSchool(r.team, s)) return false;
      if (!q) return true;
      return R.nk([r.name, r.kana, r.event, r.meet, r.team, r.date].join('')).replace(/\s/g, '').indexOf(q) >= 0;
    });
  }
  function windTag(r) { var w = R.windClass(r); return w === 'aid' ? '<span class="ref">追参</span>' : w === 'unk' && !/^[A-Z棄失欠]/.test(r.mark) ? '<span class="unk">風?</span>' : ''; }
  function mv(r) { var m = r && R.markValue(r.mark); return m ? (m.lower ? m.v : -m.v) : 1e9; }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sortRows(rows, key, defs) {
    var s = sort[key]; if (!s) return rows;
    var f = defs[s.k]; return rows.slice().sort(function (a, b) { return cmp(f(a), f(b)) * s.d; });
  }
  function th(key, k, label) { var s = sort[key], ar = s && s.k === k ? (s.d > 0 ? '▲' : '▼') : ''; return '<th data-sort="' + k + '">' + label + '<span class="ar">' + ar + '</span></th>'; }
  $('rbView').addEventListener('click', async function (e) {
    var dm = e.target.getAttribute && e.target.getAttribute('data-delmeet');
    if (dm) {
      // その大会の記録だけを消す（学校名・しぼりこみに関係なく、その大会のすべての記録）
      var ids = ALL.filter(function (r) { return r.date + '|' + r.meet === dm; }).map(function (r) { return r.id; });
      if (!ids.length) return;
      if (!confirm('「' + dm.replace('|', ' ') + '」の記録 ' + ids.length + '件を消します。元に戻せません。よろしいですか？')) return;
      await delIds(ids); status('rbDataStatus', '✔ 「' + esc(dm.replace('|', ' ')) + '」の記録 ' + ids.length + '件を消しました。自己ベストを計算し直しました。', 'ok');
      await reload(); return;
    }
    var t = e.target.closest('th[data-sort]'); if (!t) return; var k = t.getAttribute('data-sort'), s = sort[view];
    sort[view] = s && s.k === k ? { k: k, d: -s.d } : { k: k, d: 1 }; render();
  });
  function render() {
    var rows = filtered(), cb = R.computeBests(rows), flags = cb.flags;
    var meets = {}; rows.forEach(function (r) { var k = r.date + '|' + r.meet; meets[k] = (meets[k] || 0) + 1; });
    var aths = {}; rows.forEach(function (r) { aths[R.athleteKey(r)] = 1; });
    $('rbStats').textContent = ALL.length ? '保存している記録：' + ALL.length + '件（表示 ' + rows.length + '件・選手 ' + Object.keys(aths).length + '人・大会 ' + Object.keys(meets).length + '件）' : 'まだ記録がありません。上で結果の資料を入れて「記録帳に保存」を押してください。';
    var html = '';
    if (view === 'ath' || view === 'ev') {
      var bs = cb.bests.slice();
      var defs = { name: function (b) { return R.nk(b.name); }, team: function (b) { return R.nk(b.team); }, event: function (b) { return b.event; }, best: function (b) { return mv(b.best || b.ref); }, date: function (b) { return (b.best || b.ref || {}).date || ''; }, count: function (b) { return -b.count; } };
      bs.sort(view === 'ath' ? function (a, b) { return cmp(R.nk(a.name), R.nk(b.name)) || cmp(a.event, b.event); } : function (a, b) { return cmp(a.event, b.event) || cmp(mv(a.best || a.ref), mv(b.best || b.ref)); });
      bs = sortRows(bs, view, defs);
      var first = view === 'ath' ? th(view, 'name', '氏名') + th(view, 'team', '所属') + th(view, 'event', '種目') : th(view, 'event', '種目') + th(view, 'name', '氏名') + th(view, 'team', '所属');
      html = '<table class="rbt"><tr>' + first + th(view, 'best', '自己ベスト（公認）') + '<th>風</th>' + th(view, 'date', '日付') + '<th>大会</th><th>参考記録（追い風・風不明）</th>' + th(view, 'count', '記録数') + '</tr>' + bs.map(function (b) {
        var r = b.best || {}, f = b.ref;
        var lead = view === 'ath' ? '<td>' + esc(b.name) + '</td><td>' + esc(b.team) + '</td><td>' + esc(b.eventLabel) + '</td>' : '<td>' + esc(b.eventLabel) + '</td><td>' + esc(b.name) + '</td><td>' + esc(b.team) + '</td>';
        return '<tr>' + lead + '<td class="rn"><b>' + esc(r.mark || '—') + '</b></td><td class="rn">' + esc(r.wind) + '</td><td>' + esc(r.date) + '</td><td>' + esc(r.meet) + '</td><td>' + (f ? esc(f.mark) + windTag(f) + ' <small class="muted">' + esc(f.wind) + ' ' + esc(f.date) + '</small>' : '') + '</td><td class="rn">' + b.count + '</td></tr>';
      }).join('') + '</table>';
    } else {
      var rs = rows.slice().sort(function (a, b) { return cmp(b.date, a.date) || cmp(a.meet, b.meet) || cmp(R.normEvent(a.event), R.normEvent(b.event)) || cmp(a.order || 0, b.order || 0); });
      var d2 = { date: function (r) { return r.date; }, meet: function (r) { return r.meet; }, event: function (r) { return R.normEvent(r.event); }, name: function (r) { return R.nk(r.name); }, grade: function (r) { return r.grade; }, mark: mv, rank: function (r) { return r.rank === '' ? 999 : +r.rank; } };
      rs = sortRows(rs, view, d2);
      var lastMeet = '';
      html = '<table class="rbt"><tr>' + th(view, 'date', '日付') + th(view, 'meet', '大会') + th(view, 'event', '種目') + '<th>ラウンド</th><th>組</th>' + th(view, 'name', '氏名') + th(view, 'grade', '学年') + '<th>所属</th>' + th(view, 'mark', '記録') + '<th>風</th>' + th(view, 'rank', '順位') + '<th>備考</th></tr>' + rs.map(function (r) {
        var head = '';
        if (view === 'meet' && !sort.meet && r.date + '|' + r.meet !== lastMeet) {
          var key = r.date + '|' + r.meet, cnt = rows.filter(function (x) { return x.date + '|' + x.meet === key; }).length;
          head = '<tr class="gsep rb-meet"><td colspan="12"><b>' + esc(r.date) + '　' + esc(r.meet) + '</b>　<span class="small muted">' + cnt + '件</span> <button class="btn sub rb-delmeet" type="button" data-delmeet="' + esc(key) + '">この大会を消す</button></td></tr>';
        }
        var sep = ''; lastMeet = r.date + '|' + r.meet;
        var fl = flags[r.id] === 'PB' ? '<span class="pb">PB</span>' : flags[r.id] === '初' ? '<span class="pb first">初</span>' : '';
        return head + '<tr' + sep + '><td>' + esc(r.date) + '</td><td>' + esc(r.meet) + '</td><td>' + esc(r.event) + '</td><td>' + esc(r.round) + '</td><td class="rn">' + esc(r.heat) + '</td><td>' + esc(r.name) + '</td><td class="rn">' + esc(r.grade) + '</td><td>' + esc(r.team) + '</td><td class="rn"><b>' + esc(r.mark) + '</b>' + fl + windTag(r) + '</td><td class="rn">' + esc(r.wind) + '</td><td class="rn">' + esc(r.rank) + '</td><td><small>' + esc(r.comment) + '</small></td></tr>';
      }).join('') + '</table>';
    }
    $('rbView').innerHTML = rows.length ? html : '<p class="muted small">表示する記録がありません。</p>';
  }

  /* ---------- 書き出し・読み込み・消去 ---------- */
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function stamp() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  $('rbExport').addEventListener('click', function () {
    if (!ALL.length) { status('rbDataStatus', '書き出す記録がありません。', 'ng'); return; }
    download('LANE_NOTE_記録帳_' + stamp() + '.json', new Blob([JSON.stringify({ app: 'LANE NOTE 記録帳', format: 1, version: REC_VERSION, exportedAt: new Date().toISOString(), records: ALL }, null, 1)], { type: 'application/json' }));
    status('rbDataStatus', '✔ ' + ALL.length + '件をファイルに書き出しました。', 'ok');
  });
  $('rbImport').addEventListener('change', async function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    try {
      var j = JSON.parse(await f.text()), list = Array.isArray(j) ? j : j.records;
      if (!Array.isArray(list)) throw new Error('記録帳のファイルではないようです');
      list = list.filter(function (r) { return r && r.id && r.name !== undefined && r.mark !== undefined && r.meet && r.date; });
      var res = await putMany(list);
      status('rbDataStatus', '✔ ' + res.added + '件を読み込みました' + (res.dup ? '（' + res.dup + '件はすでにあるので重ねませんでした）' : '') + '。', 'ok');
      await reload();
    } catch (e) { status('rbDataStatus', '✖ 読み込めませんでした：' + esc(e.message), 'ng'); }
  });
  $('rbClear').addEventListener('click', async function () {
    if (!ALL.length) { status('rbDataStatus', '消す記録はありません。', ''); return; }
    if (!confirm('' + (USER ? 'クラウドに保存した' : 'このブラウザに保存した') + '記録 ' + ALL.length + '件をすべて消します。元に戻せません。\n（必要なら先に「ファイルに書き出す」をしてください）\n\n本当に消しますか？')) return;
    try { await clearAll(); } catch (e) { status('rbDataStatus', '✖ 消せませんでした：' + esc(e.message), 'ng'); return; }
    status('rbDataStatus', '✔ すべて消しました。', 'ok'); await reload();
  });
  $('rbXlsx').addEventListener('click', function () {
    if (!window.XLSX) { status('rbDataStatus', '✖ Excel書き出しの部品を読み込めませんでした（インターネット接続を確認してください）。', 'ng'); return; }
    var rows = filtered(); if (!rows.length) { status('rbDataStatus', '書き出す記録がありません。', 'ng'); return; }
    var cb = R.computeBests(rows);
    var a = [['日付', '大会', '種目', 'ラウンド', '組', '氏名', 'フリガナ', '学年', '所属', '記録', '風', '順位', '備考', '自己ベスト', '風の扱い']].concat(rows.slice().sort(function (x, y) { return cmp(x.date, y.date) || cmp(x.order || 0, y.order || 0); }).map(function (r) {
      var w = R.windClass(r); return [r.date, r.meet, r.event, r.round, r.heat, r.name, r.kana, r.grade, r.team, r.mark, r.wind, r.rank, r.comment, cb.flags[r.id] || '', w === 'aid' ? '追い風参考' : w === 'unk' ? '風不明' : ''];
    }));
    var b = [['氏名', '所属', '種目', '自己ベスト（公認）', '風', '日付', '大会', '参考記録', '参考の風', '参考の日付', '記録数']].concat(cb.bests.map(function (x) { var r = x.best || {}, f = x.ref || {}; return [x.name, x.team, x.eventLabel, r.mark || '', r.wind || '', r.date || '', r.meet || '', f.mark || '', f.wind || '', f.date || '', x.count]; }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), '記録一覧');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), '自己ベスト');
    XLSX.writeFile(wb, 'LANE_NOTE_記録帳_' + stamp() + '.xlsx');
    status('rbDataStatus', '✔ Excelに書き出しました（表示中の ' + rows.length + '件）。', 'ok');
  });
  if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }
})();
