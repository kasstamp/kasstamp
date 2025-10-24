/**
 * Kaspa blockchain constraints and stamping configuration constants
 */

/**
 * Kaspa transaction constraints based on network rules
 * @see https://kaspa-mdbook.aspectron.com/transactions.html
 *
 * @internal Only used internally by stamping package
 */
export const KASPA_CONSTRAINTS = {
  /** Maximum transaction mass allowed by Kaspa network */
  MAX_TRANSACTION_MASS: 100_000,

  /**
   * Kaspa mass calculation parameters (from official docs)
   * @see https://kaspa-mdbook.aspectron.com/transactions/constraints/mass.html
   */
  MASS_PER_TX_BYTE: 1,
  MASS_PER_SCRIPT_PUB_KEY_BYTE: 10,
  MASS_PER_SIG_OP: 1_000,

  /**
   * Mass per UTXO input (important for fragmented wallets!)
   * Each input adds: ~118 bytes (size mass) + 1,000 (sig_op mass) = ~1,118 total mass
   * With 89+ inputs, mass exceeds 100,000 limit!
   */
  MASS_PER_INPUT: 1_118,

  /** Estimated overhead for JSON metadata and payload structure */
  METADATA_OVERHEAD_ESTIMATE: 300,

  /**
   * Maximum safe payload size per transaction chunk.
   *
   * This is limited by TRANSIENT MASS (KIP-0013), not compute or storage mass!
   *
   * Formula: transient_mass = tx_size × TRANSIENT_BYTE_TO_MASS_FACTOR
   * Where TRANSIENT_BYTE_TO_MASS_FACTOR = 4
   *
   * Calculation:
   * - Maximum allowed mass: 100,000
   * - Max tx_size: 100,000 / 4 = 25,000 bytes
   * - Minus overhead (~250 bytes for base tx + inputs + outputs): 24,750 bytes
   * - Safe value with 19% margin: 20,000 bytes (20KB)
   *
   * Mass breakdown for 20KB payload:
   * - Compute mass: ~22,000 (22% of limit)
   * - Transient mass: ~81,000 (81% of limit) ← THE BOTTLENECK!
   * - Storage mass: ~10,000 (10% of limit, with 1 KAS outputs)
   * - Network mass = max(22K, 81K, 10K) = 81,000 ✅
   *
   * Why not 24KB (theoretical max)?
   * - Would use 97% of transient mass limit
   * - Too risky - overhead varies with transaction structure
   * - 20KB provides reliable 19% safety buffer
   *
   * @see https://github.com/kaspanet/rusty-kaspa/blob/master/consensus/core/src/constants.rs#L21
   * @see README_STORAGE_MASS_CALCULATION.md for complete explanation
   */
  MAX_SAFE_PAYLOAD_SIZE: 20_000, // 20KB - optimal for transient mass limit
} as const;
