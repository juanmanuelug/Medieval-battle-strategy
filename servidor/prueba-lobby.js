'use strict';
// Prueba del servidor de lobby con clientes WebSocket simulados. Uso: node prueba-lobby.js
const WebSocket = require('ws');
const { crearServidorLobby } = require('./servidor-lobby.js');
const PUERTO = 8899;
const esperar = ms => new Promise(r => setTimeout(r, ms));

function cliente(nombre) {
  const ws = new WebSocket('ws://127.0.0.1:' + PUERTO);
  const c = { ws, nombre, mensajes: [], ultimo: {} };
  ws.on('message', d => { const m = JSON.parse(String(d)); c.mensajes.push(m); c.ultimo[m.tipo] = m; });
  c.enviar = m => ws.send(JSON.stringify(m));
  c.listo = new Promise(r => ws.on('open', () => { c.enviar({ tipo: 'hola', nombre }); r(); }));
  c.espera = async (tipo, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 2000)) { if (c.ultimo[tipo]) return c.ultimo[tipo]; await esperar(10); } throw new Error(nombre + ' no recibió ' + tipo); };
  c.limpiar = tipo => { delete c.ultimo[tipo]; };
  return c;
}

(async () => {
  const servidor = crearServidorLobby({ puerto: PUERTO, registro: false });
  const fallos = [], comprobar = (condicion, texto) => { console.log((condicion ? 'bien  ' : 'FALLO ') + texto); if (!condicion) fallos.push(texto); };
  try {
    const ana = cliente('Ana'), beto = cliente('Beto'), carla = cliente('Carla');
    await Promise.all([ana.listo, beto.listo, carla.listo]);
    await ana.espera('bienvenida'); await beto.espera('salas');
    // crear sala pública y verla desde el lobby
    beto.limpiar('salas'); ana.enviar({ tipo: 'crearSala', nombre: 'Sala de Ana', privada: false });
    const enSalaAna = await ana.espera('enSala');
    comprobar(enSalaAna.sala.jugadores.length === 1 && enSalaAna.sala.codigo.length === 6, 'Ana crea una sala con código de 6 letras');
    const salasBeto = await beto.espera('salas');
    comprobar(salasBeto.lista.some(s => s.nombre === 'Sala de Ana' && s.anfitrion === 'Ana'), 'Beto ve la sala de Ana en la lista');
    // Beto se une desde la lista; Carla no cabe
    beto.enviar({ tipo: 'unirse', salaId: enSalaAna.sala.id });
    await beto.espera('enSala'); await esperar(50);
    comprobar(ana.ultimo.enSala.sala.jugadores.map(j => j.nombre).join(',') === 'Ana,Beto', 'Beto entra y Ana lo ve');
    carla.enviar({ tipo: 'unirse', codigo: enSalaAna.sala.codigo });
    const errorCarla = await carla.espera('error');
    comprobar(/llena/.test(errorCarla.mensaje), 'Carla no puede entrar: la sala está llena');
    // una sala llena desaparece de la lista pública
    carla.enviar({ tipo: 'listarSalas' }); carla.limpiar('salas');
    comprobar(!(await carla.espera('salas')).lista.some(s => s.id === enSalaAna.sala.id), 'la sala llena no sale en la lista');
    // chat
    ana.enviar({ tipo: 'chat', texto: '¡Hola, Beto!' }); await esperar(80);
    comprobar(beto.mensajes.some(m => m.tipo === 'chat' && m.de === 'Ana' && m.texto === '¡Hola, Beto!'), 'el chat llega al otro jugador');
    // listos: con uno no pasa nada; con los dos llega salaLista con la misma semilla y lados distintos
    ana.enviar({ tipo: 'listo', listo: true }); await esperar(80);
    comprobar(!ana.ultimo.salaLista && ana.ultimo.enSala.sala.jugadores[0].listo === true, 'Ana marca listo; aún no empieza');
    beto.enviar({ tipo: 'listo', listo: true });
    const [la, lb] = await Promise.all([ana.espera('salaLista'), beto.espera('salaLista')]);
    comprobar(la.semilla === lb.semilla && la.equipo === 0 && lb.equipo === 1, 'con los dos listos: misma semilla, Ana equipo 0 y Beto equipo 1');
    // salir: el anfitrión pasa a Beto
    ana.enviar({ tipo: 'salir' }); await ana.espera('fueraDeSala'); await esperar(80);
    comprobar(beto.ultimo.enSala.sala.anfitrion === 'Beto' && beto.ultimo.enSala.sala.jugadores.length === 1, 'si sale Ana, Beto pasa a ser anfitrión');
    // sala privada: no sale en la lista, solo se entra con código
    carla.limpiar('enSala'); carla.enviar({ tipo: 'crearSala', nombre: 'Secreta', privada: true });
    const secreta = (await carla.espera('enSala')).sala;
    ana.limpiar('salas'); ana.enviar({ tipo: 'listarSalas' });
    comprobar(!(await ana.espera('salas')).lista.some(s => s.id === secreta.id), 'la sala privada no sale en la lista');
    ana.limpiar('error'); ana.enviar({ tipo: 'unirse', salaId: secreta.id });
    comprobar(/privada/.test((await ana.espera('error')).mensaje), 'a una privada no se entra desde la lista');
    ana.limpiar('enSala'); ana.enviar({ tipo: 'unirse', codigo: secreta.codigo.toLowerCase() });
    comprobar((await ana.espera('enSala')).sala.id === secreta.id, 'con el código (aunque sea en minúsculas) sí se entra');
    // código inexistente
    beto.limpiar('error'); beto.enviar({ tipo: 'unirse', codigo: 'ZZZZZZ' });
    comprobar(/No existe/.test((await beto.espera('error')).mensaje), 'un código que no existe da error');
    // matchmaking: dos jugadores nuevos buscan y quedan emparejados en una sala privada
    const dani = cliente('Dani'), eva = cliente('Eva'), fede = cliente('Fede');
    await Promise.all([dani.listo, eva.listo, fede.listo]);
    dani.enviar({ tipo: 'buscarPartida' });
    comprobar((await dani.espera('buscando')).enCola === 1, 'Dani busca partida y espera en la cola');
    eva.enviar({ tipo: 'buscarPartida' });
    const [ed, ee] = await Promise.all([dani.espera('emparejado'), eva.espera('emparejado')]);
    await esperar(80);
    comprobar(ed.salaId === ee.salaId && dani.ultimo.enSala.sala.jugadores.length === 2 && dani.ultimo.enSala.sala.privada, 'Dani y Eva quedan emparejados en la misma sala privada');
    // cancelar búsqueda
    fede.enviar({ tipo: 'buscarPartida' }); await fede.espera('buscando');
    fede.enviar({ tipo: 'cancelarBusqueda' }); await fede.espera('busquedaCancelada');
    const gema = cliente('Gema'); await gema.listo; gema.enviar({ tipo: 'buscarPartida' });
    await esperar(150);
    comprobar(!gema.ultimo.emparejado && !fede.ultimo.emparejado, 'quien cancela no se empareja con el siguiente');
    // desconexión: si Eva se va, Dani se queda solo en la sala; si se desconecta alguien de la cola, sale de ella
    eva.ws.close(); await esperar(150);
    comprobar(dani.ultimo.enSala.sala.jugadores.length === 1 && dani.mensajes.some(m => m.tipo === 'chat' && /ha salido/.test(m.texto)), 'si Eva se desconecta, Dani lo ve y queda solo');
    gema.ws.close(); await esperar(100);
    comprobar(servidor.estado().enCola === 0, 'la cola se vacía al desconectarse quien esperaba');
    // ---- paso 2: presupuesto, preparación y ejércitos ----
    const hugo = cliente('Hugo'), ines = cliente('Ines');
    await Promise.all([hugo.listo, ines.listo]);
    hugo.limpiar('enSala'); hugo.enviar({ tipo: 'crearSala', nombre: 'Paso 2', privada: true });
    const salaP2 = (await hugo.espera('enSala')).sala;
    comprobar(salaP2.fase === 'espera' && salaP2.presupuesto === 12000, 'sala nueva en espera con 12.000 de presupuesto');
    ines.enviar({ tipo: 'unirse', codigo: salaP2.codigo }); await ines.espera('enSala');
    ines.limpiar('error'); ines.enviar({ tipo: 'opcionesSala', presupuesto: 6000 });
    comprobar(/anfitrión/.test((await ines.espera('error')).mensaje), 'solo el anfitrión cambia el presupuesto');
    hugo.enviar({ tipo: 'opcionesSala', presupuesto: 6000 }); await esperar(100);
    comprobar(ines.ultimo.enSala.sala.presupuesto === 6000, 'el anfitrión fija 6.000 y el otro lo ve');
    hugo.enviar({ tipo: 'listo', listo: true }); ines.enviar({ tipo: 'listo', listo: true });
    const [lh, li] = await Promise.all([hugo.espera('salaLista'), ines.espera('salaLista')]);
    comprobar(lh.clima && lh.clima === li.clima && lh.presupuesto === 6000 && lh.semilla === li.semilla, 'con los dos listos: misma semilla, clima (' + lh.clima + ') y presupuesto');
    await esperar(50);
    comprobar(hugo.ultimo.enSala.sala.fase === 'preparacion', 'la sala pasa a preparación');
    hugo.limpiar('error'); hugo.enviar({ tipo: 'ejercito', rama: 'cristiano', ejercito: [{ tipo: 'arquerosACaballo', nivel: 1 }] });
    comprobar(/no disponible/.test((await hugo.espera('error')).mensaje), 'rechaza tropas que no son de su rama');
    hugo.limpiar('error'); hugo.enviar({ tipo: 'ejercito', rama: 'cristiano', ejercito: Array.from({ length: 6 }, () => ({ tipo: 'caballeriaPesada', nivel: 3 })) });
    comprobar(/presupuesto/.test((await hugo.espera('error')).mensaje), 'rechaza ejércitos que se pasan del presupuesto');
    hugo.enviar({ tipo: 'ejercito', rama: 'cristiano', ejercito: [{ tipo: 'infanteriaPesada', nivel: 1 }, { tipo: 'ballesteros', nivel: 1 }], blason: { shape: 'heater', layers: [] } });
    const aceptado = await hugo.espera('ejercitoAceptado'); await esperar(50);
    comprobar(aceptado.coste > 0 && ines.ultimo.enSala.sala.jugadores[0].ejercitoConfirmado === true && !JSON.stringify(ines.ultimo.enSala).includes('ballesteros'), 'acepta el ejército de Hugo; Ines ve que está confirmado pero no sus tropas');
    ines.enviar({ tipo: 'ejercito', rama: 'musulman', ejercito: [{ tipo: 'arquerosACaballo', nivel: 1 }, { tipo: 'infanteriaLigera', nivel: 2 }] });
    const [bh, bi] = await Promise.all([hugo.espera('batallaLista'), ines.espera('batallaLista')]);
    comprobar(bh.jugadores.length === 2 && bh.jugadores[0].nombre === 'Hugo' && bh.jugadores[0].equipo === 0 && bh.jugadores[1].rama === 'musulman' && bh.jugadores[0].blason && bh.semilla === bi.semilla, 'con los dos confirmados llega la ficha de la batalla a los dos');
    await esperar(50);
    comprobar(hugo.ultimo.enSala.sala.fase === 'batalla', 'la sala pasa a la batalla');
    ines.enviar({ tipo: 'salir' }); await esperar(100);
    comprobar(hugo.ultimo.enSala.sala.fase === 'espera' && !hugo.ultimo.enSala.sala.jugadores[0].ejercitoConfirmado, 'si uno se va, la sala vuelve a la espera sin ejércitos');
    hugo.ws.close(); ines.ws.close();
    for (const c of [ana, beto, carla, dani, fede]) c.ws.close();
    await esperar(150);
    comprobar(servidor.estado().salas === 0 && servidor.estado().jugadores === 0, 'al irse todos no quedan salas ni jugadores');
  } catch (e) { fallos.push(e.message); console.log('FALLO ' + e.message); }
  await servidor.cerrar();
  console.log(fallos.length ? fallos.length + ' fallos' : 'correcto');
  process.exit(fallos.length ? 1 : 0);
})();
