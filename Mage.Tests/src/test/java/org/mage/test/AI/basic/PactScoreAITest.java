package org.mage.test.AI.basic;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import mage.player.ai.score.GameStateEvaluator2;
import org.junit.Assert;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBase;

/**
 * AI's game evaluator must score a pact that can't be paid at the next upkeep as a lost game, right after it's cast
 * (the upkeep itself is beyond the AI's search depth). Pacts are cast by script here, see PactAITest for AI play.
 *
 * @author alfasmurph
 */
public class PactScoreAITest extends CardTestPlayerBase {

    @Test
    public void test_Evaluator_UnpayablePactIsLost() {
        // pact cast by script: AI's evaluator must see the coming loss long before the upkeep
        addCard(Zone.HAND, playerA, "Pact of Negation", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 2);
        addCard(Zone.BATTLEFIELD, playerA, "Mana Vault", 1, true); // tapped and doesn't untap during untap step
        //
        addCard(Zone.HAND, playerB, "Craw Wurm", 1);
        addCard(Zone.BATTLEFIELD, playerB, "Forest", 6);

        setChoice(playerA, false); // Mana Vault: don't pay {4} to untap it

        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerB, "Craw Wurm");
        runCode("before pact", 2, PhaseStep.PRECOMBAT_MAIN, playerA, (info, player, game) -> {
            Assert.assertNotEquals(GameStateEvaluator2.LOSE_GAME_SCORE,
                    GameStateEvaluator2.evaluate(player.getId(), game).getTotalScore());
        });
        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerA, "Pact of Negation", "Craw Wurm", "Craw Wurm");
        runCode("after pact", 2, PhaseStep.POSTCOMBAT_MAIN, playerA, (info, player, game) -> {
            Assert.assertEquals(GameStateEvaluator2.LOSE_GAME_SCORE,
                    GameStateEvaluator2.evaluate(player.getId(), game).getTotalScore());
        });

        setStopAt(2, PhaseStep.END_TURN);
        setStrictChooseMode(true);
        execute();

        assertPermanentCount(playerB, "Craw Wurm", 0);
    }

    @Test
    public void test_Evaluator_PayableWithTappedLands() {
        // lands tapped now untap before the upkeep, so the pact is payable
        addCard(Zone.HAND, playerA, "Pact of Negation", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 5, true);
        //
        addCard(Zone.HAND, playerB, "Craw Wurm", 1);
        addCard(Zone.BATTLEFIELD, playerB, "Forest", 6);

        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerB, "Craw Wurm");
        castSpell(2, PhaseStep.PRECOMBAT_MAIN, playerA, "Pact of Negation", "Craw Wurm", "Craw Wurm");
        runCode("after pact", 2, PhaseStep.POSTCOMBAT_MAIN, playerA, (info, player, game) -> {
            Assert.assertNotEquals(GameStateEvaluator2.LOSE_GAME_SCORE,
                    GameStateEvaluator2.evaluate(player.getId(), game).getTotalScore());
        });

        setStopAt(2, PhaseStep.END_TURN);
        setStrictChooseMode(true);
        execute();

        assertPermanentCount(playerB, "Craw Wurm", 0);
    }
}
