/**
 * @fileoverview Centralized logging configuration for the web application
 *
 * This module configures and exports loggers for different parts of the application.
 * It uses the @kasstamp/utils logger system for consistent, structured logging.
 */

import { createLogger } from '@kasstamp/utils';

// Main application logger
export const appLogger = createLogger('kasstamp:web:app');

// Service loggers
export const walletLogger = createLogger('kasstamp:web:wallet');
export const stampingLogger = createLogger('kasstamp:web:stamping');
export const sdkLogger = createLogger('kasstamp:web:sdk');

// UI Component loggers
export const dialogLogger = createLogger('kasstamp:web:dialog');
export const hookLogger = createLogger('kasstamp:web:hooks');
export const pageLogger = createLogger('kasstamp:web:pages');
