import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import DueCheckRow from './DueCheckRow';
import { useAuth } from '../contexts/AuthContext';
import { BATCHES_CHANGED, useDueChecks } from '../hooks/useDueChecks';
import { listDueChecks, type DueCheck } from '../lib/batches';

/** On the Studio home: the app asks how your batches look, and you can answer without going anywhere. */
export default function CheckInPrompt() {
    const { user } = useAuth();
    const userId = user?.id;
    const total = useDueChecks();
    const [items, setItems] = useState<DueCheck[]>([]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const refresh = async () => {
            try {
                const due = await listDueChecks();
                if (!cancelled) setItems(due);
            } catch {
                if (!cancelled) setItems([]); // a reminder must never get in the way of the page
            }
        };
        refresh();
        window.addEventListener(BATCHES_CHANGED, refresh);
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            window.removeEventListener(BATCHES_CHANGED, refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [userId]);

    if (!userId || items.length === 0) return null;
    return (
        <section aria-labelledby="checkin-prompt-title" className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h2 id="checkin-prompt-title" className="flex items-center gap-2 font-bold text-amber-900">
                <BellRing size={18} aria-hidden /> Time to check on your batches
            </h2>
            <p className="text-xs text-amber-900/80 mt-0.5">Look for separation, grain, a change in smell or colour, and anything that looks like mold.</p>
            <ul className="divide-y divide-amber-100 mt-1">
                {items.map(item => <DueCheckRow key={item.id} batch={item.batch} check={item} />)}
            </ul>
            {total > items.length && (
                <Link to="/batches" className="inline-block mt-2 text-sm font-bold text-amber-900 hover:underline">See all {total} due →</Link>
            )}
        </section>
    );
}
