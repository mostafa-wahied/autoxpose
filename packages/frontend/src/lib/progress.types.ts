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
