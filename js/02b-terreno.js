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
const TERRENO = { LLANO: 0, BOSQUE: 1, COLINA: 2, AGUA: 3, VADO: 4 };
const NOMBRE_TERRENO = ['llano', 'bosque', 'colina', 'río', 'vado'];
// freno a la marcha según el terreno (llano, bosque, colina, agua, vado)
const FRENO_TERRENO = [1, 0.7, 1, 0.35, 0.65];
const TIPOS_MAPA = {
  mixto: { nombre: 'Campo variado', descripcion: 'Bosques y colinas repartidos por el campo.', bosques: [6, 11], colinas: [4, 8], peso: 30 },
  abierto: { nombre: 'Campo abierto', descripcion: 'Llanura casi despejada: manda la caballería.', bosques: [1, 3], colinas: [1, 2], peso: 15 },
  bosque: { nombre: 'Bosque cerrado', descripcion: 'Mucho bosque, también en el centro: se pelea entre los árboles, sin cargas y con poca puntería.', bosques: [16, 22], colinas: [1, 3], radioBosque: [14, 30], bosqueEnElCentro: true, peso: 15 },
  colinas: { nombre: 'Tierra de colinas', descripcion: 'Muchas colinas grandes: quien gane las alturas tiene ventaja.', bosques: [3, 5], colinas: [10, 14], radioColina: [22, 40], peso: 15 },
  valle: { nombre: 'Valle', descripcion: 'Dos cordilleras a lo largo de los bordes y un valle llano en medio.', bosques: [3, 6], colinas: [0, 0], cordilleras: true, peso: 13 },
  rio: { nombre: 'Río con vados', descripcion: 'Un río cruza el campo entre los dos ejércitos: el agua frena muchísimo y no deja cargar; los vados son el paso.', bosques: [4, 7], colinas: [2, 4], rio: true, peso: 12 },
};
function mapaDesdeSemilla(semilla) {
  const azar = crearAleatorio(semilla + 23), total = Object.values(TIPOS_MAPA).reduce((s, m) => s + m.peso, 0);
  let r = azar.numero() * total;
  for (const [clave, m] of Object.entries(TIPOS_MAPA)) { r -= m.peso; if (r <= 0) return clave; }
  return 'mixto';
}
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
      const amplitud = azar.entre(12, 26), frecuencia = azar.entre(0.012, 0.022), fase = azar.entre(0, Math.PI * 2), anchoRio = azar.entre(10, 14);
      const centroX = y => CAMPO.ancho / 2 + amplitud * Math.sin(y * frecuencia + fase);
      const cuantosVados = azar.entero(2, 3), vados = [];
      for (let k = 0; k < cuantosVados; k++) vados.push((k + 0.5) / cuantosVados * CAMPO.alto + azar.entre(-25, 25));
      this.rio = { centroX, ancho: anchoRio, vados, anchoVado: 9 };
    }
    for (let fila = 0; fila < this.filas; fila++) for (let col = 0; col < this.columnas; col++) this.celdas[fila * this.columnas + col] = this.tipoDesdeManchas(col * o.celda, fila * o.celda);
  }
  radioEn(mancha, angulo) {
    const n = mancha.lobulos.length, t = ((angulo + Math.PI) / (2 * Math.PI)) * n;
    const i = Math.floor(t) % n, j = (i + 1) % n, f = t - Math.floor(t);
    return mancha.r * (mancha.lobulos[i] * (1 - f) + mancha.lobulos[j] * f);
  }
  dentro(mancha, x, y) { const d = distancia(x, y, mancha.x, mancha.y); return d <= this.radioEn(mancha, Math.atan2(y - mancha.y, x - mancha.x)); }
  tipoDesdeManchas(x, y) {
    let tipo = TERRENO.LLANO;
    for (const m of this.manchas) if (this.dentro(m, x, y)) tipo = m.tipo;   // el bosque (último) pisa a la colina
    // el río pisa a todo; en los vados, vado
    if (this.rio && Math.abs(x - this.rio.centroX(y)) <= this.rio.ancho / 2) tipo = this.rio.vados.some(v => Math.abs(y - v) <= this.rio.anchoVado / 2) ? TERRENO.VADO : TERRENO.AGUA;
    return tipo;
  }
  tipoEn(x, y) {
    const col = limitar(Math.round(x / this.celda), 0, this.columnas - 1), fila = limitar(Math.round(y / this.celda), 0, this.filas - 1);
    return this.celdas[fila * this.columnas + col];
  }
}
