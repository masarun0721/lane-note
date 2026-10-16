/* v0.26.55 怪しい記録のチェック（保存の前の確認画面と、保存ずみの記録の「🔍 怪しい記録チェック」で同じ決まりを使う）。
   値は直さない・推測で埋めない。見つけて知らせるだけ。DOM を使わない（node のテストでも動く）。
   種類：
   dup      同じ選手・同じ日・同じ種目・同じラウンドで、記録も同じ（大会名がちがっても）。DNS・DQ どうしもここ
   conflict 同じ選手・同じ日・同じ種目・同じラウンドで、記録がちがう
   mark     ありえない記録（種目・男女・中学/高校ごとの幅の外、単位・形のまちがい、読めない記録）
   date     大会予定の日程の外の日付・未来の日付 */
var LaneSuspect = (function () {
  'use strict';
  function nk(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  function sq(s) { return nk(s).replace(/\s+/g, ''); }
  var TYPES = ['dup', 'conflict', 'mark', 'date'];
  var LABEL = { dup: '二重', conflict: '記録がちがう', mark: 'ありえない記録', date: '日付が合わない' };
  // 記録ではない書き方（欠場・失格など）。これは「読めない記録」にしない
  var NOMARK = /^(DNS|DNF|DQ|DSQ|NM|NR|NT|欠場|棄権|失格|途中棄権|記録なし|不参加|O\.?P\.?)|^[-－ー―‐×✕]+$/i;
  /* 記録の幅：[速い（良い）側の下限, 遅い側の上限]（秒）／跳躍・投てきは [下限, 上限]（m）。
     男子の良い側は世界記録より少し上、遅い側は大きめ。女子・中学は下でそろえる（f, jh） */
  var T = {
    '50m': [5.2, 12], '60m': [6.2, 14], '80m': [8.0, 18], '100m': [9.5, 25], '150m': [14.5, 35], '200m': [19, 50], '300m': [30, 80], '400m': [43, 120],
    '600m': [70, 200], '800m': [100, 360], '1000m': [130, 480], '1500m': [205, 720], '2000m': [280, 1000], '3000m': [430, 1500], '5000m': [740, 2400], '10000m': [1560, 4800],
    '2000mSC': [310, 1000], '3000mSC': [470, 1500], '80mH': [10, 25], '100mH': [12, 30], '100mYH': [12, 30], '110mH': [12.5, 30], '110mJH': [12.5, 30], '300mH': [33, 100], '400mH': [45, 130],
    '3000mW': [600, 1800], '5000mW': [1080, 3000], '10000mW': [2280, 5400],
    '4×100mR': [36, 90], '4×200mR': [78, 180], '4×400mR': [170, 420]
  };
  var F = { '走幅跳': [1.5, 9.0, 7.6], '走高跳': [0.8, 2.5, 2.1], '三段跳': [5, 18.5, 15.8], '棒高跳': [1.0, 6.3, 5.1], '砲丸投': [3, 23.5, 23], '円盤投': [5, 75, 77], 'ハンマー投': [5, 87, 82], 'やり投': [8, 99, 73] };
  function sexOf(R, r) { var e = R.normEvent(r && r.event || ''); if (/^女子/.test(e)) return 'f'; if (/^男子/.test(e)) return 'm'; var x = nk(r && (r.sex || r.gender) || ''); return /女|^f/i.test(x) ? 'f' : /男|^m/i.test(x) ? 'm' : ''; }
  // { lo, hi, field } か null（幅を決めない種目：混成・知らない種目）
  function bounds(R, r) {
    var n = R.baseEvent(r.event || '').name, s = sexOf(R, r), jh = R.divisionOf(r) === 'jh';
    if (T[n]) { var t = T[n], lo = t[0], hi = t[1]; if (s === 'f') lo *= 1.08; if (s !== 'm') hi *= 1.15; if (jh) lo *= 1.06; return { lo: lo, hi: hi, field: false }; }
    if (F[n]) { var f = F[n], up = s === 'f' ? f[2] : s === 'm' ? f[1] : Math.max(f[1], f[2]); if (jh) up *= 0.92; return { lo: f[0], hi: up, field: true }; }
    return null;
  }
  function num(v) { return Math.round(v * 100) / 100; }
  // 1件の記録のおかしさ（なければ ''）
  function markWhy(R, r) {
    var m = sq(r.mark); if (!m || NOMARK.test(m)) return '';
    var mv = R.markValue(r.mark, r.event); if (!mv) return '記録を読めません（「' + nk(r.mark).trim() + '」）';
    var b = bounds(R, r); if (!b) return '';
    if (b.field && /[:：′'"″]/.test(m)) return '跳躍・投てきなのに時間の形です';
    if (!b.field && /\dm\d|m$/i.test(m)) return '走る種目なのに長さの形です';
    if (mv.v < b.lo || mv.v > b.hi) {
      if (b.field && mv.v > b.hi && mv.v / 100 >= b.lo && mv.v / 100 <= b.hi) return '単位がcmかもしれません（ふつうは ' + num(b.lo) + '〜' + num(b.hi) + 'm）';
      return b.field ? 'ふつうは ' + num(b.lo) + '〜' + num(b.hi) + 'm の種目です' : (mv.v < b.lo ? '速すぎます' : '遅すぎます') + '（ふつうは ' + num(b.lo) + '〜' + num(b.hi) + '秒）';
    }
    return '';
  }
  function roundKey(s) { return sq(s).replace(/ﾀｲﾑﾚｰｽ|TR/gi, 'タイムレース').replace(/[（(].*?[)）]/g, ''); }
  function who(R, r) { return R.isRelay(r.event || '') ? 'R:' + sq(r.team) + '|' + sq(r.legs || '') : R.athleteKey(r); }
  function groupKey(R, r) { return [who(R, r), r.date || '', R.eventKey(r), roundKey(r.round)].join('|'); }
  // v0.26.57 読める記録は値でくらべる（走幅跳の「5.80」と「5m80」、「12.1」と「12.10」は同じ記録）
  function markKey(R, r) { var v = R.markValue(r.mark, r.event); return v ? '#' + Math.round(v.v * 100) + (v.lower ? 't' : 'd') : sq(r.mark).toUpperCase(); }
  function inPlans(plans, r) {
    var n = sq(r.meet), ps = (plans || []).filter(function (p) { return p && sq(p.meet) === n && p.date; });
    if (!ps.length || !r.date) return true;
    return ps.some(function (p) { return r.date >= p.date && r.date <= (p.end && p.end > p.date ? p.end : p.date); });
  }
  function dateWhy(r, opt) {
    if (opt.today && r.date && r.date > opt.today) return '未来の日付です';
    if (!inPlans(opt.plans, r)) { var ps = (opt.plans || []).filter(function (p) { return p && sq(p.meet) === sq(r.meet); }); return '大会予定の日程（' + ps.map(function (p) { return p.date + (p.end && p.end > p.date ? '〜' + p.end : ''); }).join('・') + '）の外です'; }
    return '';
  }
  // 1件ずつの決まり（mark・date）と、組の決まり（dup・conflict）
  function pairIssues(R, list) {
    var g = {}, out = [];
    list.forEach(function (r) { if (!r || !r.date) return; var k = groupKey(R, r); (g[k] = g[k] || []).push(r); });
    Object.keys(g).forEach(function (k) {
      var a = g[k], seen = {}; a = a.filter(function (r) { if (seen[r.id]) return false; seen[r.id] = 1; return true; });   // 同じ ID は同じ記録（重ねて保存されない）
      if (a.length < 2) return;
      var rk = roundKey(a[0].round), byM = {}, shown = {};
      a.forEach(function (r) { var m = markKey(R, r); if (!(m in shown)) shown[m] = sq(r.mark).toUpperCase(); (byM[m] = byM[m] || []).push(r); });
      Object.keys(byM).forEach(function (m) { if (byM[m].length > 1) out.push({ type: 'dup', recs: byM[m], why: '同じ日・同じ種目' + (rk ? '・同じラウンド' : '') + 'で、記録（' + (shown[m] || '空') + '）も同じです' + (sameMeet(byM[m]) ? '' : '（大会名がちがいます）') }); });
      var ms = Object.keys(byM);
      // ちがう記録：ラウンドが書いてないときは、組がそろっているときだけ（予選と決勝を取りちがえない）
      if (ms.length > 1 && (rk || a.every(function (r) { return sq(r.heat) === sq(a[0].heat); }))) out.push({ type: 'conflict', recs: a, why: '同じ日・同じ種目' + (rk ? '・同じラウンド（' + nk(a[0].round).trim() + '）' : '') + 'なのに、記録が ' + ms.map(function (m) { return shown[m] || '空'; }).join('・') + ' とちがいます' });
    });
    return out;
  }
  function sameMeet(a) { return a.every(function (r) { return sq(r.meet) === sq(a[0].meet); }); }
  function sig(it) { return it.type + ':' + it.recs.map(function (r) { return r.id; }).sort().join(','); }
  /* 保存ずみの記録を調べる。opt：{ plans:[{meet,date,end}], today:'YYYY-MM-DD', ok:{sig:1}（「問題ない」にしたもの） } → 種類ごとの順に並べた一覧 */
  function scan(R, recs, opt) {
    opt = opt || {}; var out = [];
    recs = (recs || []).filter(function (r) { return r && !r._del; });
    out = out.concat(pairIssues(R, recs));
    recs.forEach(function (r) {
      var w = markWhy(R, r); if (w) out.push({ type: 'mark', recs: [r], why: w });
      var d = dateWhy(r, opt); if (d) out.push({ type: 'date', recs: [r], why: d });
    });
    out.forEach(function (it) { it.sig = sig(it); it.recs.sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.savedAt || '').localeCompare(b.savedAt || ''); }); });
    var ok = opt.ok || {};
    return out.filter(function (it) { return !ok[it.sig]; }).sort(function (a, b) { return TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || (a.recs[0].date || '').localeCompare(b.recs[0].date || ''); });
  }
  /* 保存の前：これから入れる記録（id つき）を、保存ずみの記録と、入れる記録どうしでくらべる。
     → { list:[{ id, rec, type, why, other:[記録], ex(はじめは入れないか) }] }。二重（保存ずみと同じ・入れる中で2回目）だけ、はじめから「入れない」 */
  function forBatch(R, add, existing, opt) {
    opt = opt || {}; add = (add || []).filter(Boolean);
    var have = {}; (existing || []).forEach(function (r) { if (r && !r._del) have[r.id] = 1; });
    add = add.filter(function (r) { return !have[r.id]; });   // 同じ ID の保存ずみは、もともと重ねない（保存のときに飛ばす）ので印を付けない
    var ex = (existing || []).filter(function (r) { return r && !r._del; });
    var isNew = function (r) { return add.indexOf(r) >= 0; }, rows = [], at = {};
    var put = function (r, type, why, other, exd) {
      var k = r.id + '|' + type; if (at[k]) return; at[k] = 1;
      rows.push({ id: r.id, rec: r, type: type, why: why, other: other || [], ex: !!exd });
    };
    pairIssues(R, ex.concat(add)).forEach(function (it) {
      var news = it.recs.filter(isNew); if (!news.length) return;
      var olds = it.recs.filter(function (r) { return !isNew(r); });
      news.forEach(function (r, i) {
        var other = it.recs.filter(function (x) { return x !== r; });
        put(r, it.type, it.why, other, it.type === 'dup' && (olds.length > 0 || i > 0));
      });
    });
    add.forEach(function (r) { var w = markWhy(R, r); if (w) put(r, 'mark', w); var d = dateWhy(r, opt); if (d) put(r, 'date', d); });
    rows.sort(function (a, b) { return TYPES.indexOf(a.type) - TYPES.indexOf(b.type); });
    return { list: rows };
  }
  /* v0.26.60 大会名だけちがう二重（同じ日）を、日付と大会名の組でまとめる（🔍 で「まとめて消す」「まとめて問題ない」に使う）。
     items＝scan の結果。2件だけの組（大会名が2つ・同じ日）だけを使い、3件以上の組は1件ずつのまま。→ [{ key, date, meets:[A,B], side:[[A の記録],[B の記録]], items }]（2組以上のものだけ） */
  function dupClusters(items) {
    var by = {}, out = [];
    (items || []).forEach(function (it) {
      if (it.type !== 'dup' || it.recs.length !== 2) return;
      var a = it.recs[0], b = it.recs[1]; if (!a.date || a.date !== b.date || sq(a.meet) === sq(b.meet)) return;
      var pr = [a, b].sort(function (x, y) { return sq(x.meet) < sq(y.meet) ? -1 : 1; }), k = a.date + '|' + sq(pr[0].meet) + '|' + sq(pr[1].meet);
      var c = by[k]; if (!c) { c = by[k] = { key: k, date: a.date, meets: [nk(pr[0].meet).trim(), nk(pr[1].meet).trim()], side: [[], []], items: [] }; out.push(c); }
      c.items.push(it); c.side[0].push(pr[0]); c.side[1].push(pr[1]);
    });
    return out.filter(function (c) { return c.items.length >= 2; });
  }
  /* v0.26.60 取り込みの前：同じ日に、記録がほぼ同じ（選手・種目・ラウンド・記録）で大会名だけちがう保存ずみの大会があるか。決めるのは先生（ここでは知らせるだけ）。
     add＝これから入れる記録、existing＝保存ずみ。「ほぼ同じ」＝重なる行が2件以上で、その日に入れる記録の半分以上。→ [{ key, date, meet(保存ずみの大会名), inMeet, n(重なる件数), total }]（日付ごとにいちばん重なる大会1つ） */
  function overlapKey(R, r) { return [who(R, r), R.eventKey(r), roundKey(r.round), markKey(R, r)].join('|'); }
  function meetOverlap(R, add, existing) {
    var key = function (r) { return overlapKey(R, r); };
    var byDay = {}; (add || []).forEach(function (r) { if (r && r.date) (byDay[r.date] = byDay[r.date] || []).push(r); });
    var out = [];
    Object.keys(byDay).sort().forEach(function (d) {
      var inc = byDay[d], mine = {}; inc.forEach(function (r) { mine[sq(r.meet)] = 1; });
      var g = {}; (existing || []).forEach(function (r) { if (!r || r._del || r.date !== d || mine[sq(r.meet)]) return; var m = sq(r.meet); (g[m] = g[m] || { name: nk(r.meet).trim(), keys: {} }).keys[key(r)] = 1; });
      var best = null;
      Object.keys(g).forEach(function (m) {
        var n = inc.filter(function (r) { return g[m].keys[key(r)]; }).length;
        if (n >= 2 && n * 2 >= inc.length && (!best || n > best.n)) best = { key: d + '|' + m, date: d, meet: g[m].name, inMeet: nk(inc[0].meet).trim(), n: n, total: inc.length };
      });
      if (best) out.push(best);
    });
    return out;
  }
  return { scan: scan, forBatch: forBatch, dupClusters: dupClusters, meetOverlap: meetOverlap, overlapKey: overlapKey, markWhy: markWhy, bounds: bounds, TYPES: TYPES, LABEL: LABEL, sig: sig };
})();
if (typeof module !== 'undefined') module.exports = LaneSuspect;
