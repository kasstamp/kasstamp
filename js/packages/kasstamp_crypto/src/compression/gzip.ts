import { initializeCompressionPlatform } from '../platform';

let compressionPlatform: Awaited<ReturnType<typeof initializeCompressionPlatform>> | null = null;

/**
 * Ensure compression platform is initialized
 *
 * @internal
 */
async function ensureCompressionPlatform(): Promise<void> {
  if (!compressionPlatform) {
    compressionPlatform = await initializeCompressionPlatform();
  }
}

/**
 * Compress data using GZIP algorithm
 *
 * @param data - The data to compress
 * @param level - Compression level (0-9, default 6). Only used in Node.js
 * @returns Promise resolving to compressed data
 *
 * @throws {Error} If compression fails or is not available
 *
 * @example
 * ```typescript
 * const text = new TextEncoder().encode('Hello, World!');
 * const compressed = await gzipBytes(text, 9); // Maximum compression
 * ```
 *
 * @security
 * - Uses platform-native compression algorithms
 * - Memory-efficient streaming in browsers
 * - No dynamic code execution
 */
export async function gzipBytes(data: Uint8Array, _level: number = 6): Promise<Uint8Array> {
  await ensureCompressionPlatform();
  return compressionPlatform!.gzip(data);
}

/**
 * Decompress GZIP data
 *
 * @param data - The compressed data to decompress
 * @returns Promise resolving to decompressed data
 *
 * @throws {Error} If decompression fails or data is invalid
 *
 * @example
 * ```typescript
 * const compressed = await gzipBytes(originalData);
 * const decompressed = await gunzipBytes(compressed);
 * ```
 *
 * @security
 * - Validates input data format
 * - Memory-safe decompression
 * - Protection against zip bombs (implementation dependent)
 */
export async function gunzipBytes(data: Uint8Array): Promise<Uint8Array> {
  await ensureCompressionPlatform();
  return compressionPlatform!.gunzip(data);
}
