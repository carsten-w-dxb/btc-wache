(function(){
'use strict';
const KEY='btc-wache-connection-v1',E=BTC.esc,STORE=BTCSignalStore;
let credentials=null,api='',events=[],health=null,checkedAt=0,connected=false,pushReady=false,publicKey='',problem='',busy=false,checking=false,clockOffset=0;
try{credentials=JSON.parse(localStorage.getItem(KEY)||'null');}catch(_){}
const pairing=new URLSearchParams(location.hash.slice(1)).get('pair');
if(pairing)history.replaceState(null,'','#signals');
function when(t){return new Date(t).toLocaleString('de-DE',{timeZone:'Asia/Dubai',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' Dubai';}
function recent(e){return connected&&checkedAt>Date.now()-45000&&health?.fresh&&!health?.muted&&!health?.stopped&&e.expiresAt>Date.now()+clockOffset;}
function statusHTML(){
 const supported='Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
 let label=credentials?(connected?'SIGNAL-EINGANG VERBUNDEN':'VERBINDUNG WIRD GEPRÜFT'):'EINMAL VERBINDEN';
 if(problem&&credentials)label='VERBINDUNG PRÜFEN';
 return '<section class="card btc-channel"><p class="eyebrow">AUTOMATISCHE BTC-WACHE</p><h2>'+label+'</h2><p class="small muted">Dieselben Long-/Short-, Stop- und Sprungmeldungen wie deine WhatsApp-Wache. Gleiche Regeln und Ruhezeiten.</p>'+
 (credentials?'<p class="small">'+(pushReady?'● Handy-Benachrichtigungen sind aktiviert.':'○ Handy-Benachrichtigungen sind noch nicht aktiviert.')+'</p>'+(checkedAt?'<p class="tiny muted">Letzter Signalabruf: '+E(when(checkedAt))+(health&&!health.fresh?' · Wache meldet sich derzeit nicht aktuell.':'')+'</p>':'')+
 '<div class="btns">'+(supported?'<button class="btn primary" data-btc-act="enable" '+(busy?'disabled':'')+'>'+ (pushReady?'Push erneut verbinden':'Benachrichtigungen aktivieren')+'</button>':'')+(pushReady?'<button class="btn" data-btc-act="test">Testnachricht</button><button class="btn subtle" data-btc-act="disable">Push pausieren</button>':'')+'<button class="btn subtle" data-btc-act="sync">Signale aktualisieren</button><button class="btn subtle" data-btc-act="disconnect">Handy trennen</button></div>':
 '<button class="btn primary wide" data-btc-act="connect" '+(!api?'disabled':'')+'>Mit meiner BTC-Wache verbinden</button><p class="tiny muted">Einmal mit deinem bestehenden Carsten-Zugang anmelden. Keine neue Registrierung.</p>')+
 (!supported?'<p class="note">Für Handy-Benachrichtigungen bitte in Chrome auf Android öffnen. Auf dem iPhone die App zuerst zum Home-Bildschirm hinzufügen und dort öffnen.</p>':'')+
 (problem?'<p class="error" role="status">'+E(problem)+'</p>':'')+
 '<p class="tiny muted">Automatische Signale benötigen die laufende Wache und Internet. Die Zustellung kann sich durch Netz oder Handy-Einstellungen verzögern. Eigene Kursmarken bleiben Vordergrund-Alarme. WhatsApp läuft zusätzlich weiter.</p></section>';
}
function eventsHTML(limit=100){
 return '<div class="section-title"><h2>Automatische Meldungen</h2><span class="tiny muted">BTC-WACHE</span></div>'+(events.slice(0,limit).map(e=>{
  const fresh=recent(e),test=e.type==='test';
  return '<article class="card signal '+(e.type==='entry'&&/SHORT/.test(e.title)?'short':e.type==='entry'?'long':'')+'"><div class="row"><strong>'+(fresh||test?E(e.title):'BTC-Wache · Verlauf')+'</strong><span class="badge '+(fresh?'live':'stale')+'">'+(test?'TEST':fresh?'NEU':'ÄLTERE MELDUNG')+'</span></div><p class="tiny muted">'+E(when(e.createdAt))+'</p>'+
  (fresh||test?'<pre class="btc-message">'+E(e.text)+'</pre>':'<p class="small muted">'+E(e.title)+' · nicht als aktueller Einstieg verwenden.</p><details><summary>Ursprüngliche Meldung ansehen</summary><pre class="btc-message">'+E(e.text)+'</pre></details>')+'</article>';
 }).join('')||'<div class="card"><p class="empty">'+(credentials?'Noch keine automatische Meldung empfangen. Es wird nur gemeldet, wenn die bestehende Wache einen Auslöser erkennt.':'Nach dem Verbinden erscheinen die Meldungen deiner BTC-Wache hier automatisch.')+'</p></div>');
}
function update(){document.querySelectorAll('[data-btc-status]').forEach(el=>el.innerHTML=statusHTML());document.querySelectorAll('[data-btc-events]').forEach(el=>el.innerHTML=eventsHTML(Number(el.dataset.btcEvents)||100));}
function panel(showEvents=false,limit=100){return '<div data-btc-status>'+statusHTML()+'</div>'+(showEvents?'<div data-btc-events="'+limit+'">'+eventsHTML(limit)+'</div>':'');}
async function timedFetch(url,options={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);try{return await fetch(url,{...options,signal:c.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});}finally{clearTimeout(t);}}
async function config(){
 if(location.protocol==='file:')throw Error('Für automatische Signale bitte die installierte App über https://carsten-w-dxb.github.io/btc-wache/ öffnen.');
 const r=await timedFetch('./service.json');if(!r.ok)throw Error('Die Signal-Verbindung ist gerade nicht erreichbar.');const d=await r.json(),u=new URL(d.api);
 if(d.version!==1||u.protocol!=='https:'||!u.hostname.endsWith('.trycloudflare.com')||u.pathname!=='/btc-app-api/'||u.search||u.hash||u.username||u.password||u.port)throw Error('Die Signal-Adresse ist ungültig.');
 api=u.href;return api;
}
async function call(route,data){
 if(!api)await config();const r=await timedFetch(api+route,{method:data===undefined?'GET':'POST',headers:{...(credentials?{Authorization:'Bearer '+credentials.token}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
 const d=await r.json();if(!r.ok){if(r.status===401){connected=false;pushReady=false;}throw Error(d.error||'Signalabruf nicht möglich.');}return d;
}
function timeout(p,ms){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('Die Handy-Benachrichtigung antwortet noch nicht. Bitte in Chrome erneut versuchen.')),ms))]);}
async function subscription(){if(!('serviceWorker'in navigator)||!('PushManager'in window))return null;const r=await timeout(navigator.serviceWorker.ready,12000);return r.pushManager.getSubscription();}
async function sync(){
 if(checking||document.hidden||!credentials)return;checking=true;
 try{
  await config();const d=await call('feed');clockOffset=d.serverTime-Date.now();await STORE.merge(d.events);events=await STORE.list();health=d.health;connected=true;checkedAt=Date.now();publicKey=d.publicKey;
  pushReady=!!(d.push&&'Notification'in window&&Notification.permission==='granted'&&await subscription());problem=d.pushError==='subscription-expired'?'Die Handy-Verbindung ist abgelaufen. Bitte Benachrichtigungen erneut aktivieren.':'';
 }catch(e){connected=false;problem=navigator.onLine===false?'Offline. Meldungen sind gespeicherter Verlauf, keine neuen Einstiege.':e.name==='AbortError'?'Signalabruf derzeit nicht erreichbar. WhatsApp bleibt zusätzlich aktiv.':e.message;}
 finally{checking=false;update();}
}
async function enable(){
 if(busy)return;busy=true;problem='';
 try{
  // Die Browserfreigabe muss unmittelbar aus dem Fingertipp kommen.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Bitte in den Handy-Einstellungen Benachrichtigungen für diese App erlauben.');
  update();if(!publicKey){await sync();if(!publicKey)throw Error('Bitte die Signal-Verbindung zuerst aktualisieren.');}
  const r=await timeout(navigator.serviceWorker.ready,12000);let sub=await r.pushManager.getSubscription();
  if(!sub){const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await timeout(r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}),20000);}
  await call('subscribe',sub.toJSON());pushReady=true;problem='Benachrichtigungen aktiviert. Mit „Testnachricht“ kannst du die Zustellung auf diesem Handy prüfen.';
 }catch(e){pushReady=false;problem=e.message;}finally{busy=false;update();}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-btc-act]');if(!b)return;
 const act=b.dataset.btcAct;
 try{
  if(act==='connect'){await config();location.href=api+'connect';return;}
  if(act==='enable'){enable();return;}
  if(act==='sync'){await sync();return;}
  if(act==='test'){b.disabled=true;await call('test',{});problem='Test vom Push-Dienst angenommen. Bitte prüfen, ob die Testnachricht auf deinem Handy erscheint.';}
  if(act==='disable'){const s=await subscription();if(s)await s.unsubscribe();pushReady=false;await call('unsubscribe',{});problem='Handy-Benachrichtigungen pausiert. Der Signal-Verlauf bleibt erreichbar.';}
  if(act==='disconnect'){
   if(!confirm('Dieses Handy von der BTC-Wache trennen? WhatsApp und dein lokales Journal bleiben unverändert.'))return;
   const s=await subscription();if(s)await s.unsubscribe();await call('disconnect',{});localStorage.removeItem(KEY);credentials=null;connected=false;pushReady=false;problem='Dieses Handy ist getrennt.';
  }
 }catch(err){problem=err.message;}finally{update();}
});
async function init(){
 try{events=await STORE.list();await config();if(pairing){const d=await call('pair',{code:pairing});credentials={token:d.token};localStorage.setItem(KEY,JSON.stringify(credentials));publicKey=d.publicKey;problem='Verbunden. Bitte jetzt „Benachrichtigungen aktivieren“ antippen.';}if(credentials)await sync();}
 catch(e){problem=e.message;}finally{update();}
}
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',async e=>{if(e.data?.type==='btc-signal'){try{events=await STORE.list();}catch(_){}update();sync();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});window.addEventListener('online',sync);window.addEventListener('offline',()=>{connected=false;problem='Offline. Kein aktuelles Einstiegssignal verfügbar.';update();});
window.BTCChannel={panel};init();setInterval(()=>{sync();update();},15000);
})();
