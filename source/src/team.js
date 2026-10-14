/* ===== v0.26：チームで共有（顧問・マネージャーが、それぞれ自分の Google アカウントで同じチームの記録を使う）
   ・権限は firestore.rules で決める（この画面の表示は案内だけ）。ここはルールに合う形で読み書きする部品
   ・A01：呼ぶ側が始めたときの uid・世代を固定した check() を渡す。待つたびに check() し、変わっていたら中止
   ・選手の個人情報はここでは扱わない（メンバーの名前は本人の Google の表示名を本人が入れる） */
var LaneTeam = (function () {
  'use strict';
  var AL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   // 見まちがえやすい 0 O 1 l I を除く（57文字）
  var AL62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function rnd(n, al) {
    al = al || AL62; var out = '', buf = new Uint8Array(n * 2), lim = 256 - (256 % al.length);
    while (out.length < n) { crypto.getRandomValues(buf); for (var i = 0; i < buf.length && out.length < n; i++) if (buf[i] < lim) out += al[buf[i] % al.length]; }
    return out;
  }
  function newTeamId() { return rnd(20); }
  function newSecret() { return rnd(24, AL); }   // 57^24 ≒ 2^140
  function newHid() { return rnd(20); }
  // 参加コード：チームID(20)＋「-」＋秘密(24)。マネージャー用は最後に「-期限の年月日(8けた)」が付く（期限はルールがコードの文書と照合するので、書きかえると入れない）
  function ymd(ms) { var j = new Date(ms + 9 * 3600e3); return '' + j.getUTCFullYear() + ('0' + (j.getUTCMonth() + 1)).slice(-2) + ('0' + j.getUTCDate()).slice(-2); }
  function dayEnd(y, m, d) { return Date.UTC(y, m - 1, d, 23, 59, 59) - 9 * 3600e3; }   // その日の 23:59:59（日本時間）
  function snapEnd(ms) { var j = new Date(ms + 9 * 3600e3); return dayEnd(j.getUTCFullYear(), j.getUTCMonth() + 1, j.getUTCDate()); }
  function codeStr(t, s, mexp) { return t + '-' + s + (mexp ? '-' + ymd(mexp) : ''); }
  function parseCode(s) {
    var m = /^\s*([A-Za-z0-9]{20})[-\s]*([A-Za-z0-9]{24})(?:[-\s]*(\d{4})(\d{2})(\d{2}))?\s*$/.exec(String(s || '').normalize('NFKC'));
    return m ? { team: m[1], secret: m[2], role: m[3] ? 'manager' : 'coach', mexp: m[3] ? dayEnd(+m[3], +m[4], +m[5]) : null } : null;
  }
  // 年度末（3/31 23:59:59・日本時間）。今が4月以降なら来年の3/31
  function schoolYearEnd(now) {
    var d = new Date(now || Date.now()), jst = new Date(d.getTime() + 9 * 3600e3), y = jst.getUTCFullYear(), m = jst.getUTCMonth() + 1;
    if (m >= 4) y++;
    return dayEnd(y, 3, 31);
  }
  var META = ['_by', '_at', '_st', '_h', '_del', '_doc'];   // _doc：読んだ文書のID（v0.26.2 R261-03。保存はしない）
  function strip(r) { var o = {}; Object.keys(r || {}).forEach(function (k) { if (META.indexOf(k) < 0) o[k] = r[k]; }); return o; }
  function docId(id) { return String(id).replace(/\//g, '∕'); }
  /* v0.26.1（C404）：記録の形（firestore.rules の validRecShape と同じ）。決まった項目だけを残し、型と長さを確かめる */
  var STR = { id: 400, name: 120, kana: 120, grade: 120, team: 120, event: 120, round: 120, mark: 120, wind: 120, comment: 300, meet: 120, date: 120, src: 300, savedAt: 120, updatedAt: 120, lane: 120, bib: 120, sex: 120, dupOf: 400, warn: 300, aid: 11, legs: 300 };
  var NUM = ['heat', 'rank', 'overall', 'order'];
  // 正しい形に直せないときは null（del=true のときは必須項目なしで、使える項目だけ残す）
  function shape(r, del) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    var o = {};
    for (var k in STR) { if (!Object.prototype.hasOwnProperty.call(STR, k)) continue; var v = r[k]; if (v == null) continue; if (typeof v === 'number' && isFinite(v) && k !== 'id' && k !== 'date') v = String(v); if (typeof v === 'string' && v.length <= STR[k]) o[k] = v; else if (!del) return null; }
    for (var i = 0; i < NUM.length; i++) { var x = r[NUM[i]]; if (x == null) continue; if ((typeof x === 'number' && isFinite(x)) || (typeof x === 'string' && x.length <= 20)) o[NUM[i]] = x; else if (!del) return null; }
    if (typeof r.manual === 'boolean') o.manual = r.manual; else if (r.manual != null && !del) return null;
    if (!o.id) return null;
    if (!del && (!o.name && o.name !== '' || !o.event || o.mark == null || !o.meet || !/^\d{4}-\d{2}-\d{2}$/.test(o.date || ''))) return null;
    return o;
  }
  // v0.26.2（R261-02）：読み込んだ記録を「元の型のまま」厳しく調べる（変換して合格にしない）。R261-03：文書IDと id が合わない記録も不合格
  function validRec(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    for (var k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      var v = r[k];
      if (Object.prototype.hasOwnProperty.call(STR, k)) { if (typeof v !== 'string' || v.length > STR[k]) return false; }
      else if (NUM.indexOf(k) >= 0) { if (!((typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && v.length <= 20))) return false; }
      else if (k === 'manual') { if (typeof v !== 'boolean') return false; }
      else if (META.indexOf(k) < 0) return false;
    }
    if (typeof r.id !== 'string' || !r.id) return false;
    if ('_doc' in r && r._doc !== docId(r.id)) return false;
    if (r._del) return true;
    return typeof r.name === 'string' && typeof r.mark === 'string' && typeof r.event === 'string' && !!r.event && typeof r.meet === 'string' && !!r.meet && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '');
  }
  function clean(r) { var o = {}; Object.keys(r).forEach(function (k) { if (r[k] !== undefined && META.indexOf(k) < 0) o[k] = r[k]; }); return o; }
  var BATCH = 8;   // 調整は test/rules_team_check.mjs で確かめる
    // ルールの「1回のまとめ書きで読む文書は20まで」に収める（記録＋履歴＝2件ずつ）

  function make(o) {
    var F = o.F, fs = o.fs, uid = o.uid, ok = o.check || function () { };
    var myName = String(o.name || '').slice(0, 40) || 'メンバー';
    function d() { return F.doc.apply(null, [fs].concat([].slice.call(arguments))); }
    function col() { return F.collection.apply(null, [fs].concat([].slice.call(arguments))); }
    var srvDoc = F.getDocFromServer || F.getDoc, srvDocs = F.getDocsFromServer || F.getDocs;
    async function commit(b) { ok(); await b.commit(); ok(); }

    async function myTeams() {
      ok(); var s = await srvDocs(col('users', uid, 'teams')); ok(); var out = [];
      s.forEach(function (x) { var v = x.data() || {}; out.push({ id: x.id, name: v.name || '', role: v.role || '' }); });
      return out;
    }
    async function info(t) {
      ok(); var a = await srvDoc(d('teams', t)); ok();
      var m = await srvDoc(d('teams', t, 'members', uid)); ok();
      if (!a.exists() || !m.exists()) return null;
      var me = m.data(); return { id: t, name: a.data().name, ownerUid: a.data().ownerUid, role: me.role, expiresAt: me.expiresAt ? me.expiresAt.toMillis() : null, owner: a.data().ownerUid === uid };
    }
    async function createTeam(name) {
      name = String(name || '').trim().slice(0, 40); if (!name) throw new Error('チーム名を入れてください');
      var t = newTeamId(), b = F.writeBatch(fs);
      b.set(d('teams', t), { v: 1, name: name, ownerUid: uid, createdAt: F.serverTimestamp() });
      b.set(d('teams', t, 'members', uid), { role: 'coach', name: myName, joinedAt: F.serverTimestamp() });
      await commit(b);
      await F.setDoc(d('users', uid, 'teams', t), { name: name, role: 'coach', at: new Date().toISOString() }); ok();
      await regen(t, 'coach'); await regen(t, 'manager', schoolYearEnd());
      return t;
    }
    async function codes(t) {
      ok(); var s = await srvDocs(col('teams', t, 'codes')); ok(); var out = {};
      s.forEach(function (x) { var v = x.data(), me = v.mexp ? v.mexp.toMillis() : null; out[v.role] = { code: codeStr(t, x.id, me), id: x.id, mexp: me, exp: v.exp ? v.exp.toMillis() : null, max: v.max || null, used: v.used || 0, approve: !!v.approve }; });
      return out;
    }
    // 作り直す：同じ役割の古いコードを消して、新しいコードを1つ作る（古いコードはもう使えない）
    // v0.26.9 opt：{ exp:コードの期限(ms), max:使える回数, approve:顧問の承認が要る }
    async function regen(t, role, mexpMs, opt) {
      opt = opt || {};
      ok(); var s = await srvDocs(col('teams', t, 'codes')); ok();
      var b = F.writeBatch(fs);
      s.forEach(function (x) { if ((x.data() || {}).role === role) b.delete(x.ref); });
      var sec = newSecret(), v = { role: role, createdAt: F.serverTimestamp(), by: uid }, me = null;
      if (role === 'manager') { me = snapEnd(mexpMs || schoolYearEnd()); v.mexp = F.Timestamp.fromMillis(me); }
      if (opt.exp) v.exp = F.Timestamp.fromMillis(snapEnd(opt.exp));
      if (opt.max) { v.max = Math.max(1, Math.min(100, Math.floor(opt.max))); v.used = 0; }
      if (opt.approve) v.approve = true;
      b.set(d('teams', t, 'codes', sec), v);
      await commit(b);
      return codeStr(t, sec, me);
    }
    async function join(str) {
      var c = parseCode(str); if (!c) throw new Error('参加コードの形がちがいます（「-」をはさんだ長いコードです）');
      ok(); var jt = await srvDoc(d('joinTries', uid)); ok();
      var n = jt.exists() ? (jt.data().n || 0) + 1 : 1;
      try { await F.setDoc(d('joinTries', uid), { n: n, lastAt: F.serverTimestamp(), team: c.team, code: c.secret }); ok(); }
      catch (e) { if (e && e.code === 'permission-denied') { var er = new Error('続けて試すことはできません。10秒ほど待ってから、もう一度押してください'); er.code = 'too-fast'; throw er; } throw e; }
      var v = { role: c.role, name: myName, joinedAt: F.serverTimestamp() };   // v0.26.1（C401）：秘密は members に入れない（joinTries だけ）
      if (c.role === 'manager') v.expiresAt = F.Timestamp.fromMillis(c.mexp);
      // v0.26.9：承認が要るコード・回数の制限があるコードかは、入ってみないとわからない（コードの中身は顧問しか読めない）。
      //   ふつう → 回数つき → 承認つき → 承認＋回数つき の順に試す（ルールが合うものだけ通す）
      var tries = [{ pend: false, used: false }, { pend: false, used: true }, { pend: true, used: false }, { pend: true, used: true }], done = null, last = null;
      for (var i = 0; i < tries.length && !done; i++) {
        var tr = tries[i], mv = Object.assign({}, v); if (tr.pend) { mv.role = 'pending'; mv.want = c.role; }
        var b = F.writeBatch(fs); b.set(d('teams', c.team, 'members', uid), mv);
        if (tr.used) b.update(d('teams', c.team, 'codes', c.secret), { used: F.increment(1) });
        try { await b.commit(); ok(); done = tr; } catch (e) { if (!(e && (e.code === 'permission-denied' || e.code === 'not-found'))) throw e; last = e; }
      }
      // v0.26.35：このアカウントがもうこのチームにいる（メンバー・承認待ち）／外されているときは、そう伝える（コードのまちがいとまぎらわしいため）
      if (!done) {
        var mine = null, ban = false;
        try { var ms = await srvDoc(d('teams', c.team, 'members', uid)); ok(); mine = ms.exists() ? ms.data() : null; } catch (e) { if (!(e && e.code === 'permission-denied')) throw e; }
        if (!mine) { try { var bs = await srvDoc(d('teams', c.team, 'banned', uid)); ok(); ban = bs.exists(); } catch (e) { if (!(e && e.code === 'permission-denied')) throw e; } }
        var RL = { coach: '顧問', manager: 'マネージャー' }, e3 = null;
        if (mine && mine.role === 'pending') { e3 = new Error('このGoogleアカウントは、このチームに参加を申しこみ済みで、顧問の承認待ちです。承認されるまでお待ちください（同じコードで何度押しても変わりません）。別のアカウントで入りたいときは、ログアウトしてから入り直してください。'); e3.code = 'already-pending'; }
        else if (mine) { e3 = new Error('このGoogleアカウントは、もうこのチームに' + (RL[mine.role] || 'メンバー') + 'として入っています。チームの画面を開き直してください。役割を変えたいときは、チームの顧問に頼んでください。'); e3.code = 'already-member'; }
        else if (ban) { e3 = new Error('このGoogleアカウントは、このチームから外されています。もう一度入るには、チームの顧問に「再参加を許可」してもらってください。'); e3.code = 'banned'; }
        if (e3) throw e3;
      }
      if (!done) { var e2 = new Error('このコードでは入れませんでした（コードのまちがい・作り直された・期限切れ・使える回数を使い切った・期限の書きかえ などが考えられます）'); e2.code = 'bad-code'; throw e2; }
      if (done.pend) { await F.setDoc(d('users', uid, 'teams', c.team), { name: '', role: 'pending', at: new Date().toISOString() }); ok(); return { team: c.team, role: 'pending', want: c.role, name: '' }; }
      var a = await srvDoc(d('teams', c.team)); ok();
      await F.setDoc(d('users', uid, 'teams', c.team), { name: a.data().name, role: c.role, at: new Date().toISOString() }); ok();
      return { team: c.team, role: c.role, name: a.data().name };
    }
    async function members(t) {
      ok(); var s = await srvDocs(col('teams', t, 'members')); ok(); var out = [];
      s.forEach(function (x) { var v = x.data(); out.push({ uid: x.id, role: v.role, want: v.want || '', name: v.name, expiresAt: v.expiresAt ? v.expiresAt.toMillis() : null, joinedAt: v.joinedAt ? v.joinedAt.toMillis() : null }); });
      return out.sort(function (a, b) { return (a.role === b.role ? 0 : a.role === 'coach' ? -1 : 1) || (a.joinedAt || 0) - (b.joinedAt || 0); });
    }
    async function setRole(t, who, role, expMs) {
      var v = { role: role, want: F.deleteField() }; v.expiresAt = role === 'manager' ? F.Timestamp.fromMillis(expMs || schoolYearEnd()) : F.deleteField();
      ok(); await F.updateDoc(d('teams', t, 'members', who), v); ok();
    }
    // v0.26.1（C402）：外す・外した印・その役割のコードの作り直しを、1回のまとめ書きで（途中で失敗しても、どれかだけが残らない）
    async function remove(t, who, opt) {
      opt = opt || {}; ok();
      var m = await srvDoc(d('teams', t, 'members', who)); ok(); if (!m.exists()) return;
      var mv = m.data(), s = await srvDocs(col('teams', t, 'codes')); ok();
      var b = F.writeBatch(fs);
      b.delete(d('teams', t, 'members', who));
      b.set(d('teams', t, 'banned', who), { name: String(mv.name || 'メンバー').slice(0, 40), by: uid, at: F.serverTimestamp() });
      s.forEach(function (x) { if ((x.data() || {}).role === mv.role) b.delete(x.ref); });
      var sec = newSecret(), v = { role: mv.role, createdAt: F.serverTimestamp(), by: uid };
      if (mv.role === 'manager') v.mexp = F.Timestamp.fromMillis(snapEnd(opt.mexp || schoolYearEnd()));
      b.set(d('teams', t, 'codes', sec), v);
      await commit(b);
    }
    // v0.26.9 承認待ちの人：承認（want の役割にする）・断る（消す）
    async function approve(t, who, m) { return setRole(t, who, m.want, m.want === 'manager' ? m.expiresAt : null); }
    async function reject(t, who) { ok(); await F.deleteDoc(d('teams', t, 'members', who)); ok(); }
    async function myStatus(t) { ok(); var m = await srvDoc(d('teams', t, 'members', uid)); ok(); return m.exists() ? m.data().role : null; }
    async function banned(t) { ok(); var s = await srvDocs(col('teams', t, 'banned')); ok(); var out = []; s.forEach(function (x) { var v = x.data(); out.push({ uid: x.id, name: v.name, at: v.at ? v.at.toMillis() : null }); }); return out; }
    async function unban(t, who) { ok(); await F.deleteDoc(d('teams', t, 'banned', who)); ok(); }
    async function leave(t) { ok(); await F.deleteDoc(d('teams', t, 'members', uid)); ok(); await F.deleteDoc(d('users', uid, 'teams', t)); ok(); }
    async function forget(t) { ok(); await F.deleteDoc(d('users', uid, 'teams', t)); ok(); }
    async function transfer(t, who) { ok(); await F.updateDoc(d('teams', t), { ownerUid: who }); ok(); }
    async function rename(t, name) { ok(); await F.updateDoc(d('teams', t), { name: String(name).trim().slice(0, 40) }); ok(); }

    /* ---------- 記録（teams/{T}/records）と変更履歴（teams/{T}/hist） ---------- */
    async function getRecords(t) {
      ok(); var s = await srvDocs(col('teams', t, 'records')); ok(); var out = [];
      s.forEach(function (x) { var v = x.data(); if (!v._del) { v._doc = x.id; out.push(v); } });   // 文書IDを別に持つ（R261-03）
      return out;
    }
    // 1件ずつ「前の中身」をサーバーから読み、履歴と一緒に書く（ルールが前と後を照合する）
    // items: [{rid, data}] data=記録の中身／null=削除の印／'keep'=中身はそのまま（確認済みにする）
    var NAMES = {};   // 履歴の名前はメンバー文書の名前と同じにする（ルール C405）
    async function memberName(t) { if (NAMES[t]) return NAMES[t]; ok(); var m = await srvDoc(d('teams', t, 'members', uid)); ok(); NAMES[t] = m.exists() ? m.data().name : myName; return NAMES[t]; }
    // opt.strict（v0.26.2 R261-01）：1件でも形が正しくなければ、何も書かずにエラー（編集・手入力用）。一括取り込みは今までどおり飛ばして数える
    function badRecErr() { var e = new Error('入力が長すぎるか、形が正しくないため保存できません（大会名・氏名・所属・ラウンドなどを短くしてください）。元の記録はそのままです'); e.code = 'bad-record'; return e; }
    async function write(t, role, items, opt) {
      opt = opt || {};
      if (opt.strict && items.some(function (it) { return it.data && it.data !== 'keep' && !shape(it.data, false); })) throw badRecErr();
      if (opt.strict && items.length > BATCH) throw new Error('一度に直せる数をこえています');
      var nm = await memberName(t), res = { written: 0, skipped: 0 };
      for (var i = 0; i < items.length; i += BATCH) {
        var part = items.slice(i, i + BATCH), b = F.writeBatch(fs), n = 0;
        ok(); var curs = await Promise.all(part.map(function (it) { return srvDoc(d('teams', t, 'records', docId(it.rid))); })); ok();
        for (var j = 0; j < part.length; j++) {
          var it = part[j], rid = docId(it.rid), cur = curs[j].exists() ? curs[j].data() : null;
          if ((it.data === 'keep' || !it.data) && !cur) continue;   // ないものは確認も削除もしない
          var keep = it.data === 'keep', hid = newHid();
          var base = it.repair ? { id: rid } : keep ? shape(cur, !!cur._del) : it.data ? shape(it.data, false) : shape(cur, true);   // repair：壊れた記録の中身は写さず、文書IDだけの削除の印
          if (!base) { if (opt.strict) throw badRecErr(); res.skipped++; continue; }   // 形が正しくない記録は書かない（C404）
          var rec = Object.assign({}, base, { _by: uid, _at: F.serverTimestamp(), _st: role === 'coach' ? (it.st || 'ok') : 'pending', _h: hid });
          if (!keep && !it.data) rec._del = true;
          b.set(d('teams', t, 'records', rid), rec);
          b.set(d('teams', t, 'hist', hid), { rid: rid, uid: uid, name: nm, at: F.serverTimestamp(), act: it.act || (cur && !cur._del ? 'edit' : 'add'), before: cur, after: rec });
          n++;
        }
        if (n) { await commit(b); res.written += n; }
        if (opt.progress) opt.progress(Math.min(i + BATCH, items.length), items.length);
      }
      return res;
    }
    async function put(t, role, list, act, opt) { return write(t, role, list.map(function (r) { return { rid: r.id, data: r, act: act || 'add' }; }), opt); }
    async function edit(t, role, oldId, rec) {
      var items = [];
      if (String(oldId) !== String(rec.id)) items.push({ rid: oldId, data: null, act: 'del' });
      items.push({ rid: rec.id, data: rec, act: String(oldId) !== String(rec.id) ? 'add' : 'edit' });
      return write(t, role, items, { strict: true });   // 古い記録の削除の印と新しい記録は、同じまとめ書きで両方か、どちらも書かない
    }
    // v0.26.2（R261-03）：形が正しくない記録を、読んだ文書のIDで削除の印にする（中の id は信じない）
    async function repair(t, role, docIds) { return write(t, role, docIds.map(function (x) { return { rid: x, data: null, act: 'del', repair: true }; })); }
    async function del(t, role, ids) { return write(t, role, ids.map(function (id) { return { rid: id, data: null, act: 'del' }; })); }
    // v0.26.35.1：チームの記録を全部消す（削除の印をつける。変更履歴から戻せる）。8件ずつ書き、progress(済み, 全部) を呼ぶ。
    // 最後にサーバーから読み直して、残っている数を返す（{ total, written, skipped, left }）
    async function delAll(t, role, progress) {
      ok(); var s = await srvDocs(col('teams', t, 'records')); ok(); var items = [];
      s.forEach(function (x) { var v = x.data(); if (v && v._del) return; items.push({ rid: x.id, data: null, act: 'del', repair: !shape(v, true) }); });
      var total = items.length; if (progress) progress(0, total);
      var r = total ? await write(t, role, items, { progress: progress }) : { written: 0, skipped: 0 };
      ok(); var after = await srvDocs(col('teams', t, 'records')); ok(); var left = 0;
      after.forEach(function (x) { var v = x.data(); if (!v || !v._del) left++; });
      return { total: total, written: r.written, skipped: r.skipped, left: left };
    }
    async function confirm(t, ids) { return write(t, 'coach', ids.map(function (id) { return { rid: id, data: 'keep', act: 'confirm' }; })); }
    async function history(t, n) {
      ok(); var s = await srvDocs(F.query(col('teams', t, 'hist'), F.orderBy('at', 'desc'), F.limit(n || 50))); ok(); var out = [];
      s.forEach(function (x) { var v = x.data(); out.push({ id: x.id, rid: v.rid, uid: v.uid, name: v.name, at: v.at ? v.at.toMillis() : null, act: v.act, before: v.before, after: v.after }); });
      return out;
    }
    // 履歴の1件を「その前」に戻す（前が無い＝追加だった → 削除の印）
    async function revert(t, role, h) {
      var b4 = h.before && !h.before._del ? strip(h.before) : null;   // 前が無い（追加だった）・削除の印だった → 削除の印
      // v0.26.2→v0.26.3（R262-01）：1件の操作として strict。元の内容の形が正しくないときは、何も書かずに理由つきのエラー
      try { return await write(t, role, [{ rid: h.rid, data: b4, act: 'revert', st: h.before && h.before._st === 'pending' ? 'pending' : undefined }], { strict: true }); }   // 「確認済みに」を取り消したら未確認に戻る
      catch (e) { if (e && e.code === 'bad-record') { var e2 = new Error('この変更は、元の内容の形が正しくないため、そのままでは戻せません（元の内容は変更履歴に残っています）'); e2.code = 'bad-record'; throw e2; } throw e; }
    }
    return { myTeams: myTeams, info: info, createTeam: createTeam, codes: codes, regen: regen, join: join, members: members, setRole: setRole, remove: remove, leave: leave, forget: forget, transfer: transfer, rename: rename,
      banned: banned, unban: unban, approve: approve, reject: reject, myStatus: myStatus, repair: repair, getRecords: getRecords, put: put, edit: edit, del: del, delAll: delAll, confirm: confirm, history: history, revert: revert, write: write };
  }
  return { make: make, shape: shape, validRec: validRec, parseCode: parseCode, ymd: ymd, snapEnd: snapEnd, codeStr: codeStr, schoolYearEnd: schoolYearEnd, strip: strip, newSecret: newSecret, META: META };
})();
if (typeof module !== 'undefined') module.exports = LaneTeam;
