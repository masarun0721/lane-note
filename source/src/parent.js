/* v0.21（試し版）保護者案内用の表：学校ごとに文面は違うので、LANE NOTE は「表」だけを作る。
   ・出場選手表：選手×種目で1行（名前・学年・出場種目・リレーのチーム記号）。男子・女子を左右に並べる（片方だけなら1列）。
   ・時間順の予定：時刻・招集・種目・出る人（「通過したら」の行も）。
   どちらも HTML の表（Word に貼ると罫線つきの表になる）・タブ区切り（Excel・メモ帳）・Excel 用の配列にできる。 */
var LaneParent = (function () {
  'use strict';
  var nk = function (s) { return String(s == null ? '' : s).normalize('NFKC'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function sexOf(ev) { var e = nk(ev); return /女/.test((e.match(/^(男子|女子|男|女)/) || [''])[0]) ? 'f' : /^(男子|男)/.test(e) ? 'm' : /女子/.test(e) ? 'f' : /男子/.test(e) ? 'm' : ''; }
  function gradeNum(g) { var m = nk(g).match(/(\d)/); return m ? +m[1] : 9; }
  function gradeText(g) { g = nk(g).trim(); return /^\d$/.test(g) ? g + '年' : g; }
  function nameKey(n) { return nk(n).replace(/[\s・]/g, '').replace(/髙/g, '高').replace(/﨑/g, '崎'); }
  function evLabel(ev, dropSex) { var e = nk(ev).replace(/\s+/g, ' ').trim(); return dropSex ? e.replace(/^(男子|女子)\s*/, '').replace(/^(男|女)(?=[中高小一])/, '') : e; }
  function relayMark(team, base) { var t = nk(team).trim(), b = nk(base || '').trim(), m = t.match(/([A-Za-zＡ-Ｚ])\s*$/); if (m) return m[1].toUpperCase(); var rest = b && t.indexOf(b) === 0 ? t.slice(b.length).trim() : ''; return rest || '○'; }
  // 選手×種目の行。rows は大会準備の行（本物の行だけ。「通過したら」は使わない）
  function athleteRows(rows, opt) {
    opt = opt || {};
    var real = rows.filter(function (r) { return !r.tent; }), ath = {}, order = [];
    var add = function (name, grade, team, kana, sex) {
      var k = nameKey(name) + '@' + nk(team); if (!ath[k]) { ath[k] = { name: nk(name).replace(/\s+/g, ' ').trim(), grade: grade || '', team: team, kana: kana || '', sex: sex || '', events: [], relays: [] }; order.push(k); }
      var a = ath[k]; if (!a.grade && grade) a.grade = grade; if (!a.sex && sex) a.sex = sex; if (!a.kana && kana) a.kana = kana; return a;
    };
    real.forEach(function (r) {
      if (r.typ === 'relay') return;
      var a = add(r.name, r.grade, r.team, r.kana, sexOf(r.event)), ev = evLabel(r.event);
      if (a.events.indexOf(ev) < 0) a.events.push(ev);
    });
    real.forEach(function (r) {
      if (r.typ !== 'relay') return;
      var mk = relayMark(r.relayTeam || r.name, r.team), sx = sexOf(r.event);
      (r.members || []).forEach(function (m) {
        var hit = order.map(function (k) { return ath[k]; }).filter(function (a) { return nameKey(a.name) === nameKey(m.name) && a.team === r.team; })[0] || add(m.name, m.grade || '', r.team, '', sx);
        if (hit.relays.indexOf(mk) < 0) hit.relays.push(mk);
      });
    });
    var list = order.map(function (k) { return ath[k]; });
    list.sort(function (a, b) { return (a.sex === b.sex ? 0 : a.sex === 'm' ? -1 : b.sex === 'm' ? 1 : a.sex === 'f' ? -1 : 1) || gradeNum(a.grade) - gradeNum(b.grade) || (a.kana && b.kana ? a.kana.localeCompare(b.kana, 'ja') : 0) || a.name.localeCompare(b.name, 'ja'); });
    var sexes = {}; list.forEach(function (a) { sexes[a.sex || '?'] = 1; });
    var split = opt.split !== false && sexes.m && sexes.f;
    var out = [];
    list.forEach(function (a) {
      var evs = a.events.length ? a.events : [''];
      evs.forEach(function (ev, i) { out.push({ sex: a.sex, first: i === 0, name: a.name, grade: gradeText(a.grade), team: a.team, event: evLabel(ev, split), relay: i === 0 ? a.relays.join('・') : '' }); });
    });
    return { rows: out, split: !!split, hasRelay: list.some(function (a) { return a.relays.length; }), multiTeam: Object.keys(list.reduce(function (o, a) { o[a.team] = 1; return o; }, {})).length > 1 };
  }
  function athCols(t, opt) {
    var c = [{ k: 'name', h: '名前' }];
    if (opt.grade) c.push({ k: 'grade', h: '学年' });
    if (t.multiTeam) c.push({ k: 'team', h: '所属' });
    c.push({ k: 'event', h: '出場種目' });
    if (t.hasRelay) c.push({ k: 'relay', h: 'リレー' });
    return c;
  }
  // 表の中身（見出し＋行の2次元配列）。左右に並べるときは男子 | 女子
  function athleteGrid(rows, opt) {
    opt = opt || {}; var t = athleteRows(rows, opt), cols = athCols(t, opt);
    var cell = function (r) { return cols.map(function (c) { return !r ? '' : (c.k === 'name' || c.k === 'grade' || c.k === 'team') && !r.first ? '' : r[c.k] || ''; }); };
    var head = cols.map(function (c) { return c.h; }), body = [], caps = null;
    if (t.split) {
      var M = t.rows.filter(function (r) { return r.sex === 'm'; }), F = t.rows.filter(function (r) { return r.sex !== 'm'; });
      caps = ['男子', '女子'];
      for (var i = 0; i < Math.max(M.length, F.length); i++) body.push(cell(M[i]).concat(cell(F[i])));
      head = head.concat(head);
    } else body = t.rows.map(cell);
    return { caps: caps, head: head, body: body, ncol: cols.length, split: t.split, count: t.rows.length };
  }
  function timeGrid(rows, byTime, tentName) {
    var groups = [], cur = null;
    (byTime ? byTime(rows) : rows).forEach(function (r) {
      var k = (r.start || '?') + '|' + r.event + '|' + (r.round || '') + '|' + (r.tent ? 1 : 0);
      if (!cur || cur.k !== k) { cur = { k: k, start: r.start || '', call: r.call || '', event: evLabel(r.event) + (r.round ? ' ' + nk(r.round) : ''), tent: !!r.tent, names: [] }; groups.push(cur); }
      var n = r.typ === 'relay' ? nk(r.relayTeam || r.name).trim() + ((r.members || []).length ? '（' + r.members.map(function (m) { return nk(m.name).replace(/\s+/g, ' ').trim(); }).join('・') + '）' : '') : nk(r.name).replace(/\s+/g, ' ').trim();
      if (cur.names.indexOf(n) < 0) cur.names.push(n);
    });
    return { head: ['時刻', '招集', '種目', '出る人'], body: groups.map(function (g) { return [g.start || '未定', g.call, g.event + (g.tent ? '（通過したら）' : ''), g.names.join('、')]; }), tent: groups.map(function (g) { return g.tent; }) };
  }
  var TS = 'border-collapse:collapse;font-family:\'游明朝\',\'Yu Mincho\',\'MS Mincho\',\'ＭＳ 明朝\',serif;font-size:10.5pt;color:#000';
  var CS = 'border:1px solid #000;padding:2px 6px;vertical-align:top';
  // Word・Excel に貼っても罫線が残るよう、style を各セルに直接書く
  function gridHtml(g, title) {
    var th = function (s, extra) { return '<th style="' + CS + ';background:#eee;font-weight:bold;text-align:center' + (extra || '') + '">' + esc(s) + '</th>'; };
    var h = '<table style="' + TS + '" border="1" cellspacing="0" cellpadding="3">' + (title ? '<caption style="font-weight:bold;text-align:left;padding:0 0 4px">' + esc(title) + '</caption>' : '') + '<thead>';
    if (g.caps) h += '<tr>' + g.caps.map(function (c, i) { return th(c, ';border-left:' + (i ? '2.5px double #000' : '1px solid #000')); }).join('').replace(/<th /g, '<th colspan="' + g.ncol + '" ') + '</tr>';
    h += '<tr>' + g.head.map(function (s, i) { return th(s, g.split && i === g.ncol ? ';border-left:2.5px double #000' : ''); }).join('') + '</tr></thead><tbody>';
    h += g.body.map(function (r, ri) { return '<tr>' + r.map(function (c, i) { return '<td style="' + CS + (g.split && i === g.ncol ? ';border-left:2.5px double #000' : '') + (g.tent && g.tent[ri] ? ';font-style:italic;color:#333' : '') + (/^(時刻|招集|学年|リレー)$/.test(g.head[i]) ? ';text-align:center;white-space:nowrap' : '') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('');
    return h + '</tbody></table>';
  }
  function gridTsv(g, title) {
    var L = []; if (title) L.push(title);
    if (g.caps) L.push([g.caps[0]].concat(Array(g.ncol - 1).fill('')).concat([g.caps[1]]).concat(Array(g.ncol - 1).fill('')).join('\t'));
    L.push(g.head.join('\t')); g.body.forEach(function (r) { L.push(r.map(function (c) { return String(c).replace(/[\t\n]/g, ' '); }).join('\t')); });
    return L.join('\n');
  }
  function gridAoa(g, title) { var a = []; if (title) a.push([title]); if (g.caps) a.push([g.caps[0]].concat(Array(g.ncol - 1).fill('')).concat([g.caps[1]])); a.push(g.head); return a.concat(g.body); }
  // 印刷・PDF・画面で見る用のページ（白黒・明朝・A4縦）
  function docHtml(parts, meta) {
    meta = meta || {};
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(meta.title || '保護者案内用の表') + '</title><style>' +
      '@page{size:A4 portrait;margin:14mm 12mm}body{margin:0;padding:10mm;background:#fff;color:#000;font-family:"游明朝","Yu Mincho","MS Mincho","ＭＳ 明朝","Hiragino Mincho ProN",serif}' +
      'h1{font-size:14pt;margin:0 0 2mm;font-weight:bold}.sub{font-size:10pt;margin:0 0 5mm}section{margin:0 0 7mm;break-inside:auto}table{width:100%}caption{font-size:11pt}' +
      'tr{break-inside:avoid}thead{display:table-header-group}.note{font-size:8.5pt;margin-top:4mm}@media print{body{padding:0}}@media (max-width:600px){body{padding:3mm;overflow-x:auto}table{font-size:9pt!important;width:auto;min-width:100%}th,td{white-space:nowrap}}' +
      '</style></head><body><h1>' + esc(meta.title || '') + '</h1>' + (meta.sub ? '<p class="sub">' + esc(meta.sub) + '</p>' : '') +
      parts.map(function (p) { return '<section>' + p + '</section>'; }).join('') + '<p class="note">※ 時刻は予定です。当日の進行により前後します。最新の情報は大会の資料で確認してください。</p></body></html>';
  }
  return { athleteRows: athleteRows, athleteGrid: athleteGrid, timeGrid: timeGrid, gridHtml: gridHtml, gridTsv: gridTsv, gridAoa: gridAoa, docHtml: docHtml, relayMark: relayMark, evLabel: evLabel, sexOf: sexOf };
})();
if (typeof module !== 'undefined') module.exports = LaneParent;
