import type { FullPayloadStructure } from '../types';

/**
 * Serialize full payload structure to bytes
 *
 * Format:
 * - JSON metadata (variable length)
 * - 4-byte separator (0x00, 0x00, 0x00, 0x00)
 * - Chunk data (optional, variable length)
 *
 * @param payload - Full payload structure to serialize
 * @returns Serialized bytes
 */
export function serializePayload(payload: FullPayloadStructure): Uint8Array {
  // 1. Create metadata object (everything except chunkData)
  const metadata = {
    fileName: payload.fileName,
    chunkIndex: payload.chunkIndex,
    totalChunks: payload.totalChunks,
    digest: payload.digest,
    timestamp: payload.timestamp,
  };

  // 2. Serialize metadata to JSON
  const metadataJson = JSON.stringify(metadata);
  const metadataBytes = new TextEncoder().encode(metadataJson);

  // 3. Create separator
  const separator = new Uint8Array([0, 0, 0, 0]);

  // 4. Get chunk data (or empty array)
  const chunkData = payload.chunkData || new Uint8Array(0);

  // 5. Create metadata length header (4 bytes, little-endian uint32)
  const metadataLength = new Uint8Array(new Uint32Array([metadataBytes.length]).buffer);

  // 6. Combine all parts
  const totalLength =
    metadataLength.length + metadataBytes.length + separator.length + chunkData.length;
  const serialized = new Uint8Array(totalLength);

  let offset = 0;
  serialized.set(metadataLength, offset);
  offset += metadataLength.length;
  serialized.set(metadataBytes, offset);
  offset += metadataBytes.length;
  serialized.set(separator, offset);
  offset += separator.length;
  serialized.set(chunkData, offset);

  return serialized;
}

/**
 * Deserialize bytes to full payload structure
 *
 * @param serialized - Serialized bytes
 * @returns Full payload structure
 */
export function deserializePayload(serialized: Uint8Array): FullPayloadStructure {
  // 1. Read metadata length (first 4 bytes)
  const metadataLengthBytes = serialized.slice(0, 4);
  const metadataLength = new Uint32Array(metadataLengthBytes.buffer)[0];

  // 2. Read metadata JSON
  const metadataStart = 4;
  const metadataEnd = metadataStart + metadataLength;
  const metadataBytes = serialized.slice(metadataStart, metadataEnd);
  const metadataJson = new TextDecoder().decode(metadataBytes);
  const metadata = JSON.parse(metadataJson);

  // 3. Skip separator (4 bytes after metadata)
  const chunkDataStart = metadataEnd + 4;

  // 4. Read chunk data (rest of the bytes)
  const chunkData =
    chunkDataStart < serialized.length ? serialized.slice(chunkDataStart) : new Uint8Array(0);

  // 5. Reconstruct full payload structure
  return {
    fileName: metadata.fileName,
    chunkIndex: metadata.chunkIndex,
    totalChunks: metadata.totalChunks,
    digest: metadata.digest,
    timestamp: metadata.timestamp,
    chunkData: chunkData.length > 0 ? chunkData : undefined,
  };
}
