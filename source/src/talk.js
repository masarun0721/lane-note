/* ===== v0.24：選手とのやり取り（顧問がオンにしたときだけ）
   ・Firestore の talks/{tid}（tid は推測できない20文字）。顧問が Google ログインで作り、選手はリンク（?t=tid／個人ページ）だけで読む・書く
   ・使える期間は作ってから119日。顧問が「停止」すると、選手からは見えなくなる（欄ごと出さない）。削除もできる
   ・（v0.24.3 から）体調メモを先生に送る機能は止めている。体調メモはスマホの中だけ
   ・顧問側の読み書きは、始めたときのアカウント（uid）と世代（epoch）に固定する（A01）。選手側は画面ごとの世代で古い結果を捨てる
   ・あとで選手のログインを選べるようにするときは、talks に選手の uid を足し、ルールで from:'p' の書き込みをその uid に絞る
   ・v0.25（Astra 第3回監査）：削除は「閉じる（印を残す）→ メッセージを消す」の順。本体は消さないので同じIDは作り直せない（C301）
     投稿は数 n を1つ増やすまとめ書き（msgs/m<n>）。3秒に1回・1会話1000件まで（ルールで制限：C303）。読むのは新しい順に50件ずつ
     招待リンクは個人ページに入れない。顧問がやり取りの画面から1人ずつ渡す（C302）。体調メモの送信は止めたまま */
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
  /* R253：この端末の「消去の世代」。全部消したら進め、読み込み中の結果は保存も表示もしない（ほかのタブで消したときも） */
  var DEV = 0;
  try { window.addEventListener('storage', function (e) { if (e.key === null || e.key === SKEY) DEV++; }); } catch (e) { }
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
  var PAGE = 50;
  /* 新しい順に50件ずつ読む（C303：古い200件だけになる問題を直す）。before を渡すとその前の50件 */
  async function readTalk(F, fs, tid, before) {
    var d = await F.getDoc(F.doc(fs, 'talks', tid));
    if (!d.exists()) { var e = new Error('このやり取りは削除されました'); e.code = 'not-found'; throw e; }
    var t = d.data() || {};
    if (t.closed) { var e2 = new Error('このやり取りは削除されました'); e2.code = 'not-found'; throw e2; }
    var parts = [F.collection(fs, 'talks', tid, 'msgs'), F.orderBy('createdAt', 'desc')];
    if (before && F.startAfter) parts.push(F.startAfter(before));
    parts.push(F.limit(PAGE));
    var s = await F.getDocs(F.query.apply(null, parts)), msgs = [], last = null;
    s.forEach(function (x) { var v = x.data() || {}; last = x; msgs.push({ id: x.id, from: v.from === 't' ? 't' : 'p', body: String(v.body || ''), cond: v.cond || null, at: v.createdAt }); });
    msgs.reverse();
    return { talk: t, msgs: msgs, more: msgs.length >= PAGE ? last : null };
  }
  /* 投稿：数 n を読んで、msgs/m<n+1> と数の更新を1回のまとめ書き。ぶつかったら1回だけやり直す（C303） */
  async function postMsg(F, fs, tid, data) {
    for (var tries = 0; ; tries++) {
      var g = F.getDocFromServer || F.getDoc, d = await g(F.doc(fs, 'talks', tid));
      if (!d.exists()) { var e = new Error('gone'); e.code = 'not-found'; throw e; }
      var t = d.data() || {}, n = (typeof t.n === 'number' ? t.n : 0) + 1, b = F.writeBatch(fs), o = {};
      Object.keys(data).forEach(function (k) { o[k] = data[k]; });
      o.createdAt = F.serverTimestamp(); o.purgeAt = t.expiresAt;
      b.set(F.doc(fs, 'talks', tid, 'msgs', 'm' + n), o);
      b.update(F.doc(fs, 'talks', tid), { n: n, lastAt: F.serverTimestamp() });
      try { await b.commit(); return 'm' + n; }
      catch (err) { if (tries >= 1 || !err || err.code !== 'permission-denied') throw err; await new Promise(function (r) { setTimeout(r, 400); }); }
    }
  }
  function postErr(e) { return e && e.code === 'permission-denied' ? '続けて送るときは3秒あけてください。先生がやり取りを止めたか、期限が切れた場合も送れません' : (e && e.code === 'not-found' ? 'このやり取りは削除されました' : '電波の良いところでもう一度'); }
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
    var gen = (box.__tkGen = (box.__tkGen || 0) + 1), dev = DEV;
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
    if (gen !== box.__tkGen || dev !== DEV || (opts.alive && !opts.alive())) return false;
    remember(tid, r.talk.name);
    box.hidden = false;
    var older = [];
    // C306：だれのやり取りかを見出しに出す（同じ端末を何人かで使うとき）
    box.innerHTML = '<h3>💬 先生とのやり取り<small class="tk-who">（' + esc(r.talk.name || '選手') + ' さん）</small></h3>' +
      (r.talk.note ? '<div class="tk-note"><small>先生からのひとこと</small><p>' + esc(r.talk.note) + '</p></div>' : '') +
      (r.more ? '<button type="button" class="tk-more">前のやり取りを見る</button>' : '') +
      '<div class="tk-list">' + msgsHtml(r.msgs, 'p', false) + '</div>' +
      '<div class="tk-form"><textarea class="tk-in" maxlength="' + MAXLEN + '" rows="2" placeholder="先生への返信（500文字まで）" aria-label="先生への返信"></textarea><button type="button" class="tk-send">送る</button></div>' +
      '<p class="tk-small">体調メモを先生に送る機能は、安全のため止めています（v0.25）。体調メモはこのスマホの中だけに残ります。</p>' +
      '<div class="tk-msg" role="status" aria-live="polite"></div><p class="tk-warn">' + WARN + '</p>';
    var msg = box.querySelector('.tk-msg');
    async function post(data, btn) {
      btn.disabled = true; msg.textContent = '送っています…';
      try {
        var x = await fb();
        await postMsg(x.F, x.fs, tid, data);
        if (gen !== box.__tkGen || dev !== DEV) return;
        renderPlayer(box, tid, opts);
      } catch (e) { if (gen === box.__tkGen) { btn.disabled = false; msg.textContent = '送れませんでした（' + postErr(e) + '）'; } }
    }
    var mb = box.querySelector('.tk-more'), cur = r.more;
    if (mb) mb.addEventListener('click', async function () {
      mb.disabled = true;
      try {
        var x = await fb(), r2 = await readTalk(x.F, x.fs, tid, cur);
        if (gen !== box.__tkGen) return;
        older = r2.msgs.concat(older); cur = r2.more;
        box.querySelector('.tk-list').innerHTML = msgsHtml(older.concat(r.msgs), 'p', false);
        if (cur) mb.disabled = false; else mb.remove();
      } catch (e) { if (gen === box.__tkGen) { mb.disabled = false; msg.textContent = '読みこめませんでした'; } }
    });
    box.querySelector('.tk-send').addEventListener('click', function () {
      var t = box.querySelector('.tk-in').value.trim().slice(0, MAXLEN); if (!t) { msg.textContent = '返信を入れてください'; return; }
      post({ from: 'p', body: t }, this);
    });
    return true;
  }
  /* 選手モードのホーム：覚えているやり取り（と個人ページに入っていたもの）のうち、使えるものを1つ出す */
  async function renderHomeCard(box, extra) {
    if (!box) return;
    var ids = saved(); (extra || []).forEach(function (t) { if (validId(t) && ids.indexOf(t) < 0) ids.push(t); });
    var dev = DEV, alive = function () { return dev === DEV && box.isConnected !== false; };
    for (var i = 0; i < ids.length; i++) { if (!alive()) return; if (await renderPlayer(box, ids[i], { alive: alive })) return; }
    if (alive()) box.hidden = true;
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
  /* この端末から、やり取りのリンクと送った記録を全部消す（C306） */
  function clearDevice() { DEV++; try { localStorage.removeItem(SKEY); localStorage.removeItem(SENTKEY); } catch (e) {} }
  function T(FB, sc, check) {
    if (!sc || !sc.uid) throw new Error('Googleでログインすると使えます');
    var F = FB.F, fs = FB.fs, uid = sc.uid;
    var ok = function () { check(sc); };
    return {
      settings: async function () { var d = await (F.getDocFromServer || F.getDoc)(F.doc(fs, 'users', uid, 'settings', 'talk')); ok(); return d.exists() ? { enabled: !!(d.data() || {}).enabled } : { enabled: false }; },
      setEnabled: async function (on) { await F.setDoc(F.doc(fs, 'users', uid, 'settings', 'talk'), { enabled: !!on, updatedAt: new Date().toISOString() }); ok(); },
      index: async function () {
        var s = await F.getDocs(F.collection(fs, 'users', uid, 'talkIndex')); ok(); var out = [];
        s.forEach(function (d) { var v = d.data() || {}; out.push({ id: d.id, akey: String(v.akey || ''), name: String(v.name || ''), active: !!v.active, exp: ms(v.expiresAt), at: ms(v.createdAt), v: v.v === 2 ? 2 : 1, closed: !!v.closed, purged: !!v.purged }); });
        return out;
      },
      create: async function (akey, name) {
        var id = newId(), exp = F.Timestamp.fromMillis(Date.now() + DAYS * 864e5), b = F.writeBatch(fs);
        b.set(F.doc(fs, 'talks', id), { v: 2, ownerUid: uid, name: String(name).slice(0, 60) || '選手', note: '', noteAt: F.serverTimestamp(), active: true, closed: false, n: 0, lastAt: F.serverTimestamp(), createdAt: F.serverTimestamp(), expiresAt: exp });
        b.set(F.doc(fs, 'users', uid, 'talkIndex', id), { v: 2, akey: String(akey).slice(0, 200), name: String(name).slice(0, 60), active: true, closed: false, createdAt: F.serverTimestamp(), expiresAt: exp });
        ok(); await b.commit(); ok(); return id;
      },
      setActive: async function (id, on) {
        var b = F.writeBatch(fs);
        b.update(F.doc(fs, 'talks', id), { active: !!on });
        b.set(F.doc(fs, 'users', uid, 'talkIndex', id), { active: !!on }, { merge: true });
        ok(); await b.commit(); ok();
      },
      setNote: async function (id, note) { ok(); await F.updateDoc(F.doc(fs, 'talks', id), { note: String(note).slice(0, MAXLEN), noteAt: F.serverTimestamp() }); ok(); },
      read: async function (id, before) { ok(); var r = await readTalk(F, fs, id, before); ok(); if (!r.talk || r.talk.ownerUid !== uid) { var e = new Error('このアカウントのやり取りではありません'); e.code = 'permission-denied'; throw e; } return r; },
      reply: async function (id, body) { ok(); await postMsg(F, fs, id, { from: 't', body: String(body).slice(0, MAXLEN) }); ok(); },
      delMsg: async function (id, mid) { ok(); await F.deleteDoc(F.doc(fs, 'talks', id, 'msgs', mid)); ok(); },
      /* 削除（C301）：①閉じる（投稿をサーバーで止める・名前とひとことを消す・本体は印として残す）→ ②メッセージを無くなるまで消す → ③一覧に「消した」印。途中で止まっても purge でやり直せる */
      remove: async function (id) {
        ok();
        var b = F.writeBatch(fs);
        b.update(F.doc(fs, 'talks', id), { closed: true, active: false, name: '', note: '', noteAt: F.serverTimestamp() });   // R251：ひとことを消すときは noteAt も更新（ルールの条件）
        b.set(F.doc(fs, 'users', uid, 'talkIndex', id), { closed: true, active: false, name: '', akey: '' }, { merge: true });
        try { await b.commit(); } catch (e) { if (!e || e.code !== 'permission-denied') throw e; ok(); var c = await F.getDoc(F.doc(fs, 'talks', id)); if (c.exists() && !(c.data() || {}).closed) throw e; }
        ok(); return await this.purge(id);
      },
      /* R254：空になったのを確かめたときだけ purged:true。1回の上限（50件×100回）に届いたら未完了のまま false を返し、次に開いたときに続ける */
      purge: async function (id) {
        for (var round = 0; round < 100; round++) {
          ok(); var s = await F.getDocs(F.query(F.collection(fs, 'talks', id, 'msgs'), F.limit(PAGE))); ok();
          var ids = []; s.forEach(function (d) { ids.push(d.id); });
          if (!ids.length) { ok(); await F.setDoc(F.doc(fs, 'users', uid, 'talkIndex', id), { purged: true }, { merge: true }); ok(); return true; }
          var b = F.writeBatch(fs); ids.forEach(function (m) { b.delete(F.doc(fs, 'talks', id, 'msgs', m)); }); await b.commit();
        }
        return false;
      },
      /* 期限切れ・閉じたのに消し終わっていないものを片づける（C307：顧問がやり取りの画面を開いたとき） */
      /* 1件失敗しても、ほかの片づけは続ける（R251）。戻り値は消し終わった件数。失敗・未完了は this.lastSweep に残す */
      sweep: async function (list) {
        var now = Date.now(), done = 0, left = 0, errs = 0;
        for (var i = 0; i < list.length; i++) {
          var t = list[i]; if (t.purged) continue;
          try {
            var r = null;
            if (t.closed) r = await this.purge(t.id);
            else if (t.exp && t.exp < now) r = await this.remove(t.id);
            else continue;
            if (r) done++; else left++;
          } catch (e) { if (e && e.code === 'auth-context-changed') throw e; errs++; }
        }
        this.lastSweep = { done: done, left: left, errors: errs };
        if (errs && !done && !left) { var er = new Error('片づけに失敗しました'); er.code = 'sweep-failed'; throw er; }
        return done;
      },
      dropIndex: async function (id) { ok(); await F.deleteDoc(F.doc(fs, 'users', uid, 'talkIndex', id)); ok(); }
    };
  }
  return { clearDevice: clearDevice, postMsg: postMsg, readTalk: readTalk, PAGE: PAGE, validId: validId, newId: newId, linkFor: linkFor, remember: remember, forget: forget, saved: saved, renderPlayer: renderPlayer, renderHomeCard: renderHomeCard, initLink: initLink, msgsHtml: msgsHtml, condText: condText, teacher: T, setFirebase: setFirebase, WARN: WARN, DAYS: DAYS, esc: esc, when: when };
})();
if (typeof module !== 'undefined') module.exports = LaneTalk;
