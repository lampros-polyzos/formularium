import React, { useEffect, useId, useRef } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

export type DialogType = 'error' | 'success' | 'confirm' | 'info';

interface CustomModalProps {
    isOpen: boolean;
    type: DialogType;
    title: string;
    message: string;
    /** Closing without confirming: the close/cancel button, Escape, or a tap outside the box. */
    onClose: () => void;
    onConfirm?: () => void;
    /** The confirming button's label. A confirmation says "Delete" unless told otherwise. */
    confirmLabel?: string;
    /** The other button: "Cancel" on a confirmation, "Close" on a message. */
    cancelLabel?: string;
    /** `danger` (red) for things that can't be undone, `default` (green) for the rest. Confirmations default to danger. */
    tone?: 'danger' | 'default';
}

const TYPE_STYLE: Record<DialogType, { title: string; ring: string; icon: React.ReactNode }> = {
    error: { title: 'text-red-700', ring: 'bg-red-50 text-red-600', icon: <CircleAlert size={26} aria-hidden /> },
    success: { title: 'text-[#2c4c3b]', ring: 'bg-green-50 text-green-600', icon: <CircleCheck size={26} aria-hidden /> },
    confirm: { title: 'text-[#1f382a]', ring: 'bg-amber-50 text-amber-600', icon: <TriangleAlert size={26} aria-hidden /> },
    info: { title: 'text-[#1f382a]', ring: 'bg-[#e9eee7] text-[#2c4c3b]', icon: <Info size={26} aria-hidden /> },
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CustomModal: React.FC<CustomModalProps> = ({ isOpen, type, title, message, onClose, onConfirm, confirmLabel, cancelLabel, tone }) => {
    const titleId = useId();
    const messageId = useId();
    const boxRef = useRef<HTMLDivElement>(null);
    const primaryRef = useRef<HTMLButtonElement>(null);

    const isConfirm = type === 'confirm' && Boolean(onConfirm);

    // Escape closes, Tab stays inside the box, and focus goes back to where it was when the box goes away
    useEffect(() => {
        if (!isOpen) return;
        const before = document.activeElement as HTMLElement | null;
        primaryRef.current?.focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
            if (e.key !== 'Tab' || !boxRef.current) return;
            const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            before?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const style = TYPE_STYLE[type];
    const danger = (tone ?? (isConfirm ? 'danger' : 'default')) === 'danger';

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1f382a]/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                ref={boxRef}
                role={type === 'error' ? 'alertdialog' : 'dialog'}
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl border border-[#c1d1b9] w-full max-w-sm p-6 animate-[dialog-in_150ms_ease-out]"
            >
                <div className="flex items-start gap-4">
                    <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${style.ring}`}>{style.icon}</span>
                    <div className="min-w-0">
                        <h3 id={titleId} className={`text-lg font-bold leading-snug ${style.title}`}>{title}</h3>
                        <p id={messageId} className="mt-1 text-gray-600 text-sm whitespace-pre-line break-words">{message}</p>
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <button
                        ref={primaryRef}
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2c4c3b]"
                    >
                        {cancelLabel ?? (isConfirm ? 'Cancel' : 'Close')}
                    </button>

                    {isConfirm && (
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${danger
                                ? 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-500'
                                : 'bg-[#2c4c3b] hover:bg-[#1f382a] focus-visible:ring-[#2c4c3b]'}`}
                        >
                            {confirmLabel ?? 'Delete'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomModal;
