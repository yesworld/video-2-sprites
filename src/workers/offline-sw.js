/* The production build supplies BUILD from the emitted filenames and their contents. */
const scope = self.registration.scope
const cachePrefix = 'stripe-studio:' + scope + ':'
const cacheName = cachePrefix + BUILD.revision
const assetUrls = new Set(BUILD.files.map((path) => new URL(path, scope).href))
const indexUrl = new URL('index.html', scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...assetUrls])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  const shell = event.request.mode === 'navigate' && (url.href.split('?')[0] === scope || url.href.split('?')[0] === indexUrl)
  if (!shell && !assetUrls.has(url.href)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return await cache.match(shell ? indexUrl : url.href) ?? await fetch(event.request)
  })())
})
