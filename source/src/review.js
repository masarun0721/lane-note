/* v0.26.52 今年のふりかえりシート（選手1人＝A4 1枚）。1年分の記録をまとめたあとに、選手・保護者へ配る紙を作る。
   ・中身：名前・学年・学校、期間の中の種目ごとのベスト（公認と参考を分ける・風）、それより前の自己ベストとの比較＝今シーズンの伸び（前の記録が無ければ「今シーズンからの記録」と書くだけで、数字は作らない）、
     自己ベスト更新の印、主な種目の推移グラフ、出た大会と記録・順位、リレー（走順に名前がある記録だけ）、大会数・自己ベスト更新の回数、「先生から一言」の枠。
   ・入れないもの：選手とのやり取り（会話）・体調メモ・記録の備考。HTML の文字列を作るだけの関数（画面・印刷・PDF作成は記録ページの仕組みを使う） */
var LaneReview = (function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sd(d) { var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '.' + m[2] + '.' + m[3] : String(d || ''); }
  function md(d) { var m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? (+m[1]) + '/' + (+m[2]) : String(d || ''); }
  function byDate(a, b) { return (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0); }
  function okDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }
  // 年度（4月〜翌3月）の期間
  function seasonRange(y) { return [y + '-04-01', (y + 1) + '-03-31']; }
  function periodLabel(from, to) {
    var y = +String(from).slice(0, 4);
    if (from === y + '-04-01' && to === (y + 1) + '-03-31') return y + '年度';
    return sd(from) + '〜' + sd(to);
  }
  function inP(r, from, to) { return okDay(r.date) && r.date >= from && r.date <= to; }
  function live(r) { return r && !r._del; }
  // 選手ひとりの、期間の中の記録（リレーは除く）
  function rowsOf(R, all, key) { return all.filter(function (r) { return live(r) && !R.isRelay(r.event || '') && R.athleteKey(r) === key; }); }
  // 選ぶ画面の一覧：期間の中に記録（リレー以外）がある選手
  function athletes(R, rows, from, to) {
    var by = {};
    rows.forEach(function (r) {
      if (!live(r) || R.isRelay(r.event || '') || !inP(r, from, to)) return;
      var k = R.athleteKey(r), x = by[k] || (by[k] = { key: k, name: '', kana: '', grade: '', team: '', n: 0, meets: {}, last: '' });
      x.n++; x.meets[R.nk(r.meet || '').replace(/\s/g, '')] = 1;
      if (!x.last || r.date >= x.last) { x.last = r.date; x.name = r.name || r.kana || x.name; x.kana = r.kana || x.kana; x.team = R.teamLabel(r.team) || x.team; if (r.grade) x.grade = r.grade; }
      else if (!x.grade && r.grade) x.grade = r.grade;
    });
    return R.sortAthletes(Object.keys(by).map(function (k) { var x = by[k]; x.nMeets = Object.keys(x.meets).length; delete x.meets; return x; }));
  }
  // 期間より前の、公認の自己ベスト（同じ種目）
  function prevBest(R, mine, ev, from) {
    var best = null;
    mine.forEach(function (r) {
      if (R.eventKey(r) !== ev || !okDay(r.date) || r.date >= from || !R.isOfficial(r)) return;
      var mv = R.markValue(r.mark); if (!best || (mv.lower ? mv.v < best.mv.v : mv.v > best.mv.v)) best = { r: r, mv: mv };
    });
    return best && best.r;
  }
  function gap(d, lower) { return d.toFixed(2) + (lower ? '秒' : 'm'); }
  // 走順の名前と選手の照合：名前が同じ（空白・旧字の違いは無視）。走順が名字だけのときは、その期間・同じ学校・同じ区分に同じ名字の選手が1人だけのときに限る
  function relaysFor(R, all, pf, from, to) {
    var me = R.nameKey(pf.name), sur = String(R.nk(pf.name)).trim().split(/[\s　]+/)[0], surK = R.nameKey(sur), base = R.schoolBase(pf.team || ''), div = pf.div || '';
    var mates = {};
    all.forEach(function (r) {
      if (!live(r) || R.isRelay(r.event || '') || !inP(r, from, to) || R.schoolBase(r.team || '') !== base) return;
      var d = R.divisionOf(r); if (div && d && d !== div) return;
      var n = String(R.nk(r.name || '')).trim(), s = n.split(/[\s　]+/)[0];
      if (n.split(/[\s　]+/).length > 1) (mates[R.nameKey(s)] = mates[R.nameKey(s)] || {})[R.nameKey(n)] = 1;
    });
    var surOk = surK && surK !== me && Object.keys(mates[surK] || {}).length === 1;
    var out = [];
    all.forEach(function (r) {
      if (!live(r) || !R.isRelay(r.event || '') || !inP(r, from, to) || !r.legs) return;
      if (base && R.schoolBase(R.relayTeamBase(r.team || '')) !== base && R.schoolBase(r.team || '') !== base) return;
      var d = R.divisionOf(r); if (div && d && d !== div) return;
      var legs = R.parseLegs(r.legs), at = -1;
      legs.forEach(function (n, i) { if (at >= 0 || !n) return; var k = R.nameKey(n); if (k === me || (surOk && k === surK)) at = i; });
      if (at >= 0) out.push({ r: r, leg: at + 1, legs: legs });
    });
    return out.sort(function (a, b) { return byDate(a.r, b.r); });
  }
  /* 選手ひとり分のまとめ。opt：{ from, to, nog（男女をまとめて見ているとき）, maxCharts } → null（期間に記録なし）か、シートに使う値 */
  function build(R, all, key, opt) {
    opt = opt || {};
    var from = opt.from, to = opt.to, mine = rowsOf(R, all, key), per = mine.filter(function (r) { return inP(r, from, to); }).sort(byDate);
    if (!per.length) return null;
    var pf = R.athleteProfile(per, key), pd = R.pbDetails(mine), last = per[per.length - 1], grade = '';
    for (var i = per.length - 1; i >= 0 && !grade; i--) grade = per[i].grade || '';
    pf.grade = grade; pf.team = R.teamOf(per) || pf.team; pf.div = R.divisionOf(last);   // v0.26.53 所属は前置きを外した書き方
    var byKey = {}; pf.events.forEach(function (e) { byKey[e.event] = e; });
    var order = [];
    R.groupEvents(Object.keys(byKey), per, opt.nog).forEach(function (g) { g.items.forEach(function (it) { var e = byKey[it.key]; if (e) { e.eventLabel = String(it.label).replace(/(^|\s)(中学|高校)\s+/, '$1').trim() || it.label; order.push(e); }  }); });
    var nPB = 0, nFirst = 0;
    order.forEach(function (e) {
      var rs = per.filter(function (r) { return R.eventKey(r) === e.event; });
      e.pbN = rs.filter(function (r) { return pd[r.id] && pd[r.id].flag === 'PB'; }).length;
      e.first = rs.some(function (r) { return pd[r.id] && pd[r.id].flag === '初'; });
      nPB += e.pbN; if (e.first) nFirst++;
      e.prev = prevBest(R, mine, e.event, from);
      e.before = mine.some(function (r) { return R.eventKey(r) === e.event && okDay(r.date) && r.date < from; });
      e.diff = e.best && e.prev ? R.improvement(e.prev.mark, e.best.mark) : null;
      e.n = rs.length;
    });
    // 出た大会：同じ名前の大会（何日かある大会）は1つにまとめる
    var meets = [], mi = {};
    per.forEach(function (r) {
      var k = R.nk(r.meet || '').replace(/\s/g, ''), m = mi[k];
      if (!m) { m = mi[k] = { meet: r.meet || '', dates: [], items: [] }; meets.push(m); }
      if (m.dates.indexOf(r.date) < 0) m.dates.push(r.date);
      m.items.push(r);
    });
    meets.sort(function (a, b) { return a.dates[0] < b.dates[0] ? -1 : a.dates[0] > b.dates[0] ? 1 : 0; });
    var labelOf = {}; order.forEach(function (e) { labelOf[e.event] = e.eventLabel; });
    meets.forEach(function (m) { m.items.sort(byDate); m.items = m.items.map(function (r) { return { r: r, label: labelOf[R.eventKey(r)] || String(R.eventKeyLabel(r, opt.nog)).replace(/(^|\s)(中学|高校)\s+/, '$1'), pb: pd[r.id] ? pd[r.id].flag : '', has: R.hasMark(r) }; }); });
    var charts = order.filter(function (e) { return e.allPoints.length >= 2; }).slice().sort(function (a, b) { return b.n - a.n; }).slice(0, opt.maxCharts == null ? 4 : opt.maxCharts);
    charts.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    var relays = relaysFor(R, all, pf, from, to);
    return { key: key, name: pf.name, kana: pf.kana || '', team: pf.team || '', grade: grade, div: pf.div, from: from, to: to, events: order, charts: charts, meets: meets, relays: relays,
      counts: { meets: meets.length, recs: per.length, pb: nPB, first: nFirst, events: order.length, relays: relays.length } };
  }
  function windTxt(R, r) { var w = R.shownWind(r); return w ? '風' + w : ''; }
  function vsCell(R, e) {
    if (!e.best) return e.ref ? '<span class="rv-muted">公認の記録はまだありません</span>' : '<span class="rv-muted">記録なし</span>';
    var lower = (R.markValue(e.best.mark) || {}).lower;
    if (e.prev) {   // v0.26.55 「今シーズンの伸び」：去年まで（期間より前）の公認ベスト → 伸び。数字は前と同じ計算
      var was = '去年まで ' + esc(e.prev.mark);
      if (e.diff > 0) return '<span class="rv-up">' + was + ' → ' + esc(gap(e.diff, lower)) + 'アップ</span><small>自己ベスト更新（前は ' + esc(sd(e.prev.date)) + '）</small>';
      if (e.diff === 0) return '<span class="rv-eq">' + was + '　自己ベストと同じ記録</span>';
      return '<span>' + was + '　自己ベストまで あと ' + esc(gap(-e.diff, lower)) + '</span><small>（' + esc(sd(e.prev.date)) + '）</small>';
    }
    return '<span class="rv-new">' + (e.before ? '今シーズンからの公認記録' : '今シーズンからの記録') + '</span>';
  }
  /* シートの HTML（印刷用の lp-page）。meta：{ school, date（出力日）, note（先生から一言・空なら手書きの枠）, chart（LanePrint.chart）, band, page } */
  function sheet(R, d, meta) {
    meta = meta || {};
    var P = meta.print || (typeof LanePrint !== 'undefined' ? LanePrint : null);
    var per = periodLabel(d.from, d.to), c = d.counts;
    var load = d.events.length + d.meets.length + d.meets.reduce(function (m, x) { return m + Math.max(0, x.items.length - 2) * 0.5; }, 0) + d.relays.length + d.charts.length * 3.2;
    var dense = load > 34 ? ' rv-dense2' : load > 24 ? ' rv-dense' : '';
    var chips = [d.team, d.div ? R.divLabel(d.div) : '', d.grade ? d.grade + (/年/.test(d.grade) ? '' : '年') : '', per].filter(Boolean).map(function (x) { return '<i>' + esc(x) + '</i>'; }).join('');
    var h = '<div class="rv-title"><b>' + esc(per) + '　今年のふりかえり</b><span>' + esc(sd(d.from)) + '〜' + esc(sd(d.to)) + ' の大会の記録から</span></div>';
    h += '<div class="rv-kpis"><div class="rv-kpi"><b>' + c.meets + '</b><span>出場した大会</span></div><div class="rv-kpi"><b>' + c.recs + '</b><span>記録の数</span></div><div class="rv-kpi rv-kpb"><b>' + c.pb + '</b><span>自己ベスト更新</span></div><div class="rv-kpi"><b>' + c.events + '</b><span>種目</span></div></div>';
    h += '<div class="lp-h2">種目ごとのベスト（この期間）</div><table class="rv-t rv-best"><thead><tr><th>種目</th><th class="rv-r">ベスト</th><th>日付・大会</th><th>今シーズンの伸び</th></tr></thead><tbody>' + d.events.map(function (e) {
      var b = e.best, f = e.ref, bad = '';
      if (e.pbN) bad += '<span class="rv-bdg rv-bpb">自己ベスト更新' + (e.pbN > 1 ? ' ×' + e.pbN : '') + '</span>';
      if (e.first && !e.prev) bad += '<span class="rv-bdg rv-bfs">初記録</span>';
      var mk = b ? '<b class="rv-mk">' + esc(b.mark) + '</b><span class="rv-bdg rv-ok">公認</span>' + (windTxt(R, b) ? '<small>' + esc(windTxt(R, b)) + '</small>' : '') : f ? '' : '<b class="rv-mk rv-muted">—</b>';
      var rf = f ? '<div class="rv-refl"><b class="rv-mk' + (b ? ' rv-mk2' : '') + '">' + esc(f.mark) + '</b><span class="rv-bdg rv-ref">参考</span><small>' + esc(windTxt(R, f) || '風不明') + '</small></div>' : '';
      var src = b || f;
      return '<tr><td class="rv-ev"><b>' + esc(e.eventLabel) + '</b><small>' + e.n + '回</small>' + (bad ? '<div>' + bad + '</div>' : '') + '</td><td class="rv-r">' + mk + rf + '</td><td class="rv-src">' + (src ? esc(sd(src.date)) + '<br>' + esc(src.meet || '') : '') + '</td><td class="rv-vs">' + vsCell(R, e) + '</td></tr>';
    }).join('') + '</tbody></table>';
    if (d.charts.length && P) {
      h += '<div class="lp-h2">記録の推移 <small class="rv-lg">上ほど良い・●公認 ○参考 <b>●</b>この期間のベスト</small></div><div class="rv-charts' + (d.charts.length === 1 ? ' rv-one' : '') + '">' + d.charts.map(function (e) {
        return '<div class="rv-chart"><div class="rv-ch">' + esc(e.eventLabel) + '</div>' + P.chart(e, { W: d.charts.length === 1 ? 520 : dense ? 300 : 380, H: dense ? 110 : 120 }) + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="lp-h2">出場した大会</div><table class="rv-t rv-meets"><thead><tr><th>日付</th><th>大会</th><th>種目と記録</th></tr></thead><tbody>' + d.meets.map(function (m) {
      var ds = m.dates.slice().sort(); var dl = ds.length > 1 ? md(ds[0]) + '〜' + md(ds[ds.length - 1]) : md(ds[0]);
      return '<tr><td class="rv-d">' + esc(dl) + '</td><td class="rv-mt">' + esc(m.meet) + '</td><td class="rv-its">' + m.items.map(function (x) {
        var r = x.r, rk = r.rank !== '' && r.rank != null && x.has ? (r.heat && /予選|準決/.test(r.round || '') ? r.heat + '組' + r.rank + '着' : r.rank + '位') : '';
        return '<span class="rv-it' + (x.has ? '' : ' rv-nm') + '"><em>' + esc(x.label) + (r.round ? '・' + esc(r.round) : '') + '</em> <b>' + esc(r.mark) + '</b>' + (windTxt(R, r) ? '<small>（' + esc(windTxt(R, r)) + '）</small>' : '') + (rk ? ' <small>' + esc(rk) + '</small>' : '') +
          (x.has && x.pb === 'PB' ? '<span class="rv-bdg rv-bpb">PB</span>' : x.has && x.pb === '初' ? '<span class="rv-bdg rv-bfs">初</span>' : '') + '</span>';
      }).join('') + '</td></tr>';
    }).join('') + '</tbody></table>';
    if (d.relays.length) {
      h += '<div class="lp-h2">リレー（走順に名前がある記録）</div><table class="rv-t rv-rl"><thead><tr><th>日付</th><th>大会</th><th>種目</th><th>走順</th><th class="rv-r">記録</th></tr></thead><tbody>' + d.relays.map(function (x) {
        var r = x.r, rk = r.rank !== '' && r.rank != null && R.hasMark(r) ? r.rank + '位' : '';
        return '<tr><td class="rv-d">' + esc(md(r.date)) + '</td><td class="rv-mt">' + esc(r.meet || '') + (r.round ? '・' + esc(r.round) : '') + '</td><td class="rv-rev">' + esc(R.normEvent(r.event) || r.event) + '</td><td class="rv-legs">' + x.legs.map(function (n, i) { return i + 1 === x.leg ? '<b>' + (i + 1) + '走 ' + esc(n) + '</b>' : '<span>' + (i + 1) + '走 ' + esc(n || '？') + '</span>'; }).join(' → ') + '</td><td class="rv-r"><b class="rv-mk">' + esc(r.mark) + '</b>' + (rk ? ' <small>' + esc(rk) + '</small>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    var note = String(meta.note || '').trim();
    h += '<div class="rv-note"><div class="rv-nh">先生から一言</div>' + (note ? '<div class="rv-ntext">' + esc(note).replace(/\n/g, '<br>') + '</div>' : '<div class="rv-lines" aria-hidden="true"><i></i><i></i><i></i></div>') + '</div>';
    var o = { school: meta.school || '', date: meta.date || '' };
    var head = P ? P.band('ふりかえり', d.name, chips, o, d.kana) : '';
    var out = P ? P.page('ふりかえり', o, h, head) : '<section class="lp-page">' + h + '</section>';
    return out.replace('<section class="lp-page">', '<section class="lp-page rv-page' + dense + '" data-rv="' + esc(d.key) + '">');
  }
  /* 「先生から一言」：この端末（このブラウザ）にだけ保存する。ログイン中はアカウントごとのキー。どこにも送らない */
  var NOTE_MAX = 300, NOTE_KEEP = 600;
  function noteKey(uid) { return uid ? 'lanenote-review-notes-' + uid : 'lanenote-review-notes'; }
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function notesLoad(uid) { var L = ls(); if (!L) return {}; try { var o = JSON.parse(L.getItem(noteKey(uid)) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function noteId(key, from, to) { return String(key) + '|' + from + '|' + to; }
  function noteGet(uid, key, from, to) { var v = notesLoad(uid)[noteId(key, from, to)]; return typeof v === 'string' ? v.slice(0, NOTE_MAX) : ''; }
  function noteSet(uid, key, from, to, text) {
    var L = ls(); if (!L) return false;
    var o = notesLoad(uid), id = noteId(key, from, to), t = String(text || '').slice(0, NOTE_MAX);
    if (t.trim()) { delete o[id]; o[id] = t; } else delete o[id];
    var ks = Object.keys(o); if (ks.length > NOTE_KEEP) ks.slice(0, ks.length - NOTE_KEEP).forEach(function (k) { delete o[k]; });
    try { if (Object.keys(o).length) L.setItem(noteKey(uid), JSON.stringify(o)); else L.removeItem(noteKey(uid)); return true; } catch (e) { return false; }
  }
  /* 印刷の幅（190mm）で測って、A4 1枚（277mm）に入らないときは詰めた形（rv-dense → rv-dense2）にする。画面に出したあとに呼ぶ */
  function fitPages(root) {
    var mm = 96 / 25.4, avail = 277 * mm - 4, n = 0;
    Array.prototype.forEach.call((root || document).querySelectorAll('.rv-page'), function (pg) {
      var st = pg.style, w = st.width, mw = st.maxWidth; st.width = '190mm'; st.maxWidth = 'none';
      var cl = pg.classList;
      if (pg.scrollHeight > avail && !cl.contains('rv-dense') && !cl.contains('rv-dense2')) { cl.add('rv-dense'); n++; }
      if (pg.scrollHeight > avail && !cl.contains('rv-dense2')) { cl.remove('rv-dense'); cl.add('rv-dense2'); n++; }
      st.width = w; st.maxWidth = mw;
    });
    return n;
  }
  return { fitPages: fitPages, build: build, sheet: sheet, athletes: athletes, relaysFor: relaysFor, seasonRange: seasonRange, periodLabel: periodLabel, noteKey: noteKey, noteGet: noteGet, noteSet: noteSet, NOTE_MAX: NOTE_MAX };
})();
if (typeof module !== 'undefined') module.exports = LaneReview;
