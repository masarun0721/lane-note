/* ===== v0.26.11 選手台帳（チームごとの選手ID・学年・卒業・所属の変更）
   ・選手ID（aid）は「A」＋10文字。記録に aid があれば、名前が変わっても・中学→高校でも同じ人としてまとめる
   ・名前だけで自動的に結びつけることはしない。同じ名前の記録は「候補」として出し、顧問が確かめてから入れる
   ・学年は「入学した年度」（entry）から計算する（4月はじまり）。記録に入っている学年・所属は、その時のまま残す */
var LaneRoster = (function () {
  'use strict';
  var AL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  function newAid(rand) {
    var s = 'A', r = rand || function () { var b = new Uint8Array(1); crypto.getRandomValues(b); return b[0] / 256; };
    while (s.length < 11) s += AL[Math.floor(r() * AL.length)];
    return s;
  }
  function validAid(a) { return typeof a === 'string' && /^A[A-Za-z0-9]{10}$/.test(a); }
  function schoolYear(d) { var t = d instanceof Date ? d : new Date(d == null ? Date.now() : d); var y = t.getFullYear(); return t.getMonth() < 3 ? y - 1 : y; }
  function maxGrade(e) { return e && e.div === 'univ' ? 4 : e && e.div === 'es' ? 6 : 3; }
  function gradeIn(e, y) { if (!e || !e.entry) return null; return y - e.entry + 1; }
  function entryFor(grade, y) { var g = parseInt(String(grade || '').replace(/[^0-9]/g, ''), 10); return g >= 1 && g <= 6 ? y - g + 1 : null; }
  function clean(e) {
    var o = { aid: e.aid, name: String(e.name || '').slice(0, 60), kana: String(e.kana || '').slice(0, 60), team: String(e.team || '').slice(0, 60), div: ['jh', 'hs', 'univ', 'es', ''].indexOf(e.div || '') >= 0 ? (e.div || '') : '', entry: e.entry ? +e.entry : null, status: ['active', 'graduated', 'left'].indexOf(e.status) >= 0 ? e.status : 'active', moves: (e.moves || []).slice(-20).map(function (m) { return { date: String(m.date || '').slice(0, 10), from: String(m.from || '').slice(0, 60), to: String(m.to || '').slice(0, 60), note: String(m.note || '').slice(0, 100) }; }) };
    if (e.gradYear) o.gradYear = +e.gradYear;
    return o;
  }
  // 年度の切りかえ：今年度の学年を計算し、最上級を過ぎた人は「卒業」の候補にする（実行は顧問が確かめてから apply）
  function rollover(list, y) {
    return (list || []).filter(function (e) { return e.status === 'active' && e.entry; }).map(function (e) {
      var g = gradeIn(e, y); return { aid: e.aid, name: e.name, grade: g, action: g > maxGrade(e) ? 'graduate' : 'stay' };
    });
  }
  function applyRollover(list, plan, y) {
    var grad = {}; plan.forEach(function (p) { if (p.action === 'graduate') grad[p.aid] = 1; });
    return list.map(function (e) { if (!grad[e.aid]) return e; var o = Object.assign({}, e, { status: 'graduated', gradYear: y - 1 }); return o; });
  }
  function move(e, to, date, note) {
    var o = Object.assign({}, e); o.moves = (e.moves || []).concat([{ date: date, from: e.team || '', to: to, note: note || '' }]); o.team = to; return o;
  }
  // 同じ名前（またはよみ）の、まだ台帳に入っていない記録。候補として出すだけ（自動では入れない）
  function candidates(recs, e, R) {
    var nk = function (s) { return R.nameKey(s || ''); }, want = {};
    if (e.name) want[nk(e.name)] = 1; if (e.kana) want[nk(e.kana)] = 1;
    var g = {};
    recs.forEach(function (r) {
      if (r.aid) return; if (!want[nk(r.name)] && !(r.kana && want[nk(r.kana)])) return;
      var k = R.athleteKey(r), x = g[k] = g[k] || { key: k, name: r.name || r.kana, teams: {}, n: 0, first: r.date, last: r.date };
      x.n++; if (r.team) x.teams[r.team] = 1; if (r.date < x.first) x.first = r.date; if (r.date > x.last) x.last = r.date;
    });
    return Object.keys(g).map(function (k) { var x = g[k]; x.teams = Object.keys(x.teams); return x; });
  }
  function link(recs, keys, aid, R) { var set = {}; keys.forEach(function (k) { set[k] = 1; }); return recs.filter(function (r) { return set[R.athleteKey(r)] && r.aid !== aid; }).map(function (r) { return Object.assign({}, r, { aid: aid }); }); }
  function split(recs, ids, aid) { var set = {}; ids.forEach(function (i) { set[i] = 1; }); return recs.filter(function (r) { return set[r.id]; }).map(function (r) { return Object.assign({}, r, { aid: aid }); }); }
  return { newAid: newAid, validAid: validAid, schoolYear: schoolYear, gradeIn: gradeIn, entryFor: entryFor, maxGrade: maxGrade, clean: clean, rollover: rollover, applyRollover: applyRollover, move: move, candidates: candidates, link: link, split: split };
})();
if (typeof module !== 'undefined') module.exports = LaneRoster;
