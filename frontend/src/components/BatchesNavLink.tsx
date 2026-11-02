import { Link } from 'react-router-dom';
import { useDueChecks } from '../hooks/useDueChecks';

/** "Batches" link that shows how many stability check-ins are waiting. */
export default function BatchesNavLink({ className = '' }: { className?: string }) {
    const due = useDueChecks();
    return (
        <Link to="/batches" className={`inline-flex items-center gap-1.5 ${className}`}>
            Batches
            {due > 0 && (
                <span
                    aria-label={`${due} check-in${due !== 1 ? 's' : ''} due`}
                    className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold leading-5 text-center"
                >
                    {due}
                </span>
            )}
        </Link>
    );
}
