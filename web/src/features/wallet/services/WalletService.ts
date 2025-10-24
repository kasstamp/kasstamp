import {
  type BalanceMonitoringService,
  type ITransactionRecord,
  KaspaSDK,
  type KaspaSDKConfig,
  KaspaWalletFactory,
  type Network,
  type SimpleWallet,
  type TransactionMonitoringService,
  type WalletDescriptor,
  walletStorage,
  type IAccountDescriptor,
  type BalanceEvent,
  type TransactionEvent,
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
  private balanceService: BalanceMonitoringService | null = null;
  private transactionMonitoringService: TransactionMonitoringService | null = null;
  private currentWalletName: string | null = null;
  private currentBalance: string | null = null;

  // Wallet listener callbacks (stored for cleanup)
  private walletBalanceCallback: ((event: BalanceEvent) => void) | null = null;
  private walletTransactionCallback: ((event: TransactionEvent) => void) | null = null;

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
          `Invalid network: ${networkString}. Only 'mainnet' and 'testnet-10' are supported.`,
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
    return {
      isConnected: !!this.kaspaSDK && this.kaspaSDK.isReady(),
      isInitialized: !!this.kaspaSDK,
      currentNetwork: this.kaspaSDK?.getNetwork() || 'testnet-10',
      hasWallet: !!this.currentWallet,
      walletLocked: this.currentWallet?.locked ?? true,
      address: this.currentAccount?.receiveAddress?.toString() || null,
      accounts: this.currentWallet?.accounts || [],
      walletName: this.currentWalletName,
      balance: this.currentBalance, // Return stored balance instead of null
      lastSyncTime: new Date(),
    };
  }

  /**
   * Connect to Kaspa network using unified SDK
   * @param network - Network to connect to (required: 'mainnet' or 'testnet-10')
   */
  async connect(network?: string): Promise<void> {
    // Use configured network if not provided
    const targetNetwork = network || APP_CONFIG.defaultNetwork;

    if (!targetNetwork) {
      throw new Error(
        'Network is required for connection. Either provide it as parameter or set VITE_DEFAULT_NETWORK in .env',
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

      // Initialize SDK with wallet factory
      const walletFactory = new KaspaWalletFactory();
      this.kaspaSDK = await KaspaSDK.init(config, walletFactory);
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
        `🔄 Rename request: "${oldName}" -> "${newName}". Is active wallet: ${isActiveWallet}`,
      );

      await walletStorage.renameWallet(oldName, newName);

      // If this is the currently active wallet, update the internal reference
      if (isActiveWallet && this.currentWalletName) {
        walletLogger.info(`📝 Updating active wallet reference from "${oldName}" to "${newName}"`);
        this.currentWalletName = newName;

        walletLogger.info(`📡 Firing wallet-opened event with walletName: "${newName}"`);
        // Notify listeners that the wallet name changed
        const address = this.currentAccount?.receiveAddress;
        this.notifyListeners('wallet-opened', {
          address: address?.toString() || '',
          walletName: newName,
        });

        walletLogger.info(
          `✅ Wallet service state updated. getState().walletName = "${this.getState().walletName}"`,
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
    network?: string,
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

    const result = await this.kaspaSDK.createNewWallet({
      name: walletName,
      walletSecret,
      words,
      passphrase,
      network: networkId,
    });

    this.currentWallet = result.wallet;
    this.currentWalletName = walletName;

    // Unlock the wallet to access accounts (wallet is created in locked state)
    await this.currentWallet.unlockFromPassword(walletSecret);

    // Load existing accounts from the wallet (SDK creates the first account automatically)
    const existingAccounts = await this.currentWallet.getExistingAccounts();

    if (existingAccounts.length === 0) {
      throw new Error('No accounts found in created wallet - SDK should have created one');
    }
    this.currentAccount = existingAccounts[0];

    walletLogger.info(
      `✅ Wallet created! Address: ${this.currentAccount.receiveAddress?.toString()}`,
    );

    // Set up monitoring services using SDK orchestration
    await this.setupMonitoringServices();

    this.notifyListeners('wallet-created', {
      address: this.currentAccount.receiveAddress?.toString() || '',
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
    network?: string,
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
      walletLogger.info(
        `✅ Wallet unlocked successfully. Locked state: ${this.currentWallet.locked}`,
      );
    } catch (unlockError) {
      walletLogger.error('❌ Failed to unlock wallet after import:', unlockError as Error);
      throw new Error(
        `Failed to unlock imported wallet: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`,
      );
    }

    walletLogger.info(`📋 Loading accounts from imported wallet...`);
    // Load existing accounts from the wallet (SDK creates the first account automatically)
    const existingAccounts = await this.currentWallet.getExistingAccounts();
    walletLogger.info(`📋 Found ${existingAccounts.length} accounts`);

    if (existingAccounts.length === 0) {
      throw new Error('No accounts found in imported wallet - SDK should have created one');
    }
    this.currentAccount = existingAccounts[0];

    walletLogger.info(
      `✅ Wallet imported! Address: ${this.currentAccount.receiveAddress?.toString()}`,
    );
    walletLogger.info(`📝 Wallet state after import:`, {
      walletName: this.currentWalletName,
      hasWallet: !!this.currentWallet,
      walletLocked: this.currentWallet?.locked,
      address: this.currentAccount?.receiveAddress?.toString(),
    });

    // Set up monitoring services
    await this.setupMonitoringServices();

    this.notifyListeners('wallet-imported', {
      address: this.currentAccount.receiveAddress?.toString() || '',
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

    walletLogger.info(`🔓 Opening existing wallet: ${walletName}...`);

    // Open the existing wallet using the SDK (network is handled internally)
    this.currentWallet = await this.kaspaSDK.openExistingWallet(walletName, walletSecret);
    this.currentWalletName = walletName;

    // Unlock the wallet to access accounts (wallet is opened in locked state)
    await this.currentWallet.unlockFromPassword(walletSecret);

    // Load existing accounts from the wallet
    const existingAccounts = await this.currentWallet.getExistingAccounts();

    if (existingAccounts.length === 0) {
      // If no existing accounts, create the first one
      this.currentAccount = await this.currentWallet.deriveNextAccount(0);
      walletLogger.info(
        `✅ Wallet opened! Created first account: ${this.currentAccount.receiveAddress?.toString()}`,
      );
    } else {
      // Use the first existing account
      this.currentAccount = existingAccounts[0];
      walletLogger.info(
        `✅ Wallet opened! Loaded existing account: ${this.currentAccount.receiveAddress?.toString()}`,
      );
    }

    // Set up monitoring services
    await this.setupMonitoringServices();

    this.notifyListeners('wallet-opened', {
      address: this.currentAccount.receiveAddress?.toString() || '',
      walletName: this.currentWalletName || walletName,
    });
  }

  /**
   * Set up monitoring services using SDK orchestration
   */
  private async setupMonitoringServices(): Promise<void> {
    if (!this.kaspaSDK || !this.currentAccount) {
      walletLogger.warn('⚠️ SDK or account not available for monitoring setup');
      return;
    }

    const address = this.currentAccount.receiveAddress?.toString();
    const wasmWallet = this.currentWallet?.wasmWallet;

    walletLogger.info('🔧 Setting up monitoring services...');

    if (APP_CONFIG.showDebugLogs) {
      walletLogger.info('🔧 Address:', { address });
      walletLogger.info('🔧 Account ID:', { accountId: this.currentAccount.accountId });
      walletLogger.info('🔧 WASM Wallet available:', { hasWallet: !!wasmWallet });
    }

    // Ensure the account is properly activated in the WASM wallet
    if (wasmWallet && this.currentAccount.accountId) {
      try {
        walletLogger.info('🔧 Activating account for monitoring...');
        await wasmWallet.accountsActivate({
          accountIds: [this.currentAccount.accountId],
        });
        walletLogger.info('✅ Account activated for monitoring');
      } catch (error) {
        walletLogger.warn('⚠️ Failed to activate account:', error as Error);
      }
    }

    // Create all services using SDK orchestration with wallet instance (wallet-centric)
    if (!this.currentWallet) {
      throw new Error('No wallet available for service creation');
    }
    const services = this.kaspaSDK.createWalletServices(this.currentWallet);

    this.balanceService = services.balanceMonitoring;
    this.transactionMonitoringService = services.transactionMonitoring;

    // Set up balance monitoring
    this.balanceService.on('balance-updated', (data) => {
      walletLogger.info(`💰 Balance updated: ${data.balanceKas} KAS (${data.source})`);
      this.currentBalance = data.balanceKas; // Store balance in service
      this.notifyListeners('balance-updated', { balance: data.balanceKas });
    });

    this.balanceService.on('error', (error) => {
      walletLogger.error('❌ Balance monitoring error:', error);
      this.notifyListeners('error', error);
    });

    // Start monitoring
    await this.balanceService.startMonitoring();
    await this.transactionMonitoringService.start();

    // ✅ Set up wallet-level listeners for direct balance and transaction updates
    if (this.currentWallet && this.currentAccount.accountId) {
      walletLogger.info('🔧 Setting up wallet-level listeners...');

      // Create and store balance callback for cleanup later
      this.walletBalanceCallback = (balanceEvent) => {
        walletLogger.info(`💰 [Wallet Listener] Balance changed:`, {
          mature: balanceEvent.mature.toString(),
          pending: balanceEvent.pending.toString(),
          total: balanceEvent.total.toString(),
          balanceKas: balanceEvent.balanceKas,
        });

        // Update stored balance and notify listeners
        this.currentBalance = balanceEvent.balanceKas;
        this.notifyListeners('balance-updated', { balance: balanceEvent.balanceKas });
      };

      // Create and store transaction callback for cleanup later
      this.walletTransactionCallback = (txEvent) => {
        walletLogger.info(`📝 [Wallet Listener] Transaction ${txEvent.type}:`, {
          id: txEvent.transaction.id,
          type: txEvent.type,
          timestamp: txEvent.timestamp,
        });

        // You can add more specific handling here if needed
        // For example, notify UI of new transactions
      };

      // Register the listeners
      this.currentWallet.onBalanceUpdate(this.walletBalanceCallback);
      this.currentWallet.onTransactionUpdate(this.walletTransactionCallback);

      walletLogger.info('✅ Wallet-level listeners registered');
    }

    walletLogger.info('✅ Monitoring services started');
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<string> {
    if (!this.balanceService) {
      throw new Error('Balance service not initialized');
    }

    try {
      const { balanceKas } = await this.balanceService.getCurrentBalance();
      return balanceKas;
    } catch (error) {
      walletLogger.error('❌ Failed to get balance:', error as Error);
      return '0';
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(): Promise<ITransactionRecord[]> {
    if (!this.currentWallet) {
      walletLogger.warn('⚠️ Wallet not available');
      return [];
    }

    try {
      walletLogger.info(`📋 Getting transaction history for all accounts in wallet`);

      // Wait for wallet to be synced first
      if (!this.currentWallet.isSynced()) {
        walletLogger.info('⏳ Wallet not synced, waiting for sync...');
        const synced = await this.currentWallet.waitForSync(30000); // Wait up to 30 seconds
        if (!synced) {
          walletLogger.warn('⚠️ Wallet sync timeout, proceeding anyway...');
        }
      }

      // Get all accounts in the wallet
      const accounts = this.currentWallet.accounts;
      walletLogger.info(`📋 Found ${accounts.length} accounts in wallet`);

      if (accounts.length === 0) {
        walletLogger.info('📋 No accounts found in wallet');
        return [];
      }

      // Get transactions from all accounts in parallel
      const transactionPromises = accounts.map(async (account) => {
        try {
          walletLogger.info(`📋 Getting transactions for account: ${account.accountId}`);
          if (!this.currentWallet) {
            walletLogger.warn('⚠️ Current wallet is null');
            return [];
          }
          const accountTransactions = await this.currentWallet.getTransactionHistory(
            account.accountId,
          );
          walletLogger.info(
            `📋 Found ${accountTransactions.length} transactions for account ${account.accountId}`,
          );
          return accountTransactions;
        } catch (error) {
          walletLogger.warn(
            `⚠️ Failed to get transactions for account ${account.accountId}:`,
            error as Error,
          );
          return [];
        }
      });

      // Wait for all transactions to be fetched in parallel
      const allTransactionArrays = await Promise.all(transactionPromises);

      // Flatten all transactions into a single array
      const allTransactions = allTransactionArrays.flat();

      // Sort by timestamp (newest first)
      allTransactions.sort((a, b) => {
        const timeA = a.unixtimeMsec ? Number(a.unixtimeMsec) : 0;
        const timeB = b.unixtimeMsec ? Number(b.unixtimeMsec) : 0;
        return timeB - timeA;
      });

      walletLogger.info(`📋 Total transactions from all accounts: ${allTransactions.length}`);
      return allTransactions;
    } catch (error) {
      walletLogger.error('❌ Failed to get transaction history:', error as Error);
      return [];
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      // Clean up wallet-level listeners first
      if (this.currentWallet) {
        if (this.walletBalanceCallback) {
          this.currentWallet.removeBalanceListener(this.walletBalanceCallback);
          walletLogger.info('🧹 Removed wallet balance listener');
        }
        if (this.walletTransactionCallback) {
          this.currentWallet.removeTransactionListener(this.walletTransactionCallback);
          walletLogger.info('🧹 Removed wallet transaction listener');
        }
      }

      // Stop monitoring services
      if (this.balanceService) {
        await this.balanceService.stopMonitoring();
      }
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
      this.balanceService = null;
      this.transactionMonitoringService = null;
      this.currentWalletName = null;
      this.walletBalanceCallback = null;
      this.walletTransactionCallback = null;

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
    callback: (data: WalletServiceEventData[T]) => void,
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
    callback: (data: WalletServiceEventData[T]) => void,
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
    data: WalletServiceEventData[T],
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
        `Invalid mnemonic word count: ${wordCount}. Must be 12, 15, 18, 21, or 24 words.`,
      );
    }

    return wordCount as 12 | 15 | 18 | 21 | 24;
  }
}

// Create a singleton instance for the React app
export const walletService = new WalletService();
