'use strict';
/* ---------- Copia del estado completo de una simulación (multijugador, paso 4, 2026-10-13) ----------
   serializarEstado(sim) → texto con todo lo que la simulación necesita para seguir exactamente igual: el estado del azar,
   los arrays tipados (soldados y flechas), los campos sueltos (paso, tiempo, estadísticas…) y las unidades.
   restaurarEstado(sim, texto) lo vuelca en otra simulación montada con la misma ficha, conservando los objetos de las
   unidades (el renderizador, la selección y las tarjetas los tienen referenciados).
   Lo usa el servidor para corregir a un jugador que se ha desviado y para que un jugador que se ha reconectado vuelva a
   la batalla. No se copia lo que se rehace solo (la rejilla espacial se rellena al empezar cada paso), lo que sale de la
   semilla (terreno, clima) ni la sangre pendiente de pintar.
   Los arrays tipados viajan en base64 y solo hasta el último valor distinto del final (el resto sigue con el valor
   inicial): los de soldados son de 5.000 y una batalla usa unos cientos. */
const CAMPOS_SIN_COPIA = ['terreno', 'rejilla', 'bufferVecinos', 'azar', 'unidades', 'sangre', 'clima'];
const TIPOS_ARRAY = { Float32Array, Float64Array, Int8Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
const LETRAS_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// base64 propio: el servidor carga este archivo en un contexto de Node sin btoa ni Buffer
function bytesABase64(bytes) {
  let texto = '';
  for (let k = 0; k < bytes.length; k += 3) {
    const a = bytes[k], b = k + 1 < bytes.length ? bytes[k + 1] : 0, c = k + 2 < bytes.length ? bytes[k + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    texto += LETRAS_BASE64[(n >> 18) & 63] + LETRAS_BASE64[(n >> 12) & 63] + (k + 1 < bytes.length ? LETRAS_BASE64[(n >> 6) & 63] : '=') + (k + 2 < bytes.length ? LETRAS_BASE64[n & 63] : '=');
  }
  return texto;
}
function base64ABytes(texto) {
  const valor = {}; for (let k = 0; k < 64; k++) valor[LETRAS_BASE64[k]] = k;
  const relleno = texto.endsWith('==') ? 2 : texto.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(texto.length / 4 * 3 - relleno);
  for (let k = 0, j = 0; k < texto.length; k += 4) {
    const n = (valor[texto[k]] << 18) | (valor[texto[k + 1]] << 12) | ((valor[texto[k + 2]] || 0) << 6) | (valor[texto[k + 3]] || 0);
    if (j < bytes.length) bytes[j++] = (n >> 16) & 255;
    if (j < bytes.length) bytes[j++] = (n >> 8) & 255;
    if (j < bytes.length) bytes[j++] = n & 255;
  }
  return bytes;
}
// JSON no guarda Infinity, -Infinity ni NaN (los pasa a null): se marcan aparte
const marcarNoFinitos = (clave, v) => typeof v === 'number' && !isFinite(v) ? { $no: String(v) } : v;
const leerNoFinitos = (clave, v) => v && typeof v === 'object' && typeof v.$no === 'string' && Object.keys(v).length === 1 ? Number(v.$no) : v;

function serializarEstado(sim) {
  const datos = { azar: sim.azar.leerEstado(), campos: {}, arrays: {}, unidades: sim.unidades };
  for (const clave of Object.keys(sim)) {
    const valor = sim[clave];
    if (CAMPOS_SIN_COPIA.includes(clave) || typeof valor === 'function') continue;
    if (ArrayBuffer.isView(valor)) {
      const cola = valor[valor.length - 1];
      let fin = valor.length - 1; while (fin >= 0 && Object.is(valor[fin], cola)) fin--;
      const parte = valor.slice(0, fin + 1);
      datos.arrays[clave] = { tipo: valor.constructor.name, largo: valor.length, cola, datos: bytesABase64(new Uint8Array(parte.buffer, 0, parte.byteLength)) };
    } else datos.campos[clave] = valor;
  }
  return JSON.stringify(datos, marcarNoFinitos);
}

function restaurarEstado(sim, texto) {
  const datos = JSON.parse(texto, leerNoFinitos);
  sim.azar.fijarEstado(datos.azar);
  for (const [clave, info] of Object.entries(datos.arrays)) {
    const Tipo = TIPOS_ARRAY[info.tipo]; if (!Tipo) continue;
    if (!sim[clave] || sim[clave].constructor.name !== info.tipo || sim[clave].length !== info.largo) sim[clave] = new Tipo(info.largo);
    const parte = new Tipo(base64ABytes(info.datos).buffer);
    sim[clave].set(parte); sim[clave].fill(info.cola, parte.length);
  }
  for (const [clave, valor] of Object.entries(datos.campos)) sim[clave] = valor;
  // las unidades se rellenan en los mismos objetos
  datos.unidades.forEach((nueva, k) => {
    const u = sim.unidades[k];
    if (!u) { sim.unidades[k] = nueva; return; }
    for (const clave of Object.keys(u)) delete u[clave];
    Object.assign(u, nueva);
  });
  sim.sangre.length = 0;
}
