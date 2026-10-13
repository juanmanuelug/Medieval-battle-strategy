'use strict';
/* ---------- Catálogo de patrones (particiones y piezas heráldicas) ----------
   Un patrón de partición define sus regiones como formas: regions(w,h,n,sd) → [{d, bb:[x,y,w,h]}].
   Cada región del campo lleva un color o un sub-campo anidado {pattern,count,regions} que se dibuja recortado a la región.
   Los patrones de textura (leaf) solo admiten colores. cc(c,i) devuelve el color i, alternando los dos primeros si falta. */
const cc=(c,i)=>c[i]??c[i%2]??'#888888';
const seq=(prefix,n)=>Array.from({length:n},(_,i)=>`${prefix} ${i+1}`);
const two=(a,b)=>()=>[a,b];
const R=(x,y,w,h,fill)=>`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
const rectD=(x,y,w,h)=>`M${f(x)} ${f(y)}H${f(x+w)}V${f(y+h)}H${f(x)}Z`;
const rectR=(x,y,w,h)=>({d:rectD(x,y,w,h),bb:[x,y,w,h]});
const polyR=pts=>{const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const x0=Math.min(...xs),y0=Math.min(...ys);return {d:'M'+pts.map(p=>f(p[0])+' '+f(p[1])).join('L')+'Z',bb:[x0,y0,Math.max(...xs)-x0,Math.max(...ys)-y0]};};
const multiR=regs=>{const x0=Math.min(...regs.map(r=>r.bb[0])),y0=Math.min(...regs.map(r=>r.bb[1])),x1=Math.max(...regs.map(r=>r.bb[0]+r.bb[2])),y1=Math.max(...regs.map(r=>r.bb[1]+r.bb[3]));return {d:regs.map(r=>r.d).join(''),bb:[x0,y0,x1-x0,y1-y0]};};
// Banda entre dos puntos con grosor t, prolongada ext por cada extremo (la recorta la silueta).
const bandPts=(x1,y1,x2,y2,t,ext)=>{const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy*t/2,ny=ux*t/2;const ax=x1-ux*ext,ay=y1-uy*ext,bx=x2+ux*ext,by=y2+uy*ext;return [[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]];};
/* Líneas de partición. Cada arista interior de una región puede ir decorada; la decoración se calcula siempre en la
   orientación canónica del segmento (izquierda→derecha, o arriba→abajo si es vertical) para que las dos regiones que
   comparten la arista encajen exactamente. */
const LINES={straight:{name:'Recta'},wavy:{name:'Ondada'},indented:{name:'Dentada'},embattled:{name:'Almenada'},engrailed:{name:'Engrelada'},invected:{name:'Invectada'}};
function decoratedPoints(a,b,line){
 const style=line&&line.style;if(!style||style==='straight'||!LINES[style])return [a,b];
 let p=a,q=b,flip=false;if(b[0]<a[0]-1e-6||(Math.abs(b[0]-a[0])<=1e-6&&b[1]<a[1])){p=b;q=a;flip=true;}
 const dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1;const ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
 const amp=line.amp||10;const n=Math.max(1,Math.round(L/(amp*3.2)));
 const pts=[];const push=(t,o)=>pts.push([p[0]+ux*t*L+nx*o,p[1]+uy*t*L+ny*o]);
 push(0,0);
 if(style==='wavy'){const steps=n*12;for(let k=1;k<steps;k++){const t=k/steps;push(t,amp*Math.sin(2*Math.PI*n*t));}}
 else if(style==='indented'){const m=2*n;for(let k=0;k<m;k++)push((2*k+1)/(2*m),k%2?-amp:amp);}
 else if(style==='embattled'){const m=2*n;for(let k=0;k<m;k++){const o=k%2?-amp:amp;push(k/m,o);push((k+1)/m,o);}}
 else if(style==='engrailed'||style==='invected'){const sgn=style==='engrailed'?1:-1;const steps=n*10;for(let k=1;k<steps;k++){const t=k/steps;push(t,sgn*amp*Math.sin(Math.PI*((t*n)%1)));}}
 push(1,0);
 return flip?pts.reverse():pts;
}
// Región poligonal: pts vértices, deco índices de las aristas (de i a i+1) que llevan la línea de partición.
function regionP(pts,deco,line){
 const bb=polyR(pts).bb;
 if(!line||!line.style||line.style==='straight'||!deco||!deco.length)return {d:polyR(pts).d,bb};
 let d='';const all=[];
 for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];const seg=deco.includes(i)?decoratedPoints(a,b,line):[a,b];for(let k=(i===0?0:1);k<seg.length;k++){d+=(d?'L':'M')+f(seg[k][0])+' '+f(seg[k][1]);all.push(seg[k]);}}
 // La caja incluye las ondas que sobresalen del polígono base, para que un sub-campo cubra toda la región.
 return {d:d+'Z',bb:polyR(all).bb};
}
const bandR=(x1,y1,x2,y2,t,ext)=>polyR(bandPts(x1,y1,x2,y2,t,ext));
const stripesPattern=(w,c,n,id,angle)=>{const S=f(2*w/n);return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${S}" height="${S}" patternTransform="rotate(${angle})"><rect width="${S}" height="${S}" fill="${cc(c,0)}"/><rect width="${f(S/2)}" height="${S}" fill="${cc(c,1)}"/></pattern></defs>`};
/* Sembrados: la figura se repite al tresbolillo con un <pattern>; cada motivo se dibuja en una caja de 40×40 centrada en 0,0 */
const SEME_MOTIFS={
 fleur:'<path d="M0 -19C-3.5 -13 -3.5 -7 0 -1C3.5 -7 3.5 -13 0 -19Z"/><path d="M-2 -1C-7 -9 -16 -9 -18 -3C-20 3 -12 5 -3.5 2Z"/><path d="M2 -1C7 -9 16 -9 18 -3C20 3 12 5 3.5 2Z"/><path d="M-8 2H8V5.5H-8Z"/><path d="M-3.5 5.5H3.5L2.5 16H-2.5Z"/><path d="M-5 6C-10 8 -13 14 -9 17C-5 18 -4 12 -4 6Z"/><path d="M5 6C10 8 13 14 9 17C5 18 4 12 4 6Z"/>',
 star:'<polygon points="0,-18 4.9,-6.6 17.1,-5.6 7.9,2.5 10.6,14.6 0,8.2 -10.6,14.6 -7.9,2.5 -17.1,-5.6 -4.9,-6.6"/>',
 crosslet:'<path d="M-2.5 -17H2.5V-12H6.5V-7.5H2.5V-2.5H7.5V-6.5H12V-1.5H17V2.5H12V6.5H7.5V2.5H2.5V7.5H6.5V12H2.5V17H-2.5V12H-6.5V7.5H-2.5V2.5H-7.5V6.5H-12V2.5H-17V-1.5H-12V-6.5H-7.5V-2.5H-2.5V-7.5H-6.5V-12H-2.5Z"/>',
 billet:'<rect x="-6" y="-10" width="12" height="20"/>',
 heart:'<path d="M0 15C-15 4 -15 -9 -7.5 -11C-3.5 -12 0 -9 0 -5C0 -9 3.5 -12 7.5 -11C15 -9 15 4 0 15Z"/>',
 bezant:'<circle r="9"/>',
};
function semePattern(w,h,c,n,id,motif){
 const sz=w/n,th=sz*1.15,k=sz*0.62/40;
 const m=(x,y)=>`<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)})">${SEME_MOTIFS[motif]}</g>`;
 return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(sz)}" height="${f(th)}"><rect width="${f(sz)}" height="${f(th)}" fill="${cc(c,0)}"/><g fill="${cc(c,1)}">${m(sz/2,th/4)}${m(0,th*3/4)}${m(sz,th*3/4)}</g></pattern></defs>`+R(0,0,w,h,`url(#${id})`);
}
const seme=(name,motif,slot)=>({name,leaf:true,usesCount:true,thumbN:3,slots:two('Campo',slot),draw:(w,h,c,n,sd,id)=>semePattern(w,h,c,n,id,motif)});
const PATTERNS={
 plain:{name:'Liso',noLine:true,slots:()=>['Campo'],regions:(w,h)=>[rectR(0,0,w,h)]},
 perPale:{name:'Partido',slots:two('Izquierda','Derecha'),regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w/2,0],[w/2,h],[0,h]],[1],ln),regionP([[w/2,0],[w,0],[w,h],[w/2,h]],[3],ln)]},
 perFess:{name:'Cortado',slots:two('Arriba','Abajo'),regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w,0],[w,h/2],[0,h/2]],[2],ln),regionP([[0,h/2],[w,h/2],[w,h],[0,h]],[0],ln)]},
 quarterly:{name:'Cuartelado',slots:()=>['Cuartel 1 ↖','Cuartel 2 ↗','Cuartel 3 ↙','Cuartel 4 ↘'],defaults:c=>[c[0],c[1],c[1],c[0]],regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w/2,0],[w/2,h/2],[0,h/2]],[1,2],ln),regionP([[w/2,0],[w,0],[w,h/2],[w/2,h/2]],[2,3],ln),regionP([[0,h/2],[w/2,h/2],[w/2,h],[0,h]],[0,1],ln),regionP([[w/2,h/2],[w,h/2],[w,h],[w/2,h]],[0,3],ln)]},
 perBend:{name:'Tronchado',slots:two('Arriba izq. ↖','Abajo der. ↘'),regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w,0],[0,h]],[1],ln),regionP([[w,0],[w,h],[0,h]],[2],ln)]},
 perBendSin:{name:'Tajado',slots:two('Arriba der. ↗','Abajo izq. ↙'),regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w,0],[w,h]],[2],ln),regionP([[0,0],[w,h],[0,h]],[0],ln)]},
 perSaltire:{name:'Flanqueado',slots:()=>['Arriba','Derecha','Abajo','Izquierda'],regions:(w,h,n,sd,ln)=>{const c=[w/2,h/2];return [regionP([[0,0],[w,0],c],[1,2],ln),regionP([[w,0],[w,h],c],[1,2],ln),regionP([[w,h],[0,h],c],[1,2],ln),regionP([[0,h],[0,0],c],[1,2],ln)];}},
 perChevron:{name:'Mantelado',slots:two('Arriba','Abajo'),regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w,0],[w,h*0.75],[w/2,h*0.42],[0,h*0.75]],[2,3],ln),regionP([[0,h*0.75],[w/2,h*0.42],[w,h*0.75],[w,h],[0,h]],[0,1],ln)]},
 gyronny:{name:'Gironado',slots:()=>seq('Girón',8),regions:(w,h,n,sd,ln)=>{const c=[w/2,h/2];const pts=[[0,0],[c[0],0],[w,0],[w,c[1]],[w,h],[c[0],h],[0,h],[0,c[1]],[0,0]];return pts.slice(0,8).map((a,i)=>regionP([c,a,pts[i+1]],[0,2],ln));}},
 tiercedPale:{name:'Terciado en palo',slots:()=>['Izquierda','Centro','Derecha'],defaults:c=>[c[0],c[1],c.find((x,i)=>i>=2&&x!==c[0]&&x!==c[1])??'#1f4e9a'],regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w/3,0],[w/3,h],[0,h]],[1],ln),regionP([[w/3,0],[2*w/3,0],[2*w/3,h],[w/3,h]],[1,3],ln),regionP([[2*w/3,0],[w,0],[w,h],[2*w/3,h]],[3],ln)]},
 tiercedFess:{name:'Terciado en faja',slots:()=>['Arriba','Centro','Abajo'],defaults:c=>[c[0],c[1],c.find((x,i)=>i>=2&&x!==c[0]&&x!==c[1])??'#1f4e9a'],regions:(w,h,n,sd,ln)=>[regionP([[0,0],[w,0],[w,h/3],[0,h/3]],[2],ln),regionP([[0,h/3],[w,h/3],[w,2*h/3],[0,2*h/3]],[0,2],ln),regionP([[0,2*h/3],[w,2*h/3],[w,h],[0,h]],[0],ln)]},
 paly:{name:'Palado',usesCount:true,thumbN:6,slots:n=>seq('Palo',n),regions:(w,h,n,sd,ln)=>{const ov=ln&&ln.style!=='straight'?0:0.5;return Array.from({length:n},(_,i)=>regionP([[i*w/n,0],[(i+1)*w/n+ov,0],[(i+1)*w/n+ov,h],[i*w/n,h]],[...(i<n-1?[1]:[]),...(i>0?[3]:[])],ln));}},
 barry:{name:'Fajado',usesCount:true,thumbN:6,slots:n=>seq('Faja',n),regions:(w,h,n,sd,ln)=>{const ov=ln&&ln.style!=='straight'?0:0.5;return Array.from({length:n},(_,i)=>regionP([[0,i*h/n],[w,i*h/n],[w,(i+1)*h/n+ov],[0,(i+1)*h/n+ov]],[...(i>0?[0]:[]),...(i<n-1?[2]:[])],ln));}},
 pale:{name:'Palo',slots:two('Campo','Palo'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP([[w/3,0],[2*w/3,0],[2*w/3,h],[w/3,h]],[1,3],ln)]},
 fess:{name:'Faja',slots:two('Campo','Faja'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP([[0,h/3],[w,h/3],[w,2*h/3],[0,2*h/3]],[0,2],ln)]},
 chief:{name:'Jefe',slots:two('Campo','Jefe'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP([[0,0],[w,0],[w,h/4],[0,h/4]],[2],ln)]},
 base:{name:'Campaña',slots:two('Campo','Campaña'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP([[0,h*3/4],[w,h*3/4],[w,h],[0,h]],[0],ln)]},
 bend:{name:'Banda',slots:two('Campo','Banda'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP(bandPts(0,0,w,h,Math.min(w,h)/3.5,Math.min(w,h)),[0,2],ln)]},
 bendSin:{name:'Barra',slots:two('Campo','Barra'),regions:(w,h,n,sd,ln)=>[rectR(0,0,w,h),regionP(bandPts(w,0,0,h,Math.min(w,h)/3.5,Math.min(w,h)),[0,2],ln)]},
 cross:{name:'Cruz',slots:two('Campo','Cruz'),regions:(w,h,n,sd,ln)=>{const a=Math.min(w,h)/4;return [rectR(0,0,w,h),multiR([regionP([[w/2-a/2,0],[w/2+a/2,0],[w/2+a/2,h],[w/2-a/2,h]],[1,3],ln),regionP([[0,h/2-a/2],[w,h/2-a/2],[w,h/2+a/2],[0,h/2+a/2]],[0,2],ln)])];}},
 saltire:{name:'Sotuer (aspa)',slots:two('Campo','Sotuer'),regions:(w,h,n,sd,ln)=>{const t=Math.min(w,h)/4;return [rectR(0,0,w,h),multiR([regionP(bandPts(0,0,w,h,t,t),[0,2],ln),regionP(bandPts(w,0,0,h,t,t),[0,2],ln)])];}},
 chevron:{name:'Cabrio',slots:two('Campo','Cabrio'),regions:(w,h,n,sd,ln)=>{const t=Math.min(w,h)/5,ang=Math.atan2(h*0.30,w/2),tv=t/2/Math.cos(ang),ex=w*0.1,ey=ex*Math.tan(ang);const A=[0,h*0.72],B=[w/2,h*0.42],C=[w,h*0.72];return [rectR(0,0,w,h),regionP([[A[0]-ex,A[1]+ey-tv],[B[0],B[1]-tv],[C[0]+ex,C[1]+ey-tv],[C[0]+ex,C[1]+ey+tv],[B[0],B[1]+tv],[A[0]-ex,A[1]+ey+tv]],[0,1,3,4],ln)];}},
 semeFleurs:seme('Sembrado de flores de lis','fleur','Flores de lis'),
 semeStars:seme('Sembrado de estrellas','star','Estrellas'),
 semeCrosslets:seme('Sembrado de crucetas','crosslet','Crucetas'),
 semeBillets:seme('Billeteado','billet','Billetes'),
 semeHearts:seme('Sembrado de corazones','heart','Corazones'),
 semeBezants:seme('Bezanteado','bezant','Bezantes'),
 bordure:{name:'Bordura',noLine:true,slots:two('Campo','Bordura'),regions:(w,h,n,sd)=>[rectR(0,0,w,h),{d:sd,bb:[0,0,w,h],stroke:Math.min(w,h)/6,noSub:true}]},
 // Componada: la misma bordura dos veces, la segunda a trazos (pathLength normaliza el perímetro: 2·count compones de cada esmalte)
 bordureCompony:{name:'Bordura componada',noLine:true,usesCount:true,thumbN:4,slots:()=>['Campo','Compón A','Compón B'],regions:(w,h,n,sd)=>[rectR(0,0,w,h),{d:sd,bb:[0,0,w,h],stroke:Math.min(w,h)/6,noSub:true},{d:sd,bb:[0,0,w,h],stroke:Math.min(w,h)/6,noSub:true,dash:2*n}]},
 /* Texturas: solo colores */
 bendy:{name:'Bandado',leaf:true,usesCount:true,thumbN:4,slots:two('Campo','Bandas'),draw:(w,h,c,n,sd,id)=>stripesPattern(w,c,n,id,-45)+R(0,0,w,h,`url(#${id})`)},
 bendySin:{name:'Barrado',leaf:true,usesCount:true,thumbN:4,slots:two('Campo','Barras'),draw:(w,h,c,n,sd,id)=>stripesPattern(w,c,n,id,45)+R(0,0,w,h,`url(#${id})`)},
 checky:{name:'Ajedrezado',leaf:true,usesCount:true,thumbN:6,slots:two('Casilla A','Casilla B'),draw:(w,h,c,n)=>{let s=R(0,0,w,h,cc(c,0));const sz=w/n;const rows=Math.ceil(h/sz);for(let r=0;r<rows;r++)for(let col=0;col<n;col++)if((r+col)%2)s+=R(col*sz,r*sz,sz,sz,cc(c,1));return s;}},
 lozengy:{name:'Losanjado',leaf:true,usesCount:true,thumbN:4,slots:two('Campo','Losanges'),draw:(w,h,c,n,sd,id)=>{const sz=w/n;return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(sz)}" height="${f(sz*1.5)}"><rect width="${f(sz)}" height="${f(sz*1.5)}" fill="${cc(c,0)}"/><path d="M${f(sz/2)} 0L${f(sz)} ${f(sz*0.75)}L${f(sz/2)} ${f(sz*1.5)}L0 ${f(sz*0.75)}Z" fill="${cc(c,1)}"/></pattern></defs>`+R(0,0,w,h,`url(#${id})`);}},
 ermine:{name:'Armiños',leaf:true,usesCount:true,thumbN:3,slots:two('Campo','Armiños'),draw:(w,h,c,n,sd,id)=>{const sz=w/n,th=sz*1.6,k=sz/40;const spot=(x,y)=>`<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)})" fill="${cc(c,1)}"><path d="M0 10C6 16 7 24 0 32C-7 24 -6 16 0 10Z"/><circle cx="0" cy="3" r="2.6"/><circle cx="-5.5" cy="7" r="2.6"/><circle cx="5.5" cy="7" r="2.6"/></g>`;return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(sz)}" height="${f(th)}"><rect width="${f(sz)}" height="${f(th)}" fill="${cc(c,0)}"/>${spot(sz/2,0)}${spot(0,th/2)}${spot(sz,th/2)}</pattern></defs>`+R(0,0,w,h,`url(#${id})`);}},
};
// Color representativo de una región (si es un sub-campo, el de su primera región).
const regionColor=spec=>typeof spec==='string'?spec:(spec&&spec.regions?regionColor(spec.regions[0]):'#888888');
const nodeColors=node=>(node.regions||[]).map(regionColor);
// Dibuja un campo (patrón + regiones) en una caja w×h; sd es la silueta (para la bordura); idp prefija los ids.
function drawField(node,w,h,sd,idp,depth,sdx,sdy){
 depth=depth||0;const p=PATTERNS[node.pattern]||PATTERNS.plain;const colors=nodeColors(node);const n=node.count||6;
 if(p.leaf)return p.draw(w,h,colors,n,sd,idp+'-pat');
 let s='';
 const ln=node.line&&node.line.style&&node.line.style!=='straight'?{style:node.line.style,amp:Math.min(w,h)/24*(node.line.size||1)}:null;
 p.regions(w,h,n,sd,ln).forEach((r,i)=>{
  const spec=node.regions[i];
  if(r.stroke){s+=`<path d="${r.d}" fill="none" stroke="${cc(colors,i)}" stroke-width="${f(r.stroke)}"${r.dash?` pathLength="${2*r.dash}" stroke-dasharray="1 1"`:''}${sdx||sdy?` transform="translate(${f(sdx||0)} ${f(sdy||0)})"`:''}/>`;return;}
  if(spec&&typeof spec==='object'&&!r.noSub&&depth<4){
   const [bx,by,bw,bh]=r.bb;const cid=idp+'-r'+i;
   s+=`<clipPath id="${cid}"><path d="${r.d}"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(${f(bx)} ${f(by)})">${drawField(spec,bw,bh,rectD(0,0,bw,bh),cid,depth+1)}</g></g>`;
  }else s+=`<path d="${r.d}" fill="${cc(colors,i)}"/>`;
 });
 return s;
}

const TINCTURES=[['Oro','#d9a92c'],['Plata','#e8e4d8'],['Gules','#b3202c'],['Azur','#1f4e9a'],['Sinople','#2d7a3a'],['Sable','#1c1a19'],['Púrpura','#6b2d6e'],['Naranja','#c8702a'],['Sanguíneo','#7a1a1f'],['Marrón','#5a3a21']];

const FONTS=[
 {name:'UnifrakturMaguntia',weights:[400]},
 {name:'UnifrakturCook',weights:[700]},
 {name:'Grenze Gotisch',weights:[400,700]},
 {name:'Pirata One',weights:[400]},
 {name:'New Rocker',weights:[400]},
 {name:'MedievalSharp',weights:[400]},
 {name:'Metamorphous',weights:[400]},
 {name:'Uncial Antiqua',weights:[400]},
 {name:'Almendra',weights:[400,700]},
 {name:'IM Fell English SC',weights:[400]},
 {name:'Cinzel',weights:[400,700]},
 {name:'Cinzel Decorative',weights:[400,700]},
 /* Alfabeto árabe (OFL, locales en fonts/): cúfica, naskh clásica, naskh, ruqaa y una cúfica decorativa */
 {name:'Reem Kufi',weights:[400,700],arabic:true},
 {name:'Amiri',weights:[400,700],arabic:true},
 {name:'Scheherazade New',weights:[400,700],arabic:true},
 {name:'Aref Ruqaa',weights:[400,700],arabic:true},
 {name:'Katibeh',weights:[400],arabic:true},
];
