import type { FastifyPluginAsync } from 'fastify';
import { resetDatabase } from '../../core/database/index.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('dev-routes');

export const devRoutes: FastifyPluginAsync = async server => {
  server.post('/reset-db', async (_request, reply) => {
    const isDev = process.env.NODE_ENV !== 'production';
    const devMode = process.env.DEV_MODE === 'true';

    if (!isDev && !devMode) {
      return reply.status(403).send({ error: 'Development endpoints are disabled in production' });
    }

    logger.warn('Manual database reset triggered via API');
    resetDatabase();

    return {
      success: true,
      message: 'Database reset complete. All data cleared.',
      warning: 'Restart the container for cleanest state: docker compose restart autoxpose',
    };
  });

  server.get('/info', async () => {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      devMode: process.env.DEV_MODE === 'true',
      resetDbOnStartup: process.env.RESET_DB === 'true',
    };
  });
};
