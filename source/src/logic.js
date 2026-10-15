/* ===== 出場一覧・ナンバーカード集計 ===== */
var MeetLogic = (function () {
  'use strict';
  var P = (typeof MeetParser !== 'undefined') ? MeetParser : require('./parser.js');
  var nk = P.nk;
  var FIELD_RE = /跳|投|ジャベリック/;
  var relayNames = null;
  function relayBase(team, indivTeams) {
    var t = nk(team).trim(), b = t.replace(/\s*[A-Z]$/, '');
    if (b !== t && (indivTeams.has(b) || /\s[A-Z]$/.test(t) || (relayNames && relayNames.has(b)))) return b;
    if (b !== t && /(中|高|大)$/.test(b)) return b;
    return t;
  }
  function allTeams(sl) {
    var indiv = new Set(sl.entries.map(function (e) { return nk(e.team).trim(); }).filter(Boolean));
    relayNames = new Set(sl.relays.map(function (r) { return nk(r.team).trim(); }));
    var all = new Set(indiv);
    sl.relays.forEach(function (r) { all.add(relayBase(r.team, indiv)); });
    return { indiv: indiv, all: Array.from(all) };
  }
  function findTeams(sl, query) {
    var q = nk(query || '').replace(/\s+/g, '');
    if (!q) return [];
    var T = allTeams(sl);
    return T.all.filter(function (t) { return t.replace(/\s+/g, '').indexOf(q) >= 0; }).sort();
  }
  function toMin(t) { if (!t) return null; var m = t.match(/(\d+):(\d+)/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fmt(m) { if (m == null) return ''; m = ((m % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  function evType(title, posKind, settings) {
    if (/×|リレー/.test(title)) return 'relay';
    var p = P.parseTitle(title);
    if (posKind === '試技順' || FIELD_RE.test(p.disc)) return 'field';
    if (posKind === 'ORD') {
      var m = p.disc.match(/^(\d+)m/); var d = m ? +m[1] : 0;
      return d >= (settings.ordThreshold || 3000) ? 'long' : 'dist';
    }
    return 'track';
  }
  var POS_LABEL = { track: 'レーン', dist: 'ORD', long: 'ORD', field: '試技順', relay: 'レーン' };
  function build(sl, ttSegs, teams, settings) {
    settings = settings || {};
    var cT = settings.callTrack || null, cF = settings.callField || null;   // v0.26.37 読めなかったら null（仮の値で計算しない）
    var T = allTeams(sl), sel = new Set(teams);
    var rows = [];
    function ttInfo(title, round, heat, typ, date) {
      if (!ttSegs || !ttSegs.length) return { start: '', note: 'タイムテーブル未読込', none: true };
      var segs = P.matchSegs(title, round, ttSegs, date);
      if (!segs.length) {
        // 種目はあるがラウンドが違う（決勝なのに予選の時刻しか無い）→ 流用せず「時刻未確定」
        var other = round ? P.matchSegs(title, '', ttSegs, date).filter(function (s) { return s.round && P.roundKind(s.round) !== P.roundKind(round); }) : [];
        if (other.length) return { start: '', note: '時刻未確定（タイムテーブルに「' + round + '」の時刻が無い。記載：' + other.map(function (s) { return s.time + ' ' + s.round; }).join('／') + '）', none: true };
        return { start: '', note: 'タイムテーブルに該当なし（要確認）', none: true };
      }
      var t = P.timeFor(segs, typeof heat === 'number' ? heat : null);
      return { start: t.time || '', note: (typ === 'field' && !t.ambiguous && t.time) ? '' : t.note, ambiguous: t.ambiguous, seg: t.time ? t.seg : null, block: t.block, firstTime: t.firstTime, firstSeg: t.block ? t.firstSeg : (t.time ? t.seg : null) };
    }
    function timeInfo(title, round, heat, typ, own, date, ownNote) {
      var tt = ttInfo(title, round, heat, typ, date);
      if (!own && ownNote) return tt.start ? tt : { start: '', note: ownNote + (ttSegs && ttSegs.length && !/未読込/.test(tt.note) ? '／' + tt.note : '') };
      if (own) {
        // 組ごとの「n組目は〜」は書かない（同じ種目の行がすべて同じ備考になり、表と確認タブが短くなる）
        var pg = { start: own, note: (round ? round + '・' : '') + 'プログラム記載の時刻' + (typ !== 'field' && heat > 1 ? '（2組目以降は前の組の後）' : '') };
        if (!tt.none && tt.start === own) { pg.seg = tt.seg; pg.firstSeg = tt.firstSeg; return pg; }
        // プログラムの時刻＝種目の開始時刻（1組目を含むまとまりの時刻）で、タイムテーブルにはこの組のまとまりの時刻がある
        // → 食い違いではなく、タイムテーブルの方が詳しい（例：プログラム 11:15、タイムテーブル 7〜12組 11:30）
        if (!tt.none && tt.start && tt.block && tt.firstTime === own) return { start: tt.start, note: (round ? round + '・' : '') + tt.note + '（タイムテーブル）', seg: tt.seg, firstSeg: tt.firstSeg };
        if (!tt.none && tt.start && tt.start !== own) {
          var useTT = settings.timeSource === 'timetable';
          var r = useTT ? { start: tt.start, note: tt.note, seg: tt.seg } : pg;
          r.note = (r.note ? r.note + '／' : '') + '⚠ プログラム ' + own + '／タイムテーブル ' + tt.start + '（' + (useTT ? 'タイムテーブル' : 'プログラム') + 'を採用）';
          r.conflict = true; return r;
        }
        return pg;
      }
      return tt;
    }
    // タイムテーブルにこの種目（ラウンド）があるか（日付の書かれていないスタートリストで、何日目の種目かを決めるのに使う）
    function hit(title, round, date) { return !!(ttSegs && ttSegs.length && P.matchSegs(title, round, ttSegs, date).length); }
    function addCall(r, seg) {
      var s = toMin(r.start);
      // タイムテーブルに招集開始・完了の列があり、その行の時刻を競技開始に使っている → 列の時刻をそのまま使う（「〇分前」のルールより優先）
      if (seg && seg.callStart && seg.callEnd && seg.time === r.start && settings.ttCall !== false) {
        r.callRule = [s - toMin(seg.callStart), s - toMin(seg.callEnd)]; r.callSrc = 'tt';
        r.callStart = seg.callStart; r.callEnd = seg.callEnd; r.call = r.callStart + '〜' + r.callEnd; r.startMin = s; return;
      }
      r.callSrc = s == null ? '' : 'rule';
      var c = r.typ === 'field' ? cF : (r.typ === 'relay' && settings.callRelay) ? settings.callRelay : ((r.typ === 'long' || r.typ === 'dist') && settings.callDist) ? settings.callDist : cT;
      r.callRule = c || null;
      if (!c) { r.callSrc = s == null ? '' : 'none'; r.callNG = s != null; r.callStart = ''; r.callEnd = ''; r.call = ''; r.startMin = s; return; }   // v0.26.37 招集時刻は空のまま（⚠ を出す）
      r.callStart = s == null ? '' : fmt(s - c[0]); r.callEnd = s == null ? '' : fmt(s - c[1]);
      r.call = s == null ? '' : r.callStart + '〜' + r.callEnd;
      r.startMin = s;
    }
    sl.entries.forEach(function (e) {
      var team = nk(e.team).trim(); if (!sel.has(team)) return;
      var typ = evType(e.event, e.posKind, settings);
      var heat = typ === 'field' ? (e.heat != null ? e.heat : '-') : (e.heat == null ? '' : e.heat);   // v0.26.37 組が読めなければ空（⚠）。「1組」にしない
      var ti = timeInfo(e.event, e.round, heat === '' ? null : heat, typ, e.time, e.date, e.timeNote);
      var r = { team: team, event: e.event, round: e.round, heat: heat, pos: e.pos, posLabel: POS_LABEL[typ], typ: typ, ttHit: hit(e.event, e.round, e.date),
        bib: e.bib, name: e.name, kana: e.kana || '', grade: e.grade, start: ti.start, note: ti.note, page: e.page, conflict: !!ti.conflict, date: e.date || '' };
      if (typ !== 'field' && e.heat == null) r.heatNG = true;
      addCall(r, ti.seg); rows.push(r);
    });
    sl.relays.forEach(function (rl) {
      var base = relayBase(rl.team, T.indiv); if (!sel.has(base)) return;
      var ti = timeInfo(rl.event, rl.round, rl.heat, 'relay', rl.time, rl.date, rl.timeNote);
      var r = { team: base, event: rl.event, round: rl.round, heat: rl.heat, pos: rl.pos, posLabel: 'レーン', typ: 'relay', ttHit: hit(rl.event, rl.round, rl.date),
        bib: rl.members.map(function (m) { return m.bib; }).join('/'), name: nk(rl.team).trim(), relayTeam: nk(rl.team).trim(),
        members: rl.members, grade: '', start: ti.start, note: ti.note, page: rl.page, conflict: !!ti.conflict, date: rl.date || '' };
      if (rl.heat == null) { r.heat = ''; r.heatNG = true; }
      addCall(r, ti.seg);
      if (settings.relayOrderMin && r.startMin != null) {
        var bm = r.startMin, bc = r.callRule, fs = ti.firstSeg;
        // 「最初の組の招集完了時刻の60分前」：組のまとまりごとに時刻が違うときは、1組目のまとまりの時刻で計算する
        if (settings.relayOrderFirst && fs && fs !== ti.seg && fs.time) {
          bm = toMin(fs.time);
          bc = fs.callStart && fs.callEnd && settings.ttCall !== false ? [bm - toMin(fs.callStart), bm - toMin(fs.callEnd)] : r.callRule;
        }
        if (!bc && settings.relayOrderBase !== '競技開始') { r.note = (r.note ? r.note + '／' : '') + '⚠ オーダー用紙提出の時刻は、招集時刻を読めなかったため出せません'; }
        else {
        var base = settings.relayOrderBase === '招集開始' ? bm - bc[0] : settings.relayOrderBase === '競技開始' ? bm : bm - bc[1];
        r.orderDeadline = fmt(base - settings.relayOrderMin);
        r.note = (r.note ? r.note + '／' : '') + 'オーダー用紙提出 ' + r.orderDeadline + 'まで'; }
      }
      rows.push(r);
    });
    return rows;
  }
  function byAthlete(rows) {
    return rows.slice().sort(function (a, b) {
      return a.team.localeCompare(b.team, 'ja') || (a.typ === 'relay') - (b.typ === 'relay') ||
        (parseInt(a.bib, 10) || 0) - (parseInt(b.bib, 10) || 0) || (a.startMin || 0) - (b.startMin || 0);
    });
  }
  var CATS = ['小学', '中学', '高校', '一般'];
  var UNKNOWN = '区分未確定';
  function feeCat(r, teamCat) {
    if (teamCat) return teamCat;
    if (r.typ === 'relay') return P.catOf(r.event) || P.catOf((r.members || []).map(function (m) { return m.grade; }).join(' ')) || UNKNOWN;
    return P.catOf(r.grade) || P.catOf(r.event) || UNKNOWN;
  }
  // prices: {cat:{ind,relay}}, opts: {teamCat:{team:cat}}
  function fees(rows, teams, prices, opts) {
    opts = opts || {};
    return teams.map(function (t) {
      var R = rows.filter(function (r) { return r.team === t; }), by = {}, total = 0, missing = [], seen = {};
      var tc = (opts.teamCat || {})[t] || '';
      R.forEach(function (r) {
        // 予選・決勝など複数ラウンドに載っていても、参加料は1種目1回
        var key = r.typ === 'relay' ? 'R|' + r.relayTeam + '|' + r.event : 'I|' + r.bib + '|' + r.event;
        if (seen[key]) return; seen[key] = 1;
        var c = feeCat(r, tc), b = by[c] = by[c] || { ind: 0, relay: 0 }; if (r.typ === 'relay') b.relay++; else b.ind++;
      });
      var order = CATS.concat([UNKNOWN]);
      var lines = order.concat(Object.keys(by).filter(function (c) { return order.indexOf(c) < 0; })).filter(function (c) { return by[c]; }).map(function (c) {
        var p = prices[c] || {}, b = by[c];
        var iP = p.ind, rP = p.relay;
        if (b.ind && iP == null) missing.push(c + '個人'); if (b.relay && rP == null) missing.push(c + 'リレー');
        var sub = b.ind * (iP || 0) + b.relay * (rP || 0); total += sub;
        return { cat: c, ind: b.ind, indPrice: iP, relay: b.relay, relayPrice: rP, sub: sub };
      });
      return { team: t, lines: lines, total: total, missing: missing, complete: !missing.length };
    });
  }
  function byTime(rows) {
    return rows.slice().sort(function (a, b) {
      var sa = a.startMin == null ? 9999 : a.startMin, sb = b.startMin == null ? 9999 : b.startMin;
      return sa - sb || a.event.localeCompare(b.event, 'ja') || (a.heat === '-' ? 0 : a.heat) - (b.heat === '-' ? 0 : b.heat) || a.pos - b.pos;
    });
  }
  function cards(rows, team, settings) {
    settings = settings || {};
    var R = rows.filter(function (r) { return r.team === team; });
    var bibs = new Set();
    R.forEach(function (r) {
      if (r.typ === 'relay') r.members.forEach(function (m) { bibs.add(m.bib); }); else bibs.add(String(r.bib));
    });
    var num = function (a, b) { return (parseInt(a, 10) - parseInt(b, 10)) || String(a).localeCompare(String(b)); };
    var koshi = {}, koshiList = [];
    R.forEach(function (r) {
      if (r.typ === 'track' || r.typ === 'dist' || (r.typ === 'relay' && settings.relayKoshi !== false)) { koshi[r.pos] = (koshi[r.pos] || 0) + 1; koshiList.push(r.pos); }
    });
    koshiList.sort(function (a, b) { return a - b; });
    var ord = R.filter(function (r) { return r.typ === 'long'; }).map(function (r) { return r.pos; }).sort(function (a, b) { return a - b; });
    return { team: team, bibs: Array.from(bibs).sort(num), koshi: koshi, koshiList: koshiList, ord: ord };
  }

  /* v0.16：通過したら出るラウンド（準々決勝・準決勝・決勝）。スタートリストにはふつう最初のラウンドしか載らないので、
     タイムテーブルにある「後のラウンド」を、自校の選手が出る種目ごとに「通過したら」の行として作る（名前はカッコ付きで表示）。
     そのラウンドのスタートリストがすでに読み込まれていれば（誰か1人でも載っていれば）作らない＝本物の行に置き換わる */
  var RORD = { h: 0, qf: 1, sf: 2, f: 3 }, RLABEL = { qf: '準々決勝', sf: '準決勝', f: '決勝' };
  function tentative(rows, ttSegs, sl, settings) {
    settings = settings || {};
    if (!ttSegs || !ttSegs.length || !rows || !rows.length) return [];
    var cT = settings.callTrack || null, cF = settings.callField || null;   // v0.26.37 読めなかったら null（仮の値で計算しない）
    var loaded = {}, maxLoaded = {};   // 種目|ラウンド種別 → スタートリストに載っている／種目 → 載っているいちばん後のラウンド
    if (sl) (sl.entries || []).concat(sl.relays || []).forEach(function (e) { var k = P.roundKind(e.round); if (k) { loaded[nk(e.event) + '|' + k] = 1; var ev = nk(e.event); maxLoaded[ev] = Math.max(maxLoaded[ev] == null ? -1 : maxLoaded[ev], RORD[k]); } });
    var groups = {}, order = [];
    rows.forEach(function (r) {
      if (r.tent) return;
      var who = r.typ === 'relay' ? 'R|' + r.team + '|' + nk(r.relayTeam) : 'I|' + r.team + '|' + (nk(r.bib) || '名:' + nk(r.name));
      var k = who + '|' + nk(r.event);
      if (!groups[k]) { groups[k] = { r: r, cur: -1, rounds: [] }; order.push(k); }
      var rk = P.roundKind(r.round), o = rk ? RORD[rk] : -1;
      if (o > groups[k].cur) { groups[k].cur = o; groups[k].r = r; }
    });
    var out = [];
    order.forEach(function (k) {
      var g = groups[k], r = g.r;
      var segs = P.matchSegs(r.event, '', ttSegs, r.date || '').filter(function (s) { return s.time && P.roundKind(s.round); });
      if (!segs.length) return;
      var cur = g.cur;
      // ラウンドが書かれていないスタートリスト：タイムテーブルでいちばん早いラウンドに出ているとみなす
      if (cur < 0) cur = Math.min.apply(null, segs.map(function (s) { return RORD[P.roundKind(s.round)]; }));
      // 後のラウンドのスタートリストが出ていて、この子が載っていない → 通過しなかったので作らない
      if (maxLoaded[nk(r.event)] != null && cur < maxLoaded[nk(r.event)]) return;
      var byKind = {};
      segs.forEach(function (s) { var kk = P.roundKind(s.round); if (RORD[kk] > cur) (byKind[kk] = byKind[kk] || []).push(s); });
      var prevLabel = r.round || '前のラウンド';
      ['qf', 'sf', 'f'].forEach(function (kk) {
        var L = byKind[kk]; if (!L) return;
        if (loaded[nk(r.event) + '|' + kk]) return;
        L.sort(function (a, b) { return (toMin(a.time) || 0) - (toMin(b.time) || 0); });
        var s = L[0], times = L.map(function (x) { return x.time; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
        var t = { tent: true, team: r.team, event: r.event, round: RLABEL[kk], heat: '', pos: '', posLabel: '', typ: r.typ, ttHit: true,
          bib: r.bib, name: r.name, kana: r.kana || '', grade: r.grade || '', relayTeam: r.relayTeam, members: r.members, page: r.page,
          start: s.time, date: s.date || r.date || '', conflict: false,
          note: '通過したら（' + prevLabel + 'の結果しだい）' + (times.length > 1 ? '／タイムテーブルに複数の時刻：' + times.join('・') : '') };
        var st = toMin(s.time);
        if (s.callStart && s.callEnd && settings.ttCall !== false) { t.callStart = s.callStart; t.callEnd = s.callEnd; t.callSrc = 'tt'; }
        else { var c = r.typ === 'field' ? cF : (r.typ === 'relay' && settings.callRelay) ? settings.callRelay : ((r.typ === 'long' || r.typ === 'dist') && settings.callDist) ? settings.callDist : cT;
          if (c) { t.callStart = fmt(st - c[0]); t.callEnd = fmt(st - c[1]); t.callSrc = 'rule'; } else { t.callStart = ''; t.callEnd = ''; t.callSrc = 'none'; t.callNG = true; } }
        t.call = t.callStart ? t.callStart + '〜' + t.callEnd : ''; t.startMin = st;
        out.push(t);
        prevLabel = RLABEL[kk];
      });
    });
    return out;
  }
  function tentName(r) { return '（' + (r.typ === 'relay' ? r.relayTeam : r.name) + '）'; }
  // v0.26.37 読めなかった印（一覧・印刷・共有で同じ文言）
  var CALL_NG = '⚠ 招集時刻を読めませんでした', HEAT_NG = '⚠組?';
  function callText(r) { return r.call || (r.callNG ? CALL_NG : ''); }
  function heatText(r) { return r.heatNG ? HEAT_NG : (r.heat == null ? '' : r.heat); }
  return { CALL_NG: CALL_NG, HEAT_NG: HEAT_NG, callText: callText, heatText: heatText, tentative: tentative, tentName: tentName, UNKNOWN: UNKNOWN, fees: fees, feeCat: feeCat, CATS: CATS, build: build, byAthlete: byAthlete, byTime: byTime, cards: cards, findTeams: findTeams, allTeams: allTeams, fmt: fmt, toMin: toMin };
})();
if (typeof module !== 'undefined') module.exports = MeetLogic;
