import { createLogger } from '@kasstamp/utils';
import type {
  IAccountDescriptor,
  ITransactionRecord,
  ITransactionsDataGetRequest,
  ITransactionsDataGetResponse,
  IWalletDescriptor,
  IWalletExportResponse,
  PendingTransaction,
  UtxoEntry,
  Wallet as WasmWallet,
} from '@kasstamp/kaspa_wasm_sdk';
import { NetworkId } from '@kasstamp/kaspa_wasm_sdk';
import type {
  BalanceEvent,
  SimpleWallet,
  TransactionEvent,
  TransactionHistoryOptions,
  TransactionMonitor,
} from '../types';
import type { IEnclaveStorage, ISecureSigningEnclave, SignOptions } from '../signing';
import { createSigningEnclave } from '../signing';
import { AddressDiscoveryService } from './address-generator';

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

  // Secure signing enclave (replaces unsafe mnemonic/walletSecret)
  public readonly signingEnclave: ISecureSigningEnclave;

  // Address discovery service (lazy initialized per account)
  private discoveryServices: Map<string, AddressDiscoveryService> = new Map();

  private transactionMonitors: Map<string, TransactionMonitor> = new Map();
  private transactionListeners: Set<(event: TransactionEvent) => void> = new Set();
  private balanceListeners: Set<(event: BalanceEvent) => void> = new Set();

  // Recursion protection for getUtxos() when discovery is triggered
  private getUtxosRecursionDepth: Map<string, number> = new Map();

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
      } catch (error) {
        walletLogger.error('❌ Failed to load existing accounts:', error as Error);
        // Don't throw here, just log the error
      }
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

      // Handle both object format (mature/pending) and primitive format
      let balance: bigint;
      const balanceValue = response.accountDescriptor.balance;

      if (balanceValue === undefined || balanceValue === null) {
        balance = 0n;
      } else if (
        typeof balanceValue === 'object' &&
        ('mature' in balanceValue || 'pending' in balanceValue)
      ) {
        // Balance is an object with mature/pending properties
        const balanceObj = balanceValue as {
          mature?: bigint | number | string;
          pending?: bigint | number | string;
        };
        const mature = BigInt(balanceObj.mature || 0);
        const pending = BigInt(balanceObj.pending || 0);
        balance = mature + pending;
        walletLogger.debug(`💰 Balance (mature + pending): ${balance.toString()} sompi`, {
          mature: mature.toString(),
          pending: pending.toString(),
        });
      } else {
        // Balance is a primitive (bigint, number, or string)
        balance = BigInt(balanceValue || 0);
        walletLogger.debug(`💰 Balance: ${balance.toString()} sompi`);
      }

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
   * Get UTXOs for a specific account
   *
   * This method collects ALL addresses from the specified account (receive, change, and derived)
   * and queries UTXOs for all of them. This ensures we find UTXOs on any derived address.
   *
   * ## Recursive Address Discovery Pattern
   *
   * This method uses a **recursive discovery pattern** to automatically find UTXOs on addresses
   * that haven't been generated yet. Here's how it works:
   *
   * ### The Problem
   * When a wallet has a balance but UTXOs are not found on the initially known addresses,
   * the UTXOs might be on addresses that haven't been derived yet. Traditional wallets require
   * manual address discovery, but we automate this process.
   *
   * ### The Solution: Recursive Discovery
   * 1. **First call**: Query UTXOs for all currently known addresses
   *    - If UTXOs found → return immediately
   *    - If no UTXOs but balance > 0 → trigger address discovery
   *
   * 2. **Address Discovery**: Generate new addresses (20 receive + 20 change)
   *    - The discovery service is a pure address generator with no UTXO logic
   *    - Simply creates addresses and returns them
   *
   * 3. **Recursive call**: After generating addresses, recursively call `getUtxos()` again
   *    - The new addresses are now in the wallet's internal address list
   *    - The recursive call will query UTXOs for ALL addresses (including newly generated ones)
   *    - If UTXOs are found → return them
   *    - If still no UTXOs → another recursive discovery round can occur (up to MAX_RECURSION_DEPTH)
   *
   * ### Why Recursion Instead of Checking During Discovery?
   *
   * **Previous approach (problematic)**:
   * - Discovery would create addresses, activate account, wait, then check UTXOs
   * - UTXOs were often not immediately available after activation
   * - Required complex timing and multiple activation steps
   * - UTXO checking logic was scattered across discovery and getUtxos
   *
   * **Current approach (recursive)**:
   * - Discovery is pure and simple: just generates addresses
   * - All UTXO checking logic is centralized in `getUtxos()`
   * - After address generation, the wallet's internal UTXO tracker automatically includes new addresses
   * - Recursive call leverages the wallet's built-in address tracking (no explicit activation needed)
   * - Clean separation of concerns: discovery = address generation, getUtxos = UTXO querying
   *
   * ### Recursion Protection
   * To prevent infinite loops, we track recursion depth per account:
   * - Maximum depth: 3 recursive calls (initial call + 2 discovery rounds)
   * - If limit reached, method returns empty array with warning
   * - Recursion depth is properly decremented on all return paths
   *
   * ### Example Flow
   * ```
   * getUtxos() [depth 0]
   *   → No UTXOs found, balance > 0
   *   → discoverAddresses() generates 20 receive + 20 change addresses
   *   → getUtxos() [depth 1] - recursively called
   *     → Queries wallet's internal address list (includes newly generated addresses)
   *     → UTXOs found! → return UTXOs
   * ```
   *
   * @param accountId - The account ID to get UTXOs for
   * @returns Array of all UTXOs from all addresses of this account
   */
  async getUtxos(accountId: string): Promise<Array<UtxoEntry>> {
    if (this.locked) {
      throw new Error('Wallet is locked. Unlock before getting UTXOs.');
    }

    // Recursion protection - prevent infinite loops
    const currentDepth = this.getUtxosRecursionDepth.get(accountId) || 0;
    const MAX_RECURSION_DEPTH = 3; // Allow up to 3 recursive calls (initial + 2 discovery rounds)

    if (currentDepth >= MAX_RECURSION_DEPTH) {
      walletLogger.warn(
        `⚠️ getUtxos recursion limit reached for account ${accountId.slice(0, 8)} (depth: ${currentDepth})`
      );
      return [];
    }

    // Increment recursion depth
    this.getUtxosRecursionDepth.set(accountId, currentDepth + 1);

    try {
      walletLogger.debug(
        `📦 Getting UTXOs for account: ${accountId.slice(0, 8)}... (recursion depth: ${currentDepth})`
      );

      // Get the current account descriptor from WASM wallet
      const accountResponse = await this.wasmWallet.accountsGet({
        accountId,
      });

      if (!accountResponse.accountDescriptor) {
        walletLogger.warn(`📦 Account ${accountId.slice(0, 8)} not found`);
        return [];
      }

      const account = accountResponse.accountDescriptor;

      // Collect ALL addresses from THIS account (receive, change, AND addresses array)
      const allAddresses: string[] = [];

      // Add receive address
      if (account.receiveAddress) {
        allAddresses.push(account.receiveAddress.toString());
      }

      // Add change address
      if (account.changeAddress) {
        allAddresses.push(account.changeAddress.toString());
      }

      // Add all addresses from addresses array (derived addresses!)
      if (account.addresses && Array.isArray(account.addresses)) {
        for (const addr of account.addresses) {
          if (!addr) {
            continue;
          }

          try {
            const addrString = addr.toString();
            if (addrString && addrString.trim() !== '' && addrString.includes(':')) {
              if (!allAddresses.includes(addrString)) {
                allAddresses.push(addrString);
              }
            }
          } catch (err) {
            walletLogger.warn(`⚠️ Failed to process address from addresses array:`, err as Error);
          }
        }

        if (account.addresses.length > 0) {
          walletLogger.debug(
            `📦 Added ${allAddresses.length - (account.receiveAddress ? 1 : 0) - (account.changeAddress ? 1 : 0)} derived addresses from addresses array`
          );
        }
      }

      // If no addresses found, check balance first - might need discovery
      if (allAddresses.length === 0) {
        walletLogger.warn(`📦 No addresses found for account - checking balance for discovery...`);

        // Check balance: if balance > 0 but no addresses, we need discovery
        try {
          const balance = await this.getBalance(accountId);

          if (balance > 0n) {
            walletLogger.info(
              `🔍 Wallet has balance (${Number(balance) / 1e8} KAS) but no addresses found, starting address discovery...`
            );

            try {
              const discoveryService = this.getDiscoveryService(accountId);
              const discoveryResult = await discoveryService.discoverAddresses();

              walletLogger.info(`✅ Address discovery completed`, {
                receiveAddresses: discoveryResult.receive.addresses.size,
                changeAddresses: discoveryResult.change.addresses.size,
              });

              // After discovery, collect discovered addresses and query UTXOs
              const discoveredAddresses: string[] = [];
              for (const address of discoveryResult.receive.addresses.values()) {
                discoveredAddresses.push(address.toString());
              }
              for (const address of discoveryResult.change.addresses.values()) {
                discoveredAddresses.push(address.toString());
              }

              if (discoveredAddresses.length > 0) {
                walletLogger.debug(
                  `📦 Querying UTXOs for ${discoveredAddresses.length} discovered addresses`
                );
                const utxosResponse = await this.wasmWallet.accountsGetUtxos({
                  accountId,
                  addresses: discoveredAddresses,
                });

                if (utxosResponse.utxos && utxosResponse.utxos.length > 0) {
                  // Convert string amounts to BigInt
                  for (const utxo of utxosResponse.utxos) {
                    if (typeof utxo.amount === 'string') {
                      utxo.amount = BigInt(utxo.amount);
                    }
                    if (typeof utxo.blockDaaScore === 'string') {
                      utxo.blockDaaScore = BigInt(utxo.blockDaaScore);
                    }
                  }

                  walletLogger.debug(
                    `✅ Found ${utxosResponse.utxos.length} UTXOs after discovery`
                  );
                  return utxosResponse.utxos;
                }
              }
            } catch (discoveryError) {
              walletLogger.warn(`⚠️ Address discovery failed:`, discoveryError as Error);
            }
          } else {
            walletLogger.debug(`📦 Wallet has no balance, no discovery needed`);
          }
        } catch (balanceError) {
          walletLogger.warn(`⚠️ Failed to check balance:`, balanceError as Error);
        }

        return [];
      }

      walletLogger.debug(`📦 Querying UTXOs for ${allAddresses.length} addresses`);

      // Query UTXOs for ALL addresses of this account
      const utxosResponse = await this.wasmWallet.accountsGetUtxos({
        accountId,
        addresses: allAddresses,
      });

      if (utxosResponse.utxos && utxosResponse.utxos.length > 0) {
        // Convert string amounts to BigInt (WASM SDK sometimes returns strings)
        for (const utxo of utxosResponse.utxos) {
          if (typeof utxo.amount === 'string') {
            utxo.amount = BigInt(utxo.amount);
          }
          if (typeof utxo.blockDaaScore === 'string') {
            utxo.blockDaaScore = BigInt(utxo.blockDaaScore);
          }
        }

        walletLogger.debug(`✅ Found ${utxosResponse.utxos.length} UTXOs`);
        // Decrement recursion depth before returning
        this.getUtxosRecursionDepth.set(accountId, currentDepth);
        return utxosResponse.utxos;
      }

      // No UTXOs found - check balance to decide if we should trigger discovery
      // Only trigger discovery if wallet has balance > 0 but no UTXOs found
      try {
        const balance = await this.getBalance(accountId);

        if (balance > 0n) {
          walletLogger.info(
            `🔍 Wallet has balance (${Number(balance) / 1e8} KAS) but no UTXOs found, starting address discovery...`
          );

          try {
            const discoveryService = this.getDiscoveryService(accountId);

            // Generate addresses (simple batch of 20 receive + 20 change)
            // No UTXO checking in discovery - that's done recursively via getUtxos
            const discoveryResult = await discoveryService.discoverAddresses();

            walletLogger.info(`✅ Address generation completed`, {
              receiveAddresses: discoveryResult.receive.addresses.size,
              changeAddresses: discoveryResult.change.addresses.size,
            });

            // ✅ RECURSIVE CALL: After generating addresses, recursively call getUtxos
            // This will find UTXOs on the newly generated addresses
            // Recursion depth is protected by MAX_RECURSION_DEPTH
            walletLogger.debug(`🔄 Recursively calling getUtxos after address generation...`);
            const recursiveUtxos = await this.getUtxos(accountId);

            if (recursiveUtxos.length > 0) {
              walletLogger.debug(
                `✅ Found ${recursiveUtxos.length} UTXOs via recursive getUtxos call`
              );
              // Decrement recursion depth before returning
              this.getUtxosRecursionDepth.set(accountId, currentDepth);
              return recursiveUtxos;
            }

            if (balance > 0n) {
              walletLogger.warn(
                `⚠️ Address generation completed but still no UTXOs found despite balance > 0. Balance may be pending or UTXOs may be on addresses beyond scan range.`
              );
            }
          } catch (discoveryError) {
            walletLogger.warn(`⚠️ Address discovery failed:`, discoveryError as Error);
          }
        }
      } catch (balanceError) {
        walletLogger.warn(`⚠️ Failed to check balance:`, balanceError as Error);
      }

      // Decrement recursion depth before returning
      this.getUtxosRecursionDepth.set(accountId, currentDepth);
      return [];
    } catch (error) {
      walletLogger.error('❌ Failed to get UTXOs', error as Error);
      // Decrement recursion depth even on error
      const depth = this.getUtxosRecursionDepth.get(accountId);
      if (depth !== undefined && depth > 0) {
        this.getUtxosRecursionDepth.set(accountId, depth - 1);
      }
      return [];
    }
  }

  /**
   * Get address discovery service for an account (lazy initialization)
   */
  private getDiscoveryService(accountId: string): AddressDiscoveryService {
    if (!this.discoveryServices.has(accountId)) {
      this.discoveryServices.set(
        accountId,
        new AddressDiscoveryService(this.wasmWallet, accountId)
      );
    }
    return this.discoveryServices.get(accountId)!;
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

    // Clear address discovery services
    this.discoveryServices.clear();

    // Clear listeners
    this.transactionListeners.clear();
    this.balanceListeners.clear();

    walletLogger.debug('✅ Wallet cleanup completed');
  }
}
