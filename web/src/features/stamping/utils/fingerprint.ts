/**
 * @fileoverview Artifact Fingerprinting Utilities
 *
 * Generates unique identifiers for files and text to enable caching
 */

import type { PrivacyMode } from '../types';

export interface ArtifactFingerprint {
  type: 'file' | 'text';
  key: string;
  mode: PrivacyMode;
  isPriority: boolean;
}

/**
 * Generate a unique fingerprint for a file
 */
export function getFileFingerprint(
  file: File,
  mode: PrivacyMode,
  isPriority: boolean,
): ArtifactFingerprint {
  return {
    type: 'file',
    key: `${file.name}-${file.size}-${file.lastModified}`,
    mode,
    isPriority,
  };
}

/**
 * Generate a unique fingerprint for text content
 */
export function getTextFingerprint(
  text: string,
  mode: PrivacyMode,
  isPriority: boolean,
): ArtifactFingerprint {
  return {
    type: 'text',
    key: `text-${text.length}-${text.slice(0, 50)}`, // Use first 50 chars + length as key
    mode,
    isPriority,
  };
}

/**
 * Generate cache key from fingerprint
 */
export function getCacheKey(fingerprint: ArtifactFingerprint): string {
  return `${fingerprint.type}-${fingerprint.key}-${fingerprint.mode}-${fingerprint.isPriority ? 'priority' : 'normal'}`;
}
