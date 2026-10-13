'use strict';
/* ---------- Sprites desde archivos (arte propio) ----------
   Lee arte/manifest.json y las hojas PNG que describe. Si existe arte para un tipo de tropa, el renderizador lo usa en vez
   del dibujo por código; si no, sigue el dibujo. Formato en arte/LEEME.md. Resumen del manifest:
   {
     "pxPorMetro": 40,
     "tipos": {
       "infanteriaPesada": {
         "hoja": "infanteriaPesada.png", "celda": [96, 128], "ancla": [0.5, 0.92],
         "direcciones": ["S", "SW", "W", "NW", "N"],          // filas de la hoja; las que falten se obtienen en espejo
         "animaciones": { "quieto": [0], "paso": [1, 2, 3, 4], "golpe": [5, 6], "cadaver": [7] },   // columnas
         "mascara": "infanteriaPesada_mascara.png",            // opcional: misma rejilla, blanco donde va el color del reino
         "mascara2": "infanteriaPesada_mascara2.png"           // opcional: igual, para el esmalte secundario
       }
     }
   } */
const DIRECCIONES_PANTALLA = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];   // índice d del renderizador (0 derecha, horario)
const ESPEJO_DE = { E: 'W', NE: 'NW', SE: 'SW', W: 'E', NW: 'NE', SW: 'SE', N: 'N', S: 'S' };
const CLAVES_NIVEL = ['leva', 'milicia', 'hombresDeArmas', 'veteranos'];
// Variantes: una entrada del manifest puede limitarse a una rama (`rama`) y a un nivel mínimo (`nivelMinimo`, clave o índice 0-3).
// La clave de la entrada puede ser `tipo`, `tipo.rama`, `tipo.rama.nivel` o `tipo..nivel`; los campos explícitos mandan.
function interpretarClave(clave, t) {
  const partes = clave.split('.');
  const tipo = t.tipo || partes[0];
  const rama = t.rama !== undefined ? t.rama : (partes[1] || null);
  let nivelMinimo = t.nivelMinimo !== undefined ? t.nivelMinimo : (partes[2] || null);
  if (typeof nivelMinimo === 'string') nivelMinimo = CLAVES_NIVEL.indexOf(nivelMinimo) >= 0 ? CLAVES_NIVEL.indexOf(nivelMinimo) : (isNaN(Number(nivelMinimo)) ? null : Number(nivelMinimo));
  return { tipo, ramas: rama ? [].concat(rama) : null, nivelMinimo: nivelMinimo === null || nivelMinimo === undefined ? -1 : nivelMinimo };
}
// Para cada dirección de pantalla, qué fila usar: la propia, su espejo o, si faltan, la más cercana (con una sola imagen de
// frente ya se puede probar; con S, SW, W, NW y N queda completo).
function asignarDirecciones(filas) {
  return DIRECCIONES_PANTALLA.map((d, indice) => {
    if (filas[d] !== undefined) return { fila: filas[d], espejo: false };
    if (filas[ESPEJO_DE[d]] !== undefined) return { fila: filas[ESPEJO_DE[d]], espejo: true };
    for (let distancia = 1; distancia <= 4; distancia++) {
      for (const signo of [1, -1]) {
        const vecina = DIRECCIONES_PANTALLA[(indice + signo * distancia + 8) % 8];
        if (filas[vecina] !== undefined) return { fila: filas[vecina], espejo: false };
        if (filas[ESPEJO_DE[vecina]] !== undefined) return { fila: filas[ESPEJO_DE[vecina]], espejo: true };
      }
    }
    return null;
  });
}

async function cargarArte(ruta) {
  ruta = ruta || 'arte/manifest.json';
  let manifest = null;
  try { const r = await fetch(ruta, { cache: 'no-store' }); if (r.ok) manifest = await r.json(); } catch (e) { /* abierto como archivo local: fetch no puede leer; se intenta manifest.js */ }
  if (!manifest) {
    // alternativa para file://: arte/manifest.js con `window.ARTE_MANIFEST = { ... }`
    manifest = await new Promise(res => { const s = document.createElement('script'); s.src = ruta.replace(/\.json$/, '.js'); s.onload = () => res(window.ARTE_MANIFEST || null); s.onerror = () => res(null); document.head.appendChild(s); });
  }
  if (!manifest || !manifest.tipos) return null;
  const base = ruta.slice(0, ruta.lastIndexOf('/') + 1);
  const cargarImagen = src => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = () => rej(new Error('no se pudo cargar ' + src.slice(0, 40)));
    img.src = src.startsWith('data:') ? src : base + src;       // el empaquetador (tools/empaquetar-arte.js) incrusta las hojas como data:
  });
  // WebGL rechaza imágenes "de otro origen", y abiertas como archivo local (file://) lo son todas: se comprueba antes de
  // subirlas para que el tipo quede con el dibujo por código en vez de romper el renderizado en cada fotograma
  const contaminada = img => { try { const c = document.createElement('canvas'); c.width = c.height = 1; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); ctx.getImageData(0, 0, 1, 1); return false; } catch (e) { return true; } };
  const arte = { pxPorMetro: manifest.pxPorMetro || 40, tipos: {} };
  for (const [clave, t] of Object.entries(manifest.tipos)) {
    try {
      const img = await cargarImagen(t.hoja);
      if (contaminada(img)) throw new Error(clave + ': el navegador no deja usar ' + t.hoja.slice(0, 40) + ' desde file://; ejecuta `node tools/empaquetar-arte.js` para generar arte/manifest.js con las hojas incrustadas, o publica la carpeta');
      const [cw, ch] = t.celda;
      const baseTex = PIXI.BaseTexture.from(img, { scaleMode: PIXI.SCALE_MODES.LINEAR, mipmap: PIXI.MIPMAP_MODES.ON });
      const mascaras = [];
      for (const campo of ['mascara', 'mascara2']) { if (t[campo]) { const im = await cargarImagen(t[campo]); mascaras.push(PIXI.BaseTexture.from(im, { scaleMode: PIXI.SCALE_MODES.LINEAR })); } else mascaras.push(null); }
      const filas = {}; t.direcciones.forEach((d, i) => { filas[d] = i; });
      const porDireccion = asignarDirecciones(filas);
      if (porDireccion.some(x => !x)) throw new Error('la entrada ' + clave + ' no declara ninguna dirección');
      const faltan = ['S', 'SW', 'W', 'NW', 'N'].filter(d => filas[d] === undefined);
      if (faltan.length) console.info('arte: ' + clave + ' sin las direcciones ' + faltan.join(', ') + '; se usan las más cercanas');
      const cortar = (tex, fila, col) => new PIXI.Texture(tex, new PIXI.Rectangle(col * cw, fila * ch, cw, ch));
      const texturas = {}, texturasMascara = [{}, {}];
      const columnas = new Set(Object.values(t.animaciones).flat());
      porDireccion.forEach((pd, d) => { for (const col of columnas) { texturas[d + ':' + col] = cortar(baseTex, pd.fila, col); mascaras.forEach((m, k) => { if (m) texturasMascara[k][d + ':' + col] = cortar(m, pd.fila, col); }); } });
      arte.tipos[clave] = Object.assign(interpretarClave(clave, t), { texturas, texturasMascara, espejo: porDireccion.map(pd => pd.espejo), animaciones: t.animaciones, ancla: t.ancla || [0.5, 0.92], escala: (t.pxPorMetro || arte.pxPorMetro), conMascara: mascaras.map(m => !!m) });
    } catch (e) { console.warn('arte:', e.message); }
  }
  // Elige la variante para una unidad: mismo tipo, rama compatible y el nivel mínimo más alto que no supere el de la unidad
  // (una variante con rama gana a una genérica en caso de empate). Se cachea por tipo+rama+nivel.
  const cacheVariantes = new Map();
  arte.paraUnidad = (tipoClave, rama, nivel) => {
    const claveCache = tipoClave + '|' + (rama || '') + '|' + (nivel === undefined ? -1 : nivel);
    if (cacheVariantes.has(claveCache)) return cacheVariantes.get(claveCache);
    let mejor = null;
    for (const variante of Object.values(arte.tipos)) {
      if (variante.tipo !== tipoClave) continue;
      if (variante.ramas && !variante.ramas.includes(rama)) continue;
      if (variante.nivelMinimo > (nivel === undefined ? 0 : nivel)) continue;
      const puntuacion = variante.nivelMinimo * 2 + (variante.ramas ? 1 : 0);
      if (!mejor || puntuacion > mejor.puntuacion) mejor = { variante, puntuacion };
    }
    const resultado = mejor ? mejor.variante : null;
    cacheVariantes.set(claveCache, resultado);
    return resultado;
  };
  return Object.keys(arte.tipos).length ? arte : null;
}
