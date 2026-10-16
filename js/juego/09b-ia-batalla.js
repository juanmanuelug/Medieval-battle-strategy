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
function ordenesGeneralIA(sim, u, unidadesIA, t, enDefensa, estado) {
  const enPie = equipo => sim.unidades.reduce((s, x) => s + (x.equipo === equipo && !x.esGeneral && !x.huyendo ? x.vivos : 0), 0);
  const propios = enPie(1), delJugador = enPie(0);
  if (!estado.iniciales) estado.iniciales = [Math.max(1, delJugador), Math.max(1, propios)];   // ejércitos al empezar (sin las guardias)
  const fraccionPropia = propios / estado.iniciales[1], fraccionJugador = delJugador / estado.iniciales[0];
  const jugadorRoto = sim.estadisticas.vivos[0] - sim.estadisticas.huyendo[0] < 40;
  const perdiendo = propios === 0 || fraccionPropia < GENERAL_DESESPERADO || (fraccionPropia < fraccionJugador * GENERAL_PERDIENDO && fraccionPropia < 1 - GENERAL_PERDIDAS_MINIMAS);
  const enemigos = sim.unidades.filter(e => e.equipo === 0 && e.vivos > 0 && !e.huyendo);
  let cercano = null, dCercano = Infinity;
  for (const e of enemigos) { const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY); if (d < dCercano) { dCercano = d; cercano = e; } }
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
  for (const a of unidadesIA) if (!a.esGeneral && a.vivos > 0 && !a.huyendo) { sx += a.centroX * a.vivos; sy += a.centroY * a.vivos; n += a.vivos; }
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

/* Antes del despliegue: con actitud defensiva, si hay una colina en su mitad del campo cerca de su línea, el ejército de la
   IA se desplaza entero para plantarse en ella (manteniendo su disposición). Devuelve la colina elegida o null. */
function prepararDefensaIA(sim, unidadesIA, terreno) {
  if (!terreno || !unidadesIA.length) return null;
  let sx = 0, sy = 0; for (const u of unidadesIA) { sx += u.origenX; sy += u.origenY; }
  const centroX = sx / unidadesIA.length, centroY = sy / unidadesIA.length;
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
    sim.recolocarUnidad(u, x, y, u.rumbo);
  }
  return mejor;
}

function inteligenciaArtificialBatalla(sim, unidadesIA, nivelIA, actitudElegida) {
  if (sim.paso % 30 !== 0) return;
  const t = sim.tiempo;
  const dificil = nivelIA.presupuesto >= 1.3;
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
  }
  if (estado.actitud === 'defensiva') iaDefensiva(sim, unidadesIA, estado, t);
  else iaOfensiva(sim, unidadesIA, estado, t, dificil);
}

function iaOfensiva(sim, unidadesIA, estado, t, dificil) {
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
      const trabada = u.luchando > 0;
      if (objetivo && !trabada && d > 15 && d < (dificil ? 55 : 45) && u.orden !== 'cargar' && t > 5) { sim.formar(u, 'cuna'); sim.ordenar(u, 'cargar'); }
      else if (u.orden === 'formar' && t > 4) sim.ordenar(u, 'avanzar');
      else if (u.orden === 'cargar' && objetivo && d <= 15 && trabada) sim.ordenar(u, 'avanzar');
      continue;
    }
    // infantería
    if (u.orden === 'formar' && t > 3) { if (u.formacion.clave === 'muro') sim.formar(u, 'linea'); sim.ordenar(u, 'avanzar'); continue; }
    if (u.orden === 'avanzar') {
      if (u.formacion.clave === 'muro') sim.formar(u, 'linea');
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

function iaDefensiva(sim, unidadesIA, estado, t) {
  // enemigos vivos y aliados trabados (para socorrer)
  const enemigos = sim.unidades.filter(e => e.equipo === 0 && e.vivos > 0 && !e.huyendo);
  const enemigoMasCercanoA = (x, y) => { let mejor = null, mejorD = Infinity; for (const e of enemigos) { const d = distancia(x, y, e.centroX, e.centroY); if (d < mejorD) { mejorD = d; mejor = e; } } return { enemigo: mejor, d: mejorD }; };
  const aliadoTrabadoCerca = (u, radio) => { for (const a of unidadesIA) if (a !== u && a.vivos > 0 && !a.huyendo && a.luchando > 0 && distancia(u.centroX, u.centroY, a.centroX, a.centroY) < radio) return a; return null; };
  for (const u of unidadesIA) {
    if (u.vivos === 0 || u.huyendo) continue;
    const datos = u.stats, puesto = estado.puestos.get(u) || { x: u.origenX, y: u.origenY, rumbo: u.rumbo };
    const amenaza = enemigoMasCercanoA(puesto.x, puesto.y);
    const desdeUnidad = enemigoMasCercanoA(u.centroX, u.centroY);
    const trabada = u.luchando > 0;
    const volverAlPuesto = () => { if (distancia(u.origenX, u.origenY, puesto.x, puesto.y) > 4) sim.ordenar(u, 'mover', puesto.x, puesto.y, puesto.rumbo); else if (u.orden !== 'formar') sim.ordenar(u, 'formar'); };
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
        if (blanco && blanco.vivos > 0) {
          // atacar a una unidad concreta con jinetes no trabados ya es una carga (ordenarAtaque les da la energía de carga)
          if (u.formacion.clave !== 'cuna') sim.formar(u, 'cuna');
          sim.ordenarAtaque(u, blanco, 'correr');
        }
      } else if (atacando && !trabada && amenaza.d > RADIO_CONTRAATAQUE_CABALLERIA + 25 && !socorro) volverAlPuesto();
      else if (u.orden === 'cargar' && trabada) sim.ordenar(u, 'avanzar');
      continue;
    }
    // infantería: en su puesto en línea (lanceros en muro); sale a rechazar al que llega y vuelve
    if (u.orden === 'formar' && !trabada && distancia(u.origenX, u.origenY, puesto.x, puesto.y) <= 4) {
      const formacionPuesto = u.stats.antiCaballeria ? 'muro' : 'linea';
      if (u.formacion.clave !== formacionPuesto) sim.formar(u, formacionPuesto);
    }
    const socorro = aliadoTrabadoCerca(u, RADIO_SOCORRO);
    const atacando = u.orden === 'avanzar' || u.orden === 'atacar';
    if (!atacando && (amenaza.d < RADIO_CONTRAATAQUE_INFANTERIA || desdeUnidad.d < 12 || socorro)) {
      if (u.formacion.clave === 'muro' && !u.stats.antiCaballeria) sim.formar(u, 'linea');
      const blanco = socorro && socorro.objetivoUnidad >= 0 ? sim.unidades[socorro.objetivoUnidad] : desdeUnidad.enemigo;
      if (blanco && blanco.vivos > 0) sim.ordenarAtaque(u, blanco, distancia(u.centroX, u.centroY, blanco.centroX, blanco.centroY) < DISTANCIA_CARRERA_IA ? 'correr' : 'andar');
    } else if (atacando && !trabada && amenaza.d > RADIO_CONTRAATAQUE_INFANTERIA + 15 && desdeUnidad.d > 20 && !socorro) volverAlPuesto();
  }
}
