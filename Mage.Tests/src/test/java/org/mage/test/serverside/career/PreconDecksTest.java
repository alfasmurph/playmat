package org.mage.test.serverside.career;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import mage.cards.decks.Deck;
import mage.cards.decks.DeckCardLists;
import mage.cards.decks.DeckValidator;
import mage.cards.decks.DeckValidatorError;
import mage.cards.decks.importer.DeckImporter;
import mage.cards.repository.CardScanner;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * The real Commander precons the web client offers (Mage.Web.Client/public/precons, built by
 * scripts/build-precons.mjs) are legal Commander decks: a precon with a card banned since it was printed would fail
 * when a game starts.
 */
public class PreconDecksTest {

    private static final Path PRECONS = Paths.get("../Mage.Web.Client/public/precons");

    @Before
    public void setUp() {
        CardScanner.scan();
    }

    @Test
    public void everyPreconIsALegalCommanderDeck() throws Exception {
        DeckValidator validator = CareerDeckTool.validator("Variant Magic - Commander");
        Assert.assertNotNull("Commander validator from config.xml", validator);
        List<String> problems = new ArrayList<>();
        int decks = 0;
        JsonArray sets = JsonParser.parseString(new String(Files.readAllBytes(PRECONS.resolve("index.json")), StandardCharsets.UTF_8)).getAsJsonArray();
        for (JsonElement set : sets) {
            for (JsonElement entry : set.getAsJsonObject().getAsJsonArray("decks")) {
                String file = entry.getAsJsonObject().get("file").getAsString();
                decks++;
                StringBuilder errors = new StringBuilder();
                DeckCardLists lists = DeckImporter.importDeckFromFile(PRECONS.resolve(file).toString(), errors, false);
                if (lists == null || lists.getCards().isEmpty()) {
                    problems.add(file + ": can't be read " + errors);
                    continue;
                }
                Deck deck = Deck.load(lists, true, false);
                if (!validator.validate(deck)) {
                    for (DeckValidatorError error : validator.getErrorsListSorted(10)) {
                        problems.add(file + ": " + error.getGroup() + " " + error.getMessage());
                    }
                }
            }
        }
        Assert.assertTrue("precons in the index", decks > 0);
        Assert.assertEquals("precons that aren't legal Commander decks", new ArrayList<>(), problems);
    }
}
