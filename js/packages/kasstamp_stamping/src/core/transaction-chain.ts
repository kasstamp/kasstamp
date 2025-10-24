import { createLogger } from '@kasstamp/utils';
import type { RpcClient as _RpcClient } from '@kasstamp/kaspa_wasm_sdk';
import {
  Address,
  calculateStorageMass,
  calculateTransactionFee,
  calculateTransactionMass,
  createTransactions,
  type ICreateTransactions,
  type IUtxoEntry,
  payToAddressScript,
  type PendingTransaction,
} from '@kasstamp/kaspa_wasm_sdk';

export type RpcClient = _RpcClient;

/**
 * Result of a chained transaction submission
 */
export interface ChainedTransactionResult {
  transactionId: string;
  fees: bigint;
  mass: bigint;
  virtualUtxo: IUtxoEntry | null; // For chaining to next transaction
}

/**
 * Signing function type for secure enclave signing
 */
export type SigningFunction = (transaction: PendingTransaction) => Promise<void>;

/**
 * Options for fast transaction chaining
 */
export interface ChainOptions {
  /** Receive address for transaction outputs */
  receiveAddress: string;
  /** Change address for transaction change outputs */
  changeAddress: string;
  /** Amount to send to receive address (in sompi) */
  outputAmount: bigint;
  /** Priority fee (in sompi) */
  priorityFee: bigint;
  /** Network ID (e.g., "kaspa-testnet-10", "kaspa-mainnet") */
  networkId: string;
}

const chainLogger = createLogger('kasstamp:stamping:chain');

/**
 * Submit a chained transaction using Generator and signing
 *
 * This creates a transaction using UTXO(s) (real or virtual), signs it
 * with a secure enclave signing function, submits it, and creates a virtual
 * UTXO from the change output for chaining.
 *
 * @param utxos - Input UTXO(s) (can be array for first TX, single for chained)
 * @param payload - Transaction payload data
 * @param signingFunction - Secure enclave signing function
 * @param rpcClient - RPC client for submitting transactions
 * @param options - Chain options
 * @returns Result including transaction ID and virtual UTXO for next TX
 */
export async function submitChainedTransaction(
  utxos: IUtxoEntry | IUtxoEntry[],
  payload: Uint8Array,
  signingFunction: SigningFunction, // Only secure enclave signing function
  rpcClient: RpcClient, // RPC client for transaction submission
  options: ChainOptions
): Promise<ChainedTransactionResult> {
  const { receiveAddress, changeAddress, outputAmount, priorityFee, networkId } = options;

  // Normalize to array
  const utxoArray = Array.isArray(utxos) ? utxos : [utxos];
  const totalInputAmount = utxoArray.reduce((sum, u) => sum + u.amount, 0n);

  chainLogger.debug('Creating chained transaction', {
    payloadBytes: payload.length,
    inputUtxoCount: utxoArray.length,
    totalInputKAS: (Number(totalInputAmount) / 1e8).toFixed(2),
    firstUtxoIsVirtual: utxoArray[0].blockDaaScore === 18446744073709551615n,
  });

  // Use createTransactions API (proper way to create signable transactions)
  // Transaction structure:
  // - Input(s): from previous UTXO(s)
  // - Output: OPTIONAL stamp output (only if outputAmount > 0)
  // - Change output: back to changeAddress (auto-created by Generator)
  // - Payload: the stamp data itself (proves the stamping on-chain)
  // When outputAmount = 0, we create NO explicit output - only change + payload
  // This keeps all funds in the wallet except for fees!

  // Debug: Log UTXO structure before passing to createTransactions
  if (utxoArray.length > 0) {
    const firstUtxo = utxoArray[0];
    chainLogger.debug('UTXO passed to createTransactions', {
      hasAmount: 'amount' in firstUtxo,
      amountValue: firstUtxo.amount.toString(),
      amountType: typeof firstUtxo.amount,
      hasAddress: 'address' in firstUtxo,
      hasOutpoint: 'outpoint' in firstUtxo,
      hasScriptPublicKey: 'scriptPublicKey' in firstUtxo,
      keys: Object.keys(firstUtxo),
    });
  }

  chainLogger.debug('Creating transaction', {
    priorityFeeSompi: priorityFee.toString(),
    priorityFeeKAS: (Number(priorityFee) / 1e8).toFixed(8),
    payloadBytes: payload.length,
    outputAmountSompi: outputAmount.toString(),
    outputAmountKAS: (Number(outputAmount) / 1e8).toFixed(8),
  });

  let result: ICreateTransactions;
  try {
    result = await createTransactions({
      outputs: outputAmount > 0n ? [{ address: receiveAddress, amount: outputAmount }] : [], // NO explicit output when amount is 0 - only change + payload!
      changeAddress,
      entries: utxoArray,
      payload,
      priorityFee,
      networkId,
    });
  } catch (createError) {
    chainLogger.error('createTransactions() failed', createError as Error, {
      payloadBytes: payload.length,
      outputAmountKAS: (Number(outputAmount) / 1e8).toFixed(8),
      note: 'This suggests payload/storage mass limits exceeded',
    });
    throw createError;
  }

  if (!result.transactions || result.transactions.length === 0) {
    throw new Error('createTransactions produced no transactions');
  }

  const pendingTx = result.transactions[0];

  // Calculate actual mass of the created transaction
  try {
    const tx = pendingTx.transaction;

    chainLogger.debug('Transaction Details', {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      payloadBytes: payload.length,
    });

    // Calculate transaction size
    const txSizeEstimate =
      tx.inputs.length * 118 + // Each input ~118 bytes
      tx.outputs.length * 43 + // Each output ~43 bytes
      payload.length + // Payload
      50; // Transaction overhead

    chainLogger.debug('Estimated TX size', { bytes: txSizeEstimate });

    // Get input and output values for storage mass calculation
    const inputValues = tx.inputs.map(
      (input: { previousOutpoint: { transactionId: string; index: number } }) => {
        const utxo = utxoArray.find(
          (u) =>
            u.outpoint.transactionId === input.previousOutpoint.transactionId &&
            u.outpoint.index === input.previousOutpoint.index
        );
        return utxo ? Number(utxo.amount) : 0;
      }
    );

    const outputValues = tx.outputs.map((output: { value: bigint }) => Number(output.value));

    chainLogger.debug('Input and output values', {
      inputValuesKAS: inputValues.map((v) => (v / 1e8).toFixed(8)).join(', '),
      outputValuesKAS: outputValues.map((v) => (v / 1e8).toFixed(8)).join(', '),
    });

    // Calculate masses (correctly with network_id)
    const totalMass = calculateTransactionMass(networkId, tx);
    const storageMassActual = calculateStorageMass(networkId, inputValues, outputValues);

    // Compute mass can be derived (total mass is max of compute and storage)
    // But we can't directly get compute mass, so we'll just show total and storage

    chainLogger.debug('Mass Analysis', {
      totalTransactionMass: totalMass.toLocaleString(),
      storageMass: storageMassActual ? storageMassActual.toLocaleString() : 'N/A',
      maximumAllowed: '100,000',
      remaining: (100000 - Number(totalMass)).toLocaleString(),
    });

    if (Number(totalMass) > 100000) {
      const excessMass = Number(totalMass) - 100000;
      const safePayloadSize = payload.length - Math.ceil(excessMass * 1.2); // 20% buffer
      chainLogger.error('Mass EXCEEDS LIMIT', {
        excess: excessMass.toLocaleString(),
        suggestedMaxPayloadBytes: safePayloadSize,
        reason: `Total TX size (${txSizeEstimate} bytes) contributes to compute mass`,
      });
    } else {
      chainLogger.debug('Mass within limits');
    }
  } catch (massError) {
    chainLogger.error('Could not calculate transaction mass', massError as Error, {
      message: massError instanceof Error ? massError.message : String(massError),
      type: massError instanceof Error ? massError.constructor.name : typeof massError,
    });
  }

  // Sign the transaction - use either enclave signing function or private keys
  chainLogger.debug('Signing transaction with secure enclave', {
    inputCount: pendingTx.transaction.inputs.length,
    usingSecureEnclave: true,
  });

  // Get addresses that need to sign
  try {
    const addresses = pendingTx.addresses();
    chainLogger.debug('Addresses needing signatures', { addresses });
  } catch (e) {
    chainLogger.debug('Could not get addresses', { error: e });
  }

  try {
    // Use secure enclave signing function
    await signingFunction(pendingTx);
    chainLogger.debug('Transaction signed successfully with secure enclave');
  } catch (signError) {
    chainLogger.error('Signing failed', signError as Error);
    throw signError;
  }

  // Submit to network using pendingTx.submit()
  const txId = await pendingTx.submit(rpcClient);

  chainLogger.info('Transaction submitted', {
    txId,
    feesKAS: (Number(result.summary.fees) / 1e8).toFixed(8),
  });

  // Verify fee calculation using official Kaspa WASM SDK function
  try {
    const tx = pendingTx.transaction;
    const minimumFee = calculateTransactionFee(networkId, tx);
    if (minimumFee) {
      const actualPriorityFee = Number(result.summary.fees) - Number(minimumFee);
      chainLogger.debug('Fee breakdown', {
        minimumFeeKAS: (Number(minimumFee) / 1e8).toFixed(8),
        priorityFeeKAS:
          actualPriorityFee > 0 ? (actualPriorityFee / 1e8).toFixed(8) : '0 (only paying minimum)',
      });
    }
  } catch (calcError) {
    chainLogger.warn('Could not calculate fee verification', { error: calcError });
  }

  // Create virtual UTXO from this transaction's change output for chaining
  const changeScript = payToAddressScript(new Address(changeAddress));
  const tx = pendingTx.transaction;

  chainLogger.debug('Transaction outputs', { count: tx.outputs.length });

  // Find change output by comparing script public keys
  let changeOutputIndex = -1;
  let changeOutput: {
    value: bigint;
    scriptPublicKey: ReturnType<typeof payToAddressScript>;
  } | null = null;

  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const outputScript = output.scriptPublicKey;

    // Compare script public keys (they should be the same object type)
    // The change output should have the same script as the change address
    if (outputScript && changeScript) {
      const outputScriptStr =
        typeof outputScript.toString === 'function'
          ? outputScript.toString()
          : JSON.stringify(outputScript);
      const changeScriptStr =
        typeof changeScript.toString === 'function'
          ? changeScript.toString()
          : JSON.stringify(changeScript);

      if (outputScriptStr === changeScriptStr) {
        changeOutputIndex = i;
        changeOutput = output;
        chainLogger.debug('Found change output', { index: i });
        break;
      }
    }
  }

  let virtualUtxo: IUtxoEntry | null = null;

  if (changeOutput && changeOutputIndex >= 0) {
    // Create virtual UTXO with u64::MAX blockDaaScore (unconfirmed)
    // IUtxoEntry requires: address, amount, scriptPublicKey, outpoint, blockDaaScore, isCoinbase
    virtualUtxo = {
      address: new Address(changeAddress),
      amount: changeOutput.value,
      scriptPublicKey: changeOutput.scriptPublicKey,
      outpoint: {
        transactionId: txId,
        index: changeOutputIndex,
      },
      blockDaaScore: 18446744073709551615n, // u64::MAX = unconfirmed/virtual
      isCoinbase: false, // Change outputs are never coinbase
    };

    chainLogger.debug('Created virtual UTXO', {
      valueKAS: (Number(changeOutput.value) / 1e8).toFixed(2),
    });
  } else {
    chainLogger.warn('No change output found - transaction may have consumed exact UTXO amount');
  }

  return {
    transactionId: txId,
    fees: result.summary.fees,
    mass: result.summary.mass,
    virtualUtxo,
  };
}

/**
 * Submit multiple chained transactions in rapid succession
 *
 * Each transaction uses the previous transaction's change output as input,
 * creating a chain of transactions that can be processed by the mempool
 * without waiting for confirmations.
 *
 * @param initialUtxos - Starting UTXO(s) (must be mature)
 * @param payloads - Array of transaction payloads
 * @param signingFunction - Secure enclave signing function for all transactions
 * @param rpcClient - RPC client for submitting transactions
 * @param options - Chain options
 * @returns Array of transaction IDs and total fees/mass
 */
export async function submitTransactionChain(
  initialUtxos: IUtxoEntry | IUtxoEntry[],
  payloads: Uint8Array[],
  signingFunction: SigningFunction, // Only secure enclave signing function
  rpcClient: RpcClient,
  options: ChainOptions
): Promise<{
  transactionIds: string[];
  totalFees: bigint;
  totalMass: bigint;
  elapsedMs: number;
}> {
  const startTime = Date.now();
  const transactionIds: string[] = [];
  let totalFees = 0n;
  let totalMass = 0n;
  let currentUtxo: IUtxoEntry | IUtxoEntry[] = initialUtxos;

  chainLogger.info('Starting fast transaction chain', { transactionCount: payloads.length });
  chainLogger.info('No confirmation waits - rapid submission');

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];

    try {
      const result = await submitChainedTransaction(
        currentUtxo,
        payload,
        signingFunction, // Pass secure enclave signing function
        rpcClient,
        options
      );

      transactionIds.push(result.transactionId);
      totalFees += result.fees;
      totalMass += result.mass;

      chainLogger.info('Transaction submitted in chain', {
        index: i + 1,
        total: payloads.length,
        txId: result.transactionId,
      });

      // Use virtual UTXO for next transaction
      if (i < payloads.length - 1) {
        if (!result.virtualUtxo) {
          throw new Error(
            `No change output found for transaction ${i + 1} - cannot continue chain`
          );
        }
        currentUtxo = result.virtualUtxo;
      }
    } catch (error) {
      chainLogger.error('Transaction failed in chain', error as Error, {
        index: i + 1,
        total: payloads.length,
      });
      throw new Error(`Transaction ${i + 1} failed in chain: ${error}`);
    }
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  chainLogger.info('Chain complete', {
    transactionCount: transactionIds.length,
    elapsedSeconds: elapsedSec,
    totalFeesKAS: (Number(totalFees) / 1e8).toFixed(8),
    avgTimePerTxMs: (elapsedMs / payloads.length).toFixed(0),
  });

  return {
    transactionIds,
    totalFees,
    totalMass,
    elapsedMs,
  };
}
