// Copia del diseñador de estandartes los módulos que el juego necesita para pintar un blasón importado (catálogos y
// motor SVG) y las figuras por partes. Se vuelve a ejecutar cuando cambie el diseñador.
// Uso: node tools/copiar-disenador.js
const fs = require('fs');
const path = require('path');
const origen = 'C:/Users/juanm/disenador-estandartes';
const destino = path.join(__dirname, '..');
const modulos = ['00-utilidades-base.js', '01-catalogo-de-formas.js', '02-catalogo-de-patrones-particiones-y-pieza.js', '03c-indice-figuras.js', '03-catalogo-de-simbolos-y-figuras.js', '03b-ordenes-militares.js', '05-render-svg.js'];
fs.mkdirSync(path.join(destino, 'disenador', 'js'), { recursive: true });
fs.mkdirSync(path.join(destino, 'figuras'), { recursive: true });
let total = 0;
for (const m of modulos) { fs.copyFileSync(path.join(origen, 'js', m), path.join(destino, 'disenador', 'js', m)); total++; }
for (const f of fs.readdirSync(path.join(origen, 'figuras'))) { fs.copyFileSync(path.join(origen, 'figuras', f), path.join(destino, 'figuras', f)); total++; }
console.log('copiados', total, 'archivos del diseñador');
