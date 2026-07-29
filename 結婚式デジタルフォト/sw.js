/**
 * Wedding Camera — Service Worker
 *
 * 目的はひとつだけです。会場の回線が切れた瞬間にリロードしても
 * 真っ白にならないようにすること。
 *
 * ■ 絶対にキャッシュしないもの
 *   - GAS の API（script.google.com / script.googleusercontent.com）
 *   - Drive のサムネイル（drive.google.com）
 *   古い応答を返すと「撮ったのに出てこない」「保存できたか分からない」の原因になります。
 *
 * ■ HTML は network-first
 *   当日の緊急修正が反映されないと困るため、通信があれば必ず新しい方を使います。
 */

const CACHE_NAME = 'wedcam-shell-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/cover.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // 1 つ欠けても install 全体を失敗させないよう個別に追加します
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((url) => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/** キャッシュしてはいけないホスト */
const BYPASS_HOSTS = [
  'script.google.com',
  'script.googleusercontent.com',
  'drive.google.com',
  'www.googleapis.com'
];

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (error) { return; }

  if (BYPASS_HOSTS.indexOf(url.hostname) !== -1) return; // ネットワークにそのまま通す

  const isDocument = request.mode === 'navigate' ||
    (request.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isDocument) {
    // network-first：新しい HTML を優先し、落ちていたらキャッシュで表示
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  // それ以外（フォント・アイコン・背景画像など）は cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.origin === self.location.origin || response.type === 'cors')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});