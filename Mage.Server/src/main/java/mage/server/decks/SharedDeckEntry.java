package mage.server.decks;

/**
 * A deck its owner shares with everyone on the server: who owns it (the account, lower case) and the deck's JSON,
 * which also names the owner as they spell it and says it is shared.
 */
public class SharedDeckEntry {
    public String owner;
    public String id;
    public String name;
    public long updatedAt;
    public String data;

    public SharedDeckEntry() {
    }

    SharedDeckEntry(StoredDeck deck) {
        this.owner = deck.owner;
        this.id = deck.deckId;
        this.name = deck.name;
        this.updatedAt = deck.updatedAt;
        this.data = deck.data;
    }
}
