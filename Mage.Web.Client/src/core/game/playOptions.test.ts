import { describe, expect, it } from 'vitest';
import fixture from '../rpc/__fixtures__/gameStatePatches.json';
import type { CardView, GameView } from '../../protocol/generated/views';
import { playOptions } from './playOptions';

const recorded = fixture.views[1] as unknown as GameView;

function view(objects: NonNullable<GameView['canPlayObjects']>['objects']): GameView {
  return { myPlayerId: 'me', canPlayObjects: { objects } };
}

describe('playOptions', () => {
  it('reads the options of a recorded game: a spell, a land in hand, a land on the table', () => {
    const goblin = recorded.myHand!['fca5a67f-a717-4b04-8465-ac76a05d53cc'];
    expect(playOptions(recorded, goblin.id!, goblin)).toEqual([
      { abilityId: '994737e8-3ee1-49ef-8ee8-67d788895b8e', kind: 'cast', label: 'Cast Raging Goblin' },
    ]);
    expect(playOptions(recorded, 'a3f0f93e-cc2f-4083-affb-fa0e22b3cd7a')).toEqual([
      { abilityId: 'bda65897-f426-4636-8d55-a71d6c0ff36b', kind: 'play', label: 'Play Mountain' },
    ]);
    expect(playOptions(recorded, '8b33cfe7-8be5-4e2a-a11a-aa8571845d4e')).toEqual([
      { abilityId: '035a5e85-2316-43eb-9fb9-fd03999b22e8', kind: 'mana', label: 'Tap for mana', detail: '{T}: Add {R}' },
    ]);
  });

  it('has nothing for an object the server does not list', () => {
    expect(playOptions(recorded, 'e2279f6a-627b-4780-ad2e-4bc9910d360d')).toEqual([]);
    expect(playOptions(null, 'anything')).toEqual([]);
  });

  it('puts casting first, then activated abilities, and making mana last', () => {
    const options = playOptions(view({
      elf: {
        basicManaAbilities: [{ id: 'm1', value: '{T}: Add {G}.' }],
        basicCastAbilities: [],
        other: [
          { id: 'a1', value: '{2}{G}, {T}: Draw a card.' },
          { id: 'm2', value: '{T}: Add {G} or {W}.' },
          { id: 'a2', value: '{1}: {this} gets +1/+1 until end of turn.' },
        ],
      },
    }), 'elf');
    expect(options.map((option) => [option.abilityId, option.kind])).toEqual([
      ['a1', 'ability'], ['a2', 'ability'], ['m1', 'mana'], ['m2', 'mana'],
    ]);
    expect(options[0].label).toBe('{2}{G}, {T}: Draw a card.');
    expect(options[3]).toMatchObject({ label: 'Tap for mana', detail: '{T}: Add {G} or {W}' });
  });

  it('lists the other ways to cast a card with its spells: an adventure, flashback', () => {
    const options = playOptions(view({
      giant: {
        basicCastAbilities: [{ id: 'c1', value: 'Cast Bonecrusher Giant' }],
        other: [{ id: 'c2', value: 'Cast Stomp' }],
      },
      think: { other: [{ id: 'f1', value: 'Cast Think Twice using flashback' }] },
    }), 'giant');
    expect(options).toEqual([
      { abilityId: 'c1', kind: 'cast', label: 'Cast Bonecrusher Giant' },
      { abilityId: 'c2', kind: 'cast', label: 'Cast Stomp' },
    ]);
  });

  it('reads the whole ability from the card when the server cut its text', () => {
    const map = {
      id: 'map',
      name: 'Renegade Map',
      rules: ['{T}, Sacrifice {this}: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.'],
    } as CardView;
    const options = playOptions(view({
      map: { other: [{ id: 'a1', value: '{T}, Sacrifice Renegade Map: Search your library f...' }] },
    }), 'map', map);
    expect(options[0].label).toBe('{T}, Sacrifice Renegade Map: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.');
  });

  it('keeps a cut text when the card has no line that starts the same way', () => {
    const options = playOptions(view({
      thing: { other: [{ id: 'a1', value: '{3}: Something the card text does not say anywhe...' }] },
    }), 'thing', { id: 'thing', rules: ['Flying'] } as CardView);
    expect(options[0].label).toBe('{3}: Something the card text does not say anywhe...');
  });

  it('drops markup, including a tag the cut left open', () => {
    const options = playOptions(view({
      lord: {
        other: [
          { id: 'a1', value: '{1}{B}: Regenerate {this}. <i>(The next time this...' },
          { id: 'a2', value: '<b>Boast</b> &mdash; {1}: Draw a card.' },
          { id: 'a3', value: '{2}: Target creature gets -1/-1 until end of turn <i' },
        ],
      },
    }), 'lord', { id: 'lord', name: 'Drudge Skeletons' } as CardView);
    expect(options.map((option) => option.label)).toEqual([
      '{1}{B}: Regenerate Drudge Skeletons. (The next time this...',
      'Boast — {1}: Draw a card.',
      '{2}: Target creature gets -1/-1 until end of turn',
    ]);
  });

  it('names a spell from the card when the server sends no text', () => {
    expect(playOptions(view({ bolt: { basicCastAbilities: [{}] } }), 'bolt', { id: 'bolt', name: 'Lightning Bolt' } as CardView))
      .toEqual([{ abilityId: '', kind: 'cast', label: 'Cast Lightning Bolt' }]);
  });
});
