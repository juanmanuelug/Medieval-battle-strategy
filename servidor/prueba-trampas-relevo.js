'use strict';
/* Seguridad S1 del modo relevo (2026-10-19): el resultado de la batalla ya no lo decide el primer navegador que lo anuncia.
   Servidor de relevo y dos clientes WebSocket que, como el navegador, montan su simulación y aplican los turnos; uno de ellos hace
   trampas. Casos:
   1. el equipo 1 anuncia una victoria falsa en plena batalla: la batalla sigue; a la segunda, pierde por trampa;
   2. lo mismo con el tramposo en el equipo 0 (antes el servidor siempre creía al equipo 0);
   3. el perdedor no confirma su derrota: tras la espera, el servidor la verifica y da la victoria a quien ha ganado;
   4. el tramposo, cuando le piden el estado para verificar, manda uno trucado: no vale (su resumen no es el de los dos) y se pide
      al otro;
   S2 (desincronías arbitradas por el servidor):
   5 y 6. el tramposo (equipo 0 y luego equipo 1) altera su propia simulación: el servidor reproduce desde su punto de control,
      corrige al tramposo y no toca al honrado (antes se copiaba el estado del equipo 0 al otro);
   7. desincronía en los primeros segundos (antes del primer punto de control pedido): se arbitra desde el inicial;
   8. el tramposo se altera la simulación una y otra vez: a la tercera corrección, pierde por desvío;
   S3 (límites y reconexión):
   9. Beto se desconecta en plena batalla y vuelve; Ana mandaría un estado trucado si se lo pidieran: el servidor no se lo pide,
      reproduce él el estado y Beto queda idéntico a la batalla real;
   10. un cliente manda miles de mensajes seguidos: se descartan, la batalla del otro sigue a su ritmo y al abusador se le corta;
   11. un mensaje de 5 MB: se corta esa conexión y el servidor sigue en pie.
   Uso: node prueba-trampas-relevo.js (unos 3 minutos) */
const WebSocket = require('ws');
const { crearServidorLobby } = require('./servidor-lobby.js');
const { crearMotor } = require('./motor.js');
const PUERTO = 8899;
const esperar = ms => new Promise(r => setTimeout(r, ms));
const motorComun = crearMotor(), x = motorComun.ejecutar;

// cliente como el navegador; opciones de trampa: noAnunciar (no confirma su derrota), estadoTrucado (al verificar manda otro estado)
function cliente(nombre, trampa, claveReconexion) {
  const ws = new WebSocket('ws://127.0.0.1:' + PUERTO);
  const c = { ws, nombre, ultimo: {}, fin: null, sim: null, desplegando: true, trampa: trampa || {}, verificarEn: [], verificaciones: 0, estadosRecibidos: 0 };
  c.enviar = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  ws.on('message', d => {
    const m = JSON.parse(String(d)); c.ultimo[m.tipo] = m;
    if (m.tipo === 'reanudarBatalla') { c.equipo = m.equipo; c.sim = x('montarSimulacionRed')(m.ficha).sim; c.desplegando = m.desplegando; c.fin = null; c.finSimulado = null; c.resultadoEnviado = false; c.ultimoTurno = m.n; if (m.estado) x('restaurarEstado')(c.sim, m.estado); for (const tt of m.siguientes || []) aplicarTurno(tt, false); }
    if (m.tipo === 'batallaLista') { c.clave = m.claveReconexion; c.equipo = m.jugadores.find(j => j.nombre === nombre).equipo; c.sim = x('montarSimulacionRed')(m).sim; c.desplegando = true; c.fin = null; c.finSimulado = null; c.resultadoEnviado = false; }
    if (m.tipo === 'estado') { c.estadosRecibidos++; x('restaurarEstado')(c.sim, m.estado); for (const t of m.siguientes || []) aplicarTurno(t, false); }
    if (m.tipo === 'turno') aplicarTurno(m, true);
    if (m.tipo === 'pedirEstado' && !c.desplegando) {
      c.pedidosEstado = (c.pedidosEstado || 0) + 1;
      let estado = x('serializarEstado')(c.sim);
      if (c.trampa.estadoTrucado) { const datos = JSON.parse(estado); for (const u of datos.unidades) if (u.equipo !== c.equipo) u.vivos = 0; estado = JSON.stringify(datos); }
      c.enviar({ tipo: 'estadoCompleto', n: c.ultimoTurno, estado });
    }
    if (m.tipo === 'pedirVerificacion') { c.verificarEn.push(m.n); c.verificaciones++; }
  });
  function aplicarTurno(m, nuevo) {
    for (const { e, o } of m.ordenes) x('aplicarOrden')(c.sim, e, o, { desplegando: c.desplegando });
    if (m.comienza) c.desplegando = false;
    if (m.fin) c.fin = m.fin;
    for (let k = 0; k < m.pasos; k++) c.sim.avanzar();
    c.ultimoTurno = m.n;
    if (!nuevo) return;
    if (m.pasos && m.n % x('TURNOS_ENTRE_RESUMENES') === 0) c.enviar({ tipo: 'resumen', n: m.n, h: x('resumenEstado')(c.sim) });
    if (c.verificarEn.length && m.pasos && m.n % x('TURNOS_ENTRE_RESUMENES') === 0 && m.n >= Math.min(...c.verificarEn)) {
      let estado = x('serializarEstado')(c.sim);
      if (c.trampa.estadoTrucado) { const datos = JSON.parse(estado); for (const u of datos.unidades) if (u.equipo !== c.equipo) u.vivos = 0; estado = JSON.stringify(datos); }
      c.enviar({ tipo: 'estadoVerificacion', n: m.n, estado }); c.verificarEn = c.verificarEn.filter(n => n > m.n);
    }
    if (m.pasos && !c.resultadoEnviado && !c.trampa.noAnunciar) {
      if (c.finSimulado === null && c.sim.tiempo > 5 && (c.sim.equipoDerrotado(0) || c.sim.equipoDerrotado(1))) c.finSimulado = c.sim.tiempo + 3;
      if (c.finSimulado !== null && c.sim.tiempo >= c.finSimulado) { c.enviar({ tipo: 'resultado', n: m.n, ganador: x('ganadorBatalla')(c.sim) }); c.resultadoEnviado = true; }
    }
  }
  c.listo = new Promise(r => ws.on('open', () => { c.enviar(claveReconexion ? { tipo: 'hola', nombre, claveReconexion } : { tipo: 'hola', nombre }); r(); }));
  c.cerrado = false; ws.on('close', () => { c.cerrado = true; });
  ws.on('error', () => { c.cerrado = true; });      // p. ej. el servidor corta un mensaje demasiado grande
  c.espera = async (tipo, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { if (c.ultimo[tipo]) return c.ultimo[tipo]; await esperar(10); } throw new Error(nombre + ' no recibió ' + tipo); };
  c.limpiar = tipo => { delete c.ultimo[tipo]; };
  c.propias = () => c.sim.unidades.filter(u => u.equipo === c.equipo);
  c.cerrar = () => ws.close();
  return c;
}
// ejércitos pequeños: la batalla acaba en un minuto
const EJERCITO_A = [{ tipo: 'infanteriaPesada', nivel: 1 }, { tipo: 'infanteriaPesada', nivel: 1 }];
const EJERCITO_B = [{ tipo: 'infanteriaLigera', nivel: 1 }];
async function prepararBatalla(ana, beto, quietos) {
  ana.enviar({ tipo: 'crearSala', nombre: 'Trampas', privada: true });
  const sala = (await ana.espera('enSala')).sala;
  beto.enviar({ tipo: 'unirse', codigo: sala.codigo }); await beto.espera('enSala'); await esperar(50);
  ana.enviar({ tipo: 'listo', listo: true }); beto.enviar({ tipo: 'listo', listo: true });
  await ana.espera('salaLista');
  ana.enviar({ tipo: 'ejercito', rama: 'cristiano', ejercito: EJERCITO_A, blason: null });
  beto.enviar({ tipo: 'ejercito', rama: 'musulman', ejercito: EJERCITO_B, blason: null });
  await ana.espera('batallaLista', 8000); await beto.espera('batallaLista', 8000);
  await esperar(200);
  for (const c of [ana, beto]) c.enviar({ tipo: 'listoDespliegue' });
  for (let k = 0; k < 200 && (ana.desplegando || beto.desplegando); k++) await esperar(50);
  if (!quietos) for (const c of [ana, beto]) c.enviar({ tipo: 'orden', orden: { a: 'orden', u: c.propias().map(u => u.id), orden: 'avanzar', m: 'correr' } });
}
const esperarFin = async (clientes, segundos) => { for (let k = 0; k < segundos * 10 && clientes.some(c => !c.fin); k++) await esperar(100); };
const victoriaFalsa = c => c.enviar({ tipo: 'resultado', n: c.ultimoTurno, ganador: c.equipo });

(async () => {
  const servidor = crearServidorLobby({ puerto: PUERTO, registro: false, esperaReconexion: 3, arbitro: false });
  const fallos = [], comprobar = (condicion, texto) => { console.log((condicion ? 'bien  ' : 'FALLO ') + texto); if (!condicion) fallos.push(texto); };
  try {
    // 1 y 2: victoria falsa, del equipo 1 y del equipo 0
    for (const tramposoEsAna of [false, true]) {
      const ana = cliente('Ana'), beto = cliente('Beto'); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto);
      const tramposo = tramposoEsAna ? ana : beto, honrado = tramposoEsAna ? beto : ana;
      await esperar(3000);
      victoriaFalsa(tramposo);
      await esperar(14000);
      comprobar(!ana.fin && !beto.fin, `equipo ${tramposo.equipo} anuncia una victoria falsa: la batalla sigue (verificaciones pedidas ${ana.verificaciones + beto.verificaciones})`);
      victoriaFalsa(tramposo);
      await esperarFin([ana, beto], 25);
      comprobar(!!ana.fin && ana.fin.motivo === 'trampa' && ana.fin.ganador === honrado.equipo && beto.fin && beto.fin.ganador === honrado.equipo, `al segundo anuncio falso pierde el tramposo: ${JSON.stringify(ana.fin)}`);
      ana.cerrar(); beto.cerrar(); await esperar(300);
    }
    // 3: el perdedor no confirma su derrota
    {
      const ana = cliente('Ana'), beto = cliente('Beto', { noAnunciar: true }); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto);
      await esperarFin([ana, beto], 150);
      const ganadorReal = ana.sim && x('ganadorBatalla')(ana.sim);
      comprobar(!!ana.fin && ana.fin.motivo === 'derrota' && ana.fin.ganador === ganadorReal, `el perdedor no confirma: el servidor lo verifica y acaba igual (${JSON.stringify(ana.fin)}, ganador según la simulación ${ganadorReal})`);
      ana.cerrar(); beto.cerrar(); await esperar(300);
    }
    // 4: el tramposo manda un estado trucado al verificar (y no confirma su derrota)
    {
      const ana = cliente('Ana'), beto = cliente('Beto', { noAnunciar: true, estadoTrucado: true }); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto);
      await esperar(3000); victoriaFalsa(beto);                    // anuncio falso: el servidor le pide a él el estado (trucado)
      await esperar(16000);
      comprobar(!ana.fin && !beto.fin, `el estado trucado no cuela: la batalla sigue (estados pedidos a Beto ${beto.verificaciones}, a Ana ${ana.verificaciones})`);
      await esperarFin([ana, beto], 150);
      const ganadorReal = ana.sim && x('ganadorBatalla')(ana.sim);
      comprobar(!!ana.fin && ana.fin.ganador === ganadorReal, `y la batalla acaba con el ganador de verdad (${JSON.stringify(ana.fin)}, según la simulación ${ganadorReal})`);
      ana.cerrar(); beto.cerrar();
    }
    // 5, 6 y 7: un tramposo altera su propia simulación (mata a todos los soldados enemigos que puede en su copia)
    for (const [tramposoEsAna, segundos] of [[true, 25], [false, 25], [true, 4]]) {
      const ana = cliente('Ana', { noAnunciar: false }), beto = cliente('Beto'); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto);
      const tramposo = tramposoEsAna ? ana : beto, honrado = tramposoEsAna ? beto : ana;
      await esperar(segundos * 1000);
      for (const u of tramposo.sim.unidades) if (u.equipo !== tramposo.equipo) for (const i of u.indices) tramposo.sim.vida[i] = -1;
      const t0 = Date.now();
      for (let k = 0; k < 400 && !tramposo.estadosRecibidos; k++) await esperar(100);
      const espera = ((Date.now() - t0) / 1000).toFixed(1);
      await esperar(2500);
      const iguales = x('resumenEstado')(ana.sim) === x('resumenEstado')(beto.sim) || Math.abs(ana.sim.paso - beto.sim.paso) > 0;
      comprobar(tramposo.estadosRecibidos >= 1 && honrado.estadosRecibidos === 0 && !honrado.fin, `${segundos} s, el equipo ${tramposo.equipo} se altera la simulación: el servidor corrige al tramposo en ${espera} s (estados al tramposo ${tramposo.estadosRecibidos}, al honrado ${honrado.estadosRecibidos})`);
      for (let k = 0; k < 40 && ana.sim.paso !== beto.sim.paso; k++) await esperar(5);
      comprobar(ana.sim.paso !== beto.sim.paso || x('resumenEstado')(ana.sim) === x('resumenEstado')(beto.sim), 'y después los dos van idénticos (paso ' + ana.sim.paso + ')');
      ana.cerrar(); beto.cerrar(); await esperar(300);
    }
    // 8: el tramposo se altera la simulación una y otra vez: a la tercera corrección (con el rival de acuerdo con el servidor), pierde
    {
      const ana = cliente('Ana'), beto = cliente('Beto'); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto, true);                       // quietos: la batalla no acaba sola mientras tanto
      await esperar(4000);
      for (let vez = 0; vez < 3 && !ana.fin; vez++) {
        const antes = beto.estadosRecibidos;
        for (const u of beto.sim.unidades) if (u.equipo !== beto.equipo) for (const i of u.indices) beto.sim.vida[i] = -1;
        for (let k = 0; k < 450 && beto.estadosRecibidos === antes && !ana.fin; k++) await esperar(100);
      }
      await esperarFin([ana, beto], 10);
      comprobar(!!ana.fin && ana.fin.motivo === 'desvio' && ana.fin.ganador === ana.equipo, `desviado tres veces, el tramposo pierde: ${JSON.stringify(ana.fin)} (correcciones al tramposo ${beto.estadosRecibidos}, al honrado ${ana.estadosRecibidos})`);
      ana.cerrar(); beto.cerrar();
    }
    // 9: reconexión con un rival tramposo
    {
      const ana = cliente('Ana', { estadoTrucado: true }); let beto = cliente('Beto'); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto);
      await esperar(8000);
      const clave = beto.clave; beto.ws.terminate(); await esperar(1500);
      beto = cliente('Beto', null, clave); await beto.listo;
      for (let k = 0; k < 200 && !beto.ultimo.reanudarBatalla; k++) await esperar(50);
      await esperar(1500); for (let k = 0; k < 40 && ana.sim.paso !== beto.sim.paso; k++) await esperar(5);
      const iguales = ana.sim.paso === beto.sim.paso && x('resumenEstado')(ana.sim) === x('resumenEstado')(beto.sim);
      comprobar(!!beto.ultimo.reanudarBatalla && !ana.pedidosEstado && iguales, `Beto vuelve: el estado lo reproduce el servidor (a Ana no se le pide: ${ana.pedidosEstado || 0}) y Beto queda idéntico a Ana (paso ${beto.sim.paso})`);
      ana.cerrar(); beto.cerrar(); await esperar(300);
    }
    // 10: inundación de mensajes: una ráfaga por debajo del corte (se descarta lo que pasa del límite y la batalla sigue a su ritmo) y
    // otra muy grande (al abusador se le corta la conexión; la batalla se congela esperando su vuelta, como con cualquier desconexión)
    {
      const ana = cliente('Ana'), beto = cliente('Beto'); await Promise.all([ana.listo, beto.listo]);
      await prepararBatalla(ana, beto, true);
      await esperar(2000);
      const pasoAntes = ana.sim.paso, t0 = Date.now();
      for (let segundo = 0; segundo < 3; segundo++) { for (let k = 0; k < 80; k++) beto.ws.send(JSON.stringify({ tipo: 'resumen', n: 1, h: 'x' + k })); await esperar(1000); }
      const pasosPorSegundo = (ana.sim.paso - pasoAntes) / ((Date.now() - t0) / 1000);
      comprobar(!beto.cerrado && pasosPorSegundo > 25, `80 mensajes por segundo durante 3 s: se descartan los que pasan del límite, Beto sigue conectado (${!beto.cerrado}) y la batalla sigue a ${pasosPorSegundo.toFixed(0)} pasos/s`);
      ana.limpiar('rivalDesconectado');
      for (let k = 0; k < 3000 && beto.ws.readyState === 1; k++) beto.ws.send(JSON.stringify({ tipo: 'resumen', n: 1, h: 'y' + k }));
      await esperar(2000);
      comprobar(beto.cerrado && !!ana.ultimo.rivalDesconectado, `3.000 mensajes seguidos: al abusador se le corta la conexión (${beto.cerrado}) y Ana lo ve desconectado (${!!ana.ultimo.rivalDesconectado})`);
      ana.cerrar(); await esperar(300);
    }
    // 11: mensaje gigante
    {
      const abusador = cliente('Gigante'), otro = cliente('Normal'); await Promise.all([abusador.listo, otro.listo]);
      abusador.ws.send('x'.repeat(5 * 1024 * 1024));
      await esperar(1500);
      otro.limpiar('salas'); otro.enviar({ tipo: 'listarSalas' });
      let responde = true; try { await otro.espera('salas', 3000); } catch (e) { responde = false; }
      comprobar(abusador.cerrado && responde, `mensaje de 5 MB: conexión cortada (${abusador.cerrado}) y el servidor sigue respondiendo (${responde})`);
      otro.cerrar();
    }
  } catch (e) { comprobar(false, 'error: ' + e.message); }
  servidor.cerrar ? servidor.cerrar() : null;
  console.log(fallos.length ? fallos.length + ' fallos' : 'correcto');
  process.exit(fallos.length ? 1 : 0);
})();
