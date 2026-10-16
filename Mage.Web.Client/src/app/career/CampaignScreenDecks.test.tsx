// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CareerCampaign } from '../../protocol/generated/views';
import { useDecks } from '../stores/decks';

const calls: unknown[][] = [];
vi.mock('../connection', async (original) => {
  const actual = await original<typeof import('../connection')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      careerCampaignPlay: async (...args: unknown[]) => {
        calls.push(args);
        return { tableId: 'table-1' };
      },
    },
  };
});

const { Campaign } = await import('./CareerCampaignScreen');

const conquest: CareerCampaign = {
  id: 'commander-conquest', name: 'Commander Conquest', ownDeck: true, done: 0, total: 2,
  chapters: [{
    id: 'c13', name: 'Commander 2013', color: 'WUBRG',
    nodes: [
      { id: 'c13-pod-1', type: 'duel', name: 'Three at the table', state: 'open', opponentName: 'Jeleva, Nephalia\'s Scourge', skill: 4, bracket: 2, gameType: 'Commander Free For All',
        others: [{ name: 'Prossh, Skyraider of Kher', skill: 4, bracket: 3 }], requires: [], reward: { coins: 45, xp: 225 } },
    ],
  }],
};

describe('a Commander campaign screen', () => {
  beforeEach(() => {
    localStorage.clear();
    calls.length = 0;
    useDecks.setState({
      loaded: true, precons: [], starters: [], shared: [],
      saved: [{ id: 'deck-1', name: 'Atraxa Counters', note: '', cardCount: 100, kind: 'commander', cover: null, colors: [], starter: null, bracket: 4 }],
      refresh: async () => undefined, loadPrecons: async () => [],
      loadForPlay: async (id: string) => ({ id, deck: { name: 'Atraxa Counters', cards: [{ cardName: 'Forest', setCode: 'M21', cardNumber: '274', amount: 99 }], sideboard: [{ cardName: "Atraxa, Praetors' Voice", setCode: 'C16', cardNumber: '28', amount: 1 }] } }),
    });
  });

  test('every seat shows its bracket, and Conquest plays only with a deck of your own, sent with the call', async () => {
    render(<MemoryRouter><Campaign campaign={conquest} back="/career/campaign" /></MemoryRouter>);
    expect(screen.getAllByRole('img', { name: /^Bracket/ }).map((badge) => badge.getAttribute('aria-label'))).toEqual(['Bracket 2, Core (estimated)', 'Bracket 3, Upgraded (estimated)']);
    const play = screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(screen.getAllByText('Choose a Commander deck to play this chapter with.').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: /Your deck/ }), { target: { value: 'deck-1' } });
    expect(screen.getByText('You play Atraxa Counters, your own deck.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Bracket 4, Optimized' })).toBeTruthy();
    expect(play.disabled).toBe(false);
    expect(localStorage.getItem('playmat.career.campaignDeck.commander-conquest')).toBe('"deck-1"');

    // the versus screen, then the call: the node and your deck as the server reads it
    fireEvent.click(play);
    fireEvent.click(await screen.findByRole('button', { name: 'Fight' }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].slice(0, 2)).toEqual(['commander-conquest', 'c13-pod-1']);
    expect(calls[0][2]).toEqual({
      name: 'Atraxa Counters',
      cards: [{ cardName: 'Forest', setCode: 'M21', cardNumber: '274', amount: 99 }],
      sideboard: [{ cardName: "Atraxa, Praetors' Voice", setCode: 'C16', cardNumber: '28', amount: 1 }],
    });
  });
});
