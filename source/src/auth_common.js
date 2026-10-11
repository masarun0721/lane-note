/* ===== v0.14：大会準備・記録の両ページで使うログインとログアウト（監査 F02〜F04・F10） =====
   ・ログイン：まず小さな画面（popup）。ブロックされたら画面ごと移動（redirect）し、戻ってきたら getRedirectResult で結果を受け取る
   ・ログアウト：Firebase からのログアウトと、この端末に残したその人の控え（IndexedDB の lanenote-cache-<uid> と localStorage のその人用のキー）の消去を、
     別々に成功/失敗として返す（消えていないのに「ログアウトしました」とだけ出さない）。LANE NOTE 以外のデータ（同じサイトのほかのアプリ）には触らない */
var LaneAuth = (function () {
  'use strict';
  var REDIRECT_KEY = 'lanenote-login-redirect';
  function userKeys(uid) { return ['lanenote-rec-meets-' + uid, 'lanenote-rec-divov-' + uid, 'lanenote-migrated-' + uid]; }
  function cacheName(uid) { return 'lanenote-cache-' + uid; }
  // IndexedDB を消す。ほかのタブが開いたままなら少し待ち、それでも消えなければ失敗として返す（何度やり直しても安全）
  function eraseDatabase(name, waitMs) {
    return new Promise(function (ok, ng) {
      if (typeof indexedDB === 'undefined' || !indexedDB) { ok(); return; }
      var req, done = false;
      try { req = indexedDB.deleteDatabase(name); } catch (e) { ng(e); return; }
      req.onsuccess = function () { done = true; ok(); };
      req.onerror = function () { done = true; ng(req.error || new Error('端末データの削除に失敗しました')); };
      req.onblocked = function () {
        setTimeout(function () { if (!done) { done = true; var e = new Error('ほかのタブで LANE NOTE の記録ページが開いているため、この端末の控えを消せませんでした。そのタブを閉じてから「端末の控えを消す」を押してください'); e.code = 'blocked'; ng(e); } }, waitMs == null ? 1500 : waitMs);
      };
    });
  }
  // close(name)：そのページが開いている接続を先に閉じる関数（記録ページが渡す）
  async function wipeUser(uid, close) {
    if (!uid) return;
    userKeys(uid).forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { } });
    if (close) { try { await close(cacheName(uid)); } catch (e) { } }
    await eraseDatabase(cacheName(uid));
  }
  async function signOutAndWipe(FB, uid, close) {
    var r = { signedOut: false, wiped: false, error: null };
    try { await FB.A.signOut(FB.auth); r.signedOut = true; } catch (e) { r.error = e; return r; }
    try { await wipeUser(uid, close); r.wiped = true; } catch (e) { r.error = e; }
    return r;
  }
  function errorText(e) {
    var c = (e && e.code) || '';
    if (/unauthorized-domain/.test(c)) return 'このアドレスからはログインできません（公開版のページ https://masarun0721.github.io/lane-note/ から開いてください）';
    if (/network-request-failed/.test(c)) return '通信できませんでした。電波の良いところでもう一度押してください';
    if (/popup-blocked/.test(c)) return 'ログインの小さな画面がブロックされました。ブラウザでポップアップを許可してください';
    if (/web-storage-unsupported|operation-not-supported/.test(c)) return 'このブラウザ（LINEなどのアプリの中のブラウザ・プライベートモードなど）ではログインできません。Safari や Chrome で開き直してください';
    if (/user-disabled/.test(c)) return 'このアカウントは使えません';
    return (e && e.message) || String(e);
  }
  // 'popup'（ログインできた）／'cancelled'（自分で閉じた）／'redirect'（画面ごと移動中）。それ以外は例外
  async function signIn(FB) {
    var provider = new FB.A.GoogleAuthProvider();
    try { await FB.A.signInWithPopup(FB.auth, provider); return 'popup'; }
    catch (e) {
      if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return 'cancelled';
      if (e && /popup-blocked|operation-not-supported/.test(e.code || '')) {
        try { sessionStorage.setItem(REDIRECT_KEY, '1'); } catch (x) { }
        await FB.A.signInWithRedirect(FB.auth, provider); return 'redirect';
      }
      throw e;
    }
  }
  // redirect で戻ってきたときの結果。失敗していたらエラーを返す（なければ null）
  async function redirectResult(FB) {
    var pending = false; try { pending = !!sessionStorage.getItem(REDIRECT_KEY); sessionStorage.removeItem(REDIRECT_KEY); } catch (e) { }
    if (!FB.A.getRedirectResult) return null;
    try { await FB.A.getRedirectResult(FB.auth); return null; }
    catch (e) { return pending || !/no-auth-event/.test(e && e.code || '') ? e : null; }
  }
  function isGoogle(u) { return !!(u && (u.providerData || []).some(function (p) { return p && p.providerId === 'google.com'; })); }
  return { eraseDatabase: eraseDatabase, wipeUser: wipeUser, signOutAndWipe: signOutAndWipe, signIn: signIn, redirectResult: redirectResult, errorText: errorText, userKeys: userKeys, cacheName: cacheName, isGoogle: isGoogle };
})();
if (typeof module !== 'undefined') module.exports = LaneAuth;
