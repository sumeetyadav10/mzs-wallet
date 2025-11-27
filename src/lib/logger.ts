// Production-safe logging utility - TEMPORARILY ENABLED FOR DEBUGGING
const isDevelopment = true; // Enable logging to debug ROAM transaction failures
const isClient = typeof window !== 'undefined';

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.log('[LOG]', ...args);
    }
  },
  
  error: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.error('[ERROR]', ...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.warn('[WARN]', ...args);
    }
  },
  
  info: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.info('[INFO]', ...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.debug('[DEBUG]', ...args);
    }
  },
  
  // Security audit log - enabled for debugging
  audit: (action: string, details: any) => {
    if (isDevelopment && !isClient) {
      console.log('[AUDIT]', action, details);
    }
  },
  
  // Security event log - enabled for debugging
  security: (...args: any[]) => {
    if (isDevelopment && !isClient) {
      console.log('[SECURITY]', ...args);
    }
  }
};

export default logger;