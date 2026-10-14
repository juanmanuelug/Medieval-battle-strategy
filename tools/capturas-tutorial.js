// Capturas del tutorial (2026-10-13): abre el juego en Edge sin cabeza, recorre las pantallas y guarda en tutorial/ una imagen
// JPEG por paso (las usa js/juego/16-tutorial.js). Hay que rehacerlas cuando cambie la interfaz.
// Uso: node tools/capturas-tutorial.js
const fs = require('fs');
const path = require('path');
const { withPage } = require('./headless.js');
const RAIZ = path.resolve(__dirname, '..');
// node tools/capturas-tutorial.js en → capturas con la interfaz en inglés, en tutorial/en/
const IDIOMA = process.argv[2] === 'en' ? 'en' : 'es';
const SALIDA = path.join(RAIZ, 'tutorial', IDIOMA === 'en' ? 'en' : '');
const ANCHO = 1280, ALTO = 800;
const esperar = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(SALIDA, { recursive: true });

async function capturar(page, nombre, recorte) {
  await page.eval("(()=>{const a=document.getElementById('aviso-pausa');if(a)a.style.display='none';return 1})()");   // el rótulo PAUSA no sale en las capturas
  const r = await page.send('Page.captureScreenshot', Object.assign({ format: 'jpeg', quality: 78 }, recorte ? { clip: Object.assign({ scale: 1 }, recorte) } : {}));
  fs.writeFileSync(path.join(SALIDA, nombre + '.jpg'), Buffer.from(r.data, 'base64'));
  console.log('captura', nombre);
}
const clic = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)}).click();1`);
const encuadrar = (page, x, y, zoom) => page.eval(`(()=>{const c=window.controlCamaraIso,w=document.querySelector('#escenario canvas').getBoundingClientRect();c.mundo.scale.set(${zoom});c.mundo.position.set(w.width/2-c.aPantallaX(${x},${y})*${zoom},w.height/2-c.aPantallaY(${x},${y})*${zoom});return 1})()`);

(async () => {
  await withPage(async page => {
    await page.goto('file:///' + RAIZ.replace(/\\/g, '/') + '/juego.html', 2500);
    await page.eval("window.confirm=()=>true;localStorage.clear();localStorage.setItem('batallas.tutorialVisto.v1','1');localStorage.setItem('batallas.idioma.v1','" + IDIOMA + "');1");
    await clic(page, '#btn-inicio-nuevo'); await esperar(300);
    await page.eval("document.getElementById('in-nombre-reino').value='Castilla';document.getElementById('in-nombre-rey').value='Alfonso';document.getElementById('form-reino').requestSubmit();1"); await esperar(700);
    // 1. ramas
    await clic(page, '#btn-menu-personalizada'); await esperar(1500);
    await capturar(page, '1-ramas');
    // 2. tienda
    await clic(page, '[data-rama=cristiano]'); await esperar(1500);
    for (const [t, n] of [['infanteriaPesada', 1], ['lanceros', 1], ['arqueros', 1], ['caballeriaPesada', 1], ['infanteriaLigera', 0]]) await page.eval(`document.querySelector('.btn-comprar[data-tipo=${t}][data-nivel="${n}"]').click();1`);
    await esperar(400); await capturar(page, '2-tienda');
    // 3. despliegue (batalla personalizada para fijar el clima despejado y el campo variado)
    await page.eval("document.getElementById('sel-actitud').value='ofensiva';document.getElementById('sel-actitud').dispatchEvent(new Event('change'));1");
    await clic(page, '#btn-batalla'); await esperar(400);
    await page.eval("var s=document.getElementById('sel-rama-ia');s.value='cruzado';s.dispatchEvent(new Event('change'));var k=document.getElementById('sel-clima');k.value='despejado';k.dispatchEvent(new Event('change'));var m=document.getElementById('sel-mapa');m.value='mixto';m.dispatchEvent(new Event('change'));1"); await esperar(200);
    for (const [t, n] of [['infanteriaPesada', 1], ['templarios', 1], ['arqueros', 1], ['lanceros', 1], ['caballeriaPesada', 1]]) await page.eval(`document.querySelector('.btn-anadir-ia[data-tipo=${t}][data-nivel="${n}"]').click();1`);
    await clic(page, '#btn-personalizada-batalla'); await esperar(4500);
    await clic(page, '#btn-discurso-cerrar'); await esperar(300);
    await page.eval("batalla.seleccionar([batalla.unidadesJugador[1]]);1"); await esperar(600);
    await capturar(page, '3-despliegue');
    // 4. mover: empezar, pausar y dar una orden de movimiento a la infantería (se ve el destino)
    await clic(page, '#btn-b-comenzar'); await esperar(200);
    await page.eval("batalla.fijarPausa(true);const u=batalla.unidadesJugador.filter(u=>!u.esGeneral&&!u.stats.montado);batalla.seleccionar(u);batalla.moverSeleccion(u[0].origenX+45,u[0].origenY,0,'andar');1"); await esperar(300);
    const centro = JSON.parse(await page.eval("JSON.stringify((()=>{const u=batalla.unidadesJugador;return [u.reduce((s,v)=>s+v.origenX,0)/u.length+20,u.reduce((s,v)=>s+v.origenY,0)/u.length]})())"));
    await encuadrar(page, centro[0], centro[1], 1.3); await esperar(700);
    await capturar(page, '4-mover');
    // 5. combate: todos al ataque hasta el choque; se captura de cerca con la franja de órdenes
    await page.eval("batalla.seleccionar(batalla.unidadesJugador.filter(u=>!u.esGeneral));batalla.ordenSeleccion('avanzar','correr');batalla.fijarPausa(false);batalla.velocidad(2);1");
    for (let k = 0; k < 120; k++) { await esperar(500); if (await page.eval("batalla.unidadesJugador.some(u=>u.luchando>8)")) break; }
    await esperar(2500);
    await page.eval("batalla.fijarPausa(true);1");
    const melee = JSON.parse(await page.eval("JSON.stringify((()=>{const u=batalla.unidadesJugador.filter(u=>u.luchando>0).sort((a,b)=>b.luchando-a.luchando)[0]||batalla.unidadesJugador[0];batalla.seleccionar([u]);return [u.centroX,u.centroY]})())"));
    await encuadrar(page, melee[0], melee[1], 3.2); await esperar(700);
    await capturar(page, '5-combate');
    // 6. formaciones: la franja de órdenes con una infantería en muro de escudos
    await page.eval("(()=>{const u=batalla.unidadesJugador.find(u=>u.vivos>0&&!u.stats.montado&&!u.stats.alcanceTiro);batalla.seleccionar([u]);batalla.formarSeleccion('muro');return 1})()"); await esperar(600);
    await capturar(page, '6-formaciones', { x: 0, y: ALTO - 230, width: ANCHO, height: 230 });
    // 7. moral: la batalla sigue hasta que alguna unidad huye (estandarte que parpadea en blanco)
    await page.eval("batalla.seleccionar([]);batalla.fijarPausa(false);1");
    for (let k = 0; k < 120; k++) { await esperar(500); if (await page.eval("batalla.sim.unidades.some(u=>u.huyendo&&u.vivos>5)")) break; }
    await esperar(600); await page.eval("batalla.fijarPausa(true);1");
    const huye = JSON.parse(await page.eval("JSON.stringify((()=>{const u=batalla.sim.unidades.find(u=>u.huyendo&&u.vivos>5)||batalla.sim.unidades[0];return [u.centroX,u.centroY]})())"));
    await encuadrar(page, huye[0], huye[1], 2.6); await esperar(700);
    await capturar(page, '7-moral');
    // 8. vista general y minimapa
    await page.eval("window.controlCamaraIso.encuadrar();1"); await esperar(700);
    await capturar(page, '8-camara');
  }, { size: ANCHO + 'x' + ALTO, gpu: true, idioma: IDIOMA });

  // 9. tipos de tropa: una muestra de cada tipo, en fila, con su insignia
  await withPage(async page => {
    await page.goto('file:///' + RAIZ.replace(/\\/g, '/') + '/juego.html', 2500);
    await page.eval("window.confirm=()=>true;localStorage.clear();localStorage.setItem('batallas.tutorialVisto.v1','1');localStorage.setItem('batallas.idioma.v1','" + IDIOMA + "');1");
    await clic(page, '#btn-inicio-nuevo'); await esperar(300);
    await page.eval("document.getElementById('in-nombre-reino').value='Castilla';document.getElementById('in-nombre-rey').value='Alfonso';document.getElementById('form-reino').requestSubmit();1"); await esperar(700);
    await clic(page, '#btn-menu-personalizada'); await esperar(300);
    await clic(page, '[data-rama=cristiano]'); await esperar(1200);
    for (const t of ['lanceros', 'infanteriaPesada', 'infanteriaLigera', 'arqueros', 'ballesteros', 'caballeriaPesada', 'mangoneles']) await page.eval(`(()=>{const b=document.querySelector('.btn-comprar[data-tipo=${t}][data-nivel="1"]');b.disabled=false;b.click();return 1})()`);
    await clic(page, '#btn-batalla'); await esperar(400);
    await page.eval("var s=document.getElementById('sel-rama-ia');s.value='musulman';s.dispatchEvent(new Event('change'));var k=document.getElementById('sel-clima');k.value='despejado';k.dispatchEvent(new Event('change'));var m=document.getElementById('sel-mapa');m.value='abierto';m.dispatchEvent(new Event('change'));1"); await esperar(200);
    await page.eval("document.querySelector('.btn-anadir-ia[data-tipo=arquerosACaballo][data-nivel=\"1\"]').click();1");
    await clic(page, '#btn-personalizada-batalla'); await esperar(4500);
    await clic(page, '#btn-discurso-cerrar'); await clic(page, '#btn-b-comenzar'); await page.eval("batalla.fijarPausa(true);1");
    // en fila, separadas, mirando a la cámara
    await page.eval("(()=>{const s=batalla.sim,u=batalla.unidadesJugador.filter(u=>!u.esGeneral);u.forEach((v,k)=>{const fila=k<4?0:1,col=k<4?k:k-4+0.5;s.recolocarUnidad(v,120+col*13+fila*16,200-col*13+fila*16,Math.PI/4)});return 1})()");
    const fila = JSON.parse(await page.eval("JSON.stringify((()=>{const u=batalla.unidadesJugador.filter(u=>!u.esGeneral);return [u.reduce((s,v)=>s+v.origenX,0)/u.length,u.reduce((s,v)=>s+v.origenY,0)/u.length]})())"));
    await encuadrar(page, fila[0], fila[1] + 2, 1.05); await esperar(800);
    await capturar(page, '9-tropas');
  }, { size: ANCHO + 'x' + ALTO, gpu: true, idioma: IDIOMA });
  console.log('capturas en', SALIDA);
})();
