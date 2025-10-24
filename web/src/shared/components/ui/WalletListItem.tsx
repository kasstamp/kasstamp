import { ChevronRight } from 'lucide-react';
import React from 'react';

export interface WalletListItemProps {
  title: string;
  subtitle?: string | React.ReactNode;
  onClick?: () => void;
  isActive?: boolean;
  isLast?: boolean;
  isDeleting?: boolean;
}

export function WalletListItem({
  title,
  subtitle,
  onClick,
  isActive,
  isLast,
  isDeleting,
}: WalletListItemProps) {
  return (
    <div
      className={`wallet-list-item ${isLast ? '' : 'border-b'} ${isDeleting ? 'opacity-0 transition-opacity duration-200' : 'opacity-100 transition-opacity duration-200'}`}
      style={{ borderBottomColor: isLast ? 'transparent' : 'var(--background-outline)' }}
      onClick={onClick}
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <p className="wallet-title">{title}</p>
          <div className="flex items-center gap-2">
            {isActive && <span className="badge badge-primary">Activated</span>}
            <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
        {subtitle && <p className="wallet-subtitle pr-10">{subtitle}</p>}
      </div>
    </div>
  );
}

export default WalletListItem;
