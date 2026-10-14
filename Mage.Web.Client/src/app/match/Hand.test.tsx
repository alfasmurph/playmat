import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EventBus } from '../../core/rpc/EventBus';
import type { ServerEvent } from '../../core/rpc/RpcClient';
import { GameSession } from '../../core/game/gameSession';
import type { Api } from '../../protocol/generated/api';
import type { CardView, GameView } from '../../protocol/generated/views';
import { Hand } from './Hand';
import { useMatchUi } from './matchUi';
import { DEFAULT_STAGE, StageContext } from './stageContext';

const BOLT: CardView = { id: 'bolt', name: 'Lightning Bolt', expansionSetCode: 'M10', cardNumber: '146' } as CardView;
const BEAR: CardView = { id: 'bear', name: 'Grizzly Bears', expansionSetCode: 'M10', cardNumber: '168' } as CardView;
const PLAY_LINE = 600;

/** A real GameSession on a real EventBus, fed by hand; the api records what the client sends. */
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

  const view: GameView = {
    myPlayerId: 'me',
    activePlayerId: 'me',
    priorityPlayerName: 'me',
    turn: 2,
    step: 'PRECOMBAT_MAIN',
    canPlayObjects: { objects: { bolt: { basicPlayAbilities: [{}] } } },
  } as unknown as GameView;

  function Harness() {
    const state = useSyncExternalStore(session.store.subscribe, session.store.getState);
    const clickable = new Set(state.interaction.clickable.keys());
    return (
      <StageContext.Provider value={DEFAULT_STAGE}>
        <Hand
          cards={[BOLT, BEAR]}
          clickable={clickable}
          selected={state.interaction.selected}
          sleeve="default"
          onPlay={(id) => session.click(id)}
          onTap={(id) => useMatchUi.getState().pickUp(id)}
          playLine={PLAY_LINE}
          libraryOrigin="library:me"
        />
      </StageContext.Provider>
    );
  }

  render(<Harness />);
  emit('GAME_SELECT', { message: 'Play spells and abilities.', gameView: view });
  return { api, session, emit };
}

const card = (name: RegExp) => screen.getByRole('listitem', { name });
const held = () => useMatchUi.getState().pickup?.id ?? null;

describe('Hand', () => {
  beforeEach(() => useMatchUi.setState({ pickup: null }));

  test('labels the hand and marks playable cards; every card can be reached to pick it up', () => {
    setup();
    expect(screen.getByRole('list', { name: 'Your hand, 2 cards' })).toBeTruthy();
    expect(card(/Lightning Bolt, playable/).tabIndex).toBe(0);
    expect(card(/^Grizzly Bears$/).tabIndex).toBe(0);
  });

  test('tapping a playable card picks it up instead of casting it', () => {
    const { api } = setup();
    const bolt = card(/Lightning Bolt/);
    fireEvent.pointerDown(bolt, { button: 0, pointerId: 1, clientX: 100, clientY: 900 });
    fireEvent.pointerUp(bolt, { button: 0, pointerId: 1, clientX: 102, clientY: 901 });
    expect(held()).toBe('bolt');
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
  });

  test('dragging a card above the play line casts it; dropping it back in hand does not', () => {
    const { api, emit } = setup();
    let bolt = card(/Lightning Bolt/);
    fireEvent.pointerDown(bolt, { button: 0, pointerId: 1, clientX: 100, clientY: 900 });
    fireEvent.pointerMove(bolt, { pointerId: 1, clientX: 110, clientY: 860 });
    fireEvent.pointerUp(bolt, { pointerId: 1, clientX: 110, clientY: 850 });
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
    // a drag is not a tap: nothing is picked up either
    expect(held()).toBeNull();

    // a fresh prompt (the click above was not sent, but be explicit about state)
    emit('GAME_SELECT', { message: 'Play spells and abilities.', gameView: { myPlayerId: 'me', activePlayerId: 'me', turn: 2, canPlayObjects: { objects: { bolt: {} } } } });
    bolt = card(/Lightning Bolt/);
    fireEvent.pointerDown(bolt, { button: 0, pointerId: 2, clientX: 100, clientY: 900 });
    fireEvent.pointerMove(bolt, { pointerId: 2, clientX: 120, clientY: 500 });
    fireEvent.pointerUp(bolt, { pointerId: 2, clientX: 120, clientY: 400 });
    expect(api.sendPlayerUUID).toHaveBeenCalledTimes(1);
    expect(api.sendPlayerUUID).toHaveBeenCalledWith('g1', 'bolt');
    expect(held()).toBeNull();
  });

  test('cards that are not playable can be picked up, but not dragged onto the table', () => {
    const { api } = setup();
    const bear = card(/Grizzly Bears/);
    fireEvent.pointerDown(bear, { button: 0, pointerId: 1, clientX: 100, clientY: 900 });
    fireEvent.pointerMove(bear, { pointerId: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(bear, { pointerId: 1, clientX: 100, clientY: 300 });
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
    expect(useMatchUi.getState().dragging).toBeNull();
    expect(held()).toBeNull();

    fireEvent.pointerDown(bear, { button: 0, pointerId: 2, clientX: 100, clientY: 900 });
    fireEvent.pointerUp(bear, { button: 0, pointerId: 2, clientX: 100, clientY: 900 });
    expect(held()).toBe('bear');
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
  });

  test('Enter on a focused card picks it up', () => {
    const { api } = setup();
    fireEvent.keyDown(card(/Lightning Bolt/), { key: 'Enter' });
    expect(held()).toBe('bolt');
    fireEvent.keyDown(card(/Grizzly Bears/), { key: 'Enter' });
    expect(held()).toBe('bear');
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
  });

  test('a right click neither casts nor picks up', () => {
    const { api } = setup();
    const bolt = card(/Lightning Bolt/);
    fireEvent.pointerDown(bolt, { button: 2, pointerId: 1, clientX: 100, clientY: 900 });
    fireEvent.pointerUp(bolt, { button: 2, pointerId: 1, clientX: 100, clientY: 900 });
    expect(api.sendPlayerUUID).not.toHaveBeenCalled();
    expect(held()).toBeNull();
  });
});
