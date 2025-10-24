/**
 * Platform detection utilities for kaspa_wasm_sdk
 * Similar to @kasstamp/crypto platform detection
 */

// Check if we're in a browser environment
export const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Check if we're in a Node.js environment
export const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Check if we're in a web worker
export const isWebWorker =
  typeof self !== 'undefined' &&
  typeof (self as { importScripts?: () => void }).importScripts === 'function';

export type Platform = 'node' | 'browser' | 'webworker';

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  if (isNode) {
    return 'node';
  }
  if (isWebWorker) {
    return 'webworker';
  }
  if (isBrowser) {
    return 'browser';
  }
  // Default to node if we can't detect
  return 'node';
}

/**
 * Get the appropriate WASM SDK path based on platform
 */
export function getWasmSdkPath(): string {
  const platform = detectPlatform();

  switch (platform) {
    case 'node':
      return '../nodejs/kaspa.js';
    case 'browser':
    case 'webworker':
      return '../web/kaspa.js';
    default:
      return '../nodejs/kaspa.js';
  }
}
