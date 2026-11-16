import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DIST_INDEX = path.resolve(process.cwd(), 'dist', 'index.html');
const DIST_SERVER = path.resolve(process.cwd(), 'dist-server', 'server.cjs');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(child, exitedRef, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'Server did not become ready';

  while (Date.now() < deadline) {
    if (exitedRef.exited) {
      throw new Error(`Production server exited prematurely (code=${exitedRef.code}, signal=${exitedRef.signal})`);
    }
    try {
      const res = await fetch(`${BASE_URL}/api/messaging/status`);
      if (res.ok) {
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${BASE_URL}/api/messaging/status (${lastError})`);
}

async function terminateChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const closed = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(3000).then(() => false),
  ]);
  if (!closed && child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function run() {
  if (!fs.existsSync(DIST_INDEX)) {
    console.error(`[smoke] Missing ${DIST_INDEX}. Run "npm run build" first.`);
    process.exit(1);
  }
  if (!fs.existsSync(DIST_SERVER)) {
    console.error(`[smoke] Missing ${DIST_SERVER}. Run "npm run build" first.`);
    process.exit(1);
  }

  const exitedRef = { exited: false, code: null, signal: null };
  let stderrTail = '';

  const child = spawn(process.execPath, [DIST_SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      VALIDATE_GEMINI_MODELS_ON_START: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });
  child.on('exit', (code, signal) => {
    exitedRef.exited = true;
    exitedRef.code = code;
    exitedRef.signal = signal;
  });

  try {
    await waitForServerReady(child, exitedRef);

    const rootRes = await fetch(`${BASE_URL}/`);
    if (rootRes.status !== 200) {
      throw new Error(`GET / returned HTTP ${rootRes.status}`);
    }
    const rootHtml = await rootRes.text();
    if (!rootHtml.toLowerCase().includes('<html')) {
      throw new Error('GET / did not return an HTML document');
    }

    const portalRes = await fetch(`${BASE_URL}/?view=customer&token=test`);
    if (portalRes.status !== 200) {
      throw new Error(`GET /?view=customer&token=test returned HTTP ${portalRes.status}`);
    }
    const portalHtml = await portalRes.text();
    if (!portalHtml.toLowerCase().includes('<html')) {
      throw new Error('GET /?view=customer&token=test did not return SPA index HTML');
    }

    const msgRes = await fetch(`${BASE_URL}/api/messaging/status`);
    if (msgRes.status !== 200) {
      throw new Error(`GET /api/messaging/status returned HTTP ${msgRes.status}`);
    }
    const msgJson = await msgRes.json();
    if (!msgJson || typeof msgJson !== 'object') {
      throw new Error('GET /api/messaging/status did not return a JSON object');
    }

    const lookupRes = await fetch(`${BASE_URL}/api/customer-portal/lookup?query=BOSCH-2026-0041`);
    if (lookupRes.status >= 500 && lookupRes.status !== 503) {
      throw new Error(`GET /api/customer-portal/lookup returned unexpected HTTP ${lookupRes.status}`);
    }

    console.log(
      `[smoke] PASS: /, /?view=customer&token=test, /api/messaging/status (200), /api/customer-portal/lookup (${lookupRes.status})`
    );
  } catch (err) {
    console.error('[smoke] FAIL:', err?.message || err);
    if (stderrTail.trim()) {
      console.error('[smoke] Server stderr tail:\n' + stderrTail);
    }
    process.exitCode = 1;
  } finally {
    await terminateChild(child);
  }
}

run();
