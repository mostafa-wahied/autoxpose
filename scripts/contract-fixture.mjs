import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const state = {
  dockerFailure: false,
  providerFailure: false,
  records: [],
  calls: [],
  containers: [],
};
const domain = 'example.test';
const respond = (response, value, code = 200) => {
  response.writeHead(code, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
};

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString();
  return value ? JSON.parse(value) : {};
}

const fixture = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture');
    if (url.pathname === '/control' && request.method === 'POST') {
      Object.assign(state, await body(request));
      return respond(response, { ok: true });
    }
    if (url.pathname === '/state') return respond(response, state);
    response.end('AUTOXPOSE_CONTRACT_UPSTREAM');
  } catch {
    respond(response, { error: 'Invalid fixture request' }, 400);
  }
});
fixture.listen(8080, '0.0.0.0');

http
  .createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const pathname = url.pathname.replace(/^\/v[\d.]+/, '');
    if (pathname === '/_ping') return response.end('OK');
    if (pathname === '/version')
      return respond(response, { ApiVersion: '1.47', Version: '27.0.0' });
    if (pathname === '/events') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.flushHeaders();
      return;
    }
    if (state.dockerFailure)
      return respond(response, { message: 'Synthetic Docker unavailable' }, 503);
    if (pathname === '/containers/json') return respond(response, state.containers);
    if (pathname.startsWith('/containers/')) {
      const container = state.containers.find(item => pathname.includes(item.Id));
      if (!container) return respond(response, { message: 'missing' }, 404);
      return respond(response, {
        Id: container.Id,
        Name: container.Names[0],
        Config: { Labels: container.Labels, Image: container.Image },
        NetworkSettings: { Ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] } },
      });
    }
    respond(response, {});
  })
  .listen(2375, '0.0.0.0');

https
  .createServer(
    { key: readFileSync('/contracts/key.pem'), cert: readFileSync('/contracts/cert.pem') },
    async (request, response) => {
      try {
        const url = new URL(request.url, 'https://fixture');
        state.calls.push({ method: request.method, path: url.pathname });
        if (state.providerFailure)
          return respond(
            response,
            { success: false, errors: [{ message: 'Synthetic provider failure' }] },
            503
          );
        if (request.headers.authorization !== 'Bearer synthetic-cloudflare-token')
          return respond(
            response,
            { success: false, errors: [{ message: 'Invalid credential' }] },
            401
          );
        if (url.pathname === '/client/v4/zones')
          return respond(response, { success: true, result: [{ id: 'zone', name: domain }] });
        if (!url.pathname.startsWith('/client/v4/zones/zone/dns_records'))
          return respond(response, { success: true, result: [] });
        if (request.method === 'GET') {
          const records = state.records.filter(
            record => !url.searchParams.has('name') || record.name === url.searchParams.get('name')
          );
          return respond(response, {
            success: true,
            result: records,
            result_info: { page: 1, total_pages: 1, total_count: records.length },
          });
        }
        if (request.method === 'POST') {
          const input = await body(request);
          const name =
            input.name === domain || input.name.endsWith(`.${domain}`)
              ? input.name
              : `${input.name}.${domain}`;
          const record = {
            ...input,
            name,
            id: `record-${state.records.length + 1}`,
            proxied: false,
          };
          state.records.push(record);
          return respond(response, { success: true, result: record });
        }
        const identifier = url.pathname.split('/').pop();
        if (request.method === 'DELETE') {
          state.records = state.records.filter(record => record.id !== identifier);
          return respond(response, { success: true, result: { id: identifier } });
        }
        const record = state.records.find(item => item.id === identifier);
        Object.assign(record, await body(request));
        respond(response, { success: true, result: record });
      } catch {
        respond(response, { error: 'Invalid fixture request' }, 400);
      }
    }
  )
  .listen(443, '0.0.0.0');
