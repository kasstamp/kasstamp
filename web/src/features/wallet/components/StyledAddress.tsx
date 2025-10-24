/**
 * @fileoverview Styled Address Component
 *
 * Displays a Kaspa address with styled prefix and suffix for better readability
 */

interface StyledAddressProps {
  address: string;
  className?: string;
}

export default function StyledAddress({ address, className = '' }: StyledAddressProps) {
  const prefixMatch = address.match(/^(kaspa(?:test)?:)/);
  const prefix = prefixMatch ? prefixMatch[1] : '';
  const remainingAddress = prefix ? address.slice(prefix.length) : address;
  const mainPart = remainingAddress.slice(0, -8);
  const lastEight = remainingAddress.slice(-8);

  return (
    <span className={className}>
      {prefix && <span className="font-bold">{prefix}</span>}
      <span className="font-normal">{mainPart}</span>
      <span className="font-semibold">{lastEight}</span>
    </span>
  );
}
