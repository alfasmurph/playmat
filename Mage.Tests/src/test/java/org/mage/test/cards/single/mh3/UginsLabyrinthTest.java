package org.mage.test.cards.single.mh3;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBase;

/**
 * {@link mage.cards.u.UginsLabyrinth Ugin's Labyrinth}
 * Imprint — When Ugin's Labyrinth enters, you may exile a colorless card with mana value 7 or greater from your hand.
 * {T}: Add {C}. If a card is exiled with Ugin's Labyrinth, add {C}{C} instead.
 * {T}: Return the exiled card to its owner's hand.
 */
public class UginsLabyrinthTest extends CardTestPlayerBase {

    private static final String labyrinth = "Ugin's Labyrinth";
    private static final String ulamog = "Ulamog, the Ceaseless Hunger";

    @Test
    public void test_ImprintedAddsTwo() {
        setStrictChooseMode(true);

        addCard(Zone.HAND, playerA, labyrinth);
        addCard(Zone.HAND, playerA, ulamog);

        playLand(1, PhaseStep.PRECOMBAT_MAIN, playerA, labyrinth);
        setChoice(playerA, ulamog);

        activateManaAbility(3, PhaseStep.PRECOMBAT_MAIN, playerA, "{T}: Add {C}. If a card is exiled");
        checkManaPool("two colorless", 3, PhaseStep.PRECOMBAT_MAIN, playerA, "C", 2);

        setStopAt(3, PhaseStep.BEGIN_COMBAT);
        execute();

        assertExileCount(playerA, ulamog, 1);
    }

    @Test
    public void test_NothingImprintedAddsOne() {
        setStrictChooseMode(true);

        addCard(Zone.BATTLEFIELD, playerA, labyrinth);

        activateManaAbility(1, PhaseStep.PRECOMBAT_MAIN, playerA, "{T}: Add {C}. If a card is exiled");
        checkManaPool("one colorless", 1, PhaseStep.PRECOMBAT_MAIN, playerA, "C", 1);

        setStopAt(1, PhaseStep.BEGIN_COMBAT);
        execute();
    }

    @Test
    public void test_ImprintedCountsAsTwoForWhatYouCanCast() {
        setStrictChooseMode(true);

        addCard(Zone.HAND, playerA, labyrinth);
        addCard(Zone.HAND, playerA, ulamog);
        addCard(Zone.HAND, playerA, "Ugin, the Ineffable"); // {6}
        addCard(Zone.BATTLEFIELD, playerA, "Wastes", 4);

        playLand(1, PhaseStep.PRECOMBAT_MAIN, playerA, labyrinth);
        setChoice(playerA, ulamog);

        // four Wastes and the Labyrinth's two: six, enough for Ugin
        checkPlayableAbility("Ugin castable", 3, PhaseStep.PRECOMBAT_MAIN, playerA, "Cast Ugin, the Ineffable", true);
        castSpell(3, PhaseStep.PRECOMBAT_MAIN, playerA, "Ugin, the Ineffable");

        setStopAt(3, PhaseStep.BEGIN_COMBAT);
        execute();

        assertPermanentCount(playerA, "Ugin, the Ineffable", 1);
    }
}
