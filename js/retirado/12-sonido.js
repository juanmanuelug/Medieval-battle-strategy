'use strict';
/* ---------- Sonido sintetizado con WebAudio (sin archivos) ----------
   Ambiente genérico de batalla: dos capas de ruido sin tono (un rumor grave de multitud y un fragor medio de armas)
   cuyo volumen sube y baja suavemente con el número de soldados luchando, y un retumbo grave para la caballería al galope.
   Nada pulsa ni repica: los cambios de volumen llevan constantes de tiempo de medio segundo. Eventos: silbido al salir una
   descarga de flechas, cuerno al empezar y al perder, tambores al ganar. El contexto se crea con el primer gesto del usuario. */
class Sonido {
  constructor() { this.contexto = null; this.activo = true; this.volumen = 0.7; this.flechasAntes = 0; this.ultimoSilbido = 0; this.azar = crearAleatorio(2024); }
  iniciar() {
    if (this.contexto) { if (this.contexto.state === 'suspended') this.contexto.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.contexto = new AC();
    this.compresor = c.createDynamicsCompressor(); this.compresor.threshold.value = -16; this.compresor.ratio.value = 4; this.compresor.attack.value = 0.01; this.compresor.release.value = 0.3;
    this.maestro = c.createGain(); this.maestro.gain.value = this.activo ? this.volumen : 0;
    this.maestro.connect(this.compresor).connect(c.destination);
    // ruido marrón (integrado) para las capas graves y ruido blanco para las medias/agudas: sin periodicidad audible
    const seg = 4, blanco = c.createBuffer(1, c.sampleRate * seg, c.sampleRate), marron = c.createBuffer(1, c.sampleRate * seg, c.sampleRate);
    const db = blanco.getChannelData(0), dm = marron.getChannelData(0);
    let x = 1, acumulado = 0;
    for (let i = 0; i < db.length; i++) { x = (x * 1103515245 + 12345) % 2147483648; const v = x / 1073741824 - 1; db[i] = v * 0.5; acumulado = (acumulado + v * 0.02) * 0.995; dm[i] = acumulado * 3.5; }
    this.ruidoBlanco = blanco; this.ruidoMarron = marron;
    // capas continuas (ganancia 0 hasta que haya combate)
    this.rumor = this.capa(this.ruidoMarron, 'lowpass', 420, 0.7);      // multitud, gritos lejanos
    this.fragor = this.capa(this.ruidoBlanco, 'bandpass', 1400, 0.9);   // metal y madera, difuso
    this.galope = this.capa(this.ruidoMarron, 'lowpass', 90, 1.2);      // cascos lejanos
  }
  capa(buffer, tipo, frecuencia, q) {
    const c = this.contexto, fuente = c.createBufferSource(); fuente.buffer = buffer; fuente.loop = true;
    const filtro = c.createBiquadFilter(); filtro.type = tipo; filtro.frequency.value = frecuencia; filtro.Q.value = q;
    const ganancia = c.createGain(); ganancia.gain.value = 0;
    fuente.connect(filtro).connect(ganancia).connect(this.maestro); fuente.start(0, this.azar.entre(0, 3));
    return { fuente, filtro, ganancia };
  }
  alternar() { this.activo = !this.activo; if (this.maestro) this.maestro.gain.setTargetAtTime(this.activo ? this.volumen : 0, this.contexto.currentTime, 0.05); return this.activo; }
  // Llamado cada cuadro por el renderizador con los recuentos de la escena: solo mueve volúmenes, despacio
  ambiente({ luchando, galopando, volando, tiempo }) {
    if (!this.contexto || !this.activo) return;
    const t = this.contexto.currentTime;
    const combate = Math.min(1, luchando / 50);                 // 50 soldados luchando = batalla plena
    this.rumor.ganancia.gain.setTargetAtTime(combate * 0.55, t, 0.6);
    this.fragor.ganancia.gain.setTargetAtTime(combate * 0.22, t, 0.5);
    this.galope.ganancia.gain.setTargetAtTime(Math.min(1, galopando / 25) * 0.7, t, 0.4);
    if (volando > this.flechasAntes + 8 && tiempo - this.ultimoSilbido > 0.4) { this.silbido(Math.min(1, volando / 120)); this.ultimoSilbido = tiempo; }
    this.flechasAntes = volando;
  }
  silbido(intensidad) {
    const c = this.contexto, fuente = c.createBufferSource(); fuente.buffer = this.ruidoBlanco; fuente.loop = true;
    const filtro = c.createBiquadFilter(); filtro.type = 'bandpass'; filtro.Q.value = 6;
    filtro.frequency.setValueAtTime(900, c.currentTime); filtro.frequency.exponentialRampToValueAtTime(3200, c.currentTime + 0.5); filtro.frequency.exponentialRampToValueAtTime(700, c.currentTime + 1.4);
    const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.25 * intensidad + 0.06, c.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
    fuente.connect(filtro).connect(g).connect(this.maestro); fuente.start(); fuente.stop(c.currentTime + 1.6);
  }
  cuerno(grave) {
    if (!this.contexto || !this.activo) return;
    const c = this.contexto, t = c.currentTime, base = grave ? 146.8 : 220;
    for (const [f, retraso] of [[base, 0], [base * 1.5, 0.55], [base * 2, 1.1]]) {
      for (const desafinar of [-4, 0, 5]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = desafinar;
        const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 900;
        const g = c.createGain(); g.gain.setValueAtTime(0, t + retraso); g.gain.linearRampToValueAtTime(0.12, t + retraso + 0.08); g.gain.setValueAtTime(0.12, t + retraso + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + retraso + 1.3);
        o.connect(filtro).connect(g).connect(this.maestro); o.start(t + retraso); o.stop(t + retraso + 1.4);
      }
    }
  }
  tambores(cuantos) {
    if (!this.contexto || !this.activo) return;
    const c = this.contexto;
    for (let i = 0; i < cuantos; i++) {
      const t = c.currentTime + i * 0.32, o = c.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
      const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.maestro); o.start(t); o.stop(t + 0.32);
    }
  }
}
