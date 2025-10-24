import { createLogger } from '@kasstamp/utils';
import type { ITransactionRecord, Wallet as WasmWallet } from '@kasstamp/kaspa_wasm_sdk';
import { NetworkId } from '@kasstamp/kaspa_wasm_sdk';

const monitoringLogger = createLogger('kasstamp:wallet:monitoring');

/**
 * Transaction event types
 */
export interface TransactionEvent {
  type: 'pending' | 'confirmed' | 'rejected' | 'maturity';
  transactionId: string;
  address?: string;
  amount?: bigint;
  timestamp: number;
  confirmations?: number;
}

/**
 * Balance change event
 */
export interface BalanceEvent {
  address: string;
  balance: bigint;
  previousBalance: bigint;
  timestamp: number;
}

/**
 * Transaction monitoring configuration
 *
 * @internal
 */
export interface TransactionMonitoringConfig {
  pollInterval?: number; // milliseconds
  autoStart?: boolean;
}

/**
 * Transaction monitoring events
 *
 * @internal
 */
export interface TransactionMonitoringEvents {
  onTransaction?: (event: TransactionEvent) => void;
  onBalance?: (event: BalanceEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Transaction monitoring service - works directly with WASM Wallet
 * Polls for new transactions and balance changes
 */
export class TransactionMonitoringService {
  private wasmWallet: WasmWallet;
  private accountId: string;
  private networkId: string;
  private config: Required<TransactionMonitoringConfig>;
  private events: TransactionMonitoringEvents;
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;
  private knownTransactions = new Set<string>();

  constructor(
    wasmWallet: WasmWallet,
    accountId: string,
    networkId: string,
    config: TransactionMonitoringConfig = {},
    events: TransactionMonitoringEvents = {}
  ) {
    this.wasmWallet = wasmWallet;
    this.accountId = accountId;
    this.networkId = networkId;
    this.config = {
      pollInterval: config.pollInterval || 10000, // 10 seconds default
      autoStart: config.autoStart ?? false,
    };
    this.events = events;

    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * Start monitoring transactions
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      monitoringLogger.warn('Transaction monitoring already running');
      return;
    }

    monitoringLogger.info('Starting transaction monitoring');
    this.isRunning = true;
    await this.poll(); // Initial poll
    this.scheduleNextPoll();
  }

  /**
   * Stop monitoring transactions
   */
  async stop(): Promise<void> {
    monitoringLogger.info('Stopping transaction monitoring');
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Poll for new transactions and balance changes
   */
  private async poll(): Promise<void> {
    try {
      // Check for new transactions
      const transactions = await this.wasmWallet.transactionsDataGet({
        accountId: this.accountId,
        networkId: new NetworkId(this.networkId),
        start: BigInt(0),
        end: BigInt(100),
      });

      for (const tx of transactions.transactions || []) {
        const txId = tx.id || '';
        if (!this.knownTransactions.has(txId)) {
          this.knownTransactions.add(txId);
          this.emitTransactionEvent(tx);
        }
      }
    } catch (error) {
      monitoringLogger.error('Error polling transactions', error as Error);
      if (this.events.onError) {
        this.events.onError(error as Error);
      }
    }
  }

  /**
   * Emit transaction event
   */
  private emitTransactionEvent(tx: ITransactionRecord): void {
    if (this.events.onTransaction) {
      const event: TransactionEvent = {
        type: 'confirmed',
        transactionId: tx.id || '',
        timestamp: Date.now(),
      };
      this.events.onTransaction(event);
    }
  }

  /**
   * Schedule next poll
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) return;

    this.pollTimer = setTimeout(() => {
      this.poll().then(() => this.scheduleNextPoll());
    }, this.config.pollInterval);
  }
}

/**
 * Factory function to create transaction monitoring service
 */
export function createTransactionMonitoringService(
  wasmWallet: WasmWallet,
  accountId: string,
  networkId: string,
  config?: TransactionMonitoringConfig,
  events?: TransactionMonitoringEvents
): TransactionMonitoringService {
  return new TransactionMonitoringService(wasmWallet, accountId, networkId, config, events);
}
