export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string) {
    super(`${provider}: ${message}`, 'PROVIDER_ERROR', 502);
    this.name = 'ProviderError';
  }
}

function isCleanMessage(cleaned: string): boolean {
  const hasHtml = /<[^>]*>/.test(cleaned);
  const isRawHttpError = /^(API error:\s*\d+|HTTP \d+)/i.test(cleaned);
  return !hasHtml && !isRawHttpError && cleaned.length < 150;
}

function translateHttpStatus(status: string): string {
  if (status === '404') return 'Service not found. Check your URL/endpoint configuration.';
  if (status === '401') return 'Authentication failed. Check your credentials.';
  if (status === '403') return 'Access denied. Check your account permissions.';
  return `Connection failed (HTTP ${status}). Check your configuration.`;
}

function handleRawHttpError(cleaned: string): string | null {
  if (!cleaned.startsWith('HTTP ') && !/^\d{3}\s/.test(cleaned)) return null;

  if (cleaned.includes('404')) return 'Service not found. Check your URL/endpoint configuration.';
  if (cleaned.includes('401')) return 'Authentication failed. Check your credentials.';
  if (cleaned.includes('403')) return 'Access denied. Check your account permissions.';
  if (cleaned.includes('500')) return 'Server error. The service may be down or misconfigured.';

  return null;
}

export function cleanErrorMessage(message: string): string {
  let cleaned = message.replace(/^[a-z]+:\s*/i, '');

  if (isCleanMessage(cleaned)) {
    return cleaned.trim();
  }

  cleaned = cleaned.replace(/<[^>]*>/g, '');

  const apiErrorMatch = cleaned.match(/API error:\s*(\d+)/i);
  if (apiErrorMatch) {
    return translateHttpStatus(apiErrorMatch[1]);
  }

  const httpError = handleRawHttpError(cleaned);
  if (httpError) return httpError;

  if (cleaned.toLowerCase().includes('timeout') || cleaned.toLowerCase().includes('timed out')) {
    return 'Connection timeout. Check if the service is reachable.';
  }

  cleaned = cleaned.trim();
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 147) + '...';
  }

  return cleaned || 'Connection test failed';
}
