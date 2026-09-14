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
  assert.equal(
    (await lab.request(port, '/', { headers: { Host: 'route-npm.example.test' } })).text,
    'AUTOXPOSE_CONTRACT_UPSTREAM'
  );
  const edited = run(`const keep=await provider.findByDomain('keep-npm.example.test');
    const updated=await provider.updateHost(${JSON.stringify(created.target.id)},{targetPort:2375});
    const unchanged=await provider.findByDomain('keep-npm.example.test');
    console.log(JSON.stringify({keep,updated,unchanged}));`);
  assert.deepEqual(edited.keep, edited.unchanged);
  assert.equal(
    (await lab.request(port, '/_ping', { headers: { Host: 'route-npm.example.test' } })).text,
    'OK'
  );
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
  await verifySettings(lab, app);
  lab.stop(name);
  return {
    create: true,
    edit: true,
    delete: true,
    unrelatedHostPreserved: true,
    actualNpmRouting: true,
    settingsMasking: true,
  };
}

async function verifySettings(lab, app) {
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
