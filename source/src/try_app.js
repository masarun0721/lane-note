/* v0.26.6 3分体験：架空のサンプルで「大会準備」「記録」のできあがりまでを体験する。
   ・本物の読み取り・集計（MeetLogic・ResultParser）を、埋め込んだ架空の資料で動かす。
   ・保存しない：localStorage・IndexedDB・Firebase・中継（fetch）は一切使わない（test/v0266_try_check.mjs で確かめる）。 */
(function () {
  'use strict';
  var S = TrySample, ML = MeetLogic, R = ResultParser;
  var body = document.getElementById('trBody'), steps = document.getElementById('trSteps').children;
  var st = { kind: '', step: 0, school: S.SCHOOL };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function mark(n) { for (var i = 0; i < steps.length; i++) { steps[i].className = i < n ? 'done' : i === n ? 'on' : ''; if (i === n) steps[i].setAttribute('aria-current', 'step'); else steps[i].removeAttribute('aria-current'); } }
  function nav(back, nextLabel, nextId) { return '<div class="tr-next tr-noprint">' + (back ? '<button type="button" class="btn sub" data-go="back">← もどる</button>' : '') + (nextLabel ? '<button type="button" class="btn tr-big" id="' + nextId + '">' + nextLabel + '</button>' : '') + '</div>'; }
  function show(html, n) { mark(n); st.step = n; body.innerHTML = html; var h = body.querySelector('h2'); if (h && st.started) { h.tabIndex = -1; h.focus({ preventScroll: false }); } }
  function pick() {
    st.kind = '';
    show('<h2>① 何を体験しますか？</h2><p>どちらも3分ほどで、できあがりまで進めます。使うのは架空のサンプルの資料です。</p><div class="tr-pick">' +
      '<button type="button" data-kind="prep" id="trPrep">🏁 大会準備をする<small>スタートリストとタイムテーブルから、自分の学校の選手の「時間順の一覧（招集・開始時刻つき）」を作ります。</small></button>' +
      '<button type="button" data-kind="rec" id="trRec">📒 記録を整理する<small>大会の結果から自分の学校の選手の記録だけを拾い、自己ベストと記録の伸びを出します。</small></button></div>', 0);
  }
  function srcPrep() {
    var e = S.prep.sl.entries;
    return '<div class="tr-src"><h4>📄 サンプルのスタートリスト（架空）</h4><table class="tr-tbl"><tr><th>日</th><th>種目</th><th>ラウンド・組</th><th>レーン</th><th>No.</th><th>氏名</th><th>所属</th></tr>' +
      e.map(function (x) { return '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.event) + '</td><td>' + esc(x.round) + ' ' + x.heat + '組</td><td>' + x.pos + '</td><td>' + esc(x.bib) + '</td><td>' + esc(x.name) + '(' + esc(x.grade) + ')</td><td>' + esc(x.team) + '</td></tr>'; }).join('') + '</table></div>' +
      '<div class="tr-src"><h4>🕘 サンプルのタイムテーブル（架空）</h4><table class="tr-tbl"><tr><th>日</th><th>時刻</th><th>種目</th></tr>' +
      S.prep.tt.slice().sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; }).map(function (t) { return '<tr><td>' + esc(t.date) + '</td><td>' + esc(t.time) + '</td><td>' + esc(t.raw.replace(/^\S+\s/, '')) + '</td></tr>'; }).join('') + '</table></div>';
  }
  function srcRec() {
    return S.results.map(function (m) {
      return '<div class="tr-src"><h4>🏟 ' + esc(m.meet) + '（' + esc(m.date) + '）の結果ページ ' + m.pages.length + '件</h4><p class="small muted">' + m.pages.map(function (h) { return esc((h.match(/<title>([^<]*)<\/title>/) || [])[1] || ''); }).join('・') + '</p></div>';
    }).join('');
  }
  function step2() {
    var prep = st.kind === 'prep';
    show('<h2>② 資料を入れる</h2><p>' + (prep ? 'ふだんは大会のスタートリストとタイムテーブルのPDFを入れます。' : 'ふだんは大会の結果のPDFや、速報ページのURLを入れます。') + '今回は下の<b>架空のサンプル</b>を使います。</p>' +
      (prep ? srcPrep() : srcRec()) + nav(true, prep ? '📥 このサンプルを読み取る' : '📥 このサンプルを取り込む', 'trLoad'), 1);
  }
  function step3() {
    var prep = st.kind === 'prep', teams = prep ? ML.allTeams(S.prep.sl).all : uniq(allRecs().map(function (r) { return r.team; }));
    show('<h2>③ 学校名を入れる</h2><p>' + (prep ? 'スタートリストを読み取りました（' + S.prep.sl.entries.length + '人）。' : '結果を取り込みました（' + S.results.length + '大会・' + allRecs().length + '件）。') + 'どの学校の選手を拾うかを決めます。体験では「' + esc(S.SCHOOL) + '」が入っています。</p>' +
      '<label>学校・クラブ名：<input id="trSchool" value="' + esc(st.school) + '" autocomplete="off" list="trTeams"></label><datalist id="trTeams">' + teams.map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
      '<p class="small muted">資料に出てくる学校：' + teams.map(esc).join('・') + '</p><p class="status" id="trMsg"></p>' + nav(true, prep ? '🗒 一覧を作る' : '🏅 自己ベストを出す', 'trMake'), 2);
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  var _recs = null;
  function allRecs() {
    if (_recs) return _recs; _recs = [];
    S.results.forEach(function (m) { var s = []; m.pages.forEach(function (h) { s = s.concat(R.goldMobileStream(h) || []); }); R.parseCells(s, {}).recs.forEach(function (r) { r.meet = m.meet; r.date = m.date; _recs.push(r); }); });
    return _recs;
  }
  function donePrep() {
    var rows = ML.build(S.prep.sl, S.prep.tt, ML.findTeams(S.prep.sl, st.school), {});
    if (!rows.length) return false;
    rows.sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.startMin || 0) - (b.startMin || 0); });
    show('<h2>④ できあがり：時間順の一覧</h2><div class="tr-done">✔ 「' + esc(st.school) + '」の選手 ' + uniq(rows.map(function (r) { return r.name; })).length + '人・' + rows.length + '種目の一覧ができました。招集の時刻はタイムテーブルから自動で計算しています。</div>' +
      '<p class="small">（架空の大会：' + esc(S.prep.meet) + '）</p><table class="tr-tbl" id="trOut"><tr><th>日</th><th>招集</th><th>開始</th><th>種目</th><th>ラウンド・組</th><th>選手</th><th>メモ</th></tr>' +
      rows.map(function (r) { return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.call || '') + '</td><td><b>' + esc(r.start || '未定') + '</b></td><td>' + esc(r.event) + '</td><td>' + esc(r.round) + ' ' + esc(r.heat) + '組 ' + esc(r.posLabel || '') + esc(r.pos) + '</td><td>' + esc(r.name) + '(' + esc(r.grade) + ')</td><td class="small">' + esc(r.note || '') + '</td></tr>'; }).join('') + '</table>' +
      '<p class="small muted">本物のページでは、このほかに記録用紙・保護者への案内表・ナンバーカードの枚数なども作れます。</p>' + finish('index.html', '🏁 自分の大会で使ってみる（大会準備へ）'), 3);
    return true;
  }
  function spark(list) {
    var v = list.map(function (r) { var m = R.markValue ? R.markValue(r.mark) : null; return m ? m.v : parseFloat(r.mark); }).filter(function (x) { return isFinite(x); });
    if (v.length < 2) return '';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), sp = hi - lo || 1, W = 90, H = 24;
    var pts = v.map(function (x, i) { return (i * (W - 6) / (v.length - 1) + 3).toFixed(1) + ',' + (3 + (H - 6) * (1 - (x - lo) / sp)).toFixed(1); }).join(' ');
    return '<svg class="tr-spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="記録の推移"><polyline fill="none" stroke="#14213d" stroke-width="2" points="' + pts + '"/></svg>';
  }
  function doneRec() {
    var mine = allRecs().filter(function (r) { return R.matchSchool(r.team, st.school); });
    if (!mine.length) return false;
    var b = R.computeBests(mine).bests;
    show('<h2>④ できあがり：自己ベストと記録の伸び</h2><div class="tr-done">✔ 「' + esc(st.school) + '」の記録だけを ' + mine.length + '件拾い、' + b.length + '人ぶんの自己ベストを出しました。ほかの学校の選手は入っていません。</div>' +
      '<table class="tr-tbl" id="trOut"><tr><th>選手</th><th>種目</th><th>自己ベスト</th><th>出した大会</th><th>推移（古い→新しい）</th></tr>' +
      b.map(function (x) {
        var best = x.best || x.ref || {}, hist = mine.filter(function (r) { return R.nameKey(r.name) === R.nameKey(x.name) && r.event === best.event; }).sort(function (p, q) { return p.date < q.date ? -1 : 1; });
        return '<tr><td>' + esc(x.name) + '(' + esc(x.grade) + ')</td><td>' + esc(String(x.eventLabel || best.event).replace(/\s+/g, ' ').trim()) + '</td><td><b>' + esc(best.mark) + '</b>' + (best.wind ? ' <span class="small">(' + esc(best.wind) + ')</span>' : '') + '</td><td class="small">' + esc(best.meet) + '<br>' + esc(best.date) + '</td><td>' + spark(hist) + ' <span class="small">' + hist.map(function (r) { return esc(r.mark); }).join(' → ') + '</span></td></tr>';
      }).join('') + '</table><p class="small muted">本物のページでは、ログインするとクラウドに保存でき、選手ごとの個人ページ（専用リンク）も作れます。</p>' + finish('records.html', '📒 自分の記録で使ってみる（記録へ）'), 3);
    return true;
  }
  function finish(href, label) { return '<div class="tr-next tr-noprint"><button type="button" class="btn sub" data-go="back">← もどる</button><button type="button" class="btn sub" onclick="window.print()">🖨 印刷してみる</button><button type="button" class="btn sub" data-go="restart">↺ もう一方も体験する</button><a class="btn tr-big" href="' + href + '">' + label + '</a></div><p class="small muted">体験で使ったサンプルは保存していません。本物のページには、何も入っていない状態で移ります。</p>'; }
  body.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button,[data-go]') : e.target; if (!t) return;
    var k = t.getAttribute('data-kind'); if (k) { st.kind = k; step2(); return; }
    var g = t.getAttribute('data-go');
    if (g === 'back') { if (st.step === 3) step3(); else if (st.step === 2) step2(); else pick(); return; }
    if (g === 'restart') { pick(); return; }
    if (t.id === 'trLoad') { step3(); return; }
    if (t.id === 'trMake') {
      st.school = document.getElementById('trSchool').value.trim();
      if (!st.school) { document.getElementById('trMsg').textContent = '✖ 学校名を入れてください（体験では「' + S.SCHOOL + '」）'; return; }
      var ok = st.kind === 'prep' ? donePrep() : doneRec();
      if (!ok) document.getElementById('trMsg').textContent = '✖ 「' + st.school + '」の選手はサンプルの中にいませんでした。体験では「' + S.SCHOOL + '」を入れてみてください。';
    }
  });
  window.LaneTry = { state: st };
  pick(); st.started = true;
})();
