// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('copyText', () => {
  it('uses the Clipboard API on a secure page', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await copyText('https://example.test/join?invite=abc');
    expect(writeText).toHaveBeenCalledWith('https://example.test/join?invite=abc');
  });

  it('falls back to the copy command on a plain-http page, where there is no Clipboard API', async () => {
    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    await copyText('link');
    expect(exec).toHaveBeenCalledWith('copy');
    // the hidden field is gone again
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('fails when the browser refuses both', async () => {
    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    await expect(copyText('link')).rejects.toThrow(/blocked/);
  });
});
