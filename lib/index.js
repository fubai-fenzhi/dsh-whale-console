import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'dsh-whale-console';
export const inject = ['webServer'];

const API = '/dsh-whale-console/api';
const DEFAULT_PORTS = { voice: 8765, gsv: 9880, llama: 8080, ollama: 11434 };
const DEFAULT_SCRIPTS = { start: 'pet-with-voice.ps1', voice: 'start-voice.ps1', model: 'start-all.ps1' };

let settings = normalize({});

function toPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function escapePs(value) {
  return String(value).replaceAll("'", "''");
}

function normalize(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const rawPorts = source.ports && typeof source.ports === 'object' ? source.ports : {};
  return {
    scriptsDir: typeof source.scriptsDir === 'string' ? source.scriptsDir.trim() : '',
    scripts: source.scripts && typeof source.scripts === 'object'
      ? { ...DEFAULT_SCRIPTS, ...source.scripts }
      : { ...DEFAULT_SCRIPTS },
    powershell: typeof source.powershell === 'string' && source.powershell.trim()
      ? source.powershell.trim()
      : 'powershell.exe',
    petMatch: typeof source.petMatch === 'string' && source.petMatch.trim()
      ? source.petMatch.trim()
      : 'surfpet',
    ports: {
      voice: toPort(rawPorts.voice, DEFAULT_PORTS.voice),
      gsv: toPort(rawPorts.gsv, DEFAULT_PORTS.gsv),
      llama: toPort(rawPorts.llama, DEFAULT_PORTS.llama),
      ollama: toPort(rawPorts.ollama, DEFAULT_PORTS.ollama),
    },
  };
}

function runProcess(args) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(settings.powershell, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', (error) => finish({ ok: false, error: String(error?.message ?? error) }));
      child.on('spawn', () => {
        child.unref();
        finish({ ok: true, started: true, pid: child.pid });
      });
    } catch (error) {
      finish({ ok: false, error: String(error?.message ?? error) });
    }
  });
}

function runScript(kind) {
  if (!settings.scriptsDir) {
    return Promise.resolve({
      ok: false,
      error: 'scriptsDir is not configured; set it in the plugin config (config.scriptsDir)',
    });
  }
  const file = join(settings.scriptsDir, settings.scripts[kind] ?? kind);
  if (!existsSync(file)) {
    return Promise.resolve({ ok: false, error: 'script not found: ' + file });
  }
  return runProcess(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', file]);
}

function runPs(command) {
  return runProcess(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', command]);
}

async function probe(port, urlPath) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + urlPath, { signal: AbortSignal.timeout(2500) });
    return response.status > 0;
  } catch {
    return false;
  }
}

let petCache = { at: 0, value: false };
const PET_CACHE_MS = 9000;

function petRunning() {
  const now = Date.now();
  if (now - petCache.at < PET_CACHE_MS) return Promise.resolve(petCache.value);
  const match = escapePs(settings.petMatch);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      petCache = { at: Date.now(), value };
      resolve(value);
    };
    try {
      const child = spawn(settings.powershell, ['-NoProfile', '-Command',
        "try { $p = Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -like '*" + match + "*' }; if ($p) { 'YES' } else { 'NO' } } catch { 'NO' }",
      ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      let out = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.on('close', () => finish(/YES/.test(out)));
      child.on('error', () => finish(false));
      setTimeout(() => { try { child.kill(); } catch {} finish(false); }, 4000);
    } catch {
      finish(false);
    }
  });
}

async function status() {
  const [pet, voice, gsv, llama, ollama] = await Promise.all([
    petRunning(),
    probe(settings.ports.voice, '/v1/health'),
    probe(settings.ports.gsv, '/'),
    probe(settings.ports.llama, '/health'),
    probe(settings.ports.ollama, '/api/version'),
  ]);
  return { pet, voice, gsv, llama, ollama };
}

function stopAllCommand() {
  const match = escapePs(settings.petMatch);
  return [
    'foreach ($port in ' + settings.ports.voice + ',' + settings.ports.gsv + ') {',
    '  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue;',
    '  if ($c) { $c | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }',
    '}',
    "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -like '*" + match + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(' ');
}

export function apply(ctx, rawConfig) {
  settings = normalize(rawConfig);
  const server = (ctx && typeof ctx.get === 'function' ? ctx.get('webServer') : null) || ctx?.webServer;
  if (!server || typeof server.register !== 'function') return;

  server.register({
    kind: 'prefix',
    path: API,
    handler: async (req, res) => {
      const send = (code, payload) => {
        res.statusCode = code;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
      };
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        const suffix = url.pathname.slice(API.length) || '/';
        if (req.method === 'GET' && (suffix === '/' || suffix === '/status')) {
          send(200, {
            ok: true,
            configured: Boolean(settings.scriptsDir),
            ports: settings.ports,
            status: await status(),
          });
          return;
        }
        if (req.method === 'POST') {
          const action = suffix.replace(/^\//, '');
          if (action === 'start' || action === 'voice' || action === 'model') {
            const result = await runScript(action);
            send(result.ok ? 200 : 400, { ok: result.ok, action, result });
            return;
          }
          if (action === 'stop') {
            const result = await runPs(stopAllCommand());
            send(result.ok ? 200 : 400, { ok: result.ok, action, result });
            return;
          }
        }
        send(404, { ok: false, error: 'not found' });
      } catch (error) {
        send(500, { ok: false, error: String(error?.message ?? error) });
      }
    },
  });
}
