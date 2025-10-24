/**
 * @fileoverview QR Scanner Dialog Component
 *
 * Provides camera-based QR code scanning for receipts
 */

import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import { X, Camera } from 'lucide-react';

interface QRScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isScanning: boolean;
  error: string | null;
  onStartScanning: (elementId: string) => void;
  onStopScanning: () => void;
  onClearError: () => void;
}

const SCANNER_ELEMENT_ID = 'qr-scanner-region';

export default function QRScannerDialog({
  isOpen,
  onClose,
  isScanning,
  error,
  onStartScanning,
  onStopScanning,
  onClearError,
}: QRScannerDialogProps) {
  const hasStartedRef = useRef(false);

  // Reset flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      hasStartedRef.current = false;
    }
  }, [isOpen]);

  // Auto-start scanning when scanner element is ready
  useEffect(() => {
    if (isOpen && !isScanning && !hasStartedRef.current) {
      // Short delay to ensure DOM is ready
      const timer = setTimeout(() => {
        const element = document.getElementById(SCANNER_ELEMENT_ID);
        if (element) {
          hasStartedRef.current = true;
          onStartScanning(SCANNER_ELEMENT_ID);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isScanning, onStartScanning]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      // This only runs when component unmounts
      onStopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    if (isScanning) {
      onStopScanning();
    }
    onClose();
  };

  const handleCameraTap = () => {
    // Clear error on tap to allow retry
    if (error) {
      onClearError();
    }
    // Note: Auto re-focus is handled by the html5-qrcode library
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent title="Scan Receipt QR Code" className="max-w-md">
        <style>
          {`
            #${SCANNER_ELEMENT_ID} video {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
            }
          `}
        </style>
        <div className="space-y-4">
          {/* Scanner Container */}
          <div
            className="relative w-full cursor-pointer overflow-hidden rounded-lg border-2 border-gray-300 bg-black dark:border-gray-600"
            style={{ aspectRatio: '1 / 1' }}
            onClick={handleCameraTap}
            onTouchStart={handleCameraTap}
          >
            <div id={SCANNER_ELEMENT_ID} className="h-full w-full" />

            {!isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                <div className="text-center">
                  <Camera className="mx-auto h-12 w-12 text-white" />
                  <p className="mt-2 text-sm text-white">Initializing camera...</p>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
