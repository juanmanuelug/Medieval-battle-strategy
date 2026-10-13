Módulos descartados por decisión del usuario (2026-10-08) y retirados de la carga el 2026-10-09:

- `sprites-3d.js`: sprites pre-renderizados desde modelos 3D con Three.js (no gustó el aspecto).
- `12-sonido.js`: sonido sintetizado con WebAudio (no gustó; el sonido futuro será con muestras reales).
- `sprites-2d.js` (retirado el 2026-10-09): el dibujo anterior con `PIXI.Graphics` (`dibujarSoldado2D`), sustituido por el estilo muñeco de `js/sprites-munecos.js` con heráldica real. Si se retomara, `render-iso.js` y `14-retratos.js` esperan ahora un canvas con ancla, no un `Graphics`.

Ninguna página los carga. Si se retoman, `render-iso.js` ya no tiene el gancho `atlas3d` ni `opciones.sonido`: habría que volver a conectarlos.
