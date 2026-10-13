'use strict';
/* ---------- Pantallas del juego: reino → rama → tienda → batalla → resultado ---------- */
const PANTALLAS = ['inicio', 'menu', 'reino', 'rama', 'tienda', 'personalizada', 'batalla', 'resultado', 'multijugador'];
// modo elegido en el menú: 'normal' (la IA recluta) o 'personalizada' (el jugador monta el ejército enemigo)
let modoBatalla = 'normal';
window.errores = [];
window.addEventListener('error', e => { window.errores.push(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno); });
let reino = null, batalla = null, blasonImportado = null, ultimaBatalla = null;

function mostrar(nombre) {
  for (const p of PANTALLAS) elemento('#pantalla-' + p).classList.toggle('activa', p === nombre);
  document.body.classList.toggle('en-batalla', nombre === 'batalla');
}
const html = (sel, contenido) => { elemento(sel).innerHTML = contenido; };
const textoEsc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const oro = n => n.toLocaleString('es-ES') + ' oro';

/* ----- blasón ----- */
async function pintarBlason(selectorImg, estado, ancho) {
  try { const c = await PuenteDisenador.renderizarBlason(estado, ancho || 240); elemento(selectorImg).src = c.toDataURL('image/png'); elemento(selectorImg).classList.remove('oculto'); }
  catch (e) { console.warn(e); }
}

/* ----- pantalla 1: crear reino ----- */
function iniciarPantallaReino() {
  elemento('#in-blason-json').addEventListener('change', e => {
    const archivo = e.target.files[0]; if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const obj = JSON.parse(lector.result);
        if (!PuenteDisenador.esEstadoValido(obj)) throw new Error('formato');
        obj.layers = obj.layers.filter(l => l.type !== 'image' || l.src);   // las imágenes PNG del diseñador sí viajan en el JSON
        blasonImportado = obj;
        elemento('#radio-blason-importado').checked = true;
        pintarBlason('#img-blason-previo', obj, 240);
        elemento('#nota-blason').textContent = 'Blasón importado: ' + obj.layers.length + ' capas, silueta «' + (SHAPES[obj.shape] ? SHAPES[obj.shape].name : obj.shape) + '».';
      } catch (err) { elemento('#nota-blason').textContent = 'El archivo no es un proyecto del diseñador de estandartes (.json).'; }
    };
    lector.readAsText(archivo); e.target.value = '';
  });
  elemento('#form-reino').addEventListener('submit', e => {
    e.preventDefault();
    reino = nuevoReino(elemento('#in-nombre-reino').value.trim(), elemento('#in-nombre-rey').value.trim());
    if (elemento('#radio-blason-importado').checked && blasonImportado) reino.blason = { modo: 'importado', estado: blasonImportado };
    guardarReino(reino);
    iniciarPantallaMenu();
    mostrar('menu');
  });
}

/* ----- pantalla 0: inicio y menú ----- */
function iniciarPantallaInicio() {
  const hay = !!reino;
  elemento('#btn-inicio-nuevo').classList.toggle('oculto', hay);
  elemento('#btn-inicio-continuar').classList.toggle('oculto', !hay);
  elemento('#btn-inicio-borrar').classList.toggle('oculto', !hay);
  html('#inicio-reino', hay ? `Reino guardado: <strong>${textoEsc(reino.nombre)}</strong>, ${textoEsc(reino.rey)}${reino.rama ? ' · ' + textoEsc(RAMAS[reino.rama].nombre) : ''} · ${reino.victorias} victorias, ${reino.derrotas} derrotas` : '');
}
function iniciarPantallaMenu() {
  html('#menu-cabecera', `<img id="img-blason-menu" class="blason-mini" alt="Blasón de ${textoEsc(reino.nombre)}"><div><h2>${textoEsc(reino.nombre)}</h2><p>${textoEsc(reino.rey)}${reino.rama ? ' · ' + textoEsc(RAMAS[reino.rama].nombre) : ''} · ${reino.victorias} victorias, ${reino.derrotas} derrotas</p><p class="rasgos-general">${textoRasgos(reino) || '<span class="nota">Tu general ganará rasgos según cómo dirija las batallas.</span>'}</p></div>`);
  pintarBlason('#img-blason-menu', estadoBlason(reino), 160);
}
elementoListo(() => {
  elemento('#btn-inicio-nuevo').addEventListener('click', () => mostrar('reino'));
  elemento('#btn-inicio-continuar').addEventListener('click', () => { iniciarPantallaMenu(); mostrar('menu'); });
  elemento('#btn-inicio-borrar').addEventListener('click', () => { if (confirm('¿Borrar el reino guardado y empezar de cero?')) { borrarReino(); reino = null; blasonImportado = null; location.reload(); } });
  const irARama = modo => { modoBatalla = modo; iniciarPantallaRama(); mostrar('rama'); };
  elemento('#btn-menu-batalla').addEventListener('click', () => irARama('normal'));
  elemento('#btn-menu-personalizada').addEventListener('click', () => irARama('personalizada'));
  elemento('#btn-menu-inicio').addEventListener('click', () => { iniciarPantallaInicio(); mostrar('inicio'); });
  elemento('#btn-rama-menu').addEventListener('click', () => { iniciarPantallaMenu(); mostrar('menu'); });
  elemento('#btn-tienda-menu').addEventListener('click', () => { iniciarPantallaMenu(); mostrar('menu'); });
  elemento('#btn-r-menu').addEventListener('click', () => { iniciarPantallaMenu(); mostrar('menu'); });
});

/* ----- pantalla 2: rama ----- */
function iniciarPantallaRama() {
  const muestraTropas = ['infanteriaPesada', 'arqueros', 'caballeriaPesada'];
  html('#lista-ramas', Object.entries(RAMAS).map(([clave, r]) => `<button class="tarjeta-rama${reino && reino.rama === clave ? ' actual' : ''}" data-rama="${clave}" style="--c1:${r.colores[0]};--c2:${r.colores[1]}"><span class="muestra"></span>${reino && reino.rama === clave ? '<span class="etiqueta-actual">Tu rama actual · conserva el ejército</span>' : ''}<span class="retratos-rama">${muestraTropas.map(t => `<span class="retrato-tropa" data-tipo="${t}" data-rama="${clave}" data-nivel="2" data-escala="32"></span>`).join('')}</span><strong>${textoEsc(r.nombre)}</strong><p>${textoEsc(r.descripcion)}</p><ul>${r.ventajas.map(v => `<li>${textoEsc(v)}</li>`).join('')}</ul></button>`).join(''));
  for (const tarjeta of document.querySelectorAll('.tarjeta-rama')) { const r = RAMAS[tarjeta.dataset.rama]; pintarRetratosConBlason(tarjeta, parseInt(r.colores[0].slice(1), 16), parseInt(r.colores[1].slice(1), 16), PuenteDisenador.blasonPorDefecto(r.colores[0], r.colores[1], r.simbolo)); }
}
const galones = nivel => '<span class="galones-nivel">' + '<span class="galon"></span>'.repeat(nivel + 1) + '</span>';
elementoListo(() => {
  elemento('#lista-ramas').addEventListener('click', e => {
    const b = e.target.closest('[data-rama]'); if (!b) return;
    if (reino.rama !== b.dataset.rama) { reino.rama = b.dataset.rama; reino.ejercito = []; reino.oro = ORO_INICIAL; guardarReino(reino); }
    iniciarPantallaTienda(); mostrar('tienda');
  });
});

/* ----- pantalla 3: tienda ----- */
function iniciarPantallaTienda() {
  const rama = RAMAS[reino.rama];
  html('#tienda-cabecera', `<img id="img-blason-reino" class="blason-mini" alt="Blasón de ${textoEsc(reino.nombre)}"><div><h2>${textoEsc(reino.nombre)}</h2><p>${textoEsc(reino.rey)} · ${textoEsc(rama.nombre)} · ${reino.victorias} victorias, ${reino.derrotas} derrotas</p></div>`);
  pintarBlason('#img-blason-reino', estadoBlason(reino), 160);
  html('#tienda-tropas', tiposDisponibles(reino.rama).map(tipo => {
    const datos = TIPOS[TIPO[tipo]], b = (rama.bonificaciones || {})[tipo] || {};
    const nombresBono = { vida: 'vida', dano: 'daño', velocidad: 'velocidad', precio: 'precio' };
    const bonos = Object.entries(b).map(([k, v]) => nombresBono[k] + ' ×' + v).join(', ');
    return `<div class="tropa"><span class="retrato-tropa" data-tipo="${tipo}" data-rama="${reino.rama}" data-nivel="1"></span><div class="tropa-nombre"><strong>${textoEsc(datos.nombre)}</strong><span>${soldadosDeUnidad(reino.rama, tipo)} soldados por unidad · vida ${datos.vida}, daño ${datos.dano}, velocidad ${datos.velocidad}${datos.alcanceTiro ? ', ' + datos.municion + ' andanadas' : ''}${bonos ? ' · ' + bonos : ''}</span></div><div class="niveles">${NIVELES.map((n, i) => `<button class="btn-comprar" data-tipo="${tipo}" data-nivel="${i}" title="${textoEsc(n.nombre)}: ×${n.multStats} vida y daño, ×${n.multMoral} moral">${galones(i)}${textoEsc(n.nombre)}<br><small>${precioUnidad(reino.rama, tipo, i).toLocaleString('es-ES')}</small></button>`).join('')}</div></div>`;
  }).join(''));
  const [colorReino, colorReinoSecundario] = coloresDelBlason(estadoBlason(reino));
  pintarRetratosConBlason(elemento('#tienda-tropas'), colorReino, colorReinoSecundario, estadoBlason(reino));
  elemento('#sel-dificultad').value = reino.dificultad || 'normal';
  elemento('#sel-actitud').value = reino.actitudIA || 'ofensiva'; elemento('#sel-actitud').title = ACTITUDES_IA[elemento('#sel-actitud').value].descripcion;
  const personalizada = modoBatalla === 'personalizada';
  elemento('#btn-batalla').textContent = personalizada ? 'Siguiente: ejército enemigo' : '¡A la batalla!';
  html('#tienda-nota-modo', personalizada ? 'Batalla personalizada: cuando termines tu ejército, pasarás a montar el del enemigo. La dificultad solo marca cómo maniobra la IA.' : 'La IA recluta con el mismo presupuesto que el valor de tu ejército (más o menos según la dificultad) y con tropas de calidad parecida, en una rama distinta a la tuya.');
  pintarResumenEjercito();
}
function pintarResumenEjercito() {
  const resumen = resumenEjercito(reino.rama, reino.ejercito);
  const soldados = resumen.reduce((s, r) => s + r.soldados, 0);
  html('#tienda-oro', `<strong>${oro(reino.oro)}</strong> disponibles · ejército: ${reino.ejercito.length} unidades, ${soldados} soldados`);
  html('#tienda-ejercito', resumen.length ? resumen.map(r => `<div class="fila-ejercito"><span>${r.unidades} × ${textoEsc(nombreUnidad(r.tipo, r.nivel))}</span><span>${r.soldados} soldados · ${r.precio.toLocaleString('es-ES')}</span><button class="btn-vender" data-tipo="${r.tipo}" data-nivel="${r.nivel}" title="Devolver una unidad">−</button></div>`).join('') : '<p class="nota">Aún no has reclutado nada. Compra unidades con los botones de arriba; cada botón añade una unidad completa.</p>');
  elemento('#btn-batalla').disabled = reino.ejercito.length === 0;
  for (const b of document.querySelectorAll('.btn-comprar')) b.disabled = precioUnidad(reino.rama, b.dataset.tipo, +b.dataset.nivel) > reino.oro;
}
elementoListo(() => {
  elemento('#tienda-tropas').addEventListener('click', e => {
    const b = e.target.closest('.btn-comprar'); if (!b) return;
    const precio = precioUnidad(reino.rama, b.dataset.tipo, +b.dataset.nivel);
    if (precio > reino.oro) return;
    reino.oro -= precio; reino.ejercito.push({ tipo: b.dataset.tipo, nivel: +b.dataset.nivel }); guardarReino(reino); pintarResumenEjercito();
  });
  elemento('#tienda-ejercito').addEventListener('click', e => {
    const b = e.target.closest('.btn-vender'); if (!b) return;
    const i = reino.ejercito.findIndex(x => x.tipo === b.dataset.tipo && x.nivel === +b.dataset.nivel); if (i < 0) return;
    reino.oro += precioUnidad(reino.rama, b.dataset.tipo, +b.dataset.nivel); reino.ejercito.splice(i, 1); guardarReino(reino); pintarResumenEjercito();
  });
  elemento('#sel-dificultad').addEventListener('change', e => { reino.dificultad = e.target.value; guardarReino(reino); });
  elemento('#sel-actitud').addEventListener('change', e => { reino.actitudIA = e.target.value; guardarReino(reino); elemento('#sel-actitud').title = ACTITUDES_IA[e.target.value].descripcion; });
  elemento('#btn-cambiar-rama').addEventListener('click', () => { iniciarPantallaRama(); mostrar('rama'); });
  elemento('#btn-batalla').addEventListener('click', () => { if (!reino.ejercito.length) return; if (modoBatalla === 'personalizada') { iniciarPantallaPersonalizada(); mostrar('personalizada'); } else empezarBatalla(); });
});

/* ----- pantalla 3b: batalla personalizada (rama y ejército de la IA a elección, sin límite de oro) ----- */
function configuracionPersonalizada() {
  if (!reino.personalizada || !RAMAS[reino.personalizada.rama]) reino.personalizada = { rama: Object.keys(RAMAS).find(k => k !== reino.rama) || 'cristiano', ejercito: [] };
  return reino.personalizada;
}
function iniciarPantallaPersonalizada() {
  const config = configuracionPersonalizada();
  const selector = elemento('#sel-rama-ia');
  selector.replaceChildren(...Object.entries(RAMAS).map(([clave, rama]) => { const opcion = document.createElement('option'); opcion.value = clave; opcion.textContent = rama.nombre; return opcion; }));
  selector.value = config.rama;
  const selectorClima = elemento('#sel-clima');
  selectorClima.replaceChildren(...[['azar', 'Al azar']].concat(Object.entries(CLIMAS).map(([k, c]) => [k, c.nombre])).map(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; }));
  selectorClima.value = config.clima || 'azar';
  pintarTropasPersonalizadas();
}
function pintarTropasPersonalizadas() {
  const config = configuracionPersonalizada();
  const rama = RAMAS[config.rama];
  html('#personalizada-rama-nota', `${textoEsc(rama.descripcion)} ${(rama.ventajas || []).map(textoEsc).join(' · ')}`);
  html('#personalizada-tropas', tiposDisponibles(config.rama).map(tipo => {
    const datos = TIPOS[TIPO[tipo]];
    return `<div class="tropa"><span class="retrato-tropa" data-tipo="${tipo}" data-rama="${config.rama}" data-nivel="1"></span><div class="tropa-nombre"><strong>${textoEsc(datos.nombre)}</strong><span>${soldadosDeUnidad(config.rama, tipo)} soldados por unidad · vida ${datos.vida}, daño ${datos.dano}, velocidad ${datos.velocidad}</span></div><div class="niveles">${NIVELES.map((n, i) => `<button class="btn-comprar btn-anadir-ia" data-tipo="${tipo}" data-nivel="${i}" title="Añadir una unidad de ${textoEsc(n.nombre.toLowerCase())}">${galones(i)}${textoEsc(n.nombre)}<br><small>${precioUnidad(config.rama, tipo, i).toLocaleString('es-ES')}</small></button>`).join('')}</div></div>`;
  }).join(''));
  pintarRetratosConBlason(elemento('#personalizada-tropas'), parseInt(rama.colores[0].slice(1), 16), parseInt(rama.colores[1].slice(1), 16), PuenteDisenador.blasonPorDefecto(rama.colores[0], rama.colores[1], rama.simbolo));
  pintarResumenPersonalizado();
}
function pintarResumenPersonalizado() {
  const config = configuracionPersonalizada();
  const resumen = resumenEjercito(config.rama, config.ejercito);
  const soldados = resumen.reduce((s, r) => s + r.soldados, 0), valor = costeEjercito(config.rama, config.ejercito);
  const propio = costeEjercito(reino.rama, reino.ejercito), soldadosPropios = resumenEjercito(reino.rama, reino.ejercito).reduce((s, r) => s + r.soldados, 0);
  html('#personalizada-resumen', `Enemigo: ${config.ejercito.length} unidades, ${soldados} soldados, valor ${valor.toLocaleString('es-ES')} · tu ejército: ${reino.ejercito.length} unidades, ${soldadosPropios} soldados, valor ${propio.toLocaleString('es-ES')}${propio ? ` (el enemigo vale ${Math.round(valor / propio * 100)} % del tuyo)` : ''}`);
  html('#personalizada-ejercito', resumen.length ? resumen.map(r => `<div class="fila-ejercito"><span>${r.unidades} × ${textoEsc(nombreUnidad(r.tipo, r.nivel))}</span><span>${r.soldados} soldados · ${r.precio.toLocaleString('es-ES')}</span><button class="btn-vender btn-quitar-ia" data-tipo="${r.tipo}" data-nivel="${r.nivel}" title="Quitar una unidad">−</button></div>`).join('') : '<p class="nota">Añade unidades enemigas con los botones de arriba. Además de estas, la IA siempre lleva la guardia de su general.</p>');
  elemento('#btn-personalizada-batalla').disabled = config.ejercito.length === 0;
}
elementoListo(() => {
  elemento('#sel-rama-ia').addEventListener('change', e => { const config = configuracionPersonalizada(); config.rama = e.target.value; config.ejercito = []; guardarReino(reino); pintarTropasPersonalizadas(); });
  elemento('#personalizada-tropas').addEventListener('click', e => { const b = e.target.closest('.btn-anadir-ia'); if (!b) return; configuracionPersonalizada().ejercito.push({ tipo: b.dataset.tipo, nivel: +b.dataset.nivel }); guardarReino(reino); pintarResumenPersonalizado(); });
  elemento('#personalizada-ejercito').addEventListener('click', e => { const b = e.target.closest('.btn-quitar-ia'); if (!b) return; const ejercito = configuracionPersonalizada().ejercito; const i = ejercito.findIndex(x => x.tipo === b.dataset.tipo && x.nivel === +b.dataset.nivel); if (i >= 0) ejercito.splice(i, 1); guardarReino(reino); pintarResumenPersonalizado(); });
  elemento('#btn-personalizada-vaciar').addEventListener('click', () => { configuracionPersonalizada().ejercito = []; guardarReino(reino); pintarResumenPersonalizado(); });
  elemento('#btn-personalizada-volver').addEventListener('click', () => { iniciarPantallaTienda(); mostrar('tienda'); });
  elemento('#btn-personalizada-batalla').addEventListener('click', () => { const config = configuracionPersonalizada(); if (config.ejercito.length) empezarBatalla({ ramaIA: config.rama, ejercitoIA: config.ejercito.slice(), clima: config.clima && config.clima !== 'azar' ? config.clima : undefined }); });
  elemento('#sel-clima').addEventListener('change', e => { configuracionPersonalizada().clima = e.target.value; guardarReino(reino); });
});

/* ----- pantalla 4: batalla ----- */
// HUD al empezar una batalla: en red no hay control del tiempo y «comenzar» espera al rival
function prepararHudBatalla(enRed) {
  document.body.classList.toggle('batalla-red', enRed);
  elemento('#ayuda-completa').classList.add('oculto'); elemento('#aviso-pausa').classList.add('oculto');
  elemento('#hud-despliegue').classList.remove('oculto');
  const boton = elemento('#btn-b-comenzar'); boton.disabled = false; boton.innerHTML = '¡Comenzar la batalla! <kbd>Intro</kbd>';
  elemento('#hud-despliegue-reloj').textContent = '';
  // en red uno se rinde (gana el rival) y la pausa se le pide al rival
  const rendirse = elemento('#btn-b-rendirse');
  rendirse.textContent = enRed ? 'Rendirse' : 'Retirarse';
  rendirse.title = enRed ? 'Rendirse: tu rival gana la batalla' : 'Retirarse del campo (cuenta como derrota)';
  elemento('#btn-b-pausa').title = enRed ? 'Pedir una pausa a tu rival (P); tiene que aceptarla' : 'Pausa (P)';
  elemento('#btn-b-reanudar').title = enRed ? 'Quitar la pausa (P)' : 'Reanudar a velocidad normal (P)';
  elemento('#aviso-pausa-detalle').textContent = '';
  elemento('#panel-pausa-red').classList.add('oculto');
}
/* personalizada (opcional): { ramaIA, ejercitoIA } elegidos por el jugador en la pantalla de batalla personalizada;
   si no, la IA recluta con un presupuesto proporcional al valor del ejército del jugador según la dificultad */
async function empezarBatalla(personalizada) {
  const dificultad = DIFICULTADES[reino.dificultad] || DIFICULTADES.normal;
  const azar = crearAleatorio(Date.now() % 65536);
  let ramaIA, ejercitoIA;
  if (personalizada && personalizada.ejercitoIA && personalizada.ejercitoIA.length) { ramaIA = personalizada.ramaIA; ejercitoIA = personalizada.ejercitoIA; }
  else {
    const ramasIA = Object.keys(RAMAS).filter(k => k !== reino.rama);
    ramaIA = ramasIA[azar.entero(0, ramasIA.length - 1)];
    const presupuestoIA = Math.round(costeEjercito(reino.rama, reino.ejercito) * dificultad.presupuesto);
    ejercitoIA = reclutarIA(ramaIA, presupuestoIA, dificultad.sesgoNivel, azar, referenciaEjercito(reino.rama, reino.ejercito));
  }
  ultimaBatalla = { ramaIA, ejercitoIA: ejercitoIA.map(e => Object.assign({}, e)), personalizada: !!personalizada };
  prepararHudBatalla(false);
  elemento('#ayuda-completa').classList.add('oculto'); elemento('#aviso-pausa').classList.add('oculto');
  elemento('#hud-despliegue').classList.remove('oculto');
  const estadoIA = PuenteDisenador.blasonPorDefecto(RAMAS[ramaIA].colores[0], RAMAS[ramaIA].colores[1], RAMAS[ramaIA].simbolo);
  // colores del equipo según el blasón y texturas de estandarte
  const estadoJugador = estadoBlason(reino);
  const [c0, c0b] = coloresDelBlason(estadoJugador), [c1, c1b] = coloresDelBlason(estadoIA);
  EQUIPOS[0].nombre = reino.nombre; EQUIPOS[0].color = c0; EQUIPOS[0].colorSecundario = c0b;
  EQUIPOS[1].nombre = RAMAS[ramaIA].nombre; EQUIPOS[1].color = c1; EQUIPOS[1].colorSecundario = c1b;
  let texturas = [null, null];
  // a 256 px: el estandarte se dibuja a 8× su tamaño (con 96 px se veía borroso al acercar la cámara)
  try { texturas = [await PuenteDisenador.renderizarBlason(estadoJugador, 256), await PuenteDisenador.renderizarBlason(estadoIA, 256)]; } catch (e) { console.warn(e); }
  // heráldica de los sprites: escudos con el blasón entero, sobrevestas y gualdrapas con el campo
  try { EQUIPOS[0].blason = await blasonParaSprites(estadoJugador); EQUIPOS[1].blason = await blasonParaSprites(estadoIA); } catch (e) { console.warn(e); EQUIPOS[0].blason = EQUIPOS[1].blason = null; }
  // arte propio (arte/manifest.json), si lo hay; si no, dibujo por código
  let arte = null;
  try { arte = typeof cargarArte === 'function' ? await cargarArte() : null; } catch (e) { console.warn(e); }
  mostrar('batalla');
  html('#hud-batalla-titulo', `Contra <strong>${textoEsc(RAMAS[ramaIA].nombre)}</strong> (${personalizada ? 'ejército elegido, IA ' + textoEsc(dificultad.nombre.toLowerCase()) : textoEsc(dificultad.nombre)}, actitud ${textoEsc(ACTITUDES_IA[reino.actitudIA === 'defensiva' ? 'defensiva' : 'ofensiva'].nombre.toLowerCase())}) · ${ejercitoIA.length} unidades enemigas${arte ? ' · arte propio: ' + Object.keys(arte.tipos).length + ' tipos' : ''}`);
  const efectos = efectosGeneral(reino);
  marcadorInicial = null;
  batalla = iniciarBatalla({
    reino, ramaIA, ejercitoIA, dificultad: reino.dificultad, actitud: reino.actitudIA || 'ofensiva', contenedor: elemento('#escenario'), texturasBandera: texturas, arte, efectosGeneral: efectos, clima: personalizada && personalizada.clima,
    alActualizarHud: actualizarHudBatalla,
    alTerminar: resultado => {
      if (resultado.victoria) reino.victorias++; else reino.derrotas++;
      const rasgosNuevos = registrarBatallaGeneral(reino, resultado);
      // botín: el oro de la próxima campaña (de momento, se devuelve el valor de las unidades que sobreviven a la mitad)
      guardarReino(reino);
      batalla.detener(); batalla = null; modoResultado(false);
      const propias = resultado.unidades.filter(u => u.equipo === 0), enemigas = resultado.unidades.filter(u => u.equipo === 1);
      const mvp = propias.slice().sort((a, b) => b.bajasCausadas - a.bajasCausadas)[0];
      const filaUnidad = filaUnidadResultado(mvp);
      html('#resultado', `<h2>${resultado.victoria ? '¡Victoria!' : 'Derrota'}</h2><p>${resultado.victoria ? 'El enemigo ha sido destruido o ha huido del campo.' : 'Tu ejército ha sido destruido o ha huido.'}</p>
        <table><tr><th></th><th>${textoEsc(reino.nombre)}</th><th>${textoEsc(RAMAS[ramaIA].nombre)}</th></tr><tr><td>Soldados</td><td>${resultado.soldadosPropios}</td><td>${resultado.soldadosEnemigos}</td></tr><tr><td>Bajas</td><td>${resultado.bajasPropias}</td><td>${resultado.bajasEnemigas}</td></tr><tr><td>Huidos</td><td>${resultado.huidasPropias}</td><td>${resultado.huidasEnemigas}</td></tr></table>
        ${mvp && mvp.bajasCausadas ? `<p class="mvp">Unidad destacada: ${textoEsc(mvp.nombre)}, ${mvp.bajasCausadas} bajas causadas.</p>` : ''}
        <h3>${textoEsc(reino.rey)}</h3><p class="rasgos-general">${rasgosNuevos.length ? rasgosNuevos.map(r => `<span class="rasgo nuevo${r.negativo ? ' negativo' : ''}">Nuevo rasgo: ${textoEsc(r.nombre)}</span>`).join(' ') + ' ' : ''}${textoRasgos(reino) || 'Sin rasgos todavía.'}${resultado.general && resultado.general.enemigoAbatido ? ' · <strong>El general enemigo cayó.</strong>' : ''}</p>
        <h3>Mapa de la batalla</h3><canvas id="mapa-batalla" width="660" height="480"></canvas><p class="nota">El campo tal y como quedó: sangre, cadáveres y restos. Puntos: muertos de cada bando (claros los tuyos, rojos los enemigos). Marca final de cada unidad: punto si quedó en pie, aspa si fue aniquilada, flecha si huyó; ★ la guardia del general.</p>
        <h3>Tus unidades</h3><table class="unidades"><tr><th>Unidad</th><th>En pie</th><th>Bajas</th><th>Bajas causadas</th><th>Estado</th></tr>${propias.map(filaUnidad).join('')}</table>
        <h3>Enemigo</h3><table class="unidades"><tr><th>Unidad</th><th>En pie</th><th>Bajas</th><th>Bajas causadas</th><th>Estado</th></tr>${enemigas.map(filaUnidad).join('')}</table>
        <p class="nota">Duración: ${resultado.duracion} s · semilla ${resultado.semilla} · marcador del reino: ${reino.victorias} victorias, ${reino.derrotas} derrotas</p>`);
      mostrar('resultado');
      if (resultado.mapa) dibujarMapaBatalla(elemento('#mapa-batalla'), resultado.mapa, c0, c1);
    },
  });
  elemento('#hud-batalla-titulo').insertAdjacentHTML('beforeend', ` · <span class="clima" title="${textoEsc(batalla.clima.descripcion || '')}">${textoEsc(batalla.clima.nombre || batalla.clima.tipo)}</span><span id="hud-aviso-actitud"></span>`);
  elemento('#marcador-jugador-nombre').textContent = reino.nombre; elemento('#marcador-enemigo-nombre').textContent = RAMAS[ramaIA].nombre;
  // el orden de las tarjetas se guarda en el reino (por índice en el ejército; la guardia es «g») para las próximas batallas
  montarBarraUnidades(ordenarTarjetas(batalla.unidadesJugador), unidades => { reino.ordenTarjetas = unidades.map(claveTarjeta); guardarReino(reino); });
  mostrarDiscurso(ramaIA, ejercitoIA);
}
// Barra de tarjetas con las unidades propias (js/juego/13-tarjetas.js); alReordenar(unidades) al arrastrar, o null
function montarBarraUnidades(unidades, alReordenar) {
  barraUnidades = construirBarraUnidades(elemento('#barra-unidades'), unidades, {
    retrato: u => batalla.retratoUnidad(u),
    grupoDe: u => batalla && batalla.grupoDe ? batalla.grupoDe(u) : null,
    alReordenar: alReordenar || (() => {}),
    seleccionar: (u, anadir) => { if (!batalla) return; const ya = batalla.seleccion().includes(u); if (anadir && ya) batalla.seleccionar(batalla.seleccion().filter(x => x !== u)); else batalla.seleccionar([u], anadir); },
    centrar: u => batalla && batalla.centrarEnUnidad(u),
  });
  barraUnidades.actualizar([]);
}
/* HUD de la batalla (individual o en red); equipoPropio: el bando del jugador (en red puede ser el 1, a la derecha) */
function actualizarHudBatalla(sim, seleccion, equipoPropio) {
  const e = sim.estadisticas, propio = equipoPropio || 0;
  // marcador: soldados en el campo (vivos y sin escapar) sobre los del inicio; la barra de fondo se vacía con ellos
  if (!marcadorInicial) marcadorInicial = [0, 1].map(k => sim.unidades.filter(u => u.equipo === k).reduce((s, u) => s + u.total, 0));
  [['jugador', propio], ['enemigo', 1 - propio]].forEach(([lado, k]) => {
    const enCampo = e.vivos[k], inicial = marcadorInicial[k] || 1;
    elemento('#marcador-' + lado + '-cifra').textContent = enCampo + '/' + inicial;
    elemento('#marcador-' + lado + ' .relleno').style.width = (100 * enCampo / inicial).toFixed(1) + '%';
    const enPie = e.vivos[k] - e.huyendo[k] - (e.retirada ? e.retirada[k] : 0);
    elemento('#marcador-' + lado).title = `${k === propio ? 'Tus soldados' : 'Soldados enemigos'} en el campo / al empezar\n${enPie} en pie${e.retirada && e.retirada[k] ? ', ' + e.retirada[k] + ' en retirada' : ''}${e.huyendo[k] ? ', ' + e.huyendo[k] + ' huyendo' : ''}\n${e.muertos[k]} muertos${e.huidos[k] ? ', ' + e.huidos[k] + ' escapados del campo' : ''}`;
  });
  const segundos = Math.floor(sim.tiempo);
  elemento('#hud-reloj').textContent = Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0');
  // aviso cuando la IA defensiva espera o pierde la paciencia y pasa al ataque (en la línea de información)
  const actitud = batalla && !batalla.enRed && batalla.actitudIA ? batalla.actitudIA() : null;
  const avisoActitud = actitud && actitud.motivo ? `el enemigo ${actitud.motivo === 'bajas' ? 'no aguanta más tus andanadas' : 'se cansa de esperar'} y pasa al ataque` : actitud && actitud.actual === 'defensiva' ? 'el enemigo espera tu ataque' : '';
  const huecoAviso = elemento('#hud-aviso-actitud');
  if (huecoAviso) { huecoAviso.textContent = avisoActitud ? ' · ' + avisoActitud : ''; huecoAviso.className = actitud && actitud.motivo ? 'aviso-actitud' : 'nota'; }
  // control de tiempo: el botón activo dice el estado (pausa, normal o ×2)
  const enPausa = batalla && batalla.enPausa ? batalla.enPausa() : false, multiplicador = batalla && batalla.velocidadActual ? batalla.velocidadActual() : 1;
  elemento('#aviso-pausa').classList.toggle('oculto', !enPausa);
  elemento('#btn-b-pausa').classList.toggle('activo', enPausa);
  elemento('#btn-b-reanudar').classList.toggle('activo', !enPausa && multiplicador <= 1);
  elemento('#btn-b-rapido').classList.toggle('activo', !enPausa && multiplicador > 1);
  // en red, el despliegue acaba cuando lo dice el servidor (los dos listos o se acaba el tiempo)
  if (batalla && batalla.enRed) {
    if (!batalla.enDespliegue()) elemento('#hud-despliegue').classList.add('oculto');
    else if (batalla.esperandoRival()) { const boton = elemento('#btn-b-comenzar'); boton.disabled = true; boton.textContent = 'Esperando al rival…'; }
    const aviso = elemento('#hud-aviso-actitud');
    if (aviso && batalla.desincronizado()) { aviso.textContent = ' · ¡desincronizado del servidor!'; aviso.className = 'aviso-actitud'; }
  }
  pintarPanelSeleccion(seleccion || []);
  if (barraUnidades) barraUnidades.actualizar(seleccion || []);
}
// Pantalla de resultado: en red no hay revancha ni tienda, sino volver a la sala
function modoResultado(enRed) {
  elemento('#btn-r-revancha').classList.toggle('oculto', enRed); elemento('#btn-r-tienda').classList.toggle('oculto', enRed);
  elemento('#btn-r-sala').classList.toggle('oculto', !enRed);
}
const filaUnidadResultado = mvp => u => `<tr${mvp && u === mvp ? ' class="mvp"' : ''}><td>${textoEsc(u.nombre)}${u.esGeneral ? ' ★' : ''}</td><td>${u.vivos}/${u.total}</td><td>${u.total - u.vivos}</td><td>${u.bajasCausadas}</td><td>${u.vivos === 0 ? 'aniquilada' : u.huyo ? 'huyó' : 'en pie'}</td></tr>`;
let barraUnidades = null;
let marcadorInicial = null;     // soldados de cada bando al empezar la batalla (para el marcador superior)
// Orden guardado de las tarjetas: solo vale si describe exactamente el ejército actual (si compras o vendes, vuelve al de serie)
const claveTarjeta = u => u.esGeneral ? 'g' : String(u.indiceEjercito);
function ordenarTarjetas(unidades) {
  const orden = reino && Array.isArray(reino.ordenTarjetas) ? reino.ordenTarjetas : null;
  const claves = unidades.map(claveTarjeta);
  if (!orden || orden.length !== claves.length || !claves.every(c => orden.includes(c))) return unidades.slice();
  return unidades.slice().sort((a, b) => orden.indexOf(claveTarjeta(a)) - orden.indexOf(claveTarjeta(b)));
}
/* Mapa de la batalla para el resultado (como en Shogun 2): el suelo final (sangre, cadáveres, restos), las trayectorias de
   las unidades, los muertos de cada bando y el estado final de cada unidad */
function dibujarMapaBatalla(lienzo, mapa, colorPropio, colorEnemigo, equipoPropio) {
  const propio = equipoPropio || 0;
  if (!lienzo) return;
  const c = lienzo.getContext('2d'), escala = Math.min(lienzo.width / CAMPO.ancho, lienzo.height / CAMPO.alto);
  // el jugador de la derecha lo ve girado 180°, como el campo (se giran las coordenadas, no los textos)
  const girada = propio === 1;
  const X = x => (girada ? CAMPO.ancho - x : x) * escala, Y = y => (girada ? CAMPO.alto - y : y) * escala;
  const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');
  c.clearRect(0, 0, lienzo.width, lienzo.height);
  if (mapa.suelo) { c.save(); if (girada) { c.translate(CAMPO.ancho * escala, CAMPO.alto * escala); c.scale(-1, -1); } c.drawImage(mapa.suelo, 0, 0, CAMPO.ancho * escala, CAMPO.alto * escala); c.restore(); }
  // muertos: puntos por bando
  for (const [x, y, equipo] of mapa.muertes) { c.fillStyle = equipo === propio ? '#f4f0e6' : '#ff5a4a'; c.globalAlpha = 0.8; c.beginPath(); c.arc(X(x), Y(y), 2.2, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  // atropellos: destellos
  for (const [x, y] of mapa.atropellos) { c.strokeStyle = '#ffd54a'; c.globalAlpha = 0.5; c.beginPath(); c.arc(X(x), Y(y), 3, 0, Math.PI * 2); c.stroke(); }
  c.globalAlpha = 1;
  // trayectorias
  const finales = new Map(mapa.finales.map(f => [f.id, f]));
  mapa.trayectorias.forEach((t, indice) => {
    const propia = t.equipo === propio;
    // (sin recorrido: el usuario prefirió el mapa limpio; solo se marca dónde acabó cada unidad)
    const f = finales.get(t.id); const [x1, y1] = t.puntos[t.puntos.length - 1];
    c.globalAlpha = 0.9; c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = propia ? '#f4f0e6' : '#ff6a5a'; c.lineWidth = 2;
    if (f && f.vivos === 0) { c.beginPath(); c.moveTo(X(x1) - 5, Y(y1) - 5); c.lineTo(X(x1) + 5, Y(y1) + 5); c.moveTo(X(x1) + 5, Y(y1) - 5); c.lineTo(X(x1) - 5, Y(y1) + 5); c.stroke(); }   // aniquilada
    else if (f && f.huyendo) { const dx = (t.equipo === 0 ? -1 : 1) * (girada ? -1 : 1); c.beginPath(); c.moveTo(X(x1), Y(y1)); c.lineTo(X(x1) + 10 * dx, Y(y1)); c.lineTo(X(x1) + 6 * dx, Y(y1) - 4); c.moveTo(X(x1) + 10 * dx, Y(y1)); c.lineTo(X(x1) + 6 * dx, Y(y1) + 4); c.stroke(); }   // huyó
    else { c.fillStyle = propia ? '#f4f0e6' : '#ff6a5a'; c.beginPath(); c.arc(X(x1), Y(y1), 3.5, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    // nombre corto junto al final
    c.font = (t.esGeneral ? 'bold ' : '') + '10px system-ui, sans-serif'; c.fillStyle = propia ? '#f4f0e6' : '#ffb0a4'; c.strokeStyle = '#1a1410'; c.lineWidth = 3; c.lineJoin = 'round';
    const etiqueta = t.esGeneral ? '★' : (NOMBRE_CORTO_TIPO[t.tipo] || t.tipo);
    const desplazamiento = ((indice % 3) - 1) * 11;                                   // etiquetas escalonadas para que no se pisen
    c.strokeText(etiqueta, X(x1) + 7, Y(y1) + 4 + desplazamiento); c.fillText(etiqueta, X(x1) + 7, Y(y1) + 4 + desplazamiento);
  });
}
/* Moral con lo que más pesa ahora: «moral 62 (bajas −18, flanco −10)»; el título lleva todos los factores */
function textoMoral(u) {
  const factores = (u.factoresMoral || []).slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const firmar = v => (v > 0 ? '+' : '−') + Math.abs(v);
  const principales = factores.slice(0, 2).map(f => f[0] + ' ' + firmar(f[1])).join(', ');
  const todos = 'Moral ' + Math.round(u.moral) + ' de ' + Math.round(u.moralMax) + ' (huye por debajo de 25; 18 con el general cerca).\n' + (factores.length ? factores.map(f => '· ' + f[0] + ' ' + firmar(f[1])).join('\n') : 'Sin nada que la afecte.');
  return `<span class="texto-moral" title="${textoEsc(todos)}">moral ${Math.round(u.moral)}${principales ? ' (' + textoEsc(principales) + ')' : ''}</span>`;
}
/* Discurso del general antes del despliegue: retrato, rasgos y frases según el enemigo, el ejército y los rasgos */
function mostrarDiscurso(ramaIA, ejercitoIA) {
  const [colorReino, colorReinoSecundario] = coloresDelBlason(estadoBlason(reino));
  const hueco = elemento('#discurso-retrato'); hueco.replaceChildren();
  const retrato = retratoTropa({ tipo: 'caballeriaPesada', rama: reino.rama, nivel: 3, color: colorReino, colorSecundario: colorReinoSecundario, blason: EQUIPOS[0].blason, general: true, escala: 48 });
  if (retrato) { retrato.className = 'retrato-tropa-lienzo'; hueco.appendChild(retrato); }
  html('#discurso-nombre', textoEsc(reino.rey) + ', ' + textoEsc(RAMAS[reino.rama].nombre));
  html('#discurso-rasgos', textoRasgos(reino) || 'Sin rasgos todavía');
  html('#discurso-texto', discursoGeneral(reino, ramaIA, ejercitoIA, reino.ejercito).map(f => `<p>${textoEsc(f)}</p>`).join(''));
  elemento('#discurso').classList.remove('oculto');
}
function textoRasgos(reino) {
  return rasgosActivos(reino).map(r => `<span class="rasgo${r.negativo ? ' negativo' : ''}" title="${textoEsc(r.descripcion)}">${textoEsc(r.nombre)}</span>`).join(' ');
}
/* Panel de la selección: unidades, su estado, y botones de orden y formación (los que no proceden se desactivan) */
function pintarPanelSeleccion(seleccion) {
  const panel = elemento('#panel-seleccion');
  if (!seleccion.length) { panel.classList.add('oculto'); return; }
  panel.classList.remove('oculto');
  const nombreOrden = { formar: 'alto', mover: 'moviéndose', avanzar: 'atacando', atacar: 'atacando', cargar: 'cargando', disparar: 'disparando', huir: 'huyendo' };
  const textoOrden = u => (u.retirada ? 'en retirada ordenada' : u.trabada ? 'en cuerpo a cuerpo' : (nombreOrden[u.orden] || u.orden)) + ((!u.trabada && (u.orden === 'mover' || u.orden === 'avanzar' || u.orden === 'atacar' || u.orden === 'disparar')) ? (u.marcha === 'correr' ? ' a la carrera' : ' al paso') : '');
  const textoMunicion = u => TIPOS[u.tipo].alcanceTiro ? (u.sinMunicion ? ' · sin flechas (cuerpo a cuerpo)' : ' · ' + u.municion + ' andanadas') : '';
  html('#hud-seleccion', `<div class="unidad-sel"><strong>${seleccion.length === 1 ? textoEsc(seleccion[0].nombre) : seleccion.length + ' unidades'}</strong><span>${seleccion.reduce((s, u) => s + u.vivos, 0)} soldados</span></div>` +
    (seleccion.length <= 6 ? seleccion.map(u => `<div class="unidad-sel"><span>${textoEsc(TIPOS[u.tipo].nombre)} ${u.esGeneral ? '★' : galones(u.nivel || 0)}</span><span>${u.vivos}/${u.total} · ${textoMoral(u)} · fatiga ${Math.round(u.fatiga * 100)} % · cohesión ${Math.round(u.cohesion)} %${textoMunicion(u)} · ${textoOrden(u)} · ${FORMACIONES[u.formacion.clave].nombre.toLowerCase()}${batalla && batalla.sim.terreno ? ' · ' + NOMBRE_TERRENO[batalla.sim.terreno.tipoEn(u.centroX, u.centroY)] : ''}</span></div>`).join('') : ''));
  const hayJinetes = seleccion.some(u => u.stats.montado), hayArqueros = seleccion.some(u => u.stats.alcanceTiro);
  for (const b of document.querySelectorAll('#panel-ordenes button[data-orden]')) b.disabled = (b.dataset.orden === 'cargar' && !hayJinetes) || (b.dataset.orden === 'disparar' && !hayArqueros);
  const gruposSeleccion = batalla && batalla.grupoDe ? [...new Set(seleccion.map(u => batalla.grupoDe(u)).filter(Boolean))] : [];
  const botonDesagrupar = elemento('#btn-desagrupar'); if (botonDesagrupar) botonDesagrupar.disabled = !gruposSeleccion.length;
  // escaramuza: el botón solo aparece con arqueros a caballo; encendido (dorado) si todos la tienen activada
  const escaramuceadores = seleccion.filter(u => u.stats.disparaEnMovimiento), botonEscaramuza = elemento('#btn-escaramuza');
  if (botonEscaramuza) { botonEscaramuza.hidden = !escaramuceadores.length; const activa = escaramuceadores.length && escaramuceadores.every(u => u.escaramuza); botonEscaramuza.classList.toggle('activa', !!activa); botonEscaramuza.innerHTML = 'Escaramuza: ' + (activa ? 'sí' : 'no') + ' <kbd>E</kbd>'; }
  const botonAgrupar = elemento('#btn-agrupar'); if (botonAgrupar) botonAgrupar.innerHTML = (gruposSeleccion.length === 1 && batalla.grupos()[gruposSeleccion[0]].length === seleccion.length ? 'Grupo ' + gruposSeleccion[0] : 'Agrupar') + ' <kbd>G</kbd>';
  const formaciones = new Set(seleccion.map(u => u.formacion.clave));
  for (const b of document.querySelectorAll('#panel-formaciones button')) {
    const F = FORMACIONES[b.dataset.formacion], alguna = seleccion.some(u => formacionDisponible(u, b.dataset.formacion));
    b.classList.toggle('activa', formaciones.size === 1 && formaciones.has(b.dataset.formacion));
    b.disabled = !alguna;
    b.hidden = !alguna;                       // si nadie de la selección puede usarla, el botón no sale
    b.title = `${F.nombre}: ${F.descripcion}\n${F.ventajas.map(v => '· ' + v).join('\n')}\nPara ${QUIEN_PUEDE_FORMACION[F.disponible]}.${alguna ? '' : ' Ninguna unidad seleccionada puede usarla.'}`;
  }
  const unica = formaciones.size === 1 ? FORMACIONES[[...formaciones][0]] : null;
  html('#panel-formacion-nota', unica ? `<strong>${textoEsc(unica.nombre)}</strong>: ${unica.ventajas.map(textoEsc).join(' · ')}` : 'Formaciones mezcladas. F cambia la formación de toda la selección.');
}
elementoListo(() => {
  elemento('#panel-ordenes').addEventListener('click', e => { const b = e.target.closest('[data-orden]'); if (b && batalla) batalla.ordenSeleccion(b.dataset.orden, e.shiftKey ? 'correr' : 'andar'); });
  elemento('#btn-agrupar').addEventListener('click', () => { if (batalla) batalla.crearGrupo(); });
  elemento('#btn-desagrupar').addEventListener('click', () => { if (batalla) batalla.deshacerGrupo(); });
  elemento('#btn-escaramuza').addEventListener('click', () => { if (batalla) batalla.alternarEscaramuza(); });
  elemento('#panel-ordenes').addEventListener('dblclick', e => { const b = e.target.closest('[data-orden]'); if (b && batalla) batalla.ordenSeleccion(b.dataset.orden, 'correr'); });
  elemento('#panel-formaciones').addEventListener('click', e => { const b = e.target.closest('[data-formacion]'); if (b && batalla) batalla.formarSeleccion(b.dataset.formacion); });
  // control de tiempo: pausa, reanudar a velocidad normal y ×2
  elemento('#btn-b-pausa').addEventListener('click', () => { if (batalla) batalla.fijarPausa(true); });
  elemento('#btn-b-reanudar').addEventListener('click', () => { if (batalla) { batalla.velocidad(1); batalla.fijarPausa(false); } });
  elemento('#btn-b-rapido').addEventListener('click', () => { if (batalla) { batalla.velocidad(2); batalla.fijarPausa(false); } });
  const comenzarBatalla = () => { if (!batalla || !batalla.enDespliegue()) return; batalla.comenzar(); if (!batalla.enDespliegue()) elemento('#hud-despliegue').classList.add('oculto'); };
  elemento('#btn-b-comenzar').addEventListener('click', comenzarBatalla);
  elemento('#btn-discurso-cerrar').addEventListener('click', () => elemento('#discurso').classList.add('oculto'));
  window.addEventListener('keydown', e => { if (batalla && e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && batalla.enDespliegue()) { e.preventDefault(); comenzarBatalla(); } });
  const alternarAyuda = () => elemento('#ayuda-completa').classList.toggle('oculto');
  elemento('#btn-b-ayuda').addEventListener('click', alternarAyuda);
  elemento('#btn-cerrar-ayuda').addEventListener('click', alternarAyuda);
  window.addEventListener('keydown', e => { if (!batalla) return; if (e.key === 'F1' || (e.key === '?' && e.target.tagName !== 'INPUT')) { e.preventDefault(); alternarAyuda(); } else if (e.key === 'Escape' && !elemento('#ayuda-completa').classList.contains('oculto')) alternarAyuda(); });
  elemento('#btn-r-revancha').addEventListener('click', () => { if (ultimaBatalla) empezarBatalla({ ramaIA: ultimaBatalla.ramaIA, ejercitoIA: ultimaBatalla.ejercitoIA.map(e => Object.assign({}, e)) }); else { iniciarPantallaTienda(); mostrar('tienda'); } });
  elemento('#btn-b-rendirse').addEventListener('click', () => {
    if (batalla && batalla.enRed) { if (confirm('¿Rendirte? Tu rival gana la batalla.')) batalla.rendirse(); return; }
    if (batalla && confirm('¿Retirarse del campo? Cuenta como derrota.')) { batalla.detener(); batalla = null; reino.derrotas++; guardarReino(reino); iniciarPantallaMenu(); mostrar('menu'); } });
  elemento('#btn-r-tienda').addEventListener('click', () => { iniciarPantallaTienda(); mostrar('tienda'); });
  elemento('#btn-r-sala').addEventListener('click', () => { iniciarPantallaMultijugador(); mostrar('multijugador'); });
});

/* ----- arranque ----- */
function elementoListo(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
elementoListo(() => {
  iniciarPantallaReino();
  reino = cargarReino();
  iniciarPantallaInicio();
  mostrar('inicio');
});
