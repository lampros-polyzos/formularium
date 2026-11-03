import { Link } from 'react-router-dom';
import type { FormulaSummary, PostSummary } from '../lib/lineage';

interface LineageNoticeProps {
    /** The community recipe this started as. */
    remixedFrom?: PostSummary | null;
    /** The formula this was copied from. */
    clonedFrom?: FormulaSummary | null;
    className?: string;
}

/** "↻ Remixed from Day Cream by Sam · Copied from Day Cream v1": a small trail back to where a recipe came from. */
export default function LineageNotice({ remixedFrom, clonedFrom, className = '' }: LineageNoticeProps) {
    if (!remixedFrom && !clonedFrom) return null;
    const linkClass = 'font-semibold text-[#2c4c3b] hover:underline';

    return (
        <p className={`text-xs text-gray-600 flex flex-wrap items-center gap-x-2 ${className}`}>
            {remixedFrom && (
                <span>
                    <span aria-hidden>↻</span> Remixed from{' '}
                    <Link to={`/community/${remixedFrom.id}`} className={linkClass}>{remixedFrom.title}</Link>
                    {remixedFrom.author_name && <> by {remixedFrom.author_name}</>}
                </span>
            )}
            {remixedFrom && clonedFrom && <span aria-hidden>·</span>}
            {clonedFrom && (
                <span>
                    Copied from <Link to={`/studio/${clonedFrom.id}`} className={linkClass}>{clonedFrom.name}</Link>
                </span>
            )}
        </p>
    );
}
