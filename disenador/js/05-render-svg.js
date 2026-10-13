'use strict';
/* ---------- Render SVG ---------- */
const svg=$('#canvas');
let ccInfo=null; // regiones hoja del campo y sus dos esmaltes principales, para las figuras contracambiadas
// Recorre el campo y devuelve sus regiones hoja: {d, tx, ty, color, parent?}. Las de un sub-campo llevan además la región madre.
function collectLeafRegions(node,w,h,sd,tx,ty,out){
 const p=PATTERNS[node.pattern]||PATTERNS.plain;
 const colors=nodeColors(node);
 if(p.leaf||!p.regions){out.push({d:sd,tx,ty,color:cc(colors,0)});return out;}
 const nl=node.line;const ln=nl&&nl.style&&nl.style!=='straight'?{style:nl.style,amp:Math.min(w,h)/24*(nl.size||1)}:null;
 p.regions(w,h,node.count||6,sd,ln).forEach((r,i)=>{
  if(r.stroke)return;const spec=node.regions[i];
  if(spec&&typeof spec==='object'&&!r.noSub){const [bx,by,bw,bh]=r.bb;const sub=collectLeafRegions(spec,bw,bh,rectD(0,0,bw,bh),tx+bx,ty+by,[]);sub.forEach(s=>out.push({d:s.d,tx:s.tx,ty:s.ty,color:s.color,parent:s.parent||{d:r.d,tx,ty}}));}
  else out.push({d:r.d,tx,ty,color:spec==null?cc(colors,i):regionColor(spec)});
 });
 return out;
}
// Esmalte que toma la figura sobre una zona de color c: el otro de los dos principales; si c no es ninguno, el que contraste.
const lum=x=>{const n=parseInt(String(x).slice(1,7),16)||0;return 0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255);};
function counterColor(c,A,B){if(c===A)return B;if(c===B)return A;return Math.abs(lum(A)-lum(c))>=Math.abs(lum(B)-lum(c))?A:B;}
const layerTransform=l=>`translate(${f(l.x)} ${f(l.y)}) rotate(${f(l.rotation)}) scale(${f(l.scale*(l.flipX?-1:1))} ${f(l.scale)})`;

function layerMarkup(l){
 if(l.visible===false)return'';
 let inner;
 if(l.type==='image'){
  inner=`<image href="${l.src}" x="${f(-l.w/2)}" y="${f(-l.h/2)}" width="${f(l.w)}" height="${f(l.h)}"/>`;
 }else if(l.type==='symbol'){
  const sym=SYMBOLS[l.symbol];
  if(!sym&&FIGURE_PART[l.symbol]&&!loadedParts.has(FIGURE_PART[l.symbol])){if(!figuresRerender){figuresRerender=true;ensureFigures([FIGURE_PART[l.symbol]]).then(()=>{figuresRerender=false;render();renderLayerList();renderProps();}).catch(()=>{figuresRerender=false;});}return '';}
  if(l.counter&&ccInfo&&sym){
   let parts='';
   ccInfo.leaves.forEach((r,i)=>{const opp=counterColor(r.color,ccInfo.A,ccInfo.B);const cid=`${ccInfo.idp}-cc-${l.id}-${i}`;
    const body=`<g clip-path="url(#${cid})"><g class="layer-xf" data-id="${l.id}" transform="${layerTransform(l)}" opacity="${l.opacity??1}"><g class="sym">${symbolMarkup(sym,opp,l.stroke,l.strokeWidth,l.fill2)}</g></g></g>`;
    parts+=`<clipPath id="${cid}"><path d="${r.d}" transform="translate(${f(r.tx)} ${f(r.ty)})"/></clipPath>`;
    if(r.parent){parts+=`<clipPath id="${cid}p"><path d="${r.parent.d}" transform="translate(${f(r.parent.tx)} ${f(r.parent.ty)})"/></clipPath><g clip-path="url(#${cid}p)">${body}</g>`;}else parts+=body;
   });
   const clipAttr=l.clip!==false?` clip-path="url(#clip)"`:'';
   return `<g class="layer" data-id="${l.id}"${clipAttr}>${parts}</g>`;
  }
  inner=`<g class="sym">${sym?symbolMarkup(sym,l.fill,l.stroke,l.strokeWidth,l.fill2):''}</g>`;
 }else{
  const font=FONTS.find(x=>x.name===l.font)||FONTS[0];
  const weight=(l.bold&&font.weights.includes(700))?700:font.weights[0];
  const style=`font-family:'${l.font}',serif;font-size:${f(l.size)}px;font-weight:${weight};letter-spacing:${f(l.letterSpacing||0)}px${/[\u0600-\u06FF]/.test(String(l.text))?';direction:rtl':''}`;
  const attrs=`fill="${l.fill}" stroke="${l.stroke}" stroke-width="${f(l.strokeWidth)}" paint-order="stroke" stroke-linejoin="round" text-anchor="middle" dominant-baseline="middle" style="${style}"`;
  const lines=String(l.text).split('\n');const lh=l.size*1.15;const pid=`tp-${l.id}`;
  if(l.textPath==='edge'){
   let defs='',texts='';
   lines.forEach((ln,k)=>{const ep=edgeTextPath(l,k*lh);if(!ep)return;const id=pid+'-'+k;defs+=`<path id="${id}" d="${ep.d}"/>`;texts+=`<text ${attrs}><textPath href="#${id}" startOffset="${f(ep.offset)}">${esc(ln)}</textPath></text>`;});
   inner=`<defs>${defs}</defs><g class="txt">${texts||'<text '+attrs+'></text>'}</g>`;
  }else if(!l.curve){
   inner=`<text ${attrs}>${lines.map((ln,k)=>`<tspan x="0" dy="${k?f(lh):f(-(lines.length-1)*lh/2)}">${esc(ln)||' '}</tspan>`).join('')}</text>`;
  }else{
   const r0=14000/Math.abs(l.curve);let defs='',texts='';
   lines.forEach((ln,k)=>{const rk=Math.max(10,l.curve>0?r0-k*lh:r0+k*lh);const id=pid+'-'+k;
    const d=l.curve>0?`M${f(-rk)} ${f(r0)}A${f(rk)} ${f(rk)} 0 0 1 ${f(rk)} ${f(r0)}`:`M${f(-rk)} ${f(-r0)}A${f(rk)} ${f(rk)} 0 0 0 ${f(rk)} ${f(-r0)}`;
    defs+=`<path id="${id}" d="${d}"/>`;texts+=`<text ${attrs}><textPath href="#${id}" startOffset="50%">${esc(ln)}</textPath></text>`;});
   inner=`<defs>${defs}</defs><g class="txt">${texts}</g>`;
  }
 }
 const clipAttr=l.clip!==false?` clip-path="url(#clip)"`:'';
 return `<g class="layer" data-id="${l.id}"${clipAttr}><g class="layer-xf" data-id="${l.id}" transform="${layerTransform(l)}" opacity="${l.opacity??1}">${inner}</g></g>`;
}

/* Texto siguiendo el borde: la silueta se parsea (M L H V C Q A Z absolutos), se reduce hacia su centro para dejar margen,
   se invierte el sentido (la silueta va en horario; invertida, el borde inferior se lee de izquierda a derecha) y se mide
   la posición del punto inferior central para centrar ahí el texto. */
function parseAbsPath(d){
 const tok=d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)||[];const segs=[];let i=0,cmd=null,cur=[0,0],start=[0,0];
 const n=()=>+tok[i++];
 while(i<tok.length){
  if(/^[A-Za-z]$/.test(tok[i]))cmd=tok[i++];
  switch(cmd){
   case 'M':cur=[n(),n()];start=cur;cmd='L';break;
   case 'L':{const to=[n(),n()];segs.push({c:'L',from:cur,to});cur=to;break;}
   case 'H':{const to=[n(),cur[1]];segs.push({c:'L',from:cur,to});cur=to;break;}
   case 'V':{const to=[cur[0],n()];segs.push({c:'L',from:cur,to});cur=to;break;}
   case 'C':{const c1=[n(),n()],c2=[n(),n()],to=[n(),n()];segs.push({c:'C',from:cur,c1,c2,to});cur=to;break;}
   case 'Q':{const c1=[n(),n()],to=[n(),n()];segs.push({c:'Q',from:cur,c1,to});cur=to;break;}
   case 'A':{const rx=n(),ry=n(),rot=n(),large=n(),sweep=n(),to=[n(),n()];segs.push({c:'A',from:cur,rx,ry,rot,large,sweep,to});cur=to;break;}
   case 'Z':case 'z':if(cur[0]!==start[0]||cur[1]!==start[1])segs.push({c:'L',from:cur,to:start});cur=start;cmd=null;break;
   default:return null;
  }
 }
 return segs;
}
const edgeCache={};
function edgeTextPath(l,extraInset){
 const w=state.width,h=state.height,sh=SHAPES[state.shape];
 const inset=(+l.edgeInset||0)+l.size*0.8+state.outline.width/2+(extraInset||0);
 const key=[state.shape,w,h,f(inset)].join('|');if(edgeCache[key])return edgeCache[key];
 const segs=parseAbsPath(sh.path(w,h));if(!segs||!segs.length)return null;
 const [cx,cy]=shapeCenter();const s=Math.max(0.05,1-2*inset/Math.min(w,h));
 const T=p=>f((p[0]-cx)*s)+' '+f((p[1]-cy)*s);
 let d='M'+T(segs[segs.length-1].to);
 for(let i=segs.length-1;i>=0;i--){const g=segs[i];
  if(g.c==='L')d+='L'+T(g.from);else if(g.c==='C')d+='C'+T(g.c2)+' '+T(g.c1)+' '+T(g.from);else if(g.c==='Q')d+='Q'+T(g.c1)+' '+T(g.from);
  else d+='A'+f(g.rx*s)+' '+f(g.ry*s)+' '+g.rot+' '+g.large+' '+(1-g.sweep)+' '+T(g.from);}
 const tmp=document.createElementNS('http://www.w3.org/2000/svg','path');tmp.setAttribute('d',d);svg.appendChild(tmp);
 let offset=0;
 try{const L=tmp.getTotalLength();let by=-1e9,bx=1e9;for(let i=0;i<=600;i++){const len=L*i/600;const p=tmp.getPointAtLength(len);if(p.y>by+0.5||(Math.abs(p.y-by)<=0.5&&Math.abs(p.x)<bx)){by=p.y;bx=Math.abs(p.x);offset=len;}}}
 finally{tmp.remove();}
 return edgeCache[key]={d,offset};
}
function poleMarkup(w,h,orient){
 const wood='#5b3a1e',wood2='#8a5a2b',gold='#c9a227';
 if(orient==='v'){
  const y=-26,bar=14;
  let s=`<rect x="-40" y="${y}" width="${w+80}" height="${bar}" rx="6" fill="${wood}"/><rect x="-40" y="${y+2}" width="${w+80}" height="4" rx="2" fill="${wood2}" opacity=".7"/>`;
  s+=`<circle cx="-46" cy="${y+bar/2}" r="12" fill="${gold}"/><circle cx="${w+46}" cy="${y+bar/2}" r="12" fill="${gold}"/>`;
  const n=Math.max(3,Math.round(w/120));const top=y+bar-6;
  for(let i=0;i<n;i++){const x=(i+0.5)*w/n;s+=`<rect x="${f(x-7)}" y="${top}" width="14" height="${6-top}" rx="5" fill="${wood2}"/>`;}
  return s;
 }
 const x=-20;
 let s=`<rect x="${x-8}" y="-70" width="16" height="${h+110}" rx="6" fill="${wood}"/><rect x="${x-6}" y="-70" width="4" height="${h+110}" fill="${wood2}" opacity=".7"/>`;
 s+=`<path d="M${x} -120L${x+14} -76L${x-14} -76Z" fill="${gold}"/><circle cx="${x}" cy="-70" r="9" fill="${gold}"/>`;
 const n=Math.max(3,Math.round(h/120));
 for(let i=0;i<n;i++){const y=(i+0.5)*h/n;s+=`<rect x="${x-6}" y="${f(y-7)}" width="${6-x+6}" height="14" rx="5" fill="${wood2}"/>`;}
 return s;
}

function viewBox(includePole){
 const {width:w,height:h}=state;const orient=SHAPES[state.shape].orient;const fin=state.finish||FINISH_DEFAULT();
 const ow=Math.max(state.outline.width/2+4,fin.fringe.on?fin.fringe.len+6:0,fin.cord.on?fin.cord.width:0);
 let l=ow,t=ow,r=ow,b=ow;
 if(includePole){if(orient==='v'){t=70;l=Math.max(l,62);r=Math.max(r,62);}else{l=Math.max(l,40);t=130;b=Math.max(b,50);}}
 return {x:-l,y:-t,w:w+l+r,h:h+t+b};
}

// Centro visual de la silueta actual: el que declare la forma o, si no, el del rectángulo envolvente.
function shapeCenter(){const s=SHAPES[state.shape];return s.center?s.center(state.width,state.height):[state.width/2,state.height/2];}
function buildInner(live,includePole){
 const {width:w,height:h}=state;const shape=SHAPES[state.shape];const d=shape.path(w,h);
 const idp=live?'live':'exp';
 const showPole=live?state.pole:includePole;
 const vb=viewBox(showPole);
/* Acabado: flecos (bajo el campo) y cordón (sobre el borde) */
 const fin=state.finish||FINISH_DEFAULT();let finDefs='',finUnder='',finCord='';
 if(fin.fringe.on){const L=fin.fringe.len,vert=shape.orient==='v',col=fin.fringe.color;
  // Hebras perpendiculares al borde: verticales en los bordes superior e inferior (y colas), horizontales en los laterales.
  // Se excluye el borde de sujeción: el superior en las colgantes y el del asta en las horizontales.
  const y0=vert?10:-2*L,x0=vert?-2*L:10;
  finDefs+=`<pattern id="${idp}-frv" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="2.6" height="6" fill="${col}"/></pattern><pattern id="${idp}-frh" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="2.6" fill="${col}"/></pattern>`;
  finDefs+=`<clipPath id="${idp}-frcv"><rect x="0" y="${y0}" width="${w}" height="${h+4*L}"/></clipPath><clipPath id="${idp}-frch">${vert?`<rect x="${-2*L}" y="${y0}" width="${2*L}" height="${h+4*L}"/>`:''}<rect x="${w}" y="${y0}" width="${2*L}" height="${h+4*L}"/></clipPath>`;
  finUnder+=`<g clip-path="url(#${idp}-frcv)"><path d="${d}" fill="none" stroke="url(#${idp}-frv)" stroke-width="${2*L}" stroke-linejoin="miter"/></g><g clip-path="url(#${idp}-frch)"><path d="${d}" fill="none" stroke="url(#${idp}-frh)" stroke-width="${2*L}" stroke-linejoin="miter"/></g>`;
  void x0;
 }
 if(fin.cord.on){const cw=fin.cord.width;finCord=`<path d="${d}" fill="none" stroke="${fin.cord.color}" stroke-width="${cw}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fin.cord.color2}" stroke-width="${cw}" stroke-dasharray="${f(cw*1.4)} ${f(cw*1.4)}" stroke-linejoin="round"/>`;}
 let s=`<defs><clipPath id="clip"><path d="${d}"/></clipPath>`+finDefs;
 if(live)s+=`<pattern id="checker" patternUnits="userSpaceOnUse" width="24" height="24"><rect width="24" height="24" fill="#231c17"/><rect width="12" height="12" fill="#2e2620"/><rect x="12" y="12" width="12" height="12" fill="#2e2620"/></pattern>`;
 s+=`</defs>`;
 if(live)s+=`<rect class="bg" x="${f(vb.x)}" y="${f(vb.y)}" width="${f(vb.w)}" height="${f(vb.h)}" fill="url(#checker)"/>`;
 if(showPole)s+=`<g class="pole">${poleMarkup(w,h,shape.orient)}</g>`;
 const [cx,cy]=shapeCenter();const hx=Math.max(cx,w-cx),hy=Math.max(cy,h-cy);const fx=cx-hx,fy=cy-hy;
 s+=finUnder;
 s+=`<g clip-path="url(#clip)"><g transform="translate(${f(fx)} ${f(fy)})">${drawField(state.field,2*hx,2*hy,d,idp+'-f',0,-fx,-fy)}</g></g>`;
 {const leaves=collectLeafRegions(state.field,2*hx,2*hy,rectD(0,0,2*hx,2*hy),fx,fy,[]);const distinct=[...new Set(leaves.map(r=>r.color))];
  ccInfo=distinct.length>=2?{leaves,A:distinct[0],B:distinct[1],idp}:null;}
 s+=state.layers.map(layerMarkup).join('');
 if(state.outline.width>0)s+=`<path d="${d}" fill="none" stroke="${state.outline.color}" stroke-width="${state.outline.width}" stroke-linejoin="round"/>`;
 s+=finCord;
 if(live)s+=`<g id="overlay"></g>`;
 return {s,vb};
}

function render(){
 for(const k in edgeCache)delete edgeCache[k];
 const {s,vb}=buildInner(true);
 svg.setAttribute('viewBox',`${f(vb.x)} ${f(vb.y)} ${f(vb.w)} ${f(vb.h)}`);
 svg.innerHTML=s;
 drawOverlay();
 updateSizeNote();
}

function xformPoint(l,px,py){
 const sx=l.scale*(l.flipX?-1:1),sy=l.scale;const a=l.rotation*Math.PI/180;const x=px*sx,y=py*sy;
 return [l.x+x*Math.cos(a)-y*Math.sin(a),l.y+x*Math.sin(a)+y*Math.cos(a)];
}

function drawOverlay(){
 const ov=svg.querySelector('#overlay');if(!ov)return;
 const l=sel();if(!l||l.visible===false){ov.innerHTML='';return;}
 let extra='';multiSel.forEach(id=>{const o=state.layers.find(x=>x.id===id);const og=o&&svg.querySelector(`.layer-xf[data-id="${id}"]`);const oc=og&&og.querySelector('g.txt,text,image,g.sym');if(!oc)return;let ob;try{ob=oc.getBBox();}catch(e){return;}const kk=Math.max(svg.viewBox.baseVal.width/Math.max(1,svg.clientWidth),svg.viewBox.baseVal.height/Math.max(1,svg.clientHeight));const cs=[[ob.x,ob.y],[ob.x+ob.width,ob.y],[ob.x+ob.width,ob.y+ob.height],[ob.x,ob.y+ob.height]].map(p=>xformPoint(o,p[0],p[1]));extra+=`<polygon points="${cs.map(p=>p.map(f).join(',')).join(' ')}" fill="none" stroke="#e4bf4a" stroke-width="${f(1.2*kk)}" stroke-dasharray="${f(3*kk)} ${f(3*kk)}" pointer-events="none"/>`;});
 const g=svg.querySelector(`.layer-xf[data-id="${l.id}"]`);const child=g&&g.querySelector('g.txt,text,image,g.sym');
 if(!child){ov.innerHTML='';return;}
 let bb;try{bb=child.getBBox();}catch(e){ov.innerHTML='';return;}
 if(!(bb.width>0)||!(bb.height>0))bb={x:-30,y:-30,width:60,height:60};
 const vb=svg.viewBox.baseVal;
 const k=Math.max(vb.width/Math.max(1,svg.clientWidth),vb.height/Math.max(1,svg.clientHeight));
 const corners=[[bb.x,bb.y],[bb.x+bb.width,bb.y],[bb.x+bb.width,bb.y+bb.height],[bb.x,bb.y+bb.height]].map(p=>xformPoint(l,p[0],p[1]));
 const hs=7*k;
 const topMid=xformPoint(l,bb.x+bb.width/2,bb.y);
 const rot=xformPoint(l,bb.x+bb.width/2,bb.y-32*k/Math.max(0.01,l.scale));
 const poly=corners.map(p=>p.map(f).join(',')).join(' ');
 let guides='';
 if(snapGuides.x||snapGuides.y){const [cx,cy]=shapeCenter();const gw=f(1.2*k),dash=`${f(8*k)} ${f(5*k)}`;if(snapGuides.x)guides+=`<line x1="${f(cx)}" y1="0" x2="${f(cx)}" y2="${state.height}" stroke="#7dd3fc" stroke-width="${gw}" stroke-dasharray="${dash}" pointer-events="none"/>`;if(snapGuides.y)guides+=`<line x1="0" y1="${f(cy)}" x2="${state.width}" y2="${f(cy)}" stroke="#7dd3fc" stroke-width="${gw}" stroke-dasharray="${dash}" pointer-events="none"/>`;}
 ov.innerHTML=guides+extra+`<polygon points="${poly}" fill="none" stroke="#e4bf4a" stroke-width="${f(1.5*k)}" stroke-dasharray="${f(6*k)} ${f(4*k)}" pointer-events="none"/>
<line x1="${f(topMid[0])}" y1="${f(topMid[1])}" x2="${f(rot[0])}" y2="${f(rot[1])}" stroke="#e4bf4a" stroke-width="${f(1.5*k)}"/>
<circle class="handle" data-handle="rotate" cx="${f(rot[0])}" cy="${f(rot[1])}" r="${f(hs)}" fill="#e4bf4a" stroke="#241b0c" stroke-width="${f(1.5*k)}"/>
<rect class="handle" data-handle="scale" x="${f(corners[2][0]-hs)}" y="${f(corners[2][1]-hs)}" width="${f(2*hs)}" height="${f(2*hs)}" fill="#e4bf4a" stroke="#241b0c" stroke-width="${f(1.5*k)}"/>`;
}

const LIGHT=new Set(['x','y','scale','rotation','opacity']);
function updateLayerLight(l,syncInputs){
 svg.querySelectorAll(`.layer-xf[data-id="${l.id}"]`).forEach(g=>{g.setAttribute('transform',layerTransform(l));g.setAttribute('opacity',l.opacity??1);});
 drawOverlay();
 if(syncInputs){
  for(const k of ['x','y','scale','rotation']){const inp=$(`#p-${k}`);if(!inp)continue;inp.value=f(l[k]);const span=inp.parentElement.querySelector('.val');if(span)span.textContent=k==='rotation'?Math.round(l[k])+'°':f(l[k]);}
 }
}
