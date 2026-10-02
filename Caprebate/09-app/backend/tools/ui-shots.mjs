// UI tidy (2 October 2026): screenshots of chosen pages for each demo login, at the widths given (WIDTHS, default 1280,390).
// Local demo only: it signs in through 09-app/backend/tools/demo-sign-in.ts, which refuses any login not @example.invalid
// and any website not on this machine. Usage: CB_DEMO_LOG=demo.log node tools/ui-shots.mjs <outdir> <plan.json>. A plan entry is
// {name, path} or {name, from, match, text?, nth?, suffix?}: open `from`, take the nth link whose address matches.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const out = process.argv[2]; const plan = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const WIDTHS = (process.env.WIDTHS ?? '1280,390').split(',').map(Number); // SCREEN=1 keeps each picture to one screen, 900 px high
const BASE = process.env.BASE ?? 'http://localhost:8105';
mkdirSync(out, { recursive: true });
const { demoSignIn } = await import(pathToFileURL(join(ROOT, '09-app/backend/tools/demo-sign-in.ts')).href);
const KF = join(process.cwd(), 'appkeys.json');
let appKeys = new Map(); try { appKeys = new Map(JSON.parse(readFileSync(KF, 'utf8'))); } catch {}
const port = 9345;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cbshots-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 50 && wsUrl === null; i++) { await new Promise((r) => setTimeout(r, 200)); try { const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl ?? null; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Page.enable'); await send('Network.enable');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
for (const [who, items] of Object.entries(plan)) {
  const signed = await demoSignIn(BASE, `${who}@example.invalid`, 'change-this-seed-password', { appKeys, readDemoLog: () => { try { return readFileSync(process.env.CB_DEMO_LOG, 'utf8'); } catch { return ''; } } });
  writeFileSync(KF, JSON.stringify([...appKeys]));
  if (!signed.ok) { console.log(`${who}: could not sign in - ${signed.why}`); continue; }
  await send('Network.clearBrowserCookies');
  for (const c of signed.cookies) await send('Network.setCookie', { name: c.name, value: c.value, url: BASE });
  for (const it of items) {
    let path = it.path, name = it.name;
    if (it.from) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: BASE + it.from }); await wait(700);
      path = await evaluate(`(()=>{const re=new RegExp(${JSON.stringify(it.match)});const t=${JSON.stringify(it.text ?? '')};const a=[...document.querySelectorAll('a[href]')].filter(a=>re.test(a.getAttribute('href'))&&(!t||a.innerText.includes(t)))[${it.nth ?? 0}];return a?a.getAttribute('href'):null})()`);
      if (path && it.suffix) path += it.suffix;
      if (!path) { console.log(`${who} ${name}: no link matching ${it.match} on ${it.from}`); continue; }
    }
    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await send('Page.navigate', { url: BASE + path }); await wait(Number(process.env.WAIT ?? 800));
      if (it.click) { await evaluate(`document.querySelector(${JSON.stringify(it.click)})?.click()`); await wait(300); } // e.g. the phone's Menu button
      const info = JSON.parse(await evaluate(`JSON.stringify({h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, u: location.pathname+location.search,
        links: document.querySelectorAll('main a[href]').length, buttons: document.querySelectorAll('main button, main input[type=submit]').length, forms: document.querySelectorAll('main form').length,
        tables: document.querySelectorAll('main table').length, boxes: document.querySelectorAll('main .card, main .panel, main section, main .tile').length, words: (document.querySelector('main')||document.body).innerText.split(/\\s+/).length})`));
      const fn = `${who}-${name}-${width}.png`;
      const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: process.env.SCREEN === '1' ? 900 : Math.max(200, Math.min(info.h, 14000)), scale: 1 } });
      writeFileSync(join(out, fn), Buffer.from(img.result.data, 'base64'));
      report.push({ who, name, width, ...info });
      console.log(`${who.padEnd(10)} ${name.padEnd(22)} ${String(width).padStart(4)} h=${info.h} words=${info.words} links=${info.links} buttons=${info.buttons} forms=${info.forms} tables=${info.tables} boxes=${info.boxes} ${info.sw>info.cw?'SIDEWAYS':''} ${info.u}`);
    }
  }
}
writeFileSync(KF, JSON.stringify([...appKeys]));
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
ws.close(); chrome.kill(); process.exit(0);
