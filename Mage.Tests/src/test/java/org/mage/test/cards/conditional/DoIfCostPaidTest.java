package org.mage.test.cards.conditional;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBase;

/**
 * @author Quercitron, JayDi85
 */
public class DoIfCostPaidTest extends CardTestPlayerBase {

    @Test
    public void test_NonOptional() {
        addCard(Zone.BATTLEFIELD, playerA, "Mountain", 1);
        // Shock deals 2 damage to any target.
        addCard(Zone.HAND, playerA, "Shock", 1);

        // When a source an opponent controls deals damage to you, sacrifice Awaken the Sky Tyrant.
        // If you do, put a 5/5 red Dragon creature token with flying onto the battlefield.
        addCard(Zone.BATTLEFIELD, playerB, "Awaken the Sky Tyrant");

        castSpell(1, PhaseStep.PRECOMBAT_MAIN, playerA, "Shock", playerB);

        setStrictChooseMode(true);
        setStopAt(1, PhaseStep.BEGIN_COMBAT);
        execute();

        assertPermanentCount(playerB, "Awaken the Sky Tyrant", 0);
        assertPermanentCount(playerB, "Dragon Token", 1);
    }

    @Test
    public void test_Optional_ManaVault_1() {
        // Mana Vault doesn't untap during your untap step.
        // At the beginning of your upkeep, you may pay {4}. If you do, untap Mana Vault.
        // At the beginning of your draw step, if Mana Vault is tapped, it deals 1 damage to you.
        // {T}: Add {C}{C}{C}.
        addCard(Zone.BATTLEFIELD, playerA, "Mana Vault", 1);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 4);

        // turn 1 - untapped: paying {4} would do nothing, so no question
        checkPermanentTapped("must be untapped on start", 1, PhaseStep.PRECOMBAT_MAIN, playerA, "Mana Vault", false, 1);
        checkLife("no damage on untapped", 1, PhaseStep.PRECOMBAT_MAIN, playerA, 20);

        // turn 2 - tap
        activateManaAbility(2, PhaseStep.PRECOMBAT_MAIN, playerA, "{T}: Add {C}");
        checkPermanentTapped("must be tapped after usage", 2, PhaseStep.PRECOMBAT_MAIN, playerA, "Mana Vault", true, 1);

        // turn 3 - tapped and ask about untap (do not pay)
        setChoice(playerA, false);
        checkPermanentTapped("must be tapped after dialog", 3, PhaseStep.PRECOMBAT_MAIN, playerA, "Mana Vault", true, 1);
        checkLife("must do damage on tapped", 3, PhaseStep.PRECOMBAT_MAIN, playerA, 20 - 1);

        // turn 4 - nothing

        // turn 5 - tapped and ask about untap (do pay)
        setChoice(playerA, true);
        checkPermanentTapped("must be untapped after dialog", 5, PhaseStep.PRECOMBAT_MAIN, playerA, "Mana Vault", false, 1);
        checkLife("no damage on untapped", 5, PhaseStep.PRECOMBAT_MAIN, playerA, 20 - 1); // -1 from old damage

        setStrictChooseMode(true);
        setStopAt(5, PhaseStep.END_TURN);
        execute();
    }

    @Test
    public void test_Optional_UntapCostOtherThanMana_StillAsks() {
        // Elaborate Firecannon doesn't untap during your untap step.
        // At the beginning of your upkeep, you may discard a card. If you do, untap Elaborate Firecannon.
        // (a discard can matter by itself, e.g. madness: the question stays even when it's untapped)
        addCard(Zone.BATTLEFIELD, playerA, "Elaborate Firecannon", 1);
        addCard(Zone.HAND, playerA, "Grizzly Bears", 1);

        setChoice(playerA, true);
        setChoice(playerA, "Grizzly Bears");

        setStrictChooseMode(true);
        setStopAt(1, PhaseStep.PRECOMBAT_MAIN);
        execute();

        assertGraveyardCount(playerA, "Grizzly Bears", 1);
    }

    @Test
    public void test_Optional_ManaVault_2() {
        // Make sure combos still work, see https://github.com/magefree/mage/issues/2656
        // Example:
        // When Mana Vault is untapped you can respond to the trigger: tap it for mana, then pay 4 to untap it.
        // The question is only skipped while Mana Vault is untapped as the trigger resolves.
        // That's legal according to the rules and would net mana if Mana Reflection was in play, would allow
        // self milling with Mesmeric Orb in play, and I'm sure many other interactions that change the game state.

        // Mana Vault doesn't untap during your untap step.
        // At the beginning of your upkeep, you may pay {4}. If you do, untap Mana Vault.
        // At the beginning of your draw step, if Mana Vault is tapped, it deals 1 damage to you.
        // {T}: Add {C}{C}{C}.
        addCard(Zone.BATTLEFIELD, playerA, "Mana Vault", 1);
        //
        // If you tap a permanent for mana, it produces twice as much of that mana instead.
        addCard(Zone.BATTLEFIELD, playerA, "Mana Reflection", 1);
        //
        // Whenever a permanent becomes untapped, that permanent's controller puts the top card of
        // their library into their graveyard.
        addCard(Zone.BATTLEFIELD, playerA, "Mesmeric Orb", 1);

        // tap it in response to the trigger, then pay from the floating mana
        activateManaAbility(1, PhaseStep.UPKEEP, playerA, "{T}: Add {C}");
        setChoice(playerA, true);
        checkPermanentTapped("must be untapped", 1, PhaseStep.PRECOMBAT_MAIN, playerA, "Mana Vault", false, 1);
        checkLife("no damage on untapped", 1, PhaseStep.PRECOMBAT_MAIN, playerA, 20);

        checkGraveyardCount("must mill", 1, PhaseStep.PRECOMBAT_MAIN, playerA, "Mountain", 1);

        setStrictChooseMode(true);
        setStopAt(1, PhaseStep.END_TURN);
        execute();
    }

    @Test
    public void testCannotPay() {
        String thirst = "Thirst for Meaning"; // Draw three cards. Then discard two cards unless you discard an enchantment card.
        skipInitShuffling();
        addCard(Zone.LIBRARY, playerA, "Craw Wurm");
        addCard(Zone.LIBRARY, playerA, "Runeclaw Bear");
        addCard(Zone.LIBRARY, playerA, "Glory Seeker");
        addCard(Zone.HAND, playerA, thirst);
        addCard(Zone.BATTLEFIELD, playerA, "Island", 3);

        castSpell(1, PhaseStep.PRECOMBAT_MAIN, playerA, thirst);
        // can't discard enchantment, so must discard two
        setChoice(playerA, "Runeclaw Bear");
        setChoice(playerA, "Glory Seeker");

        setStrictChooseMode(true);
        setStopAt(1, PhaseStep.END_TURN);
        execute();

        assertGraveyardCount(playerA, 3);
        assertGraveyardCount(playerA, thirst, 1);
        assertGraveyardCount(playerA, "Runeclaw Bear", 1);
        assertGraveyardCount(playerA, "Glory Seeker", 1);
        assertHandCount(playerA, 1);
        assertHandCount(playerA, "Craw Wurm", 1);
    }

}
