import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class ContractLab {
  name = `autoxpose-contract-${randomUUID().slice(0, 8)}`;
  directory = mkdtempSync(path.join(os.tmpdir(), 'autoxpose-contract-'));
  containers = [];
  volumes = [];
  networkCreated = false;

  constructor(image, platform) {
    assert.match(image, /^[\w./:@-]+$/);
    assert.ok(['linux/amd64', 'linux/arm64'].includes(platform));
    this.image = image;
    this.platform = platform;
    this.scripts = path.resolve(import.meta.dirname);
  }

  docker(...args) {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8000000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  json(...args) {
    return JSON.parse(this.docker(...args));
  }

  createVolume(suffix) {
    const name = `${this.name}-${suffix}`;
    this.docker('volume', 'create', '--label', `autoxpose.contract=${this.name}`, name);
    this.volumes.push(name);
    return name;
  }

  start(name, image, args, command = []) {
    const fullName = `${this.name}-${name}`;
    assert.ok(!this.containers.includes(fullName));
    this.containers.push(fullName);
    const network =
      name === 'relay'
        ? ['--network', 'bridge']
        : ['--network', this.name, '--network-alias', name];
    this.docker(
      'run',
      '-d',
      '--name',
      fullName,
      '--label',
      `autoxpose.contract=${this.name}`,
      '--restart=no',
      '--platform',
      this.platform,
      ...network,
      ...args,
      image,
      ...command
    );
    return fullName;
  }

  stop(name) {
    this.docker('rm', '--force', name);
    this.containers = this.containers.filter(item => item !== name);
  }

  port(name, internal) {
    const suffix = name.slice(this.name.length + 1);
    return { port: this.relayPort, prefix: `/__contract/${suffix}/${internal}` };
  }

  request(port, route, options = {}) {
    return new Promise((resolve, reject) => {
      const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
      const request = http.request(
        {
          host: '127.0.0.1',
          port: port.port ?? port,
          path: `${port.prefix ?? ''}${route}`,
          method: options.method || 'GET',
          timeout: 15000,
          headers: {
            ...(payload
              ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
              : {}),
            ...options.headers,
          },
        },
        response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString();
            let data;
            try {
              data = JSON.parse(text);
            } catch {
              data = null;
            }
            resolve({ status: response.statusCode, data, text });
          });
        }
      );
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new Error('Contract request timed out')));
      request.end(payload);
    });
  }

  async ready(port, route = '/health', timeout = 45000) {
    const deadline = Date.now() + timeout;
    let error;
    while (Date.now() < deadline) {
      try {
        const response = await this.request(port, route);
        if (response.status === 200) return;
        error = new Error(`Readiness returned ${response.status}`);
      } catch (failure) {
        error = failure;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw error;
  }

  setup() {
    this.docker(
      'network',
      'create',
      '--internal',
      '--label',
      `autoxpose.contract=${this.name}`,
      this.name
    );
    this.networkCreated = true;
    this.startRelay();
    this.startFixtures();
    this.startCaddy();
  }

  startRelay() {
    const relayCode = `const http=require('node:http');http.createServer((request,response)=>{
      const match=request.url.match(/^\\/__contract\\/([a-z-]+)\\/(\\d+)(\\/.*)$/);
      const host=match?match[1]:'app';const port=match?Number(match[2]):3000;const url=match?match[3]:request.url;
      if(!['fixture','caddy','npm','app','previous','rollback'].includes(host)||![8080,2019,8088,3000,80,81].includes(port)){response.writeHead(403);response.end();return;}
      const upstream=http.request({host,port,path:url,method:request.method,headers:request.headers},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);});
      upstream.on('error',()=>{response.writeHead(502);response.end();});request.pipe(upstream);
    }).listen(8080,'0.0.0.0');`;
    this.relay = this.start(
      'relay',
      this.image,
      ['-p', '127.0.0.1::8080', '--entrypoint', 'node'],
      ['-e', relayCode]
    );
    this.docker('network', 'connect', this.name, this.relay);
    this.relayPort = Number(
      this.json('inspect', this.relay)[0].NetworkSettings.Ports['8080/tcp'][0].HostPort
    );
  }

  startFixtures() {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '2',
        '-keyout',
        `${this.directory}/key.pem`,
        '-out',
        `${this.directory}/cert.pem`,
        '-subj',
        '/CN=autoxpose-contract',
        '-addext',
        'subjectAltName=DNS:api.cloudflare.com',
      ],
      { timeout: 20000, stdio: 'ignore' }
    );
    this.fixture = this.start(
      'fixture',
      this.image,
      [
        '--entrypoint',
        'node',
        '--network-alias',
        'api.cloudflare.com',
        '-v',
        `${this.scripts}/contract-fixture.mjs:/contracts/fixture.mjs:ro`,
        '-v',
        `${this.directory}/key.pem:/contracts/key.pem:ro`,
        '-v',
        `${this.directory}/cert.pem:/contracts/cert.pem:ro`,
      ],
      ['/contracts/fixture.mjs']
    );
    this.fixturePort = this.port(this.fixture, 8080);
    this.fixtureIp = this.json('inspect', this.fixture)[0].NetworkSettings.Networks[
      this.name
    ].IPAddress;
  }

  startCaddy() {
    const config = {
      admin: { listen: '0.0.0.0:2019' },
      storage: { module: 'file_system', root: '/data/contracts' },
      apps: {
        http: {
          servers: {
            primary: {
              listen: [':8088'],
              automatic_https: { disable: true },
              routes: [
                {
                  '@id': 'unrelated',
                  match: [{ host: ['keep.example.test'] }],
                  handle: [{ handler: 'static_response', body: 'KEEP_ROUTE' }],
                  terminal: true,
                },
              ],
            },
          },
        },
      },
    };
    this.initialCaddy = config;
    writeFileSync(`${this.directory}/caddy.json`, JSON.stringify(config));
    this.caddy = this.start(
      'caddy',
      'caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d',
      ['-v', `${this.directory}/caddy.json:/etc/caddy/config.json:ro`],
      ['caddy', 'run', '--config', '/etc/caddy/config.json']
    );
    this.proxyPort = this.port(this.caddy, 8088);
    this.adminPort = this.port(this.caddy, 2019);
  }

  startApp(image, volume, suffix = 'app') {
    const name = this.start(suffix, image, [
      '-v',
      `${volume}:/app/packages/backend/data`,
      '-v',
      `${this.directory}/cert.pem:/contracts/ca.pem:ro`,
      '-e',
      'NODE_EXTRA_CA_CERTS=/contracts/ca.pem',
      '-e',
      'DOCKER_HOST=http://fixture:2375',
      '-e',
      'SERVER_IP=192.0.2.1',
      '-e',
      `LAN_IP=${this.fixtureIp}`,
    ]);
    return { name, port: this.port(name, 3000) };
  }

  exec(name, code) {
    return this.json('exec', '-e', 'LOG_LEVEL=fatal', name, 'node', '-e', code);
  }

  cleanup() {
    const failures = [];
    for (const name of this.containers.reverse()) {
      try {
        this.docker('rm', '--force', '--volumes', name);
      } catch {
        failures.push(name);
      }
    }
    for (const name of this.volumes) {
      try {
        this.docker('volume', 'rm', name);
      } catch {
        failures.push(name);
      }
    }
    if (this.networkCreated) {
      try {
        this.docker('network', 'rm', this.name);
      } catch {
        failures.push(this.name);
      }
    }
    const remaining = this.docker('ps', '-aq', '--filter', `label=autoxpose.contract=${this.name}`);
    assert.equal(remaining, '', 'Owned test container remains');
    assert.deepEqual(failures, [], 'Owned test resources could not be removed');
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export function artifactDirectory() {
  const target =
    process.env.CONTRACT_ARTIFACTS || mkdtempSync(path.join(os.tmpdir(), 'autoxpose-evidence-'));
  mkdirSync(target, { recursive: true });
  return path.resolve(target);
}
