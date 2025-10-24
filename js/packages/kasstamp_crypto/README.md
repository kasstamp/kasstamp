# @kasstamp/crypto

Essential cryptographic utilities for the Kasstamp ecosystem. Provides secure hashing, encryption, and compression capabilities with platform-optimized implementations.

## What it does

This package is responsible for all cryptographic operations in the Kasstamp ecosystem:

- **Hashing**: SHA-256 implementation for data integrity verification
- **Encryption**: AES-256-GCM authenticated encryption for secure data storage
- **Key Derivation**: HKDF-based key derivation from wallet private keys
- **Compression**: GZIP compression for efficient data storage and transmission

## Quick Start

```typescript
import {
  sha256Hex,
  encryptBytes,
  decryptBytes,
  deriveKeyFromPrivateKey,
  gzipBytes,
} from '@kasstamp/crypto';

// Hash data
const fileData = new Uint8Array(await file.arrayBuffer());
const hash = await sha256Hex(fileData);

// Derive encryption key from private key
const privateKey = new Uint8Array(32); // Your wallet's private key
const encryptionKey = await deriveKeyFromPrivateKey(privateKey, 'file-salt');

// Encrypt data
const encrypted = await encryptBytes(fileData, encryptionKey);

// Decrypt data
const decrypted = await decryptBytes(encrypted, encryptionKey);

// Compress data
const compressed = await gzipBytes(fileData);
```

## Best Practices

- **Keys**: Always derive keys from private keys using unique salts
- **Integrity**: Verify data integrity after decryption using hashing
- **Compression**: Check if compression actually reduces size before using
- **Error Handling**: Handle cryptographic errors gracefully
