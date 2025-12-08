import { loadConfig } from './core/config/loader.js';
import { createAppContext } from './core/context.js';
import { getDatabase } from './core/database/index.js';
import { createLogger } from './core/logger/index.js';
import { createServer } from './server.js';

const logger = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.serverIp === 'localhost') {
    logger.warn(
      'SERVER_IP not set! DNS records will use "localhost". Set SERVER_IP env var to your public IP.'
    );
  } else {
    logger.info(
      { serverIp: config.serverIp, lanIp: config.lanIp },
      'IPs: public for DNS, LAN for proxy'
    );
  }

  const db = getDatabase(config.database.path);
  const ctx = createAppContext(db, config.docker?.socketPath, {
    publicIp: config.serverIp,
    lanIp: config.lanIp,
    lanProvided: Boolean(process.env.LAN_IP),
  });
  const server = await createServer(config, ctx);

  ctx.startWatcher();
  await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`Server running on port ${config.port}`);
}

main().catch(err => {
  logger.error(err);
  process.exit(1);
});
