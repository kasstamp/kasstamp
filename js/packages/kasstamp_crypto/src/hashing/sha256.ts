import { cryptoPlatform } from '../platform';

const { subtle } = cryptoPlatform;

/**
 * Compute SHA-256 hash of data (returns raw bytes)
 *
 * @param data - The data to hash
 * @returns Promise resolving to the hash as a Uint8Array (32 bytes)
 *
 * @throws {Error} If WebCrypto API is not available
 *
 * @example
 * ```typescript
 * const message = new TextEncoder().encode('Hello, World!');
 * const hashBytes = await sha256Bytes(message);
 * ```
 *
 * @security
 * - Uses cryptographically secure SHA-256 implementation
 * - FIPS 140-2 compliant where available
 * - Memory-safe operation
 */
export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const buf = await subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(buf);
}

/**
 * Compute SHA-256 hash of data (returns hex string)
 *
 * @param data - The data to hash
 * @returns Promise resolving to the hash as a lowercase hex string (64 characters)
 *
 * @throws {Error} If WebCrypto API is not available
 *
 * @example
 * ```typescript
 * const message = new TextEncoder().encode('Hello, World!');
 * const hashHex = await sha256Hex(message);
 * ```
 *
 * @security
 * - Uses cryptographically secure SHA-256 implementation
 * - Lowercase hex encoding for consistency
 * - Memory-safe operation
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBytes = await sha256Bytes(data);
  return [...hashBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
