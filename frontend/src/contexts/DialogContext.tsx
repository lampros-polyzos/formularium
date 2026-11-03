import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import CustomModal from '../components/CustomModal';
import { DialogContext, type AlertOptions, type ConfirmOptions, type DialogApi } from './dialogApi';

type Request =
    | { id: number; kind: 'alert'; message: string; options: AlertOptions; resolve: () => void }
    | { id: number; kind: 'confirm'; message: string; options: ConfirmOptions; resolve: (answer: boolean) => void };

const ALERT_TITLES = { error: 'Something went wrong', success: 'Done', info: 'Heads up' } as const;

/**
 * Shows the app's dialogs one at a time. Anything asked while a dialog is open waits its turn, so two messages
 * can never hide each other.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<Request[]>([]);
    const nextId = useRef(0);
    const latest = useRef<Request[]>([]);
    useEffect(() => { latest.current = queue; }, [queue]);

    const alert = useCallback((message: string, options: AlertOptions = {}) =>
        new Promise<void>(resolve => {
            setQueue(q => [...q, { id: nextId.current++, kind: 'alert', message, options, resolve }]);
        }), []);

    const confirm = useCallback((message: string, options: ConfirmOptions = {}) =>
        new Promise<boolean>(resolve => {
            setQueue(q => [...q, { id: nextId.current++, kind: 'confirm', message, options, resolve }]);
        }), []);

    const api = useMemo<DialogApi>(() => ({ alert, confirm }), [alert, confirm]);

    // Nobody is left waiting if the app goes away with a question open: that counts as "no"
    useEffect(() => () => {
        for (const request of latest.current) {
            if (request.kind === 'confirm') request.resolve(false); else request.resolve();
        }
    }, []);

    const current = queue[0];
    const finish = (answer: boolean) => {
        if (!current) return;
        if (current.kind === 'confirm') current.resolve(answer); else current.resolve();
        setQueue(q => q.slice(1));
    };

    return (
        <DialogContext.Provider value={api}>
            {children}
            {current?.kind === 'alert' && (
                <CustomModal
                    key={current.id}
                    isOpen
                    type={current.options.tone ?? 'info'}
                    title={current.options.title ?? ALERT_TITLES[current.options.tone ?? 'info']}
                    message={current.message}
                    cancelLabel={current.options.closeLabel}
                    onClose={() => finish(false)}
                />
            )}
            {current?.kind === 'confirm' && (
                <CustomModal
                    key={current.id}
                    isOpen
                    type="confirm"
                    title={current.options.title ?? 'Are you sure?'}
                    message={current.message}
                    confirmLabel={current.options.confirmLabel ?? 'Confirm'}
                    cancelLabel={current.options.cancelLabel}
                    tone={current.options.tone}
                    onConfirm={() => finish(true)}
                    onClose={() => finish(false)}
                />
            )}
        </DialogContext.Provider>
    );
}
