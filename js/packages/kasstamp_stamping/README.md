# @kasstamp/stamping

Core file stamping functionality for anchoring digital artifacts on the Kaspa blockchain. Provides comprehensive file processing, encryption, and transaction management for proof-of-existence.

## What it does

This package is responsible for all file stamping operations:

- **File Processing**: Automatic chunking, compression, and encryption of files
- **Stamping Modes**: Public mode (recoverable by anyone) and Private mode (encrypted)
- **Transaction Management**: Builds and submits blockchain transactions
- **File Reconstruction**: Downloads and reassembles files from blockchain receipts
- **Receipt Validation**: Validates stamping receipts for integrity

## Quick Start

```typescript
import {
  prepareFileForPublicMode,
  prepareFileForPrivateMode,
  stampFiles,
  reconstructFileFromReceipt,
} from '@kasstamp/stamping';

// Prepare file for public stamping
const file = new File(['Hello World'], 'test.txt');
const publicResult = await prepareFileForPublicMode(file);

// Prepare file for private stamping (requires wallet)
const privateResult = await prepareFileForPrivateMode(file, wallet.signingEnclave);

// Stamp files to blockchain
const stampResults = await stampFiles(
  [{ artifact: { type: 'file', file }, file, processingResult: publicResult }],
  wallet,
  { mode: 'public' },
  getNetwork,
  priorityFee
);

// Reconstruct file from receipt
const reconstructed = await reconstructFileFromReceipt(receipt, wallet);
```

## Best Practices

- **Mode Selection**: Use public mode for files meant to be recoverable, private mode for sensitive data
- **File Size**: Large files are automatically chunked for blockchain compatibility
- **Compression**: Enabled by default to reduce transaction costs
- **Error Handling**: Always handle processing and reconstruction errors gracefully
