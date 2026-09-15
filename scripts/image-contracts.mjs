import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ContractLab, artifactDirectory } from './contract-lab.mjs';
import { browserContracts, onboardingContracts } from './browser-contracts.mjs';
import { proxyContracts } from './proxy-contracts.mjs';

const predecessor =
  'mostafawahied/autoxpose:0.5.1@sha256:aca81f1d05e28efda9556562bfb85b59bd6b5b509bcf8ec9a8a5bab645e137d1';
const image = process.argv[2];
const platform = process.argv[3];
const artifacts = artifactDirectory();
const lab = new ContractLab(image, platform);
const result = {
  startedAt: new Date().toISOString(),
  image,
  platform,
  passed: false,
  checks: [],
  cleanup: false,
};
let app;
const check = name => {
  result.checks.push(name);
  console.log(`PASS: ${name}`);
};
const api = async (route, body, method = body === undefined ? 'GET' : 'POST', status = 200) => {
  const response = await lab.request(app.port, route, { method, body });
  assert.equal(response.status, status, `${method} ${route}: HTTP ${response.status}`);
  return response.data;
};
const control = async body => {
  assert.equal(
    (await lab.request(lab.fixturePort, '/control', { method: 'POST', body })).status,
    200
  );
};
const service = async identifier => (await api(`/api/services/${identifier}`)).service;

async function verifyOnboarding() {
  const completed = [];
  for (const width of [1440, 390]) {
    const fresh = lab.startApp(image, lab.createVolume(`fresh-${width}`));
    await lab.ready(fresh.port);
    completed.push(await onboardingContracts(lab, artifacts, width));
    lab.stop(fresh.name);
  }
  check('fresh desktop/mobile setup saves providers and survives reload');
  return completed;
}

function databaseSnapshot(name) {
  return lab.exec(
    name,
    `const Database=require('better-sqlite3');const db=new Database('./data/autoxpose.db',{readonly:true});
    const tables=['services','provider_configs','__drizzle_migrations'];const values={};
    for(const table of tables){const rows=db.prepare('SELECT * FROM '+table).all();for(const row of rows)delete row.updated_at;
    values[table]=rows.sort((left,right)=>String(left.id).localeCompare(String(right.id)));}
    const integrity=db.pragma('quick_check',{simple:true});db.close();console.log(JSON.stringify({values,integrity}));`
  );
}

async function seedPredecessor(volume) {
  app = lab.startApp(predecessor, volume, 'previous');
  await lab.ready(app.port);
  const dns = {
    provider: 'cloudflare',
    config: { token: 'synthetic-cloudflare-token', zoneId: 'zone', domain: 'example.test' },
  };
  const proxy = { provider: 'caddy', config: { url: 'http://caddy:2019' } };
  await api('/api/settings/dns', dns);
  await api('/api/settings/proxy', proxy);
  const created = (
    await api('/api/services', { name: 'Saved service', subdomain: 'saved', port: 8080 })
  ).service;
  await api('/api/discovery/scan', {});
  lab.exec(
    app.name,
    `const Database=require('better-sqlite3');const db=new Database('./data/autoxpose.db');
    db.prepare('UPDATE services SET tags=?, enabled=? WHERE id=?').run('['+JSON.stringify('saved-tag')+']',0,${JSON.stringify(created.id)});
    console.log(JSON.stringify({updated:true}));db.close();`
  );
  const snapshot = databaseSnapshot(app.name);
  assert.equal(snapshot.integrity, 'ok');
  const backup = lab.exec(
    app.name,
    `(async()=>{const Database=require('better-sqlite3');const fs=require('fs');const db=new Database('./data/autoxpose.db');
    await db.backup('/tmp/pre-upgrade.db');db.close();console.log(JSON.stringify({bytes:fs.statSync('/tmp/pre-upgrade.db').size}));})().catch(()=>process.exitCode=1);`
  );
  assert.ok(backup.bytes > 0);
  lab.docker('cp', `${app.name}:/tmp/pre-upgrade.db`, `${lab.directory}/backup.db`);
  lab.stop(app.name);
  return { snapshot, dns, proxy, identifier: created.id };
}

function upgradedSnapshot(snapshot) {
  const expected = structuredClone(snapshot);
  const migrations = new URL('../packages/backend/migrations/', import.meta.url);
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', migrations)));
  assert.equal(journal.entries.length, 3, 'Review the migration contract when adding migrations');
  const entry = journal.entries[2];
  for (const record of expected.values.services) record.source_name = null;
  expected.values.__drizzle_migrations.push({
    id: null,
    hash: createHash('sha256')
      .update(readFileSync(new URL(`${entry.tag}.sql`, migrations)))
      .digest('hex'),
    created_at: entry.when,
  });
  return expected;
}

async function verifyPersistence(volume, seeded) {
  const expected = upgradedSnapshot(seeded.snapshot);
  app = lab.startApp(image, volume);
  await lab.ready(app.port);
  assert.deepEqual(databaseSnapshot(app.name), expected, 'Upgrade changed stored data classes');
  lab.exec(
    app.name,
    `const Database=require('better-sqlite3');const db=new Database('./data/autoxpose.db');
    db.prepare('UPDATE services SET tags=? WHERE id=?').run('[]',${JSON.stringify(seeded.identifier)});db.close();console.log('{}');`
  );
  assert.throws(
    () => assert.deepEqual(databaseSnapshot(app.name), expected),
    'Changed user data must fail the preservation contract'
  );
  lab.exec(
    app.name,
    `const Database=require('better-sqlite3');const db=new Database('./data/autoxpose.db');
    db.prepare('UPDATE services SET tags=? WHERE id=?').run('['+JSON.stringify('saved-tag')+']',${JSON.stringify(seeded.identifier)});db.close();console.log('{}');`
  );
  assert.deepEqual(databaseSnapshot(app.name), expected);
  assert.deepEqual(await api('/api/settings/export'), { dns: seeded.dns, proxy: seeded.proxy });
  assert.equal((await service(seeded.identifier)).enabled, false);
  check('previous-release services, tags, credentials and ownership survive upgrade');
  lab.docker('restart', app.name);
  await lab.ready(app.port);
  assert.deepEqual(
    databaseSnapshot(app.name),
    expected,
    'Repeated migration/restart changed stored data'
  );
  check('restart and repeated migrations preserve data and integrity');
  const rollback = lab.createVolume('rollback');
  lab.docker(
    'run',
    '--rm',
    '--network',
    'none',
    '--platform',
    platform,
    '--entrypoint',
    'node',
    '-v',
    `${rollback}:/app/packages/backend/data`,
    '-v',
    `${lab.directory}/backup.db:/backup.db:ro`,
    predecessor,
    '-e',
    "const fs=require('fs');fs.copyFileSync('/backup.db','/app/packages/backend/data/autoxpose.db');fs.chownSync('/app/packages/backend/data/autoxpose.db',1001,1001);"
  );
  const restored = lab.startApp(predecessor, rollback, 'rollback');
  await lab.ready(restored.port);
  assert.deepEqual(databaseSnapshot(restored.name), seeded.snapshot);
  lab.stop(restored.name);
  check('isolated rollback restores the backup into the previous image');
}

async function verifyApi(seeded) {
  const original = await api('/api/settings/export');
  for (const route of ['/api/settings/dns', '/api/settings/proxy', '/api/settings/status']) {
    const response = await api(route);
    assert.equal(
      JSON.stringify(response).includes('synthetic-cloudflare-token'),
      false,
      `Secret leaked from ${route}`
    );
  }
  const foreign = await lab.request(app.port, '/api/settings/reset', {
    method: 'POST',
    headers: { Origin: 'https://unrelated.example' },
  });
  assert.equal(foreign.status, 403);
  assert.deepEqual(await api('/api/settings/export'), original);
  await api(
    '/api/settings/dns',
    { ...seeded.dns, config: { ...seeded.dns.config, token: 'wrong-token' } },
    'POST',
    400
  );
  await api(
    '/api/settings/proxy',
    { provider: 'npm', config: { url: 'file:///etc/passwd' } },
    'POST',
    400
  );
  await api(
    '/api/settings/import',
    { dns: seeded.dns, proxy: { provider: 'caddy', config: { url: 'file:///invalid' } } },
    'POST',
    400
  );
  assert.deepEqual(await api('/api/settings/export'), original);
  check('Origin and provider validation reject mutations without changing saved credentials');
  const made = (
    await api('/api/services', { name: 'Contract service', subdomain: 'contract', port: 8080 })
  ).service;
  await api(`/api/services/${made.id}`, { name: 'Renamed service' }, 'PATCH');
  assert.equal((await service(made.id)).name, 'Renamed service');
  await api(`/api/services/${made.id}/dns-only`, {});
  const afterDns = await service(made.id);
  assert.ok(afterDns.dnsRecordId);
  const state = (await lab.request(lab.fixturePort, '/state')).data;
  assert.equal(
    state.records.find(record => record.id === afterDns.dnsRecordId).content,
    '192.0.2.1'
  );
  check('real shipped DNS-only action targets the local API fixture');
  await api(`/api/services/${made.id}/proxy-only`, {});
  const route = await lab.request(lab.proxyPort, '/', {
    headers: { Host: 'contract.example.test' },
  });
  assert.equal(route.text, 'AUTOXPOSE_CONTRACT_UPSTREAM');
  assert.equal(
    (await lab.request(lab.proxyPort, '/', { headers: { Host: 'keep.example.test' } })).text,
    'KEEP_ROUTE'
  );
  await api(`/api/services/${made.id}/unexpose`, {});
  const stopped = await service(made.id);
  assert.equal(stopped.enabled, false);
  assert.equal(stopped.exposureSource, 'paused');
  assert.deepEqual((await lab.request(lab.adminPort, '/config/')).data, lab.initialCaddy);
  await api(`/api/services/${made.id}`, undefined, 'DELETE');
  check('real Caddy routing, unrelated configuration and explicit Stop are preserved');
}

async function verifyDiscovery() {
  const container = {
    Id: 'contract-container',
    Names: ['/discovered'],
    Image: 'fixture:local',
    Labels: { 'autoxpose.enable': 'true', 'autoxpose.subdomain': 'discovered' },
    Ports: [
      ...Array.from({ length: 101 }, (_, index) => ({ PrivatePort: 10000 + index, Type: 'tcp' })),
      { PrivatePort: 8080, PublicPort: 8080, Type: 'tcp' },
    ],
  };
  await control({ containers: [container] });
  await api('/api/discovery/scan', {});
  const first = (await api('/api/services')).services.find(item => item.sourceId === container.Id);
  assert.ok(first);
  assert.equal(first.port, 8080);
  await api('/api/discovery/scan', {});
  assert.equal(
    (await api('/api/services')).services.filter(item => item.sourceId === container.Id).length,
    1
  );
  const before = (await api('/api/services')).services.map(item => item.id).sort();
  await control({ dockerFailure: true });
  await api('/api/discovery/scan', {}, 'POST', 503);
  assert.deepEqual((await api('/api/services')).services.map(item => item.id).sort(), before);
  await control({ dockerFailure: false });
  await api(`/api/services/${first.id}/unexpose`, {});
  await control({
    containers: [{ ...container, Labels: { ...container.Labels, 'autoxpose.enable': 'auto' } }],
  });
  assert.equal((await api('/api/discovery/scan', {})).autoExposed, 0);
  assert.equal((await service(first.id)).exposureSource, 'paused');
  await control({
    containers: [
      {
        ...container,
        Id: 'replacement-container',
        Labels: { ...container.Labels, 'autoxpose.enable': 'auto' },
      },
    ],
  });
  assert.equal((await api('/api/discovery/scan', {})).autoExposed, 0);
  assert.equal((await service(first.id)).sourceId, 'replacement-container');
  assert.equal((await service(first.id)).sourceName, 'discovered');
  assert.equal(
    (await api('/api/services')).services.filter(item => item.sourceName === 'discovered').length,
    1
  );
  lab.docker('restart', app.name);
  await lab.ready(app.port);
  assert.equal((await service(first.id)).exposureSource, 'paused');
  assert.equal((await service(first.id)).enabled, false);
  check('large Docker port lists, repeat scans, failed discovery and paused container recreation');
}

try {
  lab.setup();
  await lab.ready(lab.fixturePort, '/state');
  await lab.ready(lab.adminPort, '/config/');
  result.onboarding = await verifyOnboarding();
  const volume = lab.createVolume('data');
  const seeded = await seedPredecessor(volume);
  await verifyPersistence(volume, seeded);
  await verifyApi(seeded);
  await verifyDiscovery();
  result.npm = await proxyContracts(lab, app);
  check('real NPM create/edit/delete routing and unrelated-host preservation');
  await api('/api/settings/wildcard', { enabled: true, domain: 'example.test' });
  const browserService = (
    await api('/api/services', { name: 'Browser contract', subdomain: 'browser', port: 8080 })
  ).service;
  await browserContracts(lab, artifacts, browserService.id);
  assert.deepEqual((await lab.request(lab.adminPort, '/config/')).data, lab.initialCaddy);
  check('shipped desktop/mobile browser actions, reload, drawer and real routed Start/Stop');
  result.passed = true;
} catch (error) {
  result.error = error.message;
  for (const name of lab.containers) {
    try {
      writeFileSync(`${artifacts}/${name}.log`, lab.docker('logs', '--tail', '120', name));
    } catch (failure) {
      (result.evidenceErrors ??= []).push({ container: name, error: failure.message });
    }
  }
  process.exitCode = 1;
} finally {
  try {
    lab.cleanup();
    result.cleanup = true;
  } catch (error) {
    result.cleanupError = error.message;
    result.passed = false;
    process.exitCode = 1;
  }
  result.completedAt = new Date().toISOString();
  writeFileSync(`${artifacts}/verification.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
