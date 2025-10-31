/**
 * @fileoverview React hook for wallet management
 *
 * Provides a clean React interface to the wallet service
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  walletService,
  type WalletServiceEvent,
  type WalletServiceEventData,
} from '@/features/wallet/services';
import type { WalletDescriptor, IAccountDescriptor, SimpleWallet } from '@kasstamp/sdk';
import { hookLogger } from '@/core/utils/logger';

export interface WalletState {
  isConnected: boolean;
  isInitialized: boolean;
  isConnecting: boolean;
  currentNetwork: string;
  hasWallet: boolean;
  walletLocked: boolean;
  address: string | null;
  balance: string | null;
  accounts: IAccountDescriptor[];
  lastSyncTime: Date | null;
  error: string | null;
  walletName?: string | null;
}

export interface WalletActions {
  connect: (network?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  createWallet: (params: {
    walletName: string;
    walletSecret: string;
    words?: 12 | 15 | 18 | 21 | 24;
    passphrase?: string;
    network?: string;
  }) => Promise<{ wallet: SimpleWallet; mnemonic: string }>;
  importWallet: (params: {
    mnemonic: string;
    walletName: string;
    walletSecret: string;
    passphrase?: string;
    network?: string;
  }) => Promise<void>;
  openExistingWallet: (walletName: string, walletSecret: string) => Promise<void>;
  listWallets: () => Promise<WalletDescriptor[]>;
  deleteWallet: (walletName: string) => Promise<void>;
  renameWallet: (oldName: string, newName: string) => Promise<void>;
  getBalance: () => Promise<string>;
  refreshBalance: () => Promise<void>;
}

const initialState: WalletState = {
  isConnected: false,
  isInitialized: false,
  isConnecting: false,
  currentNetwork: '',
  hasWallet: false,
  walletLocked: true,
  address: null,
  balance: null,
  accounts: [],
  lastSyncTime: null,
  error: null,
};

export function useWallet(): [WalletState, WalletActions] {
  const [state, setState] = useState<WalletState>(initialState);
  const [isConnecting, setIsConnecting] = useState(false);
  const eventListenersRef = useRef<
    Array<{
      event: WalletServiceEvent;
      callback: (data: WalletServiceEventData[WalletServiceEvent]) => void;
    }>
  >([]);

  // Helper to update state from wallet service
  const updateStateFromService = useCallback(async () => {
    const serviceState = walletService.getState();

    // CRITICAL: For address, try to get primary address from wallet instead of account descriptor
    // The account descriptor address may change after address discovery, but primary address is stable
    let address = serviceState.address;
    const wallet = walletService.getCurrentWallet();
    if (wallet && !wallet.signingEnclave.isLocked()) {
      try {
        const primaryAddresses = await wallet.getPrimaryAddresses();
        address = primaryAddresses.receiveAddress;
      } catch {
        // If wallet is locked or error, fall back to serviceState.address
      }
    }

    setState((prevState) => ({
      ...prevState,
      isConnected: serviceState.isConnected,
      isInitialized: serviceState.isInitialized,
      currentNetwork: serviceState.currentNetwork.toString(),
      hasWallet: serviceState.hasWallet,
      walletLocked: serviceState.walletLocked,
      address: address, // Use primary address instead of account descriptor address
      walletName: serviceState.walletName,
      balance: serviceState.balance,
    }));
  }, []);

  // Set up event listeners
  useEffect(() => {
    const addEventListener = <T extends WalletServiceEvent>(
      event: T,
      callback: (data: WalletServiceEventData[T]) => void
    ) => {
      walletService.addEventListener(event, callback);
      // Store with union type - safe because we only retrieve and call with matching event type
      eventListenersRef.current.push({
        event,
        callback: callback as (data: WalletServiceEventData[WalletServiceEvent]) => void,
      });
    };

    // Set up event listeners
    addEventListener('connected', (data) => {
      hookLogger.info('✅ Wallet connected:', data);
      setIsConnecting(false);
      setState((prevState) => ({
        ...prevState,
        isConnected: true,
        isConnecting: false,
        currentNetwork: data.network,
        error: null,
      }));
    });

    addEventListener('disconnected', () => {
      hookLogger.info('❌ Wallet disconnected');
      setState((prevState) => ({
        ...initialState,
        // Preserve the network so UI shows correct network after disconnect/lock
        currentNetwork: prevState.currentNetwork,
      }));
    });

    addEventListener('wallet-created', (data) => {
      // SECURITY: Never log the mnemonic!
      hookLogger.info('✅ Wallet created:', { address: data.address, walletName: data.walletName });
      void updateStateFromService();
    });

    addEventListener('wallet-imported', (data) => {
      hookLogger.info('✅ Wallet imported:', data);
      // CRITICAL: Use the primary address from the event data directly
      // The event already contains the correct primary address from WalletService
      // Don't call updateStateFromService() which may overwrite with account descriptor address
      const serviceState = walletService.getState();
      const primaryAddress = data.address; // Store the primary address from event (stable)

      // Update state with primary address from event - this is the canonical address
      setState((prevState) => ({
        ...prevState,
        isConnected: serviceState.isConnected,
        isInitialized: serviceState.isInitialized,
        currentNetwork: serviceState.currentNetwork.toString(),
        hasWallet: serviceState.hasWallet,
        walletLocked: serviceState.walletLocked,
        address: primaryAddress, // Use primary address from event (stable, never changes)
        walletName: serviceState.walletName || data.walletName,
        balance: serviceState.balance,
      }));

      // Log verification
      setTimeout(() => {
        hookLogger.info('📊 State after wallet-imported event:', {
          walletName: serviceState.walletName,
          hasWallet: serviceState.hasWallet,
          walletLocked: serviceState.walletLocked,
          stateAddress: primaryAddress,
          eventAddress: primaryAddress,
          addressesMatch: true,
          note: 'Using primary address from event (stable, derived from mnemonic at index 0)',
        });
      }, 100);
    });

    addEventListener('wallet-opened', (data) => {
      hookLogger.info('✅ Wallet opened:', data);
      // CRITICAL: Use the primary address from the event data directly
      // Same as wallet-imported, to ensure consistency
      const serviceState = walletService.getState();
      const primaryAddress = data.address; // Store the primary address from event (stable)

      // Update state with primary address from event
      setState((prevState) => ({
        ...prevState,
        isConnected: serviceState.isConnected,
        isInitialized: serviceState.isInitialized,
        currentNetwork: serviceState.currentNetwork.toString(),
        hasWallet: serviceState.hasWallet,
        walletLocked: serviceState.walletLocked,
        address: primaryAddress, // Use primary address from event (stable, never changes)
        walletName: serviceState.walletName || data.walletName,
        balance: serviceState.balance,
      }));
    });

    addEventListener('balance-updated', (data) => {
      hookLogger.info('💰 Balance updated:', data);
      setState((prevState) => ({
        ...prevState,
        balance: data.balance,
      }));
    });

    addEventListener('transaction-sent', (data) => {
      hookLogger.info('💸 Transaction sent:', data);
      // Could trigger balance refresh here
    });

    addEventListener('transaction-error', (data) => {
      hookLogger.error('❌ Transaction error:', data);
      setState((prevState) => ({
        ...prevState,
        error: data.error,
      }));
    });

    addEventListener('error', (error) => {
      hookLogger.error('❌ Wallet service error:', error as Error);
      setIsConnecting(false);
      setState((prevState) => ({
        ...prevState,
        error: error?.message || 'Unknown error occurred',
        isConnecting: false,
      }));
    });

    // Initial state update
    void updateStateFromService();

    // Cleanup function
    return () => {
      eventListenersRef.current.forEach(({ event, callback }) => {
        // Safe to cast back - we're passing the same callback to remove that we added
        walletService.removeEventListener(
          event,
          callback as (data: WalletServiceEventData[typeof event]) => void
        );
      });
      eventListenersRef.current = [];
    };
  }, [updateStateFromService]);

  // Actions - memoize to prevent infinite loops in components that depend on them
  const actions: WalletActions = useMemo(
    () => ({
      connect: async (network?: string) => {
        try {
          setIsConnecting(true);
          setState((prevState) => ({
            ...prevState,
            isConnecting: true,
            error: null,
          }));
          await walletService.connect(network);
        } catch (error) {
          setIsConnecting(false);
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to connect',
            isConnecting: false,
          }));
          throw error;
        }
      },

      disconnect: async () => {
        try {
          await walletService.disconnect();
        } catch (error) {
          hookLogger.error('Error disconnecting:', error as Error);
          // Still reset state even if disconnect fails
          setState(initialState);
          throw error;
        }
      },

      createWallet: async (params) => {
        try {
          setState((prevState) => ({ ...prevState, error: null }));
          const result = await walletService.createWallet(
            params.walletName,
            params.walletSecret,
            params.words,
            params.passphrase,
            params.network
          );
          void updateStateFromService();
          return result;
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to create wallet',
          }));
          throw error;
        }
      },

      importWallet: async (params) => {
        try {
          setState((prevState) => ({ ...prevState, error: null }));
          await walletService.importWallet(
            params.mnemonic,
            params.walletName,
            params.walletSecret,
            params.passphrase,
            params.network
          );
          void updateStateFromService();
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to import wallet',
          }));
          throw error;
        }
      },

      openExistingWallet: async (walletName: string, walletSecret: string) => {
        try {
          setState((prevState) => ({ ...prevState, error: null }));
          await walletService.openExistingWallet(walletName, walletSecret);
          void updateStateFromService();
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to open wallet',
          }));
          throw error;
        }
      },

      listWallets: async () => {
        try {
          return await walletService.listWallets();
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to list wallets',
          }));
          throw error;
        }
      },

      deleteWallet: async (walletName: string) => {
        try {
          await walletService.deleteWallet(walletName);
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to delete wallet',
          }));
          throw error;
        }
      },

      renameWallet: async (oldName: string, newName: string) => {
        try {
          await walletService.renameWallet(oldName, newName);
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to rename wallet',
          }));
          throw error;
        }
      },

      getBalance: async () => {
        try {
          return await walletService.getBalance();
        } catch (error) {
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to get balance',
          }));
          throw error;
        }
      },

      refreshBalance: async () => {
        try {
          const balance = await walletService.getBalance();
          setState((prevState) => ({
            ...prevState,
            balance,
          }));
        } catch (error) {
          hookLogger.error('Error refreshing balance:', error as Error);
          setState((prevState) => ({
            ...prevState,
            error: error instanceof Error ? error.message : 'Failed to refresh balance',
          }));
        }
      },
    }),
    [updateStateFromService]
  );

  // Merge isConnecting state
  const finalState: WalletState = {
    ...state,
    isConnecting,
  };

  return [finalState, actions];
}
