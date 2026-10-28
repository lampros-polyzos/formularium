import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import FormulationEditor from './FormulationEditor';

// Mock Auth Context
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    session: { access_token: 'fake-token' },
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Mock Supabase DB calls (remove edge functions mock)
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

    // Intercept fetch calls to the Spring Boot backend
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/validate')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            alerts: [{ type: 'warning', message: 'Test alert from Java backend' }],
            recommendations: []
          })
        });
      }
      return Promise.reject(new Error(`Unhandled fetch url: ${url}`));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches validation data successfully when a profile is selected', async () => {
    render(
      <BrowserRouter>
        <FormulationEditor />
      </BrowserRouter>
    );

    const profileSelect = screen.getByLabelText(/Profile:/i);
    fireEvent.change(profileSelect, { target: { value: 'ow_lotion' } });

    // Fast-forward past the 400ms debounce timer set in FormulationEditor
    vi.advanceTimersByTime(500);

    // Restore real time so `waitFor` can poll the DOM
    vi.useRealTimers();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/validate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String) // We check it's a string, then parse it below to verify contents
        })
      );
    });

    // Extract the body sent to fetch to verify the payload structure
    const fetchCallArgs = (globalThis.fetch as any).mock.calls[0];
    const requestBody = JSON.parse(fetchCallArgs[1].body);

    expect(requestBody).toMatchObject({
      profileId: 'ow_lotion',
      // Check that the new camelCase fields are present for Java
      targetPh: expect.any(Number),
      totalPercentage: expect.any(Number),
      oilPhasePercentage: expect.any(Number),
      waterPhasePercentage: expect.any(Number),
      ingredients: expect.any(Array)
    });

    // Verify the UI rendered the mocked Java response
    await waitFor(() => {
      expect(screen.getByText('Test alert from Java backend')).toBeInTheDocument();
    });
  });
});