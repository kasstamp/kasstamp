import type { PendingTransaction } from '@kasstamp/kaspa_wasm_sdk';

/**
 * Options for storing mnemonic in the enclave
 */
export interface StoreMnemonicOptions {
  /** The mnemonic phrase (12 or 24 words) */
  mnemonic: string;
  /** Password to encrypt the mnemonic */
  password: string;
  /** Optional BIP39 passphrase (stored securely in closure, never exposed) */
  bip39Passphrase?: string;
}

/**
 * Options for unlocking the signing enclave
 */
export interface UnlockOptions {
  /** Password to decrypt the mnemonic */
  password: string;
  /** Auto-lock timeout in milliseconds (default: 30 minutes) */
  autoLockMs?: number;
}

/**
 * Key derivation specification (BIP-44)
 */
export interface KeyDerivation {
  /** Account index (typically 0) */
  accountIndex: number;
  /** Address index within the account */
  addressIndex: number;
  /** True for receive address, false for change address */
  isReceive: boolean;
}

/**
 * Options for signing a transaction
 */
export interface SignOptions {
  /** Account index (default: 0) */
  accountIndex?: number;
  /** Address index (default: 0) */
  addressIndex?: number;
  /** True for receive address (default: true) */
  isReceive?: boolean;
  // Note: BIP39 passphrase is stored in enclave, not passed here
}

/**
 * Enclave status information
 */
export interface EnclaveStatus {
  /** Whether the enclave is locked */
  isLocked: boolean;
  /** Whether a mnemonic is stored (encrypted) */
  hasMnemonic: boolean;
  /** Auto-lock timeout in milliseconds (null if not set) */
  autoLockMs: number | null;
  /** Time until auto-lock in milliseconds (null if not unlocked) */
  timeUntilLock: number | null;
}

/**
 * Secure Signing Enclave Interface
 *
 * This interface defines the public API for the secure signing enclave.
 * The implementation uses closure scope to hide sensitive data from XSS attacks.
 */
/**
 * Storage interface for enclave persistence
 * Allows injecting different storage backends (localStorage, sessionStorage, memory, etc.)
 */
export interface IEnclaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ISecureSigningEnclave {
  /**
   * Store mnemonic in encrypted form
   *
   * @param options - Mnemonic and password
   * @throws Error if mnemonic is invalid or encryption fails
   */
  storeMnemonic(options: StoreMnemonicOptions): Promise<void>;

  /**
   * Unlock the enclave with password
   *
   * After unlocking, the enclave can sign transactions without requiring
   * the password again until it's locked or auto-lock timeout expires.
   *
   * @param options - Password and optional auto-lock timeout
   * @throws Error if password is incorrect
   */
  unlock(options: UnlockOptions): Promise<void>;

  /**
   * Lock the enclave
   *
   * Clears the decryption key from memory. After locking, unlock() must
   * be called again before signing transactions.
   */
  lock(): void;

  /**
   * Clear all stored data
   *
   * Removes the encrypted mnemonic and all keys from memory.
   * This is equivalent to logging out.
   */
  clear(): void;

  /**
   * Check if the enclave is locked
   *
   * @returns true if locked, false if unlocked
   */
  isLocked(): boolean;

  /**
   * Check if a mnemonic is stored (encrypted)
   *
   * @returns true if mnemonic is stored, false otherwise
   */
  hasMnemonic(): boolean;

  /**
   * Get enclave status
   *
   * @returns Current status including lock state and timers
   */
  getStatus(): EnclaveStatus;

  /**
   * Sign a transaction
   *
   * Derives the private key from the stored mnemonic, signs the transaction,
   * and immediately clears the private key from memory.
   *
   * ⚠️ The mnemonic and private key exist in memory ONLY during this function
   * execution (~0.2 seconds), then are immediately cleared.
   *
   * @param transaction - PendingTransaction to sign
   * @param options - Key derivation options
   * @throws Error if enclave is locked or signing fails
   */
  sign(transaction: PendingTransaction, options?: SignOptions): Promise<void>;

  /**
   * Sign a transaction with multiple keys
   *
   * Useful for transactions that require signatures from multiple addresses
   * (e.g., multi-input transactions).
   *
   * @param transaction - PendingTransaction to sign
   * @param derivations - Array of key derivation specifications
   * @throws Error if enclave is locked or signing fails
   */
  signMultiple(transaction: PendingTransaction, derivations: KeyDerivation[]): Promise<void>;

  /**
   * Sign a transaction by auto-discovering required keys
   *
   * This method automatically finds the correct keys for all UTXO inputs
   * by scanning receive/change addresses (indices 0-9).
   *
   * @param transaction - PendingTransaction to sign
   * @param network - Network ID (e.g., "testnet-10")
   * @param accountIndex - Account index (default: 0)
   * @throws Error if enclave is locked or required keys not found
   */
  signWithAutoDiscovery(
    transaction: PendingTransaction,
    network: string,
    accountIndex?: number
  ): Promise<void>;

  /**
   * Encrypt data using wallet-derived key
   *
   * SECURITY: Private key NEVER leaves the enclave!
   * The private key is derived from the mnemonic, used to create an encryption key,
   * and immediately destroyed. Only the encrypted data is returned.
   *
   * @param data - Data to encrypt
   * @param groupId - Group ID used as salt for key derivation (e.g., transaction ID)
   * @param accountIndex - Account index (default: 0)
   * @returns Encrypted data
   * @throws Error if enclave is locked or encryption fails
   */
  encryptWithWalletKey(
    data: Uint8Array,
    groupId: string,
    accountIndex?: number
  ): Promise<Uint8Array>;

  /**
   * Decrypt data using wallet-derived key
   *
   * SECURITY: Private key NEVER leaves the enclave!
   * The private key is derived from the mnemonic, used to create a decryption key,
   * and immediately destroyed. Only the decrypted data is returned.
   *
   * @param encryptedData - Data to decrypt
   * @param groupId - Group ID used as salt for key derivation (must match encryption)
   * @param accountIndex - Account index (default: 0)
   * @returns Decrypted data
   * @throws Error if enclave is locked or decryption fails
   */
  decryptWithWalletKey(
    encryptedData: Uint8Array,
    groupId: string,
    accountIndex?: number
  ): Promise<Uint8Array>;
}
