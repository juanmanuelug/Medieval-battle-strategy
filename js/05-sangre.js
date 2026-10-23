'use strict';
/* ---------- Suelo con sangre ----------
   Un canvas con la hierba de base sobre el que se acumulan las manchas; los renderizadores lo usan como textura y la
   actualizan solo cuando cambia (version). Las manchas, gotas, charcos y restos son permanentes; las partículas de sangre
   en el aire viven en el renderizador y al caer dejan una gota aquí. */
// caja [x0, y0, x1, y1] del tablero de un puente: de orilla a orilla (con 2 m de estribo a cada lado) y de su ancho
function puenteCaja(rio, puente) {
  let xMin = Infinity, xMax = -Infinity;
  for (let y = puente.y - puente.ancho / 2; y <= puente.y + puente.ancho / 2; y += 1) { const cx = rio.centroX(y); xMin = Math.min(xMin, cx - rio.ancho / 2); xMax = Math.max(xMax, cx + rio.ancho / 2); }
  return [xMin - 2, puente.y - puente.ancho / 2, xMax + 2, puente.y + puente.ancho / 2];
}
class LienzoSangre {
  constructor(anchoMetros, altoMetros, pixelesPorMetro) {
    this.pixelesPorMetro = pixelesPorMetro;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(anchoMetros * pixelesPorMetro);
    this.canvas.height = Math.ceil(altoMetros * pixelesPorMetro);
    this.contexto = this.canvas.getContext('2d');
    this.version = 0;
    this.pintarHierba();
  }
  pintarHierba() {
    const c = this.contexto, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = '#5c7a35'; c.fillRect(0, 0, w, h);
    // motas de hierba y tierra con un azar propio (solo estética, no afecta a la simulación)
    const azar = crearAleatorio(99);
    for (let k = 0; k < w * h / 60; k++) {
      c.fillStyle = azar.numero() < 0.5 ? '#66873b' : '#51702f';
      c.fillRect(azar.numero() * w, azar.numero() * h, 2 + azar.numero() * 3, 1 + azar.numero() * 2);
    }
    for (let k = 0; k < w * h / 900; k++) { c.fillStyle = '#7a6a3a'; c.globalAlpha = 0.25; c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, 4 + azar.numero() * 10, 2 + azar.numero() * 5, 0, 0, Math.PI * 2); c.fill(); }
    // caminos de tierra que cruzan el campo (curvas suaves) y calvas de hierba seca
    c.globalAlpha = 1;
    for (let camino = 0; camino < 2; camino++) {
      let x = azar.numero() * w, y = camino ? 0 : azar.numero() * h, ang = camino ? Math.PI / 2 : 0;
      c.strokeStyle = '#8a7a4a'; c.lineCap = 'round'; c.lineWidth = 10 + azar.numero() * 8; c.globalAlpha = 0.45; c.beginPath(); c.moveTo(x, y);
      for (let p = 0; p < 160; p++) { ang += (azar.numero() - 0.5) * 0.5; x += Math.cos(ang) * 30; y += Math.sin(ang) * 30; c.lineTo(x, y); if (x < -20 || y < -20 || x > w + 20 || y > h + 20) break; }
      c.stroke();
    }
    for (let k = 0; k < Math.round(w * h / 90000); k++) { c.fillStyle = '#8f9a4a'; c.globalAlpha = 0.22; c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, 30 + azar.numero() * 60, 15 + azar.numero() * 30, azar.numero() * Math.PI, 0, Math.PI * 2); c.fill(); }
    // matas de hierba
    c.strokeStyle = '#7fa04a'; c.lineWidth = 1; c.globalAlpha = 0.6;
    for (let k = 0; k < w * h / 700; k++) { const x = azar.numero() * w, y = azar.numero() * h; c.beginPath(); for (let h2 = 0; h2 < 3; h2++) { c.moveTo(x, y); c.lineTo(x + (h2 - 1) * 2, y - 3 - azar.numero() * 3); } c.stroke(); }
    c.globalAlpha = 1;
    this.version++;
  }
  // Colinas (más claras, con curvas de nivel) y bosques (suelo oscuro) según las manchas del terreno
  // nieve (2026-10-13): cubre la hierba de blanco con montones y huellas grises
  pintarNieve(azar) {
    const c = this.contexto, w = this.canvas.width, h = this.canvas.height, ppm = this.pixelesPorMetro;
    c.fillStyle = '#e6ecf1'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < Math.round(w * h / 9000); k++) { c.globalAlpha = 0.5; c.fillStyle = azar.numero() < 0.5 ? '#f6f8fb' : '#d6dee6'; c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, (2 + azar.numero() * 8) * ppm, (1 + azar.numero() * 4) * ppm, azar.numero() * Math.PI, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.18; c.fillStyle = '#7a8a5a';
    for (let k = 0; k < Math.round(w * h / 40000); k++) { c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, (0.5 + azar.numero() * 1.5) * ppm, (0.3 + azar.numero()) * ppm, 0, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; this.version++;
  }
  pintarTerreno(terreno, opciones) {
    if (!terreno) return;
    const c = this.contexto, ppm = this.pixelesPorMetro, nieve = !!(opciones && opciones.nieve);
    const trazar = (m, factor) => { c.beginPath(); for (let k = 0; k <= 48; k++) { const a = -Math.PI + k / 48 * 2 * Math.PI; const r = terreno.radioEn(m, a) * factor * ppm; const px = m.x * ppm + Math.cos(a) * r, py = m.y * ppm + Math.sin(a) * r; if (k === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); };
    for (const m of terreno.manchas) {
      if (m.tipo === TERRENO.COLINA) {
        // desde el relieve (2026-10-16) la forma la da pintarRelieve (sombreado y curvas de nivel reales): aquí solo un tono de
        // hierba algo más clara y seca, que se funde con el llano (antes, tres anillos con borde que parecían terrazas)
        c.save(); c.filter = 'blur(' + Math.round(2.5 * ppm) + 'px)'; trazar(m, 0.95); c.fillStyle = nieve ? '#f2f5f8' : '#72903c'; c.globalAlpha = 0.85; c.fill(); c.restore();
      } else {
        // suelo de bosque (2026-10-16): borde difuminado y hojarasca; las sombras de las copas las pone el renderizador
        c.save(); c.filter = 'blur(' + Math.round(1.2 * ppm) + 'px)'; trazar(m, 1.02); c.fillStyle = nieve ? '#4a5e48' : '#3b5626'; c.fill(); c.restore();
        const azar = crearAleatorio(Math.round(m.x * 31 + m.y * 17)), area = Math.PI * m.r * m.r;
        for (let k = 0; k < area * 0.6; k++) {
          const [px, py] = terreno.puntoAlAzarEnMancha(m, azar, 0.95);
          c.globalAlpha = 0.35; c.fillStyle = nieve ? (azar.numero() < 0.5 ? '#dfe6ec' : '#6a7a62') : (azar.numero() < 0.4 ? '#5a4a26' : azar.numero() < 0.6 ? '#2c4019' : '#4b6a2c');
          c.fillRect(px * ppm, py * ppm, (0.15 + azar.numero() * 0.3) * ppm, (0.1 + azar.numero() * 0.2) * ppm);
        }
        c.globalAlpha = 1;
      }
    }
    // caminos (fase 3 del terreno, 2026-10-20): tierra apisonada con el borde difuminado, dos roderas y piedrecitas; con nieve,
    // nieve pisada y sucia. Los senderos, más estrechos y claros, sin roderas. Antes que el río: el agua y los vados van encima
    for (const camino of terreno.caminos || []) {
      const puntos = camino.puntos, ancho = camino.ancho;
      const linea = (desplazamiento, grosor, color, alfa) => {
        c.beginPath();
        puntos.forEach(([x, y], k) => {
          const [ax, ay] = puntos[Math.max(0, k - 1)], [bx, by] = puntos[Math.min(puntos.length - 1, k + 1)], largo = Math.hypot(bx - ax, by - ay) || 1;
          const px = (x - (by - ay) / largo * desplazamiento) * ppm, py = (y + (bx - ax) / largo * desplazamiento) * ppm;
          if (k) c.lineTo(px, py); else c.moveTo(px, py);
        });
        c.lineWidth = grosor * ppm; c.strokeStyle = color; c.globalAlpha = alfa; c.stroke();
      };
      c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
      c.filter = 'blur(' + Math.max(1, Math.round(0.5 * ppm)) + 'px)';
      linea(0, ancho + 1.4, nieve ? '#b9b3a6' : '#6e6040', 0.55);                                   // borde pisado
      linea(0, ancho, camino.sendero ? (nieve ? '#d6d0c4' : '#94825a') : (nieve ? '#c8c0b0' : '#8a7550'), 0.95);
      c.filter = 'none';
      if (!camino.sendero) for (const lado of [-1, 1]) linea(lado * ancho * 0.22, 0.45, nieve ? '#a39a88' : '#6b5a3a', 0.6);   // roderas
      linea(0, ancho * 0.35, nieve ? '#d8d2c6' : '#9b8660', 0.35);                                     // el centro, más seco
      c.restore();
      const azar = crearAleatorio(Math.round(puntos[0][1] * 131) + puntos.length);
      for (let s = 0; s < puntos.length - 1; s++) {
        const [ax, ay] = puntos[s], [bx, by] = puntos[s + 1], largo = Math.hypot(bx - ax, by - ay);
        for (let k = 0; k < largo * ancho * 0.25; k++) {
          const u = azar.numero(), lado = azar.entre(-0.45, 0.45) * ancho, x = ax + (bx - ax) * u - (by - ay) / (largo || 1) * lado, y = ay + (by - ay) * u + (bx - ax) / (largo || 1) * lado;
          c.globalAlpha = 0.6; c.fillStyle = nieve ? '#8d8a84' : (azar.numero() < 0.5 ? '#6f6450' : '#a39274');
          c.fillRect(x * ppm, y * ppm, azar.entre(0.06, 0.16) * ppm, azar.entre(0.05, 0.12) * ppm);
        }
      }
      c.globalAlpha = 1;
    }
    // río (2026-10-13): franja de agua con orillas y vados de grava; con nieve, el agua se ve más fría
    if (terreno.rio) {
      const rio = terreno.rio, franja = (anchoExtra, color) => { c.beginPath(); for (let y = 0; y <= CAMPO.alto; y += 2) c.lineTo((rio.centroX(y) - rio.ancho / 2 - anchoExtra) * ppm, y * ppm); for (let y = CAMPO.alto; y >= 0; y -= 2) c.lineTo((rio.centroX(y) + rio.ancho / 2 + anchoExtra) * ppm, y * ppm); c.closePath(); c.fillStyle = color; c.fill(); };
      franja(1.2, nieve ? '#9aa6ae' : '#7a6a42');           // orillas
      franja(0, nieve ? '#5f86a8' : '#3f6f9a');             // agua
      franja(-rio.ancho * 0.3, nieve ? '#7aa0be' : '#4f84ad');
      // río profundo (fase A de los pasos): el centro del cauce, oscuro, para que se vea que no se cruza (los vados se pintan encima)
      if (rio.profundo) { franja(-rio.ancho * 0.18, nieve ? '#3d5f7e' : '#1f4a70'); franja(-rio.ancho * 0.34, nieve ? '#2f4f6c' : '#173a5a'); }
      /* vados (2026-10-16, pedido del usuario: «más detalle, piedras y color de tierra mojada»): tierra mojada de borde
         difuminado, zonas más oscuras y encharcadas a lo largo de la corriente, charcos que reflejan el cielo y muchos guijarros
         con su brillo; las piedras grandes, con espuma, las pone el renderizador encima */
      for (const v of rio.vados) {
        const contorno = (sobra, recorte) => { c.beginPath(); for (let y = v - rio.anchoVado / 2 + recorte; y <= v + rio.anchoVado / 2 - recorte; y += 0.5) c.lineTo((rio.centroX(y) - rio.ancho / 2 - sobra) * ppm, y * ppm); for (let y = v + rio.anchoVado / 2 - recorte; y >= v - rio.anchoVado / 2 + recorte; y -= 0.5) c.lineTo((rio.centroX(y) + rio.ancho / 2 + sobra) * ppm, y * ppm); c.closePath(); };
        const azar = crearAleatorio(Math.round(v * 97) + 5), aleatorioEn = () => { const y = v + azar.entre(-0.5, 0.5) * rio.anchoVado * 0.92, x = rio.centroX(y) + azar.entre(-0.5, 0.5) * (rio.ancho + 0.6); return [x, y]; };
        c.save(); c.filter = 'blur(' + Math.round(0.6 * ppm) + 'px)';
        contorno(0.6, 0); c.fillStyle = nieve ? '#7c7a72' : '#6a5a40'; c.globalAlpha = 0.95; c.fill();                 // tierra mojada
        contorno(0.1, 1.2); c.fillStyle = nieve ? '#8f8c82' : '#7d6a4a'; c.globalAlpha = 0.6; c.fill();                 // centro algo más seco
        c.restore();
        // vetas oscuras y encharcadas a lo largo de la corriente
        for (let k = 0; k < 9; k++) { const [x, y] = aleatorioEn(); c.globalAlpha = 0.35; c.fillStyle = nieve ? '#5c6670' : '#4a3d2a'; c.beginPath(); c.ellipse(x * ppm, y * ppm, azar.entre(0.3, 0.7) * ppm, azar.entre(1.2, 2.6) * ppm, 0, 0, Math.PI * 2); c.fill(); }
        // charcos: agua quieta que refleja el cielo
        for (let k = 0; k < 6; k++) { const [x, y] = aleatorioEn(); const rx = azar.entre(0.5, 1.3), ry = azar.entre(0.35, 0.9); c.globalAlpha = 0.55; c.fillStyle = nieve ? '#9cb6c8' : '#5d7f98'; c.beginPath(); c.ellipse(x * ppm, y * ppm, rx * ppm, ry * ppm, azar.entre(0, Math.PI), 0, Math.PI * 2); c.fill(); c.globalAlpha = 0.35; c.fillStyle = '#c8dce8'; c.beginPath(); c.ellipse((x - rx * 0.3) * ppm, (y - ry * 0.3) * ppm, rx * 0.35 * ppm, ry * 0.25 * ppm, 0, 0, Math.PI * 2); c.fill(); }
        // guijarros: piedrecitas grises y pardas con contorno oscuro y un brillo
        const colores = nieve ? ['#8a8c90', '#a2a4a8', '#6e7074'] : ['#8a8478', '#9c9282', '#6f6a60', '#a59a84', '#7a705c'];
        for (let k = 0; k < Math.round(rio.anchoVado * rio.ancho * 2.2); k++) {
          const [x, y] = aleatorioEn(), radio = azar.entre(0.07, 0.22), giro = azar.entre(0, Math.PI);
          c.globalAlpha = 0.9; c.fillStyle = '#3a3226'; c.beginPath(); c.ellipse(x * ppm, y * ppm, (radio + 0.03) * ppm, (radio * 0.75 + 0.03) * ppm, giro, 0, Math.PI * 2); c.fill();
          c.fillStyle = colores[azar.entero(0, colores.length - 1)]; c.beginPath(); c.ellipse(x * ppm, y * ppm, radio * ppm, radio * 0.75 * ppm, giro, 0, Math.PI * 2); c.fill();
          c.globalAlpha = 0.6; c.fillStyle = '#e4e0d4'; c.beginPath(); c.ellipse((x - radio * 0.3) * ppm, (y - radio * 0.3) * ppm, radio * 0.3 * ppm, radio * 0.2 * ppm, giro, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
      }
      // puentes (fase 3 del terreno): tablero de tablones de lado a lado del cauce, con vigas en los bordes y barandillas con
      // postes; con nieve, nieve en los bordes. Se pinta aquí y el renderizador lo pone sobre el agua (mallaPuentes)
      for (const p of rio.puentes || []) {
        const caja = puenteCaja(rio, p), [x0, y0, x1, y1] = caja;
        c.save();
        c.fillStyle = '#2e2216'; c.globalAlpha = 0.9; c.fillRect((x0 - 0.3) * ppm, (y0 - 0.3) * ppm, (x1 - x0 + 0.6) * ppm, (y1 - y0 + 0.6) * ppm);   // sombra y contorno
        c.globalAlpha = 1; c.fillStyle = nieve ? '#8a7860' : '#7a5a36'; c.fillRect(x0 * ppm, y0 * ppm, (x1 - x0) * ppm, (y1 - y0) * ppm);
        const azar = crearAleatorio(Math.round(p.y * 53) + 7);
        for (let x = x0; x < x1; x += 0.45) {                                                               // tablones, de través
          c.fillStyle = azar.numero() < 0.5 ? (nieve ? '#9a876c' : '#8a6842') : (nieve ? '#7c6a52' : '#6c4e2e'); c.fillRect(x * ppm, (y0 + 0.6) * ppm, 0.4 * ppm, (y1 - y0 - 1.2) * ppm);
          c.fillStyle = '#3a2a1a'; c.globalAlpha = 0.5; c.fillRect((x + 0.4) * ppm, (y0 + 0.6) * ppm, 0.05 * ppm, (y1 - y0 - 1.2) * ppm); c.globalAlpha = 1;
        }
        for (const y of [y0, y1 - 0.6]) { c.fillStyle = '#4a3420'; c.fillRect(x0 * ppm, y * ppm, (x1 - x0) * ppm, 0.6 * ppm); }      // vigas de los bordes
        for (const y of [y0 + 0.15, y1 - 0.45]) for (let x = x0 + 0.2; x <= x1 - 0.2; x += 2.2) { c.fillStyle = '#2e2014'; c.fillRect((x - 0.15) * ppm, y * ppm, 0.3 * ppm, 0.3 * ppm); }   // postes
        if (nieve) { c.fillStyle = '#eef2f6'; c.globalAlpha = 0.8; for (const y of [y0 + 0.6, y1 - 1.0]) c.fillRect(x0 * ppm, y * ppm, (x1 - x0) * ppm, 0.4 * ppm); }
        c.restore();
      }
    }
    this.version++;
  }
  /* Relieve (2026-10-16; con más detalle el mismo día, pedido del usuario: «parece un dibujo muy simple y en mapas nevados es
     difícil ver el relieve»). Solo dibujo: se pinta una vez sobre el suelo, a partir de terreno.alturaEn, en un lienzo aparte a
     RESOLUCION px/m que se escala con suavizado. Capas, de abajo arriba, mezcladas en cada píxel:
     1. color según la altura (cimas de hierba más seca y amarilla) y la pendiente (tierra en las laderas fuertes; con nieve,
        roca gris azulada, porque en lo empinado la nieve no cuaja), a manchas según un ruido;
     2. sombreado por la luz (arriba a la izquierda de la pantalla; con la vista girada, desde el otro lado) sobre una
        superficie con MICRORRELIEVE (ruido suave en dos escalas, más fuerte cuanto más alta la colina: las laderas dejan de
        parecer una cúpula lisa), oscurecimiento en el pie de las laderas (curvatura cóncava) y algo de luz en las crestas;
        con nieve, sombras azuladas y más fuertes, que es lo que deja ver el relieve sobre el blanco;
     3. curvas de nivel finas cada EQUIDISTANCIA m y una maestra más marcada cada CADA_MAESTRA;
     y después, encima, rocas y pedregal en las laderas fuertes y en lo alto (pintarRocas). */
  pintarRelieve(terreno, opciones) {
    if (!terreno || typeof terreno.alturaEn !== 'function') return;
    const RESOLUCION = 3, EQUIDISTANCIA = 1.5, CADA_MAESTRA = 3, GROSOR_CURVA = 0.28, MICRORRELIEVE = 0.22;
    const nieve = !!(opciones && opciones.nieve), girada = !!(opciones && opciones.girada);
    const ancho = Math.ceil(CAMPO.ancho * RESOLUCION), alto = Math.ceil(CAMPO.alto * RESOLUCION);
    const alturas = new Float32Array(ancho * alto);
    let hayRelieve = false, alturaMaxima = 0;
    for (let py = 0; py < alto; py++) for (let px = 0; px < ancho; px++) { const h = terreno.alturaEn((px + 0.5) / RESOLUCION, (py + 0.5) / RESOLUCION); alturas[py * ancho + px] = h; if (h > 0.05) hayRelieve = true; if (h > alturaMaxima) alturaMaxima = h; }
    if (!hayRelieve) return;
    /* campo suavizado (dos pasadas de caja de RADIO_SUAVIZADO px por eje, casi gaussiano): alturaEn interpola en celdas de 2 m y
       sus derivadas (pendiente, curvatura, sombreado) marcan el borde de cada celda; derivadas del suavizado, sin cuadrícula */
    const RADIO_SUAVIZADO = 4, suave = new Float32Array(alturas), temporal = new Float32Array(ancho * alto);
    const pasada = (origen, destino, paso, largo, cuantas) => {
      for (let linea = 0; linea < cuantas; linea++) {
        const base = paso === 1 ? linea * ancho : linea, saltoLinea = paso; let suma = 0, n = 0;
        for (let k = -RADIO_SUAVIZADO; k <= RADIO_SUAVIZADO; k++) if (k >= 0 && k < largo) { suma += origen[base + k * saltoLinea]; n++; }
        for (let k = 0; k < largo; k++) {
          destino[base + k * saltoLinea] = suma / n;
          const sale = k - RADIO_SUAVIZADO, entra = k + RADIO_SUAVIZADO + 1;
          if (sale >= 0) { suma -= origen[base + sale * saltoLinea]; n--; }
          if (entra < largo) { suma += origen[base + entra * saltoLinea]; n++; }
        }
      }
    };
    for (let vez = 0; vez < 2; vez++) { pasada(suave, temporal, 1, ancho, alto); pasada(temporal, suave, ancho, alto, ancho); }
    // ruido de valor suave (rejilla de valores al azar interpolada con smoothstep), en metros del mundo
    const ruido = (semilla, lado) => {
      const azar = crearAleatorio(semilla), columnas = Math.ceil(CAMPO.ancho / lado) + 2, filas = Math.ceil(CAMPO.alto / lado) + 2, valores = new Float32Array(columnas * filas);
      for (let k = 0; k < valores.length; k++) valores[k] = azar.entre(-1, 1);
      return (x, y) => {
        const fx = x / lado, fy = y / lado, c0 = Math.floor(fx), f0 = Math.floor(fy); let tx = fx - c0, ty = fy - f0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const i = f0 * columnas + c0;
        return (valores[i] * (1 - tx) + valores[i + 1] * tx) * (1 - ty) + (valores[i + columnas] * (1 - tx) + valores[i + columnas + 1] * tx) * ty;
      };
    };
    const ruidoGrande = ruido(71, 9), ruidoFino = ruido(72, 3.2), ruidoManchas = ruido(73, 4.5);
    // superficie con microrrelieve para el sombreado (las curvas de nivel y el color siguen la altura real)
    // (2026-10-19, mapa rápido) el ruido de las manchas se calcula en el bucle principal, solo en los píxeles que se pintan
    const detalle = new Float32Array(ancho * alto);
    for (let py = 0; py < alto; py++) for (let px = 0; px < ancho; px++) {
      const i = py * ancho + px, h = alturas[i], x = (px + 0.5) / RESOLUCION, y = (py + 0.5) / RESOLUCION;
      if (h <= 0.05) { detalle[i] = suave[i]; continue; }
      const peso = Math.min(1, h / 1.5);
      detalle[i] = suave[i] + MICRORRELIEVE * peso * peso * (0.65 * ruidoGrande(x, y) + 0.35 * ruidoFino(x, y));
    }
    const signo = girada ? -1 : 1, lx = -0.62 * signo, ly = -0.2 * signo, lz = 0.76, largoLuz = Math.hypot(lx, ly, lz);
    const lienzo = document.createElement('canvas'); lienzo.width = ancho; lienzo.height = alto;
    const contexto = lienzo.getContext('2d'), imagen = contexto.createImageData(ancho, alto), datos = imagen.data;
    const P = nieve
      ? { roca: [128, 134, 142], veta: [86, 92, 102], pieRoca: [60, 70, 86], claro: [255, 252, 240], maxClaro: 70, oscuro: [52, 72, 104], maxOscuro: 205, fuerzaSombra: 700, cima: [255, 255, 255], maxCima: 0.25, ladera: [118, 128, 140], maxLadera: 0.72, pie: [70, 92, 125], maxPie: 0.32, linea: [96, 116, 146], fuerzaLinea: 0.5 }
      : { roca: [150, 140, 122], veta: [96, 88, 74], pieRoca: [42, 40, 30], claro: [255, 246, 200], maxClaro: 110, oscuro: [20, 30, 8], maxOscuro: 185, fuerzaSombra: 720, cima: [176, 170, 86], maxCima: 0.34, ladera: [112, 92, 56], maxLadera: 0.5, pie: [24, 38, 14], maxPie: 0.28, linea: [40, 56, 22], fuerzaLinea: 0.32 };
    // mezcla «encima» de una capa (color, opacidad 0-1) sobre lo acumulado en r, g, b, a (a en 0-1)
    let r = 0, g = 0, b = 0, a = 0;
    const encima = (color, opacidad) => {
      if (opacidad <= 0) return;
      const nueva = opacidad + a * (1 - opacidad);
      r = (color[0] * opacidad + r * a * (1 - opacidad)) / nueva; g = (color[1] * opacidad + g * a * (1 - opacidad)) / nueva; b = (color[2] * opacidad + b * a * (1 - opacidad)) / nueva; a = nueva;
    };
    // (2026-10-19, mapa rápido) celdas de roca y sus vecinas: fuera de ellas, un píxel totalmente llano no lleva nada
    const C = terreno.columnas, F = terreno.filas, cercaDeRoca = new Uint8Array(C * F);
    if (terreno.riscos && terreno.riscos.length) for (let k = 0; k < C * F; k++) if (terreno.celdas[k] === TERRENO.RISCO) { cercaDeRoca[k] = 1; if (k % C > 0) cercaDeRoca[k - 1] = 1; if (k % C < C - 1) cercaDeRoca[k + 1] = 1; if (k >= C) cercaDeRoca[k - C] = 1; if (k < C * F - C) cercaDeRoca[k + C] = 1; }
    for (let py = 2; py < alto - 2; py++) for (let px = 2; px < ancho - 2; px++) {
      const i = py * ancho + px, h = alturas[i];
      r = g = b = a = 0;
      // píxel llano sin relieve en lo que miran las derivadas y lejos de la roca: sale transparente (se deja a 0, como saldría)
      const celdaX = Math.round((px + 0.5) / RESOLUCION / terreno.celda), celdaY = Math.round((py + 0.5) / RESOLUCION / terreno.celda);
      const celdaK = limitar(celdaY, 0, terreno.filas - 1) * terreno.columnas + limitar(celdaX, 0, terreno.columnas - 1);
      if (h === 0 && suave[i] === 0 && suave[i + 2] === 0 && suave[i - 2] === 0 && suave[i + 2 * ancho] === 0 && suave[i - 2 * ancho] === 0 && detalle[i + 1] === 0 && detalle[i - 1] === 0 && detalle[i + ancho] === 0 && detalle[i - ancho] === 0 && !cercaDeRoca[celdaK]) continue;
      const mancha = ruidoManchas((px + 0.5) / RESOLUCION, (py + 0.5) / RESOLUCION);
      // pendiente y curvatura del campo suavizado (con pasos de 2 px)
      const gxReal = (suave[i + 2] - suave[i - 2]) * RESOLUCION / 4, gyReal = (suave[i + 2 * ancho] - suave[i - 2 * ancho]) * RESOLUCION / 4;
      const pendiente = Math.hypot(gxReal, gyReal);
      const curvatura = (suave[i + 2] + suave[i - 2] + suave[i + 2 * ancho] + suave[i - 2 * ancho] - 4 * suave[i]) * RESOLUCION * RESOLUCION / 4;
      if (h > 0.05 || pendiente > 0.01) {
        // 1. color por altura y por pendiente, a manchas
        encima(P.cima, P.maxCima * limitar(h / Math.max(4, alturaMaxima * 0.85), 0, 1) * limitar(0.75 + mancha * 0.5, 0, 1));
        encima(P.ladera, P.maxLadera * limitar((pendiente - 0.1) / 0.14, 0, 1) * limitar(0.45 + mancha * 1.1, 0, 1));
        // pie de la ladera (cóncavo): algo más oscuro; cresta (convexa): se aclara en el sombreado
        if (curvatura > 0) encima(P.pie, P.maxPie * limitar(curvatura * 6, 0, 1));
      }
      // riscos (fase B de los pasos): roca con vetas por estratos (según la altura), nieve solo en lo alto y llano, y una franja
      // oscura al pie para que se lea dónde empieza la pared
      const enRoca = terreno.celdas[celdaK] === TERRENO.RISCO;
      if (enRoca) {
        encima(P.roca, 0.93);
        if ((h / 1.1) % 1 < 0.2) encima(P.veta, 0.6 * limitar(0.6 + mancha * 0.8, 0, 1));   // estratos
        if (Math.abs(mancha) < 0.04) encima(P.veta, 0.7);                                    // grietas
        if (nieve && pendiente < 0.7) encima([246, 248, 251], 0.8);
      } else if (terreno.riscos && terreno.riscos.length && celdaX > 0 && celdaY > 0 && celdaX < terreno.columnas - 1 && celdaY < terreno.filas - 1) {
        const C = terreno.columnas;
        if (terreno.celdas[celdaK + 1] === TERRENO.RISCO || terreno.celdas[celdaK - 1] === TERRENO.RISCO || terreno.celdas[celdaK + C] === TERRENO.RISCO || terreno.celdas[celdaK - C] === TERRENO.RISCO) encima(P.pieRoca, 0.22);
      }
      // 2. sombreado sobre la superficie con microrrelieve
      const gx = (detalle[i + 1] - detalle[i - 1]) * RESOLUCION / 2, gy = (detalle[i + ancho] - detalle[i - ancho]) * RESOLUCION / 2;
      const luz = (-gx * lx - gy * ly + lz) / (Math.hypot(gx, gy, 1) * largoLuz) - lz / largoLuz + (curvatura < 0 ? limitar(-curvatura * 0.8, 0, 0.05) : 0);
      if (luz > 0) encima(P.claro, Math.min(P.maxClaro, luz * 450) / 255);
      else encima(P.oscuro, Math.min(P.maxOscuro, -luz * P.fuerzaSombra) / 255 * (enRoca ? 0.6 : 1));   // en la roca, la sombra más suave (si no, la pared salía negra)
      // 3. curvas de nivel: opacidad según la distancia (en metros, por la pendiente) a la cota más cercana; la maestra, más gruesa
      if (h > 0.2 && !enRoca) {                    // (en la roca, las curvas se amontonarían)
        const cotas = h / EQUIDISTANCIA, cercana = Math.round(cotas), maestra = cercana % CADA_MAESTRA === 0;
        const metros = Math.abs(cotas - cercana) * EQUIDISTANCIA / Math.max(0.02, pendiente);
        const intensidad = Math.max(0, 1 - metros / (GROSOR_CURVA * (maestra ? 1.7 : 1)));
        if (intensidad > 0 && cercana > 0) encima(P.linea, intensidad * P.fuerzaLinea * (maestra ? 0.5 : 0.3));
      }
      const k = i * 4; datos[k] = r; datos[k + 1] = g; datos[k + 2] = b; datos[k + 3] = a * 255;
    }
    contexto.putImageData(imagen, 0, 0);
    const c = this.contexto; c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(lienzo, 0, 0, this.canvas.width, this.canvas.height); c.restore();
    this.pintarRocas(terreno, { nieve, lx, ly });
    this.version++;
  }
  /* Rocas y pedregal (2026-10-16): piedras sueltas donde la ladera es fuerte y en lo alto de las colinas grandes, con la sombra
     hacia abajo de la pendiente, el lado de la luz más claro y, con nieve, un casquete blanco; debajo de algunas, un reguero de
     pedregal cuesta abajo. Ni en el bosque ni en el agua. */
  pintarRocas(terreno, o) {
    const c = this.contexto, ppm = this.pixelesPorMetro, azar = crearAleatorio(4711), nieve = o.nieve;
    const colores = nieve ? ['#5e6874', '#6c7682', '#545e6a'] : ['#7a7264', '#867e6e', '#6a6254', '#8e8572'];
    const candidatos = Math.round(CAMPO.ancho * CAMPO.alto / 30);
    for (let k = 0; k < candidatos; k++) {
      const x = azar.entre(2, CAMPO.ancho - 2), y = azar.entre(2, CAMPO.alto - 2), suerte = azar.numero(), tamano = azar.entre(0.35, 0.85), giro = azar.entre(0, Math.PI);
      const h = terreno.alturaEn(x, y);
      const tipo = terreno.tipoEn(x, y); if (tipo === TERRENO.BOSQUE || tipo === TERRENO.AGUA || tipo === TERRENO.VADO || tipo === TERRENO.PROFUNDA || tipo === TERRENO.RISCO || tipo === TERRENO.CAMINO || tipo === TERRENO.PUENTE) continue;
      // al pie de los riscos (fase B), pedregal: piedras caídas a menos de 3,5 m de la roca
      const alPieDeRoca = terreno.profundidadRisco && terreno.riscos && terreno.riscos.length ? terreno.profundidadRisco(x, y) > -3.5 : false;
      if (h < 0.8 && !alPieDeRoca) continue;
      const px = terreno.pendienteEn ? terreno.pendienteEn(x, y, 1, 0) : 0, py = terreno.pendienteEn ? terreno.pendienteEn(x, y, 0, 1) : 0, pendiente = Math.hypot(px, py);
      const probabilidad = Math.min(1, Math.max(0, (pendiente - 0.15) / 0.1)) * 0.25 + (h > 5.5 ? 0.03 : 0) + (alPieDeRoca ? 0.6 : 0);
      if (suerte > probabilidad) continue;
      const bajada = pendiente > 0.001 ? [-px / pendiente, -py / pendiente] : [0, 1];     // hacia dónde baja la ladera
      const radio = tamano * (h > 5 && suerte < 0.05 ? 1.8 : 1);
      // reguero de pedregal cuesta abajo
      if (suerte < probabilidad * 0.35) {
        c.globalAlpha = nieve ? 0.35 : 0.3; c.fillStyle = nieve ? '#8892a0' : '#7a6c50';
        for (let p = 0; p < 7; p++) { const d = radio + azar.entre(0.2, 2.2), lado = azar.entre(-0.5, 0.5); c.beginPath(); c.ellipse((x + bajada[0] * d - bajada[1] * lado) * ppm, (y + bajada[1] * d + bajada[0] * lado) * ppm, azar.entre(0.06, 0.14) * ppm, azar.entre(0.05, 0.1) * ppm, 0, 0, Math.PI * 2); c.fill(); }
      }
      // sombra hacia abajo de la pendiente
      c.globalAlpha = nieve ? 0.4 : 0.45; c.fillStyle = nieve ? '#3c5070' : '#1e2410';
      c.beginPath(); c.ellipse((x + bajada[0] * radio * 0.45) * ppm, (y + bajada[1] * radio * 0.45) * ppm, radio * 1.05 * ppm, radio * 0.75 * ppm, giro, 0, Math.PI * 2); c.fill();
      // la piedra: polígono irregular con contorno, lado de la luz más claro y, con nieve, casquete blanco
      const puntos = [], lados = 5 + (k % 3);
      for (let q = 0; q < lados; q++) { const angulo = giro + q / lados * Math.PI * 2 + azar.entre(-0.25, 0.25), distanciaCentro = radio * azar.entre(0.6, 1.15); puntos.push([x + Math.cos(angulo) * distanciaCentro, y + Math.sin(angulo) * distanciaCentro * 0.8]); }
      const trazo = () => { c.beginPath(); puntos.forEach(([qx, qy], q) => q ? c.lineTo(qx * ppm, qy * ppm) : c.moveTo(qx * ppm, qy * ppm)); c.closePath(); };
      c.globalAlpha = 1; trazo(); c.fillStyle = colores[k % colores.length]; c.fill(); c.lineWidth = Math.max(1, 0.06 * ppm); c.strokeStyle = nieve ? '#4a5666' : '#3a3428'; c.stroke();
      c.save(); trazo(); c.clip();
      // cara a la luz algo más clara (media piedra, con borde recto) y la de la sombra más oscura: volumen sin brillo
      c.globalAlpha = 0.35; c.fillStyle = nieve ? '#a4adb8' : '#aca38c'; c.beginPath(); c.moveTo((x + o.ly * radio * 2) * ppm, (y - o.lx * radio * 2) * ppm); c.lineTo((x - o.ly * radio * 2) * ppm, (y + o.lx * radio * 2) * ppm); c.lineTo((x + o.lx * radio * 3 - o.ly * radio * 2) * ppm, (y + o.ly * radio * 3 + o.lx * radio * 2) * ppm); c.lineTo((x + o.lx * radio * 3 + o.ly * radio * 2) * ppm, (y + o.ly * radio * 3 - o.lx * radio * 2) * ppm); c.closePath(); c.fill();
      c.globalAlpha = 0.25; c.fillStyle = '#20242a'; c.beginPath(); c.moveTo((x + o.ly * radio * 2) * ppm, (y - o.lx * radio * 2) * ppm); c.lineTo((x - o.ly * radio * 2) * ppm, (y + o.lx * radio * 2) * ppm); c.lineTo((x - o.lx * radio * 3 - o.ly * radio * 2) * ppm, (y - o.ly * radio * 3 + o.lx * radio * 2) * ppm); c.lineTo((x - o.lx * radio * 3 + o.ly * radio * 2) * ppm, (y - o.ly * radio * 3 - o.lx * radio * 2) * ppm); c.closePath(); c.fill();
      if (nieve) { c.globalAlpha = 0.9; c.fillStyle = '#eef2f6'; c.beginPath(); c.ellipse((x + o.lx * radio * 0.3) * ppm, (y + o.ly * radio * 0.3 - radio * 0.3) * ppm, radio * 0.6 * ppm, radio * 0.3 * ppm, giro * 0.3, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    c.globalAlpha = 1;
  }
  // barro: charcos marrones repartidos por el campo (clima «barro» o «tormenta»)
  pintarBarro(azar) {
    const c = this.contexto, w = this.canvas.width, h = this.canvas.height, ppm = this.pixelesPorMetro;
    c.globalAlpha = 0.55; c.fillStyle = '#5a4630';
    for (let k = 0; k < Math.round(w * h / 14000); k++) { c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, (2 + azar.numero() * 6) * ppm, (1 + azar.numero() * 3) * ppm, azar.numero() * Math.PI, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 0.35; c.fillStyle = '#6e5a3c';
    for (let k = 0; k < 160; k++) { c.beginPath(); c.ellipse(azar.numero() * w, azar.numero() * h, (1 + azar.numero() * 3) * ppm, (0.5 + azar.numero() * 1.5) * ppm, azar.numero() * Math.PI, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; this.version++;
  }
  // gota pequeña (donde cae una salpicadura o el rastro de un herido)
  gota(x, y, tamanoMetros, oscura) {
    const c = this.contexto, ppm = this.pixelesPorMetro;
    c.globalAlpha = 0.7; c.fillStyle = oscura ? '#5e0b10' : '#8c1118';
    c.beginPath(); c.ellipse(x * ppm, y * ppm, Math.max(1, tamanoMetros * ppm), Math.max(1, tamanoMetros * ppm * 0.7), 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; this.version++;
  }
  // charco que crece bajo un cadáver: elipse oscura con borde más claro
  charco(x, y, radioMetros, azar) {
    const c = this.contexto, ppm = this.pixelesPorMetro;
    const px = x * ppm, py = y * ppm, r = radioMetros * ppm, giro = azar.entre(0, Math.PI);
    c.globalAlpha = 0.5; c.fillStyle = '#7a0f14'; c.beginPath(); c.ellipse(px, py, r * 1.15, r * 0.75, giro, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.7; c.fillStyle = '#5a0a0e'; c.beginPath(); c.ellipse(px, py, r * 0.85, r * 0.55, giro, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1; this.version++;
  }
  // resto en el campo: escudo, yelmo, espada, lanza o arco caídos junto a un muerto
  resto(x, y, tipo, color, colorSecundario, azar) {
    const c = this.contexto, ppm = this.pixelesPorMetro;
    const hex = enteroAHex;
    c.save(); c.translate(x * ppm, y * ppm); c.rotate(azar.entre(0, Math.PI * 2)); c.globalAlpha = 0.95;
    c.lineWidth = 1; c.strokeStyle = '#1a1410';
    if (tipo === 'escudo') {
      const w = 0.42 * ppm, h = 0.6 * ppm;
      c.fillStyle = hex(colorSecundario); c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2, h * 0.05); c.lineTo(0, h / 2); c.lineTo(-w / 2, h * 0.05); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = hex(color); c.fillRect(-w * 0.12, -h / 2, w * 0.24, h * 0.85);
    } else if (tipo === 'yelmo') {
      c.fillStyle = '#9a9aa6'; c.beginPath(); c.ellipse(0, 0, 0.22 * ppm, 0.2 * ppm, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#5e5e68'; c.fillRect(-0.03 * ppm, -0.02 * ppm, 0.06 * ppm, 0.18 * ppm);
    } else if (tipo === 'espada') {
      c.strokeStyle = '#8a8a96'; c.lineWidth = Math.max(1.5, 0.07 * ppm); c.beginPath(); c.moveTo(-0.45 * ppm, 0); c.lineTo(0.35 * ppm, 0); c.stroke();
      c.strokeStyle = '#8a7a3a'; c.lineWidth = Math.max(1.5, 0.06 * ppm); c.beginPath(); c.moveTo(-0.28 * ppm, -0.12 * ppm); c.lineTo(-0.28 * ppm, 0.12 * ppm); c.stroke();
    } else if (tipo === 'lanza') {
      c.strokeStyle = '#6b4a2a'; c.lineWidth = Math.max(1.5, 0.06 * ppm); c.beginPath(); c.moveTo(-1.1 * ppm, 0); c.lineTo(0.9 * ppm, 0); c.stroke();
      c.fillStyle = '#c9c9d2'; c.beginPath(); c.moveTo(0.85 * ppm, -0.06 * ppm); c.lineTo(1.15 * ppm, 0); c.lineTo(0.85 * ppm, 0.06 * ppm); c.closePath(); c.fill();
    } else if (tipo === 'arco') {
      c.strokeStyle = '#6b4a2a'; c.lineWidth = Math.max(1.5, 0.06 * ppm); c.beginPath(); c.arc(0, 0, 0.45 * ppm, -Math.PI / 2, Math.PI / 2); c.stroke();
      c.strokeStyle = '#e8e4d8'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -0.45 * ppm); c.lineTo(0, 0.45 * ppm); c.stroke();
    }
    c.restore(); this.version++;
  }
  // cráter de una piedra de mangonel (2026-10-14): tierra levantada, oscura en el centro y con terrones alrededor
  // cenizas de una celda de bosque quemada (flechas de fuego, 2026-10-21): tierra negra y ceniza gris, de borde irregular
  cenizas(x, y, azar) {
    const c = this.contexto, ppm = this.pixelesPorMetro;
    for (let k = 0; k < 4; k++) {
      c.globalAlpha = 0.5; c.fillStyle = k % 2 ? '#2a2420' : '#1c1814';
      c.beginPath(); c.ellipse((x + azar.entre(-0.8, 0.8)) * ppm, (y + azar.entre(-0.8, 0.8)) * ppm, azar.entre(0.9, 1.5) * ppm, azar.entre(0.7, 1.2) * ppm, azar.entre(0, Math.PI), 0, Math.PI * 2); c.fill();
    }
    for (let k = 0; k < 6; k++) { c.globalAlpha = 0.45; c.fillStyle = azar.numero() < 0.5 ? '#6a645c' : '#8a847a'; c.fillRect((x + azar.entre(-1.2, 1.2)) * ppm, (y + azar.entre(-1.2, 1.2)) * ppm, azar.entre(0.1, 0.3) * ppm, azar.entre(0.08, 0.2) * ppm); }
    c.globalAlpha = 1; this.version++;
  }
  crater(x, y, azar) {
    const c = this.contexto, ppm = this.pixelesPorMetro, px = x * ppm, py = y * ppm;
    c.globalAlpha = 0.85; c.fillStyle = '#4a3520'; c.beginPath(); c.ellipse(px, py, 1.1 * ppm, 0.75 * ppm, azar.entre(0, Math.PI), 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.9; c.fillStyle = '#2e2014'; c.beginPath(); c.ellipse(px, py, 0.55 * ppm, 0.38 * ppm, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.7; c.fillStyle = '#6a4e30';
    for (let k = 0; k < 9; k++) { const a = azar.entre(0, Math.PI * 2), r = azar.entre(0.9, 1.9) * ppm; c.beginPath(); c.ellipse(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.7, azar.entre(0.1, 0.25) * ppm, azar.entre(0.07, 0.16) * ppm, a, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; this.version++;
  }
  mancha(x, y, tamanoMetros, azar) {
    const c = this.contexto, ppm = this.pixelesPorMetro;
    const px = x * ppm, py = y * ppm, r = tamanoMetros * ppm;
    c.globalAlpha = 0.75;
    for (let k = 0; k < 4; k++) {
      c.fillStyle = k % 2 ? '#6e0d12' : '#8c1118';
      c.beginPath();
      c.ellipse(px + azar.entre(-r * 0.5, r * 0.5), py + azar.entre(-r * 0.5, r * 0.5), r * azar.entre(0.35, 0.8), r * azar.entre(0.25, 0.6), azar.entre(0, Math.PI), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    this.version++;
  }
}
