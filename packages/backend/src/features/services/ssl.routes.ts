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

      const dns = await ctx.settings.getDnsConfig();
      if (!dns?.config.domain) return badRequest(reply, 'No DNS domain configured');

      const proxy = await ctx.settings.getProxyProvider();
      if (!proxy) return badRequest(reply, 'No proxy provider configured');

      const fqdn = `${service.subdomain}.${dns.config.domain}`;
      const host = await proxy.findByDomain(fqdn);
      if (!host) return badRequest(reply, 'No proxy host found for this service');

      const result = await proxy.retrySsl(host.id, fqdn);
      return { success: result.success, error: result.error };
    });
  };
};
