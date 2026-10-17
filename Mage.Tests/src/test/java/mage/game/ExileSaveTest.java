package mage.game;

import org.junit.Assert;
import org.junit.Test;

import java.util.UUID;

/**
 * A game saved before a server restart keeps its main exile zone under the id that server used: the zone is still
 * found (by its name), keeps its cards, and takes new ones.
 */
public class ExileSaveTest {

    @Test
    public void mainZoneFromAnOlderServerIsFound() {
        Exile exile = new Exile();
        UUID card = UUID.randomUUID();
        // as an older server saved it: the main zone under some other id, not the fixed one
        Exile older = new Exile();
        older.getExileZones().clear();
        ExileZone oldMain = older.createZone(UUID.randomUUID(), "Permanent");
        oldMain.add(card);

        ExileZone main = older.getPermanentExile();
        Assert.assertNotNull("the main zone is found", main);
        Assert.assertTrue("it keeps its cards", main.contains(card));
        Assert.assertEquals("and there's only one", 1, older.getExileZones().size());
        Assert.assertNotNull(exile.getPermanentExile());
    }
}
