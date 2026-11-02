import { useDueChecks } from '../hooks/useDueChecks';

/** Amber count of stability check-ins that are due, or nothing when there are none. */
export default function DueBadge() {
    const due = useDueChecks();
    if (due === 0) return null;
    return (
        <span
            aria-label={`${due} check-in${due !== 1 ? 's' : ''} due`}
            className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold leading-5 text-center"
        >
            {due}
        </span>
    );
}
