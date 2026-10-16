/* BTC-Wache Mobil — lokale Daten und Berechnungen. Keine Broker-Verbindung. */
(function (root) {
'use strict';
const KEY = 'btc-wache-mobil:v1';
const finite = x => typeof x === 'number' && Number.isFinite(x);
function number(value) {
  if (typeof value === 'number') return finite(value) ? value : null;
  let s = String(value == null ? '' : value).trim().replace(/[\s$€]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return finite(n) ? n : null;
}
function priceNumber(s) {
  s = String(s).replace(/[\s$]/g, '');
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) return number(s.replace(/\./g, ''));
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return number(s.replace(/,/g, ''));
  return number(s);
}
function empty() {
  return {version:1, balance:null, signals:[], trades:[], alarms:[], events:[], market:null,
    settings:{sound:false, jumps:true}, jumpAt:0, jumpDay:'', jumpCount:0};
}
function round(x, n=8) { return Math.round((x + Number.EPSILON) * 10**n) / 10**n; }
function quantity(entry, stop, balance) {
  entry=number(entry); stop=number(stop); balance=number(balance);
  if (!(entry>0 && stop>0 && balance>0 && entry!==stop)) return null;
  const loss = Math.abs(entry-stop) + 14.1, step=.01, min=.01;
  let q = Math.floor(balance*.25/loss/step+1e-9)*step;
  const affordable = Math.floor(balance*1000/entry/step+1e-9)*step;
  q = Math.min(q,affordable);
  const forced = q < min-1e-12;
  q = round(Math.max(q,min));
  return {q, percent:q*loss/balance*100, forced, affordable:affordable>=min-1e-12};
}
function trail(side, entry, stop, target) {
  const sign=side==='LONG'?1:-1, risk=Math.abs(entry-stop);
  if (!(risk>0)) return null;
  const from=entry+sign*.5*risk, to=entry+sign*(.25*risk+14.1);
  if(sign*(from-to)<=0 || !(target>0) || sign*(target-from)<=0) return null;
  return {from,to};
}
function parseSignal(raw) {
  const text=String(raw).slice(0,12000).replace(/\*/g,'');
  if(!/\b(?:BTC(?:USDT)?|Bitcoin)\b/i.test(text)) throw Error('Bitte ein BTC-Signal einfügen. Andere Märkte werden nicht unterstützt.');
  const side=(text.match(/\bJETZT\s+(LONG|SHORT)\b/i)||text.match(/\b(LONG|SHORT)\b/i)||[])[1];
  const read=re => { const m=text.match(re); return m?priceNumber(m[1]):null; };
  const entry=read(/Einstieg[^\n]*?(?:Kurs\s+|:\s*)([\d.,]+)/i);
  const stop=read(/(?:^|\n)\s*Stop\s*:\s*([\d.,]+)/i);
  const t1=read(/Ziel\s*1\s*:\s*([\d.,]+)/i), t2=read(/Ziel\s*2\s*:\s*([\d.,]+)/i);
  const quality=(text.match(/Qualität\s*:\s*([^\n]+)/i)||[])[1]||'';
  const reason=(text.match(/Grund\s*:\s*([^\n]+)/i)||[])[1]||'Übernommenes WhatsApp-Signal';
  if(!side || !(entry>0 && stop>0)) throw Error('Bitte ein vollständiges BTC-Signal mit LONG/SHORT, Einstieg und Stop einfügen.');
  validateSetup(side.toUpperCase(),entry,stop,t1,t2);
  return {side:side.toUpperCase(),entry,stop,t1,t2,quality:quality.slice(0,200),reason:reason.slice(0,300),
    raw:text, importedAt:Date.now(), id:uid(), source:'WhatsApp', note:'Zeitpunkt ist die Übernahme, nicht die Signalzeit.'};
}
function validateSetup(side,entry,stop,t1,t2) {
  if(!['LONG','SHORT'].includes(side) || !(entry>0 && stop>0) || !finite(entry) || !finite(stop)) throw Error('Einstieg und Stop müssen positive Zahlen sein.');
  const sign=side==='LONG'?1:-1;
  if(sign*(entry-stop)<=0) throw Error(side==='LONG'?'Bei LONG muss der Stop unter dem Einstieg liegen.':'Bei SHORT muss der Stop über dem Einstieg liegen.');
  for (const t of [t1,t2]) if(t!=null && (!finite(t) || t<=0 || sign*(t-entry)<=0)) throw Error('Die Ziele müssen in Trade-Richtung hinter dem Einstieg liegen.');
  if(t1!=null&&t2!=null&&sign*(t2-t1)<0) throw Error('Ziel 2 darf nicht näher liegen als Ziel 1.');
}
function uid() { return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10); }
function dubai(now=Date.now()) {
  const d=new Date(now+4*3600000);
  return {day:d.toISOString().slice(0,10),hour:d.getUTCHours(),weekend:[0,6].includes(d.getUTCDay())};
}
function watchStatus(now=Date.now()) {
  const d=dubai(now);
  if(d.hour>=21||d.hour<5) return {label:'Nachtruhe',text:'21–05 Uhr Dubai · keine neuen lokalen Sprungalarme.'};
  if(d.weekend) return {label:'Wochenende',text:'Nur Kurssprünge · keine neuen LONG-/SHORT-Signale der WhatsApp-Wache.'};
  return {label:'Wachzeit',text:'05–21 Uhr Dubai · bestehende WhatsApp-Wache läuft separat.'};
}
function rsi(values,n=14) {
  if(values.length<=n)return null;
  let ag=0,al=0;
  for(let i=1;i<=n;i++){const delta=values[i]-values[i-1];ag+=Math.max(delta,0)/n;al+=Math.max(-delta,0)/n;}
  for(let i=n+1;i<values.length;i++){const delta=values[i]-values[i-1];ag=(ag*(n-1)+Math.max(delta,0))/n;al=(al*(n-1)+Math.max(-delta,0))/n;}
  return al===0?100:100-100/(1+ag/al);
}
function candleData(raw,step,now=Date.now()) {
  if(!Array.isArray(raw)||raw.length<2)throw Error('Keine gültigen Kursdaten.');
  const rows=raw.map(k=>({t:Number(k[0]),o:Number(k[1]),h:Number(k[2]),l:Number(k[3]),c:Number(k[4]),v:Number(k[5]),end:Number(k[6])}));
  for(let i=0;i<rows.length;i++){
    const k=rows[i];
    if(![k.t,k.o,k.h,k.l,k.c,k.v,k.end].every(finite)||k.c<=0||k.o<=0||k.l<=0||k.h<Math.max(k.l,k.o,k.c)||k.l>Math.min(k.o,k.c)||k.v<0||k.end<k.t||k.end-k.t>=step|| (i&&k.t-rows[i-1].t!==step))throw Error('Kursdaten sind lückenhaft oder ungültig.');
  }
  const closed=rows.filter(k=>k.end<now);
  if(!closed.length || now-closed[closed.length-1].end>step+30000 || rows[rows.length-1].t>now+30000)throw Error('Kursdaten sind veraltet. Keine neuen Alarme.');
  return {rows,closed,last:rows[rows.length-1].c,time:Math.min(now,rows[rows.length-1].end)};
}
function jumpChanges(closed) {
  const last=closed[closed.length-1];
  const change=n=>{
    const prev=closed[closed.length-1-n];
    return prev && last.t-prev.t===n*60000 ? (last.c/prev.c-1)*100 : null;
  };
  return {five:change(5),fifteen:change(15)};
}
function fireAlarms(state,price,now=Date.now(),allowJumps=false,changes={}) {
  const fired=[];
  for(const a of state.alarms) if(a.active&&((a.direction==='above'&&price>=a.price)||(a.direction==='below'&&price<=a.price))){
    a.active=false;a.firedAt=now;
    fired.push({id:uid(),at:now,type:'price',title:a.direction==='above'?'Kursziel nach oben erreicht':'Kursziel nach unten erreicht',text:format(a.price)+' $ · beobachtet '+format(price)+' $'});
  }
  const d=dubai(now);
  if(state.jumpDay!==d.day){state.jumpDay=d.day;state.jumpCount=0;}
  if(allowJumps && state.settings.jumps && d.hour>=5&&d.hour<21 && now-state.jumpAt>=1800000 && state.jumpCount<6){
    const n=Math.abs(changes.five||0)>=.7?5:Math.abs(changes.fifteen||0)>=1?15:null;
    if(n){const c=n===5?changes.five:changes.fifteen;
      fired.push({id:uid(),at:now,type:'jump',title:c>0?'BTC springt nach oben':'BTC fällt schnell',text:(c>0?'+':'')+format(c,2)+' % in '+n+' Minuten · '+format(price)+' $'});
      state.jumpAt=now;state.jumpCount++;
    }
  }
  state.events=[...fired,...state.events].slice(0,50);
  return fired;
}
function format(n,d=2) { return finite(n)?n.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'; }
function esc(v) { return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function validateBackup(data) {
  if(!data||data.version!==1||!Array.isArray(data.signals)||!Array.isArray(data.trades)||!Array.isArray(data.alarms)||!Array.isArray(data.events))throw Error('Diese Datei ist keine BTC-Wache-Sicherung (Version 1).');
  const out=empty();
  out.balance=number(data.balance);
  if(out.balance!=null && !(out.balance>0&&out.balance<1e12))throw Error('Ungültiger Kontostand.');
  const str=(v,n=400)=>String(v==null?'':v).slice(0,n);
  const stamp=v=>finite(v)&&v>0&&v<Date.now()+86400000?v:Date.now();
  if(data.signals.length>200||data.trades.length>2000||data.alarms.length>50||data.events.length>50)throw Error('Die Sicherung enthält zu viele Einträge.');
  out.signals=data.signals.map(s=>{
    if(!s||typeof s!=='object')throw Error('Ungültiges Signal.');
    validateSetup(s.side,s.entry,s.stop,s.t1,s.t2);
    return {id:str(s.id,100)||uid(),side:s.side,entry:s.entry,stop:s.stop,t1:s.t1??null,t2:s.t2??null,quality:str(s.quality,200),reason:str(s.reason,300),raw:str(s.raw,12000),source:str(s.source,40),importedAt:stamp(s.importedAt)};
  });
  out.trades=data.trades.map(t=>{
    if(!t||!['LONG','SHORT'].includes(t.side)||!finite(t.pnl)||Math.abs(t.pnl)>1e12||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||Number.isNaN(Date.parse(t.date+'T12:00:00Z')))throw Error('Ungültiger Journal-Eintrag.');
    return {id:str(t.id,100)||uid(),date:t.date,side:t.side,pnl:t.pnl,note:str(t.note,500)};
  });
  out.alarms=data.alarms.map(a=>{
    if(!a||!['above','below'].includes(a.direction)||!finite(a.price)||a.price<=0||a.price>1e9)throw Error('Ungültiger Kursalarm.');
    return {id:str(a.id,100)||uid(),direction:a.direction,price:a.price,active:a.active===true,firedAt:finite(a.firedAt)?a.firedAt:null};
  });
  out.events=data.events.map(e=>({id:str(e.id,100)||uid(),at:stamp(e.at),type:str(e.type,20),title:str(e.title,100),text:str(e.text,400)}));
  out.settings={sound:data.settings?.sound===true,jumps:data.settings?.jumps!==false};
  out.jumpAt=finite(data.jumpAt)?Math.min(data.jumpAt,Date.now()):0;
  out.jumpDay=str(data.jumpDay,10);out.jumpCount=finite(data.jumpCount)?Math.min(6,Math.max(0,data.jumpCount)):0;
  const m=data.market;
  if(m && finite(m.price)&&m.price>0 && finite(m.at) && m.at>0 && Array.isArray(m.rows)&&m.rows.length<=200 && m.rows.every(r=>r&&[r.t,r.c].every(finite)&&r.c>0)){
    out.market={price:m.price,at:m.at,rows:m.rows.map(r=>({t:r.t,c:r.c})),rsi:finite(m.rsi)?m.rsi:null,changes:{five:finite(m.changes?.five)?m.changes.five:null,fifteen:finite(m.changes?.fifteen)?m.changes.fifteen:null}};
  }
  return out;
}
const api={KEY,number,priceNumber,empty,quantity,trail,parseSignal,validateSetup,uid,dubai,watchStatus,rsi,candleData,jumpChanges,fireAlarms,format,esc,validateBackup};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.BTC=api;
})(typeof globalThis!=='undefined'?globalThis:this);
