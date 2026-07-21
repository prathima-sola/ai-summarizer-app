import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicSharePage } from './PublicSharePage';

afterEach(() => vi.restoreAllMocks());

function renderShare() {
  return render(<MemoryRouter initialEntries={[`/share/${'a'.repeat(43)}`]}><Routes><Route path="/share/:token" element={<PublicSharePage />} /></Routes></MemoryRouter>);
}

describe('PublicSharePage', () => {
  it('renders a cited brief without workspace controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      share: {
        expiresAt: '2026-08-20T00:00:00.000Z',
        resource: {
          type: 'summary', title: 'Pilot findings', documentTitle: 'Pilot review', mode: 'executive', detailLevel: 'balanced', audience: 'general', createdAt: '2026-07-21T00:00:00.000Z',
          structuredContent: { brief_title: 'Pilot findings', overview: 'Completion improved.', sections: [{ heading: 'Results', points: [{ text: 'Completion reached 85%.', page_numbers: [1] }] }], uncertainties: [], citations: [{ page_number: 1, quote: 'Eighty-five percent completed setup.' }] },
          citations: [{ page_number: 1, quote: 'Eighty-five percent completed setup.' }],
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    renderShare();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pilot findings' })).toBeInTheDocument());
    expect(screen.getByText(/Eighty-five percent completed setup/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a safe unavailable state for revoked links', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'This shared item is unavailable.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    renderShare();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Shared item unavailable' })).toBeInTheDocument());
  });
});
