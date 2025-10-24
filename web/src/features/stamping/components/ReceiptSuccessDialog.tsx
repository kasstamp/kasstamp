/**
 * @fileoverview Receipt Success Dialog Component
 *
 * Displays stamping receipts after successful stamping operation
 */

import { Button } from '@/shared/components/ui/Button';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import type { StampingReceipt } from '@kasstamp/sdk';
import { formatTimestampForFilename } from '../utils';
import { formatExactAmount } from '@/shared/utils/formatBalance';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useEffect } from 'react';
import { Check, Share2, Link, QrCode } from 'lucide-react';
import pako from 'pako';
import { pageLogger } from '@/core/utils/logger';

interface AugmentedReceipt extends StampingReceipt {
  originalFileSize?: number;
}

interface ReceiptSuccessDialogProps {
  receipt: AugmentedReceipt | AugmentedReceipt[] | null;
  onClose: () => void;
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

function ReceiptItem({ receipt, index }: { receipt: AugmentedReceipt; index?: number }) {
  const displaySize = receipt.originalFileSize || receipt.fileSize || 0;
  const isPrivate = receipt.privacy === 'private';
  const qrRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedItem, setCopiedItem] = useState<'url' | 'qr' | null>(null);

  // Create URL with compressed receipt data (JSON -> GZIP -> Base64)
  const receiptJson = JSON.stringify(receipt);

  // Compress with GZIP for maximum space efficiency
  const compressed = pako.deflate(receiptJson);

  // Convert to base64 (URL-safe) - robust approach
  pageLogger.info(`🔍 Converting ${compressed.length} bytes to base64`);

  // Convert Uint8Array to base64 using a more robust method
  let binaryString = '';
  for (let i = 0; i < compressed.length; i++) {
    binaryString += String.fromCharCode(compressed[i]);
  }

  const base64 = btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // Remove padding

  pageLogger.info(`🔍 Base64 created: ${base64.length} chars`);
  pageLogger.info(`🔍 Base64 sample: ${base64.substring(0, 50)}...`);

  const receiptUrl = `${window.location.origin}/r/${base64}`;
  const receiptData = receiptUrl; // QR code should contain full URL for universal compatibility
  const receiptBase64 = base64; // KAS file should contain only base64 string

  // Check if QR code is feasible (QR Code V40-L supports ~4296 alphanumeric chars)
  const QR_CODE_LIMIT = 2500; // Conservative limit for reliable scanning
  const showQRCode = receiptData.length <= QR_CODE_LIMIT;

  // Log compression stats for debugging
  const originalSize = receiptJson.length;
  const compressedSize = compressed.length;
  const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  pageLogger.info(
    `📦 Receipt compression: ${originalSize} → ${compressedSize} bytes (${ratio}% saved)`,
  );
  pageLogger.info(
    `🔗 URL length: ${receiptData.length} chars ${showQRCode ? '✅ QR OK' : '❌ Too large for QR'}`,
  );
  pageLogger.info(`🔍 Base64 length: ${base64.length} chars`);
  pageLogger.info(`🔍 Base64 sample: ${base64.substring(0, 50)}...`);

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target as Node) &&
        shareButtonRef.current &&
        !shareButtonRef.current.contains(event.target as Node)
      ) {
        setShowShareMenu(false);
      }
    };

    if (showShareMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showShareMenu]);

  // Share via Web Share API (URL with QR image if available)
  const handleShareViaWebAPI = async () => {
    if (!navigator.share) {
      alert('Share not supported on this device');
      return;
    }

    try {
      // If QR code is available, share it as image
      if (showQRCode) {
        const svgElement = qrRef.current?.querySelector('svg');
        if (!svgElement) {
          // Fallback to URL text if QR element not found
          await navigator.share({
            title: 'KAS Receipt',
            text: `Receipt for ${receipt.fileName || 'file'}`,
            url: receiptUrl,
          });
          setShowShareMenu(false);
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = async () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);

          try {
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (b) => {
                  if (b) resolve(b);
                  else reject(new Error('Failed to convert canvas to blob'));
                },
                'image/png',
                1.0,
              );
            });

            const timestamp = formatTimestampForFilename(
              receipt.timestamp || new Date().toISOString(),
            );
            const filename = receipt.fileName || receipt.id || `receipt-${(index ?? 0) + 1}`;
            const file = new File([blob], `${timestamp}_${filename}_qr.png`, {
              type: 'image/png',
            });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: 'KAS Receipt QR Code',
                text: `Receipt for ${receipt.fileName || 'file'}`,
                files: [file],
              });
              setShowShareMenu(false);
            } else {
              // Fallback to URL
              await navigator.share({
                title: 'KAS Receipt',
                text: `Receipt for ${receipt.fileName || 'file'}`,
                url: receiptUrl,
              });
              setShowShareMenu(false);
            }
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              console.error('Share failed:', err);
            }
          }
        };

        img.src = url;
      } else {
        // No QR code - share URL as text
        await navigator.share({
          title: 'KAS Receipt',
          text: `Receipt for ${receipt.fileName || 'file'}`,
          url: receiptUrl,
        });
        setShowShareMenu(false);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Failed to share:', error);
      }
    }
  };

  // Copy Receipt URL (receiptData is now base64, but we want to copy the full URL)
  const handleCopyReceiptURL = async () => {
    try {
      await navigator.clipboard.writeText(receiptUrl);
      setCopiedItem('url');
      setTimeout(() => {
        setCopiedItem(null);
        setShowShareMenu(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  // Copy QR Code Image
  const handleCopyQRCodeImage = () => {
    try {
      const svgElement = qrRef.current?.querySelector('svg');
      if (!svgElement) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        try {
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => {
                if (b) resolve(b);
                else reject(new Error('Failed to convert canvas to blob'));
              },
              'image/png',
              1.0,
            );
          });

          // Try to copy to clipboard
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            try {
              const clipboardItem = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([clipboardItem]);
              setCopiedItem('qr');
              setTimeout(() => {
                setCopiedItem(null);
                setShowShareMenu(false);
              }, 1500);
              return;
            } catch (clipboardErr) {
              console.warn('Clipboard copy failed, falling back to download:', clipboardErr);
              // Fall through to download
            }
          }

          // Fallback: Download the image
          const timestamp = formatTimestampForFilename(
            receipt.timestamp || new Date().toISOString(),
          );
          const filename = receipt.fileName || receipt.id || `receipt-${(index ?? 0) + 1}`;
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${timestamp}_${filename}_qr.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);

          // Show success feedback even for download
          setCopiedItem('qr');
          setTimeout(() => {
            setCopiedItem(null);
            setShowShareMenu(false);
          }, 1500);
        } catch (error) {
          console.error('Failed to copy QR code:', error);
        }
      };

      img.src = url;
    } catch (error) {
      console.error('Failed to process QR code:', error);
    }
  };

  const handleDownload = () => {
    // Use 'application/octet-stream' to prevent iOS from adding .json extension
    const blob = new Blob([receiptBase64], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = formatTimestampForFilename(receipt.timestamp || new Date().toISOString());
    const filename = receipt.fileName || receipt.id || `receipt-${(index ?? 0) + 1}`;
    a.download = `${timestamp}_${filename}.kas`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 space-y-2 text-sm">
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Timestamp</span>
          <span className="text-gray-900 dark:text-gray-100">
            {new Date(receipt.timestamp).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">File Name</span>
          <span className="max-w-[60%] text-right break-words text-gray-900 dark:text-gray-100">
            {receipt.fileName ?? '—'}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">File Size</span>
          <span className="text-gray-900 dark:text-gray-100">{prettyBytes(displaySize)}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Privacy Mode</span>
          <span
            className={`font-medium ${isPrivate ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}
          >
            {isPrivate ? '🔒 Private' : '🌐 Public'}
          </span>
        </div>
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Chunks</span>
          <span className="text-gray-900 dark:text-gray-100">{receipt.chunkCount ?? '—'}</span>
        </div>
        <div className="flex justify-between border-b border-gray-200 py-1 dark:border-gray-700">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Compressed</span>
          <span className="text-gray-900 dark:text-gray-100">
            {receipt.compressed ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between py-1">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Total Cost</span>
          <span className="font-mono text-gray-900 dark:text-gray-100">
            {formatExactAmount(receipt.totalCostKAS)}
          </span>
        </div>
      </div>

      {/* QR Code Section - only show if receipt is small enough */}
      {showQRCode ? (
        <div
          ref={qrRef}
          className="mb-4 flex flex-col items-center rounded border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-900"
        >
          <div className="h-[200px] w-[200px]">
            <QRCodeSVG
              value={receiptData}
              size={1000}
              level="L"
              includeMargin={true}
              className="h-full w-full"
            />
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <div className="text-amber-600 dark:text-amber-400">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                QR Code not available
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                This receipt is too large to fit in a QR code. You can still share it using "Copy
                URL" or download the receipt file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleDownload} className="flex-1">
          Download Receipt
        </Button>

        {/* Share Button with Dropdown Menu */}
        <div className="relative flex-1">
          <Button
            ref={shareButtonRef}
            size="sm"
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="w-full"
          >
            <Share2 className="mr-1.5 h-4 w-4" />
            Share
          </Button>

          {/* Share Menu Popup */}
          {showShareMenu && (
            <div
              ref={shareMenuRef}
              className="absolute right-0 bottom-full z-50 mb-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
            >
              {/* Share via Web Share API */}
              {'share' in navigator && (
                <button
                  onClick={handleShareViaWebAPI}
                  className="flex w-full items-center gap-3 rounded-t-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Share2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-gray-900 dark:text-gray-100">Share via...</span>
                  </div>
                </button>
              )}

              {/* Copy Receipt URL */}
              <button
                onClick={handleCopyReceiptURL}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${!navigator.share ? 'rounded-t-lg' : ''} ${!showQRCode ? 'rounded-b-lg' : ''}`}
              >
                <Link className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-gray-900 dark:text-gray-100">Copy Receipt URL</span>
                  {copiedItem === 'url' && (
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
              </button>

              {/* Copy QR Code - only show if QR code is available */}
              {showQRCode && (
                <button
                  onClick={handleCopyQRCodeImage}
                  className="flex w-full items-center gap-3 rounded-b-lg px-4 py-3 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <QrCode className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-gray-900 dark:text-gray-100">Copy QR Code</span>
                    {copiedItem === 'qr' && (
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReceiptSuccessDialog({ receipt, onClose }: ReceiptSuccessDialogProps) {
  return (
    <Dialog
      open={!!receipt}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title="Proof successfully saved" alignTop>
        <p className="mb-4 text-gray-600 dark:text-gray-300">This is your receipt. Keep it safe.</p>
        {Array.isArray(receipt) ? (
          <div className="grid gap-3">
            {receipt.map((r, index) => (
              <ReceiptItem key={r.id} receipt={r} index={index} />
            ))}
            <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  receipt.forEach((r, index) => {
                    // Use 'application/octet-stream' to prevent iOS from adding .json extension
                    const blob = new Blob([JSON.stringify(r, null, 2)], {
                      type: 'application/octet-stream',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const timestamp = formatTimestampForFilename(
                      r.timestamp || new Date().toISOString(),
                    );
                    const filename = r.fileName || r.id || `receipt-${index + 1}`;
                    a.download = `${timestamp}_${filename}.kas`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setTimeout(() => {}, 100 * index);
                  });
                }}
              >
                Download All Receipts (Individual .kas files)
              </Button>
            </div>
          </div>
        ) : receipt ? (
          <ReceiptItem receipt={receipt} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
