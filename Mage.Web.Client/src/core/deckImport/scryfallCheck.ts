import type { CardView } from '../../protocol/generated/views';
import { configuredImageProxy, proxiedScryfallUrl } from '../images/imageProxy';
import { foldName, type CardLookup } from './resolve';

/**
 * Why an imported line matched nothing, told apart with Scryfall: a real card the card database can't play yet, a
 * misspelling (or another name for a card the database has), or a name Magic doesn't know.
 */
export type MissingVerdict =
  /** a real card the card database doesn't have: XMage hasn't implemented it */
  | { kind: 'unplayable'; name: string }
  /** a real card the database has under this name: a typo, a flavor name, a Universes Beyond name */
  | { kind: 'suggest'; name: string; card: CardView }
  /** Scryfall doesn't know the name either */
  | { kind: 'unknown' }
  /** Scryfall couldn't be reached: nothing more to say than before */
  | { kind: 'unchecked' };

interface ScryfallCard {
  name?: string;
}

const COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const NAMED_URL = 'https://api.scryfall.com/cards/named';
/** Scryfall /cards/collection limit */
const BATCH = 75;
/** fuzzy lookups are one request each: enough for a list's worth of typos, not a flood */
const MAX_FUZZY = 25;
/** Scryfall asks for no more than about ten requests a second */
const SPACING_MS = 110;

export interface ScryfallCheckOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  imageProxy?: string;
}

/** Scryfall's name for each name (exact first, then fuzzy for the rest): null when it has none, absent when unchecked. */
async function canonicalNames(names: string[], options: Required<ScryfallCheckOptions>): Promise<Map<string, string | null> | null> {
  const result = new Map<string, string | null>();
  const url = (link: string) => proxiedScryfallUrl(link, options.imageProxy || undefined);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  try {
    for (let start = 0; start < names.length; start += BATCH) {
      const batch = names.slice(start, start + BATCH);
      if (start > 0) await options.sleep(SPACING_MS);
      const response = await options.fetch(url(COLLECTION_URL), {
        method: 'POST',
        headers,
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name: foldName(name) })) }),
      });
      if (!response.ok) return null;
      const body = await response.json() as { data?: ScryfallCard[]; not_found?: { name?: string }[] };
      const missing = new Set((body.not_found ?? []).map((item) => (item.name ?? '').toLowerCase()));
      // found cards come back in request order, without the ones not found
      const found = [...(body.data ?? [])];
      for (const name of batch) {
        result.set(name, missing.has(foldName(name).toLowerCase()) ? null : found.shift()?.name ?? null);
      }
    }
    let fuzzy = 0;
    for (const name of names) {
      if (result.get(name) !== null) continue;
      // past the cap a name stays unchecked rather than called unknown
      if (fuzzy >= MAX_FUZZY) {
        result.delete(name);
        continue;
      }
      fuzzy += 1;
      await options.sleep(SPACING_MS);
      const link = new URL(NAMED_URL);
      link.searchParams.set('fuzzy', foldName(name));
      const response = await options.fetch(url(link.toString()), { headers: { Accept: 'application/json' } });
      if (response.status === 404) continue;
      if (!response.ok) return null;
      result.set(name, ((await response.json()) as ScryfallCard).name ?? null);
    }
  } catch {
    return null;
  }
  return result;
}

/**
 * A verdict for each name that matched nothing in the card database. Scryfall's name for the card is tried against
 * the card database once more, so a typo or another name for a playable card comes back as a suggestion.
 */
export async function checkMissing(
  names: readonly string[],
  lookup: Pick<CardLookup, 'lookupCards'>,
  options: ScryfallCheckOptions = {},
): Promise<Map<string, MissingVerdict>> {
  const settings: Required<ScryfallCheckOptions> = {
    fetch: options.fetch ?? ((...args) => fetch(...args)),
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    imageProxy: options.imageProxy ?? configuredImageProxy() ?? '',
  };
  const unique = [...new Set(names)];
  const verdicts = new Map<string, MissingVerdict>();
  const canonical = unique.length > 0 ? await canonicalNames(unique, settings) : new Map<string, string | null>();
  if (!canonical) {
    for (const name of unique) verdicts.set(name, { kind: 'unchecked' });
    return verdicts;
  }

  // Scryfall's names the card database might have under that spelling
  const renamed = unique.filter((name) => {
    const real = canonical.get(name);
    return !!real && foldName(real).toLowerCase() !== foldName(name).toLowerCase();
  });
  let found: (CardView | null)[] = [];
  try {
    found = renamed.length > 0
      ? await lookup.lookupCards(renamed.map((name) => ({ cardName: foldName(canonical.get(name)!), setCode: '', cardNumber: '', amount: 1 })))
      : [];
  } catch {
    found = [];
  }
  const playable = new Map(renamed.map((name, index) => [name, found[index] ?? null]));

  for (const name of unique) {
    const real = canonical.get(name);
    const card = playable.get(name);
    if (!canonical.has(name)) verdicts.set(name, { kind: 'unchecked' });
    else if (!real) verdicts.set(name, { kind: 'unknown' });
    else if (card) verdicts.set(name, { kind: 'suggest', name: real, card });
    else verdicts.set(name, { kind: 'unplayable', name: real });
  }
  return verdicts;
}
