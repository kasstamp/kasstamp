/**
 * @fileoverview Jest Mock for @kasstamp/kaspa_wasm_sdk
 *
 * This mock avoids import.meta issues in Jest and provides minimal
 * implementations needed for unit tests.
 */

/* eslint-disable no-unused-vars */

// Mock NetworkId enum
const NetworkId = {
  Mainnet: 'mainnet',
  Testnet: 'testnet-10',
  toString() {
    return this.Mainnet;
  },
};

// Mock initKaspaWasm
async function initKaspaWasm() {
  return Promise.resolve();
}

// Mock getKaspaWasm
async function getKaspaWasm() {
  return {
    NetworkId,
  };
}

// Mock PendingTransaction class
class PendingTransaction {
  constructor() {
    this.id = 'mock-tx-id';
  }
  sign(_privateKeys) {
    return Promise.resolve();
  }
}

// Mock PrivateKey class
class PrivateKey {
  constructor(data) {
    this._data = data;
    // Ensure unique string representation based on data
    if (typeof data === 'string') {
      // Create a hex string from the data
      const crypto = require('crypto');
      this._hex = crypto.createHash('sha256').update(data).digest('hex');
    } else if (Buffer.isBuffer(data)) {
      this._hex = data.toString('hex');
    } else {
      this._hex = 'mock-private-key';
    }
  }
  toString() {
    return this._hex;
  }
  toPublicKey() {
    return { toString: () => `mock-public-key-${this._hex.substring(0, 8)}` };
  }
}

// Mock Mnemonic class
class Mnemonic {
  constructor(phrase) {
    this._phrase = phrase;
  }
  toSeed(passphrase = '') {
    // Return a mock 64-byte seed (hex string)
    // Use phrase + passphrase to create deterministic but different seeds
    const combined = `${this._phrase}::${passphrase}`;
    const crypto = require('crypto');
    const hash = crypto.createHash('sha512'); // Use SHA-512 for 64-byte output
    hash.update(combined);
    return hash.digest('hex');
  }
  toString() {
    return this._phrase;
  }
}

// Mock XPrv class (Extended Private Key)
class XPrv {
  constructor(seed, derivationPath = '') {
    this._seed = seed;
    this._derivationPath = derivationPath;
  }
  static fromSeed(seed) {
    return new XPrv(seed, 'root');
  }
  deriveChild(index, hardened = false) {
    // Create a truly different derived seed using crypto hash
    // This ensures different derivation paths produce incompatible keys
    const crypto = require('crypto');
    const newPath = `${this._derivationPath}/${index}${hardened ? "'" : ''}`;
    const hash = crypto.createHash('sha256');
    hash.update(this._seed);
    hash.update(newPath);
    const derivedSeed = hash.digest('hex');
    return new XPrv(derivedSeed, newPath);
  }
  toPrivateKey() {
    // Return mock private key data
    // Use the full seed to ensure different derivation paths = different keys
    return new PrivateKey(this._seed + this._derivationPath);
  }
}

// Mock PrivateKeyGenerator class
class PrivateKeyGenerator {
  constructor(xprv, isMultisig = false, accountIndex = 0n) {
    this._xprv = xprv;
    this._isMultisig = isMultisig;
    this._accountIndex = typeof accountIndex === 'bigint' ? Number(accountIndex) : accountIndex;
  }
  receiveKey(index) {
    // Derive through account index first: m/44'/111111'/accountIndex'/0/addressIndex
    return this._xprv
      .deriveChild(44, true)
      .deriveChild(111111, true)
      .deriveChild(this._accountIndex, true)
      .deriveChild(0)
      .deriveChild(index)
      .toPrivateKey();
  }
  changeKey(index) {
    // Derive through account index first: m/44'/111111'/accountIndex'/1/addressIndex
    return this._xprv
      .deriveChild(44, true)
      .deriveChild(111111, true)
      .deriveChild(this._accountIndex, true)
      .deriveChild(1)
      .deriveChild(index)
      .toPrivateKey();
  }
}

// Mock PublicKeyGenerator class
class PublicKeyGenerator {
  constructor() {}
}

// Mock Address class
class Address {
  constructor(address) {
    this._address = address;
  }
  toString() {
    return this._address || 'mock-address';
  }
}

// Mock Wallet class
class Wallet {
  constructor() {}
}

// Mock RpcClient class
class RpcClient {
  constructor() {}
}

// Mock UtxoContext class
class UtxoContext {
  constructor() {}
}

// Mock UtxoProcessor class
class UtxoProcessor {
  constructor() {}
}

// Mock UtxoEntry class
class UtxoEntry {
  constructor() {}
}

// Mock UtxoEntryReference class
class UtxoEntryReference {
  constructor() {}
}

// Mock utility functions
function getUtxoProcessor() {
  return new UtxoProcessor();
}

function getUtxoContext() {
  return new UtxoContext();
}

// CommonJS exports for Jest
module.exports = {
  initKaspaWasm,
  getKaspaWasm,
  NetworkId,
  PendingTransaction,
  PrivateKey,
  Mnemonic,
  XPrv,
  PrivateKeyGenerator,
  PublicKeyGenerator,
  Address,
  Wallet,
  RpcClient,
  UtxoContext,
  UtxoProcessor,
  UtxoEntry,
  UtxoEntryReference,
  getUtxoProcessor,
  getUtxoContext,
};
