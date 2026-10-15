import { MonitorSmartphone } from 'lucide-react';
import { useT } from '../i18n';
import { useSession } from '../stores/session';
import { Button } from '../ui/Button';
import styles from './SignedInElsewhere.module.css';

/**
 * The account signed in on another device or tab, which took over. This one waits instead of signing straight back
 * in (each would push the other out, over and over) until the player picks where to play.
 */
export function SignedInElsewhere() {
  const t = useT();
  const elsewhere = useSession((state) => state.elsewhere);
  const userName = useSession((state) => state.userName);
  if (!elsewhere) return null;
  return (
    <div className={styles.elsewhere} role="alertdialog" aria-modal="true" aria-labelledby="elsewhere-title" aria-describedby="elsewhere-note">
      <MonitorSmartphone size={44} aria-hidden="true" />
      <h2 className={styles.title} id="elsewhere-title">{t('session.elsewhere.title')}</h2>
      <p className={styles.note} id="elsewhere-note">{t('session.elsewhere.note', { name: userName })}</p>
      <div className={styles.actions}>
        <Button variant="print" autoFocus onClick={() => void useSession.getState().useHere()}>{t('session.elsewhere.useHere')}</Button>
        <Button variant="quiet" onClick={() => void useSession.getState().signOut(true)}>{t('shell.signOut')}</Button>
      </div>
    </div>
  );
}
