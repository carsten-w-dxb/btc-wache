'use strict';
importScripts('./signal-store.js');
const PREFIX='btc-wache-mobil-', CACHE=PREFIX+'v5-push-freigabe';
const FILES=['./','./index.html','./styles.css','./core.js','./app.js','./signal-store.js','./signal-channel.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./lumassi-logo.png'];
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
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let data;try{data=e.data.json();}catch(_){return;}
 if(!BTCSignalStore.valid(data))return;
 const expired=data.expiresAt<=Date.now(),tag='btc-'+data.id;
 try{await BTCSignalStore.merge([data]);}catch(_){}
 await self.registration.showNotification(expired?'BTC-Wache · ältere Meldung':data.title,{
  body:expired?'Ein Signal ist verspätet angekommen. Es ist kein aktueller Einstieg. Im Verlauf ansehen.':data.text,
  icon:'./icon-192.png',badge:'./icon-192.png',tag,renotify:false,
  timestamp:data.createdAt,data:{id:data.id},vibrate:[200,100,200]
 });
 for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'btc-signal',id:data.id});
})()));
self.addEventListener('notificationclick',e=>{
 e.notification.close();e.waitUntil((async()=>{
  const url=new URL('./#signals',self.registration.scope).href;
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
   if(client.url.startsWith(self.registration.scope)){await client.navigate(url);return client.focus();}
  }
  return self.clients.openWindow(url);
 })());
});
