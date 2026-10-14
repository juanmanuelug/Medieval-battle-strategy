'use strict';
/* ---------- Datos del juego: ramas, niveles de tropa, precios y dificultades ----------
   Todo el equilibrio es datos. Una bonificación es un multiplicador por tipo de tropa: vida, dano, velocidad, precio.
   `simbolo` es la clave de figura del diseñador para el blasón por defecto de la rama. */
const RAMAS = {
  cristiano: { nombre: 'Reino cristiano', descripcion: 'Caballería pesada de caballeros: más dura y más dañina, y algo más barata. Infantería pesada sólida.', colores: ['#b3202c', '#d9a92c'], simbolo: 'crossPattee', moral: 1.0,
    bonificaciones: { caballeriaPesada: { vida: 1.15, dano: 1.15, precio: 0.9 }, caballeros: { vida: 1.15, dano: 1.15 }, infanteriaPesada: { vida: 1.05 } },
    ventajas: ['Caballería +15 % vida y daño, −10 % precio', 'Infantería pesada +5 % vida'] },
  ortodoxo: { nombre: 'Reino ortodoxo', descripcion: 'Herederos de Bizancio: arqueros disciplinados y baratos, infantería pesada resistente.', colores: ['#6b2d6e', '#d9a92c'], simbolo: 'crossGreek', moral: 1.0,
    bonificaciones: { arqueros: { dano: 1.2, precio: 0.85 }, infanteriaPesada: { vida: 1.1 } },
    ventajas: ['Arqueros +20 % daño, −15 % precio', 'Infantería pesada +10 % vida'] },
  musulman: { nombre: 'Reino musulmán', descripcion: 'Ejércitos rápidos: caballería veloz y barata, arqueros e infantería ligera ágiles.', colores: ['#2d7a3a', '#e8e4d8'], simbolo: 'estrellaOcho', moral: 1.0,
    bonificaciones: { caballeriaPesada: { velocidad: 1.2, precio: 0.85 }, arqueros: { velocidad: 1.15 }, infanteriaLigera: { velocidad: 1.1 } },
    ventajas: ['Caballería +20 % velocidad, −15 % precio', 'Arqueros e infantería ligera más rápidos'] },
  cruzado: { nombre: 'Reino cruzado', descripcion: 'La fe sostiene la línea: moral muy alta, las unidades tardan mucho más en huir. Infantería pesada feroz.', colores: ['#e8e4d8', '#b3202c'], simbolo: 'crossPotent', moral: 1.35,
    bonificaciones: { infanteriaPesada: { dano: 1.1 } },
    ventajas: ['Moral +35 % en todas las unidades', 'Infantería pesada +10 % daño'] },
  tribus: { nombre: 'Tribus', descripcion: 'Hordas numerosas: cada unidad trae un 20 % más de guerreros y la infantería ligera y los lanceros salen baratos, a cambio de moral más frágil.', colores: ['#5a3a21', '#c8702a'], simbolo: 'axeDouble', moral: 0.9, extraSoldados: 1.2,
    bonificaciones: { infanteriaLigera: { precio: 0.7, vida: 0.95 }, lanceros: { precio: 0.8 } },
    ventajas: ['+20 % soldados por unidad', 'Infantería ligera −30 % y lanceros −20 % de precio', 'Moral −10 %'] },
};
const NIVELES = [
  { clave: 'leva', nombre: 'Leva', multStats: 0.8, multPrecio: 0.7, multMoral: 0.9 },
  { clave: 'milicia', nombre: 'Milicia', multStats: 1.0, multPrecio: 1.0, multMoral: 1.0 },
  { clave: 'hombresDeArmas', nombre: 'Hombres de armas', multStats: 1.25, multPrecio: 1.6, multMoral: 1.1 },
  { clave: 'veteranos', nombre: 'Veteranos', multStats: 1.5, multPrecio: 2.4, multMoral: 1.25 },
];
// Precio por soldado y tamaño de la unidad por tipo
const TROPA = {
  infanteriaLigera: { precio: 8, tamano: 40, rama: 'infanteria' },
  infanteriaPesada: { precio: 14, tamano: 40, rama: 'infanteria' },
  lanceros: { precio: 10, tamano: 40, rama: 'infanteria' },
  arqueros: { precio: 12, tamano: 30, rama: 'arqueros' },
  caballeriaPesada: { precio: 36, tamano: 20, rama: 'caballeria' },
  // comunes a todas las ramas desde el 2026-10-13 (antes, exclusivas de algunas)
  caballeriaLigera: { precio: 22, tamano: 24, rama: 'caballeria' },
  ballesteros: { precio: 15, tamano: 30, rama: 'arqueros' },
  // exclusivas: una por rama, ligada a su ventaja (2026-10-13, tras la prueba con amigos); solo las ramas que las listan en
  // RAMAS[rama].exclusivas
  // artillería común: el precio es por máquina (3 por unidad); el +20 % de guerreros de las tribus no cuenta para las máquinas
  mangoneles: { precio: 190, tamano: 3, rama: 'artilleria' },
  arquerosACaballo: { precio: 30, tamano: 20, rama: 'arqueros', exclusiva: true },
  caballeros: { precio: 46, tamano: 20, rama: 'caballeria', exclusiva: true },   // tropa de lujo: ver medir_exclusivas.js
  guardiaVarega: { precio: 20, tamano: 30, rama: 'infanteria', exclusiva: true },
  templarios: { precio: 22, tamano: 30, rama: 'infanteria', exclusiva: true },
  berserkers: { precio: 11, tamano: 36, rama: 'infanteria', exclusiva: true },
};
RAMAS.cristiano.exclusivas = ['caballeros'];
RAMAS.ortodoxo.exclusivas = ['guardiaVarega'];
RAMAS.cruzado.exclusivas = ['templarios'];
RAMAS.musulman.exclusivas = ['arquerosACaballo'];
RAMAS.tribus.exclusivas = ['berserkers'];
RAMAS.cristiano.ventajas.push('Exclusiva: caballeros, la carga de caballería más fuerte');
RAMAS.ortodoxo.ventajas.push('Exclusiva: guardia varega, infantería pesada de hacha a dos manos');
RAMAS.cruzado.ventajas.push('Exclusiva: templarios, infantería de élite que casi nunca huye');
RAMAS.musulman.ventajas.push('Exclusiva: arqueros a caballo, que disparan sin dejar de moverse');
RAMAS.tribus.ventajas.push('Exclusiva: berserkers, guerreros feroces, rápidos y baratos');
const tiposDisponibles = ramaClave => Object.keys(TROPA).filter(t => !TROPA[t].exclusiva || (RAMAS[ramaClave].exclusivas || []).includes(t));
// El general: guardia montada que acompaña a cada ejército, gratis y automática
const GENERAL = { tipo: 'caballeriaPesada', soldados: 12, modificadores: { vida: 1.4, dano: 1.3, velocidad: 1, moral: 1.5 } };
const ORO_INICIAL = 12000;
const DIFICULTADES = {
  // presupuesto: fracción del valor del ejército del jugador; sesgoNivel: niveles por encima (o debajo) del nivel medio del jugador
  facil: { nombre: 'Fácil', presupuesto: 0.7, sesgoNivel: -0.6, descripcion: 'La IA gasta un 70 % de tu oro y recluta tropas algo peores que las tuyas.' },
  normal: { nombre: 'Normal', presupuesto: 1.0, sesgoNivel: 0, descripcion: 'La IA gasta tanto como tú, con tropas de calidad parecida.' },
  dificil: { nombre: 'Difícil', presupuesto: 1.3, sesgoNivel: 0.5, descripcion: 'La IA gasta un 30 % más y recluta tropas algo mejores.' },
  brutal: { nombre: 'Brutal', presupuesto: 1.7, sesgoNivel: 1.0, descripcion: 'La IA gasta un 70 % más y recluta un nivel por encima del tuyo.' },
};
