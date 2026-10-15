#!/usr/bin/env node
/**
 * Builds public/precons from the real Commander preconstructed decks in Mage.Client/release/sample-decks/Commander:
 * one folder per set, oldest set first, and an index the Decks screen reads. Every card is checked against the
 * server's card database (a CSV export: NAME,SETCODE,CARDNUMBER); a deck with a card the server doesn't know is left
 * out and reported, so nothing that can't be played ships.
 *
 *   node scripts/build-precons.mjs <cards.csv>
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '../../Mage.Client/release/sample-decks/Commander');
const OUT = join(here, '../public/precons');

/**
 * The smallest changes that make a precon legal today, each said on the deck: a card banned since is swapped for a
 * basic land of the deck's, and a mistake in the source list is put right. Lines are replaced whole ('' drops one).
 */
const FIXES = {
  'Commander 2011/Political Puppets.dck': {
    lines: [['1 [CMD:64] Trade Secrets', ''], ['3 [CMD:304] Island', '4 [CMD:304] Island']],
    note: 'Trade Secrets is banned in Commander: an Island plays in its place.',
  },
  'Commander 2019/Mystic Intellect.dck': {
    lines: [['1 [C19:24] Dockside Extortionist', ''], ['4 [C19:297] Mountain', '5 [C19:297] Mountain']],
    note: 'Dockside Extortionist is banned in Commander: a Mountain plays in its place.',
  },
  'Kamigawa Neon Dynasty (2022)/Upgrades Unleashed (RG).dck': {
    lines: [['2 [ODY:321] Mossfire Valley', '1 [ODY:321] Mossfire Valley'], ['12 [BLB:274] Mountain', '13 [BLB:274] Mountain']],
    note: 'The source list had two Mossfire Valleys; the second is a Mountain.',
  },
};

// sets whose folder name carries no year
const YEARS = { Kaldheim: 2021, 'Zendikar Rising': 2020, 'Commander Legends': 2020 };

const csv = process.argv[2];
if (!csv) {
  console.error('usage: node scripts/build-precons.mjs <cards.csv>');
  process.exit(2);
}

// the card database: names, and the printings (set:number) of each
const names = new Set();
const printings = new Set();
for (const line of readFileSync(csv, 'utf8').split('\n').slice(1)) {
  const match = /^"((?:[^"]|"")*)","([^"]*)","([^"]*)"/.exec(line);
  if (!match) continue;
  const name = match[1].replace(/""/g, '"');
  names.add(name.toLowerCase());
  for (const face of name.split(' // ')) names.add(face.toLowerCase());
  printings.add(`${match[2]}:${match[3]}`.toLowerCase());
}

const slug = (text) => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const yearOf = (set) => Number(/(\d{4})/.exec(set)?.[1] ?? YEARS[set] ?? 9999);

const LINE = /^(SB:\s*)?(\d+)\s+\[([^:\]]+):([^\]]+)\]\s+(.+)$/;

const sets = [];
const problems = [];
rmSync(OUT, { recursive: true, force: true });

for (const set of readdirSync(SOURCE, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  const decks = [];
  for (const file of readdirSync(join(SOURCE, set)).filter((name) => name.endsWith('.dck')).sort()) {
    const fix = FIXES[`${set}/${file}`];
    let text = readFileSync(join(SOURCE, set, file), 'utf8');
    for (const [from, to] of fix?.lines ?? []) {
      const lines = text.split(/\r?\n/);
      const at = lines.findIndex((line) => line.trim() === from);
      if (at < 0) throw new Error(`${set}/${file}: no line "${from}" to fix`);
      if (to) lines[at] = to;
      else lines.splice(at, 1);
      text = lines.join('\n');
    }
    // the files' names, tidied: "ArcaneWizardry" and "Call the Spirits (WB)" become "Arcane Wizardry", "Call the Spirits"
    const name = basename(file, '.dck').replace(/\s*\([WUBRG]+\)\s*$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    let main = 0;
    const commanders = [];
    const unknown = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('NAME:') || line.startsWith('LAYOUT')) continue;
      const parsed = LINE.exec(line);
      if (!parsed) {
        unknown.push(`unreadable line: ${line}`);
        continue;
      }
      const [, sideboard, amount, setCode, number, cardName] = parsed;
      const known = printings.has(`${setCode}:${number.replace(/\*$/, '')}`.toLowerCase()) || names.has(cardName.toLowerCase());
      if (!known) unknown.push(cardName);
      if (sideboard) commanders.push({ name: cardName, setCode, cardNumber: number.replace(/\*$/, '') });
      else main += Number(amount);
    }
    const total = main + commanders.length;
    if (unknown.length || commanders.length === 0 || total !== 100) {
      problems.push(`${set} / ${name}: ${unknown.length ? `unknown ${unknown.join(', ')}` : ''}${total !== 100 ? ` ${total} cards` : ''}${commanders.length ? '' : ' no commander'}`);
      continue;
    }
    const out = `${slug(name)}.dck`;
    mkdirSync(join(OUT, slug(set)), { recursive: true });
    writeFileSync(join(OUT, slug(set), out), `NAME:${name}\n${text.replace(/^NAME:.*\r?\n/m, '')}`);
    decks.push({
      file: `${slug(set)}/${out}`, name, cards: total, commanders: commanders.map((commander) => commander.name), cover: commanders[0],
      ...(fix ? { changes: [fix.note] } : {}),
    });
  }
  if (decks.length) sets.push({ id: slug(set), name: set.replace(/\s*\(\d{4}\)$/, ''), year: yearOf(set), decks });
}

sets.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(sets, null, 2)}\n`);

const count = sets.reduce((sum, set) => sum + set.decks.length, 0);
console.log(`${count} decks in ${sets.length} sets written to public/precons`);
if (problems.length) {
  console.log(`${problems.length} left out:`);
  for (const problem of problems) console.log(`  ${problem}`);
}
