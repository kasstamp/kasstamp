/**
 * @fileoverview Shared Module Public API
 *
 * Barrel export for shared utilities, hooks, and components
 */

// Hooks
export { useWallet } from './hooks/useWallet';
export type { WalletState, WalletActions } from './hooks/useWallet';

// Utils
export { cn } from '@/core/utils/cn';

// UI Components are imported directly via @/shared/components/ui/...
// No re-export needed as they're used directly
