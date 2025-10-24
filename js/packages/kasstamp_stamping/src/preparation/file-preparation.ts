import { createLogger } from '@kasstamp/utils';
import { gzipBytes, sha256Hex } from '@kasstamp/crypto';
import { splitArtifact, type Chunk as ChunkingChunk } from '@kasstamp/chunking';
import { v4 as uuidv4 } from 'uuid';
import type { ProcessingResult, ProcessingOptions, Chunk } from '../types';
import { KASPA_CONSTRAINTS } from '../constants';
import type { ISecureSigningEnclave } from '@kasstamp/wallet';

const prepareLogger = createLogger('kasstamp:stamping:preparation');

export async function prepareFileForPublicMode(
  file: File,
  options?: Partial<ProcessingOptions>
): Promise<ProcessingResult> {
  prepareLogger.debug('prepareFileForPublicMode called', {
    fileName: file.name,
    fileSize: file.size,
  });
  prepareLogger.debug('Preparation options', { options });

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer as ArrayBuffer);
  prepareLogger.debug('File converted to Uint8Array', { length: data.length });

  const originalDigest = await sha256Hex(data);
  prepareLogger.debug('Original digest calculated', { digest: originalDigest });

  const groupId = options?.groupId || uuidv4();
  prepareLogger.debug('Group ID generated', { groupId });

  // Compression defaults to true unless explicitly disabled
  const shouldCompress = options?.compression !== false;
  prepareLogger.debug(`STAMPING: Compression: ${shouldCompress ? 'ENABLED' : 'DISABLED'}`);

  let processedData = data;
  let compressed = false;
  let compressionRatio: number | undefined;

  if (shouldCompress) {
    prepareLogger.debug('Attempting compression');
    try {
      const compressedData = await gzipBytes(data);
      prepareLogger.debug('Compression completed', {
        original: data.length,
        compressed: compressedData.length,
      });
      if (compressedData.length < data.length) {
        processedData = new Uint8Array(compressedData);
        compressed = true;
        compressionRatio = data.length / compressedData.length;
        prepareLogger.debug('Compression successful', { ratio: compressionRatio });
      } else {
        prepareLogger.warn('Compression did not reduce file size, skipping compression');
      }
    } catch (e) {
      prepareLogger.error('Failed to compress data', e as Error);
      // Continue without compression if it fails
    }
  } else {
    prepareLogger.debug('Compression disabled');
  }

  const maxChunkSize = KASPA_CONSTRAINTS.MAX_SAFE_PAYLOAD_SIZE;
  let chunks: Chunk[] = [];
  let isChunked = false;

  prepareLogger.debug('Processed data info', { length: processedData.length, maxChunkSize });

  if (processedData.length > maxChunkSize) {
    prepareLogger.debug('Data needs chunking, calling splitArtifact');
    isChunked = true;
    const splitChunks = await splitArtifact(processedData, {
      chunkSize: maxChunkSize,
      groupId,
      minChunks: 1,
    });
    prepareLogger.debug('splitArtifact completed', { chunkCount: splitChunks.length });

    chunks = splitChunks.map(
      (c: ChunkingChunk): Chunk => ({
        groupId: c.groupId,
        index: c.index,
        total: c.total,
        data: c.data,
        digest: c.digest,
      })
    );

    // No manifest needed - chunks contain all necessary information
  } else {
    prepareLogger.debug('Data fits in single chunk');
    chunks = [
      {
        groupId,
        index: 0,
        total: 1,
        data: processedData,
        digest: await sha256Hex(processedData),
      },
    ];
  }

  prepareLogger.debug('Building result object');
  const result: ProcessingResult = {
    originalFile: {
      name: file.name,
      size: file.size,
      originalDigest,
    },
    processing: {
      compressed,
      compressionRatio,
      encrypted: false,
      chunked: isChunked,
      totalProcessedSize: processedData.length,
    },
    chunks,
  };

  // Fee estimation removed from processor - now handled by SDK
  prepareLogger.debug('Result completed', { result });
  return result;
}

export async function prepareFileForPrivateMode(
  file: File,
  enclave: ISecureSigningEnclave,
  options?: Partial<ProcessingOptions>
): Promise<ProcessingResult> {
  prepareLogger.debug('Private mode processing start');
  prepareLogger.debug('Processing file for private mode', {
    fileName: file.name,
    fileSize: file.size,
  });
  prepareLogger.debug('Enclave status', { provided: !!enclave });

  // Validate enclave
  if (!enclave) {
    prepareLogger.error('Signing enclave is required for private mode');
    throw new Error('Signing enclave is required for private mode');
  }

  const status = enclave.getStatus();
  prepareLogger.debug(`🔐 Enclave status BEFORE processing:`, {
    isLocked: status.isLocked,
    hasMnemonic: status.hasMnemonic,
  });

  if (enclave.isLocked()) {
    prepareLogger.error('Signing enclave is locked. Please unlock your wallet first.');
    throw new Error('Signing enclave is locked. Please unlock your wallet first.');
  }
  if (!enclave.hasMnemonic()) {
    prepareLogger.error('Signing enclave has no mnemonic stored.');
    throw new Error('Signing enclave has no mnemonic stored.');
  }

  prepareLogger.debug('Enclave validation passed - proceeding with processing');

  prepareLogger.debug('Reading file into memory');
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer as ArrayBuffer);
  prepareLogger.debug('File loaded into memory', { bytes: data.length });

  prepareLogger.debug('Computing original digest');
  const originalDigest = await sha256Hex(data);
  prepareLogger.debug('Original digest computed', { digest: originalDigest });

  const groupId = options?.groupId || uuidv4();
  prepareLogger.debug('Group ID', { groupId });

  // Compression defaults to true unless explicitly disabled
  const shouldCompress = options?.compression !== false;
  prepareLogger.debug(
    `⚙️ Compression: ${shouldCompress ? 'ENABLED' : 'DISABLED'} (user option: ${options?.compression})`
  );

  let processedData = data;
  let compressed = false;
  let compressionRatio: number | undefined;

  // First compress if enabled
  if (shouldCompress) {
    prepareLogger.debug(`🗜️ Starting compression...`);
    try {
      const compressedData = await gzipBytes(data);
      prepareLogger.debug(`📦 Compression result: ${data.length} → ${compressedData.length} bytes`);
      if (compressedData.length < data.length) {
        processedData = new Uint8Array(compressedData);
        compressed = true;
        compressionRatio = data.length / compressedData.length;
        prepareLogger.debug(`✅ Compression successful: ratio ${compressionRatio.toFixed(2)}x`);
      } else {
        prepareLogger.warn('⚠️ Compression did not reduce file size, skipping compression.');
      }
    } catch (e) {
      prepareLogger.error('Compression failed', e as Error);
      // Continue without compression if it fails
    }
  } else {
    prepareLogger.debug(`⏭️ Compression disabled by config`);
  }

  // Then encrypt with wallet-derived key from enclave (private key never exposed!)
  prepareLogger.debug(`🔐 ====== STARTING ENCRYPTION ======`);
  prepareLogger.debug(`🔐 Data to encrypt: ${processedData.length} bytes`);
  prepareLogger.debug(`🔐 Group ID for encryption: ${groupId}`);
  prepareLogger.debug(`🔐 About to call enclave.encryptWithWalletKey()...`);

  const encryptStartTime = Date.now();
  let encryptedData: Uint8Array;

  try {
    encryptedData = await enclave.encryptWithWalletKey(processedData, groupId);
    const encryptDuration = Date.now() - encryptStartTime;
    prepareLogger.debug(
      `✅ Encryption complete: ${processedData.length} → ${encryptedData.length} bytes (took ${encryptDuration}ms)`
    );
  } catch (error) {
    const _encryptDuration = Date.now() - encryptStartTime;
    prepareLogger.error('Encryption failed', error as Error);
    throw error;
  }

  prepareLogger.debug(`🔐 ====== ENCRYPTION FINISHED ======`);

  // Compute hash of encrypted data for verification (doesn't leak original file info)
  const encryptedDataHash = await sha256Hex(encryptedData);
  prepareLogger.debug(`🔑 Encrypted data hash: ${encryptedDataHash}`);

  const maxChunkSize = KASPA_CONSTRAINTS.MAX_SAFE_PAYLOAD_SIZE;
  let chunks: Chunk[] = [];
  let isChunked = false;

  if (encryptedData.length > maxChunkSize) {
    isChunked = true;
    const splitChunks = await splitArtifact(encryptedData, {
      chunkSize: maxChunkSize,
      groupId,
      minChunks: 1,
    });
    chunks = splitChunks.map(
      (c: ChunkingChunk): Chunk => ({
        groupId: c.groupId,
        index: c.index,
        total: c.total,
        data: c.data,
        digest: c.digest,
      })
    );

    // No manifest needed - chunks contain all necessary information
  } else {
    chunks = [
      {
        groupId,
        index: 0,
        total: 1,
        data: encryptedData,
        digest: await sha256Hex(encryptedData),
      },
    ];
  }

  const result: ProcessingResult = {
    originalFile: {
      name: file.name,
      size: file.size,
      originalDigest,
      encryptedDigest: encryptedDataHash, // Hash of encrypted data (privacy-safe)
    },
    processing: {
      compressed,
      compressionRatio,
      encrypted: true,
      encryptedWithWalletKey: true,
      chunked: isChunked,
      totalProcessedSize: encryptedData.length,
    },
    chunks,
  };

  // Fee estimation removed from processor - now handled by SDK
  return result;
}

export async function prepareTextForPublicMode(
  text: string,
  options?: Partial<ProcessingOptions>
): Promise<ProcessingResult> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const originalDigest = await sha256Hex(data);
  const groupId = options?.groupId || uuidv4();

  // Compression defaults to true unless explicitly disabled
  const shouldCompress = options?.compression !== false;

  let processedData = data;
  let compressed = false;
  let compressionRatio: number | undefined;

  if (shouldCompress) {
    try {
      const compressedData = await gzipBytes(data);
      if (compressedData.length < data.length) {
        processedData = new Uint8Array(compressedData);
        compressed = true;
        compressionRatio = data.length / compressedData.length;
      } else {
        prepareLogger.warn('Compression did not reduce text size, skipping compression.');
      }
    } catch (e) {
      prepareLogger.error('Failed to compress text data', e as Error);
      // Continue without compression if it fails
    }
  }

  const maxChunkSize = KASPA_CONSTRAINTS.MAX_SAFE_PAYLOAD_SIZE;
  let chunks: Chunk[] = [];
  let isChunked = false;

  if (processedData.length > maxChunkSize) {
    isChunked = true;
    const splitChunks = await splitArtifact(processedData, {
      chunkSize: maxChunkSize,
      groupId,
      minChunks: 1,
    });
    chunks = splitChunks.map(
      (c: ChunkingChunk): Chunk => ({
        groupId: c.groupId,
        index: c.index,
        total: c.total,
        data: c.data,
        digest: c.digest,
      })
    );

    // No manifest needed - chunks contain all necessary information
  } else {
    chunks = [
      {
        groupId,
        index: 0,
        total: 1,
        data: processedData,
        digest: await sha256Hex(processedData),
      },
    ];
  }

  const result: ProcessingResult = {
    originalFile: {
      name: 'text-input.txt',
      size: data.length,
      originalDigest,
    },
    processing: {
      compressed,
      compressionRatio,
      encrypted: false,
      chunked: isChunked,
      totalProcessedSize: processedData.length,
    },
    chunks,
  };

  // Fee estimation removed from processor - now handled by SDK
  return result;
}

export async function prepareTextForPrivateMode(
  text: string,
  enclave: ISecureSigningEnclave,
  options?: Partial<ProcessingOptions>
): Promise<ProcessingResult> {
  // Validate enclave
  if (!enclave) {
    throw new Error('Signing enclave is required for private mode');
  }
  if (enclave.isLocked()) {
    throw new Error('Signing enclave is locked. Please unlock your wallet first.');
  }
  if (!enclave.hasMnemonic()) {
    throw new Error('Signing enclave has no mnemonic stored.');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const originalDigest = await sha256Hex(data);
  const groupId = options?.groupId || uuidv4();

  // Compression defaults to true unless explicitly disabled
  const shouldCompress = options?.compression !== false;

  let processedData = data;
  let compressed = false;
  let compressionRatio: number | undefined;

  // First compress if enabled
  if (shouldCompress) {
    try {
      const compressedData = await gzipBytes(data);
      if (compressedData.length < data.length) {
        processedData = new Uint8Array(compressedData);
        compressed = true;
        compressionRatio = data.length / compressedData.length;
        prepareLogger.debug(
          `🗜️ Text compression successful: ${data.length} → ${compressedData.length} bytes (${compressionRatio.toFixed(2)}x)`
        );
      } else {
        prepareLogger.warn('Compression did not reduce text size, skipping compression.');
      }
    } catch (e) {
      prepareLogger.error('Failed to compress text data', e as Error);
      // Continue without compression if it fails
    }
  }

  // Then encrypt with wallet-derived key from enclave (private key never exposed!)
  prepareLogger.debug(`🔐 Encrypting text with enclave (groupId: ${groupId})...`);
  const encryptedData = await enclave.encryptWithWalletKey(processedData, groupId);
  prepareLogger.debug(
    `✅ Encryption complete: ${processedData.length} → ${encryptedData.length} bytes`
  );

  // Compute hash of encrypted data for verification
  const encryptedDataHash = await sha256Hex(encryptedData);
  prepareLogger.debug(`🔑 Encrypted data hash: ${encryptedDataHash}`);

  const maxChunkSize = KASPA_CONSTRAINTS.MAX_SAFE_PAYLOAD_SIZE;
  let chunks: Chunk[] = [];
  let isChunked = false;

  if (encryptedData.length > maxChunkSize) {
    isChunked = true;
    const splitChunks = await splitArtifact(encryptedData, {
      chunkSize: maxChunkSize,
      groupId,
      minChunks: 1,
    });
    chunks = splitChunks.map(
      (c: ChunkingChunk): Chunk => ({
        groupId: c.groupId,
        index: c.index,
        total: c.total,
        data: c.data,
        digest: c.digest,
      })
    );

    // No manifest needed - chunks contain all necessary information
  } else {
    chunks = [
      {
        groupId,
        index: 0,
        total: 1,
        data: encryptedData,
        digest: await sha256Hex(encryptedData),
      },
    ];
  }

  const result: ProcessingResult = {
    originalFile: {
      name: 'text-input.txt',
      size: data.length,
      originalDigest,
      encryptedDigest: encryptedDataHash, // Hash of encrypted data
    },
    processing: {
      compressed,
      compressionRatio,
      encrypted: true,
      encryptedWithWalletKey: true,
      chunked: isChunked,
      totalProcessedSize: encryptedData.length,
    },
    chunks,
  };

  // Fee estimation removed from processor - now handled by SDK
  return result;
}

/**
 * Convert Uint8Array to base64 string (browser-compatible)
 */
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

export function getRawProcessingData(result: ProcessingResult): {
  originalFile: ProcessingResult['originalFile'];
  processing: ProcessingResult['processing'];
  chunks: Array<{
    groupId: string;
    index: number;
    total: number;
    data: string; // base64 encoded
    digest: string;
  }>;
} {
  // Convert Uint8Array to base64 string for JSON serialization
  const serializableChunks = result.chunks.map((chunk) => ({
    ...chunk,
    data: uint8ArrayToBase64(chunk.data), // Browser-compatible base64 encoding
  }));

  return {
    ...result,
    chunks: serializableChunks,
  };
}
