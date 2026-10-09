/* LANE NOTE service worker：このページ（HTML）だけを端末に置いておき、電波が無くても「保存した大会」を開けるようにする。
   ・同じサイトのページ（HTML）の取得だけを扱う。PDF・選手データ・外部CDNは扱わない（キャッシュしない）。
   ・初めて開いたとき（インストール時）にページを保存し終えてから動き始める → 初回からオフラインで開ける。
   ・ネット優先：つながるときは常に最新のページを使い、つながらないときだけ保存しておいたページを使う。 */
var CACHE = 'lanenote-page-v0.9';
var PAGE = new URL('./', self.location).href;   // 例：https://masarun0721.github.io/lane-note/
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return fetch(new Request(PAGE, { cache: 'reload', credentials: 'same-origin' })).then(function (res) {
      if (!res || !res.ok) throw new Error('page fetch failed: ' + (res && res.status));
      return c.put(PAGE, res);
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('lanenote-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.mode !== 'navigate') return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var cp = res.clone(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(u.origin + u.pathname, cp); })); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) { return c.match(u.origin + u.pathname).then(function (m) { return m || c.match(PAGE); }); });
  }));
});
