import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadScript } from './scriptLoader';

afterEach(() => { document.head.innerHTML = ''; vi.restoreAllMocks(); });

describe('loadScript', () => {
  it('caches successful loads', () => {
    const a = loadScript('https://x.test/a.js');
    expect(loadScript('https://x.test/a.js')).toBe(a);
    document.querySelector('script')!.onload!(new Event('load'));
  });
  it('rejects on error and allows a retry', async () => {
    const a = loadScript('https://x.test/b.js');
    document.querySelector('script')!.onerror!(new Event('error'));
    await expect(a).rejects.toThrow();
    await Promise.resolve();
    expect(loadScript('https://x.test/b.js')).not.toBe(a);
  });
});
