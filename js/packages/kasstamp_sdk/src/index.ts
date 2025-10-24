export { KaspaSDK } from './core/kaspa-sdk';

export { KaspaWalletFactory, walletStorage } from '@kasstamp/wallet';

export type { Network } from '@kasstamp/wallet';
export type { KaspaSDKConfig } from './types/config';

export type {
  SimpleWallet,
  WalletDescriptor,
  BalanceEvent,
  TransactionEvent,
} from '@kasstamp/wallet';

export { BalanceMonitoringService, TransactionMonitoringService } from '@kasstamp/wallet';
export type { ITransactionRecord, IAccountDescriptor } from '@kasstamp/kaspa_wasm_sdk';

export type { StampingReceipt, ProcessingResult } from '@kasstamp/stamping';
