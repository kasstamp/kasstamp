/**
 * @fileoverview File Type Helper Functions
 */

/**
 * Check if filename is an image file
 */
export function isImageFile(filename: string): boolean {
  if (!filename) return false;
  const ext = filename.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
}

/**
 * Check if filename is a text file
 */
export function isTextFile(filename: string): boolean {
  if (!filename) return false;
  const ext = filename.toLowerCase().split('.').pop();
  return [
    'txt',
    'md',
    'json',
    'csv',
    'log',
    'yaml',
    'yml',
    'xml',
    'html',
    'css',
    'js',
    'ts',
    'jsx',
    'tsx',
  ].includes(ext || '');
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  if (!filename) return '';
  return filename.split('.').pop()?.toUpperCase() || '';
}
