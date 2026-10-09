/* LANE NOTE service worker：このページ（HTML）だけを端末に置いておき、電波が無くても「保存した大会」を開けるようにする。
   ・同じサイトのページ（HTML）の取得だけを扱う。PDF・選手データ・外部CDNは扱わない（キャッシュしない）。
   ・ネット優先：つながるときは常に最新のページを使い、つながらないときだけ保存しておいたページを使う。 */
var CACHE = 'lanenote-page-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('lanenote-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.mode !== 'navigate') return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var cp = res.clone(); caches.open(CACHE).then(function (c) { c.put(u.origin + u.pathname, cp); }); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) { return c.match(u.origin + u.pathname).then(function (m) { return m || c.match(new URL('./', self.location).href); }); });
  }));
});
