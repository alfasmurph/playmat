package org.mage.test.AI.basic;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import org.junit.Assert;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBaseAI;

/**
 * AI must not cast a pact (Pact of Negation, Summoner's Pact...) it can't pay at its next upkeep: that loses the game.
 * Skill 3 like the shipped opponents: it searches 4 actions deep (the upkeep is out of reach) and adds score noise.
 *
 * @author alfasmurph
 */
public class PactAITest extends CardTestPlayerBaseAI {

    @Override
    public int getSkillLevel() {
        return 3;
    }

    private void assertNotLost() {
        Assert.assertFalse("AI must not lose to its own pact", currentGame.getPlayer(playerA.getId()).hasLost());
        Assert.assertFalse("AI must not lose to its own pact", currentGame.getState().isGameOver());
    }

    @Test
    public void test_PactOfNegation_NoMana_MustNotCast() {
        // Counter target spell.
        // At the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game.
        addCard(Zone.HAND, playerA, "Pact of Negation", 1);
        //
        addCard(Zone.HAND, playerB, "Craw Wurm", 1); // {4}{G}{G} 6/4
        addCard(Zone.BATTLEFIELD, playerB, "Forest", 6);

        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerB, "Craw Wurm");

        setStopAt(3, PhaseStep.PRECOMBAT_MAIN);
        execute();

        assertNotLost();
        assertHandCount(playerA, "Pact of Negation", 1);
        assertPermanentCount(playerB, "Craw Wurm", 1);
    }

    @Test
    public void test_PactOfNegation_NotEnoughBlue_MustNotCast() {
        // four mana, but only one blue: {3}{U}{U} can't be paid
        addCard(Zone.HAND, playerA, "Pact of Negation", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Mountain", 3);
        //
        addCard(Zone.HAND, playerB, "Craw Wurm", 1);
        addCard(Zone.BATTLEFIELD, playerB, "Forest", 6);

        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerB, "Craw Wurm");

        setStopAt(3, PhaseStep.PRECOMBAT_MAIN);
        execute();

        assertNotLost();
        assertHandCount(playerA, "Pact of Negation", 1);
        assertPermanentCount(playerB, "Craw Wurm", 1);
    }

    @Test
    public void test_PactOfNegation_EnoughMana_CanCastAndPays() {
        // five Islands pay {3}{U}{U} at the next upkeep, so the pact is allowed (AI may or may not use it)
        addCard(Zone.HAND, playerA, "Pact of Negation", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 5);
        //
        addCard(Zone.HAND, playerB, "Craw Wurm", 1);
        addCard(Zone.BATTLEFIELD, playerB, "Forest", 6);

        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerB, "Craw Wurm");

        setStopAt(3, PhaseStep.PRECOMBAT_MAIN);
        execute();

        assertNotLost();
        boolean pactCast = currentGame.getPlayer(playerA.getId()).getGraveyard().getCards(currentGame)
                .stream().anyMatch(card -> card.getName().equals("Pact of Negation"));
        if (pactCast) {
            // paid at the upkeep: all five Islands tapped for it
            assertPermanentCount(playerB, "Craw Wurm", 0);
            assertTappedCount("Island", true, 5);
        }
    }

    @Test
    public void test_SummonersPact_NotEnoughGreen_MustNotCast() {
        // Search your library for a green creature card, reveal it, put it into your hand, then shuffle.
        // At the beginning of your next upkeep, pay {2}{G}{G}. If you don't, you lose the game.
        addCard(Zone.HAND, playerA, "Summoner's Pact", 1);
        addCard(Zone.LIBRARY, playerA, "Craw Wurm", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Forest", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 3);

        setStopAt(3, PhaseStep.PRECOMBAT_MAIN);
        execute();

        assertNotLost();
        assertHandCount(playerA, "Summoner's Pact", 1);
    }
}
