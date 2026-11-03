import { createContext } from 'react';

export interface AlertOptions {
    /** Defaults to a title that fits the tone. */
    title?: string;
    /** `error` for something that went wrong, `success` for something that worked, `info` (the default) for anything else. */
    tone?: 'error' | 'success' | 'info';
    /** Defaults to "Close". */
    closeLabel?: string;
}

export interface ConfirmOptions {
    title?: string;
    /** What the confirming button says, ideally the action itself: "Discard batch", not "OK". Defaults to "Confirm". */
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` (red) for things that can't be undone. */
    tone?: 'danger' | 'default';
}

/** The app's own replacements for the browser's `alert` and `confirm`. */
export interface DialogApi {
    /** Shows a message; resolves when it is closed. */
    alert: (message: string, options?: AlertOptions) => Promise<void>;
    /** Asks a question; resolves true if confirmed, false if cancelled, closed or dismissed with Escape. */
    confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

export const DialogContext = createContext<DialogApi | null>(null);
