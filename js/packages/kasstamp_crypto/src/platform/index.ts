import { createLogger } from '@kasstamp/utils';

const platformLogger = createLogger('kasstamp:crypto:platform');

/**
 * Platform capabilities detection
 */
export interface PlatformCapabilities {
  hasWebCrypto: boolean;
  hasFileSystem: boolean;
  hasStreams: boolean;
  platform: 'node' | 'browser' | 'unknown';
}

/**
 * Crypto platform interface
 */
export interface CryptoPlatform {
  subtle: SubtleCrypto;
  getRandomValues: (array: Uint8Array) => Uint8Array;
  capabilities: PlatformCapabilities;
}

/**
 * Detect current platform capabilities
 */
export function detectPlatformCapabilities(): PlatformCapabilities {
  const hasWebCrypto = typeof globalThis.crypto?.subtle !== 'undefined';
  const hasFileSystem = typeof process !== 'undefined' && process.versions?.node;
  const hasStreams = typeof ReadableStream !== 'undefined';

  let platform: 'node' | 'browser' | 'unknown' = 'unknown';
  if (typeof process !== 'undefined' && process.versions?.node) {
    platform = 'node';
  } else if (typeof window !== 'undefined') {
    platform = 'browser';
  }

  return {
    hasWebCrypto,
    hasFileSystem: !!hasFileSystem,
    hasStreams,
    platform,
  };
}

/**
 * Initialize crypto platform with enterprise-grade error handling
 */
export function initializeCryptoPlatform(): CryptoPlatform {
  const capabilities = detectPlatformCapabilities();

  if (!capabilities.hasWebCrypto) {
    const nodeVersion = typeof process !== 'undefined' ? process.version : 'unknown';
    let versionSpecificHelp = '';

    if (typeof process !== 'undefined' && process.versions?.node) {
      const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
      if (majorVersion < 20) {
        versionSpecificHelp = `\n⚠️  Node.js ${majorVersion} is not supported. Please upgrade to Node.js 20+ (LTS).`;
      }
    }

    throw new Error(
      `WebCrypto API not available.\n\n` +
        `Requirements:\n` +
        `- Node.js 20.0.0 or later (current: ${nodeVersion})\n` +
        `- Modern browser with Web Crypto API support\n\n` +
        `Platform detected: ${capabilities.platform}${versionSpecificHelp}\n` +
        `For Node.js: Update to Node.js 20+ for full WebCrypto support\n` +
        `For browsers: Use a modern browser (Chrome 37+, Firefox 34+, Safari 7+)`
    );
  }

  return {
    subtle: globalThis.crypto.subtle,
    getRandomValues: (array: Uint8Array) => globalThis.crypto.getRandomValues(array),
    capabilities,
  };
}

/**
 * Global crypto platform instance
 * Initialized once and reused throughout the application
 */
export const cryptoPlatform = initializeCryptoPlatform();

/**
 * Compression platform interface
 */
export interface CompressionPlatform {
  gzip: (data: Uint8Array) => Promise<Uint8Array>;
  gunzip: (data: Uint8Array) => Promise<Uint8Array>;
  supportsStreaming: boolean;
}

/**
 * Initialize compression platform with browser/Node.js support
 */
export async function initializeCompressionPlatform(): Promise<CompressionPlatform> {
  const capabilities = detectPlatformCapabilities();

  // Modern browsers with Compression Streams API
  if (typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') {
    return {
      gzip: async (data: Uint8Array) => {
        try {
          const stream = new CompressionStream('gzip');
          const writer = stream.writable.getWriter();
          const reader = stream.readable.getReader();

          // Write data to the stream
          await writer.write(new Uint8Array(data));
          await writer.close();

          // Read compressed data
          const chunks: Uint8Array[] = [];
          let done = false;

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              chunks.push(new Uint8Array(value));
            }
            done = readerDone;
          }

          // Combine all chunks
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const result = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }

          return result;
        } catch (error) {
          platformLogger.error('Compression failed', error as Error);
          throw new Error(
            `Compression failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      },
      gunzip: async (data: Uint8Array) => {
        try {
          const stream = new DecompressionStream('gzip');
          const writer = stream.writable.getWriter();
          const reader = stream.readable.getReader();

          // Write compressed data to the stream
          await writer.write(new Uint8Array(data));
          await writer.close();

          // Read decompressed data
          const chunks: Uint8Array[] = [];
          let done = false;

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              chunks.push(new Uint8Array(value));
            }
            done = readerDone;
          }

          // Combine all chunks
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const result = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }

          return result;
        } catch (error) {
          platformLogger.error('Decompression failed', error as Error);
          throw new Error(
            `Decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      },
      supportsStreaming: true,
    };
  }

  // Node.js with zlib
  if (capabilities.hasFileSystem) {
    try {
      const zlib = await import('node:zlib');
      const { promisify } = await import('node:util');

      const gzipAsync = promisify(zlib.gzip);
      const gunzipAsync = promisify(zlib.gunzip);

      return {
        gzip: async (data: Uint8Array) => {
          const result = await gzipAsync(data);
          return new Uint8Array(result);
        },
        gunzip: async (data: Uint8Array) => {
          const result = await gunzipAsync(data);
          return new Uint8Array(result);
        },
        supportsStreaming: true,
      };
    } catch (error) {
      throw new Error(
        `Node.js zlib not available: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Fallback for older browsers (no compression)
  platformLogger.warn(
    'Compression not available in this environment. Data will not be compressed.'
  );
  return {
    gzip: async (data: Uint8Array) => data, // Pass-through
    gunzip: async (data: Uint8Array) => data, // Pass-through
    supportsStreaming: false,
  };
}
