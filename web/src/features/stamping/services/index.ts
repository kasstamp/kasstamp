/**
 * @fileoverview Stamping Services Exports
 */

export {
  estimateMultipleArtifacts,
  estimateFileStamping,
  estimateTextStamping,
  stampFile,
  stampText,
  stampMultipleArtifacts,
  getCurrentEstimation,
  clearEstimation,
  type StampingModeWeb,
  type StampingEstimation,
  type StampingOptions,
} from './StampingService';

export { QRCodeService } from './QRCodeService';
export { ReceiptCompressionService } from './ReceiptCompressionService';
export { ErrorHandlingService } from './ErrorHandlingService';
