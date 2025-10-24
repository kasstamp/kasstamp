import type { PayloadDebugInfo } from '@kasstamp/tx';

export type StampingMode = 'public' | 'private';

/**
 * Receipt structure for file reconstruction
 *
 * PRIVACY NOTE:
 * - For PUBLIC mode: All metadata is in plaintext
 * - For PRIVATE mode: EVERYTHING is encrypted (fileName, fileSize, hash, transactionIds)
 *   Only someone with the wallet can decrypt and access the data.
 *   This provides maximum privacy - no metadata leakage at all!
 */
export interface StampingReceipt {
  // Core identifiers
  id: string; // First transaction ID (always visible for receipt identification)
  timestamp: string; // ISO 8601 timestamp

  // File metadata (FULLY ENCRYPTED in private mode!)
  fileName: string; // Plaintext for public, encrypted base64 string for private
  fileSize: number; // Actual size for public, encrypted or 0 for private
  hash: string; // Original hash for public, encrypted base64 string for private

  // Encrypted metadata (private mode only)
  encryptedMetadata?: string; // Base64 encrypted JSON with {fileName, fileSize, hash}

  // Privacy & encryption
  privacy: 'public' | 'private';
  encrypted: boolean;
  compressed: boolean;
  groupId?: string; // Required for private mode decryption

  // Transaction data (ENCRYPTED in private mode!)
  transactionIds: string[] | string; // Array for public, encrypted string for private
  transactionIdsEncrypted?: boolean; // True if transactionIds is encrypted
  chunkCount: number; // Number of chunks

  // Cost & network
  totalCostKAS: number;
  network?: string;
  walletAddress?: string;
}

/**
 * Reconstruction result
 */
export interface ReconstructionResult {
  filename: string;
  data: Uint8Array;
  originalHash: string;
  reconstructedHash: string;
  matched: boolean;
  chunks: number;
  decompressed: boolean;
  decrypted: boolean;
}

/**
 * Progress callback for reconstruction
 */
export type ReconstructionProgressCallback = (progress: {
  stage: 'fetching' | 'assembling' | 'decompressing' | 'decrypting' | 'complete';
  current: number;
  total: number;
  message: string;
}) => void;

export interface Chunk {
  groupId: string;
  index: number;
  total: number;
  data: Uint8Array;
  digest: string;
}

export interface ProcessingResult {
  originalFile: {
    name: string;
    size: number;
    originalDigest: string;
    encryptedDigest?: string; // Hash of encrypted data (for private mode)
  };
  processing: {
    compressed: boolean;
    compressionRatio?: number;
    encrypted: boolean;
    encryptedWithWalletKey?: boolean;
    chunked: boolean;
    totalProcessedSize: number;
  };
  chunks: Chunk[];
  rawEnvelopes?: Array<{
    version: number;
    mime: string;
    payload: {
      length: number;
      preview?: string;
    };
    meta: Record<string, string | number | boolean>;
  }>; // Raw envelope data for transaction creation
}

export interface ProcessingOptions {
  mode: StampingMode;
  compression?: boolean;
  groupId?: string;
  walletPrivateKey?: Uint8Array; // For private mode encryption
}

/**
 * Full payload structure (before encryption for private mode)
 */
export interface FullPayloadStructure {
  fileName: string;
  chunkIndex?: number;
  totalChunks: number;
  digest: string;
  timestamp: string;
  chunkData?: Uint8Array; // Actual chunk data (for chunks only)
}

/**
 * Stamping envelope for transaction payload (UNIFIED MODEL)
 *
 * For PUBLIC mode:
 *   - metadata contains groupId + mode
 *   - payload contains plaintext serialized FullPayloadStructure
 *
 * For PRIVATE mode:
 *   - metadata contains groupId + mode
 *   - payload contains ENCRYPTED serialized FullPayloadStructure
 */
export interface StampingEnvelope {
  metadata: {
    groupId: string;
    mode: StampingMode; // 'public' or 'private'
  };
  payload: Uint8Array; // Serialized FullPayloadStructure (plaintext or encrypted)
}

/**
 * Complete stamping result with transaction IDs
 */
export interface StampingResult {
  transactionIds: string[];
  envelopes: StampingEnvelope[];
  processingResult: ProcessingResult;
  receipt: {
    // Core identifiers
    id: string;
    timestamp: string;

    // File metadata (FULLY ENCRYPTED in private mode)
    fileName: string;
    fileSize: number;
    hash: string;

    // Encrypted metadata (private mode only)
    encryptedMetadata?: string; // Base64 encrypted JSON with {fileName, fileSize, hash}

    // Privacy & encryption
    privacy: StampingMode;
    encrypted: boolean;
    compressed: boolean;
    groupId?: string;

    // Transaction data (ENCRYPTED in private mode!)
    transactionIds: string[] | string; // Array for public, encrypted string for private
    transactionIdsEncrypted?: boolean; // True if transactionIds is encrypted
    chunkCount: number;

    // Cost & network
    totalCostKAS: number;
    network: string;
    walletAddress: string;
  };
  debugInfo?: {
    payloadStructures: PayloadDebugInfo[];
    estimatedMasses: number[];
  };
}
