import type { CardView, GameView, PlayableObjectRecord } from '../../protocol/generated/views';
import { isManaText } from './autoPass';
import { rulesOf } from './glossary';
import { stripMarkup } from './prompt';

/**
 * What a card picked up from the table can do right now, read from the server's playable list
 * (canPlayObjects): one entry per ability the server would let the player use. The ability ids are the ones the
 * server's ability chooser answers with (see GameSession.activate).
 */

export type PlayOptionKind = 'cast' | 'play' | 'ability' | 'mana';

export interface PlayOption {
  abilityId: string;
  kind: PlayOptionKind;
  /** what the button says */
  label: string;
  /** the ability's own text, when the label only names it ("Tap for mana") */
  detail?: string;
}

/** The server cuts each ability's text at 50 characters and marks the cut with "...". */
const CUT = '...';

/** A record's text without markup; a cut can leave half a tag or entity at the end. */
function plainValue(value: string | undefined): string {
  return stripMarkup((value ?? '').replace(/<[^>]*$/, '').replace(/&[#a-z0-9]*$/i, ''));
}

/** The whole rules line a cut ability text starts, from the card's own rules (null when none matches). */
function fullLine(value: string, card: CardView | undefined): string | null {
  if (!card || !value.endsWith(CUT)) return null;
  const head = plainValue(value.slice(0, -CUT.length)).trim();
  if (!head) return null;
  const line = rulesOf(card).map((rule) => stripMarkup(rule)).find((rule) => rule.startsWith(head));
  return line ?? null;
}

function textOf(record: PlayableObjectRecord, card: CardView | undefined): string {
  const text = fullLine(record.value ?? '', card) ?? plainValue(record.value);
  // "{this}" would read as a mana symbol
  return text.replace(/\{this\}/gi, card?.displayName ?? card?.name ?? 'this');
}

function manaOption(record: PlayableObjectRecord, card: CardView | undefined): PlayOption {
  const text = textOf(record, card).replace(/\.$/, '');
  return { abilityId: record.id ?? '', kind: 'mana', label: 'Tap for mana', detail: text || undefined };
}

/**
 * The options for one object, in the order a player reaches for them: casting or playing it first, then its
 * other abilities, and making mana last (always possible, rarely the point of picking a card up).
 */
export function playOptions(view: GameView | null | undefined, objectId: string, card?: CardView): PlayOption[] {
  const stats = view?.canPlayObjects?.objects?.[objectId];
  if (!stats) return [];
  const name = card?.displayName ?? card?.name ?? '';
  const spells: PlayOption[] = [];
  const abilities: PlayOption[] = [];
  const mana = (stats.basicManaAbilities ?? []).map((record) => manaOption(record, card));

  for (const record of stats.basicCastAbilities ?? []) {
    spells.push({ abilityId: record.id ?? '', kind: 'cast', label: plainValue(record.value) || (name ? `Cast ${name}` : 'Cast') });
  }
  for (const record of stats.basicPlayAbilities ?? []) {
    spells.push({ abilityId: record.id ?? '', kind: 'play', label: plainValue(record.value) || (name ? `Play ${name}` : 'Play') });
  }
  // everything else the server lumps together: other ways to cast it (an adventure, a split half, flashback),
  // activated abilities, and mana abilities that aren't a basic land's
  for (const record of stats.other ?? []) {
    const text = textOf(record, card);
    if (isManaText(record.value)) mana.push(manaOption(record, card));
    else if (/^cast\b/i.test(text)) spells.push({ abilityId: record.id ?? '', kind: 'cast', label: text });
    else if (/^play\b/i.test(text)) spells.push({ abilityId: record.id ?? '', kind: 'play', label: text });
    else abilities.push({ abilityId: record.id ?? '', kind: 'ability', label: text || 'Activate' });
  }

  return [...spells, ...abilities, ...mana];
}
