'use strict';
/* ---------- Idioma: tablas de datos y repintado (ver js/00b-idioma.js) ----------
   registrarDatosTraducibles: qué campos de qué tablas cambian con el idioma (nombres de tropas, formaciones, ramas, niveles,
   climas, mapas, dificultades, actitudes, rasgos del general, pasos del tutorial…). Se llama una vez, con todo cargado.
   Al cambiar de idioma se repinta la pantalla abierta, para que lo que se monta con datos salga en el idioma nuevo. */
function registrarDatosTraducibles() {
  const cadaUno = (tabla, campos) => { for (const fila of Object.values(tabla || {})) registrarTraducibles(fila, campos); };
  if (typeof TIPOS !== 'undefined') for (const t of TIPOS) registrarTraducibles(t, ['nombre']);
  cadaUno(typeof FORMACIONES !== 'undefined' && FORMACIONES, ['nombre', 'descripcion', 'ventajas']);
  if (typeof QUIEN_PUEDE_FORMACION !== 'undefined') registrarTraducibles(QUIEN_PUEDE_FORMACION, Object.keys(QUIEN_PUEDE_FORMACION));
  cadaUno(typeof CLIMAS !== 'undefined' && CLIMAS, ['nombre', 'descripcion']);
  cadaUno(typeof TIPOS_MAPA !== 'undefined' && TIPOS_MAPA, ['nombre', 'descripcion']);
  if (typeof NOMBRE_TERRENO !== 'undefined') registrarTraducibles(NOMBRE_TERRENO, NOMBRE_TERRENO.map((v, k) => k));
  cadaUno(typeof RAMAS !== 'undefined' && RAMAS, ['nombre', 'descripcion', 'ventajas']);
  if (typeof NIVELES !== 'undefined') for (const n of NIVELES) registrarTraducibles(n, ['nombre']);
  cadaUno(typeof DIFICULTADES !== 'undefined' && DIFICULTADES, ['nombre', 'descripcion']);
  cadaUno(typeof ACTITUDES_IA !== 'undefined' && ACTITUDES_IA, ['nombre', 'descripcion']);
  cadaUno(typeof RASGOS_GENERAL !== 'undefined' && RASGOS_GENERAL, ['nombres', 'descripcion', 'frases']);
  if (typeof NOMBRE_CORTO_TIPO !== 'undefined') registrarTraducibles(NOMBRE_CORTO_TIPO, Object.keys(NOMBRE_CORTO_TIPO));
  if (typeof PASOS_TUTORIAL !== 'undefined') for (const p of PASOS_TUTORIAL) registrarTraducibles(p, ['titulo', 'texto']);
}
// repintar la pantalla abierta con el idioma nuevo
alCambiarIdioma(() => {
  const activa = PANTALLAS.find(p => elemento('#pantalla-' + p).classList.contains('activa'));
  try {
    if (activa === 'inicio') iniciarPantallaInicio();
    else if (activa === 'menu' && reino) iniciarPantallaMenu();
    else if (activa === 'rama' && reino) iniciarPantallaRama();
    else if (activa === 'tienda' && reino) iniciarPantallaTienda();
    else if (activa === 'personalizada' && reino) iniciarPantallaPersonalizada();
    else if (activa === 'multijugador') pintarMultijugador();
  } catch (e) { console.warn('repintar tras cambiar de idioma:', e); }
  if (!elemento('#tutorial').classList.contains('oculto')) pintarTutorial();
});
