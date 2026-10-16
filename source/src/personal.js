/* ===== v0.16：選手用の個人ページ（記録のスナップショット）と、体調メモ（このスマホにだけ保存） =====
   ・個人ページの中身は、先生が記録ページで作った「その選手1人分」の記録だけ（ほかの選手は入れない）
   ・体調メモ（体調5段階・睡眠時間・ひとことメモ）は localStorage にだけ保存し、どこにも送らない（先生にも見えない） */
var LanePersonal = (function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nk(s) { return String(s == null ? '' : s).normalize('NFKC').trim(); }
  /* ---------- 体調メモ ---------- */
  var CKEY = 'lanenote.cond.v1', FACES = ['', '😣', '😟', '😐', '🙂', '😄'], FWORD = ['', 'とても悪い', '悪い', 'ふつう', '良い', 'とても良い'];
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  /* C312：保存されている中身も1件ずつ確かめる（日付・体調1〜5・睡眠0〜24・メモ100文字） */
  function okCond(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    var s = typeof c.s === 'number' && c.s >= 1 && c.s <= 5 && Math.floor(c.s) === c.s ? c.s : null;
    var sl = typeof c.sl === 'number' && isFinite(c.sl) && c.sl >= 0 && c.sl <= 24 ? c.sl : null;
    var m = typeof c.m === 'string' ? c.m.slice(0, 100) : '';
    if (s == null && sl == null && !m) return null;
    return { s: s, sl: sl, m: m, at: typeof c.at === 'string' ? c.at.slice(0, 40) : '' };
  }
  function cLoad() { var L = ls(); if (!L) return {}; try { var o = JSON.parse(L.getItem(CKEY) || '{}'), out = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return {}; Object.keys(o).forEach(function (d) { var c = validDay(d) && okCond(o[d]); if (c) out[d] = c; }); return out; } catch (e) { return {}; } }
  function cStore(m) { var L = ls(); if (!L) throw new Error('このブラウザでは保存できません'); if (Object.keys(m).length) L.setItem(CKEY, JSON.stringify(m)); else L.removeItem(CKEY); }
  function validDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ''); }
  function cGet(d) { var o = cLoad()[d]; return o && typeof o === 'object' ? o : null; }
  function cleanCond(o) {
    var s = parseInt(o.s, 10), sl = o.sl === '' || o.sl == null ? null : Number(o.sl);
    return { s: s >= 1 && s <= 5 ? s : null, sl: sl != null && isFinite(sl) && sl >= 0 && sl <= 24 ? Math.round(sl * 2) / 2 : null, m: String(o.m || '').slice(0, 100), at: new Date().toISOString() };
  }
  function cSet(d, o) { if (!validDay(d)) throw new Error('日付が正しくありません'); var m = cLoad(), c = cleanCond(o); if (c.s == null && c.sl == null && !c.m) delete m[d]; else m[d] = c; cStore(m); return m[d] || null; }
  function cDel(d) { var m = cLoad(); delete m[d]; cStore(m); }
  function cDelAll() { var L = ls(); if (L) L.removeItem(CKEY); }
  function cList() { var m = cLoad(); return Object.keys(m).filter(validDay).sort().reverse().map(function (d) { return { d: d, c: m[d] }; }); }
  function ymd(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
  function dayKey(s) { var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(nk(s)); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
  function mdLabel(d) { var p = d.split('-'); return (+p[1]) + '月' + (+p[2]) + '日'; }
  function condBadge(c) {
    if (!c) return '';
    return '<span class="cd-badge">' + [c.s ? FACES[c.s] + ' 体調' + esc(c.s) : '', c.sl != null ? '😴 ' + esc(c.sl) + '時間' : '', c.m ? '「' + esc(c.m) + '」' : ''].filter(Boolean).join('・') + '</span>';
  }
  var PRIV = '🔒 このスマホにだけ保存します。先生やほかの人には見えません（送信もしません）。同じスマホを使う人は見られるので、共用のスマホでは使い終わったら消してください。';
  function condFormHtml(d, title) {
    var c = cGet(d) || {};
    return '<div class="cd-box" data-cdday="' + esc(d) + '"><h3>' + esc(title || '体調メモ') + '</h3>' +
      '<div class="cd-priv">🔒 このスマホだけに保存（先生には見えません） <span data-xp="">' + PRIV + '</span></div>' +
      '<div class="cd-lab">体調（5段階）</div><div class="cd-faces" role="radiogroup" aria-label="体調">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="cd-f' + (c.s === n ? ' on' : '') + '" data-cds="' + n + '" aria-pressed="' + (c.s === n) + '" aria-label="' + FWORD[n] + '"><span>' + FACES[n] + '</span><small>' + n + '</small></button>'; }).join('') + '</div>' +
      '<div class="cd-row"><label>睡眠時間 <input type="number" inputmode="decimal" min="0" max="24" step="0.5" class="cd-sl" value="' + (c.sl != null ? esc(c.sl) : '') + '"> 時間</label></div>' +
      '<div class="cd-row"><input type="text" class="cd-m" maxlength="100" placeholder="ひとことメモ（例：足が軽かった）" value="' + esc(c.m || '') + '" aria-label="ひとことメモ"></div>' +
      '<div class="cd-row"><button type="button" class="cd-save">💾 保存</button><button type="button" class="cd-del"' + (cGet(d) ? '' : ' hidden') + '>🗑 この日のメモを削除</button></div><div class="cd-msg" aria-live="polite"></div></div>';
  }
  function bindCond(box, onChange) {
    if (!box) return;
    var el = box.querySelector('.cd-box'); if (!el) return;
    var d = el.getAttribute('data-cdday'), sel = (cGet(d) || {}).s || null;
    el.querySelectorAll('[data-cds]').forEach(function (b) { b.addEventListener('click', function () {
      sel = +b.getAttribute('data-cds'); el.querySelectorAll('[data-cds]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    }); });
    var msg = el.querySelector('.cd-msg');
    el.querySelector('.cd-save').addEventListener('click', function () {
      try { var r = cSet(d, { s: sel, sl: el.querySelector('.cd-sl').value, m: el.querySelector('.cd-m').value.trim() }); msg.textContent = r ? '✔ ' + mdLabel(d) + 'の体調メモを保存しました（このスマホだけ）' : '空なので保存しませんでした'; el.querySelector('.cd-del').hidden = !r; if (onChange) onChange(); }
      catch (e) { msg.textContent = '保存できませんでした：' + e.message; }
    });
    el.querySelector('.cd-del').addEventListener('click', function () {
      if (!confirm(mdLabel(d) + 'の体調メモを、このスマホから削除しますか？')) return;
      try { cDel(d); } catch (e) { }
      sel = null; el.querySelectorAll('[data-cds]').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      el.querySelector('.cd-sl').value = ''; el.querySelector('.cd-m').value = ''; el.querySelector('.cd-del').hidden = true; msg.textContent = '削除しました'; if (onChange) onChange();
    });
  }
  /* ---------- 推移グラフ（記録ページの選手グラフと同じ描き方：上ほど良い・白抜きは参考・下の帯の×は記録なし） ---------- */
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
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
    var off = xy.filter(function (q, i) { return !pts[i].ref; }), yx = H - 9;
    return '<svg class="spark' + (nms.length ? ' hasnm' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="記録の推移（上ほど良い・白抜きは参考記録' + (nms.length ? '・下の×は記録なし（DNS・失格など）' : '') + '）">' +
      (nms.length ? '<line x1="4" x2="' + (W - 4) + '" y1="' + (H - B + 1) + '" y2="' + (H - B + 1) + '" stroke="#d6dbe5" stroke-width="0.8"/>' : '') +
      (xy.length > 1 ? '<polyline fill="none" stroke="#9aa8c0" stroke-width="1.2" stroke-dasharray="3 3" points="' + xy.map(function (q) { return q.join(','); }).join(' ') + '"/>' : '') +
      (off.length > 1 ? '<polyline fill="none" stroke="#1f3a68" stroke-width="2" points="' + off.map(function (q) { return q.join(','); }).join(' ') + '"/>' : '') +
      xy.map(function (q, i) { var p = pts[i], t = '<title>' + esc(p.date + ' ' + (lower ? p.mark : dm(p.mark)) + (p.wind ? '（風' + p.wind + '）' : '') + (p.ref ? '・参考' : '')) + '</title>';
        return p.ref ? '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="3.6" fill="#fff" stroke="#8a96ad" stroke-width="1.6">' + t + '</circle><text x="' + Math.min(W - 12, Math.max(12, q[0])) + '" y="' + Math.max(8, q[1] - 6) + '" font-size="8" fill="#8a96ad" text-anchor="middle">参考</text>'
          : '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (i === bi ? 4.5 : 3) + '" fill="' + (i === bi ? '#e4572e' : '#1f3a68') + '">' + t + '</circle>'; }).join('') +
      nms.map(function (p, i) { var x = xs.x[i], d = 3.4;
        return '<g class="nmx" data-nm="' + esc(p.mark) + '"><title>' + esc(p.date + ' ' + p.meet + (p.round ? '・' + p.round : '') + '：' + p.mark) + '</title><path d="M' + (x - d) + ' ' + (yx - d) + 'L' + (x + d) + ' ' + (yx + d) + 'M' + (x + d) + ' ' + (yx - d) + 'L' + (x - d) + ' ' + (yx + d) + '" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"/>' +
          '<text x="' + Math.min(W - 10, Math.max(10, x)) + '" y="' + (yx - 5) + '" font-size="7" fill="#c0392b" text-anchor="middle">' + esc(String(p.mark).slice(0, 4)) + '</text></g>'; }).join('') + '</svg>';
  }
  /* ---------- 個人ページの中身（k:'pp'）
     { v:1, k:'pp', g:作成日時, a:{name, team, grade}, e:[{ l:種目名, lw:1=時間(小さいほど良い), n:件数,
        b:[記録,風,日付,大会]（公認ベスト）, rf:[…]（参考ベスト）, p:[[日付,値,記録,風,参考1/0]…], x:[[日付,記録,大会,ラウンド]…], r:[[日付,記録,風,大会,ラウンド,PB/初]…] }],
       nx:{ s:短いリンクのID, n:大会名 } } ---------- */
  var MAX_EV = 40, MAX_P = 80, MAX_X = 30, MAX_R = 8;
  function S(v, n) { if (v == null) return ''; if (typeof v !== 'string' && typeof v !== 'number') throw new Error('リンクの中身の形が違います'); return String(v).slice(0, n || 80); }
  function arr(a, max) { if (a == null) return []; if (!Array.isArray(a)) throw new Error('リンクの中身の形が違います'); return a.slice(0, max); }
  function row(a, n) { if (a == null) return null; if (!Array.isArray(a)) throw new Error('リンクの中身の形が違います'); var o = []; for (var i = 0; i < n; i++) o.push(S(a[i], 80)); return o; }
  // v0.26.62 跳躍・投てき（lw＝0：大きいほど良い）の「5.80」は「5.80m」で見せる（リンクの中身は変えない。得点は小数が無いのでそのまま）
  function dm(m) { var t = String(m == null ? '' : m).trim(); return /^\d{1,2}\.\d{1,2}$/.test(t) ? t + 'm' : m; }
  function pm(e, m) { return e && !e.lw ? dm(m) : m; }
  function sanitize(o) {
    if (!o || o.v !== 1 || o.k !== 'pp' || !o.a || typeof o.a !== 'object') throw new Error('リンクの中身を読めませんでした');
    return { v: 1, k: 'pp', g: S(o.g, 40), a: { name: S(o.a.name, 60), team: S(o.a.team, 80), grade: S(o.a.grade, 10) },
      e: arr(o.e, MAX_EV).map(function (e) {
        if (!e || typeof e !== 'object') throw new Error('リンクの中身の形が違います');
        return { l: S(e.l, 60), lw: e.lw ? 1 : 0, n: +e.n || 0, b: row(e.b, 4), rf: row(e.rf, 4),
          p: arr(e.p, MAX_P).map(function (p) { var r = row(p, 5); return { date: r[0], v: +r[1], mark: r[2], wind: r[3], ref: r[4] === '1' }; }).filter(function (p) { return isFinite(p.v); }),
          x: arr(e.x, MAX_X).map(function (p) { var r = row(p, 4); return { date: r[0], mark: r[1], meet: r[2], round: r[3] }; }),
          r: arr(e.r, MAX_R).map(function (p) { return row(p, 6); }) };
      }),
      nx: o.nx && typeof o.nx === 'object' && /^[A-Za-z0-9]{6,40}$/.test(String(o.nx.s || '')) ? { s: String(o.nx.s), n: S(o.nx.n, 100) } : null,
      sc: typeof LanePlans !== 'undefined' ? LanePlans.fromSc(o.sc) : [],   // v0.26.30 これからの大会（先生の予定）
      tk: '' };   // v0.24.3：個人ページからのやり取りは一時停止（監査 C302）   // v0.24：先生とのやり取り（先生がオンにしたときだけ入る）
  }
  function snapLabel(g) { var d = g ? new Date(g) : null; return d && !isNaN(d) ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '作成した日'; }
  var VIEW = { official: false, nm: true, ev: '' };
  /* opts: { base: 予定ページのアドレス, schedules: [{url, label}] このスマホに保存されている大会の予定, condDay: 今日 } */
  function render(o, box, opts) {
    opts = opts || {};
    var cond = cLoad();
    if (VIEW.ev && !o.e.some(function (e) { return e.l === VIEW.ev; })) VIEW.ev = '';
    var shown = VIEW.ev ? o.e.filter(function (e) { return e.l === VIEW.ev; }) : o.e;
    var h = '<div class="pp-head"><div class="pp-ttl">自分の記録</div><div class="pp-name">' + esc(o.a.name) + ' さん</div><div class="pp-sub">' + esc([o.a.team, o.a.grade ? o.a.grade + '年' : ''].filter(Boolean).join('・')) + '</div></div>' +
      '<div class="pp-snap">📸 ' + esc(snapLabel(o.g)) + '時点の記録です。先生が更新したら新しいリンクをもらってください。</div>';
    var links = [];
    if (o.nx && opts.base) links.push('<a class="pp-go" href="' + esc(opts.base + '?s=' + o.nx.s) + '">📅 大会当日の予定を見る' + (o.nx.n ? '<small>' + esc(o.nx.n) + '</small>' : '') + '</a>');
    (opts.schedules || []).forEach(function (s) { links.push('<a class="pp-go sub" href="' + esc(s.url) + '">📅 ' + esc(s.label) + '<small>このスマホに保存している予定</small></a>'); });
    if (links.length) h += '<div class="pp-links">' + links.join('') + '</div>';
    if (o.sc && o.sc.length && typeof LanePlans !== 'undefined') { var sch = LanePlans.scHtml(o.sc); if (sch) h += '<div class="pp-card pp-sc"><div class="pp-h">📅 これからの大会</div>' + sch + '</div>'; }
    if (!o.e.length) return box.innerHTML = h + '<p class="muted">まだ記録がありません。</p>' + condSection(o, opts), bindAll(o, box, opts);
    h += '<div class="pp-card"><div class="pp-h">🏅 自己ベスト</div><ul class="pp-pbs">' + o.e.map(function (e) { var b = e.b || e.rf;
      return '<li><button type="button" class="pp-ev" data-ppev="' + esc(e.l) + '">' + esc(e.l) + '</button><b>' + esc(b ? pm(e, b[0]) : '—') + (e.b ? '' : b ? '<span class="ref">参考</span>' : '') + '</b><small>' + esc(b ? [b[1] ? '風' + b[1] : '', b[2], b[3]].filter(Boolean).join('・') : '') + '</small></li>'; }).join('') + '</ul></div>';
    if (o.e.length > 1) h += '<div class="evsw pp-sw"><button type="button" data-ppev=""' + (VIEW.ev ? '' : ' class="on"') + '>すべて</button>' + o.e.map(function (e) { return '<button type="button" data-ppev="' + esc(e.l) + '"' + (VIEW.ev === e.l ? ' class="on"' : '') + '>' + esc(e.l) + '</button>'; }).join('') + '</div>';
    h += shown.map(function (e) {
      var hasRef = e.p.some(function (p) { return p.ref; });
      return '<div class="pp-card"><div class="pp-h">' + esc(e.l) + ' <small>' + e.n + '件</small></div>' +
        (e.b ? '<div class="pp-best"><small>自己ベスト（公認）</small><b>' + esc(pm(e, e.b[0])) + '</b><small>' + esc([e.b[1] ? '風' + e.b[1] : '', e.b[2], e.b[3]].filter(Boolean).join('・')) + '</small></div>' : '') +
        (e.rf ? '<div class="small">参考 ' + esc(pm(e, e.rf[0])) + ' <span class="muted">' + esc([e.rf[1] ? '風' + e.rf[1] : '', e.rf[2]].filter(Boolean).join(' ')) + '</span></div>' : '') +
        '<div class="sparkbox chartbox">' + spark(e.p, !!e.lw, VIEW.official, e.x, VIEW.nm) + '<span class="chartopt"><span class="muted">推移（上ほど良い）●公認 <b style="color:#e4572e">●</b>ベスト</span>' +
        (hasRef ? '<label><input type="checkbox" data-ppofficial="1"' + (VIEW.official ? ' checked' : '') + '> 公認だけ</label>' : '') +
        (e.x.length ? '<label><input type="checkbox" data-ppnm="1"' + (VIEW.nm ? ' checked' : '') + '> DNS・失格なども表示</label>' : '') + '</span></div>' +
        '<div class="pp-sh">最近の記録</div><ul class="recent">' + e.r.map(function (r) { var dk = dayKey(r[0]);
          return '<li><span class="d">' + esc(r[0]) + '</span><b>' + esc(pm(e, r[1])) + '</b>' + (r[5] === 'PB' ? '<span class="pb">PB</span>' : r[5] === '初' ? '<span class="pb first">初</span>' : '') + '<span class="m">' + esc([r[2] ? '風' + r[2] : '', r[3], r[4]].filter(Boolean).join('・')) + '</span>' + (cond[dk] ? '<span class="m">' + condBadge(cond[dk]) + '</span>' : '') + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    box.innerHTML = h + condSection(o, opts);
    bindAll(o, box, opts);
  }
  function resultsOn(o, d) {
    var out = [];
    o.e.forEach(function (e) { e.r.forEach(function (r) { if (dayKey(r[0]) === d) out.push(e.l + ' ' + pm(e, r[1])); }); e.x.forEach(function (x) { if (dayKey(x.date) === d) out.push(e.l + ' ' + x.mark); }); });
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function condSection(o, opts) {
    var day = opts.condDay || ymd(new Date()), list = cList();
    return '<div class="pp-card pp-cond"><div class="pp-h">📝 体調メモ</div>' +
      '<div class="cd-row"><label>日付 <input type="date" class="pp-cdday" value="' + esc(day) + '"></label></div><div class="pp-cdform">' + condFormHtml(day, mdLabel(day) + 'の体調') + '</div>' +
      (list.length ? '<div class="pp-sh">記録した体調（大会の記録といっしょに）</div><ul class="pp-cdlist">' + list.map(function (x) { var rs = resultsOn(o, x.d);
        return '<li><b>' + esc(mdLabel(x.d)) + '</b> ' + condBadge(x.c) + (rs.length ? '<small class="pp-cdres">🏃 ' + esc(rs.join('　')) + '</small>' : '') + '</li>'; }).join('') + '</ul><button type="button" class="pv-forget pp-cdall">🗑 体調メモを全部削除</button>' : '') + '</div>';
  }
  function bindAll(o, box, opts) {
    var again = function () { var y = window.scrollY; render(o, box, opts); window.scrollTo(0, y); };
    box.querySelectorAll('[data-ppev]').forEach(function (b) { b.addEventListener('click', function () { VIEW.ev = b.getAttribute('data-ppev'); again(); }); });
    box.querySelectorAll('[data-ppofficial]').forEach(function (c) { c.addEventListener('change', function () { VIEW.official = c.checked; again(); }); });
    box.querySelectorAll('[data-ppnm]').forEach(function (c) { c.addEventListener('change', function () { VIEW.nm = c.checked; again(); }); });
    var di = box.querySelector('.pp-cdday');
    if (di) di.addEventListener('change', function () { if (!validDay(di.value)) return; opts.condDay = di.value; again(); });
    bindCond(box.querySelector('.pp-cdform'), again);
    var all = box.querySelector('.pp-cdall');
    if (all) all.addEventListener('click', function () { if (!confirm('このスマホに保存した体調メモを全部削除しますか？元に戻せません。')) return; cDelAll(); again(); });
  }
  return { esc: esc, spark: spark, sanitize: sanitize, render: render, cLoad: cLoad, cGet: cGet, cSet: cSet, cDel: cDel, cDelAll: cDelAll, cList: cList, condFormHtml: condFormHtml, bindCond: bindCond, condBadge: condBadge,
    dayKey: dayKey, ymd: ymd, mdLabel: mdLabel, snapLabel: snapLabel, resultsOn: resultsOn, VIEW: VIEW, CKEY: CKEY, PRIV: PRIV, MAX_P: MAX_P, MAX_R: MAX_R, MAX_X: MAX_X, MAX_EV: MAX_EV };
})();
if (typeof module !== 'undefined') module.exports = LanePersonal;
