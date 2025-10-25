/**
 * @fileoverview Main Application Layout
 *
 * Provides the app shell with header, navigation, and footer
 */

import { useLocation, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Wallet } from 'lucide-react';
import { appLogger } from '@/core/utils/logger';
import WalletManagementDialog from '@/features/wallet/components/WalletManagementDialog';
import { ThemeToggle } from '@/shared/components/ui/ThemeToggle';
import { useWallet } from '@/shared/hooks/useWallet';
import { APP_CONFIG } from '@/features/wallet/constants';
import { formatBalanceCompact } from '@/shared/utils/formatBalance';
import packageJson from '../../../package.json';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [walletState, walletActions] = useWallet();
  const autoConnectAttempted = useRef(false);

  // Auto-connect to network on page load (once only) - if enabled
  // This should only run on initial mount, not after explicit disconnects
  useEffect(() => {
    const autoConnect = async () => {
      if (APP_CONFIG.enableAutoConnect && !autoConnectAttempted.current) {
        autoConnectAttempted.current = true;
        try {
          appLogger.info('🚀 Auto-connecting to network...');
          await walletActions.connect();
        } catch (error) {
          appLogger.warn('⚠️ Auto-connect failed:', error as Error);
          // Don't show error to user on auto-connect failure
        }
      }
    };

    void autoConnect();
    // Only run once on mount - don't include walletState in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const getPageTitle = (pathname: string) => {
      switch (pathname) {
        case '/':
          return 'KasStamp - Stamp your data on the Layer-1 Kaspa BlockDAG.';
        case '/explorer':
          return 'Explorer - KasStamp';
        case '/learn':
          return 'Learn - KasStamp';
        case '/terms':
          return 'Terms of Service - KasStamp';
        case '/privacy':
          return 'Privacy Policy - KasStamp';
        default:
          return 'KasStamp - Stamp your data on the Layer-1 Kaspa BlockDAG.';
      }
    };

    document.title = getPageTitle(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      setIsScrolled(scrollTop > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getWalletButtonText = () => {
    if (walletState.isConnecting) return 'Connecting...';
    if (!walletState.isConnected) return 'Connect';
    if (!walletState.hasWallet) return 'Wallet Connect';
    if (walletState.walletName) return walletState.walletName;
    return walletState.address
      ? `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`
      : 'Wallet';
  };

  const getWalletButtonVariant = () => {
    if (walletState.hasWallet && walletState.address) return 'default';
    return 'outline';
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
          isScrolled ? 'border-b shadow-sm backdrop-blur-sm' : 'bg-transparent'
        }`}
        style={{
          backgroundColor: isScrolled ? 'var(--background)' : 'transparent',
          borderColor: 'var(--border-primary)',
        }}
      >
        <div className="px-2 py-2 sm:px-6">
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {/* Logo - only icon on mobile, with text on desktop */}
            <Link to="/" className="inline-flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
              <img src="/logo.svg" alt="KasStamp Logo" className="h-7 w-7 sm:h-8 sm:w-8" />
              <span className="text-sm font-semibold tracking-tight sm:inline sm:text-base">
                KasStamp
              </span>
            </Link>

            {/* Navigation - centered on desktop, inline on mobile */}
            <nav
              className="-ml-2 flex flex-shrink-0 items-center gap-1.5 text-xs sm:absolute sm:left-1/2 sm:ml-0 sm:-translate-x-1/2 sm:gap-4 sm:text-sm"
              style={{ color: 'var(--text)' }}
            >
              <Link
                className="text-[color:var(--text)] transition-colors hover:text-[color:var(--text-strong)]"
                to="/"
              >
                Stamp
              </Link>
              <Link
                className="text-[color:var(--text)] transition-colors hover:text-[color:var(--text-strong)]"
                to="/learn"
              >
                Learn
              </Link>
            </nav>

            <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
              {/* Balance to the left of wallet button - shown on all screen sizes */}
              {walletState.balance && (
                <div
                  className="mr-1 text-[10px] whitespace-nowrap sm:mr-2 sm:text-sm"
                  style={{ color: 'var(--text)' }}
                >
                  {formatBalanceCompact(walletState.balance)}
                </div>
              )}
              {/* Wallet button */}
              <Button
                variant={getWalletButtonVariant()}
                size="default"
                className="h-8 gap-1 rounded-full px-2 py-1.5 text-xs sm:h-10 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                aria-label="Wallet connect"
                onClick={() => setIsWalletModalOpen(true)}
                disabled={walletState.isConnecting}
              >
                <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="max-w-[80px] truncate sm:max-w-none">{getWalletButtonText()}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center pt-20">{children}</main>
      <footer className="py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-center justify-center gap-4">
          <span>Made with care. (v{packageJson.version})</span>
          <ThemeToggle />
        </div>
      </footer>

      {/* Wallet Connect Dialog */}
      <WalletManagementDialog
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </div>
  );
}
