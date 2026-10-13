'use strict';
/* ---------- Terreno: bosques y colinas que afectan al combate ----------
   Mapa de celdas de 2 m generado desde una semilla: manchas redondeadas de bosque (frena, protege de flechas, impide cargar)
   y de colina (los arqueros alcanzan más y se golpea con ventaja cuesta abajo). Se evita la zona de despliegue de ambos
   ejércitos. `tipoEn(x, y)` → 'llano' | 'bosque' | 'colina'. Las manchas también sirven al render y al minimapa. */
const TERRENO = { LLANO: 0, BOSQUE: 1, COLINA: 2 };
const NOMBRE_TERRENO = ['llano', 'bosque', 'colina'];
class Terreno {
  constructor(semilla, opciones) {
    // cantidades para el campo de 440 × 320 m (cuatro veces el de antes: 2-4 bosques y 1-3 colinas)
    const o = Object.assign({ bosques: [6, 11], colinas: [4, 8], celda: 2 }, opciones || {});
    this.celda = o.celda;
    this.columnas = Math.ceil(CAMPO.ancho / o.celda) + 1; this.filas = Math.ceil(CAMPO.alto / o.celda) + 1;
    this.celdas = new Uint8Array(this.columnas * this.filas);
    this.manchas = [];
    const azar = crearAleatorio(semilla);
    const frente = Math.round(CAMPO.ancho * FRENTE_DESPLIEGUE);
    const despliegue = [[frente, CAMPO.alto / 2], [CAMPO.ancho - frente, CAMPO.alto / 2]];
    const colocar = (tipo, cuantas, radioMin, radioMax) => {
      for (let m = 0; m < cuantas; m++) {
        let intentos = 0, x, y, r;
        do { x = azar.entre(25, CAMPO.ancho - 25); y = azar.entre(15, CAMPO.alto - 15); r = azar.entre(radioMin, radioMax); intentos++; }
        while (intentos < 30 && despliegue.some(([dx, dy]) => distancia(x, y, dx, dy) < r + 30));
        if (intentos >= 30) continue;
        // forma irregular: radio que varía con el ángulo
        const lobulos = Array.from({ length: 6 }, () => azar.entre(0.7, 1.25));
        this.manchas.push({ tipo, x, y, r, lobulos });
      }
    };
    colocar(TERRENO.COLINA, azar.entero(o.colinas[0], o.colinas[1]), 16, 32);
    colocar(TERRENO.BOSQUE, azar.entero(o.bosques[0], o.bosques[1]), 12, 24);
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
    return tipo;
  }
  tipoEn(x, y) {
    const col = limitar(Math.round(x / this.celda), 0, this.columnas - 1), fila = limitar(Math.round(y / this.celda), 0, this.filas - 1);
    return this.celdas[fila * this.columnas + col];
  }
}
