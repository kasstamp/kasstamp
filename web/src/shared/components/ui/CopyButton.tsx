import React from 'react';
import { Button } from './Button';
import { Copy, Check } from 'lucide-react';

export interface CopyButtonProps {
  text: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  variant?: 'outline' | 'ghost' | 'default';
  label?: string;
  copiedLabel?: string;
  feedbackMs?: number;
  onCopied?: () => void;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(function CopyButton(
  {
    text,
    className,
    size = 'sm',
    variant = 'outline',
    label = 'Copy',
    copiedLabel = 'Copied',
    feedbackMs = 1500,
    onCopied,
  },
  ref,
) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), feedbackMs);
    } catch {
      // no-op; browser may block clipboard without secure context
    }
  }, [text, onCopied, feedbackMs]);

  const showLabel = label || copiedLabel;

  return (
    <Button
      ref={ref}
      type="button"
      size={size}
      variant={variant}
      className={(className ? className + ' ' : '') + 'text-xs'}
      onClick={handleCopy}
      disabled={copied}
    >
      {copied ? (
        <Check className={showLabel ? 'mr-1 h-3 w-3' : 'h-4 w-4'} />
      ) : (
        <Copy className={showLabel ? 'mr-1 h-3 w-3' : 'h-4 w-4'} />
      )}
      {showLabel && (copied ? copiedLabel : label)}
    </Button>
  );
});
