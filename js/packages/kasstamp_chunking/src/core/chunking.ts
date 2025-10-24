import { sha256Hex } from '@kasstamp/crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Chunk, SplitOptions } from '../types';

/**
 * Generate a unique group ID for a set of chunks
 */
function generateGroupId(): string {
  return uuidv4();
}

/**
 * Split artifact into chunks asynchronously
 *
 * @param data - The data to split into chunks
 * @param opts - Split options (chunk size, group ID, minimum chunks)
 * @returns Array of chunks with metadata and digests
 */
export async function splitArtifact(data: Uint8Array, opts: SplitOptions = {}): Promise<Chunk[]> {
  const chunkSize = opts.chunkSize || 20000;
  const groupId = opts.groupId || generateGroupId();
  const minChunks = opts.minChunks || 1;

  // If data is smaller than chunk size and we don't need minimum chunks, return single chunk
  if (data.length <= chunkSize && minChunks <= 1) {
    const digest = await sha256Hex(data);
    return [
      {
        groupId,
        index: 0,
        total: 1,
        data,
        digest,
      },
    ];
  }

  // Calculate number of chunks needed
  const totalChunks = Math.max(minChunks, Math.ceil(data.length / chunkSize));
  const chunks: Chunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    const chunkData = data.slice(start, end);

    const digest = await sha256Hex(chunkData);

    chunks.push({
      groupId,
      index: i,
      total: totalChunks,
      data: chunkData,
      digest,
    });
  }

  return chunks;
}
