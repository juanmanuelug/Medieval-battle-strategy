'use strict';
/* ---------- Retratos de tropa fuera de la batalla ----------
   Dibuja un muñeco (js/sprites-munecos.js) en un canvas recortado, para las pantallas de rama, tienda, batalla personalizada
   y el discurso del general. Se cachea por tipo, rama, nivel, colores, blasón y dirección. `blason` es el resultado de
   blasonParaSprites(estado) (opcional): con él, el escudo lleva el blasón y la sobrevesta el campo. */
const RETRATOS = { cache: new Map() };

function retratoTropa(opciones) {
  const { tipo, rama, nivel, color, colorSecundario } = opciones;
  const blason = opciones.blason || null;
  const direccion = opciones.direccion === undefined ? 2 : opciones.direccion, general = !!opciones.general;
  const escala = opciones.escala || 40;
  const clave = [tipo, rama, nivel, color, colorSecundario, blason ? blason.clave : '', direccion, general, escala].join(':');
  if (RETRATOS.cache.has(clave)) return clonarCanvas(RETRATOS.cache.get(clave));
  if (typeof dibujarMuneco2D !== 'function') return null;
  try {
    // dibujarMuneco2D lee los colores y el blasón de EQUIPOS[equipo]: se usa una entrada aparte para no tocar los equipos de la batalla
    const indiceEquipo = EQUIPOS.length;
    EQUIPOS[indiceEquipo] = { nombre: 'retrato', color, colorSecundario, blason };
    let dibujo;
    try { dibujo = dibujarMuneco2D({ equipo: indiceEquipo, datos: TIPOS[TIPO[tipo]], direccion, fotograma: 'quieto', S: escala, rama, nivel, general }); }
    finally { EQUIPOS.length = indiceEquipo; }
    const lienzo = recortarLienzo(dibujo.canvas);
    RETRATOS.cache.set(clave, lienzo);
    return clonarCanvas(lienzo);
  } catch (e) { console.warn('retrato:', e.message); return null; }
}
function clonarCanvas(origen) { const c = document.createElement('canvas'); c.width = origen.width; c.height = origen.height; c.getContext('2d').drawImage(origen, 0, 0); return c; }
// Rellena los <span class="retrato-tropa" data-tipo data-rama data-nivel> de un contenedor con su retrato
function pintarRetratos(contenedor, color, colorSecundario, blason) {
  for (const hueco of contenedor.querySelectorAll('.retrato-tropa')) {
    if (hueco.firstChild) continue;
    const lienzo = retratoTropa({ tipo: hueco.dataset.tipo, rama: hueco.dataset.rama, nivel: +hueco.dataset.nivel || 0, color, colorSecundario, blason, escala: +hueco.dataset.escala || 40, general: hueco.dataset.general === '1' });
    if (lienzo) { lienzo.className = 'retrato-tropa-lienzo'; hueco.appendChild(lienzo); }
  }
}
// Igual que pintarRetratos, pero rasteriza antes el blasón (estado del diseñador) para ponerlo en escudos y sobrevestas
function pintarRetratosConBlason(contenedor, color, colorSecundario, estado) {
  blasonParaSprites(estado).then(blason => pintarRetratos(contenedor, color, colorSecundario, blason)).catch(e => { console.warn('blasón de retratos:', e.message); pintarRetratos(contenedor, color, colorSecundario, null); });
}
