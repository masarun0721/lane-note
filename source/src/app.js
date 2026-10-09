/* ===== 画面の動き ===== */
(function () {
  'use strict';
  var PDFJS_VER = '4.10.38';
  var PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/';
  var state = { make: {}, dateCands: {}, feeParsed: null, feeFrom: '', prices: {}, priceSrc: {}, athSort: null, sl: null, tt: null, notes: null, slName: '', ttName: '', noteName: '', rows: [], teams: [], allTeams: [], day: '' };
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
    state.feeParsed = null; state.feeFrom = '';
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
    setStatus(sid, '読み取り中…「' + esc(file.name) + '」', 'busy');
    try {
      var pages = await readPdf(file, function (p, n) { if (tok === loadSeq[kind]) setStatus(sid, '読み取り中…「' + esc(file.name) + '」 ' + p + '／' + n + 'ページ', 'busy'); });
      if (tok !== loadSeq[kind]) return;   // もっと新しいファイルが入れられた
      try { fillMeta(pages, fname); } catch (e) { }
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
    if (!m.name) { var f = (fname || '').match(/第\s*\d+\s*回[^_.\s]+/); if (f) m.name = f[0]; }

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
  function recRows() {
    return MeetLogic.byTime(state.rows).map(function (r) {
      return { g: grpKey(r), start: r.start || '', event: r.event + (r.round ? ' ' + r.round : ''), heat: r.heat, pos: r.posLabel + ' ' + r.pos, bib: r.typ === 'relay' ? '' : r.bib,
        name: r.typ === 'relay' ? r.relayTeam : r.name, members: r.typ === 'relay' ? r.members.map(function (m) { return m.bib + ' ' + m.name; }).join('、') : '',
        grade: r.grade || '', team: r.team, wind: isWind(r) };
    });
  }
  function recHead() {
    return { title: ($('meetName').value || '（大会名）') + '　記録用紙', sub: [$('meetDate').value, state.teams.join('・')].filter(Boolean).join('　') };
  }
  /* ---------- 印刷レイアウト（白黒プリンター向け） ---------- */
  function printGroups() {
    var groups = [], cur = null;
    MeetLogic.byTime(state.rows).forEach(function (r) {
      var g = grpKey(r);
      if (!cur || cur.key !== g) { cur = { key: g, start: r.start || '', call: r.call || '', event: r.event, round: r.round || '', rows: [], wind: isWind(r) }; groups.push(cur); }
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
    return '<tr class="pband"><th colspan="' + ncol + '"><div class="pb-in"><div class="pb-l"><img class="pb-icon" src="' + (typeof PRINT_ICON !== 'undefined' ? PRINT_ICON : '') + '" alt=""><span class="pb-kind">' + esc(kind) + '</span><span class="pb-meet">' + esc(name) + '</span></div>' +
      '<div class="pb-r">' + (date ? '<span class="pb-date">' + esc(date) + '</span>' : '') + '<span class="pb-school">' + esc(state.teams.join('・')) + '</span></div></div><div class="pb-lanes"><i></i><i></i><i></i></div></th></tr>';
  }
  function grpBar(g, ncol, extra) {
    return '<tr class="pgh"><td colspan="' + ncol + '"><span class="g-time">' + esc(g.start || '時刻不明') + '</span>' +
      (g.call ? '<span class="g-call"><em>招集</em>' + esc(g.call) + '</span>' : '') + '<span class="g-ev">' + esc(g.event) + '</span>' +
      (g.round ? '<span class="g-rd">' + esc(g.round) + '</span>' : '') + (g.cont ? '<span class="g-cont">（続き）</span>' : '') + '<span class="g-n">' + (g.total || g.rows.length) + (g.rows[0].typ === 'relay' ? 'チーム' : '名') + '</span>' + (extra || '') + '</td></tr>';
  }
  function nameHtml(r, multi) {
    return '<b>' + esc(r.typ === 'relay' ? r.relayTeam : r.name) + '</b>' + (r.typ === 'relay' ? '<span class="p-mem">' + esc(r.members.map(function (m) { return m.bib + ' ' + m.name; }).join('、')) + '</span>' : '') +
      (multi && r.typ !== 'relay' ? '<span class="p-team">' + esc(r.team) + '</span>' : '');
  }
  function posHtml(r) { return '<span class="p-pl">' + esc(r.posLabel) + '</span><b>' + esc(r.pos) + '</b>'; }
  function buildPrintTime() {
    var G = printGroups(), N = 7, multi = state.teams.length > 1;
    var info = '<tbody class="pinfo"><tr><td colspan="' + N + '"><div class="pi-box">' +
      '<div><em>出典</em><span>' + esc((state.sl.format === 'program' ? 'プログラム：' : 'スタートリスト：') + state.slName + (state.ttName ? '　タイムテーブル：' + state.ttName : '')) + '　<span class="pi-made">' + esc(new Date().toLocaleString('ja-JP')) + ' 作成</span></span></div>' +
      '<div><em>招集</em><span>' + esc(ruleSummaryText().replace(/^招集ルール：/, '')) + '</span></div>' +
      ($('feeInPrint').checked ? '<div><em>参加料</em><span>' + esc(feeData().map(function (f) { return f.team + ' ' + feeText(f); }).join('　')) + '</span></div>' : '') +
      '<div class="pi-disc">ⓘ 本ツールはPDFの文字を読み取って自動で整理しているだけです。内容は必ず元のスタートリスト・タイムテーブル等と照らし合わせ、最終的には目で確認してください。本ツールの利用により生じた不利益について、作成者は責任を負いかねます。</div></div></td></tr></tbody>';
    var body = G.map(function (g) {
      return '<tbody class="pg' + (g.cont ? ' cont' : '') + '">' + grpBar(g, N) + g.rows.map(function (r) {
        return '<tr><td class="c">' + esc(r.heat) + '</td><td class="c p-pos">' + posHtml(r) + '</td><td class="c p-bib">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="p-name">' + nameHtml(r, false) +
          '</td><td class="c">' + esc(r.grade) + '</td><td class="p-tm">' + esc(r.team) + '</td><td class="p-note">' + esc(r.note) + '</td></tr>';
      }).join('') + '</tbody>';
    }).join('');
    $('printTime').innerHTML = '<table class="ptab ptime"><colgroup><col style="width:8mm"><col style="width:20mm"><col style="width:15mm"><col><col style="width:11mm"><col style="width:22mm"><col style="width:46mm"></colgroup><thead>' + band('出場一覧（時間順）', N) +
      '<tr class="pcols"><th>組</th><th>レーン/順番</th><th>ナンバー</th><th>氏名</th><th>学年</th><th>所属</th><th>備考</th></tr></thead>' + info + body + '</table>';
  }
  function buildRecSheet() {
    var G = printGroups(), N = 8, multi = state.teams.length > 1;
    var info = '<tbody class="pinfo"><tr><td colspan="' + N + '"><div class="pi-box pi-legend"><span><i class="lg-h"></i>斜線の風欄＝風を測らない種目</span><span><i class="lg-w"></i>点線＝記入の目安</span><span class="pi-disc">ⓘ 本ツールはPDFの文字を読み取って自動で整理しているだけです。内容は必ず元のスタートリスト・タイムテーブル等と照らし合わせ、最終的には目で確認してください。本ツールの利用により生じた不利益について、作成者は責任を負いかねます。</span></div></td></tr></tbody>';
    var body = G.map(function (g) {
      return '<tbody class="pg' + (g.cont ? ' cont' : '') + '">' + grpBar(g, N, '<span class="g-wind">' + (g.wind ? '風 計測あり' : '風 なし') + '</span>') + g.rows.map(function (r) {
        var w = isWind(r);
        return '<tr class="rr"><td class="c">' + esc(r.heat) + '</td><td class="c p-pos">' + posHtml(r) + '</td><td class="c p-bib">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="p-name">' + nameHtml(r, multi) +
          '</td><td class="c">' + esc(r.grade) + '</td><td class="wc"><div class="wl"></div></td><td class="wc' + (w ? '' : ' nowind') + '">' + (w ? '<div class="wl"></div>' : '') + '</td><td class="wc"><div class="wl"></div></td></tr>';
      }).join('') + '</tbody>';
    }).join('');
    $('recSheet').innerHTML = '<table class="ptab prec"><colgroup><col style="width:8mm"><col style="width:20mm"><col style="width:15mm"><col><col style="width:11mm"><col style="width:34mm"><col style="width:17mm"><col style="width:14mm"></colgroup><thead>' + band('記録用紙', N) +
      '<tr class="pcols"><th>組</th><th>レーン/順</th><th>ナンバー</th><th>氏名</th><th>学年</th><th>記録</th><th>風</th><th>順位</th></tr></thead>' + info + body + '</table>';
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
  function recAoa() {
    var h = recHead();
    var pg = null;
    return [[h.title], [h.sub], [], ['時刻', '種目', '組', 'レーン/順', 'ナンバー', '氏名', '学年', '記録', '風', '順位']].concat(recRows().map(function (r) {
      var same = r.g === pg; pg = r.g;
      return [same ? '' : r.start, same ? '' : r.event, r.heat, r.pos, r.bib, r.name + (r.members ? '（' + r.members + '）' : '') + (state.teams.length > 1 ? ' ' + r.team : ''), r.grade, '', r.wind ? '' : '－', ''];
    }));
  }
  function recWs() {
    var ws = XLSX.utils.aoa_to_sheet(safeAoa(recAoa()));
    ws['!cols'] = [7, 20, 5, 10, 8, 26, 6, 12, 7, 6].map(function (w) { return { wch: w }; });
    var n = recAoa().length; ws['!rows'] = [];
    for (var i = 0; i < n; i++) ws['!rows'].push(i >= 4 ? { hpt: 30 } : {});
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }];
    return ws;
  }
  function exportRecXlsx() {
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
    state.prices = {}; state.priceSrc = {};
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
      (fp && fp.program ? '<div class="small muted">※ プログラム代 ' + fp.program + '円は合計に含めていません。</div>' : '') +
      (fp && fp.other.length ? '<div class="small muted">※ その他：' + esc(fp.other.join('、')) + '（合計に含めていません）</div>' : '');
  }
  function feeData() {
    if (!state.sl) return [];
    // 複数日の大会でも参加料は大会全体の分（表示中の日だけで数えない）
    var F = MeetLogic.fees(state.allRows && state.allRows.length ? state.allRows : state.rows, state.teams, state.prices, { teamCat: state.teamCat || {} });
    var chk = MeetLogic.CATS.some(function (c) { return (state.priceSrc[c] || {}).ind === 'chk'; });
    F.forEach(function (f) { f.unsure = chk && f.lines.some(function (l) { return (state.priceSrc[l.cat] || {}).ind === 'chk' && l.ind; }); });
    return F;
  }
  // 単価が未設定・要確認のときは「合計」と言い切らない
  function totalText(f) { return f.missing.length ? '合計未確定（設定済み分の小計 ' + yen(f.total) + '・未設定：' + f.missing.join('・') + '）' : f.unsure ? '合計 ' + yen(f.total) + '（単価の単位 要確認）' : '合計 ' + yen(f.total); }
  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }
  function renderFees() {
    var F = feeData();
    $('feeArea').innerHTML = F.map(function (f) {
      var tc = (state.teamCat || {})[f.team] || '';
      return '<div class="cardbox ' + teamClass(f.team) + '"><h3>' + esc(f.team) + ' <label class="small">区分：<select class="teamcat" data-team="' + esc(f.team) + '">' + ['', '小学', '中学', '高校', '一般'].map(function (c) { return '<option value="' + c + '"' + (c === tc ? ' selected' : '') + '>' + (c || '自動（学年・種目名から）') + '</option>'; }).join('') + '</select></label></h3><table class="fee"><thead><tr><th>区分</th><th>個人</th><th>リレー</th><th>小計</th></tr></thead><tbody>' +
        f.lines.map(function (l) { var pr = function (n, p, u) { return n ? n + u + ' × ' + (p == null ? '<span class="warn">単価未設定</span>' : yen(p)) : '－'; };
          return '<tr><td>' + l.cat + '</td><td>' + pr(l.ind, l.indPrice, '種目') + '</td><td>' + pr(l.relay, l.relayPrice, 'チーム') + '</td><td>' + yen(l.sub) + '</td></tr>'; }).join('') +
        '</tbody></table><div class="feetot' + (f.missing.length || f.unsure ? ' unsure' : '') + '">' + esc(totalText(f)) + '</div>' +
        (multiDates().length > 1 ? '<div class="small muted">複数日の大会なので、全日程の出場分で計算しています。</div>' : '') +
        (f.lines.some(function (l) { return l.cat === MeetLogic.UNKNOWN; }) && state.feeParsed && state.feeParsed.allCats && state.prices[MeetLogic.UNKNOWN] ? '<div class="small muted">要項の参加料に区分（中学・高校など）の書き分けが無いため、全員同じ単価で計算しています。</div>' :
        f.lines.some(function (l) { return l.cat === MeetLogic.UNKNOWN; }) ? '<div class="warn small">「' + MeetLogic.UNKNOWN + '」は学年・種目名から中学／高校などを決められなかった分です。上の「区分」で学校の区分を選んでください。</div>' : '') + '</div>';
    }).join('');
    $('feeArea').querySelectorAll('select.teamcat').forEach(function (sel) { sel.addEventListener('change', function () { state.teamCat = state.teamCat || {}; state.teamCat[sel.dataset.team] = sel.value; renderFees(); refreshPrint(); }); });
    var pf = $('printFee'); if (pf) pf.textContent = $('feeInPrint').checked ? '参加料：' + F.map(function (f) { return f.team + ' ' + feeText(f); }).join('　') : '';
  }
  function feeText(f) { return f.lines.map(function (l) { return l.cat + (l.ind ? ' 個人' + l.ind + '種目×' + (l.indPrice == null ? '?' : l.indPrice) : '') + (l.relay ? ' リレー' + l.relay + 'チーム×' + (l.relayPrice == null ? '?' : l.relayPrice) : ''); }).join('、') + ' ＝ ' + totalText(f); }
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
    z.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) handleFile(kind, f); });
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
    if (!q) { box.innerHTML = '<span class="muted">学校名（一部でOK）を入れると候補が出ます</span>'; state.teams = []; return; }
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
  function posCell(r) { return '<span class="pl">' + esc(r.posLabel) + '</span> <b>' + esc(r.pos) + '</b>'; }
  function nameCell(r) {
    if (r.typ !== 'relay') return esc(r.name);
    return '<b>' + esc(r.relayTeam) + '</b><br><small>' + r.members.map(function (m) { return esc(m.bib + ' ' + m.name); }).join('、') + '</small>';
  }
  function teamClass(t) { var i = state.teams.indexOf(t); return 'tm' + (i % 4); }
  function render() {
    var res = $('results');
    if (!state.sl || !state.teams.length) { res.hidden = true; state.rows = []; state.allRows = []; refreshPrint(); return; }
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
    if (MD.length > 1 && !state.day) { state.rows = []; state.allRows = []; $('summary').innerHTML = ''; refreshPrint(); return; }
    var ttUse = state.tt && state.day ? state.tt.filter(function (s) { return !s.date || s.date === state.day; }) : state.tt;
    state.rows = MeetLogic.build(state.sl, ttUse, state.teams, S);
    // スタートリストに日付が無く、タイムテーブルだけが複数日：日ごとのタイムテーブルに種目がある日をその種目の日にする
    var slNoDate = state.day && state.tt && !state.sl.entries.concat(state.sl.relays).some(function (e) { return e.date; });
    if (slNoDate) {
      var hits = MD.map(function (d) { return MeetLogic.build(state.sl, state.tt.filter(function (s) { return !s.date || s.date === d; }), state.teams, S).map(function (r) { return r.ttHit; }); });
      state.rows.forEach(function (r, i) {
        var ds = MD.filter(function (d, k) { return hits[k][i]; });
        if (ds.length === 1) r.date = ds[0];
        else if (ds.length > 1) r.note = (r.note ? r.note + '／' : '') + '⚠ タイムテーブルの' + ds.join('・') + 'のどちらにもある種目（日付を要確認）';
      });
    }
    state.allRows = state.rows.slice();
    if (state.day) state.rows = state.rows.filter(function (r) { return !r.date || r.date === state.day; }).map(function (r) {
      if (!r.date && MD.length > 1 && !/日付を要確認/.test(r.note)) r.note = (r.note ? r.note + '／' : '') + '⚠ 日付不明（' + dayLabel(state.day) + 'の出場か要確認）';
      return r;
    });
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
    var bt = MeetLogic.byTime(rows), prev = null, prevNote = null, html = [];
    bt.forEach(function (r, i) {
      var g = grpKey(r), first = prev !== g;
      html.push('<tr class="' + teamClass(r.team) + (first && i ? ' gsep' : first ? '' : ' gcont') + '"><td class="t">' + (first ? esc(r.start || '時刻不明') : '') + '</td><td class="nw">' + (first ? esc(r.call) : '') +
        '</td><td class="nw">' + (first ? esc(r.event) + (r.round ? ' <small class="pl">' + esc(r.round) + '</small>' : '') : '') + '</td><td class="c">' + esc(r.heat) + '</td><td class="c nw">' + posCell(r) +
        '</td><td class="c">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="nm">' + nameCell(r) + '</td><td class="c">' + esc(r.grade) + '</td><td class="nw">' + esc(r.team) + '</td><td class="note">' + (first || r.note !== prevNote ? esc(r.note) : '<span class="muted">〃</span>') + '</td></tr>');
      prev = g; prevNote = r.note;
    });
    $('timeBody').innerHTML = html.join('');
    var sr = bt.map(function (r) { return rowObj(shareRow(r)); });
    $('timeCards').innerHTML = cardsTimeHtml(sr); $('athCards').innerHTML = cardsAthHtml(sr);
    renderFeePrices();
    refreshPrint();

    // 選手別
    var ba = athSorted(rows); renderAthHead();
    $('athBody').innerHTML = ba.map(function (r) {
      return '<tr class="' + teamClass(r.team) + '"><td class="nw">' + esc(r.team) + '</td><td class="c">' + esc(r.typ === 'relay' ? '' : r.bib) + '</td><td class="nm">' + nameCell(r) + '</td><td class="c">' + esc(r.grade) +
        '</td><td class="nw">' + esc(r.event) + '</td><td class="nw">' + esc(r.round) + '</td><td class="c">' + esc(r.heat) + '</td><td class="c nw">' + posCell(r) + '</td><td class="nw">' + esc(r.call) + '</td><td class="c">' + esc(r.start) + '</td><td class="note">' + esc(r.note) + '</td></tr>';
    }).join('');

    // ナンバーカード
    $('cardsArea').innerHTML = state.teams.map(function (t, i) {
      var c = MeetLogic.cards(rows, t, S), P = cardPlan(t, c, S);
      var hasField = rows.some(function (r) { return r.team === t && r.typ === 'field'; });
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
  function cardPlan(team, c, S) {
    var mk = function (kind, num, need) { var k = team + '|' + kind + '|' + num; return { num: String(num), need: need, make: state.make[k] != null ? state.make[k] : need }; };
    return {
      koshi: Object.keys(c.koshi).sort(function (a, b) { return a - b; }).map(function (k) { return mk('koshi', k, c.koshi[k]); }),
      mune: c.bibs.map(function (b) { return mk('mune', b, S.bibCopies); }),
      ord: c.ord.map(function (n) { return mk('ord', n, S.ordCopies); })
    };
  }
  function updateMkTotals(i) {
    var t = state.teams[i], S = settings(), P = cardPlan(t, MeetLogic.cards(state.rows, t, S), S);
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
    var S = settings(), c = MeetLogic.cards(state.rows, team, S), r;
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
    var rows = state.rows;
    if (kind === 'time') {
      var pg = null;
      return [['競技開始', '招集', '種目', 'ラウンド', '組', '区分', 'レーン/順番', 'ナンバー', '氏名', '学年', '所属', '備考']].concat(MeetLogic.byTime(rows).map(function (r) {
        var g = grpKey(r), same = grouped && g === pg; pg = g;
        if (same) return ['', '', '', '', r.heat, r.posLabel, r.pos, r.bib, r.typ === 'relay' ? r.relayTeam + '（' + r.members.map(function (m) { return m.name; }).join('・') + '）' : r.name, r.grade, r.team, r.note];
        return [r.start, r.call, r.event, r.round, r.heat, r.posLabel, r.pos, r.typ === 'relay' ? r.bib : r.bib, r.typ === 'relay' ? r.relayTeam + '（' + r.members.map(function (m) { return m.name; }).join('・') + '）' : r.name, r.grade, r.team, r.note];
      }));
    }
    if (kind === 'ath') {
      return [['所属', 'ナンバー', '氏名', '学年', '種目', 'ラウンド', '組', '区分', 'レーン/順番', '招集', '競技開始', '備考']].concat(MeetLogic.byAthlete(rows).map(function (r) {
        return [r.team, r.bib, r.typ === 'relay' ? r.relayTeam + '（' + r.members.map(function (m) { return m.name; }).join('・') + '）' : r.name, r.grade, r.event, r.round, r.heat, r.posLabel, r.pos, r.call, r.start, r.note];
      }));
    }
    var S = settings(), out = [['所属', '項目', '必要枚数', '作成枚数', '番号（作成枚数）']];
    state.teams.forEach(function (t) {
      var c = MeetLogic.cards(rows, t, S), P = cardPlan(t, c, S);
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
    feeData().forEach(function (f) { f.lines.forEach(function (l) { fa.push([f.team, l.cat, l.ind, l.indPrice, l.relay, l.relayPrice, l.sub]); }); fa.push([f.team, f.missing.length ? '合計未確定（設定済み分の小計）' : f.unsure ? '合計（単価の単位 要確認）' : '合計', '', '', '', '', f.total]); if (f.missing.length) fa.push([f.team, '未設定：' + f.missing.join('・')]); fa.push([]); });
    fa.push(['単価の出どころ：' + (state.feeParsed && state.feeParsed.src.length ? state.feeParsed.src.join(' ／ ') : '要項から読み取れず（手入力）')]);
    var fws = XLSX.utils.aoa_to_sheet(safeAoa(fa)); fws['!cols'] = [12, 8, 12, 10, 14, 10, 12].map(function (w) { return { wch: w }; }); XLSX.utils.book_append_sheet(wb, fws, '参加料');
    XLSX.writeFile(wb, fileBase() + '.xlsx');
  }


  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(SID).forEach(function (k) { INIT_STATUS[k] = $(SID[k]).innerHTML; });
    setupShare();
    setupDrop('slDrop', 'slFile', 'sl');
    setupDrop('ttDrop', 'ttFile', 'tt');
    setupDrop('noteDrop', 'noteFile', 'note');
    setupDrop('yokoDrop', 'yokoFile', 'yoko');
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
    $('btnPrint').addEventListener('click', function () { refreshPrint(); if (!state.rows.length) { alert('学校を選んで結果を出してから印刷してください。'); return; } window.print(); });
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
  /* ---------- スマホで見る／共有（URLの # 以降に結果を圧縮して入れる。サーバーには送らない） ---------- */
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
        var P = cardPlan(t, MeetLogic.cards(state.rows, t, S), S), f = function (l) { return l.map(function (o) { return [o.num, o.make]; }); };
        return [t, f(P.koshi), f(P.mune), f(P.ord)];
      }) };
  }
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function encodePayload(obj) {
    if (typeof CompressionStream === 'undefined') throw new Error('このブラウザは圧縮に対応していません（新しいChrome／Safari／Edgeを使ってください）');
    return '1.' + b64u(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw')));
  }
  async function decodePayload(str) {
    var m = /^1\.([A-Za-z0-9_-]+)$/.exec(str || ''); if (!m) throw new Error('リンクの形式が違います');
    if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは展開に対応していません');
    var o = JSON.parse(new TextDecoder().decode(await pipe(unb64u(m[1]), new DecompressionStream('deflate-raw'))));
    if (!o || o.v !== 1 || !Array.isArray(o.r)) throw new Error('リンクの中身を読めませんでした');
    o.ts = Array.isArray(o.ts) ? o.ts.map(String) : []; o.c = Array.isArray(o.c) ? o.c : [];
    return o;
  }
  function shareBase() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SHARE_BASE; }
  /* カード表示（スマホ・閲覧モード共通）。中身はすべて esc() で文字として出す */
  function cardsTimeHtml(rows) {
    var out = [], prev = null, cur = null;
    rows.forEach(function (r) {
      var k = r.start + '|' + r.event + '|' + r.round;
      if (k !== prev) {
        if (cur) out.push('</div>');
        out.push('<div class="mc-g"><div class="mc-h"><b class="mc-t">' + esc(r.start || '時刻不明') + '</b>' + (r.call ? '<span class="mc-call">招集 ' + esc(r.call) + '</span>' : '') +
          '<span class="mc-ev">' + esc(r.event) + '</span>' + (r.round ? '<span class="mc-rd">' + esc(r.round) + '</span>' : '') + '</div>');
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
    rows.forEach(function (r) { var k = r.team + '|' + (r.relay ? 'R|' + r.name : r.bib); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
    order.sort(function (a, b) {
      var A = by[a][0], B = by[b][0];
      return A.team.localeCompare(B.team, 'ja') || (A.relay - B.relay) || ((parseInt(A.bib, 10) || 0) - (parseInt(B.bib, 10) || 0)) || A.name.localeCompare(B.name, 'ja');
    });
    return order.map(function (k) {
      var L = by[k], f = L[0];
      return '<div class="mc-g mc-a"><div class="mc-h">' + (f.bib ? '<b class="mc-bibh">' + esc(f.bib) + '</b>' : '<b class="mc-bibh">リレー</b>') + '<span class="mc-ev">' + esc(f.name) + '</span><span class="mc-call">' + esc([f.grade, f.team].filter(Boolean).join('・')) + '</span></div>' +
        (f.members ? '<div class="mc-mem2">' + esc(f.members) + '</div>' : '') +
        L.map(function (r) {
          return '<div class="mc-r"><span class="mc-t2">' + esc(r.start || '—') + '</span><span class="mc-name"><b>' + esc(r.event) + (r.round ? ' <small class="mc-rd">' + esc(r.round) + '</small>' : '') + '</b>' +
            '<small>' + esc([(r.heat && r.heat !== '-' ? r.heat + '組' : ''), r.posLabel + ' ' + r.pos, r.call ? '招集 ' + r.call : ''].filter(Boolean).join('・')) + '</small></span></div>';
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
  async function openShare() {
    if (!state.rows.length) { alert('先に学校を選んで結果を出してください。'); return; }
    var dlg = $('shareDlg'), url;
    try { url = shareBase() + '#d=' + await encodePayload(payloadFromState()); } catch (e) { alert(e.message); return; }
    $('shareUrl').value = url;
    var file = !/^https?:$/.test(location.protocol);
    $('shareInfo').innerHTML = '<b>' + esc(state.teams.join('・')) + '</b>（' + state.rows.length + '件）　リンクの長さ：<b>' + url.length.toLocaleString() + '文字</b>' +
      (url.length > URL_WARN ? '<div class="warn">⚠ リンクがとても長いです（' + URL_WARN.toLocaleString() + '文字超）。アプリによっては切れてしまうので、学校を減らして作り直してください。</div>' : '') +
      (file ? '<div class="warn small">このページはパソコンのファイルとして開いているため、リンクは公開版のアドレス（' + esc(SHARE_BASE) + '）で作りました。公開版で開いたときに表示されます。</div>' : '');
    var qr = $('shareQr');
    if (url.length <= QR_MAX && typeof qrcode === 'function') {
      try { var q = qrcode(0, 'L'); q.addData(url, 'Byte'); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 3, margin: 3, scalable: true }); }
      catch (e) { qr.innerHTML = '<p class="warn small">QRコードを作れませんでした（' + esc(e.message) + '）。リンクをコピーして送ってください。</p>'; }
    } else qr.innerHTML = '<p class="warn small">リンクが長すぎてQRコードに入りません（' + url.length.toLocaleString() + '文字／上限 約' + QR_MAX.toLocaleString() + '文字）。リンクをコピーして送るか、学校を1校ずつにしてください。</p>';
    dlg.hidden = false; $('shareCopy').focus();
  }
  function loadSaved() { try { var a = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function storeSaved(a) { localStorage.setItem(SAVE_KEY, JSON.stringify(a)); }
  function renderSaved() {
    var a = loadSaved(), html = a.length ? '<ul class="saved">' + a.map(function (s) {
      return '<li><button class="btn sub sv-open" data-id="' + esc(s.id) + '">' + esc((s.title || '（大会名なし）') + (s.date ? '　' + s.date : '')) + '<small>' + esc((s.teams || []).join('・')) + '</small></button>' +
        '<button class="btn sub sv-del" data-id="' + esc(s.id) + '" aria-label="削除">削除</button></li>';
    }).join('') + '</ul>' : '<p class="small muted">この端末に保存した大会はまだありません。</p>';
    document.querySelectorAll('.savedList').forEach(function (box) {
      box.innerHTML = html;
      box.querySelectorAll('.sv-open').forEach(function (b) { b.addEventListener('click', function () { var s = loadSaved().find(function (x) { return x.id === b.dataset.id; }); if (s) openViewerStr(s.p, false); }); });
      box.querySelectorAll('.sv-del').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('この大会をこの端末から削除しますか？')) return; storeSaved(loadSaved().filter(function (x) { return x.id !== b.dataset.id; })); renderSaved(); }); });
    });
    $('savedHome').hidden = !a.length || document.body.classList.contains('viewer-mode');
  }
  function sid(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var viewing = null;
  async function openViewerStr(str, fromLink) {
    var o;
    try { o = await decodePayload(str); } catch (e) { document.body.classList.add('viewer-mode'); $('viewer').hidden = false; $('vBody').innerHTML = '<p class="warn">リンクを読めませんでした：' + esc(e.message) + '（リンクが途中で切れている可能性があります）</p>'; $('vTitle').textContent = 'LANE NOTE 閲覧'; return; }
    viewing = { str: str, o: o };
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
      a.unshift({ id: sid(viewing.str), title: viewing.o.n, date: viewing.o.d, teams: viewing.o.ts, savedAt: new Date().toISOString(), p: viewing.str });
      storeSaved(a); $('vSave').textContent = '✔ この端末に保存済み'; $('vSave').disabled = true; renderSaved();
    } catch (e) { alert('保存できませんでした（ブラウザの設定・プライベートモード・容量の可能性）：' + e.message); }
  }
  function closeViewer() { document.body.classList.remove('viewer-mode'); $('viewer').hidden = true; viewing = null; if (/^#d=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); renderSaved(); }
  function setupShare() {
    $('btnShare').addEventListener('click', openShare);
    $('shareClose').addEventListener('click', function () { $('shareDlg').hidden = true; });
    $('shareDlg').addEventListener('click', function (e) { if (e.target === $('shareDlg')) $('shareDlg').hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('shareDlg').hidden = true; });
    $('shareCopy').addEventListener('click', function () {
      var u = $('shareUrl').value, done = function () { $('shareCopy').textContent = '✔ コピーしました'; setTimeout(function () { $('shareCopy').textContent = '🔗 リンクをコピー'; }, 1800); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(u).then(done, function () { $('shareUrl').select(); document.execCommand('copy'); done(); });
      else { $('shareUrl').select(); document.execCommand('copy'); done(); }
    });
    $('vSave').addEventListener('click', saveViewing);
    $('vClose').addEventListener('click', closeViewer);
    document.querySelectorAll('#viewer .vtabs button').forEach(function (b) { b.addEventListener('click', function () {
      document.querySelectorAll('#viewer .vtabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      ['vTime', 'vAth', 'vCards'].forEach(function (id) { $(id).hidden = id !== b.dataset.v; });
    }); });
    var fromHash = function () { var m = /^#d=(.+)$/.exec(location.hash); if (m) openViewerStr(m[1], true); };
    window.addEventListener('hashchange', fromHash);
    renderSaved(); fromHash();
    // 公開版（https）のときだけ、このページ自体を端末に置いておく（オフラインでも閲覧できるように）。PDFや選手データはキャッシュしない
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  var INIT_STATUS = {};
  function resetAll() {
    if (!confirm('読み込んだPDF・学校名・設定・枚数をすべて消して、新しい大会を始めます。よろしいですか？')) return;
    Object.keys(loadSeq).forEach(function (k) { loadSeq[k]++; });   // 読み込み途中のものも捨てる
    Object.assign(state, { make: {}, dateCands: {}, feeParsed: null, feeFrom: '', prices: {}, priceSrc: {}, athSort: null, sl: null, tt: null, notes: null, slName: '', ttName: '', noteName: '', yokoName: '', rows: [], teams: [], allTeams: [], teamCat: {}, date: null, day: '' });
    document.querySelectorAll('input, select').forEach(function (el) {
      if (el.type === 'file') el.value = ''; else if (el.type === 'checkbox') el.checked = el.defaultChecked;
      else if (el.tagName === 'SELECT') { Array.from(el.options).forEach(function (o) { o.selected = o.defaultSelected; }); } else el.value = el.defaultValue;
      el.classList.remove('bad'); delete el.dataset.manual; delete el.dataset.auto;
    });
    Object.keys(SID).forEach(function (k) { setStatus(SID[k], INIT_STATUS[k] || '', ''); });
    $('teamList').dataset.q = ''; ruleState = {}; renderRuleMarks(); renderFeePrices(); renderDateMark(); updateTeams(); render();
    window.scrollTo(0, 0);
  }
  window.__meetApp = { encodePayload: encodePayload, decodePayload: decodePayload, payloadFromState: payloadFromState, openShare: openShare, refreshPrint: refreshPrint, tableData: tableData, feeData: feeData, totalText: totalText, safeCell: safeCell, state: state, handleFile: handleFile, render: render, updateTeams: updateTeams };
})();
