/* ===== LANE LOG：大会結果（PDF・HTML・貼り付け）の読み取りと自己ベスト（座標ベース・AI不使用・推測で補わない） ===== */
var ResultParser = (function () {
  'use strict';
  var nk = function (s) { return (s || '').normalize('NFKC'); };
  var HALFKANA = /^[\uff61-\uff9f\s]+$/;
  var STATUS = /^(DNS|DNF|DQ|NM|NR|棄権|欠場|失格|記録なし|途中棄権)$/;
  var MARK = /^(\d{1,2}:\d{2}[.:]\d{1,2}|\d{1,3}[.:]\d{2}|\d{1,2}[mｍ]\d{2}|\d{1,2}\.\d{2}m|\d{3,5}点?)$/;   // 10.47 / 4:12.34 / 5m74 / 5.74m / 4520点
  var WIND = /^[+\-±]?\d{1,2}\.\d$/;
  var PREF = /^(北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)$/;
  var TITLE = /(男子|女子|男|女|混合).{0,14}?(\d{2,5}\s*m\s*(H|SC|W)?|\d{2,5}\s*ｍ|走幅跳|走高跳|三段跳|棒高跳|砲丸投|円盤投|ハンマー投|やり投|ジャベリックスロー|ボール投|競歩|リレー|十種|八種|七種|四種|混成)/;
  var ROUND = /(タイムレース上位\d+位|タイムレース総合結果|タイムレース総合|ﾀｲﾑﾚｰｽ総合結果|ﾀｲﾑﾚｰｽ総合|総合結果|タイムレース|タイムレ-ス|予選|準決勝|決勝|ﾀｲﾑﾚｰｽ|オープン|順位決定)/;

  // 「11.76」「11.76 [11.758] -2.4」「22.42/+0.4」「5m20 +1.3」→ 記録と風に分ける（[ ] の中の1/1000秒は使わない）
  function cleanMark(s) {
    s = nk(s).replace(/\[[^\]]*\]/g, ' ').replace(/[()（）]/g, '').trim();
    var m = s.match(/^(\S+?)\/([+\-±]?\d{1,2}\.\d)$/);
    if (m) return { mark: m[1], wind: m[2] };
    var t = s.split(/\s+/);
    if (t.length > 1 && (MARK.test(t[0]) || STATUS.test(t[0]))) {
      var w = t.slice(1).filter(function (x) { return WIND.test(x); })[0];
      return { mark: t[0], wind: w != null ? w : null };
    }
    return { mark: s, wind: null };
  }
  function isMark(s) { var c = cleanMark(s).mark; return MARK.test(c) || STATUS.test(c); }
  function windNum(s) { if (s == null || s === '') return null; s = nk(s).replace('±', '').replace(/[()（）風:：\s]/g, ''); return WIND.test(s) || /^[+\-]?\d+\.\d$/.test(s) ? parseFloat(s) : null; }
  // 種目の正規化：表記ゆれ（全角・空白・区分名）を落として比べられる形に
  function normEvent(s) {
    s = nk(s).replace(/\s+/g, '').replace(/[（(](選|予|決)[)）]/g, '');
    var g = /女/.test(s.replace(/男女/, '')) && !/男子/.test(s) ? '女子' : (/男/.test(s) ? '男子' : '');
    var d = s.replace(/^.*?(男子|女子|男|女)/, '').replace(/^(小学|中学|高校|一般|共通|中学共通|高校・一般|高校一般|中学・高校|[1-6１-６]年|U\d+|\d年)+/g, '').replace(/^[・]+/, '');
    d = d.replace(/^(小学|中学|高校|一般|共通)+/, '').replace(/ｍ/g, 'm').replace(/ハードル/, 'H');
    return (g + d) || s;
  }
  function windApplies(ev) { var d = nk(ev).replace(/\s/g, ''); return /(^|\D)(50|60|80|100|110|200)m(H|$|\()/.test(d) || /(走幅跳|三段跳)/.test(d) && !/立/.test(d); }
  // 記録の数値化：時間は秒（小さいほど良い）、距離はm（大きいほど良い）
  function markValue(mark) {
    var s = nk(mark || '').replace('ｍ', 'm'), m;
    if ((m = s.match(/^(\d{1,2}):(\d{2})[.:](\d{1,2})$/))) return { v: +m[1] * 60 + +m[2] + +('0.' + m[3]), lower: true };
    if ((m = s.match(/^(\d{1,3})[.:](\d{2})$/))) return { v: +m[1] + +m[2] / 100, lower: true };
    if ((m = s.match(/^(\d{1,2})m(\d{2})$/)) || (m = s.match(/^(\d{1,2})\.(\d{2})m$/))) return { v: +m[1] + +m[2] / 100, lower: false };
    if ((m = s.match(/^(\d{3,5})点?$/))) return { v: +m[1], lower: false };
    return null;
  }
  function parseGrade(s) {   // 「(3)」「(高3)」「(小6)」は学年。「(07)」のような2桁は生まれ年なので学年にしない
    var m = nk(s).match(/[(（]\s*([^()（）]*)\s*[)）]\s*$/); if (!m) return { name: s, grade: '', paren: '' };
    var p = m[1].trim(), g = /^(小|中|高|大)?[1-6]$/.test(p) ? p : '';
    return { name: s.slice(0, s.length - m[0].length).trim(), grade: g, paren: p };
  }
  function normSchool(s) { return nk(s).replace(/\s+/g, '').replace(/^\d+・/, '').replace(/^(東京)?[・]/, ''); }
  var SUF = /(高等学校|中学校|中等教育学校|高校|中学|学園|学院)?$/;
  function schoolBase(s) { return normSchool(s).replace(/(高等学校|中学校|高校|中学|高|中)$/, ''); }
  function matchSchool(rec, q) {
    var a = normSchool(rec), b = normSchool(q); if (!b) return false;
    if (a === b) return true;
    if (a.indexOf(b) !== 0) return false;
    return /^(高|中|高校|中学|中学校|高等学校|高等学校陸上部|中学陸上部|陸上部|陸上競技部|ＡＣ|AC)?$/.test(a.slice(b.length));
  }
  function nameKey(n) { return nk(n).replace(/[\s　・]/g, '').replace(/[髙]/g, '高').replace(/[﨑]/g, '崎'); }

  /* ---------- PDF（座標）：見出し行「順位 … 記録」から列の位置を決め、選手ごとのかたまりを読む ---------- */
  function toWords(items) {
    var out = [];
    items.forEach(function (it) {
      var s = it.str; if (!s || !s.trim()) return;
      var cw = s.length ? it.w / s.length : 0, re = /\S+/g, m;
      while ((m = re.exec(s))) out.push({ t: m[0], n: nk(m[0]), x: it.x + m.index * cw, y: it.y, w: m[0].length * cw, h: it.h });
    });
    return out;
  }
  function lines(words) {
    var ws = words.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), L = [];
    ws.forEach(function (w) { var l = L.length && Math.abs(L[L.length - 1].y - w.y) < 2.2 ? L[L.length - 1] : null; if (l) l.w.push(w); else L.push({ y: w.y, w: [w] }); });
    L.forEach(function (l) { l.w.sort(function (a, b) { return a.x - b.x; }); l.text = l.w.map(function (w) { return w.n; }).join(' '); });
    return L;
  }
  function headerCols(line, pageW) {
    var starts = line.w.filter(function (w) { return w.n === '順位'; });
    return starts.map(function (s, i) {
      var end = i + 1 < starts.length ? starts[i + 1].x - 2 : pageW + 1, c = { x0: s.x - 4, x1: end, y: line.y, rank: s.x };
      line.w.forEach(function (w) {
        if (w.x < s.x - 1 || w.x >= end) return;
        var n = w.n.replace(/\s/g, '');
        if (/^(レーン|試|試順|ORD|順番)$/.test(n)) c.lane = c.lane == null ? w.x : c.lane;
        else if (/^(ナンバー|Bib|No\.?|ゼッケン)$/i.test(n)) c.bib = w.x;
        else if (/^氏(名)?$/.test(n)) c.name = c.name == null ? w.x : c.name;
        else if (/^所(属)?$/.test(n)) c.team = c.team == null ? w.x : c.team;
        else if (/^記録$/.test(n)) c.mark = w.x;
        else if (/^(コメント|備考)$/.test(n)) c.cmt = w.x;
        else if (/^風(速|力)?$/.test(n)) c.wind = w.x;
        else if (/^\d回目$/.test(n)) c.trialEnd = w.x + w.w;
      });
      return c;
    }).filter(function (c) { return c.name != null && c.team != null && c.mark != null; });
  }
  function parsePdf(pages, opt) {
    opt = opt || {};
    var recs = [], warns = [], info = { pages: pages.length, headers: 0, skippedRelay: 0 }, ev = '', round = '', evY = -1;
    pages.forEach(function (pg, pi) {
      var L = lines(toWords(pg.items)), cols = [];
      var heat = {}, wind = {};   // 列ごとの「組」「風」
      var anchorsByCol = [];
      // 1回目：見出し・種目・組・風の位置を集める
      var events = [];
      L.forEach(function (l, li) {
        var t = l.text.replace(/\s+/g, ' ');
        if (/順位/.test(t) && /記録/.test(t)) { var hc = headerCols(l, pg.width); if (hc.length) { info.headers++; events.push({ y: l.y, type: 'hdr', cols: hc }); } return; }
        var big = l.w.some(function (w) { return w.h >= 10; });
        if (TITLE.test(t.replace(/\s/g, '')) && !/記録\s*[\d.]+|GR|大会記録|日本|東京高校記録|凡例/.test(t) && (big || li < 3) && t.length < 40) {
          events.push({ y: l.y, type: 'ev', v: t.replace(/^\s+|\s+$/g, '') });
        }
        var rm = t.replace(/\s/g, '').match(ROUND);
        if (rm && t.length < 40 && !/順位/.test(t)) events.push({ y: l.y, type: 'round', v: nk(rm[1]).replace('タイムレ-ス', 'タイムレース') });
        l.w.forEach(function (w) {
          var hm = w.n.match(/^(\d+)組$/); if (hm) events.push({ y: l.y, type: 'heat', x: w.x, v: +hm[1] });
          var wm = w.n.match(/^[(（]?風[:：]?\s*([+\-±]?\d+\.\d)[)）]?$/); if (wm) events.push({ y: l.y, type: 'wind', x: w.x, v: wm[1] });
        });
        // 「風:」「+1.6」が別の単語に分かれている場合
        for (var k = 0; k + 1 < l.w.length; k++) if (/^[(（]?風[:：]?$/.test(l.w[k].n) && WIND.test(l.w[k + 1].n.replace(/[)）]/g, ''))) events.push({ y: l.y, type: 'wind', x: l.w[k].x, v: l.w[k + 1].n.replace(/[)）]/g, '') });
      });
      events.sort(function (a, b) { return a.y - b.y; });
      // 2回目：見出しの下の行を列ごとに読む
      var hdrs = events.filter(function (e) { return e.type === 'hdr'; });
      if (!hdrs.length) return;
      hdrs.forEach(function (h, hi) {
        var yEnd = hi + 1 < hdrs.length ? hdrs[hi + 1].y - 1 : pg.height + 1;
        // この見出しより後に出た種目見出しが、この見出しより下・次の見出しより上にあれば、そこで切る
        var before = events.filter(function (e) { return e.y <= h.y; });
        before.forEach(function (e) { if (e.type === 'ev') { if (e.v !== ev) { ev = e.v; round = ''; } } if (e.type === 'round') round = e.v; });
        var evBreak = events.filter(function (e) { return e.type === 'ev' && e.y > h.y && e.y < yEnd; })[0];
        if (evBreak) yEnd = evBreak.y - 1;
        if (/リレー/.test(ev)) { info.skippedRelay++; return; }
        h.cols.forEach(function (c) {
          var hev = before.filter(function (e) { return e.type === 'heat' && e.x >= c.x0 - 8 && e.x < c.x1 && h.y - e.y < 30; }).pop();
          if (!hev) hev = before.filter(function (e) { return e.type === 'heat' && h.y - e.y < 30; }).pop();
          var wev = before.filter(function (e) { return e.type === 'wind' && e.x >= c.x0 - 8 && e.x < c.x1 && h.y - e.y < 30; }).pop();
          var ws = [];
          L.forEach(function (l) { if (l.y > h.y + 2 && l.y < yEnd) l.w.forEach(function (w) { if (w.x >= c.x0 && w.x < c.x1) ws.push(w); }); });
          var bibX = c.bib != null ? c.bib : (c.lane != null ? c.lane + 12 : c.rank + 25);
          var anchors = ws.filter(function (w) { return /^\d{1,5}$/.test(w.n) && w.x >= bibX - 14 && w.x < c.name - 1; });
          // 同じ行に2つ以上（レーンとナンバーが近い）なら、右側（ナンバー）を使う
          anchors = anchors.filter(function (a) { return !anchors.some(function (b) { return b !== a && Math.abs(b.y - a.y) < 1.6 && b.x > a.x; }); });
          anchors.sort(function (a, b) { return a.y - b.y; });
          anchors.forEach(function (a, ai) {
            // 上の行（フリガナ・漢字）は前の選手との間の6割、下の行は次の選手との間の4割までをこの選手のものとする
            var top = ai ? a.y - 0.58 * (a.y - anchors[ai - 1].y) : h.y + 2, bot = ai + 1 < anchors.length ? a.y + 0.42 * (anchors[ai + 1].y - a.y) : Math.min(yEnd, a.y + 26);
            var bw = ws.filter(function (w) { return w.y > top && w.y <= bot; });
            var same = bw.filter(function (w) { return Math.abs(w.y - a.y) < 1.6; });
            var rank = same.filter(function (w) { return /^\d{1,3}$/.test(w.n) && w.x < (c.lane != null ? c.lane - 2 : a.x - 2) && w !== a; })[0];
            var lane = same.filter(function (w) { return /^\d{1,2}$/.test(w.n) && c.lane != null && w.x >= c.lane - 6 && w.x < a.x && w !== a && w !== rank; })[0];
            var nameW = bw.filter(function (w) { return w.x >= c.name - 4 && w.x < c.team - 3; });
            var byLine = {}; nameW.forEach(function (w) { var k = Math.round(w.y); (byLine[k] = byLine[k] || []).push(w); });
            var kanji = '', kana = '';
            Object.keys(byLine).sort(function (p, q) { return p - q; }).forEach(function (k) {
              var s = byLine[k].map(function (w) { return w.t; }).join(' ').trim();
              if (HALFKANA.test(s)) { if (!kana) kana = nk(s); } else if (!kanji) kanji = nk(s).replace(/\s+/g, ' ');
            });
            var markZone0 = Math.max(c.team + 8, c.trialEnd || 0);
            var markZone1 = c.cmt != null ? c.cmt - 2 : c.x1;
            var teamW = bw.filter(function (w) { return w.x >= c.team - 6 && w.x < (c.trialEnd ? c.trialEnd - 60 : c.mark + 30) && !isMark(w.n) && !WIND.test(w.n); });
            var teamSame = teamW.filter(function (w) { return Math.abs(w.y - a.y) < 1.6; });
            var team = (teamSame.length ? teamSame : teamW).map(function (w) { return w.n; }).join('').replace(/\s/g, '');
            if (PREF.test(team)) team = '';
            if (!teamSame.length) team = teamW.filter(function (w) { return !PREF.test(w.n.replace(/\s/g, '')); }).map(function (w) { return w.n; }).join('').replace(/\s/g, '').replace(new RegExp('^(' + PREF.source.slice(2, -2) + ')(?=.)'), function (p) { return teamW.length > 1 ? '' : p; });
            var marks = bw.filter(function (w) { return w.x >= markZone0 && w.x < markZone1 && MARK.test(cleanMark(w.n).mark); }).sort(function (p, q) { return p.y - q.y || p.x - q.x; });
            var stat = bw.filter(function (w) { return w.x >= c.team + 8 && STATUS.test(cleanMark(w.n).mark); })[0];
            var cmt = c.cmt != null ? bw.filter(function (w) { return w.x >= c.cmt - 2 && !STATUS.test(w.n); }).map(function (w) { return w.n; }).join(' ') : '';
            var mk = marks.length ? cleanMark(marks[marks.length - 1].n) : null;
            var mark = mk ? mk.mark : (stat ? cleanMark(stat.n).mark : '');
            var w = mk && mk.wind != null ? mk.wind : null;
            if (w == null && marks.length) { var mw = marks[marks.length - 1]; var under = bw.filter(function (x) { return WIND.test(x.n) && x.y > mw.y + 2 && Math.abs(x.x + x.w - (mw.x + mw.w)) < 12; })[0]; if (under) w = under.n; }
            if (w == null && c.wind != null) { var wc = same.filter(function (x) { return WIND.test(x.n) && x.x >= c.wind - 10; })[0]; if (wc) w = wc.n; }
            if (w == null && wev && !/走幅跳|三段跳|跳|投/.test(ev)) w = wev.v;
            var g = parseGrade(kanji || '');
            var r = { event: nk(ev).replace(/\s+/g, ' ').trim(), round: round, heat: hev ? hev.v : '', rank: rank ? +rank.n : '', lane: lane ? +lane.n : '', bib: a.n, name: g.name || kanji, kana: kana, grade: g.grade, team: team, mark: mark, wind: w != null ? String(nk(w)).replace('±', '') : '', comment: cmt, page: pi + 1 };
            if (opt.school && !matchSchool(r.team, opt.school)) return;
            var probs = [];
            if (!r.name) probs.push('氏名');
            if (!r.mark) probs.push('記録');
            if (!r.event) probs.push('種目');
            if (!r.team) probs.push('所属');
            if (r.mark && !STATUS.test(r.mark) && windApplies(r.event) && r.wind === '') probs.push('風');
            if (probs.length) warns.push((pi + 1) + 'ページ ' + (r.event || '種目不明') + ' ' + (r.name || r.kana || ('No.' + r.bib)) + '：' + probs.join('・') + 'を読み取れませんでした');
            r.warn = probs.join('・');
            recs.push(r);
          });
        });
      });
    });
    if (!info.headers) warns.unshift('結果の表（「順位」「氏名」「所属」「記録」の見出し）が見つかりませんでした。対応していない形式か、スキャン（画像）のPDFかもしれません。');
    if (info.skippedRelay) warns.push('リレーの表は、この版では読み取りません（' + info.skippedRelay + 'か所）。');
    return { recs: mergeOverall(dedupe(recs)), warns: warns, info: info };
  }
  // 「タイムレース総合」の行は、同じ選手・同じ記録の組の行に「総合順位」として付ける（同じ記録を2回数えない）
  function mergeOverall(recs) {
    var out = [];
    recs.forEach(function (r) {
      var sum = /総合|上位/.test(r.round) || r.heat === '' && recs.some(function (x) { return x !== r && x.heat !== '' && x.round === r.round && normEvent(x.event) === normEvent(r.event) && nameKey(x.name || x.kana) === nameKey(r.name || r.kana) && x.mark === r.mark; });
      if (!sum) { out.push(r); return; }
      var m = recs.filter(function (x) { return x !== r && !/総合|上位/.test(x.round) && x.heat !== '' && normEvent(x.event) === normEvent(r.event) && nameKey(x.name || x.kana) === nameKey(r.name || r.kana) && x.mark === r.mark; })[0];
      if (m) { m.overall = r.rank; if (!m.wind && r.wind) m.wind = r.wind; } else out.push(r);
    });
    return out;
  }

  /* ---------- 表（HTMLの table・貼り付けた文章）：見出しの文字から列を決める ---------- */
  // stream: [{type:'text', v:'…'} | {type:'row', cells:['…',…], th:bool}]
  function parseCells(stream, opt) {
    opt = opt || {};
    var recs = [], warns = [], ev = '', round = '', heat = '', wind = '', map = null, meet = { name: '', date: '' }, info = { headers: 0, skippedRelay: 0 };
    function title(s) {
      s = nk(s).replace(/\s+/g, ' ').trim(); if (!s) return;
      if (!meet.name && /(大会|選手権|記録会|競技会)/.test(s) && s.length < 80 && !/(画面|一覧表)/.test(s)) meet.name = s.replace(/^(大会名|大会)[:：]\s*/, '');
      if (!meet.date) { var d = s.match(/(20\d\d)\s*[年\/.-]\s*(\d{1,2})\s*[月\/.-]\s*(\d{1,2})/); if (d && !/(更新|出力|印刷|作成)/.test(s)) meet.date = d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2); }
      var wm = s.match(/風\s*[:：]?\s*([+\-±]?\d+\.\d)/); if (wm && s.length < 30) wind = wm[1];
      if (TITLE.test(s.replace(/\s/g, '')) && s.length < 60 && !/(記録\s*\d|GR|大会記録|凡例|画面へ|へ$|この画面)/.test(s)) {
        var hm = s.match(/(\d+)\s*組/); var rm = s.replace(/\s/g, '').match(ROUND);
        ev = s.replace(ROUND, '').replace(/\d+\s*組.*$/, '').replace(/全\d+組/, '').trim(); round = rm ? nk(rm[1]) : ''; heat = hm ? +hm[1] : ''; wind = ''; map = null;
      } else {
        var hm2 = s.match(/^(\d+)\s*組\b/); if (hm2) { heat = +hm2[1]; wind = ''; var w2 = s.match(/風\s*[:：]?\s*([+\-±]?\d+\.\d)/); if (w2) wind = w2[1]; }
      }
    }
    stream.forEach(function (it) {
      if (it.type === 'text') { title(it.v); return; }
      var raw = it.cells.map(function (c) { return nk(c).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); });
      var cells = raw.map(function (c) { return c.replace(/\s+/g, ' '); });
      var j = cells.join('|');
      if (/順位/.test(j) && /記録/.test(j) && /(氏名|氏 名|選手)/.test(j.replace(/\s/g, ' '))) {
        map = { n: cells.length, span: {} }; info.headers++;
        cells.forEach(function (c, i) {
          var s = c.replace(/\s/g, '');
          if (s === '順位') map.rank = i; else if (/^(レーン|試順|試|順番|ORD)$/.test(s)) map.lane = i; else if (/^(Bib|ナンバー|No\.?|ゼッケン)$/i.test(s)) map.bib = i;
          else if (/^(氏名|選手名|選手)$/.test(s)) { if (map.name == null) map.name = i; else map.kana = i; } else if (/^(フリガナ|カナ|ヨミ)$/.test(s)) map.kana = i;
          else if (/^(所属|チーム|学校)$/.test(s)) map.team = i; else if (s === '記録') map.mark = i;
          else if (/^(コメント|備考)$/.test(s)) map.cmt = i; else if (/^風(速|力)?$/.test(s)) map.wind = i; else if (/^学年$/.test(s)) map.grade = i; else if (/^組$/.test(s)) map.heat = i;
        });
        return;
      }
      if (!map || map.name == null || map.mark == null) { cells.forEach(title); return; }
      if (/リレー/.test(ev)) { info.skippedRelay++; return; }
      // 貼り付けでは見出しの「氏名」が1つでも、行は漢字・カナの2列になっていることがある（見出しより1列多い）
      var extra = map.kana == null ? cells.length - map.n : 0, off = function (i) { return i == null ? null : (i > map.name ? i + Math.max(0, extra) : i); };
      var get = function (i) { i = off(i); return i == null || i >= cells.length ? '' : cells[i]; };
      var name = get(map.name), kana = map.kana != null ? get(map.kana) : (extra >= 1 ? cells[map.name + 1] || '' : '');
      var nl = (raw[off(map.name)] || '').split('\n');   // 1つのセルに「漢字(学年)」と改行して「カナ」
      if (nl.length > 1) { name = nl[0]; if (!kana) kana = nl.slice(1).join(' '); }
      if (kana && !/^[ァ-ヶー\s・]+$/.test(kana)) kana = '';
      if (!name || /^\d+$/.test(name) && !get(map.mark)) return;
      var g = parseGrade(name);
      var mk = cleanMark(get(map.mark)), cmt = get(map.cmt), mark = mk.mark;
      if (!mark && STATUS.test(cmt.split(' ')[0])) { mark = cmt.split(' ')[0]; cmt = cmt.split(' ').slice(1).join(' '); }
      var badMark = mark && !isMark(mark);
      var w = mk.wind != null ? mk.wind : (map.wind != null ? get(map.wind) : wind);
      if (/跳|投/.test(ev) && map.wind == null && mk.wind == null) w = '';
      var team = get(map.team);
      var hc = map.heat != null ? (get(map.heat).match(/\d+/) || [''])[0] : ''; var r = { event: ev, round: round, heat: hc ? +hc : heat, rank: /^\d+$/.test(get(map.rank)) ? +get(map.rank) : '', lane: /^\d+$/.test(get(map.lane)) ? +get(map.lane) : '', bib: get(map.bib), name: g.name.replace(/\s+/g, ' '), kana: kana, grade: g.grade || get(map.grade), team: team, mark: mark, wind: (w || '').replace('±', '').replace(/[()（）]/g, ''), comment: cmt };
      if (opt.school && !matchSchool(team, opt.school)) return;
      var probs = []; if (badMark) { probs.push('記録の形（「' + r.mark + '」）'); r.mark = ''; } else if (!r.mark) probs.push('記録'); if (!r.event) probs.push('種目'); if (r.mark && !STATUS.test(r.mark) && windApplies(r.event) && r.wind === '') probs.push('風');
      if (probs.length) warns.push((r.event || '種目不明') + ' ' + r.name + '：' + probs.join('・') + 'を読み取れませんでした');
      r.warn = probs.join('・');
      recs.push(r);
    });
    if (!info.headers) warns.unshift('結果の表（「順位」「氏名」「記録」の見出し）が見つかりませんでした。');
    if (info.skippedRelay) warns.push('リレーの表は、この版では読み取りません。');
    return { recs: mergeOverall(dedupe(recs)), warns: warns, meet: meet, info: info };
  }
  // 貼り付けた文章 → stream（タブ区切りなら表の行、そうでなければ文章）
  function textToStream(txt) {
    var L = String(txt || '').replace(/\r/g, '').split('\n'), out = [], H = 0;
    for (var i = 0; i < L.length; i++) {
      var l = L[i];
      if (l.indexOf('\t') >= 0) {
        var c = l.split('\t');
        if (/順位/.test(l) && /記録/.test(l)) { H = c.length; out.push({ type: 'row', cells: c }); continue; }
        // セルの中の改行（「11.73」改行「-2.1」）で行が切れている → 見出しの列数になるまで次の行をつなぐ
        var prev = out[out.length - 1];
        if (H && c.length <= 2 && prev && prev.type === 'row' && prev.cells.length < H + 2) { prev.cells[prev.cells.length - 1] += '\n' + c[0]; prev.cells = prev.cells.concat(c.slice(1)); continue; }
        for (var j = 0; H && c.length < H && j < 3 && i + 1 < L.length && L[i + 1].trim() !== '' && L[i + 1].split('\t').length < H - 1; j++) { i++; var nx = L[i].split('\t'); c[c.length - 1] += '\n' + nx[0]; c = c.concat(nx.slice(1)); }
        out.push({ type: 'row', cells: c });
        continue;
      }
      var s = l.trim(); if (!s) continue;
      if (H && /^[^\t]+$/.test(s) && /^(\d+組|.*(男子|女子))/.test(s)) H = H;   // 見出しの列数はそのまま
      out.push({ type: 'text', v: s, raw: true });
    }
    return out;
  }
  // タブの無い文章から：「順位 …」の後の行を空白で分けて読む（氏名(学年) を目印にする）
  function parsePlain(txt, opt) {
    var st = textToStream(txt);
    if (st.some(function (x) { return x.type === 'row'; })) return parseCells(st, opt);
    var out = [], inTable = false;
    st.forEach(function (x) {
      var s = nk(x.v);
      if (/順位/.test(s) && /記録/.test(s)) { inTable = true; out.push({ type: 'row', cells: ['順位', 'レーン', 'Bib', '氏名', 'カナ', '所属', '記録', 'コメント'] }); return; }
      var m = inTable && s.match(/^(\d{1,3})?\s*(\d{1,2})\s+(\d{1,5})\s+(\S+\s?\S*?[(（][^)）]+[)）])\s+([ｱ-ﾟ\uff61-\uff9f ]+?|[ァ-ヶー ]+?)?\s*(\S+)\s+(\S+)(?:\s+(.*))?$/);
      if (m) { out.push({ type: 'row', cells: [m[1] || '', m[2], m[3], m[4], m[5] || '', m[6], STATUS.test(m[7]) ? '' : m[7], (STATUS.test(m[7]) ? m[7] + ' ' : '') + (m[8] || '')] }); return; }
      if (inTable && !/^\d/.test(s)) inTable = false;
      out.push({ type: 'text', v: x.v });
    });
    var res = parseCells(out, opt);
    return res;
  }
  function dedupe(recs) {
    var seen = {}, out = [];
    recs.forEach(function (r) { var k = [normEvent(r.event), r.round, r.heat, nameKey(r.name || r.kana), r.mark].join('|'); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    return out;
  }

  /* ---------- 自己ベスト ---------- */
  function athleteKey(r) { return nameKey(r.name || r.kana) + '@' + schoolBase(r.team); }
  function windClass(r) {   // 'ok' 公認対象 / 'aid' 追い風参考 / 'unk' 風不明 / 'na' 風の無い種目
    if (!windApplies(r.event)) return 'na';
    var w = windNum(r.wind); if (w == null) return 'unk';
    return w > 2.0 ? 'aid' : 'ok';
  }
  // recs: 日付つきの記録。各記録に pb（'PB'更新／'初'）と、選手×種目のベストを返す
  function computeBests(recs) {
    var groups = {};
    recs.forEach(function (r) { var k = athleteKey(r) + '|' + normEvent(r.event); (groups[k] = groups[k] || []).push(r); });
    var bests = [], flags = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0); });
      var best = null, bestAid = null;
      g.forEach(function (r) {
        var mv = markValue(r.mark); if (!mv) return;
        var wc = windClass(r);
        var better = function (b) { return !b || (mv.lower ? mv.v < b.mv.v : mv.v > b.mv.v); };
        if (wc === 'ok' || wc === 'na') {
          if (better(best)) { flags[r.id] = best ? 'PB' : '初'; best = { r: r, mv: mv }; }
        } else if (better(bestAid)) bestAid = { r: r, mv: mv };
      });
      var any = g[0];
      bests.push({ key: athleteKey(any), name: any.name || any.kana, team: any.team, event: normEvent(any.event), eventLabel: any.event, best: best && best.r, ref: bestAid && (!best || (bestAid.mv.lower ? bestAid.mv.v < best.mv.v : bestAid.mv.v > best.mv.v)) ? bestAid.r : null, count: g.length });
    });
    return { bests: bests, flags: flags };
  }


  /* ---------- LANE LOG v0.3：シーズン・ランキング・歴代・PBの伸び ---------- */
  // シーズン＝学校の年度（4月〜翌3月）。2026-10-04 → 2026、2027-03-01 → 2026
  function seasonOf(date) { var m = String(date || '').match(/^(\d{4})-(\d{2})/); if (!m) return null; return +m[2] >= 4 ? +m[1] : +m[1] - 1; }
  function seasonLabel(y) { return y == null ? '' : y + '年度'; }
  function isOfficial(r) { var w = windClass(r); return (w === 'ok' || w === 'na') && !!markValue(r.mark); }
  function gradeNum(g) { var m = nk(g || '').match(/(\d)/); return m ? +m[1] : null; }
  function isBetter(a, b) { return !b || (a.lower ? a.v < b.v : a.v > b.v); }
  function byDate(a, b) { return (a.date || '').localeCompare(b.date || '') || (a.order || 0) - (b.order || 0); }
  // 改善幅：時間は短くなった分、距離・得点は伸びた分（どちらも正の数で返す）
  function improvement(prevMark, newMark) {
    var a = markValue(prevMark), b = markValue(newMark); if (!a || !b || a.lower !== b.lower) return null;
    return Math.round((a.lower ? a.v - b.v : b.v - a.v) * 100) / 100;
  }
  function fmtImprovement(d, lower) { if (d == null) return ''; return (lower ? '−' : '+') + d.toFixed(2) + (lower ? '秒' : ''); }
  // 各記録の PB 情報：{ flag:'PB'|'初', prev: 直前の公認ベストの記録, diff: 改善幅 }
  function pbDetails(recs) {
    var groups = {}, out = {};
    recs.forEach(function (r) { var k = athleteKey(r) + '|' + normEvent(r.event); (groups[k] = groups[k] || []).push(r); });
    Object.keys(groups).forEach(function (k) {
      var best = null;
      groups[k].slice().sort(byDate).forEach(function (r) {
        if (!isOfficial(r)) return;
        var mv = markValue(r.mark);
        if (isBetter(mv, best && best.mv)) {
          out[r.id] = best ? { flag: 'PB', prev: best.r, diff: improvement(best.r.mark, r.mark), lower: mv.lower } : { flag: '初', prev: null, diff: null, lower: mv.lower };
          best = { r: r, mv: mv };
        }
      });
    });
    return out;
  }
  // 部内ランキング：opt.season（年度・null で全期間）、opt.grade（1/2/3・null で全学年）
  // 学年は対象期間の中でいちばん新しい記録の学年で判定する
  function ranking(recs, opt) {
    opt = opt || {};
    var rs = recs.filter(function (r) { return opt.season == null || seasonOf(r.date) === opt.season; });
    var groups = {};
    rs.forEach(function (r) { var ev = normEvent(r.event), k = athleteKey(r); ((groups[ev] = groups[ev] || {})[k] = groups[ev][k] || []).push(r); });
    var out = {};
    Object.keys(groups).forEach(function (ev) {
      var list = [];
      Object.keys(groups[ev]).forEach(function (k) {
        var g = groups[ev][k].slice().sort(byDate), last = g[g.length - 1], best = null;
        var gr = null; for (var i = g.length - 1; i >= 0 && gr == null; i--) gr = gradeNum(g[i].grade);
        if (opt.grade != null && gr !== opt.grade) return;
        g.forEach(function (r) { if (isOfficial(r)) { var mv = markValue(r.mark); if (isBetter(mv, best && best.mv)) best = { r: r, mv: mv }; } });
        if (best) list.push({ key: k, name: last.name || last.kana, team: last.team, grade: gr, best: best.r, mv: best.mv, count: g.length });
      });
      list.sort(function (a, b) { return a.mv.lower ? a.mv.v - b.mv.v : b.mv.v - a.mv.v; });
      var prev = null; list.forEach(function (x, i) { x.rank = prev && prev.mv.v === x.mv.v ? prev.rank : i + 1; prev = x; });
      if (list.length) out[ev] = list;
    });
    return out;
  }
  // 歴代記録：種目ごとに、選手ひとりにつき公認ベスト1つで上位 n 人（卒業生も含む）
  function allTimeTop(recs, n) {
    var r = ranking(recs, {}), out = {};
    Object.keys(r).forEach(function (ev) { out[ev] = r[ev].slice(0, n || 10).map(function (x) { return Object.assign({}, x, { season: seasonOf(x.best.date), year: String(x.best.date || '').slice(0, 4) }); }); });
    return out;
  }
  // 選手のページ：種目ごとに公認ベスト・参考・最近の記録・グラフ用の点（公認記録を日付順）
  function athleteProfile(recs, key) {
    var mine = recs.filter(function (r) { return athleteKey(r) === key; });
    if (!mine.length) return null;
    var cb = computeBests(mine), byEv = {};
    mine.forEach(function (r) { var ev = normEvent(r.event); (byEv[ev] = byEv[ev] || []).push(r); });
    var last = mine.slice().sort(byDate)[mine.length - 1];
    var events = cb.bests.map(function (b) {
      var g = byEv[b.event].slice().sort(byDate);
      var pts = g.filter(isOfficial).map(function (r) { return { date: r.date, v: markValue(r.mark).v, mark: r.mark }; });
      var any = g.map(function (r) { return markValue(r.mark); }).filter(Boolean)[0];
      return { event: b.event, eventLabel: b.eventLabel, best: b.best, ref: b.ref, count: b.count, recent: g.slice().reverse().slice(0, 5), points: pts, lower: any ? any.lower : true };
    }).sort(function (a, b) { return a.event < b.event ? -1 : a.event > b.event ? 1 : 0; });
    return { key: key, name: last.name || last.kana, kana: last.kana, team: last.team, grade: last.grade, events: events, count: mine.length };
  }

  /* ---------- 大会名の推測（ファイル名・資料の見出しから） ---------- */
  var GENERIC = /^(result|results|kekka|document|doc|scan|file|print|download|untitled|list|timeorder|preview|program|pdf|html?|無題|名称未設定|新しいファイル|プレビュー|一覧|資料|結果)$/i;
  var MEET_KW = /(大会|選手権|記録会|競技会|リレー|カーニバル|フェスティバル|陸上|学年別|新人戦|支部|区民|都民|総体|インターハイ|駅伝|予選)/;
  function pad2(n) { return ('0' + n).slice(-2); }
  function okDate(y, m, d) { y = +y; m = +m; d = +d; return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? y + '-' + pad2(m) + '-' + pad2(d) : ''; }
  function dateFromText(s) {
    s = nk(s || ''); var m;
    if ((m = s.match(/(20\d\d)\s*[年\/.\-_]\s*(\d{1,2})\s*[月\/.\-_]\s*(\d{1,2})/)) && okDate(m[1], m[2], m[3])) return okDate(m[1], m[2], m[3]);
    if ((m = s.match(/(?:^|[^\d])(20\d\d)(\d\d)(\d\d)(?!\d)/)) && okDate(m[1], m[2], m[3])) return okDate(m[1], m[2], m[3]);
    if ((m = s.match(/(?:令和|R)\s*(\d{1,2}|元)\s*[年.\/\-_]\s*(\d{1,2})\s*[月.\/\-_]\s*(\d{1,2})/i))) return okDate(2018 + (m[1] === '元' ? 1 : +m[1]), m[2], m[3]);
    return '';
  }
  function cleanMeetName(s) {
    s = nk(String(s || '')).replace(/\.(pdf|html?|txt|xlsx?|docx?|csv)$/ig, '');
    s = s.replace(/^(microsoft\s+(word|excel)\s*-\s*)/i, '').replace(/\.(xlsx?|docx?)$/i, '');
    s = s.replace(/[【\[][^】\]]*[】\]]/g, ' ');
    s = s.replace(/[_＿\-－‐―~〜+]+/g, ' ');
    s = s.replace(/[(（][^)）]*(修正|改訂|差替|差し替え|版)[^)）]*[)）]/g, ' ').replace(/^(?:R\d{1,2}|\d{2})(?=[^\d年月\/.\s])/i, '').replace(/(TT|タイテ)(?=[\s(（]|$)/g, ' ');
    s = s.replace(/[(（]\s*(\d{1,2}|コピー|copy|[月火水木金土日](・[月火水木金土日])*|祝)\s*[)）]/ig, ' ');
    s = s.replace(/(?:令和|R)\s*(\d{1,2}|元)\s*年?度?(\s*\d{1,2}\s*[月.\/]\s*\d{1,2}\s*日?)?/ig, ' ');
    s = s.replace(/20\d\d\s*[年\/.]\s*\d{1,2}\s*[月\/.]\s*\d{1,2}\s*日?/g, ' ').replace(/(?:^|\s)20\d{6}(?=\s|$)/g, ' ').replace(/(?:^|\s)\d{6}(?=\s|$)/g, ' ');
    s = s.replace(/20\d\d\s*年?度?/g, ' ').replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, ' ').replace(/(?:^|\s)\d{1,2}\/\d{1,2}(?=\s|$)/g, ' ');
    s = s.replace(/(?:^|\s)v\s*\d+(?=\s|$)/ig, ' ').replace(/(最終|確定|修正|再々|再|速報|暫定|公式|送付用|配布用|掲載用|HP用)版?/g, ' ');
    s = s.replace(/(大会要項|要項|プログラム|競技日程|タイムテーブル|注意事項|総合結果|結果一覧|リザルト|結果|記録一覧|記録表|記録(?!会))/g, ' ');
    s = s.replace(/(?:^|\s)(result|results|final|fix|copy)(?=\s|$)/ig, ' ');
    s = s.replace(/(?:^|\s)\d{1,2}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[・、,.\s]+|[・、,.\s]+$/g, '');
    return s;
  }
  function meetNameOk(s) { return s && s.length >= 2 && s.length <= 50 && !GENERIC.test(s) && !/^[\w\s.]+$/.test(s) && /[一-龯ぁ-んァ-ン]/.test(s); }
  // fileName: ファイル名、docName: 資料の見出しから拾った大会名（なければ空）。{name, date, from} を返す
  function meetSegment(s) {
    s = nk(s || ''); var m = s.match(/(第\s*\d+\s*回[^\s]*?(大会|選手権|記録会|競技会)[^\s]*(\s*兼\s*[^\s]+)?)/);
    return m ? m[1] : s;
  }
  function guessMeet(fileName, docName) {
    var f = cleanMeetName(fileName), d = cleanMeetName(meetSegment(docName)), name = '', from = '';
    var fOk = meetNameOk(f), dOk = meetNameOk(d), fKw = fOk && MEET_KW.test(f), dKw = dOk && /(大会|選手権|記録会|競技会)/.test(d);
    if (dKw) { name = d; from = 'doc'; }
    else if (fKw || (fOk && !dOk)) { name = f; from = 'file'; }
    else if (dOk) { name = d; from = 'doc'; }
    var md = (nk(fileName || '').match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/) || nk(fileName || '').match(/(?:^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/) || []);
    return { name: name, date: dateFromText(fileName) || dateFromText(docName), md: md.length ? +md[1] + '月' + +md[2] + '日' : '', from: from };
  }
  function recId(meetName, date, r) { return [nk(meetName).replace(/\s/g, ''), date, normEvent(r.event), r.round, r.heat, nameKey(r.name || r.kana), schoolBase(r.team), r.mark].join('|'); }
  return { parsePdf: parsePdf, parseCells: parseCells, parsePlain: parsePlain, textToStream: textToStream, normEvent: normEvent, markValue: markValue, windApplies: windApplies, windClass: windClass, windNum: windNum,
    computeBests: computeBests, athleteKey: athleteKey, matchSchool: matchSchool, recId: recId, normSchool: normSchool, schoolBase: schoolBase, nk: nk,
    guessMeet: guessMeet, seasonOf: seasonOf, seasonLabel: seasonLabel, isOfficial: isOfficial, gradeNum: gradeNum, improvement: improvement, fmtImprovement: fmtImprovement, pbDetails: pbDetails, ranking: ranking, allTimeTop: allTimeTop, athleteProfile: athleteProfile, cleanMeetName: cleanMeetName, dateFromText: dateFromText };
})();
if (typeof module !== 'undefined') module.exports = ResultParser;
