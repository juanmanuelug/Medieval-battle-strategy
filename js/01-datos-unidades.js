'use strict';
/* ---------- Datos del juego: tipos de tropa, equipos y constantes del campo ----------
   Todo lo que define el equilibrio vive aquí como datos (más adelante, en JSON por rama). Unidades en metros y segundos. */
const CAMPO = { ancho: 440, alto: 320 };       // metros (doblado el 2026-10-10: antes 220 × 160, no daba tiempo a maniobrar)
// línea de despliegue de cada bando, en fracción del ancho: el frente del jugador en x = 0,28·ancho y el enemigo en 0,72·ancho
const FRENTE_DESPLIEGUE = 0.28;
// Zona de despliegue de cada bando: el izquierdo hasta el 38 % del ancho, el derecho desde el 62 % (aquí y no en 04-ordenes.js
// desde el 2026-10-19: el terreno también la usa, y antes llevaba 4 copias de reserva por si no estaba cargada)
const FONDO_ZONA_DESPLIEGUE = 0.38;
function zonaDespliegue(equipo) {
  return equipo === 0 ? { x0: 6, x1: Math.round(CAMPO.ancho * FONDO_ZONA_DESPLIEGUE), y0: 6, y1: CAMPO.alto - 6 } : { x0: Math.round(CAMPO.ancho * (1 - FONDO_ZONA_DESPLIEGUE)), x1: CAMPO.ancho - 6, y0: 6, y1: CAMPO.alto - 6 };
}
// aura del general sin rasgos (radio en m, moral que suma por segundo a las unidades dentro); los rasgos amplían el radio
const AURA_GENERAL = { radio: 35, moral: 1.5 };
const PASO_SIMULACION = 1 / 30;                 // segundos por paso fijo
const GRAVEDAD = 9.8;

const ESTADO = { MUERTO: 0, FORMADO: 1, AVANZANDO: 2, LUCHANDO: 3, VOLANDO: 4, CADAVER: 5, AUSENTE: 6 };   // AUSENTE: huyó por el borde del campo

// Índice de tipo → estadísticas. "alcance" es cuerpo a cuerpo; los tiradores tienen además alcanceTiro, munición (andanadas)
// y `cuerpoACuerpoComo`: el tipo de tropa al que equivalen en el cuerpo a cuerpo (dos niveles por debajo del suyo).
const TIPOS = [
  { clave: 'infanteriaLigera', nombre: 'Infantería ligera', velocidad: 2.2, vida: 100, dano: 12, alcance: 1.1, intervalo: 1.0, masa: 1.0, radio: 0.35, proteccionFlechas: 0.15 },
  { clave: 'infanteriaPesada', nombre: 'Infantería pesada', velocidad: 1.6, vida: 170, dano: 17, alcance: 1.1, intervalo: 1.1, masa: 1.4, radio: 0.38, proteccionFlechas: 0.25 },
  { clave: 'lanceros', nombre: 'Lanceros', velocidad: 1.9, vida: 110, dano: 11, alcance: 2.0, intervalo: 1.0, masa: 1.0, radio: 0.35, antiCaballeria: true, proteccionFlechas: 0.15 },
  { clave: 'arqueros', nombre: 'Arqueros', velocidad: 2.3, vida: 70, dano: 6, alcance: 1.0, intervalo: 1.2, masa: 0.8, radio: 0.33, alcanceTiro: 85, cadenciaTiro: 5.5, danoFlecha: 36, velocidadFlecha: 28, dispersion: 0.07, municion: 20, cuerpoACuerpoComo: 'infanteriaLigera' },
  { clave: 'caballeriaPesada', nombre: 'Caballería pesada', velocidad: 6.5, vida: 215, dano: 18, alcance: 1.2, intervalo: 1.0, masa: 4.0, radio: 0.6, montado: true, umbralCarga: 4.0, energiaCarga: 10, danoCarga: 58, velocidadCarga: 10.5 },   // 2026-10-13, tras la prueba con amigos (arrasaba): antes vida 230, daño 22, alcance 1,6, impulso 14, carga 75
  // Tropas exclusivas de algunas ramas (ver RAMAS.exclusivas)
  { clave: 'caballeriaLigera', nombre: 'Caballería ligera', velocidad: 7.6, vida: 150, dano: 16, alcance: 1.5, intervalo: 1.0, masa: 2.8, radio: 0.55, montado: true, umbralCarga: 4.5, energiaCarga: 7, danoCarga: 45, velocidadCarga: 11.0 },
  { clave: 'arquerosACaballo', nombre: 'Arqueros a caballo', velocidad: 7.0, vida: 120, dano: 10, alcance: 1.2, intervalo: 1.1, masa: 2.5, radio: 0.55, montado: true, alcanceTiro: 60, cadenciaTiro: 5.0, danoFlecha: 30, velocidadFlecha: 28, dispersion: 0.09, disparaEnMovimiento: true, municion: 16, cuerpoACuerpoComo: 'caballeriaLigera' },
  // cadencia de arqueros 4 → 5,5 s y de ballesteros 7,5 → 10 s entre andanadas (2026-10-12, pedido: disparaban demasiado rápido)
  // ballesteros (2026-10-12, a petición del usuario: «no son rentables»): vida 100 (antes 80), virote 80 (70) y TIRO APUNTADO
  // (cada ballestero apunta a un soldado, no a la zona: la precisión cuenta) con dispersión 0,06 alrededor de él
  { clave: 'ballesteros', nombre: 'Ballesteros', velocidad: 2.0, vida: 100, dano: 7, alcance: 1.0, intervalo: 1.2, masa: 0.9, radio: 0.33, alcanceTiro: 70, cadenciaTiro: 10.0, danoFlecha: 80, velocidadFlecha: 40, dispersion: 0.06, apuntado: true, perforante: true, municion: 14, cuerpoACuerpoComo: 'infanteriaLigera' },
  // Exclusivas de rama (2026-10-13, tras la prueba con amigos: una por rama y ligada a su ventaja, sin repetir)
  // caballeros (cristiano): caballería de choque, la carga más fuerte del juego; unidades pequeñas y caras
  { clave: 'caballeros', nombre: 'Caballeros', velocidad: 6.2, vida: 250, dano: 20, alcance: 1.2, intervalo: 1.0, masa: 4.4, radio: 0.6, montado: true, umbralCarga: 4.0, energiaCarga: 10, danoCarga: 72, velocidadCarga: 10.2, moralBase: 1.15 },
  // Propiedades de las tropas: escudo: false → no forma muro de escudos; proteccionFlechas → fracción del daño de las flechas
  // no perforantes que para (0,25 la armadura pesada, 0,15 el escudo solo; los virotes de ballesta hacen el daño entero)
  // guardia varega (ortodoxo): infantería pesada de hacha a dos manos; mucho daño, sin escudo (no forma muro) pero con armadura pesada
  { clave: 'guardiaVarega', nombre: 'Guardia varega', velocidad: 1.6, vida: 195, dano: 28, alcance: 1.25, intervalo: 1.25, masa: 1.5, radio: 0.38, escudo: false, proteccionFlechas: 0.25, moralBase: 1.2 },
  // templarios (cruzado): infantería de élite con escudo; moral base ×1,4 (además de la de la rama)
  { clave: 'templarios', nombre: 'Templarios', velocidad: 1.6, vida: 220, dano: 21, alcance: 1.1, intervalo: 1.05, masa: 1.5, radio: 0.38, moralBase: 1.4, proteccionFlechas: 0.25 },
  // berserkers (tribus): infantería ligera feroz y barata; golpea muy seguido, sin escudo ni armadura; moral base ×1,25
  // Artillería (2026-10-13, tras la prueba con amigos): cada «soldado» es un mangonel con su dotación. Lanza piedras en
  // parábola alta (alcance 160 m, mínimo 35 m) que hacen daño en un radio (radioImpacto) a todo el que pillen, también a los
  // propios; desordenan y asustan más que las flechas. Solo dispara parado, casi no se defiende y no se puede arrollar.
  { clave: 'mangoneles', nombre: 'Mangoneles', velocidad: 0.9, vida: 320, dano: 3, alcance: 1.2, intervalo: 1.5, masa: 3.0, radio: 0.9, alcanceTiro: 160, alcanceMinimo: 35, cadenciaTiro: 12, danoFlecha: 95, radioImpacto: 3.2, velocidadFlecha: 30, dispersion: 0.05, municion: 15, artilleria: true, escudo: false, separacionMinima: 7 },
  { clave: 'berserkers', nombre: 'Berserkers', velocidad: 2.5, vida: 110, dano: 19, alcance: 1.1, intervalo: 0.8, masa: 1.1, radio: 0.36, escudo: false, moralBase: 1.25 },
];
const TIPO = Object.fromEntries(TIPOS.map((t, i) => [t.clave, i]));

const EQUIPOS = [
  { nombre: 'Reino de Castilla', color: 0xb3202c, colorSecundario: 0xd9a92c },
  { nombre: 'Taifa de Toledo', color: 0x2d7a3a, colorSecundario: 0xe8e4d8 },
];

// Separación entre soldados en formación
const SEPARACION_FORMACION = { aPie: 0.95, montado: 1.7 };

// Formaciones (efectos rehechos el 2026-10-12 a petición del usuario). Forma: filas = número de filas (ancho variable);
// columnas = fijo; proporcion = cuadrado (columnas ≈ √(n·proporcion)); cuna = triángulo (punta = jinetes en la primera fila); separacion = × la separación normal.
// Efectos (multiplicadores; 1 o ausente = sin efecto):
//   velocidad · defensaFlecha (daño recibido de flechas y virotes) · defensaCarga (daño recibido de atropellos)
//   defensaMelee (daño recibido en el cuerpo a cuerpo) · defensaCaballeria (daño recibido de jinetes, cargas y melé)
//   frenoCarga (impulso que gasta el jinete por cada atropello contra ella) · reboteCarga (daño al jinete que choca)
//   cohesionGanancia / cohesionPerdida · cargaExtra / cargaDano (la carga propia dura más / golpea más)
//   penetracion (la carga no se detiene hasta tener trabada la mitad de la unidad)
// disponible: quién puede usarla → 'todas' | 'infanteriaEscudo' (infantería cuerpo a cuerpo con escudo) |
//   'infanteria' (infantería cuerpo a cuerpo) | 'caballeria' (caballería cuerpo a cuerpo). Ver formacionDisponible().
// ventajas: textos para la interfaz.
const FORMACIONES = {
  linea: { nombre: 'Línea', descripcion: 'Tres filas de fondo: mucho frente, equilibrada.', filas: 3, velocidad: 1, disponible: 'todas',
    ventajas: ['Sin ventajas ni desventajas'] },
  columna: { nombre: 'Columna', descripcion: 'Estrecha y profunda: la más rápida para desplazarse, mala para luchar.', columnas: 6, velocidad: 1.2, defensaFlecha: 1.15, disponible: 'todas',
    ventajas: ['Se mueve un 20 % más rápido', 'Recibe un 15 % más de daño de flechas'] },
  cuadro: { nombre: 'Cuadro', descripcion: 'Bloque compacto erizado por todos los lados contra los jinetes.', proporcion: 1, velocidad: 0.9, defensaCaballeria: 0.5, frenoCarga: 2, disponible: 'infanteria',
    ventajas: ['Recibe la mitad de daño de caballería (cargas y cuerpo a cuerpo)', 'Frena las cargas: cada jinete que atropella gasta el doble de impulso', 'Se mueve un 10 % más despacio'] },
  cuna: { nombre: 'Cuña', descripcion: 'Punta de lanza de caballería: la carga golpea más fuerte y dura más.', cuna: true, punta: 3, velocidad: 1, cargaExtra: 1.5, cargaDano: 2.0, penetracion: true, disponible: 'caballeria',
    ventajas: ['La carga hace el doble de daño', 'La carga atropella un 50 % más de enemigos y penetra en la formación enemiga en vez de pararse al primer contacto'] },
  muro: { nombre: 'Muro de escudos', descripcion: 'Dos filas apretadas con los escudos en alto: aguanta flechas y cargas, pero avanza despacio.', filas: 2, separacion: 0.78, velocidad: 0.65, defensaFlecha: 0.55, defensaCarga: 0.4, frenoCarga: 3, reboteCarga: 15, cohesionGanancia: 1.5, cohesionPerdida: 0.5, disponible: 'infanteriaEscudo',
    ventajas: ['Recibe un 45 % menos de daño de flechas', 'Recibe un 60 % menos de daño de las cargas y las frena: cada jinete que choca gasta el triple de impulso y se lleva un golpe', 'Gana cohesión más deprisa y la pierde a la mitad', 'Se mueve un 35 % más despacio'] },
  abierta: { nombre: 'Orden abierta', descripcion: 'Soldados espaciados: las flechas fallan más, pero las cargas y el choque la desbaratan.', filas: 3, separacion: 1.8, velocidad: 1.05, defensaFlecha: 0.5, defensaCarga: 1.4, defensaMelee: 1.25, cohesionPerdida: 0.6, disponible: 'todas',
    ventajas: ['Recibe la mitad de daño de flechas', 'Recibe un 40 % más de daño de las cargas', 'Recibe un 25 % más de daño en el cuerpo a cuerpo'] },
};
// ¿Puede esta unidad usar esta formación? Infantería cuerpo a cuerpo = a pie y sin tiro por naturaleza (los tiradores sin
// flechas siguen sin escudo ni formación cerrada); la de escudo además lleva escudo (todas las de cuerpo a cuerpo lo llevan).
function formacionDisponible(unidad, clave) {
  const F = FORMACIONES[clave]; if (!F) return false;
  const base = TIPOS[unidad.tipo] || unidad.stats;
  const aDistancia = !!base.alcanceTiro, montado = !!base.montado;
  switch (F.disponible) {
    case 'infanteriaEscudo': return !montado && !aDistancia && base.escudo !== false;
    case 'infanteria': return !montado && !aDistancia;
    case 'caballeria': return montado && !aDistancia;
    default: return true;
  }
}
const QUIEN_PUEDE_FORMACION = { todas: 'todas las unidades', infanteriaEscudo: 'infantería cuerpo a cuerpo con escudo', infanteria: 'infantería cuerpo a cuerpo', caballeria: 'caballería cuerpo a cuerpo' };

// Clima de la batalla: multiplicadores sobre velocidad, flechas, fatiga y cargas (idea de la comunidad de Total War: Agincourt)
const CLIMAS = {
  despejado: { nombre: 'Despejado', descripcion: 'Sin efectos.', velocidad: 1, velocidadMontado: 1, danoFlecha: 1, alcanceTiro: 1, cadencia: 1, fatiga: 1, carga: 1, lluvia: false, barro: false },
  lluvia: { nombre: 'Lluvia', descripcion: 'Las cuerdas se mojan: flechas con menos alcance, daño y cadencia.', velocidad: 1, velocidadMontado: 1, danoFlecha: 0.7, alcanceTiro: 0.85, cadencia: 1.25, fatiga: 1.1, carga: 1, lluvia: true, barro: false },
  barro: { nombre: 'Barro', descripcion: 'Ha llovido días: todos más lentos, la caballería mucho, cargas débiles y más fatiga.', velocidad: 0.8, velocidadMontado: 0.65, danoFlecha: 1, alcanceTiro: 1, cadencia: 1, fatiga: 1.5, carga: 0.6, lluvia: false, barro: true },
  tormenta: { nombre: 'Tormenta', descripcion: 'Lluvia y barro a la vez.', velocidad: 0.8, velocidadMontado: 0.65, danoFlecha: 0.7, alcanceTiro: 0.85, cadencia: 1.25, fatiga: 1.5, carga: 0.6, lluvia: true, barro: true },
  // nieve (2026-10-13, tras la prueba con amigos): campo nevado, todo más lento y cansado, cargas más flojas
  nieve: { nombre: 'Nieve', descripcion: 'Campo nevado: todos más lentos, más fatiga y cargas más flojas.', velocidad: 0.85, velocidadMontado: 0.8, danoFlecha: 1, alcanceTiro: 0.95, cadencia: 1.1, fatiga: 1.4, carga: 0.75, lluvia: false, barro: false, nieve: true },
};// Clima al azar desde la semilla (el mismo en el servidor y en los navegadores): despejado 50 %, lluvia 18 %, barro 12 %,
// tormenta 10 %, nieve 10 %
function climaDesdeSemilla(semilla) {
  const tirada = crearAleatorio(semilla + 7).numero();
  return tirada < 0.5 ? 'despejado' : tirada < 0.68 ? 'lluvia' : tirada < 0.8 ? 'barro' : tirada < 0.9 ? 'tormenta' : 'nieve';
}

