// The build replaces these with a content hash and the complete local shell.
const VERSION='__GM_CACHE_VERSION__';
const SHELL=__GM_SHELL_FILES__;
const CACHE='gm-shell-'+VERSION;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// Do not skipWaiting: keep an open geometry session on one coherent app version.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('gm-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  // Cloudflare redirects /index.html to /. Cache the canonical navigation URL.
  const path=url.pathname==='/index.html'?'/':url.pathname;
  if(!SHELL.includes(path))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(path);if(cached)return cached;
    return fetch(request);
  }));
});
