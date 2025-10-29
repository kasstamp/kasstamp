import { createLogger } from '@kasstamp/utils';
import { buildStampingPayload, type PayloadDebugInfo } from '@kasstamp/tx';
import type { SimpleWallet } from '@kasstamp/wallet';
import type {
  FullPayloadStructure,
  ProcessingResult,
  StampingEnvelope,
  StampingMode,
  StampingResult,
} from '../types';
import { serializePayload } from '@kasstamp/kasstamp_stamping';
import { submitTransactionChain } from './transaction-chain';
import { PendingTransaction } from '@kasstamp/kaspa_wasm_sdk';

/**
 * Options for file stamping
 */
export interface StampOptions {
  mode: StampingMode;
  compression?: boolean;
  includeDebugInfo?: boolean;
}

/**
 * Build unified stamping envelope (public or private mode)
 *
 * For PUBLIC mode:
 *   - Serializes full payload structure
 *   - Payload is plaintext
 *
 * For PRIVATE mode:
 *   - Serializes full payload structure
 *   - Chunk data is ALREADY encrypted by processor
 *   - NO additional encryption needed (would cause double encryption!)
 */
async function buildUnifiedEnvelope(
  fullPayload: FullPayloadStructure,
  mode: StampingMode,
  groupId: string
): Promise<StampingEnvelope> {
  const payload = serializePayload(fullPayload);
  return {
    metadata: {
      groupId,
      mode,
    },
    payload,
  };
}

/**
 * Stamp a file to the Kaspa blockchain using FAST transaction chaining
 *
 * This method uses manual private key derivation (same as accountsSend does internally)
 * and chains transactions using virtual UTXOs for maximum speed.
 *
 * NO confirmation waiting - all transactions are submitted in rapid succession!
 *
 * @param file - File to stamp
 * @param wallet - Wallet containing the mnemonic for signing
 * @param processingResult - Pre-processed file data (chunks, etc.)
 * @param options - Stamping options
 * @returns Complete stamping result with transaction IDs and receipt
 */
const stampLogger = createLogger('kasstamp:stamping:file');

/**
 * Stamp multiple artifacts to the Kaspa blockchain using FAST transaction chaining
 *
 * This method combines all artifacts into a single transaction chain using the same UTXO
 * to avoid UTXO conflicts. Each artifact gets its own receipt.
 *
 * @param artifactProcessingResults - Array of processed artifacts with their processing results
 * @param wallet - Wallet containing the mnemonic for signing
 * @param options - Stamping options
 * @param priorityFee - Fee in Sompi to use for priority
 * @returns Array of stamping results, one for each artifact
 */
export async function stampFiles(
  artifactProcessingResults: Array<{
    artifact: {
      type: 'file' | 'text';
      file?: File;
      text?: string;
      filename?: string;
    };
    file: File;
    processingResult: ProcessingResult;
  }>,
  wallet: SimpleWallet,
  options: StampOptions,
  priorityFee: bigint
): Promise<StampingResult[]> {
  const startTime = Date.now();

  const batchLogger = stampLogger.child('batch');
  batchLogger.info('Starting batched fast stamping', {
    artifactCount: artifactProcessingResults.length,
  });

  // CRITICAL: Get deterministic primary addresses (index 0) instead of trusting account descriptor
  // The account descriptor's addresses may change dynamically, but primary addresses are always consistent
  const primaryAddresses = await wallet.getPrimaryAddresses();
  const receiveAddress = primaryAddresses.receiveAddress;
  const changeAddress = primaryAddresses.changeAddress;

  batchLogger.debug('Account addresses for stamping', {
    receiveAddress,
    changeAddress,
    note: 'Using deterministic primary addresses (index 0) instead of account descriptor. All change outputs will go to the main changeAddress.',
  });

  // Get mature UTXOs (already sorted desc by amount by the wallet)
  const utxos = await wallet.getUtxos();
  if (!utxos || utxos.length === 0) {
    throw new Error('No mature UTXOs available for stamping');
  }

  batchLogger.info('Starting batched stamping', {
    matureUtxoCount: utxos.length,
  });
  batchLogger.info('Using FAST transaction chaining - no confirmation waits');

  // CRITICAL: Capture ORIGINAL UTXO addresses BEFORE any normalization happens
  // The UTXO addresses may be normalized later (for change routing), but we need the original
  // addresses for signing because transaction.addresses() uses the script public key, not the address field
  const originalUtxoAddresses = new Set<string>();
  for (const utxo of utxos) {
    const addr = utxo.address?.toString();
    if (addr) {
      originalUtxoAddresses.add(addr);
    }
  }

  // Track which addresses were used (for cleanup after spending)
  const addressesUsedInTransaction = new Set<string>(originalUtxoAddresses);

  // Select the largest mature UTXO (first entry due to sorting)
  const largestUtxo = utxos[0];
  const utxoAddress = largestUtxo.address?.toString() || 'unknown';

  batchLogger.info('Using largest UTXO for batched stamping chain', {
    utxoValueKAS: (Number(largestUtxo.amount) / 1e8).toFixed(2),
    utxoAddress,
    accountChangeAddress: changeAddress,
    utxoAddressMatchesChangeAddress: utxoAddress === changeAddress,
    note:
      utxoAddress !== changeAddress
        ? '⚠️ UTXO address differs from account changeAddress - change will be normalized to use account changeAddress'
        : '✅ UTXO address matches account changeAddress',
  });

  // Create signing function using wallet's secure enclave (same as single file stamping)
  batchLogger.debug('Creating secure signing function from enclave');

  if (wallet.signingEnclave.isLocked()) {
    throw new Error('Signing enclave is locked. Please unlock your wallet first.');
  }

  // Create signing function that uses the enclave
  // Pass the address derivation map for efficient key lookup (no scanning needed!)
  const signingFunction = async (transaction: PendingTransaction) => {
    // Get addresses that need signing from the transaction
    // This uses the script public keys, so it returns the ACTUAL addresses that need signing
    let requiredAddresses: string[];
    try {
      requiredAddresses = transaction.addresses();
      batchLogger.debug('Transaction requires signatures for addresses:', requiredAddresses);
    } catch (error) {
      batchLogger.warn(
        'Could not get transaction addresses, using original UTXO addresses',
        error as Error
      );
      // Fallback to original UTXO addresses if transaction.addresses() fails
      requiredAddresses = Array.from(originalUtxoAddresses);
    }

    // Get address derivation map from wallet for efficient signing
    // This allows direct key derivation instead of scanning 0-500 indices
    const addressDerivationMap = new Map<
      string,
      { accountIndex: number; addressIndex: number; isReceive: boolean }
    >();

    // CRITICAL: Always include primary addresses in the derivation map
    // These are the most commonly used addresses (receive[0] and change[0])
    const primaryAddresses = await wallet.getPrimaryAddresses();
    const receiveDerivation = wallet.getAddressDerivation(primaryAddresses.receiveAddress);
    const changeDerivation = wallet.getAddressDerivation(primaryAddresses.changeAddress);

    // Primary addresses are always at index 0, so if not found in map, derive them directly
    if (receiveDerivation) {
      addressDerivationMap.set(primaryAddresses.receiveAddress, receiveDerivation);
    } else {
      // Fallback: primary receive address is always at index 0
      addressDerivationMap.set(primaryAddresses.receiveAddress, {
        accountIndex: 0,
        addressIndex: 0,
        isReceive: true,
      });
    }
    if (changeDerivation) {
      addressDerivationMap.set(primaryAddresses.changeAddress, changeDerivation);
    } else {
      // Fallback: primary change address is always at index 0
      addressDerivationMap.set(primaryAddresses.changeAddress, {
        accountIndex: 0,
        addressIndex: 0,
        isReceive: false,
      });
    }

    // CRITICAL: Include ORIGINAL UTXO addresses in the derivation map
    // These are the addresses that actually need signing (from script public keys)
    for (const originalAddr of originalUtxoAddresses) {
      const derivation = wallet.getAddressDerivation(originalAddr);
      if (derivation) {
        addressDerivationMap.set(originalAddr, derivation);
      }
    }

    // CRITICAL: Also ensure all required addresses from transaction are in the map
    // This handles cases where transaction.addresses() returns addresses we didn't expect
    for (const requiredAddr of requiredAddresses) {
      if (!addressDerivationMap.has(requiredAddr)) {
        const derivation = wallet.getAddressDerivation(requiredAddr);
        if (derivation) {
          addressDerivationMap.set(requiredAddr, derivation);
          batchLogger.debug('Added required address to derivation map', {
            address: requiredAddr,
            derivation,
          });
        } else {
          batchLogger.warn(
            'Required address not found in wallet derivation map and no derivation available',
            {
              address: requiredAddr,
              note: 'Will fall back to scanning',
            }
          );
        }
      }
    }

    batchLogger.debug('Address derivation map prepared for signing', {
      mapSize: addressDerivationMap.size,
      addresses: Array.from(addressDerivationMap.keys()),
      originalUtxoAddresses: Array.from(originalUtxoAddresses),
      requiredAddresses,
      allRequiredInMap: requiredAddresses.every((addr) => addressDerivationMap.has(addr)),
      note: 'Includes primary addresses, original UTXO addresses, and any addresses required by the transaction',
    });

    await wallet.signingEnclave!.signWithAutoDiscovery(
      transaction,
      wallet.network,
      0, // accountIndex
      addressDerivationMap.size > 0 ? addressDerivationMap : undefined
    );
  };

  batchLogger.info('Secure signing function ready - enclave will auto-discover required keys');

  // 2. Combine all payloads from all artifacts into a single array (PARALLELIZED)
  const allPayloads: Uint8Array[] = [];
  const allDebugInfo: PayloadDebugInfo[] = [];
  const artifactPayloadRanges: Array<{ start: number; end: number; chunkCount: number }> = [];

  let currentPayloadIndex = 0;

  const batchStartTime = Date.now();
  batchLogger.debug('Processing artifacts with parallel envelope building', {
    artifactCount: artifactProcessingResults.length,
  });

  const artifactProcessingPromises = artifactProcessingResults.map(async ({ processingResult }) => {
    const groupId = processingResult.chunks[0]?.groupId;

    const chunkEnvelopePromises = processingResult.chunks.map(async (chunk) => {
      const fullPayload: FullPayloadStructure = {
        fileName: processingResult.originalFile.name,
        chunkIndex: chunk.index,
        totalChunks: processingResult.chunks.length,
        digest: chunk.digest,
        timestamp: new Date().toISOString(),
        chunkData: chunk.data,
      };

      return await buildUnifiedEnvelope(fullPayload, options.mode, groupId);
    });

    // Use only chunk envelopes - no manifest transactions needed
    const envelopes: StampingEnvelope[] = await Promise.all(chunkEnvelopePromises);

    const payloadPromises = envelopes.map(async (envelope) => {
      const payloadInfo = buildStampingPayload({
        metadata: envelope.metadata,
        chunkData: envelope.payload,
      });

      return {
        payload: payloadInfo.payload,
        debugInfo: options.includeDebugInfo ? payloadInfo : null,
      };
    });

    const payloadResults = await Promise.all(payloadPromises);

    return {
      payloads: payloadResults.map((r) => r.payload),
      debugInfo: payloadResults.map((r) => r.debugInfo).filter(Boolean),
      envelopeCount: envelopes.length,
    };
  });

  // Wait for all artifacts to be processed
  const artifactResults = await Promise.all(artifactProcessingPromises);

  // Combine results in order
  for (const result of artifactResults) {
    const startIndex = currentPayloadIndex;

    allPayloads.push(...result.payloads);
    allDebugInfo.push(...result.debugInfo);

    currentPayloadIndex += result.envelopeCount;

    const endIndex = currentPayloadIndex - 1;
    artifactPayloadRanges.push({
      start: startIndex,
      end: endIndex,
      chunkCount: result.envelopeCount,
    });

    batchLogger.debug('Artifact payloads added', {
      startIndex,
      endIndex,
      chunkCount: result.envelopeCount,
    });
  }

  const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
  batchLogger.info('All artifacts processed', {
    durationSeconds: batchDuration,
    mode: 'parallel',
  });

  batchLogger.info('Total payloads to chain', { transactionCount: allPayloads.length });

  // 4. Get RPC client for submitting transactions
  const wasmWallet = wallet.wasmWallet;
  if (!wasmWallet) {
    throw new Error('WASM wallet not available');
  }

  const rpcClient = wasmWallet.rpc;
  if (!rpcClient) {
    throw new Error('RPC client not available');
  }

  const networkId = wallet.network;

  const utxoValueKAS = Number(largestUtxo.amount) / 1e8;
  batchLogger.info('Starting batched transaction chain', {
    utxoValueKAS: utxoValueKAS.toFixed(4),
    transactionCount: allPayloads.length,
  });
  batchLogger.debug('No stamp outputs - everything goes to change except fees');

  const chainResult = await submitTransactionChain(
    largestUtxo, // Use ONLY the largest UTXO to minimize mass
    allPayloads,
    signingFunction,
    rpcClient,
    {
      receiveAddress,
      changeAddress,
      outputAmount: 0n, // NO explicit output - only change + payload!
      priorityFee,
      networkId,
    }
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  batchLogger.info('All batched transactions submitted', {
    transactionCount: chainResult.transactionIds.length,
    totalTimeSeconds: totalTime,
  });
  batchLogger.info('FAST MODE: No confirmation waits');

  // 6. Generate separate receipts and results for each artifact
  const results: StampingResult[] = [];

  for (let i = 0; i < artifactProcessingResults.length; i++) {
    const { file, processingResult } = artifactProcessingResults[i];
    const payloadRange = artifactPayloadRanges[i];

    // Extract transaction IDs for this artifact
    const artifactTransactionIds = chainResult.transactionIds.slice(
      payloadRange.start,
      payloadRange.end + 1
    );

    // Calculate fees for this artifact (proportional to its transactions)
    const artifactFees =
      (chainResult.totalFees * BigInt(artifactTransactionIds.length)) /
      BigInt(chainResult.transactionIds.length);

    // Create receipt with FULL privacy protection
    const totalTxs = artifactTransactionIds.length;
    const totalCost = Number(artifactFees) / 1e8;
    const groupId = processingResult.chunks[0]?.groupId;

    // For private mode: encrypt ALL sensitive data
    const isPrivate = options.mode === 'private';

    // Encrypt transaction IDs for private mode
    let transactionIdsField: string[] | string = artifactTransactionIds;
    let transactionIdsEncrypted = false;
    let encryptedMetadata: string | undefined;

    if (isPrivate && wallet.signingEnclave) {
      batchLogger.info('Encrypting sensitive receipt data for artifact', {
        artifactIndex: i + 1,
        totalArtifacts: artifactProcessingResults.length,
      });

      // Encrypt transaction IDs
      const txIdsJson = JSON.stringify(artifactTransactionIds);
      const txIdsBytes = new TextEncoder().encode(txIdsJson);
      const encryptedTxIds = await wallet.signingEnclave.encryptWithWalletKey(txIdsBytes, groupId);
      transactionIdsField = btoa(String.fromCharCode(...encryptedTxIds));
      transactionIdsEncrypted = true;
      batchLogger.debug('Transaction IDs encrypted', { count: artifactTransactionIds.length });

      // Encrypt metadata (fileName, fileSize, hash)
      const metadataToEncrypt = {
        fileName: file.name,
        fileSize: file.size,
        hash: processingResult.originalFile.originalDigest,
      };
      const metadataJson = JSON.stringify(metadataToEncrypt);
      const metadataBytes = new TextEncoder().encode(metadataJson);
      const encryptedMetadataBytes = await wallet.signingEnclave.encryptWithWalletKey(
        metadataBytes,
        groupId
      );
      encryptedMetadata = btoa(String.fromCharCode(...encryptedMetadataBytes));
      batchLogger.debug('Metadata encrypted', { fileName: file.name });
    }

    const receipt = {
      // Core identifiers
      id: artifactTransactionIds[0],
      timestamp: new Date().toISOString(),

      // File metadata (placeholder for private, real for public)
      fileName: isPrivate ? '[encrypted]' : file.name,
      fileSize: isPrivate ? 0 : file.size,
      hash: isPrivate ? '[encrypted]' : processingResult.originalFile.originalDigest,

      // Encrypted metadata (private mode only)
      encryptedMetadata,

      // Privacy & encryption
      privacy: options.mode,
      encrypted: isPrivate,
      compressed: processingResult.processing.compressed,
      groupId: isPrivate ? groupId : undefined,

      // Transaction data (ENCRYPTED in private mode!)
      transactionIds: transactionIdsField,
      transactionIdsEncrypted,
      chunkCount: totalTxs,

      // Cost & network
      totalCostKAS: totalCost,
      network: networkId,
      walletAddress: receiveAddress,
    };

    const result: StampingResult = {
      transactionIds: artifactTransactionIds,
      envelopes: [], // Could be populated with the actual envelopes if needed
      processingResult,
      receipt,
      debugInfo: options.includeDebugInfo
        ? {
            payloadStructures: allDebugInfo.slice(payloadRange.start, payloadRange.end + 1),
            estimatedMasses: allDebugInfo
              .slice(payloadRange.start, payloadRange.end + 1)
              .map((d) => d.massEstimate.totalEstimate),
          }
        : undefined,
    };

    results.push(result);

    batchLogger.info('Receipt generated', {
      receiptIndex: i + 1,
      fileName: file.name,
      transactionCount: artifactTransactionIds.length,
      costKAS: totalCost.toFixed(6),
    });
  }

  // Cleanup: After spending UTXOs from derived addresses, unregister those addresses
  // if they no longer have any UTXOs. Primary addresses are never unregistered.
  const addressesToCheckForCleanup = Array.from(addressesUsedInTransaction).filter(
    (addr) => addr !== receiveAddress && addr !== changeAddress
  );

  if (addressesToCheckForCleanup.length > 0) {
    batchLogger.debug('Checking derived addresses for cleanup after transaction', {
      addressesToCheck: addressesToCheckForCleanup,
    });

    // Wait a bit for the UTXO context to update after transaction submission
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await wallet.cleanupEmptyAddresses(addressesToCheckForCleanup);
  }

  return results;
}
