/**
 * Format balance for display without rounding
 *
 * This utility ensures that balance values are never rounded to prevent
 * data loss. It formats the balance for display while preserving precision.
 */

/**
 * Format a balance value for display
 * @param balance - The balance value as string or number
 * @param maxDecimals - Maximum number of decimal places to show (default: 4)
 * @returns Formatted balance string
 */
export function formatBalance(balance: string | number, maxDecimals: number = 4): string {
  if (!balance || balance === '0' || balance === 0) {
    return '0';
  }

  const balanceStr = typeof balance === 'number' ? balance.toString() : balance;

  // If it's a whole number, return as is
  if (!balanceStr.includes('.')) {
    return balanceStr;
  }

  // Split by decimal point
  const [integerPart, decimalPart] = balanceStr.split('.');

  // Limit decimal places but don't round - just truncate
  const limitedDecimals = decimalPart.substring(0, maxDecimals);

  // Remove trailing zeros from limited decimals
  const finalDecimals = limitedDecimals.replace(/0+$/, '');

  // Return formatted balance
  if (finalDecimals === '') {
    return integerPart;
  }

  return `${integerPart}.${finalDecimals}`;
}

/**
 * Format balance for display in UI components (max 4 decimals)
 * @param balance - The balance value as string or number
 * @returns Formatted balance string with KAS suffix
 */
export function formatBalanceForDisplay(balance: string | number): string {
  const formatted = formatBalance(balance, 4);
  return `${formatted} KAS`;
}

/**
 * Format exact amount for receipts and cost estimations (no decimal limit)
 * @param amount - The amount value as string or number
 * @returns Formatted amount string with KAS suffix
 */
export function formatExactAmount(amount: string | number): string {
  const formatted = formatBalance(amount, 8); // Use 8 decimals for exact amounts
  return `${formatted} KAS`;
}

/**
 * Format balance for compact display (e.g., in header)
 * @param balance - The balance value as string or number
 * @param maxDecimals - Maximum decimal places for compact display (default: 4)
 * @returns Formatted balance string with KAS suffix
 */
export function formatBalanceCompact(balance: string | number, maxDecimals: number = 4): string {
  const formatted = formatBalance(balance, maxDecimals);
  return `${formatted} KAS`;
}
