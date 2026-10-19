'use strict';
/* Prueba de la batalla en red (pasos 3 y 4): servidor + clientes WebSocket que, como los navegadores, montan su propia
   simulación con el motor del juego y aplican los turnos del servidor. Comprueba que las tres simulaciones siguen idénticas
   (resúmenes de estado), que el servidor descarta órdenes a unidades ajenas, el despliegue a ciegas, la batalla hasta el
   final, el reenvío del estado a quien se desvía, la reconexión (en combate y en el despliegue), el abandono por no volver
   a tiempo y la rendición. Uso: node prueba-batalla-red.js [--relevo] (unos 3 minutos)
   Sin opciones prueba el servidor árbitro (simula y manda su estado); con --relevo, el servidor de relevo (no simula: pide el
   estado a un cliente para pasárselo al otro, y el final lo anuncian los clientes). Los clientes de prueba hacen las dos cosas,
   como el navegador. */
const WebSocket = require('ws');
const { crearServidorLobby } = require('./servidor-lobby.js');
const { crearMotor } = require('./motor.js');
const PUERTO = 8898;
const RELEVO = process.argv.includes('--relevo');
const esperar = ms => new Promise(r => setTimeout(r, ms));
const motorComun = crearMotor();
const resumenDe = sim => motorComun.ejecutar('resumenEstado')(sim);

// Cliente que se comporta como el navegador: con la ficha monta la simulación y con cada turno aplica las órdenes y avanza
function cliente(nombre, claveReconexion) {
  const ws = new WebSocket('ws://127.0.0.1:' + PUERTO);
  const c = { ws, nombre, mensajes: [], ultimo: {}, turnos: 0, atrasado: false, estadosGuardados: [], desincronias: [], estadosRecibidos: 0, fin: null, motor: motorComun, sim: null, desplegando: true };
  const x = c.motor.ejecutar;
  c.enviar = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  ws.on('message', d => {
    const m = JSON.parse(String(d)); c.mensajes.push(m); c.ultimo[m.tipo] = m;
    if (m.tipo === 'batallaLista') { c.clave = m.claveReconexion; c.equipo = m.jugadores.find(j => j.nombre === nombre).equipo; c.sim = x('montarSimulacionRed')(m).sim; c.desplegando = true; c.fin = null; c.finSimulado = null; c.resultadoEnviado = false; c.ultimoTurno = 0; }
    if (m.tipo === 'reanudarBatalla') {
      c.clave = m.ficha.claveReconexion; c.equipo = m.equipo; c.sim = x('montarSimulacionRed')(m.ficha).sim; c.desplegando = m.desplegando; c.fin = null;
      c.finSimulado = null; c.resultadoEnviado = false; c.ultimoTurno = m.n;
      if (m.estado) x('restaurarEstado')(c.sim, m.estado);
      for (const t of m.siguientes || []) aplicarTurno(t, false);
      for (const o of m.ordenesPropias || []) x('aplicarOrden')(c.sim, c.equipo, o, { desplegando: true });
    }
    if (m.tipo === 'desincronia') c.desincronias.push(m.n);
    if (m.tipo === 'estado') { x('restaurarEstado')(c.sim, m.estado); c.estadosRecibidos++; c.ultimoTurno = m.n; for (const t of m.siguientes || []) aplicarTurno(t, false); }
    if (m.tipo === 'turno') aplicarTurno(m, true);
    // servidor de relevo: pide el estado al acabar el turno n (este cliente aplica cada turno al recibirlo: ya está en él)
    // con c.atrasado, responde con un estado de varios turnos antes (como un navegador que va por detrás del servidor)
    if (m.tipo === 'pedirEstado' && !c.desplegando) {
      const viejo = c.atrasado && c.estadosGuardados.length ? c.estadosGuardados[0] : null;
      c.enviar(viejo ? { tipo: 'estadoCompleto', n: viejo.n, estado: viejo.estado } : { tipo: 'estadoCompleto', n: c.ultimoTurno, estado: x('serializarEstado')(c.sim) });
    }
  });
  function aplicarTurno(m, nuevo) {
    for (const { e, o } of m.ordenes) x('aplicarOrden')(c.sim, e, o, { desplegando: c.desplegando });
    if (m.comienza) c.desplegando = false;
    if (m.fin) c.fin = m.fin;
    for (let k = 0; k < m.pasos; k++) c.sim.avanzar();
    c.ultimoTurno = m.n;
    if (c.atrasado && m.pasos) { c.estadosGuardados.push({ n: m.n, estado: x('serializarEstado')(c.sim) }); if (c.estadosGuardados.length > 6) c.estadosGuardados.shift(); }
    if (!nuevo) return;
    c.turnos++;
    if (m.pasos && m.n % x('TURNOS_ENTRE_RESUMENES') === 0) c.enviar({ tipo: 'resumen', n: m.n, h: x('resumenEstado')(c.sim) });
    // final de la batalla, con el mismo criterio que el navegador (derrota de un bando + 3 s de remate)
    if (m.pasos && !c.resultadoEnviado) {
      if (c.finSimulado === null && c.sim.tiempo > 5 && (c.sim.equipoDerrotado(0) || c.sim.equipoDerrotado(1))) c.finSimulado = c.sim.tiempo + 3;
      if (c.finSimulado !== null && c.sim.tiempo >= c.finSimulado) { c.enviar({ tipo: 'resultado', n: m.n, ganador: x('ganadorBatalla')(c.sim) }); c.resultadoEnviado = true; }
    }
  }
  c.listo = new Promise(r => ws.on('open', () => { c.enviar(claveReconexion ? { tipo: 'hola', nombre, claveReconexion } : { tipo: 'hola', nombre }); r(); }));
  c.espera = async (tipo, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { if (c.ultimo[tipo]) return c.ultimo[tipo]; await esperar(10); } throw new Error(nombre + ' no recibió ' + tipo); };
  c.limpiar = tipo => { delete c.ultimo[tipo]; };
  c.propias = () => c.sim.unidades.filter(u => u.equipo === c.equipo);
  return c;
}
const EJERCITO_A = [{ tipo: 'infanteriaPesada', nivel: 1 }, { tipo: 'lanceros', nivel: 1 }, { tipo: 'arqueros', nivel: 1 }, { tipo: 'caballeriaPesada', nivel: 1 }];
// sin exclusivas: desde que son siempre veteranas (2026-10-15) algunas batallas se alargan más de 7 min, y esta prueba es del protocolo
const EJERCITO_B = [{ tipo: 'infanteriaLigera', nivel: 1 }, { tipo: 'lanceros', nivel: 1 }, { tipo: 'ballesteros', nivel: 1 }, { tipo: 'caballeriaLigera', nivel: 1 }];

async function prepararBatalla(ana, beto) {
  ana.limpiar('enSala'); ana.enviar({ tipo: 'crearSala', nombre: 'Prueba', privada: true });
  const sala = (await ana.espera('enSala')).sala;
  beto.limpiar('enSala'); beto.enviar({ tipo: 'unirse', codigo: sala.codigo }); await beto.espera('enSala'); await esperar(50);
  for (const c of [ana, beto]) for (const tipo of ['batallaLista', 'salaLista', 'ejercitoAceptado']) c.limpiar(tipo);
  ana.enviar({ tipo: 'listo', listo: true }); beto.enviar({ tipo: 'listo', listo: true });
  await ana.espera('salaLista');
  ana.enviar({ tipo: 'ejercito', rama: 'cristiano', ejercito: EJERCITO_A, blason: null });
  beto.enviar({ tipo: 'ejercito', rama: 'musulman', ejercito: EJERCITO_B, blason: null });
  try { await ana.espera('batallaLista', 6000); await beto.espera('batallaLista', 6000); }
  catch (e) { console.log('   sin ficha: Ana ' + JSON.stringify({ sala: ana.ultimo.enSala && ana.ultimo.enSala.sala, error: ana.ultimo.error, aceptado: !!ana.ultimo.ejercitoAceptado, salaLista: !!ana.ultimo.salaLista }) + ' · Beto ' + JSON.stringify({ error: beto.ultimo.error, aceptado: !!beto.ultimo.ejercitoAceptado, salaLista: !!beto.ultimo.salaLista })); throw e; }
}
const atacarTodos = c => c.enviar({ tipo: 'orden', orden: { a: 'orden', u: c.propias().map(u => u.id), orden: 'avanzar', m: 'correr' } });
const alaPar = async (a, b) => { for (let k = 0; k < 40 && a.sim.paso !== b.sim.paso; k++) await esperar(5); return a.sim.paso === b.sim.paso; };

(async () => {
  const servidor = crearServidorLobby({ puerto: PUERTO, registro: false, esperaReconexion: 3, arbitro: !RELEVO });
  console.log('servidor ' + (RELEVO ? 'de relevo (no simula)' : 'árbitro (simula)'));
  const fallos = [], comprobar = (condicion, texto) => { console.log((condicion ? 'bien  ' : 'FALLO ') + texto); if (!condicion) fallos.push(texto); };
  try {
    let ana = cliente('Ana'), beto = cliente('Beto');
    await Promise.all([ana.listo, beto.listo]);
    await prepararBatalla(ana, beto);
    comprobar(ana.equipo === 0 && beto.equipo === 1, 'Ana (anfitriona) juega en el equipo 0 y Beto en el 1');
    comprobar(!!ana.clave && !!beto.clave && ana.clave !== beto.clave, 'cada uno recibe su propia clave de reconexión');
    comprobar(resumenDe(ana.sim) === resumenDe(beto.sim), 'los dos montan la misma simulación');
    // despliegue a ciegas
    const unidadAna = ana.propias()[0], unidadBeto = beto.propias()[0], muroBeto = beto.propias()[1].id;
    ana.enviar({ tipo: 'orden', orden: { a: 'recolocar', u: [unidadAna.id], d: [[60, 100, 0]] } });
    ana.enviar({ tipo: 'orden', orden: { a: 'recolocar', u: [unidadBeto.id], d: [[60, 200, 0]] } });
    ana.enviar({ tipo: 'orden', orden: { a: 'mover', u: [unidadAna.id], d: [[300, 100, null]] } });   // mover no vale desplegando
    beto.enviar({ tipo: 'orden', orden: { a: 'formar', u: [muroBeto], clave: 'muro' } });
    beto.enviar({ tipo: 'orden', orden: { a: 'recolocar', u: [unidadBeto.id], d: [[330, 60, Math.PI]] } });
    await esperar(400);
    comprobar(Math.round(ana.sim.unidades[unidadAna.id].origenX) === 60, 'Ana ve su propia recolocación');
    comprobar(Math.round(beto.sim.unidades[unidadAna.id].origenX) !== 60 && ana.sim.unidades[muroBeto].formacion.clave !== 'muro', 'despliegue a ciegas: ninguno recibe lo que despliega el otro');
    comprobar(Math.round(ana.sim.unidades[unidadBeto.id].origenX) !== 60, 'el servidor descarta la orden de Ana a una unidad de Beto');
    comprobar(ana.sim.paso === 0, 'durante el despliegue la simulación no avanza');
    ana.limpiar('pausaRechazada'); ana.enviar({ tipo: 'pedirPausa' });
    comprobar(/despliegue/.test((await ana.espera('pausaRechazada')).motivo), 'en el despliegue no se puede pedir pausa');
    ana.enviar({ tipo: 'listoDespliegue' }); const avisoDespliegue = await ana.espera('despliegue');
    comprobar(avisoDespliegue.quedanDespliegue > 100000 && avisoDespliegue.quedanDespliegue <= 120000, 'el aviso de despliegue trae el tiempo que queda (' + Math.round(avisoDespliegue.quedanDespliegue / 1000) + ' s)');
    beto.enviar({ tipo: 'listoDespliegue' }); await esperar(400);
    comprobar(!ana.desplegando && !beto.desplegando && ana.sim.paso > 0, 'con los dos listos empieza la batalla');
    comprobar(Math.round(beto.sim.unidades[unidadAna.id].origenY) === 100 && ana.sim.unidades[muroBeto].formacion.clave === 'muro' && Math.round(ana.sim.unidades[unidadBeto.id].origenY) === 60, 'al empezar, cada uno recibe el despliegue del otro');
    await alaPar(ana, beto);
    comprobar(resumenDe(ana.sim) === resumenDe(beto.sim), 'y las dos simulaciones son idénticas');
    // combate
    atacarTodos(ana); atacarTodos(beto);
    ana.enviar({ tipo: 'orden', orden: { a: 'atacar', u: [ana.propias()[3].id], objetivo: beto.propias()[0].id, m: 'correr' } });
    ana.enviar({ tipo: 'orden', orden: { a: 'basura', u: 'x', d: { mal: 1 } } });
    ana.enviar({ tipo: 'orden', orden: { a: 'mover', u: [ana.propias()[2].id], d: [[NaN, 'a', null]] } });
    await esperar(3000);
    // pausa de común acuerdo: Ana la pide, Beto la rechaza; la vuelve a pedir y Beto la acepta
    ana.limpiar('pausaRechazada'); ana.enviar({ tipo: 'pedirPausa' });
    await ana.espera('pausaSolicitada'); await beto.espera('pausaPedida');
    beto.enviar({ tipo: 'responderPausa', acepta: false });
    comprobar(/prefiere seguir/.test((await ana.espera('pausaRechazada')).motivo), 'Beto rechaza la pausa y a Ana le llega el motivo');
    ana.limpiar('pausa'); beto.limpiar('pausa');
    ana.enviar({ tipo: 'pedirPausa' }); await beto.espera('pausaPedida'); ana.enviar({ tipo: 'responderPausa', acepta: true });   // Ana no puede aceptar su propia pausa
    await esperar(300);
    comprobar(!ana.ultimo.pausa, 'quien pide la pausa no puede aceptarla él mismo');
    beto.enviar({ tipo: 'responderPausa', acepta: true });
    const pausa = await ana.espera('pausa'); await beto.espera('pausa');
    comprobar(pausa.activa && pausa.por === 'Ana' && pausa.pausasQuedan[0] === 2, 'Beto la acepta: pausa para los dos (a Ana le quedan ' + pausa.pausasQuedan[0] + ')');
    await alaPar(ana, beto); const pasoPausa = ana.sim.paso;
    const unidadQuieta = ana.propias()[1];
    ana.enviar({ tipo: 'orden', orden: { a: 'formar', u: [unidadQuieta.id], clave: 'cuadro', k: 7 } });
    await esperar(1000);
    comprobar(ana.sim.paso === pasoPausa && beto.sim.paso === pasoPausa, 'en pausa la simulación no avanza (paso ' + pasoPausa + ')');
    const turnoPausa = ana.mensajes.filter(m => m.tipo === 'turno' && m.pasos === 0 && m.ordenes.length).pop();
    comprobar(beto.sim.unidades[unidadQuieta.id].formacion.clave === 'cuadro' && turnoPausa && turnoPausa.ordenes[0].o.k === 7, 'pero las órdenes se aplican en los dos (y la orden vuelve con su número)');
    ana.limpiar('pausa'); beto.enviar({ tipo: 'reanudarPausa' });
    const fin = await ana.espera('pausa');
    comprobar(!fin.activa && fin.por === 'Beto', 'Beto quita la pausa');
    await esperar(600); await alaPar(ana, beto);
    comprobar(ana.sim.paso > pasoPausa && resumenDe(ana.sim) === resumenDe(beto.sim), 'la batalla sigue, idéntica en los dos');
    // reenvío del estado: Beto se desvía (se le quitan 30 de vida a un soldado) y el servidor le manda el suyo
    beto.sim.vida[beto.propias()[0].indices[0]] -= 30;
    await esperar(2500);
    comprobar(beto.desincronias.length >= 1 && beto.estadosRecibidos >= 1 && !ana.desincronias.length, 'Beto se desvía, el servidor lo detecta y le manda su estado (' + beto.estadosRecibidos + ' reenvío)');
    const desincroniasAntes = beto.desincronias.length;
    await esperar(2500);
    await alaPar(ana, beto);
    comprobar(beto.desincronias.length === desincroniasAntes && resumenDe(ana.sim) === resumenDe(beto.sim), 'tras copiar el estado, Beto vuelve a ir idéntico a Ana');
    if (RELEVO) {
      // (desde la seguridad S2, 2026-10-19, la desincronía la arbitra el servidor reproduciendo desde su punto de control, así que el
      // estado ya no lo da Ana: da igual que vaya atrasada) el estado llega con los turnos repartidos desde el turno en disputa
      ana.atrasado = true; await esperar(5600);
      const estadosAntes = beto.estadosRecibidos;
      beto.sim.vida[beto.propias()[1].indices[0]] -= 25;
      await esperar(2500);
      const ultimoEstado = beto.mensajes.filter(m => m.tipo === 'estado').pop();
      comprobar(beto.estadosRecibidos > estadosAntes && ultimoEstado && ultimoEstado.siguientes.length >= 1, 'relevo: con el estado llegan también los turnos posteriores al de la disputa (' + (ultimoEstado ? ultimoEstado.siguientes.length : 0) + ')');
      ana.atrasado = false; ana.estadosGuardados = [];
      await esperar(2000); await alaPar(ana, beto);
      comprobar(resumenDe(ana.sim) === resumenDe(beto.sim), 'relevo: tras reaplicarlos, Beto vuelve a ir idéntico a Ana');
    }
    // reconexión en combate: Beto pierde la conexión; la batalla se congela; vuelve con su clave
    const claveBeto = beto.clave; ana.limpiar('rivalDesconectado'); ana.limpiar('rivalVuelto');
    beto.ws.terminate(); await ana.espera('rivalDesconectado');
    const pasoCongelado = ana.sim.paso; await esperar(1200);
    comprobar(ana.sim.paso === pasoCongelado, 'con Beto desconectado la batalla se congela (paso ' + pasoCongelado + ')');
    beto = cliente('Beto', claveBeto); await beto.listo;
    await beto.espera('reanudarBatalla'); await ana.espera('rivalVuelto');
    comprobar(resumenDe(beto.sim) === resumenDe(ana.sim) && beto.sim.paso === ana.sim.paso, 'Beto vuelve con su clave y recibe el estado exacto de la batalla');
    await esperar(1500); await alaPar(ana, beto);
    comprobar(ana.sim.paso > pasoCongelado && resumenDe(ana.sim) === resumenDe(beto.sim), 'la batalla sigue y los dos siguen idénticos');
    // hasta el final (los arqueros a caballo, veteranos desde 2026-10-15, escaramuceando alargan la batalla: se les quita)
    beto.enviar({ tipo: 'orden', orden: { a: 'escaramuza', u: beto.propias().map(u => u.id), activa: false } });
    atacarTodos(beto);
    const t0 = Date.now();
    while (!ana.fin && Date.now() - t0 < 420000) await esperar(100);   // hasta 7 min: con exclusivas veteranas la retirada controlada alarga algunas batallas (2026-10-15)
    await esperar(300);
    comprobar(!!ana.fin && !!beto.fin && ana.fin.ganador === beto.fin.ganador && ana.fin.motivo === 'derrota', 'la batalla termina para los dos con el mismo resultado: gana el equipo ' + (ana.fin && ana.fin.ganador) + ' a los ' + Math.round(ana.sim.tiempo) + ' s');
    comprobar(!ana.desincronias.length && !beto.desincronias.length, 'ninguna desincronía más en ' + ana.turnos + ' turnos');
    comprobar(resumenDe(ana.sim) === resumenDe(beto.sim) && ana.sim.paso === beto.sim.paso, 'Ana y Beto acaban con la simulación idéntica (paso ' + ana.sim.paso + ')');
    comprobar(motorComun.ejecutar('ganadorBatalla')(ana.sim) === ana.fin.ganador, 'el ganador del servidor es el mismo que calcula el cliente');
    await esperar(200);
    comprobar(ana.ultimo.enSala.sala.fase === 'espera', 'al acabar, la sala vuelve a la espera');
    // reconexión en el despliegue: vuelve con sus órdenes, sin ver el despliegue del rival
    await prepararBatalla(ana, beto);
    const idAna = ana.propias()[1].id, idBeto = beto.propias()[1].id;
    ana.enviar({ tipo: 'orden', orden: { a: 'recolocar', u: [idAna], d: [[80, 240, 0]] } });
    beto.enviar({ tipo: 'orden', orden: { a: 'recolocar', u: [idBeto], d: [[350, 250, Math.PI]] } });
    await esperar(300);
    const clave2 = beto.clave; beto.ws.terminate(); await esperar(300);
    beto = cliente('Beto', clave2); await beto.listo; await beto.espera('reanudarBatalla');
    comprobar(beto.desplegando && Math.round(beto.sim.unidades[idBeto].origenX) === 350 && Math.round(beto.sim.unidades[idAna].origenX) !== 80, 'reconectado en el despliegue: recupera su despliegue y sigue sin ver el de Ana');
    ana.enviar({ tipo: 'listoDespliegue' }); beto.enviar({ tipo: 'listoDespliegue' }); await esperar(500); await alaPar(ana, beto);
    comprobar(!beto.desplegando && resumenDe(ana.sim) === resumenDe(beto.sim), 'al empezar, los dos idénticos');
    // abandono: Beto se cae y no vuelve en los 3 s de espera de esta prueba
    ana.fin = null; beto.ws.terminate(); await esperar(4500);
    comprobar(ana.fin && ana.fin.ganador === 0 && ana.fin.motivo === 'abandono', 'si Beto no vuelve a tiempo, gana Ana por abandono');
    await esperar(200);
    comprobar(ana.ultimo.enSala.sala.jugadores.length === 1, 'Beto sale de la sala');
    // rendición
    beto = cliente('Beto'); await beto.listo; await esperar(100);
    await prepararBatalla(ana, beto);
    ana.enviar({ tipo: 'listoDespliegue' }); beto.enviar({ tipo: 'listoDespliegue' }); await esperar(500);
    ana.fin = beto.fin = null; ana.enviar({ tipo: 'rendirse' }); await esperar(300);
    comprobar(ana.fin && beto.fin && ana.fin.ganador === 1 && beto.fin.motivo === 'rendicion', 'si Ana se rinde, gana Beto');
    // una clave vieja no sirve
    const tarde = cliente('Intruso', clave2); await tarde.listo; await esperar(300);
    comprobar(!tarde.ultimo.reanudarBatalla, 'una clave de reconexión sin batalla esperando no lleva a ninguna parte');
    comprobar(servidor.estado().jugadores === 3, 'el servidor sigue en pie (' + servidor.estado().jugadores + ' conectados)');
    for (const c of [ana, beto, tarde]) c.ws.close();
    await esperar(200);
  } catch (e) { fallos.push(e.message); console.log('FALLO ' + e.stack); }
  await servidor.cerrar();
  console.log(fallos.length ? fallos.length + ' fallos' : 'correcto');
  process.exit(fallos.length ? 1 : 0);
})();
