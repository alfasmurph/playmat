import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  CareerCampaign, CareerChapter, CareerGameResult, CareerGauntletState, CareerLimitedRun, CareerLimitedState, CareerMatch, CareerRun, DeckCardLists as WireDeck,
} from '../../protocol/generated/views';
import { api } from '../connection';
import { queryClient } from '../queries';
import { useDecks } from '../stores/decks';
import { useEvents } from '../stores/events';
import { useCareerLessons, type CareerLessonPlan } from '../stores/careerLessons';
import { useCareerVoice, type VoiceLines } from '../stores/careerVoice';
import { usePlay } from '../stores/play';
import { useSession } from '../stores/session';
import { warmMatch } from './careerData';
import { rewardsPath } from './progressModel';

/**
 * Career modes from the server: campaigns, the puzzle book, the gauntlet, solo sealed and draft, and the weekly
 * challenge. Each play call starts a table the way a roster match does; leaving the game comes back to the mode.
 */
export type ModeKind = 'campaign' | 'puzzle' | 'gauntlet' | 'limited' | 'challenge';

export const MODE_PATHS: Record<ModeKind, string> = {
  campaign: '/career/campaign',
  puzzle: '/career/puzzles',
  gauntlet: '/career/gauntlet',
  limited: '/career/limited',
  challenge: '/career/challenge',
};

const KEY = {
  state: ['career', 'state'],
  campaigns: ['career', 'campaigns'],
  puzzles: ['career', 'puzzles'],
  challenge: ['career', 'challenge'],
  gauntlet: ['career', 'gauntlet'],
  limited: ['career', 'limited'],
  result: (gameKey: string) => ['career', 'result', gameKey],
} as const;

function useSignedIn(): boolean {
  return useSession((state) => state.phase === 'signedIn');
}

export function useCampaigns(enabled: boolean) {
  return useQuery({ queryKey: KEY.campaigns, queryFn: () => api.careerCampaigns(), enabled: useSignedIn() && enabled, staleTime: 0 });
}

export function usePuzzles(enabled: boolean) {
  return useQuery({ queryKey: KEY.puzzles, queryFn: () => api.careerPuzzles(), enabled: useSignedIn() && enabled, staleTime: 0 });
}

export function useChallenge(enabled: boolean) {
  return useQuery({ queryKey: KEY.challenge, queryFn: () => api.careerChallenge(), enabled: useSignedIn() && enabled, staleTime: 0 });
}

export function useGauntlet(enabled: boolean) {
  return useQuery({ queryKey: KEY.gauntlet, queryFn: () => api.careerGauntlet(), enabled: useSignedIn() && enabled, staleTime: 0 });
}

export function useLimited(enabled: boolean) {
  return useQuery({ queryKey: KEY.limited, queryFn: () => api.careerLimited(), enabled: useSignedIn() && enabled, staleTime: 0 });
}

/**
 * After a campaign game: the stop to go on to, from the campaigns fetched again (the win opens it; the server settles a
 * game a moment after it ends, so it asks a few times until the stop played shows as done). Null when there's none.
 */
export function useNextCampaignStop(enabled: boolean): { name: string; path: string } | null {
  const place = lastCampaignPlace();
  const played = (campaigns: CareerCampaign[] | undefined) => (campaigns ?? [])
    .find((campaign) => campaign.id === place?.campaignId)?.chapters?.flatMap((chapter) => chapter.nodes ?? [])
    .find((node) => node.id === place?.nodeId);
  const campaigns = useQuery({
    queryKey: [...KEY.campaigns, 'next', place?.campaignId ?? '', place?.nodeId ?? ''],
    queryFn: () => api.careerCampaigns(),
    enabled: useSignedIn() && enabled && !!place,
    staleTime: 0,
    refetchInterval: (query) => (played(query.state.data)?.state !== 'done' && query.state.dataUpdateCount < 6 ? 1500 : false),
  });
  // switched off (a loss), it offers nothing, whatever an earlier look at the campaigns left in the cache
  return useMemo(() => (enabled && place && campaigns.data ? nextCampaignStop(campaigns.data, place) : null), [enabled, place, campaigns.data]);
}

/** coins changed: the wallet shows it */
function walletChanged(): void {
  void queryClient.invalidateQueries({ queryKey: KEY.state });
}

// ---- playing

/** the mode game started last in this tab, to show what it paid when the player comes back */
let lastPlayed: { kind: ModeKind; gameKey: string } | null = null;

/** A campaign stop, as a game started from it remembers it. */
export interface CampaignPlace {
  /** the campaign screen the stop is on (the story page or a school's) */
  base: string;
  campaignId: string;
  chapterId: string;
  nodeId: string;
}

/** The campaign page open at a chapter's stop; {@code versus} opens straight on its face-off, ready to fight. */
export function campaignPlacePath(place: CampaignPlace, versus = false): string {
  const [path, query = ''] = place.base.split('?');
  const params = new URLSearchParams(query);
  if (path === MODE_PATHS.campaign) params.set('story', place.campaignId);
  params.set('chapter', place.chapterId);
  params.set('node', place.nodeId);
  if (versus) params.set('versus', '1');
  else params.delete('versus');
  return `${path}?${params.toString()}`;
}

/** the last Career game started in this tab, to play it again from its end screen */
let lastLaunch: {
  kind: ModeKind;
  start: () => Promise<CareerMatch>;
  voice: VoiceLines | null;
  options: { back: string; lessons: Omit<CareerLessonPlan, 'tableId'> | null; place: CampaignPlace | null };
} | null = null;

/** Whether there's a Career game to play again (the one last started in this tab). */
export function canReplayCareer(): boolean {
  return lastLaunch !== null;
}

/** Starts the last Career game again: the same stop, opponents and deck, whatever the result was. */
export function replayCareer(): Promise<void> {
  if (!lastLaunch) return Promise.resolve();
  const { kind, start, voice, options } = lastLaunch;
  return playMode(kind, start, voice, options);
}

/** the campaign stop the last Career game was started from, if it was one */
export function lastCampaignPlace(): CampaignPlace | null {
  return lastLaunch?.options.place ?? null;
}

/**
 * The stop after a campaign win: the chapter's next open stop, else (the chapter done) the next chapter's; null when
 * there's nothing open to go on to. {@code campaigns} must be fresh (fetched after the win).
 */
export function nextCampaignStop(campaigns: readonly CareerCampaign[] | undefined, place: CampaignPlace): { name: string; path: string } | null {
  const campaign = (campaigns ?? []).find((item) => item.id === place.campaignId);
  if (!campaign) return null;
  const chapters = campaign.chapters ?? [];
  const chapter = chapters.find((item) => item.id === place.chapterId);
  const openIn = (item: CareerChapter | undefined) => (item?.nodes ?? []).find((node) => node.state === 'open' && node.id !== place.nodeId);
  let next = openIn(chapter);
  let nextChapter = chapter;
  if (!next) {
    nextChapter = chapters.find((item) => item.id !== place.chapterId && !item.done && openIn(item));
    next = openIn(nextChapter);
  }
  if (!next || !nextChapter) return null;
  return {
    name: next.name ?? '',
    path: campaignPlacePath({ ...place, chapterId: nextChapter.id ?? '', nodeId: next.id ?? '' }, true),
  };
}

/**
 * Start a mode's game: the server sets the table up and starts it; the game opens like any other, and leaving it comes
 * back to the mode's screen (or {@code back}). A school duel brings its tips along.
 */
export async function playMode(
  kind: ModeKind,
  start: () => Promise<CareerMatch>,
  voice: VoiceLines | null = null,
  { back = MODE_PATHS[kind], lessons = null, place = null }: {
    back?: string;
    lessons?: Omit<CareerLessonPlan, 'tableId'> | null;
    /** a campaign stop: where it is, so the end of the game can lead back to it or on to the next one */
    place?: CampaignPlace | null;
  } = {},
): Promise<void> {
  lastLaunch = { kind, start, voice, options: { back, lessons, place } };
  useEvents.setState({ currentTournamentId: null });
  useCareerVoice.getState().speak(voice);
  useCareerLessons.getState().teach(lessons ? { ...lessons, tableId: null } : null);
  usePlay.setState({ phase: 'waitingForGame', error: null, deckId: null, returnPath: back });
  try {
    const match = await start();
    warmMatch(match);
    lastPlayed = match?.tableId ? { kind, gameKey: match.tableId } : null;
    useCareerLessons.getState().seat(match?.tableId ?? null);
    // leaving the game tells its result as a scene, then comes back to the mode's screen
    usePlay.setState({ tableId: match?.tableId ?? null, returnPath: rewardsPath(match?.tableId ?? null, true, back) });
  } catch (error) {
    usePlay.setState({ phase: 'idle', tableId: null });
    throw error;
  }
}

/**
 * What the last game of this mode paid (the server's mode summary), once it's over; null before, or when another
 * mode was played since. The full rewards screen is Career's; this is the line on the mode's own screen.
 */
export function useLastModeResult(kind: ModeKind) {
  const played = lastPlayed?.kind === kind ? lastPlayed.gameKey : null;
  const playing = usePlay((play) => play.phase !== 'idle');
  return useQuery<CareerGameResult | null>({
    queryKey: KEY.result(played ?? ''),
    queryFn: () => api.careerGameResult(played),
    enabled: useSignedIn() && !!played && !playing,
    staleTime: Infinity,
    // the server settles the game a moment after it ends: ask again a few times while there's nothing yet
    refetchInterval: (query) => (query.state.data == null && query.state.dataUpdateCount < 6 ? 2000 : false),
  });
}

// ---- campaigns

/**
 * The campaign's prologue: the guided first game (an easy opponent and a tip for each new moment), with the deck picked
 * on Play. It isn't a Career match; leaving it comes back to the campaign.
 */
export async function playPrologue(): Promise<void> {
  if (!useDecks.getState().loaded) await useDecks.getState().refresh();
  const deckId = useDecks.getState().selectedId;
  if (!deckId) throw new Error('No deck to play the guided game with.');
  useCareerVoice.getState().speak(null);
  const starting = usePlay.getState().playVsAi(deckId, { guided: true });
  // playVsAi clears the way back synchronously, before its first await; point it at the campaign
  usePlay.setState({ returnPath: MODE_PATHS.campaign });
  await starting;
}

export async function chooseOption(campaignId: string, nodeId: string, optionId: string): Promise<CareerGameResult> {
  const result = await api.careerCampaignChoose(campaignId, nodeId, optionId);
  void queryClient.invalidateQueries({ queryKey: KEY.campaigns });
  walletChanged();
  return result;
}

// ---- gauntlet

function setRun(run: CareerRun): void {
  queryClient.setQueryData<CareerGauntletState>(KEY.gauntlet, (state) => (state ? { ...state, run: run.state === 'active' ? run : undefined } : state));
  void queryClient.invalidateQueries({ queryKey: KEY.gauntlet });
}

export async function startGauntlet(): Promise<void> {
  setRun(await api.careerGauntletStart());
  walletChanged();
}

export async function pickGauntlet(optionIds: string[]): Promise<void> {
  setRun(await api.careerGauntletPick(optionIds));
}

export async function abandonGauntlet(): Promise<void> {
  setRun(await api.careerGauntletAbandon());
}

// ---- solo sealed and draft

function setLimitedRun(run: CareerLimitedRun): void {
  queryClient.setQueryData<CareerLimitedState>(KEY.limited, (state) => (state ? { ...state, run: run.state === 'active' ? run : undefined } : state));
  void queryClient.invalidateQueries({ queryKey: KEY.limited });
}

export async function startLimited(kind: 'sealed' | 'draft', setCode: string): Promise<void> {
  setLimitedRun(await api.careerLimitedStart(kind, setCode));
  walletChanged();
  // the opened packs joined the collection
  void queryClient.invalidateQueries({ queryKey: ['career', 'collection'] });
}

export async function pickLimited(index: number): Promise<CareerLimitedRun> {
  const run = await api.careerLimitedPick(index);
  setLimitedRun(run);
  if (run.phase !== 'draft') void queryClient.invalidateQueries({ queryKey: ['career', 'collection'] });
  return run;
}

export async function submitLimitedDeck(deck: WireDeck): Promise<void> {
  setLimitedRun(await api.careerLimitedDeck(deck));
}

export async function abandonLimited(): Promise<void> {
  setLimitedRun(await api.careerLimitedAbandon());
}
