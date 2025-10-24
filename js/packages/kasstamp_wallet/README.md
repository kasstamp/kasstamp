# @kasstamp/wallet

Comprehensive TypeScript/JavaScript library for creating and managing Kaspa wallets. Provides full BIP-44 compliance with secure key storage, HD key derivation, and enterprise-grade security features.

## What it does

This package is responsible for all wallet operations:

- **Wallet Creation**: BIP-39 mnemonic generation and wallet initialization
- **Key Management**: HD key derivation with BIP-32/BIP-44 compliance
- **Address Generation**: Kaspa address creation and management
- **Secure Storage**: Encrypted keystore with enterprise-grade security
- **Digital Signatures**: ECDSA and Schnorr signature generation

## Quick Start

```typescript
import { KaspaWalletFactory, Network } from '@kasstamp/wallet';

// Create wallet factory
const walletFactory = new KaspaWalletFactory();

// Create a new wallet
const wallet = await walletFactory.createWallet({
  network: Network.Testnet,
  password: 'your-secure-password',
});

// Create signing enclave
const enclave = await createSigningEnclave();
await enclave.storeMnemonic(mnemonic, { password: 'your-password' });

// Generate addresses
const receiveAddress = wallet.accounts[0].receiveAddress;
```

## Best Practices

- **Password Security**: Use strong, unique passwords for wallet encryption
- **Mnemonic Backup**: Securely backup and store mnemonic phrases
- **Key Derivation**: Use standard BIP-44 paths for compatibility
- **Secure Storage**: Never store private keys in plain text
