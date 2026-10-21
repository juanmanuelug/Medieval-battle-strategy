'use strict';
/* Prueba del protocolo entre navegador y servidor (2026-10-19, revisión de duplicados), sin red:
   1. todo tipo de mensaje que manda el navegador (js/juego/15-multijugador.js) lo atiende el servidor (sus `acciones`);
   2. todo tipo que atiende el servidor tiene su límite propio en LIMITE_MENSAJES (seguridad S3), no el de por defecto;
   3. los textos que manda el servidor (errores, chat del sistema, pausas rechazadas, motivos de un ejército no válido) tienen
      traducción al inglés (js/idioma-en.js), porque el navegador los traduce por texto o por patrón.
   Uso: node prueba-protocolo.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearMotor } = require('./motor.js');

const RAIZ = path.resolve(__dirname, '..');
const leer = archivo => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const fuenteServidor = leer('servidor/servidor-lobby.js'), fuenteCliente = leer('js/juego/15-multijugador.js');
let fallos = 0;
const comprobar = (bien, texto) => { console.log((bien ? 'bien  ' : 'FALLO ') + texto); if (!bien) fallos++; };

// 1 y 2: tipos de mensaje
const inicioAcciones = fuenteServidor.indexOf('  const acciones = {');
const bloqueAcciones = fuenteServidor.slice(inicioAcciones, fuenteServidor.indexOf('\n  };', inicioAcciones));
const acciones = [...bloqueAcciones.matchAll(/^ {4}([a-zA-Z]+)\s*[:(]/gm)].map(m => m[1]);
const enviados = new Set();
for (const m of fuenteCliente.matchAll(/enviar\(\{ tipo: ([^,}]+)/g)) for (const t of m[1].matchAll(/'([a-zA-Z]+)'/g)) enviados.add(t[1]);
for (const m of fuenteCliente.matchAll(/this\.enviar\(([^)]*)\)/g)) for (const t of m[1].matchAll(/tipo: '([a-zA-Z]+)'/g)) enviados.add(t[1]);
const limites = vm.runInNewContext('(' + fuenteServidor.match(/const LIMITE_MENSAJES = (\{[^}]*\})/)[1] + ')');
comprobar(acciones.length > 15 && enviados.size > 15, `${acciones.length} acciones en el servidor y ${enviados.size} tipos que manda el navegador`);
const desconocidos = [...enviados].filter(t => !acciones.includes(t));
comprobar(!desconocidos.length, 'el servidor atiende todo lo que manda el navegador' + (desconocidos.length ? ': falta ' + desconocidos.join(', ') : ''));
const sinLimite = acciones.filter(t => !(t in limites));
comprobar(!sinLimite.length, 'cada acción tiene su límite de mensajes por segundo' + (sinLimite.length ? ': falta ' + sinLimite.join(', ') : ''));

// 3: traducción de los textos del servidor, con valores de ejemplo en los que llevan datos
const contexto = { console, window: {}, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } };
vm.createContext(contexto);
for (const archivo of ['js/00-aleatorio-y-utilidades.js', 'js/00b-idioma.js', 'js/idioma-en.js']) vm.runInContext(leer(archivo), contexto, { filename: archivo });
vm.runInContext("idiomaActual = 'en';", contexto);
const traducir = texto => vm.runInContext('traducirTexto', contexto)(texto);
const motor = crearMotor(), formatoNumero = motor.ejecutar('formatoNumero'), MAX_PAUSAS = Number(fuenteServidor.match(/const MAX_PAUSAS = (\d+)/)[1]);
const textosFijos = [...fuenteServidor.matchAll(/(?:mensaje|motivo): '([^']+)'/g), ...fuenteServidor.matchAll(/rechazar\('([^']+)'\)/g)].map(m => m[1]).filter(t => t !== 'saliste' && !t.endsWith(': '));   // los que acaban en «: » llevan detrás el detalle (abajo, con datos)
const validaciones = [
  motor.validarEjercito('nadie', [{ tipo: 'lanceros', nivel: 0 }], 12000), motor.validarEjercito('cristiano', [], 12000),
  motor.validarEjercito('cristiano', Array(21).fill({ tipo: 'lanceros', nivel: 0 }), 999999), motor.validarEjercito('cristiano', [{ tipo: 'berserkers', nivel: 3 }], 12000),
  motor.validarEjercito('cristiano', [{ tipo: 'lanceros', nivel: 9 }], 12000), motor.validarEjercito('cristiano', [{ tipo: 'lanceros', nivel: 3 }], 100),
  motor.validarEjercito('cristiano', [{ tipo: 'mangoneles', nivel: 0 }], 12000), motor.validarEjercito('cristiano', Array(3).fill({ tipo: 'mangoneles', nivel: 2 }), 999999),
].filter(v => !v.ok).map(v => 'Ejército no válido: ' + v.motivo);
const conDatos = [
  'Presupuesto: ' + formatoNumero(12000) + ' de oro por jugador', 'Presupuesto: ' + formatoNumero(6000) + ' de oro por jugador',
  'Alfonso ha salido de la sala', 'Alfonso ha salido de la sala; la preparación se cancela', 'Alfonso ha entrado en la sala',
  'Orden desconocida: volar', 'Ya has usado tus ' + MAX_PAUSAS + ' pausas.', 'Alfonso prefiere seguir.',
];
const muestras = [...new Set([...textosFijos, ...conDatos, ...validaciones])];
const sinTraducir = muestras.filter(t => traducir(t) === t);
comprobar(muestras.length > 20 && validaciones.length >= 7, `${muestras.length} textos del servidor de ejemplo (${validaciones.length} de ejércitos no válidos)`);
comprobar(!sinTraducir.length, 'todos tienen traducción al inglés' + (sinTraducir.length ? ':\n      · ' + sinTraducir.join('\n      · ') : ''));
comprobar(traducir('Presupuesto: 12.000 de oro por jugador') === 'Budget: 12,000 gold per player', 'en inglés los miles van con coma: ' + traducir('Presupuesto: 12.000 de oro por jugador'));
console.log(fallos ? fallos + ' FALLOS' : 'correcto');
process.exit(fallos ? 1 : 0);
