/**
 * @fileoverview Formatting Utilities for Stamping
 */

/**
 * Format ISO timestamp for use in filenames
 * @example "2024-03-15T14:30:45.123Z" → "2024-03-15_14-30-45"
 */
export function formatTimestampForFilename(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
