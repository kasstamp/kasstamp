/**
 * @fileoverview Wallet Feature Type Definitions
 */

import type { WalletDescriptor } from '@kasstamp/sdk';

export interface WalletConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface CreateWalletFormData {
  walletName: string;
  walletSecret: string;
  words: 12 | 15 | 18 | 21 | 24;
  passphrase: string;
  useBip39: boolean;
}

export interface ImportWalletFormData {
  walletName: string;
  walletSecret: string;
  mnemonic: string;
  passphrase: string;
}

export interface WalletTabProps {
  onClose: () => void;
  onWalletAction?: () => void;
}

export interface WalletSelectTabProps extends WalletTabProps {
  availableWallets: WalletDescriptor[];
  selectedWallet: string | null;
  setSelectedWallet: (id: string | null) => void;
  openWalletSecret: string;
  setOpenWalletSecret: (secret: string) => void;
  deletingWallet: string | null;
  setDeletingWallet: (id: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  loadWallets: () => Promise<void>;
}

export interface WalletCreateTabProps extends WalletTabProps {
  createForm: CreateWalletFormData;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateWalletFormData>>;
  generatedMnemonic: string | null;
  setGeneratedMnemonic: (mnemonic: string | null) => void;
  hasWrittenDown: boolean;
  setHasWrittenDown: (value: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

export interface WalletImportTabProps extends WalletTabProps {
  importForm: ImportWalletFormData;
  setImportForm: React.Dispatch<React.SetStateAction<ImportWalletFormData>>;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}
