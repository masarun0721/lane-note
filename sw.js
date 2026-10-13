/* LANE NOTE service worker：このサイトのページ（HTML）だけを端末に置いておき、電波が無くても「保存した大会」や記録のページを開けるようにする。
   ・同じサイトのページ（HTML）の取得だけを扱う。PDF・選手データ・外部CDNは扱わない（キャッシュしない）。
   ・初めて開いたとき（インストール時）に大会準備のページと記録のページを保存し終えてから動き始める → 初回からオフラインで開ける。
   ・ネット優先：つながるときは常に最新のページを使い、つながらないときだけ保存しておいたページを使う。
   ・v0.14（監査F13）：キャッシュ名は build.py が版とページの中身のハッシュから作る（公開のたびに変わり、古いキャッシュは消える）。
     記録のページが保存されていないときは、大会準備のページではなく「電波がない」案内を出す。 */
var CACHE = 'lanenote-page-v0.26.14-rv0.11.1-27f06f5f26';
var PAGE = new URL('./', self.location).href;   // 例：https://masarun0721.github.io/lane-note/
var REC = new URL('./records.html', self.location).href;
var INDEX = new URL('./index.html', self.location).href;   // v0.25.8：大会準備のページ（トップ / は記録のページへ移る）
var GUIDE = new URL('./guide.html', self.location).href;   // v0.18：はじめての人はこちら
var CHECK = new URL('./check.html', self.location).href;   // v0.19：エントリー照合
var TRY = new URL('./try.html', self.location).href;   // v0.26.8：3分体験
var TEAMP = new URL('./team.html', self.location).href;   // v0.26.10：チームの設定
function getPage(u) { return fetch(new Request(u, { cache: 'reload', credentials: 'same-origin' })).then(function (res) { if (!res || !res.ok) throw new Error('page fetch failed: ' + (res && res.status)); return res; }); }
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return getPage(PAGE).then(function (res) { return c.put(PAGE, res); }).then(function () {
      return getPage(REC).then(function (res) { return c.put(REC, res); }, function () { });   // 記録のページは取れなくても続ける
    }).then(function () {
      return getPage(INDEX).then(function (res) { return c.put(INDEX, res); }, function () { });
    }).then(function () {
      return getPage(GUIDE).then(function (res) { return c.put(GUIDE, res); }, function () { });
    }).then(function () {
      return getPage(CHECK).then(function (res) { return c.put(CHECK, res); }, function () { });
    }).then(function () {
      return getPage(TRY).then(function (res) { return c.put(TRY, res); }, function () { });
    }).then(function () {
      return getPage(TEAMP).then(function (res) { return c.put(TEAMP, res); }, function () { });
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('lanenote-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function offlineRecords() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LANE NOTE 記録</title><body style="font-family:sans-serif;padding:24px;line-height:1.7"><h1 style="font-size:20px">📒 記録のページを開けません</h1><p>電波がなく、この端末にはまだ記録のページが保存されていません。電波のあるところで一度開くと、次からは電波がなくても開けます。</p><p><a href="index.html">🏁 大会準備のページへ</a></p></body>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.mode !== 'navigate') return;
  // v0.26.10：ブラウザのHTTPキャッシュ（GitHub Pages は最大10分）に残った古いページを出さないよう、毎回サーバーに確かめる
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok) { var cp = res.clone(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(u.origin + u.pathname, cp); })); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(u.origin + u.pathname).then(function (m) {
        if (m) return m;
        if (/(records|team)\.html$/.test(u.pathname)) return offlineRecords();
        return c.match(PAGE);
      });
    });
  }));
});
