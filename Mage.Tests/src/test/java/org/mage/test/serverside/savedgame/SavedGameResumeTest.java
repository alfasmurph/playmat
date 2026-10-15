package org.mage.test.serverside.savedgame;

import mage.constants.PhaseStep;
import mage.constants.Zone;
import mage.game.Game;
import mage.game.GameImpl;
import org.mage.test.player.TestPlayer;
import mage.util.CopierObjectInputStream;
import org.junit.Assert;
import org.junit.Test;
import org.mage.test.serverside.base.CardTestPlayerBaseAI;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.Arrays;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Feasibility of saved games: a game stopped at the start of a turn is written out whole, read back as a separate
 * game, and that copy plays on from the same turn, with the AI deciding, to later turns.
 */
public class SavedGameResumeTest extends CardTestPlayerBaseAI {

    @Override
    public List<String> getFullSimulatedPlayers() {
        return Arrays.asList("PlayerA", "PlayerB");
    }

    @Test
    public void aGameSavedAtATurnStartPlaysOnWhenLoaded() throws Exception {
        for (TestPlayer who : new TestPlayer[]{playerA, playerB}) {
            addCard(Zone.BATTLEFIELD, who, "Mountain", 3);
            addCard(Zone.BATTLEFIELD, who, "Grizzly Bears", 2);
            addCard(Zone.LIBRARY, who, "Mountain", 10);
            addCard(Zone.LIBRARY, who, "Hill Giant", 5);
        }

        setStopAt(3, PhaseStep.UNTAP);
        execute();
        Assert.assertEquals("stopped at the start of turn 3", 3, currentGame.getTurnNum());

        // save: the whole game, as the server writes a replay
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(new GZIPOutputStream(bytes))) {
            out.writeObject(currentGame);
        }
        int lifeA = currentGame.getPlayer(playerA.getId()).getLife();
        int lifeB = currentGame.getPlayer(playerB.getId()).getLife();
        System.out.println("saved game: " + bytes.size() + " bytes; life " + lifeA + " / " + lifeB);

        // load: a separate game object
        Game loaded;
        try (ObjectInputStream in = new CopierObjectInputStream(getClass().getClassLoader(),
                new GZIPInputStream(new ByteArrayInputStream(bytes.toByteArray())))) {
            loaded = (Game) in.readObject();
        }
        Assert.assertNotSame(currentGame, loaded);
        Assert.assertEquals(3, loaded.getTurnNum());
        Assert.assertEquals(lifeA, loaded.getPlayer(playerA.getId()).getLife());
        Assert.assertEquals(5, loaded.getBattlefield().getAllActivePermanents(playerA.getId()).size());

        // resume: play on from turn 3 to the start of turn 7
        loaded.getOptions().stopOnTurn = 7;
        loaded.getOptions().stopAtStep = PhaseStep.UNTAP;
        ((GameImpl) loaded).resumeAtTurnStart();

        Assert.assertEquals("the loaded game played on", 7, loaded.getTurnNum());
        int afterA = loaded.getPlayer(playerA.getId()).getLife();
        int afterB = loaded.getPlayer(playerB.getId()).getLife();
        System.out.println("after resuming: turn " + loaded.getTurnNum() + "; life " + afterA + " / " + afterB
                + "; permanents " + loaded.getBattlefield().getAllActivePermanents().size());
        Assert.assertTrue("something happened in the four turns played after loading", afterA != lifeA || afterB != lifeB
                || loaded.getBattlefield().getAllActivePermanents().size() != 10);
        // the original game is untouched
        Assert.assertEquals(3, currentGame.getTurnNum());
    }
}
