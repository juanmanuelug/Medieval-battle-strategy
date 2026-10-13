'use strict';
/* ---------- Ejércitos: tienda del jugador y reclutamiento de la IA ----------
   Una entrada de ejército es { tipo, nivel } (nivel = índice en NIVELES); los soldados y el precio salen de los datos. */
function soldadosDeUnidad(ramaClave, tipo) { const rama = RAMAS[ramaClave]; return Math.round(TROPA[tipo].tamano * (rama.extraSoldados || 1)); }
function precioUnidad(ramaClave, tipo, nivel) {
  const rama = RAMAS[ramaClave], b = (rama.bonificaciones || {})[tipo] || {};
  return Math.round(soldadosDeUnidad(ramaClave, tipo) * TROPA[tipo].precio * NIVELES[nivel].multPrecio * (b.precio || 1));
}
// Multiplicadores que recibe la simulación para esa unidad
function modificadoresUnidad(ramaClave, tipo, nivel) {
  const rama = RAMAS[ramaClave], b = (rama.bonificaciones || {})[tipo] || {}, n = NIVELES[nivel];
  return { vida: n.multStats * (b.vida || 1), dano: n.multStats * (b.dano || 1), velocidad: (b.velocidad || 1), moral: rama.moral * n.multMoral };
}
function nombreUnidad(tipo, nivel) { return `${TIPOS[TIPO[tipo]].nombre} (${NIVELES[nivel].nombre.toLowerCase()})`; }
function costeEjercito(ramaClave, ejercito) { return ejercito.reduce((s, e) => s + precioUnidad(ramaClave, e.tipo, e.nivel), 0); }
function resumenEjercito(ramaClave, ejercito) {
  const porTipo = {};
  for (const e of ejercito) { const k = e.tipo + ':' + e.nivel; porTipo[k] = porTipo[k] || { tipo: e.tipo, nivel: e.nivel, unidades: 0, soldados: 0, precio: 0 }; porTipo[k].unidades++; porTipo[k].soldados += soldadosDeUnidad(ramaClave, e.tipo); porTipo[k].precio += precioUnidad(ramaClave, e.tipo, e.nivel); }
  return Object.values(porTipo).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nivel - b.nivel);
}
/* La IA recluta con un presupuesto: primero una base de infantería, luego reparte entre arqueros, caballería y más
   infantería según unos pesos; el nivel sube con la dificultad (sesgoNivel) y con algo de azar. */
/* Recluta el ejército de la IA con `presupuesto` de oro. `referencia` = { nivelMedio, soldados } del ejército del jugador:
   la IA compra con un nivel medio parecido (más `sesgoNivel`, que depende de la dificultad) para que, a igual oro, saque
   un número de soldados parecido en vez de llenar el campo de leva barata; y no pasa de `soldados × topeSoldados`.
   Si llega al tope con oro sobrante, lo gasta subiendo de nivel unidades ya compradas. */
function reclutarIA(ramaClave, presupuesto, sesgoNivel, azar, referencia) {
  const ejercito = [];
  let oro = presupuesto;
  const nivelCentro = referencia ? referencia.nivelMedio + sesgoNivel : 1 + sesgoNivel;
  const topeSoldados = referencia ? Math.max(referencia.soldados * Math.max(0.6, presupuesto / Math.max(1, referencia.coste || presupuesto)) * 1.3, 40) : Infinity;
  const soldadosComprados = () => ejercito.reduce((s, e) => s + soldadosDeUnidad(ramaClave, e.tipo), 0);
  const elegirNivel = () => limitar(Math.round(nivelCentro + (azar.numero() - 0.5) * 1.4), 0, NIVELES.length - 1);
  const comprar = tipo => {
    if (soldadosComprados() + soldadosDeUnidad(ramaClave, tipo) > topeSoldados) return false;
    let nivel = elegirNivel();
    while (nivel > 0 && precioUnidad(ramaClave, tipo, nivel) > oro) nivel--;      // si no llega, baja de nivel
    const p = precioUnidad(ramaClave, tipo, nivel); if (p > oro) return false;
    oro -= p; ejercito.push({ tipo, nivel }); return true;
  };
  const pesos = [['infanteriaLigera', 3], ['infanteriaPesada', 2], ['lanceros', 2], ['arqueros', 2], ['caballeriaPesada', 1.5]];
  for (const t of (RAMAS[ramaClave].exclusivas || [])) pesos.push([t, 1.8]);                              // y sus tropas exclusivas
  const b = RAMAS[ramaClave].bonificaciones || {}; for (const p of pesos) if (b[p[0]]) p[1] *= 1.5;      // la IA compra lo que su rama hace bien
  comprar('infanteriaPesada'); comprar('infanteriaLigera'); comprar('lanceros'); comprar('arqueros');
  let intentos = 0;
  while (oro > 0 && intentos++ < 60) {
    const total = pesos.reduce((s, p) => s + p[1], 0); let r = azar.numero() * total, tipo = pesos[0][0];
    for (const p of pesos) { r -= p[1]; if (r <= 0) { tipo = p[0]; break; } }
    if (!comprar(tipo)) { if (!comprar('infanteriaLigera')) break; }
  }
  // oro sobrante (por el tope de soldados): mejorar de nivel las unidades, de la más barata de subir a la más cara
  let mejoras = 0;
  while (oro > 0 && mejoras++ < 40) {
    let mejor = null, mejorCoste = Infinity;
    for (const e of ejercito) { if (e.nivel >= NIVELES.length - 1) continue; const coste = precioUnidad(ramaClave, e.tipo, e.nivel + 1) - precioUnidad(ramaClave, e.tipo, e.nivel); if (coste <= oro && coste < mejorCoste) { mejorCoste = coste; mejor = e; } }
    if (!mejor) break;
    oro -= mejorCoste; mejor.nivel++;
  }
  return ejercito;
}
// Referencia del ejército del jugador para calibrar a la IA: nivel medio ponderado por soldados, soldados y coste
function referenciaEjercito(ramaClave, ejercito) {
  let soldados = 0, sumaNivel = 0;
  for (const e of ejercito) { const n = soldadosDeUnidad(ramaClave, e.tipo); soldados += n; sumaNivel += e.nivel * n; }
  return { nivelMedio: soldados ? sumaNivel / soldados : 1, soldados, coste: costeEjercito(ramaClave, ejercito) };
}
