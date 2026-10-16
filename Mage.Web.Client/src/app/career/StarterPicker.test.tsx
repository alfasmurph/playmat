// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';

const started: string[] = [];
vi.mock('./careerData', async (original) => ({
  ...(await original<typeof import('./careerData')>()),
  useCareerStarters: () => ({ isPending: false, data: [{ id: 'ajani', name: 'Ajani', colors: 'W', cards: 60 }, { id: 'chandra', name: 'Chandra', colors: 'R', cards: 60 }] }),
  startCareer: async (id: string) => {
    started.push(id);
  },
}));

const { StarterPicker } = await import('./CareerScreen');

function Where() {
  const location = useLocation();
  return <p>at {location.pathname}{location.search}</p>;
}

describe('StarterPicker', () => {
  test("goes straight to The Commander's Road, with a starter picked unasked", async () => {
    render(
      <MemoryRouter initialEntries={['/career']}>
        <Routes>
          <Route path="/career" element={<StarterPicker />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: "Straight to The Commander's Road" }));
    await waitFor(() => expect(screen.getByText('at /career/campaign?story=commander-road')).toBeTruthy());
    expect(started).toEqual(['ajani']);
  });
});
