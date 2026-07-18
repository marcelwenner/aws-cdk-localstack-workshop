/**
 * Records the README demo gif (docs/images/demo.gif).
 *
 * vhs is broken on Windows (its ttyd build crashes on session spawn), so this
 * script builds the same pipeline from parts that work everywhere:
 *
 *   node-pty (ConPTY/forkpty) <-> WebSocket <-> xterm.js in headless Chrome,
 *   Playwright types the choreography and records video, ffmpeg converts
 *   the webm to a palette-optimized gif.
 *
 * Requirements: Chrome or Edge installed, ffmpeg on PATH (or FFMPEG_PATH),
 * workshop containers running (npm run docker:up), pnpm install done.
 *
 * Usage: npm run demo:gif  (from the repo root)
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import pty from '@lydell/node-pty';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_GIF = join(REPO, 'docs', 'images', 'demo.gif');
const PORT = 7710;
const W = 1200;
const H = 700;
const FPS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');
  return found;
}

function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (spawnSync('ffmpeg', ['-version'], { shell: false }).status === 0) return 'ffmpeg';
  if (process.platform === 'win32') {
    const wingetDir = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(wingetDir)) {
      for (const pkg of readdirSync(wingetDir)) {
        if (!pkg.startsWith('Gyan.FFmpeg')) continue;
        for (const sub of readdirSync(join(wingetDir, pkg))) {
          const exe = join(wingetDir, pkg, sub, 'bin', 'ffmpeg.exe');
          if (existsSync(exe)) return exe;
        }
      }
    }
  }
  throw new Error('No ffmpeg found. Install it or set FFMPEG_PATH.');
}

const shell =
  process.platform === 'win32'
    ? { cmd: 'cmd.exe', args: ['/k', 'prompt=$G '], env: {} }
    : { cmd: 'bash', args: ['--norc'], env: { PS1: '> ' } };

// --- terminal server: xterm.js page + websocket to node-pty ---
const nm = join(HERE, 'node_modules');
const xtermJs = readFileSync(join(nm, '@xterm/xterm/lib/xterm.js'), 'utf8');
const fitJs = readFileSync(join(nm, '@xterm/addon-fit/lib/addon-fit.js'), 'utf8');
const xtermCss = readFileSync(join(nm, '@xterm/xterm/css/xterm.css'), 'utf8');

// Catppuccin-Mocha-like theme, same look the old vhs tape used
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${xtermCss}
html,body{margin:0;padding:0;background:#1e1e2e;height:100%;overflow:hidden}
#term{position:absolute;inset:10px}
</style></head><body><div id="term"></div>
<script>${xtermJs}<\/script><script>${fitJs}<\/script>
<script>
const term = new Terminal({
  fontSize: 15,
  fontFamily: '"Cascadia Mono", Consolas, Menlo, monospace',
  cursorBlink: true,
  allowProposedApi: true,
  theme: {
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('term'));
fit.fit();
const ws = new WebSocket('ws://' + location.host + '/ws?cols=' + term.cols + '&rows=' + term.rows);
ws.binaryType = 'arraybuffer';
ws.onmessage = (e) => term.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data));
term.onData((d) => ws.send(d));
ws.onopen = () => { term.focus(); document.title = 'ready'; };
</script></body></html>`;

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const proc = pty.spawn(shell.cmd, shell.args, {
    cols: Number(q.get('cols')) || 130,
    rows: Number(q.get('rows')) || 38,
    cwd: REPO,
    env: { ...process.env, ...shell.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });
  proc.onData((d) => {
    try {
      ws.send(d);
    } catch {}
  });
  ws.on('message', (m) => proc.write(m.toString()));
  ws.on('close', () => proc.kill());
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// --- record ---
const videoDir = mkdtempSync(join(tmpdir(), 'workshop-demo-'));
const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: videoDir, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => document.title === 'ready', { timeout: 15000 });
await page.mouse.click(W / 2, H / 2);
await sleep(2000);

log('type: npm run workshop');
await page.keyboard.type('npm run workshop', { delay: 60 });
await page.keyboard.press('Enter');
log('boot sequence (12s)');
await sleep(12000);

log('welcome -> enter (8s)');
await page.keyboard.press('Enter');
await sleep(8000);

log('cheat sheet: ?');
await page.keyboard.type('?');
await sleep(3000);
await page.keyboard.press('Tab');
await sleep(2000);
await page.keyboard.press('Tab');
await sleep(2000);
await page.keyboard.press('Escape');
await sleep(2000);

await ctx.close();
await browser.close();
server.close();
wss.close();

// --- convert ---
const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('No video was recorded.');
mkdirSync(dirname(OUT_GIF), { recursive: true });
log('ffmpeg webm -> gif');
const ff = spawnSync(
  findFfmpeg(),
  [
    '-y',
    '-i',
    join(videoDir, webm),
    '-vf',
    `fps=${FPS},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    OUT_GIF,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
);
if (ff.status !== 0) throw new Error('ffmpeg failed');
rmSync(videoDir, { recursive: true, force: true });
console.log('GIF:', OUT_GIF);
process.exit(0);
