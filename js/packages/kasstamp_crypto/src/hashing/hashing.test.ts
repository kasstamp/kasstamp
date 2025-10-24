import { sha256Hex } from './index';

test('sha256Hex matches known vector', async () => {
  const msg = new TextEncoder().encode('hello');
  const hex = await sha256Hex(msg);
  expect(hex).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
