'use strict';
/* ---------- Sprites 2D isométricos dibujados por código, en alta resolución ----------
   Cada fotograma se dibuja con PIXI.Graphics a una escala S cuatro veces mayor que la de pantalla y el sprite se reduce
   después, así que se ve nítido al acercar la cámara. Estilo: siluetas con contorno oscuro y dos tonos (lado derecho en
   sombra), sobrevesta y escudo con los esmaltes del reino.

   Variantes por RAMA (cristiano, ortodoxo, musulman, cruzado, tribus): yelmo, forma del escudo, arma de mano, túnica y
   caballo. Variantes por NIVEL (0 leva, 1 milicia, 2 hombres de armas, 3 veteranos): sin yelmo y gambesón acolchado en la
   leva, cota de malla completa en los hombres de armas, placas, grebas y cimera en los veteranos. El general lleva cimera
   mayor y ribete dorado.

   Fotogramas: quieto · paso1..paso4 (ciclo de andar: pie izquierdo delante, cruce con bote, pie derecho delante, cruce) ·
   golpe1..golpe3 (armar, golpear, recoger; los tiradores: tensar, soltar, bajar) · cadaver. 'golpe' a secas = golpe2.
   Sombreado: luz desde arriba a la izquierda (brillos en yelmo, hombro, escudo y caballo; sombra en el lado derecho, bajo
   el cinturón y en el cuello), pliegues en la sobrevesta.

   dibujarSoldado2D(g, { equipo, datos, direccion, fotograma, S, rama, nivel, general }) pinta sobre el Graphics `g`
   (origen en los pies). */

const PALETA_SOLDADO = {
  CONTORNO: 0x1a1410, PIEL: 0xd9b48a, PIEL_OSCURA: 0xb8906a, PELO: 0x3a2a1a, BARBA: 0x5a3a1e,
  ACERO: 0xc9c9d2, ACERO_SOMBRA: 0x8a8a96, PLACAS: 0xdcdce6, PLACAS_SOMBRA: 0x9a9aa8, ORO: 0xd9b23a, ORO_SOMBRA: 0x8a7a3a,
  MADERA: 0x6b4a2a, MADERA_CLARA: 0x9a7448, CUERO: 0x4a3321, BOTA: 0x2a1a0e, GAMBESON: 0x9a8a68, GAMBESON_SOMBRA: 0x6e6248,
  COTA: 0x8e8e96, COTA_SOMBRA: 0x5e5e68, CUERO_COTA: 0x7a6a50, CUERO_COTA_SOMBRA: 0x4e4232, PIEL_ANIMAL: 0x6a4a2a, PIEL_ANIMAL_CLARA: 0x8a6a42,
  LINO: 0xe8e4d8, CUERDA: 0xe8e4d8,
};

function dibujarSoldado2D(g, o) {
  const { datos, direccion, fotograma, S } = o;
  const eq = EQUIPOS[o.equipo];
  const rama = o.rama || 'cristiano';
  const nivel = o.nivel === undefined ? 1 : o.nivel;
  const general = !!o.general;
  const P = PALETA_SOLDADO;
  const angulo = direccion * Math.PI / 4;
  const fx = Math.cos(angulo), fy = Math.sin(angulo) * 0.5;      // frente en pantalla (aplastado)
  const mira = fy > 0.05 ? 1 : fy < -0.05 ? -1 : 0;              // 1 mira hacia el espectador, −1 de espaldas
  const lado = Math.sign(fx) || 1;                                 // hacia qué lado de la pantalla mira
  // ciclo de andar en cuatro fotogramas: zancada +1 (izquierda delante), 0 con bote, −1, 0 con bote
  const indicePaso = /^paso[1-4]$/.test(fotograma) ? +fotograma.slice(4) : 0;
  const paso = [0, 1, 0, -1, 0][indicePaso];
  const bote = indicePaso === 2 || indicePaso === 4 ? -0.05 * S : 0;           // el cuerpo sube un poco al cruzar las piernas
  // golpe en tres fases: 1 armar (arma atrás y alta), 2 golpear (adelante), 3 recoger
  const faseGolpe = fotograma === 'golpe' ? 2 : /^golpe[1-3]$/.test(fotograma) ? +fotograma.slice(5) : 0;
  const golpe = faseGolpe > 0;
  const montado = !!datos.montado, ligero = datos.clave === 'caballeriaLigera' || datos.clave === 'arquerosACaballo';
  const pesado = datos.clave === 'infanteriaPesada' || (montado && !ligero), tirador = !!datos.alcanceTiro, ballesta = datos.clave === 'ballesteros';
  const esTribu = rama === 'tribus', esMusulman = rama === 'musulman', esOrtodoxo = rama === 'ortodoxo', esCruzado = rama === 'cruzado';
  // armadura según nivel y tipo: gambesón acolchado → cota de malla → placas (solo tropa pesada); lamelar bizantino en ortodoxos
  const armadura = nivel === 0 ? 'gambeson' : nivel === 1 ? (pesado ? 'cota' : 'gambeson') : nivel === 2 ? 'cota' : (pesado ? 'placas' : 'cota');
  const lamelar = esOrtodoxo && armadura !== 'gambeson' && pesado;
  const colorArmadura = armadura === 'gambeson' ? (esTribu ? P.PIEL_ANIMAL_CLARA : P.GAMBESON) : armadura === 'placas' ? P.PLACAS : (pesado ? P.COTA : P.CUERO_COTA);
  const colorArmaduraSombra = armadura === 'gambeson' ? (esTribu ? P.PIEL_ANIMAL : P.GAMBESON_SOMBRA) : armadura === 'placas' ? P.PLACAS_SOMBRA : (pesado ? P.COTA_SOMBRA : P.CUERO_COTA_SOMBRA);
  const conYelmo = nivel >= 1 || (pesado && !esTribu);
  const conSobrevesta = nivel >= 1;
  const conCimera = nivel >= 3 || general;
  const oscurecer = (c, k) => { const r = (c >> 16) & 255, g2 = (c >> 8) & 255, b = c & 255; return (Math.round(r * k) << 16) | (Math.round(g2 * k) << 8) | Math.round(b * k); };
  const linea = w => g.lineStyle(w * S, P.CONTORNO, 1, 0.5);
  const sinLinea = () => g.lineStyle(0);
  const relleno = (c, a) => g.beginFill(c, a === undefined ? 1 : a);

  if (fotograma === 'cadaver') {
    dibujarCadaver2D(g, { S, fx, fy, eq, montado, ligero, tirador, colorArmadura, esTribu, esMusulman, linea, relleno });
    return;
  }

  let base = 0;                                                   // altura de los pies del jinete sobre el suelo
  if (montado) {
    base = dibujarCaballo2D(g, { S, fx, fy, lado, paso, indicePaso, eq, ligero, pesado, rama, nivel, general, linea, sinLinea, relleno, oscurecer });
  }
  const inclina = faseGolpe === 2 ? fx * 0.1 * S : faseGolpe === 1 ? -fx * 0.05 * S : faseGolpe === 3 ? fx * 0.04 * S : 0;
  const y0 = base + (montado ? 0 : bote);                         // pies (con el bote del paso)
  const altoPierna = (montado ? 0.45 : 0.62) * S;
  // piernas, botas y grebas (veteranos)
  const zancada = montado ? 0 : paso * 0.12 * S;
  for (const s of [-1, 1]) {
    const px = s * 0.13 * S + zancada * s * fx;
    if (!montado && s === -1 && paso !== 0) { sinLinea(); relleno(0x000000, 0.12).drawEllipse(px, y0 - 0.02 * S, 0.16 * S, 0.05 * S).endFill(); }   // sombra de contacto
    const colorPierna = esTribu ? (s === 1 ? P.PIEL_ANIMAL_CLARA : P.PIEL_ANIMAL) : (s === 1 ? P.CUERO : oscurecer(P.CUERO, 0.75));
    linea(0.05); relleno(colorPierna).drawRoundedRect(px - 0.09 * S, y0 - altoPierna, 0.18 * S, altoPierna, 0.05 * S).endFill();
    if (nivel >= 3 && !esTribu) { sinLinea(); relleno(s === 1 ? P.PLACAS : P.PLACAS_SOMBRA).drawRoundedRect(px - 0.08 * S, y0 - altoPierna * 0.75, 0.16 * S, altoPierna * 0.55, 0.04 * S).endFill(); }
    linea(0.05); relleno(esTribu ? P.CUERO : P.BOTA).drawRoundedRect(px - 0.11 * S, y0 - 0.16 * S, 0.22 * S, 0.16 * S, 0.05 * S).endFill();
    if (esTribu) { sinLinea(); g.lineStyle(0.03 * S, P.LINO, 0.8); g.moveTo(px - 0.1 * S, y0 - 0.3 * S).lineTo(px + 0.1 * S, y0 - 0.22 * S); g.moveTo(px - 0.1 * S, y0 - 0.45 * S).lineTo(px + 0.1 * S, y0 - 0.37 * S); }   // vendas cruzadas
  }
  const torsoY = y0 - altoPierna;                                  // cintura
  const hombroY = torsoY - 0.75 * S;
  // túnica larga musulmana por debajo del cinturón (si hay sobrevesta)
  if (esMusulman && conSobrevesta && !montado) { linea(0.05); relleno(eq.color).drawRoundedRect(-0.3 * S + inclina, torsoY - 0.3 * S, 0.6 * S, 0.5 * S, 0.08 * S).endFill(); }
  // cuerpo: armadura
  linea(0.06); relleno(colorArmadura).drawRoundedRect(-0.32 * S + inclina, torsoY - 0.85 * S, 0.64 * S, 0.9 * S, 0.14 * S).endFill();
  sinLinea();
  if (armadura === 'gambeson') {
    // acolchado: líneas horizontales
    g.lineStyle(0.025 * S, colorArmaduraSombra, 0.8);
    for (let yy = 0; yy < 6; yy++) { const ly = torsoY - 0.75 * S + yy * 0.13 * S; g.moveTo(-0.28 * S + inclina, ly).lineTo(0.28 * S + inclina, ly); }
    sinLinea();
  } else if (lamelar) {
    // lamelar: bandas horizontales con placas pequeñas
    relleno(oscurecer(P.ACERO, 0.85)); for (let yy = 0; yy < 6; yy++) g.drawRect(-0.28 * S + inclina, torsoY - 0.78 * S + yy * 0.13 * S, 0.56 * S, 0.06 * S); g.endFill();
    relleno(P.ACERO_SOMBRA, 0.5); for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) g.drawRect(-0.26 * S + xx * 0.09 * S + inclina, torsoY - 0.78 * S + yy * 0.13 * S, 0.02 * S, 0.06 * S); g.endFill();
  } else if (armadura === 'cota') {
    // malla punteada
    relleno(colorArmaduraSombra, 0.6); for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 5; xx++) g.drawCircle(-0.24 * S + xx * 0.12 * S + (yy % 2) * 0.06 * S + inclina, torsoY - 0.78 * S + yy * 0.12 * S, 0.025 * S); g.endFill();
  } else if (armadura === 'placas') {
    // peto con brillo y línea central
    relleno(0xffffff, 0.35).drawRoundedRect(-0.24 * S + inclina, torsoY - 0.8 * S, 0.14 * S, 0.5 * S, 0.06 * S).endFill();
    g.lineStyle(0.025 * S, P.PLACAS_SOMBRA).moveTo(inclina, torsoY - 0.8 * S).lineTo(inclina, torsoY - 0.2 * S); sinLinea();
  }
  // sobrevesta (nivel ≥ 1) con los esmaltes del reino; la leva lleva solo una banda al brazo y una faja
  if (conSobrevesta) {
    const altoSobrevesta = armadura === 'placas' ? 0.5 * S : 0.74 * S;      // los veteranos enseñan el peto
    const topeSobrevesta = armadura === 'placas' ? torsoY - 0.56 * S : torsoY - 0.82 * S;
    relleno(eq.color).drawRect(-0.24 * S + inclina, topeSobrevesta, 0.48 * S, altoSobrevesta).endFill();
    if (esCruzado) {
      // cruz en el pecho con el esmalte secundario
      relleno(eq.colorSecundario).drawRect(-0.05 * S + inclina, topeSobrevesta + 0.08 * S, 0.1 * S, altoSobrevesta - 0.16 * S).drawRect(-0.18 * S + inclina, topeSobrevesta + 0.2 * S, 0.36 * S, 0.1 * S).endFill();
    } else if (esTribu) {
      // franjas pintadas
      relleno(eq.colorSecundario).drawRect(-0.24 * S + inclina, topeSobrevesta + 0.15 * S, 0.48 * S, 0.07 * S).drawRect(-0.24 * S + inclina, topeSobrevesta + 0.4 * S, 0.48 * S, 0.07 * S).endFill();
    } else {
      relleno(eq.colorSecundario).drawRect(-0.07 * S + inclina, topeSobrevesta, 0.14 * S, altoSobrevesta).endFill();
    }
  } else {
    relleno(eq.color).drawRect(-0.32 * S + inclina, torsoY - 0.32 * S, 0.64 * S, 0.12 * S).endFill();                    // faja
  }
  relleno(0x000000, 0.18).drawRect(0.04 * S + inclina, torsoY - 0.85 * S, 0.28 * S, 0.9 * S).endFill();                 // sombra del lado derecho
  relleno(0x000000, 0.1).drawRect(-0.32 * S + inclina, torsoY - 0.42 * S, 0.64 * S, 0.22 * S).endFill();               // sombra sobre el cinturón
  if (conSobrevesta) { g.lineStyle(0.02 * S, 0x000000, 0.18); g.moveTo(-0.14 * S + inclina, torsoY - 0.75 * S).lineTo(-0.16 * S + inclina, torsoY - 0.3 * S); g.moveTo(0.1 * S + inclina, torsoY - 0.7 * S).lineTo(0.13 * S + inclina, torsoY - 0.32 * S); sinLinea(); }   // pliegues
  relleno(0xffffff, 0.14).drawEllipse(-0.2 * S + inclina, torsoY - 0.72 * S, 0.08 * S, 0.14 * S).endFill();             // brillo del hombro izquierdo
  relleno(esTribu ? P.CUERO : P.BOTA).drawRect(-0.32 * S + inclina, torsoY - 0.2 * S, 0.64 * S, 0.08 * S).endFill();   // cinturón
  if (nivel >= 3 && !esTribu) { relleno(P.ORO).drawRect(-0.05 * S + inclina, torsoY - 0.21 * S, 0.1 * S, 0.1 * S).endFill(); }   // hebilla dorada
  // capa de pieles de las tribus sobre los hombros
  if (esTribu) { linea(0.05); relleno(P.PIEL_ANIMAL).drawRoundedRect(-0.38 * S + inclina, hombroY - 0.1 * S, 0.76 * S, 0.26 * S, 0.1 * S).endFill(); sinLinea(); relleno(P.PIEL_ANIMAL_CLARA, 0.6).drawRoundedRect(-0.34 * S + inclina, hombroY - 0.06 * S, 0.3 * S, 0.12 * S, 0.05 * S).endFill(); }
  // hombreras (hombres de armas y veteranos)
  if (nivel >= 2 && !esTribu && (pesado || nivel >= 3)) { for (const s of [-1, 1]) { linea(0.04); relleno(armadura === 'placas' ? P.PLACAS : P.ACERO).drawCircle(s * 0.3 * S + inclina, hombroY + 0.02 * S, 0.1 * S).endFill(); } }
  // brazos: el de la espada (lado del frente) y el del escudo
  const colorBrazo = esTribu && nivel < 2 ? P.PIEL : colorArmadura;
  const brazo = (bx, by, dx, dy, color) => { linea(0.05); relleno(color).drawRoundedRect(Math.min(bx, bx + dx) - 0.07 * S, Math.min(by, by + dy) - 0.07 * S, Math.abs(dx) + 0.14 * S, Math.abs(dy) + 0.14 * S, 0.07 * S).endFill(); };
  const brazoArmaX = (fy >= 0 ? -lado : lado) * 0.28 * S + inclina;   // el brazo del arma queda al lado contrario del escudo
  // cabeza
  const cabezaY = hombroY - 0.27 * S;
  sinLinea(); relleno(0x000000, 0.22).drawEllipse(inclina, hombroY - 0.06 * S, 0.14 * S, 0.06 * S).endFill();           // sombra del cuello
  linea(0.05); relleno(P.PIEL).drawCircle(inclina, cabezaY, 0.2 * S).endFill();
  sinLinea(); relleno(0x000000, 0.12).drawEllipse(inclina + 0.08 * S, cabezaY + 0.03 * S, 0.1 * S, 0.14 * S).endFill();  // sombra de la mejilla derecha
  if (mira >= 0) {
    sinLinea(); relleno(P.PELO).drawCircle(inclina + lado * 0.07 * S, cabezaY - 0.01 * S, 0.025 * S).endFill();   // ojo
    if (esTribu || (nivel >= 2 && !esMusulman && mira > 0 && direccion === 2)) { relleno(P.BARBA).drawRoundedRect(-0.12 * S + inclina, cabezaY + 0.04 * S, 0.24 * S, 0.14 * S, 0.06 * S).endFill(); }   // barba
    if (esMusulman && nivel >= 1) { relleno(P.BARBA).drawRoundedRect(-0.1 * S + inclina, cabezaY + 0.06 * S, 0.2 * S, 0.12 * S, 0.05 * S).endFill(); }
  }
  dibujarYelmo2D(g, { S, inclina, lado, mira, cabezaY, hombroY, eq, rama, nivel, general, conYelmo, conCimera, pesado, tirador, montado, ligero, armadura, linea, sinLinea, relleno, P });
  // escudo (en el lado contrario al brazo del arma)
  if (!tirador) {
    const ex = -brazoArmaX * 0.9 + inclina, ey = hombroY + 0.1 * S + fx * 0.05 * S;
    brazo(inclina, hombroY, ex - inclina, 0.2 * S, colorBrazo);
    dibujarEscudo2D(g, { S, ex, ey, eq, rama, nivel, general, linea, sinLinea, relleno, P });
  }
  // brazo del arma y arma
  // los tiradores mantienen el arco a la altura del hombro en las tres fases; los demás arman alto y golpean adelante
  const avance = tirador ? (faseGolpe === 1 ? -0.06 * S : faseGolpe ? 0.1 * S : 0) : (faseGolpe === 1 ? -0.18 * S : faseGolpe === 2 ? 0.32 * S : faseGolpe === 3 ? 0.12 * S : 0);
  const alturaMano = tirador ? (faseGolpe ? 0.02 * S : 0.25 * S) : (faseGolpe === 1 ? -0.3 * S : faseGolpe === 2 ? -0.08 * S : faseGolpe === 3 ? 0.12 * S : 0.25 * S);
  const balanceo = montado || golpe ? 0 : -paso * 0.08 * S;                   // el brazo se balancea al andar, al contrario que la pierna
  const manoX = brazoArmaX + fx * (avance + balanceo), manoY = hombroY + alturaMano + fy * (avance + balanceo);
  brazo(inclina, hombroY, manoX - inclina, manoY - hombroY, colorBrazo);
  dibujarArma2D(g, { S, datos, fx, fy, angulo, golpe, faseGolpe, avance, manoX, manoY, rama, nivel, general, ballesta, tirador, eq, linea, sinLinea, relleno, P });
}

/* Yelmo según rama y nivel. Sin yelmo (leva): pelo, turbante, gorro de piel o capucha. */
function dibujarYelmo2D(g, c) {
  const { S, inclina, lado, cabezaY, hombroY, eq, rama, nivel, general, conYelmo, conCimera, pesado, tirador, montado, ligero, armadura, linea, sinLinea, relleno, P } = c;
  const cimera = (color, alto) => { sinLinea(); relleno(color).drawRoundedRect(-0.05 * S + inclina, cabezaY - 0.24 * S - alto, 0.1 * S, alto, 0.04 * S).endFill(); relleno(color).drawEllipse(inclina + lado * 0.02 * S, cabezaY - 0.24 * S - alto, 0.09 * S, 0.06 * S).endFill(); };
  const aventail = () => { sinLinea(); relleno(P.COTA_SOMBRA, 0.9).drawRoundedRect(-0.2 * S + inclina, cabezaY - 0.04 * S, 0.4 * S, 0.2 * S, 0.06 * S).endFill(); relleno(P.PIEL).drawRoundedRect(-0.1 * S + inclina, cabezaY - 0.06 * S, 0.2 * S, 0.12 * S, 0.04 * S).endFill(); };
  if (!conYelmo) {
    if (rama === 'musulman') {
      // turbante
      linea(0.04); relleno(P.LINO).drawEllipse(inclina, cabezaY - 0.16 * S, 0.23 * S, 0.12 * S).endFill(); relleno(P.LINO).drawEllipse(inclina, cabezaY - 0.2 * S, 0.17 * S, 0.1 * S).endFill();
      sinLinea(); relleno(eq.color).drawRect(-0.2 * S + inclina, cabezaY - 0.16 * S, 0.4 * S, 0.04 * S).endFill();
    } else if (rama === 'tribus') {
      // gorro de piel
      linea(0.04); relleno(P.PIEL_ANIMAL).drawEllipse(inclina, cabezaY - 0.15 * S, 0.24 * S, 0.13 * S).endFill(); sinLinea(); relleno(P.PIEL_ANIMAL_CLARA, 0.6).drawEllipse(inclina - 0.06 * S, cabezaY - 0.19 * S, 0.1 * S, 0.06 * S).endFill();
    } else if (tirador) {
      linea(0.05); relleno(0x5a4a35).drawPolygon([-0.22 * S + inclina, hombroY - 0.24 * S, inclina, hombroY - 0.56 * S, 0.22 * S + inclina, hombroY - 0.24 * S]).endFill();
    } else {
      // pelo o cofia acolchada
      linea(0.04); relleno(rama === 'ortodoxo' ? P.GAMBESON : P.PELO).drawEllipse(inclina, cabezaY - 0.1 * S, 0.2 * S, 0.14 * S).endFill();
    }
    return;
  }
  // tiradores de nivel bajo: capucha de cuero con casquete
  if (tirador && nivel <= 1 && !pesado) {
    linea(0.05); relleno(0x5a4a35).drawPolygon([-0.22 * S + inclina, hombroY - 0.24 * S, inclina, hombroY - 0.56 * S, 0.22 * S + inclina, hombroY - 0.24 * S]).endFill();
    if (nivel === 1) { sinLinea(); relleno(P.ACERO).drawEllipse(inclina, cabezaY - 0.2 * S, 0.16 * S, 0.07 * S).endFill(); }
    return;
  }
  const colorYelmo = armadura === 'placas' ? P.PLACAS : P.ACERO, sombraYelmo = armadura === 'placas' ? P.PLACAS_SOMBRA : P.ACERO_SOMBRA;
  if (nivel >= 2 && !tirador) aventail();
  const brilloYelmo = () => { sinLinea(); relleno(0xffffff, 0.35).drawEllipse(inclina - 0.09 * S, cabezaY - 0.36 * S, 0.05 * S, 0.07 * S).endFill(); };
  if (rama === 'musulman') {
    // yelmo apuntado con banda de turbante
    linea(0.05); relleno(colorYelmo).drawPolygon([-0.21 * S + inclina, cabezaY - 0.08 * S, inclina, cabezaY - 0.5 * S, 0.21 * S + inclina, cabezaY - 0.08 * S]).endFill();
    sinLinea(); relleno(sombraYelmo, 0.6).drawPolygon([0.03 * S + inclina, cabezaY - 0.1 * S, 0.05 * S + inclina, cabezaY - 0.4 * S, 0.19 * S + inclina, cabezaY - 0.1 * S]).endFill();
    relleno(P.LINO).drawRoundedRect(-0.22 * S + inclina, cabezaY - 0.16 * S, 0.44 * S, 0.09 * S, 0.04 * S).endFill();
    if (nivel >= 2) { relleno(colorYelmo).drawRect(-0.025 * S + inclina, cabezaY - 0.1 * S, 0.05 * S, 0.14 * S).endFill(); }   // nasal
    if (conCimera) { linea(0.03); relleno(P.ORO).drawPolygon([inclina - 0.04 * S, cabezaY - 0.5 * S, inclina + 0.04 * S, cabezaY - 0.5 * S, inclina, cabezaY - 0.66 * S - (general ? 0.08 * S : 0)]).endFill(); sinLinea(); relleno(eq.colorSecundario).drawPolygon([inclina, cabezaY - 0.62 * S, inclina + lado * 0.16 * S, cabezaY - 0.58 * S, inclina, cabezaY - 0.54 * S]).endFill(); }   // punta con banderín
  } else if (rama === 'ortodoxo') {
    // yelmo cónico con ribete
    linea(0.05); relleno(colorYelmo).drawPolygon([-0.21 * S + inclina, cabezaY - 0.1 * S, -0.1 * S + inclina, cabezaY - 0.48 * S, 0.1 * S + inclina, cabezaY - 0.48 * S, 0.21 * S + inclina, cabezaY - 0.1 * S]).endFill();
    sinLinea(); relleno(sombraYelmo, 0.6).drawPolygon([0.03 * S + inclina, cabezaY - 0.12 * S, 0.06 * S + inclina, cabezaY - 0.46 * S, 0.19 * S + inclina, cabezaY - 0.12 * S]).endFill();
    relleno(P.ORO, nivel >= 2 ? 1 : 0.5).drawRect(-0.21 * S + inclina, cabezaY - 0.14 * S, 0.42 * S, 0.04 * S).endFill();
    if (conCimera) cimera(eq.colorSecundario, (general ? 0.3 : 0.22) * S);
  } else if (rama === 'tribus') {
    // casco de bandas con ribete de piel; los veteranos llevan cuernos cortos de hueso
    linea(0.05); relleno(colorYelmo).drawRoundedRect(-0.21 * S + inclina, cabezaY - 0.44 * S, 0.42 * S, 0.3 * S, 0.16 * S).endFill();
    sinLinea(); relleno(P.PIEL_ANIMAL).drawRect(-0.23 * S + inclina, cabezaY - 0.18 * S, 0.46 * S, 0.08 * S).endFill();
    g.lineStyle(0.025 * S, sombraYelmo).moveTo(inclina, cabezaY - 0.44 * S).lineTo(inclina, cabezaY - 0.18 * S).moveTo(-0.14 * S + inclina, cabezaY - 0.4 * S).lineTo(-0.14 * S + inclina, cabezaY - 0.18 * S).moveTo(0.14 * S + inclina, cabezaY - 0.4 * S).lineTo(0.14 * S + inclina, cabezaY - 0.18 * S); sinLinea();
    if (nivel >= 2) relleno(colorYelmo).drawRect(-0.025 * S + inclina, cabezaY - 0.2 * S, 0.05 * S, 0.16 * S).endFill();
    if (conCimera) { linea(0.03); for (const s of [-1, 1]) relleno(P.LINO).drawPolygon([s * 0.14 * S + inclina, cabezaY - 0.36 * S, s * 0.22 * S + inclina, cabezaY - 0.4 * S, s * 0.26 * S + inclina, cabezaY - 0.6 * S - (general ? 0.06 * S : 0), s * 0.18 * S + inclina, cabezaY - 0.44 * S]).endFill(); }
  } else if ((rama === 'cruzado' && (pesado || nivel >= 2)) || (rama === 'cristiano' && montado && !ligero && nivel >= 2) || (rama === 'cristiano' && pesado && nivel >= 3)) {
    // gran yelmo cerrado con ranura y cruz
    linea(0.05); relleno(colorYelmo).drawRoundedRect(-0.21 * S + inclina, cabezaY - 0.44 * S, 0.42 * S, 0.5 * S, 0.1 * S).endFill();
    sinLinea(); relleno(sombraYelmo, 0.6).drawRect(0.03 * S + inclina, cabezaY - 0.42 * S, 0.17 * S, 0.46 * S).endFill();
    relleno(P.CONTORNO).drawRect(-0.16 * S + inclina, cabezaY - 0.12 * S, 0.32 * S, 0.05 * S).endFill();
    relleno(rama === 'cruzado' ? eq.colorSecundario : P.ORO_SOMBRA, rama === 'cruzado' ? 1 : 0.8).drawRect(-0.02 * S + inclina, cabezaY - 0.4 * S, 0.04 * S, 0.42 * S).drawRect(-0.12 * S + inclina, cabezaY - 0.15 * S, 0.24 * S, 0.04 * S).endFill();
    if (conCimera) cimera(eq.colorSecundario, (general ? 0.32 : 0.22) * S);
  } else if (pesado) {
    // casco normando con nasal
    linea(0.05); relleno(colorYelmo).drawRoundedRect(-0.21 * S + inclina, cabezaY - 0.44 * S, 0.42 * S, 0.34 * S, 0.14 * S).endFill();
    sinLinea(); relleno(sombraYelmo, 0.6).drawRect(0.03 * S + inclina, cabezaY - 0.42 * S, 0.17 * S, 0.3 * S).endFill();
    relleno(colorYelmo).drawRect(-0.03 * S + inclina + lado * 0.06 * S, cabezaY - 0.24 * S, 0.06 * S, 0.14 * S).endFill();
    if (conCimera) cimera(eq.colorSecundario, (general ? 0.3 : 0.2) * S);
  } else {
    // capacete de ala
    linea(0.05); relleno(colorYelmo).drawEllipse(inclina, cabezaY - 0.28 * S, 0.3 * S, 0.08 * S).endFill();
    relleno(colorYelmo).drawRoundedRect(-0.18 * S + inclina, cabezaY - 0.46 * S, 0.36 * S, 0.22 * S, 0.12 * S).endFill();
    sinLinea(); relleno(sombraYelmo, 0.6).drawRect(0.03 * S + inclina, cabezaY - 0.44 * S, 0.14 * S, 0.18 * S).endFill();
    if (conCimera) cimera(eq.colorSecundario, (general ? 0.26 : 0.18) * S);
  }
  brilloYelmo();
}

/* Escudo según rama: almendra (cristiano), lágrima con cruz griega (ortodoxo), redondo con umbo (musulmán), blasón con cruz
   (cruzado), redondo de tablas (tribus). Los veteranos y el general llevan ribete dorado. */
function dibujarEscudo2D(g, c) {
  const { S, ex, ey, eq, rama, nivel, general, linea, sinLinea, relleno, P } = c;
  const ribete = nivel >= 3 || general;
  const sombra = poligono => { sinLinea(); relleno(0x000000, 0.18).drawPolygon(poligono).endFill(); };
  if (rama === 'musulman' || rama === 'tribus') {
    const r = 0.26 * S;
    linea(ribete ? 0.06 : 0.05);
    if (ribete) g.lineStyle(0.06 * S, P.ORO_SOMBRA, 1, 0.5);
    relleno(rama === 'tribus' ? P.MADERA_CLARA : eq.colorSecundario).drawCircle(ex, ey, r).endFill();
    sinLinea();
    if (rama === 'tribus') {
      // tablas y refuerzo pintado con el color del reino
      g.lineStyle(0.025 * S, P.MADERA).moveTo(ex - 0.09 * S, ey - r).lineTo(ex - 0.09 * S, ey + r).moveTo(ex + 0.09 * S, ey - r).lineTo(ex + 0.09 * S, ey + r); sinLinea();
      relleno(eq.color).drawRect(ex - r, ey - 0.05 * S, 2 * r, 0.1 * S).endFill();
    } else {
      relleno(eq.color).drawCircle(ex, ey, r * 0.6).endFill();
      relleno(eq.colorSecundario).drawCircle(ex, ey, r * 0.32).endFill();
    }
    relleno(0x000000, 0.18).drawPolygon([ex, ey - r, ex + r, ey - r * 0.3, ex + r, ey + r * 0.3, ex, ey + r]).endFill();
    linea(0.04); relleno(P.ACERO).drawCircle(ex, ey, 0.06 * S).endFill();
    sinLinea(); relleno(0xffffff, 0.22).drawEllipse(ex - 0.11 * S, ey - 0.13 * S, 0.07 * S, 0.05 * S).endFill();   // brillo
    return;
  }
  if (rama === 'cruzado' || nivel >= 3) {
    // escudo de blasón (heráldico), con cruz en los cruzados
    const forma = [ex - 0.22 * S, ey - 0.3 * S, ex + 0.22 * S, ey - 0.3 * S, ex + 0.22 * S, ey, ex, ey + 0.3 * S, ex - 0.22 * S, ey];
    if (ribete) g.lineStyle(0.06 * S, P.ORO_SOMBRA, 1, 0.5); else linea(0.05);
    relleno(eq.colorSecundario).drawPolygon(forma).endFill();
    sinLinea();
    if (rama === 'cruzado') relleno(eq.color).drawRect(ex - 0.05 * S, ey - 0.28 * S, 0.1 * S, 0.5 * S).drawRect(ex - 0.18 * S, ey - 0.16 * S, 0.36 * S, 0.1 * S).endFill();
    else relleno(eq.color).drawRect(ex - 0.05 * S, ey - 0.3 * S, 0.1 * S, 0.6 * S).endFill();
    sombra([ex + 0.02 * S, ey - 0.3 * S, ex + 0.22 * S, ey - 0.3 * S, ex + 0.22 * S, ey, ex, ey + 0.3 * S, ex + 0.02 * S, ey + 0.28 * S]);
    linea(0.04); relleno(P.ACERO).drawCircle(ex, ey - 0.02 * S, 0.05 * S).endFill();
    sinLinea(); relleno(0xffffff, 0.2).drawRect(ex - 0.18 * S, ey - 0.27 * S, 0.1 * S, 0.05 * S).endFill();   // brillo
    return;
  }
  // almendra (cristiano) o lágrima (ortodoxo)
  const forma = rama === 'ortodoxo'
    ? [ex - 0.18 * S, ey - 0.26 * S, ex, ey - 0.34 * S, ex + 0.18 * S, ey - 0.26 * S, ex + 0.16 * S, ey + 0.05 * S, ex, ey + 0.34 * S, ex - 0.16 * S, ey + 0.05 * S]
    : [ex - 0.2 * S, ey - 0.3 * S, ex + 0.2 * S, ey - 0.3 * S, ex + 0.2 * S, ey + 0.05 * S, ex, ey + 0.32 * S, ex - 0.2 * S, ey + 0.05 * S];
  linea(0.05); relleno(eq.colorSecundario).drawPolygon(forma).endFill();
  sinLinea();
  if (rama === 'ortodoxo') relleno(eq.color).drawRect(ex - 0.04 * S, ey - 0.2 * S, 0.08 * S, 0.3 * S).drawRect(ex - 0.13 * S, ey - 0.09 * S, 0.26 * S, 0.08 * S).endFill();
  else relleno(eq.color).drawRect(ex - 0.05 * S, ey - 0.3 * S, 0.1 * S, 0.5 * S).endFill();
  sombra([ex + 0.02 * S, ey - 0.3 * S, ex + 0.2 * S, ey - 0.3 * S, ex + 0.2 * S, ey + 0.05 * S, ex, ey + 0.32 * S, ex + 0.02 * S, ey + 0.3 * S]);
  linea(0.04); relleno(P.ACERO).drawCircle(ex, ey - 0.02 * S, 0.05 * S).endFill();
  sinLinea(); relleno(0xffffff, 0.2).drawRect(ex - 0.16 * S, ey - 0.27 * S, 0.1 * S, 0.05 * S).endFill();   // brillo
}

/* Arma de mano según tipo y rama: lanza, ballesta, arco, hacha (tribus), sable curvo (musulmán) o espada recta. */
function dibujarArma2D(g, c) {
  const { S, datos, fx, fy, angulo, golpe, faseGolpe, avance, manoX, manoY, rama, nivel, general, ballesta, tirador, eq, linea, sinLinea, relleno, P } = c;
  const empunaduraOro = nivel >= 3 || general;
  if (datos.clave === 'lanceros') {
    // Lanza: en reposo apoyada en diagonal sobre el hombro; al armar (1) se recoge atrás y se baja a la horizontal;
    // al golpear (2) se lanza hacia el frente con las dos manos (la punta llega 2 m por delante); al recoger (3) vuelve a medias.
    let baseX, baseY, puntaX, puntaY;
    if (faseGolpe === 0) { baseX = manoX - fx * 0.5 * S; baseY = manoY + 0.5 * S - fy * 0.5 * S; puntaX = manoX + fx * 0.9 * S; puntaY = manoY - 1.4 * S + fy * 0.9 * S; }
    else {
      const alcance = faseGolpe === 1 ? 0.55 : faseGolpe === 2 ? 2.1 : 1.3, retraso = faseGolpe === 1 ? 1.0 : faseGolpe === 2 ? 0.25 : 0.6;
      const alturaLanza = faseGolpe === 1 ? 0.05 * S : -0.12 * S;
      baseX = manoX - fx * retraso * S; baseY = manoY + alturaLanza - fy * retraso * S;
      puntaX = manoX + fx * alcance * S; puntaY = manoY + alturaLanza + fy * alcance * S;
      // segunda mano sobre el asta, por delante de la primera
      sinLinea(); relleno(P.PIEL).drawCircle(manoX + fx * 0.3 * S, manoY + alturaLanza + fy * 0.3 * S, 0.07 * S).endFill();
    }
    const dirX = puntaX - baseX, dirY = puntaY - baseY, largo = Math.hypot(dirX, dirY) || 1, ux = dirX / largo, uy = dirY / largo, vx = -uy, vy = ux;
    g.lineStyle(0.07 * S, P.MADERA).moveTo(baseX, baseY).lineTo(puntaX, puntaY);
    if (faseGolpe) { g.lineStyle(0.07 * S, P.MADERA_CLARA, 0.5).moveTo(baseX, baseY).lineTo(baseX + ux * 0.3 * S, baseY + uy * 0.3 * S); }   // brillo del asta en movimiento
    // moharra orientada según el asta
    linea(0.03); relleno(P.ACERO).drawPolygon([puntaX - ux * 0.06 * S + vx * 0.07 * S, puntaY - uy * 0.06 * S + vy * 0.07 * S, puntaX - ux * 0.06 * S - vx * 0.07 * S, puntaY - uy * 0.06 * S - vy * 0.07 * S, puntaX + ux * 0.32 * S, puntaY + uy * 0.32 * S]).endFill();
    sinLinea(); relleno(0xffffff, 0.3).drawPolygon([puntaX - ux * 0.04 * S, puntaY - uy * 0.04 * S, puntaX + ux * 0.26 * S, puntaY + uy * 0.26 * S, puntaX + ux * 0.06 * S + vx * 0.03 * S, puntaY + uy * 0.06 * S + vy * 0.03 * S]).endFill();   // brillo de la moharra
    // distintivo bajo la moharra según la rama
    const bx = puntaX - ux * 0.12 * S, by = puntaY - uy * 0.12 * S;
    if (rama === 'tribus') { relleno(P.LINO).drawPolygon([bx + vx * 0.09 * S, by + vy * 0.09 * S, bx - vx * 0.09 * S, by - vy * 0.09 * S, bx - vx * 0.09 * S - ux * 0.06 * S, by - vy * 0.09 * S - uy * 0.06 * S, bx + vx * 0.09 * S - ux * 0.06 * S, by + vy * 0.09 * S - uy * 0.06 * S]).endFill(); }   // atadura de cuero
    else if (rama === 'musulman') { relleno(eq.colorSecundario).drawPolygon([bx, by, bx - ux * 0.3 * S + vx * 0.14 * S, by - uy * 0.3 * S + vy * 0.14 * S, bx - ux * 0.38 * S + vx * 0.04 * S, by - uy * 0.38 * S + vy * 0.04 * S]).endFill(); }   // borla
    else if (rama === 'ortodoxo' || rama === 'cruzado' || (rama === 'cristiano' && (nivel >= 2 || general))) {
      // pendón (dos puntas) con los esmaltes del reino; los cruzados llevan la cruz
      relleno(eq.color).drawPolygon([bx, by, bx - ux * 0.42 * S + vx * 0.16 * S, by - uy * 0.42 * S + vy * 0.16 * S, bx - ux * 0.3 * S + vx * 0.1 * S, by - uy * 0.3 * S + vy * 0.1 * S, bx - ux * 0.42 * S + vx * 0.04 * S, by - uy * 0.42 * S + vy * 0.04 * S]).endFill();
      relleno(eq.colorSecundario).drawRect(bx - ux * 0.2 * S + vx * 0.06 * S - 0.02 * S, by - uy * 0.2 * S + vy * 0.06 * S - 0.02 * S, 0.05 * S, 0.05 * S).endFill();
    }
    return;
  }
  if (ballesta) {
    const cx = manoX + fx * 0.3 * S, cy = manoY - 0.05 * S + fy * 0.3 * S;
    g.lineStyle(0.1 * S, P.MADERA).moveTo(manoX - fx * 0.1 * S, manoY).lineTo(cx + fx * 0.25 * S, cy + fy * 0.25 * S);
    g.lineStyle(0.06 * S, P.ACERO).moveTo(cx - fy * 0.35 * S, cy + fx * 0.18 * S).lineTo(cx + fy * 0.35 * S, cy - fx * 0.18 * S);
    return;
  }
  if (tirador) {
    // arco: los musulmanes y las tribus llevan arco corto recurvado
    const radio = (rama === 'musulman' || rama === 'tribus') ? 0.4 * S : 0.5 * S;
    g.lineStyle(0.06 * S, rama === 'musulman' ? P.MADERA_CLARA : P.MADERA).arc(manoX, manoY - 0.1 * S, radio, -Math.PI / 2 + angulo, Math.PI / 2 + angulo);
    const extremoA = [manoX + Math.cos(-Math.PI / 2 + angulo) * radio, manoY - 0.1 * S + Math.sin(-Math.PI / 2 + angulo) * radio];
    const extremoB = [manoX + Math.cos(Math.PI / 2 + angulo) * radio, manoY - 0.1 * S + Math.sin(Math.PI / 2 + angulo) * radio];
    if (faseGolpe === 1) {
      // tensar: la cuerda forma un ángulo hacia atrás y la flecha está encocada
      const tiroX = manoX - fx * 0.35 * S, tiroY = manoY - 0.1 * S - fy * 0.35 * S;
      g.lineStyle(0.03 * S, P.CUERDA).moveTo(extremoA[0], extremoA[1]).lineTo(tiroX, tiroY).lineTo(extremoB[0], extremoB[1]);
      g.lineStyle(0.04 * S, P.CUERDA).moveTo(tiroX, tiroY).lineTo(manoX + fx * 0.5 * S, manoY - 0.1 * S + fy * 0.5 * S);
    } else {
      g.lineStyle(0.03 * S, P.CUERDA).moveTo(extremoA[0], extremoA[1]).lineTo(extremoB[0], extremoB[1]);
      if (faseGolpe === 2) g.lineStyle(0.04 * S, P.CUERDA).moveTo(manoX + fx * 0.3 * S, manoY - 0.1 * S).lineTo(manoX + fx * 0.75 * S, manoY - 0.1 * S + fy * 0.5 * S);   // flecha saliendo
    }
    return;
  }
  // dirección de la hoja: en reposo alta; al armar (1) más alta y atrás; al golpear (2) adelante y abajo; al recoger (3) media
  const alzado = faseGolpe === 1 ? -0.1 * S : faseGolpe === 2 ? 0.6 * S : faseGolpe === 3 ? 0.2 * S : 0;
  const dx = fx * (0.5 * S + avance * 0.5) * (faseGolpe === 1 ? 0.35 : 1) - (faseGolpe === 1 ? fx * 0.15 * S : 0), dy = -0.7 * S + alzado + fy * 0.4 * S;
  if (rama === 'tribus') {
    // hacha: mango de madera y hoja de media luna
    g.lineStyle(0.07 * S, P.MADERA).moveTo(manoX - dx * 0.2, manoY - dy * 0.2).lineTo(manoX + dx, manoY + dy);
    const hx = manoX + dx * 0.95, hy = manoY + dy * 0.95, ladoHoja = Math.sign(fx) || 1;
    linea(0.03); relleno(P.ACERO).drawPolygon([hx, hy - 0.1 * S, hx + ladoHoja * 0.2 * S, hy - 0.22 * S, hx + ladoHoja * 0.26 * S, hy + 0.04 * S, hx + ladoHoja * 0.14 * S, hy + 0.18 * S, hx, hy + 0.1 * S]).endFill();
    return;
  }
  if (rama === 'musulman') {
    // sable curvo
    const curva = (Math.sign(fx) || 1) * 0.18 * S;
    g.lineStyle(0.09 * S, P.ACERO_SOMBRA).moveTo(manoX, manoY).quadraticCurveTo(manoX + dx * 0.5 + curva, manoY + dy * 0.5, manoX + dx, manoY + dy);
    g.lineStyle(0.05 * S, P.ACERO).moveTo(manoX, manoY).quadraticCurveTo(manoX + dx * 0.5 + curva, manoY + dy * 0.5, manoX + dx, manoY + dy);
    g.lineStyle(0.06 * S, empunaduraOro ? P.ORO : P.ORO_SOMBRA).moveTo(manoX - 0.08 * S, manoY + 0.03 * S).lineTo(manoX + 0.08 * S, manoY - 0.03 * S);
    sinLinea(); relleno(P.MADERA).drawCircle(manoX - dx * 0.12, manoY - dy * 0.12, 0.05 * S).endFill();
    return;
  }
  // espada recta con cruz y pomo (ortodoxo: pomo redondo grande)
  g.lineStyle(0.09 * S, P.ACERO_SOMBRA).moveTo(manoX, manoY).lineTo(manoX + dx, manoY + dy);
  g.lineStyle(0.05 * S, P.ACERO).moveTo(manoX, manoY).lineTo(manoX + dx, manoY + dy);
  g.lineStyle(0.07 * S, empunaduraOro ? P.ORO : P.ORO_SOMBRA).moveTo(manoX - 0.1 * S - dx * 0.12, manoY - dy * 0.12 + 0.05 * S).lineTo(manoX + 0.1 * S - dx * 0.12, manoY - dy * 0.12 - 0.05 * S);   // cruz
  sinLinea(); relleno(empunaduraOro ? P.ORO : P.ORO_SOMBRA).drawCircle(manoX - dx * 0.15, manoY - dy * 0.15, (rama === 'ortodoxo' ? 0.065 : 0.05) * S).endFill();                 // pomo
}

/* Caballo: gualdrapa con los esmaltes en la caballería pesada (salvo tribus), manta sencilla en la ligera y en tribus,
   testera de acero en los veteranos. Devuelve la altura de los pies del jinete. */
function dibujarCaballo2D(g, c) {
  const { S, fx, fy, lado, paso, indicePaso, eq, ligero, pesado, rama, nivel, general, linea, sinLinea, relleno, oscurecer } = c;
  const P = PALETA_SOLDADO;
  const pelo = rama === 'musulman' ? (ligero ? 0xb08a5a : 0x7a5a38) : rama === 'tribus' ? 0x8a7a5a : ligero ? 0x8a6a3a : 0x5a3a21, peloSombra = oscurecer(pelo, 0.62);
  const largo = 1.05 * S * (0.5 + 0.5 * Math.abs(fx));       // visto de frente el caballo es corto
  const hx = fx * S, hy = fy * S;
  const conGualdrapa = pesado && rama !== 'tribus' && nivel >= 1;
  const pata = (px, py, alto, color, desvio) => { linea(0.05); relleno(color).drawRoundedRect(px - 0.09 * S, py - alto, 0.18 * S, alto, 0.06 * S).endFill(); relleno(P.BOTA).drawRect(px - 0.1 * S + desvio, py - 0.1 * S, 0.2 * S, 0.1 * S).endFill(); };
  // galope: 1 y 3 patas en diagonal; 2 recogido (patas bajo el cuerpo); 4 extendido (patas abiertas)
  const zancada = paso * 0.14 * S;
  const extension = indicePaso === 2 ? -0.12 * S : indicePaso === 4 ? 0.18 * S : 0;
  const haciaDelante = fx;
  // patas traseras (detrás del cuerpo)
  pata(-hx * 0.42 - fy * 0.22 * S - extension * haciaDelante, -hy * 0.42 + 0.02 * S, 0.9 * S, peloSombra, -zancada * fx);
  pata(hx * 0.42 - fy * 0.22 * S + extension * haciaDelante, hy * 0.42 + 0.02 * S, 0.9 * S, peloSombra, zancada * fx);
  // cuerpo
  linea(0.06); relleno(pelo).drawEllipse(0, -1.0 * S, largo, 0.5 * S).endFill();
  relleno(peloSombra, 0.55).drawEllipse(lado * 0.1 * S, -0.92 * S, largo * 0.95, 0.3 * S).endFill();
  if (conGualdrapa) {
    // gualdrapa larga con ribete (los veteranos la llevan hasta las patas)
    const caida = nivel >= 3 ? 0.75 * S : 0.55 * S;
    linea(0.05); relleno(eq.colorSecundario).drawRoundedRect(-largo * 0.7, -1.05 * S, largo * 1.4, caida, 0.1 * S).endFill();
    sinLinea(); relleno(eq.color).drawRect(-largo * 0.7, -1.05 * S + caida - 0.12 * S, largo * 1.4, 0.1 * S).endFill();
    if (rama === 'cruzado') relleno(eq.color).drawRect(-0.05 * S, -1.0 * S, 0.1 * S, caida - 0.25 * S).drawRect(-0.18 * S, -0.85 * S, 0.36 * S, 0.08 * S).endFill();
    if (rama === 'ortodoxo' || rama === 'cristiano') { for (let k = -1; k <= 1; k += 2) relleno(eq.color).drawCircle(k * largo * 0.4, -0.8 * S, 0.07 * S).endFill(); }
  } else {
    // manta de silla
    linea(0.05); relleno(rama === 'tribus' ? P.PIEL_ANIMAL : eq.colorSecundario).drawRoundedRect(-0.4 * S, -1.15 * S, 0.8 * S, 0.45 * S, 0.08 * S).endFill();
    sinLinea(); relleno(eq.color).drawRect(-0.4 * S, -0.82 * S, 0.8 * S, 0.08 * S).endFill();
  }
  // cuello y cabeza hacia el frente
  linea(0.06); relleno(pelo).drawPolygon([hx * 0.55, hy * 0.55 - 1.15 * S, hx * 0.95, hy * 0.95 - 1.75 * S, hx * 0.95 + 0.25 * S * Math.abs(fy), hy * 0.95 - 1.5 * S, hx * 0.6 + 0.2 * S, hy * 0.6 - 0.9 * S]).endFill();
  relleno(oscurecer(pelo, 0.8)).drawRoundedRect(hx * 0.82 - 0.2 * S, hy * 0.82 - 1.95 * S, 0.5 * S, 0.32 * S, 0.1 * S).endFill();
  if (nivel >= 3 && pesado && rama !== 'tribus') { sinLinea(); relleno(P.PLACAS).drawRoundedRect(hx * 0.82 - 0.16 * S, hy * 0.82 - 1.93 * S, 0.42 * S, 0.2 * S, 0.08 * S).endFill(); }   // testera
  if (general) { sinLinea(); relleno(eq.colorSecundario).drawPolygon([hx * 0.86, hy * 0.86 - 1.95 * S, hx * 0.86 + 0.06 * S, hy * 0.86 - 2.25 * S, hx * 0.86 + 0.12 * S, hy * 0.86 - 1.95 * S]).endFill(); }   // penacho del caballo del general
  relleno(P.BOTA).drawPolygon([hx * 0.8 - 0.12 * S, hy * 0.8 - 1.95 * S, hx * 0.8 - 0.04 * S, hy * 0.8 - 2.12 * S, hx * 0.8 + 0.04 * S, hy * 0.8 - 1.95 * S]).endFill();   // oreja
  g.lineStyle(0.1 * S, P.BOTA).moveTo(hx * 0.58, hy * 0.58 - 1.3 * S).lineTo(hx * 0.9, hy * 0.9 - 1.8 * S);                       // crin
  g.lineStyle(0.1 * S, P.BOTA).moveTo(-hx * 0.9, -hy * 0.9 - 0.95 * S).lineTo(-hx * 1.1, -hy * 1.1 - 0.5 * S);                   // cola
  // patas delanteras (delante del cuerpo)
  pata(-hx * 0.42 + fy * 0.22 * S - extension * haciaDelante, -hy * 0.42 + 0.06 * S, 0.9 * S, pelo, zancada * fx);
  pata(hx * 0.42 + fy * 0.22 * S + extension * haciaDelante, hy * 0.42 + 0.06 * S, 0.9 * S, pelo, -zancada * fx);
  // brillo del cuello y de la grupa (luz desde arriba a la izquierda)
  sinLinea(); relleno(0xffffff, 0.16).drawEllipse(hx * 0.6 - 0.1 * S, hy * 0.6 - 1.45 * S, 0.08 * S, 0.22 * S).endFill(); relleno(0xffffff, 0.12).drawEllipse(-0.25 * S, -1.18 * S, 0.3 * S, 0.1 * S).endFill();
  return -1.25 * S;
}

/* Cadáver: cuerpo tumbado en la dirección del frente, cabeza al extremo, escudo caído. */
function dibujarCadaver2D(g, c) {
  const { S, fx, fy, eq, montado, ligero, tirador, colorArmadura, esTribu, esMusulman, linea, relleno } = c;
  const P = PALETA_SOLDADO;
  const lx = fx * S, ly = fy * S;
  linea(0.05); relleno(0x1a1410, 0.35).drawEllipse(0, -0.05 * S, 1.0 * S, 0.42 * S).endFill();
  if (montado) { linea(0.05); relleno(ligero ? 0x8a6a3a : 0x5a3a21).drawEllipse(-fx * 0.5 * S, -fy * 0.5 * S - 0.1 * S, 1.1 * S, 0.5 * S).endFill(); }
  linea(0.05); relleno(colorArmadura).drawRoundedRect(-0.42 * S + lx * 0.1, -0.5 * S + ly * 0.1, 0.84 * S, 0.5 * S, 0.14 * S).endFill();
  relleno(eq.color).drawRect(-0.34 * S + lx * 0.1, -0.44 * S + ly * 0.1, 0.68 * S, 0.3 * S).endFill();
  relleno(eq.colorSecundario).drawRect(-0.34 * S + lx * 0.1, -0.33 * S + ly * 0.1, 0.68 * S, 0.08 * S).endFill();
  linea(0.05); relleno(P.PIEL).drawCircle(lx * 0.72, ly * 0.72 - 0.28 * S, 0.17 * S).endFill();
  if (!tirador) {
    linea(0.04);
    if (esTribu || esMusulman) relleno(esTribu ? P.MADERA_CLARA : eq.colorSecundario).drawCircle(-lx * 0.6, -ly * 0.6 - 0.3 * S, 0.24 * S).endFill();
    else relleno(eq.colorSecundario).drawRoundedRect(-lx * 0.6 - 0.22 * S, -ly * 0.6 - 0.55 * S, 0.44 * S, 0.5 * S, 0.12 * S).endFill();
  }
}
