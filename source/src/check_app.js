/* ===== v0.19 エントリー照合（check.html）の画面。ファイルはすべてこの端末の中で読み、どこにも送らない ===== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var E = EntryCheck;
  var st = { books: null, sheet: '', det: null, map: null, ent: null, entName: '', sl: null, slName: '', teams: [], allTeams: [], res: null };
  var PDFJS_VER = '4.10.38';
  var PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/';
  var pdfjsPromise = null;
  // 外部CDNの部品は、決まった版のハッシュ（SRI）と一致したときだけ使う
  var PDFJS_SRI = { 'build/pdf.min.mjs': 'sha384-+0ti2moQlmLN7WZHE2RHIf5lV8hHxhxEalN0il3YZceG26fUPyOkR0hp9daxk1i7',
    'build/pdf.worker.min.mjs': 'sha384-ToeVvShCxKc6CEvhHeMt0Q8A06pSPDbAlngO9nokrDmh914gk/pYd0N7D0a4Lz2o' };
  async function verifiedUrl(path) {
    var url = PDFJS_BASE + path;
    // ハッシュを確かめられない環境（古いブラウザなど）では、確かめずに使うことはせず読み込みを中止する
    if (!(window.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function')) throw new Error('このブラウザでは部品の改ざんチェック（ハッシュの確認）ができないため、読み込みを中止しました。新しいChrome／Edge／Safariで開いてください');
    var res = await fetch(url, { mode: 'cors', credentials: 'omit', integrity: PDFJS_SRI[path] });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var buf = await res.arrayBuffer(), d = new Uint8Array(await crypto.subtle.digest('SHA-384', buf)), bin = '';
    for (var i = 0; i < d.length; i++) bin += String.fromCharCode(d[i]);
    if ('sha384-' + btoa(bin) !== PDFJS_SRI[path]) throw new Error('部品の内容が想定と違います（改ざんの可能性）');
    return URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
  }
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = Promise.all([verifiedUrl('build/pdf.min.mjs'), verifiedUrl('build/pdf.worker.min.mjs')]).then(function (u) {
        return import(u[0]).then(function (lib) { lib.GlobalWorkerOptions.workerSrc = u[1]; return lib; });
      }).catch(function (e) { pdfjsPromise = null; throw new Error('PDF読み取り部品を読み込めませんでした。' + (/改ざん/.test(e.message) ? '' : 'インターネット接続を確認してください。') + '(' + e.message + ')'); });
    }
    return pdfjsPromise;
  }
  async function readPdf(file, onProgress) {
    var lib = await loadPdfjs();
    if (!/\.pdf$/i.test(file.name || '') && file.type && file.type !== 'application/pdf') throw new Error('PDFファイルではないようです（' + (file.name || '') + '）。PDFを選んでください。');
    var buf = new Uint8Array(await file.arrayBuffer()), doc;
    try {
      doc = await lib.getDocument({ data: buf, cMapUrl: PDFJS_BASE + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS_BASE + 'standard_fonts/' }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('パスワード付き（暗号化）のPDFなので読めません。パスワードの無いPDFを使ってください。');
      if (e && e.name === 'InvalidPDFException') throw new Error('PDFが壊れているか、PDFではありません。もう一度ダウンロードしてみてください。');
      if (e && /fetch|network|Failed to load/i.test(e.message || '')) throw new Error('読み取り部品の取得に失敗しました。インターネット接続を確認して、もう一度入れ直してください。');
      throw e;
    }
    var pages = [], textCount = 0;
    try {
    for (var p = 1; p <= doc.numPages; p++) {
      if (onProgress) onProgress(p, doc.numPages);
      var pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      textCount += tc.items.filter(function (i) { return i.str && i.str.trim(); }).length;
      pages.push({ width: vp.width, height: vp.height, items: tc.items.filter(function (i) { return i.str !== undefined; }).map(function (i) {
        return { str: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) };
      }) });
    }
    } finally { try { doc.destroy(); } catch (e) { } }
    if (!textCount) throw new Error('このPDFには文字の情報がありません（スキャン・画像のPDFの可能性）。文字を選択できるPDFを使ってください。');
    return pages;
  }

  function setStatus(id, html, cls) { var el = $(id); el.innerHTML = html; el.className = 'status ' + (cls || ''); var d = el.closest('.drop'); if (d) { d.classList.toggle('loaded', cls === 'ok'); d.classList.toggle('failed', cls === 'ng'); } }
  function aoaOf(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }); }
  // エントリーファイル（.xlsx/.xls/.csv）
  async function loadEntry(f) {
    if (f.size > 30 * 1048576) { setStatus('ckEntStatus', '✖ 大きすぎるので読みませんでした（30MBまで）', 'ng'); return; }
    setStatus('ckEntStatus', '読み取り中…「' + esc(f.name) + '」', 'busy');
    try {
      if (!window.XLSX) throw new Error('Excelを読む部品を読み込めませんでした（インターネット接続を確認してください）');
      var wb;
      if (/\.csv$/i.test(f.name)) { var buf = new Uint8Array(await f.arrayBuffer()), txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('shift_jis').decode(buf); } wb = XLSX.read(txt.replace(/^\ufeff/, ''), { type: 'string', raw: true }); }
      else wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      st.books = wb.SheetNames.map(function (n) { return { name: n, aoa: aoaOf(wb.Sheets[n]) }; });
      st.map = {}; st.books.forEach(function (b) { var m = E.codeMap(b.aoa); for (var k in m) st.map[k] = m[k]; });
      st.entName = f.name;
      setBooks();
    } catch (e) { console.error(e); st.ent = null; setStatus('ckEntStatus', '✖ ' + esc(e.message || e), 'ng'); render(); }
  }
  function setBooks(books) {
    if (books) { st.books = books; st.map = {}; books.forEach(function (b) { var m = E.codeMap(b.aoa); for (var k in m) st.map[k] = m[k]; }); }
    var pk = E.pickSheet(st.books, st.map);
    if (!pk) { st.ent = null; st.det = null; setStatus('ckEntStatus', '✖ 氏名・種目の見出しがあるシートが見つかりません。下の「列の割り当て」で選んでください', 'ng'); st.sheet = st.books[0] && st.books[0].name; st.det = { header: 0, cols: { event: [], kana: [] } }; mapUi(); render(); return; }
    st.sheet = pk.name; st.det = pk.det; reread();
  }
  function curAoa() { var b = st.books.find(function (x) { return x.name === st.sheet; }); return b ? b.aoa : []; }
  function reread() {
    st.ent = E.readEntries(curAoa(), st.det, st.map);
    var n = st.ent.athletes.length, ev = st.ent.athletes.reduce(function (a, x) { return a + x.events.length; }, 0), rl = st.ent.athletes.filter(function (x) { return x.relay; }).length;
    setStatus('ckEntStatus', n ? '✔ 「' + esc(st.entName) + '」 シート「' + esc(st.sheet) + '」 ' + n + '人・個人種目 ' + ev + '件' + (rl ? '・リレー ' + rl + '人' : '') + (st.ent.warns.length ? '<br><span class="warn">⚠ ' + st.ent.warns.map(esc).join('<br>') + '</span>' : '') : '△ 選手を読み取れませんでした。下の「列の割り当て」を確かめてください', n ? (st.ent.warns.length ? 'ok warnst' : 'ok') : 'ng');
    mapUi(); autoTeams(); render();
  }
  // 列の割り当て（大会ごとにシートの形が違うので、自動で合わないときは手で選ぶ）
  function mapUi() {
    var box = $('ckMap'); if (!st.books) { box.hidden = true; return; } box.hidden = false;
    var aoa = curAoa(), H = st.det.header, w = 0; aoa.slice(Math.max(0, H - 3), H + 6).forEach(function (r) { w = Math.max(w, r.length); });
    var lab = function (c) { var p = []; for (var r = Math.max(0, H - 3); r <= H; r++) { var v = String((aoa[r] || [])[c] || '').trim(); if (v && p.indexOf(v) < 0) p.push(v); } var smp = ''; for (var r2 = H + 1; r2 < aoa.length && !smp; r2++) smp = String((aoa[r2] || [])[c] || '').trim(); return colName(c) + '列 ' + (p.join('') || '（見出しなし）') + (smp ? '　例：' + smp.slice(0, 12) : ''); };
    var opts = function (sel) { var o = '<option value="">（なし）</option>'; for (var c = 0; c < w; c++) o += '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + esc(lab(c)) + '</option>'; return o; };
    var C = st.det.cols, h = '<label>シート <select id="ckSheet">' + st.books.map(function (b) { return '<option' + (b.name === st.sheet ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
      '<label>見出しの行 <input type="number" id="ckHead" min="1" max="' + aoa.length + '" value="' + (H + 1) + '"></label>';
    E.ROLES.forEach(function (R) {
      if (R.multi) {
        var cur = C[R.k] || [];
        h += '<div class="ck-mrow"><b>' + R.label + '</b>' + (R.k === 'event' ? '<span class="small muted">（種目1・2・3…いくつでも）</span>' : '') + '<select data-role="' + R.k + '" data-i="0">' + opts(cur[0]) + '</select>' + cur.slice(1).map(function (c, i) { return '<select data-role="' + R.k + '" data-i="' + (i + 1) + '">' + opts(c) + '</select>'; }).join('') + '<select data-role="' + R.k + '" data-i="' + (cur.length || 1) + '">' + opts(null) + '</select></div>';
      } else h += '<div class="ck-mrow"><b>' + R.label + '</b><select data-role="' + R.k + '">' + opts(C[R.k]) + '</select></div>';
    });
    $('ckMapBody').innerHTML = h;
  }
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function onMap(e) {
    var t = e.target;
    if (t.id === 'ckSheet') { st.sheet = t.value; var d = E.detect(curAoa()); st.det = d.header >= 0 ? d : { header: 0, cols: { event: [], kana: [] } }; reread(); return; }
    if (t.id === 'ckHead') { var d2 = E.detect(curAoa().slice(0)); var hr = Math.max(0, (+t.value || 1) - 1); st.det = Object.assign({}, st.det, { header: hr }); reread(); return; }
    var role = t.getAttribute('data-role'); if (!role) return;
    var C = st.det.cols, v = t.value === '' ? null : +t.value;
    if (role === 'event' || role === 'kana') { var arr = Array.from($('ckMapBody').querySelectorAll('select[data-role="' + role + '"]')).map(function (s) { return s.value === '' ? null : +s.value; }).filter(function (x) { return x != null; }); C[role] = arr; }
    else C[role] = v;
    reread();
  }
  async function loadSl(f) {
    if (f.size > 50 * 1048576) { setStatus('ckSlStatus', '✖ 大きすぎるので読みませんでした（50MBまで）', 'ng'); return; }
    setStatus('ckSlStatus', '読み取り中…「' + esc(f.name) + '」', 'busy');
    try {
      var pages = await readPdf(f, function (p, n) { setStatus('ckSlStatus', '読み取り中…「' + esc(f.name) + '」 ' + p + '／' + n + 'ページ', 'busy'); });
      var sl = MeetParser.parseStartList(pages);
      if (!sl.entries.length && !sl.relays.length) throw new Error('出場者を見つけられませんでした（対応していない形式の可能性があります）');
      setSl(sl, f.name, pages.length);
    } catch (e) { console.error(e); setStatus('ckSlStatus', '✖ ' + esc(e.message || e), 'ng'); }
  }
  function setSl(sl, name, np) {
    st.sl = sl; st.slName = name; st.allTeams = MeetLogic.allTeams(sl).all; st.teams = []; $('ckTeams').dataset.q = '';
    setStatus('ckSlStatus', '✔ 「' + esc(name) + '」 ' + (np ? np + 'ページ／' : '') + sl.events.length + '種目・' + sl.entries.length + '人・リレー' + sl.relays.length + 'チーム' + (sl.warnings && sl.warnings.length ? '<br><span class="warn">⚠ ' + sl.warnings.length + 'か所に読み取りの問題があります（大会準備のページの「読み取りの確認」で見られます）</span>' : ''), sl.warnings && sl.warnings.length ? 'ok warnst' : 'ok');
    autoTeams(true); render();
  }
  function autoTeams(force) {
    if (!st.sl) { teamUi(); return; }
    if (st.ent && (force || !st.teams.length) && !$('ckSchool').value.trim()) {
      var t = E.pickTeams(st.ent, st.allTeams); if (t.length) { st.teams = t; $('ckSchool').value = t[0].replace(/[A-Z]$/, ''); }
    }
    teamUi();
  }
  function teamUi() {
    var box = $('ckTeams');
    if (!st.sl) { box.innerHTML = '<span class="muted small">先にスタートリストを入れてください</span>'; return; }
    var q = $('ckSchool').value.trim();
    if (!q) { box.innerHTML = '<span class="muted small">学校名（一部でOK）を入れると候補が出ます</span>'; st.teams = []; return; }
    var found = MeetLogic.findTeams(st.sl, q);
    if (!found.length) { box.innerHTML = '<span class="warn">「' + esc(q) + '」を含む所属が見つかりません</span>'; st.teams = []; return; }
    if (box.dataset.q !== q) { var auto = st.ent ? E.pickTeams(st.ent, found) : []; st.teams = found.length === 1 ? found.slice() : auto.length ? auto : st.teams.filter(function (t) { return found.indexOf(t) >= 0; }); }
    box.dataset.q = q;
    box.innerHTML = found.map(function (t) { return '<label class="chip"><input type="checkbox" value="' + esc(t) + '"' + (st.teams.indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(t) + '</label>'; }).join('');
  }
  var ICON = { ok: '✅', miss: '⚠️', extra: '❓' }, WORD = { ok: '両方ある', miss: 'エントリーしたのにスタートリストにない', extra: 'スタートリストにだけある' };
  function rowInfo(r) {
    var a = r.a, s = r.sl;
    var name = r.st === 'extra' ? s.name : a.name, grade = r.st === 'extra' ? (s.grade || '') : (a.grade || ''), ev = s ? s.event : E.evLabel(r.ev);
    var where = s ? [s.round, s.heat ? s.heat + '組' : '', s.pos ? (s.posKind || '') + s.pos : '', s.bib ? 'No.' + s.bib : ''].filter(Boolean).join(' ') : '';
    var note = [];
    if (r.yure) note.push('表記ゆれで一致（エントリー「' + a.name + '」／スタートリスト「' + s.name + '」）');
    if (a && r.ev && r.ev.raw && r.st !== 'extra') note.push('エントリー：' + r.ev.raw);
    if (r.note) note.push(r.note);
    return { name: name, grade: grade, ev: ev, where: where, note: note };
  }
  function results() {
    if (!st.ent || !st.ent.athletes.length || !st.sl || !st.teams.length) return null;
    return E.compare(st.ent, st.sl, st.teams);
  }
  function render() {
    var out = $('ckResult'), res = st.res = results();
    if (!res) { out.hidden = true; return; }
    out.hidden = false;
    var c = res.count, rc = res.relayCount;
    $('ckSum').innerHTML = kpi('✅', c.ok, '両方ある', 'ok') + kpi('⚠️', c.miss, 'スタートリストにない', c.miss ? 'ng' : '') + kpi('❓', c.extra, 'スタートリストにだけ', c.extra ? 'q' : '') + kpi('≒', c.yure, '表記ゆれで一致', c.yure ? 'y' : '') +
      '<p class="ck-verdict">' + (c.miss || c.extra || rc.miss || rc.extra ? '⚠️ <b>確かめてほしいところが ' + (c.miss + c.extra + rc.miss + rc.extra) + '件</b> あります' + (rc.miss + rc.extra ? '（リレー ' + (rc.miss + rc.extra) + '件を含む）' : '') + '。上から順に並べています' : '🎉 <b>エントリーとスタートリストがすべて一致しました</b>') + '</p>';
    var prob = res.rows.filter(function (r) { return r.st !== 'ok'; }), ok = res.rows.filter(function (r) { return r.st === 'ok'; });
    $('ckList').innerHTML = (prob.length ? '<h3 class="ck-h">確かめてほしいところ（' + prob.length + '件）</h3>' + prob.map(card).join('') : '') +
      '<details class="ck-okd"' + (prob.length ? '' : ' open') + '><summary><b>✅ 両方ある（' + ok.length + '件）</b>' + (c.yure ? '　<span class="ck-yure">表記ゆれ ' + c.yure + '件を含む</span>' : '') + '</summary>' + ok.map(card).join('') + '</details>';
    $('ckRelay').innerHTML = relayHtml(res);
  }
  function kpi(i, n, l, cls) { return '<div class="ck-kpi ' + (cls || '') + '"><b>' + i + ' ' + n + '</b><span>' + l + '</span></div>'; }
  function card(r) {
    var x = rowInfo(r);
    return '<div class="ck-row ck-' + r.st + (r.yure ? ' ck-y' : '') + '"><div class="ck-st">' + ICON[r.st] + '</div><div class="ck-main"><div class="ck-nm"><b>' + esc(x.name) + '</b> <span class="small muted">' + esc(x.grade) + '</span>' + (r.yure ? ' <span class="ck-yure">表記ゆれで一致</span>' : '') + '</div><div class="ck-ev">' + esc(x.ev) + (x.where ? ' <span class="small muted">' + esc(x.where) + '</span>' : '') + '</div>' +
      (r.st !== 'ok' ? '<div class="ck-why">' + WORD[r.st] + '</div>' : '') + (x.note.length ? '<div class="small ck-note">' + x.note.map(esc).join('<br>') + '</div>' : '') + '</div></div>';
  }
  function relayHtml(res) {
    if (!res.relays.length && !res.reserves.length) return '';
    var rc = res.relayCount;
    return '<h3 class="ck-h">🏃 リレー（' + res.relays.length + 'チーム：✅ ' + rc.ok + '・⚠️ ' + rc.miss + '・❓ ' + rc.extra + '）</h3>' + res.relays.map(function (g) {
      return '<div class="ck-rel ck-' + g.st + '"><div class="ck-rh">' + ICON[g.st] + ' <b>' + esc(g.label) + '</b> ' + esc(g.sex ? g.sex + '子' : '') + ' <span class="small muted">' + esc(g.sl.map(function (r) { return r.event + ' ' + (r.heat ? r.heat + '組' : '') + (r.pos ? (r.posKind || '') + r.pos : ''); }).join('・') || 'スタートリストに見つかりません') + '</span></div>' +
        '<div class="ck-mem">' + g.members.map(function (m) { return '<span class="ck-m ck-' + m.st + '">' + ICON[m.st] + ' ' + esc(m.name) + (m.reserve ? '（リレー要員）' : '') + (m.yure ? ' <i class="ck-yure">ゆれ</i>' : '') + '</span>'; }).join('') + '</div></div>';
    }).join('') + (res.reserves.length ? '<p class="small">リレー要員としてエントリー：' + res.reserves.map(function (a) { return esc(a.name); }).join('、') + '</p>' : '') +
      '<p class="small muted">⚠️＝エントリーのメンバーなのにスタートリストのそのチームにいない ／ ❓＝スタートリストにだけいるメンバー・チーム</p>';
  }
  /* ---- 画面で見る・PDF作成・印刷 ---- */
  function sheet() {
    var res = st.res, c = res.count, rc = res.relayCount, meet = (st.slName || '').replace(/\.pdf$/i, '');
    var tr = function (r) { var x = rowInfo(r); return '<tr class="cp-' + r.st + '"><td class="cp-i">' + ICON[r.st] + '</td><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.grade) + '</td><td>' + esc(x.ev) + '</td><td>' + esc(x.where) + '</td><td>' + (r.st !== 'ok' ? WORD[r.st] + (x.note.length ? '<br>' : '') : '') + x.note.map(esc).join('<br>') + '</td></tr>'; };
    return '<section class="cp-page"><header class="cp-band"><div><div class="cp-kind">ENTRY CHECK</div><div class="cp-big">エントリー照合</div><div class="cp-sub">' + esc(st.teams.join('・')) + '</div></div><div class="cp-r">' + esc(meet) + '<br><span>エントリー：' + esc(st.entName) + '</span><br><span>出力日 ' + today() + '</span></div></header>' +
      '<div class="cp-sum"><div><b>' + c.ok + '</b>✅ 両方ある</div><div class="' + (c.miss ? 'ng' : '') + '"><b>' + c.miss + '</b>⚠️ スタートリストにない</div><div class="' + (c.extra ? 'ng' : '') + '"><b>' + c.extra + '</b>❓ スタートリストにだけ</div><div><b>' + c.yure + '</b>≒ 表記ゆれで一致</div></div>' +
      '<table class="cp-t"><thead><tr><th></th><th>氏名</th><th>学年</th><th>種目</th><th>組・レーン</th><th>メモ</th></tr></thead><tbody>' + res.rows.map(tr).join('') + '</tbody></table>' +
      (res.relays.length ? '<h3 class="cp-h">リレー（✅ ' + rc.ok + '・⚠️ ' + rc.miss + '・❓ ' + rc.extra + '）</h3><table class="cp-t"><thead><tr><th></th><th>チーム</th><th>スタートリスト</th><th>メンバー</th></tr></thead><tbody>' + res.relays.map(function (g) { return '<tr class="cp-' + g.st + '"><td class="cp-i">' + ICON[g.st] + '</td><td><b>' + esc(g.label) + '</b> ' + esc(g.sex) + '</td><td>' + esc(g.sl.map(function (r) { return r.event + ' ' + (r.heat ? r.heat + '組' : '') + (r.pos ? (r.posKind || '') + r.pos : ''); }).join('・') || '—') + '</td><td>' + g.members.map(function (m) { return ICON[m.st] + esc(m.name); }).join('、') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<footer class="cp-f"><span>LANE NOTE エントリー照合</span><span>必ず元の資料でも確かめてください</span></footer></section>';
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function openPrint(act) {
    if (!st.res) return;
    $('ckPrintBody').innerHTML = sheet(); $('ckPrint').hidden = false; document.body.classList.add('printing');
    var h = $('ckPrintHint'); h.hidden = act !== 'pdf'; h.textContent = '📄 保存先で『PDFに保存』を選んでください';
    if (act !== 'view') setTimeout(function () { window.print(); }, act === 'pdf' ? 400 : 0);
  }
  function closePrint() { $('ckPrint').hidden = true; $('ckPrintBody').innerHTML = ''; document.body.classList.remove('printing'); }
  function bindDrop(id, input, fn) {
    var z = $(id), f = $(input);
    z.addEventListener('click', function (e) { if (e.target !== f && !e.target.closest('label')) f.click(); });
    z.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } });
    f.addEventListener('change', function () { if (f.files[0]) fn(f.files[0]); f.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('drag'); }); });
    z.addEventListener('drop', function (e) { var x = e.dataTransfer.files[0]; if (x) fn(x); });
  }
  function init() {
    bindDrop('ckEntDrop', 'ckEntFile', loadEntry); bindDrop('ckSlDrop', 'ckSlFile', loadSl);
    $('ckMapBody').addEventListener('change', onMap);
    $('ckSchool').addEventListener('input', function () { teamUi(); render(); });
    $('ckTeams').addEventListener('change', function () { st.teams = Array.from($('ckTeams').querySelectorAll('input:checked')).map(function (c) { return c.value; }); render(); });
    document.querySelectorAll('[data-ckprint]').forEach(function (b) { b.addEventListener('click', function () { openPrint(b.getAttribute('data-ckprint')); }); });
    $('ckPrintClose').addEventListener('click', closePrint); $('ckPrintGo').addEventListener('click', function () { window.print(); });
    $('ckPrintPdf').addEventListener('click', function () { openPrint('pdf'); });
    teamUi();
  }
  // テスト・見本づくり用：読み取り済みのデータを直接入れる（ファイルの読み取りを通さない）
  window.__check = { setBooks: function (books, name) { st.entName = name || 'entry.xlsx'; setBooks(books); }, setSl: setSl, state: st };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
