export type Hex = string;

export type Sompi = bigint;

export type Address = string;

export interface TransactionParams {
  /** The address to send KAS to */
  toAddress: string;
  /** The amount to send in KAS (will be converted to sompi internally) */
  amount: number;
  /** Optional fee amount in KAS (defaults to 0.00001 KAS) */
  fee?: number;
  /** Optional payload for the transaction */
  payload?: string | Uint8Array;
}
