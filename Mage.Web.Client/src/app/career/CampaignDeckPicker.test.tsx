// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import type { PreconSet, RosterDeck } from '../stores/decks';
import { registerMessages } from '../i18n';
import messages from '../i18n/en/career';
import { CampaignDeckPicker, DeckBracket } from './CampaignDeckPicker';
import { bracketOfChoice, campaignDeckOf, commanderChoices, readCampaignDeck, writeCampaignDeck } from './campaignDeck';

registerMessages(messages);

const precons: PreconSet[] = [{
  id: 'commander-2013', name: 'Commander 2013', year: 2013,
  decks: [{ file: 'commander-2013/mind-seize.dck', name: 'Mind Seize', cards: 100, commanders: ['Jeleva, Nephalia\'s Scourge'], cover: { name: 'Jeleva', setCode: 'C13', cardNumber: '1' }, bracket: 2 }],
}];

const mine = (overrides: Partial<RosterDeck>): RosterDeck => ({
  id: 'deck-1', name: 'Atraxa Counters', note: '', cardCount: 100, kind: 'commander', cover: null, colors: [], starter: null, ...overrides,
});

const roster: RosterDeck[] = [
  mine({ bracket: 4 }),
  mine({ id: 'deck-2', name: 'Burn', kind: 'standard', cardCount: 60 }),
];

describe('campaign deck choice', () => {
  beforeEach(() => localStorage.clear());

  test('the chapter deck is the default; the player picks one of their Commander decks or a precon', () => {
    const choices = commanderChoices(roster, precons);
    expect(choices.mine.map((deck) => deck.id)).toEqual(['deck-1']);
    expect(choices.precons.map((deck) => deck.id)).toEqual(['precon:commander-2013/mind-seize.dck']);

    const road = { deckName: 'Counterpunch', deckBracket: 3 };
    expect(campaignDeckOf({ ownDeck: true }, road, null, choices)).toEqual({ kind: 'chapter', name: 'Counterpunch', bracket: 3 });
    expect(campaignDeckOf({ ownDeck: true }, road, 'deck-1', choices)).toMatchObject({ kind: 'own', deck: { name: 'Atraxa Counters' } });
    // a deck that's gone (or of another kind) falls back to the chapter's
    expect(campaignDeckOf({ ownDeck: true }, road, 'deck-2', choices).kind).toBe('chapter');
    // a campaign with decks of its own ignores the choice
    expect(campaignDeckOf({ ownDeck: false }, road, 'deck-1', choices).kind).toBe('chapter');
    // Commander Conquest: no chapter deck, so one must be chosen
    expect(campaignDeckOf({ ownDeck: true }, {}, null, choices).kind).toBe('none');
    expect(campaignDeckOf({ ownDeck: true }, {}, 'precon:commander-2013/mind-seize.dck', choices).kind).toBe('own');
  });

  test('the choice is remembered per campaign', () => {
    writeCampaignDeck('commander-conquest', 'deck-1');
    expect(readCampaignDeck('commander-conquest')).toBe('deck-1');
    expect(readCampaignDeck('commander-road')).toBeNull();
  });

  test("the chosen deck's bracket: the chapter deck's, the owner's, or the precon index's", () => {
    const choices = commanderChoices(roster, precons);
    expect(bracketOfChoice(campaignDeckOf({ ownDeck: true }, { deckName: 'Counterpunch', deckBracket: 3 }, null, choices), {}, precons)).toEqual({ bracket: 3, set: false });
    expect(bracketOfChoice(campaignDeckOf({ ownDeck: true }, {}, 'deck-1', choices), {}, precons)).toMatchObject({ bracket: 4, set: true });
    expect(bracketOfChoice(campaignDeckOf({ ownDeck: true }, {}, 'precon:commander-2013/mind-seize.dck', choices), {}, precons)).toMatchObject({ bracket: 2, set: false });
    expect(bracketOfChoice({ kind: 'none' }, {}, precons)).toBeNull();
  });

  test('the picker lists the chapter deck first, shows the bracket and says what a fork does to your own deck', () => {
    let chosen: string | null = null;
    const state = { chosenId: null as string | null, choose: (id: string | null) => { chosen = id; }, choices: commanderChoices(roster, precons), estimates: {}, precons };
    const { rerender } = render(<CampaignDeckPicker chapter={{ id: 'ghave', deckName: 'Counterpunch', deckBracket: 3 }} state={state} forks />);
    const select = screen.getByRole('combobox', { name: /Your deck/ }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Counterpunch (the chapter's deck)", 'Atraxa Counters · B4', 'Mind Seize · B2']);
    expect(screen.getByRole('img', { name: 'Bracket 3, Upgraded (estimated)' })).toBeTruthy();
    expect(screen.queryByText(/an upgrade pack changes the chapter's deck/)).toBeNull();

    fireEvent.change(select, { target: { value: 'deck-1' } });
    expect(chosen).toBe('deck-1');
    rerender(<CampaignDeckPicker chapter={{ id: 'ghave', deckName: 'Counterpunch', deckBracket: 3 }} state={{ ...state, chosenId: 'deck-1' }} forks />);
    expect(screen.getByRole('img', { name: 'Bracket 4, Optimized' })).toBeTruthy();
    expect(screen.getByText(/an upgrade pack changes the chapter's deck, not yours/)).toBeTruthy();
  });

  test('a chapter without a deck asks for one', () => {
    const state = { chosenId: null, choose: () => undefined, choices: commanderChoices(roster, precons), estimates: {}, precons };
    render(<CampaignDeckPicker chapter={{ id: 'c13' }} state={state} forks={false} />);
    expect(screen.getByText('Choose a Commander deck to play this chapter with.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  test("an opponent's bracket shows as a stamp, and nothing when unknown", () => {
    const { container } = render(<p><DeckBracket value={2} /><DeckBracket value={0} /><DeckBracket value={undefined} /></p>);
    expect(screen.getAllByRole('img').map((badge) => badge.getAttribute('aria-label'))).toEqual(['Bracket 2, Core (estimated)']);
    expect(container.textContent).toBe('B2');
  });
});
