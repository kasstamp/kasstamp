/**
 * @fileoverview Receipt Preview Hook
 *
 * Handles loading and previewing files from receipts
 */

import { useState, useCallback, useEffect } from 'react';
import { pageLogger } from '@/core/utils/logger';
import { walletService } from '@/features/wallet/services';
import { useWallet } from '@/shared/hooks/useWallet';
import type { StampingReceipt } from '@kasstamp/sdk';
import { isImageFile, isTextFile } from '../utils/fileHelpers';

export function useReceiptPreview() {
  const [walletState] = useWallet();
  const [kasReceiptModalOpen, setKasReceiptModalOpen] = useState(false);
  const [kasReceiptObj, setKasReceiptObj] = useState<StampingReceipt | null>(null);
  const [kasDownloadPct, setKasDownloadPct] = useState(0);
  const [kasDownloadText, setKasDownloadText] = useState<string>('');
  const [kasDownloading, setKasDownloading] = useState(false);
  const [kasImagePreview, setKasImagePreview] = useState<string | null>(null);
  const [kasImageLoading, setKasImageLoading] = useState(false);
  const [kasTextPreview, setKasTextPreview] = useState<string | null>(null);
  const [kasTextLoading, setKasTextLoading] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<StampingReceipt | null>(null);
  const [isSDKLoading, setIsSDKLoading] = useState(false);

  const decryptReceipt = useCallback(
    async (encryptedReceipt: StampingReceipt): Promise<StampingReceipt> => {
      const sdk = walletService.getSDK();
      if (!sdk) {
        throw new Error('SDK not initialized. Please connect to network first.');
      }

      const wallet = walletService.getCurrentWallet();
      return await sdk.decryptReceipt(encryptedReceipt, wallet);
    },
    []
  );

  const loadImagePreview = useCallback(async (receiptObj: StampingReceipt) => {
    if (!receiptObj?.fileName || !isImageFile(receiptObj.fileName)) {
      setKasImagePreview(null);
      return;
    }

    pageLogger.info('🖼️ Loading image preview from receipt...');
    setKasImageLoading(true);
    setKasImagePreview(null);

    try {
      const sdk = walletService.getSDK();
      if (!sdk) {
        throw new Error('SDK not initialized');
      }

      const wallet = walletService.getCurrentWallet();

      // Check if wallet is available and unlocked for private receipts
      if (receiptObj.privacy === 'private') {
        if (!wallet) {
          throw new Error('Wallet required to load preview of private receipt');
        }
        if (wallet.signingEnclave.isLocked()) {
          throw new Error('Wallet is locked. Please unlock your wallet to load the preview.');
        }
        pageLogger.debug('Wallet status:', {
          locked: wallet.signingEnclave.isLocked(),
          hasEnclave: !!wallet.signingEnclave,
          enclaveLocked: wallet.signingEnclave?.isLocked(),
        });
      }

      const result = await sdk.reconstructFile(receiptObj, wallet, (progress) => {
        const percentage =
          progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        pageLogger.info(`📥 Image download progress: ${percentage}%`);
        setKasDownloadPct(percentage);
        setKasDownloadText(`Downloading image... ${percentage}%`);
      });

      if (result && result.data) {
        // Convert Uint8Array to BlobPart for Blob compatibility
        const blob = new Blob([result.data as BlobPart], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        setKasImagePreview(url);
        pageLogger.info('✅ Image preview loaded successfully');
      } else {
        pageLogger.warn('⚠️ Failed to load image preview');
        setKasImagePreview(null);
      }
    } catch (error) {
      pageLogger.error('❌ Error loading image preview:', error as Error);
      setKasImagePreview(null);
    } finally {
      setKasImageLoading(false);
      setKasDownloadPct(0);
      setKasDownloadText('');
    }
  }, []);

  const loadTextPreview = useCallback(async (receiptObj: StampingReceipt) => {
    if (!receiptObj?.fileName || !isTextFile(receiptObj.fileName)) {
      setKasTextPreview(null);
      return;
    }

    pageLogger.info('📄 Loading text preview from receipt...');
    setKasTextLoading(true);
    setKasTextPreview(null);

    try {
      const sdk = walletService.getSDK();
      if (!sdk) {
        throw new Error('SDK not initialized');
      }

      const wallet = walletService.getCurrentWallet();

      // Check if wallet is available and unlocked for private receipts
      if (receiptObj.privacy === 'private') {
        if (!wallet) {
          throw new Error('Wallet required to load preview of private receipt');
        }
        if (wallet.signingEnclave.isLocked()) {
          throw new Error('Wallet is locked. Please unlock your wallet to load the preview.');
        }
        pageLogger.debug('Wallet status:', {
          locked: wallet.signingEnclave.isLocked(),
          hasEnclave: !!wallet.signingEnclave,
          enclaveLocked: wallet.signingEnclave?.isLocked(),
        });
      }

      const result = await sdk.reconstructFile(receiptObj, wallet, (progress) => {
        const percentage =
          progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        pageLogger.info(`📥 Text download progress: ${percentage}%`);
        setKasDownloadPct(percentage);
        setKasDownloadText(`Downloading text... ${percentage}%`);
      });

      if (result && result.data) {
        const text = new TextDecoder().decode(result.data);
        const preview = text.length > 1000 ? text.slice(0, 1000) + '...' : text;
        setKasTextPreview(preview);
        pageLogger.info('✅ Text preview loaded successfully');
      } else {
        pageLogger.warn('⚠️ Failed to load text preview');
        setKasTextPreview(null);
      }
    } catch (error) {
      pageLogger.error('❌ Error loading text preview:', error as Error);
      setKasTextPreview(null);
    } finally {
      setKasTextLoading(false);
      setKasDownloadPct(0);
      setKasDownloadText('');
    }
  }, []);

  // Process pending receipt when SDK becomes available
  useEffect(() => {
    if (pendingReceipt && walletState.isConnected) {
      pageLogger.info('🔄 SDK ready, processing pending receipt...');
      setIsSDKLoading(false);
      void loadImagePreview(pendingReceipt);
      void loadTextPreview(pendingReceipt);
      setPendingReceipt(null);
    } else if (pendingReceipt && !walletState.isConnected) {
      setIsSDKLoading(true);
    }
  }, [walletState.isConnected, pendingReceipt, loadImagePreview, loadTextPreview]);

  const openReceipt = useCallback(
    (receipt: StampingReceipt) => {
      setKasReceiptObj(receipt);
      setKasDownloadPct(0);
      setKasDownloadText('');
      setKasDownloading(false);
      setKasImagePreview(null);
      setKasImageLoading(false);
      setKasTextPreview(null);
      setKasTextLoading(false);
      setKasReceiptModalOpen(true);

      // If SDK is ready, load previews immediately
      if (walletState.isConnected) {
        pageLogger.info('🔄 SDK ready, loading previews immediately...');
        setIsSDKLoading(false);
        void loadImagePreview(receipt);
        void loadTextPreview(receipt);
      } else {
        // SDK not ready, store as pending
        pageLogger.info('⏳ SDK not ready, storing receipt as pending...');
        setIsSDKLoading(true);
        setPendingReceipt(receipt);
      }
    },
    [loadImagePreview, loadTextPreview, walletState.isConnected]
  );

  const closeReceipt = useCallback(() => {
    setKasReceiptModalOpen(false);
    setKasReceiptObj(null);
    setPendingReceipt(null); // Clear any pending receipt
    setIsSDKLoading(false); // Reset SDK loading state
    if (kasImagePreview) {
      URL.revokeObjectURL(kasImagePreview);
    }
    setKasImagePreview(null);
    setKasTextPreview(null);
  }, [kasImagePreview]);

  return {
    kasReceiptModalOpen,
    kasReceiptObj,
    kasDownloadPct,
    kasDownloadText,
    kasDownloading,
    kasImagePreview,
    kasImageLoading,
    kasTextPreview,
    kasTextLoading,
    isSDKLoading,
    decryptReceipt,
    openReceipt,
    closeReceipt,
    setKasDownloading,
    setKasDownloadPct,
    setKasDownloadText,
    setKasImagePreview,
  };
}
