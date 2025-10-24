# @kasstamp/utils

Core utilities for logging, event handling, and common helper functions.

## What it does

Provides namespace-based logging with environment-aware log levels, structured event emitters, and shared utility functions used across all KasStamp packages.

**Key Features:**

- **Environment-aware logging**: Automatically sets log level based on `process.env.NODE_ENV` (WARN for production, DEBUG for development)
- **Namespace-based loggers**: Organize logs by component (`kasstamp:wallet`, `kasstamp:rpc`, etc.)
- **Browser & Node.js support**: Colored console output in both environments
- **Dynamic log level changes**: Update log levels at runtime without restart
- **Type-safe event emitters**: Strongly-typed event handling

## Quick Start

```typescript
import { createLogger } from '@kasstamp/utils';

const logger = createLogger('myapp:component');

logger.info('Application started', { version: '1.0.0' });
logger.warn('Deprecated feature used');
logger.error('Operation failed', new Error('Connection timeout'));
```

## Log Level Configuration

**Important:** The logger has **NO default log level**. It starts silent (ERROR only) until you explicitly configure it.

You **must** configure the log level at application startup:

```typescript
import { setGlobalLogLevel, LogLevel } from '@kasstamp/utils';

// Set log level based on your environment
setGlobalLogLevel(LogLevel.WARN); // Production: only warnings and errors
// OR
setGlobalLogLevel(LogLevel.DEBUG); // Development: everything
```

### Change at Runtime

```typescript
import { setGlobalLogLevel, LogLevel } from '@kasstamp/utils';

// Show only errors
setGlobalLogLevel(LogLevel.ERROR);

// Show everything (useful for debugging production issues)
setGlobalLogLevel(LogLevel.DEBUG);
```

### Configure Specific Namespaces

```typescript
import { setNamespaceLogLevel, LogLevel } from '@kasstamp/utils';

// Show debug logs only for wallet components
setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

// Silence RPC logs entirely
setNamespaceLogLevel('kasstamp:rpc:*', LogLevel.ERROR);
```

## Best Practices

- **Use descriptive namespaces**: `kasstamp:feature:component` (e.g., `kasstamp:wallet:keystore`)
- **Include context objects**: Pass structured data instead of string concatenation
- **Avoid logging sensitive data**: Never log private keys, mnemonics, or passwords
- **Use appropriate log levels**: DEBUG for verbose details, INFO for important events, WARN for issues, ERROR for failures
