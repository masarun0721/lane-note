/* v0.26.50 1年分の記録をまとめる：大会予定の終わった大会ごとに、公開されている大会の一覧から結果のページをさがす（この端末が LANE NOTE の中継を通して読む）。
 * ・さがす先：gold.jaic.org の東京の一覧（東京陸協・加入団体／高体連／中体連。今の年度は各トップ、前の年度は「過去の記録」の年度別の一覧）と、江東区陸協の結果の一覧（PDF）
 * ・一覧のリンクの名前「大会名（9/19 大井,9/21,22 駒沢）」から日付・会場を読み、大会予定の日付（開始日〜終了日）と重なるものだけを候補にする
 * ・決めつけない：候補が1つで、名前（または日付と会場）が合うときだけ「見つかった」。2つ以上・名前が合わないときは先生が選ぶ（候補を確認）
 * ・ここでは読むだけ（保存しない）。選手のデータはどこにも送らない */
var LaneYear = (function () {
  var G = 'https://gold.jaic.org/jaic/member/tokyo/';
  // 今の年度の一覧（トップ）と、前の年度の一覧（年度 fy から URL）
  var HUBS = [
    { id: 'rk', label: '東京陸協・加入団体（gold.jaic.org）', div: '', now: G + 'top.htm', old: function (fy) { return G + 'record/' + fy + 'r.htm'; } },
    { id: 'kou', label: '東京高体連（gold.jaic.org）', div: '高校', now: G + 'index.htm', old: function (fy) { return G + 'record-kou/' + fy + 'r-kou/k' + String(fy).slice(2) + 'r.htm'; } },
    { id: 'chu', label: '東京中体連（gold.jaic.org）', div: '中学', now: G + 'cyuugaku/index.htm', old: function (fy) { return G + 'cyuugaku/record/' + String(fy).slice(2) + 'r.htm'; } },
    { id: 'koto', label: '江東区陸協（kotorikkyo.info）', div: '', prefix: '江東区', now: null, old: function (fy) { return 'https://www.kotorikkyo.info/result' + fy; } }
  ];
  var VEN = [['江戸川', /江戸川|えどりく|スピアーズ/], ['夢の島', /夢の島/], ['駒沢', /駒沢|駒澤/], ['上柚木', /上柚木/], ['大井', /大井/], ['世田谷', /世田谷|大蔵/], ['味スタ', /味の素|味スタ/], ['町田', /町田/], ['府中', /府中/], ['AGF', /AGF/i], ['練馬', /練馬/], ['昭和記念', /昭和記念/], ['荒川', /荒川/], ['神宮', /神宮/], ['熊谷', /熊谷/], ['茨城', /茨城|笠松|ケーズデンキ/], ['国立', /国立競技場/]];
  // 大会予定の短い名前 → 一覧での書き方（名前の比べに足すだけ）
  var ALIAS = [[/私学/, '私立'], [/都総体/, '総合体育'], [/通信陸上/, '通信'], [/都新人/, '新人'], [/都選抜/, '選抜']];
  function nk(s) { return String(s == null ? '' : s).normalize('NFKC').replace(/\u00a0/g, ' '); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function fyOf(day) { var y = +day.slice(0, 4), m = +day.slice(5, 7); return m >= 4 ? y : y - 1; }
  function addDays(d, k) { return new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10); }
  function ent(s) { return String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }); }
  function txt(h) { return nk(ent(String(h).replace(/<[^>]*>/g, ' '))).replace(/\s+/g, ' ').trim(); }
  /* 一覧の名前の中の日付（年がないものは年度 fy から：4〜12月＝fy年、1〜3月＝fy+1年）
     「8/17 大井・8/18～8/20 駒沢」「5/5大井 5/9,10,16,17駒沢」「4/24-26」「10/3・4」「2026/8/28・29」「10/11,12,11/9」 */
  function labelDays(s, fy) {
    s = nk(s); var out = {}, y = 0, m = 0, last = null, rng = false, re = /(?:(20\d\d)\/)?(\d{1,2})\/(\d{1,2})|(\d{1,2})|([~〜～\-‐－])|([^\d~〜～\-‐－]+)/g, x;
    var put = function (yy, mm, dd) {
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return;
      var yr = yy || (fy ? (mm >= 4 ? fy : fy + 1) : 0); if (!yr) return;
      var d = yr + '-' + pad(mm) + '-' + pad(dd);
      if (rng && last && last < d) { for (var t = addDays(last, 1), i = 0; t < d && i < 14; t = addDays(t, 1), i++) out[t] = 1; }
      out[d] = 1; last = d; rng = false;
    };
    while ((x = re.exec(s))) {
      if (x[3]) { if (x[1]) y = +x[1]; m = +x[2]; put(y, m, +x[3]); }
      else if (x[4]) { if (m) put(y, m, +x[4]); }
      else if (x[5]) { rng = !!last; }
      else if (x[6] && /[^\s,、・･]/.test(x[6])) { rng = false; if (!/^[\s,、・･日曜()月火水木金土祝]*$/.test(x[6])) { /* 会場などの言葉：月はそのまま（「5/5大井 5/9,10」） */ } }
    }
    return Object.keys(out).sort();
  }
  // 名前の中の（ ）で日付が入っているところ
  function dateParts(s) { var o = [], re = /[(（]([^()（）]*\d{1,2}\/\d{1,2}[^()（）]*)(?:[)）]|$)/g, x; s = nk(s); while ((x = re.exec(s))) o.push(x[1]); return o; }
  function venuesOf(s) { s = nk(s); return VEN.filter(function (v) { return v[1].test(s); }).map(function (v) { return v[0]; }); }
  function stripName(s) { return nk(s).replace(/^[^()（）]{0,12}[)）]\s*/, '').replace(/[(（][^()（）]*\d{1,2}\/\d{1,2}[^()（）]*(?:[)）]|$)/g, ' ').replace(/^[\s・･]+|[\s・･]+$/g, '').replace(/\s+/g, ' ').trim(); }
  function normName(s) {
    s = nk(s).toLowerCase().replace(/[(（][^()（）]*日目[^()（）]*[)）]/g, '').replace(/第\s*\d+\s*回/g, '').replace(/(令和|平成)\s*\d+\s*年度?/g, '').replace(/(19|20)\d{2}\s*年度?/g, '').replace(/年度/g, '');
    return s.replace(/陸上競技|陸上|競技会|競技|大会|兼/g, '').replace(/[\s　・･、。,.\-‐－―ー〜~「」『』【】\[\]()（）〈〉<>"'!！?？:：\/／&＆×]/g, '');
  }
  function bigrams(s) { var o = []; for (var i = 0; i < s.length - 1; i++) o.push(s.substr(i, 2)); return o; }
  // 大会予定の名前の2文字の組が、一覧の名前にどれだけ入っているか（0〜1）。予定の名前が短すぎて比べられないときは null
  function nameScore(plan, name) {
    var p = nk(plan), vs = [p], b = normName(name), best = null;
    ALIAS.forEach(function (a) { if (a[0].test(p)) vs.push(p.replace(a[0], a[1])); });
    vs.forEach(function (v) {
      var a = normName(v), bg = bigrams(a).filter(function (x, i, l) { return l.indexOf(x) === i; }); if (!bg.length) return;
      var sc = Math.round(bg.filter(function (x) { return b.indexOf(x) >= 0; }).length / bg.length * 100) / 100;
      if (best == null || sc > best) best = sc;
    });
    return best;
  }
  function branchOf(e) { var m = /\/(\d+)shibu\//.exec(e.url) || /第\s*([\d・.．]+)\s*支部/.exec(nk(e.name)); return m ? m[1].replace(/\D/g, '') : ''; }
  function abs(href, base) { try { return new URL(ent(href).trim(), base).href.replace(/#.*$/, ''); } catch (e) { return ''; } }
  /* 一覧のページ → [{ name, days:[YYYY-MM-DD], venues:[], url, kind:'meet'|'pdf', hub, div, fy }] */
  function parseIndex(hub, html, base, fy) {
    var out = [], by = {};
    if (hub.id === 'koto') {
      // 江東区陸協：「スプリングトライアル（2026/5/24）」のすぐあとの「競技結果」（PDF）
      var re = /<a\b[^>]*href\s*=\s*["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi, x, prev = 0;
      while ((x = re.exec(html))) {
        var lab = txt(x[2]), before = txt(html.slice(Math.max(prev, x.index - 3000), x.index)); prev = x.index + x[0].length;
        if (!/結果/.test(lab)) continue;
        var mm = before.match(/([^\s()（）]{1,30})\s*[(（]\s*(20\d\d\/\d{1,2}\/\d{1,2}[^()（）]*)[)）][^()（）]*$/); if (!mm) continue;
        var days = labelDays(mm[2], null); if (!days.length) continue;
        out.push({ name: (hub.prefix || '') + mm[1].replace(/^[\u200b\s]+/, ''), days: days, venues: [], url: abs(x[1], base), kind: 'pdf', hub: hub.id, src: hub.label, div: hub.div, fy: fy });
      }
      return out;
    }
    // リンクを順に。名前の（ ）が閉じないまま次のリンクに続く書き方（「…（10/3・4」「駒沢）」）は、前のリンクの名前につなぐ。同じリンク先は日付の読めた最初の1つ
    var ra = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, a, prevE = null, list = [];
    var open = function (s) { return (s.match(/[(（]/g) || []).length > (s.match(/[)）]/g) || []).length; };
    while ((a = ra.exec(html))) {
      var u = abs(a[1], base), t = txt(a[2]);
      if (prevE && open(prevE.raw) && t.length <= 20 && !/\d{1,2}\/\d{1,2}/.test(t)) { prevE.raw += ' ' + t; continue; }
      if (!/^https?:/.test(u) || !/\/kyougi\d*\.html?$/i.test(u)) { prevE = null; continue; }
      prevE = { raw: t, url: u }; list.push(prevE);
    }
    list.forEach(function (e) { if (!by[e.url]) { by[e.url] = 1; out.push(e); } else if (!labelDays(dateParts(by[e.url].raw || '').join(' '), fy).length) { } });
    return out.map(function (e) {
      var yf = (/\/(20\d\d)r(?:-kou)?\//.exec(e.url) || /\/record\/(20\d\d)\//.exec(e.url) || [])[1], f = yf ? +yf : fy, ps = dateParts(e.raw).join(' ');
      return { name: stripName(e.raw).slice(0, 120), days: labelDays(ps, f), venues: venuesOf(ps), url: e.url, kind: 'meet', hub: hub.id, src: hub.label, div: hub.div, fy: f };
    }).filter(function (e) { return e.days.length && e.name.replace(/[・\s]/g, '').length >= 2; });
  }
  /* 大会予定の期間に入る終わった大会（plan：{ key, meet, date, end, venue, div }） */
  function plansIn(plans, from, to, today) {
    return (plans || []).filter(function (p) { var e = p.end || p.date; return isDay(p.date) && p.date >= from && p.date <= to && e < today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.meet < b.meet ? -1 : 1; });
  }
  // 読む一覧（年度ごと）。今の年度はトップ、前の年度は過去の一覧
  function hubsFor(plans, today) {
    var fys = {}, cur = fyOf(today), out = [];
    plans.forEach(function (p) { fys[fyOf(p.date)] = 1; if (p.end) fys[fyOf(p.end)] = 1; });
    Object.keys(fys).sort().forEach(function (k) {
      var fy = +k; HUBS.forEach(function (h) {
        var u = fy >= cur && h.now ? h.now : h.old(fy); if (!u) return;
        if (!out.some(function (o) { return o.url === u; })) out.push({ hub: h, url: u, fy: fy });
      });
    });
    return out;
  }
  /* 1つの大会予定の候補。st：'found'（1つに決まる）・'pick'（先生が選ぶ）・'none'
     ・日付が重なる（大会予定の開始日〜終了日）・会場が分かっていれば同じ・区分（中学／高校）が分かっていれば一覧の区分と同じ
     ・名前：予定の名前の2文字の組が半分以上入る。名前が短すぎて比べられない（「都大会」）ときは会場が合うこと */
  function match(plan, entries) {
    var s = plan.date, e = plan.end && plan.end > plan.date ? plan.end : plan.date, pv = venuesOf(plan.venue || ''), seen = {};
    var c = (entries || []).filter(function (x) {
      if (seen[x.url]) return false;
      if (!x.days.some(function (d) { return d >= s && d <= e; })) return false;
      if (plan.div && x.div && plan.div !== x.div) return false;
      seen[x.url] = 1; return true;
    }).map(function (x) {
      var vOk = !pv.length || !x.venues.length ? null : pv.some(function (v) { return x.venues.indexOf(v) >= 0; });
      return Object.assign({}, x, { score: nameScore(plan.meet, x.name), venueOk: vOk });
    });
    var good = c.filter(function (x) { return x.venueOk !== false && (x.score == null ? x.venueOk === true : x.score >= 0.5); });
    var rank = function (a, b) { return (b.score || 0) - (a.score || 0) || (b.venueOk === true) - (a.venueOk === true) || (a.url < b.url ? -1 : 1); };
    good.sort(rank);
    if (good.length === 1) return { st: 'found', cands: good, why: good[0].score == null ? '日付と会場が一致' : '日付・名前' + (good[0].venueOk ? '・会場' : '') + 'が一致' };
    if (good.length > 1) return { st: 'pick', cands: good.slice(0, 6), why: '候補が' + good.length + 'つあります' };
    var weak = c.filter(function (x) { return x.venueOk !== false && (x.score || 0) > 0; }).sort(rank);
    if (weak.length) return { st: 'pick', cands: weak.slice(0, 6), why: '名前がよく似た大会はありません。同じ日の大会から選べます' };
    return { st: 'none', cands: [], why: c.length ? '同じ日の大会はありますが、会場か名前が合いません' : '一覧に同じ日の大会がありません' };
  }
  // 候補が2つ以上のとき：ほかの大会で決まった支部（第23支部など）と同じものに「おすすめ」の印（選ぶのは先生）
  function suggest(res, decided) {
    var br = {}; (decided || []).forEach(function (e) { var b = branchOf(e); if (b) br[b] = (br[b] || 0) + 1; });
    var top = Object.keys(br).sort(function (a, b) { return br[b] - br[a]; })[0];
    if (!top || res.st !== 'pick') return '';
    var hit = res.cands.filter(function (e) { return branchOf(e) === top; });
    return hit.length === 1 ? hit[0].url : '';
  }
  /* v0.26.51 速報ページ（gold）の競技一覧（kyougiN.html）：種目ごとのラウンド（予選・決勝・ﾀｲﾑﾚｰｽ・総合結果…）と、その結果のページのURL
     返すもの：[{ ev: '男子 ４００ｍ', rounds: [{ lab: '予選 7月25日', sogo: false, links: [URL, …] }, …] }]（ラウンドの名前の行のあとのリンクが、そのラウンドのページ） */
  function goldRounds(html, base) {
    var out = [], parts = String(html || '').split(/<a\s+name\s*=\s*["']?KY\d+["']?\s*>/i);
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i], e = p.indexOf('</a>'), ev = { ev: txt(e < 0 ? '' : p.slice(0, e)), rounds: [] }, cur = null;
      p.slice(e < 0 ? 0 : e + 4).split(/<br\s*\/?>|<hr[^>]*>/i).forEach(function (ln) {
        var hs = [], m, re = /<a\s[^>]*href\s*=\s*["']?([^"'\s>]+)/gi;
        while ((m = re.exec(ln))) { try { var u = new URL(ent(m[1]), base); u.hash = ''; if (/\/rel\d+\.html?$/i.test(u.pathname)) hs.push(u.href); } catch (er) { } }
        if (hs.length) { if (!cur) { cur = { lab: '', sogo: false, links: [] }; ev.rounds.push(cur); } cur.links = cur.links.concat(hs); return; }
        var t = txt(ln); if (!t || /^[(（]/.test(t) || /^結果$/.test(t)) return;
        cur = { lab: t, sogo: /総合|上位/.test(t), links: [] }; ev.rounds.push(cur);
      });
      ev.rounds = ev.rounds.filter(function (r) { return r.links.length; });
      if (ev.rounds.length) out.push(ev);
    }
    return out;
  }
  /* v0.26.51 結果のページに、この学校・クラブの選手がいそうか（いなければ、その種目の次のラウンドは読まない）
     いそう＝ページの文字（空白を除く）に学校名の本体（「中・高・中学校…」を除いたもの）があるか、行ごとに学校名が合う（match：アプリの学校名の比べ方）。迷うものは「いそう」にする */
  function pageHas(html, school, match) {
    var q = nk(school).trim(); if (!q) return true;
    var body = nk(ent(String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/?(td|th|tr|p|div|font|li)[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ')));
    var flat = body.replace(/[\s\u3000]+/g, ''), core = q.replace(/[\s\u3000]+/g, '').replace(/^(都立|区立|市立|県立|国立|私立)/, '').replace(/(高等学校|中学校|高校|中学|高|中)$/, '');
    if (core && flat.indexOf(core) >= 0) return true;
    if (!match) return !core;
    var ls = body.split('\n');
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i].replace(/[\s\u3000]+/g, ' ').trim(); if (!l || l.length > 40) continue;
      var v = [l, l.replace(/^\d+\s*[・･]\s*/, ''), l.replace(/\s*[A-ZＡ-Ｚ]$/, '')];
      for (var k = 0; k < v.length; k++) { try { if (match(v[k])) return true; } catch (e) { return true; } }
    }
    return false;
  }
  return { goldRounds: goldRounds, pageHas: pageHas, HUBS: HUBS, fyOf: fyOf, labelDays: labelDays, venuesOf: venuesOf, normName: normName, nameScore: nameScore, parseIndex: parseIndex, plansIn: plansIn, hubsFor: hubsFor, match: match, suggest: suggest, branchOf: branchOf, stripName: stripName };
})();
if (typeof module !== 'undefined') module.exports = LaneYear;
