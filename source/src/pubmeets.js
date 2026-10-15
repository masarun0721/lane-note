/* v0.26.35 みんなの要項（学校をこえて、公開されている大会要項のURLを分け合う）
 * ・pubMeets/{日付_名前のハッシュ}：大会名・日付・会場・要項のURL（公開ページ）と読み取った公開情報だけ。選手のデータ・PDFの中身は入れない
 * ・登録できるのは顧問だけ（pubQuota/{uid} にチームを書き、ルールで顧問か確かめる）。1日20件・30秒に1回まで
 * ・v0.26.38 みんなの結果（pubResults）：同じ作りで、結果のURL（速報・gold.jaic.org・PDF）と大会の情報だけ。読み取った中身（選手・記録・学校名）は入れない。
 *   自動では読み込まない（押したら、その先生の端末が読む→自分の学校の行だけ→確認画面）
 * ・報告3件で見えなくなる（hid）。v0.26.39（監査 C509）：自動では読み込まない。いつも「この要項を使う」を押したときだけ
 * ・v0.26.39（監査 C501・C502・C508・C512）：quota は1つの対象（tgt）・1つの操作（op）だけに使える。差し替えは登録した本人だけ（by は作成者のまま）。
 *   ほかの先生は「報告」だけ。読めるのは Google でログインした人だけで、期限（exp）が過ぎたものは読めない（一覧も exp の条件つき） */
var LanePub = (function () {
  var OFFICIAL = [/(^|\.)jaaf\.or\.jp$/, /(^|\.)kotorikkyo\.info$/, /\.lg\.jp$/, /\.ed\.jp$/, /\.go\.jp$/, /\.ac\.jp$/];
  var DAY_MAX = 20, GAP_S = 30, HIDE_AT = 3;
  function nk(s) { return String(s == null ? '' : s).normalize('NFKC'); }
  // 大会名をそろえる：空白・記号・「第n回」・年度・西暦/令和を落とす
  function normName(s) {
    return nk(s).toLowerCase().replace(/第\s*\d+\s*回/g, '').replace(/(令和|平成)\s*\d+\s*年度?/g, '').replace(/(19|20)\d{2}\s*年度?/g, '').replace(/年度/g, '')
      .replace(/[\s　・･、。,.\-‐－―ー〜~「」『』【】\[\]()（）〈〉<>"'!！?？:：/／]/g, '').slice(0, 100);
  }
  function bigrams(s) { var o = {}; for (var i = 0; i < s.length - 1; i++) { var b = s.substr(i, 2); o[b] = (o[b] || 0) + 1; } return o; }
  function sim(a, b) {
    a = normName(a); b = normName(b); if (!a || !b) return 0; if (a === b) return 1;
    if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return 0.9;
    var x = bigrams(a), y = bigrams(b), n = 0, t = 0, k; for (k in x) { t += x[k]; if (y[k]) n += Math.min(x[k], y[k]); } for (k in y) t += y[k];
    return t ? 2 * n / t : 0;
  }
  function h8(s) { var h = 0x811c9dc5; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')); }
  function docId(date, name) { return date + '_' + h8(normName(name)); }
  function hostOf(u) { try { var x = new URL(u); return x.protocol === 'https:' ? x.hostname.toLowerCase() : ''; } catch (e) { return ''; } }
  function official(host) { host = String(host || '').toLowerCase(); return OFFICIAL.some(function (r) { return r.test(host); }); }
  function okUrl(u) { var h = hostOf(u); return !!h && h.indexOf('.') > 0 && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) && String(u).length <= 1000; }
  // 日付が同じ（または大会の期間に入る）で、名前が似ているもの。似ている順
  function match(list, plan, now) {
    now = now || Date.now();
    return (list || []).filter(function (e) {
      if (!e || e.hid || (e.rep || 0) >= HIDE_AT || !okUrl(e.url) || hostOf(e.url) !== e.host) return false;
      if (e.exp && e.exp < now) return false;
      var inDay = e.date === plan.date || (plan.end && e.date >= plan.date && e.date <= plan.end) || (e.end && plan.date >= e.date && plan.date <= e.end);
      return inDay;
    }).map(function (e) { return Object.assign({}, e, { score: sim(e.name, plan.meet) }); })
      .filter(function (e) { return e.score >= 0.6; }).sort(function (a, b) { return b.score - a.score || (b.at || '') .localeCompare(a.at || ''); });
  }
  // v0.26.39（監査 C509）：自動では読み込まない（転送先・別の大会の資料を確かめられないため）。いつも先生が押したときだけ
  function pickAuto(ms) { return null; }
  function srcText(e) {
    return '出典：' + (e.host || '') + (official(e.host) ? '（公式のサイト）' : '（公式かどうか未確認）') + '・' + String(e.at || '').slice(0, 10) + ' にほかの先生が登録' + (e.ver > 1 ? '（差し替え' + (e.ver - 1) + '回）' : '') + (e.rep ? '・報告 ' + e.rep + '件' : '');
  }
  function entry(plan, url, info, venue) {
    var o = { name: nk(plan.meet).trim().slice(0, 100), key: normName(plan.meet), date: plan.date, end: isDay(plan.end) ? plan.end : plan.date, venue: nk(venue || plan.venue || '').trim().slice(0, 60), url: String(url).slice(0, 1000), host: hostOf(url) };
    var j = ''; try { j = JSON.stringify({ rules: info && info.rules || {}, fees: info && info.fees || {} }); } catch (e) { }
    o.info = j.length <= 8000 ? j : '{}'; return o;
  }
  // v0.26.38 結果のページの種類（gold.jaic.org／PDF／それ以外＝速報など）
  function resKind(u) { var h = hostOf(u); return /(^|\.)gold\.jaic\.org$/.test(h) ? 'gold' : /\.pdf(\?|#|$)/i.test(String(u)) ? 'pdf' : 'live'; }
  function entryRes(plan, url) {
    return { name: nk(plan.meet).trim().slice(0, 100), key: normName(plan.meet), date: plan.date, end: isDay(plan.end) ? plan.end : plan.date, venue: nk(plan.venue || '').trim().slice(0, 60), url: String(url).slice(0, 1000), host: hostOf(url), kind: resKind(url) };
  }
  function exp(plan) { return Date.parse((isDay(plan.end) ? plan.end : plan.date) + 'T00:00:00+09:00') + 31 * 864e5; }
  function make(o) {
    var F = o.F, fs = o.fs, uid = o.uid, COL = o.col === 'pubResults' ? 'pubResults' : 'pubMeets', RES = COL === 'pubResults', PREF = RES ? 'pubres' : 'pub';
    function d() { return F.doc.apply(null, [fs].concat([].slice.call(arguments))); }
    function quota(b, team, q, id, op) {
      var now = Date.now(), day = Math.floor(now / 864e5), same = q && q.day === day, n = same ? (q.n || 0) + 1 : 1;
      if (same && n > DAY_MAX) throw Object.assign(new Error('今日はもう登録できません（1日' + DAY_MAX + '件まで）'), { code: 'rate' });
      if (q && q.atMs && now - q.atMs < GAP_S * 1000) throw Object.assign(new Error('少し待ってからもう一度（' + GAP_S + '秒に1回まで）'), { code: 'rate' });
      b.set(d('pubQuota', uid), { team: team, at: F.serverTimestamp(), day: day, n: n, tgt: COL + '/' + id, op: op });   // v0.26.39 C501：この1件・この操作だけ
    }
    async function myQuota() { var s = await F.getDoc(d('pubQuota', uid)); if (!s.exists()) return null; var v = s.data(); return { day: v.day, n: v.n, atMs: v.at && v.at.toMillis ? v.at.toMillis() : 0 }; }
    function plain(id, v) { return Object.assign({}, v, { id: id, at: v.at && v.at.toDate ? v.at.toDate().toISOString() : v.at, exp: v.exp && v.exp.toMillis ? v.exp.toMillis() : v.exp }); }
    return {
      // 検索：その日の大会（隠れていないもの）
      //   v0.26.39 期限（exp）が過ぎたものはルールで読めないので、一覧も exp の条件をつける（ルールは request.time と比べるので、少し先の時刻で問い合わせる。
      //   端末の時計が遅れていて断られたときは、もっと先の時刻でもう一度）。本番では date・hid・exp の複合インデックスが要る
      search: async function (plan) {
        var s = null, err = null, out = [];
        for (var k = 0, ahead = [36e5, 2 * 864e5]; k < ahead.length && !s; k++) {
          var q = F.query(F.collection(fs, COL), F.where('date', '==', plan.date), F.where('hid', '==', false), F.where('exp', '>', F.Timestamp.fromMillis(Date.now() + ahead[k])), F.limit(20));
          try { s = await F.getDocs(q); } catch (e) { err = e; if (!/permission/.test(String(e && e.code || ''))) break; }
        }
        if (!s) throw err;
        s.forEach(function (x) { out.push(plain(x.id, x.data())); }); return match(out, plan);
      },
      get: async function (plan) { var id = docId(plan.date, plan.meet); try { var s = await F.getDoc(d(COL, id)); return s.exists() ? plain(id, s.data()) : null; } catch (e) { return null; } },
      isCoach: async function (team) { if (!team) return false; try { var s = await F.getDoc(d('teams', team, 'members', uid)); return s.exists() && s.data().role === 'coach'; } catch (e) { return false; } },
      // 登録・差し替え（old があれば差し替え。v0.26.39 C502：差し替えは登録した本人だけ）
      publish: async function (plan, url, info, team, old) {
        if (!okUrl(url)) throw new Error('公開ページ（https）のURLだけ登録できます');
        if (old && old.by !== uid) throw Object.assign(new Error('ほかの先生が登録したものは差し替えられません（まちがっていれば「⚠ 報告」してください）'), { code: 'notmine' });
        var id = old ? old.id : docId(plan.date, plan.meet), e = RES ? entryRes(plan, url) : entry(plan, url, info), b = F.writeBatch(fs);
        quota(b, team, await myQuota(), id, old ? 'update' : 'create');
        var v = RES ? { url: e.url, host: e.host, kind: e.kind, at: F.serverTimestamp() } : { url: e.url, host: e.host, info: e.info, at: F.serverTimestamp() };
        if (old) b.update(d(COL, id), Object.assign(v, { ver: (old.ver || 1) + 1 }));   // 差し替え：大会名・日付・期限・登録した人（by）はそのまま
        else b.set(d(COL, id), Object.assign(e, v, { by: uid, exp: F.Timestamp.fromMillis(exp(plan)), ver: 1, rep: 0, hid: false }));
        await b.commit(); return id;
      },
      // 報告（1人1回）。3件で隠れる
      report: async function (e, team) {
        var b = F.writeBatch(fs), rep = (e.rep || 0) + 1;
        quota(b, team, await myQuota(), e.id, 'report');
        b.set(d(COL, e.id, 'reports', uid), { at: F.serverTimestamp() });
        b.update(d(COL, e.id), { rep: rep, hid: rep >= HIDE_AT });
        await b.commit(); return rep;
      },
      remove: async function (e) { await F.deleteDoc(d(COL, e.id)); },
      pref: async function () { try { var s = await F.getDoc(d('users', uid, 'settings', PREF)); return s.exists() ? !!s.data().on : null; } catch (e) { return null; } },
      clearPref: async function () { await F.deleteDoc(d('users', uid, 'settings', PREF)); },   // v0.26.38：「聞く」に戻す（次の1回だけまた聞く）
      setPref: async function (on) { await F.setDoc(d('users', uid, 'settings', PREF), { on: !!on, at: new Date().toISOString() }); }
    };
  }
  return { normName: normName, sim: sim, h8: h8, docId: docId, hostOf: hostOf, official: official, okUrl: okUrl, match: match, pickAuto: pickAuto, srcText: srcText, entry: entry, entryRes: entryRes, resKind: resKind, exp: exp, make: make, DAY_MAX: DAY_MAX, GAP_S: GAP_S, HIDE_AT: HIDE_AT };
})();
if (typeof module !== 'undefined') module.exports = LanePub;
