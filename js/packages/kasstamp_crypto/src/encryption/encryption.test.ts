import { deriveKeyFromPrivateKey, encryptBytes, decryptBytes } from './index';

test('deriveKeyFromPrivateKey and encrypt/decrypt roundtrip', async () => {
  // Generate a mock private key (32 bytes)
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    privateKey[i] = i;
  }

  const salt = 'test-salt-123';
  const key = await deriveKeyFromPrivateKey(privateKey, salt);

  const msg = new TextEncoder().encode('secret message!');
  const encrypted = await encryptBytes(msg, key);
  const decrypted = await decryptBytes(encrypted, key);

  expect(new TextDecoder().decode(decrypted)).toBe('secret message!');
});
