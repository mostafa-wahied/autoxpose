import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ProgressEvent } from './progress.types.js';
import type { StreamingExposeService } from './streaming-expose.service.js';

type IdParams = { id: string };
type Action = 'expose' | 'unexpose';

/**Set SSE headers on the response */
function setupSSE(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

/**Create SSE event sender */
function createEventSender(reply: FastifyReply): (event: ProgressEvent) => void {
  return (event: ProgressEvent) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**Create error event for SSE stream */
function createErrorEvent(id: string, action: Action, error: unknown): ProgressEvent {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    type: 'error',
    serviceId: id,
    action,
    steps: [],
    timestamp: Date.now(),
    result: { success: false, error: message },
  };
}

/**
 * SSE routes for real-time expose/unexpose progress streaming.
 */
export function createStreamingExposeRoutes(
  streamingExpose: StreamingExposeService
): FastifyPluginAsync {
  return async server => {
    server.get<{ Params: IdParams }>('/:id/expose/stream', async (request, reply) => {
      const { id } = request.params;
      setupSSE(reply);
      const sendEvent = createEventSender(reply);
      try {
        await streamingExpose.exposeWithProgress(id, sendEvent);
      } catch (error) {
        sendEvent(createErrorEvent(id, 'expose', error));
      }
      reply.raw.end();
    });

    server.get<{ Params: IdParams }>('/:id/unexpose/stream', async (request, reply) => {
      const { id } = request.params;
      setupSSE(reply);
      const sendEvent = createEventSender(reply);
      try {
        await streamingExpose.unexposeWithProgress(id, sendEvent);
      } catch (error) {
        sendEvent(createErrorEvent(id, 'unexpose', error));
      }
      reply.raw.end();
    });
  };
}
