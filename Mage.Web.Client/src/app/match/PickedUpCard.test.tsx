import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EventBus } from '../../core/rpc/EventBus';
import type { ServerEvent } from '../../core/rpc/RpcClient';
import { GameSession } from '../../core/game/gameSession';
import type { Api } from '../../protocol/generated/api';
import type { CardView, GameView } from '../../protocol/generated/views';
import { ActionCluster } from './ActionCluster';
import { useMatchUi } from './matchUi';
import { PickedUpCard } from './PickedUpCard';
import { DEFAULT_STAGE, StageContext } from './stageContext';

const ELF = {
  id: 'elf',
  name: 'Llanowar Visionary',
  cardTypes: ['CREATURE'],
  subTypes: ['Elf', 'Druid'],
  rules: ['When {this} enters, draw a card.', '{T}: Add {G}.'],
} as unknown as CardView;
const LOOTER = {
  id: 'looter',
  name: 'Merfolk Looter',
  cardTypes: ['CREATURE'],
  rules: ['{T}: Draw a card, then discard a card.'],
} as unknown as CardView;
const DRAKE = {
  id: 'drake',
  name: 'Wind Drake',
  cardTypes: ['CREATURE'],
  subTypes: ['Drake'],
  rules: ['Flying'],
} as unknown as CardView;

const base: GameView = {
  myPlayerId: 'me',
  activePlayerId: 'me',
  priorityPlayerName: 'me',
  turn: 3,
  step: 'PRECOMBAT_MAIN',
  myHand: { elf: ELF },
  players: [
    { playerId: 'me', name: 'me', battlefield: { looter: LOOTER } },
    { playerId: 'them', name: 'Bob', battlefield: { drake: DRAKE } },
  ],
  canPlayObjects: {
    objects: {
      elf: { basicCastAbilities: [{ id: 'cast-elf', value: 'Cast Llanowar Visionary' }] },
      looter: {
        other: [
          { id: 'loot', value: '{T}: Draw a card, then discard a card.' },
          { id: 'mana', value: '{T}: Add {U}.' },
        ],
      },
    },
  },
} as unknown as GameView;

/** A real GameSession fed by hand, the held card and the decision corner over it, as on the stage. */
function setup() {
  const listeners = new Set<(event: ServerEvent) => void>();
  const bus = new EventBus({
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onSessionStart: () => () => undefined,
    onStatus: () => () => undefined,
  });
  const api = {
    sendPlayerUUID: vi.fn(async () => undefined),
    sendPlayerBoolean: vi.fn(async () => undefined),
  };
  const session = new GameSession(api as unknown as Api, bus, { gameId: 'g1', playerId: 'me', mode: 'play' });
  let messageId = 0;
  const emit = (method: ServerEvent['method'], data: unknown) =>
    act(() => listeners.forEach((listener) => listener({ method, data, objectId: 'g1', messageId: ++messageId } as ServerEvent)));

  function Harness() {
    const state = useSyncExternalStore(session.store.subscribe, session.store.getState);
    return (
      <StageContext.Provider value={DEFAULT_STAGE}>
        <ActionCluster
          interaction={state.interaction}
          awaiting={state.awaitingServer}
          status={null}
          canAct
          special={false}
          holdingPriority={false}
          onCommand={(command) => void session.respond(command)}
        />
        <PickedUpCard
          view={state.view}
          interaction={state.interaction}
          awaitingServer={state.awaitingServer}
          extra={[]}
          sleeveOf={() => 'default'}
          onActivate={(objectId, abilityId) => session.activate(objectId, abilityId)}
        />
      </StageContext.Provider>
    );
  }

  render(<Harness />);
  emit('GAME_SELECT', { message: 'Play spells and abilities.', gameView: base });
  return { api, session, emit };
}

const pickUp = (id: string) => act(() => useMatchUi.getState().pickUp(id));
const held = () => screen.getByRole('dialog');

describe('PickedUpCard', () => {
  beforeEach(() => useMatchUi.setState({ pickup: null, detail: null }));

  test('a playable card held up offers what it can do, with putting it down last', () => {
    setup();
    pickUp('elf');
    expect(screen.getByRole('dialog', { name: 'Llanowar Visionary' })).toBeTruthy();
    const buttons = within(held()).getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Cast Llanowar Visionary', 'Details', 'Put down']);
    // the first option takes focus: Enter or Space uses it
    expect(document.activeElement?.textContent).toBe('Cast Llanowar Visionary');
  });

  test('a permanent offers its abilities, making mana last and quietly', () => {
    setup();
    pickUp('looter');
    // mana symbols are drawn: their names are their symbols
    const buttons = within(held()).getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual([': Draw a card, then discard a card.', 'Tap for mana: Add ', 'Details', 'Put down']);
    expect(within(held()).getByRole('img', { name: 'U' })).toBeTruthy();
  });

  test('choosing an option uses it through the session and puts the card down', async () => {
    const { api, emit } = setup();
    pickUp('looter');
    fireEvent.click(within(held()).getByRole('button', { name: /Draw a card/ }));
    expect(api.sendPlayerUUID).toHaveBeenCalledWith('g1', 'looter');
    await waitFor(() => expect(useMatchUi.getState().pickup).toBeNull());
    // the server asks which ability: the one chosen is answered without a panel
    emit('GAME_CHOOSE_ABILITY', {
      message: 'Choose spell or ability to play<br>Merfolk Looter',
      choices: { loot: '1. {T}: Draw a card, then discard a card.', mana: '2. {T}: Add {U}.' },
      gameView: base,
    });
    expect(api.sendPlayerUUID).toHaveBeenLastCalledWith('g1', 'loot');
  });

  test("an opponent's card is only for reading: its text, Details and Put down", () => {
    setup();
    pickUp('drake');
    const dialog = held();
    expect(within(dialog).getByText('Creature — Drake')).toBeTruthy();
    expect(within(dialog).getByRole('list', { name: 'Card text' }).textContent).toBe('Flying');
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Details', 'Put down']);
  });

  test('a playable card is only for reading while the player does not hold priority', () => {
    const { emit } = setup();
    emit('GAME_ASK', { message: 'Pay {1}?', gameView: base });
    pickUp('elf');
    expect(within(held()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Details', 'Put down']);
  });

  test('Escape and Put down put the card back', async () => {
    setup();
    pickUp('elf');
    fireEvent.keyDown(held(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    pickUp('elf');
    fireEvent.click(within(held()).getByRole('button', { name: 'Put down' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('Details opens the detail view in its place', () => {
    setup();
    pickUp('drake');
    fireEvent.click(within(held()).getByRole('button', { name: 'Details' }));
    expect(useMatchUi.getState().detail?.id).toBe('drake');
    expect(useMatchUi.getState().pickup).toBeNull();
  });

  test('the decision corner ignores Space and Enter while a card is held', () => {
    const { api } = setup();
    pickUp('drake');
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(api.sendPlayerBoolean).not.toHaveBeenCalled();
    act(() => useMatchUi.getState().putDown());
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(api.sendPlayerBoolean).toHaveBeenCalledWith('g1', false);
  });

  test('goes back down when the card leaves the table', () => {
    const { emit } = setup();
    pickUp('drake');
    emit('GAME_UPDATE', { ...base, players: [{ playerId: 'me', battlefield: { looter: LOOTER } }, { playerId: 'them', battlefield: {} }] });
    expect(useMatchUi.getState().pickup).toBeNull();
  });

  test('goes back down once the server works on an answer given while its options showed', () => {
    const { session } = setup();
    pickUp('elf');
    expect(within(held()).getByRole('button', { name: 'Cast Llanowar Visionary' })).toBeTruthy();
    act(() => void session.respond({ type: 'boolean', value: false }));
    expect(useMatchUi.getState().pickup).toBeNull();
  });
});
