import {
  KaspaSDK,
  type KaspaSDKConfig,
  type Network,
  type SimpleWallet,
  SimpleWalletEventType,
  type TransactionMonitoringService,
  type WalletDescriptor,
  walletStorage,
  type IAccountDescriptor,
} from '@kasstamp/sdk';
import { walletLogger } from '@/core/utils/logger.ts';
import { APP_CONFIG } from '../constants';

// Event types for type safety
export type WalletServiceEvent =
  | 'connected'
  | 'disconnected'
  | 'wallet-created'
  | 'wallet-imported'
  | 'wallet-opened'
  | 'balance-updated'
  | 'transaction-sent'
  | 'transaction-error'
  | 'error';

export type WalletServiceEventData = {
  connected: { network: string };
  disconnected: Record<string, never>;
  // ⚠️ SECURITY WARNING: mnemonic is included here for UI display ONLY
  // NEVER log this data to console or send it over network!
  'wallet-created': { address: string; mnemonic: string; walletName: string };
  'wallet-imported': { address: string; walletName: string };
  'wallet-opened': { address: string; walletName: string };
  'balance-updated': { balance: string };
  'transaction-sent': { txId: string; amount: number; toAddress: string };
  'transaction-error': { error: string };
  error: { message: string; code?: string };
};

/**
 * React-compatible wallet service using the unified SDK
 * No custom types, no unnecessary conversions - just orchestration
 */
export class WalletService {
  private kaspaSDK: KaspaSDK | null = null;
  private currentWallet: SimpleWallet | null = null;
  private currentAccount: IAccountDescriptor | null = null;
  private transactionMonitoringService: TransactionMonitoringService | null = null;
  private currentWalletName: string | null = null;
  private currentBalance: string | null = null;
  private isConnecting: boolean = false;
  private isOpeningWallet: boolean = false;

  // Simple event system - properly typed with union type
  private eventListeners: Map<
    WalletServiceEvent,
    Array<(data: WalletServiceEventData[WalletServiceEvent]) => void>
  > = new Map();

  constructor() {
    walletLogger.info('🏢 React Wallet Service initialized with unified SDK');

    // Log configuration on startup
    if (APP_CONFIG.showDebugLogs) {
      walletLogger.info('🔧 Wallet Service Configuration:', {
        defaultNetwork: APP_CONFIG.defaultNetwork,
        enableAutoConnect: APP_CONFIG.enableAutoConnect,
        showDebugLogs: APP_CONFIG.showDebugLogs,
      });
    }
  }

  /**
   * Map string network input to Network enum (single conversion point)
   * Simple mapping without WASM dependencies
   */
  private mapStringToNetwork(networkString: string): Network {
    switch (networkString) {
      case 'mainnet':
        return 'mainnet';
      case 'testnet-10':
        return 'testnet-10';
      default:
        throw new Error(
          `Invalid network: ${networkString}. Only 'mainnet' and 'testnet-10' are supported.`
        );
    }
  }

  /**
   * Get the SDK instance for external use
   */
  getSDK(): KaspaSDK | null {
    return this.kaspaSDK;
  }

  getCurrentWallet(): SimpleWallet | null {
    return this.currentWallet;
  }

  getState() {
    // Note: For address, we use account descriptor as fallback since getState() is synchronous
    // The primary address should be used when available, but we can't make this async
    // Callers should use getPrimaryAddresses() directly if they need the deterministic address
    return {
      isConnected: !!this.kaspaSDK && this.kaspaSDK.isReady(),
      isInitialized: !!this.kaspaSDK,
      currentNetwork: this.kaspaSDK?.getNetwork() || 'testnet-10',
      hasWallet: !!this.currentWallet,
      walletLocked: this.currentWallet?.signingEnclave.isLocked() ?? true,
      address: this.currentAccount?.receiveAddress?.toString() || null,
      walletName: this.currentWalletName,
      balance: this.currentBalance,
    };
  }

  /**
   * Connect to Kaspa network using unified SDK
   * @param network - Network to connect to (required: 'mainnet' or 'testnet-10')
   */
  async connect(network?: string): Promise<void> {
    // Idempotenz: bereits verbunden oder in Verbindungsaufbau → noop
    if (this.kaspaSDK && this.kaspaSDK.isReady()) {
      return;
    }
    if (this.isConnecting) {
      return;
    }
    this.isConnecting = true;
    // Use configured network if not provided
    const targetNetwork = network || APP_CONFIG.defaultNetwork;

    if (!targetNetwork) {
      throw new Error(
        'Network is required for connection. Either provide it as parameter or set VITE_DEFAULT_NETWORK in .env'
      );
    }

    try {
      walletLogger.info(`🚀 Connecting to ${targetNetwork} with unified SDK...`);

      // Convert string to NetworkId (this will initialize WASM first)
      const networkId = this.mapStringToNetwork(targetNetwork);

      const config: KaspaSDKConfig = {
        network: networkId,
        debug: APP_CONFIG.showDebugLogs,
      };

      // Initialize SDK (no factory needed - SimpleWallet handles everything)
      this.kaspaSDK = await KaspaSDK.init(config);
      walletLogger.info('✅ Unified SDK ready!');

      // Set the network on wallet storage so it only lists wallets for this network
      // targetNetwork is validated by mapStringToNetwork, so it's safe to cast
      walletStorage.setNetwork(targetNetwork as 'mainnet' | 'testnet-10');

      this.notifyListeners('connected', { network: targetNetwork });
    } catch (error) {
      walletLogger.error('❌ SDK connection failed:', error as Error);
      this.notifyListeners('error', {
        message: error instanceof Error ? error.message : 'Connection failed',
        code: 'CONNECTION_ERROR',
      });
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * List all available wallets using WASM SDK storage
   */
  async listWallets(): Promise<WalletDescriptor[]> {
    try {
      walletLogger.info('📋 Listing available wallets...');
      const wallets = await walletStorage.listWallets();
      walletLogger.info(`✅ Found ${wallets.length} wallets`);
      return wallets;
    } catch (error) {
      walletLogger.error('❌ Failed to list wallets:', error as Error);
      throw error;
    }
  }

  /**
   * Delete a wallet from storage
   * If the deleted wallet is currently active, disconnect it first
   */
  async deleteWallet(walletName: string): Promise<void> {
    try {
      const isActiveWallet = this.currentWalletName === walletName;
      walletLogger.info(`🗑️ Deleting wallet: ${walletName}. Is active wallet: ${isActiveWallet}`);

      // If deleting the active wallet, disconnect first
      if (isActiveWallet) {
        walletLogger.info(`⚠️ Deleting active wallet, disconnecting first...`);
        await this.disconnect();
      }

      await walletStorage.deleteWallet(walletName);
      walletLogger.info(`✅ Wallet "${walletName}" deleted successfully`);
    } catch (error) {
      walletLogger.error('❌ Failed to delete wallet:', error as Error);
      throw error;
    }
  }

  /**
   * Rename a wallet
   * Delegates to the wallet storage manager which handles all the binary format details
   * If the renamed wallet is currently active, update the internal reference
   */
  async renameWallet(oldName: string, newName: string): Promise<void> {
    try {
      const isActiveWallet = this.currentWalletName === oldName;
      walletLogger.info(
        `🔄 Rename request: "${oldName}" -> "${newName}". Is active wallet: ${isActiveWallet}`
      );

      await walletStorage.renameWallet(oldName, newName);

      // If this is the currently active wallet, update the internal reference
      if (isActiveWallet && this.currentWalletName) {
        walletLogger.info(`📝 Updating active wallet reference from "${oldName}" to "${newName}"`);
        this.currentWalletName = newName;

        walletLogger.info(`📡 Firing wallet-opened event with walletName: "${newName}"`);
        // Notify listeners that the wallet name changed
        const address = this.currentAccount?.receiveAddress;
        this.currentBalance = await this.getBalance();
        this.notifyListeners('wallet-opened', {
          address: address?.toString() || '',
          walletName: newName,
        });

        walletLogger.info(
          `✅ Wallet service state updated. getState().walletName = "${this.getState().walletName}"`
        );
      } else {
        walletLogger.info(`ℹ️ Not active wallet, skipping event notification`);
      }
    } catch (error) {
      walletLogger.error('❌ Failed to rename wallet:', error as Error);
      throw error;
    }
  }

  /**
   * Create a new wallet
   */
  async createWallet(
    walletName: string,
    walletSecret: string,
    words: 12 | 15 | 18 | 21 | 24 = 24,
    passphrase?: string,
    network?: string
  ): Promise<{ wallet: SimpleWallet; mnemonic: string }> {
    if (!this.kaspaSDK) {
      throw new Error('SDK not initialized');
    }

    walletLogger.info('💼 Creating new wallet via unified SDK...');

    // Use provided network or fall back to SDK's current network
    const targetNetwork = network || this.kaspaSDK.getNetwork();
    if (!targetNetwork) {
      throw new Error('Network is required for wallet creation');
    }

    // Convert string to NetworkId if needed
    const networkId = this.mapStringToNetwork(targetNetwork);

    const result = await this.kaspaSDK.createWallet({
      name: walletName,
      walletSecret,
      words,
      passphrase,
      network: networkId,
    });

    this.currentWallet = result.wallet;
    this.currentWalletName = walletName;

    // Unlock the wallet to access accounts (wallet is created in locked state)
    // Address discovery will run automatically to find any UTXOs
    await this.currentWallet.unlockFromPassword(walletSecret);

    // Load existing account from the wallet
    this.currentAccount = await this.currentWallet.getWalletAccount();

    // CRITICAL: Always use primary addresses (derived from mnemonic at index 0) for consistency
    const primaryAddresses = await this.currentWallet.getPrimaryAddresses();
    const primaryReceiveAddress = primaryAddresses.receiveAddress;

    walletLogger.info(`✅ Wallet created! Primary address: ${primaryReceiveAddress}`);

    // Set up event listeners for balance changes AFTER unlock completes
    // (unlock() calls initialize() which starts UTXO processor and may clear listeners)
    this.setupWalletEventListeners();

    this.currentBalance = await this.getBalance();

    // Use primary address for consistency
    this.notifyListeners('wallet-created', {
      address: primaryReceiveAddress || '',
      mnemonic: result.mnemonic,
      walletName: this.currentWalletName || walletName,
    });

    return result;
  }

  /**
   * Import wallet from mnemonic
   */
  async importWallet(
    mnemonic: string,
    walletName: string,
    walletSecret: string,
    passphrase?: string,
    network?: string
  ): Promise<void> {
    if (!this.kaspaSDK) {
      throw new Error('SDK not initialized');
    }

    walletLogger.info('📥 Importing wallet via unified SDK...');

    // Use provided network or fall back to SDK's current network
    const targetNetwork = network || this.kaspaSDK.getNetwork();
    if (!targetNetwork) {
      throw new Error('Network is required for wallet import');
    }

    // Convert string to NetworkId if needed
    const networkId = this.mapStringToNetwork(targetNetwork);

    // Determine word count from the mnemonic
    const wordCount = this.getMnemonicWordCount(mnemonic);

    this.currentWallet = await this.kaspaSDK.importWallet(mnemonic, {
      name: walletName,
      words: wordCount,
      walletSecret,
      passphrase,
      network: networkId,
    });

    this.currentWalletName = walletName;

    walletLogger.info(`🔓 Unlocking imported wallet with password...`);
    // Unlock the wallet to access accounts (wallet is created in locked state)
    try {
      await this.currentWallet.unlockFromPassword(walletSecret);
      walletLogger.info(`✅ Wallet unlocked successfully.`);
    } catch (unlockError) {
      walletLogger.error('❌ Failed to unlock wallet after import:', unlockError as Error);
      throw new Error(
        `Failed to unlock imported wallet: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`
      );
    }

    // Load existing account from the wallet
    this.currentAccount = await this.currentWallet.getWalletAccount();

    // CRITICAL: Always use primary addresses (derived from mnemonic at index 0) for consistency
    // The account descriptor addresses may change, but primary addresses are always the same
    const primaryAddresses = await this.currentWallet.getPrimaryAddresses();
    const primaryReceiveAddress = primaryAddresses.receiveAddress;

    walletLogger.info(`✅ Wallet imported! Primary address: ${primaryReceiveAddress}`);
    walletLogger.info(`📝 Wallet state after import:`, {
      walletName: this.currentWalletName,
      hasWallet: !!this.currentWallet,
      primaryReceiveAddress: primaryReceiveAddress,
      accountDescriptorReceiveAddress: this.currentAccount?.receiveAddress?.toString(),
      addressesMatch: this.currentAccount?.receiveAddress?.toString() === primaryReceiveAddress,
      note: 'Using primary address (from mnemonic) for consistency. Account descriptor address may vary.',
    });

    // Set up event listeners for balance changes
    this.setupWalletEventListeners();

    this.currentBalance = await this.getBalance();

    // Use primary address for consistency
    this.notifyListeners('wallet-imported', {
      address: primaryReceiveAddress || '',
      walletName: this.currentWalletName || walletName,
    });
  }

  /**
   * Open existing wallet
   */
  async openExistingWallet(walletName: string, walletSecret: string): Promise<void> {
    if (!this.kaspaSDK) {
      throw new Error('SDK not initialized');
    }

    if (this.isOpeningWallet) {
      walletLogger.info(
        `⏳ Wallet open already in progress, ignoring duplicate request for "${walletName}"`
      );
      return;
    }
    this.isOpeningWallet = true;
    walletLogger.info(`🔓 Opening existing wallet: ${walletName}...`);

    try {
      // Open the existing wallet using the SDK (network is handled internally)
      this.currentWallet = await this.kaspaSDK.openExistingWallet(walletName, walletSecret);
      this.currentWalletName = walletName;

      // Unlock the wallet to access accounts (wallet is opened in locked state)
      await this.currentWallet.unlockFromPassword(walletSecret);

      // Load existing account from the wallet
      this.currentAccount = await this.currentWallet.getWalletAccount();

      // CRITICAL: Always use primary addresses for consistency
      const primaryAddresses = await this.currentWallet.getPrimaryAddresses();
      const primaryReceiveAddress = primaryAddresses.receiveAddress;

      walletLogger.info(`✅ Wallet opened! Primary address: ${primaryReceiveAddress}`);
      walletLogger.debug('Account descriptor vs primary address', {
        accountDescriptorAddress: this.currentAccount.receiveAddress?.toString(),
        primaryAddress: primaryReceiveAddress,
        addressesMatch: this.currentAccount.receiveAddress?.toString() === primaryReceiveAddress,
      });

      // Set up event listeners for balance changes AFTER unlock completes
      // (unlock() calls initialize() which starts UTXO processor and may clear listeners)
      this.setupWalletEventListeners();

      this.currentBalance = await this.getBalance();

      // Use primary address for consistency
      this.notifyListeners('wallet-opened', {
        address: primaryReceiveAddress || '',
        walletName: this.currentWalletName || walletName,
      });
    } finally {
      this.isOpeningWallet = false;
    }
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<string> {
    walletLogger.debug('📊 getBalance() called', {
      hasWallet: !!this.currentWallet,
      hasAccount: !!this.currentAccount,
      walletLocked: this.currentWallet?.signingEnclave.isLocked() ?? true,
    });

    if (this.currentAccount && this.currentWallet) {
      try {
        const balanceBigInt = await this.currentWallet.getBalance();
        const balance = balanceBigInt.toString();

        walletLogger.debug('📊 Balance retrieved from wallet', {
          balanceBigInt: balanceBigInt.toString(),
          balanceString: balance,
          previousBalance: this.currentBalance,
          balanceChanged: balance !== this.currentBalance,
        });

        walletLogger.info(
          `💰 Current balance: ${balance} sompi (${(Number(balance) / 1e8).toFixed(8)} KAS)`
        );

        return balance;
      } catch (error) {
        walletLogger.error('❌ Failed to get balance from wallet', error as Error);
        throw error;
      }
    }

    walletLogger.debug('📊 No wallet or account, returning 0');
    return '0';
  }

  /**
   * Set up event listener for wallet events (receives all event types)
   *
   * This should be called after wallet is created, imported, or unlocked.
   * The listener receives ALL event types - check the event type inside to handle different events.
   */
  private setupWalletEventListeners(): void {
    if (!this.currentWallet) {
      walletLogger.warn('⚠️ Cannot set up event listeners: no wallet');
      return;
    }

    walletLogger.debug('🔧 Setting up wallet event listener', {
      walletName: this.currentWalletName,
      walletLocked: this.currentWallet.signingEnclave.isLocked(),
    });

    // Single event listener that receives all event types
    // Check the event type inside to handle different events
    this.currentWallet.addEventListener((event: SimpleWalletEventType) => {
      walletLogger.debug('📡 Wallet event received in WalletService', {
        eventType: event,
        isBalanceChanged: event === SimpleWalletEventType.BalanceChanged,
      });

      // Handle balance changed events
      if (event === SimpleWalletEventType.BalanceChanged) {
        walletLogger.debug('✅ Balance changed event received, fetching new balance', {
          currentBalance: this.currentBalance,
        });

        // Fetch the actual balance immediately - no delays
        // Simple approach: wallet emits events, we check balance and only update if changed
        this.getBalance()
          .then((balance) => {
            const balanceString = balance.toString();

            walletLogger.debug('📊 Balance fetched after balance-changed event', {
              newBalance: balanceString,
              previousBalance: this.currentBalance,
              balanceChanged: balanceString !== this.currentBalance,
            });

            // Only update if balance actually changed
            // This handles temporary 0 balance: if it's still 0, we won't update again
            // If it changed to non-zero, we update
            if (balanceString !== this.currentBalance) {
              // Update internal balance state
              this.currentBalance = balanceString;

              // Notify listeners
              this.notifyListeners('balance-updated', {
                balance: balanceString,
              });

              walletLogger.debug('✅ Balance updated and listeners notified', {
                newBalance: balanceString,
              });
            } else {
              walletLogger.debug('⏭️ Balance unchanged, skipping update');
            }
          })
          .catch((error) => {
            walletLogger.error(
              '❌ Failed to get balance after balance-changed event',
              error as Error
            );
          });
      }
      // Handle other event types here in the future
    });

    walletLogger.debug('✅ Wallet event listener set up successfully (receives all event types)', {
      walletName: this.currentWalletName,
    });
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      // Lock wallet (automatically cleans up event listeners)
      if (this.currentWallet) {
        await this.currentWallet.lock();
      }

      // Stop monitoring services

      if (this.transactionMonitoringService) {
        await this.transactionMonitoringService.stop();
      }

      // Disconnect SDK
      if (this.kaspaSDK) {
        await this.kaspaSDK.disconnect();
      }

      // Clear state
      this.kaspaSDK = null;
      this.currentWallet = null;
      this.currentAccount = null;
      this.transactionMonitoringService = null;
      this.currentWalletName = null;

      walletLogger.info('✅ React wallet service disconnected');
      this.notifyListeners('disconnected', {});
    } catch (error) {
      walletLogger.error('❌ Error during disconnect:', error as Error);
      throw error;
    }
  }

  // Event system
  addEventListener<T extends WalletServiceEvent>(
    event: T,
    callback: (data: WalletServiceEventData[T]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    // TypeScript limitation: we need to cast because Map doesn't track type correlation
    const listeners = this.eventListeners.get(event) as
      | Array<(data: WalletServiceEventData[T]) => void>
      | undefined;
    listeners?.push(callback);
  }

  removeEventListener<T extends WalletServiceEvent>(
    event: T,
    callback: (data: WalletServiceEventData[T]) => void
  ): void {
    // TypeScript limitation: we need to cast because Map doesn't track type correlation
    const listeners = this.eventListeners.get(event) as
      | Array<(data: WalletServiceEventData[T]) => void>
      | undefined;
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private notifyListeners<T extends WalletServiceEvent>(
    event: T,
    data: WalletServiceEventData[T]
  ): void {
    // TypeScript limitation: we need to cast because Map doesn't track type correlation
    const listeners = this.eventListeners.get(event) as
      | Array<(data: WalletServiceEventData[T]) => void>
      | undefined;
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          walletLogger.error(`Error in event listener for ${event}:`, error as Error);
        }
      });
    }
  }

  /**
   * Determine word count from mnemonic phrase
   */
  private getMnemonicWordCount(mnemonic: string): 12 | 15 | 18 | 21 | 24 {
    const words = mnemonic.trim().split(/\s+/);
    const wordCount = words.length;

    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      throw new Error(
        `Invalid mnemonic word count: ${wordCount}. Must be 12, 15, 18, 21, or 24 words.`
      );
    }

    return wordCount as 12 | 15 | 18 | 21 | 24;
  }
}

// Create a singleton instance for the React app
export const walletService = new WalletService();
