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
 * CRITICAL: Derives addresses directly from mnemonic instead of using accountsCreateNewAddress().
 * This prevents the WASM SDK from updating the account descriptor addresses, which causes them to change.
 * Addresses are derived deterministically from the mnemonic, so they're always the same.
 */
export class AddressDiscoveryService {
  private readonly wasmWallet: WasmWallet;
  private readonly accountId: string;
  private readonly deriveAddress: (
    accountIndex: number,
    addressIndex: number,
    isReceive: boolean
  ) => Promise<Address>;

  constructor(
    wasmWallet: WasmWallet,
    accountId: string,
    deriveAddress: (
      accountIndex: number,
      addressIndex: number,
      isReceive: boolean
    ) => Promise<Address>
  ) {
    this.wasmWallet = wasmWallet;
    this.accountId = accountId;
    this.deriveAddress = deriveAddress;
  }

  /**
   * Discover addresses starting from given indices for receive and change.
   *
   * @param receiveStartIndex - Starting index for receive addresses (default: 0)
   * @param changeStartIndex - Starting index for change addresses (default: 0)
   * @param count - Number of addresses to derive per type (default: 10)
   * @param options - Discovery options
   */
  async discoverAddresses(
    receiveStartIndex: number = 0,
    changeStartIndex: number = 0,
    count: number = 10,
    options: AddressDiscoveryOptions = {}
  ): Promise<AddressDiscoveryResult> {
    const { onProgress } = options;

    discoveryLogger.debug(
      `🔧 Discovering addresses for account ${this.accountId.slice(0, 8)}: ${count} addresses (receive from ${receiveStartIndex}, change from ${changeStartIndex})`
    );

    // Generate receive addresses
    const receiveResult = await this.discoverAddressesIteratively(
      0 as NewAddressKind,
      'receive',
      receiveStartIndex,
      count,
      onProgress
    );

    // Generate change addresses
    const changeResult = await this.discoverAddressesIteratively(
      1 as NewAddressKind,
      'change',
      changeStartIndex,
      count,
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
   * Generate addresses: Derives addresses directly from mnemonic without calling accountsCreateNewAddress()
   *
   * CRITICAL: This prevents the WASM SDK from updating the account descriptor addresses.
   * Addresses are derived deterministically from mnemonic, so they're always consistent.
   * UTXO checking happens after discovery via RPC calls.
   *
   * @param addressKind - 0 for receive, 1 for change
   * @param typeName - 'receive' or 'change' (for logging)
   * @param startIndex - Starting index for derivation
   * @param count - Number of addresses to derive
   * @param onProgress - Optional progress callback
   */
  private async discoverAddressesIteratively(
    addressKind: NewAddressKind,
    typeName: 'receive' | 'change',
    startIndex: number,
    count: number,
    onProgress?: (type: 'receive' | 'change', index: number) => void
  ): Promise<DiscoveryResult> {
    const addresses = new Map<number, Address>();
    const isReceive = addressKind === 0;
    const accountIndex = 0; // We always use account index 0

    discoveryLogger.debug(
      `📦 Deriving ${count} ${typeName} addresses starting from index ${startIndex}...`,
      {
        startIndex,
        count,
        note: 'Using direct derivation instead of accountsCreateNewAddress() to prevent account descriptor updates',
      }
    );

    // Derive addresses starting from startIndex
    for (let i = 0; i < count; i++) {
      const addressIndex = startIndex + i;
      try {
        onProgress?.(typeName, addressIndex);

        // CRITICAL: Derive address directly from mnemonic instead of calling accountsCreateNewAddress()
        // This prevents the WASM SDK from updating the account descriptor
        const address = await this.deriveAddress(accountIndex, addressIndex, isReceive);
        addresses.set(addressIndex, address);

        // discoveryLogger.debug(`📝 Derived ${typeName}[${addressIndex}]: ${address.toString()}`);
      } catch (error) {
        discoveryLogger.warn(`⚠️ Error deriving ${typeName}[${addressIndex}]:`, error as Error);
        break; // Stop on error
      }
    }

    return { addresses };
  }
}
