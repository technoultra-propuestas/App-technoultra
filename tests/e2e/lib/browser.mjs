// Controlador mínimo de Chrome por DevTools Protocol (sin dependencias nuevas). Perfil propio y aislado: nunca toca el Chrome del usuario.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export class Browser {
  static async launch({ port = 9400, profileDir, baseUrl, viewport = { width: 1280, height: 800 }, headless = true } = {}) {
    const exe = CHROME_PATHS.find((p) => existsSync(p));
    if (!exe) throw new Error("No se encontró Chrome (define CHROME_PATH).");
    mkdirSync(profileDir, { recursive: true });
    const proc = spawn(exe, [headless ? "--headless=new" : "", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${resolve(profileDir)}`, "about:blank"].filter(Boolean), { stdio: "ignore" });
    let targets;
    for (let i = 0; i < 30 && !targets; i++) {
      await sleep(1000);
      try {
        targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      } catch {
        /* reintento */
      }
    }
    if (!targets) throw new Error("Chrome no arrancó");
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const b = new Browser(proc, ws, baseUrl);
    await b.send("Page.enable");
    await b.send("Runtime.enable");
    await b.send("Network.enable");
    await b.send("DOM.enable");
    await b.viewport(viewport.width, viewport.height);
    return b;
  }

  constructor(proc, ws, baseUrl) {
    this.proc = proc;
    this.ws = ws;
    this.baseUrl = baseUrl;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) {
        this.pending.get(d.id)(d.result ?? d.error);
        this.pending.delete(d.id);
      }
      if (d.method === "Runtime.exceptionThrown") this.errors.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text ?? "").slice(0, 160));
    };
  }

  send(method, params = {}) {
    return new Promise((res) => {
      this.pending.set(++this.id, res);
      this.ws.send(JSON.stringify({ id: this.id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }
  viewport(width, height, mobile = false) {
    return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  }
  path() {
    return this.eval("location.pathname + location.search");
  }
  text() {
    return this.eval("document.body.innerText");
  }
  async goto(url, settleMs = 2000) {
    await this.send("Page.navigate", { url: url.startsWith("http") ? url : this.baseUrl + url });
    // En desarrollo la primera visita compila la ruta: se espera a que el documento termine de cargar antes de mirar la ruta.
    for (let i = 0; i < 90; i++) {
      if ((await this.eval("document.readyState").catch(() => "")) === "complete") break;
      await sleep(350);
    }
    await sleep(settleMs);
  }
  async waitPath(pred, timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const p = await this.path();
      if (pred(p)) return p;
      await sleep(350);
    }
    return this.path();
  }
  async waitText(re, timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (re.test(await this.text())) return true;
      await sleep(350);
    }
    return false;
  }
  /** Rellena un campo por name (input, textarea o select) disparando los eventos que React escucha. */
  fill(name, value) {
    return this.eval(`(() => { const el = document.querySelector('#contenido [name="${name}"], [name="${name}"]'); if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }
  check(name, on = true) {
    return this.eval(`(() => { const el = document.querySelector('[name="${name}"]'); if (!el) return false; if (el.checked !== ${on}) el.click(); return true; })()`);
  }
  clickText(t, scope = "#contenido") {
    return this.eval(`(() => { const root = document.querySelector(${JSON.stringify(scope)}) || document; const b = [...root.querySelectorAll('button,a,summary')].find((x) => x.innerText.trim().includes(${JSON.stringify(t)})); if (!b) return false; b.click(); return true; })()`);
  }
  click(sel) {
    return this.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  }
  /** Envía el formulario que contiene el campo `name` (o el primero del contenido principal). */
  submit(withField) {
    return this.eval(`(() => { const f = ${withField ? `document.querySelector('[name="${withField}"]')?.form` : "document.querySelector('#contenido form')"}; const b = f?.querySelector('button[type=submit], button:not([type])'); if (!b) return false; b.click(); return true; })()`);
  }
  /** Igual que fill/submit pero acotado a un formulario concreto (p. ej. `form:has(input[name=key][value="business.phone"])`). */
  fillIn(formSel, name, value) {
    return this.eval(`(() => { const el = document.querySelector(${JSON.stringify(formSel)})?.querySelector('[name="${name}"]'); if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }
  submitIn(formSel) {
    return this.eval(`(() => { const b = document.querySelector(${JSON.stringify(formSel)})?.querySelector('button[type=submit], button:not([type])'); if (!b) return false; b.click(); return true; })()`);
  }
  async setFiles(selector, files) {
    const doc = await this.send("DOM.getDocument", { depth: 0 });
    const q = await this.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    if (!q.nodeId) return false;
    await this.send("DOM.setFileInputFiles", { files, nodeId: q.nodeId });
    return true;
  }
  clearCookies() {
    return this.send("Network.clearBrowserCookies");
  }
  async screenshot(file) {
    writeFileSync(file, Buffer.from((await this.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  }
  async close() {
    try {
      this.ws.close();
    } catch {
      /* ya cerrado */
    }
    this.proc.kill();
  }
}
