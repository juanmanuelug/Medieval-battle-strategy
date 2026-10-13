# Arte propio: cómo entregar los sprites

Deja aquí las hojas PNG y un `manifest.json`; el juego las carga al empezar cada batalla. Los tipos que no tengan arte
siguen con el dibujo por código, así que se puede ir tipo a tipo.

## Lo más fácil: imágenes sueltas en `arte/entrada/`

No hace falta montar nada a mano. Se dejan las imágenes (PNG, JPG o WebP) en `arte/entrada/` con este nombre:

```
<tipo>[.<rama>][.<nivel>]_<direccion>_<animacion>[_<n>][_mascara].png
```

- `tipo`: `infanteriaLigera`, `infanteriaPesada`, `lanceros`, `arqueros`, `ballesteros`, `caballeriaPesada`, `caballeriaLigera`, `arquerosACaballo`.
- `rama` (opcional): `cristiano`, `ortodoxo`, `musulman`, `cruzado`, `tribus`. Sin rama, vale para todas.
- `nivel` (opcional): nivel mínimo al que se usa: `leva`, `milicia`, `hombresDeArmas`, `veteranos`. Así la leva puede llevar un dibujo y los hombres de armas otro.
  Para nivel sin rama: `infanteriaPesada..veteranos_…`.
- `direccion`: `S` (de frente), `SW`, `W`, `NW`, `N` y, si se quiere, `SE`, `E`, `NE`. **Con solo `S` ya se puede probar**: el juego usa la dirección más cercana que exista.
- `animacion`: `quieto`, `paso`, `golpe`, `cadaver`; `n` numera los fotogramas (`paso_1`, `paso_2`…).
- `_mascara`: opcional, la misma imagen con solo lo que va en el color del reino.

Ejemplos: `infanteriaPesada.cristiano.hombresDeArmas_S_quieto.png`, `infanteriaPesada.cristiano.hombresDeArmas_S_paso_1.png`,
`arqueros_SW_golpe.png`.

Después:

```
node tools/montar-hoja.js arte/entrada --fondo ffffff --alto 72
node tools/empaquetar-arte.js
```

`montar-hoja` quita el fondo liso del color indicado (`--fondo`, para renders sin transparencia; se omite si ya son transparentes),
recorta cada fotograma, lo escala a `--alto` píxeles (72 = 1,8 m; jinetes 88) y lo apoya en el ancla; escribe las hojas y el
`manifest.json`. `empaquetar-arte` genera el `manifest.js` para abrir el juego como archivo local. Lo de abajo describe el
formato de hoja por si se prefiere montarla a mano.

## Hoja por tipo de tropa

Un PNG con fondo transparente dividido en celdas iguales (por ejemplo 96 × 128 px):

- **Filas = direcciones.** Como mínimo cinco: `S` (de frente, hacia el espectador), `SW`, `W` (perfil izquierdo), `NW`, `N` (de espaldas).
  Las otras tres (`SE`, `E`, `NE`) se sacan en espejo. Si se dibujan las ocho, se usan tal cual (el escudo queda siempre en el brazo correcto).
  El orden de las filas se declara en el manifest, así que puede ser cualquiera.
- **Columnas = fotogramas**, numerados desde 0. El manifest dice qué columnas forman cada animación:
  - `quieto`: 1 o más fotogramas (si hay varios, se alternan despacio: respiración).
  - `paso`: 2 a 8 fotogramas del ciclo de andar; la velocidad la lleva la simulación (un ciclo por cada 2 m recorridos).
  - `golpe`: 1 a 4 fotogramas; se reproducen en 0,28 s cada vez que el soldado ataca (o dispara).
  - `cadaver`: el último fotograma es el cuerpo en el suelo. La caída (0,45 s) la hace el motor girando el sprite sobre los pies.
- **Ancla**: punto de los pies dentro de la celda, como fracción `[x, y]` (por ejemplo `[0.5, 0.92]`). Ahí se apoya el sprite en el suelo.
- **Escala**: `pxPorMetro`. Un soldado mide 1,8 m; a 40 px/m ocupa 72 px de alto. Para los jinetes, caballo y jinete van en la misma celda (2,2 m de alto → 88 px).
- Los caballos ocupan unos 2,2 m de largo: celdas más anchas (por ejemplo 128 × 128).

## Colores del reino

El juego pinta cada ejército con los dos esmaltes de su blasón. Dos opciones:

1. **Máscaras** (recomendado): junto a la hoja, otra PNG con la misma rejilla donde solo está en **blanco** (con la misma forma y
   sombreado en gris) lo que debe ir en el color principal: sobrevesta, banda del escudo, gualdrapa. El juego la tinta con el
   color del reino y la pone encima. Opcionalmente una segunda máscara `mascara2` para el esmalte secundario.
2. Sin máscaras: la hoja va con colores fijos y todos los ejércitos se verán iguales salvo el estandarte.

## manifest.json

```json
{
  "pxPorMetro": 40,
  "tipos": {
    "infanteriaPesada": {
      "hoja": "infanteriaPesada.png",
      "mascara": "infanteriaPesada_mascara.png",
      "celda": [96, 128],
      "ancla": [0.5, 0.92],
      "direcciones": ["S", "SW", "W", "NW", "N"],
      "animaciones": { "quieto": [0], "paso": [1, 2, 3, 4], "golpe": [5, 6], "cadaver": [7] }
    }
  }
}
```

Si el juego se abre **como archivo local** (doble clic en `juego.html`), el navegador no deja leer el `.json` ni que WebGL
use PNG sueltos del disco. En ese caso, con las hojas y el `manifest.json` ya en esta carpeta, se ejecuta una vez (y cada vez
que cambie el arte):

```
node tools/empaquetar-arte.js
```

Genera `manifest.js` con las imágenes incrustadas y el juego lo usa automáticamente. Publicado en Netlify basta el `.json`
(el juego prueba primero el `.json` y, si no puede, el `.js`). Si un tipo falla, el juego avisa en la consola del navegador
(F12) y ese tipo sigue con el dibujo por código.

Claves de tipo: `infanteriaLigera`, `infanteriaPesada`, `lanceros`, `arqueros`, `ballesteros`, `caballeriaPesada`,
`caballeriaLigera`, `arquerosACaballo`. Cada tipo puede tener su propio `pxPorMetro` si la hoja está a otra escala.
Una entrada puede limitarse a una rama y a un nivel mínimo con la clave `tipo.rama.nivel` (o los campos `tipo`, `rama`,
`nivelMinimo`); para cada unidad el juego elige la variante de su tipo y rama con el nivel mínimo más alto que no supere el suyo,
y si no hay ninguna, el dibujo por código.

Formatos que valen: PNG; si el programa exporta una hoja con otra disposición (Aseprite, Piskel, LibreSprite…), basta
con que sea una rejilla regular. Si prefieres entregar un PNG por fotograma, dímelo y se monta la hoja con una herramienta.
