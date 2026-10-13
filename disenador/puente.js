'use strict';
/* ---------- Puente con el motor del diseñador de estandartes ----------
   Se carga ANTES de disenador/js/05-render-svg.js y define lo que ese módulo espera del resto de la app del diseñador:
   el estado, los valores por defecto del acabado, la selección múltiple y unas funciones vacías. El motor pinta en un
   <svg id="canvas"> oculto (lo busca al cargar). Después, `PuenteDisenador.renderizarBlason` convierte un estado del
   diseñador (el JSON que exporta con «Guardar .json») en un canvas listo para usarse como textura o imagen. */
const FINISH_DEFAULT = () => ({ fringe: { on: false, len: 28, color: '#d9a92c' }, cord: { on: false, width: 7, color: '#d9a92c', color2: '#7a1a1f' } });
let state = { width: 600, height: 800, shape: 'swallowtail', outline: { color: '#2a201a', width: 8 }, pole: false, field: { pattern: 'plain', count: 6, regions: ['#b3202c'] }, finish: FINISH_DEFAULT(), layers: [], selectedId: null };
const multiSel = new Set();
function updateSizeNote() {}
function renderLayerList() {}
function renderProps() {}
function ensureFinish() { const d = FINISH_DEFAULT(); const cur = state.finish || {}; state.finish = {}; for (const k in d) state.finish[k] = Object.assign({}, d[k], cur[k] || {}); }
// Versión mínima de la migración del diseñador: patrón conocido y regiones como array
function migrateField(node) { if (!node) return; if (!PATTERNS[node.pattern]) node.pattern = 'plain'; if (!Array.isArray(node.regions)) node.regions = (node.colors || ['#b3202c', '#d9a92c']).slice(); node.regions.forEach(r => { if (r && typeof r === 'object') migrateField(r); }); }

const PuenteDisenador = {
  // ¿Parece un proyecto del diseñador?
  esEstadoValido(obj) { return !!(obj && Array.isArray(obj.layers) && obj.field && SHAPES[obj.shape]); },
  // Estado → SVG (texto) con sus figuras cargadas
  async aSvg(estado) {
    state = JSON.parse(JSON.stringify(estado));
    state.layers.forEach((l, k) => { if (!/^[A-Za-z][\w-]*$/.test(String(l.id || ''))) l.id = 'B' + k; });
    migrateField(state.field); ensureFinish();
    await ensureFigures(state);
    const { s, vb } = buildInner(false, false);
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vb.w}" height="${vb.h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">${s}</svg>`, vb };
  },
  // Estado → canvas de `anchoPx` de ancho (alto proporcional). Las fuentes de los textos no viajan dentro de la imagen:
  // los lemas salen con la fuente de respaldo del navegador.
  // El motor pinta sobre un estado global, así que las rasterizaciones se encadenan una detrás de otra: si dos corrieran a la
  // vez (por ejemplo los cinco blasones de la pantalla de rama) se mezclarían los colores de una con las figuras de otra.
  renderizarBlason(estado, anchoPx) {
    const anterior = this.colaRasterizado || Promise.resolve();
    const tarea = anterior.catch(() => {}).then(() => this.rasterizarAhora(estado, anchoPx));
    this.colaRasterizado = tarea.catch(() => {});
    return tarea;
  },
  async rasterizarAhora(estado, anchoPx) {
    const { svg, vb } = await this.aSvg(estado);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const imagen = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('no se pudo rasterizar el blasón')); img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = anchoPx; canvas.height = Math.max(1, Math.round(anchoPx * vb.h / vb.w));
      canvas.getContext('2d').drawImage(imagen, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally { URL.revokeObjectURL(url); }
  },
  // Blasón por defecto según la rama: campo partido en los colores de la rama y su figura, en escudo heráldico
  blasonPorDefecto(colorPrimario, colorSecundario, simbolo) {
    return { width: 600, height: 700, shape: 'heater', outline: { color: '#2a201a', width: 10 }, pole: false,
      field: { pattern: 'perPale', count: 6, regions: [colorPrimario, colorSecundario] }, finish: FINISH_DEFAULT(),
      layers: [{ id: 'B0', type: 'symbol', symbol: simbolo, name: simbolo, fill: colorSecundario, fill2: colorPrimario, stroke: '#2a201a', strokeWidth: 1.5, x: 300, y: 320, scale: 3.2, rotation: 0, opacity: 1, flipX: false, clip: true, visible: true, counter: true }],
      selectedId: null };
  },
};
