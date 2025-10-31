import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ContentInterface } from '@/shared/components/ui/ContentInterface';
import { Button } from '@/shared/components/ui/Button';
import { walletService } from '@/features/wallet/services';
import { APP_CONFIG } from '@/features/wallet/constants';
import { formatExactAmount } from '@/shared/utils/formatBalance';
import { useWallet } from '@/shared/hooks/useWallet';
import { pageLogger } from '@/core/utils/logger';
import { stampMultipleArtifacts } from '../services';
import type { StampingReceipt } from '@kasstamp/sdk';
import {
  useEstimation,
  useFileUpload,
  useReceiptPreview,
  useQRScanner,
} from '../hooks';
import {
  ReceiptSuccessDialog,
  ReceiptPreviewDialog,
  WalletUnlockDialog,
  QRScannerDialog,
} from '../components';
import { ConfirmationDialog } from '@/shared/components/ui/ConfirmationDialog';
import WalletManagementDialog from '@/features/wallet/components/WalletManagementDialog';
import type { PrivacyMode } from '../types';
import pako from 'pako';

// Augmented receipt with original file size (for private mode where fileSize is 0)
type AugmentedReceipt = StampingReceipt & {
  originalFileSize?: number;
};

// formatTimestampForFilename is now imported from ../utils

export default function StampPage() {
  const [walletState] = useWallet();

  // Mode and priority state
  const [mode, setMode] = useState<PrivacyMode>(() => {
    try {
      const stored = localStorage.getItem('kasstamp_mode');
      return stored === 'private' || stored === 'public' ? (stored as PrivacyMode) : 'public';
    } catch {
      return 'public';
    }
  });

  const [isPriority, setIsPriority] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('kasstamp_priority');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // Persist priority to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('kasstamp_priority', String(isPriority));
    } catch {
      // Ignore localStorage errors
    }
  }, [isPriority]);

  // Text state
  const [text, setText] = useState('');

  // Custom hooks for complex logic
  const fileUpload = useFileUpload();
  const estimation = useEstimation({
    mode,
    isPriority,
    isConnected: walletState.isConnected,
    hasWallet: walletState.hasWallet,
  });
  const receiptPreview = useReceiptPreview();
  const qrScanner = useQRScanner();

  // Helper function to decode receipt from URL or JSON
  const decodeReceipt = useCallback((data: string): StampingReceipt => {
    // First try to parse as regular JSON
    try {
      const jsonReceipt = JSON.parse(data) as StampingReceipt;
      pageLogger.info('📄 Receipt loaded as JSON from KAS file');
      return jsonReceipt;
    } catch {
      // If JSON parsing fails, check if it's a URL-based receipt
      let base64Data: string | null = null;

      // Check for full URL format (https://localhost:5174/r/...)
      const fullUrlMatch = data.match(/https?:\/\/[^/]+\/r\/(.+)$/);
      if (fullUrlMatch) {
        base64Data = fullUrlMatch[1];
        pageLogger.info(
          `🔍 Full URL receipt detected in KAS file: ${base64Data.substring(0, 50)}...`,
        );
      }
      // Check for path format (/r/...)
      else if (data.startsWith('/r/')) {
        base64Data = data.substring(3); // Remove '/r/' prefix
        pageLogger.info(
          `🔍 Path URL receipt detected in KAS file: ${base64Data.substring(0, 50)}...`,
        );
      }
      // Check for just the base64 data
      else if (data.match(/^[A-Za-z0-9_-]+$/)) {
        base64Data = data;
        pageLogger.info(
          `🔍 Base64 receipt detected in KAS file: ${base64Data.substring(0, 50)}...`,
        );
      }

      if (base64Data) {
        try {
          // Restore URL-safe base64 to standard base64
          let restoredBase64 = base64Data.replace(/-/g, '+').replace(/_/g, '/');
          // Add padding if needed
          while (restoredBase64.length % 4) {
            restoredBase64 += '=';
          }

          pageLogger.info(`🔍 Restored standard base64: ${restoredBase64.substring(0, 50)}...`);

          // Decode base64 to binary
          const binaryString = atob(restoredBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Decompress with pako
          const decompressed = pako.inflate(bytes, { to: 'string' });
          const receipt = JSON.parse(decompressed) as StampingReceipt;

          pageLogger.info('📄 Receipt loaded from KAS file URL');
          return receipt;
        } catch (urlError) {
          pageLogger.error('❌ Failed to decode URL-based receipt:', urlError as Error);
          throw new Error('Invalid URL-based receipt format');
        }
      } else {
        // Neither JSON nor URL format
        pageLogger.error('❌ Failed to parse receipt - not JSON or URL format');
        throw new Error('Invalid receipt format - must be JSON or URL-based');
      }
    }
  }, []);

  // URL listener for receipt decoding - wait for SDK to be ready
  useEffect(() => {
    const handleUrlReceipt = async () => {
      const path = window.location.pathname;
      const urlMatch = path.match(/^\/r\/(.+)$/);

      if (urlMatch) {
        const base64Data = urlMatch[1];
        pageLogger.info(`🔍 URL receipt detected: ${base64Data.substring(0, 50)}...`);

        try {
          const receipt = decodeReceipt(`/r/${base64Data}`);
          pageLogger.info('📄 Receipt loaded from URL');

          // Check if receipt is encrypted and auto-decrypt if needed
          if (receipt.privacy === 'private' || receipt.encrypted === true) {
            try {
              const decrypted = await receiptPreview.decryptReceipt(receipt);
              receiptPreview.openReceipt(decrypted);
            } catch (decryptError) {
              const errorMsg = (decryptError as Error)?.message || String(decryptError);
              pageLogger.error(`Failed to decrypt private receipt: ${errorMsg}`);

              // Check for specific wallet errors
              if (errorMsg.includes('locked') || errorMsg.includes('Wallet is locked')) {
                // Check if user has wallets
                const wallets = await walletService.listWallets();
                if (wallets.length > 0) {
                  // User has wallets but they're locked - show error with button
                  setError(
                    'Wallet is locked. Please unlock your wallet to view this private receipt.',
                  );
                } else {
                  // No wallets - show error with button
                  setError(
                    'No wallet found. Please create or import a wallet to view this private receipt.',
                  );
                }
              } else if (
                errorMsg.includes('Wallet required') ||
                errorMsg.includes('no wallet') ||
                errorMsg.includes('Wallet connection required')
              ) {
                // No wallet - show error with button
                setError(
                  'Wallet required to view private receipt. Please connect your wallet first.',
                );
              } else {
                setError(`Failed to decrypt private receipt: ${errorMsg}`);
              }
              return; // Don't open the encrypted receipt
            }
          } else {
            // Public receipt - open directly
            receiptPreview.openReceipt(receipt);
          }

          // Clean up URL
          window.history.replaceState({}, '', '/');
        } catch (err) {
          const errorMsg = (err as Error)?.message || String(err);
          pageLogger.error(`Failed to load receipt from URL: ${errorMsg}`);
        }
      }
    };

    // Process URL immediately, don't wait for SDK
    void handleUrlReceipt();

    // Listen for URL changes
    window.addEventListener('popstate', () => void handleUrlReceipt());

    return () => {
      window.removeEventListener('popstate', () => void handleUrlReceipt());
    };
  }, [receiptPreview, decodeReceipt]);

  // Stamping state
  const [saving, setSaving] = useState(false);
  const [, setProgress] = useState(0); // Progress tracking for future use
  const [receipt, setReceipt] = useState<AugmentedReceipt | AugmentedReceipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletSecret, setWalletSecret] = useState('');
  const [walletMnemonic, setWalletMnemonic] = useState('');
  const [showWalletSecretDialog, setShowWalletSecretDialog] = useState(false);
  const [showWalletManagementDialog, setShowWalletManagementDialog] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleErrorClick = () => {
    if (
      error &&
      (error.includes('Wallet is locked') ||
        error.includes('No wallet found') ||
        error.includes('Wallet required to view private receipt'))
    ) {
      setShowWalletManagementDialog(true);
    }
  };

  const selectedBytes = useMemo(() => {
    const filesBytes = fileUpload.attachments.reduce((sum, f) => sum + f.size, 0);
    const textBytes = text ? new Blob([text]).size : 0;
    return filesBytes + textBytes;
  }, [fileUpload.attachments, text]);

  // Trigger estimation update when dependencies change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void estimation.updateEstimate(fileUpload.attachments, text);
    }, 300); // Debounce by 300ms
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUpload.attachments, text, mode, isPriority]);

  // Custom onDrop handler that checks for .kas files first, then delegates to fileUpload
  const handleDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();

    const files = ev.dataTransfer.files;
    if (!files || !files.length) {
      // Reset drag state if no files
      fileUpload.resetDragState();
      return;
    }

    // Check for .kas receipt file
    const kasFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.kas'));
    if (kasFile) {
      // Reset drag state immediately for receipt files
      fileUpload.resetDragState();

      // Parse and auto-decrypt the kas receipt file
      kasFile
        .text()
        .then(async (text) => {
          try {
            const parsed = decodeReceipt(text);

            // Auto-decrypt if it's a private receipt
            try {
              const decrypted = await receiptPreview.decryptReceipt(parsed);
              receiptPreview.openReceipt(decrypted);
              // Ensure drag state is reset after successful processing
              fileUpload.resetDragState();
            } catch (decryptError) {
              const errorMsg = (decryptError as Error).message;

              // Check for specific wallet errors
              if (errorMsg.includes('locked') || errorMsg.includes('Wallet is locked')) {
                // Check if user has wallets
                const wallets = await walletService.listWallets();
                if (wallets.length > 0) {
                  // User has wallets but they're locked - show error with button
                  setError(
                    'Wallet is locked. Please unlock your wallet to view this private receipt.',
                  );
                } else {
                  // No wallets - show error with button
                  setError(
                    'No wallet found. Please create or import a wallet to view this private receipt.',
                  );
                }
              } else if (
                errorMsg.includes('Wallet required') ||
                errorMsg.includes('no wallet') ||
                errorMsg.includes('Wallet connection required')
              ) {
                // No wallet - show error with button
                setError(
                  'Wallet required to view private receipt. Please connect your wallet first.',
                );
              } else {
                setError(`Failed to decrypt private receipt: ${errorMsg}`);
              }
              // Ensure drag state is reset even on decrypt error
              fileUpload.resetDragState();
            }
          } catch {
            setError('Invalid .kas receipt file (parse failed)');
            // Ensure drag state is reset even on parse error
            fileUpload.resetDragState();
          }
        })
        .catch(() => {
          setError('Failed to read .kas receipt file');
          // Ensure drag state is reset even on error
          fileUpload.resetDragState();
        });
      return;
    }

    // Delegate to fileUpload hook for regular files
    fileUpload.onDrop(ev);
  };

  // Additional safety: reset drag state on any drag end event
  const handleDragEnd = (ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    fileUpload.resetDragState();
  };

  const handleStampingInitiation = async () => {
    if (!walletState.isConnected || !walletState.hasWallet) {
      setError('Please connect and setup a wallet first');
      return;
    }

    if (selectedBytes === 0) {
      setError('Please add some content to stamp');
      return;
    }

    if (!estimation) {
      setError('Please wait for cost estimation to complete');
      return;
    }

    // Check if signing enclave is unlocked
    const wallet = walletService.getCurrentWallet();
    if (!wallet) {
      setError('No wallet available');
      return;
    }

    const enclaveStatus = wallet.signingEnclave.getStatus();

    // If enclave is unlocked and has mnemonic, proceed directly
    if (!enclaveStatus.isLocked && enclaveStatus.hasMnemonic) {
      pageLogger.info('🔓 Signing enclave is unlocked, proceeding with stamping...');
      await performStamping();
      return;
    }

    // Otherwise, ask for credentials
    pageLogger.info('🔐 Requesting credentials to unlock signing enclave...');
    setShowWalletSecretDialog(true);
  };

  async function onSave() {
    if (mode === 'public') {
      setShowConfirmationDialog(true);
    } else {
      await handleStampingInitiation();
    }
  }

  // Perform actual stamping after getting wallet secret (or using unlocked enclave)
  async function performStamping() {
    const wallet = walletService.getCurrentWallet();
    if (!wallet) {
      setError('No wallet available');
      return;
    }

    const enclaveStatus = wallet.signingEnclave.getStatus();

    // If enclave is locked or missing mnemonic, we need to unlock/store
    if (enclaveStatus.isLocked || !enclaveStatus.hasMnemonic) {
      if (!walletSecret) {
        setError('Wallet password is required for stamping');
        return;
      }

      try {
        // If no mnemonic in enclave, store it first
        if (!enclaveStatus.hasMnemonic) {
          if (!walletMnemonic) {
            setError(
              'Wallet mnemonic (12 or 24-word recovery phrase) is required for first-time stamping',
            );
            return;
          }
          pageLogger.info('💾 Storing mnemonic in secure enclave...');
          await wallet.signingEnclave.storeMnemonic({
            mnemonic: walletMnemonic,
            password: walletSecret,
          });
        }

        // Unlock the enclave (mnemonic is now stored, just need to decrypt it)
        pageLogger.info('🔓 Unlocking signing enclave with password...');
        await wallet.signingEnclave.unlock({
          password: walletSecret,
          autoLockMs: 30 * 60 * 1000, // 30 minutes
        });
        pageLogger.info('✅ Signing enclave unlocked for stamping');
      } catch (err) {
        setError('Failed to unlock signing enclave: ' + (err as Error).message);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setProgress(10);

    try {
      const hasFiles = fileUpload.attachments.length > 0;
      const hasText = !!text.trim();

      if (!hasFiles && !hasText) {
        throw new Error('No content to stamp');
      }

      pageLogger.info(
        `💸 Starting stamping for ${fileUpload.attachments.length} files + ${hasText ? '1 text' : '0 text'}...`,
      );
      setProgress(20);

      // Calculate priority fee once based on toggle state
      const priorityFee = isPriority ? APP_CONFIG.priorityFeeSompi : 0n;

      // Use multi-artifact stamping - each artifact gets its own receipt
      // Only pass walletSecret/mnemonic if enclave was locked (they'll be empty otherwise)
      // NOTE: We no longer pass mnemonic - it's handled by the wallet's secure enclave!
      const result = await stampMultipleArtifacts(
        fileUpload.attachments,
        text,
        { mode, compression: false, priorityFee },
        // walletSecret and mnemonic are legacy parameters - enclave handles signing now
      );

      setProgress(90);

      // Augment receipts with original file sizes (important for private mode where fileSize is 0)
      const augmentedReceipts = result.receipts.map((receipt, index) => {
        // For file receipts, get original size from attachments
        if (index < fileUpload.attachments.length) {
          return { ...receipt, originalFileSize: fileUpload.attachments[index].size };
        }
        // For text receipt, calculate size
        if (hasText && index === result.receipts.length - 1) {
          const textSize = new Blob([text]).size;
          return { ...receipt, originalFileSize: textSize };
        }
        return receipt;
      });

      // Set the receipts (array of receipts, one per artifact)
      setReceipt(augmentedReceipts.length === 1 ? augmentedReceipts[0] : augmentedReceipts);
      setProgress(100);

      // Clear the form after successful stamping
      fileUpload.clearAttachments();
      setText('');
      estimation.clearEstimation();
      // No need to trigger estimation here since we're clearing everything

      pageLogger.info(
        `✅ All artifacts stamped successfully! Total receipts: ${result.receipts.length}`,
      );
    } catch (error) {
      setError('Stamping failed: ' + (error as Error).message);
    } finally {
      setSaving(false);
      setShowWalletSecretDialog(false);
      setWalletSecret('');
      setWalletMnemonic('');
    }
  }

  // Debug logging for isEstimating state
  useEffect(() => {
    pageLogger.info('📊 isEstimating state changed to:', { isEstimating: estimation.isEstimating });
  }, [estimation.isEstimating]);

  // Persist mode to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('kasstamp_mode', mode);
    } catch {
      // Ignore localStorage errors (privacy mode, etc.)
    }
  }, [mode]);

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-3 py-8 sm:px-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-2xl leading-snug font-bold sm:text-4xl sm:leading-tight md:text-5xl">
          Stamp your data on the Layer-1
          <br />
          Kaspa BlockDAG.
        </h1>
        <p className="text-sm md:text-base">
          Secure. Private. <span className="font-semibold">Decentralized.</span>
        </p>
      </div>

      <ContentInterface
        text={text}
        onTextChange={setText}
        dragCounter={fileUpload.dragCounter}
        isWobbling={fileUpload.isWobbling}
        onDragEnter={fileUpload.onDragEnter}
        onDragLeave={fileUpload.onDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        attachments={fileUpload.attachments}
        imageURLs={fileUpload.imageURLs}
        onRemoveAttachment={(i: number) => {
          fileUpload.removeAttachment(i);
        }}
        fileInputRef={fileUpload.fileInputRef}
        onScanQR={() => setShowQRScanner(true)}
        onFileInputChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
          const files = e.target.files;
          if (!files || !files.length) return;
          const list = Array.from(files);
          const kasFile = list.find((f: File) => f.name.toLowerCase().endsWith('.kas'));
          if (kasFile) {
            try {
              const textContent = await kasFile.text();
              const parsed = decodeReceipt(textContent);

              // Auto-decrypt if it's a private receipt
              try {
                const decrypted = await receiptPreview.decryptReceipt(parsed);
                receiptPreview.openReceipt(decrypted);
              } catch (decryptError) {
                const errorMsg = (decryptError as Error).message;

                // Check for specific wallet errors
                if (errorMsg.includes('locked') || errorMsg.includes('Wallet is locked')) {
                  // Check if user has wallets
                  const wallets = await walletService.listWallets();
                  if (wallets.length > 0) {
                    // User has wallets but they're locked - show error with link
                    setError(
                      'Wallet is locked. Please unlock your wallet to view this private receipt.',
                    );
                  } else {
                    // No wallets - show error with button
                    setError(
                      'No wallet found. Please create or import a wallet to view this private receipt.',
                    );
                  }
                } else if (errorMsg.includes('Wallet required') || errorMsg.includes('no wallet')) {
                  // No wallet - show error with button
                  setError(
                    'Wallet required to view private receipt. Please connect your wallet first.',
                  );
                } else {
                  setError(`Failed to decrypt private receipt: ${errorMsg}`);
                }
              }
            } catch {
              setError('Invalid .kas receipt file (parse failed)');
            } finally {
              (e.target as HTMLInputElement).value = '';
            }
            return;
          }
          // For non-.kas files, delegate to fileUpload hook
          fileUpload.onFileInputChange(e);
          (e.target as HTMLInputElement).value = '';
        }}
        mode={mode}
        onModeChange={(next) => setMode(next as PrivacyMode)}
        isPriority={isPriority}
        onPriorityChange={setIsPriority}
        selectedBytes={selectedBytes}
        saving={saving}
        onSave={onSave}
        estimatedCostText={
          estimation.isEstimating && estimation.estimation
            ? `~ ${formatExactAmount(estimation.estimation.totalCostKAS)} (updating...)`
            : estimation.isEstimating
              ? 'Calculating...'
              : estimation.estimation
                ? `~ ${formatExactAmount(estimation.estimation.totalCostKAS)}`
                : '~ 0.000000 KAS'
        }
      />

      {error && (
        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
          </div>

          {(error.includes('Wallet is locked') ||
            error.includes('No wallet found') ||
            error.includes('Wallet required to view private receipt')) && (
            <div className="flex justify-center">
              <Button onClick={handleErrorClick}>Unlock or Import Your Wallet</Button>
            </div>
          )}
        </div>
      )}

      <ReceiptSuccessDialog receipt={receipt} onClose={() => setReceipt(null)} />

      <ReceiptPreviewDialog
        isOpen={receiptPreview.kasReceiptModalOpen}
        receipt={receiptPreview.kasReceiptObj}
        imagePreview={receiptPreview.kasImagePreview}
        imageLoading={receiptPreview.kasImageLoading}
        textPreview={receiptPreview.kasTextPreview}
        textLoading={receiptPreview.kasTextLoading}
        downloadPct={receiptPreview.kasDownloadPct}
        downloadText={receiptPreview.kasDownloadText}
        downloading={receiptPreview.kasDownloading}
        isSDKLoading={receiptPreview.isSDKLoading}
        onClose={receiptPreview.closeReceipt}
        onError={setError}
        onDownloadingChange={receiptPreview.setKasDownloading}
        onDownloadPctChange={(next: number) => {
          /* handled by hook */
          void next;
        }}
        onDownloadTextChange={(txt: string) => {
          /* handled by hook */
          void txt;
        }}
        onImagePreviewRevoke={() => {
          /* handled by closeReceipt */
        }}
      />

      {/* Wallet Secret Dialog for Stamping (uses default Dialog) */}
      <WalletUnlockDialog
        isOpen={showWalletSecretDialog}
        mode={mode}
        estimation={estimation.estimation}
        walletSecret={walletSecret}
        walletMnemonic={walletMnemonic}
        onWalletSecretChange={setWalletSecret}
        onWalletMnemonicChange={setWalletMnemonic}
        onClose={() => {
          setShowWalletSecretDialog(false);
          setWalletSecret('');
          setWalletMnemonic('');
        }}
        onUnlock={performStamping}
      />

      {/* QR Scanner Dialog */}
      <QRScannerDialog
        isOpen={showQRScanner}
        onClose={() => {
          void qrScanner.stopScanning();
          setShowQRScanner(false);
        }}
        isScanning={qrScanner.isScanning}
        error={qrScanner.error}
        onClearError={qrScanner.clearError}
        onStartScanning={(elementId) => {
          void qrScanner.startScanning(elementId, (receipt) => {
            // Stop scanner first
            void qrScanner.stopScanning();

            // Close scanner dialog
            setShowQRScanner(false);

            // Small delay to ensure dialog closes before opening receipt
            setTimeout(() => {
              void (async () => {
                try {
                  // Try to decrypt if it's a private receipt
                  const decrypted = await receiptPreview.decryptReceipt(receipt);
                  receiptPreview.openReceipt(decrypted);
                } catch (decryptError) {
                  const errorMsg = (decryptError as Error).message;

                  // Check for specific wallet errors
                  if (errorMsg.includes('locked') || errorMsg.includes('Wallet is locked')) {
                    // Check if user has wallets
                    const wallets = await walletService.listWallets();
                    if (wallets.length > 0) {
                      // User has wallets but they're locked - show error with button
                      setError(
                        'Wallet is locked. Please unlock your wallet to view this private receipt.',
                      );
                    } else {
                      // No wallets - show error with button
                      setError(
                        'No wallet found. Please create or import a wallet to view this private receipt.',
                      );
                    }
                  } else if (
                    errorMsg.includes('Wallet required') ||
                    errorMsg.includes('no wallet')
                  ) {
                    // No wallet - show error with button
                    setError(
                      'Wallet required to view private receipt. Please connect your wallet first.',
                    );
                  } else {
                    setError(`Failed to decrypt private receipt: ${errorMsg}`);
                  }
                }
              })();
            }, 100);
          });
        }}
        onStopScanning={() => {
          void qrScanner.stopScanning();
        }}
      />

      {/* Wallet Management Dialog for URL receipt decryption */}
      <WalletManagementDialog
        isOpen={showWalletManagementDialog}
        onClose={() => {
          setShowWalletManagementDialog(false);
          setError(null); // Clear error when dialog closes
        }}
        onWalletUnlocked={() => {
          // When wallet is unlocked, try to process any pending receipt
          setShowWalletManagementDialog(false);
          setError(null);

          // Re-process the URL receipt after wallet unlock
          const path = window.location.pathname;
          const urlMatch = path.match(/^\/r\/(.+)$/);
          if (urlMatch) {
            const base64Data = urlMatch[1];
            pageLogger.info(
              `🔄 Retrying URL receipt after wallet unlock: ${base64Data.substring(0, 50)}...`,
            );

            try {
              const receipt = decodeReceipt(`/r/${base64Data}`);
              // Now try decryption again
              receiptPreview
                .decryptReceipt(receipt)
                .then((decrypted) => {
                  receiptPreview.openReceipt(decrypted);
                  // Clean up URL
                  window.history.replaceState({}, '', '/');
                })
                .catch((decryptError) => {
                  const errorMsg = (decryptError as Error)?.message || String(decryptError);
                  setError(`Still failed to decrypt: ${errorMsg}`);
                });
            } catch (err) {
              const errorMsg = (err as Error)?.message || String(err);
              setError(`Failed to reload receipt: ${errorMsg}`);
            }
          }

          // Note: For KAS files and QR scanner, the user would need to re-upload/scan
          // since we don't store the receipt data globally. The error message will
          // guide them to try again after unlocking their wallet.
        }}
      />
      
      <ConfirmationDialog
        isOpen={showConfirmationDialog}
        onClose={() => setShowConfirmationDialog(false)}
        onConfirm={() => {
          setShowConfirmationDialog(false);
          void handleStampingInitiation();
        }}
        title="Public Mode Upload"
        description="Warning: Uploading in public mode is irreversible. The uploaded data will be permanently and publicly visible on the blockchain. Do you want to continue?"
      />
    </div>
  );
}
