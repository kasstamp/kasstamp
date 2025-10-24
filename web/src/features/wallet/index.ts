/**
 * @fileoverview Wallet Feature Public API
 *
 * Barrel export for the wallet feature
 */

// Components (default exports)
export { default as WalletManagementDialog } from './components/WalletManagementDialog';

// Services (named exports)
export { walletService } from './services';
export type { WalletServiceEvent, WalletServiceEventData } from './services';

// Constants
export { APP_CONFIG } from './constants';
