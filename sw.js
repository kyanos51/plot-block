// 오프라인 실행용 서비스워커.
// 네트워크 우선, 실패하면 캐시 사용 (개발 중 업데이트가 바로 반영되도록).
const CACHE = 'plot-block-v26';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/main.js',
  './js/pop.js',
  './js/fx.js',
  './js/combo.js',
  './js/memo.js',
  './js/palette.js',
  './js/store.js',
  './js/text.js',
  './js/sheetinfo.js',
  './js/search.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 'no-cache': GitHub Pages의 브라우저 캐시(약 10분)를 건너뛰고 항상 최신 파일 확인
  const url = new URL(e.request.url);
  const fresh = url.origin === location.origin ? fetch(url.href, { cache: 'no-cache' }) : fetch(e.request);
  e.respondWith(
    fresh
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
