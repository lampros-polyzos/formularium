import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportModal from './ReportModal';
import EditPostModal from './EditPostModal';

const api = vi.hoisted(() => ({ reportContent: vi.fn(), editPost: vi.fn() }));
vi.mock('../lib/communityApi', () => api);

beforeEach(() => { api.reportContent.mockReset().mockResolvedValue(undefined); api.editPost.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);

describe('the report window', () => {
    const open = () => {
        const onSent = vi.fn();
        const onClose = vi.fn();
        render(<ReportModal targetType="comment" targetId="c1" onSent={onSent} onClose={onClose} />);
        return { onSent, onClose };
    };

    it('asks for a reason before sending anything', () => {
        const { onSent } = open();
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Please choose a reason.');
        expect(api.reportContent).not.toHaveBeenCalled();
        expect(onSent).not.toHaveBeenCalled();
    });

    it('sends the reason and details for the thing being reported', async () => {
        const { onSent } = open();
        fireEvent.click(screen.getByLabelText('Spam or advertising'));
        fireEvent.change(screen.getByLabelText(/More detail/), { target: { value: 'sells things' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
        await waitFor(() => expect(onSent).toHaveBeenCalled());
        expect(api.reportContent).toHaveBeenCalledWith({ targetType: 'comment', targetId: 'c1', reason: 'spam', details: 'sells things' });
    });

    it('limits the details and counts them', () => {
        open();
        const box = screen.getByLabelText(/More detail/);
        expect(box).toHaveAttribute('maxlength', '1000');
        fireEvent.change(box, { target: { value: 'hello' } });
        expect(screen.getByText('5/1000')).toBeInTheDocument();
    });

    it('says what went wrong in plain words, and stays open to try again', async () => {
        api.reportContent.mockRejectedValue({ message: 'duplicate key value violates unique constraint "content_reports_x"' });
        const { onSent } = open();
        fireEvent.click(screen.getByLabelText('Spam or advertising'));
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('You have already reported this.');
        expect(onSent).not.toHaveBeenCalled();
    });

    it('can be cancelled', () => {
        const { onClose } = open();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalled();
    });
});

describe('the edit window', () => {
    const post: { id: string; title: string; write_up: string; sources: string | null; post_type: string } = { id: 'p1', title: 'Old title', write_up: 'Old text', sources: null, post_type: 'discussion' };
    const open = (over: Partial<typeof post> = {}) => {
        const onSaved = vi.fn();
        const onClose = vi.fn();
        render(<EditPostModal post={{ ...post, ...over }} onSaved={onSaved} onClose={onClose} />);
        return { onSaved, onClose };
    };

    it('starts with the current title and text, and saves the new ones', async () => {
        const { onSaved } = open();
        expect(screen.getByLabelText('Title')).toHaveValue('Old title');
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' New title ' } });
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New text' } });
        fireEvent.submit(document.getElementById('edit-post-form')!);
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(api.editPost).toHaveBeenCalledWith('p1', { title: 'New title', write_up: 'New text' });
        expect(onSaved).toHaveBeenCalledWith({ title: 'New title', write_up: 'New text', sources: null });
    });

    it('does not offer sources on a discussion, but does on information, and saves them', async () => {
        open();
        expect(screen.queryByLabelText(/Sources/)).not.toBeInTheDocument();
        cleanup();
        const { onSaved } = open({ post_type: 'information', sources: 'A book' });
        fireEvent.change(screen.getByLabelText(/Sources/), { target: { value: 'A paper' } });
        fireEvent.submit(document.getElementById('edit-post-form')!);
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(api.editPost).toHaveBeenCalledWith('p1', { title: 'Old title', write_up: 'Old text', sources: 'A paper' });
    });

    it('will not save an empty title or text', () => {
        const { onSaved } = open();
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
        fireEvent.submit(document.getElementById('edit-post-form')!);
        expect(screen.getByRole('alert')).toHaveTextContent('Title and description are required.');
        expect(api.editPost).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('shows the limits, and a refusal in plain words', async () => {
        api.editPost.mockRejectedValue({ message: 'violates check constraint "community_posts_title_length"' });
        open();
        expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '150');
        expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '10000');
        fireEvent.submit(document.getElementById('edit-post-form')!);
        expect(await screen.findByRole('alert')).toHaveTextContent('Titles can be up to 150 characters.');
    });
});
