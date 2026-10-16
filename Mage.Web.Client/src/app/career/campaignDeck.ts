import type { Bracket, BracketEstimate } from '../../core/decks/bracket';
import type { CareerCampaign, CareerChapter } from '../../protocol/generated/views';
import { bracketOf } from '../stores/brackets';
import type { PreconSet, RosterDeck } from '../stores/decks';
import { PRECON_PREFIX, preconToRoster } from '../stores/decks';
import { readJson, writeJson } from '../stores/persist';

/**
 * Which deck the player takes into a Commander campaign that allows their own (The Commander's Road, Commander
 * Conquest): the chapter's deck by default, else one of their Commander decks or a precon. Remembered per campaign in
 * this browser. A chapter without a deck of its own (Conquest) needs one chosen.
 */
export type CampaignDeck =
  | { kind: 'chapter'; name: string; bracket: Bracket | null }
  | { kind: 'own'; deck: RosterDeck }
  | { kind: 'none' };

const key = (campaignId: string) => `playmat.career.campaignDeck.${campaignId}`;

/** the deck id chosen for a campaign, or null for the chapter's own */
export function readCampaignDeck(campaignId: string): string | null {
  return readJson<string | null>(key(campaignId), null);
}

export function writeCampaignDeck(campaignId: string, deckId: string | null): void {
  writeJson(key(campaignId), deckId);
}

export function asBracket(value: number | null | undefined): Bracket | null {
  return value && value >= 1 && value <= 5 ? (value as Bracket) : null;
}

/** the Commander decks a player can bring: their own (and the ones shared with them), then every precon */
export function commanderChoices(roster: readonly RosterDeck[], precons: readonly PreconSet[]): { mine: RosterDeck[]; precons: RosterDeck[] } {
  const mine = roster.filter((deck) => deck.kind === 'commander' && !deck.precon);
  return { mine, precons: precons.flatMap((set) => set.decks.map((deck) => preconToRoster(set, deck))) };
}

/** the deck the player plays a chapter with, given their choice (an id, or null for the chapter's deck) */
export function campaignDeckOf(
  campaign: Pick<CareerCampaign, 'ownDeck'>,
  chapter: Pick<CareerChapter, 'deckName' | 'deckBracket'>,
  chosenId: string | null,
  choices: { mine: readonly RosterDeck[]; precons: readonly RosterDeck[] },
): CampaignDeck {
  const own = campaign.ownDeck && chosenId ? [...choices.mine, ...choices.precons].find((deck) => deck.id === chosenId) : undefined;
  if (own) return { kind: 'own', deck: own };
  if (chapter.deckName) return { kind: 'chapter', name: chapter.deckName, bracket: asBracket(chapter.deckBracket) };
  return { kind: 'none' };
}

/** a precon's bracket from the index, by its roster id */
export function preconBracket(precons: readonly PreconSet[], id: string): number | undefined {
  if (!id.startsWith(PRECON_PREFIX)) return undefined;
  for (const set of precons) {
    const deck = set.decks.find((candidate) => PRECON_PREFIX + candidate.file === id);
    if (deck) return deck.bracket;
  }
  return undefined;
}

/** the bracket of the deck the player takes into a chapter: the chapter deck's, or their own deck's */
export function bracketOfChoice(choice: CampaignDeck, estimates: Record<string, BracketEstimate>, precons: readonly PreconSet[]) {
  if (choice.kind === 'chapter') return choice.bracket ? { bracket: choice.bracket, set: false } : null;
  if (choice.kind === 'own') return bracketOf(choice.deck, estimates, preconBracket(precons, choice.deck.id));
  return null;
}
