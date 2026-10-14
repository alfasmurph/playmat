#!/usr/bin/env node
/**
 * Turns the owner's sound picks (from tools/sound-picker) into the game's sounds: public/sounds/manifest.json, which
 * src/app/match/sound.ts reads, plus the chosen clips copied next to it.
 *   a picked clip       -> public/sounds/<cue>.mp3, with its adjustments (volume, speed, trim, length, fade)
 *   a made sound        -> its recipe, inline; each clip a recipe layer uses -> public/sounds/clips/<option>.mp3
 *   "Silent"            -> a silent cue
 *   no pick             -> left out, so the game keeps its own synthesized sound for that cue
 * Credits come from the picker's catalog. Stale .mp3 files in the output are removed.
 *
 * The picks file is what the picker saved: { picks, designs }, or the picks alone. Each is a map by event id
 * ({ turn: { option: 'turn-k1', adjust: {...} } }, designs { counter: { recipe: {...} } }) or a list of rows carrying
 * the event id as id, eventId, event or doc_id (fields directly on the row, or under data).
 *
 * Usage: node scripts/sounds-from-picks.mjs <picks.json> [--picker <dir>] [--out <dir>] [--dry-run]
 *   --picker  the picker folder with catalog.json and clips/ (default ../tools/sound-picker)
 *   --out     where the manifest and clips go (default public/sounds)
 *   --dry-run print the manifest and what would be copied; write nothing
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** the picker's ADJUST0: what a clip plays like untouched */
const ADJUST0 = { vol: 1, rate: 1, trimStart: 0, length: 0, fadeOut: 0.04 };
/** file and option names the game accepts (src/core/audio/manifest.ts) */
const SAFE_NAME = /^[\w-][\w.-]*$/;

function parseArgs(argv) {
  const args = { picks: null, picker: path.resolve(projectRoot, '../tools/sound-picker'), out: path.join(projectRoot, 'public/sounds'), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--picker') args.picker = path.resolve(argv[++i] ?? '');
    else if (arg === '--out') args.out = path.resolve(argv[++i] ?? '');
    else if (!arg.startsWith('--') && !args.picks) args.picks = path.resolve(arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.picks) throw new Error('usage: node scripts/sounds-from-picks.mjs <picks.json> [--picker <dir>] [--out <dir>] [--dry-run]');
  return args;
}

/** A map by event id from either a map or a list of rows. */
function byEvent(value) {
  if (!value) return {};
  if (!Array.isArray(value)) return value;
  const out = {};
  for (const row of value) {
    const id = row?.id ?? row?.eventId ?? row?.event ?? row?.doc_id;
    if (typeof id === 'string') out[id] = { ...row, ...(row.data ?? {}) };
  }
  return out;
}

function readPicks(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const both = data && typeof data === 'object' && !Array.isArray(data) && ('picks' in data || 'designs' in data);
  const picks = byEvent(both ? data.picks : data);
  const designs = byEvent(both ? data.designs : null);
  // a pick may be just the option id
  for (const [id, pick] of Object.entries(picks)) if (typeof pick === 'string') picks[id] = { option: pick };
  return { picks, designs };
}

function build({ picks, designs }, catalog, pickerDir) {
  const events = catalog.events;
  const options = new Map(events.flatMap((event) => event.options.map((option) => [option.id, option])));
  const known = new Set(events.map((event) => event.id));
  const cues = {};
  const credits = [];
  /** published path (under out) -> source file */
  const copies = new Map();
  const problems = [];
  const credit = (cue, option) => {
    if (!credits.some((c) => c.cue === cue && c.credit === option.credit)) credits.push({ cue, credit: option.credit, url: option.url });
  };
  const source = (option) => {
    const file = path.join(pickerDir, option.file);
    if (!existsSync(file)) problems.push(`${option.id}: clip missing at ${file}`);
    return file;
  };

  for (const id of Object.keys(picks)) if (!known.has(id)) problems.push(`${id}: not an event in the catalog, skipped`);
  for (const event of events) {
    const pick = picks[event.id];
    const option = pick?.option;
    if (!option) continue;
    if (option === 'none') {
      cues[event.id] = { kind: 'silent' };
    } else if (option === 'design') {
      const recipe = designs[event.id]?.recipe;
      if (!recipe || typeof recipe !== 'object') {
        problems.push(`${event.id}: picked its made sound, but there is no design for it`);
        continue;
      }
      cues[event.id] = { kind: 'recipe', recipe };
      for (const layer of recipe.layers ?? []) {
        if (layer?.on === false || layer?.kind !== 'clip' || !layer.clipFile) continue;
        const used = options.get(layer.clipFile);
        if (!used || !SAFE_NAME.test(used.id)) {
          problems.push(`${event.id}: a recipe layer uses ${layer.clipFile}, which isn't in the catalog (that layer stays silent)`);
          continue;
        }
        copies.set(`clips/${used.id}.mp3`, source(used));
        credit(event.id, used);
      }
    } else {
      const chosen = options.get(option);
      if (!chosen) {
        problems.push(`${event.id}: option ${option} isn't in the catalog, skipped`);
        continue;
      }
      const file = `${event.id}.mp3`;
      cues[event.id] = { kind: 'clip', file, adjust: { ...ADJUST0, ...(pick.adjust ?? {}) } };
      copies.set(file, source(chosen));
      credit(event.id, chosen);
    }
  }
  return { manifest: { version: 1, cues, credits }, copies, problems };
}

function write(out, manifest, copies) {
  mkdirSync(path.join(out, 'clips'), { recursive: true });
  // what an earlier export left that this one doesn't use
  for (const dir of ['', 'clips']) {
    for (const name of readdirSync(path.join(out, dir))) {
      const published = dir ? `${dir}/${name}` : name;
      if (name.endsWith('.mp3') && !copies.has(published)) rmSync(path.join(out, published));
    }
  }
  for (const [published, from] of copies) copyFileSync(from, path.join(out, published));
  writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(readFileSync(path.join(args.picker, 'catalog.json'), 'utf8'));
  const { manifest, copies, problems } = build(readPicks(args.picks), catalog, args.picker);
  const kinds = Object.values(manifest.cues).reduce((count, cue) => ({ ...count, [cue.kind]: (count[cue.kind] ?? 0) + 1 }), {});
  const left = catalog.events.map((event) => event.id).filter((id) => !manifest.cues[id]);
  for (const problem of problems) console.warn(`warning: ${problem}`);
  if (args.dryRun) {
    console.log(JSON.stringify(manifest, null, 2));
    for (const [published, from] of copies) console.log(`would copy ${path.relative(projectRoot, from)} -> ${path.join(args.out, published)}`);
  } else {
    if (problems.some((problem) => problem.includes('clip missing'))) throw new Error('clips are missing; nothing written');
    write(args.out, manifest, copies);
    console.log(`wrote ${path.join(args.out, 'manifest.json')} and ${copies.size} clips`);
  }
  console.log(`${Object.keys(manifest.cues).length} cues (${Object.entries(kinds).map(([kind, n]) => `${n} ${kind}`).join(', ')}), ${manifest.credits.length} credits`);
  if (left.length) console.log(`synthesized or quiet (no pick): ${left.join(', ')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
