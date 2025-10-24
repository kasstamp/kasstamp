import { LogLevel, LogContext, LoggerConfig, ILogger } from './types';

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Browser color styles for console
 */
const BROWSER_COLORS = {
  DEBUG: 'color: #6B7280; font-weight: normal',
  INFO: 'color: #3B82F6; font-weight: normal',
  WARN: 'color: #F59E0B; font-weight: bold',
  ERROR: 'color: #EF4444; font-weight: bold',
  namespace: 'color: #8B5CF6; font-weight: bold',
  timestamp: 'color: #9CA3AF; font-weight: normal',
};

/**
 * Global logger configuration
 */
class LoggerManager {
  private config: Required<LoggerConfig>;
  private namespacePatterns: Map<string, LogLevel> = new Map();
  private isBrowser: boolean;

  constructor() {
    // Detect environment
    this.isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

    // Default configuration - NO default log level!
    // Log level must be explicitly set via setGlobalLogLevel() at app startup
    this.config = {
      level: LogLevel.ERROR, // Silent by default - only errors (nothing is logged without explicit config)
      namespaces: {},
      colors: true,
      timestamps: true,
      formatter: this.defaultFormatter.bind(this),
    };
  }

  /**
   * Set global log level
   */
  setGlobalLogLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Set log level for a specific namespace or pattern
   * Supports wildcards: 'kasstamp:*' or 'kasstamp:sdk:*'
   */
  setNamespaceLogLevel(namespace: string, level: LogLevel): void {
    this.config.namespaces[namespace] = level;
    this.namespacePatterns.set(namespace, level);
  }

  /**
   * Configure logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Update namespace patterns
    if (config.namespaces) {
      Object.entries(config.namespaces).forEach(([namespace, level]) => {
        this.namespacePatterns.set(namespace, level);
      });
    }
  }

  /**
   * Reset logger configuration to silent (ERROR only)
   */
  reset(): void {
    this.config = {
      level: LogLevel.ERROR, // Silent by default
      namespaces: {},
      colors: true,
      timestamps: true,
      formatter: this.defaultFormatter.bind(this),
    };
    this.namespacePatterns.clear();
  }

  /**
   * Get effective log level for a namespace
   */
  getEffectiveLevel(namespace: string): LogLevel {
    // Check exact match first
    if (this.config.namespaces[namespace] !== undefined) {
      return this.config.namespaces[namespace];
    }

    // Check pattern matches (most specific first)
    const parts = namespace.split(':');
    for (let i = parts.length; i > 0; i--) {
      const pattern = parts.slice(0, i).join(':');

      // Check exact pattern
      if (this.config.namespaces[pattern] !== undefined) {
        return this.config.namespaces[pattern];
      }

      // Check wildcard pattern
      const wildcardPattern = `${pattern}:*`;
      if (this.config.namespaces[wildcardPattern] !== undefined) {
        return this.config.namespaces[wildcardPattern];
      }
    }

    // Fall back to global level
    return this.config.level;
  }

  /**
   * Default formatter for log messages
   */
  private defaultFormatter(
    level: string,
    namespace: string,
    message: string,
    timestamp: Date
  ): string {
    const time = this.config.timestamps ? timestamp.toISOString() : '';

    if (this.isBrowser && this.config.colors) {
      // Browser uses CSS styling
      return time
        ? `%c${time}%c [%c${level}%c] %c[${namespace}]%c ${message}`
        : `[%c${level}%c] %c[${namespace}]%c ${message}`;
    } else if (this.config.colors) {
      // Terminal uses ANSI codes
      const levelColor = this.getLevelColor(level);
      const timeStr = time ? `${COLORS.gray}${time}${COLORS.reset} ` : '';
      return `${timeStr}${levelColor}[${level}]${COLORS.reset} ${COLORS.magenta}[${namespace}]${COLORS.reset} ${message}`;
    } else {
      // No colors
      return time
        ? `${time} [${level}] [${namespace}] ${message}`
        : `[${level}] [${namespace}] ${message}`;
    }
  }

  private getLevelColor(level: string): string {
    switch (level) {
      case 'DEBUG':
        return COLORS.gray;
      case 'INFO':
        return COLORS.blue;
      case 'WARN':
        return COLORS.yellow;
      case 'ERROR':
        return COLORS.red;
      default:
        return COLORS.reset;
    }
  }

  /**
   * Get browser color arguments for console styling
   */
  getBrowserColorArgs(level: string): string[] {
    if (!this.config.timestamps) {
      return [
        BROWSER_COLORS[level as keyof typeof BROWSER_COLORS] || '',
        '',
        BROWSER_COLORS.namespace,
        '',
      ];
    }

    return [
      BROWSER_COLORS.timestamp,
      '',
      BROWSER_COLORS[level as keyof typeof BROWSER_COLORS] || '',
      '',
      BROWSER_COLORS.namespace,
      '',
    ];
  }

  getConfig(): Required<LoggerConfig> {
    return this.config;
  }

  isBrowserEnvironment(): boolean {
    return this.isBrowser;
  }
}

/**
 * Global logger manager instance
 */
const loggerManager = new LoggerManager();

/**
 * Logger implementation
 */
class Logger implements ILogger {
  private readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  /**
   * Check if a log level is enabled for this logger
   * Checks dynamically so configuration changes take effect immediately
   */
  isLevelEnabled(level: LogLevel): boolean {
    const effectiveLevel = loggerManager.getEffectiveLevel(this.namespace);
    return effectiveLevel <= level;
  }

  /**
   * Log a debug message
   * Calls console directly to preserve call site in browser DevTools
   */
  debug(message: string, context?: LogContext): void {
    if (!this.isLevelEnabled(LogLevel.DEBUG)) return;

    const config = loggerManager.getConfig();
    const timestamp = new Date();
    const formattedMessage = config.formatter('DEBUG', this.namespace, message, timestamp);

    if (loggerManager.isBrowserEnvironment() && config.colors) {
      const colorArgs = loggerManager.getBrowserColorArgs('DEBUG');
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.debug(formattedMessage, ...colorArgs, context);
      } else {
        // eslint-disable-next-line no-console
        console.debug(formattedMessage, ...colorArgs);
      }
    } else {
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.debug(formattedMessage, context);
      } else {
        // eslint-disable-next-line no-console
        console.debug(formattedMessage);
      }
    }
  }

  /**
   * Log an info message
   * Calls console directly to preserve call site in browser DevTools
   */
  info(message: string, context?: LogContext): void {
    if (!this.isLevelEnabled(LogLevel.INFO)) return;

    const config = loggerManager.getConfig();
    const timestamp = new Date();
    const formattedMessage = config.formatter('INFO', this.namespace, message, timestamp);

    if (loggerManager.isBrowserEnvironment() && config.colors) {
      const colorArgs = loggerManager.getBrowserColorArgs('INFO');
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.info(formattedMessage, ...colorArgs, context);
      } else {
        // eslint-disable-next-line no-console
        console.info(formattedMessage, ...colorArgs);
      }
    } else {
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.info(formattedMessage, context);
      } else {
        // eslint-disable-next-line no-console
        console.info(formattedMessage);
      }
    }
  }

  /**
   * Log a warning message
   * Calls console directly to preserve call site in browser DevTools
   */
  warn(message: string, context?: LogContext): void {
    if (!this.isLevelEnabled(LogLevel.WARN)) return;

    const config = loggerManager.getConfig();
    const timestamp = new Date();
    const formattedMessage = config.formatter('WARN', this.namespace, message, timestamp);

    if (loggerManager.isBrowserEnvironment() && config.colors) {
      const colorArgs = loggerManager.getBrowserColorArgs('WARN');
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage, ...colorArgs, context);
      } else {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage, ...colorArgs);
      }
    } else {
      if (context && Object.keys(context).length > 0) {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage, context);
      } else {
        // eslint-disable-next-line no-console
        console.warn(formattedMessage);
      }
    }
  }

  /**
   * Log an error message
   * Calls console directly to preserve call site in browser DevTools
   */
  error(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (!this.isLevelEnabled(LogLevel.ERROR)) return;

    // Handle overloaded parameters
    let actualError: Error | undefined;
    let actualContext: LogContext | undefined;

    if (error instanceof Error) {
      actualError = error;
      actualContext = context;
    } else {
      actualContext = error;
    }

    const config = loggerManager.getConfig();
    const timestamp = new Date();
    const formattedMessage = config.formatter('ERROR', this.namespace, message, timestamp);

    if (loggerManager.isBrowserEnvironment() && config.colors) {
      const colorArgs = loggerManager.getBrowserColorArgs('ERROR');
      if (actualContext && Object.keys(actualContext).length > 0) {
        // eslint-disable-next-line no-console
        console.error(formattedMessage, ...colorArgs, actualContext);
      } else {
        // eslint-disable-next-line no-console
        console.error(formattedMessage, ...colorArgs);
      }
    } else {
      if (actualContext && Object.keys(actualContext).length > 0) {
        // eslint-disable-next-line no-console
        console.error(formattedMessage, actualContext);
      } else {
        // eslint-disable-next-line no-console
        console.error(formattedMessage);
      }
    }

    // Log error stack separately if provided
    if (actualError && actualError.stack) {
      // eslint-disable-next-line no-console
      console.error(actualError.stack);
    }
  }

  /**
   * Create a child logger with additional namespace
   */
  child(subNamespace: string): ILogger {
    return new Logger(`${this.namespace}:${subNamespace}`);
  }
}

/**
 * Create a logger for a specific namespace
 *
 * @param namespace - Namespace identifier (e.g., 'kasstamp:sdk:stamping')
 * @returns Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger('kasstamp:wallet');
 * logger.info('Wallet initialized');
 * ```
 */
export function createLogger(namespace: string): ILogger {
  return new Logger(namespace);
}

/**
 * Set the global log level
 *
 * @param level - Log level to set
 *
 * @example
 * ```typescript
 * setGlobalLogLevel(LogLevel.WARN);
 * ```
 */
export function setGlobalLogLevel(level: LogLevel): void {
  loggerManager.setGlobalLogLevel(level);
}

/**
 * Set log level for a specific namespace or pattern
 *
 * @param namespace - Namespace or pattern (supports wildcards)
 * @param level - Log level to set
 *
 * @example
 * ```typescript
 * // Set specific namespace
 * setNamespaceLogLevel('kasstamp:sdk', LogLevel.DEBUG);
 *
 * // Use wildcard pattern
 * setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.INFO);
 * ```
 */
export function setNamespaceLogLevel(namespace: string, level: LogLevel): void {
  loggerManager.setNamespaceLogLevel(namespace, level);
}

/**
 * Configure the logger system
 *
 * @param config - Logger configuration
 *
 * @example
 * ```typescript
 * configureLogger({
 *   level: LogLevel.INFO,
 *   namespaces: {
 *     'kasstamp:sdk': LogLevel.DEBUG,
 *     'kasstamp:wallet:*': LogLevel.WARN,
 *   },
 *   colors: true,
 *   timestamps: true,
 * });
 * ```
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  loggerManager.configure(config);
}

/**
 * Disable all logging
 */
export function disableLogging(): void {
  loggerManager.setGlobalLogLevel(LogLevel.SILENT);
}

/**
 * Enable debug logging for all namespaces
 */
export function enableDebugLogging(): void {
  loggerManager.setGlobalLogLevel(LogLevel.DEBUG);
}

/**
 * Reset logger to default configuration (useful for testing)
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   resetLogger();
 * });
 * ```
 */
export function resetLogger(): void {
  loggerManager.reset();
}
