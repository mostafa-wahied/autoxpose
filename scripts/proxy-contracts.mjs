import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

function startNpm(lab) {
  const image =
    'jc21/nginx-proxy-manager:2.12.6@sha256:6ab097814f54b1362d5fd3c5884a01ddd5878aaae9992ffd218439180f0f92f3';
  const data = lab.createVolume('npm-data');
  const certificates = lab.createVolume('npm-certs');
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const keyFile = `${lab.directory}/npm-keys.json`;
  writeFileSync(keyFile, JSON.stringify({ key: keys.privateKey, pub: keys.publicKey }), {
    mode: 0o600,
  });
  const name = lab.start('npm', image, [
    '-v',
    `${data}:/data`,
    '-v',
    `${keyFile}:/data/keys.json:ro`,
    '-v',
    `${certificates}:/etc/letsencrypt`,
    '-e',
    'INITIAL_ADMIN_EMAIL=contracts@example.test',
    '-e',
    'INITIAL_ADMIN_PASSWORD=synthetic-contract-password',
    '-e',
    'DISABLE_IPV6=true',
  ]);
  return name;
}

export async function waitForNpmRoute(
  lab,
  port,
  route,
  hostname,
  expected,
  timeout = 15000,
  expectedStatus = 200
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const response = await lab.request(port, route, { headers: { Host: hostname } });
    if (response.status === expectedStatus && (expected === null || response.text === expected))
      return;
    await new Promise(resolve =>
      setTimeout(resolve, Math.min(250, Math.max(0, deadline - Date.now())))
    );
  }
  assert.fail(
    `NPM route ${hostname}${route} did not return the expected response before the reload deadline`
  );
}

export async function proxyContracts(lab, app) {
  const name = startNpm(lab);
  await lab.ready(lab.port(name, 81), '/api/', 120000);
  const run = body =>
    lab.exec(
      app.name,
      `(async()=>{
    const {NpmProxyProvider}=await import('./dist/features/proxy/providers/npm.js');
    const provider=new NpmProxyProvider({url:'http://npm:81',username:'contracts@example.test',password:'synthetic-contract-password'});
    ${body}
  })().catch(error=>{console.error(error.message);process.exitCode=1;});`
    );
  const created =
    run(`const keep=await provider.createHost({domain:'keep-npm.example.test',targetHost:'fixture',targetPort:8080,ssl:false});
    const target=await provider.createHost({domain:'route-npm.example.test',targetHost:'fixture',targetPort:8080,ssl:false});
    console.log(JSON.stringify({keep,target}));`);
  const port = lab.port(name, 80);
  await waitForNpmRoute(lab, port, '/', 'route-npm.example.test', 'AUTOXPOSE_CONTRACT_UPSTREAM');
  const edited = run(`const keep=await provider.findByDomain('keep-npm.example.test');
    const updated=await provider.updateHost(${JSON.stringify(created.target.id)},{targetPort:2375});
    const unchanged=await provider.findByDomain('keep-npm.example.test');
    console.log(JSON.stringify({keep,updated,unchanged}));`);
  assert.deepEqual(edited.keep, edited.unchanged);
  await waitForNpmRoute(lab, port, '/_ping', 'route-npm.example.test', 'OK');
  run(
    `await provider.deleteHost(${JSON.stringify(created.target.id)});console.log(JSON.stringify({hosts:await provider.listHosts()}));`
  );
  const deadline = Date.now() + 15000;
  let removed = false;
  while (Date.now() < deadline && !removed) {
    removed =
      (await lab.request(port, '/_ping', { headers: { Host: 'route-npm.example.test' } })).text !==
      'OK';
    if (!removed) await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(removed, true, 'Deleted NPM route remained active after reload deadline');
  assert.equal(
    (await lab.request(port, '/', { headers: { Host: 'keep-npm.example.test' } })).text,
    'AUTOXPOSE_CONTRACT_UPSTREAM'
  );
  await verifySettings(lab, app, name, run);
  lab.stop(name);
  return {
    create: true,
    edit: true,
    delete: true,
    unrelatedHostPreserved: true,
    actualNpmRouting: true,
    settingsMasking: true,
    accessListRouting: true,
  };
}

async function verifySettings(lab, app, name, run) {
  const config = {
    provider: 'npm',
    config: {
      url: 'http://npm:81',
      username: 'contracts@example.test',
      password: 'synthetic-contract-password',
    },
  };
  assert.equal(
    (await lab.request(app.port, '/api/settings/proxy', { method: 'POST', body: config })).status,
    200
  );
  const masked = await lab.request(app.port, '/api/settings/proxy');
  assert.equal(masked.text.includes(config.config.password), false);
  await verifyAccessListRouting(lab, app, name, run);
  assert.equal(
    (
      await lab.request(app.port, '/api/settings/proxy', {
        method: 'POST',
        body: { provider: 'caddy', config: { url: 'http://caddy:2019' } },
      })
    ).status,
    200
  );
}

async function scanAccessListLabel(lab, call, containers, requested) {
  const labels = { 'autoxpose.enable': 'true', 'autoxpose.subdomain': 'access-contract' };
  if (requested !== null) labels['autoxpose.npm.access_list'] = requested;
  const container = {
    Id: 'access-contract',
    Names: ['/access-contract'],
    Image: 'fixture:local',
    Labels: labels,
    Ports: [{ PrivatePort: 8080, PublicPort: 8080, Type: 'tcp' }],
  };
  assert.equal(
    (
      await lab.request(lab.fixturePort, '/control', {
        method: 'POST',
        body: { containers: [...containers, container] },
      })
    ).status,
    200
  );
  await call('/api/discovery/scan', {});
  const service = (await call('/api/services')).services.find(
    item => item.sourceId === 'access-contract'
  );
  assert.ok(service);
  return service;
}

async function verifyAccessListRouting(lab, app, name, run) {
  const call = async (route, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await lab.request(app.port, route, { method, body });
    assert.equal(response.status, 200, `Access-list contract: ${method} ${route}`);
    return response.data;
  };
  const baseline = run('console.log(JSON.stringify(await provider.listHosts()));');
  const created = run(`await provider.listHosts();
    const list=await provider.request('/nginx/access-lists',{method:'POST',body:JSON.stringify({name:'Contract denied',satisfy_any:false,pass_auth:true,items:[],clients:[{address:'all',directive:'deny'}]})});
    const host=await provider.createHost({domain:'access-contract.example.test',targetHost:'fixture',targetPort:8080,ssl:false});
    console.log(JSON.stringify({listId:list.id,hostId:host.id}));`);
  assert.ok(Number.isInteger(created.listId));
  const state = (await lab.request(lab.fixturePort, '/state')).data;
  const wildcard = await call('/api/settings/wildcard');
  await call('/api/settings/wildcard', { enabled: true, domain: 'example.test' });
  let service;
  for (const requested of ['Contract denied', null, 'Missing contract list', 'public']) {
    service = await scanAccessListLabel(lab, call, state.containers, requested);
    const expectedId = requested === 'public' ? 0 : created.listId;
    assert.equal(service.accessListId || 0, expectedId);
    const host = run(
      `console.log(JSON.stringify(await provider.findByDomain('access-contract.example.test')));`
    );
    assert.equal(host.accessListId || 0, expectedId);
    await waitForNpmRoute(
      lab,
      lab.port(name, 80),
      '/',
      host.domain,
      expectedId ? null : 'AUTOXPOSE_CONTRACT_UPSTREAM',
      15000,
      expectedId ? 403 : 200
    );
    if (requested === 'Missing contract list') {
      const rejected = await lab.request(app.port, `/api/services/${service.id}/expose`, {
        method: 'POST',
        body: {},
      });
      assert.ok(rejected.status >= 400 && rejected.status < 600);
      assert.match(rejected.text, /access list/i);
    }
  }
  await call(`/api/services/${service.id}`, undefined, 'DELETE');
  assert.equal(
    (
      await lab.request(lab.fixturePort, '/control', {
        method: 'POST',
        body: { containers: state.containers },
      })
    ).status,
    200
  );
  run(
    `await provider.deleteHost(${JSON.stringify(created.hostId)});await provider.request('/nginx/access-lists/${created.listId}',{method:'DELETE'});console.log('{}');`
  );
  const preserved = run('console.log(JSON.stringify(await provider.listHosts()));');
  assert.deepEqual(preserved, baseline, 'Access-list actions changed unrelated NPM hosts');
  await call('/api/settings/wildcard', {
    enabled: wildcard.enabled,
    domain: wildcard.domain || '',
  });
}
