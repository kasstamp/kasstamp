// Polyfill crypto.getRandomValues for Node.js test environment
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('node:crypto');
  globalThis.crypto = webcrypto;
}

// Ensure crypto.getRandomValues is available
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  const { randomBytes } = require('node:crypto');
  globalThis.crypto.getRandomValues = (array) => {
    const bytes = randomBytes(array.length);
    array.set(bytes);
    return array;
  };
}

// Additional polyfills for noble libraries
if (typeof globalThis.crypto.subtle === 'undefined') {
  const { webcrypto } = require('node:crypto');
  globalThis.crypto.subtle = webcrypto.subtle;
}
