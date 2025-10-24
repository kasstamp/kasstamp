import { Network } from '@kasstamp/kasstamp_wallet';

export interface SDKWalletConfig {
  /** User-defined wallet name - REQUIRED */
  name: string;
  /** Wallet description */
  description?: string;
  /** Number of words for mnemonic generation (12, 15, 18, 21, or 24) - REQUIRED */
  words: 12 | 15 | 18 | 21 | 24;
  /** Optional BIP39 passphrase for additional security */
  passphrase?: string;
  /** Network - REQUIRED */
  network: Network;
  /** Wallet secret for encryption - REQUIRED */
  walletSecret: string;
}
