/**
 * @fileoverview QR Code Scanner Hook
 *
 * Manages QR code scanning functionality for receipts
 */

import { useState, useCallback, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { StampingReceipt } from '@kasstamp/sdk';
import { pageLogger } from '@/core/utils/logger';
import pako from 'pako';

export function useQRScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanning = useCallback(
    async (elementId: string, onSuccess: (receipt: StampingReceipt) => void): Promise<void> => {
      try {
        setError(null);
        setIsScanning(true);

        // Create Html5Qrcode instance
        const html5QrCode = new Html5Qrcode(elementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // Start scanning with optimized config for complex QR codes
        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10, // Lower FPS for better decoding quality
            qrbox: 400, // Larger scan box for easier targeting
            aspectRatio: 1.0, // Square
            disableFlip: false, // Try both orientations
          },
          (decodedText) => {
            try {
              let parsed: unknown;

              // Check if it's a URL-based receipt (compressed format)
              if (decodedText.includes('/r/')) {
                try {
                  // Extract base64 data from URL
                  const urlMatch = decodedText.match(/\/r\/([^/?#]+)/);
                  if (!urlMatch) {
                    setError('Invalid receipt URL format.');
                    return;
                  }

                  let base64Data = urlMatch[1];

                  // Restore URL-safe base64 to standard base64
                  pageLogger.info(`🔍 Original URL-safe base64: ${base64Data.substring(0, 50)}...`);
                  base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                  // Add padding if needed
                  while (base64Data.length % 4) {
                    base64Data += '=';
                  }
                  pageLogger.info(`🔍 Restored standard base64: ${base64Data.substring(0, 50)}...`);

                  // Decode base64 to binary
                  pageLogger.info(`🔍 Decoding base64: ${base64Data.substring(0, 50)}...`);
                  pageLogger.info(`🔍 Base64 length: ${base64Data.length}`);

                  const binaryString = atob(base64Data);
                  pageLogger.info(`🔍 Binary string length: ${binaryString.length}`);

                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  pageLogger.info(`🔍 Bytes array length: ${bytes.length}`);
                  pageLogger.info(
                    `🔍 First few bytes: ${Array.from(bytes.slice(0, 10)).join(',')}`
                  );

                  // Decompress with pako
                  const decompressed = pako.inflate(bytes, { to: 'string' });
                  pageLogger.info(`🔍 Decompressed length: ${decompressed.length}`);
                  pageLogger.info(`🔍 Decompressed sample: ${decompressed.substring(0, 100)}...`);

                  parsed = JSON.parse(decompressed);
                } catch (urlErr) {
                  const error = urlErr as Error;
                  pageLogger.error(`Failed to decode receipt URL: ${error.message}`);
                  setError('Failed to decode receipt URL.');
                  return;
                }
              } else if (decodedText.match(/^[A-Za-z0-9_-]+$/)) {
                // Direct base64 string (new format)
                try {
                  let base64Data = decodedText;

                  // Restore URL-safe base64 to standard base64
                  pageLogger.info(`🔍 Direct base64 detected: ${base64Data.substring(0, 50)}...`);
                  base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
                  // Add padding if needed
                  while (base64Data.length % 4) {
                    base64Data += '=';
                  }
                  pageLogger.info(`🔍 Restored standard base64: ${base64Data.substring(0, 50)}...`);

                  // Decode base64 to binary
                  pageLogger.info(`🔍 Decoding base64: ${base64Data.substring(0, 50)}...`);
                  pageLogger.info(`🔍 Base64 length: ${base64Data.length}`);

                  const binaryString = atob(base64Data);
                  pageLogger.info(`🔍 Binary string length: ${binaryString.length}`);

                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  pageLogger.info(`🔍 Bytes array length: ${bytes.length}`);
                  pageLogger.info(
                    `🔍 First few bytes: ${Array.from(bytes.slice(0, 10)).join(',')}`
                  );

                  // Decompress with pako
                  const decompressed = pako.inflate(bytes, { to: 'string' });
                  pageLogger.info(`🔍 Decompressed length: ${decompressed.length}`);
                  pageLogger.info(`🔍 Decompressed sample: ${decompressed.substring(0, 100)}...`);

                  parsed = JSON.parse(decompressed);
                } catch (base64Err) {
                  const error = base64Err as Error;
                  pageLogger.error(`Failed to decode base64 receipt: ${error.message}`);
                  setError('Failed to decode base64 receipt.');
                  return;
                }
              } else {
                // Try parsing as direct JSON (legacy format)
                parsed = JSON.parse(decodedText);
              }

              if (isValidReceipt(parsed)) {
                // Valid receipt found - stop scanner and open receipt
                html5QrCode
                  .stop()
                  .then(() => {
                    html5QrCode.clear();
                    scannerRef.current = null;
                    setIsScanning(false);
                    setError(null); // Clear any previous errors
                    onSuccess(parsed as StampingReceipt);
                  })
                  .catch((err) => {
                    const error = err as Error;
                    pageLogger.error(`Error stopping scanner: ${error.message}`);
                  });
              } else {
                // Invalid receipt - show error but keep scanning
                setError('Invalid receipt. Please scan a valid KAS receipt QR code.');
              }
            } catch {
              // Invalid format - show error but keep scanning
              setError('Invalid QR code format. Please scan a valid KAS receipt.');
            }
          },
          () => {
            // Error callback - ignore
          }
        );
      } catch (err) {
        const error = err as Error;
        pageLogger.error(`Failed to start scanner: ${error.message}`);
        setError(error.message || 'Failed to access camera');
        setIsScanning(false);
      }
    },
    []
  );

  const stopScanning = useCallback(async (): Promise<void> => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        setIsScanning(false);
        setError(null);
      } catch (err) {
        const error = err as Error;
        pageLogger.error(`Failed to stop scanner: ${error.message}`);
      }
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isScanning,
    error,
    startScanning,
    stopScanning,
    clearError,
  };
}

function isValidReceipt(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const receipt = obj as Record<string, unknown>;
  return (
    typeof receipt.id === 'string' &&
    typeof receipt.timestamp === 'string' &&
    typeof receipt.hash === 'string' &&
    (receipt.privacy === 'public' || receipt.privacy === 'private') &&
    (Array.isArray(receipt.txIds) || Array.isArray(receipt.transactionIds))
  );
}
