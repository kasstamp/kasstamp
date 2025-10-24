/**
 * @fileoverview Wallet Unlock Dialog for Stamping
 *
 * Prompts user to unlock wallet for stamping operations
 */

import { Button } from '@/shared/components/ui/Button';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import type { PrivacyMode } from '../types';
import type { StampingEstimation } from '../services';
import { formatExactAmount } from '@/shared/utils/formatBalance';

interface WalletUnlockDialogProps {
  isOpen: boolean;
  mode: PrivacyMode;
  estimation: StampingEstimation | null;
  walletSecret: string;
  walletMnemonic: string;
  onWalletSecretChange: (secret: string) => void;
  onWalletMnemonicChange: (mnemonic: string) => void;
  onClose: () => void;
  onUnlock: () => void;
}

export default function WalletUnlockDialog({
  isOpen,
  mode,
  estimation,
  walletSecret,
  walletMnemonic,
  onWalletSecretChange,
  onWalletMnemonicChange,
  onClose,
  onUnlock,
}: WalletUnlockDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent title="Unlock Wallet for Stamping">
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            To stamp files, please unlock your wallet. Your credentials will be stored securely in
            an encrypted enclave and you won't need to enter them again for 30 minutes.
          </p>

          {estimation && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="space-y-1 text-sm">
                <div>
                  <strong>Estimated Cost:</strong> {formatExactAmount(estimation.totalCostKAS)}
                </div>
                <div>
                  <strong>Chunks:</strong> {estimation.chunkCount}
                </div>
                <div>
                  <strong>Transactions:</strong> {estimation.estimatedTransactions}
                </div>
                <div>
                  <strong>Mode:</strong> {mode}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium">Wallet Password</label>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2"
              placeholder="Enter your wallet password"
              value={walletSecret}
              onChange={(e) => onWalletSecretChange(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Mnemonic (12 words) - Optional</label>
            <textarea
              className="w-full rounded-md border px-3 py-2 font-mono text-sm"
              placeholder="word1 word2 word3 ... (optional, if enclave doesn't have it yet)"
              rows={3}
              value={walletMnemonic}
              onChange={(e) => onWalletMnemonicChange(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Only needed if this is your first time unlocking after connecting. Will be stored
              securely in encrypted enclave.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onUnlock} disabled={!walletSecret}>
              Unlock & Stamp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
