'use strict';
/* ---------- El reino del jugador ----------
   Se guarda en localStorage (sin backend): nombre, rey, rama, blasón (por defecto o importado del diseñador), oro,
   ejército comprado y marcador. */
const CLAVE_REINO = 'batallas.reino.v1';
function cargarReino() { try { const r = JSON.parse(localStorage.getItem(CLAVE_REINO) || 'null'); return r && r.nombre ? r : null; } catch (e) { return null; } }
function guardarReino(reino) { try { localStorage.setItem(CLAVE_REINO, JSON.stringify(reino)); return true; } catch (e) { return false; } }
function borrarReino() { try { localStorage.removeItem(CLAVE_REINO); } catch (e) {} }
function nuevoReino(nombre, rey) {
  return { nombre: String(nombre || 'Reino sin nombre').slice(0, 40), rey: String(rey || 'Rey sin nombre').slice(0, 40), rama: null, blason: { modo: 'defecto', estado: null }, oro: ORO_INICIAL, ejercito: [], dificultad: 'normal', victorias: 0, derrotas: 0, creado: Date.now() };
}
// Estado del diseñador que describe el blasón del reino (el importado o el de la rama)
function estadoBlason(reino) {
  if (reino.blason && reino.blason.modo === 'importado' && reino.blason.estado) return reino.blason.estado;
  const rama = RAMAS[reino.rama] || RAMAS.cristiano;
  return PuenteDisenador.blasonPorDefecto(rama.colores[0], rama.colores[1], rama.simbolo);
}
// Colores del equipo en la batalla: los dos esmaltes principales del campo del blasón
function coloresDelBlason(estado) {
  const colores = [];
  const recorrer = nodo => { for (const r of (nodo.regions || [])) { if (typeof r === 'string') { if (!colores.includes(r)) colores.push(r); } else if (r) recorrer(r); } };
  recorrer(estado.field);
  if (colores.length < 2) colores.push(colores[0] === '#d9a92c' ? '#b3202c' : '#d9a92c');
  return colores.slice(0, 2).map(c => parseInt(c.slice(1), 16));
}
