/**
 * Type definitions for Kaspa API client
 */

export type NetworkType = 'mainnet' | 'testnet-10';

export interface KaspaApiConfig {
  /** Network type to connect to */
  network: NetworkType;
  /** Custom base URL (optional, overrides network default) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Get the API base URL for a given network
 */
export function getApiBaseUrl(network: NetworkType): string {
  switch (network) {
    case 'mainnet':
      return 'https://api.kaspa.org';
    case 'testnet-10':
      return 'https://api-tn10.kaspa.org';
    default:
      throw new Error(
        `Invalid network: ${network}. Only 'mainnet' and 'testnet-10' are supported.`
      );
  }
}
