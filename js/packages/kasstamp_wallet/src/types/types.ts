import type {
  IAccountDescriptor,
  ITransactionRecord,
  IWalletDescriptor,
  IWalletExportResponse,
  PendingTransaction,
  UtxoEntry,
  Wallet as WasmWallet,
} from '@kasstamp/kaspa_wasm_sdk';
import type { ISecureSigningEnclave, SignOptions } from '../signing';

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
 * Simplified wallet interface that delegates to WASM SDK
 */
export interface SimpleWallet {
  readonly wasmWallet: WasmWallet;
  readonly network: string;
  accounts: IAccountDescriptor[];
  locked: boolean;
  readonly descriptor?: IWalletDescriptor;

  readonly signingEnclave: ISecureSigningEnclave;

  deriveNextAccount(change?: 0 | 1): Promise<IAccountDescriptor>;

  getExistingAccounts(): Promise<IAccountDescriptor[]>;

  getAccountByAddress(address: string): IAccountDescriptor | undefined;

  lock(): void;

  unlockFromPassword(password: string): Promise<void>;

  toEncryptedKeystore(
    password: string,
    meta?: Record<string, unknown>
  ): Promise<IWalletExportResponse>;

  getBalance(accountId: string): Promise<bigint>;

  sendTransaction(request: {
    accountId: string;
    walletSecret: string;
    destination: Array<{ address: string; amount: bigint }>;
    priorityFeeSompi?: { amount: bigint; source: number };
  }): Promise<{ transactionIds: string[] }>;

  // ✅ NEW: Sign transaction using secure enclave (fast transaction chaining)
  signTransaction(transaction: PendingTransaction, options?: SignOptions): Promise<void>;

  getTransactionHistory(
    accountId: string,
    options?: TransactionHistoryOptions
  ): Promise<ITransactionRecord[]>;

  getTransactionCount(accountId: string): Promise<number>;

  getUtxos(accountId: string): Promise<UtxoEntry[]>;

  isSynced(): boolean;

  waitForSync(timeoutMs?: number): Promise<boolean>;

  onTransactionUpdate(callback: (event: TransactionEvent) => void): void;

  onBalanceUpdate(callback: (event: BalanceEvent) => void): void;

  removeTransactionListener(callback: (event: TransactionEvent) => void): void;

  removeBalanceListener(callback: (event: BalanceEvent) => void): void;
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
