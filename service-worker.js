const CACHE_NAME = 'layer-app-cache-v5.0';
const urlsToCache = [
    '/',
    '/api.js',
    '/config.js',
    '/index.html',
    '/lock-calc.html',
    '/src/app.css',
    '/src/app.js',
    '/src/app.png',
    '/src/base91.min.js',
    '/src/crypto-js.min.js',
    '/src/fonts/syl0-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjpZIvDmUSVOK7BDB_Qb9vUSzq3wzLK-P0J-V_Zs-QtQth3-jOcbTCVpeRL2w5rwZu2rIelXxc.woff2',
    '/src/fonts/syl0-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjpZIvDmUSVOK7BDJ_vb9vUSzq3wzLK-P0J-V_Zs-QtQth3-jOcbTCVpeRL2w5rwZu2rIelXxc.woff2',
    '/src/hls.js',
    '/src/jschardet.min.js',
    '/src/localforage.min.js',
    '/src/macy@2.js',
    '/src/manifest.json',
    '/src/mdui.css',
    '/src/mdui.global.js',
    '/src/pako.min.js',
    '/src/smooth-scrollbar.js',
    '/src/video.js',
    '/src/OverlayScrollbars.min.css',
    '/src/OverlayScrollbars.min.js',
    '/service-worker.js'
];

// 安装事件：预缓存资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 拦截 fetch 请求
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果缓存中有匹配的响应，则返回它
                if (response) {
                    return response;
                }

                // 否则从网络获取
                return fetch(event.request).then((networkResponse) => {
                    // 检查是否是有效的响应
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    // 克隆响应并缓存
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                });
            }).catch(() => {
                // 可选：离线时返回一个备用页面或响应
                // return caches.match('/offline.html');
            })
    );
});