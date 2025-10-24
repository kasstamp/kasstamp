import { cryptoPlatform } from '../platform';
import type { AesKey } from './aes-gcm';

const { subtle } = cryptoPlatform;

/**
 * Derive encryption key from wallet private key using HKDF
 *
 * This function uses HKDF (HMAC-based Key Derivation Function) to derive
 * a secure AES-256-GCM encryption key from a wallet's private key and a salt.
 * This is used for private mode file stamping.
 *
 * @param privateKey - The wallet's private key (32 bytes)
 * @param salt - A unique salt string for key derivation
 * @returns Promise resolving to an AES-256-GCM encryption key
 *
 * @throws {Error} If WebCrypto API is not available or key derivation fails
 *
 * @example
 * ```typescript
 * const privateKey = wallet.getPrivateKey();
 * const encryptionKey = await deriveKeyFromPrivateKey(privateKey, 'file-123');
 * const encrypted = await encryptBytes(fileData, encryptionKey);
 * ```
 *
 * @security
 * - Uses HKDF-SHA256 for secure key derivation
 * - Derived key is non-extractable for enhanced security
 * - Each file should use a unique salt
 */
export async function deriveKeyFromPrivateKey(
  privateKey: Uint8Array,
  salt: string
): Promise<AesKey> {
  // Convert salt to Uint8Array
  const saltBytes = new TextEncoder().encode(salt);

  // Import the private key as a raw key for HKDF
  const keyMaterial = await subtle.importKey(
    'raw',
    privateKey as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // Derive key using HKDF
  return await subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: new TextEncoder().encode('kasstamp-file-encryption'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
