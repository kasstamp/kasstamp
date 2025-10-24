import { createLogger } from '@kasstamp/utils';
import type {
  IAccountDescriptor,
  ITransactionRecord,
  ITransactionsDataGetRequest,
  ITransactionsDataGetResponse,
  IWalletDescriptor,
  IWalletExportResponse,
  PendingTransaction,
  UtxoContext,
  UtxoEntry,
  UtxoEntryReference,
  UtxoProcessor,
  Wallet as WasmWallet,
} from '@kasstamp/kaspa_wasm_sdk';
import { getUtxoContext, getUtxoProcessor, NetworkId } from '@kasstamp/kaspa_wasm_sdk';
import type {
  BalanceEvent,
  SimpleWallet,
  TransactionEvent,
  TransactionHistoryOptions,
  TransactionMonitor,
} from '../types';
import type { IEnclaveStorage, ISecureSigningEnclave, SignOptions } from '../signing';
import { createSigningEnclave } from '../signing';

const walletLogger = createLogger('kasstamp:wallet:simple');

/**
 * Simple wallet implementation with transaction monitoring and secure signing
 */
export class SimpleWalletImpl implements SimpleWallet {
  public readonly wasmWallet: WasmWallet;
  public readonly network: string;
  public accounts: IAccountDescriptor[] = [];
  public locked: boolean = true;
  public readonly descriptor?: IWalletDescriptor;

  // ✅ NEW: Secure signing enclave (replaces unsafe mnemonic/walletSecret)
  public readonly signingEnclave: ISecureSigningEnclave;

  // UTXO management
  private processor?: UtxoProcessor;
  private context?: UtxoContext;

  private transactionMonitors: Map<string, TransactionMonitor> = new Map();
  private transactionListeners: Set<(event: TransactionEvent) => void> = new Set();
  private balanceListeners: Set<(event: BalanceEvent) => void> = new Set();

  constructor(wasmWallet: WasmWallet, network: string, descriptor?: IWalletDescriptor) {
    this.wasmWallet = wasmWallet;
    this.network = network;
    this.descriptor = descriptor;

    // Create secure signing enclave for this wallet
    // Use wallet filename as ID for localStorage persistence (same pattern as WASM wallet)
    const walletId = descriptor?.filename || descriptor?.title || 'default-wallet';

    // Use browser localStorage (or sessionStorage/custom storage in tests)
    const storage: IEnclaveStorage =
      typeof localStorage !== 'undefined'
        ? localStorage
        : {
            getItem: (): string | null => null,
            setItem: (): void => {},
            removeItem: (): void => {},
          };

    this.signingEnclave = createSigningEnclave(storage, walletId);
  }

  /**
   * Initialize the wallet after construction
   * This should be called after the wallet is created to load accounts
   */
  async initialize(): Promise<void> {
    if (!this.locked) {
      try {
        walletLogger.debug('📋 Loading existing accounts...');
        const response = await this.wasmWallet.accountsEnumerate({});
        this.accounts = response.accountDescriptors || [];
        walletLogger.debug(`✅ Loaded ${this.accounts.length} existing accounts`);

        // Initialize UTXO processor and context (like Kasia does)
        await this.initializeUtxoProcessor();
      } catch (error) {
        walletLogger.error('❌ Failed to load existing accounts:', error as Error);
        // Don't throw here, just log the error
      }
    }
  }

  /**
   * Initialize UTXO processor and context (like Kasia does)
   */
  private async initializeUtxoProcessor(): Promise<void> {
    try {
      walletLogger.debug('📦 Initializing UTXO processor and context...');

      // Get the RPC client from the WASM wallet
      // Note: rpc is not in the official WasmWallet type, but exists at runtime
      const rpcClient = (this.wasmWallet as WasmWallet & { rpc?: unknown }).rpc;
      if (!rpcClient) {
        walletLogger.warn('⚠️ No RPC client available for UTXO processor');
        return;
      }

      // Get UtxoProcessor and UtxoContext classes
      const UtxoProcessor = await getUtxoProcessor();
      const UtxoContext = await getUtxoContext();

      // Create UtxoProcessor (like Kasia does)
      this.processor = new UtxoProcessor({
        networkId: this.network,
        rpc: rpcClient,
      });

      // Create UtxoContext (like Kasia does)
      this.context = new UtxoContext({ processor: this.processor });

      // Start the processor (like Kasia does)
      await this.processor.start();

      // Track addresses for UTXO discovery (like Kasia does)
      if (this.accounts.length > 0) {
        const addressesToTrack: string[] = [];

        // Get all addresses from all accounts (receive + change)
        for (const account of this.accounts) {
          if (account.receiveAddress) {
            addressesToTrack.push(account.receiveAddress.toString());
          }
          if (account.changeAddress) {
            addressesToTrack.push(account.changeAddress.toString());
          }
        }

        if (addressesToTrack.length > 0) {
          walletLogger.debug(
            `📦 Tracking ${addressesToTrack.length} addresses for UTXO discovery:`,
            addressesToTrack
          );
          await this.context.trackAddresses(addressesToTrack);
          walletLogger.debug('✅ Addresses tracked for UTXO discovery');
        }
      }

      walletLogger.debug('✅ UTXO processor and context initialized');
    } catch (error) {
      walletLogger.error('❌ Failed to initialize UTXO processor:', error as Error);
    }
  }

  /**
   * Derive and add the next account
   * Note: This is a simplified implementation that relies on the wallet having existing accounts
   * For full account creation, use the SDK's wallet factory methods
   */
  async deriveNextAccount(change: 0 | 1 = 0): Promise<IAccountDescriptor> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before deriving accounts.');
    }

    try {
      walletLogger.debug(`🔑 Getting existing accounts (change: ${change})...`);

      // For now, just return existing accounts
      // Full account creation requires complex private key data setup
      const existingAccounts = await this.getExistingAccounts();

      if (existingAccounts.length === 0) {
        throw new Error(
          'No accounts found. Use SDK wallet factory methods to create accounts with proper private key data.'
        );
      }

      // Return the first available account
      const account = existingAccounts[0];
      walletLogger.debug(`✅ Using existing account: ${account.receiveAddress?.toString()}`);
      return account;
    } catch (error) {
      walletLogger.error('❌ Failed to get account:', error as Error);
      throw error;
    }
  }

  /**
   * Get existing accounts from the wallet
   */
  async getExistingAccounts(): Promise<IAccountDescriptor[]> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting accounts.');
    }

    try {
      walletLogger.debug('📋 Getting existing accounts...');

      const response = await this.wasmWallet.accountsEnumerate({});
      this.accounts = response.accountDescriptors || [];

      walletLogger.debug(`✅ Found ${this.accounts.length} existing accounts`);
      return this.accounts;
    } catch (error) {
      walletLogger.error('❌ Failed to get existing accounts:', error as Error);
      throw error;
    }
  }

  /**
   * Find an account by its address
   */
  getAccountByAddress(address: string): IAccountDescriptor | undefined {
    return this.accounts.find((account) => account.receiveAddress?.toString() === address);
  }

  /**
   * Lock the wallet
   */
  /**
   * Lock wallet
   *
   * This locks BOTH the WASM wallet AND the signing enclave.
   * After locking, unlock() must be called again before signing transactions.
   */
  lock(): void {
    walletLogger.debug('🔒 Locking wallet and signing enclave...');
    this.locked = true;

    // Lock signing enclave (clears encryption key from memory)
    this.signingEnclave.lock();

    // Stop all transaction monitoring
    this.transactionMonitors.forEach((monitor) => {
      monitor.stop().catch((error) => {
        walletLogger.warn('⚠️ Failed to stop transaction monitor:', error as Error);
      });
    });
    this.transactionMonitors.clear();

    walletLogger.debug('✅ Wallet and signing enclave locked');
  }

  /**
   * Unlock the wallet with password
   */
  /**
   * Unlock wallet from password
   *
   * This unlocks BOTH the WASM wallet AND the signing enclave.
   * After unlocking, the wallet can:
   * - Send transactions via accountsSend() (slow, waits for confirmations)
   * - Sign transactions via signTransaction() (fast, transaction chaining)
   */
  async unlockFromPassword(password: string): Promise<void> {
    if (!this.locked) {
      walletLogger.debug('⚠️ Wallet is already unlocked');
      return;
    }

    try {
      walletLogger.debug('🔓 Unlocking wallet and signing enclave...');

      // Load existing accounts from WASM wallet
      walletLogger.debug('📋 Getting existing accounts...');
      const response = await this.wasmWallet.accountsEnumerate({});
      const accounts = response.accountDescriptors || [];

      // Unlock signing enclave (if mnemonic is stored)
      if (this.signingEnclave.hasMnemonic()) {
        await this.signingEnclave.unlock({
          password,
          autoLockMs: 30 * 60 * 1000, // Auto-lock after 30 minutes
        });
      }

      // Set unlocked state and accounts
      this.locked = false;
      this.accounts = accounts;

      walletLogger.debug(`✅ Found ${accounts.length} existing accounts`);
      walletLogger.debug('✅ Wallet and signing enclave unlocked successfully');
    } catch (error) {
      walletLogger.error('❌ Failed to unlock wallet:', error as Error);
      throw error;
    }
  }

  /**
   * Export wallet to encrypted keystore
   */
  async toEncryptedKeystore(
    _password: string,
    _meta?: Record<string, unknown>
  ): Promise<IWalletExportResponse> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before exporting.');
    }

    try {
      walletLogger.debug('📤 Exporting wallet to encrypted keystore...');

      // Note: We no longer have walletSecret on this object
      // The WASM wallet should already be unlocked if we're calling this
      const response = await this.wasmWallet.walletExport({
        walletSecret: '', // Empty string - WASM wallet is already unlocked
        includeTransactions: false,
      });

      walletLogger.debug('✅ Wallet exported successfully');
      // Note: meta parameter is ignored - WASM SDK IWalletExportResponse only includes walletData
      // Store metadata separately if needed
      return response;
    } catch (error) {
      walletLogger.error('❌ Failed to export wallet:', error as Error);
      throw error;
    }
  }

  /**
   * Get wallet balance for an account
   */
  async getBalance(accountId: string): Promise<bigint> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting balance.');
    }

    try {
      walletLogger.debug(`💰 Getting balance for account: ${accountId}`);

      const response = await this.wasmWallet.accountsGet({
        accountId,
      });

      if (!response.accountDescriptor) {
        throw new Error('Account not found');
      }

      const balance = response.accountDescriptor.balance || 0n;
      walletLogger.debug(`💰 Balance: ${balance.toString()} sompi`);
      return balance;
    } catch (error) {
      walletLogger.error('❌ Failed to get balance:', error as Error);
      throw error;
    }
  }

  /**
   * Send transaction using WASM wallet
   */
  async sendTransaction(request: {
    accountId: string;
    walletSecret: string;
    destination: Array<{ address: string; amount: bigint }>;
    priorityFeeSompi?: { amount: bigint; source: number };
  }): Promise<{ transactionIds: string[] }> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before sending transactions.');
    }

    try {
      walletLogger.debug(`💸 Sending transaction from account: ${request.accountId}`);

      const response = await this.wasmWallet.accountsSend({
        accountId: request.accountId,
        walletSecret: request.walletSecret,
        destination: request.destination,
        priorityFeeSompi: request.priorityFeeSompi,
      });

      walletLogger.debug(`✅ Transaction sent! IDs: ${response.transactionIds.join(', ')}`);
      return response;
    } catch (error) {
      walletLogger.error('❌ Failed to send transaction:', error as Error);
      throw error;
    }
  }

  /**
   * Get transaction history for an account
   */
  async getTransactionHistory(
    accountId: string,
    options?: TransactionHistoryOptions
  ): Promise<ITransactionRecord[]> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting transaction history.');
    }

    try {
      walletLogger.debug(`📋 Getting transaction history for account: ${accountId}`);

      // First, try to activate the account to ensure it's properly synced
      try {
        walletLogger.debug(`📋 Activating account for transaction history...`);
        await this.wasmWallet.accountsActivate({ accountIds: [accountId] });
        walletLogger.debug(`✅ Account activated successfully`);
      } catch (activationError) {
        walletLogger.warn('⚠️ Failed to activate account:', activationError as Error);
      }

      // Create proper NetworkId object
      const networkId = new NetworkId(this.network);

      const request: ITransactionsDataGetRequest = {
        accountId,
        networkId,
        start: options?.start || 0n,
        end: options?.end || 20n, // Use same page size as official wallet (20)
      };

      const response: ITransactionsDataGetResponse =
        await this.wasmWallet.transactionsDataGet(request);

      walletLogger.debug(`📋 Response details:`, {
        accountId: response.accountId,
        start: response.start,
        total: response.total,
        transactionsCount: response.transactions?.length || 0,
      });

      // Check if wallet is synced by looking at total count
      if (response.total === 0n) {
        walletLogger.debug(
          '📋 Wallet appears to be not yet synced (total: 0). This is normal for new wallets.'
        );
        walletLogger.debug(
          '📋 The wallet needs to synchronize with the network before transaction history is available.'
        );
        walletLogger.debug(
          '📋 This process can take a few minutes depending on network conditions.'
        );
        return [];
      }

      walletLogger.debug(`✅ Retrieved ${response.transactions?.length || 0} transactions`);
      return response.transactions || [];
    } catch (error) {
      walletLogger.error('❌ Failed to get transaction history:', error as Error);
      throw error;
    }
  }

  /**
   * Get UTXOs for an account using UtxoContext (like Kasia does)
   * This is a synchronous query of current wallet state - does NOT wait for discovery
   * If you need to wait for UTXOs, call waitForUtxos() instead
   * @param accountId - The account ID to get UTXOs for
   * @returns Array of UTXOs - either UtxoEntry instances from accountsGetUtxos or IUtxoEntry-compatible objects from UtxoContext
   */
  async getUtxos(accountId: string): Promise<Array<UtxoEntry>> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting UTXOs.');
    }

    try {
      walletLogger.debug(`📦 Getting UTXOs for account: ${accountId}`);

      // Get the account to find the address
      const account = this.accounts.find((acc) => acc.accountId === accountId);
      if (!account || !account.receiveAddress) {
        walletLogger.debug('📦 No receive address found for account');
        return [];
      }

      const address = account.receiveAddress.toString();
      walletLogger.debug(`📦 Looking for UTXOs for address: ${address}`);

      // Try to get UTXOs from our own UtxoContext (like Kasia does)
      try {
        if (this.context) {
          walletLogger.debug('📦 Found our UtxoContext, checking for UTXOs...');

          // Get mature UTXOs (like Kasia does)
          if (this.context.getMatureRange && this.context.matureLength !== undefined) {
            const matureUtxos = this.context.getMatureRange(0, this.context.matureLength);
            walletLogger.debug(
              `📦 Found ${matureUtxos?.length || 0} mature UTXOs from our context`
            );

            // Get pending UTXOs as well
            let pendingUtxos: UtxoEntryReference[] = [];
            if (this.context.getPending) {
              pendingUtxos = this.context.getPending() || [];
              walletLogger.debug(`📦 Found ${pendingUtxos.length} pending UTXOs from our context`);
            }

            // Combine mature and pending UTXOs
            const allUtxos = [...(matureUtxos || []), ...pendingUtxos];
            walletLogger.debug(
              `📦 Total UTXOs from our context: ${allUtxos.length} (${matureUtxos?.length || 0} mature + ${pendingUtxos.length} pending)`
            );

            if (allUtxos.length > 0) {
              walletLogger.debug(`📦 Returning ${allUtxos.length} UTXOs from context`);
              // UtxoEntryReference is compatible with UtxoEntry
              return allUtxos as UtxoEntry[];
            }
          } else {
            walletLogger.debug(
              '📦 Our UtxoContext found but getMatureRange or matureLength not available'
            );
          }
        } else {
          walletLogger.debug(
            '📦 No UtxoContext available - need to initialize UTXO processor first'
          );
        }
      } catch (contextError) {
        walletLogger.warn('📦 Failed to get UTXOs from our context:', contextError as Error);
      }

      // If context doesn't have enough UTXOs, try to refresh it
      if (
        this.context &&
        this.context.matureLength !== undefined &&
        this.context.matureLength < 2
      ) {
        walletLogger.debug('📦 Context has limited UTXOs, trying to refresh tracking...');
        try {
          // Re-track addresses to ensure we have all UTXOs
          const addressesToTrack: string[] = [];
          for (const account of this.accounts) {
            if (account.receiveAddress) {
              addressesToTrack.push(account.receiveAddress.toString());
            }
            if (account.changeAddress) {
              addressesToTrack.push(account.changeAddress.toString());
            }
          }

          if (addressesToTrack.length > 0) {
            walletLogger.debug('📦 Re-tracking addresses for better UTXO discovery...');
            await this.context.trackAddresses(addressesToTrack);

            // Try again after re-tracking
            const matureUtxos = this.context.getMatureRange(0, this.context.matureLength);
            const pendingUtxos = this.context.getPending() || [];
            const allUtxos = [...(matureUtxos || []), ...pendingUtxos];

            if (allUtxos.length > 0) {
              walletLogger.debug(`📦 Found ${allUtxos.length} UTXOs after re-tracking`);
              return allUtxos;
            }
          }
        } catch (refreshError) {
          walletLogger.warn('📦 Failed to refresh UTXO context:', refreshError as Error);
        }
      }

      // Try multiple approaches to get UTXOs
      try {
        walletLogger.debug(`📦 Calling accountsGetUtxos for account: ${accountId}`);

        // Get addresses from our cached accounts array first (more reliable)
        const allAddresses: string[] = [];
        const account = this.accounts.find((acc) => acc.accountId === accountId);

        if (account) {
          walletLogger.debug(`📦 Using addresses from cached account`);
          if (account.receiveAddress) {
            allAddresses.push(account.receiveAddress.toString());
          }
          if (account.changeAddress) {
            allAddresses.push(account.changeAddress.toString());
          }
        } else {
          // Fallback: Try to get addresses from accountsGet
          walletLogger.debug(`📦 Getting all addresses for account from WASM wallet: ${accountId}`);
          const accountResponse = await this.wasmWallet.accountsGet({
            accountId,
          });

          if (accountResponse.accountDescriptor) {
            // Add receive address
            if (accountResponse.accountDescriptor.receiveAddress) {
              allAddresses.push(accountResponse.accountDescriptor.receiveAddress.toString());
            }
            // Add change address if available
            if (accountResponse.accountDescriptor.changeAddress) {
              allAddresses.push(accountResponse.accountDescriptor.changeAddress.toString());
            }
          }
        }

        walletLogger.debug(`📦 Found ${allAddresses.length} addresses for account:`, allAddresses);

        // Approach 2: Try with all addresses
        const utxosResponse = await this.wasmWallet.accountsGetUtxos({
          accountId,
          addresses: allAddresses,
        });

        walletLogger.debug(`📦 accountsGetUtxos response:`, {
          utxosCount: utxosResponse.utxos?.length || 0,
          hasUtxos: !!utxosResponse.utxos,
          utxosType: typeof utxosResponse.utxos,
        });

        // If we got UTXOs, return them
        if (utxosResponse.utxos && utxosResponse.utxos.length > 0) {
          walletLogger.debug(`📦 Found ${utxosResponse.utxos.length} UTXOs from wallet state`);

          // Debug: Log the actual UTXO details

          // ✅ CRITICAL FIX: Convert string amounts to bigint for WASM SDK compatibility
          // accountsGetUtxos returns string values, but createTransactions needs bigint
          const utxosWithBigint = utxosResponse.utxos.map((utxo) => ({
            ...utxo,
            amount: typeof utxo.amount === 'string' ? BigInt(utxo.amount) : utxo.amount,
            blockDaaScore:
              typeof utxo.blockDaaScore === 'string'
                ? BigInt(utxo.blockDaaScore)
                : utxo.blockDaaScore,
          }));

          return utxosWithBigint as UtxoEntry[];
        }

        // Approach 3: Try with just the receive address as fallback
        walletLogger.debug(
          `📦 No UTXOs found with all addresses, trying with receive address only: ${address}`
        );
        const utxosResponseWithAddress = await this.wasmWallet.accountsGetUtxos({
          accountId,
          addresses: [address],
        });

        walletLogger.debug(`accountsGetUtxos with address response`, {
          utxosCount: utxosResponseWithAddress.utxos?.length || 0,
          hasUtxos: !!utxosResponseWithAddress.utxos,
        });

        if (utxosResponseWithAddress.utxos && utxosResponseWithAddress.utxos.length > 0) {
          walletLogger.debug(
            `📦 Found ${utxosResponseWithAddress.utxos.length} UTXOs with address filter`
          );

          // ✅ CRITICAL FIX: Convert string amounts to bigint for WASM SDK compatibility
          // accountsGetUtxos returns string values, but createTransactions needs bigint
          const utxosWithBigint = utxosResponseWithAddress.utxos.map((utxo) => ({
            ...utxo,
            amount: typeof utxo.amount === 'string' ? BigInt(utxo.amount) : utxo.amount,
            blockDaaScore:
              typeof utxo.blockDaaScore === 'string'
                ? BigInt(utxo.blockDaaScore)
                : utxo.blockDaaScore,
          }));

          return utxosWithBigint as UtxoEntry[];
        }

        walletLogger.debug('📦 No UTXOs found with any approach');
        walletLogger.debug(
          '💡 Tip: If wallet has a balance but no UTXOs, try calling waitForUtxos() to wait for discovery'
        );
        return [];
      } catch (walletError) {
        walletLogger.warn('Failed to get UTXOs from wallet state', walletError as Error);
        return [];
      }
    } catch (error) {
      walletLogger.error('❌ Failed to get UTXOs:', error as Error);
      // If all else fails, return empty array
      walletLogger.debug('📦 No UTXOs found from any source');
      return [];
    }
  }

  /**
   * Check if the wallet is synced with the network
   */
  isSynced(): boolean {
    return this.wasmWallet.isSynced;
  }

  /**
   * Wait for the wallet to be synced with the network
   */
  async waitForSync(timeoutMs: number = 60000): Promise<boolean> {
    if (this.isSynced()) {
      walletLogger.debug('✅ Wallet is already synced');
      return true;
    }

    walletLogger.debug('⏳ Waiting for wallet to sync...');

    return new Promise((resolve) => {
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (checkInterval) clearInterval(checkInterval);
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        cleanup();
        walletLogger.debug('⏰ Timeout waiting for wallet sync');
        resolve(false);
      }, timeoutMs);

      // Check sync status periodically
      const checkInterval = setInterval(() => {
        if (this.isSynced()) {
          walletLogger.debug('✅ Wallet sync completed!');
          cleanup();
          resolve(true);
        }
      }, 1000); // Check every second
    });
  }

  /**
   * Get transaction count for an account
   */
  async getTransactionCount(accountId: string): Promise<number> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting transaction count.');
    }

    try {
      walletLogger.debug(`📊 Getting transaction count for account: ${accountId}`);

      const request: ITransactionsDataGetRequest = {
        accountId,
        networkId: new NetworkId(this.network),
        start: 0n,
        end: 1n, // Just get 1 transaction to check total count
      };

      const response: ITransactionsDataGetResponse =
        await this.wasmWallet.transactionsDataGet(request);

      const count = Number(response.total || 0);
      walletLogger.debug(`✅ Transaction count: ${count}`);
      return count;
    } catch (error) {
      walletLogger.error('❌ Failed to get transaction count:', error as Error);
      throw error;
    }
  }

  /**
   * Add transaction update listener
   */
  onTransactionUpdate(callback: (event: TransactionEvent) => void): void {
    this.transactionListeners.add(callback);
  }

  /**
   * Add balance update listener
   */
  onBalanceUpdate(callback: (event: BalanceEvent) => void): void {
    this.balanceListeners.add(callback);
  }

  /**
   * Remove transaction update listener
   */
  removeTransactionListener(callback: (event: TransactionEvent) => void): void {
    this.transactionListeners.delete(callback);
  }

  /**
   * Remove balance update listener
   */
  removeBalanceListener(callback: (event: BalanceEvent) => void): void {
    this.balanceListeners.delete(callback);
  }

  /**
   * Sign a transaction using the secure enclave (fast transaction chaining)
   *
   * This is for fast stamping and transaction chaining that bypasses
   * the WASM wallet's accountsSend() method (which waits for confirmations).
   *
   * The mnemonic and private key exist in memory ONLY during signing (~0.2s),
   * then are immediately cleared.
   *
   * @param transaction - PendingTransaction to sign
   * @param options - Key derivation options
   * @throws Error if wallet or enclave is locked
   */
  async signTransaction(transaction: PendingTransaction, options?: SignOptions): Promise<void> {
    if (this.locked) {
      throw new Error('Wallet is locked. Call unlockFromPassword() first.');
    }

    if (this.signingEnclave.isLocked()) {
      throw new Error('Signing enclave is locked. Call unlockFromPassword() first.');
    }

    // Delegate to signing enclave (secure closure-based signing)
    await this.signingEnclave.sign(transaction, options);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    walletLogger.debug('🧹 Cleaning up wallet resources...');

    // Clear signing enclave
    this.signingEnclave.clear();

    // Stop all transaction monitoring
    for (const [accountId, monitor] of this.transactionMonitors) {
      try {
        await monitor.stop();
      } catch (error) {
        walletLogger.warn(`Failed to stop monitor for account ${accountId}`, error as Error);
      }
    }
    this.transactionMonitors.clear();

    // Clear listeners
    this.transactionListeners.clear();
    this.balanceListeners.clear();

    walletLogger.debug('✅ Wallet cleanup completed');
  }
}
