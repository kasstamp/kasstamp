/**
 * @fileoverview Wallet Import Tab Component
 *
 * Handles importing existing wallets from mnemonic phrase
 */

import type React from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useWallet } from '@/shared/hooks/useWallet';
import { dialogLogger } from '@/core/utils/logger';
import type { ImportWalletFormData } from '../types';

interface WalletImportTabProps {
  importForm: ImportWalletFormData;
  setImportForm: React.Dispatch<React.SetStateAction<ImportWalletFormData>>;
  availableWallets: Array<{ filename: string; title?: string }>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  onClose: () => void;
}

export default function WalletImportTab({
  importForm,
  setImportForm,
  availableWallets,
  isLoading,
  setIsLoading,
  setError,
  onClose,
}: WalletImportTabProps) {
  const [, walletActions] = useWallet();

  const handleImportWallet = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!importForm.mnemonic.trim()) {
      setError('Mnemonic phrase is required');
      return;
    }

    if (importForm.walletSecret.length < 8) {
      setError('Wallet secret must be at least 8 characters long');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const walletNumber = availableWallets.length + 1;
      const defaultWalletName = `Imported Wallet #${walletNumber}`;

      dialogLogger.info(`📥 Starting wallet import: ${defaultWalletName}`);
      await walletActions.importWallet({
        mnemonic: importForm.mnemonic.trim(),
        walletName: importForm.walletName || defaultWalletName,
        walletSecret: importForm.walletSecret,
        passphrase: importForm.passphrase || undefined,
      });

      dialogLogger.info(`✅ Import completed, closing dialog`);
      onClose();
      // Reset form
      setImportForm({
        walletName: '',
        walletSecret: '',
        mnemonic: '',
        passphrase: '',
      });
    } catch (err) {
      dialogLogger.error('❌ Import failed in dialog:', err as Error);
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleImportWallet} className="space-y-4">
      <div className="hidden space-y-2">
        <Input
          value={importForm.walletName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setImportForm((prev) => ({ ...prev, walletName: e.target.value }))
          }
          placeholder="Wallet Name"
          tooltipContent="Give your imported wallet a memorable name. Leave empty to auto-generate 'Wallet 1', 'Wallet 2', etc."
          tooltipSide="top"
          maxLength={50}
        />
      </div>

      <div className="space-y-2">
        <Input
          type="password"
          passwordToggle
          value={importForm.walletSecret}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setImportForm((prev) => ({ ...prev, walletSecret: e.target.value }))
          }
          placeholder="Wallet Password *"
          tooltipContent="This encrypts your imported wallet data. Can be different from your original password."
          tooltipSide="top"
          required
          minLength={8}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Seed Phrase *</label>
        <textarea
          value={importForm.mnemonic}
          onChange={(e) =>
            setImportForm((prev) => ({ ...prev, mnemonic: e.target.value.toLowerCase() }))
          }
          placeholder="word1 word2 word3 ... (your 12-24 recovery words)"
          required
          rows={3}
        />
        <p className="text-xs text-[color:var(--text)]">
          The 12-24 recovery words you wrote down when creating your wallet.
        </p>
      </div>

      <div className="space-y-2">
        <Input
          type="password"
          value={importForm.passphrase}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setImportForm((prev) => ({ ...prev, passphrase: e.target.value }))
          }
          placeholder="BIP39 Passphrase"
          tooltipContent="This is an optinal 25th word. Only enter this if you used an extra passphrase when creating your wallet. Leave empty if you didn't use one."
          tooltipSide="top"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading} className="primary">
          {isLoading ? 'Importing...' : 'Import Wallet'}
        </Button>
      </div>
    </form>
  );
}
