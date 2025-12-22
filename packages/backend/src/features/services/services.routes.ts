import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { probeBackend } from '../discovery/probe.js';
import { checkDomainReachable } from '../settings/validation.js';
import { createSslRoutes } from './ssl.routes.js';
import { createSyncRoutes } from './sync.routes.js';

interface CreateBody {
  name: string;
  subdomain: string;
  port: number;
  scheme?: string;
}
interface UpdateBody {
  name?: string;
  subdomain?: string;
  port?: number;
  scheme?: string;
  enabled?: boolean;
}
interface IdParams {
  id: string;
}
interface ProbeBody {
  host: string;
  port: number;
}
interface CheckBulkBody {
  serviceIds: string[];
}

const notFound = (reply: FastifyReply): FastifyReply =>
  reply.status(404).send({ error: 'Service not found' });

const handleCheckBulk = async (
  ctx: AppContext,
  serviceIds: string[]
): Promise<{ results: Record<string, { online: boolean; protocol: string | null }> }> => {
  const dns = await ctx.settings.getDnsConfig();
  if (!dns?.config.domain) {
    return { results: {} };
  }
  const proxy = await ctx.settings.getProxyProvider();
  const services = await Promise.all(serviceIds.map(id => ctx.services.getServiceById(id)));
  const checks = services.map(service => {
    if (!service || !service.enabled || !service.subdomain) {
      return Promise.resolve({ id: service?.id ?? '', online: false, protocol: null });
    }
    return resolveServiceStatus(service as NonNullable<typeof service>, dns.config.domain, proxy);
  });

  const results = await Promise.allSettled(checks);
  const statusMap: Record<string, { online: boolean; protocol: string | null }> = {};

  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.id) {
      statusMap[result.value.id] = {
        online: result.value.online,
        protocol: result.value.protocol,
      };
    }
  });

  return { results: statusMap };
};

async function resolveServiceStatus(
  service: NonNullable<Awaited<ReturnType<AppContext['services']['getServiceById']>>>,
  baseDomain: string,
  proxy: Awaited<ReturnType<AppContext['settings']['getProxyProvider']>>
): Promise<{ id: string; online: boolean; protocol: string | null }> {
  const fqdn = `${service.subdomain}.${baseDomain}`;
  const result = await checkDomainReachable(fqdn, service.sslPending ?? undefined);
  if (result.ok) return { id: service.id, online: true, protocol: result.protocol ?? null };
  const host = proxy ? await proxy.findByDomain(fqdn) : null;
  if (host) return { id: service.id, online: true, protocol: host.ssl ? 'https' : 'http' };
  return { id: service.id, online: false, protocol: null };
}

const handleMigration = async (
  ctx: AppContext,
  serviceId: string,
  reply: FastifyReply
): Promise<unknown> => {
  const service = await ctx.services.getServiceById(serviceId);
  if (!service) return notFound(reply);
  if (!service.enabled || !service.dnsRecordId || !service.proxyHostId) {
    return reply.status(400).send({ error: 'Service must be fully exposed to migrate' });
  }
  if (!service.exposedSubdomain || service.exposedSubdomain === service.subdomain) {
    return reply.status(400).send({ error: 'No subdomain mismatch detected' });
  }
  return ctx.expose.migrateSubdomain(service.id);
};

async function handleGetOrphans(ctx: AppContext): Promise<{ orphans: unknown[] }> {
  if (!ctx.discovery) return { orphans: [] };
  const containers = await ctx.discovery.discover();
  const containerIds = containers.map(c => c.id);
  const orphans = await ctx.sync.detectOrphans(containerIds);
  return { orphans };
}

async function handleCleanup(
  ctx: AppContext,
  serviceId: string,
  reply: FastifyReply
): Promise<{ success: boolean } | void> {
  const service = await ctx.services.getServiceById(serviceId);
  if (!service) return notFound(reply);
  if (service.exposureSource === 'discovered') {
    return reply.code(400).send({ error: 'Cannot cleanup discovered services' });
  }
  const promises = [];
  if (service.dnsRecordId) {
    const dns = await ctx.settings.getDnsProvider();
    if (dns) promises.push(dns.deleteRecord(service.dnsRecordId).catch(() => null));
  }
  if (service.proxyHostId) {
    const proxy = await ctx.settings.getProxyProvider();
    if (proxy) promises.push(proxy.deleteHost(service.proxyHostId).catch(() => null));
  }
  await Promise.all(promises);
  await ctx.services.deleteService(serviceId);
  return { success: true };
}

export const createServicesRoutes = (ctx: AppContext): FastifyPluginAsync => {
  return async server => {
    server.get('/', async () => ({ services: await ctx.services.getAllServices() }));

    server.get('/changes/version', async () => ctx.changeTracker.getInfo());

    server.get('/orphans', async () => handleGetOrphans(ctx));

    server.get<{ Params: IdParams }>('/:id', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      return service ? { service } : notFound(reply);
    });

    server.post<{ Body: CreateBody }>('/', async request => {
      const service = await ctx.services.createService({ ...request.body, source: 'manual' });
      return { service };
    });

    server.patch<{ Params: IdParams; Body: UpdateBody }>('/:id', async (request, reply) => {
      const service = await ctx.services.updateService(request.params.id, request.body);
      return service ? { service } : notFound(reply);
    });

    server.delete<{ Params: IdParams }>('/:id', async (request, reply) => {
      const deleted = await ctx.services.deleteService(request.params.id);
      return deleted ? { success: true } : notFound(reply);
    });

    server.post<{ Params: IdParams }>('/:id/probe', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      if (!service) return notFound(reply);

      const result = await probeBackend(ctx.lanIp, service.port);
      const shouldUpdate = result.responsive && result.scheme !== service.scheme;
      if (shouldUpdate) await ctx.services.updateService(service.id, { scheme: result.scheme });

      return {
        responsive: result.responsive,
        detectedScheme: result.scheme,
        currentScheme: service.scheme,
        updated: shouldUpdate,
      };
    });

    server.post<{ Body: ProbeBody }>('/probe', async request => {
      return probeBackend(request.body.host, request.body.port);
    });

    server.post<{ Params: IdParams }>('/:id/online', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      if (!service) return notFound(reply);
      if (!service.enabled || !service.subdomain) return { online: false };
      const dns = await ctx.settings.getDnsConfig();
      if (!dns?.config.domain) return { online: false };
      const fqdn = `${service.subdomain}.${dns.config.domain}`;
      const result = await checkDomainReachable(fqdn, service.sslPending ?? undefined);
      return { online: result.ok, domain: fqdn, protocol: result.protocol };
    });

    server.post<{ Body: CheckBulkBody }>('/check-bulk', async request => {
      return handleCheckBulk(ctx, request.body.serviceIds);
    });

    server.post<{ Params: IdParams }>('/:id/fix-config', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      if (!service) return notFound(reply);
      const result = await ctx.services.fixConfig(request.params.id);
      return result;
    });

    server.post<{ Params: IdParams }>('/:id/migrate-subdomain', async (request, reply) => {
      return handleMigration(ctx, request.params.id, reply);
    });

    server.delete<{ Params: IdParams }>('/:id/cleanup', async (request, reply) => {
      return handleCleanup(ctx, request.params.id, reply);
    });

    server.post('/refresh-tags', async () => {
      const result = await ctx.services.refreshAllTags();
      return result;
    });

    await server.register(createSslRoutes(ctx));
    await server.register(createSyncRoutes(ctx), { prefix: '/sync' });
  };
};
