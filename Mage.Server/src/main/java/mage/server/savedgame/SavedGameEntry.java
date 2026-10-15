package mage.server.savedgame;

import java.util.ArrayList;
import java.util.List;

/** A saved game against the AI the player can play on (savedGameList). */
public class SavedGameEntry {
    public String gameId;
    /** the table's name ("alfasmurph vs AI") */
    public String title;
    public String gameType;
    public String deckType;
    /** the player's deck */
    public String deckName;
    public List<String> opponents = new ArrayList<>();
    /** the turn it plays on from */
    public int turn;
    /** the player's life then */
    public int life;
    /** when it was saved (epoch ms) */
    public long savedAt;

    public static SavedGameEntry of(SavedGames.Info info) {
        SavedGameEntry entry = new SavedGameEntry();
        entry.gameId = info.gameId;
        entry.title = info.title;
        entry.gameType = info.gameType;
        entry.deckType = info.deckType;
        entry.deckName = info.deckName;
        entry.opponents = new ArrayList<>(info.opponents);
        entry.turn = info.turn;
        entry.life = info.life;
        entry.savedAt = info.savedAt;
        return entry;
    }

    public static List<SavedGameEntry> of(List<SavedGames.Info> infos) {
        List<SavedGameEntry> entries = new ArrayList<>();
        for (SavedGames.Info info : infos) {
            entries.add(of(info));
        }
        return entries;
    }
}
