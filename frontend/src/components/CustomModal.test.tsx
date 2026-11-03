import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomModal from './CustomModal';

afterEach(cleanup);

const open = (props: Partial<React.ComponentProps<typeof CustomModal>> = {}) => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const view = render(<CustomModal isOpen type="info" title="Heads up" message="Something to know." onClose={onClose} onConfirm={onConfirm} {...props} />);
    return { onClose, onConfirm, ...view };
};

describe('the dialog box', () => {
    it('shows nothing while closed', () => {
        open({ isOpen: false });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows its title and message, labelled for screen readers', () => {
        open({ title: 'Saved', message: 'Your changes were saved.' });
        const dialog = screen.getByRole('dialog', { name: 'Saved' });
        expect(dialog).toHaveAccessibleDescription('Your changes were saved.');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('keeps the line breaks in a longer message', () => {
        open({ message: 'First line.\nSecond line.' });
        expect(screen.getByText(/First line\./).className).toContain('whitespace-pre-line');
    });

    it.each(['error', 'success', 'confirm', 'info'] as const)('has an icon for %s', (type) => {
        open({ type });
        expect(screen.getByRole(type === 'error' ? 'alertdialog' : 'dialog').querySelector('svg')).not.toBeNull();
    });

    it('treats an error as an alert, and the rest as ordinary dialogs', () => {
        open({ type: 'error' });
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('always sits above everything else on the page', () => {
        open();
        expect((screen.getByRole('dialog').parentElement as HTMLElement).className).toContain('z-[100]');
    });
});

describe('a message', () => {
    it('has one button, which closes it', () => {
        const { onClose, onConfirm } = open({ type: 'success' });
        expect(screen.getAllByRole('button')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('can name that button', () => {
        open({ cancelLabel: 'Got it' });
        expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    });

    it('has the button focused, so Enter or Space dismisses it', () => {
        open();
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    });
});

describe('a question', () => {
    it('offers Cancel and Delete by default, as before', () => {
        const { onClose, onConfirm } = open({ type: 'confirm' });
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('can name both buttons after what they do', () => {
        open({ type: 'confirm', confirmLabel: 'Discard batch', cancelLabel: 'Keep it' });
        expect(screen.getByRole('button', { name: 'Discard batch' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('is red by default, since it usually asks about deleting, and green when it is not that serious', () => {
        open({ type: 'confirm' });
        expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-red-500');
        cleanup();
        open({ type: 'confirm', tone: 'default', confirmLabel: 'Start' });
        expect(screen.getByRole('button', { name: 'Start' }).className).toContain('bg-[#2c4c3b]');
    });

    it('starts on Cancel, so a stray Enter never confirms something that cannot be undone', () => {
        open({ type: 'confirm' });
        expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Delete' })).not.toHaveFocus();
    });

    it('without a way to confirm is just a message', () => {
        open({ type: 'confirm', onConfirm: undefined });
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
});

describe('closing it', () => {
    it('closes with Escape', () => {
        const { onClose } = open();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the page around it is clicked, but not when the box itself is', () => {
        const { onClose } = open();
        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('dialog').parentElement!);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not react to Escape once it is closed', () => {
        const { onClose, rerender } = open();
        rerender(<CustomModal isOpen={false} type="info" title="x" message="y" onClose={onClose} />);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('gives focus back to what had it before', () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();
        const { unmount } = open();
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        unmount();
        expect(trigger).toHaveFocus();
        trigger.remove();
    });
});

describe('the keyboard', () => {
    it('keeps Tab inside the box, in both directions', () => {
        open({ type: 'confirm' });
        const cancel = screen.getByRole('button', { name: 'Cancel' });
        const confirm = screen.getByRole('button', { name: 'Delete' });

        confirm.focus();
        fireEvent.keyDown(confirm, { key: 'Tab' });
        expect(cancel).toHaveFocus(); // from the last button, round to the first

        cancel.focus();
        fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
        expect(confirm).toHaveFocus(); // and back the other way
    });
});
