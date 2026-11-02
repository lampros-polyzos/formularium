import { X } from 'lucide-react';

interface FixToastProps {
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
}

/** Confirms what a fix just changed and lets the user take it back. */
export default function FixToast({ message, onUndo, onDismiss }: FixToastProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#1f382a] text-white text-sm rounded-full pl-5 pr-3 py-2.5 shadow-xl max-w-[90vw]"
        >
            <span className="truncate">{message}</span>
            <button onClick={onUndo} className="font-bold underline underline-offset-2 hover:no-underline shrink-0">Undo</button>
            <button onClick={onDismiss} aria-label="Dismiss" className="p-1 rounded-full hover:bg-white/10 shrink-0"><X size={14} /></button>
        </div>
    );
}
