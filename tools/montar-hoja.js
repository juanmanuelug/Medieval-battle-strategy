// Monta hojas de sprites (rejilla) y el manifest.json a partir de imágenes sueltas con nombre descriptivo.
// Nombre de cada archivo:  <tipo>_<direccion>_<animacion>[_<n>][_mascara].png   (también .jpg/.webp)
//   tipo       infanteriaLigera | infanteriaPesada | lanceros | arqueros | ballesteros | caballeriaPesada | caballeriaLigera | arquerosACaballo
//              opcionalmente con rama y nivel mínimo: tipo.rama.nivel (cristiano|ortodoxo|musulman|cruzado|tribus; leva|milicia|hombresDeArmas|veteranos)
//              p. ej. infanteriaPesada.cristiano.hombresDeArmas_S_golpe.png  o  infanteriaPesada..veteranos_S_quieto.png (cualquier rama)
//   direccion  S SW W NW N (mínimo) y opcionalmente SE E NE
//   animacion  quieto | paso | golpe | cadaver      n = orden del fotograma (1, 2, 3…); si falta, 1
//   _mascara   la misma imagen con solo la zona del color del reino (se vuelve blanca)
// Ejemplo: infanteriaPesada_S_paso_1.png, infanteriaPesada_SW_golpe.png, infanteriaPesada_S_quieto_mascara.png
// Uso: node tools/montar-hoja.js <carpeta de imágenes> [--salida arte] [--celda 96x128] [--ancla 0.5,0.92]
//        [--fondo ffffff --tolerancia 40]   quita un fondo liso de ese color (para fotos/renders sin transparencia)
//        [--alto 72]                        reescala cada fotograma para que mida ese alto en píxeles (72 = 1,8 m a 40 px/m)
//        [--pxPorMetro 40]
// Usa Edge sin cabeza (tools/headless.js) para decodificar y componer las imágenes; no necesita dependencias.
const fs = require('fs');
const path = require('path');
const { withPage } = require('./headless.js');

const argumentos = process.argv.slice(2);
const opcion = (nombre, porDefecto) => { const i = argumentos.indexOf('--' + nombre); return i >= 0 ? argumentos[i + 1] : porDefecto; };
const carpetaEntrada = argumentos.find((a, i) => !a.startsWith('--') && (i === 0 || !argumentos[i - 1].startsWith('--')));
if (!carpetaEntrada) { console.error('uso: node tools/montar-hoja.js <carpeta> [--salida arte] [--celda 96x128] [--ancla 0.5,0.92] [--fondo ffffff] [--alto 72]'); process.exit(1); }
const carpetaSalida = path.resolve(opcion('salida', path.join(__dirname, '..', 'arte')));
const [celdaAncho, celdaAlto] = opcion('celda', '96x128').split('x').map(Number);
const ancla = opcion('ancla', '0.5,0.92').split(',').map(Number);
const fondo = opcion('fondo', null);
const tolerancia = Number(opcion('tolerancia', 40));
const altoObjetivo = opcion('alto', null) ? Number(opcion('alto')) : null;
const pxPorMetro = Number(opcion('pxPorMetro', 40));

const DIRECCIONES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
const ANIMACIONES = ['quieto', 'paso', 'golpe', 'cadaver'];
const patron = /^([a-zA-Z]+(?:\.[a-zA-Z]*){0,2})_(S|SW|W|NW|N|NE|E|SE)_(quieto|paso|golpe|cadaver)(?:_(\d+))?(_mascara)?\.(png|jpg|jpeg|webp)$/i;

// agrupa: tipos[tipo] = { fotogramas: { 'S|paso|1': { imagen, mascara } }, direcciones: Set, animaciones: { paso: Set(1,2,...) } }
const tipos = {};
const ignorados = [];
for (const nombre of fs.readdirSync(carpetaEntrada)) {
  const coincidencia = nombre.match(patron);
  if (!coincidencia) { if (/\.(png|jpg|jpeg|webp)$/i.test(nombre)) ignorados.push(nombre); continue; }
  const [, tipo, direccion, animacion, numero, esMascara] = coincidencia;
  const t = tipos[tipo] = tipos[tipo] || { fotogramas: {}, direcciones: new Set(), animaciones: {} };
  const n = numero ? Number(numero) : 1;
  const clave = direccion.toUpperCase() + '|' + animacion.toLowerCase() + '|' + n;
  t.fotogramas[clave] = t.fotogramas[clave] || {};
  t.fotogramas[clave][esMascara ? 'mascara' : 'imagen'] = path.join(carpetaEntrada, nombre);
  t.direcciones.add(direccion.toUpperCase());
  const lista = t.animaciones[animacion.toLowerCase()] = t.animaciones[animacion.toLowerCase()] || new Set();
  lista.add(n);
}
if (ignorados.length) console.warn('ignorados (nombre no reconocido): ' + ignorados.join(', '));
if (!Object.keys(tipos).length) { console.error('no hay imágenes con nombre reconocible en ' + carpetaEntrada); process.exit(1); }

const aDataUrl = archivo => 'data:image/' + path.extname(archivo).slice(1).toLowerCase().replace('jpg', 'jpeg') + ';base64,' + fs.readFileSync(archivo).toString('base64');

// Se ejecuta dentro del navegador: limpia, recorta, escala y coloca cada fotograma en su celda. Devuelve las hojas en PNG.
function componerEnNavegador(parametros) {
  const { celdaAncho, celdaAlto, ancla, fondo, tolerancia, altoObjetivo, celdas, filas, columnas } = parametros;
  const cargar = src => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('imagen ilegible')); img.src = src; });
  const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // quita el fondo liso (si se pidió), blanquea las máscaras y recorta al contenido
  const limpiar = (img, esMascara) => {
    const c = lienzo(img.width, img.height); const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const datos = ctx.getImageData(0, 0, c.width, c.height); const px = datos.data;
    if (fondo) {
      const r0 = parseInt(fondo.slice(0, 2), 16), g0 = parseInt(fondo.slice(2, 4), 16), b0 = parseInt(fondo.slice(4, 6), 16);
      for (let i = 0; i < px.length; i += 4) { if (Math.abs(px[i] - r0) + Math.abs(px[i + 1] - g0) + Math.abs(px[i + 2] - b0) <= tolerancia) px[i + 3] = 0; }
    }
    if (esMascara) { for (let i = 0; i < px.length; i += 4) { if (px[i + 3] > 0) { const luz = Math.max(px[i], px[i + 1], px[i + 2]); px[i] = px[i + 1] = px[i + 2] = Math.max(140, luz); } } }
    ctx.putImageData(datos, 0, 0);
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (maxX < 0) return null;
    return { canvas: c, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  return (async () => {
    const hoja = lienzo(columnas * celdaAncho, filas * celdaAlto), hojaMascara = lienzo(columnas * celdaAncho, filas * celdaAlto);
    const avisos = [];
    for (const celda of celdas) {
      const limpio = limpiar(await cargar(celda.imagen), false);
      if (!limpio) { avisos.push('fotograma vacío en fila ' + celda.fila + ', columna ' + celda.col); continue; }
      let escala = altoObjetivo ? altoObjetivo / limpio.h : 1;
      if (limpio.w * escala > celdaAncho || limpio.h * escala > celdaAlto) { escala = Math.min(celdaAncho / limpio.w, celdaAlto / limpio.h); avisos.push('fotograma fila ' + celda.fila + ', columna ' + celda.col + ' reducido a ' + escala.toFixed(2) + ' para caber en la celda'); }
      const destinoX = celda.col * celdaAncho + ancla[0] * celdaAncho - limpio.w * escala / 2, destinoY = celda.fila * celdaAlto + ancla[1] * celdaAlto - limpio.h * escala;
      // la máscara se recorta con el mismo marco que la imagen para que coincidan píxel a píxel
      const pintar = (destino, fuente) => { const ctx = destino.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(fuente, limpio.x, limpio.y, limpio.w, limpio.h, destinoX, destinoY, limpio.w * escala, limpio.h * escala); };
      pintar(hoja, limpio.canvas);
      if (celda.mascara) { const m = limpiar(await cargar(celda.mascara), true); if (m) pintar(hojaMascara, m.canvas); }
    }
    return { hoja: hoja.toDataURL('image/png'), mascara: hojaMascara.toDataURL('image/png'), avisos };
  })();
}

(async () => {
  fs.mkdirSync(carpetaSalida, { recursive: true });
  const rutaManifest = path.join(carpetaSalida, 'manifest.json');
  const manifest = fs.existsSync(rutaManifest) ? JSON.parse(fs.readFileSync(rutaManifest, 'utf8')) : { pxPorMetro, tipos: {} };
  manifest.tipos = manifest.tipos || {};
  await withPage(async page => {
    await page.goto('about:blank', 100);
    for (const [tipo, t] of Object.entries(tipos)) {
      const direcciones = DIRECCIONES.filter(d => t.direcciones.has(d));
      const faltan = ['S', 'SW', 'W', 'NW', 'N'].filter(d => !t.direcciones.has(d));
      if (faltan.length) console.warn(tipo + ': faltan las direcciones ' + faltan.join(', ') + ' (el juego las necesita; se monta igual)');
      // columnas: quieto…, paso…, golpe…, cadaver…, en ese orden
      const columnas = []; const animaciones = {};
      for (const a of ANIMACIONES) { if (!t.animaciones[a]) continue; const numeros = [...t.animaciones[a]].sort((x, y) => x - y); animaciones[a] = numeros.map(n => { columnas.push(a + '|' + n); return columnas.length - 1; }); }
      for (const a of ['quieto', 'cadaver']) if (!animaciones[a]) console.warn(tipo + ': no hay fotograma «' + a + '» (el juego usará el primero que haya)');
      if (!animaciones.quieto) animaciones.quieto = [0];
      if (!animaciones.cadaver) animaciones.cadaver = [columnas.length - 1];
      const celdas = [];
      direcciones.forEach((d, fila) => columnas.forEach((c, col) => {
        const f = t.fotogramas[d + '|' + c];
        if (!f || !f.imagen) { console.warn(tipo + ': falta ' + d + ' ' + c.replace('|', ' ')); return; }
        celdas.push({ fila, col, imagen: aDataUrl(f.imagen), mascara: f.mascara ? aDataUrl(f.mascara) : null });
      }));
      const hayMascara = celdas.some(c => c.mascara);
      const parametros = { celdaAncho, celdaAlto, ancla, fondo, tolerancia, altoObjetivo, celdas, filas: direcciones.length, columnas: columnas.length };
      const resultado = await page.eval('(' + componerEnNavegador.toString() + ')(' + JSON.stringify(parametros) + ')');
      resultado.avisos.forEach(a => console.warn(tipo + ': ' + a));
      const nombreArchivo = tipo.replace(/\.+$/, '').replace(/\.\./g, '.').replace(/\./g, '_');
      fs.writeFileSync(path.join(carpetaSalida, nombreArchivo + '.png'), Buffer.from(resultado.hoja.split(',')[1], 'base64'));
      if (hayMascara) fs.writeFileSync(path.join(carpetaSalida, nombreArchivo + '_mascara.png'), Buffer.from(resultado.mascara.split(',')[1], 'base64'));
      const entrada = { hoja: nombreArchivo + '.png', celda: [celdaAncho, celdaAlto], ancla, direcciones, animaciones };
      if (hayMascara) entrada.mascara = nombreArchivo + '_mascara.png';
      if (pxPorMetro !== (manifest.pxPorMetro || 40)) entrada.pxPorMetro = pxPorMetro;
      manifest.tipos[tipo] = entrada;
      console.log(tipo + ': hoja de ' + direcciones.length + ' direcciones × ' + columnas.length + ' fotogramas' + (hayMascara ? ' con máscara' : '') + ' → ' + path.join(carpetaSalida, nombreArchivo + '.png'));
    }
  }, { size: '800x600', gpu: false });
  fs.writeFileSync(rutaManifest, JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest actualizado: ' + rutaManifest + ' (' + Object.keys(manifest.tipos).length + ' tipos). Para abrir el juego como archivo local: node tools/empaquetar-arte.js');
})().catch(e => { console.error('FALLO: ' + e.message); process.exit(1); });
