export { KaspaSDK } from './core/kaspa-sdk';

export type { Network } from '@kasstamp/wallet';
export type { KaspaSDKConfig } from './types/config';

export type { WalletDescriptor, BalanceEvent, TransactionEvent } from '@kasstamp/wallet';

export { SimpleWallet, SimpleWalletEventType, walletStorage } from '@kasstamp/wallet';
export type { SimpleWalletNotificationCallback } from '@kasstamp/wallet';

export { TransactionMonitoringService } from '@kasstamp/wallet';
export type { ITransactionRecord, IAccountDescriptor } from '@kasstamp/kaspa_wasm_sdk';

export type { StampingReceipt, ProcessingResult } from '@kasstamp/stamping';
