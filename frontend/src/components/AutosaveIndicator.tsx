import type { AutosaveStatus } from '../hooks/useAutosave';

interface AutosaveIndicatorProps {
    status: AutosaveStatus;
    error: string | null;
    lastSavedAt: Date | null;
    /** The formula already exists in the database. */
    isSavedFormula: boolean;
    /** Autosave can run now. When false and there are changes, the reason is shown instead. */
    canAutosave: boolean;
    hasProfile: boolean;
    onRetry: () => void;
}

export default function AutosaveIndicator({ status, error, lastSavedAt, isSavedFormula, canAutosave, hasProfile, onRetry }: AutosaveIndicatorProps) {
    let content: React.ReactNode = null;
    let tone = 'text-gray-500';

    if (status === 'saving') {
        content = 'Saving…';
    } else if (status === 'error') {
        tone = 'text-red-600';
        content = (
            <>
                Couldn't save · <button onClick={onRetry} className="font-bold underline hover:no-underline">Retry</button>
            </>
        );
    } else if (status === 'dirty') {
        tone = 'text-amber-700';
        content = !canAutosave && !hasProfile
            ? 'Not saved yet · choose a product type to start autosaving'
            : 'Unsaved changes…';
    } else if (lastSavedAt || isSavedFormula) {
        content = <><span aria-hidden>✓</span> All changes saved</>;
    }

    return (
        <span
            role="status"
            aria-live="polite"
            title={status === 'error' && error ? error : lastSavedAt ? `Last saved at ${lastSavedAt.toLocaleTimeString()}` : undefined}
            className={`text-xs whitespace-nowrap ${tone}`}
        >
            {content}
        </span>
    );
}
