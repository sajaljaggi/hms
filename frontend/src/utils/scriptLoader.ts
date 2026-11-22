const cache = new Map<string, Promise<void>>();

// Cached per URL; a failed load is evicted so a later call can retry.
export function loadScript(src: string): Promise<void> {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { el.remove(); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(el);
  });
  p.catch(() => cache.delete(src));
  cache.set(src, p);
  return p;
}

// For callers whose script loaded but did not define the expected global.
export const evictScript = (src: string) => { cache.delete(src); document.querySelectorAll('script').forEach(el => { if (el.src === src) el.remove(); }); };
