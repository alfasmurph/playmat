import { useEffect, useRef } from 'react';
import { handNeeds, manaOf, nextPoolMana, nextSource, parseCost, type ManaColor, type ManaSource } from '../../core/game/autoPay';
import type { GameSession, GameSessionState } from '../../core/game/gameSession';
import { POOL_MANA, poolId } from '../../core/game/payment';
import type { ManaType } from '../../protocol/generated/views';
import type { PlayerBoard } from './boardModel';

const TAP_DELAY_MS = 220;

const POOL_COLOR: Partial<Record<ManaType, ManaColor>> = { WHITE: 'W', BLUE: 'U', BLACK: 'B', RED: 'R', GREEN: 'G', COLORLESS: 'C' };

/**
 * Pays mana costs for the player when the payment is unambiguous: spends floating mana or taps one source, waits
 * for the server to ask for the rest, and repeats. Stops (leaving the payment to the player) as soon as a choice
 * would be needed or a payment doesn't change what's still owed.
 */
export function useAutoPay(session: GameSession, state: GameSessionState, me: PlayerBoard | null, enabled: boolean) {
  const lastAsk = useRef<{ text: string; tries: number } | null>(null);
  const { interaction, awaitingServer, view } = state;
  const prompt = interaction.prompt;

  useEffect(() => {
    if (!enabled || !me || awaitingServer || interaction.mode !== 'payMana' || prompt?.kind !== 'playMana' || prompt.isX) {
      if (interaction.mode !== 'payMana') lastAsk.current = null;
      return;
    }
    const text = prompt.text;
    // the same request again after a tap means the tap didn't help: hand the payment back to the player
    if (lastAsk.current?.text === text && lastAsk.current.tries >= 1) return;
    const cost = parseCost(text);
    if (!cost) return;

    const permanents = new Map(me.back.concat(me.front).flatMap((group) => group.members).map((permanent) => [permanent.id!, permanent]));
    const sources: ManaSource[] = [];
    for (const id of interaction.clickable.keys()) {
      const permanent = permanents.get(id);
      if (!permanent || permanent.tapped) continue;
      const produces = manaOf(permanent);
      if (produces === undefined) continue;
      sources.push({ id, produces, isLand: (permanent.cardTypes ?? []).includes('LAND') });
    }
    // generic mana leaves untapped the colors the rest of the hand still needs this turn
    const owed = cost.generic + Object.values(cost.colored).reduce((sum, value) => sum + (value ?? 0), 0);
    const handCosts = Object.values(view?.myHand ?? {}).map((card) => (card.manaCostLeftStr ?? []).join(''));
    const keep = handNeeds(handCosts, sources.length - owed);
    // floating mana first: the server leaves a pool of mixed kinds alone
    const pool: Partial<Record<ManaColor, number>> = {};
    for (const { key, manaType } of POOL_MANA) {
      const color = POOL_COLOR[manaType];
      if (color && interaction.clickable.has(poolId(manaType))) pool[color] = me.player.manaPool?.[key] ?? 0;
    }
    const fromPool = nextPoolMana(cost, pool, keep);
    const poolType = POOL_MANA.find(({ manaType }) => fromPool && POOL_COLOR[manaType] === fromPool)?.manaType;
    const next = poolType ? poolId(poolType) : nextSource(cost, sources, keep);
    if (!next) return;

    const timer = setTimeout(() => {
      lastAsk.current = { text, tries: lastAsk.current?.text === text ? lastAsk.current.tries + 1 : 1 };
      session.click(next);
    }, TAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, me, awaitingServer, interaction, prompt, session, view]);
}
