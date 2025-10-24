import type { Network, SimpleWallet } from './types';
import type { SDKWalletConfig } from './wallet-config';

export interface WalletFactory {
  createWallet(options: SDKWalletConfig): Promise<SimpleWallet>;

  createWalletFromMnemonic(mnemonic: string, options: SDKWalletConfig): Promise<SimpleWallet>;

  createNewWallet(options: SDKWalletConfig): Promise<{ wallet: SimpleWallet; mnemonic: string }>;

  openExistingWallet(
    walletName: string,
    walletSecret: string,
    network: Network
  ): Promise<SimpleWallet>;
}
