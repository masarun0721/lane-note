/* v0.28.1 要項の締切（エントリー締切・参加料の振込締切・A票などの提出締切）を、読み込んだ要項の文字から読む。
   推測しない：見つからない・日付が2つ以上でどれか決められないときは空にする（画面で「締切を読めませんでした」） */
var LaneDeadline = (function () {
  var KIND = {
    entry: /(エントリー|申込|申し込み|ＪＡＡＦ|JAAF|日本陸連|スタートライン|STARTLINE|登録システム)/i,
    pay: /(参加料|参加費|振込|振り込み|振り 込|払込|払い込み|納入)/,
    slip: /([AＡBＢ]票|申込書|申込用紙|申込一覧|一覧表|必要書類)/
  };
  var DUE = /(締切|締め切|〆切|期限|必着|まで|迄|期間|受付|提出|持参|〜|～|~)/, NG = /(大会期日|開催日|期日[:：]|競技日|日時[:：]|会期)/;
  function nk(s) { return String(s || '').normalize('NFKC').replace(/[\u3000\t]/g, ' '); }
  // v0.28.2 PDF から取り出した文字は、1文字ずつ間に空白が入ることがある（「申 込 期 間」「10 月 23 日」）。日本語どうし・数字と月日時のあいだの空白だけ消す
  function sp(l) {
    var tk = l.split(' '); if (tk.length >= 6 && tk.filter(function (t) { return t.length === 1; }).length >= tk.length * 0.6) return l.replace(/ /g, '');   // 1文字ずつ空いている行
    return l.replace(/([^\x00-\x7f]) (?=[^\x00-\x7f])/g, '$1').replace(/([^\x00-\x7f]) (?=[^\x00-\x7f])/g, '$1').replace(/(\d) (?=[月日年時分])/g, '$1').replace(/([月日年]) (?=\d)/g, '$1');
  }
  function pad(n) { return ('0' + n).slice(-2); }
  function valid(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return m >= 1 && m <= 12 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
  // 行の中の日付（年があればその年）：2026年10月23日・10月23日（金）・10/23・R8.10.23 は対象外。後ろの時刻（17:00・17時）も
  var DRE = /(?:(20\d\d)\s*年\s*)?(\d{1,2})\s*(?:月\s*(\d{1,2})\s*日|\/\s*(\d{1,2}))(?!\d)\s*(?:[(（][月火水木金土日・祝休]{1,3}[)）])?\s*(?:(\d{1,2})\s*(?::|時)\s*(\d{2})?\s*分?)?/g;
  function datesIn(line, refY, meetDay) {
    var out = [], m; DRE.lastIndex = 0;
    while ((m = DRE.exec(line))) {
      var mo = +m[2], d = +(m[3] || m[4]), y = m[1] ? +m[1] : refY;
      if (!valid(y, mo, d)) continue;
      var day = y + '-' + pad(mo) + '-' + pad(d);
      if (!m[1] && meetDay && day > meetDay) { y--; if (!valid(y, mo, d)) continue; day = y + '-' + pad(mo) + '-' + pad(d); }   // 締切は大会より前
      var hh = m[5] != null && +m[5] <= 24 ? +m[5] : null;
      out.push({ date: day, time: hh != null ? pad(hh) + ':' + pad(m[6] ? +m[6] : 0) : '', at: m.index });
    }
    return out;
  }
  // 1つの種類の締切：その言葉がある行（日付が無ければ次の行も）の、範囲なら最後の日付。ちがう日付が2つ以上なら決めない
  // v0.28.2 参加費・A票の話もしている行（「申込ファイル…A票送付及び参加費の振り込みは…締切」）も、本体の行があればエントリーには使わない。
  // v0.28.2 本体の申込期間とは別の、一部の種目・追加などの期間（八種競技・混成・追加申込・他支部など）。
  //   本体の行が1つに決まるときは、こちらは使わない（同じ要項に日付がいくつもあって「読めない」になっていた）
  var SUB = /(八種|七種|十種|混成|追加|他支部|[a-zａ-ｚ][)）]|[〇○●◎※])/i;
  function one(lines, re, refY, meetDay, other, cut) {
    var got = [];
    lines.forEach(function (l, i) {
      if (cut) { var m = SUB.exec(l), km = re.exec(l); if (m && km && m.index > km.index) l = l.slice(0, m.index); }   // 行の途中から別の期間の話になるときは、そこで切る
      if (!re.test(l) || NG.test(l)) return;
      if (/[〜～~] *$/.test(l) && lines[i + 1]) l = l + ' ' + lines[i + 1];   // 「10月13日 ～」で行が切れて、終わりの日が次の行にある
      if (other && l.replace(other, '') !== l && !re.test(l.replace(other, ''))) return;   // 「申込書」「A票・参加料」だけの行はエントリーに数えない
      var ds = datesIn(l, refY, meetDay), src = l;
      if (!ds.length && lines[i + 1] && !Object.keys(KIND).some(function (k) { return KIND[k].test(lines[i + 1]); })) { ds = datesIn(lines[i + 1], refY, meetDay); src = l + ' ' + lines[i + 1]; }
      if (!ds.length || !DUE.test(src)) return;
      var last = ds[ds.length - 1]; got.push({ date: last, from: ds.length > 1 ? ds[0].date : '', src: src.trim().slice(0, 80), sub: !!cut && (SUB.test(src.slice(0, Math.max(0, src.search(/\d+ ?(月|\/)/)))) || (other ? new RegExp(other.source).test(src) : false)) });
    });
    if (cut) { var main = got.filter(function (g) { return !g.sub; }); if (main.length && main.length < got.length) got = main; }
    var uniq = {}; got.forEach(function (g) { uniq[g.date.date + ' ' + g.date.time] = g; });
    var ks = Object.keys(uniq); if (!ks.length) return null;
    var days = {}; ks.forEach(function (k) { days[k.slice(0, 10)] = 1; });
    if (Object.keys(days).length > 1) return { amb: true };
    var best = ks.map(function (k) { return uniq[k]; }).sort(function (a, b) { return b.date.time.length - a.date.time.length; })[0];
    return { date: best.date.date, time: best.date.time, from: best.from, src: best.src };
  }
  // text：要項の文字（行ごと）。meetDay：大会の日（YYYY-MM-DD・年を決める）
  function parse(text, meetDay) {
    var lines = nk(text).split(/\n+/).map(function (l) { return sp(l.replace(/\s+/g, ' ').trim()); }).filter(Boolean);
    var refY = /^\d{4}/.test(meetDay || '') ? +meetDay.slice(0, 4) : new Date().getFullYear();
    var r = {
      entry: one(lines, KIND.entry, refY, meetDay, /(参加料|参加費|振込|振り込み|払込|払い込み|納入|[AＡBＢ]票|申込書|申込用紙|申込一覧|一覧表|必要書類)/g, true),
      pay: one(lines, KIND.pay, refY, meetDay),
      slip: one(lines, KIND.slip, refY, meetDay)
    };
    Object.keys(r).forEach(function (k) { if (!r[k] || r[k].amb) r[k] = r[k] && r[k].amb ? { amb: true } : null; });
    r.via = via(lines);
    return r;
  }
  /* v0.28.1 エントリーの出し方。要項にはっきり書いてある言葉だけで決める（推測しない）。
     jaaf：JAAF・STARTLINE・スタートライン／nishi：NISHI・NANS21V・NANS／mail：申込・エントリー・送付・提出の行に「メール」「E-mail」かアドレス。
     ちがう出し方が2つ以上出たら {amb:true}。どれも無ければ null。アドレスは要項に書いてあるときだけ */
  var VIA = { jaaf: /JAAF|STARTLINE|スタートライン|日本陸連|athleticfamily/i, nishi: /NISHI|NANS21V|NANS ?21|NANS/i, mail: /メール|E-?mail|[\w.+-]+@[\w-]+(\.[\w-]+)+/i };
  var VIA_LABEL = { jaaf: 'JAAF', nishi: 'NISHI', mail: 'メール', other: 'その他' };
  function via(lines) {
    if (typeof lines === 'string') lines = nk(lines).split(/\n+/);
    var got = {}, mail = '';
    lines.forEach(function (l) {
      if (VIA.jaaf.test(l)) got.jaaf = 1;
      if (VIA.nishi.test(l)) got.nishi = 1;
      if (VIA.mail.test(l) && /申込|申し込|エントリー|送付|送信|提出|添付/.test(l) && !/問い?合わ?せ/.test(l)) { got.mail = 1; var m = /[\w.+-]+@[\w-]+(\.[\w-]+)+/.exec(l); if (m && !mail) mail = m[0]; }
    });
    var ks = Object.keys(got); if (!ks.length) return null; if (ks.length > 1) return { amb: true };
    return ks[0] === 'mail' ? { via: 'mail', mail: mail } : { via: ks[0] };
  }
  /* v0.28.2 参加料（参加費）：個人・リレー・混成・プログラムの1つあたりの円。要項に1つの値だけ書いてあるものだけ（2つ以上ちがう値があれば、その種類は空） */
  var FEE = { indiv: '個人', relay: 'リレー', comb: '混成', prog: 'プログラム' };
  function fees(text) {
    var t = sp(nk(text).replace(/\s+/g, ' ')), o = {};
    Object.keys(FEE).forEach(function (k) {
      var re = new RegExp(FEE[k] + '(?:種目|競技)?(?:[^\\d円。]{0,6}\\d(?:種目|チーム|部|人|名))?[^\\d円。]{0,6}?(\\d{1,2}(?:,\\d{3})+|\\d{2,5}) ?円', 'g'), v = {}, m;
      while ((m = re.exec(t))) v[+m[1].replace(/,/g, '')] = 1;
      var ks = Object.keys(v); if (ks.length === 1) o[k] = +ks[0];
    });
    return o;
  }
  function daysLeft(day, today) { return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5); }
  function md(day) { var m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day || ''); return m ? +m[1] + '/' + +m[2] : ''; }
  // 画面の小さい札：{t, c}。c は soon（3日以内）・over（過ぎた）・muted（チェック済み）・''（ふつう）・warn（読めない）
  function chip(d, today, done) {
    if (!d) return null;
    if (d.amb || !d.date) return { t: '締切を読めませんでした', c: 'warn' };
    var n = daysLeft(d.date, today), t = '〆 ' + md(d.date) + '(' + '日月火水木金土'.charAt(new Date(d.date + 'T00:00:00Z').getUTCDay()) + ')' + (d.time || '');
    if (done) return { t: t, c: 'muted' };
    return { t: t + (n > 0 ? '（あと' + n + '日）' : n === 0 ? '（今日）' : '（過ぎました）'), c: n < 0 ? 'over' : n <= 3 ? 'soon' : '' };
  }
  return { parse: parse, fees: fees, via: via, VIA_LABEL: VIA_LABEL, chip: chip, daysLeft: daysLeft, md: md, datesIn: datesIn };
})();
if (typeof module !== 'undefined') module.exports = LaneDeadline;
