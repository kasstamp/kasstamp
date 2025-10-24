export type GroupId = string;

export interface Chunk {
  groupId: GroupId;
  index: number;
  total: number;
  data: Uint8Array;
  digest: string;
}

export interface SplitOptions {
  chunkSize?: number;
  groupId?: GroupId;
  minChunks?: number;
}
