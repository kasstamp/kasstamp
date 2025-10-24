import { createLogger } from '@kasstamp/utils';
import type {
  IGetBalancesByAddressesResponse,
  IUtxosChanged,
  Wallet as WasmWallet,
} from '@kasstamp/kaspa_wasm_sdk';
import { Address } from '@kasstamp/kaspa_wasm_sdk';
import type { KaspaRpcClient } from '@kasstamp/rpc';

const monitoringLogger = createLogger('kasstamp:wallet:monitoring');

/**
 * Balance monitoring configuration
 */
export interface BalanceMonitoringConfig {
  /** Wallet address to monitor */
  address: string;
  /** Account ID for WASM wallet balance queries */
  accountId?: string;
  /** WASM wallet instance for native balance tracking */
  wasmWallet?: WasmWallet;
  /** RPC client for balance queries and subscriptions */
  rpcClient?: KaspaRpcClient;
  /** Polling interval in milliseconds (fallback) */
  pollingInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Balance monitoring events using WASM types
 */
export interface BalanceMonitoringEvents {
  /** Balance updated with official WASM response */
  'balance-updated': (data: {
    response: IGetBalancesByAddressesResponse;
    balanceKas: string;
    source: 'utxo-subscription' | 'periodic-polling' | 'manual-refresh' | 'wasm-native';
    timestamp: string;
  }) => void;
  /** UTXO change detected */
  'utxo-changed': (notification: IUtxosChanged) => void;
  /** Monitoring error occurred */
  error: (error: Error) => void;
}

/**
 * Service for monitoring wallet balance in real-time
 *
 * Provides both subscription-based (real-time) and polling-based
 * balance monitoring with automatic fallback.
 */
export class BalanceMonitoringService {
  private config: BalanceMonitoringConfig;
  private listeners: Partial<BalanceMonitoringEvents> = {};
  private isMonitoring = false;
  private pollingInterval?: NodeJS.Timeout;
  private utxoSubscriptionActive = false;
  private lastKnownBalance: string | null = null;

  constructor(config: BalanceMonitoringConfig) {
    this.config = config;
  }

  /**
   * Add event listener
   */
  on<K extends keyof BalanceMonitoringEvents>(
    event: K,
    listener: BalanceMonitoringEvents[K]
  ): void {
    this.listeners[event] = listener;
  }

  /**
   * Remove event listener
   */
  off<K extends keyof BalanceMonitoringEvents>(event: K): void {
    delete this.listeners[event];
  }

  /**
   * Emit event to listeners
   */
  private emit<K extends keyof BalanceMonitoringEvents>(
    event: K,
    ...args: Parameters<BalanceMonitoringEvents[K]>
  ): void {
    const listener = this.listeners[event];
    if (listener) {
      try {
        (listener as (...eventArgs: Parameters<BalanceMonitoringEvents[K]>) => void)(...args);
      } catch (error) {
        monitoringLogger.error(`Error in balance monitoring listener for ${event}`, error as Error);
      }
    }
  }

  /**
   * Start monitoring for balance changes
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      monitoringLogger.warn('Balance monitoring already active', { address: this.config.address });
      return;
    }

    monitoringLogger.info('Starting balance monitoring', { address: this.config.address });
    this.isMonitoring = true;

    try {
      // 1. Set up UTXO subscription for real-time updates
      await this.setupUtxoSubscription();

      // 2. Set up periodic polling as fallback
      this.startPeriodicPolling();

      // 3. Get initial balance
      await this.refreshBalance('manual-refresh');

      monitoringLogger.info('Balance monitoring started successfully', {
        address: this.config.address,
      });
    } catch (error) {
      monitoringLogger.warn('Failed to start full monitoring, using polling only', {
        address: this.config.address,
        error: error as Error,
      });
      this.emit('error', error as Error);
      // Fall back to polling only
      this.startPeriodicPolling();
    }
  }

  /**
   * Stop all monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    monitoringLogger.info('Stopping balance monitoring', { address: this.config.address });
    this.isMonitoring = false;

    // Stop periodic polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    // Stop UTXO subscription
    this.utxoSubscriptionActive = false;

    monitoringLogger.info('Balance monitoring stopped', { address: this.config.address });
  }

  /**
   * Get current balance using WASM wallet or RPC
   */
  async getCurrentBalance(): Promise<{
    response: IGetBalancesByAddressesResponse;
    balanceKas: string;
    source: 'wasm-native' | 'rpc-query';
  }> {
    // Try WASM wallet native balance first
    if (this.config.wasmWallet && this.config.accountId) {
      try {
        const accountResponse = await this.config.wasmWallet.accountsGet({
          accountId: this.config.accountId,
        });

        if (
          accountResponse.accountDescriptor &&
          accountResponse.accountDescriptor.balance !== undefined
        ) {
          let totalBalance: bigint;

          if (
            typeof accountResponse.accountDescriptor.balance === 'object' &&
            accountResponse.accountDescriptor.balance !== null
          ) {
            const balanceObj = accountResponse.accountDescriptor.balance as {
              mature?: bigint | number | string;
              pending?: bigint | number | string;
            };
            const mature = BigInt(balanceObj.mature || 0);
            const pending = BigInt(balanceObj.pending || 0);
            totalBalance = mature + pending;

            monitoringLogger.debug('WASM wallet balance retrieved', {
              accountId: this.config.accountId,
              mature: mature.toString(),
              pending: pending.toString(),
              total: totalBalance.toString(),
            });
          } else {
            totalBalance = BigInt(accountResponse.accountDescriptor.balance || 0);
          }

          const balanceKas = this.sompiToKas(totalBalance).toString();

          monitoringLogger.debug('WASM wallet balance', {
            accountId: this.config.accountId,
            balanceSompi: totalBalance.toString(),
            balanceKas,
          });

          const response: IGetBalancesByAddressesResponse = {
            entries: [
              {
                address: new Address(this.config.address),
                balance: totalBalance,
              },
            ],
          };

          return {
            response,
            balanceKas,
            source: 'wasm-native',
          };
        }
      } catch (error) {
        monitoringLogger.warn('WASM balance not available, using RPC', { error: error as Error });
      }
    }

    // Fallback to RPC balance
    if (!this.config.rpcClient) {
      throw new Error('No balance source available (neither WASM wallet nor RPC client)');
    }

    const response = await this.config.rpcClient.call<IGetBalancesByAddressesResponse>(
      'getBalancesByAddresses',
      {
        addresses: [this.config.address],
      }
    );

    const balanceInSompi = response.entries[0]?.balance ?? BigInt(0);
    const balanceKas = this.sompiToKas(balanceInSompi).toString();

    return {
      response,
      balanceKas,
      source: 'rpc-query',
    };
  }

  /**
   * Manually refresh balance
   */
  async refreshBalance(
    source: 'manual-refresh' | 'utxo-subscription' | 'periodic-polling' = 'manual-refresh'
  ): Promise<string> {
    try {
      const { response, balanceKas, source: balanceSource } = await this.getCurrentBalance();

      // Only emit if balance changed or forced refresh
      if (this.lastKnownBalance !== balanceKas || source === 'manual-refresh') {
        this.lastKnownBalance = balanceKas;

        this.emit('balance-updated', {
          response,
          balanceKas,
          source: balanceSource === 'wasm-native' ? 'wasm-native' : source,
          timestamp: new Date().toISOString(),
        });
      }

      return balanceKas;
    } catch (error) {
      monitoringLogger.error('Failed to refresh balance', error as Error, {
        address: this.config.address,
      });
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Set up real-time UTXO subscription
   */
  private async setupUtxoSubscription(): Promise<void> {
    if (!this.config.rpcClient) {
      throw new Error('RPC client not available for UTXO subscription');
    }

    try {
      if (this.config.debug) {
        monitoringLogger.debug('Setting up UTXO subscription', {
          address: this.config.address,
          addressType: typeof this.config.address,
          addressLength: this.config.address?.length,
        });
      }

      const wasmRpcClient = this.config.rpcClient.wasmRpcClient;
      if (!wasmRpcClient) {
        throw new Error('WASM RPC client not available for subscription');
      }

      await wasmRpcClient.subscribeUtxosChanged([this.config.address]);

      this.utxoSubscriptionActive = true;
      monitoringLogger.info('UTXO subscription active for real-time balance updates', {
        address: this.config.address,
      });
    } catch (error) {
      monitoringLogger.error('Failed to set up UTXO subscription', error as Error, {
        address: this.config.address,
      });
      throw error;
    }
  }

  /**
   * Start periodic polling (fallback method)
   */
  private startPeriodicPolling(): void {
    const interval = this.config.pollingInterval ?? 30000;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      if (!this.isMonitoring) return;

      try {
        await this.refreshBalance('periodic-polling');
      } catch (error) {
        monitoringLogger.error('Periodic balance update failed', error as Error, {
          address: this.config.address,
        });
        this.emit('error', error as Error);
      }
    }, interval);

    monitoringLogger.info('Periodic balance polling started', {
      address: this.config.address,
      intervalMs: interval,
    });
  }

  /**
   * Convert Sompi to KAS
   * @param sompi - Amount in Sompi
   * @param rate - Conversion rate (default: 100000000)
   * @returns Amount in KAS
   */
  sompiToKas(sompi: bigint, rate: number = 100000000): number {
    return Number(sompi) / rate;
  }

  /**
   * Convert KAS to Sompi
   * @param kas - Amount in KAS
   * @param rate - Conversion rate (default: 100000000)
   * @returns Amount in Sompi
   */
  kasToSompi(kas: number, rate: number = 100000000): bigint {
    return BigInt(Math.floor(kas * rate));
  }
}

/**
 * Factory function to create balance monitoring service
 */
export function createBalanceMonitoringService(
  config: BalanceMonitoringConfig
): BalanceMonitoringService {
  return new BalanceMonitoringService(config);
}
