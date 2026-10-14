'use strict';
/* ---------- Motor del juego en el servidor (multijugador, 2026-10-13) ----------
   El servidor es el árbitro de las batallas en red (lockstep con árbitro): necesita el MISMO código de juego que los
   navegadores. Este módulo carga los scripts del juego (datos, terreno, simulación, ramas y reclutamiento) en un contexto
   aislado de Node (vm), igual que las pruebas, y expone lo que el servidor usa:
   · validarEjercito(rama, ejercito, presupuesto) → { ok, coste, motivo } (paso 2)
   · elegirClima(semilla) → clave de CLIMAS, con el mismo reparto que la batalla normal (paso 2)
   · crearBatallaRed(ficha) → la simulación de una batalla en red, que el servidor hace avanzar a la vez que los jugadores (paso 3)
   · contexto: el contexto completo (Simulacion, colocarEjercito…). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ_JUEGO = path.resolve(__dirname, '..');
const SCRIPTS = ['js/00-aleatorio-y-utilidades.js', 'js/01-datos-unidades.js', 'js/02-rejilla-espacial.js', 'js/02b-terreno.js', 'js/03-simulacion.js', 'js/04-ordenes.js', 'js/04b-estado.js', 'js/juego/07-ramas-y-niveles.js', 'js/juego/09-ejercito.js'];
const MAX_UNIDADES = 20;

function crearMotor() {
  const contexto = { console, performance: { now: () => Date.now() }, Math, window: {}, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(contexto);
  for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(RAIZ_JUEGO, f), 'utf8'), contexto, { filename: f });
  // colocarEjercito vive en 10-batalla.js, que además monta la interfaz: se carga solo esa función
  const fuenteBatalla = fs.readFileSync(path.join(RAIZ_JUEGO, 'js/juego/10-batalla.js'), 'utf8');
  vm.runInContext(fuenteBatalla.slice(fuenteBatalla.indexOf('function colocarEjercito'), fuenteBatalla.indexOf('function iniciarBatalla')), contexto, { filename: 'colocarEjercito' });
  const ejecutar = codigo => vm.runInContext(codigo, contexto);
  const RAMAS = ejecutar('RAMAS'), NIVELES = ejecutar('NIVELES');
  const tiposDisponibles = ejecutar('tiposDisponibles'), costeEjercito = ejecutar('costeEjercito');

  // Ejército de un jugador: rama existente, lista de { tipo, nivel } con tropas de esa rama, niveles válidos, sin pasarse del
  // presupuesto y con un tope de unidades
  function validarEjercito(rama, ejercito, presupuesto) {
    if (!RAMAS[rama]) return { ok: false, motivo: 'Rama desconocida.' };
    if (!Array.isArray(ejercito) || !ejercito.length) return { ok: false, motivo: 'El ejército está vacío.' };
    if (ejercito.length > MAX_UNIDADES) return { ok: false, motivo: 'Como mucho ' + MAX_UNIDADES + ' unidades.' };
    const disponibles = tiposDisponibles(rama);
    for (const e of ejercito) {
      if (!e || !disponibles.includes(e.tipo)) return { ok: false, motivo: 'Tropa no disponible para esa rama: ' + (e && e.tipo) };
      if (!Number.isInteger(e.nivel) || e.nivel < 0 || e.nivel >= NIVELES.length) return { ok: false, motivo: 'Nivel no válido.' };
    }
    const coste = costeEjercito(rama, ejercito);
    if (coste > presupuesto) return { ok: false, coste, motivo: 'Cuesta ' + coste + ' y el presupuesto es ' + presupuesto + '.' };
    return { ok: true, coste };
  }
  // Clima de la batalla desde la semilla: despejado 55 %, lluvia 20 %, barro 15 %, tormenta 10 % (como la batalla normal)
  function elegirClima(semilla) { return ejecutar('climaDesdeSemilla')(semilla); }
  // tipo de mapa desde la semilla (2026-10-13): el mismo reparto que la batalla individual
  function elegirMapa(semilla) { return ejecutar('mapaDesdeSemilla')(semilla); }
  /* Batalla en red (paso 3): la simulación del servidor, montada con la misma función que los navegadores
     (montarSimulacionRed). El servidor aplica cada orden aquí antes de repartirla: si no vale (unidad ajena, muerta, valores
     raros), no se reparte. */
  const montarSimulacionRed = ejecutar('montarSimulacionRed'), aplicarOrden = ejecutar('aplicarOrden'), resumenEstado = ejecutar('resumenEstado'), ganadorBatalla = ejecutar('ganadorBatalla'), serializarEstado = ejecutar('serializarEstado');
  function crearBatallaRed(ficha) {
    const { sim } = montarSimulacionRed(ficha);
    return {
      sim,
      aplicar: (equipo, orden, desplegando) => { try { return !!aplicarOrden(sim, equipo, orden, { desplegando }); } catch (e) { return false; } },
      avanzar: pasos => { for (let k = 0; k < pasos; k++) sim.avanzar(); sim.sangre.length = 0; },
      resumen: () => resumenEstado(sim),
      serializar: () => serializarEstado(sim),
      tiempo: () => sim.tiempo,
      algunoDerrotado: () => sim.equipoDerrotado(0) || sim.equipoDerrotado(1),
      ganador: () => ganadorBatalla(sim),
    };
  }
  return { contexto, ejecutar, validarEjercito, elegirClima, elegirMapa, crearBatallaRed, RAMAS, MAX_UNIDADES };
}

module.exports = { crearMotor, MAX_UNIDADES };
