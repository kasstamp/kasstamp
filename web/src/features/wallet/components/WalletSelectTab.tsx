/**
 * @fileoverview Wallet Selection Tab Component
 *
 * Displays list of available wallets and handles wallet selection, unlocking, and management
 */

import { useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { WalletListItem } from '@/shared/components/ui/WalletListItem';
import { CopyButton } from '@/shared/components/ui/CopyButton';
import StyledAddress from './StyledAddress';
import { useWallet } from '@/shared/hooks/useWallet';
import { Wallet, Plus, Trash2 } from 'lucide-react';
import { dialogLogger } from '@/core/utils/logger';

interface WalletSelectTabProps {
  availableWallets: Array<{ filename: string; title?: string }>;
  selectedWallet: string | null;
  setSelectedWallet: (id: string | null) => void;
  openWalletSecret: string;
  setOpenWalletSecret: (secret: string) => void;
  deletingWallet: string | null;
  setDeletingWallet: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadWallets: () => Promise<void>;
  onClose: () => void;
  setActiveTab: (tab: 'select' | 'create' | 'import') => void;
}

export default function WalletSelectTab({
  availableWallets,
  selectedWallet,
  setSelectedWallet,
  openWalletSecret,
  setOpenWalletSecret,
  deletingWallet,
  setDeletingWallet,
  isLoading,
  setIsLoading,
  setError,
  loadWallets,
  onClose,
  setActiveTab,
}: WalletSelectTabProps) {
  const [walletState, walletActions] = useWallet();
  const [addressCopied, setAddressCopied] = useState(false);
  const [isEditingWalletName, setIsEditingWalletName] = useState(false);
  const [editedWalletName, setEditedWalletName] = useState('');
  const addressCopyButtonRef = useRef<HTMLButtonElement>(null);
  const walletNameInputRef = useRef<HTMLInputElement>(null);

  const handleDeleteWallet = (walletName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete wallet "${walletName}"? This action cannot be undone. But you can always import it again later if you have your seed phrase.`,
      )
    ) {
      return;
    }

    // Go back to overview immediately and fade out the item
    setSelectedWallet(null);
    setDeletingWallet(walletName);

    // Perform deletion after fade-out duration
    setTimeout(() => {
      void (async () => {
        try {
          setError(null);
          await walletActions.deleteWallet(walletName);
          await loadWallets(); // Refresh the list
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete wallet');
        } finally {
          setDeletingWallet(null);
        }
      })();
    }, 250);
  };

  const handleOpenWallet = async () => {
    if (!selectedWallet || !openWalletSecret) return;

    try {
      setIsLoading(true);
      setError(null);
      await walletActions.openExistingWallet(selectedWallet, openWalletSecret);
      onClose();
      // Reset form
      setSelectedWallet(null);
      setOpenWalletSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditWalletName = () => {
    if (selectedWallet) {
      setEditedWalletName(selectedWallet);
      setIsEditingWalletName(true);
      // Focus the input after it renders
      setTimeout(() => {
        walletNameInputRef.current?.focus();
        walletNameInputRef.current?.select();
      }, 0);
    }
  };

  const handleSaveWalletName = async () => {
    if (!selectedWallet || !editedWalletName.trim()) {
      setIsEditingWalletName(false);
      return;
    }

    const trimmedName = editedWalletName.trim();
    if (trimmedName === selectedWallet) {
      setIsEditingWalletName(false);
      return;
    }

    try {
      setError(null);
      const wasActiveWallet = selectedWallet === walletState.walletName;

      await walletActions.renameWallet(selectedWallet, trimmedName);
      setSelectedWallet(trimmedName);
      await loadWallets(); // Refresh the list
      setIsEditingWalletName(false);

      // Log to verify the state after rename
      if (wasActiveWallet) {
        dialogLogger.info('📝 Renamed active wallet. New state:', {
          selectedWallet: trimmedName,
          walletStateName: walletState.walletName,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename wallet');
      setIsEditingWalletName(false);
    }
  };

  const handleCancelEditWalletName = () => {
    setIsEditingWalletName(false);
    setEditedWalletName('');
  };

  if (selectedWallet) {
    // Detail view for selected wallet
    return (
      <div className="space-y-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          {isEditingWalletName ? (
            <input
              ref={walletNameInputRef}
              type="text"
              value={editedWalletName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditedWalletName(e.target.value)
              }
              onBlur={handleSaveWalletName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleSaveWalletName();
                } else if (e.key === 'Escape') {
                  handleCancelEditWalletName();
                }
              }}
              className="mr-2 flex-1 rounded border border-gray-300 px-2 py-1 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              style={{ color: 'var(--text-strong)' }}
            />
          ) : (
            <p
              className="cursor-pointer font-medium transition-colors hover:text-emerald-600"
              style={{ color: 'var(--text-strong)' }}
              onClick={handleStartEditWalletName}
              title="Click to rename wallet"
            >
              {selectedWallet}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => handleDeleteWallet(selectedWallet)}
            title="Delete Wallet"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {selectedWallet === walletState.walletName ? (
          // Wallet is unlocked - show address and lock button
          <>
            {walletState.address && (
              <div className="group relative">
                <p
                  className="cursor-pointer pr-10 text-xs break-all text-gray-500 transition-colors hover:text-gray-700"
                  onClick={() => {
                    addressCopyButtonRef.current?.click();
                  }}
                  title="Click to copy address"
                >
                  <StyledAddress address={walletState.address} />
                </p>
                <div
                  className={`absolute top-0 right-0 transition-opacity ${addressCopied ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
                >
                  <CopyButton
                    ref={addressCopyButtonRef}
                    text={walletState.address || ''}
                    variant="ghost"
                    size="sm"
                    label=""
                    copiedLabel=""
                    className=""
                    onCopied={() => {
                      setAddressCopied(true);
                      setTimeout(() => setAddressCopied(false), 1500);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setSelectedWallet(null)}>
                Back
              </Button>
              <Button
                onClick={() => {
                  void (async () => {
                    await walletActions.disconnect();
                    setSelectedWallet(null);
                  })();
                }}
                className="primary"
              >
                Lock Wallet
              </Button>
            </div>
          </>
        ) : (
          // Wallet is locked - show password input and unlock button
          <>
            <div className="mt-2 space-y-2">
              <Input
                type="password"
                passwordToggle
                value={openWalletSecret}
                onChange={(e) => setOpenWalletSecret(e.target.value)}
                placeholder="Wallet Password (Secret)"
                tooltipContent="This is the encryption password you used when creating this wallet."
                tooltipSide="top"
                required
              />
            </div>

            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => setSelectedWallet(null)}>
                Back
              </Button>
              <Button
                onClick={handleOpenWallet}
                disabled={!openWalletSecret || isLoading}
                className="primary"
              >
                {isLoading ? 'Unlocking...' : 'Unlock Wallet'}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      {availableWallets.length === 0 ? (
        <div className="py-8 text-center">
          <Wallet className="mx-auto mb-4 h-12 w-12" style={{ color: 'var(--text-secondary)' }} />
          <h4 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            No wallets found
          </h4>
          <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Create your first wallet or import an existing one.
          </p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => setActiveTab('create')}>
              <Plus className="mr-1 h-4 w-4" />
              Create New
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveTab('import')}>
              Import
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--background-outline)' }}
        >
          {availableWallets
            .sort((a, b) => {
              const aName = a.title || a.filename;
              const bName = b.title || b.filename;
              const aIsActive = walletState.walletName === aName;
              const bIsActive = walletState.walletName === bName;

              // Active wallet always comes first
              if (aIsActive && !bIsActive) return -1;
              if (!aIsActive && bIsActive) return 1;

              // Otherwise sort alphabetically
              return aName.localeCompare(bName);
            })
            .map((wallet, index) => {
              const walletName = wallet.title || wallet.filename;
              const isActive = walletState.walletName === walletName;
              const isLast = index === availableWallets.length - 1;

              return (
                <WalletListItem
                  key={wallet.filename}
                  title={walletName}
                  subtitle={
                    isActive && walletState.address ? (
                      <StyledAddress address={walletState.address} />
                    ) : undefined
                  }
                  onClick={() => setSelectedWallet(walletName)}
                  isActive={isActive}
                  isDeleting={deletingWallet === walletName}
                  isLast={isLast}
                />
              );
            })}
        </div>
      )}
    </div>
  );
}
