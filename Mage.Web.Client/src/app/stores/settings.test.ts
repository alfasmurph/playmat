// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';

async function freshSettings() {
  vi.resetModules();
  return (await import('./settings')).useSettings;
}

beforeEach(() => localStorage.clear());

describe('the card back setting', () => {
  test('a back nobody picked follows the new default, the classic Magic back', async () => {
    localStorage.setItem('playmat.settings', JSON.stringify({ cardBack: 'stitch-hand', paintedArt: true }));
    expect((await freshSettings()).getState().settings.cardBack).toBe('classic');
  });

  test('a back the player picked stays picked', async () => {
    const useSettings = await freshSettings();
    useSettings.getState().update({ cardBack: 'orrery' });
    expect(JSON.parse(localStorage.getItem('playmat.settings')!)).toMatchObject({ cardBack: 'orrery', cardBackPicked: true });
    expect((await freshSettings()).getState().settings.cardBack).toBe('orrery');
  });
});

describe('the preferences sent to the server', () => {
  test('with auto-pay off, mana from a land tapped while paying still pays the cost', async () => {
    const { toUserData, DEFAULT_SETTINGS } = await import('./settings');
    expect(toUserData({ ...DEFAULT_SETTINGS, autoPayMana: false }).manaPoolAutomatic).toBe(true);
    expect(toUserData({ ...DEFAULT_SETTINGS, autoPayMana: true }).manaPoolAutomatic).toBe(true);
  });
});
