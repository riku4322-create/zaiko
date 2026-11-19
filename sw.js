// うちの在庫：アプリの画面をスマホに保存しておく仕組みと、プッシュ通知の受け取り（サービスワーカー）
// 画面を更新したら CACHE の番号を1つ上げると、次の起動で新しい画面に切り替わります。
const CACHE = 'uchi-zaiko-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 同じサイトの画面ファイルだけ扱う。在庫データ（Apps Script への通信）は常に最新を取りに行く。
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

// ---------- プッシュ通知 ----------
// サーバー（Code.gs）が Firebase 経由で送った通知を表示する。
// 送られてくる内容の形が多少違っても表示できるよう、いくつかの場所からタイトルと本文を探す。
self.addEventListener('push', event => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) {
    try { p = { notification: { body: event.data.text() } }; } catch (e2) {}
  }
  const n = p.notification || {};
  const d = p.data || {};
  const title = n.title || d.title || 'うちの在庫';
  const body = n.body || d.body || '期限が近い食品があります。アプリで確認してください。';
  const link = d.link || (p.fcmOptions && p.fcmOptions.link) || (p.fcm_options && p.fcm_options.link) || self.registration.scope;
  event.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: self.registration.scope + 'icon-192.png',
    badge: self.registration.scope + 'icon-192.png',
    tag: 'uchi-zaiko-daily',
    renotify: true,
    data: { link: link },
  }));
});

// 通知をタップしたらアプリを開く（開いていれば前に出す）
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || self.registration.scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus();
    }
    return self.clients.openWindow(link);
  })());
});
