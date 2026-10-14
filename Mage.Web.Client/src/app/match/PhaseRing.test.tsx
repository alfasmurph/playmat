import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PlayerView } from '../../protocol/generated/views';
import { DEFAULT_SETTINGS, useSettings } from '../stores/settings';
import { PhaseRing } from './PhaseRing';
import { PlayerPlate } from './PlayerPlate';

const ME: PlayerView = { playerId: 'me', name: 'Ann', life: 20, isActive: true } as PlayerView;

afterEach(() => {
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS }, fullControl: false });
});

describe('PhaseRing', () => {
  test('names the turn and marks where it is', () => {
    render(<PhaseRing step="DECLARE_BLOCKERS" myTurn turn={16} />);
    const ring = screen.getByRole('navigation', { name: 'Turn 16, your turn' });
    const dots = within(ring).getAllByRole('button');
    expect(dots).toHaveLength(9);
    expect(within(ring).getByRole('button', { name: 'Declare blockers' }).getAttribute('aria-current')).toBe('step');
    expect(dots.filter((dot) => dot.getAttribute('aria-current'))).toHaveLength(1);
    // the default stops: both mains on your turn
    expect(within(ring).getByRole('button', { name: 'Main, before combat' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(ring).getByRole('button', { name: 'Upkeep' }).getAttribute('aria-pressed')).toBe('false');
  });

  test("a dot toggles the stop on that side's turn, as the ladder did", () => {
    const { rerender } = render(<PhaseRing step="UPKEEP" myTurn={false} turn={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    expect(useSettings.getState().settings.stops.opponentTurn?.draw).toBe(true);
    expect(useSettings.getState().settings.stops.yourTurn?.draw).toBe(false);
    expect(screen.getByRole('button', { name: 'Draw' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Declare attackers' }));
    expect(useSettings.getState().settings.combatStops.opponentTurn.attackers).toBe(true);

    rerender(<PhaseRing step="UPKEEP" myTurn turn={4} />);
    fireEvent.click(screen.getByRole('button', { name: 'Beginning of combat' }));
    expect(useSettings.getState().settings.stops.yourTurn?.beforeCombat).toBe(true);
  });

  test('under full control every dot stops and none can be changed', () => {
    useSettings.setState({ fullControl: true });
    render(<PhaseRing step="DRAW" myTurn turn={2} />);
    const upkeep = screen.getByRole('button', { name: 'Upkeep' });
    expect(upkeep.getAttribute('aria-pressed')).toBe('true');
    expect(upkeep.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(upkeep);
    expect(useSettings.getState().settings.stops.yourTurn?.upkeep).toBe(false);
  });

  test("watching: the ring is named by the active player's name", () => {
    render(<PhaseRing step="DRAW" myTurn={false} turn={7} activeName="Bea" />);
    expect(screen.getByRole('navigation', { name: "Turn 7, Bea's turn" })).toBeTruthy();
  });
});

describe('PlayerPlate with the turn', () => {
  test('rings the active seat and prints the turn; a dot click never targets the seat', () => {
    const onClick = vi.fn();
    render(<PlayerPlate player={ME} isMe targetable selected={false} deciding={false} onClick={onClick} turn={{ step: 'DRAW', myTurn: true, turn: 16 }} />);
    expect(screen.getByText('T16')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upkeep' }));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Ann, 20 life/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  test('no ring off turn', () => {
    render(<PlayerPlate player={ME} isMe targetable={false} selected={false} deciding={false} onClick={() => undefined} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/^T\d+$/)).toBeNull();
  });
});
