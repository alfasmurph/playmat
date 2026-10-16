package org.mage.test.cards.single.shm;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBase;

/**
 * {@link mage.cards.h.HorizonStone Horizon Stone}
 * If you would lose unspent mana, that mana becomes colorless instead.
 */
public class HorizonStoneTest extends CardTestPlayerBase {

    @Test
    public void test_UnspentManaStaysAsColorless() {
        addCard(Zone.BATTLEFIELD, playerA, "Horizon Stone");
        addCard(Zone.BATTLEFIELD, playerA, "Mountain");

        activateManaAbility(1, PhaseStep.PRECOMBAT_MAIN, playerA, "{T}: Add {R}");
        checkManaPool("red in main", 1, PhaseStep.PRECOMBAT_MAIN, playerA, "R", 1);
        // the step ends: instead of emptying, the red becomes colorless and stays
        checkManaPool("colorless in combat", 1, PhaseStep.BEGIN_COMBAT, playerA, "C", 1);
        checkManaPool("still there in main 2", 1, PhaseStep.POSTCOMBAT_MAIN, playerA, "C", 1);

        setStopAt(1, PhaseStep.END_TURN);
        execute();
    }

    @Test
    public void test_WithoutStoneManaEmpties() {
        addCard(Zone.BATTLEFIELD, playerA, "Mountain");

        activateManaAbility(1, PhaseStep.PRECOMBAT_MAIN, playerA, "{T}: Add {R}");
        checkManaPool("gone in combat", 1, PhaseStep.BEGIN_COMBAT, playerA, "C", 0);

        setStopAt(1, PhaseStep.END_TURN);
        execute();
    }
}
