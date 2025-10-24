# @kasstamp/kaspa_wasm_sdk

Multi-platform Kaspa WASM SDK bridge for Kasstamp applications. Provides automatic platform detection and optimized WASM bindings for Node.js and browser environments.

## What it does

This package is responsible for loading and initializing the Kaspa WASM SDK across different platforms. It automatically detects the runtime environment (Node.js, browser, web worker) and loads the appropriate WASM binary and bindings.

## Quick Start

```typescript
import { initKaspaWasm } from '@kasstamp/kaspa_wasm_sdk';

// Initialize WASM before using any Kaspa functionality
await initKaspaWasm();

// Now you can use other Kasstamp packages that depend on WASM
```

## Best Practices

- **Initialize Early**: Call `initKaspaWasm()` before using any Kaspa-related functionality
- **Platform Detection**: The package automatically handles platform differences
- **WASM Loading**: Uses optimized WASM binaries for each platform (Node.js vs Browser)
- **Error Handling**: Handle initialization errors gracefully
