import { emit, type ExposeContext } from './progress-emitter.js';
import { updateStep } from './progress.types.js';
import { verifyHttpsReachability } from './reachability.js';

export async function finishProxyStep(
  ctx: ExposeContext,
  port: number,
  domain: string,
  existing: boolean
): Promise<void> {
  ctx.steps = updateStep(ctx.steps, 'proxy', {
    status: 'running',
    progress: 85,
    detail: 'Verifying reachability...',
  });
  emit(ctx);
  const reachable = await verifyHttpsReachability(domain);
  const prefix = existing ? 'Found existing: ' : '';
  const detail = reachable
    ? `${prefix}Port ${port} -> 443 (reachable)`
    : `${prefix}Port ${port} -> 443 (not reachable yet)`;
  const status = reachable ? 'success' : 'warning';
  ctx.steps = updateStep(ctx.steps, 'proxy', { status, progress: 100, detail });
  emit(ctx);
}
