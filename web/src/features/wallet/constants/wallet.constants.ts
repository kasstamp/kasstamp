/**
 * @fileoverview Wallet Feature Constants
 */

// Environment variable helper for React/Vite
const getEnv = (key: string, defaultValue?: string): string => {
  if (typeof window !== 'undefined') {
    // Browser environment - Vite injects these as import.meta.env
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (viteEnv && viteEnv[key]) || defaultValue || '';
  }
  return defaultValue || '';
};

// Application Configuration
export const APP_CONFIG = {
  // Default network (resolver will find the best nodes automatically)
  defaultNetwork: getEnv('VITE_DEFAULT_NETWORK', 'testnet-10'),

  // Priority fee for transactions (in sompi)
  // Default: 1000 sompi = 0.00001 KAS
  priorityFeeSompi: BigInt(getEnv('VITE_PRIORITY_FEE', '1000')),

  // UI settings - configurable via environment variables
  autoRefreshInterval: parseInt(getEnv('VITE_AUTO_REFRESH_INTERVAL', '30000')), // 30 seconds
  heartbeatInterval: parseInt(getEnv('VITE_HEARTBEAT_INTERVAL', '300000')), // 5 minutes

  // Connection timeouts - configurable via environment variables
  connectionTimeout: parseInt(getEnv('VITE_CONNECTION_TIMEOUT', '15000')), // 15 seconds to establish connection
  requestTimeout: parseInt(getEnv('VITE_REQUEST_TIMEOUT', '10000')), // 10 seconds for request completion
  healthCheckInterval: parseInt(getEnv('VITE_HEALTH_CHECK_INTERVAL', '30000')), // 30 seconds between health checks

  // Feature flags
  showDebugLogs: getEnv('VITE_DEBUG', 'true').toLowerCase() === 'true',
  enableAutoConnect: getEnv('VITE_AUTO_CONNECT', 'true').toLowerCase() === 'true',
};

// Wallet validation constants
export const WALLET_CONSTRAINTS = {
  MIN_PASSWORD_LENGTH: 8,
  MNEMONIC_WORD_COUNTS: [12, 15, 18, 21, 24] as const,
  MAX_WALLET_NAME_LENGTH: 50,
} as const;
