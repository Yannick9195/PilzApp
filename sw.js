const C='pilzwissen-v15',D='pilzwissen-daten-1';   // D: letzter Datenstand der Pilzkarte (legt heat.js an)
/* Baumarten-Kacheln des DLR (Karte von 2022, ändert sich nicht): einmal geladen bleiben sie auf dem Gerät –
   beim nächsten Mal sofort da, ohne erneuten Download. Eigener Speicher, der Versionswechsel überlebt; höchstens TMAX Kacheln. */
const T='pilzwissen-baumarten-1',TMAX=1200;let tPut=0;
const trimT=c=>c.keys().then(k=>Promise.all(k.slice(0,Math.max(0,k.length-TMAX)).map(r=>c.delete(r))));
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./data/vocab.js','./data/species.js','./data/genera.js','./data/questions.js','./data/photos.js','./data/syndromes.js','./heat.js','./lib/leaflet.js','./lib/leaflet.css','./icon.svg','./manifest.webmanifest'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==T&&x!==D).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
 if(u.origin===location.origin){
  /* Netz zuerst – kommt nach 3 s keine Antwort (Funkloch, schwacher Empfang), die gespeicherte Fassung nehmen; das Netz aktualisiert im Hintergrund weiter */
  const req=e.request;let put=Promise.resolve();
  const net=fetch(req).then(r=>{if(r.ok){const cp=r.clone();put=caches.open(C).then(c=>c.put(req,cp)).catch(()=>{})}return r});
  e.waitUntil(net.then(()=>put,()=>{}));
  e.respondWith(new Promise(res=>{let fin=false;const take=r=>{if(r&&!fin){fin=true;res(r)}};
   const t=setTimeout(()=>caches.match(req).then(take),3000);
   net.then(r=>{clearTimeout(t);take(r)},()=>{clearTimeout(t);caches.match(req).then(m=>{take(m);take(Response.error())})})}))}
 else if(u.host==='geoservice.dlr.de'&&/request=getmap/i.test(u.search)){e.respondWith(caches.open(T).then(c=>c.match(e.request).then(m=>m||fetch(e.request).then(r=>{
   if(r.ok&&/^image\//.test(r.headers.get('content-type')||''))c.put(e.request,r.clone()).then(()=>{if(++tPut%50===0)return trimT(c)}).catch(()=>{});return r}))))}
 else if(/fonts\.(googleapis|gstatic)\.com/.test(u.host)){e.respondWith(caches.match(e.request).then(m=>m||fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r})))}});
