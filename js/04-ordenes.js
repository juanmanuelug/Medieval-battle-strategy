'use strict';
/* ---------- Órdenes como datos (multijugador, paso 3, 2026-10-13) ----------
   Todas las órdenes del jugador a sus unidades se expresan como objetos sencillos y se aplican con aplicarOrden. En una
   batalla individual se aplican al momento; en red viajan al servidor, que las valida aplicándolas a SU simulación, les pone
   turno y las reparte, y los dos navegadores las aplican en el mismo turno: así las tres simulaciones siguen idénticas
   (lockstep con el servidor como árbitro). Lo usan el juego (js/juego/10-batalla.js) y el servidor (servidor/motor.js).

   Órdenes ({ a: acción, u: [ids de unidad], ... }):
     mover      { d: [[x, y, rumboFinal|null], …] (una por unidad), m: 'andar'|'correr' }
     recolocar  { d: [[x, y, rumbo], …] }               solo en el despliegue; se recorta a la zona del equipo
     atacar     { objetivo: id de unidad enemiga, m }
     orden      { orden: 'avanzar'|'formar'|'cargar'|'disparar', m }
     formar     { clave }                                 en el despliegue además recoloca en el sitio
     encarar    { rumbo }
     escaramuza { activa: true|false }
   aplicarOrden(sim, equipo, orden, { desplegando }) → true si se aplicó (con al menos una unidad válida) o false. */
const ORDENES_SIMPLES = ['avanzar', 'formar', 'cargar', 'disparar'];
const MAX_UNIDADES_ORDEN = 40;

// Zona de despliegue de cada bando: el izquierdo hasta el 38 % del ancho, el derecho desde el 62 %
function zonaDespliegue(equipo) {
  return equipo === 0 ? { x0: 6, x1: Math.round(CAMPO.ancho * 0.38), y0: 6, y1: CAMPO.alto - 6 } : { x0: Math.round(CAMPO.ancho * 0.62), x1: CAMPO.ancho - 6, y0: 6, y1: CAMPO.alto - 6 };
}

function aplicarOrden(sim, equipo, orden, contexto) {
  if (!orden || typeof orden !== 'object' || !Array.isArray(orden.u) || orden.u.length > MAX_UNIDADES_ORDEN) return false;
  const desplegando = !!(contexto && contexto.desplegando);
  const numero = v => typeof v === 'number' && isFinite(v);
  const marcha = orden.m === 'correr' ? 'correr' : 'andar';
  // solo unidades propias, vivas y (salvo la orden de alto a una retirada ordenada) que no huyan
  const unidades = [];
  for (const id of orden.u) {
    const u = Number.isInteger(id) ? sim.unidades[id] : null;
    if (!u || u.equipo !== equipo || u.vivos === 0 || unidades.includes(u)) continue;
    if (u.huyendo && !(u.retirada && orden.a === 'orden' && orden.orden === 'formar')) continue;
    unidades.push(u);
  }
  if (!unidades.length) return false;
  const zona = zonaDespliegue(equipo);
  const enZona = (x, y) => [limitar(x, zona.x0, zona.x1), limitar(y, zona.y0, zona.y1)];
  switch (orden.a) {
    case 'mover': {
      if (desplegando || !Array.isArray(orden.d)) return false;
      let alguna = false;
      unidades.forEach((u, k) => { const d = orden.d[orden.u.indexOf(u.id)]; if (!d || !numero(d[0]) || !numero(d[1])) return; const rumbo = numero(d[2]) ? d[2] : null; sim.ordenar(u, 'mover', limitar(d[0], 3, CAMPO.ancho - 3), limitar(d[1], 3, CAMPO.alto - 3), rumbo, marcha); alguna = true; });
      return alguna;
    }
    case 'recolocar': {
      if (!desplegando || !Array.isArray(orden.d)) return false;
      let alguna = false;
      unidades.forEach(u => { const d = orden.d[orden.u.indexOf(u.id)]; if (!d || !numero(d[0]) || !numero(d[1])) return; const [x, y] = enZona(d[0], d[1]); sim.recolocarUnidad(u, x, y, numero(d[2]) ? d[2] : u.rumbo); alguna = true; });
      return alguna;
    }
    case 'atacar': {
      if (desplegando) return false;
      const enemiga = Number.isInteger(orden.objetivo) ? sim.unidades[orden.objetivo] : null;
      if (!enemiga || enemiga.equipo === equipo || enemiga.vivos === 0) return false;
      for (const u of unidades) sim.ordenarAtaque(u, enemiga, marcha);
      return true;
    }
    case 'orden': {
      if (desplegando || !ORDENES_SIMPLES.includes(orden.orden)) return false;
      for (const u of unidades) sim.ordenar(u, orden.orden, undefined, undefined, undefined, marcha);
      return true;
    }
    case 'formar': {
      if (!FORMACIONES[orden.clave]) return false;
      let alguna = false;
      for (const u of unidades) if (sim.formar(u, orden.clave)) { alguna = true; if (desplegando) sim.recolocarUnidad(u, u.origenX, u.origenY); }
      return alguna;
    }
    case 'encarar': {
      if (!numero(orden.rumbo)) return false;
      for (const u of unidades) { if (desplegando) sim.recolocarUnidad(u, u.origenX, u.origenY, orden.rumbo); else if (u.orden === 'formar') u.rumboFinal = orden.rumbo; }
      return true;
    }
    case 'escaramuza': {
      let alguna = false;
      for (const u of unidades) if (u.stats.disparaEnMovimiento) { u.escaramuza = !!orden.activa; if (!orden.activa) u.esquiva = null; alguna = true; }
      return alguna;
    }
  }
  return false;
}

// Resumen del estado de la simulación (para comprobar que servidor y jugadores siguen idénticos): posiciones, vida y estado
// de cada soldado y moral, cohesión y posición de cada unidad, redondeados, mezclados con FNV-1a
function resumenEstado(sim) {
  let h = 2166136261 >>> 0;
  const mezclar = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
  for (let i = 0; i < sim.cantidad; i++) { mezclar(Math.round(sim.posX[i] * 100)); mezclar(Math.round(sim.posY[i] * 100)); mezclar(Math.round(sim.vida[i] * 10)); mezclar(sim.estado[i]); }
  for (const u of sim.unidades) { mezclar(Math.round(u.moral * 10)); mezclar(Math.round(u.cohesion * 10)); mezclar(Math.round(u.origenX * 100)); mezclar(Math.round(u.origenY * 100)); }
  mezclar(sim.paso);
  return h.toString(16);
}
