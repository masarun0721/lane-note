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
  /* v0.26.23：記録の横の「NGR」「GR」「NR」「PB」「SB」「大会新」などの印。記録の読み取りでは外し、備考（comment）に残す */
  var TAGS = 'NPR|NJHR|NHSR|OPN|OP|NGR|NJR|NHR|NYR|NMR|NR|GR|JR|UR|AR|WR|MR|CR|PB|SB|=GR|=NGR|=NR|=PB|=SB|大会新|大会タイ|大会記録|大会新記録|県新|都新|道新|府新|区新|市新|高校新|中学新|日本新|自己新|自己ベスト|新記録|タイ記録';
  var TAG_ONLY = new RegExp('^[*＊]{0,2}(' + TAGS + ')[*＊]?$', 'i'), TAG_END = new RegExp('^(.*?[\\d)）])[*＊]?(' + TAGS + ')$', 'i'), TAG_START = new RegExp('^[*＊]?(' + TAGS + ')[*＊]?(\\d.*)$', 'i');
  function splitTags(s) {
    var tags = [], out = [];
    nk(String(s || '')).trim().split(/\s+/).forEach(function (t) {
      if (!t) return;
      var m;
      if (TAG_ONLY.test(t)) { tags.push(t.replace(/^[*＊]+|[*＊]+$/g, '')); return; }
      if ((m = t.match(TAG_END))) { tags.push(m[2]); t = m[1]; }
      else if ((m = t.match(TAG_START))) { tags.push(m[1]); t = m[2]; }
      t = t.replace(/^[*＊]+(?=\d)/, '');
      out.push(t);
    });
    return { s: out.join(' '), tags: tags };
  }
  function isTag(s) { return TAG_ONLY.test(nk(String(s || '')).trim()); }
  function addTags(cmt, tags) { var c = String(cmt || ''); (tags || []).forEach(function (t) { if (c.split(/[\s,，]+/).indexOf(t) < 0) c = (c ? c + ' ' : '') + t; }); return c; }
  function cleanMark(s) {
    var st = splitTags(s), t = st.s.trim(), pts = null, m;
    // v0.26.23：混成の各種目「55.02(598)」（得点）・「(0)DNS」。得点は備考に「598点」
    if ((m = t.match(/^\((\d+)\)\s*(DNS|DNF|DQ|NM|NR)$/i))) t = m[2];
    else if ((m = t.match(/^(DQ|DNF|DNS)\s*[,，、]\s*([A-Za-z0-9\-]{1,8})$/))) { t = m[1]; st.tags.push(m[2]); }   // v0.26.25：「DQ,FS」（失格・理由）
    else if ((m = t.match(/^(\d[\d:.m]*\d)\s*\((\d{1,4})\)$/))) { t = m[1]; pts = m[2]; }
    var r = cleanMark0(t); r.tags = st.tags.concat(pts != null ? [pts + '点'] : []); return r;
  }
  function cleanMark0(s) {
    var m0 = nk(s).trim().match(/^(\S+?)\s*[(（]([+\-±]?\d{1,2}\.\d)[)）]$/);   // v0.20.2「13.56(+0.8)」
    if (m0) return { mark: m0[1], wind: m0[2] };
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
    var d = s.replace(/^.*?(男子|女子|男|女)/, '').replace(/^(\d+・?\d*支部|小学|中学|高校|一般|共通|中学共通|高校・一般|高校一般|中学・高校|[1-6１-６]年|[中高][1-3]|U\d{2}|\d年)+/g, '').replace(/^[・]+/, '');
    d = d.replace(/^(小学|中学|高校|一般|共通)+/, '').replace(/ｍ/g, 'm').replace(/ハードル/, 'H');
    return (g + d) || s;
  }
  // v0.4：種目の区分（学年別・共通・高校…）。normEvent は区分を落とすので、ランキング・PB は eventKey で分ける
  function eventCat(ev) {
    var s = nk(ev).replace(/\s+/g, '').replace(/[（(](選|予|決)[)）]/g, '');
    var m = s.match(/(?:中学?|高校?)?([1-3](?:[・~〜\-][1-3])?)年(?!生)/) || s.match(/(?:^|[^\d])[中高]([1-3])(?=[^\d]|$)/);
    if (/小学/.test(s)) return '小学';
    if (m) return m[1] + '年';
    if (/共通/.test(s)) return '共通';
    if (/一般/.test(s) && !/高校/.test(s)) return '一般';
    return '';
  }
  // 中学／高校：所属の「中・高」→ 種目見出しの「中学・高校」→ 学年の「中2・高1」の順で決める。決められなければ ''
  var DIV_HINTS = {};   // v0.5：所属に中・高の無い記録の区分（推測・手で選んだもの）。記録の id → 'jh'|'hs'
  function setDivisionHints(m) { DIV_HINTS = m || {}; }
  /* v0.26.34 記録の中学／高校（ランキング・PB の区分）。決め方の順：
     ①学年に「中／高」がある（中2・高1）②所属の学校名（〜中・〜高・中体連の「地区・学校」）③大会予定の区分（中学／高校）④種目名（中学100m）
     ⑤同じ選手のほかの記録からの推測（DIV_HINTS）⑥わからなければ ''（学年の数字だけ「3」では中学にしない）
     「110mJH」は種目名のまま別の種目（110mH にまとめない）。区分は選手（学年・学校名など）に従う。
     ※ rawDivisionOf は記録のID・同じ記録の判定に使うので変えない */
  var MEET_DIV = {};   // 大会（日付|大会名）→ 'jh'|'hs'（大会予定で選んだ区分）
  function setMeetDivs(m) { MEET_DIV = m || {}; }
  function divSource(r) {
    r = r || {};
    var g = nk(r.grade || '').trim(); if (/^中/.test(g)) return { d: 'jh', src: 'grade' }; if (/^高/.test(g)) return { d: 'hs', src: 'grade' };
    var t = normSchool(r.team || '');
    if (/(中学校|中学|中等教育学校|中)$/.test(t) || cyuTeam(r.team)) return { d: 'jh', src: 'team' };
    if (/(高等学校|高校|高)$/.test(t)) return { d: 'hs', src: 'team' };
    var md = r.date && r.meet ? MEET_DIV[r.date + '|' + r.meet] : ''; if (md) return { d: md, src: 'meet' };
    var e = nk(r.event || '').replace(/\s+/g, '');
    if (/中学|中[1-3](?!\d)/.test(e)) return { d: 'jh', src: 'event' };
    if (/高校|高[1-3](?!\d)/.test(e)) return { d: 'hs', src: 'event' };
    return { d: '', src: '' };
  }
  function jhOnlyEvent(ev) { return /\d+mJH|ジュニアハードル/i.test(nk(ev || '').replace(/\s+/g, '')); }
  /* v0.26.35 先生が決めた選手の中学／高校（PERSON_OV：personKey→jh/hs）と台帳の区分（ROSTER_DIV：aid→jh/hs）。
     学校名（〜中・〜高）の次に強い。学年に「中」が入っていても、先生が「高校」と決めた選手は高校にする */
  var PERSON_OV = {}, ROSTER_DIV = {};
  function setPersonDivs(m) { PERSON_OV = m || {}; }
  function setRosterDivs(m) { ROSTER_DIV = m || {}; }
  function divisionOf(r) {
    var s = divSource(r); if (s.src === 'team') return s.d;
    var ov = r && (PERSON_OV[personKey(r)] || (r.aid && ROSTER_DIV[r.aid])); if (ov === 'jh' || ov === 'hs') return ov;
    var h = r && r.id && DIV_HINTS[r.id];
    if (h && (s.src === 'meet' || s.src === 'event' || !s.d)) return h;
    return s.d || '';
  }
  /* v0.26.35 中学になっているが、高校のしるしがある選手（要確認）。しるし：同じ選手の高校の記録（学校名・学年の「高」）、その大会の区分（高校）、台帳の区分（高校）
     返す：[{ key, name, team, recs:[{ r, to }], why:[...] }]。to＝直したあとの学年（数字だけ。高校の記録の学年から数える。数えられなければ今の数字） */
  function divConflicts(recs) {
    var by = {}; (recs || []).forEach(function (r) { (by[personKey(r)] = by[personKey(r)] || []).push(r); });
    var out = [];
    Object.keys(by).forEach(function (k) {
      if (PERSON_OV[k]) return;   // 先生が決めた選手は出さない
      var rs = by[k], jh = rs.filter(function (r) { return divisionOf(r) === 'jh' && divSource(r).src !== 'team'; }); if (!jh.length) return;
      var why = [], hs = rs.filter(function (r) { var s = divSource(r); return s.d === 'hs' && (s.src === 'team' || s.src === 'grade'); });
      // 高校に入る前（中学のとき）の記録は本当に中学なので出さない：高校の記録の学年から入学の年度を数える
      var start = hs.map(function (x) { var u = seasonOf(x.date), g = gradeNum(x.grade); return u == null ? null : u - (g ? g - 1 : 0); }).filter(function (x) { return x != null; });
      if (start.length) { var st0 = Math.min.apply(null, start); jh = jh.filter(function (r) { var u = seasonOf(r.date), md0 = r.date && r.meet && MEET_DIV[r.date + '|' + r.meet] === 'hs'; return md0 || u == null || u >= st0; }); }
      if (!jh.length) return;
      if (hs.length) why.push('同じ選手の高校の記録（' + hs[0].date + ' ' + (hs[0].team || '') + (hs[0].grade ? '・' + hs[0].grade : '') + ' ほか' + hs.length + '件）');
      var md = jh.filter(function (r) { return r.date && r.meet && MEET_DIV[r.date + '|' + r.meet] === 'hs'; });
      if (md.length) why.push('大会予定の区分が「高校」（' + md[0].date + ' ' + md[0].meet + '）');
      var ro = rs.filter(function (r) { return r.aid && ROSTER_DIV[r.aid] === 'hs'; });
      if (ro.length) why.push('選手の台帳で高校');
      if (!why.length) return;
      var ref = hs.map(function (x) { return { s: seasonOf(x.date), g: gradeNum(x.grade) }; }).filter(function (x) { return x.s != null && x.g != null; });
      out.push({ key: k, name: jh[0].name, team: jh[0].team, why: why, recs: jh.map(function (r) {
        var u = seasonOf(r.date), g = gradeNum(r.grade), to = g != null ? String(g) : '';
        if (ref.length && u != null) { var n = ref.sort(function (a, b) { return Math.abs(u - a.s) - Math.abs(u - b.s); })[0], c = n.g + (u - n.s); if (c >= 1 && c <= 3) to = String(c); }
        return { r: r, to: to };
      }) });
    });
    return out;
  }
  // 画面に出す「なぜ中学／高校か」
  function divisionWhy(r) { var s = divSource(r); if (s.d) return { grade: '学年', team: '学校名', meet: '大会予定の区分', event: '種目名' }[s.src]; return r && r.id && DIV_HINTS[r.id] ? '同じ選手のほかの記録から推測' : ''; }
  /* v0.26.34.1 所属の欄にくっついた番号「本郷・3」「本郷･3」は、ふつうは速報の支部（地区）の番号。学年にはしない。
     学年にするのは、表の見出しが「学年」だと分かっているとき（ctx.gradeHeader）か「本郷 3年」のように「年」がついているときだけ。
     種目名・大会名に「3支部」があって番号が同じなら、支部の番号と決まり */
  function splitTeamGrade(team, grade, ctx) {
    ctx = ctx || {};
    var t = nk(String(team || '')).replace(/[\s\u3000]+$/, ''), g = nk(String(grade == null ? '' : grade)).trim(), m, num = '', yr = false;
    if ((m = t.match(/^(.*?[^\s・･])[\s\u3000]*[・･][\s\u3000]*(\d{1,2})$/))) num = m[2];
    else if ((m = t.match(/^(.*?\S)[\s\u3000]+([1-6])[\s\u3000]*年生?$/))) { num = m[2]; yr = true; }
    if (!num || /^\d+$/.test(m[1].replace(/[\s・･]/g, ''))) return { team: team, grade: grade, changed: false };
    var br = new RegExp('(^|\\D)' + (+num) + '\\s*支部').test(nk((ctx.event || '') + ' ' + (ctx.meet || '')));
    var asGrade = yr || (!!ctx.gradeHeader && !br), ng = grade;
    if (asGrade && !g && (yr ? /^[1-6]$/ : /^[1-3]$/).test(num)) ng = num;
    return { team: m[1].trim(), grade: ng, changed: true, num: num, branch: !asGrade, toGrade: ng !== grade };
  }
  /* v0.26.34.1 種目名の中の支部・学年「3支部1年 100m」「1年100m」「中2 100m」「中学1年男子100m」→ 学年（中／高があればつける）と種目「100m」 */
  function gradeFromEvent(ev) {
    var e = nk(String(ev || '')), g = '', lv = '', m, out = e.replace(/\d{1,2}\s*支部/g, ' ');
    if ((m = out.match(/(中学校?|高等学校|高校)?\s*([1-6])\s*年生?/))) { g = m[2]; lv = m[1] ? (/^中/.test(m[1]) ? '中' : '高') : ''; out = out.replace(m[0], ' '); }
    else if ((m = out.match(/(^|[^\u4e00-\u9fff])(中|高)([1-3])(?![\d年])/))) { g = m[3]; lv = m[2]; out = out.replace(m[0], m[1] + ' '); }
    if (out === e) return { grade: '', event: ev, changed: false };
    out = out.replace(/[\s\u3000]+/g, ' ').trim().replace(/(男子|女子|共通)\s+/g, '$1');
    if (!/\d|跳|投|リレー|ハードル|競歩|SC|R$/i.test(out)) return { grade: '', event: ev, changed: false };   // 種目が残らないときはさわらない
    return { grade: g ? lv + g : '', event: out, changed: true };
  }
  /* 1件の記録をまとめて直す（読み取り・保存・要確認の「直す」で同じもの）。
     学年：種目名に「N年」があればそれ。前の版（v0.26.34）が「・3」から入れた学年が種目名とちがうときも、種目名のほうに直す */
  function fixRecord(r, ctx) {
    r = r || {}; ctx = ctx || {};
    var t = splitTeamGrade(r.team, r.grade, { event: r.event, meet: r.meet, gradeHeader: ctx.gradeHeader }), e = gradeFromEvent(r.event);
    var team = t.changed ? t.team : r.team, grade = t.changed ? t.grade : r.grade, event = e.changed ? e.event : r.event, g0 = nk(String(grade == null ? '' : grade)).trim(), regrade = false;
    if (e.grade) {
      var bare = g0.replace(/^(中|高)/, '');
      if (!g0) grade = e.grade;
      else if (bare !== e.grade.replace(/^(中|高)/, '')) { grade = e.grade; regrade = true; }
      else if (!/^(中|高)/.test(g0) && /^(中|高)/.test(e.grade)) grade = e.grade;
    }
    var changed = team !== r.team || String(grade == null ? '' : grade) !== String(r.grade == null ? '' : r.grade) || event !== r.event;
    return { team: team, grade: grade, event: event, changed: changed, regrade: regrade, branch: !!t.branch, num: t.num || '' };
  }
  function rawDivisionOf(r) {
    var t = normSchool(r && r.team || '');
    if (/(中学校|中学|中等教育学校|中)$/.test(t)) return 'jh';
    if (/(高等学校|高校|高)$/.test(t)) return 'hs';
    if (cyuTeam(r && r.team)) return 'jh';   // v0.26.23：中体連の速報の「地区・学校名」の形
    var e = nk(r && r.event || '').replace(/\s+/g, '');
    if (/中学|中[1-3](?!\d)/.test(e)) return 'jh';
    if (/高校|高[1-3](?!\d)/.test(e)) return 'hs';
    var g = nk(r && r.grade || '');
    if (/^中/.test(g)) return 'jh';
    if (/^高/.test(g)) return 'hs';
    return '';
  }
  function divLabel(d) { return d === 'jh' ? '中学' : d === 'hs' ? '高校' : ''; }
  // ランキング・PB・グラフで使う種目のキー：区分（中学/高校）＋学年別などの区分＋種目
  /* v0.26.23：大会ごとに種目名の書き方が違っても、同じ種目は1つにまとめる（PB・ランキング・並び・グラフ）。保存した記録の種目名はそのまま（表示も元の名前）
     ・学年・区分（中1〜3・高1〜3・2・3年・共通・低学年・少年A/B・一般・U18 など）は落とす。男女は別にもつ
     ・ハードルの高さ、砲丸・円盤などの重さは「仕様」として残す（書いていなければ中学／高校の標準の仕様を補う）→ 仕様が同じときだけまとまる
     ・リレーと個人は別（「4×100m」は 100m にならない） */
  var CAT_RE = /^(?:低学年|高学年|少年[ABCＡＢＣ]|成年|ジュニア|一般|共通|小学生?|中学生?|高校生?|中高|[1-6]年生?|[1-3][・~〜\-][1-3]年生?|[中高][1-3](?=\d|[^\dm])|U\d{2}|男子|女子|・|_)+/;
  function specNum(v, u) { v = +v; if (u === 'cm') v /= 100; if (u === 'g') v /= 1000; return v.toFixed(3) + (u === 'g' || u === 'kg' ? 'kg' : 'm'); }
  var SPEC_STD = { jh: { '男子110mH': '0.914m', '女子100mH': '0.762m', '男子砲丸投': '5.000kg', '女子砲丸投': '2.721kg', '男子円盤投': '1.500kg', '女子円盤投': '1.000kg' },
    hs: { '男子110mH': '1.067m', '女子100mH': '0.838m', '男子400mH': '0.914m', '女子400mH': '0.762m', '男子砲丸投': '6.000kg', '女子砲丸投': '4.000kg', '男子円盤投': '1.750kg', '女子円盤投': '1.000kg', '男子ハンマー投': '6.000kg', '女子ハンマー投': '4.000kg', '男子やり投': '0.800kg', '女子やり投': '0.600kg' } };
  var G_HINT = {};   // 種目名に男女の無い記録：同じ選手のほかの記録から男女を補う（athleteKey → 男子/女子）
  function learnGenders(recs) { (recs || []).forEach(function (r) { var g = (normEvent(r && r.event || '').match(/^(男子|女子)/) || [])[1]; if (g) G_HINT[athleteKey(r)] = g; }); }
  function genderText(r) {
    var g = (normEvent(r && r.event || '').match(/^(男子|女子)/) || [])[1]; if (g) return g;
    var x = nk(String(r && (r.sex || r.gender) || '')); if (/女|^f/i.test(x)) return '女子'; if (/男|^m/i.test(x)) return '男子';
    return G_HINT[athleteKey(r)] || G_DEF;
  }
  var G_DEF = '';   // v0.26.34：表に男女が1つだけのとき、男女の書いていない記録もそれにそろえる（種目の重複を防ぐ）
  function setGenderDefault(g) { G_DEF = g === 'm' ? '男子' : g === 'f' ? '女子' : ''; }
  function baseEvent(ev) {
    var n = normEvent(ev).replace(/^(男子|女子)/, ''), prev;
    do { prev = n; n = n.replace(CAT_RE, ''); } while (n !== prev && n);
    if (!n) n = normEvent(ev).replace(/^(男子|女子)/, '');
    n = n.replace(/[（(](予選|準決勝|決勝|タイムレース|TR|ﾀｲﾑﾚｰｽ)[)）]$/, '').replace(/ハードル/g, 'H').replace(/リレー$/, 'R').replace(/(\d)[xX]/g, '$1×').replace(/(×\d+m)$/, '$1R');
    var spec = '', m = n.match(/[（(]\s*(\d+(?:\.\d+)?)\s*(m|cm|kg|g)\s*[)）]/i);
    if (m) { spec = specNum(m[1], m[2].toLowerCase()); n = n.replace(m[0], ''); }
    n = n.replace(/(投)げ?$/, '$1');
    return { name: n, spec: spec };
  }
  function eventKey(r) {
    var d = divisionOf(r), g = genderText(r), b = baseEvent(r.event), spec = b.spec || (SPEC_STD[d] || {})[g + b.name] || '';
    return (d ? d + ':' : '') + g + b.name + (spec ? '(' + spec + ')' : '');
  }
  function eventKeyLabel(r, noGender) {
    // v0.26.23：学年・区分はまとめたので、見出しは「男子 中学 100m」（仕様つきの種目は仕様も）
    var k = eventKey(r), g = genderText(r), d = divLabel(divisionOf(r)), n = k.replace(/^[a-z]+:/, '').slice(g.length);
    var out = (g + (d ? ' ' + d + ' ' : (g ? ' ' : '')) + n).trim();
    return noGender && g ? out.slice(g.length).trim() : out;
  }
  function hasMark(r) { return !!markValue(r && r.mark); }
  function shownWind(r) { return hasMark(r) && windApplies(r.event) ? (r.wind || '') : ''; }   // DNS・DNF・失格などには風を出さない
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
  // v0.26.5：末尾の「・3」（速報の地区・支部番号。gold.jaic.org で「立教池袋            ・3」）も取る
  function normSchool(s) { return nk(s).replace(/^\s*\d{1,2}\s+(?=\D)/, '').replace(/\s+/g, '').replace(/^\d+・/, '').replace(/^(東京)?[・]/, '').replace(/[・･]\d{1,2}$/, ''); }
  var SUF = /(高等学校|中学校|中等教育学校|高校|中学|学園|学院)?$/;
  function schoolBase(s) { var cy = cyuTeam(s); if (cy) s = cy; return normSchool(s).replace(/(高等学校|中学校|高校|中学|高|中)$/, ''); }
  /* v0.26.23（私学が読み込めない）：学校名の書き方の違いをそろえてから比べる
     ・「中学校／中学／中等部」→「中」、「高等学校／高校／高等部」→「高」（「本郷中学校」と入れても「本郷中」に合う）
     ・「大学附属／大学付属／大附属／大付属／大付」→「大附」、先頭の「(私)」「私立」「学校法人」、末尾の「(東京)」などを外す
     ・「東京 架空学園」「東京／架空学園」のように、区切りのある都道府県名を前から外す */
  function canonSchool(s) {
    var t = nk(String(s || '')).trim().replace(/^[(（]\s*私\s*[)）]|^(学校法人|私立)\s*/g, '').replace(/\s*[(（][^()（）]{1,6}[)）]$/, '');
    t = t.replace(new RegExp('^(' + PREF.source.replace(/^\^\(|\)\$?$/g, '') + ')[都道府県]?\\s*[\\s・／/]\\s*(?=\\S{2,})'), '');
    t = normSchool(t);
    t = t.replace(/大学?(附属|付属|附|付)/g, '大附').replace(/(中等教育学校)$/, '中等').replace(/(高等学校|高等部|高校)$/, '高').replace(/(中学校|中等部|中学)$/, '中');
    return t;
  }
  /* v0.26.23：東京都中体連の速報（gold.jaic.org の cyuugaku）は所属が「墨　田・吾嬬立花」「足　立・KJR・L･足立十一」の形
     （地区・〔クラブ・L･〕学校名。学校名に「中」は付かない）。最後の区切りのあとを学校名として「〇〇中」「〇〇」と比べる */
  function cyuTeam(rec) {
    var t = nk(String(rec || '')).replace(/[\s\u3000]+/g, '');
    if (!/^[^・･]{1,4}[・･]/.test(t)) return '';
    var parts = t.split(/[・･]/).filter(Boolean); if (parts.length < 2) return '';
    var last = parts[parts.length - 1]; if (/^\d+$/.test(last)) return '';
    if (/(中|高|校|学園|学院)$/.test(parts[0]) || PREF.test(parts[0])) return '';   // 「東京・架空学園」などはこれまでどおり
    return last;
  }
  function matchSchool(rec, q) {
    var cy = cyuTeam(rec);
    if (cy) { var qb = canonSchool(q); if (!qb) return false; var cb = canonSchool(cy); return cb === qb || cb + '中' === qb || cb === qb + '中'; }
    var a = canonSchool(rec), b = canonSchool(q); if (!b) return false;
    if (a === b) return true;
    var lv = function (x) { return (x.match(/(高|中|中等)$/) || [''])[0]; }, la = lv(a), lb = lv(b), ba = la ? a.slice(0, -la.length) : a, bb = lb ? b.slice(0, -lb.length) : b;
    if (ba && ba === bb) {
      if (!lb) return true;   // 入れたのが「架空学園」（中・高なし）なら、中も高も拾う
      // v0.26.5：資料が「立教池袋」（高・中なし）で、入れたのが「〜高」のとき（中学は「〜中」と書かれるので、高校名で入れたときだけ）
      if (!la && lb === '高') return true;
    }
    if (a.indexOf(b) !== 0) return false;
    return /^(陸上部|陸上競技部|ＡＣ|AC)$/.test(a.slice(b.length)) || /^(高|中)?(陸上部|陸上競技部)?$/.test(a.slice(b.length)) && !lb;
  }
  // v0.26.38 みんなの結果：入れた学校名に「中・高」が無く、資料の所属には付いている（「本郷」→「本郷中」）＝ゆるい一致。要確認にする
  function schoolLoose(rec, q) {
    if (!matchSchool(rec, q)) return false;
    var cy = cyuTeam(rec); if (cy) return false;
    var a = canonSchool(rec), b = canonSchool(q), lv = function (x) { return (x.match(/(高|中|中等)$/) || [''])[0]; };
    return a !== b && !lv(b) && !!lv(a);
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
            var teamW = bw.filter(function (w) { return w.x >= c.team - 6 && w.x < (c.trialEnd ? c.trialEnd - 60 : c.mark + 30) && !isMark(w.n) && !WIND.test(w.n) && !isTag(w.n); });
            var teamSame = teamW.filter(function (w) { return Math.abs(w.y - a.y) < 1.6; });
            var team = (teamSame.length ? teamSame : teamW).map(function (w) { return w.n; }).join('').replace(/\s/g, '');
            if (PREF.test(team)) team = '';
            if (!teamSame.length) team = teamW.filter(function (w) { return !PREF.test(w.n.replace(/\s/g, '')); }).map(function (w) { return w.n; }).join('').replace(/\s/g, '').replace(new RegExp('^(' + PREF.source.slice(2, -2) + ')(?=.)'), function (p) { return teamW.length > 1 ? '' : p; });
            var marks = bw.filter(function (w) { return w.x >= markZone0 && w.x < markZone1 && MARK.test(cleanMark(w.n).mark); }).sort(function (p, q) { return p.y - q.y || p.x - q.x; });
            var stat = bw.filter(function (w) { return w.x >= c.team + 8 && STATUS.test(cleanMark(w.n).mark); })[0];
            var cmt = c.cmt != null ? bw.filter(function (w) { return w.x >= c.cmt - 2 && !STATUS.test(w.n); }).map(function (w) { return w.n; }).join(' ') : '';
            var tagW = bw.filter(function (w) { return Math.abs(w.y - a.y) < 1.6 && w.x >= c.team + 8 && (c.cmt == null || w.x < c.cmt - 2) && isTag(w.n); }).map(function (w) { return w.n.replace(/^[*＊]+|[*＊]+$/g, ''); });
            var mk = marks.length ? cleanMark(marks[marks.length - 1].n) : null;
            cmt = addTags(cmt, tagW.concat(mk ? mk.tags : []));   // v0.26.23：NGR などは備考に
            var mark = mk ? mk.mark : (stat ? cleanMark(stat.n).mark : '');
            var w = mk && mk.wind != null ? mk.wind : null;
            if (w == null && marks.length) { var mw = marks[marks.length - 1]; var under = bw.filter(function (x) { return WIND.test(x.n) && x.y > mw.y + 2 && Math.abs(x.x + x.w - (mw.x + mw.w)) < 12; })[0]; if (under) w = under.n; }
            if (w == null && c.wind != null) { var wc = same.filter(function (x) { return WIND.test(x.n) && x.x >= c.wind - 10; })[0]; if (wc) w = wc.n; }
            if (w == null && wev && !/走幅跳|三段跳|跳|投/.test(ev)) w = wev.v;
            var g = parseGrade(kanji || '');
            if (STATUS.test(mark) || !mark) w = null;
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
      var mk = cleanMark(get(map.mark)), cmt = addTags(get(map.cmt), mk.tags), mark = mk.mark;
      if (!mark && STATUS.test(cmt.split(' ')[0])) { mark = cmt.split(' ')[0]; cmt = cmt.split(' ').slice(1).join(' '); }
      var badMark = mark && !isMark(mark);
      var w = mk.wind != null ? mk.wind : (map.wind != null ? get(map.wind) : wind);
      if (/跳|投/.test(ev) && map.wind == null && mk.wind == null) w = '';
      if (!mark || STATUS.test(mark)) w = '';
      // v0.26.26：東京都高体連（tokyokotairenrikujo.jp）の速報は所属の欄が「2<br>本郷」（上に支部の番号）。番号の行は所属にしない
      var team = String(get(map.team)).replace(/^\s*\d{1,2}[\s\u3000]+(?=\D)/, '').replace(/\s*\n\s*/g, ' ').trim();
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
  /* v0.20.2：gold.jaic.org の速報（携帯向けの形）「1位　(663)<br>　13.56<br>田中  一帆(小6)<br>清新JAC<br>」を、表の stream にして parseCells で読む。
     この形でなければ null（ほかのHTMLは今までどおり）。リレーの塊（番号が無い）は飛ばす（リレーはこの版では読み取らない）。 */
  function goldMobileStream(html) {
    html = String(html || '');
    if (!/(\d+位|[\u3000 ]{2})[\u3000 ]*\(\d+\)\s*<br>/i.test(html)) return null;
    var txt = function (h) { return nk(h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')).replace(/\s+/g, ' ').trim(); };
    var out = [], tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var dm = html.match(/<!--\s*(20\d\d)\/(\d{1,2})\/(\d{1,2})/); if (dm) out.push({ type: 'text', v: dm[1] + '年' + +dm[2] + '月' + +dm[3] + '日' });
    if (tm) out.push({ type: 'text', v: txt(tm[1]) });
    var body = html.replace(/^[\s\S]*?<\/head>/i, '');
    var wm = body.match(/風\s*[:：]\s*([+\-±]?\d+\.\d)/); if (wm) out.push({ type: 'text', v: '風:' + wm[1] });
    out.push({ type: 'row', cells: ['順位', 'No.', '記録', '氏名', '所属', '備考'], th: true });
    body.split(/<font\b[^>]*>/i).slice(1).forEach(function (blk) {
      blk = blk.split(/<\/font>|<hr|<ul|<a\b/i)[0];
      var L = blk.split(/<br\s*\/?>/i).map(txt);
      while (L.length && !L[L.length - 1]) L.pop();
      // v0.26.23：「NGR」「大会新」などが別の行・同じ行にあっても読む（備考に残す）
      var tags = []; L = L.filter(function (x, i) { if (i && isTag(x)) { tags.push(x.replace(/^[*＊]+|[*＊]+$/g, '')); return false; } return true; });
      var l0 = splitTags(L[0] || ''); tags = l0.tags.concat(tags);
      var m = l0.s.match(/^(?:(\d+)\s*位)?\s*\((\d+)\)$/); if (!m || L.length < 4) return;
      out.push({ type: 'row', cells: [m[1] || '', m[2], L[1], L[2], L[3].replace(/\s*[・･]\s*\d{1,2}$/, ''), tags.join(' ')] });
    });
    return out;
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
    recs.forEach(function (r) { var x = fixRecord(r); if (x.changed) { r.team = x.team; r.grade = x.grade; r.event = x.event; } });   // v0.26.34.1 支部の番号・種目名の学年   // v0.26.34「本郷・3」→ 所属・学年
    var seen = {}, out = [];
    // v0.6（監査F06）：所属（完全な形）・中学/高校・ナンバーもキーに入れる（別の学校の同じ名前・同じ記録の選手を1人にまとめない）
    // v0.7（再監査A03）：保存のID・保存時の重なり判定と同じ identityParts を使う
    recs.forEach(function (r) { var k = identityKey(r); if (!seen[k]) { seen[k] = 1; out.push(r); } });
    return out;
  }

  /* ---------- 自己ベスト ---------- */
  // v0.18：大会準備の記録用紙に出す「自己ベスト」。名前（正規化）＋区分（中学/高校）＋種目（区分を除く種目名と学年別などの区分）で引く。
  // 返り値の関数に出場の行（name・team・event・grade）を渡すと { best: 公認ベストの記録, ref: 参考記録のほうが良ければその記録 } か null
  function pbLookup(recs) {
    var map = {}, lastOf = {};
    // v0.18.1：前回大会＝その選手・種目のいちばん新しい記録（DNS などもそのまま。日付→順で最後）
    (recs || []).forEach(function (r) { var k = athleteKey(r) + '|' + eventKey(r), o = lastOf[k];
      if (!o || (r.date || '') > (o.date || '') || ((r.date || '') === (o.date || '') && (r.order || 0) >= (o.order || 0))) lastOf[k] = r; });
    computeBests(recs || []).bests.forEach(function (b) {
      b.last = lastOf[b.key + '|' + b.event] || null;
      var any = b.best || b.ref || b.last; if (!any) return;
      var k = nameKey(b.name) + '|' + String(b.event).replace(/^[a-z]+:/, '');
      (map[k] = map[k] || []).push(b);
    });
    return function (row) {
      if (!row || !row.name) return null;
      var d = divisionOf(row), k = nameKey(row.name) + '|' + eventKey(row).replace(/^[a-z]+:/, '');
      var c = (map[k] || []).filter(function (b) { return !d || !b.div || b.div === d; });
      if (c.length !== 1) return null;   // 見つからない・同じ名前で区分の違う人が2人以上（決められない）→ 空欄
      return { best: c[0].best || null, ref: c[0].ref || null, last: c[0].last || null };
    };
  }
  // v0.26.11：台帳の選手ID（aid）がある記録は、名前・所属・中高に関係なく同じ人
  function athleteKey(r) { if (r && typeof r.aid === 'string' && /^A[A-Za-z0-9]{10}$/.test(r.aid)) return 'id:' + r.aid; var d = divisionOf(r); return nameKey(r.name || r.kana) + '@' + schoolBase(r.team) + (d ? '#' + d : ''); }
  function windClass(r) {   // 'ok' 公認対象 / 'aid' 追い風参考 / 'unk' 風不明 / 'na' 風の無い種目
    if (!windApplies(r.event)) return 'na';
    var w = windNum(r.wind); if (w == null) return 'unk';
    return w > 2.0 ? 'aid' : 'ok';
  }
  // recs: 日付つきの記録。各記録に pb（'PB'更新／'初'）と、選手×種目のベストを返す
  function computeBests(recs) {
    var groups = {}; learnGenders(recs);
    recs.forEach(function (r) { var k = athleteKey(r) + '|' + eventKey(r); (groups[k] = groups[k] || []).push(r); });
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
      bests.push({ key: athleteKey(any), name: any.name || any.kana, kana: any.kana || '', grade: any.grade || '', team: any.team, div: divisionOf(any), event: eventKey(any), eventLabel: eventKeyLabel(any), best: best && best.r, ref: bestAid && (!best || (bestAid.mv.lower ? bestAid.mv.v < best.mv.v : bestAid.mv.v > best.mv.v)) ? bestAid.r : null, count: g.length });
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
    recs.forEach(function (r) { var k = athleteKey(r) + '|' + eventKey(r); (groups[k] = groups[k] || []).push(r); });
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
    var rs = recs.filter(function (r) { return (opt.season == null || seasonOf(r.date) === opt.season) && (!opt.div || divisionOf(r) === opt.div); });
    var groups = {};
    rs.forEach(function (r) { var ev = eventKey(r), k = athleteKey(r); ((groups[ev] = groups[ev] || {})[k] = groups[ev][k] || []).push(r); });
    var out = {};
    Object.keys(groups).forEach(function (ev) {
      var list = [];
      Object.keys(groups[ev]).forEach(function (k) {
        var g = groups[ev][k].slice().sort(byDate), last = g[g.length - 1], best = null;
        var gr = null; for (var i = g.length - 1; i >= 0 && gr == null; i--) gr = gradeNum(g[i].grade);
        if (opt.grade != null && gr !== opt.grade) return;
        g.forEach(function (r) { if (isOfficial(r)) { var mv = markValue(r.mark); if (isBetter(mv, best && best.mv)) best = { r: r, mv: mv }; } });
        if (best) list.push({ key: k, label: eventKeyLabel(last), name: last.name || last.kana, team: last.team, grade: gr, best: best.r, mv: best.mv, count: g.length });
      });
      list.sort(function (a, b) { return a.mv.lower ? a.mv.v - b.mv.v : b.mv.v - a.mv.v; });
      var prev = null; list.forEach(function (x, i) { x.rank = prev && prev.mv.v === x.mv.v ? prev.rank : i + 1; prev = x; });
      if (list.length) out[ev] = list;
    });
    return out;
  }
  // 歴代記録：種目ごとに、選手ひとりにつき公認ベスト1つで上位 n 人（卒業生も含む）
  function allTimeTop(recs, n, opt) {
    var r = ranking(recs, { div: opt && opt.div }), out = {};
    Object.keys(r).forEach(function (ev) { out[ev] = r[ev].slice(0, n || 10).map(function (x) { return Object.assign({}, x, { season: seasonOf(x.best.date), year: String(x.best.date || '').slice(0, 4) }); }); });
    return out;
  }
  // 選手のページ：種目ごとに公認ベスト・参考・最近の記録・グラフ用の点（公認記録を日付順）
  function athleteProfile(recs, key) {
    var mine = recs.filter(function (r) { return athleteKey(r) === key; });
    if (!mine.length) return null;
    var cb = computeBests(mine), byEv = {};
    mine.forEach(function (r) { var ev = eventKey(r); (byEv[ev] = byEv[ev] || []).push(r); });
    var last = mine.slice().sort(byDate)[mine.length - 1];
    var events = cb.bests.map(function (b) {
      var g = byEv[b.event].slice().sort(byDate);
      var all = g.filter(hasMark).map(function (r) { return { date: r.date, v: markValue(r.mark).v, mark: r.mark, wind: r.wind || '', ref: !isOfficial(r), wc: windClass(r) }; });
      var pts = all.filter(function (p) { return !p.ref; });
      // v0.15：記録の無い出場（DNS・DNF・DQ・NM など）もグラフの下に × で出す
      var nm = g.filter(function (r) { return !hasMark(r) && String(r.mark || '').trim(); }).map(function (r) { return { date: r.date, mark: String(r.mark).trim(), meet: r.meet || '', round: r.round || '' }; });
      var any = g.map(function (r) { return markValue(r.mark); }).filter(Boolean)[0];
      return { event: b.event, eventLabel: b.eventLabel, best: b.best, ref: b.ref, count: b.count, recent: g.slice().reverse().slice(0, 5), points: pts, allPoints: all, noMarks: nm, lower: any ? any.lower : true };
    }).sort(function (a, b) { return a.event < b.event ? -1 : a.event > b.event ? 1 : 0; });
    return { key: key, name: last.name || last.kana, kana: last.kana, team: last.team, grade: last.grade, events: events, count: mine.length };
  }

  // 選手別の並び：フリガナがあれば五十音、なければ学年→氏名（日本語の照合順）
  var COLL = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('ja') : null;
  function jcmp(a, b) { a = a || ''; b = b || ''; return COLL ? COLL.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }
  function kanaKey(k) { return nk(k || '').replace(/[\s　・]/g, '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  function sortAthletes(list, get) {
    get = get || function (x) { return x; };
    return list.slice().sort(function (x, y) {
      var a = get(x), b = get(y), ka = kanaKey(a.kana), kb = kanaKey(b.kana);
      if (ka && kb) return jcmp(ka, kb) || jcmp(nk(a.name), nk(b.name));
      var ga = gradeNum(a.grade), gb = gradeNum(b.grade);
      if (ga !== gb) return (ga == null ? 9 : ga) - (gb == null ? 9 : gb);
      return jcmp(ka || nk(a.name), kb || nk(b.name));
    });
  }

  /* ---------- 大会名の推測（ファイル名・資料の見出しから） ---------- */
  var GENERIC = /^(result|results|kekka|document|doc|scan|file|print|download|untitled|list|timeorder|preview|program|pdf|html?|無題|名称未設定|新しいファイル|プレビュー|一覧|資料|結果)$/i;
  var MEET_KW = /(大会|選手権|記録会|競技会|リレー|カーニバル|フェスティバル|陸上|学年別|新人戦|支部|区民|都民|総体|インターハイ|駅伝|予選)/;
  function pad2(n) { return ('0' + n).slice(-2); }
  function okDate(y, m, d) { y = +y; m = +m; d = +d; return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() ? y + '-' + pad2(m) + '-' + pad2(d) : ''; }
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

  /* ---------- v0.5：種目の並び（区分ごと・陸上の種目順）・男女 ---------- */
  function genderOf(r) { var g = genderText(r); return g === '男子' ? 'm' : g === '女子' ? 'f' : ''; }
  var GROUPS = ['中学', '高校', 'その他'];   // v0.26.23：学年別・共通は同じ種目にまとめたので、区分は中学・高校だけ
  function divGroup(r) {
    var d = divisionOf(r);
    if (d === 'jh') return '中学';
    if (d === 'hs') return '高校';
    return 'その他';
  }
  // 種目の順：短距離→中長距離→ハードル→リレー→競歩→跳躍→投てき→混成。距離は数で比べる
  function disciplineOrder(ev) {
    var s = normEvent(ev).replace(/^(男子|女子)/, ''), m = s.match(/(\d+(?:,\d{3})*)\s*m/), dist = m ? +m[1].replace(/,/g, '') : 0;
    var t;
    if (/リレー|R$|×/.test(s)) t = 3;
    else if (/競歩|W$|\dmW/.test(s)) t = 4;
    else if (/H|ハードル/.test(s) && dist) t = 2;
    else if (/SC|障害/.test(s)) t = 2.5;
    else if (/走高跳/.test(s)) { t = 5; dist = 1; } else if (/棒高跳/.test(s)) { t = 5; dist = 2; } else if (/走幅跳/.test(s)) { t = 5; dist = 3; } else if (/三段跳/.test(s)) { t = 5; dist = 4; }
    else if (/跳/.test(s)) { t = 5; dist = 9; }
    else if (/砲丸/.test(s)) { t = 6; dist = 1; } else if (/円盤/.test(s)) { t = 6; dist = 2; } else if (/ハンマー/.test(s)) { t = 6; dist = 3; } else if (/やり|ジャベ/.test(s)) { t = 6; dist = 4; }
    else if (/投/.test(s)) { t = 6; dist = 9; }
    else if (/種|混成/.test(s)) t = 7;
    else if (dist) t = dist <= 400 ? 0 : 1;
    else t = 8;
    return [t, dist, s];
  }
  function cmpEventRec(a, b) {
    var ga = GROUPS.indexOf(divGroup(a)), gb = GROUPS.indexOf(divGroup(b)); if (ga !== gb) return ga - gb;
    var xa = genderOf(a), xb = genderOf(b); if (xa !== xb) return (xa === 'm' ? 0 : xa === 'f' ? 1 : 2) - (xb === 'm' ? 0 : xb === 'f' ? 1 : 2);
    var da = disciplineOrder(a.event), db = disciplineOrder(b.event);
    return da[0] - db[0] || da[1] - db[1] || (da[2] < db[2] ? -1 : da[2] > db[2] ? 1 : 0) || (eventKey(a) < eventKey(b) ? -1 : eventKey(a) > eventKey(b) ? 1 : 0);
  }
  // keys: eventKey の配列、rows: 記録。→ [{group:'中1', items:[{key, label, rec}]}]（区分の順・種目の順）
  function groupEvents(keys, rows, noGender) {
    var rep = {}; rows.forEach(function (r) { var k = eventKey(r); if (!rep[k]) rep[k] = r; });
    var list = keys.filter(function (k) { return rep[k]; }).map(function (k) { return rep[k]; }).sort(cmpEventRec), out = [], cur = null;
    var by = {}, seen = {};
    list.forEach(function (r) {   // v0.26.34：同じ区分の見出しは1つ・同じ表示の種目は1つ（先に並んだほう）
      var g = divGroup(r), lb = eventKeyLabel(r, noGender); if (seen[g + '|' + lb]) return; seen[g + '|' + lb] = 1;
      if (!by[g]) { by[g] = { group: g, items: [] }; out.push(by[g]); } by[g].items.push({ key: eventKey(r), label: lb, rec: r });
    });
    cur = out[out.length - 1] || null;
    keys.filter(function (k) { return !rep[k]; }).forEach(function (k) { if (!cur || cur.group !== 'その他') { cur = { group: 'その他', items: [] }; out.push(cur); } cur.items.push({ key: k, label: k, rec: null }); });
    return out;
  }
  function gendersIn(rows) { var o = {}; rows.forEach(function (r) { var g = genderOf(r); if (g) o[g] = 1; }); return Object.keys(o).sort().reverse(); }

  /* ---------- v0.5：所属に中・高の無い記録の区分を、同じ選手のほかの大会から決める ---------- */
  // 同じ選手＝氏名（とフリガナがあればフリガナも）・学校名（中・高を除いた部分）が同じ
  function personKey(r) { return nameKey(r.name || r.kana) + '@' + schoolBase(r.team); }
  // overrides: personKey → 'jh'|'hs'（画面で選んだもの）
  // 戻り値 { hints: {id: div}, review: [{person, name, kana, team, ids, reason, dates}] }
  function inferDivisions(recs, overrides) {
    overrides = overrides || {};
    var known = {}, unknown = {};
    recs.forEach(function (r) {
      var k = personKey(r), ds = divSource(r), d = ds.src === 'grade' || ds.src === 'team' ? ds.d : '';   // v0.26.35 大会の区分・種目名からの区分より、同じ選手のほかの記録を先に
      if (d) (known[k] = known[k] || []).push(r); else (unknown[k] = unknown[k] || []).push(r);
    });
    var hints = {}, review = [];
    Object.keys(unknown).forEach(function (k) {
      var us = unknown[k], ov = overrides[k];
      if (ov === 'jh' || ov === 'hs') { us.forEach(function (r) { hints[r.id] = ov; }); return; }
      var ks = (known[k] || []).filter(function (x) { var a = kanaKey(x.kana), b = kanaKey(us[0].kana); return !a || !b || a === b; });
      var divs = {}; ks.forEach(function (x) { divs[divSource(x).d] = 1; });
      var dl = Object.keys(divs), reason = '', undecided = [];
      if (!dl.length) reason = 'ほかの大会に、中学か高校かがわかる記録がありません';
      else if (dl.length > 1) reason = '同じ名前の選手が中学にも高校にもいます';
      else {
        var d = dl[0], ss = ks.map(function (x) { return { s: seasonOf(x.date), g: gradeNum(x.grade) }; }).filter(function (x) { return x.s != null; });
        us.forEach(function (r) {
          var u = seasonOf(r.date), ok = true;
          if (u != null && ss.length) {
            if (d === 'jh') { var mx = ss.reduce(function (a, b) { return b.s > a.s || (b.s === a.s && (b.g || 0) > (a.g || 0)) ? b : a; }); if (u > mx.s) ok = mx.g != null && u - mx.s <= 3 - mx.g; }
            else { var mn = ss.reduce(function (a, b) { return b.s < a.s || (b.s === a.s && (b.g || 9) < (a.g || 9)) ? b : a; }); if (u < mn.s) ok = mn.g != null && mn.s - u <= mn.g - 1; }
          }
          // v0.26.34：記録に学年の数字があるときは、前の記録から数えた学年と合うときだけ（高3の「3」を中3にしない）
          var rg = gradeNum(r.grade);
          if (ok && rg != null && u != null && ss.length) {
            var ref = ss.filter(function (x) { return x.g != null; }).sort(function (a, b) { return Math.abs(u - a.s) - Math.abs(u - b.s); })[0];
            if (!ref || (d === 'jh' ? ref.g + (u - ref.s) : ref.g + (u - ref.s)) !== rg) ok = false;
          }
          if (ok) hints[r.id] = d; else undecided.push(r);
        });
        if (undecided.length) { us = undecided; reason = '中3から高1に上がる時期（4月）をまたぐので、どちらか決められません'; }
      }
      if (reason) us = us.filter(function (r) { return !divSource(r).d; });   // 大会の区分・種目名で決まる記録は「わからない」に出さない
      if (reason && us.length) { var f = us[0]; review.push({ person: k, name: f.name || f.kana, kana: f.kana || '', team: f.team, ids: us.map(function (r) { return r.id; }), dates: us.map(function (r) { return r.date; }).sort(), reason: reason }); }
    });
    return { hints: hints, review: review };
  }

  /* ---------- v0.5：Excel・CSV の取り込み ---------- */
  var HEADER_FIELDS = [
    ['name', /^(氏名|名前|選手名|選手|なまえ|name)$/i], ['kana', /^(フリガナ|ふりがな|カナ|ヨミ|よみ|読み|氏名カナ|カナ氏名)$/], ['grade', /^(学年|年)$/],
    ['team', /^(所属|学校|学校名|チーム|所属名)$/], ['event', /^(種目|種目名|競技|event)$/i], ['mark', /^(記録|タイム|結果|記録\(タイム\)|time|mark)$/i],
    ['wind', /^(風|風速|風力|wind)$/i], ['date', /^(日付|年月日|月日|日にち|実施日|大会日|date)$/i], ['meet', /^(大会|大会名|競技会|記録会|meet)$/i],
    ['rank', /^(順位|着順|着|rank)$/i], ['round', /^(ラウンド|予決|予選決勝|区分|round)$/i], ['sex', /^(性別|男女)$/]];
  var FIELD_LABELS = { name: '氏名', kana: 'フリガナ', grade: '学年', team: '所属', event: '種目', mark: '記録', wind: '風', date: '日付', meet: '大会名', rank: '順位', round: 'ラウンド', sex: '性別' };
  function mapHeaders(headers) {
    var map = {};
    (headers || []).forEach(function (h, i) {
      var s = nk(String(h == null ? '' : h)).replace(/[\s　:：*＊※]/g, '');
      HEADER_FIELDS.some(function (f) { if (map[f[0]] == null && f[1].test(s)) { map[f[0]] = i; return true; } return false; });
    });
    return map;
  }
  /* v0.26.7 読み取り失敗の救済：貼り付けた表・CSVの文章 → 行×列（タブ → カンマ（"…"の中のカンマはそのまま）→ 2つ以上の空白 の順で区切りを決める） */
  function splitTable(text) {
    var L = String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!L.length) return [];
    var tab = L.filter(function (l) { return l.indexOf('\t') >= 0; }).length, comma = L.filter(function (l) { return l.indexOf(',') >= 0; }).length;
    var csv = function (l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"' && cur.trim() === '') { q = true; cur = ''; } else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };
    if (tab >= L.length / 2) return L.map(function (l) { return l.split('\t').map(function (c) { return c.trim(); }); });
    if (comma >= L.length / 2) return L.map(csv);
    return L.map(function (l) { return l.trim().split(/[ \u3000]{2,}|\u3000/).map(function (c) { return c.trim(); }); });
  }
  function isTable(aoa) { return aoa.length >= 2 && aoa.filter(function (r) { return r.length >= 2; }).length >= Math.max(2, aoa.length * 0.6); }
  // 見出しの行：最初の15行で、見出しにいちばん多く当たる行（2つ以上）
  function findHeaderRow(aoa) {
    var best = -1, bn = 1;
    for (var i = 0; i < Math.min(15, aoa.length); i++) { var n = Object.keys(mapHeaders(aoa[i])).length; if (n > bn) { bn = n; best = i; } }
    return best;
  }
  // 日付のセル → 'YYYY-MM-DD'（2026/9/13・2026-09-13・2026年9月13日・R8.9.13・令和8年9月13日・H30.5.1・Excelの通し番号・Date）
  function parseDateCell(v) {
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : okDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
      var n = Math.floor(+v); if (n < 36526 || n > 73050) return '';   // 2000〜2099年
      var d = new Date(Date.UTC(1899, 11, 30) + n * 864e5);
      return okDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    var s = nk(String(v)).trim(), m;
    if ((m = s.match(/^(20\d\d)\s*[年\/.\-]\s*(\d{1,2})\s*[月\/.\-]\s*(\d{1,2})\s*日?/))) return okDate(m[1], m[2], m[3]);
    if ((m = s.match(/^(20\d\d)(\d\d)(\d\d)$/))) return okDate(m[1], m[2], m[3]);
    if ((m = s.match(/^(令和|R)\s*(\d{1,2}|元)\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})/i))) return okDate(2018 + (m[2] === '元' ? 1 : +m[2]), m[3], m[4]);
    if ((m = s.match(/^(平成|H)\s*(\d{1,2}|元)\s*[年.\/\-]\s*(\d{1,2})\s*[月.\/\-]\s*(\d{1,2})/i))) return okDate(1988 + (m[2] === '元' ? 1 : +m[2]), m[3], m[4]);
    return '';
  }
  function isFieldEvent(ev) { return /(跳|投|スロー)/.test(nk(ev)); }
  // Excel の記録：数値になったもの（11.5 → 11.50、走幅跳の 5.74 → 5m74、時刻の形 0.00314… → 4:31.30）を結果資料と同じ形に
  function normImportMark(v, ev, text) {
    if (v == null) return '';
    var t = nk(String(text != null && text !== '' ? text : v)).trim().replace(/秒$/, '');
    if (typeof v === 'number' && v > 0 && v < 1 && !isFieldEvent(ev)) {   // 時刻の書式（1日を1とした数）
      var sec = Math.round(v * 86400 * 100) / 100, mm = Math.floor(sec / 60), ss = sec - mm * 60;
      t = mm ? mm + ':' + (ss < 10 ? '0' : '') + ss.toFixed(2) : ss.toFixed(2);
    }
    t = t.replace(/^(\d{1,2})分(\d{1,2})秒?(\d{1,2})$/, '$1:$2.$3').replace(/^(\d{1,2})'(\d{2})"(\d{1,2})$/, '$1:$2.$3');
    if (/^\d+\.\d$/.test(t)) t += '0';
    if (isFieldEvent(ev) && /^\d{1,2}\.\d{2}$/.test(t)) t = t.replace('.', 'm');
    return t;
  }
  // aoa: 行の配列（raw）、txt: 同じ形の表示文字（なければ aoa）、map: 列の割り当て、hr: 見出しの行
  function importRows(aoa, map, opt) {
    // v0.26.7：opt.def = { meet, date, event }（表に列が無いとき、全部の行に使う。読み取り失敗の救済で貼り付けた表など）。headerRow:-1 は「見出しの行なし」
    opt = opt || {}; var txt = opt.text || aoa, hr = opt.headerRow == null ? 0 : opt.headerRow, recs = [], bad = [], def = opt.def || {};
    var cell = function (row, f) { return map[f] == null ? '' : row[map[f]]; };
    var ctext = function (i, f) { var r = txt[i] || []; return map[f] == null ? '' : r[map[f]]; };
    for (var i = hr + 1; i < aoa.length; i++) {
      var row = aoa[i] || []; if (!row.some(function (c) { return c != null && String(c).trim() !== ''; })) continue;
      var name = nk(String(cell(row, 'name') || '')).replace(/\s+/g, ' ').trim(), ev = nk(String(cell(row, 'event') || def.event || '')).replace(/\s+/g, ' ').trim();
      var sex = nk(String(cell(row, 'sex') || '')).trim();
      if (sex && !/(男|女)/.test(ev)) ev = (/^(女|f)/i.test(sex) ? '女子' : /^(男|m)/i.test(sex) ? '男子' : '') + ev;
      var date = parseDateCell(cell(row, 'date')) || parseDateCell(ctext(i, 'date')) || parseDateCell(def.date || '');
      var mark = normImportMark(cell(row, 'mark'), ev, ctext(i, 'mark'));
      var w = cell(row, 'wind'), wind = w === '' || w == null ? '' : nk(String(typeof w === 'number' ? (w > 0 ? '+' : '') + w.toFixed(1) : w)).replace(/[()（）\s]/g, '').replace('±', '');
      var meet = nk(String(cell(row, 'meet') || def.meet || '')).replace(/\s+/g, ' ').trim();
      var g = parseGrade(name), grade = nk(String(cell(row, 'grade') || '')).replace(/年生?$/, '').trim() || g.grade;
      var r = { event: ev, round: nk(String(cell(row, 'round') || '')).trim(), heat: '', rank: /^\d+$/.test(String(cell(row, 'rank') || '').trim()) ? +String(cell(row, 'rank')).trim() : '', lane: '', bib: '',
        name: g.name, kana: nk(String(cell(row, 'kana') || '')).trim(), grade: grade, team: nk(String(cell(row, 'team') || '')).trim() || opt.school || '', mark: mark, wind: hasMark({ mark: mark }) && windApplies(ev) ? wind : '', comment: '', row: i + 1, date: date, meet: meet || (date ? '大会名なし（' + date + '）' : '') };
      var probs = [];
      if (!date) probs.push('日付');
      if (!r.name) probs.push('氏名');
      if (!r.event) probs.push('種目');
      if (!r.mark) probs.push('記録'); else if (!markValue(r.mark) && !STATUS.test(r.mark)) probs.push('記録の形（「' + r.mark + '」）');
      r.warn = probs.join('・');
      if (probs.length) bad.push(r); else recs.push(r);
    }
    return { recs: recs, bad: bad };
  }
  // v0.5 までのID（中学と高校がぶつかる）。保存済みの記録との重なりを調べるときだけ使う
  function recIdLegacy(meetName, date, r) { return [nk(meetName).replace(/\s/g, ''), date, normEvent(r.event), r.round, r.heat, nameKey(r.name || r.kana), schoolBase(r.team), r.mark].join('|'); }
  // v0.6（監査F06）：中学/高校の区分を足して、本郷中と本郷高の同じ名前・同じ記録を別のIDにする
  function recIdV6(meetName, date, r) { var d = rawDivisionOf(r); return recIdLegacy(meetName, date, r) + (d ? '|' + d : ''); }
  /* v0.7（再監査A03）：解析の重複判定・保存のID・再取込・旧IDの記録との照合で、同じ「同一性」を使う。
     所属（正規化した完全な形）・中学/高校・種目と種目の区分（1年/共通…）・ナンバー・ラウンド・組・氏名・記録。
     区切りは JSON の配列にして、項目の中に「|」などがあってもぶつからないようにする */
  function str_(v) { return v == null ? '' : String(v); }
  function identityParts(r) {
    return [normSchool(r.team || ''), rawDivisionOf(r), normEvent(r.event), eventCat(r.event), nk(str_(r.bib)).replace(/\s/g, ''), nk(str_(r.round)).replace(/\s/g, ''), nk(str_(r.heat)).replace(/\s/g, ''), nameKey(r.name || r.kana), nk(str_(r.mark)).replace(/\s/g, '')];
  }
  function identityKey(r) { return JSON.stringify(identityParts(r)); }
  function meetKey(meetName, date) { return [nk(str_(meetName)).replace(/\s/g, ''), str_(date)]; }
  // 大会・日付まで含めた同一性（保存済みの記録とくらべるとき）
  function fullIdentity(r, meetName, date) { return JSON.stringify(meetKey(meetName == null ? r.meet : meetName, date == null ? r.date : date).concat(identityParts(r))); }
  // ナンバーだけを除いた同一性（旧データでナンバーが無い記録と「同じかもしれない」を見つける）
  function looseIdentity(r) { var p = meetKey(r.meet, r.date).concat(identityParts(r)); p[6] = ''; return JSON.stringify(p); }
  function recId(meetName, date, r) { return 'v7' + fullIdentity(r, meetName, date); }
  /* ---------- v0.6（監査F09）：JSONの読み込みは、決まった項目・決まった型だけで作り直す（ほかの項目は持ち込まない） ---------- */
  var REC_STR = ['id', 'name', 'kana', 'grade', 'team', 'event', 'round', 'mark', 'wind', 'comment', 'meet', 'date', 'src', 'savedAt', 'updatedAt', 'lane', 'bib', 'sex', 'dupOf', 'aid', 'legs'];
  var REC_NUM = ['heat', 'rank', 'overall', 'order'];
  function sanitizeRecord(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    var o = {};
    for (var i = 0; i < REC_STR.length; i++) {
      var k = REC_STR[i], v = r[k];
      if (v == null) continue;
      if (typeof v === 'number' && isFinite(v) && k !== 'date' && k !== 'id') v = String(v);
      if (typeof v !== 'string' || v.length > (k === 'id' ? 400 : k === 'comment' || k === 'src' || k === 'legs' ? 300 : 120)) return null;
      o[k] = v;
    }
    for (var j = 0; j < REC_NUM.length; j++) {
      var n = REC_NUM[j], x = r[n];
      if (x == null || x === '') { if (x === '') o[n] = ''; continue; }
      if (typeof x === 'number' && isFinite(x)) o[n] = x;
      else if (typeof x === 'string' && x.length <= 20) o[n] = x;
      else return null;
    }
    if (r.manual === true) o.manual = true;
    if (!o.id || !o.meet || !validDate(o.date) || o.name == null || o.mark == null || !o.event) return null;
    return o;
  }
  /* ---------- v0.6：1件ずつ入力（記録ページ）。入力を結果資料と同じ形にそろえ、まちがいを返す ---------- */
  function validDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return false; var d = new Date(+m[1], m[2] - 1, +m[3]); return d.getFullYear() === +m[1] && d.getMonth() === m[2] - 1 && d.getDate() === +m[3]; }
  function normManualWind(w) {
    var t = nk(String(w == null ? '' : w)).replace(/[\s()（）]/g, '').replace(/^±/, '+').replace(/[mｍ]\/?s?$/i, '');
    if (!t) return { v: '' };
    if (/^0(\.0)?$/.test(t)) return { v: '+0.0' };
    var m = /^([+-]?)(\d{1,2})(?:\.(\d))?$/.exec(t);
    if (!m) return { v: t, err: '風は「+1.2」「-0.5」のように入れてください' };
    return { v: (m[1] || '+') + (+m[2]) + '.' + (m[3] || '0') };
  }
  /* v0.26.12 リレー：チームの記録（氏名＝「チーム名 リレー」）＋走順（legs：「1走 A／2走 B／…」）。まずは手で入れる */
  function isRelay(ev) { return /リレー|\d\s*[×xX＊*]\s*\d|\dmR$|\d+R$/.test(nk(String(ev || ''))); }
  function legsText(names) { return (names || []).map(function (n, i) { n = nk(String(n || '')).replace(/\s+/g, ' ').trim().slice(0, 40); return n ? (i + 1) + '走 ' + n : ''; }).filter(Boolean).join('／'); }
  function parseLegs(s) { var out = []; String(s || '').split('／').forEach(function (p) { var m = p.match(/^(\d)走 (.+)$/); if (m) out[+m[1] - 1] = m[2]; }); return out; }
  function relayRecord(f) {
    f = f || {}; var team = nk(String(f.team || '')).trim(), errs = [];
    if (!team) errs.push('チーム名（学校名）を入れてください');
    if (!isRelay(f.event)) errs.push('リレーの種目を選んでください（例：男子4×100mR）');
    var res = manualRecord(Object.assign({}, f, { name: team ? team + ' リレー' : '', wind: '' }));
    var names = (f.legs || []).map(function (x) { return String(x || '').trim(); }), n = names.filter(Boolean).length;
    if (n && n < 4) errs.push('走順は4人とも入れてください（わからないときは全員空けておけます）');
    var all = errs.concat((res.errors || []).filter(function (e) { return !/氏名/.test(e); }));
    if (!all.length) { res.rec.legs = legsText(names); if (!res.rec.legs) delete res.rec.legs; res.rec.manual = true; }
    return { rec: all.length ? null : res.rec, errors: all };
  }
  /* v0.26.21 リレーの結果を読み取る（PDF 2つの形・gold.jaic.org の速報）。読み取ったものは「候補」で、顧問が見て確かめてから 🏃リレーの記録に入れる。
     候補：{ event, round, heat, rank, lane, team, mark, comment, runners:[{ bib, name, kana, grade }]（並んでいる順＝1〜4走）, page } */
  function relayEvent(t) {
    var s = nk(String(t || '')).replace(/\s+/g, ''), g = (s.match(/(男子|女子|混合)/) || [])[1] || ((s.match(/(男|女)/) || [])[1] ? (s.match(/(男|女)/)[1] + '子') : '');
    var m = s.match(/(\d)[×xX＊*](\d{2,4})m?/); if (!m) return '';
    return g + m[1] + '×' + m[2] + 'mR';
  }
  // リレーのチーム名：「本郷中A」「城北B」の末尾の A・B…（同じ学校の何チーム目か）は、学校の名前の照合では外す
  function relayTeamBase(t) { return nk(String(t || '')).replace(/\s+/g, '').replace(/(?<=[^\sA-Za-z])[A-Ha-h]$/, ''); }
  function matchRelayTeam(team, q) { return matchSchool(team, q) || matchSchool(relayTeamBase(team), q); }
  function relayRunner(kanji, kana, bib) {
    var k = nk(kanji).replace(/\s+/g, ' ').trim(), g = parseGrade(k), name = (g.paren ? g.name : k).replace(/\s+/g, ' ').trim();
    var gr = g.grade || (/^\d{2}$/.test(g.paren || '') ? '' : '');
    return { bib: bib ? String(bib) : '', name: name, kana: nk(kana || '').replace(/\s+/g, ' ').trim(), grade: gr };
  }
  function roundOf(t) { var rm = nk(String(t || '')).replace(/\s/g, '').match(ROUND); return rm ? nk(rm[1]).replace('タイムレ-ス', 'タイムレース') : ''; }
  /* gold.jaic.org 速報（携帯向け）のリレー：「1位　　41.96<br>チーム<br>(1)名前(2)<br>…(4)…」。DNS・DQ は順位なし */
  /* v0.26.23：東京私学陸上情報（sgk-tandf.tokyo）などの PC 用速報（同じ集計ソフトの表の形）。
     見出し「順位 ﾚｰﾝ チーム／メンバー(colspan=3) 記録 ｺﾒﾝﾄ」、1行に「チーム<br>カナ」「(1)名前(学年)<br>…(4)」「カナ…」 */
  function relayPcTable(html, title) {
    var txt = function (h) { return nk(h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')).replace(/\s+/g, ' ').trim(); };
    var trs = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [], hi = -1, cols = null;
    for (var i = 0; i < trs.length && hi < 0; i++) {
      if (!/<th\b/i.test(trs[i])) continue;
      var hs = [], hcells = trs[i].match(/<th\b[^>]*>[\s\S]*?<\/th>/gi) || [];
      hcells.forEach(function (c) { var n = +((c.match(/colspan\s*=\s*["']?(\d+)/i) || [])[1] || 1), t = txt(c); for (var k = 0; k < n; k++) hs.push(k ? t + '#' + k : t); });
      var f = function (re) { for (var j = 0; j < hs.length; j++) if (re.test(hs[j])) return j; return -1; };
      var c0 = { rank: f(/^順位$/), lane: f(/^(ﾚｰﾝ|レーン)$/), team: f(/^チーム/), mark: f(/^記録$/), cmt: f(/^(ｺﾒﾝﾄ|コメント|備考)$/) };
      if (c0.rank >= 0 && c0.team >= 0 && c0.mark >= 0) { hi = i; cols = c0; }
    }
    if (hi < 0) return null;
    var ev = relayEvent(title), round = roundOf(title), hm = title.match(/(\d+)組/), heat = hm && !/総合/.test(round) ? +hm[1] : '';
    var dm = html.match(/<!--\s*(20\d\d)\/(\d{1,2})\/(\d{1,2})/), date = dm ? dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2) : '';
    var lines = function (h) { return String(h || '').split(/<br\s*\/?>/i).map(txt).filter(Boolean); };
    var out = [];
    trs.slice(hi + 1).forEach(function (tr) {
      var cs = (tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || []).map(function (c) { return c.replace(/^<td\b[^>]*>|<\/td>$/gi, ''); });
      if (cs.length < cols.mark + 1) return;
      var tl = lines(cs[cols.team]); if (!tl.length) return;
      var mk = cleanMark(txt(cs[cols.mark])), st = txt(cs[cols.mark]).match(/^(DNS|DNF|DQ|NM)\b/i), mark = st ? st[1].toUpperCase() : mk.mark;
      var cmt = cols.cmt >= 0 ? txt(cs[cols.cmt] || '') : '', rank = txt(cs[cols.rank] || '');
      if (!mark && !/^\d+$/.test(rank)) return;
      var names = lines(cs[cols.team + 1]), kanas = lines(cs[cols.team + 2]), runners = [];
      names.forEach(function (l, k) { var r = l.match(/^\((\d)\)\s*(.*)$/); if (r && r[2]) runners[+r[1] - 1] = relayRunner(r[2], kanas[k] || '', ''); });
      out.push({ event: ev, round: round, heat: heat, rank: /^\d+$/.test(rank) ? +rank : '', lane: cols.lane >= 0 && /^\d+$/.test(txt(cs[cols.lane] || '')) ? +txt(cs[cols.lane]) : '', team: tl[0].replace(/\s*[・･]\s*\d{1,2}$/, ''), mark: mark, comment: addTags(cmt.replace(/^\*/, ''), mk.tags), runners: runners.filter(Boolean), src: 'gold' });
    });
    return out.length ? { cands: out, title: title, date: date } : null;
  }
  function parseRelayGold(html) {
    html = String(html || '');
    var tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i), title = tm ? nk(tm[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : '';
    if (!isRelay(title) && !/リレー|\d\s*[×xX]\s*\d/.test(nk(title))) return null;
    var pc = relayPcTable(html, title); if (pc) return pc;
    if (!/<font\b[^>]*>[\s\S]{0,80}?(\d+\s*位|DNS|DQ|DNF)/i.test(html)) return null;
    var txt = function (h) { return nk(h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')).replace(/\s+/g, ' ').trim(); };
    var ev = relayEvent(title), round = roundOf(title), hm = title.match(/(\d+)組/), heat = hm && !/総合/.test(round) ? +hm[1] : '';
    var dm = html.match(/<!--\s*(20\d\d)\/(\d{1,2})\/(\d{1,2})/), date = dm ? dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2) : '';
    var out = [], body = html.replace(/^[\s\S]*?<\/head>/i, '');
    body.split(/<font\b[^>]*>/i).slice(1).forEach(function (blk) {
      blk = blk.split(/<\/font>|<hr|<ul|<a\b/i)[0];
      var L = blk.split(/<br\s*\/?>/i).map(txt); while (L.length && !L[L.length - 1]) L.pop();
      var rtags = []; L = L.filter(function (x, i) { if (i && isTag(x)) { rtags.push(x.replace(/^[*＊]+|[*＊]+$/g, '')); return false; } return true; });
      if (L.length < 2) return;
      var l0r = splitTags(L[0]); rtags = l0r.tags.concat(rtags); L[0] = l0r.s;
      var m = L[0].match(/^(?:(\d+)\s*位)?\s*(\d{1,2}:\d{2}\.\d{1,2}|\d{1,3}\.\d{2}|DNS|DNF|DQ|NM)?\s*(.*)$/); if (!m || !(m[1] || m[2])) return;
      var runners = [];
      L.slice(2).forEach(function (l) { var r = l.match(/^\((\d)\)\s*(.*)$/); if (r && r[2]) runners[+r[1] - 1] = relayRunner(r[2], '', ''); });
      runners = runners.filter(Boolean);
      out.push({ event: ev, round: round, heat: heat, rank: m[1] ? +m[1] : '', lane: '', team: L[1].replace(/\s*[・･]\s*\d{1,2}$/, ''), mark: m[2] || '', comment: addTags((m[3] || '').replace(/^\*/, ''), rtags), runners: runners, src: 'gold' });
    });
    return out.length ? { cands: out, title: title, date: date } : null;
  }
  /* PDF のリレー（座標）：見出し「順位 レーン チーム ナンバー 走者名（またはオーダー・カナ） 記録 コメント」。
     チーム名がある行から次のチーム名の行までを1チームとし、その中のナンバーの行を上から1〜4走にする */
  function relayHeaderCols(line, pageW) {
    var starts = line.w.filter(function (w) { return /^順位$/.test(w.n.replace(/\s/g, '')); });
    return starts.map(function (s, i) {
      var end = i + 1 < starts.length ? starts[i + 1].x - 2 : pageW + 1, c = { x0: s.x - 4, x1: end, y: line.y, rank: s.x };
      line.w.forEach(function (w) {
        if (w.x < s.x - 1 || w.x >= end) return;
        var n = w.n.replace(/\s/g, '');
        if (/^レーン$/.test(n)) c.lane = w.x;
        else if (/^チーム(名)?$/.test(n)) c.team = w.x;
        else if (/^(ナンバー|No\.?|ゼッケン)$/i.test(n)) c.bib = w.x;
        else if (/^(走者名?|氏名|オーダー|選手名|名前)$/.test(n)) c.name = c.name == null ? w.x : c.name;
        else if (/^(カナ|フリガナ)$/.test(n)) c.kana = w.x;
        else if (/^記録$/.test(n)) c.mark = w.x;
        else if (/^(コメント|備考)$/.test(n)) c.cmt = w.x;
      });
      return c;
    }).filter(function (c) { return c.team != null && c.bib != null && c.name != null && c.mark != null; });
  }
  function joinTight(ws) {   // 小さい字・詰めた字で1文字ずつに分かれていても、すき間が小さければつなげる
    var s = ''; ws.forEach(function (w, i) { if (i) { var p = ws[i - 1], gap = w.x - (p.x + p.w); s += gap > Math.max(2, 0.45 * (w.h || 8)) ? ' ' : ''; } s += w.t; }); return s;
  }
  function parseRelayPdf(pages) {
    var out = [], ev = '', round = '';
    pages.forEach(function (pg, pi) {
      var L = lines(toWords(pg.items)), events = [];
      L.forEach(function (l) {
        var t = l.text.replace(/\s+/g, ' ');
        if (/順位/.test(t) && /記録/.test(t) && /チーム/.test(t)) { var hc = relayHeaderCols(l, pg.width); if (hc.length) events.push({ y: l.y, type: 'hdr', cols: hc }); return; }
        var ts = t.replace(/\s/g, '');
        if (TITLE.test(ts) && t.length < 40 && !/順位/.test(t)) events.push({ y: l.y, type: 'ev', v: t.trim() });
        var rm = roundOf(ts); if (rm && t.length < 40 && !/順位/.test(t)) events.push({ y: l.y, type: 'round', v: rm });
        l.w.forEach(function (w) { var hm = w.n.match(/^(\d+)組$/); if (hm) events.push({ y: l.y, type: 'heat', x: w.x, v: +hm[1] }); });
      });
      events.sort(function (a, b) { return a.y - b.y; });
      var hdrs = events.filter(function (e) { return e.type === 'hdr'; });
      hdrs.forEach(function (h, hi) {
        var yEnd = hi + 1 < hdrs.length ? hdrs[hi + 1].y - 1 : pg.height + 1;
        var before = events.filter(function (e) { return e.y <= h.y; });
        before.forEach(function (e) { if (e.type === 'ev') { if (e.v !== ev) { ev = e.v; round = ''; } } if (e.type === 'round') round = e.v; });
        var evBreak = events.filter(function (e) { return (e.type === 'ev' || e.type === 'heat') && e.y > h.y + 2 && e.y < yEnd; });
        if (!isRelay(ev) && !relayEvent(ev)) return;
        h.cols.forEach(function (c) {
          var hev = before.filter(function (e) { return e.type === 'heat' && e.x >= c.x0 - 8 && e.x < c.x1 && h.y - e.y < 40; }).pop();
          var cEnd = yEnd; evBreak.forEach(function (e) { if ((e.type === 'ev' || (e.x >= c.x0 - 8 && e.x < c.x1)) && e.y < cEnd) cEnd = e.y - 1; });
          var ws = []; L.forEach(function (l) { if (l.y > h.y + 2 && l.y < cEnd) l.w.forEach(function (w) { if (w.x >= c.x0 && w.x < c.x1) ws.push(w); }); });
          var tz0 = c.lane != null ? c.lane + 8 : c.rank + 16, tz1 = c.bib - 2;
          var nameEnd = c.kana != null ? c.kana - 3 : c.mark - 12, kanaEnd = c.mark - 12;
          var bibs = ws.filter(function (w) { return /^\d{1,5}$/.test(w.n) && w.x >= c.bib - 30 && w.x < c.name - 2 && w.x > tz0; }), bibMin = bibs.length ? Math.min.apply(null, bibs.map(function (w) { return w.x; })) : tz1;
          tz1 = Math.max(tz1, bibMin - 1);
          var teamW = ws.filter(function (w) { return w.x >= tz0 - 2 && w.x < tz1 && !/^\d+$/.test(w.n); });
          var tl = []; teamW.forEach(function (w) { var l = tl.filter(function (x) { return Math.abs(x.y - w.y) < 2.2; })[0]; if (l) l.w.push(w); else tl.push({ y: w.y, w: [w] }); });
          tl.sort(function (a, b) { return a.y - b.y; });
          tl.forEach(function (t, ti) {
            var top = t.y - 3, bot = ti + 1 < tl.length ? tl[ti + 1].y - 3 : cEnd;
            var bw = ws.filter(function (w) { return w.y > top && w.y < bot; }), same = bw.filter(function (w) { return Math.abs(w.y - t.y) < 2.2; });
            var rank = same.filter(function (w) { return /^\d{1,3}$/.test(w.n) && w.x < (c.lane != null ? c.lane - 3 : tz0 - 8); })[0];
            var lane = c.lane != null ? same.filter(function (w) { return /^\d{1,2}$/.test(w.n) && w !== rank && w.x >= c.lane - 8 && w.x < tz0 + 4; }).pop() : null;
            var markW = same.filter(function (w) { return w.x >= c.mark - 20 && (c.cmt == null || w.x < c.cmt - 2) && (MARK.test(cleanMark(w.n).mark) || STATUS.test(w.n)); })[0];
            var cmt = c.cmt != null ? same.filter(function (w) { return w.x >= c.cmt - 2; }).map(function (w) { return w.n; }).join(' ') : '';
            var mark = markW ? (STATUS.test(markW.n) ? markW.n : cleanMark(markW.n).mark) : '';
            var rtg = same.filter(function (w) { return w.x >= c.mark - 20 && (c.cmt == null || w.x < c.cmt - 2) && isTag(w.n); }).map(function (w) { return w.n.replace(/^[*＊]+|[*＊]+$/g, ''); }).concat(markW && !STATUS.test(markW.n) ? cleanMark(markW.n).tags : []);
            var st = nk(cmt).match(/^(DQ|DNS|DNF)\b[,，\s]*(.*)$/); if (!mark && st) { mark = st[1]; cmt = st[2]; }
            var rows = []; bw.forEach(function (w) { if (/^\d{1,5}$/.test(w.n) && w.x >= Math.min(c.bib - 16, bibMin - 1) && w.x < c.name - 2 && w.x > tz0) rows.push(w); });
            rows.sort(function (a, b) { return a.y - b.y; });
            var runners = rows.map(function (b) {
              var lw = bw.filter(function (w) { return Math.abs(w.y - b.y) < 2.2 && w.x > b.x + b.w - 1; }).sort(function (p, q) { return p.x - q.x; });
              var kj = [], kn = [];
              lw.forEach(function (w) {
                if (c.kana != null) { if (w.x < nameEnd) kj.push(w); else if (w.x < kanaEnd) kn.push(w); }
                else if (w.x < kanaEnd) { if (HALFKANA.test(w.t) && kj.length) kn.push(w); else if (!kn.length) kj.push(w); else kn.push(w); }
              });
              return relayRunner(joinTight(kj), kn.map(function (w) { return w.t; }).join(' '), b.n);
            }).filter(function (r) { return r.name; });
            if (/^(DNS|DNF|DQ|NM|DSQ)\s*[:：]/.test(nk(joinTight(t.w)).replace(/\s+/g, ''))) return;   // v0.26.25：欄外の「DNS:欠場」などの説明はチームではない
            out.push({ event: relayEvent(ev), round: round, heat: hev ? hev.v : '', rank: rank ? +rank.n : '', lane: lane ? +lane.n : '', team: nk(joinTight(t.w)).replace(/\s+/g, ''), mark: mark, comment: addTags(nk(cmt).trim(), rtg), runners: runners, page: pi + 1, src: 'pdf' });
          });
        });
      });
    });
    return out;
  }
  // 同じチーム・同じ記録が「組」と「タイムレース総合」の両方にあるときは1つにして、総合の順位を overall に付ける
  function mergeRelays(list) {
    var by = {}, out = [];
    list.forEach(function (c) {
      var k = c.event + '|' + nameKey(c.team) + '|' + c.mark + '|' + (/DNS|DQ|DNF/.test(c.mark) ? c.heat : '');
      var o = by[k];
      if (!o) { by[k] = c; out.push(c); return; }
      var tot = /総合/.test(c.round) ? c : /総合/.test(o.round) ? o : null, heat = tot === c ? o : c;
      if (tot && heat !== tot) { heat.overall = tot.rank; if (!heat.runners.length) heat.runners = tot.runners; if (tot === o) { out[out.indexOf(o)] = heat; by[k] = heat; } }
    });
    return out;
  }
  function manualRecord(f) {
    f = f || {}; var errs = [], g = function (k) { return nk(String(f[k] == null ? '' : f[k])).replace(/\s+/g, ' ').trim(); };
    var r = { name: g('name'), kana: g('kana'), grade: g('grade').replace(/年生?$/, ''), team: g('team'), event: g('event'), round: g('round'), heat: '', lane: '', bib: '', rank: '', comment: '', date: g('date'), meet: g('meet') };
    if (!r.name) errs.push('氏名を入れてください');
    if (!r.event) errs.push('種目を入れてください');
    if (!validDate(r.date)) errs.push('日付を選んでください（必須）');
    var rk = g('rank'); if (rk) { if (/^\d{1,3}$/.test(rk)) r.rank = +rk; else errs.push('順位は数字で入れてください'); }
    var mk = g('mark'); if (/^[a-z]+$/i.test(mk)) mk = mk.toUpperCase(); mk = mk.replace(/^(\d+)"(\d{1,2})$/, '$1.$2');
    r.mark = normImportMark(mk, r.event, mk);
    if (!r.mark) errs.push('記録を入れてください');
    else if (!markValue(r.mark) && !STATUS.test(r.mark)) errs.push('記録の形がわかりません（例：11.85、4:31.15、5m74、DNS）');
    else if (markValue(r.mark) && isFieldEvent(r.event) !== !markValue(r.mark).lower) errs.push(isFieldEvent(r.event) ? 'この種目は距離（例：5m74）で入れてください' : 'この種目はタイム（例：11.85）で入れてください');
    var w = normManualWind(f.wind);
    if (w.err) errs.push(w.err);
    r.wind = hasMark(r) && windApplies(r.event) ? w.v : '';
    if (r.grade && !/^(小|中|高|大)?[1-6]$/.test(r.grade)) errs.push('学年は「2」「中2」「高1」のように入れてください');
    if (r.name.length > 60 || r.kana.length > 60 || r.team.length > 60 || r.event.length > 60 || r.meet.length > 100 || r.round.length > 30) errs.push('長すぎる項目があります');
    if (!r.meet && r.date) r.meet = '大会名なし（' + r.date + '）';
    return { rec: r, errors: errs };
  }
  /* v0.26.27 種目ごとにシートを分けたExcel：シート名・ブロック名 → 種目（100 → 100m・110H → 110mH・110JH → 110mJH・3000SC → 3000mSC・4×100 → 4×100mR）。種目に見えない名前（Sheet1 など）は '' */
  function sheetEvent(name) {
    var s = nk(String(name || '')).replace(/\s+/g, '').replace(/[xX＊*]/g, '×');
    if (!s || /^(sheet|シート|ｼｰﾄ)\d*$/i.test(s) || /^(記録|一覧|まとめ|名簿|集計)/.test(s)) return '';
    if (/^\d×\d{3,4}/.test(s)) return relayEvent(s);
    var m = s.match(/^(男子|女子)?(\d{2,5})(m|M)?(JH|H|SC|W|mW)?$/);
    if (m) return (m[1] || '') + m[2] + 'm' + (m[4] ? m[4].replace(/^m/, '') : '');
    if (/(跳|投|種競技|走|H$|SC$)/.test(s) || /^\d/.test(s)) return s;
    return '';
  }
  var BLOCK_HEAD = /^(氏名|名前|選手名|1走|１走|第1走者)$/;
  function cellS(v) { return nk(String(v == null ? '' : v)).replace(/[\s　]/g, ''); }
  /* シートの中の表（ブロック）を見つける。1枚に「名前…」の見出しが横・縦にいくつも並ぶ形にも対応。
     返り値：[{ hr, c0, c1, r1, label, relay }]（hr=見出しの行、c0〜c1=列、hr+1〜r1=記録の行、label=見出しのすぐ左（または上）のセル） */
  function sheetBlocks(aoa) {
    var out = [], used = {};
    for (var r = 0; r < aoa.length; r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) {
        if (used[r + ',' + c]) continue;
        var s = cellS(row[c]); if (!BLOCK_HEAD.test(s) && !(mapHeaders([row[c]]).mark != null && /^\d走/.test(cellS(row[c + 1])))) continue;
        // 見出しの並び：左右に、見出しらしいセルが続くところまで
        var isH = function (v) { var t = cellS(v); return t !== '' && (Object.keys(mapHeaders([v])).length > 0 || /^\d走|^第\d走/.test(t)); };
        var c0 = c; while (c0 > 0 && isH(row[c0 - 1])) c0--;
        var c1 = c; while (c1 + 1 < row.length && isH(row[c1 + 1])) c1++;
        var hdr = row.slice(c0, c1 + 1), map = mapHeaders(hdr), relay = hdr.some(function (v) { return /^(1走|第1走者)$/.test(cellS(v)); });
        if (map.mark == null || (map.name == null && !relay)) continue;
        for (var k = c0; k <= c1; k++) used[r + ',' + k] = 1;
        var label = c0 > 0 ? String(row[c0 - 1] == null ? '' : row[c0 - 1]).trim() : '';
        if (!label && r > 0) { var up = aoa[r - 1] || []; label = String(up[c0] == null ? '' : up[c0]).trim(); if (up.slice(c0 + 1, c1 + 1).some(function (v) { return cellS(v) !== ''; })) label = ''; }
        var r1 = r;
        for (var i = r + 1; i < aoa.length; i++) {
          var cs = (aoa[i] || []).slice(c0, c1 + 1);
          if (!cs.some(function (v) { return cellS(v) !== ''; })) break;
          if (cs.some(function (v) { return BLOCK_HEAD.test(cellS(v)); })) break;
          r1 = i;
        }
        out.push({ hr: r, c0: c0, c1: c1, r1: r1, label: label, relay: relay });
        c = c1;
      }
    }
    return out;
  }
  /* 1つのブロックを読む。opt：{ text, sheet, school, map（列を選び直したとき）} → { event, label, recs, bad, relays } */
  function importBlock(aoa, bl, opt) {
    opt = opt || {}; var txt = opt.text || aoa;
    var cut = function (a) { return a.slice(bl.hr, bl.r1 + 1).map(function (r) { return (r || []).slice(bl.c0, bl.c1 + 1); }); };
    var sa = cut(aoa), st = cut(txt), map = opt.map || mapHeaders(sa[0]);
    var ev = (bl.label && sheetEvent(bl.label)) || sheetEvent(opt.sheet) || (bl.label && /[跳投走]/.test(bl.label) ? bl.label : '');
    if (bl.relay) {
      var legs = []; sa[0].forEach(function (v, i) { var m = cellS(v).match(/^第?(\d)走/); if (m) legs[+m[1] - 1] = i; });
      var rev = ev && isRelay(ev) ? ev : relayEvent(bl.label || opt.sheet || '') || ev, relays = [], bad = [];
      for (var i = 1; i < sa.length; i++) {
        var row = sa[i], tr = st[i] || [];
        var mark = normImportMark(map.mark == null ? '' : row[map.mark], rev, map.mark == null ? '' : tr[map.mark]);
        var date = parseDateCell(map.date == null ? '' : row[map.date]) || parseDateCell(map.date == null ? '' : tr[map.date]);
        var runners = legs.map(function (k) { return { name: nk(String(row[k] == null ? '' : row[k])).replace(/\s+/g, ' ').trim(), bib: '', kana: '', grade: '' }; });
        var c = { event: rev, team: opt.school || '', mark: mark, rank: '', round: '', heat: '', lane: '', comment: '', runners: runners.filter(function (x) { return x.name; }).length ? runners : [], date: date, meet: map.meet == null ? '' : String(row[map.meet] || '').trim(), row: bl.hr + i + 1 };
        if (!markValue(mark) || !date || !isRelay(rev)) bad.push({ row: bl.hr + i + 1, why: !isRelay(rev) ? '種目' : !markValue(mark) ? (/^(DQ|DNS|DNF|NM|失格|棄権|欠場|途中棄権)/i.test(nk(String(mark || '')).trim()) ? nk(String(mark)).trim() + '（記録なし）' : '記録') : '日付' }); else relays.push(c);
      }
      return { event: rev, label: bl.label, recs: [], bad: bad, relays: relays, map: map };
    }
    var res = importRows(sa, map, { text: st, headerRow: 0, school: opt.school, def: map.event == null ? { event: ev } : null });
    res.recs.forEach(function (r) { r.row += bl.hr; }); res.bad.forEach(function (x) { x.row += bl.hr; });
    return { event: map.event == null ? ev : '', label: bl.label, recs: res.recs, bad: res.bad, relays: [], map: map };
  }
  /* ブック全体：sheets=[{ name, aoa, text }] → [{ name, blocks:[…importBlock], recs, relays, bad, note }] */
  function importWorkbook(sheets, opt) {
    opt = opt || {};
    return sheets.map(function (sh) {
      var bls = sheetBlocks(sh.text || sh.aoa), blocks = bls.map(function (bl) { return Object.assign(importBlock(sh.aoa, bl, { text: sh.text, sheet: sh.name, school: opt.school }), { at: bl }); });
      var o = { name: sh.name, blocks: blocks, recs: [], relays: [], bad: [], note: '' };
      blocks.forEach(function (b) { o.recs = o.recs.concat(b.recs); o.relays = o.relays.concat(b.relays); o.bad = o.bad.concat(b.bad); });
      if (!bls.length) o.note = (sh.aoa || []).some(function (r) { return (r || []).some(function (v) { return cellS(v) !== ''; }); }) ? '「名前」「タイム（記録）」の見出しが見つかりません' : '空のシート';
      else if (blocks.some(function (b) { return !b.event && b.map.event == null; })) o.note = '種目が分かりません（シート名か、表の左のセルに種目名を入れてください）';
      return o;
    });
  }
  /* v0.26.27 取り込む前の重複の確かめ：recs を、もう入っている記録 have（と、この取り込みの前の行）と比べる。
     'dup'＝入力済み（同じ人・種目・日付・記録）、'maybe'＝重複かも（同じ人・種目・記録で日付か大会名が違う／無い、または同じ日・種目で記録が違う）、''＝新しい記録 */
  function dupCheck(recs, have) {
    var ek = function (r) { return eventKey(r).replace(/男子|女子|混合/g, ''); }, mv = function (r) { var m = markValue(r.mark); return m ? String(m.v) : nk(String(r.mark || '')).trim(); };
    var idx = {}, add = function (r) { var k = nameKey(r.name || '') + '|' + ek(r); (idx[k] = idx[k] || []).push({ date: r.date || '', meet: nk(String(r.meet || '')).replace(/\s+/g, ''), mv: mv(r) }); };
    (have || []).forEach(add);
    return (recs || []).map(function (r) {
      var k = nameKey(r.name || '') + '|' + ek(r), list = idx[k] || [], d = r.date || '', m = mv(r), mt = nk(String(r.meet || '')).replace(/\s+/g, ''), out = { st: '', why: '' };
      if (nameKey(r.name || '') && list.some(function (x) { return x.date && x.date === d && x.mv === m; })) out = { st: 'dup', why: '同じ人・種目・日付・記録' };
      else if (list.some(function (x) { return x.mv === m && (x.date !== d || !x.date || !d || x.meet !== mt); })) out = { st: 'maybe', why: '同じ人・種目・記録（日付か大会名が違う）' };
      else if (list.some(function (x) { return d && x.date === d && x.mv !== m; })) out = { st: 'maybe', why: '同じ日・種目で記録が違う' };
      add(r); return out;
    });
  }
  /* v0.26.28 大会予定をまとめて追加（CSV・貼り付けた表）。見出し：大会名,日付,終了日,会場,区分（終了日・会場・区分は省略可。区分は 中／高）
     → { rows:[{ meet, date, end, venue, div, key, row, err }] }（key＝'日付|大会名'、記録・天気と同じ大会の印） */
  var PLAN_HEAD = [['meet', /^(大会名|大会|競技会)$/], ['date', /^(日付|開始日|期日|月日|日にち|開催日)$/], ['end', /^(終了日|最終日|終わりの日|日付\(終了\)|まで)$/], ['venue', /^(会場|場所|競技場)$/], ['div', /^(区分|中高|中学高校|学校種別|カテゴリ)$/], ['deadline', /^(締切|締め切り|〆切|エントリー締切|申込締切|申込締め切り|エントリー締め切り)$/]];
  function planDiv(v) { var s = nk(String(v || '')).replace(/\s+/g, ''); return !s ? '' : /^(中|中学|中学校|中体連|JH)$/i.test(s) ? '中学' : /^(高|高校|高等学校|高体連|HS)$/i.test(s) ? '高校' : null; }
  function planKey(date, meet) { return date + '|' + nk(String(meet || '')).replace(/\s+/g, ' ').trim(); }
  function parseMeetPlan(text) {
    var aoa = splitTable(text), out = [];
    if (!aoa.length) return { rows: [], err: '表が見つかりません' };
    var map = {}; (aoa[0] || []).forEach(function (h, i) { var s = nk(String(h || '')).replace(/[\s　*＊:：（）()]/g, ''); PLAN_HEAD.some(function (f) { if (map[f[0]] == null && f[1].test(s.replace(/省略可|任意/, ''))) { map[f[0]] = i; return true; } return false; }); });
    if (map.meet == null || map.date == null) return { rows: [], err: '1行目に「大会名」「日付」の見出しが必要です（例：大会名,日付,終了日,会場,区分）' };
    for (var i = 1; i < aoa.length; i++) {
      var r = aoa[i] || [], g = function (f) { return map[f] == null ? '' : String(r[map[f]] == null ? '' : r[map[f]]).trim(); };
      if (!r.some(function (c) { return String(c || '').trim() !== ''; })) continue;
      var meet = nk(g('meet')).replace(/\s+/g, ' ').trim(), ds = nk(g('date')), endS = g('end'), m = ds.match(/^(.+?)\s*[〜～~]\s*(.+)$/);
      if (m && !endS) { ds = m[1]; endS = m[2]; }
      var date = parseDateCell(ds), end = '';
      if (endS) { end = parseDateCell(endS); if (!end && date) { var mm = nk(endS).match(/^(?:(\d{1,2})[\/月.-])?(\d{1,2})日?$/); if (mm) end = parseDateCell(date.slice(0, 4) + '/' + (mm[1] || +date.slice(5, 7)) + '/' + mm[2]); } }
      var div = planDiv(g('div')), err = [], dlS = g('deadline'), dl = dlS ? parseDateCell(nk(dlS)) : '';
      if (dlS && !dl && date) { var dm = nk(dlS).match(/^(\d{1,2})[\/月.-](\d{1,2})日?$/); if (dm) { dl = parseDateCell(date.slice(0, 4) + '/' + dm[1] + '/' + dm[2]); if (dl && dl > date) dl = parseDateCell((+date.slice(0, 4) - 1) + '/' + dm[1] + '/' + dm[2]); } }
      if (!meet) err.push('大会名がありません'); else if (meet.length > 100) err.push('大会名が長すぎます（100字まで）');
      if (!date) err.push('日付が読めません（「' + g('date') + '」）');
      if (endS && !end) err.push('終了日が読めません（「' + endS + '」）'); else if (end && date && end < date) err.push('終了日が日付より前です'); else if (end === date) end = '';
      if (div === null) { err.push('区分は「中」か「高」（空でも可）'); div = ''; }
      if (dlS && !dl) err.push('締切が読めません（「' + dlS + '」）');
      out.push({ meet: meet, date: date, end: end, venue: nk(g('venue')).replace(/\s+/g, ' ').trim().slice(0, 100), div: div, deadline: dl, key: date && meet ? planKey(date, meet) : '', row: i + 1, err: err.join('・') });
    }
    return { rows: out, err: out.length ? '' : '大会の行がありません' };
  }
  var PLAN_TEMPLATE = '大会名,日付,終了日,会場,区分,締切\n東京都高校新人陸上競技大会 支部予選,2026/9/12,2026/9/13,駒沢オリンピック公園陸上競技場,高,2026/8/28\n江東区中学校秋季陸上競技大会,2026/10/4,,夢の島競技場,中,\n';
  /* v0.26.30 Google カレンダーなどの iCal（.ics）→ 大会予定の行（parseMeetPlan と同じ形）。終日の DTEND は「次の日」なので1日戻す。時刻つきは日本時間の日付 */
  function guessDiv(name) { var s = nk(String(name || '')); return /(中学|中体連|中学校|中学生|JH)/i.test(s) && !/高校|高体連/.test(s) ? '中学' : /(高校|高体連|高等学校|インターハイ|IH)/i.test(s) ? '高校' : ''; }
  /* v0.26.32 カレンダーの予定が大会らしいか（meet：大会らしい／not：大会ではなさそう／unk：大会か不明） */
  var MEET_RE = /(大会|選手権|記録会|競技会|駅伝|支部|ジュニア|新人|総体|インハイ|インターハイ|通信|公式|予選|決勝|マラソン|リレー|秋季|春季|夏季|冬季|区大会|都大会|県大会|府大会|道大会|陸上競技|陸協|中体連|高体連)/i;
  var NOT_RE = /(部活|練習|会議|休み|休養|オフ|OFF|清掃|保護者会|面談|終了後|活動なし|自主練|朝練|ミーティング|打ち合わせ|打合せ|説明会|試験|テスト期間|職員|研修)/i;
  var VENUE_RE = /(夢の島|味スタ|味の素|駒沢|駒澤|競技場|スタジアム|公園|陸上場|グラウンド|フィールド|国立|上柚木|大井|町田|江戸川)/;
  function meetNorm(s) { return nk(String(s || '')).normalize('NFKC').replace(/[\s　]/g, '').replace(/[(（][^)）]*[)）]/g, '').replace(/^第?\d+回/, '').replace(/\d{4}年?度?/g, '').toLowerCase(); }
  // 名前の最後の（…）が会場らしければ、会場にして名前から外す（「部活(終了後)」のような会場でないものはそのまま）
  function splitVenue(meet) {
    var m = String(meet || '').match(/^(.+?)\s*[(（]([^()（）]{1,30})[)）]\s*$/); if (!m) return { meet: meet, venue: '' };
    var v = m[2].trim();
    if (!v || NOT_RE.test(v) || /^(中止|延期|予定|仮|未定|調整中|午前|午後|\d|[月火水木金土日])/.test(v) || MEET_RE.test(v) && !VENUE_RE.test(v)) return { meet: meet, venue: '' };
    return { meet: m[1].trim(), venue: v };
  }
  // learn：{ inc: {名前:1}, exc: {名前:1} }（先生がこの端末で選んだこと）。venues：登録済みの会場
  function meetClass(meet, venue, o) {
    o = o || {}; var k = meetNorm(meet), L = o.learn || {};
    if (k && L.exc && L.exc[k]) return 'not'; if (k && L.inc && L.inc[k]) return 'meet';
    var t = nk(String(meet || ''));
    if (NOT_RE.test(t)) return 'not';
    if (MEET_RE.test(t)) return 'meet';
    var v = nk(String(venue || '')) + ' ' + ((t.match(/[(（]([^)）]*)[)）]/) || [])[1] || '');
    if (VENUE_RE.test(v)) return 'meet';
    if ((o.venues || []).some(function (x) { x = nk(String(x || '')).trim(); return x.length >= 2 && v.indexOf(x) >= 0; })) return 'meet';
    return 'unk';
  }
  function icsDay(v, p) {
    var m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return '';
    if (!m[4]) return okDate(m[1], m[2], m[3]);
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (m[7]) ms += 9 * 36e5;   // UTC → 日本時間
    else if (/TZID=/i.test(p || '') && !/Tokyo|Japan|JST/i.test(p)) ms += 0;   // ほかの地域の時刻はそのままの日付で読む
    var d = new Date(ms); return okDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function icsText(v) { return String(v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim(); }
  // 折り返し（改行＋空白）を文字に直す前に取る（日本語の途中で折り返されていても文字化けしない）
  function icsBytesToText(b) {
    var out = new Uint8Array(b.length), n = 0;
    for (var i = 0; i < b.length; i++) {
      if (b[i] === 13 && b[i + 1] === 10 && (b[i + 2] === 32 || b[i + 2] === 9)) { i += 2; continue; }
      if (b[i] === 10 && (b[i + 1] === 32 || b[i + 1] === 9)) { i += 1; continue; }
      out[n++] = b[i];
    }
    return new TextDecoder('utf-8').decode(out.subarray(0, n));
  }
  function parseIcs(text) {
    var t = String(text || '').replace(/^\ufeff/, '');
    if (!/BEGIN:VCALENDAR/i.test(t)) return { rows: [], err: 'カレンダー（iCal）の形ではありません' };
    var lines = t.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'), out = [], ev = null, cal = '', depth = 0, n = 0;
    lines.forEach(function (l) {
      var i = l.indexOf(':'); if (i < 0) return;
      var head = l.slice(0, i), val = l.slice(i + 1), name = head.split(';')[0].toUpperCase(), par = head.slice(name.length);
      if (name === 'BEGIN' && /^VEVENT$/i.test(val)) { ev = {}; depth = 0; return; }
      if (!ev) { if (name === 'X-WR-CALNAME') cal = icsText(val); return; }
      if (name === 'BEGIN') { depth++; return; }   // VALARM など
      if (name === 'END' && depth) { depth--; return; }
      if (name === 'END' && /^VEVENT$/i.test(val)) {
        n++;
        if (!/CANCELLED/i.test(ev.status || '') && !ev.rid) {
          var meet = nk(ev.summary || '').slice(0, 100), loc = nk(ev.loc || '').replace(/\s+/g, ' ').trim().slice(0, 100), sv = loc ? { meet: meet, venue: '' } : splitVenue(meet), date = icsDay(ev.ds, ev.dsp), end = '', err = [];
          if (ev.de) { end = icsDay(ev.de, ev.dep); if (end && /^\d{8}$/.test(ev.de)) end = new Date(Date.parse(end + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10); }
          if (end && (end <= date)) end = '';
          if (!meet) err.push('名前がありません'); if (!date) err.push('日付が読めません');
          if (sv.venue) { meet = sv.meet; loc = sv.venue; }
          out.push({ meet: meet, date: date, end: end, venue: loc, title: nk(ev.summary || '').slice(0, 100), div: guessDiv(meet), deadline: '', key: date && meet ? planKey(date, meet) : '', row: n, err: err.join('・'), rrule: !!ev.rrule });
        }
        ev = null; return;
      }
      if (depth) return;
      if (name === 'SUMMARY') ev.summary = icsText(val);
      else if (name === 'LOCATION') ev.loc = icsText(val);
      else if (name === 'DTSTART') { ev.ds = val.trim(); ev.dsp = par; }
      else if (name === 'DTEND') { ev.de = val.trim(); ev.dep = par; }
      else if (name === 'STATUS') ev.status = val;
      else if (name === 'RRULE') ev.rrule = val;
      else if (name === 'RECURRENCE-ID') ev.rid = val;
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { rows: out, cal: cal, err: out.length ? '' : '予定（VEVENT）がありません' };
  }
  return { parsePdf: parsePdf, parseCells: parseCells, goldMobileStream: goldMobileStream, parsePlain: parsePlain, textToStream: textToStream, normEvent: normEvent, markValue: markValue, windApplies: windApplies, windClass: windClass, windNum: windNum,
    computeBests: computeBests, baseEvent: baseEvent, learnGenders: learnGenders, isRelay: isRelay, relayEvent: relayEvent, relayTeamBase: relayTeamBase, matchRelayTeam: matchRelayTeam, parseRelayGold: parseRelayGold, parseRelayPdf: parseRelayPdf, mergeRelays: mergeRelays, legsText: legsText, parseLegs: parseLegs, relayRecord: relayRecord, pbLookup: pbLookup, nameKey: nameKey, athleteKey: athleteKey, matchSchool: matchSchool, schoolLoose: schoolLoose, cleanMark: cleanMark, isTag: isTag, canonSchool: canonSchool, cyuTeam: cyuTeam, recId: recId, recIdLegacy: recIdLegacy, recIdV6: recIdV6, identityKey: identityKey, fullIdentity: fullIdentity, looseIdentity: looseIdentity, manualRecord: manualRecord, sanitizeRecord: sanitizeRecord, validDate: validDate, normManualWind: normManualWind, dedupe: dedupe, normSchool: normSchool, schoolBase: schoolBase, nk: nk,
    guessMeet: guessMeet, seasonOf: seasonOf, seasonLabel: seasonLabel, isOfficial: isOfficial, gradeNum: gradeNum, improvement: improvement, fmtImprovement: fmtImprovement, pbDetails: pbDetails, ranking: ranking, allTimeTop: allTimeTop, athleteProfile: athleteProfile, cleanMeetName: cleanMeetName, dateFromText: dateFromText,
    eventCat: eventCat, divisionOf: divisionOf, divLabel: divLabel, eventKey: eventKey, eventKeyLabel: eventKeyLabel, shownWind: shownWind, hasMark: hasMark, sortAthletes: sortAthletes, kanaKey: kanaKey,
    setGenderDefault: setGenderDefault, setDivisionHints: setDivisionHints, setMeetDivs: setMeetDivs, divSource: divSource, divisionWhy: divisionWhy, splitTeamGrade: splitTeamGrade, setPersonDivs: setPersonDivs, setRosterDivs: setRosterDivs, divConflicts: divConflicts, gradeFromEvent: gradeFromEvent, fixRecord: fixRecord, jhOnlyEvent: jhOnlyEvent, rawDivisionOf: rawDivisionOf, genderOf: genderOf, divGroup: divGroup, disciplineOrder: disciplineOrder, groupEvents: groupEvents, gendersIn: gendersIn, GROUPS: GROUPS,
    personKey: personKey, inferDivisions: inferDivisions, mapHeaders: mapHeaders, findHeaderRow: findHeaderRow, parseDateCell: parseDateCell, normImportMark: normImportMark, dupCheck: dupCheck, parseMeetPlan: parseMeetPlan, parseIcs: parseIcs, icsBytesToText: icsBytesToText, guessDiv: guessDiv, meetClass: meetClass, splitVenue: splitVenue, meetNorm: meetNorm, planKey: planKey, PLAN_TEMPLATE: PLAN_TEMPLATE, sheetEvent: sheetEvent, sheetBlocks: sheetBlocks, importBlock: importBlock, importWorkbook: importWorkbook, importRows: importRows, splitTable: splitTable, isTable: isTable, FIELD_LABELS: FIELD_LABELS, isFieldEvent: isFieldEvent };
})();
if (typeof module !== 'undefined') module.exports = ResultParser;
