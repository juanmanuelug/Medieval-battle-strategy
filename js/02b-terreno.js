'use strict';
/* ---------- Terreno: bosques, colinas y ríos que afectan al combate ----------
   Mapa de celdas de 2 m generado desde una semilla: manchas redondeadas de bosque (frena, protege de flechas, impide cargar)
   y de colina (los arqueros alcanzan más y se golpea con ventaja cuesta abajo). Se evita la zona de despliegue de ambos
   ejércitos. `tipoEn(x, y)` → TERRENO.*. Las manchas también sirven al render y al minimapa.

   Tipos de mapa (2026-10-13, tras la prueba con amigos: «distintos mapas, con colinas, valles, peleas en el bosque»):
   mixto (el de siempre), abierto, bosque, colinas, valle (dos cordilleras a lo largo de los bordes y el llano en medio) y río
   (un cauce sinuoso de lado a lado entre los dos ejércitos, con dos o tres vados). El agua frena muchísimo, impide cargar y se
   pelea mal dentro; los vados frenan menos. `mapaDesdeSemilla(semilla)` elige uno al azar (igual en el servidor y en los
   navegadores). */
const TERRENO = { LLANO: 0, BOSQUE: 1, COLINA: 2, AGUA: 3, VADO: 4, PROFUNDA: 5, RISCO: 6, CAMINO: 7, PUENTE: 8, QUEMADO: 9 };
const NOMBRE_TERRENO = ['llano', 'bosque', 'colina', 'río', 'vado', 'agua profunda', 'risco', 'camino', 'puente', 'bosque quemado'];
// freno a la marcha según el terreno (llano, bosque, colina, agua, vado; agua profunda y risco no se pisan; por el camino se va
// un 15 % más deprisa; el puente, como el llano)
const FRENO_TERRENO = [1, 0.7, 1, 0.35, 0.65, 0.2, 0.2, 1.15, 1, 0.95];   // el bosque quemado (2026-10-21) casi no frena
// fase A de los pasos (2026-10-18): qué tipos no se pisan, ancho mínimo de un paso, rejilla y holguras de las rutas
const BLOQUEA_PASO = [0, 0, 0, 0, 0, 1, 1, 0, 0, 0];
/* Fase 3 del terreno (2026-10-20): puentes y caminos. Puentes de ANCHO_PUENTE m sobre el río (en el profundo, uno de los dos
   vados es un puente), con el tablero ALTURA_PUENTE m sobre la orilla: son más estrechos que PASO_MINIMO a propósito (un cuello
   de botella), así que la zona jugable los incluye aparte (calcularPaso). Caminos de ANCHO_CAMINO m de borde a borde del campo,
   por los puentes, los vados y los pasos de la cordillera; en el bosque cerrado, senderos de ANCHO_SENDERO m. El camino gana al
   llano, al bosque (un claro) y a la colina (sigue su altura); el agua, la roca y el puente se quedan. */
const ANCHO_PUENTE = [10, 14], ALTURA_PUENTE = 0.35, ANCHO_CAMINO = 6, ANCHO_SENDERO = 3;
const INTENTOS_RISCOS = 12;    // variantes de los riscos que se prueban hasta que el mapa es válido (si ninguna, sin riscos)
const ESTRUCTURA = { PISABLE: 1, PARED: 2 };          // para los asedios (tipoEstructura): adarve que se pisa o pared que no
const PASO_MINIMO = 35, PASO_RUTA = 4, HOLGURA_RUTA_MINIMA = 4, HOLGURA_RECTA = 3;   // holguras en m (una celda son 2 m: con 2 m de holgura una recta podía cortar la esquina de una celda)
const VECINOS_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const VECINOS_8 = [[1, 0, 3], [-1, 0, 3], [0, 1, 3], [0, -1, 3], [1, 1, 4], [-1, 1, 4], [1, -1, 4], [-1, -1, 4]];
const TIPOS_MAPA = {
  // (fase B de los pasos, 2026-10-19) todos los mapas llevan riscos: peñascos y escarpes en la franja central, nunca en los despliegues
  mixto: { nombre: 'Campo variado', descripcion: 'Bosques, colinas y algún peñasco repartidos por el campo.', bosques: [6, 11], colinas: [4, 8], riscos: { penascos: [1, 2], escarpes: [0, 1] }, caminos: [1, 2], peso: 30 },
  abierto: { nombre: 'Campo abierto', descripcion: 'Llanura casi despejada: manda la caballería.', bosques: [1, 3], colinas: [1, 2], riscos: { penascos: [0, 1] }, caminos: [1, 2], peso: 15 },
  bosque: { nombre: 'Bosque cerrado', descripcion: 'Mucho bosque, también en el centro: se pelea entre los árboles, sin cargas y con poca puntería.', bosques: [16, 22], colinas: [1, 3], radioBosque: [14, 30], bosqueEnElCentro: true, riscos: { penascos: [1, 2] }, senderos: [1, 1], peso: 15 },
  colinas: { nombre: 'Tierra de colinas', descripcion: 'Muchas colinas grandes y escarpes de roca: quien gane las alturas tiene ventaja.', bosques: [3, 5], colinas: [10, 14], radioColina: [22, 40], riscos: { penascos: [1, 2], escarpes: [1, 2] }, caminos: [1, 2], peso: 15 },
  valle: { nombre: 'Valle', descripcion: 'Dos cordilleras a lo largo de los bordes y un valle llano en medio.', bosques: [3, 6], colinas: [0, 0], cordilleras: true, riscos: { penascos: [1, 2] }, caminos: [1, 2], peso: 13 },
  rio: { nombre: 'Río con vados', descripcion: 'Un río cruza el campo entre los dos ejércitos: el agua frena muchísimo y no deja cargar; los vados son el paso.', bosques: [4, 7], colinas: [2, 4], rio: true, puentes: 1, riscos: { penascos: [0, 1] }, caminos: [1, 2], peso: 12 },
  // fase A de los pasos (2026-10-18): el agua es profunda y no se cruza; solo los dos vados, anchos (40-48 m); desde la fase 3
  // del terreno (2026-10-20) uno de los dos es un puente estrecho
  rioProfundo: { nombre: 'Río profundo', descripcion: 'Un río profundo que no se puede cruzar a nado: solo hay dos vados. Quien los domine controla la batalla.', bosques: [4, 7], colinas: [2, 4], rio: true, profundo: true, vados: [2, 2], puentes: 1, anchoVado: [40, 48], amplitudRio: [6, 12], riscos: { penascos: [0, 1] }, caminos: [1, 2], peso: 12 },
  // (fase B) una cordillera de roca parte el campo de arriba abajo; solo se cruza por uno o dos pasos de 47-57 m
  pasoMontana: { nombre: 'Paso de montaña', descripcion: 'Una cordillera de roca parte el campo: solo se cruza por uno o dos pasos. Defiéndelos o fuérzalos.', bosques: [4, 7], colinas: [2, 4], riscos: { cordillera: [1, 2] }, caminos: [1, 2], peso: 12 },
};
function mapaDesdeSemilla(semilla) {
  const azar = crearAleatorio(semilla + 23), total = Object.values(TIPOS_MAPA).reduce((s, m) => s + m.peso, 0);
  let r = azar.numero() * total;
  for (const [clave, m] of Object.entries(TIPOS_MAPA)) { r -= m.peso; if (r <= 0) return clave; }
  return 'mixto';
}
// altura de una parábola de flecha con ese ápice a la fracción u del vuelo (0 al salir, 1 al llegar), sobre la recta
const alturaParabola = (apice, u) => 4 * apice * u * (1 - u);
// a · suavizado de s (0 → 0, 1 → a, con tangente horizontal en los dos extremos): el perfil de colinas y riscos
const escalaSuave = (a, s) => a * s * s * (3 - 2 * s);
// celdas (de tamaño celda, `cuantas` en total) que cubren de minimo a maximo, más `extra` por cada lado, sin salirse
const celdasEntre = (minimo, maximo, celda, cuantas, extra = 0) => [Math.max(0, Math.floor(minimo / celda) - extra), Math.min(cuantas - 1, Math.ceil(maximo / celda) + extra)];
class Terreno {
  constructor(semilla, opciones) {
    const mapa = TIPOS_MAPA[opciones && opciones.mapa] ? opciones.mapa : 'mixto', T = TIPOS_MAPA[mapa];
    const o = Object.assign({ bosques: T.bosques, colinas: T.colinas, celda: 2 }, opciones || {});
    this.mapa = mapa;
    this.celda = o.celda;
    this.columnas = Math.ceil(CAMPO.ancho / o.celda) + 1; this.filas = Math.ceil(CAMPO.alto / o.celda) + 1;
    this.celdas = new Uint8Array(this.columnas * this.filas);
    this.manchas = [];
    this.rio = null;
    const azar = crearAleatorio(semilla);
    const frente = Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE);
    const despliegue = [[frente, CAMPO.alto / 2], [CAMPO.ancho - frente, CAMPO.alto / 2]];
    const lejosDelDespliegue = (x, y, r) => !despliegue.some(([dx, dy]) => distancia(x, y, dx, dy) < r + 30);
    const nuevaMancha = (tipo, x, y, r) => this.manchas.push({ tipo, x, y, r, lobulos: Array.from({ length: 6 }, () => azar.entre(0.7, 1.25)) });
    const colocar = (tipo, cuantas, radioMin, radioMax, cerca) => {
      for (let m = 0; m < cuantas; m++) {
        let intentos = 0, x, y, r;
        do { [x, y] = cerca ? cerca() : [azar.entre(25, CAMPO.ancho - 25), azar.entre(15, CAMPO.alto - 15)]; r = azar.entre(radioMin, radioMax); intentos++; }
        while (intentos < 30 && !lejosDelDespliegue(x, y, r));
        if (intentos >= 30) continue;
        nuevaMancha(tipo, x, y, r);
      }
    };
    // valle: dos cordilleras de colinas solapadas a lo largo de los bordes de arriba y de abajo
    if (T.cordilleras) for (const yBorde of [30, CAMPO.alto - 30]) for (let x = 20; x < CAMPO.ancho; x += azar.entre(28, 40)) nuevaMancha(TERRENO.COLINA, x, yBorde + azar.entre(-10, 10), azar.entre(30, 42));
    const [colinasMin, colinasMax] = o.colinas, [radioColinaMin, radioColinaMax] = T.radioColina || [16, 32];
    if (colinasMax > 0) colocar(TERRENO.COLINA, azar.entero(colinasMin, colinasMax), radioColinaMin, radioColinaMax);
    const [radioBosqueMin, radioBosqueMax] = T.radioBosque || [12, 24];
    colocar(TERRENO.BOSQUE, azar.entero(o.bosques[0], o.bosques[1]), radioBosqueMin, radioBosqueMax);
    // bosque cerrado: además, unos cuantos bosques en la franja central, entre los dos ejércitos
    if (T.bosqueEnElCentro) colocar(TERRENO.BOSQUE, azar.entero(4, 6), 14, 26, () => [azar.entre(CAMPO.ancho * 0.4, CAMPO.ancho * 0.6), azar.entre(20, CAMPO.alto - 20)]);
    // río: cauce sinuoso de arriba abajo por el centro, de 10 a 14 m de ancho, con dos o tres vados
    if (T.rio) {
      const amplitud = T.amplitudRio ? azar.entre(T.amplitudRio[0], T.amplitudRio[1]) : azar.entre(12, 26), frecuencia = azar.entre(0.012, 0.022), fase = azar.entre(0, Math.PI * 2), anchoRio = azar.entre(10, 14);
      const centroX = y => CAMPO.ancho / 2 + amplitud * Math.sin(y * frecuencia + fase);
      const [vadosMin, vadosMax] = T.vados || [2, 3], cuantosVados = azar.entero(vadosMin, vadosMax), vados = [];
      for (let k = 0; k < cuantosVados; k++) vados.push((k + 0.5) / cuantosVados * CAMPO.alto + azar.entre(-25, 25));
      const anchoVado = T.anchoVado ? azar.entre(T.anchoVado[0], T.anchoVado[1]) : 9;
      // con vados anchos, que no se salgan del campo ni se junten
      if (T.anchoVado) for (let k = 0; k < vados.length; k++) vados[k] = limitar(vados[k], anchoVado / 2 + 12, CAMPO.alto - anchoVado / 2 - 12);
      // puentes (fase 3 del terreno): en el río profundo, el último vado pasa a ser un puente; en el de vados, uno más, lejos de ellos
      const azarPuentes = crearAleatorio(semilla * 13 + 4441), puentes = [];
      for (let k = 0; k < (T.puentes || 0); k++) {
        const ancho = azarPuentes.entre(ANCHO_PUENTE[0], ANCHO_PUENTE[1]);
        if (T.profundo && vados.length > 1) { puentes.push({ y: vados.pop(), ancho }); continue; }
        let y = CAMPO.alto / 2;
        for (let intento = 0; intento < 20; intento++) { y = azarPuentes.entre(40, CAMPO.alto - 40); if (vados.every(v => Math.abs(y - v) > anchoVado / 2 + ancho / 2 + 25)) break; }
        puentes.push({ y, ancho });
      }
      const enVado = y => vados.some(v => Math.abs(y - v) <= anchoVado / 2), enPuente = (y, margen = 0) => puentes.some(p => Math.abs(y - p.y) <= p.ancho / 2 + margen);
      this.rio = { centroX, ancho: anchoRio, vados, anchoVado, puentes, profundo: !!T.profundo, enVado, enPuente, tipoAgua: y => enPuente(y) ? TERRENO.PUENTE : enVado(y) ? TERRENO.VADO : T.profundo ? TERRENO.PROFUNDA : TERRENO.AGUA };
    }
    // riscos (fase B de los pasos): con un azar propio (el resto del mapa sale igual que antes) y, si el mapa no vale, otra variante
    this.riscos = [];
    if (T.riscos && !(opciones && opciones.sinRiscos)) {
      for (let intento = 0; intento < INTENTOS_RISCOS; intento++) {
        this.generarRiscos(T, crearAleatorio(semilla * 7 + 1013 + intento * 7919));
        this.rasterizar();
        if (this.mapaValido()) break;
        if (intento === INTENTOS_RISCOS - 1) { this.riscos = []; this.rasterizar(); }
      }
    } else this.rasterizar();
    this.caminos = [];
    if ((T.caminos || T.senderos) && !(opciones && opciones.sinCaminos)) this.trazarCaminos(T, crearAleatorio(semilla * 17 + 2027));
  }
  /* Caminos (fase 3 del terreno, 2026-10-20): de un borde del campo al otro (de izquierda a derecha, entre los dos ejércitos), cada
     uno por un cruce si lo hay (el primero por el puente, el segundo por un vado; en la cordillera, por sus pasos) y, si no, por un
     punto al azar del centro; entre punto y punto, la ruta que rodea lo que no se pisa (buscarRuta) o la recta, y después se
     suaviza. Se pinta en las celdas que no son agua, roca ni puente. this.caminos: [{ puntos, ancho }] para el dibujo. */
  trazarCaminos(T, azar) {
    if (!this.jugable) this.calcularPaso();
    const senderos = !!T.senderos, [minimo, maximo] = T.caminos || T.senderos, cuantos = azar.entero(minimo, maximo), ancho = senderos ? ANCHO_SENDERO : ANCHO_CAMINO;
    // cruces: [x, y, medio largo del tramo recto] (2026-10-21, lo pidió el usuario: el camino tiene que cuadrar con el puente):
    // el camino entra y sale en recta, de través, por el centro del cruce (el puente con sus estribos y unos metros de acceso)
    const cruces = [];
    if (this.rio) { for (const p of this.rio.puentes) cruces.push([this.rio.centroX(p.y), p.y, this.rio.ancho / 2 + 10]); for (const v of this.rio.vados) cruces.push([this.rio.centroX(v), v, this.rio.ancho / 2 + 8]); }
    for (const risco of this.riscos) if (risco.pasos) cruces.push(...risco.pasos.map(([x, y]) => [x, y, 16]));
    const suavizar = puntos => {           // Chaikin, dos pasadas: las esquinas se redondean; los extremos no se mueven
      let suave = puntos;
      for (let pasada = 0; pasada < 2; pasada++) {
        const nuevo = [suave[0]];
        for (let s = 0; s < suave.length - 1; s++) { const [ax, ay] = suave[s], [bx, by] = suave[s + 1]; nuevo.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
        nuevo.push(suave[suave.length - 1]); suave = nuevo;
      }
      return suave;
    };
    // de un punto a otro: la ruta que rodea lo que no se pisa, o la recta
    const tramo = (desde, hasta) => { const ruta = this.buscarRuta(desde[0], desde[1], hasta[0], hasta[1]); return [desde, ...(ruta || [hasta])]; };
    for (let k = 0; k < cuantos; k++) {
      const yA = azar.entre(30, CAMPO.alto - 30), yB = azar.entre(30, CAMPO.alto - 30);
      const cruce = cruces[k], medio = cruce || [CAMPO.ancho / 2 + azar.entre(-40, 40), azar.entre(50, CAMPO.alto - 50), 0];
      // un recodo al azar a cada lado del cruce, para que no sea una recta
      const recodo = (x0, y0, x1, y1) => [(x0 + x1) / 2 + azar.entre(-10, 10), (y0 + y1) / 2 + azar.entre(-25, 25)];
      const entrada = [medio[0] - medio[2], medio[1]], salida = [medio[0] + medio[2], medio[1]], inicio = [1, yA], fin = [CAMPO.ancho - 1, yB];
      const recodoIda = recodo(...inicio, ...entrada), recodoVuelta = recodo(...salida, ...fin);
      const ida = [...tramo(inicio, recodoIda), ...tramo(recodoIda, entrada).slice(1)];
      const vuelta = [...tramo(salida, recodoVuelta), ...tramo(recodoVuelta, fin).slice(1)];
      // con cruce: lo de antes y lo de después, suavizados por separado, y entre medias el tramo recto por el centro del cruce
      const suave = cruce ? [...suavizar(ida), ...suavizar(vuelta)] : suavizar([...ida, ...vuelta.slice(1)]);
      this.caminos.push({ puntos: suave, ancho, sendero: senderos });
      this.pintarCamino(suave, ancho);
    }
    if (this.caminos.length) { this.jugable = null; this.holgura = null; }      // el coste de las rutas cambia con el camino
  }
  pintarCamino(puntos, ancho) {
    const C = this.columnas, F = this.filas, celda = this.celda, media = ancho / 2;
    for (let s = 0; s < puntos.length - 1; s++) {
      const [ax, ay] = puntos[s], [bx, by] = puntos[s + 1], largo2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      const [c0, c1] = celdasEntre(Math.min(ax, bx) - media, Math.max(ax, bx) + media, celda, C), [f0, f1] = celdasEntre(Math.min(ay, by) - media, Math.max(ay, by) + media, celda, F);
      for (let fila = f0; fila <= f1; fila++) for (let col = c0; col <= c1; col++) {
        const x = col * celda, y = fila * celda, u = largo2 > 0 ? limitar(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / largo2, 0, 1) : 0;
        if (Math.hypot(x - (ax + (bx - ax) * u), y - (ay + (by - ay) * u)) > media) continue;
        const k = fila * C + col, tipo = this.celdas[k];
        if (tipo === TERRENO.LLANO || tipo === TERRENO.BOSQUE || tipo === TERRENO.COLINA) this.celdas[k] = TERRENO.CAMINO;
      }
    }
  }
  // punto al azar dentro de la mancha m (repartido por el área: raíz del azar), hasta factor × su borde
  puntoAlAzarEnMancha(m, azar, factor = 1) { const a = azar.entre(-Math.PI, Math.PI), r = Math.sqrt(azar.numero()) * this.radioEn(m, a) * factor; return [m.x + Math.cos(a) * r, m.y + Math.sin(a) * r]; }
  radioEn(mancha, angulo) {
    const n = mancha.lobulos.length, t = ((angulo + Math.PI) / (2 * Math.PI)) * n;
    const i = Math.floor(t) % n, j = (i + 1) % n, f = t - Math.floor(t);
    return mancha.r * (mancha.lobulos[i] * (1 - f) + mancha.lobulos[j] * f);
  }
  dentro(mancha, x, y) { const d = distancia(x, y, mancha.x, mancha.y); return d <= this.radioEn(mancha, Math.atan2(y - mancha.y, x - mancha.x)); }
  tipoDesdeManchas(x, y) {
    let tipo = TERRENO.LLANO;
    for (const m of this.manchas) if (this.dentro(m, x, y)) tipo = m.tipo;   // el bosque (último) pisa a la colina
    if (this.riscos && this.riscos.length && this.profundidadRisco(x, y) >= 0) tipo = TERRENO.RISCO;   // la roca, a todo menos al río
    // el río pisa a todo; en los vados, vado
    if (this.rio && Math.abs(x - this.rio.centroX(y)) <= this.rio.ancho / 2) tipo = this.rio.tipoAgua(y);
    return tipo;
  }
  tipoEn(x, y) {
    const col = limitar(Math.round(x / this.celda), 0, this.columnas - 1), fila = limitar(Math.round(y / this.celda), 0, this.filas - 1);
    return this.celdas[fila * this.columnas + col];
  }
  /* Relieve (2026-10-16, fase 1 del terreno con volumen; desde la fase 2 también lo usa la simulación: ventaja de altura, pendiente,
     alcance, línea de visión y trayectoria de las flechas, así que tiene que dar lo mismo en el servidor y en todos los
     navegadores; solo usa operaciones que ya usa la simulación y se guarda en Float32Array). Cada colina es una cúpula suave (smoothstep
     desde un poco fuera de su borde) de ALTURA_COLINA_BASE + r × ALTURA_COLINA_POR_RADIO m; donde se solapan manda la más
     alta; el cauce del río se hunde PROFUNDIDAD_RIO m con orillas en rampa. Se calcula la primera vez que se pide, en la
     misma rejilla de 2 m que los tipos, y alturaEn interpola. */
  prepararRelieve() {
    if (this.alturas) return;
    const ALTURA_COLINA_BASE = 2.5, ALTURA_COLINA_POR_RADIO = 0.13, BORDE_COLINA = 1.15, PROFUNDIDAD_RIO = 0.7, ORILLA = 2.5;
    this.alturas = new Float32Array(this.columnas * this.filas);
    const colinas = this.manchas.filter(m => m.tipo === TERRENO.COLINA).map(m => ({ m, altura: ALTURA_COLINA_BASE + m.r * ALTURA_COLINA_POR_RADIO, alcance: m.r * 1.25 * BORDE_COLINA + 1 }));
    // (2026-10-19, mapa rápido) por cajas, con el mismo resultado: (1) cada colina solo en su caja, quedándose con el máximo (no
    // depende del orden); (2) la roca, una vez por celda, solo en las celdas de las cajas de los riscos; (3) el río, en todas
    const C = this.columnas, F = this.filas, celda = this.celda, colinasMax = new Float64Array(C * F);
    for (const { m, altura, alcance } of colinas) {
      const [c0, c1] = celdasEntre(m.x - alcance, m.x + alcance, celda, C, 1), [f0, f1] = celdasEntre(m.y - alcance, m.y + alcance, celda, F, 1);
      for (let fila = f0; fila <= f1; fila++) for (let col = c0; col <= c1; col++) {
        const x = col * celda, y = fila * celda, dx = x - m.x, dy = y - m.y; if (Math.abs(dx) > alcance || Math.abs(dy) > alcance) continue;
        const d = Math.hypot(dx, dy), radio = this.radioEn(m, Math.atan2(dy, dx)) * BORDE_COLINA;
        const s = 1 - d / radio; if (s <= 0) continue;
        const v = escalaSuave(altura, s), k = fila * C + col; if (v > colinasMax[k]) colinasMax[k] = v;
      }
    }
    const conRoca = new Uint8Array(C * F);
    for (const risco of this.riscos) {
      const [x0, y0, x1, y1] = risco.caja;
      const [c0, c1] = celdasEntre(x0 - 5, x1 + 5, celda, C), [f0, f1] = celdasEntre(y0 - 5, y1 + 5, celda, F);
      for (let fila = f0; fila <= f1; fila++) for (let col = c0; col <= c1; col++) conRoca[fila * C + col] = 1;
    }
    for (let fila = 0; fila < F; fila++) for (let col = 0; col < C; col++) {
      const x = col * celda, y = fila * celda, k = fila * C + col;
      let h = colinasMax[k];
      // riscos (fase B): la roca se levanta sobre lo que haya debajo (llano o colina), casi vertical en los 3 primeros metros
      if (conRoca[k]) {
        const dentro = this.profundidadRisco(x, y);
        if (dentro > -0.5) {
          let risco = null, mejor = -Infinity;
          for (const rr of this.riscos) { const [x0, y0, x1, y1] = rr.caja; if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue; for (const [cx, cy, rad] of rr.circulos) { const p = rad - Math.hypot(x - cx, y - cy); if (p > mejor) { mejor = p; risco = rr; } } }
          const s = limitar((dentro + 0.5) / 3.5, 0, 1), rugosidad = 0.85 + 0.3 * (((Math.imul(col * 73856093 ^ fila * 19349663, 2654435761) >>> 0) % 1000) / 1000);
          if (risco) h += escalaSuave(risco.alto, s) * rugosidad;
        }
      }
      if (this.rio && this.rio.enPuente(y)) {
        // puente (fase 3): el tablero, ALTURA_PUENTE m sobre lo que haya en la orilla, sin bajar al cauce
        if (Math.abs(x - this.rio.centroX(y)) - this.rio.ancho / 2 <= 0) h += ALTURA_PUENTE;
      } else if (this.rio) {
        const fuera = Math.abs(x - this.rio.centroX(y)) - this.rio.ancho / 2;
        if (fuera < ORILLA) {
          const hondo = this.rio.profundo && !this.rio.enVado(y) ? 2.2 : 1;
          // junto a un puente (fase 3), la orilla baja poco a poco en los 4 m a cada lado del tablero (si no, un corte en el relieve)
          let junto = 1; for (const p of this.rio.puentes) junto = Math.min(junto, limitar((Math.abs(y - p.y) - p.ancho / 2) / 4, 0, 1));
          h = Math.min(h, fuera <= 0 ? -PROFUNDIDAD_RIO * hondo : -PROFUNDIDAD_RIO * hondo * (1 - fuera / ORILLA) * junto);
        }
      }
      this.alturas[k] = h;
    }
    // pendiente de cada celda (m de subida por m de avance, en x y en y), por diferencias centradas
    this.pendienteX = new Float32Array(C * F); this.pendienteY = new Float32Array(C * F);
    for (let fila = 0; fila < F; fila++) for (let col = 0; col < C; col++) {
      const i = fila * C + col, izquierda = col > 0 ? i - 1 : i, derecha = col < C - 1 ? i + 1 : i, arriba = fila > 0 ? i - C : i, abajo = fila < F - 1 ? i + C : i;
      this.pendienteX[i] = (this.alturas[derecha] - this.alturas[izquierda]) / ((derecha - izquierda) * this.celda);
      this.pendienteY[i] = (this.alturas[abajo] - this.alturas[arriba]) / ((abajo - arriba) / C * this.celda);
    }
    /* Estructuras (preparado para los asedios: murallas, torres, edificios). Cada una se rasteriza en estas mismas celdas:
       `alturaEstructura` suma metros al relieve (lo que se ve y lo que tapa), y `tipoEstructura` dirá si la celda se pisa
       (adarve, plataforma de torre: los que están encima quedan a esa altura) o no (lienzo de muralla, pared de edificio:
       infranqueable y solo tapa). La simulación ya lo lee todo a través de alturaEn / obstaculoEn / visionLibre /
       trayectoriaLibre, así que una muralla nueva tapará la vista, parará flechas y dará ventaja de altura sin tocar el combate.
       De momento no hay ninguna: los dos arrays quedan a null. */
    this.alturaEstructura = null; this.tipoEstructura = null;
  }
  interpolar(a, x, y) {
    const fx = limitar(x / this.celda, 0, this.columnas - 1.001), fy = limitar(y / this.celda, 0, this.filas - 1.001);
    const c0 = Math.floor(fx), f0 = Math.floor(fy), tx = fx - c0, ty = fy - f0, i = f0 * this.columnas + c0;
    return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + this.columnas] * (1 - tx) + a[i + this.columnas + 1] * tx) * ty;
  }
  // altura del suelo que se pisa (relieve; con estructuras, también el adarve o la plataforma de una torre)
  alturaEn(x, y) {
    if (!this.alturas) this.prepararRelieve();
    return this.interpolar(this.alturas, x, y);
  }
  // altura de lo que tapa la vista o para una flecha en ese punto: el relieve y, en el futuro, murallas y edificios
  obstaculoEn(x, y) {
    if (!this.alturas) this.prepararRelieve();
    return this.interpolar(this.alturas, x, y) + (this.alturaEstructura ? this.interpolar(this.alturaEstructura, x, y) : 0);
  }
  // pendiente en la dirección (dirX, dirY) unitaria: positiva cuesta arriba (0,3 = 30 cm de subida por metro)
  // (se llama para cada soldado que se mueve en cada paso: una sola interpolación para las dos componentes)
  pendienteEn(x, y, dirX, dirY) {
    if (!this.alturas) this.prepararRelieve();
    const fx = limitar(x / this.celda, 0, this.columnas - 1.001), fy = limitar(y / this.celda, 0, this.filas - 1.001);
    const c0 = Math.floor(fx), f0 = Math.floor(fy), tx = fx - c0, ty = fy - f0, i = f0 * this.columnas + c0, j = i + this.columnas;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty, px = this.pendienteX, py = this.pendienteY;
    return (px[i] * w00 + px[i + 1] * w10 + px[j] * w01 + px[j + 1] * w11) * dirX + (py[i] * w00 + py[i + 1] * w10 + py[j] * w01 + py[j + 1] * w11) * dirY;
  }
  /* ¿Se ve (x1, y1, z1) desde (x0, y0, z0)? z en metros absolutos. Recorre la recta cada PASO_VISION m sin mirar el primer ni
     el último metro (el suelo bajo el que mira y bajo el mirado) y falla si algún punto queda por debajo del obstáculo. */
  visionLibre(x0, y0, z0, x1, y1, z1) {
    const d = distancia(x0, y0, x1, y1); if (d < 2) return true;
    const pasos = Math.ceil(d / PASO_VISION);
    for (let k = 1; k < pasos; k++) {
      const u = k / pasos; if (u * d < 1 || (1 - u) * d < 1) continue;
      if (z0 + (z1 - z0) * u < this.obstaculoEn(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) return false;
    }
    return true;
  }
  /* Flecha en parábola de (x0, y0, z0) a (x1, y1, z1) con la flecha `apice` m por encima de la recta en el centro (como la
     dibuja el render): fracción del vuelo (0-1) en la que choca con el relieve o una estructura, o 1 si llega. */
  trayectoriaLibre(x0, y0, z0, x1, y1, z1, apice) {
    const d = distancia(x0, y0, x1, y1); if (d < 2) return 1;
    const pasos = Math.ceil(d / PASO_TRAYECTORIA);
    for (let k = 1; k < pasos; k++) {
      const u = k / pasos; if (u * d < 1 || (1 - u) * d < 1) continue;
      if (z0 + (z1 - z0) * u + alturaParabola(apice, u) < this.obstaculoEn(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)) return u;
    }
    return 1;
  }
  /* ---------- Riscos (fase B de los pasos, 2026-10-19, pedido del usuario: «rehacer todos los mapas» con riscos, paso mínimo 35 m) ----------
     Roca alta que no se pisa (TERRENO.RISCO): tapa la vista y para flechas por su altura (prepararRelieve). Cada risco es una
     lista de círculos [x, y, r] (su unión es la roca) con su altura `alto`:
     · peñasco: un círculo y dos o tres más pequeños pegados (10-25 m);
     · escarpe: una cresta de círculos a lo largo de una línea curva (25-50 m de largo, 6-10 de ancho);
     · cordillera: una cresta de borde a borde por el centro del campo con uno o dos pasos (mapa «Paso de montaña»).
     Reglas al colocar (`riscoAceptable`): nunca en las zonas de despliegue (así que solo en la franja central); a PASO_MINIMO m o
     más del borde (salvo la cordillera, que lo toca), de los demás riscos y del agua profunda (6 m del agua somera). Después el mapa
     entero se valida (`mapaValido`) y, si no vale, se rehacen los riscos con otra variante de la semilla. */
  generarRiscos(T, azar) {
    this.riscos = [];
    const R = T.riscos || {}, margenZona = 6;
    const zona = equipo => zonaDespliegue(equipo);
    const zonas = [zona(0), zona(1)];
    const franjaX0 = zonas[0].x1 + margenZona, franjaX1 = zonas[1].x0 - margenZona;
    const separacion = (a, b) => { let minimo = Infinity; for (const [x1, y1, r1] of a) for (const [x2, y2, r2] of b) minimo = Math.min(minimo, Math.hypot(x1 - x2, y1 - y2) - r1 - r2); return minimo; };
    const aceptable = (circulos, tocaBorde) => {
      for (const [x, y, r] of circulos) {
        for (const z of zonas) if (x + r > z.x0 - margenZona && x - r < z.x1 + margenZona && y + r > z.y0 - margenZona && y - r < z.y1 + margenZona) return false;
        const borde = Math.min(x - r, CAMPO.ancho - x - r, y - r, CAMPO.alto - y - r);
        if (!tocaBorde && borde < PASO_MINIMO + 2) return false;
        if (this.rio) { const alAgua = Math.abs(x - this.rio.centroX(y)) - this.rio.ancho / 2 - r; if (alAgua < (this.rio.profundo ? PASO_MINIMO + 2 : 6)) return false; }
      }
      for (const otro of this.riscos) if (separacion(circulos, otro.circulos) < PASO_MINIMO + 2) return false;
      return true;
    };
    const intentar = (crear, cuantos) => { for (let k = 0; k < cuantos; k++) for (let intento = 0; intento < 40; intento++) { const risco = crear(); if (risco && aceptable(risco.circulos, risco.tocaBorde)) { this.riscos.push(risco); break; } } };
    if (franjaX1 - franjaX0 > 10) {
      if (R.penascos) intentar(() => {
        const x = azar.entre(franjaX0, franjaX1), y = azar.entre(PASO_MINIMO + 15, CAMPO.alto - PASO_MINIMO - 15), r = azar.entre(5, 9), circulos = [[x, y, r]];
        for (let k = azar.entero(2, 3); k > 0; k--) { const a = azar.entre(-Math.PI, Math.PI), d = r * azar.entre(0.6, 1.0); circulos.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * azar.entre(0.5, 0.85)]); }
        return { tipo: 'penasco', circulos, alto: azar.entre(5, 9) };
      }, azar.entero(R.penascos[0], R.penascos[1]));
      if (R.escarpes) intentar(() => {
        let x = azar.entre(franjaX0, franjaX1), y = azar.entre(PASO_MINIMO + 20, CAMPO.alto - PASO_MINIMO - 20), angulo = azar.entre(-Math.PI, Math.PI);
        const largo = azar.entre(25, 50), ancho = azar.entre(6, 10), curva = azar.entre(-0.02, 0.02), circulos = [];
        for (let d = 0; d <= largo; d += 3) { circulos.push([x, y, ancho / 2 * azar.entre(0.85, 1.15)]); x += Math.cos(angulo) * 3; y += Math.sin(angulo) * 3; angulo += curva * 3; }
        return { tipo: 'escarpe', circulos, alto: azar.entre(6, 10) };
      }, azar.entero(R.escarpes[0], R.escarpes[1]));
    }
    if (R.cordillera) {
      // cresta de borde a borde por el centro; los pasos, donde la cresta pasa cerca del centro (justo para los dos bandos)
      const amplitud = azar.entre(4, 10), frecuencia = azar.entre(0.01, 0.02), fase = azar.entre(0, Math.PI * 2);
      const xEn = y => CAMPO.ancho / 2 + amplitud * Math.sin(y * frecuencia + fase), radioMaximo = 10;
      const cuantos = azar.entero(R.cordillera[0], R.cordillera[1]);
      // pasos en fracciones del alto (13/32-19/32; con dos, 7/32-11/32 y 21/32-25/32): con 320 m, 130-190, 70-110 y 210-250 m
      const A = CAMPO.alto, pasos = cuantos === 1 ? [azar.entre(A * 13 / 32, A * 19 / 32)] : [azar.entre(A * 7 / 32, A * 11 / 32), azar.entre(A * 21 / 32, A * 25 / 32)];
      const mitad = azar.entre(PASO_MINIMO / 2 + 6, PASO_MINIMO / 2 + 11) + radioMaximo;     // hueco de borde a borde de roca: 47-57 m
      const circulos = [];
      for (let y = -6; y <= CAMPO.alto + 6; y += 3) if (!pasos.some(p => Math.abs(y - p) < mitad)) circulos.push([xEn(y) + azar.entre(-1.5, 1.5), y, azar.entre(7, radioMaximo)]);
      const risco = { tipo: 'cordillera', circulos, alto: azar.entre(10, 14), tocaBorde: true, pasos: pasos.map(p => [xEn(p), p]) };
      if (aceptable(circulos, true)) this.riscos.push(risco);
    }
    for (const risco of this.riscos) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y, r] of risco.circulos) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
      risco.caja = [x0, y0, x1, y1];
    }
  }
  // cuánto se mete (x, y) dentro de la roca: máximo de r − d entre sus círculos (positivo dentro), o −Infinity lejos de toda roca
  profundidadRisco(x, y) {
    let mejor = -Infinity;
    for (const risco of this.riscos) {
      const [x0, y0, x1, y1] = risco.caja; if (x < x0 - 4 || x > x1 + 4 || y < y0 - 4 || y > y1 + 4) continue;
      for (const [cx, cy, r] of risco.circulos) { const p = r - Math.hypot(x - cx, y - cy); if (p > mejor) mejor = p; }
    }
    return mejor;
  }
  /* Mapa base (manchas y río), por cajas (2026-10-19, mapa rápido: antes cada celda miraba todas las manchas con su ángulo y su
     distancia, 55-420 ms según el mapa; en Render, con 0,1 de CPU, varios segundos con el servidor parado). Da exactamente lo mismo
     que tipoDesdeManchas en cada celda: las manchas se recorren en el mismo orden (la última que contiene la celda manda) y cada
     una solo en las celdas de su caja (fuera de ella `dentro` es falso: radioEn nunca pasa de r × el lóbulo mayor); el río pisa a
     todo en su franja, fila a fila. */
  rasterizarBase() {
    const C = this.columnas, F = this.filas, celda = this.celda, base = new Uint8Array(C * F);       // 0 = TERRENO.LLANO
    for (const m of this.manchas) {
      const radio = m.r * Math.max(...m.lobulos) + celda;
      const [c0, c1] = celdasEntre(m.x - radio, m.x + radio, celda, C), [f0, f1] = celdasEntre(m.y - radio, m.y + radio, celda, F);
      for (let fila = f0; fila <= f1; fila++) for (let col = c0; col <= c1; col++) if (this.dentro(m, col * celda, fila * celda)) base[fila * C + col] = m.tipo;
    }
    if (this.rio) {
      const rio = this.rio;
      for (let fila = 0; fila < F; fila++) {
        const y = fila * celda, centro = rio.centroX(y);
        const [c0, c1] = celdasEntre(centro - rio.ancho / 2, centro + rio.ancho / 2, celda, C, 1);
        for (let col = c0; col <= c1; col++) {
          const x = col * celda;
          if (Math.abs(x - rio.centroX(y)) <= rio.ancho / 2) base[fila * C + col] = rio.tipoAgua(y);
        }
      }
    }
    return base;
  }
  // el mapa base (manchas y río) se rasteriza una vez; en cada variante de los riscos solo se pinta la roca encima (en su caja)
  rasterizar() {
    if (!this.celdasBase) this.celdasBase = this.rasterizarBase();
    this.celdas.set(this.celdasBase);
    for (const risco of this.riscos) {
      const [x0, y0, x1, y1] = risco.caja;
      for (let fila = Math.max(0, Math.floor(y0 / this.celda)); fila <= Math.min(this.filas - 1, Math.ceil(y1 / this.celda)); fila++) for (let col = Math.max(0, Math.floor(x0 / this.celda)); col <= Math.min(this.columnas - 1, Math.ceil(x1 / this.celda)); col++) {
        const k = fila * this.columnas + col, base = this.celdasBase[k];
        if (base === TERRENO.AGUA || base === TERRENO.VADO || base === TERRENO.PROFUNDA) continue;      // el río pisa a la roca
        if (this.profundidadRisco(col * this.celda, fila * this.celda) >= 0) this.celdas[k] = TERRENO.RISCO;
      }
    }
    this.jugable = null; this.holgura = null; this.alturas = null;
  }
  /* ¿Vale el mapa? (1) los dos despliegues conectados por pasos de al menos PASO_MINIMO, también contando el borde del campo como
     pared; (2) nada que no se pise dentro de las zonas de despliegue; (3) justo: para cada paso (vado o paso de la cordillera), la
     ruta desde el frente de cada ejército no es más de un 20 % (y 10 m) más larga que la del otro. */
  mapaValido() {
    this.calcularPaso();
    if (!this.conexo || !this.conexoContandoBorde()) return false;
    const zona = equipo => zonaDespliegue(equipo);
    for (const z of [zona(0), zona(1)]) for (let y = z.y0; y <= z.y1; y += this.celda) for (let x = z.x0; x <= z.x1; x += this.celda) if (!this.transitable(x, y)) return false;
    const pasos = this.pasosClave();
    const largoRuta = (x0, y0, x1, y1) => { const ruta = this.buscarRuta(x0, y0, x1, y1); if (!ruta) return distancia(x0, y0, x1, y1); let largo = 0, px = x0, py = y0; for (const [x, y] of ruta) { largo += distancia(px, py, x, y); px = x; py = y; } return largo; };
    for (const [px, py] of pasos) {
      // (sin redondear, a diferencia del constructor: unificarlo cambia los mapas de cada semilla; ver README «duplicados que se dejaron aparte»)
      const frente0 = CAMPO.ancho * FRENTE_DESPLIEGUE, frente1 = CAMPO.ancho * (1 - FRENTE_DESPLIEGUE);
      const d0 = largoRuta(frente0, py, px, py), d1 = largoRuta(frente1, py, px, py);
      if (Math.max(d0, d1) > Math.min(d0, d1) * 1.2 + 10) return false;
    }
    return true;
  }
  // los pasos que hay que cruzar para llegar al otro lado: vados y puentes del río profundo y pasos de la cordillera ([x, y] de su centro)
  pasosClave() {
    const pasos = [];
    if (this.rio && this.rio.profundo) for (const v of this.rio.vados) pasos.push([this.rio.centroX(v), v]);
    if (this.rio && this.rio.profundo) for (const p of this.rio.puentes) pasos.push([this.rio.centroX(p.y), p.y]);   // fase 3
    for (const risco of this.riscos || []) if (risco.pasos) pasos.push(...risco.pasos);
    return pasos;
  }
  // como la conexión de calcularPaso, pero con el borde del campo como pared (un paso estrecho entre un risco y el borde no vale)
  conexoContandoBorde() {
    const C = this.columnas, F = this.filas, n = C * F, radio = Math.round(PASO_MINIMO / 2 / this.celda * 3);
    const bloqueada = new Uint8Array(n); for (let k = 0; k < n; k++) bloqueada[k] = BLOQUEA_PASO[this.celdas[k]] ? 1 : 0;
    if (this.tipoEstructura) for (let k = 0; k < n; k++) if (this.tipoEstructura[k] === ESTRUCTURA.PARED) bloqueada[k] = 1;
    const aObstaculo = this.distanciaChaflan(bloqueada, true);
    const nucleo = k => !bloqueada[k] && aObstaculo[k] >= radio;
    const zona = equipo => zonaDespliegue(equipo);
    const semilla = equipo => { const z = zona(equipo); return this.celdaMasCercana((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, nucleo); };
    const s0 = semilla(0), s1 = semilla(1); if (s0 < 0 || s1 < 0) return false;
    const visto = new Uint8Array(n), cola = [s0]; visto[s0] = 1;
    for (let q = 0; q < cola.length; q++) { const k = cola[q], c = k % C, f = (k - c) / C; for (const [dc, df] of VECINOS_4) { const cc = c + dc, ff = f + df; if (cc < 0 || ff < 0 || cc >= C || ff >= F) continue; const v = ff * C + cc; if (!visto[v] && nucleo(v)) { visto[v] = 1; cola.push(v); } } }
    return visto[s1] === 1;
  }
  /* ---------- Zonas que no se pisan, zona jugable y rutas (2026-10-18, fase A de los pasos, pedido del usuario) ----------
     · Celdas que no se pisan: de momento el agua profunda (mapa «Río profundo»); en la fase B, riscos; con los asedios, murallas
       (tipoEstructura). `transitable(x, y)` mira la zona jugable: fuera del campo se puede (los que huyen salen por el borde).
     · ZONA JUGABLE: la parte del campo conectada con los dos despliegues por pasos de al menos PASO_MINIMO m. Se calcula con una
       «apertura»: se quitan las celdas a menos de PASO_MINIMO / 2 de un obstáculo (el borde del campo no cuenta: si no, las esquinas
       quedaban fuera; que no haya pasos estrechos contra el borde lo asegura el generador de mapas), se rellena desde el despliegue del
       equipo 0 y se vuelve a ensanchar lo alcanzado PASO_MINIMO / 2 m andando (solo por celdas que se pisan). Lo que queda fuera
       (islas, mesetas sin rampa, rincones a los que solo se llega por una rendija) no es jugable: no se despliega ni se entra en
       ello. Si el despliegue del equipo 1 no queda conectado, `conexo` es falso (el generador de la fase B lo rehará).
     · HOLGURA: metros desde cada celda hasta lo no jugable; las rutas se alejan de las paredes y las rectas la exigen.
     · RUTAS: A* en una rejilla de PASO_RUTA m, coste entero (×10) según el freno del terreno y un recargo cerca de las paredes,
       desempate por número de nodo (idéntico en todos los navegadores y en el servidor), y después se tensa (se quitan los
       puntos que sobran mientras la recta quede libre). Distancias con la métrica de chaflán 3-4 (enteros). */
  calcularPaso() {
    const C = this.columnas, F = this.filas, n = C * F, celda = this.celda;
    const bloqueada = new Uint8Array(n);
    for (let k = 0; k < n; k++) bloqueada[k] = BLOQUEA_PASO[this.celdas[k]] ? 1 : 0;
    if (this.tipoEstructura) for (let k = 0; k < n; k++) if (this.tipoEstructura[k] === ESTRUCTURA.PARED) bloqueada[k] = 1;
    this.hayBloqueos = bloqueada.some(v => v);
    this.jugable = new Uint8Array(n).fill(1); this.conexo = true;
    if (this.hayBloqueos) {
      // apertura: núcleo = celdas a PASO_MINIMO / 2 o más de lo bloqueado y del borde
      const radio = Math.round(PASO_MINIMO / 2 / celda * 3);
      const aObstaculo = this.distanciaChaflan(bloqueada, false);   // el borde no cuenta (si no, las esquinas quedaban fuera)
      const nucleo = new Uint8Array(n); for (let k = 0; k < n; k++) nucleo[k] = !bloqueada[k] && aObstaculo[k] >= radio ? 1 : 0;
      const semilla = equipo => { const zona = zonaDespliegue(equipo); return this.celdaMasCercana((zona.x0 + zona.x1) / 2, (zona.y0 + zona.y1) / 2, k => nucleo[k]); };
      const s0 = semilla(0), s1 = semilla(1);
      const componente = new Uint8Array(n);
      if (s0 >= 0) { const cola = [s0]; componente[s0] = 1; for (let q = 0; q < cola.length; q++) { const k = cola[q], c = k % C, f = (k - c) / C; for (const [dc, df] of VECINOS_4) { const cc = c + dc, ff = f + df; if (cc < 0 || ff < 0 || cc >= C || ff >= F) continue; const v = ff * C + cc; if (nucleo[v] && !componente[v]) { componente[v] = 1; cola.push(v); } } } }
      this.conexo = s0 >= 0 && s1 >= 0 && componente[s1] === 1;
      // se ensancha lo alcanzado andando (Dijkstra con cubos, pesos 3 y 4) hasta el radio
      const alcance = new Uint16Array(n).fill(65535), cubos = Array.from({ length: radio + 5 }, () => []);
      for (let k = 0; k < n; k++) if (componente[k]) { alcance[k] = 0; cubos[0].push(k); }
      for (let valor = 0; valor < cubos.length; valor++) for (let q = 0; q < cubos[valor].length; q++) {
        const k = cubos[valor][q]; if (alcance[k] !== valor) continue;
        const c = k % C, f = (k - c) / C;
        for (const [dc, df, peso] of VECINOS_8) {
          const cc = c + dc, ff = f + df; if (cc < 0 || ff < 0 || cc >= C || ff >= F) continue;
          const v = ff * C + cc, nuevo = valor + peso; if (bloqueada[v] || nuevo > radio + 1 || nuevo >= alcance[v]) continue;
          alcance[v] = nuevo; cubos[nuevo].push(v);
        }
      }
      for (let k = 0; k < n; k++) this.jugable[k] = alcance[k] !== 65535 ? 1 : 0;
      // puentes (fase 3 del terreno): más estrechos que PASO_MINIMO a propósito, la apertura los dejaría fuera; se añaden sus celdas
      // alcanzables desde lo jugable de las orillas (siempre igual en el despliegue y en la batalla: nadie llega a lo que no se puede)
      const colaPuente = [];
      for (let k = 0; k < n; k++) if (this.jugable[k]) colaPuente.push(k);
      for (let q = 0; q < colaPuente.length; q++) {
        const k = colaPuente[q], c = k % C, f = (k - c) / C;
        for (const [dc, df] of VECINOS_4) { const cc = c + dc, ff = f + df; if (cc < 0 || ff < 0 || cc >= C || ff >= F) continue; const v = ff * C + cc; if (!this.jugable[v] && this.celdas[v] === TERRENO.PUENTE) { this.jugable[v] = 1; colaPuente.push(v); } }
      }
    }
    // holgura (m) hasta lo no jugable (el borde del campo no cuenta: se puede ir pegado a él)
    const noJugable = new Uint8Array(n); for (let k = 0; k < n; k++) noJugable[k] = this.jugable[k] ? 0 : 1;
    const chaflan = this.distanciaChaflan(noJugable, false);
    this.holgura = new Float32Array(n); for (let k = 0; k < n; k++) this.holgura[k] = chaflan[k] === 65535 ? 999 : chaflan[k] / 3 * celda;
    // rejilla de rutas: qué nodos se pisan y lo que cuesta entrar en cada uno (×10 por metro de rejilla: freno del terreno y
    // recargo a menos de 10 m de una pared), calculado una vez
    const RC = this.rutaColumnas = Math.floor(CAMPO.ancho / PASO_RUTA) + 1, RF = this.rutaFilas = Math.floor(CAMPO.alto / PASO_RUTA) + 1;
    this.nodoPasable = new Uint8Array(RC * RF); this.nodoCoste = new Uint16Array(RC * RF);
    for (let k = 0; k < RC * RF; k++) {
      const x = (k % RC) * PASO_RUTA, y = Math.floor(k / RC) * PASO_RUTA, h = this.holgura[this.indiceCelda(x, y)];
      this.nodoPasable[k] = h >= HOLGURA_RUTA_MINIMA || (h >= 2 && this.tipoEn(x, y) === TERRENO.PUENTE) ? 1 : 0;   // en el puente, con 2 m basta
      const tipoRuta = this.tipoEn(x, y) === TERRENO.QUEMADO ? TERRENO.BOSQUE : this.tipoEn(x, y);   // lo quemado, como era (ver flechas de fuego)
      this.nodoCoste[k] = Math.round(10 / Math.max(0.2, FRENO_TERRENO[tipoRuta] || 1)) + (h < 10 ? Math.round((10 - h) * 2) : 0);
    }
  }
  // distancia de chaflán 3-4 (en tercios de celda) a las celdas marcadas; con bordeObstaculo, el exterior del campo también cuenta
  distanciaChaflan(marcadas, bordeObstaculo) {
    const C = this.columnas, F = this.filas, d = new Uint16Array(C * F), INF = 65535, fuera = bordeObstaculo ? 0 : INF;
    for (let k = 0; k < d.length; k++) d[k] = marcadas[k] ? 0 : INF;
    const leer = (c, f) => c < 0 || f < 0 || c >= C || f >= F ? fuera : d[f * C + c];
    for (let f = 0; f < F; f++) for (let c = 0; c < C; c++) { const k = f * C + c; if (!d[k]) continue; d[k] = Math.min(d[k], leer(c - 1, f - 1) + 4, leer(c, f - 1) + 3, leer(c + 1, f - 1) + 4, leer(c - 1, f) + 3, INF); }
    for (let f = F - 1; f >= 0; f--) for (let c = C - 1; c >= 0; c--) { const k = f * C + c; if (!d[k]) continue; d[k] = Math.min(d[k], leer(c + 1, f + 1) + 4, leer(c, f + 1) + 3, leer(c - 1, f + 1) + 4, leer(c + 1, f) + 3, INF); }
    return d;
  }
  indiceCelda(x, y) { return limitar(Math.round(y / this.celda), 0, this.filas - 1) * this.columnas + limitar(Math.round(x / this.celda), 0, this.columnas - 1); }
  // la celda (por anillos alrededor de la más cercana a x, y) que cumple la condición; -1 si no hay en 60 m
  celdaMasCercana(x, y, cumple) {
    const C = this.columnas, F = this.filas, c0 = limitar(Math.round(x / this.celda), 0, C - 1), f0 = limitar(Math.round(y / this.celda), 0, F - 1);
    for (let anillo = 0; anillo <= 30; anillo++) {
      let mejor = -1, mejorD = Infinity;
      for (let f = f0 - anillo; f <= f0 + anillo; f++) for (let c = c0 - anillo; c <= c0 + anillo; c++) {
        if (Math.max(Math.abs(f - f0), Math.abs(c - c0)) !== anillo || c < 0 || f < 0 || c >= C || f >= F) continue;
        const k = f * C + c; if (!cumple(k)) continue;
        const d = (c - c0) * (c - c0) + (f - f0) * (f - f0); if (d < mejorD) { mejorD = d; mejor = k; }
      }
      if (mejor >= 0) return mejor;
    }
    return -1;
  }
  // (se llama para cada soldado en cada paso: la celda se calcula aquí mismo; dentro del campo da lo mismo que indiceCelda)
  transitable(x, y) {
    if (!this.jugable) this.calcularPaso();
    if (x < 0 || y < 0 || x > CAMPO.ancho || y > CAMPO.alto) return true;
    return this.jugable[Math.round(y / this.celda) * this.columnas + Math.round(x / this.celda)] === 1;
  }
  holguraEn(x, y) {
    if (!this.holgura) this.calcularPaso();
    if (x < 0 || y < 0 || x > CAMPO.ancho || y > CAMPO.alto) return 999;
    return this.holgura[Math.round(y / this.celda) * this.columnas + Math.round(x / this.celda)];
  }
  // el punto jugable más cercano (centro de celda) con al menos `holguraMinima` m hasta lo no jugable
  puntoTransitableCercano(x, y, holguraMinima) {
    if (!this.jugable) this.calcularPaso();
    const minimo = holguraMinima || 0;
    if (this.transitable(x, y) && this.holguraEn(x, y) >= minimo) return [x, y];
    const k = this.celdaMasCercana(x, y, v => this.jugable[v] === 1 && this.holgura[v] >= minimo);
    if (k < 0) return [x, y];
    return [(k % this.columnas) * this.celda, Math.floor(k / this.columnas) * this.celda];
  }
  // ¿se puede ir en línea recta de (x0, y0) a (x1, y1) sin pasar a menos de `holguraMinima` m de lo no jugable?
  rectaLibre(x0, y0, x1, y1, holguraMinima) {
    if (!this.hayBloqueosCalculado()) return true;
    const d = distancia(x0, y0, x1, y1), pasos = Math.max(1, Math.ceil(d / 1));
    for (let k = 0; k <= pasos; k++) { const u = k / pasos; if (this.holguraEn(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u) < holguraMinima) return false; }
    return true;
  }
  hayBloqueosCalculado() { if (!this.jugable) this.calcularPaso(); return this.hayBloqueos; }
  /* Ruta de (x0, y0) a (x1, y1) que rodea lo no jugable: lista de puntos [[x, y], …] que acaba en el destino (ajustado a lo
     jugable), o null si se puede ir en recta. */
  buscarRuta(x0, y0, x1, y1) {
    if (!this.hayBloqueosCalculado()) return null;
    const [destinoX, destinoY] = this.puntoTransitableCercano(limitar(x1, 0.5, CAMPO.ancho - 0.5), limitar(y1, 0.5, CAMPO.alto - 0.5), HOLGURA_RUTA_MINIMA);
    if (this.rectaLibre(x0, y0, destinoX, destinoY, HOLGURA_RECTA)) return null;
    const C = this.rutaColumnas, F = this.rutaFilas, n = C * F;
    const nodoX = k => (k % C) * PASO_RUTA, nodoY = k => Math.floor(k / C) * PASO_RUTA;
    const nodoPasable = this.nodoPasable, nodoCoste = this.nodoCoste, pasable = k => nodoPasable[k] === 1;
    const nodoCercano = (x, y) => {
      const c0 = limitar(Math.round(x / PASO_RUTA), 0, C - 1), f0 = limitar(Math.round(y / PASO_RUTA), 0, F - 1);
      for (let anillo = 0; anillo <= 12; anillo++) {
        let mejor = -1, mejorD = Infinity;
        for (let f = f0 - anillo; f <= f0 + anillo; f++) for (let c = c0 - anillo; c <= c0 + anillo; c++) {
          if (Math.max(Math.abs(f - f0), Math.abs(c - c0)) !== anillo || c < 0 || f < 0 || c >= C || f >= F) continue;
          const k = f * C + c; if (!pasable(k)) continue;
          const d = (nodoX(k) - x) * (nodoX(k) - x) + (nodoY(k) - y) * (nodoY(k) - y); if (d < mejorD) { mejorD = d; mejor = k; }
        }
        if (mejor >= 0) return mejor;
      }
      return -1;
    };
    const inicio = nodoCercano(x0, y0), fin = nodoCercano(destinoX, destinoY);
    if (inicio < 0 || fin < 0) return [[destinoX, destinoY]];
    const costeG = new Int32Array(n).fill(-1), padre = new Int32Array(n).fill(-1), cerrado = new Uint8Array(n);
    const heuristica = k => { const dx = Math.abs((k % C) - (fin % C)), dy = Math.abs(Math.floor(k / C) - Math.floor(fin / C)); return 10 * Math.max(dx, dy) + 4 * Math.min(dx, dy); };
    // montículo binario de [f, nodo] ordenado por f y, a igual f, por número de nodo
    const monton = [];
    const menor = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    const meter = e => { monton.push(e); let i = monton.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!menor(monton[i], monton[p])) break; [monton[i], monton[p]] = [monton[p], monton[i]]; i = p; } };
    const sacar = () => { const tope = monton[0], ultimo = monton.pop(); if (monton.length) { monton[0] = ultimo; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < monton.length && menor(monton[a], monton[m])) m = a; if (b < monton.length && menor(monton[b], monton[m])) m = b; if (m === i) break; [monton[i], monton[m]] = [monton[m], monton[i]]; i = m; } } return tope; };
    costeG[inicio] = 0; meter([heuristica(inicio), inicio]);
    while (monton.length) {
      const [, k] = sacar(); if (cerrado[k]) continue; cerrado[k] = 1;
      if (k === fin) break;
      const c = k % C, f = (k - c) / C;
      for (const [dc, df, peso] of VECINOS_8) {
        const cc = c + dc, ff = f + df; if (cc < 0 || ff < 0 || cc >= C || ff >= F) continue;
        const v = ff * C + cc; if (cerrado[v] || !pasable(v)) continue;
        if (dc && df && (!pasable(f * C + cc) || !pasable(ff * C + c))) continue;          // sin cortar esquinas
        const nuevo = costeG[k] + (peso === 4 ? Math.round(nodoCoste[v] * 1.4) : nodoCoste[v]);
        if (costeG[v] >= 0 && nuevo >= costeG[v]) continue;
        costeG[v] = nuevo; padre[v] = k; meter([nuevo + heuristica(v), v]);
      }
    }
    if (!cerrado[fin]) return [[destinoX, destinoY]];
    const nodos = []; for (let k = fin; k >= 0; k = padre[k]) nodos.push(k); nodos.reverse();
    // se tensa: desde cada punto, al más lejano que se vea en recta (sin bajar de HOLGURA_RECTA)
    const puntos = [[x0, y0]].concat(nodos.slice(1, -1).map(k => [nodoX(k), nodoY(k)]), [[destinoX, destinoY]]);
    const ruta = []; let actual = 0;
    while (actual < puntos.length - 1) {
      let siguiente = puntos.length - 1;
      while (siguiente > actual + 1 && !this.rectaLibre(puntos[actual][0], puntos[actual][1], puntos[siguiente][0], puntos[siguiente][1], HOLGURA_RECTA)) siguiente--;
      ruta.push(puntos[siguiente]); actual = siguiente;
    }
    return ruta;
  }
}
const PASO_VISION = 1, PASO_TRAYECTORIA = 1.5;   // m entre comprobaciones de la línea de visión y de la trayectoria de una flecha
