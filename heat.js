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
function decodeImg(b){if(window.createImageBitmap)return createImageBitmap(b);
  return new Promise((res,rej)=>{const u=URL.createObjectURL(b),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('Bild nicht lesbar'))};i.src=u})}
function treeLayer(opts){
  if(!TreeWMS)TreeWMS=L.TileLayer.WMS.extend({createTile(coords,done){
    const c=document.createElement('canvas'),sz=this.getTileSize(),ac=window.AbortController?new AbortController():null;c.width=sz.x;c.height=sz.y;c._ac=ac;c.complete=false;
    fetch(this.getTileUrl(coords),ac?{signal:ac.signal}:{}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.blob()}).then(decodeImg).then(img=>{
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);if(img.close)img.close();
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
function reUpdate(root){clearTimeout(UPT);UPT=setTimeout(()=>{if(root.isConnected)update(root)},300)}

/* ---------- Daten laden ---------- */
async function mosaic(base,name){
  const meta=await (await fetch(base+name+'.json',{cache:'no-cache'})).json();
  const blob=await (await fetch(base+name+'.png',{cache:'no-cache'})).blob();
  let bm;try{bm=await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'})}catch(e){bm=await createImageBitmap(blob)}
  const c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bm,0,0);
  const {W,H}=meta.grid,L={};
  meta.layers.forEach((l,i)=>{const col=i%meta.cols,row=(i/meta.cols)|0;const px=x.getImageData(col*W,row*H,W,H).data;const a=new Uint8Array(W*H);for(let k=0;k<a.length;k++)a[k]=px[k*4];L[l.id]=a});
  if(bm.close)bm.close();
  return {meta,L};
}
function load(){
  if(DATA)return Promise.resolve(DATA);
  if(!LOADING)LOADING=(async()=>{
    const d=await mosaic(URLS.daily,'daily');let s=null;
    try{s=await mosaic(URLS.stat,'static');if(s.meta.grid.W!==d.meta.grid.W||s.meta.grid.H!==d.meta.grid.H)s=null}catch(e){s=null}
    DATA={d,s,g:d.meta.grid,date:new Date(d.meta.date+'T12:00:00')};return DATA;
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
const frostName=t=>t>=0?null:t>=-5?'leichter Frost':t>=-10?'mäßiger Frost':t>=-15?'strenger Frost':'sehr strenger Frost';
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

/* Schnelle Rasterberechnung (ohne Objekte je Zelle) */
function grid(list){
  const {d,s,g}=DATA,L=d.L,N=g.W*g.H,out=new Float32Array(N).fill(-1),best=list&&list.length>1?new Int16Array(N).fill(-1):null;
  const tr=s?TREE.map(t=>s.L[t]):null,loss=s&&s.L.verlust,ph=s&&s.L.ph,mk=tr&&SMASK?SMASK:null;
  const P=CFG.peff,S=CFG.sm,ms=list?list.map(sp=>{const m=model(sp);return {m,a:mk?m.a.map((v,j)=>v*mk[j]):m.a,sea:season(m.mo,DATA.date)}}).filter(x=>x.sea>0):null;
  if(list&&!ms.length){for(let i=0;i<N;i++)if(L.peff[i]!==255)out[i]=0;return {out,best,idx:[]}}
  const idx=list?list.map((sp,k)=>k).filter(k=>season(model(list[k]).mo,DATA.date)>0):[];
  for(let i=0;i<N;i++){
    if(L.peff[i]===255)continue;
    const fp=ss(L.peff[i]/2,P[0],P[1]),wet=L.sm[i]===255?fp:CFG.wRain*fp+(1-CFG.wRain)*ss(L.sm[i]/2,S[0],S[1]);
    const t15=L.t15[i]===255?null:L.t15[i]/4-20,tmin=L.tmin5[i]===255?null:L.tmin5[i]/4-20;
    const frost=tmin==null?1:tmin<CFG.frost[2]?CFG.frost[3]:tmin<CFG.frost[0]?CFG.frost[1]:1;
    const hasS=tr&&tr[0][i]!==255;let forest=0,fsel=0;if(hasS){for(let j=0;j<10;j++){const v=tr[j][i];forest+=v;if(mk)fsel+=v*mk[j]}}forest/=250;fsel/=250;
    if(!list){const t=t15==null?1:trap(t15,CFG.temp.allg)*frost;out[i]=100*wet*t*(hasS?Math.min(1,Math.sqrt((mk?fsel:forest)/CFG.hFull)):1);continue}
    if(wet<=0){out[i]=0;continue}
    const pH=hasS&&ph[i]!==255?ph[i]/40+3:null,openF=hasS&&!mk?Math.max(0,1-forest-(loss?loss[i]/250:0)):0;
    let mx=0,bi=-1;
    for(let k=0;k<ms.length;k++){const m=ms[k].m;
      let tf=1;if(t15!=null){tf=0;for(const [w,q] of m.win){const v=trap(t15,w)*q;if(v>tf)tf=v}if(!m.hardy)tf*=frost}
      if(tf<=0)continue;
      let site=1;if(hasS){const a=ms[k].a;let h=0;for(let j=0;j<10;j++)h+=a[j]*tr[j][i];h/=250;site=Math.max(Math.min(1,Math.sqrt(h/CFG.hFull)),m.open*openF)}
      if(site<=0)continue;
      let pf=1;if(m.ph&&pH!=null){const a=m.ph.t==='sauer'?CFG.phSauer:CFG.phKalk;pf=1-clamp((pH-a[0])/(a[1]-a[0]))*(1-CFG.phMin)*m.ph.w}
      const v=100*ms[k].sea*site*pf*wet*tf;if(v>mx){mx=v;bi=idx[k]}}
    out[i]=mx;if(best)best[i]=bi}
  return {out,best};
}

/* ---------- Darstellung ---------- */
const STOPS=[[3,255,246,190,0],[6,255,240,170,.75],[15,253,212,112,.85],[30,249,160,63,.88],[50,232,96,44,.9],[70,193,39,45,.92],[100,106,13,71,.94]];
function colour(v){if(!(v>=STOPS[0][0]))return null;for(let k=1;k<STOPS.length;k++){if(v<=STOPS[k][0]){const a=STOPS[k-1],b=STOPS[k],t=(v-a[0])/(b[0]-a[0]);return [a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t,a[4]+(b[4]-a[4])*t]}}const z=STOPS[STOPS.length-1];return [z[1],z[2],z[3],z[4]]}
function paint(score){const {W,H}=DATA.g,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d'),im=x.createImageData(W,H),p=im.data;
  for(let i=0;i<score.length;i++){const v=score[i];if(v<0){continue}const col=colour(v);if(col){p[i*4]=col[0];p[i*4+1]=col[1];p[i*4+2]=col[2];p[i*4+3]=col[3]*255}else{p[i*4]=120;p[i*4+1]=120;p[i*4+2]=120;p[i*4+3]=26}}
  x.putImageData(im,0,0);return new Promise(r=>c.toBlob(b=>r(URL.createObjectURL(b)),'image/png'))}
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
.hm-leg{display:flex;align-items:center;gap:10px;margin:10px 2px;font-size:.8rem;color:var(--mut)}.hm-leg i{flex:1;height:10px;border-radius:6px;background:linear-gradient(90deg,#fff0aa,#fdd470 15%,#f9a03f 35%,#e8602c 55%,#c1272d 75%,#6a0d47)}
.hm-bar{display:grid;grid-template-columns:110px 1fr 44px;gap:8px;align-items:center;font-size:.86rem;margin:5px 0}.hm-bar b{font-weight:500}.hm-bar span{height:8px;border-radius:5px;background:var(--chip);overflow:hidden;display:block}.hm-bar span i{display:block;height:100%;background:var(--moss2)}.hm-bar em{font-style:normal;text-align:right;color:var(--mut)}
.hm-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;font-size:.88rem;margin:6px 0}.hm-kv span{color:var(--mut)}
.hm-top{display:flex;flex-direction:column;gap:2px;margin:6px 0}.hm-top a{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line);font-size:.9rem}.hm-top a em{font-style:normal;color:var(--mut)}
.hm-score{font-size:1.5rem;font-weight:700;color:var(--rust)}`;document.head.appendChild(s)}
function lib(){if(window.L)return Promise.resolve();return new Promise((res,rej)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='lib/leaflet.css';document.head.appendChild(l);const s=document.createElement('script');s.src='lib/leaflet.js';s.onload=res;s.onerror=()=>rej(new Error('Kartenbibliothek fehlt'));document.head.appendChild(s)})}

function title(){if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);return s?s.de:'Art'}return STATE.mode==='speise'?'Speisepilze':'Pilzwetter'}
async function update(root){
  const busy=root.querySelector('.hm-busy');if(busy)busy.hidden=false;
  await new Promise(r=>setTimeout(r,30));
  let r;if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);r=grid(s?[s]:[])}
  else if(STATE.mode==='speise'){const list=SP().filter(edible);r=grid(list);r.list=list}
  else r=grid(null);
  SCORE=r.out;BEST=r.best?{idx:r.best,list:r.list}:null;
  const url=await paint(SCORE);
  if(OVER){const old=OVER._url;OVER.setUrl(url);if(old)URL.revokeObjectURL(old)}else{OVER=L.imageOverlay(url,bounds(),{opacity:OPT.op/100,className:'hm-px'}).addTo(MAP)}
  if(busy)busy.hidden=true;
  const note=root.querySelector('#hm-note');
  if(note){let t='';if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);if(s){const m=model(s),sea=season(m.mo,DATA.date);
      if(sea<=0)t=`${esc(s.de)} hat laut Steckbrief gerade keine Saison – die Karte bleibt deshalb leer.`;
      else if(m.vague)t='Für diese Art ist kein Lebensraum hinterlegt – bewertet wird nur das Wetter.';
      else if(!m.forest)t=SMASK&&DATA.s?'Art des Offenlands – solange der Baumarten-Filter aktiv ist, bleibt die Karte für sie leer.':'Art des Offenlands: Wiese, Acker und Siedlung kann die Karte nicht unterscheiden – außerhalb des Waldes zählt nur das Wetter.'}}
    else if(STATE.mode==='speise')t='Gezeigt wird je Zelle der Wert der Speisepilz-Art, die dort gerade am besten passt.';
    else t=SMASK&&DATA.s?'Allgemeine Lage: Feuchte und Temperatur, gewichtet mit dem Anteil der gewählten Baumarten in der Zelle.':'Allgemeine Lage: Feuchte und Temperatur, gewichtet mit dem Waldanteil der Zelle.';
    if(!DATA.s)t+=' Die Standortdaten (Baumarten, Boden-pH) fehlen noch – bewertet wird vorerst nur das Wetter.';
    else if(SMASK){const n=TREE.filter((x,j)=>SMASK[j]).map(x=>TREEDE[x]);t+=n.length?` Baumarten-Filter: bewertet werden nur Bestände mit ${n.join(', ')}.`:' Baumarten-Filter: keine Baumart gewählt – die Bewertung bleibt leer.'}
    note.textContent=t.trim()}
  if(LASTCELL>=0)detail(root,LASTCELL);
}
function fsince(){const f=DATA.d.meta.frost_since;if(!f)return 'Saisonbeginn';const [y,m,d]=f.split('-');return `${+d}.${+m}.`}
function bar(l,v){return `<div class="hm-bar"><b>${l}</b><span><i style="width:${Math.round(clamp(v)*100)}%"></i></span><em>${Math.round(clamp(v)*100)} %</em></div>`}
function detail(root,i){
  const box=root.querySelector('#hm-detail');if(!box)return;const c=cell(i);LASTCELL=i;
  if(!c){box.innerHTML='<p class="mut small">Für diesen Punkt liegen keine Daten vor (außerhalb Deutschlands).</p>';return}
  const g=DATA.g,cx=i%g.W,cy=(i/g.W)|0,la=lat(g.y1-(cy+.5)*g.cell),lo=lon(g.x0+(cx+.5)*g.cell);
  const v=SCORE?Math.max(0,SCORE[i]):0;let h=`<div class="row" style="justify-content:space-between;align-items:baseline"><h3 style="margin:0">${esc(title())}</h3><span class="hm-score">${Math.round(v)}<small class="mut" style="font-size:.8rem;font-weight:500"> / 100</small></span></div><p class="tiny mut" style="margin:2px 0 8px">Zelle bei ${num(la,3)}° N, ${num(lo,3)}° O (ca. 1 × 1 km)</p>`;
  if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);if(s){const f=factors(c,s);h+=bar('Saison',f.saison)+bar('Standort',f.standort)+bar('Boden-pH',f.boden)+bar('Feuchte',f.feuchte)+bar('Temperatur',f.temperatur)}}
  else if(STATE.mode==='speise'&&BEST&&BEST.idx[i]>=0){const s=BEST.list[BEST.idx[i]];h+=`<p class="small">Beste Art hier: <a href="#karte-${esc(s.id)}" style="text-decoration:underline">${esc(s.de)}</a></p>`}
  h+=`<div class="hm-kv"><span>Wirksamer Niederschlag</span><b>${num(c.peff,1)} mm</b>${c.recent!=null?`<span>Regen der letzten 3 Tage</span><b>${num(c.recent,1)} mm <small class="mut">(wirkt erst in einigen Tagen)</small></b>`:''}${c.sm!=null?`<span>Bodenfeuchte (0–30 cm)</span><b>${num(c.sm)} % nFK</b>`:''}${c.t15!=null?`<span>Temperatur, Mittel 15 Tage</span><b>${num(c.t15,1)} °C</b>`:''}${c.tmin!=null?`<span>Kältester Tag (letzte 5)</span><b>${c.fmin!=null?`Tagesmittel ${num(c.tmin,1)} °C · Tiefstwert ${num(c.fmin,1)} °C <small class="mut">(${frostName(c.fmin)||'kein Frost'})</small>`:`${num(c.tmin,1)} °C`}</b>`:''}${c.fseas!=null?`<span>Frost seit ${fsince()}</span><b>${frostName(c.fseas)?`${cap(frostName(c.fseas))} · Tiefstwert ${num(c.fseas,1)} °C`:`Noch keiner · Tiefstwert ${num(c.fseas,1)} °C`} <small class="mut">(Luft in 2 m Höhe)</small></b>`:''}`;
  if(c.tr){const ta=c.trAll||c.tr,fa=c.flt?c.forestAll:c.forest,t=TREE.map((n,j)=>[n,ta[j]]).filter(x=>x[1]>=.01).sort((a,b)=>b[1]-a[1]);
    h+=`<span>Wald in der Zelle</span><b>${num(fa*100)} %${t.length?' – '+t.slice(0,5).map(x=>`${TREEDE[x[0]]} ${num(x[1]*100)} %`).join(', '):''}</b>${c.flt?`<span>Davon gewählte Baumarten</span><b>${num(c.forest*100)} % der Zelle</b>`:''}${c.loss>=.01?`<span>Kahl-/Schadfläche</span><b>${num(c.loss*100)} %</b>`:''}${c.ph!=null?`<span>Boden-pH (0–15 cm)</span><b>${num(c.ph,1)}</b>`:''}`}
  h+='</div>';
  const top=SP().map(s=>[s,total(factors(c,s))]).filter(x=>x[1]>=3).sort((a,b)=>b[1]-a[1]).slice(0,6);
  h+=`<h3 style="margin:12px 0 2px">Was hier gerade am ehesten wächst</h3>`+(top.length?`<div class="hm-top">${top.map(([s,x])=>`<a href="#karte-${esc(s.id)}"><span>${esc(s.de)} <i class="mut">${esc(s.sci)}</i></span><em>${Math.round(x)}</em></a>`).join('')}</div>`:'<p class="mut small">Zurzeit passt hier laut Modell keine Art gut.</p>');
  box.innerHTML=h;
  if(MAP){const b=[[lat(g.y1-(cy+1)*g.cell),lon(g.x0+cx*g.cell)],[lat(g.y1-cy*g.cell),lon(g.x0+(cx+1)*g.cell)]];if(MARK)MARK.setBounds(b);else MARK=L.rectangle(b,{color:'#1d2219',weight:2,fill:false,interactive:false}).addTo(MAP)}
}

async function view(root,id){
  css();if(MAP){try{MAP.remove()}catch(e){}MAP=null;OVER=null;MARK=null}
  if(id&&SP().some(s=>s.id===id))STATE={mode:'art',id};else if(STATE.mode==='art'&&!id)STATE={mode:'wetter',id:null};
  root.innerHTML=`<h1>Pilzkarte</h1><p class="small mut" id="hm-stand">Lade Wetterdaten …</p>
  <div class="hm-ctl"><select id="hm-mode" aria-label="Anzeige"><option value="wetter">Pilzwetter allgemein</option><option value="speise">Speisepilze</option><option value="art" hidden>Einzelne Art</option></select>
  <div class="hm-sw"><input id="hm-q" type="search" placeholder="Art suchen, z. B. Steinpilz" aria-label="Art suchen" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="hm-sug"><div class="hm-sug" id="hm-sug" role="listbox" hidden></div></div><button class="btn sm" id="hm-loc" type="button">◎ Mein Standort</button></div>
  <div class="hm-map" id="hm-map"><div class="hm-busy">Berechne Karte …</div></div>
  <div class="hm-ctl hm-lay"><span class="chip" data-b="osm">Karte</span><span class="chip" data-b="sat">Satellit</span><i class="sep"></i><span class="chip" id="hm-trees">Baumarten (10 m)</span><label class="hm-op" title="Transparenz der farbigen Bewertung">Transparenz <input type="range" id="hm-op" min="0" max="100" step="5" aria-label="Transparenz der Bewertung"></label></div>
  <div class="hm-tleg" id="hm-tleg" hidden><button type="button" class="hm-tq" data-tq="all">Alle</button><button type="button" class="hm-tq" data-tq="none">Keine</button>${TKEYS.map(k=>`<button type="button" class="hm-tk" data-k="${k}" aria-pressed="true"><i style="background:${TCOL[k]}"></i>${TREEDE[k]}</button>`).join('')}<small>Antippen blendet eine Baumart ein oder aus. Die farbige Bewertung gilt dann nur für Bestände der gewählten Baumarten.</small></div>
  <div class="hm-leg"><span>gering</span><i></i><span>sehr gut</span></div>
  <p class="small mut" id="hm-note" style="margin:0 2px 8px"></p>
  <div class="panel" id="hm-detail"><p class="mut small" style="margin:0">Tippe auf die Karte, um die Werte einer Zelle und die dort passenden Arten zu sehen.</p></div>
  <div class="panel"><h3 style="margin-top:0">So entsteht die Bewertung</h3><p class="small">Der Wert (0–100) ist eine <b>Schätzung</b> aus Saison laut Steckbrief, Baumbestand, Boden-pH, Feuchte und Temperatur – kein Fundnachweis. Feuchte: wirksamer Niederschlag (Regen vor 4–5 Tagen zählt halb, vor 6–9 Tagen voll, vor 10–14 Tagen zu 70 %, vor 15–20 Tagen zu 30 %; die letzten 3 Tage noch nicht) und Bodenfeuchte. Die Baumartenkarte kennt nur die vorherrschende Art je 10-m-Fläche; Hainbuche, Linde, Pappel u. a. stecken in „sonstige Bäume“.</p>
  <p class="small">Die Bewertung gilt für die ganze Zelle von etwa 1 × 1 km. Wo darin welcher Bestand steht, zeigt die Ebene <b>Baumarten (10 m)</b> – am besten hineinzoomen und die Bewertung mit dem Regler „Transparenz“ durchsichtiger machen. In der Legende darunter lässt sich jede Baumart einzeln ein- und ausblenden; solange nicht alle gewählt sind, bewertet die Karte nur Bestände dieser Baumarten (Offenland zählt dann nicht).</p>
  <p class="tiny mut" style="margin-bottom:0">Daten: Deutscher Wetterdienst (HYRAS-DE-PRE, -TAS und -TASMIN, Bodenfeuchte AMBAV) · DLR, Tree Species Germany 2022 (CC BY 4.0) · ISRIC SoilGrids 2.0 (CC BY 4.0) · Karte © OpenStreetMap-Mitwirkende · Satellitenbild © Esri, Maxar, Earthstar Geographics</p></div>`;
  const stand=root.querySelector('#hm-stand');
  try{await Promise.all([load(),lib()])}catch(e){
    root.querySelector('#hm-map').innerHTML=`<div style="padding:22px;text-align:center"><p><b>Die Pilzkarte konnte nicht geladen werden.</b></p><p class="small">Sie braucht eine Internetverbindung und funktioniert nur in der selbst gehosteten Fassung der App.</p><p><a class="btn" href="${SITE}#karte" target="_blank" rel="noopener">Pilzkarte dort öffnen</a></p></div>`;
    stand.textContent='';return}
  if(!root.isConnected)return;
  const m=DATA.d.meta;stand.textContent=`Stand ${dDE(m.date)} · Niederschlag bis ${dDE(m.pr_last)}`+(m.sm_date?` · Bodenfeuchte vom ${dDE(m.sm_date)}`:' · ohne Bodenfeuchte')+(m.tas_last?'':' · ohne Temperatur');
  const sel=root.querySelector('#hm-mode'),q=root.querySelector('#hm-q');
  const sync=()=>{const o=sel.querySelector('[value=art]');if(STATE.mode==='art'){const s=SP().find(x=>x.id===STATE.id);o.hidden=false;o.textContent=s?s.de:'Einzelne Art';q.value=s?s.de:''}else{o.hidden=true}sel.value=STATE.mode};sync();
  MAP=L.map(root.querySelector('#hm-map'),{minZoom:5,maxZoom:17,maxBounds:[[45.5,2],[56.8,19]],attributionControl:true}).setView(POS?POS.c:[51.2,10.4],POS?POS.z:6);
  MAP.on('moveend',()=>{POS={c:MAP.getCenter(),z:MAP.getZoom()}});
  MAP.attributionControl.setPrefix(false);
  const bases={osm:L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}),
    sat:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,maxNativeZoom:18,attribution:'Satellitenbild © Esri, Maxar, Earthstar Geographics'})};
  tFilter();sFilter();const trees=treeLayer({layers:'TREE_SPECIES_DE_2022',format:'image/png',transparent:true,version:'1.1.1',opacity:.8,maxZoom:19,zIndex:10,className:'hm-treelayer',attribution:'Baumarten © DLR (CC BY 4.0)'});
  const lay=()=>{for(const k in bases){if(k===OPT.base){if(!MAP.hasLayer(bases[k]))bases[k].addTo(MAP)}else if(MAP.hasLayer(bases[k]))MAP.removeLayer(bases[k])}
    if(OPT.trees){if(!MAP.hasLayer(trees))trees.addTo(MAP)}else if(MAP.hasLayer(trees))MAP.removeLayer(trees);
    root.querySelectorAll('.hm-lay [data-b]').forEach(c=>c.classList.toggle('on',c.dataset.b===OPT.base));
    root.querySelector('#hm-trees').classList.toggle('on',!!OPT.trees);root.querySelector('#hm-tleg').hidden=!OPT.trees;
    const ts=tSel();root.querySelectorAll('.hm-tk').forEach(b=>b.setAttribute('aria-pressed',ts.includes(b.dataset.k)?'true':'false'));
    root.querySelector('#hm-op').value=100-OPT.op;if(OVER)OVER.setOpacity(OPT.op/100)};
  lay();
  root.querySelectorAll('.hm-lay [data-b]').forEach(c=>c.addEventListener('click',()=>{OPT.base=c.dataset.b;saveOpt();lay()}));
  root.querySelector('#hm-trees').addEventListener('click',()=>{OPT.trees=!OPT.trees;if(OPT.trees){if(OPT.op>35){OPT.opPrev=OPT.op;OPT.op=35}}else if(OPT.opPrev){OPT.op=OPT.opPrev;delete OPT.opPrev}saveOpt();lay();if(sFilter())reUpdate(root)});
  root.querySelector('#hm-op').addEventListener('input',e=>{OPT.op=100-(+e.target.value);delete OPT.opPrev;if(OVER)OVER.setOpacity(OPT.op/100)});
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
