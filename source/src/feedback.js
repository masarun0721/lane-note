/* ===== 不具合・要望を送る（v0.13）：ページの中のフォームから Firestore の feedback/{自動ID} に1件書くだけ（読む・直す・消すは誰にもできない）。
   記録・選手名・PDFの中身は送らない。送るのは 種類・内容・連絡先（任意）・ページ名・版・ブラウザの種類（userAgent）・画面の大きさ・開いているタブとURLのパス（#以降と?以降は送らない） ===== */
(function () {
  'use strict';
  var FB_VER = '10.14.1', KINDS = ['不具合', '要望', 'その他'];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function cfg() { var c = window.LANE_FIREBASE_CONFIG; return c && c.apiKey && !/^YOUR_|^__/.test(c.apiKey) && c.projectId ? c : null; }
  function pageName() { return document.body.classList.contains('records') ? '記録' : '大会準備'; }
  function version() { return (window.APP_VERSION || '') + (window.REC_VERSION && document.body.classList.contains('records') ? '／記録 ' + window.REC_VERSION : ''); }
  function curTab() { var b = document.querySelector('.tabs button.on'); return b ? b.textContent.trim().slice(0, 30) : ''; }
  function info() {
    return { page: pageName(), version: version(), ua: String(navigator.userAgent || '').slice(0, 400), screen: (screen.width || 0) + 'x' + (screen.height || 0) + '（表示 ' + window.innerWidth + 'x' + window.innerHeight + '）',
      path: (location.pathname || '/').slice(0, 200) + (curTab() ? '［' + curTab() + '］' : '') };
  }
  var dlg = null;
  function build() {
    dlg = document.createElement('div'); dlg.className = 'fb-back'; dlg.hidden = true;
    dlg.innerHTML = '<div class="fb-dlg" role="dialog" aria-modal="true" aria-labelledby="fbTitle"><form id="fbForm" novalidate>' +
      '<h2 id="fbTitle">📮 不具合・要望を送る</h2>' +
      '<p class="small muted">読み取りの間違い・動かないところ・「こうなったら助かる」を送ってください。ログインしていなくても送れます。</p>' +
      '<fieldset class="fb-kind"><legend>種類</legend>' + KINDS.map(function (k, i) { return '<label><input type="radio" name="fbKind" value="' + k + '"' + (i ? '' : ' checked') + '> ' + k + '</label>'; }).join('') + '</fieldset>' +
      '<label class="fb-l">内容 <b class="ng">（必須）</b><textarea id="fbBody" maxlength="5000" rows="6" placeholder="例：記録ページの大会別で、〇〇大会の100mの風が出ません"></textarea></label>' +
      '<label class="fb-l">連絡先（任意・返事がほしいとき）<input type="text" id="fbContact" maxlength="200" placeholder="メールアドレスなど"></label>' +
      '<details class="small fb-auto"><summary>いっしょに送る情報（記録や選手名は送りません）</summary><ul id="fbInfo"></ul></details>' +
      '<div class="status" id="fbStatus" aria-live="polite"></div>' +
      '<div class="fb-btns"><button class="btn" type="submit" id="fbSend">送信する</button><button class="btn sub" type="button" id="fbClose">閉じる</button></div>' +
      '</form></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    dlg.querySelector('#fbClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
    dlg.querySelector('#fbForm').addEventListener('submit', send);
  }
  function st(html, cls) { var el = dlg.querySelector('#fbStatus'); el.innerHTML = html; el.className = 'status ' + (cls || ''); }
  function open() {
    if (!dlg) build();
    var i = info(); dlg.querySelector('#fbInfo').innerHTML = '<li>ページ：' + esc(i.page) + '</li><li>版：' + esc(i.version) + '</li><li>場所：' + esc(i.path) + '</li><li>画面：' + esc(i.screen) + '</li><li>ブラウザ：' + esc(i.ua) + '</li>';
    st('', ''); dlg.querySelector('#fbSend').disabled = false; dlg.hidden = false; document.body.classList.add('fb-open');
    setTimeout(function () { dlg.querySelector('#fbBody').focus(); }, 30);
  }
  function close() { dlg.hidden = true; document.body.classList.remove('fb-open'); }
  function withTimeout(pr, ms) { return Promise.race([pr, new Promise(function (_, ng) { setTimeout(function () { ng(new Error('時間切れ（通信できませんでした）')); }, ms); })]); }
  async function send(e) {
    e.preventDefault();
    var body = dlg.querySelector('#fbBody').value.trim(), contact = dlg.querySelector('#fbContact').value.trim(), kind = (dlg.querySelector('input[name=fbKind]:checked') || {}).value || 'その他';
    if (!body) { st('✖ 内容を書いてください。', 'ng'); dlg.querySelector('#fbBody').focus(); return; }
    if (body.length > 5000 || contact.length > 200) { st('✖ 内容は5000文字・連絡先は200文字までです。', 'ng'); return; }
    var c = cfg(); if (!c) { st('✖ 送信の準備ができていません（設定がありません）。', 'ng'); return; }
    var btn = dlg.querySelector('#fbSend'); btn.disabled = true; st('送信中…', 'busy');
    try {
      var base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
      var m = await withTimeout(Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]), 15000);
      var app = m[0].getApps().length ? m[0].getApp() : m[0].initializeApp(c), auth = m[1].getAuth(app), uid = null;
      try { await withTimeout(auth.authStateReady(), 4000); } catch (x) { }
      if (auth.currentUser) uid = auth.currentUser.uid;
      var i = info();
      await withTimeout(m[2].addDoc(m[2].collection(m[2].getFirestore(app), 'feedback'), { kind: kind, body: body, contact: contact, page: i.page, version: i.version, ua: i.ua, screen: i.screen, path: i.path, createdAt: m[2].serverTimestamp(), uid: uid }), 15000);
      st('✔ <b>送信しました。</b>ありがとうございます！', 'ok');
      dlg.querySelector('#fbBody').value = ''; dlg.querySelector('#fbContact').value = '';
    } catch (err) {
      btn.disabled = false;
      st('✖ 送信できませんでした：' + esc(err && err.message || err) + '<br><small>通信を確かめて、もう一度押してください。</small>', 'ng');
    }
  }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('[data-feedback]'); if (!a) return; e.preventDefault(); open(); });
  window.LaneFeedback = { open: open, info: info };
})();
