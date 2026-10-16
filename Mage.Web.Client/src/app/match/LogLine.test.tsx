import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { parseChatMessage, buildLogRows } from '../../core/game/gameLog';
import { LogRows } from './LogLine';

describe('LogRows', () => {
  test('keeps the space between a name and the words after it', () => {
    const entry = parseChatMessage({ message: "<font color='#20B2AA'>Najeela</font> lost the game due drawing from an empty library", messageType: 'GAME', time: 1 } as never, 'k');
    render(<LogRows rows={buildLogRows(entry ? [entry] : [], 'me')} />);
    expect(screen.getByRole('listitem').textContent).toBe('Najeela lost the game due drawing from an empty library');
  });

  test('shows card names as plain chips when it has no cards to look them up in', () => {
    const entry = parseChatMessage({ message: "<font color='#90EE90' object_id='abc'>Llanowar Elves</font> dies", messageType: 'GAME', time: 1 } as never, 'k');
    render(<LogRows rows={buildLogRows(entry ? [entry] : [], 'me')} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Llanowar Elves')).toBeTruthy();
  });

  test('says so when there is nothing to show', () => {
    render(<LogRows rows={[]} />);
    expect(screen.getByText("The game's events will show here.")).toBeTruthy();
  });
});
