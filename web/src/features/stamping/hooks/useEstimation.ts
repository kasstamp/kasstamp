/**
 * @fileoverview Estimation Hook with Per-Artifact Caching
 *
 * Handles cost estimation for stamping with intelligent caching
 */

import { useState, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { pageLogger } from '@/core/utils/logger';
import { APP_CONFIG } from '@/features/wallet/constants';
import type { StampingEstimation } from '../services';
import { estimateMultipleArtifacts, clearEstimation } from '../services';
import type { CachedEstimation, PrivacyMode } from '../types';
import { getFileFingerprint, getTextFingerprint, getCacheKey } from '../utils';

interface UseEstimationOptions {
  mode: PrivacyMode;
  isPriority: boolean;
  isConnected: boolean;
  hasWallet: boolean;
}

export function useEstimation({ mode, isPriority, isConnected, hasWallet }: UseEstimationOptions) {
  const [estimation, setEstimation] = useState<StampingEstimation | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const isEstimatingRef = useRef(false);
  const [, setEstimationCache] = useState<Map<string, CachedEstimation>>(new Map());

  const updateEstimate = useCallback(
    async (attachments: File[], text: string) => {
      const selectedBytes =
        attachments.reduce((sum, f) => sum + f.size, 0) + (text ? new Blob([text]).size : 0);

      pageLogger.info('🚀 updateEstimate called', { selectedBytes });

      if (selectedBytes === 0) {
        setEstimation(null);
        clearEstimation();
        setEstimationCache(() => new Map());
        return;
      }

      // Prevent concurrent estimation calls
      if (isEstimatingRef.current) {
        pageLogger.info('⏳ Estimation already in progress, skipping...');
        return;
      }

      pageLogger.info('🔄 Setting isEstimating to true');
      flushSync(() => {
        isEstimatingRef.current = true;
        setIsEstimating(true);
      });

      try {
        // Build current artifact fingerprints
        const currentFingerprints = [
          ...attachments.map((file) => getFileFingerprint(file, mode, isPriority)),
          ...(text.trim() ? [getTextFingerprint(text.trim(), mode, isPriority)] : []),
        ];

        // Check cache for existing estimations (access via state updater to get latest)
        const cachedEstimations: StampingEstimation[] = [];
        const artifactsToCalculate: { files: File[]; text: string } = { files: [], text: '' };
        let currentCache: Map<string, CachedEstimation> = new Map();

        setEstimationCache((prev) => {
          currentCache = prev;
          return prev;
        });

        currentFingerprints.forEach((fingerprint) => {
          const cacheKey = getCacheKey(fingerprint);
          const cached = currentCache.get(cacheKey);

          if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            // 5 minute cache
            pageLogger.info(
              `📋 Using cached estimation for ${fingerprint.type}: ${fingerprint.key}`,
            );
            cachedEstimations.push(cached.estimation);
          } else {
            // Need to calculate this artifact
            if (fingerprint.type === 'file') {
              const file = attachments.find((f) => {
                const fileFingerprint = getFileFingerprint(f, mode, isPriority);
                return fileFingerprint.key === fingerprint.key;
              });
              if (file) {
                pageLogger.info(`🔍 Will calculate estimation for new/changed file: ${file.name}`);
                artifactsToCalculate.files.push(file);
              }
            } else if (fingerprint.type === 'text') {
              pageLogger.info(`🔍 Will calculate estimation for new/changed text`);
              artifactsToCalculate.text = text.trim();
            }
          }
        });

        const newEstimations: StampingEstimation[] = [];

        // Calculate estimations for new/changed artifacts only
        if (artifactsToCalculate.files.length > 0 || artifactsToCalculate.text) {
          if (isConnected && hasWallet) {
            pageLogger.info(
              `🔍 Calculating costs for ${artifactsToCalculate.files.length} new files + ${artifactsToCalculate.text ? '1 new text' : '0 new text'}...`,
            );

            const newCache = new Map(currentCache);
            const priorityFee = isPriority ? APP_CONFIG.priorityFeeSompi : 0n;

            // Calculate each file individually for better caching
            for (const file of artifactsToCalculate.files) {
              try {
                const fileEstimation = await estimateMultipleArtifacts([file], '', {
                  mode,
                  compression: false,
                  priorityFee,
                });
                if (fileEstimation) {
                  newEstimations.push(fileEstimation);
                  const fingerprint = getFileFingerprint(file, mode, isPriority);
                  const cacheKey = getCacheKey(fingerprint);
                  newCache.set(cacheKey, {
                    fingerprint,
                    estimation: fileEstimation,
                    timestamp: Date.now(),
                  });
                  pageLogger.info(`💾 Cached estimation for file: ${file.name}`);
                }
              } catch (error) {
                pageLogger.warn(`Failed to estimate file ${file.name}:`, error as Error);
                // Skip this file - don't use fallback estimation
                continue;
              }
            }

            // Calculate text individually if present
            if (artifactsToCalculate.text) {
              try {
                const textEstimation = await estimateMultipleArtifacts(
                  [],
                  artifactsToCalculate.text,
                  { mode, compression: false, priorityFee },
                );
                if (textEstimation) {
                  newEstimations.push(textEstimation);
                  const fingerprint = getTextFingerprint(
                    artifactsToCalculate.text,
                    mode,
                    isPriority,
                  );
                  const cacheKey = getCacheKey(fingerprint);
                  newCache.set(cacheKey, {
                    fingerprint,
                    estimation: textEstimation,
                    timestamp: Date.now(),
                  });
                  pageLogger.info(`💾 Cached estimation for text`);
                }
              } catch (error) {
                pageLogger.warn(`Failed to estimate text:`, error as Error);
                // Skip text - don't use fallback estimation
              }
            }

            // Update cache
            setEstimationCache(newCache);
          } else {
            // Wallet not connected - SDK will handle fallback internally
            pageLogger.info('⚠️ Wallet not connected, SDK will use fallback estimation');
            const priorityFee = isPriority ? APP_CONFIG.priorityFeeSompi : 0n;

            for (const file of artifactsToCalculate.files) {
              try {
                const fileEstimation = await estimateMultipleArtifacts([file], '', {
                  mode,
                  compression: false,
                  priorityFee,
                });
                if (fileEstimation) {
                  newEstimations.push(fileEstimation);
                }
              } catch (error) {
                pageLogger.warn(`Failed to estimate file ${file.name}:`, error as Error);
                // Skip this file
              }
            }
            if (artifactsToCalculate.text) {
              try {
                const textEstimation = await estimateMultipleArtifacts(
                  [],
                  artifactsToCalculate.text,
                  { mode, compression: false, priorityFee },
                );
                if (textEstimation) {
                  newEstimations.push(textEstimation);
                }
              } catch (error) {
                pageLogger.warn(`Failed to estimate text:`, error as Error);
                // Skip text
              }
            }
          }
        }

        // Combine cached and new estimations
        const allEstimations = [...cachedEstimations, ...newEstimations];

        if (allEstimations.length > 0) {
          // Aggregate estimations
          const totalEstimation: StampingEstimation = allEstimations.reduce((acc, est) => ({
            originalSize: acc.originalSize + est.originalSize,
            processedSize: acc.processedSize + est.processedSize,
            chunkCount: acc.chunkCount + est.chunkCount,
            estimatedTransactions: acc.estimatedTransactions + est.estimatedTransactions,
            estimatedFeesKAS: acc.estimatedFeesKAS + est.estimatedFeesKAS,
            storageAmountKAS: acc.storageAmountKAS + est.storageAmountKAS,
            totalCostKAS: acc.totalCostKAS + est.totalCostKAS,
          }));

          setEstimation(totalEstimation);
          pageLogger.info('✅ Total estimation calculated', { totalEstimation });
        }
      } catch (error) {
        pageLogger.error('❌ Estimation failed:', error as Error);
        // Keep previous estimation - don't use fallback
      } finally {
        pageLogger.info('🏁 Setting isEstimating to false');
        isEstimatingRef.current = false;
        setIsEstimating(false);
      }
    },
    [mode, isPriority, isConnected, hasWallet],
  );

  const clearEstimationState = useCallback(() => {
    setEstimation(null);
    clearEstimation();
  }, []);

  return {
    estimation,
    isEstimating,
    updateEstimate,
    clearEstimation: clearEstimationState,
  };
}
