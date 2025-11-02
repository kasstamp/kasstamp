import { createLogger } from '@kasstamp/utils';
import { NetworkId, RpcClient as _RpcClient } from '@kasstamp/kaspa_wasm_sdk';
import {
  Address,
  addressFromScriptPublicKey,
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
  /** Network ID (e.g., "testnet-10", "mainnet") */
  networkId: NetworkId;
}

const chainLogger = createLogger('kasstamp:stamping:chain');

/**
 * Analyze transaction mass and log detailed information
 */
function analyzeTransactionMass(
  tx: PendingTransaction['transaction'],
  utxoArray: IUtxoEntry[],
  payload: Uint8Array,
  networkId: NetworkId
): void {
  try {
    chainLogger.debug('Transaction Details', {
      inputCount: tx.inputs.length,
      outputCount: tx.outputs.length,
      payloadBytes: payload.length,
    });

    // Calculate transaction size estimate
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

    // Calculate masses
    const totalMass = calculateTransactionMass(networkId, tx);
    const storageMassActual = calculateStorageMass(networkId, inputValues, outputValues);

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
}

/**
 * Find the change output in a transaction by comparing script public keys
 *
 * @param tx - The transaction to search
 * @param expectedChangeAddress - The address we expect change to go to
 * @returns The change output and its index, or null if not found
 */
function findChangeOutput(
  tx: PendingTransaction['transaction'],
  expectedChangeAddress: string
): {
  output: { value: bigint; scriptPublicKey: ReturnType<typeof payToAddressScript> };
  index: number;
} | null {
  const expectedChangeScript = payToAddressScript(new Address(expectedChangeAddress));

  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const outputScript = output.scriptPublicKey;

    // Compare script public keys
    if (outputScript && expectedChangeScript) {
      const outputScriptStr =
        typeof outputScript.toString === 'function'
          ? outputScript.toString()
          : JSON.stringify(outputScript);
      const expectedScriptStr =
        typeof expectedChangeScript.toString === 'function'
          ? expectedChangeScript.toString()
          : JSON.stringify(expectedChangeScript);

      if (outputScriptStr === expectedScriptStr) {
        chainLogger.debug('Found change output', { index: i });
        return { output, index: i };
      }
    }
  }

  return null;
}

/**
 * Create a virtual UTXO from a change output
 *
 * CRITICAL: Extract the actual address from the change output's script public key,
 * NOT from the expected change address. The Generator may use a different address
 * than what we pass as changeAddress (e.g., if it auto-discovers based on UTXO address).
 *
 * @param changeOutput - The change output from the transaction
 * @param changeOutputIndex - The index of the change output
 * @param txId - The transaction ID
 * @param expectedChangeAddress - The address we expected change to go to (for logging)
 * @param networkId - Network ID for address extraction
 * @returns Virtual UTXO entry
 */
function createVirtualUtxoFromChange(
  changeOutput: { value: bigint; scriptPublicKey: ReturnType<typeof payToAddressScript> },
  changeOutputIndex: number,
  txId: string,
  expectedChangeAddress: string,
  networkId: NetworkId
): IUtxoEntry {
  // CRITICAL FIX: Extract the ACTUAL address from the change output's script public key
  // This ensures we use the same address that the Generator actually used, not what we assumed
  const actualChangeAddress = addressFromScriptPublicKey(changeOutput.scriptPublicKey, networkId);

  if (!actualChangeAddress) {
    chainLogger.error('Could not extract address from change output script public key', {
      expectedChangeAddress,
    });
    // Fallback to expected address, but log warning
    chainLogger.warn('Falling back to expected change address', { expectedChangeAddress });
  }

  const addressToUse = actualChangeAddress || new Address(expectedChangeAddress);
  const actualAddressStr = addressToUse.toString();

  // Log if there's a mismatch between expected and actual addresses
  if (actualAddressStr !== expectedChangeAddress) {
    chainLogger.warn('Change output address mismatch detected!', {
      expectedChangeAddress,
      actualChangeAddress: actualAddressStr,
      note: 'The Generator used a different address than expected. Using actual address for virtual UTXO.',
    });
  } else {
    chainLogger.debug('Change output address matches expected', {
      address: actualAddressStr,
    });
  }

  const virtualUtxo: IUtxoEntry = {
    address: addressToUse,
    amount: changeOutput.value,
    scriptPublicKey: changeOutput.scriptPublicKey,
    outpoint: {
      transactionId: txId,
      index: changeOutputIndex,
    },
    blockDaaScore: 18446744073709551615n, // u64::MAX = unconfirmed/virtual
    isCoinbase: false, // Change outputs are never coinbase
  };

  chainLogger.debug('Created virtual UTXO from change output', {
    address: actualAddressStr,
    valueKAS: (Number(changeOutput.value) / 1e8).toFixed(2),
    addressMatchesExpected: actualAddressStr === expectedChangeAddress,
  });

  return virtualUtxo;
}

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

  // CRITICAL: Do NOT normalize UTXO addresses!
  // The UTXO address field should reflect the actual address from the script public key.
  // Changing it breaks transaction.addresses() which needs to know the real signing address.
  // The changeAddress parameter is passed separately to createTransactions() to control where change goes.
  const totalInputAmount = utxoArray.reduce((sum, u) => sum + u.amount, 0n);
  const utxoAddresses = utxoArray.map((u) => u.address?.toString() || 'unknown');

  chainLogger.debug('Creating chained transaction', {
    payloadBytes: payload.length,
    inputUtxoCount: utxoArray.length,
    totalInputKAS: (Number(totalInputAmount) / 1e8).toFixed(2),
    firstUtxoIsVirtual: utxoArray[0].blockDaaScore === 18446744073709551615n,
    expectedChangeAddress: changeAddress,
    utxoAddresses,
    note: 'UTXO addresses preserved (not normalized). changeAddress parameter controls where change goes.',
  });

  // Use createTransactions API (proper way to create signable transactions)
  // Transaction structure:
  // - Input(s): from previous UTXO(s)
  // - Output: OPTIONAL stamp output (only if outputAmount > 0)
  // - Change output: back to changeAddress (auto-created by Generator)
  // - Payload: the stamp data itself (proves the stamping on-chain)
  // When outputAmount = 0, we create NO explicit output - only change + payload
  // This keeps all funds in the wallet except for fees!

  chainLogger.debug('Creating transaction', {
    priorityFeeSompi: priorityFee.toString(),
    priorityFeeKAS: (Number(priorityFee) / 1e8).toFixed(8),
    payloadBytes: payload.length,
    outputAmountSompi: outputAmount.toString(),
    outputAmountKAS: (Number(outputAmount) / 1e8).toFixed(8),
    changeAddress,
  });

  // Step 1: Create the transaction using Generator
  // IMPORTANT: The changeAddress parameter controls where change goes.
  // The UTXO address fields are preserved to ensure correct signing.
  let result: ICreateTransactions;
  try {
    result = await createTransactions({
      outputs: outputAmount > 0n ? [{ address: receiveAddress, amount: outputAmount }] : [], // NO explicit output when amount is 0 - only change + payload!
      changeAddress,
      entries: utxoArray, // UTXO addresses have been normalized in-place via setter
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
  const tx = pendingTx.transaction;

  // Step 2: Analyze transaction mass (use original utxoArray for amount calculations)
  analyzeTransactionMass(tx, utxoArray, payload, networkId);

  // Step 3: Sign the transaction
  chainLogger.debug('Signing transaction with secure enclave', {
    inputCount: tx.inputs.length,
    usingSecureEnclave: true,
  });

  // Log addresses that need to sign (for debugging)
  try {
    const addresses = pendingTx.addresses();
    chainLogger.debug('Addresses needing signatures', {
      addresses: addresses.map((addr) => addr.toString()),
    });
  } catch (e) {
    chainLogger.debug('Could not get addresses', { error: e });
  }

  try {
    await signingFunction(pendingTx);
    chainLogger.debug('Transaction signed successfully with secure enclave');
  } catch (signError) {
    chainLogger.error('Signing failed', signError as Error);
    throw signError;
  }

  // Step 4: Submit transaction to network
  const txId = await pendingTx.submit(rpcClient);

  chainLogger.info('Transaction submitted', {
    txId,
    feesKAS: (Number(result.summary.fees) / 1e8).toFixed(8),
  });

  // Step 5: Verify fee calculation
  try {
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

  // Step 6: Find change output and create virtual UTXO for chaining
  chainLogger.debug('Transaction outputs', { count: tx.outputs.length });

  const changeOutputResult = findChangeOutput(tx, changeAddress);
  let virtualUtxo: IUtxoEntry | null = null;

  if (changeOutputResult) {
    // CRITICAL FIX: Use the actual address from the change output, not the expected one
    virtualUtxo = createVirtualUtxoFromChange(
      changeOutputResult.output,
      changeOutputResult.index,
      txId,
      changeAddress,
      networkId
    );
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

    // Log UTXO address at start of each transaction in chain
    const currentUtxoArray = Array.isArray(currentUtxo) ? currentUtxo : [currentUtxo];
    const inputAddress = currentUtxoArray[0]?.address?.toString() || 'unknown';
    chainLogger.debug('Starting chain transaction', {
      index: i + 1,
      total: payloads.length,
      inputUtxoAddress: inputAddress,
      expectedChangeAddress: options.changeAddress,
      addressMatch: inputAddress === options.changeAddress,
    });

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

      // Log virtual UTXO address for next transaction
      const virtualUtxoAddress = result.virtualUtxo?.address?.toString() || 'none';
      chainLogger.info('Transaction submitted in chain', {
        index: i + 1,
        total: payloads.length,
        txId: result.transactionId,
        virtualUtxoAddress,
        expectedChangeAddress: options.changeAddress,
        addressMatch: virtualUtxoAddress === options.changeAddress || !result.virtualUtxo,
      });

      // Use virtual UTXO for next transaction
      if (i < payloads.length - 1) {
        if (!result.virtualUtxo) {
          throw new Error(
            `No change output found for transaction ${i + 1} - cannot continue chain`
          );
        }

        // Verify virtual UTXO address matches expected change address
        const virtualAddressStr = result.virtualUtxo.address?.toString() || '';
        if (virtualAddressStr && virtualAddressStr !== options.changeAddress) {
          chainLogger.error(
            '❌ Virtual UTXO address mismatch - change did not go to main changeAddress!',
            {
              transactionIndex: i + 1,
              virtualUtxoAddress: virtualAddressStr,
              expectedChangeAddress: options.changeAddress,
              note: 'Change should always go to the main changeAddress. This indicates a problem.',
            }
          );
          // This is a critical error - change went to the wrong address
          // We should still continue but log it as an error
        } else {
          chainLogger.debug('✅ Virtual UTXO address matches expected changeAddress', {
            transactionIndex: i + 1,
            address: virtualAddressStr,
          });
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
