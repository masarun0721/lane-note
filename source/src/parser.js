/* ===== 陸上大会 スタートリスト／タイムテーブル 解析（座標ベース・AI不使用） ===== */
var MeetParser = (function () {
  'use strict';
  var nk = function (s) { return (s || '').normalize('NFKC'); };
  var GRADE_RE = /\(([^()]*)\)\s*$/;

  // pdf.js の text item を「単語」に分割（空白区切り、x は文字数比で近似）
  function toWords(items) {
    var out = [];
    items.forEach(function (it) {
      var s = it.str; if (!s || !s.trim()) return;
      var cw = s.length ? it.w / s.length : 0, re = /\S+/g, m;
      while ((m = re.exec(s))) {
        out.push({ t: m[0], n: nk(m[0]), x: it.x + m.index * cw, y: it.y, w: m[0].length * cw, h: it.h });
      }
    });
    return out;
  }
  function isInt(s) { return /^\d+$/.test(s); }

  // InDesign 等で組まれたPDFは、大きい文字が「小」「小学」「学」のように重複・断片化して入る。
  // そのページだけ、大きい文字（見出し・組名）を1文字ずつに分解→重複除去→つなぎ直す。
  function isFragmented(items) {
    var big = items.filter(function (i) { return i.h >= 8.5 && i.str.trim(); }), dup = 0;
    for (var a = 0; a < big.length; a++) for (var b = a + 1; b < Math.min(big.length, a + 6); b++) {
      var A = big[a], B = big[b];
      if (Math.abs(A.y - B.y) < 0.6 && Math.abs(A.x - B.x) < 0.6 && (A.str.indexOf(B.str) >= 0 || B.str.indexOf(A.str) >= 0)) dup++;
    }
    return dup >= 3;
  }
  function charEm(c) { return /[\u0020-\u007e\uff61-\uff9f]/.test(c) ? 0.5 : 1; }
  function rebuildBig(items) {
    var keep = [], chars = [];
    items.forEach(function (it) {
      if (it.h < 8.5 || !it.str) { keep.push(it); return; }
      var cs = Array.from(it.str), tot = cs.reduce(function (a, c) { return a + charEm(c); }, 0) || 1, unit = it.w / tot, x = it.x;
      cs.forEach(function (c) {
        var cw = charEm(c) * unit, cx = x; x += cw;
        if (!c.trim()) return;
        var dup = chars.some(function (o) { return o.c === c && Math.abs(o.y - it.y) < 1 && Math.abs(o.x - cx) < 0.35 * it.h; });
        if (!dup) chars.push({ c: c, x: cx, w: cw, y: it.y, h: it.h });
      });
    });
    chars.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var lines = [];
    chars.forEach(function (ch) {
      var L = lines.find(function (l) { return Math.abs(l.y - ch.y) < 1 && Math.abs(l.h - ch.h) < 1; });
      if (L) L.c.push(ch); else lines.push({ y: ch.y, h: ch.h, c: [ch] });
    });
    lines.forEach(function (L) {
      L.c.sort(function (a, b) { return a.x - b.x; });
      var cur = null;
      L.c.forEach(function (ch) {
        if (cur && ch.x - (cur.x + cur.w) < 0.3 * ch.h) { cur.str += ch.c; cur.w = ch.x + ch.w - cur.x; }
        else { if (cur) keep.push(cur); cur = { str: ch.c, x: ch.x, y: ch.y, w: ch.w, h: ch.h }; }
      });
      if (cur) keep.push(cur);
    });
    return keep;
  }
  // 単語を、すき間が小さければ詰めて、大きければ空白でつなぐ（プログラム形式の所属名用）
  function joinByGap(ws) {
    var out = '';
    ws.forEach(function (w, i) {
      if (i && w.x - (ws[i - 1].x + ws[i - 1].w) > Math.max(1.2, 0.2 * w.h)) out += ' ';
      out += w.t;
    });
    return out;
  }
  var ROUND_WORD = /^(予選|準決勝|準々決勝|決勝|タイムレース決勝|タイムレース|TR決勝)/;
  function roundNorm(s) { s = nk(s).replace(/\s+/g, ''); var m = s.match(ROUND_WORD); return m ? m[1].replace(/^TR決勝$/, 'タイムレース') : ''; }
  var BIB_HDR = /^(ナンバー|No\.?|NO\.?|番号|ゼッケン|ナンバ)$/;
  // 見出しらしい1行（「男子 高校 200m」「中学男子100m 決勝」など）。文字の大きさに関係なく判定する
  function titleLike(txt) {
    var t = nk(txt).replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40 || !/男子|女子|混合/.test(t) || /^\d+\s/.test(t)) return false;
    for (var i = 0; i < 3; i++) t = t.replace(/\s*(?:[(（]\s*続き\s*[)）]|続き|予選|準々決勝|準決勝|タイムレース決勝|タイムレース|決勝|TR|全?\d+組)\s*$/, '');
    return DISC_TAIL.test(t);
  }
  // 「10月11日」「10 月 12 日」→「10/11」。申込締切・作成日などの行は除く
  var DATE_NG = /申込|締切|締め切|期限|作成|発行|更新|印刷|現在|振込|受付/;
  function datesIn(txt) {
    var t = nk(txt), out = [], re = /(\d{1,2})\s*月\s*(\d{1,2})\s*日((?:\s*[(（][^)）]{1,3}[)）])?\s*[・、～〜~\-－]\s*(\d{1,2})\s*日)?/g, m;
    if (DATE_NG.test(t)) return out;
    while ((m = re.exec(t))) {
      var mo = +m[1], d = +m[2]; if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
      out.push(mo + '/' + d); if (m[4] && +m[4] >= 1 && +m[4] <= 31) out.push(mo + '/' + (+m[4]));
    }
    return out;
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  // ページの行ごとに日付を拾う → そのページの日付（1つに決まるときだけ）と、見つかった全部の日付
  function pageDates(items) {
    var lines = [];
    items.forEach(function (i) { var L = lines.find(function (l) { return Math.abs(l.y - i.y) < 2.5; }); if (L) L.t.push(i); else lines.push({ y: i.y, t: [i] }); });
    var all = [];
    lines.forEach(function (L) { all = all.concat(datesIn(L.t.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.str; }).join(' '))); });
    all = uniq(all);
    return { one: all.length === 1 ? all[0] : '', all: all };
  }
  function isBib(s) { return /^[0-9][0-9A-Za-z\-]*$/.test(s); }

  /* ---------- スタートリスト ---------- */
  function parseStartList(pages) {
    var diag = [];
    var entries = [], relays = [], events = [], lastTitle = null, lastRound = '', lastSched = [], lastTitlePage = -9, fragPages = 0, schedCount = 0;
    var curDate = '', seenDates = [];
    pages.forEach(function (pg, pi) {
      var W = pg.width, H = pg.height;
      var items = pg.items.filter(function (i) { return i.str && i.str.trim(); });
      if (!items.length) return;
      var frag = isFragmented(items);
      if (frag) { items = rebuildBig(items); fragPages++; }
      var pd = pageDates(items); seenDates = uniq(seenDates.concat(pd.all));
      if (pd.one) curDate = pd.one; else if (pd.all.length > 1) curDate = '';   // 1ページに複数の日付 → ページの日付は決めない
      var pageDate = curDate;
      // 種目タイトル（大きい文字）でページを区切る（1ページに複数種目あり得る）
      var hs = items.map(function (i) { return i.h; }).sort(function (a, b) { return a - b; });
      var medH = hs[Math.floor(hs.length / 2)];
      var titles = items.filter(function (i) { return i.h >= medH * 1.5 && /(男|女|混)/.test(i.str) && !/組\s*$/.test(i.str) && i.x < W * 0.5; })
        .sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var tGroups = [];
      titles.forEach(function (t) {
        var g = tGroups.find(function (g) { return Math.abs(g.y - t.y) < 2; });
        if (g) g.items.push(t); else tGroups.push({ y: t.y, items: [t] });
      });
      // 見出しが「男子」「高校」「100m」のように別々の text item に分かれている場合、同じ行の大きい文字をつなぐ
      tGroups.forEach(function (g) {
        items.forEach(function (i) {
          if (g.items.indexOf(i) >= 0 || Math.abs(i.y - g.y) >= 2 || i.h < medH * 1.5 || i.x >= W * 0.55 || /組\s*$/.test(i.str)) return;
          if (/^(予選|準決勝|決勝|タイムレース|TR|準々決勝)/.test(nk(i.str).trim())) return;
          g.items.push(i);
        });
        g.items.sort(function (a, b) { return a.x - b.x; });
      });
      // 本文と同じくらいの大きさで書かれた見出し（「男子 高校 200m」など）も見出しとして扱う。
      // こうしないと、前ページの種目の続きとして読んでしまう（別の種目なのに「問題なし」になる）
      var sLinesT = [];
      items.forEach(function (i) {
        if (i.x >= W * 0.55 || i.h >= medH * 1.5) return;
        var L = sLinesT.find(function (l) { return Math.abs(l.y - i.y) < 1.5; }); if (L) L.t.push(i); else sLinesT.push({ y: i.y, t: [i] });
      });
      sLinesT.forEach(function (L) {
        if (tGroups.some(function (g) { return Math.abs(g.y - L.y) < 4; })) return;
        L.t.sort(function (a, b) { return a.x - b.x; });
        if (L.t[0].x >= W * 0.3) return;
        var txt = L.t.map(function (i) { return i.str; }).join(' ');
        if (!titleLike(txt)) return;
        var keep = L.t.filter(function (i) { return !/^(予選|準決勝|決勝|タイムレース|TR|準々決勝|\d+組|全\d+組)/.test(nk(i.str).trim()); });
        tGroups.push({ y: L.y, items: keep.length ? keep : L.t, small: true });
      });
      tGroups.sort(function (a, b) { return a.y - b.y; });
      var sections = [];
      if (!tGroups.length || items.some(function (i) { return i.y < tGroups[0].y - 2; })) {
        // 前のページの最後の種目の続き：直前のページで見出しを読めているときだけ引き継ぐ
        var canCont = lastTitle && lastTitlePage === pi - 1;
        sections.push({ title: canCont ? lastTitle : null, round: canCont ? lastRound : '', y0: -1, cont: true, sched: canCont ? lastSched : [], noInherit: !canCont && !!lastTitle });
      }
      tGroups.forEach(function (g) {
        var title = nk(g.items.map(function (i) { return i.str; }).join(' ')).replace(/\s+/g, ' ').trim();
        var rItem = items.filter(function (i) { return i.y > g.y + 2 && i.y < g.y + 40 && /^(予選|準決勝|決勝|タイムレース|TR|準々決勝|1次予選|2次予選|オープン)/.test(nk(i.str).trim()); })[0];
        // プログラム形式：見出しの右に「10月11日 09:30 予選」のような日程行がある
        var sched = [];
        var sItems = items.filter(function (i) { return i.y > g.y - 2 && i.y < g.y + 80 && i.x > W * 0.55 && i.h < 10; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; });
        var sLines = [];
        sItems.forEach(function (i) { var L = sLines.find(function (l) { return Math.abs(l.y - i.y) < 1.5; }); if (L) L.t.push(i); else sLines.push({ y: i.y, t: [i] }); });
        sLines.forEach(function (L) {
          var txt = nk(L.t.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.str; }).join(' '));
          var m = txt.match(/(\d{1,2}:\d{2})\s*(.*)$/);
          var dm = txt.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
          if (m) { var rn = roundNorm(m[2]); sched.push({ time: m[1], round: rn || m[2].replace(/\s+/g, ''), date: dm ? (+dm[1]) + '/' + (+dm[2]) : '' }); }
        });
        if (sched.length) schedCount++;
        sections.push({ title: title, round: rItem ? nk(rItem.str).trim().split(/\s+/)[0] : (sched.length === 1 ? sched[0].round : ''), y0: g.y - 1, sched: sched, small: !!g.small });
      });
      sections.forEach(function (sec, si) { sec.y1 = si + 1 < sections.length ? sections[si + 1].y0 : 1e9; });
      var allWords = toWords(items);
      sections.forEach(function (sec) {
        if (!sec.title) {
          // 見出しの無い部分（前のページから引き継げなかった）に番号の行がある → 読めていない部分として警告
          var nw = allWords.filter(function (w) { return w.y > sec.y0 && w.y < sec.y1 && isInt(w.n); }).length;
          if (nw > 10 || (sec.noInherit && nw > 2)) diag.push({ page: pi + 1, title: '', count: 0, cont: false, warn: ['種目の見出しを読み取れず、この部分は読み取っていません（前のページの種目として扱わない）'] });
          return;
        }
        if (sec.title === lastTitle && !sec.round) sec.round = lastRound;
        if (sec.title === lastTitle && (!sec.sched || !sec.sched.length)) sec.sched = lastSched;
        lastSched = sec.sched || [];
        if (!sec.cont && events.indexOf(sec.title) < 0) events.push(sec.title);
        var smallNew = sec.small && sec.title !== lastTitle;
        lastTitle = sec.title; lastRound = sec.round; lastTitlePage = pi;
        var e0 = entries.length, r0 = relays.length, secW = allWords.filter(function (w) { return w.y > sec.y0 && w.y < sec.y1; });
        parseSection(secW, W, pi, sec.title, sec.round, sec.sched || [], frag);
        for (var q = e0; q < entries.length; q++) if (!entries[q].date && pageDate) entries[q].date = pageDate;
        for (var q2 = r0; q2 < relays.length; q2++) if (!relays[q2].date && pageDate) relays[q2].date = pageDate;
        var blankForm = secW.some(function (w) { return BIB_HDR.test(w.n) || /^(\d+レーン|レーン|チーム名)$/.test(w.n); }) && !secW.some(function (w) { return isBib(w.n) && w.n.length >= 2 && w.x < W * 0.5; });
        var n = entries.length - e0 + relays.length - r0, pt = parseTitle(sec.title), warn = [];
        if (!DISC_TAIL.test(nk(sec.title).replace(/\s+$/, ''))) warn.push('種目名が不完全');
        if (!n && !sec.cont && !blankForm) warn.push('出場者を読み取れず');
        if (smallNew) warn.push('見出しの文字が本文と同じ大きさで、想定と違う形式です（種目名・人数を元のPDFで確認）');
        diag.push({ page: pi + 1, title: sec.title, round: sec.round, count: n, cont: !!sec.cont, warn: warn, info: !n && blankForm ? '空欄の表（決勝など未定）' : '' });
      });
    });
    var format = schedCount > 0 ? 'program' : 'kitaku';
    var all = entries.concat(relays);
    all.forEach(function (e) { e.format = format; });
    diag.forEach(function (d, i) {   // 見出しだけページ末尾にあり、出場者は次ページに続く場合は警告しない
      var nx = diag[i + 1];
      if (!d.count && nx && nx.cont && nx.title === d.title && nx.count) d.warn = d.warn.filter(function (w) { return w !== '出場者を読み取れず'; });
    });
    var dates = []; all.forEach(function (e) { if (e.date && dates.indexOf(e.date) < 0) dates.push(e.date); });
    // 出場者に付いた日付のほか、ページに書かれた日付（「10月11日」「10月12日」が別ページ、「11日・12日」など）も見る
    var allDates = uniq(dates.concat(seenDates)).sort(function (a, b) { var x = a.split('/'), y = b.split('/'); return (x[0] - y[0]) || (x[1] - y[1]); });
    var undated = dates.length && all.some(function (e) { return !e.date; });
    return { dates: allDates, entryDates: dates, undated: !!undated, multiDay: allDates.length > 1, diag: diag.filter(function (d) { return !d.cont || d.count; }), warnings: diag.filter(function (d) { return d.warn.length; }), entries: entries, relays: relays, events: events, format: format, fragmentedPages: fragPages,
      hasTimes: all.some(function (e) { return e.time; }) };

    function parseSection(words, W, pi, title, round, sched, frag) {
      var heatLabels = words.filter(function (w) { return /^\d+組$/.test(w.n); });
      // ラウンド見出し（「予 選」「決 勝」など。プログラム形式は1種目に予選・決勝の欄が並ぶ）
      var roundLabels = [];
      if (frag) {
        var bigW = words.filter(function (w) { return w.h >= 10 && w.x < W * 0.3; });
        var ly = [];
        bigW.forEach(function (w) { if (!ly.some(function (y) { return Math.abs(y - w.y) < 1; })) ly.push(w.y); });
        ly.forEach(function (y) {
          var t = bigW.filter(function (w) { return Math.abs(w.y - y) < 1; }).sort(function (a, b) { return a.x - b.x; }).map(function (w) { return w.n; }).join('');
          var r = roundNorm(t); if (r) roundLabels.push({ y: y, round: r });
        });
      }
      function roundAt(y) {
        var c = roundLabels.filter(function (r) { return r.y < y; }).sort(function (a, b) { return b.y - a.y; })[0];
        return c ? c.round : round;
      }
      // ラウンドが一致する日程だけを使う。ラウンドが両方わかっていて違う（決勝なのに「09:00 予選」しかない）ときは時刻を入れない
      function schedFor(r) {
        if (!sched || !sched.length) return null;
        var rn = roundNorm(r) || r, kR = roundKind(rn);
        var hit = sched.find(function (s) { return s.round === rn; }) ||
          (kR ? sched.find(function (s) { return roundKind(s.round) === kR; }) : null);
        if (!hit && sched.length === 1 && (!kR || !roundKind(sched[0].round))) hit = sched[0];
        return hit || null;
      }
      function timeFor(r) { var h = schedFor(r); return h ? h.time : null; }
      function dateFor(r) { var h = schedFor(r); return h ? h.date || '' : ''; }
      function missNote(r) {
        if (!sched || !sched.length || schedFor(r)) return '';
        return '時刻未確定（プログラムの日程に「' + (r || 'ラウンド不明') + '」の時刻が無い。記載：' + sched.map(function (s) { return s.time + ' ' + s.round; }).join('／') + '）';
      }
      var isRelay = /×|リレー|ﾘﾚｰ/.test(title || '') || /\d\s*[Xx]\s*\d/.test(nk(title || ''));
      if (isRelay) {
        var n0 = relays.length;
        parseRelayPage(words, heatLabels, W, pi, title, round, relays);

        relays.slice(n0).forEach(function (r) { r.round = roundAt(r._y) || r.round; var t = timeFor(r.round); if (t) r.time = t; else { var mn = missNote(r.round); if (mn) r.timeNote = mn; } var d = dateFor(r.round); if (d) r.date = d; delete r._y; });
        return;
      }
      // ヘッダー（ﾅﾝﾊﾞｰ）
      var hdrs = words.filter(function (w) { return BIB_HDR.test(w.n); }).map(function (h) {
        var kindW = words.filter(function (w) { return Math.abs(w.y - h.y) < 6 && w.x < h.x && w.x > h.x - 30 && /^(レーン|ORD|試|順|試順|試技順|組|ｵｰﾀﾞｰ|オーダー)$/.test(w.n); })
          .sort(function (a, b) { return Math.abs(a.y - h.y) - Math.abs(b.y - h.y); })[0];
        var kind = !kindW ? 'レーン' : (kindW.n === 'レーン' ? 'レーン' : /^(試|順|試順|試技順)$/.test(kindW.n) ? '試技順' : 'ORD');
        return { x: h.x, y: h.y, kind: kind };
      });
      hdrs.forEach(function (h) {
        var right = hdrs.filter(function (o) { return o !== h && Math.abs(o.y - h.y) < 3 && o.x > h.x; }).map(function (o) { return o.x - 25; });
        h.left = h.x - 25; h.right = right.length ? Math.min.apply(null, right) : W;
        var res = words.filter(function (w) { return w.x > h.x && w.x < h.right && Math.abs(w.y - h.y) < 6 && /^(順位|1回目|記録|ｺﾒﾝﾄ|コメント|資格記録|前記録|試技|1回)/.test(w.n); });
        h.resX = res.length ? Math.min.apply(null, res.map(function (w) { return w.x; })) : h.right;
        var aff = words.filter(function (w) { return w.x > h.x && w.x < h.resX && Math.abs(w.y - h.y) < 6 && /^所/.test(w.n); })[0];
        h.affX = aff ? aff.x : (h.x + h.resX) / 2;
      });
      if (!hdrs.length) return;
      function hdrFor(x, y) {
        var c = hdrs.filter(function (h) { return x >= h.left && x < h.right && h.y < y; });
        c.sort(function (a, b) { return b.y - a.y; });
        return c[0];
      }
      // 行（y）ごとにアンカー（番号 + ナンバー）を探す
      var used = new Set();
      var sorted = words.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      sorted.forEach(function (w) {
        if (used.has(w) || !isInt(w.n)) return;
        var h = hdrFor(w.x, w.y); if (!h) return;
        if (w.x > h.affX) return;
        var line = words.filter(function (o) { return Math.abs(o.y - w.y) < 1.2 && o.x >= h.left && o.x < h.resX; }).sort(function (a, b) { return a.x - b.x; });
        var i = line.indexOf(w); if (i !== 0) return;
        var bibW = line[1]; if (!bibW || !isBib(bibW.n) || bibW.x > h.affX) return;
        line.forEach(function (o) { used.add(o); });
        var aY = w.y;
        var rest = words.filter(function (o) { return o !== w && o !== bibW && o.y >= aY - 7 && o.y <= aY + 1.5 && o.x > bibW.x + 1 && o.x < h.resX && o.x >= h.left; })
          .sort(function (a, b) { return a.x - b.x || a.y - b.y; });
        var nameW = [], affW = [], gi = -1;
        for (var k = 0; k < rest.length; k++) { if (GRADE_RE.test(rest[k].t)) { gi = k; break; } }
        if (gi >= 0) { nameW = rest.slice(0, gi + 1); affW = rest.slice(gi + 1); }
        else {
          var upper = rest.filter(function (o) { return o.y < aY - 1.5; }), same = rest.filter(function (o) { return o.y >= aY - 1.5; });
          if (upper.length && same.length) { nameW = upper; affW = same; }
          else { nameW = rest.filter(function (o) { return o.x < h.affX - 3; }); affW = rest.filter(function (o) { return o.x >= h.affX - 3; }); }
        }
        var name = nameW.map(function (o) { return o.t; }).join(' ').replace(/[\s\u3000]+/g, ' ').trim();
        if (frag) name = name.replace(/\s+(\()/, '$1');
        var grade = '';
        var gm = name.match(GRADE_RE); if (gm) { grade = gm[1].trim(); name = name.replace(GRADE_RE, '').trim(); }
        var team = (frag ? joinByGap(affW) : affW.map(function (o) { return o.t; }).join(' ')).replace(/[\s\u3000]+/g, ' ').replace(/(^|\s)[+＋]\s*[\/･・]\s*[-－](?=\s|$)/g, ' ').replace(/(\s+[mｍ])+\s*$/, '').trim();
        var hl = heatLabels.filter(function (l) { return l.y < aY && l.x >= h.left - 5 && l.x < h.right; }).sort(function (a, b) { return b.y - a.y; })[0];
        var rd = roundAt(aY), tm = timeFor(rd);
        var ent = { page: pi + 1, event: title, round: rd, heat: hl ? parseInt(hl.n, 10) : null, posKind: h.kind,
          pos: parseInt(w.n, 10), bib: bibW.n, name: name, grade: grade, team: team };
        var nameH = nameW.length ? Math.max.apply(null, nameW.map(function (o) { return o.h || 0; })) : 0;
        var kanaW = words.filter(function (o) { return o.y >= aY - 13 && o.y < aY - 7 && nameH && o.h && o.h < nameH * 0.92 && rest.indexOf(o) < 0 && o.x > bibW.x + 1 && o.x < h.affX - 3 && /^[\uFF66-\uFF9F\u30A0-\u30FF\s\u3000]+$/.test(o.t); });
        if (kanaW.length) ent.kana = kanaW.sort(function (a, b) { return a.x - b.x; }).map(function (o) { return o.t; }).join(' ').normalize('NFKC').replace(/\s+/g, ' ').trim();
        if (tm) ent.time = tm; else { var mn = missNote(rd); if (mn) ent.timeNote = mn; }
        var dt = dateFor(rd); if (dt) ent.date = dt;
        entries.push(ent);
      });
    }
  }

  function parseRelayPage(words, heatLabels, W, pi, title, round, relays) {
    var lanes = words.filter(function (w) { return /^\d+レーン$/.test(w.n); });
    var boundaries = words.filter(function (w) { return /^順位$/.test(w.n); }).concat(heatLabels);
    lanes.forEach(function (lh) {
      var nexts = lanes.filter(function (o) { return Math.abs(o.y - lh.y) < 2 && o.x > lh.x; }).map(function (o) { return o.x; });
      var right = nexts.length ? Math.min.apply(null, nexts) : W;
      var team = words.filter(function (o) { return Math.abs(o.y - lh.y) < 1.2 && o.x > lh.x && o.x < right - 2; })
        .sort(function (a, b) { return a.x - b.x; }).map(function (o) { return o.t; }).join(' ').trim();
      var below = lanes.filter(function (o) { return o.y > lh.y + 2 && Math.abs(o.x - lh.x) < 25; }).map(function (o) { return o.y; })
        .concat(boundaries.filter(function (b) { return b.y > lh.y + 2; }).map(function (b) { return b.y; }));
      var bottom = below.length ? Math.min.apply(null, below) - 1 : lh.y + 80;
      var region = words.filter(function (o) { return o.y > lh.y + 2 && o.y < bottom && o.x >= lh.x - 3 && o.x < right - 3; });
      var ys = []; region.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (o) { if (!ys.some(function (y) { return Math.abs(y - o.y) < 2; })) ys.push(o.y); });
      ys.sort(function (a, b) { return a - b; });
      var members = [];
      ys.forEach(function (y) {
        var ln = region.filter(function (o) { return o.y >= y - 0.01 && o.y < y + 2; }).sort(function (a, b) { return a.x - b.x; })
          .filter(function (o) { return !/^[()（）]+$/.test(o.n); });
        var bi = ln.findIndex(function (o) { return isBib(o.n); }); if (bi < 0) return;
        var nm = [];
        var HK = /^[\uFF61-\uFF9F]+$/;
        for (var k = bi + 1; k < ln.length; k++) {
          if (nm.length && HK.test(ln[k].t) && !HK.test(nm[nm.length - 1])) break; // フリガナ列に入ったら終了
          nm.push(ln[k].t); if (GRADE_RE.test(ln[k].t)) break;
        }
        var name = nm.join(' ').replace(/[\s\u3000]+/g, ' ').trim(), grade = '';
        var gm = name.match(GRADE_RE); if (gm) { grade = gm[1].trim(); name = name.replace(GRADE_RE, '').trim(); }
        members.push({ bib: ln[bi].n, name: name, grade: grade });
      });
      var above = heatLabels.filter(function (l) { return l.y < lh.y; });
      var inCol = above.filter(function (l) { return l.x >= lh.x - 30 && l.x < right - 3; });   // 同じ列（横並びの組）を優先
      var hl = (inCol.length ? inCol : above).sort(function (a, b) { return b.y - a.y; })[0];
      if (!team && !members.length) return; // 空きレーン
      relays.push({ page: pi + 1, event: title, round: round, heat: hl ? parseInt(hl.n, 10) : 1, posKind: 'レーン',
        pos: parseInt(lh.n, 10), team: team, members: members, _y: lh.y });
    });
  }

  /* ---------- タイムテーブル ---------- */
  var EVT_RE = /(^\d+(\.\d+)?(m|km|M)(H|SC|W|R|mH)?$)|×|走高跳|走幅跳|棒高跳|三段跳|砲丸投|円盤投|ハンマー投|やり投|ジャベリック|競歩|リレー$|混成|十種|七種|四種|ハードル|障害/;
  var EVT_NG = /締切|提出|用紙|終了|開始|招集/;
  var TIME_RE = /^\d{1,2}:\d{2}$/;
  var GENDER_RE = /^(男|女|男子|女子|混合|男女)$/;
  var CAT_RE = /^(小|中|高|一般|共通|大学|U\d|ジュニア|シニア|マスターズ|成年|少年)/;
  var ROUND_RE = /(予選|準決勝|決勝|タイムレース|^TR)/;
  function parseTimetable(pages) {
    var segs = [], curDate = '';
    pages.forEach(function (pg, pi) {
      var its = pg.items.filter(function (i) { return i.str && i.str.trim(); });
      var pd = pageDates(its), s0 = segs.length;
      if (pd.one) curDate = pd.one; else if (pd.all.length > 1) curDate = '';
      var pageDate = curDate;
      var words = toWords(its);
      words.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var lines = [];
      words.forEach(function (w) {
        var L = lines.find(function (l) { return Math.abs(l.y - w.y) < 3; });
        if (L) L.w.push(w); else lines.push({ y: w.y, w: [w] });
      });
      var colState = []; // {x, time, cat, gender}
      lines.forEach(function (L) {
        var ws = L.w.sort(function (a, b) { return a.x - b.x; });
        var evIdx = []; ws.forEach(function (w, i) { if (EVT_RE.test(w.n) && !EVT_NG.test(w.n)) evIdx.push(i); });
        if (!evIdx.length) return;
        // 時刻が種目名の右に書かれている表（「男子100m 予選 09:00」）：その行の最初の時刻が最初の種目より右にある
        var tIdx = ws.findIndex(function (w) { return TIME_RE.test(w.n); });
        var rightMode = tIdx > evIdx[0];
        if (rightMode) {
          evIdx.forEach(function (ei, k) {
            var end = k + 1 < evIdx.length ? evIdx[k + 1] : ws.length, ev = ws[ei];
            var start = k === 0 ? 0 : evIdx[k - 1] + 1, pre = ws.slice(start, ei), post = ws.slice(ei + 1, end);
            // 前の種目の時刻より後ろにある語だけを、この種目の性別・区分として使う
            var lastT = -1; pre.forEach(function (w, i) { if (TIME_RE.test(w.n)) lastT = i; }); pre = pre.slice(lastT + 1);
            var seg = { page: pi + 1, x: ev.x, y: L.y, event: ev.n, time: null, cat: null, gender: null, round: '', heats: null, raw: '', timeRight: true };
            pre.forEach(function (w) { if (GENDER_RE.test(w.n)) seg.gender = w.n; else if (CAT_RE.test(w.n)) seg.cat = (seg.cat || '') + w.n; });
            var tw = post.find(function (w) { return TIME_RE.test(w.n); }); if (tw) seg.time = tw.n;
            var postS = post.filter(function (w) { return !TIME_RE.test(w.n); }).map(function (w) { return w.n; });
            var rd = postS.find(function (x) { return ROUND_RE.test(x); }); if (rd) seg.round = rd;
            var joined = postS.join(' ');
            var hm = joined.match(/(\d+)\s*[～~〜\-ー－]\s*(\d+)\s*組/);
            if (hm) seg.heats = { from: +hm[1], to: +hm[2] };
            else { var hc = joined.match(/(全)?\s*(\d+)\s*組/); if (hc) seg.heats = hc[1] ? { count: +hc[2], all: true } : { count: +hc[2], bare: true }; }
            seg.raw = pre.map(function (w) { return w.n; }).concat([ev.n], post.map(function (w) { return w.n; })).join(' ');
            segs.push(seg);
          });
          return;
        }
        evIdx.forEach(function (ei, k) {
          var prevEnd = k === 0 ? -1 : evIdx[k - 1], nextStart = k === evIdx.length - 1 ? ws.length : evIdx[k + 1];
          var pre = [], post = [];
          for (var i = prevEnd + 1; i < ei; i++) {
            var w = ws[i];
            if (TIME_RE.test(w.n) || GENDER_RE.test(w.n) || CAT_RE.test(w.n)) pre.push(w);
          }
          // 次の種目の手前まで（ただし次の種目のprefix語は除く）
          var lastPost = nextStart;
          if (k < evIdx.length - 1) {
            lastPost = ei + 1;
            for (var j = ei + 1; j < nextStart; j++) { var u = ws[j]; if (TIME_RE.test(u.n) || GENDER_RE.test(u.n) || CAT_RE.test(u.n)) break; lastPost = j + 1; }
          }
          for (var j2 = ei + 1; j2 < lastPost; j2++) post.push(ws[j2]);
          var ev = ws[ei];
          var seg = { page: pi + 1, x: ev.x, y: L.y, event: ev.n, time: null, cat: null, gender: null, round: '', heats: null, raw: '' };
          pre.forEach(function (w) { if (TIME_RE.test(w.n)) seg.time = w.n; else if (GENDER_RE.test(w.n)) seg.gender = w.n; else seg.cat = (seg.cat ? seg.cat : '') + w.n; });
          var postS = post.map(function (w) { return w.n; });
          var rd = postS.find(function (s) { return ROUND_RE.test(s); }); if (rd) seg.round = rd;
          var joined = postS.join(' ');
          var hm = joined.match(/(\d+)\s*[～~〜\-ー－]\s*(\d+)\s*組/);
          if (hm) seg.heats = { from: +hm[1], to: +hm[2] };
          else { var hc = joined.match(/(全)?\s*(\d+)\s*組/); if (hc) seg.heats = hc[1] ? { count: +hc[2], all: true } : { count: +hc[2], bare: true }; }
          seg.raw = pre.map(function (w) { return w.n; }).concat([ev.n], postS).join(' ');
          // 列ごとの継承
          var col = colState.find(function (c) { return Math.abs(c.x - ev.x) < 30; });
          if (!col) { col = { x: ev.x }; colState.push(col); }
          if (!seg.time) seg.time = col.time || null; else col.time = seg.time;
          if (!seg.cat && !seg.gender) { seg.cat = col.cat; seg.gender = col.gender; seg.inherited = true; }
          else { if (!seg.gender) seg.gender = col.gender; col.cat = seg.cat; col.gender = seg.gender; }
          segs.push(seg);
        });
      });
      // 日付：行に書かれた日付 → なければページの日付（「10月12日」のページ以降は12日）
      for (var q = s0; q < segs.length; q++) { var ld = datesIn(lines.find(function (L) { return L.y === segs[q].y; }).w.map(function (w) { return w.n; }).join(' ')); segs[q].date = ld.length === 1 ? ld[0] : pageDate; }
    });
    return segs;
  }

  /* ---------- 種目の照合 ---------- */
  function normDisc(s) {
    s = nk(s).replace(/\(.*?\)/g, '').replace(/\s+/g, '').replace(/ｍ/g, 'm');
    s = s.replace(/(\d)\s*[Xx]\s*(\d)/, '$1×$2');
    s = s.replace(/(\d)m?R$/, '$1m').replace(/リレー$/, '');
    s = s.replace(/^(\d+(?:×\d+)?)m?$/, '$1m');
    return s;
  }
  function catInfo(c) {
    c = nk(c || '').replace(/\s/g, '');
    var lv = [], g = null;
    if (/小/.test(c)) lv.push('小');
    if (/中/.test(c)) lv.push('中');
    if (/高/.test(c)) lv.push('高');
    if (/一般|成年|シニア/.test(c)) lv.push('一般');
    if (/大学/.test(c)) lv.push('大');
    var m = c.match(/([1-6])年?/); if (m && !/共通/.test(c)) g = m[1];
    return { lv: lv, g: g, raw: c };
  }
  var DISC_TAIL = /(\d+(?:\.\d+)?\s*[Xx×]\s*\d+m?R?|\d+(?:\.\d+)?(?:m|km)(?:H|SC|W|JH|R)?|走高跳|走幅跳|棒高跳|三段跳|砲丸投|円盤投|ハンマー投|やり投|ジャベリックスロー|ボール投|競歩|混成|十種競技|七種競技|四種競技)(\s*\([^)]*\))?\s*$/;
  function parseTitle(title) {
    var t = nk(title || '').trim();
    var m = t.match(/^(男子|女子|混合)\s*(\S*)\s+(.+)$/);
    if (m) return { gender: m[1], cat: m[2], disc: normDisc(m[3]) };
    // プログラム形式：「中学男子100m」「小学4~6年男子100m」「中学1・2年男子砲丸投(4.000kg)」
    var g = t.match(/男子|女子|混合/), d = t.match(DISC_TAIL);
    if (!g || !d) return { gender: g ? g[0] : '', cat: '', disc: normDisc(t) };
    var cat = (t.slice(0, g.index) + t.slice(g.index + g[0].length, d.index)).replace(/\s+/g, '');
    return { gender: g[0], cat: cat, disc: normDisc(d[0]) };
  }
  function roundKind(r) {
    r = nk(r || '').replace(/\s+/g, '');
    if (!r) return '';
    if (/準々決勝/.test(r)) return 'qf'; if (/準決勝/.test(r)) return 'sf'; if (/予選/.test(r)) return 'h';
    if (/決勝|タイムレース|^TR/.test(r)) return 'f';
    return '';
  }
  function matchSegs(title, round, segs, date) {
    var p = parseTitle(title), ci = catInfo(p.cat), best = [], bestScore = 0;
    segs.forEach(function (s) {
      if (normDisc(s.event) !== p.disc) return;
      if (date && s.date && date !== s.date) return;   // 日付が両方わかっていて違う → 別の日の時刻

      if (s.gender && p.gender && s.gender[0] !== p.gender[0]) return;
      var sc = catInfo(s.cat), score = 1;
      if (ci.lv.length && sc.lv.length) {
        if (!ci.lv.some(function (l) { return sc.lv.indexOf(l) >= 0; })) return;
        score += 2;
        if (ci.g && sc.g) { if (ci.g !== sc.g) return; score += 3; }
        else if (!ci.g && sc.g) return;
        if (sc.lv.length === ci.lv.length) score += 1;
      }
      var rS = nk(round || ''), rT = nk(s.round || '');
      var kS = roundKind(rS), kT = roundKind(rT);
      if (kS && kT && kS !== kT) return;   // ラウンドが両方わかっていて違う → 別の時刻なので候補にしない
      if (kS && kT === kS) score += 1;   // ラウンドが一致したものを優先。ラウンド不明なら加点しない（勝手に決勝を選ばない）
      if (score > bestScore) { bestScore = score; best = [s]; } else if (score === bestScore) best.push(s);
    });
    return best;
  }
  function timeFor(segsForEvent, heat) {
    if (!segsForEvent.length) return null;
    // ラウンドが違う候補が残り、時刻も違う → どれか決められない（未確定）
    var kinds = {}; segsForEvent.forEach(function (s) { var k = roundKind(s.round) || '?'; (kinds[k] = kinds[k] || []).push(s); });
    var times = {}; segsForEvent.forEach(function (s) { if (s.time) times[s.time] = 1; });
    if (Object.keys(kinds).length > 1 && Object.keys(times).length > 1)
      return { time: null, note: '時刻未確定（候補：' + Object.keys(times).join('／') + '。ラウンドを確認）', ambiguous: true };
    var blk = segsForEvent.filter(function (s) { return s.heats && s.heats.from != null; }).map(function (s) { return { s: s, from: s.heats.from, to: s.heats.to }; });
    // 「09:10 2組」「09:20 3組」のように組ごとに1行ずつ書かれている（1組から始まらない・欠番があってもよい）。
    // 「n組」が1行だけのときは「全n組」の意味のことが多いので組番号として扱わない。「全n組」は組番号にしない
    var bare = segsForEvent.filter(function (s) { return s.heats && s.heats.bare; });
    var bareNs = uniq(bare.map(function (s) { return s.heats.count; }));
    if ((bare.length > 1 && bareNs.length === bare.length) || (bare.length && blk.length))
      blk = blk.concat(bare.map(function (s) { return { s: s, from: s.heats.count, to: s.heats.count }; }));
    if (blk.length) {
      blk.sort(function (a, b) { return a.from - b.from; });
      if (heat == null) { var b0 = blk[0]; return { time: b0.from === 1 ? b0.s.time : null, note: b0.from === 1 ? '最初の組の開始時刻' : '組がわからないため時刻未確定（タイムテーブルは' + b0.from + '組から）', seg: b0.s }; }
      var b = blk.find(function (o) { return heat >= o.from && heat <= o.to; });
      if (b) return { time: b.s.time, note: (b.from === b.to ? b.from + '組の開始時刻' : b.from + '〜' + b.to + '組の開始時刻'), seg: b.s };
      var near = blk.map(function (o) { return (o.from === o.to ? o.from : o.from + '〜' + o.to) + '組 ' + o.s.time; }).join('／');
      return { time: null, note: '時刻未確定（' + heat + '組の時刻がタイムテーブルに無い。記載：' + near + '）' };
    }
    var s0 = segsForEvent[0];
    var n = s0.heats && s0.heats.count;
    var note = n ? (n > 1 ? '全' + n + '組の開始時刻' + (heat > 1 ? '（' + heat + '組目は前の組の後）' : '') : '1組のみ') : '';
    return { time: s0.time, note: note, seg: s0 };
  }

  /* ---------- 競技注意事項（招集ルール） ---------- */
  function pagesToLines(pages) {
    var out = [];
    pages.forEach(function (pg) {
      var its = pg.items.filter(function (i) { return i.str && i.str.trim(); }).slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var lines = [];
      its.forEach(function (i) { var L = lines.find(function (l) { return Math.abs(l.y - i.y) < 2.5; }); if (L) L.t.push(i); else lines.push({ y: i.y, t: [i] }); });
      lines.sort(function (a, b) { return a.y - b.y; }).forEach(function (L) {
        out.push(nk(L.t.sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.str; }).join(' ')).replace(/\s+/g, ' ').trim());
      });
    });
    return out;
  }
  function guessMeta(pages) {
    var lines = pagesToLines(pages.slice(0, 2)), flat = lines.join(' ');
    var name = '', date = '';
    var m = flat.match(/第\s*\d+\s*回[^\s　]*?(?:\s*兼\s*[^\s　]+)?(?:大会|選手権|記録会|競技会)/) ;
    if (m) name = m[0].replace(/第\s*(\d+)\s*回\s*/, '第$1回').replace(/\s+/g, ' ');
    var d = flat.match(/(?:20\d\d|令和\s*\d+)\s*年\s*\d+\s*月\s*\d+\s*日(?:\s*[（(][^)）]{1,3}[)）])?/);
    if (d) date = d[0].replace(/\s+/g, '');
    return { name: name, date: date };
  }
  function parseNotes(pages) {
    var lines = pagesToLines(pages), text = lines.join('\n');
    var flat = lines.join('').replace(/\s+/g, '');
    var res = { track: null, field: null, relay: null, dist: null, relayOrder: null, place: null, others: [], specific: [], src: {} };
    // 「1500mは」「棒高跳は」のように特定の種目だけのルール → 全体には当てはめず「個別確認」にする
    var SPEC = /(\d{3,5}\s*m(?!\s*以上)(?:H|SC|W)?|棒高跳|走高跳|走幅跳|三段跳|砲丸投|円盤投|ハンマー投|やり投|競歩|混成)/;
    var GENERIC = /長距離|以上|ORD|トラック|フィールド/;
    var TWO = /(\d+)\s*分\s*前\D{0,12}?(\d+)\s*分\s*前/;
    var hasCall = /招集/.test(flat);
    if (!hasCall) return res;
    lines.forEach(function (l, i) {
      var m = l.match(TWO); if (!m) return;
      var a = +m[1], b = +m[2]; if (a <= b) return;
      var hdr = '';
      for (var k = i - 1; k >= Math.max(0, i - 4); k--) { if (/招集(開始|完了)/.test(lines[k])) { hdr = lines[k] + ' ／ '; break; } }
      if (/リレー/.test(l) && !/オーダー/.test(l) && !res.relay) { res.relay = [a, b]; res.src.relay = hdr + l; }
      else if (SPEC.test(l) && !GENERIC.test(l)) res.specific.push(hdr + l);
      else if (/長距離|\d{4}\s*m\s*以上|ORD/.test(l) && !res.dist) { res.dist = [a, b]; res.src.dist = hdr + l; }
      else if (/トラック/.test(l) && !res.track) { res.track = [a, b]; res.src.track = hdr + l; }
      else if (/フィールド/.test(l) && !res.field) { res.field = [a, b]; res.src.field = hdr + l; }
      else res.others.push(l);
    });
    // 「トラック競技は競技開始の30分前から20分前まで」型
    if (!res.track) { var t = flat.match(/トラック[^。]{0,30}?(\d+)分前(?:から|~|〜|～)(\d+)分前[^。]*。?/); if (t) { res.track = [+t[1], +t[2]]; res.src.track = t[0]; } }
    if (!res.field) { var f = flat.match(/フィールド[^。]{0,30}?(\d+)分前(?:から|~|〜|～)(\d+)分前[^。]*。?/); if (f) { res.field = [+f[1], +f[2]]; res.src.field = f[0]; } }
    if (!res.relay) { var rr = flat.match(/リレー(?:競走)?(?:の招集)?は[^。]{0,30}?(\d+)分前(?:から|~|〜|～)(\d+)分前[^。]*。?/); if (rr) { res.relay = [+rr[1], +rr[2]]; res.src.relay = rr[0]; } }
    if (!res.dist) { var dd = flat.match(/(?:長距離|\d{4}m以上)[^。]{0,30}?(\d+)分前(?:から|~|〜|～)(\d+)分前[^。]*。?/); if (dd) { res.dist = [+dd[1], +dd[2]]; res.src.dist = dd[0]; } }
    var sp = flat.match(/(?:\d{3,5}m(?!以上)(?:H|SC|W)?|棒高跳|走高跳|ハンマー投|競歩)(?:競技)?(?:は|の招集は)[^。]{0,30}?\d+分前[^。]*。?/g) || [];
    sp.forEach(function (x) { var xs = x.replace(/。$/, ''); if (!/長距離|以上/.test(x) && !res.specific.some(function (y) { var ys = y.replace(/\s+/g, ''); return ys.indexOf(xs) >= 0 || xs.indexOf(ys.replace(/。$/, '')) >= 0; })) res.specific.push(x); });
    var r = flat.match(/[^。※]*リレー[^。]*?(招集完了時刻|招集開始時刻|競技開始時刻|競技開始)の?(\d+)(時間|分)前まで[^。]*?オーダー[^。]*。?/) ||
            flat.match(/[^。※]*オーダー用紙[^。]*?(招集完了時刻|招集開始時刻|競技開始時刻|競技開始)の?(\d+)(時間|分)前まで[^。]*。?/);
    if (r) { res.relayOrder = { base: r[1].replace(/時刻$/, ''), minutes: (+r[2]) * (r[3] === '時間' ? 60 : 1) }; res.src.relayOrder = r[0]; }
    var p = flat.match(/(?:競技者)?招集所は([^。、]{2,30}?)(?:とする|です|に設ける|。)/) || flat.match(/招集場所[:：は]?([^。、]{2,30}?)(?:とする|です|。)/);
    if (p) { res.place = p[1]; res.src.place = p[0]; }
    return res;
  }

  /* ---------- 日付 ---------- */
  var WD = '日月火水木金土';
  function compact(l) {
    return l.replace(/(\d)\s+(?=[\d,])/g, '$1').replace(/,\s+(?=\d)/g, ',')
      .replace(/([\u3000-\u9fff\uff00-\uffef（）()])\s+(?=[\u3000-\u9fff\uff00-\uffef（）()])/g, '$1');
  }
  function findDates(pages, fname) {
    var lines = pagesToLines(pages).map(compact), out = [];
    lines.forEach(function (l, i) {
      var re = /(?:(20\d\d)\s*年|令和\s*(\d+|元)\s*年|(20\d\d)\s*[\/.\-]\s*)?\s*(\d{1,2})\s*(?:月|[\/.\-])\s*(\d{1,2})\s*日?\s*(?:[（(]\s*([日月火水木金土])[^)）]{0,4}[)）])?/g, m;
      while ((m = re.exec(l))) {
        var y = m[1] ? +m[1] : m[2] ? 2018 + (m[2] === '元' ? 1 : +m[2]) : m[3] ? +m[3] : null;
        var mo = +m[4], d = +m[5];
        if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
        if (!m[1] && !m[2] && !m[3] && !/月/.test(m[0])) continue;           // 「10/11」だけは時刻等と紛らわしいので年付きのみ
        var sc = 0;
        if (/期\s*日|日\s*時|開催日|大会日|開\s*催|競技日/.test(l)) sc += 10;
        if (/申込|締切|締め切|期限|振込|登録|年度|受付|発行|作成|改訂|更新/.test(l)) sc -= 10;
        if (y) sc += 2; if (m[6]) sc += 1;
        out.push({ y: y, m: mo, d: d, wd: m[6] || '', line: l, score: sc, idx: i });
      }
    });
    if (fname) {
      var f = fname.match(/(20\d\d)[\-_.]?(\d\d)[\-_.]?(\d\d)/);
      if (f && +f[2] >= 1 && +f[2] <= 12 && +f[3] >= 1 && +f[3] <= 31) out.push({ y: +f[1], m: +f[2], d: +f[3], wd: '', line: 'ファイル名「' + fname + '」', score: -1, fromName: true });
    }
    return out;
  }
  function pickDate(cands, nowYear) {
    // 年の無いものは他の候補か今年で補い、曜日が合うか確かめる
    var withY = cands.filter(function (c) { return c.y; });
    cands.forEach(function (c) {
      if (!c.y) { var o = withY.filter(function (w) { return w.m === c.m && w.d === c.d; })[0]; c.y = o ? o.y : nowYear; c.yGuess = !o; }
      if (c.wd) { var wd = WD[new Date(c.y, c.m - 1, c.d).getDay()]; c.wdOk = wd === c.wd; if (!c.wdOk) c.score -= 5; }
    });
    var best = cands.slice().sort(function (a, b) { return b.score - a.score; })[0];
    if (!best) return null;
    var iso = best.y + '-' + ('0' + best.m).slice(-2) + '-' + ('0' + best.d).slice(-2);
    var lab = function (c) { return c.y + '年' + c.m + '月' + c.d + '日（' + WD[new Date(c.y, c.m - 1, c.d).getDay()] + '）'; };
    // 点数が近い別の日付 → 候補として選べるようにする
    var alts = [], seen = {}; seen[lab(best)] = 1;
    cands.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (c) { var L = lab(c); if (!seen[L] && c.score >= best.score - 1 && c.score > 0) { seen[L] = 1; alts.push({ label: L, src: c.line }); } });
    var multi = cands.some(function (c) { return /\d{1,2}\s*日\s*(?:[(（][^)）]{1,3}[)）])?\s*[・、～〜~\-－]\s*(?:\d{1,2}\s*月\s*)?\d{1,2}\s*日/.test(nk(c.line || '')); });
    return { iso: iso, label: lab(best), src: best.line, fromName: !!best.fromName, yGuess: !!best.yGuess, score: best.score, alts: alts, multiDay: multi };
  }
  /* ---------- 参加料 ---------- */
  function catOf(s) {
    s = nk(s || '');
    if (/小学|小[1-6]/.test(s)) return '小学'; if (/中学|中[1-3]/.test(s)) return '中学';
    if (/高校生以上/.test(s)) return '高校以上'; if (/高校|高[1-3]/.test(s)) return '高校'; if (/大学|一般|マスターズ|シニア/.test(s)) return '一般';
    return '';
  }
  function parseFees(pages) {
    var lines = pagesToLines(pages).map(compact), res = { cats: {}, relay: null, program: null, other: [], src: [] };
    var start = -1;
    for (var i = 0; i < lines.length; i++) if (/参\s*加\s*[費料]|出\s*場\s*料|エントリー料/.test(lines[i]) && /円/.test(lines[i] + (lines[i + 1] || ''))) { start = i; break; }
    if (start < 0) return res;
    for (var j = start; j < Math.min(lines.length, start + 8); j++) {
      var l = lines[j]; if (!/円/.test(l)) { if (j > start + 1) break; continue; }
      if (j > start && /^\s*\d+\s*[.．、]/.test(l) && !/円/.test(l)) break;
      var nCat = (l.match(/小学生?|中学生?|高校生?|大学生?|一般/g) || []).length;
      // 区分と金額を左から順に読む。「中学生・高校生 1種目500円」のように複数区分に1つの金額 → 全区分に適用
      var re = /(小学生?|中学生?|高校生以上|高校生?|大学生?|一般(?:・大学)?|リレー|プログラム|登録料|記録証)|([\d,]+)\s*円/g, m, pend = [], lastCats = [], hit = false, lastIdx = 0;
      while ((m = re.exec(l))) {
        if (m[1]) { if (!pend.length) lastIdx = m.index; pend.push(m[1]); continue; }
        var v = +m[2].replace(/,/g, ''), between = l.slice(lastIdx, m.index);
        var unit = /1\s*人|一人|1\s*名|1\s*チーム/.test(between) ? (/チーム/.test(between) ? 'team' : 'person') : /種目/.test(between) ? 'event' : '';
        var ks = pend.length ? pend : []; pend = [];
        if (!ks.length) { if (unit === 'person') { res.perPerson = v; hit = true; } continue; }
        hit = true;
        var cats = ks.filter(function (k) { return !/^(リレー|プログラム|登録料|記録証)$/.test(k); });
        if (ks.indexOf('リレー') >= 0) { if (lastCats.length && nCat === lastCats.length && !cats.length) lastCats.forEach(function (c) { (res.cats[c] = res.cats[c] || {}).relay = v; }); else res.relay = v; }
        else if (ks.indexOf('プログラム') >= 0) res.program = v;
        else if (ks.some(function (k) { return /登録料|記録証/.test(k); })) res.other.push(ks.join('・') + ' ' + v + '円');
        if (cats.length) { lastCats = cats.map(catOf); lastCats.forEach(function (c) { var o = res.cats[c] = res.cats[c] || {}; o.ind = v; o.unit = unit; }); }
        lastIdx = m.index + m[0].length;
      }
      if (hit) res.src.push(l);
    }
    if (res.cats['高校以上']) { ['高校', '一般'].forEach(function (c) { res.cats[c] = res.cats[c] || Object.assign({}, res.cats['高校以上']); }); delete res.cats['高校以上']; }
    if (res.relay != null) Object.keys(res.cats).forEach(function (c) { if (res.cats[c].relay == null) res.cats[c].relay = res.relay; });
    return res;
  }
  return { roundKind: roundKind, catOf: catOf, findDates: findDates, pickDate: pickDate, parseFees: parseFees, guessMeta: guessMeta, parseNotes: parseNotes, pagesToLines: pagesToLines, roundNorm: roundNorm, toWords: toWords, parseStartList: parseStartList, parseTimetable: parseTimetable, parseTitle: parseTitle,
    normDisc: normDisc, matchSegs: matchSegs, timeFor: timeFor, nk: nk };
})();
if (typeof module !== 'undefined') module.exports = MeetParser;
