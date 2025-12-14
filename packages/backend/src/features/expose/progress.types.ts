export type ProgressPhase = 'dns' | 'proxy';
export type ProgressStatus = 'pending' | 'running' | 'success' | 'error' | 'warning';

export interface ProgressStep {
  phase: ProgressPhase;
  status: ProgressStatus;
  progress: number;
  message: string;
  detail?: string;
}

export interface ProgressResult {
  success: boolean;
  domain?: string;
  dnsRecordId?: string;
  proxyHostId?: string;
  error?: string;
  sslPending?: boolean;
  sslError?: string;
}

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  serviceId: string;
  action: 'expose' | 'unexpose';
  steps: ProgressStep[];
  timestamp: number;
  result?: ProgressResult;
}

export function createInitialSteps(action: 'expose' | 'unexpose'): ProgressStep[] {
  const verb = action === 'expose' ? 'Creating' : 'Removing';
  return [
    {
      phase: 'dns',
      status: 'pending',
      progress: 0,
      message: `${verb} DNS record`,
      detail: 'Waiting...',
    },
    {
      phase: 'proxy',
      status: 'pending',
      progress: 0,
      message: `${verb} proxy host`,
      detail: 'Waiting...',
    },
  ];
}

export function updateStep(
  steps: ProgressStep[],
  phase: ProgressPhase,
  update: Partial<ProgressStep>
): ProgressStep[] {
  return steps.map(step => (step.phase === phase ? { ...step, ...update } : step));
}
