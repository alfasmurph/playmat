// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

async function publicOrigin(meta: string | null) {
  document.head.querySelectorAll('meta[name="playmat-public-origin"]').forEach((node) => node.remove());
  if (meta !== null) {
    const node = document.createElement('meta');
    node.name = 'playmat-public-origin';
    node.content = meta;
    document.head.appendChild(node);
  }
  vi.resetModules();
  return (await import('./brand')).PUBLIC_ORIGIN;
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="playmat-public-origin"]').forEach((node) => node.remove());
});

describe('PUBLIC_ORIGIN', () => {
  it('is the address the page names (the desktop app behind a Tailscale Funnel)', async () => {
    expect(await publicOrigin('https://mac.tail1234.ts.net')).toBe('https://mac.tail1234.ts.net');
  });

  it("is the page's own origin when the page names none, or names something that isn't a plain https origin", async () => {
    expect(await publicOrigin(null)).toBe(window.location.origin);
    expect(await publicOrigin('javascript:alert(1)')).toBe(window.location.origin);
    expect(await publicOrigin('http://mac.tail1234.ts.net')).toBe(window.location.origin);
    expect(await publicOrigin('https://evil.example/path')).toBe(window.location.origin);
  });
});
