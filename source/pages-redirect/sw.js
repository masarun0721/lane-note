/* 公開先を Firebase Hosting に移したあと、GitHub Pages に残った Service Worker を外す。
   このファイルは Pages のリダイレクト公開のときだけ配る。Firebase 側の sw.js は source/build.py の成果物。 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(function (c) { return c.navigate(c.url); }));
  })());
});
