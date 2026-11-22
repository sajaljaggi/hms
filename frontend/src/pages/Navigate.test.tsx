import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navigate from './Navigate';
import { navigationService } from '../services/navigationService';

vi.mock('../services/navigationService', () => ({ navigationService: { getLocations: vi.fn(), getRoute: vi.fn() } }));

const pt = (id: number, floor: number) => ({ id, code: `L${id}`, name: `Loc ${id}`, floor });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(navigationService.getLocations).mockResolvedValue({ data: { data: [
    { ...pt(1, 0), category: 'entrance', building: 'A', description: null },
    { ...pt(2, 1), category: 'ward', building: 'A', description: null },
  ] } } as never);
  vi.mocked(navigationService.getRoute).mockResolvedValue({ data: { data: {
    from: pt(1, 0), to: pt(2, 1), accessible: true, totalDistance: 42, estimatedMinutes: 2,
    steps: [{ from: pt(1, 0), to: pt(2, 1), instruction: 'Take the lift', distance: 42 }],
  } } } as never);
});

describe('Navigate', () => {
  it('renders steps and passes accessible=true; preselects ?to by code', async () => {
    render(<MemoryRouter initialEntries={['/navigate?to=L2']}><Navigate /></MemoryRouter>);
    await screen.findAllByRole('option', { name: 'Loc 1' });
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], '1');
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('2');
    await userEvent.click(screen.getByLabelText(/Accessible route/));
    await userEvent.click(screen.getByRole('button', { name: 'Find route' }));
    expect(await screen.findByText(/Take the lift/)).toBeInTheDocument();
    expect(navigationService.getRoute).toHaveBeenCalledWith(1, 2, true);
    expect(screen.getByText(/42 m • about 2 min/)).toBeInTheDocument();
  });
});
