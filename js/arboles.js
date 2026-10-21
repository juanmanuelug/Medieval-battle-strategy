'use strict';
/* ---------- Árboles y arbustos dibujados por código (2026-10-16, fase 1 del terreno con volumen) ----------
   Mismo estilo que los muñecos (sprites-munecos.js): contorno oscuro, dos tonos y algún brillo. Se dibujan a S px por metro en
   un canvas; el renderizador los reduce. Cada árbol se dibuja con su propio azar (variantes de copa) y, con nieve, lleva
   nieve encima. Devuelven { canvas, anclaX, anclaY }: el ancla es el pie del tronco. Solo estética: no afecta a la simulación. */
const CONTORNO_ARBOL = '#17200e';      // contorno de árboles y arbustos
function dibujarArbol(o) {
  const S = o.S || 32, azar = o.azar, nieve = !!o.nieve;
  const ancho = Math.ceil(4 * S), alto = Math.ceil(7 * S);
  const canvas = document.createElement('canvas'); canvas.width = ancho; canvas.height = alto;
  const c = canvas.getContext('2d'), ax = ancho / 2, ay = alto - 0.35 * S;
  const CONTORNO = CONTORNO_ARBOL, grosor = Math.max(1.5, 0.1 * S);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // tronco: algo más ancho abajo, con el lado derecho en sombra
  const tronco = (altura, anchoBase) => {
    c.beginPath(); c.moveTo(ax - anchoBase / 2, ay); c.lineTo(ax - anchoBase * 0.32, ay - altura); c.lineTo(ax + anchoBase * 0.32, ay - altura); c.lineTo(ax + anchoBase / 2, ay); c.closePath();
    c.fillStyle = '#5c3c1f'; c.fill(); c.lineWidth = grosor; c.strokeStyle = CONTORNO; c.stroke();
    c.beginPath(); c.moveTo(ax + anchoBase * 0.05, ay); c.lineTo(ax + anchoBase * 0.05, ay - altura); c.lineTo(ax + anchoBase * 0.32, ay - altura); c.lineTo(ax + anchoBase / 2, ay); c.closePath(); c.fillStyle = '#43291a'; c.fill();
  };
  if (o.forma === 'pino') {
    tronco(1.2 * S, 0.34 * S);
    const pisos = 4, anchoBase = (1.9 + azar.entre(-0.2, 0.3)) * S, altoPiso = 1.45 * S;
    const triangulo = (i, extra) => { const w = anchoBase * (1 - i * 0.2) + extra, base = ay - 0.9 * S - i * 1.0 * S; c.beginPath(); c.moveTo(ax - w / 2, base); c.lineTo(ax, base - altoPiso - extra * 0.4); c.lineTo(ax + w / 2, base); c.closePath(); };
    for (let i = 0; i < pisos; i++) { triangulo(i, grosor * 2); c.fillStyle = CONTORNO; c.fill(); }      // contorno de la silueta entera
    for (let i = 0; i < pisos; i++) {
      triangulo(i, 0); c.fillStyle = '#1f4226'; c.fill();
      // mitad izquierda (la de la luz) más clara
      const w = anchoBase * (1 - i * 0.2), base = ay - 0.9 * S - i * 1.0 * S;
      c.beginPath(); c.moveTo(ax - w / 2, base); c.lineTo(ax, base - altoPiso); c.lineTo(ax - w * 0.04, base); c.closePath(); c.fillStyle = '#2d5a34'; c.fill();
      if (nieve) { c.beginPath(); c.moveTo(ax - w * 0.32, base - altoPiso * 0.36); c.lineTo(ax, base - altoPiso); c.lineTo(ax + w * 0.3, base - altoPiso * 0.38); c.lineTo(ax + w * 0.1, base - altoPiso * 0.5); c.lineTo(ax - w * 0.12, base - altoPiso * 0.45); c.closePath(); c.fillStyle = '#eef3f7'; c.fill(); }
    }
  } else {
    tronco(1.8 * S, 0.4 * S);
    // copa: un racimo de círculos alrededor de un centro, con contorno común, tono base, luces arriba a la izquierda y brillos
    const cx = ax + azar.entre(-0.15, 0.15) * S, cy = ay - (3.05 + azar.entre(-0.15, 0.25)) * S;
    const bolas = [];
    const cuantas = azar.entero(7, 9);
    for (let k = 0; k < cuantas; k++) { const a = k / cuantas * Math.PI * 2 + azar.entre(-0.3, 0.3); bolas.push({ x: cx + Math.cos(a) * azar.entre(0.6, 1.1) * S, y: cy + Math.sin(a) * azar.entre(0.45, 0.8) * S, r: azar.entre(0.8, 1.15) * S }); }
    bolas.push({ x: cx, y: cy - 0.2 * S, r: 1.15 * S });
    for (const b of bolas) { c.beginPath(); c.arc(b.x, b.y, b.r + grosor, 0, Math.PI * 2); c.fillStyle = CONTORNO; c.fill(); }
    const base = o.otono ? '#6b5a1e' : '#2d5520', luz = o.otono ? '#8f7a2a' : '#3e7430', brillo = o.otono ? '#b29a3a' : '#5a963e', sombra = o.otono ? '#4e4216' : '#22421a';
    for (const b of bolas) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fillStyle = base; c.fill(); }
    for (const b of bolas) if (b.y > cy) { c.beginPath(); c.arc(b.x + b.r * 0.15, b.y + b.r * 0.2, b.r * 0.7, 0, Math.PI * 2); c.fillStyle = sombra; c.fill(); }
    for (const b of bolas) { c.beginPath(); c.arc(b.x - b.r * 0.22, b.y - b.r * 0.28, b.r * 0.62, 0, Math.PI * 2); c.fillStyle = luz; c.fill(); }
    for (let k = 0; k < 6; k++) { const b = bolas[azar.entero(0, bolas.length - 1)]; c.beginPath(); c.arc(b.x - b.r * 0.35 + azar.entre(-0.1, 0.1) * S, b.y - b.r * 0.4, 0.12 * S, 0, Math.PI * 2); c.fillStyle = brillo; c.fill(); }
    if (nieve) for (const b of bolas) if (b.y < cy + 0.1 * S) { c.beginPath(); c.ellipse(b.x - b.r * 0.1, b.y - b.r * 0.55, b.r * 0.62, b.r * 0.3, 0, Math.PI, 0); c.fillStyle = '#eef3f7'; c.fill(); }
  }
  return { canvas, anclaX: ax, anclaY: ay };
}
function dibujarArbusto(o) {
  const S = o.S || 32, azar = o.azar, nieve = !!o.nieve;
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(2.4 * S); canvas.height = Math.ceil(1.6 * S);
  const c = canvas.getContext('2d'), ax = canvas.width / 2, ay = canvas.height - 0.15 * S, grosor = Math.max(1.5, 0.09 * S);
  const bolas = []; for (let k = 0; k < 5; k++) bolas.push({ x: ax + azar.entre(-0.6, 0.6) * S, y: ay - azar.entre(0.35, 0.65) * S, r: azar.entre(0.3, 0.45) * S });
  for (const b of bolas) { c.beginPath(); c.arc(b.x, b.y, b.r + grosor, 0, Math.PI * 2); c.fillStyle = CONTORNO_ARBOL; c.fill(); }
  for (const b of bolas) { c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fillStyle = '#30582a'; c.fill(); }
  for (const b of bolas) { c.beginPath(); c.arc(b.x - b.r * 0.25, b.y - b.r * 0.3, b.r * 0.55, 0, Math.PI * 2); c.fillStyle = nieve ? '#e6edf2' : '#457a36'; c.fill(); }
  return { canvas, anclaX: ax, anclaY: ay };
}
