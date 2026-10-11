// v0.9.0（記録）：「🖨 PDFにまとめる」用の印刷レイアウト（A4・ブラウザの印刷→PDFで保存）。HTMLの文字列を作るだけの関数
var LanePrint = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function wind(R, r) { return R.shownWind(r) ? esc(r.wind) : ''; }
  // 1ページ分：上に学校名・タイトル・出力日、下に LANE NOTE
  function page(title, meta, body) {
    return '<section class="lp-page"><div class="lp-h"><span class="lp-school">' + esc(meta.school || '') + '</span><b class="lp-title">' + esc(title) + '</b><span class="lp-date">出力日 ' + esc(meta.date || today()) + '</span></div>' + body + '<div class="lp-f">LANE NOTE ・ LANE LOG（記録）</div></section>';
  }
  // 個人表：名前・区分/学年・種目ごとの自己ベスト・記録の一覧・グラフ
  function athleteSheet(R, all, key, o) {
    o = o || {};
    var mine = all.filter(function (r) { return R.athleteKey(r) === key; }), pf = R.athleteProfile(mine, key);
    if (!pf) return '';
    var order = [], byKey = {}; pf.events.forEach(function (e) { byKey[e.event] = e; });
    R.groupEvents(Object.keys(byKey), mine, o.nog).forEach(function (g) { g.items.forEach(function (it) { byKey[it.key].eventLabel = it.label; order.push(byKey[it.key]); }); });
    var dv = R.divisionOf(pf), info = [pf.team, dv ? R.divLabel(dv) : '', pf.grade ? pf.grade + (/年/.test(pf.grade) ? '' : '年') : ''].filter(Boolean).join('・');
    var pbt = '<table class="lp-t"><tr><th>種目</th><th>自己ベスト（公認）</th><th>風</th><th>日付</th><th>大会</th><th>件数</th></tr>' + order.map(function (e) {
      var b = e.best || e.ref || {};
      return '<tr><td>' + esc(e.eventLabel) + '</td><td class="lp-mk">' + esc(b.mark || '—') + (e.best ? '' : b.mark ? '（参考）' : '') + '</td><td>' + wind(R, b) + '</td><td>' + esc(b.date || '') + '</td><td>' + esc(b.meet || '') + '</td><td>' + e.count + '</td></tr>';
    }).join('') + '</table>';
    var evs = order.map(function (e) {
      var rs = mine.filter(function (r) { return R.eventKey(r) === e.event; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      return '<div class="lp-ev"><div class="lp-h3">' + esc(e.eventLabel) + '</div>' + (o.spark ? '<div class="lp-chart">' + o.spark(e) + '</div>' : '') +
        '<table class="lp-t"><tr><th>日付</th><th>大会</th><th>ラウンド</th><th>記録</th><th>風</th><th>順位</th></tr>' + rs.map(function (r) {
          return '<tr' + (e.best && e.best.id === r.id ? ' class="lp-pb"' : '') + '><td>' + esc(r.date) + '</td><td>' + esc(r.meet) + '</td><td>' + esc(r.round || '') + '</td><td class="lp-mk">' + esc(r.mark) + '</td><td>' + wind(R, r) + '</td><td>' + esc(r.rank || '') + '</td></tr>';
        }).join('') + '</table></div>';
    }).join('');
    return page('個人表', o, '<div class="lp-name"><b>' + esc(pf.name) + '</b>' + (pf.kana ? '<span>' + esc(pf.kana) + '</span>' : '') + '<div class="lp-info">' + esc(info) + '・' + pf.count + '件</div></div><div class="lp-h2">種目ごとの自己ベスト</div>' + pbt + '<div class="lp-h2">記録の一覧</div>' + evs);
  }
  // 部内ランキング・歴代記録（evs：出す種目の順。1種目＝1つの表、ページをまたいでもよい）
  function rankSheet(R, kind, data, evs, label, o) {
    var title = kind === 'hist' ? '歴代記録' : '部内ランキング';
    var body = '<p class="lp-cond">' + esc(o.cond || '') + '</p>' + evs.map(function (ev) {
      return '<div class="lp-ev"><div class="lp-h3">' + esc(label(ev)) + '</div><table class="lp-t"><tr><th>順位</th><th>氏名</th><th>' + (kind === 'hist' ? '年度' : '学年') + '</th><th>記録</th><th>風</th><th>日付</th><th>大会</th></tr>' + (data[ev] || []).map(function (x) {
        return '<tr><td>' + x.rank + '</td><td>' + esc(x.name) + '</td><td>' + esc(kind === 'hist' ? R.seasonLabel(x.season) : x.grade ? x.grade + '年' : '') + '</td><td class="lp-mk">' + esc(x.best.mark) + '</td><td>' + wind(R, x.best) + '</td><td>' + esc(x.best.date) + '</td><td>' + esc(x.best.meet) + '</td></tr>';
      }).join('') + '</table></div>';
    }).join('');
    return page(title, o, body);
  }
  return { esc: esc, today: today, page: page, athleteSheet: athleteSheet, rankSheet: rankSheet };
})();
if (typeof module !== 'undefined') module.exports = LanePrint;
