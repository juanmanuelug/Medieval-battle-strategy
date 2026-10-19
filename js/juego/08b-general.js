'use strict';
/* ---------- El general: rasgos que gana con lo que hace en batalla ----------
   Inspirado en los generales de Medieval 2 y Shogun 2. Cada rasgo tiene tres niveles que se alcanzan al superar umbrales de
   un contador del reino (cargas de la guardia, batallas dirigidas desde la retaguardia, victorias, generales enemigos
   abatidos, matanzas de tropa propia, derrotas seguidas). Los rasgos dan efectos a toda la batalla (moral propia o enemiga,
   radio del aura, daño de la guardia) y frases para el discurso previo. Se guardan en reino.general. */
const RASGOS_GENERAL = {
  valiente: { nombres: ['Audaz', 'Valiente', 'Temerario'], umbrales: [1, 3, 6], contador: 'cargas', descripcion: 'Su guardia carga en persona.',
    efectos: n => ({ auraRadio: 5 * n, guardiaDano: 0.1 * n, moralPropia: 2 * n }), frases: ['Hoy cabalgaré con vosotros.', 'Mi lanza irá la primera, como siempre.', 'Que el enemigo vea mi estandarte en su cara antes de morir.'] },
  prudente: { nombres: ['Sereno', 'Prudente', 'Imperturbable'], umbrales: [2, 4, 8], contador: 'reservas', descripcion: 'Dirige desde la retaguardia sin perder la calma.',
    efectos: n => ({ moralPropia: 3 * n }), frases: ['Mantened la línea y yo mantendré la cabeza fría.', 'No hay prisa: el que aguanta, gana.', 'He visto muchas batallas; esta se ganará con paciencia.'] },
  victorioso: { nombres: ['Vencedor', 'Victorioso', 'Invicto'], umbrales: [1, 3, 6], contador: 'victorias', descripcion: 'Acumula victorias.',
    efectos: n => ({ moralPropia: 3 * n }), frases: ['Ya hemos vencido antes.', 'Tres veces hemos vuelto con la victoria; que sea una más.', 'Nadie nos ha derrotado todavía.'] },
  temido: { nombres: ['Matador', 'Temido', 'Azote de reyes'], umbrales: [1, 2, 4], contador: 'generalesAbatidos', descripcion: 'Ha abatido a generales enemigos.',
    efectos: n => ({ moralEnemiga: -3 * n }), frases: ['Su general sabe lo que les hice a los anteriores.', 'Traedme a su general; ya sé qué hacer con él.', 'Reyes y generales han caído ante nosotros. Uno más.'] },
  carnicero: { nombres: ['Desconsiderado', 'Carnicero', 'Odiado'], umbrales: [1, 3, 5], contador: 'carnicerias', negativo: true, descripcion: 'Ha perdido a más de la mitad de sus hombres en una batalla.',
    efectos: n => ({ moralPropia: -4 * n }), frases: ['Sé lo que costó la última vez. Esta vez será distinto.', 'Los que faltan en las filas nos miran desde arriba.', 'Decid lo que queráis de mí, pero luchad.'] },
  derrotado: { nombres: ['Dudoso', 'Derrotado', 'Maldito'], umbrales: [2, 3, 5], contador: 'derrotasSeguidas', negativo: true, descripcion: 'Encadena derrotas.',
    efectos: n => ({ moralPropia: -3 * n }), frases: ['Hoy se acaba la mala racha.', 'Hemos perdido demasiadas veces; no habrá otra.', 'Dicen que estamos malditos. Demostrad que mienten.'] },
};
const CONTADORES_GENERAL = ['batallas', 'cargas', 'reservas', 'victorias', 'generalesAbatidos', 'carnicerias', 'derrotasSeguidas'];

function generalDelReino(reino) {
  if (!reino.general) reino.general = { contadores: {} };
  for (const c of CONTADORES_GENERAL) if (!(c in reino.general.contadores)) reino.general.contadores[c] = 0;
  return reino.general;
}
function nivelRasgo(reino, clave) {
  const r = RASGOS_GENERAL[clave], valor = generalDelReino(reino).contadores[r.contador] || 0;
  let nivel = 0; for (const u of r.umbrales) if (valor >= u) nivel++;
  return nivel;
}
// Rasgos activos: [{ clave, nivel, nombre, descripcion, negativo }]
function rasgosActivos(reino) {
  return Object.entries(RASGOS_GENERAL).map(([clave, r]) => ({ clave, nivel: nivelRasgo(reino, clave), nombre: r.nombres[Math.max(0, nivelRasgo(reino, clave) - 1)], descripcion: r.descripcion, negativo: !!r.negativo })).filter(x => x.nivel > 0);
}
// Efectos acumulados → multiplicadores y sumas listos para la batalla
function efectosGeneral(reino) {
  const suma = { moralPropia: 0, moralEnemiga: 0, auraRadio: 0, guardiaDano: 0 };
  for (const r of rasgosActivos(reino)) { const e = RASGOS_GENERAL[r.clave].efectos(r.nivel); for (const k in e) suma[k] += e[k]; }
  return { multMoralPropia: 1 + suma.moralPropia / 100, multMoralEnemiga: 1 + suma.moralEnemiga / 100, auraRadio: AURA_GENERAL.radio + suma.auraRadio, auraMoral: AURA_GENERAL.moral, multGuardiaDano: 1 + suma.guardiaDano, resumen: suma };
}
/* Registra el resultado de una batalla en los contadores. `resultado.general` = { cargo, trabada, enemigoAbatido }.
   Devuelve los rasgos que han subido de nivel: [{ clave, nombre, nivel, negativo }]. */
function registrarBatallaGeneral(reino, resultado) {
  const antes = Object.fromEntries(Object.keys(RASGOS_GENERAL).map(k => [k, nivelRasgo(reino, k)]));
  const c = generalDelReino(reino).contadores;
  c.batallas++;
  if (resultado.victoria) { c.victorias++; c.derrotasSeguidas = 0; } else c.derrotasSeguidas++;
  const g = resultado.general || {};
  if (g.cargo) c.cargas++; else if (!g.trabada) c.reservas++;
  if (g.enemigoAbatido) c.generalesAbatidos++;
  if (resultado.soldadosPropios && resultado.bajasPropias / resultado.soldadosPropios > 0.6) c.carnicerias++;
  return Object.keys(RASGOS_GENERAL).filter(k => nivelRasgo(reino, k) > antes[k]).map(k => ({ clave: k, nivel: nivelRasgo(reino, k), nombre: RASGOS_GENERAL[k].nombres[nivelRasgo(reino, k) - 1], negativo: !!RASGOS_GENERAL[k].negativo }));
}
// Discurso previo a la batalla (como en Medieval 2): según los rasgos, el enemigo y la composición del ejército
function discursoGeneral(reino, ramaIA, ejercitoIA, ejercitoPropio) {
  const frases = [];
  const rama = RAMAS[ramaIA];
  const enemigo = { cristiano: 'Enfrente forman los caballeros de un reino cristiano: cuidad los flancos de su caballería.', ortodoxo: 'Los herederos de Bizancio nos esperan con sus arqueros: cerrad filas y avanzad sin pararos bajo las flechas.', musulman: 'Su caballería es rápida y sus arqueros no se cansan: no persigáis a quien no podáis alcanzar.', cruzado: 'Vienen con la cruz al pecho y no huirán fácilmente: habrá que matarlos uno a uno.', tribus: 'Son muchos y gritan mucho; pero su moral es de paja. Un buen golpe y correrán.' }[ramaIA] || `Enfrente está ${rama ? rama.nombre : 'el enemigo'}.`;
  frases.push(`Soldados de ${reino.nombre}: ${enemigo}`);
  const cuenta = tipo => (ejercitoPropio || []).filter(e => e.tipo === tipo).length;
  const total = (ejercitoPropio || []).length || 1;
  if ((cuenta('arqueros') + cuenta('ballesteros') + cuenta('arquerosACaballo')) / total >= 0.4) frases.push('Que nuestras flechas oscurezcan el cielo antes de que lleguen.');
  else if ((cuenta('caballeriaPesada') + cuenta('caballeriaLigera') + cuenta('caballeros')) / total >= 0.4) frases.push('Cuando suene el cuerno, que la tierra tiemble bajo nuestros caballos.');
  else if (cuenta('lanceros') / total >= 0.4) frases.push('Lanzas en alto y pies bien plantados: nada pasará por nuestra línea.');
  else frases.push('Hombro con hombro, escudo con escudo. Así se gana.');
  const rasgos = rasgosActivos(reino);
  for (const r of rasgos.slice(0, 2)) frases.push(RASGOS_GENERAL[r.clave].frases[r.nivel - 1]);
  if (!rasgos.length) frases.push('Es mi primera batalla al frente de vosotros. Haced que la recuerde.');
  frases.push(`¡Por ${reino.nombre}!`);
  return frases;
}
