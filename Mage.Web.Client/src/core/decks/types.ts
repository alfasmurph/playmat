/** A deck as the client keeps and edits it (the wire form is DeckCardLists in protocol/generated/views). */

export interface DeckCardInfo {
  cardName: string;
  setCode?: string | null;
  cardNumber?: string | null;
  amount: number;
}

export interface DeckCardLayout {
  // Layout information for deck editor
  [key: string]: unknown;
}

export interface DeckCoverCard {
  setCode: string;
  cardNumber: string;
  name?: string;
}

export interface DeckImportSource {
  /** a site id from core/deckImport/sites */
  site: string;
  url: string;
  remoteId: string;
  importedAt: number;
  remoteUpdatedAt?: number;
  /** the deck's name when it was imported; an update renames the deck only if the player kept that name */
  importedName?: string;
}

export interface DeckCardLists {
  id?: string;
  name?: string;
  description?: string;
  author?: string;
  format?: string; // e.g. "Constructed - Standard", syncs with deckType
  cards: DeckCardInfo[];
  sideboard: DeckCardInfo[];
  cardLayout?: DeckCardLayout;
  sideboardLayout?: DeckCardLayout;
  coverCard?: DeckCoverCard;
  /** the deck website this deck was imported from, so it can be updated later */
  source?: DeckImportSource;
  /** the owner shares it with everyone on the server (deck sync carries it; the server lists shared decks) */
  shared?: boolean;
  /** the owner's account name as they spell it, written when the deck is shared */
  sharedBy?: string;
  /** the owner pinned it to the top of their shelf (deck sync carries it, so the pin follows the deck everywhere) */
  favorite?: boolean;
  /** the Commander bracket (1-5) the owner gives it; without one, it shows its estimate (see core/decks/bracket) */
  bracket?: number;
  colors?: {
    white: boolean;
    blue: boolean;
    black: boolean;
    red: boolean;
    green: boolean;
  };
  createdAt?: number;
  updatedAt?: number;
}
