import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientPicker from './PatientPicker';
import { bedService } from '../services/bedService';

vi.mock('../services/bedService', () => ({ bedService: { searchPatients: vi.fn() } }));
const search = vi.mocked(bedService.searchPatients);
const ok = (data: unknown[]) => ({ data: { success: true, data } }) as never;

beforeEach(() => vi.resetAllMocks());

describe('PatientPicker', () => {
  it('debounces typing into a single search', async () => {
    search.mockResolvedValue(ok([{ id: 1, name: 'Pat', email: 'p@x', phone: null }]));
    render(<PatientPicker value={null} onChange={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'pat');
    expect(await screen.findByRole('option', { name: /Pat/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('pat');
  });

  it('shows "No patients found" for an empty result', async () => {
    search.mockResolvedValue(ok([]));
    render(<PatientPicker value={null} onChange={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'zz');
    expect(await screen.findByText('No patients found')).toBeInTheDocument();
  });

  it('shows an error when the search fails, not "No patients found"', async () => {
    search.mockRejectedValue({ response: { data: { message: 'Search unavailable' } } });
    render(<PatientPicker value={null} onChange={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'zz');
    expect(await screen.findByText('Search unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No patients found')).not.toBeInTheDocument();
  });
});
