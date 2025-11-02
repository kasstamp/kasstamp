import { createLogger } from '@kasstamp/utils';
import { Wallet } from '@kasstamp/kaspa_wasm_sdk';
import type {
  WalletStorageManager,
  WalletDescriptor,
  IWalletEnumerateResponse,
  Network,
} from '../types';

const storageLogger = createLogger('kasstamp:wallet:storage');

/**
 * Simple storage manager that delegates to WASM SDK
 */
export class SimpleWalletStorageManager implements WalletStorageManager {
  private currentNetwork: Network | null = null;

  /**
   * Set the current network for wallet enumeration
   * This ensures we only list wallets for the active network
   * Must be called before listing wallets
   */
  setNetwork(network: Network): void {
    this.currentNetwork = network;
  }

  /**
   * List all available wallets using WASM SDK for the current network
   */
  async listWallets(): Promise<WalletDescriptor[]> {
    if (!this.currentNetwork) {
      throw new Error('Network not set. Call setNetwork() before listing wallets.');
    }

    // Create a temporary wallet instance to enumerate wallets
    // Use the current network so we only list wallets for this network
    const tempWallet = new Wallet({
      resident: true, // Don't persist this temporary wallet
      networkId: this.currentNetwork,
    });

    try {
      const response: IWalletEnumerateResponse = await tempWallet.walletEnumerate({});
      const allWallets = response.walletDescriptors;

      // Filter wallets by network suffix in filename
      const networkSuffix = this.currentNetwork === 'mainnet' ? '-mainnet' : '-testnet-10';

      const filteredWallets = allWallets.filter((wallet) =>
        wallet.filename.endsWith(networkSuffix)
      );

      // Normalize the title to not include network suffix
      filteredWallets.forEach((wallet) => {
        // If title is not set or includes the network suffix, strip it
        if (!wallet.title || wallet.title === wallet.filename) {
          wallet.title = wallet.filename.replace(networkSuffix, '');
        }
      });

      return filteredWallets;
    } finally {
      // Clean up the temporary wallet
      tempWallet.free();
    }
  }

  /**
   * Check if a wallet exists
   */
  async walletExists(walletName: string): Promise<boolean> {
    const wallets = await this.listWallets();
    return wallets.some((wallet) => wallet.filename === walletName || wallet.title === walletName);
  }

  /**
   * Get wallet descriptor by name
   */
  async getWalletDescriptor(walletName: string): Promise<WalletDescriptor | null> {
    const wallets = await this.listWallets();
    return (
      wallets.find((wallet) => wallet.filename === walletName || wallet.title === walletName) ??
      null
    );
  }

  /**
   * Delete a wallet from storage
   * Removes the wallet from local storage by deleting the <walletname.wallet> key
   * Also removes the associated signing enclave data (<walletname.enclave>)
   */
  async deleteWallet(walletName: string): Promise<boolean> {
    try {
      // Find the wallet descriptor to get the exact filename
      const walletDescriptor = await this.getWalletDescriptor(walletName);
      if (!walletDescriptor) {
        throw new Error(`Wallet "${walletName}" not found`);
      }

      // Get the actual filename from the descriptor
      const filename = walletDescriptor.filename;

      // Remove the wallet from local storage
      // The WASM SDK stores wallets with the pattern <filename.wallet>
      const storageKey = `${filename}.wallet`;

      // Also remove the signing enclave data
      const enclaveKey = `${filename}.enclave`;

      let walletDeleted = false;

      // Check if the key exists in local storage
      if (localStorage.getItem(storageKey)) {
        localStorage.removeItem(storageKey);
        storageLogger.debug(`✅ Wallet "${walletName}" (${storageKey}) deleted from local storage`);
        walletDeleted = true;
      } else {
        // Also try without the .wallet extension in case it's stored differently
        const altKey = filename;
        if (localStorage.getItem(altKey)) {
          localStorage.removeItem(altKey);
          storageLogger.debug(`✅ Wallet "${walletName}" (${altKey}) deleted from local storage`);
          walletDeleted = true;
        }
      }

      // Delete enclave data if it exists
      if (localStorage.getItem(enclaveKey)) {
        localStorage.removeItem(enclaveKey);
        storageLogger.debug(`✅ Signing enclave data (${enclaveKey}) deleted from local storage`);
      }

      if (!walletDeleted) {
        throw new Error(
          `Wallet storage key not found in local storage. Expected: ${storageKey} or ${filename}`
        );
      }

      return true;
    } catch (error) {
      storageLogger.error('Operation failed', error as Error);
      throw error;
    }
  }

  /**
   * Rename a wallet by updating both the storage keys and internal title
   * Updates both .wallet and .enclave localStorage keys, and the title in the binary data
   */
  async renameWallet(oldName: string, newName: string): Promise<void> {
    try {
      if (!newName.trim()) {
        throw new Error('Wallet name cannot be empty');
      }

      storageLogger.debug(`✏️ Renaming wallet from "${oldName}" to "${newName}"...`);

      // Get all wallet descriptors to find the filename
      const wallets = await this.listWallets();
      const descriptor = wallets.find((w) => w.title === oldName || w.filename === oldName);

      if (!descriptor) {
        throw new Error(`Wallet "${oldName}" not found`);
      }

      const oldFilename = descriptor.filename;
      storageLogger.debug(`📝 Found wallet with filename: ${oldFilename}`);

      // Extract network suffix from filename (e.g., "Wallet #1-mainnet" -> "-mainnet")
      const networkSuffixMatch = oldFilename.match(/-(mainnet|testnet-10)$/);
      if (!networkSuffixMatch) {
        throw new Error(`Could not extract network suffix from filename: ${oldFilename}`);
      }
      const networkSuffix = networkSuffixMatch[0]; // e.g., "-mainnet"

      // Create new filename with new name
      const newFilename = `${newName}${networkSuffix}`;
      storageLogger.debug(`📝 New filename will be: ${newFilename}`);

      // Get storage keys
      const oldWalletKey = `${oldFilename}.wallet`;
      const oldEnclaveKey = `${oldFilename}.enclave`;
      const newWalletKey = `${newFilename}.wallet`;
      const newEnclaveKey = `${newFilename}.enclave`;

      // Get wallet data
      const walletData = localStorage.getItem(oldWalletKey);
      if (!walletData) {
        throw new Error(`Wallet storage not found for "${oldFilename}"`);
      }

      storageLogger.debug(`📝 Found wallet data, length: ${walletData.length}`);

      // Convert strings to hex for search/replace in binary data
      const stringToHex = (str: string): string => {
        return Array.from(str)
          .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('');
      };

      const oldNameHex = stringToHex(oldName);
      const newNameHex = stringToHex(newName);

      storageLogger.debug(`📝 Updating title in binary data from "${oldName}" to "${newName}"`);

      // The binary format uses length-prefixed strings (4-byte little-endian length + string)
      const oldLengthPrefix = oldName.length.toString(16).padStart(8, '0');
      const newLengthPrefix = newName.length.toString(16).padStart(8, '0');

      // Reverse bytes for little-endian
      const reverseLittleEndian = (hex: string): string => {
        return hex.match(/.{2}/g)?.reverse().join('') || hex;
      };

      const oldLengthLE = reverseLittleEndian(oldLengthPrefix);
      const newLengthLE = reverseLittleEndian(newLengthPrefix);

      // Pattern: length (4 bytes LE) + string
      const oldPattern = oldLengthLE + oldNameHex;
      const newPattern = newLengthLE + newNameHex;

      // Replace in wallet data
      let updatedData = walletData.replace(oldPattern, newPattern);

      if (updatedData === walletData) {
        storageLogger.warn(
          '⚠️ Pattern with length prefix not found, trying without length prefix...'
        );
        updatedData = walletData.replace(oldNameHex, newNameHex);

        if (updatedData === walletData) {
          throw new Error('Could not find wallet name in storage data');
        }
      }

      // Save with NEW filename (localStorage key)
      localStorage.setItem(newWalletKey, updatedData);
      storageLogger.debug(`✅ Wallet storage saved to new key: ${newWalletKey}`);

      // Also move the enclave data if it exists
      const enclaveData = localStorage.getItem(oldEnclaveKey);
      if (enclaveData) {
        localStorage.setItem(newEnclaveKey, enclaveData);
        storageLogger.debug(`✅ Enclave data moved to new key: ${newEnclaveKey}`);
        localStorage.removeItem(oldEnclaveKey);
        storageLogger.debug(`🗑️ Removed old enclave key: ${oldEnclaveKey}`);
      }

      // Remove old keys
      localStorage.removeItem(oldWalletKey);
      storageLogger.debug(`🗑️ Removed old wallet key: ${oldWalletKey}`);

      // Update the descriptor object
      descriptor.filename = newFilename;
      descriptor.title = newName;

      storageLogger.debug(`✅ Wallet renamed successfully: "${oldName}" -> "${newName}"`);
    } catch (error) {
      storageLogger.error('Operation failed', error as Error);
      throw error;
    }
  }
}

// Export a singleton instance for convenience
export const walletStorage = new SimpleWalletStorageManager();
