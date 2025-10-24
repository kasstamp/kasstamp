import { createLogger } from '@kasstamp/utils';
import { decodeStampingPayload } from '@kasstamp/tx';
import { gunzipBytes, sha256Hex } from '@kasstamp/crypto';
import type { SimpleWallet } from '@kasstamp/wallet';
import { KaspaApiClient, type NetworkType } from '@kasstamp/kaspa_api';
import { deserializePayload } from '../preparation';
import type {
  StampingReceipt,
  ReconstructionProgressCallback,
  ReconstructionResult,
} from '../types';

/**
 * Reconstruct file from stamping receipt
 *
 * @param receipt - Stamping receipt with transaction IDs
 * @param wallet - Wallet to fetch transactions from
 * @param onProgress - Optional progress callback
 * @returns Reconstructed file data
 */
const reconstructLogger = createLogger('kasstamp:sdk:reconstruction');

export async function reconstructFileFromReceipt(
  receipt: StampingReceipt,
  wallet: SimpleWallet | null,
  onProgress?: ReconstructionProgressCallback
): Promise<ReconstructionResult> {
  // Only require wallet for private/encrypted receipts
  const isEncrypted = receipt.privacy === 'private' || receipt.encrypted === true;

  if (isEncrypted && (!wallet || !wallet.wasmWallet)) {
    throw new Error('WASM wallet required for private/encrypted receipts');
  }

  let accountId: string | undefined;
  if (wallet && wallet.wasmWallet) {
    accountId = wallet.accounts?.[0]?.accountId;
    if (isEncrypted && !accountId) {
      throw new Error('No account ID available for private receipt');
    }
  }

  // Get transaction IDs from receipt (decrypt if encrypted)
  let transactionIds: string[];

  if (typeof receipt.transactionIds === 'string' && receipt.transactionIdsEncrypted) {
    // Transaction IDs are encrypted - need wallet to decrypt
    reconstructLogger.info('Transaction IDs are encrypted, decrypting');

    if (!wallet || !wallet.signingEnclave) {
      throw new Error('Wallet with signing enclave required to decrypt transaction IDs');
    }
    if (wallet.signingEnclave.isLocked()) {
      throw new Error('Wallet signing enclave is locked. Please unlock your wallet first.');
    }
    if (!wallet.signingEnclave.hasMnemonic()) {
      throw new Error('Wallet signing enclave has no mnemonic stored.');
    }
    if (!receipt.groupId) {
      throw new Error('Receipt missing groupId - cannot decrypt transaction IDs');
    }

    try {
      // Decode base64 to bytes
      const encryptedBytes = Uint8Array.from(atob(receipt.transactionIds), (c) => c.charCodeAt(0));
      reconstructLogger.debug('Decrypting transaction IDs', {
        encryptedBytes: encryptedBytes.length,
      });

      // Decrypt with enclave
      const decryptedBytes = await wallet.signingEnclave.decryptWithWalletKey(
        encryptedBytes,
        receipt.groupId
      );

      // Parse JSON
      const decryptedJson = new TextDecoder().decode(decryptedBytes);
      transactionIds = JSON.parse(decryptedJson) as string[];

      reconstructLogger.info('Transaction IDs decrypted', { count: transactionIds.length });
    } catch (error) {
      reconstructLogger.error('Failed to decrypt transaction IDs', error as Error);
      throw new Error(`Failed to decrypt transaction IDs: ${(error as Error).message}`);
    }
  } else if (Array.isArray(receipt.transactionIds)) {
    // Transaction IDs are plaintext
    transactionIds = receipt.transactionIds;
    reconstructLogger.debug('Using plaintext transaction IDs', { count: transactionIds.length });
  } else {
    throw new Error('Invalid receipt format: transactionIds must be array or encrypted string');
  }

  onProgress?.({
    stage: 'fetching',
    current: 0,
    total: transactionIds.length,
    message: 'Fetching transactions from blockchain...',
  });

  // Map network string to NetworkType (do once outside loop)
  if (!receipt.network) {
    throw new Error('Receipt does not contain network information. Cannot reconstruct file.');
  }

  let networkType: NetworkType;
  const networkStr = receipt.network;
  if (networkStr === 'testnet-10') {
    networkType = 'testnet-10';
  } else if (networkStr === 'mainnet') {
    networkType = 'mainnet';
  } else {
    throw new Error(
      `Invalid network in receipt: ${networkStr}. Only 'mainnet' and 'testnet-10' are supported.`
    );
  }

  // Create API client once
  const apiClient = new KaspaApiClient({ network: networkType });

  // Fetch chunks in parallel with concurrency limit
  const CONCURRENCY = 10;
  const chunkPayloads: Array<{ index: number; data: Uint8Array; encrypted?: boolean }> = [];
  let completed = 0;

  // Helper function to fetch a single chunk
  const fetchChunk = async (txId: string, index: number): Promise<void> => {
    try {
      // Fetch from blockchain using Kaspa REST API
      const { data: txData, error } = await apiClient.getTransactionWithPayload(txId);

      if (error || !txData) {
        throw new Error(`Failed to fetch transaction ${txId}: ${error || 'No data returned'}`);
      }

      // Extract payload from transaction
      const txDataWithPayload = txData as { payload?: string };
      const payloadHex = txDataWithPayload.payload;
      if (!payloadHex || payloadHex === '00' || payloadHex === '') {
        throw new Error(`Transaction ${txId} has no payload data`);
      }

      // Decode payload using the payload decoder
      const decoded = decodeStampingPayload(payloadHex);

      // The decoded.chunkData is now the unified payload (serialized FullPayloadStructure)
      // It's either plaintext or encrypted depending on decoded.metadata.encrypted flag
      chunkPayloads.push({
        index,
        data: decoded.chunkData, // Store unified payload (will deserialize later)
        encrypted: decoded.metadata.encrypted === true, // Track if encrypted
      });

      completed++;
      onProgress?.({
        stage: 'fetching',
        current: completed,
        total: transactionIds.length,
        message: `Fetching chunk ${completed}/${transactionIds.length}...`,
      });
    } catch (error) {
      throw new Error(`Failed to fetch chunk ${index} from transaction ${txId}: ${error}`);
    }
  };

  // Process chunks in batches of CONCURRENCY
  for (let i = 0; i < transactionIds.length; i += CONCURRENCY) {
    const batch = transactionIds.slice(i, i + CONCURRENCY);
    const promises = batch.map((txId, batchIndex) => fetchChunk(txId, i + batchIndex));

    await Promise.all(promises);
  }

  if (chunkPayloads.length === 0) {
    throw new Error('No chunk data found in transactions');
  }

  // Sort chunks by index to ensure correct order
  chunkPayloads.sort((a, b) => a.index - b.index);

  onProgress?.({
    stage: 'assembling',
    current: 0,
    total: chunkPayloads.length,
    message: `Assembling ${chunkPayloads.length} chunks...`,
  });

  // Deserialize payload
  // Note: deserializePayload is already imported at the top

  // Process each chunk: deserialize to extract chunk data
  const deserializedChunks: Uint8Array[] = [];

  for (const chunk of chunkPayloads) {
    const payloadData = chunk.data;

    // Deserialize the unified payload structure
    // This gives us metadata + (possibly encrypted/compressed) chunk data
    const fullPayload = deserializePayload(payloadData);

    // For encrypted files: chunks are NOT individually encrypted!
    // The file was encrypted FIRST (and possibly compressed), then split into chunks.
    // So we just collect the chunk data as-is.
    if (fullPayload.chunkData) {
      deserializedChunks.push(fullPayload.chunkData);
      reconstructLogger.debug('Chunk extracted', {
        chunkIndex: chunk.index,
        chunkSize: fullPayload.chunkData.length,
      });
    }
  }

  // Reassemble all chunks into one big buffer
  const totalSize = deserializedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const reassembled = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of deserializedChunks) {
    reassembled.set(chunk, offset);
    offset += chunk.length;
  }

  reconstructLogger.debug('All chunks reassembled', {
    totalSize,
    isEncrypted,
    isCompressed: receipt.compressed,
  });

  let finalData = reassembled;
  let decompressed = false;
  const decrypted = isEncrypted;

  // Now decrypt the ENTIRE file if needed (must happen BEFORE decompression!)
  if (isEncrypted) {
    if (!wallet || !wallet.signingEnclave) {
      throw new Error('Wallet with signing enclave is required for private/encrypted receipts');
    }
    if (wallet.signingEnclave.isLocked()) {
      throw new Error('Wallet signing enclave is locked. Please unlock your wallet first.');
    }
    if (!wallet.signingEnclave.hasMnemonic()) {
      throw new Error('Wallet signing enclave has no mnemonic stored.');
    }
    if (!receipt.groupId) {
      throw new Error('Receipt missing groupId - cannot decrypt private stamping');
    }

    onProgress?.({
      stage: 'decrypting',
      current: 0,
      total: 1,
      message: 'Decrypting file...',
    });

    reconstructLogger.debug('Decrypting entire file with enclave', {
      groupId: receipt.groupId,
      encryptedSize: reassembled.length,
    });

    try {
      const decryptedData = await wallet.signingEnclave.decryptWithWalletKey(
        reassembled,
        receipt.groupId
      );
      finalData = new Uint8Array(decryptedData);
      reconstructLogger.debug('File decryption complete', {
        encryptedSize: reassembled.length,
        decryptedSize: decryptedData.length,
      });
    } catch (decryptError) {
      reconstructLogger.error('File decryption failed', {
        groupId: receipt.groupId,
        encryptedSize: reassembled.length,
        error: (decryptError as Error).message,
      });
      throw new Error(`Failed to decrypt file: ${(decryptError as Error).message}`);
    }
  }

  // Decompress if needed (AFTER decryption and deserialization!)
  if (receipt.compressed) {
    onProgress?.({
      stage: 'decompressing',
      current: 0,
      total: 1,
      message: 'Decompressing file...',
    });

    const decompressedData = await gunzipBytes(finalData);
    finalData = new Uint8Array(decompressedData);
    decompressed = true;
    reconstructLogger.debug('Decompression complete', { decompressedBytes: finalData.length });
  }

  // Calculate hash of reconstructed file
  const reconstructedHash = await sha256Hex(finalData);

  onProgress?.({
    stage: 'complete',
    current: 1,
    total: 1,
    message: 'File reconstruction complete!',
  });

  return {
    filename: receipt.fileName,
    data: finalData,
    originalHash: receipt.hash,
    reconstructedHash,
    matched: reconstructedHash === receipt.hash,
    chunks: chunkPayloads.length,
    decompressed,
    decrypted,
  };
}

/**
 * Download reconstructed file to user's device
 *
 * @param result - Reconstruction result
 */
export function downloadReconstructedFile(result: ReconstructionResult): void {
  // Ensure Blob receives an ArrayBuffer (not a SharedArrayBuffer-backed view)
  // Create a fresh ArrayBuffer and copy bytes into it
  const sourceView = new Uint8Array(
    result.data.buffer,
    result.data.byteOffset,
    result.data.byteLength
  );
  const arrayBuffer = new ArrayBuffer(sourceView.byteLength);
  new Uint8Array(arrayBuffer).set(sourceView);
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename || 'reconstructed-file';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
