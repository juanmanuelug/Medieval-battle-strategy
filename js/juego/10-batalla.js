'use strict';
/* ---------- Batalla: montar los ejércitos, bucle, mando del jugador, IA táctica y fin ----------
   Mando estilo RTS: clic izquierdo selecciona (Mayús añade), arrastre izquierdo selecciona por recuadro, Ctrl+A todas,
   G agrupa la selección con el primer número libre (Ctrl+1..9 con uno concreto, Mayús+G deshace) y 1..9 la recupera. Clic derecho sobre el suelo mueve la selección manteniendo las posiciones
   relativas (arrastrando, además fija el rumbo final); clic derecho sobre un enemigo lo ataca (la caballería carga, los
   arqueros disparan). Teclas: F ciclo de formación, H alto, Supr… no. iniciarBatalla(opciones) → mando. */
function colocarEjercito(sim, equipo, ramaClave, ejercito, multMoral) {
  const frenteX = equipo === 0 ? Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE) : Math.round(CAMPO.ancho * (1 - FRENTE_DESPLIEGUE)), rumbo = equipo === 0 ? 0 : Math.PI, signo = equipo === 0 ? 1 : -1;
  const grupos = { infanteria: [], lanceros: [], arqueros: [], caballeria: [] };
  for (const e of ejercito) { const t = e.tipo; (t === 'lanceros' ? grupos.lanceros : t === 'arqueros' ? grupos.arqueros : t === 'caballeriaPesada' ? grupos.caballeria : grupos.infanteria).push(e); }
  const unidades = [];
  const crear = (e, x, y) => {
    const soldados = soldadosDeUnidad(ramaClave, e.tipo);
    const modificadores = modificadoresUnidad(ramaClave, e.tipo, e.nivel);
    if (multMoral) modificadores.moral *= multMoral;                 // rasgos del general propio o temor al enemigo
    const base = TIPOS[TIPO[e.tipo]];
    if (base.cuerpoACuerpoComo) {
      // los tiradores pelean como la tropa equivalente dos niveles por debajo (arqueros veteranos = infantería ligera de milicia)
      const nivelMelee = Math.max(0, e.nivel - 2), baseMelee = TIPOS[TIPO[base.cuerpoACuerpoComo]], mMelee = modificadoresUnidad(ramaClave, base.cuerpoACuerpoComo, nivelMelee);
      modificadores.cuerpoACuerpo = { dano: baseMelee.dano * mMelee.dano, alcance: baseMelee.alcance, intervalo: baseMelee.intervalo };   // solo el daño; la vida sigue siendo la del arquero
    }
    const u = sim.crearUnidad(equipo, e.tipo, x, y, rumbo, soldados, 10, modificadores, nombreUnidad(e.tipo, e.nivel));
    u.nivel = e.nivel; u.rama = ramaClave; u.indiceEjercito = ejercito.indexOf(e); unidades.push(u); return u;   // índice en el ejército: orden de las tarjetas
  };
  // ancho de una unidad en línea (3 filas) más un hueco
  const ancho = e => Math.ceil(soldadosDeUnidad(ramaClave, e.tipo) / 3) * (TIPOS[TIPO[e.tipo]].montado ? SEPARACION_FORMACION.montado : SEPARACION_FORMACION.aPie) + 4;
  const ANCHO_MAX = CAMPO.alto - 24;        // una línea nunca es más ancha que el campo; el resto pasa a otra línea detrás
  // reparte una lista en líneas centradas, cada una `fondo` metros más atrás que la anterior
  const desplegarLineas = (lista, x0, fondo) => {
    let linea = [], anchoLinea = 0, x = x0;
    const volcar = () => { let y = CAMPO.alto / 2 - anchoLinea / 2; for (const e of linea) { const w = ancho(e); crear(e, limitar(x, 8, CAMPO.ancho - 8), limitar(y + w / 2, 8, CAMPO.alto - 8)); y += w; } x -= signo * fondo; linea = []; anchoLinea = 0; };
    for (const e of lista) { const w = ancho(e); if (linea.length && anchoLinea + w > ANCHO_MAX) volcar(); linea.push(e); anchoLinea += w; }
    if (linea.length) volcar();
    return x;                                 // siguiente x libre
  };
  const mitad = Math.ceil(grupos.lanceros.length / 2);
  const frente = [...grupos.lanceros.slice(0, mitad), ...grupos.infanteria, ...grupos.lanceros.slice(mitad)];
  const anchoFrente = Math.min(ANCHO_MAX, frente.reduce((s, e) => s + ancho(e), 0));
  let xLibre = desplegarLineas(frente, frenteX, 9);
  xLibre = desplegarLineas(grupos.arqueros, xLibre - signo * 3, 7);
  // caballería en las alas, alternando lados; si no cabe, detrás de los arqueros
  grupos.caballeria.forEach((e, k) => {
    const lado = k % 2 ? 1 : -1, salto = Math.floor(k / 2) * 10;
    let y = CAMPO.alto / 2 + lado * (anchoFrente / 2 + 10 + salto);
    if (y < 10 || y > CAMPO.alto - 10) { crear(e, limitar(xLibre - signo * (4 + salto), 8, CAMPO.ancho - 8), CAMPO.alto / 2 + lado * (anchoFrente / 4)); return; }
    crear(e, limitar(frenteX - signo * (6 + salto), 8, CAMPO.ancho - 8), y);
  });
  return unidades;
}

// El general de cada bando: guardia montada detrás del centro, con aura de moral. efectos: los del general del jugador
// (rasgos) o null para el neutro (IA y batallas en red)
function crearGeneralBatalla(sim, equipo, ramaClave, nombre, efectos) {
  const frente = Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE), x = equipo === 0 ? frente - 20 : CAMPO.ancho - frente + 20, rumbo = equipo === 0 ? 0 : Math.PI;
  const extra = efectos || { multMoralPropia: 1, multGuardiaDano: 1 };
  const u = sim.crearUnidad(equipo, GENERAL.tipo, x, CAMPO.alto / 2, rumbo, GENERAL.soldados, 6, Object.assign({}, GENERAL.modificadores, { moral: GENERAL.modificadores.moral * RAMAS[ramaClave].moral * (extra.multMoralPropia || 1), dano: GENERAL.modificadores.dano * (extra.multGuardiaDano || 1) }), nombre);
  u.esGeneral = true; u.rama = ramaClave; u.nivel = NIVELES.length - 1; sim.formar(u, 'cuna'); return u;
}
/* Batalla en red (multijugador, paso 3): la simulación se monta igual en el servidor y en los dos navegadores a partir de la
   ficha del servidor ({ semilla, clima, jugadores: [{ nombre, equipo, rama, ejercito }] }). Sin rasgos del general ni temor:
   los dos bandos en igualdad. → { sim, terreno, unidades: [unidades del equipo 0, unidades del equipo 1] } */
function montarSimulacionRed(ficha) {
  const terreno = typeof Terreno !== 'undefined' ? new Terreno(ficha.semilla) : null;
  const sim = new Simulacion({ semilla: ficha.semilla, terreno, clima: ficha.clima });
  const jugadores = [0, 1].map(equipo => ficha.jugadores.find(j => j.equipo === equipo));
  const unidades = jugadores.map((j, equipo) => colocarEjercito(sim, equipo, j.rama, j.ejercito));
  jugadores.forEach((j, equipo) => unidades[equipo].push(crearGeneralBatalla(sim, equipo, j.rama, 'Guardia de ' + j.nombre, null)));
  sim.auraPorEquipo = [{ radio: 35, moral: 1.5 }, { radio: 35, moral: 1.5 }];
  sim.recontar();
  return { sim, terreno, unidades };
}
// Quién gana cuando un bando queda derrotado (el mismo criterio en la batalla individual y en el servidor)
function ganadorBatalla(sim) {
  const e = sim.estadisticas;
  return !sim.equipoDerrotado(0) || (sim.equipoDerrotado(1) && e.vivos[0] - e.huyendo[0] > e.vivos[1] - e.huyendo[1]) ? 0 : 1;
}

/* opciones.red (batalla en red): { ficha, equipo, enviar(orden), listoDespliegue(), rendirse(), resumen(n, h), reanudacion? }.
   En red no hay IA, ni pausa, ni velocidad: el servidor reparte los turnos (recibirTurno) y decide el final. Con
   red.reanudacion (volver a una batalla tras una desconexión: { desplegando, listos, estado | ordenesPropias }) la simulación
   recién montada se pone al día: con el estado completo que manda el servidor o, en el despliegue, rehaciendo las órdenes
   propias. Durante el despliegue en red no se ven las tropas del rival (el servidor tampoco manda sus órdenes hasta empezar).
   El jugador de la derecha ve el campo girado 180° (su ejército abajo a la izquierda, como el de la izquierda).
   Pausa en red: la pide el jugador (red.pedirPausa) y la confirma el servidor si el rival la acepta (pausaRed(true/false)).
   Retraso de las órdenes: cada orden lleva un número (k) y, hasta que vuelve del servidor en un turno, se dibuja al momento
   como «en camino» (destino o blanco marcados): el jugador ve su orden aunque la tropa arranque unas décimas después. */
function iniciarBatalla(opciones) {
  const { reino, ramaIA, ejercitoIA, contenedor, texturasBandera, alActualizarHud, alTerminar, dificultad } = opciones;
  const red = opciones.red || null;
  // bando del jugador en esta pantalla: 0 (izquierda) en la batalla individual; en red, el que diga el servidor
  const equipoPropio = red ? red.equipo : 0, equipoRival = 1 - equipoPropio;
  const efectosGeneralPropio = opciones.efectosGeneral || { multMoralPropia: 1, multMoralEnemiga: 1, auraRadio: 35, auraMoral: 1.5, multGuardiaDano: 1 };
  // actitud de la IA: con la defensiva se planta en una colina cercana de su mitad, si la hay (guardia incluida)
  const actitudIA = opciones.actitud === 'defensiva' ? 'defensiva' : 'ofensiva';
  let semilla, terreno, sim, unidadesJugador, unidadesIA, colinaDefensiva = null;
  if (red) {
    const montaje = montarSimulacionRed(red.ficha);
    semilla = red.ficha.semilla; terreno = montaje.terreno; sim = montaje.sim;
    unidadesJugador = montaje.unidades[equipoPropio]; unidadesIA = montaje.unidades[equipoRival];
    const reanudacion = red.reanudacion;
    if (reanudacion && reanudacion.estado) restaurarEstado(sim, reanudacion.estado);
    if (reanudacion && reanudacion.ordenesPropias) for (const orden of reanudacion.ordenesPropias) aplicarOrden(sim, equipoPropio, orden, { desplegando: true });
  } else {
    semilla = (Date.now() % 100000) + 1;
    terreno = typeof Terreno !== 'undefined' ? new Terreno(semilla) : null;
    // clima: el elegido en la batalla personalizada o uno al azar (despejado 55 %, lluvia 20 %, barro 15 %, tormenta 10 %)
    const azarClima = crearAleatorio(semilla + 7), tiradaClima = azarClima.numero();
    const clima = CLIMAS[opciones.clima] ? opciones.clima : tiradaClima < 0.55 ? 'despejado' : tiradaClima < 0.75 ? 'lluvia' : tiradaClima < 0.9 ? 'barro' : 'tormenta';
    sim = new Simulacion({ semilla, terreno, clima });
    unidadesJugador = colocarEjercito(sim, 0, reino.rama, reino.ejercito, efectosGeneralPropio.multMoralPropia);
    unidadesIA = colocarEjercito(sim, 1, ramaIA, ejercitoIA, efectosGeneralPropio.multMoralEnemiga);
    sim.auraPorEquipo = [{ radio: efectosGeneralPropio.auraRadio, moral: efectosGeneralPropio.auraMoral }, { radio: 35, moral: 1.5 }];
    unidadesJugador.push(crearGeneralBatalla(sim, 0, reino.rama, 'Guardia del rey ' + reino.rey, efectosGeneralPropio));
    unidadesIA.push(crearGeneralBatalla(sim, 1, ramaIA, 'Guardia del general enemigo', null));
    colinaDefensiva = actitudIA === 'defensiva' && typeof prepararDefensaIA === 'function' ? prepararDefensaIA(sim, unidadesIA, terreno) : null;
  }
  const sangre = new LienzoSangre(CAMPO.ancho, CAMPO.alto, 6);   // 6 px/m: la sangre y los restos se ven menos pixelados al acercar
  sangre.pintarTerreno(terreno);
  if (sim.clima.barro) sangre.pintarBarro(crearAleatorio(semilla + 11));
  // azar propio para las manchas del suelo: si usaran sim.azar, cada navegador lo gastaría a su ritmo de fotogramas y la
  // simulación dejaría de ser idéntica a la del servidor y a la del rival (batallas en red)
  const azarManchas = crearAleatorio(semilla + 13);
  let pausaRed = false;                  // en red: pausa de común acuerdo en vigor (la decide el servidor)
  let seleccion = [], pausado = false, multiplicador = 1, activo = true, terminada = false, tiempoFin = 0, esperandoRival = !!(red && red.reanudacion && red.reanudacion.desplegando && (red.reanudacion.listos || []).includes(red.equipo));
  // fase de despliegue: la simulación no avanza; el clic derecho recoloca las unidades dentro de la zona propia
  let desplegando = red && red.reanudacion ? !!red.reanudacion.desplegando : opciones.conDespliegue !== false;
  // en red, durante el despliegue el rival no se ve
  const oculto = equipo => !!red && desplegando && equipo === equipoRival;
  const ZONA_DESPLIEGUE = zonaDespliegue(equipoPropio);
  /* Todas las órdenes del jugador pasan por aquí como datos (js/04-ordenes.js): en la batalla individual se aplican al momento;
     en red van al servidor, que las valida, les pone turno y las devuelve a los dos jugadores (se aplican en recibirTurno) */
  let siguienteOrden = 1;
  const ordenesEnCamino = [];            // órdenes enviadas al servidor que aún no han vuelto: { orden, momento }
  function despachar(orden) {
    if (red) { orden.k = siguienteOrden++; ordenesEnCamino.push({ orden, momento: performance.now() }); red.enviar(orden); return; }
    aplicarOrden(sim, equipoPropio, orden, { desplegando });
  }
  const ids = lista => lista.map(u => u.id);
  /* Grupos de unidades: número (1-9) → lista de unidades. Una unidad está como mucho en un grupo. G agrupa la selección con el
     primer número libre, Ctrl+número con ese número, Mayús+G saca la selección de su grupo; el número selecciona el grupo y
     pulsarlo dos veces seguidas centra la cámara en él. */
  const grupos = {};
  function asignarGrupo(numero, lista) {
    for (const k of Object.keys(grupos)) { grupos[k] = grupos[k].filter(u => !lista.includes(u)); if (!grupos[k].length) delete grupos[k]; }
    if (numero !== null && lista.length) grupos[numero] = lista.slice();   // numero null = solo sacarlas de su grupo
    avisar();
  }
  function crearGrupo() {
    const lista = seleccion.filter(u => u.equipo === equipoPropio);
    if (!lista.length) return null;
    // si la selección ya es exactamente un grupo, se queda con su número
    for (const k of Object.keys(grupos)) if (grupos[k].length === lista.length && lista.every(u => grupos[k].includes(u))) return k;
    // número libre: el primero sin grupo (los grupos de unidades ya aniquiladas cuentan como libres)
    let numero = null;
    for (let n = 1; n <= 9 && numero === null; n++) if (!grupos[n] || !grupos[n].some(u => u.vivos > 0)) numero = String(n);
    if (numero === null) return null;
    asignarGrupo(numero, lista);
    return numero;
  }
  // Escaramuza de los arqueros a caballo seleccionados: si alguno la tiene apagada, se enciende en todos; si no, se apaga
  function alternarEscaramuza() {
    const jinetes = seleccion.filter(u => u.equipo === equipoPropio && u.stats.disparaEnMovimiento);
    if (!jinetes.length) return;
    despachar({ a: 'escaramuza', u: ids(jinetes), activa: jinetes.some(u => !u.escaramuza) });
    avisar();
  }
  function deshacerGrupo() { asignarGrupo(null, seleccion.slice()); }
  function grupoDe(u) { for (const k of Object.keys(grupos)) if (grupos[k].includes(u)) return k; return null; }
  let ultimaLlamadaGrupo = { numero: null, momento: 0 };
  function llamarGrupo(numero) {
    const lista = vivas(grupos[numero] || []);
    if (!lista.length) return;
    const ahora = performance.now();
    if (ultimaLlamadaGrupo.numero === numero && ahora - ultimaLlamadaGrupo.momento < 400 && renderizador.centrarEn) {
      // doble pulsación: centrar la cámara en el grupo
      renderizador.centrarEn(lista.reduce((s, u) => s + u.centroX, 0) / lista.length, lista.reduce((s, u) => s + u.centroY, 0) / lista.length);
    }
    ultimaLlamadaGrupo = { numero, momento: ahora };
    seleccionar(lista);
  }
  const vivas = lista => lista.filter(u => u.vivos > 0 && (!u.huyendo || u.retirada));   // las que se retiran formadas aceptan «alto»
  const conductaGeneral = { cargo: false, trabada: false };       // para los rasgos: ¿ordenó cargar a su guardia? ¿llegó a pelear?
  // registro para el mapa del resultado: trayectoria de cada unidad (cada 2 s), muertes y atropellos
  const registroMapa = { trayectorias: sim.unidades.map(u => ({ id: u.id, equipo: u.equipo, nombre: u.nombre, tipo: TIPOS[u.tipo].clave, esGeneral: u.esGeneral, puntos: [[+u.origenX.toFixed(1), +u.origenY.toFixed(1)]] })), muertes: [], atropellos: [] };
  const anotarOrdenGeneral = (lista, orden) => { if (lista.some(u => u.esGeneral) && (orden === 'cargar' || orden === 'atacar' || orden === 'avanzar')) conductaGeneral.cargo = true; };
  const avisar = () => { if (alActualizarHud) alActualizarHud(sim, seleccion, equipoPropio); };

  /* ----- órdenes a la selección ----- */
  /* Mover la selección a un punto. Con varias unidades se forman en una FILA centrada en el punto y perpendicular a la
     dirección de avance (o al rumbo arrastrado), cada una con el ancho de su frente y un hueco entre ellas, conservando el
     orden lateral que ya tienen para que no se crucen. Con `conservarPosiciones` (Alt) se mantienen las posiciones relativas. */
  // Plan de movimiento: dónde queda cada unidad y con qué rumbo. `rumboDibujo` es el rumbo con que se previsualiza la huella;
  // `rumboFinal` el que recibe la orden (null = conservar el actual al llegar). Lo usan moverSeleccion y el arrastre del ratón.
  function planMover(x, y, rumbo, conservarPosiciones) {
    const sel = vivas(seleccion); if (!sel.length) return [];
    const cx = sel.reduce((s, u) => s + u.origenX, 0) / sel.length, cy = sel.reduce((s, u) => s + u.origenY, 0) / sel.length;
    if (sel.length === 1 || conservarPosiciones) {
      return sel.map(u => { const dim = sim.dimensionesUnidad(u); return { u, x: limitar(x + (u.origenX - cx), 3, CAMPO.ancho - 3), y: limitar(y + (u.origenY - cy), 3, CAMPO.alto - 3), rumboFinal: rumbo, rumboDibujo: rumbo !== null ? rumbo : u.rumbo, ancho: dim.ancho, fondo: dim.fondo }; });
    }
    const rumboFila = rumbo !== null ? rumbo : Math.atan2(y - cy, x - cx);
    const lateralX = -Math.sin(rumboFila), lateralY = Math.cos(rumboFila);        // eje de la fila (perpendicular al avance)
    const HUECO = 3;
    const colocacion = sel.map(u => ({ u, dim: sim.dimensionesUnidad(u), lateral: (u.origenX - cx) * lateralX + (u.origenY - cy) * lateralY })).sort((a, b) => a.lateral - b.lateral);
    const anchoTotal = colocacion.reduce((s, c) => s + c.dim.ancho, 0) + HUECO * (colocacion.length - 1);
    let desplazamiento = -anchoTotal / 2;
    return colocacion.map(c => {
      const centro = desplazamiento + c.dim.ancho / 2;
      desplazamiento += c.dim.ancho + HUECO;
      return { u: c.u, x: limitar(x + lateralX * centro, 3, CAMPO.ancho - 3), y: limitar(y + lateralY * centro, 3, CAMPO.alto - 3), rumboFinal: rumboFila, rumboDibujo: rumboFila, ancho: c.dim.ancho, fondo: c.dim.fondo };
    });
  }
  // desplegando, la fila se coloca tal cual, sin andar, recortada a la zona de despliegue (orden «recolocar»)
  function moverSeleccion(x, y, rumbo, marcha, conservarPosiciones) {
    const plan = planMover(x, y, rumbo, conservarPosiciones); if (!plan.length) return;
    despachar({ a: desplegando ? 'recolocar' : 'mover', u: plan.map(p => p.u.id), d: plan.map(p => [p.x, p.y, p.rumboFinal]), m: marcha });
  }
  function atacarSeleccion(enemiga, marcha) { if (desplegando) return; const lista = vivas(seleccion); if (!lista.length) return; anotarOrdenGeneral(lista, 'atacar'); despachar({ a: 'atacar', u: ids(lista), objetivo: enemiga.id, m: marcha }); }
  function ordenSeleccion(orden, marcha) { if (desplegando) return; const lista = vivas(seleccion); if (!lista.length) return; anotarOrdenGeneral(lista, orden); despachar({ a: 'orden', u: ids(lista), orden, m: marcha }); avisar(); }
  // cada unidad solo adopta la formación si le corresponde (formacionDisponible); las demás se quedan como estaban
  function formarSeleccion(clave) { const lista = vivas(seleccion); if (lista.length) despachar({ a: 'formar', u: ids(lista), clave }); avisar(); }
  function encararSeleccion(rumbo) { const lista = vivas(seleccion); if (lista.length) despachar({ a: 'encarar', u: ids(lista), rumbo }); }
  function seleccionar(lista, anadir) { seleccion = anadir ? [...new Set([...seleccion, ...lista])] : lista.slice(); avisar(); }

  // cursores: espada para atacar, bandera para mover, mano para seleccionar (SVG en línea, sin archivos)
  const cursorSvg = (svg, px, py) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${px} ${py}, auto`;
  const CURSOR_ATACAR = cursorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M6 26 L22 10" stroke="#f4f0e6" stroke-width="4" stroke-linecap="round"/><path d="M6 26 L22 10" stroke="#b3202c" stroke-width="2" stroke-linecap="round"/><path d="M20 4 L28 12" stroke="#1a1410" stroke-width="3"/><path d="M10 20 L12 22" stroke="#1a1410" stroke-width="6" stroke-linecap="round"/><circle cx="26" cy="6" r="2.5" fill="#d9a92c"/><circle cx="16" cy="16" r="3" fill="none" stroke="#ff4a3a" stroke-width="1.5"/></svg>', 16, 16);
  const CURSOR_MOVER = cursorSvg('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M8 30 V4" stroke="#1a1410" stroke-width="3"/><path d="M9 5 h16 l-4 5 l4 5 h-16 z" fill="#9ee07a" stroke="#1a1410" stroke-width="1.5"/><ellipse cx="8" cy="30" rx="5" ry="2" fill="none" stroke="#9ee07a" stroke-width="1.5"/></svg>', 8, 30);
  // unidad bajo el puntero: primero por lo que se ve (cuerpo o estandarte, en pantalla) y si no, por cercanía en el suelo
  const buscarUnidad = (equipo, x, y, clientX, clientY) => (clientX !== undefined && renderizador.unidadBajoPuntero(equipo, clientX, clientY)) || sim.unidadEnPunto(equipo, x, y, 4);
  const cursor = (x, y, clientX, clientY) => {
    if (terminada) return 'default';
    // con tropas seleccionadas, el enemigo bajo el puntero manda: en el cuerpo a cuerpo hay propios y enemigos mezclados
    if (seleccion.length && !desplegando && buscarUnidad(equipoRival, x, y, clientX, clientY)) return CURSOR_ATACAR;
    if (buscarUnidad(equipoPropio, x, y, clientX, clientY)) return 'pointer';
    return seleccion.length ? CURSOR_MOVER : 'default';
  };
  let ultimoClic = { id: -1, t: 0 };
  const renderizador = crearRenderizadorIso(contenedor, sim, sangre, {
    texturasBandera,
    cursor,
    terreno,
    clima: sim.clima,
    arte: opciones.arte || null,
    equipoPropio,
    oculto,
    // órdenes en camino (red): las de hace menos de 3 s que el servidor aún no ha devuelto
    ordenesEnCamino: () => { const ahora = performance.now(); while (ordenesEnCamino.length && ahora - ordenesEnCamino[0].momento > 3000) ordenesEnCamino.shift(); return ordenesEnCamino; },
    seleccion: () => seleccion,
    alClic: (x, y, boton, mod) => {
      if (terminada) return;
      const u = buscarUnidad(equipoPropio, x, y, mod.clientX, mod.clientY);
      const ahora = performance.now();
      if (u) {
        // doble clic sobre una unidad: todas las del mismo tipo
        if (ultimoClic.id === u.id && ahora - ultimoClic.t < 400) seleccionar(vivas(unidadesJugador).filter(v => v.tipo === u.tipo && !v.esGeneral === !u.esGeneral), mod.shift);
        else if (mod.shift && seleccion.includes(u)) seleccionar(seleccion.filter(v => v !== u)); else seleccionar([u], mod.shift);
        ultimoClic = { id: u.id, t: ahora };
      } else if (!mod.shift) seleccionar([]);
    },
    alCaja: (x0, y0, x1, y1, mod) => {
      if (terminada) return;
      const dentro = vivas(unidadesJugador).filter(u => { const [px, py] = renderizador.mundoAPantalla(u.origenX, u.origenY); return px >= x0 && px <= x1 && py >= y0 && py <= y1; });
      seleccionar(dentro, mod.shift);
    },
    planMover: (x, y, rumbo, conservar) => terminada ? [] : planMover(x, y, rumbo, conservar),
    alOrden: (x, y, rumbo, mod) => {
      if (terminada || !seleccion.length) return;
      // un clic: al paso; doble clic (o Mayús): a la carrera
      const marcha = mod.doble || mod.shift ? 'correr' : 'andar';
      const enemiga = desplegando ? null : buscarUnidad(equipoRival, x, y, mod.clientX, mod.clientY);
      if (enemiga) atacarSeleccion(enemiga, marcha);
      else if (rumbo !== null && mod.ctrl) encararSeleccion(rumbo);
      else moverSeleccion(x, y, rumbo, marcha, mod.alt);
      avisar();
    },
  });
  renderizador.encuadrarEn(CAMPO.ancho / 2, CAMPO.alto / 2, 2.2);
  if (desplegando && renderizador.mostrarZona) { renderizador.mostrarZona(ZONA_DESPLIEGUE); renderizador.encuadrarEn(equipoPropio === 0 ? Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE) - 12 : CAMPO.ancho - Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE) + 12, CAMPO.alto / 2, 2.6); }
  sim.recontar();

  /* ----- teclado ----- */
  const FORMACION_CICLO = ['linea', 'cuadro', 'columna', 'muro', 'abierta', 'cuna'];
  function tecla(e) {
    if (!activo || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Alt') { e.preventDefault(); return; }        // Alt solo muestra los destinos (lo dibuja el renderizador)
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'a') { e.preventDefault(); seleccionar(vivas(unidadesJugador)); }
    else if (/^[1-9]$/.test(k)) { if (e.ctrlKey) { asignarGrupo(k, seleccion.filter(u => u.equipo === equipoPropio)); e.preventDefault(); } else llamarGrupo(k); }
    else if (k === 'g') { if (e.shiftKey) deshacerGrupo(); else crearGrupo(); }
    else if (k === 'e') alternarEscaramuza();
    else if (k === 'h') ordenSeleccion('formar');
    else if (k === 'a' && !e.ctrlKey) ordenSeleccion('avanzar', e.shiftKey ? 'correr' : 'andar');    // Mayús+A: a la carrera
    else if (k === 'c') ordenSeleccion('cargar');
    else if (k === 'd') ordenSeleccion('disparar', e.shiftKey ? 'correr' : 'andar');
    else if (k === 'f' && seleccion.length) {
      // siguiente formación del ciclo que pueda usar alguna unidad de la selección
      const actual = seleccion[0].formacion.clave;
      for (let paso = 1; paso <= FORMACION_CICLO.length; paso++) { const clave = FORMACION_CICLO[(FORMACION_CICLO.indexOf(actual) + paso) % FORMACION_CICLO.length]; if (seleccion.some(u => formacionDisponible(u, clave))) { formarSeleccion(clave); break; } }
    }
    else if (k === 'escape') seleccionar([]);
    else if (k === 'p') { if (red) { if (pausaRed) red.reanudarPausa(); else red.pedirPausa(); } else { pausado = !pausado; avisar(); } }
  }
  window.addEventListener('keydown', tecla);

  /* ----- IA táctica del equipo 1 ----- */
  const nivelIA = DIFICULTADES[dificultad] || DIFICULTADES.normal;
  // la IA de batalla vive en js/juego/09b-ia-batalla.js (probada en Node)
  function inteligenciaArtificial() { if (!red) inteligenciaArtificialBatalla(sim, unidadesIA, nivelIA, actitudIA); }

  /* ----- minimapa: unidades como puntos por equipo (blanco si huye) y el recuadro de la vista; clic para saltar ----- */
  const minimapa = document.getElementById('minimapa');
  const escalaMini = minimapa ? Math.min(minimapa.width / CAMPO.ancho, minimapa.height / CAMPO.alto) : 1;
  const girada = equipoPropio === 1;
  function pintarMinimapa() {
    if (!minimapa) return;
    const c = minimapa.getContext('2d'), w = CAMPO.ancho * escalaMini, h = CAMPO.alto * escalaMini;
    c.clearRect(0, 0, minimapa.width, minimapa.height);
    // el jugador de la derecha lo ve girado 180°, como el campo
    c.save(); if (girada) { c.translate(w, h); c.scale(-1, -1); }
    c.fillStyle = '#4f6a2d'; c.fillRect(0, 0, w, h);
    if (terreno) for (const m of terreno.manchas) { c.fillStyle = m.tipo === 2 ? '#7a9842' : '#2f4a1e'; c.beginPath(); for (let k = 0; k <= 24; k++) { const a = -Math.PI + k / 24 * 2 * Math.PI, r = terreno.radioEn(m, a) * escalaMini; const px = m.x * escalaMini + Math.cos(a) * r, py = m.y * escalaMini + Math.sin(a) * r; if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); c.fill(); }
    c.strokeStyle = '#2a201a'; c.strokeRect(0.5, 0.5, w - 1, h - 1);
    for (const u of sim.unidades) {
      if (u.vivos === 0 || oculto(u.equipo)) continue;
      c.fillStyle = u.huyendo ? '#f4f0e6' : (u.equipo === equipoPropio ? '#5fd05f' : '#e05050');
      for (const i of u.indices) { if (!sim.vivo(i)) continue; c.fillRect(sim.posX[i] * escalaMini, sim.posY[i] * escalaMini, 1.2, 1.2); }
    }
    for (const u of seleccion) { c.strokeStyle = '#ffd54a'; c.beginPath(); c.arc(u.origenX * escalaMini, u.origenY * escalaMini, 4, 0, Math.PI * 2); c.stroke(); }
    const v = renderizador.vista(); c.strokeStyle = '#ffffffaa'; c.beginPath();
    v.esquinas.forEach(([x, y], k) => { const px = limitar(x, 0, CAMPO.ancho) * escalaMini, py = limitar(y, 0, CAMPO.alto) * escalaMini; if (k === 0) c.moveTo(px, py); else if (k === 1) c.lineTo(px, py); else if (k === 3) c.lineTo(px, py); else { c.lineTo(px, py); c.closePath(); } });
    c.stroke();
    c.restore();
  }
  const puntoMinimapa = e => {
    const r = minimapa.getBoundingClientRect(), x = limitar((e.clientX - r.left) * (minimapa.width / r.width) / escalaMini, 0, CAMPO.ancho), y = limitar((e.clientY - r.top) * (minimapa.height / r.height) / escalaMini, 0, CAMPO.alto);
    return girada ? [CAMPO.ancho - x, CAMPO.alto - y] : [x, y];
  };
  if (minimapa) {
    minimapa.onclick = e => { const [x, y] = puntoMinimapa(e); renderizador.centrarEn(x, y); };
    // clic derecho en el minimapa: mover la selección allí (al paso; Mayús a la carrera)
    minimapa.oncontextmenu = e => { e.preventDefault(); if (terminada || !seleccion.length) return; const [x, y] = puntoMinimapa(e); moverSeleccion(x, y, null, e.shiftKey ? 'correr' : 'andar', e.altKey); avisar(); };
  }
  /* ----- red: turnos del servidor -----
     Cada turno trae las órdenes validadas de los dos jugadores ({ e: equipo, o: orden }) y cuántos pasos de simulación
     avanzar después de aplicarlas (0 en el despliegue, 3 = 100 ms en la batalla). Se aplican en orden de llegada; si se
     acumulan (la pestaña estuvo en segundo plano, un tirón de red), se simula más deprisa hasta ponerse al día. Cada 10 turnos
     (1 s) se manda al servidor un resumen del estado para comprobar que nadie se ha desviado. */
  const turnosRed = [];
  let pasosTurno = 0, turnoActual = null, finRed = null, momentoFin = 0, avisoDesincronia = null;
  let resincronizaciones = 0;
  function tomarTurno() {
    const turno = turnosRed.shift(); if (!turno) return false;
    // estado completo del servidor (este navegador se había desviado): se copia encima, al final del turno turno.n
    if (turno.tipo === 'estado') { restaurarEstado(sim, turno.estado); resincronizaciones++; avisoDesincronia = null; pasosTurno = 0; console.info('Batalla en red: estado corregido con el del servidor (turno ' + turno.n + ')'); return true; }
    turnoActual = turno;
    for (const { e, o } of turno.ordenes || []) {
      aplicarOrden(sim, e, o, { desplegando });
      if (e === equipoPropio && o.k) { const k = ordenesEnCamino.findIndex(p => p.orden.k === o.k); if (k >= 0) ordenesEnCamino.splice(0, k + 1); }   // esta y las anteriores ya llegaron (o se descartaron)
    }
    if (turno.comienza && desplegando) { desplegando = false; if (renderizador.mostrarZona) renderizador.mostrarZona(null); avisar(); }
    if (turno.fin && !terminada) { terminada = true; finRed = turno.fin; momentoFin = performance.now(); seleccion = []; avisar(); }
    pasosTurno = turno.pasos || 0;
    if (!pasosTurno) turnoTerminado();
    return true;
  }
  function turnoTerminado() { if (turnoActual && turnoActual.pasos && turnoActual.n % 10 === 0 && red.resumen) red.resumen(turnoActual.n, resumenEstado(sim)); }
  function pasosDeRed(transcurrido) {
    if (!desplegando && !terminada) acumulador += transcurrido;
    const atrasado = turnosRed.length > 2;
    let pasos = 0;
    while (pasos < (atrasado ? 30 : 6)) {
      if (!pasosTurno) { if (!tomarTurno()) break; continue; }
      if (acumulador < PASO_SIMULACION && !atrasado) break;
      sim.avanzar(); pasosTurno--; pasos++; acumulador = Math.max(0, acumulador - PASO_SIMULACION);
      if (!pasosTurno) turnoTerminado();
    }
    // sin turnos por delante no se acumula tiempo: así no hay tirón cuando llegue el siguiente
    if (!pasosTurno && !turnosRed.length) acumulador = Math.min(acumulador, PASO_SIMULACION);
    return pasos;
  }

  /* ----- bucle ----- */
  let acumulador = 0, ultimoTiempo = performance.now(), ultimoHud = 0, ultimoMinimapa = 0;
  function bucle(ahora) {
    if (!activo) return;
    requestAnimationFrame(bucle);
    let transcurrido = (ahora - ultimoTiempo) / 1000; ultimoTiempo = ahora; if (transcurrido > 0.25) transcurrido = 0.25;
    let pasos = 0;
    if (red) pasos = pasosDeRed(transcurrido);
    else {
      if (!pausado && !desplegando) acumulador += transcurrido * multiplicador;
      while (acumulador >= PASO_SIMULACION && pasos < 6) { inteligenciaArtificial(); sim.avanzar(); acumulador -= PASO_SIMULACION; pasos++; }
      if (pasos === 6) acumulador = 0;
    }
    if (sim.sangre.length) {
      for (const m of sim.sangre) {
        sangre.mancha(m.x, m.y, m.tamano, azarManchas); if (renderizador.sangrar) renderizador.sangrar(m);
        if (m.tipo === 'muerte') registroMapa.muertes.push([+m.x.toFixed(1), +m.y.toFixed(1), m.equipo]); else if (m.tipo === 'atropello') registroMapa.atropellos.push([+m.x.toFixed(1), +m.y.toFixed(1)]);
      }
      sim.sangre.length = 0;
    }
    if (sim.paso % 60 === 0 && pasos > 0) for (const t of registroMapa.trayectorias) { const u = sim.unidades[t.id]; if (u.vivos > 0) { const ultimo = t.puntos[t.puntos.length - 1]; if (Math.hypot(u.centroX - ultimo[0], u.centroY - ultimo[1]) > 1.5) t.puntos.push([+u.centroX.toFixed(1), +u.centroY.toFixed(1)]); } }
    const alpha = pausado ? 1 : limitar(acumulador / PASO_SIMULACION, 0, 1);
    renderizador.dibujar(alpha, sim.tiempo - PASO_SIMULACION * (1 - alpha));
    if (ahora - ultimoHud > 500) { ultimoHud = ahora; seleccion = seleccion.filter(u => u.vivos > 0); avisar(); const guardia = unidadesJugador.find(u => u.esGeneral); if (guardia && guardia.luchando > 0) conductaGeneral.trabada = true; }
    if (ahora - ultimoMinimapa > 250) { ultimoMinimapa = ahora; pintarMinimapa(); }
    // en red el final lo decide el servidor (llega en un turno, ya con los 3 s de remate simulados); se muestra 1,5 s después
    if (!red && !terminada && sim.tiempo > 5 && (sim.equipoDerrotado(0) || sim.equipoDerrotado(1))) { terminada = true; tiempoFin = sim.tiempo; }
    if (red ? terminada && ahora - momentoFin > 1500 : terminada && sim.tiempo - tiempoFin > 3) {
      activo = false; window.removeEventListener('keydown', tecla);
      const e = sim.estadisticas;
      const victoria = red ? finRed.ganador === equipoPropio : ganadorBatalla(sim) === 0;
      const fichaUnidad = u => ({ nombre: u.nombre, equipo: u.equipo, total: u.total, vivos: u.vivos, huyo: u.huyendo, bajasCausadas: u.bajasCausadas, esGeneral: u.esGeneral, nivel: u.nivel });
      const guardiaEnemiga = unidadesIA.find(u => u.esGeneral);
      const P = equipoPropio, R = equipoRival;
      alTerminar({ victoria, semilla, duracion: Math.round(sim.tiempo), equipoPropio, red: red ? { ganador: finRed.ganador, motivo: finRed.motivo } : null, unidades: sim.unidades.map(fichaUnidad), general: { cargo: conductaGeneral.cargo, trabada: conductaGeneral.trabada, enemigoAbatido: !!guardiaEnemiga && (guardiaEnemiga.vivos === 0 || guardiaEnemiga.huyendo) },
        mapa: { suelo: sangre.canvas, trayectorias: registroMapa.trayectorias, muertes: registroMapa.muertes, atropellos: registroMapa.atropellos, finales: sim.unidades.map(u => ({ id: u.id, vivos: u.vivos, huyendo: u.huyendo, x: +u.centroX.toFixed(1), y: +u.centroY.toFixed(1) })) }, bajasPropias: e.muertos[P], bajasEnemigas: e.muertos[R], huidasPropias: e.huyendo[P] + e.huidos[P], huidasEnemigas: e.huyendo[R] + e.huidos[R], soldadosPropios: sim.unidades.filter(u => u.equipo === P).reduce((s, u) => s + u.total, 0), soldadosEnemigos: sim.unidades.filter(u => u.equipo === R).reduce((s, u) => s + u.total, 0) });
    }
  }
  requestAnimationFrame(bucle);
  return {
    sim, unidadesJugador, unidadesIA, clima: sim.clima, equipoPropio, enRed: !!red,
    // red: el cliente del lobby entrega aquí los turnos del servidor (en orden) y los avisos de desincronía
    recibirTurno: turno => { if (red) turnosRed.push(turno); },
    desincronia: n => { avisoDesincronia = n; console.warn('Batalla en red: el estado de este navegador se ha desviado del servidor en el turno', n); },
    desincronizado: () => avisoDesincronia,
    resincronizaciones: () => resincronizaciones,
    ordenesPendientes: () => ordenesEnCamino.length,
    terminada: () => terminada,
    // grupos de unidades (G / Mayús+G / 1-9)
    crearGrupo, deshacerGrupo, grupoDe, llamarGrupo, grupos: () => grupos, alternarEscaramuza,
    seleccion: () => seleccion, seleccionar, ordenSeleccion, formarSeleccion, atacarSeleccion, moverSeleccion,
    // las órdenes globales no mueven al general: su guardia se queda atrás salvo que se le ordene aparte
    ordenarTodas: (orden, soloTipo, marcha) => { const lista = unidadesJugador.filter(u => !u.esGeneral && u.vivos > 0 && (soloTipo === undefined || u.tipo === TIPO[soloTipo])); if (lista.length) despachar({ a: 'orden', u: ids(lista), orden, m: marcha }); avisar(); },
    retratoUnidad: u => renderizador.retrato ? renderizador.retrato(u.equipo, u.tipo, u.rama, u.nivel, u.esGeneral) : null,
    enDespliegue: () => desplegando,
    // actitud vigente de la IA ('ofensiva' | 'defensiva'), la elegida y por qué cambió (null, 'bajas' o 'tiempo')
    actitudIA: () => sim.estadoIA ? { actual: sim.estadoIA.actitud, inicial: sim.estadoIA.actitudInicial, motivo: sim.estadoIA.motivoCambio } : { actual: actitudIA, inicial: actitudIA, motivo: null },
    colinaDefensiva: () => colinaDefensiva,
    // en red, «comenzar» solo avisa al servidor de que este jugador ha terminado de desplegar: la batalla empieza cuando lo
    // estén los dos (o se agote el tiempo de despliegue), con el turno que trae «comienza»
    comenzar: () => { if (!desplegando) return; if (red) { red.listoDespliegue(); esperandoRival = true; avisar(); return; } desplegando = false; if (renderizador.mostrarZona) renderizador.mostrarZona(null); ultimoTiempo = performance.now(); avisar(); },
    esperandoRival: () => esperandoRival && desplegando,
    rendirse: () => { if (red && !terminada) red.rendirse(); },
    zonaDespliegue: ZONA_DESPLIEGUE,
    centrarEnUnidad: u => { if (u.vivos > 0) renderizador.centrarEn(u.centroX, u.centroY); },
    pausar: () => { if (red) { if (pausaRed) red.reanudarPausa(); else red.pedirPausa(); } else pausado = !pausado; avisar(); return pausado; },
    enPausa: () => red ? pausaRed : pausado,
    pausaRed: activa => { pausaRed = !!activa; avisar(); },
    velocidad: v => { if (!red) multiplicador = v; avisar(); },
    velocidadActual: () => multiplicador,
    // en red, pausar pide la pausa al rival y reanudar la quita (las dos pasan por el servidor)
    fijarPausa: valor => { if (red) { if (valor && !pausaRed) red.pedirPausa(); else if (!valor && pausaRed) red.reanudarPausa(); } else pausado = !!valor; avisar(); return pausado; },
    detener: () => { activo = false; window.removeEventListener('keydown', tecla); renderizador.destruir(); },
  };
}
