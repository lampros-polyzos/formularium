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
      expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('validate-formula', {
        body: expect.objectContaining({
          profileId: 'ow_lotion',
          totalPercentage: 70
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Test alert from database backend')).toBeInTheDocument();
    });
  });
});