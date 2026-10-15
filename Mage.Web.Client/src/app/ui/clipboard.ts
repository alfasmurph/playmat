/**
 * Copies text to the clipboard. The Clipboard API exists only on secure pages (https, localhost); a page opened over
 * plain http (a LAN or tailnet address) falls back to the older copy command on a hidden text field. Call it straight
 * from the click: the fallback needs the click's user gesture.
 */
export function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      if (!copyWithCommand(text)) throw new Error('The browser blocked the clipboard.');
    });
  }
  return copyWithCommand(text) ? Promise.resolve() : Promise.reject(new Error('The browser blocked the clipboard.'));
}

function copyWithCommand(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  // off screen, and 16px so iOS doesn't zoom in on it
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px';
  document.body.appendChild(field);
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  focused?.focus();
  return copied;
}
