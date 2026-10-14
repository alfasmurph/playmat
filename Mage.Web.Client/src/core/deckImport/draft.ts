import type { CardView } from '../../protocol/generated/views';
import type { DeckCardInfo, DeckCardLists, DeckCoverCard, DeckImportSource } from '../decks/types';
import type { DeckSiteId } from './sites';
import { importKey, resolveCards, type CardLookup, type FixStore, type PrintingPolicy } from './resolve';
import { parseList, type ListSection, type ParsedList } from './parseList';

/** Where an imported deck came from, kept with the deck so it can be updated later. */
export interface DeckSource extends DeckImportSource {
  site: DeckSiteId;
}

/** A deck read from a site or a list, before matching cards: what both import paths produce. */
export interface DeckReading {
  list: ParsedList;
  name?: string;
  author?: string;
  /** an XMage deck type, when the site said which format */
  format?: string;
  description?: string;
  cover?: DeckCoverCard;
  source?: Omit<DeckSource, 'importedAt'>;
  /** maybeboard cards the site left out before we saw them */
  maybeCount?: number;
}

/** An import in progress: the reading, the card each line matched, and the lines the player left out. */
export interface ImportDraft extends DeckReading {
  name: string;
  format: string;
  cards: ReadonlyMap<string, CardView | null>;
  leftOut: ReadonlySet<string>;
  printings: PrintingPolicy;
  /** the commander import chose for a list that marked none (see guessCommander) */
  guessedCommander?: string;
}

export interface CardIssue {
  key: string;
  cardName: string;
  setCode: string | null;
  cardNumber: string | null;
  amount: number;
  sections: ListSection[];
}

export const DEFAULT_FORMAT = 'Constructed - Freeform';
export const COMMANDER_FORMAT = 'Variant Magic - Commander';

const sum = (cards: DeckCardInfo[]) => cards.reduce((total, card) => total + card.amount, 0);

function sectionsOf(list: ParsedList): [ListSection, DeckCardInfo[]][] {
  return [['commander', list.commanders], ['main', list.main], ['side', list.side], ['companion', list.companion]];
}

/** Every card line that counts toward the deck (maybeboard never does). */
export function importedLines(list: ParsedList): DeckCardInfo[] {
  return [...list.commanders, ...list.main, ...list.side, ...list.companion];
}

/** Read pasted text: the list, and a name when the export carried one. */
export function readList(text: string): DeckReading {
  const list = parseList(text);
  return { list, name: list.name };
}

const BASIC_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);

/**
 * A name for a list that carried none: its commander, else the nonland card it plays most copies of (the first one
 * on a tie), so a pasted list doesn't arrive as one more "Imported deck".
 */
export function suggestDeckName(list: ParsedList, cards: ReadonlyMap<string, CardView | null>): string | null {
  if (list.commanders.length > 0) return list.commanders.map((card) => card.cardName).join(' & ');
  let best: DeckCardInfo | null = null;
  for (const card of list.main) {
    const view = cards.get(importKey(card));
    const land = BASIC_NAMES.has(card.cardName) || !!view?.cardTypes?.includes('LAND');
    if (land || !card.cardName) continue;
    if (!best || card.amount > best.amount) best = card;
  }
  return best?.cardName ?? null;
}

/** A card that can lead a Commander deck: a legendary creature, or one whose text says it can be your commander. */
export function canBeCommander(view: CardView | null | undefined): boolean {
  if (!view) return false;
  const legendaryCreature = !!view.superTypes?.includes('LEGENDARY') && !!view.cardTypes?.includes('CREATURE');
  return legendaryCreature || (view.rules ?? []).some((rule) => /can be your commander/i.test(rule));
}

/**
 * A list that reads like a Commander deck but marks no commander: about a hundred cards, single copies apart from
 * basic lands and at most one card that allows more (Relentless Rats). Moxfield's plain text export is one.
 */
export function needsCommander(draft: Pick<ImportDraft, 'list' | 'format'>): boolean {
  const { list } = draft;
  if (list.commanders.length > 0) return false;
  const total = sum(list.main) + sum(list.side);
  if (total < 98 || total > 101) return COMMANDER_LIKE.test(draft.format) && total > 0;
  const repeats = list.main.filter((card) => card.amount > 1 && !BASIC_NAMES.has(card.cardName.replace(/^Snow-Covered /, ''))).length;
  return repeats <= 1;
}

/** The main deck's cards that could be the commander of a list that marks none, one line per card. */
export function commanderCandidates(draft: ImportDraft): DeckCardInfo[] {
  if (!needsCommander(draft)) return [];
  const seen = new Set<string>();
  return draft.list.main.filter((card) => {
    const key = importKey(card);
    if (seen.has(key) || draft.leftOut.has(key) || !canBeCommander(draft.cards.get(key))) return false;
    seen.add(key);
    return true;
  });
}

/** Move one copy of a main deck line to the commanders, and make the deck a Commander deck. */
export function setCommander(draft: ImportDraft, key: string): ImportDraft {
  const line = draft.list.main.find((card) => importKey(card) === key);
  if (!line) return draft;
  const main = draft.list.main
    .map((card) => (card === line ? { ...card, amount: card.amount - 1 } : card))
    .filter((card) => card.amount > 0);
  return {
    ...draft,
    list: { ...draft.list, main, commanders: [...draft.list.commanders, { ...line, amount: 1 }] },
    format: COMMANDER_LIKE.test(draft.format) ? draft.format : COMMANDER_FORMAT,
  };
}

/**
 * For a list that marks no commander: the one card that can be it, or the one whose name the deck's name carries
 * ("Ur-Dragon Tribal"). Several candidates and no name to go by: the player picks (commanderCandidates).
 */
export function guessCommander(draft: ImportDraft): ImportDraft {
  const candidates = commanderCandidates(draft);
  const named = (draft.name ?? '').toLowerCase();
  const inName = candidates.filter((card) => {
    const front = card.cardName.split(' // ')[0].toLowerCase();
    return named.includes(front) || named.includes(front.split(',')[0]);
  });
  const pick = candidates.length === 1 ? candidates[0] : inName.length === 1 ? inName[0] : null;
  if (!pick) return draft;
  return { ...setCommander(draft, importKey(pick)), guessedCommander: pick.cardName };
}

/** Undo guessCommander: the guessed commander goes back to the main deck, for the player to pick another. */
export function clearGuessedCommander(draft: ImportDraft): ImportDraft {
  if (!draft.guessedCommander) return draft;
  return {
    ...draft,
    list: { ...draft.list, main: [...draft.list.commanders, ...draft.list.main], commanders: [] },
    guessedCommander: undefined,
  };
}

/** Match every line against the card database and start a draft. */
export async function startDraft(
  reading: DeckReading,
  lookup: CardLookup,
  options: { fixes?: FixStore; printings?: PrintingPolicy; fallbackName?: string } = {},
): Promise<ImportDraft> {
  const printings = options.printings ?? 'site';
  const cards = await resolveCards(importedLines(reading.list), lookup, { fixes: options.fixes, printings });
  const draft: ImportDraft = {
    ...reading,
    name: reading.name?.trim() || options.fallbackName || '',
    format: reading.format || (reading.list.commanders.length > 0 ? COMMANDER_FORMAT : DEFAULT_FORMAT),
    cards,
    leftOut: new Set(),
    printings,
  };
  const guessed = guessCommander(draft);
  return { ...guessed, name: guessed.name || suggestDeckName(guessed.list, cards) || 'Imported deck' };
}

/** Lines that matched no card and that the player hasn't left out, in deck order. */
export function issuesOf(draft: ImportDraft): CardIssue[] {
  const issues = new Map<string, CardIssue>();
  for (const [section, cards] of sectionsOf(draft.list)) {
    for (const card of cards) {
      const key = importKey(card);
      if (draft.cards.get(key) || draft.leftOut.has(key)) continue;
      const issue = issues.get(key) ?? { key, cardName: card.cardName, setCode: card.setCode ?? null, cardNumber: card.cardNumber ?? null, amount: 0, sections: [] };
      issue.amount += card.amount;
      if (!issue.sections.includes(section)) issue.sections.push(section);
      issues.set(key, issue);
    }
  }
  return [...issues.values()];
}

/** The player picked this printing for a line that didn't match. */
export function fixCard(draft: ImportDraft, key: string, card: CardView): ImportDraft {
  const cards = new Map(draft.cards);
  cards.set(key, card);
  const leftOut = new Set(draft.leftOut);
  leftOut.delete(key);
  return { ...draft, cards, leftOut };
}

export function leaveOut(draft: ImportDraft, key: string): ImportDraft {
  return { ...draft, leftOut: new Set([...draft.leftOut, key]) };
}

function resolvedLines(draft: ImportDraft, cards: DeckCardInfo[]): DeckCardInfo[] {
  const merged = new Map<string, DeckCardInfo>();
  for (const card of cards) {
    const view = draft.cards.get(importKey(card));
    if (!view) continue;
    const entry = { cardName: view.name ?? card.cardName, setCode: view.expansionSetCode ?? '', cardNumber: view.cardNumber ?? '', amount: card.amount };
    const key = `${entry.setCode}:${entry.cardNumber}:${entry.cardName}`;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, amount: existing.amount + entry.amount } : entry);
  }
  return [...merged.values()];
}

export interface DraftCounts {
  main: number;
  side: number;
  commanders: number;
  /** maybeboard cards, never imported */
  maybeboard: number;
  /** sideboard cards a commander deck can't hold (XMage keeps only the commanders there) */
  sideboardDropped: number;
  /** lines left out by the player, or still unmatched */
  missing: number;
}

const COMMANDER_LIKE = /Commander|Brawl|Oathbreaker|Tiny Leaders/;

/** Whether the deck plays with commanders: listed commanders, or a commander format. */
export function isCommanderDeck(draft: Pick<ImportDraft, 'list' | 'format'>): boolean {
  return draft.list.commanders.length > 0 || COMMANDER_LIKE.test(draft.format);
}

/**
 * The deck as Playmat stores it. Commanders go into the sideboard (the XMage convention); a commander
 * deck's other sideboard cards and the companion are left out, since XMage would read them as commanders.
 */
export function toDeck(draft: ImportDraft): { deck: DeckCardLists; counts: DraftCounts } {
  const commanderDeck = isCommanderDeck(draft);
  const main = resolvedLines(draft, draft.list.main);
  const commanders = resolvedLines(draft, draft.list.commanders);
  const side = commanderDeck ? commanders : resolvedLines(draft, [...draft.list.side, ...draft.list.companion]);
  const missing = issuesOf(draft).reduce((total, issue) => total + issue.amount, 0)
    + importedLines(draft.list).filter((card) => draft.leftOut.has(importKey(card))).reduce((total, card) => total + card.amount, 0);
  const deck: DeckCardLists = {
    name: draft.name.trim() || 'Imported deck',
    format: draft.format,
    author: draft.author,
    description: draft.description,
    cards: main,
    sideboard: side,
    coverCard: draft.cover ?? (commanders[0]?.setCode ? { setCode: commanders[0].setCode!, cardNumber: commanders[0].cardNumber!, name: commanders[0].cardName } : undefined),
    source: draft.source ? { ...draft.source, importedAt: Date.now(), importedName: draft.name.trim() || 'Imported deck' } : undefined,
  };
  return {
    deck,
    counts: {
      main: sum(main),
      side: commanderDeck ? 0 : sum(side),
      commanders: sum(commanders),
      maybeboard: sum(draft.list.maybe) + (draft.maybeCount ?? 0),
      sideboardDropped: commanderDeck ? sum(draft.list.side) + sum(draft.list.companion) : 0,
      missing,
    },
  };
}

/** Card details for the preview (curve, colors, cover), by the printing each line resolved to. */
export function draftCardViews(draft: ImportDraft): CardView[] {
  return [...draft.cards.values()].filter((card): card is CardView => !!card);
}
