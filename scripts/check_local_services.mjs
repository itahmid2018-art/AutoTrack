import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const USE_JSON = process.argv.includes('--json');
const REQUIRE_DB = process.argv.includes('--require-db');

function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      finish({ open: true, latencyMs: Date.now() - start });
    });
    socket.once('timeout', () => {
      finish({ open: false, error: 'timeout' });
    });
    socket.once('error', (err) => {
      finish({ open: false, error: err?.code || err?.message || 'error' });
    });
  });
}

function probeHttps(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ reachable: true, statusCode: res.statusCode || 0 });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, error: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ reachable: false, error: err?.code || err?.message || 'error' });
    });
  });
}

async function runCli(cmd, args = ['--version']) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: 2500,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    const text = (stdout || stderr || '').trim().split(/\r?\n/)[0] || '';
    return { installed: true, output: text };
  } catch (err) {
    if (err && (err.code === 'ENOENT' || String(err.message || '').includes('not recognized'))) {
      return { installed: false, output: '' };
    }
    const text = ((err?.stdout || err?.stderr || err?.message || '') + '').trim().split(/\r?\n/)[0];
    return { installed: true, failed: true, code: err?.code, output: text };
  }
}

async function checkPostgres() {
  const host = process.env.PGHOST || '127.0.0.1';
  const port = Number(process.env.PGPORT) || 5432;
  const tcp = await probeTcp(host, port);
  const psqlCli = await runCli('psql', ['--version']);
  const pgIsReady = await runCli('pg_isready', ['-h', host, '-p', String(port)]);
  const schemaExists = fs.existsSync(path.resolve(process.cwd(), 'database.postgres.sql'));

  const acceptingConnections =
    tcp.open || (pgIsReady.installed && !pgIsReady.failed && /accepting connections/i.test(pgIsReady.output));

  let status = 'NOT DETECTED';
  if (acceptingConnections) status = 'RUNNING';
  else if (psqlCli.installed || pgIsReady.installed) status = 'INSTALLED (STOPPED)';

  return {
    service: 'PostgreSQL',
    host,
    port,
    status,
    running: acceptingConnections,
    cliInstalled: psqlCli.installed || pgIsReady.installed,
    version: psqlCli.output || pgIsReady.output || null,
    latencyMs: tcp.latencyMs ?? null,
    schemaFile: schemaExists ? 'database.postgres.sql' : null,
    note: acceptingConnections
      ? `Ready on ${host}:${port}${schemaExists ? ' — seed via: psql -U postgres -d autotrack_pro -f database.postgres.sql' : ''}`
      : psqlCli.installed
      ? `CLI installed (${psqlCli.output || 'psql'}), service not listening on ${host}:${port}`
      : `Port ${port} closed and psql CLI not found on PATH`,
  };
}

async function checkMySql() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT) || 3306;
  const tcp = await probeTcp(host, port);
  const mysqlCli = await runCli('mysql', ['--version']);
  const mariadbCli = !mysqlCli.installed ? await runCli('mariadb', ['--version']) : { installed: false, output: '' };
  const cli = mysqlCli.installed ? mysqlCli : mariadbCli;
  const mysqlAdmin = await runCli('mysqladmin', ['ping', `-h${host}`, `-P${port}`]);
  const schemaExists = fs.existsSync(path.resolve(process.cwd(), 'database.sql'));

  const alive =
    tcp.open || (mysqlAdmin.installed && !mysqlAdmin.failed && /alive/i.test(mysqlAdmin.output));

  let status = 'NOT DETECTED';
  if (alive) status = 'RUNNING';
  else if (cli.installed) status = 'INSTALLED (STOPPED)';

  return {
    service: 'MySQL / MariaDB',
    host,
    port,
    status,
    running: alive,
    cliInstalled: cli.installed,
    version: cli.output || null,
    latencyMs: tcp.latencyMs ?? null,
    schemaFile: schemaExists ? 'database.sql' : null,
    note: alive
      ? `Ready on ${host}:${port}${schemaExists ? ' — seed via: mysql -u root -p < database.sql' : ''}`
      : cli.installed
      ? `CLI installed (${cli.output || 'mysql'}), service not listening on ${host}:${port}`
      : `Port ${port} closed and mysql/mariadb CLI not found on PATH`,
  };
}

async function checkSqlite() {
  const cli = await runCli('sqlite3', ['--version']);
  return {
    service: 'SQLite3',
    host: 'local-file',
    port: null,
    status: cli.installed ? 'AVAILABLE (CLI)' : 'NOT DETECTED',
    running: false,
    cliInstalled: cli.installed,
    version: cli.output || null,
    note: cli.installed ? `CLI available (${cli.output})` : 'sqlite3 CLI not found on PATH',
  };
}

async function checkRedis() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT) || 6379;
  const tcp = await probeTcp(host, port);
  const cli = await runCli('redis-cli', ['--version']);
  const status = tcp.open ? 'RUNNING' : cli.installed ? 'INSTALLED (STOPPED)' : 'NOT DETECTED';

  return {
    service: 'Redis',
    host,
    port,
    status,
    running: tcp.open,
    cliInstalled: cli.installed,
    version: cli.output || null,
    latencyMs: tcp.latencyMs ?? null,
    note: tcp.open
      ? `Ready on ${host}:${port}`
      : cli.installed
      ? `CLI installed, port ${port} closed`
      : `Port ${port} closed`,
  };
}

async function checkMongo() {
  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = Number(process.env.MONGO_PORT) || 27017;
  const tcp = await probeTcp(host, port);
  const cli = await runCli('mongosh', ['--version']);
  const status = tcp.open ? 'RUNNING' : cli.installed ? 'INSTALLED (STOPPED)' : 'NOT DETECTED';

  return {
    service: 'MongoDB',
    host,
    port,
    status,
    running: tcp.open,
    cliInstalled: cli.installed,
    version: cli.output || null,
    latencyMs: tcp.latencyMs ?? null,
    note: tcp.open
      ? `Ready on ${host}:${port}`
      : cli.installed
      ? `mongosh installed, port ${port} closed`
      : `Port ${port} closed`,
  };
}

async function checkFirebase() {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    return {
      service: 'Firebase / Cloud Firestore',
      status: 'NOT CONFIGURED',
      running: false,
      note: 'firebase-applet-config.json not found (localStorage offline-first mode active)',
    };
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const projectId = cfg?.projectId || '';
    const dbId = cfg?.firestoreDatabaseId || '(default)';
    const valid = Boolean(projectId && projectId !== 'remixed-project-id');
    if (!valid) {
      return {
        service: 'Firebase / Cloud Firestore',
        status: 'PLACEHOLDER',
        running: false,
        note: 'firebase-applet-config.json contains placeholder projectId',
      };
    }

    const netProbe = await probeHttps('https://firestore.googleapis.com/');
    return {
      service: 'Firebase / Cloud Firestore',
      status: netProbe.reachable ? 'CONFIGURED & REACHABLE' : 'CONFIGURED (OFFLINE)',
      running: Boolean(netProbe.reachable),
      projectId,
      databaseId: dbId,
      note: `Project "${projectId}", DB "${dbId}" (${netProbe.reachable ? 'HTTPS reachable' : 'network unreachable; offline fallback active'})`,
    };
  } catch (err) {
    return {
      service: 'Firebase / Cloud Firestore',
      status: 'INVALID CONFIG',
      running: false,
      note: err?.message || 'Failed to parse firebase-applet-config.json',
    };
  }
}

async function checkDocker() {
  const cli = await runCli('docker', ['ps', '--format', '{{.Names}} ({{.Image}} -> {{.Ports}})']);
  if (!cli.installed) {
    return { installed: false, running: false, containers: [] };
  }
  if (cli.failed) {
    return { installed: true, running: false, containers: [] };
  }
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '--format', '{{.Names}}|{{.Image}}|{{.Ports}}'],
      { timeout: 2500, shell: process.platform === 'win32', windowsHide: true }
    );
    const containers = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [name, image, ports] = line.split('|');
        return { name, image, ports };
      });
    return { installed: true, running: true, containers };
  } catch {
    return { installed: true, running: false, containers: [] };
  }
}

async function checkAppPort() {
  const port = Number(process.env.PORT) || 3000;
  const tcp = await probeTcp('127.0.0.1', port, 600);
  return {
    port,
    inUse: tcp.open,
    note: tcp.open
      ? `Port ${port} is currently IN USE (stop existing process or pass --port <alt>)`
      : `Port ${port} is FREE for AutoTrack Pro`,
  };
}

async function main() {
  const [postgres, mysql, sqlite, redis, mongo, firebase, docker, appPort] = await Promise.all([
    checkPostgres(),
    checkMySql(),
    checkSqlite(),
    checkRedis(),
    checkMongo(),
    checkFirebase(),
    checkDocker(),
    checkAppPort(),
  ]);

  const services = [postgres, mysql, sqlite, redis, mongo, firebase];
  const runningServices = services.filter((s) => s.running);

  const report = {
    checkedAt: new Date().toISOString(),
    platform: `${process.platform} (${process.arch})`,
    nodeVersion: process.version,
    appPort,
    services,
    docker,
    runningCount: runningServices.length,
  };

  if (USE_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('');
    console.log('==============================================================');
    console.log(' AutoTrack Pro — Local Database & Service Availability Check');
    console.log('==============================================================');
    console.log(` Platform : ${report.platform}`);
    console.log(` Node.js  : ${report.nodeVersion}`);
    console.log(` App Port : ${appPort.note}`);
    console.log('--------------------------------------------------------------');
    for (const s of services) {
      const label = s.service.padEnd(28, ' ');
      const badge = `[${s.status}]`.padEnd(24, ' ');
      console.log(` ${label} ${badge} ${s.note}`);
    }
    if (docker.installed) {
      const dockerState = docker.running
        ? `${docker.containers.length} running container(s)`
        : 'daemon stopped';
      console.log(` ${'Docker'.padEnd(28, ' ')} [${(docker.running ? 'RUNNING' : 'STOPPED').padEnd(22, ' ')}] ${dockerState}`);
      for (const c of docker.containers.slice(0, 8)) {
        console.log(`    - ${c.name} (${c.image}) ${c.ports || ''}`);
      }
    }
    console.log('--------------------------------------------------------------');
    console.log(
      ` Available DB / Sync Services: ${
        runningServices.length > 0
          ? runningServices.map((s) => s.service).join(', ')
          : 'None running (Browser localStorage + Service Worker offline mode available)'
      }`
    );
    console.log('==============================================================');
    console.log('');
  }

  if (REQUIRE_DB && !postgres.running && !mysql.running && !firebase.running) {
    console.error('Error: --require-db was set, but no local SQL or Firestore service is available.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Service probe failed:', err);
  process.exit(1);
});
