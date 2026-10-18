# La altura cuenta en el combate (18 de octubre de 2026)

## Terreno
- **Ganar las alturas da ventaja**: se golpea más fuerte cuesta abajo y peor cuesta arriba, según lo empinada que sea la ladera (hasta +20 % / −15 %). Antes era un +15 % fijo por estar en cualquier celda de colina.
- **Subir cuesta**: cuesta arriba se marcha hasta un 25 % más despacio y se cansa más; cuesta abajo, algo más rápido.
- **Cargas**: la caballería carga hasta un 30 % mejor bajando y un 30 % peor subiendo, según la subida o bajada de los últimos 12 m de carrera (así cuenta subir la ladera aunque el enemigo espere en lo alto, casi en llano).
- **La caballería enemiga elige mejor a quién cargar**: busca las tropas que no están en alto, sobre todo las más débiles cuerpo a cuerpo (tiradores, infantería ligera, unidades diezmadas), y evita a los lanceros de frente. Si todo tu ejército está en una colina, carga para apoyar a sus tropas trabadas, coge por la espalda a quien está peleando o, si no, va a por la unidad más débil. Si hay otra unidad en medio, la rodea por fuera en vez de estrellarse contra ella.
- **Alcance según la altura**: desde arriba se dispara más lejos y desde abajo menos (±3 % por metro de desnivel, hasta ±20 %).
- **Línea de visión**: las colinas tapan. Las ballestas solo tiran a quien ven; los arcos y los mangoneles tiran en parábola por encima, pero las flechas que chocan con una ladera se quedan clavadas en ella. Si el blanco está tapado y se les ordena atacar, los tiradores se acercan hasta verlo.
- **Aviso en pantalla**: con tropas seleccionadas, al pasar el ratón por un enemigo se ve qué te da el terreno contra él (cuerpo a cuerpo, carga, alcance o si está tapado).
- Nueva página «El terreno» en el tutorial.
- **Colinas con más detalle**: las cimas tienen hierba más seca, asoma la tierra en las laderas fuertes, la superficie tiene pequeñas ondulaciones y hay rocas y pedregal. Las sombras son más marcadas y las curvas de nivel más finas. Con nieve, sombras azuladas y roca al descubierto en lo empinado, para que el relieve se vea sobre el blanco.

## La dificultad también cambia cómo juega la IA
- **Difícil y Brutal**: la infantería enemiga libre flanquea a tus unidades que ya pelean con las suyas (rodea y entra por el costado o la espalda); sus unidades forman muro de escudos (o cuadro) cuando ven venir una carga tuya y lo deshacen al pasar; y sus tiradores concentran el fuego en el blanco donde más bajas sacan.
- **Fácil**: la IA reacciona más tarde (decide cada 3 s), sus tiradores se distraen cambiando de blanco y su caballería a veces carga cuesta arriba aunque tenga blancos mejores.
- **Normal** juega como hasta ahora.
- En cualquier dificultad, la IA defensiva sale a rematar cuando tiene el triple de soldados en pie que tú (antes podía quedarse esperando para siempre a unos pocos supervivientes).

## Arreglos
- **Las batallas ya no se alargan con unidades en retirada que no pueden volver**: una unidad veterana que se retira formada solo cuenta como en pie si puede rehacerse (moral suficiente y sin enemigos encima). Si la persiguen de cerca, o su moral no da para rehacerse, el bando que solo tiene eso está derrotado.
- **Tutorial con capturas nuevas** (con el terreno con volumen), también en inglés, y captura para la página «El terreno».
- **Soldados que se quedaban mirando de lado**: en el muro de escudos, al recolocarse, algunos soldados acababan mirando hacia donde se ajustaban y no al frente pedido. Ahora el que solo se recoloca en su puesto se mueve de lado mirando al frente. Comprobado con todas las tropas y formaciones, en llano y en ladera.

## Equilibrio
- **Los lanceros paran cualquier carga que no les llegue por la espalda**: da igual que estén parados, en marcha o peleando; la caballería se estrella, pierde la carga y se lleva el golpe. Antes solo la paraban si estaban quietos. Por la espalda (o huyendo) los arrolla como a cualquier otra infantería.

## Al desplegar
- Cambia la simulación: todos los jugadores tienen que recargar la página para jugar en red con la misma versión.

---

# Terreno con volumen y arreglos (16 de octubre de 2026, tarde)

## Terreno

- **Colinas con relieve**: el suelo se levanta de verdad, con sombreado según la pendiente y curvas de nivel suaves; las tropas suben y bajan las laderas.
- **Bosques más profundos**: árboles nuevos, más juntos y variados (con nieve cuando nieva), sombras de las copas y suelo de hojarasca. Los árboles que tapan a tus soldados se vuelven semitransparentes.
- **El río corre**: el agua fluye a lo largo del cauce.
- **Vados con detalle**: tierra mojada, charcos, guijarros y piedras grandes con espuma alrededor.
- Todo es visual: el combate no cambia.

## Arreglos
- **Las flechas en vuelo ya no trepan las colinas**: hacen su parábola de la altura del arquero a la del blanco.
- **Las flechas clavadas conservan el ángulo con el que llegan**: la punta hundida y la cola hacia quien disparó, en lugar de todas iguales con las plumas arriba.
- **Las unidades se quedan mirando a donde se les pide**: al mandar una unidad casi a su mismo sitio con otra orientación (sobre todo si estaba de espaldas), a veces acababa mirando al revés o se quedaba girando sin llegar.

## Al desplegar
- El arreglo de la orientación cambia la simulación: todos los jugadores tienen que recargar la página para jugar en red con la misma versión.

---

# Batalla, IA y flechas (16 de octubre de 2026)

## Interfaz
- **Aura del general a la vista**: al seleccionar tu general o pasar el ratón por encima se ve el círculo en el que da moral a tus tropas (en rojo, el del general enemigo). Desaparece si el general cae o huye.
- **Flechas nuevas**: con punta de acero, astil de madera y plumas blancas (imagen de dominio público de OpenGameArt). Se ven nítidas al acercar la cámara y se engruesan un poco al alejarla para que las andanadas se sigan viendo. Las clavadas, en el suelo o en los soldados, quedan con la punta hundida y las plumas arriba.

## Batalla
- **Las unidades cierran filas**: si pierden hombres y no están peleando, cada par de segundos se reorganizan con los que les quedan; el frente se estrecha y ya no quedan huecos abiertos en mitad de la formación.
- **Las andanadas de arcos caen sobre toda la unidad**: cada flecha apunta a un punto al azar de la formación enemiga, con la dispersión de una lluvia de flechas, en lugar de al centro. Antes, si moría el centro de una línea, los arqueros seguían tirando al hueco sin tocar las alas. Las ballestas siguen apuntando a un soldado. El daño a distancia queda parecido; de cerca, contra líneas anchas, algo mayor.

## IA
- **El general enemigo acompaña a su ejército** y se queda cerca para que su aura de moral lo cubra.
- **Y entra en combate cuando va perdiendo**: si su ejército ha caído bastante más que el tuyo, o le queda poco, carga en cuña contra tus tropas que pelean con las suyas. Ya no se queda parado cuando le destruyen el ejército.

## Servidor
- `/salud` muestra el modo de las batallas en red (`relevo` o `arbitro`).

## Al desplegar
- Cambia la simulación (cerrar filas y andanadas): todos los jugadores tienen que recargar la página para jugar en red con la misma versión.
- Las batallas en curso se pierden al reiniciar el servidor.

---

# Rendimiento en red (15 de octubre de 2026)

## Multijugador
- **Servidor de relevo** (modo por defecto). El servidor ya no simula cada batalla: reparte los turnos, valida que cada orden mueva unidades de quien la manda y compara los resúmenes de estado de los dos navegadores. Antes, con ejércitos grandes, el plan gratis de Render (0,1 CPU) no daba abasto: medido con 20 unidades por bando, repartía 3,7 turnos por segundo de 10 y la batalla iba al 40 % de la velocidad, con saltos de hasta 900 ms. Ahora el servidor gasta 2,9 ms de CPU por segundo de batalla, frente a 221.
  - Desincronía: el servidor pide el estado al jugador de la izquierda y se lo manda al otro, con los turnos posteriores si hace falta.
  - Reconexión en combate: el estado lo da el jugador que sigue conectado; la batalla espera congelada hasta que llega.
  - Final: lo anuncia el primer navegador que detecta la derrota de un bando, con los mismos 3 s de remate.
- **Interruptor** `BATALLA_ARBITRO`: con `1` vuelve el modo árbitro de antes (el servidor simula y decide; necesita un plan con más CPU). `/salud` muestra el modo activo. Ver `servidor/LEEME.md`.
- **Colchón de turnos en el navegador.** Guarda unos 200 ms de turnos antes de simularlos y simula a ritmo constante; si internet va a trompicones, crece hasta 500 ms y vuelve a bajar cuando la conexión se estabiliza. Con una conexión irregular, la batalla pasa de 20 congelaciones en 20 s (la peor de 483 ms y hasta 15 pasos de golpe) a 2 de 200 ms y nunca más de un paso por fotograma.

## Simulación
- **1,8 veces más rápida sin cambiar ningún resultado.** Datos de unidad precalculados una vez por paso y descarte de vecinos por distancia al cuadrado antes de calcular la distancia exacta (era el 38 % del tiempo). Con 20 unidades por bando: de 4,57 a 2,51 ms por paso en Node y de unos 2 a 1,3 ms en Edge. Comprobado bit a bit con la versión anterior y entre Node, Edge, Chrome y Firefox.

## Tropas
- **Mangoneles**: solo se compran como hombres de armas, a un precio fijo de 2.000 de oro, y como mucho 2 por ejército.
- **Tropas exclusivas de cada rama** (caballeros, guardia varega, templarios, arqueros a caballo y berserkers): solo se compran como veteranos, a su precio de siempre en ese nivel, y como mucho 3 por ejército.
- Las dos reglas valen en la batalla normal, la personalizada (también para el ejército enemigo) y la multijugador, donde el servidor lo comprueba. La IA las respeta al reclutar.
- Reinos guardados de antes: las unidades de un nivel que ya no se vende y las que pasan del máximo se quitan solas y se devuelve el oro que costaron.

## Herramientas
- `galeria-skins.html`: guía para el diseñador de skins (vistas, fotogramas, escala, nombres, máscaras de color) con plantillas PNG por tropa.
- `tools/exportar-skins.js`: exporta las hojas de los sprites actuales por tropa, facción y veteranía.
- Pruebas: `npm run prueba-batalla` (árbitro) y `npm run prueba-batalla-relevo` en `servidor/`.

## Al desplegar
- Las batallas en curso se pierden al reiniciar el servidor.
- Los jugadores tienen que recargar la página: una pestaña con la versión anterior no responde a las peticiones de estado del relevo.

---

# Cambios desde la última subida a Render (13 de octubre de 2026, 13:49)

## Jugabilidad

- **Cámara con W A S D** (las flechas siguen funcionando). Para liberar esas teclas, atacar pasa a **R** y disparar a **T**. Ayuda (F1), botones y tutorial actualizados.
- **Caballería pesada menos arrolladora**: vida, daño, alcance, impulso y daño de carga rebajados; arrollar infantería pesada le cuesta impulso y el arrollado devuelve un golpe; parada en la melé pega al 65 %. Contra infantería pesada en línea gana, pero pierde unos 6 jinetes de 20; contra muro de escudos y lanceros se estrella; contra tropas ligeras y por la espalda sigue siendo letal.
- **Arqueros**: 10 % menos de daño por flecha.
- **Protección contra flechas por tropa** (`proteccionFlechas`): la infantería pesada, la guardia varega y los templarios paran el 25 % del daño de las flechas; la infantería ligera y los lanceros, que llevan escudo, el 15 % (antes nada). Los virotes de ballesta ignoran la protección.
- **Órdenes de ataque que se cumplen**: la infantería mandada contra una unidad que huye la persigue en vez de pararse. Si la interceptan por el camino, contesta el ataque y, cuando el interceptor cae o huye, sigue hacia su blanco. Solo la caballería se desentiende de quien le queda al lado para abrirse paso hacia su objetivo.
- **Atravesar aliados parados**: una unidad en marcha pasa a través de una aliada parada sin que ninguna de las dos se desplace (antes la infantería arrastraba a los arqueros que atravesaba).
- **Unidades en retirada**: huyen siempre hacia su propio borde, esquivando de lado al enemigo cercano. Antes huían «del enemigo más cercano» y, con un enemigo entre ellas y su borde, se quedaban clavadas o yendo y viniendo.
- **Mover el ejército entero con su disposición**: con **Alt** y varias unidades seleccionadas, cada una conserva su sitio respecto a las demás; si además se arrastra un rumbo, el conjunto gira hacia él (infantería delante, arqueros detrás, caballería en los flancos). Vale también en el despliegue.
- **Escaramuza de los arqueros a caballo**: escaramucear cansa y con la fatiga pierden velocidad. La caballería ligera, más rápida que ellos, los alcanza hacia los 50 s; la pesada pierde el impulso de carga persiguiéndolos y no los pilla.
- **Duelos más justos entre tropas iguales**: correr cansaba el doble de lo debido y los soldados en marcha iban siempre por detrás de su puesto, con lo que la formación contaba como rota antes del choque y quien atacaba perdía siempre. Corregidas las dos cosas.

## Tropas y ramas

- **Una exclusiva por rama, sin repetir**: cristiano **caballeros** (caballería de choque), ortodoxo **guardia varega** (hacha a dos manos, sin escudo), cruzado **templarios** (élite con escudo, moral muy alta), musulmán **arqueros a caballo**, tribus **berserkers** (rápidos, baratos, sin armadura). Cada una con su dibujo propio. Los ballesteros y la caballería ligera pasan a estar disponibles para todas las ramas.
- **Mangoneles** para todas las ramas, con un sprite nuevo con volumen (ruedas, armazón, haz de torsión, brazo con piedra y dos sirvientes): tres máquinas por unidad, en una sola fila; alcance 160 m (mínimo 35), una piedra cada 12 s, solo parados. La piedra hace daño en un radio de 3 m a todos, también a los propios, desordena y asusta. La orden abierta y el bosque reducen su efecto. No se pueden arrollar, pero apenas se defienden en cuerpo a cuerpo.
- **Insignia del tipo de tropa** junto a cada estandarte (lanza, arco, escudo, catapulta, corona del general…), con los **galones de veteranía** encima: ya se ve de qué es y de qué nivel es cada unidad, propia o enemiga.
- Si dos jugadores de la misma rama coinciden en red con el mismo blasón, el de la derecha recibe colores contrastados.

## Mapas y clima

- **Seis tipos de mapa**: campo variado, campo abierto, bosque cerrado (también en el centro), tierra de colinas, valle entre dos cordilleras y río con vados. El agua frena muchísimo, impide cargar y se pelea mal dentro; los vados son el paso. Al azar en las batallas normales y en red; elegible en la batalla personalizada.
- **Clima nuevo: nieve**. Todos más lentos y cansados, cargas más flojas, campo blanco y copos cayendo.

## Interfaz

- **Franja de órdenes compacta** encima de las tarjetas, en lugar del panel lateral derecho. Solo muestra los botones que sirven para la selección; el detalle de cada unidad sale al pasar el ratón.
- **Tutorial «Cómo se juega»**: 10 pasos con capturas reales. Se abre solo la primera vez; luego, desde el inicio o el menú.
- **Español / inglés** en cualquier momento, con el selector de abajo a la izquierda. Se recuerda la elección.
- **Efecto de impacto** de las piedras de mangonel: nube de polvo, terrones y cráter en el suelo.

## Arreglos

- Un comentario mal cerrado hacía que, desde la llegada de los mangoneles, **ninguna salpicadura de sangre** (golpes, atropellos, restos) llegara al renderizador. Restaurado.
- Dos propiedades de datos muertas (`armaduraPesada`, `conEscudo`) sustituidas por `proteccionFlechas`.

## Rendimiento y limpieza

- Revisión completa del código: ninguna función ni constante sin usar; retirados una función local, reglas CSS del panel antiguo e ids de HTML huérfanos.
- Bucle de vecinos de la simulación optimizado: en pleno contacto el paso baja de 1,98 a 1,20 ms (−40 %), con resultados idénticos bit a bit.
- Borrada la carpeta `js/retirado/` (630 líneas que nada cargaba).

## Servidor (Render se redesplegará solo al subir)

- El servidor fija el **tipo de mapa** de cada batalla en red y lo manda en la ficha, igual que el clima.
- La lista blanca de archivos servidos incluye las capturas del tutorial (`tutorial/`, español e inglés) y ya no necesita excluir `js/retirado/`.
- Al redesplegar, las batallas en curso se pierden (todo vive en memoria).
