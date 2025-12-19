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

  const services = await Promise.all(serviceIds.map(id => ctx.services.getServiceById(id)));

  const checks = services.map(async service => {
    if (!service || !service.enabled || !service.subdomain) {
      return { id: service?.id ?? '', online: false, protocol: null };
    }
    const fqdn = `${service.subdomain}.${dns.config.domain}`;
    const result = await checkDomainReachable(fqdn, service.sslPending ?? undefined);
    return { id: service.id, online: result.ok, protocol: result.protocol ?? null };
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

export const createServicesRoutes = (ctx: AppContext): FastifyPluginAsync => {
  return async server => {
    server.get('/', async () => ({ services: await ctx.services.getAllServices() }));

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

    await server.register(createSslRoutes(ctx));
    await server.register(createSyncRoutes(ctx), { prefix: '/sync' });
  };
};
