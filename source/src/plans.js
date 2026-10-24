/* v0.26.29 大会予定（記録のページで登録したこれからの大会）。この端末に名前・日付・会場・区分・締切だけを写して、大会準備・選手のページでも使う */
var LanePlans = (function () {
  var KEY = 'lanenote.plans.v1', WD = ['日', '月', '火', '水', '木', '金', '土'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() { var d = new Date(Date.now() + 9 * 36e5); return d.toISOString().slice(0, 10); }
  function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function clean(p) {
    p = p || {}; if (!isDay(p.date) || !p.meet) return null;
    var o = { date: p.date, meet: String(p.meet).slice(0, 100) };
    if (isDay(p.end) && p.end > p.date) o.end = p.end;
    if (p.venue) o.venue = String(p.venue).slice(0, 100);
    if (p.div === '中学' || p.div === '高校') o.div = p.div;
    if (isDay(p.deadline)) o.deadline = p.deadline;
    if (isDay(p.payDue)) o.payDue = p.payDue;   // v0.26.31 振込締切（カレンダーに出す）
    return o;
  }
  function sort(list) { return list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.meet < b.meet ? -1 : 1; }); }
  function fromMets(mets) { return sort(Object.keys(mets || {}).map(function (k) { var m = mets[k]; return m && m.plan ? clean(m) : null; }).filter(Boolean)); }
  // v0.26.30（A01）：この端末の写しは、写したアカウント（uid。ログインなしは ''）を付けて、同じアカウントのときだけ使う
  function save(list, uid, team) { try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), uid: String(uid || ''), team: String(team || ''), list: sort((list || []).map(clean).filter(Boolean)).slice(0, 300) })); } catch (e) { } }
  // v0.26.33 写しの保存先（チームのときはチームID）。同じアカウントのときだけ
  function team(uid) { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && String(o.uid || '') === String(uid || '') ? String(o.team || '') : ''; } catch (e) { return ''; } }
  function load(uid) { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && Array.isArray(o.list) && String(o.uid || '') === String(uid || '') ? o.list.map(clean).filter(Boolean) : []; } catch (e) { return []; } }
  /* v0.26.30 選手へのリンクに入れる「これからの大会」：[日付, 終了日, 大会名, 会場] だけ（選手の情報は入れない）。20件まで */
  var SC_MAX = 20;
  function toSc(list, td) { return upcoming((list || []).map(clean).filter(Boolean), td).slice(0, SC_MAX).map(function (p) { return [p.date, p.end || '', p.meet, p.venue || '']; }); }
  function fromSc(a) {
    if (a == null) return []; if (!Array.isArray(a)) throw new Error('リンクの中身の形が違います');
    return a.slice(0, SC_MAX).map(function (r) {
      if (!Array.isArray(r)) throw new Error('リンクの中身の形が違います');
      var st = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
      return clean({ date: st(r[0], 10), end: st(r[1], 10), meet: st(r[2], 100), venue: st(r[3], 100) });
    }).filter(Boolean);
  }
  function scHtml(list, td, max) {
    td = td || today(); var up = upcoming(list, td).slice(0, max || 8); if (!up.length) return '';
    return '<ul class="lp-list lp-sc">' + up.map(function (p) { var n = daysLeft(p.date, td); return '<li><span class="lp-left' + (n <= 7 ? ' soon' : '') + '">' + esc(leftLabel(p, td)) + '</span> <b>' + esc(range(p)) + '</b> ' + esc(p.meet) + (p.venue ? '<br><small class="muted">📍 ' + esc(p.venue) + '</small>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function upcoming(list, td) { td = td || today(); return sort((list || []).filter(function (p) { return (p.end || p.date) >= td; })); }
  function past(list, td) { td = td || today(); return sort((list || []).filter(function (p) { return (p.end || p.date) < td; })).reverse(); }
  function daysLeft(day, td) { td = td || today(); return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(td + 'T00:00:00Z')) / 864e5); }
  function wd(day) { return WD[new Date(day + 'T00:00:00Z').getUTCDay()]; }
  function jp(day) { return +day.slice(0, 4) + '年' + +day.slice(5, 7) + '月' + +day.slice(8, 10) + '日（' + wd(day) + '）'; }
  function md(day) { if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(day)) return '';   // v0.29.7（R296-04）文字の日付でなければ空
    return +day.slice(5, 7) + '/' + +day.slice(8, 10) + '（' + wd(day) + '）'; }
  function range(p) { return md(p.date) + (p.end ? '〜' + md(p.end) : ''); }
  function jpRange(p) { if (!p.end) return jp(p.date); return jp(p.date) + '〜' + (p.end.slice(0, 7) === p.date.slice(0, 7) ? +p.end.slice(8, 10) + '日（' + wd(p.end) + '）' : jp(p.end).replace(/^\d+年/, '')); }
  function leftLabel(p, td) {
    td = td || today(); var n = daysLeft(p.date, td);
    if (n > 0) return 'あと' + n + '日'; if (n === 0) return '今日'; return (p.end && p.end >= td) ? '開催中' : '終了';
  }
  function deadlineLabel(p, td) {
    if (!p.deadline) return ''; var n = daysLeft(p.deadline, td || today());
    return n > 0 ? 'エントリー締切 ' + md(p.deadline) + '（あと' + n + '日）' : n === 0 ? 'エントリー締切は今日' : 'エントリー締切 ' + md(p.deadline) + '（過ぎました）';
  }
  // 1か月のカレンダー（ym='2026-10'）。大会の日（複数日はその間すべて）と締切の日に印
  function monthHtml(list, ym, td, extra) {
    td = td || today(); var y = +ym.slice(0, 4), m = +ym.slice(5, 7), first = new Date(Date.UTC(y, m - 1, 1)), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), on = {}, dl = {}, pd = {};
    (list || []).forEach(function (p) {
      for (var d = p.date; d <= (p.end || p.date); d = new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10)) (on[d] = on[d] || []).push(p.meet);
      if (extra) return;   // v0.28.1 締切は extra（手入力と要項から読んだもの）で出す
      if (p.deadline) (dl[p.deadline] = dl[p.deadline] || []).push(p.meet);
      if (p.payDue) (pd[p.payDue] = pd[p.payDue] || []).push(p.meet);
    });
    var xk = {}; (extra || []).forEach(function (x) { if (isDay(x.day)) (xk[x.day] = xk[x.day] || []).push(x); });
    var h = '<table class="lp-cal" aria-label="' + y + '年' + m + '月"><tr>' + WD.map(function (w, i) { return '<th' + (i === 0 ? ' class="sun"' : i === 6 ? ' class="sat"' : '') + '>' + w + '</th>'; }).join('') + '</tr><tr>';
    var c = first.getUTCDay(); for (var i = 0; i < c; i++) h += '<td></td>';
    for (var dd = 1; dd <= n; dd++) {
      var day = ym + '-' + (dd < 10 ? '0' : '') + dd, ev = on[day] || [], dz = dl[day] || [], pz = pd[day] || [];
      h += '<td class="' + (day === td ? 'today ' : '') + (ev.length ? 'meet ' : '') + (dz.length || pz.length || (xk[day] || []).length ? 'dl' : '') + '"' + (ev.length || dz.length || pz.length ? ' title="' + esc(ev.concat(dz.map(function (x) { return '締切：' + x; }), pz.map(function (x) { return '振込締切：' + x; })).join('\n')) + '"' : '') + '><b>' + dd + '</b>' +
        ev.slice(0, 2).map(function (x) { return '<span class="lp-ev">' + esc(x.slice(0, 8)) + '</span>'; }).join('') + (ev.length > 2 ? '<span class="lp-ev">ほか' + (ev.length - 2) + '</span>' : '') + (dz.length ? '<span class="lp-dl">締切</span>' : '') + (pz.length ? '<span class="lp-dl lp-pd">振込</span>' : '') +
        (xk[day] || []).map(function (x) { return '<span class="lp-dk k-' + x.k + (x.done ? ' done' : '') + '" data-dk="' + x.k + '" title="' + esc((x.k === 'pay' ? '振込締切：' : 'エントリー締切：') + x.meet + (x.done ? '（済）' : '')) + '">〆' + (x.k === 'pay' ? '振込' : 'エントリー') + ' ' + esc(x.meet.slice(0, 6)) + '</span>'; }).join('') + '</td>';
      if ((c + dd) % 7 === 0 && dd < n) h += '</tr><tr>';
    }
    return h + '</tr></table>';
  }
  /* v0.26.31 大会ごとの進み具合（m＝大会の印。n＝この大会の記録の件数） */
  function stage(m, td, n) {
    td = td || today(); m = m || {}; var dl, ended = (m.end || m.date) < td;
    if (n > 0 || m.importedAt) return { k: 'done', t: '結果取込済' + (n > 0 ? '（' + n + '件）' : ''), c: 'ok' };
    if (ended) return { k: 'nores', t: '終了・結果未取込', c: 'warn' };
    if (m.date <= td) return { k: 'now', t: '開催中', c: 'now' };
    if (!m.entryAt) { dl = isDay(m.deadline) ? daysLeft(m.deadline, td) : null; return { k: 'noentry', t: dl != null && dl < 0 ? '未エントリー（締切過ぎ）' : '未エントリー', c: dl != null && dl <= 7 ? 'ng' : 'todo' }; }
    if (!m.payAt) { dl = isDay(m.payDue) ? daysLeft(m.payDue, td) : null; return { k: 'nopay', t: 'エントリー済・未振込', c: dl != null && dl <= 7 ? 'ng' : 'todo' }; }
    return { k: 'ready', t: '準備OK', c: 'ok' };
  }
  function addMonth(ym, k) { var d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1)); return d.toISOString().slice(0, 7); }
  return { team: team, stage: stage, isDay: isDay, KEY: KEY, toSc: toSc, fromSc: fromSc, scHtml: scHtml, clean: clean, fromMets: fromMets, save: save, load: load, upcoming: upcoming, past: past, daysLeft: daysLeft, jp: jp, jpRange: jpRange, md: md, range: range, leftLabel: leftLabel, deadlineLabel: deadlineLabel, monthHtml: monthHtml, addMonth: addMonth, today: today, esc: esc };
})();
if (typeof module !== 'undefined') module.exports = LanePlans;
