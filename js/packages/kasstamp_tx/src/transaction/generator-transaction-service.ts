/**
 * Generator-Based Transaction Service
 *
 * Uses official Kaspa Generator class for production-ready transaction creation.
 * Handles UTXO selection, mass limits, and automatic batch transactions.
 *
 * @see https://kaspa-mdbook.aspectron.com/transactions.html
 */

import { createLogger } from '@kasstamp/utils';
import {
  Address,
  estimateTransactions,
  GeneratorSummary,
  type IUtxoEntry,
  type NetworkId,
} from '@kasstamp/kaspa_wasm_sdk';

const generatorLogger = createLogger('kasstamp:tx:generator');

/**
 * Parameters for stamping transaction
 *
 * @internal
 */
export interface StampingTransactionParams {
  /** Recipient address (usually your own address for stamping) */
  recipient: Address | string;

  /** Change address (usually same as recipient for stamping) */
  changeAddress: Address | string;

  /** Available UTXOs for the transaction */
  utxos: IUtxoEntry[];

  /** Binary payload (chunk data) */
  payload: Uint8Array;

  /** Network identifier */
  networkId: NetworkId | string;

  /** Priority fee in sompi (default: 10000) */
  priorityFee?: bigint;

  /** Amount to send in sompi (default: 100000000 = 1 KAS) */
  amount?: bigint;

  /** Fee rate in sompi per gram of mass (optional) */
  feeRate?: number;
}

/**
 * Estimation result before sending
 *
 * @internal
 */
export interface StampingEstimation {
  /** Number of transactions that will be created */
  transactionCount: number;

  /** Total fees in sompi */
  totalFees: bigint;

  /** Total mass of all transactions */
  totalMass: bigint;

  /** Number of UTXOs that will be used */
  utxoCount: number;

  /** Final transaction amount (including fees) */
  finalAmount: bigint | undefined;

  /** Whether batch transactions are needed (UTXO fragmentation) */
  needsBatching: boolean;

  /** Raw GeneratorSummary from Kaspa SDK */
  summary: GeneratorSummary;
}

/**
 * Generator-based Transaction Service
 *
 * Uses official Kaspa Generator class for reliable transaction creation.
 */
export class GeneratorTransactionService {
  /**
   * Estimate stamping transaction before sending
   *
   * Provides a dry-run preview of what will happen when you send.
   * Use this to show fees and mass to the user before confirming.
   *
   * @param params - Transaction parameters
   * @returns Estimation details
   *
   * @example
   * ```typescript
   * const estimate = await service.estimateStampingTransaction({
   *   recipient: wallet.receiveAddress,
   *   changeAddress: wallet.changeAddress,
   *   utxos: await wallet.getUtxos(accountId),
   *   payload: chunkPayload,
   *   networkId: 'testnet-10'
   * });
   *
   * console.log(`Will create ${estimate.transactionCount} transactions`);
   * console.log(`Total fees: ${estimate.totalFees} sompi`);
   * ```
   */
  static async estimateStampingTransaction(
    params: StampingTransactionParams
  ): Promise<StampingEstimation> {
    const {
      recipient,
      changeAddress,
      utxos,
      payload,
      networkId,
      priorityFee = 0n, // No priority fee by default - only minimum network fee
      amount = 100000000n, // 1 KAS
      feeRate,
    } = params;

    // Debug: Log UTXO structure before passing to estimateTransactions
    generatorLogger.debug('UTXOs retrieved', { utxoCount: utxos.length });
    if (utxos.length > 0) {
      const firstUtxo = utxos[0];
      generatorLogger.debug('First UTXO structure', {
        keys: Object.keys(firstUtxo),
        hasScriptPublicKey: 'scriptPublicKey' in firstUtxo,
        hasAddress: 'address' in firstUtxo,
        hasOutpoint: 'outpoint' in firstUtxo,
        hasAmount: 'amount' in firstUtxo,
        amountValue: firstUtxo.amount,
        amountType: typeof firstUtxo.amount,
        scriptPublicKeyType: firstUtxo.scriptPublicKey
          ? typeof firstUtxo.scriptPublicKey
          : 'undefined',
        addressType: firstUtxo.address ? typeof firstUtxo.address : 'undefined',
      });
    }

    // Use official Kaspa estimateTransactions function
    // Note: If amount is 0, we don't create an explicit output (only change + payload)
    const summary = await estimateTransactions({
      outputs: amount > 0n ? [{ address: recipient, amount }] : [],
      changeAddress,
      entries: utxos,
      payload,
      priorityFee,
      feeRate,
      networkId,
    });

    return {
      transactionCount: summary.transactions as number,
      totalFees: summary.fees as bigint,
      totalMass: summary.mass as bigint,
      utxoCount: summary.utxos as number,
      finalAmount: summary.finalAmount as bigint | undefined,
      needsBatching: (summary.transactions as number) > 1,
      summary,
    };
  }
}
