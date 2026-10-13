/* ===== 記録ページの画面（ログイン時は Firebase の users/{uid} に本人だけが読める形で保存、未ログイン時はこのブラウザの IndexedDB にだけ置く） ===== */
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
    var gold = R.goldMobileStream(txt); if (gold) return gold;   // v0.20.2：gold.jaic.org の速報（携帯向けの形）
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
    if (!name) return Promise.reject(new Error('保存先が決まっていません'));
    if (!dbps[name]) {
      var p = new Promise(function (ok, ng) {
        if (!window.indexedDB) { ng(new Error('このブラウザでは保存（IndexedDB）が使えません')); return; }
        var q = indexedDB.open(name, 1);
        q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' }); };
        // v0.14（監査F04）：ほかのタブ・ログアウトが消そうとしたら、すぐ接続を閉じる（消去が止まらないように）
        q.onsuccess = function () { var d = q.result; d.onversionchange = function () { d.close(); if (dbps[name] === p) delete dbps[name]; }; ok(d); };
        q.onerror = function () { if (dbps[name] === p) delete dbps[name]; ng(q.error); };
      });
      dbps[name] = p;
    }
    return dbps[name];
  }
  function closeDb(name) { var p = dbps[name]; delete dbps[name]; return p ? p.then(function (d) { d.close(); }, function () { }) : Promise.resolve(); }
  var LOCAL_DB = 'lanenote-records';            // v0.1 からの「この端末だけ」の保存先（ログインしていないとき）
  // sc を渡すと、DBを開く直前にアカウントが変わっていないか確かめる（変わっていたら開かない）
  function ltx(mode, fn, name, sc) {
    if (sc) check(sc);
    return db(name).then(function (d) { if (sc) check(sc); return new Promise(function (ok, ng) { var t = d.transaction('records', mode), s = t.objectStore('records'), r = fn(s); t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : r); }; t.onerror = function () { ng(t.error); }; t.onabort = function () { ng(t.error || new Error('保存を中止しました')); }; }); });
  }
  function lgetAll(name, sc) {
    if (sc) check(sc);
    return db(name).then(function (d) { if (sc) check(sc); return new Promise(function (ok, ng) { var q = d.transaction('records').objectStore('records').getAll(); q.onsuccess = function () { ok(q.result || []); }; q.onerror = function () { ng(q.error); }; }); });
  }

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
    var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(CFG);   // 不具合・要望フォームが先に初期化していても大丈夫なように
    FB = { A: m[1], F: m[2], auth: m[1].getAuth(app), fs: m[2].getFirestore(app) };
    return FB;
  }
  /* v0.25.4（v0.25.8 で記録のページ＝トップへ移動）：利用カウンター（stats/counter の n だけ。個人の情報は送らない）。1端末1日1回だけ +1、失敗したら表示を隠すだけ */
  var COUNT_KEY = 'lanenote.count.v1';
  async function useCounter() {
    var el = $('useCount'); if (!el || !CLOUD_READY) return;
    try {
      await loadFlags(); if (!FLAGS.counter) { el.hidden = true; return; }   // v0.26.9：管理者が止めているときは数えない・出さない
      var F = (await loadFirebase()).F, ref = F.doc(FB.fs, 'stats', 'counter'), d = new Date();
      var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), last = null;
      try { last = localStorage.getItem(COUNT_KEY); } catch (e) { }
      if (last !== day) {
        try { await F.updateDoc(ref, { n: F.increment(1), at: F.serverTimestamp() }); }
        catch (e) { if (e && e.code === 'not-found') await F.setDoc(ref, { n: 1, at: F.serverTimestamp() }); else if (!(e && e.code === 'permission-denied')) throw e; }   // v0.26.1（C407）：全体で2秒に1回まで。ほかの人とぶつかったときは数えずに表示だけ
        try { localStorage.setItem(COUNT_KEY, day); } catch (e) { }
      }
      var snap = await F.getDoc(ref), n = snap.exists() ? snap.data().n : null;
      if (typeof n !== 'number' || !isFinite(n) || n < 1) { el.hidden = true; return; }
      /* v0.25.6：「2026.10.13-」のあとに、数字を1けたずつレーン番号板のような四角に入れる */
      var num = String(Math.floor(n)); el.textContent = ''; var lb = document.createElement('span'); lb.className = 'uc-from'; lb.textContent = '2026.10.13-'; lb.setAttribute('aria-hidden', 'true'); el.appendChild(lb);
      for (var i = 0; i < num.length; i++) { var dg = document.createElement('span'); dg.className = 'uc-d'; dg.textContent = num[i]; dg.setAttribute('aria-hidden', 'true'); el.appendChild(dg); }
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', '2026年10月13日からの利用 ' + num + '回'); el.hidden = false;
    } catch (e) { el.hidden = true; }
  }
  window.addEventListener('load', function () { setTimeout(useCounter, 1200); });
  /* v0.14（監査F03）：読み書きは「始めたときのアカウント（uid）と認証の世代」に固定する。途中でログアウト・切り替えがあったら、続きをやめる */
  var authEpoch = 0;
  /* v0.26：チームで共有。TEAM＝いま選んでいるチーム（なければ自分だけ）。チームを切りかえるときも authEpoch を進め、途中の読み書きは中止する（A01） */
  var TEAM = null;
  function scope() { var uid = USER ? USER.uid : null; return { uid: uid, epoch: authEpoch, team: uid && TEAM ? { id: TEAM.id, role: TEAM.role } : null, dbName: uid ? 'lanenote-cache-' + uid : LOCAL_DB }; }
  function check(sc) {
    if (sc.epoch !== authEpoch || sc.uid !== (USER ? USER.uid : null) || (sc.team ? sc.team.id : null) !== (USER && TEAM ? TEAM.id : null)) { var e = new Error('ログインしているアカウントが変わったため、処理を中止しました'); e.code = 'auth-context-changed'; throw e; }
  }
  function isAbort(e) { return e && e.code === 'auth-context-changed'; }
  // v0.7（再監査A01）：scope を省略して「今のユーザー」を取り直す経路は残さない（呼び出し側がイベントの先頭で固定して渡す）
  function need(sc) { if (!sc || sc.epoch == null) throw new Error('内部エラー：保存先（scope）が渡されていません'); check(sc); return sc; }
  // v0.7（再監査A04）：「この端末のデータを消す」のあとは、明示的に再開するまで控え（IndexedDB）を作らない
  function noCacheKey(uid) { return 'lanenote-nocache-' + uid; }
  function noCache(sc) { if (!sc.uid) return false; try { return localStorage.getItem(noCacheKey(sc.uid)) === '1'; } catch (e) { return false; } }
  function setNoCache(uid, on) { try { if (on) localStorage.setItem(noCacheKey(uid), '1'); else localStorage.removeItem(noCacheKey(uid)); } catch (e) { } }
  // v0.7（再監査A05）：サーバーから読む（SDKのキャッシュを「クラウドの結果」と決め付けない）
  function offlineErr() { var e = new Error('クラウドにつながりません'); e.code = 'unavailable'; return e; }
  async function serverDocs(q) {
    if (FB.F.getDocsFromServer) return FB.F.getDocsFromServer(q);
    var snap = await FB.F.getDocs(q);
    if (snap && snap.metadata && snap.metadata.fromCache) throw offlineErr();
    return snap;
  }
  function isPerm(e) { return e && /permission-denied|unauthenticated/.test(e.code || ''); }
  function colFor(uid, name) { if (!uid) throw new Error('ログインが必要です'); return FB.F.collection(FB.fs, 'users', uid, name || 'records'); }
  async function cloudPut(list, sc) {
    need(sc); var c = colFor(sc.uid);
    for (var i = 0; i < list.length; i += 400) {             // 1回のまとめ書きは500件まで
      check(sc);
      var b = FB.F.writeBatch(FB.fs);
      list.slice(i, i + 400).forEach(function (r) { b.set(FB.F.doc(c, docId(r.id)), clean(r)); });
      await b.commit();
      check(sc);
    }
  }
  async function cloudDel(ids, sc) {
    need(sc); var c = colFor(sc.uid);
    for (var i = 0; i < ids.length; i += 400) {
      check(sc);
      var b = FB.F.writeBatch(FB.fs);
      ids.slice(i, i + 400).forEach(function (id) { b.delete(FB.F.doc(c, docId(id))); });
      await b.commit();
      check(sc);
    }
  }

  /* ---------- v0.5：大会ごとの天気（users/{uid}/meets/{大会}）・中学/高校を手で選んだ選手（users/{uid}/settings/divOverrides） ---------- */
  var METS = {}, DIV_OV = {}, REVIEW = [];
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function metsKey(uid) { return uid ? 'lanenote-rec-meets-' + uid : 'lanenote-rec-meets'; }
  function ovKey(uid) { return uid ? 'lanenote-rec-divov-' + uid : 'lanenote-rec-divov'; }
  async function loadSide(sc) {
    check(sc);
    if (sc.team) return teamSide(sc);
    var m0 = lsGet(metsKey(sc.uid), {}), o0 = lsGet(ovKey(sc.uid), {});
    if (!sc.uid || OFFLINE) return { mets: m0, ov: o0 };
    try {
      var snap = await serverDocs(colFor(sc.uid, 'meets')), m = {}; check(sc);
      snap.forEach(function (d) { var x = d.data(); if (x && x.key) m[x.key] = x; });
      var ov = await (FB.F.getDocFromServer || FB.F.getDoc)(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'divOverrides')); check(sc);
      var o = ov.exists() && ov.data().map || {};
      if (!noCache(sc)) { lsSet(metsKey(sc.uid), m); lsSet(ovKey(sc.uid), o); }
      return { mets: m, ov: o };
    } catch (e) { if (isAbort(e)) throw e; return { mets: m0, ov: o0 }; }
  }
  async function saveMeet(key, w, sc) {
    need(sc);
    var p = key.split('|'), o = { key: key, date: p[0], meet: p.slice(1).join('|'), weather: w.weather || '', temp: w.temp === '' || w.temp == null || isNaN(+w.temp) ? null : +w.temp, humidity: w.humidity === '' || w.humidity == null || isNaN(+w.humidity) ? null : +w.humidity, updatedAt: new Date().toISOString() };
    METS[key] = o;
    if (sc.team) { await FB.F.setDoc(FB.F.doc(FB.fs, 'teams', sc.team.id, 'meets', docId(key)), o); check(sc); return; }
    if (!noCache(sc)) lsSet(metsKey(sc.uid), METS);
    if (sc.uid) { await FB.F.setDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'meets', docId(key)), o); check(sc); }
  }
  async function saveOverrides(sc) {
    need(sc);
    if (sc.team) { await FB.F.setDoc(FB.F.doc(FB.fs, 'teams', sc.team.id, 'settings', 'divOverrides'), { map: DIV_OV, updatedAt: new Date().toISOString() }); check(sc); return; }
    if (!noCache(sc)) lsSet(ovKey(sc.uid), DIV_OV);
    if (sc.uid) { await FB.F.setDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'divOverrides'), { map: DIV_OV, updatedAt: new Date().toISOString() }); check(sc); }
  }
  /* v0.26.11 選手台帳（settings/roster）。チームでは顧問だけが変えられる（ルール：settings は顧問）。自分だけのときは端末とクラウド */
  var ROSTER = [], RS = { sel: {}, split: {}, plan: null };
  function rosterKey(uid) { return uid ? 'lanenote-rec-roster-' + uid : 'lanenote-rec-roster'; }
  function canRoster(sc) { return !sc.team || sc.team.role === 'coach'; }
  async function loadRoster(sc) {
    var r0 = sc.team ? [] : lsGet(rosterKey(sc.uid), []);
    if ((!sc.uid && !sc.team) || OFFLINE) return r0;
    try { var d = await (FB.F.getDocFromServer || FB.F.getDoc)(sc.team ? FB.F.doc(FB.fs, 'teams', sc.team.id, 'settings', 'roster') : FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'roster')); check(sc); var l = d.exists() && d.data().list || []; if (!sc.team && !noCache(sc)) lsSet(rosterKey(sc.uid), l); return l; }
    catch (e) { if (isAbort(e)) throw e; return r0; }
  }
  async function saveRoster(sc) {
    need(sc); if (!canRoster(sc)) throw new Error('選手台帳を変えられるのは顧問だけです');
    var list = ROSTER.map(LaneRoster.clean), v = { list: list, updatedAt: new Date().toISOString() };
    if (sc.team) { await FB.F.setDoc(FB.F.doc(FB.fs, 'teams', sc.team.id, 'settings', 'roster'), v); check(sc); return; }
    if (!noCache(sc)) lsSet(rosterKey(sc.uid), list);
    if (sc.uid) { await FB.F.setDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'roster'), v); check(sc); }
  }
  // 記録に選手ID をつける・外す（同じ記録IDのまま中身だけ直す。チームでは変更履歴に残る）
  async function relinkRecs(list, sc) {
    need(sc); if (!list.length) return;
    if (sc.team) { await LT(sc).write(sc.team.id, sc.team.role, list.map(function (r) { return { rid: r.id, data: r, act: 'edit' }; })); check(sc); return; }
    for (var i = 0; i < list.length; i++) await replaceRecord(list[i].id, list[i], sc);
  }
  function rosterOf(aid) { for (var i = 0; i < ROSTER.length; i++) if (ROSTER[i].aid === aid) return ROSTER[i]; return null; }
  function gradeNow(e) { var g = LaneRoster.gradeIn(e, LaneRoster.schoolYear()); return e.status === 'graduated' ? '卒業（' + e.gradYear + '年度）' : e.status === 'left' ? '退部・転校' : g && g > LaneRoster.maxGrade(e) ? '最上級を過ぎています（年度更新で卒業・進学を確かめてください）' : g ? g + '年' : '学年未設定'; }
  function rosterCard(key, pf, mine) {
    if (typeof LaneRoster === 'undefined') return '';
    var sc = scope(), can = canRoster(sc);
    if (key.indexOf('id:') !== 0) {
      return '<div class="card ro-card"><b>🪪 選手台帳</b> <span class="small muted">まだ台帳に入っていません（名前と所属で、記録をまとめて表示しています）</span>' +
        (can ? '<p class="small">台帳に入れると、選手IDで記録をまとめます。名前の表記が変わっても・中学から高校に上がっても、同じ人として扱えます。<br><button type="button" class="btn sm" data-ro="add" data-key="' + esc(key) + '">🪪 台帳に入れる（' + mine.length + '件の記録）</button></p>' : '<p class="small muted">台帳に入れるのは顧問です。</p>') + '</div>';
    }
    var e = rosterOf(key.slice(3)) || { aid: key.slice(3), name: pf.name, status: 'active', moves: [] };
    var cand = LaneRoster.candidates(ALL, e, R);
    var h = '<div class="card ro-card"><b>🪪 選手台帳</b> <span class="small muted">ID ' + esc(e.aid) + '</span><p class="small">' + esc(e.name) + (e.kana ? '（' + esc(e.kana) + '）' : '') + '・' + esc(e.team || '') + '・<b>' + esc(gradeNow(e)) + '</b>' + (e.entry ? '<span class="muted">（' + e.entry + '年度に1年）</span>' : '') + '</p>';
    if ((e.moves || []).length) h += '<p class="small">所属の変更：' + e.moves.map(function (m) { return esc(m.date) + ' ' + esc(m.from) + ' → ' + esc(m.to) + (m.note ? '（' + esc(m.note) + '）' : ''); }).join('、') + '<br><span class="muted">前の記録の所属は、そのときのまま残ります。</span></p>';
    if (can) h += '<div class="rb-row"><label class="small">1年生だった年度 <input type="number" min="2000" max="2100" data-ro-in="entry" value="' + esc(e.entry || '') + '" style="width:6em"></label><button type="button" class="btn sub sm" data-ro="entry" data-aid="' + esc(e.aid) + '">学年を直す</button>' +
      '<label class="small">新しい所属 <input type="text" data-ro-in="to" maxlength="60" placeholder="例：架空南高" style="width:9em"></label><button type="button" class="btn sub sm" data-ro="move" data-aid="' + esc(e.aid) + '">所属を変える</button>' +
      (e.status === 'active' ? '<button type="button" class="btn sub sm" data-ro="grad" data-aid="' + esc(e.aid) + '">卒業にする</button>' : '<button type="button" class="btn sub sm" data-ro="back" data-aid="' + esc(e.aid) + '">在籍に戻す</button>') + '</div>';
    if (cand.length) h += '<div class="ro-cand"><p class="small"><b>同じ名前で、台帳に入っていない記録</b>があります。<b>同じ人か確かめてから</b>入れてください（名前だけで自動的にまとめることはしません）。</p><ul>' + cand.map(function (c) { return '<li>' + esc(c.name) + ' <span class="small muted">' + esc(c.teams.join('・')) + '・' + c.n + '件（' + esc(c.first) + '〜' + esc(c.last) + '）</span>' + (can ? ' <button type="button" class="btn sm" data-ro="link" data-aid="' + esc(e.aid) + '" data-key="' + esc(c.key) + '">同じ人なので入れる</button>' : '') + '</li>'; }).join('') + '</ul></div>';
    if (can && mine.length > 1) h += '<details class="ro-split"><summary class="small"><b>別の人の記録が混ざっているとき</b>（分ける）</summary><ul class="small">' + mine.slice().sort(function (a, b) { return cmp(a.date, b.date); }).map(function (r) { return '<li><label><input type="checkbox" data-ro-split="' + esc(r.id) + '"> ' + esc(r.date) + ' ' + esc(r.meet) + ' ' + esc(r.event) + ' ' + esc(r.mark) + ' ' + esc(r.team) + '</label></li>'; }).join('') + '</ul><button type="button" class="btn sub sm" data-ro="split" data-aid="' + esc(e.aid) + '">選んだ記録を別の人（新しいID）に分ける</button></details>';
    return h + '</div>';
  }
  function rosterHome() {
    if (typeof LaneRoster === 'undefined') return '';
    var sc = scope(), can = canRoster(sc), y = LaneRoster.schoolYear();
    var act = ROSTER.filter(function (e) { return e.status === 'active'; }), old = ROSTER.filter(function (e) { return e.status !== 'active'; });
    var row = function (e) { return '<li><a href="#athlete=' + encodeURIComponent('id:' + e.aid) + '">' + esc(e.name) + '</a> <span class="small muted">' + esc(e.team || '') + '・' + esc(gradeNow(e)) + '</span></li>'; };
    var h = '<details class="card ro-home"' + (RS.open ? ' open' : '') + ' data-ro-d="1"><summary><b>🪪 選手台帳・年度更新</b>（在籍 ' + act.length + '人' + (old.length ? '・卒業など ' + old.length + '人' : '') + '）</summary>';
    h += '<p class="small">選手のページの「🪪 台帳に入れる」で選手IDをつけます。台帳の人は、名前の表記が変わっても同じ人として記録をまとめます。<b>名前だけで自動的に結びつけることはしません。</b></p>';
    if (act.length) h += '<ul class="ro-list">' + act.map(row).join('') + '</ul>'; else h += '<p class="small muted">まだだれも入っていません。</p>';
    if (old.length) h += '<details><summary class="small">卒業・退部の人（記録はそのまま残ります）</summary><ul class="ro-list">' + old.map(row).join('') + '</ul></details>';
    if (can && act.length) {
      h += '<p><button type="button" class="btn sub sm" data-ro="plan">📅 ' + y + '年度の学年を確かめる（年度更新）</button></p>';
      if (RS.plan) { var g = RS.plan.filter(function (p) { return p.action === 'graduate'; }); h += '<div class="ro-plan small"><p>' + y + '年度：' + RS.plan.map(function (p) { return esc(p.name) + ' ' + (p.action === 'graduate' ? '<b>卒業</b>' : p.grade + '年'); }).join('、') + '</p>' + (g.length ? '<button type="button" class="btn sm" data-ro="roll">' + g.length + '人を卒業にする</button>' : '<p>卒業になる人はいません（学年は年度から自動で上がります）。</p>') + '</div>'; }
    }
    return h + '</details>';
  }
  /* v0.26.12 リレー：チームの記録と走順を手で入れる。一覧は種目ごとに速い順 */
  var RL = { open: false, edit: '' };
  var RELAY_EVS = ['男子4×100mR', '女子4×100mR', '男子4×400mR', '女子4×400mR', '混合4×400mR'];
  function relayHome() {
    if (!R.isRelay) return '';
    var rs = ALL.filter(function (r) { return R.isRelay(r.event) && !r._del; }), by = {};
    rs.forEach(function (r) { var k = R.normEvent(r.event); (by[k] = by[k] || []).push(r); });
    var names = {}; ALL.forEach(function (r) { if (!R.isRelay(r.event) && r.name) names[r.name] = 1; });
    var ed = RL.edit ? ALL.filter(function (r) { return r.id === RL.edit; })[0] : null, lg = ed ? R.parseLegs(ed.legs) : [], v = function (k, d) { return esc(ed ? ed[k] || '' : d || ''); };
    var last = rs.slice().sort(function (a, b) { return cmp(a.date, b.date); }).pop() || {};
    var h = '<details class="card rl-home"' + (RL.open || RL.edit ? ' open' : '') + ' data-rl-d="1"><summary><b>🏃 リレーの記録</b>（' + rs.length + '件）</summary>';
    h += Object.keys(by).sort().map(function (k) {
      var l = by[k].slice().sort(function (a, b) { var x = R.markValue(a.mark), y = R.markValue(b.mark); return (x ? x.v : 1e9) - (y ? y.v : 1e9) || cmp(b.date, a.date); });
      return '<h4 class="rl-ev">' + esc(k) + '</h4><ol class="rl-list">' + l.map(function (r, i) { var p = R.parseLegs(r.legs); return '<li><b class="lmk">' + esc(r.mark) + '</b>' + (i === 0 ? ' <span class="pbt">チーム最高</span>' : '') + ' <span class="small muted">' + esc(r.date) + ' ' + esc(r.meet) + (r.round ? ' ' + esc(r.round) : '') + (r.rank !== '' && r.rank != null ? ' ' + esc(r.rank) + '位' : '') + '</span><br><span class="small">' + (p.length ? p.map(function (n, j) { return '<span class="rl-leg">' + (j + 1) + '走 ' + esc(n || '？') + '</span>'; }).join(' → ') : '<span class="muted">走順なし</span>') + '</span> <button type="button" class="btn sub sm" data-relay="edit" data-id="' + esc(r.id) + '">✏️ 直す</button></li>'; }).join('') + '</ol>';
    }).join('');
    h += '<div class="rl-form"><p class="small"><b>' + (ed ? '✏️ リレーの記録を直す' : '➕ リレーの記録を入れる') + '</b>（走順の名前は、記録にある選手から選べます）</p><div class="rb-row">' +
      '<label>日付 <input type="date" data-rl="date" value="' + v('date', last.date) + '"></label><label>大会 <input type="text" data-rl="meet" maxlength="100" value="' + v('meet', last.meet) + '"></label>' +
      '<label>種目 <input type="text" data-rl="event" list="rlEvs" maxlength="40" value="' + v('event', last.event || '男子4×100mR') + '"></label><label>チーム <input type="text" data-rl="team" maxlength="60" value="' + v('team', last.team || ($('rbSchool') ? $('rbSchool').value : '')) + '"></label>' +
      '<label>記録 <input type="text" data-rl="mark" inputmode="decimal" placeholder="例：43.21、3:25.10" value="' + v('mark') + '" style="width:7em"></label><label>ラウンド <input type="text" data-rl="round" maxlength="30" value="' + v('round') + '" style="width:5em"></label><label>順位 <input type="text" data-rl="rank" inputmode="numeric" value="' + v('rank') + '" style="width:3.5em"></label></div>' +
      '<div class="rb-row rl-legs">' + [0, 1, 2, 3].map(function (i) { return '<label>' + (i + 1) + '走 <input type="text" data-rl-leg="' + i + '" list="rlNames" maxlength="40" value="' + esc(lg[i] || '') + '"></label>'; }).join('') + '</div>' +
      '<datalist id="rlEvs">' + RELAY_EVS.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist><datalist id="rlNames">' + Object.keys(names).sort().map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<p><button type="button" class="btn" data-relay="save">' + (ed ? '直して保存' : '保存する') + '</button>' + (ed ? ' <button type="button" class="btn sub" data-relay="cancel">やめる</button>' : '') + '</p><div class="status" id="rlStatus" aria-live="polite"></div></div>';
    return h + '</details>';
  }
  async function onRelay(b) {
    var a = b.getAttribute('data-relay'), box = b.closest('.rl-home');
    if (a === 'edit') { RL.edit = b.getAttribute('data-id'); render(); return; }
    if (a === 'cancel') { RL.edit = ''; render(); return; }
    var f = {}; box.querySelectorAll('[data-rl]').forEach(function (x) { f[x.getAttribute('data-rl')] = x.value; });
    f.legs = [0, 1, 2, 3].map(function (i) { return box.querySelector('[data-rl-leg="' + i + '"]').value; });
    var res = R.relayRecord(f); if (!res.rec) { status('rlStatus', '✖ ' + res.errors.map(esc).join('<br>✖ '), 'ng'); return; }
    var sc = scope(), r = res.rec, now = new Date().toISOString(); b.disabled = true;
    try {
      if (RL.edit) {
        var old = ALL.filter(function (x) { return x.id === RL.edit; })[0]; if (!old) return;
        var o = Object.assign({}, old, r, { updatedAt: now }); if (!r.legs) delete o.legs; o.id = R.recId(o.meet, o.date, o);
        if (o.id !== old.id && ALL.some(function (x) { return x.id === o.id; })) { status('rlStatus', '✖ 同じ記録がすでにあります。', 'ng'); return; }
        await replaceRecord(old.id, o, sc); RL.edit = '';
      } else {
        r.src = '手入力'; r.order = 0; r.savedAt = now; r.id = R.recId(r.meet, r.date, r);
        var put = await putMany([r], sc); if (!put.added) { status('rlStatus', 'ⓘ 同じ記録がすでに保存されています。', ''); return; }
      }
      RL.open = true; await reload(sc); status('rlStatus', '✔ 保存しました：' + esc(r.event) + ' <b>' + esc(r.mark) + '</b>', 'ok');
    } catch (x) { if (isAbort(x)) return; status('rlStatus', '✖ 保存できませんでした：' + esc(x.message), 'ng'); }
    finally { b.disabled = false; }
  }
  async function onRoster(b) {
    var sc = scope(), a = b.getAttribute('data-ro'), aid = b.getAttribute('data-aid'), key = b.getAttribute('data-key'), card = b.closest('.card') || document;
    var val = function (n) { var x = card.querySelector('[data-ro-in="' + n + '"]'); return x ? x.value.trim() : ''; };
    var e = aid ? rosterOf(aid) : null, today = new Date().toISOString().slice(0, 10), msg = '';
    if (a === 'plan') { RS.plan = LaneRoster.rollover(ROSTER, LaneRoster.schoolYear()); RS.open = true; render(); return; }
    b.disabled = true;
    try {
      if (a === 'add') {
        var mine = ALL.filter(function (r) { return R.athleteKey(r) === key; }); if (!mine.length) return;
        var last = mine.slice().sort(function (x, y) { return cmp(x.date, y.date); }).pop(), y0 = LaneRoster.schoolYear(last.date);
        if (!confirm('「' + (last.name || last.kana) + '」（' + (last.team || '') + '）を台帳に入れ、この ' + mine.length + '件の記録に選手IDをつけます。よろしいですか？')) return;
        var ne = { aid: LaneRoster.newAid(), name: last.name || last.kana, kana: last.kana || '', team: last.team || '', div: R.divisionOf(last) || '', entry: LaneRoster.entryFor(last.grade, y0), status: 'active', moves: [] };
        ROSTER = ROSTER.concat([ne]); await saveRoster(sc); await relinkRecs(LaneRoster.link(ALL, [key], ne.aid, R), sc);
        history.replaceState(null, '', location.pathname + location.search + '#athlete=' + encodeURIComponent('id:' + ne.aid)); msg = '✔ 台帳に入れました（ID ' + ne.aid + '）。';
      } else if (a === 'link') {
        var n = ALL.filter(function (r) { return R.athleteKey(r) === key; }).length;
        if (!confirm('この ' + n + '件の記録を「' + (e ? e.name : '') + '」の記録として入れます。\n同じ人であることを確かめましたか？（あとで「分ける」で戻せます）')) return;
        await relinkRecs(LaneRoster.link(ALL, [key], aid, R), sc); msg = '✔ ' + n + '件を入れました。';
      } else if (a === 'split') {
        var ids = Array.prototype.map.call(card.querySelectorAll('[data-ro-split]:checked'), function (x) { return x.getAttribute('data-ro-split'); });
        if (!ids.length) { msg = 'ⓘ 分ける記録にチェックを入れてください。'; return; }
        var nm = prompt('分けた記録の選手の名前（同じ名前のままでもかまいません）', e ? e.name : ''); if (nm == null) return;
        var src = ALL.filter(function (r) { return ids.indexOf(r.id) >= 0; }), l2 = src.slice().sort(function (x, y) { return cmp(x.date, y.date); }).pop();
        var se = { aid: LaneRoster.newAid(), name: nm.trim() || (l2.name || ''), kana: l2.kana || '', team: l2.team || '', div: R.divisionOf(l2) || '', entry: LaneRoster.entryFor(l2.grade, LaneRoster.schoolYear(l2.date)), status: 'active', moves: [] };
        ROSTER = ROSTER.concat([se]); await saveRoster(sc); await relinkRecs(LaneRoster.split(ALL, ids, se.aid), sc); msg = '✔ ' + ids.length + '件を別の人（ID ' + se.aid + '）に分けました。';
      } else if (a === 'entry' || a === 'move' || a === 'grad' || a === 'back') {
        if (!e) return; var o;
        if (a === 'entry') { var v = parseInt(val('entry'), 10); if (!(v >= 2000 && v <= 2100)) { msg = 'ⓘ 1年生だった年度を西暦で入れてください（例：2025）。'; return; } o = Object.assign({}, e, { entry: v }); }
        if (a === 'move') { var to = val('to'); if (!to) { msg = 'ⓘ 新しい所属を入れてください。'; return; } if (!confirm('所属を「' + to + '」に変えます。前の記録の所属はそのまま残ります。')) return; o = LaneRoster.move(e, to, today, ''); }
        if (a === 'grad') { if (!confirm(e.name + ' を卒業にします（記録はそのまま残ります）。')) return; o = Object.assign({}, e, { status: 'graduated', gradYear: LaneRoster.schoolYear() }); }
        if (a === 'back') { o = Object.assign({}, e, { status: 'active' }); delete o.gradYear; }
        ROSTER = ROSTER.map(function (x) { return x.aid === e.aid ? o : x; }); await saveRoster(sc); msg = '✔ 台帳を直しました。';
      } else if (a === 'roll') {
        var g = RS.plan.filter(function (p) { return p.action === 'graduate'; });
        if (!confirm(g.map(function (p) { return p.name; }).join('、') + ' を卒業にします（記録はそのまま残ります）。')) return;
        ROSTER = LaneRoster.applyRollover(ROSTER, RS.plan, LaneRoster.schoolYear()); RS.plan = null; await saveRoster(sc); msg = '✔ 年度更新をしました。';
      }
    } catch (x) { if (isAbort(x)) return; msg = '✖ できませんでした：' + esc(x.code === 'permission-denied' ? '権限がありません（台帳を変えられるのは顧問です）' : x.message); }
    finally { b.disabled = false; if (msg) status('rbDataStatus', msg, /^✖/.test(msg) ? 'ng' : /^✔/.test(msg) ? 'ok' : ''); }
    await reload(sc);
  }
  function applyInference() { var inf = R.inferDivisions(ALL, DIV_OV); R.setDivisionHints(inf.hints); REVIEW = inf.review; }
  var WEATHERS = [['晴', '☀️'], ['晴時々曇', '🌤'], ['曇', '⛅'], ['小雨', '🌦'], ['雨', '🌧'], ['雪', '❄'], ['強風', '🌬']];
  function wIcon(w) { for (var i = 0; i < WEATHERS.length; i++) if (WEATHERS[i][0] === w) return WEATHERS[i][1]; return ''; }
  function weatherText(key) { var m = METS[key]; if (!m) return ''; var t = []; if (m.weather) t.push(wIcon(m.weather) + ' ' + m.weather); if (m.temp != null) t.push(m.temp + '℃'); if (m.humidity != null) t.push('湿度' + m.humidity + '%'); return t.join(' '); }
  function weatherTag(key) { var t = weatherText(key); return t ? '<span class="wx">' + esc(t) + '</span>' : ''; }
  function weatherInputs(w, attr) {
    w = w || {};
    return '<label>天気 <select ' + attr + '="weather"><option value="">（なし）</option>' + WEATHERS.map(function (x) { return '<option value="' + x[0] + '"' + (w.weather === x[0] ? ' selected' : '') + '>' + x[1] + ' ' + x[0] + '</option>'; }).join('') + '</select></label>' +
      '<label>気温 <input type="number" step="0.1" inputmode="decimal" ' + attr + '="temp" value="' + esc(w.temp == null ? '' : w.temp) + '" style="width:5.5em">℃</label>' +
      '<label>湿度 <input type="number" step="1" min="0" max="100" inputmode="numeric" ' + attr + '="humidity" value="' + esc(w.humidity == null ? '' : w.humidity) + '" style="width:4.5em">%</label>';
  }

  // 一覧を読む：ログイン中はクラウドから読み、控え（IndexedDB）を入れ替える。通信できないときだけ控えを出す（権限エラーは控えで隠さない）
  // v0.7（再監査A05）：getDocsFromServer でサーバーの結果だけを「クラウドの一覧」として扱う。
  //   通信できない（SDKのキャッシュしか無い）ときは控えを置き換えずに控えを出す。権限エラーは控えで隠さない
  async function getAll(sc) {
    need(sc);
    if (!sc.uid) return lgetAll(sc.dbName, sc);
    if (sc.team) return teamGetAll(sc);
    var snap;
    try { snap = await serverDocs(colFor(sc.uid)); }
    catch (e) {
      check(sc);
      if (isPerm(e)) throw new Error('クラウドの記録を読む権限がありません。ログインし直してください');
      OFFLINE = true;
      if (noCache(sc)) return [];
      return lgetAll(sc.dbName, sc);
    }
    check(sc);
    var list = []; snap.forEach(function (d) { list.push(d.data()); });
    OFFLINE = false;
    if (noCache(sc)) return list;
    try { await ltx('readwrite', function (s) { s.clear(); list.forEach(function (r) { s.put(r); }); }, sc.dbName, sc); } catch (e) { if (isAbort(e)) throw e; }
    check(sc);
    return list;
  }
  // 保存済みと重なる記録は入れない（v0.5 までのIDで保存した記録とも、区分が同じなら重ねない）
  /* v0.7（再監査A03）：保存済みとの重なりは「IDが同じ」ではなく、記録の中身（大会・日付＋identityParts）でくらべる。
     ・中身が同じ → 重ねない（v0.5/v0.6 の古いIDで保存した記録も、中身で見つかる）
     ・IDは同じだが中身が違う（古いIDがぶつかった別の選手・区分）→ 落とさず、新しいIDを付けて入れる
     ・古い記録にナンバーが無いなど、同じか別か決められない → 自動で捨てず入れて「要確認（重複かも）」にする */
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  async function putMany(list, sc, act) {
    need(sc);
    var existing = ALL.slice();
    if (!sc.uid || OFFLINE) existing = existing.concat(await lgetAll(sc.dbName, sc));
    var byId = {}, full = {}, loose = {};
    function index(r) { byId[r.id] = r; full[R.fullIdentity(r)] = r; (loose[R.looseIdentity(r)] = loose[R.looseIdentity(r)] || []).push(r); }
    existing.forEach(index);
    var add = [], review = 0;
    list.forEach(function (r0) {
      var r = Object.assign({}, r0), fi = R.fullIdentity(r);
      if (hasOwn(full, fi)) return;                                  // 同じ記録
      if (!r.id || hasOwn(byId, r.id)) r.id = R.recId(r.meet, r.date, r);   // IDだけぶつかった別の記録
      if (hasOwn(byId, r.id)) return;
      var cand = (loose[R.looseIdentity(r)] || []).filter(function (x) { return String(x.bib == null ? '' : x.bib) === '' || String(r.bib == null ? '' : r.bib) === ''; });
      if (cand.length) { r.dupOf = String(cand[0].id); review++; }
      index(r); add.push(r);
    });
    if (add.length) {
      if (sc.team) { var tr = await LT(sc).put(sc.team.id, sc.team.role, add, act, list.length === 1 ? { strict: true } : null); check(sc); return { added: tr.written, dup: list.length - add.length, bad: tr.skipped, review: review, ids: add.map(function (r) { return r.id; }) }; }
      if (sc.uid) await cloudPut(add, sc);
      if (!noCache(sc)) await ltx('readwrite', function (s) { add.forEach(function (r) { s.put(r); }); }, sc.dbName, sc);
    }
    check(sc);
    return { added: add.length, dup: list.length - add.length, review: review, ids: add.map(function (r) { return r.id; }) };
  }
  async function delIds(ids, sc) {
    need(sc);
    if (sc.team) { await LT(sc).del(sc.team.id, sc.team.role, ids); check(sc); return; }
    if (sc.uid) await cloudDel(ids, sc);
    await ltx('readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); }, sc.dbName, sc);
  }
  // v0.6：1件を直す（IDが変わるときは、古いほうを消して新しいほうを入れる）
  async function replaceRecord(oldId, rec, sc) {
    need(sc);
    if (sc.team) { await LT(sc).edit(sc.team.id, sc.team.role, oldId, rec); check(sc); return; }
    if (sc.uid) {
      var b = FB.F.writeBatch(FB.fs), c = colFor(sc.uid);
      if (oldId !== rec.id) b.delete(FB.F.doc(c, docId(oldId)));
      b.set(FB.F.doc(c, docId(rec.id)), clean(rec));
      await b.commit(); check(sc);
    }
    if (!noCache(sc)) await ltx('readwrite', function (s) { if (oldId !== rec.id) s.delete(oldId); s.put(rec); }, sc.dbName, sc);
  }
  async function clearAll(sc) {
    need(sc);
    if (sc.team) throw new Error('チームの記録は、まとめて全部は消せません（大会ごとに消すか、1件ずつ消してください。消したものは変更履歴から戻せます）');
    if (sc.uid) {
      var ids = []; (await serverDocs(colFor(sc.uid))).forEach(function (d) { var x = d.data(); ids.push(x && x.id != null ? String(x.id) : d.id); }); check(sc);
      await cloudDel(ids, sc);
    }
    await ltx('readwrite', function (s) { s.clear(); }, sc.dbName, sc);
  }
  // v0.14（監査F07）：クラウドに置いたものを全部消す（記録・天気・中学/高校の選択）
  async function clearCloudSide(sc) {
    check(sc); if (!sc.uid || sc.team) return;
    var keys = []; (await serverDocs(colFor(sc.uid, 'meets'))).forEach(function (d) { keys.push(d.id); }); check(sc);
    var b = FB.F.writeBatch(FB.fs);
    keys.forEach(function (k) { b.delete(FB.F.doc(FB.fs, 'users', sc.uid, 'meets', k)); });
    b.delete(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'divOverrides'));
    b.delete(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'roster'));   // v0.26.13：選手台帳も消す
    b.delete(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'mode'));
    await b.commit(); check(sc);
    METS = {}; DIV_OV = {}; lsSet(metsKey(sc.uid), {}); lsSet(ovKey(sc.uid), {});
  }

  /* ---------- v0.26：チームで共有（teams/{T}）。権限は firestore.rules が決める。ここは表示と、ルールに合う読み書きだけ ---------- */
  var TEAMS = [], TEAM_LOST = '', QUAR = [], TM = { members: null, codes: null, hist: null, banned: null, busy: false, open: {} }, TEAM_WAIT = '', SAFE = { open: false, data: null }, FLAGS = { talk: true, relay: true, counter: true, share: true }, ADMIN = false;
  function teamKey(uid) { return 'lanenote.team.v1.' + uid; }
  function myDisplayName() { return String((USER && (USER.displayName || String(USER.email || '').split('@')[0])) || 'メンバー').slice(0, 40); }
  function LT(sc) { return LaneTeam.make({ F: FB.F, fs: FB.fs, uid: sc.uid, name: myDisplayName(), check: function () { check(sc); } }); }
  // チームを選ぶ前（ログイン直後）用：アカウントと世代だけを確かめる
  function LTu(uid, ep) { return LaneTeam.make({ F: FB.F, fs: FB.fs, uid: uid, name: myDisplayName(), check: function () { if (ep !== authEpoch || !USER || USER.uid !== uid) { var e = new Error('ログインしているアカウントが変わったため、処理を中止しました'); e.code = 'auth-context-changed'; throw e; } } }); }
  function roleLabel(r) { return r === 'coach' ? '顧問' : r === 'manager' ? 'マネージャー' : r === 'pending' ? '承認待ち' : r; }
  function jDate(ms) { if (!ms) return ''; var d = new Date(ms + 9 * 3600e3); return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日'; }
  function jDateTime(ms) { if (!ms) return ''; var d = new Date(ms + 9 * 3600e3); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
  function isoDay(ms) { var d = new Date(ms + 9 * 3600e3); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function dayMs(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], 23, 59, 59) - 9 * 3600e3 : 0; }
  async function pickTeam(uid) {
    var ep = authEpoch, api = LTu(uid, ep); TEAMS = await api.myTeams(); TEAM_LOST = '';
    var sel = ''; try { sel = localStorage.getItem(teamKey(uid)) || ''; } catch (e) { }
    if (!sel || !TEAMS.some(function (x) { return x.id === sel; })) return;
    // v0.26.9：承認が要るコードで入った人は、顧問が承認するまで「承認待ち」（チームは読めない）
    var ent = TEAMS.filter(function (x) { return x.id === sel; })[0];
    if (ent.role === 'pending') {
      var st = null; try { st = await api.myStatus(sel); } catch (e) { if (isAbort(e)) throw e; }
      if (ep !== authEpoch) return;
      if (st === 'pending') { TEAM_WAIT = sel; return; }
      if (!st) { TEAM_LOST = 'チーム（承認されませんでした）'; return; }
    }
    var inf = null; try { inf = await api.info(sel); } catch (e) { if (isAbort(e)) throw e; inf = null; }
    if (ep !== authEpoch) return;
    if (!inf || (inf.role === 'manager' && inf.expiresAt && inf.expiresAt < Date.now())) { TEAM_LOST = (TEAMS.filter(function (x) { return x.id === sel; })[0] || {}).name || 'チーム'; return; }
    TEAM = inf;
    if (ent.role === 'pending') { try { await FB.F.setDoc(FB.F.doc(FB.fs, 'users', uid, 'teams', sel), { name: inf.name, role: inf.role, at: new Date().toISOString() }); } catch (e) { } }
  }
  async function teamGetAll(sc) {
    var list;
    try { list = await LT(sc).getRecords(sc.team.id); }
    catch (e) { if (isAbort(e)) throw e; if (isPerm(e)) { TEAM_LOST = TEAM ? TEAM.name : 'チーム'; throw new Error('チームの記録を読めません（チームから外されたか、マネージャーの期限が過ぎた可能性があります）。保存先を「自分だけ」に戻してください'); } throw e; }
    check(sc); OFFLINE = false;
    QUAR = list.filter(function (r) { return !LaneTeam.validRec(r); });   // v0.26.1（C404）：形が正しくない記録は表示に入れず、別に知らせる
    list = list.filter(function (r) { return LaneTeam.validRec(r); });
    return list.map(function (r) { var o = LaneTeam.strip(r); if (r._st === 'pending') o._st = 'pending'; if (r._by) o._by = r._by; return o; });
  }
  async function teamSide(sc) {
    var m = {}, o = {};
    try {
      var snap = await serverDocs(FB.F.collection(FB.fs, 'teams', sc.team.id, 'meets')); check(sc);
      snap.forEach(function (d) { var x = d.data(); if (x && x.key) m[x.key] = x; });
      var ov = await (FB.F.getDocFromServer || FB.F.getDoc)(FB.F.doc(FB.fs, 'teams', sc.team.id, 'settings', 'divOverrides')); check(sc);
      o = ov.exists() && ov.data().map || {};
    } catch (e) { if (isAbort(e)) throw e; }
    return { mets: m, ov: o };
  }
  async function switchTeam(id) {
    if (!USER) return;
    try { if (id) localStorage.setItem(teamKey(USER.uid), id); else localStorage.removeItem(teamKey(USER.uid)); } catch (e) { }
    authEpoch++; resetTeamState();
    resetView();
    try { await pickTeam(USER.uid); } catch (e) { if (!isAbort(e)) status('rbTeamStatus', '✖ ' + esc(e.message), 'ng'); }
    renderTeam(); renderAuth(); await reload(scope());
  }
  function renderTeamPend() { var p = document.querySelector('#rbTeam .tm-pend'); if (p && TEAM && !TM.busy) { var n = pendingList().length, cur = +(p.getAttribute('data-n') || -1); if (cur !== n) { renderTeam(); var q = document.querySelector('#rbTeam .tm-pend'); if (q) q.setAttribute('data-n', n); } } }
  function pendingList() { return ALL.filter(function (r) { return r._st === 'pending'; }); }
  function recLabel(r) { if (!r) return '（なし）'; return [r.name, r.event, r.mark, r.meet].filter(Boolean).join('・'); }
  var ACTS = { add: '追加', edit: '修正', del: '削除', revert: '取り消し', confirm: '確認済みに', migrate: 'コピー' };
  // v0.26.10：チームの設定は team.html（同じ部品で body.team-page）。記録のページには、保存先の切り替え・今の状態・設定へのリンクだけを出す
  var TEAM_PAGE = document.body.classList.contains('team-page');
  function teamStatusHtml() {
    var sel = TEAMS.length ? '<label>保存先 <select id="rbTeamSel"><option value="">👤 自分だけ</option>' + TEAMS.map(function (x) { return '<option value="' + esc(x.id) + '"' + (TEAM && TEAM.id === x.id ? ' selected' : '') + '>👥 ' + esc(x.name) + '</option>'; }).join('') + '</select></label> ' : '';
    var st = TEAM ? '👥 <b>' + esc(TEAM.name) + '</b>（' + esc(roleLabel(TEAM.role)) + '）' + (pendingList().length ? ' ・<span class="pend">未確認</span> ' + pendingList().length + '件' : '')
      : TEAM_WAIT ? '⏳ チームの承認待ちです' : TEAM_LOST ? '⚠ 「' + esc(TEAM_LOST) + '」は今は使えません' : '👤 記録は自分だけが見られます';
    return '<div class="rb-row tm-mini">' + sel + '<span class="small">' + st + '</span> <a class="btn sub sm" href="team.html">👥 チームの設定を開く</a></div><div class="status" id="rbTeamStatus" aria-live="polite"></div>';
  }
  function renderTeam() {
    var box = $('rbTeam'); if (!box) return;
    if (TEAM_PAGE) { var gate = $('tpGate'); if (gate) gate.hidden = !!(USER && CLOUD_READY); }
    if (!USER || !CLOUD_READY) { box.hidden = true; box.innerHTML = ''; return; }
    if (document.body.classList.contains('ln-player') && !TEAM_PAGE) { box.hidden = true; return; }   // 選手モードではチームの欄を出さない
    box.hidden = false;
    if (!TEAM_PAGE) { var o0 = $('rbTeamStatus'), k0 = o0 ? o0.innerHTML : ''; box.innerHTML = teamStatusHtml(); if (k0) $('rbTeamStatus').innerHTML = k0; var tb0 = $('rbTalkBox'); if (tb0) tb0.hidden = !!(TEAM && TEAM.role === 'manager'); return; }
    var sel = '<label>保存先 <select id="rbTeamSel"><option value="">👤 自分だけ（今までどおり）</option>' + TEAMS.map(function (x) { return '<option value="' + esc(x.id) + '"' + (TEAM && TEAM.id === x.id ? ' selected' : '') + '>👥 ' + esc(x.name) + '（' + esc(roleLabel(x.role)) + '）</option>'; }).join('') + '</select></label>';
    var h = '<h3>👥 チームで共有</h3><p class="small muted">顧問・マネージャーが、それぞれ<b>自分のGoogleアカウント</b>で同じチームの記録を使えます。アカウントやパスワードを共有する必要はありません。</p><div class="rb-row">' + sel + '</div>';
    if (TEAM_WAIT && !TEAM) h += '<p class="tm-warn">⏳ <b>承認待ちです。</b>顧問が承認すると、チームの記録が見えるようになります（承認されるまで、チームの記録は見えません）。 <button type="button" class="btn sub sm" data-tm="recheck">承認されたか確かめる</button></p>';
    if (TEAM_LOST && !TEAM) h += '<p class="tm-warn">⚠ 「' + esc(TEAM_LOST) + '」は今は使えません（チームから外されたか、マネージャーの期限が過ぎました）。必要なら顧問に新しい参加コードをもらってください。 <button type="button" class="btn sub sm" data-tm="forget">一覧から消す</button></p>';
    if (!TEAM) {
      h += '<div class="tm-grid"><div class="tm-card"><b>➕ チームを作る</b>（顧問の方）<div class="rb-row"><input type="text" id="rbTeamName" maxlength="40" placeholder="例：本郷高校陸上部"><button type="button" class="btn" data-tm="create">チームを作る</button></div></div>' +
        '<div class="tm-card"><b>🔑 参加コードで入る</b>（顧問・マネージャーの方）<div class="rb-row"><input type="text" id="rbTeamCode" placeholder="顧問からもらった長いコード" autocomplete="off" spellcheck="false"><button type="button" class="btn" data-tm="join">参加する</button></div></div></div>';
    } else {
      var me = TEAM.role === 'coach' ? '🧑‍🏫 顧問' + (TEAM.owner ? '（このチームの持ち主）' : '') : '📋 マネージャー（' + jDate(TEAM.expiresAt) + 'まで）';
      var pend = pendingList();
      if (QUAR.length) h += '<p class="tm-warn">⚠ 形が正しくない記録が ' + QUAR.length + '件あるため、表示から外しています（ほかの記録はそのまま使えます）。 <button type="button" class="btn sub sm" data-tm="quarDel">削除の印を付ける</button></p>';
      // v0.26.17：いちばん上に今の状態（チーム名・自分の役割・未確認の数）
      var nMem = TM.members ? TM.members.filter(function (m) { return m.role !== 'pending'; }).length : null, nWait = TM.members ? TM.members.filter(function (m) { return m.role === 'pending'; }).length : 0;
      h += '<div class="tm-sum"><div class="tm-sum-n">👥 ' + esc(TEAM.name) + '</div><div class="tm-sum-c"><span class="tm-chip on">' + esc(me) + '</span>' + (pend.length ? '<span class="tm-chip warn">未確認 ' + pend.length + '件</span>' : '<span class="tm-chip">未確認なし</span>') + (nWait ? '<span class="tm-chip warn">承認待ち ' + nWait + '人</span>' : '') + (nMem != null ? '<span class="tm-chip">メンバー ' + nMem + '人</span>' : '') + '</div></div>';
      if (TEAM.role === 'coach' && (nMem == null || nMem <= 1)) h += '<ol class="tm-steps"><li><b>招待する</b>：下の「🔑 招待する」で、顧問・マネージャーにコードを送る</li><li><b>メンバーを確認</b>：入った人が「👥 メンバー」に出ます（承認制なら、ここで承認）</li></ol>';
      h += '<p class="tm-me small">あなたは <b>' + esc(me) + '</b>。記録の追加・修正は「変更履歴」に残り、あとから元に戻せます。' + (TEAM.role === 'manager' ? '<br>マネージャーが入れた記録は、顧問が確認するまで <span class="pend">未確認</span> と表示されます。やり取り・体調メモ・チームの設定は顧問だけが使えます。' : '') + '</p>';
      h += '<div class="tm-pend">' + (pend.length ? '<span class="pend">未確認</span> ' + pend.length + '件' + (TEAM.role === 'coach' ? ' <button type="button" class="btn sm" data-tm="confirmAll">内容を見て、すべて確認済みにする</button>' : '') + '<ul class="tm-plist">' + pend.slice(0, 30).map(function (r) { return '<li>' + esc(recLabel(r)) + (TEAM.role === 'coach' ? ' <button type="button" class="btn sub sm" data-tm="confirm" data-id="' + esc(r.id) + '">確認済みにする</button>' : '') + '</li>'; }).join('') + '</ul>' : '✔ 未確認の記録はありません') + '</div>';
      if (TEAM.role === 'coach') h += '<details data-tmd="codes"' + (TM.open['codes'] ? ' open' : '') + '><summary><b>🔑 招待する</b>（参加コード・顧問だけに見えます）</summary><div id="rbTeamCodes">' + codesHtml() + '</div></details>';
      h += '<details data-tmd="members"' + (TM.open['members'] ? ' open' : '') + '><summary><b>👥 メンバー</b></summary><div id="rbTeamMembers">' + membersHtml() + '</div></details>';
      h += '<details data-tmd="hist"' + (TM.open['hist'] ? ' open' : '') + '><summary><b>🕘 変更履歴</b>（だれが・いつ・何を）</summary><div id="rbTeamHist">' + histHtml() + '</div></details>';
      h += '<details><summary><b>📦 自分の記録をこのチームへコピー</b></summary><p class="small">「自分だけ」に保存してある記録を、このチームにコピーします。同じ記録は重ねません。自分だけの記録はそのまま残ります。</p><button type="button" class="btn sub" data-tm="migrate">コピーする（確認が出ます）</button></details>';
      if (TEAM.owner) h += '<details><summary><b>🤝 引き継ぎ（持ち主を渡す）</b></summary><p class="small">異動などのときに、このチームの持ち主を、ほかの顧問に渡します。渡したあとも、あなたは顧問として残ります。</p><div class="rb-row"><select id="rbTeamTo">' + ((TM.members || []).filter(function (m) { return m.role === 'coach' && m.uid !== USER.uid; }).map(function (m) { return '<option value="' + esc(m.uid) + '">' + esc(m.name) + '</option>'; }).join('') || '<option value="">（先に「メンバー」を開いてください／ほかの顧問がいません）</option>') + '</select><button type="button" class="btn sub" data-tm="transfer">持ち主を渡す</button></div></details>';
      if (!TEAM.owner) h += '<p><button type="button" class="btn sub sm" data-tm="leave">このチームから抜ける</button></p>';
    }
    h += '<details data-safe-d="1"' + (SAFE.open ? ' open' : '') + '><summary><b>🔐 見える人とリンク</b>（だれが見られるか・止める）</summary><div id="rbSafe">' + safeHtml() + '</div></details>';
    if (ADMIN && (!TEAM || TEAM.role === 'coach')) h += adminHtml();
    var old = $('rbTeamStatus'), keepH = old ? old.innerHTML : '', keepC = old ? old.className : 'status';   // 描き直してもお知らせは残す
    h += '<div class="' + esc(keepC) + '" id="rbTeamStatus" aria-live="polite">' + keepH + '</div>';
    box.innerHTML = h;
    var tb = $('rbTalkBox'); if (tb) tb.hidden = !!(TEAM && TEAM.role === 'manager');
  }
  function membersHtml() {
    if (!TM.members) return '<p class="small muted">開くと読み込みます…</p>';
    var coach = TEAM.role === 'coach';
    return '<ul class="tm-mlist">' + TM.members.map(function (m) {
      if (m.role === 'pending') return '<li class="tm-wait"><b>' + esc(m.name) + '</b> ⏳ 承認待ち（' + esc(roleLabel(m.want)) + 'として参加したい）' + (coach ? ' <button type="button" class="btn sm" data-tm="approve" data-id="' + esc(m.uid) + '">承認する</button> <button type="button" class="btn sub sm tm-x" data-tm="reject" data-id="' + esc(m.uid) + '">断る</button>' : '') + '</li>';
      var self = m.uid === USER.uid, own = m.uid === TEAM.ownerUid, exp = m.role === 'manager' ? '（' + jDate(m.expiresAt) + 'まで' + (m.expiresAt && m.expiresAt < Date.now() ? '・<b class="ng">期限切れ</b>' : '') + '）' : '';
      var ctl = coach && !self && !own ? ' <select data-tmrole="' + esc(m.uid) + '" aria-label="' + esc(m.name) + 'の役割"><option value="coach"' + (m.role === 'coach' ? ' selected' : '') + '>顧問</option><option value="manager"' + (m.role === 'manager' ? ' selected' : '') + '>マネージャー</option></select>' +
        (m.role === 'manager' ? ' <input type="date" data-tmexp="' + esc(m.uid) + '" value="' + esc(isoDay(m.expiresAt || LaneTeam.schoolYearEnd())) + '" aria-label="期限">' : '') +
        ' <button type="button" class="btn sub sm" data-tm="saveRole" data-id="' + esc(m.uid) + '">変更</button> <button type="button" class="btn sub sm tm-x" data-tm="remove" data-id="' + esc(m.uid) + '">外す</button>' : '';
      return '<li><b>' + esc(m.name) + '</b>' + (self ? '（あなた）' : '') + ' ' + esc(roleLabel(m.role)) + (own ? '・持ち主' : '') + exp + ctl + '</li>';
    }).join('') + '</ul>' + (coach && TM.banned && TM.banned.length ? '<p class="small"><b>外した人</b>（同じコードでは戻れません）</p><ul class="tm-mlist">' + TM.banned.map(function (x) { return '<li>' + esc(x.name) + ' <button type="button" class="btn sub sm" data-tm="unban" data-id="' + esc(x.uid) + '">再参加を許可</button></li>'; }).join('') + '</ul>' : '');
  }
  // v0.26.17：招待はカードを2つ（顧問・マネージャー）。いちばん大きいのは「コードをコピー」。コードそのもの・制限・作り直しは折りたたむ
  function codesHtml() {
    if (!TM.codes) return '<p class="small muted">開くと読み込みます…</p>';
    var c = TM.codes, card = function (role, title, who) {
      var x = c[role], h = '<div class="tm-inv" data-inv="' + role + '"><div class="tm-inv-h"><b>' + title + '</b><span class="tm-chip' + (x && (x.exp || x.max || x.approve) ? ' on' : ' warn') + '">' + esc(x ? limitChip(x) : 'コードなし') + '</span></div>';
      h += '<p class="small">' + who + '</p>';
      if (role === 'manager') h += '<p class="small tm-mexp">この招待で入ったマネージャーは <b>' + esc(jDate(x && x.mexp || LaneTeam.schoolYearEnd())) + 'まで</b> 使えます。</p>';
      if (x) {
        var msg = 'LANE NOTE のチーム「' + (TEAM ? TEAM.name : '') + '」の' + roleLabel(role) + '用の参加コードです。記録のページ → 「👥 チーム」→「参加コードで入る」に貼ってください。\n' + x.code;
        h += '<button type="button" class="btn tm-big" data-tm="copy" data-code="' + esc(x.code) + '">📋 コードをコピー</button>' +
          '<div class="tm-share"><a class="btn sub sm" target="_blank" rel="noopener" href="https://line.me/R/share?text=' + encodeURIComponent(msg) + '">LINEで送る</a><a class="btn sub sm" href="mailto:?subject=' + encodeURIComponent('LANE NOTE チームの参加コード') + '&body=' + encodeURIComponent(msg) + '">メールで送る</a></div>' +
          '<p class="small muted">入ってほしい人に<b>1人ずつ</b>送ってください（グループには貼らないでください）。</p>' +
          '<details class="tm-raw"><summary class="small">コードを表示</summary><code>' + esc(x.code) + '</code></details>';
      }
      h += '<details class="tm-adv"><summary class="small"><b>⚙ 詳しい設定</b>（コードの期限・人数・承認・作り直す）</summary>' +
        (x ? '<p class="small">今のコード：' + codeLimits(x) + '</p>' : '') +
        '<p class="small">新しく作るコードに付ける制限（どれかを付けるのがおすすめ）</p>' +
        '<label class="tm-f">コードを使える最後の日 <input type="date" data-copt="exp" data-role="' + role + '"></label>' +
        '<label class="tm-f">使える人数 <span><input type="number" min="1" max="100" inputmode="numeric" data-copt="max" data-role="' + role + '"> 人まで</span></label>' +
        '<label class="tm-f tm-chk"><input type="checkbox" data-copt="approve" data-role="' + role + '"' + (role === 'coach' ? ' checked' : '') + '> 入る前に、わたしの承認を必要にする</label>' +
        (role === 'manager' ? '<label class="tm-f">入ったマネージャーが使える最後の日 <input type="date" id="rbTeamMexp" value="' + esc(isoDay(x && x.mexp || LaneTeam.schoolYearEnd())) + '"></label>' : '') +
        '<button type="button" class="btn sm tm-danger" data-tm="regen" data-role="' + role + '">🔄 コードを作り直す</button><p class="small muted">作り直すと、今のコードは使えなくなります（もう入った人はそのまま）。</p></details>';
      return h + '</div>';
    };
    return '<div class="tm-invs">' + card('coach', '🧑‍🏫 顧問を招待', 'すべての機能と、メンバーの管理ができます。') + card('manager', '📋 マネージャーを招待', '記録・大会の入力だけできます。期限が来ると自動で使えなくなります。') + '</div>';
  }
  function limitChip(x) {
    var a = [];
    if (x.exp) a.push(x.exp < Date.now() ? '期限切れ' : (new Date(x.exp).getMonth() + 1) + '/' + new Date(x.exp).getDate() + 'まで');
    if (x.max) a.push(x.used >= x.max ? '使い切り' : x.max + '人まで（あと' + Math.max(0, x.max - (x.used || 0)) + '人）');
    if (x.approve) a.push('承認制');
    return a.length ? a.join('・') : '制限なし';
  }
  function codeLimits(x) {
    var a = [];
    if (x.exp) a.push((x.exp < Date.now() ? '⚠ 期限切れ（' : 'コードの期限：') + jDate(x.exp) + (x.exp < Date.now() ? '）' : 'まで'));
    if (x.max) a.push('使える人数：' + x.used + '／' + x.max + '人' + (x.used >= x.max ? '（使い切り）' : ''));
    if (x.approve) a.push('入る前に顧問の承認が必要');
    return a.length ? '🔒 ' + a.map(esc).join('・') : '⚠ 制限なし（コードを知っている人はだれでも入れます）';
  }
  /* v0.26.9 安全：「見える人とリンク」。チームのメンバーと、自分が作った共有リンク・やり取りのうち今使えるものを一覧にして、その場で止められる */
  async function safeLoad(sc) {
    var F = FB.F, out = { members: null, shares: [], talks: [] }, now = Date.now();
    if (sc.team) out.members = await LT(sc).members(sc.team.id);
    var s = await F.getDocs(F.collection(FB.fs, 'users', sc.uid, 'shareIndex')); check(sc);
    s.forEach(function (d) { var v = d.data() || {}, e = v.expiresAt && v.expiresAt.toMillis ? v.expiresAt.toMillis() : 0; if (e > now && !v.stopped) out.shares.push({ id: d.id, label: String(v.label || '共有リンク'), exp: e }); });
    try { out.talks = (await tkApi(sc).index()).filter(function (x) { return x.active && !x.closed && x.exp > now; }); } catch (e) { if (isAbort(e)) throw e; }
    check(sc); return out;
  }
  function safeHtml() {
    var d = SAFE.data; if (!d) return '<p class="small muted">開くと読み込みます…</p>';
    var h = '';
    if (d.members) h += '<p class="small"><b>👥 チーム「' + esc(TEAM ? TEAM.name : '') + '」の記録を見られる人</b>（' + d.members.filter(function (m) { return m.role !== 'pending'; }).length + '人）</p><ul class="tm-mlist">' + d.members.map(function (m) { return '<li>' + esc(m.name) + ' ' + esc(roleLabel(m.role)) + (m.role === 'manager' ? '（' + jDate(m.expiresAt) + 'まで）' : '') + (m.role === 'pending' ? '（まだ見られません）' : '') + '</li>'; }).join('') + '</ul>' + (TEAM && TEAM.role === 'coach' ? '<p class="small muted">外すときは「👥 メンバー」の「外す」から。</p>' : '');
    else h += '<p class="small"><b>👤 記録は自分だけ</b>が見られます（チームで共有していません）。</p>';
    h += '<p class="small"><b>🔗 今使える共有リンク</b>（リンクを知っている人が見られます）</p>' + (d.shares.length ? '<ul class="tm-mlist">' + d.shares.map(function (x) { return '<li>' + esc(x.label) + ' <span class="small muted">' + jDate(x.exp) + 'まで</span> <button type="button" class="btn sub sm tm-x" data-safe="share" data-id="' + esc(x.id) + '">止める</button></li>'; }).join('') + '</ul>' : '<p class="small muted">ありません。</p>');
    h += '<p class="small"><b>💬 使っているやり取り</b>（選手がリンクで読み書きできます）</p>' + (d.talks.length ? '<ul class="tm-mlist">' + d.talks.map(function (x) { return '<li>' + esc(x.name || '選手') + ' <span class="small muted">' + jDate(x.exp) + 'まで</span> <button type="button" class="btn sub sm tm-x" data-safe="talk" data-id="' + esc(x.id) + '">止める</button></li>'; }).join('') + '</ul>' : '<p class="small muted">ありません。</p>');
    return h;
  }
  /* v0.26.9 機能の一時停止（config/flags）。読めないときは「使える」とみなす（止めるのはルールが本体） */
  async function loadFlags() {
    if (!CLOUD_READY) return FLAGS;
    try { var F = (await loadFirebase()).F, d = await F.getDoc(F.doc(FB.fs, 'config', 'flags')); if (d.exists()) { var v = d.data() || {}; ['talk', 'relay', 'counter', 'share'].forEach(function (k) { FLAGS[k] = v[k] !== false; }); FLAGS.note = String(v.note || '').slice(0, 200); } } catch (e) { }
    applyFlags(); return FLAGS;
  }
  function applyFlags() {
    var off = function (what) { return '⏸ いまは管理者が「' + what + '」を一時停止しています' + (FLAGS.note ? '（' + FLAGS.note + '）' : '') + '。記録はそのまま見られます。'; };
    if (window.LaneUrl && LaneUrl.setPaused) LaneUrl.setPaused(FLAGS.relay ? '' : off('URLから読み込む'));
    var tb = $('rbTalkBox'); if (tb) { var n = tb.querySelector('.flag-off'); if (!FLAGS.talk) { if (!n) { n = document.createElement('p'); n.className = 'tm-warn flag-off'; tb.insertBefore(n, tb.firstChild); } n.textContent = off('選手とのやり取り'); } else if (n) n.remove(); }
    if (!FLAGS.counter) { var uc = $('useCount'); if (uc) uc.hidden = true; }
  }
  async function checkAdmin(sc) {
    ADMIN = false; if (!sc.uid) return;
    try { var d = await FB.F.getDoc(FB.F.doc(FB.fs, 'admins', sc.uid)); check(sc); ADMIN = d.exists(); } catch (e) { if (isAbort(e)) throw e; }
  }
  function adminHtml() {
    var row = function (k, label) { return '<label class="adm-row"><input type="checkbox" data-flag="' + k + '"' + (FLAGS[k] ? ' checked' : '') + '> ' + label + '</label>'; };
    return '<details class="adm"><summary><b>🛑 機能の一時停止</b>（管理者だけに見えます）</summary><p class="small">チェックを外して保存すると、その機能を全員について止めます。記録は止めずに見られます。何かあったときの非常停止に使ってください。</p>' +
      row('talk', '💬 選手とのやり取り（選手の読み書き・新しい会話）') + row('relay', '🔗 URLから読み込む') + row('counter', '🔢 利用カウンター') + row('share', '📤 短いリンクの新規作成') +
      '<label class="small">お知らせ（任意・200文字まで） <input type="text" data-flag="note" maxlength="200" value="' + esc(FLAGS.note || '') + '" size="30"></label> <button type="button" class="btn" data-safe="flags">保存する</button></details>';
  }
  function histHtml() {
    if (!TM.hist) return '<p class="small muted">開くと読み込みます…</p>';
    if (!TM.hist.length) return '<p class="small muted">まだありません。</p>';
    return '<ul class="tm-hlist">' + TM.hist.map(function (h, i) {
      var r = h.after && !h.after._del ? h.after : h.before;
      var mm = (TM.members || []).filter(function (m) { return m.uid === h.uid; })[0], who = mm ? mm.name + '（' + roleLabel(mm.role) + '）' : h.name + '（今はメンバーではない人）';
      return '<li><span class="tm-ht">' + esc(jDateTime(h.at)) + '</span> <b>' + esc(who) + '</b> が <b>' + esc(ACTS[h.act] || h.act) + '</b>：' + esc(recLabel(r)) + (h.act === 'edit' && h.before ? '<br><span class="small muted">前：' + esc(recLabel(h.before)) + '</span>' : '') +
        ' <button type="button" class="btn sub sm" data-tm="revert" data-i="' + i + '">この変更を取り消す</button></li>';
    }).join('') + '</ul>';
  }
  async function tmLoad(what, sc) {
    var api = LT(sc), t = sc.team.id, tm = TM, v, v2 = null;   // 読み終わってから、同じ人・同じチーム・同じ世代かを確かめて入れる（C403）
    if (what === 'members') { v = await api.members(t); if (sc.team.role === 'coach') v2 = await api.banned(t); }
    if (what === 'codes') v = await api.codes(t);
    if (what === 'hist') { v = await api.history(t, 50); if (!tm.members) v2 = await api.members(t); }
    check(sc); if (tm !== TM) return;
    TM[what] = v; if (what === 'members') TM.banned = v2; if (what === 'hist' && v2) TM.members = v2;
  }
  if ($('rbTeam')) {
    $('rbTeam').addEventListener('toggle', async function (e) {
      var d = e.target; if (!d.matches || !d.matches('details[data-tmd]') || !TEAM) return;
      var sc = scope(), todo = [];
      // 開いている欄をまとめて覚える（読み込みのあと描き直しても、開いたまま）
      $('rbTeam').querySelectorAll('details[data-tmd]').forEach(function (x) { var k = x.getAttribute('data-tmd'), was = !!TM.open[k]; TM.open[k] = x.open; if (x.open && (!was || !TM[k])) todo.push(k); });   // 開くたびに読み直す
      if (!todo.length) return;
      try { for (var i = 0; i < todo.length; i++) await tmLoad(todo[i], sc); renderTeam(); } catch (x) { if (isAbort(x)) return; status('rbTeamStatus', '✖ 読めませんでした：' + esc(x.message), 'ng'); }
    }, true);
    $('rbTeam').addEventListener('change', function (e) { if (e.target.id === 'rbTeamSel') switchTeam(e.target.value); });
    // v0.26.9 見える人とリンク・機能の一時停止
    $('rbTeam').addEventListener('toggle', async function (e) {
      var d = e.target; if (!d.matches || !d.matches('details[data-safe-d]')) return;
      SAFE.open = d.open; if (!d.open || !USER) return;
      var sc = scope(), s0 = SAFE;
      try { var v = await safeLoad(sc); if (s0 !== SAFE) return; SAFE.data = v; var bx = $('rbSafe'); if (bx) bx.innerHTML = safeHtml(); } catch (x) { if (isAbort(x)) return; status('rbTeamStatus', '✖ 読めませんでした：' + esc(x.message), 'ng'); }
    }, true);
    $('rbTeam').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-safe]'); if (!b || !USER) return;
      var a = b.getAttribute('data-safe'), id = b.getAttribute('data-id'), sc = scope(), F = FB.F;
      b.disabled = true;
      try {
        if (a === 'share') {
          if (!confirm('この共有リンクを止めます。止めると、リンクを知っている人も見られなくなります（元に戻せません）。')) return;
          var bt = F.writeBatch(FB.fs); bt.delete(F.doc(FB.fs, 'shares', id)); bt.set(F.doc(FB.fs, 'users', sc.uid, 'shareIndex', id), { stopped: true }, { merge: true }); await bt.commit(); check(sc);
          SAFE.data.shares = SAFE.data.shares.filter(function (x) { return x.id !== id; }); status('rbTeamStatus', '✔ 共有リンクを止めました。', 'ok');
        }
        if (a === 'talk') {
          if (!confirm('このやり取りを止めます（選手は読み書きできなくなります。あとで「選手とのやり取り」から再開できます）。')) return;
          await tkApi(sc).setActive(id, false); SAFE.data.talks = SAFE.data.talks.filter(function (x) { return x.id !== id; }); status('rbTeamStatus', '✔ やり取りを止めました。', 'ok');
        }
        if (a === 'flags') {
          if (!ADMIN) return;
          var v = { at: F.serverTimestamp(), by: sc.uid };
          ['talk', 'relay', 'counter', 'share'].forEach(function (k) { var c = document.querySelector('[data-flag="' + k + '"]'); v[k] = !!(c && c.checked); });
          var nt = document.querySelector('[data-flag="note"]'); if (nt && nt.value.trim()) v.note = nt.value.trim().slice(0, 200);
          var offs = ['talk', 'relay', 'counter', 'share'].filter(function (k) { return !v[k]; });
          if (!confirm(offs.length ? '全員について、' + offs.length + 'つの機能を止めます。よろしいですか？' : 'すべての機能を使える状態に戻します。')) return;
          await F.setDoc(F.doc(FB.fs, 'config', 'flags'), v); check(sc);
          ['talk', 'relay', 'counter', 'share'].forEach(function (k) { FLAGS[k] = v[k]; }); FLAGS.note = v.note || ''; applyFlags(); renderTeam(); status('rbTeamStatus', '✔ 保存しました。', 'ok'); return;
        }
        var bx = $('rbSafe'); if (bx) bx.innerHTML = safeHtml();
      } catch (x) { if (isAbort(x)) return; status('rbTeamStatus', '✖ できませんでした：' + esc(x.code === 'permission-denied' ? '権限がありません' : x.message), 'ng'); }
      finally { b.disabled = false; }
    });
    $('rbTeam').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-tm]'); if (!b || !USER || TM.busy) return;
      var a = b.getAttribute('data-tm'), sc = scope(), id = b.getAttribute('data-id'), msg = '', tm0 = TM;
      if (a === 'copy') { try { await navigator.clipboard.writeText(b.getAttribute('data-code')); status('rbTeamStatus', '✔ コピーしました。入ってほしい人にだけ渡してください。', 'ok'); } catch (x) { status('rbTeamStatus', 'コピーできませんでした。コードを長押しして選んでください。', 'ng'); } return; }
      tm0.busy = true; b.disabled = true;
      try {
        if (a === 'create') {
          var nm = ($('rbTeamName').value || '').trim(); if (!nm) throw new Error('チーム名を入れてください');
          if (!confirm('「' + nm + '」を作ります。あなたが顧問（持ち主）になります。')) return;
          var t = await LTu(sc.uid, sc.epoch).createTeam(nm); TM.busy = false; await switchTeam(t); status('rbTeamStatus', '✔ チームを作りました。「🔑 招待する」を開くと、ほかの顧問・マネージャーに送るコードがあります。', 'ok'); return;
        }
        if (a === 'join') {
          var r = await LTu(sc.uid, sc.epoch).join($('rbTeamCode').value); TM.busy = false; await switchTeam(r.team); status('rbTeamStatus', '✔ 「' + esc(r.name) + '」に ' + roleLabel(r.role) + ' として入りました。', 'ok'); return;
        }
        if (a === 'forget') { var sid = ''; try { sid = localStorage.getItem(teamKey(sc.uid)) || ''; } catch (x) { } if (sid) await LTu(sc.uid, sc.epoch).forget(sid); TM.busy = false; await switchTeam(''); return; }
        if (a === 'recheck') { TM.busy = false; await switchTeam(TEAM_WAIT); return; }
        if (!sc.team) return;
        var api = LT(sc), T = sc.team.id;
        if (a === 'approve') { var pm = (TM.members || []).filter(function (m) { return m.uid === id; })[0]; if (!pm) return; if (!confirm(pm.name + ' を ' + roleLabel(pm.want) + ' として承認します。承認すると、すぐにチームの記録が見られるようになります。')) return; await api.approve(T, id, pm); await tmLoad('members', sc); msg = '✔ 承認しました。'; }
        if (a === 'reject') { if (!confirm('この人の参加を断ります。')) return; await api.reject(T, id); await tmLoad('members', sc); msg = '✔ 断りました。'; }
        if (a === 'confirm') { await api.confirm(T, [id]); msg = '✔ 確認済みにしました。'; await reload(sc); }
        if (a === 'confirmAll') { var ids = pendingList().map(function (r) { return r.id; }); if (!confirm('未確認の記録 ' + ids.length + '件を、すべて確認済みにします。内容は見ましたか？')) return; await api.confirm(T, ids); msg = '✔ ' + ids.length + '件を確認済みにしました。'; await reload(sc); }
        if (a === 'regen') { var role = b.getAttribute('data-role'), me = role === 'manager' ? dayMs(($('rbTeamMexp') || {}).value) || LaneTeam.schoolYearEnd() : null; if (me && me < Date.now()) throw new Error('期限は今日より後の日にしてください');
          var co = function (k) { return document.querySelector('[data-copt="' + k + '"][data-role="' + role + '"]'); }, copt = { exp: co('exp') && co('exp').value ? dayMs(co('exp').value) : null, max: co('max') && +co('max').value || null, approve: !!(co('approve') && co('approve').checked) };
          if (copt.exp && copt.exp < Date.now()) throw new Error('コードの期限は今日より後の日にしてください');
          if (!confirm('今の' + roleLabel(role) + '用コードを使えなくして、新しいコードを作ります。')) return; await api.regen(T, role, me, copt); await tmLoad('codes', sc); msg = '✔ 新しいコードを作りました。古いコードはもう使えません。'; }
        if (a === 'unban') { if (!confirm('この人がもう一度参加コードで入れるようにします（入るには新しいコードが必要です）。')) return; await api.unban(T, id); await tmLoad('members', sc); msg = '✔ 再参加を許可しました。'; }
        if (a === 'quarDel') { var qi = QUAR.map(function (r) { return r._doc; }).filter(Boolean); if (!confirm('形が正しくない記録 ' + qi.length + '件に削除の印を付けます（元の内容は変更履歴に残りますが、形が正しくないため、そのままでは戻せません）。')) return; var qr = await api.repair(T, sc.team.role, qi); msg = qr.written === qi.length ? '✔ 削除の印を付けました（' + qr.written + '件）。' : '⚠ ' + qr.written + '/' + qi.length + '件だけ削除の印を付けました。'; await reload(sc); }
        if (a === 'saveRole') { var rs = document.querySelector('[data-tmrole="' + id + '"]').value, ex = document.querySelector('[data-tmexp="' + id + '"]'), ms = rs === 'manager' ? (ex ? dayMs(ex.value) : 0) || LaneTeam.schoolYearEnd() : null; await api.setRole(T, id, rs, ms); await tmLoad('members', sc); msg = '✔ 変更しました。'; }
        if (a === 'remove') { var who = (TM.members || []).filter(function (m) { return m.uid === id; })[0]; if (!confirm((who ? who.name : 'この人') + ' をチームから外します。外した人は、すぐにチームの記録を見られなくなります。\n同じコードで戻れないよう、その役割の参加コードも作り直します。')) return; await api.remove(T, id); await tmLoad('members', sc); TM.codes = null; msg = '✔ 外しました。参加コードも作り直しました。もう一度入れるときは、下の「外した人」で「再参加を許可」を押してから、新しいコードを渡してください。'; }
        if (a === 'transfer') { var to = ($('rbTeamTo') || {}).value; if (!to) throw new Error('渡す相手の顧問を選んでください'); if (!confirm('このチームの持ち主を渡します。渡したあとは、相手が持ち主になります（あなたは顧問のまま）。')) return; await api.transfer(T, to); TM.busy = false; await switchTeam(T); status('rbTeamStatus', '✔ 持ち主を渡しました。', 'ok'); return; }
        if (a === 'leave') { if (!confirm('このチームから抜けます。抜けると、チームの記録は見られなくなります（自分だけの記録はそのまま）。')) return; await api.leave(T); TM.busy = false; await switchTeam(''); status('rbTeamStatus', '✔ チームから抜けました。', 'ok'); return; }
        if (a === 'revert') { var h = TM.hist[+b.getAttribute('data-i')]; if (!h || !confirm('この変更を取り消して、その前の状態に戻します（戻したことも履歴に残ります）。')) return; var rv = await api.revert(T, sc.team.role, h); await tmLoad('hist', sc); msg = rv && rv.written === 1 && !rv.skipped ? '✔ 取り消しました。' : '⚠ 取り消せませんでした（戻す記録が見つかりません）。'; await reload(sc); }   // v0.26.3（R262-01）：本当に1件書けたときだけ成功と表示
        if (a === 'migrate') {
          var snap = await serverDocs(colFor(sc.uid)); check(sc); var mine = []; snap.forEach(function (d) { mine.push(d.data()); });
          if (!mine.length) throw new Error('自分だけの記録はありません');
          if (!confirm('自分だけに保存してある記録 ' + mine.length + '件を、チーム「' + TEAM.name + '」にコピーします。同じ記録は重ねません。自分だけの記録は消えません。' + (sc.team.role === 'manager' ? '\nコピーした記録は「未確認」になります。' : ''))) return;
          var res = await putMany(mine, sc, 'migrate'); msg = '✔ ' + res.added + '件をコピーしました' + (res.dup ? '（' + res.dup + '件は同じ記録があるので重ねませんでした）' : '') + '。'; await reload(sc);
        }
        check(sc); renderTeam(); if (msg) status('rbTeamStatus', msg, 'ok');
      } catch (x) { if (isAbort(x)) return; renderTeam(); status('rbTeamStatus', '✖ できませんでした：' + esc(x.code === 'permission-denied' ? 'この操作の権限がありません（役割・期限を確かめてください）' : x.message), 'ng'); }
      finally { tm0.busy = false; b.disabled = false; }
    });
  }
  /* ---------- v0.14（監査F02）：ログインしていないときにこの端末へ保存した記録は、ログインしても自動では移さない。
     件数と移し先を見せて、「移す（端末からは消す）」「移さずに端末に残す」「端末から消す」を選んでもらう ---------- */
  var GUEST_N = 0, GUEST_SKIP = {};
  async function checkGuest(sc) {
    check(sc); GUEST_N = 0;
    if (sc.uid && !sc.team && !GUEST_SKIP[sc.uid]) { var l = []; try { l = await lgetAll(LOCAL_DB, sc); } catch (e) { if (isAbort(e)) throw e; } check(sc); GUEST_N = l.length; }
    renderGuest();
  }
  function renderGuest() {
    var box = $('rbGuest'); if (!box) return;
    if (!USER || !GUEST_N) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<b>📦 この端末に、ログインしていないときに保存した記録が ' + GUEST_N + '件あります。</b>' +
      '<p class="small">いまログインしている <b>' + esc(USER.email || USER.displayName || 'このアカウント') + '</b> へ移しますか？<br>共用のパソコンでは、ほかの先生がログインせずに入れた記録かもしれません。<b>自分の記録のときだけ</b>移してください（自動では移しません）。</p>' +
      '<div class="rb-row"><button class="btn" type="button" data-guest="move">このアカウントへ移す（' + GUEST_N + '件・端末からは消す）</button><button class="btn sub" type="button" data-guest="keep">移さない（端末に残す）</button><button class="btn sub danger-t" type="button" data-guest="discard">移さずに端末から消す</button></div>';
  }
  async function migrateGuest(mode, sc) {
    need(sc);
    if (!sc.uid) throw new Error('ログインが必要です');
    var local = await lgetAll(LOCAL_DB, sc);
    if (mode === 'discard') {
      await ltx('readwrite', function (s) { s.clear(); }, LOCAL_DB, sc);
      try { localStorage.removeItem(metsKey(null)); localStorage.removeItem(ovKey(null)); } catch (e) { }
      return { discarded: local.length };
    }
    var have = {}; (await getAll(sc)).forEach(function (r) { have[r.id] = 1; });
    var add = local.filter(function (r) { return r && r.id && !have[r.id]; });
    if (add.length) { await cloudPut(add, sc); if (!noCache(sc)) await ltx('readwrite', function (s) { add.forEach(function (r) { s.put(r); }); }, sc.dbName, sc); }
    // 天気・中学/高校の選択も、このアカウントに無いものだけ移す
    var gm = lsGet(metsKey(null), {}), go = lsGet(ovKey(null), {}), side = await loadSide(sc);
    METS = side.mets; DIV_OV = side.ov;
    var mk = Object.keys(gm).filter(function (k) { return !METS[k]; });
    for (var i = 0; i < mk.length; i++) await saveMeet(mk[i], gm[mk[i]], sc);
    var ok = Object.keys(go).filter(function (k) { return !(k in DIV_OV); });
    if (ok.length) { ok.forEach(function (k) { DIV_OV[k] = go[k]; }); await saveOverrides(sc); }
    check(sc);
    await ltx('readwrite', function (s) { s.clear(); }, LOCAL_DB, sc);   // 移し終えたら、端末の「ログインしていないとき」の分は消す（次の人に移らないように）
    try { localStorage.removeItem(metsKey(null)); localStorage.removeItem(ovKey(null)); } catch (e) { }
    return { moved: add.length, dup: local.length - add.length };
  }
  $('rbGuest').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-guest]'); if (!b || !USER) return;
    var mode = b.getAttribute('data-guest'), sc = scope(), n = GUEST_N;
    if (mode === 'keep') { GUEST_SKIP[sc.uid] = 1; GUEST_N = 0; renderGuest(); status('rbAuthStatus', 'この端末の記録（' + n + '件）は移さずに残しました。ログアウトすると、また「この端末だけ」の記録として見られます。', ''); return; }
    if (mode === 'discard' && !confirm('この端末に保存されている（ログインしていないときの）記録 ' + n + '件を消します。元に戻せません。よろしいですか？')) return;
    if (mode === 'move' && !confirm(n + '件を ' + (USER.email || 'このアカウント') + ' のクラウドへ移し、この端末からは消します。よろしいですか？')) return;
    b.disabled = true;
    try {
      var r = await migrateGuest(mode, sc); GUEST_N = 0; renderGuest();
      status('rbAuthStatus', mode === 'discard' ? '✔ この端末の記録 ' + r.discarded + '件を消しました。' : '✔ ' + r.moved + '件をこのアカウントへ移し、この端末からは消しました' + (r.dup ? '（' + r.dup + '件はすでにあったので重ねませんでした）' : '') + '。', 'ok');
      await reload(sc);
    } catch (x) { if (isAbort(x)) return; b.disabled = false; status('rbAuthStatus', '✖ できませんでした：' + esc(x.message), 'ng'); }
  });

  function renderAuth() {
    var info = $('rbAuthInfo'), inB = $('rbSignIn'), outB = $('rbSignOut');
    if (!CLOUD_READY) { info.innerHTML = '💻 <b>この端末だけに保存中</b>（クラウド保存はまだ準備中です）'; inB.hidden = true; outB.hidden = true; return; }
    $('rbClearCloud').hidden = !USER;
    if (USER) { info.innerHTML = '☁ <b>' + esc(USER.email || USER.displayName || 'ログイン中') + '</b> でログイン中：記録はクラウドに保存し、どの端末からでも見られます' + (OFFLINE ? '<br><span class="ng">⚠ いまクラウドにつながらないので、' + (noCache(scope()) ? '記録を表示できません（この端末には控えを置かない設定です）' : 'この端末の控えを表示しています') + '</span>' : '') + (noCache(scope()) ? '<br><span class="small">🧹 この端末には控えを置いていません（「端末のデータを消す」のあと）。 <button class="btn sub" type="button" id="rbCacheOn">この端末に控えを置く</button></span>' : ''); inB.hidden = true; outB.hidden = false; }
    else { info.innerHTML = '💻 <b>ログインしていません</b>：記録はこの端末だけに保存されます。Googleでログインすると、どの端末からでも同じ記録が見られます。'; inB.hidden = false; outB.hidden = true; }
  }
  // アカウントが変わったら、前の人の画面の中身（記録・読み込み途中の資料・入力欄）をすべて消す
  function resetView() {
    ALL = []; batches = []; DONE = []; METS = {}; DIV_OV = {}; REVIEW = []; OFFLINE = false; MODE = { personal: false, name: '', team: '' }; PPL.links = {}; PPL.gen++; MSH = { key: '', url: '', name: '', busy: false, gen: MSH.gen + 1 }; if (TK) { TK = { on: false, idx: [], cur: '', gen: TK.gen + 1 }; } try { $('rbTalkScreen').hidden = true; $('rbTalkThread').hidden = true; $('rbTalkThread').innerHTML = ''; $('rbTalkList').innerHTML = ''; status('rbTalkMsg', '', ''); } catch (e) { }   /* R255：前のアカウントの会話・招待URLを DOM に残さない */ try { applyModeUi(); $('rbPPList').innerHTML = ''; $('rbPPNames').innerHTML = ''; $('rbPPScreen').hidden = true; document.body.classList.remove('pps-open'); status('rbPPMsg', '', ''); } catch (e) { }
    try { $('rbPaste').value = ''; $('rbFile').value = ''; status('rbStatus', '', ''); var d = $('rbDone'); d.innerHTML = ''; d.className = 'status'; status('rbDataStatus', '', ''); } catch (e) { }
    if (typeof manualReset === 'function') manualReset();
    renderBatches(); applyInference(); render();
  }
  function resetTeamState() {   // v0.26.1（C403）：前の人のチームの中身（コード・メンバー・履歴）をメモリと画面から消す
    TEAM = null; TEAMS = []; TEAM_LOST = ''; TEAM_WAIT = ''; SAFE = { open: false, data: null }; ADMIN = false; QUAR = []; TM = { members: null, codes: null, hist: null, banned: null, busy: false, open: {} };
    var bx = $('rbTeam'); if (bx) { bx.innerHTML = ''; bx.hidden = true; }
  }
  async function onAuth(u) {
    resetTeamState();
    var prev = USER ? USER.uid : null;
    authEpoch++; USER = u || null;
    if (prev !== (USER ? USER.uid : null)) resetView();
    var sc0e = authEpoch;
    GUEST_N = 0; renderAuth(); renderGuest();
    if (USER) { try { await checkAdmin(scope()); } catch (e) { if (isAbort(e)) return; } }
    if (USER && typeof LaneTeam !== 'undefined' && $('rbTeam')) { try { await pickTeam(USER.uid); } catch (e) { if (isAbort(e)) return; TEAM = null; renderTeam(); status('rbTeamStatus', '✖ チームを読めませんでした（自分だけの記録を出します）：' + esc(e.message), 'ng'); } if (sc0e !== authEpoch) return; }
    renderTeam();
    var sc = scope();
    try { if (sc.uid) await checkGuest(sc); await reload(sc); }
    catch (e) { if (!isAbort(e)) status('rbAuthStatus', '✖ ' + esc(e.message), 'ng'); }
    if (sc.epoch === authEpoch) renderAuth();
  }
  async function initCloud() {
    renderAuth();
    if (!CLOUD_READY) return;
    try { await loadFirebase(); } catch (e) { status('rbAuthStatus', '✖ ログインの部品を読み込めませんでした（' + esc(e.message) + '）。この端末だけに保存します。', 'ng'); reload(); return; }
    loadFlags();
    FB.A.onAuthStateChanged(FB.auth, onAuth);
  }
  // v0.7（再監査A06）：ログインは popup だけ。ブロック・キャンセルでも画面は移動しないので、入力や読み込み途中の資料はそのまま残る
  $('rbSignIn').addEventListener('click', async function () {
    try { await loadFirebase(); var r = await LaneAuth.signIn(FB); if (r === 'cancelled') status('rbAuthStatus', 'ⓘ ログインを取り消しました。入力した内容はそのまま残っています。', ''); }
    catch (e) { status('rbAuthStatus', '✖ ログインできませんでした：' + esc(LaneAuth.errorText(e)) + '<br><small>入力した内容・読み込んだ資料はそのまま残っています。設定を直したら、もう一度「Googleでログイン」を押してください。</small>', 'ng'); }
  });
  var WIPE_UID = null;
  async function doSignOut() {
    var uid = USER && USER.uid;
    authEpoch++;   // 進行中の読み書きを止める（このあと前の人のDB・クラウドには書かない）
    var r = await LaneAuth.signOutAndWipe(FB, uid, closeDb);
    if (r.signedOut && uid) setNoCache(uid, false);
    if (!r.signedOut) { status('rbAuthStatus', '✖ ログアウトできませんでした：' + esc(LaneAuth.errorText(r.error)) + '（もう一度押してください）', 'ng'); return r; }
    resetView();
    if (r.wiped) { WIPE_UID = null; status('rbAuthStatus', '✔ ログアウトし、この端末に残っていた控え（記録・天気・中学/高校の選択）も消しました。', 'ok'); }
    else { WIPE_UID = uid; status('rbAuthStatus', '⚠ ログアウトはしましたが、<b>この端末の控えはまだ消えていません</b>：' + esc(r.error && r.error.message) + ' <button class="btn sub" type="button" id="rbWipeRetry">端末の控えを消す</button>', 'ng'); }
    return r;
  }
  $('rbSignOut').addEventListener('click', async function () {
    if (!confirm('ログアウトして、この端末に残っているあなたの記録の控えを消します。クラウドの記録は消えません（もう一度ログインすれば見られます）。')) return;
    await doSignOut();
  });
  $('rbAuthStatus').addEventListener('click', async function (e) {
    if (!e.target.closest('#rbWipeRetry') || !WIPE_UID) return;
    try { await LaneAuth.wipeUser(WIPE_UID, closeDb); WIPE_UID = null; status('rbAuthStatus', '✔ この端末の控えを消しました。', 'ok'); }
    catch (x) { status('rbAuthStatus', '⚠ まだ消せません：' + esc(x.message) + ' <button class="btn sub" type="button" id="rbWipeRetry">端末の控えを消す</button>', 'ng'); }
  });

  /* ---------- 読み込み ---------- */
  var batches = [], seq = 0, ALL = [], DONE = [];
  var schoolKey = 'lanenote-rec-school';
  try { $('rbSchool').value = localStorage.getItem(schoolKey) || ''; } catch (e) { }
  $('rbSchool').addEventListener('input', function () { try { localStorage.setItem(schoolKey, this.value.trim()); } catch (e) { } renderBatches(); render(); });
  function school() { return MODE.personal ? '' : $('rbSchool').value.trim(); }
  /* ---------- v0.8：個人で使う（選手本人・保護者・クラブ）。学校名のかわりに自分の名前（と任意で所属）で記録を拾う。
     設定は記録と同じ場所：ログイン中は users/{uid}/settings/mode（本人だけ）、ログインなしはこのブラウザ（localStorage） ---------- */
  var MODE = { personal: false, name: '', team: '' };
  function modeKey(uid) { return uid ? 'lanenote-rec-mode-' + uid : 'lanenote-rec-mode'; }
  function personOn() { return MODE.personal && !!R.nameKey(MODE.name); }
  function isMe(r) { return R.nameKey(r.name || r.kana || '') === R.nameKey(MODE.name) && (!MODE.team || R.matchSchool(r.team, MODE.team)); }
  function wantRec(r) { if (MODE.personal) return personOn() && isMe(r); var q = school(); return !q || R.matchSchool(r.team, q); }
  function applyModeUi() {
    $('rbPersonal').checked = MODE.personal; $('rbPName').value = MODE.name; $('rbPTeam').value = MODE.team;
    $('rbSchoolRow').hidden = MODE.personal; $('rbPersonRow').hidden = !MODE.personal;
    document.body.classList.toggle('personal-on', MODE.personal);
    var ml = $('rbMine').parentNode; if (ml && ml.lastChild) ml.lastChild.textContent = MODE.personal ? ' 自分の記録だけ' : ' 学校・クラブ名の選手だけ';
    if (MODE.personal && (view === 'rank' || view === 'hist')) setTab('home');
  }
  function cleanMode(o) { o = o && typeof o === 'object' ? o : {}; return { personal: !!o.personal, name: String(o.name || '').slice(0, 40), team: String(o.team || '').slice(0, 60) }; }
  async function loadMode(sc) {
    var m = cleanMode(lsGet(modeKey(sc.uid), {}));
    if (sc.uid && !OFFLINE && FB) {
      try { var d = await (FB.F.getDocFromServer || FB.F.getDoc)(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'mode')); check(sc); if (d.exists()) { m = cleanMode(d.data()); if (!noCache(sc)) lsSet(modeKey(sc.uid), m); } }
      catch (e) { if (isAbort(e)) throw e; }
    }
    return m;
  }
  var modeTimer = null;
  async function saveMode(sc) {
    need(sc);
    var m = cleanMode(MODE);
    if (!sc.uid || !noCache(sc)) lsSet(modeKey(sc.uid), m);
    if (sc.uid) { await FB.F.setDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'mode'), { personal: m.personal, name: m.name, team: m.team, updatedAt: new Date().toISOString() }); check(sc); }
  }
  function modeChanged() {
    MODE = cleanMode({ personal: $('rbPersonal').checked, name: $('rbPName').value.trim(), team: $('rbPTeam').value.trim() });
    applyModeUi(); renderBatches(); render();
    var sc = scope(); clearTimeout(modeTimer);
    modeTimer = setTimeout(function () { saveMode(sc).catch(function (e) { if (!isAbort(e)) status('rbDataStatus', '✖ 「個人で使う」の設定を保存できませんでした：' + esc(e.message), 'ng'); }); }, 600);
  }
  [['rbToPersonal', true], ['rbToSchool', false]].forEach(function (a) { $(a[0]).addEventListener('click', function () { $('rbPersonal').checked = a[1]; modeChanged(); }); });
  ['rbPersonal', 'rbPName', 'rbPTeam'].forEach(function (id) { $(id).addEventListener(id === 'rbPersonal' ? 'change' : 'input', modeChanged); });
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
  // v0.7（再監査A01）：ファイルを選んだ時点の scope（uid＋認証の世代）を最後まで持ち回る。途中でアカウントが変わったら、プレビュー・表示を一切戻さない
  async function handleFiles(files, sc0) {
    var sc = sc0 || scope();
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    try { await handleFilesIn(files, sc); }
    catch (e) { if (!isAbort(e)) throw e; }
  }
  async function handleFilesIn(files, sc) {
    var addBatch = function (b) { addBatchIn(b, sc); };
    var html = files.filter(function (f) { return /\.html?$/i.test(f.name) || f.type === 'text/html'; });
    var pdfs = files.filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
    var txts = files.filter(function (f) { return /\.txt$/i.test(f.name); });
    var xls = files.filter(function (f) { return /\.(xlsx|xls|csv)$/i.test(f.name); });
    var other = files.filter(function (f) { return html.indexOf(f) < 0 && pdfs.indexOf(f) < 0 && txts.indexOf(f) < 0 && xls.indexOf(f) < 0; });
    // v0.14（監査F09）：大きすぎるファイルは読まない（端末が固まらないように）
    var big = files.filter(function (f) { return f.size > (pdfs.indexOf(f) >= 0 ? LIMITS.pdf : LIMITS.file); });
    if (big.length) { big.forEach(function (f) { addBatch({ src: f.name, kind: 'ファイル', error: '大きすぎるので読みませんでした（' + Math.round(f.size / 1048576) + 'MB。PDFは' + Math.round(LIMITS.pdf / 1048576) + 'MB、ほかは' + Math.round(LIMITS.file / 1048576) + 'MBまで）' }); }); }
    var keep = function (f) { return big.indexOf(f) < 0; };
    html = html.filter(keep); pdfs = pdfs.filter(keep); txts = txts.filter(keep); xls = xls.filter(keep);
    for (var xi = 0; xi < xls.length; xi++) { try { await readSheet(xls[xi], sc); } catch (e) { if (isAbort(e)) throw e; check(sc); addBatch({ src: xls[xi].name, kind: 'Excel', error: e.message }); } }
    check(sc);
    if (other.length) status('rbStatus', '✖ 読めない種類のファイルです：' + esc(other.map(function (f) { return f.name; }).join('、')), 'ng');
    for (var i = 0; i < pdfs.length; i++) {
      var f = pdfs[i];
      try {
        check(sc); status('rbStatus', '読み取り中…（' + esc(f.name) + '）', 'busy');
        var res0 = await readPdf(f, function (p, n) { check(sc); status('rbStatus', '読み取り中…（' + esc(f.name) + ' ' + p + '/' + n + 'ページ）', 'busy'); });
        check(sc);
        var all = R.parsePdf(res0.pages, {}), meta = applyGuess(guessMetaFromPages(res0.pages), f.name);
        addBatch({ src: f.name, kind: 'PDF', all: all, meta: meta });
      } catch (e) { if (isAbort(e)) throw e; check(sc); addBatch({ src: f.name, kind: 'PDF', error: e.message }); }
    }
    if (html.length || txts.length) {
      var stream = [], names = [];
      for (var j = 0; j < html.length; j++) { try { var hs = await readHtml(html[j]); check(sc); stream = stream.concat(hs); names.push(html[j].name); } catch (e) { if (isAbort(e)) throw e; check(sc); addBatch({ src: html[j].name, kind: 'HTML', error: e.message }); } }
      for (var k = 0; k < txts.length; k++) { var tx = await txts[k].text(); check(sc); stream = stream.concat(R.textToStream(tx)); names.push(txts[k].name); }
      check(sc);
      if (names.length) {
        // 種目ページごとに大会名・日付が書かれているので、まとめて1つの大会として扱う
        var res = R.parseCells(stream, {});
        addBatch({ src: names.length > 3 ? names.slice(0, 3).join('、') + ' ほか' + (names.length - 3) + '件' : names.join('、'), kind: 'HTML', all: res, meta: applyGuess({ name: res.meet.name, date: res.meet.date }, names[0]) });
      }
    }
    check(sc);
    status('rbStatus', '読み取りました。下の内容を確かめて「記録に保存」を押してください。', 'ok');
  }
  var LIMITS = { pdf: 50 * 1048576, file: 20 * 1048576, json: 20 * 1048576, rows: 50000, paste: 2 * 1048576 };
  /* ---------- v0.5：Excel・CSV（今まで先生がまとめてきた記録）を取り込む ---------- */
  async function readSheet(f, sc) {
    need(sc);
    if (!window.XLSX) throw new Error('Excelを読む部品を読み込めませんでした（インターネット接続を確認してください）');
    var wb;
    if (/\.csv$/i.test(f.name)) {
      var buf = new Uint8Array(await f.arrayBuffer()); check(sc); var txt = new TextDecoder('utf-8').decode(buf);
      if ((txt.match(/\ufffd/g) || []).length > 3) txt = new TextDecoder('shift_jis').decode(buf);
      wb = XLSX.read(txt.replace(/^\ufeff/, ''), { type: 'string', raw: true });
    } else { var ab = await f.arrayBuffer(); check(sc); wb = XLSX.read(new Uint8Array(ab), { type: 'array' }); }
    var b = { src: f.name, kind: 'Excel', xl: { wb: wb, sheet: wb.SheetNames[0] }, meta: {} };
    loadXlSheet(b); addBatchIn(b, sc);
  }
  function loadXlSheet(b) {
    var ws = b.xl.wb.Sheets[b.xl.sheet];
    b.xl.aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (b.xl.aoa.length > LIMITS.rows) throw new Error('行が多すぎます（' + LIMITS.rows + '行まで）');
    b.xl.txt = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    b.xl.hr = Math.max(0, R.findHeaderRow(b.xl.txt));
    b.xl.map = R.mapHeaders(b.xl.txt[b.xl.hr] || []);
    xlRun(b);
  }
  function xlRun(b) {
    b.xl.res = R.importRows(b.xl.aoa, b.xl.map, { text: b.xl.txt, headerRow: b.xl.hr, school: school(), def: b.xl.rescue ? b.xl.def : null });
    if (MODE.personal) b.xl.res.recs = b.xl.res.recs.filter(wantRec);
    // v0.26.7 救済：所属の列があるときは、学校・クラブ名の選手だけにする（大会全体の表を貼っても、ほかの学校の記録は入れない）
    else if (b.xl.rescue && b.xl.map.team != null && school()) { b.xl.all = b.xl.res.recs.length; b.xl.res.recs = b.xl.res.recs.filter(wantRec); }
  }
  /* v0.26.7 読み取り失敗の救済：貼り付けた表・CSV の文章を「列を選ぶ」画面（Excel と同じ）で読む */
  function tableBatch(src, text, meta) {
    var aoa = R.splitTable(text); if (!R.isTable(aoa)) return null;
    if (aoa.length > LIMITS.rows) throw new Error('行が多すぎます（' + LIMITS.rows + '行まで）');
    var hr = R.findHeaderRow(aoa);
    var b = { src: src, kind: '表', meta: {}, xl: { wb: { SheetNames: [src] }, sheet: src, aoa: aoa, txt: aoa, hr: hr, map: hr >= 0 ? R.mapHeaders(aoa[hr]) : {}, rescue: true, def: { meet: (meta && meta.name) || '', date: (meta && meta.date) || '', event: '' } } };
    xlRun(b); return b;
  }
  function rescueFrom(b) {
    var nb = tableBatch(b.src + '（列を選んで読み取り）', b.raw, b.meta); if (!nb) return false;
    nb.sc = b.sc; nb.id = ++seq; batches = batches.map(function (x) { return x === b ? nb : x; }); renderBatches(); return true;
  }
  function colName(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  var XL_FIELDS = ['name', 'event', 'mark', 'date', 'meet', 'kana', 'grade', 'team', 'wind', 'rank', 'round', 'sex'], XL_REQ = { name: 1, event: 1, mark: 1, date: 1 };
  function renderXl(b) {
    var x = b.xl, hdr = x.txt[x.hr] || [], n = Math.max(hdr.length, (x.txt[x.hr + 1] || []).length), res = x.res;
    if (x.rescue) n = Math.min(30, x.txt.slice(Math.max(0, x.hr), Math.max(0, x.hr) + 20).reduce(function (m, r) { return Math.max(m, r.length); }, n));
    var opts = function (f) { var cur = x.map[f]; var o = '<option value="">（使わない）</option>'; for (var i = 0; i < n; i++) o += '<option value="' + i + '"' + (cur === i ? ' selected' : '') + '>' + colName(i) + '列：' + esc(String(hdr[i] == null ? '' : hdr[i]).slice(0, 14) || '（見出しなし）') + '</option>'; return o; };
    var meets = {}; res.recs.forEach(function (r) { var k = r.date + '|' + r.meet; meets[k] = (meets[k] || 0) + 1; });
    var miss = XL_FIELDS.filter(function (f) { return XL_REQ[f] && x.map[f] == null && !(x.rescue && (f === 'date' || f === 'event') && x.def[f]); });
    return '<div class="rb-batch xl" data-b="' + b.id + '"><h3>' + (x.rescue ? '🧩 表：' : '📊 Excel：') + esc(b.src) + '</h3>' +
      '<div class="rb-row">' + (x.wb.SheetNames.length > 1 ? '<label>シート <select data-xsheet="1">' + x.wb.SheetNames.map(function (s) { return '<option' + (s === x.sheet ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label>見出しの行 <select data-xhr="1">' + (x.rescue ? '<option value="-1"' + (x.hr < 0 ? ' selected' : '') + '>見出しの行なし（1行目から記録）</option>' : '') + x.txt.slice(0, 15).map(function (r, i) { return '<option value="' + i + '"' + (i === x.hr ? ' selected' : '') + '>' + (i + 1) + '行目：' + esc(r.filter(function (c) { return c !== ''; }).slice(0, 4).join('・').slice(0, 24)) + '</option>'; }).join('') + '</select></label></div>' +
      (x.rescue ? '<p class="rb-rescue small">🧩 <b>列を自分で選んで読み取ります。</b>下の表の見本を見ながら「氏名はこの列」「記録はこの列」のように選んでください。表に大会名・日付・種目の列が無いときは、ここに入れると全部の行に使います。</p>' +
        '<div class="rb-row"><label>大会名 <input type="text" data-xdef="meet" value="' + esc(x.def.meet) + '" size="28"></label><label>日付 <input type="date" data-xdef="date" value="' + esc(x.def.date) + '"></label><label>種目（全部同じとき） <input type="text" data-xdef="event" value="' + esc(x.def.event) + '" size="14" placeholder="例：男子100m"></label></div>' +
        '<div class="tblwrap"><table class="rbt rb-sample"><tr>' + Array.apply(null, Array(n)).map(function (_, i) { return '<th>' + colName(i) + '列</th>'; }).join('') + '</tr>' + x.txt.slice(Math.max(0, x.hr), Math.max(0, x.hr) + 4).map(function (r) { return '<tr>' + Array.apply(null, Array(n)).map(function (_, i) { return '<td>' + esc(String(r[i] == null ? '' : r[i]).slice(0, 20)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>' : '') +
      '<p class="small">列の割り当て（自動で見つけました。違うところは選び直してください）。<b>＊は必須</b>。大会名が空の行は「大会名なし（日付）」になり、あとから直せます。</p>' +
      '<div class="xlmap">' + XL_FIELDS.map(function (f) { return '<label class="' + (x.map[f] == null ? (XL_REQ[f] && miss.indexOf(f) >= 0 ? 'need' : 'off') : 'got') + '"><span>' + R.FIELD_LABELS[f] + (XL_REQ[f] ? '＊' : '') + '</span><select data-xmap="' + f + '">' + opts(f) + '</select></label>'; }).join('') + '</div>' +
      (miss.length ? '<p class="status ng">✖ 「' + miss.map(function (f) { return R.FIELD_LABELS[f]; }).join('」「') + '」の列を選んでください。</p>' : '') +
      '<div class="rb-row xlw"><span class="small"><b>天気（任意）</b>：この取り込みの大会すべてに付けます</span>' + weatherInputs(b.meta, 'data-f') + '</div>' +
      '<p class="small">取り込める記録：<b>' + res.recs.length + '件</b>（' + Object.keys(meets).length + '大会）' + (x.rescue && x.all != null && x.all !== res.recs.length ? '　<span class="muted">表全体 ' + x.all + '件のうち「' + esc(school()) + '」の選手だけ</span>' : '') + (res.bad.length ? '　<span class="ng">取り込めない行：' + res.bad.length + '件</span>' : '') + '</p>' +
      (res.bad.length ? '<ul class="rb-warn">' + res.bad.slice(0, 30).map(function (r) { return '<li>⚠ ' + r.row + '行目 ' + esc(r.name || '') + ' ' + esc(r.event || '') + '：' + esc(r.warn) + (/日付/.test(r.warn) ? 'が無いか読めません（日付は必須です）' : 'が足りません') + '</li>'; }).join('') + (res.bad.length > 30 ? '<li>ほか ' + (res.bad.length - 30) + '行</li>' : '') + '</ul>' : '') +
      (res.recs.length ? '<div class="tblwrap"><table class="rbt"><tr><th>日付</th><th>大会</th><th>種目</th><th>氏名</th><th>学年</th><th>所属</th><th>記録</th><th>風</th><th>順位</th></tr>' + res.recs.slice(0, 30).map(function (r) { return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.meet) + '</td><td>' + esc(r.event) + '</td><td>' + esc(r.name) + (r.kana ? '<br><small class="muted">' + esc(r.kana) + '</small>' : '') + '</td><td>' + esc(r.grade) + '</td><td>' + esc(r.team) + '</td><td class="rn"><b>' + esc(r.mark) + '</b></td><td class="rn">' + esc(R.shownWind(r)) + '</td><td class="rn">' + esc(r.rank) + '</td></tr>'; }).join('') + '</table></div>' + (res.recs.length > 30 ? '<p class="small muted">ほか ' + (res.recs.length - 30) + '件（保存すると全部入ります）</p>' : '') : '') +
      '<div class="rb-row" style="margin-top:8px"><button class="btn" data-save="' + b.id + '" type="button"' + (res.recs.length && !miss.length ? '' : ' disabled') + '>記録に保存（' + res.recs.length + '件）</button><button class="btn sub" data-del="' + b.id + '" type="button">取り消す</button></div><div class="status" data-st="' + b.id + '"></div></div>';
  }
  $('rbBatches').addEventListener('change', function (e) {
    var box = e.target.closest('.xl[data-b]'); if (!box) return;
    var b = batches.filter(function (x) { return x.id === +box.getAttribute('data-b'); })[0]; if (!b || !b.xl) return;
    var t = e.target;
    if (t.hasAttribute('data-xsheet')) { b.xl.sheet = t.value; loadXlSheet(b); }
    else if (t.hasAttribute('data-xhr')) { b.xl.hr = +t.value; b.xl.map = b.xl.hr < 0 ? b.xl.map : R.mapHeaders(b.xl.txt[b.xl.hr] || []); xlRun(b); }
    else if (t.hasAttribute('data-xdef')) { b.xl.def[t.getAttribute('data-xdef')] = t.value.trim(); xlRun(b); }
    else if (t.hasAttribute('data-xmap')) { var f = t.getAttribute('data-xmap'); if (t.value === '') delete b.xl.map[f]; else { Object.keys(b.xl.map).forEach(function (k) { if (b.xl.map[k] === +t.value) delete b.xl.map[k]; }); b.xl.map[f] = +t.value; } xlRun(b); }
    else return;
    renderBatches();
  });
  $('rbFile').addEventListener('change', function () { handleFiles(this.files, scope()); this.value = ''; });
  var drop = $('rbDrop');
  drop.addEventListener('click', function (e) { if (e.target.tagName !== 'INPUT') $('rbFile').click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('rbFile').click(); } });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
  drop.addEventListener('drop', function (e) {
    var dt = e.dataTransfer; if (dt.files && dt.files.length) { handleFiles(dt.files, scope()); return; }
    var u = dt.getData('text/uri-list') || dt.getData('text/plain') || ''; if (isUrlOnly(u) && urlUi) urlUi.offer(u);
  });
  // v0.20：URLから読み込む。押した時点の scope（A01）を持ち回り、ファイルを入れたときと同じ handleFiles に渡す
  function isUrlOnly(t) { return window.LaneUrl ? LaneUrl.isUrlOnly(t) : false; }
  var urlUi = window.LaneUrl && $('rbUrlLoad') ? LaneUrl.mount($('rbUrlLoad'), { id: 'ru', targets: [{ k: 'res', label: '結果' }], accept: ['pdf', 'html'], multiple: true,
    begin: function () { return scope(); },
    onFiles: function (files, k, sc) { return handleFiles(files, sc); } }) : null;
  $('rbPasteGo').addEventListener('click', function () {
    var t = $('rbPaste').value; if (!t.trim()) return;
    if (isUrlOnly(t)) { if (urlUi) { urlUi.offer(t); $('rbPaste').value = ''; } return; }
    if (t.length > LIMITS.paste) { status('rbStatus', '✖ 貼り付けた文章が長すぎます（約200万文字まで）。種目ごとに分けて貼り付けてください。', 'ng'); return; }
    var res = R.parsePlain(t, {}), pb = { src: '貼り付け', kind: '貼り付け', all: res, raw: t, meta: { name: res.meet.name, date: res.meet.date } };
    // v0.26.7：1件も読めなかった表は、そのまま「列を選ぶ」画面にする
    if (!res.recs.length) { var tb = null; try { tb = tableBatch('貼り付けた表', t, pb.meta); } catch (e) { status('rbStatus', '✖ ' + e.message, 'ng'); return; } if (tb) { addBatchIn(tb, scope()); return; } }
    addBatchIn(pb, scope());
  });
  // ファイル名・資料の見出しから大会名と日付を推測して入れておく（入れた人が打った値は上書きしない）
  function applyGuess(meta, fileName) {
    var g = R.guessMeet(fileName, meta.name || '');
    if (!meta.typedName && g.name && g.name !== meta.name) { meta.name = g.name; meta.guessed = g.from; }
    else if (meta.name) meta.guessed = meta.guessed || 'doc';
    if (!meta.typedDate && !meta.date && g.date) meta.date = g.date;
    if (!meta.md && g.md) meta.md = g.md;
    return meta;
  }
  // 取り込みのプレビューは、読み込みを始めたときのアカウントにだけ出す（b.sc に固定。保存もこの scope で行う）
  function addBatchIn(b, sc) { need(sc); b.sc = sc; b.id = ++seq; batches.unshift(b); renderBatches(); }
  function batchRecs(b) {
    if (!b.all) return [];
    var q = school();
    return b.all.recs.filter(wantRec);
  }
  function batchWarns(b) {
    var q = school(), ws = b.all.warns.filter(function (w) { return !/：/.test(w); });
    batchRecs(b).forEach(function (r) { if (r.warn) ws.push((r.page ? r.page + 'ページ ' : '') + (r.event || '種目不明') + ' ' + (r.name || r.kana || 'No.' + r.bib) + '：' + r.warn + 'を読み取れませんでした'); });
    if (!b.meta.name) ws.unshift('大会名が資料から読み取れませんでした。手で入れてください。');
    else if (b.meta.guessed && !b.meta.typedName) ws.unshift('大会名は' + (b.meta.guessed === 'file' ? 'ファイル名' : '資料の見出し') + 'から推測しました。正しいか確かめて、違えば直してください。');
    if (!b.meta.date) ws.unshift('日付が資料から読み取れませんでした' + (b.meta.md ? '（「' + b.meta.md + '」はありますが年がわかりません）' : '') + '。手で入れてください。');
    if (MODE.personal) { if (!personOn()) ws.unshift('「個人で使う」の名前が空です。名前を入れると、その人の記録だけを拾います。'); else if (b.all.recs.length && !batchRecs(b).length) ws.unshift('「' + MODE.name + '」' + (MODE.team ? '（' + MODE.team + '）' : '') + 'の記録が見つかりませんでした。名前・所属の書き方を確かめてください。'); }
    else if (q && b.all.recs.length && !batchRecs(b).length) ws.unshift('「' + q + '」の選手が見つかりませんでした。学校・クラブ名の書き方（例：本郷高・本郷中）を確かめてください。');
    if (!q && !MODE.personal) ws.unshift('学校・クラブ名が空なので、全校の記録を表示しています。');
    return ws;
  }
  function recRow(r, extra) {
    return '<tr' + (r.warn ? ' class="haswarn"' : '') + '><td>' + esc(r.event) + '</td><td>' + esc(r.round) + '</td><td class="rn">' + esc(r.heat) + '</td><td>' + esc(r.name) + (r.kana ? '<br><small class="muted">' + esc(r.kana) + '</small>' : '') + '</td><td class="rn">' + esc(r.grade) + '</td><td>' + esc(r.team) + '</td><td class="rn"><b>' + esc(r.mark) + '</b>' + (extra || '') + '</td><td class="rn">' + esc(R.shownWind(r)) + '</td><td class="rn">' + esc(r.rank) + (r.overall ? '<br><small class="muted">総合' + esc(r.overall) + '</small>' : '') + '</td><td><small>' + esc(r.comment) + '</small></td></tr>';
  }
  var REC_HEAD = '<tr><th>種目</th><th>ラウンド</th><th>組</th><th>氏名</th><th>学年</th><th>所属</th><th>記録</th><th>風</th><th>順位</th><th>備考</th></tr>';
  // v0.26.7 救済の案内：貼り付けた表は「列を選ぶ」へ。PDF・Webページは、表の部分をコピーして貼り付けてもらう
  function rescueHint(b) {
    if (b.raw && R.isTable(R.splitTable(b.raw))) return '<div class="rb-rescue"><p class="small">🧩 うまく読み取れないときは、<b>列を自分で選んで</b>読み取れます（「氏名はこの列」「記録はこの列」）。全部を手で打ち直さなくて大丈夫です。</p><button class="btn sub" type="button" data-rescue="' + b.id + '">🧩 列を選んで読み取る</button></div>';
    return '<div class="rb-rescue"><p class="small">🧩 うまく読み取れないときは、資料の<b>表の部分をコピーして</b>下の「貼り付け」欄に貼り、「貼り付けた文章を読み取る」を押してください。読めなかったときは、列を自分で選んで読み取れます。Excel・CSV のファイルなら、そのまま入れると列を選べます。</p></div>';
  }
  function renderBatches() {
    $('rbBatches').innerHTML = batches.map(function (b) {
      if (b.xl) return renderXl(b);
      if (b.error) return '<div class="rb-batch"><h3>✖ ' + esc(b.src) + '</h3><p class="status ng">' + esc(b.error) + '</p><button class="btn sub" data-del="' + b.id + '" type="button">閉じる</button></div>';
      var rs = batchRecs(b), ws = batchWarns(b);
      return '<div class="rb-batch" data-b="' + b.id + '"><h3>' + esc(b.kind) + '：' + esc(b.src) + '</h3>' +
        '<div class="rb-row"><label>大会名 <input type="text" data-f="name" value="' + esc(b.meta.name) + '" size="34"></label><label>日付 <input type="date" data-f="date" value="' + esc(b.meta.date) + '"></label></div>' +
        '<div class="rb-row xlw"><span class="small"><b>天気（任意）</b></span>' + weatherInputs(b.meta, 'data-f') + '</div>' +
        '<p class="small">読み取った記録：' + rs.length + '件' + (b.all.recs.length !== rs.length ? '（全体 ' + b.all.recs.length + '件のうち）' : '') + '</p>' +
        (ws.length ? '<ul class="rb-warn">' + ws.map(function (w) { return '<li>⚠ ' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        (!rs.length || ws.some(function (w) { return /見つかりませんでした|読み取れませんでした/.test(w); }) ? rescueHint(b) : '') +
        (rs.length ? '<div class="tblwrap"><table class="rbt">' + REC_HEAD + rs.map(function (r) { return recRow(r); }).join('') + '</table></div>' : '') +
        '<div class="rb-row" style="margin-top:8px"><button class="btn" data-save="' + b.id + '" type="button"' + (rs.length ? '' : ' disabled') + '>記録に保存</button><button class="btn sub" data-del="' + b.id + '" type="button">取り消す</button></div><div class="status" data-st="' + b.id + '"></div></div>';
    }).join('');
  }
  $('rbBatches').addEventListener('input', function (e) {
    var box = e.target.closest('[data-b]'), f = e.target.getAttribute('data-f'); if (!box || !f) return;
    var b = batches.filter(function (x) { return x.id === +box.getAttribute('data-b'); })[0]; if (b) { b.meta[f] = e.target.value.trim(); if (f === 'weather' || f === 'temp' || f === 'humidity') return; if (f === 'name') { b.meta.typedName = true; b.meta.guessed = ''; } if (f === 'date') b.meta.typedDate = true; }
  });
  async function onBatchClick(e) {
    var del = e.target.getAttribute('data-del'), sv = e.target.getAttribute('data-save'), un = e.target.getAttribute('data-undo');
    if (un) {
      var ub = batches.concat(DONE).filter(function (x) { return x.id === +un; })[0], ust = document.querySelector('[data-st="' + un + '"]') || $('rbDone');
      if (!ub || !(ub.addedIds || []).length) return;
      if (!confirm('今読み込んで保存した ' + ub.addedIds.length + '件を記録から取り消します。よろしいですか？')) return;
      var usc = scope();
      try { var n = ub.addedIds.length; await delIds(ub.addedIds, usc); check(usc); ub.addedIds = []; } catch (x) { if (isAbort(x)) return; ust.className = 'status ng'; ust.textContent = '✖ 取り消せませんでした：' + x.message; return; }
      ust.className = 'status ok'; ust.textContent = '✔ 今読み込んだ ' + n + '件を取り消しました（もう一度資料を入れて「記録に保存」で入れ直せます）。';
      await reload(usc); return;
    }
    if (del) { batches = batches.filter(function (b) { return b.id !== +del; }); renderBatches(); return; }
    var rsc = e.target.getAttribute('data-rescue');
    if (rsc) { var rb = batches.filter(function (x) { return x.id === +rsc; })[0]; if (rb) { try { if (!rescueFrom(rb)) alert('表の形（列）が見つかりませんでした'); } catch (x) { alert(x.message); } } return; }
    if (!sv) return;
    var b = batches.filter(function (x) { return x.id === +sv; })[0], st = document.querySelector('[data-st="' + sv + '"]');
    if (b.xl) return saveXl(b, st);
    if (!b.meta.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.meta.date || '')) { st.className = 'status ng'; st.textContent = '✖ 大会名と日付を入れてから保存してください。'; return; }
    var sc = b.sc, rs = batchRecs(b).map(function (r, i) {
      var o = Object.assign({}, r); o.meet = b.meta.name; o.date = b.meta.date; o.src = b.src; o.order = i; o.savedAt = new Date().toISOString();
      o.id = R.recId(o.meet, o.date, o); return o;
    });
    try {
      var res = await putMany(rs, sc);
      await saveBatchWeather(b, [b.meta.date + '|' + b.meta.name], sc);
      check(sc);
      b.addedIds = (b.addedIds || []).concat(res.ids);
      // 完了：入力欄（ファイル・貼り付け・大会名）を空にして、次の大会をそのまま入れられるようにする
      DONE.push(b); batches = batches.filter(function (x) { return x !== b; }); renderBatches();
      $('rbPaste').value = ''; $('rbFile').value = ''; status('rbStatus', '', '');
      var done = $('rbDone'); done.className = 'status ok rb-done';
      done.innerHTML = '✔ <b>' + esc(b.meta.name) + ' 完了（' + res.added + '件保存）</b>' + (res.dup ? '<br><small>' + res.dup + '件はすでに保存済みなので重ねませんでした</small>' : '') + (res.bad ? '<br><small class="ng">' + res.bad + '件は形が正しくない（長すぎるなど）ため保存しませんでした</small>' : '') +
        (res.review ? '<br><small class="ng">⚠ ' + res.review + '件は、前に保存した記録（ナンバーなし）と同じかもしれません。下の「要確認」で確かめてください。</small>' : '') + '<br><small>続けて次の大会の資料を入れられます。</small>' + (b.addedIds.length ? ' <button class="btn sub" type="button" data-undo="' + b.id + '">今の分を取り消す（' + b.addedIds.length + '件）</button>' : '');
      await reload(sc);
    } catch (err) { if (isAbort(err)) return; st.className = 'status ng'; st.textContent = '✖ 保存できませんでした：' + err.message; }
  }
  function hasW(m) { return !!(m.weather || (m.temp !== undefined && m.temp !== '') || (m.humidity !== undefined && m.humidity !== '')); }
  async function saveBatchWeather(b, keys, sc) { if (!hasW(b.meta)) return; for (var i = 0; i < keys.length; i++) { try { await saveMeet(keys[i], b.meta, sc); } catch (e) { if (isAbort(e)) throw e; } } }
  async function saveXl(b, st) {
    var sc = b.sc, now = new Date().toISOString(), rs = b.xl.res.recs.map(function (r, i) { var o = Object.assign({}, r); delete o.warn; delete o.row; o.src = b.src; o.order = i; o.savedAt = now; o.id = R.recId(o.meet, o.date, o); return o; });
    try {
      var res = await putMany(rs, sc), keys = {}; rs.forEach(function (r) { keys[r.date + '|' + r.meet] = 1; });
      await saveBatchWeather(b, Object.keys(keys), sc);
      check(sc);
      b.addedIds = (b.addedIds || []).concat(res.ids); b.meta.name = b.src;
      DONE.push(b); batches = batches.filter(function (x) { return x !== b; }); renderBatches();
      var done = $('rbDone'); done.className = 'status ok rb-done';
      done.innerHTML = '✔ <b>' + esc(b.src) + ' 完了（' + res.added + '件保存・' + Object.keys(keys).length + '大会）</b>' + (res.dup ? '<br><small>' + res.dup + '件はすでに保存済みなので重ねませんでした</small>' : '') + (res.bad ? '<br><small class="ng">' + res.bad + '件は形が正しくない（長すぎるなど）ため保存しませんでした</small>' : '') + (b.xl.res.bad.length ? '<br><small>日付などが足りない ' + b.xl.res.bad.length + '行は入れていません</small>' : '') + (res.review ? '<br><small class="ng">⚠ ' + res.review + '件は前に保存した記録と同じかもしれません（下の「要確認」）</small>' : '') + (b.addedIds.length ? ' <button class="btn sub" type="button" data-undo="' + b.id + '">今の分を取り消す（' + b.addedIds.length + '件）</button>' : '');
      await reload(sc);
    } catch (err) { if (isAbort(err)) return; st.className = 'status ng'; st.textContent = '✖ 保存できませんでした：' + err.message; }
  }
  $('rbBatches').addEventListener('click', onBatchClick); $('rbDone').addEventListener('click', onBatchClick);

  /* ---------- v0.6：1件ずつ入力・記録を直す・1件だけ消す ---------- */
  var EDIT_ID = '', MF = ['date', 'meet', 'name', 'kana', 'grade', 'team', 'event', 'mark', 'wind', 'round', 'rank'];
  function mEl(k) { return $('rm' + k.charAt(0).toUpperCase() + k.slice(1)); }
  function manualValues() { var o = {}; MF.forEach(function (k) { o[k] = mEl(k).value; }); return o; }
  function manualFill(r) { MF.forEach(function (k) { mEl(k).value = r[k] == null ? '' : String(r[k]); mEl(k).classList.remove('bad'); }); }
  function manualReset(keepMeet) {
    var d = mEl('date').value, m = mEl('meet').value;
    EDIT_ID = ''; manualFill({});
    if (keepMeet) { mEl('date').value = d; mEl('meet').value = m; }
    $('rbManualBox').classList.remove('editing'); $('rmEditing').hidden = true; $('rmCancel').hidden = true; $('rmDelete').hidden = true; $('rmSave').textContent = '記録に保存';
    document.querySelectorAll('tr.rc.editing').forEach(function (t) { t.classList.remove('editing'); });
  }
  function opts(list) { return list.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join(''); }
  function fillDatalists() {
    var names = {}, teams = {}, evs = {}, meets = {};
    ALL.forEach(function (r) { if (r.name) names[r.name] = 1; if (r.team) teams[r.team] = 1; if (r.event) evs[r.event] = 1; if (r.meet && !/^大会名なし/.test(r.meet)) meets[r.meet] = 1; });
    var srt = function (o) { return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).slice(0, 800); };
    $('rmNames').innerHTML = opts(srt(names)); $('rmTeams').innerHTML = opts(srt(teams)); $('rmEvents').innerHTML = opts(srt(evs)); $('rmMeets').innerHTML = opts(srt(meets));
  }
  // 氏名を選んだら、いちばん新しい記録からフリガナ・学年・所属を入れる（入っている欄は変えない）
  mEl('name').addEventListener('change', function () {
    var n = R.nk(this.value).replace(/\s+/g, ' ').trim(); if (!n) return;
    var last = ALL.filter(function (r) { return r.name === n; }).sort(function (a, b) { return cmp(a.date, b.date); }).pop(); if (!last) return;
    ['kana', 'grade', 'team'].forEach(function (k) { if (!mEl(k).value && last[k]) mEl(k).value = last[k]; });
  });
  function manualStatus(html, cls) { status('rmStatus', html, cls); }
  function startEdit(id) {
    var r = ALL.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    EDIT_ID = id; manualFill(r);
    var box = $('rbManualBox'); box.open = true; box.classList.add('editing');
    $('rmEditing').hidden = false; $('rmEditing').textContent = '✏️ 記録を直しています：' + (r.name || '') + '・' + (r.event || '') + '・' + (r.mark || '') + '（' + r.date + ' ' + r.meet + '）';
    $('rmCancel').hidden = false; $('rmDelete').hidden = false; $('rmSave').textContent = '✔ 直して保存';
    manualStatus('', '');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('rbManual').addEventListener('submit', async function (e) {
    e.preventDefault();
    var res = R.manualRecord(manualValues());
    MF.forEach(function (k) { mEl(k).classList.remove('bad'); });
    if (res.errors.length) {
      var bad = { '氏名': 'name', '種目': 'event', '日付': 'date', '順位': 'rank', '記録': 'mark', 'この種目': 'mark', '風': 'wind', '学年': 'grade' };
      res.errors.forEach(function (m) { Object.keys(bad).forEach(function (k) { if (m.indexOf(k) === 0) mEl(bad[k]).classList.add('bad'); }); });
      manualStatus('✖ ' + res.errors.map(esc).join('<br>✖ '), 'ng'); return;
    }
    var sc = scope(), r = res.rec, now = new Date().toISOString();
    try {
      if (EDIT_ID) {
        var old = ALL.filter(function (x) { return x.id === EDIT_ID; })[0];
        if (!old) { manualStatus('✖ 直す記録が見つかりません（ほかの端末で消された可能性があります）', 'ng'); manualReset(); return; }
        var o = Object.assign({}, old, r, { heat: old.heat == null ? '' : old.heat, lane: old.lane || '', bib: old.bib || '', comment: old.comment || '', updatedAt: now });
        if (old.overall != null) o.overall = old.overall;
        o.id = R.recId(o.meet, o.date, o);
        if (o.id !== old.id && ALL.some(function (x) { return x.id === o.id; })) { manualStatus('✖ 直したあとの内容と同じ記録が、すでにあります。', 'ng'); return; }
        await replaceRecord(old.id, o, sc);
        manualStatus('✔ 直しました：' + esc(o.name) + '・' + esc(o.event) + '・<b>' + esc(o.mark) + '</b>', 'ok');
        manualReset(true);
      } else {
        r.src = '手入力'; r.manual = true; r.order = 0; r.savedAt = now; r.id = R.recId(r.meet, r.date, r);
        var put = await putMany([r], sc);
        if (!put.added) { manualStatus('ⓘ 同じ記録がすでに保存されているので、重ねませんでした。', ''); return; }
        manualStatus('✔ 保存しました：' + esc(r.name) + '・' + esc(r.event) + '・<b>' + esc(r.mark) + '</b>（' + esc(r.meet) + '）<br><small>続けて次の記録を入れられます（日付と大会名はそのままです）。</small>', 'ok');
        manualReset(true);
      }
      await reload(sc);
    } catch (x) { if (isAbort(x)) return; manualStatus('✖ 保存できませんでした：' + esc(x.message), 'ng'); }
  });
  $('rmCancel').addEventListener('click', function () { manualReset(); manualStatus('', ''); });
  async function deleteOne(id) {
    var r = ALL.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (!confirm('この記録を1件消します。元に戻せません。\n\n' + r.date + ' ' + r.meet + '\n' + (r.name || '') + '　' + (r.event || '') + '　' + (r.mark || '') + '\n\nよろしいですか？')) return;
    var sc = scope();
    try { await delIds([id], sc); if (EDIT_ID === id) manualReset(); status('rbDataStatus', '✔ ' + esc(r.name) + ' の ' + esc(r.event) + '（' + esc(r.mark) + '）を消しました。', 'ok'); manualStatus('', ''); await reload(sc); }
    catch (x) { if (isAbort(x)) return; status('rbDataStatus', '✖ 消せませんでした：' + esc(x.message), 'ng'); }
  }
  $('rmDelete').addEventListener('click', function () { if (EDIT_ID) deleteOne(EDIT_ID); });
  /* ---------- 一覧（v0.3：ホーム・選手・部内ランキング・大会別・歴代・全記録。選手のページは #athlete=… で開く） ---------- */
  var allPB = false, view = 'home', sort = { ath: null, meet: null, all: null }, rankOpt = { season: 'now', grade: '', ev: '' }, histOpt = { ev: '' }, meetSel = '', chartOfficial = false, chartNm = true;
  var DIVKEY = 'lanenote-rec-div', DIV = 'all';
  try { DIV = localStorage.getItem(DIVKEY) || 'all'; } catch (e) { }
  function renderDiv() { document.querySelectorAll('#rbDiv button').forEach(function (b) { var on = b.getAttribute('data-div') === DIV; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  $('rbDiv').addEventListener('click', function (e) { var d = e.target.getAttribute('data-div'); if (!d) return; DIV = d; try { localStorage.setItem(DIVKEY, d); } catch (x) { } rankOpt.ev = ''; histOpt.ev = ''; renderDiv(); render(); });
  renderDiv();
  var SEXKEY = 'lanenote-rec-sex', SEX = 'm', GENDERS = [], NOG = true, athSel = { key: '', ev: '' }, meetEdit = '';
  try { SEX = localStorage.getItem(SEXKEY) || 'm'; } catch (e) { }
  function renderSex() {
    var box = $('rbSex'); box.hidden = GENDERS.length < 2;
    box.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-sex') === SEX; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  $('rbSex').addEventListener('click', function (e) { var d = e.target.getAttribute('data-sex'); if (!d) return; SEX = d; try { localStorage.setItem(SEXKEY, d); } catch (x) { } rankOpt.ev = ''; histOpt.ev = ''; render(); });
  function evName(r) { var t = r.event || ''; return NOG ? t.replace(/男子|女子/, '').replace(/^\s+/, '') : t; }   // 男子だけ（女子だけ）の学校では「男子」を出さない
  function renderReview() {
    var s = school(), mine = $('rbMine').checked, box = $('rbReview');
    var list = REVIEW.filter(function (x) { return !(mine && s) || R.matchSchool(x.team, s); });
    var chosen = Object.keys(DIV_OV).filter(function (k) { return ALL.some(function (r) { return R.personKey(r) === k && !R.rawDivisionOf(r); }); });
    var dups = ALL.filter(function (r) { return r.dupOf; });
    var dupHtml = dups.length ? '<details class="card review" open><summary><span class="rv">要確認</span> <b>前の記録と同じかもしれない記録 ' + dups.length + '件</b></summary><p class="small muted">前に保存した記録にナンバーが無いなどで、同じ記録か別の選手か決められなかったので、消さずに入れました。</p><ul class="rvlist">' +
      dups.map(function (r) { var o = ALL.filter(function (x) { return x.id === r.dupOf; })[0]; return '<li><div><b>' + esc(r.name) + '</b> ' + esc(r.event) + ' <b>' + esc(r.mark) + '</b>' + (r.bib ? '（No.' + esc(r.bib) + '）' : '') + '<br><small class="muted">' + esc(r.date + ' ' + r.meet) + (o ? '／前の記録：' + esc(o.name + ' ' + o.mark) + (o.bib ? '（No.' + esc(o.bib) + '）' : '（ナンバーなし）') : '') + '</small></div><span class="rvbtn"><button type="button" class="btn sub" data-dupkeep="' + esc(r.id) + '">別の記録（両方残す）</button><button type="button" class="btn sub danger-t" data-dupdrop="' + esc(r.id) + '">同じ記録（こちらを消す）</button></span></li>'; }).join('') + '</ul></details>' : '';
    if (!list.length && !chosen.length) { box.innerHTML = dupHtml; return; }
    box.innerHTML = dupHtml + (list.length ? '<details class="card review" open><summary><span class="rv">要確認</span> <b>中学か高校かわからない選手 ' + list.length + '人</b></summary><p class="small muted">所属が「' + esc(s || '学校・クラブ名') + '」だけで、ほかの大会からも決められなかった選手です。選ぶとこの端末（ログイン中はクラウド）に覚えて、ランキングや自己ベストに入ります。選ぶまでは「すべて」にだけ出ます。</p><ul class="rvlist">' +
      list.map(function (x) { return '<li><div><b>' + esc(x.name) + '</b>' + (x.kana ? ' <small class="muted">' + esc(x.kana) + '</small>' : '') + '<br><small class="muted">' + esc(x.team) + '・' + x.ids.length + '件（' + esc(x.dates[0]) + (x.dates.length > 1 && x.dates[x.dates.length - 1] !== x.dates[0] ? '〜' + esc(x.dates[x.dates.length - 1]) : '') + '）<br>' + esc(x.reason) + '</small></div><span class="rvbtn"><button type="button" class="btn sub" data-divpick="jh" data-person="' + esc(x.person) + '">中学</button><button type="button" class="btn sub" data-divpick="hs" data-person="' + esc(x.person) + '">高校</button></span></li>'; }).join('') + '</ul></details>' : '') +
      (chosen.length ? '<details class="small rvdone"><summary>中学/高校を選んだ選手（' + chosen.length + '人）</summary><ul>' + chosen.map(function (k) { return '<li>' + esc(k.split('@')[0]) + '：' + R.divLabel(DIV_OV[k]) + ' <button type="button" class="btn sub" data-divpick="" data-person="' + esc(k) + '">選び直す</button></li>'; }).join('') + '</ul></details>' : '');
  }
  $('rbReview').addEventListener('click', async function (e) {
    var dk = e.target.closest('[data-dupkeep],[data-dupdrop]');
    if (dk) {
      var sc = scope(), keep = dk.getAttribute('data-dupkeep'), id = keep || dk.getAttribute('data-dupdrop');
      var r = ALL.filter(function (x) { return x.id === id; })[0]; if (!r) return;
      try { if (keep) { var o = Object.assign({}, r); delete o.dupOf; await replaceRecord(r.id, o, sc); } else { if (!confirm('この記録を消します（前の記録は残ります）。よろしいですか？')) return; await delIds([r.id], sc); } check(sc); await reload(sc); }
      catch (x) { if (!isAbort(x)) status('rbDataStatus', '✖ できませんでした：' + esc(x.message), 'ng'); }
      return;
    }
    var b = e.target.closest('[data-divpick]'); if (!b) return;
    var p = b.getAttribute('data-person'), d = b.getAttribute('data-divpick');
    if (d) DIV_OV[p] = d; else delete DIV_OV[p];
    try { await saveOverrides(scope()); } catch (x) { status('rbDataStatus', '✖ クラウドに保存できませんでした（この端末には覚えました）：' + esc(x.message), 'ng'); }
    applyInference(); render();
  });
  function setTab(v) { view = v; document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); }
  /* v0.10.2 タブの切り替えは履歴に入れる（ブラウザの「戻る」でホームなどに戻れる） */
  function navState() { return { rbTab: view, meet: meetSel || '', allPB: !!allPB }; }
  function goView(v, o) {
    o = o || {}; setTab(v); allPB = !!o.allPB; if (o.meet) meetSel = o.meet;
    try { history.pushState(navState(), '', location.pathname + location.search); } catch (e) { }
    render();
    var tb = document.querySelector('.tabbar'); window.scrollTo(0, $('rbView').getBoundingClientRect().top + window.scrollY - (tb ? tb.offsetHeight : 0) - 8);
  }
  try { if (!history.state || !history.state.rbTab) history.replaceState(Object.assign({}, history.state || {}, { rbTab: view, meet: '', allPB: false }), ''); } catch (e) { }
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var v = e.target.getAttribute('data-v'); if (!v) return;
    if (v === view && !curAthlete() && !allPB) return;
    goView(v);
  });
  function homeGo(el) {
    if (el.hasAttribute('data-gomeet')) { goView('meet', { meet: el.getAttribute('data-gomeet') }); return; }
    var g = el.getAttribute('data-gokpi');
    if (g === 'pb') goView('all', { allPB: true }); else goView(g);
  }
  $('rbView').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return; var el = e.target.closest && e.target.closest('[data-gomeet],[data-gokpi]');
    if (!el || e.target !== el) return; e.preventDefault(); homeGo(el);
  });
  function curAthlete() { var m = location.hash.match(/^#athlete=(.+)$/); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch (e) { return ''; } }
  window.addEventListener('hashchange', function () { render(); if (curAthlete()) window.scrollTo(0, $('rbView').getBoundingClientRect().top + window.scrollY - document.querySelector('.tabbar').offsetHeight - 8); });
  window.addEventListener('popstate', function (e) {
    var st = e.state; if (st && st.rbTab) { setTab(st.rbTab); allPB = !!st.allPB; if (st.meet) meetSel = st.meet; }
    render();
  });
  $('rbQ').addEventListener('input', render); $('rbMine').addEventListener('change', render);
  // 読み直す：始めたときのアカウントの記録だけを画面に出す（途中で切り替わったら、何も反映しない）
  async function reload(sc) {
    sc = sc || scope();
    var list, side;
    try { list = await getAll(sc); } catch (e) { if (isAbort(e)) return; list = []; status('rbDataStatus', '✖ ' + esc(e.message), 'ng'); }
    try { side = await loadSide(sc); } catch (e) { if (isAbort(e)) return; side = { mets: {}, ov: {} }; }
    var md; try { md = await loadMode(sc); } catch (e) { if (isAbort(e)) return; md = MODE; }
    // v0.24：選手モードの「自分の記録をつける」（records.html?me=1）から来たら「個人で使う」にする（名前はあとで入れる）
    if (/[?&]me=1(?:&|$)/.test(location.search) && !md.personal) md = cleanMode(Object.assign({}, md, { personal: true }));
    if (sc.epoch !== authEpoch) return;
    var ros; try { ros = typeof LaneRoster === 'undefined' ? [] : await loadRoster(sc); } catch (e) { if (isAbort(e)) return; ros = []; }
    if (sc.epoch !== authEpoch) return;
    ALL = list; METS = side.mets; DIV_OV = side.ov; MODE = md; ROSTER = ros; applyModeUi();
    applyInference(); render(); if (CLOUD_READY) renderAuth();
  }
  function filtered() {
    var q = R.nk($('rbQ').value).replace(/\s/g, ''), s = school(), mine = $('rbMine').checked;
    var base = ALL.filter(function (r) {
      if (MODE.personal) { if (mine && personOn() && !isMe(r)) return false; }
      else if (mine && s && !R.matchSchool(r.team, s)) return false;
      if (DIV !== 'all' && R.divisionOf(r) !== DIV) return false;
      return true;
    });
    // v0.5：男女どちらもいるときだけ男子/女子の切り替えを出し、選んだほうだけにする
    GENDERS = R.gendersIn(base); NOG = GENDERS.length < 2;
    if (!NOG && GENDERS.indexOf(SEX) < 0) SEX = GENDERS[0];
    return base.filter(function (r) {
      if (!NOG) { var g = R.genderOf(r); if (g && g !== SEX) return false; }
      if (!q) return true;
      return R.nk([r.name, r.kana, r.event, r.meet, r.team, r.date].join('')).replace(/\s/g, '').indexOf(q) >= 0;
    });
  }
  function windTag(r) { return (r && r._st === 'pending' ? '<span class="pend" title="マネージャーが入れた記録。顧問が確認すると消えます">未確認</span>' : '') + windTag0(r); }
  function windTag0(r) { if (!R.hasMark(r)) return ''; var w = R.windClass(r); return w === 'aid' ? '<span class="ref">追参</span>' : w === 'unk' && !/^[A-Z棄失欠]/.test(r.mark) ? '<span class="unk">風?</span>' : ''; }
  function mv(r) { var m = r && R.markValue(r.mark); return m ? (m.lower ? m.v : -m.v) : 1e9; }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function sortRows(rows, key, defs) {
    var s = sort[key]; if (!s) return rows;
    var f = defs[s.k]; return rows.slice().sort(function (a, b) { return cmp(f(a), f(b)) * s.d; });
  }
  function th(key, k, label) { var s = sort[key], ar = s && s.k === k ? (s.d > 0 ? '▲' : '▼') : ''; return '<th data-sort="' + k + '">' + label + '<span class="ar">' + ar + '</span></th>'; }
  function athLink(key, name) { return '<a class="ath" href="#athlete=' + encodeURIComponent(key) + '">' + esc(name) + '</a>'; }
  function nowSeason() { var d = new Date(); return R.seasonOf(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-01'); }
  function evLabel(rows, ev) { for (var i = 0; i < rows.length; i++) if (R.eventKey(rows[i]) === ev) return R.eventKeyLabel(rows[i], NOG); return ev; }
  // v0.5：種目のプルダウンは区分（中1・中2・中3・中学共通・高校）ごとに見出しを付け、その中は陸上の種目順
  function evSelect(name, evs, cur, rows) {
    return '<label class="ev-only">種目 <select data-' + name + '="ev">' + R.groupEvents(evs, rows, NOG).map(function (g) {
      return '<optgroup label="' + esc(g.group) + '">' + g.items.map(function (it) { return '<option value="' + esc(it.key) + '"' + (it.key === cur ? ' selected' : '') + '>' + esc(it.label) + '</option>'; }).join('') + '</optgroup>';
    }).join('') + '</select></label>';
  }
  function evOrder(evs, rows) { var out = []; R.groupEvents(evs, rows, NOG).forEach(function (g) { g.items.forEach(function (it) { out.push(it.key); }); }); return out; }
  // その大会の記録だけを消す（学校名・しぼりこみに関係なく、その大会のすべての記録）。大会別の「この大会を消す」と「取り込み済みの大会」の削除で共通
  async function deleteMeet(dm) {
    var sc = scope();   // 押した時点のアカウントに固定（再監査A01と同じ考え方）
    var ids = ALL.filter(function (r) { return r.date + '|' + r.meet === dm; }).map(function (r) { return r.id; });
    if (!ids.length) return;
    var label = dm.split('|')[0] + ' ' + dm.split('|').slice(1).join('|');
    if (!confirm('「' + label + '」の記録 ' + ids.length + '件を消します。元に戻せません。よろしいですか？')) return;
    try { await delIds(ids, sc); check(sc); }
    catch (x) { if (isAbort(x)) return; status('rbDataStatus', '✖ 消せませんでした：' + esc(x.message), 'ng'); return; }
    status('rbDataStatus', '✔ 「' + esc(label) + '」の記録 ' + ids.length + '件を消しました。自己ベストを計算し直しました。', 'ok');
    await reload(sc);
  }
  $('rbMeets').addEventListener('click', function (e) { var b = e.target.closest('[data-delmeet]'); if (b) deleteMeet(b.getAttribute('data-delmeet')); });
  $('rbView').addEventListener('toggle', function (e) { if (e.target.matches && e.target.matches('[data-ro-d]')) RS.open = e.target.open; if (e.target.matches && e.target.matches('[data-rl-d]')) RL.open = e.target.open; }, true);
  $('rbView').addEventListener('click', async function (e) {
    if (e.target.closest('[data-back]')) { e.preventDefault(); if (window.__athNav) { window.__athNav = false; history.back(); } else { history.pushState(null, '', location.pathname + location.search); render(); } return; }
    if (e.target.closest('a.ath')) { window.__athNav = true; return; }
    var dm = e.target.getAttribute && e.target.getAttribute('data-delmeet');
    if (dm) { await deleteMeet(dm); return; }
    var ed = e.target.closest('[data-edit]'); if (ed) { startEdit(ed.getAttribute('data-edit')); var tr = ed.closest('tr'); if (tr) tr.classList.add('editing'); return; }
    var rlb = e.target.closest('[data-relay]'); if (rlb) { e.preventDefault(); await onRelay(rlb); return; }
    var rb = e.target.closest('[data-ro]'); if (rb) { e.preventDefault(); await onRoster(rb); return; }
    var dr = e.target.closest('[data-delrec]'); if (dr) { await deleteOne(dr.getAttribute('data-delrec')); return; }
    var ae = e.target.closest('[data-athev]'); if (ae) { athSel.ev = ae.getAttribute('data-athev'); render(); return; }
    var we = e.target.closest('[data-wedit]'); if (we) { meetEdit = meetEdit === we.getAttribute('data-wedit') ? '' : we.getAttribute('data-wedit'); render(); return; }
    var ws = e.target.closest('[data-wsave]');
    if (ws) {
      var box = ws.closest('.wxedit'), w = {}; box.querySelectorAll('[data-w]').forEach(function (el) { w[el.getAttribute('data-w')] = el.value; });
      try { await saveMeet(ws.getAttribute('data-wsave'), w, scope()); meetEdit = ''; status('rbDataStatus', '✔ 天気を保存しました。', 'ok'); } catch (x) { status('rbDataStatus', '✖ 天気を保存できませんでした：' + esc(x.message), 'ng'); }
      render(); return;
    }
    var pl = e.target.closest('[data-pplink]'); if (pl) { openPPScreen([pl.getAttribute('data-pplink')]); makePPLinks([pl.getAttribute('data-pplink')]); return; }
    if (e.target.closest('[data-msshare]')) { msShare(meetSel); return; }
    var mc = e.target.closest('[data-mscopy]'); if (mc) { var mv = mc.getAttribute('data-mscopy'); copyT(mv === 'line' ? msLineText() : MSH.url, mc, mc.textContent); return; }
    var pb = e.target.closest('[data-print]'); if (pb) { startPrint(pb.getAttribute('data-print'), pb.getAttribute('data-key'), pb.getAttribute('data-act') || 'view'); return; }
    var go = e.target.closest('[data-go]'); if (go) { goView(go.getAttribute('data-go')); return; }
    if (e.target.closest('[data-allpb-off]')) { goView('all'); return; }
    var hg = e.target.closest('[data-gomeet],[data-gokpi]'); if (hg && !e.target.closest('a,button,input,select,label')) { homeGo(hg); return; }
    var t = e.target.closest('th[data-sort]'); if (!t) return; var k = t.getAttribute('data-sort'), s = sort[view];
    sort[view] = s && s.k === k ? { k: k, d: -s.d } : { k: k, d: 1 }; render();
  });
  $('rbView').addEventListener('change', function (e) {
    var f = e.target.getAttribute('data-ropt'); if (f) { rankOpt[f] = e.target.value; render(); return; }
    if (e.target.getAttribute('data-hopt')) { histOpt.ev = e.target.value; render(); return; }
    if (e.target.hasAttribute('data-onepage')) { ONEPAGE = e.target.checked; return; }
    if (e.target.hasAttribute('data-meetsel')) { meetSel = e.target.value; render(); return; }
    if (e.target.hasAttribute('data-official')) { chartOfficial = e.target.checked; render(); return; }
    if (e.target.hasAttribute('data-shownm')) { chartNm = e.target.checked; render(); return; }
  });
  // 小さな推移グラフ（上ほど良い記録：時間は下向き、距離は上向きに描く）
  // 推移グラフ（上ほど良い記録）。参考記録（追い風・風不明）は白抜き・薄い点で「参考」と分かるように描く
  // v0.15：DNS・DNF・失格（DQ）・NM など記録の無い出場は、グラフの下の帯に × で出す（日付順に記録と同じ横軸）
  function spark(all, lower, officialOnly, nmList, showNm) {
    var pts = officialOnly ? all.filter(function (p) { return !p.ref; }) : all, nms = showNm ? (nmList || []) : [];
    if (pts.length < 2 && !nms.length) return '<span class="small muted">' + (officialOnly && all.length >= 2 ? '公認記録が2つ以上たまるとグラフが出ます（「公認だけ」を外すと参考記録も入ります）' : '記録が2つ以上たまるとグラフが出ます') + '</span>';
    var W = 300, H = nms.length ? 88 : 70, P = 14, B = nms.length ? 18 : 0, vs = pts.map(function (p) { return p.v; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = hi - lo || 1;
    var tl = pts.map(function (p, i) { return { k: 'm', i: i, date: p.date }; }).concat(nms.map(function (p, i) { return { k: 'x', i: i, date: p.date }; }));
    tl.sort(function (a, b) { return cmp(a.date, b.date) || (a.k === b.k ? a.i - b.i : a.k === 'm' ? -1 : 1); });
    var xs = { m: [], x: [] }, nT = tl.length; tl.forEach(function (t, j) { xs[t.k][t.i] = Math.round((nT < 2 ? W / 2 : P + j * (W - 2 * P) / (nT - 1)) * 10) / 10; });
    var top = P, bot = H - P - B;
    var xy = pts.map(function (p, i) { var n = (p.v - lo) / span, y = pts.length < 2 ? (top + bot) / 2 : lower ? top + n * (bot - top) : bot - n * (bot - top); return [xs.m[i], Math.round(y * 10) / 10]; });
    var bi = -1; pts.forEach(function (p, i) { if (!p.ref && (bi < 0 || (lower ? p.v < pts[bi].v : p.v > pts[bi].v))) bi = i; });
    var off = xy.filter(function (q, i) { return !pts[i].ref; });
    var yx = H - 9;
    return '<svg class="spark' + (nms.length ? ' hasnm' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="記録の推移（上ほど良い・白抜きは参考記録' + (nms.length ? '・下の×は記録なし（DNS・失格など）' : '') + '）">' +
      (nms.length ? '<line x1="4" x2="' + (W - 4) + '" y1="' + (H - B + 1) + '" y2="' + (H - B + 1) + '" stroke="#d6dbe5" stroke-width="0.8"/>' : '') +
      (xy.length > 1 ? '<polyline fill="none" stroke="#9aa8c0" stroke-width="1.2" stroke-dasharray="3 3" points="' + xy.map(function (q) { return q.join(','); }).join(' ') + '"/>' : '') +
      (off.length > 1 ? '<polyline fill="none" stroke="#1f3a68" stroke-width="2" points="' + off.map(function (q) { return q.join(','); }).join(' ') + '"/>' : '') +
      xy.map(function (q, i) { var p = pts[i], t = '<title>' + esc(p.date + ' ' + p.mark + (p.wind ? '（風' + p.wind + '）' : '') + (p.ref ? '・参考' : '')) + '</title>';
        return p.ref ? '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3.6" fill="#fff" stroke="#8a96ad" stroke-width="1.6">' + t + '</circle><text x="' + Math.min(W - 12, Math.max(12, q[0])) + '" y="' + Math.max(8, q[1] - 6) + '" font-size="8" fill="#8a96ad" text-anchor="middle">参考</text>'
          : '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (i === bi ? 4.5 : 3) + '" fill="' + (i === bi ? '#e4572e' : '#1f3a68') + '">' + t + '</circle>'; }).join('') +
      nms.map(function (p, i) { var x = xs.x[i], d = 3.4;
        return '<g class="nmx" data-nm="' + esc(p.mark) + '"><title>' + esc(p.date + ' ' + p.meet + (p.round ? '・' + p.round : '') + '：' + p.mark) + '</title><path d="M' + (x - d) + ' ' + (yx - d) + 'L' + (x + d) + ' ' + (yx + d) + 'M' + (x + d) + ' ' + (yx - d) + 'L' + (x - d) + ' ' + (yx + d) + '" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"/>' +
          '<text x="' + Math.min(W - 10, Math.max(10, x)) + '" y="' + (yx - 5) + '" font-size="7" fill="#c0392b" text-anchor="middle">' + esc(p.mark.slice(0, 4)) + '</text></g>'; }).join('') + '</svg>';
  }
  function pbFlag(f) { return f === 'PB' ? '<span class="pb">PB</span>' : f === '初' ? '<span class="pb first">初</span>' : ''; }
  function renderHome(rows) {
    if (!rows.length) return '<div class="card empty"><b>まだ記録がありません</b><p>上の「1 学校・クラブ名と結果の資料」で、大会の結果PDFや保存したWebページを入れて「記録に保存」を押すと、ここに最近の大会の自己ベストやシーズンの記録がまとまって出ます。</p><button class="btn" type="button" onclick="document.getElementById(\'rbDrop\').scrollIntoView({behavior:\'smooth\'})">結果の資料を入れる</button></div>' + relayHome();
    var pd = R.pbDetails(rows), ns = nowSeason();
    var aths = {}, meets = {}, seasonPB = 0, seasonPBAth = {};
    rows.forEach(function (r) { aths[R.athleteKey(r)] = 1; var k = r.date + '|' + r.meet; (meets[k] = meets[k] || []).push(r); var p = pd[r.id]; if (p && p.flag === 'PB' && R.seasonOf(r.date) === ns) { seasonPB++; seasonPBAth[R.athleteKey(r)] = 1; } });
    var mk = Object.keys(meets).sort().reverse();
    var kp = function (go, cls, n, label, aria) { return '<div class="kpi go' + cls + '" role="link" tabindex="0" data-gokpi="' + go + '" aria-label="' + esc(aria) + '"><b>' + n + '</b><span>' + label + '</span></div>'; };
    var h = '<div class="kpis">' + kp('pb', ' hot', seasonPB, '今シーズンの自己ベスト更新<small>（' + R.seasonLabel(ns) + '・' + Object.keys(seasonPBAth).length + '人）</small>', '今シーズンの自己ベスト更新 ' + seasonPB + '件を全記録で見る') + kp('ath', '', Object.keys(aths).length, '選手', '選手別を見る') + kp('all', '', rows.length, '記録', '全記録を見る') + kp('meet', '', mk.length, '大会', '大会別を見る') + '</div>';
    mk.slice(0, 2).forEach(function (k, i) {
      var list = meets[k], pbs = list.filter(function (r) { return pd[r.id] && pd[r.id].flag === 'PB'; }), firsts = list.filter(function (r) { return pd[r.id] && pd[r.id].flag === '初'; });
      pbs.sort(function (a, b) { return cmp(R.nk(a.name), R.nk(b.name)) || cmp(R.normEvent(a.event), R.normEvent(b.event)); });
      h += '<div class="card meetcard" role="link" tabindex="0" data-gomeet="' + esc(k) + '" aria-label="' + esc(list[0].meet + '（' + list[0].date + '）を大会別で見る') + '"><div class="card-h"><span class="tag">' + (i ? 'その前の大会' : '最新の大会') + '</span><b>' + esc(list[0].meet) + '</b><span class="small muted">' + esc(list[0].date) + '・' + list.length + '件</span><span class="mc-go">この大会を見る →</span></div>' +
        '<p class="small">自己ベスト更新 <b class="big-n">' + pbs.length + '</b>件' + (firsts.length ? '　初記録 ' + firsts.length + '件' : '') + '</p>' +
        (pbs.length ? '<ul class="pblist">' + pbs.map(function (r) { var p = pd[r.id]; return '<li>' + athLink(R.athleteKey(r), r.name || r.kana) + '<span class="ev">' + esc(evName(r)) + '</span><span class="lmk"><b>' + esc(r.mark) + '</b><span class="pb">PB</span></span><span class="prev">前のベスト ' + esc(p.prev.mark) + '<b class="up">' + esc(R.fmtImprovement(p.diff, p.lower)) + '</b></span></li>'; }).join('') + '</ul>' : '<p class="small muted">この大会では自己ベストの更新はありませんでした。</p>') + '</div>';
    });
    return h + relayHome() + rosterHome();   // v0.26.11・v0.26.12
  }
  function renderAthlete(rows, key) {
    var pf = R.athleteProfile(rows, key) || R.athleteProfile(ALL, key);
    var back = '<button class="btn sub back" type="button" data-back="1">← もどる</button>';
    if (!pf) return back + '<p class="muted">この選手の記録が見つかりませんでした。</p>';
    var pd = R.pbDetails(ALL.filter(function (r) { return R.athleteKey(r) === key; }));
    // v0.5：種目の切り替え（すべて＝各種目のベストを短い一覧、種目を選ぶとその種目のカードとグラフ）
    var mineRows = rows.filter(function (r) { return R.athleteKey(r) === key; }); if (!mineRows.length) mineRows = ALL.filter(function (r) { return R.athleteKey(r) === key; });
    var byKey = {}; pf.events.forEach(function (e) { byKey[e.event] = e; });
    var grp = R.groupEvents(Object.keys(byKey), mineRows, NOG), order = [];
    grp.forEach(function (g) { g.items.forEach(function (it) { byKey[it.key].eventLabel = it.label; order.push(byKey[it.key]); }); });
    if (athSel.key !== key) athSel = { key: key, ev: '' };
    if (athSel.ev && !byKey[athSel.ev]) athSel.ev = '';
    var sw = order.length > 1 ? '<div class="evsw" role="tablist" aria-label="種目の切り替え"><button type="button" data-athev=""' + (athSel.ev ? '' : ' class="on" aria-selected="true"') + '>すべて</button>' + order.map(function (e) { return '<button type="button" data-athev="' + esc(e.event) + '"' + (athSel.ev === e.event ? ' class="on" aria-selected="true"' : '') + '>' + esc(e.eventLabel) + '</button>'; }).join('') + '</div>' : '';
    var shown = order.length > 1 && !athSel.ev ? null : (athSel.ev ? [byKey[athSel.ev]] : order);
    var summary = shown ? '' : '<div class="card"><div class="card-h"><b>種目ごとの自己ベスト</b><span class="small muted">押すとグラフと記録</span></div><ul class="evsum">' + order.map(function (e) { var b = e.best || e.ref; return '<li><button type="button" class="evn" data-athev="' + esc(e.event) + '">' + esc(e.eventLabel) + '</button><b class="lmk">' + esc(b ? b.mark : '—') + (e.best ? '' : (b ? windTag(b) : '')) + '</b><span class="sub">' + (b ? (R.shownWind(b) ? '風' + esc(b.wind) + '・' : '') + esc(b.date) + ' ' + esc(b.meet) + ' ' + weatherTag(b.date + '|' + b.meet) : '') + '・' + e.count + '件</span></li>'; }).join('') + '</ul></div>';
    back += ppBtns('ath', key, '個人表');
    var roC = rosterCard(key, pf, ALL.filter(function (r) { return R.athleteKey(r) === key; }));
    return back + '<div class="card ath-h"><b class="nm">' + esc(pf.name) + '</b>' + '<button class="btn sub" type="button" data-pplink="' + esc(key) + '" style="float:right">📱 個人ページのリンク</button>' + (pf.kana ? '<span class="small muted">' + esc(pf.kana) + '</span>' : '') + '<div class="small muted">' + esc(((mineRows.filter(function (r) { return R.rawDivisionOf(r); }).sort(function (x, y) { return cmp(x.date, y.date); }).pop()) || pf).team) + (pf.grade ? '・' + esc(pf.grade) : '') + (R.divisionOf(pf) ? '・' + R.divLabel(R.divisionOf(pf)) : '') + '・' + pf.events.length + '種目・' + pf.count + '件</div></div>' + roC + sw + summary +
      (shown || []).map(function (e) {
        var b = e.best;
        return '<div class="card evc"><div class="card-h"><b>' + esc(e.eventLabel) + '</b><span class="small muted">' + e.count + '件</span></div>' +
          '<div class="evbest"><span class="small muted">自己ベスト（公認）</span><b class="bigmk">' + esc(b ? b.mark : '—') + '</b>' + (b ? '<span class="small muted">' + (R.shownWind(b) ? '風' + esc(b.wind) + '・' : '') + esc(b.date) + ' ' + esc(b.meet) + ' ' + weatherTag(b.date + '|' + b.meet) + '</span>' : '') + '</div>' +
          (e.ref ? '<div class="small">参考 ' + esc(e.ref.mark) + windTag(e.ref) + ' <span class="muted">' + esc(e.ref.wind) + ' ' + esc(e.ref.date) + '</span></div>' : '') +
          '<div class="sparkbox chartbox">' + spark(e.allPoints, e.lower, chartOfficial, e.noMarks, chartNm) + (e.allPoints.length > 1 || (e.noMarks || []).length ? '<span class="chartopt"><span class="muted">推移（上ほど良い）●公認 <b style="color:#e4572e">●</b>ベスト </span>' + (e.allPoints.some(function (p) { return p.ref; }) ? '<span class="lg-ref"><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="#fff" stroke="#8a96ad" stroke-width="1.5"/></svg>参考（追い風・風不明）</span>' : '') + (e.allPoints.some(function (p) { return p.ref; }) ? '<label><input type="checkbox" data-official="1"' + (chartOfficial ? ' checked' : '') + '> 公認だけ</label>' : '') + ((e.noMarks || []).length ? '<span class="lg-nm"><b style="color:#c0392b">×</b>記録なし（' + esc(e.noMarks.map(function (p) { return p.mark; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('・')) + '）</span><label><input type="checkbox" data-shownm="1"' + (chartNm ? ' checked' : '') + '> DNS・失格なども表示</label>' : '') + '</span>' : '') +
          (chartNm && (e.noMarks || []).length ? '<ul class="nmlist small muted">' + e.noMarks.map(function (p) { return '<li>× ' + esc(p.date) + ' ' + esc(p.meet) + (p.round ? '・' + esc(p.round) : '') + '：<b>' + esc(p.mark) + '</b></li>'; }).join('') + '</ul>' : '') + '</div>' +
          '<ul class="recent">' + e.recent.map(function (r) { return '<li><span class="d">' + esc(r.date) + '</span><b>' + esc(r.mark) + '</b>' + pbFlag(pd[r.id] && pd[r.id].flag) + windTag(r) + '<span class="m">' + (R.shownWind(r) ? '風' + esc(r.wind) + '・' : '') + esc(r.meet) + (r.round ? '・' + esc(r.round) : '') + ' ' + weatherTag(r.date + '|' + r.meet) + '</span></li>'; }).join('') + '</ul></div>';
      }).join('');
  }
  // v0.8：個人で使うときのホーム＝自分の種目ごとの自己ベスト
  function renderPersonalHome(rows) {
    if (!personOn()) return '<div class="card empty"><b>👤 個人で使う</b><p>上の「名前」に自分（またはお子さん）の名前を入れてください。結果の資料から、その人の記録だけを拾います。</p></div>';
    var mine = rows.filter(isMe);
    if (!mine.length) return '<div class="card empty"><b>' + esc(MODE.name) + ' さんの記録はまだありません</b><p>上の「1」で結果の資料を入れて「記録に保存」を押すか、「1件ずつ入力」で入れてください。</p></div>';
    var cb = R.computeBests(mine), keys = {}, last = mine.slice().sort(function (a, b) { return cmp(b.date, a.date); })[0];
    cb.bests.forEach(function (b) { keys[b.key] = 1; });
    var grp = R.groupEvents(cb.bests.map(function (b) { return b.event; }).filter(function (v, i, a) { return a.indexOf(v) === i; }), mine, NOG), order = [];
    grp.forEach(function (g) { g.items.forEach(function (it) { cb.bests.filter(function (b) { return b.event === it.key; }).forEach(function (b) { b.eventLabel = it.label; order.push(b); }); }); });
    return '<div class="card pmhome"><div class="card-h"><span class="tag">個人</span><b>' + esc(MODE.name) + ' さんの自己ベスト</b><span class="small muted">' + esc(MODE.team || last.team || '') + '・' + mine.length + '件</span></div><ul class="evsum">' +
      order.map(function (b) { var x = b.best || b.ref; return '<li>' + athLink(b.key, b.eventLabel) + '<b class="lmk">' + esc(x ? x.mark : '—') + (b.best ? '' : x ? windTag(x) : '') + '</b><span class="sub small muted">' + (x ? (R.shownWind(x) ? '風' + esc(x.wind) + '・' : '') + esc(x.date) + ' ' + esc(x.meet) : '') + '・' + b.count + '件</span></li>'; }).join('') + '</ul>' +
      '<p class="small muted">種目名を押すと、推移グラフと記録が出ます。最新：' + esc(last.date + ' ' + last.meet) + '</p></div>';
  }
  function renderRank(rows) {
    var ns = nowSeason(), opt = { season: rankOpt.season === 'now' ? ns : null, grade: rankOpt.grade ? +rankOpt.grade : null };
    var rk = R.ranking(rows, opt), evs = evOrder(Object.keys(rk), rows);
    if (evs.length && evs.indexOf(rankOpt.ev) < 0) rankOpt.ev = evs[0];
    var ctl = '<div class="rb-row ropt"><label>期間 <select data-ropt="season"><option value="now"' + (rankOpt.season === 'now' ? ' selected' : '') + '>今シーズン（' + R.seasonLabel(ns) + '）</option><option value="all"' + (rankOpt.season === 'all' ? ' selected' : '') + '>全期間</option></select></label>' +
      '<label>学年 <select data-ropt="grade">' + [['', '全学年'], ['1', '1年'], ['2', '2年'], ['3', '3年']].map(function (o) { return '<option value="' + o[0] + '"' + (rankOpt.grade === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' + (evs.length ? evSelect('ropt', evs, rankOpt.ev, rows) : '') + (evs.length ? ppBtns('rank', '', 'この種目') + ppBtns('rank-all', '', '全種目') : '') + '</div>';
    if (!evs.length) return ctl + '<p class="muted small">この条件の公認記録がありません。期間や学年を変えてみてください。</p>';
    return ctl + [rankOpt.ev].map(function (ev) {
      return '<div class="card"><div class="card-h"><b>' + esc(evLabel(rows, ev)) + '</b><span class="small muted">' + rk[ev].length + '人</span></div><ol class="rank">' + rk[ev].map(function (x) {
        return '<li><span class="no n' + x.rank + '">' + x.rank + '</span>' + athLink(x.key, x.name) + '<span class="gr">' + (x.grade ? (R.divisionOf(x.best) === 'jh' ? '中' : R.divisionOf(x.best) === 'hs' ? '高' : '') + x.grade + '年' : '') + '</span><b class="lmk">' + esc(x.best.mark) + '</b><span class="sub">' + (R.shownWind(x.best) ? '風' + esc(x.best.wind) + '・' : '') + esc(x.best.date) + '</span></li>';
      }).join('') + '</ol></div>';
    }).join('');
  }
  function renderAllTime(rows) {
    var at = R.allTimeTop(rows, 10), evs = evOrder(Object.keys(at), rows);
    if (!evs.length) return '<p class="muted small">公認記録がまだありません。</p>';
    if (evs.indexOf(histOpt.ev) < 0) histOpt.ev = evs[0];
    return '<div class="rb-row ropt">' + evSelect('hopt', evs, histOpt.ev, rows) + ppBtns('hist', '', 'この種目') + ppBtns('hist-all', '', '全種目') + '</div><p class="small muted">卒業生も含めた歴代の上位10人（ひとり1記録・公認のみ）です。</p>' + [histOpt.ev].map(function (ev) {
      return '<div class="card"><div class="card-h"><b>' + esc(evLabel(rows, ev)) + '</b><span class="small muted">歴代 ' + at[ev].length + '人</span></div><ol class="rank">' + at[ev].map(function (x) {
        return '<li><span class="no n' + x.rank + '">' + x.rank + '</span>' + athLink(x.key, x.name) + '<span class="gr">' + esc(R.seasonLabel(x.season)) + '</span><b class="lmk">' + esc(x.best.mark) + '</b><span class="sub">' + (R.shownWind(x.best) ? '風' + esc(x.best.wind) + '・' : '') + esc(x.best.date) + ' ' + esc(x.best.meet) + '</span></li>';
      }).join('') + '</ol></div>';
    }).join('');
  }
  // v0.9.0：PDFにまとめる（印刷用の画面を重ねて出し、ブラウザの印刷→「PDFに保存」）
  // v0.9.0：出力は3つのボタンに分ける（👀 画面で見る／📄 PDF作成／🖨 印刷）
  function ppBtns(kind, key, label) {
    var a = ' type="button" data-print="' + kind + '"' + (key ? ' data-key="' + esc(key) + '"' : '');
    return '<span class="lp-grp" role="group" aria-label="' + esc(label) + 'の出力"><span class="lp-lb">' + esc(label) + '</span><button class="btn sub lp-btn"' + a + ' data-act="view">👀 画面で見る</button><button class="btn sub lp-btn"' + a + ' data-act="pdf">📄 PDF作成</button><button class="btn sub lp-btn"' + a + ' data-act="print">🖨 印刷</button></span>';
  }
  // v0.9.3：大会まとめ「1枚にまとめる（縮小）」。A4の印刷できる範囲（190×277mm）に入るよう、測って縮める（下限 FIT_MIN）
  var ONEPAGE = false, FIT_MIN = 0.6;
  function fitScale(h, avail) { if (!(h > 0)) return 1; return Math.max(FIT_MIN, Math.min(1, Math.floor(avail / h * 1000) / 1000)); }
  function fitOne() {
    var pg = $('rbPrintBody').querySelector('.lp-one'); if (!pg) return 1;
    var mm = 96 / 25.4, st = pg.style; st.zoom = ''; st.width = '190mm'; st.maxWidth = 'none';
    var h = pg.scrollHeight, f = fitScale(h, 277 * mm - 2); st.width = st.maxWidth = '';
    pg.setAttribute('data-fit', f); pg.style.setProperty('--fit', f); if (f < 1) st.zoom = f;
    var n = $('lpFitNote'); if (n) n.hidden = !(f < 0.85);
    return f;
  }
  if (typeof window !== 'undefined') window.__fitScale = fitScale;
  var PDF_HINT = '保存先で『PDFに保存』を選んでください';
  var CUR_PRINT = { kind: '', key: '' };
  function doPrint(pdf) {
    var h = $('rbPrintHint'); h.hidden = true; h.textContent = '';
    if (pdf) return pdfRec();
    window.print();
  }
  // v0.23 PDF作成：印刷ダイアログを出さずに PDF ファイルを作って保存する（ファイル名は「大会名_大会まとめ.pdf」など）
  function pdfRecName() {
    var k = CUR_PRINT.kind, key = CUR_PRINT.key || '', nm = '';
    if (k === 'meet') nm = key.split('|').slice(1).join('|') + '_大会まとめ';
    else if (k === 'ath') { var pf = R.athleteProfile(ALL, key); nm = (pf && pf.name ? pf.name : '選手') + '_個人表'; }
    else if (k === 'pick') nm = (school() || '') + '_選択した個人表';
    else if (k.indexOf('hist') === 0) nm = (school() || '') + '_歴代記録';
    else nm = (school() || '') + '_部内ランキング';
    return nm.replace(/^_/, '') + '.pdf';
  }
  function pdfRec() {
    if (typeof LanePdf === 'undefined') { alert('PDFを作る部品がありません。「🖨 印刷」から「PDFに保存」を選んでください。'); return; }
    var one = !!$('rbPrintBody').querySelector('.lp-one[data-fit]');
    return LanePdf.make({ html: LanePdf.pageDoc('<div id="rbPrint"><div id="rbPrintBody">' + $('rbPrintBody').innerHTML + '</div></div>', ''), filename: pdfRecName(), margin: 10, footer: 'LANE NOTE', onePage: one && ONEPAGE,
      css: '#rbPrint{position:static!important;overflow:visible!important;inset:auto!important;background:#fff!important}.lp-bar,#rbPrintHint{display:none!important}' +
        /* html2canvas は段組み（columns）が苦手なので、同じ2列をグリッドで組む */
        '#rbPrint .lp-boxes{columns:auto!important;display:grid!important;grid-template-columns:1fr 1fr;column-gap:4mm;align-items:start}#rbPrint .lp-box{display:block!important;overflow:visible!important}#rbPrint .lp-one .lp-hl ul{columns:auto!important;display:grid;grid-template-columns:1fr 1fr;column-gap:10px}' }).catch(function (e) { console.error(e); });
  }
  function printMeta(extra) {
    var o = { school: MODE.personal ? (MODE.team || MODE.name || '') : school(), date: LanePrint.today(), nog: NOG, spark: function (e) { return spark(e.allPoints, e.lower, false, e.noMarks, true); } };
    for (var k in extra || {}) o[k] = extra[k]; return o;
  }
  function filterCond() { return [DIV === 'all' ? '' : R.divLabel(DIV), NOG ? '' : SEX].filter(Boolean).join('・'); }
  function openPrint(html, pick) {
    $('rbPrintBody').innerHTML = html; $('rbPrintGo').hidden = $('rbPrintPdf').hidden = !!pick; $('rbPrintHint').hidden = true; $('rbPrint').hidden = false; $('rbPrint').scrollTop = 0; document.body.classList.add('printing');
  }
  function closePrint() { if (document.body.classList.contains('ms-view')) { location.replace(location.pathname); return; } $('rbPrint').hidden = true; $('rbPrintBody').innerHTML = ''; document.body.classList.remove('printing'); }
  function pickList() {
    var seen = {}, out = []; R.sortAthletes(R.computeBests(filtered()).bests).forEach(function (b) { if (!seen[b.key]) { seen[b.key] = 1; out.push(b); } });
    return out;
  }
  function athSheets(keys) { var o = printMeta(); return keys.map(function (k) { return LanePrint.athleteSheet(R, ALL, k, o); }).join(''); }
  function startPrint(kind, key, act) {
    act = act || 'view'; PICK_ACT = act; CUR_PRINT = { kind: kind, key: key || '' };
    if (kind !== 'pick') { buildPrint(kind, key); if (act !== 'view') doPrint(act === 'pdf'); return; }
    buildPrint(kind, key);
  }
  var PICK_ACT = 'view';
  function buildPrint(kind, key) {
    var rows = filtered();
    if (kind === 'ath') { openPrint(athSheets([key])); return; }
    if (kind === 'meet') {   // v0.9.2：大会まとめ（いまの絞り込みのまま）
      var mr = rows.filter(function (r) { return r.date + '|' + r.meet === key; }), ks = {}; mr.forEach(function (r) { ks[R.athleteKey(r)] = 1; });
      var mp = key.split('|');
      openPrint(LanePrint.meetSheet(R, mr, ALL.filter(function (r) { return ks[R.athleteKey(r)]; }), printMeta({ meet: mp.slice(1).join('|'), meetDate: mp[0], cond: filterCond(), one: ONEPAGE })));
      if (ONEPAGE) fitOne();
      return;
    }
    if (kind === 'pick') {
      var ls = pickList(), c = filterCond();
      openPrint('<div class="lp-pick"><b>個人表をPDFにする選手を選ぶ</b><p class="small muted">' + (c ? 'いまの絞り込み（' + esc(c) + '）の' : '') + '選手 ' + ls.length + '人・1人1ページ</p><div class="lp-ops"><button class="btn sub" type="button" data-ppall="1">全員選択</button><button class="btn sub" type="button" data-ppnone="1">全解除</button><button class="btn" type="button" data-ppmake="1">🖨 PDFにまとめる（<span id="rbPPn">' + ls.length + '</span>人）</button></div><ul>' +
        ls.map(function (b) { return '<li><label><input type="checkbox" data-ppk="' + esc(b.key) + '" checked><b>' + esc(b.name) + '</b><span class="gr">' + esc((b.best || b.ref || {}).grade ? (b.best || b.ref).grade + '年' : '') + ' ' + esc(b.team || '') + '</span></label></li>'; }).join('') + '</ul></div>', true);
      return;
    }
    var hist = kind.indexOf('hist') === 0, all = /-all$/.test(kind), ns = nowSeason();
    var data = hist ? R.allTimeTop(rows, 10) : R.ranking(rows, { season: rankOpt.season === 'now' ? ns : null, grade: rankOpt.grade ? +rankOpt.grade : null });
    var evs = evOrder(Object.keys(data), rows); if (!all) evs = evs.filter(function (e) { return e === (hist ? histOpt.ev : rankOpt.ev); });
    var cond = (hist ? '歴代の上位10人（公認のみ）' : (rankOpt.season === 'now' ? '今シーズン（' + R.seasonLabel(ns) + '）' : '全期間') + '・' + (rankOpt.grade ? rankOpt.grade + '年' : '全学年')) + (filterCond() ? '・' + filterCond() : '');
    openPrint(LanePrint.rankSheet(R, hist ? 'hist' : 'rank', data, evs, function (ev) { return evLabel(rows, ev); }, printMeta({ cond: cond })));
  }
  $('rbPrintClose').addEventListener('click', closePrint);
  $('rbPrintGo').addEventListener('click', function () { doPrint(false); });
  $('rbPrintPdf').addEventListener('click', function () { doPrint(true); });
  $('rbPrintBody').addEventListener('click', function (e) {
    var t = e.target, boxes = $('rbPrintBody').querySelectorAll('[data-ppk]');
    if (t.closest('[data-ppall]') || t.closest('[data-ppnone]')) { var on = !!t.closest('[data-ppall]'); boxes.forEach(function (b) { b.checked = on; }); }
    if (t.closest('[data-ppmake]')) {
      var keys = []; boxes.forEach(function (b) { if (b.checked) keys.push(b.getAttribute('data-ppk')); });
      if (!keys.length) { alert('選手を1人以上選んでください。'); return; }
      openPrint(athSheets(keys)); if (PICK_ACT !== 'view') doPrint(PICK_ACT === 'pdf'); return;
    }
    var n = $('rbPPn'); if (n) n.textContent = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).length;
  });
  $('rbPrintBody').addEventListener('change', function () { var n = $('rbPPn'); if (n) n.textContent = $('rbPrintBody').querySelectorAll('[data-ppk]:checked').length; });
  function renderMeetList() {
    var m = {}; ALL.forEach(function (r) { var k = r.date + '|' + r.meet; m[k] = (m[k] || 0) + 1; });
    var ks = Object.keys(m).sort().reverse();
    $('rbMeetsN').textContent = ks.length ? '（' + ks.length + '大会）' : '（まだありません）';
    $('rbMeets').innerHTML = ks.map(function (k) { var p = k.split('|'); return '<li>' + esc(p[0]) + '　<b>' + esc(p.slice(1).join('|')) + '</b>　<span class="muted">' + m[k] + '件</span> <button type="button" class="btn sub danger-t rb-mdel" data-delmeet="' + esc(k) + '" aria-label="この大会の記録を削除">削除</button></li>'; }).join('');
  }
  function render() {
    if (TEAM) setTimeout(renderTeamPend, 0);
    var rows = filtered(), cb = R.computeBests(rows), flags = cb.flags;
    var meets = {}; rows.forEach(function (r) { var k = r.date + '|' + r.meet; meets[k] = (meets[k] || 0) + 1; });
    var aths = {}; rows.forEach(function (r) { aths[R.athleteKey(r)] = 1; });
    $('rbStats').textContent = ALL.length ? '保存している記録：' + ALL.length + '件（表示 ' + rows.length + '件・選手 ' + Object.keys(aths).length + '人・大会 ' + Object.keys(meets).length + '件）' : 'まだ記録がありません。上で結果の資料を入れて「記録に保存」を押してください。';
    renderMeetList(); renderSex(); renderReview(); fillDatalists();
    var ak = curAthlete(), v = $('rbView');
    document.body.classList.toggle('ath-open', !!ak);
    v.className = 'tblwrap view-' + (ak ? 'athlete' : view);
    if (ak) { v.innerHTML = renderAthlete(rows, ak); return; }
    if (view === 'home') { v.innerHTML = MODE.personal ? renderPersonalHome(rows) : renderHome(rows); return; }
    if (MODE.personal && (view === 'rank' || view === 'hist')) setTab('home');
    if (!rows.length) { v.innerHTML = '<p class="muted small">表示する記録がありません。</p>'; return; }
    if (view === 'rank') { v.innerHTML = renderRank(rows); return; }
    if (view === 'hist') { v.innerHTML = renderAllTime(rows); return; }
    var html = '';
    if (view === 'ath') {
      var bs = cb.bests.slice();
      var defs = { name: function (b) { return R.nk(b.name); }, team: function (b) { return R.nk(b.team); }, event: function (b) { return b.event; }, best: function (b) { return mv(b.best || b.ref); }, date: function (b) { return (b.best || b.ref || {}).date || ''; }, count: function (b) { return -b.count; } };
      var ord = {}; R.sortAthletes(bs).forEach(function (b) { if (!(b.key in ord)) ord[b.key] = Object.keys(ord).length; });
      bs.sort(function (a, b) { return ord[a.key] - ord[b.key] || cmp(a.eventLabel, b.eventLabel); });
      bs = sortRows(bs, view, defs);
      html = '<div class="rb-row">' + ppBtns('pick', '', '個人表（選手を選ぶ）') + '</div><table class="rbt"><tr class="hd">' + th(view, 'name', '氏名') + th(view, 'team', '所属') + th(view, 'event', '種目') + th(view, 'best', '自己ベスト（公認）') + '<th>風</th>' + th(view, 'date', '日付') + '<th>大会</th><th>参考記録（追い風・風不明）</th>' + th(view, 'count', '記録数') + '</tr>' + bs.map(function (b) {
        var r = b.best || {}, f = b.ref;
        return '<tr class="rc"><td class="c-name">' + athLink(b.key, b.name) + '</td><td class="c-team">' + esc(b.team) + '</td><td class="c-ev">' + esc(NOG && (b.best || b.ref) ? R.eventKeyLabel(b.best || b.ref, true) : b.eventLabel) + '</td><td class="rn c-mark"><b>' + esc(r.mark || '—') + '</b></td><td class="rn c-wind" data-l="風">' + esc(R.shownWind(r)) + '</td><td class="c-date">' + esc(r.date) + '</td><td class="c-meet">' + esc(r.meet) + '</td><td class="c-ref" data-l="参考">' + (f ? esc(f.mark) + windTag(f) + ' <small class="muted">' + esc(R.shownWind(f)) + ' ' + esc(f.date) + '</small>' : '') + '</td><td class="rn c-cnt" data-l="記録数">' + b.count + '</td></tr>';
      }).join('') + '</table>';
    } else {
      var rs = rows.slice().sort(function (a, b) { return cmp(b.date, a.date) || cmp(a.meet, b.meet) || cmp(R.normEvent(a.event), R.normEvent(b.event)) || cmp(a.order || 0, b.order || 0); });
      var d2 = { date: function (r) { return r.date; }, meet: function (r) { return r.meet; }, event: function (r) { return R.normEvent(r.event); }, name: function (r) { return R.nk(r.name); }, grade: function (r) { return r.grade; }, mark: mv, rank: function (r) { return r.rank === '' ? 999 : +r.rank; } };
      var meetCtl = '';
      if (view === 'all' && allPB) {   // ホームの「今シーズンの自己ベスト更新」から来たとき
        var pdA = R.pbDetails(rows), nsA = nowSeason();
        rs = rs.filter(function (r) { return pdA[r.id] && pdA[r.id].flag === 'PB' && R.seasonOf(r.date) === nsA; });
        meetCtl = '<div class="rb-row allpb-chip"><span>🔥 今シーズン（' + esc(R.seasonLabel(nsA)) + '）の自己ベスト更新だけ表示中（' + rs.length + '件）</span><button type="button" class="btn sub" data-allpb-off="1">✕ すべての記録を表示</button></div>';
      }
      if (view === 'meet') {
        var mks = Object.keys(meets).sort().reverse();
        if (mks.indexOf(meetSel) < 0) meetSel = mks[0];
        meetCtl = '<div class="meetsel"><label>大会 <select data-meetsel="1">' + mks.map(function (k) { var p = k.split('|'); return '<option value="' + esc(k) + '"' + (k === meetSel ? ' selected' : '') + '>' + esc(p[0] + '　' + p.slice(1).join('|') + '（' + meets[k] + '件）') + '</option>'; }).join('') + '</select></label></div>';
        rs = rs.filter(function (r) { return r.date + '|' + r.meet === meetSel; });
        if (meetSel) meetCtl += '<div class="rb-row">' + ppBtns('meet', meetSel, '大会まとめ') + msShareBtn() + '<label class="lp-onechk"><input type="checkbox" data-onepage="1"' + (ONEPAGE ? ' checked' : '') + '> 1枚にまとめる（縮小）</label></div>' + msPanel();
      }
      rs = sortRows(rs, view, d2);
      var grouped = view === 'meet' && !sort.meet, lastMeet = '';   // 大会別は見出しに大会名と日付を出すので、カードの中では繰り返さない
      html = meetCtl + '<table class="rbt"><tr class="hd">' + (grouped ? '' : th(view, 'date', '日付') + th(view, 'meet', '大会')) + th(view, 'event', '種目') + '<th>ラウンド</th><th>組</th>' + th(view, 'name', '氏名') + th(view, 'grade', '学年') + '<th>所属</th>' + th(view, 'mark', '記録') + '<th>風</th>' + th(view, 'rank', '順位') + '<th>備考</th><th>直す</th></tr>' + rs.map(function (r) {
        var head = '', key = r.date + '|' + r.meet;
        if (grouped && key !== lastMeet) {
          var cnt = meets[key] || 0;
          var mw = METS[key] || {};
          head = '<tr class="gsep rb-meet"><td colspan="13"><b>' + esc(r.date) + '　' + esc(r.meet) + '</b>　<span class="small muted">' + cnt + '件</span> ' + weatherTag(key) + ' <button class="btn sub rb-wedit" type="button" data-wedit="' + esc(key) + '">' + (weatherText(key) ? '天気を直す' : '☀️ 天気・気温を入れる') + '</button> <button class="btn sub rb-delmeet" type="button" data-delmeet="' + esc(key) + '">この大会を消す</button>' +
            (meetEdit === key ? '<div class="rb-row wxedit">' + weatherInputs(mw, 'data-w') + '<button class="btn" type="button" data-wsave="' + esc(key) + '">保存</button></div>' : '') + '</td></tr>';
        }
        lastMeet = key;
        return head + '<tr class="rc">' + (grouped ? '' : '<td class="c-date">' + esc(r.date) + '</td><td class="c-meet">' + esc(r.meet) + '</td>') + '<td class="c-ev">' + esc(evName(r)) + '</td><td class="c-round">' + esc(r.round) + '</td><td class="rn c-heat" data-l="組">' + esc(r.heat) + '</td><td class="c-name">' + athLink(R.athleteKey(r), r.name || r.kana) + '</td><td class="rn c-grade" data-l="学年">' + esc(r.grade) + '</td><td class="c-team">' + esc(r.team) + '</td><td class="rn c-mark"><b>' + esc(r.mark) + '</b>' + pbFlag(flags[r.id]) + windTag(r) + '</td><td class="rn c-wind" data-l="風">' + esc(R.shownWind(r)) + '</td><td class="rn c-rank" data-l="順位">' + esc(r.rank) + '</td><td class="c-cmt"><small>' + esc(r.comment) + '</small>' + (r.manual ? '<small class="muted">手入力</small>' : '') + '</td><td class="c-ops"><button type="button" data-edit="' + esc(r.id) + '" aria-label="この記録を直す">✏️ 直す</button><button type="button" class="rdel" data-delrec="' + esc(r.id) + '" aria-label="この記録を消す">🗑 消す</button></td></tr>';
      }).join('') + '</table>';
    }
    v.innerHTML = html;
  }

  /* ---------- 書き出し・読み込み・消去 ---------- */
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  function stamp() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  $('rbExport').addEventListener('click', function () {
    if (!ALL.length) { status('rbDataStatus', '書き出す記録がありません。', 'ng'); return; }
    download('LANE_NOTE_kiroku_' + stamp() + '.json', new Blob([JSON.stringify({ app: 'LANE NOTE 記録', format: 1, version: REC_VERSION, exportedAt: new Date().toISOString(), records: ALL }, null, 1)], { type: 'application/json' }));
    status('rbDataStatus', '✔ ' + ALL.length + '件をファイルに書き出しました。', 'ok');
  });
  // v0.7（再監査A01）：ファイルを選んだ瞬間の scope に固定。読み込み待ちの間にアカウントが変わったら、保存も表示もしない
  $('rbImport').addEventListener('change', async function () {
    var sc = scope();
    var f = this.files[0]; try { this.value = ''; } catch (e) { } if (!f) return;
    try {
      if (f.size > LIMITS.json) throw new Error('ファイルが大きすぎます（' + Math.round(LIMITS.json / 1048576) + 'MBまで）');
      var txt = await f.text(); check(sc);
      var j = JSON.parse(txt), list = Array.isArray(j) ? j : j && j.records;
      if (!Array.isArray(list)) throw new Error('記録のファイル（LANE NOTE 記録・旧 LANE LOG）ではないようです');
      if (list.length > LIMITS.rows) throw new Error('記録が多すぎます（' + LIMITS.rows + '件まで）');
      var good = [], bad = 0; list.forEach(function (r) { var o = R.sanitizeRecord(r); if (o) good.push(o); else bad++; });
      var res = await putMany(good, sc);
      check(sc);
      status('rbDataStatus', '✔ ' + res.added + '件を読み込みました' + (res.dup ? '（' + res.dup + '件はすでにあるので重ねませんでした）' : '') + (bad ? '。<br>⚠ 形が正しくない ' + bad + '件（日付が無い・項目の型が違うなど）は読み込みませんでした' : '') + (res.review ? '<br>⚠ ' + res.review + '件は前の記録と同じかもしれません（「要確認」で確かめてください）' : '') + '。', bad ? '' : 'ok');
      await reload(sc);
    } catch (e) { if (isAbort(e) || sc.epoch !== authEpoch) return; status('rbDataStatus', '✖ 読み込めませんでした：' + esc(e.message), 'ng'); }
  });
  $('rbClear').addEventListener('click', async function () {
    if (!ALL.length) { status('rbDataStatus', '消す記録はありません。', ''); return; }
    var sc = scope();
    if (!confirm('' + (USER ? 'クラウドに保存した' : 'このブラウザに保存した') + '記録 ' + ALL.length + '件をすべて消します。元に戻せません。\n（必要なら先に「ファイルに書き出す」をしてください）\n\n本当に消しますか？')) return;
    try { await clearAll(sc); } catch (e) { if (isAbort(e)) return; status('rbDataStatus', '✖ 消せませんでした：' + esc(e.message), 'ng'); return; }
    status('rbDataStatus', '✔ 記録をすべて消しました。', 'ok'); await reload(sc);
  });
  $('rbClearCloud').addEventListener('click', async function () {
    if (!USER) return; var sc = scope();
    if (!confirm((USER.email || 'このアカウント') + ' のクラウドに保存した記録・大会の天気・中学/高校の選択を、すべて消します。元に戻せません。\n（短いリンクは大会準備のページから止めてください）\n\n本当に消しますか？')) return;
    try { await clearAll(sc); await clearCloudSide(sc); } catch (e) { if (isAbort(e)) return; status('rbDataStatus', '✖ 消せませんでした：' + esc(e.message), 'ng'); return; }
    status('rbDataStatus', '✔ クラウドのデータをすべて消しました。', 'ok'); await reload(sc);
  });
  $('rbWipeDevice').addEventListener('click', async function () {
    if (!confirm('このブラウザに残っている LANE NOTE の記録（ログインしていないときの記録' + (USER ? '・ログイン中の控え' : '') + '）と、天気・中学/高校の選択を消します。' + (USER ? 'クラウドの記録は消えません。' : '元に戻せません。') + '\n\nよろしいですか？')) return;
    authEpoch++; var errs = [];
    try { localStorage.removeItem(metsKey(null)); localStorage.removeItem(ovKey(null)); localStorage.removeItem(modeKey(null)); } catch (e) { }
    await closeDb(LOCAL_DB);
    try { await LaneAuth.eraseDatabase(LOCAL_DB); } catch (e) { errs.push(e.message); }
    // v0.7（再監査A04）：ログイン中は「控えを置かない」状態にしてから消す。このあとの読み直しはクラウドから表示するだけで、端末には書かない
    if (USER) { setNoCache(USER.uid, true); try { await LaneAuth.wipeUser(USER.uid, closeDb); } catch (e) { errs.push(e.message); } setNoCache(USER.uid, true); }
    GUEST_N = 0; renderGuest(); resetView();
    var sc = scope();
    await reload(sc);
    if (sc.epoch !== authEpoch) return;
    status('rbDataStatus', errs.length ? '⚠ 一部を消せませんでした：' + esc(errs[0]) : '✔ この端末のデータを消しました。' + (USER ? 'このあと、この端末には記録の控えを置きません（ログアウトするか「この端末に控えを置く」を押すまで）。' : ''), errs.length ? 'ng' : 'ok');
  });
  $('rbAuthInfo').addEventListener('click', async function (e) {
    if (!e.target.closest('#rbCacheOn') || !USER) return;
    setNoCache(USER.uid, false); authEpoch++; await reload(scope());
    status('rbDataStatus', '✔ この端末に控えを置くようにしました（電波がないときも見られます）。', 'ok');
  });
  $('rbXlsx').addEventListener('click', function () {
    if (!window.XLSX) { status('rbDataStatus', '✖ Excel書き出しの部品を読み込めませんでした（インターネット接続を確認してください）。', 'ng'); return; }
    var rows = filtered(); if (!rows.length) { status('rbDataStatus', '書き出す記録がありません。', 'ng'); return; }
    var cb = R.computeBests(rows);
    var a = [['日付', '大会', '種目', 'ラウンド', '組', '氏名', 'フリガナ', '学年', '所属', '記録', '風', '順位', '備考', '自己ベスト', '風の扱い', '天気']].concat(rows.slice().sort(function (x, y) { return cmp(x.date, y.date) || cmp(x.order || 0, y.order || 0); }).map(function (r) {
      var w = R.windClass(r); return [r.date, r.meet, r.event, r.round, r.heat, r.name, r.kana, r.grade, r.team, r.mark, R.shownWind(r), r.rank, r.comment, cb.flags[r.id] || '', w === 'aid' ? '追い風参考' : w === 'unk' ? '風不明' : '', weatherText(r.date + '|' + r.meet)];
    }));
    var b = [['氏名', '所属', '種目', '自己ベスト（公認）', '風', '日付', '大会', '参考記録', '参考の風', '参考の日付', '記録数']].concat(cb.bests.map(function (x) { var r = x.best || {}, f = x.ref || {}; return [x.name, x.team, x.eventLabel, r.mark || '', r.wind || '', r.date || '', r.meet || '', f.mark || '', f.wind || '', f.date || '', x.count]; }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a), '記録一覧');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(b), '自己ベスト');
    XLSX.writeFile(wb, 'LANE_NOTE_kiroku_' + stamp() + '.xlsx');
    status('rbDataStatus', '✔ Excelに書き出しました（表示中の ' + rows.length + '件）。', 'ok');
  });
  /* ---------- v0.8：選手の個人ページ（その子1人分の記録だけを入れたリンク。大会準備のページ（index）で開く） ---------- */
  var PPL = { links: {}, gen: 0 }, SHARE_DAYS = 119;
  function siteBase() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^\/]*$/, '') : SHARE_BASE; }
  function ppPayload(key) {
    var mine = ALL.filter(function (r) { return R.athleteKey(r) === key; });
    var pf = R.athleteProfile(mine, key); if (!pf) return null;
    var pd = R.pbDetails(mine), byKey = {};
    pf.events.forEach(function (e) { byKey[e.event] = e; });
    var order = []; R.groupEvents(Object.keys(byKey), mine, NOG).forEach(function (g) { g.items.forEach(function (it) { byKey[it.key].eventLabel = it.label; order.push(byKey[it.key]); }); });
    var b4 = function (r) { return r ? [r.mark || '', R.shownWind(r), r.date || '', r.meet || ''] : null; };
    var last = mine.filter(function (r) { return R.rawDivisionOf(r); }).sort(function (x, y) { return cmp(x.date, y.date); }).pop() || pf;
    return { v: 1, k: 'pp', g: new Date().toISOString(), a: { name: pf.name || '', team: last.team || pf.team || '', grade: pf.grade || '' },
      e: order.slice(0, LanePersonal.MAX_EV).map(function (e) {
        return { l: e.eventLabel, lw: e.lower ? 1 : 0, n: e.count, b: b4(e.best), rf: b4(e.ref),
          p: e.allPoints.slice(-LanePersonal.MAX_P).map(function (p) { return [p.date, Math.round(p.v * 1000) / 1000, p.mark, p.wind || '', p.ref ? 1 : 0]; }),
          x: (e.noMarks || []).slice(-LanePersonal.MAX_X).map(function (p) { return [p.date, p.mark, p.meet, p.round]; }),
          r: e.recent.slice(0, LanePersonal.MAX_R).map(function (r) { return [r.date, r.mark, R.shownWind(r), r.meet, r.round || '', (pd[r.id] && pd[r.id].flag) || '']; }) };
      }) };
  }
  async function encodePP(obj) {
    if (typeof CompressionStream === 'undefined') throw new Error('このブラウザは圧縮に対応していません（新しいChrome／Safari／Edgeを使ってください）');
    var bytes = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(JSON.stringify(obj))]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    var t = ''; for (var i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return '1.' + btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function newShareId() { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '', b = new Uint8Array(1); while (out.length < 10) { crypto.getRandomValues(b); if (b[0] < 248) out += A[b[0] % 62]; } return out; }
  // 短いリンク：大会準備のページと同じ shares/{id}（同じ4項目）と、自分の一覧 users/{uid}/shareIndex/{id}。始めたときのアカウント（uid＋世代）に固定
  async function ppShort(str, label, sc) {
    need(sc); if (!sc.uid) return null;
    if (str.length > 190000) throw new Error('中身が大きすぎて短いリンクにできません');
    var id = newShareId(), exp = FB.F.Timestamp.fromMillis(Date.now() + SHARE_DAYS * 864e5), b = FB.F.writeBatch(FB.fs);
    b.set(FB.F.doc(FB.fs, 'shares', id), { data: str, ownerUid: sc.uid, createdAt: FB.F.serverTimestamp(), expiresAt: exp });
    b.set(FB.F.doc(FB.fs, 'users', sc.uid, 'shareIndex', id), { createdAt: FB.F.serverTimestamp(), expiresAt: exp, label: String(label).slice(0, 80) });
    await b.commit(); check(sc);
    return siteBase() + '?s=' + id;
  }
  /* ---------- v0.23：大会まとめを短いリンクで共有（shares/{id} は同じ4項目・同じ形式。中身の k:'ms' で種類を見分ける） ---------- */
  var MSH = { key: '', url: '', name: '', busy: false, gen: 0 }, MS_MAX = 190000;
  var MS_TIP = 'リンクを知っている人は誰でもログインなしで見られます。チーム全員の名前と記録が入るので、部員の中だけで共有してください。119日で見られなくなります。大会準備ページの「作った短いリンク」からいつでも止められます。';
  function tipHtml(t) { return typeof LaneShareTip !== 'undefined' ? LaneShareTip.html(t) : ''; }
  var MS_SKIP = { ref: 1, raw: 1, src: 1, srcText: 1 };
  // 記録1件を「文字・数字・真偽だけ」の配列にする（列名は K にまとめる）
  function msPack(list) {
    var K = [], ix = {};
    list.forEach(function (r) { Object.keys(r).forEach(function (k) { var v = r[k]; if (!MS_SKIP[k] && ix[k] == null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) { ix[k] = K.length; K.push(k); } }); });
    return { K: K, V: list.map(function (r) { return K.map(function (k) { var v = r[k]; return typeof v === 'string' ? v.slice(0, 300) : (typeof v === 'number' || typeof v === 'boolean') ? v : null; }); }) };
  }
  function msPayload(key) {
    var rows = filtered(), mr = rows.filter(function (r) { return r.date + '|' + r.meet === key; }), ks = {}, eks = {}, mp = key.split('|');
    if (!mr.length) return null;
    mr.forEach(function (r) { ks[R.athleteKey(r)] = 1; eks[R.eventKey(r)] = 1; });
    // 自己ベストの判定に要るのは、同じ選手・同じ種目の、この大会の日までの記録だけ
    var hist = ALL.filter(function (r) { return ks[R.athleteKey(r)] && eks[R.eventKey(r)] && (r.date || '') <= mp[0]; });
    return { v: 1, k: 'ms', n: mp.slice(1).join('|'), d: mp[0], sc: MODE.personal ? (MODE.team || MODE.name || '') : school(), cond: filterCond(), nog: NOG ? 1 : 0, g: new Date().toISOString(), r: msPack(mr), h: msPack(hist) };
  }
  function msUnpack(o, max) {
    if (!o || !Array.isArray(o.K) || !Array.isArray(o.V)) return [];
    var K = o.K.slice(0, 60).map(function (k) { return String(k).slice(0, 40); }).filter(function (k) { return /^[A-Za-z_][\w]*$/.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype'; });
    if (K.length !== Math.min(o.K.length, 60)) return [];
    return o.V.slice(0, max).filter(Array.isArray).map(function (a) { var r = {}; K.forEach(function (k, i) { var v = a[i]; if (typeof v === 'string') r[k] = v.slice(0, 300); else if (typeof v === 'number' && isFinite(v) || typeof v === 'boolean') r[k] = v; }); return r; });
  }
  function msShareBtn() {
    if (!USER || OFFLINE) return '';   // ログインしている人だけ（短いリンクはクラウドに置くため）
    return '<span class="lp-grp ms-grp"><button class="btn sub lp-btn" type="button" data-msshare="1" data-shtip="1" title="' + esc(MS_TIP) + '"' + (MSH.busy ? ' disabled' : '') + '>' + (MSH.busy ? '作っています…' : '🔗 リンクで共有') + '</button>' + tipHtml(MS_TIP) + '</span>';
  }
  function msLineText() { return '【' + MSH.name + '】大会まとめ（LANE NOTE）\n' + MSH.url + '\n※部員の中だけで見てください。119日で見られなくなります。'; }
  function msPanel() {
    if (!MSH.url || MSH.key !== meetSel) return '';
    var sub = MSH.name + '（大会まとめ）', mail = 'mailto:?subject=' + encodeURIComponent(sub) + '&body=' + encodeURIComponent(sub + '\n' + MSH.url + '\n\n※部員の中だけで見てください。119日で見られなくなります。');
    return '<div class="ms-done" role="status"><b>✔ 共有リンクを作りました</b>（119日間・ログインなしで見られます）<input readonly value="' + esc(MSH.url) + '" aria-label="大会まとめの共有リンク" onclick="this.select()">' +
      '<div class="rb-row"><button class="btn sub" type="button" data-mscopy="url">📋 コピー</button><button class="btn sub" type="button" data-mscopy="line">💬 LINE用にコピー</button><a class="btn sub" href="' + esc(mail) + '">✉ メールで送る</a></div>' +
      '<p class="small muted">止めるときは、大会準備ページの「作った短いリンク」から。</p></div>';
  }
  async function msShare(key) {
    if (!key || MSH.busy) return;
    var sc = scope(), gen = ++MSH.gen;
    if (!sc.uid || OFFLINE) { status('rbDataStatus', 'ⓘ リンクで共有するには、Googleでログインしてください。', 'ng'); return; }
    if (!confirm('この大会のまとめを、短いリンクで共有します。\n\n' + MS_TIP + '\n\n作りますか？')) return;
    var o = msPayload(key); if (!o) { status('rbDataStatus', '✖ この大会の記録が（いまの絞り込みでは）ありません。', 'ng'); return; }
    MSH.busy = true; render();
    try {
      var str = await encodePP(o);
      if (str.length > MS_MAX) throw new Error('記録が多すぎて1つのリンクに入りません（' + str.length + '文字・上限190000）。絞り込み（中学/高校・男女）を変えて試してください');
      var url = await msShort(str, '大会まとめ：' + o.n, sc);
      if (gen !== MSH.gen) return;
      MSH = { key: key, url: url, name: o.n, busy: false, gen: gen };
      status('rbDataStatus', '✔ 「' + esc(o.n) + '」の共有リンクを作りました。', 'ok');
    } catch (e) {
      MSH.busy = false;
      if (isAbort(e)) { status('rbDataStatus', 'ログインしているアカウントが変わったので、リンクを作るのを止めました。', 'ng'); }
      else status('rbDataStatus', '✖ リンクを作れませんでした：' + esc(e.message || e), 'ng');
    }
    render();
  }
  // records.html?s=… にする（大会まとめはこのページで開く）。アカウント（uid＋世代）に固定する
  async function msShort(str, label, sc) {
    var u = await ppShort(str, label, sc); if (!u) throw new Error('ログインしていません');
    return u.replace(/\?s=/, 'records.html?s=');
  }
  /* 見る側：records.html?s=<id>（ログイン不要・読み取りだけ） */
  async function msInflate(str) {
    var m = /^1\.([A-Za-z0-9_-]+)$/.exec(str || ''); if (!m || str.length > 400000) throw new Error('リンクの形式が違います');
    if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは展開に対応していません（新しいChrome／Safari／Edgeを使ってください）');
    var b = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    var bin = atob(b), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var rd = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = [], n = 0;
    for (;;) { var x = await rd.read(); if (x.done) break; n += x.value.length; if (n > 4 * 1048576) { try { rd.cancel(); } catch (e) { } throw new Error('リンクの中身が大きすぎます'); } parts.push(x.value); }
    var all = new Uint8Array(n), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; });
    return JSON.parse(new TextDecoder().decode(all));
  }
  function msSheet(o, made, exp) {
    if (!o || o.v !== 1 || o.k !== 'ms') throw new Error('大会まとめのリンクではありません');
    var str_ = function (v, n) { return typeof v === 'string' ? v.slice(0, n || 120) : ''; };
    var recs = msUnpack(o.r, 3000), hist = msUnpack(o.h, 20000);
    if (!recs.length) throw new Error('リンクの中身に記録がありません');
    var meet = str_(o.n), d = str_(o.d, 20), when = made ? new Date(made) : (o.g ? new Date(o.g) : null);
    var fmt = function (t) { return t && !isNaN(t) ? t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate() + ' ' + t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0') : ''; };
    var note = '<div class="ms-note" role="note">📸 <b>' + (fmt(when) ? esc(fmt(when)) + ' 時点の' : '') + 'コピー</b>です（読み取り専用）。あとで記録を直しても、このリンクの中身は変わりません。' + (exp ? '<br>' + esc(fmt(new Date(exp)).replace(/ .*/, '')) + ' まで見られます。' : '') + '</div>';
    return note + LanePrint.meetSheet(R, recs, hist, { school: str_(o.sc, 80), date: LanePrint.today(), nog: !!o.nog, meet: meet, meetDate: d, cond: str_(o.cond, 40), one: false, spark: function (e) { return spark(e.allPoints, e.lower, false, e.noMarks, true); } });
  }
  async function msOpenFromQuery() {
    var m = /[?&]s=([A-Za-z0-9]{6,40})(?:&|$)/.exec(location.search); if (!m) return false;
    var id = m[1];
    document.body.classList.add('ms-view');
    openPrint('<p class="small muted" style="background:#fff;padding:14px;border-radius:8px">読み込んでいます…</p>');
    $('rbPrintGo').hidden = $('rbPrintPdf').hidden = true;
    try {
      await loadFirebase();
      var d;
      try { d = await FB.F.getDoc(FB.F.doc(FB.fs, 'shares', id)); }
      catch (e) { if (/permission-denied/.test(String(e && e.code))) throw new Error('このリンクは有効期限が切れたか、作った先生が共有を止めました'); throw new Error('通信できませんでした（電波の良いところでもう一度開いてください）'); }
      if (!d.exists()) throw new Error('このリンクは見つかりませんでした（共有が止められたか、期限切れの可能性があります）');
      var x = d.data(), ms = function (t) { return t && t.toMillis ? t.toMillis() : null; }, made = ms(x.createdAt), exp = ms(x.expiresAt);
      var until = Math.min(exp || Infinity, made ? made + 120 * 864e5 : Infinity);
      if (until < Date.now()) throw new Error('このリンクは有効期限が切れています');
      var o = await msInflate(x.data);
      if (o && o.k === 'pp' || o && o.k === 'p' || o && Array.isArray(o.r) && !o.r.K) { location.replace(siteBase() + '?s=' + id); return true; }   // 大会準備・個人ページのリンクは元のページで開く
      $('rbPrintBody').innerHTML = msSheet(o, made, isFinite(until) ? until : null);
      $('rbPrintGo').hidden = $('rbPrintPdf').hidden = false;
      CUR_PRINT = { kind: 'meet', key: (o.d || '') + '|' + (o.n || '') };
      document.title = (o.n || '大会まとめ') + '｜LANE NOTE';
    } catch (e) {
      $('rbPrintBody').innerHTML = '<div class="warn" style="background:#fff;padding:14px;border-radius:8px"><b>このリンクは開けません。</b><br>' + esc(e.message || e) + '</div>';
    }
    return true;
  }
  // 大会準備のページで作った、同じ名前の選手用リンク（期限内でいちばん新しいもの）→「大会当日の予定」へのリンクに使う
  async function ppSchedules(sc) {
    need(sc); if (!sc.uid) return [];
    var snap = await FB.F.getDocs(FB.F.collection(FB.fs, 'users', sc.uid, 'shareIndex')); check(sc);
    var out = [], now = Date.now();
    snap.forEach(function (d) { var x = d.data() || {}, m = /^選手：(.*)（(.*)）$/.exec(x.label || ''), e = x.expiresAt && x.expiresAt.toMillis ? x.expiresAt.toMillis() : 0;
      if (m && e > now) out.push({ id: d.id, name: m[1], meet: m[2], at: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : 0 }); });
    return out.sort(function (a, b) { return b.at - a.at; });
  }
  function renderPPList() {
    var ks = Object.keys(PPL.links);
    $('rbPPList').innerHTML = ks.map(function (k) { var L = PPL.links[k];
      return '<div class="pp-row"><b>' + esc(L.name) + '</b><small>' + (L.short ? '短いリンク' : '長いリンク') + '・' + L.url.length + '文字' + (L.nx ? '・予定へのリンクあり' : '') + '</small><input readonly value="' + esc(L.url) + '" aria-label="' + esc(L.name) + 'さんの個人ページのリンク"><button class="btn sub" type="button" data-ppcopy="' + esc(k) + '">コピー</button></div>'; }).join('');
    $('rbPPCopy').disabled = !ks.length;
  }
  function copyT(t, btn, label) { var done = function () { btn.textContent = '✔ コピーしました'; setTimeout(function () { btn.textContent = label; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, function () { alert(t); }); else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } }
  async function makePPLinks(keys) {
    var btn = $('rbPPMake'), sc = scope(), gen = ++PPL.gen;
    var alive = function () { return gen === PPL.gen && sc.epoch === authEpoch && sc.uid === (USER ? USER.uid : null); };
    if (!keys.length) { status('rbPPMsg', '選手を1人以上チェックしてください。', 'ng'); return; }
    btn.disabled = true; PPL.links = {}; renderPPList();
    var sch = [], errs = 0;
    try { if (sc.uid && !OFFLINE) sch = await ppSchedules(sc); } catch (e) { if (isAbort(e) || !alive()) { btn.disabled = false; return; } }
    var tki = null;   // v0.24：やり取りを使っている選手の個人ページには、やり取りのIDも入れる
    try { if (sc.uid && !OFFLINE && FB) { var tapi = tkApi(sc); if ((await tapi.settings()).enabled) tki = (await tapi.index()).filter(function (x) { return x.active; }); } } catch (e) { if (isAbort(e) || !alive()) { btn.disabled = false; return; } }
    for (var i = 0; i < keys.length; i++) {
      if (!alive()) break;
      status('rbPPMsg', '作っています… ' + (i + 1) + '／' + keys.length, '');
      var o = ppPayload(keys[i]); if (!o) continue;
      var nx = sch.filter(function (x) { return R.nameKey(x.name) === R.nameKey(o.a.name); })[0];
      if (nx) o.nx = { s: nx.id, n: nx.meet };
      var str = await encodePP(o), url = siteBase() + '#p=' + str, short = false;
      if (!alive()) break;
      if (sc.uid && !OFFLINE) { try { var u = await ppShort(str, '個人ページ：' + o.a.name, sc); if (u) { url = u; short = true; } } catch (e) { if (isAbort(e) || !alive()) break; errs++; } }
      PPL.links[keys[i]] = { url: url, short: short, name: o.a.name, nx: !!nx }; renderPPList();
    }
    btn.disabled = false;
    if (!alive()) { if (gen === PPL.gen) { PPL.links = {}; renderPPList(); status('rbPPMsg', 'ログインしているアカウントが変わったので、作るのを止めました。もう一度押してください。', 'ng'); } return; }
    status('rbPPMsg', '✔ ' + Object.keys(PPL.links).length + '人分のリンクを作りました。' + (errs ? errs + '人分は短いリンクを作れなかったので、長いリンクにしました。' : '') + (sc.uid ? '' : '（ログインしていないので長いリンクです）'), errs ? 'ng' : 'ok');
  }
  // v0.18.3：選手の個人ページは別画面で、選手を選んでから作る（個人表の選択画面と同じ形）
  var PPS = { div: 'all', sex: 'all', off: {} };
  function ppBase() { var s = school(), mine = $('rbMine').checked; return ALL.filter(function (r) { if (MODE.personal) return personOn() && isMe(r); return !(mine && s && !R.matchSchool(r.team, s)); }); }
  function ppNames() {
    var base = ppBase(), gs = R.gendersIn(base);
    $('rbPPSex').hidden = gs.length < 2; if (gs.length < 2) PPS.sex = 'all';
    var rows = base.filter(function (r) { if (PPS.div !== 'all' && R.divisionOf(r) !== PPS.div) return false; if (PPS.sex !== 'all') { var g = R.genderOf(r); if (g && g !== PPS.sex) return false; } return true; });
    var seen = {}, out = []; R.sortAthletes(R.computeBests(rows).bests).forEach(function (b) { if (!seen[b.key]) { seen[b.key] = 1; out.push(b); } });
    return out;
  }
  function ppCount() { $('rbPPCount').textContent = $('rbPPNames').querySelectorAll('input:checked').length; }
  function renderPPNames() {
    document.querySelectorAll('#rbPPDiv button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ppdiv') === PPS.div); });
    document.querySelectorAll('#rbPPSex button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ppsex') === PPS.sex); });
    var ls = ppNames();
    $('rbPPNames').innerHTML = ls.length ? ls.map(function (b) { var g = (b.best || b.ref || {}).grade; return '<li><label><input type="checkbox" data-ppn="' + esc(b.key) + '"' + (PPS.off[b.key] ? '' : ' checked') + '><b>' + esc(b.name) + '</b><span class="gr">' + esc((g ? g + '年 ' : '') + (b.team || '')) + '</span></label></li>'; }).join('') : '<li class="small muted" style="padding:10px">選手がいません。</li>';
    ppCount();
  }
  function openPPScreen(only) {
    PPS.div = DIV; PPS.sex = 'all'; PPS.off = {};
    renderPPNames();
    if (only) { $('rbPPNames').querySelectorAll('[data-ppn]').forEach(function (b) { b.checked = only.indexOf(b.getAttribute('data-ppn')) >= 0; if (!b.checked) PPS.off[b.getAttribute('data-ppn')] = 1; }); ppCount(); }
    $('rbPPScreen').hidden = false; $('rbPPScreen').scrollTop = 0; document.body.classList.add('pps-open');
  }
  $('rbPPOpen').addEventListener('click', function () { openPPScreen(); });

  /* ---------- v0.24：選手とのやり取り（顧問が「使う」にしたときだけ）。読み書きは押したときの uid＋世代に固定（A01） ---------- */
  var TK = { on: false, idx: [], cur: '', gen: 0 };
  function tkApi(sc) { return LaneTalk.teacher(FB, sc, check); }
  function tkAlive(sc, gen) { return gen === TK.gen && sc.epoch === authEpoch && sc.uid === (USER ? USER.uid : null); }
  function tkByKey(k, idx) { return (idx || TK.idx).filter(function (x) { return x.akey === k && !x.closed && x.exp > Date.now(); }).sort(function (a, b) { return b.at - a.at; })[0] || null; }
  function tkAthletes() { var seen = {}, out = []; R.sortAthletes(R.computeBests(ppBase()).bests).forEach(function (b) { if (!seen[b.key]) { seen[b.key] = 1; out.push(b); } }); return out; }
  function tkDay(m) { var d = new Date(m); return m ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : ''; }
  async function openTalk() {
    $('rbTalkScreen').hidden = false; $('rbTalkScreen').scrollTop = 0; document.body.classList.add('pps-open'); $('rbTalkThread').hidden = true; TK.cur = '';
    var sc = scope(), gen = ++TK.gen;
    $('rbTalkMain').hidden = true; $('rbTalkOn').disabled = true;
    if (!sc.uid || !FB) { status('rbTalkAuth', '🔑 やり取りは、Googleでログインしているときだけ使えます（記録ページの上の「Googleでログイン」から）。', 'ng'); status('rbTalkMsg', '', ''); return; }
    if (OFFLINE) { status('rbTalkAuth', '📴 クラウドにつながらないので、いまは使えません。', 'ng'); return; }
    status('rbTalkAuth', '', ''); status('rbTalkMsg', '読み込んでいます…', '');
    try { var api = tkApi(sc), st = await api.settings(), idx = await api.index(); if (!tkAlive(sc, gen)) return; TK.on = st.enabled; TK.idx = idx; }
    catch (e) { if (isAbort(e) || !tkAlive(sc, gen)) return; status('rbTalkMsg', '✖ 読み込めませんでした：' + esc(e.message), 'ng'); return; }
    $('rbTalkOn').disabled = false; $('rbTalkOn').checked = TK.on; status('rbTalkMsg', '', ''); renderTalkList();
    // C307：期限切れ・削除の途中で止まったものを片づける（始めたときの uid・世代に固定：A01）
    if (TK.idx.some(function (x) { return !x.purged && (x.closed || (x.exp && x.exp < Date.now())); })) {
      try { var n = await api.sweep(TK.idx); if (!tkAlive(sc, gen)) return; var ls0 = api.lastSweep || {}; if (ls0.left || ls0.errors) status('rbTalkMsg', '⚠️ 片づけが終わっていないやり取りがあります（次に開いたときに続けます）', 'ng'); if (n) { var idx2 = await api.index(); if (!tkAlive(sc, gen)) return; TK.idx = idx2; renderTalkList(); status('rbTalkMsg', '🧹 期限切れ・削除済みのやり取り ' + n + '件の中身を消しました。', 'ok'); } }
      catch (e) { if (isAbort(e) || !tkAlive(sc, gen)) return; status('rbTalkMsg', '⚠️ 期限切れのやり取りの片づけが途中で止まりました（次に開いたときに続けます）', 'ng'); }
    }
  }
  function renderTalkList() {
    $('rbTalkMain').hidden = !TK.on; if (!TK.on) { $('rbTalkThread').hidden = true; return; }
    var ls = tkAthletes();
    $('rbTalkList').innerHTML = ls.length ? ls.map(function (b) {
      var t = tkByKey(b.key), st = !t ? '<span class="tk-st">未使用</span>' : t.v !== 2 ? '<span class="tk-st off">旧形式・停止中</span>' : t.active ? '<span class="tk-st on">使用中</span>' : '<span class="tk-st off">停止中</span>';
      // C302：v0.24 で作ったやり取りは個人ページのリンクにも入っていたので、v0.25 では選手から見えない。「安全に作り直す」で新しいリンクにする
      if (t && t.v !== 2) return '<li><span class="nm">' + esc(b.name) + '</span>' + st + '<button class="btn" type="button" data-tkrenew="' + esc(t.id) + '" data-key="' + esc(b.key) + '">🔁 安全に作り直す</button><button class="btn sub danger-t" type="button" data-tkrm="' + esc(t.id) + '">🗑 削除</button></li>';
      return '<li><span class="nm">' + esc(b.name) + '</span>' + st + (t ? '<button class="btn sub" type="button" data-tkopen="' + esc(t.id) + '">💬 開く</button><button class="btn sub" type="button" data-tkact="' + esc(t.id) + '" data-on="' + (t.active ? 0 : 1) + '">' + (t.active ? '⏸ 停止' : '▶ 再開') + '</button><button class="btn sub danger-t" type="button" data-tkrm="' + esc(t.id) + '">🗑 削除</button>'
        : '<button class="btn" type="button" data-tknew="' + esc(b.key) + '">使う</button>') + '</li>';
    }).join('') : '<li class="small muted" style="padding:10px">選手がいません（先に記録を入れてください）。</li>';
  }
  async function tkRun(fn, okMsg) {
    var sc = scope(), gen = TK.gen;
    try { await fn(tkApi(sc), sc); if (!tkAlive(sc, gen)) return; var idx = await tkApi(sc).index(); if (!tkAlive(sc, gen)) return; TK.idx = idx; renderTalkList(); if (okMsg) status('rbTalkMsg', okMsg, 'ok'); return true; }
    catch (e) { if (isAbort(e) || !tkAlive(sc, gen)) return; status('rbTalkMsg', '✖ ' + esc(e.message), 'ng'); }
  }
  async function openThread(id) {
    var sc = scope(), gen = TK.gen, box = $('rbTalkThread'); TK.cur = id; box.hidden = false; box.innerHTML = '<p class="small muted">読み込んでいます…</p>';
    var r; try { r = await tkApi(sc).read(id); TK.more = r.more; TK.older = []; } catch (e) { if (isAbort(e) || !tkAlive(sc, gen) || TK.cur !== id) return; box.innerHTML = '<p class="ng">✖ 読み込めませんでした：' + esc(e.message) + '</p>'; return; }
    if (!tkAlive(sc, gen) || TK.cur !== id) return;
    var ix = TK.idx.filter(function (x) { return x.id === id; })[0] || {};
    box.innerHTML = '<div class="tk-th-h"><b>💬 ' + esc(r.talk.name) + ' さん</b><span class="tk-st ' + (r.talk.active ? 'on' : 'off') + '">' + (r.talk.active ? '使用中' : '停止中') + '</span><button class="btn sub" type="button" data-tkreload="' + esc(id) + '">↻ 最新にする</button><button class="btn sub" type="button" data-tkclose="1">閉じる</button></div>' +
      '<label class="small">選手専用のリンク' + (ix.exp ? '（' + tkDay(ix.exp) + 'まで）' : '') + '<input class="tk-link" id="rbTkLink" readonly value="' + esc(LaneTalk.linkFor(id)) + '"></label><div class="rb-row"><button class="btn sub" type="button" data-tkcopy="1">📋 リンクをコピー</button><span class="small muted">⚠️ このリンクを知っている人は、その選手として書きこめます。本人にだけ送ってください。</span></div>' +
      '<div class="tk-note"><small>先生からのひとこと（選手の画面のいちばん上に出ます）</small><textarea id="rbTkNote" class="tk-in" maxlength="500" rows="2" placeholder="例：次はスタートを意識しよう">' + esc(r.talk.note || '') + '</textarea><div class="rb-row"><button class="btn" type="button" data-tknote="' + esc(id) + '">💾 ひとことを保存</button></div></div>' +
      (r.more ? '<button class="btn sub" type="button" data-tkmore="' + esc(id) + '">前のやり取りを見る</button>' : '') +
      '<div id="rbTkList">' + LaneTalk.msgsHtml(r.msgs, 't', true) + '</div>' +
      ((r.talk.active && TK.on) ? '<div class="tk-form"><textarea id="rbTkReply" class="tk-in" maxlength="500" rows="2" placeholder="選手への返事（500文字まで）" aria-label="選手への返事"></textarea><button class="tk-send" type="button" data-tkreply="' + esc(id) + '">送る</button></div>' : '<p class="small muted">停止中は返事を送れません（選手からも見えません）。</p>');
    TK.shown = r.msgs;
  }
  async function moreThread(id, btn) {
    var sc = scope(), gen = TK.gen; if (!TK.more) return; btn.disabled = true;
    try { var r = await tkApi(sc).read(id, TK.more); if (!tkAlive(sc, gen) || TK.cur !== id) return; TK.older = r.msgs.concat(TK.older || []); TK.more = r.more; $('rbTkList').innerHTML = LaneTalk.msgsHtml(TK.older.concat(TK.shown || []), 't', true); if (TK.more) btn.disabled = false; else btn.remove(); }
    catch (e) { if (isAbort(e) || !tkAlive(sc, gen)) return; btn.disabled = false; status('rbTalkMsg', '✖ ' + esc(e.message), 'ng'); }
  }
  $('rbTalkOpen').addEventListener('click', function () { openTalk(); });
  $('rbTalkBack').addEventListener('click', function () { TK.gen++; $('rbTalkScreen').hidden = true; document.body.classList.remove('pps-open'); });
  $('rbTalkOn').addEventListener('change', async function () {
    var on = $('rbTalkOn').checked, act = TK.idx.filter(function (x) { return x.active; });
    if (!on && act.length && !confirm('やり取りをオフにします。使用中の ' + act.length + '人分のやり取りも停止し、選手の画面から欄が消えます（データは残ります。削除は選手ごとに）。よろしいですか？')) { $('rbTalkOn').checked = true; return; }
    $('rbTalkOn').disabled = true;
    var done = await tkRun(async function (api) { await api.setEnabled(on); if (!on) for (var i = 0; i < act.length; i++) await api.setActive(act[i].id, false); }, on ? '✔ やり取りを使う設定にしました。選手ごとに「使う」を押してください。' : '✔ やり取りをオフにしました。');
    $('rbTalkOn').disabled = false;
    if (done) { TK.on = on; renderTalkList(); } else $('rbTalkOn').checked = TK.on;
  });
  $('rbTalkScreen').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var g = function (k) { return b.getAttribute(k); };
    if (g('data-tknew')) { var a = tkAthletes().filter(function (x) { return x.key === g('data-tknew'); })[0]; if (!a) return; b.disabled = true;
      tkRun(function (api) { return api.create(a.key, a.name); }, '✔ ' + esc(a.name) + ' さんのやり取りを使えるようにしました。「💬 開く」で選手専用のリンクをコピーして、本人にだけ送ってください（個人ページのリンクには入りません）。'); }
    else if (g('data-tkopen') || g('data-tkreload')) openThread(g('data-tkopen') || g('data-tkreload'));
    else if (g('data-tkact')) { var on = g('data-on') === '1'; if (!on && !confirm('このやり取りを停止します。選手の画面から欄が消えます（再開できます）。よろしいですか？')) return;
      tkRun(function (api) { return api.setActive(g('data-tkact'), on); }, on ? '✔ 再開しました' : '✔ 停止しました').then(function (ok) { if (ok && TK.cur === g('data-tkact')) openThread(TK.cur); }); }
    else if (g('data-tkrm')) { if (!confirm('このやり取り（ひとこと・返信・送られた体調メモ）を全部削除します。先に投稿を止めてから消します。元に戻せません。リンクも使えなくなります。よろしいですか？')) return;
      var rid = g('data-tkrm'); tkRun(function (api) { return api.remove(rid).then(function (done) { if (!done) throw new Error('投稿は止めました。メッセージが多いので削除は途中です（次に開いたときに続けます）'); }); }, '✔ 削除しました（投稿を止めて、中身を全部消しました）').then(function (ok) { if (ok && TK.cur === rid) { TK.cur = ''; $('rbTalkThread').hidden = true; } }); }
    else if (g('data-tkmore')) moreThread(g('data-tkmore'), b);
    else if (g('data-tkrenew')) { var oid = g('data-tkrenew'), ra = tkAthletes().filter(function (x) { return x.key === g('data-key'); })[0]; if (!ra) return;
      if (!confirm('v0.24 で作ったやり取りを閉じて中身を消し、新しいリンクを作ります。新しいリンクを選手に送り直してください。よろしいですか？')) return; b.disabled = true;
      tkRun(async function (api) { if (!(await api.remove(oid))) throw new Error('古いやり取りの削除が途中です（次に開いたときに続けます）。もう一度押してください'); await api.create(ra.key, ra.name); }, '✔ 作り直しました。「💬 開く」で新しいリンクをコピーして、本人にだけ送ってください。'); }
    else if (g('data-tkclose')) { TK.cur = ''; $('rbTalkThread').hidden = true; }
    else if (g('data-tkcopy')) copyT($('rbTkLink').value, b, '📋 リンクをコピー');
    else if (g('data-tknote')) { var nid = g('data-tknote'), v = $('rbTkNote').value.trim(); tkRun(function (api) { return api.setNote(nid, v); }, '✔ ひとことを保存しました').then(function (ok) { if (ok && TK.cur === nid) openThread(nid); }); }
    else if (g('data-tkreply')) { var pid = g('data-tkreply'), t = $('rbTkReply').value.trim(); if (!t) return; b.disabled = true; tkRun(function (api) { return api.reply(pid, t); }, '✔ 送りました').then(function (ok) { b.disabled = false; if (ok && TK.cur === pid) openThread(pid); }); }
    else if (g('data-tkdel')) { if (!confirm('このメッセージを削除しますか？')) return; var cid = TK.cur, mid = g('data-tkdel'); tkRun(function (api) { return api.delMsg(cid, mid); }, '✔ 削除しました').then(function (ok) { if (ok && TK.cur === cid) openThread(cid); }); }
  });
  $('rbPPBack').addEventListener('click', function () { $('rbPPScreen').hidden = true; document.body.classList.remove('pps-open'); });
  $('rbPPDiv').addEventListener('click', function (e) { var d = e.target.getAttribute('data-ppdiv'); if (d) { PPS.div = d; renderPPNames(); } });
  $('rbPPSex').addEventListener('click', function (e) { var d = e.target.getAttribute('data-ppsex'); if (d) { PPS.sex = d; renderPPNames(); } });
  $('rbPPAll').addEventListener('click', function () { $('rbPPNames').querySelectorAll('[data-ppn]').forEach(function (b) { b.checked = true; delete PPS.off[b.getAttribute('data-ppn')]; }); ppCount(); });
  $('rbPPNone').addEventListener('click', function () { $('rbPPNames').querySelectorAll('[data-ppn]').forEach(function (b) { b.checked = false; PPS.off[b.getAttribute('data-ppn')] = 1; }); ppCount(); });
  $('rbPPNames').addEventListener('change', function (e) { var k = e.target.getAttribute('data-ppn'); if (k) { if (e.target.checked) delete PPS.off[k]; else PPS.off[k] = 1; ppCount(); } });
  $('rbPPMake').addEventListener('click', function () {
    var keys = []; $('rbPPNames').querySelectorAll('[data-ppn]:checked').forEach(function (b) { keys.push(b.getAttribute('data-ppn')); });
    if (!keys.length) { status('rbPPMsg', '選手を1人以上チェックしてください。', 'ng'); return; }
    if (keys.length > 60 && !confirm(keys.length + '人分のリンクを作ります。時間がかかります。よろしいですか？')) return;
    makePPLinks(keys).catch(function (e) { $('rbPPMake').disabled = false; status('rbPPMsg', '✖ ' + esc(e.message), 'ng'); });
  });
  $('rbPPList').addEventListener('click', function (e) { var b = e.target.closest('[data-ppcopy]'); if (b) copyT(PPL.links[b.getAttribute('data-ppcopy')].url, b, 'コピー'); });
  $('rbPPCopy').addEventListener('click', function () {
    var t = '自分の記録のページです。自分の名前のリンクを開いてください（ほかの人のリンクは開かないこと）\n※リンクを知っている人は誰でも開けます。グループの外には送らないでください。\n※作った日の記録のコピーです。新しい記録は、先生が作り直したリンクで見られます。\n\n' +
      Object.keys(PPL.links).map(function (k) { return PPL.links[k].name + '：' + PPL.links[k].url; }).join('\n');
    copyT(t, $('rbPPCopy'), '📋 まとめてコピー（LINE用）');
  });
  window.__recApp = { goView: goView, getView: function () { return { view: view, meetSel: meetSel, allPB: allPB }; }, openPPScreen: openPPScreen, ppNames: ppNames, ppPayload: ppPayload, encodePP: encodePP, makePPLinks: makePPLinks, getMode: function () { return MODE; }, isMe: isMe,
    ms: { payload: msPayload, sheet: msSheet, inflate: msInflate, share: msShare, open: msOpenFromQuery, state: function () { return MSH; }, tip: function () { return MS_TIP; } },
    _cloud: function (fb, user) { FB = fb; USER = user; OFFLINE = false; render(); } };
  if (typeof LaneShareTip !== 'undefined') LaneShareTip.attach($('rbPPOpen'), LaneShareTip.T.pp);
  msOpenFromQuery();   // v0.23：?s=… は大会まとめの共有リンク（ログイン不要で見るだけ）
  if (CLOUD_READY) initCloud(); else { renderAuth(); reload(); }
})();
