/**
 * Detailed structure information about the payload
 *
 * @internal
 */
export interface PayloadStructure {
  /** Length of the metadata length header (4 bytes) */
  metadataLength: number;
  /** Length of the JSON metadata */
  metadataBytes: number;
  /** Length of the separator (4 bytes) */
  separatorBytes: number;
  /** Length of the chunk data */
  chunkDataBytes: number;
  /** Total payload size in bytes */
  totalBytes: number;
}

/**
 * Mass estimation for Kaspa transaction
 *
 * @internal
 */
export interface MassEstimate {
  /** Base transaction overhead */
  baseTransaction: number;
  /** Mass for inputs (varies based on UTXO count) */
  inputs: number;
  /** Mass for outputs (recipient + change) */
  outputs: number;
  /** Mass for payload (1 byte = 1 mass unit) */
  payloadMass: number;
  /** Total estimated mass */
  totalEstimate: number;
  /** Kaspa network mass limit */
  massLimit: number;
  /** Whether transaction is within mass limit */
  withinLimit: boolean;
}

/**
 * Complete payload debug information
 */
export interface PayloadDebugInfo {
  /** The constructed binary payload */
  payload: Uint8Array;
  /** Detailed structure breakdown */
  structure: PayloadStructure;
  /** Debug information for inspection */
  debug: {
    /** JSON metadata as string */
    metadataJson: string;
    /** Metadata length header as hex */
    metadataLengthHex: string;
    /** Separator bytes as hex */
    separatorHex: string;
    /** First 100 bytes of payload as hex (for preview) */
    payloadPreviewHex: string;
  };
  /** Mass estimation for transaction */
  massEstimate: MassEstimate;
}

/**
 * Build a binary payload for Kaspa transaction from stamping envelope
 *
 * Payload Format:
 * ```
 * ┌─────────────────┬──────────────────┬───────────┬──────────────────┐
 * │ Metadata Length │ Metadata (JSON)  │ Separator │ Raw Binary Data  │
 * │    (4 bytes)    │  (~200-300 bytes)│ (4 bytes) │   (0-50KB)       │
 * └─────────────────┴──────────────────┴───────────┴──────────────────┘
 * ```
 *
 * - Metadata Length: 4-byte little-endian uint32 indicating metadata JSON length
 * - Metadata: JSON-encoded metadata object
 * - Separator: 4 zero bytes (0x00, 0x00, 0x00, 0x00) marking data boundary
 * - Chunk Data: Raw binary data (optional)
 *
 * @param envelope - Stamping envelope with metadata and optional chunk data
 * @returns Complete payload with structure and debug information
 *
 * @example
 * ```typescript
 * const payload = buildStampingPayload({
 *   metadata: {
 *     groupId: 'abc-123',
 *     mode: 'public'
 *   },
 *   chunkData: new Uint8Array([1, 2, 3, ...])
 * });
 *
 * console.log('Payload size:', payload.structure.totalBytes);
 * console.log('Within mass limit?', payload.massEstimate.withinLimit);
 * ```
 */
export function buildStampingPayload(envelope: {
  metadata: object;
  chunkData?: Uint8Array;
}): PayloadDebugInfo {
  // 1. Encode metadata as JSON
  const metadataJson = JSON.stringify(envelope.metadata);
  const metadataBytes = new TextEncoder().encode(metadataJson);

  // 2. Create separator (4 bytes: 0x00, 0x00, 0x00, 0x00)
  const separator = new Uint8Array([0, 0, 0, 0]);

  // 3. Get chunk data or empty array
  const chunkData = envelope.chunkData || new Uint8Array(0);

  // 4. Build metadata length header (4 bytes, little-endian uint32)
  const metadataLength = new Uint8Array(new Uint32Array([metadataBytes.length]).buffer);

  // 5. Combine all parts into single payload
  const payload = new Uint8Array(
    metadataLength.length + metadataBytes.length + separator.length + chunkData.length
  );

  let offset = 0;
  payload.set(metadataLength, offset);
  offset += metadataLength.length;
  payload.set(metadataBytes, offset);
  offset += metadataBytes.length;
  payload.set(separator, offset);
  offset += separator.length;
  payload.set(chunkData, offset);

  // 6. Calculate structure info
  const structure: PayloadStructure = {
    metadataLength: metadataLength.length,
    metadataBytes: metadataBytes.length,
    separatorBytes: separator.length,
    chunkDataBytes: chunkData.length,
    totalBytes: payload.length,
  };

  // 7. Estimate transaction mass
  // Based on official Kaspa documentation:
  // https://kaspa-mdbook.aspectron.com/transactions/constraints/mass.html
  // Formula: tx_mass = (tx_size × 1) + (script_size × 10) + (sig_ops × 1,000)
  // Assumptions for estimation (single consolidated UTXO):
  // - 1 input: ~118 bytes + 1 sig_op = 118 + 1,000 = 1,118 mass
  // - 2 outputs (recipient + change): ~106 bytes + ~74 script bytes = (106 × 1) + (74 × 10) = 846 mass
  // - Base transaction overhead: ~200 bytes = 200 mass
  // - Payload: payload.length bytes = payload.length mass
  // IMPORTANT: This assumes a wallet with consolidated UTXOs!
  // Multiple inputs add ~1,118 mass EACH. With 89+ inputs, you hit the 100K limit!

  const BASE_TX_OVERHEAD = 200; // version, counts, locktime, gas, etc.
  const INPUT_MASS = 1_118; // 1 input (assumes consolidated UTXOs)
  const OUTPUT_MASS = 846; // 2 outputs (recipient + change)
  const PAYLOAD_MASS = payload.length; // 1 byte = 1 mass for payload

  const totalEstimate = BASE_TX_OVERHEAD + INPUT_MASS + OUTPUT_MASS + PAYLOAD_MASS;
  const MASS_LIMIT = 100_000;

  const massEstimate: MassEstimate = {
    baseTransaction: BASE_TX_OVERHEAD,
    inputs: INPUT_MASS,
    outputs: OUTPUT_MASS,
    payloadMass: PAYLOAD_MASS,
    totalEstimate,
    massLimit: MASS_LIMIT,
    withinLimit: totalEstimate < MASS_LIMIT,
  };

  // 8. Create debug info
  const debug = {
    metadataJson,
    metadataLengthHex: Array.from(metadataLength)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    separatorHex: Array.from(separator)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
    payloadPreviewHex: Array.from(payload.slice(0, 100))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' '),
  };

  return {
    payload,
    structure,
    debug,
    massEstimate,
  };
}
