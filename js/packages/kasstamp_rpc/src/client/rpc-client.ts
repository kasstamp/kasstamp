import { createLogger } from '@kasstamp/utils';
import { UniversalEventEmitter } from '../utils';
import { KaspaConnectionError, KaspaRpcClientError } from './errors';
import type { ConnectionState, KaspaRpcClientOptions } from '../types';
import { Encoding, Resolver, RpcClient } from '@kasstamp/kaspa_wasm_sdk';

const clientLogger = createLogger('kasstamp:rpc:client');

/**
 * Kaspa RPC Client using official kaspa-wasm approach
 *
 * Provides a high-level interface to the Kaspa network using the
 * official kaspa-wasm SDK with proper connection management and logging.
 */
export class KaspaRpcClient extends UniversalEventEmitter {
  private rpcClient: RpcClient | null = null;
  private readonly options: Required<KaspaRpcClientOptions>;
  private connectionState: ConnectionState;

  constructor(options: KaspaRpcClientOptions) {
    super();

    // Optimized default timeouts for faster connections:
    // - 5s per connection attempt (down from 10s)
    // - 1s retry interval (down from 2s)
    // - 5 max retries (up from 3) to compensate for shorter timeout
    this.options = {
      network: options.network,
      nodeUrl: options.nodeUrl,
      connectTimeout: options.connectTimeout ?? 5000,
      retryInterval: options.retryInterval ?? 1000,
      maxRetries: options.maxRetries ?? 5,
      debug: options.debug ?? false,
    };

    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      retryCount: 0,
    };

    clientLogger.debug('KaspaRpcClient initialized', { network: this.options.network });
  }

  /**
   * Initialize WASM module
   */
  private async initializeWasm(): Promise<void> {
    try {
      clientLogger.debug('Initializing kaspa-wasm module');
      clientLogger.info('kaspa-wasm initialized successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      clientLogger.error('Failed to initialize kaspa-wasm', error as Error);
      throw new KaspaRpcClientError(
        `Failed to initialize kaspa-wasm: ${errorMsg}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Connect to the Kaspa network using official kaspa-wasm Resolver
   */
  async connect(): Promise<void> {
    if (this.connectionState.isConnected) {
      clientLogger.debug('Already connected');
      return;
    }

    if (this.connectionState.isConnecting) {
      throw new KaspaConnectionError('Connection already in progress');
    }

    this.connectionState.isConnecting = true;
    this.connectionState.retryCount = 0;
    this.emit('connecting');

    await this.attemptConnection();
  }

  private async attemptConnection(): Promise<void> {
    const { maxRetries, retryInterval, connectTimeout } = this.options;

    if (this.connectionState.retryCount >= maxRetries) {
      const error = new KaspaConnectionError(`Failed to connect after ${maxRetries} attempts`);
      this.connectionState.isConnecting = false;
      this.emit('error', error);
      throw error;
    }

    try {
      clientLogger.info('Connection attempt', {
        attempt: this.connectionState.retryCount + 1,
        maxRetries,
      });

      // Initialize WASM first
      await this.initializeWasm();

      clientLogger.debug('Creating RpcClient with official kaspa-wasm Resolver', {
        network: this.options.network,
        nodeUrl: this.options.nodeUrl,
      });

      this.rpcClient = new RpcClient({
        resolver: new Resolver(),
        networkId: this.options.network,
        encoding: Encoding.Borsh,
        url: this.options.nodeUrl,
      });

      clientLogger.debug('Connecting via official kaspa-wasm Resolver');

      // Connect with timeout
      // Safety timeout is connectTimeout + 2s (down from +5s) for faster failure detection
      await Promise.race([
        this.rpcClient.connect({
          blockAsyncConnect: true,
          retryInterval: 0,
          timeoutDuration: connectTimeout,
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), connectTimeout + 2000);
        }),
      ]);

      // Verify connection is active
      if (this.rpcClient && this.rpcClient.isConnected) {
        // Debug: Log available methods (only in debug mode)
        if (this.options.debug) {
          clientLogger.debug('RPC client connected', {
            availableMethods: Object.getOwnPropertyNames(
              Object.getPrototypeOf(this.rpcClient)
            ).slice(0, 10),
          });
        }

        this.connectionState.isConnected = true;
        this.connectionState.isConnecting = false;
        this.connectionState.currentUrl = this.rpcClient.url;
        this.connectionState.lastError = undefined;

        clientLogger.info('Connected successfully', {
          url: this.rpcClient.url,
          network: this.options.network,
        });

        // Get node info for capabilities
        await this.updateNodeInfo();

        this.emit('connected', {
          url: this.rpcClient.url,
          networkId: this.options.network,
        });

        return;
      } else {
        throw new Error('Connection lost after initial establishment');
      }
    } catch (error) {
      this.connectionState.retryCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.connectionState.lastError = errorMsg;

      clientLogger.warn('Connection attempt failed', {
        attempt: this.connectionState.retryCount,
        error: errorMsg,
      });

      if (this.connectionState.retryCount < maxRetries) {
        clientLogger.debug('Retrying connection', { retryInMs: retryInterval });
        this.emit('reconnecting', { attempt: this.connectionState.retryCount });

        await new Promise((resolve) => setTimeout(resolve, retryInterval));
        return this.attemptConnection();
      }

      // All attempts failed
      this.connectionState.isConnecting = false;
      const finalError = new KaspaConnectionError(
        `Failed to connect after ${maxRetries} attempts. Last error: ${errorMsg}`,
        error instanceof Error ? error : undefined
      );

      this.emit('error', finalError);
      throw finalError;
    }
  }

  /**
   * Update node information after connection
   */
  private async updateNodeInfo(): Promise<void> {
    try {
      if (this.rpcClient && this.rpcClient.isConnected) {
        const info = await this.rpcClient.getInfo();
        clientLogger.debug('Node capabilities retrieved', {
          synced: info.isSynced,
          utxoIndex:
            (info as { hasUtxoIndex?: boolean; isUtxoIndexed?: boolean }).hasUtxoIndex ??
            (info as { hasUtxoIndex?: boolean; isUtxoIndexed?: boolean }).isUtxoIndexed,
          version: info.serverVersion,
        });
      }
    } catch (error) {
      clientLogger.warn('Failed to get node info', { error: error as Error });
    }
  }

  /**
   * Disconnect from the Kaspa network
   */
  async disconnect(): Promise<void> {
    if (this.rpcClient && this.connectionState.isConnected) {
      try {
        await this.rpcClient.disconnect();
        clientLogger.info('Disconnected from node');
      } catch (error) {
        clientLogger.warn('Disconnect error', { error: error as Error });
      }
    }

    this.connectionState.isConnected = false;
    this.connectionState.isConnecting = false;
    this.connectionState.currentUrl = undefined;
    this.rpcClient = null;

    this.emit('disconnected', { reason: 'manual_disconnect' });
  }

  /**
   * Check if client is connected
   */
  get isConnected(): boolean {
    return this.connectionState.isConnected && !!this.rpcClient?.isConnected;
  }

  /**
   * Direct access to kaspa-wasm RpcClient
   */
  get rpc(): RpcClient {
    if (!this.rpcClient) {
      throw new KaspaRpcClientError('Not connected to Kaspa network');
    }
    return this.rpcClient;
  }

  /**
   * Get fee estimate from the network
   */
  async getFeeEstimate(): Promise<{
    priorityFeeRate: number;
    normalFeeRate: number;
    lowFeeRate: number;
  }> {
    if (!this.isConnected) {
      throw new KaspaRpcClientError('Not connected to Kaspa network');
    }

    try {
      clientLogger.debug('Getting fee estimate from network');

      // Call getFeeEstimate directly on the RPC client
      const feeEstimate = await this.rpcClient!.getFeeEstimate();

      if (!feeEstimate || typeof feeEstimate !== 'object') {
        throw new KaspaRpcClientError('Invalid fee estimate response from network');
      }

      // Extract fee rates from the response
      const priorityBucket = feeEstimate.estimate.priorityBucket;
      const normalBuckets = feeEstimate.estimate.normalBuckets || [];
      const lowBuckets = feeEstimate.estimate.lowBuckets || [];

      const priorityFeeRate = priorityBucket?.feerate || 1000; // Default fallback
      const normalFeeRate = normalBuckets[0]?.feerate || 500; // First normal bucket
      const lowFeeRate = lowBuckets[0]?.feerate || 100; // First low bucket

      clientLogger.debug('Fee estimate retrieved', {
        priorityFeeRate,
        normalFeeRate,
        lowFeeRate,
      });

      return {
        priorityFeeRate,
        normalFeeRate,
        lowFeeRate,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      clientLogger.error('Failed to get fee estimate', error as Error);
      throw new KaspaRpcClientError(
        `Failed to get fee estimate: ${errorMsg}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Call any RPC method directly
   */
  async call<T = Record<string, string | number | boolean | object | null>>(
    method: string,
    params?: Record<string, string | number | boolean | object | null>
  ): Promise<T> {
    if (!this.isConnected) {
      throw new KaspaRpcClientError('Not connected to Kaspa network');
    }

    try {
      // Debug logging
      if (this.options.debug) {
        clientLogger.debug('RPC call', { method, params });
      }

      // Use the kaspa-wasm RpcClient method directly
      const methodFn = (
        this.rpcClient as unknown as { [key: string]: (...args: unknown[]) => Promise<T> }
      )[method];

      if (typeof methodFn === 'function') {
        return await methodFn.call(this.rpcClient, params);
      } else {
        throw new KaspaRpcClientError(`RPC method '${method}' not available`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      clientLogger.error(`RPC call '${method}' failed`, error as Error, { method, params });
      throw new KaspaRpcClientError(
        `RPC call '${method}' failed: ${errorMsg}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Factory function to create a Kaspa RPC client
 */
export function createKaspaClient(options: KaspaRpcClientOptions): KaspaRpcClient {
  return new KaspaRpcClient(options);
}
