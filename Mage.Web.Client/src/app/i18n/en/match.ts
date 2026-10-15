/**
 * English for the match stage and the result between games, which load with the game. Card names, rules text and
 * the server's own messages stay in English.
 */
export default {
  // a count of cards after a pile's name ("Your graveyard, 1 card")
  'match.cards': { one: '{label}, {count} card', other: '{label}, {count} cards' },

  // a school duel's tips
  'match.lesson.tip': 'School tip',
  'match.lesson.kicker': 'The school',
  'match.lesson.gotIt': 'Got it',
  'match.lesson.quiet': 'No more tips',
  'match.lesson.sideboard': 'Sideboarding',

  // the turn, around the active seat: its number by the name, the ring's name
  'match.turn.short': 'T{turn}',
  'match.turn.aria.yours': 'Turn {turn}, your turn',
  'match.turn.aria.theirs': "Turn {turn}, opponent's turn",
  'match.turn.aria.player': "Turn {turn}, {name}'s turn",

  // a phone held sideways in a game
  'match.upright': 'Turn your phone upright',
  'match.upright.note': 'The table is made for a phone held upright. The game keeps going while you turn it.',

  // player plates
  'match.plate.lost': 'Lost',
  'match.plate.out': 'Out',
  'match.plate.disconnected': 'Disconnected {time}',
  'match.plate.disconnectedTitle': 'Lost connection to the server. They have a few minutes to come back before they lose.',
  'match.plate.aria.lost': '{name}, out of the game',
  'match.plate.aria.disconnected': 'disconnected',
  // a big hand (more than fits the fan comfortably): your seat offers it as a list
  'match.plate.viewHand': 'Hand {count} · View all',

  // your hand as a list
  'match.handList.title': { one: 'Your hand · {count} card', other: 'Your hand · {count} cards' },
  'match.handList.hint': 'Tap a card to pick it up and see what it can do.',
  'match.handList.close': 'Close',

  // the decision corner
  'match.conceding': 'Concession sent. The game ends as soon as the server applies it.',
  'match.conceding.waiting': 'Concession sent. It takes effect when {name} passes priority.',
  'match.ask.cards': { one: 'The card you are looking at', other: 'The {count} cards you are looking at' },
  'match.ask.open': 'Read the cards',

  // dialogs
  'match.attack': 'Attack…',
  'match.attack.named': '{name} attacks…',
  'match.ability.one': 'Use {name}?',
  'match.ability.cancel': 'Cancel',
  'match.amount.mana': 'You have {count} mana to pay with.',

  // the end of a game or match
  'match.end.victory': 'Victory',
  'match.end.defeat': 'Defeat',
  'match.end.draw': 'Draw',
  'match.end.over': 'Game over',
  'match.end.saved': 'Game saved',
  'match.end.savedLine': 'The server stopped during this game, but it was saved at the start of turn {turn}.',
  'match.end.playOn': 'Play on',
  'match.end.wonGame': 'You won the game.',
  'match.end.lostGame': 'You lost the game.',
  'match.end.drawGame': 'The game is a draw.',
  'match.end.wonMatch': 'You won the match {wins}–{losses}.',
  'match.end.lostMatch': 'You lost the match {wins}–{losses}.',
  'match.end.drawMatch': 'The match ended {wins}–{losses}.',
  'match.end.backToTables': 'Back to Tables',

  // the score while sideboarding
  'match.score.won': 'You won game {game} · {wins}–{losses}',
  'match.score.lost': 'You lost game {game} · {wins}–{losses}',
  'match.score.draw': 'Game {game} was a draw · {wins}–{losses}',
};
