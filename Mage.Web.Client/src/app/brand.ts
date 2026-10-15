/**
 * Product name shown in the UI (see PRODUCT.md). It is a build setting: VITE_APP_NAME, "Playmat" when unset. The page
 * title in index.html reads the same variable.
 */
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'Playmat';

/** True in the packaged Android app (the `android` build mode, .env.android): its shell ships inside the app. */
export const NATIVE_APP = import.meta.env.VITE_NATIVE === '1';

/**
 * Where the site lives, for links people share (table and server invites, the deck bookmarklet). The packaged app runs
 * from https://localhost, so its build names the site (VITE_PUBLIC_ORIGIN); a server that also publishes the client
 * somewhere else (the desktop app behind a Tailscale Funnel, opened on its LAN address) names it in the page
 * (<meta name="playmat-public-origin">); otherwise the page's own origin.
 */
export const PUBLIC_ORIGIN = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim().replace(/\/+$/, '')
  || pageOrigin()
  || (typeof window === 'undefined' ? '' : window.location.origin);

function pageOrigin(): string {
  if (typeof document === 'undefined') return '';
  const named = document.querySelector('meta[name="playmat-public-origin"]')?.getAttribute('content')?.trim() ?? '';
  // only a plain https origin: nothing a page could turn into a link elsewhere
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(named) ? named : '';
}
