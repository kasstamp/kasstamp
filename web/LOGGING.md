# Logging Configuration Guide

## Overview

KasStamp uses a centralized logging system powered by `@kasstamp/utils`. All packages (`@kasstamp/wallet`, `@kasstamp/rpc`, `@kasstamp/sdk`, etc.) and the web application share the same logger configuration.

## Configuration File

**Location:** `web/src/config/logger.config.ts`

This is the **single source of truth** for logging configuration across the entire application.

## Default Behavior

**Important:** Without configuration, the logger is **silent** (ERROR level only). You must explicitly configure log levels in `web/src/config/logger.config.ts`.

### Production Mode (configured in logger.config.ts)

- **Log Level:** `WARN`
- **Visible Logs:** Only warnings and errors
- **Purpose:** Minimize console noise, show only important issues

### Development Mode (configured in logger.config.ts)

- **Log Level:** `DEBUG`
- **Visible Logs:** Everything (debug, info, warn, error)
- **Purpose:** Full visibility for debugging

**The log levels are set explicitly at app startup** - there are no magic defaults!

## Customizing Log Levels

### Global Configuration

Edit `web/src/config/logger.config.ts`:

```typescript
import { LogLevel, setGlobalLogLevel } from '@kasstamp/utils';

// Show only errors (most silent)
setGlobalLogLevel(LogLevel.ERROR);

// Show warnings and errors
setGlobalLogLevel(LogLevel.WARN);

// Show info, warnings, and errors
setGlobalLogLevel(LogLevel.INFO);

// Show everything (most verbose)
setGlobalLogLevel(LogLevel.DEBUG);
```

### Per-Package Configuration

You can configure individual packages or components:

```typescript
import { LogLevel, setGlobalLogLevel, setNamespaceLogLevel } from '@kasstamp/utils';

// Set global default
setGlobalLogLevel(LogLevel.WARN);

// Debug wallet operations only
setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

// Show RPC info logs
setNamespaceLogLevel('kasstamp:rpc:*', LogLevel.INFO);

// Silence stamping logs entirely
setNamespaceLogLevel('kasstamp:stamping:*', LogLevel.ERROR);
```

### Common Namespaces

| Namespace                    | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `kasstamp:*`                 | All KasStamp packages                                |
| `kasstamp:wallet:*`          | Wallet operations (keystore, accounts, transactions) |
| `kasstamp:wallet:keystore`   | Keystore-specific operations                         |
| `kasstamp:wallet:monitoring` | Balance and transaction monitoring                   |
| `kasstamp:rpc:*`             | RPC client (network communication, node discovery)   |
| `kasstamp:sdk:*`             | SDK operations (initialization, estimation)          |
| `kasstamp:stamping:*`        | File stamping operations                             |
| `kasstamp:tx:*`              | Transaction building and management                  |
| `kasstamp:web:*`             | Web UI components and services                       |
| `kasstamp:web:app`           | Main application logger                              |
| `kasstamp:web:wallet`        | Web wallet service operations                        |
| `kasstamp:web:stamping`      | Web stamping service operations                      |
| `kasstamp:web:sdk`           | Web SDK operations                                   |
| `kasstamp:web:dialog`        | Dialog and modal components                          |
| `kasstamp:web:hooks`         | React hooks and state management                     |
| `kasstamp:web:pages`         | Page components and routing                          |

### Wildcard Patterns

Namespaces support wildcards:

```typescript
// All wallet logs
setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

// Only keystore logs
setNamespaceLogLevel('kasstamp:wallet:keystore', LogLevel.DEBUG);

// All SDK logs
setNamespaceLogLevel('kasstamp:sdk:*', LogLevel.INFO);
```

## Runtime Configuration (Advanced)

You can change log levels at runtime via browser console:

```javascript
// Import needed functions (if in dev tools)
const { LogLevel, setGlobalLogLevel, setNamespaceLogLevel } = await import('@kasstamp/utils');

// Enable debug logs for wallet
setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

// Reset to errors only
setGlobalLogLevel(LogLevel.ERROR);
```

## Production Debugging

If you need to debug issues in production, you can temporarily enable verbose logging for specific components:

```typescript
// In web/src/config/logger.config.ts
if (isProduction) {
  setGlobalLogLevel(LogLevel.WARN);

  // Temporarily enable debug logs for wallet (e.g., investigating transaction issues)
  setNamespaceLogLevel('kasstamp:wallet:*', LogLevel.DEBUG);

  // Or enable info logs for stamping (e.g., investigating upload failures)
  setNamespaceLogLevel('kasstamp:stamping:*', LogLevel.INFO);
}
```

**Remember to remove these temporary overrides after debugging!**

## Log Levels Reference

| Level   | Priority | Visibility   | Use Case                                                    |
| ------- | -------- | ------------ | ----------------------------------------------------------- |
| `DEBUG` | Lowest   | Most verbose | Internal implementation details, variable values            |
| `INFO`  | Low      | Verbose      | Important events, state changes, operation progress         |
| `WARN`  | Medium   | Moderate     | Recoverable issues, deprecated features, potential problems |
| `ERROR` | Highest  | Minimal      | Failures, exceptions, critical errors                       |

## Best Practices

1. **Don't log sensitive data**: Never log private keys, mnemonics, passwords, or personal information
2. **Use appropriate levels**:
   - DEBUG: Internal details that help understand code flow
   - INFO: User-visible events (wallet connected, file stamped)
   - WARN: Issues that don't break functionality (deprecated API used)
   - ERROR: Actual failures (network timeout, invalid input)
3. **Include context**: Pass objects with relevant data instead of string concatenation
4. **Use descriptive namespaces**: Follow the pattern `kasstamp:package:component`
5. **Test in production mode**: Verify that your logs don't expose sensitive information

## Troubleshooting

### Logs not appearing in production

1. Check `web/src/config/logger.config.ts` - ensure the correct log level is set
2. Check browser console filters - ensure "All levels" is selected
3. Verify build configuration in `vite.config.ts` - `process.env.NODE_ENV` should be set correctly

### Too many logs in development

Reduce verbosity for specific packages:

```typescript
// In web/src/config/logger.config.ts (development section)
setGlobalLogLevel(LogLevel.DEBUG);
setNamespaceLogLevel('kasstamp:rpc:connection', LogLevel.WARN); // Reduce RPC noise
setNamespaceLogLevel('kasstamp:web:dialog', LogLevel.INFO); // Reduce dialog noise
```

### Package logs not respecting configuration

Ensure `initializeLoggers()` is called **before** any package imports in `web/src/main.tsx`.
