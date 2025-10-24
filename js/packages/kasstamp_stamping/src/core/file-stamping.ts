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
 * @param getNetwork - Function to get network ID
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
  getNetwork: () => string,
  priorityFee: bigint
): Promise<StampingResult[]> {
  const startTime = Date.now();

  const batchLogger = stampLogger.child('batch');
  batchLogger.info('Starting batched fast stamping', {
    artifactCount: artifactProcessingResults.length,
  });

  // Get account and address information
  const accounts = wallet.accounts;
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts available in wallet');
  }
  const accountId = accounts[0].accountId;
  const receiveAddress = accounts[0].receiveAddress?.toString();
  const changeAddress = accounts[0].changeAddress?.toString();

  if (!receiveAddress || !changeAddress) {
    throw new Error('No receive or change address available');
  }

  // Get initial mature UTXO for starting the chain
  const utxos = await wallet.getUtxos(accountId);
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTXOs available for stamping');
  }

  // Debug: Log first UTXO properties to understand structure
  if (utxos.length > 0) {
    const firstUtxo = utxos[0];
    batchLogger.debug('UTXO properties', {
      keys: Object.keys(firstUtxo),
      blockDaaScore: firstUtxo.blockDaaScore.toString(),
      isCoinbase: firstUtxo.isCoinbase,
      amount: firstUtxo.amount.toString(),
    });
  }

  // All UTXOs are considered mature for stamping purposes
  // In Kaspa, UTXOs become spendable after they're confirmed
  const matureUtxos = utxos;

  if (matureUtxos.length === 0) {
    throw new Error('No mature UTXOs available. Please wait for pending transactions to confirm.');
  }

  batchLogger.info('Starting batched stamping', {
    matureUtxoCount: matureUtxos.length,
  });
  batchLogger.info('Using FAST transaction chaining - no confirmation waits');

  // Select the largest mature UTXO (same logic as single file stamping)
  const sortedUtxos = [...matureUtxos].sort((a, b) => Number(b.amount - a.amount));
  const largestUtxo = sortedUtxos[0];

  batchLogger.info('Using largest UTXO for batched stamping chain', {
    utxoValueKAS: (Number(largestUtxo.amount) / 1e8).toFixed(2),
  });

  // Create signing function using wallet's secure enclave (same as single file stamping)
  batchLogger.debug('Creating secure signing function from enclave');

  // Check if enclave is unlocked
  if (!wallet.signingEnclave) {
    throw new Error('Wallet does not have a signing enclave');
  }

  if (wallet.signingEnclave.isLocked()) {
    throw new Error('Signing enclave is locked. Please unlock your wallet first.');
  }

  if (!wallet.signingEnclave.hasMnemonic()) {
    throw new Error(
      'Signing enclave has no mnemonic stored. Please unlock your wallet with your recovery phrase.'
    );
  }

  // Create signing function that uses the enclave
  const signingFunction = async (transaction: PendingTransaction) => {
    await wallet.signingEnclave!.signWithAutoDiscovery(
      transaction,
      wallet.network,
      0 // accountIndex
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

  const networkId = getNetwork();

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

  return results;
}
