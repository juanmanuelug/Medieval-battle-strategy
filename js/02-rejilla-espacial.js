'use strict';
/* ---------- Rejilla espacial ----------
   Listas enlazadas por celda sobre arrays tipados: sin reservar memoria por paso. Se reconstruye cada paso con los
   soldados vivos y responde "quién hay cerca de (x, y)" en tiempo constante por celda. */
class RejillaEspacial {
  constructor(anchoMetros, altoMetros, tamanoCelda, maxElementos) {
    this.tamanoCelda = tamanoCelda;
    this.columnas = Math.ceil(anchoMetros / tamanoCelda) + 1;
    this.filas = Math.ceil(altoMetros / tamanoCelda) + 1;
    this.cabezas = new Int32Array(this.columnas * this.filas);
    this.siguiente = new Int32Array(maxElementos);
    this.celdaDe = new Int32Array(maxElementos);
    this.limpiar();
  }
  limpiar() { this.cabezas.fill(-1); }
  celda(x, y) {
    const columna = limitar(Math.floor(x / this.tamanoCelda), 0, this.columnas - 1);
    const fila = limitar(Math.floor(y / this.tamanoCelda), 0, this.filas - 1);
    return fila * this.columnas + columna;
  }
  insertar(indice, x, y) {
    const c = this.celda(x, y);
    this.celdaDe[indice] = c;
    this.siguiente[indice] = this.cabezas[c];
    this.cabezas[c] = indice;
  }
  // Escribe en `salida` los índices de las celdas que cubren el círculo (x, y, radio) y devuelve cuántos hay.
  // El orden es determinista (celdas de arriba abajo, elementos por orden de inserción inverso).
  vecinos(x, y, radio, salida) {
    const c0 = limitar(Math.floor((x - radio) / this.tamanoCelda), 0, this.columnas - 1);
    const c1 = limitar(Math.floor((x + radio) / this.tamanoCelda), 0, this.columnas - 1);
    const f0 = limitar(Math.floor((y - radio) / this.tamanoCelda), 0, this.filas - 1);
    const f1 = limitar(Math.floor((y + radio) / this.tamanoCelda), 0, this.filas - 1);
    let n = 0;
    for (let fila = f0; fila <= f1; fila++) {
      for (let columna = c0; columna <= c1; columna++) {
        let i = this.cabezas[fila * this.columnas + columna];
        while (i !== -1) { if (n < salida.length) salida[n++] = i; i = this.siguiente[i]; }
      }
    }
    return n;
  }
}
