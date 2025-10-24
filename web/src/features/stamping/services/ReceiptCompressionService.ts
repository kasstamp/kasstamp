import pako from 'pako';
import { pageLogger } from '@/core/utils/logger';
import type { StampingReceipt } from '@kasstamp/sdk';

export interface CompressionResult {
  compressed: Uint8Array;
  base64: string;
  urlSafeBase64: string;
  receiptUrl: string;
  compressionRatio: number;
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  base64Size: number;
  urlSize: number;
  compressionRatio: number;
}

export class ReceiptCompressionService {
  /**
   * Compress receipt data using GZIP and encode as URL-safe Base64
   */
  static compressReceipt(
    receipt: StampingReceipt,
    baseUrl: string = window.location.origin,
  ): CompressionResult {
    const receiptJson = JSON.stringify(receipt);

    // Compress with GZIP for maximum space efficiency
    const compressed = pako.deflate(receiptJson);

    // Convert to base64 using robust method
    pageLogger.info(`🔍 Converting ${compressed.length} bytes to base64`);

    let binaryString = '';
    for (let i = 0; i < compressed.length; i++) {
      binaryString += String.fromCharCode(compressed[i]);
    }

    const base64 = btoa(binaryString);
    const urlSafeBase64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const receiptUrl = `${baseUrl}/r/${urlSafeBase64}`;

    const compressionRatio = (1 - compressed.length / receiptJson.length) * 100;

    pageLogger.info(`🔍 Base64 created: ${urlSafeBase64.length} chars`);
    pageLogger.info(`🔍 Base64 sample: ${urlSafeBase64.substring(0, 50)}...`);

    return {
      compressed,
      base64,
      urlSafeBase64,
      receiptUrl,
      compressionRatio,
    };
  }

  /**
   * Decompress receipt data from URL-safe Base64
   */
  static decompressReceipt(urlSafeBase64: string): StampingReceipt {
    // Restore URL-safe base64 to standard base64
    let restoredBase64 = urlSafeBase64.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    while (restoredBase64.length % 4) {
      restoredBase64 += '=';
    }

    pageLogger.info(`🔍 Restored standard base64: ${restoredBase64.substring(0, 50)}...`);

    // Decode base64 to binary
    const binaryString = atob(restoredBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decompress with pako
    const decompressed = pako.inflate(bytes, { to: 'string' });
    const receipt = JSON.parse(decompressed) as StampingReceipt;

    pageLogger.info('📄 Receipt decompressed successfully');
    return receipt;
  }

  /**
   * Get compression statistics
   */
  static getCompressionStats(
    receipt: StampingReceipt,
    baseUrl: string = window.location.origin,
  ): CompressionStats {
    const result = this.compressReceipt(receipt, baseUrl);

    return {
      originalSize: JSON.stringify(receipt).length,
      compressedSize: result.compressed.length,
      base64Size: result.urlSafeBase64.length,
      urlSize: result.receiptUrl.length,
      compressionRatio: result.compressionRatio,
    };
  }

  /**
   * Check if receipt is suitable for QR code
   */
  static isReceiptSuitableForQR(receipt: StampingReceipt, limit: number = 2500): boolean {
    const stats = this.getCompressionStats(receipt);
    return stats.urlSize <= limit;
  }
}
