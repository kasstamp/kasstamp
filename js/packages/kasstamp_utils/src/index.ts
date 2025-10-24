// Export logger functionality
export {
  createLogger,
  setGlobalLogLevel,
  setNamespaceLogLevel,
  configureLogger,
  disableLogging,
  enableDebugLogging,
  resetLogger,
} from './logger';

// Export types
export type { ILogger, LogContext, LoggerConfig } from './types';

export { LogLevel } from './types';

/**
 * Package version
 */
export const VERSION = '0.1.0';
