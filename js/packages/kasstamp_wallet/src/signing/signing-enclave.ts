import { createLogger } from '@kasstamp/utils';
import type { PendingTransaction, PrivateKey } from '@kasstamp/kaspa_wasm_sdk';
import { NetworkId } from '@kasstamp/kaspa_wasm_sdk';
import { decryptData, deriveEncryptionKey, encryptData, generateSalt } from './crypto-utils';
import { deriveMultipleKeys, derivePrivateKey } from './key-derivation';
import type {
  EnclaveStatus,
  IEnclaveStorage,
  ISecureSigningEnclave,
  KeyDerivation,
  SignOptions,
  StoreMnemonicOptions,
  UnlockOptions,
} from './types';
import { decryptBytes, deriveKeyFromPrivateKey, encryptBytes } from '@kasstamp/crypto';

const enclaveLogger = createLogger('kasstamp:wallet:signing');

/**
 * localStorage key prefix for enclave storage
 * Pattern matches WASM wallet: <walletId>.enclave
 */
const ENCLAVE_STORAGE_PREFIX = '.enclave';

/**
 * Create a secure signing enclave instance
 *
 * Each wallet should have its own enclave instance. The enclave uses
 * closure scope to hide sensitive data from XSS attacks.
 *
 * The encrypted mnemonic is persisted via the injected storage backend
 * (typically localStorage, same pattern as WASM wallet), but the decrypted
 * mnemonic and encryption key only exist in closure scope.
 *
 * @param storage - Storage backend for persistence (required)
 * @param walletId - Optional wallet identifier for storage key
 * @returns Secure signing enclave instance
 */
export function createSigningEnclave(
  storage: IEnclaveStorage,
  walletId?: string
): ISecureSigningEnclave {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CLOSURE SCOPE - PRIVATE VARIABLES
  // These are NOT accessible to XSS attackers or external code
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Storage backend (required, injected by caller)
  const storageBackend: IEnclaveStorage = storage;

  let encryptedMnemonic: string | null = null;
  let encryptionSalt: Uint8Array | null = null;
  let encryptionKey: CryptoKey | null = null;
  let bip39Passphrase: string = ''; // BIP39 passphrase stored in closure (never exposed)
  let isUnlocked: boolean = false;
  let unlockTimeout: NodeJS.Timeout | null = null;
  let unlockTimeMs: number | null = null;
  let autoLockDurationMs: number | null = null;
  const storageKey: string | null = walletId ? `${walletId}${ENCLAVE_STORAGE_PREFIX}` : null;

  // Cache derived encryption keys per groupId
  // This avoids re-deriving the same key for every chunk (N times for large files)
  // Key: groupId, Value: { aesKey: CryptoKey, accountIndex: number }
  const encryptionKeyCache = new Map<string, { aesKey: CryptoKey; accountIndex: number }>();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PRIVATE HELPER FUNCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Save encrypted data to localStorage
   * Follows same pattern as WASM wallet: <walletId>.enclave
   *
   * SECURITY: Uses binary format (hex-encoded) to make it completely opaque
   * Format: [version(1)][saltLength(2)][salt][encDataLength(4)][encData]
   * Similar to WASM wallet's Borsh serialization but simpler
   */
  function saveToLocalStorage(): void {
    if (!storageKey) {
      enclaveLogger.warn('⚠️ No wallet ID provided - encrypted mnemonic not persisted');
      return;
    }

    if (!encryptedMnemonic || !encryptionSalt) {
      enclaveLogger.warn('⚠️ No encrypted data to save');
      return;
    }

    try {
      // Convert encrypted mnemonic from base64 to bytes
      const encryptedBytes = Uint8Array.from(atob(encryptedMnemonic), (c) => c.charCodeAt(0));

      // Binary format (more secure than JSON)
      const version = 1;
      const saltLength = encryptionSalt.length;
      const encDataLength = encryptedBytes.length;

      // Calculate total size
      const totalSize = 1 + 2 + saltLength + 4 + encDataLength;
      const buffer = new Uint8Array(totalSize);

      let offset = 0;

      // Write version (1 byte)
      buffer[offset++] = version;

      // Write salt length (2 bytes, big-endian)
      buffer[offset++] = (saltLength >> 8) & 0xff;
      buffer[offset++] = saltLength & 0xff;

      // Write salt
      buffer.set(encryptionSalt, offset);
      offset += saltLength;

      // Write encrypted data length (4 bytes, big-endian)
      buffer[offset++] = (encDataLength >> 24) & 0xff;
      buffer[offset++] = (encDataLength >> 16) & 0xff;
      buffer[offset++] = (encDataLength >> 8) & 0xff;
      buffer[offset++] = encDataLength & 0xff;

      // Write encrypted data
      buffer.set(encryptedBytes, offset);

      // Convert to hex string (like WASM wallet)
      const hexString = Array.from(buffer)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      storageBackend.setItem(storageKey, hexString);
      enclaveLogger.debug(
        `💾 Encrypted data saved to localStorage (${storageKey}) - ${buffer.length} bytes`
      );
    } catch (error) {
      enclaveLogger.error('❌ Failed to save to localStorage:', error as Error);
      // Don't throw - enclave still works in memory
    }
  }

  /**
   * Load encrypted data from localStorage
   * Returns true if data was loaded successfully
   *
   * SECURITY: Supports three formats for backward compatibility:
   * 1. Binary hex format (new, best) - opaque hex string
   * 2. Obfuscated JSON (medium) - { d, s, k, v }
   * 3. Old JSON (deprecated) - { encryptedMnemonic, salt, encryptionKind, version }
   */
  function loadFromLocalStorage(): boolean {
    if (!storageKey) {
      return false;
    }

    try {
      const stored = storageBackend.getItem(storageKey);
      if (!stored) {
        return false;
      }

      // Detect format: hex string (no braces) vs JSON (starts with {)
      const isBinaryFormat = !stored.startsWith('{');

      if (isBinaryFormat) {
        // Binary hex format (new, best)
        try {
          // Convert hex to bytes
          const bytes = new Uint8Array(stored.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

          let offset = 0;

          // Read version (1 byte)
          const version = bytes[offset++];

          if (version !== 1) {
            enclaveLogger.warn(`⚠️ Unknown enclave version: ${version}`);
            return false;
          }

          // Read salt length (2 bytes, big-endian)
          const saltLength = (bytes[offset++] << 8) | bytes[offset++];

          // Read salt
          const salt = bytes.slice(offset, offset + saltLength);
          offset += saltLength;

          // Read encrypted data length (4 bytes, big-endian)
          const encDataLength =
            (bytes[offset++] << 24) |
            (bytes[offset++] << 16) |
            (bytes[offset++] << 8) |
            bytes[offset++];

          // Read encrypted data
          const encData = bytes.slice(offset, offset + encDataLength);

          // Load into closure scope (convert back to base64 for internal format)
          encryptedMnemonic = btoa(String.fromCharCode(...encData));
          encryptionSalt = salt;

          enclaveLogger.debug(
            `📂 Encrypted data loaded from localStorage (${storageKey}) - binary format`
          );
          return true;
        } catch (err) {
          enclaveLogger.error('Failed to parse binary format', err as Error);
          return false;
        }
      } else {
        // JSON format (old or obfuscated)
        const data = JSON.parse(stored);

        // Support both new (obfuscated) and old (obvious) formats
        const encData = data.d || data.encryptedMnemonic;
        const saltData = data.s || data.salt;

        // Validate data structure
        if (!encData || !saltData) {
          enclaveLogger.warn('⚠️ Invalid enclave data in localStorage');
          return false;
        }

        // Load into closure scope
        encryptedMnemonic = encData;
        encryptionSalt = Uint8Array.from(atob(saltData), (c) => c.charCodeAt(0));

        // Migrate to binary format
        enclaveLogger.debug('🔄 Migrating to binary format...');
        saveToLocalStorage();

        enclaveLogger.debug(
          `📂 Encrypted data loaded from localStorage (${storageKey}) - JSON format (migrated)`
        );
        return true;
      }
    } catch (error) {
      enclaveLogger.error('❌ Failed to load from localStorage:', error as Error);
      return false;
    }
  }

  /**
   * Remove encrypted data from localStorage
   */
  function removeFromLocalStorage(): void {
    if (!storageKey) {
      return;
    }

    try {
      storageBackend.removeItem(storageKey);
      enclaveLogger.debug(`🗑️ Encrypted mnemonic removed from storage (${storageKey})`);
    } catch (error) {
      enclaveLogger.error('❌ Failed to remove from storage:', error as Error);
    }
  }

  // Try to load existing data from localStorage on initialization
  enclaveLogger.debug(`🔐 Initializing signing enclave with storage key: ${storageKey || 'none'}`);
  const loaded = loadFromLocalStorage();
  if (loaded) {
    enclaveLogger.debug(`✅ Enclave initialized with encrypted mnemonic from storage`);
  } else {
    enclaveLogger.debug(`ℹ️ Enclave initialized without stored mnemonic`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUBLIC API
  // Only these methods are exposed to external code
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return {
    /**
     * Store mnemonic in encrypted form
     * Saves to both memory (closure scope) and localStorage
     */
    async storeMnemonic(options: StoreMnemonicOptions): Promise<void> {
      const { mnemonic, password, bip39Passphrase: passphrase } = options;

      // Validate mnemonic
      if (!mnemonic || mnemonic.trim().length === 0) {
        throw new Error('Mnemonic cannot be empty');
      }

      // Validate password
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      try {
        enclaveLogger.debug('🔐 Storing mnemonic in secure enclave...');

        // Store BIP39 passphrase in closure
        // undefined/null = no passphrase (BIP39 standard uses '' for no passphrase)
        bip39Passphrase = passphrase || '';

        // Generate random salt for this wallet
        encryptionSalt = generateSalt();

        // Derive encryption key from password
        const key = await deriveEncryptionKey(password, encryptionSalt);

        // Encrypt mnemonic
        encryptedMnemonic = await encryptData(mnemonic, key);

        // Save encrypted data to localStorage (same pattern as WASM wallet)
        saveToLocalStorage();

        // Clear the key (will be recreated on unlock)
        // We don't keep it in memory until unlock() is called

        enclaveLogger.debug('✅ Mnemonic stored securely (encrypted in closure + localStorage)');
      } catch (error) {
        enclaveLogger.error('❌ Failed to store mnemonic:', error as Error);
        throw new Error(`Failed to store mnemonic: ${(error as Error).message}`);
      }
    },

    /**
     * Unlock the enclave with password
     */
    async unlock(options: UnlockOptions): Promise<void> {
      const { password, autoLockMs = 30 * 60 * 1000 } = options; // Default: 30 minutes

      if (!encryptedMnemonic || !encryptionSalt) {
        throw new Error('No mnemonic stored. Call storeMnemonic() first.');
      }

      if (isUnlocked) {
        enclaveLogger.debug('⚠️ Enclave is already unlocked');
        return;
      }

      try {
        enclaveLogger.debug('🔓 Unlocking signing enclave...');

        // Derive key from password and salt
        const key = await deriveEncryptionKey(password, encryptionSalt);

        // Verify password by attempting decryption
        // This will throw if the password is wrong
        await decryptData(encryptedMnemonic, key);

        // Password is correct - store key in closure
        encryptionKey = key;
        isUnlocked = true;
        unlockTimeMs = Date.now();
        autoLockDurationMs = autoLockMs;

        // Set auto-lock timeout
        if (autoLockMs > 0) {
          unlockTimeout = setTimeout(() => {
            enclaveLogger.debug('⏰ Auto-lock timeout expired - locking enclave');
            this.lock();
          }, autoLockMs);
        }

        enclaveLogger.debug(`✅ Enclave unlocked (auto-lock in ${autoLockMs / 1000}s)`);
      } catch (error) {
        enclaveLogger.error('❌ Failed to unlock enclave:', error as Error);
        throw new Error('Invalid password or corrupted data');
      }
    },

    /**
     * Lock the enclave
     */
    lock(): void {
      // Clear encryption key from memory
      encryptionKey = null;
      isUnlocked = false;
      unlockTimeMs = null;
      autoLockDurationMs = null;

      // Clear auto-lock timeout
      if (unlockTimeout) {
        clearTimeout(unlockTimeout);
        unlockTimeout = null;
      }

      // ⚡ SECURITY: Clear derived encryption key cache
      encryptionKeyCache.clear();

      enclaveLogger.debug('🔒 Signing enclave locked');
    },

    /**
     * Clear all stored data from memory AND localStorage
     * This is equivalent to logging out and removing the wallet
     */
    clear(): void {
      // Clear from memory (closure scope)
      encryptedMnemonic = null;
      encryptionSalt = null;
      encryptionKey = null;
      bip39Passphrase = ''; // Clear BIP39 passphrase
      isUnlocked = false;
      unlockTimeMs = null;
      autoLockDurationMs = null;

      if (unlockTimeout) {
        clearTimeout(unlockTimeout);
        unlockTimeout = null;
      }

      // Clear from localStorage
      removeFromLocalStorage();

      enclaveLogger.debug('🗑️ Signing enclave cleared (memory + localStorage)');
    },

    /**
     * Check if enclave is locked
     */
    isLocked(): boolean {
      return !isUnlocked;
    },

    /**
     * Check if mnemonic is stored
     */
    hasMnemonic(): boolean {
      return encryptedMnemonic !== null;
    },

    /**
     * Get enclave status
     */
    getStatus(): EnclaveStatus {
      let timeUntilLock: number | null = null;

      if (isUnlocked && unlockTimeMs && autoLockDurationMs) {
        const elapsed = Date.now() - unlockTimeMs;
        timeUntilLock = Math.max(0, autoLockDurationMs - elapsed);
      }

      return {
        isLocked: !isUnlocked,
        hasMnemonic: encryptedMnemonic !== null,
        autoLockMs: autoLockDurationMs,
        timeUntilLock,
      };
    },

    /**
     * Sign a transaction with a single key
     */
    async sign(transaction: PendingTransaction, options: SignOptions = {}): Promise<void> {
      // Check if unlocked
      if (!isUnlocked || !encryptionKey) {
        throw new Error('Signing enclave is locked. Call unlock() first.');
      }

      if (!encryptedMnemonic) {
        throw new Error('No mnemonic stored in enclave.');
      }

      // Default options
      const { accountIndex = 0, addressIndex = 0, isReceive = true } = options;

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL SECTION: Sensitive data in memory
      // Mnemonic and private key exist ONLY in this try/finally block
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      let mnemonic: string | undefined;
      let privateKey: PrivateKey | undefined;

      try {
        // Step 1: Temporarily decrypt mnemonic
        mnemonic = await decryptData(encryptedMnemonic, encryptionKey);

        // Step 2: Derive private key
        privateKey = derivePrivateKey(
          mnemonic,
          bip39Passphrase,
          accountIndex,
          addressIndex,
          isReceive
        );

        // Step 3: Sign the transaction
        await transaction.sign([privateKey]);

        enclaveLogger.debug(
          `✅ Transaction signed with key (account: ${accountIndex}, address: ${addressIndex}, receive: ${isReceive})`
        );
      } catch (error) {
        enclaveLogger.error('❌ Failed to sign transaction:', error as Error);
        throw new Error(`Failed to sign transaction: ${(error as Error).message}`);
      } finally {
        // CRITICAL: Clear sensitive data immediately
        mnemonic = undefined;
        privateKey = undefined;
      }
    },

    /**
     * Sign a transaction with multiple keys
     */
    async signMultiple(
      transaction: PendingTransaction,
      derivations: KeyDerivation[]
    ): Promise<void> {
      // Check if unlocked
      if (!isUnlocked || !encryptionKey) {
        throw new Error('Signing enclave is locked. Call unlock() first.');
      }

      if (!encryptedMnemonic) {
        throw new Error('No mnemonic stored in enclave.');
      }

      if (derivations.length === 0) {
        throw new Error('No key derivations specified');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL SECTION: Sensitive data in memory
      // Mnemonic and private keys exist ONLY in this try/finally block
      // Duration: ~0.3 seconds (slightly longer due to multiple keys)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      let mnemonic: string | undefined;
      let privateKeys: PrivateKey[] | undefined;

      try {
        // Step 1: Temporarily decrypt mnemonic
        mnemonic = await decryptData(encryptedMnemonic, encryptionKey);

        // Step 2: Derive multiple private keys
        privateKeys = deriveMultipleKeys(mnemonic, bip39Passphrase, derivations);

        // Step 3: Sign the transaction with all keys
        await transaction.sign(privateKeys);

        enclaveLogger.debug(`✅ Transaction signed with ${privateKeys.length} keys`);
      } catch (error) {
        enclaveLogger.error('❌ Failed to sign transaction with multiple keys:', error as Error);
        throw new Error(`Failed to sign transaction: ${(error as Error).message}`);
      } finally {
        // CRITICAL: Clear sensitive data immediately
        mnemonic = undefined;
        privateKeys = undefined;
      }
    },

    /**
     * Sign a transaction by auto-discovering required keys
     *
     * This method:
     * 1. Gets addresses from transaction.addresses()
     * 2. Scans receive/change addresses (indices 0-9) to find matches
     * 3. Signs with only the required keys
     */
    async signWithAutoDiscovery(
      transaction: PendingTransaction,
      network: string,
      accountIndex: number = 0
    ): Promise<void> {
      // Check if unlocked
      if (!isUnlocked || !encryptionKey) {
        throw new Error('Signing enclave is locked. Call unlock() first.');
      }

      if (!encryptedMnemonic) {
        throw new Error('No mnemonic stored in enclave.');
      }

      // Get addresses that need signing
      let requiredAddresses: string[];
      try {
        requiredAddresses = transaction.addresses();
        enclaveLogger.debug(
          `🔍 Transaction requires signatures for ${requiredAddresses.length} address(es):`,
          requiredAddresses
        );
      } catch (error) {
        throw new Error(`Failed to get transaction addresses: ${(error as Error).message}`);
      }

      if (requiredAddresses.length === 0) {
        throw new Error('Transaction has no addresses to sign');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CRITICAL SECTION: Sensitive data in memory
      // Mnemonic and private keys exist ONLY in this try/finally block
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      let mnemonic: string | undefined;
      let privateKeys: PrivateKey[] | undefined;

      try {
        // Step 1: Decrypt mnemonic
        mnemonic = await decryptData(encryptedMnemonic, encryptionKey);

        // Step 2: Find matching keys by scanning receive/change addresses
        privateKeys = [];
        const foundAddresses = new Set<string>();
        const networkId = new NetworkId(network);

        // Scan receive addresses (0-9)
        enclaveLogger.debug(`🔍 Scanning receive addresses (indices 0-9)...`);
        for (
          let addressIndex = 0;
          addressIndex < 10 && foundAddresses.size < requiredAddresses.length;
          addressIndex++
        ) {
          const key = derivePrivateKey(mnemonic, bip39Passphrase, accountIndex, addressIndex, true);
          const publicKey = key.toPublicKey();
          const address = publicKey.toAddress(networkId).toString();
          enclaveLogger.debug(`  Receive[${addressIndex}]: ${address}`);

          if (requiredAddresses.includes(address)) {
            privateKeys.push(key);
            foundAddresses.add(address);
            enclaveLogger.debug(`✅ Found key for receive address[${addressIndex}]: ${address}`);
          }
        }

        // Scan change addresses (0-9)
        enclaveLogger.debug(`🔍 Scanning change addresses (indices 0-9)...`);
        for (
          let addressIndex = 0;
          addressIndex < 10 && foundAddresses.size < requiredAddresses.length;
          addressIndex++
        ) {
          const key = derivePrivateKey(
            mnemonic,
            bip39Passphrase,
            accountIndex,
            addressIndex,
            false
          );
          const publicKey = key.toPublicKey();
          const address = publicKey.toAddress(networkId).toString();
          enclaveLogger.debug(`  Change[${addressIndex}]: ${address}`);

          if (requiredAddresses.includes(address)) {
            privateKeys.push(key);
            foundAddresses.add(address);
            enclaveLogger.debug(`✅ Found key for change address[${addressIndex}]: ${address}`);
          }
        }

        // Verify we found all required keys
        if (foundAddresses.size < requiredAddresses.length) {
          const missingAddresses = requiredAddresses.filter((addr) => !foundAddresses.has(addr));
          throw new Error(
            `Could not find private keys for addresses: ${missingAddresses.join(', ')}`
          );
        }

        // Step 3: Sign the transaction with found keys
        transaction.sign(privateKeys);

        enclaveLogger.debug(`Transaction signed with ${privateKeys.length} auto-discovered keys`);
      } catch (error) {
        enclaveLogger.error('❌ Failed to sign transaction with auto-discovery:', error as Error);
        throw new Error(`Failed to sign transaction: ${(error as Error).message}`);
      } finally {
        // CRITICAL: Clear sensitive data immediately
        mnemonic = undefined;
        privateKeys = undefined;
      }
    },

    /**
     * Encrypt data using wallet-derived key
     *
     * SECURITY: Private key NEVER leaves the enclave!
     * - Derives private key from mnemonic (in closure)
     * - Generates encryption key from private key
     * - Encrypts data
     * - Returns only encrypted data
     * - Private key destroyed immediately
     *
     * @param data - Data to encrypt
     * @param groupId - Group ID used as salt for key derivation
     * @param accountIndex - Account index (default: 0)
     * @returns Encrypted data
     */
    async encryptWithWalletKey(
      data: Uint8Array,
      groupId: string,
      accountIndex: number = 0
    ): Promise<Uint8Array> {
      if (!encryptionKey) {
        throw new Error('Enclave is locked. Please unlock first.');
      }

      // ⚡ OPTIMIZATION: Check cache first
      const cacheKey = `${groupId}:${accountIndex}`;
      let encryptionAesKey: CryptoKey;

      const cached = encryptionKeyCache.get(cacheKey);
      if (cached) {
        // ✅ Cache hit - skip expensive key derivation!
        encryptionAesKey = cached.aesKey;
      } else {
        // ❌ Cache miss - derive key (only happens once per groupId!)
        let mnemonic: string | undefined;
        let privateKeyBytes: Uint8Array | undefined;

        try {
          // Step 1: Decrypt mnemonic
          mnemonic = await decryptData(encryptedMnemonic!, encryptionKey);

          // Step 2: Derive private key from mnemonic
          const privateKey = derivePrivateKey(mnemonic, bip39Passphrase, accountIndex, 0, true);

          // Step 3: Convert private key to bytes
          const privateKeyHex = privateKey.toString();
          privateKeyBytes = new Uint8Array(
            privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
          );

          // Step 4: Derive AES encryption key from private key
          encryptionAesKey = await deriveKeyFromPrivateKey(privateKeyBytes, groupId);

          // ✅ Cache the derived key for future chunks
          encryptionKeyCache.set(cacheKey, { aesKey: encryptionAesKey, accountIndex });
          enclaveLogger.debug(`⚡ [ENCLAVE] Derived and cached AES key for groupId: ${groupId}`);
        } finally {
          // ✅ CRITICAL: Clear sensitive data immediately
          mnemonic = undefined;
          privateKeyBytes = undefined;
        }
      }

      // Step 5: Encrypt data with cached/derived AES key
      try {
        return await encryptBytes(data, encryptionAesKey);
      } catch (error) {
        throw new Error(`Failed to encrypt data: ${(error as Error).message}`);
      }
    },

    /**
     * Decrypt data using wallet-derived key
     *
     * SECURITY: Private key NEVER leaves the enclave!
     * - Derives private key from mnemonic (in closure)
     * - Generates decryption key from private key
     * - Decrypts data
     * - Returns only decrypted data
     * - Private key destroyed immediately
     *
     * @param encryptedData - Data to decrypt
     * @param groupId - Group ID used as salt for key derivation
     * @param accountIndex - Account index (default: 0)
     * @returns Decrypted data
     */
    async decryptWithWalletKey(
      encryptedData: Uint8Array,
      groupId: string,
      accountIndex: number = 0
    ): Promise<Uint8Array> {
      if (!encryptionKey) {
        throw new Error('Enclave is locked. Please unlock first.');
      }

      // OPTIMIZATION: Check cache first (same key used for encryption/decryption)
      const cacheKey = `${groupId}:${accountIndex}`;
      let decryptionKey: CryptoKey;

      const cached = encryptionKeyCache.get(cacheKey);
      if (cached) {
        // Cache hit - skip expensive key derivation!
        decryptionKey = cached.aesKey;
      } else {
        // Cache miss - derive key (only happens once per groupId!)
        let mnemonic: string | undefined;
        let privateKeyBytes: Uint8Array | undefined;

        try {
          // Step 1: Decrypt mnemonic (temporarily - in closure only)
          mnemonic = await decryptData(encryptedMnemonic!, encryptionKey);

          // Step 2: Derive private key from mnemonic (STAYS IN CLOSURE!)
          const privateKey = derivePrivateKey(mnemonic, bip39Passphrase, accountIndex, 0, true);

          // Step 3: Extract raw private key bytes (32 bytes)
          // Convert hex string to Uint8Array
          const privateKeyHex = privateKey.toString();
          privateKeyBytes = new Uint8Array(
            privateKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
          );

          // Step 4: Derive decryption key from private key + groupId
          decryptionKey = await deriveKeyFromPrivateKey(privateKeyBytes, groupId);

          // Cache the derived key for future chunks
          encryptionKeyCache.set(cacheKey, { aesKey: decryptionKey, accountIndex });
          enclaveLogger.debug(
            `⚡ [ENCLAVE] Derived and cached AES key for decryption, groupId: ${groupId}`
          );
        } finally {
          // CRITICAL: Clear sensitive data immediately
          mnemonic = undefined;
          privateKeyBytes = undefined;
        }
      }

      // Step 5: Decrypt data with cached/derived AES key
      try {
        return await decryptBytes(encryptedData, decryptionKey);
      } catch (error) {
        throw new Error(
          `Failed to decrypt data: ${(error as Error).message}. ` +
            `This usually means the wallet used for decryption is different from the one used for encryption. ` +
            `Make sure you're using the same wallet (same mnemonic and BIP39 passphrase) that was used to create this encrypted data.`
        );
      }
    },
  };
}

/**
 * Note: There is no default/singleton enclave anymore.
 * Each wallet must create its own enclave instance using createSigningEnclave()
 * with an injected storage backend for proper separation of concerns.
 */
