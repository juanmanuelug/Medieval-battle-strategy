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
        for (const [factor, color] of (nieve ? [[1, '#eef2f6'], [0.72, '#f4f7fa'], [0.45, '#fafcfd']] : [[1, '#6f8c3a'], [0.72, '#7a9842'], [0.45, '#86a34a']])) { trazar(m, factor); c.fillStyle = color; c.fill(); c.strokeStyle = nieve ? '#b8c4d0' : '#5a7330'; c.lineWidth = 1.5; c.stroke(); }
      } else { trazar(m, 1); c.fillStyle = nieve ? '#4a5e48' : '#3e5a28'; c.fill(); }
    }
    // río (2026-10-13): franja de agua con orillas y vados de grava; con nieve, el agua se ve más fría
    if (terreno.rio) {
      const rio = terreno.rio, franja = (anchoExtra, color) => { c.beginPath(); for (let y = 0; y <= CAMPO.alto; y += 2) c.lineTo((rio.centroX(y) - rio.ancho / 2 - anchoExtra) * ppm, y * ppm); for (let y = CAMPO.alto; y >= 0; y -= 2) c.lineTo((rio.centroX(y) + rio.ancho / 2 + anchoExtra) * ppm, y * ppm); c.closePath(); c.fillStyle = color; c.fill(); };
      franja(1.2, nieve ? '#9aa6ae' : '#7a6a42');           // orillas
      franja(0, nieve ? '#5f86a8' : '#3f6f9a');             // agua
      franja(-rio.ancho * 0.3, nieve ? '#7aa0be' : '#4f84ad');
      for (const v of rio.vados) {
        c.beginPath(); for (let y = v - rio.anchoVado / 2; y <= v + rio.anchoVado / 2; y += 1) c.lineTo((rio.centroX(y) - rio.ancho / 2 - 0.5) * ppm, y * ppm); for (let y = v + rio.anchoVado / 2; y >= v - rio.anchoVado / 2; y -= 1) c.lineTo((rio.centroX(y) + rio.ancho / 2 + 0.5) * ppm, y * ppm); c.closePath();
        c.fillStyle = '#a89a72'; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
      }
    }
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
