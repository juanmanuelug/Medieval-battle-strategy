'use strict';
/* ---------- Catálogo de formas ---------- */
const SHAPES={
 rect:{name:'Rectangular',orient:'v',path:(w,h)=>`M0 0H${w}V${h}H0Z`},
 swallowtail:{name:'Cola de golondrina',orient:'v',path:(w,h)=>`M0 0H${w}V${h}L${f(w/2)} ${f(h*0.72)}L0 ${h}Z`},
 pointed:{name:'Una punta',orient:'v',path:(w,h)=>`M0 0H${w}V${f(h*0.78)}L${f(w/2)} ${h}L0 ${f(h*0.78)}Z`},
 gonfalon:{name:'Gonfalón (3 puntas)',orient:'v',path:(w,h)=>{const y=f(h*0.78);return `M0 0H${w}V${y}L${f(w*5/6)} ${h}L${f(w*4/6)} ${y}L${f(w/2)} ${h}L${f(w*2/6)} ${y}L${f(w/6)} ${h}L0 ${y}Z`}},
 pennantV:{name:'Pendón triangular',orient:'v',path:(w,h)=>`M0 0H${w}L${f(w/2)} ${h}Z`},
 rounded:{name:'Base redonda',orient:'v',path:(w,h)=>{const r=f(w/2);return `M0 0H${w}V${f(h-r)}A${r} ${r} 0 0 1 0 ${f(h-r)}Z`}},
 scalloped:{name:'Festoneado',orient:'v',path:(w,h)=>{const n=4,r=w/(2*n);let d=`M0 0H${w}V${f(h-r)}`;for(let i=n;i>0;i--)d+=`A${f(r)} ${f(r)} 0 0 1 ${f((i-1)*2*r)} ${f(h-r)}`;return d+'Z'}},
 heater:{name:'Escudo',orient:'v',path:(w,h)=>`M0 0H${w}V${f(h*0.5)}C${w} ${f(h*0.78)} ${f(w*0.72)} ${f(h*0.93)} ${f(w/2)} ${h}C${f(w*0.28)} ${f(h*0.93)} 0 ${f(h*0.78)} 0 ${f(h*0.5)}Z`},
 rectH:{name:'Bandera',orient:'h',path:(w,h)=>`M0 0H${w}V${h}H0Z`},
 pennantH:{name:'Gallardete',orient:'h',path:(w,h)=>`M0 0L${w} ${f(h/2)}L0 ${h}Z`},
 swallowH:{name:'Dos puntas',orient:'h',path:(w,h)=>`M0 0H${w}L${f(w*0.72)} ${f(h/2)}L${w} ${h}H0Z`},
 oriflamme:{name:'Oriflama',orient:'h',path:(w,h)=>{const x=f(w*0.75);return `M0 0H${x}L${w} ${f(h/6)}L${x} ${f(h/3)}L${w} ${f(h/2)}L${x} ${f(h*2/3)}L${w} ${f(h*5/6)}L${x} ${h}H0Z`}},
 /* Colgantes (de travesaño) */
 gonfalon5:{name:'Gonfalón (5 puntas)',orient:'v',path:(w,h)=>{const y=f(h*0.8);let d=`M0 0H${w}V${y}`;for(let i=5;i>0;i--)d+=`L${f((i-0.5)*w/5)} ${h}L${f((i-1)*w/5)} ${y}`;return d+'Z';}},
 tongues:{name:'Gonfalón de lengüetas',orient:'v',path:(w,h)=>{const r=w/8,tw=w/4,g=w/8,y=f(h*0.7);let d=`M0 0H${w}`;let x=w;for(let i=0;i<3;i++){d+=`V${f(h-r)}A${f(r)} ${f(r)} 0 0 1 ${f(x-tw)} ${f(h-r)}V${y}`;x-=tw;if(i<2){d+=`H${f(x-g)}`;x-=g;}}return d+'Z';}},
 swallowRound:{name:'Golondrina redondeada',orient:'v',path:(w,h)=>`M0 0H${w}V${f(h*0.84)}Q${w} ${h} ${f(w*0.84)} ${h}Q${f(w*0.62)} ${h} ${f(w/2)} ${f(h*0.72)}Q${f(w*0.38)} ${h} ${f(w*0.16)} ${h}Q0 ${h} 0 ${f(h*0.84)}Z`},
 vexillum:{name:'Vexillum con flecos',orient:'v',path:(w,h)=>{const y=f(h*0.86),n=14,t=w/(2*n);let d=`M0 0H${w}V${y}`;for(let i=n;i>0;i--)d+=`V${h}H${f((2*i-1)*t)}V${y}H${f((2*i-2)*t)}`;return d+'Z';}},
 /* Escudos */
 kite:{name:'Escudo normando',orient:'v',ratio:0.5,path:(w,h)=>`M${f(w/2)} 0C${f(w*0.9)} 0 ${w} ${f(h*0.2)} ${w} ${f(h*0.32)}C${w} ${f(h*0.6)} ${f(w*0.7)} ${f(h*0.85)} ${f(w/2)} ${h}C${f(w*0.3)} ${f(h*0.85)} 0 ${f(h*0.6)} 0 ${f(h*0.32)}C0 ${f(h*0.2)} ${f(w*0.1)} 0 ${f(w/2)} 0Z`},
 pavise:{name:'Pavés',orient:'v',ratio:0.6,path:(w,h)=>{const r=f(w*0.3);return `M0 ${r}Q0 0 ${r} 0H${f(w-r)}Q${w} 0 ${w} ${r}V${h}H0Z`}},
 frenchShield:{name:'Escudo francés',orient:'v',path:(w,h)=>`M0 0H${w}V${f(h*0.8)}C${w} ${f(h*0.9)} ${f(w*0.92)} ${f(h*0.97)} ${f(w*0.75)} ${f(h*0.97)}L${f(w/2)} ${h}L${f(w*0.25)} ${f(h*0.97)}C${f(w*0.08)} ${f(h*0.97)} 0 ${f(h*0.9)} 0 ${f(h*0.8)}Z`},
 lozengeShape:{name:'Losange',orient:'v',ratio:0.75,path:(w,h)=>`M${f(w/2)} 0L${w} ${f(h/2)}L${f(w/2)} ${h}L0 ${f(h/2)}Z`},
 oval:{name:'Óvalo (cartela)',orient:'v',ratio:0.8,path:(w,h)=>`M${f(w/2)} 0A${f(w/2)} ${f(h/2)} 0 1 1 ${f(w/2)} ${h}A${f(w/2)} ${f(h/2)} 0 1 1 ${f(w/2)} 0Z`},
 /* De asta (horizontales) */
 schwenkel:{name:'Bandera con Schwenkel',orient:'h',ratio:1.6,center:(w,h)=>[w*0.31,h/2],path:(w,h)=>`M0 0H${w}L${f(w*0.62)} ${f(h*0.2)}V${h}H0Z`},
 standard:{name:'Estandarte largo',orient:'h',ratio:4,path:(w,h)=>`M0 0L${f(w*0.9)} ${f(h*0.3)}Q${w} ${f(h*0.32)} ${f(w*0.97)} ${f(h*0.4)}L${f(w*0.86)} ${f(h/2)}L${f(w*0.97)} ${f(h*0.6)}Q${w} ${f(h*0.68)} ${f(w*0.9)} ${f(h*0.7)}L0 ${h}Z`},
 guidon:{name:'Guion',orient:'h',ratio:1.8,path:(w,h)=>`M0 0H${f(w*0.9)}Q${w} 0 ${w} ${f(h*0.1)}L${w} ${f(h*0.34)}Q${w} ${f(h*0.42)} ${f(w*0.92)} ${f(h*0.42)}L${f(w*0.78)} ${f(h/2)}L${f(w*0.92)} ${f(h*0.58)}Q${w} ${f(h*0.58)} ${w} ${f(h*0.66)}L${w} ${f(h*0.9)}Q${w} ${h} ${f(w*0.9)} ${h}L0 ${h}Z`},
 streamer:{name:'Flámula bífida',orient:'h',ratio:5,path:(w,h)=>`M0 0H${w}L${f(w*0.55)} ${f(h/2)}L${w} ${h}H0Z`},
 pennonRound:{name:'Pendón de punta redonda',orient:'h',ratio:1.6,path:(w,h)=>{const r=f(h/2);return `M0 0H${f(w-r)}A${r} ${r} 0 0 1 ${f(w-r)} ${h}H0Z`}},
 trapezoid:{name:'Pendón trapezoidal',orient:'h',ratio:1.5,path:(w,h)=>`M0 0L${w} ${f(h*0.25)}V${f(h*0.75)}L0 ${h}Z`},
};
