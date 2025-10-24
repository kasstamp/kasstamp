import {
  createLogger,
  setGlobalLogLevel,
  setNamespaceLogLevel,
  configureLogger,
  disableLogging,
  enableDebugLogging,
  resetLogger,
} from './logger';
import { LogLevel } from './types';

// Mock console methods
const _originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

describe('@kasstamp/utils - Logger', () => {
  let consoleMocks: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    // Reset logger to default state
    resetLogger();

    // Mock console methods
    consoleMocks = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    // Restore console methods
    Object.entries(consoleMocks).forEach(([_key, mock]) => {
      mock.mockRestore();
    });
  });

  describe('createLogger', () => {
    it('should create a logger with namespace', () => {
      const logger = createLogger('test:namespace');
      expect(logger).toBeDefined();
      expect(logger.debug).toBeInstanceOf(Function);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.error).toBeInstanceOf(Function);
    });

    it('should log at all levels when global level is DEBUG', () => {
      setGlobalLogLevel(LogLevel.DEBUG);
      const logger = createLogger('test');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleMocks.debug).toHaveBeenCalled();
      expect(consoleMocks.info).toHaveBeenCalled();
      expect(consoleMocks.warn).toHaveBeenCalled();
      expect(consoleMocks.error).toHaveBeenCalled();
    });

    it('should respect global log level', () => {
      setGlobalLogLevel(LogLevel.WARN);
      const logger = createLogger('test');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleMocks.debug).not.toHaveBeenCalled();
      expect(consoleMocks.info).not.toHaveBeenCalled();
      expect(consoleMocks.warn).toHaveBeenCalled();
      expect(consoleMocks.error).toHaveBeenCalled();
    });

    it('should include namespace in log output', () => {
      setGlobalLogLevel(LogLevel.INFO); // Enable INFO logs
      const logger = createLogger('kasstamp:sdk');
      logger.info('test message');

      expect(consoleMocks.info).toHaveBeenCalled();
      const callArgs = consoleMocks.info.mock.calls[0];
      const logMessage = callArgs[0];
      expect(logMessage).toContain('kasstamp:sdk');
      expect(logMessage).toContain('test message');
    });

    it('should log context objects', () => {
      setGlobalLogLevel(LogLevel.INFO); // Enable INFO logs
      const logger = createLogger('test');
      const context = { userId: 123, action: 'login' };

      logger.info('User action', context);

      expect(consoleMocks.info).toHaveBeenCalled();
      const callArgs = consoleMocks.info.mock.calls[0];
      // Context should be in the arguments
      expect(callArgs).toContain(context);
    });
  });

  describe('namespace-based log levels', () => {
    it('should respect namespace-specific log level', () => {
      setGlobalLogLevel(LogLevel.WARN);
      setNamespaceLogLevel('kasstamp:sdk', LogLevel.DEBUG);

      const sdkLogger = createLogger('kasstamp:sdk');
      const walletLogger = createLogger('kasstamp:wallet');

      sdkLogger.debug('sdk debug');
      walletLogger.debug('wallet debug');

      expect(consoleMocks.debug).toHaveBeenCalledTimes(1);
      const logMessage = consoleMocks.debug.mock.calls[0][0];
      expect(logMessage).toContain('kasstamp:sdk');
    });

    it('should support hierarchical namespace matching', () => {
      setGlobalLogLevel(LogLevel.WARN);
      setNamespaceLogLevel('kasstamp:sdk', LogLevel.DEBUG);

      const parentLogger = createLogger('kasstamp:sdk');
      const childLogger = createLogger('kasstamp:sdk:stamping');

      parentLogger.debug('parent debug');
      childLogger.debug('child debug');

      expect(consoleMocks.debug).toHaveBeenCalledTimes(2);
    });

    it('should support wildcard patterns', () => {
      setGlobalLogLevel(LogLevel.WARN);
      setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

      const signingLogger = createLogger('kasstamp:wallet:signing');
      const storageLogger = createLogger('kasstamp:wallet:storage');
      const sdkLogger = createLogger('kasstamp:sdk');

      signingLogger.debug('signing debug');
      storageLogger.debug('storage debug');
      sdkLogger.debug('sdk debug');

      expect(consoleMocks.debug).toHaveBeenCalledTimes(2);
    });

    it('should use most specific namespace match', () => {
      setGlobalLogLevel(LogLevel.ERROR);
      setNamespaceLogLevel('kasstamp:sdk', LogLevel.WARN);
      setNamespaceLogLevel('kasstamp:sdk:stamping', LogLevel.DEBUG);

      const sdkLogger = createLogger('kasstamp:sdk');
      const stampingLogger = createLogger('kasstamp:sdk:stamping');

      sdkLogger.debug('sdk debug'); // Should not log (WARN level)
      stampingLogger.debug('stamping debug'); // Should log (DEBUG level)

      expect(consoleMocks.debug).toHaveBeenCalledTimes(1);
      const logMessage = consoleMocks.debug.mock.calls[0][0];
      expect(logMessage).toContain('stamping');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with extended namespace', () => {
      setGlobalLogLevel(LogLevel.INFO); // Enable INFO logs
      const parentLogger = createLogger('kasstamp:sdk');
      const childLogger = parentLogger.child('stamping');

      childLogger.info('child message');

      expect(consoleMocks.info).toHaveBeenCalled();
      const logMessage = consoleMocks.info.mock.calls[0][0];
      expect(logMessage).toContain('kasstamp:sdk:stamping');
    });

    it('should inherit parent namespace log level', () => {
      setGlobalLogLevel(LogLevel.WARN);
      setNamespaceLogLevel('kasstamp:sdk', LogLevel.DEBUG);

      const parentLogger = createLogger('kasstamp:sdk');
      const childLogger = parentLogger.child('stamping');

      childLogger.debug('child debug');

      expect(consoleMocks.debug).toHaveBeenCalled();
    });
  });

  describe('isLevelEnabled', () => {
    it('should correctly report enabled log levels', () => {
      setGlobalLogLevel(LogLevel.WARN);
      const logger = createLogger('test');

      expect(logger.isLevelEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isLevelEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isLevelEnabled(LogLevel.ERROR)).toBe(true);
    });
  });

  describe('error logging', () => {
    it('should log error with Error object', () => {
      const logger = createLogger('test');
      const error = new Error('Test error');

      logger.error('An error occurred', error);

      expect(consoleMocks.error).toHaveBeenCalledTimes(2); // Message + stack
    });

    it('should log error with context only', () => {
      const logger = createLogger('test');
      const context = { code: 'ERR_TEST', details: 'test' };

      logger.error('An error occurred', context);

      expect(consoleMocks.error).toHaveBeenCalledTimes(1);
    });

    it('should log error with both Error and context', () => {
      const logger = createLogger('test');
      const error = new Error('Test error');
      const context = { userId: 123 };

      logger.error('An error occurred', error, context);

      expect(consoleMocks.error).toHaveBeenCalledTimes(2); // Message + stack
      const firstCall = consoleMocks.error.mock.calls[0];
      expect(firstCall).toContain(context);
    });
  });

  describe('configuration', () => {
    it('should configure multiple namespaces at once', () => {
      configureLogger({
        level: LogLevel.WARN,
        namespaces: {
          'kasstamp:sdk': LogLevel.DEBUG,
          'kasstamp:wallet': LogLevel.INFO,
        },
      });

      const sdkLogger = createLogger('kasstamp:sdk');
      const walletLogger = createLogger('kasstamp:wallet');
      const otherLogger = createLogger('kasstamp:other');

      sdkLogger.debug('sdk debug');
      walletLogger.debug('wallet debug');
      walletLogger.info('wallet info');
      otherLogger.debug('other debug');

      expect(consoleMocks.debug).toHaveBeenCalledTimes(1); // Only SDK
      expect(consoleMocks.info).toHaveBeenCalledTimes(1); // Only wallet
    });
  });

  describe('utility functions', () => {
    it('disableLogging should silence all logs', () => {
      disableLogging();
      const logger = createLogger('test');

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleMocks.debug).not.toHaveBeenCalled();
      expect(consoleMocks.info).not.toHaveBeenCalled();
      expect(consoleMocks.warn).not.toHaveBeenCalled();
      expect(consoleMocks.error).not.toHaveBeenCalled();
    });

    it('enableDebugLogging should enable all logs', () => {
      disableLogging();
      enableDebugLogging();

      const logger = createLogger('test');
      logger.debug('debug message');

      expect(consoleMocks.debug).toHaveBeenCalled();
    });
  });
});
