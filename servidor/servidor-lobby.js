'use strict';
/* ---------- Servidor de lobby y matchmaking (multijugador, paso 1, 2026-10-13) ----------
   WebSocket (paquete «ws»). Sin base de datos: todo vive en memoria mientras el servidor está encendido.

   Qué hace:
   · Jugadores: cada conexión se presenta con su nombre («hola») y recibe un id.
   · Salas de 2 jugadores: crear (pública o privada), listar las públicas con hueco, unirse por id (desde la lista) o por
     código de 6 letras (para invitar a amigos, también a las privadas), salir, chat, «listo». El primero en entrar es el
     anfitrión; si se va, lo hereda el otro. Una sala vacía se borra.
   · Matchmaking: «buscarPartida» mete al jugador en una cola; en cuanto hay dos, el servidor les crea una sala privada y los
     mete dentro. «cancelarBusqueda» lo saca de la cola.
   · Fases de la sala (paso 2): «espera» (el anfitrión elige el presupuesto; los dos marcan «Listo») → «preparacion» (el
     servidor fija semilla y clima y cada jugador elige rama y ejército; el servidor lo valida con el motor del juego:
     presupuesto, tropas de la rama, niveles) → «lista» (con los dos ejércitos confirmados, el servidor manda a los dos la
     ficha de la batalla) → «batalla» (paso 3). Si alguien sale, la sala vuelve a «espera»; al acabar la batalla, también.
   · Batalla en red (paso 3, lockstep con el servidor como árbitro): el servidor monta la MISMA simulación que los navegadores
     (motor.crearBatallaRed) y cada 100 ms reparte un turno: las órdenes recibidas desde el anterior que ha podido aplicar a
     su simulación (las demás se descartan: unidad ajena o muerta, valores raros) y cuántos pasos avanzar (0 durante el
     despliegue, 3 en combate). Los jugadores aplican lo mismo en el mismo orden, así que las tres simulaciones siguen
     idénticas. El despliegue acaba cuando los dos pulsan «comenzar» o a los 120 s. Cada segundo los jugadores mandan un
     resumen de su estado; si no coincide con el del servidor, el servidor le manda su estado completo (estado) y el
     navegador lo copia encima del suyo (paso 4).
     Despliegue a ciegas (paso 4): mientras se despliega, a cada jugador solo le llegan sus propias órdenes; las del rival se
     le entregan todas juntas en el turno que empieza la batalla (no se pisan: cada orden de despliegue solo mueve unidades
     de su bando y no usa el azar, así que el resultado es el mismo que aplicándolas en su momento).
     Reconexión (paso 4): si un jugador pierde la conexión en plena batalla, la batalla se congela hasta 60 s. Al volver a
     conectarse con la clave de reconexión que recibió con la ficha, el servidor le devuelve la ficha y el estado actual
     (reanudarBatalla) y la batalla sigue. Si no vuelve a tiempo, pierde por abandono.
     Pausa de común acuerdo (paso 4): un jugador la pide (pedirPausa), el otro la acepta o la rechaza en 15 s
     (responderPausa); como mucho 3 pausas por jugador y 2 minutos cada una; cualquiera la quita (reanudarPausa). En pausa
     la simulación no avanza, pero las órdenes se siguen aplicando (turnos de 0 pasos), como en la batalla individual.
     Solo en combate: en el despliegue no hace falta. El tiempo de despliegue que queda viaja en los mensajes
     (quedanDespliegue, ms) para que los jugadores vean la cuenta atrás; no corre mientras se espera a un desconectado.
     El final lo decide el servidor: derrota de un bando (3 s después, con el mismo criterio que la batalla individual),
     rendición o abandono (salir de la sala o no volver tras una desconexión).

   Protocolo: mensajes JSON { tipo, ... } en ambos sentidos.
     cliente → servidor: hola {nombre, version, claveReconexion?} · listarSalas · crearSala {nombre, privada} · unirse {salaId | codigo}
                         · salir · listo {listo} · chat {texto} · buscarPartida · cancelarBusqueda
                         · opcionesSala {presupuesto} (anfitrión) · ejercito {rama, ejercito, blason} · retirarEjercito
                         · orden {orden} · listoDespliegue · resumen {n, h} · rendirse
                         · estadoCompleto {n, estado} · resultado {n, ganador}   (solo en modo relevo)
                         · pedirPausa · responderPausa {acepta} · reanudarPausa
     servidor → cliente: bienvenida {id, version} · salas {lista} · enSala {sala} · fueraDeSala · chat {de, texto, hora}
                         · buscando {enCola} · busquedaCancelada · emparejado {salaId}
                         · salaLista {semilla, equipo, clima, presupuesto, sala} · ejercitoAceptado {coste}
                         · batallaLista {semilla, clima, presupuesto, tiempoDespliegue, jugadores: [{nombre, equipo, rama, ejercito, blason, coste}]}
                         · turno {n, ordenes: [{e, o}], pasos, comienza?, fin?: {ganador, motivo}} · despliegue {listos: [equipo]}
                         · desincronia {n} · estado {n, estado, siguientes?} · reanudarBatalla {ficha, equipo, n, desplegando, listos, estado | ordenesPropias, siguientes?}
                         · pedirEstado {n}   (solo en modo relevo)
                         · rivalDesconectado {nombre, espera} · rivalVuelto {nombre, quedanDespliegue}
                         · pausaSolicitada {espera} · pausaPedida {nombre, espera} · pausaRechazada {motivo}
                         · pausa {activa, por, duracion, pausasQuedan}
                         · error {mensaje}

   Además sirve el juego por HTTP en el mismo puerto (2026-10-13): http://IP-DEL-EQUIPO:8787/ abre juego.html, así otro jugador
   de la red no necesita copiar la carpeta. Solo se sirve lo que el juego carga (lista blanca RUTAS_PUBLICAS).

   Uso: node servidor-lobby.js [puerto]   (por defecto 8787; también la variable PORT, para alojamientos en la nube) */
const { WebSocketServer } = require('ws');
const { crearMotor } = require('./motor.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const RAIZ_JUEGO = path.resolve(__dirname, '..');
const TIPOS_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.md': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
/* Lista blanca de lo que se sirve por HTTP (2026-10-13): solo lo que el juego carga. Nada de servidor/, ni el README, ni
   tools/, ni capturas, ni el material de partida del arte (arte/entrada, arte/demos). Rutas relativas a
   la carpeta del juego, con «/». Si el juego empieza a cargar algo nuevo, hay que añadirlo aquí. */
const RUTAS_PUBLICAS = [
  /^juego\.html$/,
  /^(juego|estilo)\.css$/,
  /^js\/[\w\/-]+\.js$/,                      // el juego (js/ y js/juego/)
  /^disenador\/[\w\/-]+\.js$/,                  // el diseñador de estandartes que dibuja los blasones
  /^figuras\/[\w-]+\.js$/,                       // figuras heráldicas, se cargan al usarlas
  /^arte\/[\w.-]+\.(png|json|js)$/,              // arte propio: manifest y hojas, solo en arte/ (sin subcarpetas)
  /^tutorial\/(en\/)?[\w-]+\.jpg$/,                     // capturas del tutorial (tools/capturas-tutorial.js)
  /^sonido\/[\w-]+\.mp3$/,                              // muestras de sonido (js/juego/12-sonido.js)
];
const esRutaPublica = relativa => RUTAS_PUBLICAS.some(patron => patron.test(relativa));
// Archivos del juego por HTTP: «/» es juego.html; solo los de la lista blanca
function servirArchivo(peticion, respuesta) {
  if (peticion.method !== 'GET' && peticion.method !== 'HEAD') { respuesta.writeHead(405); return respuesta.end(); }
  let ruta;
  try { ruta = decodeURIComponent(new URL(peticion.url, 'http://x').pathname); } catch (e) { respuesta.writeHead(400); return respuesta.end(); }
  // comprobación de vida (Render y el «despertador» externo que lo mantiene encendido): no carga el juego
  if (ruta === '/salud') { respuesta.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return respuesta.end(JSON.stringify(Object.assign({ ok: true, version: VERSION_PROTOCOLO, arrancado: ARRANQUE }, estadoGlobal ? estadoGlobal() : {}))); }
  if (ruta === '/' || ruta === '') ruta = '/juego.html';
  const fichero = path.resolve(RAIZ_JUEGO, '.' + ruta);
  const relativa = path.relative(RAIZ_JUEGO, fichero);
  const tipo = TIPOS_MIME[path.extname(fichero).toLowerCase()];
  if (relativa.startsWith('..') || path.isAbsolute(relativa) || !tipo || !esRutaPublica(relativa.split(path.sep).join('/'))) { respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return respuesta.end('No encontrado'); }
  fs.stat(fichero, (error, info) => {
    if (error || !info.isFile()) { respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return respuesta.end('No encontrado'); }
    respuesta.writeHead(200, { 'Content-Type': tipo, 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    if (peticion.method === 'HEAD') return respuesta.end();
    fs.createReadStream(fichero).pipe(respuesta);
  });
}
// Direcciones IPv4 de la red local de este equipo (para decir a quién invitar dónde conectarse)
function direccionesLocales() { return Object.values(os.networkInterfaces()).flat().filter(d => d && d.family === 'IPv4' && !d.internal && !d.address.startsWith('169.254')).map(d => d.address); }

const VERSION_PROTOCOLO = 1;
const ARRANQUE = new Date().toISOString();
let estadoGlobal = null;            // jugadores, salas y cola del servidor en marcha (para /salud)
const MAX_JUGADORES_SALA = 2;
const PRESUPUESTOS = [6000, 9000, 12000, 18000, 25000];   // oro de cada jugador; 12000 es el oro inicial de un reino
const PRESUPUESTO_POR_DEFECTO = 12000;
const MAX_TAMANO_BLASON = 200000;                           // caracteres del blasón en JSON (los importados con muchas capas)
const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin O/0 ni I/1, que se confunden al dictarlos
const MS_TURNO = 100;                 // un turno de batalla cada 100 ms…
const PASOS_POR_TURNO = 3;            // …que son 3 pasos de simulación de 1/30 s
const TIEMPO_DESPLIEGUE = 120;        // segundos de despliegue como mucho
const TURNOS_ENTRE_RESUMENES = 10;    // los jugadores mandan su resumen de estado cada 10 turnos (1 s)
const MAX_ORDENES_POR_TURNO = 30;     // por jugador: más es un cliente roto o malicioso
const ESPERA_RECONEXION = 60;         // segundos que la batalla espera congelada a un jugador desconectado
const MS_ENTRE_REENVIOS = 5000;       // como mucho un reenvío del estado completo cada 5 s por jugador
const MAX_PAUSAS = 3;                 // pausas de común acuerdo por jugador y batalla
const DURACION_PAUSA = 120;           // s; después la batalla sigue sola
/* Modo de las batallas en red (2026-10-14). En el plan gratis de Render (0,1 CPU) el servidor no puede simular una batalla
   grande: medido con 20 unidades por bando, repartía 3,7 turnos por segundo de los 10 debidos y la batalla iba al 40 % de la
   velocidad. Dos modos, con interruptor:
   · árbitro (BATALLA_ARBITRO=1, u opción arbitro: true): el servidor simula la batalla con el mismo código, descarta las
     órdenes que no valen en su simulación, compara los resúmenes con el suyo, manda su estado a quien se desvía y decide el final.
   · relevo (por defecto): el servidor no simula. Reparte los turnos igual (las órdenes se validan contra la simulación del
     principio, sin avanzar: dueño de la unidad, valores raros), compara los resúmenes de los dos navegadores entre sí y, si
     no coinciden, pide el estado al del equipo 0 y se lo manda al otro con los turnos que hubo después; para reconectar a
     alguien en combate, se lo pide al que sigue conectado (la batalla sigue congelada mientras tanto); y el final lo anuncia
     el primer navegador que lo detecta (mismo criterio: derrota de un bando + 3 s de remate). Un cliente trucado podría
     mentir sobre el final: se acepta para partidas entre amigos. */
const ARBITRO_POR_DEFECTO = /^(1|true|si|sí)$/i.test(String(process.env.BATALLA_ARBITRO || '').trim());
const TURNOS_EN_HISTORIAL = 900;      // relevo: turnos repartidos que se guardan (90 s) para reenviarlos detrás de un estado
const ESPERA_ESTADO = 20000;          // relevo: ms que se espera el estado pedido a un navegador antes de rendirse
const ESPERA_RESPUESTA_PAUSA = 15;    // s para aceptar o rechazar una pausa pedida

function crearServidorLobby(opciones) {
  const o = Object.assign({ puerto: 8787, registro: true, esperaReconexion: ESPERA_RECONEXION, arbitro: ARBITRO_POR_DEFECTO }, opciones || {});
  const servidorHttp = http.createServer(servirArchivo);
  const wss = new WebSocketServer({ server: servidorHttp, maxPayload: 1024 * 1024 });
  servidorHttp.listen(o.puerto);
  const jugadores = new Map();   // ws → { id, nombre, sala, buscando, vivo }
  const salas = new Map();       // id → { id, codigo, nombre, privada, jugadores: [jugador], listos: Set(id), creada, desdeMatchmaking }
  const cola = [];               // jugadores buscando partida, por orden de llegada
  const motor = crearMotor();    // el código del juego, para validar ejércitos (y simular en el paso 3)
  let siguienteId = 1;
  const log = (...a) => { if (o.registro) console.log(new Date().toISOString().slice(11, 19), ...a); };

  const enviar = (jugador, mensaje) => { if (jugador.ws.readyState === 1) jugador.ws.send(JSON.stringify(mensaje)); };
  const codigoNuevo = () => { let c; do { c = Array.from({ length: 6 }, () => LETRAS_CODIGO[Math.floor(Math.random() * LETRAS_CODIGO.length)]).join(''); } while ([...salas.values()].some(s => s.codigo === c)); return c; };
  // el ejército del rival no se ve hasta que los dos confirman (solo si ya lo ha confirmado)
  const resumenSala = s => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, privada: s.privada, anfitrion: s.jugadores[0] ? s.jugadores[0].nombre : null, jugadores: s.jugadores.map(j => ({ id: j.id, nombre: j.nombre, listo: s.listos.has(j.id), ejercitoConfirmado: s.ejercitos.has(j.id) })), max: MAX_JUGADORES_SALA, desdeMatchmaking: !!s.desdeMatchmaking, fase: s.fase, presupuesto: s.presupuesto, presupuestos: PRESUPUESTOS, clima: s.fase !== 'espera' ? s.clima : null, mapa: s.fase !== 'espera' ? s.mapa : null });
  const listaPublica = () => [...salas.values()].filter(s => !s.privada && s.jugadores.length < MAX_JUGADORES_SALA).map(resumenSala);
  // la lista de salas se reenvía a todos los que están en el lobby (sin sala) cada vez que cambia algo
  const avisarLobby = () => { const lista = listaPublica(); for (const j of jugadores.values()) if (!j.sala) enviar(j, { tipo: 'salas', lista }); };
  const avisarSala = s => { const r = resumenSala(s); for (const j of s.jugadores) enviar(j, { tipo: 'enSala', sala: r }); };

  function sacarDeCola(jugador) { const k = cola.indexOf(jugador); if (k >= 0) cola.splice(k, 1); jugador.buscando = false; }
  // al cambiar quién está, la sala vuelve a la espera: nadie listo y sin ejércitos
  function reiniciarSala(sala) { sala.listos.clear(); sala.ejercitos.clear(); sala.fase = 'espera'; sala.semilla = null; sala.clima = null; sala.mapa = null; }
  function meterEnSala(jugador, sala) {
    sacarDeCola(jugador);
    sala.jugadores.push(jugador); jugador.sala = sala;
    reiniciarSala(sala);
    avisarSala(sala); avisarLobby();
  }
  /* ----- batalla en red ----- */
  function empezarBatallaSala(sala, ficha) {
    const batalla = { ficha, simulacion: motor.crearBatallaRed(ficha), equipos: new Map(sala.jugadores.map((j, equipo) => [j.id, equipo])), turno: 0, desplegando: true, inicio: Date.now(), listos: new Set(), pendientes: [], resumenes: new Map(), finEn: null, terminada: false, desincronias: 0,
      claves: [0, 1].map(() => crypto.randomBytes(16).toString('hex')),   // para volver a la batalla tras una desconexión
      ausentes: new Map(),                                                  // equipo → { jugador, desde }
      ocultas: [[], []],                    // despliegue a ciegas: órdenes del rival que cada equipo aún no ha recibido
      desplieguePropio: [[], []],           // órdenes de despliegue de cada equipo (para reconstruirlo si se reconecta)
      pedirEstado: new Set(), reenviado: new Map(),
      pausa: null, solicitudPausa: null, pausasUsadas: [0, 0],
      arbitro: !!o.arbitro,
      historial: [],                        // relevo: turnos repartidos en combate (los últimos TURNOS_EN_HISTORIAL)
      resumenesJugadores: new Map(),        // relevo: n → [resumen del equipo 0, resumen del equipo 1]
      solicitudEstado: null,                // relevo: { fuente, destinos: [{ jugador, reconexion }], desde }
      reincorporando: null };               // relevo: jugador que vuelve en combate y espera el estado (la batalla sigue congelada)
    sala.batalla = batalla; sala.fase = 'batalla';
    sala.jugadores.forEach((jug, equipo) => enviar(jug, Object.assign({}, ficha, { claveReconexion: batalla.claves[equipo] })));
    batalla.reloj = setInterval(() => { try { turnoBatalla(sala); } catch (e) { log('error en el turno', sala.codigo, e.stack); terminarBatalla(sala, null, 'error'); } }, MS_TURNO);
    log('batalla en marcha', sala.codigo, batalla.arbitro ? '(servidor árbitro)' : '(servidor de relevo)');
  }
  const repartir = (sala, mensaje) => { const texto = JSON.stringify(mensaje); for (const j of sala.jugadores) if (j.ws.readyState === 1) j.ws.send(texto); };
  const jugadorDeEquipo = (sala, equipo) => sala.jugadores.find(j => sala.batalla.equipos.get(j.id) === equipo);
  function turnoBatalla(sala) {
    const b = sala.batalla; if (!b || b.terminada) return;
    // con alguien desconectado la batalla se congela; si no vuelve a tiempo, pierde por abandono
    if (b.ausentes.size) {
      for (const [equipo, ausente] of b.ausentes) if (Date.now() - ausente.desde > o.esperaReconexion * 1000) return terminarBatalla(sala, b.ausentes.size === 2 ? null : 1 - equipo, 'abandono');
      return;
    }
    if (b.solicitudEstado && Date.now() - b.solicitudEstado.desde > ESPERA_ESTADO) {
      const s = b.solicitudEstado; b.solicitudEstado = null;
      log('el estado pedido no llegó', sala.codigo, s.fuente.nombre);
      if (s.destinos.some(d => d.reconexion)) return terminarBatalla(sala, null, 'error');
    }
    if (b.reincorporando) return;          // relevo: se espera el estado para quien vuelve; mientras, nada avanza
    if (b.solicitudPausa && Date.now() - b.solicitudPausa.desde > ESPERA_RESPUESTA_PAUSA * 1000) {
      const pidio = jugadorDeEquipo(sala, b.solicitudPausa.equipo); b.solicitudPausa = null;
      if (pidio) enviar(pidio, { tipo: 'pausaRechazada', motivo: 'Tu rival no ha respondido.' });
      repartir(sala, { tipo: 'pausaCaducada' });
    }
    if (b.pausa && Date.now() - b.pausa.desde > DURACION_PAUSA * 1000) terminarPausa(sala, null);
    // órdenes llegadas desde el turno anterior, en orden de llegada: solo se reparten las que el servidor ha podido aplicar
    const ordenes = [];
    for (const { e, o } of b.pendientes.splice(0)) if (b.simulacion.aplicar(e, o, b.desplegando)) ordenes.push({ e, o });
    // en pausa: las órdenes se aplican, pero la simulación no avanza
    if (b.pausa) { if (ordenes.length) { const turnoPausa = { tipo: 'turno', n: ++b.turno, ordenes, pasos: 0 }; repartir(sala, turnoPausa); guardarEnHistorial(b, turnoPausa); } return; }
    if (b.desplegando && !(b.listos.size === 2 || Date.now() - b.inicio > TIEMPO_DESPLIEGUE * 1000)) {
      // despliegue a ciegas: cada uno recibe solo lo suyo; lo del rival se guarda para el turno que empieza la batalla
      if (!ordenes.length) return;
      b.turno++;
      for (const equipo of [0, 1]) {
        const propias = ordenes.filter(x => x.e === equipo);
        b.desplieguePropio[equipo].push(...propias.map(x => x.o)); b.ocultas[equipo].push(...ordenes.filter(x => x.e !== equipo));
        const jugador = jugadorDeEquipo(sala, equipo);
        if (jugador && propias.length) enviar(jugador, { tipo: 'turno', n: b.turno, ordenes: propias, pasos: 0 });
      }
      return;
    }
    const comienza = b.desplegando;
    if (comienza) { b.desplegando = false; log('batalla: fin del despliegue', sala.codigo); }
    const turno = { tipo: 'turno', n: ++b.turno, ordenes, pasos: PASOS_POR_TURNO };
    if (b.arbitro) {
      b.simulacion.avanzar(PASOS_POR_TURNO);
      if (turno.n % TURNOS_ENTRE_RESUMENES === 0) { b.resumenes.set(turno.n, b.simulacion.resumen()); b.resumenes.delete(turno.n - TURNOS_ENTRE_RESUMENES * 30); }
    }
    if (comienza) {
      // el turno que empieza la batalla trae a cada uno el despliegue del rival (y las órdenes de este turno, todavía de despliegue)
      for (const equipo of [0, 1]) { const jugador = jugadorDeEquipo(sala, equipo); if (jugador) enviar(jugador, Object.assign({}, turno, { comienza: true, ordenes: b.ocultas[equipo].concat(ordenes) })); }
      b.ocultas = [[], []];
    } else { repartir(sala, turno); guardarEnHistorial(b, turno); }
    // relevo: el estado lo tiene que dar un navegador
    if (!b.arbitro) {
      if (b.pedirEstado.size && !b.solicitudEstado) {
        const destinos = [...b.pedirEstado].map(id => sala.jugadores.find(j => j.id === id)).filter(Boolean).map(jugador => ({ jugador, reconexion: false }));
        b.pedirEstado.clear();
        if (destinos.length) solicitarEstado(sala, destinos);
      }
      return;
    }
    // reenvío del estado a quien se ha desviado: el del final de este turno, que llega justo detrás de él
    if (b.pedirEstado.size) {
      const estado = b.simulacion.serializar();
      for (const id of b.pedirEstado) { const jugador = sala.jugadores.find(j => j.id === id); if (jugador) { enviar(jugador, { tipo: 'estado', n: turno.n, estado }); b.reenviado.set(id, Date.now()); log('estado reenviado', sala.codigo, jugador.nombre, 'turno', turno.n, Math.round(estado.length / 1024) + ' KB'); } }
      b.pedirEstado.clear();
    }
    // derrota de un bando: 3 s de remate (como en la batalla individual) y el servidor da el resultado
    const tiempo = b.simulacion.tiempo();
    if (b.finEn === null && tiempo > 5 && b.simulacion.algunoDerrotado()) b.finEn = tiempo + 3;
    if (b.finEn !== null && tiempo >= b.finEn) terminarBatalla(sala, b.simulacion.ganador(), 'derrota');
  }
  /* ----- modo relevo ----- */
  function guardarEnHistorial(b, turno) {
    if (b.arbitro) return;
    b.historial.push(turno);
    if (b.historial.length > TURNOS_EN_HISTORIAL) b.historial.splice(0, b.historial.length - TURNOS_EN_HISTORIAL);
  }
  // pide el estado a un navegador conectado que no sea de los destinos (el del equipo 0 si puede ser)
  function solicitarEstado(sala, destinos) {
    const b = sala.batalla, excluidos = destinos.map(d => d.jugador);
    const candidatos = sala.jugadores.filter(j => !excluidos.includes(j) && j.ws.readyState === 1 && ![...b.ausentes.values()].some(a => a.jugador === j));
    candidatos.sort((p, q) => b.equipos.get(p.id) - b.equipos.get(q.id));
    const fuente = candidatos[0];
    if (!fuente) return false;
    b.solicitudEstado = { fuente, destinos, desde: Date.now() };
    enviar(fuente, { tipo: 'pedirEstado', n: b.turno });
    return true;
  }
  // mensaje para volver a una batalla (en el modo relevo, el estado y los turnos siguientes los pone quien llama)
  function mensajeReanudacion(sala, equipo, clave) {
    const b = sala.batalla;
    return { tipo: 'reanudarBatalla', ficha: Object.assign({}, b.ficha, { claveReconexion: clave }), equipo, n: b.turno, desplegando: b.desplegando, listos: [...b.listos], quedanDespliegue: quedanDespliegue(b), pausa: b.pausa ? { por: (jugadorDeEquipo(sala, b.pausa.por) || {}).nombre || '', quedan: DURACION_PAUSA * 1000 - (Date.now() - b.pausa.desde) } : null };
  }
  function avisarVuelta(sala, jugador) {
    const b = sala.batalla;
    for (const j of sala.jugadores) if (j !== jugador) enviar(j, { tipo: 'rivalVuelto', nombre: jugador.nombre, quedanDespliegue: quedanDespliegue(b) });
  }
  // ganador: equipo que gana (null si se anula por un error del servidor)
  function terminarBatalla(sala, ganador, motivo) {
    const b = sala.batalla; if (!b || b.terminada) return;
    b.terminada = true; clearInterval(b.reloj);
    repartir(sala, { tipo: 'turno', n: ++b.turno, ordenes: [], pasos: 0, fin: { ganador, motivo } });
    log('batalla terminada', sala.codigo, 'gana el equipo', ganador, '(' + motivo + ')', b.desincronias ? b.desincronias + ' desincronías' : '');
    // los que seguían desconectados salen de la sala (si no queda nadie, se borra)
    const ausentes = [...b.ausentes.values()].map(a => a.jugador);
    sala.jugadores = sala.jugadores.filter(j => !ausentes.includes(j)); for (const j of ausentes) j.sala = null;
    sala.batalla = null; reiniciarSala(sala);
    if (!sala.jugadores.length) { salas.delete(sala.id); log('sala borrada', sala.codigo); } else avisarSala(sala);
    avisarLobby();
  }
  const quedanDespliegue = b => b.desplegando ? Math.max(0, TIEMPO_DESPLIEGUE * 1000 - (Date.now() - b.inicio)) : 0;
  function empezarPausa(sala, equipo) {
    const b = sala.batalla, quien = jugadorDeEquipo(sala, equipo);
    b.pausa = { por: equipo, desde: Date.now() }; b.pausasUsadas[equipo]++;
    repartir(sala, { tipo: 'pausa', activa: true, por: quien ? quien.nombre : '', duracion: DURACION_PAUSA, pausasQuedan: b.pausasUsadas.map(u => MAX_PAUSAS - u) });
    log('pausa', sala.codigo, 'pedida por', quien && quien.nombre);
  }
  // quien: nombre de quien la quita (null: se acabó el tiempo)
  function terminarPausa(sala, quien) {
    const b = sala.batalla; if (!b.pausa) return;
    b.pausa = null;
    repartir(sala, { tipo: 'pausa', activa: false, por: quien });
  }
  // Conexión perdida en plena batalla: se congela y se espera al jugador (su objeto sigue en la sala, sin conexión)
  function marcarAusente(jugador) {
    const sala = jugador.sala, b = sala.batalla, equipo = b.equipos.get(jugador.id);
    b.ausentes.set(equipo, { jugador, desde: Date.now() });
    for (const j of sala.jugadores) if (j !== jugador) enviar(j, { tipo: 'rivalDesconectado', nombre: jugador.nombre, espera: o.esperaReconexion });
    log('desconectado en batalla', sala.codigo, jugador.nombre, '(se le espera ' + o.esperaReconexion + ' s)');
  }
  // Vuelta a la batalla con la clave de reconexión: el nuevo jugador ocupa el sitio del desconectado
  function reanudarBatalla(jugador, clave) {
    for (const sala of salas.values()) {
      const b = sala.batalla; if (!b || b.terminada) continue;
      const equipo = b.claves.indexOf(clave); if (equipo < 0 || !b.ausentes.has(equipo)) continue;
      const { jugador: anterior, desde } = b.ausentes.get(equipo);
      b.ausentes.delete(equipo);
      if (b.desplegando) b.inicio += Date.now() - desde;      // el tiempo de despliegue no corre mientras se espera
      sala.jugadores[sala.jugadores.indexOf(anterior)] = jugador; jugador.sala = sala;
      b.equipos.delete(anterior.id); b.equipos.set(jugador.id, equipo);
      if (b.listos.has(equipo) && b.desplegando) b.listos.delete(equipo);   // vuelve a desplegar: tiene que volver a pulsar «comenzar»
      const reanudacion = mensajeReanudacion(sala, equipo, clave);
      enviar(jugador, { tipo: 'enSala', sala: resumenSala(sala) });
      // desplegando, el estado entero enseñaría el despliegue del rival: se le devuelven solo sus órdenes
      if (b.desplegando) reanudacion.ordenesPropias = b.desplieguePropio[equipo];
      else if (!b.arbitro) {
        // relevo: el estado lo da el otro navegador; la batalla sigue congelada hasta que llegue (estadoCompleto)
        b.reincorporando = { jugador, equipo, clave, desde: Date.now() };
        if (!solicitarEstado(sala, [{ jugador, reconexion: true }])) { b.reincorporando = null; log('nadie puede dar el estado', sala.codigo); terminarBatalla(sala, null, 'abandono'); return true; }
        log('vuelve a la batalla', sala.codigo, jugador.nombre, 'tras', Math.round((Date.now() - desde) / 1000), 's; se pide el estado al rival');
        return true;
      }
      else reanudacion.estado = b.simulacion.serializar();
      enviar(jugador, reanudacion);
      avisarVuelta(sala, jugador);
      log('vuelve a la batalla', sala.codigo, jugador.nombre, 'tras', Math.round((Date.now() - desde) / 1000), 's');
      return true;
    }
    return false;
  }
  const batallaDe = j => j.sala && j.sala.batalla && !j.sala.batalla.terminada ? j.sala.batalla : null;

  function salirDeSala(jugador, motivo) {
    const sala = jugador.sala; if (!sala) return;
    // abandonar una batalla en marcha: gana el que se queda
    if (batallaDe(jugador)) { const equipo = sala.batalla.equipos.get(jugador.id); sala.jugadores = sala.jugadores.filter(j => j !== jugador); terminarBatalla(sala, 1 - equipo, 'abandono'); sala.jugadores.push(jugador); }
    const enPreparacion = sala.fase !== 'espera';
    sala.jugadores = sala.jugadores.filter(j => j !== jugador); reiniciarSala(sala); jugador.sala = null;
    enviar(jugador, { tipo: 'fueraDeSala', motivo: motivo || 'saliste' });
    if (!sala.jugadores.length) { salas.delete(sala.id); log('sala borrada', sala.codigo); }
    else { for (const j of sala.jugadores) enviar(j, { tipo: 'chat', de: null, texto: jugador.nombre + ' ha salido de la sala' + (enPreparacion ? '; la preparación se cancela' : ''), hora: Date.now() }); avisarSala(sala); }
    avisarLobby();
  }
  function crearSala(nombre, privada, desdeMatchmaking) {
    const sala = { id: 'S' + (siguienteId++), codigo: codigoNuevo(), nombre: String(nombre || 'Sala').slice(0, 40), privada: !!privada, jugadores: [], listos: new Set(), ejercitos: new Map(), fase: 'espera', presupuesto: PRESUPUESTO_POR_DEFECTO, semilla: null, clima: null, batalla: null, creada: Date.now(), desdeMatchmaking: !!desdeMatchmaking };
    salas.set(sala.id, sala); log('sala creada', sala.codigo, sala.nombre, sala.privada ? '(privada)' : '');
    return sala;
  }
  function emparejar() {
    while (cola.length >= 2) {
      const a = cola.shift(), b = cola.shift();
      a.buscando = b.buscando = false;
      const sala = crearSala(a.nombre + ' contra ' + b.nombre, true, true);
      meterEnSala(a, sala); meterEnSala(b, sala);
      for (const j of [a, b]) enviar(j, { tipo: 'emparejado', salaId: sala.id });
      log('emparejados', a.nombre, 'y', b.nombre);
    }
  }

  const acciones = {
    hola(j, m) {
      j.nombre = String(m.nombre || 'Jugador').trim().slice(0, 30) || 'Jugador'; enviar(j, { tipo: 'bienvenida', id: j.id, version: VERSION_PROTOCOLO }); enviar(j, { tipo: 'salas', lista: listaPublica() });
      if (m.claveReconexion && !j.sala) reanudarBatalla(j, String(m.claveReconexion));
    },
    listarSalas(j) { enviar(j, { tipo: 'salas', lista: listaPublica() }); },
    crearSala(j, m) { if (j.sala) salirDeSala(j, 'cambio'); meterEnSala(j, crearSala(m.nombre || ('Sala de ' + j.nombre), m.privada)); },
    unirse(j, m) {
      const sala = m.salaId ? salas.get(m.salaId) : [...salas.values()].find(s => s.codigo === String(m.codigo || '').trim().toUpperCase());
      if (!sala) return enviar(j, { tipo: 'error', mensaje: 'No existe ninguna sala con ese código.' });
      if (sala.jugadores.includes(j)) return avisarSala(sala);
      if (sala.jugadores.length >= MAX_JUGADORES_SALA) return enviar(j, { tipo: 'error', mensaje: 'La sala está llena.' });
      if (m.salaId && sala.privada) return enviar(j, { tipo: 'error', mensaje: 'Es una sala privada: hace falta su código.' });
      if (j.sala) salirDeSala(j, 'cambio');
      meterEnSala(j, sala);
      for (const otro of sala.jugadores) if (otro !== j) enviar(otro, { tipo: 'chat', de: null, texto: j.nombre + ' ha entrado en la sala', hora: Date.now() });
    },
    salir(j) { salirDeSala(j, 'saliste'); },
    listo(j, m) {
      const sala = j.sala; if (!sala || sala.fase !== 'espera') return;
      if (m.listo) sala.listos.add(j.id); else sala.listos.delete(j.id);
      if (sala.jugadores.length === MAX_JUGADORES_SALA && sala.listos.size === MAX_JUGADORES_SALA) {
        // los dos listos: semilla y clima comunes, lado de cada uno (el anfitrión a la izquierda, equipo 0) y a preparar ejércitos
        sala.semilla = 1 + Math.floor(Math.random() * 1e9); sala.clima = motor.elegirClima(sala.semilla); sala.mapa = motor.elegirMapa(sala.semilla); sala.fase = 'preparacion';
        avisarSala(sala);
        sala.jugadores.forEach((jug, equipo) => enviar(jug, { tipo: 'salaLista', semilla: sala.semilla, equipo, clima: sala.clima, presupuesto: sala.presupuesto, sala: resumenSala(sala) }));
        log('sala en preparación', sala.codigo, 'semilla', sala.semilla, sala.clima);
      } else avisarSala(sala);
    },
    opcionesSala(j, m) {
      const sala = j.sala; if (!sala) return;
      if (sala.jugadores[0] !== j) return enviar(j, { tipo: 'error', mensaje: 'Solo el anfitrión cambia las opciones.' });
      if (sala.fase !== 'espera') return enviar(j, { tipo: 'error', mensaje: 'Las opciones solo se cambian antes de empezar.' });
      if (!PRESUPUESTOS.includes(m.presupuesto)) return enviar(j, { tipo: 'error', mensaje: 'Presupuesto no válido.' });
      sala.presupuesto = m.presupuesto; sala.listos.clear();      // con otras condiciones, hay que volver a marcar «Listo»
      avisarSala(sala);
      for (const otro of sala.jugadores) enviar(otro, { tipo: 'chat', de: null, texto: 'Presupuesto: ' + m.presupuesto.toLocaleString('es-ES') + ' de oro por jugador', hora: Date.now() });
    },
    ejercito(j, m) {
      const sala = j.sala; if (!sala || sala.fase !== 'preparacion') return enviar(j, { tipo: 'error', mensaje: 'Ahora no se puede confirmar un ejército.' });
      const ejercito = Array.isArray(m.ejercito) ? m.ejercito.map(e => ({ tipo: String(e && e.tipo), nivel: Number(e && e.nivel) })) : null;
      const validacion = motor.validarEjercito(String(m.rama), ejercito, sala.presupuesto);
      if (!validacion.ok) return enviar(j, { tipo: 'error', mensaje: 'Ejército no válido: ' + validacion.motivo });
      let blason = null;
      try { if (m.blason && JSON.stringify(m.blason).length <= MAX_TAMANO_BLASON) blason = m.blason; } catch (e) { blason = null; }
      sala.ejercitos.set(j.id, { rama: String(m.rama), ejercito, blason, coste: validacion.coste });
      enviar(j, { tipo: 'ejercitoAceptado', coste: validacion.coste });
      avisarSala(sala);
      if (sala.jugadores.length === MAX_JUGADORES_SALA && sala.jugadores.every(jug => sala.ejercitos.has(jug.id))) {
        sala.fase = 'lista';
        const ficha = { tipo: 'batallaLista', semilla: sala.semilla, clima: sala.clima, mapa: sala.mapa, presupuesto: sala.presupuesto, jugadores: sala.jugadores.map((jug, equipo) => Object.assign({ nombre: jug.nombre, equipo }, sala.ejercitos.get(jug.id))) };
        ficha.tiempoDespliegue = TIEMPO_DESPLIEGUE;
        log('batalla lista', sala.codigo, ficha.jugadores.map(x => x.nombre + ' (' + x.rama + ', ' + x.ejercito.length + ' unidades)').join(' contra '));
        empezarBatallaSala(sala, ficha);
        avisarSala(sala);
      }
    },
    orden(j, m) {
      const b = batallaDe(j); if (!b || !m.orden || typeof m.orden !== 'object') return;
      const equipo = b.equipos.get(j.id);
      if (b.pendientes.filter(p => p.e === equipo).length >= MAX_ORDENES_POR_TURNO) return;
      // solo los campos que entiende aplicarOrden (sin objetos raros que repartir al otro jugador)
      const o = m.orden, limpia = { a: String(o.a), u: Array.isArray(o.u) ? o.u.slice(0, 40) : [] };
      if (Array.isArray(o.d)) limpia.d = o.d.slice(0, 40).map(d => Array.isArray(d) ? d.slice(0, 3) : null);
      for (const campo of ['m', 'orden', 'clave', 'objetivo', 'rumbo', 'activa']) if (o[campo] !== undefined) limpia[campo] = o[campo];
      if (Number.isInteger(o.k)) limpia.k = o.k;     // número de la orden en el navegador que la manda (ver ordenesEnCamino)
      b.pendientes.push({ e: equipo, o: limpia });
    },
    listoDespliegue(j) {
      const b = batallaDe(j); if (!b || !b.desplegando) return;
      b.listos.add(b.equipos.get(j.id));
      repartir(j.sala, { tipo: 'despliegue', listos: [...b.listos], quedanDespliegue: quedanDespliegue(b) });
    },
    resumen(j, m) {
      const b = batallaDe(j); if (!b) return;
      if (!b.arbitro) {
        if (!Number.isInteger(m.n) || typeof m.h !== 'string') return;
        const equipo = b.equipos.get(j.id), par = b.resumenesJugadores.get(m.n) || [null, null];
        par[equipo] = m.h; b.resumenesJugadores.set(m.n, par); b.resumenesJugadores.delete(m.n - TURNOS_ENTRE_RESUMENES * 30);
        if (par[0] !== null && par[1] !== null && par[0] !== par[1]) {
          // no se sabe quién tiene razón: manda el equipo 0 y se corrige al otro
          const desviado = jugadorDeEquipo(j.sala, 1); if (!desviado) return;
          b.desincronias++; enviar(desviado, { tipo: 'desincronia', n: m.n }); log('desincronía', j.sala.codigo, desviado.nombre, 'turno', m.n, '(relevo)');
          if (Date.now() - (b.reenviado.get(desviado.id) || 0) > MS_ENTRE_REENVIOS) { b.pedirEstado.add(desviado.id); b.reenviado.set(desviado.id, Date.now()); }
        }
        return;
      }
      const propio = b.resumenes.get(m.n);
      if (propio !== undefined && propio !== m.h) {
        b.desincronias++; enviar(j, { tipo: 'desincronia', n: m.n }); log('desincronía', j.sala.codigo, j.nombre, 'turno', m.n);
        if (Date.now() - (b.reenviado.get(j.id) || 0) > MS_ENTRE_REENVIOS) b.pedirEstado.add(j.id);   // se le manda el estado tras el próximo turno
      }
    },
    rendirse(j) { const b = batallaDe(j); if (b) terminarBatalla(j.sala, 1 - b.equipos.get(j.id), 'rendicion'); },
    // relevo: el estado que se pidió a este navegador, al acabar su turno n; se reenvía con los turnos repartidos después
    estadoCompleto(j, m) {
      const b = batallaDe(j), s = b && b.solicitudEstado; if (!s || s.fuente !== j) return;
      if (!Number.isInteger(m.n) || m.n > b.turno || typeof m.estado !== 'string') return;
      const siguientes = b.historial.filter(t => t.n > m.n);
      if (m.n < b.turno && (!siguientes.length || siguientes[0].n !== m.n + 1)) { log('estado demasiado antiguo para reenviarlo', j.sala.codigo, 'turno', m.n); b.solicitudEstado = null; return; }
      b.solicitudEstado = null;
      for (const { jugador, reconexion } of s.destinos) {
        if (reconexion) {
          const r = b.reincorporando; if (!r || r.jugador !== jugador) continue;
          b.reincorporando = null;
          enviar(jugador, Object.assign(mensajeReanudacion(j.sala, r.equipo, r.clave), { n: m.n, estado: m.estado, siguientes }));
          avisarVuelta(j.sala, jugador);
          log('estado del rival entregado a', jugador.nombre, 'turno', m.n, '+', siguientes.length, 'turnos', Math.round(m.estado.length / 1024) + ' KB');
        } else {
          enviar(jugador, { tipo: 'estado', n: m.n, estado: m.estado, siguientes });
          log('estado reenviado', j.sala.codigo, jugador.nombre, 'turno', m.n, '+', siguientes.length, 'turnos', Math.round(m.estado.length / 1024) + ' KB');
        }
      }
    },
    // relevo: un navegador ha visto la derrota de un bando (y sus 3 s de remate); vale el primero que llega
    resultado(j, m) {
      const b = batallaDe(j); if (!b || b.arbitro || b.desplegando) return;
      if (!Number.isInteger(m.n) || m.n > b.turno || (m.ganador !== 0 && m.ganador !== 1)) return;
      log('resultado anunciado por', j.nombre, 'en el turno', m.n);
      terminarBatalla(j.sala, m.ganador, 'derrota');
    },
    pedirPausa(j) {
      const b = batallaDe(j); if (!b || b.pausa) return;
      const equipo = b.equipos.get(j.id), rechazar = motivo => enviar(j, { tipo: 'pausaRechazada', motivo });
      if (b.desplegando) return rechazar('En el despliegue no hace falta pausa: la batalla aún no ha empezado.');
      if (b.solicitudPausa) return rechazar('Ya hay una pausa pedida.');
      if (b.pausasUsadas[equipo] >= MAX_PAUSAS) return rechazar('Ya has usado tus ' + MAX_PAUSAS + ' pausas.');
      b.solicitudPausa = { equipo, desde: Date.now() };
      enviar(j, { tipo: 'pausaSolicitada', espera: ESPERA_RESPUESTA_PAUSA });
      for (const otro of j.sala.jugadores) if (otro !== j) enviar(otro, { tipo: 'pausaPedida', nombre: j.nombre, espera: ESPERA_RESPUESTA_PAUSA });
    },
    responderPausa(j, m) {
      const b = batallaDe(j); if (!b || !b.solicitudPausa || b.solicitudPausa.equipo === b.equipos.get(j.id)) return;
      const solicitud = b.solicitudPausa; b.solicitudPausa = null;
      if (m.acepta) return empezarPausa(j.sala, solicitud.equipo);
      const pidio = jugadorDeEquipo(j.sala, solicitud.equipo);
      if (pidio) enviar(pidio, { tipo: 'pausaRechazada', motivo: j.nombre + ' prefiere seguir.' });
    },
    reanudarPausa(j) { const b = batallaDe(j); if (b && b.pausa) terminarPausa(j.sala, j.nombre); },
    retirarEjercito(j) { const sala = j.sala; if (!sala || sala.fase !== 'preparacion') return; sala.ejercitos.delete(j.id); avisarSala(sala); },
    chat(j, m) { const sala = j.sala; if (!sala) return; const texto = String(m.texto || '').trim().slice(0, 200); if (!texto) return; for (const otro of sala.jugadores) enviar(otro, { tipo: 'chat', de: j.nombre, texto, hora: Date.now() }); },
    buscarPartida(j) { if (j.sala) salirDeSala(j, 'busqueda'); if (!cola.includes(j)) { cola.push(j); j.buscando = true; } enviar(j, { tipo: 'buscando', enCola: cola.length }); emparejar(); },
    cancelarBusqueda(j) { sacarDeCola(j); enviar(j, { tipo: 'busquedaCancelada' }); },
  };

  wss.on('connection', ws => {
    const jugador = { ws, id: 'J' + (siguienteId++), nombre: 'Jugador', sala: null, buscando: false, vivo: true };
    jugadores.set(ws, jugador);
    ws.on('pong', () => { jugador.vivo = true; });
    ws.on('message', datos => {
      let m; try { m = JSON.parse(String(datos)); } catch (e) { return enviar(jugador, { tipo: 'error', mensaje: 'Mensaje ilegible.' }); }
      const accion = m && acciones[m.tipo];
      if (!accion) return enviar(jugador, { tipo: 'error', mensaje: 'Orden desconocida: ' + (m && m.tipo) });
      try { accion(jugador, m); } catch (e) { log('error en', m.tipo, e.message); enviar(jugador, { tipo: 'error', mensaje: 'Error del servidor.' }); }
    });
    ws.on('close', () => {
      sacarDeCola(jugador); jugadores.delete(ws);
      const b = batallaDe(jugador);
      if (b && !b.ausentes.has(b.equipos.get(jugador.id))) return marcarAusente(jugador);
      salirDeSala(jugador, 'desconexion'); log('desconectado', jugador.nombre);
    });
  });
  // latido: cada 20 s se cierra a quien no respondió al anterior (conexiones muertas que no avisaron)
  const latido = setInterval(() => { for (const [ws, j] of jugadores) { if (!j.vivo) { ws.terminate(); continue; } j.vivo = false; try { ws.ping(); } catch (e) {} } }, 20000);
  wss.on('close', () => clearInterval(latido));
  log('servidor de lobby escuchando en el puerto', o.puerto);
  if (o.registro) { log('el juego, en este equipo:  http://localhost:' + o.puerto + '/'); for (const ip of direccionesLocales()) log('el juego, en tu red:       http://' + ip + ':' + o.puerto + '/'); }
  estadoGlobal = () => ({ jugadores: jugadores.size, salas: salas.size, enCola: cola.length, modo: o.arbitro ? 'arbitro' : 'relevo' });
  return { wss, servidorHttp, cerrar: () => new Promise(r => { clearInterval(latido); for (const ws of jugadores.keys()) ws.terminate(); wss.close(() => servidorHttp.close(() => r())); }), estado: () => ({ jugadores: jugadores.size, salas: salas.size, enCola: cola.length, modo: o.arbitro ? 'arbitro' : 'relevo' }) };
}

if (require.main === module) crearServidorLobby({ puerto: Number(process.argv[2]) || Number(process.env.PORT) || 8787 });
module.exports = { crearServidorLobby, VERSION_PROTOCOLO };
