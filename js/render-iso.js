'use strict';
/* ---------- Renderizador 2D isométrico con PixiJS ----------
   Proyección isométrica clásica (2:1): el mundo (x, y) en metros pasa a pantalla con
     px = (x - y) · cos30 · ESCALA      py = (x + y) · sin30 · ESCALA − altura · ESCALA
   Cada soldado es un sprite pre-renderizado por equipo, tipo, dirección (8) y fotograma (quieto, cuatro pasos, tres fases de golpe, cadáver),
   con sombra aparte; los sprites se ordenan por profundidad (x + y). Animación sin esqueletos: el fotograma sale del estado
   de la simulación (distancia andada, reinicio del enfriamiento de ataque = golpe, tiempo desde la muerte = caída).
   El suelo con la sangre es el mismo canvas que en los otros renderizadores, puesto en isométrico con una matriz afín.
   Decoración (árboles, arbustos, rocas) alrededor y en los bordes del campo, ordenada en profundidad con los soldados.
   Entrada estilo RTS cuando el juego pasa `opciones.alOrden` (ver más abajo); si no, arrastrar desplaza. */
function crearRenderizadorIso(contenedor, sim, sangre, opciones) {
  const equipoPropio = opciones.equipoPropio || 0;   // bando del jugador en esta pantalla (en red puede ser el 1)
  // opciones: { texturasBandera: [canvas|null, canvas|null], alClic(x, y, boton, mod), alCaja(x0, y0, x1, y1, mod),
  //             alOrden(x, y, rumbo|null, mod), seleccion() → unidad|unidad[], cursor(x, y) → css }
  opciones = opciones || {};
  const app = new PIXI.Application({ resizeTo: contenedor, backgroundColor: 0x3f5a26, antialias: false, resolution: Math.min(window.devicePixelRatio, 1.5), autoDensity: true });
  contenedor.appendChild(app.view);
  const ESCALA = 10;
  const COS30 = Math.cos(Math.PI / 6), SIN30 = 0.5;
  /* Vista girada 180° para el jugador del bando derecho en red (2026-10-13): su ejército queda abajo a la izquierda, como el
     del jugador izquierdo. Se proyecta el punto simétrico (ancho − x, alto − y); la profundidad, las direcciones de los
     sprites, las flechas, el suelo y el clic se giran igual. */
  const girada = equipoPropio === 1;
  /* Relieve (2026-10-16): todo lo que se dibuja sobre el terreno sube con la altura del suelo en ese punto (terreno.alturaEn,
     solo visual: la simulación no la usa). aPantallaY suma esa altura a la que se le pase (la de un jinete en el aire, una
     flecha…), así que soldados, sombras, estandartes, alcances, auras y el propio suelo (una malla) siguen las colinas. */
  const alturaSuelo = opciones.terreno && typeof opciones.terreno.alturaEn === 'function' ? (x, y) => opciones.terreno.alturaEn(x, y) : () => 0;
  // altura máxima del relieve (más un margen), para empezar desde ahí el rayo de pantallaAMundo
  const alturaMaximaMapa = (() => { if (!opciones.terreno || typeof opciones.terreno.alturaEn !== 'function') return 0; opciones.terreno.alturaEn(0, 0); let maximo = 0; for (const h of opciones.terreno.alturas || []) if (h > maximo) maximo = h; return maximo + 0.5; })();
  const aPantallaX = girada ? (x, y) => ((CAMPO.ancho - x) - (CAMPO.alto - y)) * COS30 * ESCALA : (x, y) => (x - y) * COS30 * ESCALA;
  const aPantallaY = girada ? (x, y, altura) => (CAMPO.ancho + CAMPO.alto - x - y) * SIN30 * ESCALA - ((altura || 0) + alturaSuelo(x, y)) * ESCALA : (x, y, altura) => (x + y) * SIN30 * ESCALA - ((altura || 0) + alturaSuelo(x, y)) * ESCALA;
  const profundidad = girada ? (x, y) => CAMPO.ancho + CAMPO.alto - x - y : (x, y) => x + y;   // orden de dibujo: más abajo en pantalla, delante
  // unidades ocultas (en red, el rival mientras se despliega)
  const oculto = equipo => !!(opciones && opciones.oculto && opciones.oculto(equipo));
  const mundo = new PIXI.Container(); app.stage.addChild(mundo);
  const capaSuelo = new PIXI.Container(), capaSombras = new PIXI.Container(), capaEscena = new PIXI.Container();
  capaEscena.sortableChildren = true;
  mundo.addChild(capaSuelo, capaSombras, capaEscena);

  // suelo: el canvas de hierba y sangre, proyectado con una matriz afín
  // zona de despliegue (fase previa): rectángulo translúcido sobre el suelo
  const zonaGrafico = new PIXI.Graphics(); zonaGrafico.visible = false;
  function mostrarZona(zona) {
    zonaGrafico.clear(); zonaGrafico.visible = !!zona; if (!zona) return;
    // el contorno se subdivide cada 4 m para que siga el relieve (2026-10-16)
    const vertices = [[zona.x0, zona.y0], [zona.x1, zona.y0], [zona.x1, zona.y1], [zona.x0, zona.y1]], esquinas = [];
    vertices.forEach(([xa, ya], k) => { const [xb, yb] = vertices[(k + 1) % 4], pasos = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 4)); for (let p = 0; p < pasos; p++) { const x = xa + (xb - xa) * p / pasos, y = ya + (yb - ya) * p / pasos; esquinas.push([aPantallaX(x, y), aPantallaY(x, y)]); } });
    zonaGrafico.lineStyle(3, 0xffd54a, 0.95).beginFill(0xffd54a, 0.16).drawPolygon(esquinas.flat()).endFill();
  }
  const texturaSuelo = PIXI.Texture.from(sangre.canvas);
  let versionSuelo = sangre.version, ultimaSubidaSuelo = -1;
  // suelo con relieve (2026-10-16): malla de PASO_MALLA_SUELO m cuyos vértices se proyectan con su altura; la textura es el mismo
  // canvas de hierba, terreno y sangre (antes, un sprite plano con una matriz afín)
  const PASO_MALLA_SUELO = 2;
  const suelo = (() => {
    const columnas = Math.ceil(CAMPO.ancho / PASO_MALLA_SUELO) + 1, filas = Math.ceil(CAMPO.alto / PASO_MALLA_SUELO) + 1;
    const vertices = new Float32Array(columnas * filas * 2), uvs = new Float32Array(columnas * filas * 2), indices = new Uint16Array((columnas - 1) * (filas - 1) * 6);   // 35 581 vértices: caben en 16 bits (WebGL 1 sin extensiones)
    const anchoTextura = sangre.canvas.width / sangre.pixelesPorMetro, altoTextura = sangre.canvas.height / sangre.pixelesPorMetro;
    for (let fila = 0; fila < filas; fila++) for (let col = 0; col < columnas; col++) {
      const x = Math.min(CAMPO.ancho, col * PASO_MALLA_SUELO), y = Math.min(CAMPO.alto, fila * PASO_MALLA_SUELO), k = (fila * columnas + col) * 2;
      vertices[k] = aPantallaX(x, y); vertices[k + 1] = aPantallaY(x, y);
      uvs[k] = x / anchoTextura; uvs[k + 1] = y / altoTextura;
    }
    let p = 0;
    for (let fila = 0; fila < filas - 1; fila++) for (let col = 0; col < columnas - 1; col++) {
      const a = fila * columnas + col, b = a + 1, c = a + columnas, d = c + 1;
      indices[p++] = a; indices[p++] = b; indices[p++] = c; indices[p++] = b; indices[p++] = d; indices[p++] = c;
    }
    return new PIXI.Mesh(new PIXI.MeshGeometry(vertices, uvs, indices), new PIXI.MeshMaterial(texturaSuelo));
  })();
  const destinosGrafico = new PIXI.Graphics();          // destinos de las unidades propias (Alt sin selección)
  const alcancesGrafico = new PIXI.Graphics();          // alcance de tiro: tiradores propios seleccionados y enemigo bajo el ratón
  /* Río que corre (2026-10-16): dos capas de ondas semitransparentes sobre el cauce (el agua de fondo ya está pintada en el
     suelo), en una malla que sigue el río de punta a punta, a NIVEL_AGUA m sobre el plano; las texturas se repiten a lo largo
     del cauce y se desplazan a distinta velocidad (las coordenadas de textura se mueven cada fotograma), así el agua fluye. */
  const capasRio = [];
  if (opciones.terreno && opciones.terreno.rio) {
    const rio = opciones.terreno.rio, NIVEL_AGUA = -0.25, PASO = 2, conNieveRio = !!(opciones.clima && opciones.clima.nieve);
    const texturaOndas = (semilla, claridad, rayas) => {
      const lado = 128, lienzo = document.createElement('canvas'); lienzo.width = lienzo.height = lado;
      const c = lienzo.getContext('2d'), azar = crearAleatorio(semilla);
      c.lineCap = 'round';
      for (let k = 0; k < rayas; k++) {
        const y0 = azar.entre(0, lado), largo = azar.entre(18, 60), x0 = azar.entre(0, lado), curva = azar.entre(-4, 4);
        c.strokeStyle = 'rgba(' + claridad + ',' + azar.entre(0.18, 0.42).toFixed(2) + ')'; c.lineWidth = azar.entre(1.2, 2.6);
        for (const desplazado of [-lado, 0, lado]) { c.beginPath(); c.moveTo(x0 + desplazado, y0); c.quadraticCurveTo(x0 + largo / 2 + desplazado, y0 + curva, x0 + largo + desplazado, y0); c.stroke(); }
      }
      const base = new PIXI.BaseTexture(lienzo, { wrapMode: PIXI.WRAP_MODES.REPEAT, scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.ON });
      return new PIXI.Texture(base);
    };
    const filas = Math.ceil((CAMPO.alto + 8) / PASO) + 1, vertices = new Float32Array(filas * 2 * 2), listaIndices = [];
    for (let f = 0; f < filas; f++) {
      const y = -4 + f * PASO, cx = rio.centroX(y), media = rio.ancho / 2 + 0.2;
      for (let lado = 0; lado < 2; lado++) { const x = cx + (lado ? media : -media), k = (f * 2 + lado) * 2; vertices[k] = aPantallaX(x, y); vertices[k + 1] = aPantallaY(x, y, NIVEL_AGUA - alturaSuelo(x, y)); }
    }
    // sin ondas sobre los vados: ahí el agua apenas cubre la grava (los vados llevan su propio dibujo)
    const enVado = y => rio.vados.some(v => Math.abs(y - v) < rio.anchoVado / 2 - 0.8);
    for (let f = 0; f < filas - 1; f++) { const a = f * 2; if (enVado(-4 + (f + 0.5) * PASO)) continue; listaIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const indices = new Uint16Array(listaIndices);
    for (const capa of [{ semilla: 5, claridad: conNieveRio ? '235,245,252' : '200,228,245', rayas: 26, metros: 5, velocidad: 1.1, alfa: 0.9 }, { semilla: 9, claridad: '255,255,255', rayas: 12, metros: 3.2, velocidad: 0.65, alfa: 0.55 }]) {
      const uvs = new Float32Array(filas * 2 * 2), base = new Float32Array(filas);
      for (let f = 0; f < filas; f++) { const y = -4 + f * PASO; base[f] = y / capa.metros; uvs[(f * 2) * 2] = 0; uvs[(f * 2 + 1) * 2] = rio.ancho / capa.metros; uvs[(f * 2) * 2 + 1] = uvs[(f * 2 + 1) * 2 + 1] = base[f]; }
      const malla = new PIXI.Mesh(new PIXI.MeshGeometry(vertices.slice(), uvs, indices), new PIXI.MeshMaterial(texturaOndas(capa.semilla, capa.claridad, capa.rayas)));
      malla.alpha = capa.alfa;
      capasRio.push({ malla, uvs, base, filas, velocidad: capa.velocidad / capa.metros, fase: 0 });
    }
  }
  /* piedras grandes en los vados (2026-10-16): dibujadas en relieve (contorno, lado en sombra, brillo de mojado), sobre el
     agua y con una estela de espuma aguas abajo pintada en el suelo; ordenadas en profundidad con los soldados */
  if (opciones.terreno && opciones.terreno.rio) {
    const rio = opciones.terreno.rio, RESOLUCION_PIEDRA = 32;
    const dibujarPiedra = (azar, nieve) => {
      const S = RESOLUCION_PIEDRA, lienzo = document.createElement('canvas'); lienzo.width = Math.ceil(1.8 * S); lienzo.height = Math.ceil(1.3 * S);
      const c = lienzo.getContext('2d'), ax = lienzo.width / 2, ay = lienzo.height - 0.2 * S, puntos = [];
      const lados = 9; for (let k = 0; k < lados; k++) { const a = Math.PI + k / (lados - 1) * Math.PI, r = azar.entre(0.55, 0.8) * S; puntos.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r * azar.entre(0.7, 1.05)]); }
      const forma = () => { c.beginPath(); c.moveTo(puntos[0][0], ay); for (const [x, y] of puntos) c.lineTo(x, y); c.lineTo(puntos[puntos.length - 1][0], ay); c.closePath(); };
      c.lineJoin = 'round'; forma(); c.lineWidth = Math.max(2, 0.1 * S); c.strokeStyle = '#1e1a14'; c.stroke();
      c.fillStyle = nieve ? '#8e9296' : '#7a7468'; c.fill();
      c.save(); forma(); c.clip(); c.fillStyle = nieve ? '#6e7276' : '#5a554c'; c.fillRect(ax + 0.05 * S, 0, lienzo.width, lienzo.height);      // lado en sombra
      c.fillStyle = nieve ? '#f0f4f7' : '#a59c8a'; c.beginPath(); c.ellipse(ax - 0.2 * S, ay - 0.45 * S, 0.3 * S, 0.14 * S, -0.3, 0, Math.PI * 2); c.fill();   // cara de arriba
      c.globalAlpha = 0.7; c.fillStyle = '#eef2f4'; c.beginPath(); c.ellipse(ax - 0.28 * S, ay - 0.5 * S, 0.12 * S, 0.05 * S, -0.3, 0, Math.PI * 2); c.fill();   // brillo de mojado
      c.restore();
      const tx = new PIXI.Texture(new PIXI.BaseTexture(lienzo, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.ON })); tx.defaultAnchor.set(0.5, ay / lienzo.height); return tx;
    };
    const azarPiedras = crearAleatorio(321), conNievePiedras = !!(opciones.clima && opciones.clima.nieve);
    const texturasPiedra = [0, 1, 2, 3].map(() => dibujarPiedra(azarPiedras, conNievePiedras));
    const c = sangre.contexto, ppm = sangre.pixelesPorMetro;
    for (const v of rio.vados) {
      for (let k = 0; k < 9; k++) {
        const y = v + azarPiedras.entre(-0.45, 0.45) * rio.anchoVado, x = rio.centroX(y) + azarPiedras.entre(-0.45, 0.45) * rio.ancho, escala = azarPiedras.entre(0.45, 1.0);
        // espuma: estela clara aguas abajo (la corriente va hacia +y) y un anillo alrededor
        c.globalAlpha = 0.16; c.fillStyle = '#e8f0f2'; c.beginPath(); c.ellipse(x * ppm, (y + 0.7 * escala) * ppm, 0.28 * escala * ppm, 0.8 * escala * ppm, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.3; c.strokeStyle = '#f2f6f7'; c.lineWidth = Math.max(1, 0.07 * ppm); c.beginPath(); c.ellipse(x * ppm, y * ppm, 0.62 * escala * ppm, 0.45 * escala * ppm, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
        const s = new PIXI.Sprite(texturasPiedra[azarPiedras.entero(0, texturasPiedra.length - 1)]);
        s.scale.set(escala * ESCALA / RESOLUCION_PIEDRA); s.position.set(aPantallaX(x, y), aPantallaY(x, y, -0.25 - alturaSuelo(x, y) + 0.05)); s.zIndex = profundidad(x, y);
        capaEscena.addChild(s);
      }
    }
    sangre.version++;
  }
  function animarRio(dt) {
    for (const capa of capasRio) {
      capa.fase -= dt * capa.velocidad; if (capa.fase < -1000) capa.fase += 1000;
      for (let f = 0; f < capa.filas; f++) capa.uvs[(f * 2) * 2 + 1] = capa.uvs[(f * 2 + 1) * 2 + 1] = capa.base[f] + capa.fase;
      capa.malla.geometry.getBuffer('aTextureCoord').update();
    }
  }
  capaSuelo.addChild(suelo); for (const capa of capasRio) capaSuelo.addChild(capa.malla); capaSuelo.addChild(zonaGrafico); capaSuelo.addChild(alcancesGrafico); capaSuelo.addChild(destinosGrafico);
  /* Riscos que tapan (2026-10-19, lo vio el usuario: la infantería que pasaba detrás de un risco salía pintada encima, como
     subida a la roca). El suelo es una malla por debajo de todo; un risco de 10 m sube en pantalla por encima de lo que tiene
     detrás. Los triángulos de la malla sobre la roca (y su pie) se copian a la escena en franjas de profundidad de
     PASO_MALLA_SUELO, ordenadas con los soldados, los árboles y los estandartes: lo que está detrás queda tapado. Misma textura y
     mismos vértices que el suelo, así que se ven igual (sangre y huellas incluidas). */
  const mallasRoca = [];
  if (opciones.terreno && opciones.terreno.riscos && opciones.terreno.riscos.length) {
    const terreno = opciones.terreno, columnas = Math.ceil(CAMPO.ancho / PASO_MALLA_SUELO) + 1, filas = Math.ceil(CAMPO.alto / PASO_MALLA_SUELO) + 1;
    const anchoTextura = sangre.canvas.width / sangre.pixelesPorMetro, altoTextura = sangre.canvas.height / sangre.pixelesPorMetro;
    const puntoDe = (col, fila) => [Math.min(CAMPO.ancho, col * PASO_MALLA_SUELO), Math.min(CAMPO.alto, fila * PASO_MALLA_SUELO)];
    const sobreRoca = new Uint8Array(columnas * filas);
    for (let fila = 0; fila < filas; fila++) for (let col = 0; col < columnas; col++) { const [x, y] = puntoDe(col, fila); sobreRoca[fila * columnas + col] = terreno.profundidadRisco(x, y) > -1 ? 1 : 0; }
    const franjas = new Map();          // índice de franja → { vertices, uvs, indices, cuantos }
    for (let fila = 0; fila < filas - 1; fila++) for (let col = 0; col < columnas - 1; col++) {
      const esquinas = [[col, fila], [col + 1, fila], [col, fila + 1], [col + 1, fila + 1]];
      if (!esquinas.some(([c, f]) => sobreRoca[f * columnas + c])) continue;
      const [xa, ya] = puntoDe(col, fila), [xd, yd] = puntoDe(col + 1, fila + 1);
      const clave = Math.floor(profundidad((xa + xd) / 2, (ya + yd) / 2) / PASO_MALLA_SUELO);
      let franja = franjas.get(clave); if (!franja) { franja = { vertices: [], uvs: [], indices: [], cuantos: 0 }; franjas.set(clave, franja); }
      for (const [c, f] of esquinas) { const [x, y] = puntoDe(c, f); franja.vertices.push(aPantallaX(x, y), aPantallaY(x, y)); franja.uvs.push(x / anchoTextura, y / altoTextura); }
      const a = franja.cuantos; franja.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); franja.cuantos += 4;
    }
    for (const [clave, franja] of franjas) {
      const malla = new PIXI.Mesh(new PIXI.MeshGeometry(new Float32Array(franja.vertices), new Float32Array(franja.uvs), new Uint16Array(franja.indices)), new PIXI.MeshMaterial(texturaSuelo));
      malla.zIndex = clave * PASO_MALLA_SUELO; capaEscena.addChild(malla); mallasRoca.push(malla);
    }
  }
  // clima: tinte del suelo y lluvia en pantalla
  const clima = opciones.clima || { lluvia: false, barro: false };
  suelo.tint = clima.lluvia && clima.barro ? 0x9c9a88 : clima.barro ? 0xb4a888 : clima.lluvia ? 0xb8c2cc : 0xffffff;
  for (const malla of mallasRoca) malla.tint = suelo.tint;          // los riscos que tapan, con el mismo tinte que el suelo
  const capaLluvia = new PIXI.Graphics(); app.stage.addChild(capaLluvia);
  const gotasLluvia = clima.lluvia ? Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), largo: 10 + Math.random() * 14, velocidad: 0.9 + Math.random() * 0.6 })) : [];
  const coposNieve = clima.nieve ? Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), radio: 1 + Math.random() * 1.8, velocidad: 0.08 + Math.random() * 0.1, fase: Math.random() * 6 })) : [];
  function animarLluvia(dt) {
    if (coposNieve.length) {
      // nieve: copos que caen despacio y se mecen (puramente visual, Math.random está bien aquí)
      const w = app.renderer.width, h = app.renderer.height; capaLluvia.clear();
      for (const p of coposNieve) { p.y += p.velocidad * dt; p.fase += dt * 1.5; if (p.y > 1.03) { p.y = -0.03; p.x = Math.random(); } capaLluvia.beginFill(0xffffff, 0.85).drawCircle((p.x + Math.sin(p.fase) * 0.006) * w, p.y * h, p.radio).endFill(); }
      return;
    }
    if (!gotasLluvia.length) return;
    const w = app.renderer.width, h = app.renderer.height;
    capaLluvia.clear().lineStyle(1, 0xdde6f0, 0.45);
    for (const g of gotasLluvia) { g.y += g.velocidad * dt * 1.6; g.x += dt * 0.08; if (g.y > 1.05) { g.y = -0.05; g.x = Math.random(); } if (g.x > 1.05) g.x = -0.05; const px = g.x * w, py = g.y * h; capaLluvia.moveTo(px, py).lineTo(px - 4, py + g.largo); }
    capaLluvia.beginFill(0x6a7a8a, 0.08).drawRect(0, 0, w, h).endFill();
  }

  /* ----- sprites pre-renderizados -----
     Dirección en pantalla d ∈ 0..7 (0 = derecha, en sentido horario). Fotogramas: quieto, paso1-4, golpe1-3, cadaver.
     Muñeco estilo chibi (js/sprites-munecos.js) dibujado en Canvas 2D a 4× (S = 40) y reducido a 0,25: nítido al acercar.
     La textura guarda su ancla (los pies) en `textura.ancla`. */
  const cache = {};
  const escala2D = 0.25;
  // rama, nivel y general salen de la unidad del soldado: cambian yelmo, escudo, arma, armadura y caballo; la heráldica del
  // equipo (EQUIPOS[e].blason) va en escudos, sobrevestas y gualdrapas
  function texturaSoldado(equipo, tipo, direccion, fotograma, rama, nivel, general, portador) {
    const clave = [equipo, tipo, direccion, fotograma, rama || '', nivel === undefined ? '' : nivel, general ? 'g' : '', portador ? 'p' : ''].join(':');
    if (cache[clave]) return cache[clave];
    const dibujo = dibujarMuneco2D({ equipo, datos: TIPOS[tipo], direccion, fotograma, S: ESCALA * 4, rama, nivel, general, portador });
    const textura = new PIXI.Texture(new PIXI.BaseTexture(dibujo.canvas, { scaleMode: PIXI.SCALE_MODES.LINEAR, resolution: 1 }));
    textura.ancla = [dibujo.anclaX / dibujo.canvas.width, dibujo.anclaY / dibujo.canvas.height];
    return cache[clave] = textura;
  }
  const arte = opciones.arte || null;        // sprites desde archivos (js/sprites-archivo.js), por tipo de tropa
  const texturaSombra = (() => { const g = new PIXI.Graphics(); g.beginFill(0x000000, 0.35).drawEllipse(0, 0, 0.45 * ESCALA, 0.22 * ESCALA).endFill(); return app.renderer.generateTexture(g); })();
  let texturaFlecha = (() => { const g = new PIXI.Graphics(); g.lineStyle(1.2, 0x2a1c10).moveTo(0, 0).lineTo(0.9 * ESCALA, 0); g.lineStyle(0).beginFill(0xbdb5a0).drawRect(0, -0.8, 1.8, 1.6).endFill(); return app.renderer.generateTexture(g); })();
  /* flecha con imagen (2026-10-16, js/arte-flecha.js): la línea de arriba queda de respaldo mientras carga. La imagen (vertical,
     punta arriba) se gira para apuntar a +x con la cola en el origen, en una textura de 128 × 16 con mipmaps (nítida al acercar,
     sin parpadeo al alejar), y el sprite se escala para medir LARGO_FLECHA metros, como la de antes */
  const LARGO_FLECHA = 0.9, ANCHO_TEXTURA_FLECHA = 128, ALTO_TEXTURA_FLECHA = 16, ANCLA_FLECHA_CLAVADA = 0.88;   // clavada: el 12 % de la punta, dentro
  let escalaFlecha = 1;
  if (typeof IMAGEN_FLECHA === 'string') {
    const imagen = new Image();
    imagen.onload = () => {
      const lienzo = document.createElement('canvas'); lienzo.width = ANCHO_TEXTURA_FLECHA; lienzo.height = ALTO_TEXTURA_FLECHA;
      const c = lienzo.getContext('2d'); c.imageSmoothingQuality = 'high';
      c.translate(ANCHO_TEXTURA_FLECHA, 0); c.rotate(Math.PI / 2);                 // el alto de la imagen pasa a ser el largo
      c.drawImage(imagen, 0, 0, ALTO_TEXTURA_FLECHA, ANCHO_TEXTURA_FLECHA);
      texturaFlecha = new PIXI.Texture(new PIXI.BaseTexture(lienzo, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.ON }));
      escalaFlecha = LARGO_FLECHA * ESCALA / ANCHO_TEXTURA_FLECHA;
    };
    imagen.src = IMAGEN_FLECHA;
  }
  // estandarte de unidad: asta + paño; si el equipo trae su blasón rasterizado (canvas), se usa como paño
  // los estandartes se generan a 8× su tamaño en el mundo: con la cámara acercada (zoom hasta 5) se veían borrosos (2026-10-12)
  const RESOLUCION_BANDERA = 8;
  const texturaBandera = {};
  for (let e = 0; e < 2; e++) {
    const blason = opciones.texturasBandera && opciones.texturasBandera[e];
    const g = new PIXI.Graphics(); g.lineStyle(2, 0x3b2a18).moveTo(0, 0).lineTo(0, -4.5 * ESCALA);
    if (!blason) g.lineStyle(0).beginFill(EQUIPOS[e].color).drawRect(0, -4.5 * ESCALA, 1.6 * ESCALA, 1.0 * ESCALA).endFill();
    const cont = new PIXI.Container(); cont.addChild(g);
    if (blason) { const s = new PIXI.Sprite(PIXI.Texture.from(blason)); const alto = 2.2 * ESCALA; s.height = alto; s.width = alto * blason.width / blason.height; s.position.set(1, -4.5 * ESCALA); cont.addChild(s); }
    texturaBandera[e] = app.renderer.generateTexture(cont, { resolution: RESOLUCION_BANDERA, scaleMode: PIXI.SCALE_MODES.LINEAR });
  }
  const texturaBanderaBlanca = (() => { const g = new PIXI.Graphics(); g.lineStyle(2, 0x3b2a18).moveTo(0, 0).lineTo(0, -4.5 * ESCALA); g.lineStyle(0).beginFill(0xf4f0e6).drawRect(1, -4.5 * ESCALA, 1.8 * ESCALA, 2.2 * ESCALA).endFill(); return app.renderer.generateTexture(g, { resolution: RESOLUCION_BANDERA, scaleMode: PIXI.SCALE_MODES.LINEAR }); })();

  /* ----- decoración del terreno: árboles, arbustos y rocas (solo estética) -----
     Desde el 2026-10-16 (fase 1 del terreno con volumen): árboles dibujados por código (js/arboles.js) en varias variantes,
     bosques más densos (uno cada ~DENSIDAD_BOSQUE m², separados al menos SEPARACION_ARBOLES m), sombra de cada copa pintada en
     el suelo, y los árboles que tapan a un soldado se vuelven semitransparentes. Todo sube con el relieve (aPantallaY). */
  const azarDeco = crearAleatorio(42);
  const RESOLUCION_ARBOL = 32, DENSIDAD_BOSQUE = 19, SEPARACION_ARBOLES = 2.0, ALFA_ARBOL_TAPANDO = 0.32;
  const conNieve = !!(opciones.clima && opciones.clima.nieve);
  const texturaDesdeDibujo = dibujo => { const tx = new PIXI.Texture(new PIXI.BaseTexture(dibujo.canvas, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.ON })); tx.defaultAnchor.set(dibujo.anclaX / dibujo.canvas.width, dibujo.anclaY / dibujo.canvas.height); return tx; };
  const hayArboles = typeof dibujarArbol === 'function';
  const variantesArbol = hayArboles ? [
    ...[0, 1, 2].map(() => texturaDesdeDibujo(dibujarArbol({ forma: 'frondoso', S: RESOLUCION_ARBOL, azar: azarDeco, nieve: conNieve }))),
    texturaDesdeDibujo(dibujarArbol({ forma: 'frondoso', S: RESOLUCION_ARBOL, azar: azarDeco, nieve: conNieve, otono: true })),
    ...[0, 1].map(() => texturaDesdeDibujo(dibujarArbol({ forma: 'pino', S: RESOLUCION_ARBOL, azar: azarDeco, nieve: conNieve }))),
  ] : [];
  const variantesArbusto = hayArboles ? [0, 1, 2].map(() => texturaDesdeDibujo(dibujarArbusto({ S: RESOLUCION_ARBOL, azar: azarDeco, nieve: conNieve }))) : [];
  const texturasDeco = {
    roca: (() => { const g = new PIXI.Graphics(); const S = ESCALA; g.beginFill(0x6e6a62).drawPolygon([-0.7 * S, 0, -0.5 * S, -0.5 * S, 0.1 * S, -0.7 * S, 0.7 * S, -0.3 * S, 0.5 * S, 0]).endFill(); g.beginFill(0x8a857b).drawPolygon([-0.4 * S, -0.45 * S, 0.05 * S, -0.6 * S, 0.3 * S, -0.35 * S]).endFill(); return app.renderer.generateTexture(g); })(),
  };
  const decoraciones = [], arbolesBosque = [];
  const ponerDeco = (tipo, x, y, escala) => { const s = new PIXI.Sprite(texturasDeco[tipo]); s.anchor.set(0.5, 1); s.scale.set(escala); s.position.set(aPantallaX(x, y), aPantallaY(x, y)); s.zIndex = profundidad(x, y); capaEscena.addChild(s); decoraciones.push(s); return s; };
  // sombra de la copa en el suelo (canvas de hierba y sangre): hacia el lado contrario a la luz, que viene de la izquierda
  const sombraCopa = (x, y, radio) => { const c = sangre.contexto, ppm = sangre.pixelesPorMetro, desplazamiento = (girada ? -1 : 1) * radio * 0.55; c.globalAlpha = 0.24; c.fillStyle = '#121c0c'; c.beginPath(); c.ellipse((x + desplazamiento) * ppm, (y + desplazamiento * 0.35) * ppm, radio * 1.05 * ppm, radio * 0.8 * ppm, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; };
  const ponerArbol = (x, y, escala, enBosque) => {
    if (!hayArboles) return null;
    // variantes: 0-2 frondosos, 3 de otoño (uno de cada doce), 4-5 pinos
    const sorteo = azarDeco.numero(), textura = variantesArbol[sorteo < 1 / 12 ? 3 : sorteo < 0.62 ? azarDeco.entero(0, 2) : azarDeco.entero(4, 5)];
    const s = new PIXI.Sprite(textura); s.scale.set(escala * ESCALA / RESOLUCION_ARBOL); s.position.set(aPantallaX(x, y), aPantallaY(x, y)); s.zIndex = profundidad(x, y);
    capaEscena.addChild(s); decoraciones.push(s);
    sombraCopa(x, y, 1.6 * escala);
    if (enBosque) arbolesBosque.push({ s, x, y, d: profundidad(x, y), alfa: 1 });
    return s;
  };
  const ponerArbusto = (x, y, escala) => { if (!hayArboles) return; const s = new PIXI.Sprite(variantesArbusto[azarDeco.entero(0, variantesArbusto.length - 1)]); s.scale.set(escala * ESCALA / RESOLUCION_ARBOL); s.position.set(aPantallaX(x, y), aPantallaY(x, y)); s.zIndex = profundidad(x, y); capaEscena.addChild(s); decoraciones.push(s); };
  // anillo de bosque alrededor del campo
  for (let i = 0; i < 260; i++) {
    const lado = azarDeco.entero(0, 3), prof = azarDeco.entre(4, 30);
    const x = lado === 0 ? -prof : lado === 1 ? CAMPO.ancho + prof : azarDeco.entre(-20, CAMPO.ancho + 20);
    const y = lado === 2 ? -prof : lado === 3 ? CAMPO.alto + prof : azarDeco.entre(-20, CAMPO.alto + 20);
    ponerArbol(x, y, azarDeco.entre(0.85, 1.3), false);
  }
  // bosques del terreno: árboles repartidos sin amontonarse (rejilla de 3 m para comprobar la separación) y algún arbusto
  if (opciones.terreno) {
    const ocupado = new Map(), celdaDe = (x, y) => Math.floor(x / 3) + ',' + Math.floor(y / 3);
    const libre = (x, y) => { const cx = Math.floor(x / 3), cy = Math.floor(y / 3); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [px, py] of ocupado.get((cx + a) + ',' + (cy + b)) || []) if ((px - x) ** 2 + (py - y) ** 2 < SEPARACION_ARBOLES ** 2) return false; return true; };
    for (const m of opciones.terreno.manchas) {
      if (m.tipo !== TERRENO.BOSQUE) continue;
      const objetivo = Math.round(Math.PI * m.r * m.r / DENSIDAD_BOSQUE);
      let puestos = 0;
      for (let intento = 0; intento < objetivo * 6 && puestos < objetivo; intento++) {
        const a = azarDeco.entre(-Math.PI, Math.PI), r = Math.sqrt(azarDeco.numero()) * opciones.terreno.radioEn(m, a) * 0.95, x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
        if (!libre(x, y) || opciones.terreno.tipoEn(x, y) !== TERRENO.BOSQUE) continue;      // ni sobre la roca ni en el agua
        const clave = celdaDe(x, y); if (!ocupado.has(clave)) ocupado.set(clave, []); ocupado.get(clave).push([x, y]);
        ponerArbol(x, y, azarDeco.entre(0.75, 1.15), true); puestos++;
      }
      for (let k = 0; k < Math.round(objetivo * 0.35); k++) { const a = azarDeco.entre(-Math.PI, Math.PI), r = Math.sqrt(azarDeco.numero()) * opciones.terreno.radioEn(m, a), x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r; if (libre(x, y) && opciones.terreno.tipoEn(x, y) === TERRENO.BOSQUE) ponerArbusto(x, y, azarDeco.entre(0.8, 1.2)); }
    }
  }
  sangre.version++;                                                       // las sombras de las copas, al suelo
  for (let i = 0; i < 24; i++) { const borde = azarDeco.entero(0, 3); const x = borde < 2 ? (borde ? CAMPO.ancho - azarDeco.entre(1, 6) : azarDeco.entre(1, 6)) : azarDeco.entre(2, CAMPO.ancho - 2); const y = borde >= 2 ? (borde === 3 ? CAMPO.alto - azarDeco.entre(1, 6) : azarDeco.entre(1, 6)) : azarDeco.entre(2, CAMPO.alto - 2); const tipoAqui = opciones.terreno ? opciones.terreno.tipoEn(x, y) : 0; if (tipoAqui !== TERRENO.LLANO && tipoAqui !== TERRENO.COLINA) { azarDeco.numero(); azarDeco.entre(0.7, 1.2); continue; }   /* ni en el agua ni sobre la roca */ if (azarDeco.numero() < 0.65) ponerArbusto(x, y, azarDeco.entre(0.7, 1.2)); else ponerDeco('roca', x, y, azarDeco.entre(0.7, 1.2)); }
  /* árboles que tapan a un soldado (que está detrás, hasta unos metros más arriba en pantalla): semitransparentes, para no
     perder de vista a nadie dentro de un bosque. Se mira cada pocos fotogramas con la rejilla de la simulación */
  // rejilla propia de los soldados (celdas de 4 m), rehecha en cada comprobación: la de la simulación no se actualiza mientras se
  // despliega (no hay pasos) y ahí también hay que ver a las tropas dentro de los bosques
  const CELDA_ARBOLES = 4, columnasArboles = Math.ceil(CAMPO.ancho / CELDA_ARBOLES) + 2, filasArboles = Math.ceil(CAMPO.alto / CELDA_ARBOLES) + 2;
  const cabezasArboles = new Int32Array(columnasArboles * filasArboles), siguienteArboles = new Int32Array(sim.cantidad);
  let fotogramaArboles = 0;
  function transparentarArboles() {
    if (!arbolesBosque.length || (fotogramaArboles++ % 3)) return;
    cabezasArboles.fill(-1);
    for (let i = 0; i < sim.cantidad; i++) {
      if (!sim.vivo(i)) continue;
      const c = limitar(Math.floor(sim.posX[i] / CELDA_ARBOLES), 0, columnasArboles - 1) + limitar(Math.floor(sim.posY[i] / CELDA_ARBOLES), 0, filasArboles - 1) * columnasArboles;
      siguienteArboles[i] = cabezasArboles[c]; cabezasArboles[c] = i;
    }
    const atras = girada ? 1.8 : -1.8, RADIO = 3.2;
    for (const arbol of arbolesBosque) {
      const bx = arbol.x + atras, by = arbol.y + atras;
      const c0 = Math.floor((bx - RADIO) / CELDA_ARBOLES), c1 = Math.floor((bx + RADIO) / CELDA_ARBOLES), f0 = Math.floor((by - RADIO) / CELDA_ARBOLES), f1 = Math.floor((by + RADIO) / CELDA_ARBOLES);
      let tapa = false;
      for (let f = Math.max(0, f0); f <= Math.min(filasArboles - 1, f1) && !tapa; f++) for (let col = Math.max(0, c0); col <= Math.min(columnasArboles - 1, c1) && !tapa; col++) {
        for (let j = cabezasArboles[f * columnasArboles + col]; j !== -1 && !tapa; j = siguienteArboles[j]) { const dx = sim.posX[j] - bx, dy = sim.posY[j] - by; if (dx * dx + dy * dy < RADIO * RADIO && profundidad(sim.posX[j], sim.posY[j]) < arbol.d + 0.6) tapa = true; }
      }
      const objetivo = tapa ? ALFA_ARBOL_TAPANDO : 1;
      if (arbol.alfa !== objetivo) { arbol.alfa += (objetivo - arbol.alfa) * 0.5; if (Math.abs(arbol.alfa - objetivo) < 0.03) arbol.alfa = objetivo; arbol.s.alpha = arbol.alfa; }
    }
  }


  // dirección en pantalla a partir del rumbo en el mundo
  function direccionPantalla(rumbo) {
    if (girada) rumbo += Math.PI;
    const dx = Math.cos(rumbo), dy = Math.sin(rumbo);
    const px = (dx - dy) * COS30, py = (dx + dy) * SIN30;
    let a = Math.atan2(py, px); if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI / 4)) % 8;
  }

  const n = sim.cantidad;
  const sprites = new Array(n), sombras = new Array(n), claveActual = new Array(n).fill('');
  /* ----- gore: partículas de sangre en el aire, charcos bajo los cadáveres, heridas en los soldados, rastros y restos -----
     Todo cosmético: usa un azar propio y nunca sim.azar (las batallas en red necesitan la simulación idéntica en todos). */
  const azarGore = crearAleatorio(7);
  const particulas = [];                                   // { x, y, z, vx, vy, vz, tam, vida, color?, polvo? }
  const capaParticulas = new PIXI.Graphics(); capaParticulas.zIndex = 1e9; capaEscena.addChild(capaParticulas);
  const sangria = new Float32Array(n), ultimoRastro = new Float32Array(n);
  const texturaHerida = (() => { const g = new PIXI.Graphics(); g.beginFill(0x7a0f14, 0.9); g.drawEllipse(0, 0, 7, 5); g.drawCircle(-6, 3, 3); g.drawCircle(5, -4, 2.5); g.endFill(); g.beginFill(0x4a070a, 0.8); g.drawEllipse(1, 1, 3.5, 2.5); g.endFill(); return app.renderer.generateTexture(g); })();
  function salpicar(x, y, z, rumbo, cuantas, fuerza, apertura) {
    for (let k = 0; k < cuantas; k++) {
      const ang = rumbo + azarGore.entre(-apertura, apertura), v = fuerza * azarGore.entre(0.3, 1.1);
      particulas.push({ x, y, z: z + azarGore.entre(-0.1, 0.2), vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vz: azarGore.entre(1.2, 3.8) * (fuerza / 3), tam: azarGore.entre(0.05, 0.13), vida: 1.5 });
    }
  }
  // impacto de una piedra de mangonel (2026-10-14): nube de polvo y terrones que saltan en todas direcciones, y un cráter en el suelo
  function reventar(x, y) {
    for (let k = 0; k < 42; k++) {
      const ang = azarGore.entre(-Math.PI, Math.PI), v = azarGore.entre(1.5, 6.5), tierra = azarGore.numero() < 0.35;
      particulas.push({ x, y, z: 0.1, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.7, vz: azarGore.entre(2.5, 7), tam: tierra ? azarGore.entre(0.12, 0.22) : azarGore.entre(0.25, 0.5), vida: tierra ? 1.3 : 0.9, color: tierra ? 0x4a3520 : 0x9a8c72, polvo: !tierra });
    }
    sangre.crater(x, y, azarGore);
  }
  // llamado por la batalla con cada evento de sangre de la simulación
  function sangrar(evento) {
    const tipo = evento.tipo || 'golpe', rumbo = evento.rumbo || 0;
    if (tipo === 'impacto') reventar(evento.x, evento.y);
    else if (tipo === 'golpe') salpicar(evento.x, evento.y, evento.montado ? 1.4 : 1.0, rumbo, 5, 2.5, 0.7);
    else if (tipo === 'flecha') salpicar(evento.x, evento.y, 1.1, rumbo, 4, 1.8, 0.9);
    else if (tipo === 'atropello') salpicar(evento.x, evento.y, 0.9, rumbo, 16, 4.5, 1.1);
    else if (tipo === 'muerte') {
      salpicar(evento.x, evento.y, 0.8, rumbo, 12, 3.2, 1.3);
      // un resto cae junto al muerto una de cada tres veces: lo que llevaba
      if (azarGore.numero() < 0.35 && evento.tipoSoldado !== undefined) {
        const datos = TIPOS[evento.tipoSoldado], eq = EQUIPOS[evento.equipo] || EQUIPOS[0];
        const resto = datos.alcanceTiro ? 'arco' : datos.clave === 'lanceros' ? 'lanza' : evento.montado ? 'espada' : azarGore.numero() < 0.5 ? 'escudo' : 'yelmo';
        sangre.resto(limitar(evento.x + azarGore.entre(-0.9, 0.9), 1, CAMPO.ancho - 1), limitar(evento.y + azarGore.entre(-0.9, 0.9), 1, CAMPO.alto - 1), resto, eq.color, eq.colorSecundario, azarGore);
      }
    }
    if (particulas.length > 1500) particulas.splice(0, particulas.length - 1500);
  }
  function animarParticulas(dt) {
    capaParticulas.clear();
    if (!particulas.length || dt <= 0) return;
    const escalaMundo = mundo.scale.x;
    for (let k = particulas.length - 1; k >= 0; k--) {
      const p = particulas[k];
      p.vz -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vida -= dt;
      if (p.z <= 0 || p.vida <= 0) { if (!p.color) sangre.gota(limitar(p.x, 0.5, CAMPO.ancho - 0.5), limitar(p.y, 0.5, CAMPO.alto - 0.5), p.tam * 1.6, azarGore.numero() < 0.4); particulas[k] = particulas[particulas.length - 1]; particulas.pop(); continue; }
      const radio = Math.max(0.8, p.tam * ESCALA * escalaMundo) / escalaMundo;
      capaParticulas.beginFill(p.color || 0x9a1218, p.polvo ? 0.55 * Math.min(1, p.vida) : 0.95).drawCircle(aPantallaX(p.x, p.y), aPantallaY(p.x, p.y, p.z), p.polvo ? radio * (1.6 - p.vida * 0.6) : radio).endFill();
    }
  }
  const faseAndar = new Float32Array(n), golpeHasta = new Float32Array(n), ultimoEnfriamiento = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = new PIXI.Sprite(PIXI.Texture.EMPTY); s.anchor.set(0.5, 1); sprites[i] = s; capaEscena.addChild(s);
    const sh = new PIXI.Sprite(texturaSombra); sh.anchor.set(0.5); sombras[i] = sh; capaSombras.addChild(sh);
    ultimoEnfriamiento[i] = sim.enfriamiento[i];
  }
  // piedra de mangonel (2026-10-13): un canto gris en lugar de la flecha
  const texturaPiedra = (() => { const g = new PIXI.Graphics(); g.lineStyle(1, 0x2a201a).beginFill(0x8a857b).drawCircle(0, 0, 0.32 * ESCALA).endFill(); g.lineStyle(0).beginFill(0xb0aa9e).drawCircle(-0.1 * ESCALA, -0.1 * ESCALA, 0.12 * ESCALA).endFill(); return app.renderer.generateTexture(g); })();
  const flechas = new Array(sim.maxFlechas);
  for (let f = 0; f < sim.maxFlechas; f++) { const s = new PIXI.Sprite(texturaFlecha); s.anchor.set(0, 0.5); s.visible = false; flechas[f] = s; capaEscena.addChild(s); }
  const banderas = sim.unidades.map(u => { const s = new PIXI.Sprite(texturaBandera[u.equipo]); s.anchor.set(0, 1); capaEscena.addChild(s); return s; });
  /* Insignia del tipo de tropa junto al estandarte (2026-10-13, tras la prueba con amigos: costaba saber qué era cada unidad):
     círculo oscuro con el borde del color del bando y el mismo glifo que las tarjetas (ICONOS_TIPO, js/juego/13-tarjetas.js),
     a la izquierda del asta, cerca de lo alto. El glifo es un SVG que se rasteriza al cargarse (la textura se actualiza sola). */
  const texturasInsignia = {};
  // nivel: galones de veteranía debajo del círculo (2026-10-14, pedido por el usuario para leer la veteranía del enemigo);
  // -1 = general (estrella). El lienzo es más alto que ancho: los galones en la franja de arriba (cielo libre junto al asta;
  // debajo del círculo los tapaban las cabezas de la primera fila) y el círculo debajo
  const ALTO_INSIGNIA = 124;
  function texturaInsignia(clave, equipo, nivel) {
    const nombre = clave + ':' + equipo + ':' + nivel; if (texturasInsignia[nombre]) return texturasInsignia[nombre];
    const lado = 96, lienzo = document.createElement('canvas'); lienzo.width = lado; lienzo.height = ALTO_INSIGNIA;
    const c = lienzo.getContext('2d'), color = '#' + ((EQUIPOS[equipo] && EQUIPOS[equipo].color) || 0x888888).toString(16).padStart(6, '0');
    const cy = ALTO_INSIGNIA - lado / 2;
    c.beginPath(); c.arc(lado / 2, cy, lado / 2 - 5, 0, Math.PI * 2); c.fillStyle = 'rgba(26,20,16,0.9)'; c.fill(); c.lineWidth = 7; c.strokeStyle = color; c.stroke();
    // galones (uno por nivel, de leva a veteranos) o estrella del general, con borde oscuro para que se lean sobre la hierba
    c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = '#1a1410'; c.fillStyle = '#e4bf4a';
    const yG = 14;
    if (nivel < 0) { c.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 5 : 12, a = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(lado / 2 + Math.cos(a) * r, yG + Math.sin(a) * r); } c.closePath(); c.stroke(); c.fill(); }
    else { const n = nivel + 1, paso = 16, x0 = lado / 2 - (n - 1) * paso / 2; for (let k = 0; k < n; k++) { const x = x0 + k * paso; c.beginPath(); c.moveTo(x - 7, yG + 6); c.lineTo(x, yG - 6); c.lineTo(x + 7, yG + 6); c.lineTo(x, yG); c.closePath(); c.stroke(); c.fill(); } }
    const textura = PIXI.Texture.from(lienzo);
    const glifo = typeof ICONOS_TIPO !== 'undefined' && ICONOS_TIPO[clave];
    if (glifo) {
      const imagen = new Image();
      imagen.onload = () => { c.drawImage(imagen, lado * 0.2, cy - lado * 0.3, lado * 0.6, lado * 0.6); textura.baseTexture.update(); };
      imagen.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${lado}" height="${lado}" color="#f4f0e6">${glifo}</svg>`);
    }
    return texturasInsignia[nombre] = textura;
  }
  const insignias = sim.unidades.map(u => { const s = new PIXI.Sprite(texturaInsignia(u.esGeneral ? 'general' : TIPOS[u.tipo].clave, u.equipo, u.esGeneral ? -1 : (u.nivel || 0))); s.anchor.set(1, (ALTO_INSIGNIA - 48) / ALTO_INSIGNIA); capaEscena.addChild(s); return s; });

  /* ----- cámara y entrada ----- */
  const control = { arrastrando: false, ultimoX: 0, ultimoY: 0 };
  function encuadrar() {
    const w = contenedor.clientWidth, h = contenedor.clientHeight;
    const anchoMundo = (CAMPO.ancho + CAMPO.alto) * COS30 * ESCALA, altoMundo = (CAMPO.ancho + CAMPO.alto) * SIN30 * ESCALA;
    const escala = Math.min(w / anchoMundo, h / altoMundo) * 0.95;
    mundo.scale.set(escala);
    mundo.position.set(w / 2 - aPantallaX(CAMPO.ancho / 2, CAMPO.alto / 2) * escala, h / 2 - aPantallaY(CAMPO.ancho / 2, CAMPO.alto / 2) * escala);
  }
  encuadrar();
  const vista = app.view;
  function pantallaAMundo(clientX, clientY) {
    const rect = vista.getBoundingClientRect();
    const lx = (clientX - rect.left - mundo.x) / mundo.scale.x, ly = (clientY - rect.top - mundo.y) / mundo.scale.y;
    // sin relieve: inversión directa. Con relieve, el rayo de la vista se recorre desde arriba (la altura máxima del mapa) hacia
    // abajo hasta tocar la superficie, y se afina por bisección. (2026-10-19, fase C: antes se iteraba sumando la altura del punto
    // hallado, que converge en pendientes suaves pero en la pared de un risco saltaba al suelo de su pie, 10 m más allá)
    const invertir = alto => { const A = lx / (COS30 * ESCALA), B = (ly + alto * ESCALA) / (SIN30 * ESCALA); return girada ? [CAMPO.ancho - (A + B) / 2, CAMPO.alto - (B - A) / 2] : [(A + B) / 2, (B - A) / 2]; };
    if (alturaMaximaMapa <= 0.05) return invertir(0);
    const PASO_RAYO = 0.2;
    for (let alto = alturaMaximaMapa; alto >= -2.5; alto -= PASO_RAYO) {
      const punto = invertir(alto);
      if (alturaSuelo(punto[0], punto[1]) >= alto) {
        let arriba = alto + PASO_RAYO, abajo = alto;
        for (let vuelta = 0; vuelta < 5; vuelta++) { const medio = (arriba + abajo) / 2, p = invertir(medio); if (alturaSuelo(p[0], p[1]) >= medio) abajo = medio; else arriba = medio; }
        return invertir(abajo);
      }
    }
    return invertir(0);
  }
  function mundoAPantalla(x, y) { const rect = vista.getBoundingClientRect(); return [rect.left + mundo.x + aPantallaX(x, y) * mundo.scale.x, rect.top + mundo.y + aPantallaY(x, y) * mundo.scale.y]; }
  /* Unidad del equipo cuyo soldado (su cuerpo dibujado, no solo sus pies) o cuyo estandarte está bajo el puntero.
     Hace falta porque los sprites son altos: el clic sobre el cuerpo de un soldado cae en el suelo varios metros más atrás,
     y en el cuerpo a cuerpo ese punto suele estar más cerca de una tropa propia que de la enemiga. */
  function unidadBajoPuntero(equipo, clientX, clientY) {
    const rect = vista.getBoundingClientRect(), escala = mundo.scale.x;
    const baseX = rect.left + mundo.x, baseY = rect.top + mundo.y;
    // estandartes primero: son el blanco más claro
    for (let idx = 0; idx < sim.unidades.length; idx++) {
      const u = sim.unidades[idx]; if (u.equipo !== equipo || u.vivos === 0 || oculto(equipo)) continue;
      const b = banderas[idx].getBounds();
      if (clientX >= rect.left + b.x && clientX <= rect.left + b.x + b.width && clientY >= rect.top + b.y && clientY <= rect.top + b.y + b.height) return u;
    }
    let mejor = null, mejorD = Infinity;
    for (let i = 0; i < sim.cantidad; i++) {
      if (sim.equipo[i] !== equipo || !sim.vivo(i) || oculto(equipo)) continue;
      const datos = TIPOS[sim.tipo[i]];
      const sx = baseX + aPantallaX(sim.posX[i], sim.posY[i]) * escala, sy = baseY + aPantallaY(sim.posX[i], sim.posY[i]) * escala;
      const alto = (datos.montado ? 2.4 : 1.9) * ESCALA * escala, medioAncho = (datos.montado ? 0.7 : 0.5) * ESCALA * escala + 2;
      const dx = clientX - sx, dy = clientY - sy;               // dy negativo = por encima de los pies
      if (Math.abs(dx) > medioAncho || dy > 3 * escala || dy < -alto) continue;
      const d = Math.hypot(dx, dy + alto / 2);                  // distancia al centro del cuerpo
      if (d < mejorD) { mejorD = d; mejor = sim.unidades[sim.unidadDe[i]]; }
    }
    return mejor;
  }
  /* Entrada estilo RTS cuando hay `opciones.alOrden`:
       botón izquierdo: clic selecciona (alClic con botón 0), arrastre dibuja un recuadro de selección (alCaja)
       botón derecho: clic ordena en un punto (alOrden sin rumbo), arrastre ordena con rumbo (alOrden con rumbo)
       botón central, o izquierdo con espacio, o WASD: desplazar; rueda: zoom.
     Sin alOrden (prototipos): arrastrar desplaza y el clic llama a alClic. */
  const caja = new PIXI.Graphics(); app.stage.addChild(caja);
  let espacio = false;
  const teclas = {};
  window.addEventListener('keydown', e => { if (e.code === 'Space') espacio = true; teclas[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { if (e.code === 'Space') espacio = false; teclas[e.key.toLowerCase()] = false; if (e.key === 'Alt') e.preventDefault(); });
  window.addEventListener('blur', () => { for (const k of Object.keys(teclas)) teclas[k] = false; espacio = false; });
  vista.addEventListener('contextmenu', e => e.preventDefault());
  vista.addEventListener('pointerdown', e => {
    control.ultimoX = control.inicioX = e.clientX; control.ultimoY = control.inicioY = e.clientY; control.boton = e.button; control.movido = false;
    control.modo = (e.button === 1 || (e.button === 0 && espacio)) ? 'desplazar' : e.button === 0 ? 'seleccion' : 'orden';
    control.arrastrando = true; vista.setPointerCapture(e.pointerId);
  });
  vista.addEventListener('pointermove', e => {
    control.ratonX = e.clientX; control.ratonY = e.clientY;
    if (!control.arrastrando) return;
    if (Math.hypot(e.clientX - control.inicioX, e.clientY - control.inicioY) > 5) control.movido = true;
    if (control.modo === 'desplazar') { mundo.x += e.clientX - control.ultimoX; mundo.y += e.clientY - control.ultimoY; }
    else if (control.modo === 'seleccion' && control.movido) {
      const rect = vista.getBoundingClientRect();
      caja.clear().lineStyle(1.5, 0xffd54a, 0.95).beginFill(0xffd54a, 0.12).drawRect(Math.min(control.inicioX, e.clientX) - rect.left, Math.min(control.inicioY, e.clientY) - rect.top, Math.abs(e.clientX - control.inicioX), Math.abs(e.clientY - control.inicioY)).endFill();
    } else if (control.modo === 'orden' && control.movido) {
      const rect = vista.getBoundingClientRect();
      const x0 = control.inicioX - rect.left, y0 = control.inicioY - rect.top, x1 = e.clientX - rect.left, y1 = e.clientY - rect.top;
      caja.clear();
      // huella prevista de cada unidad en el destino, con el frente marcado (si el juego da el plan)
      if (opciones.planMover) {
        const [wx, wy] = pantallaAMundo(control.inicioX, control.inicioY), [wx2, wy2] = pantallaAMundo(e.clientX, e.clientY);
        const rumbo = Math.atan2(wy2 - wy, wx2 - wx);
        for (const p of opciones.planMover(wx, wy, rumbo, e.altKey)) {
          const cos = Math.cos(p.rumboDibujo), sen = Math.sin(p.rumboDibujo);
          const fx = cos * p.fondo / 2, fy = sen * p.fondo / 2, lx = -sen * p.ancho / 2, ly = cos * p.ancho / 2;
          const esquinas = [[p.x + fx + lx, p.y + fy + ly], [p.x + fx - lx, p.y + fy - ly], [p.x - fx - lx, p.y - fy - ly], [p.x - fx + lx, p.y - fy + ly]]
            .map(([x, y]) => [mundo.x + aPantallaX(x, y) * mundo.scale.x, mundo.y + aPantallaY(x, y) * mundo.scale.y]);
          caja.lineStyle(1.5, 0x9ee07a, 0.9).beginFill(0x9ee07a, 0.15).drawPolygon(esquinas.flat()).endFill();
          caja.lineStyle(3.5, 0xf4f0a0, 1).moveTo(esquinas[0][0], esquinas[0][1]).lineTo(esquinas[1][0], esquinas[1][1]);   // frente
        }
      }
      // flecha de rumbo desde el punto de destino hacia donde se arrastra
      const angulo = Math.atan2(y1 - y0, x1 - x0), punta = 14;
      caja.lineStyle(2, 0x9ee07a, 0.95).moveTo(x0, y0).lineTo(x1, y1);
      caja.lineStyle(0).beginFill(0x9ee07a, 0.95).drawPolygon([x1 + 6 * Math.cos(angulo), y1 + 6 * Math.sin(angulo), x1 - punta * Math.cos(angulo - 0.5), y1 - punta * Math.sin(angulo - 0.5), x1 - punta * Math.cos(angulo + 0.5), y1 - punta * Math.sin(angulo + 0.5)]).endFill();
    }
    control.ultimoX = e.clientX; control.ultimoY = e.clientY;
  });
  let ultimaOrden = { t: 0, x: 0, y: 0 };      // para detectar el doble clic derecho (orden a la carrera)
  vista.addEventListener('pointerup', e => {
    if (!control.arrastrando) return;
    control.arrastrando = false; caja.clear();
    const modificadores = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, doble: false };
    if (control.modo === 'orden' && !control.movido) {
      const ahora = performance.now();
      modificadores.doble = ahora - ultimaOrden.t < 400 && Math.hypot(e.clientX - ultimaOrden.x, e.clientY - ultimaOrden.y) < 10;
      ultimaOrden = modificadores.doble ? { t: 0, x: 0, y: 0 } : { t: ahora, x: e.clientX, y: e.clientY };
    }
    if (control.modo === 'seleccion') {
      if (!control.movido) { if (opciones.alClic) { const [x, y] = pantallaAMundo(e.clientX, e.clientY); opciones.alClic(x, y, 0, Object.assign(modificadores, { clientX: e.clientX, clientY: e.clientY })); } }
      else if (opciones.alCaja) opciones.alCaja(Math.min(control.inicioX, e.clientX), Math.min(control.inicioY, e.clientY), Math.max(control.inicioX, e.clientX), Math.max(control.inicioY, e.clientY), modificadores);
    } else if (control.modo === 'orden') {
      const [x, y] = pantallaAMundo(control.inicioX, control.inicioY);
      let rumbo = null;
      if (control.movido) { const [x2, y2] = pantallaAMundo(e.clientX, e.clientY); rumbo = Math.atan2(y2 - y, x2 - x); }
      opciones.alOrden(x, y, rumbo, Object.assign(modificadores, { clientX: control.inicioX, clientY: control.inicioY }));
    }
  });
  vista.addEventListener('wheel', e => { e.preventDefault(); const factor = e.deltaY > 0 ? 0.9 : 1.1; const nueva = limitar(mundo.scale.x * factor, 0.08, 5); const rect = vista.getBoundingClientRect(); const mx = e.clientX - rect.left, my = e.clientY - rect.top; mundo.x = mx - (mx - mundo.x) * (nueva / mundo.scale.x); mundo.y = my - (my - mundo.y) * (nueva / mundo.scale.x); mundo.scale.set(nueva); }, { passive: false });
  window.addEventListener('resize', encuadrar);
  // desplazamiento con las flechas (A, C y D son órdenes, así que no hay WASD)
  // cámara con WASD (como en Total War) o con las flechas; con Ctrl pulsado no se mueve (Ctrl+A selecciona todo)
  function desplazarTeclado() {
    const v = 14, wasd = !teclas.control;
    if (teclas.arrowup || (wasd && teclas.w)) mundo.y += v; if (teclas.arrowdown || (wasd && teclas.s)) mundo.y -= v;
    if (teclas.arrowleft || (wasd && teclas.a)) mundo.x += v; if (teclas.arrowright || (wasd && teclas.d)) mundo.x -= v;
  }
  window.controlCamaraIso = { mundo, encuadrar, aPantallaX, aPantallaY, pantallaAMundo, mundoAPantalla, flechas };   // gancho para las pruebas sin cabeza (mover la cámara)

  /* ----- destinos de las unidades propias: con Alt pulsado y nada seleccionado ----- */
  // mover: línea punteada hasta la huella de destino (con el frente marcado según el rumbo final); atacar, avanzar o cargar:
  // línea roja con punta hasta la unidad enemiga; disparar: línea ámbar hasta el blanco. Las que están quietas no dibujan nada.
  function dibujarDestinos() {
    const g = destinosGrafico; g.clear();
    const seleccionActual = opciones.seleccion ? opciones.seleccion() : [];
    const ancho = 1 / mundo.scale.x;                                   // grosor constante en pantalla
    const P = (x, y) => [aPantallaX(x, y), aPantallaY(x, y)];
    const lineaPunteada = (x0, y0, x1, y1, color) => {
      const [a0, b0] = P(x0, y0), [a1, b1] = P(x1, y1), largo = Math.hypot(a1 - a0, b1 - b0), paso = 9 * ancho;
      g.lineStyle(2.2 * ancho, color, 0.9);
      for (let d = 0; d < largo; d += paso * 2) { const t0 = d / largo, t1 = Math.min(1, (d + paso) / largo); g.moveTo(a0 + (a1 - a0) * t0, b0 + (b1 - b0) * t0).lineTo(a0 + (a1 - a0) * t1, b0 + (b1 - b0) * t1); }
    };
    /* ruta (fase C de los pasos, 2026-10-19): si la unidad rodea algo que no se pisa, la línea sigue los puntos de su ruta (los que
       le quedan) hasta el destino; si no, recta */
    const lineaRuta = (u, x1, y1, color) => {
      const ruta = u.ruta && u.ruta.puntos ? u.ruta.puntos.slice(u.ruta.indice, -1) : [];
      let x0 = u.origenX, y0 = u.origenY;
      for (const [x, y] of ruta.concat([[x1, y1]])) { lineaPunteada(x0, y0, x, y, color); x0 = x; y0 = y; }
      return ruta.length ? ruta[ruta.length - 1] : [u.origenX, u.origenY];
    };
    // las seleccionadas que van rodeando, siempre (sin Alt): por dónde van a pasar
    if (!teclas.alt) {
      for (const u of seleccionActual) {
        if (u.equipo !== equipoPropio || u.vivos === 0 || u.huyendo || !u.ruta || !u.ruta.puntos || u.ruta.indice >= u.ruta.puntos.length - 1) continue;
        const objetivo = u.objetivoUnidad >= 0 ? sim.unidades[u.objetivoUnidad] : null;
        if (u.orden === 'mover') lineaRuta(u, u.objetivoX, u.objetivoY, u.marcha === 'correr' ? 0xf4d06a : 0x9ee07a);
        else if (objetivo && objetivo.vivos > 0 && (u.orden === 'avanzar' || u.orden === 'atacar' || u.orden === 'cargar')) lineaRuta(u, objetivo.centroX, objetivo.centroY, 0xe0604a);
      }
      return;
    }
    if (seleccionActual.length) return;
    const punta = (x0, y0, x1, y1, color) => {
      const [a0, b0] = P(x0, y0), [a1, b1] = P(x1, y1), angulo = Math.atan2(b1 - b0, a1 - a0), l = 12 * ancho;
      g.lineStyle(0).beginFill(color, 0.95).drawPolygon([a1, b1, a1 - l * Math.cos(angulo - 0.45), b1 - l * Math.sin(angulo - 0.45), a1 - l * Math.cos(angulo + 0.45), b1 - l * Math.sin(angulo + 0.45)]).endFill();
    };
    for (const u of sim.unidades) {
      if (u.equipo !== equipoPropio || u.vivos === 0 || (u.huyendo && !u.retirada)) continue;
      const objetivo = u.objetivoUnidad >= 0 ? sim.unidades[u.objetivoUnidad] : null;
      if (u.orden === 'mover') {
        const dx = u.objetivoX - u.origenX, dy = u.objetivoY - u.origenY;
        if (Math.hypot(dx, dy) < 1.5) continue;
        const rumbo = u.rumboFinal !== null && u.rumboFinal !== undefined ? u.rumboFinal : Math.atan2(dy, dx);
        const color = u.marcha === 'correr' ? 0xf4d06a : 0x9ee07a;
        lineaRuta(u, u.objetivoX, u.objetivoY, color);
        // huella en el destino: el origen de la unidad es el centro de su frente; la formación queda detrás
        const dim = sim.dimensionesUnidad(u), cos = Math.cos(rumbo), sen = Math.sin(rumbo);
        const lx = -sen * dim.ancho / 2, ly = cos * dim.ancho / 2, fx = -cos * dim.fondo, fy = -sen * dim.fondo;
        const ox = u.objetivoX, oy = u.objetivoY;
        const esquinas = [[ox + lx, oy + ly], [ox - lx, oy - ly], [ox - lx + fx, oy - ly + fy], [ox + lx + fx, oy + ly + fy]].map(([x, y]) => P(x, y));
        g.lineStyle(1.6 * ancho, color, 0.9).beginFill(color, 0.16).drawPolygon(esquinas.flat()).endFill();
        g.lineStyle(3.5 * ancho, 0xf4f0a0, 1).moveTo(esquinas[0][0], esquinas[0][1]).lineTo(esquinas[1][0], esquinas[1][1]);   // frente
      } else if (objetivo && objetivo.vivos > 0 && (u.orden === 'avanzar' || u.orden === 'atacar' || u.orden === 'cargar')) {
        const color = 0xe0604a;
        const [desdeX, desdeY] = lineaRuta(u, objetivo.centroX, objetivo.centroY, color);
        punta(desdeX, desdeY, objetivo.centroX, objetivo.centroY, color);
      } else if (objetivo && objetivo.vivos > 0 && u.orden === 'disparar') {
        lineaPunteada(u.centroX, u.centroY, objetivo.centroX, objetivo.centroY, 0xf0a030);
      }
    }
  }

  /* ----- órdenes en camino (red, 2026-10-13) -----
     Las órdenes que el jugador ha dado y aún no han vuelto del servidor se marcan al momento, con un pulso: la huella del
     destino (mover/recolocar) o el blanco (atacar), para que el retraso de la red no parezca que el clic no ha hecho nada. */
  function dibujarOrdenesEnCamino(g, tiempoRender) {
    const enCamino = opciones.ordenesEnCamino ? opciones.ordenesEnCamino() : [];
    if (!enCamino.length) return;
    const pulso = 0.55 + 0.35 * Math.sin(tiempoRender * 14);
    for (const { orden } of enCamino) {
      if ((orden.a === 'mover' || orden.a === 'recolocar') && Array.isArray(orden.d)) {
        orden.u.forEach((id, k) => {
          const u = sim.unidades[id], d = orden.d[k]; if (!u || !d) return;
          const color = orden.m === 'correr' ? 0xf4d06a : 0x9ee07a, [mx, my] = [aPantallaX(d[0], d[1]), aPantallaY(d[0], d[1])];
          g.lineStyle(1.5, color, pulso).moveTo(aPantallaX(u.origenX, u.origenY), aPantallaY(u.origenX, u.origenY)).lineTo(mx, my);
          g.lineStyle(2, color, pulso).beginFill(color, 0.18 * pulso).drawEllipse(mx, my, 1.1 * ESCALA, 0.55 * ESCALA).endFill();
        });
      } else if (orden.a === 'atacar' && sim.unidades[orden.objetivo]) {
        const o = sim.unidades[orden.objetivo], [ox, oy] = [aPantallaX(o.centroX, o.centroY), aPantallaY(o.centroX, o.centroY)];
        g.lineStyle(2.4, 0xff4a3a, pulso).drawEllipse(ox, oy, 1.4 * ESCALA, 0.7 * ESCALA);
        for (const id of orden.u) { const u = sim.unidades[id]; if (u) g.lineStyle(1.5, 0xff4a3a, pulso * 0.8).moveTo(aPantallaX(u.origenX, u.origenY), aPantallaY(u.origenX, u.origenY)).lineTo(ox, oy); }
      }
    }
  }

  /* ----- alcance de tiro (2026-10-11; cono desde el 2026-10-13) -----
     Cono (o círculo, para los que disparan en movimiento) en el suelo con el alcance real de cada unidad a distancia: el de sus datos, por su altura (cada metro sobre el llano, +3 %) y
     por el clima (como en la simulación, que además lo calcula respecto a la altura de cada blanco). Se ven los de los tiradores PROPIOS SELECCIONADOS (azul) y el del tirador ENEMIGO bajo el
     ratón (rojo). Los que se han quedado sin munición no tienen alcance. */
  let enemigoBajoRaton = null, generalBajoRaton = null, ultimaBusquedaRaton = 0, enemigoParaPista = null;
  /* ----- pista de altura (2026-10-16, fase 2 del terreno) -----
     Con unidades propias seleccionadas y el ratón sobre un enemigo, un recuadro junto al cursor dice qué le hace el terreno a la
     primera de ellas contra él: ventaja o desventaja en el cuerpo a cuerpo y en la carga según la pendiente, y para los
     tiradores, el alcance a ese blanco y si la colina lo tapa. Usa las mismas fórmulas que la simulación, sin tocar su estado. */
  const pistaAltura = document.createElement('div'); pistaAltura.className = 'pista-altura'; pistaAltura.hidden = true; document.body.appendChild(pistaAltura);
  let pistaClave = '', pistaConTexto = false;
  function textoPistaAltura(propia, enemigo) {
    const dx = enemigo.centroX - propia.centroX, dy = enemigo.centroY - propia.centroY, d = Math.hypot(dx, dy) || 1;
    // donde se chocaría: el soldado enemigo más cercano (no el centro: en una unidad plantada en lo alto queda detrás de la cima)
    const frente = sim.soldadoMasCercano(enemigo, propia.centroX, propia.centroY);
    const contactoX = frente >= 0 ? sim.posX[frente] : enemigo.centroX, contactoY = frente >= 0 ? sim.posY[frente] : enemigo.centroY;
    const dc = Math.hypot(contactoX - propia.centroX, contactoY - propia.centroY) || 1, dirX = (contactoX - propia.centroX) / dc, dirY = (contactoY - propia.centroY) / dc;
    // cuerpo a cuerpo: la pendiente allí, en la dirección del ataque (positiva: el enemigo queda arriba)
    const pendiente = sim.pendienteEn(contactoX, contactoY, dirX, dirY);
    const lineas = [], porcentaje = f => Math.round(Math.abs(f - 1) * 100), clase = f => f >= 1 ? 'bien' : 'mal';
    const datos = propia.stats;
    if (datos.alcanceTiro && !propia.sinMunicion) {
      const alcance = sim.alcanceTiroDe(propia, enemigo), metros = Math.round(d);
      if (d > alcance) lineas.push(['mal', tr('Fuera de alcance: {d} m de {a}', { d: metros, a: Math.round(alcance) })]);
      else if (!sim.calcularLineaDeTiro(propia, enemigo)) lineas.push(['mal', datos.apuntado ? tr('Tapado: el terreno no deja verlo') : tr('Tapado: las flechas chocarían con la colina')]);
      else lineas.push(['bien', tr('A tiro: {d} m de {a}', { d: metros, a: Math.round(alcance) })]);
      const extra = Math.round((alcance / ((datos.alcanceTiro || 1) * ((sim.clima && sim.clima.alcanceTiro) || 1)) - 1) * 100);
      if (Math.abs(extra) >= 3) lineas.push([extra > 0 ? 'bien' : 'mal', extra > 0 ? tr('Desde arriba: +{n} % de alcance', { n: extra }) : tr('Desde abajo: −{n} % de alcance', { n: -extra })]);
    } else {
      const mele = sim.factorAlturaMele(-pendiente);
      if (porcentaje(mele) >= 2) lineas.push([clase(mele), mele > 1 ? tr('Cuesta abajo: +{n} % en el cuerpo a cuerpo', { n: porcentaje(mele) }) : tr('Cuesta arriba: −{n} % en el cuerpo a cuerpo', { n: porcentaje(mele) })]);
      if (datos.montado) {
        const carga = sim.factorCarga(sim.pendienteDeCarga(contactoX, contactoY, dirX, dirY));   // como en la simulación
        if (porcentaje(carga) >= 2) lineas.push([clase(carga), carga > 1 ? tr('Carga cuesta abajo: +{n} %', { n: porcentaje(carga) }) : tr('Carga cuesta arriba: −{n} %', { n: porcentaje(carga) })]);
      }
    }
    return lineas;
  }
  function actualizarPistaAltura(seleccion, enemigo) {
    const propias = seleccion.filter(u => u.equipo === equipoPropio && u.vivos > 0 && !u.huyendo);
    const propia = propias.find(u => !u.esGeneral) || propias[0];
    if (!propia || !enemigo || enemigo.vivos <= 0 || control.arrastrando || control.ratonX === undefined) { pistaAltura.hidden = true; pistaClave = ''; return; }
    const ahora = performance.now(), clave = propia.id + '/' + enemigo.id + '/' + Math.floor(ahora / 250);
    if (clave !== pistaClave) {
      pistaClave = clave;
      const lineas = textoPistaAltura(propia, enemigo);
      pistaConTexto = lineas.length > 0;
      if (!pistaConTexto) { pistaAltura.hidden = true; return; }
      pistaAltura.innerHTML = '<b></b>' + lineas.map(() => '<div></div>').join('');
      pistaAltura.firstChild.textContent = propia.nombre;
      lineas.forEach(([tipo, texto], k) => { const fila = pistaAltura.children[k + 1]; fila.className = tipo; fila.textContent = texto; });
    }
    if (!pistaConTexto) return;
    pistaAltura.hidden = false;
    pistaAltura.style.left = Math.min(window.innerWidth - pistaAltura.offsetWidth - 8, control.ratonX + 18) + 'px';
    pistaAltura.style.top = Math.min(window.innerHeight - pistaAltura.offsetHeight - 8, control.ratonY + 20) + 'px';
  }
  function alcanceDe(u) {
    const base = u.stats.alcanceTiro || 0;
    if (!base || u.vivos === 0) return 0;
    return sim.alcanceTiroDe(u);           // desde el 2026-10-16 (fase 2) según su altura sobre el llano, como en la simulación
  }
  function dibujarAlcances() {
    const g = alcancesGrafico; g.clear();
    const grosor = 1 / mundo.scale.x;
    // cono de tiro: ±ARCO_TIRO alrededor de hacia donde mira la formación (como en la simulación); en redondo para los que
    // disparan en movimiento (arqueros a caballo)
    const circulo = (u, color, alfaRelleno) => {
      const radio = alcanceDe(u); if (!radio) return;
      const puntos = [];
      if (u.stats.disparaEnMovimiento) {
        for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2, x = u.centroX + Math.cos(a) * radio, y = u.centroY + Math.sin(a) * radio; puntos.push(aPantallaX(x, y), aPantallaY(x, y)); }
      } else {
        puntos.push(aPantallaX(u.centroX, u.centroY), aPantallaY(u.centroX, u.centroY));
        for (let k = 0; k <= 36; k++) { const a = u.rumbo - ARCO_TIRO + k / 36 * 2 * ARCO_TIRO, x = u.centroX + Math.cos(a) * radio, y = u.centroY + Math.sin(a) * radio; puntos.push(aPantallaX(x, y), aPantallaY(x, y)); }
      }
      g.lineStyle(2.4 * grosor, color, 0.95).beginFill(color, alfaRelleno).drawPolygon(puntos).endFill();
      // marca en el centro de la unidad
      g.lineStyle(0).beginFill(color, 0.9).drawCircle(aPantallaX(u.centroX, u.centroY), aPantallaY(u.centroX, u.centroY), 3 * grosor).endFill();
    };
    /* aura del general (2026-10-15, pedido del usuario): círculo en el que sus unidades reciben la moral del general cerca; el
       mismo criterio que la simulación (centro de la unidad a menos de auraPorEquipo[equipo].radio del centro del general, y solo
       con el general en pie y sin huir) */
    const aura = (u, color) => {
      if (!u || !u.esGeneral || u.vivos <= 0 || u.huyendo || oculto(u.equipo)) return;
      const radio = ((sim.auraPorEquipo && sim.auraPorEquipo[u.equipo]) || AURA_GENERAL).radio;
      const puntos = [];
      for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2, x = u.centroX + Math.cos(a) * radio, y = u.centroY + Math.sin(a) * radio; puntos.push(aPantallaX(x, y), aPantallaY(x, y)); }
      g.lineStyle(2.4 * grosor, color, 0.95).beginFill(color, 0.07).drawPolygon(puntos).endFill();
      g.lineStyle(0).beginFill(color, 0.9).drawCircle(aPantallaX(u.centroX, u.centroY), aPantallaY(u.centroX, u.centroY), 3 * grosor).endFill();
    };
    const seleccionActual = opciones.seleccion ? opciones.seleccion() : [];
    for (const u of seleccionActual) if (u.equipo === equipoPropio && !u.huyendo) { if (u.esGeneral) aura(u, 0x5aa0ff); else circulo(u, 0x5aa0ff, 0.08); }
    // tirador enemigo bajo el ratón (la búsqueda por el cuerpo dibujado se hace como mucho diez veces por segundo)
    const ahora = performance.now();
    if (control.ratonX !== undefined && !control.arrastrando && ahora - ultimaBusquedaRaton > 100) {
      ultimaBusquedaRaton = ahora;
      const rect = vista.getBoundingClientRect();
      const dentro = control.ratonX >= rect.left && control.ratonX <= rect.right && control.ratonY >= rect.top && control.ratonY <= rect.bottom;
      const bajo = dentro ? unidadBajoPuntero(1 - equipoPropio, control.ratonX, control.ratonY) : null;
      enemigoBajoRaton = bajo && (bajo.stats.alcanceTiro || bajo.esGeneral) ? bajo : null;
      enemigoParaPista = bajo;
      // el general propio bajo el ratón también enseña su aura (sin tener que seleccionarlo)
      const propio = dentro && !bajo ? unidadBajoPuntero(equipoPropio, control.ratonX, control.ratonY) : null;
      generalBajoRaton = propio && propio.esGeneral ? propio : null;
    }
    if (enemigoBajoRaton && enemigoBajoRaton.vivos > 0) { if (enemigoBajoRaton.esGeneral) aura(enemigoBajoRaton, 0xe0503c); else circulo(enemigoBajoRaton, 0xe0503c, 0.08); }
    if (generalBajoRaton && !seleccionActual.includes(generalBajoRaton)) aura(generalBajoRaton, 0x5aa0ff);
    actualizarPistaAltura(seleccionActual, enemigoParaPista);
  }

  /* ----- dibujo ----- */
  const posFlecha = new Float32Array(4);
  let tiempoAnterior = 0;
  function dibujar(alpha, tiempoRender) {
    desplazarTeclado();
    const dt = tiempoAnterior ? Math.max(0, tiempoRender - tiempoAnterior) : 0; tiempoAnterior = tiempoRender;
    // la textura del suelo se sube a la GPU como mucho ocho veces por segundo (con las gotas cambia casi cada fotograma)
    if (sangre.version !== versionSuelo && tiempoRender - ultimaSubidaSuelo > 0.12) { texturaSuelo.update(); versionSuelo = sangre.version; ultimaSubidaSuelo = tiempoRender; }
    animarParticulas(dt); animarLluvia(dt); transparentarArboles(); animarRio(dt);
    const a = alpha, b = 1 - alpha;
    let luchando = 0, galopando = 0;
    for (let i = 0; i < n; i++) {
      const s = sprites[i], sh = sombras[i], estado = sim.estado[i];
      if (estado === ESTADO.AUSENTE || oculto(sim.equipo[i])) { if (s.visible) { s.visible = false; sh.visible = false; } continue; }
      if (!s.visible) s.visible = true;
      const x = sim.posX[i] * a + sim.previaX[i] * b, y = sim.posY[i] * a + sim.previaY[i] * b;
      const cadaver = estado === ESTADO.CADAVER;
      const d = direccionPantalla(sim.rumbo[i]);
      // gore: el cadáver sangra tres segundos y el charco crece; el herido que se mueve deja rastro; la herida se ve en el cuerpo
      if (cadaver) {
        const desdeMuerte = tiempoRender - sim.tiempoMuerte[i];
        if (desdeMuerte < 3.2 && tiempoRender - sangria[i] > 0.7) { sangria[i] = tiempoRender; sangre.charco(x, y, 0.25 + desdeMuerte * 0.18, azarGore); }
      } else {
        const vidaMax = sim.unidades[sim.unidadDe[i]].stats.vida;
        const herido = sim.vida[i] < vidaMax * 0.5;
        if (herido && !s.herida) { const h = new PIXI.Sprite(texturaHerida); h.anchor.set(0.5); h.position.set(azarGore.entre(-10, 10), -azarGore.entre(34, 50)); h.rotation = azarGore.entre(0, 6.28); s.herida = h; s.addChild(h); }
        // rastro: solo uno de cada tres heridos graves, con gotas sueltas y desviadas (si no, una unidad que huye deja raíles)
        if (i % 3 === 0 && sim.vida[i] < vidaMax * 0.35 && sim.velocidadActual[i] > 0.5 && tiempoRender - ultimoRastro[i] > 0.5 + (i % 5) * 0.1) { ultimoRastro[i] = tiempoRender; sangre.gota(x + azarGore.entre(-0.35, 0.35), y + azarGore.entre(-0.35, 0.35), 0.07, true); }
      }
      // fotograma: golpe (el enfriamiento acaba de reiniciarse), pasos (si se mueve) o quieto; cadáver tras la caída
      if (sim.enfriamiento[i] > ultimoEnfriamiento[i] + 0.3) golpeHasta[i] = tiempoRender + 0.28;
      ultimoEnfriamiento[i] = sim.enfriamiento[i];
      const velocidad = sim.velocidadActual[i];
      if (velocidad > 0.3 && !cadaver) faseAndar[i] += velocidad * dt * 2.2;
      const cayendo = cadaver && tiempoRender - sim.tiempoMuerte[i] < 0.45;
      let fotograma;
      if (cadaver && !cayendo) fotograma = 'cadaver';
      else if (tiempoRender < golpeHasta[i] && !cadaver) { const progreso = 1 - (golpeHasta[i] - tiempoRender) / 0.28; fotograma = progreso < 0.3 ? 'golpe1' : progreso < 0.72 ? 'golpe2' : 'golpe3'; }
      else if (velocidad > 0.3 && !cadaver) fotograma = 'paso' + (Math.floor(faseAndar[i] * 2) % 4 + 1);   // ciclo de cuatro fotogramas
      else fotograma = 'quieto';
      if (estado === ESTADO.LUCHANDO) luchando++;
      if (TIPOS[sim.tipo[i]].montado && velocidad > 3.5) galopando++;
      // arte propio desde archivos (opciones.arte): animación por fotogramas de la hoja; si no hay, dibujo por código
      const unidadDelSoldado = sim.unidades[sim.unidadDe[i]];
      const arteTipo = arte ? arte.paraUnidad(TIPOS[sim.tipo[i]].clave, unidadDelSoldado.rama, unidadDelSoldado.nivel) : null;
      let clave;
      if (arteTipo) {
        const an = arteTipo.animaciones;
        let col;
        if (fotograma === 'cadaver') col = an.cadaver[an.cadaver.length - 1];
        else if (fotograma.startsWith('golpe')) { const g = an.golpe || an.quieto; col = g[Math.min(g.length - 1, Math.floor((1 - (golpeHasta[i] - tiempoRender) / 0.28) * g.length))]; }
        else if (fotograma.startsWith('paso')) { const p = an.paso || an.quieto; col = p[Math.floor(faseAndar[i] * p.length / 2) % p.length]; }
        else { const q = an.quieto; col = q[Math.floor(tiempoRender * 3) % q.length]; }
        clave = 'a' + d + ':' + col;
        if (clave !== claveActual[i]) {
          s.texture = arteTipo.texturas[d + ':' + col]; s.anchor.set(arteTipo.ancla[0], arteTipo.ancla[1]);
          const k = ESCALA / arteTipo.escala; s.scale.set(arteTipo.espejo[d] ? -k : k, k);
          // capas de color del reino (máscaras tintadas) como hijos del sprite
          arteTipo.conMascara.forEach((hay, m) => { if (!hay) return; let hijo = s.children[m]; if (!hijo) { hijo = new PIXI.Sprite(); hijo.tint = m === 0 ? EQUIPOS[sim.equipo[i]].color : EQUIPOS[sim.equipo[i]].colorSecundario; s.addChild(hijo); } hijo.texture = arteTipo.texturasMascara[m][d + ':' + col]; hijo.anchor.set(arteTipo.ancla[0], arteTipo.ancla[1]); });
          claveActual[i] = clave;
        }
      } else {
        const esPortador = unidadDelSoldado.portador === i;     // lleva el estandarte de mano (caído si es cadáver)
        clave = d + ':' + fotograma + (esPortador ? 'p' : '');
        if (clave !== claveActual[i]) {
          const textura = texturaSoldado(sim.equipo[i], sim.tipo[i], d, fotograma, unidadDelSoldado.rama, unidadDelSoldado.nivel, unidadDelSoldado.esGeneral, esPortador); s.texture = textura; s.anchor.set(textura.ancla[0], textura.ancla[1]); s.scale.set(escala2D);
          claveActual[i] = clave;
        }
      }
      let altura = 0;
      if (estado === ESTADO.VOLANDO) { altura = sim.vueloZ[i] * a + sim.vueloZPrevia[i] * b; s.rotation = sim.vueloGiro[i] * 0.6; }
      else if (cayendo) { const t = (tiempoRender - sim.tiempoMuerte[i]) / 0.45; s.rotation = (d >= 2 && d <= 5 ? -1 : 1) * 1.35 * t * t; }
      else if (s.rotation !== 0) s.rotation = 0;
      s.position.set(aPantallaX(x, y), aPantallaY(x, y, altura));
      s.zIndex = cadaver ? profundidad(x, y) - 1000 : profundidad(x, y);
      sh.position.set(aPantallaX(x, y), aPantallaY(x, y)); sh.visible = !cadaver; sh.scale.set(cadaver ? 1 : 1 / (1 + altura * 0.4));
      sh.tint = 0xffffff;
    }
    // selección: sombras doradas, anillo en el origen, destino y objetivo de ataque
    let seleccion = opciones.seleccion ? opciones.seleccion() : null;
    if (seleccion && !Array.isArray(seleccion)) seleccion = [seleccion];
    seleccion = seleccion || [];
    if (!dibujar.marcas) { dibujar.marcas = new PIXI.Graphics(); capaSombras.addChild(dibujar.marcas); }
    const marcas = dibujar.marcas; marcas.clear();
    for (const u of seleccion) {
      for (const i of u.indices) if (sim.vivo(i)) sombras[i].tint = 0xffd54a;
      marcas.lineStyle(2, 0xffd54a, 0.9).drawEllipse(aPantallaX(u.origenX, u.origenY), aPantallaY(u.origenX, u.origenY), 0.9 * ESCALA, 0.45 * ESCALA);
      if (u.orden === 'mover') {
        const mx = aPantallaX(u.objetivoX, u.objetivoY), my = aPantallaY(u.objetivoX, u.objetivoY), porRuta = u.ruta && u.ruta.puntos && u.ruta.indice < u.ruta.puntos.length - 1;
        marcas.lineStyle(1.5, 0x9ee07a, 0.9);
        if (!porRuta) marcas.moveTo(aPantallaX(u.origenX, u.origenY), aPantallaY(u.origenX, u.origenY)).lineTo(mx, my);   // con ruta, la dibuja dibujarDestinos
        marcas.drawEllipse(mx, my, 0.7 * ESCALA, 0.35 * ESCALA);
      }
      if (u.objetivoFijo >= 0) { const o = sim.unidades[u.objetivoFijo]; marcas.lineStyle(2, 0xff4a3a, 0.9).drawEllipse(aPantallaX(o.centroX, o.centroY), aPantallaY(o.centroX, o.centroY), 1.1 * ESCALA, 0.55 * ESCALA); }
    }
    dibujarOrdenesEnCamino(marcas, tiempoRender);
    dibujarDestinos();
    dibujarAlcances();
    // barras de vida y moral sobre el estandarte de cada unidad
    if (!dibujar.barras) { dibujar.barras = new PIXI.Graphics(); capaEscena.addChild(dibujar.barras); dibujar.barras.zIndex = 1e6; }
    const barras = dibujar.barras; barras.clear();
    sim.unidades.forEach((u, idx) => {
      if (u.vivos === 0 || oculto(u.equipo)) return;
      const bx = aPantallaX(u.origenX, u.origenY) - 1.2 * ESCALA, by = aPantallaY(u.origenX, u.origenY) - 5.2 * ESCALA, ancho = 2.4 * ESCALA;
      barras.beginFill(0x000000, 0.6).drawRect(bx - 1, by - 1, ancho + 2, 6).endFill();
      barras.beginFill(u.equipo === equipoPropio ? 0x4ad04a : 0xd04a4a).drawRect(bx, by, ancho * u.vivos / u.total, 2.2).endFill();
      barras.beginFill(u.huyendo ? (u.retirada ? 0xffb347 : 0xffffff) : 0xffd54a).drawRect(bx, by + 2.6, ancho * limitar(u.moral / u.moralMax, 0, 1), 1.6).endFill();
    });
    // flechas
    let volando = 0;
    // la flecha de imagen es fina: al alejar la cámara se engruesa (hasta ×3) para que se siga viendo; de cerca, su grosor real
    const grosorFlecha = texturaFlecha.baseTexture.width === ANCHO_TEXTURA_FLECHA ? limitar(3.2 / mundo.scale.x, 1, 3) : 1;
    for (let f = 0; f < sim.maxFlechas; f++) {
      const s = flechas[f], estado = sim.flechaEstado[f];
      if (estado === 0) { if (s.visible) s.visible = false; continue; }
      s.visible = true;
      const piedra = sim.flechaArea[f] > 0, texturaProyectil = piedra ? texturaPiedra : texturaFlecha;
      if (s.texture !== texturaProyectil) { s.texture = texturaProyectil; s.anchor.set(piedra ? 0.5 : 0, 0.5); if (piedra) s.scale.set(1); }
      if (!piedra) s.scale.set(escalaFlecha, escalaFlecha * grosorFlecha);
      const giro = girada ? -1 : 1, dx = (sim.flechaX1[f] - sim.flechaX0[f]) * giro, dy = (sim.flechaY1[f] - sim.flechaY0[f]) * giro;
      const anguloPantalla = Math.atan2((dx + dy) * SIN30, (dx - dy) * COS30);
      if (estado === 1) {
        volando++;
        sim.flechaPosicion(f, tiempoRender, posFlecha);
        // en vuelo la flecha no sigue el suelo que sobrevuela (2026-10-16: con el relieve trepaba las colinas y volvía a bajar):
        // su parábola va de la altura del suelo del tirador a la del punto de caída; aPantallaY suma el suelo bajo la flecha,
        // así que se le resta. La inclinación incluye esa diferencia de alturas
        const alturaSalida = alturaSuelo(sim.flechaX0[f], sim.flechaY0[f]), alturaLlegada = alturaSuelo(sim.flechaX1[f], sim.flechaY1[f]);
        const largo = Math.hypot(dx, dy) || 1, pendiente = (4 * sim.flechaApice[f] * (1 - 2 * posFlecha[3]) + (alturaLlegada - alturaSalida)) / largo;
        const alturaRecta = alturaSalida + (alturaLlegada - alturaSalida) * posFlecha[3];
        s.position.set(aPantallaX(posFlecha[0], posFlecha[1]), aPantallaY(posFlecha[0], posFlecha[1], posFlecha[2] + alturaRecta - alturaSuelo(posFlecha[0], posFlecha[1])));
        s.rotation = anguloPantalla - Math.atan(pendiente) * 0.8; s.alpha = 1; s.zIndex = profundidad(posFlecha[0], posFlecha[1]) + 2;
        if (!piedra && s.anchor.x !== 0) s.anchor.set(0, 0.5);
      } else {
        let x = sim.flechaX1[f], y = sim.flechaY1[f], altura = 0;
        if (estado === 3) { const j = sim.flechaSoldado[f]; if (sim.estado[j] === ESTADO.AUSENTE) { s.visible = false; continue; } x = sim.posX[j] * a + sim.previaX[j] * b + sim.flechaOffX[f]; y = sim.posY[j] * a + sim.previaY[j] * b + sim.flechaOffY[f]; altura = sim.estado[j] === ESTADO.CADAVER ? 0.2 : 1.0; }
        // clavada: apoyada por la punta (un poco hundida) y con las plumas arriba, inclinada como antes (2026-10-16: con la imagen
        // se veía que la flecha antigua se clavaba por la cola)
        s.position.set(aPantallaX(x, y), aPantallaY(x, y, altura)); s.alpha = 0.9; s.zIndex = profundidad(x, y) + 0.5;
        // con la inclinación de su último instante de vuelo (2026-10-16, pedido del usuario: antes todas quedaban igual, con las
        // plumas hacia arriba): dirección desde el tirador y pendiente de bajada de la parábola, la misma fórmula que en el aire;
        // apoyada por la punta, así la cola queda hacia el que disparó
        if (piedra) s.rotation = -1.1;
        else {
          if (s.anchor.x !== ANCLA_FLECHA_CLAVADA) s.anchor.set(ANCLA_FLECHA_CLAVADA, 0.5);
          const largo = Math.hypot(dx, dy) || 1, pendienteFinal = (-4 * sim.flechaApice[f] + alturaSuelo(sim.flechaX1[f], sim.flechaY1[f]) - alturaSuelo(sim.flechaX0[f], sim.flechaY0[f])) / largo;
          s.rotation = anguloPantalla - Math.atan(pendienteFinal) * 0.8;
        }
      }
    }
    // estandartes: parpadeo blanco si la unidad huye; bote si está seleccionada
    sim.unidades.forEach((u, idx) => {
      const s = banderas[idx]; s.visible = u.vivos > 0 && !oculto(u.equipo);
      const blanco = u.huyendo && Math.floor(tiempoRender * 3) % 2 === 0;
      const textura = blanco ? texturaBanderaBlanca : texturaBandera[u.equipo];
      s.tint = blanco && u.retirada ? 0xffb347 : 0xffffff;                         // en retirada controlada parpadea en ámbar
      if (s.texture !== textura) s.texture = textura;
      const bote = seleccion.includes(u) ? Math.abs(Math.sin(tiempoRender * 7)) * 0.6 * ESCALA : 0;
      s.scale.set(u.esGeneral ? 1.5 : 1);          // el estandarte del general es mayor
      s.position.set(aPantallaX(u.origenX, u.origenY), aPantallaY(u.origenX, u.origenY) - bote); s.zIndex = profundidad(u.origenX, u.origenY) + 0.3;
      // insignia del tipo, a la izquierda del asta (con el estandarte del general, que es mayor, también crece)
      const insignia = insignias[idx], escalaBandera = u.esGeneral ? 1.5 : 1;
      insignia.visible = s.visible; insignia.width = Math.max(1.8 * ESCALA * escalaBandera, 22 / mundo.scale.x); insignia.height = insignia.width * ALTO_INSIGNIA / 96;   // al alejar la cámara, nunca menos de 22 px
      insignia.position.set(s.x - 0.2 * ESCALA, s.y - 3.5 * ESCALA * escalaBandera); insignia.zIndex = s.zIndex + 0.01;
    });
    // cursor según lo que hay bajo el ratón (lo decide el juego)
    if (opciones.cursor && control.ratonX !== undefined) { const [mx, my] = pantallaAMundo(control.ratonX, control.ratonY); const c = opciones.cursor(mx, my, control.ratonX, control.ratonY); if (c !== vista.style.cursor) vista.style.cursor = c; }

    app.renderer.render(app.stage);
  }
  app.ticker.stop();
  function encuadrarEn(x, y, factor) {
    encuadrar();
    const w = contenedor.clientWidth, h = contenedor.clientHeight, escala = mundo.scale.x * factor;
    mundo.scale.set(escala);
    mundo.position.set(w / 2 - aPantallaX(x, y) * escala, h / 2 - aPantallaY(x, y) * escala);
  }
  // centrar la vista en un punto sin cambiar el zoom (minimapa)
  function centrarEn(x, y) { const w = contenedor.clientWidth, h = contenedor.clientHeight, escala = mundo.scale.x; mundo.position.set(w / 2 - aPantallaX(x, y) * escala, h / 2 - aPantallaY(x, y) * escala); }
  // centro actual de la vista en metros y sus esquinas (para el minimapa)
  function vista_() { const w = contenedor.clientWidth, h = contenedor.clientHeight; const [cx, cy] = pantallaAMundo(vista.getBoundingClientRect().left + w / 2, vista.getBoundingClientRect().top + h / 2); const esquinas = [[0, 0], [w, 0], [0, h], [w, h]].map(([px, py]) => pantallaAMundo(vista.getBoundingClientRect().left + px, vista.getBoundingClientRect().top + py)); return { cx, cy, esquinas, zoom: mundo.scale.x }; }
  function destruir() { pistaAltura.remove(); window.removeEventListener('resize', encuadrar); app.destroy(true, { children: true, texture: true, baseTexture: true }); }
  // retrato para las tarjetas: el mismo dibujo del soldado (de frente, quieto) volcado a un canvas
  function retrato(equipo, tipo, rama, nivel, general) {
    try { const sprite = new PIXI.Sprite(texturaSoldado(equipo, tipo, 2, 'quieto', rama, nivel, general)); const lienzo = recortarLienzo(app.renderer.extract.canvas(sprite)); sprite.destroy(); return lienzo; }
    catch (e) { console.warn('retrato:', e.message); return null; }
  }
  return { dibujar, destruir, encuadrarEn, centrarEn, pantallaAMundo, mundoAPantalla, unidadBajoPuntero, vista: vista_, retrato, sangrar, mostrarZona };
}
