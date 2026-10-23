'use strict';
/* ---------- Órdenes como datos (multijugador, paso 3, 2026-10-13) ----------
   Todas las órdenes del jugador a sus unidades se expresan como objetos sencillos y se aplican con aplicarOrden. En una
   batalla individual se aplican al momento; en red viajan al servidor, que las valida aplicándolas a SU simulación, les pone
   turno y las reparte, y los dos navegadores las aplican en el mismo turno: así las tres simulaciones siguen idénticas
   (lockstep con el servidor como árbitro). Lo usan el juego (js/juego/10-batalla.js) y el servidor (servidor/motor.js).

   Órdenes ({ a: acción, u: [ids de unidad], ... }):
     mover      { d: [[x, y, rumboFinal|null, frente?], …] (una por unidad), m: 'andar'|'correr' }
     recolocar  { d: [[x, y, rumbo, frente?], …] }      solo en el despliegue; se recorta a la zona del equipo
                (frente, opcional desde el 2026-10-20: soldados por fila, dibujando el frente al arrastrar; ver fijarFrente)
     atacar     { objetivo: id de unidad enemiga, m }
     orden      { orden: 'avanzar'|'formar'|'cargar'|'disparar', m }
     formar     { clave }                                 en el despliegue además recoloca en el sitio
     encarar    { rumbo }
     fuego      { activa } flechas de fuego (arqueros a pie; 2026-10-21)
     escaramuza { activa: true|false }
   aplicarOrden(sim, equipo, orden, { desplegando }) → true si se aplicó (con al menos una unidad válida) o false. */
const ORDENES_SIMPLES = ['avanzar', 'formar', 'cargar', 'disparar'];
const MAX_UNIDADES_ORDEN = 40;
// red (los lee también el servidor, vía motor.js): pasos de simulación por turno y cada cuántos turnos se manda el resumen de estado
const PASOS_POR_TURNO_RED = 3, TURNOS_ENTRE_RESUMENES = 10;
// lobby: puerto por defecto del servidor, nombre de quien no da ninguno, largo máximo de un nombre (el del rey es el del jugador
// en red) y segundos de despliegue (el servidor manda los suyos en la ficha; este, si no)
const PUERTO_POR_DEFECTO = 8787, NOMBRE_JUGADOR_POR_DEFECTO = 'Jugador', LARGO_MAXIMO_NOMBRE = 40, TIEMPO_DESPLIEGUE = 120;

// la zona de despliegue de cada bando (zonaDespliegue) está en 01-datos-unidades.js

function aplicarOrden(sim, equipo, orden, contexto) {
  if (!orden || typeof orden !== 'object' || !Array.isArray(orden.u) || orden.u.length > MAX_UNIDADES_ORDEN) return false;
  const desplegando = !!(contexto && contexto.desplegando);
  const numero = v => typeof v === 'number' && isFinite(v);
  const marcha = marchaValida(orden.m);
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
      unidades.forEach((u, k) => { const d = orden.d[orden.u.indexOf(u.id)]; if (!d || !numero(d[0]) || !numero(d[1])) return; const rumbo = numero(d[2]) ? d[2] : null; sim.fijarFrente(u, d[3]); sim.ordenar(u, 'mover', limitar(d[0], 3, CAMPO.ancho - 3), limitar(d[1], 3, CAMPO.alto - 3), rumbo, marcha); alguna = true; });
      return alguna;
    }
    case 'recolocar': {
      if (!desplegando || !Array.isArray(orden.d)) return false;
      let alguna = false;
      // (fase A de los pasos) el sitio pedido o el válido más cercano: ningún soldado en terreno que no se pisa ni en un bolsillo
      unidades.forEach(u => { const d = orden.d[orden.u.indexOf(u.id)]; if (!d || !numero(d[0]) || !numero(d[1])) return; const rumbo = numero(d[2]) ? d[2] : u.rumbo; sim.fijarFrente(u, d[3]); const sitio = sim.posicionDespliegue(u, d[0], d[1], rumbo, zona); if (!sitio) return; sim.recolocarUnidad(u, sitio[0], sitio[1], rumbo); alguna = true; });
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
      for (const u of unidades) {
        const previa = u.formacion && u.formacion.clave, frentePrevio = u.frente;
        u.frente = null;          // (2026-10-20) la formación nueva con su fondo propio: el frente dibujado era para la anterior
        if (!sim.formar(u, orden.clave)) { u.frente = frentePrevio; continue; }
        alguna = true;
        if (!desplegando) continue;
        // en el despliegue, la nueva forma tiene que caber en terreno jugable; si no cabe en ningún sitio cercano, se deshace
        const sitio = sim.posicionDespliegue(u, u.origenX, u.origenY, u.rumbo, zona);
        if (sitio) sim.recolocarUnidad(u, sitio[0], sitio[1]); else { u.frente = frentePrevio; sim.formar(u, previa); sim.recolocarUnidad(u, u.origenX, u.origenY); }
      }
      return alguna;
    }
    case 'encarar': {
      if (!numero(orden.rumbo)) return false;
      for (const u of unidades) { if (desplegando) { const sitio = sim.posicionDespliegue(u, u.origenX, u.origenY, orden.rumbo, zona); if (sitio) sim.recolocarUnidad(u, sitio[0], sitio[1], orden.rumbo); } else if (u.orden === 'formar') u.rumboFinal = orden.rumbo; }
      return true;
    }
    case 'fuego': {          // flechas de fuego (2026-10-21): solo las tropas que pueden (arqueros a pie)
      let alguna = false;
      for (const u of unidades) if (u.stats.flechasFuego) { u.fuego = !!orden.activa; alguna = true; }
      return alguna;
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
  // (seguridad S1, 2026-10-19) además, todo lo que decide si un bando está derrotado y quién gana (bando y unidad de cada soldado,
  // y de cada unidad su bando, sus vivos y si huye, se retira o puede volver): así el servidor puede fiarse de un estado cuyo
  // resumen coincide con el de los dos jugadores para decidir el final (antes un estado trucado en esos campos pasaba)
  mezclar(sim.cantidad);
  for (let i = 0; i < sim.cantidad; i++) { mezclar(Math.round(sim.posX[i] * 100)); mezclar(Math.round(sim.posY[i] * 100)); mezclar(Math.round(sim.vida[i] * 10)); mezclar(sim.estado[i]); mezclar(sim.equipo[i]); mezclar(sim.unidadDe[i]); }
  for (const u of sim.unidades) { mezclar(Math.round(u.moral * 10)); mezclar(Math.round(u.cohesion * 10)); mezclar(Math.round(u.origenX * 100)); mezclar(Math.round(u.origenY * 100)); mezclar(u.equipo); mezclar(u.vivos); mezclar(u.huyendo ? 1 : 0); mezclar(u.retirada ? 1 : 0); mezclar(u.puedeVolver ? 1 : 0); }
  // incendios (2026-10-21): solo si los hay, así el resumen de una batalla sin fuego es el de siempre
  if (sim.ardiendo && (sim.ardiendo.length || sim.quemadas.length)) { mezclar(sim.ardiendo.length); mezclar(sim.quemadas.length); for (const a of sim.ardiendo) { mezclar(a[0]); mezclar(a[1]); } }
  mezclar(sim.paso);
  return h.toString(16);
}
