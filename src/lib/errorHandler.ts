export type ErrorType = 'network' | 'api-key' | 'tool' | 'generic';

export interface ErrorInfo {
  type: ErrorType;
  title: string;
  message: string;
  action?: string;
}

export function classifyError(error: string): ErrorType {
  const lower = error.toLowerCase();
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('dns') ||
    lower.includes('failed to fetch')
  ) {
    return 'network';
  }
  if (
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('invalid key') ||
    lower.includes('authentication')
  ) {
    return 'api-key';
  }
  if (
    lower.includes('tool') ||
    lower.includes('execution failed') ||
    lower.includes('function call')
  ) {
    return 'tool';
  }
  return 'generic';
}

export function getUserMessage(error: string): ErrorInfo {
  const type = classifyError(error);
  switch (type) {
    case 'network':
      return {
        type,
        title: 'Connection Error',
        message: 'Check your connection and try again.',
        action: 'Retry',
      };
    case 'api-key':
      return {
        type,
        title: 'Invalid API Key',
        message: 'Your API key may be missing or expired. Update it in Settings → Provider.',
        action: 'Open Settings',
      };
    case 'tool':
      return {
        type,
        title: 'Tool Execution Failed',
        message: error.length > 120 ? error.slice(0, 120) + '…' : error,
        action: 'Retry',
      };
    case 'generic':
      return {
        type,
        title: 'Something Went Wrong',
        message: error.length > 120 ? error.slice(0, 120) + '…' : error,
        action: 'Retry',
      };
  }
}
