import { createLogger } from '@kasstamp/utils';
import { createKaspaClient, KaspaRpcClient, type KaspaRpcClientOptions } from '@kasstamp/rpc';
import { buildStampingPayload, GeneratorTransactionService } from '@kasstamp/tx';
import { Address, estimateTransactions, initKaspaWasm } from '@kasstamp/kaspa_wasm_sdk';
import {
  createTransactionMonitoringService,
  Network,
  type SDKWalletConfig,
  SimpleWallet,
  TransactionMonitoringService,
} from '@kasstamp/wallet';
import {
  downloadReconstructedFile,
  type FullPayloadStructure,
  prepareFileForPrivateMode,
  prepareFileForPublicMode,
  type ProcessingOptions,
  type ProcessingResult,
  reconstructFileFromReceipt,
  type ReconstructionProgressCallback,
  type ReconstructionResult,
  serializePayload,
  stampFiles,
  type StampingEnvelope,
  type StampingMode,
  type StampingReceipt,
  type StampingResult,
  validateReceipt,
} from '@kasstamp/stamping';

import type { KaspaSDKConfig } from '../types/config';

/**
 * Professional Enterprise Kaspa SDK
 */
export class KaspaSDK {
  private static instance: KaspaSDK | null = null;
  private static logger = createLogger('kasstamp:sdk');
  private config: KaspaSDKConfig;
  private rpcClient: KaspaRpcClient | null = null;
  private isInitialized = false;
  private constructor(config: KaspaSDKConfig) {
    this.config = config;
  }

  /**
   * Initialize the Professional Kaspa SDK
   *
   * @param config - SDK configuration (network is required)
   * @returns Promise<KaspaSDK> - Initialized SDK instance
   */
  static async init(config: KaspaSDKConfig): Promise<KaspaSDK> {
    if (KaspaSDK.instance && KaspaSDK.instance.isInitialized) {
      return KaspaSDK.instance;
    }

    try {
      if (config.debug) {
        KaspaSDK.logger.info('Initializing Professional Enterprise Kaspa SDK');
      }

      // Ensure WASM is initialized once for the session
      await initKaspaWasm();
      if (config.debug) KaspaSDK.logger.info('WASM initialized');

      const instance = new KaspaSDK(config);
      await instance.initialize();

      KaspaSDK.instance = instance;
      instance.isInitialized = true;

      if (config.debug) {
        KaspaSDK.logger.info('Enterprise Kaspa SDK ready for professional use');
      }

      return instance;
    } catch (error) {
      KaspaSDK.logger.error('Failed to initialize Professional Kaspa SDK', error as Error);
      throw new Error(`Failed to initialize Professional Kaspa SDK: ${error}`);
    }
  }

  /**
   * Internal initialization with clean dependency injection
   */
  private async initialize(): Promise<void> {
    // Convert Network enum to network string for RPC client
    const networkString = this.networkToString(this.config.network);

    // Create RPC client with auto-discovery
    const rpcOptions: KaspaRpcClientOptions = {
      network: networkString, // Network string for WASM RpcClient
      nodeUrl: this.config.nodeUrl,
      ...this.config.rpcOptions,
    };

    this.rpcClient = createKaspaClient(rpcOptions);

    // Auto-connect for immediate use
    await this.rpcClient.connect();
  }

  /**
   * Create a new wallet with randomly generated mnemonic
   *
   * @param options - Wallet creation options
   * @returns Object containing the wallet and mnemonic
   */
  async createWallet(
    options: SDKWalletConfig
  ): Promise<{ wallet: SimpleWallet; mnemonic: string }> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    if (!options.walletSecret) {
      throw new Error('walletSecret is required for wallet operations');
    }

    if (this.config.debug) {
      KaspaSDK.logger.info('Creating new enterprise-grade wallet with mnemonic', {
        walletName: options.name,
        network: options.network || this.config.network,
      });
    }

    const walletOptions = {
      ...options,
      network: options.network || this.config.network,
    };

    return await SimpleWallet.create(walletOptions);
  }

  /**
   * Import wallet from existing mnemonic
   *
   * @param mnemonic - BIP39 mnemonic phrase
   * @param options - Wallet options
   * @returns Wallet instance
   */
  async importWallet(mnemonic: string, options: SDKWalletConfig): Promise<SimpleWallet> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    if (!options.walletSecret) {
      throw new Error('walletSecret is required for wallet operations');
    }

    if (this.config.debug) {
      KaspaSDK.logger.info('Importing enterprise-grade wallet from mnemonic', {
        walletName: options.name,
        network: options.network || this.config.network,
      });
    }

    const walletOptions = {
      ...options,
      network: options.network || this.config.network,
    };

    return await SimpleWallet.createFromMnemonic(mnemonic, walletOptions);
  }

  /**
   * Open an existing wallet from storage
   *
   * @param walletName - Name of the wallet to open
   * @param walletSecret - Wallet encryption secret
   * @returns Wallet instance
   */
  async openExistingWallet(walletName: string, walletSecret: string): Promise<SimpleWallet> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    if (this.config.debug) {
      KaspaSDK.logger.info('Opening existing wallet', { walletName, network: this.config.network });
    }

    return await SimpleWallet.open(walletName, walletSecret, this.config.network);
  }

  /**
   * Get current network information
   */
  getNetwork(): Network {
    return this.config.network;
  }

  /**
   * Check if SDK is ready
   */
  isReady(): boolean {
    return this.isInitialized && !!this.rpcClient;
  }

  /**
   * Get fee estimate from the network (without wallet)
   */
  async getFeeEstimate(): Promise<{
    priorityFeeRate: number;
    normalFeeRate: number;
    lowFeeRate: number;
  }> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    if (!this.rpcClient) {
      throw new Error('RPC client not available');
    }

    try {
      KaspaSDK.logger.debug('Getting fee estimate from network');
      return await this.rpcClient.getFeeEstimate();
    } catch (error) {
      KaspaSDK.logger.error('Failed to get fee estimate', error as Error);
      throw new Error(`Failed to get fee estimate: ${error}`);
    }
  }

  /**
   * Estimate stamping fees using real processing pipeline with fallback fee calculation
   *
   * This method uses the exact same processing pipeline as real stamping, but with
   * fallback fee calculation when wallet is not available. The chunking and processing
   * logic is identical to the real stamping process.
   *
   * @param file - File to estimate
   * @param options - Stamping options
   * @param wallet - Optional wallet (if available, uses real fee calculation)
   * @returns Accurate estimation using real processing pipeline
   */
  async estimateStampingWithFallback(
    file: File,
    options: {
      mode: StampingMode;
      compression?: boolean;
      priorityFee: bigint;
    },
    wallet?: SimpleWallet
  ): Promise<{
    originalSize: number;
    processedSize: number;
    chunkCount: number;
    estimatedTransactions: number;
    estimatedFeesSompi: bigint;
    estimatedFeesKAS: number;
    estimatedMass: bigint;
    storageAmountKAS: number;
    totalCostKAS: number;
    processingResult: ProcessingResult;
    feeCalculationMethod: 'wallet' | 'rpc' | 'static';
  }> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    const estimationLogger = KaspaSDK.logger.child('estimation-fallback');
    estimationLogger.info('Starting fallback-aware estimation', {
      fileName: file.name,
      fileSizeKB: (file.size / 1024).toFixed(2),
      hasWallet: !!wallet,
      mode: options.mode,
    });

    // 1. Process file using REAL processing pipeline (same as actual stamping)
    // For estimation without wallet in private mode, process as public first
    const processingMode = options.mode === 'private' && !wallet ? 'public' : options.mode;
    const processingResult = await this.processFileForStamping(
      file,
      processingMode,
      {
        compression: options.compression ?? true,
      },
      wallet // Pass wallet for private mode encryption
    );

    // If original mode was private but we processed as public (no wallet),
    // we'll add encryption overhead later in envelope creation
    const needsEncryptionOverhead = options.mode === 'private' && !wallet;

    estimationLogger.info('File processed using real pipeline', {
      chunkCount: processingResult.chunks.length,
      processedSizeKB: (processingResult.processing.totalProcessedSize / 1024).toFixed(2),
    });

    // 2. Build envelopes using REAL envelope building logic
    const groupId = processingResult.chunks[0]?.groupId;
    const enclave = options.mode === 'private' && wallet ? wallet.signingEnclave : undefined;
    const envelopes: StampingEnvelope[] = [];

    for (const chunk of processingResult.chunks) {
      const fullPayload: FullPayloadStructure = {
        fileName: processingResult.originalFile.name,
        chunkIndex: chunk.index,
        totalChunks: processingResult.chunks.length,
        digest: chunk.digest,
        timestamp: new Date().toISOString(),
        chunkData: chunk.data,
      };

      // Serialize payload using REAL serialization
      const serialized = serializePayload(fullPayload);

      // Encrypt if private mode (using REAL encryption)
      let payload = serialized;
      if (options.mode === 'private' && enclave) {
        payload = await enclave.encryptWithWalletKey(serialized, groupId);
      } else if (needsEncryptionOverhead) {
        // Estimate encryption overhead for private mode without wallet
        // AES-256-GCM adds: 16 bytes (IV) + 16 bytes (auth tag) = 32 bytes
        // Plus some overhead for metadata (salt, etc.) ≈ 64 bytes total
        const ENCRYPTION_OVERHEAD = 64;
        const estimatedEncryptedSize = serialized.length + ENCRYPTION_OVERHEAD;
        const dummyEncrypted = new Uint8Array(estimatedEncryptedSize);
        dummyEncrypted.set(serialized); // Fill with actual data for realistic size
        payload = dummyEncrypted;
      }

      envelopes.push({
        metadata: {
          groupId,
          mode: options.mode,
        },
        payload,
      });
    }

    // 3. Calculate fees using fallback chain: wallet -> RPC -> static
    let totalTransactions = 0;
    let totalFees = 0n;
    let totalMass = 0n;
    let feeCalculationMethod: 'wallet' | 'rpc' | 'static' = 'static';

    if (wallet) {
      // Method 1: Use wallet with real UTXOs (most accurate)
      try {
        const account = await wallet.getWalletAccount();
        const receiveAddress = account.receiveAddress?.toString();
        const changeAddress = account.changeAddress?.toString();
        const networkId = wallet.network?.toString() || 'testnet-10';

        if (receiveAddress && changeAddress) {
          const utxos = await wallet.getUtxos();

          estimationLogger.info('Using wallet-based fee calculation (mature UTXOs)', {
            utxoCount: utxos.length,
            address: receiveAddress,
          });

          // Estimate each envelope using Generator with real UTXOs
          const estimationPromises = envelopes.map(async (envelope) => {
            const payloadInfo = buildStampingPayload({
              metadata: envelope.metadata,
              chunkData: envelope.payload,
            });

            return await GeneratorTransactionService.estimateStampingTransaction({
              recipient: receiveAddress,
              changeAddress,
              utxos,
              payload: payloadInfo.payload,
              networkId,
              priorityFee: options.priorityFee,
              amount: 0n, // No explicit output - only change + payload
            });
          });

          const estimations = await Promise.all(estimationPromises);

          for (const estimation of estimations) {
            estimationLogger.debug('Wallet estimation (real UTXOs)', {
              mass: estimation.totalMass.toString(),
              fees: estimation.totalFees.toString(),
              feesKAS: (Number(estimation.totalFees) / 100000000).toFixed(8),
              transactionCount: estimation.transactionCount,
            });

            totalTransactions += estimation.transactionCount;
            totalFees += estimation.totalFees;
            totalMass += estimation.totalMass;
          }

          feeCalculationMethod = 'wallet';
          estimationLogger.info('Wallet-based estimation complete', {
            totalTransactions,
            totalFeesSompi: totalFees.toString(),
            totalMass: totalMass.toString(),
          });
        }
      } catch (error) {
        estimationLogger.warn(
          'Wallet-based estimation failed, falling back to RPC',
          error as Error
        );
      }
    }

    if (feeCalculationMethod === 'static') {
      // Method 2: Use WASM SDK with dummy UTXOs (fee rates from network)
      try {
        estimationLogger.info('Using RPC-based fee calculation (WASM SDK with dummy UTXOs)');

        // Use WASM SDK estimateTransactions for accurate mass AND fee calculation
        // Create NetworkId and dummy address with correct network
        const networkString = this.networkToString(this.config.network);
        const networkId = wallet.network?.toString() || 'testnet-10';
        const addressPrefix = networkId == 'testnet-10' ? 'kaspatest' : 'kaspa';

        // Create a dummy address with the correct network prefix
        const dummyAddress = new Address(
          `${addressPrefix}:qq9ur9d9zu7qrc36607legtfjldpcrj0t75gl3lgnz2ytj6jly30s9mrz0zrf`
        );
        const dummyUtxo = {
          address: dummyAddress,
          outpoint: {
            transactionId: '0000000000000000000000000000000000000000000000000000000000000000',
            index: 0,
          },
          amount: 1000000000n, // 10 KAS dummy amount
          scriptPublicKey: {
            version: 0,
            script: '76a914000000000000000000000000000000000000000088ac', // P2PKH script as hex string
          },
          blockDaaScore: 1000000n,
          isCoinbase: false,
        };

        // Calculate mass AND fees for each envelope using WASM SDK
        for (const envelope of envelopes) {
          const payloadInfo = buildStampingPayload({
            metadata: envelope.metadata,
            chunkData: envelope.payload,
          });

          try {
            // Use WASM SDK estimateTransactions with priorityFee
            // Let WASM SDK fetch network fee rates automatically (like wallet does)
            const priorityFeeSompi = options.priorityFee !== undefined ? options.priorityFee : 0n;

            const summary = await estimateTransactions({
              outputs: [], // No explicit outputs - only change + payload
              changeAddress: dummyAddress,
              entries: [dummyUtxo],
              payload: payloadInfo.payload,
              priorityFee: priorityFeeSompi,
              networkId: networkString,
              // NO feeRate parameter - let WASM SDK fetch from network automatically
            });

            const chunkMass = summary.mass as bigint;
            const chunkFees = summary.fees as bigint;

            // WASM SDK returns mass-based fees (no MINIMUM_RELAY_FEE included)
            // This matches wallet-based estimation behavior
            estimationLogger.debug('WASM SDK estimation (dummy UTXOs)', {
              mass: chunkMass.toString(),
              fees: chunkFees.toString(),
              feesKAS: (Number(chunkFees) / 100000000).toFixed(8),
            });

            totalTransactions += summary.transactions as number;
            totalFees += chunkFees;
            totalMass += chunkMass;
          } catch (error) {
            // Fallback to static calculation if WASM fails
            estimationLogger.warn(
              'WASM estimateTransactions failed, falling back to static',
              error as Error
            );

            // Use static fee rate as absolute fallback
            const STATIC_FEE_RATE = 1000; // sompi per gram
            const BASE_TX_OVERHEAD = 200;
            const INPUT_MASS = 1_118;
            const OUTPUT_MASS = 846;
            const PAYLOAD_MASS = payloadInfo.payload.length;
            const networkMass = BASE_TX_OVERHEAD + INPUT_MASS + OUTPUT_MASS + PAYLOAD_MASS;

            // Calculate fee: mass-based fee + priority fee
            const massGrams = networkMass / 1000;
            const massBasedFeeSompi = BigInt(Math.ceil(massGrams * STATIC_FEE_RATE));

            // Add priority fee if specified (check !== undefined to allow 0n)
            const priorityFeeSompi = options.priorityFee !== undefined ? options.priorityFee : 0n;
            const chunkFeeSompi = massBasedFeeSompi + priorityFeeSompi;

            totalTransactions += 1;
            totalFees += chunkFeeSompi;
            totalMass += BigInt(networkMass);
          }
        }

        feeCalculationMethod = 'rpc';
        estimationLogger.info('RPC-based estimation complete', {
          totalTransactions,
          totalFeesSompi: totalFees.toString(),
          totalMass: totalMass.toString(),
        });
      } catch (error) {
        estimationLogger.warn(
          'RPC-based estimation failed, falling back to static',
          error as Error
        );
      }
    }

    if (feeCalculationMethod === 'static') {
      // Method 3: Static fallback with real mass calculation
      const STATIC_FEE_RATE = 1000; // sompi per gram (= 1 sompi per mass unit)

      estimationLogger.info('Using static fee calculation', {
        staticFeeRate: STATIC_FEE_RATE,
      });

      // Calculate mass for each envelope using REAL payload building
      for (const envelope of envelopes) {
        const payloadInfo = buildStampingPayload({
          metadata: envelope.metadata,
          chunkData: envelope.payload,
        });

        // Use REAL mass calculation from payload builder
        const BASE_TX_OVERHEAD = 200;
        const INPUT_MASS = 1_118;
        const OUTPUT_MASS = 846;
        const PAYLOAD_MASS = payloadInfo.payload.length;

        const networkMass = BASE_TX_OVERHEAD + INPUT_MASS + OUTPUT_MASS + PAYLOAD_MASS;

        // Calculate fee: mass-based fee + priority fee (no MINIMUM_RELAY_FEE)
        const massGrams = networkMass / 1000;
        const massBasedFeeSompi = BigInt(Math.ceil(massGrams * STATIC_FEE_RATE));

        // Add priority fee if specified (check !== undefined to allow 0n)
        const priorityFeeSompi = options.priorityFee !== undefined ? options.priorityFee : 0n;

        // Total fee = mass fee + priority fee
        const chunkFeeSompi = massBasedFeeSompi + priorityFeeSompi;

        totalTransactions += 1;
        totalFees += chunkFeeSompi;
        totalMass += BigInt(networkMass);
      }

      estimationLogger.info('Static estimation complete', {
        totalTransactions,
        totalFeesSompi: totalFees.toString(),
        totalMass: totalMass.toString(),
      });
    }

    // Calculate final costs
    const storageAmountKAS = 0; // No storage amount - only network fees
    const estimatedFeesKAS = Number(totalFees) / 1e8;
    const totalCostKAS = storageAmountKAS + estimatedFeesKAS;

    estimationLogger.info('Fallback-aware estimation complete', {
      feeCalculationMethod,
      envelopeCount: envelopes.length,
      totalTransactions,
      totalFeesSompi: totalFees.toString(),
      totalFeesKAS: estimatedFeesKAS.toFixed(8),
      totalMass: totalMass.toString(),
      avgMassPerTx: Number(totalMass) / totalTransactions,
      totalCostKAS: totalCostKAS.toFixed(8),
    });

    return {
      originalSize: processingResult.originalFile.size,
      processedSize: processingResult.processing.totalProcessedSize,
      chunkCount: processingResult.chunks.length,
      estimatedTransactions: totalTransactions,
      estimatedFeesSompi: totalFees,
      estimatedFeesKAS,
      estimatedMass: totalMass,
      storageAmountKAS,
      totalCostKAS,
      processingResult,
      feeCalculationMethod,
    };
  }

  /**
   * Convert Network enum to network string for WASM RpcClient
   */
  private networkToString(network: Network): string {
    // Use the enum values directly as they might be the correct format
    return network;
  }

  /**
   * Create transaction monitoring service for a wallet and account
   * Uses wallet instances for better integration
   */
  createTransactionMonitoringService(
    wallet: SimpleWallet,
    accountId: string
  ): TransactionMonitoringService {
    return createTransactionMonitoringService(
      wallet.wasmWallet,
      accountId,
      wallet.network, // Pass the network ID from wallet
      {
        pollInterval: this.config.pollingIntervals?.transactionMonitoring ?? 60000,
      }
    );
  }

  /**
   * Process file for stamping
   *
   * @param file - File to process
   * @param mode - Stamping mode (public, private)
   * @param options - Processing options
   * @param wallet - Optional wallet (required for private mode)
   * @returns Processing result with chunks and fee estimate
   */
  async processFileForStamping(
    file: File,
    mode: StampingMode,
    options?: Partial<ProcessingOptions>,
    wallet?: SimpleWallet
  ): Promise<ProcessingResult> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    const processingLogger = KaspaSDK.logger.child('processing');
    processingLogger.debug('processFileForStamping called', {
      fileName: file.name,
      fileSize: file.size,
      mode,
      options,
    });

    const processingOptions: ProcessingOptions = {
      mode,
      compression: true,
      ...options,
    };

    processingLogger.debug('Processing options configured', processingOptions);

    try {
      let result: ProcessingResult;
      switch (mode) {
        case 'public':
          processingLogger.debug('Calling prepareFileForPublicMode');
          result = await prepareFileForPublicMode(file, processingOptions);
          break;
        case 'private': {
          // Get wallet and enclave for private mode encryption
          if (!wallet) {
            throw new Error('Wallet is required for private mode. Please pass a wallet parameter.');
          }
          if (!wallet.signingEnclave) {
            throw new Error('Wallet does not have a signing enclave.');
          }
          processingLogger.debug('Calling prepareFileForPrivateMode with enclave');
          result = await prepareFileForPrivateMode(file, wallet.signingEnclave, processingOptions);
          break;
        }
        default:
          throw new Error(`Unknown stamping mode: ${mode}`);
      }

      processingLogger.debug('Processing completed', { chunkCount: result.chunks?.length });
      return result;
    } catch (error) {
      processingLogger.error('Error in processFileForStamping', error as Error, {
        fileName: file.name,
        mode,
      });
      throw error;
    }
  }

  /**
   * Reconstruct file from stamping receipt
   *
   * Downloads all chunk transactions from blockchain and reassembles the original file
   *
   * @param receipt - Stamping receipt with transaction IDs
   * @param wallet - Wallet to fetch transactions from (optional for public receipts)
   * @param onProgress - Optional progress callback
   * @returns Reconstructed file data
   *
   * @example
   * ```typescript
   * // Public receipt - no wallet needed
   * const result = await sdk.reconstructFile(publicReceipt, null, (progress) => {
   *   console.log(`${progress.stage}: ${progress.current}/${progress.total}`);
   * });
   *
   * // Private receipt - wallet required
   * const result = await sdk.reconstructFile(privateReceipt, wallet, (progress) => {
   *   console.log(`${progress.stage}: ${progress.current}/${progress.total}`);
   * });
   * console.log(`File reconstructed: ${result.filename}`);
   * console.log(`Hash matched: ${result.matched}`);
   * ```
   */
  async reconstructFile(
    receipt: StampingReceipt,
    wallet: SimpleWallet | null,
    onProgress?: ReconstructionProgressCallback
  ): Promise<ReconstructionResult> {
    return await reconstructFileFromReceipt(receipt, wallet, onProgress);
  }

  /**
   * Download reconstructed file to user's device
   *
   * @param result - Reconstruction result from reconstructFile()
   */
  downloadFile(result: ReconstructionResult): void {
    downloadReconstructedFile(result);
  }

  /**
   * Decrypt an encrypted receipt (private mode only)
   *
   * This automatically decrypts the transaction IDs in a private receipt,
   * making it ready for display or file reconstruction.
   *
   * @param receipt - The receipt to decrypt (can be public or private)
   * @param wallet - Wallet required for private receipts (optional for public)
   * @returns Decrypted receipt with plaintext transaction IDs
   *
   * @throws Error if wallet is missing/locked or decryption fails
   *
   * @example
   * // Decrypt a private receipt
   * const decrypted = await sdk.decryptReceipt(encryptedReceipt, wallet);
   * console.log(decrypted.transactionIds); // Now an array
   *
   * @example
   * // Public receipts pass through unchanged
   * const publicReceipt = await sdk.decryptReceipt(receipt, null);
   */
  async decryptReceipt(
    receipt: StampingReceipt,
    wallet: SimpleWallet | null
  ): Promise<StampingReceipt> {
    const decryptLogger = KaspaSDK.logger.child('decrypt');
    decryptLogger.info('Attempting to decrypt receipt', { receiptId: receipt.id });

    // ✅ VALIDATE RECEIPT BEFORE PROCESSING
    decryptLogger.debug('Validating receipt structure');
    const validationResult = validateReceipt(receipt);

    // Log warnings
    if (validationResult.warnings.length > 0) {
      decryptLogger.warn('Receipt validation warnings', { warnings: validationResult.warnings });
    }

    // Fail if validation errors
    if (!validationResult.valid) {
      decryptLogger.error('Receipt validation failed', { errors: validationResult.errors });
      throw new Error(`Invalid receipt: ${validationResult.errors.join(', ')}`);
    }

    decryptLogger.debug('Receipt validation passed');
    decryptLogger.debug('Receipt details', {
      privacy: receipt.privacy,
      transactionIdsEncrypted: receipt.transactionIdsEncrypted,
    });

    // If not private or already decrypted, return as-is
    if (receipt.privacy !== 'private' || !receipt.transactionIdsEncrypted) {
      decryptLogger.info('Receipt is public or already decrypted');
      return receipt;
    }

    // Need wallet to decrypt
    if (!wallet || !wallet.signingEnclave) {
      throw new Error('Wallet connection required to decrypt private receipt');
    }

    if (wallet.signingEnclave.isLocked()) {
      throw new Error('Wallet is locked. Please unlock your wallet to decrypt this receipt.');
    }

    if (!wallet.signingEnclave.hasMnemonic()) {
      throw new Error('Wallet is corrupt, please re-import your wallet.');
    }

    if (!receipt.groupId) {
      throw new Error('Receipt missing groupId - cannot decrypt');
    }

    try {
      decryptLogger.info('Decrypting transaction IDs');

      // Decrypt transaction IDs
      const encryptedTxIds = receipt.transactionIds as string;
      const encryptedBytes = Uint8Array.from(atob(encryptedTxIds), (c) => c.charCodeAt(0));

      const decryptedBytes = await wallet.signingEnclave.decryptWithWalletKey(
        encryptedBytes,
        receipt.groupId
      );

      const decryptedJson = new TextDecoder().decode(decryptedBytes);
      const transactionIds = JSON.parse(decryptedJson) as string[];

      decryptLogger.info('Transaction IDs decrypted', { count: transactionIds.length });

      // Decrypt metadata (fileName, fileSize, hash) if present
      decryptLogger.debug('Checking for encrypted metadata', {
        hasEncryptedMetadata: !!receipt.encryptedMetadata,
        currentFileName: receipt.fileName,
        currentFileSize: receipt.fileSize,
      });

      if (receipt.encryptedMetadata) {
        decryptLogger.info('Decrypting receipt metadata');
        try {
          const encryptedMetadataBytes = Uint8Array.from(atob(receipt.encryptedMetadata), (c) =>
            c.charCodeAt(0)
          );
          const decryptedMetadataBytes = await wallet.signingEnclave.decryptWithWalletKey(
            encryptedMetadataBytes,
            receipt.groupId
          );
          const decryptedMetadataJson = new TextDecoder().decode(decryptedMetadataBytes);
          const metadata = JSON.parse(decryptedMetadataJson) as {
            fileName: string;
            fileSize: number;
            hash: string;
          };

          decryptLogger.info('Metadata decrypted', {
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
          });

          // Return receipt with decrypted metadata
          return {
            ...receipt,
            transactionIds,
            transactionIdsEncrypted: false,
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            hash: metadata.hash,
          };
        } catch (metadataError) {
          decryptLogger.error(
            'Failed to decrypt metadata - this receipt may have been created with a different wallet',
            metadataError as Error
          );
          // Continue with placeholder values, but log the full error for debugging
          decryptLogger.error('Metadata decryption error details', {
            error: (metadataError as Error).message,
            groupId: receipt.groupId,
            hasEncryptedMetadata: !!receipt.encryptedMetadata,
          });
        }
      } else {
        decryptLogger.warn('No encrypted metadata found in receipt - created with old version');
      }

      // Return with decrypted transaction IDs (metadata might still be placeholder)
      return {
        ...receipt,
        transactionIds,
        transactionIdsEncrypted: false,
      };
    } catch (error) {
      decryptLogger.error('Failed to decrypt receipt', error as Error);
      throw new Error(`Failed to decrypt receipt: ${(error as Error).message}`);
    }
  }

  /**
   * Stamp multiple artifacts (files and text) to the Kaspa blockchain in a single batched transaction chain
   *
   * This method processes multiple artifacts separately but executes all transactions in one chain
   * using the same UTXO to avoid UTXO conflicts. Each artifact gets its own receipt.
   *
   * @param artifacts - Array of artifacts to stamp (files and text)
   * @param wallet - Wallet containing the mnemonic for signing
   * @param options - Stamping options
   * @returns Array of stamping results, one for each artifact
   */
  async stampMultipleArtifacts(
    artifacts: Array<{
      type: 'file' | 'text';
      file?: File;
      text?: string;
      filename?: string; // For text artifacts
    }>,
    wallet: SimpleWallet,
    options: {
      mode: StampingMode;
      compression?: boolean;
      includeDebugInfo?: boolean;
      walletSecret?: string;
      mnemonic?: string;
      priorityFee: bigint; // Priority fee in sompi (required)
    }
  ): Promise<StampingResult[]> {
    if (!this.isInitialized) {
      throw new Error('Professional SDK not initialized - call KaspaSDK.init() first');
    }

    if (!artifacts || artifacts.length === 0) {
      throw new Error('No artifacts provided for stamping');
    }

    const batchLogger = KaspaSDK.logger.child('batch-stamping');
    batchLogger.info('Batch stamping artifacts', { artifactCount: artifacts.length });

    // 1. Process each artifact separately to get individual processing results
    const artifactProcessingResults: Array<{
      artifact: (typeof artifacts)[0];
      file: File;
      processingResult: ProcessingResult;
    }> = [];

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      let file: File;

      if (artifact.type === 'file' && artifact.file) {
        file = artifact.file;
      } else if (artifact.type === 'text' && artifact.text) {
        // Convert text to File object
        const textBlob = new Blob([artifact.text], { type: 'text/plain' });
        file = new File([textBlob], artifact.filename || `text-${i + 1}.txt`, {
          type: 'text/plain',
        });
      } else {
        throw new Error(`Invalid artifact at index ${i}: missing file or text`);
      }

      batchLogger.info('Processing artifact', {
        index: i + 1,
        total: artifacts.length,
        fileName: file.name,
        fileSizeKB: (file.size / 1024).toFixed(2),
      });

      const processingResult = await this.processFileForStamping(
        file,
        options.mode,
        {
          compression: options.compression ?? true,
        },
        wallet
      );

      batchLogger.info('Artifact processed', {
        index: i + 1,
        chunkCount: processingResult.chunks.length,
      });

      artifactProcessingResults.push({
        artifact,
        file,
        processingResult,
      });
    }

    // 2. Use fast batched implementation with transaction chaining
    return await stampFiles(artifactProcessingResults, wallet, options, options.priorityFee);
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.rpcClient) {
      await this.rpcClient.disconnect();
      this.rpcClient = null;
    }
    this.isInitialized = false;
    KaspaSDK.instance = null;
  }
}
