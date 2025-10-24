# @kasstamp/sdk

Professional KasSstamp SDK - Zero-config enterprise blockDAG integration with Kaspa WASM SDK.

## What it does

This package is the main unified SDK that aggregates all KasSstamp functionality:

- **Unified API**: Single entry point for all KasSstamp features
- **Wallet Management**: Create and manage Kaspa wallets with WASM-powered performance
- **File Stamping**: Process files for blockchain proof-of-existence (public/private modes)
- **File Reconstruction**: Download and reassemble files from blockchain receipts
- **RPC Integration**: Automatic connection to Kaspa network with retry logic
- **Balance Monitoring**: Real-time balance tracking and transaction monitoring

## Quick Start

```typescript
import { KaspaSDK, KaspaWalletFactory, Network } from '@kasstamp/sdk';

// Initialize SDK
const sdk = await KaspaSDK.init({
  network: Network.Testnet,
  debug: true,
});

// Create wallet
const walletFactory = new KaspaWalletFactory();
const wallet = await walletFactory.createWallet({
  network: Network.Testnet,
  password: 'your-password',
});

// Process file for stamping
const file = new File(['Hello World'], 'test.txt');
const result = await sdk.processFileForStamping(file, 'public');

// Reconstruct file from receipt
const reconstructed = await sdk.reconstructFile(receipt, wallet);
```

## Best Practices

- **Initialize Once**: Call `KaspaSDK.init()` once at application startup
- **Wallet Security**: Always use strong passwords and secure storage
- **Error Handling**: Handle initialization and operation errors gracefully
- **Resource Management**: Properly manage wallet connections and monitoring services
