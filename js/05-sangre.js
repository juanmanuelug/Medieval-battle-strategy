'use strict';
/* ---------- Suelo con sangre ----------
   Un canvas con la hierba de base sobre el que se acumulan las manchas; los renderizadores lo usan como textura y la
   actualizan solo cuando cambia (version). Las manchas, gotas, charcos y restos son permanentes; las partículas de sangre
   en el aire viven en el renderizador y al caer dejan una gota aquí. */
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
      if (m.tipo === 2) {
        // desde el relieve (2026-10-16) la forma la da pintarRelieve (sombreado y curvas de nivel reales): aquí solo un tono de
        // hierba algo más clara y seca, que se funde con el llano (antes, tres anillos con borde que parecían terrazas)
        c.save(); c.filter = 'blur(' + Math.round(2.5 * ppm) + 'px)'; trazar(m, 0.95); c.fillStyle = nieve ? '#f2f5f8' : '#72903c'; c.globalAlpha = 0.85; c.fill(); c.restore();
      } else {
        // suelo de bosque (2026-10-16): borde difuminado y hojarasca; las sombras de las copas las pone el renderizador
        c.save(); c.filter = 'blur(' + Math.round(1.2 * ppm) + 'px)'; trazar(m, 1.02); c.fillStyle = nieve ? '#4a5e48' : '#3b5626'; c.fill(); c.restore();
        const azar = crearAleatorio(Math.round(m.x * 31 + m.y * 17)), area = Math.PI * m.r * m.r;
        for (let k = 0; k < area * 0.6; k++) {
          const a = azar.entre(-Math.PI, Math.PI), r = Math.sqrt(azar.numero()) * terreno.radioEn(m, a) * 0.95;
          c.globalAlpha = 0.35; c.fillStyle = nieve ? (azar.numero() < 0.5 ? '#dfe6ec' : '#6a7a62') : (azar.numero() < 0.4 ? '#5a4a26' : azar.numero() < 0.6 ? '#2c4019' : '#4b6a2c');
          c.fillRect((m.x + Math.cos(a) * r) * ppm, (m.y + Math.sin(a) * r) * ppm, (0.15 + azar.numero() * 0.3) * ppm, (0.1 + azar.numero() * 0.2) * ppm);
        }
        c.globalAlpha = 1;
      }
    }
    // río (2026-10-13): franja de agua con orillas y vados de grava; con nieve, el agua se ve más fría
    if (terreno.rio) {
      const rio = terreno.rio, franja = (anchoExtra, color) => { c.beginPath(); for (let y = 0; y <= CAMPO.alto; y += 2) c.lineTo((rio.centroX(y) - rio.ancho / 2 - anchoExtra) * ppm, y * ppm); for (let y = CAMPO.alto; y >= 0; y -= 2) c.lineTo((rio.centroX(y) + rio.ancho / 2 + anchoExtra) * ppm, y * ppm); c.closePath(); c.fillStyle = color; c.fill(); };
      franja(1.2, nieve ? '#9aa6ae' : '#7a6a42');           // orillas
      franja(0, nieve ? '#5f86a8' : '#3f6f9a');             // agua
      franja(-rio.ancho * 0.3, nieve ? '#7aa0be' : '#4f84ad');
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
    }
    this.version++;
  }
  /* Relieve (2026-10-16): sombreado según la pendiente (luz de arriba a la izquierda de la pantalla; con la vista girada del
     jugador de la derecha, desde el otro lado para que se vea igual) y curvas de nivel cada EQUIDISTANCIA m, a partir de
     terreno.alturaEn. Se calcula a RESOLUCION px/m en un lienzo aparte y se pinta encima del terreno, suavizado. */
  pintarRelieve(terreno, opciones) {
    if (!terreno || typeof terreno.alturaEn !== 'function') return;
    const RESOLUCION = 3, EQUIDISTANCIA = 1.5, GROSOR_CURVA = 0.3, nieve = !!(opciones && opciones.nieve), girada = !!(opciones && opciones.girada);
    const ancho = Math.ceil(CAMPO.ancho * RESOLUCION), alto = Math.ceil(CAMPO.alto * RESOLUCION);
    const alturas = new Float32Array(ancho * alto);
    let hayRelieve = false;
    for (let py = 0; py < alto; py++) for (let px = 0; px < ancho; px++) { const h = terreno.alturaEn((px + 0.5) / RESOLUCION, (py + 0.5) / RESOLUCION); alturas[py * ancho + px] = h; if (h > 0.05) hayRelieve = true; }
    if (!hayRelieve) return;
    // luz: hacia la izquierda y arriba de la pantalla (en el mundo, −x algo −y), y desde lo alto
    const signo = girada ? -1 : 1, lx = -0.62 * signo, ly = -0.2 * signo, lz = 0.76, largoLuz = Math.hypot(lx, ly, lz);
    const lienzo = document.createElement('canvas'); lienzo.width = ancho; lienzo.height = alto;
    const contexto = lienzo.getContext('2d'), imagen = contexto.createImageData(ancho, alto), datos = imagen.data;
    const claro = nieve ? [255, 255, 255] : [255, 244, 196], oscuro = nieve ? [70, 90, 115] : [24, 34, 12], linea = nieve ? [120, 140, 165] : [40, 58, 22];
    for (let py = 1; py < alto - 1; py++) for (let px = 1; px < ancho - 1; px++) {
      const i = py * ancho + px, h = alturas[i];
      const gx = (alturas[i + 1] - alturas[i - 1]) * RESOLUCION / 2, gy = (alturas[i + ancho] - alturas[i - ancho]) * RESOLUCION / 2;
      const largo = Math.hypot(gx, gy, 1), luz = (-gx * lx - gy * ly + lz) / (largo * largoLuz) - lz / largoLuz;
      const k = i * 4;
      let r = claro[0], g = claro[1], b = claro[2], a = Math.min(95, luz * 330);
      if (luz < 0) { r = oscuro[0]; g = oscuro[1]; b = oscuro[2]; a = Math.min(165, -luz * 480); }
      // curva de nivel suave: opacidad según la distancia (en metros, por la pendiente) a la cota más cercana múltiplo de
      // EQUIDISTANCIA; así sale una línea fina y difuminada en vez de un escalón de píxeles
      if (h > 0.2) {
        const fraccion = h / EQUIDISTANCIA - Math.floor(h / EQUIDISTANCIA), pendiente = Math.max(0.02, Math.hypot(gx, gy));
        const metros = Math.min(fraccion, 1 - fraccion) * EQUIDISTANCIA / pendiente, intensidad = Math.max(0, 1 - metros / GROSOR_CURVA);
        if (intensidad > 0) { const mezcla = intensidad * 0.55; r = r * (1 - mezcla) + linea[0] * mezcla; g = g * (1 - mezcla) + linea[1] * mezcla; b = b * (1 - mezcla) + linea[2] * mezcla; a = Math.max(a, intensidad * 55); }
      }
      datos[k] = r; datos[k + 1] = g; datos[k + 2] = b; datos[k + 3] = a;
    }
    contexto.putImageData(imagen, 0, 0);
    const c = this.contexto; c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(lienzo, 0, 0, this.canvas.width, this.canvas.height); c.restore();
    this.version++;
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
    const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');
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
