/* ===== v0.19 エントリー照合：エントリーファイル（Excel/CSV）とスタートリストを突き合わせる（端末の中だけで処理） ===== */
var EntryCheck = (function () {
  'use strict';
  var nk = function (s) { return String(s == null ? '' : s).normalize('NFKC'); };
  // 旧字・異体字 → よく使う字（名前の「表記ゆれ」として一致させる）
  var VAR = { '澤': '沢', '邊': '辺', '邉': '辺', '髙': '高', '﨑': '崎', '嵜': '崎', '碕': '崎', '濱': '浜', '濵': '浜', '齋': '斉', '齊': '斉', '斎': '斉', '國': '国', '廣': '広', '櫻': '桜', '眞': '真', '槇': '槙', '冨': '富', '德': '徳', '惠': '恵', '藏': '蔵', '龍': '竜', '瀨': '瀬', '彌': '弥', '壽': '寿', '曻': '昇', '祐': '祐', '塚': '塚', '晴': '晴', '淸': '清', '條': '条', '團': '団', '實': '実', '髮': '髪', '萬': '万', '與': '与', '傳': '伝', '應': '応', '戸': '戸', '戶': '戸', '舘': '館', '桒': '桑', '栁': '柳', '隆': '隆', '敎': '教', '靜': '静', '黑': '黒', '禮': '礼', '驒': '騨', '蘆': '芦', '鷗': '鴎', '那': '那', 'ヶ': 'ケ', 'ヵ': 'カ', 'ゑ': 'エ', 'ゐ': 'イ' };
  function strictName(s) { return nk(s).replace(/[\s\u3000・･.]/g, ''); }
  function looseName(s) {
    var t = strictName(s).replace(/[\u3041-\u3096]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
    return Array.from(t).map(function (c) { return VAR[c] || c; }).join('').replace(/[ー‐－-]/g, 'ー');
  }
  function cell(v) { return v == null ? '' : nk(v).replace(/\u3000/g, ' ').trim(); }

  /* ---- 種目の表記をそろえる：{ sex:'男'|'女'|'', lv:['中'], g:'1'|null, disc:'100m', relay:bool } ---- */
  function discOf(s) {
    s = nk(s).replace(/\(.*?\)|（.*?）/g, '').replace(/\s+/g, '').replace(/ｍ|M(?=$|[^a-z])/g, 'm');
    var r = s.match(/(\d)\s*[x×X*]\s*(\d+)/); if (r || /リレー|継走/.test(s)) return { disc: r ? r[1] + '×' + r[2] + 'm' : 'リレー', relay: true };
    var f = s.match(/走高跳|走幅跳|棒高跳|三段跳|砲丸投|円盤投|ハンマー投|やり投|ジャベリックスロー|ボール投|ジャベ|四種競技|三種競技|混成/);
    if (f) return { disc: f[0] === 'ジャベ' ? 'ジャベリックスロー' : f[0] };
    var d = s.match(/(\d{2,5}(?:\.\d+)?)\s*(km|m)?\s*(mH|H|SC|障害|W|競歩)?/i);
    if (d) { var dist = d[2] === 'km' ? String(+d[1] * 1000) : d[1], suf = (d[3] || '').replace(/^mH$/i, 'H').replace('障害', 'SC').replace('競歩', 'W'); return { disc: dist + 'm' + suf.toUpperCase() }; }
    return null;
  }
  function parseEvent(raw, sexHint) {
    var s = nk(raw).replace(/\s+/g, '');
    if (!s || /未エントリー/.test(s)) return null;
    if (/リレー要員|リレーメンバーのみ/.test(s)) return { reserve: true, raw: raw };
    var sex = /女/.test(s) ? '女' : /男/.test(s) ? '男' : (sexHint || '');
    var lv = [], g = null;
    if (/小/.test(s)) lv.push('小');
    if (/中/.test(s)) lv.push('中');
    if (/高/.test(s)) lv.push('高');
    if (/一般|成年|シニア/.test(s)) lv.push('一般');
    var gm = s.match(/(?:中学?|小学?|高校?)\s*([1-6])(?:年|_|$|[^\d])/) || s.match(/^([1-6])年/);
    if (gm && !/共/.test(s.slice(0, s.indexOf(gm[0]) + gm[0].length + 1))) g = gm[1];
    // 種目の部分：区分（中1_／男子中学1年 など）を取り除いてから読む
    var rest = s.replace(/^(?:男子|女子|男|女)?(?:小学生?|中学生?|高校生?|一般|高校|中|小|高)*(?:[1-6]年|[1-6](?=_)|共通|共)?/, '').replace(/^[_･・]+/, '').replace(/(?:男子|女子|男|女)/g, '');
    rest = rest.replace(/^(?:一般|高校|高)[_･・]*/, '');
    var d = discOf(rest) || discOf(s);
    if (!d) return null;
    return { sex: sex, lv: lv, g: g, disc: d.disc, relay: !!d.relay, raw: String(raw) };
  }
  function evLabel(e) { if (!e) return ''; if (e.reserve) return 'リレー要員'; return (e.sex ? e.sex + '子' : '') + (e.lv.length ? e.lv.map(function (l) { return { 小: '小学', 中: '中学', 高: '高校', 一般: '一般' }[l]; }).join('・') : '') + (e.lv.indexOf('中') >= 0 || e.lv.indexOf('小') >= 0 ? (e.g ? e.g + '年' : '共通') : '') + ' ' + e.disc; }
  // a=エントリー b=スタートリスト。性別・区分（重なり）・学年・種目が合えば同じ種目
  function sameEvent(a, b, grade) {
    if (!a || !b || a.disc !== b.disc) return false;
    if (a.sex && b.sex && a.sex !== b.sex) return false;
    if (a.lv.length && b.lv.length && !a.lv.some(function (l) { return b.lv.indexOf(l) >= 0; })) return false;
    if (a.g && b.g && a.g !== b.g) return false;
    if (!a.g && b.g && grade && gradeNum(grade) && gradeNum(grade) !== b.g) return false;
    if (a.g && !b.g && b.lv.indexOf('中') >= 0 && a.lv.indexOf('中') >= 0) return false;   // 中1_100 は 中学共通100m とは別
    return true;
  }
  function gradeNum(g) { var m = nk(g).match(/([1-6])/); return m ? m[1] : ''; }

  /* ---- エントリーファイル：見出しの行と列を探す ---- */
  var ROLES = [
    { k: 'name', label: '氏名', re: /^(氏名|選手名|競技者名|名前|選手氏名)$/ },
    { k: 'sei', label: '姓', re: /^(姓|氏|苗字|名字)$/ },
    { k: 'mei', label: '名', re: /^名$/ },
    { k: 'kana', label: 'フリガナ', re: /(フリガナ|ふりがな|カナ|よみ)/, multi: true },
    { k: 'grade', label: '学年', re: /^学年/ },
    { k: 'sex', label: '性別', re: /^(性別|男女)/ },
    { k: 'team', label: '所属', re: /^(所属|学校名|学校|チーム名|団体略称|所属名)/ },
    { k: 'event', label: '種目', re: /種目(?!数)/, multi: true },
    { k: 'relay', label: 'リレー', re: /リレー/ }
  ];
  function headerLabels(aoa, r) {
    var w = 0; for (var i = Math.max(0, r - 3); i <= r; i++) w = Math.max(w, (aoa[i] || []).length);
    var out = [];
    for (var c = 0; c < w; c++) {
      var parts = [];
      for (var i2 = Math.max(0, r - 3); i2 <= r; i2++) { var v = cell((aoa[i2] || [])[c]); if (v && parts.indexOf(v) < 0 && !/^\d+$/.test(v)) parts.push(v); }
      out.push({ own: cell((aoa[r] || [])[c]), all: parts.join('') });
    }
    return out;
  }
  function rowScore(row) {
    var hit = {};
    (row || []).forEach(function (v) { v = cell(v).replace(/\s/g, ''); if (!v || v.length > 14) return; ROLES.forEach(function (R) { if (R.re.test(v.replace(/[（(].*$/, ''))) hit[R.k] = 1; }); });
    var n = Object.keys(hit).length; if (!(hit.name || (hit.sei && hit.mei))) n -= 2; return n;
  }
  function detect(aoa) {
    var best = -1, bs = 2;
    for (var r = 0; r < Math.min(aoa.length, 40); r++) { var s = rowScore(aoa[r]); if (s > bs) { bs = s; best = r; } }
    if (best < 0) return { header: -1, cols: {}, score: 0 };
    var labs = headerLabels(aoa, best), cols = { event: [], kana: [] };
    function data(c) { var v = []; for (var r = best + 1; r < Math.min(aoa.length, best + 200); r++) { var x = cell((aoa[r] || [])[c]); if (x) v.push(x); } return v; }
    labs.forEach(function (L, c) {
      var own = L.own.replace(/\s/g, '').replace(/[（(].*$/, ''), all = L.all.replace(/\s/g, '');
      if (/英語|ローマ|英字/.test(L.all)) return;
      ROLES.forEach(function (R) {
        var t = R.k === 'event' || R.k === 'relay' ? all : own;
        if (!t || !R.re.test(t) || (R.k === 'event' && /リレー|記録|資格/.test(all) && !/^種目\d*$/.test(own || all))) return;
        if (R.k === 'mei' && /ﾌﾘｶﾞﾅ|フリガナ|英語/.test(all)) return;
        if (R.multi) cols[R.k].push(c); else if (R.k === 'relay') (cols._relay = cols._relay || []).push(c); else if (cols[R.k] == null) cols[R.k] = c;
      });
    });
    // リレーの列：見出しに「リレー」があり、中身が A・B・1 のような短い記号の列を選ぶ
    if (cols._relay) {
      var bestC = null, bestN = 0;
      cols._relay.forEach(function (c) { var n = data(c).filter(function (v) { return /^[A-Za-z1-9○〇◯]$/.test(v); }).length; if (n > bestN) { bestN = n; bestC = c; } });
      if (bestC != null) cols.relay = bestC; delete cols._relay;
    }
    cols.event = cols.event.filter(function (c) { var v = data(c); return !v.length || v.some(function (x) { return parseEvent(x, '男'); }); });
    return { header: best, cols: cols, labels: labs.map(function (l) { return l.all; }), score: bs };
  }
  // 「リスト」のシート：「中学生 1年100m 男子 or 女子 → 中1_100」の対応表
  function codeMap(aoa) {
    var m = {};
    (aoa || []).forEach(function (row) { for (var c = 0; c + 2 < row.length; c++) if (cell(row[c + 1]) === '→' && cell(row[c]) && cell(row[c + 2])) m[cell(row[c + 2])] = cell(row[c]); });
    return m;
  }
  function readEntries(aoa, det, map) {
    var C = det.cols, out = [], warns = [];
    if (det.header < 0) return { athletes: out, warns: ['見出しの行（氏名・種目など）が見つかりません'] };
    for (var r = det.header + 1; r < aoa.length; r++) {
      var row = aoa[r] || [], g = function (c) { return c == null ? '' : cell(row[c]); };
      var name = C.name != null ? g(C.name) : (g(C.sei) + ' ' + g(C.mei)).trim();
      if (C.name == null && (!g(C.sei) || !g(C.mei))) name = '';
      var evRaw = (C.event || []).map(g).filter(Boolean), rel = g(C.relay);
      if (!name || (!evRaw.length && !rel)) continue;
      if (/^(例|記入例|見本)/.test(name)) continue;
      var sex = nk(g(C.sex)).indexOf('女') >= 0 ? '女' : nk(g(C.sex)).indexOf('男') >= 0 ? '男' : '';
      var evs = [], reserve = false;
      evRaw.forEach(function (v) {
        var e = parseEvent(v, sex);
        if (!e && map && map[v]) { e = parseEvent(map[v], sex); }
        if (e && e.reserve) { reserve = true; return; }
        if (!e) { warns.push((r + 1) + '行目 ' + name + '：種目「' + v + '」を読めませんでした'); return; }
        if (e.relay) { if (!rel) rel = '?'; return; }
        evs.push(e);
      });
      out.push({ row: r + 1, name: name.replace(/\s+/g, ' '), kana: (C.kana || []).map(g).filter(Boolean).join(' '), grade: g(C.grade), sex: sex, team: g(C.team), events: evs, relay: rel && rel !== '0' ? rel : '', reserve: reserve });
    }
    return { athletes: out, warns: warns };
  }

  /* ---- 照合 ---- */
  function baseTeam(t) { return strictName(t).replace(/[A-ZＡ-Ｚ]$|[1-9]$|[ABCD]チーム$/, ''); }
  function teamMatch(a, b) { var x = looseName(a), y = looseName(b); return !!x && !!y && (x === y || x.replace(/学校$|立/g, '') === y.replace(/学校$|立/g, '')); }
  function compare(ent, sl, teams) {
    var inTeam = function (t) { return teams.indexOf(t) >= 0; };
    var slAll = sl.entries.map(function (e, i) { return { i: i, e: e, ev: parseEvent(e.event, ''), s: strictName(e.name), l: looseName(e.name) }; });
    var slMine = slAll.filter(function (x) { return inTeam(x.e.team); });
    var used = {}, rows = [];
    ent.athletes.forEach(function (a) {
      var s = strictName(a.name), l = looseName(a.name);
      var cand = slMine.filter(function (x) { return x.s === s || x.l === l; });
      a.events.forEach(function (ev) {
        var hit = cand.filter(function (x) { return !used[x.i] && sameEvent(ev, x.ev, a.grade); });
        hit.sort(function (p, q) { return (p.s === s ? 0 : 1) - (q.s === s ? 0 : 1); });
        if (hit.length) {
          var h = hit[0]; used[h.i] = 1;
          rows.push({ st: 'ok', a: a, ev: ev, sl: h.e, yure: h.s !== s, slName: h.e.name });
          return;
        }
        var notes = [];
        var other = cand.filter(function (x) { return !sameEvent(ev, x.ev, a.grade); });
        if (other.length) notes.push('スタートリストでは「' + other.map(function (x) { return x.e.event; }).filter(function (v, i, A) { return A.indexOf(v) === i; }).join('」「') + '」に名前があります');
        var else_ = slAll.filter(function (x) { return !inTeam(x.e.team) && (x.s === s || x.l === l); });
        if (else_.length) notes.push('別の所属「' + else_.map(function (x) { return x.e.team + '（' + x.e.event + '）'; }).join('・') + '」に同じ名前があります');
        rows.push({ st: 'miss', a: a, ev: ev, note: notes.join('。') });
      });
    });
    var byName = {}; ent.athletes.forEach(function (a) { byName[looseName(a.name)] = a; });
    slMine.forEach(function (x) {
      if (used[x.i]) return;
      var a = byName[x.l];
      rows.push({ st: 'extra', sl: x.e, ev: x.ev, a: a || null, note: a ? 'エントリーでは「' + (a.events.map(evLabel).join('」「') || 'リレーのみ') + '」です' : 'エントリーファイルにこの名前がありません' });
    });
    // リレー
    var relays = [], relMine = (sl.relays || []).filter(function (r) { return teams.some(function (t) { return teamMatch(baseTeam(r.team), t) || r.team === t; }); });
    var groups = {};
    ent.athletes.forEach(function (a) {
      if (!a.relay && !a.reserve) return;
      var key = (a.sex || '') + '|' + nk(a.relay || '').toUpperCase();
      (groups[key] = groups[key] || { sex: a.sex, letter: nk(a.relay || '').toUpperCase(), team: a.team, members: [] }).members.push(a);
    });
    var relUsed = {};
    Object.keys(groups).forEach(function (k) {
      var G = groups[k];
      var match = relMine.filter(function (r, i) {
        var ev = parseEvent(r.event, ''), lt = (strictName(r.team).match(/([A-Z])$/) || [])[1] || '';
        return (!G.sex || !ev || !ev.sex || ev.sex === G.sex) && (G.letter && G.letter !== '?' ? lt === G.letter || (!lt && G.letter === 'A') : true);
      });
      match.forEach(function (r) { relUsed[relMine.indexOf(r)] = 1; });
      var slMem = [];
      match.forEach(function (r) { r.members.forEach(function (m) { slMem.push({ m: m, r: r }); }); });
      var mem = G.members.map(function (a) {
        var f = slMem.filter(function (x) { return strictName(x.m.name) === strictName(a.name) || looseName(x.m.name) === looseName(a.name); });
        f.forEach(function (x) { x.used = 1; });
        return { name: a.name, grade: a.grade, st: f.length ? 'ok' : 'miss', yure: f.length && strictName(f[0].m.name) !== strictName(a.name), reserve: a.reserve };
      });
      slMem.forEach(function (x) { if (!x.used && !mem.some(function (y) { return looseName(y.name) === looseName(x.m.name); })) mem.push({ name: x.m.name, grade: x.m.grade, st: 'extra' }); });
      relays.push({ label: (G.team || '') + (G.letter && G.letter !== '?' ? G.letter : ''), sex: G.sex, letter: G.letter, sl: match, st: match.length ? 'ok' : 'miss', members: mem });
    });
    relMine.forEach(function (r, i) { if (!relUsed[i]) relays.push({ label: r.team, sex: (parseEvent(r.event, '') || {}).sex || '', sl: [r], st: 'extra', members: r.members.map(function (m) { return { name: m.name, grade: m.grade, st: 'extra' }; }) }); });
    var order = { miss: 0, extra: 1, ok: 2 };
    rows.sort(function (p, q) { return order[p.st] - order[q.st] || ((p.a && p.a.row) || 9999) - ((q.a && q.a.row) || 9999); });
    relays.sort(function (p, q) { return order[p.st] - order[q.st] || p.label.localeCompare(q.label); });
    var cnt = { ok: 0, miss: 0, extra: 0, yure: 0 };
    rows.forEach(function (r) { cnt[r.st]++; if (r.yure) cnt.yure++; });
    var rc = { ok: 0, miss: 0, extra: 0 }; relays.forEach(function (r) { rc[r.st]++; r.members.forEach(function (m) { if (m.st !== 'ok') r.memProblem = true; }); });
    return { rows: rows, relays: relays, count: cnt, relayCount: rc, reserves: ent.athletes.filter(function (a) { return a.reserve; }) };
  }
  // エントリーの所属から、スタートリストの所属を選ぶ
  function pickTeams(ent, allTeams) {
    var mine = []; ent.athletes.forEach(function (a) { if (a.team && mine.indexOf(a.team) < 0) mine.push(a.team); });
    return allTeams.filter(function (t) { return mine.some(function (m) { return teamMatch(m, t); }); });
  }
  // いちばん選手が多く読めるシートを選ぶ（「注意事項」「見本」のシートは後回し）
  function pickSheet(books, map) {
    var best = null;
    books.forEach(function (b) {
      var d = detect(b.aoa); if (d.header < 0) return;
      var n = readEntries(b.aoa, d, map).athletes.length - (/注意|見本|記入例/.test(b.name) ? 1000 : 0);
      if (!best || n > best.n) best = { name: b.name, aoa: b.aoa, det: d, n: n };
    });
    return best;
  }
  return { pickSheet: pickSheet, parseEvent: parseEvent, sameEvent: sameEvent, evLabel: evLabel, strictName: strictName, looseName: looseName, detect: detect, readEntries: readEntries, codeMap: codeMap, compare: compare, pickTeams: pickTeams, ROLES: ROLES };
})();
if (typeof module !== 'undefined') module.exports = EntryCheck;
