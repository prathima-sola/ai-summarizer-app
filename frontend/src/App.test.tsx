import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const longEnoughSource = 'This source contains enough useful context for the application to generate a reliable and structured reading brief for the test.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('starts with a disabled generation action', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /turn dense text/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate executive brief/i })).toBeDisabled();
  });

  it('generates and displays a configured brief', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      summary: 'Key findings\n• Users need visible processing feedback.',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

    render(<App />);
    fireEvent.change(screen.getByLabelText('Source text'), { target: { value: longEnoughSource } });
    fireEvent.click(screen.getByRole('button', { name: /generate executive brief/i }));

    await waitFor(() => expect(screen.getByText('Users need visible processing feedback.')).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy brief' })).toBeInTheDocument();
  });

  it('keeps the source available after an API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: 'The brief could not be generated. Try again.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));

    render(<App />);
    fireEvent.change(screen.getByLabelText('Source text'), { target: { value: longEnoughSource } });
    fireEvent.click(screen.getByRole('button', { name: /generate executive brief/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The brief could not be generated. Try again.'));
    expect(screen.getByLabelText('Source text')).toHaveValue(longEnoughSource);
    expect(screen.getByRole('button', { name: 'Try generating again' })).toBeInTheDocument();
  });
});
