// Exporta las hojas de referencia de los sprites actuales (5 vistas × 9 fotogramas, a 40 px/m) como PNG: una por tropa,
// facción y veteranía (leva, milicia, hombresDeArmas, veteranos y general), usando galeria-skins.html en Edge sin cabeza.
// Uso: node tools/exportar-skins.js [carpeta de salida]   (por defecto ..\batallas-medievales-skins)
const fs = require('fs'); const path = require('path');
const { withPage } = require('./headless.js');
const RAIZ = path.resolve(__dirname, '..');
const salida = path.resolve(process.argv[2] || path.join(RAIZ, '..', 'batallas-medievales-skins'));
const VETERANIAS = [[0, 'leva'], [1, 'milicia'], [2, 'hombresDeArmas'], [3, 'veteranos'], ['general', 'general']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let total = 0; const indice = [];
  await withPage(async page => {
    await page.goto('file:///' + RAIZ.replace(/\\/g, '/') + '/galeria-skins.html', 4000);
    for (let intento = 0; intento < 20 && !(await page.eval("typeof window.exportarHoja === 'function'")); intento++) await sleep(500);
    const ramas = JSON.parse(await page.eval('JSON.stringify(Object.keys(RAMAS))'));
    for (const rama of ramas) {
      const tipos = JSON.parse(await page.eval(`JSON.stringify(window.tiposDeRama('${rama}'))`));
      for (const tipo of tipos) {
        const carpeta = path.join(salida, rama, tipo); fs.mkdirSync(carpeta, { recursive: true });
        for (const [nivel, nombre] of VETERANIAS) {
          const dataUrl = await page.eval(`window.exportarHoja('${tipo}', '${rama}', ${typeof nivel === 'number' ? nivel : "'general'"})`);
          const archivo = path.join(carpeta, `${tipo}.${rama}.${nombre}.png`);
          fs.writeFileSync(archivo, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
          total++; indice.push(path.relative(salida, archivo));
        }
        console.log(rama + ' / ' + tipo + ': ' + VETERANIAS.length + ' hojas');
      }
    }
  }, { size: '1400x900', gpu: true });
  fs.writeFileSync(path.join(salida, 'LEEME.md'), `# Hojas de referencia de los sprites actuales

Una hoja PNG por tropa, facción y veteranía: filas = vistas S, SW, W, NW, N (las otras tres salen en espejo); columnas =
quieto, paso_1..4, golpe_1..3, cadaver. Escala 40 px/m (soldado de 1,8 m = 72 px). Fondo transparente, rejilla fina y rótulos.
Carpetas: <facción>/<tropa>/<tropa>.<facción>.<veteranía>.png. «general» es la variante del general (cimera y penacho).
Las vistas, fotogramas y tamaños exigidos a los skins nuevos están en galeria-skins.html del juego.

${total} hojas:

${indice.map(a => '- ' + a.replace(/\\\\/g, '/')).join('\n')}
`);
  console.log(total + ' hojas en ' + salida);
})().catch(e => { console.error(e); process.exit(1); });
