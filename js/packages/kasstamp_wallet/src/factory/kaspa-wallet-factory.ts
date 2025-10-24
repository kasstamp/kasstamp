import { createLogger } from '@kasstamp/utils';
import type { IConnectOptions } from '@kasstamp/kaspa_wasm_sdk';
import {
  ConnectStrategy,
  initKaspaWasm,
  type IWalletDescriptor,
  Mnemonic,
  Resolver,
  Wallet,
} from '@kasstamp/kaspa_wasm_sdk';
import { SimpleWalletImpl } from '../wallet';
import type { Network, SimpleWallet } from '../types';

import type { SDKWalletConfig } from '../types/wallet-config';
import type { WalletFactory } from '@kasstamp/kasstamp_wallet';

export class KaspaWalletFactory implements WalletFactory {
  private isWasmInitialized = false;

  /**
   * Ensure WASM is initialized before wallet operations
   */
  private async ensureWasmReady(): Promise<void> {
    if (!this.isWasmInitialized) {
      await initKaspaWasm();
      this.isWasmInitialized = true;
    }
  }

  private networkToString(network: Network): string {
    return network;
  }

  /**
   * Connect WASM wallet to RPC with resolver and blockAsyncConnect
   */
  private async connectWallet(wasmWallet: Wallet): Promise<void> {
    const walletLogger = createLogger('kasstamp:sdk:wallet:connection');
    try {
      walletLogger.info('Connecting WASM wallet to RPC');

      // Connect wallet with blockAsyncConnect: true
      // Optimized timeouts for faster node discovery:
      // - 15s total timeout (down from 30s)
      // - 2s retry interval (down from 5s) for faster node switching
      const connectOptions: IConnectOptions = {
        blockAsyncConnect: true,
        strategy: ConnectStrategy.Retry,
        timeoutDuration: 5000, // 15 seconds total timeout
        retryInterval: 2000, // 2 seconds retry interval for faster node discovery
      };

      walletLogger.debug('Connecting wallet with options', connectOptions);
      await wasmWallet.connect(connectOptions);
      walletLogger.info('WASM wallet connected to RPC successfully');
    } catch (error) {
      walletLogger.error('Failed to connect WASM wallet to RPC', error as Error);
      throw error;
    }
  }

  /**
   * Create a new wallet with randomly generated mnemonic
   */
  async createNewWallet(
    options: SDKWalletConfig
  ): Promise<{ wallet: SimpleWallet; mnemonic: string }> {
    await this.ensureWasmReady();

    if (!options.network) {
      throw new Error('Network is required for wallet creation');
    }

    // Convert Network enum to network string for WASM
    const networkString = this.networkToString(options.network);

    // Use Wallet class directly (static import)
    if (!Wallet) {
      throw new Error('Wallet class not available - WASM may not be properly initialized');
    }

    // Generate mnemonic first
    const mnemonic = Mnemonic.random(options.words);
    const mnemonicPhrase = mnemonic.phrase;

    // Create a Wallet instance first
    const wasmWalletInstance = new Wallet({
      resident: false,
      networkId: networkString,
      resolver: new Resolver(),
    });

    // Include network in filename to separate wallets by network
    const networkSuffix = options.network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${options.name}-${networkSuffix}`;

    const createRequest = {
      walletSecret: options.walletSecret,
      filename: filenameWithNetwork,
      title: options.name, // Keep the display title without network
      overwriteWalletStorage: true,
    };

    const createWalletLogger = createLogger('kasstamp:sdk:wallet:create');
    createWalletLogger.info('Creating wallet', {
      walletName: options.name,
      network: networkSuffix,
    });
    const createResponse = await wasmWalletInstance.walletCreate(createRequest);
    createWalletLogger.info('Wallet created successfully', {
      filename: createResponse.walletDescriptor.filename,
    });

    // After creating the wallet, we need to open it to get the actual wallet instance
    // Use the actual filename from the wallet descriptor
    const actualFilename = createResponse.walletDescriptor.filename;
    const openRequest = {
      walletSecret: options.walletSecret,
      filename: actualFilename,
      accountDescriptors: true,
    };

    createWalletLogger.debug('Opening wallet', { filename: actualFilename });

    const openResponse = await wasmWalletInstance.walletOpen(openRequest);
    const accountDescriptors = openResponse.accountDescriptors || [];

    // Connect the wallet to RPC for transaction data access
    await this.connectWallet(wasmWalletInstance);

    // Start the wallet to begin synchronization
    createWalletLogger.info('Starting wallet synchronization');
    await wasmWalletInstance.start();
    createWalletLogger.info('Wallet started successfully');

    // Create a descriptor using the original user-provided name (without any date suffix)
    const descriptor: IWalletDescriptor = {
      filename: actualFilename, // WASM needs the actual filename for storage operations
      title: options.name, // But display the user's original name
    };

    // Create a simple wallet wrapper using SimpleWalletImpl
    const wallet = new SimpleWalletImpl(wasmWalletInstance, options.network.toString(), descriptor);

    // ✅ Store mnemonic in secure signing enclave
    // IMPORTANT: walletSecret is for encryption, passphrase is for BIP39 key derivation
    await wallet.signingEnclave.storeMnemonic({
      mnemonic: mnemonicPhrase,
      password: options.walletSecret,
      bip39Passphrase: options.passphrase, // BIP39 passphrase (undefined = no passphrase)
    });

    // Initialize the wallet to load existing accounts
    await wallet.initialize();

    // Create initial account if none exist
    if (accountDescriptors.length === 0) {
      createWalletLogger.info('No existing accounts found, creating first account');
      try {
        // First, create private key data from the mnemonic
        createWalletLogger.debug('Creating private key data from mnemonic');
        const prvKeyDataResponse = await wasmWalletInstance.prvKeyDataCreate({
          walletSecret: options.walletSecret,
          name: 'Main Key',
          mnemonic: mnemonicPhrase,
          kind: 'mnemonic',
          paymentSecret: options.passphrase || undefined, // BIP39 passphrase (optional)
        });

        createWalletLogger.debug('Private key data created', {
          prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
        });

        // Then, create the first account using the private key data
        createWalletLogger.debug('Creating first account');
        const accountResponse = await wasmWalletInstance.accountsCreate({
          walletSecret: options.walletSecret,
          type: 'bip32',
          accountName: 'Main Account',
          accountIndex: 0,
          prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
          paymentSecret: options.passphrase || undefined, // BIP39 passphrase (optional)
        });

        createWalletLogger.info('Account created successfully', {
          accountId: accountResponse.accountDescriptor?.accountId,
        });

        // Reload the wallet to get the new account
        await wallet.initialize();
      } catch (error) {
        createWalletLogger.error('Failed to create account', error as Error);
        throw error;
      }
    } else {
      createWalletLogger.info('Found existing accounts', { count: accountDescriptors.length });
    }

    return { wallet, mnemonic: mnemonicPhrase };
  }

  /**
   * Import wallet from existing mnemonic
   */
  async createWalletFromMnemonic(
    mnemonic: string,
    options: SDKWalletConfig
  ): Promise<SimpleWallet> {
    await this.ensureWasmReady();

    if (!options.network) {
      throw new Error('Network is required for wallet creation');
    }

    // Convert Network enum to network string for WASM
    const networkString = this.networkToString(options.network);

    // Use Wallet class directly (static import)
    if (!Wallet) {
      throw new Error('Wallet class not available - WASM may not be properly initialized');
    }

    // Create a Wallet instance first
    const wasmWalletInstance = new Wallet({
      resident: false,
      networkId: networkString,
      resolver: new Resolver(),
    });

    // Include network in filename to separate wallets by network
    const networkSuffix = options.network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${options.name}-${networkSuffix}`;

    const createRequest = {
      walletSecret: options.walletSecret,
      filename: filenameWithNetwork,
      title: options.name, // Keep the display title without network
      overwriteWalletStorage: true,
    };

    const importLogger = createLogger('kasstamp:sdk:wallet:import');
    importLogger.info('Importing wallet', { walletName: options.name, network: networkSuffix });
    const createResponse = await wasmWalletInstance.walletCreate(createRequest);

    // After creating the wallet, we need to open it to get the actual wallet instance
    // Use the actual filename from the wallet descriptor
    const actualFilename = createResponse.walletDescriptor.filename;
    const openRequest = {
      walletSecret: options.walletSecret,
      filename: actualFilename,
      accountDescriptors: true,
    };

    await wasmWalletInstance.walletOpen(openRequest);

    // Import the mnemonic as private key data into the wallet
    importLogger.info('Importing mnemonic as private key data');
    const prvKeyDataRequest = {
      walletSecret: options.walletSecret,
      mnemonic,
      paymentSecret: options.passphrase || undefined, // BIP39 passphrase (optional)
      kind: 'mnemonic' as const,
    };
    const prvKeyDataResponse = await wasmWalletInstance.prvKeyDataCreate(prvKeyDataRequest);
    importLogger.debug('Mnemonic imported into wallet', {
      prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
    });

    // Create the default account using the imported private key data
    // This ensures the BIP39 passphrase is used correctly during derivation
    importLogger.debug('Creating default account from imported private key data');
    const createAccountRequest = {
      walletSecret: options.walletSecret,
      type: 'bip32' as const,
      accountName: 'Main Account', // Match creation flow naming
      accountIndex: 0,
      prvKeyDataId: prvKeyDataResponse.prvKeyDataId,
      paymentSecret: options.passphrase || undefined, // BIP39 passphrase (optional)
    };
    const accountResponse = await wasmWalletInstance.accountsCreate(createAccountRequest);
    importLogger.info('Default account created', {
      accountId: accountResponse.accountDescriptor.accountId,
    });

    // Connect the wallet to RPC for transaction data access
    await this.connectWallet(wasmWalletInstance);

    // Start the wallet to begin synchronization
    importLogger.info('Starting wallet synchronization');
    await wasmWalletInstance.start();
    importLogger.info('Wallet started successfully');

    // Create a descriptor using the original user-provided name (without any date suffix)
    const descriptor: IWalletDescriptor = {
      filename: actualFilename, // WASM needs the actual filename for storage operations
      title: options.name, // But display the user's original name
    };

    // Create a simple wallet wrapper (same as createNewWallet)
    const wallet = new SimpleWalletImpl(wasmWalletInstance, options.network.toString(), descriptor);

    // ✅ Store mnemonic in secure signing enclave
    // IMPORTANT: walletSecret is for encryption, passphrase is for BIP39 key derivation
    await wallet.signingEnclave.storeMnemonic({
      mnemonic,
      password: options.walletSecret,
      bip39Passphrase: options.passphrase, // BIP39 passphrase (undefined = no passphrase)
    });

    // Initialize the wallet to load existing accounts
    await wallet.initialize();

    // Unlock the wallet so it's ready to use
    importLogger.info('Unlocking imported wallet');
    await wallet.unlockFromPassword(options.walletSecret);
    importLogger.debug('Wallet unlocked', { locked: wallet.locked });

    importLogger.info('Wallet imported', { accountCount: wallet.accounts.length });

    return wallet;
  }

  /**
   * Open an existing wallet from storage
   */
  async openExistingWallet(
    walletName: string,
    walletSecret: string,
    network: Network
  ): Promise<SimpleWallet> {
    await this.ensureWasmReady();

    if (!walletSecret) {
      throw new Error('walletSecret is required for wallet operations');
    }

    if (!network) {
      throw new Error('Network is required for opening existing wallet');
    }

    // Convert Network enum to string for WASM RPC client
    const networkString = this.networkToString(network);

    // Wallet filenames include network suffix to separate mainnet/testnet wallets
    const networkSuffix = network === 'mainnet' ? 'mainnet' : 'testnet-10';
    const filenameWithNetwork = `${walletName}-${networkSuffix}`;

    const openRequest = {
      walletSecret,
      filename: filenameWithNetwork,
      accountDescriptors: true,
    };

    // Create a Wallet instance first
    const wasmWalletInstance = new Wallet({
      resident: false,
      networkId: networkString,
      resolver: new Resolver(),
    });

    await wasmWalletInstance.walletOpen(openRequest);
    const wasmWallet = wasmWalletInstance;

    // Connect the wallet to RPC for transaction data access
    await this.connectWallet(wasmWalletInstance);

    // Start the wallet to begin synchronization
    const openLogger = createLogger('kasstamp:sdk:wallet:open');
    openLogger.info('Starting wallet synchronization');
    await wasmWalletInstance.start();
    openLogger.info('Wallet started successfully');

    // Create a minimal descriptor for existing wallets (for enclave storage key)
    // Using IWalletDescriptor (interface) instead of WalletDescriptor (class)
    // IMPORTANT: filename must match the storage key (includes network suffix)
    const descriptor: IWalletDescriptor = {
      filename: filenameWithNetwork, // Must match the actual storage filename
      title: walletName, // Display name without network suffix
    };

    // Create a simple wallet wrapper using SimpleWalletImpl
    const wallet = new SimpleWalletImpl(
      wasmWallet,
      network.toString(),
      descriptor // Pass descriptor so enclave can use correct storage key
    );

    // Note: For existing wallets, the mnemonic is stored encrypted in localStorage
    // The enclave will automatically load it if available

    // Initialize the wallet to load existing accounts
    await wallet.initialize();

    return wallet;
  }

  /**
   * Legacy method for basic wallet creation
   */
  async createWallet(options: SDKWalletConfig): Promise<SimpleWallet> {
    const result = await this.createNewWallet(options);
    return result.wallet;
  }
}
