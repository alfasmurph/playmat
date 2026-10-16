#!/usr/bin/env node
/**
 * Builds public/data/brackets.json: the card lists Commander brackets are judged by, from Scryfall: the official Game
 * Changers (is:gamechanger), mass land denial (otag:mass-land-denial) and extra turns (otag:extra-turn); and the
 * two-card infinite combos the server's engine knows (Mage/src/main/resources/brackets/infinite-combos.txt, from
 * Commander Spellbook). Run it again when Wizards updates the Game Changers.
 *
 *   node scripts/build-brackets.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../public/data/brackets.json');
const COMBOS = join(here, '../../Mage/src/main/resources/brackets/infinite-combos.txt');
const QUERIES = { gameChangers: 'is:gamechanger', massLandDenial: 'otag:mass-land-denial', extraTurns: 'otag:extra-turn' };

async function names(query) {
  const found = [];
  let url = `https://api.scryfall.com/cards/search?unique=cards&order=name&q=${encodeURIComponent(query)}`;
  while (url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'Playmat/1.0', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Scryfall said ${response.status} to ${query}`);
    const page = await response.json();
    found.push(...page.data.map((card) => card.name));
    url = page.has_more ? page.next_page : null;
    // Scryfall asks for 50-100 ms between requests
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return found;
}

const lists = { updated: new Date().toISOString().slice(0, 10) };
for (const [key, query] of Object.entries(QUERIES)) lists[key] = await names(query);
// "name1@name2" lines; a pair of the same card is no combo for a singleton deck
const pairs = new Set();
for (const line of readFileSync(COMBOS, 'utf8').split('\n')) {
  const [a, b] = line.trim().startsWith('#') ? [] : line.trim().split('@');
  if (a && b && a !== b) pairs.add([a, b].sort().join('@'));
}
lists.combos = [...pairs].sort().map((pair) => pair.split('@'));
writeFileSync(OUT, `${JSON.stringify(lists, null, 2)}\n`);
console.log([...Object.keys(QUERIES), 'combos'].map((key) => `${lists[key].length} ${key}`).join(', '), '→ public/data/brackets.json');
