# Servidor multijugador de Batallas medievales

Paso 1 del multijugador: **lobby con salas y matchmaking**. Es un servidor WebSocket pequeño en Node.js, sin base de datos (todo vive en memoria mientras está encendido). Además sirve los archivos del juego, para que otro jugador de tu red no tenga que copiarlos (solo lo que el juego carga, con una lista blanca en `servidor-lobby.js` (`RUTAS_PUBLICAS`): `juego.html`, los CSS, `js/`, `disenador/`, `figuras/` y el arte de `arte/`. Nunca la carpeta `servidor/`, el README, `tools/`, las capturas ni nada fuera de la carpeta del juego. Si el juego empieza a cargar un archivo nuevo de otra carpeta, hay que añadirlo a la lista).

## Arrancarlo

La forma más sencilla en Windows: **doble clic en `arrancar-servidor.cmd`**. Instala lo que falte la primera vez y deja el servidor escuchando en el puerto 8787; se para cerrando la ventana.

Desde una terminal:

```
cd servidor
node servidor-lobby.js
```

Si en PowerShell `npm` da el error «npm.ps1 no está firmado digitalmente», es la política de ejecución de scripts de PowerShell. No hace falta cambiarla: usa `npm.cmd` en vez de `npm` (por ejemplo `npm.cmd install`, `npm.cmd start`), o arranca con `node servidor-lobby.js` como arriba.

Otro puerto: `node servidor-lobby.js 9000`, o la variable de entorno `PORT` (la usan los alojamientos en la nube).

## Jugar en tu red (sin copiar nada)

El servidor también sirve el juego. Al arrancar, la ventana muestra las direcciones, por ejemplo:

```
el juego, en este equipo:  http://localhost:8787/
el juego, en tu red:       http://192.168.1.129:8787/
```

- **Tú** abres `http://localhost:8787/` en el navegador.
- **Quien juegue contigo en tu misma red** (misma Wi-Fi) abre `http://TU-IP:8787/`. No necesita copiar la carpeta del juego.
- En **Multijugador** la dirección del servidor ya viene puesta: basta con pulsar **Conectar**.

La IP la da el router y puede cambiar de un día a otro: la ventana del servidor muestra siempre la actual. Si el otro equipo no conecta, revisa que el cortafuegos de Windows permita a Node.js recibir conexiones.

Los reinos se guardan en el navegador de cada uno y por dirección: el reino creado abriendo `juego.html` como archivo no aparece al abrir `http://localhost:8787/` (hay que crear otro o seguir usando el archivo).

También se puede seguir abriendo `juego.html` como archivo y escribir a mano la dirección del servidor (`ws://localhost:8787` o `ws://TU-IP:8787`).

Desde internet hará falta publicar el servidor (paso 5 del plan).

El nombre que ve el resto es el de tu rey o reina.

## Qué se puede hacer

- **Crear una sala**, pública (sale en la lista) o privada (solo se entra con su código de 6 letras).
- **Unirse** desde la lista o escribiendo el código que te pase un amigo.
- **Buscar partida**: el servidor te empareja con el siguiente jugador que también lo pulse y os mete en una sala.
- En la sala: chat, presupuesto por jugador (lo elige el anfitrión) y botón **Listo**.
- Con los dos listos empieza la **preparación**: el servidor fija semilla, clima y lados (el anfitrión, a la izquierda) y cada jugador elige rama y recluta su ejército con ese presupuesto. Al confirmarlo, el servidor lo valida con el código del juego (`motor.js`) y, con los dos confirmados, manda a ambos la ficha de la batalla y empieza la batalla en red.
- **Batalla en red**: despliegue a la vez y a ciegas (cada uno en su lado, sin ver al rival hasta empezar; empieza cuando los dos pulsan «Comenzar» o a los 120 s), sin pausa ni velocidad. El de la derecha ve el campo girado, con su ejército abajo a la izquierda. Las órdenes van al servidor, que las aplica a su propia simulación y las reparte en turnos de 100 ms; los dos navegadores simulan lo mismo. Si el estado de un navegador se desvía del servidor, el servidor le manda el suyo y se corrige solo. Si alguien pierde la conexión, la batalla se congela hasta 60 s mientras su navegador se reconecta solo (también vale recargar la página y volver a conectar en Multijugador). Se puede pedir una pausa al rival (botón de pausa o P), que la acepta o no; 3 por jugador, de hasta 2 minutos. El servidor decide el final (derrota, rendición o abandono si alguien sale o no vuelve a tiempo) y la sala vuelve a la espera para otra partida. Las partidas en red no cambian el reino.

## Prueba

`npm run prueba` lanza el servidor en el puerto 8899 y lo recorre con clientes simulados (salas, códigos, privadas, chat, listos, matchmaking, cancelar y desconexiones). `npm run prueba-batalla` juega batallas en red con dos clientes que simulan como el navegador (unos 3 minutos: una batalla entera).

## Protocolo

Mensajes JSON `{ tipo, ... }`. Están descritos al principio de `servidor-lobby.js`.

## Publicar en Render (gratis, encendido 24/7)

Un solo servicio de Render sirve el juego y las partidas en red; un «despertador» externo gratuito evita que se duerma.
Render da 750 horas gratis al mes (un mes son como mucho 744): no crees otros servicios gratis en la misma cuenta.

1. **Preparar la copia para subir**: `node tools/preparar-subida.js` deja en `..\batallas-medievales-subida` todo el
   proyecto menos `node_modules` (Render instala las dependencias él solo).
2. **GitHub**: crea un repositorio **privado** (por ejemplo `batallas-medievales`), vacío, sin README. En la página del
   repositorio: «uploading an existing file» y arrastra el **contenido** de `batallas-medievales-subida` (no la carpeta en
   sí; son menos de 100 archivos, el máximo por subida desde la web). «Commit changes».
3. **Render**: entra en https://dashboard.render.com con tu cuenta de GitHub → **New** → **Blueprint** → da acceso a
   Render a ese repositorio (puede ser solo ese) → elígelo. Render lee `render.yaml` (servicio web gratuito en
   Frankfurt, `npm ci --prefix servidor`, `node servidor/servidor-lobby.js`, comprobación en `/salud`) → **Apply**.
   En un par de minutos queda en `https://batallas-medievales.onrender.com` (o con un sufijo si el nombre está cogido).
4. **Despertador**: en https://uptimerobot.com (gratis) → **Add New Monitor** → tipo **HTTP(s)** → URL
   `https://…onrender.com/salud` → intervalo **5 minutos**. Así el servicio recibe visitas siempre y no se duerme (Render
   lo apaga tras 15 minutos sin ninguna). Vale también https://cron-job.org cada 10 minutos.
5. **Probar**: abre la dirección de Render. El reino se guarda por dirección, así que ahí hay que crear uno nuevo.
   En Multijugador la dirección del servidor ya viene puesta (`wss://…onrender.com`): Conectar.

**Actualizar**: vuelve a ejecutar `node tools/preparar-subida.js` y sube a GitHub los archivos cambiados (se
sobrescriben); Render vuelve a desplegar solo. Mientras despliega, las batallas en curso se pierden.

**Límites del plan gratuito**: todo vive en memoria, así que si Render reinicia el servicio (despliegues, mantenimiento)
se pierden las salas y batallas en curso. Si el despertador falla y el servicio se duerme, la primera visita tarda un
minuto en arrancarlo. Render indica que el plan gratuito no está pensado para producción.

`/salud` devuelve `{ ok, version, arrancado, jugadores, salas, enCola }`: sirve también para ver si hay gente jugando.
