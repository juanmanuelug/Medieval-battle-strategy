'use strict';
/* ---------- Multijugador, paso 1: lobby y matchmaking (2026-10-13) ----------
   Cliente del servidor de lobby (servidor/servidor-lobby.js, WebSocket). Pantalla «Multijugador» del menú:
   · conectar al servidor (dirección guardada en localStorage; por defecto ws://localhost:8787) con el nombre del rey;
   · lista de salas públicas (se actualiza sola), crear sala (pública o privada), unirse por código;
   · «Buscar partida»: el servidor empareja con otro jugador que también esté buscando;
   · dentro de la sala: jugadores, código para invitar, chat y «Listo»; el anfitrión elige el presupuesto.
   · paso 2: con los dos listos, cada uno elige rama y recluta su ejército con ese presupuesto (tienda dentro de la sala) y lo
     confirma; el servidor lo valida. Con los dos confirmados llega la ficha de la batalla con los dos ejércitos.
   · paso 3: con la ficha empieza la batalla en red (empezarBatallaRed): la misma pantalla de batalla, con el bando que diga el
     servidor; las órdenes viajan al servidor y vuelven en turnos (ver js/04-ordenes.js y js/juego/10-batalla.js).
   · paso 4: si se corta la conexión en plena batalla, se reintenta cada 2 s durante 60 s presentándose con la clave de
     reconexión de la ficha (guardada también en localStorage: sirve aunque se recargue la página); el servidor devuelve la
     ficha y el estado actual y la batalla se vuelve a montar donde iba. Si es el rival quien se cae, la batalla se congela
     y se avisa con una cuenta atrás.
     Además: cuenta atrás del despliegue (el servidor manda lo que queda en cada cambio), pausa de común acuerdo (se pide con
     el botón de pausa o P; al rival le sale un aviso para aceptarla o seguir) y botón «Rendirse». */
const CLAVE_SERVIDOR = 'batallas.servidor.v1';
const CLAVE_RECONEXION = 'batallas.reconexion.v1';
const ESPERA_RECONEXION = 60;          // s, si el servidor no dice los suyos (ficha.esperaReconexion)
const VIGENCIA_CLAVE = 15 * 60 * 1000; // una clave de reconexión de hace más de 15 min ya no sirve
const guardarReconexion = (servidor, clave) => guardarLocal(CLAVE_RECONEXION, { servidor, clave, hora: Date.now() });
const borrarReconexion = () => borrarLocal(CLAVE_RECONEXION);
function leerReconexion(servidor) {
  const r = leerLocalJSON(CLAVE_RECONEXION); return r && r.servidor === servidor && Date.now() - r.hora < VIGENCIA_CLAVE ? r.clave : null;
}
const SERVIDOR_POR_DEFECTO = 'ws://localhost:' + PUERTO_POR_DEFECTO;
// el nombre con el que se entra en el lobby: el del rey del reino
const nombreEnRed = () => reino ? reino.rey : NOMBRE_JUGADOR_POR_DEFECTO;

/* Conexión con el servidor de lobby: envía órdenes y reparte los mensajes recibidos a quien se suscriba (al.tipo) */
class ClienteLobby {
  constructor() { this.ws = null; this.oyentes = {}; this.id = null; this.sala = null; this.buscando = false; }
  conectar(url, nombre) {
    this.cerrar();
    this.url = url; this.nombre = nombre;
    return new Promise((resolver, rechazar) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return rechazar(new Error('Dirección no válida.')); }
      this.ws = ws;
      const tiempo = setTimeout(() => { ws.close(); rechazar(new Error('El servidor no responde.')); }, 5000);
      // con una batalla en red a medias (corte o página recargada), la clave de reconexión para volver a ella
      ws.onopen = () => { clearTimeout(tiempo); const claveReconexion = leerReconexion(url); this.enviar(claveReconexion ? { tipo: 'hola', nombre, claveReconexion } : { tipo: 'hola', nombre }); };
      ws.onerror = () => { clearTimeout(tiempo); rechazar(new Error('No se pudo conectar con ' + url + '.')); };
      ws.onclose = () => { const estabaConectado = !!this.id; this.id = null; this.sala = null; this.buscando = false; this.emitir('cerrado', { estabaConectado }); };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.tipo === 'bienvenida') { this.id = m.id; resolver(m); }
        if (m.tipo === 'enSala') this.sala = m.sala;
        if (m.tipo === 'fueraDeSala') this.sala = null;
        if (m.tipo === 'buscando') this.buscando = true;
        if (m.tipo === 'busquedaCancelada' || m.tipo === 'emparejado') this.buscando = false;
        this.emitir(m.tipo, m);
      };
    });
  }
  conectado() { return !!(this.ws && this.ws.readyState === 1 && this.id); }
  enviar(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  al(tipo, funcion) { (this.oyentes[tipo] = this.oyentes[tipo] || []).push(funcion); }
  emitir(tipo, m) { for (const f of this.oyentes[tipo] || []) f(m); for (const f of this.oyentes['*'] || []) f(m); }
  cerrar() { if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch (e) {} } this.ws = null; this.id = null; this.sala = null; this.buscando = false; }
}

const lobby = new ClienteLobby();
// preparación (paso 2): borrador del ejército propio, si ya está confirmado, el lado y la ficha final de la batalla
const preparacion = { rama: null, ejercito: [], confirmado: false, equipo: null, clima: null, presupuesto: ORO_INICIAL, ficha: null };
let inicioBusqueda = 0, relojBusqueda = null;
// Si el juego se ha abierto desde el propio servidor (http://IP:8787/), el lobby está en esa misma dirección y es lo que se
// propone; abierto como archivo local, la última dirección usada o ws://localhost:8787
const servidorDeLaPagina = () => (location.protocol === 'http:' || location.protocol === 'https:') ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host : null;
const leerServidor = () => servidorDeLaPagina() || leerLocal(CLAVE_SERVIDOR) || SERVIDOR_POR_DEFECTO;
const guardarServidor = url => guardarLocal(CLAVE_SERVIDOR, url);

function iniciarPantallaMultijugador() {
  elemento('#in-servidor').value = leerServidor();
  pintarMultijugador();
}
// Muestra la vista que toca: sin conexión, lobby (lista de salas) o sala
function pintarMultijugador() {
  const conectado = lobby.conectado(), enSala = !!lobby.sala;
  elemento('#mj-conexion').classList.toggle('oculto', conectado);
  elemento('#mj-lobby').classList.toggle('oculto', !conectado || enSala);
  elemento('#mj-sala').classList.toggle('oculto', !conectado || !enSala);
  elemento('#mj-estado').textContent = conectado ? 'Conectado como ' + nombreEnRed() + ' · ' + leerServidor() : 'Sin conexión';
  elemento('#mj-estado').classList.toggle('conectado', conectado);
  const btnBuscar = elemento('#btn-mj-buscar');
  btnBuscar.textContent = lobby.buscando ? 'Cancelar búsqueda' : 'Buscar partida';
  btnBuscar.classList.toggle('buscando', lobby.buscando);
  elemento('#mj-buscando').classList.toggle('oculto', !lobby.buscando);
  if (enSala) pintarSala(lobby.sala);
  else { preparacion.ficha = null; preparacion.confirmado = false; }
}
function pintarSalas(lista) {
  html('#mj-lista-salas', lista.length ? lista.map(s => `<div class="sala-fila"><div><strong>${textoEsc(s.nombre)}</strong><span class="nota"> · anfitrión ${textoEsc(s.anfitrion || '—')} · ${s.jugadores.length}/${s.max}</span></div><button class="btn btn-mj-unirse" data-sala="${textoEsc(s.id)}">Unirse</button></div>`).join('') : '<p class="nota">No hay salas públicas abiertas. Crea una o busca partida.</p>');
}
function pintarSala(sala) {
  html('#mj-sala-titulo', textoEsc(sala.nombre) + (sala.privada ? ' <span class="nota">(privada)</span>' : ''));
  html('#mj-sala-codigo', sala.desdeMatchmaking ? 'Partida encontrada por matchmaking' : `Código para invitar: <strong class="codigo-sala">${textoEsc(sala.codigo)}</strong>`);
  const yo = sala.jugadores.find(j => j.id === lobby.id);
  html('#mj-sala-jugadores', [0, 1].map(k => { const j = sala.jugadores[k]; return j ? `<div class="jugador-sala${j.id === lobby.id ? ' yo' : ''}"><span class="lado">${k === 0 ? 'Izquierda' : 'Derecha'}</span><strong>${textoEsc(j.nombre)}</strong>${k === 0 ? ' <span class="nota">anfitrión</span>' : ''}<span class="estado-listo${j.listo ? ' si' : ''}">${j.listo ? 'Listo' : 'Esperando'}</span></div>` : '<div class="jugador-sala vacio"><span class="lado">' + (k === 0 ? 'Izquierda' : 'Derecha') + '</span><em>Esperando a otro jugador…</em></div>'; }).join(''));
  const btnListo = elemento('#btn-mj-listo');
  btnListo.textContent = yo && yo.listo ? 'Ya no estoy listo' : 'Listo';
  btnListo.disabled = sala.jugadores.length < 2;
  btnListo.classList.toggle('oculto', sala.fase !== 'espera');
  // opciones: el presupuesto lo cambia el anfitrión mientras la sala espera; el clima se conoce al empezar la preparación
  const selector = elemento('#sel-mj-presupuesto'), soyAnfitrion = sala.jugadores[0] && sala.jugadores[0].id === lobby.id;
  if (selector.options.length !== (sala.presupuestos || []).length) rellenarSelector(selector, (sala.presupuestos || []).map(p => [p, formatoNumero(p) + ' de oro']));
  selector.value = String(sala.presupuesto); selector.disabled = !soyAnfitrion || sala.fase !== 'espera';
  selector.title = soyAnfitrion ? 'Oro de cada jugador para su ejército' : 'Lo elige el anfitrión';
  elemento('#mj-sala-clima').textContent = sala.clima ? 'Clima: ' + nombreClima(sala.clima) + (sala.mapa && TIPOS_MAPA[sala.mapa] ? ' · Mapa: ' + TIPOS_MAPA[sala.mapa].nombre : '') : '';
  // estado de cada jugador en la preparación
  if (sala.fase !== 'espera') for (const [k, j] of sala.jugadores.entries()) { const tarjeta = document.querySelectorAll('#mj-sala-jugadores .jugador-sala')[k]; const estado = tarjeta && tarjeta.querySelector('.estado-listo'); if (estado) { estado.textContent = j.ejercitoConfirmado ? 'Ejército confirmado' : 'Eligiendo ejército…'; estado.classList.toggle('si', !!j.ejercitoConfirmado); } }
  elemento('#mj-preparacion').classList.toggle('oculto', sala.fase !== 'preparacion');
  elemento('#mj-ficha').classList.toggle('oculto', sala.fase !== 'lista' || !preparacion.ficha);
  if (sala.fase === 'preparacion') pintarPreparacion();
  if (sala.fase === 'espera') { preparacion.confirmado = false; preparacion.ficha = null; }
}
const nombreClima = clave => (typeof CLIMAS !== 'undefined' && CLIMAS[clave] && CLIMAS[clave].nombre) || clave;
// Blasón con el que se juega: el importado del reino, o el de la rama elegida
const blasonParaMultijugador = rama => (reino && reino.blason && reino.blason.modo === 'importado' && reino.blason.estado) ? reino.blason.estado : blasonDeRama(rama);

/* ----- paso 2: tienda de preparación ----- */
function pintarPreparacion() {
  // el aviso de la sala en preparación puede llegar un instante antes que «salaLista»: valores por defecto mientras tanto
  if (!preparacion.rama || !RAMAS[preparacion.rama]) preparacion.rama = (reino && RAMAS[reino.rama]) ? reino.rama : RAMA_POR_DEFECTO;
  if (lobby.sala && lobby.sala.presupuesto) preparacion.presupuesto = lobby.sala.presupuesto;
  const rama = preparacion.rama, gastado = costeEjercito(rama, preparacion.ejercito), restante = preparacion.presupuesto - gastado;
  const selectorRama = elemento('#sel-mj-rama');
  if (!selectorRama.options.length) rellenarSelector(selectorRama, Object.entries(RAMAS).map(([k, r]) => [k, r.nombre]));
  selectorRama.value = rama; selectorRama.disabled = preparacion.confirmado;
  html('#mj-rama-nota', textoEsc(RAMAS[rama].descripcion));
  elemento('#mj-oro').textContent = formatoNumero(gastado) + ' de ' + formatoNumero(preparacion.presupuesto) + ' de oro gastado · quedan ' + formatoNumero(restante);
  elemento('#mj-barra-oro').style.width = Math.min(100, 100 * gastado / preparacion.presupuesto).toFixed(1) + '%';
  const llenoDeUnidades = preparacion.ejercito.length >= MAX_UNIDADES_EJERCITO;
  html('#mj-tropas', tiposDisponibles(rama).map(tipo => tarjetaTropa(rama, tipo, '', (n, i, precio) => ({ clase: 'btn-comprar btn-mj-comprar', titulo: textoEsc(n.nombre), desactivado: preparacion.confirmado || precio > restante || llenoDeUnidades || !puedeAnadirTropa(preparacion.ejercito, tipo) }))).join(''));
  pintarRetratos(elemento('#mj-tropas'), ...coloresDeRama(rama));
  html('#mj-mi-ejercito', preparacion.ejercito.length ? preparacion.ejercito.map((e, k) => `<span class="unidad-reclutada">${galones(e.nivel)} ${textoEsc(nombreUnidad(e.tipo, e.nivel))}${preparacion.confirmado ? '' : ` <button class="btn-quitar" data-indice="${k}" title="Quitar">×</button>`}</span>`).join('') : '<p class="nota">Todavía no has reclutado ninguna unidad.</p>');
  elemento('#btn-mj-confirmar').classList.toggle('oculto', preparacion.confirmado);
  elemento('#btn-mj-confirmar').disabled = !preparacion.ejercito.length;
  elemento('#btn-mj-cambiar').classList.toggle('oculto', !preparacion.confirmado);
  const rival = lobby.sala && lobby.sala.jugadores.find(j => j.id !== lobby.id);
  elemento('#mj-estado-preparacion').textContent = preparacion.confirmado ? (rival && rival.ejercitoConfirmado ? '' : 'Ejército confirmado. Esperando al rival…') : (rival && rival.ejercitoConfirmado ? 'Tu rival ya ha confirmado su ejército.' : '');
}
// Ficha de la batalla: los dos ejércitos (se conocen cuando los dos han confirmado), clima y lados
function pintarFicha(f) {
  const lado = j => j.equipo === 0 ? 'izquierda' : 'derecha';
  html('#mj-ficha', `<h2>Batalla preparada</h2><p class="nota">Clima: ${textoEsc(nombreClima(f.clima))} · ${formatoNumero(f.presupuesto)} de oro por jugador · semilla ${f.semilla}</p><div class="ficha-ejercitos">${f.jugadores.map(j => `<div class="ficha-ejercito${j.equipo === preparacion.equipo ? ' yo' : ''}"><strong>${textoEsc(j.nombre)}</strong> <span class="nota">(${lado(j)}) · ${textoEsc(RAMAS[j.rama].nombre)} · ${formatoNumero(j.coste)} de oro</span><ul>${resumenEjercito(j.rama, j.ejercito).map(r => `<li>${r.unidades} × ${textoEsc(nombreUnidad(r.tipo, r.nivel))} <span class="nota">(${r.soldados} soldados)</span></li>`).join('')}</ul></div>`).join('')}</div><p class="nota">Preparando el campo de batalla…</p>`);
}
function anadirChat(m) {
  const caja = elemento('#mj-chat-mensajes');
  const linea = document.createElement('div');
  linea.className = 'chat-linea' + (m.de ? '' : ' sistema');
  linea.innerHTML = m.de ? `<strong>${textoEsc(m.de)}:</strong> ${textoEsc(m.texto)}` : textoEsc(m.texto);
  caja.appendChild(linea); caja.scrollTop = caja.scrollHeight;
}
function avisoMultijugador(texto, error) { const a = elemento('#mj-aviso'); a.textContent = texto || ''; a.classList.toggle('error', !!error); }

lobby.al('salas', m => pintarSalas(m.lista));
lobby.al('enSala', () => pintarMultijugador());
lobby.al('fueraDeSala', m => { html('#mj-chat-mensajes', ''); pintarMultijugador(); if (m.motivo === 'desconexion') avisoMultijugador('Has salido de la sala.'); lobby.enviar({ tipo: 'listarSalas' }); });
lobby.al('chat', anadirChat);
lobby.al('buscando', () => { inicioBusqueda = inicioBusqueda || Date.now(); clearInterval(relojBusqueda); relojBusqueda = setInterval(() => { elemento('#mj-buscando-tiempo').textContent = Math.floor((Date.now() - inicioBusqueda) / 1000) + ' s'; }, 500); pintarMultijugador(); });
const pararReloj = () => { clearInterval(relojBusqueda); relojBusqueda = null; inicioBusqueda = 0; };
lobby.al('busquedaCancelada', () => { pararReloj(); pintarMultijugador(); });
lobby.al('emparejado', () => { pararReloj(); html('#mj-chat-mensajes', ''); anadirChat({ de: null, texto: '¡Rival encontrado! Pulsad «Listo» los dos cuando queráis empezar.' }); pintarMultijugador(); });
lobby.al('error', m => avisoMultijugador(m.mensaje, true));
lobby.al('salaLista', m => {
  // empieza la preparación: el borrador parte de la rama del reino (o cristiano), vacío
  Object.assign(preparacion, { rama: (reino && reino.rama) || preparacion.rama || RAMA_POR_DEFECTO, ejercito: [], confirmado: false, equipo: m.equipo, clima: m.clima, presupuesto: m.presupuesto, ficha: null });
  anadirChat({ de: null, texto: `Los dos estáis listos. Juegas en el lado ${m.equipo === 0 ? 'izquierdo' : 'derecho'}; clima: ${nombreClima(m.clima)}. Elegid rama y ejército con ${formatoNumero(m.presupuesto)} de oro.` });
  pintarMultijugador();
});
lobby.al('ejercitoAceptado', () => { preparacion.confirmado = true; pintarMultijugador(); });
lobby.al('batallaLista', m => { if (m.claveReconexion) guardarReconexion(lobby.url, m.claveReconexion); fijarRelojDespliegue((m.tiempoDespliegue || TIEMPO_DESPLIEGUE) * 1000); preparacion.ficha = m; pintarFicha(m); anadirChat({ de: null, texto: 'Los dos ejércitos están confirmados. ¡A la batalla!' }); pintarMultijugador(); empezarBatallaRed(m); });
// «perdida» solo si llegó a estar conectado; si el intento de conexión falla, el aviso lo da el formulario de conexión
lobby.al('cerrado', m => {
  pararReloj();
  // en plena batalla en red: a reconectar (la batalla queda congelada en pantalla mientras tanto)
  if (batalla && batalla.enRed && !batalla.terminada()) { intentarReconectar(); return; }
  if (reconexion) return;
  pintarMultijugador(); if (m.estabaConectado) avisoMultijugador('Se ha perdido la conexión con el servidor.', true);
});

/* ----- paso 3: la batalla en red -----
   Los turnos del servidor pueden llegar mientras se preparan los blasones y texturas: se guardan y se entregan al montar la
   batalla, en orden. */
const turnosEnEspera = [];
const entregarTurno = t => { if (batalla && batalla.enRed) batalla.recibirTurno(t); else turnosEnEspera.push(t); };
lobby.al('turno', entregarTurno);
// estado completo del servidor tras una desincronía: va en la misma cola, detrás del turno al que corresponde
lobby.al('estado', entregarTurno);
lobby.al('desincronia', m => { if (batalla && batalla.enRed) batalla.desincronia(m.n); });
// servidor en modo relevo: quiere el estado de este navegador para pasárselo al rival (desincronía o reconexión)
lobby.al('pedirEstado', m => { if (batalla && batalla.enRed) batalla.pedirEstado(m.n); });
lobby.al('pedirVerificacion', m => { if (batalla && batalla.enRed) batalla.pedirVerificacion(m.n); });
// aviso de que el rival ya ha terminado de desplegar
function mostrarRivalListo(listos) {
  if (!batalla || !batalla.enRed || !batalla.enDespliegue()) return;
  const rivalListo = listos.includes(1 - batalla.equipoPropio), hueco = elemento('#hud-despliegue');
  let aviso = hueco.querySelector('.rival-listo');
  if (rivalListo && !aviso) { aviso = document.createElement('span'); aviso.className = 'rival-listo'; aviso.textContent = 'Tu rival ya está listo.'; hueco.appendChild(aviso); }
}
lobby.al('despliegue', m => { mostrarRivalListo(m.listos); fijarRelojDespliegue(m.quedanDespliegue); });

/* ----- cuenta atrás del despliegue -----
   Lo que queda lo dice el servidor (al empezar y cada vez que cambia algo); aquí se descuenta. Se congela mientras se espera
   a un desconectado, porque el servidor tampoco lo cuenta. */
const relojDespliegue = { quedanMs: TIEMPO_DESPLIEGUE * 1000, desde: Date.now(), congelado: false };
const quedanDespliegueAhora = () => Math.max(0, relojDespliegue.quedanMs - (relojDespliegue.congelado ? 0 : Date.now() - relojDespliegue.desde));
function fijarRelojDespliegue(quedanMs) { if (typeof quedanMs === 'number') { relojDespliegue.quedanMs = quedanMs; relojDespliegue.desde = Date.now(); } relojDespliegue.congelado = false; }
function congelarRelojDespliegue() { if (!relojDespliegue.congelado) { relojDespliegue.quedanMs = quedanDespliegueAhora(); relojDespliegue.congelado = true; } }
setInterval(() => {
  const hueco = document.getElementById('hud-despliegue-reloj'); if (!hueco) return;
  if (!batalla || !batalla.enRed || !batalla.enDespliegue()) { if (hueco.textContent) hueco.textContent = ''; return; }
  const segundos = Math.ceil(quedanDespliegueAhora() / 1000);
  hueco.textContent = 'Quedan ' + minutosYSegundos(segundos) + (relojDespliegue.congelado ? ' (en espera)' : '');
  hueco.title = 'Al acabar el tiempo de despliegue la batalla empieza aunque no hayáis pulsado «Comenzar»';
  hueco.classList.toggle('urgente', segundos <= 15);
}, 250);

// cuenta atrás que se repinta cada medio segundo hasta `hasta` (ms): pintar(segundos que quedan); devuelve el intervalo
function cuentaAtras(hasta, pintar) { const repintar = () => pintar(Math.max(0, Math.ceil((hasta - Date.now()) / 1000))); repintar(); return setInterval(repintar, 500); }

/* ----- pausa de común acuerdo ----- */
// aviso que se quita solo a los pocos segundos (si no lo ha sustituido otro)
function avisoRedTemporal(texto, ms) { avisoRed(texto); setTimeout(() => { if (elemento('#aviso-red').textContent === texto) avisoRed(''); }, ms || 3500); }
const TEXTO_PAUSA_PEDIDA = 'Has pedido una pausa. Esperando la respuesta de tu rival…';
const quitarAvisoPausaPedida = () => { if (elemento('#aviso-red').textContent === TEXTO_PAUSA_PEDIDA) avisoRed(''); };
let temporizadorPanelPausa = null, relojPausa = null;
function ocultarPanelPausa() { clearTimeout(temporizadorPanelPausa); elemento('#panel-pausa-red').classList.add('oculto'); }
function pararRelojPausa() { clearInterval(relojPausa); relojPausa = null; const d = elemento('#aviso-pausa-detalle'); if (d) d.textContent = ''; }
// pausa en vigor: quién la pidió y cuánto falta para que la batalla siga sola
function mostrarPausa(por, quedanMs) {
  pararRelojPausa();
  relojPausa = cuentaAtras(Date.now() + quedanMs, s => { elemento('#aviso-pausa-detalle').textContent = `Pausa pedida por ${por}. Sigue sola en ${minutosYSegundos(s)}; cualquiera puede quitarla con P o ▶.`; });
}
lobby.al('pausaSolicitada', () => avisoRed(TEXTO_PAUSA_PEDIDA));
lobby.al('pausaPedida', m => {
  html('#panel-pausa-red-texto', `<strong>${textoEsc(m.nombre)}</strong> pide una pausa. Mientras dure, la batalla se detiene pero se pueden dar órdenes.`);
  elemento('#panel-pausa-red').classList.remove('oculto');
  clearTimeout(temporizadorPanelPausa); temporizadorPanelPausa = setTimeout(ocultarPanelPausa, m.espera * 1000);
});
lobby.al('pausaCaducada', () => ocultarPanelPausa());
lobby.al('pausaRechazada', m => { quitarAvisoPausaPedida(); avisoRedTemporal('Sin pausa: ' + m.motivo); });
lobby.al('pausa', m => {
  ocultarPanelPausa(); quitarAvisoPausaPedida();
  if (batalla && batalla.enRed) batalla.pausaRed(m.activa);
  if (m.activa) mostrarPausa(m.por, m.duracion * 1000);
  else { pararRelojPausa(); avisoRedTemporal(m.por ? m.por + ' ha quitado la pausa.' : 'Se acabó el tiempo de pausa: la batalla sigue.', 2500); }
});
elementoListo(() => {
  elemento('#btn-pausa-aceptar').addEventListener('click', () => { lobby.enviar({ tipo: 'responderPausa', acepta: true }); ocultarPanelPausa(); });
  elemento('#btn-pausa-rechazar').addEventListener('click', () => { lobby.enviar({ tipo: 'responderPausa', acepta: false }); ocultarPanelPausa(); });
});

/* ----- paso 4: desconexiones ----- */
// aviso grande en el centro de la batalla (conexión perdida, rival desconectado); '' lo quita
function avisoRed(texto) { const a = elemento('#aviso-red'); if (!a) return; a.textContent = texto || ''; a.classList.toggle('oculto', !texto); }
// el rival se ha desconectado: la batalla se congela en el servidor y aquí se cuenta el tiempo que se le espera
let esperaRival = null;
lobby.al('rivalDesconectado', m => {
  clearInterval(esperaRival); congelarRelojDespliegue();
  esperaRival = cuentaAtras(Date.now() + m.espera * 1000, quedan => avisoRed(`${m.nombre} se ha desconectado. Se le espera ${quedan} s; si no vuelve, ganas la batalla.`));
});
lobby.al('rivalVuelto', m => { clearInterval(esperaRival); esperaRival = null; avisoRed(''); fijarRelojDespliegue(m.quedanDespliegue); });
// conexión propia perdida: reintentos cada 2 s; al conectar, el servidor manda reanudarBatalla y la batalla se vuelve a montar
let reconexion = null, ultimaReanudacion = 0;
function intentarReconectar() {
  if (reconexion) return;
  congelarRelojDespliegue();
  reconexion = { hasta: Date.now() + ((preparacion.ficha && preparacion.ficha.esperaReconexion) || ESPERA_RECONEXION) * 1000, temporizador: null };
  const rendirseAlCorte = texto => {
    reconexion = null; avisoRed('');
    if (batalla && batalla.enRed) { batalla.detener(); batalla = null; document.body.classList.remove('batalla-red'); }
    borrarReconexion(); mostrar('multijugador'); pintarMultijugador(); avisoMultijugador(texto, true);
  };
  const intentar = async () => {
    if (!reconexion) return;
    const quedan = Math.ceil((reconexion.hasta - Date.now()) / 1000);
    if (quedan <= 0) return rendirseAlCorte('Se perdió la conexión con el servidor y no se pudo volver a la batalla.');
    avisoRed(`Conexión perdida con el servidor. Reconectando… (${quedan} s)`);
    const intento = Date.now();
    try {
      await lobby.conectar(lobby.url, lobby.nombre);
      reconexion = null;
      // si el servidor no devuelve la batalla (ya terminó, o la clave no vale) no hay a qué volver
      setTimeout(() => { if (ultimaReanudacion < intento && batalla && batalla.enRed && !batalla.terminada()) rendirseAlCorte('Has vuelto a conectar, pero la batalla ya había terminado.'); }, 2500);
    } catch (e) { if (reconexion) reconexion.temporizador = setTimeout(intentar, 2000); }
  };
  intentar();
}
lobby.al('reanudarBatalla', m => {
  ultimaReanudacion = Date.now(); reconexion = null; clearInterval(esperaRival); avisoRed('');
  turnosEnEspera.length = 0;                       // lo de la conexión anterior ya no vale: manda el estado que trae
  guardarReconexion(lobby.url, m.ficha.claveReconexion); fijarRelojDespliegue(m.quedanDespliegue);
  Object.assign(preparacion, { equipo: m.equipo, ficha: m.ficha });
  empezarBatallaRed(m.ficha, m);
});
async function empezarBatallaRed(ficha, reanudacion) {
  if (batalla) { batalla.detener(); batalla = null; }
  const equipo = preparacion.equipo;
  const jugadores = [0, 1].map(e => ficha.jugadores.find(j => j.equipo === e));
  const yo = jugadores[equipo], rival = jugadores[1 - equipo];
  // blasón de cada jugador (el que mandó al confirmar o el de su rama), colores y texturas, como en la batalla individual
  const estados = jugadores.map(j => j.blason && PuenteDisenador.esEstadoValido(j.blason) ? j.blason : blasonDeRama(j.rama));
  estados[1] = blasonDistinguible(estados[0], estados[1], jugadores[1].rama);
  const { colores, texturas, arte } = await prepararBandos(jugadores.map(j => j.nombre), estados);
  if (!lobby.conectado()) return;            // se perdió la conexión mientras se preparaba
  prepararHudBatalla(true);
  mostrar('batalla');
  html('#hud-batalla-titulo', `Partida en red: <strong>${textoEsc(yo.nombre)}</strong> (${equipo === 0 ? 'izquierda' : 'derecha'}, ${textoEsc(RAMAS[yo.rama].nombre)}) contra <strong>${textoEsc(rival.nombre)}</strong> (${textoEsc(RAMAS[rival.rama].nombre)})`);
  marcadorInicial = null;
  batalla = iniciarBatalla({
    reino, contenedor: elemento('#escenario'), texturasBandera: texturas, arte,
    red: {
      ficha, equipo,
      enviar: orden => lobby.enviar({ tipo: 'orden', orden }),
      listoDespliegue: () => lobby.enviar({ tipo: 'listoDespliegue' }),
      rendirse: () => lobby.enviar({ tipo: 'rendirse' }),
      resumen: (n, h) => lobby.enviar({ tipo: 'resumen', n, h }),
      enviarEstado: (n, estado) => lobby.enviar({ tipo: 'estadoCompleto', n, estado }),
      enviarVerificacion: (n, estado) => lobby.enviar({ tipo: 'estadoVerificacion', n, estado }),
      resultado: (n, ganador) => lobby.enviar({ tipo: 'resultado', n, ganador }),
      pedirPausa: () => lobby.enviar({ tipo: 'pedirPausa' }),
      reanudarPausa: () => lobby.enviar({ tipo: 'reanudarPausa' }),
      reanudacion: reanudacion || null,
    },
    alActualizarHud: actualizarHudBatalla,
    alTerminar: resultado => terminarBatallaRed(resultado, jugadores, colores),
  });
  for (const turno of turnosEnEspera.splice(0)) batalla.recibirTurno(turno);
  elemento('#hud-batalla-titulo').insertAdjacentHTML('beforeend', ` · <span class="clima" title="${textoEsc(batalla.clima.descripcion || '')}">${textoEsc(batalla.clima.nombre || batalla.clima.tipo)}</span>${batalla.mapa ? ` · <span class="clima" title="${textoEsc(batalla.mapa.descripcion)}">${textoEsc(batalla.mapa.nombre)}</span>` : ''}<span id="hud-aviso-actitud"></span>`);
  elemento('#marcador-jugador-nombre').textContent = yo.nombre; elemento('#marcador-enemigo-nombre').textContent = rival.nombre;
  montarBarraUnidades(batalla.unidadesJugador, null);
  elemento('#discurso').classList.add('oculto');
  if (reanudacion) {
    mostrarRivalListo(reanudacion.listos || []); if (!reanudacion.desplegando) elemento('#hud-despliegue').classList.add('oculto');
    if (reanudacion.pausa) { batalla.pausaRed(true); mostrarPausa(reanudacion.pausa.por, reanudacion.pausa.quedan); }
  }
}
/* Si los dos jugadores llevan el mismo blasón o colores muy parecidos (por ejemplo, los dos de la misma rama con su blasón
   de serie), sus tropas no se distinguirían: el de la derecha pasa a uno de colores bien distintos, con el símbolo de su
   rama. Los dos navegadores hacen la misma cuenta, así que los dos ven lo mismo. */
const COLORES_ALTERNATIVOS = [['#1f4fa8', '#f2f2f2'], ['#2e7d32', '#f2d16b'], ['#5b2a86', '#e8c45a'], ['#1a1a1a', '#e8e8e8'], ['#c2571a', '#1f2f5a']];
function distanciaColor(a, b) { const canal = (c, s) => (c >> s) & 255; return Math.hypot(canal(a, 16) - canal(b, 16), canal(a, 8) - canal(b, 8), canal(a, 0) - canal(b, 0)); }
function blasonDistinguible(estadoIzquierda, estadoDerecha, ramaDerecha) {
  const [a1, a2] = coloresDelBlason(estadoIzquierda), [b1, b2] = coloresDelBlason(estadoDerecha);
  const parecidos = JSON.stringify(estadoIzquierda) === JSON.stringify(estadoDerecha) || (distanciaColor(a1, b1) < 90 && distanciaColor(a2, b2) < 120);
  if (!parecidos) return estadoDerecha;
  const par = COLORES_ALTERNATIVOS.find(([c1]) => distanciaColor(hexAEntero(c1), a1) > 160 && distanciaColor(hexAEntero(c1), a2) > 120) || COLORES_ALTERNATIVOS[0];
  return PuenteDisenador.blasonPorDefecto(par[0], par[1], RAMAS[ramaDerecha].simbolo);
}
/* Por qué acabó una batalla en red (el `motivo` que manda el servidor, servidor-lobby.js: terminarBatalla) → explicación para
   quien la ve (ganaste: victoria; rival: su nombre). Un motivo desconocido se explica como una derrota normal. */
const EXPLICACION_FIN_RED = {
  derrota: (victoria, rival) => victoria ? 'El ejército de ' + rival + ' ha sido destruido o ha huido del campo.' : TEXTO_EJERCITO_PERDIDO,
  rendicion: (victoria, rival) => victoria ? rival + ' se ha rendido.' : 'Te has rendido.',
  abandono: (victoria, rival) => victoria ? rival + ' ha abandonado la batalla.' : 'Has abandonado la batalla.',
  error: () => 'La batalla se ha anulado por un error del servidor.',
  disputa: () => 'La batalla se ha anulado: no se pudo comprobar el resultado.',
  trampa: (victoria, rival) => victoria ? rival + ' ha anunciado dos veces un resultado falso.' : 'Has anunciado dos veces un resultado falso.',
  desvio: (victoria, rival) => victoria ? 'La partida de ' + rival + ' se ha desviado de la del servidor varias veces.' : 'Tu partida se ha desviado de la del servidor varias veces.',
};
const MOTIVOS_ANULADA = ['error', 'disputa'];       // sin ganador
// Resultado de una batalla en red: no cambia el reino (ni victorias ni rasgos); se vuelve a la sala para otra
function terminarBatallaRed(resultado, jugadores, colores) {
  batalla.detener(); batalla = null; document.body.classList.remove('batalla-red');
  borrarReconexion(); clearInterval(esperaRival); esperaRival = null; avisoRed(''); ocultarPanelPausa(); pararRelojPausa();
  modoResultado(true);
  const propio = resultado.equipoPropio, yo = jugadores[propio], rival = jugadores[1 - propio];
  const motivo = resultado.red ? resultado.red.motivo : 'derrota';
  const explicacion = (EXPLICACION_FIN_RED[motivo] || EXPLICACION_FIN_RED.derrota)(resultado.victoria, rival.nombre);
  const propias = resultado.unidades.filter(u => u.equipo === propio), enemigas = resultado.unidades.filter(u => u.equipo !== propio);
  pintarResultado({
    titulo: MOTIVOS_ANULADA.includes(motivo) ? 'Batalla anulada' : resultado.victoria ? '¡Victoria!' : 'Derrota', explicacion,
    nombres: [yo.nombre, rival.nombre], resultado, propias, enemigas, tituloEnemigo: rival.nombre,
    notaMapa: `Puntos: muertos de cada bando (claros los tuyos, rojos los de ${textoEsc(rival.nombre)}). Marca final de cada unidad: punto si quedó en pie, aspa si fue aniquilada, flecha si huyó; ★ la guardia del general.`,
    pie: `Partida en red · duración: ${resultado.duracion} s · semilla ${resultado.semilla}. Las partidas en red no cambian tu reino.`,
  });
  mostrar('resultado');
  if (resultado.mapa) dibujarMapaBatalla(elemento('#mapa-batalla'), resultado.mapa, colores[propio][0], colores[1 - propio][0], propio);
}

elementoListo(() => {
  elemento('#btn-menu-multijugador').addEventListener('click', () => { iniciarPantallaMultijugador(); mostrar('multijugador'); });
  elemento('#btn-mj-menu').addEventListener('click', () => { lobby.cerrar(); pararReloj(); iniciarPantallaMenu(); mostrar('menu'); });
  elemento('#form-mj-conectar').addEventListener('submit', async e => {
    e.preventDefault();
    const url = elemento('#in-servidor').value.trim() || SERVIDOR_POR_DEFECTO;
    guardarServidor(url); avisoMultijugador('Conectando…');
    try { await lobby.conectar(url, nombreEnRed()); avisoMultijugador(''); }
    catch (err) { avisoMultijugador(err.message + ' ¿Está encendido el servidor? (cd servidor && npm start)', true); }
    pintarMultijugador();
  });
  elemento('#btn-mj-desconectar').addEventListener('click', () => { lobby.cerrar(); pararReloj(); pintarMultijugador(); });
  elemento('#form-mj-crear').addEventListener('submit', e => {
    e.preventDefault(); avisoMultijugador('');
    html('#mj-chat-mensajes', '');
    lobby.enviar({ tipo: 'crearSala', nombre: elemento('#in-mj-nombre-sala').value.trim() || ('Sala de ' + nombreEnRed()), privada: elemento('#in-mj-privada').checked });
  });
  elemento('#form-mj-codigo').addEventListener('submit', e => { e.preventDefault(); avisoMultijugador(''); html('#mj-chat-mensajes', ''); lobby.enviar({ tipo: 'unirse', codigo: elemento('#in-mj-codigo').value }); });
  elemento('#mj-lista-salas').addEventListener('click', e => { const b = e.target.closest('.btn-mj-unirse'); if (!b) return; avisoMultijugador(''); html('#mj-chat-mensajes', ''); lobby.enviar({ tipo: 'unirse', salaId: b.dataset.sala }); });
  elemento('#btn-mj-buscar').addEventListener('click', () => { avisoMultijugador(''); lobby.enviar({ tipo: lobby.buscando ? 'cancelarBusqueda' : 'buscarPartida' }); });
  elemento('#btn-mj-listo').addEventListener('click', () => { const yo = lobby.sala && lobby.sala.jugadores.find(j => j.id === lobby.id); lobby.enviar({ tipo: 'listo', listo: !(yo && yo.listo) }); });
  elemento('#btn-mj-salir').addEventListener('click', () => lobby.enviar({ tipo: 'salir' }));
  // paso 2
  elemento('#sel-mj-presupuesto').addEventListener('change', e => lobby.enviar({ tipo: 'opcionesSala', presupuesto: Number(e.target.value) }));
  elemento('#sel-mj-rama').addEventListener('change', e => { if (preparacion.confirmado) return; if (e.target.value !== preparacion.rama) { preparacion.rama = e.target.value; preparacion.ejercito = []; } pintarPreparacion(); });
  elemento('#mj-tropas').addEventListener('click', e => { const b = e.target.closest('.btn-mj-comprar'); if (!b || b.disabled || preparacion.confirmado || !puedeAnadirTropa(preparacion.ejercito, b.dataset.tipo)) return; preparacion.ejercito.push({ tipo: b.dataset.tipo, nivel: Number(b.dataset.nivel) }); pintarPreparacion(); });
  elemento('#mj-mi-ejercito').addEventListener('click', e => { const b = e.target.closest('.btn-quitar'); if (!b || preparacion.confirmado) return; preparacion.ejercito.splice(Number(b.dataset.indice), 1); pintarPreparacion(); });
  elemento('#btn-mj-confirmar').addEventListener('click', () => { avisoMultijugador(''); lobby.enviar({ tipo: 'ejercito', rama: preparacion.rama, ejercito: preparacion.ejercito, blason: blasonParaMultijugador(preparacion.rama) }); });
  elemento('#btn-mj-cambiar').addEventListener('click', () => { preparacion.confirmado = false; lobby.enviar({ tipo: 'retirarEjercito' }); pintarMultijugador(); });
  elemento('#form-mj-chat').addEventListener('submit', e => { e.preventDefault(); const entrada = elemento('#in-mj-chat'); if (entrada.value.trim()) lobby.enviar({ tipo: 'chat', texto: entrada.value }); entrada.value = ''; });
});
