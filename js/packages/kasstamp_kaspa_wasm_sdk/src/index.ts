/**
 * Kaspa WASM SDK Bridge
 *
 * Pure WASM bindings for kaspa-wasm from rusty-kaspa.
 * This package ONLY provides low-level WASM access.
 *
 * For enterprise usage, use @kasstamp/sdk instead.
 */

import { detectPlatform } from './platform';
import type {
  RpcClient,
  Resolver,
  Encoding,
  NetworkId,
  UtxoContext,
  UtxoProcessor,
  UtxoEntry,
  UtxoEntries,
  UtxoEntryReference,
  Balance,
  SyncInitInput,
  InitOutput,
} from './types';

export type { IUtxosChanged, IBlockAdded } from './types';

interface KaspaWasmModule {
  default: (
    module_or_path?: { module_or_path: string } | string | Promise<string>
  ) => Promise<InitOutput>;
  RpcClient: typeof RpcClient;
  Resolver: typeof Resolver;
  Encoding: typeof Encoding;
  NetworkId: typeof NetworkId;
  UtxoContext: typeof UtxoContext;
  UtxoProcessor: typeof UtxoProcessor;
  UtxoEntry: typeof UtxoEntry;
  UtxoEntries: typeof UtxoEntries;
  UtxoEntryReference: typeof UtxoEntryReference;
  Balance: typeof Balance;

  Address: any;
  Generator: any;
  PaymentOutput: any;
  PendingTransaction: any;
  PrivateKeyGenerator: any;
  PublicKeyGenerator: any;
  Mnemonic: any;
  initSync: (module: { module: SyncInitInput } | SyncInitInput) => InitOutput;
}

let wasmModule: KaspaWasmModule | null = null;
let isInitialized = false;

/**
 * Get the WASM binary URL for the current platform
 */
function getWasmUrl(): string {
  const platform = detectPlatform();

  if (platform === 'node') {
    // In Node.js, use the nodejs WASM file
    return new URL('../nodejs/kaspa_bg.wasm', import.meta.url).href;
  } else {
    // In browser/webworker, use the web WASM file
    return new URL('../web/kaspa_bg.wasm', import.meta.url).href;
  }
}

/**
 * Load the appropriate WASM module for the current platform
 */
async function loadWasmModule(): Promise<KaspaWasmModule> {
  if (wasmModule) {
    return wasmModule;
  }

  const platform = detectPlatform();

  try {
    if (platform === 'node') {
      // In Node.js, import the nodejs version
      const module = await import('../nodejs/kaspa.js');
      wasmModule = module;
    } else {
      // In browser/webworker, import the web version
      const module = await import('../web/kaspa.js');
      wasmModule = module;
    }

    return wasmModule;
  } catch (error) {
    throw new Error(`Failed to load kaspa-wasm for platform ${platform}: ${error}`);
  }
}

/**
 * Initialize the WASM module
 * This should be called before using any WASM functionality
 */
export async function initKaspaWasm(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const module = await loadWasmModule();

  // Initialize with the appropriate WASM binary URL
  if (typeof module.default === 'function') {
    const wasmBinaryUrl = getWasmUrl();
    // Use new wasm-bindgen API (single object parameter)
    await module.default({ module_or_path: wasmBinaryUrl });
  }

  isInitialized = true;
}

/**
 * Get the WASM module (automatically loads if not already loaded)
 */
export async function getKaspaWasm(): Promise<KaspaWasmModule> {
  const module = await loadWasmModule();
  return module;
}

export async function getAddress(): Promise<any> {
  const module = await getKaspaWasm();
  return module.Address;
}

export async function getGenerator(): Promise<any> {
  const module = await getKaspaWasm();
  return module.Generator;
}

export async function getPaymentOutput(): Promise<any> {
  const module = await getKaspaWasm();
  return module.PaymentOutput;
}

export async function getPendingTransaction(): Promise<any> {
  const module = await getKaspaWasm();
  return module.PendingTransaction;
}

export async function getPrivateKeyGenerator(): Promise<any> {
  const module = await getKaspaWasm();
  return module.PrivateKeyGenerator;
}

export async function getPublicKeyGenerator(): Promise<any> {
  const module = await getKaspaWasm();
  return module.PublicKeyGenerator;
}

// For now, direct re-exports (will be replaced with proper types later)
export {
  Address,
  Generator,
  PaymentOutput,
  PendingTransaction,
  PrivateKey,
  PrivateKeyGenerator,
  PublicKeyGenerator,
  UtxoContext,
  UtxoProcessor,
  UtxoEntry,
  UtxoEntryReference,
  NetworkId,
  Wallet,
  RpcClient,
  Resolver,
  Encoding,
  Mnemonic,
  XPrv, // <-- Added for mnemonic → private key derivation
  ConnectStrategy,
  // Address creation functions
  createAddress,
  addressFromScriptPublicKey,
  payToAddressScript,
  NetworkType,
  // Transaction mass and fee calculation functions
  calculateStorageMass,
  calculateTransactionMass,
  calculateTransactionFee,
  updateTransactionMass,
  maximumStandardTransactionMass,
  // Transaction creation functions
  createTransaction,
  createTransactions,
  estimateTransactions,
  // Transaction Generator (advanced UTXO selection and batching) - GeneratorSummary is new
  GeneratorSummary,
  // Conversion utilities
  sompiToKaspaString,
  sompiToKaspaStringWithSuffix,
  kaspaToSompi,
  // Payment outputs
  PaymentOutputs,
} from '../web/kaspa.js';

// Legacy async functions for backward compatibility
export async function getRpcClient(): Promise<typeof RpcClient> {
  const module = await getKaspaWasm();
  return module.RpcClient;
}

export async function getResolver(): Promise<typeof Resolver> {
  const module = await getKaspaWasm();
  return module.Resolver;
}

export async function getEncoding(): Promise<typeof Encoding> {
  const module = await getKaspaWasm();
  return module.Encoding;
}

export async function getNetworkId(): Promise<typeof NetworkId> {
  const module = await getKaspaWasm();
  return module.NetworkId;
}

export async function getInitSync(): Promise<
  (module: { module: SyncInitInput } | SyncInitInput) => InitOutput
> {
  const module = await getKaspaWasm();
  return module.initSync;
}

// UTXO-related exports (the missing pieces!)
export async function getUtxoContext(): Promise<typeof UtxoContext> {
  const module = await getKaspaWasm();
  return module.UtxoContext;
}

export async function getUtxoProcessor(): Promise<typeof UtxoProcessor> {
  const module = await getKaspaWasm();
  return module.UtxoProcessor;
}

export async function getUtxoEntry(): Promise<typeof UtxoEntry> {
  const module = await getKaspaWasm();
  return module.UtxoEntry;
}

export async function getUtxoEntries(): Promise<typeof UtxoEntries> {
  const module = await getKaspaWasm();
  return module.UtxoEntries;
}

export async function getUtxoEntryReference(): Promise<typeof UtxoEntryReference> {
  const module = await getKaspaWasm();
  return module.UtxoEntryReference;
}

export async function getBalance(): Promise<typeof Balance> {
  const module = await getKaspaWasm();
  return module.Balance;
}

// Note: IUtxosChanged and IBlockAdded are TypeScript interfaces, not runtime objects
// They are exported as types above for use in type annotations

// Platform information
export { detectPlatform, isBrowser, isNode, isWebWorker } from './platform';
export type { Platform } from './platform';

export * from './types';

// Default export for compatibility
export default {
  initKaspaWasm,
  getKaspaWasm,
  getRpcClient,
  getResolver,
  getEncoding,
  getNetworkId,
  getInitSync,
  getUtxoContext,
  getUtxoProcessor,
  getUtxoEntry,
  getUtxoEntries,
  getUtxoEntryReference,
  getBalance,
  detectPlatform,
};
