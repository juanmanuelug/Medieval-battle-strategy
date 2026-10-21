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

/* (2026-10-20) Los scripts se cargan todos juntos dentro de UNA función, no cada uno como script del contexto: en un contexto
   vm, cada global (las constantes y funciones del juego, y también Math, Object…) se lee a través del objeto global del
   contexto, que es lento, y la simulación las lee en sus bucles a cada paso (medido: 12,5 ms por paso frente a 7,2 en un
   navegador, en una batalla grande). Dentro de la función son variables locales, como en un navegador; las de JavaScript se
   copian a locales al principio. El código del juego es el mismo y en el mismo orden: mismos resultados, bit a bit.
   ejecutar(codigo) evalúa dentro de esa función (eval directo), así que ve todo lo cargado. opciones.extras: más scripts del
   juego (rutas desde la raíz), para las pruebas (por ejemplo, la IA). */
const GLOBALES_JS = ['Math', 'Object', 'Array', 'Number', 'String', 'Boolean', 'JSON', 'Map', 'Set', 'WeakMap', 'Symbol', 'Error', 'TypeError', 'RangeError',
  'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'ArrayBuffer', 'DataView', 'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'console', 'performance', 'window', 'localStorage'];
function crearMotor(opciones) {
  const contexto = { console, performance: { now: () => Date.now() }, Math, window: {}, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(contexto);
  const leer = f => fs.readFileSync(path.isAbsolute(f) ? f : path.join(RAIZ_JUEGO, f), 'utf8');
  // colocarEjercito vive en 10-batalla.js, que además monta la interfaz: se carga solo esa parte
  const fuenteBatalla = leer('js/juego/10-batalla.js');
  const fuentes = [...SCRIPTS.map(f => [f, leer(f)]), ['colocarEjercito (10-batalla.js)', fuenteBatalla.slice(fuenteBatalla.indexOf('function colocarEjercito'), fuenteBatalla.indexOf('function iniciarBatalla'))], ...((opciones && opciones.extras) || []).map(f => [f, leer(f)])];
  const codigo = "(function () {\n'use strict';\nconst { " + GLOBALES_JS.join(', ') + " } = globalThis;\n" + fuentes.map(([nombre, fuente]) => '// ======== ' + nombre + '\n' + fuente).join('\n;\n') + "\nreturn codigo => eval(codigo);\n})()";
  const ejecutar = vm.runInContext(codigo, contexto, { filename: 'motor-juego.js' });
  const RAMAS = ejecutar('RAMAS'), NIVELES = ejecutar('NIVELES');
  const MAX_UNIDADES = ejecutar('MAX_UNIDADES_EJERCITO');
  const tiposDisponibles = ejecutar('tiposDisponibles'), costeEjercito = ejecutar('costeEjercito'), incumpleLimitesEjercito = ejecutar('incumpleLimitesEjercito');

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
    const limites = incumpleLimitesEjercito(ejercito); if (limites) return { ok: false, motivo: limites };   // nivel único y máximo por tropa (mangoneles)
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
  const finDeBatalla = ejecutar('finDeBatalla');
  const montarSimulacionRed = ejecutar('montarSimulacionRed'), aplicarOrden = ejecutar('aplicarOrden'), resumenEstado = ejecutar('resumenEstado'), ganadorBatalla = ejecutar('ganadorBatalla'), serializarEstado = ejecutar('serializarEstado'), restaurarEstado = ejecutar('restaurarEstado');
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
      finDeBatalla: finEn => finDeBatalla(sim, finEn),   // la misma regla de final que los navegadores (10-batalla.js)
      ganador: () => ganadorBatalla(sim),
      // (seguridad S1, 2026-10-19) carga el estado que ha mandado un navegador; false si no es un estado válido
      restaurar: estado => { try { restaurarEstado(sim, estado); sim.recontar(); return true; } catch (e) { return false; } },   // las estadísticas, recalculadas aquí (no se cree las del estado)
    };
  }
  return { contexto, ejecutar, validarEjercito, elegirClima, elegirMapa, crearBatallaRed, RAMAS, MAX_UNIDADES };
}

module.exports = { crearMotor };
