/**
 * Derive encryption key from password using PBKDF2
 *
 * Uses PBKDF2 with SHA-256 and 100,000 iterations to derive a secure
 * encryption key from the user's password.
 *
 * @param password - User password
 * @param salt - Random salt (16 bytes)
 * @returns CryptoKey suitable for AES-256-GCM encryption
 */
export async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, [
    'deriveKey',
  ]);

  // Derive key using PBKDF2
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt) as BufferSource, // Explicitly cast to BufferSource
      iterations: 100000, // 100k iterations for security
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 }, // AES-256-GCM
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * Encrypts the plaintext using AES-256-GCM with a random IV.
 * The IV is prepended to the encrypted data.
 *
 * @param plaintext - Text to encrypt
 * @param key - Encryption key (from deriveEncryptionKey)
 * @returns Base64-encoded string (IV + encrypted data)
 */
export async function encryptData(plaintext: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt with AES-256-GCM
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * Decrypts ciphertext that was encrypted with encryptData().
 * The IV is extracted from the beginning of the ciphertext.
 *
 * @param ciphertext - Base64-encoded ciphertext (IV + encrypted data)
 * @param key - Decryption key (from deriveEncryptionKey)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptData(ciphertext: string, key: CryptoKey): Promise<string> {
  // Decode from base64
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and encrypted data (rest)
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // Decrypt with AES-256-GCM
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);

  // Convert to string
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Generate random salt for key derivation
 *
 * Generates a cryptographically secure random salt for use with PBKDF2.
 *
 * @returns Random salt (16 bytes)
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}
