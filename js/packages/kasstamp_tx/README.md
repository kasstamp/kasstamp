# @kasstamp/tx

Comprehensive transaction building and processing toolkit for Kaspa. Provides transaction construction, payload management, monitoring services, and storage mass calculation utilities.

## What it does

This package is responsible for all transaction operations:

- **Transaction Building**: Construct Kaspa transactions with proper structure and validation
- **Payload Management**: Build and decode transaction payloads for data storage
- **Transaction Monitoring**: Track transaction status and history
- **Storage Mass Calculation**: Calculate transaction costs and optimize for blockchain limits

## Quick Start

```typescript
import {
  buildStampingPayload,
  createTransactionMonitoringService,
  GeneratorTransactionService,
} from '@kasstamp/tx';

// Build payload for stamping
const payload = buildStampingPayload(chunks, options);

// Create transaction monitoring service
const monitoringService = createTransactionMonitoringService(wallet);

// Use generator service for transactions
const generatorService = new GeneratorTransactionService();
```

## Best Practices

- **Mass Calculation**: Always calculate storage mass before submitting transactions
- **UTXO Management**: Properly manage UTXOs to avoid conflicts
- **Fee Optimization**: Use appropriate fee rates for transaction priority
- **Monitoring**: Implement transaction monitoring for better user experience
