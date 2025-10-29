import { createLogger } from '@kasstamp/utils';
import type { Address, Wallet as WasmWallet } from '@kasstamp/kaspa_wasm_sdk';
import type { NewAddressKind } from '@kasstamp/kaspa_wasm_sdk';

const discoveryLogger = createLogger('kasstamp:wallet:address-generator');

/**
 * Discovery result for a single address type (receive or change)
 */
export interface DiscoveryResult {
  addresses: Map<number, Address>;
}

/**
 * Complete discovery result for both receive and change addresses
 */
export interface AddressDiscoveryResult {
  receive: DiscoveryResult;
  change: DiscoveryResult;
}

/**
 * Options for address discovery
 */
export interface AddressDiscoveryOptions {
  onProgress?: (type: 'receive' | 'change', index: number) => void;
}

/**
 * Address Generator Service
 *
 * Minimaler Address-Generator ohne UTXO-Logik.
 * Erzeugt eine feste Anzahl an Empfangs- und Wechsel-Adressen und gibt sie zurück.
 * UTXO-Ermittlung erfolgt ausschließlich außerhalb (in getUtxos).
 */
export class AddressDiscoveryService {
  private readonly wasmWallet: WasmWallet;
  private readonly accountId: string;

  constructor(wasmWallet: WasmWallet, accountId: string) {
    this.wasmWallet = wasmWallet;
    this.accountId = accountId;
  }

  /**
   * Discover all addresses with UTXOs for the account
   *
   * Iterative approach: Creates addresses in batches of 10, activates, and checks for UTXOs.
   * If no UTXOs found, creates another batch of 10, up to maximum 100 addresses per type.
   * Everything is done in a single discovery call.
   */
  async discoverAddresses(options: AddressDiscoveryOptions = {}): Promise<AddressDiscoveryResult> {
    const { onProgress } = options;

    const GENERATE_COUNT = 20;

    discoveryLogger.info(
      `🔧 Starting address generation for account ${this.accountId.slice(0, 8)}`
    );

    // Generate receive addresses
    const receiveResult = await this.discoverAddressesIteratively(
      0 as NewAddressKind,
      'receive',
      GENERATE_COUNT,
      onProgress
    );

    // Generate change addresses
    const changeResult = await this.discoverAddressesIteratively(
      1 as NewAddressKind,
      'change',
      GENERATE_COUNT,
      onProgress
    );

    const totalAddresses = receiveResult.addresses.size + changeResult.addresses.size;

    // No activation or UTXO checks here – handled by caller

    discoveryLogger.info(`✅ Address generation completed`, {
      totalAddresses,
      receiveCreated: receiveResult.addresses.size,
      changeCreated: changeResult.addresses.size,
    });

    return {
      receive: receiveResult,
      change: changeResult,
    };
  }

  /**
   * Generate addresses: Simply creates a batch of addresses without UTXO checking
   *
   * Pure address generator - no UTXO logic here.
   * UTXO checking happens after discovery via recursive getUtxos() call.
   */
  private async discoverAddressesIteratively(
    addressKind: NewAddressKind,
    typeName: 'receive' | 'change',
    count: number,
    onProgress?: (type: 'receive' | 'change', index: number) => void
  ): Promise<DiscoveryResult> {
    const addresses = new Map<number, Address>();

    discoveryLogger.debug(`📦 Generating ${count} ${typeName} addresses...`);

    for (let i = 0; i < count; i++) {
      try {
        onProgress?.(typeName, i);

        const addressResponse = await this.wasmWallet.accountsCreateNewAddress({
          accountId: this.accountId,
          addressKind,
        });

        const address = addressResponse.address;
        addresses.set(i, address);

        discoveryLogger.debug(`📝 Created ${typeName}[${i}]: ${address.toString()}`);
      } catch (error) {
        discoveryLogger.warn(`⚠️ Error creating ${typeName}[${i}]:`, error as Error);
        break; // Stop on error
      }
    }

    return { addresses };
  }
}
