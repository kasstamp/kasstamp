/**
 * @fileoverview Receipt Preview Dialog Component
 *
 * Displays .kas receipt files with preview and download functionality
 */

import { Button } from '@/shared/components/ui/Button';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import { walletService } from '@/features/wallet/services';
import { pageLogger } from '@/core/utils/logger';
import type { StampingReceipt } from '@kasstamp/sdk';
import { isImageFile, isTextFile, getFileExtension } from '../utils/fileHelpers';

interface ReceiptPreviewDialogProps {
  isOpen: boolean;
  receipt: StampingReceipt | null;
  imagePreview: string | null;
  imageLoading: boolean;
  textPreview: string | null;
  textLoading: boolean;
  downloadPct: number;
  downloadText: string;
  downloading: boolean;
  isSDKLoading: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onDownloadingChange: (downloading: boolean) => void;
  onDownloadPctChange: (pct: number) => void;
  onDownloadTextChange: (text: string) => void;
  onImagePreviewRevoke: () => void;
}

function prettyBytes(n?: number) {
  if (!n && n !== 0) return '–';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function ReceiptPreviewDialog({
  isOpen,
  receipt,
  imagePreview,
  imageLoading,
  textPreview,
  textLoading,
  downloadPct,
  downloadText,
  downloading,
  isSDKLoading,
  onClose,
  onError,
  onDownloadingChange,
  onDownloadPctChange,
  onDownloadTextChange,
  onImagePreviewRevoke,
}: ReceiptPreviewDialogProps) {
  const handleDownload = async () => {
    try {
      if (!receipt) return;
      const sdk = walletService.getSDK();
      if (!sdk) {
        onError('Not connected to network. Please connect first.');
        return;
      }

      // Determine if receipt is encrypted
      const isEncrypted = receipt?.encrypted === true || receipt?.privacy === 'private';

      // Only require wallet for private/encrypted receipts
      let wallet = null;
      if (isEncrypted) {
        wallet = walletService.getCurrentWallet();
        if (!wallet) {
          onError(
            'Encrypted receipt requires a wallet. Please connect and unlock your wallet first.',
          );
          return;
        }

        // Check if signing enclave is unlocked
        if (!wallet.signingEnclave) {
          onError('Wallet does not have a signing enclave. Please reconnect your wallet.');
          return;
        }

        if (wallet.signingEnclave.isLocked()) {
          onError('Signing enclave is locked. Please unlock your wallet first.');
          return;
        }

        if (!wallet.signingEnclave.hasMnemonic()) {
          onError('Signing enclave has no mnemonic. Please re-open your wallet.');
          return;
        }

        pageLogger.info('✅ Signing enclave is unlocked - proceeding with download');
      }

      onDownloadingChange(true);
      onDownloadPctChange(0);
      onDownloadTextChange('Initializing...');

      const result = await sdk.reconstructFile(receipt, wallet, (progress) => {
        const percentage =
          progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        onDownloadPctChange(percentage);

        let stageEmoji = '📥';
        switch (progress.stage) {
          case 'fetching':
            stageEmoji = '📥';
            break;
          case 'assembling':
            stageEmoji = '🔧';
            break;
          case 'decompressing':
            stageEmoji = '📦';
            break;
          case 'decrypting':
            stageEmoji = '🔐';
            break;
          case 'complete':
            stageEmoji = '✅';
            break;
        }
        onDownloadTextChange(`${stageEmoji} ${progress.message}`);
      });

      // Validate result structure
      if (!result) {
        throw new Error('Reconstruction failed: No result returned');
      }
      if (!result.data) {
        throw new Error('Reconstruction failed: No data in result');
      }
      if (typeof result.data.length === 'undefined') {
        throw new Error(
          `Reconstruction failed: Data has no length property. Data type: ${typeof result.data}`,
        );
      }
      if (!result.filename) {
        throw new Error('Reconstruction failed: No filename in result');
      }

      pageLogger.info('✅ All validations passed, calling downloadFile');
      sdk.downloadFile(result);
      onDownloadTextChange('✅ Complete');
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      if (msg && msg.toLowerCase().includes('wasm wallet')) {
        if (receipt?.encrypted === true || receipt?.privacy === 'private') {
          onError(
            'Encrypted receipt requires an unlocked wallet. Please open/unlock via Wallet Connect and try again.',
          );
        } else {
          onError(
            'Wallet not available. Please open your wallet via Wallet Connect, then try again.',
          );
        }
      } else {
        onError('Failed to download original file: ' + msg);
      }
    } finally {
      onDownloadingChange(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open && !downloading) {
          onClose();
        }
      }}
    >
      <DialogContent title="KAS Receipt" alignTop>
        {!receipt ? (
          <p className="text-[color:var(--text)]">No receipt loaded.</p>
        ) : (
          <div className="grid gap-4">
            {/* File Preview Section */}
            {receipt?.fileName && (
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: 'var(--background-outline)' }}
              >
                <h3 className="mb-3 text-sm font-medium text-[color:var(--text-strong)]">
                  File Preview
                </h3>

                {isImageFile(receipt.fileName) ? (
                  <div className="space-y-3">
                    <div
                      className="relative overflow-hidden rounded-lg"
                      style={{ minHeight: '200px', backgroundColor: 'var(--background)' }}
                    >
                      {imageLoading || isSDKLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
                            <span className="text-sm text-[color:var(--text)]">
                              Loading preview...
                            </span>
                          </div>
                        </div>
                      ) : imagePreview ? (
                        <img
                          src={imagePreview}
                          alt={receipt.fileName}
                          className="mx-auto max-h-64 max-w-full object-contain"
                          onError={() => {
                            pageLogger.info('🖼️ Image failed to load, revoking URL');
                            onImagePreviewRevoke();
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 text-[color:var(--text)]">
                            <div
                              className="flex h-16 w-16 items-center justify-center rounded-lg"
                              style={{ backgroundColor: 'var(--background-outline)' }}
                            >
                              <span className="text-2xl">🖼️</span>
                            </div>
                            <span className="text-sm">Preview not available</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium break-words text-[color:var(--text-strong)]">
                        {receipt.fileName}
                      </p>
                      <p className="text-xs text-[color:var(--text)]">
                        {getFileExtension(receipt.fileName)} Image
                      </p>
                    </div>
                  </div>
                ) : isTextFile(receipt.fileName) ? (
                  <div className="space-y-3">
                    <div
                      className="relative overflow-hidden rounded-lg"
                      style={{
                        minHeight: '200px',
                        maxHeight: '400px',
                        backgroundColor: 'var(--background)',
                      }}
                    >
                      {textLoading || isSDKLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
                            <span className="text-sm text-[color:var(--text)]">
                              Loading preview...
                            </span>
                          </div>
                        </div>
                      ) : textPreview ? (
                        <div className="h-full overflow-auto p-4">
                          <pre className="font-mono text-xs break-words whitespace-pre-wrap text-[color:var(--text)]">
                            {textPreview}
                          </pre>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 text-[color:var(--text)]">
                            <div
                              className="flex h-16 w-16 items-center justify-center rounded-lg"
                              style={{ backgroundColor: 'var(--background-outline)' }}
                            >
                              <span className="text-2xl">📝</span>
                            </div>
                            <span className="text-sm">Preview not available</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium break-words text-[color:var(--text-strong)]">
                        {receipt.fileName}
                      </p>
                      <p className="text-xs text-[color:var(--text)]">
                        {getFileExtension(receipt.fileName)} Text File
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-3 rounded-lg p-3"
                    style={{ backgroundColor: 'var(--background)' }}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                        {getFileExtension(receipt.fileName) || '📄'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words text-[color:var(--text-strong)]">
                        {receipt.fileName}
                      </p>
                      <p className="text-xs text-[color:var(--text)]">
                        {getFileExtension(receipt.fileName)} File
                        {receipt.fileSize && ` • ${prettyBytes(receipt.fileSize)}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Receipt Details */}
            <div className="grid gap-1 text-sm">
              <div>
                <span className="text-[color:var(--text)]">Reference (hash):</span>{' '}
                <code className="text-xs break-all text-[color:var(--text-strong)]">
                  {receipt?.hash ?? '—'}
                </code>
              </div>
              <div>
                <span className="text-[color:var(--text)]">Chunks:</span>{' '}
                <span className="text-[color:var(--text-strong)]">
                  {receipt?.chunkCount ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--text)]">Mode:</span>{' '}
                <span className="text-[color:var(--text-strong)]">{receipt?.privacy ?? '—'}</span>
              </div>
              <div>
                <span className="text-[color:var(--text)]">Uploaded:</span>{' '}
                <span className="text-[color:var(--text-strong)]">
                  {receipt?.timestamp
                    ? new Date(receipt.timestamp).toLocaleString()
                    : '—'}
                </span>
              </div>
            </div>

            {downloading && (
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span>{downloadText || 'Downloading...'}</span>
                  <span>{downloadPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{ width: `${downloadPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={downloading}>
                Close
              </Button>
              <Button onClick={handleDownload} disabled={downloading}>
                Download Original File
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
