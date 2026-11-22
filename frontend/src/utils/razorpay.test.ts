import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadScript } from './scriptLoader';
import { loadRazorpay } from './razorpay';

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

describe('loadRazorpay', () => {
  it('evicts the cache when the global is missing so a retry loads again', async () => {
    const first = loadRazorpay();
    document.querySelector('script')!.onload!(new Event('load'));
    await expect(first).rejects.toThrow(/unavailable/);
    const second = loadRazorpay();
    expect(document.querySelectorAll('script')).toHaveLength(1);
    document.querySelector('script')!.onerror!(new Event('error'));
    await expect(second).rejects.toThrow();
  });
});
