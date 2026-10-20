/* v0.28.1 要項の締切（エントリー締切・参加料の振込締切・A票などの提出締切）を、読み込んだ要項の文字から読む。
   推測しない：見つからない・日付が2つ以上でどれか決められないときは空にする（画面で「締切を読めませんでした」） */
var LaneDeadline = (function () {
  var KIND = {
    entry: /(エントリー|申込|申し込み|ＪＡＡＦ|JAAF|スタートライン|STARTLINE|登録システム)/i,
    pay: /(参加料|振込|振り込み|払込|払い込み|納入)/,
    slip: /([AＡBＢ]票|申込書|申込用紙|申込一覧|一覧表)/
  };
  var DUE = /(締切|締め切|〆切|期限|必着|まで|迄|期間|受付|提出|〜|～|~)/, NG = /(大会期日|開催日|期日[:：]|競技日|日時[:：]|会期)/;
  function nk(s) { return String(s || '').normalize('NFKC').replace(/[\u3000\t]/g, ' '); }
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
  function one(lines, re, refY, meetDay, other) {
    var got = [];
    lines.forEach(function (l, i) {
      if (!re.test(l) || NG.test(l)) return;
      if (other && l.replace(other, '') !== l && !re.test(l.replace(other, ''))) return;   // 「申込書」「A票・参加料」だけの行はエントリーに数えない
      var ds = datesIn(l, refY, meetDay), src = l;
      if (!ds.length && lines[i + 1] && !Object.keys(KIND).some(function (k) { return KIND[k].test(lines[i + 1]); })) { ds = datesIn(lines[i + 1], refY, meetDay); src = l + ' ' + lines[i + 1]; }
      if (!ds.length || !DUE.test(src)) return;
      var last = ds[ds.length - 1]; got.push({ date: last, from: ds.length > 1 ? ds[0].date : '', src: src.trim().slice(0, 80) });
    });
    var uniq = {}; got.forEach(function (g) { uniq[g.date.date + ' ' + g.date.time] = g; });
    var ks = Object.keys(uniq); if (!ks.length) return null;
    var days = {}; ks.forEach(function (k) { days[k.slice(0, 10)] = 1; });
    if (Object.keys(days).length > 1) return { amb: true };
    var best = ks.map(function (k) { return uniq[k]; }).sort(function (a, b) { return b.date.time.length - a.date.time.length; })[0];
    return { date: best.date.date, time: best.date.time, from: best.from, src: best.src };
  }
  // text：要項の文字（行ごと）。meetDay：大会の日（YYYY-MM-DD・年を決める）
  function parse(text, meetDay) {
    var lines = nk(text).split(/\n+/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var refY = /^\d{4}/.test(meetDay || '') ? +meetDay.slice(0, 4) : new Date().getFullYear();
    var r = {
      entry: one(lines, KIND.entry, refY, meetDay, /(参加料|振込|振り込み|払込|払い込み|納入|[AＡBＢ]票|申込書|申込用紙|申込一覧|一覧表)/g),
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
  var VIA = { jaaf: /JAAF|STARTLINE|スタートライン/i, nishi: /NISHI|NANS21V|NANS ?21|NANS/i, mail: /メール|E-?mail|[\w.+-]+@[\w-]+(\.[\w-]+)+/i };
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
  return { parse: parse, via: via, VIA_LABEL: VIA_LABEL, chip: chip, daysLeft: daysLeft, md: md, datesIn: datesIn };
})();
if (typeof module !== 'undefined') module.exports = LaneDeadline;
