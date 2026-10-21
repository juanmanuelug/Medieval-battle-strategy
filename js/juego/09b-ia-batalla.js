'use strict';
/* ---------- IA de batalla ----------
   Decide cada segundo las órdenes de las unidades de la IA. Separada de 10-batalla.js para poder probarla en Node.
   nivelIA = entrada de DIFICULTADES (presupuesto marca la agresividad: ≥ 1,3 es la IA "difícil").
   actitud = 'ofensiva' | 'defensiva' (elegida por el jugador junto a la dificultad, 2026-10-10).

   OFENSIVA: avanza con todo el ejército.
   - General (ordenesGeneralIA, 2026-10-16): se mantiene GENERAL_DETRAS m detrás del centro de su ejército (mirando al
     enemigo) para cubrirlo con su aura; carga si el enemigo está muy cerca, si el jugador está roto o si va perdiendo.
   - Caballería: avanza; carga cuando tiene carrerilla (más de 15 m) y no está trabada; trabada cerca, pelea.
   - Tiradores: orden abierta, se acercan hasta su alcance y disparan; si el enemigo se echa encima, pelean.
   - Infantería: avanza AL PASO de lejos y pasa A LA CARRERA a menos de DISTANCIA_CARRERA si no está cansada, o para
     reforzar un combate ya trabado de un aliado; vuelve al paso si la fatiga sube demasiado.

   DEFENSIVA: espera el ataque en su puesto (en una colina cercana si la hay: prepararDefensaIA, antes del despliegue).
   - Infantería: forma en línea (los lanceros en muro de escudos) y no se mueve; sale a por un enemigo que llega a menos de
     RADIO_CONTRAATAQUE_INFANTERIA de su puesto o a socorrer a un aliado trabado cerca, y vuelve al puesto cuando ya no hay
     nadie a quien rechazar.
   - Tiradores: orden abierta, disparan desde su puesto a lo que entre en alcance; no avanzan.
   - Caballería: espera en las alas y contracarga a lo que se acerque a RADIO_CONTRAATAQUE_CABALLERIA o a quien esté
     trabado con un aliado; después vuelve a su puesto.
   - General: se queda en su puesto, detrás; carga si el enemigo está encima, si el jugador está roto o si va perdiendo.
   - Paciencia: si pierde más de PACIENCIA_BAJAS de sus soldados sin haber llegado al cuerpo a cuerpo (le están acribillando
     desde lejos) o pasan PACIENCIA_SEGUNDOS sin ningún choque, pasa a ofensiva para el resto de la batalla. */
const DISTANCIA_CARRERA_IA = 35;        // m: desde aquí la infantería corre hacia el enemigo
const FATIGA_MAXIMA_CARRERA_IA = 0.45;  // por encima, vuelve al paso para recuperar
const RADIO_CONTRAATAQUE_INFANTERIA = 22;   // m desde el puesto: la infantería defensora sale a rechazar al que llega
const RADIO_CONTRAATAQUE_CABALLERIA = 60;   // m desde el puesto: la caballería defensora contracarga
const RADIO_SOCORRO = 40;                   // m: un defensor acude a un aliado trabado a esta distancia
const PACIENCIA_BAJAS = 0.15;               // fracción de soldados perdidos sin cuerpo a cuerpo antes de pasar al ataque
const PACIENCIA_SEGUNDOS = 240;             // segundos sin ningún choque antes de pasar al ataque
const GENERAL_DETRAS = 15;                  // m detrás del centro de su ejército a los que se coloca el general de la IA
const GENERAL_PERDIENDO = 0.7;              // va perdiendo si la fracción que le queda de su ejército baja de esto × la del jugador…
const GENERAL_PERDIDAS_MINIMAS = 0.15;      // …y ya ha perdido al menos esta fracción (unas pocas bajas al principio no cuentan)
const GENERAL_DESESPERADO = 0.35;           // o si le queda menos de esta fracción de su ejército, pase lo que pase con el jugador

/* El general de la IA (2026-10-16, pedido del usuario: con su ejército destruido se quedaba parado sin luchar). Cada segundo:
   - Carga si tiene un enemigo encima (25 m), si el jugador está roto (menos de 40 en pie) o si va perdiendo. «Perdiendo» mira
     cómo va la batalla, no el tamaño de los ejércitos (empezar en inferioridad no es ir perdiendo): la fracción que le queda de
     su ejército (soldados en pie sin la guardia, frente a los del principio) baja de GENERAL_PERDIENDO × la del jugador habiendo
     perdido ya GENERAL_PERDIDAS_MINIMAS, o de GENERAL_DESESPERADO, o no le queda ninguna tropa. Va en cuña a por la
     unidad del jugador que pelea con los suyos más cerca de él; si no hay ninguna, a por la más cercana.
   - Si no, se queda junto a sus tropas: en ofensiva, GENERAL_DETRAS m detrás del centro de su ejército, del lado contrario al
     jugador, para que su aura de moral las cubra; en defensiva, en su puesto. */
// (2026-10-19) piezas comunes de la IA: el equipo de la IA y el del rival (antes, el rival era el 0 escrito a mano), una unidad
// que sigue en la pelea, los enemigos que siguen en ella, los soldados en pie de un bando y el aliado trabado junto a un punto
const equipoDeLaIA = unidadesIA => unidadesIA[0] ? unidadesIA[0].equipo : 1;
const unidadActiva = u => u.vivos > 0 && !u.huyendo;
const enemigosActivos = (sim, equipoIA) => sim.unidades.filter(e => e.equipo !== equipoIA && unidadActiva(e));
// soldados en pie (sin los que huyen) de un bando; sinGeneral: sin contar la guardia del general
const soldadosEnPie = (sim, equipo, sinGeneral) => sim.unidades.reduce((s, x) => s + (x.equipo === equipo && !(sinGeneral && x.esGeneral) && !x.huyendo ? x.vivos : 0), 0);
function aliadoTrabadoJunto(unidadesIA, excluida, x, y, radio) { for (const a of unidadesIA) if (a !== excluida && unidadActiva(a) && a.luchando > 0 && distancia(x, y, a.centroX, a.centroY) < radio) return a; return null; }
function enemigoMasCercano(enemigos, x, y) { let enemigo = null, d = Infinity; for (const e of enemigos) { const de = distancia(x, y, e.centroX, e.centroY); if (de < d) { d = de; enemigo = e; } } return { enemigo, d }; }

function ordenesGeneralIA(sim, u, unidadesIA, t, enDefensa, estado) {
  const equipoIA = u.equipo, equipoRival = 1 - equipoIA;
  const propios = soldadosEnPie(sim, equipoIA, true), delJugador = soldadosEnPie(sim, equipoRival, true);
  if (!estado.iniciales) estado.iniciales = [Math.max(1, delJugador), Math.max(1, propios)];   // ejércitos al empezar (sin las guardias)
  const fraccionPropia = propios / estado.iniciales[1], fraccionJugador = delJugador / estado.iniciales[0];
  const jugadorRoto = sim.estadisticas.vivos[equipoRival] - sim.estadisticas.huyendo[equipoRival] < 40;
  const perdiendo = propios === 0 || fraccionPropia < GENERAL_DESESPERADO || (fraccionPropia < fraccionJugador * GENERAL_PERDIENDO && fraccionPropia < 1 - GENERAL_PERDIDAS_MINIMAS);
  const enemigos = enemigosActivos(sim, equipoIA);
  const { enemigo: cercano, d: dCercano } = enemigoMasCercano(enemigos, u.centroX, u.centroY);
  const atacando = u.orden === 'cargar' || u.orden === 'avanzar' || (u.orden === 'atacar' && u.objetivoFijo >= 0 && sim.unidades[u.objetivoFijo].vivos > 0 && !sim.unidades[u.objetivoFijo].huyendo);
  if (t > 20 && (dCercano < 25 || jugadorRoto || perdiendo)) {
    if (atacando || !cercano) return;
    // blanco: la unidad del jugador trabada con los suyos más cercana al general; si no, la más cercana
    let blanco = null, dBlanco = Infinity;
    for (const a of unidadesIA) {
      if (a === u || a.vivos === 0 || a.huyendo || a.luchando === 0 || a.objetivoUnidad < 0) continue;
      const e = sim.unidades[a.objetivoUnidad]; if (!e || e.equipo !== 0 || e.vivos === 0 || e.huyendo) continue;
      const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY); if (d < dBlanco) { dBlanco = d; blanco = e; }
    }
    if (!blanco) blanco = cercano;
    if (u.formacion.clave !== 'cuna') sim.formar(u, 'cuna');
    sim.ordenarAtaque(u, blanco, 'correr');
    return;
  }
  if (enDefensa) return;
  if (sim.paso % 90 !== 0) return;
  // detrás del centro de su ejército, del lado contrario al del jugador
  let sx = 0, sy = 0, n = 0, ex = 0, ey = 0, m = 0;
  for (const a of unidadesIA) if (!a.esGeneral && unidadActiva(a)) { sx += a.centroX * a.vivos; sy += a.centroY * a.vivos; n += a.vivos; }
  for (const e of enemigos) { ex += e.centroX * e.vivos; ey += e.centroY * e.vivos; m += e.vivos; }
  if (!n || !m) return;
  const cx = sx / n, cy = sy / n, hx = ex / m - cx, hy = ey / m - cy, largo = Math.hypot(hx, hy) || 1;
  const x = limitar(cx - hx / largo * GENERAL_DETRAS, 8, CAMPO.ancho - 8), y = limitar(cy - hy / largo * GENERAL_DETRAS, 8, CAMPO.alto - 8);
  if (distancia(u.origenX, u.origenY, x, y) > 8) sim.ordenar(u, 'mover', x, y, Math.atan2(hy, hx));
}
const ACTITUDES_IA = {
  ofensiva: { nombre: 'Ofensiva', descripcion: 'El enemigo avanza con todo su ejército a por el tuyo.' },
  defensiva: { nombre: 'Defensiva', descripcion: 'El enemigo se planta (en una colina si tiene una cerca) y espera tu ataque; contraataca lo que se le acerca. Si le acribillas desde lejos o no atacas en cuatro minutos, pierde la paciencia y ataca.' },
};

/* Fase 2 del terreno (2026-10-16): la carga cuesta arriba pega y aguanta menos, así que la IA no la lanza si perdería más de
   un CARGA_CUESTA_ARRIBA_IA (15 %): sigue avanzando (o esperando) y carga cuando el terreno ya no está en contra. Se mide como en
   la simulación: la subida de los últimos metros de carrera hasta el soldado enemigo más cercano (no el centro de la unidad,
   que en una unidad plantada en lo alto suele quedar ya detrás de la cima, y la IA cargaba cuesta arriba; lo vio el usuario). */
// También cuenta como cuesta arriba un enemigo DESNIVEL_CARGA_IA m o más por encima del jinete, aunque los últimos metros hasta
// él sean llanos o de bajada (unos arqueros justo detrás de la cima: para llegar hay que subir la colina entera)
const CARGA_CUESTA_ARRIBA_IA = 0.85, DESNIVEL_CARGA_IA = 3;
function cargaCuestaArriba(sim, u, enemigo) {
  const frente = sim.soldadoMasCercano(enemigo, u.centroX, u.centroY); if (frente < 0) return false;
  const x = sim.posX[frente], y = sim.posY[frente], d = distancia(u.centroX, u.centroY, x, y) || 1;
  if (sim.alturaEn(x, y) - sim.alturaEn(u.centroX, u.centroY) >= DESNIVEL_CARGA_IA) return true;
  return sim.factorCarga(sim.pendienteDeCarga(x, y, (x - u.centroX) / d, (y - u.centroY) / d)) < CARGA_CUESTA_ARRIBA_IA;
}

/* Blanco de la caballería de la IA (2026-10-16, pedido del usuario): «debería buscar cargar a las tropas que no están en colina
   y, si todas están en colina, cargar contra las más débiles cuerpo a cuerpo, para apoyar a aliados o por la espalda».
   Cada enemigo se puntúa (más es mejor; la distancia resta DISTANCIA_PUNTO por metro):
   · sin cuesta arriba (cargaCuestaArriba falso): BLANCO_IA.libre + debilidad × BLANCO_IA.porDebilidad;
   · cuesta arriba, solo en tres casos: si pelea con un aliado (apoyo), si se le puede coger por la espalda (está trabado con
     otros o da la espalda al jinete: se rodea y se carga desde detrás) o, si no queda otra, el más débil cuerpo a cuerpo.
   Debilidad (0-1): por tipo (tiradores y máquinas, infantería ligera… lanceros de frente casi nada), más si la unidad está
   diezmada o desordenada. Devuelve { blanco, motivo, desdeX, desdeY } con el punto desde el que lanzar la carga, o null. */
// con todos en alto, por orden: apoyo a un aliado, por la espalda y, si no, el más débil (sus puntos máximos quedan por debajo)
/* IA arriesgada (2026-10-18, pedido del usuario): en fácil, la caballería a veces no ve la cuesta: para cada enemigo, en tramos
   de RIESGO_FACIL.tramo s, con probabilidad RIESGO_FACIL.probabilidad lo trata como si no estuviera en alto y, con un impulso
   de puntos, se lanza a cargarle cuesta arriba aunque tenga blancos mejores. Sin sim.azar (la IA no debe tocar el azar de la simulación): un número fijo por unidad, enemigo y tramo. */
const RIESGO_FACIL = { probabilidad: 0.35, tramo: 10, impulso: 45 };   // impulso: puntos de más al blanco en alto (se lanza a por él)
function arriesgaCuesta(sim, u, e) {
  const tramo = Math.floor(sim.tiempo / RIESGO_FACIL.tramo);
  const mezcla = Math.imul((u.id + 1) * 73856093 ^ (e.id + 1) * 19349663 ^ (tramo + 1) * 83492791, 2654435761) >>> 0;
  return (mezcla % 1000) / 1000 < RIESGO_FACIL.probabilidad;
}
const VENTAJA_REMATE = 3;   // la IA defensiva sale a rematar con el triple de soldados en pie que el jugador
const RODEO_PASO = 1.2;   // rad (~70°) de vuelta alrededor del blanco por cada punto de rodeo
const BLANCO_IA = { libre: 100, apoyo: 70, espalda: 60, debil: 20, porDebilidad: 40, distanciaPunto: 0.4, distanciaMaxima: 220, carrerilla: 35, holguraRodeo: 18 };
function debilidadMele(e) {
  const datos = e.stats;
  let base = datos.alcanceTiro || e.sinMunicion ? 1 : datos.artilleria ? 0.9 : datos.antiCaballeria ? 0.05 : datos.montado ? 0.45 : (datos.masa || 1) < 1 ? 0.75 : 0.3;
  if (datos.clave === 'infanteriaLigera') base = Math.max(base, 0.75);
  return limitar(base * (0.6 + 0.4 * (1 - e.vivos / e.total)) + (1 - e.cohesion / 100) * 0.3, 0, 1);
}
function elegirBlancoCaballeriaIA(sim, u, unidadesIA, opciones) {
  const arriesgada = !!(opciones && opciones.arriesgada);
  const maxima = (opciones && opciones.distanciaMaxima) || BLANCO_IA.distanciaMaxima, desdeX = (opciones && opciones.desdeX) || u.centroX, desdeY = (opciones && opciones.desdeY) || u.centroY;
  let mejor = null;
  for (const e of sim.unidades) {
    if (e.equipo === u.equipo || e.vivos === 0 || e.huyendo) continue;
    const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY);
    if (distancia(desdeX, desdeY, e.centroX, e.centroY) > maxima) continue;
    const debilidad = debilidadMele(e);
    // hacia dónde mira el enemigo y si el jinete le queda a la espalda
    const desdeJinete = normalizarAngulo(Math.atan2(u.centroY - e.centroY, u.centroX - e.centroX) - e.rumbo);
    const daLaEspalda = Math.abs(desdeJinete) > ANGULO_ESPALDA;
    const conAliado = e.luchando > 0 && !!aliadoTrabadoJunto(unidadesIA, u, e.centroX, e.centroY, 25);
    let puntos, motivo, carrerillaX = null, carrerillaY = null;
    const cuestaArriba = cargaCuestaArriba(sim, u, e), seArriesga = cuestaArriba && arriesgada && arriesgaCuesta(sim, u, e);
    if (!cuestaArriba || seArriesga) {
      puntos = BLANCO_IA.libre + debilidad * BLANCO_IA.porDebilidad + (seArriesga ? RIESGO_FACIL.impulso : 0); motivo = seArriesga ? 'arriesgada' : 'libre';
      if (e.stats.antiCaballeria && !daLaEspalda && e.luchando === 0) puntos -= 60;
    }
    else if (conAliado) { puntos = BLANCO_IA.apoyo + debilidad * 10; motivo = 'apoyo'; }
    else if (daLaEspalda || e.luchando > 0) {
      puntos = BLANCO_IA.espalda + debilidad * 10; motivo = 'espalda';
      // la carga se lanza desde detrás de la unidad (al otro lado de hacia donde mira)
      carrerillaX = limitar(e.centroX - Math.cos(e.rumbo) * BLANCO_IA.carrerilla, 6, CAMPO.ancho - 6); carrerillaY = limitar(e.centroY - Math.sin(e.rumbo) * BLANCO_IA.carrerilla, 6, CAMPO.alto - 6);
    } else { puntos = BLANCO_IA.debil + debilidad * BLANCO_IA.porDebilidad; motivo = 'débil'; if (e.stats.antiCaballeria) puntos -= 60; }
    // (fase C) tras un paso: la distancia por el paso que se usaría y, si todos están defendidos, castigo (cargar de frente en un paso)
    const camino = caminoPorPasosIA(sim, u, e);
    if (camino) { puntos -= camino.distancia * BLANCO_IA.distanciaPunto; if (camino.todosDefendidos) puntos -= CASTIGO_PASO_DEFENDIDO; }
    else puntos -= d * BLANCO_IA.distanciaPunto;
    if (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && e.id < mejor.blanco.id)) mejor = { blanco: e, motivo, puntos, desdeX: carrerillaX, desdeY: carrerillaY };
  }
  return mejor;
}
/* Lleva a cabo la elección: a distancia de carga, carga en cuña (ordenarAtaque da la energía de carga a los jinetes no trabados);
   más lejos, se acerca al trote hacia el punto de carrerilla (por la espalda, detrás del enemigo; si no, a BLANCO_IA.carrerilla m
   de él por el lado del jinete). Solo se repite la orden si cambia el blanco o el punto se ha movido, para no renovar la carga sin
   fin ni frenar la marcha. Devuelve true si ha dado una orden. */
/* ¿Hay otra unidad enemiga entre el jinete y (x, y)? La más cercana al jinete cuyo centro queda a menos de media anchura más
   unos metros de la recta, entre los dos extremos; o null. */
function unidadEnMedio(sim, u, x, y, blanco) {
  const dx = x - u.centroX, dy = y - u.centroY, largo = Math.hypot(dx, dy) || 1, dirX = dx / largo, dirY = dy / largo;
  let mejor = null, mejorAvance = Infinity;
  for (const o of sim.unidades) {
    if (o === blanco || o.equipo === u.equipo || o.vivos === 0 || o.huyendo) continue;
    const ox = o.centroX - u.centroX, oy = o.centroY - u.centroY, avance = ox * dirX + oy * dirY, lado = Math.abs(-ox * dirY + oy * dirX);
    if (avance < 5 || avance > largo - 3) continue;
    if (lado < sim.dimensionesUnidad(o).ancho / 2 + 5 && avance < mejorAvance) { mejorAvance = avance; mejor = o; }
  }
  return mejor;
}
/* Paso alternativo (fase C, 2026-10-19): si para llegar al blanco hay que cruzar un paso (la recta está cortada) y el más corto
   (el que menos alarga el camino) tiene enemigos a menos de PASO_DEFENDIDO m, y hay otro sin defender, la caballería va primero
   a ese otro. Devuelve el punto del paso, o null. */
const PASO_DEFENDIDO = 30, CASTIGO_PASO_DEFENDIDO = 35;
/* Camino hasta un enemigo cuando hay pasos que cruzar (la recta está cortada): la distancia de verdad (por el paso que se usaría),
   el paso (si el más corto está defendido y hay otro libre, el libre) y si todos están defendidos. null si se va en recta. */
function caminoPorPasosIA(sim, u, e) {
  if (!sim.hayBloqueos || !sim.hayBloqueos()) return null;
  const pasos = sim.terreno.pasosClave(); if (!pasos.length) return null;
  const rodeo = p => distancia(u.centroX, u.centroY, p[0], p[1]) + distancia(p[0], p[1], e.centroX, e.centroY);
  const defendido = p => sim.unidades.some(o => o.equipo !== u.equipo && unidadActiva(o) && distancia(o.centroX, o.centroY, p[0], p[1]) < PASO_DEFENDIDO);
  // también cuenta como cruzar un paso ir en recta A TRAVÉS de uno defendido (la recta pasa a menos de 15 m de su centro)
  const alSegmento = p => { const dx = e.centroX - u.centroX, dy = e.centroY - u.centroY, l2 = dx * dx + dy * dy || 1, s = limitar(((p[0] - u.centroX) * dx + (p[1] - u.centroY) * dy) / l2, 0, 1); return distancia(p[0], p[1], u.centroX + dx * s, u.centroY + dy * s); };
  if (sim.terreno.rectaLibre(u.centroX, u.centroY, e.centroX, e.centroY, HOLGURA_RECTA) && !pasos.some(p => alSegmento(p) < 15 && defendido(p))) return null;
  const ordenados = pasos.slice().sort((a, b) => rodeo(a) - rodeo(b) || a[1] - b[1]);
  const libre = ordenados.find(p => !defendido(p));
  const paso = libre || ordenados[0];
  return { distancia: rodeo(paso), paso, cortoDefendido: defendido(ordenados[0]), todosDefendidos: !libre };
}
// una vez alcanzado el paso libre se recuerda (u.pasoUsadoIA) y no se vuelve a mandar a él: si no, al alejarse unos metros de su
// centro la IA la devolvía al paso y la caballería iba y venía en él
function pasoAlternativoIA(sim, u, e) {
  const camino = caminoPorPasosIA(sim, u, e);
  if (!camino || !camino.cortoDefendido || camino.todosDefendidos) return null;
  if (u.pasoUsadoIA && distancia(u.pasoUsadoIA[0], u.pasoUsadoIA[1], camino.paso[0], camino.paso[1]) < 5) return null;
  if (distancia(u.centroX, u.centroY, camino.paso[0], camino.paso[1]) < 12) { u.pasoUsadoIA = camino.paso.slice(); return null; }
  return camino.paso;
}
function cargarBlancoIA(sim, u, eleccion, alcanceCarga) {
  if (!eleccion) return false;
  const e = eleccion.blanco, plan = u.planCargaIA;
  const porOtroPaso = pasoAlternativoIA(sim, u, e);
  if (porOtroPaso) {
    if (plan && plan.id === e.id && plan.porPaso && u.orden === 'mover') return false;
    sim.ordenar(u, 'mover', porOtroPaso[0], porOtroPaso[1], Math.atan2(e.centroY - porOtroPaso[1], e.centroX - porOtroPaso[0]), 'correr');
    u.planCargaIA = { id: e.id, x: porOtroPaso[0], y: porOtroPaso[1], carga: false, porPaso: true };
    return true;
  }
  // hay que cruzar, y el paso que toca está libre: se ataca y la simulación lleva la ruta (la carrerilla y los rodeos de abajo
  // suponen ir en recta y, con la roca en medio, ponían puntos dentro de ella: la caballería iba y venía sin cruzar)
  const camino = caminoPorPasosIA(sim, u, e);
  if (camino && !camino.todosDefendidos) {
    if (u.orden === 'atacar' && u.objetivoFijo === e.id) return false;
    if (u.formacion.clave !== 'cuna') sim.formar(u, 'cuna');
    sim.ordenarAtaque(u, e, 'correr'); u.planCargaIA = { id: e.id, carga: true, porRuta: true };
    return true;
  }
  let puntoX = eleccion.desdeX, puntoY = eleccion.desdeY;
  if (puntoX === null) { const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY) || 1; puntoX = e.centroX + (u.centroX - e.centroX) / d * BLANCO_IA.carrerilla; puntoY = e.centroY + (u.centroY - e.centroY) / d * BLANCO_IA.carrerilla; }
  /* otra unidad enemiga en medio (de la línea de carga hasta el blanco o del camino al punto de carrerilla): se da la vuelta por
     fuera de un círculo que envuelve al blanco y a los enemigos que tiene cerca, de RODEO_PASO en RODEO_PASO hacia su espalda (el
     lado de la vuelta, el más despejado), y desde cada punto se vuelve a decidir; cuando la línea queda libre, se carga. Así unos
     arqueros metidos entre dos infanterías se cogen por detrás, en vez de estrellarse contra la infantería. */
  const estorbo = unidadEnMedio(sim, u, e.centroX, e.centroY, e) || unidadEnMedio(sim, u, puntoX, puntoY, e);
  if (estorbo) {
    let radio = 25;
    for (const o of sim.unidades) if (o.equipo !== u.equipo && unidadActiva(o) && o !== e && distancia(o.centroX, o.centroY, e.centroX, e.centroY) < 50) radio = Math.max(radio, distancia(o.centroX, o.centroY, e.centroX, e.centroY) + sim.dimensionesUnidad(o).ancho / 2 + BLANCO_IA.holguraRodeo);
    const anguloJinete = Math.atan2(u.centroY - e.centroY, u.centroX - e.centroX), anguloEspalda = e.rumbo + Math.PI;
    const falta = normalizarAngulo(anguloEspalda - anguloJinete);
    const enCirculo = angulo => [limitar(e.centroX + Math.cos(angulo) * radio, 6, CAMPO.ancho - 6), limitar(e.centroY + Math.sin(angulo) * radio, 6, CAMPO.alto - 6)];
    let destino;
    if (Math.abs(falta) <= RODEO_PASO) destino = enCirculo(anguloEspalda);
    else {
      // vuelta por el lado más corto, salvo que por ahí el punto se salga del campo (queda pegado al borde) y por el otro no
      const sentido = Math.sign(falta) || 1, porCorto = enCirculo(anguloJinete + sentido * RODEO_PASO), porLargo = enCirculo(anguloJinete - sentido * RODEO_PASO);
      const recortado = ([x, y], angulo) => Math.abs(x - (e.centroX + Math.cos(angulo) * radio)) + Math.abs(y - (e.centroY + Math.sin(angulo) * radio)) > 2;
      destino = recortado(porCorto, anguloJinete + sentido * RODEO_PASO) && !recortado(porLargo, anguloJinete - sentido * RODEO_PASO) ? porLargo : porCorto;
    }
    [puntoX, puntoY] = destino;
    if (plan && plan.id === e.id && !plan.carga && u.orden === 'mover' && distancia(plan.x, plan.y, puntoX, puntoY) < 8) return false;
    sim.ordenar(u, 'mover', puntoX, puntoY, Math.atan2(e.centroY - puntoY, e.centroX - puntoX), 'correr');
    u.planCargaIA = { id: e.id, x: puntoX, y: puntoY, carga: false, rodeo: estorbo.id };
    return true;
  }
  const hastaBlanco = distancia(u.centroX, u.centroY, e.centroX, e.centroY), hastaPunto = distancia(u.centroX, u.centroY, puntoX, puntoY);
  const listo = eleccion.motivo === 'espalda' ? hastaPunto < 12 || hastaBlanco < 18 : hastaBlanco < alcanceCarga;
  if (listo) {
    if (u.orden === 'atacar' && u.objetivoFijo === e.id) return false;
    if (u.formacion.clave !== 'cuna') sim.formar(u, 'cuna');
    sim.ordenarAtaque(u, e, 'correr'); u.planCargaIA = { id: e.id, carga: true };
    return true;
  }
  if (plan && plan.id === e.id && !plan.carga && u.orden === 'mover' && distancia(plan.x, plan.y, puntoX, puntoY) < 8) return false;
  sim.ordenar(u, 'mover', puntoX, puntoY, Math.atan2(e.centroY - puntoY, e.centroX - puntoX));
  u.planCargaIA = { id: e.id, x: puntoX, y: puntoY, carga: false };
  return true;
}

/* Antes del despliegue: con actitud defensiva, si hay una colina en su mitad del campo cerca de su línea, el ejército de la
   IA se desplaza entero para plantarse en ella (manteniendo su disposición). Devuelve la colina elegida o null. */
function prepararDefensaIA(sim, unidadesIA, terreno) {
  if (!terreno || !unidadesIA.length) return null;
  let sx = 0, sy = 0; for (const u of unidadesIA) { sx += u.origenX; sy += u.origenY; }
  const centroX = sx / unidadesIA.length, centroY = sy / unidadesIA.length;
  /* (fase C de los pasos, 2026-10-19) con pasos que cruzar (vados del río profundo o pasos de la cordillera), el ejército se planta
     en el borde de su zona frente al paso más cercano a su centro, cerrándolo: quien quiera pasar tiene que salir de él a su frente */
  const pasos = terreno.pasosClave ? terreno.pasosClave() : [];
  if (pasos.length) {
    let paso = pasos[0]; for (const p of pasos) if (Math.abs(p[1] - centroY) < Math.abs(paso[1] - centroY)) paso = p;
    const equipo = unidadesIA[0].equipo, zona = zonaDespliegue(equipo);
    const frenteX = zona ? (equipo === 1 ? zona.x0 + 6 : zona.x1 - 6) : paso[0] + (equipo === 1 ? 50 : -50);
    // el frente del ejército (la unidad más adelantada) en frenteX y su centro a la altura del paso
    let adelantada = unidadesIA[0]; for (const u of unidadesIA) if ((equipo === 1 ? u.origenX < adelantada.origenX : u.origenX > adelantada.origenX)) adelantada = u;
    const dx = frenteX - adelantada.origenX, dy = paso[1] - centroY;
    for (const u of unidadesIA) {
      const x = u.origenX + dx, y = limitar(u.origenY + dy, 8, CAMPO.alto - 8);
      const sitio = sim.posicionDespliegue ? sim.posicionDespliegue(u, x, y, u.rumbo, zona) : [x, y];
      if (sitio) sim.recolocarUnidad(u, sitio[0], sitio[1], u.rumbo);
    }
    return { x: paso[0], y: paso[1], r: 25, paso: true };
  }
  let mejor = null, mejorD = Infinity;
  for (const m of terreno.manchas) {
    if (m.tipo !== TERRENO.COLINA || m.x < CAMPO.ancho * 0.55) continue;            // solo colinas de su mitad
    const d = distancia(centroX, centroY, m.x, m.y);
    if (d < 110 && d < mejorD) { mejorD = d; mejor = m; }
  }
  if (!mejor) return null;
  // el frente queda en la cresta que mira al enemigo: el centro del ejército un poco por detrás del centro de la colina
  const dx = mejor.x + mejor.r * 0.3 - centroX, dy = mejor.y - centroY;
  for (const u of unidadesIA) {
    const x = limitar(u.origenX + dx, CAMPO.ancho * 0.5 + 8, CAMPO.ancho - 8), y = limitar(u.origenY + dy, 8, CAMPO.alto - 8);
    const sitio = sim.posicionDespliegue ? sim.posicionDespliegue(u, x, y, u.rumbo, zonaDespliegue(u.equipo)) : [x, y];
    if (sitio) sim.recolocarUnidad(u, sitio[0], sitio[1], u.rumbo);
  }
  return mejor;
}

/* ---------- Tácticas por dificultad (2026-10-18, pedido del usuario) ----------
   Hasta ahora la dificultad solo cambiaba el ejército de la IA. Además:
   · difícil y brutal: (1) la infantería libre flanquea a la unidad del jugador que ya pelea con una suya (rodea hasta su costado y
     ataca por ahí; solo en ofensiva, la defensiva guarda sus puestos), (2) las unidades de infantería que ven venir una carga
     forman muro de escudos (o cuadro sin escudo) y vuelven a su formación cuando pasa, (3) los tiradores concentran el fuego en un
     mismo blanco: en el que sacarían más bajas (cuántos lo tienen a tiro, cuánto daño pasa y la vida de sus soldados);
   · fácil: la IA decide cada 3 s en vez de cada segundo (inteligenciaArtificialBatalla) y sus tiradores se distraen: cada
     DISTRACCION_FACIL s cada uno cambia a un blanco al azar de los que tiene a tiro; además la caballería se arriesga (arriesgaCuesta).
   Normal queda como estaba. Nada de esto usa sim.azar: las elecciones «al azar» salen de un número fijo por unidad y tramo. */
const DISTANCIA_FLANQUEO = 70, HOLGURA_FLANCO = 8, AMENAZA_CARGA = { distancia: 45, velocidad: 4.5, coseno: 0.75 }, CADA_FUEGO = 90, DISTRACCION_FACIL = 15;
const numeroFijo = (a, b, c) => (Math.imul((a + 1) * 73856093 ^ (b + 1) * 19349663 ^ (c + 1) * 83492791, 2654435761) >>> 0) / 4294967296;
function tacticasPorDificultad(sim, unidadesIA, estado, t, dificil, facil) {
  if (t < 4) return;
  const enemigos = enemigosActivos(sim, equipoDeLaIA(unidadesIA));
  const tiradores = unidadesIA.filter(u => unidadActiva(u) && u.stats.alcanceTiro && !u.sinMunicion && !u.stats.disparaEnMovimiento && !u.trabada);
  if (dificil) {
    reaccionarACargasIA(sim, unidadesIA, enemigos);
    if (estado.actitud === 'ofensiva') flanquearIA(sim, unidadesIA, enemigos);
    if (sim.paso % CADA_FUEGO === 0) concentrarFuegoIA(sim, tiradores, enemigos);
  } else if (facil) {
    for (const u of tiradores) {
      const tramo = Math.floor(t / DISTRACCION_FACIL);
      if (u.tramoDistraccion === tramo) continue;
      u.tramoDistraccion = tramo;
      const aTiro = enemigos.filter(e => distancia(u.centroX, u.centroY, e.centroX, e.centroY) < sim.alcanceTiroDe(u, e) && sim.calcularLineaDeTiro(u, e));
      if (aTiro.length) sim.fijarBlancoTiro(u, aTiro[Math.floor(numeroFijo(u.id, tramo, 7) * aTiro.length)]);
    }
  }
}
// (1) carga a la vista: un jinete enemigo a menos de AMENAZA_CARGA.distancia, lanzado (carga o ataque con impulso, o deprisa) y
// hacia esta unidad. La infantería no trabada forma muro (si tiene escudo) o cuadro, y lo deshace cuando ya no hay amenaza
function reaccionarACargasIA(sim, unidadesIA, enemigos) {
  for (const u of unidadesIA) {
    if (u.vivos === 0 || u.huyendo || u.esGeneral || u.stats.montado || u.stats.alcanceTiro || u.stats.artilleria) continue;
    const amenazada = enemigos.some(e => {
      if (!e.stats.montado) return false;
      const dx = u.centroX - e.centroX, dy = u.centroY - e.centroY, d = Math.hypot(dx, dy) || 1;
      if (d > AMENAZA_CARGA.distancia) return false;
      if (e.objetivoFijo === u.id && (e.orden === 'atacar' || e.orden === 'cargar')) return true;
      const velocidad = Math.hypot(e.velX || 0, e.velY || 0);
      return velocidad > AMENAZA_CARGA.velocidad && ((e.velX || 0) * dx + (e.velY || 0) * dy) / (velocidad * d) > AMENAZA_CARGA.coseno;
    });
    if (amenazada && !u.formacionAntiCarga && u.luchando === 0) {
      const defensa = formacionDisponible(u, 'muro') ? 'muro' : formacionDisponible(u, 'cuadro') ? 'cuadro' : null;
      if (defensa && u.formacion.clave !== defensa) { u.formacionAntiCarga = { previa: u.formacion.clave }; sim.formar(u, defensa); }
    } else if (!amenazada && u.formacionAntiCarga && u.luchando === 0) {
      sim.formar(u, u.formacionAntiCarga.previa === 'muro' || u.formacionAntiCarga.previa === 'cuadro' ? 'linea' : u.formacionAntiCarga.previa);
      u.formacionAntiCarga = null;
    }
  }
}
// (2) flanqueo: a la unidad del jugador que pelea con una de la IA, una infantería libre (sin trabar) de la IA va a su costado (el
// más cercano, a media anchura más HOLGURA_FLANCO m) y desde allí la ataca. Un flanqueador por blanco
function flanquearIA(sim, unidadesIA, enemigos) {
  const flanqueados = new Set(unidadesIA.filter(u => u.planFlanqueoIA && unidadActiva(u)).map(u => u.planFlanqueoIA.id));
  for (const u of unidadesIA) {
    if (u.vivos === 0 || u.huyendo || u.esGeneral || u.stats.montado || u.stats.alcanceTiro || u.stats.artilleria) continue;
    const plan = u.planFlanqueoIA;
    if (u.luchando > 0) { if (plan && u.orden !== 'atacar') u.planFlanqueoIA = null; continue; }
    let blanco = plan ? sim.unidades[plan.id] : null;
    if (blanco && (blanco.vivos === 0 || blanco.huyendo || blanco.luchando === 0)) { u.planFlanqueoIA = null; flanqueados.delete(blanco.id); blanco = null; if (u.orden === 'mover') sim.ordenar(u, 'avanzar'); }
    if (!blanco) {
      let mejorD = DISTANCIA_FLANQUEO;
      for (const e of enemigos) {
        if (e.stats.montado || e.luchando === 0 || flanqueados.has(e.id)) continue;
        const conAliado = unidadesIA.some(a => a !== u && a.vivos > 0 && a.luchando > 0 && distancia(a.centroX, a.centroY, e.centroX, e.centroY) < 25);
        const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY);
        if (conAliado && d < mejorD) { mejorD = d; blanco = e; }
      }
      if (!blanco) continue;
      flanqueados.add(blanco.id);
    }
    if (u.orden === 'atacar' && u.objetivoFijo === blanco.id) continue;            // ya ataca por el flanco
    const ladoX = -Math.sin(blanco.rumbo), ladoY = Math.cos(blanco.rumbo), separacion = sim.dimensionesUnidad(blanco).ancho / 2 + HOLGURA_FLANCO;
    const flancos = [1, -1].map(s => [limitar(blanco.centroX + ladoX * s * separacion, 6, CAMPO.ancho - 6), limitar(blanco.centroY + ladoY * s * separacion, 6, CAMPO.alto - 6)]);
    const [px, py] = distancia(u.centroX, u.centroY, ...flancos[0]) <= distancia(u.centroX, u.centroY, ...flancos[1]) ? flancos[0] : flancos[1];
    if (distancia(u.centroX, u.centroY, px, py) < 10) { if (u.formacion.clave === 'muro') sim.formar(u, 'linea'); sim.ordenarAtaque(u, blanco, 'correr'); u.planFlanqueoIA = { id: blanco.id, x: px, y: py }; continue; }
    if (plan && plan.id === blanco.id && u.orden === 'mover' && distancia(plan.x, plan.y, px, py) < 6) continue;
    sim.ordenar(u, 'mover', px, py, Math.atan2(blanco.centroY - py, blanco.centroX - px), u.fatiga < FATIGA_MAXIMA_CARRERA_IA ? 'correr' : 'andar');
    u.planFlanqueoIA = { id: blanco.id, x: px, y: py };
  }
}
// (3) fuego concentrado: el blanco en el que los tiradores de la IA que lo tienen a tiro (y con línea de tiro) sacarían más bajas;
// todos esos se fijan en él
function concentrarFuegoIA(sim, tiradores, enemigos) {
  if (tiradores.length < 2) return;
  let mejor = null, mejorPuntos = 0;
  for (const e of enemigos) {
    const conTiro = tiradores.filter(u => distancia(u.centroX, u.centroY, e.centroX, e.centroY) < sim.alcanceTiroDe(u, e) * 0.95 && sim.calcularLineaDeTiro(u, e));
    if (!conTiro.length) continue;
    // bajas que sacaría: tiradores con tiro × daño que pasa (armadura y escudo, formación) / vida de cada soldado; algo más si ya
    // está tocado (rematar quebranta la moral)
    const pasa = (1 - (e.stats.proteccionFlechas || 0)) * ((e.formacion && e.formacion.defensaFlecha) || 1) * (e.stats.montado ? 0.7 : 1);
    const puntos = conTiro.length * pasa / Math.max(1, e.stats.vida) * 100 * (1 + 0.5 * (1 - e.vivos / e.total));
    if (puntos > mejorPuntos || (puntos === mejorPuntos && mejor && e.id < mejor.e.id)) { mejorPuntos = puntos; mejor = { e, conTiro }; }
  }
  if (!mejor) return;
  for (const u of mejor.conTiro) if (u.objetivoFijo !== mejor.e.id) sim.fijarBlancoTiro(u, mejor.e);
}

function inteligenciaArtificialBatalla(sim, unidadesIA, nivelIA, actitudElegida) {
  const dificil = nivelIA.tacticas === 'dificil', facil = nivelIA.tacticas === 'facil';   // ver tacticasPorDificultad
  if (sim.paso % (facil ? 90 : 30) !== 0) return;                                   // fácil: decide cada 3 s
  const t = sim.tiempo;
  // estado propio de la IA: la actitud vigente (la defensiva puede pasar a ofensiva) y el puesto de cada unidad
  if (!sim.estadoIA) {
    sim.estadoIA = { actitud: actitudElegida === 'defensiva' ? 'defensiva' : 'ofensiva', actitudInicial: actitudElegida === 'defensiva' ? 'defensiva' : 'ofensiva', huboChoque: false, motivoCambio: null, soldadosIniciales: 0, puestos: new Map() };
    for (const u of unidadesIA) { sim.estadoIA.soldadosIniciales += u.vivos; sim.estadoIA.puestos.set(u, { x: u.origenX, y: u.origenY, rumbo: u.rumbo }); }
  }
  const estado = sim.estadoIA;
  if (!estado.huboChoque && unidadesIA.some(u => u.luchando > 0)) estado.huboChoque = true;
  if (estado.actitud === 'defensiva') {
    const vivosIA = unidadesIA.reduce((s, u) => s + u.vivos, 0);
    const perdidas = 1 - vivosIA / Math.max(1, estado.soldadosIniciales);
    if (!estado.huboChoque && perdidas > PACIENCIA_BAJAS) { estado.actitud = 'ofensiva'; estado.motivoCambio = 'bajas'; }
    else if (!estado.huboChoque && t > PACIENCIA_SEGUNDOS) { estado.actitud = 'ofensiva'; estado.motivoCambio = 'tiempo'; }
    // batalla ganada (2026-10-18): con VENTAJA_REMATE veces los soldados en pie del jugador, sale a rematar (si no, unos pocos
    // supervivientes lejos de su puesto, como el general, dejaban la batalla abierta para siempre)
    else if (estado.huboChoque) {
      const equipoIA = equipoDeLaIA(unidadesIA);
      if (soldadosEnPie(sim, equipoIA, false) >= VENTAJA_REMATE * Math.max(1, soldadosEnPie(sim, 1 - equipoIA, false))) { estado.actitud = 'ofensiva'; estado.motivoCambio = 'ventaja'; }
    }
  }
  if (estado.actitud === 'defensiva') iaDefensiva(sim, unidadesIA, estado, t, facil);
  else iaOfensiva(sim, unidadesIA, estado, t, dificil, facil);
  tacticasPorDificultad(sim, unidadesIA, estado, t, dificil, facil);
}

function iaOfensiva(sim, unidadesIA, estado, t, dificil, facil) {
  for (const u of unidadesIA) {
    if (u.vivos === 0 || u.huyendo) continue;
    const datos = u.stats, objetivo = u.objetivoUnidad >= 0 ? sim.unidades[u.objetivoUnidad] : null;
    const d = objetivo ? distancia(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY) : 999;
    // las unidades que esperaban en su puesto (defensiva que perdió la paciencia) arrancan
    if (estado.motivoCambio && !u.arrancadaIA && !u.esGeneral) { u.arrancadaIA = true; if (u.orden === 'formar' || u.orden === 'mover') { if (u.formacion.clave === 'muro') sim.formar(u, 'linea'); sim.ordenar(u, 'avanzar'); } }
    if (u.esGeneral) { ordenesGeneralIA(sim, u, unidadesIA, t, false, estado); continue; }
    // los tiradores van antes que los jinetes: los arqueros a caballo escaramucean en vez de cargar (2026-10-13)
    if (datos.alcanceTiro) {
      // avanzan hasta su alcance (se detienen al 70 %) disparando; sin flechas o con el enemigo encima, pelean
      if (u.orden === 'formar' || u.orden === 'disparar') { if (u.formacion.clave !== 'abierta') sim.formar(u, 'abierta'); sim.ordenar(u, 'avanzar'); }
      continue;
    }
    if (datos.montado) {
      // (2026-10-16) elige blanco con elegirBlancoCaballeriaIA: primero los que no obligan a cargar cuesta arriba; si todos
      // están en alto, apoyo a aliados, por la espalda o el más débil. En plena carga (a menos de 25 m de su blanco) no cambia
      const trabada = u.luchando > 0;
      if (trabada) { if (u.orden === 'cargar') sim.ordenar(u, 'avanzar'); continue; }
      if (t <= 5) { if (u.orden === 'formar' && t > 4) sim.ordenar(u, 'avanzar'); continue; }
      const fijo = u.objetivoFijo >= 0 ? sim.unidades[u.objetivoFijo] : null;
      const enPlenaCarga = u.orden === 'atacar' && fijo && fijo.vivos > 0 && !fijo.huyendo && distancia(u.centroX, u.centroY, fijo.centroX, fijo.centroY) < 25;
      if (!enPlenaCarga) {
        const eleccion = elegirBlancoCaballeriaIA(sim, u, unidadesIA, { arriesgada: facil });
        if (!cargarBlancoIA(sim, u, eleccion, dificil ? 55 : 45) && !eleccion && u.orden === 'formar') sim.ordenar(u, 'avanzar');
      }
      continue;
    }
    // infantería
    if (u.orden === 'formar' && t > 3) { if (u.formacion.clave === 'muro' && !u.formacionAntiCarga) sim.formar(u, 'linea'); sim.ordenar(u, 'avanzar'); continue; }
    if (u.orden === 'avanzar') {
      if (u.formacion.clave === 'muro' && !u.formacionAntiCarga) sim.formar(u, 'linea');
      const trabada = u.luchando > 0;
      // ¿el objetivo ya está trabado con otra unidad de la IA? entonces correr a reforzar / flanquear
      const objetivoTrabado = !!objetivo && objetivo.luchando > 0;
      const quiereCorrer = !trabada && u.fatiga < FATIGA_MAXIMA_CARRERA_IA && (d < DISTANCIA_CARRERA_IA || (objetivoTrabado && d < 70));
      const debeParar = u.marcha === 'correr' && (u.fatiga > 0.7 || (!quiereCorrer && d > DISTANCIA_CARRERA_IA + 10));
      if (quiereCorrer && u.marcha !== 'correr') sim.ordenar(u, 'avanzar', undefined, undefined, undefined, 'correr');
      else if (debeParar) sim.ordenar(u, 'avanzar', undefined, undefined, undefined, 'andar');
    }
  }
}

function iaDefensiva(sim, unidadesIA, estado, t, facil) {
  // enemigos vivos y aliados trabados (para socorrer)
  const enemigos = enemigosActivos(sim, equipoDeLaIA(unidadesIA));
  const enemigoMasCercanoA = (x, y) => enemigoMasCercano(enemigos, x, y);
  const aliadoTrabadoCerca = (u, radio) => aliadoTrabadoJunto(unidadesIA, u, u.centroX, u.centroY, radio);
  for (const u of unidadesIA) {
    if (u.vivos === 0 || u.huyendo) continue;
    const datos = u.stats, puesto = estado.puestos.get(u) || { x: u.origenX, y: u.origenY, rumbo: u.rumbo };
    const amenaza = enemigoMasCercanoA(puesto.x, puesto.y);
    const desdeUnidad = enemigoMasCercanoA(u.centroX, u.centroY);
    const trabada = u.luchando > 0;
    const volverAlPuesto = () => { u.planCargaIA = null; if (distancia(u.origenX, u.origenY, puesto.x, puesto.y) > 4) sim.ordenar(u, 'mover', puesto.x, puesto.y, puesto.rumbo); else if (u.orden !== 'formar') sim.ordenar(u, 'formar'); };
    if (u.esGeneral) { ordenesGeneralIA(sim, u, unidadesIA, t, true, estado); continue; }
    if (datos.alcanceTiro) {
      // disparan desde su puesto; solo pelean si se les echan encima
      if (u.formacion.clave !== 'abierta' && !trabada) sim.formar(u, 'abierta');
      if (desdeUnidad.d < 10) { if (u.orden !== 'avanzar') sim.ordenar(u, 'avanzar'); }
      else if (u.orden === 'avanzar' && !trabada) volverAlPuesto();
      else if (u.orden === 'formar' && distancia(u.origenX, u.origenY, puesto.x, puesto.y) <= 4) sim.ordenar(u, 'disparar');
      continue;
    }
    if (datos.montado) {
      const socorro = aliadoTrabadoCerca(u, RADIO_CONTRAATAQUE_CABALLERIA + 20);
      const atacando = u.orden === 'cargar' || u.orden === 'atacar' || u.orden === 'avanzar';
      if (!atacando && t > 4 && (amenaza.d < RADIO_CONTRAATAQUE_CABALLERIA || socorro)) {
        const blanco = socorro ? (socorro.objetivoUnidad >= 0 ? sim.unidades[socorro.objetivoUnidad] : amenaza.enemigo) : amenaza.enemigo;
        if (blanco && blanco.vivos > 0 && (socorro || !cargaCuestaArriba(sim, u, blanco) || (facil && arriesgaCuesta(sim, u, blanco)))) {
          // atacar a una unidad concreta con jinetes no trabados ya es una carga (ordenarAtaque les da la energía de carga)
          if (u.formacion.clave !== 'cuna') sim.formar(u, 'cuna');
          sim.ordenarAtaque(u, blanco, 'correr');
        } else if (blanco) {
          // la amenaza más cercana queda cuesta arriba (2026-10-16): otro blanco cerca del puesto con los criterios de
          // elegirBlancoCaballeriaIA (uno que no esté en alto; si no, por la espalda o el más débil)
          cargarBlancoIA(sim, u, elegirBlancoCaballeriaIA(sim, u, unidadesIA, { distanciaMaxima: RADIO_CONTRAATAQUE_CABALLERIA, desdeX: puesto.x, desdeY: puesto.y, arriesgada: facil }), RADIO_CONTRAATAQUE_CABALLERIA);
        }
      } else if ((atacando || (u.orden === 'mover' && u.planCargaIA)) && !trabada && amenaza.d > RADIO_CONTRAATAQUE_CABALLERIA + 25 && !socorro) volverAlPuesto();
      else if (u.orden === 'cargar' && trabada) sim.ordenar(u, 'avanzar');
      continue;
    }
    // infantería: en su puesto en línea (lanceros en muro); sale a rechazar al que llega y vuelve
    if (u.orden === 'formar' && !trabada && !u.formacionAntiCarga && distancia(u.origenX, u.origenY, puesto.x, puesto.y) <= 4) {
      const formacionPuesto = u.stats.antiCaballeria ? 'muro' : 'linea';
      if (u.formacion.clave !== formacionPuesto) sim.formar(u, formacionPuesto);
    }
    const socorro = aliadoTrabadoCerca(u, RADIO_SOCORRO);
    const atacando = u.orden === 'avanzar' || u.orden === 'atacar';
    if (!atacando && (amenaza.d < RADIO_CONTRAATAQUE_INFANTERIA || desdeUnidad.d < 12 || socorro)) {
      if (u.formacion.clave === 'muro' && !u.stats.antiCaballeria && !u.formacionAntiCarga) sim.formar(u, 'linea');
      const blanco = socorro && socorro.objetivoUnidad >= 0 ? sim.unidades[socorro.objetivoUnidad] : desdeUnidad.enemigo;
      if (blanco && blanco.vivos > 0) sim.ordenarAtaque(u, blanco, distancia(u.centroX, u.centroY, blanco.centroX, blanco.centroY) < DISTANCIA_CARRERA_IA ? 'correr' : 'andar');
    } else if (atacando && !trabada && amenaza.d > RADIO_CONTRAATAQUE_INFANTERIA + 15 && desdeUnidad.d > 20 && !socorro) volverAlPuesto();
  }
}
