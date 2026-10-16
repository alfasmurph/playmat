#!/usr/bin/env node
/**
 * Builds the Commander story campaigns' data from the precons in public/precons:
 *
 * - Commander Conquest (the server's career/campaigns/commander-conquest.json): a chapter per precon set, its decks
 *   copied to campaigns/decks/commander-conquest. Each chapter: a duel against each of the set's decks (any order), one
 *   or two three-player pods of its decks, and a four-player finale against three of them. The player brings a
 *   Commander deck of their own. A set with fewer than three decks can't seat a finale, so small sets fold together
 *   in release order until a chapter has four decks or more (what's left at the end joins the last of them).
 * - Brackets on the campaigns' decks: every opponent of Commander Conquest and The Commander's Road gets a "bracket",
 *   and every chapter with a deck of its own a "deckBracket": the precon index's when the deck is a precon as
 *   printed, else the estimate of core/decks/bracket from its cards.
 *
 *   node scripts/build-commander-campaigns.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Node runs the app's TypeScript rules as they are: the same estimate the client shows
import { estimateBracket } from '../src/core/decks/bracket.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PRECONS = join(here, '../public/precons');
const CAMPAIGNS = join(here, '../../Mage.Server/src/main/resources/career/campaigns');
const DECKS = join(CAMPAIGNS, 'decks');
const ID = 'commander-conquest';
const BRACKET_LISTS = JSON.parse(readFileSync(join(here, '../public/data/brackets.json'), 'utf8'));
const sets = JSON.parse(readFileSync(join(PRECONS, 'index.json'), 'utf8'));

// set names as players say them (the index keeps the source folders' spelling)
const NAMES = {
  'innistrad-crimson-vow-2021': 'Innistrad: Crimson Vow',
  'innistrad-midnight-hunt-2021': 'Innistrad: Midnight Hunt',
  'kamigawa-neon-dynasty-2022': 'Kamigawa: Neon Dynasty',
  'duskmourn-house-of-horror-2024': 'Duskmourn: House of Horror',
  'secret-lair-heads-i-win-tails-you-lose-2021': 'Secret Lair: Heads I Win, Tails You Lose',
};
const BASICS = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const LINE = /^(SB:\s*)?(\d+)\s+\[([^:\]]+):([^\]]+)\]\s+(.+)$/;

const nameOf = (set) => NAMES[set.id] ?? set.name;
const joined = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);

/** a .dck's card names, and the colours its basic lands make */
function readDeck(text) {
  const names = [];
  const colors = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const parsed = LINE.exec(raw.trim());
    if (!parsed) continue;
    names.push(parsed[5]);
    const basic = BASICS[parsed[5].replace(/^Snow-Covered /, '')];
    if (basic) colors.add(basic);
  }
  return { names, colors };
}

// every precon by its file's text: a campaign deck that is one as printed takes the index's bracket
const preconByText = new Map();
for (const set of sets) {
  for (const deck of set.decks) preconByText.set(readFileSync(join(PRECONS, deck.file), 'utf8').trim(), deck);
}

/** a campaign deck's bracket: its precon's, else the estimate from its cards */
function bracketOfFile(file) {
  const text = readFileSync(join(DECKS, file), 'utf8');
  const precon = preconByText.get(text.trim());
  if (precon?.bracket) return precon.bracket;
  return estimateBracket(readDeck(text).names, BRACKET_LISTS).bracket;
}

// ---- Commander Conquest

/** the set code most of a set's decks show (its commanders' printing), for short chapter and node ids */
function codeOf(set) {
  const counts = new Map();
  for (const deck of set.decks) counts.set(deck.cover.setCode, (counts.get(deck.cover.setCode) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].toLowerCase();
}

// sets with three decks or more are a chapter each; smaller ones fold together, in release order, until four decks
const groups = [];
let small = [];
const smallGroups = [];
for (const set of sets) {
  if (set.decks.length >= 3) {
    groups.push([set]);
    continue;
  }
  small.push(set);
  if (small.reduce((sum, item) => sum + item.decks.length, 0) >= 4) {
    groups.push(small);
    smallGroups.push(small);
    small = [];
  }
}
if (small.length) {
  if (small.reduce((sum, item) => sum + item.decks.length, 0) >= 3 || smallGroups.length === 0) groups.push(small);
  else smallGroups[smallGroups.length - 1].push(...small);
}

const opponentName = (deck) => (deck.commanders.length > 1 ? deck.commanders.map((name) => name.split(',')[0]).join(' & ') : deck.commanders[0]);

rmSync(join(DECKS, ID), { recursive: true, force: true });
const chapters = [];
const skipped = [];
for (const group of groups) {
  const id = group.map(codeOf).join('-');
  const decks = group.flatMap((set) => set.decks.map((deck) => ({ ...deck, set })));
  if (decks.length < 3) {
    skipped.push(`${group.map(nameOf).join(' + ')}: ${decks.length} decks`);
    continue;
  }
  const colors = new Set();
  const seats = decks.map((deck) => {
    const file = `${ID}/${deck.file}`;
    mkdirSync(dirname(join(DECKS, file)), { recursive: true });
    copyFileSync(join(PRECONS, deck.file), join(DECKS, file));
    for (const color of readDeck(readFileSync(join(PRECONS, deck.file), 'utf8')).colors) colors.add(color);
    return { deck, opponent: { name: opponentName(deck), deck: file, bracket: deck.bracket ?? bracketOfFile(file) } };
  });
  const name = joined(group.map(nameOf));
  const nodes = [];
  // a duel with each deck, in any order: the first half at AI level 3, the rest at 4
  seats.forEach(({ deck, opponent }, index) => {
    const later = index >= Math.ceil(seats.length / 2);
    nodes.push({
      id: `${id}-${index + 1}`,
      type: 'duel',
      name: deck.name,
      text: `${deck.name}, from ${nameOf(deck.set)}, led by ${joined(deck.commanders)}. One on one.`,
      opponent: { ...opponent, skill: later ? 4 : 3 },
      requires: [],
      reward: later ? { coins: 35, xp: 175 } : { coins: 30, xp: 150 },
    });
  });
  const duels = nodes.map((node) => node.id);
  // the pods: two decks each, the first pair and (with four decks or more) the next
  const pods = seats.length >= 4 ? [[0, 1], [2, 3]] : [[0, 1]];
  let previous = duels;
  pods.forEach(([a, b], index) => {
    const pod = {
      id: `${id}-pod-${index + 1}`,
      type: 'duel',
      name: index === 0 ? 'Three at the table' : 'Three again',
      text: `A three-player game against ${seats[a].opponent.name} and ${seats[b].opponent.name}. Anyone may attack anyone.`,
      gameType: 'Commander Free For All',
      opponent: { ...seats[a].opponent, skill: 4 + index },
      opponents: [{ ...seats[b].opponent, skill: 4 + index }],
      requires: previous,
      reward: index === 0 ? { coins: 45, xp: 225 } : { coins: 50, xp: 250 },
    };
    nodes.push(pod);
    previous = [pod.id];
  });
  // the finale: the three strongest decks by bracket (the earlier one on a tie), the strongest at its head
  const finalists = [...seats].sort((x, y) => y.opponent.bracket - x.opponent.bracket || seats.indexOf(x) - seats.indexOf(y)).slice(0, 3);
  nodes.push({
    id: `${id}-final`,
    type: 'duel',
    name: 'The conquest',
    boss: true,
    text: `Four at the table: ${joined(finalists.map((seat) => seat.opponent.name))}, and you. Win it and ${name} is conquered.`,
    gameType: 'Commander Free For All',
    winsNeeded: 1,
    opponent: { ...finalists[0].opponent, skill: 6 },
    opponents: finalists.slice(1).map((seat) => ({ ...seat.opponent, skill: 5 })),
    requires: previous,
    reward: { coins: 120, xp: 400, packs: 2, wildcard: 'rare' },
  });
  chapters.push({
    id,
    name,
    color: 'WUBRG'.split('').filter((color) => colors.has(color)).join('') || 'C',
    text: `The ${decks.length} Commander decks of ${name}. Beat each one on its own, then at a pod, then all at once.`,
    nodes,
  });
}

const conquest = {
  id: ID,
  name: 'Commander Conquest',
  format: 'Commander',
  colors: 'WUBRG',
  summary: 'Every Commander precon set, one chapter each: beat its decks one by one, then three at a table, then all at once.',
  text: 'Bring a Commander deck of your own and take on the precons, set by set: a duel with each deck, a three-player pod or two, and a four-player finale against the set\'s strongest. Start with any chapter.',
  deckType: 'Variant Magic - Commander',
  gameType: 'Commander Two Player Duel',
  ownDeck: true,
  chapters,
};
writeFileSync(join(CAMPAIGNS, `${ID}.json`), `${JSON.stringify(conquest, null, 2)}\n`);

// listed right after The Commander's Road
const index = JSON.parse(readFileSync(join(CAMPAIGNS, 'index.json'), 'utf8')).filter((id) => id !== ID);
index.splice(index.indexOf('commander-road') + 1, 0, ID);
writeFileSync(join(CAMPAIGNS, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

// ---- brackets on The Commander's Road

const roadFile = join(CAMPAIGNS, 'commander-road.json');
const road = JSON.parse(readFileSync(roadFile, 'utf8'));
road.ownDeck = true;
for (const chapter of road.chapters) {
  if (chapter.deck) chapter.deckBracket = bracketOfFile(chapter.deck);
  for (const node of chapter.nodes) {
    for (const seat of [node.opponent, ...(node.opponents ?? [])]) {
      if (seat?.deck) seat.bracket = bracketOfFile(seat.deck);
    }
  }
}
writeFileSync(roadFile, `${JSON.stringify(road, null, 2)}\n`);

const nodeCount = chapters.reduce((sum, chapter) => sum + chapter.nodes.length, 0);
const deckCount = groups.reduce((sum, group) => sum + group.reduce((count, set) => count + set.decks.length, 0), 0);
console.log(`${ID}: ${chapters.length} chapters, ${nodeCount} nodes, ${deckCount} decks copied`);
for (const chapter of chapters) console.log(`  ${chapter.id}: ${chapter.name} (${chapter.nodes.length} nodes)`);
if (skipped.length) console.log(`skipped: ${skipped.join('; ')}`);
console.log(`commander-road: brackets on ${road.chapters.length} chapters`);
