import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AppConfig } from './core/config/schema.js';
import type { AppContext } from './core/context.js';
import { createDiscoveryRoutes } from './features/discovery/discovery.routes.js';
import { dnsRoutes } from './features/dns/dns.routes.js';
import { createExposeRoutes, createStreamingExposeRoutes } from './features/expose/index.js';
import { proxyRoutes } from './features/proxy/proxy.routes.js';
import { createServicesRoutes } from './features/services/services.routes.js';
import { createSettingsRoutes } from './features/settings/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createServer(_config: AppConfig, ctx: AppContext): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  await server.register(cors, { origin: true });

  server.addContentTypeParser(
    ['application/x-www-form-urlencoded', 'text/plain'],
    { parseAs: 'string' },
    (_req, _body, done) => done(null, {})
  );

  server.get('/health', async () => ({ status: 'ok' }));

  await server.register(dnsRoutes, { prefix: '/api/dns' });
  await server.register(proxyRoutes, { prefix: '/api/proxy' });
  await server.register(createServicesRoutes(ctx), { prefix: '/api/services' });
  await server.register(createDiscoveryRoutes(ctx), { prefix: '/api/discovery' });
  await server.register(createSettingsRoutes(ctx.settings), { prefix: '/api/settings' });
  await server.register(createExposeRoutes(ctx.expose), { prefix: '/api/services' });
  await server.register(createStreamingExposeRoutes(ctx.streamingExpose), {
    prefix: '/api/services',
  });

  await server.register(fastifyStatic, {
    root: join(__dirname, '..', '..', '..', 'public'),
    prefix: '/',
  });

  server.setNotFoundHandler((_request, reply) => {
    return reply.sendFile('index.html');
  });

  return server;
}
