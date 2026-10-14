import type { CombatStops, TurnCombatStops } from '../../core/game/autoPass';
import type { PhaseStep, SkipPrioritySteps, UserSkipPrioritySteps } from '../../protocol/generated/views';

/** One step of the turn as the ring around the active seat shows it: a dot, and the stop it toggles. */
export interface TurnStep {
  /** the step's short name (both mains are "Main") */
  label: string;
  /** the dot's name: the two mains need telling apart */
  name: string;
  /** the server's steps the dot stands for */
  steps: PhaseStep[];
  /** the stop setting this dot toggles */
  stop?: keyof SkipPrioritySteps;
  /** a combat stop (kept by the client: the server always offers priority there) */
  combat?: keyof CombatStops;
}

export const TURN_STEPS: readonly TurnStep[] = [
  { label: 'Upkeep', name: 'Upkeep', steps: ['UNTAP', 'UPKEEP'], stop: 'upkeep' },
  { label: 'Draw', name: 'Draw', steps: ['DRAW'], stop: 'draw' },
  { label: 'Main', name: 'Main, before combat', steps: ['PRECOMBAT_MAIN'], stop: 'main1' },
  { label: 'Combat', name: 'Beginning of combat', steps: ['BEGIN_COMBAT'], stop: 'beforeCombat' },
  { label: 'Attack', name: 'Declare attackers', steps: ['DECLARE_ATTACKERS'], combat: 'attackers' },
  { label: 'Block', name: 'Declare blockers', steps: ['DECLARE_BLOCKERS'], combat: 'blockers' },
  { label: 'Damage', name: 'Combat damage', steps: ['FIRST_COMBAT_DAMAGE', 'COMBAT_DAMAGE', 'END_COMBAT'], stop: 'endOfCombat' },
  { label: 'Main', name: 'Main, after combat', steps: ['POSTCOMBAT_MAIN'], stop: 'main2' },
  { label: 'End', name: 'End of turn', steps: ['END_TURN', 'CLEANUP'], stop: 'endOfTurn' },
];

export type DotState = 'past' | 'current' | 'future';

/** Where the turn is among the dots: -1 before the first step (or a step the ring doesn't know). */
export function stepIndex(step: PhaseStep | undefined): number {
  return step ? TURN_STEPS.findIndex((turnStep) => turnStep.steps.includes(step)) : -1;
}

/** Each dot's place in the turn: the steps already gone this turn, the one being played, the ones to come. */
export function dotStates(step: PhaseStep | undefined): DotState[] {
  const current = stepIndex(step);
  return TURN_STEPS.map((_, index) => (index < current ? 'past' : index === current ? 'current' : 'future'));
}

/** Whose turn the stops are for: the dots on your seat set your turn's stops, those on an opponent's seat theirs. */
export type StopSide = keyof TurnCombatStops;

interface StopSettings {
  stops: UserSkipPrioritySteps;
  combatStops: TurnCombatStops;
}

/** The player's own stop at this step on that side's turn (full control aside). */
export function stopSet(settings: StopSettings, side: StopSide, turnStep: TurnStep): boolean {
  if (turnStep.stop) return !!settings.stops[side]?.[turnStep.stop];
  if (turnStep.combat) return !!settings.combatStops[side]?.[turnStep.combat];
  return false;
}

/**
 * The settings patch that turns the stop at this step on or off. Your beginning of combat is a server stop the
 * client keeps only for a Vehicle to crew unless you set it here (core/game/stops, core/game/autoPass).
 */
export function toggledStops(settings: StopSettings, side: StopSide, turnStep: TurnStep, on: boolean): Partial<StopSettings> {
  if (turnStep.stop) return { stops: { ...settings.stops, [side]: { ...settings.stops[side], [turnStep.stop]: on } } };
  if (turnStep.combat) return { combatStops: { ...settings.combatStops, [side]: { ...settings.combatStops[side], [turnStep.combat]: on } } };
  return {};
}

/**
 * The ring's geometry, in stage pixels from the centre of the avatar disc (64 across). The priority rope runs around
 * the disc out to about 40px, so the dots and their stop rings sit clear of it, inside the seat's padding. They run
 * clockwise from lower left, over the top, to upper right, leaving the disc's right side to the name and life.
 */
export const RING_RADIUS = 50;
const RING_START = 222;
const RING_STEP = 23;

/** Where a dot sits around the avatar, in stage pixels from the disc's centre. */
export function dotPosition(index: number): { x: number; y: number } {
  const angle = ((RING_START + index * RING_STEP) * Math.PI) / 180;
  return { x: Math.round(RING_RADIUS * Math.sin(angle) * 10) / 10, y: Math.round(-RING_RADIUS * Math.cos(angle) * 10) / 10 };
}
