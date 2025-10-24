# @kasstamp/kaspa-api

Fully-typed TypeScript client for the Kaspa REST API with auto-generated types from OpenAPI specification. Provides type-safe access to Kaspa network data and transaction information.

## What it does

This package is responsible for REST API communication with the Kaspa network:

- **Type-Safe API Client**: Fully-typed HTTP client with compile-time type checking
- **Auto-Generated Types**: Types generated from official OpenAPI specifications
- **Multi-Network Support**: Support for mainnet and testnet networks
- **Modern HTTP Client**: Uses openapi-fetch for optimized API calls

## Quick Start

```typescript
import { createKaspaApiClient } from '@kasstamp/kaspa-api';

// Create API client
const client = createKaspaApiClient({
  network: 'testnet-10',
  timeout: 30000,
});

// Fetch transaction by ID
const { data, error } = await client.GET('/transactions/{transactionId}', {
  params: {
    path: { transactionId: 'abc123...' },
    query: { resolve_previous_outpoints: 'light' },
  },
});

if (error) {
  console.error('API Error:', error);
} else {
  console.log('Transaction:', data);
}
```

## Best Practices

- **Type Safety**: Leverage auto-generated types for compile-time checking
- **Error Handling**: Always check for errors in API responses
- **Network Selection**: Use appropriate network (mainnet/testnet) for your use case
- **Timeout Configuration**: Set appropriate timeouts for your application needs
