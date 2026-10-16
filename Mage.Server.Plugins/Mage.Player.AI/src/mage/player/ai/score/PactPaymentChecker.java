package mage.player.ai.score;

import mage.Mana;
import mage.abilities.Ability;
import mage.abilities.DelayedTriggeredAbility;
import mage.abilities.common.delayed.PactDelayedTriggeredAbility;
import mage.abilities.costs.mana.ManaCosts;
import mage.abilities.effects.Effect;
import mage.abilities.effects.RestrictionEffect;
import mage.abilities.effects.common.CreateDelayedTriggeredAbilityEffect;
import mage.abilities.effects.common.DontUntapInControllersUntapStepEnchantedEffect;
import mage.abilities.effects.common.DontUntapInControllersUntapStepSourceEffect;
import mage.game.Game;
import mage.game.permanent.Permanent;
import mage.game.permanent.PermanentImpl;
import mage.players.Player;

import java.util.UUID;

/**
 * AI: pacts (Pact of Negation, Summoner's Pact, ...) cost nothing now but lose the game at the next upkeep if
 * their cost isn't paid. That upkeep is beyond the AI's search depth, so the evaluator asks here instead.
 * <p>
 * The estimate is the mana the player's sources will make after their untap step: tapped permanents count as
 * untapped (unless something keeps them tapped), creatures lose summoning sickness, the mana pool is empty and
 * there is no land drop yet. It errs on the side of "can't pay", which only costs the AI a pact it could have cast.
 *
 * @author alfasmurph
 */
public final class PactPaymentChecker {

    private PactPaymentChecker() {
    }

    /**
     * Pending pact triggers of the player that the player can't pay at their next upkeep (all pacts pay together)
     */
    public static boolean hasUnpayablePact(UUID playerId, Game game) {
        Mana needed = null;
        for (DelayedTriggeredAbility ability : game.getState().getDelayed()) {
            if (ability instanceof PactDelayedTriggeredAbility
                    && playerId.equals(ability.getControllerId())) {
                ManaCosts cost = ((PactDelayedTriggeredAbility) ability).getPactCost();
                if (cost != null) {
                    if (needed == null) {
                        needed = new Mana();
                    }
                    needed.add(cost.getMana());
                }
            }
        }
        return needed != null && !canPayAtNextUpkeep(playerId, needed, game);
    }

    /**
     * Casting this spell creates a pact trigger the player can't pay at their next upkeep (together with the
     * pacts already pending)
     */
    public static boolean isUnpayablePactSpell(UUID playerId, Ability ability, Game game) {
        Mana needed = null;
        for (Effect effect : ability.getEffects()) {
            if (effect instanceof CreateDelayedTriggeredAbilityEffect
                    && ((CreateDelayedTriggeredAbilityEffect) effect).getDelayedAbility() instanceof PactDelayedTriggeredAbility) {
                ManaCosts cost = ((PactDelayedTriggeredAbility) ((CreateDelayedTriggeredAbilityEffect) effect).getDelayedAbility()).getPactCost();
                if (cost != null) {
                    if (needed == null) {
                        needed = new Mana();
                    }
                    needed.add(cost.getMana());
                }
            }
        }
        if (needed == null) {
            return false;
        }
        for (DelayedTriggeredAbility delayed : game.getState().getDelayed()) {
            if (delayed instanceof PactDelayedTriggeredAbility
                    && playerId.equals(delayed.getControllerId())) {
                ManaCosts cost = ((PactDelayedTriggeredAbility) delayed).getPactCost();
                if (cost != null) {
                    needed.add(cost.getMana());
                }
            }
        }
        return !canPayAtNextUpkeep(playerId, needed, game);
    }

    private static boolean canPayAtNextUpkeep(UUID playerId, Mana needed, Game game) {
        // work on a copy: untapping and the mana calc must not touch the evaluated game
        Game sim = game.createSimulationForPlayableCalc();
        Player player = sim.getPlayer(playerId);
        if (player == null) {
            return false;
        }
        player.getManaPool().init(); // mana pool empties before the upkeep

        // "untap no more than" effects (Winter Orb, Static Orb...) need a player choice: just don't untap anything
        boolean untapLimited = !sim.getContinuousEffects().getApplicableRestrictionUntapNotMoreThanEffects(player, sim).isEmpty();
        for (Permanent permanent : sim.getBattlefield().getAllActivePermanents(playerId)) {
            if (permanent instanceof PermanentImpl) {
                ((PermanentImpl) permanent).removeSummoningSickness();
            }
            if (permanent.isTapped() && !untapLimited && willUntap(permanent, sim)) {
                permanent.setTapped(false);
            }
        }
        return player.getManaAvailable(sim).enough(needed);
    }

    private static boolean willUntap(Permanent permanent, Game game) {
        for (RestrictionEffect effect : game.getContinuousEffects().getApplicableRestrictionEffects(permanent, game).keySet()) {
            if (!effect.canBeUntapped(permanent, null, game, true)) {
                return false;
            }
        }
        // "doesn't untap during your untap step" (Mana Vault, Grim Monolith...) only applies during the untap step,
        // so look for it on the permanent and its auras instead of asking the effect
        for (Ability ability : permanent.getAbilities(game)) {
            for (Effect effect : ability.getEffects()) {
                if (effect instanceof DontUntapInControllersUntapStepSourceEffect) {
                    return false;
                }
            }
        }
        for (UUID attachmentId : permanent.getAttachments()) {
            Permanent attachment = game.getPermanent(attachmentId);
            if (attachment == null) {
                continue;
            }
            for (Ability ability : attachment.getAbilities(game)) {
                for (Effect effect : ability.getEffects()) {
                    if (effect instanceof DontUntapInControllersUntapStepEnchantedEffect) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
}
