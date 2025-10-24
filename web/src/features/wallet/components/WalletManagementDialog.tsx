/**
 * @fileoverview Wallet Management Dialog - Main Orchestrator
 *
 * Coordinates wallet selection, creation, and import workflows
 */

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/shared/components/ui/Dialog';
import { Button } from '@/shared/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/Tabs';
import WalletSelectTab from './WalletSelectTab';
import WalletCreateTab from './WalletCreateTab';
import WalletImportTab from './WalletImportTab';
import { useWallet } from '@/shared/hooks/useWallet';
import { APP_CONFIG } from '../constants';
import type { WalletDescriptor } from '@kasstamp/sdk';
import type { CreateWalletFormData, ImportWalletFormData } from '../types';

interface WalletManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletUnlocked?: () => void;
}

export default function WalletManagementDialog({
  isOpen,
  onClose,
  onWalletUnlocked,
}: WalletManagementDialogProps) {
  const [walletState, walletActions] = useWallet();
  const [availableWallets, setAvailableWallets] = useState<WalletDescriptor[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [openWalletSecret, setOpenWalletSecret] = useState('');
  const [deletingWallet, setDeletingWallet] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'select' | 'create' | 'import'>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState<CreateWalletFormData>({
    walletName: '',
    walletSecret: '',
    words: 24,
    passphrase: '',
    useBip39: false,
  });

  const [importForm, setImportForm] = useState<ImportWalletFormData>({
    walletName: '',
    walletSecret: '',
    mnemonic: '',
    passphrase: '',
  });

  const handleConnect = useCallback(async () => {
    try {
      setError(null);
      await walletActions.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to network');
    }
  }, [walletActions]);

  const loadWallets = useCallback(async () => {
    try {
      setError(null);
      const wallets = await walletActions.listWallets();
      setAvailableWallets(wallets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallets');
    }
  }, [walletActions]);

  // Load available wallets when dialog opens (independent of network connection)
  useEffect(() => {
    if (isOpen) {
      void loadWallets();
    }
  }, [isOpen, loadWallets]);

  // Connect to network if not connected
  useEffect(() => {
    if (isOpen && !walletState.isConnected && !walletState.isConnecting) {
      void handleConnect();
    }
  }, [isOpen, walletState.isConnected, walletState.isConnecting, handleConnect]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('select');
      setSelectedWallet(null);
      setOpenWalletSecret('');
      setError(null);
    }
  }, [isOpen]);

  const handleWalletUnlocked = useCallback(() => {
    onClose();
    onWalletUnlocked?.();
  }, [onClose, onWalletUnlocked]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        title="Wallet Management"
        subtitle="Connect, create, or import a wallet"
        alignTop
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {!walletState.isConnected ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Connecting to {walletState.currentNetwork || APP_CONFIG.defaultNetwork} network...
              </p>
              {walletState.isConnecting && (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-emerald-600"></div>
                  <span className="text-sm">Connecting...</span>
                </div>
              )}
              {!walletState.isConnecting && (
                <Button onClick={handleConnect} disabled={isLoading}>
                  Retry Connection
                </Button>
              )}
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(value: string) => {
                setActiveTab(value as 'select' | 'create' | 'import');
                // Reset wallet detail view when switching tabs
                if (value === 'select') {
                  setSelectedWallet(null);
                  setOpenWalletSecret('');
                }
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="select">Connected</TabsTrigger>
                <TabsTrigger value="create">Create Wallet</TabsTrigger>
                <TabsTrigger value="import">Import Wallet</TabsTrigger>
              </TabsList>

              <TabsContent value="select" className="mt-4 space-y-4">
                <WalletSelectTab
                  availableWallets={availableWallets}
                  selectedWallet={selectedWallet}
                  setSelectedWallet={setSelectedWallet}
                  openWalletSecret={openWalletSecret}
                  setOpenWalletSecret={setOpenWalletSecret}
                  deletingWallet={deletingWallet}
                  setDeletingWallet={setDeletingWallet}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  setError={setError}
                  loadWallets={loadWallets}
                  onClose={handleWalletUnlocked}
                  setActiveTab={setActiveTab}
                />
              </TabsContent>

              <TabsContent value="create" className="mt-4 space-y-4">
                <WalletCreateTab
                  createForm={createForm}
                  setCreateForm={setCreateForm}
                  availableWallets={availableWallets}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  setError={setError}
                  onClose={handleWalletUnlocked}
                />
              </TabsContent>

              <TabsContent value="import" className="mt-4 space-y-4">
                <WalletImportTab
                  importForm={importForm}
                  setImportForm={setImportForm}
                  availableWallets={availableWallets}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  setError={setError}
                  onClose={handleWalletUnlocked}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
