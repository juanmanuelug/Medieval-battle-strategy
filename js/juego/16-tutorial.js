'use strict';
/* ---------- Tutorial «Cómo se juega» (2026-10-13, tras la prueba con amigos) ----------
   Ventana con pasos cortos: una captura del juego (tutorial/*.jpg, las genera tools/capturas-tutorial.js) y dos o tres frases
   por paso. Se abre sola la primera vez que se entra en el juego (localStorage) y siempre con el botón «Cómo se juega» del
   inicio y del menú. Flechas del teclado o botones para pasar; Esc o × para cerrar. */
const CLAVE_TUTORIAL_VISTO = 'batallas.tutorialVisto.v1';
const PASOS_TUTORIAL = [
  { imagen: '1-ramas', titulo: 'Elige una rama', texto: 'Cada rama tiene ventajas en sus tropas y una unidad exclusiva: caballeros, guardia varega, templarios, arqueros a caballo o berserkers. Tu blasón sale en escudos, sobrevestas y estandartes.' },
  { imagen: '2-tienda', titulo: 'Recluta tu ejército', texto: 'Cada botón compra una unidad completa. Los niveles (leva, milicia, hombres de armas, veteranos) dan más vida, daño y moral, pero cuestan más. Busca un ejército equilibrado: infantería que aguante, tiradores, caballería y, si quieres, mangoneles.' },
  { imagen: '3-despliegue', titulo: 'Despliega', texto: 'Antes de empezar, coloca tus tropas dentro de la zona amarilla: selecciónalas y haz clic derecho donde quieras; arrastrando con el botón derecho dibujas su frente: cuanto más largo, más ancha la formación, y miran perpendicular a él. Cuando estés listo, «¡Comenzar la batalla!» o Intro.' },
  { imagen: '4-mover', titulo: 'Selecciona y mueve', texto: 'Clic o recuadro para seleccionar (Mayús añade, Ctrl+A todas, también desde las tarjetas de abajo). Clic derecho en el suelo: mover al paso; doble clic o Mayús: a la carrera, que cansa. Arrastrando con el botón derecho dibujas el frente: más largo, formación más ancha; más corto, más profunda. Varias unidades forman la fila en el orden de las tarjetas, la primera a su izquierda. Con Alt, varias unidades conservan su disposición (arrastrando, giran todas hacia el rumbo). Las líneas verdes marcan el destino.' },
  { imagen: '5-combate', titulo: 'Ataca', texto: 'Clic derecho sobre un enemigo para atacarlo: la caballería carga y los tiradores disparan. Atajos: R atacar, C cargar, T disparar, H alto. La franja de encima de las tarjetas tiene las órdenes y las formaciones de lo seleccionado.' },
  { imagen: '6-formaciones', titulo: 'Formaciones', texto: 'Cada formación tiene sus ventajas: el muro de escudos aguanta flechas y cargas, el cuadro frena a la caballería, la orden abierta reduce el daño de flechas y piedras, y la cuña hace que la caballería penetre. F cambia la formación y Mayús+1…6 la elige directamente (1 línea, 2 cuadro, 3 columna, 4 muro, 5 orden abierta, 6 cuña); pasa el ratón por un botón para ver sus efectos.' },
  { imagen: '7-moral', titulo: 'Moral y cohesión', texto: 'Nadie lucha hasta el último hombre: las bajas, los ataques por el flanco o la espalda, las cargas y el cansancio bajan la moral, y la unidad acaba huyendo (su estandarte parpadea en blanco). El general cerca y las filas de apoyo dan ánimo. Las barras de cada tarjeta son vida, moral y cohesión.' },
  { imagen: '9-tropas', titulo: 'Cada tropa, su papel', texto: 'Los lanceros paran a la caballería; la caballería arrolla a tiradores e infantería ligera, y mejor por la espalda; los tiradores castigan a quien no lleva escudo; los mangoneles destrozan formaciones cerradas. La insignia junto al estandarte dice qué es cada unidad.' },
  { imagen: '10-terreno', titulo: 'El terreno', texto: 'Gana las alturas: se golpea más fuerte cuesta abajo, la caballería carga mejor bajando y peor subiendo, y desde arriba se dispara más lejos. Subir frena y cansa. Las colinas tapan: las ballestas solo tiran a quien ven y las flechas que chocan con una ladera se quedan en ella. Los bosques frenan, impiden cargar y protegen de las flechas. Los riscos y el agua profunda no se pueden atravesar: tus tropas los rodean solas por los pasos, los vados y los puentes, que son los puntos que hay que defender (un puente es estrecho: se cruza con el frente estrechado). Por los caminos se marcha más deprisa y se cansa menos. Los arqueros pueden tirar flechas de fuego (I): hacen menos daño pero asustan más, y prenden los bosques, que arden poco a poco, queman a quien está dentro y quedan sin cobertura; con lluvia muchas se apagan. Con tropas seleccionadas, pasa el ratón por un enemigo para ver qué te da el terreno contra él.' },
  { imagen: '8-camara', titulo: 'Cámara y atajos', texto: 'W A S D o las flechas mueven la cámara y la rueda acerca; clic en el minimapa para saltar. G agrupa la selección (su número la recupera; con un clic, el grupo se traslada sin girar); arrastrar una tarjeta al campo manda allí esa unidad o ataca al enemigo que haya. Alt sin nada seleccionado muestra los destinos, P pausa y F1 abre la ayuda completa.' },
  { imagen: null, titulo: 'Juega con amigos', texto: 'En «Multijugador» puedes crear una sala y pasar su código a un amigo, o pulsar «Buscar partida». Cada uno recluta con el mismo oro y despliega a ciegas; la pausa se le pide al rival. ¡Suerte en el campo!' },
];
let pasoTutorial = 0;
function abrirTutorial(desde) {
  pasoTutorial = desde || 0;
  pintarTutorial();
  elemento('#tutorial').classList.remove('oculto');
  guardarLocal(CLAVE_TUTORIAL_VISTO, '1');
}
function cerrarTutorial() { elemento('#tutorial').classList.add('oculto'); }
function pintarTutorial() {
  const paso = PASOS_TUTORIAL[pasoTutorial];
  const imagen = elemento('#tutorial-imagen');
  imagen.classList.toggle('oculto', !paso.imagen);
  // capturas en el idioma del juego (tutorial/en/ con la interfaz en inglés)
  if (paso.imagen) { imagen.src = 'tutorial/' + (idiomaActual === 'en' ? 'en/' : '') + paso.imagen + '.jpg'; imagen.alt = paso.titulo; }
  elemento('#tutorial-titulo').textContent = paso.titulo;
  elemento('#tutorial-texto').textContent = paso.texto;
  elemento('#tutorial-cuenta').textContent = (pasoTutorial + 1) + ' / ' + PASOS_TUTORIAL.length;
  html('#tutorial-puntos', PASOS_TUTORIAL.map((p, k) => `<button type="button" class="punto${k === pasoTutorial ? ' actual' : ''}" data-paso="${k}" title="${textoEsc(p.titulo)}"></button>`).join(''));
  elemento('#btn-tutorial-anterior').disabled = pasoTutorial === 0;
  elemento('#btn-tutorial-siguiente').textContent = pasoTutorial === PASOS_TUTORIAL.length - 1 ? '¡A jugar!' : 'Siguiente →';
}
const moverTutorial = delta => { const nuevo = pasoTutorial + delta; if (nuevo < 0) return; if (nuevo >= PASOS_TUTORIAL.length) return cerrarTutorial(); pasoTutorial = nuevo; pintarTutorial(); };
elementoListo(() => {
  elemento('#btn-inicio-tutorial').addEventListener('click', () => abrirTutorial());
  elemento('#btn-menu-tutorial').addEventListener('click', () => abrirTutorial());
  elemento('#btn-tutorial-cerrar').addEventListener('click', cerrarTutorial);
  elemento('#btn-tutorial-anterior').addEventListener('click', () => moverTutorial(-1));
  elemento('#btn-tutorial-siguiente').addEventListener('click', () => moverTutorial(1));
  elemento('#tutorial-puntos').addEventListener('click', e => { const b = e.target.closest('[data-paso]'); if (b) { pasoTutorial = +b.dataset.paso; pintarTutorial(); } });
  elemento('#tutorial').addEventListener('click', e => { if (e.target.id === 'tutorial') cerrarTutorial(); });
  window.addEventListener('keydown', e => {
    if (elemento('#tutorial').classList.contains('oculto')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); moverTutorial(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); moverTutorial(-1); }
    else if (e.key === 'Escape') cerrarTutorial();
  }, true);
  // la primera vez que se entra en el juego se abre solo
  const visto = !!leerLocal(CLAVE_TUTORIAL_VISTO, '1');
  if (!visto) setTimeout(() => abrirTutorial(), 400);
});
