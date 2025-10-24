export type {
  SimpleWallet,
  WalletDescriptor,
  TransactionEvent,
  BalanceEvent,
  WalletFactory,
  SDKWalletConfig,
  WasmWallet,
} from './types';

export type { Network } from './types';

export { walletStorage } from './wallet';

export { KaspaWalletFactory } from './factory';

export { createSigningEnclave } from './signing';
export type {
  ISecureSigningEnclave,
  StoreMnemonicOptions,
  UnlockOptions,
  SignOptions,
  KeyDerivation,
  EnclaveStatus,
} from './signing';

export {
  BalanceMonitoringService,
  createBalanceMonitoringService,
  TransactionMonitoringService,
  createTransactionMonitoringService,
} from './monitoring';
export type {
  BalanceMonitoringConfig,
  BalanceMonitoringEvents,
  TransactionMonitoringConfig,
  TransactionMonitoringEvents,
} from './monitoring';
