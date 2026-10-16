(function(g){
'use strict';
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('btc-wache-signale-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('events',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function valid(e){return e&&typeof e.id==='string'&&e.id.length<150&&typeof e.text==='string'&&e.text.length<=12000&&typeof e.title==='string'&&e.title.length<200&&Number.isFinite(e.createdAt)&&Number.isFinite(e.expiresAt)&&['entry','stop','jump','info','test'].includes(e.type);}
async function merge(events){
 const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction('events','readwrite'),s=t.objectStore('events');for(const e of events)if(valid(e))s.put({id:e.id,title:e.title,text:e.text,type:e.type,createdAt:e.createdAt,expiresAt:e.expiresAt});const all=s.getAll();all.onsuccess=()=>{const rows=all.result.sort((a,b)=>b.createdAt-a.createdAt);for(const e of rows.slice(200))s.delete(e.id);};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}finally{db.close();}
}
async function list(){const db=await open();try{return await new Promise((resolve,reject)=>{const r=db.transaction('events').objectStore('events').getAll();r.onsuccess=()=>resolve(r.result.filter(valid).sort((a,b)=>b.createdAt-a.createdAt));r.onerror=()=>reject(r.error);});}finally{db.close();}}
g.BTCSignalStore={merge,list,valid};
})(globalThis);
