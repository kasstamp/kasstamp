export type {
  WalletDescriptor,
  TransactionEvent,
  BalanceEvent,
  SDKWalletConfig,
  WasmWallet,
} from './types';

export type { Network } from './types';

export { walletStorage, SimpleWallet, SimpleWalletEventType } from './wallet';
export type { SimpleWalletNotificationCallback } from './wallet';

export { createSigningEnclave } from './signing';
export type {
  ISecureSigningEnclave,
  StoreMnemonicOptions,
  UnlockOptions,
  SignOptions,
  KeyDerivation,
  EnclaveStatus,
} from './signing';

export { TransactionMonitoringService, createTransactionMonitoringService } from './monitoring';
export type { TransactionMonitoringConfig, TransactionMonitoringEvents } from './monitoring';
