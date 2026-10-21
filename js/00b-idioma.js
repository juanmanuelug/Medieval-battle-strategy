'use strict';
/* ---------- Idioma: español / inglés, cambiable en cualquier momento (2026-10-13, tras la prueba con amigos) ----------
   El juego está escrito en español; el inglés sale de js/idioma-en.js:
   · TEXTOS_EN: diccionario exacto «texto en español» → «text in English».
   · PATRONES_EN: expresiones regulares para frases con números o nombres (también los mensajes del servidor).
   Tres mecanismos:
   1. Tablas de datos (nombres de tropas, formaciones, ramas, climas…): registrarTraducibles(objeto, campos) guarda el
      original y, al cambiar de idioma, reescribe esos campos. Así cualquier frase que se construya después ya lleva los
      nombres en el idioma elegido.
   2. La página: traducirArbol recorre nodos de texto y atributos (title, placeholder, aria-label, alt) y los traduce si están en
      el diccionario o casan con un patrón; un MutationObserver hace lo mismo con todo lo que se pinte después. El original
      se guarda para volver al español.
   3. tr(plantilla, valores): para las frases que se montan en el código con datos («{n} unidades»).
   cambiarIdioma(clave) guarda la elección, traduce la página y avisa (alCambiarIdioma) para repintar la pantalla abierta. */
const CLAVE_IDIOMA = 'batallas.idioma.v1';
const IDIOMAS = { es: 'Español', en: 'English' };
let idiomaActual = (() => {
  const guardado = leerLocal(CLAVE_IDIOMA); if (IDIOMAS[guardado]) return guardado;
  return (typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language || '')) ? 'en' : 'es';
})();
const enIngles = () => idiomaActual === 'en' && typeof TEXTOS_EN !== 'undefined';

// Traduce un texto suelto (sin tocar los espacios de los bordes): diccionario exacto, luego patrones
function traducirTexto(texto) {
  if (!enIngles() || !texto) return texto;
  const recortado = texto.trim(); if (!recortado) return texto;
  let traducido = TEXTOS_EN[recortado];
  if (traducido === undefined && typeof PATRONES_EN !== 'undefined') {
    for (const [patron, sustitucion] of PATRONES_EN) { if (patron.test(recortado)) { traducido = recortado.replace(patron, sustitucion); break; } }
  }
  if (traducido === undefined) {
    // títulos de varias líneas: línea a línea
    if (recortado.includes('\n')) { const lineas = recortado.split('\n').map(l => traducirTexto(l)); traducido = lineas.join('\n'); if (traducido === recortado) return texto; }
    else return texto;
  }
  return texto.replace(recortado, traducido);
}
// Plantilla con valores: tr('{n} unidades', { n: 3 })
function tr(plantilla, valores) {
  let texto = enIngles() && TEXTOS_EN[plantilla] !== undefined ? TEXTOS_EN[plantilla] : plantilla;
  if (valores) texto = texto.replace(/\{(\w+)\}/g, (m, clave) => valores[clave] !== undefined ? valores[clave] : m);
  return texto;
}

/* ----- 1. tablas de datos ----- */
const traducibles = [];   // { objeto, campo, original }
function registrarTraducibles(objeto, campos) {
  if (!objeto) return;
  for (const campo of campos) {
    const original = objeto[campo];
    if (typeof original === 'string' || Array.isArray(original)) traducibles.push({ objeto, campo, original: Array.isArray(original) ? original.slice() : original });
  }
}
function aplicarIdiomaADatos() {
  for (const { objeto, campo, original } of traducibles) objeto[campo] = Array.isArray(original) ? original.map(v => typeof v === 'string' ? traducirTexto(v) : v) : traducirTexto(original);
}

/* ----- 2. la página ----- */
const originales = new WeakMap();                 // nodo de texto → texto en español
const ATRIBUTOS_TRADUCIBLES = ['title', 'placeholder', 'aria-label', 'alt'];
function traducirNodoTexto(nodo) {
  const padre = nodo.parentNode; if (!padre || padre.nodeName === 'SCRIPT' || padre.nodeName === 'STYLE') return;
  let original = originales.get(nodo);
  // si el texto cambió desde la última traducción (lo ha reescrito el juego), el nuevo es el original
  if (original === undefined || (nodo.__traducido !== undefined && nodo.nodeValue !== nodo.__traducido)) { original = nodo.nodeValue; originales.set(nodo, original); }
  const nuevo = idiomaActual === 'es' ? original : traducirTexto(original);
  if (nodo.nodeValue !== nuevo) nodo.nodeValue = nuevo;
  nodo.__traducido = nuevo;
}
function traducirAtributos(elemento) {
  for (const atributo of ATRIBUTOS_TRADUCIBLES) {
    if (!elemento.hasAttribute || !elemento.hasAttribute(atributo)) continue;
    const marca = 'es' + atributo.replace('-', '');
    const actual = elemento.getAttribute(atributo);
    if (elemento.dataset[marca] === undefined || (elemento.dataset[marca + 'T'] !== undefined && actual !== elemento.dataset[marca + 'T'])) elemento.dataset[marca] = actual;
    const nuevo = idiomaActual === 'es' ? elemento.dataset[marca] : traducirTexto(elemento.dataset[marca]);
    if (actual !== nuevo) elemento.setAttribute(atributo, nuevo);
    elemento.dataset[marca + 'T'] = nuevo;
  }
}
function traducirArbol(raiz) {
  if (!raiz) return;
  if (raiz.nodeType === 3) return traducirNodoTexto(raiz);
  if (raiz.nodeType !== 1) return;
  traducirAtributos(raiz);
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let nodo; while ((nodo = recorrido.nextNode())) { if (nodo.nodeType === 3) traducirNodoTexto(nodo); else traducirAtributos(nodo); }
}
let observadorIdioma = null, traduciendo = false;
function vigilarPagina() {
  if (observadorIdioma || typeof MutationObserver === 'undefined') return;
  observadorIdioma = new MutationObserver(mutaciones => {
    if (traduciendo || idiomaActual === 'es') return;
    traduciendo = true;
    try {
      for (const m of mutaciones) {
        if (m.type === 'characterData') traducirNodoTexto(m.target);
        else if (m.type === 'attributes') traducirAtributos(m.target);
        else for (const nodo of m.addedNodes) traducirArbol(nodo);
      }
    } finally { traduciendo = false; }
  });
  observadorIdioma.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS_TRADUCIBLES });
}

/* ----- cambiar de idioma ----- */
const oyentesIdioma = [];
const alCambiarIdioma = funcion => oyentesIdioma.push(funcion);
function cambiarIdioma(clave) {
  if (!IDIOMAS[clave]) return;
  idiomaActual = clave;
  guardarLocal(CLAVE_IDIOMA, clave);
  document.documentElement.lang = clave;
  aplicarIdiomaADatos();
  traduciendo = true; try { traducirArbol(document.body); } finally { traduciendo = false; }
  for (const funcion of oyentesIdioma) { try { funcion(clave); } catch (e) { console.warn('idioma:', e); } }
  pintarSelectorIdioma();
}
// Selector fijo en una esquina, en todas las pantallas (también en batalla)
function pintarSelectorIdioma() {
  let selector = document.getElementById('selector-idioma');
  if (!selector) {
    selector = document.createElement('div'); selector.id = 'selector-idioma'; selector.setAttribute('role', 'group');
    selector.innerHTML = Object.keys(IDIOMAS).map(k => `<button type="button" data-idioma="${k}" title="${IDIOMAS[k]}">${k.toUpperCase()}</button>`).join('');
    selector.addEventListener('click', e => { const b = e.target.closest('[data-idioma]'); if (b) cambiarIdioma(b.dataset.idioma); });
    document.body.appendChild(selector);
  }
  for (const b of selector.querySelectorAll('[data-idioma]')) b.classList.toggle('activo', b.dataset.idioma === idiomaActual);
}
// Arranque: cuando todos los scripts están cargados se registran las tablas (cada script las declara con registrarTraducibles
// en registrarDatosTraducibles) y se aplica el idioma guardado
function iniciarIdioma() {
  if (typeof registrarDatosTraducibles === 'function') registrarDatosTraducibles();
  pintarSelectorIdioma();
  vigilarPagina();
  if (idiomaActual !== 'es') cambiarIdioma(idiomaActual); else document.documentElement.lang = 'es';
}
// (no es elementoListo de 11-pantallas.js: con la página ya cargada, este espera a que acaben de cargarse los demás scripts)
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarIdioma); else setTimeout(iniciarIdioma, 0); }
