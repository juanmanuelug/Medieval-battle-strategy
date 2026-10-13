'use strict';
/* ---------- Sprites pre-renderizados desde modelos 3D ----------
   Al empezar una batalla se construye, con Three.js, un modelo sencillo por tipo de tropa (piernas, torso con sobrevesta
   del color del reino, cabeza y yelmo, brazos, arma y escudo; caballo para los montados), se posa en cinco fotogramas
   (quieto, paso1, paso2, golpe, cadáver) y se fotografía en ocho direcciones con una cámara isométrica y luz fija. Las
   imágenes van a un canvas por equipo y tipo (8 × 5 fotogramas) del que PixiJS corta las texturas. Sin archivos de arte:
   el día que haya modelos de verdad se cargan en `construirModelo` y todo lo demás sigue igual. */
const ATLAS_PX_POR_METRO = 40;          // resolución de cada fotograma (4× la escala isométrica de 10 px/m: nítido al acercar)
const ATLAS_ANCHO = 128, ATLAS_ALTO = 176;

function generarAtlasSoldados(tipos, equipos) {
  if (typeof THREE === 'undefined') return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
  renderer.setSize(ATLAS_ANCHO, ATLAS_ALTO); renderer.setClearColor(0x000000, 0);
  const escena = new THREE.Scene();
  const anchoMundo = ATLAS_ANCHO / ATLAS_PX_POR_METRO, altoMundo = ATLAS_ALTO / ATLAS_PX_POR_METRO;
  // cámara isométrica clásica: elevación 30°, mirando hacia -z (la pantalla "abajo" es +z)
  const camara = new THREE.OrthographicCamera(-anchoMundo / 2, anchoMundo / 2, altoMundo / 2, -altoMundo / 2, 0.1, 50);
  const elev = Math.PI / 6, dist = 12;
  camara.position.set(0, Math.sin(elev) * dist + 0.9, Math.cos(elev) * dist); camara.lookAt(0, 0.9, 0);
  camara.updateMatrixWorld(); camara.updateProjectionMatrix();
  escena.add(new THREE.HemisphereLight(0xfff4e0, 0x3a4a2a, 0.95));
  const sol = new THREE.DirectionalLight(0xffffff, 0.75); sol.position.set(-3, 6, 4); escena.add(sol);
  // píxel donde cae el punto (0,0,0): ancla de los pies
  const pies = new THREE.Vector3(0, 0, 0).project(camara);
  const anclaY = (1 - pies.y) / 2;
  const materiales = {};
  const material = (color, metal) => { const k = color + ':' + (metal ? 'm' : 'd'); return materiales[k] || (materiales[k] = new THREE.MeshLambertMaterial({ color })); };
  const caja = (w, h, d, color, metal) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, metal));
  const cilindro = (r, h, color) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 8), material(color));
  const esfera = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material(color));
  // Pieza con pivote en su extremo superior (para girar piernas y brazos desde la cadera y el hombro)
  const colgante = (malla, largo) => { const g = new THREE.Group(); malla.position.y = -largo / 2; g.add(malla); return g; };

  function construirModelo(datos, colores) {
    const grupo = new THREE.Group(), partes = {};
    const montado = !!datos.montado, ligero = datos.clave === 'caballeriaLigera' || datos.clave === 'arquerosACaballo';
    const pesado = datos.clave === 'infanteriaPesada' || (montado && !ligero);
    const tirador = !!datos.alcanceTiro, ballesta = datos.clave === 'ballesteros';
    const colorCota = pesado ? 0x8e8e96 : 0x6b5a45, colorPiel = 0xd9b48a, colorMadera = 0x6b4a2a, colorAcero = 0xc8c8d0, colorCuero = 0x3a2a1a;
    let base = 0;
    if (montado) {
      const caballo = new THREE.Group(); partes.caballo = caballo;
      const colorPelo = ligero ? 0x8a6a3a : 0x5a3a21;
      // cuerpo redondeado (esfera escalada), pecho, grupa, cuello inclinado, cabeza alargada, crin y cola
      const cuerpo = esfera(0.5, colorPelo); cuerpo.scale.set(1.25, 0.6, 0.55); cuerpo.position.y = 1.02; caballo.add(cuerpo);
      const pecho = esfera(0.3, colorPelo); pecho.scale.set(0.8, 1, 0.9); pecho.position.set(0.5, 1.05, 0); caballo.add(pecho);
      const cuello = cilindro(0.16, 0.7, colorPelo); cuello.position.set(0.72, 1.4, 0); cuello.rotation.z = -0.7; caballo.add(cuello);
      const cabeza = caja(0.46, 0.24, 0.2, 0x4a2e18); cabeza.position.set(1.02, 1.62, 0); cabeza.rotation.z = -0.3; caballo.add(cabeza);
      const crin = caja(0.5, 0.1, 0.06, 0x2a1a0e); crin.position.set(0.74, 1.6, 0); crin.rotation.z = -0.7; caballo.add(crin);
      const cola = caja(0.1, 0.55, 0.1, 0x2a1a0e); cola.position.set(-0.66, 0.9, 0); cola.rotation.z = 0.5; caballo.add(cola);
      const gualdrapa = caja(0.95, 0.34, 0.6, colores.secundario); gualdrapa.position.y = 0.92; caballo.add(gualdrapa);
      const silla = caja(0.5, 0.12, 0.5, 0x3a2a1a); silla.position.y = 1.3; caballo.add(silla);
      partes.patas = [];
      for (const [px, pz] of [[0.45, 0.17], [0.45, -0.17], [-0.42, 0.17], [-0.42, -0.17]]) { const pata = colgante(cilindro(0.075, 0.85, 0x4a2e18), 0.85); pata.position.set(px, 0.85, pz); caballo.add(pata); partes.patas.push(pata); }
      grupo.add(caballo); base = 1.25;
    }
    const jinete = new THREE.Group(); jinete.position.y = base; grupo.add(jinete); partes.cuerpo = jinete;
    // piernas (en el caballo quedan abiertas y cortas)
    partes.piernas = [];
    for (const lado of [-1, 1]) { const pierna = colgante(cilindro(0.09, montado ? 0.55 : 0.75, colorCuero), montado ? 0.55 : 0.75); pierna.position.set(0, montado ? 0.55 : 0.75, lado * 0.13); if (montado) pierna.rotation.x = lado * 0.5; jinete.add(pierna); partes.piernas.push(pierna); }
    const alturaTorso = montado ? 0.55 : 0.75;
    const torso = caja(0.34, 0.6, 0.5, colorCota, pesado); torso.position.y = alturaTorso + 0.3; jinete.add(torso);
    const sobrevesta = caja(0.36, 0.5, 0.42, colores.primario); sobrevesta.position.y = alturaTorso + 0.32; jinete.add(sobrevesta);
    const franja = caja(0.37, 0.5, 0.1, colores.secundario); franja.position.y = alturaTorso + 0.32; jinete.add(franja);
    const cabeza = esfera(0.16, colorPiel); cabeza.position.y = alturaTorso + 0.78; jinete.add(cabeza);
    const yelmo = pesado ? new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.26, 10), material(0x9a9aa2)) : new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 10), material(tirador ? 0x6b5a45 : 0x9a9aa2));
    yelmo.position.y = alturaTorso + 0.9; jinete.add(yelmo);
    // brazos con pivote en el hombro; el derecho (z −) lleva el arma, el izquierdo el escudo
    const brazoArma = colgante(cilindro(0.06, 0.55, colorCota), 0.55); brazoArma.position.set(0, alturaTorso + 0.55, -0.26); jinete.add(brazoArma); partes.brazoArma = brazoArma;
    const brazoEscudo = colgante(cilindro(0.06, 0.55, colorCota), 0.55); brazoEscudo.position.set(0, alturaTorso + 0.55, 0.26); jinete.add(brazoEscudo); partes.brazoEscudo = brazoEscudo;
    const mano = new THREE.Group(); mano.position.y = -0.55; brazoArma.add(mano);
    if (datos.clave === 'lanceros') { const asta = cilindro(0.025, 2.4, colorMadera); asta.rotation.x = Math.PI / 2 * 0; asta.position.y = 0.6; mano.add(asta); const punta = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), material(colorAcero)); punta.position.y = 1.9; mano.add(punta); }
    else if (ballesta) { const cuerpo = caja(0.55, 0.06, 0.06, colorMadera); cuerpo.position.set(0.2, 0, 0); mano.add(cuerpo); const arco = caja(0.06, 0.04, 0.6, colorAcero); arco.position.set(0.42, 0, 0); mano.add(arco); }
    else if (tirador) { const arco = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 12, Math.PI), material(colorMadera)); arco.rotation.z = -Math.PI / 2; arco.position.set(0.1, 0, 0); mano.add(arco); const cuerda = caja(0.01, 0.9, 0.01, 0xe8e4d8); cuerda.position.set(0.1, 0, 0); mano.add(cuerda); }
    else { const hoja = caja(0.06, 0.95, 0.02, colorAcero); hoja.position.y = 0.45; mano.add(hoja); const cruz = caja(0.22, 0.04, 0.05, 0x8a7a3a); cruz.position.y = -0.02; mano.add(cruz); }
    if (!tirador) { const escudo = caja(0.06, 0.62, 0.46, colores.secundario); escudo.position.set(0.12, -0.3, 0.08); brazoEscudo.add(escudo); const banda = caja(0.07, 0.6, 0.1, colores.primario); banda.position.set(0.12, -0.3, 0.08); brazoEscudo.add(banda); }
    partes.grupo = grupo;
    return partes;
  }
  function posar(partes, fotograma, montado) {
    const p = partes, paso = fotograma === 'paso1' ? 1 : fotograma === 'paso2' ? -1 : 0, golpe = fotograma === 'golpe';
    if (!montado) { p.piernas[0].rotation.z = paso * 0.5; p.piernas[1].rotation.z = -paso * 0.5; }
    if (p.patas) { p.patas[0].rotation.z = paso * 0.6; p.patas[3].rotation.z = paso * 0.6; p.patas[1].rotation.z = -paso * 0.6; p.patas[2].rotation.z = -paso * 0.6; }
    p.brazoArma.rotation.z = golpe ? -2.2 : (montado ? -0.6 : -0.3 - paso * 0.3);
    p.brazoEscudo.rotation.z = golpe ? 0.6 : 0.35 + paso * 0.25;
    p.cuerpo.rotation.z = golpe ? -0.15 : 0;
    p.grupo.rotation.z = 0; p.grupo.position.y = 0;
    if (fotograma === 'cadaver') { p.brazoArma.rotation.z = -1.2; p.brazoEscudo.rotation.z = 1.2; p.grupo.rotation.z = Math.PI / 2 - 0.12; p.grupo.position.y = 0.18; }
  }
  const FOTOGRAMAS = ['quieto', 'paso1', 'paso2', 'golpe', 'cadaver'];
  const hojas = {};   // clave equipo:tipo → { canvas, columnas }
  const colorHex = n => (typeof n === 'number' ? n : parseInt(String(n).replace('#', ''), 16));
  for (let equipo = 0; equipo < equipos.length; equipo++) {
    const colores = { primario: colorHex(equipos[equipo].color), secundario: colorHex(equipos[equipo].colorSecundario) };
    for (const tipo of tipos) {
      const datos = TIPOS[TIPO[tipo]];
      const partes = construirModelo(datos, colores);
      escena.add(partes.grupo);
      const canvas = document.createElement('canvas'); canvas.width = ATLAS_ANCHO * 8; canvas.height = ATLAS_ALTO * FOTOGRAMAS.length;
      const c2d = canvas.getContext('2d');
      FOTOGRAMAS.forEach((fotograma, fila) => {
        posar(partes, fotograma, !!datos.montado);
        for (let d = 0; d < 8; d++) {
          // el modelo mira a +x; la dirección de pantalla d (0 derecha, en sentido horario) es el ángulo θ = d·45°
          partes.grupo.rotation.y = -(d * Math.PI / 4) + (fotograma === 'cadaver' ? 0 : 0);
          renderer.render(escena, camara);
          c2d.drawImage(renderer.domElement, d * ATLAS_ANCHO, fila * ATLAS_ALTO);
        }
      });
      escena.remove(partes.grupo);
      hojas[equipo + ':' + tipo] = canvas;
    }
  }
  renderer.dispose();
  return { hojas, anclaY, fotogramas: FOTOGRAMAS, ancho: ATLAS_ANCHO, alto: ATLAS_ALTO, pxPorMetro: ATLAS_PX_POR_METRO };
}
