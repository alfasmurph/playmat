import { useEffect, useRef } from 'react';
import {
  handNeeds, manaChoiceAnswer, manaSource, nextPoolMana, nextTap, parseCost, type ManaColor, type ManaSource,
} from '../../core/game/autoPay';
import type { GameSession, GameSessionState } from '../../core/game/gameSession';
import { parsePayment, POOL_MANA, poolId, spellPaidFor } from '../../core/game/payment';
import type { Prompt } from '../../core/game/prompt';
import type { ManaType } from '../../protocol/generated/views';
import type { PlayerBoard } from './boardModel';

const TAP_DELAY_MS = 220;

const POOL_COLOR: Partial<Record<ManaType, ManaColor>> = { WHITE: 'W', BLUE: 'U', BLACK: 'B', RED: 'R', GREEN: 'G', COLORLESS: 'C' };

/**
 * Pays mana costs for the player when the payment is unambiguous: spends floating mana or taps one source, waits
 * for the server to ask for the rest, and repeats. Stops (leaving the payment to the player) as soon as a choice
 * would be needed or a payment doesn't change what's still owed. Floating mana is spent whenever the player is
 * playing; sources are tapped only with auto-pay on (`tapLands`).
 */
export function useAutoPay(
  session: GameSession, state: GameSessionState, me: PlayerBoard | null, playing: boolean, tapLands: boolean, spareOnly = true,
) {
  const lastAsk = useRef<{ text: string; tries: number; pool: ManaColor | null } | null>(null);
  /** floating mana the server wouldn't take for this payment: conditional mana (Mishra's Workshop's) it can't use */
  const unusablePool = useRef<{ payment: string; colors: Set<ManaColor> }>({ payment: '', colors: new Set() });
  /** the source just tapped, and the color it was tapped for: the answer if the server asks which mana it adds */
  const tapped = useRef<{ prompt: Prompt; name: string; color: ManaColor } | null>(null);
  const { interaction, awaitingServer, view } = state;
  const prompt = interaction.prompt;

  useEffect(() => {
    // the question right after a tap (a dual's two abilities, "one mana of any color") is about that tap
    const tap = tapped.current;
    if (tap && !awaitingServer && prompt && prompt !== tap.prompt) {
      const answer = tapLands && interaction.mode === 'panel' ? manaChoiceAnswer(prompt, tap.name, tap.color) : null;
      if (!answer) {
        tapped.current = null;
      } else {
        const timer = setTimeout(() => {
          tapped.current = null;
          void session.respond(answer).catch(() => undefined);
        }, TAP_DELAY_MS);
        return () => clearTimeout(timer);
      }
    }

    if (!playing || !me || awaitingServer || interaction.mode !== 'payMana' || prompt?.kind !== 'playMana' || prompt.isX) {
      if (interaction.mode !== 'payMana') lastAsk.current = null;
      if (interaction.mode === 'priority') unusablePool.current = { payment: '', colors: new Set() };
      return;
    }
    const text = prompt.text;
    const payment = parsePayment(prompt);
    if (unusablePool.current.payment !== (payment.sourceId ?? text)) {
      unusablePool.current = { payment: payment.sourceId ?? text, colors: new Set() };
    }
    if (lastAsk.current?.text === text && lastAsk.current.tries >= 1) {
      // the same request again after a tap means the tap didn't help: hand the payment back to the player, unless
      // it was floating mana, which is then conditional mana this cost can't use and is left alone
      if (!lastAsk.current.pool) return;
      unusablePool.current.colors.add(lastAsk.current.pool);
      lastAsk.current = { text, tries: 0, pool: null };
    }
    const cost = parseCost(text);
    if (!cost) return;

    // restricted mana ("Spend this mana only to cast artifact spells") only for a spell it can pay for
    const spell = spellPaidFor(view, payment.sourceId);
    const permanents = new Map(me.back.concat(me.front).flatMap((group) => group.members).map((permanent) => [permanent.id!, permanent]));
    const sources: ManaSource[] = [];
    for (const id of interaction.clickable.keys()) {
      const permanent = permanents.get(id);
      if (!permanent || permanent.tapped) continue;
      const source = manaSource(id, permanent, spell);
      if (source) sources.push(source);
    }
    // generic mana leaves untapped the colors the rest of the hand still needs this turn
    const owed = cost.generic + Object.values(cost.colored).reduce((sum, value) => sum + (value ?? 0), 0);
    const handCosts = Object.values(view?.myHand ?? {}).map((card) => (card.manaCostLeftStr ?? []).join(''));
    // "only with spare mana": leave untapped what the rest of the hand needs; off, any source will do
    const keep = spareOnly ? handNeeds(handCosts, sources.length - owed) : {};
    // floating mana first: the server leaves a pool of mixed kinds alone
    const pool: Partial<Record<ManaColor, number>> = {};
    for (const { key, manaType } of POOL_MANA) {
      const color = POOL_COLOR[manaType];
      if (color && !unusablePool.current.colors.has(color) && interaction.clickable.has(poolId(manaType))) pool[color] = me.player.manaPool?.[key] ?? 0;
    }
    const fromPool = nextPoolMana(cost, pool, keep);
    const poolType = POOL_MANA.find(({ manaType }) => fromPool && POOL_COLOR[manaType] === fromPool)?.manaType;
    // floating mana is spent even with auto-pay off: it was tapped to pay, and it's no choice of which land to use
    const plan = poolType || !tapLands ? null : nextTap(cost, sources, keep);
    const next = poolType ? poolId(poolType) : plan?.id;
    if (!next) return;

    const timer = setTimeout(() => {
      lastAsk.current = { text, tries: lastAsk.current?.text === text ? lastAsk.current.tries + 1 : 1, pool: poolType ? fromPool : null };
      tapped.current = plan ? { prompt, name: permanents.get(plan.id)?.name ?? '', color: plan.color } : null;
      session.click(next);
    }, TAP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [playing, tapLands, spareOnly, me, awaitingServer, interaction, prompt, session, view]);
}
