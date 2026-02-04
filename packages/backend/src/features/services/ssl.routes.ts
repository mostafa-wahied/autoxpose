import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';

interface IdParams {
  id: string;
}

const notFound = (reply: FastifyReply): FastifyReply =>
  reply.status(404).send({ error: 'Service not found' });

const badRequest = (reply: FastifyReply, message: string): FastifyReply =>
  reply.status(400).send({ error: message });

export const createSslRoutes = (ctx: AppContext): FastifyPluginAsync => {
  return async server => {
    server.post<{ Params: IdParams }>('/:id/retry-ssl', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      if (!service) return notFound(reply);
      if (!service.subdomain) return badRequest(reply, 'Service has no subdomain');

      const baseDomain = await ctx.settings.getBaseDomainFromAnySource();
      if (!baseDomain) return badRequest(reply, 'No domain configured');

      const proxy = await ctx.settings.getProxyProvider();
      if (!proxy) return badRequest(reply, 'No proxy provider configured');

      const fqdn = `${service.subdomain}.${baseDomain}`;
      const host = await proxy.findByDomain(fqdn);
      if (!host) return badRequest(reply, 'No proxy host found for this service');

      const result = await proxy.retrySsl(host.id, fqdn);

      if (result.success) {
        await ctx.servicesRepo.update(service.id, {
          sslPending: false,
          sslError: null,
        });
      } else {
        await ctx.servicesRepo.update(service.id, {
          sslPending: true,
          sslError: result.error || 'SSL setup failed',
        });
      }

      return { success: result.success, error: result.error };
    });
  };
};
