import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import FormulationEditor from './FormulationEditor';
import { supabase } from '../lib/supabase';

// Mock the Supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock the Companion component to keep the test focused on the Editor's logic
vi.mock('../components/FormulationCompanion', () => ({
  default: ({ alerts }: { alerts: any[] }) => (
    <div data-testid="mock-companion">
      {alerts.map((a, i) => <span key={i} data-testid="alert">{a.message}</span>)}
    </div>
  ),
}));

describe('FormulationEditor Profile Selector', () => {
  beforeEach(() => {
    vi.useFakeTimers(); // Enable fake timers for the debounce
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('fetches validation data successfully when a profile is selected', async () => {
    // 1. Setup the mock response from the Edge Function
    const mockResponse = {
      data: {
        alerts: [{ type: 'warning', message: 'Test alert from database backend' }]
      },
      error: null
    };
    (supabase.functions.invoke as any).mockResolvedValue(mockResponse);

    // 2. Render the component (wrapped in Router since it uses useNavigate)
    render(
      <BrowserRouter>
        <FormulationEditor />
      </BrowserRouter>
    );

    // 3. Find the profile selector and simulate a user changing it
    const profileSelect = screen.getByLabelText(/Profile:/i);
    fireEvent.change(profileSelect, { target: { value: 'ow_lotion' } });

    // 4. Fast-forward past the 500ms debounce timer
    vi.advanceTimersByTime(500);

    // 5. Assert the API was called with the correct payload
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('validate-formula', {
        body: expect.objectContaining({
          profileId: 'ow_lotion',
          totalPercentage: 70
        })
      });
    });

    // 6. Assert the data successfully reached the child component
    await waitFor(() => {
      expect(screen.getByText('Test alert from database backend')).toBeInTheDocument();
    });
  });
});