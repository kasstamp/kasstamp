/**
 * Log levels in ascending order of severity
 */
export enum LogLevel {
  /** Detailed debugging information */
  DEBUG = 0,
  /** Informational messages */
  INFO = 1,
  /** Warning messages */
  WARN = 2,
  /** Error messages */
  ERROR = 3,
  /** No logging */
  SILENT = 4,
}

/**
 * Additional context to include with log messages
 * Can be any object with string keys and values of any type
 */
export type LogContext = Record<string, unknown> | object;

/**
 * Configuration for the logger
 */
export interface LoggerConfig {
  /** Global log level (default: DEBUG in dev, WARN in prod) */
  level?: LogLevel;
  /** Per-namespace log level overrides */
  namespaces?: Record<string, LogLevel>;
  /** Enable colored output (default: true) */
  colors?: boolean;
  /** Enable timestamps (default: true) */
  timestamps?: boolean;
  /** Custom format function */
  formatter?: (level: string, namespace: string, message: string, timestamp: Date) => string;
}

/**
 * Logger interface
 */
export interface ILogger {
  /** Log a debug message */
  debug(message: string, context?: LogContext): void;
  /** Log an info message */
  info(message: string, context?: LogContext): void;
  /** Log a warning message */
  warn(message: string, context?: LogContext): void;
  /** Log an error message */
  error(message: string, error?: Error | LogContext, context?: LogContext): void;
  /** Create a child logger with additional namespace */
  child(subNamespace: string): ILogger;
  /** Check if a log level is enabled */
  isLevelEnabled(level: LogLevel): boolean;
}
