/* Pilzkarte – Heatmap „Wo wächst gerade was?“
   Daten: tägliche Wetterebenen (DWD) und einmalige Standortebenen (Baumarten DLR, Boden-pH SoilGrids),
   erzeugt von tools/heat_daily.py und tools/heat_static.py (GitHub Actions). */
(()=>{'use strict';
const RAW='https://raw.githubusercontent.com/Yannick9195/PilzApp/';
const URLS=Object.assign({daily:RAW+'heat-daily/',stat:RAW+'heat-static/'},window.HEAT_URLS||{});
const SITE='https://yannick9195.github.io/PilzApp/';
/* Stellschrauben des Modells – hier lassen sich die Schwellen anpassen */
const CFG={
  peff:[4,28],      // wirksamer Niederschlag in mm: ab hier > 0 … ab hier voll
  sm:[35,80],       // Bodenfeuchte in % nFK: ab hier > 0 … ab hier voll
  wRain:.65,        // Gewicht Niederschlag gegenüber Bodenfeuchte
  hFull:.30,        // Flächenanteil passender Bäume in der Zelle, ab dem der Standort voll zählt
  phSauer:[5.0,6.5],// für Säurezeiger: bis hier optimal … ab hier ungünstig
  phKalk:[6.3,4.8], // für Kalkzeiger: ab hier optimal … bis hier ungünstig
  phMin:.35,        // schlechtester pH-Faktor (SoilGrids ist grob, deshalb nie 0)
  temp:{fr:[1,6,15,22],so:[7,13,22,27],he:[1,7,16,22],wi:[-6,-1,8,14],ganz:[-3,3,20,26],allg:[1,6,18,24]},
  frost:[-1,.5,-4,.2] // kältester Tagesmittelwert der letzten 5 Tage: unter -1 °C ×0,5, unter -4 °C ×0,2
};
const TREE=['kiefer','fichte','douglasie','laerche','tanne','buche','eiche','birke','erle','sonst'];
const TREEDE={kiefer:'Kiefer',fichte:'Fichte',douglasie:'Douglasie',laerche:'Lärche',tanne:'Tanne',buche:'Buche',eiche:'Eiche',birke:'Birke',erle:'Erle',sonst:'sonstige Bäume',verlust:'Kahl-/Schadfläche'};
const CONIF=[0,1,2,3,4],DECID=[5,6,7,8,9];
const OPEN=new Set(['wiese','mager','park','weg','heide','sand','salz','acker','stadt','kompost']);
const R=6378137,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=x=>x<0?0:x>1?1:x,ss=(x,a,b)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const trap=(t,w)=>t<=w[0]||t>=w[3]?0:t<w[1]?(t-w[0])/(w[1]-w[0]):t<=w[2]?1:(w[3]-t)/(w[3]-w[2]);
const num=(x,d=0)=>x.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const dDE=s=>{if(!s)return '–';const [y,m,d]=s.split('-');return `${+d}.${+m}.${y}`};
const SP=()=>window.SPECIES||[];
let DATA=null,LOADING=null,MAP=null,OVER=null,MARK=null,STATE={mode:'wetter',id:null},SCORE=null,BEST=null,LASTCELL=-1,POS=null;
/* Kartenoptionen (Hintergrund, Baumarten-Ebene, Deckkraft der Bewertung) – je Gerät gemerkt */
const OPT={base:'osm',trees:false,op:70};
try{Object.assign(OPT,JSON.parse(localStorage.getItem('pw_karte')||'{}'))}catch(e){}
const saveOpt=()=>{try{localStorage.setItem('pw_karte',JSON.stringify(OPT))}catch(e){}};
const TCOL={kiefer:'#becd46',fichte:'#50b978',douglasie:'#5f7387',laerche:'#3cb4c8',tanne:'#1e6405',buche:'#e6323c',eiche:'#f0dc00',birke:'#bea078',erle:'#fa8c3c',sonst:'#be64c8',verlust:'#000000'};
const DLR_WMS='https://geoservice.dlr.de/eoc/land/wms';
/* Baumarten-Filter: der DLR-Dienst liefert je Klasse genau eine Farbe (wie TCOL, ohne Kantenglättung).
   Die Kacheln werden deshalb selbst geladen und nicht gewählte Klassen im Browser durchsichtig gemacht. */
const TKEYS=Object.keys(TCOL),TPACK=Object.fromEntries(TKEYS.map(k=>[k,parseInt(TCOL[k].slice(1),16)]));
const tSel=()=>Array.isArray(OPT.tsel)?TKEYS.filter(k=>OPT.tsel.includes(k)):TKEYS.slice();
let TKEEP=null,TreeWMS=null;
function tFilter(){const s=tSel();TKEEP=s.length===TKEYS.length?null:new Set(s.map(k=>TPACK[k]))}
function tPaint(c){const s=c._src;if(!s)return;const x=c.getContext('2d');if(!TKEEP){x.putImageData(s,0,0);return}
  const o=x.createImageData(s.width,s.height),a=s.data,d=o.data;
  for(let i=0;i<a.length;i+=4)if(a[i+3]&&TKEEP.has(a[i]<<16|a[i+1]<<8|a[i+2])){d[i]=a[i];d[i+1]=a[i+1];d[i+2]=a[i+2];d[i+3]=a[i+3]}
  x.putImageData(o,0,0)}
const TCACHE=new Map();   // Kachel-URL → PNG (die zuletzt benutzten ~400 Kacheln, wenige MB)
function tGet(u,o){const b=TCACHE.get(u);if(b){TCACHE.delete(u);TCACHE.set(u,b);return Promise.resolve(b)}
  return fetch(u,o).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.blob()}).then(b=>{TCACHE.set(u,b);if(TCACHE.size>400)TCACHE.delete(TCACHE.keys().next().value);return b})}
function decodeImg(b){if(window.createImageBitmap)return createImageBitmap(b);
  return new Promise((res,rej)=>{const u=URL.createObjectURL(b),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('Bild nicht lesbar'))};i.src=u})}
function treeLayer(opts){
  if(!TreeWMS)TreeWMS=L.TileLayer.WMS.extend({createTile(coords,done){
    const c=document.createElement('canvas'),sz=this.getTileSize(),ac=window.AbortController?new AbortController():null;c.width=sz.x;c.height=sz.y;c._ac=ac;c.complete=false;
    tGet(this.getTileUrl(coords),ac?{signal:ac.signal}:{}).then(decodeImg).then(img=>{
      const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=false;x.drawImage(img,0,0,c.width,c.height);if(img.close)img.close();
      try{c._src=x.getImageData(0,0,c.width,c.height);tPaint(c)}catch(e){}
      c.complete=true;done(null,c)}).catch(e=>{c.complete=true;if(!(e&&e.name==='AbortError'))done(e,c)});
    return c}});
  const l=new TreeWMS(DLR_WMS,opts);l.on('tileunload tileabort',e=>{const t=e.tile;if(t){if(t._ac)t._ac.abort();t._src=null}});return l}
function tRepaint(l){for(const k in l._tiles){const t=l._tiles[k];if(t&&t.el)tPaint(t.el)}}
/* Bewertung nur für die gewählten Baumarten – gilt, solange die Baumarten-Ebene eingeschaltet ist und nicht alle Arten gewählt sind.
   SMASK[j] = 1/0 je Klasse aus TREE; Kahl-/Schadfläche ist keine Baumart und zählt für die Bewertung nicht. */
let SMASK=null,UPT=0;
function sFilter(){const ts=tSel(),on=!!OPT.trees&&TREE.some(t=>!ts.includes(t)),k=on?TREE.map(t=>ts.includes(t)?1:0).join(''):'';
  if(k===(SMASK?SMASK.key:''))return false;SMASK=on?Object.assign(Float32Array.from(k,Number),{key:k}):null;return true}
function reUpdate(root){clearTimeout(UPT);UPT=setTimeout(()=>{if(root.isConnected)update(root)},120)}

/* ---------- Daten laden ---------- */
/* Ohne Netz oder bei sehr schlechtem Empfang: zuletzt vollständig geladener Stand aus dem Gerätespeicher.
   Bild und Metadaten liegen zusammen in EINEM Eintrag – so passen sie immer zueinander. */
const DCACHE='pilzwissen-daten-1';
async function dCache(){try{return window.caches?await caches.open(DCACHE):null}catch(e){return null}}
function tFetch(u,ms){if(!ms||!window.AbortController)return fetch(u,{cache:'no-cache'});const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
  return fetch(u,{cache:'no-cache',signal:ac.signal}).finally(()=>clearTimeout(t))}
/* lazy=true (Standortdaten, ändern sich kaum): gespeicherten Stand sofort nehmen und im Hintergrund auffrischen */
async function getData(base,name,lazy){
  const c=await dCache(),key=base+name+'.png';let old=null;try{old=c?await c.match(key):null}catch(e){}
  const fresh=async(slow)=>{
    const rj=await tFetch(base+name+'.json',slow?0:4000);if(!rj.ok)throw new Error('HTTP '+rj.status);const meta=await rj.json();
    const rp=await tFetch(key+'?v='+encodeURIComponent(meta.generated||meta.date||''),slow?0:15000);if(!rp.ok)throw new Error('HTTP '+rp.status);const blob=await rp.blob();
    if(c)try{await c.put(key,new Response(blob,{headers:{'Content-Type':'image/png','X-Meta':encodeURIComponent(JSON.stringify(meta))}}))}catch(e){}
    return {meta,blob,cached:false}};
  const stored=async()=>({meta:JSON.parse(decodeURIComponent(old.headers.get('X-Meta'))),blob:await old.blob(),cached:true});
  if(!old)return fresh(true);
  if(lazy){fresh(true).catch(()=>{});return stored()}
  try{return await fresh(false)}catch(e){return stored()}
}
async function mosaic(base,name,lazy){
  const {meta,blob,cached}=await getData(base,name,lazy);
  let bm;try{bm=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'})}catch(e){bm=await createImageBitmap(blob)}
  const c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bm,0,0);
  const {W,H}=meta.grid,L={};
  if(bm.width!==meta.cols*W||bm.height!==Math.ceil(meta.layers.length/meta.cols)*H){if(bm.close)bm.close();throw new Error('Daten passen nicht zusammen')}
  meta.layers.forEach((l,i)=>{const col=i%meta.cols,row=(i/meta.cols)|0;const px=x.getImageData(col*W,row*H,W,H).data;const a=new Uint8Array(W*H);for(let k=0;k<a.length;k++)a[k]=px[k*4];L[l.id]=a});
  if(bm.close)bm.close();
  return {meta,L,cached};
}
function load(){
  if(DATA)return Promise.resolve(DATA);
  if(!LOADING)LOADING=(async()=>{
    const [d,s0]=await Promise.all([mosaic(URLS.daily,'daily'),mosaic(URLS.stat,'static',true).catch(()=>null)]);
    let s=s0;if(s&&(s.meta.grid.W!==d.meta.grid.W||s.meta.grid.H!==d.meta.grid.H))s=null;
    DATA={d,s,g:d.meta.grid,date:new Date(d.meta.date+'T12:00:00'),t:Date.now(),offline:d.cached};return DATA;
  })().catch(e=>{LOADING=null;throw e});
  return LOADING;
}

/* ---------- Modell ---------- */
const tags=(s,c)=>((s.tr&&s.tr[c])||[]).map(t=>t[0]==='~'?[t.slice(1),.5]:[t,1]);
const MODEL=new Map();
function model(s){
  let m=MODEL.get(s.id);if(m)return m;
  const a=new Float32Array(10);const up=(i,w)=>{if(w>a[i])a[i]=w};
  const pa=tags(s,'pa'),hb=tags(s,'hb');
  for(const [t,w] of pa){const i=TREE.indexOf(t);
    if(i>=0)up(i,w);else if(t==='nadel')CONIF.forEach(j=>up(j,w));else if(t==='laub')DECID.forEach(j=>up(j,w));
    else up(9,w*.6)}                       // Hainbuche, Linde, Pappel, Hasel … stecken in der Sammelklasse
  if(!pa.length){
    for(const [t,w] of hb){
      if(t==='laubw')DECID.forEach(j=>up(j,w));else if(t==='nadelw')CONIF.forEach(j=>up(j,w));
      else if(t==='mischw'){for(let j=0;j<10;j++)up(j,w*.8)}
      else if(t==='au'){up(8,w);up(9,w*.6)}else if(t==='moor'){up(7,w*.6);up(0,w*.5);up(8,w*.5)}
      else if(t==='gebirge'){up(1,w*.7);up(4,w*.7);up(3,w*.7);up(5,w*.5)}}
    for(const [t,w] of tags(s,'su')){if(t==='laubh')DECID.forEach(j=>up(j,w*.9));if(t==='nadelh'||t==='zapfen')CONIF.forEach(j=>up(j,w*.9))}
  }
  let open=0;for(const [t,w] of hb)if(OPEN.has(t))open=Math.max(open,w);
  const forest=a.some(v=>v>0);let vague=false;
  if(!forest&&!open){vague=true;open=.5;for(let j=0;j<10;j++)a[j]=.5}
  const b=Object.fromEntries(tags(s,'bo'));
  const ph=b.sauer&&!b.kalk?{t:'sauer',w:b.sauer}:b.kalk&&!b.sauer?{t:'kalk',w:b.kalk}:null;
  const sz=tags(s,'sz');const win=sz.length?sz.map(([t,w])=>[CFG.temp[t]||CFG.temp.allg,w>=1?1:.8]):[[CFG.temp.allg,1]];
  const hardy=sz.some(([t,w])=>(t==='wi'||t==='ganz')&&w>=1);
  m={a,open:forest?open*.35:open,forest,vague,ph,win,hardy,mo:s.mo||'222222222222'};MODEL.set(s.id,m);return m;
}
function season(mo,date){const v=i=>({0:0,1:.6,2:1})[mo[(i+12)%12]]||0;const m=date.getMonth(),d=date.getDate();
  return d>=15?v(m)+(v(m+1)-v(m))*(d-15)/30:v(m-1)+(v(m)-v(m-1))*(d+15)/30}
/* Frost: Tagestiefstwerte der Luft in 2 m Höhe (HYRAS-DE-TASMIN); Ebenen fehlen in älteren Datenständen */
const fr=(l,i)=>!l||l[i]===255?null:l[i]/4-30;
const cap=t=>t[0].toUpperCase()+t.slice(1);
const frostName=t=>t>=0?null:t>-4?'leichter Frost':t>-10?'mäßiger Frost':t>-15?'strenger Frost':'sehr strenger Frost';   // Einteilung des DWD
/* Einordnung der Zellenwerte (Grenzen siehe Erklärtext unter der Karte) */
const peffClass=v=>v<4?'sehr trocken':v<10?'trocken':v<18?'mäßig feucht':v<30?'feucht':v<50?'sehr feucht':'nass';
const smClass=v=>v<20?'sehr trocken':v<30?'trocken':v<50?'mäßig trocken':v<=80?'feucht':v<=100?'sehr feucht':'nass';
const phClass=v=>v<4?'sehr stark sauer':v<4.7?'stark sauer':v<5.4?'mäßig sauer':v<6.1?'schwach sauer':v<6.8?'sehr schwach sauer':v<7.2?'neutral':v<7.9?'sehr schwach alkalisch':v<8.6?'schwach alkalisch':'alkalisch';
/* Rohwerte einer Zelle */
function cell(i){const {d,s}=DATA,L=d.L;if(L.peff[i]===255)return null;
  const o={peff:L.peff[i]/2,recent:L.recent[i]===255?null:L.recent[i]/2,t15:L.t15[i]===255?null:L.t15[i]/4-20,tmin:L.tmin5[i]===255?null:L.tmin5[i]/4-20,sm:L.sm[i]===255?null:L.sm[i]/2,fmin:fr(L.fmin5,i),fseas:fr(L.fseas,i),tr:null,ph:null,forest:null,loss:0};
  if(s&&s.L.kiefer[i]!==255){o.tr=TREE.map(t=>s.L[t][i]/250);o.loss=s.L.verlust?s.L.verlust[i]/250:0;o.forest=o.tr.reduce((x,y)=>x+y,0);o.ph=s.L.ph[i]===255?null:s.L.ph[i]/40+3;
    if(SMASK){o.trAll=o.tr;o.forestAll=o.forest;o.tr=o.tr.map((v,j)=>v*SMASK[j]);o.forest=o.tr.reduce((x,y)=>x+y,0);o.flt=true}}
  return o}
const fWet=c=>{const fp=ss(c.peff,CFG.peff[0],CFG.peff[1]);return c.sm==null?fp:CFG.wRain*fp+(1-CFG.wRain)*ss(c.sm,CFG.sm[0],CFG.sm[1])};
const fFrost=(c,hardy)=>hardy||c.tmin==null?1:c.tmin<CFG.frost[2]?CFG.frost[3]:c.tmin<CFG.frost[0]?CFG.frost[1]:1;
function fTemp(c,m){if(c.t15==null)return 1;let f=0;for(const [w,k] of m.win){const v=trap(c.t15,w)*k;if(v>f)f=v}return f*fFrost(c,m.hardy)}
function fSite(c,m){if(!c.tr)return 1;let h=0;for(let j=0;j<10;j++)h+=m.a[j]*c.tr[j];
  const hf=Math.min(1,Math.sqrt(h/CFG.hFull)),ho=c.flt?0:m.open*Math.max(0,1-c.forest-c.loss);return Math.max(hf,ho)}
function fPh(c,m){if(!m.ph||c.ph==null)return 1;const [a,b]=m.ph.t==='sauer'?CFG.phSauer:CFG.phKalk;
  return 1-clamp((c.ph-a)/(b-a))*(1-CFG.phMin)*m.ph.w}
function factors(c,s){const m=model(s);return {saison:season(m.mo,DATA.date),standort:fSite(c,m),boden:fPh(c,m),feuchte:fWet(c),temperatur:fTemp(c,m)}}
const total=f=>100*f.saison*f.standort*f.boden*f.feuchte*f.temperatur;
function wetter(c){const t=c.t15==null?1:trap(c.t15,CFG.temp.allg)*fFrost(c,false);const h=c.tr?Math.min(1,Math.sqrt(c.forest/CFG.hFull)):1;return 100*fWet(c)*t*h}
const edible=s=>s.tr&&s.tr.sw&&s.tr.sw[0]==='e';

/* Schnelle Rasterberechnung (ohne Objekte je Zelle)
   Alle Tageswerte liegen als Byte vor (0–250, 255 = fehlt). Feuchte-, Temperatur-, Frost- und pH-Faktoren werden deshalb
   einmal je möglichem Bytewert vorausberechnet; Arten mit gleichem Modell (bei den Speisepilzen häufig) werden nur einmal gerechnet. */
let LUTS=null;
function luts(){if(LUTS)return LUTS;const fp=new Float64Array(256),fs=new Float64Array(256),ta=new Float64Array(256),fr=new Float64Array(256);
  for(let b=0;b<256;b++){fp[b]=ss(b/2,CFG.peff[0],CFG.peff[1]);fs[b]=ss(b/2,CFG.sm[0],CFG.sm[1]);const t=b/4-20;
    ta[b]=b===255?1:trap(t,CFG.temp.allg);fr[b]=b===255?1:t<CFG.frost[2]?CFG.frost[3]:t<CFG.frost[0]?CFG.frost[1]:1}
  return LUTS={fp,fs,ta,fr}}
function mLuts(m){if(m.tL)return m;const tL=new Float64Array(256),pL=new Float64Array(256);
  const pa=m.ph?(m.ph.t==='sauer'?CFG.phSauer:CFG.phKalk):null;
  for(let b=0;b<256;b++){
    if(b===255)tL[b]=1;else{const t=b/4-20;let f=0;for(const [w,q] of m.win){const v=trap(t,w)*q;if(v>f)f=v}tL[b]=f}
    pL[b]=!pa||b===255?1:1-clamp((b/40+3-pa[0])/(pa[1]-pa[0]))*(1-CFG.phMin)*m.ph.w}
  m.tL=tL;m.pL=pL;return m}
function grid(list){
  const {d,s,g}=DATA,L=d.L,N=g.W*g.H,out=new Float32Array(N).fill(-1),best=list&&list.length>1?new Int16Array(N).fill(-1):null;
  const tr=s?TREE.map(t=>s.L[t]):null,loss=s&&s.L.verlust,ph=s&&s.L.ph,mk=tr&&SMASK?SMASK:null;
  const U=luts(),fp=U.fp,fs=U.fs,ta=U.ta,fr=U.fr,wR=CFG.wRain,hF=CFG.hFull,PE=L.peff,SM=L.sm,T15=L.t15,TM=L.tmin5;
  let G=null;
  if(list){const seen=new Set();G=[];
    list.forEach((sp,k)=>{const m=mLuts(model(sp)),sea=season(m.mo,DATA.date);if(!(sea>0))return;
      const a=Float64Array.from(m.a,(v,j)=>mk?v*mk[j]:v);
      const key=a.join(',')+'|'+m.open+'|'+(m.ph?m.ph.t+m.ph.w:'')+'|'+JSON.stringify(m.win)+'|'+m.hardy+'|'+sea;
      if(seen.has(key))return;seen.add(key);G.push({a,open:m.open,tL:m.tL,pL:m.pL,hardy:m.hardy,sea,k,z:a.every(v=>v===0)&&(!!mk||!(m.open>0))})});
    G.sort((x,y)=>y.sea-x.sea||x.k-y.k);   // hohe Saisonwerte zuerst: dann lassen sich mehr Arten früh überspringen
    if(!G.length){for(let i=0;i<N;i++)if(PE[i]!==255)out[i]=0;return {out,best}}}
  const nG=G?G.length:0;
  for(let i=0;i<N;i++){
    const pb=PE[i];if(pb===255)continue;
    const sb=SM[i],wet=sb===255?fp[pb]:wR*fp[pb]+(1-wR)*fs[sb];
    const tb=T15[i],frost=fr[TM[i]],hasS=tr!==null&&tr[0][i]!==255;
    if(!G){let f=0;if(hasS){for(let j=0;j<10;j++)f+=mk?tr[j][i]*mk[j]:tr[j][i];f/=250}
      out[i]=100*wet*(tb===255?1:ta[tb]*frost)*(hasS?Math.min(1,Math.sqrt(f/hF)):1);continue}
    if(wet<=0){out[i]=0;continue}
    let openF=0;if(hasS&&!mk){let f=0;for(let j=0;j<10;j++)f+=tr[j][i];openF=1-f/250-(loss?loss[i]/250:0);if(openF<0)openF=0}
    const phb=hasS?ph[i]:255;let mx=0,bi=-1;
    for(let q=0;q<nG;q++){const o=G[q];if(hasS&&o.z)continue;   // kann hier keinen Standort haben
      const bound=100*o.sea*wet*(tb===255?1:o.tL[tb]*(o.hardy?1:frost));
      if(bound<=mx)continue;            // Standort und pH sind höchstens 1 – diese Art kann den Bestwert nicht mehr übertreffen
      let site=1;if(hasS){const a=o.a;let h=0;for(let j=0;j<10;j++)h+=a[j]*tr[j][i];site=Math.sqrt(h/250/hF);if(site>1)site=1;const so=o.open*openF;if(so>site)site=so}
      if(site<=0)continue;
      const v=bound*site*o.pL[phb];if(v>mx){mx=v;bi=o.k}}
    out[i]=mx;if(best)best[i]=bi}
  return {out,best};
}

/* ---------- Darstellung ---------- */
const STOPS=[[3,215,48,39,.6],[10,244,109,67,.68],[20,253,174,97,.74],[32,254,224,139,.78],[45,217,239,139,.8],[58,166,217,106,.83],[70,102,189,99,.86],[85,26,152,80,.88],[100,0,104,55,.9]];
function colour(v){if(!(v>=STOPS[0][0]))return null;for(let k=1;k<STOPS.length;k++){if(v<=STOPS[k][0]){const a=STOPS[k-1],b=STOPS[k],t=(v-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t,a[4]+(b[4]-a[4])*t]}}const z=STOPS[STOPS.length-1];return [z[1],z[2],z[3],z[4]]}
let COLLUT=null,CANV=null,CanvasOverlay=null;
function colLut(){if(COLLUT)return COLLUT;const u=new Uint32Array(1001),le=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
  for(let k=0;k<=1000;k++){const c=colour(k/10),r=c?Math.round(c[0]):120,g=c?Math.round(c[1]):120,b=c?Math.round(c[2]):120,a=c?Math.round(c[3]*255):26;
    u[k]=(le?(a<<24|b<<16|g<<8|r):(r<<24|g<<16|b<<8|a))>>>0}
  return COLLUT=u}
function paint(score){const {W,H}=DATA.g;if(!CANV){CANV=document.createElement('canvas');CANV.width=W;CANV.height=H}
  const x=CANV.getContext('2d'),im=x.createImageData(W,H),p=new Uint32Array(im.data.buffer),C=colLut();
  for(let i=0;i<score.length;i++){const v=score[i];if(v<0)continue;let k=Math.floor(v*10);if(k>1000)k=1000;p[i]=C[k]}
  x.putImageData(im,0,0);return CANV}
/* Boden-pH als Karte, gefärbt wie ein Indikatorstreifen: rot sauer – gelb – grün neutral – blau basisch */
const PHSTOPS=[[4,200,16,46],[5,245,124,0],[6,251,211,52],[7,63,170,63],[8,31,99,184],[9,90,45,145]];
let PHLUT=null;
function phLut(){if(PHLUT)return PHLUT;const u=new Uint32Array(256),le=new Uint8Array(new Uint32Array([1]).buffer)[0]===1,S=PHSTOPS,A=217;
  for(let b=0;b<255;b++){const v=b/40+3;let c=v<=S[0][0]?S[0]:S[S.length-1];
    for(let k=1;k<S.length;k++)if(v>S[k-1][0]&&v<=S[k][0]){const a=S[k-1],z=S[k],t=(v-a[0])/(z[0]-a[0]);c=[v,a[1]+(z[1]-a[1])*t,a[2]+(z[2]-a[2])*t,a[3]+(z[3]-a[3])*t];break}
    const r=Math.round(c[1]),g=Math.round(c[2]),bl=Math.round(c[3]);u[b]=(le?(A<<24|bl<<16|g<<8|r):(r<<24|g<<16|bl<<8|A))>>>0}
  u[255]=0;return PHLUT=u}
function paintPh(){const {W,H}=DATA.g;if(!CANV){CANV=document.createElement('canvas');CANV.width=W;CANV.height=H}
  const x=CANV.getContext('2d'),im=x.createImageData(W,H),p=new Uint32Array(im.data.buffer),C=phLut(),ph=DATA.s.L.ph;
  for(let i=0;i<ph.length;i++)p[i]=C[ph[i]];x.putImageData(im,0,0);return CANV}
/* Leaflet-ImageOverlay, das ein Canvas statt eines Bildes zeigt */
function canvasOverlay(c,b,o){if(!CanvasOverlay)CanvasOverlay=L.ImageOverlay.extend({_initImage(){const el=this._image=this._url;
    L.DomUtil.addClass(el,'leaflet-image-layer');if(this._zoomAnimated)L.DomUtil.addClass(el,'leaflet-zoom-animated');
    if(this.options.className)L.DomUtil.addClass(el,this.options.className);el.onselectstart=L.Util.falseFn;el.onmousemove=L.Util.falseFn}});
  return new CanvasOverlay(c,b,o)}
const lon=x=>x/R*180/Math.PI,lat=y=>(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI;
const mx=l=>R*l*Math.PI/180,my=l=>R*Math.log(Math.tan(Math.PI/4+l*Math.PI/360));
function bounds(){const g=DATA.g;return [[lat(g.y1-g.H*g.cell),lon(g.x0)],[lat(g.y1),lon(g.x0+g.W*g.cell)]]}
function cellAt(la,lo){const g=DATA.g,cx=Math.floor((mx(lo)-g.x0)/g.cell),cy=Math.floor((g.y1-my(la))/g.cell);return cx<0||cy<0||cx>=g.W||cy>=g.H?-1:cy*g.W+cx}

function css(){if(document.getElementById('hm-css'))return;const s=document.createElement('style');s.id='hm-css';s.textContent=`
.hm-ctl{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.hm-ctl select,.hm-ctl input{font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);min-width:0}
.hm-ctl select{flex:0 1 auto}.hm-sw{flex:1 1 180px;position:relative;z-index:20;min-width:0}.hm-sw input{width:100%}
.hm-sug{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh);max-height:min(52vh,360px);overflow:auto;padding:4px}.hm-sug[hidden]{display:none}
.hm-sug div{padding:9px 10px;border-radius:9px;cursor:pointer;line-height:1.25}.hm-sug div.act,.hm-sug div:hover{background:var(--chip)}.hm-sug div i{display:block;font-size:.8rem;color:var(--mut)}.hm-sug p{margin:0;padding:9px 10px;color:var(--mut);font-size:.86rem}
.hm-map{height:min(64vh,620px);border-radius:var(--r);border:1px solid var(--line);overflow:hidden;background:#dfe6dc;position:relative;z-index:0}
.hm-map .hm-px{image-rendering:pixelated;image-rendering:crisp-edges}
.hm-busy[hidden]{display:none}.hm-busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.55);z-index:900;font-weight:600;color:#29241d}
.hm-lay{align-items:center;margin:8px 0 2px}.hm-lay .chip{cursor:pointer}.hm-lay .sep{width:1px;align-self:stretch;background:var(--line);margin:0 2px}
.hm-op{display:flex;align-items:center;gap:8px;font-size:.84rem;color:var(--mut);flex:1 1 170px}.hm-op input{flex:1;min-width:80px;padding:0;accent-color:var(--moss2)}
.hm-tleg{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:.8rem;margin:6px 2px}.hm-tleg[hidden]{display:none}
.hm-tk{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:.8rem;line-height:1.2;padding:4px 10px 4px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);cursor:pointer}
.hm-tk i{width:12px;height:12px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.3);flex:none}.hm-tk[aria-pressed=false]{opacity:.45}.hm-tk[aria-pressed=false] i{background:transparent!important}
.hm-tq{font:inherit;font-size:.8rem;padding:4px 6px;border:0;background:none;color:var(--moss2);text-decoration:underline;cursor:pointer}.hm-tleg small{flex-basis:100%;color:var(--mut);font-size:.76rem}
.hm-leg{display:flex;align-items:center;gap:10px;margin:10px 2px;font-size:.8rem;color:var(--mut)}.hm-leg[hidden]{display:none}.hm-leg i.ph{background:linear-gradient(90deg,#c8102e,#f57c00 20%,#fbd334 40%,#3faa3f 60%,#1f63b8 80%,#5a2d91)}
.hm-ticks{margin-top:-8px}.hm-ticks>span{visibility:hidden}.hm-ticks b{flex:1;display:flex;justify-content:space-between;font-weight:400}.hm-ticks em{font-style:normal;width:0;display:flex;justify-content:center;white-space:nowrap}.hm-ticks em:first-child{justify-content:flex-start}.hm-ticks em:last-child{justify-content:flex-end}
.hm-leg i{flex:1;height:10px;border-radius:6px;background:linear-gradient(90deg,#d73027 3%,#f46d43 10%,#fdae61 20%,#fee08b 32%,#d9ef8b 45%,#a6d96a 58%,#66bd63 70%,#1a9850 85%,#006837)}
.hm-bar{display:grid;grid-template-columns:110px 1fr 44px;gap:8px;align-items:center;font-size:.86rem;margin:5px 0}.hm-bar b{font-weight:500}.hm-bar span{height:8px;border-radius:5px;background:var(--chip);overflow:hidden;display:block}.hm-bar span i{display:block;height:100%;background:var(--moss2)}.hm-bar em{font-style:normal;text-align:right;color:var(--mut)}
.hm-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;font-size:.88rem;margin:6px 0}.hm-kv span{color:var(--mut)}
.hm-top{display:flex;flex-direction:column;gap:2px;margin:6px 0}.hm-top a{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:.9rem}.hm-top a em{font-style:normal;color:var(--mut)}
.hm-score{font-size:1.5rem;font-weight:700;color:var(--rust)}`;document.head.appendChild(s)}
function lib(){if(window.L)return Promise.resolve();return new Promise((res,rej)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='lib/leaflet.css';document.head.appendChild(l);const s=document.createElement('script');s.src='lib/leaflet.js';s.onload=res;s.onerror=()=>rej(new Error('Kartenbibliothek fehlt'));document.head.appendChild(s)})}

function title(){if(STATE.mode==='ph')return 'Boden-pH';if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);return s?s.de:'Art'}return STATE.mode==='speise'?'Speisepilze':'Pilzwetter'}
/* zuletzt berechnete Karten merken: Zurückschalten zeigt sie sofort */
const RCACHE=new Map();
const rKey=()=>[DATA.d.meta.date,DATA.s?1:0,STATE.mode,STATE.mode==='art'?STATE.id:'',SMASK?SMASK.key:''].join('|');
async function update(root){
  if(STATE.mode==='ph'&&!DATA.s)STATE={mode:'wetter',id:null};   // ohne Standortdaten keine pH-Karte
  const busy=root.querySelector('.hm-busy');
  if(STATE.mode==='ph'){SCORE=null;BEST=null;const cv=paintPh();if(!OVER)OVER=canvasOverlay(cv,bounds(),{opacity:OPT.op/100,className:'hm-px'}).addTo(MAP);if(busy)busy.hidden=true}
  else{let key=rKey(),r=RCACHE.get(key);
  if(!r){if(busy)busy.hidden=false;await new Promise(r=>setTimeout(r,30));
    key=rKey();r=RCACHE.get(key);       // Zustand kann sich in der Wartezeit geändert haben
    if(!r){if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);r=grid(s?[s]:[])}
      else if(STATE.mode==='speise'){const list=SP().filter(edible);r=grid(list);r.list=list}
      else r=grid(null);
      RCACHE.set(key,r);while(RCACHE.size>6)RCACHE.delete(RCACHE.keys().next().value)}}
  RCACHE.delete(key);RCACHE.set(key,r);
  SCORE=r.out;BEST=r.best?{idx:r.best,list:r.list}:null;
  const cv=paint(SCORE);if(!OVER)OVER=canvasOverlay(cv,bounds(),{opacity:OPT.op/100,className:'hm-px'}).addTo(MAP);
  if(busy)busy.hidden=true}
  {const ph=STATE.mode==='ph';root.querySelectorAll('.hm-leg-s').forEach(e=>e.hidden=ph);root.querySelectorAll('.hm-leg-p').forEach(e=>e.hidden=!ph)}
  const note=root.querySelector('#hm-note');
  if(note){let t='';if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);if(s){const m=model(s),sea=season(m.mo,DATA.date);
      if(sea<=0)t=`${esc(s.de)} hat laut Steckbrief gerade keine Saison – die Karte bleibt deshalb leer.`;
      else if(m.vague)t='Für diese Art ist kein Lebensraum hinterlegt – bewertet wird nur das Wetter.';
      else if(!m.forest)t=SMASK&&DATA.s?'Art des Offenlands – solange der Baumarten-Filter aktiv ist, bleibt die Karte für sie leer.':'Art des Offenlands: Wiese, Acker und Siedlung kann die Karte nicht unterscheiden – außerhalb des Waldes zählt nur das Wetter.'}}
    else if(STATE.mode==='speise')t='Gezeigt wird je Zelle der Wert der Speisepilz-Art, die dort gerade am besten passt.';
    else if(STATE.mode==='ph')t='Boden-pH im Oberboden (0–15 cm), geschätzt aus SoilGrids (250-m-Raster, je Zelle gemittelt): rot = sauer, gelb = schwach sauer, grün = neutral, blau = basisch. Antippen zeigt den Wert und die Stufe.';
    else t=SMASK&&DATA.s?'Allgemeine Lage: Feuchte und Temperatur, gewichtet mit dem Anteil der gewählten Baumarten in der Zelle.':'Allgemeine Lage: Feuchte und Temperatur, gewichtet mit dem Waldanteil der Zelle.';
    if(!DATA.s)t+=' Die Standortdaten (Baumarten, Boden-pH) fehlen noch – bewertet wird vorerst nur das Wetter.';
    else if(SMASK&&STATE.mode!=='ph'){const n=TREE.filter((x,j)=>SMASK[j]).map(x=>TREEDE[x]);t+=n.length?` Baumarten-Filter: bewertet werden nur Bestände mit ${n.join(', ')}.`:' Baumarten-Filter: keine Baumart gewählt – die Bewertung bleibt leer.'}
    note.textContent=t.trim()}
  if(LASTCELL>=0)detail(root,LASTCELL);
}
function fsince(){const f=DATA.d.meta.frost_since;if(!f)return 'Saisonbeginn';const [y,m,d]=f.split('-');return `${+d}.${+m}.`}
function bar(l,v){return `<div class="hm-bar"><b>${l}</b><span><i style="width:${Math.round(clamp(v)*100)}%"></i></span><em>${Math.round(clamp(v)*100)} %</em></div>`}
function detail(root,i){
  const box=root.querySelector('#hm-detail');if(!box)return;const c=cell(i);LASTCELL=i;
  if(!c){box.innerHTML='<p class="mut small">Für diesen Punkt liegen keine Daten vor (außerhalb Deutschlands).</p>';return}
  const g=DATA.g,cx=i%g.W,cy=(i/g.W)|0,la=lat(g.y1-(cy+.5)*g.cell),lo=lon(g.x0+(cx+.5)*g.cell);
  const v=SCORE?Math.max(0,SCORE[i]):0,isPh=STATE.mode==='ph';let h=`<div class="row" style="justify-content:space-between;align-items:baseline"><h3 style="margin:0">${esc(title())}</h3><span class="hm-score">${isPh?(c.ph!=null?`${num(c.ph,1)}<small class="mut" style="font-size:.8rem;font-weight:500"> ${phClass(Math.round(c.ph*10)/10)}</small>`:'–'):`${Math.round(v)}<small class="mut" style="font-size:.8rem;font-weight:500"> / 100</small>`}</span></div><p class="tiny mut" style="margin:2px 0 8px">Zelle bei ${num(la,3)}° N, ${num(lo,3)}° O (ca. 1 × 1 km)</p>`;
  if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);if(s){const f=factors(c,s);h+=bar('Saison',f.saison)+bar('Standort',f.standort)+bar('Boden-pH',f.boden)+bar('Feuchte',f.feuchte)+bar('Temperatur',f.temperatur)}}
  else if(STATE.mode==='speise'&&BEST&&BEST.idx[i]>=0){const s=BEST.list[BEST.idx[i]];h+=`<p class="small">Beste Art hier: <a href="#karte-${esc(s.id)}" style="text-decoration:underline">${esc(s.de)}</a></p>`}
  h+=`<div class="hm-kv"><span>Wirksamer Niederschlag</span><b>${num(c.peff,1)} mm <small class="mut">(${peffClass(Math.round(c.peff*10)/10)})</small></b>${c.recent!=null?`<span>Regen der letzten 3 Tage</span><b>${num(c.recent,1)} mm <small class="mut">(wirkt erst in einigen Tagen)</small></b>`:''}${c.sm!=null?`<span>Bodenfeuchte (0–30 cm)</span><b>${num(c.sm)} % nFK <small class="mut">(${smClass(Math.round(c.sm))})</small></b>`:''}${c.t15!=null?`<span>Temperatur, Mittel 15 Tage</span><b>${num(c.t15,1)} °C</b>`:''}${c.tmin!=null?`<span>Kältester Tag (letzte 5)</span><b>${c.fmin!=null?`Tagesmittel ${num(c.tmin,1)} °C · Tiefstwert ${num(c.fmin,1)} °C <small class="mut">(${frostName(c.fmin)||'kein Frost'})</small>`:`${num(c.tmin,1)} °C`}</b>`:''}${c.fseas!=null?`<span>Frost seit ${fsince()}</span><b>${frostName(c.fseas)?`${cap(frostName(c.fseas))} · Tiefstwert ${num(c.fseas,1)} °C`:`Noch keiner · Tiefstwert ${num(c.fseas,1)} °C`} <small class="mut">(Luft in 2 m Höhe)</small></b>`:''}`;
  if(c.tr){const ta=c.trAll||c.tr,fa=c.flt?c.forestAll:c.forest,t=TREE.map((n,j)=>[n,ta[j]]).filter(x=>x[1]>=.01).sort((a,b)=>b[1]-a[1]);
    h+=`<span>Wald in der Zelle</span><b>${num(fa*100)} %${t.length?' – '+t.slice(0,5).map(x=>`${TREEDE[x[0]]} ${num(x[1]*100)} %`).join(', '):''}</b>${c.flt?`<span>Davon gewählte Baumarten</span><b>${num(c.forest*100)} % der Zelle</b>`:''}${c.loss>=.01?`<span>Kahl-/Schadfläche</span><b>${num(c.loss*100)} %</b>`:''}${c.ph!=null?`<span>Boden-pH (0–15 cm)</span><b>${num(c.ph,1)} <small class="mut">(${phClass(Math.round(c.ph*10)/10)})</small></b>`:''}`}
  h+='</div>';
  const top=SP().map(s=>[s,total(factors(c,s))]).filter(x=>x[1]>=3).sort((a,b)=>b[1]-a[1]).slice(0,6);
  h+=`<h3 style="margin:12px 0 2px">Was hier gerade am ehesten wächst</h3>`+(top.length?`<div class="hm-top">${top.map(([s,x])=>`<a href="#karte-${esc(s.id)}"><span>${esc(s.de)} <i class="mut">${esc(s.sci)}</i></span><em>${Math.round(x)}</em></a>`).join('')}</div>`:'<p class="mut small">Zurzeit passt hier laut Modell keine Art gut.</p>');
  box.innerHTML=h;
  if(MAP){const b=[[lat(g.y1-(cy+1)*g.cell),lon(g.x0+cx*g.cell)],[lat(g.y1-cy*g.cell),lon(g.x0+(cx+1)*g.cell)]];if(MARK)MARK.setBounds(b);else MARK=L.rectangle(b,{color:'#1d2219',weight:2,fill:false,interactive:false}).addTo(MAP)}
}

async function view(root,id){
  if(DATA&&navigator.onLine!==false&&(DATA.offline||Date.now()-DATA.t>3*36e5)){DATA=null;LOADING=null;RCACHE.clear()}
  css();if(MAP){try{MAP.remove()}catch(e){}MAP=null;OVER=null;MARK=null;CANV=null}
  if(id&&SP().some(s=>s.id===id))STATE={mode:'art',id};else if(STATE.mode==='art'&&!id)STATE={mode:'wetter',id:null};
  root.innerHTML=`<h1>Pilzkarte</h1><p class="small mut" id="hm-stand">Lade Wetterdaten …</p>
  <div class="hm-ctl"><select id="hm-mode" aria-label="Anzeige"><option value="wetter">Pilzwetter allgemein</option><option value="speise">Speisepilze</option><option value="ph">Boden-pH</option><option value="art" hidden>Einzelne Art</option></select>
  <div class="hm-sw"><input id="hm-q" type="search" placeholder="Art suchen, z. B. Steinpilz" aria-label="Art suchen" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="hm-sug"><div class="hm-sug" id="hm-sug" role="listbox" hidden></div></div><button class="btn sm" id="hm-loc" type="button">◎ Mein Standort</button></div>
  <div class="hm-map" id="hm-map"><div class="hm-busy">Berechne Karte …</div></div>
  <div class="hm-ctl hm-lay"><span class="chip" data-b="osm">Karte</span><span class="chip" data-b="sat">Satellit</span><i class="sep"></i><span class="chip" id="hm-trees">Baumarten (10 m)</span><label class="hm-op" title="Deckkraft der farbigen Bewertung">Deckkraft <input type="range" id="hm-op" min="0" max="100" step="5" aria-label="Deckkraft der Bewertung"></label></div>
  <div class="hm-tleg" id="hm-tleg" hidden><button type="button" class="hm-tq" data-tq="all">Alle</button><button type="button" class="hm-tq" data-tq="none">Keine</button>${TKEYS.map(k=>`<button type="button" class="hm-tk" data-k="${k}" aria-pressed="true"><i style="background:${TCOL[k]}"></i>${TREEDE[k]}</button>`).join('')}<small>Antippen blendet eine Baumart ein oder aus. Die farbige Bewertung gilt dann nur für Bestände der gewählten Baumarten.</small></div>
  <div class="hm-leg hm-leg-s"><span>schlecht</span><i></i><span>sehr gut</span></div><div class="hm-leg hm-leg-p" hidden><span>sauer</span><i class="ph"></i><span>basisch</span></div><div class="hm-leg hm-leg-p hm-ticks" hidden><span>sauer</span><b><em>pH 4</em><em>5</em><em>6</em><em>7</em><em>8</em><em>9</em></b><span>basisch</span></div>
  <p class="small mut" id="hm-note" style="margin:0 2px 8px"></p>
  <div class="panel" id="hm-detail"><p class="mut small" style="margin:0">Tippe auf die Karte, um die Werte einer Zelle und die dort passenden Arten zu sehen.</p></div>
  <div class="panel"><h3 style="margin-top:0">So entsteht die Bewertung</h3><p class="small">Der Wert (0–100) ist eine <b>Schätzung</b> aus Saison laut Steckbrief, Baumbestand, Boden-pH, Feuchte und Temperatur – kein Fundnachweis. Feuchte: wirksamer Niederschlag (Regen vor 4–5 Tagen zählt halb, vor 6–9 Tagen voll, vor 10–14 Tagen zu 70 %, vor 15–20 Tagen zu 30 %; die letzten 3 Tage noch nicht) und Bodenfeuchte. Die Baumartenkarte kennt nur die vorherrschende Art je 10-m-Fläche; Hainbuche, Linde, Pappel u. a. stecken in „sonstige Bäume“.</p>
  <p class="small">Farben: rot = schlecht, gelb = mittel, grün = sehr gut; hellgrau = Wert unter 3, also praktisch keine Chance.</p>
  <h3>Einordnung der Werte</h3>
  <p class="small"><b>Wirksamer Niederschlag</b> (gewichtete Regensumme der letzten 20 Tage): unter 4 mm sehr trocken · 4–10 mm trocken · 10–18 mm mäßig feucht · 18–30 mm feucht · 30–50 mm sehr feucht · ab 50 mm nass. Bei durchschnittlichem Regen (Deutschland rund 790 mm im Jahr) ergäben sich etwa 22 mm. In der Bewertung zählt Regen unter 4 mm gar nicht, ab 28 mm voll; die Feuchte setzt sich dort zu 65 % aus dem Regen und zu 35 % aus der Bodenfeuchte zusammen.</p>
  <p class="small"><b>Bodenfeuchte in % nFK</b> – nutzbare Feldkapazität: wie voll der Bodenwasserspeicher ist, aus dem Pflanzen Wasser ziehen können (100 % = voll, 0 % = leer). Unter 20 % sehr trocken · 20–30 % trocken · 30–50 % mäßig trocken · 50–80 % feucht · 80–100 % sehr feucht · über 100 % nass. Unter 30 % herrscht laut DWD deutlicher Trockenstress. In der Bewertung zählt Bodenfeuchte unter 35 % gar nicht, ab 80 % voll.</p>
  <p class="small"><b>Frost</b> (Tiefstwert der Luft in 2 m Höhe, Einteilung des DWD): leicht 0 bis −4 °C · mäßig −4 bis −10 °C · streng −10 bis −15 °C · sehr streng unter −15 °C. In die Bewertung geht das kälteste Tagesmittel der letzten 5 Tage ein: unter −1 °C halbiert sie sich, unter −4 °C sinkt sie auf ein Fünftel – außer bei Winter- und Ganzjahresarten.</p>
  <p class="small"><b>Boden-pH</b> (Stufen nach der Bodenkundlichen Kartieranleitung): unter 4,0 sehr stark sauer · 4,0–4,7 stark sauer · 4,7–5,4 mäßig sauer · 5,4–6,1 schwach sauer · 6,1–6,8 sehr schwach sauer · 6,8–7,2 neutral · darüber alkalisch. Der Wert ist eine Schätzung aus SoilGrids (pH in Wasser, 250-m-Raster). Die Ansicht „Boden-pH“ zeigt ihn als Karte, gefärbt wie ein Indikatorstreifen: rot sauer, gelb schwach sauer, grün neutral, blau basisch. In der Bewertung verlieren Arten saurer Böden ab pH 5,0 und Kalkzeiger unter pH 6,3 an Punkten.</p>
  <p class="small">Die Bewertung gilt für die ganze Zelle von etwa 1 × 1 km. Wo darin welcher Bestand steht, zeigt die Ebene <b>Baumarten (10 m)</b> – am besten hineinzoomen und mit dem Regler „Deckkraft“ die Bewertung abschwächen. In der Legende darunter lässt sich jede Baumart einzeln ein- und ausblenden; solange nicht alle gewählt sind, bewertet die Karte nur Bestände dieser Baumarten (Offenland zählt dann nicht).</p>
  <p class="tiny mut" style="margin-bottom:0">Daten: Deutscher Wetterdienst (HYRAS-DE-PRE, -TAS und -TASMIN, Bodenfeuchte AMBAV) · DLR, Tree Species Germany 2022 (CC BY 4.0) · ISRIC SoilGrids 2.0 (CC BY 4.0) · Karte © OpenStreetMap-Mitwirkende · Satellitenbild: Esri, Vantor, Earthstar Geographics und GIS-Nutzergemeinschaft · Ortsnamen: Esri, HERE, Garmin, OpenStreetMap-Mitwirkende</p></div>`;
  const stand=root.querySelector('#hm-stand');
  try{await Promise.all([load(),lib()])}catch(e){
    root.querySelector('#hm-map').innerHTML=location.href.startsWith(SITE)
      ?`<div style="padding:22px;text-align:center"><p><b>Die Pilzkarte konnte nicht geladen werden.</b></p><p class="small">Beim ersten Öffnen braucht sie eine Internetverbindung. Danach zeigt sie auch ohne Netz den zuletzt geladenen Stand.</p></div>`
      :`<div style="padding:22px;text-align:center"><p><b>Die Pilzkarte konnte nicht geladen werden.</b></p><p class="small">Sie braucht eine Internetverbindung und funktioniert nur in der selbst gehosteten Fassung der App.</p><p><a class="btn" href="${SITE}#karte" target="_blank" rel="noopener">Pilzkarte dort öffnen</a></p></div>`;
    stand.textContent='';return}
  if(!root.isConnected)return;
  const m=DATA.d.meta;stand.textContent=(DATA.offline?'Ohne Netz – zuletzt geladener Stand. ':'')+`Stand ${dDE(m.date)} · Niederschlag bis ${dDE(m.pr_last)}`+(m.sm_date?` · Bodenfeuchte vom ${dDE(m.sm_date)}`:' · ohne Bodenfeuchte')+(m.tas_last?'':' · ohne Temperatur');
  const sel=root.querySelector('#hm-mode'),q=root.querySelector('#hm-q');
  const sync=()=>{const o=sel.querySelector('[value=art]');if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);o.hidden=false;o.textContent=s?s.de:'Einzelne Art';q.value=s?s.de:''}else{o.hidden=true}sel.value=STATE.mode};sync();
  sel.querySelector('[value=ph]').hidden=!DATA.s;   // pH-Karte nur mit Standortdaten
  MAP=L.map(root.querySelector('#hm-map'),{minZoom:5,maxZoom:17,maxBounds:[[45.5,2],[56.8,19]],attributionControl:true}).setView(POS?POS.c:[51.2,10.4],POS?POS.z:6);
  MAP.on('moveend',()=>{POS={c:MAP.getCenter(),z:MAP.getZoom()}});
  MAP.attributionControl.setPrefix(false);
  const bases={osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}),
    sat:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:18,attribution:'Satellitenbild: Esri, Vantor, Earthstar Geographics, GIS-Nutzergemeinschaft'})};
  /* Ortsnamen und Grenzen über dem Satellitenbild – eigene Ebene über Bewertung und Baumarten, nimmt keine Klicks an */
  if(!MAP.getPane('hm-lab')){const pn=MAP.createPane('hm-lab');pn.style.zIndex=450;pn.style.pointerEvents='none'}
  const labels=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{pane:'hm-lab',maxZoom:19,attribution:'Ortsnamen: Esri, HERE, Garmin, © OpenStreetMap-Mitwirkende'});
  tFilter();sFilter();const trees=treeLayer({layers:'TREE_SPECIES_DE_2022',format:'image/png',transparent:true,version:'1.1.1',opacity:.8,maxZoom:19,tileSize:512,zIndex:10,className:'hm-treelayer',attribution:'Baumarten © DLR (CC BY 4.0)'});
  const lay=()=>{for(const k in bases){if(k===OPT.base){if(!MAP.hasLayer(bases[k]))bases[k].addTo(MAP)}else if(MAP.hasLayer(bases[k]))MAP.removeLayer(bases[k])}
    if(OPT.base==='sat'){if(!MAP.hasLayer(labels))labels.addTo(MAP)}else if(MAP.hasLayer(labels))MAP.removeLayer(labels);
    if(OPT.trees){if(!MAP.hasLayer(trees))trees.addTo(MAP)}else if(MAP.hasLayer(trees))MAP.removeLayer(trees);
    root.querySelectorAll('.hm-lay [data-b]').forEach(c=>c.classList.toggle('on',c.dataset.b===OPT.base));
    root.querySelector('#hm-trees').classList.toggle('on',!!OPT.trees);root.querySelector('#hm-tleg').hidden=!OPT.trees;
    const ts=tSel();root.querySelectorAll('.hm-tk').forEach(b=>b.setAttribute('aria-pressed',ts.includes(b.dataset.k)?'true':'false'));
    root.querySelector('#hm-op').value=OPT.op;if(OVER)OVER.setOpacity(OPT.op/100)};
  lay();
  root.querySelectorAll('.hm-lay [data-b]').forEach(c=>c.addEventListener('click',()=>{OPT.base=c.dataset.b;saveOpt();lay()}));
  root.querySelector('#hm-trees').addEventListener('click',()=>{OPT.trees=!OPT.trees;if(OPT.trees){if(OPT.op>35){OPT.opPrev=OPT.op;OPT.op=35}}else if(OPT.opPrev){OPT.op=OPT.opPrev;delete OPT.opPrev}saveOpt();lay();if(sFilter())reUpdate(root)});
  root.querySelector('#hm-op').addEventListener('input',e=>{OPT.op=+e.target.value;delete OPT.opPrev;if(OVER)OVER.setOpacity(OPT.op/100)});
  root.querySelector('#hm-op').addEventListener('change',saveOpt);
  root.querySelector('#hm-tleg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;let s=tSel();
    if(b.dataset.tq==='all')s=TKEYS.slice();else if(b.dataset.tq==='none')s=[];else if(b.dataset.k){const k=b.dataset.k;s=s.includes(k)?s.filter(x=>x!==k):s.concat(k)}else return;
    OPT.tsel=s.length===TKEYS.length?null:TKEYS.filter(k=>s.includes(k));saveOpt();tFilter();lay();tRepaint(trees);if(sFilter())reUpdate(root)});
  MAP.on('click',e=>{const i=cellAt(e.latlng.lat,e.latlng.lng);if(i>=0)detail(root,i)});
  sel.addEventListener('change',()=>{if(sel.value!=='art'){STATE={mode:sel.value,id:null};q.value='';if(location.hash.startsWith('#karte-'))history.replaceState(null,'','#karte');sync();update(root)}});
  /* Artsuche mit Vorschlagsliste direkt unter dem Feld */
  const sug=root.querySelector('#hm-sug');let hits=[],act=-1;
  const nrm=t=>String(t||'').toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss');
  const find=v=>{const n=nrm(v.trim());if(!n)return [];const r=[];
    for(const s of SP()){const names=[s.de,s.sci,...(s.alt||[]),...(s.syn||[])].map(nrm);let b=9;
      names.forEach((t,k)=>{const i=t.indexOf(n);if(i<0)return;const w=i===0?0:/[\s\-]/.test(t[i-1])?1:2;if(w===2&&k>0)return;const sc=w+(k===0?0:k===1?.3:.6);if(sc<b)b=sc});
      if(b<9)r.push([b,s])}
    return r.sort((a,b)=>a[0]-b[0]||a[1].de.localeCompare(b[1].de,'de')).slice(0,8).map(x=>x[1])};
  const close=()=>{sug.hidden=true;q.setAttribute('aria-expanded','false');act=-1};
  const show=()=>{hits=find(q.value);act=-1;if(!q.value.trim()){close();return}
    sug.innerHTML=hits.length?hits.map((s,i)=>`<div role="option" data-i="${i}">${esc(s.de)}<i>${esc(s.sci)}</i></div>`).join(''):'<p>Keine Art gefunden.</p>';
    sug.hidden=false;q.setAttribute('aria-expanded','true')};
  const mark=()=>{[...sug.children].forEach((d,i)=>d.classList.toggle('act',i===act));const d=sug.children[act];if(d&&d.scrollIntoView)d.scrollIntoView({block:'nearest'})};
  const choose=s=>{close();q.blur();if(!s)return;STATE={mode:'art',id:s.id};history.replaceState(null,'','#karte-'+s.id);sync();update(root)};
  q.addEventListener('input',show);q.addEventListener('focus',()=>{if(q.value.trim()){q.select();show()}});
  q.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return}if(sug.hidden||!hits.length)return;
    if(e.key==='ArrowDown'){e.preventDefault();act=(act+1)%hits.length;mark()}else if(e.key==='ArrowUp'){e.preventDefault();act=(act-1+hits.length)%hits.length;mark()}
    else if(e.key==='Enter'){e.preventDefault();choose(hits[act<0?0:act])}});
  sug.addEventListener('pointerdown',e=>{const d=e.target.closest('[data-i]');if(d){e.preventDefault();choose(hits[+d.dataset.i])}});
  q.addEventListener('blur',()=>setTimeout(()=>{close();sync()},150));
  root.querySelector('#hm-loc').addEventListener('click',()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(p=>{const la=p.coords.latitude,lo=p.coords.longitude;MAP.setView([la,lo],11);const i=cellAt(la,lo);if(i>=0)detail(root,i)},()=>{stand.textContent+=' · Standort nicht verfügbar'},{timeout:10000,maximumAge:600000})});
  await update(root);
}
window.HEAT={view,_dbg:()=>({DATA,STATE,SCORE,cell,factors,grid,model})};
})();
