'use strict';
/* ---------- Catálogo de símbolos y figuras ----------
   Cada símbolo se dibuja en una caja de 100×100 y hereda relleno/contorno de la capa,
   así que se recolorea con los esmaltes. Primitivas: C círculo, E elipse, D path, EO path con huecos,
   cap "cápsula" (extremidad entre dos puntos), star estrella, ring anillo, rot4/rotN copias giradas, mirror simetría. */
const C=(cx,cy,r)=>`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
const E=(cx,cy,rx,ry,rot)=>`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"${rot?` transform="rotate(${rot} ${f(cx)} ${f(cy)})"`:''}/>`;
const D=(d,extra)=>`<path d="${d}"${extra||''}/>`;
const EO=d=>`<path d="${d}" fill-rule="evenodd"/>`;
const rot4=m=>[0,90,180,270].map(a=>a?`<g transform="rotate(${a} 50 50)">${m}</g>`:m).join('');
const rotN=(m,n)=>Array.from({length:n},(_,i)=>i?`<g transform="rotate(${f(360*i/n)} 50 50)">${m}</g>`:m).join('');
const mirror=m=>m+`<g transform="matrix(-1 0 0 1 100 0)">${m}</g>`;
function cap(x1,y1,x2,y2,th){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len*th/2,ny=dx/len*th/2,r=f(th/2);return `<path d="M${f(x1+nx)} ${f(y1+ny)}L${f(x2+nx)} ${f(y2+ny)}A${r} ${r} 0 0 0 ${f(x2-nx)} ${f(y2-ny)}L${f(x1-nx)} ${f(y1-ny)}A${r} ${r} 0 0 0 ${f(x1+nx)} ${f(y1+ny)}Z"/>`;}
function star(cx,cy,n,R,r){const pts=[];for(let i=0;i<2*n;i++){const a=-Math.PI/2+i*Math.PI/n;const rad=i%2?r:R;pts.push(f(cx+rad*Math.cos(a))+','+f(cy+rad*Math.sin(a)));}return `<polygon points="${pts.join(' ')}"/>`;}
const ring=(cx,cy,R,r)=>EO(`M${f(cx)} ${f(cy-R)}a${R} ${R} 0 1 0 0.01 0Z M${f(cx)} ${f(cy-r)}a${r} ${r} 0 1 1 -0.01 0Z`);
function symbolMarkup(sym,fill,stroke,sw,fill2){
 const body=sym.body||'';fill2=fill2||'#b3202c';
 if(sym.detailed)return `<g transform="translate(-50 -50)">${body.replace(/__S1__/g,fill).replace(/__S2__/g,fill2).replace(/__K__/g,stroke)}</g>`;
 const outline=sw>0?`<g fill="${stroke}" stroke="${stroke}" stroke-width="${f(2*sw)}" stroke-linejoin="round" transform="translate(-50 -50)">${body.replace(/__S2__|__K__/g,stroke)}</g>`:'';
 return outline+`<g fill="${fill}" transform="translate(-50 -50)">${body.replace(/__S2__/g,fill2).replace(/__K__/g,stroke)}</g>`;
}

const SYMBOLS={
 /* Cruces */
 /* Religión y astros */
 star8:{name:'Estrella de 8 puntas',cat:'Religión',body:star(50,50,8,46,22)},
 star6:{name:'Estrella de 6 puntas',cat:'Religión',body:D('M50 4L90 74H10Z')+D('M50 96L10 26H90Z')},
 star5:{name:'Estrella de 5 puntas',cat:'Religión',body:star(50,52,5,46,19)},
 heart:{name:'Corazón',cat:'Religión',body:D('M50 92C20 68 6 52 10 32C14 16 34 12 50 28C66 12 86 16 90 32C94 52 80 68 50 92Z')},
 /* Armas y objetos */
 /* Naturaleza */
 roundel:{name:'Roel',cat:'Naturaleza',body:C(50,50,42)},
 lozenge:{name:'Losange',cat:'Naturaleza',body:D('M50 4L86 50L50 96L14 50Z')},
 /* Brisuras: el lambel se coloca como figura sobre el jefe y se escala al ancho del campo */
 lambel3:{name:'Lambel de tres pendientes',cat:'Brisuras',body:D('M4 36H96V46H4Z')+D('M10 46H22V68H10Z')+D('M44 46H56V68H44Z')+D('M78 46H90V68H78Z')},
 lambel5:{name:'Lambel de cinco pendientes',cat:'Brisuras',body:D('M4 36H96V46H4Z')+[6,27,46,65,84].map(x=>D(`M${x} 46H${x+10}V68H${x}Z`)).join('')},
 /* Cruces, Religión, Naturaleza y Armas y objetos: desde 2026-10-07 las figuras dibujadas son ilustraciones de Commons en figuras.js
    (carga diferida, categorías en LAZY_CATS). Aquí solo quedan las de geometría pura: estrellas, corazón, roel, losange y los emblemas islámicos. */
 /* Islam medieval (al-Ándalus, cruzadas): emblemas geométricos dibujados a mano; la caligrafía y las águilas detalladas van en figuras.js (carga diferida) */
 selloSalomon:{name:'Sello de Salomón (hexagrama entrelazado)',cat:'Islam medieval',body:(()=>{const tri=(R,rot)=>[0,1,2].map(i=>{const a=(-90+rot+120*i)*Math.PI/180;return f(50+R*Math.cos(a))+' '+f(50+R*Math.sin(a));});const band=rot=>EO('M'+tri(46,rot).join('L')+'Z M'+tri(33,rot).join('L')+'Z');return band(0)+band(180);})()},
 estrellaOcho:{name:'Estrella de ocho puntas (dos cuadrados)',cat:'Islam medieval',body:EO('M50 6L94 50L50 94L6 50Z M50 19L81 50L50 81L19 50Z')+'<g transform="rotate(45 50 50)">'+EO('M50 6L94 50L50 94L6 50Z M50 19L81 50L50 81L19 50Z')+'</g>'},
 copaMameluca:{name:'Copa (blasón mameluco del copero)',cat:'Islam medieval',body:D('M20 24H80C80 46 69 60 56 64V76H70V84H30V76H44V64C31 60 20 46 20 24Z')+D('M24 30H76V34H24Z',' fill="__S2__"')},
 mazasPolo:{name:'Mazas de polo (blasón mameluco)',cat:'Islam medieval',body:mirror(cap(30,92,64,14,5)+cap(64,14,80,24,7))},
 espadaMameluca:{name:'Espada (blasón mameluco)',cat:'Islam medieval',body:D('M6 50L18 42H70V58H18Z')+D('M70 36H78V64H70Z')+D('M78 45H90V55H78Z')+C(94,50,5)},
 estuchePlumas:{name:'Estuche de plumas (blasón mameluco del secretario)',cat:'Islam medieval',body:D('M8 38H92V62H8Z')+D('M8 38H30V62H8Z',' fill="__S2__"')+D('M40 44H48V56H40Z',' fill="__S2__"')+D('M56 44H64V56H56Z',' fill="__S2__"')+D('M72 44H80V56H72Z',' fill="__S2__"')},
 arcoMameluco:{name:'Arco (blasón mameluco del arquero)',cat:'Islam medieval',body:D('M30 8C70 20 70 80 30 92L34 86C62 76 62 24 34 14Z')+D('M30 8L30 92L27 92L27 8Z')+D('M27 48H78L84 50L78 52H27Z')+D('M78 46L92 50L78 54Z',' fill="__S2__"')},
 servilletaMameluca:{name:'Servilleta (blasón mameluco del maestro de vestuario)',cat:'Islam medieval',body:D('M50 6L94 50L50 94L6 50Z')+D('M50 30L70 50L50 70L30 50Z',' fill="__S2__"')+D('M50 6L58 14L50 22L42 14Z',' fill="__S2__"')+D('M50 78L58 86L50 94L42 86Z',' fill="__S2__"')},
 /* Órdenes militares: las 13 cruces se generan en js/03b-ordenes-militares.js (tools/build_orders.js) */
};
/* Las figuras detalladas (figuras.js, ~2 MB) se cargan bajo demanda: al abrir la categoría Animales, al cargar un
   diseño que las use, al aplicar una plantilla o al generar un blasón aleatorio. Mientras tanto la app arranca ligera. */
/* Figuras detalladas en archivos por categoría (figuras/<parte>.js, índice en js/03c). Cada parte se carga una sola vez, al abrir su
   categoría en el selector o al necesitarla un diseño; figuresLoaded indica que están todas (generador aleatorio). */
const loadedParts=new Set(),partPromises={};let figuresLoaded=false,figuresRerender=false;
if(window.SYMBOLS_DETAILED){Object.assign(SYMBOLS,window.SYMBOLS_DETAILED);FIGURE_PARTS.forEach(p=>loadedParts.add(p));figuresLoaded=true;}
function loadPart(part){
 if(loadedParts.has(part))return Promise.resolve();
 if(partPromises[part])return partPromises[part];
 partPromises[part]=new Promise((res,rej)=>{const s=document.createElement('script');s.src='figuras/'+part+'.js';s.onload=()=>{Object.assign(SYMBOLS,(window.SYMBOLS_PARTS||{})[part]||{});loadedParts.add(part);if(FIGURE_PARTS.every(p=>loadedParts.has(p)))figuresLoaded=true;res();};s.onerror=()=>{delete partPromises[part];rej(new Error('No se pudieron cargar las figuras ('+part+')'));};document.head.appendChild(s);});
 return partPromises[part];
}
const partsFor=st=>[...new Set((st&&st.layers||[]).filter(l=>l.type==='symbol'&&!SYMBOLS[l.symbol]&&FIGURE_PART[l.symbol]).map(l=>FIGURE_PART[l.symbol]))];
function ensureFigures(what){
 let parts;
 if(what===undefined||what===null)parts=FIGURE_PARTS;
 else if(typeof what==='string')parts=[FIGURE_PART_OF_CAT[what]||what];
 else if(Array.isArray(what))parts=what;
 else parts=partsFor(what);
 return Promise.all(parts.filter(p=>FIGURE_PARTS.includes(p)).map(loadPart)).then(()=>{});
}
const catLoaded=cat=>!FIGURE_PART_OF_CAT[cat]||loadedParts.has(FIGURE_PART_OF_CAT[cat]);
const needsFigures=st=>partsFor(st).length>0;
