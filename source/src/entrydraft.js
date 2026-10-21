// v0.27.0（entrydraft.js）：エントリー下書き。JAAFのエントリーシステムへ手で打ち込むための「下書き」を作るだけ（自動入力・送信・JAAFとの接続はしない）
// 公認記録だけを「公認ベスト」に出す。公認が無ければ空欄（推測で埋めない）。ルール違反は警告だけで止めない
var LaneEntry = (function () {
  // 東京都高体連 第2・3支部 秋季大会の要項の既定値（画面で変えられる）
  var RULES = { maxEv: 2, relayTeams: 2, noMulti: true, combAlone: true, combPerSchool: 1, minLeg: 4, maxLeg: 6 };
  var FEES = { indiv: 700, relay: 1400, comb: 2000, prog: 700, copies: null };
  var NO_MARK = '公認記録なし（空欄でOK）';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isComb(label) { return /八種|七種|十種|五種|四種|混成/.test(String(label || '')); }
  function sexOf(label) { return /^女子/.test(label) ? 'f' : /^男子/.test(label) ? 'm' : ''; }
  function short(label) { return String(label || '').replace(/^(男子|女子)\s*/, '').replace(/^(中学|高校)\s*/, ''); }
  function sexName(s) { return s === 'f' ? '女子' : s === 'm' ? '男子' : ''; }
  function better(R, a, b, ev) {   // aがbより良い記録か（公認の記録どうしで比べる）
    var va = R.markValue(a.mark, ev), vb = R.markValue(b.mark, ev);
    if (!va || va.v == null) return false; if (!vb || vb.v == null) return true;
    return va.lower ? va.v < vb.v : va.v > vb.v;
  }
  // 記録帳から：選手ごとの種目と公認ベスト／リレー種目と公認ベスト
  function data(R, rows) {
    var cb = R.computeBests(rows || []), ath = {}, order = [], relays = {}, rorder = [], evs = {};
    (cb.bests || []).forEach(function (b) {
      var sx = sexOf(b.eventLabel) || (b.best || b.ref ? R.genderOf(b.best || b.ref) : '') || '';
      var one = { ev: b.event, label: short(b.eventLabel), full: b.eventLabel, sex: sx, best: b.best || null, comb: isComb(b.eventLabel) };
      if (R.isRelay(b.eventLabel)) {
        var x = relays[b.event] || (relays[b.event] = (rorder.push(b.event), { ev: b.event, label: one.label, full: b.eventLabel, sex: sx, best: null }));
        if (b.best && (!x.best || better(R, b.best, x.best, b.eventLabel))) x.best = b.best;
        return;
      }
      if (!evs[b.event]) evs[b.event] = { ev: b.event, label: one.label, full: b.eventLabel, sex: sx, comb: one.comb };
      var a = ath[b.key] || (ath[b.key] = (order.push(b.key), { key: b.key, name: b.name, kana: b.kana, grade: b.grade, team: b.team, sex: sx, events: [] }));
      if (!a.grade && b.grade) a.grade = b.grade; if (!a.sex) a.sex = sx;
      a.events.push(one);
    });
    return { athletes: order.map(function (k) { return ath[k]; }), byKey: ath, relays: rorder.map(function (k) { return relays[k]; }), relayBy: relays, events: Object.keys(evs).map(function (k) { return evs[k]; }), eventBy: evs };
  }
  function newPlan() { return { picks: {}, relays: {}, rules: Object.assign({}, RULES), fees: Object.assign({}, FEES) }; }
  function evInfo(d, ath, ev) {
    var mine = ath && ath.events.filter(function (e) { return e.ev === ev; })[0];
    if (mine) return mine;
    var g = d.eventBy[ev]; return g ? { ev: ev, label: g.label, full: g.full, sex: g.sex, best: null, comb: g.comb } : { ev: ev, label: short(ev.replace(/^[a-z]+:/, '')), full: ev, sex: '', best: null, comb: isComb(ev) };
  }
  // 表に出す行（個人→リレーの順）
  function lines(R, d, plan) {
    var out = [];
    Object.keys(plan.picks).forEach(function (k) {
      var a = d.byKey[k]; if (!a) return;
      (plan.picks[k] || []).forEach(function (ev) {
        var e = evInfo(d, a, ev);
        out.push({ kind: e.comb ? 'comb' : 'indiv', sex: a.sex || e.sex, name: a.name, grade: a.grade || '', label: e.label, best: e.best, mark: e.best ? R.showMark(e.best.mark, e.full) : '', meet: e.best ? e.best.meet : '', date: e.best ? e.best.date : '' });
      });
    });
    Object.keys(plan.relays).forEach(function (ev) {
      var x = d.relayBy[ev]; if (!x) return;
      (plan.relays[ev] || []).forEach(function (t) {
        var names = (t.members || []).filter(Boolean).map(function (k) { return d.byKey[k] ? d.byKey[k].name : ''; }).filter(Boolean);
        out.push({ kind: 'relay', sex: x.sex, name: t.label + 'チーム', members: names, grade: '', label: x.label, best: x.best, mark: x.best ? R.showMark(x.best.mark, x.full) : '', meet: x.best ? x.best.meet : '', date: x.best ? x.best.date : '' });
      });
    });
    var so = { m: 0, f: 1, '': 2 }, ko = { indiv: 0, comb: 1, relay: 2 };
    return out.sort(function (a, b) { return (so[a.sex] - so[b.sex]) || (ko[a.kind] - ko[b.kind]); });
  }
  // ルールの警告（止めない）
  function check(d, plan) {
    var r = plan.rules || RULES, w = [], combBy = {};
    Object.keys(plan.picks).forEach(function (k) {
      var a = d.byKey[k]; if (!a) return;
      var evs = (plan.picks[k] || []).map(function (ev) { return evInfo(d, a, ev); });
      var nc = evs.filter(function (e) { return e.comb; }), inRelay = Object.keys(plan.relays).some(function (ev) { return (plan.relays[ev] || []).some(function (t) { return (t.members || []).indexOf(k) >= 0; }); });
      if (r.maxEv && evs.length > r.maxEv) w.push({ code: 'maxEv', msg: a.name + '：個人種目が' + evs.length + '種目です（1人' + r.maxEv + '種目まで・リレー除く）' });
      if (r.combAlone && nc.length && (evs.length > nc.length || inRelay)) w.push({ code: 'combAlone', msg: a.name + '：混成（' + nc.map(function (e) { return e.label; }).join('・') + '）とほかの種目が重なっています（混成はほかの種目と重ねない）' });
      nc.forEach(function (e) { (combBy[e.ev] = combBy[e.ev] || { label: (sexName(a.sex) + e.label), n: 0 }).n++; });
    });
    Object.keys(combBy).forEach(function (ev) { if (r.combPerSchool && combBy[ev].n > r.combPerSchool) w.push({ code: 'combPerSchool', msg: combBy[ev].label + '：' + combBy[ev].n + '人です（混成は各校' + r.combPerSchool + '名まで）' }); });
    Object.keys(plan.relays).forEach(function (ev) {
      var x = d.relayBy[ev], ts = plan.relays[ev] || [], lb = x ? sexName(x.sex) + x.label : ev, seen = {};
      if (r.relayTeams && ts.length > r.relayTeams) w.push({ code: 'relayTeams', msg: lb + '：' + ts.length + 'チームです（リレーは1校' + r.relayTeams + 'チームまで）' });
      ts.forEach(function (t) {
        var m = (t.members || []).filter(Boolean);
        if (m.length < (r.minLeg || 4) || m.length > (r.maxLeg || 6)) w.push({ code: 'legs', msg: lb + ' ' + t.label + 'チーム：' + m.length + '人です（' + (r.minLeg || 4) + '〜' + (r.maxLeg || 6) + '人）' });
        m.forEach(function (k) {
          if (seen[k] && seen[k] !== t.label && r.noMulti) w.push({ code: 'noMulti', msg: lb + '：' + (d.byKey[k] ? d.byKey[k].name : '') + 'が' + seen[k] + 'と' + t.label + 'の両方に入っています（同じ人は複数チームに入れない）' });
          else if (seen[k] === t.label) w.push({ code: 'dup', msg: lb + ' ' + t.label + 'チーム：' + (d.byKey[k] ? d.byKey[k].name : '') + 'が二重です' });
          if (!seen[k]) seen[k] = t.label;
        });
      });
    });
    return w;
  }
  function fees(R, d, plan) {
    var f = plan.fees || FEES, L = lines(R, d, plan), n = { indiv: 0, comb: 0, relay: 0 }, sx = {};
    L.forEach(function (l) { n[l.kind]++; if (l.sex) sx[l.sex] = 1; });
    var copies = f.copies != null && f.copies !== '' ? +f.copies : Math.max(1, Object.keys(sx).length);
    var items = [
      { k: 'indiv', label: '個人種目', unit: +f.indiv || 0, n: n.indiv },
      { k: 'relay', label: 'リレー', unit: +f.relay || 0, n: n.relay },
      { k: 'comb', label: '混成', unit: +f.comb || 0, n: n.comb },
      { k: 'prog', label: 'プログラム', unit: +f.prog || 0, n: copies }
    ];
    items.forEach(function (i) { i.sum = i.unit * i.n; });
    return { items: items, copies: copies, total: items.reduce(function (s, i) { return s + i.sum; }, 0) };
  }
  function yen(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円'; }
  function sd(d) { var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '.' + m[2] + '.' + m[3] : (d || ''); }
  // 画面と印刷の表
  function table(L, cls) {
    return '<table class="' + (cls || 'en-t') + '"><thead><tr><th>選手</th><th>学年</th><th>種目</th><th class="lp-r">公認ベスト</th><th>記録の大会／日付</th></tr></thead><tbody>' +
      L.map(function (l) {
        return '<tr class="en-' + l.kind + '"><td>' + esc(sexName(l.sex)) + ' ' + esc(l.name) + (l.members ? '<div class="en-mem">' + esc(l.members.join('・') || '（メンバー未定）') + '</div>' : '') + '</td><td>' + (l.grade ? esc(l.grade) + '年' : '') + '</td><td>' + esc(l.label) + '</td>' +
          '<td class="lp-r en-mk">' + (l.best ? esc(l.mark) : '<span class="en-none">' + NO_MARK + '</span>') + '</td><td>' + (l.best ? esc(l.meet) + '<br><small>' + esc(sd(l.date)) + '</small>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function feeTable(F) {
    return '<table class="en-fee"><tbody>' + F.items.map(function (i) { return '<tr><td>' + esc(i.label) + '</td><td class="lp-r">' + yen(i.unit) + ' × ' + i.n + '</td><td class="lp-r">' + yen(i.sum) + '</td></tr>'; }).join('') +
      '<tr class="en-tot"><td>合計</td><td></td><td class="lp-r"><b>' + yen(F.total) + '</b></td></tr></tbody></table>';
  }
  function sheet(R, d, plan, o) {
    o = o || {};
    var L = lines(R, d, plan), W = check(d, plan), F = fees(R, d, plan), P = typeof LanePrint !== 'undefined' ? LanePrint : null;
    var body = '<p class="lp-note">JAAFのエントリーシステムへ手で入力するための下書きです。「公認ベスト」は公認の記録だけ。空欄は公認記録なし（空欄でOK）。</p>' +
      table(L, 'lp-t en-t') + (W.length ? '<div class="lp-h3"><span>⚠ 確認すること</span></div><ul class="en-warn">' + W.map(function (x) { return '<li>' + esc(x.msg) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="lp-h3"><span>参加料（めやす）</span></div>' + feeTable(F);
    if (!P) return body;
    return P.page('エントリー下書き', o, body, P.band('ENTRY', 'エントリー下書き', o.meet ? esc(o.meet) : '', o));
  }
  function text(R, d, plan, o) {
    o = o || {};
    var L = lines(R, d, plan), F = fees(R, d, plan), W = check(d, plan), s = ['【エントリー下書き】' + (o.meet ? ' ' + o.meet : '')];
    ['m', 'f', ''].forEach(function (sx) {
      var g = L.filter(function (l) { return l.sex === sx; }); if (!g.length) return;
      s.push('', '■' + (sexName(sx) || 'その他'));
      g.forEach(function (l) {
        s.push(l.label + '\t' + l.name + (l.grade ? '（' + l.grade + '年）' : '') + '\t' + (l.best ? l.mark + '\t' + l.meet + ' ' + sd(l.date) : NO_MARK) + (l.members ? '\n  メンバー：' + (l.members.join('・') || '未定') : ''));
      });
    });
    if (W.length) { s.push('', '■確認すること'); W.forEach(function (x) { s.push('・' + x.msg); }); }
    s.push('', '■参加料（めやす）'); F.items.forEach(function (i) { s.push(i.label + ' ' + yen(i.unit) + '×' + i.n + ' = ' + yen(i.sum)); }); s.push('合計 ' + yen(F.total));
    return s.join('\n');
  }
  /* v0.28.2 学年：並べ順と札。「中2」「高1」はそのまま、「1」「1年」だけのときは base（'jh' 中学・'hs' 高校・'' 不明）に合わせる。
     並べ順は 中1・中2・中3・高1・高2・高3・（区分なし）1・2・3・学年なし */
  function gradeBase(grades, div) {
    if (div === '中学' || div === 'jh') return 'jh'; if (div === '高校' || div === 'hs') return 'hs';
    var j = 0, h = 0; (grades || []).forEach(function (g) { g = String(g || '').normalize('NFKC'); if (/^中/.test(g)) j++; else if (/^高/.test(g)) h++; });
    return j && !h ? 'jh' : h && !j ? 'hs' : '';
  }
  function gradeInfo(g, base) {
    g = String(g || '').normalize('NFKC').trim(); var m = /^(中|高)?\s*(\d)/.exec(g); if (!m) return { k: 99, lbl: '学年なし', key: '' };
    var d = m[1] === '中' ? 'jh' : m[1] === '高' ? 'hs' : base, n = +m[2];
    return d === 'jh' ? { k: n, lbl: '中' + n + '年', key: 'jh' + n } : d === 'hs' ? { k: 10 + n, lbl: '高' + n + '年', key: 'hs' + n } : { k: 20 + n, lbl: n + '年', key: 'g' + n };
  }
  // 学年で並べる（同じ学年の中は元の順のまま）。dir：1 低→高・-1 高→低（学年なしは最後）
  function byGrade(list, get, base, dir) {
    dir = dir || 1; return list.map(function (x, i) { return { x: x, i: i, k: gradeInfo(get(x), base).k }; }).sort(function (a, b) { if (a.k === 99 || b.k === 99) return (a.k === 99) - (b.k === 99) || a.i - b.i; return (a.k - b.k) * dir || a.i - b.i; }).map(function (o) { return o.x; });
  }
  return { gradeBase: gradeBase, gradeInfo: gradeInfo, byGrade: byGrade, RULES: RULES, FEES: FEES, NO_MARK: NO_MARK, data: data, newPlan: newPlan, lines: lines, check: check, fees: fees, sheet: sheet, text: text, table: table, feeTable: feeTable, yen: yen, isComb: isComb, sexName: sexName, esc: esc };
})();
if (typeof module !== 'undefined') module.exports = LaneEntry;
