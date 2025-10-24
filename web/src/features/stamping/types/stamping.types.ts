/**
 * @fileoverview Stamping Feature Type Definitions (UI-specific only)
 */

import type { StampingEstimation } from '../services';
import type { ArtifactFingerprint } from '../utils';

// Privacy mode for stamping (UI-specific)
export type PrivacyMode = 'private' | 'public';

// Cached estimation for performance
export interface CachedEstimation {
  fingerprint: ArtifactFingerprint;
  estimation: StampingEstimation;
  timestamp: number;
}

// Augmented receipt with UI metadata
export interface AugmentedReceipt {
  receipt: unknown; // Receipt from SDK
  filename?: string;
  timestamp?: string;
  mode?: PrivacyMode;
}
