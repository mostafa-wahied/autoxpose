/**
 * Progress tracking types for SSE-based expose/unexpose operations.
 * Mirrors the backend types for type safety.
 */

export type ProgressPhase = 'dns' | 'proxy';
export type ProgressStatus = 'pending' | 'running' | 'success' | 'error';

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
}

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  serviceId: string;
  action: 'expose' | 'unexpose';
  steps: ProgressStep[];
  timestamp: number;
  result?: ProgressResult;
}
