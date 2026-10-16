/* BTC-Wache Mobil v1 — läuft im Browser, speichert nur auf diesem Gerät. */
(function(){
'use strict';
const C=BTC, E=C.esc, F=C.format, main=document.getElementById('main');
let state=C.empty(), storageBroken=false, storageMessage='', tab='market', error='', calc=null;
let draft={side:'LONG',entry:'',stop:'',t1:'',t2:''}, importDraft='', busy=false, onlineOK=false, last5=0, fiveRows=null, installing=null, audio=null, toastTimer;
let priceSocket=null,priceRetry=null,pendingPrice=null,lastStreamAt=0,lastPriceSave=0,priceOpenedAt=0;
try{const raw=localStorage.getItem(C.KEY);if(raw)state=C.validateBackup(JSON.parse(raw));}
catch(e){storageBroken=true;storageMessage='Der lokale Speicher ist nicht lesbar. Vorhandene Daten werden nicht überschrieben. Bitte zuerst eine Sicherung prüfen.';}
function save(){
  if(storageBroken)return false;
  try{localStorage.setItem(C.KEY,JSON.stringify(state));return true;}
  catch(e){storageMessage='Speichern auf diesem Gerät ist nicht möglich. Bitte eine Sicherung exportieren; neue Einträge sind sonst nur bis zum Schließen da.';return false;}
}
function commit(message){const ok=save();toast(ok?message:'Nicht dauerhaft gespeichert. Bitte unter „Mehr“ eine Sicherung exportieren.');return ok;}
function toast(t){const el=document.getElementById('toast');el.textContent=t;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.textContent='';},6500);}
function stamp(t){return new Date(t).toLocaleString('de-DE',{timeZone:'Asia/Dubai',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' Dubai';}
function trend(n){return n==null?'—':(n>=0?'+':'')+F(n,2)+' %';}
function signed(n){return n>=0?'up':'down';}
function field(name,label,value='',placeholder='',type='text',extra=''){return '<div class="field"><label for="'+E(name)+'">'+label+'</label><input id="'+E(name)+'" name="'+E(name)+'" type="'+type+'" value="'+E(value)+'" placeholder="'+E(placeholder)+'" '+extra+'></div>';}
function numeric(name,label,value='',placeholder=''){return field(name,label,value,placeholder,'text','inputmode="decimal" autocomplete="off"');}
function header(label,title,intro){return '<p class="eyebrow">'+label+'</p><h1>'+title+'</h1><p class="intro">'+intro+'</p>';}
function chart(m){
 if(!m?.rows?.length)return '<div class="chart-empty">Dein Kursverlauf erscheint nach dem ersten Abruf.</div>';
 const rows=m.rows,values=rows.map(k=>k.c),lo=Math.min(...values),hi=Math.max(...values),range=hi-lo||1;
 const points=values.map((v,i)=>(10+i/(values.length-1)*580).toFixed(2)+','+(125-(v-lo)/range*105).toFixed(2)).join(' ');
 const last=points.split(' ').pop().split(',');
 return '<svg class="chart" viewBox="0 0 600 150" role="img" aria-label="BTC-Kurs der letzten '+(rows.length-1)+' Minuten"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6a547" stop-opacity=".22"/><stop offset="1" stop-color="#f6a547" stop-opacity="0"/></linearGradient></defs><path d="M10,140 L'+points.replace(/ /g,' L')+' L590,140 Z" fill="url(#shade)"/><polyline points="'+points+'" fill="none" stroke="#f6a547" stroke-width="2.6" stroke-linejoin="round"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="4" fill="#f6a547"/></svg><div class="chart-labels"><span>'+new Date(rows[0].t).toLocaleTimeString('de-DE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'})+'</span><span>ca. 1 Stunde · Dubai-Zeit</span><span>'+new Date(rows[rows.length-1].t).toLocaleTimeString('de-DE',{timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit'})+'</span></div>';
}
function eventsHTML(){return state.events.slice(0,8).map(e=>'<article class="event"><div class="row"><strong>'+E(e.title)+'</strong><time>'+E(stamp(e.at))+'</time></div><p class="muted">'+E(e.text)+'</p></article>').join('')||'<p class="empty">Noch keine lokalen Alarme. Deine WhatsApp-Meldungen bleiben im Chat.</p>';}
function marketHTML(){
 const m=state.market,fresh=onlineOK&&m&&Date.now()-m.at<45000,ws=C.watchStatus();
 return header('BTC / USDT PERPETUAL','Alles im Blick.','Live-Kurs im 0,5-Sekunden-Takt. Signale automatisch empfangen.')+
 '<section class="card hero"><div class="row"><span class="small muted">Bitcoin <strong class="tiny">BTC</strong></span><span class="badge '+(fresh?'live':'stale')+'"><i class="dot"></i>'+(fresh?'AKTUELL':m?'GESPEICHERTER STAND':'VERBINDE …')+'</span></div>'+
 '<div class="price"><span data-live-price>'+(m?F(m.price):'—')+'</span> <small>USDT</small></div><div class="small muted" data-live-stamp>'+(m?'Letzter Abruf '+E(stamp(m.at)):'Direkter Kursabruf von Binance, ohne Anmeldung.')+'</div>'+chart(m)+
 '<div class="metrics"><div><span>5 Minuten</span><strong class="'+signed(m?.changes?.five||0)+'">'+trend(m?.changes?.five)+'</strong></div><div><span>15 Minuten</span><strong class="'+signed(m?.changes?.fifteen||0)+'">'+trend(m?.changes?.fifteen)+'</strong></div><div><span>RSI(7) · 5 Min.</span><strong>'+F(m?.rsi,0)+'</strong></div></div></section>'+
 '<div class="row"><span class="tiny muted">Binance-Futures · nicht der IQ-Option-Kurs</span><button class="btn subtle" data-act="refresh" '+(busy?'disabled':'')+'>'+(busy?'Lädt …':'↻ Aktualisieren')+'</button></div>'+
 (error?'<p class="error" role="alert">'+E(error)+'</p>':'')+
 BTCChannel.panel(true,1)+
 '<div class="card"><div class="row"><div><p class="eyebrow">DEINE WACHE</p><h3>'+E(ws.label)+'</h3></div><span class="badge">DUBAI</span></div><p class="small muted">'+E(ws.text)+'</p><p class="note">Automatische Wachen-Signale kommen nach dem Verbinden auch per Handy-Benachrichtigung. Eigene Kursmarken funktionieren nur, solange diese App im Vordergrund offen ist.</p></div>'+
 '<div class="section-title"><h2>Kursalarme</h2><a href="#more" class="small">Verwalten →</a></div><div class="card"><div class="row"><div><strong>'+state.alarms.filter(a=>a.active).length+' aktiv</strong><p class="small muted">Einmalige Alarme bei deinen Kursmarken.</p></div><a class="btn" href="#more">+ Alarm</a></div></div>'+
 '<div class="section-title"><h2>Letzte Meldungen</h2><span class="tiny muted">NUR AUF DIESEM HANDY</span></div><section class="card">'+eventsHTML()+'</section>';
}
function resultHTML(s){
 const q=C.quantity(s.entry,s.stop,state.balance),tr=C.trail(s.side,s.entry,s.stop,s.t1);
 return '<div class="result"><span class="small muted">Quantity in BTC · 25 % Stop-Budget</span><div class="big">'+(q&&q.affordable?F(q.q,2):'—')+'</div>'+
 (!state.balance?'<p class="small">Bitte unter „Mehr“ deinen Kontostand einmal eintragen.</p>':!q?.affordable?'<p class="small">Die Mindestgröße 0,01 BTC ist mit diesem Kontostand bei Hebel 1000 nicht finanzierbar.</p>':'<p class="small">Stop inkl. Spread: ca. '+F(q.percent,1)+' % vom Konto'+(q.forced?' · Mindestgröße 0,01 erzwungen, deshalb über dem gewählten Budget.':'.')+'</p>')+
 '<div class="statlist"><div><span>Einstieg</span><strong>'+F(s.entry)+'</strong></div><div><span>Stop</span><strong>'+F(s.stop)+'</strong></div><div><span>Ziel 1</span><strong>'+F(s.t1)+'</strong></div><div><span>Ziel 2</span><strong>'+F(s.t2)+'</strong></div></div>'+
 (tr?'<p class="small">🔒 Ab '+F(tr.from)+': Stop auf '+F(tr.to)+' ziehen.</p>':'')+
 '<p class="tiny muted">Der eingegebene Stop wird unverändert verwendet, nicht nochmals verdoppelt. Keine Orderausführung.</p></div>';
}
function signalsHTML(){
 return header('SIGNAL & QUANTITY','Dein nächster Schritt.','Automatische Meldungen deiner BTC-Wache und dein Quantity-Rechner.')+BTCChannel.panel(true)+
 '<section class="card"><h2>Signal zusätzlich in den Rechner übernehmen</h2><form id="signal-form"><div class="field"><label for="signal-text">Vollständigen Signaltext hier einfügen</label><textarea id="signal-text" name="text" rows="4" maxlength="12000" placeholder="JETZT LONG auf BTC-Perp …">'+E(importDraft)+'</textarea></div><button class="btn primary wide" type="submit">Signal übernehmen</button><p class="tiny muted">Optional für deinen lokalen Quantity-Rechner. Automatische Meldungen stehen bereits oben; kein Hineinkopieren nötig.</p></form></section>'+
 '<section class="card"><h2>Quantity-Rechner</h2><form id="calc-form"><div class="field"><label for="side">Richtung</label><select name="side" id="side"><option value="LONG" '+(draft.side==='LONG'?'selected':'')+'>🔴 LONG</option><option value="SHORT" '+(draft.side==='SHORT'?'selected':'')+'>🟢 SHORT</option></select></div><div class="grid2">'+numeric('entry','Einstieg',draft.entry,'Kurs in $')+numeric('stop','Stop',draft.stop,'Endgültiger Stop')+numeric('t1','Ziel 1 · optional',draft.t1)+numeric('t2','Ziel 2 · optional',draft.t2)+'</div><button class="btn primary wide">Berechnen</button></form>'+
 (calc?resultHTML(calc)+'<button class="btn wide" data-act="save-calc">Berechnung merken</button>':'')+'<p class="tiny muted">Reiner Rechner, kein neues Handelssignal. Es gelten deine bisherigen 25 %, Spread 14,10 $, Hebel 1000, Schritt und Mindestgröße 0,01 BTC.</p></section>'+
 '<div class="section-title"><h2>Übernommene Signale</h2><span class="tiny muted">'+state.signals.length+' EINTRÄGE</span></div>'+
 (state.signals.map(s=>'<article class="card signal '+s.side.toLowerCase()+'"><div class="row"><div><span class="side">'+E(s.side)+'</span> <span class="badge">'+E(s.source)+'</span></div><button class="btn subtle" data-act="archive-signal" data-id="'+E(s.id)+'" aria-label="Signal archivieren">×</button></div><p class="muted">'+E(s.reason)+'</p><p class="tiny muted">Übernommen '+E(stamp(s.importedAt))+' · nicht auf Aktualität geprüft.</p>'+
 (s.quality?'<p class="quality">Qualität: '+E(s.quality)+'</p>':'')+resultHTML(s)+
 (s.raw?'<details><summary>Originaltext ansehen</summary><pre>'+E(s.raw)+'</pre></details>':'')+'</article>').join('')||'<div class="card"><p class="empty">Noch kein Signal übernommen. Hier erscheinen nur deine manuell gespeicherten Einträge.</p></div>');
}
function journalHTML(){
 const pnl=state.trades.reduce((sum,t)=>sum+t.pnl,0),wins=state.trades.filter(t=>t.pnl>0).length;
 return header('DEIN TRADE-JOURNAL','Klarer Rückblick.','Ergebnisse von Hand eintragen. Alles bleibt auf diesem Gerät.')+
 '<div class="card summary"><span class="small muted">Erfasster Gewinn / Verlust · netto</span><div><strong class="'+signed(pnl)+'">'+(pnl>=0?'+':'')+F(pnl)+' $</strong></div><p>'+state.trades.length+' Trades erfasst · '+wins+' im Plus</p></div>'+
 '<section class="card"><h2>Trade eintragen</h2><form id="trade-form"><div class="grid2">'+field('date','Datum (Dubai)',C.dubai().day,'','date')+'<div class="field"><label for="trade-side">Richtung</label><select name="side" id="trade-side"><option>LONG</option><option>SHORT</option></select></div></div>'+numeric('pnl','Tatsächlicher Gewinn / Verlust netto ($)','','z. B. -8,50 oder 12,40')+'<div class="field"><label for="trade-note">Notiz · optional</label><textarea id="trade-note" name="note" rows="2" maxlength="500" placeholder="Was lief gut? Was war anders?"></textarea></div><button class="btn primary wide">Trade speichern</button><p class="tiny muted">Ändert den Kontostand nicht automatisch. Den aktuellen Betrag trägst du unter „Mehr“ ein; Lucy separat per WhatsApp mitteilen.</p></form></section>'+
 '<div class="section-title"><h2>Deine Einträge</h2></div><div class="card">'+(state.trades.map(t=>'<article class="journal-item"><div class="row"><div><strong>'+E(t.side)+'</strong><div class="tiny muted">'+E(t.date.split('-').reverse().join('.'))+'</div></div><strong class="'+signed(t.pnl)+'">'+(t.pnl>=0?'+':'')+F(t.pnl)+' $</strong></div>'+(t.note?'<p class="small muted">'+E(t.note)+'</p>':'')+'</article>').join('')||'<p class="empty">Dein Journal ist noch leer.</p>')+'</div>';
}
function moreHTML(){
 return header('NUR DEIN HANDY','So, wie du handelst.','Benachrichtigungen, Kontostand, Kursmarken und deine lokale Sicherung.')+BTCChannel.panel(false)+
 '<section class="card"><h2>Dein Kontostand</h2><form id="balance-form">'+numeric('balance','Kontostand in US-Dollar',state.balance==null?'':F(state.balance),'Bitte einmal eintragen')+'<button class="btn primary wide">Auf diesem Handy speichern</button></form><p class="note gold">Dieser Betrag bleibt lokal. Änderungen werden nicht an Lucy oder an die bestehende BTC-Wache übertragen. Für deren Quantity schickst du Lucy den Betrag wie bisher per WhatsApp.</p><ul class="settings-list"><li><span>Stop-Budget</span><strong>25 % vom Konto</strong></li><li><span>Spread</span><strong>14,10 $</strong></li><li><span>Hebel</span><strong>1000</strong></li><li><span>Schritt / Mindestgröße</span><strong>0,01 BTC</strong></li></ul></section>'+
 '<section class="card"><h2>Kursalarme</h2><form id="alarm-form"><div class="grid2"><div class="field"><label for="direction">Melden bei</label><select name="direction" id="direction"><option value="above">Kurs ab / über</option><option value="below">Kurs ab / unter</option></select></div>'+numeric('alarm-price','Kurs in USDT','','z. B. 85.000')+'</div><button class="btn wide">+ Kursalarm speichern</button></form><p class="tiny muted">Einmaliger Alarm, auch wenn die Marke beim nächsten Abruf bereits erreicht ist. Nur im Vordergrund, unabhängig von der Nachtruhe.</p>'+
 state.alarms.map(a=>'<div class="alarm row"><div><span class="tiny muted">'+(a.direction==='above'?'AB / ÜBER':'AB / UNTER')+'</span><br><strong>'+F(a.price)+' $</strong><div class="toggle-state">'+(a.active?'Wartet auf Kursmarke':a.firedAt?'Ausgelöst '+E(stamp(a.firedAt)):'Pausiert')+'</div></div><button class="btn subtle" data-act="toggle-alarm" data-id="'+E(a.id)+'">'+(a.active?'Pausieren':'Aktivieren')+'</button></div>').join('')+'</section>'+
 '<section class="card"><h2>Lokale Sprünge & Ton</h2><label class="check"><input id="jump-setting" type="checkbox" '+(state.settings.jumps?'checked':'')+'>Zusätzliche lokale Kursbewegungen melden</label><p class="tiny muted">0,7 % in 5 Min. oder 1 % in 15 Min. · 05–21 Uhr Dubai, auch am Wochenende · 30 Min. Pause, höchstens 6 am Tag. Nur während die App offen ist. Die automatischen Sprungmeldungen der Wache sind davon unabhängig.</p><label class="check"><input id="sound-setting" type="checkbox" '+(state.settings.sound?'checked':'')+'>Kurzer Ton bei lokalem Alarm</label><p class="tiny muted">Der Ton dieser lokalen Alarme ist unabhängig von Handy-Benachrichtigungen. Lautlosmodus und Browser können ihn unterdrücken.</p></section>'+
 '<section class="card"><h2>Sicherung</h2><p class="small muted">Bei Handywechsel, Browserdaten-Löschen oder Neuinstallation können lokale Einträge verloren gehen. Die Sicherungsdatei enthält auch deinen Kontostand.</p><div class="btns"><button class="btn" data-act="export">Sicherung speichern</button><label class="btn file-label">Sicherung laden<input id="import-backup" type="file" accept=".json,application/json" aria-label="Sicherung auswählen"></label></div></section>'+
 '<section class="card"><h2>Als Handy-App nutzen</h2><div class="textblock"><p>Über einen freigegebenen HTTPS-Link in <strong>Chrome auf Android</strong> öffnen: Menü ⋮ → „Zum Startbildschirm hinzufügen“ → „Installieren“.</p><p>Die HTML-Datei lässt sich zunächst direkt im Browser ausprobieren. Die Installation als App und der zuverlässigere Offline-Start brauchen den HTTPS-Link.</p><p>Die Oberfläche, dein Journal und der Rechner funktionieren nach dem ersten Laden auch offline. Aktuelle Kurse und Alarme benötigen Internet und eine geöffnete App.</p></div></section>'+
 '<details class="card"><summary>Was die App kann – und was nicht</summary><div class="textblock"><p>Kontostand und Journal bleiben im lokalen Browser-Speicher. Kein Tracking, kein Broker-Login und keine Orderausführung. Für die automatische Wache wird ein eigener Gerätezugang gespeichert. Bei Kursabrufen sieht Binance deine IP-Adresse. Über den Installationslink sieht auch der Seitenanbieter den Abruf.</p><p>Marktdaten: Binance BTCUSDT Perpetual. USDT ist nicht exakt USD, und die Kurse können von IQ Option abweichen. Der Live-Kurs wird höchstens zweimal je Sekunde angezeigt; bei unterbrochenem Datenstrom wird kein Live-Takt behauptet. RSI aus geschlossenen 5-Minuten-Kerzen dient nur der Übersicht.</p><p>Automatische Signale stammen direkt aus der bestehenden Wache, nicht aus dem WhatsApp-Chat. Die App erzeugt keine zweite Strategie. Kalender-, Trend-, Nacht- und Wochenendfilter bleiben unverändert. Ein Signal wird nach drei Minuten nur noch als Verlauf angezeigt. Eine gespeicherte Berechnung ist kein Handelssignal.</p><p>Quantity und Journal bleiben lokal. Automatische Signaltexte können die Quantity der bestehenden Wache enthalten. Trailing-Stufe: ab +0,5 R auf Einstieg +0,25 R + Spread, nur wenn die Stufe vor Ziel 1 liegt.</p><p>Für Hintergrund-Benachrichtigungen wird der Push-Dienst deines Browsers verwendet. Signale und Gerätezugänge liegen geschützt auf dem bestehenden Server, nicht öffentlich bei GitHub. Kontostand und lokale Einträge sind nicht verschlüsselt. Personen mit Zugriff auf das entsperrte Handy können sie lesen.</p></div></details><p class="version">BTC-Wache Mobil · automatische Signale · 16.10.2026</p>';
}
function render(){
 document.querySelectorAll('[data-tab]').forEach(a=>{if(a.dataset.tab===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 main.innerHTML=(storageMessage?'<p class="warning" role="alert">'+E(storageMessage)+'</p>':'')+({market:marketHTML,signals:signalsHTML,journal:journalHTML,more:moreHTML}[tab]||marketHTML)();
}
function navigate(){
 tab=['market','signals','journal','more'].includes(location.hash.slice(1))?location.hash.slice(1):'market';
 render();window.scrollTo(0,0);
}
function beep(){
 if(!state.settings.sound)return;
 try{
  const ctx=audio;
  if(!ctx||ctx.state!=='running')return;
  const osc=ctx.createOscillator(),g=ctx.createGain();osc.connect(g);g.connect(ctx.destination);osc.frequency.value=880;g.gain.setValueAtTime(.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.3);osc.start();osc.stop(ctx.currentTime+.3);
 }catch(e){}
}
async function json(url){
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
 try{const res=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:ctl.signal});if(!res.ok)throw Error('Kursanbieter antwortet nicht ('+res.status+').');return await res.json();}
 finally{clearTimeout(timeout);}
}
async function refresh(){
 if(busy||document.hidden)return;
 if(navigator.onLine===false){onlineOK=false;error='Offline. Gespeicherter Kurs ist nicht aktuell; keine neuen lokalen Alarme.';if(tab==='market')render();return;}
 busy=true;if(tab==='market')render();
 try{
  const now=Date.now(),need5=!fiveRows||now-last5>=60000;
  const result=await Promise.all([json('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=61'),need5?json('https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=5m&limit=200').catch(()=>null):Promise.resolve(null)]);
  if(document.hidden)return;
  const current=C.candleData(result[0],60000);
  if(need5){if(result[1]){try{fiveRows=C.candleData(result[1],300000).closed;last5=now;}catch(e){fiveRows=null;}}else fiveRows=null;}
  const changes=C.jumpChanges(current.closed);
  const live=Date.now()-lastStreamAt<5000&&state.market;
  state.market={price:live?state.market.price:current.last,at:live?state.market.at:Date.now(),rows:current.rows.map(k=>({t:k.t,c:k.c})),changes,rsi:fiveRows&&Date.now()-last5<360000?C.rsi(fiveRows.map(k=>k.c),7):null};
  onlineOK=true;error='';
  const fired=C.fireAlarms(state,state.market.price,Date.now(),true,changes);
  save();
  if(fired.length){toast(fired.map(e=>e.title+': '+e.text).join(' · '));beep();}
 }catch(e){onlineOK=false;error=navigator.onLine===false?'Offline. Gespeicherter Kurs ist nicht aktuell; keine neuen lokalen Alarme.':'Kursabruf derzeit nicht möglich. Gespeicherter Stand bleibt sichtbar; keine neuen lokalen Alarme.';}
 finally{busy=false;if(tab==='market')render();}
}
main.addEventListener('input',e=>{
 if(e.target.closest('#calc-form')&&e.target.name)draft[e.target.name]=e.target.value;
 if(e.target.id==='signal-text')importDraft=e.target.value;
});
main.addEventListener('submit',e=>{
 e.preventDefault();const f=e.target,values=Object.fromEntries(new FormData(f));
 if(storageBroken && f.id!=='calc-form'){toast('Vorhandener Speicher ist nicht lesbar. Bitte zuerst eine gültige Sicherung unter „Mehr“ laden.');return;}
 try{
  if(f.id==='balance-form'){
   const balance=C.number(values.balance);if(!(balance>0&&balance<1e12))throw Error('Bitte einen gültigen positiven Kontostand eingeben.');
   state.balance=balance;commit('Kontostand auf diesem Handy gespeichert. Die WhatsApp-Wache wird nicht geändert.');render();
  }else if(f.id==='signal-form'){
   if(state.signals.length>=200)throw Error('200 Einträge erreicht. Bitte zuerst eine Sicherung speichern und alte Signale archivieren.');
   const s=C.parseSignal(values.text);
   if(state.signals.some(x=>x.raw===s.raw))throw Error('Dieses Signal ist bereits gespeichert.');
   state.signals.unshift(s);importDraft='';commit('Signal übernommen. Bitte die ursprüngliche Signalzeit selbst prüfen.');render();
  }else if(f.id==='calc-form'){
   const entry=C.priceNumber(values.entry),stop=C.priceNumber(values.stop),t1=C.priceNumber(values.t1),t2=C.priceNumber(values.t2),side=values.side;
   if((values.t1.trim()&&t1==null)||(values.t2.trim()&&t2==null))throw Error('Bitte gültige Zahlen für die Ziele eingeben.');
   C.validateSetup(side,entry,stop,t1,t2);calc={entry,stop,t1,t2,side};draft=values;render();
  }else if(f.id==='trade-form'){
   const pnl=C.number(values.pnl);
   if(pnl==null||Math.abs(pnl)>1e12||!/^\d{4}-\d{2}-\d{2}$/.test(values.date)||Number.isNaN(Date.parse(values.date+'T12:00:00Z')))throw Error('Bitte ein gültiges Datum und ein Ergebnis eingeben.');
   if(state.trades.length>=2000)throw Error('Journal ist voll. Bitte eine Sicherung exportieren.');
   state.trades.unshift({id:C.uid(),date:values.date,side:values.side,pnl,note:values.note.trim().slice(0,500)});commit('Trade im lokalen Journal gespeichert.');render();
  }else if(f.id==='alarm-form'){
   const price=C.priceNumber(values['alarm-price']);if(!(price>0&&price<1e9))throw Error('Bitte eine gültige Kursmarke eingeben.');
   if(state.alarms.length>=50)throw Error('Höchstens 50 Kursalarme. Vorhandene Marken kannst du pausieren oder wieder aktivieren.');
   state.alarms.unshift({id:C.uid(),price,direction:values.direction,active:true,firedAt:null});commit('Alarm gespeichert. Die App muss für Alarme offen bleiben.');render();
  }
 }catch(err){toast(err.message);}
});
main.addEventListener('click',e=>{
 const b=e.target.closest('[data-act]');if(!b)return;
 const act=b.dataset.act;
 if(act==='refresh')refresh();
 if(act==='toggle-alarm'){const a=state.alarms.find(a=>a.id===b.dataset.id);if(a){a.active=!a.active;a.firedAt=null;save();render();}}
 if(act==='archive-signal'){
  if(confirm('Signal aus der Ansicht entfernen? Vorher kannst du unter „Mehr“ eine Sicherung speichern.')){
   state.signals=state.signals.filter(s=>s.id!==b.dataset.id);save();render();
  }
 }
 if(act==='save-calc'&&calc){
  if(state.signals.length>=200){toast('200 Einträge erreicht. Bitte alte Einträge sichern und archivieren.');return;}
  state.signals.unshift({...calc,id:C.uid(),source:'Rechner',reason:'Eigene Berechnung · kein neues Handelssignal',quality:'',raw:'',importedAt:Date.now()});commit('Berechnung gespeichert.');calc=null;render();
 }
 if(act==='export'){
  const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BTC-Wache-Sicherung-'+C.dubai().day+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Sicherung enthält private Daten. Bitte an einem eigenen Ort aufbewahren.');
 }
});
main.addEventListener('change',async e=>{
 if(e.target.id==='jump-setting'){state.settings.jumps=e.target.checked;save();}
 if(e.target.id==='sound-setting'){
  state.settings.sound=e.target.checked;
  if(e.target.checked){try{const A=window.AudioContext||window.webkitAudioContext;audio=audio||new A();await audio.resume();beep();}catch(err){toast('Der Browser erlaubt hier keinen Ton. Sichtbare Alarme bleiben aktiv.');}}
  save();
 }
 if(e.target.id==='import-backup'&&e.target.files[0]){
  const file=e.target.files[0];
  try{
   if(file.size>2000000)throw Error('Sicherungsdatei ist zu groß (maximal 2 MB).');
   const next=C.validateBackup(JSON.parse(await file.text()));
   if(!confirm('Diese Sicherung ersetzt die lokalen Einträge. Vorher bei Bedarf die aktuelle Sicherung exportieren. Fortfahren?'))return;
   state=next;storageBroken=false;storageMessage='';onlineOK=false;commit('Sicherung auf diesem Handy geladen. Keine Daten an die Wache übertragen.');render();
  }catch(err){toast('Sicherung nicht geladen: '+err.message);}
 }
});
window.addEventListener('hashchange',navigate);
window.addEventListener('online',()=>{refresh();startPriceStream();});
window.addEventListener('offline',()=>{stopPriceStream();onlineOK=false;error='Offline. Keine neuen lokalen Alarme.';if(tab==='market')render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){onlineOK=false;refresh();startPriceStream();}else stopPriceStream();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installing=e;document.getElementById('install').hidden=false;});
document.getElementById('install').addEventListener('click',async()=>{if(installing){await installing.prompt();await installing.userChoice;installing=null;document.getElementById('install').hidden=true;}});
if(location.protocol!=='file:'&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{toast('Offline-Start konnte noch nicht eingerichtet werden. Rechner und Journal bleiben nutzbar.');});
navigate();refresh();startPriceStream();
setInterval(()=>{if(!document.hidden)refresh();},15000);
function stopPriceStream(){clearTimeout(priceRetry);priceRetry=null;pendingPrice=null;lastStreamAt=0;if(priceSocket){priceSocket.onclose=null;priceSocket.close();priceSocket=null;}}
function startPriceStream(){
 if(document.hidden||navigator.onLine===false||priceSocket)return;
 clearTimeout(priceRetry);
 const socket=new WebSocket('wss://fstream.binance.com/market/ws/btcusdt@aggTrade');priceSocket=socket;priceOpenedAt=Date.now();
 socket.onmessage=e=>{try{const d=JSON.parse(e.data),price=Number(d.p),age=Date.now()-Number(d.E);if(d.e==='aggTrade'&&d.s==='BTCUSDT'&&price>0&&price<1e9&&age>=-10000&&age<10000)pendingPrice={price,at:Date.now()};}catch(_){}};
 socket.onerror=()=>socket.close();socket.onclose=()=>{if(priceSocket===socket){priceSocket=null;lastStreamAt=0;priceRetry=setTimeout(startPriceStream,3000);}};
}
setInterval(()=>{
 if(document.hidden)return;
 if(priceSocket&&Date.now()-Math.max(lastStreamAt,priceOpenedAt)>12000)priceSocket.close();
 const live=pendingPrice;pendingPrice=null;
 if(live&&Date.now()-live.at<3000){
  state.market=state.market||{rows:[],changes:{},rsi:null};state.market.price=live.price;state.market.at=live.at;lastStreamAt=live.at;onlineOK=true;error='';
  const fired=C.fireAlarms(state,live.price,Date.now(),true,state.market.changes||{});
  if(fired.length){save();toast(fired.map(e=>e.title+': '+e.text).join(' · '));beep();}
  if(Date.now()-lastPriceSave>=15000){save();lastPriceSave=Date.now();}
 }
 if(tab!=='market')return;
 const p=main.querySelector('[data-live-price]'),s=main.querySelector('[data-live-stamp]'),b=main.querySelector('.hero .badge');
 if(p&&state.market)p.textContent=F(state.market.price);
 const streaming=onlineOK&&Date.now()-lastStreamAt<5000;
 if(s&&streaming)s.textContent='Live · 0,5-Sekunden-Takt · '+new Date(state.market.at).toLocaleTimeString('de-DE',{timeZone:'Asia/Dubai',hour12:false})+' Dubai';
 else if(s&&state.market)s.textContent=(onlineOK&&Date.now()-state.market.at<45000?'Live-Verbindung unterbrochen · letzter Kurs ':'Gespeicherter Stand · ')+stamp(state.market.at);
 if(b){const fresh=streaming||onlineOK&&state.market&&Date.now()-state.market.at<45000;b.className='badge '+(fresh?'live':'stale');b.innerHTML='<i class="dot"></i>'+(streaming?'LIVE · 0,5 S':fresh?'LETZTER ABRUF':'GESPEICHERTER STAND');}
},500);
})();
