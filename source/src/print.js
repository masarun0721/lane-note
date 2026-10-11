// v0.9.0（記録）：「PDFにまとめる」用の印刷レイアウト（A4・ブラウザの印刷→PDFで保存）。HTMLの文字列を作るだけの関数
// v0.9.1：個人表・ランキング・歴代を作り直し（紺と赤のレーン帯の見出し・自己ベストのカード・目盛り付きの大きいグラフ・しま模様の表）
var LanePrint = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function wind(R, r) { return R.shownWind(r) ? esc(r.wind) : ''; }
  function sd(d) { var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '.' + m[2] + '.' + m[3] : esc(d || ''); }
  function hasNum(m) { return /\d/.test(String(m || '')); }
  // 見出しの帯：左に種類のラベルと大きい見出し・下に小さい情報、右に学校名と出力日
  function band(kind, big, sub, meta, small) {
    return '<header class="lp-band"><div class="lp-bl"><span class="lp-kind">LANE NOTE ・ ' + esc(kind) + '</span><b class="lp-big">' + esc(big) + (small ? '<small>' + esc(small) + '</small>' : '') + '</b>' + (sub ? '<span class="lp-sub">' + sub + '</span>' : '') + '</div>' +
      '<div class="lp-br">' + (meta.school ? '<span class="lp-school">' + esc(meta.school) + '</span>' : '') + '<span class="lp-date">出力日 ' + esc(meta.date || today()) + '</span></div></header>';
  }
  function foot() { return '<footer class="lp-f"><span class="lp-logo">LANE NOTE</span><span>LANE LOG（記録）</span></footer>'; }
  function page(title, meta, body, head) {
    return '<section class="lp-page">' + (head || band(title, title, '', meta)) + '<div class="lp-body">' + body + '</div>' + foot() + '</section>';
  }
  // 記録の値を目盛り用の文字に（タイム：12.10・1:02.34／距離：5m48／点）
  function fmtV(v, lower) {
    if (!lower) return v >= 100 ? String(Math.round(v)) : Math.floor(v) + 'm' + ('0' + Math.round((v - Math.floor(v)) * 100)).slice(-2);
    if (v >= 60) { var m = Math.floor(v / 60), s = v - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
    return v.toFixed(2);
  }
  // 目盛り付きのグラフ（上ほど良い・●公認 ○参考 赤＝ベスト・下の×＝記録なし）
  function chart(e) {
    var pts = e.allPoints || [], nms = e.noMarks || [], lower = e.lower !== false;
    if (pts.length < 2 && !nms.length) return '';
    var W = 640, H = nms.length ? 150 : 128, L = 52, Rr = 16, T = 14, B = nms.length ? 50 : 28;
    var tl = pts.map(function (p, i) { return { k: 'm', i: i, date: p.date }; }).concat(nms.map(function (p, i) { return { k: 'x', i: i, date: p.date }; }));
    tl.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.k === b.k ? a.i - b.i : a.k === 'm' ? -1 : 1); });
    var xs = { m: [], x: [] }, n = tl.length, iw = W - L - Rr;
    tl.forEach(function (t, j) { xs[t.k][t.i] = r1(n < 2 ? L + iw / 2 : L + 10 + j * (iw - 20) / (n - 1)); });
    var vs = pts.map(function (p) { return p.v; }), lo = vs.length ? Math.min.apply(null, vs) : 0, hi = vs.length ? Math.max.apply(null, vs) : 1, pad = (hi - lo) * 0.12 || (lower ? 0.1 : 0.1); lo -= pad; hi += pad;
    var bot = H - B, ih = bot - T;
    function y(v) { var t = (v - lo) / (hi - lo); return r1(lower ? T + t * ih : bot - t * ih); }
    var s = '<svg class="lp-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(e.eventLabel || '') + 'の記録の推移（上ほど良い）">';
    for (var k = 0; k <= 3; k++) { var v = lo + (hi - lo) * k / 3, yy = y(v); s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + yy + '" y2="' + yy + '" class="lp-grid"/>' + (pts.length ? '<text x="' + (L - 6) + '" y="' + (yy + 3.5) + '" class="lp-ax" text-anchor="end">' + esc(fmtV(v, lower)) + '</text>' : ''); }
    s += '<line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + bot + '" class="lp-axl"/><line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + bot + '" y2="' + bot + '" class="lp-axl"/>';
    var step = Math.max(1, Math.ceil(n / 7)); tl.forEach(function (t, j) { if (j % step && j !== n - 1) return; var x = xs[t.k][t.i]; s += '<text x="' + x + '" y="' + (bot + 14) + '" class="lp-ax" text-anchor="middle">' + esc(String(t.date || '').slice(2).replace(/-/g, '/')) + '</text>'; });
    var bi = -1; pts.forEach(function (p, i) { if (!p.ref && (bi < 0 || (lower ? p.v < pts[bi].v : p.v > pts[bi].v))) bi = i; });
    var off = pts.map(function (p, i) { return p.ref ? null : xs.m[i] + ',' + y(p.v); }).filter(Boolean);
    if (pts.length > 1) s += '<polyline points="' + pts.map(function (p, i) { return xs.m[i] + ',' + y(p.v); }).join(' ') + '" class="lp-lall"/>';
    if (off.length > 1) s += '<polyline points="' + off.join(' ') + '" class="lp-loff"/>';
    pts.forEach(function (p, i) {
      var x = xs.m[i], yy = y(p.v);
      s += i === bi ? '<circle cx="' + x + '" cy="' + yy + '" r="6" class="lp-pbdot"/><text x="' + x + '" y="' + (yy - 10) + '" class="lp-pblab" text-anchor="middle">PB ' + esc(p.mark) + '</text>' : '<circle cx="' + x + '" cy="' + yy + '" r="4" class="' + (p.ref ? 'lp-refdot' : 'lp-dot') + '"/>';
    });
    if (nms.length) { var yx = H - 13; s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + (H - 24) + '" y2="' + (H - 24) + '" class="lp-grid"/>'; nms.forEach(function (p, i) { var x = xs.x[i]; s += '<text x="' + x + '" y="' + yx + '" class="lp-x" text-anchor="middle">×</text><text x="' + x + '" y="' + (yx + 10) + '" class="lp-xl" text-anchor="middle">' + esc(p.mark) + '</text>'; }); }
    return s + '</svg>';
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  // 個人表：見出しの帯（名前・学校・区分・学年）・自己ベストのカード・種目ごとのグラフと記録の表
  function athleteSheet(R, all, key, o) {
    o = o || {};
    var mine = all.filter(function (r) { return R.athleteKey(r) === key; }), pf = R.athleteProfile(mine, key);
    if (!pf) return '';
    var order = [], byKey = {}; pf.events.forEach(function (e) { byKey[e.event] = e; });
    R.groupEvents(Object.keys(byKey), mine, o.nog).forEach(function (g) { g.items.forEach(function (it) { byKey[it.key].eventLabel = it.label; order.push(byKey[it.key]); }); });
    var dv = R.divisionOf(pf), chips = [pf.team, dv ? R.divLabel(dv) : '', pf.grade ? pf.grade + (/年/.test(pf.grade) ? '' : '年') : '', pf.count + '件の記録'].filter(Boolean);
    var sub = chips.map(function (c) { return '<i>' + esc(c) + '</i>'; }).join('');
    var cards = '<div class="lp-cards">' + order.map(function (e) {
      var b = e.best || e.ref || {}, off = !!e.best, w = wind(R, b);
      return '<div class="lp-card' + (b.mark ? '' : ' lp-none') + '"><div class="lp-cev">' + esc(e.eventLabel) + '</div><div class="lp-cmk">' + esc(b.mark || '—') + (w ? '<span class="lp-cw">' + w + '</span>' : '') + '</div>' +
        (b.mark ? '<span class="lp-badge ' + (off ? 'lp-ok' : 'lp-ref') + '">' + (off ? '公認' : '参考') + '</span>' : '') +
        '<div class="lp-cmeta">' + (b.date ? sd(b.date) : '') + (b.meet ? '<br>' + esc(b.meet) : '') + '</div><div class="lp-ccount">' + e.count + '件</div></div>';
    }).join('') + '</div>';
    var evs = order.map(function (e) {
      var rs = mine.filter(function (r) { return R.eventKey(r) === e.event; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      var c = chart(e), b = e.best || e.ref;
      return '<div class="lp-ev"><div class="lp-h3"><span>' + esc(e.eventLabel) + '</span>' + (b ? '<em>PB ' + esc(b.mark) + '</em>' : '') + '</div>' + (c ? '<div class="lp-chart">' + c + '</div>' : '') +
        '<table class="lp-t"><thead><tr><th>日付</th><th>大会</th><th>ラウンド</th><th class="lp-r">記録</th><th class="lp-r">風</th><th class="lp-r">順位</th></tr></thead><tbody>' + rs.map(function (r) {
          var pb = e.best && e.best.id === r.id, nm = !hasNum(r.mark);
          return '<tr' + (pb ? ' class="lp-pb"' : nm ? ' class="lp-nm"' : '') + '><td class="lp-num">' + sd(r.date) + '</td><td>' + esc(r.meet) + '</td><td>' + esc(r.round || '') + '</td><td class="lp-mk lp-r">' + esc(r.mark) + (pb ? '<span class="lp-tag">PB</span>' : '') + '</td><td class="lp-num lp-r">' + wind(R, r) + '</td><td class="lp-num lp-r">' + esc(r.rank || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
    return page('個人表', o, '<div class="lp-h2">種目ごとの自己ベスト</div>' + cards + '<div class="lp-h2">記録の一覧</div>' + evs, band('個人表', pf.name, sub, o, pf.kana));
  }
  // 部内ランキング・歴代記録（evs：出す種目の順。1種目＝1つの表、ページをまたいでもよい）
  function rankSheet(R, kind, data, evs, label, o) {
    var title = kind === 'hist' ? '歴代記録' : '部内ランキング';
    var body = evs.map(function (ev) {
      return '<div class="lp-ev"><div class="lp-h3"><span>' + esc(label(ev)) + '</span><em>' + (data[ev] || []).length + '人</em></div><table class="lp-t lp-rk"><thead><tr><th class="lp-r">順位</th><th>氏名</th><th>' + (kind === 'hist' ? '年度' : '学年') + '</th><th class="lp-r">記録</th><th class="lp-r">風</th><th>日付</th><th>大会</th></tr></thead><tbody>' + (data[ev] || []).map(function (x) {
        return '<tr' + (x.rank <= 3 ? ' class="lp-top lp-top' + x.rank + '"' : '') + '><td class="lp-r"><span class="lp-rn">' + x.rank + '</span></td><td class="lp-nmn">' + esc(x.name) + '</td><td>' + esc(kind === 'hist' ? R.seasonLabel(x.season) : x.grade ? x.grade + '年' : '') + '</td><td class="lp-mk lp-r">' + esc(x.best.mark) + '</td><td class="lp-num lp-r">' + wind(R, x.best) + '</td><td class="lp-num">' + sd(x.best.date) + '</td><td>' + esc(x.best.meet) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }).join('');
    return page(title, o, body, band(kind === 'hist' ? 'HISTORY' : 'RANKING', title, o.cond ? '<i class="lp-cond">' + esc(o.cond) + '</i>' : '', o));
  }
  // v0.9.2：大会まとめ（その大会に出たチーム全員の結果・PB/初記録・前回との差）。recs＝絞り込み後のその大会の記録、hist＝その選手たちの全記録
  function meetSheet(R, recs, hist, o) {
    o = o || {};
    var pbd = R.pbDetails(hist), names = {}, nPB = 0, nFirst = 0, hl = [];
    function prevOf(r) {
      var k = R.athleteKey(r), ek = R.eventKey(r), best = null;
      hist.forEach(function (x) { if (x.id !== r.id && R.athleteKey(x) === k && R.eventKey(x) === ek && R.markValue(x.mark) && (x.date || '') < (r.date || '') && (!best || x.date > best.date || x.date === best.date && (x.order || 0) > (best.order || 0))) best = x; });
      return best;
    }
    recs.forEach(function (r) { names[R.athleteKey(r)] = 1; var p = pbd[r.id]; if (p && p.flag === 'PB') { nPB++; hl.push({ r: r, p: p }); } else if (p) nFirst++; });
    var evs = []; recs.forEach(function (r) { var k = R.eventKey(r); if (evs.indexOf(k) < 0) evs.push(k); });
    var body = '<div class="lp-sum"><div class="lp-kpi"><b>' + Object.keys(names).length + '</b><span>出場人数</span></div><div class="lp-kpi"><b>' + recs.length + '</b><span>記録数</span></div><div class="lp-kpi lp-kpb"><b>' + nPB + '</b><span>PB更新</span></div><div class="lp-kpi"><b>' + nFirst + '</b><span>初記録</span></div></div>';
    if (hl.length) body += '<div class="lp-hl"><div class="lp-h3"><span>🔥 PB更新</span><em>' + hl.length + '件</em></div><ul>' + hl.map(function (h) { return '<li><b>' + esc(h.r.name) + '</b> ' + esc(R.eventKeyLabel(h.r, o.nog)) + ' <span class="lp-mk">' + esc(h.r.mark) + '</span>' + (h.p.diff != null ? ' <span class="lp-up">' + esc(R.fmtImprovement(h.p.diff, h.p.lower)) + '</span>' : '') + (h.p.prev ? ' <small>（前のPB ' + esc(h.p.prev.mark) + '）</small>' : '') + '</li>'; }).join('') + '</ul></div>';
    if (!recs.length) body += '<p class="lp-empty">この条件の記録はありません。</p>';
    body += '<div class="lp-cols">';
    R.groupEvents(evs, recs, o.nog).forEach(function (g) {
      body += '<div class="lp-div">' + esc(g.group) + '</div>';
      g.items.forEach(function (it) {
        var rs = recs.filter(function (r) { return R.eventKey(r) === it.key; }).sort(function (a, b) { var va = R.markValue(a.mark), vb = R.markValue(b.mark); if (!va !== !vb) return va ? -1 : 1; if (va && vb && va.v !== vb.v) return va.lower ? va.v - vb.v : vb.v - va.v; return (a.order || 0) - (b.order || 0); });
        body += '<div class="lp-ev"><div class="lp-h3"><span>' + esc(it.label) + '</span><em>' + rs.length + '件</em></div><table class="lp-t lp-mt"><thead><tr><th>氏名</th><th>学年</th><th>ラウンド</th><th class="lp-r">記録</th><th class="lp-r">風</th><th class="lp-r">順位</th><th></th><th class="lp-r">前回差</th></tr></thead><tbody>' + rs.map(function (r) {
          var p = pbd[r.id], mv = R.markValue(r.mark), pv = mv ? prevOf(r) : null, d = pv ? R.improvement(pv.mark, r.mark) : null;
          var diff = d == null ? '' : d === 0 ? '±0' : d > 0 ? R.fmtImprovement(d, mv.lower) : (mv.lower ? '+' : '−') + Math.abs(d).toFixed(2) + (mv.lower ? '秒' : '');
          var rd = [r.round, r.heat !== '' && r.heat != null ? r.heat + '組' : ''].filter(Boolean).join(' ');
          return '<tr class="' + (!mv ? 'lp-nm' : p && p.flag === 'PB' ? 'lp-pb' : '') + '"><td class="lp-nmn">' + esc(r.name) + '</td><td>' + esc(r.grade ? r.grade + '年' : '') + '</td><td>' + esc(rd) + '</td><td class="lp-mk lp-r">' + esc(r.mark) + '</td><td class="lp-num lp-r">' + wind(R, r) + '</td><td class="lp-num lp-r">' + esc(r.rank) + '</td><td>' + (p ? '<span class="lp-bdg' + (p.flag === 'PB' ? ' lp-bpb">PB' : ' lp-bfs">初記録') + '</span>' : '') + '</td><td class="lp-num lp-r' + (d > 0 ? ' lp-up' : '') + '">' + esc(diff) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      });
    });
    var sub = [sd(o.meetDate), o.cond].filter(Boolean).map(function (c) { return '<i>' + esc(c) + '</i>'; }).join('');
    body += '</div>';
    // v0.9.3：天気・気温は出さない（1日の中でばらつくため）。o.one＝1枚にまとめる（縮小・2段組み）
    var out = page('大会まとめ', o, body, band('MEET REPORT', o.meet || '大会まとめ', sub, o));
    return o.one ? out.replace('<section class="lp-page">', '<section class="lp-page lp-one" data-one="1">') + '<p class="lp-fitnote" id="lpFitNote" hidden>人数が多いため文字が小さくなっています</p>' : out;
  }
  return { meetSheet: meetSheet, esc: esc, today: today, page: page, chart: chart, fmtV: fmtV, athleteSheet: athleteSheet, rankSheet: rankSheet };
})();
if (typeof module !== 'undefined') module.exports = LanePrint;
