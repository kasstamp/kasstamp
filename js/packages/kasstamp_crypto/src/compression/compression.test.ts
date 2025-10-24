import { gzipBytes, gunzipBytes } from './index';

test('gzipBytes/gunzipBytes roundtrip', async () => {
  const data = new TextEncoder().encode('some data to compress');
  const gz = await gzipBytes(data);
  const back = await gunzipBytes(gz);
  expect(new TextDecoder().decode(back)).toBe('some data to compress');
});
