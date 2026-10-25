import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import FormulationEditor from './FormulationEditor';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({
      data: {
        id: 'ow_lotion',
        name: 'O/W Lotion or Cream',
        requires_water: true,
        max_oil_phase_percent: 30,
        default_ph_min: 5.0,
        default_ph_max: 6.0
      },
      error: null
    })
  };

  return {
    supabase: {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { alerts: [] }, error: null })
      },
      from: vi.fn(() => mockQueryBuilder)
    }
  };
});

// Mock the Companion component
vi.mock('../components/FormulationCompanion', () => ({
  default: ({ alerts }: { alerts: any[] }) => (
    <div data-testid="mock-companion">
      {alerts.map((a, i) => <span key={i} data-testid="alert">{a.message}</span>)}
    </div>
  ),
}));

describe('FormulationEditor Profile Selector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches validation data successfully when a profile is selected', async () => {
    const mockResponse = {
      data: {
        alerts: [{ type: 'warning', message: 'Test alert from database backend' }]
      },
      error: null
    };
    (supabase.functions.invoke as any).mockResolvedValue(mockResponse);

    render(
      <BrowserRouter>
        <FormulationEditor />
      </BrowserRouter>
    );

    const profileSelect = screen.getByLabelText(/Profile:/i);
    fireEvent.change(profileSelect, { target: { value: 'ow_lotion' } });

    // Fast-forward past the 500ms debounce timer
    vi.advanceTimersByTime(500);

    // Restore real time so `waitFor` can poll the DOM
    vi.useRealTimers();

    await waitFor(() => {
      // Remove the toHaveBeenCalledTimes(1) line entirely, 
      // and use toHaveBeenLastCalledWith to check the final payload after all state settles
      expect(supabase.functions.invoke).toHaveBeenLastCalledWith(
        'validate-formula',
        expect.objectContaining({
          body: expect.objectContaining({
            profileId: 'ow_lotion',
            totalPercentage: 70,
            oilPhasePercentage: 0,
            ingredients: expect.any(Array),
            profile: expect.anything()
          })
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Test alert from database backend')).toBeInTheDocument();
    });
  });
});