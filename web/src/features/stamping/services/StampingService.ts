/**
 * @fileoverview Real SDK-based stamping service for the web interface
 *
 * Integrates the stamping logic from the dashboard example using the actual SDK
 */

import { walletService } from '@/features/wallet/services';
import type { ProcessingResult, StampingReceipt } from '@kasstamp/sdk';
import { stampingLogger } from '@/core/utils/logger';

export type StampingModeWeb = 'public' | 'private';

export interface StampingEstimation {
  originalSize: number;
  processedSize: number;
  chunkCount: number;
  estimatedTransactions: number;
  estimatedFeesKAS: number;
  storageAmountKAS: number;
  totalCostKAS: number;
  processingResult?: ProcessingResult;
}

export interface StampingOptions {
  mode: StampingModeWeb;
  compression?: boolean;
  mnemonic?: string;
  priorityFee: bigint; // Priority fee in sompi (calculated from isPriority toggle)
}

let currentEstimation: StampingEstimation | null = null;
let currentProcessingResult: ProcessingResult | null = null;

// Store individual processing results for each artifact during estimation
const artifactProcessingResults: Map<string, ProcessingResult> = new Map();

/**
 * Get accurate fee estimation for multiple artifacts (files + text) using the SDK
 */
export async function estimateMultipleArtifacts(
  files: File[],
  text: string,
  options: StampingOptions
): Promise<StampingEstimation | null> {
  try {
    const sdk = walletService.getSDK();
    const wallet = walletService.getCurrentWallet();

    if (!sdk) {
      stampingLogger.warn('SDK not available for estimation');
      return null;
    }

    stampingLogger.info(
      `🔍 Running SDK estimation for ${files.length} files + ${text ? '1 text' : '0 text'}...`
    );

    const estimations: StampingEstimation[] = [];
    const processingResults: ProcessingResult[] = [];

    // Clear previous artifact results
    artifactProcessingResults.clear();

    // Estimate each file separately using the new SDK method
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        stampingLogger.info(`📄 Estimating file ${i + 1}/${files.length}: ${file.name}`);

        // Use the new SDK method with fallback-aware estimation
        const sdkEstimation = await sdk.estimateStampingWithFallback(
          file,
          {
            mode: options.mode === 'public' ? 'public' : 'private',
            compression: options.compression || false,
            priorityFee: options.priorityFee,
          },
          wallet || undefined
        );

        // Convert SDK estimation to web format
        const fileEstimation: StampingEstimation = {
          originalSize: sdkEstimation.originalSize,
          processedSize: sdkEstimation.processedSize,
          chunkCount: sdkEstimation.chunkCount,
          estimatedTransactions: sdkEstimation.estimatedTransactions,
          estimatedFeesKAS: sdkEstimation.estimatedFeesKAS,
          storageAmountKAS: sdkEstimation.storageAmountKAS,
          totalCostKAS: sdkEstimation.totalCostKAS,
          processingResult: sdkEstimation.processingResult,
        };

        estimations.push(fileEstimation);
        processingResults.push(sdkEstimation.processingResult);
        artifactProcessingResults.set(file.name, sdkEstimation.processingResult);

        stampingLogger.info(
          `✅ File estimation complete (${sdkEstimation.feeCalculationMethod}):`,
          {
            totalCost: `${fileEstimation.totalCostKAS.toFixed(8)} KAS`,
            chunks: fileEstimation.chunkCount,
            method: sdkEstimation.feeCalculationMethod,
          }
        );
      } catch (error) {
        stampingLogger.warn(`Failed to estimate file ${file.name}:`, error as Error);
        // Skip this file - don't use fallback estimation
        continue;
      }
    }

    // Estimate text if provided
    if (text.trim()) {
      try {
        stampingLogger.info(`📝 Estimating text content...`);

        // Convert text to file for SDK estimation
        const textBlob = new Blob([text], { type: 'text/plain' });
        const tempFile = new File([textBlob], 'text-content.txt', { type: 'text/plain' });

        const sdkEstimation = await sdk.estimateStampingWithFallback(
          tempFile,
          {
            mode: options.mode === 'public' ? 'public' : 'private',
            compression: options.compression || false,
            priorityFee: options.priorityFee,
          },
          wallet || undefined
        );

        const textEstimation: StampingEstimation = {
          originalSize: sdkEstimation.originalSize,
          processedSize: sdkEstimation.processedSize,
          chunkCount: sdkEstimation.chunkCount,
          estimatedTransactions: sdkEstimation.estimatedTransactions,
          estimatedFeesKAS: sdkEstimation.estimatedFeesKAS,
          storageAmountKAS: sdkEstimation.storageAmountKAS,
          totalCostKAS: sdkEstimation.totalCostKAS,
          processingResult: sdkEstimation.processingResult,
        };

        estimations.push(textEstimation);
        processingResults.push(sdkEstimation.processingResult);
        artifactProcessingResults.set('text-content', sdkEstimation.processingResult);

        stampingLogger.info(
          `✅ Text estimation complete (${sdkEstimation.feeCalculationMethod}):`,
          {
            totalCost: `${textEstimation.totalCostKAS.toFixed(8)} KAS`,
            chunks: textEstimation.chunkCount,
            method: sdkEstimation.feeCalculationMethod,
          }
        );
      } catch (error) {
        stampingLogger.warn('Failed to estimate text:', error as Error);
        // Skip text - don't use fallback estimation
      }
    }

    if (estimations.length === 0) {
      return null;
    }

    // Sum up all estimations
    const totalEstimation: StampingEstimation = {
      originalSize: estimations.reduce((sum, est) => sum + est.originalSize, 0),
      processedSize: estimations.reduce((sum, est) => sum + est.processedSize, 0),
      chunkCount: estimations.reduce((sum, est) => sum + est.chunkCount, 0),
      estimatedTransactions: estimations.reduce((sum, est) => sum + est.estimatedTransactions, 0),
      estimatedFeesKAS: estimations.reduce((sum, est) => sum + est.estimatedFeesKAS, 0),
      storageAmountKAS: estimations.reduce((sum, est) => sum + est.storageAmountKAS, 0),
      totalCostKAS: estimations.reduce((sum, est) => sum + est.totalCostKAS, 0),
    };

    // Store all processing results for later stamping
    currentEstimation = totalEstimation;

    stampingLogger.info('✅ Multi-Artifact SDK Estimation Complete:', {
      artifacts: estimations.length,
      totalOriginalSize: `${(totalEstimation.originalSize / 1024).toFixed(2)} KB`,
      totalProcessedSize: `${(totalEstimation.processedSize / 1024).toFixed(2)} KB`,
      totalChunks: totalEstimation.chunkCount,
      totalTransactions: totalEstimation.estimatedTransactions,
      totalNetworkFees: `${totalEstimation.estimatedFeesKAS.toFixed(8)} KAS`,
      totalStorageAmount: `${totalEstimation.storageAmountKAS.toFixed(2)} KAS`,
      totalCost: `${totalEstimation.totalCostKAS.toFixed(6)} KAS`,
    });

    return totalEstimation;
  } catch (error) {
    stampingLogger.error('❌ Multi-artifact estimation failed:', error as Error);
    return null;
  }
}

/**
 * Get accurate fee estimation for a file using the SDK
 */
export async function estimateFileStamping(
  file: File,
  options: StampingOptions
): Promise<StampingEstimation | null> {
  try {
    const sdk = walletService.getSDK();
    const wallet = walletService.getCurrentWallet();

    if (!sdk) {
      stampingLogger.warn('SDK not available for estimation');
      return null;
    }

    stampingLogger.info(`🔍 Running SDK estimation for ${file.name}...`);

    // Use the new SDK method with fallback-aware estimation
    const sdkEstimation = await sdk.estimateStampingWithFallback(
      file,
      {
        mode: options.mode === 'public' ? 'public' : 'private',
        compression: options.compression || false,
        priorityFee: options.priorityFee,
      },
      wallet || undefined
    );

    // Convert SDK estimation to web format
    const estimation: StampingEstimation = {
      originalSize: sdkEstimation.originalSize,
      processedSize: sdkEstimation.processedSize,
      chunkCount: sdkEstimation.chunkCount,
      estimatedTransactions: sdkEstimation.estimatedTransactions,
      estimatedFeesKAS: sdkEstimation.estimatedFeesKAS,
      storageAmountKAS: sdkEstimation.storageAmountKAS,
      totalCostKAS: sdkEstimation.totalCostKAS,
      processingResult: sdkEstimation.processingResult,
    };

    // Store the results for later stamping
    currentEstimation = estimation;
    currentProcessingResult = estimation.processingResult || null;

    stampingLogger.info('✅ SDK Estimation Complete:', {
      originalSize: `${(estimation.originalSize / 1024).toFixed(2)} KB`,
      processedSize: `${(estimation.processedSize / 1024).toFixed(2)} KB`,
      chunks: estimation.chunkCount,
      transactions: estimation.estimatedTransactions,
      networkFees: `${estimation.estimatedFeesKAS.toFixed(8)} KAS`,
      storageAmount: `${estimation.storageAmountKAS.toFixed(2)} KAS`,
      totalCost: `${estimation.totalCostKAS.toFixed(6)} KAS`,
      method: sdkEstimation.feeCalculationMethod,
    });

    return estimation;
  } catch (error) {
    stampingLogger.error('❌ File estimation failed:', error as Error);
    return null;
  }
}

/**
 * Get accurate fee estimation for text content using the SDK
 * Simplified approach - convert text to file and use file estimation
 */
export async function estimateTextStamping(
  text: string,
  options: StampingOptions
): Promise<StampingEstimation | null> {
  stampingLogger.info(
    `🔍 Fast text estimation for ${text.length} characters in ${options.mode} mode...`
  );

  try {
    // Convert text to file and use the SDK estimation
    const textBlob = new Blob([text], { type: 'text/plain' });
    const tempFile = new File([textBlob], 'text-content.txt', { type: 'text/plain' });

    stampingLogger.info('📄 Converting text to file for SDK estimation...');

    // Use the file estimation which uses the new SDK method
    const fileEstimation = await estimateFileStamping(tempFile, options);

    if (fileEstimation) {
      stampingLogger.info('✅ Fast text estimation complete:', {
        totalCost: `${fileEstimation.totalCostKAS.toFixed(6)} KAS`,
        chunks: fileEstimation.chunkCount,
      });
      return fileEstimation;
    } else {
      stampingLogger.warn('⚠️ File estimation returned null');
      return null;
    }
  } catch (error) {
    stampingLogger.error('❌ Text estimation failed:', error as Error);
    return null;
  }
}

/**
 * Perform actual stamping using the SDK (uses stampMultipleArtifacts with single file)
 */
export async function stampFile(
  file: File,
  options: StampingOptions,
  walletSecret: string
): Promise<{ transactionId: string; transactionIds: string[]; receipt: StampingReceipt }> {
  try {
    const sdk = walletService.getSDK();
    const wallet = walletService.getCurrentWallet();

    if (!sdk || !wallet) {
      throw new Error('SDK or wallet not available for stamping');
    }

    if (!currentEstimation || !currentProcessingResult) {
      throw new Error('No estimation available. Please run estimation first.');
    }

    stampingLogger.info(`💸 Starting stamping for ${file.name}...`);

    // Unlock wallet for signing
    if (wallet.locked) {
      try {
        await wallet.unlockFromPassword(walletSecret);
        if (wallet.locked) {
          throw new Error('Failed to unlock wallet');
        }
      } catch (error) {
        throw new Error(
          `Failed to unlock wallet: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Use stampMultipleArtifacts with a single file
    const results = await sdk.stampMultipleArtifacts([{ type: 'file', file }], wallet, {
      mode: options.mode === 'private' ? 'private' : 'public',
      compression: options.compression || false,
      walletSecret: walletSecret || '',
      mnemonic: options.mnemonic || '',
      priorityFee: options.priorityFee,
    });

    stampingLogger.info(
      `✅ Stamping completed! Transaction IDs: ${results[0].transactionIds.join(', ')}`
    );

    // Use SDK receipt directly - it already has the correct format!
    const receipt = results[0].receipt as StampingReceipt;

    return {
      transactionId: results[0].transactionIds[0],
      transactionIds: results[0].transactionIds,
      receipt,
    };
  } catch (error) {
    stampingLogger.error('❌ Stamping failed:', error as Error);
    throw error;
  }
}

/**
 * Perform text stamping using the SDK (uses stampMultipleArtifacts with single text)
 */
export async function stampText(
  text: string,
  options: StampingOptions,
  walletSecret: string
): Promise<{ transactionId: string; transactionIds: string[]; receipt: StampingReceipt }> {
  try {
    const sdk = walletService.getSDK();
    const wallet = walletService.getCurrentWallet();

    if (!sdk || !wallet) {
      throw new Error('SDK or wallet not available for stamping');
    }

    if (!currentProcessingResult) {
      throw new Error('No processing result available. Please run estimation first.');
    }

    stampingLogger.info(`💸 Starting text stamping...`);

    // Unlock wallet for signing
    if (wallet.locked) {
      try {
        await wallet.unlockFromPassword(walletSecret);
        if (wallet.locked) {
          throw new Error('Failed to unlock wallet');
        }
      } catch (error) {
        throw new Error(
          `Failed to unlock wallet: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Use stampMultipleArtifacts with a single text artifact
    const results = await sdk.stampMultipleArtifacts(
      [{ type: 'text', text, filename: 'text-content.txt' }],
      wallet,
      {
        mode: options.mode === 'private' ? 'private' : 'public',
        compression: options.compression || false,
        walletSecret: walletSecret || '',
        mnemonic: options.mnemonic || '',
        priorityFee: options.priorityFee,
      }
    );

    stampingLogger.info(
      `✅ Text stamping completed! Transaction IDs: ${results[0].transactionIds.join(', ')}`
    );

    // Use SDK receipt directly - it already has the correct format!
    const receipt = results[0].receipt as StampingReceipt;

    return {
      transactionId: results[0].transactionIds[0],
      transactionIds: results[0].transactionIds,
      receipt,
    };
  } catch (error) {
    stampingLogger.error('❌ Text stamping failed:', error as Error);
    throw error;
  }
}

/**
 * Perform stamping for multiple artifacts (files + text) using the SDK's new batched method
 * This uses a single UTXO transaction chain to avoid UTXO conflicts
 */
export async function stampMultipleArtifacts(
  files: File[],
  text: string,
  options: StampingOptions,
  walletSecret?: string,
  mnemonic?: string
): Promise<{ receipts: StampingReceipt[]; totalTransactionIds: string[] }> {
  try {
    const sdk = walletService.getSDK();
    const wallet = walletService.getCurrentWallet();

    if (!sdk || !wallet) {
      throw new Error('SDK or wallet not available for stamping');
    }

    stampingLogger.info(
      `💸 Starting batched stamping: ${files.length} files + ${text ? '1 text' : '0 text'}...`
    );

    // Check if signing enclave is unlocked
    const enclaveStatus = wallet.signingEnclave.getStatus();
    stampingLogger.info('🔐 Enclave status:', enclaveStatus);

    // Unlock wallet for signing (if locked)
    if (wallet.locked) {
      if (!walletSecret) {
        throw new Error('Wallet is locked and no password provided');
      }
      try {
        await wallet.unlockFromPassword(walletSecret);
        if (wallet.locked) {
          throw new Error('Failed to unlock wallet');
        }
      } catch (error) {
        throw new Error(
          `Failed to unlock wallet: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Build artifacts array for batched stamping
    const artifacts: Array<{
      type: 'file' | 'text';
      file?: File;
      text?: string;
      filename?: string;
    }> = [];

    // Add files
    files.forEach((file) => {
      artifacts.push({
        type: 'file',
        file,
      });
    });

    // Add text if provided
    if (text.trim()) {
      artifacts.push({
        type: 'text',
        text: text.trim(),
        filename: 'text-input.txt',
      });
    }

    if (artifacts.length === 0) {
      throw new Error('No artifacts to stamp');
    }

    stampingLogger.info(`📦 Batching ${artifacts.length} artifacts:`);
    artifacts.forEach((artifact, i) => {
      if (artifact.type === 'file' && artifact.file) {
        stampingLogger.info(
          `  ${i + 1}. File: ${artifact.file.name} (${(artifact.file.size / 1024).toFixed(2)} KB)`
        );
      } else if (artifact.type === 'text' && artifact.text) {
        stampingLogger.info(
          `  ${i + 1}. Text: ${artifact.filename} (${artifact.text.length} chars)`
        );
      }
    });

    // Use the new batched stamping method
    // If enclave is unlocked, we don't need to pass mnemonic (it's stored in enclave)
    // But SDK still requires walletSecret for accountsSend fallback, so use empty string
    const results = await sdk.stampMultipleArtifacts(artifacts, wallet, {
      mode: options.mode === 'private' ? 'private' : 'public',
      compression: options.compression || false,
      walletSecret: walletSecret || '', // Empty string if enclave is unlocked
      mnemonic: mnemonic || options.mnemonic || '', // Empty string if enclave has it
      priorityFee: options.priorityFee,
    });

    stampingLogger.info(`✅ Batched stamping complete: ${results.length} receipts generated`);

    // Use SDK receipts directly - they already have the correct format!
    const receipts: StampingReceipt[] = results.map((result) => result.receipt as StampingReceipt);
    const allTransactionIds = results.flatMap((result) => result.transactionIds);

    stampingLogger.info(
      `📋 Total receipts: ${receipts.length}, Total transactions: ${allTransactionIds.length}`
    );

    return {
      receipts,
      totalTransactionIds: allTransactionIds,
    };
  } catch (error) {
    stampingLogger.error('❌ Batched stamping failed:', error as Error);
    throw error;
  }
}

/**
 * Get current cached estimation
 */
export function getCurrentEstimation(): StampingEstimation | null {
  return currentEstimation;
}

/**
 * Clear cached estimation (call when starting new estimation)
 */
export function clearEstimation(): void {
  currentEstimation = null;
  currentProcessingResult = null;
  artifactProcessingResults.clear();
}
