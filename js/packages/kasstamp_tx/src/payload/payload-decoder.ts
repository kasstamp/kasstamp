/**
 * Stamping metadata structure
 *
 * @internal
 */
export interface StampingMetadata {
  groupId?: string;
  mode?: string;
  fileName?: string;
  chunkIndex?: number;
  totalChunks?: number;
  digest?: string;
  timestamp?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Decoded payload information
 */
export interface DecodedPayload {
  /** Total payload size in bytes */
  totalBytes: number;
  /** Metadata length in bytes */
  metadataLength: number;
  /** Parsed metadata object */
  metadata: StampingMetadata;
  /** Chunk data size in bytes */
  chunkDataSize: number;
  /** Full chunk data (raw binary) */
  chunkData: Uint8Array;
  /** First 256 bytes of chunk data (for preview/display) */
  chunkDataPreview: Uint8Array;
  /** Whether separator is valid (should be 4 zero bytes) */
  validSeparator: boolean;
  /** Separator bytes */
  separator: Uint8Array;
  /** Estimated transaction mass */
  estimatedMass: number;
  /** Whether transaction is within 100,000 mass limit */
  withinMassLimit: boolean;
  /** Payload structure breakdown */
  structure: {
    headerBytes: number;
    metadataBytes: number;
    separatorBytes: number;
    chunkDataBytes: number;
  };
}

/**
 * Decode a Kaspa stamping payload from hex string
 *
 * Payload Format:
 * ┌─────────────────┬──────────────────┬───────────┬──────────────────┐
 * │ Metadata Length │ Metadata (JSON)  │ Separator │ Raw Binary Data  │
 * │    (4 bytes)    │  (~200-300 bytes)│ (4 bytes) │   (0-20KB)       │
 * └─────────────────┴──────────────────┴───────────┴──────────────────┘
 *
 * @param hexPayload - Hex-encoded payload string
 * @returns Decoded payload information
 * @throws Error if payload is invalid or corrupted
 *
 * @example
 * ```typescript
 * const decoded = decodeStampingPayload(hexString);
 * console.log(`Chunk ${decoded.metadata.chunkIndex + 1} of ${decoded.metadata.totalChunks}`);
 * console.log(`File Hash: ${decoded.metadata.digest}`);
 * console.log(`Chunk Data: ${decoded.chunkDataSize} bytes`);
 * ```
 */
export function decodeStampingPayload(hexPayload: string): DecodedPayload {
  // Remove any whitespace and 0x prefix
  const cleanHex = hexPayload.replace(/^0x/, '').replace(/\s+/g, '');

  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string: contains non-hex characters');
  }

  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }

  // Convert hex to Uint8Array
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }

  if (bytes.length < 8) {
    throw new Error('Payload too short: must be at least 8 bytes (header + separator)');
  }

  // 1. Read metadata length (first 4 bytes, little-endian uint32)
  const metadataLength = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);

  if (metadataLength < 0 || metadataLength > 10000) {
    throw new Error(`Invalid metadata length: ${metadataLength} (expected 0-10000)`);
  }

  if (bytes.length < 4 + metadataLength + 4) {
    throw new Error(
      `Payload too short: expected at least ${4 + metadataLength + 4} bytes, got ${bytes.length}`
    );
  }

  // 2. Extract and parse metadata JSON
  const metadataBytes = bytes.slice(4, 4 + metadataLength);
  let metadataJson: string;
  let metadata: StampingMetadata;

  try {
    metadataJson = new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes);
  } catch (error) {
    throw new Error(`Failed to decode metadata as UTF-8: ${error}`);
  }

  try {
    metadata = JSON.parse(metadataJson);
  } catch (error) {
    throw new Error(`Failed to parse metadata JSON: ${error}`);
  }

  // 3. Read and validate separator (4 bytes after metadata)
  const separatorStart = 4 + metadataLength;
  const separator = bytes.slice(separatorStart, separatorStart + 4);
  const validSeparator = separator.every((b) => b === 0);

  // 4. Extract chunk data (everything after separator)
  const chunkDataStart = separatorStart + 4;
  const chunkData = bytes.slice(chunkDataStart);
  const chunkDataPreview = chunkData.slice(0, 256); // First 256 bytes for preview

  // 5. Calculate mass estimation
  const baseTransactionMass = 200; // Typical base transaction mass
  const payloadMass = bytes.length; // 1 mass per byte
  const estimatedMass = baseTransactionMass + payloadMass;
  const withinMassLimit = estimatedMass <= 100000;

  return {
    totalBytes: bytes.length,
    metadataLength,
    metadata,
    chunkDataSize: chunkData.length,
    chunkData, // Full chunk data
    chunkDataPreview, // Preview only
    validSeparator,
    separator,
    estimatedMass,
    withinMassLimit,
    structure: {
      headerBytes: 4,
      metadataBytes: metadataLength,
      separatorBytes: 4,
      chunkDataBytes: chunkData.length,
    },
  };
}
