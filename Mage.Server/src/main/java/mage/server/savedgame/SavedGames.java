package mage.server.savedgame;

import mage.cards.decks.Deck;
import mage.game.Game;
import mage.game.GameImpl;
import mage.game.match.MatchOptions;
import mage.players.PlayerType;
import mage.util.CopierObjectInputStream;
import org.apache.log4j.Logger;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.OutputStream;
import java.io.Serializable;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Games against the AI, saved at the start of every turn so a server restart (or a player who leaves without
 * conceding) doesn't lose them: one file per game in db/saved-games, holding what's needed to sit everyone down
 * again (the match options and each seat) and the whole game. The newest few per player are kept; a game that ends
 * takes its file with it.
 */
public final class SavedGames {

    private static final Logger logger = Logger.getLogger(SavedGames.class);

    /** saved games kept per player; the oldest go first */
    public static final int MAX_PER_PLAYER = 8;
    private static final Pattern GAME_ID = Pattern.compile("[0-9a-f-]{36}");
    private static final String SUFFIX = ".game";

    private static volatile SavedGames instance;

    private final Path dir;
    /** games stopped on a server error since the server started (see keepAfterCrash) */
    private final Set<String> crashed = ConcurrentHashMap.newKeySet();

    /** What a saved game is, without loading it: shown in the list of unfinished games. */
    public static class Info implements Serializable {
        private static final long serialVersionUID = 1L;
        public String gameId;
        /** the player's account name, lower case */
        public String owner;
        /** the table's name ("alfasmurph vs AI") */
        public String title;
        public String gameType;
        public String deckType;
        public String deckName;
        public List<String> opponents = new ArrayList<>();
        public int turn;
        public int life;
        public long savedAt;
        /** a Career game (a campaign stop or a roster duel): what pays it when it ends, registered again on resume */
        public String careerOpponentId;
        public int careerTier;
        public String careerKind;
        public String careerRef;
        public mage.game.GameSetup careerSetup;
    }

    /** A seat to fill again: whose it is, what kind of player, and the deck they brought. */
    public static class Seat implements Serializable {
        private static final long serialVersionUID = 1L;
        public UUID playerId;
        public PlayerType type;
        public boolean human;
        public int skill;
        public Deck deck;
    }

    /** A saved game, loaded: the table to set up again and the game to play on. */
    public static class Saved {
        public Info info;
        public MatchOptions options;
        public List<Seat> seats;
        public Game game;
    }

    public SavedGames(Path dir) {
        this.dir = dir;
    }

    public static SavedGames get() {
        if (instance == null) {
            synchronized (SavedGames.class) {
                if (instance == null) {
                    instance = new SavedGames(Paths.get("db", "saved-games"));
                }
            }
        }
        return instance;
    }

    /** for tests */
    public static void use(SavedGames savedGames) {
        instance = savedGames;
    }

    /**
     * Writes the game as it stands (the start of a turn) over its last save. Runs on the game thread, which is
     * what keeps the game still while it's written; a game that can't be written is logged and plays on.
     */
    public void save(Info info, MatchOptions options, List<Seat> seats, Game game) {
        write(info, options, seats, game);
    }

    /** the save itself; tests write a stand-in for the game */
    void write(Info info, MatchOptions options, List<Seat> seats, Serializable game) {
        try {
            Files.createDirectories(dir);
            Path file = file(info.gameId);
            Path temp = Files.createTempFile(dir, info.gameId, ".tmp");
            try (OutputStream out = Files.newOutputStream(temp);
                 ObjectOutputStream objects = new ObjectOutputStream(new GZIPOutputStream(new BufferedOutputStream(out)))) {
                objects.writeObject(info);
                objects.writeObject(options);
                objects.writeObject(new ArrayList<>(seats));
                objects.writeObject(game);
            } catch (IOException | RuntimeException e) {
                Files.deleteIfExists(temp);
                throw e;
            }
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            prune(info.owner);
        } catch (IOException | RuntimeException e) {
            logger.warn("Game " + info.gameId + " not saved: " + e, e);
        }
    }

    /** The player's saved games, newest first. */
    public List<Info> list(String owner) {
        String who = owner == null ? "" : owner.toLowerCase(Locale.ROOT);
        List<Info> found = new ArrayList<>();
        if (!Files.isDirectory(dir)) {
            return found;
        }
        try (DirectoryStream<Path> files = Files.newDirectoryStream(dir, "*" + SUFFIX)) {
            for (Path file : files) {
                Info info = readInfo(file);
                if (info != null && who.equals(info.owner)) {
                    found.add(info);
                }
            }
        } catch (IOException e) {
            logger.warn("Saved games can't be listed: " + e);
        }
        found.sort(Comparator.comparingLong((Info info) -> info.savedAt).reversed());
        return found;
    }

    /** The whole saved game, if it's the player's. */
    public Saved load(String gameId, String owner, ClassLoader classLoader) throws IOException {
        if (gameId == null || !GAME_ID.matcher(gameId).matches()) {
            throw new IOException("There's no saved game " + gameId + ".");
        }
        Path file = file(gameId);
        if (!Files.isRegularFile(file)) {
            throw new IOException("That game isn't saved any more.");
        }
        try (InputStream in = new BufferedInputStream(Files.newInputStream(file));
             ObjectInputStream objects = new CopierObjectInputStream(classLoader, new GZIPInputStream(in))) {
            Saved saved = new Saved();
            saved.info = (Info) objects.readObject();
            if (owner == null || !owner.toLowerCase(Locale.ROOT).equals(saved.info.owner)) {
                throw new IOException("That game isn't yours.");
            }
            saved.options = (MatchOptions) objects.readObject();
            @SuppressWarnings("unchecked")
            List<Seat> seats = (List<Seat>) objects.readObject();
            saved.seats = seats;
            saved.game = (Game) objects.readObject();
            if (saved.game instanceof GameImpl) {
                ((GameImpl) saved.game).setLoadedFromSave(true);
            }
            return saved;
        } catch (ClassNotFoundException | ClassCastException e) {
            throw new IOException("That saved game can't be read by this version of the server.", e);
        }
    }

    /**
     * A game stopped on a server error (out of memory, a bug): its last save is all that's left of it, so it stays
     * when the game is ended, to play on from the start of that turn.
     */
    public void keepAfterCrash(String gameId) {
        crashed.add(gameId);
    }

    /**
     * The player went quiet long enough for the server to let them go (a phone put away, a closed laptop): a game with
     * a save is set aside rather than lost, to play on from the start of its turn. Games without one (against other
     * people) end as before.
     *
     * @return whether the game has a save and is kept
     */
    public boolean keepForAway(String gameId) {
        if (gameId == null || !GAME_ID.matcher(gameId).matches() || !Files.isRegularFile(file(gameId))) {
            return false;
        }
        crashed.add(gameId);
        return true;
    }

    /** Whether this game's save stays when it ends (keepAfterCrash, keepForAway): it isn't over, so nothing pays for it. */
    public boolean isKept(String gameId) {
        return crashed.contains(gameId);
    }

    /** A game ended: its save goes, unless it ended because the server failed it (keepAfterCrash). */
    public boolean ended(String gameId) {
        return !crashed.remove(gameId) && remove(gameId);
    }

    /** Forgets a game (it ended, or the player threw it away). */
    public boolean remove(String gameId) {
        if (gameId == null || !GAME_ID.matcher(gameId).matches()) {
            return false;
        }
        try {
            return Files.deleteIfExists(file(gameId));
        } catch (IOException e) {
            logger.warn("Saved game " + gameId + " not removed: " + e);
            return false;
        }
    }

    public boolean removeOwned(String gameId, String owner) {
        if (gameId == null || !GAME_ID.matcher(gameId).matches()) {
            return false;
        }
        Info info = readInfo(file(gameId));
        return info != null && owner != null && owner.toLowerCase(Locale.ROOT).equals(info.owner) && remove(gameId);
    }

    private void prune(String owner) {
        List<Info> mine = list(owner);
        for (int i = MAX_PER_PLAYER; i < mine.size(); i++) {
            remove(mine.get(i).gameId);
        }
    }

    private Path file(String gameId) {
        return dir.resolve(gameId + SUFFIX);
    }

    /** The first object of a save: what the game is, without reading the game itself. */
    private static Info readInfo(Path file) {
        try (InputStream in = new BufferedInputStream(Files.newInputStream(file));
             ObjectInputStream objects = new ObjectInputStream(new GZIPInputStream(in))) {
            return (Info) objects.readObject();
        } catch (IOException | ClassNotFoundException | ClassCastException e) {
            return null;
        }
    }
}
