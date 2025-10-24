# 🔐 Secure Signing Enclave - Architecture Documentation

## Overview

The Secure Signing Enclave is a JavaScript-based security layer that provides secure transaction signing for Kaspa wallets. It uses closure scope to protect sensitive data from XSS attacks and mirrors the security model of WASM wallets.

## How It Works

### Core Security Model

The enclave uses JavaScript closures to create a secure environment where:

- **Encrypted mnemonic** is stored in localStorage using a binary format
- **Decryption keys** exist only in closure scope (inaccessible to XSS)
- **Private keys** are derived on-demand and immediately destroyed after use
- **No sensitive data** is ever exposed to the application layer

### Storage Format

The enclave stores encrypted data using a binary format:

```
[version(1)][saltLength(2)][salt][encDataLength(4)][encData]
```

This format is:

- **Opaque**: Binary data that's not human-readable
- **Secure**: Uses AES-256-GCM encryption with unique salts
- **Efficient**: Minimal overhead compared to JSON

### Key Derivation

The enclave supports BIP-44 hierarchical deterministic key derivation:

```typescript
// Standard BIP-44 path: m/44'/972'/0'/0/0
const derivation = {
  accountIndex: 0, // Account (typically 0)
  addressIndex: 0, // Address within account
  isReceive: true, // true for receive, false for change
};
```

## API Reference

### Creating an Enclave

```typescript
import { createSigningEnclave } from '@kasstamp/wallet';

// Create enclave with localStorage backend
const enclave = createSigningEnclave(localStorage, 'wallet-123');
```

### Storing a Mnemonic

```typescript
await enclave.storeMnemonic({
  mnemonic: 'abandon abandon abandon...',
  password: 'your-secure-password',
  bip39Passphrase: 'optional-passphrase',
});
```

### Unlocking the Enclave

```typescript
await enclave.unlock({
  password: 'your-secure-password',
  autoLockMs: 30 * 60 * 1000, // 30 minutes
});
```

### Signing Transactions

```typescript
// Simple signing (uses account 0, address 0, receive)
await enclave.sign(pendingTransaction);

// Custom key derivation
await enclave.sign(pendingTransaction, {
  accountIndex: 0,
  addressIndex: 1,
  isReceive: false,
});

// Auto-discovery (finds keys automatically)
await enclave.signWithAutoDiscovery(pendingTransaction, 'testnet-10');
```

### Encryption/Decryption

```typescript
// Encrypt data with wallet-derived key
const encrypted = await enclave.encryptWithWalletKey(data, 'transaction-group-id');

// Decrypt data
const decrypted = await enclave.decryptWithWalletKey(encrypted, 'transaction-group-id');
```

## Security Features

### Closure-Based Protection

Sensitive data is stored in JavaScript closure scope:

```typescript
function createSigningEnclave() {
  // These variables are NOT accessible to external code
  let encryptedMnemonic: string | null = null;
  let encryptionKey: CryptoKey | null = null;
  let isUnlocked: boolean = false;

  return {
    // Only safe methods are exposed
    sign: async (tx) => {
      /* ... */
    },
    unlock: async (options) => {
      /* ... */
    },
  };
}
```

### Memory Management

- **Private keys** exist in memory for ~0.2 seconds during signing
- **Encryption keys** are cached per groupId to avoid re-derivation
- **Sensitive data** is cleared immediately after use

### Auto-Lock Mechanism

The enclave automatically locks after a configurable timeout:

```typescript
// Set 30-minute auto-lock
await enclave.unlock({
  password: 'password',
  autoLockMs: 30 * 60 * 1000,
});

// Check time until lock
const status = enclave.getStatus();
console.log(`Locks in ${status.timeUntilLock}ms`);
```

## Integration with SimpleWallet

The enclave integrates seamlessly with the SimpleWallet:

```typescript
// SimpleWallet delegates signing to the enclave
class SimpleWallet {
  constructor(private enclave: ISecureSigningEnclave) {}

  async signTransaction(tx: PendingTransaction) {
    // Delegates to enclave - no direct key access
    await this.enclave.sign(tx);
  }
}
```

## Best Practices

### Security

- **Strong Passwords**: Use cryptographically strong passwords
- **Auto-Lock**: Always enable auto-lock for production
- **Storage Backend**: Use secure storage (localStorage, not sessionStorage)

### Performance

- **Key Caching**: The enclave caches encryption keys per groupId
- **Batch Operations**: Sign multiple transactions while unlocked
- **Memory Cleanup**: Sensitive data is automatically cleared

### Error Handling

- **Lock State**: Always check `enclave.isLocked()` before operations
- **Password Validation**: Handle incorrect password errors gracefully
- **Network Errors**: Implement retry logic for network operations

## Status Monitoring

```typescript
const status = enclave.getStatus();
console.log({
  isLocked: status.isLocked,
  hasMnemonic: status.hasMnemonic,
  autoLockMs: status.autoLockMs,
  timeUntilLock: status.timeUntilLock,
});
```

## Migration from WASM Wallet

The enclave provides the same security guarantees as WASM wallets:

- **Same encryption**: AES-256-GCM with unique salts
- **Same key derivation**: BIP-44 HD key derivation
- **Same storage pattern**: Binary format in localStorage
- **Same API**: Compatible with existing wallet code

The main difference is that the enclave is implemented in pure JavaScript, making it more portable and easier to integrate with web applications.
