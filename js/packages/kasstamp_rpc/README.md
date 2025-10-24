# @kasstamp/rpc

Robust RPC client for interacting with the Kaspa network. Provides high-level API methods, automatic node discovery, connection management, and balance monitoring services.

## What it does

This package is responsible for all RPC communication with the Kaspa network:

- **RPC Client**: High-level interface to Kaspa nodes with connection management
- **Balance Monitoring**: Real-time balance tracking with UTXO subscriptions
- **Connection Management**: Automatic retry logic, timeouts, and error handling
- **Node Discovery**: Automatic discovery of the best available Kaspa nodes

## Quick Start

```typescript
import { createKaspaClient, createBalanceMonitoringService } from '@kasstamp/rpc';

// Create RPC client
const rpcClient = createKaspaClient({
  network: 'testnet',
  nodeUrl: 'wss://testnet.kaspa.org:16110',
});

// Connect to network
await rpcClient.connect();

// Create balance monitoring service
const balanceService = createBalanceMonitoringService({
  address: 'kaspa:...',
  rpcClient: rpcClient,
});

// Start monitoring
balanceService.start();
```

## Best Practices

- **Connection Management**: Always handle connection errors gracefully
- **Balance Monitoring**: Use UTXO subscriptions for real-time updates when possible
- **Error Handling**: Implement proper retry logic for network operations
- **Resource Cleanup**: Stop monitoring services when no longer needed
