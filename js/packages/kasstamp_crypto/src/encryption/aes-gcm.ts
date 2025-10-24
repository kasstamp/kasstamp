import { cryptoPlatform } from '../platform';

const { subtle, getRandomValues } = cryptoPlatform;

export type AesKey = CryptoKey;

export interface AesGcmCiphertext {
  cipherText: Uint8Array;
  nonce: Uint8Array; // 12 bytes
  tagLengthBits: number; // usually 128
}

/**
 * Generate a random 12-byte nonce for AES-GCM
 * Works in both Node.js and browser environments
 *
 * @internal Used internally by encryptAesGcm
 */
function randomNonce12(): Uint8Array {
  const n = new Uint8Array(12);
  return getRandomValues(n);
}

/**
 * Encrypt data using AES-256-GCM
 * Works in both Node.js and browser environments
 *
 * @internal Used internally by encryptBytes
 */
async function encryptAesGcm(
  key: AesKey,
  plain: Uint8Array,
  nonce = randomNonce12(),
  tagLengthBits: number = 128
): Promise<AesGcmCiphertext> {
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: nonce as BufferSource,
    tagLength: tagLengthBits,
  };
  const ct = await subtle.encrypt(params, key, plain as BufferSource);
  return { cipherText: new Uint8Array(ct), nonce, tagLengthBits };
}

/**
 * Decrypt data using AES-256-GCM
 * Works in both Node.js and browser environments
 *
 * @internal Used internally by decryptBytes
 */
async function decryptAesGcm(key: AesKey, cipher: AesGcmCiphertext): Promise<Uint8Array> {
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: cipher.nonce as BufferSource,
    tagLength: cipher.tagLengthBits,
  };
  const pt = await subtle.decrypt(params, key, cipher.cipherText as BufferSource);
  return new Uint8Array(pt);
}

/**
 * Encrypt bytes with a derived key (convenience function)
 *
 * Combines encryption with automatic nonce handling for simplified storage.
 * The output format is: [12-byte nonce][ciphertext]
 *
 * @param data - Data to encrypt
 * @param key - AES-256-GCM key (typically derived using deriveKeyFromPrivateKey)
 * @returns Encrypted data with nonce prepended
 *
 * @example
 * ```typescript
 * const key = await deriveKeyFromPrivateKey(privateKey, 'salt');
 * const encrypted = await encryptBytes(data, key);
 * ```
 */
export async function encryptBytes(data: Uint8Array, key: AesKey): Promise<Uint8Array> {
  const encrypted = await encryptAesGcm(key, data);
  // Combine nonce + ciphertext for storage
  const result = new Uint8Array(encrypted.nonce.length + encrypted.cipherText.length);
  result.set(encrypted.nonce, 0);
  result.set(encrypted.cipherText, encrypted.nonce.length);
  return result;
}

/**
 * Decrypt bytes with a derived key (convenience function)
 *
 * Expects data in the format: [12-byte nonce][ciphertext]
 *
 * @param encryptedData - Encrypted data with nonce prepended
 * @param key - AES-256-GCM key (typically derived using deriveKeyFromPrivateKey)
 * @returns Decrypted data
 *
 * @throws {Error} If encrypted data is too short or decryption fails
 *
 * @example
 * ```typescript
 * const key = await deriveKeyFromPrivateKey(privateKey, 'salt');
 * const decrypted = await decryptBytes(encryptedData, key);
 * ```
 */
export async function decryptBytes(encryptedData: Uint8Array, key: AesKey): Promise<Uint8Array> {
  if (encryptedData.length < 12) {
    throw new Error('Invalid encrypted data: too short');
  }

  const nonce = encryptedData.slice(0, 12);
  const cipherText = encryptedData.slice(12);

  const cipher: AesGcmCiphertext = {
    cipherText,
    nonce,
    tagLengthBits: 128,
  };

  return await decryptAesGcm(key, cipher);
}
