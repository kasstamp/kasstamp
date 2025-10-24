/**
 * @fileoverview Wallet Creation Tab Component
 *
 * Handles new wallet creation and mnemonic display
 */

import { useRef, useState } from 'react';
import type React from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SelectTabs } from '@/shared/components/ui/SelectTabs';
import { Tooltip } from '@/shared/components/ui/Tooltip';
import { CopyButton } from '@/shared/components/ui/CopyButton';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import StyledAddress from './StyledAddress';
import { useWallet } from '@/shared/hooks/useWallet';
import { Info } from 'lucide-react';
import type { CreateWalletFormData } from '../types';

interface WalletCreateTabProps {
  createForm: CreateWalletFormData;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateWalletFormData>>;
  availableWallets: Array<{ filename: string; title?: string }>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  onClose: () => void;
}

export default function WalletCreateTab({
  createForm,
  setCreateForm,
  availableWallets,
  isLoading,
  setIsLoading,
  setError,
  onClose,
}: WalletCreateTabProps) {
  const [walletState, walletActions] = useWallet();
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [hasWrittenDown, setHasWrittenDown] = useState(false);
  const [mnemonicAddressCopied, setMnemonicAddressCopied] = useState(false);
  const mnemonicAddressCopyButtonRef = useRef<HTMLButtonElement>(null);

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();

    if (createForm.walletSecret.length < 8) {
      setError('Wallet secret must be at least 8 characters long');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const walletNumber = availableWallets.length + 1;
      const defaultWalletName = `Wallet #${walletNumber}`;

      const result = await walletActions.createWallet({
        walletName: createForm.walletName || defaultWalletName,
        walletSecret: createForm.walletSecret,
        words: createForm.words,
        passphrase: createForm.useBip39 ? createForm.passphrase || undefined : undefined,
      });

      setGeneratedMnemonic(result.mnemonic);
      setHasWrittenDown(false);
      // Don't close dialog yet - show the mnemonic first
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseMnemonicDialog = () => {
    if (!hasWrittenDown) return; // guard close until confirmed
    setGeneratedMnemonic(null);
    onClose();
    // Reset form
    setCreateForm({
      walletName: '',
      walletSecret: '',
      words: 24,
      passphrase: '',
      useBip39: false,
    });
  };

  if (generatedMnemonic) {
    return (
      <Dialog
        open={true}
        onOpenChange={(open: boolean) => {
          if (!open) {
            if (hasWrittenDown) {
              handleCloseMnemonicDialog();
            }
          }
        }}
      >
        <DialogContent
          title="Wallet Created Successfully!"
          alignTop
          onInteractOutside={(e) => {
            if (!hasWrittenDown) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!hasWrittenDown) e.preventDefault();
          }}
        >
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="mb-2 text-sm font-medium text-yellow-800">
              ⚠️ Important: Save your recovery phrase & not share it with anyone
            </p>
            <p className="text-xs text-yellow-700">
              Write down these words in order and store them safely. You'll need them to recover
              your wallet. When you close this dialog, it will be not possible to access show the
              recovery phrase again.
            </p>
          </div>
          <div className="-mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Recovery Phrase (Mnemonic)</label>
              <CopyButton text={generatedMnemonic ?? ''} />
            </div>
            <div className="relative">
              <textarea
                value={generatedMnemonic ?? ''}
                readOnly
                className="w-full resize-none border p-3 font-mono text-xs sm:text-sm"
                rows={2}
              />
            </div>
          </div>
          {walletState.address && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Wallet Address</label>
              </div>
              <div className="group relative">
                <p
                  className="w-full cursor-pointer rounded-md border p-3 pr-10 text-xs break-all transition-colors hover:bg-gray-50"
                  onClick={() => {
                    mnemonicAddressCopyButtonRef.current?.click();
                  }}
                  title="Click to copy address"
                >
                  <StyledAddress address={walletState.address} />
                </p>
                <div
                  className={`absolute top-1 right-1 transition-opacity ${mnemonicAddressCopied ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}
                >
                  <CopyButton
                    ref={mnemonicAddressCopyButtonRef}
                    text={walletState.address || ''}
                    variant="ghost"
                    size="sm"
                    label=""
                    copiedLabel=""
                    className="!border-0 !bg-transparent hover:!bg-gray-100"
                    onCopied={() => {
                      setMnemonicAddressCopied(true);
                      setTimeout(() => setMnemonicAddressCopied(false), 1500);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 py-3 pr-3 pl-1">
            <input
              type="checkbox"
              id="hasWrittenDown"
              checked={hasWrittenDown}
              onChange={(e) => setHasWrittenDown(e.target.checked)}
              className="cursor-pointer"
            />
            <label
              htmlFor="hasWrittenDown"
              className="flex-1 cursor-pointer text-sm"
              style={{ color: 'var(--text)' }}
            >
              I have written down my recovery phrase
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              onClick={handleCloseMnemonicDialog}
              disabled={!hasWrittenDown}
              className="primary"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <form onSubmit={handleCreateWallet} className="space-y-4">
      <div className="hidden space-y-2">
        <Input
          value={createForm.walletName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setCreateForm((prev) => ({ ...prev, walletName: e.target.value }))
          }
          placeholder="Wallet Name"
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <Input
          type="password"
          passwordToggle
          value={createForm.walletSecret}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setCreateForm((prev) => ({ ...prev, walletSecret: e.target.value }))
          }
          placeholder="Wallet Password *"
          tooltipContent="This password encrypts your wallet data. Keep it safe!"
          tooltipSide="top"
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        {/* Mobile: Stack label on top, Desktop: Side by side */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <label className="text-sm font-medium">Seed Phrase</label>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:min-w-[220px] sm:justify-end">
            <div className="flex-1 sm:min-w-[220px] sm:flex-none">
              <SelectTabs
                options={[
                  { value: '12', label: '12 words' },
                  { value: '24', label: '24 words' },
                  { value: 'bip39', label: '24 words + BIP39' },
                ]}
                value={createForm.useBip39 ? 'bip39' : createForm.words.toString()}
                onChange={(value: string | number) => {
                  const stringValue = value.toString();
                  if (stringValue === 'bip39') {
                    setCreateForm((prev) => ({ ...prev, words: 24, useBip39: true }));
                  } else {
                    setCreateForm((prev) => ({
                      ...prev,
                      words: parseInt(stringValue) as 12 | 24,
                      useBip39: false,
                      passphrase: '',
                    }));
                  }
                }}
                className="w-full"
              />
            </div>
            <Tooltip content="We recommend 24 words + BIP39 for better security" side="top">
              <Info className="h-4 w-4 flex-shrink-0 cursor-help text-gray-400 hover:text-gray-600" />
            </Tooltip>
          </div>
        </div>
      </div>

      {createForm.useBip39 && (
        <div className="space-y-2">
          <Input
            type="password"
            value={createForm.passphrase}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev) => ({ ...prev, passphrase: e.target.value }))
            }
            placeholder="BIP39 Passphrase"
            tooltipContent="This is an optinal 25th word. Only enter this if you used an extra passphrase when creating your wallet. Leave empty if you didn't use one."
            tooltipSide="top"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading} className="primary">
          {isLoading ? 'Creating...' : 'Create Wallet'}
        </Button>
      </div>
    </form>
  );
}
