/**
 * @fileoverview Stamping Feature Public API
 *
 * Barrel export for the stamping feature
 */

// Pages (default exports)
export { default as StampPage } from './pages/StampPage';

// Components (default exports from barrel)
export { ReceiptSuccessDialog, ReceiptPreviewDialog, WalletUnlockDialog } from './components';

// Hooks (named exports from barrel)
export { useEstimation, useFileUpload, useLinkPreview, useReceiptPreview } from './hooks';

// Services (named exports)
export { stampMultipleArtifacts, estimateMultipleArtifacts } from './services';

// Types
export type { PrivacyMode, AugmentedReceipt } from './types';
