/* ===== 画面の動き ===== */
(function () {
  'use strict';
  var PDFJS_VER = '4.10.38';
  var PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/';
  var state = { make: {}, dateCands: {}, feeParsed: null, feeFrom: '', prices: {}, priceSrc: {}, athSort: null, sl: null, tt: null, notes: null, slName: '', ttName: '', noteName: '', rows: [], teams: [], allTeams: [], day: '', progCopies: {} };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
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

  var loadSeq = { sl: 0, tt: 0, note: 0, yoko: 0 };   // 読み込みの順番。遅れて終わった古い読み込みは捨てる
  var SID = { sl: 'slStatus', tt: 'ttStatus', note: 'noteStatus', yoko: 'yokoStatus' };
  function clearKind(kind) {
    if (kind === 'sl') { state.sl = null; state.slName = ''; state.allTeams = []; state.teams = []; state.make = {}; state.teamCat = {}; state.athSort = null; }
    else if (kind === 'tt') { state.tt = null; state.ttName = ''; }
    else if (kind === 'note') { state.notes = null; state.noteName = ''; resetRules(); if (state.feeFrom === 'note') clearFees(); }
    else if (kind === 'yoko') { if (state.feeFrom === 'yoko') clearFees(); }
    delete state.dateCands[kind]; updateDate();
  }
  function clearFees() { state.feeParsed = null; state.feeFrom = ''; state.prices = {}; state.priceSrc = {}; renderFeePrices(); }
  // 前の資料から自動で入れた単価だけを消す（手入力した単価は残す）
  function clearAutoFees() {
    state.feeParsed = null; state.feeFrom = ''; state.progCopies = {};
    MeetLogic.CATS.forEach(function (c) { ['ind', 'relay'].forEach(function (k) {
      if ((state.priceSrc[c] || {})[k] === 'man') return;
      state.prices[c] = state.prices[c] || {}; state.prices[c][k] = null; state.priceSrc[c] = state.priceSrc[c] || {}; state.priceSrc[c][k] = 'na';
    }); });
    renderFeePrices();
  }
  async function handleFile(kind, file) {
    if (!file) return;
    var sid = SID[kind], tok = ++loadSeq[kind];
    var fname = file && file.name;
    var had = { sl: state.slName, tt: state.ttName, note: state.noteName, yoko: state.yokoName }[kind];
    if (file.size > 50 * 1048576) { setStatus(sid, '✖ 「' + esc(file.name) + '」は大きすぎるので読みませんでした（50MBまで）', 'ng'); return; }   // v0.14（監査F09）
    setStatus(sid, '読み取り中…「' + esc(file.name) + '」', 'busy');
    try {
      var pages = await readPdf(file, function (p, n) { if (tok === loadSeq[kind]) setStatus(sid, '読み取り中…「' + esc(file.name) + '」 ' + p + '／' + n + 'ページ', 'busy'); });
      if (tok !== loadSeq[kind]) return;   // もっと新しいファイルが入れられた
      try { fillMeta(pages, fname); } catch (e) { }
      try { (state.docText = state.docText || {})[kind] = pagesText(pages); } catch (e) { }
      try { state.dateCands[kind] = MeetParser.findDates(pages, fname); updateDate(); } catch (e) { console.error(e); }
      var feeMsg = '';
      if (kind === 'yoko') state.yokoName = file.name;
      if (kind === 'yoko' || (kind === 'note' && state.feeFrom !== 'yoko')) {
        var fp = MeetParser.parseFees(pages);
        if (Object.keys(fp.cats).length) { state.feeParsed = fp; state.feeFrom = kind; applyFees(fp); feeMsg = '・参加料'; }
        else if (kind === 'yoko') { state.feeParsed = fp; state.feeFrom = kind; applyFees(fp); }
        else if (state.feeFrom === 'note') { clearAutoFees(); feeMsg = '（この注意事項には参加料の記載が無いため、前の注意事項から入れた単価は消しました）'; }
      }
      if (kind === 'yoko') {
        var dd = MeetParser.pickDate(state.dateCands.yoko || [], new Date().getFullYear());
        setStatus(sid, '✔ 「' + esc(file.name) + '」 ' + [dd && !dd.fromName ? '日付 ' + dd.label : '日付 見つからず', Object.keys(state.feeParsed.cats).length ? '参加料 読み取り済み' : '参加料 見つからず'].join('・'), 'ok');
        render(); return;
      }
      if (kind === 'sl') {
        var sl = MeetParser.parseStartList(pages);
        if (!sl.entries.length && !sl.relays.length) throw new Error('出場者を見つけられませんでした（対応していない形式の可能性があります）');
        if (state.sl) { state.make = {}; state.teamCat = {}; state.athSort = null; $('teamList').dataset.q = ''; }   // 前の大会の枚数・並べ替え・区分は引き継がない
        state.sl = sl; state.slName = file.name; state.day = '';
        state.allTeams = MeetLogic.allTeams(sl).all;
        var fmtLabel = sl.format === 'program' ? 'プログラム形式（種目ごとに時刻あり）' : 'スタートリスト形式（北区型）';
        var all = sl.entries.concat(sl.relays), nT = all.filter(function (e) { return e.time; }).length;
        var timeMsg = !sl.hasTimes ? '' : nT === all.length ? ' <span class="small">時刻もプログラムから読み取りました（全件に時刻あり・タイムテーブルは不要）</span>'
          : ' <span class="small warn">プログラムの時刻：時刻あり ' + nT + '件／未確定 ' + (all.length - nT) + '件（タイムテーブルも入れてください）</span>';
        var nSec = sl.diag.length, W = sl.warnings;
        setStatus(sid, '✔ 「' + esc(file.name) + '」 ' + pages.length + 'ページ／' + sl.events.length + '種目・' + sl.entries.length + '人・リレー' + sl.relays.length + 'チーム<br><span class="fmt">' + fmtLabel + '</span>' + timeMsg +
          (W.length ? '<br><span class="warn">⚠ ' + nSec + 'か所中 ' + W.length + 'か所に読み取りの問題があります（「読み取りの確認」タブに一覧）</span>' : '<br><span class="small muted">' + nSec + 'か所の種目表を読み取り、問題は見つかりませんでした</span>') +
          (sl.multiDay ? '<br><span class="warn">⚠ 複数日（' + esc(sl.dates.join('・')) + '）の大会です。結果の上で「対象日」を選ぶまで、出場一覧は出しません。</span>' : ''), W.length || sl.multiDay ? 'ok warnst' : 'ok');
      } else if (kind === 'note') {
        var nt = MeetParser.parseNotes(pages);
        state.notes = nt; state.noteName = file.name;
        applyNotes(nt); render();
        var cf = RULES.filter(function (r) { return conflictOf(r.k); });
        var cfMsg = cf.length ? '<br><span class="warn">⚠ 手入力した招集ルールと注意事項の記載が違います（手入力の値を使っています）：' + cf.map(function (r) { return esc(r.label + ' 手入力 ' + ruleVal(r.k) + '／注意事項 ' + conflictOf(r.k)); }).join('、') + '</span>' : '';
        var feeOk = /^・/.test(feeMsg), feeNote = feeMsg && !feeOk ? '<br><span class="small">' + esc(feeMsg) + '</span>' : '';
        var ttMsg = nt.callInTT ? '<br><span class="small">招集時刻は「タイムテーブルに記載」の大会です。' + (ttCallCount() ? 'タイムテーブルの招集開始・完了の列（' + ttCallCount() + '種目分）を使います。' : '<span class="warn">タイムテーブルを入れると、その招集の列を使います（今は仮の「〇分前」で計算）。</span>') + '</span>' : '';
        var got = nt.track || nt.field || nt.relayOrder || nt.callInTT;
        setStatus(sid, got ? '✔ 「' + esc(file.name) + '」 招集ルール' + (feeOk ? feeMsg : '') + 'を読み取りました' + ttMsg + (nt.specific.length ? '<br><span class="warn">種目別のルール ' + nt.specific.length + '件は自動では当てはめていません（個別確認）</span>' : '') + cfMsg + feeNote : '△ 「' + esc(file.name) + '」 招集ルールが見つかりませんでした（手入力していない項目は仮の初期値に戻しました）' + cfMsg + feeNote, got ? (cf.length || (nt.callInTT && !ttCallCount()) ? 'ok warnst' : 'ok') : 'busy');
      } else {
        var tt = MeetParser.parseTimetable(pages);
        if (!tt.length) throw new Error('種目と時刻を見つけられませんでした');
        var tOk = tt.filter(function (g) { return g.time; }).length;
        if (!tOk) throw new Error('種目は見つかりましたが、時刻を1つも読み取れませんでした');
        state.tt = tt; state.ttName = file.name;
        var tds = ttDates();
        setStatus(sid, '✔ 「' + esc(file.name) + '」 ' + tt.length + '件の種目：時刻あり ' + tOk + '／未確定 ' + (tt.length - tOk) +
          (tds.length > 1 ? '<br><span class="warn">⚠ 複数日（' + esc(tds.join('・')) + '）のタイムテーブルです。結果の上で「対象日」を選ぶまで、出場一覧は出しません。</span>' : ''), tOk === tt.length && tds.length < 2 ? 'ok' : 'ok warnst');
      }
    } catch (e) {
      if (tok !== loadSeq[kind]) return;
      console.error(e);
      if (had) clearKind(kind);   // 入れ替えに失敗 → 前のファイルのデータは使わない（古い大会のまま出力しない）
      setStatus(sid, '✖ ' + esc(e.message || e) + (had ? '<br><b>前に読み込んだ「' + esc(had) + '」のデータは使わないようにしました。</b>もう一度ファイルを入れてください。' : '') + ' <small>（同じファイルをもう一度選び直せます）</small>', 'ng');
    }
    updateTeams(); render();
  }
  var RULES = [
    { k: 'track', label: 'トラック', ids: ['cT0', 'cT1'], def: '30〜20分前' },
    { k: 'field', label: 'フィールド', ids: ['cF0', 'cF1'], def: '40〜30分前' },
    { k: 'relay', label: 'リレー', ids: ['cR0', 'cR1'], def: 'トラックと同じ' },
    { k: 'dist', label: '長距離', ids: ['cD0', 'cD1'], def: 'トラックと同じ' },
    { k: 'place', label: '招集場所', ids: ['cPlace'], def: '未設定' },
    { k: 'relayOrder', label: 'リレーオーダー提出', ids: ['roMin', 'roBase'], def: '表示しない' }];
  var ruleState = {};   // k -> 'ok' | 'ng' | 'man' | 'na'
  var RULE_DEF = { cT0: '30', cT1: '20', cF0: '40', cF1: '30', cR0: '', cR1: '', cD0: '', cD1: '', cPlace: '', roMin: '', roBase: '招集完了' };
  function resetRules() { Object.keys(RULE_DEF).forEach(function (id) { $(id).value = RULE_DEF[id]; }); ruleState = {}; renderRuleMarks(); }
  function ruleVal(k) {
    var v = function (id) { return $(id).value; };
    if (k === 'track') return v('cT0') + '〜' + v('cT1') + '分前';
    if (k === 'field') return v('cF0') + '〜' + v('cF1') + '分前';
    if (k === 'relay') return v('cR0') ? v('cR0') + '〜' + v('cR1') + '分前' : 'トラックと同じ';
    if (k === 'dist') return v('cD0') ? v('cD0') + '〜' + v('cD1') + '分前' : 'トラックと同じ';
    if (k === 'place') return v('cPlace') || '未設定';
    if (k === 'relayOrder') return v('roMin') ? v('roBase') + 'の' + v('roMin') + '分前まで' : '表示しない';
  }
  function markOf(k) { var s = ruleState[k] || 'na'; return { ok: '〇', ng: '×', man: '手', na: '－' }[s]; }
  function ruleTitle(k) {
    var nt = state.notes, s = ruleState[k] || 'na';
    if (s === 'ok') return '競技注意事項の原文：' + nt.src[k];
    if (s === 'ng') return '競技注意事項に見つかりませんでした。仮の初期値（' + RULES.filter(function (r) { return r.k === k; })[0].def + '）を使っています。';
    if (s === 'man') return '手入力で変更しました' + (conflictOf(k) ? '（⚠ 競技注意事項の記載は「' + conflictOf(k) + '」で、手入力と違います。手入力の値を使っています）' : state.notes && !state.notes[k] ? '（今の競技注意事項には記載なし。手入力の値を使っています）' : '');
    return '競技注意事項は未読込です（仮の初期値）';
  }
  function renderRuleMarks() {
    document.querySelectorAll('.rs[data-rule]').forEach(function (el) {
      var k = el.dataset.rule, s = ruleState[k] || 'na';
      el.className = 'rs ' + s; el.textContent = markOf(k); el.title = ruleTitle(k);
    });
    var box = $('rulesBox'), loaded = !!state.notes;
    var auto = RULES.filter(function (r) { return ruleState[r.k] === 'ok'; }).length;
    var line = '<div class="rsum"><b>招集時刻：</b>' + (loaded ? '注意事項から自動設定 <span class="rs ok">〇</span>' + auto + '項目 ／ 仮の初期値・手入力 <span class="rs ng">×</span>' + (RULES.length - auto) + '項目' + (auto ? '' : '　<span class="warn">（この注意事項からは招集ルールを読み取れませんでした。仮の初期値です）</span>') : '競技注意事項が未読込のため仮の初期値（右の枠に入れると自動設定します）') + '</div>';
    var items = RULES.map(function (r) {
      var s = ruleState[r.k] || 'na', src = s === 'ok' ? state.notes.src[r.k] : '';
      return '<details class="rd"><summary><span class="rs ' + s + '">' + markOf(r.k) + '</span>' + r.label + '：<b>' + esc(ruleVal(r.k)) + '</b>' +
        (s === 'ng' ? ' <small class="muted">（見つからず仮の初期値' + (ttCallRows() && /^(track|field|relay|dist)$/.test(r.k) ? '。タイムテーブルに招集時刻が無い種目だけに使います' : '') + '）</small>' : s === 'man' ? ' <small class="muted">（手入力）</small>' + (conflictOf(r.k) ? ' <small class="warn">⚠ 注意事項では「' + esc(conflictOf(r.k)) + '」</small>' : '') : '') + '</summary>' +
        (src ? '<q>' + esc(src) + '</q>' : '<small class="muted">' + esc(ruleTitle(r.k)) + '</small>') + '</details>';
    }).join('');
    var cfl = RULES.filter(function (r) { return conflictOf(r.k); });
    if (cfl.length) line += '<div class="warn">⚠ 手入力した値と競技注意事項の記載が違う項目があります（手入力の値を使っています）：' + cfl.map(function (r) { return esc(r.label + '：手入力 ' + ruleVal(r.k) + '／注意事項 ' + conflictOf(r.k)); }).join('、') + '</div>';
    var spec = loaded && state.notes.specific && state.notes.specific.length ? '<div class="warn"><b>個別確認</b>（特定の種目だけのルール。全体には当てはめていません）：' + state.notes.specific.map(function (o) { return '<q>' + esc(o) + '</q>'; }).join('') + '</div>' : '';
    var others = loaded && state.notes.others.length ? '<div>その他「分前」の記載（自動では反映していません）：' + state.notes.others.map(function (o) { return '<q>' + esc(o) + '</q>'; }).join('') + '</div>' : '';
    box.innerHTML = line + ttCallHtml() + (loaded ? '<div class="small muted">各項目を押すと原文が出ます。値は「⚙ 設定」で変更できます。</div>' + items + spec + others : '');
    box.hidden = false;
    if ($('printRule')) $('printRule').textContent = ruleSummaryText();
  }
  // タイムテーブルの招集開始・完了の列を読み取れた種目の数
  function ttCallCount() { return state.tt ? state.tt.filter(function (s) { return s.callStart && s.callEnd; }).length : 0; }
  function ttCallRows() { return (state.rows || []).filter(function (r) { return r.callSrc === 'tt'; }).length; }
  // 招集時刻をタイムテーブルの列から取ったか（〇）、「〇分前」のルールで計算したか（×）
  function ttCallHtml() {
    var n = ttCallCount(), nt = state.notes, inTT = !!(nt && nt.callInTT), rows = state.rows || [];
    if (!n && !inTT) return '';
    var used = ttCallRows(), rule = rows.filter(function (r) { return r.callSrc === 'rule'; }).length;
    var ex = n ? state.tt.filter(function (s) { return s.callStart; })[0] : null;
    return '<details class="rd"><summary><span class="rs ' + (n ? 'ok' : 'ng') + '">' + (n ? '〇' : '×') + '</span>種目ごとの招集時刻：<b>' + (n ? 'タイムテーブルの招集の列' : '見つからず') + '</b>' +
      (n ? ' <small class="muted">（' + used + '件はタイムテーブルの時刻' + (rule ? '／' + rule + '件は時刻が合わないため「〇分前」のルールで計算' : '') + '）</small>' : ' <small class="warn">（注意事項では「タイムテーブルに記載」。' + (state.tt ? 'タイムテーブルに招集の列を読み取れなかったため、' : 'タイムテーブル未読込のため、') + '下の「〇分前」で計算しています）</small>') + '</summary>' +
      (inTT ? '<q>' + esc(nt.src.callTT) + '</q>' : '') + (ex ? '<small class="muted">タイムテーブルの例：' + esc(ex.raw) + '（招集 ' + esc(ex.callStart + '〜' + ex.callEnd) + '）</small>' : '') + '</details>';
  }
  function ruleSummaryText() {
    var ttc = ttCallRows();
    return (ttc ? '招集時刻：〇タイムテーブルの招集の列（' + ttc + '件）。そのほかは次のルールで計算　' : '') + '招集ルール：' + RULES.filter(function (r) { return r.k !== 'relayOrder' || $('roMin').value; }).map(function (r) { return markOf(r.k) + r.label + ' ' + ruleVal(r.k); }).join('　') +
      RULES.filter(function (r) { return conflictOf(r.k); }).map(function (r) { return '　⚠' + r.label + '：注意事項では' + conflictOf(r.k) + '（手入力を使用）'; }).join('') +
      '（〇＝自動抽出（未照合）、×＝見つからず仮の初期値、手＝手入力、－＝注意事項未読込）' + (state.notes && state.notes.specific && state.notes.specific.length ? '　※種目別ルールあり：個別確認' : '');
  }
  // 競技注意事項の記載を、設定欄と同じ書き方の文字にする
  function noteValStr(k, nt) {
    var v = nt && nt[k]; if (!v) return '';
    if (k === 'place') return String(v);
    if (k === 'relayOrder') return v.base + 'の' + v.minutes + '分前まで';
    return v[0] + '〜' + v[1] + '分前';
  }
  // 手入力した項目が、今の競技注意事項の記載と違うとき → 注意事項の値（違わなければ空）
  function conflictOf(k) {
    if (ruleState[k] !== 'man' || !state.notes || !state.notes[k]) return '';
    var nv = noteValStr(k, state.notes); return nv && nv !== ruleVal(k) ? nv : '';
  }
  function applyNotes(nt) {
    // 注意事項を入れ替えたとき：前の注意事項から自動で入れた値は、新しい注意事項の値（無ければ初期値）にする。
    // 手入力した値は、新しい注意事項に記載があっても上書きしない（「手」のまま。違うときは ⚠ で両方を表示）
    RULES.forEach(function (r) {
      if (ruleState[r.k] === 'man') return;
      if (!nt[r.k]) { r.ids.forEach(function (id) { $(id).value = RULE_DEF[id]; }); ruleState[r.k] = 'ng'; return; }
      var v = nt[r.k];
      if (r.k === 'place') $('cPlace').value = v;
      else if (r.k === 'relayOrder') { $('roMin').value = v.minutes; $('roBase').value = v.base; }
      else { $(r.ids[0]).value = v[0]; $(r.ids[1]).value = v[1]; }
      ruleState[r.k] = 'ok';
    });
    renderRuleMarks();
  }
  function fillMeta(pages, fname) {
    var m = MeetParser.guessMeta(pages);
    if (!m.name) { var f = (fname || '').match(/(?:令和\s*\d+\s*年度)?第\s*\d+\s*(?:回|支部)[^_.\s]+/) || (fname || '').match(/令和\s*\d+\s*年度[^_.\s]+大会/); if (f) m.name = f[0].replace(/\s+/g, ''); }

    if (m.name && (!$('meetName').value || $('meetName').dataset.auto)) { $('meetName').value = m.name; $('meetName').dataset.auto = '1'; }

  }
  /* ---------- 記録用紙 ---------- */
  function isWind(r) {
    if (r.typ === 'relay') return false;
    var d = nk(r.event).replace(/\s+/g, '');
    if (/走幅跳|三段跳/.test(d)) return true;
    var m = d.match(/(\d+)m(H|YH|JH)?(?![0-9])/); if (!m || /×|X|R$/.test(d)) return false;
    var n = +m[1]; return m[2] ? n <= 110 : (n === 100 || n === 200 || n === 60 || n === 50 || n === 80 || n === 150);
  }
  function nk(s) { return String(s || '').normalize('NFKC'); }
  // v0.16：表示・印刷・Excel用（本物の行＋「通過したら」の行）。共有・参加料・ナンバーカードは本物の行だけ
  function dispRows() { return (state.rows || []).concat(state.tent || []); }
  function shownName(r) { return r.tent ? MeetLogic.tentName(r) : (r.typ === 'relay' ? r.relayTeam : r.name); }
  function recRows() {
    return MeetLogic.byTime(dispRows()).map(function (r) {
      return { tent: !!r.tent, g: grpKey(r), start: r.start || '', event: r.event + (r.round ? ' ' + r.round : ''), heat: r.heat, pos: r.posLabel + ' ' + r.pos, bib: r.typ === 'relay' ? '' : r.bib,
        name: shownName(r), members: r.typ === 'relay' ? r.members.map(function (m) { return m.bib + ' ' + m.name; }).join('、') : '',
        grade: r.grade || '', team: r.team, wind: isWind(r), pb: pbOf(r) };
    });
  }
  function recHead() {
    return { title: ($('meetName').value || '（大会名）') + '　記録用紙', sub: [$('meetDate').value, state.teams.join('・')].filter(Boolean).join('　') };
  }
  /* ---------- 印刷レイアウト（白黒プリンター向け） ---------- */
  function printGroups() {
    var groups = [], cur = null;
    MeetLogic.byTime(dispRows()).forEach(function (r) {
      var g = grpKey(r);
      if (!cur || cur.key !== g) { cur = { tent: !!r.tent, key: g, start: r.start || '', call: r.call || '', event: r.event, round: r.round || '', rows: [], wind: isWind(r) }; groups.push(cur); }
      cur.rows.push(r);
    });
    // 長いまとまりは12行ずつに分け、2つ目以降は「（続き）」の見出しを付ける → ページをまたいでも種目・時刻がわかる
    var out = [];
    groups.forEach(function (g) {
      for (var i = 0; i < g.rows.length; i += PG_CHUNK) out.push(Object.assign({}, g, { rows: g.rows.slice(i, i + PG_CHUNK), total: g.rows.length, cont: i > 0 }));
    });
    return out;
  }
  var PG_CHUNK = 12;
  function band(kind, ncol) {
    var name = $('meetName').value || '（大会名）', date = $('meetDate').value || '';
    return '<tr class="pband"><th colspan="' + ncol + '"><div class="pb-in"><div class="pb-l">' + (typeof PRINT_ICON === 'string' && /^data:image\//.test(PRINT_ICON) ? '<img class="pb-icon" src="' + PRINT_ICON + '" alt="" onerror="this.remove()">' : '') + '<span class="pb-kind">' + esc(kind) + '</span><span class="pb-meet">' + esc(name) + '</span></div>' +
      '<div class="pb-r">' + (date ? '<span class="pb-date">' + esc(date) + '</span>' : '') + '<span class="pb-school">' + esc(state.teams.join('・')) + '</span></div></div><div class="pb-lanes"><i></i><i></i><i></i></div></th></tr>';
  }
  function grpBar(g, ncol, extra) {
    return '<tr class="pgh"><td colspan="' + ncol + '"><span class="g-time">' + esc(g.start || '時刻不明') + '</span>' +
      (g.call ? '<span class="g-call"><em>招集</em>' + esc(g.call) + '</span>' : '') + '<span class="g-ev">' + esc(g.event) + '</span>' +
      (g.round ? '<span class="g-rd">' + esc(g.round) + '</span>' : '') + (g.tent ? '<span class="g-tent">通過したら</span>' : '') + (g.cont ? '<span class="g-cont">（続き）</span>' : '') + '<span class="g-n">' + (g.total || g.rows.length) + (g.rows[0].typ === 'relay' ? 'チーム' : '名') + '</span>' + (extra || '') + '</td></tr>';
  }
  function nameHtml(r, multi) {
    return '<b>' + esc(shownName(r)) + '</b>' + (r.typ === 'relay' && !r.tent ? '<span class="p-mem">' + esc(r.members.map(function (m) { return m.bib + ' ' + m.name; }).join('、')) + '</span>' : '') +
      (multi && r.typ !== 'relay' ? '<span class="p-team">' + esc(r.team) + '</span>' : '');
  }
  function posHtml(r) { if (r.tent) return '<span class="p-pl">未定</span>'; return '<span class="p-pl">' + esc(r.posLabel) + '</span><b>' + esc(r.pos) + '</b>'; }
  function buildPrintTime() {
    var G = printGroups(), N = 7, multi = state.teams.length > 1;
    var info = '<tbody class="pinfo"><tr><td colspan="' + N + '"><div class="pi-box">' +
      '<div><em>出典</em><span>' + esc((state.sl.format === 'program' ? 'プログラム：' : 'スタートリスト：') + state.slName + (state.ttName ? '　タイムテーブル：' + state.ttName : '')) + '　<span class="pi-made">' + esc(new Date().toLocaleString('ja-JP')) + ' 作成</span></span></div>' +
      '<div><em>招集</em><span>' + esc(ruleSummaryText().replace(/^招集ルール：/, '')) + '</span></div>' +
      ($('feeInPrint').checked ? '<div><em>参加料</em><span>' + esc(feeData().map(function (f) { return f.team + ' ' + feeText(f); }).join('　')) + '</span></div>' : '') +
      '<div class="pi-disc">ⓘ 本ツールはPDFの文字を読み取って自動で整理しているだけです。内容は必ず元のスタートリスト・タイムテーブル等と照らし合わせ、最終的には目で確認してください。本ツールの利用により生じた不利益について、作成者は責任を負いかねます。</div></div></td></tr></tbody>';
    var body = G.map(function (g) {
      return '<tbody class="pg' + (g.cont ? ' cont' : '') + (g.tent ? ' tent' : '') + '">' + grpBar(g, N) + g.rows.map(function (r, ri) {
        var prevN = ri ? g.rows[ri - 1].note : '';
        var noteCell = (ri && prevN && r.note === prevN) ? '<span class="muted">〃</span>' : esc(r.note);
        return '<tr><td class="c">' + esc(r.heat) + '</td><td class="c p-pos">' + posHtml(r) + '</td><td class="c p-bib">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="p-name">' + nameHtml(r, false) +
          '</td><td class="c">' + esc(r.grade) + '</td><td class="p-tm">' + esc(r.team) + '</td><td class="p-note">' + noteCell + '</td></tr>';
      }).join('') + '</tbody>';
    }).join('');
    $('printTime').innerHTML = '<table class="ptab ptime"><colgroup><col style="width:5%"><col style="width:11%"><col style="width:8%"><col style="width:28%"><col style="width:6%"><col style="width:14%"><col style="width:28%"></colgroup><thead>' + band('出場一覧（時間順）', N) +
      '<tr class="pcols"><th>組</th><th>レーン/順番</th><th>ナンバー</th><th>氏名</th><th>学年</th><th>所属</th><th>備考</th></tr></thead>' + info + body + '</table>';
  }
  // v0.18：記録用紙の「自己ベスト」欄。記録のページがこの端末に置いた記録（ログイン中は lanenote-cache-<uid>、なしは lanenote-records）を読むだけ。
  // 読み込み始めの認証の世代と uid を覚えておき、終わったときに違えば捨てる（別のアカウントの記録を出さない）。電波がなくても端末の控えで動く
  var PBS = { sc: null, look: null };
  function pbReadDb(name) {
    return new Promise(function (ok) {
      if (typeof indexedDB === 'undefined' || !indexedDB || typeof ResultParser === 'undefined') { ok([]); return; }
      var q; try { q = indexedDB.open(name, 1); } catch (e) { ok([]); return; }
      q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' }); };
      q.onerror = function () { ok([]); };
      q.onsuccess = function () { var d = q.result; try { var g = d.transaction('records').objectStore('records').getAll(); g.onsuccess = function () { d.close(); ok(g.result || []); }; g.onerror = function () { d.close(); ok([]); }; } catch (e) { d.close(); ok([]); } };
    });
  }
  async function loadPBs() {
    if (CLOUD_OK && !FB) { try { await Promise.race([loadFirebase(), new Promise(function (_, ng) { setTimeout(function () { ng(new Error('timeout')); }, 4000); })]); } catch (e) { } }
    var sc = authScope(), recs = await pbReadDb(sc.uid ? 'lanenote-cache-' + sc.uid : 'lanenote-records');
    if (!authOk(sc)) return;
    PBS = { sc: sc, look: ResultParser.pbLookup(recs) };
  }
  function pbOf(r) {
    if (!PBS.look || !PBS.sc || !authOk(PBS.sc) || r.typ === 'relay' || !r.name) return null;
    return PBS.look({ name: r.name, team: r.team, event: r.event, grade: r.grade });
  }
  // v0.18.1：PB（公認ベスト・参考が良ければ小さく）と前回大会（いちばん新しい記録・日付と大会の短い名前）。空は「―」
  function lastShort(l) { var d = String(l.date || '').replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1/$2'), m = String(l.meet || ''); return (d + ' ' + (m.length > 8 ? m.slice(0, 8) + '…' : m)).trim(); }
  function lastBad(l) { return !ResultParser.markValue || !ResultParser.markValue(l.mark); }
  // v0.18.2：どのマスも見ただけで分かるように「2年」「PB 12.10」「前回 11.98（参考）」＋小さく「7/1 県大会」。参考の別行は出さない
  function gradeText(g) { g = String(g == null ? '' : g).trim(); return /^[0-9０-９]$/.test(g) ? g + '年' : g; }
  function lastRef(l) { return !lastBad(l) && ResultParser.isOfficial && !ResultParser.isOfficial(l); }
  function pbText(p) { if (!p || !p.best) return '―'; return 'PB ' + p.best.mark; }
  function lastText(p) { var l = p && p.last; if (!l) return '―'; return '前回 ' + (l.mark || '―') + (lastRef(l) ? '（参考）' : '') + (lastShort(l) ? '（' + lastShort(l) + '）' : ''); }
  function pbHtml(p) { if (!p || !p.best) return '<span class="p-none">―</span>'; return '<b class="p-pbv">PB ' + esc(p.best.mark) + '</b>'; }
  function lastHtml(p) { var l = p && p.last; if (!l) return '<span class="p-none">―</span>'; return '<b class="p-pbv' + (lastBad(l) ? ' p-bad' : '') + '">前回 ' + esc(l.mark || '―') + (lastRef(l) ? '<span class="p-ref">（参考）</span>' : '') + '</b><small class="p-pbr">' + esc(lastShort(l)) + '</small>'; }
  function buildRecSheet() {
    var G = printGroups(), N = 10, multi = state.teams.length > 1;
    var info = '<tbody class="pinfo"><tr><td colspan="' + N + '"><div class="pi-box pi-legend"><span class="pi-pb">PB＝これまでの公認ベスト　前回＝この種目のいちばん新しい記録（参考＝追い風参考など公認にならない記録）</span><span><i class="lg-h"></i>斜線の風欄＝風を測らない種目</span><span><i class="lg-w"></i>点線＝記入の目安</span><span class="pi-disc">ⓘ 本ツールはPDFの文字を読み取って自動で整理しているだけです。内容は必ず元のスタートリスト・タイムテーブル等と照らし合わせ、最終的には目で確認してください。本ツールの利用により生じた不利益について、作成者は責任を負いかねます。</span></div></td></tr></tbody>';
    var body = G.map(function (g) {
      return '<tbody class="pg' + (g.cont ? ' cont' : '') + (g.tent ? ' tent' : '') + '">' + grpBar(g, N, '<span class="g-wind">' + (g.wind ? '風 計測あり' : '風 なし') + '</span>') + g.rows.map(function (r) {
        var w = isWind(r);
        return '<tr class="rr"><td class="c">' + esc(r.heat) + '</td><td class="c p-pos">' + posHtml(r) + '</td><td class="c p-bib">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="p-name">' + nameHtml(r, multi) +
          '</td><td class="c p-gr">' + esc(gradeText(r.grade)) + '</td><td class="p-pb">' + pbHtml(pbOf(r)) + '</td><td class="p-pb">' + lastHtml(pbOf(r)) + '</td><td class="wc"><div class="wl"></div></td><td class="wc' + (w ? '' : ' nowind') + '">' + (w ? '<div class="wl"></div>' : '') + '</td><td class="wc"><div class="wl"></div></td></tr>';
      }).join('') + '</tbody>';
    }).join('');
    $('recSheet').innerHTML = '<table class="ptab prec"><colgroup><col style="width:4%"><col style="width:9%"><col style="width:7%"><col style="width:22%"><col style="width:5%"><col style="width:11%"><col style="width:13%"><col style="width:16%"><col style="width:7%"><col style="width:6%"></colgroup><thead>' + band('記録用紙', N) +
      '<tr class="pcols"><th>組</th><th>レーン</th><th>No.</th><th>氏名</th><th>学年</th><th>PB</th><th>前回</th><th>記録</th><th>風</th><th>順位</th></tr></thead>' + info + body + '</table>';
  }
  function printRec() {
    refreshPrint();
    if (!state.rows.length) { alert('学校を選んでから印刷してください。'); return; }
    buildRecSheet();
    document.body.classList.add('print-rec');
    var done = function () { document.body.classList.remove('print-rec'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  }
  // v0.17：出力は3つに分ける（👀 画面で見る＝印刷ダイアログなし／📄 PDF作成＝案内を出して印刷／🖨 印刷）
  var PDF_HINT = '保存先で『PDFに保存』を選んでください', DOCKIND = 'time', hintTimer = 0;
  function pdfHint(on) { var h = $('pdfHint'); h.textContent = on ? '📄 ' + PDF_HINT : ''; h.hidden = !on; clearTimeout(hintTimer); if (on) hintTimer = setTimeout(function () { h.hidden = true; }, 10000); }
  function docHtml(kind) {
    var css = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n').replace(/@media\s+print\s*\{/g, '@media all{');
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '\nbody{padding:6mm;background:#fff}#docView,#pdfHint{display:none!important}</style></head><body class="' + (kind === 'rec' ? 'print-rec' : '') + '"><main>' + $('printTime').outerHTML + $('recSheet').outerHTML + '</main></body></html>';
  }
  async function outDoc(kind, act) {
    if (kind === 'rec') { try { await loadPBs(); } catch (e) { } }
    if (kind === 'rec' && act === 'print') { pdfHint(false); printRec(); return; }
    refreshPrint();
    if (!state.rows.length) { alert('学校を選んで結果を出してから出力してください。'); return; }
    if (kind === 'rec') buildRecSheet();
    DOCKIND = kind;
    if (act === 'view') { pdfHint(false); $('docTitle').textContent = kind === 'rec' ? '📝 記録用紙' : '🕒 出場一覧（時間順）'; $('docFrame').srcdoc = docHtml(kind); $('docView').hidden = false; return; }
    if (act === 'pdf') { pdfHint(false); return pdfFile(docHtml(kind), (kind === 'rec' ? '記録用紙' : '時間順'), 9); }
    var go = function () { if (kind === 'rec') printRec(); else window.print(); };
    go();
  }
  // v0.23 PDF作成：印刷ダイアログを出さずに PDF ファイルを作って保存する
  function pdfName(kind) { return [$('meetName').value || '', state.teams.join('・')].filter(Boolean).join('_') + '_' + kind + '.pdf'; }
  function pdfFile(html, kind, margin, more) {
    if (typeof LanePdf === 'undefined') { alert('PDFを作る部品がありません。「🖨 印刷」から「PDFに保存」を選んでください。'); return; }
    var o = { html: html, filename: pdfName(kind), margin: margin, footer: 'LANE NOTE' }; for (var k in more || {}) o[k] = more[k];
    return LanePdf.make(o).catch(function (e) { console.error(e); });
  }
  function recAoa() {
    var h = recHead();
    var pg = null;
    return [[h.title], [h.sub], [], ['時刻', '種目', '組', 'レーン/順', 'ナンバー', '氏名', '学年', 'PB', '前回大会', '記録', '風', '順位']].concat(recRows().map(function (r) {
      var same = r.g === pg; pg = r.g;
      return [same ? '' : r.start, same ? '' : r.event + (r.tent ? '（通過したら）' : ''), r.tent ? '' : r.heat, r.tent ? '未定' : r.pos, r.bib, r.name + (r.members ? '（' + r.members + '）' : '') + (state.teams.length > 1 ? ' ' + r.team : ''), gradeText(r.grade), pbText(r.pb), lastText(r.pb), '', r.wind ? '' : '－', ''];
    }));
  }
  function recWs() {
    var ws = XLSX.utils.aoa_to_sheet(safeAoa(recAoa()));
    ws['!cols'] = [7, 20, 5, 10, 8, 26, 6, 16, 20, 12, 7, 6].map(function (w) { return { wch: w }; });
    var n = recAoa().length; ws['!rows'] = [];
    for (var i = 0; i < n; i++) ws['!rows'].push(i >= 4 ? { hpt: 30 } : {});
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } }];
    return ws;
  }
  async function exportRecXlsx() {
    try { await loadPBs(); } catch (e) { }
    if (!state.rows.length) { alert('学校を選んで結果を出してから保存してください。'); return; }
    if (typeof XLSX === 'undefined') { alert('Excel作成部品を読み込めませんでした。'); return; }
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, recWs(), '記録用紙');
    XLSX.writeFile(wb, state.teams.join('_') + '_記録用紙.xlsx');
  }
  /* ---------- 日付 ---------- */
  var SRC_BONUS = { yoko: 3, note: 2, tt: 1, sl: 0 }, SRC_NAME = { yoko: '大会要項', note: '競技注意事項', tt: 'タイムテーブル', sl: 'スタートリスト' };
  function updateDate() {
    var all = [];
    Object.keys(state.dateCands).forEach(function (k) { state.dateCands[k].forEach(function (c) { var o = Object.assign({}, c); o.score += SRC_BONUS[k] || 0; o.line = (o.fromName ? '' : SRC_NAME[k] + '：') + o.line; all.push(o); }); });
    var d = MeetParser.pickDate(all, new Date().getFullYear());
    state.date = d;
    if ($('meetDate').dataset.manual) { renderDateMark(); return; }
    $('meetDate').value = state.day ? dayLabel(state.day) : d ? d.label : '';
    renderDateMark();
  }
  function renderDateMark() {
    var m = $('dateMark'), d = state.date, man = $('meetDate').dataset.manual;
    var st = man ? 'man' : !d ? (Object.keys(state.dateCands).length ? 'ng' : 'na') : (d.yGuess || d.fromName || (d.alts && d.alts.length)) ? 'cand' : 'ok';
    m.className = 'rs ' + st; m.textContent = { ok: '〇', cand: '候補', ng: '×', man: '手', na: '－' }[st];
    var t = (st === 'ok' || st === 'cand') ? (d.fromName ? 'ファイル名から（PDFの本文には日付が見つかりませんでした）：' : 'PDFの原文：') + d.src + (d.yGuess ? '（年は書かれていないため今年と仮定）' : '')
      : st === 'ng' ? '読み込んだPDF・ファイル名から日付が見つかりませんでした。手で入力してください。' : st === 'man' ? '手入力' : 'PDF未読込';
    if (st === 'cand') t += '\n「候補」＝推測を含むので確認してください' + (d.alts && d.alts.length ? '（ほかの候補：' + d.alts.map(function (a) { return a.label; }).join('、') + '）' : '');
    m.title = t; $('dateSrc').textContent = (st === 'ok' || st === 'cand') ? (d.fromName ? '（ファイル名から）' : '（' + d.src.split('：')[0] + 'から）') : st === 'ng' ? '（見つからず）' : '';
    if (state.day && !man) { m.className = 'rs ok'; m.textContent = '〇'; m.title = '複数日の大会：「対象日」で選んだ日付です'; $('dateSrc').textContent = '（対象日）'; }
    var alt = $('dateAlt');
    if (alt) {
      var opts = d && !man && !state.day && d.alts && d.alts.length ? [d.label].concat(d.alts.map(function (a) { return a.label; })) : [];
      alt.hidden = !opts.length; alt.innerHTML = opts.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('');
    }
    var mw = $('multiDayWarn');
    if (mw) { var multi = (d && d.multiDay) || multiDates().length > 1; mw.hidden = !multi; mw.textContent = multi ? (multiDates().length > 1 ? '⚠ 複数日の大会です。対象日を選んで1日分ずつ出しています。日付を確認してください。' : '⚠ 複数日の大会のようです。本ツールは1日分の資料のみ対応です（時刻・日付は日ごとに確認してください）。') : ''; }
  }
  // 複数日：スタートリスト（プログラム）とタイムテーブルに書かれた日付
  function ttDates() { var a = []; (state.tt || []).forEach(function (s) { if (s.date && a.indexOf(s.date) < 0) a.push(s.date); }); return a; }
  function multiDates() {
    var a = ((state.sl && state.sl.dates) || []).slice();
    ttDates().forEach(function (d) { if (a.indexOf(d) < 0) a.push(d); });
    return a.sort(function (x, y) { var p = x.split('/'), q = y.split('/'); return (p[0] - q[0]) || (p[1] - q[1]); });
  }
  function dayLabel(md) {
    var p = md.split('/'), y = state.date && state.date.iso ? +state.date.iso.slice(0, 4) : new Date().getFullYear();
    return y + '年' + (+p[0]) + '月' + (+p[1]) + '日（' + '日月火水木金土'[new Date(y, p[0] - 1, p[1]).getDay()] + '）';
  }
  /* ---------- 参加料 ---------- */
  function applyFees(fp) {
    state.prices = {}; state.priceSrc = {}; state.progCopies = {};
    // 自動計算は「1種目あたり」と書かれているときだけ。「1人○円」は自動で入れない、単位が書かれていないものは「要確認」
    MeetLogic.CATS.forEach(function (c) {
      var p = fp.cats[c] || {}, iv = p.ind != null ? p.ind : null, is = iv != null ? (p.unit === 'event' ? 'ok' : 'chk') : 'ng';
      if (iv != null && p.unit === 'person') iv = null;
      state.prices[c] = { ind: iv, relay: p.relay != null ? p.relay : null }; state.priceSrc[c] = { ind: is, relay: p.relay != null ? 'ok' : 'ng' };
    });
    // 要項に区分の書き分けが無い（全員同じ金額）ときは、学年から区分がわからない選手にも同じ金額を使う
    if (fp.allCats) state.prices[MeetLogic.UNKNOWN] = { ind: fp.common, relay: fp.relay != null ? fp.relay : null };
    renderFeePrices();
  }
  function priceTitle(c, k) {
    var fp = state.feeParsed, s = (state.priceSrc[c] || {})[k] || 'na', u = fp && fp.cats[c] && fp.cats[c].unit;
    if (s === 'chk') return (u === 'person' ? '要項は「1人あたり」の金額です（' + fp.cats[c].ind + '円）。種目数で掛け算できないので自動計算していません。' : '要項に「1種目あたり」と書かれていないため、1種目あたりとして入れました。要確認。') + '\n原文：' + fp.src.join(' ／ ');
    return s === 'ok' ? '要項の原文：' + fp.src.join(' ／ ') : s === 'ng' ? '要項に見つかりませんでした（手で入力できます）' : s === 'man' ? '手入力' : '要項未読込';
  }
  function renderFeePrices() {
    var fp = state.feeParsed, mk = function (s, c, k) { return '<span class="rs ' + s + '" title="' + esc(priceTitle(c, k)) + '">' + { ok: '〇', chk: '要', ng: '×', man: '手', na: '－' }[s] + '</span>'; };
    $('feePrices').innerHTML = MeetLogic.CATS.map(function (c) {
      var p = state.prices[c] || {}, s = state.priceSrc[c] || { ind: 'na', relay: 'na' };
      return '<tr><td>' + c + '</td>' + ['ind', 'relay'].map(function (k) { return '<td>' + mk(s[k], c, k) + '<input type="number" min="0" max="100000" step="10" data-cat="' + c + '" data-k="' + k + '" value="' + (p[k] == null ? '' : p[k]) + '" placeholder="－"> 円</td>'; }).join('') + '</tr>';
    }).join('');
    $('feePrices').querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', function () {
      var c = inp.dataset.cat, k = inp.dataset.k, v = inp.value === '' ? null : Math.round(+inp.value);
      if (v != null && (isNaN(v) || v < 0)) { inp.classList.add('bad'); v = null; } else inp.classList.remove('bad');
      state.prices[c] = state.prices[c] || {}; state.prices[c][k] = v;
      state.priceSrc[c] = state.priceSrc[c] || {}; state.priceSrc[c][k] = 'man'; inp.previousElementSibling.className = 'rs man'; inp.previousElementSibling.textContent = '手'; renderFees();
    }); });
    var auto = 0, tot = 0; MeetLogic.CATS.forEach(function (c) { ['ind', 'relay'].forEach(function (k) { tot++; if ((state.priceSrc[c] || {})[k] === 'ok') auto++; }); });
    $('feeStatus').innerHTML = '<div class="rsum"><b>参加料：</b>' + (fp ? (Object.keys(fp.cats).length ? '要項から自動設定 <span class="rs ok">〇</span>' + auto + '項目 ／ 見つからず・手入力 <span class="rs ng">×</span>' + (tot - auto) + '項目' : '<span class="warn">読み込んだPDFから参加料を読み取れませんでした。下の表に単価を入れてください。</span>') : '大会要項が未読込です（上の「📑 大会要項」に入れると単価を自動設定します。手入力もできます）') + '</div>' +
      (fp && fp.src.length ? '<details class="rd"><summary>原文を見る</summary>' + fp.src.map(function (l) { return '<q>' + esc(l) + '</q>'; }).join('') + '</details>' : '') +
      (fp && fp.perPerson ? '<div class="warn small">※ 要項に「1人 ' + fp.perPerson + '円」とあります。1人あたりの料金は自動計算していません（要確認）。</div>' : '') +
      (MeetLogic.CATS.some(function (c) { return (state.priceSrc[c] || {}).ind === 'chk'; }) ? '<div class="warn small">※「要」＝単位（1種目あたり／1人あたり）がはっきりしないので要確認。</div>' : '') +
      (fp && fp.program ? '<div class="small muted">※ プログラム代 ' + fp.program + '円／部を学校ごとの合計に入れています（部数は下で変えられます）。</div>' : '') +
      (fp && fp.other.length ? '<div class="small muted">※ その他：' + esc(fp.other.join('、')) + '（合計に含めていません）</div>' : '');
  }
  function progDefaultQty() {
    var fp = state.feeParsed; return (fp && fp.program != null && fp.programQty > 0) ? fp.programQty : 1;
  }
  function progQty(team) {
    if (!state.feeParsed || state.feeParsed.program == null) return 0;
    var q = state.progCopies[team];
    return q != null ? q : progDefaultQty();
  }
  function feeData() {
    if (!state.sl) return [];
    // 複数日の大会でも参加料は大会全体の分（表示中の日だけで数えない）
    var F = MeetLogic.fees(state.allRows && state.allRows.length ? state.allRows : state.rows, state.teams, state.prices, { teamCat: state.teamCat || {} });
    var chk = MeetLogic.CATS.some(function (c) { return (state.priceSrc[c] || {}).ind === 'chk'; });
    var fp = state.feeParsed, unit = fp && fp.program != null ? fp.program : null;
    F.forEach(function (f) {
      f.unsure = chk && f.lines.some(function (l) { return (state.priceSrc[l.cat] || {}).ind === 'chk' && l.ind; });
      if (unit != null) {
        var q = progQty(f.team);
        f.program = { qty: q, unit: unit, sub: q * unit };
        f.total += f.program.sub;
      } else f.program = null;
    });
    return F;
  }
  // 単価が未設定・要確認のときは「合計」と言い切らない
  function totalText(f) {
    var prog = f.program && f.program.qty ? '（プログラム' + f.program.qty + '部を含む）' : '';
    return f.missing.length ? '合計未確定（設定済み分の小計 ' + yen(f.total) + '・未設定：' + f.missing.join('・') + '）' : f.unsure ? '合計 ' + yen(f.total) + prog + '（単価の単位 要確認）' : '合計' + prog + ' ' + yen(f.total);
  }
  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }
  function renderFees() {
    var F = feeData();
    $('feeArea').innerHTML = F.map(function (f) {
      var tc = (state.teamCat || {})[f.team] || '';
      var progRow = f.program ? '<tr class="feep"><td>プログラム代</td><td colspan="2"><label class="small">' +
        '<input type="number" class="progqty" min="0" max="99" step="1" data-team="' + esc(f.team) + '" value="' + f.program.qty + '" aria-label="プログラム部数"> 部 × ' + yen(f.program.unit) + '</label></td><td>' + yen(f.program.sub) + '</td></tr>' : '';
      return '<div class="cardbox ' + teamClass(f.team) + '"><h3>' + esc(f.team) + ' <label class="small">区分：<select class="teamcat" data-team="' + esc(f.team) + '">' + ['', '小学', '中学', '高校', '一般'].map(function (c) { return '<option value="' + c + '"' + (c === tc ? ' selected' : '') + '>' + (c || '自動（学年・種目名から）') + '</option>'; }).join('') + '</select></label></h3><table class="fee"><thead><tr><th>区分</th><th>個人</th><th>リレー</th><th>小計</th></tr></thead><tbody>' +
        f.lines.map(function (l) { var pr = function (n, p, u) { return n ? n + u + ' × ' + (p == null ? '<span class="warn">単価未設定</span>' : yen(p)) : '－'; };
          return '<tr><td>' + l.cat + '</td><td>' + pr(l.ind, l.indPrice, '種目') + '</td><td>' + pr(l.relay, l.relayPrice, 'チーム') + '</td><td>' + yen(l.sub) + '</td></tr>'; }).join('') +
        progRow +
        '</tbody></table><div class="feetot' + (f.missing.length || f.unsure ? ' unsure' : '') + '">' + esc(totalText(f)) + '</div>' +
        (multiDates().length > 1 ? '<div class="small muted">複数日の大会なので、全日程の出場分で計算しています。</div>' : '') +
        (f.lines.some(function (l) { return l.cat === MeetLogic.UNKNOWN; }) && state.feeParsed && state.feeParsed.allCats && state.prices[MeetLogic.UNKNOWN] ? '<div class="small muted">要項の参加料に区分（中学・高校など）の書き分けが無いため、全員同じ単価で計算しています。</div>' :
        f.lines.some(function (l) { return l.cat === MeetLogic.UNKNOWN; }) ? '<div class="warn small">「' + MeetLogic.UNKNOWN + '」は学年・種目名から中学／高校などを決められなかった分です。上の「区分」で学校の区分を選んでください。</div>' : '') + '</div>';
    }).join('');
    $('feeArea').querySelectorAll('select.teamcat').forEach(function (sel) { sel.addEventListener('change', function () { state.teamCat = state.teamCat || {}; state.teamCat[sel.dataset.team] = sel.value; renderFees(); refreshPrint(); }); });
    $('feeArea').querySelectorAll('input.progqty').forEach(function (inp) { inp.addEventListener('input', function () {
      var v = parseInt(inp.value, 10); if (isNaN(v) || v < 0) v = 0; if (v > 99) v = 99;
      state.progCopies = state.progCopies || {}; state.progCopies[inp.dataset.team] = v; renderFees(); refreshPrint();
    }); });
    var pf = $('printFee'); if (pf) pf.textContent = $('feeInPrint').checked ? '参加料：' + F.map(function (f) { return f.team + ' ' + feeText(f); }).join('　') : '';
  }
  function feeText(f) {
    var body = f.lines.map(function (l) { return l.cat + (l.ind ? ' 個人' + l.ind + '種目×' + (l.indPrice == null ? '?' : l.indPrice) : '') + (l.relay ? ' リレー' + l.relay + 'チーム×' + (l.relayPrice == null ? '?' : l.relayPrice) : ''); }).join('、');
    if (f.program) body += (body ? '、' : '') + 'プログラム' + f.program.qty + '部×' + f.program.unit;
    return body + ' ＝ ' + totalText(f);
  }
  /* ---------- 選手別の並べ替え ---------- */
  function athSorted(rows) {
    var s = state.athSort; if (!s) return MeetLogic.byAthlete(rows);
    var dir = s.dir, num = function (v) { var n = parseInt(v, 10); return isNaN(n) ? 1e9 : n; };
    var key = {
      bib: function (r) { return num(r.bib); }, grade: function (r) { return nkS(r.grade); }, event: function (r) { return nkS(r.event) + ' ' + (r.round || ''); },
      time: function (r) { return r.startMin == null ? 1e9 : r.startMin; }, heat: function (r) { return num(r.heat); }, pos: function (r) { return num(r.pos); },
      name: function (r) { return nkS(r.kana || r.name); } }[s.key];
    return rows.slice().sort(function (a, b) {
      if (s.key !== 'time') { var rr = (a.typ === 'relay') - (b.typ === 'relay'); if (rr) return rr; }
      var x = key(a), y = key(b), c = typeof x === 'number' ? x - y : x.localeCompare(y, 'ja');
      return c * dir || (num(a.bib) - num(b.bib)) || ((a.startMin || 0) - (b.startMin || 0));
    });
  }
  function nkS(s) { return String(s || '').normalize('NFKC'); }
  function renderAthHead() {
    document.querySelectorAll('#athHead th[data-sort]').forEach(function (th) {
      var s = state.athSort, on = s && s.key === th.dataset.sort;
      th.innerHTML = th.textContent.replace(/[▲▼]/g, '') + (on ? '<span class="ar">' + (s.dir > 0 ? '▲' : '▼') + '</span>' : '');
    });
    var hasKana = state.rows.some(function (r) { return r.kana; });
    $('kanaNote').textContent = hasKana ? '氏名は「よみ（フリガナ）」の五十音順です。' : 'このPDFにはフリガナが無いため、氏名は漢字の文字コード順です（五十音順ではありません）。';
  }
  function setupDrop(zoneId, inputId, kind) {
    var z = $(zoneId), inp = $(inputId);
    z.addEventListener('click', function (e) { if (e.target !== inp) inp.click(); });
    z.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', function () { var f = inp.files[0]; inp.value = ''; handleFile(kind, f); });   // value を空に → 同じファイルを選び直せる
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('drag'); }); });
    z.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) { handleFile(kind, f); return; } var u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || ''; if (isUrlOnly(u)) showUrlNote(u, kind); });
  }
  function settings() {
    // 整数・0〜999 の範囲だけ受け付ける。おかしな値は初期値を使い、入力欄を赤くする
    var n = function (id, d, max) {
      var el = $(id), raw = el.value.trim(), v = Number(raw), bad = raw !== '' && (!/^\d+$/.test(raw) || v > (max || 999));
      el.classList.toggle('bad', bad);
      return raw === '' || bad ? d : v;
    };
    [['cT0', 'cT1'], ['cF0', 'cF1'], ['cR0', 'cR1'], ['cD0', 'cD1']].forEach(function (p) {
      var a = $(p[0]).value, b = $(p[1]).value, ok = a === '' || b === '' || +a > +b;
      $(p[1]).classList.toggle('bad', !ok); $(p[1]).title = ok ? '' : '招集完了は招集開始より後（小さい「分前」）にしてください';
    });
    return {
      callTrack: [n('cT0', 30), n('cT1', 20)], callField: [n('cF0', 40), n('cF1', 30)],
      timeSource: $('timeSrc') ? $('timeSrc').value : 'program',
      ordThreshold: n('ordTh', 3000, 100000), relayKoshi: $('relayKoshi').checked,
      bibCopies: Math.min(10, Math.max(1, n('bibCopies', 2))), ordCopies: Math.min(10, Math.max(1, n('ordCopies', 2))),
      relayOrderMin: n('roMin', 0), relayOrderBase: $('roBase').value,
      callRelay: $('cR0').value !== '' ? [n('cR0', 30), n('cR1', 20)] : null,
      callDist: $('cD0').value !== '' ? [n('cD0', 30), n('cD1', 20)] : null, callPlace: $('cPlace').value,
      relayOrderFirst: ruleState.relayOrder === 'ok' && !!(state.notes && state.notes.relayOrder && state.notes.relayOrder.first)
    };
  }
  function updateTeams() {
    var box = $('teamList');
    if (!state.sl) { box.innerHTML = '<span class="muted">先にスタートリストを入れてください</span>'; return; }
    var q = $('school').value.trim();
    if (!q) { box.innerHTML = '<span class="muted">学校・クラブ名（一部でOK）を入れると候補が出ます</span>'; state.teams = []; return; }
    var found = MeetLogic.findTeams(state.sl, q);
    var prev = new Set(state.teams);
    var counts = {};
    var tmp = MeetLogic.build(state.sl, [], found, settings());
    tmp.forEach(function (r) { counts[r.team] = (counts[r.team] || 0) + 1; });
    if (!found.length) { box.innerHTML = '<span class="warn">「' + esc(q) + '」を含む所属が見つかりません</span>'; state.teams = []; return; }
    var keep = found.filter(function (t) { return prev.has(t); });
    // 候補が1校だけなら自動で選ぶ。複数あるときは勝手に全部選ばない（自分で選ぶ）
    if (box.dataset.q !== q) keep = found.length === 1 ? found.slice() : found.filter(function (t) { return prev.has(t); });
    box.dataset.q = q;
    box.innerHTML = found.map(function (t) {
      return '<label class="chip"><input type="checkbox" value="' + esc(t) + '"' + (keep.indexOf(t) >= 0 ? ' checked' : '') + '> ' + esc(t) + ' <small>(' + (counts[t] || 0) + '件)</small></label>';
    }).join('');
    state.teams = keep;
    box.insertAdjacentHTML('beforeend', '<div class="selcount small" id="selCount"></div>');
    var sc = function () { $('selCount').innerHTML = state.teams.length ? '<b>' + state.teams.length + '校を選択中</b>' : (found.length > 1 ? '<span class="warn">候補が' + found.length + '校あります。出場一覧を作る学校にチェックを入れてください。</span>' : ''); };
    sc();
    box.querySelectorAll('input').forEach(function (cb) { cb.addEventListener('change', function () {
      state.teams = Array.from(box.querySelectorAll('input:checked')).map(function (c) { return c.value; }); sc(); render();
    }); });
  }
  function posCell(r) { if (r.tent) return '<span class="pl">未定</span>'; return '<span class="pl">' + esc(r.posLabel) + '</span> <b>' + esc(r.pos) + '</b>'; }
  function nameCell(r) {
    if (r.tent) return '<span class="tentnm">' + esc(MeetLogic.tentName(r)) + '</span>';
    if (r.typ !== 'relay') return esc(r.name);
    return '<b>' + esc(r.relayTeam) + '</b><br><small>' + r.members.map(function (m) { return esc(m.bib + ' ' + m.name); }).join('、') + '</small>';
  }
  function teamClass(t) { var i = state.teams.indexOf(t); return 'tm' + (i % 4); }
  function render() {
    ssSave();
    var res = $('results');
    if (!state.sl || !state.teams.length) { res.hidden = true; state.rows = []; state.allRows = []; state.tent = []; refreshPrint(); return; }
    requestAnimationFrame(function () { var tb = document.querySelector('.tabbar'); if (tb) document.documentElement.style.setProperty('--tabh', tb.offsetHeight + 'px'); });
    var S = settings();
    // 複数日の大会：対象日を選ぶまでは出場一覧・印刷・Excel・共有を出さない
    var MD = multiDates(), dp = $('dayPick'), ds = $('daySel');
    if (MD.indexOf(state.day) < 0) state.day = '';
    dp.hidden = MD.length < 2;
    if (MD.length > 1) {
      var opts = '<option value="">（対象日を選んでください）</option>' + MD.map(function (d) { return '<option value="' + esc(d) + '"' + (d === state.day ? ' selected' : '') + '>' + esc(dayLabel(d)) + '</option>'; }).join('');
      if (ds.dataset.opts !== opts) { ds.innerHTML = opts; ds.dataset.opts = opts; }
      ds.value = state.day;
      $('dayPickMsg').textContent = '⚠ 複数日（' + MD.map(function (d) { return d.replace('/', '月') + '日'; }).join('・') + '）の資料です。日付ごとに照合するので、対象日を選んでください。' + (state.day ? '' : '選ぶまで出場一覧は出しません。');
    }
    res.hidden = false;
    res.classList.toggle('needday', MD.length > 1 && !state.day);
    if (MD.length > 1 && !state.day) { state.rows = []; state.allRows = []; state.tent = []; $('summary').innerHTML = ''; refreshPrint(); return; }
    // 全日程分（参加料・ナンバーカード用）。対象日で絞る前に全TTで作る
    state.allRows = MeetLogic.build(state.sl, state.tt, state.teams, S);
    var slNoDate = MD.length > 1 && state.tt && !state.sl.entries.concat(state.sl.relays).some(function (e) { return e.date; });
    if (slNoDate) {
      var hits = MD.map(function (d) { return MeetLogic.build(state.sl, state.tt.filter(function (s) { return !s.date || s.date === d; }), state.teams, S).map(function (r) { return r.ttHit; }); });
      state.allRows.forEach(function (r, i) {
        var ds = MD.filter(function (d, k) { return hits[k][i]; });
        if (ds.length === 1) r.date = ds[0];
        else if (ds.length > 1) r.note = (r.note ? r.note + '／' : '') + '⚠ タイムテーブルの' + ds.join('・') + 'のどちらにもある種目（日付を要確認）';
      });
    }
    // 表示用：対象日のTTだけでもう一度照合（その日の時刻を正確に）
    var ttUse = state.tt && state.day ? state.tt.filter(function (s) { return !s.date || s.date === state.day; }) : state.tt;
    state.rows = (state.day ? MeetLogic.build(state.sl, ttUse, state.teams, S) : state.allRows.slice());
    if (state.day && slNoDate) {
      // allRows で付けた日付を表示用 rows にも引き継ぐ
      var byKey = {};
      state.allRows.forEach(function (r) { byKey[(r.typ === 'relay' ? 'R|' + r.relayTeam : 'I|' + r.bib) + '|' + r.event + '|' + (r.round || '')] = r.date; });
      state.rows.forEach(function (r) {
        var k = (r.typ === 'relay' ? 'R|' + r.relayTeam : 'I|' + r.bib) + '|' + r.event + '|' + (r.round || '');
        if (!r.date && byKey[k]) r.date = byKey[k];
      });
    }
    if (state.day) state.rows = state.rows.filter(function (r) { return !r.date || r.date === state.day; }).map(function (r) {
      if (!r.date && MD.length > 1 && !/日付を要確認/.test(r.note)) r.note = (r.note ? r.note + '／' : '') + '⚠ 日付不明（' + dayLabel(state.day) + 'の出場か要確認）';
      return r;
    });
    state.tent = MeetLogic.tentative(state.rows, ttUse, state.sl, S).filter(function (t) { return !state.day || !t.date || t.date === state.day; });
    var rows = state.rows;
    var nInd = rows.filter(function (r) { return r.typ !== 'relay'; }).length, nRel = rows.length - nInd;
    var noTime = rows.filter(function (r) { return !r.start; }).length;
    $('summary').innerHTML = state.teams.map(function (t) {
      var R = rows.filter(function (r) { return r.team === t; });
      var ppl = new Set(R.filter(function (r) { return r.typ !== 'relay'; }).map(function (r) { return r.bib; })).size;
      var evs = {}; R.forEach(function (r) { var k = r.event; evs[k] = (evs[k] || 0) + 1; });
      return '<div class="card ' + teamClass(t) + '"><div class="ct">' + esc(t) + '</div><div>' + ppl + '人・' + R.filter(function (r) { return r.typ !== 'relay'; }).length + '種目エントリー' +
        (R.some(function (r) { return r.typ === 'relay'; }) ? '・リレー' + R.filter(function (r) { return r.typ === 'relay'; }).length + 'チーム' : '') + '</div><small>' +
        Object.keys(evs).map(function (k) { return esc(k) + ' ' + evs[k]; }).join(' ／ ') + '</small></div>';
    }).join('') + (state.tt || state.sl.hasTimes ? '' : '<p class="warn">タイムテーブルが未読込なので、時刻・招集は空欄です。</p>') +
      ((state.tt || state.sl.hasTimes) && noTime ? '<p class="warn">' + noTime + '件は時刻が未確定です（タイムテーブルに無い・候補が複数など。備考を確認）。招集時刻も空欄にしています。</p>' : '') +
      (rows.some(function (r) { return r.conflict; }) ? '<p class="warn">⚠ ' + rows.filter(function (r) { return r.conflict; }).length + '件で、プログラムとタイムテーブルの時刻が違います（備考に両方の時刻）。どちらを使うかは「⚙ 設定」の「時刻の優先」で選べます。新しい方の資料を確認してください。</p>' : '') +
      (state.day ? '<p class="warn">⚠ 複数日の大会です。' + esc(dayLabel(state.day)) + 'の分だけを表示しています（ほかの日は「対象日」を変えてください）。</p>' : '') +
      (RULES.some(function (r) { return conflictOf(r.k); }) ? '<p class="warn">⚠ 手入力した招集ルールが競技注意事項の記載と違います（手入力の値で招集時刻を出しています）：' + RULES.filter(function (r) { return conflictOf(r.k); }).map(function (r) { return esc(r.label + ' 手入力 ' + ruleVal(r.k) + '／注意事項 ' + conflictOf(r.k)); }).join('、') + '</p>' : '') +
      (state.sl.warnings.length ? '<p class="warn">⚠ スタートリストの読み取りで問題が ' + state.sl.warnings.length + 'か所あります（「読み取りの確認」タブ）。</p>' : '');

    // 時間順
    var bt = MeetLogic.byTime(dispRows()), prev = null, prevNote = null, html = [];
    bt.forEach(function (r, i) {
      var g = grpKey(r), first = prev !== g;
      html.push('<tr class="' + teamClass(r.team) + (first && i ? ' gsep' : first ? '' : ' gcont') + (r.tent ? ' tent' : '') + '"><td class="t">' + (first ? esc(r.start || '時刻不明') : '') + '</td><td class="nw">' + (first ? esc(r.call) : '') +
        '</td><td class="nw">' + (first ? esc(r.event) + (r.round ? ' <small class="pl">' + esc(r.round) + '</small>' : '') + (r.tent ? ' <small class="tentlab">通過したら</small>' : '') : '') + '</td><td class="c">' + esc(r.heat) + '</td><td class="c nw">' + posCell(r) +
        '</td><td class="c">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="nm">' + nameCell(r) + '</td><td class="c">' + esc(r.grade) + '</td><td class="nw">' + esc(r.team) + '</td><td class="note">' + (!first && prevNote && r.note === prevNote ? '<span class="muted">〃</span>' : esc(r.note)) + '</td></tr>');
      prev = g; prevNote = r.note;
    });
    $('timeBody').innerHTML = html.join('');
    var sr = bt.map(function (r) { var o = rowObj(shareRow(r)); if (r.tent) { o.tent = true; o.name = MeetLogic.tentName(r); o.members = ''; } return o; });
    $('timeCards').innerHTML = cardsTimeHtml(sr); $('athCards').innerHTML = cardsAthHtml(sr);
    renderFeePrices();
    refreshPrint();

    // 選手別
    var ba = athSorted(dispRows()); renderAthHead();
    $('athBody').innerHTML = ba.map(function (r) {
      return '<tr class="' + teamClass(r.team) + (r.tent ? ' tent' : '') + '"><td class="nw">' + esc(r.team) + '</td><td class="c">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="nm">' + nameCell(r) + '</td><td class="c">' + esc(r.grade) +
        '</td><td class="nw">' + esc(r.event) + '</td><td class="nw">' + esc(r.round) + (r.tent ? ' <small class="tentlab">通過したら</small>' : '') + '</td><td class="c">' + esc(r.heat) + '</td><td class="c nw">' + posCell(r) + '</td><td class="nw">' + esc(r.call) + '</td><td class="c">' + esc(r.start) + '</td><td class="note">' + esc(r.note) + '</td></tr>';
    }).join('');

    // ナンバーカード
    var cardNote = (multiDates().length > 1 ? '<p class="small muted">複数日の大会は、全日程の出場者で数えています。</p>' : '');
    $('cardsArea').innerHTML = cardNote + state.teams.map(function (t, i) {
      var cRows = cardRows(), c = MeetLogic.cards(cRows, t, S), P = cardPlan(t, c, S);
      var hasField = cRows.some(function (r) { return r.team === t && r.typ === 'field'; });
      var grid = function (kind, list) {
        return '<div class="mkgrid">' + list.map(function (o) {
          return '<label class="mk' + (o.make !== o.need ? ' chg' : '') + '"><span class="mk-n">' + esc(o.num) + '</span><span class="mk-need">必要 ' + o.need + '</span>' +
            '<input type="number" min="0" max="99" step="1" value="' + o.make + '" data-team="' + i + '" data-kind="' + kind + '" data-num="' + esc(o.num) + '" data-need="' + o.need + '" aria-label="' + esc(o.num) + '番の作る枚数">枚</label>';
        }).join('') + '</div>';
      };
      var sec = function (kind, label, list, perPage, btn, note) {
        return '<div class="cline mkline"><div class="lab">' + label + '</div><div>' + (list.length ? '<div class="mktot" id="mktot_' + i + '_' + kind + '"></div>' + grid(kind, list) : 'なし') + (note || '') + '</div>' +
          '<button class="btn" data-dl="' + kind + '" data-team="' + i + '"' + (list.length ? '' : ' disabled') + '>' + btn + '</button></div>';
      };
      return '<div class="cardbox ' + teamClass(t) + '"><h3>' + esc(t) + ' <button class="btn sub mkreset" data-team="' + i + '">必要枚数に戻す</button></h3>' +
        '<p class="small muted">「作る」の数は在庫に合わせて変えられます（0＝作らない）。Wordファイルはこの数で作ります。</p>' +
        sec('koshi', '腰番（1人1枚' + (S.relayKoshi ? '・リレーは1チーム1枚' : '') + '）', P.koshi, 2, '腰番.docx', '') +
        sec('mune', 'ゼッケン（胸・背中 1人' + S.bibCopies + '枚）', P.mune, 1, 'ゼッケン.docx', '') +
        sec('ord', 'オーダー番号ビブス（' + S.ordThreshold + 'm以上・1人' + S.ordCopies + '枚）', P.ord, 1, 'オーダー番号.docx', '') +
        (hasField ? '<p class="muted small">フィールド種目は腰番の枚数に入れていません。</p>' : '') + '</div>';
    }).join('');
    $('cardsArea').querySelectorAll('button[data-dl]').forEach(function (b) { b.addEventListener('click', function () { downloadCards(b.dataset.dl, state.teams[+b.dataset.team], b); }); });
    $('cardsArea').querySelectorAll('.mkgrid input').forEach(function (inp) { inp.addEventListener('input', function () {
      var t = state.teams[+inp.dataset.team], v = parseInt(inp.value, 10), bad = !/^\d*$/.test(inp.value.trim()) || v > 99;
      if (isNaN(v) || v < 0) v = 0; if (v > 99) v = 99; inp.classList.toggle('bad', bad);
      state.make[t + '|' + inp.dataset.kind + '|' + inp.dataset.num] = v;
      inp.parentElement.classList.toggle('chg', v !== +inp.dataset.need);
      updateMkTotals(+inp.dataset.team);
    }); });
    $('cardsArea').querySelectorAll('.mkreset').forEach(function (b) { b.addEventListener('click', function () {
      var t = state.teams[+b.dataset.team]; Object.keys(state.make).forEach(function (k) { if (k.indexOf(t + '|') === 0) delete state.make[k]; }); render();
    }); });
    state.teams.forEach(function (t, i) { updateMkTotals(i); });

    // 照合の確認
    var evs = {}, pgs = {};
    // 同じ種目の同じ内容（時刻＋備考）は1回だけ。組の数だけ同じ警告を繰り返さない
    rows.forEach(function (r) { var k = r.event + (r.round ? '（' + r.round + '）' : ''); (evs[k] = evs[k] || new Set()).add((r.start || '?') + (r.note ? ' ' + r.note : '')); (pgs[k] = pgs[k] || new Set()).add(r.page); });
    var W = state.sl.warnings || [];
    // 警告を先に、そのあと種目ごとの照合（元PDFのページ番号つき）
    $('checkList').innerHTML = W.map(function (w) { return '<li class="warn">⚠ ' + (state.sl.format === 'program' ? 'プログラム' : 'スタートリスト') + ' p.' + w.page + '「' + esc(w.title || '（見出しなし）') + '」：' + esc(w.warn.join('・')) + '（読み取れた ' + w.count + '件）</li>'; }).join('') +
      Object.keys(evs).sort(function (a, b) { var wa = /要確認|未確定|⚠/.test(Array.from(evs[a]).join('')), wb = /要確認|未確定|⚠/.test(Array.from(evs[b]).join('')); return wb - wa; }).map(function (k) {
        var txt = Array.from(evs[k]).join(' ／ '), bad = /要確認|未確定|⚠|^\?/.test(txt);
        return '<li' + (bad ? ' class="warn"' : '') + '>' + esc(k) + ' <small class="muted">（p.' + Array.from(pgs[k]).sort(function (a, b) { return a - b; }).join(', p.') + '）</small> → ' + esc(txt) + '</li>'; }).join('') +
      '<li class="muted small">読み取った種目表：' + state.sl.diag.length + 'か所（' + state.sl.diag.filter(function (d) { return d.info; }).length + 'か所は空欄の表）</li>';
  }

  // 印刷用HTMLを今の入力内容（大会名・日付・参加料・招集）で作り直す。印刷ボタン・beforeprint の直前にも呼ぶ
  function refreshPrint() {
    if (!state.sl || !state.teams.length || !state.rows.length) { $('printTime').innerHTML = ''; $('recSheet').innerHTML = ''; return; }
    renderRuleMarks(); renderDateMark();
    $('printTitle').textContent = ($('meetName').value ? $('meetName').value + '　' : '') + ($('meetDate').value ? $('meetDate').value + '　' : '') + '出場一覧（時間順）　' + state.teams.join('・');
    $('printSub').textContent = (state.sl.format === 'program' ? 'プログラム: ' : 'スタートリスト: ') + state.slName + (state.ttName ? '　タイムテーブル: ' + state.ttName : '') + '　（' + new Date().toLocaleString('ja-JP') + ' 作成）';
    $('printRule').textContent = ruleSummaryText();
    renderFees();
    try { buildPrintTime(); } catch (e) { console.error(e); }
  }
  function grpKey(r) { return (r.start || '?') + '|' + r.event + '|' + (r.round || ''); }
  function b64ToBytes(b64) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function saveBlob(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  var MK_PER_PAGE = { koshi: 2, mune: 1, ord: 1 };
  // ナンバーカードは大会を通して同じものを使う → 対象日に関係なく全日程の出場者で数える
  function cardRows() { return (state.allRows && state.allRows.length) ? state.allRows : state.rows; }
  function cardPlan(team, c, S) {
    var mk = function (kind, num, need) { var k = team + '|' + kind + '|' + num; return { num: String(num), need: need, make: state.make[k] != null ? state.make[k] : need }; };
    return {
      koshi: Object.keys(c.koshi).sort(function (a, b) { return a - b; }).map(function (k) { return mk('koshi', k, c.koshi[k]); }),
      mune: c.bibs.map(function (b) { return mk('mune', b, S.bibCopies); }),
      ord: c.ord.map(function (n) { return mk('ord', n, S.ordCopies); })
    };
  }
  function updateMkTotals(i) {
    var t = state.teams[i], S = settings(), P = cardPlan(t, MeetLogic.cards(cardRows(), t, S), S);
    ['koshi', 'mune', 'ord'].forEach(function (k) {
      var el = $('mktot_' + i + '_' + k); if (!el) return;
      var need = P[k].reduce(function (s, o) { return s + o.need; }, 0), make = P[k].reduce(function (s, o) { return s + o.make; }, 0);
      var pages = Math.ceil(make / MK_PER_PAGE[k]);
      el.innerHTML = '必要 <b>' + need + '枚</b> ／ 作成 <b class="' + (make !== need ? 'mkdiff' : '') + '">' + make + '枚</b> ／ 印刷 <b>' + pages + 'ページ</b>' + (k === 'koshi' ? '<small>（1ページに2枚・半分に切る）</small>' : '');
      var b = document.querySelector('button[data-dl="' + k + '"][data-team="' + i + '"]'); if (b) b.disabled = !make;
    });
  }
  async function downloadCards(kind, team, btn) {
    if (typeof JSZip === 'undefined') { alert('docx作成部品(JSZip)を読み込めませんでした。インターネット接続を確認してください。'); return; }
    var S = settings(), c = MeetLogic.cards(cardRows(), team, S), r;
    var old = btn.textContent; btn.textContent = '作成中…'; btn.disabled = true;
    try {
      var plan = cardPlan(team, c, S)[kind], changed = plan.some(function (o) { return o.make !== o.need; });
      var seq = []; plan.forEach(function (o) { for (var q = 0; q < o.make; q++) seq.push(o.num); });
      if (!seq.length) throw new Error('作る枚数がすべて0です');
      var made = plan.filter(function (o) { return o.make > 0; }).map(function (o) { return o.num; });
      if (kind === 'mune') r = changed ? await Zekken.makeDocx(JSZip, b64ToBytes(ZEKKEN_TEMPLATES.mune), 'mune', seq, 1) : await Zekken.makeDocx(JSZip, b64ToBytes(ZEKKEN_TEMPLATES.mune), 'mune', c.bibs, S.bibCopies);
      else if (kind === 'koshi') r = await Zekken.makeDocx(JSZip, b64ToBytes(ZEKKEN_TEMPLATES.koshi), 'koshi', changed ? seq : c.koshiList.map(String), 1);
      else { r = changed ? await Zekken.makeDocx(JSZip, b64ToBytes(ZEKKEN_TEMPLATES.mune), 'mune', seq, 1) : await Zekken.makeDocx(JSZip, b64ToBytes(ZEKKEN_TEMPLATES.mune), 'mune', c.ord.map(String), S.ordCopies); r.name = r.name.replace(/^ゼッケン_/, 'オーダー番号_'); }
      if (changed) r.name = r.name.replace(/^(ゼッケン|腰番|オーダー番号)_.*\.docx$/, function (m0, lab) { return lab + '_' + Zekken.outName(kind === 'koshi' ? 'koshi' : 'mune', made, 1).replace(/^[^_]+_/, '') + '_計' + seq.length + '枚_調整済.docx'; });
      var name = team + '_' + r.name;
      saveBlob(r.data, name);
      $('dlMsg').textContent = '「' + name + '」を作りました（' + r.pages + 'ページ）' + (r.report.length ? '。' + r.report.join('／') : '');
    } catch (e) { console.error(e); alert('作成に失敗しました: ' + e.message); }
    btn.textContent = old; btn.disabled = false;
  }

  function tableData(kind, grouped) {
    var rows = dispRows();
    var nmX = function (r) { return r.tent ? MeetLogic.tentName(r) : r.typ === 'relay' ? r.relayTeam + '（' + r.members.map(function (m) { return m.name; }).join('・') + '）' : r.name; };
    var rdX = function (r) { return (r.round || '') + (r.tent ? '（通過したら）' : ''); };
    if (kind === 'time') {
      var pg = null;
      return [['競技開始', '招集', '種目', 'ラウンド', '組', '区分', 'レーン/順番', 'ナンバー', '氏名', '学年', '所属', '備考']].concat(MeetLogic.byTime(rows).map(function (r) {
        var g = grpKey(r), same = grouped && g === pg; pg = g;
        if (same) return ['', '', '', '', r.heat, r.posLabel, r.pos, r.bib, nmX(r), r.grade, r.team, r.note];
        return [r.start, r.call, r.event, rdX(r), r.heat, r.posLabel, r.pos, r.bib, nmX(r), r.grade, r.team, r.note];
      }));
    }
    if (kind === 'ath') {
      return [['所属', 'ナンバー', '氏名', '学年', '種目', 'ラウンド', '組', '区分', 'レーン/順番', '招集', '競技開始', '備考']].concat(MeetLogic.byAthlete(rows).map(function (r) {
        return [r.team, r.bib, nmX(r), r.grade, r.event, rdX(r), r.heat, r.posLabel, r.pos, r.call, r.start, r.note];
      }));
    }
    var S = settings(), out = [['所属', '項目', '必要枚数', '作成枚数', '番号（作成枚数）']];
    state.teams.forEach(function (t) {
      var c = MeetLogic.cards(cardRows(), t, S), P = cardPlan(t, c, S);
      var sum = function (l, k) { return l.reduce(function (s, o) { return s + o[k]; }, 0); };
      var lst = function (l) { return l.map(function (o) { return o.num + '番×' + o.make + (o.make !== o.need ? '（必要' + o.need + '）' : ''); }).join('  '); };
      out.push([t, 'ゼッケン（胸・背中）', sum(P.mune, 'need'), sum(P.mune, 'make'), lst(P.mune)]);
      out.push([t, '腰番', sum(P.koshi, 'need'), sum(P.koshi, 'make'), lst(P.koshi)]);
      out.push([t, 'オーダー番号ビブス（' + S.ordThreshold + 'm以上）', sum(P.ord, 'need'), sum(P.ord, 'make'), lst(P.ord)]);
    });
    return out;
  }
  function fileBase() { return state.teams.join('_') + '_出場一覧'; }
  // 「=」「+」「-」「@」で始まる文字はExcelで数式として動くことがあるので、先頭に ' を付けて文字として扱う
  function safeCell(v) { return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v; }
  function safeAoa(a) { return a.map(function (r) { return r.map(safeCell); }); }
  /* ---------- v0.22 保護者へのお知らせ（ひな形＋この大会だけの値） ---------- */
  var NT = null, NM = { edited: {} }, ntFit = null, ntTimer = 0, ntFound = {};
  function ntKey() { var u = curUid(); return 'lanenote-parent-template' + (u ? ':' + u : ''); }
  function ntLoadLocal() { try { var s = localStorage.getItem(ntKey()) || localStorage.getItem('lanenote-parent-template'); return s ? LaneNotice.sanitize(JSON.parse(s)) : null; } catch (e) { return null; } }
  async function ntLoadCloud() {
    var sc = authScope(); if (!sc.uid || !FB) return;
    try {
      var d = await withTimeout(FB.F.getDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'parentTemplate')), 15000);
      if (!authOk(sc) || !d.exists()) return;
      var t = d.data() && d.data().t; if (!t) return;
      NT = LaneNotice.sanitize(JSON.parse(t)); try { localStorage.setItem(ntKey(), JSON.stringify(NT)); } catch (e) { }
      if (!$('parentView').hidden) { ntEditor(); ntRender(); }
    } catch (e) { }
  }
  async function ntSave() {
    var j = JSON.stringify(NT), msg = '';
    try { localStorage.setItem(ntKey(), j); msg = '✔ ひな形をこの端末に保存しました。'; } catch (e) { msg = '✖ この端末に保存できませんでした。'; }
    var sc = authScope();
    if (sc.uid && FB) {
      try { await withTimeout(FB.F.setDoc(FB.F.doc(FB.fs, 'users', sc.uid, 'settings', 'parentTemplate'), { t: j, updatedAt: new Date().toISOString() }), 15000); if (authOk(sc)) msg = '✔ ひな形を保存しました（ログイン中のアカウントにも保存。ほかの端末でも使えます）。'; }
      catch (e) { msg += '（アカウントへの保存はできませんでした）'; }
    }
    ntMsg(msg);
  }
  function ntMsg(s, ng) { $('pvMsg').style.color = ng ? '#b3261e' : ''; $('pvMsg').textContent = s; }
  function pagesText(pages) {
    return pages.map(function (pg) { var ls = {}; (pg.items || []).forEach(function (i) { var k = Math.round(i.y / 3); ls[k] = (ls[k] ? ls[k] + ' ' : '') + i.str; }); return Object.keys(ls).sort(function (a, b) { return b - a; }).map(function (k) { return ls[k]; }).join('\n'); }).join('\n');
  }
  function ntTimes() {
    var real = (state.rows || []).map(function (r) { return LaneNotice.toMin(r.start); }).filter(function (n) { return n != null; });
    var all = (state.tt || []).map(function (s) { return LaneNotice.toMin(s.time); }).filter(function (n) { return n != null; });
    var f = ntFound;
    return { first: real.length ? LaneNotice.fmtMin(Math.min.apply(null, real)) : '', last: real.length ? LaneNotice.fmtMin(Math.max.apply(null, real)) : '',
      start: f.start ? f.start.v : all.length ? LaneNotice.fmtMin(Math.min.apply(null, all)) : '', gate: NM.gate || (f.gate ? f.gate.v : '') };
  }
  // この大会だけの値：自分で直したもの（edited）はそのまま、ほかは毎回資料から作り直す
  function ntAuto() {
    ntFound = LaneNotice.extract(state.docText || {});
    var d = LaneNotice.parseDate($('meetDate').value || state.day || '') || (ntFound.date ? LaneNotice.parseDate(ntFound.date.v) : null), now = new Date();
    var auto = { name: $('meetName').value || '', date: LaneNotice.fmtDate(d, NT.era), venue: ntFound.venue ? ntFound.venue.v : '', station: ntFound.station ? ntFound.station.v : '', gate: ntFound.gate ? ntFound.gate.v : '', address: ntFound.address ? ntFound.address.v : '', phone: ntFound.phone ? ntFound.phone.v : '', docDate: LaneNotice.fmtDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, NT.era, true), place: '' };
    Object.keys(auto).forEach(function (k) { if (!NM.edited[k]) NM[k] = auto[k]; });
    // 保存した競技場と同じなら、最寄り駅・行き方・集合場所・住所もそこから入れる
    var vi = NM.venuePick != null ? NM.venuePick : LaneNotice.findVenue(NT, NM.venue);
    NM.venueIdx = vi;
    if (vi >= 0 && NT.venues[vi]) { var V0 = NT.venues[vi]; if (NM.venuePick == null && !NM.edited.venue) NM.venue = V0.name; [['station', 'station'], ['access', 'access'], ['place', 'place'], ['address', 'address']].forEach(function (a) { if (!NM.edited[a[0]] && V0[a[1]]) NM[a[0]] = V0[a[1]]; }); }
    else if (!NM.edited.access) NM.access = '';
    if (!NM.edited.fare) NM.fare = vi >= 0 && NT.venues[vi] ? LaneNotice.fareText(NT.venues[vi]) : '';
    var t = ntTimes();
    if (!NM.edited.gather) NM.gather = LaneNotice.gatherTime(NT.call, t);
    if (!NM.edited.dismiss) NM.dismiss = LaneNotice.dismissTime(NT.dismiss, t);
    return t;
  }
  function parentOpt() { return { grade: NT ? NT.table.grade : true, split: NT ? NT.table.split : true }; }
  function parentMeta() { return { title: ($('meetName').value || '（大会名）') + '　出場選手・予定', sub: [$('meetDate').value, state.teams.join('・')].filter(Boolean).join('　') }; }
  function parentParts() { var o = parentOpt(); return { ath: LaneParent.athleteGrid(state.rows, o), time: LaneParent.timeGrid(dispRows(), MeetLogic.byTime) }; }
  function ntDoc(fit) { return LaneNotice.docHtml(NT, NM, parentParts(), fit); }
  var NT_BASE = { first: '自校の最初の種目', start: '大会の競技開始', gate: '開門' };
  function ntEditor() {
    var e = function (s) { return esc(s == null ? '' : s); }, t = ntAuto(), T = NT, f = ntFound;
    var inp = function (k, lab, ph, src) { return '<label class="nt-f"><span>' + lab + '</span><input data-m="' + k + '" value="' + e(NM[k]) + '" placeholder="' + e(ph || '') + '">' + (src ? '<small>' + src + '</small>' : '') + '</label>'; };
    var srcOf = function (k) { return NM.edited[k] ? '自分で入力' : f[k] ? f[k].src + 'から' : '資料に見つからず（入力してください）'; };
    var timeNote = function (rule, k) { var b = NT_BASE[rule.base]; return NM.edited[k] ? '自分で入力' : (k === 'gather' ? b + ' ' + (t[rule.base] || '（不明）') + ' の ' : '最後の種目 ' + (t.last || '（不明）') + ' の ') + (rule.h ? rule.h + '時間' : '') + (rule.m ? rule.m + '分' : '') + (k === 'gather' ? '前' : '後'); };
    var list = function (path, items) { return '<div class="nt-list" data-list="' + path + '">' + items.map(function (x, i) { return '<div class="nt-li"><input data-li="' + i + '" value="' + e(x) + '"><button type="button" data-la="up" data-i="' + i + '" aria-label="上へ">↑</button><button type="button" data-la="down" data-i="' + i + '" aria-label="下へ">↓</button><button type="button" data-la="del" data-i="' + i + '" aria-label="消す">✕</button></div>'; }).join('') + '<button type="button" class="nt-add" data-la="add">＋ 行を追加</button></div>'; };
    var h = '<section class="nt-box"><h3>📅 この大会だけ</h3>' +
      inp('name', '大会名', '例：第○回 北区中学校陸上競技大会', NM.edited.name ? '自分で入力' : $('meetName').value ? '資料から' : '') +
      inp('date', '日にち', '例：令和8年10月11日（日）', NM.edited.date ? '自分で入力' : NM.date ? '資料から' : '資料に見つからず') +
      '<div class="nt-f"><span>今回の競技場</span><select data-venue="1"><option value="">（選ばない）</option>' + T.venues.map(function (v, i) { return '<option value="' + i + '"' + (NM.venueIdx === i ? ' selected' : '') + '>' + e(v.name) + '</option>'; }).join('') + '<option value="reg">競技場を登録する…</option></select>' +
      (ntFound.venue && LaneNotice.findVenue(T, ntFound.venue.v) < 0 ? '<p class="nt-hint">要項の競技場「' + e(ntFound.venue.v) + '」は未登録です → <button type="button" class="linkbtn" data-va="regfound">登録する</button></p>' : '') + '<small>' + (T.venues.length ? '登録した競技場を選ぶと、最寄り駅・集合場所・交通費が入ります。' : 'まだ競技場が登録されていません。「競技場を登録する…」から登録できます。') + '</small></div>' +
      inp('venue', '文書に書く競技場名（この大会だけ）', '', NM.venueIdx >= 0 ? '登録した競技場「' + e(T.venues[NM.venueIdx].name) + '」から' : srcOf('venue')) +
      inp('station', '最寄り駅', '', NM.venueIdx >= 0 && !NM.edited.station ? '登録した競技場から（ここで直しても登録は変わりません）' : srcOf('station')) + inp('access', '駅からの行き方', '例：徒歩10分', NM.venueIdx >= 0 ? '登録した競技場から' : '') + inp('fare', '交通費（この大会）', '例：往復1,000円程度（○○駅〜○○駅）', NM.edited.fare ? '自分で入力' : NM.fare ? '登録した競技場の交通費から' : '競技場の設定で金額を入れると自動で入ります') + inp('address', '住所（要点に出すときは学校の設定で）', '', srcOf('address')) + inp('phone', '電話（競技場）', '', srcOf('phone')) + inp('gate', '開門', '例：8:00', srcOf('gate')) +
      inp('gather', '集合時刻', '例：7:30', timeNote(T.call, 'gather')) + inp('place', '集合場所', T.place, 'ふだんの場所は「学校の設定」') +
      inp('dismiss', '解散予定', '', T.dismiss.on ? timeNote(T.dismiss, 'dismiss') : '「学校の設定」で表示を切っています') + inp('docDate', '文書の日付', '', '今日の日付（直せます）') +
      '<button type="button" class="btn sub nt-small" id="ntReauto">↻ 資料から入れ直す</button></section>';
    h += '<details class="nt-box" id="ntSchool"' + (T.school ? '' : ' open') + '><summary><h3>⚙ 学校の設定（毎回同じ）</h3></summary>' +
      '<div class="nt-lay" role="radiogroup" aria-label="レイアウト">' + [['std', 'スタンダード'], ['table', 'カード'], ['clean', 'ミニマル']].map(function (l) { return '<button type="button" role="radio" aria-checked="' + (T.layout === l[0]) + '" class="nt-th' + (T.layout === l[0] ? ' on' : '') + '" style="color:' + LaneNotice.colors(T).a + '" data-layout="' + l[0] + '">' + LaneNotice.THUMB[l[0]] + '<span>' + l[1] + '</span></button>'; }).join('') + '</div>' +
      '<div class="nt-f"><span>アクセントの色</span><div class="nt-acc" role="radiogroup" aria-label="アクセントの色">' + Object.keys(LaneNotice.ACCENT).map(function (k) { return '<button type="button" role="radio" aria-checked="' + (T.accent === k) + '" class="nt-sw' + (T.accent === k ? ' on' : '') + '" data-accent="' + k + '" style="--c:' + LaneNotice.ACCENT[k] + '" title="' + LaneNotice.ACCENT_NAME[k] + '"><i></i>' + LaneNotice.ACCENT_NAME[k] + '</button>'; }).join('') + '</div><label class="nt-c"><input type="checkbox" data-t="mono"' + (T.mono ? ' checked' : '') + '> 白黒印刷向け（色を使わず、黒と灰色だけにする）</label></div>' +
      ['school:学校・クラブ名', 'club:部活・チーム名', 'to:宛先', 'title:タイトル（{大会名} が入ります）', 'place:ふだんの集合場所'].map(function (p) { var k = p.split(':'); return '<label class="nt-f"><span>' + k[1] + '</span><input data-t="' + k[0] + '" value="' + e(T[k[0]]) + '"></label>'; }).join('') +
      '<div class="nt-f"><span>競技場</span><button type="button" class="btn sub nt-small" data-va="open">🏟 競技場の設定（' + T.venues.length + '件）</button></div>' +
      '<label class="nt-c"><input type="checkbox" data-t="fareInBelongings"' + (T.fareInBelongings ? ' checked' : '') + '> 交通費を「持ち物」にも書く（要点に出すかは下の「要点に出す項目」で）</label>' +
      '<div class="nt-f"><span>顧問名</span>' + list('advisors', T.advisors) + '</div>' +
      '<label class="nt-f"><span>日付の書き方</span><select data-t="era"><option value="wareki"' + (T.era === 'wareki' ? ' selected' : '') + '>和暦（令和）</option><option value="seireki"' + (T.era === 'seireki' ? ' selected' : '') + '>西暦</option></select></label>' +
      '<label class="nt-f"><span>フォント</span><select data-t="font"><option value="gothic"' + (T.font === 'gothic' ? ' selected' : '') + '>ゴシック（おすすめ）</option><option value="mincho"' + (T.font === 'mincho' ? ' selected' : '') + '>明朝</option></select></label>' +
      '<label class="nt-f"><span>文字の大きさ</span><select data-t="size" data-num="1">' + [9, 9.5, 10, 10.5, 11, 12].map(function (n) { return '<option value="' + n + '"' + (T.size === n ? ' selected' : '') + '>' + n + 'pt</option>'; }).join('') + '</select></label>' +
      '<label class="nt-c"><input type="checkbox" data-t="fit"' + (T.fit ? ' checked' : '') + '> A4 1枚に収める（文字・余白を自動で小さくする）</label>' +
      '<div class="nt-f"><span>集合時刻の決め方</span><div class="nt-rule"><select data-t="call.base">' + Object.keys(NT_BASE).map(function (k) { return '<option value="' + k + '"' + (T.call.base === k ? ' selected' : '') + '>' + NT_BASE[k] + '</option>'; }).join('') + '</select> の <input type="number" min="0" max="6" data-t="call.h" data-num="1" value="' + T.call.h + '">時間 <input type="number" min="0" max="59" step="5" data-t="call.m" data-num="1" value="' + T.call.m + '">分前</div></div>' +
      '<div class="nt-f"><span>解散予定</span><div class="nt-rule"><label><input type="checkbox" data-t="dismiss.on"' + (T.dismiss.on ? ' checked' : '') + '> 出す：最後の種目の</label> <input type="number" min="0" max="6" data-t="dismiss.h" data-num="1" value="' + T.dismiss.h + '">時間 <input type="number" min="0" max="59" step="5" data-t="dismiss.m" data-num="1" value="' + T.dismiss.m + '">分後</div></div>' +
      '<div class="nt-f"><span>要点に出す項目（名前も直せます）</span>' + T.points.map(function (p, i) { return '<div class="nt-li"><input type="checkbox" data-pt-on="' + i + '"' + (p.on ? ' checked' : '') + ' aria-label="出す"><input data-pt="' + i + '" value="' + e(p.label) + '"></div>'; }).join('') + '</div>' +
      '<div class="nt-f"><span>出場選手表</span><label class="nt-c"><input type="checkbox" data-t="table.grade"' + (T.table.grade ? ' checked' : '') + '> 学年の列</label><label class="nt-c"><input type="checkbox" data-t="table.split"' + (T.table.split ? ' checked' : '') + '> 男子・女子を左右に並べる</label><small>リレーの列は、リレーに出るときだけ自動で出ます。</small></div>' +
      '</details>';
    h += '<section class="nt-box"><h3>📝 文書の中身（順番・表示を選べます）</h3>' + T.sections.map(function (s, i) {
      var body = '';
      if (s.type === 'greeting') body = '<textarea data-t="greeting" rows="4">' + e(T.greeting) + '</textarea>';
      else if (s.type === 'belongings') body = list('belongings.items', T.belongings.items) + '<label class="nt-f"><span>備考</span><input data-t="belongings.note" value="' + e(T.belongings.note) + '"></label>';
      else if (s.type === 'cautions') body = list('cautions', T.cautions);
      else if (s.type === 'contact') body = list('contact', T.contact);
      else if (s.type === 'free') body = '<input data-s="' + i + '" data-sk="title" value="' + e(s.title) + '" placeholder="見出し（なくても可）"><textarea data-s="' + i + '" data-sk="text" rows="3" placeholder="本文">' + e(s.text) + '</textarea>';
      return '<div class="nt-sec' + (s.on ? '' : ' off') + '" data-i="' + i + '"><div class="nt-sh"><label><input type="checkbox" data-son="' + i + '"' + (s.on ? ' checked' : '') + '> <b>' + e(s.type === 'free' ? (s.title || '自由欄') : LaneNotice.SEC_LABEL[s.type]) + '</b></label><span><button type="button" data-sa="up" data-i="' + i + '" aria-label="上へ">↑</button><button type="button" data-sa="down" data-i="' + i + '" aria-label="下へ">↓</button><button type="button" data-sa="free" data-i="' + i + '" title="この下に自由欄を追加">＋欄</button>' + (s.type === 'free' ? '<button type="button" data-sa="del" data-i="' + i + '" aria-label="この欄を消す">✕</button>' : '') + '</span></div>' + (s.on && body ? '<div class="nt-sb">' + body + '</div>' : '') + '</div>';
    }).join('') + '<button type="button" class="btn sub nt-small" id="ntFree">＋ 自由欄を追加</button><p class="nt-tip">文の中に {大会名} {日付} {競技場} {最寄り駅} {集合時刻} {集合場所} {解散予定} {開門} {学校名} {部活名} と書くと、その値が入ります。</p></section>' +
      '<div class="nt-save"><button type="button" class="btn" id="ntSave">💾 ひな形を保存</button><button type="button" class="btn sub" id="ntReset">↺ 初期に戻す</button></div>';
    $('ntEdit').innerHTML = h;
  }
  function ntRender() {
    clearTimeout(ntTimer); ntTimer = 0;
    var t = ntAuto();
    ['gather', 'dismiss'].forEach(function (k) { var el = document.querySelector('#ntEdit [data-m="' + k + '"]'); if (el && document.activeElement !== el) el.value = NM[k] || ''; });
    var fr = $('pvFrame');
    fr.onload = function () {
      var d = fr.contentDocument; if (!d || !d.body) return;
      ntFit = NT.fit ? LaneNotice.fitDoc(d, NT.size) : { fs: NT.size, sp: 1, lh: 1, fits: null };
      var w = $('ntWarn');
      if (ntFit.fits === false) {
        var nm = function (id) { var s = NT.sections.filter(function (x) { return x.id === id; })[0]; return s ? (s.type === 'free' ? (s.title || '自由欄') : LaneNotice.SEC_LABEL[s.type]) : id; };
        w.hidden = false; w.textContent = '⚠ 文字を ' + LaneNotice.MIN_FS + 'pt まで小さくしても A4 1枚に入りません（約' + Math.round(ntFit.ratio * 100) + '%）。長いのは「' + ntFit.over.map(function (o) { return nm(o.id); }).join('」「') + '」です。文を短くするか、欄を外してください。';
      } else { w.hidden = true; w.textContent = ''; }
      $('ntSize').textContent = NT.fit ? (ntFit.fits ? 'A4 1枚・文字 ' + ntFit.fs + 'pt' : '') : '';
      ntZoom();
    };
    fr.srcdoc = ntDoc();
    return t;
  }
  function ntZoom() { var fr = $('pvFrame'), d = fr.contentDocument; if (!d || !d.body) return; var w = fr.clientWidth, page = 210 * 96 / 25.4 + 20; d.documentElement.style.zoom = w && w < page ? String(Math.max(.3, w / page)) : ''; }
  function ntSoon() { clearTimeout(ntTimer); ntTimer = setTimeout(ntRender, 250); }
  function ntSetPath(path, v) { var ks = path.split('.'), o = NT; for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function ntGetPath(path) { return path.split('.').reduce(function (o, k) { return o[k]; }, NT); }
  function ntInput(ev) {
    var el = ev.target, d = el.dataset, rebuild = false;
    if (d.m) { NM[d.m] = el.value; NM.edited[d.m] = true; }
    else if (d.t) { var v = el.type === 'checkbox' ? el.checked : d.num ? +el.value || 0 : el.value; ntSetPath(d.t, v); rebuild = el.tagName === 'SELECT' || el.type === 'checkbox' || /^(call|dismiss)\./.test(d.t); if (d.t === 'era') { NM.edited.date = NM.edited.docDate = false; } }
    else if (d.li != null) { ntGetPath(el.closest('[data-list]').dataset.list)[+d.li] = el.value; }
    else if (d.vn != null) { NT.venues[+d.vn][d.vk] = el.value; if (ev.type === 'change') rebuild = true; }
    else if (d.venue) {
      if (ev.type !== 'change') return;
      if (el.value === 'reg') { el.value = NM.venueIdx >= 0 ? String(NM.venueIdx) : ''; openVenues(); return; }
      else if (el.value === '') { NM.venuePick = null; ['venue', 'station', 'access', 'place', 'address'].forEach(function (k) { NM.edited[k] = false; }); }
      else { var V1 = NT.venues[+el.value]; NM.venuePick = +el.value; NM.venue = V1.name; NM.edited.venue = true; ['station', 'access', 'place', 'address'].forEach(function (k) { NM[k] = V1[k] || ''; NM.edited[k] = true; }); }
      rebuild = true;
    }
    else if (d.pt != null) NT.points[+d.pt].label = el.value;
    else if (d.ptOn != null) { NT.points[+d.ptOn].on = el.checked; }
    else if (d.son != null) { NT.sections[+d.son].on = el.checked; rebuild = true; }
    else if (d.s != null) NT.sections[+d.s][d.sk] = el.value;
    else return;
    if (rebuild && ev.type === 'change') { var op = $('ntSchool') && $('ntSchool').open, y = $('ntEdit').scrollTop; ntEditor(); if ($('ntSchool')) $('ntSchool').open = op; $('ntEdit').scrollTop = y; ntRender(); } else ntSoon();
  }
  function ntClick(ev) {
    var b = ev.target.closest('button'); if (!b) return; var d = b.dataset, mv = function (a, i, j) { if (j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; };
    if (d.layout) NT.layout = d.layout;
    else if (d.accent) { NT.accent = d.accent; NT.mono = false; }
    else if (d.la) {
      var a = ntGetPath(b.closest('[data-list]').dataset.list), i = +d.i;
      if (d.la === 'add') a.push(''); else if (d.la === 'del') a.splice(i, 1); else mv(a, i, d.la === 'up' ? i - 1 : i + 1);
    } else if (d.sa) {
      var S = NT.sections, k = +d.i;
      if (d.sa === 'free') S.splice(k + 1, 0, { id: 'f' + Date.now().toString(36), type: 'free', on: true, title: '', text: '' });
      else if (d.sa === 'del') S.splice(k, 1); else mv(S, k, d.sa === 'up' ? k - 1 : k + 1);
    } else if (d.va === 'open') { openVenues(); return; }
    else if (d.va === 'regfound') { openVenues({ name: ntFound.venue.v, address: ntFound.address ? ntFound.address.v : '', phone: ntFound.phone ? ntFound.phone.v : '' }); return; }
    else if (b.id === 'ntFree') NT.sections.push({ id: 'f' + Date.now().toString(36), type: 'free', on: true, title: 'お願い', text: '' });
    else if (b.id === 'ntReauto') NM = { edited: {} };
    else if (b.id === 'ntSave') { ntSave(); return; }
    else if (b.id === 'ntReset') { if (!confirm('ひな形を初めの状態に戻します（保存するまでは元に戻せます）。よろしいですか？')) return; NT = LaneNotice.defaults(); }
    else return;
    var open = $('ntSchool') && $('ntSchool').open, y = $('ntEdit').scrollTop;
    ntEditor(); if ($('ntSchool')) $('ntSchool').open = open; $('ntEdit').scrollTop = y; ntRender();
    if (d.la === 'add') { var ins = b.closest('[data-list]'); ins = document.querySelector('[data-list="' + ins.dataset.list + '"] .nt-li:last-of-type input'); if (ins) ins.focus(); }
  }
  /* ---------- v0.22.3 競技場の設定（専用の画面）：一覧（カード）→ 追加・編集のフォーム。保存するとひな形（端末＋アカウント）に入る ---------- */
  var VS = { edit: null, draft: null, pickNew: false };
  var VF = [['name', '名前', '例：スピアーズえどりくフィールド', true], ['address', '住所', '〒…'], ['phone', '電話', ''], ['station', '最寄り駅', '例：西葛西駅'], ['access', '駅からの行き方', '例：徒歩15分'], ['place', 'いつもの集合場所', '例：正門前'],
    ['route', '交通費：経路', '例：本郷三丁目駅〜西葛西駅'], ['fareOne', '交通費：片道（円）', '例：520'], ['fareRound', '交通費：往復（円）', '例：1040'], ['fareNote', '交通費：メモ', '例：PASMO可'], ['memo', 'メモ', '']];
  function ntEnsure() { if (!NT) NT = ntLoadLocal() || LaneNotice.defaults(); return NT; }
  function openVenues(prefill) {
    ntEnsure(); VS.edit = null; VS.draft = null; VS.pickNew = false;
    if (prefill) { VS.edit = -1; VS.draft = Object.assign(vBlank(), prefill); VS.pickNew = true; }
    $('vnMsg').textContent = ''; $('venueView').hidden = false; vnRender();
  }
  function vBlank() { var o = {}; LaneNotice.VENUE_KEYS.forEach(function (k) { o[k] = ''; }); return o; }
  function vnRender() {
    var e = function (x) { return esc(x == null ? '' : x); }, h = '';
    if (VS.edit == null) {
      h = '<p class="vn-lead">よく行く競技場を登録しておくと、「保護者へのお知らせ」で選ぶだけで最寄り駅・集合場所・交通費が入ります。</p>';
      h += NT.venues.length ? NT.venues.map(function (v, i) {
        var fare = LaneNotice.fareText(v), row = function (l, x) { return x ? '<div><dt>' + l + '</dt><dd>' + e(x) + '</dd></div>' : ''; };
        return '<article class="vn-card"><h3>🏟 ' + e(v.name) + '</h3><dl>' + row('住所', v.address) + row('最寄り駅', [v.station, v.access].filter(Boolean).join('　')) + row('集合場所', v.place) + row('交通費', fare) + row('メモ', v.memo) + '</dl><div class="vn-act"><button type="button" class="btn sub" data-ve="' + i + '">✏ 編集</button><button type="button" class="btn sub vn-del" data-vd="' + i + '">🗑 削除</button></div></article>';
      }).join('') : '<p class="vn-empty">まだ登録された競技場はありません。</p>';
      h += '<button type="button" class="btn vn-add" id="vnAdd">＋ 競技場を追加</button>';
    } else {
      var d = VS.draft;
      h = '<h3 class="vn-ftl">' + (VS.edit < 0 ? '＋ 競技場を追加' : '✏ 競技場を編集') + '</h3><form id="vnForm" class="vn-form" novalidate>' + VF.map(function (f) {
        return '<label class="nt-f"><span>' + f[1] + (f[3] ? ' <b class="req">*必須</b>' : '') + '</span><input name="' + f[0] + '" value="' + e(d[f[0]]) + '" placeholder="' + e(f[2]) + '"' + (/fare(One|Round)/.test(f[0]) ? ' inputmode="numeric"' : '') + (f[3] ? ' required' : '') + '></label>';
      }).join('') + '<p class="vn-note">交通費は自分で調べた金額を入れてください（LANE NOTE は運賃を調べません）。</p><div class="vn-fbtn"><button type="submit" class="btn">保存</button><button type="button" class="btn sub" id="vnCancel">やめる</button></div></form>';
    }
    $('vnBody').innerHTML = h; $('vnBody').scrollTop = 0;
    var f = $('vnForm'); if (f) { var n = f.querySelector('[name=name]'); if (n && !n.value) n.focus(); }
  }
  function vnSubmit(ev) {
    ev.preventDefault();
    var f = $('vnForm'), o = vBlank();
    LaneNotice.VENUE_KEYS.forEach(function (k) { var el = f.querySelector('[name="' + k + '"]'); if (el) o[k] = el.value.trim(); });
    if (!o.name) { $('vnMsg').textContent = '✖ 名前を入れてください。'; f.querySelector('[name=name]').focus(); return; }
    var i = VS.edit;
    if (i < 0) { NT.venues.push(o); i = NT.venues.length - 1; } else NT.venues[i] = o;
    if (VS.pickNew || NM.venuePick === i) NM.venuePick = i;
    VS.edit = null; VS.draft = null; VS.pickNew = false;
    ntSave().then(function () { $('vnMsg').textContent = '✔ 「' + o.name + '」を保存しました。'; });
    vnRender(); vnSync();
  }
  function vnSync() { if (!$('parentView').hidden) { var op = $('ntSchool') && $('ntSchool').open; NM.edited.station = NM.edited.access = NM.edited.place = NM.edited.address = false; ntEditor(); if ($('ntSchool')) $('ntSchool').open = op; ntRender(); } }
  function setupVenues() {
    $('vnClose').addEventListener('click', function () { $('venueView').hidden = true; });
    var bv = $('btnVenues'); if (bv) bv.addEventListener('click', function () { openVenues(); });
    $('vnBody').addEventListener('submit', vnSubmit);
    $('vnBody').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'vnAdd') { VS.edit = -1; VS.draft = vBlank(); vnRender(); }
      else if (b.id === 'vnCancel') { VS.edit = null; VS.draft = null; VS.pickNew = false; $('vnMsg').textContent = ''; vnRender(); }
      else if (b.dataset.ve != null) { VS.edit = +b.dataset.ve; VS.draft = Object.assign(vBlank(), NT.venues[VS.edit]); vnRender(); }
      else if (b.dataset.vd != null) {
        var i = +b.dataset.vd; if (!confirm('「' + NT.venues[i].name + '」を消します。よろしいですか？')) return;
        NT.venues.splice(i, 1); if (NM.venuePick === i) NM.venuePick = null; else if (NM.venuePick > i) NM.venuePick--;
        ntSave(); vnRender(); vnSync();
      }
    });
  }
  function openParent() {
    refreshPrint();
    if (!state.rows.length) { alert('学校を選んで結果を出してから作ってください。'); return; }
    ntEnsure();
    if (!NT.school && state.teams.length === 1) NT.school = state.teams[0];
    NM = { edited: NM.edited && NM.key === ($('meetName').value + '|' + $('meetDate').value) ? NM.edited : {}, key: $('meetName').value + '|' + $('meetDate').value, _keep: NM };
    if (NM._keep && NM._keep.key === NM.key) Object.keys(NM._keep).forEach(function (k) { if (NM.edited[k]) NM[k] = NM._keep[k]; }); delete NM._keep;
    ntMsg(''); $('parentView').hidden = false; $('parentView').classList.remove('nt-full');
    ntEditor(); ntRender(); ntLoadCloud();
  }
  async function copyTable(which) {
    var p = parentParts(), g = p[which], title = which === 'ath' ? '出場選手' : '時間順の予定';
    var html = LaneParent.gridHtml(g), tsv = LaneParent.gridTsv(g), ok = false;
    try {
      if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tsv], { type: 'text/plain' }) })]); ok = true; }
    } catch (e) { }
    if (!ok) {   // 古いブラウザ：表を画面外に置いて選び、コピーする
      var d = document.createElement('div'); d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0'; d.innerHTML = html; document.body.appendChild(d);
      try { var rg = document.createRange(); rg.selectNodeContents(d); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); ok = document.execCommand('copy'); sel.removeAllRanges(); } catch (e) { }
      d.remove();
    }
    if (!ok) { try { await navigator.clipboard.writeText(tsv); ok = true; } catch (e) { } }
    ntMsg(ok ? '✔ 「' + title + '」の表をコピーしました。Word・Excel に貼り付けてください。' : '✖ コピーできませんでした。「Excelで保存」か「PDF作成」を使ってください。', !ok);
  }
  function printParent(pdf) {
    if (ntTimer) ntRender();
    if (pdf) return pdfFile(ntDoc(NT.fit && ntFit ? ntFit : null), '保護者へのお知らせ', 11, { onePage: !!NT.fit, footer: '' });
    var f = $('pvFrame'); if (!f.contentWindow) return;
    var d = f.contentDocument; if (d) d.documentElement.style.zoom = '';
    pdfHint(!!pdf);
    var go = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(ntZoom, 500); };
    if (pdf) setTimeout(go, 400); else go();
  }
  async function parentDocx() {
    if (typeof JSZip === 'undefined') { alert('Word作成部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。'); return; }
    if (ntTimer) ntRender();
    // Word は文字の幅・行の高さがブラウザと少し違うので、A4 1枚のときは 0.75pt 小さめにする（つめた分も反映）
    var fs = NT.fit && ntFit ? Math.max(7, ntFit.fs - .75 - (ntFit.sp < .4 ? .25 : 0)) : NT.size;
    var blob = await LaneNotice.toDocx(NT, NM, parentParts(), fs, JSZip);
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileBase() + '_保護者へのお知らせ.docx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    ntMsg('✔ Wordのファイルを保存しました。');
  }
  function parentXlsx() {
    if (typeof XLSX === 'undefined') { alert('Excel作成部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。'); return; }
    var p = parentParts(), m = parentMeta(), wb = XLSX.utils.book_new();
    [['出場選手', p.ath], ['時間順の予定', p.time]].forEach(function (x) {
      var ws = XLSX.utils.aoa_to_sheet(safeAoa([[m.title], [m.sub], []].concat(LaneParent.gridAoa(x[1], x[0]))));
      ws['!cols'] = x[1].head.map(function (h) { return { wch: /出場種目|種目/.test(h) ? 22 : /出る人/.test(h) ? 50 : /名前/.test(h) ? 16 : /招集/.test(h) ? 12 : 7 }; });
      XLSX.utils.book_append_sheet(wb, ws, x[0]);
    });
    XLSX.writeFile(wb, fileBase() + '_保護者案内用.xlsx');
  }
  function setupParent() {
    $('btnParent').addEventListener('click', openParent);
    var ed = $('ntEdit');
    ed.addEventListener('input', ntInput); ed.addEventListener('change', ntInput); ed.addEventListener('click', ntClick);
    $('pvCopyAth').addEventListener('click', function () { copyTable('ath'); });
    $('pvCopyTime').addEventListener('click', function () { copyTable('time'); });
    $('pvView').addEventListener('click', function () { var v = $('parentView'); v.classList.toggle('nt-full'); this.textContent = v.classList.contains('nt-full') ? '✏ 編集にもどる' : '👀 画面で見る'; setTimeout(ntZoom, 50); });
    $('pvPdf').addEventListener('click', function () { printParent(true); });
    $('pvPrint').addEventListener('click', function () { printParent(false); });
    $('pvDocx').addEventListener('click', parentDocx);
    $('pvXlsx').addEventListener('click', parentXlsx);
    $('pvClose').addEventListener('click', function () { $('parentView').hidden = true; });
    window.addEventListener('resize', function () { if (!$('parentView').hidden) ntZoom(); });
  }
  function exportXlsx() {
    if (!state.rows.length) { alert('学校を選んで結果を出してから保存してください。'); return; }
    if (typeof XLSX === 'undefined') { alert('Excel作成部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。'); return; }
    var wb = XLSX.utils.book_new();
    [['選手別', 'ath', [10, 9, 24, 6, 22, 10, 5, 8, 10, 13, 8, 30]], ['時間順', 'time', [8, 13, 22, 10, 5, 8, 10, 9, 24, 6, 10, 30]], ['ナンバーカード', 'cards', [12, 30, 9, 9, 80]]].forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(safeAoa(tableData(s[1], true)));
      ws['!cols'] = s[2].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, s[0]);
    });
    XLSX.utils.book_append_sheet(wb, recWs(), '記録用紙');
    var fa = [['所属', '区分', '個人 種目数', '個人 単価', 'リレー チーム数', 'リレー 単価', '小計']];
    feeData().forEach(function (f) {
      f.lines.forEach(function (l) { fa.push([f.team, l.cat, l.ind, l.indPrice, l.relay, l.relayPrice, l.sub]); });
      if (f.program) fa.push([f.team, 'プログラム代', f.program.qty, f.program.unit, '', '', f.program.sub]);
      fa.push([f.team, f.missing.length ? '合計未確定（設定済み分の小計）' : f.unsure ? '合計（単価の単位 要確認）' : (f.program ? '合計（プログラム' + f.program.qty + '部を含む）' : '合計'), '', '', '', '', f.total]);
      if (f.missing.length) fa.push([f.team, '未設定：' + f.missing.join('・')]); fa.push([]);
    });
    fa.push(['単価の出どころ：' + (state.feeParsed && state.feeParsed.src.length ? state.feeParsed.src.join(' ／ ') : '要項から読み取れず（手入力）')]);
    var fws = XLSX.utils.aoa_to_sheet(safeAoa(fa)); fws['!cols'] = [12, 8, 12, 10, 14, 10, 12].map(function (w) { return { wch: w }; }); XLSX.utils.book_append_sheet(wb, fws, '参加料');
    XLSX.writeFile(wb, fileBase() + '.xlsx');
  }


  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(SID).forEach(function (k) { INIT_STATUS[k] = $(SID[k]).innerHTML; });
    setupShare(); setupPlayer(); setupParent(); setupVenues();
    setupDrop('slDrop', 'slFile', 'sl');
    setupDrop('ttDrop', 'ttFile', 'tt');
    setupDrop('noteDrop', 'noteFile', 'note');
    setupDrop('yokoDrop', 'yokoFile', 'yoko');
    setupUrlLoad();
    $('meetDate').addEventListener('input', function () { $('meetDate').dataset.manual = $('meetDate').value ? '1' : ''; if (!$('meetDate').value) updateDate(); else renderDateMark(); });
    document.querySelectorAll('#athHead th[data-sort]').forEach(function (th) { th.addEventListener('click', function () {
      var k = th.dataset.sort, s = state.athSort;
      state.athSort = !s || s.key !== k ? { key: k, dir: 1 } : s.dir > 0 ? { key: k, dir: -1 } : null; render();
    }); });
    $('dateMark').addEventListener('click', function () { alert($('dateMark').title); });
    renderFeePrices();
    $('school').addEventListener('input', function () { updateTeams(); render(); });
    document.querySelectorAll('.setting').forEach(function (el) { el.addEventListener('change', render); el.addEventListener('input', render); });
    $('btnXlsx').addEventListener('click', exportXlsx);
    $('btnRec').addEventListener('click', printRec);
    $('btnRecXlsx').addEventListener('click', exportRecXlsx);
    ['meetName'].forEach(function (id) { $(id).addEventListener('input', function () { delete $(id).dataset.auto; }); });
    RULES.forEach(function (r) { r.ids.forEach(function (id) { $(id).addEventListener('input', function () { ruleState[r.k] = 'man'; renderRuleMarks(); }); $(id).addEventListener('change', function () { ruleState[r.k] = 'man'; renderRuleMarks(); }); }); });
    document.addEventListener('click', function (e) { var el = e.target.closest && e.target.closest('label .rs[data-rule]'); if (el) { e.preventDefault(); var k = el.dataset.rule, src = $('ruleSrc'); src.hidden = false; src.innerHTML = '<b>' + markOf(k) + '</b> ' + esc(ruleTitle(k)); } });
    renderRuleMarks();
    $('btnPrint').addEventListener('click', function () { outDoc('time', 'print'); });
    $('btnPrintView').addEventListener('click', function () { outDoc('time', 'view'); });
    $('btnPrintPdf').addEventListener('click', function () { outDoc('time', 'pdf'); });
    $('btnRecView').addEventListener('click', function () { outDoc('rec', 'view'); });
    $('btnRecPdf').addEventListener('click', function () { outDoc('rec', 'pdf'); });
    $('docPdf').addEventListener('click', function () { outDoc(DOCKIND, 'pdf'); });
    $('docPrint').addEventListener('click', function () { outDoc(DOCKIND, 'print'); });
    $('docClose').addEventListener('click', function () { $('docView').hidden = true; $('docFrame').srcdoc = ''; });
    $('daySel').addEventListener('change', function () { state.day = $('daySel').value; if (!$('meetDate').dataset.manual) $('meetDate').value = state.day ? dayLabel(state.day) : (state.date ? state.date.label : ''); renderDateMark(); render(); });
    window.addEventListener('beforeprint', function () { refreshPrint(); if (document.body.classList.contains('print-rec')) { try { buildRecSheet(); } catch (e) { } } });
    $('meetDate').addEventListener('input', refreshPrint);
    $('meetName').addEventListener('input', refreshPrint);
    $('feeInPrint').addEventListener('change', refreshPrint);
    if ($('dateAlt')) $('dateAlt').addEventListener('change', function () { $('meetDate').value = $('dateAlt').value; $('meetDate').dataset.manual = '1'; renderDateMark(); refreshPrint(); });
    $('btnReset').addEventListener('click', resetAll);
    document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.tabpane').forEach(function (p) { p.hidden = p.id !== b.dataset.tab; });
    }); });
    loadPdfjs().catch(function (e) { setStatus('slStatus', '✖ ' + esc(e.message), 'ng'); });
    updateTeams();
  });
  /* ---------- スマホで見る／共有（長いリンク：URLの # 以降に結果を圧縮して入れる＝サーバーに送らない／短いリンク：Firebase の shares/{id} に置く） ---------- */
  var SAVE_KEY = 'lanenote.saved.v1', QR_MAX = 2900, URL_WARN = 8000;
  function shareRow(r) {
    return [r.start || '', r.call || '', r.event || '', r.round || '', r.heat == null ? '' : String(r.heat), r.posLabel || '', r.pos == null ? '' : String(r.pos),
      r.typ === 'relay' ? '' : String(r.bib || ''), r.typ === 'relay' ? (r.relayTeam || '') : (r.name || ''), r.grade || '', r.team || '', r.note || '',
      r.typ === 'relay' ? 'r' : '', r.typ === 'relay' ? (r.members || []).map(function (m) { return m.bib + ' ' + m.name; }).join('、') : '', r.kana || ''];
  }
  var RK = ['start', 'call', 'event', 'round', 'heat', 'posLabel', 'pos', 'bib', 'name', 'grade', 'team', 'note', 'relay', 'members', 'kana'];
  function rowObj(a) { var o = {}; RK.forEach(function (k, i) { o[k] = a && a[i] != null ? String(a[i]) : ''; }); o.relay = o.relay === 'r'; return o; }
  function payloadFromState() {
    var S = settings();
    return { v: 1, n: $('meetName').value || '', d: $('meetDate').value || '', ts: state.teams.slice(), g: new Date().toISOString(),
      rule: ruleSummaryText().replace(/（〇＝.*$/, ''),
      r: MeetLogic.byTime(state.rows).map(shareRow),
      c: state.teams.map(function (t) {
        var P = cardPlan(t, MeetLogic.cards(cardRows(), t, S), S), f = function (l) { return l.map(function (o) { return [o.num, o.make]; }); };
        return [t, f(P.koshi), f(P.mune), f(P.ord)];
      }) };
  }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  // v0.14（監査F09）：展開したあとの大きさに上限（2MiB）を付け、超えたらその場で止める
  var MAX_LINK = 400000, MAX_INFLATE = 2 * 1048576;
  async function inflateLimited(bytes, max) {
    var reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = [], total = 0;
    try {
      for (;;) {
        var x = await reader.read(); if (x.done) break;
        total += x.value.byteLength;
        if (total > max) { try { await reader.cancel(); } catch (e) { } throw new Error('リンクの中身が大きすぎます（展開後 ' + Math.round(max / 1048576) + 'MB まで）'); }
        parts.push(x.value);
      }
    } finally { try { reader.releaseLock(); } catch (e) { } }
    var out = new Uint8Array(total), off = 0; parts.forEach(function (p) { out.set(p, off); off += p.byteLength; });
    return out;
  }
  async function encodePayload(obj) {
    if (typeof CompressionStream === 'undefined') throw new Error('このブラウザは圧縮に対応していません（新しいChrome／Safari／Edgeを使ってください）');
    return '1.' + b64u(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw')));
  }
  // 共有の中身の形を確かめ、決まった項目だけで作り直す（文字は200字・行は5000行まで）
  function isScalar(v) { return v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'; }
  function sStr(v, n) { if (v == null) return ''; if (typeof v !== 'string' && typeof v !== 'number') throw new Error('リンクの中身の形が違います'); return String(v).slice(0, n || 200); }
  function sRow(a, maxLen) { if (!Array.isArray(a) || a.length > maxLen || !a.every(isScalar)) throw new Error('リンクの中身の形が違います'); return a.map(function (v) { return v == null ? v : typeof v === 'string' ? v.slice(0, 300) : v; }); }
  function sList(a, max) { if (a == null) return []; if (!Array.isArray(a) || a.length > max) throw new Error('リンクの中身の形が違います'); return a; }
  function validatePayload(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) throw new Error('リンクの中身を読めませんでした');
    if (o.k === 'ms') return { v: 1, k: 'ms' };   // v0.23：記録ページの大会まとめ（中身は記録ページで確かめて出す）
    if (o.k === 'pp') return LanePersonal.sanitize(o);   // v0.16：選手の個人ページ（記録ページで作る）
    if (o.k === 'p') {
      if (!o.a || typeof o.a !== 'object') throw new Error('リンクの中身を読めませんでした');
      return { v: 1, k: 'p', n: sStr(o.n), d: sStr(o.d, 60), pl: sStr(o.pl), cp: sStr(o.cp), g: sStr(o.g, 40), a: { name: sStr(o.a.name, 60), grade: sStr(o.a.grade, 10), team: sStr(o.a.team, 80), bib: sStr(o.a.bib, 20) },
        e: sList(o.e, 200).map(function (x) { return sRow(x, 12); }) };
    }
    if (!Array.isArray(o.r)) throw new Error('リンクの中身を読めませんでした');
    return { v: 1, n: sStr(o.n), d: sStr(o.d, 60), g: sStr(o.g, 40), rule: sStr(o.rule, 500), ts: sList(o.ts, 50).map(function (t) { return sStr(t, 80); }),
      r: sList(o.r, 5000).map(function (x) { return sRow(x, 40); }),
      c: sList(o.c, 1000).map(function (t) { if (!Array.isArray(t) || t.length > 4) throw new Error('リンクの中身の形が違います'); return [sStr(t[0])].concat([1, 2, 3].map(function (i) { return sList(t[i], 500).map(function (p) { return sRow(p, 2); }); })); }) };
  }
  async function decodePayload(str) {
    if (typeof str !== 'string' || str.length > MAX_LINK) throw new Error('リンクが長すぎます');
    var m = /^1\.([A-Za-z0-9_-]+)$/.exec(str || ''); if (!m) throw new Error('リンクの形式が違います');
    if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは展開に対応していません');
    var o;
    try { o = JSON.parse(new TextDecoder().decode(await inflateLimited(unb64u(m[1]), MAX_INFLATE))); } catch (e) { throw new Error(/大きすぎ/.test(e.message) ? e.message : 'リンクの中身を読めませんでした（途中で切れている可能性があります）'); }
    return validatePayload(o);
  }
  // v0.20：URLから読み込む（LANE NOTE の Cloudflare 中継を通して取り、ファイルを入れたときと同じ handleFile に渡す）
  var URL_TARGETS = [
    { k: 'sl', label: '📄 スタートリスト', re: /スタート|start|プログラム|program|ｽﾀｰﾄ/i },
    { k: 'tt', label: '🕘 タイムテーブル', re: /タイム\s*テーブル|timetable|競技日程|日程|ﾀｲﾑﾃｰﾌﾞﾙ/i },
    { k: 'note', label: '📋 競技注意事項', re: /注意事項|注意/ },
    { k: 'yoko', label: '📑 大会要項', re: /要項|要綱/ }];
  var urlUi = null;
  function isUrlOnly(t) { return window.LaneUrl ? LaneUrl.isUrlOnly(t) : /^\s*https?:\/\/\S+\s*$/i.test(String(t || '')); }
  function showUrlNote(u, kind) { if (urlUi) urlUi.offer(u, kind); }
  function setupUrlLoad() {
    var el = $('urlLoad'); if (!el || !window.LaneUrl) return;
    urlUi = LaneUrl.mount(el, { id: 'pu', targets: URL_TARGETS, accept: ['pdf'], multiple: false,
      onFiles: function (files, k) { return handleFile(k, files[0]); } });
  }
  document.addEventListener('paste', function (e) {
    var t = e.target, tag = t && t.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    var s = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (isUrlOnly(s)) showUrlNote(s);
  });
  function shareBase() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SHARE_BASE; }
  /* カード表示（スマホ・閲覧モード共通）。中身はすべて esc() で文字として出す */
  function cardsTimeHtml(rows) {
    var out = [], prev = null, cur = null;
    rows.forEach(function (r) {
      var k = r.start + '|' + r.event + '|' + r.round;
      if (k !== prev) {
        if (cur) out.push('</div>');
        out.push('<div class="mc-g' + (r.tent ? ' tent' : '') + '"><div class="mc-h"><b class="mc-t">' + esc(r.start || '時刻不明') + '</b>' + (r.call ? '<span class="mc-call">招集 ' + esc(r.call) + '</span>' : '') +
          '<span class="mc-ev">' + esc(r.event) + '</span>' + (r.round ? '<span class="mc-rd">' + esc(r.round) + '</span>' : '') + (r.tent ? '<span class="mc-tent">通過したら</span>' : '') + '</div>');
        cur = true; prev = k;
      }
      out.push('<div class="mc-r"><span class="mc-heat">' + (r.heat && r.heat !== '-' ? esc(r.heat) + '組' : '') + '</span><span class="mc-pos"><small>' + esc(r.posLabel) + '</small>' + esc(r.pos) + '</span>' +
        '<span class="mc-bib">' + esc(r.bib) + '</span><span class="mc-name"><b>' + esc(r.name) + '</b><small>' + esc([r.grade, r.team].filter(Boolean).join('・')) + '</small>' +
        (r.members ? '<small class="mc-mem">' + esc(r.members) + '</small>' : '') + (r.note ? '<small class="mc-note">' + esc(r.note) + '</small>' : '') + '</span></div>');
    });
    if (cur) out.push('</div>');
    return out.join('') || '<p class="muted">該当なし</p>';
  }
  function cardsAthHtml(rows) {
    var by = {}, order = [];
    rows.forEach(function (r) { var k = r.team + '|' + (r.relay ? 'R|' + r.name.replace(/^（(.*)）$/, '$1') : r.bib); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
    order.sort(function (a, b) {
      var A = by[a][0], B = by[b][0];
      return A.team.localeCompare(B.team, 'ja') || (A.relay - B.relay) || ((parseInt(A.bib, 10) || 0) - (parseInt(B.bib, 10) || 0)) || A.name.localeCompare(B.name, 'ja');
    });
    return order.map(function (k) {
      var L = by[k], f = L[0];
      return '<div class="mc-g mc-a"><div class="mc-h">' + (f.bib ? '<b class="mc-bibh">' + esc(f.bib) + '</b>' : '<b class="mc-bibh">リレー</b>') + '<span class="mc-ev">' + esc(f.name) + '</span><span class="mc-call">' + esc([f.grade, f.team].filter(Boolean).join('・')) + '</span></div>' +
        (f.members ? '<div class="mc-mem2">' + esc(f.members) + '</div>' : '') +
        L.map(function (r) {
          return '<div class="mc-r' + (r.tent ? ' tent' : '') + '"><span class="mc-t2">' + esc(r.start || '—') + '</span><span class="mc-name"><b>' + esc(r.event) + (r.round ? ' <small class="mc-rd">' + esc(r.round) + '</small>' : '') + (r.tent ? ' <small class="mc-tent">通過したら</small>' : '') + '</b>' +
            '<small>' + esc([(r.heat && r.heat !== '-' ? r.heat + '組' : ''), r.tent ? '' : r.posLabel + ' ' + r.pos, r.call ? '招集 ' + r.call : ''].filter(Boolean).join('・')) + '</small></span></div>';
        }).join('') + '</div>';
    }).join('') || '<p class="muted">該当なし</p>';
  }
  function cardsSumHtml(c) {
    var lst = function (l, u) { l = (l || []).filter(function (o) { return +o[1] > 0; }); return l.length ? l.map(function (o) { return esc(o[0]) + (u ? '番' : '') + '×' + esc(o[1]); }).join('　') : 'なし'; };
    var tot = function (l) { return (l || []).reduce(function (s, o) { return s + (+o[1] || 0); }, 0); };
    return c.map(function (t) {
      return '<div class="mc-g"><div class="mc-h"><span class="mc-ev">' + esc(t[0]) + '</span></div>' +
        '<div class="mc-s"><b>腰番</b> ' + tot(t[1]) + '枚<br><small>' + lst(t[1], true) + '</small></div>' +
        '<div class="mc-s"><b>ゼッケン</b> ' + tot(t[2]) + '枚<br><small>' + lst(t[2]) + '</small></div>' +
        '<div class="mc-s"><b>オーダー番号</b> ' + tot(t[3]) + '枚<br><small>' + lst(t[3]) + '</small></div></div>';
    }).join('') || '<p class="muted">なし</p>';
  }
  /* ---------- 短いリンク（v0.10）：Googleでログイン中なら共有の中身を Firebase の shares/{id} に置き、?s=<id> だけのリンクにする ---------- */
  var FB_VER = '10.14.1', FB = null, SHARE_DAYS = 119;   // v0.14：ルールの上限は120日。端末の時計のずれに備えて1日短くする
  var FBCFG = window.LANE_FIREBASE_CONFIG || null;
  var CLOUD_OK = !!(FBCFG && FBCFG.apiKey && !/^YOUR_|^__/.test(FBCFG.apiKey) && FBCFG.projectId);
  async function loadFirebase() {
    if (FB) return FB;
    if (!CLOUD_OK) throw new Error('Firebase の設定がありません');
    var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var m = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(FBCFG);   // 不具合・要望フォームが先に初期化していても大丈夫なように
    FB = { A: m[1], F: m[2], auth: m[1].getAuth(app), fs: m[2].getFirestore(app) };
    try { await FB.auth.authStateReady(); } catch (e) { }
    LaneAuth.redirectResult(FB);   // v0.15（再監査A06）：ログインは popup だけ（v0.14 の redirect の印を消すだけ）
    lastUid = FB.auth.currentUser ? FB.auth.currentUser.uid : null;
    if (FB.A.onAuthStateChanged) FB.A.onAuthStateChanged(FB.auth, onShareAuth);
    return FB;
  }
  /* v0.15（再監査A02）：大会準備のページにも「認証の世代（authEpoch）＋uid」を入れる。
     ログイン・ログアウト・切り替え（別タブでのログアウトも onAuthStateChanged で届く）のたびに世代を進め、
     読み込み途中の共有一覧・作成中の短いリンクの結果は、世代か uid が違えば画面に出さない */
  var authEpoch = 0, lastUid = null;
  function curUid() { return FB && FB.auth.currentUser ? FB.auth.currentUser.uid : null; }
  function authScope() { return { uid: curUid(), epoch: authEpoch }; }
  function authOk(sc) { return sc.epoch === authEpoch && sc.uid === curUid(); }
  function abortErr() { var e = new Error('ログインしているアカウントが変わったため、中止しました'); e.code = 'auth-context-changed'; return e; }
  function clearAllShares() {
    document.querySelectorAll('.myShares').forEach(function (b) { b.dataset.gen = String((+b.dataset.gen || 0) + 1); b.innerHTML = '<p class="small muted">Googleでログインすると、作った短いリンクの一覧が出て、共有を止められます。</p>'; });
  }
  function onShareAuth(u) {
    var uid = u ? u.uid : null;
    if (uid === lastUid) return;
    lastUid = uid; authEpoch++;
    clearAllShares(); shareShort = ''; PL.links = {}; PBS = { sc: null, look: null }; setTimeout(function () { loadPBs().catch(function () { }); }, 0);
    try { renderShareAuth(); plAuth(); if (!$('playerDlg').hidden) renderPlayerList(); } catch (e) { }
    if (uid) document.querySelectorAll('.myShares').forEach(function (b) { renderMyShares(b); });
  }
  function newShareId() {   // 10文字の英数字（62種）。crypto の乱数を使う（推測できない）
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '', b = new Uint8Array(1);
    while (out.length < 10) { crypto.getRandomValues(b); if (b[0] < 248) out += A[b[0] % 62]; }
    return out;
  }
  function withTimeout(pr, ms) { return Promise.race([pr, new Promise(function (_, ng) { setTimeout(function () { var e = new Error('時間切れ（通信できませんでした）'); e.code = 'network-timeout'; ng(e); }, ms); })]); }
  async function makeShortUrl(str, label, sc) {
    await loadFirebase();
    sc = sc || authScope(); if (!authOk(sc)) throw abortErr();
    var u = FB.auth.currentUser; if (!u) return null;
    if (str.length > 190000) throw new Error('中身が大きすぎて短いリンクにできません');
    var id = newShareId(), exp = FB.F.Timestamp.fromMillis(Date.now() + SHARE_DAYS * 864e5);
    // v0.14（監査F07）：自分の一覧（users/{uid}/shareIndex/{id}）も同時に作り、あとから止められるようにする
    var b = FB.F.writeBatch(FB.fs);
    b.set(FB.F.doc(FB.fs, 'shares', id), { data: str, ownerUid: u.uid, createdAt: FB.F.serverTimestamp(), expiresAt: exp });
    b.set(FB.F.doc(FB.fs, 'users', u.uid, 'shareIndex', id), { createdAt: FB.F.serverTimestamp(), expiresAt: exp, label: String(label || '大会の予定').slice(0, 80) });
    try { await withTimeout(b.commit(), 15000); }
    catch (e) { if (e && /permission-denied/.test(e.code || '')) { var x = new Error('サーバーに断られました。端末の時計が大きくずれていると作れません（設定で日付と時刻を「自動」にしてください）'); x.code = e.code; throw x; } throw e; }
    if (!authOk(sc)) throw abortErr();   // 作っている間にアカウントが変わったら、前の人のリンクを画面に出さない
    return shareBase() + '?s=' + id;
  }
  // v0.14（監査F08）：期限切れ・止めたリンク・見つからないリンクは、エラーの種類（code）を付けて返す
  function shareErr(code, msg) { var e = new Error(msg); e.code = code; return e; }
  async function fetchShare(id) {
    await loadFirebase();
    var d;
    try { d = await withTimeout(FB.F.getDoc(FB.F.doc(FB.fs, 'shares', id)), 15000); }
    catch (e) {
      var c = String(e && e.code || '').replace(/^firestore\//, '');
      if (c === 'permission-denied') throw shareErr('permission-denied', 'このリンクは有効期限が切れたか、作った先生が共有を止めました');
      throw shareErr(c || 'unavailable', e && e.message || '通信できませんでした');
    }
    if (!d.exists()) throw shareErr('share-not-found', 'このリンクは見つかりませんでした（作った先生が共有を止めたか、期限切れの可能性があります）');
    var x = d.data(), ms = function (t) { return t && t.toMillis ? t.toMillis() : null; };
    var exp = ms(x.expiresAt), made = ms(x.createdAt), until = Math.min(exp || Infinity, made ? made + 120 * 864e5 : Infinity);
    if (until < Date.now()) throw shareErr('share-expired', 'このリンクは有効期限が切れています');
    if (typeof x.data !== 'string') throw shareErr('share-bad', 'リンクの中身を読めませんでした');
    return { data: x.data, createdAt: made, expiresAt: isFinite(until) ? until : null };
  }
  // 自分が作った短いリンクの一覧と、共有を止める（shares/{id} と一覧の両方を消す）
  async function listMyShares(sc) {
    await loadFirebase(); sc = sc || authScope(); if (!sc.uid) return null; if (!authOk(sc)) throw abortErr();
    var snap = await withTimeout(FB.F.getDocs(FB.F.collection(FB.fs, 'users', sc.uid, 'shareIndex')), 15000), out = [];
    if (!authOk(sc)) throw abortErr();
    snap.forEach(function (d) { var x = d.data() || {}; out.push({ id: d.id, label: x.label || '', createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : null, expiresAt: x.expiresAt && x.expiresAt.toMillis ? x.expiresAt.toMillis() : null }); });
    return out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }
  async function stopShare(id) {
    await loadFirebase(); var u = FB.auth.currentUser; if (!u) throw new Error('ログインが必要です');
    var b = FB.F.writeBatch(FB.fs);
    b.delete(FB.F.doc(FB.fs, 'shares', id)); b.delete(FB.F.doc(FB.fs, 'users', u.uid, 'shareIndex', id));
    await withTimeout(b.commit(), 15000);
  }
  function fmtDay(ms) { if (!ms) return '—'; var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate(); }
  async function renderMyShares(box) {
    if (!box) return;
    var gen = String((+box.dataset.gen || 0) + 1); box.dataset.gen = gen;   // この枠への描画の世代（あとから来た古い応答は捨てる）
    if (!CLOUD_OK || !(FB && FB.auth.currentUser)) { box.innerHTML = '<p class="small muted">Googleでログインすると、作った短いリンクの一覧が出て、共有を止められます。</p>'; return; }
    var sc = authScope(), fresh = function () { return box.dataset.gen === gen && authOk(sc); };
    box.innerHTML = '<p class="small muted">読み込んでいます…</p>';
    try {
      var list = await listMyShares(sc), now = Date.now();
      if (!fresh()) return;
      box.innerHTML = list && list.length ? '<ul class="myshares">' + list.map(function (x) {
        var dead = x.expiresAt && x.expiresAt < now;
        return '<li><span><b>' + esc(x.label || '短いリンク') + '</b><small>作成 ' + fmtDay(x.createdAt) + '・' + (dead ? '期限切れ' : fmtDay(x.expiresAt) + ' まで') + '・?s=' + esc(x.id) + '</small></span><button type="button" class="btn sub danger-t" data-stopshare="' + esc(x.id) + '">' + (dead ? '一覧から消す' : '共有を止める') + '</button></li>';
      }).join('') + '</ul>' : '<p class="small muted">短いリンクはまだ作っていません（v0.14より前に作ったリンクは、ここには出ません）。</p>';
    } catch (e) { if (!fresh() || e.code === 'auth-context-changed') return; box.innerHTML = '<p class="small ng">一覧を読めませんでした：' + esc(e.message) + '</p>'; }
  }
  document.addEventListener('click', async function (e) {
    var b = e.target.closest && e.target.closest('[data-stopshare]'); if (!b) return;
    var id = b.getAttribute('data-stopshare');
    if (!confirm('このリンク（?s=' + id + '）の共有を止めます。止めると、このリンクからは誰も開けなくなります。元に戻せません。\n\n※すでに相手の端末に「保存」されたコピー・長いリンク・スクリーンショットは、共有を止めても消せません。\n\nよろしいですか？')) return;
    b.disabled = true;
    try { await stopShare(id); document.querySelectorAll('.myShares').forEach(renderMyShares); }
    catch (x) { b.disabled = false; alert('止められませんでした：' + x.message); }
  });
  var shareLong = '', shareShort = '';
  function renderShareAuth() {
    var u = FB && FB.auth.currentUser, box = $('shareAuth');
    if (!box) return;
    if (!CLOUD_OK) { box.hidden = true; return; }
    box.hidden = false;
    $('shareAuthInfo').innerHTML = u ? '☁ <b>' + esc(u.email || u.displayName || 'ログイン中') + '</b> でログイン中：短いリンクを作れます' : 'Googleでログインすると、短いリンク（QRも小さく）で共有できます。';
    $('shareSignIn').hidden = !!u; $('shareSignOut').hidden = !u;
  }
  function showShareUrl(url, note) {
    $('shareUrl').value = url;
    var file = !/^https?:$/.test(location.protocol), isShort = url === shareShort && !!shareShort;
    $('shareInfo').innerHTML = '<b>' + esc(state.teams.join('・')) + '</b>（' + state.rows.length + '件）　リンクの長さ：<b>' + url.length.toLocaleString() + '文字</b>' + (isShort ? '（短いリンク・作ってから' + SHARE_DAYS + '日間有効）' : '') +
      (note ? '<div class="warn small">' + note + '</div>' : '') +
      (!isShort && url.length > URL_WARN ? '<div class="warn">⚠ リンクがとても長いです（' + URL_WARN.toLocaleString() + '文字超）。アプリによっては切れてしまうので、学校を減らして作り直すか、Googleでログインして短いリンクにしてください。</div>' : '') +
      (file ? '<div class="warn small">このページはパソコンのファイルとして開いているため、リンクは公開版のアドレス（' + esc(SHARE_BASE) + '）で作りました。公開版で開いたときに表示されます。</div>' : '');
    $('shareHow').textContent = isShort ? '短いリンクの中身（選んだ学校の結果）は LANE NOTE の Firebase（Google）に保存され、作ってから' + SHARE_DAYS + '日のあいだ、リンクを知っている人なら誰でも見られます（期限を過ぎると開けなくなります。下の「作った短いリンク」からいつでも止められます）。ただし、受け取った人が「この端末に保存」したコピー（電波のない端末）・スクリーンショットは、止めても回収できません。PDFそのものは入りません。' : '結果はリンクの「#」より後ろに圧縮して入っています。この部分はサーバーへ送られません（開いた端末の中だけで表示します）。長いリンクは止めることができません（送った相手・保存したコピー・スクリーンショットは残ります）。PDFそのものは入りません。';
    var qr = $('shareQr');
    if (url.length <= QR_MAX && typeof qrcode === 'function') {
      try { var q = qrcode(0, isShort ? 'M' : 'L'); q.addData(url, 'Byte'); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 3, margin: 3, scalable: true }); }
      catch (e) { qr.innerHTML = '<p class="warn small">QRコードを作れませんでした（' + esc(e.message) + '）。リンクをコピーして送ってください。</p>'; }
    } else qr.innerHTML = '<p class="warn small">リンクが長すぎてQRコードに入りません（' + url.length.toLocaleString() + '文字／上限 約' + QR_MAX.toLocaleString() + '文字）。リンクをコピーして送るか、Googleでログインして短いリンクにしてください。</p>';
  }
  async function tryShort(str) {
    shareShort = ''; var sc = authScope();
    if (!CLOUD_OK) { showShareUrl(shareLong, ''); return; }
    $('shareInfo').innerHTML = '短いリンクを作っています…';
    try {
      var s = await makeShortUrl(str, '大会：' + ($('meetName').value || '（大会名なし）') + '（' + state.teams.join('・').slice(0, 30) + '）', sc); if (!authOk(sc)) return; renderShareAuth();
      if (s) { shareShort = s; showShareUrl(s, ''); }
      else showShareUrl(shareLong, 'ログインしていないので、長いリンクで作りました（下の「Googleでログイン」で短くできます）。');
    } catch (e) { if (e.code === 'auth-context-changed' || !authOk(sc)) { renderShareAuth(); showShareUrl(shareLong, 'ログインしているアカウントが変わったので、長いリンクに戻しました。'); return; } renderShareAuth(); showShareUrl(shareLong, '短いリンクを作れなかったので、長いリンクで作りました（' + esc(e.message) + '）。'); }
  }
  var shareStr = '';
  async function openShare() {
    if (!state.rows.length) { alert('先に学校を選んで結果を出してください。'); return; }
    var dlg = $('shareDlg');
    try { shareStr = await encodePayload(payloadFromState()); } catch (e) { alert(e.message); return; }
    shareLong = shareBase() + '#d=' + shareStr; shareShort = '';
    $('shareUrl').value = ''; $('shareQr').innerHTML = '';
    renderShareAuth(); renderMyShares($('shareMine'));
    dlg.hidden = false; $('shareCopy').focus();
    await tryShort(shareStr);
  }
  async function shareSignIn() {
    try { await loadFirebase(); if (await LaneAuth.signIn(FB) !== 'popup') return; }
    catch (e) { $('shareAuthInfo').innerHTML = '<span class="ng">✖ ログインできませんでした：' + esc(LaneAuth.errorText(e)) + '</span>'; return; }
    onShareAuth(FB.auth.currentUser);
    renderShareAuth(); renderMyShares($('shareMine')); if (shareStr) await tryShort(shareStr);
  }
  // v0.14（監査F04）：大会準備のページでログアウトしても、同じ人の「記録」の控え（この端末）を消す
  async function shareSignOut() {
    if (!confirm('ログアウトします。この端末に残っている「記録」ページの控え（ログイン中の記録のコピー）も消します。クラウドの記録・作った短いリンクは消えません。')) return;
    var uid = null; try { await loadFirebase(); uid = FB.auth.currentUser && FB.auth.currentUser.uid; } catch (e) { }
    authEpoch++; clearAllShares();   // 進行中の一覧読み込み・短いリンク作成の結果は出さない
    var r = FB ? await LaneAuth.signOutAndWipe(FB, uid) : { signedOut: false, error: new Error('ログインの部品を読み込めませんでした') };
    if (r.signedOut) { lastUid = null; authEpoch++; PL.links = {}; ssClear(); }
    shareShort = ''; renderShareAuth(); clearAllShares(); plAuth();
    var msg = !r.signedOut ? '✖ ログアウトできませんでした：' + LaneAuth.errorText(r.error) : r.wiped ? 'ログアウトし、この端末の記録の控えも消しました。' : '⚠ ログアウトはしましたが、この端末の記録の控えを消せませんでした：' + (r.error && r.error.message) + '（記録のページを閉じてから、もう一度ログイン→ログアウトしてください）';
    if (shareLong) showShareUrl(shareLong, esc(msg) + (r.signedOut ? '（長いリンクに戻しました）' : '')); else alert(msg);
  }
  function loadSaved() { try { var a = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function storeSaved(a) { localStorage.setItem(SAVE_KEY, JSON.stringify(a)); }
  function renderSaved() {
    var a = loadSaved(), html = a.length ? '<ul class="saved">' + a.map(function (s) {
      return '<li><button class="btn sub sv-open" data-id="' + esc(s.id) + '">' + esc((s.title || '（大会名なし）') + (s.date ? '　' + s.date : '')) + '<small>' + esc((s.teams || []).join('・')) + (s.exp ? '・' + fmtDay(s.exp) + 'まで' : s.shareId ? '' : '・長いリンクから保存') + '</small></button>' +
        '<button class="btn sub sv-del" data-id="' + esc(s.id) + '" aria-label="削除">削除</button></li>';
    }).join('') + '</ul>' : '<p class="small muted">この端末に保存した大会はまだありません。</p>';
    document.querySelectorAll('.savedList').forEach(function (box) {
      box.innerHTML = html;
      box.querySelectorAll('.sv-open').forEach(function (b) { b.addEventListener('click', function () { var s = loadSaved().find(function (x) { return x.id === b.dataset.id; }); if (s) openSaved(s); }); });
      box.querySelectorAll('.sv-del').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('この大会をこの端末から削除しますか？')) return; storeSaved(loadSaved().filter(function (x) { return x.id !== b.dataset.id; })); renderSaved(); }); });
    });
    $('savedHome').hidden = !a.length || document.body.classList.contains('viewer-mode');
  }
  /* v0.15（再監査A07）：大会全体の「この端末に保存」も、短いリンクから保存したものは元のリンクID・期限を持つ。
     開くとき：期限切れなら消して開かない／電波があれば元のリンクがまだ有効か確かめ、止めた・期限切れ・見つからないなら消す／
     電波がないときだけ期限内のコピーを出す。長いリンクから保存したもの（元のリンクIDなし）は、独立したコピーとして残る（その旨を表示） */
  function dropSaved(id) { storeSaved(loadSaved().filter(function (x) { return x.id !== id; })); renderSaved(); }
  function savedGone(msg) { document.body.classList.add('viewer-mode'); $('viewer').hidden = false; $('vTitle').textContent = 'LANE NOTE 閲覧'; ['vTime', 'vAth', 'vCards'].forEach(function (k) { $(k).innerHTML = ''; }); $('vTime').innerHTML = '<div class="warn"><b>この保存した大会は開けません。</b><br>' + esc(msg) + '。<br><small>この端末に保存していたコピーも消しました。</small></div>'; }
  async function openSaved(s) {
    if (s.exp && s.exp < Date.now()) { dropSaved(s.id); savedGone('元の短いリンクの有効期限が切れています'); return 'expired'; }
    if (s.shareId && CLOUD_OK) {
      try { var sh = await fetchShare(s.shareId); await openViewerStr(sh.data, false, s.shareId, sh.expiresAt); return 'online'; }
      catch (e) {
        if (/^(permission-denied|share-expired|share-not-found)$/.test(e.code || '')) { dropSaved(s.id); savedGone(e.message); return 'stopped'; }
      }
    }
    await openViewerStr(s.p, false, s.shareId, s.exp);
    if (s.shareId && CLOUD_OK) $('vMeta').textContent += '　⚠ 電波がないので、この端末に保存したコピーを出しています';
    return 'local';
  }
  function sid(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var viewing = null;
  async function openViewerStr(str, fromLink, shareId, exp) {
    var o;
    try { o = await decodePayload(str); if (o.k === 'ms') { if (shareId) location.replace('records.html?s=' + encodeURIComponent(shareId)); return; } if (o.k === 'p') { openPlayer(o, str, shareId || sid(str), exp); return; } if (o.k === 'pp') { openPersonal(o, str, shareId || sid(str), exp); return; } } catch (e) { document.body.classList.add('viewer-mode'); $('viewer').hidden = false; $('vBody').innerHTML = '<p class="warn">リンクを読めませんでした：' + esc(e.message) + '（リンクが途中で切れている可能性があります）</p>'; $('vTitle').textContent = 'LANE NOTE 閲覧'; return; }
    viewing = { str: str, o: o, shareId: shareId && /^[A-Za-z0-9]{6,40}$/.test(shareId) ? shareId : null, exp: exp || null };
    document.body.classList.add('viewer-mode'); $('viewer').hidden = false;
    $('vTitle').textContent = o.n || '（大会名なし）';
    $('vMeta').textContent = [o.d, o.ts.join('・'), o.g ? '作成 ' + new Date(o.g).toLocaleString('ja-JP') : ''].filter(Boolean).join('　');
    $('vRule').textContent = o.rule || '';
    var rows = o.r.map(rowObj);
    $('vTime').innerHTML = cardsTimeHtml(rows); $('vAth').innerHTML = cardsAthHtml(rows); $('vCards').innerHTML = cardsSumHtml(o.c);
    var saved = loadSaved().some(function (x) { return x.id === sid(str); });
    $('vSave').textContent = saved ? '✔ この端末に保存済み' : '📥 この端末に保存'; $('vSave').disabled = saved;
    renderSaved(); window.scrollTo(0, 0);
  }
  function saveViewing() {
    if (!viewing) return;
    try {
      var a = loadSaved().filter(function (x) { return x.id !== sid(viewing.str); });
      a.unshift({ id: sid(viewing.str), title: viewing.o.n, date: viewing.o.d, teams: viewing.o.ts, savedAt: new Date().toISOString(), p: viewing.str, shareId: viewing.shareId, exp: viewing.exp });
      storeSaved(a); $('vSave').textContent = '✔ この端末に保存済み'; $('vSave').disabled = true; renderSaved();
      $('vMeta').textContent += viewing.shareId ? '　（保存しました：元のリンクの期限まで。止められたリンクは、次に電波のあるところで開いたときに消えます）' : '　（保存しました：長いリンクからのコピーなので、この端末で消すまで残ります）';
    } catch (e) { alert('保存できませんでした（ブラウザの設定・プライベートモード・容量の可能性）：' + e.message); }
  }
  function closeViewer() { document.body.classList.remove('viewer-mode'); $('viewer').hidden = true; viewing = null; if (/^#d=/.test(location.hash) || /[?&]s=/.test(location.search)) history.replaceState(null, '', location.pathname); renderSaved(); if (window.LaneMode) LaneMode.apply(); }
  function setupShare() {
    $('btnShare').addEventListener('click', openShare);
    if (window.LaneShareTip) { LaneShareTip.attach($('btnShare'), LaneShareTip.T.prep); LaneShareTip.attach($('btnPlayers'), LaneShareTip.T.prep); }
    $('shareClose').addEventListener('click', function () { $('shareDlg').hidden = true; });
    $('shareDlg').addEventListener('click', function (e) { if (e.target === $('shareDlg')) $('shareDlg').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('shareDlg').hidden = true; });
    $('shareCopy').addEventListener('click', function () {
      var u = $('shareUrl').value, done = function () { $('shareCopy').textContent = '✔ コピーしました'; setTimeout(function () { $('shareCopy').textContent = '🔗 リンクをコピー'; }, 1800); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(u).then(done, function () { $('shareUrl').select(); document.execCommand('copy'); done(); });
      else { $('shareUrl').select(); document.execCommand('copy'); done(); }
    });
    $('shareSignIn').addEventListener('click', shareSignIn);
    $('shareSignOut').addEventListener('click', shareSignOut);
    $('vSave').addEventListener('click', saveViewing);
    $('vClose').addEventListener('click', closeViewer);
    document.querySelectorAll('#viewer .vtabs button').forEach(function (b) { b.addEventListener('click', function () {
      document.querySelectorAll('#viewer .vtabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      ['vTime', 'vAth', 'vCards'].forEach(function (id) { $(id).hidden = id !== b.dataset.v; });
    }); });
    var fromHash = function () { var m = /^#[dp]=(.+)$/.exec(location.hash); if (m) openViewerStr(m[1], true); };
    window.addEventListener('hashchange', fromHash);
    var fromQuery = async function () {
      var m = /[?&]s=([A-Za-z0-9]{6,40})(?:&|$)/.exec(location.search); if (!m) return false;
      var id = m[1];
      document.body.classList.add('viewer-mode'); $('viewer').hidden = false; $('vTitle').textContent = 'LANE NOTE 閲覧'; $('vTime').innerHTML = '<p class="small muted">読み込んでいます…</p>';
      try { var sh = await fetchShare(id); await openViewerStr(sh.data, true, id, sh.expiresAt); }
      catch (e) {
        // v0.14（監査F08）：期限切れ・停止・見つからないときは、端末の控えも消して開かない。控えを使うのは通信できないときだけ（しかも期限内）
        if (/^(permission-denied|share-expired|share-not-found)$/.test(e.code || '')) {
          try { localStorage.removeItem(PKEY + id); storeSaved(loadSaved().filter(function (x) { return x.shareId !== id; })); } catch (x) { }
          $('vTime').innerHTML = '<div class="warn"><b>このリンクは開けません。</b><br>' + esc(e.message) + '。<br><small>この端末に残っていた予定も消しました。新しいリンクが必要なら、先生に聞いてください。</small></div>';
          return true;
        }
        var keep = pvLoad(id);
        if (/^(unavailable|network-timeout|deadline-exceeded)$/.test(e.code || '') && keep && keep.p && keep.exp && keep.exp > Date.now()) { await openViewerStr(keep.p, true, id, keep.exp); $('pvMsg').textContent = '⚠ 電波がないので、この端末に保存しておいた予定を出しています（最新ではないかもしれません）'; return true; }
        $('vTime').innerHTML = '<p class="warn">リンクを開けませんでした：' + esc(e.message) + '（電波の良いところでもう一度開いてください）</p>'; }
      return true;
    };
    renderSaved();
    if (/^#[dp]=/.test(location.hash)) fromHash(); else fromQuery();
    // 公開版（https）のときだけ、このページ自体を端末に置いておく（オフラインでも閲覧できるように）。PDFや選手データはキャッシュしない
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  /* ---------- 選手用リンク（v0.11）：1人分だけの出場情報を、その子専用のリンク・QRにする ---------- */
  var PL = { list: [], links: {} };
  function playerMeta() {
    var cp = (settings().callPlace || '').trim();
    return { n: $('meetName').value || '', d: $('meetDate').value || '', pl: ($('plVenue').value || '').trim(), cp: cp === '未設定' ? '' : cp };
  }
  function plAuth() {
    var u = FB && FB.auth.currentUser;
    $('plAuth').hidden = !CLOUD_OK;
    $('plAuthInfo').innerHTML = u ? '☁ <b>' + esc(u.email || 'ログイン中') + '</b> でログイン中：短いリンク（' + SHARE_DAYS + '日間有効）を作ります' : 'Googleでログインすると、短いリンクになります（ログインなしだと長いリンク）。';
    $('plSignIn').hidden = !!u;
  }
  function renderPlayerList() {
    var A = PL.list;
    $('plList').innerHTML = A.length ? A.map(function (a, i) {
      var L = PL.links[a.key], n = state.rows.filter(function (r) { return PlayerLogic.payloadFor([r], a).e.length; }).length;
      return '<div class="pl-row" data-i="' + i + '"><div class="pl-who"><b>' + esc(a.name || '（名前なし）') + '</b><small>' + esc([a.bib ? a.bib + '番' : '', a.grade, a.team, n + '種目'].filter(Boolean).join('・')) + '</small></div>' +
        (L ? '<div class="pl-qr">' + L.qr + '</div><div class="pl-link"><input readonly value="' + esc(L.url) + '" aria-label="' + esc(a.name) + 'さんのリンク"><small>' + (L.short ? '短いリンク' : '長いリンク') + '・' + L.url.length + '文字</small><button class="btn sub pl-copy" type="button">コピー</button></div>' : '<div class="small muted">まだ作っていません</div>') + '</div>';
    }).join('') : '<p class="warn">自校の選手が見つかりません。先にスタートリストを読み込んで学校を選んでください。</p>';
    $('plList').querySelectorAll('.pl-copy').forEach(function (b) { b.addEventListener('click', function () { copyText(b.parentNode.querySelector('input').value, b, 'コピー'); }); });
    $('plCopyAll').disabled = !Object.keys(PL.links).length;
  }
  function copyText(t, btn, label) {
    var done = function () { btn.textContent = '✔ コピーしました'; setTimeout(function () { btn.textContent = label; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, function () { alert(t); });
    else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
  }
  function qrSvg(url, short) {
    if (url.length > QR_MAX || typeof qrcode !== 'function') return '<small class="warn">長すぎてQRにできません</small>';
    try { var q = qrcode(0, short ? 'M' : 'L'); q.addData(url, 'Byte'); q.make(); return q.createSvgTag({ cellSize: 2, margin: 2, scalable: true }); } catch (e) { return '<small class="warn">QRを作れませんでした</small>'; }
  }
  async function makePlayerLinks() {
    var btn = $('plMake'); btn.disabled = true; var meta = playerMeta(), signed = false, errs = 0;
    if (CLOUD_OK) { try { await withTimeout(loadFirebase(), 8000); signed = !!FB.auth.currentUser; } catch (e) { } }
    var sc = authScope();   // v0.15（再監査A02）：全員分を作り終えるまで、始めたときのアカウントに固定
    var stop = function () { btn.disabled = false; btn.textContent = '🔗 全員分のリンクを作る'; PL.links = {}; renderPlayerList(); $('plMsg').innerHTML = '<span class="warn">ログインしているアカウントが変わったので、作るのを止めました。もう一度押してください。</span>'; };   // 電波が悪くても止まらない（長いリンクで作る）
    for (var i = 0; i < PL.list.length; i++) {
      var a = PL.list[i]; btn.textContent = '作っています… ' + (i + 1) + '／' + PL.list.length;
      var str = await encodePayload(PlayerLogic.payloadFor(dispRows(), a, meta)), url = shareBase() + '#p=' + str, short = false;
      if (!authOk(sc)) return stop();
      if (signed) { try { var s = await makeShortUrl(str, '選手：' + (a.name || '') + '（' + (meta.n || '大会') + '）', sc); if (s) { url = s; short = true; } } catch (e) { if (e.code === 'auth-context-changed' || !authOk(sc)) return stop(); errs++; } }
      PL.links[a.key] = { url: url, short: short, qr: qrSvg(url, short), name: a.name };
      renderPlayerList();
    }
    if (!authOk(sc)) return stop();
    btn.disabled = false; btn.textContent = '🔁 リンクを作り直す'; renderMyShares($('plMine'));
    $('plMsg').innerHTML = errs ? '<span class="warn">' + errs + '人分は短いリンクを作れなかったので、長いリンクにしました。</span>' : '';
  }
  function openPlayers() {
    if (!state.rows.length) { alert('先にスタートリストを読み込んで、学校を選んでください。'); return; }
    PL.list = PlayerLogic.athletes(state.rows); PL.links = {};
    $('plMake').textContent = '🔗 全員分のリンクを作る'; $('plMsg').innerHTML = '';
    plAuth(); renderPlayerList(); $('playerDlg').hidden = false;
    if (CLOUD_OK) loadFirebase().then(function () { plAuth(); renderMyShares($('plMine')); }, function () { });
  }
  function copyAllPlayers() {
    var m = playerMeta(), t = (m.n ? '【' + m.n + '】' : '') + '大会当日の予定です。自分の名前のリンクを開いてください（ほかの人のリンクは開かないこと）\n※リンクを知っている人は誰でも開けます（パスワードのような鍵はありません）。グループの外には送らないでください。\n※先生が共有を止めると短いリンクは開けなくなりますが、スクリーンショットや転送された長いリンクは消せません。\n\n' +
      PL.list.filter(function (a) { return PL.links[a.key]; }).map(function (a) { return a.name + '：' + PL.links[a.key].url; }).join('\n');
    copyText(t, $('plCopyAll'), '📋 全員分をまとめてコピー（LINE用）');
  }
  /* ---------- 選手が開くページ（ログイン不要）。自分の予定はこの端末にだけ保存 ---------- */
  var PV = null, PKEY = 'lanenote.player.v1.';
  function pvLoad(id) { try { var o = JSON.parse(localStorage.getItem(PKEY + id) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  function pvStore() { try { localStorage.setItem(PKEY + PV.id, JSON.stringify({ p: PV.str, own: PV.own, tr: PV.tr || {}, at: new Date().toISOString(), exp: PV.exp || null })); } catch (e) { $('pvMsg').textContent = 'この端末に保存できませんでした（プライベートモードかもしれません）'; } }
  function pvNow() { var d = window.__playerNow ? new Date(window.__playerNow) : new Date(); return d; }
  function meetDay(s) { var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(String(s || '').normalize('NFKC')); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
  function hm(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h ? h + '時間' : '') + (m || !h ? m + '分' : ''); }
  function openPlayer(o, str, id, exp) {
    var saved = pvLoad(id);
    PV = { o: o, str: str, id: id, own: saved && Array.isArray(saved.own) ? saved.own.filter(function (x) { return x && typeof x === 'object'; }).slice(0, 100).map(function (x) { return { id: String(x.id || '').slice(0, 40), label: String(x.label || '').slice(0, 40), t: String(x.t || '').slice(0, 5) }; }) : [], edit: null, exp: exp || (saved && saved.exp) || null, tr: cleanTr(saved && saved.tr) };
    PP = null; document.body.classList.remove('personal-mode'); $('personal').hidden = true;
    document.body.classList.add('player-mode'); $('player').hidden = false; $('viewer').hidden = true;
    document.title = '大会当日の予定';
    $('pvName').textContent = (o.a && o.a.name ? o.a.name : '') + ' さん';
    $('pvMeet').innerHTML = [o.n ? '<b>' + esc(o.n) + '</b>' : '', o.d ? '📅 ' + esc(o.d) : '', o.pl ? '📍 ' + esc(o.pl) : ''].filter(Boolean).join('<br>');
    pvStore(); pvPresets(); pvRender(); pvCond(); window.scrollTo(0, 0);
    clearInterval(PV.tm); PV.tm = setInterval(pvRender, 30000);
  }
  function cleanTr(t) { var o = {}; if (t && typeof t === 'object') Object.keys(t).slice(0, 50).forEach(function (k) { if (t[k] === 'ok' || t[k] === 'out') o[String(k).slice(0, 200)] = t[k]; }); return o; }
  function pvItems() { return PlayerLogic.applyTent(PlayerLogic.merge(PlayerLogic.autoItems(PV.o), PV.own), PV.tr); }
  // v0.16：体調メモ（この大会の日の分。このスマホにだけ保存）
  function pvCond() {
    var d = LanePersonal.dayKey(PV.o.d) || LanePersonal.ymd(pvNow());
    $('pvCond').innerHTML = LanePersonal.condFormHtml(d, '📝 ' + LanePersonal.mdLabel(d) + 'の体調メモ');
    LanePersonal.bindCond($('pvCond'));
  }
  function pvRender() {
    var items = pvItems(), now = pvNow(), day = meetDay(PV.o.d), nowMin = now.getHours() * 60 + now.getMinutes();
    var today = !day || day.toDateString() === now.toDateString(), ni = today ? PlayerLogic.nextIndex(items, nowMin) : -1;
    var nx = ni >= 0 ? items[ni] : null;
    $('pvNext').innerHTML = nx ? '<div class="pv-nl">次は</div><div class="pv-nt">' + esc(nx.t) + '</div><div class="pv-nn">' + esc(nx.label) + '</div><div class="pv-nc">あと <b>' + hm(PlayerLogic.toMin(nx.t) - nowMin) + '</b></div>' :
      (day && day > now ? '<div class="pv-nn">大会の日は ' + (day.getMonth() + 1) + '月' + day.getDate() + '日です。<br>準備しておこう。</div>' : '<div class="pv-nn">今日の予定は終わりです。お疲れさま 🎉</div>');
    $('pvList').innerHTML = items.map(function (x, i) {
      var cls = 'pv-i pv-' + x.kind + (i === ni ? ' pv-now' : '') + (today && ni >= 0 && i < ni && PlayerLogic.toMin(x.t) != null ? ' pv-done' : '');
      var tag = (x.tent ? (x.confirmed ? '<span class="pv-tag ok">✔ 通過</span> ' : '<span class="pv-tag tent">通過したら</span> ') : '') + (x.kind === 'race' ? '<span class="pv-tag race">🏃 試合</span>' : x.kind === 'call' ? '<span class="pv-tag call">📣 招集</span>' : '');
      if (x.tent) cls += ' pv-tent' + (x.confirmed ? ' pv-ok' : '');
      var tops = x.tent && x.kind === 'race' ? '<div class="pv-tops">' + (x.confirmed ? '<button type="button" class="pv-undo" data-tk="' + esc(x.tent) + '">↩ 通過を取り消す</button>' : '<button type="button" class="pv-pass" data-tk="' + esc(x.tent) + '">🎉 通過！</button><button type="button" class="pv-out" data-tk="' + esc(x.tent) + '">敗退</button>') + '</div>' : '';
      return '<li class="' + cls + '"><div class="pv-t">' + esc(x.t || '--:--') + (x.t2 ? '<small>〜' + esc(x.t2) + '</small>' : '') + '</div><div class="pv-b">' + tag + '<b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</div>' +
        (x.auto ? '<div class="pv-lock" title="先生が入れた予定なので消せません">🔒</div>' : '<div class="pv-ops"><button type="button" class="pv-ed" data-id="' + esc(x.id) + '" aria-label="編集">✏️</button><button type="button" class="pv-del" data-id="' + esc(x.id) + '" aria-label="削除">🗑</button></div>') + tops + '</li>';
    }).join('') || '<li class="pv-i"><div class="pv-b">まだ予定がありません</div></li>';
    $('pvList').querySelectorAll('.pv-pass,.pv-out,.pv-undo').forEach(function (b) { b.addEventListener('click', function () {
      var k = b.dataset.tk;
      if (b.classList.contains('pv-out') && !confirm('「' + k.replace('|', ' ') + '」を「敗退」にして、予定から消しますか？（このスマホだけ。あとで戻せます）')) return;
      if (b.classList.contains('pv-undo')) delete PV.tr[k]; else PV.tr[k] = b.classList.contains('pv-pass') ? 'ok' : 'out';
      pvStore(); pvRender();
    }); });
    var hid = Object.keys(PV.tr).filter(function (k) { return PV.tr[k] === 'out'; });
    if (hid.length) $('pvList').insertAdjacentHTML('beforeend', '<li class="pv-i pv-tent"><div class="pv-b"><small>敗退にしたラウンド：' + esc(hid.map(function (k) { return k.replace('|', ' '); }).join('・')) + '</small></div><div></div><button type="button" class="pv-cancel" id="pvTrReset">元に戻す</button></li>');
    if ($('pvTrReset')) $('pvTrReset').addEventListener('click', function () { hid.forEach(function (k) { delete PV.tr[k]; }); pvStore(); pvRender(); });
    $('pvList').querySelectorAll('.pv-ed').forEach(function (b) { b.addEventListener('click', function () { pvEdit(b.dataset.id); }); });
    $('pvList').querySelectorAll('.pv-del').forEach(function (b) { b.addEventListener('click', function () {
      var o = PV.own.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!o || !confirm('「' + o.label + '」を削除しますか？')) return;
      PV.own = PV.own.filter(function (x) { return x !== o; }); pvStore(); pvRender();
    }); });
  }
  function firstAuto() { var a = PlayerLogic.autoItems(PV.o).map(function (x) { return PlayerLogic.toMin(x.t); }).filter(function (m) { return m != null; }); return a.length ? Math.min.apply(null, a) : null; }
  function pvPresets() {
    $('pvPresets').innerHTML = PlayerLogic.PRESETS.map(function (p) { return '<button type="button" class="pv-pre" data-l="' + esc(p[0]) + '" data-o="' + (p[1] == null ? '' : p[1]) + '">＋ ' + esc(p[0]) + '</button>'; }).join('');
    $('pvPresets').querySelectorAll('.pv-pre').forEach(function (b) { b.addEventListener('click', function () {
      var f = firstAuto(), off = b.dataset.o;
      $('pvLabel').value = b.dataset.l; $('pvTime').value = off !== '' && f != null ? MeetLogic.fmt(Math.max(0, f + (+off))).padStart(5, '0') : '';
      $('pvTime').focus();
    }); });
  }
  function pvEdit(id) {
    var o = PV.own.filter(function (x) { return x.id === id; })[0]; if (!o) return;
    PV.edit = id; $('pvLabel').value = o.label; $('pvTime').value = o.t ? o.t.padStart(5, '0') : ''; $('pvAdd').textContent = '✔ 更新'; $('pvCancel').hidden = false;
    $('pvForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function pvReset() { PV.edit = null; $('pvLabel').value = ''; $('pvTime').value = ''; $('pvAdd').textContent = '＋ 追加'; $('pvCancel').hidden = true; }
  function pvSubmit() {
    var l = $('pvLabel').value.trim().slice(0, 40), t = $('pvTime').value;
    if (!l) { $('pvMsg').textContent = '予定の内容を入れてください'; return; }
    if (!t) { $('pvMsg').textContent = '時刻を選んでください'; return; }
    t = t.replace(/^0(\d):/, '$1:'); $('pvMsg').textContent = '';
    if (PV.edit) PV.own.forEach(function (x) { if (x.id === PV.edit) { x.label = l; x.t = t; } });
    else PV.own.push({ id: 'o' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), label: l, t: t });
    pvStore(); pvReset(); pvRender();
  }
  /* ---------- v0.16：選手の個人ページ（記録ページで先生が作ったリンク。ログイン不要） ---------- */
  var PP = null;
  async function ppSchedules(name) {   // このスマホに保存している、同じ名前の「大会当日の予定」
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k || k.indexOf(PKEY) !== 0) continue;
        var v = pvLoad(k.slice(PKEY.length)); if (!v || typeof v.p !== 'string' || v.kind === 'pp') continue;
        if (v.exp && v.exp < Date.now()) continue;
        try { var o = await decodePayload(v.p); if (o.k !== 'p' || !o.a || o.a.name !== name) continue;
          var id = k.slice(PKEY.length); out.push({ url: /^[A-Za-z0-9]{10}$/.test(id) ? shareBase() + '?s=' + id : shareBase() + '#p=' + v.p, label: (o.n || '大会') + (o.d ? '（' + o.d + '）' : '') }); } catch (e) { }
      }
    } catch (e) { }
    return out.slice(0, 5);
  }
  async function openPersonal(o, str, id, exp) {
    PP = { o: o, str: str, id: id, exp: exp || null };
    try { localStorage.setItem(PKEY + id, JSON.stringify({ kind: 'pp', p: str, at: new Date().toISOString(), exp: exp || null })); } catch (e) { }
    if (PV) { clearInterval(PV.tm); }
    document.body.classList.remove('player-mode', 'viewer-mode'); document.body.classList.add('personal-mode'); $('personal').hidden = false; $('viewer').hidden = true; $('player').hidden = true;
    document.title = (o.a.name ? o.a.name + ' さんの' : '') + '記録';
    var sch = await ppSchedules(o.a.name);
    if (!PP || PP.id !== id) return;
    LanePersonal.render(o, $('ppBody'), { base: shareBase(), schedules: sch.filter(function (x) { return !(o.nx && x.url === shareBase() + '?s=' + o.nx.s); }) });
    $('ppTalk').hidden = true; $('ppTalk').innerHTML = '';   // v0.25（C302）：個人ページのリンクには、やり取りの招待を入れない（先生から別のリンクで受け取る）
    window.scrollTo(0, 0);
  }
  function setupPlayer() {
    $('ppForget').addEventListener('click', function () {
      if (!PP || !confirm('この記録のページを、このスマホから削除します（体調メモは残ります。体調メモはページの中の「体調メモを全部削除」で消せます）。よろしいですか？')) return;
      try { localStorage.removeItem(PKEY + PP.id); } catch (e) { }
      PP = null; $('ppTalk').hidden = true; $('ppTalk').innerHTML = ''; $('ppBody').innerHTML = '<div class="pp-snap">このスマホから削除しました。もう一度見るには、先生のリンクを開き直してください。</div>'; $('ppForget').hidden = true;
      history.replaceState(null, '', location.pathname);
    });
    $('btnPlayers').addEventListener('click', openPlayers);
    $('plClose').addEventListener('click', function () { $('playerDlg').hidden = true; });
    $('plMake').addEventListener('click', function () { makePlayerLinks().catch(function (e) { alert(e.message); $('plMake').disabled = false; }); });
    $('plCopyAll').addEventListener('click', copyAllPlayers);
    $('plSignIn').addEventListener('click', async function () { try { await loadFirebase(); if (await LaneAuth.signIn(FB) !== 'popup') return; } catch (e) { $('plAuthInfo').innerHTML = '<span class="ng">ログインできませんでした：' + esc(LaneAuth.errorText(e)) + '</span>'; return; } onShareAuth(FB.auth.currentUser); plAuth(); renderMyShares($('plMine')); });
    $('pvAdd').addEventListener('click', pvSubmit);
    $('pvCancel').addEventListener('click', pvReset);
    $('pvForget').addEventListener('click', function () {   // v0.14（監査F08）：この予定を端末から消す
      if (!PV || !confirm('この予定（自分で足した予定も）を、このスマホから消します。もう一度見るには、先生のリンクを開き直してください。よろしいですか？')) return;
      try { localStorage.removeItem(PKEY + PV.id); } catch (e) { }
      clearInterval(PV.tm); PV = null;
      ['pvName', 'pvMeet', 'pvNext', 'pvList'].forEach(function (k) { $(k).innerHTML = ''; });
      $('pvForm').hidden = true; $('pvForget').hidden = true;
      $('pvNext').innerHTML = '<div class="pv-nn">このスマホから予定を消しました。</div>';
      history.replaceState(null, '', location.pathname);
    });
  }
  var INIT_STATUS = {};
  /* ---------- v0.22.2 読み込んだ内容をこのタブの中だけに控える（再読み込み・「戻る」で消えないように）
     sessionStorage はタブを閉じると消える。「最初から」・ログアウトでも消す。 */
  var SS_KEY = 'lanenote-meet-session', ssTimer = 0, ssRestoring = false;
  var SS_STATE = ['sl', 'tt', 'notes', 'slName', 'ttName', 'noteName', 'yokoName', 'dateCands', 'feeParsed', 'feeFrom', 'prices', 'priceSrc', 'make', 'teamCat', 'teams', 'allTeams', 'progCopies', 'docText', 'day', 'athSort'];
  function ssClear() { clearTimeout(ssTimer); try { sessionStorage.removeItem(SS_KEY); } catch (e) { } }
  function ssSave() {
    if (ssRestoring) return; clearTimeout(ssTimer);
    ssTimer = setTimeout(function () {
      try {
        if (!state.sl && !state.tt && !state.notes && !state.yokoName) { sessionStorage.removeItem(SS_KEY); return; }
        var st = {}, inp = {}, stat = {};
        SS_STATE.forEach(function (k) { st[k] = state[k]; });
        document.querySelectorAll('main input[id], main select[id]').forEach(function (el) {
          if (el.type === 'file' || el.type === 'password' || el.closest('[role=dialog]')) return;
          inp[el.id] = el.type === 'checkbox' || el.type === 'radio' ? { c: el.checked } : { v: el.value, m: el.dataset.manual || '', a: el.dataset.auto || '' };
        });
        Object.keys(SID).forEach(function (k) { var el = $(SID[k]); stat[k] = { t: el.textContent, c: el.className }; /* S11：HTML ではなく文字だけ控える */ });
        sessionStorage.setItem(SS_KEY, JSON.stringify({ v: 1, t: Date.now(), st: st, inp: inp, stat: stat, rule: ruleState }));
      } catch (e) { }   // 入りきらないときは控えない（今まで通り）
    }, 400);
  }
  function ssRestore() {
    if (/^#[dp]=/.test(location.hash) || /[?&]s=/.test(location.search)) return false;   // 共有リンクを開いたときは戻さない
    var o = null; try { o = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch (e) { }
    if (!o || o.v !== 1 || !o.st) return false;
    ssRestoring = true;
    try {
      SS_STATE.forEach(function (k) { if (k in o.st) state[k] = o.st[k]; });
      Object.keys(o.inp || {}).forEach(function (id) {
        var el = $(id), x = o.inp[id]; if (!el || !x) return;
        if ('c' in x) el.checked = !!x.c; else { el.value = x.v; if (x.m) el.dataset.manual = x.m; if (x.a) el.dataset.auto = x.a; }
      });
      Object.keys(o.stat || {}).forEach(function (k) { var x = o.stat[k]; if (SID[k] && x && typeof x.t === 'string') setStatus(SID[k], String(x.t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }), ((x.c || '').match(/\b(ok|ng)\b/) || [''])[0]); });
      ruleState = o.rule || {}; renderRuleMarks(); renderFeePrices();
      try { updateDate(); } catch (e) { }
      renderDateMark(); updateTeams(); render();
      var n = $('ssNote'); if (n) n.hidden = false;
    } catch (e) { console.error(e); ssClear(); }
    ssRestoring = false;
    return true;
  }
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(ssRestore, 0);
    document.addEventListener('input', function (e) { if (!e.target.closest('[role=dialog]')) ssSave(); });
    document.addEventListener('change', function (e) { if (!e.target.closest('[role=dialog]')) ssSave(); });
    var c = $('ssClearBtn'); if (c) c.addEventListener('click', resetAll);
  });
  function resetAll() {
    if (!confirm('読み込んだPDF・学校・クラブ名・設定・枚数をすべて消して、新しい大会を始めます。よろしいですか？')) return;
    ssClear(); var sn = $('ssNote'); if (sn) sn.hidden = true;
    state.docText = {};
    Object.keys(loadSeq).forEach(function (k) { loadSeq[k]++; });   // 読み込み途中のものも捨てる
    Object.assign(state, { make: {}, dateCands: {}, feeParsed: null, feeFrom: '', prices: {}, priceSrc: {}, athSort: null, sl: null, tt: null, notes: null, slName: '', ttName: '', noteName: '', yokoName: '', rows: [], teams: [], allTeams: [], teamCat: {}, date: null, day: '', progCopies: {} });
    document.querySelectorAll('input, select').forEach(function (el) {
      if (el.type === 'file') el.value = ''; else if (el.type === 'checkbox') el.checked = el.defaultChecked;
      else if (el.tagName === 'SELECT') { Array.from(el.options).forEach(function (o) { o.selected = o.defaultSelected; }); } else el.value = el.defaultValue;
      el.classList.remove('bad'); delete el.dataset.manual; delete el.dataset.auto;
    });
    Object.keys(SID).forEach(function (k) { setStatus(SID[k], INIT_STATUS[k] || '', ''); });
    $('teamList').dataset.q = ''; ruleState = {}; renderRuleMarks(); renderFeePrices(); renderDateMark(); updateTeams(); render();
    window.scrollTo(0, 0);
  }
  window.__meetApp = { pdfName: pdfName, openVenues: openVenues, ssSave: ssSave, ssRestore: ssRestore, ssClear: ssClear, resetAll: resetAll, openPersonal: openPersonal, openPlayers: openPlayers, openPlayer: openPlayer, encodePayload: encodePayload, decodePayload: decodePayload, payloadFromState: payloadFromState, openShare: openShare, refreshPrint: refreshPrint, tableData: tableData, feeData: feeData, totalText: totalText, safeCell: safeCell, state: state, handleFile: handleFile, render: render, updateTeams: updateTeams };
})();
