// Prepara una copia limpia del proyecto para subirla a mano a GitHub (y de ahí a Render): todo menos node_modules.
// Uso: node tools/preparar-subida.js   →   crea (o rehace) ..\batallas-medievales-subida
// En GitHub: «Add file» → «Upload files» y arrastrar el CONTENIDO de esa carpeta (no la carpeta en sí).
const fs = require('fs');
const path = require('path');
const ORIGEN = path.resolve(__dirname, '..');
const DESTINO = path.resolve(ORIGEN, '..', 'batallas-medievales-subida');
const EXCLUIR = new Set(['node_modules', '.git', 'Thumbs.db', '.DS_Store']);

// se vacía el contenido (no la carpeta: si está abierta en el Explorador o en una consola, Windows no deja borrarla)
fs.mkdirSync(DESTINO, { recursive: true });
for (const nombre of fs.readdirSync(DESTINO)) fs.rmSync(path.join(DESTINO, nombre), { recursive: true, force: true });
let archivos = 0, bytes = 0;
(function copiar(desde, hasta) {
  fs.mkdirSync(hasta, { recursive: true });
  for (const entrada of fs.readdirSync(desde, { withFileTypes: true })) {
    if (EXCLUIR.has(entrada.name)) continue;
    if (entrada.name === 'sonido' || entrada.name === '12-sonido.js') continue;   // sonido con muestras: desactivado y sin subir (2026-10-14)
    if (desde === ORIGEN && /^(muestra|comparativa|galeria)-.*\.png$/.test(entrada.name)) continue;   // capturas de trabajo: no hacen falta para jugar
    const a = path.join(desde, entrada.name), b = path.join(hasta, entrada.name);
    if (entrada.isDirectory()) copiar(a, b);
    else { fs.copyFileSync(a, b); archivos++; bytes += fs.statSync(a).size; }
  }
})(ORIGEN, DESTINO);
console.log(`Copia lista en ${DESTINO}: ${archivos} archivos, ${(bytes / 1048576).toFixed(1)} MB.`);
if (archivos > 100) console.log('Aviso: GitHub admite como mucho 100 archivos por subida desde la web; súbelos en varias tandas.');
