package mage.server.game;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import mage.game.permanent.Permanent;
import org.junit.Assert;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBase;

import java.util.Map;

/**
 * The extra mana a source makes from other cards (ManaBonus): Forsaken Monument adds {C} to a permanent tapped for
 * {C}; Kinnan adds one to a nonland permanent; plain lands with neither get none.
 */
public class ManaBonusTest extends CardTestPlayerBase {

    private int bonusOf(Map<String, Integer> bonus, String name) {
        Permanent permanent = getPermanent(name, playerA);
        return bonus.getOrDefault(permanent.getId().toString(), 0);
    }

    @Test
    public void test_MonumentAndKinnan() {
        addCard(Zone.BATTLEFIELD, playerA, "Forsaken Monument");
        addCard(Zone.BATTLEFIELD, playerA, "Kinnan, Bonder Prodigy");
        addCard(Zone.BATTLEFIELD, playerA, "Wastes");
        addCard(Zone.BATTLEFIELD, playerA, "Sol Ring");
        addCard(Zone.BATTLEFIELD, playerA, "Mountain");

        setStopAt(1, PhaseStep.PRECOMBAT_MAIN);
        execute();

        Map<String, Integer> bonus = ManaBonus.of(currentGame, playerA.getId());
        Assert.assertEquals("Wastes: Monument's {C}", 1, bonusOf(bonus, "Wastes"));
        Assert.assertEquals("Sol Ring: Monument's {C} and Kinnan's one", 2, bonusOf(bonus, "Sol Ring"));
        Assert.assertEquals("Mountain: neither (red, and a land)", 0, bonusOf(bonus, "Mountain"));
    }

    @Test
    public void test_NothingWithoutBonusCards() {
        addCard(Zone.BATTLEFIELD, playerA, "Wastes");
        addCard(Zone.BATTLEFIELD, playerA, "Sol Ring");

        setStopAt(1, PhaseStep.PRECOMBAT_MAIN);
        execute();

        Assert.assertTrue(ManaBonus.of(currentGame, playerA.getId()).isEmpty());
    }
}
