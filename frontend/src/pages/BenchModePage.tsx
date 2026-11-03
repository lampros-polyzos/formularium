import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BenchMode from '../components/bench/BenchMode';
import { usePageTitle } from '../components/content/usePageTitle';
import { getBatch, type BatchDetail } from '../lib/batches';

/** A full-screen message in the bench's style, for when there is nothing to make. */
function Notice({ children, id }: { children: React.ReactNode; id?: string }) {
    return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#f7f8f6] px-6 text-center text-[#1f382a]">
            {children}
            <Link to={id ? `/batches/${id}` : '/batches'} className="h-14 px-8 rounded-2xl bg-[#1f382a] text-white text-lg font-bold flex items-center">
                {id ? 'Back to the batch' : 'Your batches'}
            </Link>
        </div>
    );
}

export default function BenchModePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [detail, setDetail] = useState<BatchDetail | null>(null);
    const [error, setError] = useState('');

    usePageTitle(detail ? `Bench: ${detail.batch.name}` : 'Bench mode');

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        getBatch(id)
            .then(data => { if (!cancelled) setDetail(data); })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this batch.'); });
        return () => { cancelled = true; };
    }, [id]);

    if (error) return <Notice><p role="alert" className="text-xl text-red-700">{error}</p></Notice>;
    if (!detail) return <Notice><p className="text-xl text-gray-500">Loading...</p></Notice>;

    const { batch, lines } = detail;
    if (batch.status === 'voided' || batch.status === 'discarded') {
        return (
            <Notice id={batch.id}>
                <h1 className="text-2xl font-bold">{batch.name} is {batch.status === 'voided' ? 'undone' : 'discarded'}</h1>
                <p className="text-lg text-gray-600">There is nothing left to make.</p>
            </Notice>
        );
    }

    return <BenchMode batch={batch} lines={lines} onExit={() => navigate(`/batches/${batch.id}`)} />;
}
