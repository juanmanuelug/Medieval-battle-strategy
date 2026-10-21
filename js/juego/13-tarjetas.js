'use strict';
/* ---------- Barra de tarjetas de unidad (parte inferior de la pantalla de batalla) ----------
   Una tarjeta por unidad propia: retrato del soldado (con su rama y nivel), tipo, veteranía en galones, barra de vida
   (soldados en pie sobre el total) y barra de moral. Clic = seleccionar (Mayús añade), doble clic = centrar la cámara,
   arrastrar = cambiar el orden en la barra (acciones.alReordenar recibe las unidades en el nuevo orden). La insignia de arriba
   a la derecha es el número de grupo (acciones.grupoDe).
   Se construye una vez al empezar la batalla y después solo se actualizan valores y clases, sin rehacer el DOM. */
const ICONOS_TIPO = {
  // glifos SVG sencillos (24×24) para reconocer el tipo de un vistazo
  infanteriaLigera: '<path d="M5 19 L17 7 M15 5 l4 4 M8 16 l-2 2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
  infanteriaPesada: '<path d="M12 3 l7 3 v6 c0 4-3 7-7 9 c-4-2-7-5-7-9 V6 z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7 v9" stroke="currentColor" stroke-width="2"/>',
  lanceros: '<path d="M5 20 L18 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M15 4 l5 0 l0 5 z" fill="currentColor"/>',
  arqueros: '<path d="M7 4 q10 8 0 16" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 4 L7 20 M9 12 L20 12" stroke="currentColor" stroke-width="1.6"/><path d="M20 12 l-3-2 v4 z" fill="currentColor"/>',
  ballesteros: '<path d="M4 8 q8 6 16 0" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 6 V21 M8 14 h8" stroke="currentColor" stroke-width="2"/>',
  caballeriaPesada: '<path d="M4 19 c0-6 3-9 7-9 h3 l3-4 l2 1 l-1 4 c2 1 2 4 2 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 19 v-4 M16 19 v-4" stroke="currentColor" stroke-width="2"/>',
  caballeriaLigera: '<path d="M4 19 c0-6 3-9 7-9 h3 l3-4 l2 1 l-1 4 c2 1 2 4 2 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 19 v-4 M16 19 v-4 M3 6 l5 5" stroke="currentColor" stroke-width="1.6"/>',
  arquerosACaballo: '<path d="M4 19 c0-6 3-9 7-9 h3 l3-4 l2 1 l-1 4 c2 1 2 4 2 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 3 q5 4 0 8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  // exclusivas de rama (2026-10-13): lanza de justa, hacha a dos manos, cruz templaria, hacha doble
  caballeros: '<path d="M3 21 L14 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M13 7 L21 3 L17 11 Z" fill="currentColor"/><path d="M9 13 l3 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  guardiaVarega: '<path d="M6 21 L15 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M13 4 c4 0 7 3 7 7 c-3 0-5-1-7-3 z" fill="currentColor"/>',
  templarios: '<path d="M10 3 h4 v7 h7 v4 h-7 v7 h-4 v-7 h-7 v-4 h7 z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  berserkers: '<path d="M12 4 V21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 6 c-5-2-8 1-8 5 c3-1 6-1 8 1 z M12 6 c5-2 8 1 8 5 c-3-1-6-1-8 1 z" fill="currentColor"/>',
  // mangonel: armazón, brazo y piedra
  mangoneles: '<path d="M3 19 H21 M6 19 L10 11 L14 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 13 L18 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="19" cy="4" r="2.2" fill="currentColor"/><circle cx="7" cy="20" r="1.6" fill="currentColor"/><circle cx="17" cy="20" r="1.6" fill="currentColor"/>',
  // guardia del general: corona (la usa la insignia del estandarte en el campo)
  general: '<path d="M4 17 L5 8 L9 12 L12 6 L15 12 L19 8 L20 17 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 20 H20" stroke="currentColor" stroke-width="2"/>',
};
// el nombre corto de cada tropa está en TIPOS (nombreCorto, 01-datos-unidades.js)
// galones de un nivel (uno por nivel, desde milicia); 11-pantallas.js los envuelve para las tiendas
const galonesHtml = nivel => '<span class="galon"></span>'.repeat(nivel + 1);

function construirBarraUnidades(contenedor, unidades, acciones) {
  contenedor.replaceChildren();
  const tarjetas = new Map();
  for (const unidad of unidades) {
    const clave = TIPOS[unidad.tipo].clave;
    const tarjeta = document.createElement('button');
    tarjeta.type = 'button';
    tarjeta.className = 'tarjeta-unidad' + (unidad.esGeneral ? ' general' : '');
    tarjeta.title = unidad.nombre + ' · clic: seleccionar (Mayús añade) · doble clic: ir a la unidad · arrastrar: cambiar el orden';
    const galones = unidad.esGeneral ? '★' : galonesHtml(unidad.nivel || 0);
    tarjeta.innerHTML = `<span class="tipo-icono"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${ICONOS_TIPO[clave] || ''}</svg></span>
      <span class="galones" title="${unidad.esGeneral ? 'General' : NIVELES[unidad.nivel || 0].nombre}">${galones}</span>
      <span class="grupo-insignia" title="Grupo (pulsa su número para seleccionarlo)"></span>
      <span class="retrato"></span>
      <span class="cuenta"></span>
      <span class="municion" title="Andanadas"></span>
      <span class="nombre-tipo">${textoEsc(unidad.esGeneral ? 'General' : TIPOS[unidad.tipo].nombreCorto || TIPOS[unidad.tipo].nombre)}</span>
      <span class="barra cohesion" title="Cohesión"><span></span></span>
      <span class="barra vida" title="Vida"><span></span></span>
      <span class="barra moral" title="Moral"><span></span></span>`;
    const retrato = acciones.retrato(unidad);
    if (retrato) { retrato.className = 'retrato-lienzo'; tarjeta.querySelector('.retrato').appendChild(retrato); }
    tarjeta.addEventListener('click', e => { if (arrastre.recienSoltado) { arrastre.recienSoltado = false; return; } acciones.seleccionar(unidad, e.shiftKey); });
    tarjeta.unidad = unidad;
    tarjeta.addEventListener('dblclick', () => acciones.centrar(unidad));
    contenedor.appendChild(tarjeta);
    tarjetas.set(unidad, { tarjeta, vida: tarjeta.querySelector('.vida > span'), moral: tarjeta.querySelector('.moral > span'), cuenta: tarjeta.querySelector('.cuenta'), municion: tarjeta.querySelector('.municion'), cohesion: tarjeta.querySelector('.cohesion > span'), grupo: tarjeta.querySelector('.grupo-insignia') });
  }
  /* Reordenar arrastrando: se pulsa una tarjeta y, al moverse más de 6 px, pasa a arrastrarse; mientras tanto se recoloca en
     vivo delante de la tarjeta cuyo centro queda a la derecha del puntero. Al soltar se avisa con el nuevo orden. El clic que
     el navegador lanza al soltar se descarta (recienSoltado) para que arrastrar no seleccione. */
  const arrastre = { tarjeta: null, inicioX: 0, activo: false, recienSoltado: false };
  contenedor.addEventListener('pointerdown', e => {
    const tarjeta = e.target.closest('.tarjeta-unidad');
    if (!tarjeta || e.button !== 0) return;
    Object.assign(arrastre, { tarjeta, inicioX: e.clientX, activo: false, recienSoltado: false, puntero: e.pointerId });
  });
  contenedor.addEventListener('pointermove', e => {
    if (!arrastre.tarjeta || e.pointerId !== arrastre.puntero) return;
    if (!arrastre.activo) {
      if (Math.abs(e.clientX - arrastre.inicioX) < 6) return;
      arrastre.activo = true; arrastre.tarjeta.classList.add('arrastrando'); contenedor.classList.add('reordenando');
      try { contenedor.setPointerCapture(e.pointerId); } catch (error) {}
    }
    const otras = [...contenedor.querySelectorAll('.tarjeta-unidad')].filter(c => c !== arrastre.tarjeta);
    const siguiente = otras.find(c => { const caja = c.getBoundingClientRect(); return e.clientX < caja.left + caja.width / 2; });
    if (siguiente) { if (arrastre.tarjeta.nextSibling !== siguiente) contenedor.insertBefore(arrastre.tarjeta, siguiente); }
    else if (contenedor.lastElementChild !== arrastre.tarjeta) contenedor.appendChild(arrastre.tarjeta);
    // si la barra tiene desplazamiento, acercarse al borde la desplaza
    const cajaBarra = contenedor.getBoundingClientRect();
    if (e.clientX < cajaBarra.left + 30) contenedor.scrollLeft -= 12; else if (e.clientX > cajaBarra.right - 30) contenedor.scrollLeft += 12;
  });
  const soltar = e => {
    if (!arrastre.tarjeta || (e && e.pointerId !== arrastre.puntero)) return;
    const habiaArrastre = arrastre.activo;
    arrastre.tarjeta.classList.remove('arrastrando'); contenedor.classList.remove('reordenando');
    arrastre.tarjeta = null; arrastre.activo = false; arrastre.recienSoltado = habiaArrastre;
    if (habiaArrastre) { setTimeout(() => { arrastre.recienSoltado = false; }, 0); if (acciones.alReordenar) acciones.alReordenar([...contenedor.querySelectorAll('.tarjeta-unidad')].map(c => c.unidad)); }
  };
  contenedor.addEventListener('pointerup', soltar);
  contenedor.addEventListener('pointercancel', soltar);
  return {
    actualizar(seleccion) {
      const seleccionadas = new Set(seleccion || []);
      for (const [unidad, partes] of tarjetas) {
        const vida = unidad.total ? unidad.vivos / unidad.total : 0;
        const moral = unidad.moralMax ? Math.max(0, Math.min(1, unidad.moral / unidad.moralMax)) : 0;
        partes.vida.style.width = (vida * 100).toFixed(0) + '%';
        partes.moral.style.width = (moral * 100).toFixed(0) + '%';
        // el título de la barra explica la moral: valor y factores
        const factores = (unidad.factoresMoral || []).map(f => f[0] + ' ' + (f[1] > 0 ? '+' : '−') + Math.abs(f[1])).join(', ');
        partes.moral.parentNode.title = 'Moral ' + Math.round(unidad.moral) + ' de ' + Math.round(unidad.moralMax) + (factores ? ': ' + factores : '');
        partes.cohesion.style.width = Math.round(unidad.cohesion === undefined ? 100 : unidad.cohesion) + '%';
        partes.cuenta.textContent = unidad.vivos;
        partes.municion.textContent = TIPOS[unidad.tipo].alcanceTiro ? (unidad.sinMunicion ? '✕' : '➶' + unidad.municion) : '';
        partes.tarjeta.classList.toggle('sin-municion', !!unidad.sinMunicion);
        partes.tarjeta.classList.toggle('seleccionada', seleccionadas.has(unidad));
        partes.tarjeta.classList.toggle('huyendo', !!unidad.huyendo && !unidad.retirada && unidad.vivos > 0);
        partes.tarjeta.classList.toggle('retirada', !!unidad.retirada && unidad.vivos > 0);
        partes.tarjeta.classList.toggle('aniquilada', unidad.vivos === 0);
        partes.tarjeta.classList.toggle('luchando', unidad.luchando > 0);
        partes.tarjeta.disabled = unidad.vivos === 0;
        const grupo = acciones.grupoDe ? acciones.grupoDe(unidad) : null;
        partes.grupo.textContent = grupo || '';
        partes.tarjeta.classList.toggle('en-grupo', !!grupo);
      }
    },
  };
}
