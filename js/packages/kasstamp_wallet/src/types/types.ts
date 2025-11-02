import type { ITransactionRecord, IWalletDescriptor } from '@kasstamp/kaspa_wasm_sdk';

/**
 * Supported Kaspa networks
 */
export type Network = 'mainnet' | 'testnet-10';

/**
 * Transaction event types
 */
export interface TransactionEvent {
  type: 'new-transaction' | 'transaction-removed';
  transaction: ITransactionRecord;
  timestamp: number;
}

export interface BalanceEvent {
  type: 'balance-changed';
  mature: bigint;
  pending: bigint;
  total: bigint;
  balanceKas: string;
  timestamp: number;
}

export interface TransactionHistoryOptions {
  start?: bigint;
  end?: bigint;
  networkId?: string;
}

export interface TransactionMonitor {
  start(): Promise<void>;

  stop(): Promise<void>;

  isActive(): boolean;

  on(event: string, callback: (...args: unknown[]) => void): void;

  off(event: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Wallet storage manager using WASM SDK storage
 */
export interface WalletStorageManager {
  /**
   * Set the current network for wallet enumeration
   */
  setNetwork(network: Network): void;

  /**
   * List all available wallets using WASM SDK for the current network
   */
  listWallets(): Promise<IWalletDescriptor[]>;

  /**
   * Check if a wallet exists
   */
  walletExists(walletName: string): Promise<boolean>;

  /**
   * Get wallet descriptor by name
   */
  getWalletDescriptor(walletName: string): Promise<IWalletDescriptor | null>;

  /**
   * Rename a wallet by updating both the storage keys and internal title
   */
  renameWallet(oldName: string, newName: string): Promise<void>;
}

/**
 * Re-export WASM types for convenience
 */
export type {
  Wallet as WasmWallet,
  IAccountDescriptor,
  IWalletConfig,
  WalletDescriptor,
  Address,
  NetworkId,
  IWalletCreateRequest,
  IWalletOpenRequest,
  IWalletEnumerateRequest,
  IWalletEnumerateResponse,
  Storage,
  ITransactionRecord,
  IBalanceEvent,
  IDiscoveryEvent,
  IPendingEvent,
  IMaturityEvent,
  IReorgEvent,
  IStasisEvent,
  WalletEventMap,
} from '@kasstamp/kaspa_wasm_sdk';
