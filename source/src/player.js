/* ===== 選手用ページ（v0.11）：1人分だけの出場情報を作る・自分の予定とまぜて時間順に並べる ===== */
var PlayerLogic = (function () {
  'use strict';
  function nk(s) { return String(s == null ? '' : s).normalize('NFKC').trim(); }
  function toMin(t) { var m = /(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  // 個人種目の選手は「学校＋ナンバー（無ければ氏名）」で1人とみなす
  function keyOf(team, bib, name) { return nk(team) + '|' + (nk(bib) || '名:' + nk(name)); }
  /* 出場一覧（MeetLogic.build の行）から、選手の一覧を作る。リレーだけの選手もメンバー表から拾う */
  function athletes(rows) {
    var by = {}, out = [];
    function add(team, bib, name, grade, kana) {
      var k = keyOf(team, bib, name); if (!nk(name) && !nk(bib)) return;
      if (!by[k]) { by[k] = { key: k, team: nk(team), bib: nk(bib), name: nk(name), grade: nk(grade), kana: nk(kana) }; out.push(by[k]); }
      else { if (!by[k].name && name) by[k].name = nk(name); if (!by[k].grade && grade) by[k].grade = nk(grade); }
    }
    rows.forEach(function (r) {
      if (r.typ === 'relay') (r.members || []).forEach(function (m) { add(r.team, m.bib, m.name, m.grade, ''); });
      else add(r.team, r.bib, r.name, r.grade, r.kana);
    });
    var num = function (v) { var n = parseInt(v, 10); return isNaN(n) ? 1e9 : n; };
    return out.sort(function (a, b) { return a.team.localeCompare(b.team, 'ja') || num(a.bib) - num(b.bib) || a.name.localeCompare(b.name, 'ja'); });
  }
  function mine(r, a) {
    if (r.typ === 'relay') return (r.members || []).some(function (m) { return keyOf(r.team, m.bib, m.name) === a.key; });
    return keyOf(r.team, r.bib, r.name) === a.key;
  }
  /* 1人分の中身。ほかの選手の名前・ナンバー（リレーの仲間も）は入れない。
     meta: {n:大会名, d:日付, pl:会場, cp:招集場所} */
  function payloadFor(rows, a, meta) {
    meta = meta || {};
    var e = rows.filter(function (r) { return mine(r, a); }).map(function (r) {
      return [r.start || '', r.callNG ? '!' : r.callStart || '', r.callEnd || '', nk(r.event), nk(r.round), r.heatNG ? '?' : r.heat == null || r.heat === '-' ? '' : String(r.heat),   // v0.26.37 '!'＝招集時刻を読めなかった・'?'＝組を読めなかった
        r.tent ? '' : (r.posLabel || ''), r.tent || r.pos == null ? '' : String(r.pos), r.typ === 'relay' ? 1 : 0, r.typ === 'relay' ? nk(r.relayTeam) : '', r.tent ? 1 : 0];
    }).sort(function (x, y) { var p = toMin(x[0]), q = toMin(y[0]); return (p == null ? 9999 : p) - (q == null ? 9999 : q); });
    return { v: 1, k: 'p', n: nk(meta.n), d: nk(meta.d), pl: nk(meta.pl), cp: nk(meta.cp), g: meta.g || new Date().toISOString(),
      a: { name: a.name, grade: a.grade, team: a.team, bib: a.bib }, e: e };
  }
  var EK = ['start', 'callStart', 'callEnd', 'event', 'round', 'heat', 'posLabel', 'pos', 'relay', 'relayTeam', 'tent'];   // tent（v0.16）：通過したら出るラウンド
  function entryObj(x) { var o = {}; EK.forEach(function (k, i) { o[k] = x && x[i] != null ? x[i] : ''; }); o.relay = !!o.relay; o.tent = !!o.tent; return o; }
  /* 自動の予定（招集・レース）。消せない */
  function autoItems(p) {
    var out = [];
    (p.e || []).forEach(function (x, i) {
      var e = entryObj(x), where = [e.heat === '?' ? '⚠組?' : e.heat ? e.heat + '組' : '', e.pos ? (e.posLabel === 'レーン' ? e.pos + 'レーン' : (e.posLabel || '') + ' ' + e.pos) : ''].filter(Boolean).join('・');
      var ev = e.event + (e.round ? ' ' + e.round : ''), tk = e.tent ? tentKey(e) : '';
      if (e.callStart === '!') out.push({ id: 'c' + i, auto: true, kind: 'call', t: e.start, t2: '', label: '⚠ 招集時刻を読めませんでした（' + ev + '）', sub: '要項・注意事項で確かめてください', tent: tk, event: e.event });
      else if (e.callStart || e.callEnd) out.push({ id: 'c' + i, auto: true, kind: 'call', t: e.callStart || e.callEnd, t2: e.callStart && e.callEnd ? e.callEnd : '',
        label: '招集（' + ev + '）', sub: (p.cp ? '場所：' + p.cp : ''), tent: tk, event: e.event });
      out.push({ id: 'r' + i, auto: true, kind: 'race', t: e.start, label: (e.relay ? 'リレー ' : '') + ev, sub: e.tent ? '組・レーンは前のラウンドのあとに決まります' : [where, e.relay && e.relayTeam ? e.relayTeam : ''].filter(Boolean).join('・'), tent: tk, event: e.event });
    });
    return out;
  }
  /* v0.16：通過したら出るラウンド。tr＝{ 'tentKey': 'ok'（通過！）| 'out'（敗退） }（このスマホにだけ保存）
     敗退にしたら、同じ種目のそのラウンドより後も出さない。まだ決まっていないものは「次は」に数えない */
  var RO = { '準々決勝': 1, '準決勝': 2, '決勝': 3 };
  function tentKey(e) { return nk(e.event) + '|' + nk(e.round); }
  function applyTent(items, tr) {
    tr = tr || {};
    var outAt = {};   // 種目 → 敗退にしたラウンドの順番（いちばん早いもの）
    Object.keys(tr).forEach(function (k) { if (tr[k] !== 'out') return; var p = k.split('|'), o = RO[p[1]] || 0; if (outAt[p[0]] == null || o < outAt[p[0]]) outAt[p[0]] = o; });
    return items.filter(function (x) {
      if (!x.tent) return true;
      var p = x.tent.split('|'), o = RO[p[1]] || 0;
      return !(outAt[p[0]] != null && o >= outAt[p[0]]);
    }).map(function (x) { if (!x.tent) return x; var y = Object.assign({}, x); y.confirmed = tr[x.tent] === 'ok'; return y; });
  }
  var RANK = { own: 0, call: 1, race: 2 };
  /* 自動の予定と自分の予定をまぜて時間順。時刻なしは最後。同じ時刻なら 自分→招集→レース */
  function merge(auto, own) {
    var all = auto.concat((own || []).map(function (o) { return { id: o.id, auto: false, kind: 'own', t: o.t || '', label: o.label || '', sub: '' }; }));
    return all.map(function (x, i) { return { x: x, i: i, m: toMin(x.t) }; }).sort(function (a, b) {
      var p = a.m == null ? 1e6 : a.m, q = b.m == null ? 1e6 : b.m; return p - q || RANK[a.x.kind] - RANK[b.x.kind] || a.i - b.i;
    }).map(function (o) { return o.x; });
  }
  /* つぎの予定（今の時刻より後で、いちばん早いもの）の番号。無ければ -1 */
  function nextIndex(items, nowMin) {
    for (var i = 0; i < items.length; i++) { if (items[i].tent && !items[i].confirmed) continue; var m = toMin(items[i].t); if (m != null && m >= nowMin) return i; }
    return -1;
  }
  var PRESETS = [['起床', -180], ['朝ごはん', -150], ['家を出る', -120], ['集合', -90], ['アップ開始', -60], ['昼ごはん', null], ['ストレッチ', -45], ['帰る', null]];
  return { applyTent: applyTent, tentKey: tentKey, athletes: athletes, payloadFor: payloadFor, autoItems: autoItems, merge: merge, nextIndex: nextIndex, entryObj: entryObj, toMin: toMin, keyOf: keyOf, PRESETS: PRESETS };
})();
if (typeof module !== 'undefined') module.exports = PlayerLogic;
