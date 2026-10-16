'use strict';
const PREFIX='btc-wache-mobil-', CACHE=PREFIX+'v2-lumassi';
const FILES=['./','./index.html','./styles.css','./core.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./lumassi-logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url),scope=new URL(self.registration.scope);
 if(e.request.method!=='GET'||u.origin!==scope.origin||!u.pathname.startsWith(scope.pathname))return;
 if(!FILES.some(p=>new URL(p,scope).pathname===u.pathname))return;
 e.respondWith(caches.open(CACHE).then(async c=>{
  const hit=await c.match(e.request,{ignoreSearch:true});
  if(hit)return hit;
  try{return await fetch(e.request);}catch(err){if(e.request.mode==='navigate')return c.match('./index.html');return new Response('',{status:503});}
 }));
});
