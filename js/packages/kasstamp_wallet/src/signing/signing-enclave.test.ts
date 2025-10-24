import { createSigningEnclave } from './signing-enclave';
import type { IEnclaveStorage } from './types';
import { setGlobalLogLevel, LogLevel } from '@kasstamp/utils';

// Simple in-memory storage mock for tests
class InMemoryStorage implements IEnclaveStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

describe('Secure Signing Enclave', () => {
  let enclave: ReturnType<typeof createSigningEnclave>;
  let mockStorage: InMemoryStorage;
  const TEST_MNEMONIC =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const TEST_PASSWORD = 'testPassword123';
  const WEAK_PASSWORD = 'weak';
  const TEST_WALLET_ID = 'test-wallet-id';

  beforeEach(() => {
    // Create fresh in-memory storage for each test
    mockStorage = new InMemoryStorage();

    // Create a fresh enclave for each test with storage and wallet ID
    enclave = createSigningEnclave(mockStorage, TEST_WALLET_ID);
  });

  afterEach(() => {
    // Clean up after each test
    if (enclave) {
      enclave.clear();
    }
  });

  describe('Mnemonic Storage', () => {
    test('should store mnemonic with valid password', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      expect(enclave.hasMnemonic()).toBe(true);
    });

    test('should reject empty mnemonic', async () => {
      await expect(
        enclave.storeMnemonic({
          mnemonic: '',
          password: TEST_PASSWORD,
        })
      ).rejects.toThrow('Mnemonic cannot be empty');
    });

    test('should reject weak password (< 8 characters)', async () => {
      await expect(
        enclave.storeMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: WEAK_PASSWORD,
        })
      ).rejects.toThrow('Password must be at least 8 characters');
    });

    test('should store mnemonic with BIP39 passphrase', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        bip39Passphrase: 'my-secret-passphrase',
      });

      expect(enclave.hasMnemonic()).toBe(true);
    });

    test('should persist mnemonic to localStorage', async () => {
      // Use a unique storage key for this test to avoid interference
      const testStorageKey = 'test-persistence-wallet';
      const testEnclave = createSigningEnclave(mockStorage, testStorageKey);

      await testEnclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      // Verify data is in storage
      expect(mockStorage.getItem(`${testStorageKey}.enclave`)).toBeTruthy();

      // Create new enclave with same storage key - should load from localStorage
      const newEnclave = createSigningEnclave(mockStorage, testStorageKey);
      expect(newEnclave.hasMnemonic()).toBe(true);

      // Clean up
      testEnclave.clear();
      newEnclave.clear();
    });
  });

  describe('Lock/Unlock Functionality', () => {
    beforeEach(async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
    });

    test('should start locked after storing mnemonic', () => {
      expect(enclave.isLocked()).toBe(true);
    });

    test('should unlock with correct password', async () => {
      await enclave.unlock({ password: TEST_PASSWORD });
      expect(enclave.isLocked()).toBe(false);
    });

    test('should reject incorrect password', async () => {
      await expect(enclave.unlock({ password: 'wrongPassword123' })).rejects.toThrow();
    });

    test('should lock manually', async () => {
      await enclave.unlock({ password: TEST_PASSWORD });
      expect(enclave.isLocked()).toBe(false);

      enclave.lock();
      expect(enclave.isLocked()).toBe(true);
    });

    test('should set auto-lock timeout', async () => {
      const autoLockMs = 5000; // 5 seconds
      await enclave.unlock({ password: TEST_PASSWORD, autoLockMs });

      const status = enclave.getStatus();
      expect(status.autoLockMs).toBe(autoLockMs);
      expect(status.timeUntilLock).toBeGreaterThan(0);
      expect(status.timeUntilLock).toBeLessThanOrEqual(autoLockMs);
    });

    test('should auto-lock after timeout', async () => {
      jest.useFakeTimers();

      const autoLockMs = 1000; // 1 second
      await enclave.unlock({ password: TEST_PASSWORD, autoLockMs });
      expect(enclave.isLocked()).toBe(false);

      // Fast-forward time past auto-lock timeout
      jest.advanceTimersByTime(autoLockMs + 100);

      expect(enclave.isLocked()).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Clear Functionality', () => {
    test('should clear all stored data', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      expect(enclave.hasMnemonic()).toBe(true);

      enclave.clear();

      expect(enclave.hasMnemonic()).toBe(false);
      expect(enclave.isLocked()).toBe(true);
    });

    test('should remove data from localStorage', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      enclave.clear();

      // Create new enclave with same storage key - should not find data
      const newEnclave = createSigningEnclave(mockStorage, TEST_WALLET_ID);
      expect(newEnclave.hasMnemonic()).toBe(false);
    });
  });

  describe('Status Reporting', () => {
    test('should report correct status when empty', () => {
      const status = enclave.getStatus();

      expect(status.isLocked).toBe(true);
      expect(status.hasMnemonic).toBe(false);
      expect(status.autoLockMs).toBe(null);
      expect(status.timeUntilLock).toBe(null);
    });

    test('should report correct status when locked', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      const status = enclave.getStatus();

      expect(status.isLocked).toBe(true);
      expect(status.hasMnemonic).toBe(true);
      expect(status.autoLockMs).toBe(null);
      expect(status.timeUntilLock).toBe(null);
    });

    test('should report correct status when unlocked', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD, autoLockMs: 30000 });

      const status = enclave.getStatus();

      expect(status.isLocked).toBe(false);
      expect(status.hasMnemonic).toBe(true);
      expect(status.autoLockMs).toBe(30000);
      expect(status.timeUntilLock).toBeGreaterThan(0);
    });
  });

  describe('Data Encryption/Decryption', () => {
    const TEST_DATA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const TEST_GROUP_ID = 'test-group-id-123';

    beforeEach(async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });
    });

    test('should encrypt data successfully', async () => {
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(TEST_DATA.length); // Encrypted data is larger (nonce + ciphertext + tag)
      expect(encrypted).not.toEqual(TEST_DATA); // Should be different from original
    });

    test('should decrypt data successfully', async () => {
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      const decrypted = await enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID);

      expect(decrypted).toEqual(TEST_DATA);
    });

    test('should produce different ciphertext each time (due to random nonce)', async () => {
      const encrypted1 = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      const encrypted2 = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      expect(encrypted1).not.toEqual(encrypted2); // Different nonces
    });

    test('should handle large data (1MB)', async () => {
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      const encrypted = await enclave.encryptWithWalletKey(largeData, TEST_GROUP_ID);

      const decrypted = await enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID);

      expect(decrypted).toEqual(largeData);
    });

    test('should use different keys for different group IDs', async () => {
      const groupId1 = 'group-1';
      const groupId2 = 'group-2';

      const encrypted1 = await enclave.encryptWithWalletKey(TEST_DATA, groupId1);

      // Trying to decrypt with wrong group ID should fail
      await expect(enclave.decryptWithWalletKey(encrypted1, groupId2)).rejects.toThrow();
    });

    test('should use different keys for different accounts', async () => {
      const encrypted0 = await enclave.encryptWithWalletKey(
        TEST_DATA,
        TEST_GROUP_ID,
        0 // account 0
      );

      const encrypted1 = await enclave.encryptWithWalletKey(
        TEST_DATA,
        TEST_GROUP_ID,
        1 // account 1
      );

      // Encrypted data should be different (different keys)
      expect(encrypted0).not.toEqual(encrypted1);

      // Should decrypt correctly with matching account index
      const decrypted0 = await enclave.decryptWithWalletKey(encrypted0, TEST_GROUP_ID, 0);
      expect(decrypted0).toEqual(TEST_DATA);

      // Trying to decrypt account 0's data with account 1's key should fail
      await expect(enclave.decryptWithWalletKey(encrypted0, TEST_GROUP_ID, 1)).rejects.toThrow();
    });

    test('should reject encryption when locked', async () => {
      enclave.lock();

      await expect(enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID)).rejects.toThrow(
        'Enclave is locked'
      );
    });

    test('should reject decryption when locked', async () => {
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      enclave.lock();

      await expect(enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID)).rejects.toThrow(
        'Enclave is locked'
      );
    });

    test('should handle empty data', async () => {
      const emptyData = new Uint8Array(0);

      const encrypted = await enclave.encryptWithWalletKey(emptyData, TEST_GROUP_ID);

      const decrypted = await enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID);

      expect(decrypted).toEqual(emptyData);
    });

    test('should handle UTF-8 text data', async () => {
      const text = 'Hello, World! 🌍 This is a test with émojis and spëcial çhars.';
      const textData = new TextEncoder().encode(text);

      const encrypted = await enclave.encryptWithWalletKey(textData, TEST_GROUP_ID);

      const decrypted = await enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID);

      const decryptedText = new TextDecoder().decode(decrypted);
      expect(decryptedText).toBe(text);
    });

    test('should reject corrupted encrypted data', async () => {
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Corrupt the data
      const corrupted = new Uint8Array(encrypted);
      corrupted[corrupted.length - 1] ^= 0xff; // Flip bits in last byte

      await expect(enclave.decryptWithWalletKey(corrupted, TEST_GROUP_ID)).rejects.toThrow();
    });

    test('should reject truncated encrypted data', async () => {
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Truncate the data
      const truncated = encrypted.slice(0, encrypted.length - 5);

      await expect(enclave.decryptWithWalletKey(truncated, TEST_GROUP_ID)).rejects.toThrow();
    });
  });

  describe('BIP39 Passphrase Handling', () => {
    const TEST_DATA = new Uint8Array([1, 2, 3, 4, 5]);
    const TEST_GROUP_ID = 'test-group';
    const BIP39_PASSPHRASE = 'my-secret-passphrase';

    test('should produce different encryption keys with different BIP39 passphrases', async () => {
      // Enclave 1: No BIP39 passphrase
      const enclave1 = createSigningEnclave(mockStorage, 'test-wallet-1');
      await enclave1.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave1.unlock({ password: TEST_PASSWORD });

      const encrypted1 = await enclave1.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Enclave 2: With BIP39 passphrase
      const enclave2 = createSigningEnclave(mockStorage, 'test-wallet-2');
      await enclave2.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        bip39Passphrase: BIP39_PASSPHRASE,
      });
      await enclave2.unlock({ password: TEST_PASSWORD });

      const encrypted2 = await enclave2.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Encrypted data should be different (different keys due to BIP39 passphrase)
      expect(encrypted1).not.toEqual(encrypted2);

      // Should NOT be able to decrypt with wrong passphrase
      await expect(enclave1.decryptWithWalletKey(encrypted2, TEST_GROUP_ID)).rejects.toThrow();

      await expect(enclave2.decryptWithWalletKey(encrypted1, TEST_GROUP_ID)).rejects.toThrow();

      enclave1.clear();
      enclave2.clear();
    });
  });

  describe('Security Guarantees', () => {
    test('should not expose mnemonic through public API', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      // Check that enclave object doesn't have methods to extract mnemonic
      expect((enclave as unknown as { getMnemonic?: () => string }).getMnemonic).toBeUndefined();
      expect(
        (enclave as unknown as { getPrivateKey?: () => unknown }).getPrivateKey
      ).toBeUndefined();
      expect(
        (enclave as unknown as { exportMnemonic?: () => string }).exportMnemonic
      ).toBeUndefined();
    });

    test('should not expose private key through public API', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      // Perform encryption (which derives private key internally)
      const testData = new Uint8Array([1, 2, 3]);
      await enclave.encryptWithWalletKey(testData, 'test-group');

      // Check that enclave object doesn't expose private key
      expect((enclave as unknown as { privateKey?: unknown }).privateKey).toBeUndefined();
      expect(
        (enclave as unknown as { getPrivateKey?: () => unknown }).getPrivateKey
      ).toBeUndefined();
    });

    test('should clear sensitive data after encryption', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      const testData = new Uint8Array([1, 2, 3]);
      await enclave.encryptWithWalletKey(testData, 'test-group');

      // After encryption completes, sensitive data should be cleared
      // (We can't directly check closure variables, but we can verify the API still works)
      // If data wasn't cleared properly, it would be a memory leak

      // The enclave should still be functional for next operation
      const encrypted2 = await enclave.encryptWithWalletKey(testData, 'test-group-2');
      expect(encrypted2).toBeInstanceOf(Uint8Array);
    });

    test('should handle errors without leaking sensitive data', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      // Try to decrypt invalid data (will throw error)
      const invalidData = new Uint8Array([1, 2, 3]);

      await expect(enclave.decryptWithWalletKey(invalidData, 'test-group')).rejects.toThrow();

      // After error, enclave should still be functional
      const testData = new Uint8Array([4, 5, 6]);
      const encrypted = await enclave.encryptWithWalletKey(testData, 'test-group');
      expect(encrypted).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Encryption Key Caching', () => {
    const TEST_DATA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const TEST_GROUP_ID = 'test-group-cache';

    beforeEach(async () => {
      // Enable DEBUG logs for cache testing
      setGlobalLogLevel(LogLevel.DEBUG);

      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });
    });

    test('should cache encryption keys for the same groupId', async () => {
      // Spy on console.debug to check for cache hit/miss messages
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // First encryption - should be cache miss
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Check for cache miss log
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key for groupId')
      );

      consoleDebugSpy.mockClear();

      // Second encryption with same groupId - should be cache hit (no log)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      // Should NOT see cache miss log again
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key for groupId')
      );

      consoleDebugSpy.mockRestore();
    });

    test('should use cached key for decryption with same groupId', async () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // Encrypt data (cache miss)
      const encrypted = await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key for groupId')
      );

      consoleDebugSpy.mockClear();

      // Decrypt data with same groupId (cache hit - should not derive key again)
      const decrypted = await enclave.decryptWithWalletKey(encrypted, TEST_GROUP_ID);

      // Should NOT see cache miss log
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      expect(decrypted).toEqual(TEST_DATA);

      consoleDebugSpy.mockRestore();
    });

    test('should cache different keys for different groupIds', async () => {
      const groupId1 = 'group-1';
      const groupId2 = 'group-2';

      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // Encrypt with groupId1 (cache miss)
      await enclave.encryptWithWalletKey(TEST_DATA, groupId1);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Derived and cached AES key for groupId: ${groupId1}`)
      );

      consoleDebugSpy.mockClear();

      // Encrypt with groupId2 (cache miss - different key)
      await enclave.encryptWithWalletKey(TEST_DATA, groupId2);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Derived and cached AES key for groupId: ${groupId2}`)
      );

      consoleDebugSpy.mockClear();

      // Encrypt with groupId1 again (cache hit - should use cached key)
      await enclave.encryptWithWalletKey(TEST_DATA, groupId1);
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockRestore();
    });

    test('should cache different keys for different account indices', async () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // Encrypt with account 0 (cache miss)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID, 0);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // Encrypt with account 1 (cache miss - different account)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID, 1);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // Encrypt with account 0 again (cache hit)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID, 0);
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockRestore();
    });

    test('should clear cache when enclave is locked', async () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // First encryption - cache miss
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // Second encryption - cache hit (no log)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // ✅ Lock the enclave - should clear cache
      enclave.lock();

      // Unlock again
      await enclave.unlock({ password: TEST_PASSWORD });

      consoleDebugSpy.mockClear();

      // Third encryption after lock/unlock - should be cache miss again
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockRestore();
    });

    test('should maintain separate caches for different enclave instances', async () => {
      // Create a second enclave
      const mockStorage2 = new InMemoryStorage();
      const enclave2 = createSigningEnclave(mockStorage2, 'test-wallet-2');
      await enclave2.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave2.unlock({ password: TEST_PASSWORD });

      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // Encrypt with first enclave (cache miss)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // Encrypt with second enclave using same groupId (should also be cache miss)
      await enclave2.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockClear();

      // Encrypt with first enclave again (cache hit)
      await enclave.encryptWithWalletKey(TEST_DATA, TEST_GROUP_ID);
      expect(consoleDebugSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Derived and cached AES key')
      );

      consoleDebugSpy.mockRestore();
      enclave2.clear();
    });

    test('should improve performance with cached keys', async () => {
      const largeData = new Uint8Array(100 * 1024); // 100KB
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      // First encryption (cache miss) - measure time
      const start1 = performance.now();
      await enclave.encryptWithWalletKey(largeData, TEST_GROUP_ID);
      const duration1 = performance.now() - start1;

      // Second encryption (cache hit) - should be faster
      const start2 = performance.now();
      await enclave.encryptWithWalletKey(largeData, TEST_GROUP_ID);
      const duration2 = performance.now() - start2;

      // Cache hit should be noticeably faster
      // This is a performance test, so we use a loose threshold
      // Both should be non-negative, and second should not be slower
      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeLessThanOrEqual(duration1);
    });

    test('should handle many sequential encryptions with same groupId efficiently', async () => {
      const chunkCount = 10;
      const chunks: Uint8Array[] = [];

      for (let i = 0; i < chunkCount; i++) {
        const chunk = new Uint8Array(20 * 1024); // 20KB each
        for (let j = 0; j < chunk.length; j++) {
          chunk[j] = (i + j) % 256;
        }
        chunks.push(chunk);
      }

      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      // Encrypt all chunks sequentially with same groupId
      const encrypted: Uint8Array[] = [];
      for (const chunk of chunks) {
        const enc = await enclave.encryptWithWalletKey(chunk, TEST_GROUP_ID);
        encrypted.push(enc);
      }

      // Should only see ONE cache miss log (first chunk), rest are cache hits
      const cacheMissLogs = consoleDebugSpy.mock.calls.filter((call) =>
        call[0]?.toString().includes('Derived and cached AES key')
      );
      expect(cacheMissLogs).toHaveLength(1);

      // All encryptions should succeed
      expect(encrypted).toHaveLength(chunkCount);
      for (const enc of encrypted) {
        expect(enc).toBeInstanceOf(Uint8Array);
        expect(enc.length).toBeGreaterThan(0);
      }

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid lock/unlock cycles', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });

      for (let i = 0; i < 10; i++) {
        await enclave.unlock({ password: TEST_PASSWORD });
        expect(enclave.isLocked()).toBe(false);

        enclave.lock();
        expect(enclave.isLocked()).toBe(true);
      }
    });

    test('should handle multiple encryption/decryption operations in sequence', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      for (let i = 0; i < 10; i++) {
        const encrypted = await enclave.encryptWithWalletKey(testData, `group-${i}`);

        const decrypted = await enclave.decryptWithWalletKey(encrypted, `group-${i}`);

        expect(decrypted).toEqual(testData);
      }
    });

    test('should handle concurrent encryption operations', async () => {
      await enclave.storeMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
      });
      await enclave.unlock({ password: TEST_PASSWORD });

      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      // Run multiple encryptions concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(enclave.encryptWithWalletKey(testData, `group-${i}`));
      }

      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(5);
      for (const encrypted of results) {
        expect(encrypted).toBeInstanceOf(Uint8Array);
        expect(encrypted.length).toBeGreaterThan(0);
      }
    });
  });
});
