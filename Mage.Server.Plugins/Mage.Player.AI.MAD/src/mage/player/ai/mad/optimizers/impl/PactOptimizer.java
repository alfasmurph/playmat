package mage.player.ai.mad.optimizers.impl;

import mage.abilities.Ability;
import mage.abilities.SpellAbility;
import mage.game.Game;
import mage.player.ai.score.PactPaymentChecker;

import java.util.List;

/**
 * AI: removes pact spells (Pact of Negation, Summoner's Pact, ...) whose upkeep cost can't be paid, so the AI
 * doesn't lose the game to them
 *
 * @author alfasmurph
 */
public class PactOptimizer extends BaseTreeOptimizer {

    @Override
    public void filter(Game game, List<Ability> actions, List<Ability> actionsToRemove) {
        for (Ability ability : actions) {
            if (ability instanceof SpellAbility
                    && PactPaymentChecker.isUnpayablePactSpell(ability.getControllerId(), ability, game)) {
                actionsToRemove.add(ability);
            }
        }
    }
}
