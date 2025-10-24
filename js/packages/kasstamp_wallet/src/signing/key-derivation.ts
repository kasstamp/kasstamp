import { Mnemonic, XPrv, PrivateKeyGenerator, PrivateKey } from '@kasstamp/kaspa_wasm_sdk';
import type { KeyDerivation } from './types';

/**
 * Derive a single private key from mnemonic
 *
 * This replicates what the WASM wallet's accountsSend() does internally.
 *
 * @param mnemonic - BIP-39 mnemonic phrase (12 or 24 words)
 * @param bip39Passphrase - Optional BIP-39 passphrase (not the wallet password)
 * @param accountIndex - Account index (typically 0)
 * @param addressIndex - Address index within the account
 * @param isReceive - True for receive address (0), false for change address (1)
 * @returns Private key for signing transactions
 */
export function derivePrivateKey(
  mnemonic: string,
  bip39Passphrase: string,
  accountIndex: number,
  addressIndex: number,
  isReceive: boolean
): PrivateKey {
  // Step 1: Create Mnemonic object from phrase
  const mnemonicObj = new Mnemonic(mnemonic);

  // Step 2: Convert mnemonic to seed (with optional BIP-39 passphrase)
  // Note: BIP-39 passphrase is different from wallet password
  // It's part of the seed derivation, acts like a "25th word"
  const seedHex = mnemonicObj.toSeed(bip39Passphrase);

  // Step 3: Create extended private key (xprv) from seed
  const xprv = new XPrv(seedHex);

  // Step 4: Create private key generator for the account
  // Path: m/44'/111111'/accountIndex'
  const privateKeyGen = new PrivateKeyGenerator(
    xprv,
    false, // isMultisig (false for standard wallets)
    BigInt(accountIndex)
  );

  // Step 5: Derive key for specific address
  // Path: m/44'/111111'/accountIndex'/[0|1]/addressIndex
  const privateKey = isReceive
    ? privateKeyGen.receiveKey(addressIndex) // 0 = receive addresses
    : privateKeyGen.changeKey(addressIndex); // 1 = change addresses

  return privateKey;
}

/**
 * Derive multiple private keys from mnemonic
 *
 * Useful for transactions that require signatures from multiple addresses.
 * More efficient than calling derivePrivateKey() multiple times because
 * it only creates the mnemonic and seed once.
 *
 * @param mnemonic - BIP-39 mnemonic phrase (12 or 24 words)
 * @param bip39Passphrase - Optional BIP-39 passphrase
 * @param derivations - Array of key derivation specifications
 * @returns Array of private keys corresponding to the derivation specs
 */
export function deriveMultipleKeys(
  mnemonic: string,
  bip39Passphrase: string,
  derivations: KeyDerivation[]
): PrivateKey[] {
  // Create mnemonic and seed once (optimization)
  const mnemonicObj = new Mnemonic(mnemonic);
  const seedHex = mnemonicObj.toSeed(bip39Passphrase);
  const xprv = new XPrv(seedHex);

  // Group derivations by account to optimize key generator creation
  const keysByAccount = new Map<number, PrivateKey[]>();

  for (const derivation of derivations) {
    if (!keysByAccount.has(derivation.accountIndex)) {
      keysByAccount.set(derivation.accountIndex, []);
    }

    // Create key generator for this account (if not already created)
    const privateKeyGen = new PrivateKeyGenerator(xprv, false, BigInt(derivation.accountIndex));

    // Derive the key
    const privateKey = derivation.isReceive
      ? privateKeyGen.receiveKey(derivation.addressIndex)
      : privateKeyGen.changeKey(derivation.addressIndex);

    keysByAccount.get(derivation.accountIndex)!.push(privateKey);
  }

  // Flatten to array in original order
  const keys: PrivateKey[] = [];
  for (const derivation of derivations) {
    // Find the key for this derivation
    // (This maintains the original order from the derivations array)
    const privateKeyGen = new PrivateKeyGenerator(xprv, false, BigInt(derivation.accountIndex));

    const privateKey = derivation.isReceive
      ? privateKeyGen.receiveKey(derivation.addressIndex)
      : privateKeyGen.changeKey(derivation.addressIndex);

    keys.push(privateKey);
  }

  return keys;
}
