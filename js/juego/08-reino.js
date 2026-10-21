'use strict';
/* ---------- El reino del jugador ----------
   Se guarda en localStorage (sin backend): nombre, rey, rama, blasón (por defecto o importado del diseñador), oro,
   ejército comprado y marcador. */
const CLAVE_REINO = 'batallas.reino.v1';
function cargarReino() {
  const r = leerLocalJSON(CLAVE_REINO); if (!r || !r.nombre) return null;
  try {
    // reinos guardados antes de los límites por tropa (mangoneles, 2026-10-15): se ajustan y se devuelve el oro de lo quitado
    if (Array.isArray(r.ejercito) && typeof ajustarEjercitoALimites === 'function') r.oro = (r.oro || 0) + ajustarEjercitoALimites(r.rama, r.ejercito);
    if (r.personalizada && Array.isArray(r.personalizada.ejercito) && typeof ajustarEjercitoALimites === 'function') ajustarEjercitoALimites(r.personalizada.rama, r.personalizada.ejercito);
    return r;
  } catch (e) { return null; }
}
function guardarReino(reino) { return guardarLocal(CLAVE_REINO, reino); }
function borrarReino() { borrarLocal(CLAVE_REINO); }
function nuevoReino(nombre, rey) {
  return { nombre: String(nombre || 'Reino sin nombre').slice(0, LARGO_MAXIMO_NOMBRE), rey: String(rey || 'Rey sin nombre').slice(0, LARGO_MAXIMO_NOMBRE), rama: null, blason: { modo: 'defecto', estado: null }, oro: ORO_INICIAL, ejercito: [], dificultad: 'normal', victorias: 0, derrotas: 0, creado: Date.now() };
}
// Estado del diseñador que describe el blasón del reino (el importado o el de la rama)
function estadoBlason(reino) {
  if (reino.blason && reino.blason.modo === 'importado' && reino.blason.estado) return reino.blason.estado;
  return blasonDeRama(RAMAS[reino.rama] ? reino.rama : RAMA_POR_DEFECTO);
}
// blasón de serie de una rama (sus dos colores y su símbolo) y sus colores como números
const blasonDeRama = clave => { const rama = RAMAS[clave]; return PuenteDisenador.blasonPorDefecto(rama.colores[0], rama.colores[1], rama.simbolo); };
const coloresDeRama = clave => RAMAS[clave].colores.map(hexAEntero);
// Colores del equipo en la batalla: los dos esmaltes principales del campo del blasón
function coloresDelBlason(estado) {
  const colores = [];
  const recorrer = nodo => { for (const r of (nodo.regions || [])) { if (typeof r === 'string') { if (!colores.includes(r)) colores.push(r); } else if (r) recorrer(r); } };
  recorrer(estado.field);
  if (colores.length < 2) colores.push(colores[0] === '#d9a92c' ? '#b3202c' : '#d9a92c');
  return colores.slice(0, 2).map(hexAEntero);
}
