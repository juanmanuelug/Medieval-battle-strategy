// Edge sin cabeza controlado por el protocolo DevTools (CDP), sin dependencias: abre una URL, espera, ejecuta JS y hace una captura.
// Más fiable que --screenshot/--dump-dom (que a veces se adosan a una instancia anterior) y permite leer resultados de la página.
// En Windows el proceso lanzador termina enseguida y delega en otro, así que no se escucha stderr: se sondea el puerto de DevTools.
// Uso como módulo:  const { withPage } = require('./headless'); await withPage(async page => { await page.goto(url); ... });
// Uso como CLI:     node tools/headless.js <url> [--shot salida.png] [--eval "expresión JS"] [--wait ms] [--size 1500x1150]
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
// navegador: Edge por defecto; opts.navegador = 'chrome' para probar en Chrome (los dos son Chromium)
const NAVEGADORES = { edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe' };
const EDGE = NAVEGADORES.edge;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(size, gpu, navegador) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-cdp-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const [w, h] = (size || '1500x1150').split('x').map(Number);
  spawn(NAVEGADORES[navegador] || EDGE, ['--headless=new', ...(gpu ? ['--use-angle=default', '--enable-unsafe-swiftshader'] : ['--disable-gpu']), '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore', detached: true }).unref();
  for (let i = 0; i < 60; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); if (v.webSocketDebuggerUrl) return { profile, port, browserWs: v.webSocketDebuggerUrl }; } catch (e) {}
    await sleep(500);
  }
  throw new Error((navegador || 'Edge') + ' no respondió en el puerto de DevTools ' + port);
}

class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; ws.onmessage = ev => this.onMessage(JSON.parse(ev.data)); }
  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) this.listeners.forEach(l => l(msg));
  }
  send(method, params) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params: params || {} })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  once(method, timeout) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.listeners = this.listeners.filter(x => x !== l); rej(new Error('tiempo agotado esperando ' + method)); }, timeout || 30000);
      const l = msg => { if (msg.method === method) { clearTimeout(t); this.listeners = this.listeners.filter(x => x !== l); res(msg.params); } };
      this.listeners.push(l);
    });
  }
  async goto(url, settle) {
    await this.send('Page.enable');
    const loaded = this.once('Page.loadEventFired', 60000);
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(settle === undefined ? 800 : settle);
  }
  // Evalúa una expresión (puede devolver una promesa) y devuelve su valor
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async screenshot(file, clip) {
    const r = await this.send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip: Object.assign({ scale: 1 }, clip) } : {}));
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
  async setSize(width, height) { await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); }
}

const connect = url => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = e => rej(new Error('WebSocket: ' + (e.message || 'error'))); });

async function withPage(fn, opts) {
  const { profile, port, browserWs } = await launch(opts && opts.size, opts && opts.gpu, opts && opts.navegador);
  let result;
  try {
    // Pestaña nueva propia (la lista inicial puede traer páginas internas de Edge)
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = await connect(target.webSocketDebuggerUrl);
    const page = new Session(ws);
    result = await fn(page);
    ws.close();
  } finally {
    try { const bws = await connect(browserWs); const b = new Session(bws); await b.send('Browser.close'); bws.close(); } catch (e) {}
    await sleep(800);
    // Por si queda algún proceso vivo con este perfil
    try { execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "name='${opts && opts.navegador === 'chrome' ? 'chrome.exe' : 'msedge.exe'}'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' }); } catch (e) {}
    for (let i = 0; i < 6; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(500); } }
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const url = args[0];
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (!url) { console.error('Uso: node tools/headless.js <url> [--shot salida.png] [--eval "expresión"] [--wait ms] [--size WxH]'); process.exit(1); }
  withPage(async page => {
    await page.goto(url, +opt('--wait', 800));
    if (opt('--eval')) console.log(JSON.stringify(await page.eval(opt('--eval'))));
    if (opt('--shot')) { await page.screenshot(opt('--shot')); console.log('captura:', opt('--shot')); }
  }, { size: opt('--size', '1500x1150') }).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { withPage, launch };
