import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '../stores/settings';
import { dotPosition, dotStates, RING_RADIUS, stepIndex, stopSet, toggledStops, TURN_STEPS } from './phaseSteps';

const byName = (name: string) => TURN_STEPS.find((turnStep) => turnStep.name === name)!;

describe('the ring of turn steps', () => {
  test('one dot per step the ladder showed, in turn order', () => {
    expect(TURN_STEPS.map((turnStep) => turnStep.label)).toEqual(['Upkeep', 'Draw', 'Main', 'Combat', 'Attack', 'Block', 'Damage', 'Main', 'End']);
    // every dot is a stop that can be set
    expect(TURN_STEPS.every((turnStep) => !!turnStep.stop !== !!turnStep.combat)).toBe(true);
  });

  test('steps gone this turn, the one being played, the ones to come', () => {
    expect(dotStates('DECLARE_ATTACKERS')).toEqual(['past', 'past', 'past', 'past', 'current', 'future', 'future', 'future', 'future']);
    // the server's finer steps fall on the dot that stands for them
    expect(stepIndex('UNTAP')).toBe(0);
    expect(stepIndex('FIRST_COMBAT_DAMAGE')).toBe(stepIndex('END_COMBAT'));
    expect(dotStates('CLEANUP').at(-1)).toBe('current');
    expect(dotStates('CLEANUP').slice(0, -1).every((state) => state === 'past')).toBe(true);
    // before the first step nothing has happened yet
    expect(dotStates(undefined).every((state) => state === 'future')).toBe(true);
  });

  test('a dot toggles the same setting the ladder did, on the side whose turn it is', () => {
    const settings = { stops: DEFAULT_SETTINGS.stops, combatStops: DEFAULT_SETTINGS.combatStops };
    const upkeep = byName('Upkeep');
    expect(stopSet(settings, 'yourTurn', upkeep)).toBe(false);
    const on = { ...settings, ...toggledStops(settings, 'yourTurn', upkeep, true) };
    expect(on.stops.yourTurn?.upkeep).toBe(true);
    expect(stopSet(on, 'yourTurn', upkeep)).toBe(true);
    // the other side's turn and the other stops are left as they were
    expect(on.stops.opponentTurn).toEqual(settings.stops.opponentTurn);
    expect(on.stops.yourTurn?.main1).toBe(settings.stops.yourTurn?.main1);
    expect(on.stops.stopOnDeclareAttackers).toBe(settings.stops.stopOnDeclareAttackers);
  });

  test('your beginning of combat is your own beforeCombat stop (the one auto-pass reads as beginCombatStop)', () => {
    const settings = { stops: DEFAULT_SETTINGS.stops, combatStops: DEFAULT_SETTINGS.combatStops };
    const patch = toggledStops(settings, 'yourTurn', byName('Beginning of combat'), true);
    expect(patch.stops?.yourTurn?.beforeCombat).toBe(true);
    expect(patch.combatStops).toBeUndefined();
  });

  test('attack and block are the client-kept combat stops', () => {
    const settings = { stops: DEFAULT_SETTINGS.stops, combatStops: DEFAULT_SETTINGS.combatStops };
    const block = byName('Declare blockers');
    const patch = toggledStops(settings, 'opponentTurn', block, true);
    expect(patch.stops).toBeUndefined();
    expect(patch.combatStops).toEqual({ yourTurn: settings.combatStops.yourTurn, opponentTurn: { attackers: false, blockers: true } });
    expect(stopSet({ ...settings, ...patch }, 'opponentTurn', block)).toBe(true);
    expect(stopSet({ ...settings, ...patch }, 'yourTurn', block)).toBe(false);
  });

  test('the dots run clockwise from lower left over the top, inside the seat, clear of the rope and the name', () => {
    const points = TURN_STEPS.map((_, index) => dotPosition(index));
    for (const { x, y } of points) expect(Math.hypot(x, y)).toBeCloseTo(RING_RADIUS, 0);
    // the first dot is low on the left, the last high on the right
    expect(points[0].x).toBeLessThan(0);
    expect(points[0].y).toBeGreaterThan(0);
    expect(points.at(-1)!.x).toBeGreaterThan(0);
    expect(points.at(-1)!.y).toBeLessThan(0);
    // the avatar is 64 across, the rope runs out to 40 around its centre, the name starts 16 right of it and the
    // seat has 28 of room round it: a dot's stop ring (9 out from the dot's centre) stays inside all of that
    expect(RING_RADIUS - 9).toBeGreaterThan(40);
    expect(Math.max(...points.map((point) => point.x)) + 9).toBeLessThan(32 + 16);
    for (const { x, y } of points) {
      expect(Math.abs(y) + 9).toBeLessThanOrEqual(32 + 28);
      expect(x - 9).toBeGreaterThanOrEqual(-(32 + 28));
    }
    // a dot's hit area (20 across) is as wide as the gap to its neighbours: the dots don't cover one another
    for (let index = 1; index < points.length; index++) {
      expect(Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)).toBeGreaterThan(19.5);
    }
  });
});
