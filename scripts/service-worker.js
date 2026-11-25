const scope = new URL(self.registration.scope)
const prefix = `baseline-lab:${scope.pathname}:`
const cacheName = prefix + __VERSION__
const files = new Set(__ASSETS__.map(path => new URL(path, scope).href))
const shell = new URL('index.html', scope)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await cache.addAll([...files].map(url => new Request(url, { cache: 'reload' })))
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  url.search = ''
  url.hash = ''
  const appNavigation = request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === shell.pathname)
  const asset = appNavigation ? shell.href : url.href
  if (!files.has(asset)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return (await cache.match(asset)) || fetch(request)
  })())
})
