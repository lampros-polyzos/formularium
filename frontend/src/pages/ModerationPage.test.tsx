import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModerationPage from './ModerationPage';
import { DialogProvider } from '../contexts/DialogContext';

const mocks = vi.hoisted(() => ({
    moderator: true,
    reports: [] as unknown[],
    listOpenReports: vi.fn(),
    resolveReport: vi.fn(),
}));
vi.mock('../lib/communityApi', () => ({ listOpenReports: mocks.listOpenReports, resolveReport: mocks.resolveReport }));
vi.mock('../hooks/useIsModerator', () => ({ useIsModerator: () => mocks.moderator }));
const AUTH = vi.hoisted(() => ({ user: { id: 'mod1' }, username: 'Mod' }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => ({ formatDate: (d: string) => d }) }));
vi.mock('../components/Header', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));

const report = (over: Record<string, unknown> = {}) => ({
    id: 'r1', target_type: 'post', target_id: 'p1', post_id: 'p1', target_author_id: 'a', snapshot: 'Mix it without a preservative', reason: 'dangerous', details: 'Unsafe for water-based products', status: 'open', created_at: '2026-11-01', ...over,
});
const renderPage = () => render(<MemoryRouter><DialogProvider><ModerationPage /></DialogProvider></MemoryRouter>);

beforeEach(() => {
    mocks.moderator = true;
    mocks.reports = [report()];
    mocks.listOpenReports.mockReset().mockImplementation(() => Promise.resolve(mocks.reports));
    mocks.resolveReport.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('the moderation page', () => {
    it('is only for moderators', async () => {
        mocks.moderator = false;
        renderPage();
        expect(screen.getByText('This page is for community moderators.')).toBeInTheDocument();
        expect(mocks.listOpenReports).not.toHaveBeenCalled();
    });

    it('shows what was reported, why, and a link to the post', async () => {
        renderPage();
        expect(await screen.findByText('Mix it without a preservative')).toBeInTheDocument();
        expect(screen.getByText('Unsafe or dangerous advice')).toBeInTheDocument();
        expect(screen.getByText(/Unsafe for water-based products/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open post' })).toHaveAttribute('href', '/community/p1');
    });

    it('says when there is nothing to review', async () => {
        mocks.reports = [];
        renderPage();
        expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
    });

    it('dismisses a report without removing anything', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
        await waitFor(() => expect(mocks.resolveReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'dismissed', 'mod1', false));
        expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
    });

    it('asks before removing, then removes and closes the report', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Remove content' }));
        const box = await screen.findByRole('dialog');
        expect(mocks.resolveReport).not.toHaveBeenCalled();
        fireEvent.click(within(box).getByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(mocks.resolveReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'resolved', 'mod1', true));
    });

    it('does nothing if you change your mind about removing', async () => {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Remove content' }));
        const box = await screen.findByRole('dialog');
        fireEvent.click(within(box).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mocks.resolveReport).not.toHaveBeenCalled();
        expect(screen.getByText('Mix it without a preservative')).toBeInTheDocument();
    });

    it('keeps the report on the list and says so when it could not be updated', async () => {
        mocks.resolveReport.mockRejectedValue({ message: 'new row violates row-level security policy' });
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
        expect(await screen.findByText('You are not allowed to do that.')).toBeInTheDocument();
        expect(screen.getByText('Mix it without a preservative')).toBeInTheDocument();
    });
});
