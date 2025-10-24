export { createSigningEnclave } from './signing-enclave';

export type {
  ISecureSigningEnclave,
  StoreMnemonicOptions,
  UnlockOptions,
  SignOptions,
  KeyDerivation,
  EnclaveStatus,
  IEnclaveStorage,
} from './types';

// Utilities (for testing purposes only - not needed in production)
export { deriveEncryptionKey, encryptData, decryptData, generateSalt } from './crypto-utils';

export { derivePrivateKey, deriveMultipleKeys } from './key-derivation';
