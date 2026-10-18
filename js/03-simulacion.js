'use strict';
// fatiga de los jinetes respecto a la infantería: los caballos de guerra están entrenados para cargar varias veces (2026-10-10)
const FATIGA_MONTADOS = { luchando: 0.5, corriendo: 0.35, recuperacion: 1.5 };
const CABALLERIA_ATASCADA = 0.65;     // daño de un jinete parado en la melé contra infantería que no huye (2026-10-13)
const ANGULO_ESPALDA = 2.35;          // rad (~135°) entre donde mira el soldado y de donde llega el golpe: más allá, es por la espalda
/* Altura del terreno en el combate (2026-10-16, fase 2 del terreno con volumen). Todo sale de terreno.alturaEn / pendienteEn /
   visionLibre / trayectoriaLibre, que en el futuro incluirán murallas y torres:
   · cuerpo a cuerpo: según la pendiente entre el que golpea y el golpeado (desnivel / distancia: entre dos soldados pegados el
     desnivel es de medio metro aunque la ladera sea fuerte): golpeando cuesta abajo, +1 % por cada 0,01 de pendiente (hasta
     +20 %); cuesta arriba, −0,75 % (hasta −15 %). Una ladera media (0,15) da +15 % / −11 %; desde lo alto de una muralla, el máximo;
   · marcha: cuesta arriba frena según la pendiente (hasta −25 %), cuesta abajo acelera algo (hasta +10 %), y subir cansa;
   · carga: cuesta abajo pega y aguanta más (hasta +30 %), cuesta arriba menos;
   · tiro: +3 % de alcance por metro por encima del blanco (hasta +20 %), lo mismo en contra desde abajo;
   · línea de visión: las ballestas (tiro tenso) solo tiran a quien ven; arcos y mangoneles tiran en parábola por encima, pero
     una flecha cuya parábola choca con una ladera se queda clavada en ella. */
const ALTURA_MELE = { ventajaPorPendiente: 1.0, ventajaMaxima: 0.20, desventajaPorPendiente: 0.75, desventajaMaxima: 0.15 };
const PENDIENTE_MARCHA = { frenoSubida: 0.85, frenoMaximo: 0.25, impulsoBajada: 0.35, impulsoMaximo: 0.10 };
const PENDIENTE_CARGA = { porPendiente: 1.5, maximo: 0.30, tramo: 12 };   // tramo: metros de carrera antes del choque que cuentan
const FATIGA_SUBIDA = { pendienteTope: 0.2, corriendo: 0.5, andando: 0.004 };   // ×(1 + 0,5) al correr cuesta arriba; andando, sin descanso y algo de fatiga
const ALTURA_ALCANCE = { porMetro: 0.03, maximo: 0.20 };
const ALTURA_OJOS = 1.6, ALTURA_PECHO = 1.0, ALTURA_SALIDA_FLECHA = 1.5;
const AJUSTE_PUESTO = 1.0;          // m: un soldado de una unidad en alto a menos de esto de su puesto se recoloca sin girarse
const CADA_VISION = 10;              // pasos entre comprobaciones de la línea de tiro de una unidad a su blanco
const CONTRAGOLPE_ATROPELLO = 0.8; // fracción del daño del arrollado que recibe el jinete al arrollarlo (2026-10-13)
const CARRERILLA_CARGA = 5;    // metros seguidos al galope que necesita un jinete para atropellar (bajado de 10 el 2026-10-09)
const EMPUJE_MAXIMO_PASO = 0.12;   // m: tope del empuje de separación por paso (sin saltos ni temblor en los montones)
const CADA_CERRAR_FILAS = 60;           // pasos (2 s) entre comprobaciones para cerrar filas fuera de combate
const MARGEN_ANDANADA = 1.0;           // m que se suman a la dispersión de una andanada sobre el área de la unidad
const FACTOR_DISPERSION_ANDANADA = 0.9; // × la dispersión de la tropa en una andanada sobre el área (calibrar_andanada_real.js)
const MARGEN_DESCARTE = 1 + 1e-7;      // ver el bucle de vecinos de actualizarSoldado (descarte por distancia al cuadrado)
const HOLGURA_ALIADOS = 1.15;      // los aliados guardan un 15 % más que la suma de radios: menos solapes entre propios
const ATACANTES_MAXIMOS = 3;       // a partir de aquí un enemigo se considera cubierto y los demás buscan otro hueco
// Línea contra línea: un soldado con orden ofensiva solo sale de su puesto para golpear a un enemigo que esté a menos de
// MARGEN_FORMACION de su casilla (más su alcance); el resto mantiene la formación y cubre los huecos de los caídos.
// Uno de cada IMPETUOSOS_CADA se cuela entre las líneas con un margen mayor (y la caballería en carga va libre).
const MARGEN_FORMACION = { aPie: 1.0, montado: 2.2 };
const MARGEN_IMPETUOSO = 4.5;
const IMPETUOSOS_CADA = 7;
const CONTACTO_FORMACION = 0.12;   // fracción de la unidad luchando a partir de la cual la formación se detiene en el contacto
const DISTANCIA_PERSECUCION = 45;  // m: la caballería persigue a los que huyen hasta esta distancia si no tiene otro enemigo
// Cohesión (0-100) por unidad: baja al moverse en contacto, correr, recibir cargas y flanqueos y al descomponerse la
// formación; sube parada. Por debajo de COHESION_BAJA pega y aguanta peor y pierde moral; por debajo de COHESION_ROTA
// los soldados rompen filas (margen de impetuoso) y la moral cae más deprisa.
const COHESION_BAJA = 40, COHESION_ROTA = 20;
// Retirada controlada: las unidades de nivel hombres de armas o superior (y la guardia) que se quiebran se retiran formadas
// hacia su borde, defendiéndose, y se rehacen si la moral pasa de MORAL_REHACERSE sin enemigos a menos de DISTANCIA_REHACERSE
const NIVEL_RETIRADA_CONTROLADA = 2, MORAL_REHACERSE = 45, DISTANCIA_REHACERSE = 25;
// Moral (rework del 2026-10-10). Cada segundo se calcula una moral OBJETIVO = moral máxima de la unidad (tipo, nivel, rama,
// rasgos) + la suma de FACTORES_MORAL que se cumplan; la moral real baja hacia ella deprisa (MORAL_CAIDA por segundo) y sube
// despacio (MORAL_SUBIDA). Así una unidad entera y descansada no se rompe sola: tiene que acumular bajas, flancos, cargas...
// Los factores quedan en u.factoresMoral ([texto, valor]) para que la interfaz explique por qué una unidad aguanta o huye.
const FACTORES_MORAL = {
  bajas: -65,             // × fracción de la unidad perdida (la mitad de bajas = −32)
  bajasRecientes: -100,   // × fracción perdida en los últimos 10 s, con tope en BAJAS_RECIENTES_TOPE (el susto de una sangría)
  espalda: -20,           // atacada por la espalda (en los últimos 4 s)
  flanco: -10,            // atacada por el flanco (en los últimos 4 s)
  cargaTope: -25,         // atropellos recibidos: −2,5 por jinete que atropella, se olvida a 4 por segundo
  flechas: -5,            // bajo las flechas (en los últimos 3 s)
  formacionRota: -18,     // cohesión por debajo de COHESION_ROTA
  formacionDesordenada: -8, // cohesión por debajo de COHESION_BAJA
  cansancio: -15,         // × fatiga
  aliadoHuyendo: -8,      // por cada unidad aliada que huye a menos de 40 m (tope dos)
  generalMuerto: -15,     // el general del bando ha caído o huido
  generalCerca: 10,       // dentro del aura del general
  ganando: 8,             // causa más del 50 % más de bajas de las que sufre en los últimos 10 s
  apoyoFila: 3,           // por cada fila de infantería detrás de la primera (tope APOYO_FILAS_TOPE)
  superioridad: 10,       // × log2(propios / enemigos alrededor en combate), entre −12 y +10
  cediendo: -8,           // empujada: está perdiendo terreno
};
// giro a partir del cual la formación da media vuelta en el sitio en vez de rodar (unos 120°)
// Escaramuza (arqueros a caballo, activada por defecto, u.escaramuza): si una unidad enemiga de cuerpo a cuerpo se acerca a
// menos de DISTANCIA_ESCARAMUZA (más si es caballería), la unidad galopa en dirección contraria DISTANCIA_HUIDA_ESCARAMUZA m
// sin perder su orden ni su objetivo, y sigue disparando mientras se aleja
// al escaramucear galopan a tope: ×VELOCIDAD_ESQUIVA su velocidad (arqueros a caballo 7 → 11,2 m/s: más que la carga de la
// caballería pesada, 10,5, y algo menos que la de la ligera, 11)
const DISTANCIA_ESCARAMUZA = { infanteria: 28, caballeria: 60 }, DISTANCIA_HUIDA_ESCARAMUZA = 35, VELOCIDAD_ESQUIVA = 1.55;
// escaramucear cansa (2026-10-14): fatiga por segundo mientras esquivan; con la fatiga pierden velocidad y la caballería ligera
// (carga a 11 m/s, más que los 10,85 de la esquiva) acaba alcanzándolos
const FATIGA_ESCARAMUZA = 0.015;
// arco de tiro: los tiradores solo disparan a enemigos a ±ARCO_TIRO de hacia donde mira su formación (120° en total); los que
// disparan en movimiento (arqueros a caballo) tiran en redondo
const ARCO_TIRO = Math.PI / 3;
// fracción del movimiento del blanco que los tiradores anticipan al apuntar (1 = perfecto)
const ANTICIPACION_TIRO = 0.85;
const GIRO_MEDIA_VUELTA = 2.1;
// Efecto masa (2026-10-13): las filas de atrás apoyan (moral y cohesión), el bando con más presión por metro de frente empuja
// al otro, y la superioridad numérica alrededor del combate pesa en la moral.
const APOYO_FILAS_TOPE = 4;                 // filas de apoyo que cuentan (4 → +12 de moral, −40 % de pérdida de cohesión)
const RADIO_SUPERIORIDAD = 25;             // m alrededor de la unidad para contar soldados propios y enemigos en combate
const EMPUJE = { umbral: 1.15, velocidad: 0.6, tope: 0.3, cohesion: 2 };   // ratio de presión mínimo, m/s por punto de ratio, tope m/s, cohesión perdida por s al ceder
const BAJAS_RECIENTES_TOPE = 20, MORAL_CAIDA = 12, MORAL_SUBIDA = 3;
const SIN_CONTACTO_MAXIMO = 2;     // s en el destino sin pelear tras los cuales la unidad abandona el flanco y busca el contacto
/* ---------- Simulación determinista ----------
   Paso fijo (PASO_SIMULACION). Cada soldado es un punto en arrays tipados; las unidades son bloques con casillas de
   formación que se desplazan como un cuerpo. No hay motor físico: el cuerpo a cuerpo es alcance + temporizador, el empuje
   entre frentes es separación de puntos, las cargas lanzan soldados con una parábola y las flechas son trayectorias
   precalculadas que al caer miran quién hay debajo (fuego amigo incluido). Todo el azar sale de `this.azar`.
   Cada unidad lleva sus estadísticas (`stats`): el tipo base multiplicado por nivel y rama, así que dos unidades del mismo
   tipo pueden ser distintas. Tiene además moral: cae con las bajas y, por debajo del umbral, la unidad huye.
   El render lee los arrays directamente e interpola entre posicionPrevia y posicion. */
class Simulacion {
  constructor(opciones) {
    const o = Object.assign({ semilla: 1234, maxSoldados: 5000, maxFlechas: 8000, terreno: null }, opciones || {});
    this.azar = crearAleatorio(o.semilla);
    this.terreno = o.terreno;                 // opcional: objeto con tipoEn(x, y) → 0 llano, 1 bosque, 2 colina
    this.clima = (typeof CLIMAS !== 'undefined' && CLIMAS[o.clima]) ? Object.assign({ tipo: o.clima }, CLIMAS[o.clima]) : Object.assign({ tipo: 'despejado' }, (typeof CLIMAS !== 'undefined' ? CLIMAS.despejado : { velocidad: 1, velocidadMontado: 1, danoFlecha: 1, alcanceTiro: 1, cadencia: 1, fatiga: 1, carga: 1 }));
    this.generalPerdido = [false, false];
    this.maxSoldados = o.maxSoldados;
    this.maxFlechas = o.maxFlechas;
    this.paso = 0;
    this.tiempo = 0;
    this.cantidad = 0;
    const n = o.maxSoldados;
    this.posX = new Float32Array(n); this.posY = new Float32Array(n);
    this.previaX = new Float32Array(n); this.previaY = new Float32Array(n);
    this.rumbo = new Float32Array(n);
    this.vida = new Float32Array(n);
    this.estado = new Uint8Array(n);
    this.equipo = new Uint8Array(n);
    this.tipo = new Uint8Array(n);
    this.unidadDe = new Int16Array(n);
    this.enfriamiento = new Float32Array(n);
    this.casillaX = new Float32Array(n); this.casillaY = new Float32Array(n);
    this.localX = new Float32Array(n); this.localY = new Float32Array(n);
    this.empujeX = new Float32Array(n); this.empujeY = new Float32Array(n);
    this.velocidadActual = new Float32Array(n);
    this.galope = new Float32Array(n);          // metros recorridos seguidos por encima del umbral de carga (impulso del jinete)
    this.vueloZ = new Float32Array(n); this.vueloVZ = new Float32Array(n);
    this.vueloVX = new Float32Array(n); this.vueloVY = new Float32Array(n);
    this.vueloGiro = new Float32Array(n); this.vueloZPrevia = new Float32Array(n);
    this.objetivo = new Int32Array(n).fill(-1);
    this.atacantes = new Uint8Array(n); this.atacantesPrevio = new Uint8Array(n);   // cuántos enemigos golpean a cada soldado (reparto de objetivos)
    this.tiempoMuerte = new Float32Array(n);
    this.causante = new Int16Array(n).fill(-1);          // unidad que hirió por última vez a cada soldado (para contar bajas causadas)
    this.rejilla = new RejillaEspacial(CAMPO.ancho, CAMPO.alto, 2, n);
    this.bufferVecinos = new Int32Array(512);
    const f = o.maxFlechas;
    this.flechaEstado = new Uint8Array(f);
    this.flechaX0 = new Float32Array(f); this.flechaY0 = new Float32Array(f);
    this.flechaX1 = new Float32Array(f); this.flechaY1 = new Float32Array(f);
    this.flechaInicio = new Float32Array(f); this.flechaDuracion = new Float32Array(f);
    this.flechaApice = new Float32Array(f); this.flechaEquipo = new Uint8Array(f);
    this.flechaDano = new Float32Array(f); this.flechaPerforante = new Uint8Array(f); this.flechaUnidad = new Int16Array(f).fill(-1);
    this.flechaSoldado = new Int32Array(f).fill(-1);
    this.flechaOffX = new Float32Array(f); this.flechaOffY = new Float32Array(f);
    this.flechaArea = new Float32Array(f);            // radio del impacto de las piedras de los mangoneles (0 = flecha)
    this.flechaSiguiente = 0;
    this.unidades = [];
    this.sangre = [];
    this.estadisticas = { vivos: [0, 0], muertos: [0, 0], huyendo: [0, 0], retirada: [0, 0], huidos: [0, 0], flechasVolando: 0 };
  }

  /* ----- creación -----
     modificadores: { vida, dano, velocidad, moral } multiplicadores (por defecto 1); nombre para la interfaz.
     modificadores.cuerpoACuerpo (tiradores): { dano, alcance, intervalo } ya calculados de la tropa a la que equivalen en el
     cuerpo a cuerpo; sustituyen a los suyos (la vida no cambia: un arquero golpea como esa tropa pero aguanta como arquero). */
  crearUnidad(equipo, tipoClave, centroX, centroY, rumbo, soldados, columnas, modificadores, nombre) {
    const t = TIPO[tipoClave], base = TIPOS[t], m = Object.assign({ vida: 1, dano: 1, velocidad: 1, moral: 1 }, modificadores || {});
    const stats = Object.assign({}, base, { vida: base.vida * m.vida, dano: base.dano * m.dano, velocidad: base.velocidad * m.velocidad, danoFlecha: (base.danoFlecha || 0) * m.dano, danoCarga: (base.danoCarga || 0) * m.dano });
    if (m.cuerpoACuerpo) Object.assign(stats, { dano: m.cuerpoACuerpo.dano, alcance: m.cuerpoACuerpo.alcance, intervalo: m.cuerpoACuerpo.intervalo });
    const separacion = base.montado ? SEPARACION_FORMACION.montado : SEPARACION_FORMACION.aPie;
    const unidad = { id: this.unidades.length, equipo, tipo: t, nombre: nombre || base.nombre, stats, indices: [], orden: 'formar', origenX: centroX, origenY: centroY, rumbo, objetivoUnidad: -1, objetivoX: centroX, objetivoY: centroY, energiaCarga: 0, temporizadorTiro: 0, centroX, centroY, vivos: 0, total: soldados, moral: 70 * m.moral, moralMax: 70 * m.moral, huyendo: false, luchando: 0, bajasPrevias: 0, fatiga: 0, corriendo: false, marcha: 'andar', esGeneral: false, bajasCausadas: 0, municion: base.alcanceTiro ? (base.municion || 0) : 0, sinMunicion: false, trabada: false, cohesion: 100, retirada: false, desplazamientoSegundo: 0, escaramuza: !!base.disparaEnMovimiento, esquiva: null, historialBajas: [], historialCausadas: [], causadasPrevias: 0, golpesEspalda: 0, golpesFlanco: 0, impactosFlecha: 0, espaldaHasta: -1, flancoHasta: -1, flechasHasta: -1, choqueCarga: 0, factoresMoral: [], moralObjetivo: 0 };
    for (let k = 0; k < soldados; k++) {
      const i = this.cantidad++;
      if (i >= this.maxSoldados) throw new Error('demasiados soldados');
      const fila = Math.floor(k / columnas), columna = k % columnas;
      const lx = -fila * separacion, ly = (columna - (columnas - 1) / 2) * separacion;
      this.localX[i] = lx; this.localY[i] = ly;
      const cos = Math.cos(rumbo), sen = Math.sin(rumbo);
      const x = centroX + lx * cos - ly * sen, y = centroY + lx * sen + ly * cos;
      this.posX[i] = x; this.posY[i] = y; this.previaX[i] = x; this.previaY[i] = y;
      this.casillaX[i] = x; this.casillaY[i] = y;
      this.rumbo[i] = rumbo; this.vida[i] = stats.vida; this.estado[i] = ESTADO.FORMADO;
      this.equipo[i] = equipo; this.tipo[i] = t; this.unidadDe[i] = unidad.id;
      this.enfriamiento[i] = this.azar.entre(0, stats.intervalo);
      unidad.indices.push(i);
    }
    unidad.vivos = soldados; unidad.objetivoFijo = -1; unidad.rumboFinal = null; unidad.formacion = Object.assign({ clave: 'linea' }, FORMACIONES.linea);
    // portador del estandarte (solo estético): en la infantería cuerpo a cuerpo, un soldado de la primera fila dos columnas a
    // la izquierda del centro (en el centro mismo flota el estandarte de la unidad y lo taparía); -1 si no lleva. Si muere, el
    // estandarte queda caído con él: no pasa a otro soldado
    unidad.portador = (!base.montado && !base.alcanceTiro) ? unidad.indices[Math.max(0, Math.floor((Math.min(columnas, soldados) - 1) / 2) - 2)] : -1;
    this.unidades.push(unidad);
    // formación inicial en línea, con los soldados ya colocados en sus casillas
    this.formar(unidad, 'linea');
    const cos = Math.cos(rumbo), sen = Math.sin(rumbo);
    for (const i of unidad.indices) { const x = centroX + this.localX[i] * cos - this.localY[i] * sen, y = centroY + this.localX[i] * sen + this.localY[i] * cos; this.posX[i] = x; this.posY[i] = y; this.previaX[i] = x; this.previaY[i] = y; this.casillaX[i] = x; this.casillaY[i] = y; }
    return unidad;
  }

  // Sin flechas: la unidad pasa a ser de cuerpo a cuerpo (sus stats ya son los de la tropa equivalente, dos niveles por debajo)
  agotarMunicion(u) {
    u.municion = 0; u.sinMunicion = true;
    u.stats = Object.assign({}, u.stats, { alcanceTiro: 0, disparaEnMovimiento: false });
    if (u.orden === 'disparar') u.orden = 'formar';
  }

  /* ----- órdenes -----
     formar (alto y mantener), mover (a un punto, con rumbo final opcional), avanzar (contra lo más cercano),
     atacar (contra una unidad concreta; la caballería carga), cargar, disparar, huir (la pone la moral). */
  /* marcha: 'andar' (paso de marcha, sin fatiga) o 'correr' (más rápido, pero la fatiga sube). Cargar y huir siempre corren. */
  ordenar(unidad, orden, objetivoX, objetivoY, rumboFinal, marcha) {
    if (unidad.huyendo) {
      // en retirada controlada se puede ordenar «alto» para rehacerse si la moral ya lo permite
      if (unidad.retirada && orden === 'formar' && unidad.moral >= MORAL_REHACERSE * 0.7) this.rehacer(unidad);
      return;
    }
    unidad.orden = orden;
    unidad.marcha = marcha === 'correr' ? 'correr' : 'andar';
    unidad.objetivoFijo = -1;
    if (orden === 'cargar') unidad.energiaCarga = (unidad.stats.energiaCarga || 0) * (unidad.formacion.cargaExtra || 1) * this.clima.carga;
    if (orden === 'mover') { unidad.objetivoX = objetivoX; unidad.objetivoY = objetivoY; unidad.rumboFinal = rumboFinal === undefined ? null : rumboFinal; }
  }
  /* ¿Puede volver al combate una unidad en retirada ordenada? Para rehacerse necesita llegar a MORAL_REHACERSE sin enemigos a
     menos de DISTANCIA_REHACERSE: no puede si su moral máxima no llega o si tiene un enemigo encima (perseguida). Se recalcula
     cada segundo: si deja atrás a sus perseguidores vuelve a contar. */
  puedeVolverDeRetirada(u, enemigoMasCercano) {
    if (u.moralMax < MORAL_REHACERSE) return false;
    return !(enemigoMasCercano && enemigoMasCercano.vivos > 0 && distancia(u.centroX, u.centroY, enemigoMasCercano.centroX, enemigoMasCercano.centroY) < DISTANCIA_REHACERSE);
  }
  // una unidad en retirada vuelve a la obediencia: deja de huir, se queda en alto y recupera algo de cohesión
  rehacer(unidad) { unidad.huyendo = false; unidad.retirada = false; unidad.orden = 'formar'; unidad.rumboFinal = null; unidad.cohesion = Math.max(unidad.cohesion, 60); }
  // la IA fija el blanco de un tirador sin cambiar su orden (sigue en alto, disparando o avanzando): se lo cambia la
  // simulación si muere o huye, como cualquier objetivo fijo (tácticas por dificultad, 2026-10-18)
  fijarBlancoTiro(unidad, unidadEnemiga) {
    if (unidad.huyendo || !unidadEnemiga || unidadEnemiga.vivos === 0) return;
    unidad.objetivoFijo = unidadEnemiga.id; unidad.objetivoUnidad = unidadEnemiga.id;
  }
  ordenarAtaque(unidad, unidadEnemiga, marcha) {
    if (unidad.huyendo || !unidadEnemiga || unidadEnemiga.vivos === 0) return;
    // la energía de carga solo se renueva si la unidad no está ya trabada en combate
    const trabada = unidad.luchando > unidad.vivos * 0.15;
    unidad.orden = 'atacar'; unidad.marcha = marcha === 'correr' ? 'correr' : 'andar'; unidad.objetivoFijo = unidadEnemiga.id; unidad.objetivoUnidad = unidadEnemiga.id;
    if (unidad.stats.montado && !trabada) unidad.energiaCarga = (unidad.stats.energiaCarga || 0) * (unidad.formacion.cargaExtra || 1) * this.clima.carga;
  }
  /* ----- formaciones -----
     Recolocan las casillas de los soldados vivos y cambian modificadores: velocidad, daño de flechas recibido,
     si la formación frena cargas (muro) y el empuje de la carga propia (cuña). */
  // opciones.porOrden: reparte las casillas por orden de índice (por defecto, cada casilla al soldado que la tiene más cerca)
  formar(unidad, clave, opciones) {
    const F = FORMACIONES[clave]; if (!F) return false;
    if (typeof formacionDisponible === 'function' && !formacionDisponible(unidad, clave)) return false;   // no le corresponde
    const vivos = unidad.indices.filter(i => this.vivo(i));
    const n = vivos.length; if (!n) return;
    const montado = unidad.stats.montado;
    // la separación nunca baja del diámetro del soldado: si no, el empuje y la vuelta a la casilla se pelean y tiemblan
    const sep = Math.max((montado ? SEPARACION_FORMACION.montado : SEPARACION_FORMACION.aPie) * (F.separacion || 1), unidad.stats.radio * 2 + 0.1, unidad.stats.separacionMinima || 0);
    let columnas;
    if (unidad.stats.artilleria) columnas = n;                     // las máquinas, siempre en una sola fila (con 3 en «línea» salía una columna)
    else if (F.filas) columnas = Math.ceil(n / F.filas);
    else if (F.columnas) columnas = montado ? Math.max(2, Math.round(F.columnas / 2)) : F.columnas;
    else columnas = Math.max(2, Math.round(Math.sqrt(n * (F.proporcion || 1))));
    const casillas = [];
    vivos.forEach((i, k) => {
      let lx, ly;
      if (F.cuna) {
        // cuña roma: F.punta jinetes en la primera fila y uno más en cada fila siguiente (con punta 1 es el triángulo clásico)
        const punta = F.punta || 1;
        let fila = 0, primero = 0; while (k >= primero + punta + fila) { primero += punta + fila; fila++; }
        const enFila = punta + fila, col = k - primero; lx = -fila * sep; ly = (col - (enFila - 1) / 2) * sep;
      }
      else { const fila = Math.floor(k / columnas), col = k % columnas; lx = -fila * sep; ly = (col - (columnas - 1) / 2) * sep; }
      casillas.push([lx, ly]);
    });
    // por defecto cada casilla nueva va al soldado que la tiene más cerca: al cambiar de formación nadie cruza la unidad entera
    if (!(opciones && opciones.porOrden)) {
      // reparto que respeta el orden (nadie se cruza): soldados ordenados de delante atrás por su posición real; se llenan las
      // filas nuevas de delante atrás en ese orden y, dentro de cada fila, soldados y casillas de izquierda a derecha
      const cosR = Math.cos(unidad.rumbo), senR = Math.sin(unidad.rumbo);
      const actual = vivos.map(i => { const rx = this.posX[i] - unidad.origenX, ry = this.posY[i] - unidad.origenY; return { i, fondo: rx * cosR + ry * senR, lateral: -rx * senR + ry * cosR }; });
      actual.sort((p, q) => q.fondo - p.fondo);
      const filasNuevas = new Map();
      for (const c of casillas) { const clave = Math.round(c[0] * 100); if (!filasNuevas.has(clave)) filasNuevas.set(clave, []); filasNuevas.get(clave).push(c); }
      let siguiente = 0;
      for (const clave of [...filasNuevas.keys()].sort((p, q) => q - p)) {
        const fila = filasNuevas.get(clave).sort((p, q) => p[1] - q[1]);
        const soldados = actual.slice(siguiente, siguiente + fila.length).sort((p, q) => p.lateral - q.lateral); siguiente += fila.length;
        soldados.forEach((s, k) => { this.localX[s.i] = fila[k][0]; this.localY[s.i] = fila[k][1]; });
      }
    } else vivos.forEach((i, k) => { this.localX[i] = casillas[k][0]; this.localY[i] = casillas[k][1]; });
    unidad.formacion = Object.assign({ clave }, F);
    unidad.vivosAlFormar = n;                                   // para cerrar filas cuando caigan más (actualizarUnidad)
    return true;
  }
  // Fase de despliegue: coloca la unidad entera en (x, y) con un rumbo, soldados incluidos, sin que anden hasta allí
  recolocarUnidad(u, x, y, rumbo) {
    u.origenX = x; u.origenY = y; if (rumbo !== null && rumbo !== undefined) u.rumbo = rumbo;
    u.objetivoX = x; u.objetivoY = y; u.rumboFinal = null;
    const cos = Math.cos(u.rumbo), sen = Math.sin(u.rumbo);
    for (const i of u.indices) {
      if (!this.vivo(i)) continue;
      const px = x + this.localX[i] * cos - this.localY[i] * sen, py = y + this.localX[i] * sen + this.localY[i] * cos;
      this.posX[i] = px; this.posY[i] = py; this.previaX[i] = px; this.previaY[i] = py; this.casillaX[i] = px; this.casillaY[i] = py;
      this.rumbo[i] = u.rumbo; this.estado[i] = ESTADO.FORMADO; this.velocidadActual[i] = 0;
    }
    u.centroX = x; u.centroY = y;
  }

  /* ----- consultas ----- */
  unidadEnemigaMasCercana(unidad) {
    let mejor = -1, mejorD = Infinity;
    for (const u of this.unidades) {
      if (u.equipo === unidad.equipo || u.vivos === 0 || u.huyendo) continue;
      const d = distancia(unidad.centroX, unidad.centroY, u.centroX, u.centroY);
      if (d < mejorD) { mejorD = d; mejor = u.id; }
    }
    // persecución: la caballería sin enemigo formado a la vista va a por los que huyen cerca (si no, se quedaba parada
    // entre los fugitivos, p. ej. tras romper a una unidad en un bosque)
    if (mejor < 0 && unidad.stats.montado && !unidad.huyendo) {
      for (const u of this.unidades) {
        if (u.equipo === unidad.equipo || u.vivos === 0 || !u.huyendo) continue;
        const d = distancia(unidad.centroX, unidad.centroY, u.centroX, u.centroY);
        if (d < DISTANCIA_PERSECUCION && d < mejorD) { mejorD = d; mejor = u.id; }
      }
    }
    return mejor;
  }
  vivo(i) { const e = this.estado[i]; return e !== ESTADO.MUERTO && e !== ESTADO.CADAVER && e !== ESTADO.AUSENTE; }
  // Unidad propia del equipo cuyo soldado vivo esté más cerca del punto (para seleccionar con un clic)
  unidadEnPunto(equipo, x, y, radio) {
    let mejor = null, mejorD = radio;
    for (const u of this.unidades) { if (u.equipo !== equipo || u.vivos === 0) continue; for (const i of u.indices) { if (!this.vivo(i)) continue; const d = distancia(x, y, this.posX[i], this.posY[i]); if (d < mejorD) { mejorD = d; mejor = u; } } }
    return mejor;
  }
  /* Derrotado: todas sus unidades muertas, desbandadas o en una retirada de la que no pueden volver (u.puedeVolver, ver la
     retirada controlada en actualizarUnidad). Antes, cualquier unidad en retirada ordenada contaba como en pie y la batalla se
     alargaba con los veteranos reculando perseguidos (2026-10-18, pedido del usuario). */
  equipoDerrotado(equipo) { return this.unidades.every(u => u.equipo !== equipo || u.vivos === 0 || (u.huyendo && !(u.retirada && u.puedeVolver))); }
  // Ancho del frente de la unidad en metros (extensión lateral de sus casillas más una separación): sirve para poner
  // varias unidades en fila sin que se solapen
  // { ancho, fondo } en metros de la formación actual (extensión de sus casillas más una separación)
  dimensionesUnidad(u) {
    let minLateral = Infinity, maxLateral = -Infinity, minFondo = Infinity, maxFondo = -Infinity;
    for (const i of u.indices) {
      if (!this.vivo(i)) continue;
      const lateral = this.localY[i], fondo = this.localX[i];
      if (lateral < minLateral) minLateral = lateral; if (lateral > maxLateral) maxLateral = lateral;
      if (fondo < minFondo) minFondo = fondo; if (fondo > maxFondo) maxFondo = fondo;
    }
    if (minLateral === Infinity) return { ancho: 0, fondo: 0 };
    const separacion = u.stats.montado ? SEPARACION_FORMACION.montado : SEPARACION_FORMACION.aPie;
    return { ancho: maxLateral - minLateral + separacion, fondo: maxFondo - minFondo + separacion };
  }

  /* ----- paso ----- */
  avanzar() {
    const dt = PASO_SIMULACION;
    this.paso++; this.tiempo += dt;
    const n = this.cantidad;
    this.previaX.set(this.posX.subarray(0, n)); this.previaY.set(this.posY.subarray(0, n));
    this.vueloZPrevia.set(this.vueloZ.subarray(0, n));
    const rejilla = this.rejilla; rejilla.limpiar();
    for (let i = 0; i < n; i++) if (this.vivo(i)) rejilla.insertar(i, this.posX[i], this.posY[i]);
    for (const u of this.unidades) this.actualizarUnidad(u, dt);
    this.resolverEmpujes(dt);
    // caída del general: se marca una vez; el factor «general muerto» pesa desde entonces en la moral de todo su ejército
    for (const u of this.unidades) {
      if (u.esGeneral && !this.generalPerdido[u.equipo] && (u.vivos === 0 || u.huyendo)) {
        this.generalPerdido[u.equipo] = true;
      }
    }
    this.empujeX.fill(0, 0, n); this.empujeY.fill(0, 0, n);
    const atacantesAnterior = this.atacantesPrevio; this.atacantesPrevio = this.atacantes; this.atacantes = atacantesAnterior; this.atacantes.fill(0, 0, n);
    this.prepararDatosUnidades();
    for (let i = 0; i < n; i++) this.actualizarSoldado(i, dt);
    for (let i = 0; i < n; i++) {
      if (!this.vivo(i) || this.estado[i] === ESTADO.VOLANDO) continue;
      let empujeX = this.empujeX[i], empujeY = this.empujeY[i];
      // solo se calcula la magnitud si puede pasar del máximo (con el mismo margen que el descarte del bucle de vecinos: exacto)
      if (empujeX * empujeX + empujeY * empujeY > EMPUJE_MAXIMO_PASO * EMPUJE_MAXIMO_PASO / MARGEN_DESCARTE) {
        const magnitudEmpuje = Math.hypot(empujeX, empujeY);
        if (magnitudEmpuje > EMPUJE_MAXIMO_PASO) { empujeX *= EMPUJE_MAXIMO_PASO / magnitudEmpuje; empujeY *= EMPUJE_MAXIMO_PASO / magnitudEmpuje; }
      }
      let x = this.posX[i] + empujeX, y = this.posY[i] + empujeY;
      x = limitar(x, 0.5, CAMPO.ancho - 0.5); y = limitar(y, 0.5, CAMPO.alto - 0.5);
      this.velocidadActual[i] = distancia(this.previaX[i], this.previaY[i], x, y) / dt;
      // impulso de carga: se acumula galopando y se pierde en cuanto el jinete frena (en el cuerpo a cuerpo no hay carrerilla)
      const umbral = TIPOS[this.tipo[i]].umbralCarga;
      if (umbral) this.galope[i] = this.velocidadActual[i] > umbral ? this.galope[i] + this.velocidadActual[i] * dt : 0;
      this.posX[i] = x; this.posY[i] = y;
    }
    this.actualizarFlechas();
    this.recontar();
  }
  /* margen del descarte por distancia al cuadrado en el bucle de vecinos: mil millones de veces el error de redondeo relativo
     (~1e-16) de dx² + dy² y de Math.hypot; así un candidato descartado nunca habría pasado la comparación con la distancia exacta */
  /* Datos de cada unidad que el bucle de vecinos de actualizarSoldado lee miles de veces por paso (radio y masa de su tropa y
     si su orden es de marcha o de estar parado), en arrays por id de unidad: leerlos así es mucho más barato que recorrer
     unidad → stats → campo y comparar cadenas (revisión de rendimiento, 2026-10-15). Se rellenan antes del bucle de soldados,
     cuando ya no cambian en el paso (actualizarSoldado no toca órdenes ni stats). Float64Array: los mismos números exactos
     que en los objetos, así que el resultado de la simulación no cambia ni en un decimal. */
  prepararDatosUnidades() {
    const cuantas = this.unidades.length;
    if (!this.radioUnidad || this.radioUnidad.length < cuantas) {
      this.radioUnidad = new Float64Array(cuantas + 16); this.masaUnidad = new Float64Array(cuantas + 16); this.marchaUnidad = new Uint8Array(cuantas + 16);
    }
    for (let k = 0; k < cuantas; k++) {
      const u = this.unidades[k], orden = u.orden;
      this.radioUnidad[k] = u.stats.radio; this.masaUnidad[k] = u.stats.masa;
      // 1 = parada (formar, disparar): la atraviesan los que marchan; 2 = en marcha (mover, avanzar, atacar, cargar); 0 = otra
      this.marchaUnidad[k] = orden === 'formar' || orden === 'disparar' ? 1 : orden === 'mover' || orden === 'avanzar' || orden === 'atacar' || orden === 'cargar' ? 2 : 0;
    }
  }
  // Moral objetivo = moral máxima + factores (FACTORES_MORAL); la moral real baja hacia ella hasta MORAL_CAIDA por segundo y
  // sube hasta MORAL_SUBIDA (más con el general cerca). Deja en u.factoresMoral la lista [texto, valor] de lo que pesa ahora.
  calcularMoral(u, vivos, nuevas, fraccionPerdida, conGeneral, aura) {
    const F = FACTORES_MORAL, t = this.tiempo, factores = [];
    const causadasNuevas = u.bajasCausadas - u.causadasPrevias; u.causadasPrevias = u.bajasCausadas;
    // límites de la formación en coordenadas locales (para saber si un golpe llega por el flanco o la espalda)
    let lateralMin = Infinity, lateralMax = -Infinity, fondoMin = Infinity;
    for (const i of u.indices) if (this.vivo(i)) { if (this.localY[i] < lateralMin) lateralMin = this.localY[i]; if (this.localY[i] > lateralMax) lateralMax = this.localY[i]; if (this.localX[i] < fondoMin) fondoMin = this.localX[i]; }
    u.limitesFormacion = lateralMin === Infinity ? null : { lateralMin, lateralMax, fondoMin };
    u.historialBajas.push(nuevas); u.historialCausadas.push(causadasNuevas);
    if (u.historialBajas.length > 10) { u.historialBajas.shift(); u.historialCausadas.shift(); }
    const recientes = u.historialBajas.reduce((s, x) => s + x, 0), causadasRecientes = u.historialCausadas.reduce((s, x) => s + x, 0);
    // golpes por la espalda y el flanco, y flechas, de este segundo: con unos pocos ya cuenta (y se recuerda unos segundos)
    if (u.golpesEspalda >= Math.max(2, vivos * 0.05)) u.espaldaHasta = t + 4;
    if (u.golpesFlanco >= Math.max(3, vivos * 0.08)) u.flancoHasta = t + 4;
    if (u.impactosFlecha >= Math.max(2, vivos * 0.05)) u.flechasHasta = t + 3;
    u.golpesEspalda = u.golpesFlanco = u.impactosFlecha = 0;
    const anadir = (texto, valor) => { if (Math.abs(valor) >= 0.5) factores.push([texto, Math.round(valor)]); };
    anadir('bajas (' + Math.round(fraccionPerdida * 100) + ' %)', F.bajas * fraccionPerdida);
    anadir('bajas recientes', -Math.min(BAJAS_RECIENTES_TOPE, -F.bajasRecientes * recientes / u.total));
    if (t < u.espaldaHasta) anadir('atacada por la espalda', F.espalda);
    else if (t < u.flancoHasta) anadir('atacada por el flanco', F.flanco);
    if (u.choqueCarga > 0) anadir('carga recibida', Math.max(F.cargaTope, -u.choqueCarga));
    u.choqueCarga = Math.max(0, u.choqueCarga - 4);
    if (t < u.flechasHasta) anadir('bajo las flechas', F.flechas);
    if (u.cohesion < COHESION_ROTA) anadir('formación rota', F.formacionRota); else if (u.cohesion < COHESION_BAJA) anadir('formación desordenada', F.formacionDesordenada);
    if (u.fatiga > 0.15) anadir('cansancio', F.cansancio * u.fatiga);
    let aliadosHuyendo = 0;
    for (const a of this.unidades) if (a !== u && a.equipo === u.equipo && a.vivos > 0 && a.huyendo && !a.retirada && distancia(u.centroX, u.centroY, a.centroX, a.centroY) < 40) aliadosHuyendo++;
    if (aliadosHuyendo) anadir('aliados huyendo cerca', F.aliadoHuyendo * Math.min(2, aliadosHuyendo));
    if (this.generalPerdido && this.generalPerdido[u.equipo] && !u.esGeneral) anadir('general caído', F.generalMuerto);
    else if (conGeneral) anadir('general cerca', F.generalCerca);
    if (causadasRecientes >= 2 && causadasRecientes > recientes * 1.5) anadir('ganando el combate', F.ganando);
    // apoyo de filas: infantería con filas detrás de la primera (cuentan las filas distintas de los soldados vivos)
    const filas = new Set(); for (const i of u.indices) if (this.vivo(i)) filas.add(Math.round(this.localX[i] * 4));
    u.filasApoyo = u.stats.montado ? 0 : Math.min(APOYO_FILAS_TOPE, Math.max(0, filas.size - 1)) * ((u.formacion && u.formacion.clave === 'abierta') ? 0.5 : 1);
    if (u.filasApoyo) anadir('apoyo de ' + Math.round(u.filasApoyo) + ' fila' + (Math.round(u.filasApoyo) === 1 ? '' : 's'), F.apoyoFila * u.filasApoyo);
    // superioridad numérica: solo en combate; soldados en pie (sin huir) propios y enemigos a RADIO_SUPERIORIDAD del centro
    if (u.luchando > 0) {
      let propios = 0, enemigos = 0;
      for (const otra of this.unidades) {
        if (otra.vivos === 0 || (otra.huyendo && !otra.retirada) || distancia(u.centroX, u.centroY, otra.centroX, otra.centroY) > RADIO_SUPERIORIDAD + 10) continue;
        if (otra.equipo === u.equipo) propios += otra.vivos; else enemigos += otra.vivos;
      }
      if (enemigos > 0) {
        const valor = limitar(F.superioridad * Math.log2(propios / enemigos), -12, 10);
        if (Math.abs(valor) >= 1) anadir(valor > 0 ? 'superioridad numérica' : 'inferioridad numérica', valor);
      }
    }
    if (t < (u.cediendoHasta || -1)) anadir('cediendo terreno', F.cediendo);
    const objetivo = limitar(u.moralMax + factores.reduce((s, f) => s + f[1], 0), 0, u.moralMax);
    if (u.moral > objetivo) u.moral = Math.max(objetivo, u.moral - MORAL_CAIDA);
    else u.moral = Math.min(objetivo, u.moral + MORAL_SUBIDA + (conGeneral ? aura.moral : 0));
    u.moralObjetivo = objetivo; u.factoresMoral = factores;
  }
  // Primera unidad enemiga (distinta del objetivo) que se cruza en la recta hacia el objetivo: devuelve un punto a su costado
  // para rodearla, o null si el camino está libre. Una unidad «se cruza» si su centro queda a menos de su medio ancho + el de
  // la propia + 6 m de la recta, por delante y antes del objetivo.
  puntoDeRodeo(u, objetivo) {
    const ax = u.origenX, ay = u.origenY, bx = objetivo.centroX, by = objetivo.centroY;
    const largo = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / largo, uy = (by - ay) / largo;
    const propia = this.dimensionesUnidad(u).ancho / 2;
    let mejor = null, mejorAvance = Infinity;
    for (const otra of this.unidades) {
      if (otra === objetivo || otra.equipo === u.equipo || otra.vivos === 0 || otra.huyendo) continue;
      const rx = otra.centroX - ax, ry = otra.centroY - ay;
      const avance = rx * ux + ry * uy, lateral = -rx * uy + ry * ux;
      const radio = this.dimensionesUnidad(otra).ancho / 2 + propia + 6;
      if (avance > 0 && avance < largo - 4 && Math.abs(lateral) < radio && avance < mejorAvance) { mejorAvance = avance; mejor = { otra, lateral, radio }; }
    }
    if (!mejor) return null;
    // se rodea por el lado en el que ya está la recta respecto a la unidad (el más corto); el punto de paso queda a su costado
    // y algo más allá de ella en la dirección de la marcha, para que al llegar el camino al objetivo ya esté libre
    const lado = mejor.lateral > 0 ? -1 : 1, mas = this.dimensionesUnidad(mejor.otra).fondo / 2 + 8;
    const px = mejor.otra.centroX + (-uy) * lado * mejor.radio * 1.15 + ux * mas, py = mejor.otra.centroY + ux * lado * mejor.radio * 1.15 + uy * mas;
    return [limitar(px, 4, CAMPO.ancho - 4), limitar(py, 4, CAMPO.alto - 4)];
  }
  diferenciaAngulo(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  // Gira la formación hacia un rumbo: si el giro es mayor que GIRO_MEDIA_VUELTA (el destino queda a la espalda), media vuelta
  // en el sitio; si no, rueda poco a poco (1,2 rad/s) como hasta ahora
  girarHacia(u, rumbo, dt) {
    const giro = this.diferenciaAngulo(rumbo, u.rumbo);
    if (Math.abs(giro) > GIRO_MEDIA_VUELTA && this.puedeMediaVuelta(u)) { this.mediaVuelta(u); return; }
    u.rumbo += limitar(giro, -1.2 * dt, 1.2 * dt);
  }
  // La unidad que está peleando no da media vuelta (la cuña sí: la rehace con la punta hacia el nuevo frente)
  puedeMediaVuelta(u) { return u.luchando === 0; }
  /* Media vuelta (2026-10-12, pedido por el usuario): cada soldado se gira donde está y la última fila pasa a ser la primera;
     las casillas no se mueven. Con el origen en el centro del frente y las filas hacia atrás (localX ≤ 0), el nuevo origen es
     el centro de la última fila y cada soldado pasa a (fondoMin − localX, −localY) con el rumbo girado 180°. */
  mediaVuelta(u) {
    let fondoMin = 0;
    for (const i of u.indices) if (this.localX[i] < fondoMin) fondoMin = this.localX[i];
    const cos = Math.cos(u.rumbo), sen = Math.sin(u.rumbo);
    u.origenX += cos * fondoMin; u.origenY += sen * fondoMin;
    for (const i of u.indices) { this.localX[i] = fondoMin - this.localX[i]; this.localY[i] = -this.localY[i]; }
    u.rumbo = this.diferenciaAngulo(u.rumbo + Math.PI, 0);
    for (const i of u.indices) if (this.vivo(i) && this.estado[i] !== ESTADO.VOLANDO && this.estado[i] !== ESTADO.LUCHANDO) this.rumbo[i] = u.rumbo;
    // la cuña, girada, tendría la punta atrás: se rehace hacia el nuevo frente, cada jinete a la casilla más cercana
    if (u.formacion && u.formacion.cuna) this.formar(u, u.formacion.clave, { porCercania: true });
  }
  // ----- altura del terreno (fase 2): sin terreno (o con uno de prueba sin relieve), todo llano -----
  alturaEn(x, y) { return this.terreno && this.terreno.alturaEn ? this.terreno.alturaEn(x, y) : 0; }
  pendienteEn(x, y, dirX, dirY) { return this.terreno && this.terreno.pendienteEn ? this.terreno.pendienteEn(x, y, dirX, dirY) : 0; }
  // multiplicador de velocidad por la pendiente en la dirección de la marcha
  factorPendiente(pendiente) {
    const P = PENDIENTE_MARCHA;
    return pendiente > 0 ? 1 - Math.min(P.frenoMaximo, pendiente * P.frenoSubida) : 1 + Math.min(P.impulsoMaximo, -pendiente * P.impulsoBajada);
  }
  /* Pendiente de una carga que alcanza el punto (x, y) yendo en la dirección (dirX, dirY): la subida (positiva) o bajada de los
     últimos PENDIENTE_CARGA.tramo m de carrera. No la pendiente en el punto del choque: contra un enemigo plantado en lo alto
     el choque es casi en llano, pero el jinete viene de subir toda la ladera (2026-10-16, lo vio el usuario). */
  pendienteDeCarga(x, y, dirX, dirY) {
    const tramo = PENDIENTE_CARGA.tramo;
    return (this.alturaEn(x, y) - this.alturaEn(x - dirX * tramo, y - dirY * tramo)) / tramo;
  }
  factorCarga(pendiente) { return 1 + limitar(-pendiente * PENDIENTE_CARGA.porPendiente, -PENDIENTE_CARGA.maximo, PENDIENTE_CARGA.maximo); }
  // el soldado vivo de la unidad más cercano a (x, y): el frente que se encuentra quien llega desde allí (para la IA y el render)
  soldadoMasCercano(unidad, x, y) {
    let mejor = -1, mejorD = Infinity;
    for (const i of unidad.indices) { if (!this.vivo(i)) continue; const d = distancia(x, y, this.posX[i], this.posY[i]); if (d < mejorD) { mejorD = d; mejor = i; } }
    return mejor;
  }
  // multiplicador del daño de un golpe dado con esa pendiente hacia el golpeado (positiva: desde arriba)
  factorAlturaMele(pendiente) {
    const A = ALTURA_MELE;
    return pendiente > 0 ? 1 + Math.min(A.ventajaMaxima, pendiente * A.ventajaPorPendiente) : 1 - Math.min(A.desventajaMaxima, -pendiente * A.desventajaPorPendiente);
  }
  /* Alcance de tiro de una unidad ahora mismo: el de sus datos, por el clima y por la altura respecto al blanco (desde arriba
     se llega más lejos). Sin blanco, respecto al llano (lo usa el cono de alcance del render). Antes de la fase 2: ×1,15 fijo
     desde cualquier colina. */
  alcanceTiroDe(u, blanco) {
    const desnivel = this.alturaEn(u.centroX, u.centroY) - (blanco ? this.alturaEn(blanco.centroX, blanco.centroY) : 0);
    const factor = 1 + limitar(desnivel * ALTURA_ALCANCE.porMetro, -ALTURA_ALCANCE.maximo, ALTURA_ALCANCE.maximo);
    return (u.stats.alcanceTiro || 0) * factor * this.clima.alcanceTiro;
  }
  /* ¿Puede la unidad tirar a ese blanco? Ballestas (tiro tenso, `apuntado`): si ven su centro desde el suyo. Arcos y
     mangoneles: si la parábola hasta su centro no choca con el terreno. Se guarda unos pasos (CADA_VISION) por unidad. */
  lineaDeTiroLibre(u, blanco) {
    if (!this.terreno || !this.terreno.visionLibre) return true;
    if (!u.cacheTiro) u.cacheTiro = {};
    const c = u.cacheTiro[blanco.id];
    if (c && this.paso - c.paso < CADA_VISION) return c.libre;
    const libre = this.calcularLineaDeTiro(u, blanco);
    u.cacheTiro[blanco.id] = { paso: this.paso, libre };
    return libre;
  }
  // el cálculo sin caché: no toca el estado, así que lo puede usar el render (la caché viaja con el estado de la partida en red,
  // y si el render la rellenara un jugador tendría valores que los demás no y se desincronizarían)
  calcularLineaDeTiro(u, blanco) {
    if (!this.terreno || !this.terreno.visionLibre) return true;
    const x0 = u.centroX, y0 = u.centroY, x1 = blanco.centroX, y1 = blanco.centroY, h0 = this.alturaEn(x0, y0), h1 = this.alturaEn(x1, y1);
    if (u.stats.apuntado) return this.terreno.visionLibre(x0, y0, h0 + ALTURA_OJOS, x1, y1, h1 + ALTURA_PECHO);
    const duracion = distancia(x0, y0, x1, y1) / u.stats.velocidadFlecha;
    return this.terreno.trayectoriaLibre(x0, y0, h0 + ALTURA_SALIDA_FLECHA, x1, y1, h1 + ALTURA_PECHO, GRAVEDAD * duracion * duracion / 8) >= 1;
  }
  // ¿Está la unidad enemiga dentro del arco de tiro (±ARCO_TIRO respecto al rumbo de la formación)?
  enArcoDeTiro(u, enemigo) {
    if (u.stats.disparaEnMovimiento) return true;
    return Math.abs(this.diferenciaAngulo(Math.atan2(enemigo.centroY - u.centroY, enemigo.centroX - u.centroX), u.rumbo)) <= ARCO_TIRO;
  }
  // El enemigo vivo más cercano que esté a tiro y dentro del arco, o null
  // (fase 2: el alcance de cada uno según la altura, y solo los que tienen línea de tiro libre; se mira la línea de tiro
  // empezando por el más cercano para no recorrer el terreno hacia todos)
  blancoEnArco(u) {
    const candidatos = [];
    for (const e of this.unidades) {
      if (e.equipo === u.equipo || e.vivos === 0 || (e.huyendo && !e.retirada)) continue;
      const d = distancia(u.centroX, u.centroY, e.centroX, e.centroY);
      if (d > 6 && d < this.alcanceTiroDe(u, e) && this.enArcoDeTiro(u, e)) candidatos.push({ e, d });
    }
    candidatos.sort((a, b) => a.d - b.d || a.e.id - b.e.id);
    for (const { e } of candidatos) if (this.lineaDeTiroLibre(u, e)) return e;
    return null;
  }
  /* Escaramuza: con la opción activada, tirador que dispara en movimiento y con flechas, busca enemigos de cuerpo a cuerpo
     (sin tiro, o sin flechas) demasiado cerca; si los hay, fija u.esquiva = punto de escape a DISTANCIA_HUIDA_ESCARAMUZA m.
     El punto se elige entre 16 direcciones: el que queda más lejos de las amenazas (de la más cercana y de su media) y sin
     acercarse al borde del campo, con preferencia por alejarse en línea recta. Así, cuando se quedan sin campo, giran y
     rodean al perseguidor en vez de dejarse arrinconar contra el borde. */
  actualizarEscaramuza(u) {
    if (!u.escaramuza || !u.stats.disparaEnMovimiento || u.huyendo || u.vivos === 0) { u.esquiva = null; return; }
    const amenazas = [];
    let hx = 0, hy = 0;
    for (const e of this.unidades) {
      if (e.equipo === u.equipo || e.vivos === 0 || e.huyendo || (e.stats.alcanceTiro && !e.sinMunicion)) continue;
      const limite = e.stats.montado ? DISTANCIA_ESCARAMUZA.caballeria : DISTANCIA_ESCARAMUZA.infanteria;
      const dx = u.centroX - e.centroX, dy = u.centroY - e.centroY, d = Math.hypot(dx, dy) || 1;
      if (d < limite) { amenazas.push(e); const peso = (limite - d) / limite + 0.2; hx += dx / d * peso; hy += dy / d * peso; }
    }
    if (!amenazas.length) { if (u.esquiva && distancia(u.origenX, u.origenY, u.esquiva.x, u.esquiva.y) <= 3) u.esquiva = null; return; }
    const largo = Math.hypot(hx, hy) || 1, huidaX = hx / largo, huidaY = hy / largo;
    const margen = 12, R = DISTANCIA_HUIDA_ESCARAMUZA;
    let mejor = null, mejorPuntuacion = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
      const x = u.origenX + ux * R, y = u.origenY + uy * R;
      if (x < margen || x > CAMPO.ancho - margen || y < margen || y > CAMPO.alto - margen) continue;
      let masCercana = Infinity; for (const e of amenazas) masCercana = Math.min(masCercana, distancia(x, y, e.centroX, e.centroY));
      const borde = Math.min(x, CAMPO.ancho - x, y, CAMPO.alto - y);
      const puntuacion = masCercana + 12 * (ux * huidaX + uy * huidaY) + Math.min(borde, 40) * 0.5;
      if (puntuacion > mejorPuntuacion) { mejorPuntuacion = puntuacion; mejor = { x, y }; }
    }
    u.esquiva = mejor || { x: limitar(u.origenX + huidaX * R, margen, CAMPO.ancho - margen), y: limitar(u.origenY + huidaY * R, margen, CAMPO.alto - margen) };
  }
  /* Presión de una unidad en el cuerpo a cuerpo: peso de sus soldados vivos por metro de frente (las filas de atrás cuentan:
     una unidad profunda pesa más por metro), ajustado por cohesión, cansancio y formación (muro ×1,3, orden abierta ×0,6). */
  presionDe(u) {
    const dim = this.dimensionesUnidad(u);
    const peso = u.vivos * (u.stats.masa || 1) / Math.max(2, dim.ancho);
    const formacion = u.formacion && u.formacion.clave === 'muro' ? 1.3 : u.formacion && u.formacion.clave === 'abierta' ? 0.6 : 1;
    return peso * (0.5 + 0.5 * u.cohesion / 100) * (1 - 0.3 * u.fatiga) * formacion;
  }
  /* Empuje: para cada par de unidades enemigas trabadas entre sí (una tiene a la otra de objetivo y ambas luchan), si la
     presión de una supera a la de la otra en más de EMPUJE.umbral, el combate entero se desplaza hacia la más débil:
     formaciones y soldados de ambas se mueven a la vez, la que cede pierde cohesión y lleva el factor «cediendo terreno». */
  resolverEmpujes(dt) {
    // se suman todos los empujes que recibe cada unidad y se aplica el neto una sola vez (con tope): si varias empujan a la
    // misma desde lados distintos, sus soldados no reciben tirones opuestos en cada paso
    const neto = new Map();
    const sumar = (u, x, y) => { const n = neto.get(u) || { x: 0, y: 0 }; n.x += x; n.y += y; neto.set(u, n); };
    for (const a of this.unidades) {
      if (a.vivos === 0 || a.huyendo || a.luchando === 0 || a.objetivoUnidad < 0) continue;
      const b = this.unidades[a.objetivoUnidad];
      if (!b || b.vivos === 0 || b.huyendo || b.luchando === 0 || b.equipo === a.equipo) continue;
      if (b.objetivoUnidad === a.id && b.id < a.id) continue;              // el par ya se resolvió desde b
      if (distancia(a.centroX, a.centroY, b.centroX, b.centroY) > 30) continue;
      const pa = this.presionDe(a), pb = this.presionDe(b);
      const fuerte = pa >= pb ? a : b, debil = fuerte === a ? b : a, ratio = Math.max(pa, pb) / Math.max(0.01, Math.min(pa, pb));
      if (ratio < EMPUJE.umbral) continue;
      const v = Math.min(EMPUJE.tope, EMPUJE.velocidad * (ratio - EMPUJE.umbral)) * dt;
      const dx = debil.centroX - fuerte.centroX, dy = debil.centroY - fuerte.centroY, d = Math.hypot(dx, dy) || 1;
      sumar(fuerte, dx / d * v, dy / d * v); sumar(debil, dx / d * v, dy / d * v);
      debil.cohesion = Math.max(0, debil.cohesion - EMPUJE.cohesion * dt);
      debil.cediendoHasta = this.tiempo + 1.5;
    }
    const tope = EMPUJE.tope * dt;
    for (const [u, n] of neto) {
      const largo = Math.hypot(n.x, n.y); if (largo < 1e-6) continue;
      const k = largo > tope ? tope / largo : 1, ux = n.x * k, uy = n.y * k;
      u.origenX = limitar(u.origenX + ux, 2, CAMPO.ancho - 2); u.origenY = limitar(u.origenY + uy, 2, CAMPO.alto - 2);
      for (const i of u.indices) if (this.vivo(i) && this.estado[i] !== ESTADO.VOLANDO) { this.posX[i] = limitar(this.posX[i] + ux, 0.5, CAMPO.ancho - 0.5); this.posY[i] = limitar(this.posY[i] + uy, 0.5, CAMPO.alto - 0.5); }
    }
  }
  recontar() {
    const n = this.cantidad;
    const est = this.estadisticas; est.vivos[0] = est.vivos[1] = est.muertos[0] = est.muertos[1] = est.huyendo[0] = est.huyendo[1] = est.retirada[0] = est.retirada[1] = est.huidos[0] = est.huidos[1] = 0; est.flechasVolando = 0;
    for (let i = 0; i < n; i++) { if (this.vivo(i)) { est.vivos[this.equipo[i]]++; const uu = this.unidades[this.unidadDe[i]]; if (uu.huyendo) { if (uu.retirada) est.retirada[this.equipo[i]]++; else est.huyendo[this.equipo[i]]++; } } else if (this.estado[i] === ESTADO.AUSENTE) est.huidos[this.equipo[i]]++; else est.muertos[this.equipo[i]]++; }
    for (let k = 0; k < this.maxFlechas; k++) if (this.flechaEstado[k] === 1) est.flechasVolando++;
  }

  actualizarUnidad(u, dt) {
    let sx = 0, sy = 0, vivos = 0, luchando = 0, luchandoBlanco = 0;   // luchandoBlanco: los que pelean con su objetivo fijo
    for (const i of u.indices) if (this.vivo(i)) { sx += this.posX[i]; sy += this.posY[i]; vivos++; if (this.estado[i] === ESTADO.LUCHANDO) { luchando++; if (this.objetivo[i] >= 0 && this.unidadDe[this.objetivo[i]] === u.objetivoFijo) luchandoBlanco++; } }
    u.vivos = vivos; u.luchando = luchando;
    if (!vivos) return;
    /* Cerrar filas (2026-10-16, pedido del usuario): al morir un soldado solo avanza el de detrás de su columna (cubrirHueco);
       si caía la columna entera, el hueco se quedaba abierto y la unidad con el ancho de cuando estaba completa. Ahora, cada
       CADA_CERRAR_FILAS pasos, una unidad que ha perdido hombres desde que formó y que no pelea vuelve a formar con los que le
       quedan (mismos puestos relativos: nadie cruza la unidad); el frente se estrecha y el hueco desaparece. En la melé no:
       desharía la línea mientras se pelea. */
    if (!u.huyendo && !luchando && !u.trabada && u.formacion && vivos < (u.vivosAlFormar || u.total) && (this.paso + u.id) % CADA_CERRAR_FILAS === 0) this.formar(u, u.formacion.clave);
    // velocidad de la unidad (suavizada; los saltos del centro al morir soldados se amortiguan): la usan los tiradores
    // para apuntar por delante de un blanco en movimiento
    const nuevoX = sx / vivos, nuevoY = sy / vivos;
    if (u.velX === undefined) { u.velX = 0; u.velY = 0; }
    else if (dt > 0) {
      const vx = limitar((nuevoX - u.centroX) / dt, -14, 14), vy = limitar((nuevoY - u.centroY) / dt, -14, 14);
      u.velX = u.velX * 0.85 + vx * 0.15; u.velY = u.velY * 0.85 + vy * 0.15;
    }
    u.centroX = nuevoX; u.centroY = nuevoY;
    const datos = u.stats, F = u.formacion || FORMACIONES.linea;
    // objetivo: el fijado por la orden de ataque mientras siga en pie; si no, el enemigo más cercano
    // objetivo fijo (orden de atacar a una unidad concreta): mientras viva y no huya, es el objetivo. Si huye, la caballería lo
    // persigue mientras lo tenga a menos de DISTANCIA_PERSECUCION; si cae, escapa o se aleja, la unidad SE DETIENE y espera
    // órdenes (antes pasaba a «avanzar» y se lanzaba contra el enemigo más cercano, que no era el que se le había mandado)
    if (u.objetivoFijo >= 0) {
      const fijo = this.unidades[u.objetivoFijo];
      // persiguiendo a jinetes que escaramucean, la caballería ligera mantiene el galope de carga (2026-10-14)
      // (solo la caballería más rápida que ellos, es decir, la ligera; la pesada, más lenta, no aguanta el galope de carga
      // persiguiendo a quien no alcanza: pierde el impulso en unos segundos y vuelve al trote)
      if (datos.montado && !datos.alcanceTiro && fijo.esquiva && u.luchando === 0 && this.paso % 30 === 0) {
        if (datos.velocidad > fijo.stats.velocidad) { if (u.energiaCarga <= 0) u.energiaCarga = (datos.energiaCarga || 0) * 0.5 * this.clima.carga; }
        else u.energiaCarga = Math.max(0, u.energiaCarga - 2);
      }
      // desde el 2026-10-13 persigue cualquier tropa, no solo la caballería: mandar a la infantería contra una unidad que huye
      // la dejaba parada al instante («a veces no atacan», prueba con amigos)
      const persigue = fijo.vivos > 0 && fijo.huyendo && !fijo.retirada && distancia(u.centroX, u.centroY, fijo.centroX, fijo.centroY) < DISTANCIA_PERSECUCION;
      if (fijo.vivos === 0 || (fijo.huyendo && !persigue && !fijo.retirada)) { u.objetivoFijo = -1; if (u.orden === 'atacar') { u.orden = 'formar'; u.objetivoX = u.origenX; u.objetivoY = u.origenY; } }
      else u.objetivoUnidad = fijo.id;
    }
    if (u.objetivoFijo < 0 && (this.paso % 15 === 0 || u.objetivoUnidad < 0 || this.unidades[u.objetivoUnidad].vivos === 0)) u.objetivoUnidad = this.unidadEnemigaMasCercana(u);
    const objetivo = u.objetivoUnidad >= 0 ? this.unidades[u.objetivoUnidad] : null;
    // moral: cada segundo se recalcula la moral objetivo con sus factores y la moral real se acerca a ella
    if (this.paso % 30 === 0 && !u.huyendo) {
      const bajas = u.total - vivos, nuevas = bajas - u.bajasPrevias; u.bajasPrevias = bajas;
      const fraccionPerdida = bajas / u.total;
      const general = this.unidades.find(g => g.esGeneral && g.equipo === u.equipo && g.vivos > 0 && !g.huyendo);
      const aura = (this.auraPorEquipo && this.auraPorEquipo[u.equipo]) || { radio: 35, moral: 1.5 };   // los rasgos del general amplían el aura
      const conGeneral = !u.esGeneral && general && distancia(u.centroX, u.centroY, general.centroX, general.centroY) < aura.radio;
      this.calcularMoral(u, vivos, nuevas, fraccionPerdida, conGeneral, aura);
      if (u.moral < (conGeneral ? 18 : 25) || fraccionPerdida > 0.75) {
        u.huyendo = true; u.orden = 'huir'; u.energiaCarga = 0;
        // la tropa veterana (y la guardia) se retira formada en vez de desbandarse, si aún tiene cohesión y no está diezmada
        u.retirada = ((u.nivel || 0) >= NIVEL_RETIRADA_CONTROLADA || !!u.esGeneral) && fraccionPerdida <= 0.6 && u.cohesion > COHESION_ROTA;
        if (u.retirada) u.puedeVolver = this.puedeVolverDeRetirada(u, objetivo);
      }
      // fatiga: sube luchando y corriendo, baja parada; afecta a velocidad y daño (el barro cansa más)
      const fatigaMontado = datos.montado ? FATIGA_MONTADOS : null;
      if (luchando > vivos * 0.2) u.fatiga += 0.03 * this.clima.fatiga * (fatigaMontado ? fatigaMontado.luchando : 1);
      // correr cansa la mitad que antes (2026-10-13): atacar a la carrera (el doble clic que usa todo el mundo) llegaba a la melé
      // tan cansado que, en un duelo entre tropas iguales, el que atacaba perdía siempre
      else if (u.esquiva) u.fatiga += FATIGA_ESCARAMUZA * this.clima.fatiga;
      // cuesta arriba (fase 2): correr cansa hasta un 50 % más y andando no se descansa, se cansa un poco
      else if (u.corriendo) u.fatiga += 0.0075 * this.clima.fatiga * (fatigaMontado ? fatigaMontado.corriendo * 2 : 1) * (1 + FATIGA_SUBIDA.corriendo * limitar((u.subida || 0) / FATIGA_SUBIDA.pendienteTope, 0, 1));
      else if ((u.subida || 0) > 0.03) u.fatiga += FATIGA_SUBIDA.andando * this.clima.fatiga * limitar(u.subida / FATIGA_SUBIDA.pendienteTope, 0, 1) * (fatigaMontado ? fatigaMontado.corriendo : 1);
      else u.fatiga -= 0.04 * (fatigaMontado ? fatigaMontado.recuperacion : 1);
      u.fatiga = limitar(u.fatiga, 0, 1);
      // cohesión: cuántos soldados están lejos de su puesto, si la formación se mueve trabada o corre; sube parada y sin luchar
      let fueraDePuesto = 0;
      for (const i of u.indices) if (this.vivo(i) && distancia(this.posX[i], this.posY[i], this.casillaX[i], this.casillaY[i]) > 1.5) fueraDePuesto++;
      const moviendose = u.desplazamientoSegundo > 0.5;
      let perdida = (fueraDePuesto / vivos) * 10 + (luchando > 0 && moviendose ? 4 : 0) + (u.marcha === 'correr' && moviendose ? 2 : 0);
      perdida *= F.cohesionPerdida || 1;                                     // muro ×0,5, orden abierta ×0,6
      perdida *= 1 - 0.1 * (u.filasApoyo || 0);                               // apoyo de filas: hasta −40 %
      const ganancia = (luchando > 0 ? 0 : moviendose ? 2 : 8) * (F.cohesionGanancia || 1);   // muro ×1,5
      u.cohesion = limitar(u.cohesion - perdida + ganancia, 0, 100);
      u.desplazamientoSegundo = 0;
    } else if (this.paso % 30 === 0 && u.huyendo) {
      const bajas = u.total - vivos, nuevas = bajas - u.bajasPrevias; u.bajasPrevias = bajas;
      if (u.retirada) {
        // retirada controlada: sigue perdiendo moral con las bajas, la recupera despacio y se rehace lejos del enemigo
        u.moral -= nuevas * (100 / u.total);
        const general = this.unidades.find(g => g.esGeneral && g.equipo === u.equipo && g.vivos > 0 && !g.huyendo);
        const aura = (this.auraPorEquipo && this.auraPorEquipo[u.equipo]) || { radio: 35, moral: 1.5 };
        const conGeneral = general && distancia(u.centroX, u.centroY, general.centroX, general.centroY) < aura.radio;
        u.moral = Math.min(u.moralMax, u.moral + 2 + (conGeneral ? aura.moral : 0));
        const enemigoCerca = objetivo && distancia(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY) < DISTANCIA_REHACERSE;
        if (u.moral >= MORAL_REHACERSE && !enemigoCerca) this.rehacer(u);
        else if (u.moral < 8 || (u.total - vivos) / u.total > 0.75) u.retirada = false;    // se desbanda
        else u.puedeVolver = this.puedeVolverDeRetirada(u, objetivo);
      }
      u.desplazamientoSegundo = 0;
    }
    let destinoX = null, destinoY = null, velocidad = 0, detener = 1.5;
    // escaramuza: decide (cada medio segundo) si hay que alejarse de un enemigo de cuerpo a cuerpo que se acerca
    if (this.paso % 15 === 0) this.actualizarEscaramuza(u);
    if (u.esquiva && !u.huyendo) {
      destinoX = u.esquiva.x; destinoY = u.esquiva.y; velocidad = datos.velocidad * VELOCIDAD_ESQUIVA; detener = 2;
      if (distancia(u.origenX, u.origenY, destinoX, destinoY) <= 3) u.esquiva = null;
    } else if (u.orden === 'huir' && u.retirada) {
      // retirada controlada: hacia el borde propio, formados y al paso, sin salir del campo
      destinoX = u.equipo === 0 ? 8 : CAMPO.ancho - 8; destinoY = limitar(u.origenY, 8, CAMPO.alto - 8); velocidad = datos.velocidad * 0.85; detener = 1.5;
    } else if (u.orden === 'huir') {
      // huir hacia el borde propio (más allá de él, para que los soldados lleguen a salir), esquivando de lado al enemigo más
      // cercano si lo tiene a menos de 30 m. Antes se alejaba del enemigo más cercano: con un enemigo entre la unidad y su
      // borde (caballería que había rebasado la línea) la huida se invertía y la unidad se quedaba yendo y viniendo (2026-10-14)
      destinoX = u.equipo === 0 ? -30 : CAMPO.ancho + 30; destinoY = u.origenY;
      if (objetivo && distancia(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY) < 30) destinoY = limitar(u.origenY + (u.origenY >= objetivo.centroY ? 25 : -25), 6, CAMPO.alto - 6);
      velocidad = datos.velocidad * 1.1; detener = 0;
    } else if (u.orden === 'mover') {
      // al paso: 0,9 de la velocidad base (jinetes al trote); a la carrera: velocidad plena (jinetes al galope)
      destinoX = u.objetivoX; destinoY = u.objetivoY; velocidad = (u.marcha === 'correr' ? datos.velocidad * (datos.montado ? 1 : 1.4) : (datos.montado ? 3.5 : datos.velocidad * 0.9)) * (F.velocidad || 1); detener = 1.0;
      if (distancia(u.origenX, u.origenY, destinoX, destinoY) <= detener) {
        // llegada (arreglado el 2026-10-16, lo vio el usuario: a veces no se quedaba mirando a donde se le pedía): si el rumbo
        // pedido exige media vuelta, se da y la formación se coloca en el destino (la media vuelta pasa su referencia a la
        // última fila); y en este paso ya no se marcha ni se gira hacia el destino: antes, con la referencia desplazada, el
        // destino quedaba a la espalda, la unidad volvía a dar media vuelta y acababa mirando al revés de lo pedido
        u.orden = 'formar';
        if (u.rumboFinal !== null) {
          if (Math.abs(this.diferenciaAngulo(u.rumboFinal, u.rumbo)) > GIRO_MEDIA_VUELTA && this.puedeMediaVuelta(u)) { this.mediaVuelta(u); u.origenX = destinoX; u.origenY = destinoY; }
          u.rumbo = u.rumboFinal; u.rumboFinal = null;
        }
        destinoX = destinoY = null;
      }
    } else if ((u.orden === 'avanzar' || u.orden === 'cargar' || u.orden === 'atacar') && objetivo) {
      // el destino se lleva más allá del centro enemigo según el fondo de la propia formación: así las filas de atrás
      // (una cuña, una columna) también entran en contacto en vez de quedarse paradas delante del enemigo
      const haciaX = objetivo.centroX - u.origenX, haciaY = objetivo.centroY - u.origenY, haciaD = Math.hypot(haciaX, haciaY) || 1;
      const dimensiones = this.dimensionesUnidad(u);
      const empuje = datos.alcanceTiro ? 0 : Math.min(dimensiones.fondo * (datos.montado ? 0.35 : 0.6), haciaD);
      // (el reparto del frente por flancos se retiró el 2026-10-09 a petición del usuario: cada unidad ataca de frente a su
      //  objetivo, línea contra línea, aunque varias se solapen algo)
      destinoX = objetivo.centroX + haciaX / haciaD * empuje; destinoY = objetivo.centroY + haciaY / haciaD * empuje;
      // con un objetivo fijo, si otra unidad enemiga se interpone en el camino, se va antes a un punto a su costado (el lado
      // más cercano a la línea recta) para rodearla en vez de atravesarla y quedarse peleando con ella
      let rodeando = false;
      if (u.objetivoFijo >= 0 && (datos.montado ? luchandoBlanco : luchando) === 0) {
        const rodeo = this.puntoDeRodeo(u, objetivo);
        if (rodeo) { destinoX = rodeo[0]; destinoY = rodeo[1]; rodeando = true; }
      }
      // ya trabada (un tercio luchando): la formación se detiene en el contacto en vez de seguir metiéndose en la masa enemiga
      // la cuña con impulso de carga penetra: no se detiene hasta tener trabada la mitad de sus jinetes
      const penetra = F.penetracion && datos.montado && u.energiaCarga > 0;
      // la caballería con objetivo fijo solo cuenta el contacto con ESE objetivo: trabada con otra unidad, sigue abriéndose paso
      // hacia él (es rápida y versátil). La infantería interceptada se queda y contesta el ataque (pedido el 2026-10-14)
      const enContacto = u.objetivoFijo >= 0 && datos.montado ? luchandoBlanco : luchando;
      if (enContacto >= Math.max(1, vivos * (penetra ? 0.5 : CONTACTO_FORMACION)) && u.orden !== 'cargar') { destinoX = u.origenX; destinoY = u.origenY; }
      const cargando = u.orden === 'cargar' || (u.orden === 'atacar' && datos.montado && u.energiaCarga > 0);
      // una carga que ya está trabada (un tercio luchando) ha perdido el impulso: pasa a avanzar y pelea
      if (u.orden === 'cargar' && luchando >= vivos * (F.penetracion ? 0.5 : 0.33)) { u.orden = 'avanzar'; u.energiaCarga = 0; }
      const persiguiendoFugitivos = datos.montado && objetivo.huyendo;             // la caballería galopa tras los que huyen
      // la carga de los jinetes va a su velocidad de carga (galope tendido), más rápida que la carrera normal
      velocidad = (cargando && datos.velocidadCarga ? datos.velocidadCarga : cargando || u.marcha === 'correr' || persiguiendoFugitivos ? datos.velocidad * (cargando || datos.montado ? 1 : 1.4) : (datos.montado ? 2.6 : datos.velocidad * 0.85)) * (F.velocidad || 1);
      detener = cargando ? 2 : (datos.alcanceTiro ? (u.blancoTapado ? 4 : datos.alcanceTiro * 0.7) : 1.5);   // tapado: hasta verlo (fase 2)
      if (rodeando) detener = 0;                // rodeando a una unidad que estorba: no se para en el punto de paso
      if (u.orden === 'cargar' && u.energiaCarga <= 0) u.orden = 'avanzar';
    } else if (u.orden === 'formar' && u.rumboFinal !== null) {
      // orden de encarar sin moverse
      this.girarHacia(u, u.rumboFinal, dt);
      if (Math.abs(this.diferenciaAngulo(u.rumboFinal, u.rumbo)) < 0.03) { u.rumbo = u.rumboFinal; u.rumboFinal = null; }
    }
    u.corriendo = false; u.enMarcha = false; u.subida = 0;   // enMarcha: la formación se ha desplazado en este paso
    if (destinoX !== null) {
      const dx = destinoX - u.origenX, dy = destinoY - u.origenY, d = Math.hypot(dx, dy) || 1;
      const rumboDeseado = Math.atan2(dy, dx);
      // en retirada controlada la formación no se da la vuelta: recula de cara al enemigo
      const reculando = u.orden === 'huir' && u.retirada;
      // solo se orienta hacia el destino si tiene adónde moverse: con el destino en su propio sitio (formación detenida en el
      // contacto) atan2(0, 0) daba 0° y la unidad giraba en pleno combate hasta dar la espalda al enemigo (2026-10-13)
      // movimiento corto (2026-10-16): con el destino más cerca que el fondo de la formación, darse la vuelta para ir hacia él
      // no sirve (la media vuelta lleva la referencia a la última fila y el destino vuelve a quedar detrás: se quedaba girando
      // sin llegar nunca); la formación se desliza hasta allí sin girarse y al llegar se orienta
      let deslizar = false;
      if (u.orden === 'mover' && d < 14) { let fondoMin = 0; for (const i of u.indices) if (this.localX[i] < fondoMin) fondoMin = this.localX[i]; deslizar = d < 1.5 - fondoMin; }
      if (!reculando && !deslizar && Math.hypot(dx, dy) > Math.max(detener, 0.5)) this.girarHacia(u, rumboDeseado, dt);
      const rumboMovimiento = reculando || deslizar ? rumboDeseado : u.rumbo;
      // fatiga y terreno frenan a la formación; el bosque, mucho
      velocidad *= (1 - 0.3 * u.fatiga) * (this.terreno ? FRENO_TERRENO[this.terreno.tipoEn(u.origenX, u.origenY)] : 1) * (datos.montado ? this.clima.velocidadMontado : this.clima.velocidad);
      // la pendiente en la dirección de la marcha: cuesta arriba frena, cuesta abajo acelera algo (fase 2); u.subida, para la fatiga
      const pendienteMarcha = this.pendienteEn(u.origenX, u.origenY, Math.cos(rumboMovimiento), Math.sin(rumboMovimiento));
      velocidad *= this.factorPendiente(pendienteMarcha);
      u.subida = d > detener ? pendienteMarcha : 0;
      // solo fatiga correr, cargar o huir; la marcha al paso no cansa
      u.corriendo = d > detener && (u.marcha === 'correr' || u.orden === 'cargar' || u.orden === 'huir' || velocidad >= datos.velocidad * 0.95);
      // la formación no sale del campo, salvo que huya: entonces sigue hasta fuera y los soldados desaparecen por el borde
      const margen = u.orden === 'huir' ? -40 : 2;
      if (d > detener) { u.enMarcha = true; u.origenX = limitar(u.origenX + Math.cos(rumboMovimiento) * velocidad * dt, margen, CAMPO.ancho - margen); u.origenY = limitar(u.origenY + Math.sin(rumboMovimiento) * velocidad * dt, margen, CAMPO.alto - margen); u.desplazamientoSegundo += velocidad * dt; }
      // red de seguridad: una unidad con orden ofensiva que llega a su destino y no pelea (p. ej. un flanco mal medido o un
      // enemigo que se movió) acumula tiempo sin contacto; pasado SIN_CONTACTO_MAXIMO deja el puesto de flanco, se va al
      // centro enemigo y sus soldados pueden salir más lejos de la casilla
      const ofensiva = u.orden === 'avanzar' || u.orden === 'cargar' || u.orden === 'atacar';
      if (ofensiva && objetivo) { if (luchando > 0) u.sinContacto = 0; else if (d <= detener + 2) u.sinContacto = (u.sinContacto || 0) + dt; }
      else u.sinContacto = 0;
    }
    const cos = Math.cos(u.rumbo), sen = Math.sin(u.rumbo);
    for (const i of u.indices) {
      this.casillaX[i] = u.origenX + this.localX[i] * cos - this.localY[i] * sen;
      this.casillaY[i] = u.origenY + this.localX[i] * sen + this.localY[i] * cos;
    }
    // tiradores trabados en cuerpo a cuerpo (al menos un 10 % luchando): dejan el arco y pelean
    u.trabada = !!datos.alcanceTiro && u.luchando > 0 && u.luchando >= Math.max(1, vivos * 0.1);
    // los tiradores solo disparan con la formación parada; la única excepción son los que disparan en movimiento (arqueros a
    // caballo). Mientras andan no tiran y, al pararse, tardan al menos un segundo en soltar la andanada (2026-10-12)
    const tiradorEnMarcha = datos.alcanceTiro && u.enMarcha && !datos.disparaEnMovimiento;
    if (tiradorEnMarcha) u.temporizadorTiro = Math.max(u.temporizadorTiro, 1);
    // acercándose porque el blanco estaba tapado: en marcha no se tira, pero se sigue mirando si ya se ve (fase 2)
    if (u.blancoTapado && (!objetivo || u.huyendo)) u.blancoTapado = false;
    else if (u.blancoTapado && tiradorEnMarcha) u.blancoTapado = distancia(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY) < this.alcanceTiroDe(u, objetivo) && !this.lineaDeTiroLibre(u, objetivo) && !this.blancoEnArco(u);
    if (datos.alcanceTiro && objetivo && !u.huyendo && !u.trabada && !tiradorEnMarcha && (u.orden === 'disparar' || u.orden === 'avanzar' || u.orden === 'formar' || u.orden === 'atacar' || (datos.disparaEnMovimiento && u.orden === 'mover'))) {
      u.temporizadorTiro -= dt;
      // el alcance depende de la altura respecto al blanco (fase 2): se calcula para cada uno
      // arco de tiro: con orden de disparar o de atacar, si el objetivo está a tiro pero fuera del arco, la formación se gira
      // hacia él (y no dispara mientras gira); con alto, se dispara al enemigo más cercano que esté dentro del arco
      let blanco = objetivo;
      const d0 = distancia(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY);
      if (!this.enArcoDeTiro(u, objetivo)) {
        if ((u.orden === 'disparar' || u.orden === 'atacar') && d0 < this.alcanceTiroDe(u, objetivo)) {
          this.girarHacia(u, Math.atan2(objetivo.centroY - u.centroY, objetivo.centroX - u.centroX), dt);
          u.temporizadorTiro = Math.max(u.temporizadorTiro, 1);
          blanco = null;
        } else blanco = this.blancoEnArco(u);
      } else if (u.objetivoFijo !== objetivo.id && !this.lineaDeTiroLibre(u, objetivo)) blanco = this.blancoEnArco(u);   // tapado: otro que se vea
      const d = blanco ? distancia(u.centroX, u.centroY, blanco.centroX, blanco.centroY) : Infinity;
      // línea de tiro (fase 2): sin ella no se tira (con un objetivo fijo tapado, la unidad espera o se acerca; ver «tapado»)
      // u.blancoTapado: hay a quien tirar a tiro pero el terreno lo tapa; con orden de avanzar o atacar, la unidad se acerca más
      u.blancoTapado = blanco ? d < this.alcanceTiroDe(u, blanco) && !this.lineaDeTiroLibre(u, blanco) : d0 < this.alcanceTiroDe(u, objetivo) && !this.lineaDeTiroLibre(u, objetivo);
      if (blanco && !u.blancoTapado && u.temporizadorTiro <= 0 && d < this.alcanceTiroDe(u, blanco) && d > (datos.alcanceMinimo || 6)) {
        const objetivo = blanco;
        u.temporizadorTiro = datos.cadenciaTiro * this.clima.cadencia;
        for (const i of u.indices) if (this.vivo(i) && this.estado[i] !== ESTADO.LUCHANDO) this.dispararFlecha(i, objetivo, datos);
        u.municion -= 1;
        if (u.municion <= 0) this.agotarMunicion(u);
      }
    }
  }

  actualizarSoldado(i, dt) {
    const e = this.estado[i];
    if (e === ESTADO.MUERTO || e === ESTADO.CADAVER) return;
    const u = this.unidades[this.unidadDe[i]], datos = u.stats;
    if (e === ESTADO.VOLANDO) {
      this.vueloVZ[i] -= GRAVEDAD * dt;
      this.vueloZ[i] += this.vueloVZ[i] * dt;
      this.posX[i] = limitar(this.posX[i] + this.vueloVX[i] * dt, 0.5, CAMPO.ancho - 0.5);
      this.posY[i] = limitar(this.posY[i] + this.vueloVY[i] * dt, 0.5, CAMPO.alto - 0.5);
      this.vueloGiro[i] += 6 * dt;
      if (this.vueloZ[i] <= 0) { this.vueloZ[i] = 0; this.matar(i, 0.9); }
      return;
    }
    const x = this.posX[i], y = this.posY[i];
    const terrenoAqui = this.terreno ? this.terreno.tipoEn(x, y) : 0;            // 0 llano, 1 bosque, 2 colina
    const vigor = 1 - 0.3 * u.fatiga;                                              // fatiga: menos velocidad y daño
    const radioBusqueda = datos.montado ? 3.0 : 2.6;
    const cuantos = this.rejilla.vecinos(x, y, radioBusqueda, this.bufferVecinos);
    let enemigo = -1, enemigoD = Infinity;                 // el enemigo más cercano: es al que se golpea si está a alcance
    let objetivoLibre = -1, objetivoPuntuacion = Infinity;   // el enemigo a perseguir: cercano y con pocos atacantes (busca huecos)
    const miRadio = datos.radio, miMasa = datos.masa;
    const enMarcha = u.orden === 'mover' || u.orden === 'avanzar' || u.orden === 'atacar' || u.orden === 'cargar';
    // con un objetivo fijo: hacia dónde está (para saber qué enemigos le cierran el paso)
    const fijo = u.objetivoFijo >= 0 ? this.unidades[u.objetivoFijo] : null;
    const haciaFijoX = fijo ? fijo.centroX - x : 0, haciaFijoY = fijo ? fijo.centroY - y : 0, haciaFijoD = fijo ? Math.hypot(haciaFijoX, haciaFijoY) : 0;
    // lo que no depende del vecino se calcula una vez (revisión de rendimiento, 2026-10-14: este bucle es el 60 % del paso)
    const miUnidad = this.unidadDe[i], miEquipo = this.equipo[i], luchoYo = this.estado[i] === ESTADO.LUCHANDO;
    const enMuro = u.formacion && u.formacion.clave === 'muro' && !luchoYo;
    const puedeAtravesar = enMarcha && !luchoYo;
    const paradoYo = (u.orden === 'formar' || u.orden === 'disparar') && !luchoYo;   // parado: me atraviesan sin empujarme
    // referencias locales y datos de unidad precalculados (prepararDatosUnidades): mismas operaciones en el mismo orden que antes
    const buffer = this.bufferVecinos, posX = this.posX, posY = this.posY, unidadDe = this.unidadDe, equipoDe = this.equipo, estadoDe = this.estado;
    const atacantesPrevio = this.atacantesPrevio, radioUnidad = this.radioUnidad, masaUnidad = this.masaUnidad, marchaUnidad = this.marchaUnidad;
    const empujeX = this.empujeX, empujeY = this.empujeY;
    const objetivoFijoId = u.objetivoFijo, montado = datos.montado, alcanceGolpe = datos.alcance;
    const VOLANDO = ESTADO.VOLANDO, LUCHANDO = ESTADO.LUCHANDO;
    for (let k = 0; k < cuantos; k++) {
      const j = buffer[k]; if (j === i) continue;
      const dx = posX[j] - x, dy = posY[j] - y, distancia2 = dx * dx + dy * dy;
      const unidadOtro = unidadDe[j], radioOtro = radioUnidad[unidadOtro], estadoOtro = estadoDe[j];
      const aliado = equipoDe[j] === miEquipo;
      /* Descarte sin calcular la distancia (2026-10-15): Math.hypot era el 38 % del paso. Si el candidato está claramente más
         lejos de lo que podría cambiar algo (choque con un aliado; enemigo más cercano, mejor blanco o choque con un enemigo),
         se salta. «Claramente»: distancia² > cota² × MARGEN_DESCARTE, con un margen muy por encima del error de redondeo, así
         que solo se saltan candidatos que el cálculo completo tampoco habría usado: la simulación da exactamente lo mismo. */
      if (aliado) {
        // en el muro de escudos los compañeros van hombro con hombro: entre ellos no se aplica la holgura entre aliados (el muro es
        // más apretado que esa holgura y nunca llegaban a su casilla, empujándose sin parar). Solo en el muro y fuera de la melé:
        // aplicarlo a todas las formaciones apelotonaba a los que esperan detrás de los que luchan
        const hombroConHombro = enMuro && unidadOtro === miUnidad && estadoOtro !== LUCHANDO;
        const minimo = (miRadio + radioOtro) * (!hombroConHombro ? HOLGURA_ALIADOS : 1);
        if (distancia2 > minimo * minimo * MARGEN_DESCARTE) continue;
        // una unidad en marcha atraviesa a las unidades aliadas PARADAS (formadas o disparando) que no pelean: si no, los arqueros
        // desplegados detrás de su infantería no podían pasar entre ella. Dos unidades en marcha sí chocan entre sí, y también con
        // los que luchan, para no amontonarse en la melé. Y en los dos sentidos (2026-10-14): el parado tampoco se deja empujar por
        // el que pasa; antes la infantería en marcha arrastraba a los arqueros parados que atravesaba
        const atraviesa = unidadOtro !== miUnidad && estadoOtro !== LUCHANDO && (
          (puedeAtravesar && marchaUnidad[unidadOtro] === 1) || (paradoYo && marchaUnidad[unidadOtro] === 2));
        if (atraviesa) continue;
        const d = Math.hypot(dx, dy);
        if (d < minimo && d > 1e-4 && estadoOtro !== VOLANDO) {
          const masaOtro = masaUnidad[unidadOtro];
          const solape = (minimo - d) * (masaOtro / (miMasa + masaOtro));
          empujeX[i] -= dx / d * solape; empujeY[i] -= dy / d * solape;
        }
        continue;
      }
      // enemigo: la distancia solo cuenta si puede mejorar al más cercano o al mejor blanco (la puntuación nunca es menor que la
      // distancia) o si choca
      const minimo = miRadio + radioOtro;
      const cota = enemigoD > objetivoPuntuacion ? (enemigoD > minimo ? enemigoD : minimo) : (objetivoPuntuacion > minimo ? objetivoPuntuacion : minimo);
      if (distancia2 > cota * cota * MARGEN_DESCARTE) continue;
      const d = Math.hypot(dx, dy);
      // con objetivo fijo, los enemigos de otras unidades no se eligen como blanco salvo que estén pegados (para defenderse);
      // el choque físico con ellos sigue más abajo
      // y desde el 2026-10-13, aunque esté pegado, solo si además le cierra el paso (está por delante, hacia su objetivo): a los
      // que tiene a los lados o detrás los deja atrás para cumplir la orden
      // (solo la caballería, 2026-10-14: la infantería interceptada contesta a quien la ataque y sigue después hacia su blanco)
      // la infantería se defiende de todo el que tenga a alcance de golpe (si no, la golpeaban desde 1,45 m y ella solo «veía» a 1,08 m)
      const ignorado = fijo && unidadOtro !== objetivoFijoId && (montado ? (d > miRadio + radioOtro + 0.35 || !(haciaFijoD < 4 || (dx * haciaFijoX + dy * haciaFijoY) > 0.4 * d * haciaFijoD)) : d > alcanceGolpe + radioOtro + 0.3);
      if (!ignorado && estadoOtro !== VOLANDO) {
        if (d < enemigoD) { enemigoD = d; enemigo = j; }
        const atacantes = atacantesPrevio[j];
        const puntuacion = d + 0.6 * atacantes + (atacantes >= ATACANTES_MAXIMOS ? 3 : 0);
        if (puntuacion < objetivoPuntuacion) { objetivoPuntuacion = puntuacion; objetivoLibre = j; }
      }
      if (d < minimo && d > 1e-4 && estadoOtro !== VOLANDO) {
        const masaOtro = masaUnidad[unidadOtro];
        const solape = (minimo - d) * (masaOtro / (miMasa + masaOtro));
        empujeX[i] -= dx / d * solape; empujeY[i] -= dy / d * solape;
      }
    }
    this.enfriamiento[i] -= dt;
    this.objetivo[i] = enemigo;
    if (u.huyendo && !u.retirada) {
      // huir: ir a la casilla (la formación se aleja) sin pelear; al llegar al borde del campo, el soldado desaparece
      if (x < 1.5 || y < 1.5 || x > CAMPO.ancho - 1.5 || y > CAMPO.alto - 1.5) { this.estado[i] = ESTADO.AUSENTE; return; }
      const dx = this.casillaX[i] - x, dy = this.casillaY[i] - y, d = Math.hypot(dx, dy) || 1;
      const pasoMax = Math.min(d, datos.velocidad * 1.15 * dt);
      this.posX[i] = x + dx / d * pasoMax; this.posY[i] = y + dy / d * pasoMax; this.rumbo[i] = Math.atan2(dy, dx);
      this.estado[i] = ESTADO.AVANZANDO;
      return;
    }
    // carga de caballería
    if (datos.montado && (terrenoAqui === TERRENO.BOSQUE || terrenoAqui === TERRENO.AGUA || terrenoAqui === TERRENO.VADO)) u.energiaCarga = 0;   // ni en el bosque ni en el agua hay carga posible
    // hace falta carrerilla (CARRERILLA_CARGA m al galope seguidos): repetir la orden de ataque en pleno cuerpo a cuerpo no atropella
    if (datos.montado && (u.orden === 'cargar' || u.orden === 'atacar') && u.energiaCarga > 0 && enemigo >= 0 && this.velocidadActual[i] > datos.umbralCarga && this.galope[i] >= CARRERILLA_CARGA) {
      const uEnemigo = this.unidades[this.unidadDe[enemigo]], otrosDatos = uEnemigo.stats;
      // el atropello se resuelve en cuanto el enemigo entra en alcance (antes se exigía casi contacto, y como el alcance de
      // golpe es mayor, el jinete se paraba a pelear y nunca llegaba a atropellar a tropas espaciadas como los arqueros)
      // las máquinas de guerra (artillería) no se arrollan: hay que destrozarlas a golpes
      if (enemigoD < Math.max(miRadio + otrosDatos.radio + 0.45, datos.alcance + otrosDatos.radio) && !otrosDatos.montado && !otrosDatos.artilleria) {
        // lanceros: la carga se estrella siempre (parados, en marcha, peleando o huyendo) salvo si llega por la espalda del
        // lancero, es decir, desde detrás de hacia donde mira la unidad (2026-10-16, pedido del usuario; antes solo con la unidad
        // quieta). Cuenta el rumbo de la unidad y no el del soldado, que se gira hacia el jinete en cuanto lo tiene encima; si la
        // unidad huye, el del soldado, que corre dando la espalda
        const rumboLancero = uEnemigo.huyendo ? this.rumbo[enemigo] : uEnemigo.rumbo;
        let desdeJinete = Math.atan2(y - this.posY[enemigo], x - this.posX[enemigo]) - rumboLancero;
        while (desdeJinete > Math.PI) desdeJinete -= 2 * Math.PI; while (desdeJinete < -Math.PI) desdeJinete += 2 * Math.PI;
        const porLaEspalda = Math.abs(desdeJinete) > ANGULO_ESPALDA;
        if (otrosDatos.antiCaballeria && !porLaEspalda) {
          this.vida[i] -= 45; u.energiaCarga = 0; this.sangre.push({ x, y, tamano: 1.2, tipo: 'golpe', rumbo: this.rumbo[i] + Math.PI, montado: true });
          if (this.vida[i] <= 0) this.matar(i, 1.4);
        } else {
          const cos = Math.cos(this.rumbo[i]), sen = Math.sin(this.rumbo[i]);
          this.estado[enemigo] = ESTADO.VOLANDO;
          this.vueloVX[enemigo] = cos * this.azar.entre(5, 8); this.vueloVY[enemigo] = sen * this.azar.entre(5, 8) + this.azar.entre(-1.5, 1.5);
          this.vueloVZ[enemigo] = this.azar.entre(3.5, 5.5); this.vueloZ[enemigo] = 0.1; this.vueloGiro[enemigo] = 0;
          this.causante[enemigo] = u.id;
          // la formación de la víctima reduce o aumenta el daño del atropello (muro, orden abierta, cuadro)
          const FV = uEnemigo.formacion || {};
          // pendiente (fase 2): cargar cuesta abajo pega más y gasta menos impulso por atropello; cuesta arriba, al revés; cuenta
          // la subida de los últimos metros de carrera hasta el arrollado
          const factorCuesta = this.factorCarga(this.pendienteDeCarga(this.posX[enemigo], this.posY[enemigo], cos, sen));
          this.vida[enemigo] -= datos.danoCarga * ((u.formacion && u.formacion.cargaDano) || 1) * this.clima.carga * (FV.defensaCarga || 1) * (FV.defensaCaballeria || 1) * factorCuesta;
          uEnemigo.cohesion = Math.max(0, uEnemigo.cohesion - 6 * (FV.defensaCarga || 1));   // el atropello deshace la formación
          this.sangre.push({ x: this.posX[enemigo], y: this.posY[enemigo], tamano: 0.8, tipo: 'atropello', rumbo: this.rumbo[i] });
          uEnemigo.choqueCarga = Math.min(40, uEnemigo.choqueCarga + 2.5);    // factor «carga recibida»
          // el muro de escudos frena la carga: más impulso gastado por atropello y golpe al jinete que se estrella.
          // Desde el 2026-10-13 (la caballería pesada arrasaba sin bajas): arrollar a un soldado pesado gasta más impulso
          // (según su masa) y el arrollado devuelve un golpe al jinete (según su daño)
          u.energiaCarga -= (FV.frenoCarga || 1) * Math.max(1, otrosDatos.masa || 1) / factorCuesta;
          this.vida[i] -= (otrosDatos.dano || 0) * CONTRAGOLPE_ATROPELLO + (FV.reboteCarga || 0);
          if (this.vida[i] <= 0) this.matar(i, 1.2);
        }
        return;
      }
    }
    let destinoX, destinoY, velocidad = datos.velocidad, persiguiendo = false, vecinosConsultados = cuantos;
    if (enemigo >= 0 && enemigoD <= datos.alcance + this.unidades[this.unidadDe[enemigo]].stats.radio) {
      this.estado[i] = ESTADO.LUCHANDO;
      if (this.atacantes[enemigo] < 255) this.atacantes[enemigo]++;
      this.rumbo[i] = Math.atan2(this.posY[enemigo] - y, this.posX[enemigo] - x);
      if (this.enfriamiento[i] <= 0) {
        this.enfriamiento[i] = datos.intervalo * this.azar.entre(0.85, 1.15);
        let dano = datos.dano * vigor * (0.65 + 0.35 * u.cohesion / 100);                 // con la formación deshecha se pega peor
        const uEnemigo = this.unidades[this.unidadDe[enemigo]];
        dano *= 1 + 0.3 * (1 - uEnemigo.cohesion / 100);                                  // y se aguanta peor
        if (datos.antiCaballeria && uEnemigo.stats.montado) dano *= 2.2;
        // caballería atascada: un jinete parado en la melé contra infantería que aguanta pierde su ventaja (2026-10-13)
        if (datos.montado && !uEnemigo.stats.montado && !uEnemigo.huyendo && this.velocidadActual[i] < 1.5) dano *= CABALLERIA_ATASCADA;
        const formacionVictima = uEnemigo.formacion || {};
        dano *= (formacionVictima.defensaMelee || 1) * (datos.montado ? (formacionVictima.defensaCaballeria || 1) : 1);   // orden abierta, cuadro
        if (uEnemigo.huyendo && !uEnemigo.retirada) dano *= 1.5;         // por la espalda (la retirada ordenada se defiende)
        else {
          // flanqueo: el golpe llega por el costado o por detrás respecto a donde mira la víctima
          const desdeAtacante = Math.atan2(y - this.posY[enemigo], x - this.posX[enemigo]);
          let dif = desdeAtacante - this.rumbo[enemigo]; while (dif > Math.PI) dif -= 2 * Math.PI; while (dif < -Math.PI) dif += 2 * Math.PI;
          dif = Math.abs(dif);
          if (dif > 2.35) { dano *= 1.5; uEnemigo.cohesion = Math.max(0, uEnemigo.cohesion - 0.3); } else if (dif > 1.05) { dano *= 1.2; uEnemigo.cohesion = Math.max(0, uEnemigo.cohesion - 0.15); }
          // para la moral cuenta dónde está el atacante respecto a la FORMACIÓN de la víctima (en la melé los soldados se giran,
          // y un golpe de lado dentro del frente no es un flanqueo): detrás de la última fila = espalda, fuera del ancho = flanco
          const limites = uEnemigo.limitesFormacion;
          if (limites) {
            const relX = x - uEnemigo.origenX, relY = y - uEnemigo.origenY, cosU = Math.cos(uEnemigo.rumbo), senU = Math.sin(uEnemigo.rumbo);
            const fondoAtacante = relX * cosU + relY * senU, lateralAtacante = -relX * senU + relY * cosU;
            if (fondoAtacante < limites.fondoMin - 1) uEnemigo.golpesEspalda++;
            else if (lateralAtacante < limites.lateralMin - 1 || lateralAtacante > limites.lateralMax + 1) uEnemigo.golpesFlanco++;
          }
        }
        // desde más arriba se golpea con ventaja y desde abajo con desventaja, según la pendiente hacia el golpeado (fase 2;
        // antes, ×1,15 / ×0,9 fijos entre una celda de colina y una que no lo era)
        dano *= this.factorAlturaMele((this.alturaEn(x, y) - this.alturaEn(this.posX[enemigo], this.posY[enemigo])) / Math.max(0.5, enemigoD));
        if (terrenoAqui === TERRENO.AGUA) dano *= 0.75;                         // con el agua por la cintura se pelea mal
        this.causante[enemigo] = u.id;
        this.vida[enemigo] -= dano;
        if (this.vida[enemigo] <= 0) this.matar(enemigo, 0.7);
        else if (this.azar.numero() < 0.25) this.sangre.push({ x: this.posX[enemigo], y: this.posY[enemigo], tamano: 0.35, tipo: 'golpe', rumbo: this.rumbo[i] });
      }
      return;
    }
    // velocidad en la melé: un jinete sin impulso de carga no galopa entre los que luchan, se mueve al paso
    const enCarga = datos.montado && u.energiaCarga > 0 && this.galope[i] >= CARRERILLA_CARGA;
    const velocidadMele = enCarga && datos.velocidadCarga ? datos.velocidadCarga : datos.montado && !enCarga && !(u.objetivoUnidad >= 0 && this.unidades[u.objetivoUnidad].huyendo) ? Math.min(datos.velocidad, 2.5) : datos.velocidad;
    const ofensiva = u.orden === 'avanzar' || u.orden === 'cargar' || u.orden === 'atacar';
    const impetuoso = (i % IMPETUOSOS_CADA) === 3;
    const buscandoContacto = (u.sinContacto || 0) > SIN_CONTACTO_MAXIMO;
    const objetivoHuye = datos.montado && u.objetivoUnidad >= 0 && this.unidades[u.objetivoUnidad].huyendo;   // persecución: los jinetes van libres
    const filasRotas = u.cohesion < COHESION_ROTA;                                           // sin cohesión, cada cual pelea por su cuenta
    const margen = enCarga || u.orden === 'cargar' || objetivoHuye ? Infinity : impetuoso || buscandoContacto || filasRotas ? MARGEN_IMPETUOSO : (datos.montado ? MARGEN_FORMACION.montado : MARGEN_FORMACION.aPie);
    let perseguido = -1;
    if (enemigo >= 0) {
      // ¿puede salir de su puesto a por este enemigo? solo si está al alcance de su casilla (línea contra línea)
      const alcanceDelPuesto = margen + datos.alcance + 0.4, casX = this.casillaX[i], casY = this.casillaY[i];
      if (ofensiva) perseguido = objetivoLibre >= 0 && distancia(casX, casY, this.posX[objetivoLibre], this.posY[objetivoLibre]) <= alcanceDelPuesto ? objetivoLibre : distancia(casX, casY, this.posX[enemigo], this.posY[enemigo]) <= alcanceDelPuesto ? enemigo : -1;
      else if (enemigoD < (u.trabada ? 3.5 : 1.8)) perseguido = enemigo;
    }
    if (perseguido >= 0) {
      destinoX = this.posX[perseguido]; destinoY = this.posY[perseguido];
      this.estado[i] = ESTADO.AVANZANDO; persiguiendo = true;
      velocidad = velocidadMele;
    } else {
      destinoX = this.casillaX[i]; destinoY = this.casillaY[i];
      let d = distancia(x, y, destinoX, destinoY);
      if (d < 0.25) {
        // en su casilla sin enemigo cerca: si la unidad ataca y ya está trabada, el soldado ocioso busca al enemigo más
        // cercano en un radio amplio (cada uno el suyo, no todos al mismo centro) y va hacia él al paso
        let lejano = -1;
        if (ofensiva && u.luchando > 0 && impetuoso) {
          vecinosConsultados = this.rejilla.vecinos(x, y, MARGEN_IMPETUOSO, this.bufferVecinos);
          let lejanoD = Infinity;
          for (let k = 0; k < vecinosConsultados; k++) { const j = this.bufferVecinos[k]; if (this.equipo[j] === this.equipo[i] || this.estado[j] === ESTADO.VOLANDO) continue; const dj = distancia(x, y, this.posX[j], this.posY[j]) + 0.6 * this.atacantesPrevio[j] + (this.atacantesPrevio[j] >= ATACANTES_MAXIMOS ? 3 : 0); if (dj < lejanoD) { lejanoD = dj; lejano = j; } }
        }
        if (lejano >= 0) { destinoX = this.posX[lejano]; destinoY = this.posY[lejano]; persiguiendo = true; this.estado[i] = ESTADO.AVANZANDO; velocidad = Math.min(velocidadMele, datos.velocidad * 0.8); }
        else { this.estado[i] = ESTADO.FORMADO; if (u.orden === 'formar' || u.orden === 'disparar') this.rumbo[i] = u.rumbo; return; }
      } else {
        this.estado[i] = ESTADO.AVANZANDO;
        // en carga (o escaramuceando) siguen a la formación al galope tendido
        const velocidadBase = u.esquiva ? datos.velocidad * VELOCIDAD_ESQUIVA : datos.montado && u.energiaCarga > 0 && datos.velocidadCarga ? datos.velocidadCarga : datos.velocidad;
        // a la carrera siguen a la formación. Desde el 2026-10-13 la persecución del puesto es d×4 (antes d×2): con d×2, en marcha
        // cada soldado iba siempre media velocidad de la formación por detrás de su puesto (1,4 m la infantería ligera a la
        // carrera, 1,6 m las tropas rápidas), por encima del umbral de «fuera de puesto» de la cohesión: la formación se
        // «rompía» sola antes del choque
        velocidad = Math.min(velocidadBase * (u.marcha === 'correr' && !datos.montado ? 1.5 : 1.15), Math.max(velocidadBase, d * 4));
      }
    }
    if (persiguiendo) {
      // si un aliado que ya está luchando queda justo delante, en vez de empujarlo se rodea por el lado libre
      // (evita el apiñamiento y que los jinetes "anden unos contra otros")
      const haciaX = destinoX - x, haciaY = destinoY - y, haciaD = Math.hypot(haciaX, haciaY) || 1;
      const lateralX = -haciaY / haciaD, lateralY = haciaX / haciaD;
      for (let k = 0; k < vecinosConsultados; k++) {
        const j = this.bufferVecinos[k]; if (j === i || this.equipo[j] !== this.equipo[i] || this.estado[j] !== ESTADO.LUCHANDO) continue;
        const dx = this.posX[j] - x, dy = this.posY[j] - y, d = Math.hypot(dx, dy) || 1;
        if (d < (miRadio + this.unidades[this.unidadDe[j]].stats.radio) * 1.3 && (dx * haciaX + dy * haciaY) / (d * haciaD) > 0.5) {
          const objetivoCubierto = this.objetivo[j] >= 0 && this.atacantesPrevio[this.objetivo[j]] >= ATACANTES_MAXIMOS && (objetivoLibre < 0 || this.atacantesPrevio[objetivoLibre] >= ATACANTES_MAXIMOS);
          // una carga en curso (jinetes con impulso) no se para ni frena detrás de los suyos: los rodea al galope (si no, la cuña,
          // que llega escalonada, se quedaba atascada tras su punta y no atropellaba)
          const enCargaAqui = datos.montado && u.energiaCarga > 0;
          if (objetivoCubierto && !enCargaAqui) { this.estado[i] = ESTADO.FORMADO; this.rumbo[i] = Math.atan2(haciaY, haciaX); return; }   // no hay hueco: esperar detrás
          const ladoAliado = Math.sign(dx * lateralX + dy * lateralY) || 1;
          destinoX = x - ladoAliado * lateralX * 1.5 + (enCargaAqui ? haciaX / haciaD * 2 : 0); destinoY = y - ladoAliado * lateralY * 1.5 + (enCargaAqui ? haciaY / haciaD * 2 : 0);
          if (!enCargaAqui) velocidad = Math.min(velocidad, datos.montado ? 1.5 : datos.velocidad * 0.6);
          break;
        }
      }
    }
    velocidad *= ((u.formacion && u.formacion.velocidad) || 1) * vigor * (this.terreno ? FRENO_TERRENO[terrenoAqui] : 1) * (datos.montado ? this.clima.velocidadMontado : this.clima.velocidad);
    const dx = destinoX - x, dy = destinoY - y, d = Math.hypot(dx, dy) || 1;
    if (d > 0.01 && velocidad > 0) velocidad *= this.factorPendiente(this.pendienteEn(x, y, dx / d, dy / d));   // cuesta arriba, más despacio (fase 2)
    const pasoMax = Math.min(d, velocidad * dt);
    this.posX[i] = x + dx / d * pasoMax; this.posY[i] = y + dy / d * pasoMax;
    // con la unidad en alto, el que solo se recoloca en su puesto (a menos de AJUSTE_PUESTO m) se mueve de lado mirando al frente
    // (2026-10-16: en el muro de escudos, apretado, y en los mangoneles, grandes, algunos tardaban en asentarse y se quedaban
    // mirando hacia donde se ajustaban, no a donde se había pedido)
    if (!persiguiendo && d < AJUSTE_PUESTO && (u.orden === 'formar' || u.orden === 'disparar') && !u.enMarcha) this.rumbo[i] = u.rumbo;
    else this.rumbo[i] = Math.atan2(dy, dx);
  }

  // Al caer un soldado, los de su columna que están detrás avanzan un puesto: el de atrás ocupa el hueco del caído, y así
  // sucesivamente (la línea se cierra desde la retaguardia, como en una formación real)
  cubrirHueco(i) {
    const u = this.unidades[this.unidadDe[i]];
    const lx = this.localX[i], ly = this.localY[i];
    const columna = [];
    for (const j of u.indices) if (j !== i && this.vivo(j) && Math.abs(this.localY[j] - ly) < 0.3 && this.localX[j] < lx) columna.push(j);
    if (!columna.length) return;
    columna.sort((a, b) => this.localX[b] - this.localX[a]);           // el más cercano por detrás primero
    let huecoX = lx, huecoY = ly;
    for (const j of columna) { const sx = this.localX[j], sy = this.localY[j]; this.localX[j] = huecoX; this.localY[j] = huecoY; huecoX = sx; huecoY = sy; }
  }
  matar(i, tamanoSangre) {
    if (this.estado[i] === ESTADO.CADAVER) return;
    this.estado[i] = ESTADO.CADAVER; this.vida[i] = 0; this.tiempoMuerte[i] = this.tiempo;
    this.cubrirHueco(i);
    if (this.causante[i] >= 0 && this.unidades[this.causante[i]]) this.unidades[this.causante[i]].bajasCausadas++;
    this.sangre.push({ x: this.posX[i], y: this.posY[i], tamano: tamanoSangre, tipo: 'muerte', rumbo: this.rumbo[i] + Math.PI, equipo: this.equipo[i], tipoSoldado: this.tipo[i], montado: !!TIPOS[this.tipo[i]].montado });
  }

  /* ----- flechas ----- */
  /* Área que ocupa una unidad para las andanadas: rectángulo de sus soldados vivos en coordenadas de la formación (fondo a lo
     largo del rumbo, lateral a su izquierda/derecha), respecto a su centro. Se calcula una vez por paso y unidad. */
  areaDeTiro(u) {
    if (u.areaTiro && u.areaTiro.paso === this.paso) return u.areaTiro;
    const cos = Math.cos(u.rumbo), sen = Math.sin(u.rumbo);
    let lateralMin = Infinity, lateralMax = -Infinity, fondoMin = Infinity, fondoMax = -Infinity;
    for (const j of u.indices) {
      if (!this.vivo(j)) continue;
      const rx = this.posX[j] - u.centroX, ry = this.posY[j] - u.centroY, fondo = rx * cos + ry * sen, lateral = -rx * sen + ry * cos;
      if (lateral < lateralMin) lateralMin = lateral; if (lateral > lateralMax) lateralMax = lateral;
      if (fondo < fondoMin) fondoMin = fondo; if (fondo > fondoMax) fondoMax = fondo;
    }
    u.areaTiro = lateralMin === Infinity ? null : { paso: this.paso, cos, sen, lateralMin, lateralMax, fondoMin, fondoMax };
    return u.areaTiro;
  }
  dispararFlecha(i, objetivo, datos) {
    const k = this.flechaSiguiente; this.flechaSiguiente = (k + 1) % this.maxFlechas;
    const x0 = this.posX[i], y0 = this.posY[i];
    // Dos maneras de tirar (2026-10-12):
    // · andanada (arcos): en parábola sobre la ZONA de la unidad, alrededor de su centro y con mucha dispersión;
    // · tiro apuntado (`apuntado`, ballestas): cada tirador elige un soldado concreto (al azar entre los vivos) y la dispersión
    //   es alrededor de él, así que la precisión cuenta de verdad (apuntando al centro, con más precisión los virotes se perdían
    //   en el hueco que dejaban los primeros muertos).
    // · desde el 2026-10-16 (lo vio el usuario: con el centro de la formación muerto, las flechas seguían cayendo en el hueco y
    //   de cerca no tocaban las alas) la andanada apunta a un punto al azar dentro del ÁREA que ocupa la formación (rectángulo de
    //   sus soldados vivos según su rumbo), con la dispersión de lluvia de flechas alrededor: fuego de supresión sobre toda la
    //   unidad, no tiro a un soldado. Calibrado (calibrar_andanada.js) para acertar contra una unidad completa lo mismo que antes.
    //   Las máquinas (mangoneles) siguen apuntando al centro.
    let blancoX = objetivo.centroX, blancoY = objetivo.centroY, margen = 1.5, ruido = 2;
    if (!datos.apuntado && !datos.artilleria) {
      const area = this.areaDeTiro(objetivo);
      if (area) {
        const lateral = this.azar.entre(area.lateralMin, area.lateralMax), fondo = this.azar.entre(area.fondoMin, area.fondoMax);
        blancoX = objetivo.centroX + fondo * area.cos - lateral * area.sen; blancoY = objetivo.centroY + fondo * area.sen + lateral * area.cos;
        margen = MARGEN_ANDANADA; ruido = 0;
      }
    }
    if (datos.apuntado) {
      margen = 0.8; ruido = 0;
      for (let intento = 0; intento < 4; intento++) {
        const j = objetivo.indices[this.azar.entero(0, objetivo.indices.length - 1)];
        if (this.vivo(j) && this.estado[j] !== ESTADO.VOLANDO) { blancoX = this.posX[j]; blancoY = this.posY[j]; break; }
      }
    }
    // apuntar por delante (2026-10-13): se estima dónde estará el blanco cuando llegue la flecha (dos iteraciones del tiempo
    // de vuelo) y se apunta allí, anticipando un ANTICIPACION_TIRO del movimiento (nadie lo calcula al milímetro)
    const velBlancoX = objetivo.velX || 0, velBlancoY = objetivo.velY || 0;
    if (velBlancoX || velBlancoY) {
      let tiempoVuelo = distancia(x0, y0, blancoX, blancoY) / datos.velocidadFlecha;
      for (let iteracion = 0; iteracion < 2; iteracion++) tiempoVuelo = distancia(x0, y0, blancoX + velBlancoX * tiempoVuelo * ANTICIPACION_TIRO, blancoY + velBlancoY * tiempoVuelo * ANTICIPACION_TIRO) / datos.velocidadFlecha;
      blancoX += velBlancoX * tiempoVuelo * ANTICIPACION_TIRO; blancoY += velBlancoY * tiempoVuelo * ANTICIPACION_TIRO;
    }
    const d = distancia(x0, y0, blancoX, blancoY);
    const dispersion = d * datos.dispersion * (ruido === 0 && !datos.apuntado ? FACTOR_DISPERSION_ANDANADA : 1) + margen;
    const angulo = this.azar.entre(0, Math.PI * 2), r = Math.sqrt(this.azar.numero()) * dispersion;
    let x1 = limitar(blancoX + Math.cos(angulo) * r + (ruido ? this.azar.entre(-ruido, ruido) : 0), 0.5, CAMPO.ancho - 0.5);
    let y1 = limitar(blancoY + Math.sin(angulo) * r + (ruido ? this.azar.entre(-ruido, ruido) : 0), 0.5, CAMPO.alto - 0.5);
    let duracion = distancia(x0, y0, x1, y1) / datos.velocidadFlecha;
    // la parábola choca con una ladera (o, en el futuro, con una muralla) antes de llegar: la flecha cae ahí (fase 2)
    if (this.terreno && this.terreno.trayectoriaLibre) {
      const corte = this.terreno.trayectoriaLibre(x0, y0, this.alturaEn(x0, y0) + ALTURA_SALIDA_FLECHA, x1, y1, this.alturaEn(x1, y1), GRAVEDAD * duracion * duracion / 8);
      if (corte < 1) { x1 = x0 + (x1 - x0) * corte; y1 = y0 + (y1 - y0) * corte; duracion = distancia(x0, y0, x1, y1) / datos.velocidadFlecha; }
    }
    this.flechaEstado[k] = 1; this.flechaX0[k] = x0; this.flechaY0[k] = y0; this.flechaX1[k] = x1; this.flechaY1[k] = y1;
    this.flechaInicio[k] = this.tiempo; this.flechaDuracion[k] = duracion; this.flechaApice[k] = GRAVEDAD * duracion * duracion / 8;
    this.flechaEquipo[k] = this.equipo[i]; this.flechaSoldado[k] = -1; this.flechaDano[k] = datos.danoFlecha * (datos.artilleria ? 1 : this.clima.danoFlecha); this.flechaPerforante[k] = datos.perforante ? 1 : 0; this.flechaUnidad[k] = this.unidadDe[i];
    this.flechaArea[k] = datos.radioImpacto || 0;
  }
  actualizarFlechas() {
    for (let k = 0; k < this.maxFlechas; k++) {
      if (this.flechaEstado[k] !== 1) continue;
      if (this.tiempo - this.flechaInicio[k] < this.flechaDuracion[k]) continue;
      const x = this.flechaX1[k], y = this.flechaY1[k];
      if (this.flechaArea[k] > 0) { this.impactoPiedra(k, x, y); continue; }
      const cuantos = this.rejilla.vecinos(x, y, 0.6, this.bufferVecinos);
      let alcanzado = -1, mejorD = 0.6;
      for (let q = 0; q < cuantos; q++) { const j = this.bufferVecinos[q]; if (this.estado[j] === ESTADO.VOLANDO) continue; const d = distancia(x, y, this.posX[j], this.posY[j]); if (d < mejorD) { mejorD = d; alcanzado = j; } }
      if (alcanzado >= 0) {
        this.flechaEstado[k] = 3; this.flechaSoldado[k] = alcanzado;
        this.flechaOffX[k] = x - this.posX[alcanzado]; this.flechaOffY[k] = y - this.posY[alcanzado];
        const uAlcanzado = this.unidades[this.unidadDe[alcanzado]];
        // la armadura pesada para flechas pero no virotes (perforante); el bosque protege de ambos
        const enBosque = this.terreno && this.terreno.tipoEn(this.posX[alcanzado], this.posY[alcanzado]) === 1;
        const dano = this.flechaDano[k] * (uAlcanzado.stats.montado ? 0.7 : 1) * (this.flechaPerforante[k] ? 1 : 1 - (uAlcanzado.stats.proteccionFlechas || 0)) * ((uAlcanzado.formacion && uAlcanzado.formacion.defensaFlecha) || 1) * (enBosque ? 0.6 : 1);
        this.causante[alcanzado] = this.flechaUnidad[k];
        uAlcanzado.impactosFlecha++;                                       // factor «bajo las flechas»
        this.vida[alcanzado] -= dano;
        if (this.vida[alcanzado] <= 0) this.matar(alcanzado, 0.6); else this.sangre.push({ x: this.posX[alcanzado], y: this.posY[alcanzado], tamano: 0.3, tipo: 'flecha', rumbo: this.rumbo[alcanzado] + Math.PI });
      } else this.flechaEstado[k] = 2;
    }
  }
  /* Piedra de mangonel (2026-10-13): daño a todos los que estén en el radio del impacto, amigos o enemigos, menor cuanto más
     lejos del centro; la orden abierta lo reduce a la mitad (hay huecos) y el bosque también. Cada alcanzado desordena a su
     unidad y asusta el doble que una flecha. La piedra queda en el suelo (estado 2). */
  impactoPiedra(k, x, y) {
    const radio = this.flechaArea[k];
    const cuantos = this.rejilla.vecinos(x, y, radio, this.bufferVecinos);
    for (let q = 0; q < cuantos; q++) {
      const j = this.bufferVecinos[q];
      if (this.estado[j] === ESTADO.VOLANDO || !this.vivo(j)) continue;
      const d = distancia(x, y, this.posX[j], this.posY[j]); if (d > radio) continue;
      const uAlcanzado = this.unidades[this.unidadDe[j]], F = uAlcanzado.formacion || {};
      const enBosque = this.terreno && this.terreno.tipoEn(this.posX[j], this.posY[j]) === 1;
      const dano = this.flechaDano[k] * (1 - 0.6 * d / radio) * (F.clave === 'abierta' ? 0.5 : 1) * (enBosque ? 0.6 : 1) * (uAlcanzado.stats.artilleria ? 0.5 : 1);
      this.causante[j] = this.flechaUnidad[k];
      uAlcanzado.impactosFlecha += 2;
      uAlcanzado.cohesion = Math.max(0, uAlcanzado.cohesion - 4);
      this.vida[j] -= dano;
      if (this.vida[j] <= 0) this.matar(j, 1.0); else this.sangre.push({ x: this.posX[j], y: this.posY[j], tamano: 0.4, tipo: 'golpe', rumbo: Math.atan2(this.posY[j] - y, this.posX[j] - x) });
    }
    this.sangre.push({ x, y, tamano: 1.1, tipo: 'impacto', rumbo: 0 });
    this.flechaEstado[k] = 2;
  }
  flechaPosicion(k, tiempoRender, salida) {
    const u = limitar((tiempoRender - this.flechaInicio[k]) / this.flechaDuracion[k], 0, 1);
    salida[0] = this.flechaX0[k] + (this.flechaX1[k] - this.flechaX0[k]) * u;
    salida[1] = this.flechaY0[k] + (this.flechaY1[k] - this.flechaY0[k]) * u;
    salida[2] = 4 * this.flechaApice[k] * u * (1 - u) + 1.5 * (1 - u);
    salida[3] = u;
    return salida;
  }
}
