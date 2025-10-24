# KasStamp JS Monorepo

JavaScript/TypeScript SDK for creating proof-of-existence for digital artifacts on the Kaspa Layer-1 BlockDAG.

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Packages

| Package                    | Description                       | README                                                    |
| -------------------------- | --------------------------------- | --------------------------------------------------------- |
| `@kasstamp/sdk`            | Main SDK with unified API         | [📖 README](./packages/kasstamp_sdk/README.md)            |
| `@kasstamp/wallet`         | Kaspa Wallet Management           | [📖 README](./packages/kasstamp_wallet/README.md)         |
| `@kasstamp/stamping`       | File Stamping on Kaspa BlockDAG   | [📖 README](./packages/kasstamp_stamping/README.md)       |
| `@kasstamp/tx`             | Transaction Building & Monitoring | [📖 README](./packages/kasstamp_tx/README.md)             |
| `@kasstamp/rpc`            | RPC Client for Kaspa Network      | [📖 README](./packages/kasstamp_rpc/README.md)            |
| `@kasstamp/chunking`       | File Chunking & Merkle Trees      | [📖 README](./packages/kasstamp_chunking/README.md)       |
| `@kasstamp/crypto`         | Cryptographic Utilities           | [📖 README](./packages/kasstamp_crypto/README.md)         |
| `@kasstamp/kaspa-api`      | TypeScript REST API Client        | [📖 README](./packages/kasstamp_kaspa_api/README.md)      |
| `@kasstamp/utils`          | Core Utilities & Logging          | [📖 README](./packages/kasstamp_utils/README.md)          |
| `@kasstamp/kaspa_wasm_sdk` | Core WASM SDK Bindings            | [📖 README](./packages/kasstamp_kaspa_wasm_sdk/README.md) |
