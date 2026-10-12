/* ===== v0.24：選手とのやり取り（顧問がオンにしたときだけ）
   ・Firestore の talks/{tid}（tid は推測できない20文字）。顧問が Google ログインで作り、選手はリンク（?t=tid／個人ページ）だけで読む・書く
   ・使える期間は作ってから119日。顧問が「停止」すると、選手からは見えなくなる（欄ごと出さない）。削除もできる
   ・選手が先生に見せる体調メモは「先生に送る」を押した日の分だけ。ほかはスマホの中だけ
   ・顧問側の読み書きは、始めたときのアカウント（uid）と世代（epoch）に固定する（A01）。選手側は画面ごとの世代で古い結果を捨てる
   ・あとで選手のログインを選べるようにするときは、talks に選手の uid を足し、ルールで from:'p' の書き込みをその uid に絞る */
var LaneTalk = (function () {
  'use strict';
  var FB_VER = '10.14.1', DAYS = 119, MAXLEN = 500, SKEY = 'lanenote.talks.v1', SENTKEY = 'lanenote.talksent.v1';
  var WARN = '⚠️ このリンクを知っている人は、あなたとして書きこめます。ほかの人には送らないでください。';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function validId(s) { return /^[A-Za-z0-9]{20}$/.test(String(s || '')); }
  function newId() { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', out = '', b = new Uint8Array(1); while (out.length < 20) { crypto.getRandomValues(b); if (b[0] < 248) out += A[b[0] % 62]; } return out; }
  function base() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/[^\/]*$/, '') : (window.SHARE_BASE || './'); }
  function linkFor(tid) { return base().replace(/records\.html$/, '') + '?t=' + tid; }
  function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
  function when(t) { var m = ms(t); if (!m) return '送信中'; var d = new Date(m); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function ls(k, v) { try { if (v === undefined) { var o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } if (Object.keys(v).length) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) { return {}; } }
  /* 選手のスマホに覚えるやり取りのリンク（中身は保存しない。IDと名前だけ） */
  function remember(tid, name) { if (!validId(tid)) return; var m = ls(SKEY); m[tid] = { name: String(name || '').slice(0, 60), at: new Date().toISOString() }; ls(SKEY, m); }
  function forget(tid) { var m = ls(SKEY); delete m[tid]; ls(SKEY, m); }
  function saved() { var m = ls(SKEY); return Object.keys(m).filter(validId).sort(function (a, b) { return (m[b].at || '') < (m[a].at || '') ? -1 : 1; }); }
  var FBP = null;
  async function fb() {   // 選手側：ログインなしで Firestore だけ使う
    if (FBP) return FBP;
    var CFG = window.LANE_FIREBASE_CONFIG; if (!CFG || !CFG.apiKey || /^YOUR_|^__/.test(CFG.apiKey)) throw new Error('クラウドが設定されていません');
    var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    var m = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')]);
    var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(CFG);
    FBP = { F: m[1], fs: m[1].getFirestore(app) };
    return FBP;
  }
  function setFirebase(x) { FBP = x; }   // テスト用
  async function readTalk(F, fs, tid) {
    var d = await F.getDoc(F.doc(fs, 'talks', tid));
    if (!d.exists()) { var e = new Error('このやり取りは削除されました'); e.code = 'not-found'; throw e; }
    var q = F.query(F.collection(fs, 'talks', tid, 'msgs'), F.orderBy('createdAt'), F.limit(200));
    var s = await F.getDocs(q), msgs = [];
    s.forEach(function (x) { var v = x.data() || {}; msgs.push({ id: x.id, from: v.from === 't' ? 't' : 'p', body: String(v.body || ''), cond: v.cond || null, at: v.createdAt }); });
    return { talk: d.data(), msgs: msgs };
  }
  var FACES = ['', '😣', '😟', '😐', '🙂', '😄'];
  function condText(c) { if (!c) return ''; var p = String(c.d || '').split('-'); return '📝 ' + (p.length === 3 ? (+p[1]) + '月' + (+p[2]) + '日の体調：' : '体調：') + [c.s ? FACES[c.s] + ' ' + c.s + '/5' : '', c.sl != null ? '😴 ' + c.sl + '時間' : '', c.m ? '「' + c.m + '」' : ''].filter(Boolean).join('・'); }
  function msgsHtml(msgs, me, delBtn) {
    if (!msgs.length) return '<p class="tk-empty">まだやり取りはありません。</p>';
    return '<ul class="tk-msgs">' + msgs.map(function (m) {
      var mine = m.from === me;
      return '<li class="tk-m ' + (m.from === 't' ? 'from-t' : 'from-p') + (mine ? ' mine' : '') + '"><div class="tk-bub">' + (m.cond ? '<div class="tk-cond">' + esc(condText(m.cond)) + '</div>' : '') + (m.body ? '<div class="tk-body">' + esc(m.body) + '</div>' : '') + '</div><div class="tk-meta">' + (m.from === 't' ? '先生' : '選手') + '・' + esc(when(m.at)) + (delBtn ? ' <button type="button" class="tk-del" data-tkdel="' + esc(m.id) + '">削除</button>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }
  /* ---------- 選手側：やり取りの欄（使えないときは欄ごと隠す） ---------- */
  async function renderPlayer(box, tid, opts) {
    opts = opts || {};
    if (!box) return false;
    var gen = (box.__tkGen = (box.__tkGen || 0) + 1);
    if (!validId(tid)) { box.hidden = true; return false; }
    var r;
    try { var x = await fb(); r = await readTalk(x.F, x.fs, tid); }
    catch (e) {
      if (gen !== box.__tkGen) return false;
      box.hidden = true; box.innerHTML = '';
      if (e && (e.code === 'permission-denied' || e.code === 'not-found')) forget(tid);
      if (opts.onGone) opts.onGone(e);
      return false;
    }
    if (gen !== box.__tkGen) return false;
    remember(tid, r.talk.name);
    var sent = ls(SENTKEY)[tid] || {}, conds = window.LanePersonal ? LanePersonal.cList() : [];
    box.hidden = false;
    box.innerHTML = '<h3>💬 先生とのやり取り</h3>' +
      (r.talk.note ? '<div class="tk-note"><small>先生からのひとこと</small><p>' + esc(r.talk.note) + '</p></div>' : '') +
      msgsHtml(r.msgs, 'p', false) +
      '<div class="tk-form"><textarea class="tk-in" maxlength="' + MAXLEN + '" rows="2" placeholder="先生への返信（500文字まで）" aria-label="先生への返信"></textarea><button type="button" class="tk-send">送る</button></div>' +
      '<div class="tk-condsend"><label>体調メモを先生に送る <select class="tk-cday" aria-label="送る日"><option value="">日付を選ぶ</option>' + conds.slice(0, 14).map(function (c) { return '<option value="' + esc(c.d) + '">' + esc(LanePersonal.mdLabel(c.d)) + (sent[c.d] ? '（送信済み）' : '') + '</option>'; }).join('') + '</select></label><button type="button" class="tk-csend">📤 先生に送る</button>' +
      '<p class="tk-small">送るのは選んだ日の分だけです。ほかの体調メモはこのスマホの中だけにあります。' + (conds.length ? '' : '（まだ体調メモがありません）') + '</p></div>' +
      '<div class="tk-msg" role="status" aria-live="polite"></div><p class="tk-warn">' + WARN + '</p>';
    var msg = box.querySelector('.tk-msg');
    async function post(data, btn) {
      btn.disabled = true; msg.textContent = '送っています…';
      try {
        var x = await fb(); data.createdAt = x.F.serverTimestamp();
        await x.F.setDoc(x.F.doc(x.fs, 'talks', tid, 'msgs', newId()), data);
        if (gen !== box.__tkGen) return;
        if (data.cond) { var all = ls(SENTKEY); all[tid] = all[tid] || {}; all[tid][data.cond.d] = new Date().toISOString(); ls(SENTKEY, all); }
        renderPlayer(box, tid, opts);
      } catch (e) { if (gen === box.__tkGen) { btn.disabled = false; msg.textContent = '送れませんでした（' + (e.code === 'permission-denied' ? '先生がやり取りを止めたか、期限が切れました' : '電波の良いところでもう一度') + '）'; } }
    }
    box.querySelector('.tk-send').addEventListener('click', function () {
      var t = box.querySelector('.tk-in').value.trim().slice(0, MAXLEN); if (!t) { msg.textContent = '返信を入れてください'; return; }
      post({ from: 'p', body: t }, this);
    });
    box.querySelector('.tk-csend').addEventListener('click', function () {
      var d = box.querySelector('.tk-cday').value; if (!d) { msg.textContent = '送る日を選んでください'; return; }
      var c = LanePersonal.cGet(d); if (!c) { msg.textContent = 'その日の体調メモがありません'; return; }
      var o = { d: d }; if (c.s) o.s = c.s; if (c.sl != null) o.sl = c.sl; if (c.m) o.m = String(c.m).slice(0, 100);
      if (!confirm(LanePersonal.mdLabel(d) + 'の体調メモを先生に送ります。送ったものは先生が見られます。よろしいですか？')) return;
      post({ from: 'p', body: '', cond: o }, this);
    });
    return true;
  }
  /* 選手モードのホーム：覚えているやり取り（と個人ページに入っていたもの）のうち、使えるものを1つ出す */
  async function renderHomeCard(box, extra) {
    if (!box) return;
    var ids = saved(); (extra || []).forEach(function (t) { if (validId(t) && ids.indexOf(t) < 0) ids.push(t); });
    for (var i = 0; i < ids.length; i++) { if (await renderPlayer(box, ids[i])) return; }
    box.hidden = true;
  }
  /* ?t=<tid> のリンクを開いたとき */
  function initLink() {
    var m = /[?&]t=([A-Za-z0-9]{20})(?:&|$)/.exec(location.search), sec = document.getElementById('talkView');
    if (!m || !sec) return false;
    document.body.classList.add('talk-mode'); sec.hidden = false; document.title = '先生とのやり取り';
    var box = document.getElementById('tvBody');
    box.innerHTML = '<p class="tk-empty">読み込んでいます…</p>'; box.hidden = false;
    renderPlayer(box, m[1], { onGone: function () { box.hidden = false; box.innerHTML = '<div class="tk-gone"><b>このやり取りは開けません。</b><br>先生が止めたか、期限（119日）が切れたか、削除されました。必要なら先生に聞いてください。</div>'; } });
    return true;
  }

  /* ---------- 顧問側（records.html）。FB={F,fs}・sc={uid,epoch}・check(sc) を呼ぶ側が渡す ---------- */
  function T(FB, sc, check) {
    if (!sc || !sc.uid) throw new Error('Googleでログインすると使えます');
    var F = FB.F, fs = FB.fs, uid = sc.uid;
    var ok = function () { check(sc); };
    return {
      settings: async function () { var d = await (F.getDocFromServer || F.getDoc)(F.doc(fs, 'users', uid, 'settings', 'talk')); ok(); return d.exists() ? { enabled: !!(d.data() || {}).enabled } : { enabled: false }; },
      setEnabled: async function (on) { await F.setDoc(F.doc(fs, 'users', uid, 'settings', 'talk'), { enabled: !!on, updatedAt: new Date().toISOString() }); ok(); },
      index: async function () {
        var s = await F.getDocs(F.collection(fs, 'users', uid, 'talkIndex')); ok(); var out = [];
        s.forEach(function (d) { var v = d.data() || {}; out.push({ id: d.id, akey: String(v.akey || ''), name: String(v.name || ''), active: !!v.active, exp: ms(v.expiresAt), at: ms(v.createdAt) }); });
        return out;
      },
      create: async function (akey, name) {
        var id = newId(), exp = F.Timestamp.fromMillis(Date.now() + DAYS * 864e5), b = F.writeBatch(fs);
        b.set(F.doc(fs, 'talks', id), { ownerUid: uid, name: String(name).slice(0, 60) || '選手', note: '', noteAt: F.serverTimestamp(), active: true, createdAt: F.serverTimestamp(), expiresAt: exp });
        b.set(F.doc(fs, 'users', uid, 'talkIndex', id), { akey: String(akey).slice(0, 200), name: String(name).slice(0, 60), active: true, createdAt: F.serverTimestamp(), expiresAt: exp });
        ok(); await b.commit(); ok(); return id;
      },
      setActive: async function (id, on) {
        var b = F.writeBatch(fs);
        b.update(F.doc(fs, 'talks', id), { active: !!on });
        b.set(F.doc(fs, 'users', uid, 'talkIndex', id), { active: !!on }, { merge: true });
        ok(); await b.commit(); ok();
      },
      setNote: async function (id, note) { ok(); await F.updateDoc(F.doc(fs, 'talks', id), { note: String(note).slice(0, MAXLEN), noteAt: F.serverTimestamp() }); ok(); },
      read: async function (id) { ok(); var r = await readTalk(F, fs, id); ok(); return r; },
      reply: async function (id, body) { ok(); await F.setDoc(F.doc(fs, 'talks', id, 'msgs', newId()), { from: 't', body: String(body).slice(0, MAXLEN), createdAt: F.serverTimestamp() }); ok(); },
      delMsg: async function (id, mid) { ok(); await F.deleteDoc(F.doc(fs, 'talks', id, 'msgs', mid)); ok(); },
      remove: async function (id) {   // やり取りを丸ごと削除（メッセージ→本体→一覧の順）
        ok(); var s = await F.getDocs(F.collection(fs, 'talks', id, 'msgs')); ok();
        var ids = []; s.forEach(function (d) { ids.push(d.id); });
        for (var i = 0; i < ids.length; i += 400) { var b = F.writeBatch(fs); ids.slice(i, i + 400).forEach(function (m) { b.delete(F.doc(fs, 'talks', id, 'msgs', m)); }); await b.commit(); ok(); }
        var b2 = F.writeBatch(fs); b2.delete(F.doc(fs, 'talks', id)); b2.delete(F.doc(fs, 'users', uid, 'talkIndex', id)); await b2.commit(); ok();
      },
      dropIndex: async function (id) { ok(); await F.deleteDoc(F.doc(fs, 'users', uid, 'talkIndex', id)); ok(); }
    };
  }
  return { validId: validId, newId: newId, linkFor: linkFor, remember: remember, forget: forget, saved: saved, renderPlayer: renderPlayer, renderHomeCard: renderHomeCard, initLink: initLink, msgsHtml: msgsHtml, condText: condText, teacher: T, setFirebase: setFirebase, WARN: WARN, DAYS: DAYS, esc: esc, when: when };
})();
if (typeof module !== 'undefined') module.exports = LaneTalk;
