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
    var cT = settings.callTrack || [30, 20], cF = settings.callField || [40, 30];
    var T = allTeams(sl), sel = new Set(teams);
    var rows = [];
    function ttInfo(title, round, heat, typ) {
      if (!ttSegs || !ttSegs.length) return { start: '', note: 'タイムテーブル未読込', none: true };
      var segs = P.matchSegs(title, round, ttSegs);
      if (!segs.length) return { start: '', note: 'タイムテーブルに該当なし（要確認）', none: true };
      var t = P.timeFor(segs, typeof heat === 'number' ? heat : null);
      return { start: t.time || '', note: (typ === 'field' && !t.ambiguous && t.time) ? '' : t.note, ambiguous: t.ambiguous };
    }
    function timeInfo(title, round, heat, typ, own) {
      var tt = ttInfo(title, round, heat, typ);
      if (own) {
        var pg = { start: own, note: (round ? round + '・' : '') + 'プログラム記載の時刻' + (typ !== 'field' && heat > 1 ? '（' + heat + '組目は前の組の後）' : '') };
        if (!tt.none && tt.start && tt.start !== own) {
          var useTT = settings.timeSource === 'timetable';
          var r = useTT ? { start: tt.start, note: tt.note } : pg;
          r.note = (r.note ? r.note + '／' : '') + '⚠ プログラム ' + own + ' とタイムテーブル ' + tt.start + ' が違う（' + (useTT ? 'タイムテーブル' : 'プログラム') + 'を採用）';
          r.conflict = true; return r;
        }
        return pg;
      }
      return tt;
    }
    function addCall(r) {
      var s = toMin(r.start);
      var c = r.typ === 'field' ? cF : (r.typ === 'relay' && settings.callRelay) ? settings.callRelay : ((r.typ === 'long' || r.typ === 'dist') && settings.callDist) ? settings.callDist : cT;
      r.callRule = c;
      r.callStart = s == null ? '' : fmt(s - c[0]); r.callEnd = s == null ? '' : fmt(s - c[1]);
      r.call = s == null ? '' : r.callStart + '〜' + r.callEnd;
      r.startMin = s;
    }
    sl.entries.forEach(function (e) {
      var team = nk(e.team).trim(); if (!sel.has(team)) return;
      var typ = evType(e.event, e.posKind, settings);
      var heat = typ === 'field' ? (e.heat != null ? e.heat : '-') : (e.heat == null ? 1 : e.heat);
      var ti = timeInfo(e.event, e.round, heat, typ, e.time);
      var r = { team: team, event: e.event, round: e.round, heat: heat, pos: e.pos, posLabel: POS_LABEL[typ], typ: typ,
        bib: e.bib, name: e.name, kana: e.kana || '', grade: e.grade, start: ti.start, note: ti.note, page: e.page, conflict: !!ti.conflict, date: e.date || '' };
      addCall(r); rows.push(r);
    });
    sl.relays.forEach(function (rl) {
      var base = relayBase(rl.team, T.indiv); if (!sel.has(base)) return;
      var ti = timeInfo(rl.event, rl.round, rl.heat, 'relay', rl.time);
      var r = { team: base, event: rl.event, round: rl.round, heat: rl.heat, pos: rl.pos, posLabel: 'レーン', typ: 'relay',
        bib: rl.members.map(function (m) { return m.bib; }).join('/'), name: nk(rl.team).trim(), relayTeam: nk(rl.team).trim(),
        members: rl.members, grade: '', start: ti.start, note: ti.note, page: rl.page, conflict: !!ti.conflict, date: rl.date || '' };
      addCall(r);
      if (settings.relayOrderMin && r.startMin != null) {
        var base = settings.relayOrderBase === '招集開始' ? r.startMin - r.callRule[0] : settings.relayOrderBase === '競技開始' ? r.startMin : r.startMin - r.callRule[1];
        r.orderDeadline = fmt(base - settings.relayOrderMin);
        r.note = (r.note ? r.note + '／' : '') + 'オーダー用紙提出 ' + r.orderDeadline + 'まで';
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
  return { UNKNOWN: UNKNOWN, fees: fees, feeCat: feeCat, CATS: CATS, build: build, byAthlete: byAthlete, byTime: byTime, cards: cards, findTeams: findTeams, allTeams: allTeams, fmt: fmt, toMin: toMin };
})();
if (typeof module !== 'undefined') module.exports = MeetLogic;
