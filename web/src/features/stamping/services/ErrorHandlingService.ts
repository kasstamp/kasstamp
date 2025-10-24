import { walletService } from '@/features/wallet/services';
import { pageLogger } from '@/core/utils/logger';

export interface WalletError {
  type: 'locked' | 'not_found' | 'connection_required' | 'unknown';
  message: string;
  showWalletManagement: boolean;
}

export interface ErrorHandlingResult {
  error: WalletError | null;
  shouldShowWalletManagement: boolean;
}

export class ErrorHandlingService {
  /**
   * Analyze wallet-related errors and provide appropriate handling
   */
  static async analyzeWalletError(error: Error): Promise<ErrorHandlingResult> {
    const errorMsg = error.message;

    // Check for locked wallet
    if (errorMsg.includes('locked') || errorMsg.includes('Wallet is locked')) {
      const wallets = await walletService.listWallets();

      if (wallets.length > 0) {
        return {
          error: {
            type: 'locked',
            message: 'Wallet is locked. Please unlock your wallet to view this private receipt.',
            showWalletManagement: true,
          },
          shouldShowWalletManagement: true,
        };
      } else {
        return {
          error: {
            type: 'not_found',
            message:
              'No wallet found. Please create or import a wallet to view this private receipt.',
            showWalletManagement: true,
          },
          shouldShowWalletManagement: true,
        };
      }
    }

    // Check for wallet connection required
    if (
      errorMsg.includes('Wallet required') ||
      errorMsg.includes('no wallet') ||
      errorMsg.includes('Wallet connection required')
    ) {
      return {
        error: {
          type: 'connection_required',
          message: 'Wallet required to view private receipt. Please connect your wallet first.',
          showWalletManagement: true,
        },
        shouldShowWalletManagement: true,
      };
    }

    // Unknown error
    return {
      error: {
        type: 'unknown',
        message: `Failed to decrypt private receipt: ${errorMsg}`,
        showWalletManagement: false,
      },
      shouldShowWalletManagement: false,
    };
  }

  /**
   * Handle receipt decryption errors with proper error analysis
   */
  static async handleReceiptDecryptionError(
    error: Error,
    setError: (message: string) => void,
    setShowWalletManagement: (show: boolean) => void,
  ): Promise<void> {
    const result = await this.analyzeWalletError(error);

    if (result.error) {
      setError(result.error.message);
      setShowWalletManagement(result.shouldShowWalletManagement);
    }

    pageLogger.error('Receipt decryption failed:', error);
  }

  /**
   * Check if error is wallet-related
   */
  static isWalletError(error: Error): boolean {
    const errorMsg = error.message;
    return (
      errorMsg.includes('locked') ||
      errorMsg.includes('Wallet is locked') ||
      errorMsg.includes('Wallet required') ||
      errorMsg.includes('no wallet') ||
      errorMsg.includes('Wallet connection required')
    );
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(error: Error): string {
    if (this.isWalletError(error)) {
      const errorMsg = error.message;

      if (errorMsg.includes('locked')) {
        return 'Wallet is locked. Please unlock your wallet to continue.';
      }

      if (errorMsg.includes('Wallet required') || errorMsg.includes('no wallet')) {
        return 'Wallet required. Please connect your wallet first.';
      }
    }

    return error.message || 'An unexpected error occurred.';
  }
}
