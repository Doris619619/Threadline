/** Service Worker：缓存精确的应用壳与 Next 静态资源，绝不以 HTML 响应脚本或样式请求。 */

const CACHE = 'threadline-shell-v4';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon.png',
  '/apple-touch-icon.png',
  '/icon-maskable.png',
  '/auth/welcome-illustration.jpg',
  '/auth/login-illustration.jpg',
  '/themes/anya/notebook.webp',
  '/themes/anya/icon.png',
  '/themes/cottage/personal-room.webp',
  '/themes/cottage/pixels.svg',
  '/themes/cottage/furniture.svg',
  '/themes/cottage/avatar-blue.webp',
  '/themes/cottage/avatar-pink.webp',
  '/themes/cottage/avatar-casual.webp',
  '/themes/cottage/icon.svg',
  '/themes/cottage/icon.png',
  '/themes/classic/icon.svg',
  '/themes/classic/icon.png',
  '/themes/classic/frame.svg',
  '/themes/classic/bracket.svg',
  '/themes/classic/frame-dark.svg',
  '/themes/classic/bracket-dark.svg',
];
const PRECACHE_MANIFEST = '/sw-precache.json';

/** 读取构建生成的 Next asset 清单；缺失时保留可运行的最小应用壳。 */
async function getPrecacheAssets() {
  try {
    const response = await fetch(PRECACHE_MANIFEST, { cache: 'no-store' });
    if (!response.ok) return [];
    const manifest = await response.json();
    return Array.isArray(manifest.assets) ? manifest.assets : [];
  } catch {
    return [];
  }
}

/** 将可用资源逐项写入缓存，单一过期 asset 不会阻断整个 Service Worker 安装。 */
async function precache(cache, assets) {
  await Promise.all(
    assets.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // 构建清单与服务版本短暂错位时，保留其余缓存资源供当前壳继续运行。
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) =>
        precache(cache, [...SHELL, ...(await getPrecacheAssets())]),
      ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Clone before returning the live response and keep the worker alive until its cache write finishes. */
function cacheResponse(event, response) {
  if (!response.ok) return;
  const copy = response.clone();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.put(event.request, copy))
      .catch(() => undefined),
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isNavigation = event.request.mode === 'navigate';
  const isStaticAsset =
    url.pathname.startsWith('/_next/') ||
    ['style', 'script', 'font', 'image', 'worker'].includes(event.request.destination);

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          cacheResponse(event, response);
          return response;
        })
        .catch(async () => (await caches.match(event.request)) ?? caches.match('/')),
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((response) => {
            cacheResponse(event, response);
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        cacheResponse(event, response);
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
