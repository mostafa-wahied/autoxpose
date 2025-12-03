import pino from 'pino';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 },
  },
});

export function createLogger(name: string): pino.Logger {
  return baseLogger.child({ name });
}
