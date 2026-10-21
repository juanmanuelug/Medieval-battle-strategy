'use strict';
/* ---------- Utilidades y azar determinista ----------
   La simulación nunca usa Math.random: todo el azar sale de un generador con semilla (mulberry32), así dos clientes
   con la misma semilla y las mismas órdenes reproducen la misma batalla (base del multijugador por lockstep). */
function crearAleatorio(semilla) {
  let estado = semilla >>> 0;
  const siguiente = () => {
    estado = (estado + 0x6D2B79F5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: siguiente,                                   // [0, 1)
    entre: (minimo, maximo) => minimo + siguiente() * (maximo - minimo),
    entero: (minimo, maximo) => minimo + Math.floor(siguiente() * (maximo - minimo + 1)),
    // para copiar una simulación entera (multijugador: reenvío del estado y reconexión)
    leerEstado: () => estado,
    fijarEstado: valor => { estado = valor >>> 0; },
  };
}
const limitar = (valor, minimo, maximo) => valor < minimo ? minimo : valor > maximo ? maximo : valor;
const distancia = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
// ángulo llevado a (-π, π] (la simulación y la IA comparan rumbos con esto)
const normalizarAngulo = angulo => { while (angulo > Math.PI) angulo -= 2 * Math.PI; while (angulo < -Math.PI) angulo += 2 * Math.PI; return angulo; };
// color '#rrggbb' → entero 0xrrggbb (las ramas y los blasones guardan los colores como texto; PIXI y los muñecos, como número)
const hexAEntero = color => parseInt(color.slice(1), 16);
const enteroAHex = numero => '#' + (numero >>> 0).toString(16).padStart(6, '0');
// segundos (enteros) → «m:ss»
const minutosYSegundos = segundos => Math.floor(segundos / 60) + ':' + String(segundos % 60).padStart(2, '0');
// número con separador de miles a la española (12.000); en inglés lo pasa a 12,000 la traducción (idioma-en.js, conMiles)
const formatoNumero = n => n.toLocaleString('es-ES');
/* localStorage puede fallar (ventana privada, cuota llena, almacenamiento bloqueado) y ninguno de estos lanza: leer da lo
   guardado (null si no hay nada) o siFalla si no se puede leer; guardar devuelve false si no se puede. leerLocalJSON y
   guardarLocal con un objeto pasan por JSON. */
const leerLocal = (clave, siFalla = null) => { try { return localStorage.getItem(clave); } catch (e) { return siFalla; } };
const leerLocalJSON = (clave, siFalla = null) => { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return siFalla; } };
const guardarLocal = (clave, valor) => { try { localStorage.setItem(clave, typeof valor === 'string' ? valor : JSON.stringify(valor)); return true; } catch (e) { return false; } };
const borrarLocal = clave => { try { localStorage.removeItem(clave); } catch (e) {} };
// Se llama `elemento` y no `$` para no chocar con el `$` del motor del diseñador de estandartes, que el juego también carga
const elemento = selector => document.querySelector(selector);
