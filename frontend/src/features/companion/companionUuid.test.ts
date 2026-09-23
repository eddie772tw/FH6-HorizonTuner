import { afterEach, expect, it, vi } from 'vitest';
import { companionUuid } from './companionUuid';

afterEach(() => vi.unstubAllGlobals());

it('creates a version 4 id when randomUUID is unavailable on an HTTP LAN origin', () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  });
  expect(companionUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
});
