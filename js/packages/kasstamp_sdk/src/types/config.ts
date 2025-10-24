import type { KaspaRpcClientOptions } from '@kasstamp/rpc';
import type { Network } from '@kasstamp/wallet';

export interface KaspaSDKConfig {
  /** Network to connect to - REQUIRED, no default */
  network: Network;
  /** Custom node URL (optional) */
  nodeUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** RPC client options */
  rpcOptions?: Partial<KaspaRpcClientOptions>;
  /** Polling intervals for monitoring services */
  pollingIntervals?: {
    balanceMonitoring?: number; // Default: 30000ms
    transactionMonitoring?: number; // Default: 60000ms
  };
  /** Default fee configuration */
  feeConfig?: {
    defaultFeeSompi?: bigint; // Default: 1000n
    kasToSompiRate?: number; // Default: 100_000_000
  };
}
