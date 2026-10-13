/* v0.26.6 3分体験のサンプル（すべて架空。実在の選手・学校・大会ではありません） */
var TrySample = (function () {
  'use strict';
  var SCHOOL = '架空第一高';
  var A = [['110', '架空 一郎', '2'], ['111', '見本 太郎', '1'], ['112', '例示 花子', '2'], ['113', '試験 次郎', '1'], ['114', '仮名 さくら', '1']];
  function e(ev, round, heat, pos, a, date, team) { return { page: 1, event: ev, round: round, heat: heat, posKind: 'レーン', pos: pos, bib: a[0], name: a[1], grade: a[2], team: team || SCHOOL, date: date, format: 'kitaku' }; }
  var other = [['201', '空想 健', '3'], ['202', '模型 翔', '2'], ['203', '見立 葵', '2']];
  var entries = [
    e('男子 高校 100m', '予選', 1, 3, A[0], '10/11'), e('男子 高校 100m', '予選', 2, 5, A[1], '10/11'), e('男子 高校 100m', '予選', 1, 4, other[0], '10/11', '架空南高'),
    e('女子 高校 100m', '予選', 1, 2, A[2], '10/11'), e('女子 高校 100m', '予選', 1, 6, A[4], '10/11'), e('女子 高校 100m', '予選', 1, 3, other[2], '10/11', '架空西高'),
    e('男子 高校 走幅跳', '決勝', 1, 7, A[3], '10/11'), e('男子 高校 走幅跳', '決勝', 1, 3, other[1], '10/11', '架空南高'),
    e('男子 高校 200m', '予選', 2, 4, A[0], '10/12'), e('女子 高校 400m', '予選', 1, 5, A[4], '10/12'), e('男子 高校 1500m', 'タイムレース決勝', 1, 9, A[1], '10/12')
  ];
  var seg = function (time, gender, ev, round, heats, date) { return { page: 1, event: ev, time: time, cat: '高校', gender: gender, round: round, heats: { count: heats, all: true }, raw: time + ' 高校 ' + gender + ' ' + ev + ' ' + round, date: date }; };
  var tt = [seg('10:00', '男子', '100m', '予選', 2, '10/11'), seg('10:20', '女子', '100m', '予選', 1, '10/11'), seg('13:00', '男子', '100m', '決勝', 1, '10/11'), seg('13:10', '女子', '100m', '決勝', 1, '10/11'), seg('11:00', '男子', '走幅跳', '決勝', 1, '10/11'),
    seg('09:30', '男子', '200m', '予選', 2, '10/12'), seg('10:10', '女子', '400m', '予選', 1, '10/12'), seg('11:30', '男子', '1500m', 'タイムレース決勝', 1, '10/12')];
  var prep = { sl: { dates: ['10/11', '10/12'], entryDates: ['10/11', '10/12'], undated: false, multiDay: true, diag: {}, warnings: [], entries: entries, relays: [], events: [], format: 'kitaku', fragmentedPages: [], hasTimes: false }, tt: tt, meet: '架空市 秋季陸上競技大会（サンプル）' };
  // 記録：架空の速報ページ（携帯向けの形）を3大会ぶん
  function page(meet, date, ev, wind, rows) {
    return '<!-- ' + date + ' 12:00:00 --><html><head><title>' + ev + ' 決勝</title></head><body>' + ev + ' 決勝<br><hr>' + (wind ? '風:' + wind + '<br>' : '') +
      rows.map(function (r, i) { return '<font color="#000080">' + (i + 1) + '位　(' + r[0] + ')<br>　' + r[1] + '<br>' + r[2] + '(' + r[3] + ')<br>' + r[4] + '<br></font>'; }).join('') + '</body></html>';
  }
  var M = [['架空市 春季記録会（サンプル）', '2026/04/19', ['11.48', '11.95', '13.02', '6m12', '13.40']], ['架空地区 総体予選（サンプル）', '2026/05/24', ['11.31', '11.80', '12.88', '6m35', '13.21']], ['架空市 秋季陸上競技大会（サンプル）', '2026/10/11', ['11.12', '11.64', '12.79', '6m48', '13.05']]];
  var results = M.map(function (m) {
    var x = m[2];
    return { meet: m[0], date: m[1].replace(/\//g, '-'), pages: [
      page(m[0], m[1], '男子 100m', '+0.8', [['110', x[0], '架空 一郎', '2', SCHOOL], ['201', '11.20', '空想 健', '3', '架空南高'], ['111', x[1], '見本 太郎', '1', SCHOOL]]),
      page(m[0], m[1], '女子 100m', '+1.1', [['203', '12.70', '見立 葵', '2', '架空西高'], ['112', x[2], '例示 花子', '2', SCHOOL], ['114', x[4], '仮名 さくら', '1', SCHOOL]]),
      page(m[0], m[1], '男子 走幅跳', '+1.0', [['113', x[3], '試験 次郎', '1', SCHOOL], ['202', '6m10', '模型 翔', '2', '架空南高']])
    ] };
  });
  return { SCHOOL: SCHOOL, prep: prep, results: results };
})();
if (typeof module !== 'undefined') module.exports = TrySample;
