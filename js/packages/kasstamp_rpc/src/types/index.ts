/**
 * Configuration options for the Kaspa RPC client
 */
export interface KaspaRpcClientOptions {
  /** Network identifier (mainnet, testnet, etc.) */
  network: string;
  /** Optional custom node URL */
  nodeUrl?: string;
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Retry interval in milliseconds */
  retryInterval?: number;
  /** Maximum number of connection retry attempts */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Current connection state of the RPC client
 *
 * @internal Used internally by RPC client
 */
export interface ConnectionState {
  /** Whether the client is currently connected */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** The URL of the currently connected node */
  currentUrl?: string;
  /** Number of connection retries attempted */
  retryCount: number;
  /** Last error message if connection failed */
  lastError?: string;
}

/**
 * Information about the connected Kaspa node
 *
 * @internal Used internally by RPC client
 */
export interface NodeInfo {
  /** Node URL */
  url: string;
  /** Network identifier */
  networkId: string;
  /** Whether the node is fully synced */
  isSynced?: boolean;
  /** Whether the node has UTXO indexing enabled */
  hasUtxoIndex?: boolean;
  /** Server version string */
  serverVersion?: string;
}
