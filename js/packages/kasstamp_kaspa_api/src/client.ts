/**
 * Kaspa API Client
 *
 * A typed HTTP client for the Kaspa REST API
 */

import createClient, { type Middleware } from 'openapi-fetch';
import type { paths as MainnetPaths } from './generated/kaspa-api';
import type { paths as TestnetPaths } from './generated/kaspa-api-testnet';
import { type KaspaApiConfig, getApiBaseUrl } from './types';

/**
 * Create a Kaspa API client
 *
 * @example
 * ```typescript
 * const client = createKaspaApiClient({ network: 'testnet-10' });
 *
 * // Fetch transaction by ID
 * const { data, error } = await client.GET('/transactions/{transactionId}', {
 *   params: {
 *     path: { transactionId: 'abc123...' },
 *     query: { resolve_previous_outpoints: 'light' }
 *   }
 * });
 * ```
 */
export function createKaspaApiClient(config: KaspaApiConfig) {
  const baseUrl = config.baseUrl || getApiBaseUrl(config.network);

  // Create client with the appropriate type based on network
  const client = createClient<MainnetPaths | TestnetPaths>({ baseUrl });

  // Add timeout middleware
  if (config.timeout) {
    const timeoutMiddleware: Middleware = {
      async onRequest({ request }) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), config.timeout);

        return new Request(request, {
          signal: controller.signal,
        });
      },
    };

    client.use(timeoutMiddleware);
  }

  return client;
}

/**
 * Kaspa API Client class for easier usage
 */
export class KaspaApiClient {
  private client: ReturnType<typeof createKaspaApiClient>;
  public readonly network: KaspaApiConfig['network'];
  public readonly baseUrl: string;

  constructor(config: KaspaApiConfig) {
    this.network = config.network;
    this.baseUrl = config.baseUrl || getApiBaseUrl(config.network);
    this.client = createKaspaApiClient(config);
  }

  /**
   * Get transaction by ID
   *
   * @param transactionId - Transaction ID (hex string)
   * @param resolvePreviousOutpoints - Whether to resolve previous outpoints ('no' | 'light' | 'full')
   */
  async getTransaction(
    transactionId: string,
    resolvePreviousOutpoints: 'no' | 'light' | 'full' = 'light'
  ) {
    return await this.client.GET('/transactions/{transactionId}', {
      params: {
        path: { transactionId },
        query: { resolve_previous_outpoints: resolvePreviousOutpoints },
      },
    });
  }

  /**
   * Get transaction with full payload data
   * This is the method you'll want to use for file reconstruction
   */
  async getTransactionWithPayload(transactionId: string) {
    return await this.getTransaction(transactionId, 'light');
  }

  /**
   * Get block by hash or blue score
   */
  async getBlock(blockId: string) {
    return await this.client.GET('/blocks/{blockId}', {
      params: {
        path: { blockId },
      },
    });
  }

  /**
   * Get address UTXOs
   */
  async getAddressUtxos(kaspaAddress: string) {
    return await this.client.GET('/addresses/{kaspaAddress}/utxos', {
      params: {
        path: { kaspaAddress },
      },
    });
  }

  /**
   * Get address balance
   */
  async getAddressBalance(kaspaAddress: string) {
    return await this.client.GET('/addresses/{kaspaAddress}/balance', {
      params: {
        path: { kaspaAddress },
      },
    });
  }

  /**
   * Get address transactions
   */
  async getAddressTransactions(
    kaspaAddress: string,
    options?: {
      limit?: number;
      offset?: number;
      resolve_previous_outpoints?: 'no' | 'light' | 'full';
    }
  ) {
    return await this.client.GET('/addresses/{kaspaAddress}/full-transactions', {
      params: {
        path: { kaspaAddress },
        query: options,
      },
    });
  }

  /**
   * Get network info
   */
  async getNetworkInfo() {
    return await this.client.GET('/info/blockdag');
  }

  /**
   * Get fee estimate
   */
  async getFeeEstimate() {
    return await this.client.GET('/info/fee-estimate');
  }
}
