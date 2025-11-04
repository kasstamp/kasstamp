import { NetworkId } from '@kasstamp/kaspa_wasm_sdk/kaspa.js';
import type { StampingReceipt } from '../types';

/**
 * Restores a NetworkId instance from its JSON-serialized form
 *
 * @param network - NetworkId instance, string (e.g., "mainnet", "testnet-10"), or object {type: number, id: string, suffix?: number}
 * @returns NetworkId instance
 */
export function restoreNetworkId(
  network: NetworkId | string | { type: number; id?: string; suffix?: number }
): NetworkId {
  // Already a NetworkId instance
  if (network instanceof NetworkId) {
    return network;
  }

  // String format (e.g., "mainnet", "testnet-10")
  if (typeof network === 'string') {
    return new NetworkId(network);
  }

  // Object format from JSON.stringify(NetworkId) which calls toJSON()
  // Format: {type: 0, id: "mainnet", suffix?: number}
  if (typeof network === 'object' && network !== null && 'type' in network) {
    const networkObj = network as { type: number; id?: string; suffix?: number };

    // Prefer id field if present (e.g., "mainnet", "testnet-10")
    // Otherwise map type number to string format
    let networkString: string;
    if (networkObj.id) {
      networkString = networkObj.id;
    } else {
      // Map type number to string format
      // type 0 = Mainnet, type 1 = Testnet (testnet-10)
      if (networkObj.type === 0) {
        networkString = 'mainnet';
      } else if (networkObj.type === 1) {
        networkString = 'testnet-10';
      } else {
        throw new Error(
          `Invalid network type: ${networkObj.type}. Expected 0 (mainnet) or 1 (testnet-10)`
        );
      }
    }

    // Create NetworkId from string
    const networkId = new NetworkId(networkString);

    // Set suffix if present
    if (networkObj.suffix !== undefined && networkObj.suffix !== null) {
      networkId.suffix = networkObj.suffix;
    }

    return networkId;
  }

  throw new Error(
    `Invalid network format: expected NetworkId instance, string, or object with type property, got ${typeof network}`
  );
}

/**
 * Deserializes a receipt from JSON, ensuring NetworkId is properly restored
 *
 * @param receiptJson - Receipt data from JSON.parse
 * @returns Properly deserialized StampingReceipt with NetworkId instance
 */
export function deserializeReceipt(receiptJson: unknown): StampingReceipt {
  if (!receiptJson || typeof receiptJson !== 'object') {
    throw new Error('Receipt must be an object');
  }

  const receipt = receiptJson as Record<string, unknown>;

  // Ensure network is present and restore it
  if (!receipt.network) {
    throw new Error('Receipt must contain network information');
  }

  // Network can be string, object, or NetworkId instance
  // restoreNetworkId handles all cases
  const deserializedReceipt: StampingReceipt = {
    ...(receipt as unknown as StampingReceipt),
    network: restoreNetworkId(
      receipt.network as string | NetworkId | { type: number; id?: string; suffix?: number }
    ),
  };

  return deserializedReceipt;
}
