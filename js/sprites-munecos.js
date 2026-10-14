'use strict';
/* ---------- Sprites «muñeco» (chibi) en Canvas 2D ----------
   Estilo elegido por el usuario el 2026-10-09: cabeza grande, cuerpo compacto, formas redondas, dos tonos planos (lado
   derecho en sombra), contorno grueso y un brillo. Se dibuja a S píxeles por metro (el juego usa S = 40 y reduce a 0,25).

   Ocho direcciones (0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE): se dibujan cinco vistas (S, SW, W, NW, N) y las otras tres
   en espejo; en el espejo la heráldica se vuelve a voltear para que el blasón no salga invertido.
   Fotogramas: quieto · paso1..paso4 · golpe1..golpe3 · cadaver.
   Heráldica: si EQUIPOS[equipo].blason = { escudo, campo } (canvas del diseñador: blasón completo y solo el campo), el escudo
   lleva el blasón entero y la sobrevesta y la gualdrapa el campo (cuartelado, partido…). Si no, los dos esmaltes planos.

   dibujarMuneco2D({ equipo, datos, direccion, fotograma, S, rama, nivel, general, portador }) → { canvas, anclaX, anclaY }
   (portador = en vez de arma lleva un estandarte de mano del tamaño de una lanza con el blasón; caído junto a su cadáver)
   (ancla = posición de los pies dentro del canvas, en píxeles). */

const PALETA_MUNECO = { contorno: '#1a1410', piel: '#e8c49a', pielOscura: '#c79a6c', acero: '#c9c9d2', aceroOscuro: '#8a8a96', placas: '#e4e4ee', cuero: '#6b4a2a', cueroOscuro: '#4a3321', bota: '#2a1a0e', oro: '#d9b23a', oroOscuro: '#8a7a3a', madera: '#8a5a30', lino: '#efe8d6', gambeson: '#b8a77c', pielAnimal: '#7a5a3a', pelo: '#3a2a1a', hoja: '#dcdce6' };

// Parámetros de cada vista (S, SW, W, NW, N). Las coordenadas x van en metros (× S); `espejo` se aplica aparte.
const VISTAS_MUNECO = {
  S:  { anchoCuerpo: 1.0,  cara: 'frente', escudoX: 0.56,  escudoAncho: 1.0,  escudoDetras: false, armaX: -0.56, armaDetras: false, cabezaDx: 0,     brazoIzq: -0.5, brazoDer: 0.5 },
  SW: { anchoCuerpo: 0.88, cara: 'frente', escudoX: -0.3,  escudoAncho: 0.8,  escudoDetras: false, armaX: 0.42,  armaDetras: true,  cabezaDx: -0.06, brazoIzq: -0.42, brazoDer: 0.44 },
  W:  { anchoCuerpo: 0.64, cara: 'perfil', escudoX: -0.34, escudoAncho: 0.5,  escudoDetras: false, armaX: 0.22,  armaDetras: true,  cabezaDx: -0.12, brazoIzq: -0.3,  brazoDer: 0.3 },
  NW: { anchoCuerpo: 0.88, cara: 'nuca',   escudoX: -0.4,  escudoAncho: 0.75, escudoDetras: true,  armaX: 0.4,   armaDetras: true,  cabezaDx: -0.04, brazoIzq: -0.42, brazoDer: 0.44 },
  N:  { anchoCuerpo: 1.0,  cara: 'nuca',   escudoX: -0.5,  escudoAncho: 0.95, escudoDetras: true,  armaX: 0.5,   armaDetras: true,  cabezaDx: 0,     brazoIzq: -0.5, brazoDer: 0.5 },
};
// inclinación en reposo del arma de mano y ángulo de la estocada de la lanza (radianes) por vista
const ARMA_POR_VISTA = { S: { reposo: -0.5, estocada: 1.1 }, SW: { reposo: -0.5, estocada: -1.2 }, W: { reposo: 0.55, estocada: -1.45 }, NW: { reposo: 0.55, estocada: -0.9 }, N: { reposo: 0.5, estocada: -0.35 } };
const VISTA_DE_DIRECCION = [['W', true], ['SW', true], ['S', false], ['SW', false], ['W', false], ['NW', false], ['N', false], ['NW', true]];

function dibujarMuneco2D(o) {
  const { datos, fotograma, S } = o;
  if (datos.artilleria) return dibujarMangonel(o);
  const eq = EQUIPOS[o.equipo] || EQUIPOS[0];
  const rama = o.rama || 'cristiano', nivel = o.nivel === undefined ? 1 : o.nivel, general = !!o.general, portador = !!o.portador;
  const direccion = ((o.direccion % 8) + 8) % 8;
  const [nombreVista, espejo] = VISTA_DE_DIRECCION[direccion];
  const V = VISTAS_MUNECO[nombreVista];
  const P = PALETA_MUNECO;
  const montado = !!datos.montado, ligero = datos.clave === 'caballeriaLigera' || datos.clave === 'arquerosACaballo';
  const tirador = !!datos.alcanceTiro, ballesta = datos.clave === 'ballesteros';
  // exclusivas de rama (2026-10-13): caballeros (placas, yelmo cerrado, lanza de justa), guardia varega (hacha a dos manos,
  // sin escudo), templarios (sobrevesta blanca con cruz roja), berserkers (sin armadura ni yelmo, hacha, sin escudo)
  const caballero = datos.clave === 'caballeros', varego = datos.clave === 'guardiaVarega', templario = datos.clave === 'templarios', berserker = datos.clave === 'berserkers';
  const hachaGrande = varego || berserker, sinEscudo = hachaGrande;
  const pesado = datos.clave === 'infanteriaPesada' || varego || templario || (montado && !ligero);
  const esTribu = rama === 'tribus', esMusulman = rama === 'musulman', esOrtodoxo = rama === 'ortodoxo', esCruzado = rama === 'cruzado';
  const color = hexMuneco(eq.color), colorSecundario = hexMuneco(eq.colorSecundario);
  const blason = eq.blason || null;
  const armadura = caballero ? (nivel >= 2 ? 'placas' : 'cota') : nivel === 0 ? 'gambeson' : nivel === 1 ? (pesado ? 'cota' : 'gambeson') : nivel === 2 ? 'cota' : (pesado ? 'placas' : 'cota');
  const colorArmadura = berserker ? P.piel : armadura === 'gambeson' ? (esTribu ? P.pielAnimal : P.gambeson) : armadura === 'placas' ? P.placas : P.acero;
  const conYelmo = !berserker && (nivel >= 1 || (pesado && !esTribu));
  const cimera = nivel >= 3 || general;
  // fotograma
  const indicePaso = /^paso[1-4]$/.test(fotograma) ? +fotograma.slice(4) : 0;
  const paso = [0, 1, 0, -1, 0][indicePaso];
  const bote = indicePaso === 2 || indicePaso === 4 ? -0.06 * S : 0;
  const faseGolpe = fotograma === 'golpe' ? 2 : /^golpe[1-3]$/.test(fotograma) ? +fotograma.slice(5) : 0;
  const cadaver = fotograma === 'cadaver';
  // lienzo: ancho 4,6 S (los jinetes con lanza necesitan margen), alto 5,8 S; los pies en (2,3 S, 5,3 S)
  const ancho = Math.ceil(4.6 * S), alto = Math.ceil(5.8 * S), anclaX = ancho / 2, anclaY = 5.3 * S;
  const canvas = document.createElement('canvas'); canvas.width = ancho; canvas.height = alto;
  const g = canvas.getContext('2d');
  g.translate(anclaX, anclaY);
  if (espejo) g.scale(-1, 1);

  // ---- ayudantes ----
  const forma = (relleno, trazo, dibujo) => { g.beginPath(); dibujo(); g.fillStyle = relleno; g.fill(); if (trazo) { g.lineWidth = trazo * S; g.strokeStyle = P.contorno; g.lineJoin = 'round'; g.stroke(); } };
  const sombra = (dibujo, alpha) => { g.save(); g.beginPath(); dibujo(); g.clip(); g.fillStyle = 'rgba(0,0,0,' + (alpha || 0.22) + ')'; g.fillRect(0, -5 * S, 3 * S, 8 * S); g.restore(); };
  const brillo = (x, y, rx, ry) => { g.fillStyle = 'rgba(255,255,255,0.38)'; g.beginPath(); g.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2); g.fill(); };
  const redondo = (x, y, w, h, r) => g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  // tela con el campo del blasón (o el color plano) recortada a una forma; `cara` = en espejo, se vuelve a voltear la imagen
  const tela = (dibujo, x, y, w, h, franja) => {
    g.save(); g.beginPath(); dibujo(); g.clip();
    if (blason && blason.campo) { g.save(); if (espejo) { g.translate(x + w / 2, 0); g.scale(-1, 1); g.translate(-(x + w / 2), 0); } const cw = blason.campo.width, ch = blason.campo.height; g.drawImage(blason.campo, cw * 0.1, ch * 0.04, cw * 0.8, ch * 0.5, x, y, w, h); g.restore(); }
    else { g.fillStyle = color; g.fillRect(x, y, w, h); if (franja !== false) { g.fillStyle = colorSecundario; g.fillRect(x + w / 2 - 0.08 * S, y, 0.16 * S, h); } }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + w / 2, y - S, w, h + 2 * S); g.restore();
  };

  if (cadaver) { dibujarCadaverMuneco(g, { S, P, montado, pesado, tirador, esTribu, esMusulman, esOrtodoxo, ligero, nivel, color, colorSecundario, conYelmo, armadura, portador, blason, espejo }); return { canvas, anclaX, anclaY }; }

  // ---- caballo ----
  // Cuerpo ovalado, patas, cuello grueso y cabeza redondeada en el extremo del frente. Si el caballo mira hacia el espectador
  // (S, SE, SW) la cabeza se pinta al final, delante del jinete; si mira hacia arriba (N, NE, NW) se pinta antes del cuerpo.
  let base = 0, cabezaCaballoDelante = null;
  if (montado) {
    const angulo = direccion * Math.PI / 4, fx = Math.cos(angulo), fy = Math.sin(angulo) * 0.5;
    const fxv = espejo ? -fx : fx;                       // en el sistema (ya espejado) del dibujo
    const pelo = esMusulman ? (ligero ? '#c8a070' : '#9a6a40') : esTribu ? '#9a8a6a' : ligero ? '#a07a48' : '#6a4428';
    const peloOscuro = oscurecerHex(pelo, 0.72);
    const largo = S * (0.55 + 0.45 * Math.abs(fx));
    const zancada = paso * 0.16 * S, extension = indicePaso === 2 ? -0.1 * S : indicePaso === 4 ? 0.16 * S : 0;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, largo + 0.1 * S, 0.24 * S, 0, 0, Math.PI * 2); g.fill();
    const pata = (px, py, colorPata, desvio) => { forma(colorPata, 0.06, () => redondo(px - 0.11 * S + desvio, py - 0.78 * S, 0.22 * S, 0.78 * S, 0.08 * S)); forma(P.bota, 0.05, () => redondo(px - 0.13 * S + desvio, py - 0.16 * S, 0.26 * S, 0.16 * S, 0.06 * S)); };
    const cabeza = () => {
      const hx = fxv * largo * 0.92, hyBase = -1.05 * S + fy * 0.9 * S;           // base del cuello según la vista
      const nx0 = hx * 0.5, ny0 = hyBase - 0.1 * S, nx1 = hx * 0.9, ny1 = hyBase - 0.72 * S;
      // cuello
      g.lineWidth = 0.5 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.moveTo(nx0, ny0); g.lineTo(nx1, ny1); g.stroke();
      g.lineWidth = 0.38 * S; g.strokeStyle = pelo; g.beginPath(); g.moveTo(nx0, ny0); g.lineTo(nx1, ny1); g.stroke();
      // crin por el lado de atrás del cuello
      g.lineWidth = 0.1 * S; g.strokeStyle = P.bota; g.beginPath(); g.moveTo(nx0 - fxv * 0.12 * S, ny0 - 0.22 * S); g.lineTo(nx1 - fxv * 0.14 * S, ny1 - 0.2 * S); g.stroke();
      // cabeza con hocico hacia el frente
      const cx0 = nx1 + fxv * 0.12 * S, cy0 = ny1 - 0.05 * S, anchoCabeza = 0.56 * S + 0.16 * S * Math.abs(fx);
      const formaCabeza = () => redondo(cx0 - anchoCabeza / 2 + fxv * anchoCabeza * 0.18, cy0 - 0.22 * S, anchoCabeza, 0.46 * S, 0.16 * S);
      forma(pelo, 0.07, formaCabeza); sombra(formaCabeza, 0.2);
      if ((nivel >= 3 || caballero) && pesado && !esTribu) forma(P.placas, 0.05, () => redondo(cx0 - 0.2 * S, cy0 - 0.2 * S, 0.4 * S, 0.2 * S, 0.08 * S));
      // orejas
      for (const lado of [-1, 1]) forma(pelo, 0.05, () => { const ox = cx0 + lado * 0.13 * S; g.moveTo(ox - 0.07 * S, cy0 - 0.2 * S); g.lineTo(ox, cy0 - 0.42 * S); g.lineTo(ox + 0.07 * S, cy0 - 0.2 * S); g.closePath(); });
      // ojo y hocico (no se ven de espaldas)
      if (fy > -0.1) {
        g.fillStyle = P.contorno; g.beginPath(); g.arc(cx0 + fxv * 0.1 * S - (fx === 0 ? 0.12 * S : 0), cy0 - 0.06 * S, 0.045 * S, 0, Math.PI * 2); g.fill();
        if (fx === 0) { g.beginPath(); g.arc(cx0 + 0.12 * S, cy0 - 0.06 * S, 0.045 * S, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = peloOscuro; g.beginPath(); g.ellipse(cx0 + fxv * anchoCabeza * 0.36, cy0 + 0.12 * S, 0.12 * S, 0.08 * S, 0, 0, Math.PI * 2); g.fill();
      }
      // riendas y penacho del general
      g.lineWidth = 0.035 * S; g.strokeStyle = P.cueroOscuro; g.beginPath(); g.moveTo(cx0 - fxv * 0.1 * S, cy0 + 0.1 * S); g.lineTo(hx * 0.15, -1.6 * S); g.stroke();
      if (general) forma(colorSecundario, 0.04, () => { g.moveTo(cx0 - 0.08 * S, cy0 - 0.3 * S); g.lineTo(cx0, cy0 - 0.72 * S); g.lineTo(cx0 + 0.08 * S, cy0 - 0.3 * S); g.closePath(); });
    };
    {
      const miraArriba = fy < -0.1, miraAbajo = fy > 0.1;
      if (miraArriba) cabeza();
      // cola (lado opuesto a la cabeza)
      g.lineWidth = 0.12 * S; g.strokeStyle = P.bota; g.lineCap = 'round'; g.beginPath(); g.moveTo(-fxv * largo * 0.9, -1.15 * S); g.lineTo(-fxv * largo * 1.12, -0.5 * S); g.stroke();
      // patas de atrás (traseras y delanteras del lado lejano)
      pata(-fxv * largo * 0.55 - 0.22 * S * (1 - Math.abs(fx)), 0.02 * S, peloOscuro, -zancada * fxv - extension * fxv);
      pata(fxv * largo * 0.55 - 0.22 * S * (1 - Math.abs(fx)), 0.02 * S, peloOscuro, zancada * fxv + extension * fxv);
      // cuerpo
      forma(pelo, 0.07, () => g.ellipse(0, -1.05 * S, largo, 0.52 * S, 0, 0, Math.PI * 2)); sombra(() => g.ellipse(0, -1.05 * S, largo, 0.52 * S, 0, 0, Math.PI * 2));
      // gualdrapa (campo del blasón) o manta
      if (pesado && !esTribu && nivel >= 1) {
        const gx = -largo * 0.85, gy = -1.3 * S, gw = largo * 1.7, gh = nivel >= 3 ? 0.78 * S : 0.62 * S;
        tela(() => redondo(gx, gy, gw, gh, 0.12 * S), gx, gy, gw, gh, false);
        g.lineWidth = 0.05 * S; g.strokeStyle = P.contorno; g.beginPath(); redondo(gx, gy, gw, gh, 0.12 * S); g.stroke();
        g.fillStyle = colorSecundario; g.fillRect(gx, gy + gh - 0.1 * S, gw, 0.1 * S);
      } else {
        forma(esTribu ? P.pielAnimal : colorSecundario, 0.05, () => redondo(-0.45 * S, -1.32 * S, 0.9 * S, 0.42 * S, 0.1 * S)); g.fillStyle = color; g.fillRect(-0.45 * S, -1.0 * S, 0.9 * S, 0.1 * S);
      }
      // patas de delante (lado cercano)
      pata(-fxv * largo * 0.55 + 0.22 * S * (1 - Math.abs(fx)), 0.06 * S, pelo, zancada * fxv - extension * fxv);
      pata(fxv * largo * 0.55 + 0.22 * S * (1 - Math.abs(fx)), 0.06 * S, pelo, -zancada * fxv + extension * fxv);
      if (!miraArriba && !miraAbajo) cabeza();
      if (miraAbajo) cabezaCaballoDelante = cabeza;
      base = -1.35 * S;
    }
  } else if (!cadaver) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, 0, 0.5 * S, 0.16 * S, 0, 0, Math.PI * 2); g.fill();
  }
  const y0 = base + (montado ? 0 : bote);
  const altoPierna = montado ? 0.35 * S : 0.5 * S;
  const torsoY = y0 - altoPierna;
  const AC = V.anchoCuerpo;
  const cy = torsoY - 1.2 * S, r = 0.42 * S;
  const inclina = faseGolpe === 2 ? 0.06 * S : faseGolpe === 1 ? -0.04 * S : 0;

  // ---- escudo ----
  const dibujarEscudo = () => {
    if (tirador || sinEscudo) return;
    const ex = V.escudoX * S + (faseGolpe === 1 ? -0.04 * S : 0), ey = torsoY - 0.55 * S, k = V.escudoAncho;
    const redondoEscudo = esMusulman || esTribu || datos.clave === 'infanteriaLigera';
    const heater = esCruzado || nivel >= 3;
    const formaEscudo = () => {
      if (redondoEscudo) g.ellipse(ex, ey, 0.3 * S * k, 0.3 * S, 0, 0, Math.PI * 2);
      else { g.moveTo(ex - 0.26 * S * k, ey - 0.35 * S); g.lineTo(ex + 0.26 * S * k, ey - 0.35 * S); if (heater) { g.lineTo(ex + 0.26 * S * k, ey); g.quadraticCurveTo(ex + 0.2 * S * k, ey + 0.3 * S, ex, ey + 0.38 * S); g.quadraticCurveTo(ex - 0.2 * S * k, ey + 0.3 * S, ex - 0.26 * S * k, ey); } else { g.lineTo(ex + 0.26 * S * k, ey + 0.05 * S); g.lineTo(ex, ey + 0.42 * S); g.lineTo(ex - 0.26 * S * k, ey + 0.05 * S); } g.closePath(); }
    };
    if (blason && blason.escudo && !esTribu) {
      // el blasón del jugador, entero, recortado a la forma del escudo
      g.save(); g.beginPath(); formaEscudo(); g.clip();
      const bw = 0.62 * S * k, bh = redondoEscudo ? 0.62 * S : 0.84 * S, bx = ex - bw / 2, by = redondoEscudo ? ey - 0.31 * S : ey - 0.4 * S;
      g.save(); if (espejo) { g.translate(ex, 0); g.scale(-1, 1); g.translate(-ex, 0); } const ew = blason.escudo.width, eh = blason.escudo.height; if (redondoEscudo) g.drawImage(blason.escudo, ew * 0.18, eh * 0.12, ew * 0.64, eh * 0.5, bx, by, bw, bh); else g.drawImage(blason.escudo, 0, 0, ew, eh, bx, by, bw, bh); g.restore();
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(ex + 0.04 * S, ey - S, S, 2 * S); g.restore();
      g.lineWidth = 0.07 * S; g.strokeStyle = (nivel >= 3 || general) ? P.oroOscuro : P.contorno; g.beginPath(); formaEscudo(); g.stroke();
    } else {
      forma(esTribu ? P.madera : colorSecundario, 0.07, formaEscudo);
      if (esTribu) { g.strokeStyle = P.cueroOscuro; g.lineWidth = 0.03 * S; g.beginPath(); g.moveTo(ex - 0.1 * S * k, ey - 0.28 * S); g.lineTo(ex - 0.1 * S * k, ey + 0.28 * S); g.moveTo(ex + 0.1 * S * k, ey - 0.28 * S); g.lineTo(ex + 0.1 * S * k, ey + 0.28 * S); g.stroke(); g.fillStyle = color; g.fillRect(ex - 0.3 * S * k, ey - 0.06 * S, 0.6 * S * k, 0.12 * S); }
      else if (redondoEscudo) { g.fillStyle = color; g.beginPath(); g.ellipse(ex, ey, 0.18 * S * k, 0.18 * S, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = colorSecundario; g.beginPath(); g.ellipse(ex, ey, 0.09 * S * k, 0.09 * S, 0, 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = color; if (esCruzado) { g.fillRect(ex - 0.06 * S * k, ey - 0.32 * S, 0.12 * S * k, 0.6 * S); g.fillRect(ex - 0.2 * S * k, ey - 0.18 * S, 0.4 * S * k, 0.12 * S); } else if (esOrtodoxo) { g.fillRect(ex - 0.05 * S * k, ey - 0.24 * S, 0.1 * S * k, 0.4 * S); g.fillRect(ex - 0.16 * S * k, ey - 0.1 * S, 0.32 * S * k, 0.1 * S); } else g.fillRect(ex - 0.07 * S * k, ey - 0.35 * S, 0.14 * S * k, 0.65 * S); }
      sombra(formaEscudo, 0.18);
    }
    forma(P.acero, 0.04, () => g.ellipse(ex, ey - (redondoEscudo ? 0 : 0.05 * S), 0.065 * S * k, 0.065 * S, 0, 0, Math.PI * 2));
    brillo(ex - 0.13 * S * k, ey - 0.24 * S, 0.08 * S * k, 0.04 * S);
  };

  // ---- arma ----
  const dibujarArma = () => {
    const mx = V.armaX * S + inclina, my = torsoY - 0.55 * S;
    if (portador) { dibujarEstandarteDeMano(g, { S, P, x: mx, y: my, largo: 2.7 * S, angulo: paso * 0.04, blason, color, colorSecundario, espejo, haciaFuera: V.armaX < 0 ? -1 : 1 }); return; }
    const reposoArma = ARMA_POR_VISTA[nombreVista].reposo;
    const alzado = reposoArma + (faseGolpe === 1 ? -0.6 : faseGolpe === 2 ? 1.3 : faseGolpe === 3 ? 0.5 : 0);    // giro del arma de mano: armar, tajo, recoger
    const asta = (x0, y0, x1, y1, colorAsta) => { g.lineWidth = 0.1 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.lineWidth = 0.055 * S; g.strokeStyle = colorAsta; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    if (hachaGrande) {
      // hacha a dos manos (varegos) o de guerra (berserkers): mango largo y hoja grande
      g.save(); g.translate(mx, my); g.rotate(alzado);
      const largoMango = varego ? 1.7 * S : 1.3 * S;
      asta(0, 0.45 * S, 0, -largoMango, P.madera);
      forma(P.acero, 0.05, () => { g.moveTo(0, -largoMango + 0.1 * S); g.quadraticCurveTo(-0.6 * S, -largoMango - 0.05 * S, -0.55 * S, -largoMango + 0.55 * S); g.quadraticCurveTo(-0.25 * S, -largoMango + 0.35 * S, 0, -largoMango + 0.4 * S); g.closePath(); });
      if (berserker) forma(P.acero, 0.05, () => { g.moveTo(0, -largoMango + 0.1 * S); g.quadraticCurveTo(0.5 * S, -largoMango, 0.45 * S, -largoMango + 0.45 * S); g.quadraticCurveTo(0.2 * S, -largoMango + 0.3 * S, 0, -largoMango + 0.35 * S); g.closePath(); });
      g.restore();
    } else if (datos.clave === 'lanceros' || caballero || (datos.clave === 'caballeriaPesada' && !esTribu)) {
      // lanza: en reposo vertical; al golpear se tiende hacia el frente (hacia el lado del escudo en esta vista)
      const estocada = ARMA_POR_VISTA[nombreVista].estocada;
      const angulo = faseGolpe === 1 ? -0.2 * Math.sign(estocada) : faseGolpe === 2 ? estocada : faseGolpe === 3 ? estocada * 0.55 : 0;
      g.save(); g.translate(mx, my); g.rotate(angulo);
      const largo = datos.clave === 'lanceros' ? 2.2 * S : caballero ? 2.9 * S : 2.6 * S;
      asta(0, 0.6 * S, 0, -largo, caballero ? colorSecundario : P.madera);
      if (caballero) forma(P.acero, 0.05, () => { g.moveTo(-0.22 * S, 0.1 * S); g.lineTo(0.22 * S, 0.1 * S); g.lineTo(0, -0.35 * S); g.closePath(); });   // arandela de la lanza de justa
      forma(P.acero, 0.05, () => { g.moveTo(-0.1 * S, -largo + 0.05 * S); g.lineTo(0, -largo - 0.45 * S); g.lineTo(0.1 * S, -largo + 0.05 * S); g.closePath(); });
      if (!esTribu) forma(colorSecundario, 0.03, () => { g.moveTo(0, -largo + 0.1 * S); g.lineTo(-0.38 * S, -largo + 0.25 * S); g.lineTo(0, -largo + 0.4 * S); g.closePath(); });
      g.restore();
    } else if (ballesta) {
      g.save(); g.translate(mx, my); g.rotate(faseGolpe ? -0.2 : 0.1);
      forma(P.madera, 0.06, () => redondo(-0.12 * S, -0.1 * S, 0.24 * S, 0.9 * S, 0.06 * S)); forma(P.acero, 0.05, () => redondo(-0.42 * S, -0.16 * S, 0.84 * S, 0.1 * S, 0.05 * S)); g.strokeStyle = P.lino; g.lineWidth = 0.025 * S; g.beginPath(); g.moveTo(-0.4 * S, -0.08 * S); g.lineTo(0.4 * S, -0.08 * S); g.stroke();
      g.restore();
    } else if (tirador) {
      const radio = 0.62 * S, tensa = faseGolpe === 1;
      g.lineWidth = 0.1 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.arc(mx, my, radio, -Math.PI / 2, Math.PI / 2, V.armaX > 0); g.stroke();
      g.lineWidth = 0.05 * S; g.strokeStyle = P.madera; g.beginPath(); g.arc(mx, my, radio, -Math.PI / 2, Math.PI / 2, V.armaX > 0); g.stroke();
      g.strokeStyle = P.lino; g.lineWidth = 0.03 * S; g.beginPath(); g.moveTo(mx, my - radio); if (tensa) g.lineTo(mx + (V.armaX > 0 ? 0.35 : -0.35) * S, my); g.lineTo(mx, my + radio); g.stroke();
      if (tensa || faseGolpe === 2) { g.strokeStyle = P.lino; g.lineWidth = 0.04 * S; g.beginPath(); g.moveTo(mx + (V.armaX > 0 ? 0.3 : -0.3) * S, my); g.lineTo(mx + (V.armaX > 0 ? -0.5 : 0.5) * S * (faseGolpe === 2 ? 1.6 : 1), my); g.stroke(); }
      if (!montado) { forma(P.cuero, 0.04, () => redondo(-V.armaX * S * 0.6, torsoY - 1.0 * S, 0.16 * S, 0.5 * S, 0.06 * S)); }
    } else if (esTribu) {
      g.save(); g.translate(mx, my); g.rotate(alzado);
      asta(0, 0.4 * S, 0, -1.0 * S, P.madera);
      forma(P.acero, 0.05, () => { g.moveTo(0, -0.85 * S); g.lineTo(-0.4 * S, -1.1 * S); g.lineTo(-0.45 * S, -0.55 * S); g.lineTo(0, -0.65 * S); g.closePath(); });
      g.restore();
    } else if (esMusulman) {
      g.save(); g.translate(mx, my); g.rotate(alzado);
      g.lineWidth = 0.14 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-0.35 * S, -0.6 * S, -0.1 * S, -1.15 * S); g.stroke();
      g.lineWidth = 0.08 * S; g.strokeStyle = P.acero; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-0.35 * S, -0.6 * S, -0.1 * S, -1.15 * S); g.stroke();
      g.fillStyle = P.oro; g.fillRect(-0.16 * S, -0.04 * S, 0.32 * S, 0.08 * S); g.restore();
    } else {
      g.save(); g.translate(mx, my); g.rotate(alzado);
      forma(P.hoja, 0.055, () => redondo(-0.07 * S, -1.05 * S, 0.14 * S, 1.0 * S, 0.05 * S));
      const colorEmpunadura = (nivel >= 3 || general) ? P.oro : P.oroOscuro;
      g.fillStyle = colorEmpunadura; g.fillRect(-0.2 * S, -0.08 * S, 0.4 * S, 0.1 * S); g.fillStyle = P.cueroOscuro; g.fillRect(-0.05 * S, 0.02 * S, 0.1 * S, 0.22 * S); g.fillStyle = colorEmpunadura; g.beginPath(); g.arc(0, 0.28 * S, 0.06 * S, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };

  // ---- cuerpo ----
  if (V.escudoDetras) dibujarEscudo();
  if (V.armaDetras) dibujarArma();
  {
    const zancada = montado ? 0 : paso * 0.14 * S;
    for (const s of [-1, 1]) {
      const px = s * 0.17 * S * AC + zancada * s;
      const colorPierna = esTribu ? P.pielAnimal : nivel >= 3 && !esTribu ? P.placas : P.cueroOscuro;
      forma(colorPierna, 0.06, () => redondo(px - 0.13 * S, y0 - altoPierna, 0.26 * S, altoPierna, 0.1 * S));
      forma(esTribu ? P.cuero : P.bota, 0.06, () => redondo(px - 0.16 * S, y0 - 0.2 * S, 0.32 * S, 0.2 * S, 0.08 * S));
    }
  }
  const cuerpo = () => redondo(-0.42 * S * AC + inclina, torsoY - 0.85 * S, 0.84 * S * AC, 0.9 * S, 0.3 * S);
  if (esMusulman && nivel >= 1 && !montado) forma(color, 0.06, () => redondo(-0.36 * S * AC, torsoY - 0.3 * S, 0.72 * S * AC, 0.45 * S, 0.1 * S));
  forma(colorArmadura, 0.07, cuerpo);
  if (armadura === 'cota') { g.save(); g.beginPath(); cuerpo(); g.clip(); g.fillStyle = 'rgba(40,40,56,0.35)'; for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) { g.beginPath(); g.arc(-0.36 * S * AC + xx * 0.12 * S * AC + (yy % 2) * 0.06 * S + inclina, torsoY - 0.78 * S + yy * 0.12 * S, 0.028 * S, 0, Math.PI * 2); g.fill(); } g.restore(); }
  if (armadura === 'gambeson') { g.strokeStyle = 'rgba(60,45,20,0.45)'; g.lineWidth = 0.025 * S; for (let yy = 0; yy < 5; yy++) { const ly = torsoY - 0.72 * S + yy * 0.15 * S; g.beginPath(); g.moveTo(-0.36 * S * AC + inclina, ly); g.lineTo(0.36 * S * AC + inclina, ly); g.stroke(); } }
  if (esOrtodoxo && armadura !== 'gambeson' && pesado) { g.fillStyle = 'rgba(60,60,80,0.5)'; for (let yy = 0; yy < 6; yy++) g.fillRect(-0.36 * S * AC + inclina, torsoY - 0.8 * S + yy * 0.14 * S, 0.72 * S * AC, 0.06 * S); }
  // sobrevesta (campo del blasón) o faja
  if (berserker) {
    // sin armadura: pecho desnudo con pintura de guerra del color del bando y piel sobre los hombros
    g.fillStyle = color; g.fillRect(-0.22 * S * AC + inclina, torsoY - 0.62 * S, 0.44 * S * AC, 0.08 * S); g.fillRect(-0.04 * S + inclina, torsoY - 0.75 * S, 0.08 * S, 0.35 * S);
  } else if (templario && V.cara !== 'nuca') {
    // sobrevesta templaria: blanca con la cruz roja (la seña de la orden, por encima de los colores del bando)
    const altoSobre = 0.72 * S, tope = torsoY - 0.82 * S, sx = -0.3 * S * AC + inclina, sw = 0.6 * S * AC;
    forma('#f0ece0', 0.05, () => redondo(sx, tope, sw, altoSobre, 0.12 * S));
    g.fillStyle = '#b3202c'; g.fillRect(sx + sw / 2 - 0.07 * S, tope + 0.08 * S, 0.14 * S, altoSobre - 0.16 * S); g.fillRect(sx + sw / 2 - 0.2 * S, tope + 0.2 * S, 0.4 * S, 0.12 * S);
  } else if (nivel >= 1 && V.cara !== 'nuca') {
    const altoSobre = armadura === 'placas' ? 0.5 * S : 0.72 * S, tope = torsoY - (armadura === 'placas' ? 0.58 : 0.82) * S, sx = -0.3 * S * AC + inclina, sw = 0.6 * S * AC;
    if (esCruzado || esTribu) {
      forma(color, 0.05, () => redondo(sx, tope, sw, altoSobre, 0.12 * S));
      g.fillStyle = colorSecundario;
      if (esCruzado) { g.fillRect(sx + sw / 2 - 0.07 * S, tope + 0.08 * S, 0.14 * S, altoSobre - 0.16 * S); g.fillRect(sx + sw / 2 - 0.2 * S, tope + 0.2 * S, 0.4 * S, 0.12 * S); }
      else { g.fillRect(sx, tope + 0.15 * S, sw, 0.1 * S); g.fillRect(sx, tope + 0.42 * S, sw, 0.1 * S); }
    } else {
      tela(() => redondo(sx, tope, sw, altoSobre, 0.12 * S), sx, tope, sw, altoSobre);
      g.lineWidth = 0.05 * S; g.strokeStyle = P.contorno; g.beginPath(); redondo(sx, tope, sw, altoSobre, 0.12 * S); g.stroke();
    }
  } else if (nivel >= 1) {
    // de espaldas: la sobrevesta se ve como tela lisa con el campo
    const sx = -0.3 * S * AC + inclina, sw = 0.6 * S * AC, tope = torsoY - 0.82 * S;
    tela(() => redondo(sx, tope, sw, 0.72 * S, 0.12 * S), sx, tope, sw, 0.72 * S);
    g.lineWidth = 0.05 * S; g.strokeStyle = P.contorno; g.beginPath(); redondo(sx, tope, sw, 0.72 * S, 0.12 * S); g.stroke();
  } else { g.fillStyle = color; g.fillRect(-0.42 * S * AC + inclina, torsoY - 0.4 * S, 0.84 * S * AC, 0.14 * S); }
  sombra(cuerpo);
  g.fillStyle = esTribu ? P.cuero : P.bota; g.fillRect(-0.42 * S * AC + inclina, torsoY - 0.18 * S, 0.84 * S * AC, 0.1 * S);
  if (nivel >= 3 && V.cara !== 'nuca') { g.fillStyle = P.oro; g.fillRect(-0.06 * S + inclina, torsoY - 0.2 * S, 0.12 * S, 0.14 * S); }
  if (esTribu) forma(P.pielAnimal, 0.05, () => redondo(-0.5 * S * AC + inclina, torsoY - 0.95 * S, 1.0 * S * AC, 0.3 * S, 0.14 * S));
  // brazos
  const colorBrazo = berserker || (esTribu && nivel < 2) ? P.piel : colorArmadura;
  const balanceo = montado ? 0 : paso * 0.08 * S;
  forma(colorBrazo, 0.06, () => g.arc(V.brazoIzq * S + inclina, torsoY - 0.55 * S + balanceo, 0.15 * S, 0, Math.PI * 2));
  forma(colorBrazo, 0.06, () => g.arc(V.brazoDer * S + inclina, torsoY - 0.55 * S - balanceo, 0.15 * S, 0, Math.PI * 2));
  if (nivel >= 2 && !esTribu && (pesado || nivel >= 3)) { forma(armadura === 'placas' ? P.placas : P.acero, 0.05, () => g.arc(V.brazoIzq * S * 0.85 + inclina, torsoY - 0.8 * S, 0.12 * S, 0, Math.PI * 2)); forma(armadura === 'placas' ? P.placas : P.acero, 0.05, () => g.arc(V.brazoDer * S * 0.85 + inclina, torsoY - 0.8 * S, 0.12 * S, 0, Math.PI * 2)); }
  if (!V.escudoDetras) dibujarEscudo();

  // ---- cabeza ----
  const cx = V.cabezaDx * S + inclina;
  forma(V.cara === 'nuca' ? P.pelo : P.piel, 0.07, () => g.arc(cx, cy, r, 0, Math.PI * 2)); sombra(() => g.arc(cx, cy, r, 0, Math.PI * 2), 0.14);
  if (V.cara === 'frente') { g.fillStyle = P.contorno; g.beginPath(); g.arc(cx - 0.14 * S, cy + 0.03 * S, 0.045 * S, 0, Math.PI * 2); g.arc(cx + 0.14 * S, cy + 0.03 * S, 0.045 * S, 0, Math.PI * 2); g.fill(); }
  else if (V.cara === 'perfil') { g.fillStyle = P.contorno; g.beginPath(); g.arc(cx - 0.2 * S, cy + 0.02 * S, 0.045 * S, 0, Math.PI * 2); g.fill(); forma(P.piel, 0.05, () => { g.moveTo(cx - r + 0.04 * S, cy); g.lineTo(cx - r - 0.1 * S, cy + 0.12 * S); g.lineTo(cx - r + 0.08 * S, cy + 0.2 * S); g.closePath(); }); }
  if ((esTribu || (esMusulman && nivel >= 1)) && V.cara !== 'nuca') forma(P.pelo, 0.04, () => redondo(cx - 0.2 * S, cy + 0.14 * S, 0.4 * S, 0.2 * S, 0.1 * S));
  const yelmo = (relleno, dibujo) => { forma(relleno, 0.07, dibujo); sombra(dibujo, 0.2); };
  const colorYelmo = armadura === 'placas' ? P.placas : P.acero;
  const penacho = (alto) => forma(colorSecundario, 0.04, () => redondo(cx - 0.07 * S, cy - r - alto, 0.14 * S, alto, 0.07 * S));
  if (!conYelmo) {
    if (esMusulman) { yelmo(P.lino, () => g.ellipse(cx, cy - 0.28 * S, 0.46 * S, 0.24 * S, 0, 0, Math.PI * 2)); g.fillStyle = color; g.fillRect(cx - 0.44 * S, cy - 0.3 * S, 0.88 * S, 0.08 * S); }
    else if (esTribu) yelmo(P.pielAnimal, () => g.ellipse(cx, cy - 0.26 * S, 0.48 * S, 0.26 * S, 0, 0, Math.PI * 2));
    else if (tirador) yelmo(P.cuero, () => { g.moveTo(cx - 0.46 * S, cy - 0.1 * S); g.quadraticCurveTo(cx, cy - 0.95 * S, cx + 0.46 * S, cy - 0.1 * S); g.closePath(); });
    else yelmo(P.pelo, () => { g.moveTo(cx - 0.44 * S, cy - 0.05 * S); g.quadraticCurveTo(cx - 0.44 * S, cy - 0.65 * S, cx, cy - 0.65 * S); g.quadraticCurveTo(cx + 0.44 * S, cy - 0.65 * S, cx + 0.44 * S, cy - 0.05 * S); g.closePath(); });
  } else if (tirador && nivel <= 1) {
    yelmo(P.cuero, () => { g.moveTo(cx - 0.46 * S, cy - 0.1 * S); g.quadraticCurveTo(cx, cy - 0.95 * S, cx + 0.46 * S, cy - 0.1 * S); g.closePath(); });
    if (nivel === 1) yelmo(P.acero, () => g.ellipse(cx, cy - 0.42 * S, 0.3 * S, 0.14 * S, 0, 0, Math.PI * 2));
  } else if (esMusulman) {
    yelmo(colorYelmo, () => { g.moveTo(cx - 0.46 * S, cy - 0.15 * S); g.lineTo(cx, cy - 1.05 * S); g.lineTo(cx + 0.46 * S, cy - 0.15 * S); g.closePath(); });
    g.fillStyle = P.lino; g.fillRect(cx - 0.48 * S, cy - 0.3 * S, 0.96 * S, 0.14 * S);
    if (nivel >= 2 && V.cara === 'frente') { g.fillStyle = colorYelmo; g.fillRect(cx - 0.04 * S, cy - 0.2 * S, 0.08 * S, 0.3 * S); }
    if (cimera) forma(P.oro, 0.04, () => { g.moveTo(cx - 0.06 * S, cy - 1.0 * S); g.lineTo(cx + 0.06 * S, cy - 1.0 * S); g.lineTo(cx, cy - 1.3 * S); g.closePath(); });
  } else if (esOrtodoxo) {
    yelmo(colorYelmo, () => { g.moveTo(cx - 0.46 * S, cy - 0.15 * S); g.lineTo(cx - 0.2 * S, cy - 0.95 * S); g.lineTo(cx + 0.2 * S, cy - 0.95 * S); g.lineTo(cx + 0.46 * S, cy - 0.15 * S); g.closePath(); });
    g.fillStyle = P.oro; g.fillRect(cx - 0.46 * S, cy - 0.22 * S, 0.92 * S, 0.08 * S);
    if (cimera) penacho((general ? 0.55 : 0.45) * S);
  } else if (esTribu) {
    yelmo(colorYelmo, () => redondo(cx - r, cy - r - 0.04 * S, 2 * r, 0.6 * S, 0.3 * S)); g.fillStyle = P.pielAnimal; g.fillRect(cx - r - 0.03 * S, cy - 0.3 * S, 2 * r + 0.06 * S, 0.14 * S);
    if (cimera) for (const s of [-1, 1]) forma(P.lino, 0.04, () => { g.moveTo(cx + s * 0.3 * S, cy - 0.65 * S); g.lineTo(cx + s * 0.55 * S, cy - 0.75 * S); g.lineTo(cx + s * 0.62 * S, cy - 1.2 * S); g.lineTo(cx + s * 0.4 * S, cy - 0.85 * S); g.closePath(); });
  } else if (esCruzado || caballero || (pesado && nivel >= 2 && montado) || (pesado && nivel >= 3)) {
    yelmo(colorYelmo, () => redondo(cx - r - 0.04 * S, cy - r - 0.08 * S, 2 * r + 0.08 * S, 2 * r + 0.1 * S, 0.3 * S));
    if (V.cara !== 'nuca') { g.fillStyle = P.contorno; g.fillRect(cx - 0.3 * S, cy - 0.02 * S, 0.6 * S, 0.08 * S); g.fillStyle = esCruzado ? colorSecundario : P.oro; g.fillRect(cx - 0.04 * S, cy - 0.4 * S, 0.08 * S, 0.5 * S); g.fillRect(cx - 0.18 * S, cy - 0.06 * S, 0.36 * S, 0.07 * S); }
    if (cimera) penacho((general ? 0.6 : 0.5) * S);
  } else if (pesado) {
    yelmo(colorYelmo, () => redondo(cx - r - 0.02 * S, cy - r - 0.08 * S, 2 * r + 0.04 * S, 0.62 * S, 0.3 * S));
    if (V.cara === 'frente') { g.fillStyle = colorYelmo; g.fillRect(cx - 0.05 * S, cy - 0.3 * S, 0.1 * S, 0.34 * S); g.lineWidth = 0.04 * S; g.strokeStyle = P.contorno; g.strokeRect(cx - 0.05 * S, cy - 0.3 * S, 0.1 * S, 0.34 * S); }
    if (cimera) penacho((general ? 0.55 : 0.45) * S);
  } else {
    yelmo(colorYelmo, () => g.ellipse(cx, cy - 0.3 * S, 0.56 * S, 0.14 * S, 0, 0, Math.PI * 2)); yelmo(colorYelmo, () => redondo(cx - 0.36 * S, cy - 0.7 * S, 0.72 * S, 0.44 * S, 0.22 * S));
    if (cimera) penacho((general ? 0.5 : 0.4) * S);
  }
  if (conYelmo) brillo(cx - 0.18 * S, cy - 0.6 * S, 0.11 * S, 0.055 * S);
  if (!V.armaDetras) dibujarArma();
  if (cabezaCaballoDelante) cabezaCaballoDelante();
  return { canvas, anclaX, anclaY };
}
/* Estandarte de mano del portador: asta vertical de `largo` desde la mano (x, y), moharra y paño colgado del extremo hacia el
   lado exterior (`haciaFuera`), con el blasón del equipo (interior del escudo, sin su silueta) o los esmaltes planos. */
function dibujarEstandarteDeMano(g, o) {
  const { S, P, x, y, largo, blason, color, colorSecundario, espejo, haciaFuera } = o;
  g.save(); g.translate(x, y); g.rotate(o.angulo || 0);
  g.lineWidth = 0.1 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0.5 * S); g.lineTo(0, -largo); g.stroke();
  g.lineWidth = 0.055 * S; g.strokeStyle = P.madera; g.beginPath(); g.moveTo(0, 0.5 * S); g.lineTo(0, -largo); g.stroke();
  g.beginPath(); g.moveTo(-0.08 * S, -largo + 0.02 * S); g.lineTo(0, -largo - 0.3 * S); g.lineTo(0.08 * S, -largo + 0.02 * S); g.closePath(); g.fillStyle = P.oro; g.fill(); g.lineWidth = 0.04 * S; g.strokeStyle = P.contorno; g.stroke();
  // paño: cuelga del asta hacia fuera, con una muesca en el borde libre
  const pw = 1.05 * S * haciaFuera, ph = 0.8 * S, py = -largo + 0.06 * S;
  const pano = () => { g.moveTo(0, py); g.lineTo(pw, py); g.lineTo(pw - 0.16 * S * haciaFuera, py + ph / 2); g.lineTo(pw, py + ph); g.lineTo(0, py + ph); g.closePath(); };
  g.save(); g.beginPath(); pano(); g.clip();
  const x0 = Math.min(0, pw), ancho = Math.abs(pw);
  if (blason && blason.escudo) {
    const ew = blason.escudo.width, eh = blason.escudo.height;
    g.save(); if (espejo) { g.translate(x0 + ancho / 2, 0); g.scale(-1, 1); g.translate(-(x0 + ancho / 2), 0); }
    g.drawImage(blason.escudo, ew * 0.16, eh * 0.1, ew * 0.68, eh * 0.52, x0, py, ancho, ph); g.restore();
  } else { g.fillStyle = color; g.fillRect(x0, py, ancho, ph); g.fillStyle = colorSecundario; g.fillRect(x0, py + ph * 0.4, ancho, ph * 0.2); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + ancho / 2, py, ancho, ph); g.restore();
  g.lineWidth = 0.05 * S; g.strokeStyle = P.contorno; g.lineJoin = 'round'; g.beginPath(); pano(); g.stroke();
  g.restore();
}
function hexMuneco(n) { return typeof n === 'string' ? n : '#' + (n >>> 0).toString(16).padStart(6, '0'); }
function oscurecerHex(hex, k) { const n = parseInt(hex.slice(1), 16); const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k); return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); }

/* Recorta los márgenes transparentes de un canvas (para retratos y tarjetas) */
function recortarLienzo(origen, margen) {
  const m = margen || 2, ancho = origen.width, alto = origen.height;
  const datos = origen.getContext('2d').getImageData(0, 0, ancho, alto).data;
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (datos[(y * ancho + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return origen;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(ancho - 1, x1 + m); y1 = Math.min(alto - 1, y1 + m);
  const salida = document.createElement('canvas'); salida.width = x1 - x0 + 1; salida.height = y1 - y0 + 1;
  salida.getContext('2d').drawImage(origen, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);
  return salida;
}
/* Blasón del diseñador rasterizado para los sprites: { escudo, campo, clave }. `escudo` es el blasón entero (para los escudos)
   y `campo` solo el campo sin figuras (para sobrevestas y gualdrapas). Se cachea por estado. */
const BLASONES_SPRITES = new Map();
async function blasonParaSprites(estado) {
  if (!estado || typeof PuenteDisenador === 'undefined') return null;
  const claveEstado = JSON.stringify(estado);
  if (BLASONES_SPRITES.has(claveEstado)) return BLASONES_SPRITES.get(claveEstado);
  const escudo = await PuenteDisenador.renderizarBlason(estado, 256);
  const campo = await PuenteDisenador.renderizarBlason(Object.assign({}, estado, { layers: [] }), 256);
  let resumen = 0; for (let i = 0; i < claveEstado.length; i++) resumen = (resumen * 31 + claveEstado.charCodeAt(i)) >>> 0;
  const resultado = { escudo, campo, clave: 'b' + resumen.toString(36) };
  BLASONES_SPRITES.set(claveEstado, resultado);
  return resultado;
}

/* Cadáver tumbado, visto desde arriba en isométrico: cuerpo en horizontal, cabeza a un lado, piernas al otro, arma caída.
   Los jinetes caen junto a su caballo tendido. El ancla sigue siendo el punto de los pies de la figura de pie. */
function dibujarCadaverMuneco(g, o) {
  const { S, P, montado, esTribu, esMusulman, nivel, color, colorSecundario, conYelmo, armadura, portador, blason, espejo } = o;
  const forma = (relleno, trazo, dibujo) => { g.beginPath(); dibujo(); g.fillStyle = relleno; g.fill(); if (trazo) { g.lineWidth = trazo * S; g.strokeStyle = P.contorno; g.lineJoin = 'round'; g.stroke(); } };
  const redondo = (x, y, w, h, r) => g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  const colorArmadura = armadura === 'gambeson' ? (esTribu ? P.pielAnimal : P.gambeson) : armadura === 'placas' ? P.placas : P.acero;
  const colorYelmo = armadura === 'placas' ? P.placas : P.acero;
  let cy = -0.3 * S;                      // centro del cuerpo tendido
  if (montado) {
    // caballo tendido: cuerpo ovalado, cabeza y patas estiradas; el jinete cae delante
    const pelo = esMusulman ? '#9a6a40' : esTribu ? '#9a8a6a' : '#6a4428';
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, -0.55 * S, 1.5 * S, 0.5 * S, 0, 0, Math.PI * 2); g.fill();
    for (const k of [-1, 1]) forma(pelo, 0.06, () => redondo(k * 0.25 * S - 0.1 * S, -1.35 * S, 0.2 * S, 0.55 * S, 0.08 * S));
    forma(pelo, 0.07, () => g.ellipse(0, -0.75 * S, 1.1 * S, 0.42 * S, 0, 0, Math.PI * 2));
    forma(pelo, 0.07, () => redondo(0.95 * S, -0.95 * S, 0.62 * S, 0.4 * S, 0.14 * S));
    g.fillStyle = P.contorno; g.beginPath(); g.arc(1.3 * S, -0.82 * S, 0.04 * S, 0, Math.PI * 2); g.fill();
    forma(colorSecundario, 0.05, () => redondo(-0.55 * S, -1.0 * S, 1.0 * S, 0.5 * S, 0.1 * S));
    cy = 0.05 * S;
  }
  // sombra y figura tendida
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(0, cy + 0.12 * S, 1.15 * S, 0.3 * S, 0, 0, Math.PI * 2); g.fill();
  // piernas (a la derecha), cuerpo, brazos, cabeza (a la izquierda)
  for (const k of [0, 1]) { forma(esTribu ? P.pielAnimal : nivel >= 3 && !esTribu ? P.placas : P.cueroOscuro, 0.06, () => redondo(0.4 * S, cy - 0.22 * S + k * 0.24 * S, 0.5 * S, 0.2 * S, 0.08 * S)); forma(esTribu ? P.cuero : P.bota, 0.05, () => redondo(0.82 * S, cy - 0.24 * S + k * 0.24 * S, 0.22 * S, 0.24 * S, 0.08 * S)); }
  const cuerpo = () => redondo(-0.5 * S, cy - 0.36 * S, 0.95 * S, 0.72 * S, 0.26 * S);
  forma(colorArmadura, 0.07, cuerpo);
  if (nivel >= 1 && !esTribu) { forma(color, 0.05, () => redondo(-0.4 * S, cy - 0.26 * S, 0.72 * S, 0.52 * S, 0.12 * S)); g.fillStyle = colorSecundario; g.fillRect(-0.4 * S, cy - 0.06 * S, 0.72 * S, 0.12 * S); }
  else { g.fillStyle = color; g.fillRect(-0.5 * S, cy - 0.06 * S, 0.95 * S, 0.12 * S); }
  g.save(); g.beginPath(); cuerpo(); g.clip(); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-S, cy, 3 * S, S); g.restore();
  forma(esTribu && nivel < 2 ? P.piel : colorArmadura, 0.06, () => g.arc(-0.1 * S, cy - 0.5 * S, 0.15 * S, 0, Math.PI * 2));
  forma(esTribu && nivel < 2 ? P.piel : colorArmadura, 0.06, () => g.arc(0.2 * S, cy + 0.5 * S, 0.15 * S, 0, Math.PI * 2));
  // cabeza con yelmo o pelo, ojos cerrados
  const hx = -0.85 * S, r = 0.4 * S;
  forma(P.piel, 0.07, () => g.arc(hx, cy, r, 0, Math.PI * 2));
  g.strokeStyle = P.contorno; g.lineWidth = 0.035 * S; g.beginPath(); g.moveTo(hx - 0.02 * S, cy - 0.16 * S); g.lineTo(hx + 0.1 * S, cy - 0.12 * S); g.moveTo(hx - 0.02 * S, cy + 0.16 * S); g.lineTo(hx + 0.1 * S, cy + 0.12 * S); g.stroke();
  if (conYelmo) forma(colorYelmo, 0.07, () => { g.moveTo(hx - 0.1 * S, cy - r - 0.04 * S); g.quadraticCurveTo(hx - r - 0.25 * S, cy, hx - 0.1 * S, cy + r + 0.04 * S); g.closePath(); });
  else forma(esMusulman ? P.lino : P.pelo, 0.06, () => { g.moveTo(hx - 0.05 * S, cy - r - 0.02 * S); g.quadraticCurveTo(hx - r - 0.2 * S, cy, hx - 0.05 * S, cy + r + 0.02 * S); g.closePath(); });
  // arma caída junto al cuerpo (el portador deja el estandarte tendido)
  if (portador) { g.save(); g.translate(-1.1 * S, cy - 0.72 * S); g.rotate(Math.PI / 2 + 0.1); dibujarEstandarteDeMano(g, { S, P, x: 0, y: 0, largo: 2.3 * S, blason, color, colorSecundario, espejo, haciaFuera: -1 }); g.restore(); return; }
  g.lineWidth = 0.1 * S; g.strokeStyle = P.contorno; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.3 * S, cy + 0.75 * S); g.lineTo(0.7 * S, cy + 0.85 * S); g.stroke();
  g.lineWidth = 0.05 * S; g.strokeStyle = P.hoja; g.beginPath(); g.moveTo(-0.3 * S, cy + 0.75 * S); g.lineTo(0.7 * S, cy + 0.85 * S); g.stroke();
}

/* Mangonel (redibujado el 2026-10-14): una máquina con volumen. Se modela en coordenadas propias (u hacia delante, v a su
   derecha, h hacia arriba, en metros) y se proyecta a la vista isométrica del juego según la dirección, como los soldados:
   x = u·cos a − v·sen a, y = (u·sen a + v·cos a)/2 − h. Cada pieza se dibuja de atrás adelante por su profundidad en pantalla.
   Piezas: bastidor de dos vigas largas con travesaños sobre cuatro ruedas, dos montantes en A unidos por el eje, el haz de
   torsión (cuerda enrollada) en el eje, el travesaño acolchado contra el que golpea el brazo, el brazo con la cazoleta y la
   piedra, y dos sirvientes con la sobrevesta del bando (uno tensa la cuerda, otro carga la piedra).
   Fotogramas: quieto (brazo atrás, armado) · golpe1-3 (el brazo bate hacia delante y rebota) · cadaver (máquina destrozada).
   Mismas medidas de lienzo y ancla que los muñecos. */
function dibujarMangonel(o) {
  const S = o.S, P = PALETA_MUNECO, eq = EQUIPOS[o.equipo] || EQUIPOS[0];
  const color = hexMuneco(eq.color), colorSecundario = hexMuneco(eq.colorSecundario);
  const direccion = ((o.direccion % 8) + 8) % 8, a = direccion * Math.PI / 4, cosA = Math.cos(a), senA = Math.sin(a);
  const ancho = Math.ceil(4.6 * S), alto = Math.ceil(5.8 * S), anclaX = ancho / 2, anclaY = 5.3 * S;
  const canvas = document.createElement('canvas'); canvas.width = ancho; canvas.height = alto;
  const g = canvas.getContext('2d'); g.translate(anclaX, anclaY);
  const cadaver = o.fotograma === 'cadaver', fase = /^golpe[1-3]$/.test(o.fotograma) ? +o.fotograma.slice(5) : 0;
  // proyección y profundidad (mayor = más cerca del espectador = se dibuja después)
  const M = S * 1.18;                                          // la máquina, algo más grande que la escala de los muñecos
  const px = (u, v, h) => (u * cosA - v * senA) * M, py = (u, v, h) => ((u * senA + v * cosA) * 0.5 - h) * M;
  const prof = (u, v) => u * senA + v * cosA;
  const piezas = [];
  const pieza = (profundidad, dibujo) => piezas.push({ profundidad, dibujo });
  const contorno = 0.07 * S;
  const polilinea = (puntos, relleno, trazo) => { g.beginPath(); puntos.forEach(([u, v, h], k) => k ? g.lineTo(px(u, v, h), py(u, v, h)) : g.moveTo(px(u, v, h), py(u, v, h))); g.closePath(); g.fillStyle = relleno; g.fill(); g.lineWidth = trazo === undefined ? contorno : trazo; g.strokeStyle = P.contorno; g.lineJoin = 'round'; g.stroke(); };
  // viga: segmento grueso con contorno y una franja de sombra en su mitad inferior
  const viga = (p0, p1, grosor, relleno) => {
    const x0 = px(...p0), y0 = py(...p0), x1 = px(...p1), y1 = py(...p1);
    g.lineCap = 'round'; g.lineWidth = grosor * S + contorno; g.strokeStyle = P.contorno; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = grosor * S; g.strokeStyle = relleno || P.madera; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = grosor * S * 0.35; g.strokeStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.moveTo(x0, y0 + grosor * S * 0.3); g.lineTo(x1, y1 + grosor * S * 0.3); g.stroke();
  };
  // rueda: círculo en el plano (u, h) en v = v0, con radios y cubo
  const rueda = (u0, v0, r) => {
    const puntos = []; for (let k = 0; k < 20; k++) { const t = k / 20 * Math.PI * 2; puntos.push([u0 + Math.cos(t) * r, v0, r + Math.sin(t) * r]); }
    polilinea(puntos, P.cueroOscuro);
    g.strokeStyle = P.madera; g.lineWidth = 0.06 * S; g.beginPath();
    for (let k = 0; k < 4; k++) { const t = k / 4 * Math.PI; g.moveTo(px(u0 + Math.cos(t) * r * 0.85, v0, r + Math.sin(t) * r * 0.85), py(u0 + Math.cos(t) * r * 0.85, v0, r + Math.sin(t) * r * 0.85)); g.lineTo(px(u0 - Math.cos(t) * r * 0.85, v0, r - Math.sin(t) * r * 0.85), py(u0 - Math.cos(t) * r * 0.85, v0, r - Math.sin(t) * r * 0.85)); }
    g.stroke();
    g.fillStyle = P.aceroOscuro; g.beginPath(); g.arc(px(u0, v0, r), py(u0, v0, r), 0.07 * S, 0, Math.PI * 2); g.fill();
  };
  const piedra = (u, v, h, r) => { const x = px(u, v, h), y = py(u, v, h); g.beginPath(); g.arc(x, y, r * S, 0, Math.PI * 2); g.fillStyle = '#8a857b'; g.fill(); g.lineWidth = contorno * 0.8; g.strokeStyle = P.contorno; g.stroke(); g.fillStyle = '#b0aa9e'; g.beginPath(); g.arc(x - r * S * 0.3, y - r * S * 0.3, r * S * 0.35, 0, Math.PI * 2); g.fill(); };
  // sirviente de la máquina: muñeco sencillo con sobrevesta del bando y capacete; (u, v) de los pies; `brazos` = 'cuerda' | 'piedra'
  const sirviente = (u, v, encarando, brazos) => {
    const x = px(u, v, 0), y = py(u, v, 0), lado = Math.sin(encarando - a) < 0 ? -1 : 1, S = o.S * 0.88;   // hacia dónde mira en pantalla; algo más pequeños que la tropa
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, 0.42 * S, 0.14 * S, 0, 0, Math.PI * 2); g.fill();
    const forma = (relleno, dibujo) => { g.beginPath(); dibujo(); g.fillStyle = relleno; g.fill(); g.lineWidth = 0.055 * S; g.strokeStyle = P.contorno; g.lineJoin = 'round'; g.stroke(); };
    for (const s of [-1, 1]) forma(P.cueroOscuro, () => g.roundRect(x + s * 0.17 * S - 0.12 * S, y - 0.5 * S, 0.24 * S, 0.5 * S, 0.08 * S));
    forma(P.gambeson, () => g.roundRect(x - 0.4 * S, y - 1.35 * S, 0.8 * S, 0.9 * S, 0.26 * S));
    forma(color, () => g.roundRect(x - 0.28 * S, y - 1.3 * S, 0.56 * S, 0.7 * S, 0.1 * S)); g.fillStyle = colorSecundario; g.fillRect(x - 0.28 * S, y - 0.95 * S, 0.56 * S, 0.1 * S);
    if (brazos === 'piedra') { piedra(u, v, 1.05, 0.2); }
    else { g.lineWidth = 0.05 * S; g.strokeStyle = P.lino; g.beginPath(); g.moveTo(x + lado * 0.35 * S, y - 0.95 * S); g.lineTo(x + lado * 0.9 * S, y - 1.15 * S); g.stroke(); }
    forma(P.piel, () => g.arc(x, y - 1.6 * S, 0.3 * S, 0, Math.PI * 2));
    forma(P.acero, () => { g.moveTo(x - 0.4 * S, y - 1.68 * S); g.quadraticCurveTo(x, y - 2.15 * S, x + 0.4 * S, y - 1.68 * S); g.closePath(); });
  };
  // ---- sombra de la máquina ----
  g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath();
  [[-1.5, -0.95], [1.5, -0.95], [1.5, 0.95], [-1.5, 0.95]].forEach(([u, v], k) => k ? g.lineTo(px(u, v, 0), py(u, v, 0)) : g.moveTo(px(u, v, 0), py(u, v, 0))); g.closePath(); g.fill();
  if (cadaver) {
    // destrozada: bastidor hundido y torcido, un montante en pie y el otro caído, el brazo partido en el suelo, una rueda suelta
    pieza(prof(-1.2, 0.7), () => rueda(-1.0, 0.75, 0.3)); pieza(prof(1.0, -0.75), () => rueda(1.0, -0.75, 0.3));
    pieza(prof(0, -0.6), () => viga([-1.3, -0.6, 0.25], [1.3, -0.6, 0.1], 0.2)); pieza(prof(0, 0.6), () => viga([-1.3, 0.6, 0.05], [1.3, 0.7, 0.3], 0.2));
    pieza(prof(-0.2, -0.5), () => viga([-0.2, -0.55, 0.25], [-0.1, -0.35, 1.3], 0.16)); pieza(prof(0.1, 0.5), () => viga([-0.2, 0.55, 0.2], [0.9, 1.1, 0.0], 0.16));
    pieza(prof(0.6, 0), () => viga([-0.3, 0.1, 0.3], [0.9, 0.3, 0.0], 0.14)); pieza(prof(1.4, 0.2), () => viga([1.0, 0.3, 0.05], [1.9, 0.6, 0.0], 0.12));
    pieza(prof(1.6, -0.6), () => { const puntos = []; for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; puntos.push([1.6 + Math.cos(t) * 0.3, -0.7 + Math.sin(t) * 0.3, 0.02]); } polilinea(puntos, P.cueroOscuro); });
    pieza(prof(-1.6, 0.3), () => piedra(-1.6, 0.3, 0.2, 0.2)); pieza(prof(1.1, 1.0), () => piedra(1.1, 1.0, 0.16, 0.16));
  } else {
    const H = 0.35;                                             // alto del bastidor sobre el suelo (por las ruedas)
    // ruedas
    for (const [u, v] of [[-1.0, -0.78], [1.0, -0.78], [-1.0, 0.78], [1.0, 0.78]]) pieza(prof(u, v), () => rueda(u, v, 0.32));
    // bastidor: vigas largas, travesaños y eje de las ruedas
    for (const v of [-0.6, 0.6]) pieza(prof(0, v), () => viga([-1.35, v, H], [1.35, v, H], 0.2));
    for (const u of [-1.1, 1.1]) pieza(prof(u, 0), () => viga([u, -0.65, H], [u, 0.65, H], 0.16));
    // montantes en A (dos por lado) y eje del brazo entre ellos, con el haz de torsión
    const EJE_U = -0.15, EJE_H = 1.0;
    for (const v of [-0.55, 0.55]) {
      pieza(prof(EJE_U - 0.45, v), () => viga([EJE_U - 0.5, v, H], [EJE_U, v * 0.75, EJE_H + 0.35], 0.15));
      pieza(prof(EJE_U + 0.45, v), () => viga([EJE_U + 0.5, v, H], [EJE_U, v * 0.75, EJE_H + 0.35], 0.15));
    }
    pieza(prof(EJE_U, 0) + 0.01, () => viga([EJE_U, -0.45, EJE_H], [EJE_U, 0.45, EJE_H], 0.22, '#c9b27a'));          // haz de torsión (cuerda)
    pieza(prof(EJE_U, 0) + 0.02, () => { g.lineWidth = 0.035 * S; g.strokeStyle = P.cueroOscuro; for (let k = -4; k <= 4; k++) { const v = k * 0.1; g.beginPath(); g.moveTo(px(EJE_U - 0.12, v, EJE_H + 0.08), py(EJE_U - 0.12, v, EJE_H + 0.08)); g.lineTo(px(EJE_U + 0.12, v + 0.05, EJE_H - 0.08), py(EJE_U + 0.12, v + 0.05, EJE_H - 0.08)); g.stroke(); } });
    // travesaño acolchado delante (el tope del brazo), con el cuero del bando
    pieza(prof(0.55, 0), () => viga([0.55, -0.5, EJE_H + 0.9], [0.55, 0.5, EJE_H + 0.9], 0.24, '#7a1a1f'));
    for (const v of [-0.55, 0.55]) pieza(prof(0.55, v), () => viga([0.6, v, H], [0.55, v * 0.9, EJE_H + 0.9], 0.13));
    // brazo: ángulo desde el eje (0 = horizontal hacia atrás, π/2 = vertical, >π/2 = hacia delante contra el tope)
    const angulo = [0.22, 0.95, 1.75, 1.45][fase], LARGO = 1.9;
    const puntaU = EJE_U - Math.cos(angulo) * LARGO, puntaH = EJE_H + Math.sin(angulo) * LARGO;
    pieza(prof((EJE_U + puntaU) / 2, 0) + 0.03, () => {
      viga([EJE_U, 0, EJE_H], [puntaU, 0, puntaH], 0.17);
      // cazoleta en el extremo (y la piedra mientras no ha salido)
      const cu = puntaU - Math.cos(angulo) * 0.12, ch = puntaH + Math.sin(angulo) * 0.12;
      polilinea([[cu - 0.22, -0.22, ch - 0.05], [cu + 0.22, -0.22, ch - 0.05], [cu + 0.22, 0.22, ch - 0.05], [cu - 0.22, 0.22, ch - 0.05]], P.cueroOscuro, contorno * 0.8);
      if (fase < 2) piedra(cu, 0, ch + 0.12, 0.24);
      g.fillStyle = P.aceroOscuro; g.beginPath(); g.arc(px(EJE_U, 0, EJE_H), py(EJE_U, 0, EJE_H), 0.09 * S, 0, Math.PI * 2); g.fill();
    });
    // sirvientes: uno tensando la cuerda a un lado (en reposo), otro con una piedra detrás
    pieza(prof(-0.2, 1.45), () => sirviente(-0.2, 1.45, a + Math.PI / 2, fase ? 'nada' : 'cuerda'));
    pieza(prof(-2.05, -0.55), () => sirviente(-2.05, -0.55, a, 'piedra'));
  }
  piezas.sort((p, q) => p.profundidad - q.profundidad);
  for (const p of piezas) p.dibujo();
  return { canvas, anclaX, anclaY };
}
