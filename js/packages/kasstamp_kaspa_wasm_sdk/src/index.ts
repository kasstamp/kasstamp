/**
 * Kaspa WASM SDK Bridge
 *
 * Pure WASM bindings for kaspa-wasm from rusty-kaspa.
 * This package ONLY provides low-level WASM access.
 *
 * For enterprise usage, use @kasstamp/sdk instead.
 */
import initWasm from './kaspa.js';

/**
 * Call this once before using any wasm function.
 * It initializes the WebAssembly module.
 */
export async function initKaspaWasm(): Promise<void> {
  if (!wasmInit) {
    const wasmUrl = new URL('./kaspa_bg.wasm', import.meta.url).href;
    wasmInit = initWasm(wasmUrl).then(() => {});
  }
  return wasmInit;
}

let wasmInit: Promise<void> | null = null;

// Re-export all wasm-bindgen functions
export * from './kaspa.js';

// Re-export all generated types
export type * from './kaspa.d.ts';
