import { describe, expect, it } from 'vitest';
import type { CardView, DeckCardInfo } from '../../protocol/generated/views';
import { checkMissing } from './scryfallCheck';

/** Scryfall's side: the names it knows, and what fuzzy matching turns a misspelling into. */
const SCRYFALL = ['Lightning Bolt', 'Kid Loki', 'Dáin Ironfoot'];
const FUZZY: Record<string, string> = { 'lightnig bolt': 'Lightning Bolt', 'kid lokki': 'Kid Loki' };
/** The card database: Kid Loki isn't implemented. */
const DATABASE: CardView[] = [{ name: 'Lightning Bolt', expansionSetCode: 'M11', cardNumber: '149' }];

function fakeScryfall(options: { down?: boolean } = {}) {
  const requests: string[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(`${init?.method ?? 'GET'} ${url}`);
    if (options.down) throw new TypeError('Failed to fetch');
    if (url.endsWith('/cards/collection')) {
      const { identifiers } = JSON.parse(String(init?.body)) as { identifiers: { name: string }[] };
      const known = (name: string) => SCRYFALL.find((real) => real.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === name.toLowerCase());
      return Response.json({
        data: identifiers.filter((id) => known(id.name)).map((id) => ({ name: known(id.name) })),
        not_found: identifiers.filter((id) => !known(id.name)),
      });
    }
    const fuzzy = new URL(url).searchParams.get('fuzzy')!.toLowerCase();
    return FUZZY[fuzzy] ? Response.json({ name: FUZZY[fuzzy] }) : Response.json({ object: 'error' }, { status: 404 });
  }) as typeof fetch;
  return { fetch: fetchStub, requests };
}

const lookup = {
  async lookupCards(cards: DeckCardInfo[]) {
    return cards.map((card) => DATABASE.find((view) => view.name === card.cardName) ?? null);
  },
};
const noWait = { sleep: async () => undefined, imageProxy: '' };

describe('checkMissing', () => {
  it('tells an unimplemented real card from a typo of a playable one and from a made-up name', async () => {
    const scryfall = fakeScryfall();
    const verdicts = await checkMissing(['Kid Loki', 'Lightnig Bolt', 'Kid Lokki', 'Grumbleflorp'], lookup, { ...noWait, fetch: scryfall.fetch });
    expect(verdicts.get('Kid Loki')).toEqual({ kind: 'unplayable', name: 'Kid Loki' });
    expect(verdicts.get('Lightnig Bolt')).toMatchObject({ kind: 'suggest', name: 'Lightning Bolt', card: { expansionSetCode: 'M11' } });
    expect(verdicts.get('Kid Lokki')).toEqual({ kind: 'unplayable', name: 'Kid Loki' });
    expect(verdicts.get('Grumbleflorp')).toEqual({ kind: 'unknown' });
    // one collection request for all four, then fuzzy only for the three it didn't know
    expect(scryfall.requests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
    expect(scryfall.requests.filter((request) => request.includes('fuzzy'))).toHaveLength(3);
  });

  it('matches names written with accents', async () => {
    const verdicts = await checkMissing(['Dáin Ironfoot'], lookup, { ...noWait, fetch: fakeScryfall().fetch });
    expect(verdicts.get('Dáin Ironfoot')).toEqual({ kind: 'unplayable', name: 'Dáin Ironfoot' });
  });

  it('says nothing when Scryfall can’t be reached', async () => {
    const verdicts = await checkMissing(['Kid Loki'], lookup, { ...noWait, fetch: fakeScryfall({ down: true }).fetch });
    expect(verdicts.get('Kid Loki')).toEqual({ kind: 'unchecked' });
  });
});
