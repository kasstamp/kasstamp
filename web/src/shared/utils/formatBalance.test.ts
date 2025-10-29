/**
 * @fileoverview Tests for Balance Formatting Utilities
 *
 * Tests ensure that balance values are never rounded to prevent data loss.
 * Values are truncated instead of rounded for maximum precision preservation.
 */

import { describe, it, expect } from 'vitest';
import {
  formatBalance,
  formatBalanceForDisplay,
  formatBalanceCompact,
  formatExactAmount,
} from './formatBalance';

describe('formatBalance', () => {
  describe('basic formatting', () => {
    it('should handle zero values', () => {
      expect(formatBalance('0')).toBe('0');
      expect(formatBalance(0)).toBe('0');
      expect(formatBalance('0.0')).toBe('0');
      expect(formatBalance('0.00')).toBe('0');
    });

    it('should handle whole numbers', () => {
      expect(formatBalance('1')).toBe('1');
      expect(formatBalance('1000')).toBe('1000');
      expect(formatBalance('123456')).toBe('123456');
    });

    it('should remove trailing zeros', () => {
      expect(formatBalance('1.0')).toBe('1');
      expect(formatBalance('1.00')).toBe('1');
      expect(formatBalance('1.0000')).toBe('1');
      expect(formatBalance('123.0000')).toBe('123');
    });

    it('should preserve significant decimals', () => {
      expect(formatBalance('1.1')).toBe('1.1');
      expect(formatBalance('1.12')).toBe('1.12');
      expect(formatBalance('1.123')).toBe('1.123');
      expect(formatBalance('1.1234')).toBe('1.1234');
    });
  });

  describe('decimal truncation (no rounding)', () => {
    it('should truncate decimals at maxDecimals limit', () => {
      expect(formatBalance('1.23456', 4)).toBe('1.2345'); // Truncated, not rounded
      expect(formatBalance('1.23456789', 4)).toBe('1.2345'); // Truncated, not rounded
      expect(formatBalance('1.99999', 2)).toBe('1.99'); // Truncated, not rounded
    });

    it('should handle default 4 decimal limit', () => {
      expect(formatBalance('1.23456789')).toBe('1.2345'); // Default maxDecimals = 4
      expect(formatBalance('0.000123456')).toBe('0.0001'); // Truncated at 4 decimals
    });

    it('should truncate small amounts to 4 decimals', () => {
      expect(formatBalance('0.0001')).toBe('0.0001');
      expect(formatBalance('0.00001')).toBe('0'); // Truncated to 4 decimals -> 0.0000 -> 0
      expect(formatBalance('0.000001')).toBe('0'); // Truncated to 4 decimals -> 0.0000 -> 0
    });
  });

  describe('edge cases', () => {
    it('should handle empty and null values', () => {
      expect(formatBalance('')).toBe('0');
      expect(formatBalance(null as any)).toBe('0');
      expect(formatBalance(undefined as any)).toBe('0');
    });

    it('should handle very large numbers', () => {
      expect(formatBalance('999999999.123456789')).toBe('999999999.1234'); // Truncated at 4 decimals
      expect(formatBalance('1000000000')).toBe('1000000000');
    });

    it('should handle very small numbers', () => {
      expect(formatBalance('0.000000001')).toBe('0'); // Truncated to 4 decimals -> 0
      expect(formatBalance('0.0000000001')).toBe('0'); // Truncated to 4 decimals -> 0
    });
  });
});

describe('formatBalanceForDisplay', () => {
  it('should format balance with KAS suffix and 4 decimal limit', () => {
    expect(formatBalanceForDisplay('1.23456789')).toBe('1.2345 KAS');
    expect(formatBalanceForDisplay('0')).toBe('0 KAS');
    expect(formatBalanceForDisplay('1000.0000')).toBe('1000 KAS');
  });
});

describe('formatBalanceCompact', () => {
  it('should convert sompi to KAS and remove trailing zeros', () => {
    // 123456789 sompi = 1.23456789 KAS
    expect(formatBalanceCompact('123456789')).toBe('1.23456789 KAS');
    // 1234567 sompi = 0.01234567 KAS
    expect(formatBalanceCompact('1234567')).toBe('0.01234567 KAS');
    // 100000000 sompi = 1 KAS
    expect(formatBalanceCompact('100000000')).toBe('1 KAS');
    // 1000000000 sompi = 10 KAS
    expect(formatBalanceCompact('1000000000')).toBe('10 KAS');
    // 0 sompi = 0 KAS
    expect(formatBalanceCompact('0')).toBe('0 KAS');
    // 4798980677 sompi = 47.98980677 KAS
    expect(formatBalanceCompact('4798980677')).toBe('47.98980677 KAS');
  });
});

describe('formatExactAmount', () => {
  it('should format exact amounts with 8 decimal limit for receipts', () => {
    expect(formatExactAmount('1.234567890123')).toBe('1.23456789 KAS'); // Truncated at 8 decimals
    expect(formatExactAmount('0.000000001')).toBe('0 KAS'); // Truncated to 8 decimals -> 0
    expect(formatExactAmount('999.999999999')).toBe('999.99999999 KAS'); // Truncated at 8 decimals
  });

  it('should handle zero and whole numbers', () => {
    expect(formatExactAmount('0')).toBe('0 KAS');
    expect(formatExactAmount('1000')).toBe('1000 KAS');
    expect(formatExactAmount('1000.0000')).toBe('1000 KAS');
  });
});

describe('critical: no rounding behavior', () => {
  it('should NEVER round values - only truncate', () => {
    // These tests are critical - they ensure no data loss through rounding
    expect(formatBalance('1.99999', 2)).toBe('1.99'); // NOT 2.00
    expect(formatBalance('1.99999', 4)).toBe('1.9999'); // NOT 2.0000
    expect(formatBalance('0.99999', 2)).toBe('0.99'); // NOT 1.00
    expect(formatBalance('9.99999', 2)).toBe('9.99'); // NOT 10.00
  });

  it('should preserve exact precision for financial calculations', () => {
    // Critical for financial applications - no rounding errors
    expect(formatBalance('0.0001')).toBe('0.0001'); // Exact at 4 decimals
    expect(formatBalance('0.00001')).toBe('0'); // Truncated to 4 decimals -> 0
    expect(formatBalance('0.000001')).toBe('0'); // Truncated to 4 decimals -> 0

    // For exact amounts, use formatExactAmount with 8 decimals
    expect(formatBalance('0.00001234', 8)).toBe('0.00001234'); // Exact at 8 decimals
  });
});
