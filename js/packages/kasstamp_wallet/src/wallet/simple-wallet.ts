import { createLogger } from '@kasstamp/utils';
import {
  Address,
  addressFromScriptPublicKey,
  ConnectStrategy,
  IAccountDescriptor,
  IBalanceEvent,
  IConnectOptions,
  IScriptPublicKey,
  ISerializableTransactionOutput,
  IWalletDescriptor,
  Mnemonic,
  NetworkId,
  PendingTransaction,
  Resolver,
  TransactionRecord,
  UtxoContext,
  UtxoEntry,
  UtxoProcessor,
  Wallet as WasmWallet,
} from '@kasstamp/kaspa_wasm_sdk';
import type { Network } from '../types';
import type { IEnclaveStorage, ISecureSigningEnclave, SignOptions } from '../signing';
import { createSigningEnclave } from '../signing';
import { AddressDiscoveryService } from './address-generator';
import type { SDKWalletConfig } from '../types/wallet-config';

const walletLogger = createLogger('kasstamp:wallet:simple');

/**
 * Events emitted by SimpleWallet
 */
export enum SimpleWalletEventType {
  BalanceChanged = 'balance-changed',
}

/**
 * SimpleWallet notification callback type
 * Receives the event type enum value directly
 * Callback can handle multiple event types - check the event type inside the callback
 */
export type SimpleWalletNotificationCallback = (event: SimpleWalletEventType) => void;

/**
 * Simple wallet implementation with transaction monitoring and secure signing
 *
 * This class encapsulates ALL wallet lifecycle management:
 * - Wallet creation (from mnemonic or random)
 * - Wallet import from mnemonic
 * - Wallet opening from storage
 * - RPC connection and initialization
 * - Account management
 * - UTXO tracking and address discovery
 *
 * All wallet operations should go through this class.
 */
export class SimpleWallet {
  public readonly wasmWallet: WasmWallet;
  public readonly network: NetworkId;
  public readonly descriptor?: IWalletDescriptor;

  // Secure signing enclave (replaces unsafe mnemonic/walletSecret)
  public readonly signingEnclave: ISecureSigningEnclave;

  // UTXO management
  private readonly utxoProcessor: UtxoProcessor;
  private readonly utxoContext: UtxoContext;

  // Address discovery service (lazy initialized per account)
  private discoveryServices: Map<string, AddressDiscoveryService> = new Map();

  // CRITICAL: Track address -> key derivation mapping for efficient signing
  // Maps address string to { accountIndex, addressIndex, isReceive }
  // This allows us to directly derive keys without scanning 0-500 indices
  private addressToDerivation: Map<
    string,
    { accountIndex: number; addressIndex: number; isReceive: boolean }
  > = new Map();

  // Recursion protection for getUtxos() when discovery is triggered
  private getUtxosRecursionDepth: Map<string, number> = new Map();
  // Ensure initialize() is idempotent
  private initialized: boolean = false;

  // Event system - single listener that receives all events
  // The callback can check the event type internally to handle different events
  private eventListener: SimpleWalletNotificationCallback | null = null;

  // Flag to prevent multiple simultaneous discovery runs
  private isDiscoveringAddresses: boolean = false;

  /**
   * Private constructor - use static factory methods instead:
   * - SimpleWallet.create() - Create new wallet with random mnemonic
   * - SimpleWallet.createFromMnemonic() - Import wallet from mnemonic
   * - SimpleWallet.open() - Open existing wallet from storage
   */
  private constructor(wasmWallet: WasmWallet, network: NetworkId, descriptor?: IWalletDescriptor) {
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

    // Get UtxoProcessor and UtxoContext classes
    const rpcClient = this.wasmWallet.rpc;

    this.utxoProcessor = new UtxoProcessor({ rpc: rpcClient, networkId: network });
    this.utxoContext = new UtxoContext({ processor: this.utxoProcessor });

    // Set up event listeners for UTXO processor balance events
    this.setupUtxoProcessorListeners();
  }

  /**
   * Set up listeners for UTXO processor events (balance changes, etc.)
   *
   * SIMPLIFIED APPROACH:
   * - Listen to transaction events (pending, maturity, discovery) and extract addresses directly
   * - Listen to balance events and emit them (no complex state tracking)
   * - If balance is 0, trigger discovery (simple fallback)
   */
  private setupUtxoProcessorListeners(): void {
    this.utxoProcessor.addEventListener((event) => {
      try {
        // SIMPLE: Extract addresses from transaction events and track them
        // This handles both tracked and untracked addresses automatically
        if (event.type === 'pending' || event.type === 'maturity' || event.type === 'discovery') {
          const transactionRecord = event.data as TransactionRecord;
          if (transactionRecord) {
            // Extract addresses from transaction outputs and track any new addresses
            // This is the primary mechanism - much simpler than complex state tracking
            void this.extractAndTrackAddressesFromTransaction(transactionRecord);
          }
        }

        // SIMPLE: Just emit balance changes - no complex logic needed
        // Address tracking from transactions should prevent most issues
        if (event.type === 'balance') {
          const balanceEvent = event.data as IBalanceEvent;

          if (balanceEvent && balanceEvent.balance) {
            // Convert to BigInt explicitly to avoid mixing types
            const mature = BigInt(balanceEvent.balance.mature ?? 0);
            const pending = BigInt(balanceEvent.balance.pending ?? 0);
            const outgoing = BigInt(balanceEvent.balance.outgoing ?? 0);
            const total = mature + pending - outgoing;

            walletLogger.debug('UTXO balance changed', {
              mature: mature.toString(),
              pending: pending.toString(),
              outgoing: outgoing.toString(),
              total: total.toString(),
            });

            // SIMPLE FALLBACK: If balance is 0, trigger discovery (no suppression needed)
            // Address extraction from transactions should handle most cases, but this is a safety net
            if (total === 0n && !this.isDiscoveringAddresses) {
              walletLogger.info('🔍 Balance is 0, triggering discovery as fallback');
              void this.triggerDiscoveryOnZeroBalance();
            }

            // Emit balance-changed event (always - no suppression)
            walletLogger.debug('📤 Emitting balance-changed event to listeners', {
              mature,
              pending,
              outgoing,
              total,
            });
            this.emit(SimpleWalletEventType.BalanceChanged);
          }
        }
      } catch (error) {
        walletLogger.warn('Error processing UTXO processor event', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          eventType: event?.type,
          eventData: event?.data,
        });
      }
    });

    walletLogger.debug('UTXO processor event listeners set up');
  }

  /**
   * Add event listener for wallet events (type-safe)
   *
   * This sets a single listener that receives all event types.
   * Check the event type inside the callback to handle different events.
   *
   * @param callback - Callback function that receives all event types
   *
   * @example
   * ```typescript
   * wallet.addEventListener((event) => {
   *   if (event === SimpleWalletEventType.BalanceChanged) {
   *     // Balance has changed - call getBalance() if you need the actual balance
   *     const balance = await wallet.getBalance();
   *     console.log('New balance:', balance);
   *   }
   *   // Handle other event types in the future
   * });
   * ```
   */
  addEventListener(callback: SimpleWalletNotificationCallback): void {
    walletLogger.debug('🔧 Adding event listener', {
      hadPreviousListener: !!this.eventListener,
      walletLocked: this.signingEnclave.isLocked(),
    });
    this.eventListener = callback;
    walletLogger.debug('✅ Event listener added successfully (receives all event types)', {
      hasListener: !!this.eventListener,
    });
  }

  /**
   * Remove event listener
   */
  removeEventListener(): void {
    this.eventListener = null;
    walletLogger.debug('Event listener removed');
  }

  /**
   * Emit an event to the registered listener (type-safe)
   *
   * @param event - Event type from SimpleWalletEventType enum
   */
  private emit(event: SimpleWalletEventType): void {
    if (this.eventListener) {
      walletLogger.debug(`📤 Emitting event: ${event}`, {
        hasListener: true,
        eventType: event,
      });
      try {
        this.eventListener(event);
        walletLogger.debug(`✅ Event listener called successfully for ${event}`);
      } catch (error) {
        walletLogger.error(`❌ Error in event listener for ${event}`, error as Error);
      }
    } else {
      walletLogger.debug(`⚠️ No event listener registered for event: ${event}`);
    }
  }

  /**
   * Connect WASM wallet to RPC
   */
  private async connectToRpc(): Promise<void> {
    try {
      walletLogger.debug('Connecting wallet to RPC');

      const connectOptions: IConnectOptions = {
        blockAsyncConnect: true,
        strategy: ConnectStrategy.Retry,
        timeoutDuration: 5000,
        retryInterval: 2000,
      };

      await this.wasmWallet.connect(connectOptions);
      walletLogger.debug('Wallet connected to RPC successfully');
    } catch (error) {
      walletLogger.error('Failed to connect wallet to RPC', error as Error);
      throw error;
    }
  }

  /**
   * Create a new wallet with randomly generated mnemonic
   *
   * This is the central factory method for wallet creation.
   * All wallet creation logic is encapsulated here.
   */
  static async create(
    options: SDKWalletConfig
  ): Promise<{ wallet: SimpleWallet; mnemonic: string }> {
    walletLogger.info('Creating new wallet', {
      walletName: options.name,
      network: options.network,
    });

    const wasmWalletInstance = new WasmWallet({
      resident: false,
      networkId: new NetworkId(options.network),
      resolver: new Resolver(),
    });

    const networkSuffix = options.network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${options.name}-${networkSuffix}`;

    const createResponse = await wasmWalletInstance.walletCreate({
      walletSecret: options.walletSecret,
      filename: filenameWithNetwork,
      title: options.name,
      overwriteWalletStorage: true,
    });

    const actualFilename = createResponse.walletDescriptor.filename;
    const descriptor: IWalletDescriptor = {
      filename: actualFilename,
      title: options.name,
    };

    const wallet = new SimpleWallet(wasmWalletInstance, new NetworkId(options.network), descriptor);

    const mnemonic = Mnemonic.random(options.words);
    const mnemonicPhrase = mnemonic.phrase;

    await wallet.signingEnclave.storeMnemonic({
      mnemonic: mnemonicPhrase,
      password: options.walletSecret,
      bip39Passphrase: options.passphrase,
    });

    await wasmWalletInstance.start();

    const openResponse = await wasmWalletInstance.walletOpen({
      walletSecret: options.walletSecret,
      filename: actualFilename,
      accountDescriptors: true,
    });

    const accountDescriptors = openResponse.accountDescriptors || [];

    if (accountDescriptors.length === 0) {
      const prvKeyDataResponse = await wasmWalletInstance.prvKeyDataCreate({
        walletSecret: options.walletSecret,
        name: 'Main Key',
        mnemonic: mnemonicPhrase,
        kind: 'mnemonic',
        paymentSecret: options.passphrase || undefined,
      });

      await wasmWalletInstance.accountsCreate({
        walletSecret: options.walletSecret,
        type: 'bip32',
        accountName: 'Main Account',
        accountIndex: 0,
        prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
        paymentSecret: options.passphrase || undefined,
      });
    }

    await wallet.connectToRpc();

    return { wallet, mnemonic: mnemonicPhrase };
  }

  /**
   * Import wallet from existing mnemonic
   *
   * This is the central factory method for wallet import.
   */
  static async createFromMnemonic(
    mnemonic: string,
    options: SDKWalletConfig
  ): Promise<SimpleWallet> {
    walletLogger.info('Importing wallet from mnemonic', {
      walletName: options.name,
      network: options.network,
    });

    const networkId = new NetworkId(options.network);
    const wasmWalletInstance = new WasmWallet({
      resident: false,
      networkId,
      resolver: new Resolver(),
    });

    const networkSuffix = options.network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${options.name}-${networkSuffix}`;

    let createResponse;
    try {
      createResponse = await wasmWalletInstance.walletCreate({
        walletSecret: options.walletSecret,
        filename: filenameWithNetwork,
        title: options.name,
        overwriteWalletStorage: false,
      });
    } catch (createError) {
      const errorMessage = createError instanceof Error ? createError.message : String(createError);
      if (errorMessage.includes('already exists') || errorMessage.includes('exists')) {
        createResponse = {
          walletDescriptor: {
            filename: filenameWithNetwork,
            title: options.name,
          },
        };
      } else {
        throw createError;
      }
    }

    const actualFilename = createResponse.walletDescriptor.filename;
    await wasmWalletInstance.start();

    const openResponse = await wasmWalletInstance.walletOpen({
      walletSecret: options.walletSecret,
      filename: actualFilename,
      accountDescriptors: true,
    });

    const accountDescriptors = openResponse.accountDescriptors || [];

    let existingAccountIndex0 = accountDescriptors.find((acc) => {
      const idx = acc.accountIndex;
      return (
        idx === 0 ||
        idx === 0n ||
        idx === '0' ||
        (typeof idx === 'bigint' && idx === BigInt(0)) ||
        (typeof idx === 'number' && idx === 0)
      );
    });

    if (!existingAccountIndex0 && accountDescriptors.length === 1) {
      existingAccountIndex0 = accountDescriptors[0];
    }

    if (!existingAccountIndex0) {
      const prvKeyDataResponse = await wasmWalletInstance.prvKeyDataCreate({
        walletSecret: options.walletSecret,
        mnemonic,
        paymentSecret: options.passphrase || undefined,
        kind: 'mnemonic',
      });

      await wasmWalletInstance.accountsCreate({
        walletSecret: options.walletSecret,
        type: 'bip32',
        accountName: 'Main Account',
        accountIndex: 0,
        prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
        paymentSecret: options.passphrase || undefined,
      });
    }

    const descriptor: IWalletDescriptor = {
      filename: actualFilename,
      title: options.name,
    };

    const wallet = new SimpleWallet(wasmWalletInstance, networkId, descriptor);

    await wallet.signingEnclave.storeMnemonic({
      mnemonic,
      password: options.walletSecret,
      bip39Passphrase: options.passphrase,
    });

    await wallet.connectToRpc();

    return wallet;
  }

  /**
   * Open an existing wallet from storage
   *
   * This is the central factory method for opening wallets.
   */
  static async open(
    walletName: string,
    walletSecret: string,
    network: Network
  ): Promise<SimpleWallet> {
    walletLogger.info('Opening existing wallet', {
      walletName,
      network,
    });

    if (!walletSecret) {
      throw new Error('walletSecret is required for wallet operations');
    }

    const networkSuffix = network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${walletName}-${networkSuffix}`;

    const networkId = new NetworkId(network);
    const wasmWalletInstance = new WasmWallet({
      resident: false,
      networkId,
      resolver: new Resolver(),
    });

    await wasmWalletInstance.walletOpen({
      walletSecret,
      filename: filenameWithNetwork,
      accountDescriptors: true,
    });

    await wasmWalletInstance.start();

    const descriptor: IWalletDescriptor = {
      filename: filenameWithNetwork,
      title: walletName,
    };

    const wallet = new SimpleWallet(wasmWalletInstance, networkId, descriptor);

    await wallet.connectToRpc();

    return wallet;
  }

  /**
   * Initialize the wallet after construction
   * This should be called after the wallet is created to load accounts
   *
   * NOTE: This calls startUtxoProcessor() which does NOT clear event listeners.
   * Event listeners are only cleared when stopUtxoProcessor() is called (during lock()).
   * External listeners should call addEventListener() after unlock/initialize completes.
   */
  async initialize(): Promise<void> {
    try {
      if (this.initialized) {
        walletLogger.warn('⚠️ initialize() called more than once – ignoring duplicate call');
        return;
      }
      // Initialize UTXO processor and context
      await this.startUtxoProcessor();
      this.initialized = true;

      walletLogger.debug('✅ Wallet initialized', {
        hasEventListener: !!this.eventListener,
        note: 'External listeners should call addEventListener() after initialize()',
      });
    } catch (error) {
      walletLogger.error('❌ Failed to load existing accounts:', error as Error);
      // Don't throw here, just log the error
    }
  }

  /**
   * Get the wallet account.
   *
   * Always returns the first account. We only ever create one account.
   * If multiple accounts exist, throws an error.
   *
   * @returns The first (and only expected) account descriptor
   * @throws Error if no accounts found or multiple accounts found
   */
  public async getWalletAccount(): Promise<IAccountDescriptor> {
    const response = await this.wasmWallet.accountsEnumerate({});
    const accounts = response.accountDescriptors || [];

    if (accounts.length === 0) {
      throw new Error('No accounts found in wallet');
    }

    if (accounts.length > 1) {
      throw new Error(
        `Multiple accounts found in wallet (expected only one). Found ${accounts.length} accounts. ` +
          `We only ever create one account. This is an unexpected state.`
      );
    }

    // Exactly one account (expected case)
    return accounts[0];
  }

  /**
   * Get the deterministic primary addresses (receive[0] and change[0]) for the wallet.
   *
   * This method derives addresses at index 0 from the stored mnemonic, ensuring
   * consistent addresses regardless of what the WASM SDK account descriptor reports.
   *
   * IMPORTANT: The account descriptor's receiveAddress/changeAddress may change
   * dynamically based on usage. This method always returns the deterministic addresses
   * at index 0, which should be used for stamping and change outputs.
   *
   * @returns Primary receive and change addresses at index 0
   * @throws Error if enclave is locked or mnemonic is not available
   */
  public async getPrimaryAddresses(): Promise<{ receiveAddress: string; changeAddress: string }> {
    // Use the signing enclave to derive primary addresses deterministically
    // This ensures we always get the same addresses at index 0, regardless of
    // what the WASM SDK account descriptor reports
    return await this.signingEnclave.derivePrimaryAddresses(this.network, 0);
  }

  /**
   * Initialize UTXO processor and context, then perform address discovery.
   *
   * Always performs address discovery to find UTXOs:
   * 1. Starts UTXO processor first
   * 2. Tracks primary addresses and checks for balance
   * 3. If no balance found, discovers additional addresses up to 500 limit
   * 4. Tracks all addresses with balance in UTXO context
   */
  private async startUtxoProcessor(): Promise<void> {
    try {
      walletLogger.debug('📦 Initializing UTXO processor and context...');

      // CRITICAL: Always start UTXO processor first before address discovery
      if (!this.utxoProcessor.isActive) {
        walletLogger.debug('📦 Starting UTXO processor...');
        await this.utxoProcessor.start();
        // Wait for processor start event or readiness
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            walletLogger.warn('⚠️ Timed out waiting for utxo-proc-start event, proceeding anyway');
            resolve();
          }, 10000);

          try {
            // If it became active meanwhile, resolve immediately
            if (this.utxoProcessor.isActive) {
              clearTimeout(timeout);
              return resolve();
            }
            // Listen for start event once using type-safe string comparison
            // Note: UtxoProcessorEventType is a type-only enum, so we use string literal
            this.utxoProcessor.addEventListener((event) => {
              if (event.type === 'utxo-proc-start') {
                clearTimeout(timeout);
                resolve();
              }
            });
          } catch {
            clearTimeout(timeout);
            resolve();
          }
        });
      }

      // Always perform address discovery to find UTXOs
      // This handles the case where UTXOs might be on different addresses
      // (e.g., after using another wallet app that changed change addresses)
      walletLogger.debug('📋 Performing address discovery to find UTXOs...');
      await this.initAddressDiscovery();

      walletLogger.debug('✅ UTXO processor and context initialized', {
        hasEventListener: !!this.eventListener,
        note: 'External listeners should call addEventListener() after wallet unlock/initialize',
      });
    } catch (error) {
      walletLogger.error('❌ Failed to initialize UTXO processor:', error as Error);
    }
  }

  private async stopUtxoProcessor(): Promise<void> {
    walletLogger.debug('Stop UtxoProcessor');

    // Clean up event listeners when stopping (called during lock())
    // External listeners should re-register after unlock()
    this.cleanupEventListeners();

    await this.utxoProcessor.stop();
    await this.utxoContext.clear();
  }

  /**
   * Clean up event listener
   * Called automatically on wallet lock/shutdown
   *
   * NOTE: External listeners (like WalletService) should re-register
   * their listeners after unlock() is called again
   */
  private cleanupEventListeners(): void {
    walletLogger.debug('🧹 Cleaning up event listener', {
      hadListener: !!this.eventListener,
    });
    this.eventListener = null;
  }

  private async trackAddresses(addressesToTrack: Address[]): Promise<void> {
    await this.utxoContext.trackAddresses(addressesToTrack);
  }

  /**
   * Unregister addresses that no longer have any UTXOs
   *
   * After spending UTXOs from derived addresses, we can stop tracking those addresses
   * to reduce overhead. Static addresses (0-99 for both receive and change) are never unregistered.
   *
   * @param addressesToCheck - Addresses to check for cleanup (should be derived addresses)
   */
  public async cleanupEmptyAddresses(addressesToCheck: string[]): Promise<void> {
    if (addressesToCheck.length === 0) {
      return;
    }

    // Get static addresses (0-99 for both receive and change) - these should NEVER be unregistered
    const staticAddressSet = new Set<string>();
    const STATIC_ADDRESS_COUNT = 100; // Must match the constant in initAddressDiscovery

    // Derive all static addresses in parallel for faster performance
    const accountIndex = 0;
    const addressDerivationPromises: Array<Promise<string>> = [];

    for (let addressIndex = 0; addressIndex < STATIC_ADDRESS_COUNT; addressIndex++) {
      // Derive receive address
      addressDerivationPromises.push(
        this.signingEnclave.deriveAddress(this.network, accountIndex, addressIndex, true)
      );
      // Derive change address
      addressDerivationPromises.push(
        this.signingEnclave.deriveAddress(this.network, accountIndex, addressIndex, false)
      );
    }

    // Derive all addresses in parallel
    const derivedAddressStrs = await Promise.all(addressDerivationPromises);
    for (const addrStr of derivedAddressStrs) {
      staticAddressSet.add(addrStr);
    }

    // Filter out static addresses (0-99) from cleanup check
    const derivedAddressesToCheck = addressesToCheck.filter((addr) => !staticAddressSet.has(addr));

    if (derivedAddressesToCheck.length === 0) {
      walletLogger.debug(
        `No derived addresses to check for cleanup (all are static addresses 0-${STATIC_ADDRESS_COUNT - 1})`
      );
      return;
    }

    walletLogger.debug(`Checking ${derivedAddressesToCheck.length} derived addresses for cleanup`, {
      addresses: derivedAddressesToCheck,
    });

    // Get all UTXOs from context and check which addresses still have UTXOs
    const utxos = await this.getUtxos();
    const addressesWithUtxos = new Set<string>();

    for (const utxo of utxos) {
      const addr = utxo.address?.toString();
      if (addr) {
        addressesWithUtxos.add(addr);
      }
    }

    // Find addresses that no longer have UTXOs
    const addressesToUnregister: Address[] = [];
    for (const addrStr of derivedAddressesToCheck) {
      if (!addressesWithUtxos.has(addrStr)) {
        addressesToUnregister.push(new Address(addrStr));
        walletLogger.debug(`Address no longer has UTXOs, will unregister: ${addrStr}`);
      }
    }

    if (addressesToUnregister.length > 0) {
      walletLogger.info(`Unregistering ${addressesToUnregister.length} addresses with no UTXOs`, {
        addresses: addressesToUnregister.map((a) => a.toString()),
        note: 'These addresses no longer have any UTXOs and can be cleaned up',
      });

      try {
        await this.utxoContext.unregisterAddresses(addressesToUnregister);

        // Also remove from address derivation map if they're not static addresses
        for (const addr of addressesToUnregister) {
          const addrStr = addr.toString();
          if (!staticAddressSet.has(addrStr)) {
            this.addressToDerivation.delete(addrStr);
            walletLogger.debug(`Removed address from derivation map: ${addrStr}`);
          }
        }

        walletLogger.debug(`Successfully unregistered ${addressesToUnregister.length} addresses`);
      } catch (error) {
        walletLogger.warn('Failed to unregister addresses', error as Error);
      }
    } else {
      walletLogger.debug('All checked addresses still have UTXOs, no cleanup needed');
    }
  }

  /**
   * Extract addresses from transaction outputs and track any addresses that belong to our wallet
   *
   * This is much more efficient than running full discovery - we extract addresses directly
   * from the transaction that caused the UTXO change.
   *
   * @param transactionRecord - The transaction record from the UTXO processor event
   */
  private async extractAndTrackAddressesFromTransaction(
    transactionRecord: TransactionRecord
  ): Promise<void> {
    try {
      // Serialize the transaction record to get the transaction data
      const serialized = transactionRecord.serialize();

      // Extract transaction data - it should contain outputs
      // The structure depends on ITransactionDataVariant, but outputs should be in there
      const transactionData = serialized?.data?.data;

      if (!transactionData) {
        walletLogger.debug('⚠️ Could not extract transaction data from TransactionRecord');
        return;
      }

      // Try to get outputs from the transaction data
      // The structure might vary, so we need to handle different formats
      // serialize() returns any, but we know outputs should be ISerializableTransactionOutput[]
      let outputs: ISerializableTransactionOutput[] | undefined;

      if (
        transactionData.outputs &&
        Array.isArray(transactionData.outputs) &&
        transactionData.outputs.length > 0
      ) {
        outputs = transactionData.outputs as ISerializableTransactionOutput[];
      } else if (
        transactionData.transaction?.outputs &&
        Array.isArray(transactionData.transaction.outputs) &&
        transactionData.transaction.outputs.length > 0
      ) {
        outputs = transactionData.transaction.outputs as ISerializableTransactionOutput[];
      }

      if (!outputs || outputs.length === 0) {
        walletLogger.debug('⚠️ No outputs found in transaction data');
        return;
      }

      walletLogger.debug(`🔍 Extracting addresses from ${outputs.length} transaction outputs`);

      const addressesToTrack: Address[] = [];

      // Extract addresses from each output's script public key
      for (const output of outputs) {
        if (!output.scriptPublicKey) {
          continue;
        }

        try {
          // Extract address from script public key
          // addressFromScriptPublicKey accepts ScriptPublicKey (class) or HexString (string)
          // IScriptPublicKey interface has {version: number, script: HexString}
          // Since the function accepts HexString (which is a string type), we can try passing
          // the script property. However, this might not work if it needs the full ScriptPublicKey.
          // We use a type-safe approach: check if it's already a string/HexString, otherwise
          // use the script property which is HexString
          const scriptPublicKey = output.scriptPublicKey;
          const scriptKeyValue =
            typeof scriptPublicKey === 'string'
              ? scriptPublicKey
              : typeof scriptPublicKey === 'object' && 'script' in scriptPublicKey
                ? (scriptPublicKey as IScriptPublicKey).script
                : String(scriptPublicKey);

          const address = addressFromScriptPublicKey(scriptKeyValue, this.network);

          if (!address) {
            continue;
          }

          const addressStr = address.toString();

          // Check if this address belongs to our wallet by checking derivation
          // If we can derive it, it's ours
          const derivation = this.getAddressDerivation(addressStr);

          if (derivation) {
            // This address belongs to our wallet!
            walletLogger.debug(
              `✅ Found address ${addressStr} in transaction output (belongs to our wallet)`
            );

            // Check if we're already tracking this address
            const isTracked = this.addressToDerivation.has(addressStr);

            if (!isTracked) {
              walletLogger.info(
                `📍 New address discovered from transaction: ${addressStr}. Will track it.`
              );
              addressesToTrack.push(address);
            }
          }
        } catch (error) {
          walletLogger.debug('⚠️ Failed to extract address from output', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Track any new addresses we found
      if (addressesToTrack.length > 0) {
        walletLogger.info(
          `📍 Tracking ${addressesToTrack.length} new address(es) discovered from transaction outputs`
        );
        await this.trackAddresses(addressesToTrack);

        // IMPORTANT: After tracking new addresses, manually trigger a balance update event
        // The UTXO processor might not emit a balance event immediately for UTXOs that already exist
        // on the newly tracked address. By emitting a balance-changed event, we ensure the frontend
        // will fetch the updated balance and display it correctly.
        //
        // Note: We emit immediately - the frontend will call getBalance() which reads from
        // utxoContext.balance. The UTXO context should have updated its balance calculation
        // asynchronously after trackAddresses() completes. If not immediately, subsequent
        // UTXO processor events will trigger balance updates anyway.
        walletLogger.debug(
          `📤 Triggering balance update after tracking ${addressesToTrack.length} new address(es)`
        );
        this.emit(SimpleWalletEventType.BalanceChanged);
      } else {
        walletLogger.debug('✅ All addresses in transaction are already tracked');
      }
    } catch (error) {
      walletLogger.warn('⚠️ Failed to extract addresses from transaction record', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - this is optional enhancement, discovery will handle it if needed
    }
  }

  /**
   * Trigger address discovery when external UTXO changes are detected
   *
   * This is called when balance changes but no UTXO events were seen on tracked addresses.
   * This indicates UTXOs changed on untracked addresses (external transaction).
   *
   * NOTE: This is now a fallback - we first try to extract addresses directly from transactions.
   */
  private async triggerDiscoveryOnExternalChange(): Promise<void> {
    if (this.isDiscoveringAddresses) {
      walletLogger.debug('⚠️ Address discovery already in progress, skipping');
      return;
    }

    this.isDiscoveringAddresses = true;
    try {
      walletLogger.info('🔍 Starting address discovery after external UTXO change detected');

      // Small delay to allow UTXO processor to fully sync
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Run discovery to find new addresses with balance
      await this.initAddressDiscovery();

      walletLogger.info('✅ Address discovery complete after external UTXO change');
    } catch (error) {
      walletLogger.error(
        '❌ Failed to discover addresses after external UTXO change',
        error as Error
      );
    } finally {
      this.isDiscoveringAddresses = false;
    }
  }

  /**
   * Trigger address discovery when balance drops to 0
   *
   * This is called when balance becomes 0 (and was previously non-zero).
   * It triggers discovery to find new addresses that may have received funds.
   *
   * Scenario: When funds are sent from another wallet to this wallet,
   * the UTXO may land on a change address that's different from the primary address.
   * If the balance drops to 0 first (all tracked UTXOs spent), we need to discover
   * the new address that received the funds.
   */
  private async triggerDiscoveryOnZeroBalance(): Promise<void> {
    if (this.isDiscoveringAddresses) {
      walletLogger.debug('⚠️ Address discovery already in progress, skipping');
      return;
    }

    this.isDiscoveringAddresses = true;
    try {
      walletLogger.info('🔍 Starting address discovery after balance dropped to 0');

      // Wait a short delay to allow any pending transactions to settle
      // This gives time for UTXOs to arrive on new addresses
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Run discovery to find new addresses with balance
      await this.initAddressDiscovery();

      walletLogger.info('✅ Address discovery complete after zero balance');
    } catch (error) {
      walletLogger.error('❌ Failed to discover addresses after zero balance', error as Error);
    } finally {
      this.isDiscoveringAddresses = false;
    }
  }

  /**
   * Initial address discovery:
   * 1. Always track addresses 0-99 for both receive and change (200 addresses total)
   * 2. Check all tracked addresses (0-99) for balance
   * 3. If no balance found on 0-99, discover additional addresses iteratively up to 500 limit
   * 4. Track all addresses in UTXO context (regardless of balance) so we monitor them proactively
   *
   * IMPORTANT: Uses RPC getBalancesByAddresses() which queries the node directly,
   * not the UTXO context (which may not be populated yet). This ensures we find
   * balances even if the UTXO context hasn't synced yet.
   *
   * NOTE: When we track addresses in UTXO context, they are tracked even if they have no balance.
   * The UTXO processor will monitor these addresses and notify us when UTXOs appear on them.
   */
  private async initAddressDiscovery(): Promise<void> {
    const account = await this.getWalletAccount();
    const accountId = account.accountId;

    const MAX_SCANNED = 500;
    let scannedCount = 0;
    const accountIndex = 0;
    const STATIC_ADDRESS_COUNT = 100; // Track addresses 0-99 (100 receive + 100 change = 200 total)

    // STEP 1: Always track addresses 0-99 for both receive and change (200 addresses total)
    // Use parallelization to derive addresses faster
    walletLogger.info(
      `📍 STEP 1: Tracking static addresses 0-${STATIC_ADDRESS_COUNT - 1} for receive and change (parallelized)...`
    );
    const staticAddresses: Address[] = [];
    const staticAddressMap = new Map<string, { addressIndex: number; isReceive: boolean }>();

    // Derive all addresses in parallel for better performance
    const addressPromises: Array<
      Promise<{ address: Address; addressStr: string; addressIndex: number; isReceive: boolean }>
    > = [];

    for (let addressIndex = 0; addressIndex < STATIC_ADDRESS_COUNT; addressIndex++) {
      // Derive receive address
      addressPromises.push(
        this.signingEnclave
          .deriveAddress(this.network, accountIndex, addressIndex, true)
          .then((receiveAddressStr) => ({
            address: new Address(receiveAddressStr),
            addressStr: receiveAddressStr,
            addressIndex,
            isReceive: true,
          }))
      );

      // Derive change address
      addressPromises.push(
        this.signingEnclave
          .deriveAddress(this.network, accountIndex, addressIndex, false)
          .then((changeAddressStr) => ({
            address: new Address(changeAddressStr),
            addressStr: changeAddressStr,
            addressIndex,
            isReceive: false,
          }))
      );
    }

    // Wait for all addresses to be derived in parallel
    const derivedAddresses = await Promise.all(addressPromises);

    // Process all derived addresses
    for (const { address, addressStr, addressIndex, isReceive } of derivedAddresses) {
      staticAddresses.push(address);
      staticAddressMap.set(addressStr, { addressIndex, isReceive });

      // Track in derivation map for efficient signing
      this.addressToDerivation.set(addressStr, {
        accountIndex,
        addressIndex,
        isReceive,
      });

      const addrType = isReceive ? 'receive' : 'change';
      walletLogger.debug(`  📍 ${addrType}[${addressIndex}]: ${addressStr}`);
    }

    walletLogger.info(
      `✅ Derived ${staticAddresses.length} static addresses (${STATIC_ADDRESS_COUNT} receive + ${STATIC_ADDRESS_COUNT} change addresses 0-${STATIC_ADDRESS_COUNT - 1})`
    );

    // STEP 2: Check all static addresses (0-99) for balance
    walletLogger.info(
      `🔎 STEP 2: Checking ${staticAddresses.length} static addresses (0-${STATIC_ADDRESS_COUNT - 1}) for balance...`
    );
    const balancesResp = await this.wasmWallet.rpc.getBalancesByAddresses(staticAddresses);
    const addressStrToAddress = new Map<string, Address>(
      staticAddresses.map((a) => [a.toString(), a])
    );

    const addressesWithBalance: Address[] = [];
    for (const entry of balancesResp.entries) {
      try {
        const bal = entry.balance;
        const addrStr = entry.address.toString();
        const addrInfo = staticAddressMap.get(addrStr);
        const addrType = addrInfo?.isReceive ? 'receive' : 'change';
        const addrIdx = addrInfo?.addressIndex ?? '?';

        if (bal > 0n) {
          const addrObj = addressStrToAddress.get(addrStr);
          if (addrObj) {
            addressesWithBalance.push(addrObj);
            walletLogger.info(
              `✅ Found balance on ${addrType}[${addrIdx}] ${addrStr}: ${bal.toString()} sompi`
            );
          }
        } else {
          walletLogger.debug(`  ⭕ ${addrType}[${addrIdx}] ${addrStr}: 0 sompi (no balance)`);
        }
      } catch (e) {
        walletLogger.warn('⚠️ Failed to parse balance entry', e as Error);
      }
    }

    scannedCount += staticAddresses.length;

    walletLogger.info(
      `📊 Balance check complete: Found ${addressesWithBalance.length} address(es) with balance out of ${staticAddresses.length} checked`
    );

    // Always track all static addresses (0-99) in UTXO context regardless of balance
    // This ensures we monitor them proactively - the UTXO processor will notify us when UTXOs appear
    walletLogger.info(
      `📍 Tracking all ${staticAddresses.length} static addresses (0-${STATIC_ADDRESS_COUNT - 1}) in UTXO context (regardless of balance)...`
    );
    await this.utxoContext.clear();
    await this.trackAddresses(staticAddresses);

    // Log all tracked addresses for debugging
    walletLogger.info(`✅ All static addresses tracked in UTXO context:`, {
      totalTracked: staticAddresses.length,
      addressesWithBalance: addressesWithBalance.map((a) => {
        const addrStr = a.toString();
        const addrInfo = staticAddressMap.get(addrStr);
        return addrInfo
          ? `${addrInfo.isReceive ? 'receive' : 'change'}[${addrInfo.addressIndex}]: ${addrStr}`
          : addrStr;
      }),
      allTrackedAddresses: staticAddresses.map((a) => {
        const addrStr = a.toString();
        const addrInfo = staticAddressMap.get(addrStr);
        const hasBalance = addressesWithBalance.some((b) => b.toString() === addrStr);
        return addrInfo
          ? `${addrInfo.isReceive ? 'receive' : 'change'}[${addrInfo.addressIndex}]: ${addrStr} ${hasBalance ? '💰' : '⭕'}`
          : `${addrStr} ${hasBalance ? '💰' : '⭕'}`;
      }),
    });

    // Wait a bit for UTXO context to sync after tracking
    walletLogger.debug('⏳ Waiting for UTXO context to sync after tracking addresses...');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // If we found balance on static addresses, we're done (no need to scan further)
    if (addressesWithBalance.length > 0) {
      walletLogger.info(
        `✅ Found balance on ${addressesWithBalance.length} static address(es). All static addresses are tracked.`
      );
      walletLogger.info('✅ Address discovery complete. UTXO context should now have balances.');
      return;
    }

    walletLogger.info(
      `🟡 No balance found on static addresses (0-${STATIC_ADDRESS_COUNT - 1}). Starting iterative discovery beyond index ${STATIC_ADDRESS_COUNT - 1} (up to ${MAX_SCANNED} addresses)...`
    );

    // STEP 3: No balance on static addresses (0-99) - discover additional addresses iteratively
    // Build seen set from all static addresses we already checked
    const seen = new Set<string>(staticAddresses.map((a) => a.toString()));
    let candidateAddresses: Address[] = [];
    let nextReceiveIndex = STATIC_ADDRESS_COUNT; // Start from index 100 (indices 0-99 already checked)
    let nextChangeIndex = STATIC_ADDRESS_COUNT; // Start from index 100 (indices 0-99 already checked)
    const BATCH_SIZE = 100; // Discover 100 addresses at a time (increased for faster scanning)

    while (scannedCount < MAX_SCANNED) {
      // Discover new addresses starting from the next unchecked index
      const remainingReceive = Math.min(BATCH_SIZE, Math.floor((MAX_SCANNED - scannedCount) / 2));
      const remainingChange = Math.min(BATCH_SIZE, Math.floor((MAX_SCANNED - scannedCount) / 2));

      if (remainingReceive <= 0 && remainingChange <= 0) {
        break; // No more addresses to discover within limit
      }

      walletLogger.debug(
        `🔍 Discovering additional addresses (scanned: ${scannedCount}/${MAX_SCANNED}, next receive: ${nextReceiveIndex}, next change: ${nextChangeIndex})...`
      );
      const discovery = await this.getDiscoveryService(accountId).discoverAddresses(
        nextReceiveIndex, // Start receive from this index
        nextChangeIndex, // Start change from this index
        BATCH_SIZE
      );

      let added = 0;
      let maxReceiveIndex = nextReceiveIndex - 1;
      let maxChangeIndex = nextChangeIndex - 1;

      // Track ALL discovered addresses with their derivations
      for (const [addressIndex, addr] of discovery.receive.addresses.entries()) {
        const s = addr.toString();
        if (!this.addressToDerivation.has(s)) {
          this.addressToDerivation.set(s, { accountIndex, addressIndex, isReceive: true });
        }
        if (!seen.has(s)) {
          seen.add(s);
          candidateAddresses.push(addr);
          added++;
        }
        maxReceiveIndex = Math.max(maxReceiveIndex, addressIndex);
      }
      for (const [addressIndex, addr] of discovery.change.addresses.entries()) {
        const s = addr.toString();
        if (!this.addressToDerivation.has(s)) {
          this.addressToDerivation.set(s, { accountIndex, addressIndex, isReceive: false });
        }
        if (!seen.has(s)) {
          seen.add(s);
          candidateAddresses.push(addr);
          added++;
        }
        maxChangeIndex = Math.max(maxChangeIndex, addressIndex);
      }

      // Update next indices for next iteration
      nextReceiveIndex = maxReceiveIndex + 1;
      nextChangeIndex = maxChangeIndex + 1;

      if (added === 0) {
        walletLogger.info('🚫 No new addresses discovered; stopping discovery loop');
        break;
      }

      // Check how many we can scan in this batch
      const remaining = MAX_SCANNED - scannedCount;
      if (remaining <= 0) {
        walletLogger.info('⛔ Address discovery cap reached (500), no balance found');
        break;
      }

      // Take a batch of candidate addresses to check
      const batchToScan = candidateAddresses.slice(
        0,
        Math.min(remaining, candidateAddresses.length)
      );
      candidateAddresses = candidateAddresses.slice(batchToScan.length);

      walletLogger.info(
        `🔎 Checking ${batchToScan.length} discovered addresses for balance (scanned: ${scannedCount}/${MAX_SCANNED})`
      );

      // Check balance for this batch
      const batchBalancesResp = await this.wasmWallet.rpc.getBalancesByAddresses(batchToScan);
      const batchAddressStrToAddress = new Map<string, Address>(
        batchToScan.map((a) => [a.toString(), a])
      );

      for (const entry of batchBalancesResp.entries) {
        try {
          const bal = entry.balance;
          const addrStr = entry.address.toString();
          if (bal > 0n) {
            const addrObj = batchAddressStrToAddress.get(addrStr);
            if (addrObj) {
              addressesWithBalance.push(addrObj);
              walletLogger.info(
                `✅ Found balance on discovered address ${addrStr}: ${bal.toString()} sompi`
              );
            }
          }
        } catch (e) {
          walletLogger.warn('⚠️ Failed to parse balance entry', e as Error);
        }
      }

      scannedCount += batchToScan.length;

      // Check if we found any NEW addresses with balance in this batch (beyond the static 0-99)
      const staticAddressStrSet = new Set(staticAddresses.map((a) => a.toString()));
      const newAddressesWithBalance = addressesWithBalance.filter(
        (addr) => !staticAddressStrSet.has(addr.toString())
      );

      // If we found balance on addresses beyond 0-99, track those additional addresses
      if (newAddressesWithBalance.length > 0) {
        walletLogger.info(
          `📍 Tracking ${newAddressesWithBalance.length} additional address(es) with balance (beyond 0-${STATIC_ADDRESS_COUNT - 1})...`,
          {
            addresses: newAddressesWithBalance.map((a) => a.toString()),
          }
        );
        await this.trackAddresses(newAddressesWithBalance);
        walletLogger.info(
          `✅ Total: ${addressesWithBalance.length} address(es) with balance (${staticAddresses.length} from 0-${STATIC_ADDRESS_COUNT - 1} + ${newAddressesWithBalance.length} discovered)`
        );

        // Wait a bit for UTXO context to sync after tracking new addresses
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Final summary
    if (addressesWithBalance.length > 0) {
      walletLogger.info(
        `✅ Address discovery complete. Found balance on ${addressesWithBalance.length} address(es). All static addresses (0-${STATIC_ADDRESS_COUNT - 1}) are tracked, plus any discovered addresses with balance.`
      );
    } else {
      walletLogger.info(
        `⛔ Address discovery complete: No balance found on ${scannedCount} scanned addresses. All static addresses (0-${STATIC_ADDRESS_COUNT - 1}) are still tracked for future monitoring.`
      );
    }
  }

  /**
   * Lock wallet
   *
   * This locks BOTH the WASM wallet AND the signing enclave.
   * After locking, unlock() must be called again before signing transactions.
   */
  async lock(): Promise<void> {
    walletLogger.debug('🔒 Locking wallet and signing enclave...');

    // Lock signing enclave (clears encryption key from memory)
    this.signingEnclave.lock();

    await this.stopUtxoProcessor();

    walletLogger.debug('✅ Wallet and signing enclave locked');
  }

  /**
   * Unlock wallet from password
   *
   * This unlocks BOTH the WASM wallet AND the signing enclave.
   * After unlocking, the wallet can:
   * - Send transactions via accountsSend() (slow, waits for confirmations)
   * - Sign transactions via signTransaction() (fast, transaction chaining)
   *
   * @param password - Password to unlock the wallet
   */
  async unlockFromPassword(password: string): Promise<void> {
    try {
      walletLogger.debug('🔓 Unlocking wallet and signing enclave...');

      // Load existing accounts from WASM wallet
      walletLogger.debug('📋 Getting existing accounts...');

      // Unlock signing enclave (if mnemonic is stored)
      if (this.signingEnclave.hasMnemonic()) {
        await this.signingEnclave.unlock({
          password,
          autoLockMs: 30 * 60 * 1000, // Auto-lock after 30 minutes
        });
      }

      await this.initialize();

      walletLogger.debug('✅ Wallet and signing enclave unlocked successfully');
    } catch (error) {
      walletLogger.error('❌ Failed to unlock wallet:', error as Error);
      throw error;
    }
  }

  /**
   * Get wallet balance for an account
   */
  async getBalance(): Promise<bigint> {
    walletLogger.debug('📊 getBalance() called in SimpleWallet', {
      utxoContextActive: this.utxoContext.isActive,
    });

    const balance = this.utxoContext.balance;

    walletLogger.debug('📊 UTXO context balance', {
      mature: balance.mature.toString(),
      pending: balance.pending.toString(),
      outgoing: balance.outgoing.toString(),
    });

    const utxoEntryReferences = this.utxoContext.getMatureRange(0, 100);
    walletLogger.debug(`📊 Found ${utxoEntryReferences.length} mature UTXO entries`);

    for (const utxoEntryReference of utxoEntryReferences) {
      if (utxoEntryReference.amount > 0n) {
        walletLogger.debug(`📊 UTXO entry`, {
          address: utxoEntryReference.address?.toString(),
          amount: utxoEntryReference.amount.toString(),
          entry: utxoEntryReference.entry.toString(),
        });
      }
    }

    // Return mature + pending balance (total available balance)
    // This prevents users from seeing 0 KAS when they have pending transactions
    // that will become mature
    const totalBalance = balance.mature + balance.pending;

    walletLogger.debug('📊 Returning total balance (mature + pending)', {
      matureBalance: balance.mature.toString(),
      pendingBalance: balance.pending.toString(),
      totalBalance: totalBalance.toString(),
      totalBalanceKAS: (Number(totalBalance) / 1e8).toFixed(8),
    });

    return totalBalance;
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
   * Retrieves all mature UTXOs associated with the current account from the local UTXO context.
   *
   * This method paginates through the UTXO context using `UtxoContext.getMatureRange(offset, limit)`
   * to efficiently collect all available mature UTXO entries without performing any remote RPC calls.
   * Each entry is validated and normalized to ensure numeric fields such as `amount` and `blockDaaScore`
   * are represented as `bigint` values.
   *
   * The method accumulates results until either all pages have been read or a defined safety cap is reached.
   * Once collected, the UTXOs are sorted in descending order by amount, so the largest outputs appear first.
   *
   * @remarks
   * This function operates entirely on local data and does not trigger address discovery or
   * network queries. Address discovery and tracking must be performed beforehand during
   * wallet initialization.
   *
   * @returns {Promise<UtxoEntry[]>}
   * A promise that resolves to an array of mature UTXO entries, sorted by descending amount.
   */
  async getUtxos(): Promise<Array<UtxoEntry>> {
    // Retrieve mature UTXOs from UtxoContext in batches and sort by amount desc
    const PAGE_SIZE = 200;
    const MAX_TOTAL = 5000; // safety cap
    let offset = 0;
    const collected: UtxoEntry[] = [];

    while (collected.length < MAX_TOTAL) {
      const refs = this.utxoContext.getMatureRange(offset, PAGE_SIZE);
      if (!refs || refs.length === 0) break;

      for (const ref of refs) {
        try {
          // ref.entry is a UtxoEntry from WASM
          const entry = ref.entry;

          // UtxoEntry properties are typed as bigint, but in practice they might come as strings
          // from JSON deserialization. Normalize them safely.
          // We check runtime types and normalize if needed, then use type assertion since
          // we've verified the types are correct.
          const amountValue =
            typeof entry.amount === 'string' ? BigInt(entry.amount) : entry.amount;
          const blockDaaScoreValue =
            typeof entry.blockDaaScore === 'string'
              ? BigInt(entry.blockDaaScore)
              : entry.blockDaaScore;

          // If normalization was needed, create a new entry with normalized values
          // UtxoEntry properties can be set directly (they're not readonly in the class)
          if (typeof entry.amount === 'string' || typeof entry.blockDaaScore === 'string') {
            entry.amount = amountValue;
            entry.blockDaaScore = blockDaaScoreValue;
          }

          collected.push(entry);
        } catch (e) {
          walletLogger.warn('⚠️ Failed to parse UTXO entry from context', e as Error);
        }
      }

      if (refs.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    collected.sort((a, b) => Number((b.amount as bigint) - (a.amount as bigint)));
    walletLogger.debug(`✅ Collected ${collected.length} mature UTXOs from context`);
    return collected;
  }

  /**
   * Get address derivation information for efficient signing
   * Returns the key derivation path for a given address, if known from discovery
   */
  public getAddressDerivation(
    address: string
  ): { accountIndex: number; addressIndex: number; isReceive: boolean } | null {
    return this.addressToDerivation.get(address) || null;
  }

  /**
   * Get address discovery service for an account (lazy initialization)
   */
  private getDiscoveryService(accountId: string): AddressDiscoveryService {
    if (!this.discoveryServices.has(accountId)) {
      // CRITICAL: Pass a function to derive addresses directly from mnemonic
      // This prevents accountsCreateNewAddress() from updating the account descriptor
      const deriveAddress = async (
        accountIndex: number,
        addressIndex: number,
        isReceive: boolean
      ): Promise<Address> => {
        // Get the network from the wallet
        const network = this.network;

        // Derive address using the signing enclave (which has access to mnemonic)
        // This doesn't call accountsCreateNewAddress(), so the account descriptor won't change
        if (this.signingEnclave.isLocked()) {
          throw new Error('Signing enclave is locked. Cannot derive addresses.');
        }

        // Derive address at the requested index
        const addressStr = await this.signingEnclave.deriveAddress(
          network,
          accountIndex,
          addressIndex,
          isReceive
        );
        return new Address(addressStr);
      };

      this.discoveryServices.set(
        accountId,
        new AddressDiscoveryService(this.wasmWallet, accountId, deriveAddress)
      );
    }
    return this.discoveryServices.get(accountId)!;
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
    // Delegate to signing enclave (secure closure-based signing)
    await this.signingEnclave.sign(transaction, options);
  }
}
