// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { CommanderStatus } from '../../core/game/commander';
import type { PlayerView } from '../../protocol/generated/views';
import { usePortraits } from './portraits';

const ULALEK = { id: 'c1', name: 'Ulalek, Fused Atrocity', expansionSetCode: 'MH3', cardNumber: '211' };
const commanderOf = (ownerId: string) => new Map<string, CommanderStatus[]>([[ownerId, [{ casts: 0, tax: 0, damage: [], id: 'c1', name: ULALEK.name, ownerId, zone: 'command', card: ULALEK }]]]);

describe('usePortraits', () => {
  test('an AI is pictured by its commander, and keeps it while the commander is off the board', () => {
    const players: PlayerView[] = [{ playerId: 'me', isHuman: true }, { playerId: 'ai', isHuman: false }];
    const { result, rerender } = renderHook(({ commanders }) => usePortraits(players, commanders), { initialProps: { commanders: commanderOf('ai') } });
    expect(result.current.get('ai')).toEqual({ name: ULALEK.name, expansionSetCode: 'MH3', cardNumber: '211' });
    // cast: on the stack, out of sight
    rerender({ commanders: new Map() });
    expect(result.current.get('ai')?.name).toBe(ULALEK.name);
  });

  test('people keep their own picture', () => {
    const players: PlayerView[] = [{ playerId: 'me', isHuman: true }];
    const { result } = renderHook(() => usePortraits(players, commanderOf('me')));
    expect(result.current.size).toBe(0);
  });
});
