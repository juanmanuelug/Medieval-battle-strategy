// Empaqueta arte/manifest.json en arte/manifest.js con las hojas PNG incrustadas como data: URL.
// Hace falta para abrir juego.html como archivo local (file://): el navegador no deja que WebGL use imágenes
// cargadas desde el disco (las trata como de otro origen), pero sí las incrustadas. Publicado en Netlify basta el .json.
// Uso: node tools/empaquetar-arte.js [carpeta]   (por defecto arte/)
const fs = require('fs');
const path = require('path');
const carpeta = path.resolve(process.argv[2] || path.join(__dirname, '..', 'arte'));
const rutaManifest = path.join(carpeta, 'manifest.json');
if (!fs.existsSync(rutaManifest)) { console.error('no existe ' + rutaManifest); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(rutaManifest, 'utf8'));
let bytesTotales = 0;
for (const [clave, tipo] of Object.entries(manifest.tipos || {})) {
  for (const campo of ['hoja', 'mascara', 'mascara2']) {
    const nombre = tipo[campo];
    if (!nombre || nombre.startsWith('data:')) continue;
    const rutaImagen = path.join(carpeta, nombre);
    if (!fs.existsSync(rutaImagen)) { console.error(clave + ': falta ' + nombre); process.exit(1); }
    const datos = fs.readFileSync(rutaImagen);
    bytesTotales += datos.length;
    tipo[campo] = 'data:image/png;base64,' + datos.toString('base64');
  }
}
const salida = path.join(carpeta, 'manifest.js');
fs.writeFileSync(salida, '// generado por tools/empaquetar-arte.js a partir de manifest.json; no editar a mano\nwindow.ARTE_MANIFEST = ' + JSON.stringify(manifest) + ';\n');
console.log('escrito ' + salida + ' con ' + Object.keys(manifest.tipos || {}).length + ' tipos y ' + Math.round(bytesTotales / 1024) + ' KB de imágenes incrustadas');
