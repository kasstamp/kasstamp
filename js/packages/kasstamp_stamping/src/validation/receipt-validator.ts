/**
 * Receipt Validation Module
 *
 * Validates receipt structure and content before processing to prevent:
 * - Malformed receipts
 * - Injection attacks (XSS, path traversal)
 * - Invalid data ranges
 * - Suspicious patterns
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Dangerous file extensions that should trigger warnings
 */
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif', // Windows executables
  '.app',
  '.dmg',
  '.pkg', // macOS executables
  '.sh',
  '.bash',
  '.zsh', // Shell scripts
  '.ps1',
  '.psm1', // PowerShell
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh', // Scripts
  '.msi',
  '.msp', // Installers
  '.jar', // Java
  '.apk', // Android
  '.deb',
  '.rpm', // Linux packages
];

/**
 * Suspicious patterns in strings that might indicate injection attacks
 */
const SUSPICIOUS_PATTERNS = [
  /<script[^>]*>/i, // Script tags
  /javascript:/i, // JavaScript protocol
  /on\w+\s*=/i, // Event handlers
  /data:text\/html/i, // Data URI HTML
  /vbscript:/i, // VBScript protocol
  /<iframe[^>]*>/i, // IFrame tags
  /<object[^>]*>/i, // Object tags
  /<embed[^>]*>/i, // Embed tags
  /\.\.[\\/]/, // Path traversal
  /[<>'"]/, // HTML special chars (basic check)
];

/**
 * Maximum reasonable values for receipt fields
 */
const MAX_VALUES = {
  FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB
  CHUNK_COUNT: 100000, // 100k chunks
  TRANSACTION_IDS: 100000, // 100k transactions
  FILENAME_LENGTH: 255, // Standard max filename
  COST_KAS: 1000000, // 1M KAS (sanity check)
  STRING_FIELD_LENGTH: 10000, // Max length for string fields
};

/**
 * Validate a string field for suspicious patterns
 */
function validateStringField(
  value: unknown,
  fieldName: string,
  maxLength: number = MAX_VALUES.STRING_FIELD_LENGTH
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type check
  if (typeof value !== 'string') {
    errors.push(`${fieldName} must be a string`);
    return { valid: false, errors, warnings };
  }

  // Length check
  if (value.length > maxLength) {
    errors.push(`${fieldName} exceeds maximum length (${maxLength})`);
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(value)) {
      warnings.push(`${fieldName} contains suspicious pattern: ${pattern.source}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate filename for dangerous extensions and suspicious patterns
 */
function validateFilename(filename: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for dangerous extensions
  const ext = filename.toLowerCase().split('.').pop();
  if (ext && DANGEROUS_EXTENSIONS.some((dangerous) => dangerous === `.${ext}`)) {
    warnings.push(
      `Filename has potentially dangerous extension: .${ext}. ` +
        `Only download if you trust the source!`
    );
  }

  // Check for null bytes (path traversal)
  if (filename.includes('\0')) {
    errors.push('Filename contains null bytes');
  }

  // Check for path separators (should be just a filename)
  if (filename.includes('/') || filename.includes('\\')) {
    warnings.push('Filename contains path separators (should be just a filename)');
  }

  return { errors, warnings };
}

/**
 * Validate transaction ID format
 */
function validateTransactionId(txId: string): boolean {
  // Kaspa transaction IDs are 64-character hex strings
  return /^[a-f0-9]{64}$/i.test(txId);
}

/**
 * Validate encrypted field (base64 string)
 */
function validateEncryptedField(value: unknown, fieldName: string): string[] {
  const errors: string[] = [];

  if (typeof value !== 'string') {
    errors.push(`${fieldName} must be a string`);
    return errors;
  }

  // Check if it's valid base64
  try {
    atob(value);
  } catch {
    errors.push(`${fieldName} is not valid base64`);
  }

  // Sanity check length (encrypted data shouldn't be crazy large)
  if (value.length > MAX_VALUES.STRING_FIELD_LENGTH) {
    errors.push(`${fieldName} is suspiciously large`);
  }

  return errors;
}

/**
 * Validate a complete receipt structure and content
 */
export function validateReceipt(receipt: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Type guard: must be an object
  if (!receipt || typeof receipt !== 'object') {
    return {
      valid: false,
      errors: ['Receipt must be a non-null object'],
      warnings: [],
    };
  }

  const r = receipt as Record<string, unknown>;

  // Validate id (transaction ID)
  if (typeof r.id !== 'string') {
    errors.push('Receipt id must be a string');
  } else if (!validateTransactionId(r.id)) {
    errors.push('Receipt id is not a valid transaction ID format');
  }

  // Validate timestamp (format only, no range checks)
  if (typeof r.timestamp !== 'string') {
    errors.push('Receipt timestamp must be a string');
  } else {
    const date = new Date(r.timestamp);
    if (isNaN(date.getTime())) {
      errors.push('Receipt timestamp is not a valid ISO 8601 date');
    }
  }

  // Validate fileName
  const filenameValidation = validateStringField(
    r.fileName,
    'fileName',
    MAX_VALUES.FILENAME_LENGTH
  );
  errors.push(...filenameValidation.errors);
  warnings.push(...filenameValidation.warnings);

  if (typeof r.fileName === 'string') {
    const nameValidation = validateFilename(r.fileName);
    errors.push(...nameValidation.errors);
    warnings.push(...nameValidation.warnings);
  }

  // Validate fileSize
  if (typeof r.fileSize !== 'number') {
    errors.push('Receipt fileSize must be a number');
  } else {
    if (r.fileSize < 0) {
      errors.push('Receipt fileSize cannot be negative');
    }
    if (r.fileSize > MAX_VALUES.FILE_SIZE) {
      warnings.push(`Receipt fileSize is very large (${r.fileSize} bytes)`);
    }
  }

  // Validate hash
  const hashValidation = validateStringField(r.hash, 'hash', 128);
  errors.push(...hashValidation.errors);
  warnings.push(...hashValidation.warnings);

  if (r.encryptedMetadata !== undefined) {
    if (typeof r.encryptedMetadata !== 'string') {
      errors.push('Receipt encryptedMetadata must be a string');
    } else {
      errors.push(...validateEncryptedField(r.encryptedMetadata, 'encryptedMetadata'));
    }
  }

  // Validate privacy mode
  if (typeof r.privacy !== 'string') {
    errors.push('Receipt privacy must be a string');
  } else if (r.privacy !== 'public' && r.privacy !== 'private') {
    errors.push('Receipt privacy must be "public" or "private"');
  }

  // Validate encrypted flag
  if (typeof r.encrypted !== 'boolean') {
    errors.push('Receipt encrypted must be a boolean');
  }

  // Validate compressed flag
  if (typeof r.compressed !== 'boolean') {
    errors.push('Receipt compressed must be a boolean');
  }

  // Validate groupId (optional, but required for private receipts)
  if (r.groupId !== undefined) {
    if (typeof r.groupId !== 'string') {
      errors.push('Receipt groupId must be a string');
    } else if (!/^[a-f0-9-]{36}$/i.test(r.groupId)) {
      warnings.push('Receipt groupId is not a valid UUID format');
    }
  } else if (r.privacy === 'private') {
    errors.push('Receipt groupId is required for private mode');
  }

  // Validate transactionIds (can be array or encrypted string)
  if (Array.isArray(r.transactionIds)) {
    // Public mode: array of transaction IDs
    if (r.transactionIds.length === 0) {
      errors.push('Receipt transactionIds array is empty');
    }
    if (r.transactionIds.length > MAX_VALUES.TRANSACTION_IDS) {
      warnings.push(`Receipt has very many transactions (${r.transactionIds.length})`);
    }
    for (let i = 0; i < Math.min(r.transactionIds.length, 10); i++) {
      const txId = r.transactionIds[i];
      if (typeof txId !== 'string') {
        errors.push(`Transaction ID at index ${i} is not a string`);
      } else if (!validateTransactionId(txId)) {
        errors.push(`Transaction ID at index ${i} is not a valid format`);
      }
    }
  } else if (typeof r.transactionIds === 'string') {
    // Private mode: encrypted string
    errors.push(...validateEncryptedField(r.transactionIds, 'transactionIds'));
  } else {
    errors.push('Receipt transactionIds must be an array or encrypted string');
  }

  // Validate transactionIdsEncrypted flag
  if (r.transactionIdsEncrypted !== undefined && typeof r.transactionIdsEncrypted !== 'boolean') {
    errors.push('Receipt transactionIdsEncrypted must be a boolean');
  }

  // Validate chunkCount
  if (typeof r.chunkCount !== 'number') {
    errors.push('Receipt chunkCount must be a number');
  } else {
    if (r.chunkCount <= 0) {
      errors.push('Receipt chunkCount must be positive');
    }
    if (r.chunkCount > MAX_VALUES.CHUNK_COUNT) {
      warnings.push(`Receipt has very many chunks (${r.chunkCount})`);
    }
  }

  // Validate totalCostKAS
  if (typeof r.totalCostKAS !== 'number') {
    errors.push('Receipt totalCostKAS must be a number');
  } else {
    if (r.totalCostKAS < 0) {
      errors.push('Receipt totalCostKAS cannot be negative');
    }
    if (r.totalCostKAS > MAX_VALUES.COST_KAS) {
      warnings.push(`Receipt cost is very high (${r.totalCostKAS} KAS)`);
    }
  }

  // Validate network (optional)
  if (r.network !== undefined) {
    const networkValidation = validateStringField(r.network, 'network', 50);
    errors.push(...networkValidation.errors);
    warnings.push(...networkValidation.warnings);
  }

  // Validate walletAddress (optional)
  if (r.walletAddress !== undefined) {
    const addressValidation = validateStringField(r.walletAddress, 'walletAddress', 200);
    errors.push(...addressValidation.errors);
    warnings.push(...addressValidation.warnings);
  }

  // Check consistency: chunkCount should match transactionIds length (for public receipts)
  if (Array.isArray(r.transactionIds) && typeof r.chunkCount === 'number') {
    if (r.transactionIds.length !== r.chunkCount) {
      warnings.push(
        `Chunk count mismatch: chunkCount (${r.chunkCount}) !== ` +
          `transactionIds.length (${r.transactionIds.length})`
      );
    }
  }

  // Check consistency: private receipts should have encrypted fields
  if (r.privacy === 'private') {
    if (!r.encrypted) {
      warnings.push('Receipt is marked as private but encrypted flag is false');
    }
    if (!r.groupId) {
      errors.push('Private receipt must have a groupId');
    }
    if (!r.transactionIdsEncrypted && Array.isArray(r.transactionIds)) {
      warnings.push('Private receipt has plaintext transaction IDs (old format?)');
    }
  }

  // Check consistency: public receipts should NOT have encrypted transaction IDs
  if (r.privacy === 'public' && r.transactionIdsEncrypted === true) {
    warnings.push('Public receipt has encrypted transaction IDs');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
