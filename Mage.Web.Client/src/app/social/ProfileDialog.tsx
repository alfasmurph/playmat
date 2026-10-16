import { Ban, Flag as FlagIcon, History, MessageCircle, Star, StarOff } from 'lucide-react';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../connection';
import { useNavigate } from 'react-router-dom';
import { avatarCardValue, DEFAULT_AVATAR_ID, flagChoices, parseAvatarCard, SIGILS, type AvatarCard } from '../../core/social/identity';
import { useLobby } from '../stores/lobby';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';
import { isFriend, isIgnored, useSocial } from '../stores/social';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Avatar, Flag } from './Avatar';
import styles from './ProfileDialog.module.css';

// your Career line loads with the Career screens, for players who opted in
const CareerSummary = lazy(() => import('../career/CareerScreen').then((m) => ({ default: m.CareerSummary })));

/** A player's card: ratings, match and event record, what they're doing now; your own sigil and flag. */
export function ProfileDialog() {
  const name = useLobby((state) => state.profile);
  const close = () => useLobby.getState().openProfile(null);
  return (
    <Dialog open={!!name} onOpenChange={(open) => !open && close()} title={name ? `${name}` : 'Profile'} width="md">
      {name && <Profile name={name} onClose={close} />}
    </Dialog>
  );
}

function Profile({ name, onClose }: { name: string; onClose(): void }) {
  const navigate = useNavigate();
  const me = useSession((state) => state.userName);
  const isMe = name === me;
  const user = useLobby((state) => state.users.find((candidate) => candidate.userName === name) ?? null);
  const settings = useSettings((state) => state.settings);
  const friend = useSocial((state) => isFriend(state, name));
  const ignoredUser = useSocial((state) => isIgnored(state, name));
  const career = useSettings((state) => state.settings.careerOptIn);
  // your own choice shows at once; the server's copy catches up on the next look
  const avatarId = isMe ? settings.avatarId : user?.avatarId;
  const avatarCard = isMe ? settings.avatarCard : user?.avatarCard;
  const flagName = isMe ? `${settings.flag}.png` : user?.flagName;

  const stats = [
    { label: 'Rating', value: user?.generalRating },
    { label: 'Constructed', value: user?.constructedRating },
    { label: 'Limited', value: user?.limitedRating },
  ];

  return (
    <div className={styles.profile}>
      <header className={styles.head}>
        <Avatar name={name} avatarId={avatarId} avatarCard={avatarCard} size="lg" />
        <div>
          <p className={styles.name}>{name} <Flag flagName={flagName} always /></p>
          <p className={styles.presence}>{user ? (user.infoGames?.trim() || 'Online') : 'Offline'}</p>
        </div>
      </header>

      {user ? (
        <>
          <dl className={styles.ratings}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.rating}>
                <dt>{stat.label}</dt>
                <dd>{stat.value ? Math.round(stat.value) : '—'}</dd>
              </div>
            ))}
          </dl>
          <dl className={styles.record}>
            <dt>Matches</dt>
            <dd>{user.matchHistory?.trim() || 'None yet'}{quit(user.matchQuitRatio)}</dd>
            <dt>Events</dt>
            <dd>{user.tourneyHistory?.trim() || 'None yet'}{quit(user.tourneyQuitRatio)}</dd>
          </dl>
        </>
      ) : (
        <p className={styles.note}>{name} is not online, so their record isn't available right now.</p>
      )}

      {isMe ? <Identity /> : (
        <div className={styles.actions}>
          {user && (
            <Button size="sm" icon={<MessageCircle size={16} />} onClick={() => { onClose(); useLobby.getState().whisper(name); }}>
              Whisper
            </Button>
          )}
          <Button
            size="sm"
            variant="quiet"
            icon={friend ? <StarOff size={16} /> : <Star size={16} />}
            onClick={() => (friend ? useSocial.getState().removeFriend(name) : useSocial.getState().addFriend(name))}
          >
            {friend ? 'Remove friend' : 'Add friend'}
          </Button>
          <Button
            size="sm"
            variant={ignoredUser ? 'quiet' : 'danger'}
            icon={<Ban size={16} />}
            onClick={() => (ignoredUser ? useSocial.getState().unignore(name) : useSocial.getState().ignore(name))}
          >
            {ignoredUser ? 'Stop ignoring' : 'Ignore'}
          </Button>
          <Button size="sm" variant="quiet" icon={<FlagIcon size={16} />} onClick={() => { onClose(); useLobby.getState().openReport(name); }}>
            Report
          </Button>
        </div>
      )}
      {isMe && career && <Suspense fallback={null}><CareerSummary user={name} onOpen={onClose} /></Suspense>}
      {isMe && (
        <div className={styles.actions}>
          <Button size="sm" variant="quiet" icon={<History size={16} />} onClick={() => { onClose(); navigate('/history'); }}>
            Your matches and replays
          </Button>
        </div>
      )}
    </div>
  );
}

function quit(ratio: number | undefined): string {
  return ratio ? ` · left ${ratio}%` : '';
}

/** Your own picture (a card's art, or a sigil) and flag, sent to the server with your other preferences. */
function Identity() {
  const avatarId = useSettings((state) => state.settings.avatarId);
  const avatarCard = useSettings((state) => state.settings.avatarCard);
  const flag = useSettings((state) => state.settings.flag);
  const update = useSettings((state) => state.update);
  const me = useSession((state) => state.userName);
  const flags = useMemo(() => flagChoices(), []);
  // a card's art stands in for the sigil; picking a sigil puts the card away
  const sigil = (id: number) => update({ avatarId: id, avatarCard: '' });
  return (
    <div className={styles.identity}>
      <CardPicture current={parseAvatarCard(avatarCard)} onPick={(card) => update({ avatarCard: card ? avatarCardValue(card) : '' })} />
      <fieldset className={styles.sigils}>
        <legend>Sigil</legend>
        <label className={styles.sigil} title="Your initial">
          <input type="radio" name="sigil" checked={!avatarCard && avatarId === DEFAULT_AVATAR_ID} onChange={() => sigil(DEFAULT_AVATAR_ID)} />
          <Avatar name={me} size="md" />
          <span className="visually-hidden">Your initial</span>
        </label>
        {SIGILS.map((choice) => (
          <label key={choice.id} className={styles.sigil} title={choice.label}>
            <input type="radio" name="sigil" checked={!avatarCard && avatarId === choice.id} onChange={() => sigil(choice.id)} />
            <Avatar name={me} avatarId={choice.id} size="md" />
            <span className="visually-hidden">{choice.label}</span>
          </label>
        ))}
      </fieldset>
      <label className={styles.flagField}>
        <span>Flag</span>
        <select value={flag} onChange={(event) => update({ flag: event.target.value })}>
          {flags.map((choice) => <option key={choice.code} value={choice.code}>{choice.glyph} {choice.label}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * Any card's art as your picture: type a name (suggestions come from the server's cards), and its art shows wherever
 * you do, in games and on the friends list.
 */
function CardPicture({ current, onPick }: { current: AvatarCard | null; onPick(card: AvatarCard | null): void }) {
  const me = useSession((state) => state.userName);
  const [name, setName] = useState(current?.name ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const listId = useId();
  const typed = name.trim();
  const suggestions = useQuery({
    queryKey: ['playmat-names', typed.toLowerCase()],
    queryFn: () => api.searchCards({ nameContains: typed, uniqueNames: true, count: 12, start: 0 }),
    enabled: typed.length >= 3,
    staleTime: 60_000,
  });

  async function choose() {
    setProblem(null);
    const found = await api.searchCards({ name: typed, uniqueNames: true, count: 1, start: 0 }).catch(() => []);
    const card = found[0];
    if (!card?.name || !card.expansionSetCode || !card.cardNumber) {
      setProblem(`No card is called ${typed}.`);
      return;
    }
    onPick({ name: card.name, setCode: card.expansionSetCode, cardNumber: card.cardNumber });
    setName(card.name);
  }

  return (
    <form
      className={styles.cardPicture}
      onSubmit={(event) => {
        event.preventDefault();
        if (typed) void choose();
      }}
    >
      <label className={styles.cardPictureLabel} htmlFor={`${listId}-input`}>A card&apos;s art as your picture</label>
      <div className={styles.cardPictureRow}>
        {current && <Avatar name={me} avatarCard={avatarCardValue(current)} size="md" />}
        <input
          id={`${listId}-input`}
          value={name}
          list={listId}
          autoComplete="off"
          placeholder="Any card, e.g. Krenko, Mob Boss"
          onChange={(event) => setName(event.target.value)}
        />
        <datalist id={listId}>
          {(suggestions.data ?? []).map((card) => <option key={card.name} value={card.name} />)}
        </datalist>
        <Button type="submit" variant="print" size="sm" disabled={!typed}>Use</Button>
        {current && <Button variant="quiet" size="sm" onClick={() => { onPick(null); setName(''); }}>Remove</Button>}
      </div>
      {problem && <p className={styles.cardPictureProblem} role="alert">{problem}</p>}
    </form>
  );
}
